import {
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
import { AntoraIncludeProcessor } from '../antora/includeProcessor.js'
import { resolveIncludeFile } from '../antora/resolveIncludeFile.js'
import { AsciidocContributionProvider } from '../extensionContributions.js'
import { AsciidoctorWebViewConverter } from '../preview/asciidoctorWebViewConverter.js'
import { register } from '../preview/highlightjs-adapter.js'
import { AsciidocPreviewConfigurationManager } from '../preview/previewConfig.js'
import { ExtensionContentSecurityPolicyArbiter } from '../security.js'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import { AsciidoctorAttributesConfig } from './asciidoctorAttributesConfig.js'
import { AsciidoctorConfigProvider } from './asciidoctorConfig.js'
import { AsciidoctorExtensionsProvider } from './asciidoctorExtensions.js'
import { AsciidoctorProcessor } from './asciidoctorProcessor.js'

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

/**
 * Compute a short, stable hash of a block's raw AsciiDoc source.
 *
 * Used to tag rendered blocks so the preview can morph incrementally and skip
 * blocks whose source did not change between two renders. Returns `undefined`
 * when the block exposes no usable source (in which case the block is always
 * re-rendered, which is safe).
 */
function hashBlockSource(block: any): string | undefined {
  let source: string
  try {
    source = typeof block.getSource === 'function' ? block.getSource() : ''
  } catch {
    return undefined
  }
  if (!source) {
    return undefined
  }
  // djb2
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 33) ^ source.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

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
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()

    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).baseDir
    const options: { [key: string]: any } = {
      attributes: {
        'env-vscode': '',
        env: 'vscode',
        ...AsciidoctorAttributesConfig.defaultSourceHighlighter(
          asciidoctorAttributes,
        ),
        ...asciidoctorAttributes,
      },
      backend,
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      ...(baseDir && { base_dir: baseDir }),
    }
    const templateDirs = this.getTemplateDirs()
    if (templateDirs.length !== 0) {
      options.template_dirs = templateDirs
    }
    const document = await load(textDocument.getText(), options)
    const output = await document.convert(options)
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
  ): Promise<{ html: string; document: AsciidoctorDocument }> {
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    // Capture Asciidoctor log messages so they do not leak to the console.
    // The preview never reports diagnostics: that is owned by
    // AsciidocDiagnosticManager and refreshed on document open/change only, so
    // opening or closing the preview does not (re)compute or clear them.
    asciidoctorProcessor.activateMemoryLogger()

    // load the Asciidoc header only to get kroki-server-url attribute
    const text = textDocument.getText()
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    const document = await load(text, {
      attributes,
      header_only: true,
    })
    const isRougeSourceHighlighterEnabled = document.isAttribute(
      'source-highlighter',
      'rouge',
    )
    if (isRougeSourceHighlighterEnabled) {
      // Force the source highlighter to Highlight.js (since Rouge is not supported)
      document.setAttribute('source-highlighter', 'highlight.js')
    }
    const krokiServerUrl =
      document.getAttribute('kroki-server-url') || 'https://kroki.io'

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
    )
    ConverterFactory.register(asciidoctorWebViewConverter, 'webview-html5')

    const registry = Extensions.create()
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    if (antoraDocumentContext !== undefined) {
      const antoraConfig = await getAntoraConfig(textDocumentUri)
      registry.includeProcessor(
        new AntoraIncludeProcessor((_, target, cursor) =>
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
    const baseDir = asciidocTextDocument.baseDir
    const documentDirectory = asciidocTextDocument.dirName
    const documentBasename = asciidocTextDocument.fileName
    const documentExtensionName = asciidocTextDocument.extensionName
    const documentFilePath = asciidocTextDocument.filePath
    const templateDirs = this.getTemplateDirs()
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
        ...attributes,
        ...antoraAttributes,
        'vscode-theme': isDarkTheme ? 'dark' : 'light',
        // The following attributes are "intrinsic attributes" but they are not set when the input is a string
        // like we are doing, in that case it is expected that the attributes are set here for the API:
        // https://docs.asciidoctor.org/asciidoc/latest/attributes/document-attributes-ref/#intrinsic-attributes
        // this can be set since safe mode is 'UNSAFE'
        ...(documentDirectory && { docdir: documentDirectory }),
        ...(documentFilePath && { docfile: documentFilePath }),
        ...(documentBasename && { docname: documentBasename }),
        docfilesuffix: documentExtensionName,
        filetype: asciidoctorWebViewConverter.outfilesuffix.substring(1), // remove the leading '.'
        '!data-uri': '', // disable data-uri since Asciidoctor.js is unable to read files from a VS Code workspace.
      },
      backend: 'webview-html5',
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      sourcemap: true,
      ...(baseDir && { base_dir: baseDir }),
    }
    if (templateDirs.length !== 0) {
      options.template_dirs = templateDirs
    }

    try {
      const document = await load(text, options)
      const blocksWithLineNumber = document.findBy(function (b) {
        return typeof b.getLineNumber() !== 'undefined'
      })
      blocksWithLineNumber.forEach(function (block) {
        block.addRole('data-line-' + block.getLineNumber())
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
      vscode.window.showErrorMessage(e.toString())
      throw e
    }
  }

  /**
   * Get user defined template directories from configuration.
   * @private
   */
  private getTemplateDirs() {
    return vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .get<string[]>('templates', [])
  }
}
