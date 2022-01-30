import * as vscode from 'vscode'
import * as path from 'path'
import { spawn } from 'child_process'
import { AsciidoctorWebViewConverter } from './asciidoctorWebViewConverter'
const asciidoctorFindIncludeProcessor = require('./asciidoctorFindIncludeProcessor')

const asciidoctor = require('@asciidoctor/core')
const docbook = require('@asciidoctor/docbook-converter')
const kroki = require('asciidoctor-kroki')
const processor = asciidoctor()
const highlightjsBuiltInSyntaxHighlighter = processor.SyntaxHighlighter.for('highlight.js')
const highlightjsAdapter = require('./highlightjs-adapter')

export class AsciidocParser {
  public html: string = ''
  public document = null
  public processor = null

  private stylesdir: string
  public baseDocumentIncludeItems = null

  constructor (public filename: string, private errorCollection: vscode.DiagnosticCollection = null) {
    const extensionContext = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode')
    this.stylesdir = vscode.Uri.joinPath(extensionContext.extensionUri, 'media').toString()
  }

  public getAttribute (name: string) {
    return (this.document == null) ? null : this.document.getAttribute(name)
  }

  public async getMediaDir (text) {
    const match = text.match(/^\\s*:mediadir:/)
    return match
  }

  public async convertUsingJavascript (text: string,
    doc: vscode.TextDocument,
    forHTMLSave: boolean,
    backend: string,
    getDocumentInformation: boolean,
    context?: vscode.ExtensionContext,
    editor?: vscode.WebviewPanel) {
    return new Promise<string>((resolve, reject) => {
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
      processor.ConverterFactory.register(asciidoctorWebViewConverter, ['html5'])
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
        // TODO: decide whether to use the included css or let ascidoctor.js decide
        // attributes = { 'copycss': true, 'stylesdir': this.stylesdir, 'stylesheet': 'asciidoctor-default.css@' }
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
        this.document = processor.load(text, options)
        if (getDocumentInformation) {
          this.baseDocumentIncludeItems = asciidoctorFindIncludeProcessor.getBaseDocIncludes()
        }
        const blocksWithLineNumber = this.document.findBy(function (b) {
          return typeof b.getLineNumber() !== 'undefined'
        })
        blocksWithLineNumber.forEach(function (block) {
          block.addRole('data-line-' + block.getLineNumber())
        })
        const resultHTML = this.document.convert(options)
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
        resolve(resultHTML)
      } catch (e) {
        vscode.window.showErrorMessage(e.toString())
        reject(e)
      }
    })
  }

  private async convertUsingApplication (text: string, doc: vscode.TextDocument, forHTMLSave: boolean, backend: string) {
    const documentPath = path.dirname(doc.fileName).replace('"', '\\"')
    const workspacePath = vscode.workspace.workspaceFolders
    const containsStyle = !(text.match(/'^\\s*:(stylesheet|stylesdir):/img) == null)
    const useEditorStylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false)
    const previewAttributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {})
    const previewStyle = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', '')
    const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRoot')
    this.document = null

    let baseDir = documentPath
    if (useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined') {
      baseDir = vscode.workspace.rootPath.replace('"', '\\"')
    }

    return new Promise<string>((resolve) => {
      const asciidoctorCommand = vscode.workspace.getConfiguration('asciidoc', null).get('asciidoctor_command', 'asciidoctor')
      let RUBYOPT = process.env.RUBYOPT
      if (RUBYOPT) {
        let prevOpt
        RUBYOPT = RUBYOPT.split(' ').reduce((acc, opt) => {
          acc.push(prevOpt === '-E' ? (prevOpt = 'UTF-8:UTF-8') : (prevOpt = opt))
          return acc
        }, []).join(' ')
      } else {
        RUBYOPT = '-E UTF-8:UTF-8'
      }
      const options = { shell: true, cwd: path.dirname(doc.fileName), env: { ...process.env, RUBYOPT } }

      const adocCmdArray = asciidoctorCommand.split(/(\s+)/).filter(function (e) {
        return e.trim().length > 0
      })
      const adocCmd = adocCmdArray[0]
      const adocCmdArgs = adocCmdArray.slice(1)
      if (containsStyle) {
        ; // Used an empty if to make it easier to use elses later
      } else if (previewStyle !== '') {
        let stylesdir: string, stylesheet: string

        if (path.isAbsolute(previewStyle)) {
          stylesdir = path.dirname(previewStyle)
          stylesheet = path.basename(previewStyle)
        } else {
          if (workspacePath === undefined) {
            stylesdir = documentPath
          } else if (workspacePath.length > 0) {
            stylesdir = workspacePath[0].uri.path
          }

          stylesdir = path.dirname(path.join(stylesdir, previewStyle))
          stylesheet = path.basename(previewStyle)
        }

        adocCmdArgs.push('-a', `stylesdir=${stylesdir}`)
        adocCmdArgs.push('-a', `stylesheet=${stylesheet}`)
      } else if (useEditorStylesheet && !forHTMLSave) {
        adocCmdArgs.push('-a', `stylesdir=${this.stylesdir}@`)
        adocCmdArgs.push('-a', 'stylesheet=asciidoctor-editor.css@')
      } else {
        // TODO: decide whether to use the included css or let ascidoctor decide
        // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${this.stylesdir}@`])
        // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'stylesheet=asciidoctor-default.css@'])
      }

      adocCmdArgs.push('-b', backend)

      Object.keys(previewAttributes).forEach((key) => {
        if (typeof previewAttributes[key] === 'string') {
          let value: string = previewAttributes[key]
          if (workspacePath !== undefined) {
            // eslint-disable-next-line no-template-curly-in-string
            value = value.replace('${workspaceFolder}', workspacePath[0].uri.path)
          }

          if (value.endsWith('!')) {
            adocCmdArgs.push('-a', `${value}`)
          } else {
            adocCmdArgs.push('-a', `${key}=${value}`)
          }
        }
      })

      adocCmdArgs.push('-a', 'env-vscode')

      adocCmdArgs.push('-q', '-B', '"' + baseDir + '"', '-o', '-', '-')
      const asciidoctorProcess = spawn(adocCmd, adocCmdArgs, options)

      asciidoctorProcess.stderr.on('data', (data) => {
        let errorMessage = data.toString()
        console.error(errorMessage)
        errorMessage += errorMessage.replace('\n', '<br><br>')
        errorMessage += '<br><br>'
        errorMessage += '<b>command:</b> ' + adocCmd + ' ' + adocCmdArgs.join(' ')
        errorMessage += '<br><br>'
        errorMessage += '<b>If the asciidoctor binary is not in your PATH, you can set the full path.<br>'
        errorMessage += 'Go to `File -> Preferences -> User settings` and adjust the asciidoc.asciidoctor_command</b>'
        resolve(errorMessage)
      })
      let resultData = Buffer.from('')
      /* with large outputs we can receive multiple calls */
      asciidoctorProcess.stdout.on('data', (data) => {
        resultData = Buffer.concat([resultData, data as Buffer])
      })
      asciidoctorProcess.on('close', () => {
        resolve(resultData.toString())
      })
      asciidoctorProcess.stdin.write(text)
      asciidoctorProcess.stdin.end()
    })
  }

  public async parseText (text: string,
    doc: vscode.TextDocument,
    forHTMLSave: boolean = false,
    backend: string = 'html',
    context?: vscode.ExtensionContext,
    editor?: vscode.WebviewPanel): Promise<string> {
    const useAsciidoctorJs = vscode.workspace.getConfiguration('asciidoc', null).get('use_asciidoctor_js')
    this.filename = doc.fileName
    if (useAsciidoctorJs) {
      return this.convertUsingJavascript(text, doc, forHTMLSave, backend, false, context, editor)
    }

    return this.convertUsingApplication(text, doc, forHTMLSave, backend)
  }
}
