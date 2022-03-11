import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'

export class SaveHTML implements Command {
  public readonly id = 'asciidoc.saveHTML'

  constructor (private readonly engine: AsciidocEngine) {
    this.engine = engine
  }

  public async execute () {
    const editor = vscode.window.activeTextEditor
    if (editor === null || editor === undefined) { return }

    const textDocument = editor.document

    const docPath = path.parse(path.resolve(textDocument.fileName))
    let htmlPath

    if (textDocument.isUntitled) {
      htmlPath = path.join(docPath.dir, 'untitled.html')
    } else {
      htmlPath = path.join(docPath.dir, docPath.name + '.html')
    }

    const { output: html } = await this.engine.export(textDocument, 'html5')

    fs.writeFile(htmlPath, html, function (err) {
      if (err) {
        vscode.window.showErrorMessage('Error writing file ' + htmlPath + '\n' + err.toString())
        return
      }
      vscode.window.showInformationMessage('Successfully converted to ', htmlPath)
        .then((selection) => {
          if (selection === htmlPath) {
            switch (process.platform) {
              // Use backticks for unix systems to run the open command directly
              // This avoids having to wrap the command AND path in quotes which
              // breaks if there is a single quote (') in the path
              case 'win32':
                exec(`"${htmlPath.replace('"', '\\"')}"`)
                break
              case 'darwin':
                exec(`\`open "${htmlPath.replace('"', '\\"')}" ; exit\``)
                break
              case 'linux':
                exec(`\`xdg-open "${htmlPath.replace('"', '\\"')}" ; exit\``)
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
