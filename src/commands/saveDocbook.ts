import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from "child_process"
import { isNullOrUndefined } from 'util'
import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'

export class SaveDocbook implements Command {
    public readonly id = 'asciidoc.saveDocbook'

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
      let fsPath

      if (doc.isUntitled) {
        fsPath = path.join(docPath.dir, "untitled.xml")
      } else {
        fsPath = path.join(docPath.dir, docPath.name+".xml")
      }

      const config = vscode.workspace.getConfiguration('asciidoc', doc.uri);
      const docbookVersion = config.get<string>('saveDocbook.docbookVersion', 'docbook5');

      const output = await this.engine.render(doc.uri, true, text, true, docbookVersion)

      fs.writeFile(fsPath, output, function(err) {
        if(err) {
          vscode.window.showErrorMessage('Error writing file ' + fsPath + "\n" + err.toString())
          return
        }
        vscode.window.showInformationMessage('Successfully converted to ', fsPath)
          .then((selection) => {
            if (selection === fsPath) {
              switch (process.platform)
              {
              // Use backticks for unix systems to run the open command directly
              // This avoids having to wrap the command AND path in quotes which
              // breaks if there is a single quote (') in the path
              case 'win32':
                exec(`"${fsPath.replace('"', '\\"')}"`);
                break;
              case 'darwin':
                exec(`\`open "${fsPath.replace('"', '\\"')}" ; exit\``);
                break;
              case 'linux':
                exec(`\`xdg-open "${fsPath.replace('"', '\\"')}" ; exit\``);
                break;
              default:
                vscode.window.showWarningMessage("Output type is not supported");
                break;
              }
            }
          });
      });
    }
}
