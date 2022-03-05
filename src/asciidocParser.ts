import * as vscode from 'vscode'
import * as path from 'path'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
import { Asciidoctor } from '@asciidoctor/core'

const asciidoctorFindIncludeProcessor = require('./asciidoctorFindIncludeProcessor')

const asciidoctor = require('@asciidoctor/core')
const docbook = require('@asciidoctor/docbook-converter')
const kroki = require('asciidoctor-kroki')
const processor = asciidoctor()
const highlightjsBuiltInSyntaxHighlighter = processor.SyntaxHighlighter.for('highlight.js')
const highlightjsAdapter = require('./highlightjs-adapter')

export class AsciidocParser {
  private stylesdir: string
  public baseDocumentIncludeItems = null

  constructor (extensionUri: vscode.Uri, private errorCollection: vscode.DiagnosticCollection = null) {
    // Asciidoctor.js in the browser environment works with URIs however for desktop clients
    // the stylesdir attribute is expected to look like a file system path (especially on Windows)
    if (process.env.BROWSER_ENV) {
      this.stylesdir = vscode.Uri.joinPath(extensionUri, 'media').toString()
    } else {
      this.stylesdir = vscode.Uri.joinPath(extensionUri, 'media').fsPath
    }
  }

  public getMediaDir (text) {
    return text.match(/^\\s*:mediadir:/)
  }

  public async convertUsingJavascript (
    text: string,
    doc: vscode.TextDocument,
    forHTMLSave: boolean,
    backend: string,
    getDocumentInformation: boolean,
    context?: vscode.ExtensionContext,
    editor?: vscode.WebviewPanel
  ) {
    return new Promise<{html: string, document: Asciidoctor.Document}>((resolve, reject) => {
      const workspacePath = vscode.workspace.workspaceFolders
      const containsStyle = !(text.match(/'^\\s*:(stylesheet|stylesdir)/img) == null)
      const useEditorStylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false)
      const previewAttributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {})
      const previewStyle = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', '')
      const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRoot')
      const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc', null).get('enableErrorDiagnostics')
      const documentPath = process.env.BROWSER_ENV
        ? undefined
        : path.dirname(path.resolve(doc.fileName))
      const baseDir = useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined'
        ? vscode.workspace.rootPath
        : documentPath

      if (this.errorCollection) {
        this.errorCollection.clear()
      }

      const memoryLogger = processor.MemoryLogger.create()
      processor.LoggerManager.setLogger(memoryLogger)

      const registry = processor.Extensions.create()
      // registry for processing document differently to find AST/metadata otherwise not available
      const registryForDocumentInfo = processor.Extensions.create()

      const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter()
      processor.ConverterFactory.register(asciidoctorWebViewConverter, ['webview-html5'])
      const useKroki = vscode.workspace.getConfiguration('asciidoc', null).get('use_kroki')

      if (useKroki) {
        kroki.register(registry)
      }

      // the include processor is only run to identify includes, not to process them
      if (getDocumentInformation) {
        asciidoctorFindIncludeProcessor.register(registryForDocumentInfo)
        asciidoctorFindIncludeProcessor.resetIncludes()
      }

      if (context && editor) {
        highlightjsAdapter.register(highlightjsBuiltInSyntaxHighlighter, context, editor)
      } else {
        highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
      }

      let attributes = {}

      if (containsStyle) {
        attributes = { copycss: true }
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
          copycss: true,
          stylesdir: stylesdir,
          stylesheet: stylesheet,
        }
      } else if (useEditorStylesheet && !forHTMLSave) {
        attributes = {
          'allow-uri-read': true,
          copycss: false,
          stylesdir: this.stylesdir,
          stylesheet: 'asciidoctor-editor.css',
        }
      } else {
        attributes = {
          copycss: true,
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

      if (backend.startsWith('docbook')) {
        docbook.register()
      }

      let options: { [key: string]: any } = {
        attributes: attributes,
        backend: backend,
        base_dir: baseDir,
        extension_registry: getDocumentInformation ? registryForDocumentInfo : registry,
        header_footer: true,
        safe: 'unsafe',
        sourcemap: true,
        to_file: false,
      }

      if (baseDir) {
        options = { ...options, base_dir: baseDir }
      }

      try {
        const document = processor.load(text, options)
        if (getDocumentInformation) {
          this.baseDocumentIncludeItems = asciidoctorFindIncludeProcessor.getBaseDocIncludes()
        }
        const blocksWithLineNumber = document.findBy(function (b) {
          return typeof b.getLineNumber() !== 'undefined'
        })
        blocksWithLineNumber.forEach(function (block) {
          block.addRole('data-line-' + block.getLineNumber())
        })
        const resultHTML = document.convert(options)
        if (enableErrorDiagnostics) {
          const diagnostics = []
          memoryLogger.getMessages().forEach((error) => {
            //console.log(error); //Error from asciidoctor.js
            let errorMessage = error.getText()
            let sourceLine = 0
            let relatedFile = null
            const diagnosticSource = 'asciidoctor.js'
            // allocate to line 0 in the absence of information
            let sourceRange = doc.lineAt(0).range
            const location = error.getSourceLocation()
            if (location) { //There is a source location
              if (location.getPath() === '<stdin>') { //error is within the file we are parsing
                sourceLine = location.getLineNumber() - 1
                // ensure errors are always associated with a valid line
                sourceLine = sourceLine >= doc.lineCount ? doc.lineCount - 1 : sourceLine
                sourceRange = doc.lineAt(sourceLine).range
              } else { //error is coming from an included file
                relatedFile = error.getSourceLocation()
                // try to find the include responsible from the info provided by asciidoctor.js
                sourceLine = doc.getText().split('\n').indexOf(doc.getText().split('\n').find((str) => str.startsWith('include') && str.includes(error.message.source_location.path)))
                if (sourceLine !== -1) {
                  sourceRange = doc.lineAt(sourceLine).range
                }
              }
            } else {
              // generic error (e.g. :source-highlighter: coderay)
              errorMessage = error.message
            }
            let severity = vscode.DiagnosticSeverity.Information
            if (error.severity === 'WARN') {
              severity = vscode.DiagnosticSeverity.Warning
            } else if (error.severity === 'ERROR') {
              severity = vscode.DiagnosticSeverity.Error
            } else if (error.severity === 'DEBUG') {
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
            this.errorCollection.set(doc.uri, diagnostics)
          }
        }
        resolve({ html: resultHTML, document })
      } catch (e) {
        vscode.window.showErrorMessage(e.toString())
        reject(e)
      }
    })
  }

  public async parseText (
    text: string,
    doc: vscode.TextDocument,
    forHTMLSave: boolean = false,
    backend: string = 'webview-html5',
    context?: vscode.ExtensionContext,
    editor?: vscode.WebviewPanel
  ): Promise<{ html: string, document?: Asciidoctor.Document }> {
    return this.convertUsingJavascript(text, doc, forHTMLSave, backend, false, context, editor)
  }
}
