import * as vscode from 'vscode';
import * as path from "path";
import { spawn } from "child_process";
import { isNullOrUndefined } from 'util';

const fileUrl = require('file-url');

const asciidoctor = require('@asciidoctor/core')()
const docbook = require('@asciidoctor/docbook-converter')
const kroki = require('asciidoctor-kroki')

const use_kroki = vscode.workspace.getConfiguration('asciidoc', null).get('use_kroki');
if (use_kroki)
  kroki.register(asciidoctor.Extensions);

export class AsciidocParser {
    public html: string = '';
    public document = null;
    private ext_path = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode').extensionPath;
    private stylesdir = path.join(this.ext_path, 'media')

    constructor(private readonly filename: string, private errorCollection: vscode.DiagnosticCollection = null) {
    }

    public getAttribute(name: string) {
      return isNullOrUndefined(this.document) ? null : this.document.getAttribute(name);
    }

    public async getMediaDir(text) {
      const match = text.match(new RegExp("^\\s*:mediadir:"));
      return match;
    }

    private async convert_using_javascript(text: string, doc: vscode.TextDocument, forHTMLSave: boolean, backend: string) {
      return new Promise<string>((resolve) => {
        const documentPath = path.dirname(path.resolve(doc.fileName));
        const workspacePath = vscode.workspace.workspaceFolders
        const contains_style = !isNullOrUndefined(text.match(new RegExp("^\\s*:(stylesheet|stylesdir):", "img")));
        const use_editor_stylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false);
        const preview_attributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {});
        const preview_style = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', "");
        const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRoot');
        const enableErrorDiagnostics = vscode.workspace.getConfiguration('asciidoc', null).get('enableErrorDiagnostics');

        let base_dir = documentPath;
        if (useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined') {
          base_dir = vscode.workspace.rootPath;
        }
        if(this.errorCollection) {
          this.errorCollection.clear();
        }

        const memoryLogger = asciidoctor.MemoryLogger.create();
        asciidoctor.LoggerManager.setLogger(memoryLogger);

        var attributes = {};

        if (contains_style) {
          attributes = { 'copycss': true }
        } else if (preview_style != "") {
          var stylesdir: string, stylesheet: string

          if (path.isAbsolute(preview_style)) {
            stylesdir = path.dirname(preview_style)
            stylesheet = path.basename(preview_style)
          } else {
            if (workspacePath == undefined) {
              stylesdir = documentPath
            } else  if (workspacePath.length > 0)  {
              stylesdir = workspacePath[0].uri.path
            }

            stylesdir = path.dirname(path.join(stylesdir, preview_style))
            stylesheet = path.basename(preview_style)
          }

          attributes = { 'copycss': true, 'stylesdir': stylesdir, 'stylesheet': stylesheet }
        } else if (use_editor_stylesheet && !forHTMLSave) {
          attributes = { 'copycss': true, 'stylesdir': this.stylesdir, 'stylesheet': 'asciidoctor-editor.css' }
        } else {
          // TODO: decide whether to use the included css or let ascidoctor.js decide
          // attributes = { 'copycss': true, 'stylesdir': this.stylesdir, 'stylesheet': 'asciidoctor-default.css@' }
        }

        Object.keys(preview_attributes).forEach((key) => {
          if (typeof preview_attributes[key] === "string") {
            attributes[key] = preview_attributes[key]
            if(workspacePath !== undefined) {
              attributes[key] = attributes[key].replace("${workspaceFolder}", workspacePath[0].uri.path);
            }
          }
        })

        attributes['env-vscode'] = ''

        if (backend.startsWith('docbook'))
          docbook.register()

        const options = {
          safe: 'unsafe',
          attributes: attributes,
          header_footer: true,
          to_file: false,
          base_dir: base_dir,
          sourcemap: true,
          backend: backend,
        }
        try {
          let ascii_doc = asciidoctor.load(text, options);
          this.document = ascii_doc;
          const blocksWithLineNumber = ascii_doc.findBy(function (b) { return typeof b.getLineNumber() !== 'undefined'; });
          blocksWithLineNumber.forEach(function (block, key, myArray) {
            block.addRole("data-line-" + block.getLineNumber());
          })
          let resultHTML = ascii_doc.convert(options);
          //let result = this.fixLinks(resultHTML);
          if (enableErrorDiagnostics) {
            let diagnostics = [];
            memoryLogger.getMessages().forEach((error) => {
              //console.log(error); //Error from asciidoctor.js
              let errorMessage = error.getText()
              let sourceLine = 0;
              let relatedFile = null;
              let relatedLine = 0;
              let diagnosticSource = "asciidoctor.js";
              // allocate to line 0 in the absence of information
              let sourceRange = doc.lineAt(0).range;
              const location = error.getSourceLocation();
              if (location) { //There is a source location
                if (location.getPath() == "<stdin>") { //error is within the file we are parsing
                  sourceLine = location.getLineNumber() - 1;
                  sourceRange = doc.lineAt(sourceLine).range;
                } else { //error is coming from an included file
                  relatedFile = error.getSourceLocation();
                  relatedLine = sourceLine - 1;
                  // try to find the include responsible from the info provided by asciidoctor.js
                  sourceLine = doc.getText().split('\n').indexOf(doc.getText().split('\n').find((str) => str.startsWith("include") && str.includes(error.message.source_location.path)));
                  if (sourceLine!=-1) {
                    sourceRange = doc.lineAt(sourceLine).range;
                  }
                }
              } else {
                // generic error (e.g. :source-highlighter: coderay)
                errorMessage = error.message;
              }
              let severity = vscode.DiagnosticSeverity.Information;
              if (error.severity=="WARN") {
                severity = vscode.DiagnosticSeverity.Warning
              } else if (error.severity=="ERROR") {
                severity = vscode.DiagnosticSeverity.Error
              } else if (error.severity=="DEBUG") {
                severity = vscode.DiagnosticSeverity.Information
              }
              let diagnosticRelated = null;
              if(relatedFile) {
                diagnosticRelated = [
                  new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(vscode.Uri.file(relatedFile.file),
                    new vscode.Position(0,0)
                    ),
                    errorMessage
                  ),
                ]
                errorMessage = "There was an error in an included file";
              }
              var diagnosticError = new vscode.Diagnostic(sourceRange, errorMessage, severity);
              diagnosticError.source = diagnosticSource;
              if (diagnosticRelated) {
                diagnosticError.relatedInformation = diagnosticRelated;
              }
              diagnostics.push(diagnosticError);
            });
            if(this.errorCollection) {
              this.errorCollection.set(vscode.Uri.parse(doc.fileName), diagnostics);
            }
          }
          resolve(resultHTML);
        }
        catch(e) {
          vscode.window.showErrorMessage(e.toString())
        }
      })
    }

    private async convert_using_application(text: string, doc: vscode.TextDocument, forHTMLSave: boolean, backend: string) {
      const documentPath = path.dirname(doc.fileName).replace('"', '\\"');
      const workspacePath = vscode.workspace.workspaceFolders
      const contains_style = !isNullOrUndefined(text.match(new RegExp("^\\s*:(stylesheet|stylesdir):", "img")));
      const use_editor_stylesheet = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle', false);
      const preview_attributes = vscode.workspace.getConfiguration('asciidoc', null).get('preview.attributes', {});
      const preview_style = vscode.workspace.getConfiguration('asciidoc', null).get('preview.style', "");
      const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRoot');
      this.document = null;

      let base_dir = documentPath;
      if (useWorkspaceAsBaseDir && typeof vscode.workspace.rootPath !== 'undefined') {
        base_dir = vscode.workspace.rootPath.replace('"', '\\"');
      }

      return new Promise<string>((resolve) => {
        let asciidoctor_command = vscode.workspace.getConfiguration('asciidoc', null).get('asciidoctor_command', 'asciidoctor');
        var RUBYOPT = process.env['RUBYOPT']
        if (RUBYOPT) {
          var prevOpt
          RUBYOPT = RUBYOPT.split(' ').reduce((acc, opt) => {
            acc.push(prevOpt == '-E' ? (prevOpt = 'UTF-8:UTF-8') : (prevOpt = opt))
            return acc
          }, []).join(' ')
        } else {
          RUBYOPT = '-E UTF-8:UTF-8'
        }
        var options = { shell: true, cwd: path.dirname(this.filename), env: { ...process.env, RUBYOPT } }

        var adoc_cmd_array = asciidoctor_command.split(/(\s+)/).filter( function(e) { return e.trim().length > 0; } ) ;
        var adoc_cmd = adoc_cmd_array[0]
        var adoc_cmd_args = adoc_cmd_array.slice(1)
        if (contains_style) {
          ; // Used an empty if to make it easier to use elses later
        } else if (preview_style != "") {
          var stylesdir: string, stylesheet: string

          if (path.isAbsolute(preview_style)) {
            stylesdir = path.dirname(preview_style)
            stylesheet = path.basename(preview_style)
          } else {
            if (workspacePath == undefined) {
              stylesdir = documentPath
            } else if (workspacePath.length > 0)  {
              stylesdir = workspacePath[0].uri.path
            }

            stylesdir = path.dirname(path.join(stylesdir, preview_style))
            stylesheet = path.basename(preview_style)
          }

          adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${stylesdir}`])
          adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesheet=${stylesheet}`])
        } else if (use_editor_stylesheet && !forHTMLSave) {
          adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${this.stylesdir}@`])
          adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'stylesheet=asciidoctor-editor.css@'])
        } else {
          // TODO: decide whether to use the included css or let ascidoctor decide
          // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${this.stylesdir}@`])
          // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'stylesheet=asciidoctor-default.css@'])
        }

        adoc_cmd_args.push.apply(adoc_cmd_args, ['-b', backend])

        Object.keys(preview_attributes).forEach((key) => {
          if (typeof preview_attributes[key] === "string") {
            var value: string = preview_attributes[key]
            if(workspacePath !== undefined) {
              value = value.replace("${workspaceFolder}", workspacePath[0].uri.path);
            }

            if (value.endsWith('!')) {
              adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `${value}`])
            } else {
              adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `${key}=${value}`])
            }
          }
        })

        adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'env-vscode'])

        adoc_cmd_args.push.apply(adoc_cmd_args, ['-q', '-B', '"' + base_dir + '"', '-o', '-', '-'])
        var asciidoctor = spawn(adoc_cmd, adoc_cmd_args, options);

        asciidoctor.stderr.on('data', (data) => {
          let errorMessage = data.toString();
          console.error(errorMessage);
          errorMessage += errorMessage.replace("\n", '<br><br>');
          errorMessage += "<br><br>"
          errorMessage += "<b>command:</b> " + adoc_cmd + " " + adoc_cmd_args.join(" ")
          errorMessage += "<br><br>"
          errorMessage += "<b>If the asciidoctor binary is not in your PATH, you can set the full path.<br>"
          errorMessage += "Go to `File -> Preferences -> User settings` and adjust the asciidoc.asciidoctor_command</b>"
          resolve(errorMessage);
        })
        var result_data = new Buffer('');
        /* with large outputs we can receive multiple calls */
        asciidoctor.stdout.on('data', (data) => {
          result_data = Buffer.concat([result_data, data as Buffer]);
        });
        asciidoctor.on('close', (code) => {
          //var result = this.fixLinks(result_data.toString());
          resolve(result_data.toString());
        })
        asciidoctor.stdin.write(text);
        asciidoctor.stdin.end();
      });
    }

    private fixLinks(html: string): string {
      let result = html.replace(
        new RegExp("((?:src|href)=[\'\"])(?!(?:http:|https:|ftp:|#))(.*?)([\'\"])", "gmi"),
        (subString: string, p1: string, p2: string, p3: string): string => {
          return [
            p1,
            fileUrl(path.join(
              path.dirname(this.filename),
              p2
            )),
            p3,
          ].join("");
        }
      );
      return result;
    }

    public async parseText(text: string, doc: vscode.TextDocument, forHTMLSave: boolean = false, backend: string = 'html'): Promise<string> {
      const use_asciidoctor_js = vscode.workspace.getConfiguration('asciidoc', null).get('use_asciidoctor_js');
      if (use_asciidoctor_js)
        return this.convert_using_javascript(text, doc, forHTMLSave, backend)
      else
        return this.convert_using_application(text, doc, forHTMLSave, backend)
    }

}
