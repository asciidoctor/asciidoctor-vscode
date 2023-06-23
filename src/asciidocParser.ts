import * as vscode from 'vscode'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
import { Asciidoctor } from '@asciidoctor/core'
import { ExtensionContentSecurityPolicyArbiter, AsciidoctorExtensionsSecurityPolicyArbiter } from './security'
import { AsciidocPreviewConfigurationManager } from './features/previewConfig'
import { SkinnyTextDocument } from './util/document'
import { IncludeItems } from './asciidoctorFindIncludeProcessor'
import { AsciidocContributionProvider } from './asciidocExtensions'
import { AntoraSupportManager, getAntoraDocumentContext } from './features/antora/antoraSupport'
import { WebviewResourceProvider } from './util/resources'
import { getAsciidoctorConfigContent } from './features/asciidoctorConfig'
import { AsciidocTextDocument } from './asciidocTextDocument'

const asciidoctorFindIncludeProcessor = require('./asciidoctorFindIncludeProcessor')

const asciidoctor = require('@asciidoctor/core')
const docbookConverter = require('@asciidoctor/docbook-converter')
const processor = asciidoctor()
const highlightjsBuiltInSyntaxHighlighter = processor.SyntaxHighlighter.for('highlight.js')
const highlightjsAdapter = require('./highlightjs-adapter')

docbookConverter.register()

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocParser {
  private stylesdir: string
  public prependExtension: Asciidoctor.Extensions.PreprocessorKlass

  constructor (
    readonly contributionProvider: AsciidocContributionProvider,
    readonly aspArbiter: AsciidoctorExtensionsSecurityPolicyArbiter = null,
    private errorCollection: vscode.DiagnosticCollection = null
  ) {
    this.prependExtension = processor.Extensions.createPreprocessor('PrependConfigPreprocessorExtension', {
      postConstruct: function () {
        this.asciidoctorConfigContent = ''
      },
      process: function (doc, reader) {
        if (this.asciidoctorConfigContent.length > 0) {
          // otherwise an empty line at the beginning breaks level 0 detection
          reader.pushInclude(this.asciidoctorConfigContent, undefined, undefined, 1, {})
        }
      },
    }).$new()

    // Asciidoctor.js in the browser environment works with URIs however for desktop clients
    // the stylesdir attribute is expected to look like a file system path (especially on Windows)
    if (process.env.BROWSER_ENV) {
      this.stylesdir = vscode.Uri.joinPath(contributionProvider.extensionUri, 'media').toString()
    } else {
      this.stylesdir = vscode.Uri.joinPath(contributionProvider.extensionUri, 'media').fsPath
    }
  }

  // Export

  public async export (
    text: string,
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {}
  ): Promise<{ output: string, document: Asciidoctor.Document }> {
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    if (this.errorCollection) {
      this.errorCollection.clear()
    }
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const registry = processor.Extensions.create()

    await this.registerAsciidoctorExtensions(registry)

    highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const templateDirs = this.getTemplateDirs()
    const options: { [key: string]: any } = AsciidocParser.getDefaultAsciidoctorOptions(baseDir)
    options.extension_registry = registry
    options.header_footer = true
    options.attributes = {
      'env-vscode': '',
      env: 'vscode',
      ...asciidoctorAttributes,
    }
    if (templateDirs.length !== 0) {
      options.template_dirs = templateDirs
    }

    const asciidoctorConfigContent = await getAsciidoctorConfigContent(textDocument.uri)
    if (asciidoctorConfigContent !== undefined) {
      (this.prependExtension as any).asciidoctorConfigContent = asciidoctorConfigContent
    }

    const document = processor.load(text, options)
    const output = document.convert(options)
    if (asciidocConfig.get('enableErrorDiagnostics')) {
      this.reportErrors(memoryLogger, textDocument)
    }
    return {
      output,
      document,
    }
  }

  // Load

  public static getBaseDocumentIncludeItems (textDocument: SkinnyTextDocument): IncludeItems {
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const registry = processor.Extensions.create()
    asciidoctorFindIncludeProcessor.register(registry)
    asciidoctorFindIncludeProcessor.resetIncludes()
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const options = this.getDefaultAsciidoctorOptions(baseDir)
    options.extension_registry = registry
    processor.load(textDocument.getText(), options)
    // QUESTION: should we report error?
    return asciidoctorFindIncludeProcessor.getBaseDocIncludes()
  }

  public static load (textDocument: SkinnyTextDocument): Asciidoctor.Document {
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    return processor.load(textDocument.getText(), AsciidocParser.getDefaultAsciidoctorOptions(baseDir))
  }

  private static getDefaultAsciidoctorOptions (baseDir: string): any {
    return {
      attributes: {
        'env-vscode': '',
        env: 'vscode',
      },
      sourcemap: true,
      safe: 'unsafe',
      parse: true,
      ...(baseDir && { base_dir: baseDir }),
    }
  }

  // Convert (preview)

  public async convertUsingJavascript (
    text: string,
    doc: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number
  ): Promise<{ html: string, document: Asciidoctor.Document }> {
    // extension context should be at constructor
    const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)
    const workspacePath = vscode.workspace.workspaceFolders
    const previewAttributes = vscode.workspace.getConfiguration('asciidoc.preview', null).get('asciidoctorAttributes', {})
    const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc.debug', null).get('enableErrorDiagnostics')

    if (this.errorCollection) {
      this.errorCollection.clear()
    }

    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)

    const registry = processor.Extensions.create()

    // Antora IDs resolution:
    const antoraDocumentContext = await getAntoraDocumentContext(doc.uri, context.workspaceState)
    // load the Asciidoc header only to get kroki-server-url attribute
    const document = processor.load(text, { header_only: true })
    const krokiServerUrl = document.getAttribute('kroki-server-url') || 'https://kroki.io'

    const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
      doc,
      editor,
      cspArbiter.getSecurityLevelForResource(doc.uri),
      cspArbiter.shouldDisableSecurityWarnings(),
      this.contributionProvider.contributions,
      previewConfigurationManager.loadAndCacheConfiguration(doc.uri),
      antoraDocumentContext,
      line,
      krokiServerUrl
    )
    processor.ConverterFactory.register(asciidoctorWebViewConverter, ['webview-html5'])

    await this.registerAsciidoctorExtensions(registry)

    if (context && editor) {
      highlightjsAdapter.register(highlightjsBuiltInSyntaxHighlighter, context, editor)
    } else {
      highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
    }

    const attributes: { [key: string]: any } = {}
    Object.keys(previewAttributes).forEach((key) => {
      const attributeValue = previewAttributes[key]
      if (typeof attributeValue === 'string') {
        attributes[key] = workspacePath === undefined
          ? attributeValue
          // eslint-disable-next-line no-template-curly-in-string
          : attributeValue.replace('${workspaceFolder}', workspacePath[0].uri.path)
      }
    })
    attributes['env-vscode'] = ''
    attributes.env = 'vscode'
    attributes['relfilesuffix@'] = '.adoc'

    const antoraSupport = await AntoraSupportManager.getInstance(context.workspaceState)
    const antoraAttributes = await antoraSupport.getAttributes(doc.uri)
    const baseDir = AsciidocTextDocument.fromTextDocument(doc).getBaseDir()
    const templateDirs = this.getTemplateDirs()
    const options: { [key: string]: any } = {
      attributes: {
        ...attributes,
        ...antoraAttributes,
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
      const asciidoctorConfigContent = await getAsciidoctorConfigContent(doc.uri)
      if (asciidoctorConfigContent !== undefined) {
        (this.prependExtension as any).asciidoctorConfigContent = asciidoctorConfigContent
      }
      const document = processor.load(text, options)
      const blocksWithLineNumber = document.findBy(function (b) {
        return typeof b.getLineNumber() !== 'undefined'
      })
      blocksWithLineNumber.forEach(function (block) {
        block.addRole('data-line-' + block.getLineNumber())
      })
      const resultHTML = document.convert(options)
      if (enableErrorDiagnostics) {
        this.reportErrors(memoryLogger, doc)
      }
      return {
        html: resultHTML,
        document,
      }
    } catch (e) {
      vscode.window.showErrorMessage(e.toString())
      throw e
    }
  }

  private reportErrors (memoryLogger: Asciidoctor.MemoryLogger, textDocument: SkinnyTextDocument) {
    const diagnostics = []
    memoryLogger.getMessages().forEach((error) => {
      let errorMessage = error.getText()
      let sourceLine = 0
      let relatedFile = null
      const diagnosticSource = 'asciidoctor.js'
      // allocate to line 0 in the absence of information
      let sourceRange = textDocument.lineAt(0).range
      const location = error.getSourceLocation()
      if (location) { //There is a source location
        if (location.getPath() === '<stdin>') { //error is within the file we are parsing
          sourceLine = location.getLineNumber() - 1
          // ensure errors are always associated with a valid line
          sourceLine = sourceLine >= textDocument.lineCount ? textDocument.lineCount - 1 : sourceLine
          sourceRange = textDocument.lineAt(sourceLine).range
        } else { //error is coming from an included file
          relatedFile = error.getSourceLocation()
          // try to find the include responsible from the info provided by asciidoctor.js
          sourceLine = textDocument.getText().split('\n').indexOf(textDocument.getText().split('\n').find((str) => str.startsWith('include') && str.includes(relatedFile.path)))
          if (sourceLine !== -1) {
            sourceRange = textDocument.lineAt(sourceLine).range
          }
        }
      } else {
        // generic error (e.g. :source-highlighter: coderay)
        errorMessage = error.message
      }
      let severity = vscode.DiagnosticSeverity.Information
      if (error.getSeverity() === 'WARN') {
        severity = vscode.DiagnosticSeverity.Warning
      } else if (error.getSeverity() === 'ERROR') {
        severity = vscode.DiagnosticSeverity.Error
      } else if (error.getSeverity() === 'DEBUG') {
        severity = vscode.DiagnosticSeverity.Information
      }
      let diagnosticRelated = null
      if (relatedFile) {
        diagnosticRelated = [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(vscode.Uri.file(relatedFile.file),
              new vscode.Position(0, 0)
            ),
            errorMessage
          ),
        ]
        errorMessage = 'There was an error in an included file'
      }
      const diagnosticError = new vscode.Diagnostic(sourceRange, errorMessage, severity)
      diagnosticError.source = diagnosticSource
      if (diagnosticRelated) {
        diagnosticError.relatedInformation = diagnosticRelated
      }
      diagnostics.push(diagnosticError)
    })
    if (this.errorCollection) {
      this.errorCollection.set(textDocument.uri, diagnostics)
    }
  }

  /**
   * Get user defined template directories from configuration.
   * @private
   */
  private getTemplateDirs () {
    return vscode.workspace.getConfiguration('asciidoc.preview', null).get<string[]>('templates', [])
  }

  private async confirmAsciidoctorExtensionsTrusted (): Promise<boolean> {
    if (!this.isAsciidoctorExtensionsRegistrationEnabled()) {
      return false
    }
    const extensionFiles = await this.getExtensionFilesInWorkspace()
    const extensionsCount = extensionFiles.length
    if (extensionsCount === 0) {
      return false
    }
    return this.aspArbiter.confirmAsciidoctorExtensionsTrustMode(extensionsCount)
  }

  private async registerAsciidoctorExtensions (registry) {
    const enableKroki = vscode.workspace.getConfiguration('asciidoc.extensions', null).get('enableKroki')
    if (enableKroki) {
      const kroki = require('asciidoctor-kroki')
      kroki.register(registry)
    }
    registry.preprocessor(this.prependExtension)
    await this.registerExtensionsInWorkspace(registry)
  }

  private async getExtensionFilesInWorkspace (): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('.asciidoctor/lib/**/*.js')
  }

  private isAsciidoctorExtensionsRegistrationEnabled (): boolean {
    return vscode.workspace.getConfiguration('asciidoc.extensions', null).get('registerWorkspaceExtensions')
  }

  private async registerExtensionsInWorkspace (registry) {
    const extensionsTrusted = await this.confirmAsciidoctorExtensionsTrusted()
    if (!extensionsTrusted) {
      return
    }
    const extfiles = await this.getExtensionFilesInWorkspace()
    for (const extfile of extfiles) {
      const extPath = extfile.fsPath
      try {
        delete require.cache[extPath]
        const extjs = require(extPath)
        extjs.register(registry)
      } catch (e) {
        vscode.window.showErrorMessage(extPath + ': ' + e.toString())
      }
    }
  }
}
