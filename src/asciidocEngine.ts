import * as vscode from 'vscode'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
import { Asciidoctor } from '@asciidoctor/core'
import { ExtensionContentSecurityPolicyArbiter } from './security'
import { AsciidocPreviewConfigurationManager } from './features/previewConfig'
import { SkinnyTextDocument } from './util/document'
import { AsciidocContributionProvider } from './asciidocExtensions'
import { AntoraSupportManager, getAntoraDocumentContext, getAntoraConfig } from './features/antora/antoraSupport'
import { WebviewResourceProvider } from './util/resources'
import { AsciidoctorConfigProvider } from './features/asciidoctorConfig'
import { AsciidocTextDocument } from './asciidocTextDocument'
import { AsciidoctorExtensionsProvider } from './features/asciidoctorExtensions'
import { AsciidoctorDiagnosticProvider } from './features/asciidoctorDiagnostic'
import { AsciidoctorProcessor } from './asciidoctorProcessor'
import { AsciidoctorAttributesConfig } from './features/asciidoctorAttributesConfig'
import { IncludeProcessor } from './features/antora/includeProcessor'
import { resolveIncludeFile } from './features/antora/resolveIncludeFile'

const highlightjsAdapter = require('./highlightjs-adapter')

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocEngine {
  private stylesdir: string

  constructor (
    readonly contributionProvider: AsciidocContributionProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider
  ) {
    // Asciidoctor.js in the browser environment works with URIs however for desktop clients
    // the "stylesdir" attribute is expected to look like a file system path (especially on Windows)
    if ('browser' in process && (process as any).browser === true) {
      this.stylesdir = vscode.Uri.joinPath(contributionProvider.extensionUri, 'media').toString()
    } else {
      this.stylesdir = vscode.Uri.joinPath(contributionProvider.extensionUri, 'media').fsPath
    }
  }

  // Export

  public async export (
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {}
  ): Promise<{ output: string, document: Asciidoctor.Document }> {
    this.asciidoctorDiagnosticProvider.delete(textDocument.uri)
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    const memoryLogger = asciidoctorProcessor.activateMemoryLogger()

    const processor = asciidoctorProcessor.processor
    const registry = processor.Extensions.create()
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()

    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const options: { [key: string]: any } = {
      attributes: {
        'env-vscode': '',
        env: 'vscode',
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
    const document = processor.load(textDocument.getText(), options)
    const output = document.convert(options)
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
    return {
      output,
      document,
    }
  }

  // Convert (preview)

  public async convertFromUri (
    documentUri: vscode.Uri,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number
  ): Promise<{html: string, document?: Asciidoctor.Document}> {
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const { html, document } = await this.convertFromTextDocument(textDocument, context, editor, line)
    return { html, document }
  }

  public async convertFromTextDocument (
    textDocument: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number
  ): Promise<{ html: string, document: Asciidoctor.Document }> {
    this.asciidoctorDiagnosticProvider.delete(textDocument.uri)
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    const memoryLogger = asciidoctorProcessor.activateMemoryLogger()

    const processor = asciidoctorProcessor.processor
    // load the Asciidoc header only to get kroki-server-url attribute
    const text = textDocument.getText()
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    const document = processor.load(text, { attributes, header_only: true })
    const krokiServerUrl = document.getAttribute('kroki-server-url') || 'https://kroki.io'

    // Antora Resource Identifiers resolution
    const antoraDocumentContext = await getAntoraDocumentContext(textDocument.uri, context.workspaceState)
    const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)
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
      krokiServerUrl
    )
    processor.ConverterFactory.register(asciidoctorWebViewConverter, ['webview-html5'])

    const registry = processor.Extensions.create()
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    if (antoraDocumentContext !== undefined) {
      const antoraConfig = await getAntoraConfig(textDocumentUri)
      registry.includeProcessor(IncludeProcessor.$new((_, target, cursor) => resolveIncludeFile(
        target, {
          src: antoraDocumentContext.resourceContext,
        },
        cursor,
        antoraDocumentContext.getContentCatalog(),
        antoraConfig
      )
      ))
    }
    if (context && editor) {
      highlightjsAdapter.register(asciidoctorProcessor.highlightjsBuiltInSyntaxHighlighter, context, editor)
    } else {
      asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()
    }
    const antoraSupport = AntoraSupportManager.getInstance(context.workspaceState)
    const antoraAttributes = await antoraSupport.getAttributes(textDocumentUri)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const templateDirs = this.getTemplateDirs()
    const options: { [key: string]: any } = {
      attributes: {
        ...attributes,
        ...antoraAttributes,
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
      const document = processor.load(text, options)
      const blocksWithLineNumber = document.findBy(function (b) {
        return typeof b.getLineNumber() !== 'undefined'
      })
      blocksWithLineNumber.forEach(function (block) {
        block.addRole('data-line-' + block.getLineNumber())
      })
      const html = document.convert(options)
      this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
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
  private getTemplateDirs () {
    return vscode.workspace.getConfiguration('asciidoc.preview', null).get<string[]>('templates', [])
  }
}
