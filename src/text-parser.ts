import * as vscode from 'vscode';
import * as path from "path";
import * as Asciidoctor from "asciidoctor.js";
import { spawn } from "child_process";
import { isNullOrUndefined } from 'util';
import * as npm_which from "npm-which";

const fileUrl = require('file-url');
const Viz = require("viz.js");
var which = npm_which(__dirname) // __dirname often good enough

const asciidoctor = Asciidoctor();


const plantuml = require('asciidoctor-plantuml');
plantuml.register(asciidoctor.Extensions);

asciidoctor.Extensions.register(function () {
    this.block(function () {
        const self = this;
        self.named('graphviz');
        self.onContext('literal');
        self.process(function (parent, reader, attrs) {
            var svg = Viz(reader.getString());
            return self.createBlock(parent, 'pass', svg);
        });
    });
});


asciidoctor.Extensions.register(function () {
    this.block(function () {
        const self = this;
        self.named('mermaid');
        self.onContext('literal');
        self.process(function (parent, reader, attrs) {
            const txt = reader.getString();
            const html = `<div class="mermaid">${txt}</div>`
            return self.createBlock(parent, 'pass', html);
        });
    });
});

export class AsciidocParser {
    public html: string = '';
    public document = null;
    private ext_path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;
    private stylesdir = path.join(this.ext_path, 'media')

    constructor(private readonly filename: string) {
    }

    public getAttribute(name: string) {
        return isNullOrUndefined(this.document) ? null : this.document.getAttribute(name);
    }

    public async getMediaDir(text) {
        const match = text.match(new RegExp("^\\s*:mediadir:"));
        return match;
    }

    private async convert_using_javascript(text: string) {
        return new Promise<string>(resolve => {
            const editor = vscode.window.activeTextEditor;
            const doc = editor.document;
            const documentPath = path.dirname(path.resolve(doc.fileName));
            const workspacePath = vscode.workspace.workspaceFolders
            const contains_style = !isNullOrUndefined(text.match(new RegExp("^\\s*:(stylesheet|stylesdir):", "img")));
            const use_editor_stylesheet = vscode.workspace.getConfiguration('asciidoc').get('preview.useEditorStyle', false);
            const preview_attributes = vscode.workspace.getConfiguration('asciidoc').get('preview.attributes', {});
            const preview_style = vscode.workspace.getConfiguration('asciidoc').get('preview.style', "");

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
            } else if (use_editor_stylesheet) {
                attributes = { 'copycss': true, 'stylesdir': this.stylesdir, 'stylesheet': 'asciidoctor-editor.css' }
            } else {
                // TODO: decide whether to use the included css or let ascidoctor.js decide
                // attributes = { 'copycss': true, 'stylesdir': this.stylesdir, 'stylesheet': 'asciidoctor-default.css@' }
            }

            Object.keys(preview_attributes).forEach(key => {
                if (typeof preview_attributes[key] === "string") {
                    attributes[key] = preview_attributes[key];
                }
            })

            const options = {
                safe: 'unsafe',
                doctype: 'article',
                attributes: attributes,
                header_footer: true,
                to_file: false,
                base_dir: documentPath,
                sourcemap: true,
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
                resolve(resultHTML);
            }
            catch(e) {
                vscode.window.showErrorMessage(e.toString())
            }
        })
    }

    private async convert_using_application(text: string) {
        const editor = vscode.window.activeTextEditor;
        const doc = editor.document;
        const documentPath = path.dirname(doc.fileName).replace('"', '\\"');
        const workspacePath = vscode.workspace.workspaceFolders
        const contains_style = !isNullOrUndefined(text.match(new RegExp("^\\s*:(stylesheet|stylesdir):", "img")));
        const use_editor_stylesheet = vscode.workspace.getConfiguration('asciidoc').get('preview.useEditorStyle', false);
        const preview_attributes = vscode.workspace.getConfiguration('asciidoc').get('preview.attributes', {});
        const preview_style = vscode.workspace.getConfiguration('asciidoc').get('preview.style', "");
        this.document = null;

        return new Promise<string>(resolve => {
            let asciidoctor_command = vscode.workspace.getConfiguration('asciidoc').get('asciidoctor_command', 'asciidoctor');
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
            } else if (use_editor_stylesheet) {
                adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${this.stylesdir}@`])
                adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'stylesheet=asciidoctor-editor.css@'])
            } else {
                // TODO: decide whether to use the included css or let ascidoctor decide
                // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `stylesdir=${this.stylesdir}@`])
                // adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', 'stylesheet=asciidoctor-default.css@'])
            }

            Object.keys(preview_attributes).forEach(key => {
                if (typeof preview_attributes[key] === "string") {
                    var value: string = preview_attributes[key]

                    if (value.endsWith('!')) {
                        adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `${value}`])
                    } else {
                        adoc_cmd_args.push.apply(adoc_cmd_args, ['-a', `${key}=${value}`])
                    }
                }
            })

            adoc_cmd_args.push.apply(adoc_cmd_args, ['-q', '-o-', '-', '-B', '"' + documentPath + '"'])
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
            var result_data = ''
            /* with large outputs we can receive multiple calls */
            asciidoctor.stdout.on('data', (data) => {
                result_data += data.toString();
            });
            asciidoctor.on('close', (code) => {
                //var result = this.fixLinks(result_data);
                resolve(result_data);
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
                    p3
                ].join("");
            }
        );
        return result;
    }

    public async parseText(text: string): Promise<string> {
        const use_asciidoctor_js = vscode.workspace.getConfiguration('asciidoc').get('use_asciidoctor_js');
        if (use_asciidoctor_js)
            return this.convert_using_javascript(text)
        else
            return this.convert_using_application(text)
    }

}
