import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'

export class SaveDocbook implements Command {
  public readonly id = 'asciidoc.saveDocbook'

  constructor (private readonly engine: AsciidocEngine) {
    this.engine = engine
  }

  public async execute () {
    const editor = vscode.window.activeTextEditor
    if (editor === null || editor === undefined) { return }

    const textDocument = editor.document

    const docPath = path.parse(path.resolve(textDocument.fileName))
    let fsPath

    if (textDocument.isUntitled) {
      fsPath = path.join(docPath.dir, 'untitled.xml')
    } else {
      fsPath = path.join(docPath.dir, docPath.name + '.xml')
    }

    const { output } = await this.engine.export(textDocument, 'docbook5')

    fs.writeFile(fsPath, output, function (err) {
      if (err) {
        vscode.window.showErrorMessage('Error writing file ' + fsPath + '\n' + err.toString())
        return
      }
      vscode.window.showInformationMessage('Successfully converted to ', fsPath)
        .then((selection) => {
          if (selection === fsPath) {
            switch (process.platform) {
              // Use backticks for unix systems to run the open command directly
              // This avoids having to wrap the command AND path in quotes which
              // breaks if there is a single quote (') in the path
              case 'win32':
                exec(`"${fsPath.replace('"', '\\"')}"`)
                break
              case 'darwin':
                exec(`\`open "${fsPath.replace('"', '\\"')}" ; exit\``)
                break
              case 'linux':
                exec(`\`xdg-open "${fsPath.replace('"', '\\"')}" ; exit\``)
                break
              default:
                vscode.window.showWarningMessage('Output type is not supported')
                break
            }
          }
        })
    })
  }
}
