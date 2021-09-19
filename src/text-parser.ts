import * as vscode from 'vscode'
import * as path from 'path'
import { spawn } from 'child_process'

const asciidoctor = require('@asciidoctor/core')()
const docbook = require('@asciidoctor/docbook-converter')
const kroki = require('asciidoctor-kroki')
const highlightjsAdapter = require('./highlightjs-adapter')
highlightjsAdapter.register(asciidoctor)

const useKroki = vscode.workspace.getConfiguration('asciidoc', null).get('use_kroki')
if (useKroki) {
  kroki.register(asciidoctor.Extensions)
}

export class AsciidocParser {
    public html: string = ''
    public document = null
    private extPath = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode').extensionPath
    private stylesdir = path.join(this.extPath, 'media')

    constructor (private readonly filename: string, private errorCollection: vscode.DiagnosticCollection = null) {
      this.filename = filename
      this.errorCollection = errorCollection
    }

    public getAttribute (name: string) {
      return (this.document == null) ? null : this.document.getAttribute(name)
    }

    public async getMediaDir (text) {
      const match = text.match(/^\\s*:mediadir:/)
      return match
    }

    private async convertUsingJavascript (text: string, doc: vscode.TextDocument, forHTMLSave: boolean, backend: string) {
      return new Promise<string>((resolve) => {
        const documentPath = path.dirname(path.resolve(doc.fileName))
        const workspacePath = vscode.workspace.workspaceFolders
        const containsStyle = !(text.match(/'^\\s*:(stylesheet|stylesdir)/img) == null)
        const useEditorStylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false)
        const previewAttributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {})
        const previewStyle = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', '')
        const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRoot')
        const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc', null).get('enableErrorDiagnostics')

        let baseDir = documentPath
        if (useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined') {
          baseDir = vscode.workspace.rootPath
        }
        if (this.errorCollection) {
          this.errorCollection.clear()
        }

        const memoryLogger = asciidoctor.MemoryLogger.create()
        asciidoctor.LoggerManager.setLogger(memoryLogger)

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
              stylesdir = documentPath
            } else if (workspacePath.length > 0) {
              stylesdir = workspacePath[0].uri.path
            }

            stylesdir = path.dirname(path.join(stylesdir, previewStyle))
            stylesheet = path.basename(previewStyle)
          }

          attributes = { copycss: true, stylesdir: stylesdir, stylesheet: stylesheet }
        } else if (useEditorStylesheet && !forHTMLSave) {
          attributes = { copycss: true, stylesdir: this.stylesdir, stylesheet: 'asciidoctor-editor.css' }
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

        if (backend.startsWith('docbook')) { docbook.register() }

        const options = {
          safe: 'unsafe',
          attributes: attributes,
          header_footer: true,
          to_file: false,
          baseDir: baseDir,
          sourcemap: true,
          backend: backend,
        }
        try {
          const asciiDoc = asciidoctor.load(text, options)
          this.document = asciiDoc
          const blocksWithLineNumber = asciiDoc.findBy(function (b) { return typeof b.getLineNumber() !== 'undefined' })
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          blocksWithLineNumber.forEach(function (block, key, myArray) {
            block.addRole('data-line-' + block.getLineNumber())
          })
          const resultHTML = asciiDoc.convert(options)
          //let result = this.fixLinks(resultHTML);
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
              this.errorCollection.set(vscode.Uri.parse(doc.fileName), diagnostics)
            }
          }
          resolve(resultHTML)
        } catch (e) {
          vscode.window.showErrorMessage(e.toString())
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
        const options = { shell: true, cwd: path.dirname(this.filename), env: { ...process.env, RUBYOPT } }

        const adocCmdArray = asciidoctorCommand.split(/(\s+)/).filter(function (e) { return e.trim().length > 0 })
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
        const asciidoctor = spawn(adocCmd, adocCmdArgs, options)

        asciidoctor.stderr.on('data', (data) => {
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
        asciidoctor.stdout.on('data', (data) => {
          resultData = Buffer.concat([resultData, data as Buffer])
        })
        asciidoctor.on('close', (_code) => {
          //var result = this.fixLinks(result_data.toString());
          resolve(resultData.toString())
        })
        asciidoctor.stdin.write(text)
        asciidoctor.stdin.end()
      })
    }

    public async parseText (text: string, doc: vscode.TextDocument, forHTMLSave: boolean = false, backend: string = 'html'): Promise<string> {
      const useAsciidoctorJS = vscode.workspace.getConfiguration('asciidoc', null).get('use_asciidoctor_js')
      if (useAsciidoctorJS) {
        return this.convertUsingJavascript(text, doc, forHTMLSave, backend)
      } else {
        return this.convertUsingApplication(text, doc, forHTMLSave, backend)
      }
    }
}
