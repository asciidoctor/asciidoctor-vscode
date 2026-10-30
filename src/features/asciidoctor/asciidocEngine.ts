import {
  AbstractBlock,
  Document as AsciidoctorDocument,
  ConverterFactory,
  Extensions,
  load,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import { WebviewResourceProvider } from '../../core/resources.js'
import { AntoraSupportManager } from '../antora/antoraContext.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from '../antora/antoraDocument.js'
import { resolveIncludeFile } from '../antora/resolveIncludeFile.js'
import { AsciidocContributionProvider } from '../extensionContributions.js'
import {
  AsciidoctorWebViewConverter,
  WEBVIEW_OUTFILESUFFIX,
} from '../preview/asciidoctorWebViewConverter.js'
import { register } from '../preview/highlightjs-adapter.js'
import { AsciidocPreviewConfigurationManager } from '../preview/previewConfig.js'
import { ExtensionContentSecurityPolicyArbiter } from '../security.js'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import { AsciidoctorAttributesConfig } from './asciidoctorAttributesConfig.js'
import { AsciidoctorConfigProvider } from './asciidoctorConfig.js'
import { AsciidoctorExtensionsProvider } from './asciidoctorExtensions.js'
import { AsciidoctorProcessor } from './asciidoctorProcessor.js'
import { hashBlockSource } from './blockSignature.js'
import { registerBrowserIncludeProcessor } from './browserIncludeSupport.js'
import { ResolverIncludeProcessor } from './includeProcessor.js'
import { addMermaidToHtmlExport } from './mermaidExport.js'
import { addPlantUmlToHtmlExport } from './plantumlExport.js'
import { resolveBlockSourceLines } from './sourceLineMapping.js'
import { getTemplateDirs } from './templateDirs.js'

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocEngine {
  constructor(
    readonly contributionProvider: AsciidocContributionProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
  ) {}

  // Export

  public async export(
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {},
  ): Promise<{ output: string; document: AsciidoctorDocument }> {
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    // Capture Asciidoctor log messages so they do not leak to the console.
    // Diagnostics are owned by AsciidocDiagnosticManager (driven by document
    // open/change), so neither exporting nor previewing reports them here.
    asciidoctorProcessor.activateMemoryLogger()

    const registry = Extensions.create()
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, {
      documentUri: textDocumentUri,
      mode: 'export',
    })
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()
    // In the browser, resolve `include::` targets via vscode.workspace.fs since
    // Asciidoctor.js cannot read them from disk (no-op on desktop).
    await registerBrowserIncludeProcessor(
      registry,
      textDocumentUri,
      textDocument.getText(),
    )

    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const options: { [key: string]: any } = {
      attributes: {
        'env-vscode': '',
        env: 'vscode',
        // Soft default (`@`): the document header and `.asciidoctorconfig`
        // still win over the `asciidoc.extensions.kroki.serverUrl` setting.
        ...AsciidoctorAttributesConfig.defaultKrokiServerUrl(
          textDocumentUri,
          asciidoctorAttributes,
        ),
        ...AsciidoctorAttributesConfig.defaultSourceHighlighter(
          asciidoctorAttributes,
        ),
        ...asciidoctorAttributes,
        // Anchor relative includes/images to the document's own directory; do
        // not set base_dir unless the user opted in (see #926).
        ...(asciidocDocument.dirName && { docdir: asciidocDocument.dirName }),
        ...(asciidocDocument.filePath && {
          docfile: asciidocDocument.filePath,
        }),
      },
      backend,
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      ...(asciidocDocument.baseDirOverride && {
        base_dir: asciidocDocument.baseDirOverride,
      }),
    }
    const templateDirs = await getTemplateDirs(textDocumentUri)
    if (templateDirs.length !== 0) {
      options.template_dirs = templateDirs
    }
    const document = await load(textDocument.getText(), options)
    const convertedOutput = String(await document.convert(options))
    const output =
      backend === 'html5'
        ? addPlantUmlToHtmlExport(addMermaidToHtmlExport(convertedOutput))
        : convertedOutput
    return {
      output,
      document,
    }
  }

  // Convert (preview)

  public async convertFromUri(
    documentUri: vscode.Uri,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number,
  ): Promise<{ html: string; document?: AsciidoctorDocument }> {
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const { html, document } = await this.convertFromTextDocument(
      textDocument,
      context,
      editor,
      line,
    )
    return {
      html,
      document,
    }
  }

  public async convertFromTextDocument(
    textDocument: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number,
    fragment?: string,
  ): Promise<{ html: string; document: AsciidoctorDocument }> {
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    // Capture Asciidoctor log messages so they do not leak to the console.
    // The preview never reports diagnostics: that is owned by
    // AsciidocDiagnosticManager and refreshed on document open/change only, so
    // opening or closing the preview does not (re)compute or clear them.
    asciidoctorProcessor.activateMemoryLogger()

    // load the Asciidoc header only to get kroki-server-url attribute
    const text = textDocument.getText()
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes(
      textDocument.uri,
    )
    // Apply `.asciidoctorconfig` to the header-only parse as well, so the
    // resolved `kroki-server-url` — and therefore the CSP allow-list built from
    // it below — reflects a URL defined only in the configuration file. This
    // matters for a non-`https:` server (e.g. `http://localhost:8000`), which
    // the CSP's `https:` wildcard does not cover.
    const headerOnlyRegistry = Extensions.create()
    await this.asciidoctorConfigProvider.activate(
      headerOnlyRegistry,
      textDocument.uri,
    )
    const document = await load(text, {
      attributes,
      extension_registry: headerOnlyRegistry,
      header_only: true,
    })
    const krokiServerUrl =
      document.getAttribute('kroki-server-url') || 'https://kroki.io'
    // Detected from the header-only parse: the preview embeds images itself when
    // `data-uri` is set (see the converter), because Asciidoctor's own data-uri
    // embedding reads from disk and does not work for VS Code workspaces.
    const dataUriEnabled = document.isAttribute('data-uri')

    // Antora Resource Identifiers resolution
    const antoraDocumentContext = await getAntoraDocumentContext(
      textDocument.uri,
      context.workspaceState,
    )
    const cspArbiter = new ExtensionContentSecurityPolicyArbiter(
      context.globalState,
      context.workspaceState,
    )
    const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
      textDocument,
      editor,
      cspArbiter.getSecurityLevelForResource(textDocument.uri),
      cspArbiter.shouldDisableSecurityWarnings(),
      this.contributionProvider.contributions,
      previewConfigurationManager.loadAndCacheConfiguration(textDocument.uri),
      antoraDocumentContext,
      line,
      null,
      krokiServerUrl,
      dataUriEnabled,
      fragment,
    )
    ConverterFactory.register(asciidoctorWebViewConverter, 'webview-html5')

    const registry = Extensions.create()
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, {
      documentUri: textDocumentUri,
      mode: 'preview',
    })
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    if (antoraDocumentContext !== undefined) {
      const antoraConfig = await getAntoraConfig(textDocumentUri)
      registry.includeProcessor(
        new ResolverIncludeProcessor((_, target, cursor) =>
          resolveIncludeFile(
            target,
            {
              src: antoraDocumentContext.resourceContext,
            },
            cursor,
            antoraDocumentContext.getContentCatalog(),
            antoraConfig,
          ),
        ),
      )
    } else {
      // In the browser, Asciidoctor.js cannot read `include::` targets from
      // disk; resolve them via vscode.workspace.fs instead (no-op on desktop).
      await registerBrowserIncludeProcessor(registry, textDocumentUri, text)
    }
    if (context && editor) {
      register(
        asciidoctorProcessor.highlightjsBuiltInSyntaxHighlighter,
        context,
        editor,
      )
    } else {
      asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()
    }
    const antoraSupport = AntoraSupportManager.getInstance(
      context.workspaceState,
    )
    const antoraAttributes = await antoraSupport.getAttributes(textDocumentUri)
    const asciidocTextDocument =
      AsciidocTextDocument.fromTextDocument(textDocument)
    const baseDirOverride = asciidocTextDocument.baseDirOverride
    const documentDirectory = asciidocTextDocument.dirName
    const documentBasename = asciidocTextDocument.fileName
    const documentExtensionName = asciidocTextDocument.extensionName
    const documentFilePath = asciidocTextDocument.filePath
    const templateDirs = await getTemplateDirs(textDocumentUri)
    // Expose the active VS Code color theme as a document attribute so authors
    // can branch on it (e.g. `ifeval::["{vscode-theme}" == "dark"]`) and so
    // diagram extensions can request a matching theme. Mirrors the dark/light
    // detection used by the Highlight.js adapter.
    const themeKind = vscode.window.activeColorTheme.kind
    const isDarkTheme =
      themeKind === vscode.ColorThemeKind.Dark ||
      themeKind === vscode.ColorThemeKind.HighContrast
    const options: { [key: string]: any } = {
      attributes: {
        // `data-uri` is unset below, so asciidoctor-kroki would write the diagrams
        // fetched with `kroki-fetch-diagram` into the workspace, only for the
        // converter to read them back. Ask it to return a `data:` URI instead,
        // which the converter leaves untouched. Soft (`@`), so that the settings
        // and the document can still unset it.
        ...(dataUriEnabled && { 'kroki-data-uri@': '' }),
        ...attributes,
        ...antoraAttributes,
        // Highlight.js is the only source highlighter available in the preview:
        // resolve any value to it, unless highlighting is disabled (unset or
        // empty). A hard attribute, so it also wins over the document header.
        ...((antoraAttributes['source-highlighter'] ??
          document.getAttribute('source-highlighter')) && {
          'source-highlighter': 'highlight.js',
        }),
        'vscode-theme': isDarkTheme ? 'dark' : 'light',
        // The following attributes are "intrinsic attributes" but they are not set when the input is a string
        // like we are doing, in that case it is expected that the attributes are set here for the API:
        // https://docs.asciidoctor.org/asciidoc/latest/attributes/document-attributes-ref/#intrinsic-attributes
        // this can be set since safe mode is 'UNSAFE'
        ...(documentDirectory && { docdir: documentDirectory }),
        ...(documentFilePath && { docfile: documentFilePath }),
        ...(documentBasename && { docname: documentBasename }),
        docfilesuffix: documentExtensionName,
        filetype: WEBVIEW_OUTFILESUFFIX.substring(1), // remove the leading '.'
        // Disable Asciidoctor's own data-uri embedding; the WebView converter
        // does it instead (see AsciidoctorWebViewConverter, gated on
        // `dataUriEnabled`). Asciidoctor.js 4.0 dropped Opal and reads via
        // `node:fs`/`fetch`, so the native path works on the desktop — but not
        // in VS Code for the Web (no `node:fs`) nor on virtual file systems
        // (Remote SSH, dev containers, `vscode-vfs:`), where only
        // `vscode.workspace.fs` can read the file. Embedding through the VS Code
        // FS API covers every host uniformly.
        '!data-uri': '',
      },
      backend: 'webview-html5',
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      sourcemap: true,
      ...(baseDirOverride && { base_dir: baseDirOverride }),
    }
    if (templateDirs.length !== 0) {
      options.template_dirs = templateDirs
    }

    try {
      const document = await load(text, options)
      const blocksWithLineNumber = document.findBy(function (b: AbstractBlock) {
        return typeof b.getLineNumber() !== 'undefined'
      })
      // Resolve the editor line for each block up front so content pulled in via
      // `include::` is anchored to the directive's neighbourhood in the main
      // document instead of to its line within the included file. Otherwise the
      // out-of-order anchors break the preview ⇄ editor scroll synchronization.
      const mainFile = (document as any).getSourceLocation?.()?.getFile?.()
      const sourceLines = resolveBlockSourceLines(
        blocksWithLineNumber.map((block) => ({
          // Guaranteed defined by the blocksWithLineNumber filter above.
          lineNumber: block.getLineNumber()!,
          file: (block as any).getSourceLocation?.()?.getFile?.(),
        })),
        mainFile,
      )
      blocksWithLineNumber.forEach(function (block, index) {
        block.addRole('data-line-' + sourceLines[index])
        // Tag each block with a hash of its source so the preview can morph
        // incrementally and skip blocks whose content is unchanged (keeping
        // already-rendered MathJax/Mermaid/highlight output intact). The hash
        // is encoded as a role/class because the custom converter already emits
        // roles as classes and they survive client-side post-processing.
        const contentHash = hashBlockSource(block)
        if (contentHash !== undefined) {
          block.addRole('data-h-' + contentHash)
        }
      })
      const html = await document.convert(options)
      return {
        html,
        document,
      }
    } catch (e) {
      vscode.window.showErrorMessage(String(e))
      throw e
    }
  }
}
