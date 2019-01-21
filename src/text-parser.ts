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

export class AsciiDocParser {
    public html: string = '';
    public document = null;

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
            const contains_stylesheet = !isNullOrUndefined(text.match(new RegExp("^\\s*:stylesheet:", "img")));
            const use_default_stylesheet = vscode.workspace.getConfiguration('asciidoc').get('useDefaultStylesheet', false);
            const documentPath = path.dirname(path.resolve(doc.fileName));
            const ext_path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;
            const stylesdir = path.join(ext_path, 'assets')
            var attributes = {};
            if (contains_stylesheet || use_default_stylesheet)
                attributes = { 'copycss': true }
            else
                attributes = { 'copycss': true, 'stylesdir': stylesdir, 'stylesheet': 'asciidoctor.css' }
            const options = {
                safe: 'unsafe',
                doctype: 'article',
                attributes: attributes,
                header_footer: true,
                to_file: false,
                base_dir: documentPath,
                sourcemap: true,
            }
            let ascii_doc = asciidoctor.load(text, options);
            this.document = ascii_doc;
            const blocksWithLineNumber = ascii_doc.findBy(function (b) { return typeof b.getLineNumber() !== 'undefined'; });
            blocksWithLineNumber.forEach(function (block, key, myArray) {
                block.addRole("data-line-" + block.getLineNumber());
            })
            let resultHTML = ascii_doc.convert(options);
            //let result = this.fixLinks(resultHTML);
            resolve(resultHTML);
        })
    }

    private async convert_using_application(text: string) {
        const editor = vscode.window.activeTextEditor;
        const doc = editor.document;
        const documentPath = path.dirname(doc.fileName).replace('"', '\\"');
        this.document = null;

        return new Promise<string>(resolve => {
            let asciidoctor_command = vscode.workspace.getConfiguration('asciidoc').get('asciidoctor_command', 'asciidoctor');
            var options = { shell: true, cwd: path.dirname(this.filename) }

            var adoc_cmd_array = asciidoctor_command.split(/(\s+)/).filter( function(e) { return e.trim().length > 0; } ) ;
            var adoc_cmd = adoc_cmd_array[0]
            var adoc_cmd_args = adoc_cmd_array.slice(1)
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
