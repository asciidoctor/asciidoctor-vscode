import * as vscode from 'vscode'
import * as path from 'path'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
import { Asciidoctor } from '@asciidoctor/core'
import { SkinnyTextDocument } from './util/document'
import { IncludeItems } from './asciidoctorFindIncludeProcessor'

const asciidoctorFindIncludeProcessor = require('./asciidoctorFindIncludeProcessor')

const asciidoctor = require('@asciidoctor/core')
const docbookConverter = require('@asciidoctor/docbook-converter')
const kroki = require('asciidoctor-kroki')
const processor = asciidoctor()
const highlightjsBuiltInSyntaxHighlighter = processor.SyntaxHighlighter.for('highlight.js')
const highlightjsAdapter = require('./highlightjs-adapter')

docbookConverter.register()

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

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

  public export (text: string, textDocument: vscode.TextDocument, backend: AsciidoctorBuiltInBackends): { output: string, document: Asciidoctor.Document } {
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    if (this.errorCollection) {
      this.errorCollection.clear()
    }
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)
    const registry = processor.Extensions.create()
    const useKroki = asciidocConfig.get('use_kroki')
    if (useKroki) {
      kroki.register(registry)
    }
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

  public convertUsingJavascript (
    text: string,
    doc: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: vscode.WebviewPanel
  ): { html: string, document: Asciidoctor.Document } {
    const workspacePath = vscode.workspace.workspaceFolders
    const containsStyle = !(text.match(/'^\\s*:(stylesheet|stylesdir)/img) == null)
    const useEditorStylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false)
    const previewAttributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {})
    const previewStyle = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', '')
    const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc', null).get('enableErrorDiagnostics')

    if (this.errorCollection) {
      this.errorCollection.clear()
    }

    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)

    const registry = processor.Extensions.create()

    const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter()
    processor.ConverterFactory.register(asciidoctorWebViewConverter, ['webview-html5'])
    const useKroki = vscode.workspace.getConfiguration('asciidoc', null).get('use_kroki')

    if (useKroki) {
      kroki.register(registry)
    }

    if (context && editor) {
      highlightjsAdapter.register(highlightjsBuiltInSyntaxHighlighter, context, editor)
    } else {
      highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
    }

    let attributes = {}

    if (containsStyle) {
      attributes = {}
    } else if (previewStyle !== '') {
      let stylesdir: string, stylesheet: string

      if (path.isAbsolute(previewStyle)) {
        stylesdir = path.dirname(previewStyle)
        stylesheet = path.basename(previewStyle)
      } else {
        if (workspacePath === undefined) {
          stylesdir = ''
        } else if (workspacePath.length > 0) {
          stylesdir = workspacePath[0].uri.path
        }

        stylesdir = path.dirname(path.join(stylesdir, previewStyle))
        stylesheet = path.basename(previewStyle)
      }

      attributes = {
        stylesdir: stylesdir,
        stylesheet: stylesheet,
      }
    } else if (useEditorStylesheet) {
      attributes = {
        'allow-uri-read': true,
        stylesdir: this.stylesdir,
        stylesheet: 'asciidoctor-editor.css',
      }
    } else {
      attributes = {
        stylesdir: this.stylesdir,
        stylesheet: 'asciidoctor-default.css@',
      }
    }

    // TODO: Check -- Not clear that this code is functional
    Object.keys(previewAttributes).forEach((key) => {
      if (typeof previewAttributes[key] === 'string') {
        attributes[key] = previewAttributes[key]
        if (workspacePath !== undefined) {
          // eslint-disable-next-line no-template-curly-in-string
          attributes[key] = attributes[key].replace('${workspaceFolder}', workspacePath[0].uri.path)
        }
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
}
