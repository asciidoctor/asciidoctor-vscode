import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { isNullOrUndefined } from 'util'
import { AsciidocParser } from '../text-parser'
import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'

export class SaveHTML implements Command {
    public readonly id = 'asciidoc.saveHTML'

	constructor(
		private readonly engine: AsciidocEngine
	) { }

    public async execute() {
        const editor = vscode.window.activeTextEditor
        if(isNullOrUndefined(editor))
            return

        const doc = editor.document
        const text = doc.getText()

        const docPath = path.parse(path.resolve(doc.fileName))
        let htmlPath

        if (doc.isUntitled) {
            htmlPath = path.join(docPath.root, docPath.dir, "untitled.html")
        } else {
            htmlPath = path.join(docPath.root, docPath.dir, docPath.name+".html")
        }

        let parser = new AsciidocParser(path.resolve(doc.fileName))
        const html = await this.engine.render(doc.uri, true, text, true)

        fs.writeFile(htmlPath, html, function(err) {
            if(err) {
                vscode.window.showErrorMessage('Error writing file ' + htmlPath + "\n" + err.toString())
                return
            }
            vscode.window.showInformationMessage('Successfully converted to ', htmlPath)
                .then(selection => {
                    if (selection === htmlPath) {
                        vscode.env.openExternal(vscode.Uri.parse(htmlPath))
                    }
                });    
        });
    }
}
