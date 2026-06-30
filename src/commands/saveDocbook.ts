import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'
import {
  resolveAsciidocDocument,
  WebviewContext,
} from './resolveAsciidocDocument.js'

export class SaveDocbook implements Command {
  public readonly id = 'asciidoc.saveDocbook'

  constructor(
    private readonly engine: AsciidocEngine,
    private readonly previewManager: AsciidocPreviewManager,
  ) {
    this.engine = engine
  }

  public async execute(context?: WebviewContext) {
    const textDocument = await resolveAsciidocDocument(
      this.previewManager,
      context,
    )
    if (!textDocument) {
      return
    }

    const docPath = path.parse(path.resolve(textDocument.fileName))
    const fsPath = textDocument.isUntitled
      ? path.join(docPath.dir, 'untitled.xml')
      : path.join(docPath.dir, docPath.name + '.xml')

    const { output } = await this.engine.export(textDocument, 'docbook5')

    fs.writeFile(fsPath, output, function (err) {
      if (err) {
        vscode.window.showErrorMessage(
          'Error writing file ' + fsPath + '\n' + err.toString(),
        )
        return
      }
      vscode.window
        .showInformationMessage('Successfully converted to DocBook 5', fsPath)
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
