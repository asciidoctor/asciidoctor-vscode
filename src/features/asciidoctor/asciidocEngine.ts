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
import { AsciidoctorDiagnosticProvider } from './asciidoctorDiagnostic.js'
import { AsciidoctorExtensionsProvider } from './asciidoctorExtensions.js'
import { AsciidoctorProcessor } from './asciidoctorProcessor.js'

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocEngine {
  constructor(
    readonly contributionProvider: AsciidocContributionProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider,
  ) {}

  // Export

  public async export(
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {},
  ): Promise<{ output: string; document: AsciidoctorDocument }> {
    this.asciidoctorDiagnosticProvider.delete(textDocument.uri)
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    const memoryLogger = asciidoctorProcessor.activateMemoryLogger()

    const registry = Extensions.create()
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, textDocumentUri)
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()

    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).baseDir
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
    const document = await load(textDocument.getText(), options)
    const output = await document.convert(options)
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
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
    this.asciidoctorDiagnosticProvider.delete(textDocument.uri)
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    const memoryLogger = asciidoctorProcessor.activateMemoryLogger()

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
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, textDocumentUri)
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
    const options: { [key: string]: any } = {
      attributes: {
        ...attributes,
        ...antoraAttributes,
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
      })
      const html = await document.convert(options)
      this.asciidoctorDiagnosticProvider.reportErrors(
        memoryLogger,
        textDocument,
      )
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
