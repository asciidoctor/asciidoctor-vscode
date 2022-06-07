import * as vscode from 'vscode'
import * as path from 'path'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
import { Asciidoctor } from '@asciidoctor/core'
import { ExtensionContentSecurityPolicyArbiter } from './security'
import { AsciidocPreviewConfigurationManager } from './features/previewConfig'
import { SkinnyTextDocument } from './util/document'
import { IncludeItems } from './asciidoctorFindIncludeProcessor'

const asciidoctorFindIncludeProcessor = require('./asciidoctorFindIncludeProcessor')

const asciidoctor = require('@asciidoctor/core')
const docbookConverter = require('@asciidoctor/docbook-converter')
const processor = asciidoctor()
const highlightjsBuiltInSyntaxHighlighter = processor.SyntaxHighlighter.for('highlight.js')
const highlightjsAdapter = require('./highlightjs-adapter')

const extDirInWorkspace = '.asciidoctor/lib/'

docbookConverter.register()

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocParser {
  private stylesdir: string

  constructor (extensionUri: vscode.Uri, private errorCollection: vscode.DiagnosticCollection = null) {
    // Asciidoctor.js in the browser environment works with URIs however for desktop clients
    // the stylesdir attribute is expected to look like a file system path (especially on Windows)
    if (process.env.BROWSER_ENV) {
      this.stylesdir = vscode.Uri.joinPath(extensionUri, 'media').toString()
    } else {
      this.stylesdir = vscode.Uri.joinPath(extensionUri, 'media').fsPath
    }
  }

  // Export

  public async export (
    text: string,
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends
  ): Promise<{ output: string, document: Asciidoctor.Document }> {
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    if (this.errorCollection) {
      this.errorCollection.clear()
    }
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const registry = processor.Extensions.create()

    await this.registerExt(registry)

    highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
    const baseDir = this.getBaseDir(textDocument.fileName)
    const options: { [key: string]: any } = {
      attributes: {
        'env-vscode': '',
      },
      backend,
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      ...(baseDir && { base_dir: baseDir }),
    }
    const document = processor.load(text, options)
    const output = document.convert(options)
    if (asciidocConfig.get('enableErrorDiagnostics')) {
      this.reportErrors(memoryLogger, textDocument)
    }
    return { output, document }
  }

  // Load

  public load (textDocument: SkinnyTextDocument): { document: Asciidoctor.Document, baseDocumentIncludeItems: IncludeItems } {
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const registry = processor.Extensions.create()
    asciidoctorFindIncludeProcessor.register(registry)
    asciidoctorFindIncludeProcessor.resetIncludes()
    const baseDir = this.getBaseDir(textDocument.fileName)
    const document = processor.load(textDocument.getText(), {
      attributes: {
        'env-vscode': '',
      },
      extension_registry: registry,
      sourcemap: true,
      safe: 'unsafe',
      ...(baseDir && { base_dir: baseDir }),
    })
    // QUESTION: should we report error?
    return { document, baseDocumentIncludeItems: asciidoctorFindIncludeProcessor.getBaseDocIncludes() }
  }

  // Convert (preview)

  public async convertUsingJavascript (
    text: string,
    doc: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: vscode.WebviewPanel
  ): Promise<{ html: string, document: Asciidoctor.Document }> {
    // extension context should be at constructor
    const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)
    const workspacePath = vscode.workspace.workspaceFolders
    const previewAttributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {})
    const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc', null).get('enableErrorDiagnostics')

    if (this.errorCollection) {
      this.errorCollection.clear()
    }

    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)

    const registry = processor.Extensions.create()

    const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
      doc,
      context,
      editor,
      cspArbiter,
      previewConfigurationManager
    )
    processor.ConverterFactory.register(asciidoctorWebViewConverter, ['webview-html5'])

    await this.registerExt(registry)

    if (context && editor) {
      highlightjsAdapter.register(highlightjsBuiltInSyntaxHighlighter, context, editor)
    } else {
      highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
    }

    const attributes = {}
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

    const baseDir = this.getBaseDir(doc.fileName)
    const options: { [key: string]: any } = {
      attributes: attributes,
      backend: 'webview-html5',
      extension_registry: registry,
      header_footer: true,
      safe: 'unsafe',
      sourcemap: true,
      ...(baseDir && { base_dir: baseDir }),
    }

    try {
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
      return { html: resultHTML, document }
    } catch (e) {
      vscode.window.showErrorMessage(e.toString())
      throw e
    }
  }

  private reportErrors (memoryLogger: Asciidoctor.MemoryLogger, textDocument: SkinnyTextDocument) {
    const diagnostics = []
    memoryLogger.getMessages().forEach((error) => {
      //console.log(error); //Error from asciidoctor.js
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
   * Get the base directory.
   * @param documentFileName The file system path of the text document.
   * @private
   */
  private getBaseDir (documentFilePath: string): string | undefined {
    const documentPath = process.env.BROWSER_ENV
      ? undefined
      : path.dirname(path.resolve(documentFilePath))
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    const useWorkspaceAsBaseDir = asciidocConfig.get('useWorkspaceRoot')
    return useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined'
      ? vscode.workspace.rootPath
      : documentPath
  }

  private async registerExt (registry) {
    const useKroki = vscode.workspace.getConfiguration('asciidoc', null).get('use_kroki')
    if (useKroki) {
      const kroki = require('asciidoctor-kroki')
      kroki.register(registry)
    }
    await this.registerExtensionInWorkspace(registry)
  }

  public alreadyShowWarningMessage = false
  private allowToExecuteExtInWorkspace = false

  public async showWarningMessageRegisterExtensionInWorkspace () {
    const value = await vscode.window.showWarningMessage(
      'AsciiDoc extension is trying to execute scripts in workspace(' + extDirInWorkspace + '*.js). Do you trust authors of scripts in workspace?',
      { title: 'Yes, I trust the authors.', value: true },
      { title: 'No, I don\'t trust the authors.', value: false })
    this.allowToExecuteExtInWorkspace = value.value
    this.alreadyShowWarningMessage = true
  }

  private async readdirsRecursive (uri: vscode.Uri): Promise<[ string, vscode.FileType ][]> {
    if (!vscode.workspace.fs.stat(uri)) {
      return []
    }
    const rd = await vscode.workspace.fs.readDirectory(uri)
    const result = rd.filter(function (extfile) {
      return extfile[1] === vscode.FileType.File
    })
    for (const fd of rd) {
      const fname = fd[0]
      const ftype = fd[1]
      if (ftype === vscode.FileType.Directory) {
        const subdir = await this.readdirsRecursive(uri.with({ path: path.posix.join(uri.path, fname) }))
        for (const subdirfile of subdir) {
          result.push([path.posix.join(fname, subdirfile[0]), subdirfile[1]])
        }
      }
    }
    return result
  }

  private async getExtensionFilesInWorkspace (): Promise<[ string, vscode.FileType ][]> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders === undefined) {
      return []
    }
    const workspacePath = workspaceFolders[0].uri
    const extDir = path.posix.join(workspacePath.path, extDirInWorkspace)
    if (!vscode.workspace.fs.stat(workspacePath.with({ path: extDir }))) {
      return []
    }
    const rd = await this.readdirsRecursive(workspacePath.with({ path: extDir }))
    return rd.filter(function (extfile) {
      return extfile[1] === vscode.FileType.File && extfile[0].endsWith('.js')
    })
  }

  public async hasExtensionInWorkspace () {
    const files = await this.getExtensionFilesInWorkspace()
    return files.length !== 0
  }

  private async registerExtensionInWorkspace (registry) {
    if (this.allowToExecuteExtInWorkspace === false) {
      return
    }

    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders === undefined) {
      return
    }
    const workspaceFolder = workspaceFolders[0]
    const workspacePath = workspaceFolder.uri.path

    const extfiles = await this.getExtensionFilesInWorkspace()
    for (const extfile of extfiles) {
      const extPath = path.posix.join(workspacePath, extDirInWorkspace, extfile[0])
      try {
        delete require.cache[extPath]
        const extjs = require(extPath)
        extjs.register(registry)
      } catch (e) {
        vscode.window.showErrorMessage(extPath + ': ' + e.toString())
        throw e
      }
    }
  }
}
