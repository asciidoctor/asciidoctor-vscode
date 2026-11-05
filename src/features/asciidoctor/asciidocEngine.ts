import {
  Document as AsciidoctorDocument,
  ConverterFactory,
  Extensions,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import { logger } from '../../core/logger.js'
import { WebviewResourceProvider } from '../../core/resources.js'
import { ConversionTiming } from '../../lib/conversionTiming.js'
import { AntoraSupportManager } from '../antora/antoraContext.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from '../antora/antoraDocument.js'
import { resolveIncludeFile } from '../antora/resolveIncludeFile.js'
import { AsciidocContributionProvider } from '../extensionContributions.js'
import { AsciidoctorWebViewConverter } from '../preview/asciidoctorWebViewConverter.js'
import { register } from '../preview/highlightjs-adapter.js'
import { plantUmlStrings } from '../preview/plantumlStrings.js'
import { AsciidocPreviewConfigurationManager } from '../preview/previewConfig.js'
import { ExtensionContentSecurityPolicyArbiter } from '../security.js'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import { AsciidoctorAttributesConfig } from './asciidoctorAttributesConfig.js'
import { AsciidoctorConfigProvider } from './asciidoctorConfig.js'
import { AsciidoctorExtensionsProvider } from './asciidoctorExtensions.js'
import { AsciidoctorProcessor } from './asciidoctorProcessor.js'
import { registerBrowserIncludeProcessor } from './browserIncludeSupport.js'
import {
  buildExportOptions,
  buildPreviewOptions,
  convert,
  parseHeader,
  WEBVIEW_BACKEND,
} from './conversion.js'
import { ResolverIncludeProcessor } from './includeProcessor.js'
import { addMermaidToHtmlExport } from './mermaidExport.js'
import { addPlantUmlToHtmlExport } from './plantumlExport.js'
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
    const timing = new ConversionTiming()
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

    const options = buildExportOptions({
      attributes: {
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
      },
      backend,
      location: AsciidocTextDocument.fromTextDocument(textDocument),
      templateDirs: await getTemplateDirs(textDocumentUri),
      registry,
    })
    timing.phase('setup')
    const text = textDocument.getText()
    const { html: convertedOutput, document } = await convert(text, options, {
      timing,
    })
    const output =
      backend === 'html5'
        ? addPlantUmlToHtmlExport(
            addMermaidToHtmlExport(convertedOutput),
            plantUmlStrings(),
          )
        : convertedOutput
    logger.debug(
      timing.format(
        `Converted to ${backend}`,
        textDocumentUri.toString(),
        text,
      ),
    )
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
    const timing = new ConversionTiming()
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
    const header = await parseHeader(text, {
      attributes,
      registry: headerOnlyRegistry,
    })
    timing.phase('header')

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
      header.krokiServerUrl,
      header.dataUriEnabled,
      fragment,
    )
    ConverterFactory.register(asciidoctorWebViewConverter, WEBVIEW_BACKEND)

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
    // Mirrors the dark/light detection used by the Highlight.js adapter.
    const themeKind = vscode.window.activeColorTheme.kind
    const options = buildPreviewOptions({
      attributes,
      antoraAttributes,
      header,
      darkTheme:
        themeKind === vscode.ColorThemeKind.Dark ||
        themeKind === vscode.ColorThemeKind.HighContrast,
      location: AsciidocTextDocument.fromTextDocument(textDocument),
      templateDirs: await getTemplateDirs(textDocumentUri),
      registry,
    })

    timing.phase('setup')

    try {
      const { html, document } = await convert(text, options, {
        annotate: true,
        timing,
      })
      logger.debug(
        timing.format(
          'Converted for the preview',
          textDocumentUri.toString(),
          text,
        ),
      )
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
