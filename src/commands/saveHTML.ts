import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'
import {
  hasMermaidBlocks,
  injectMermaidExportScript,
} from '../features/preview/mermaidExport.js'
import {
  resolveAsciidocDocument,
  WebviewContext,
} from './resolveAsciidocDocument.js'

export class SaveHTML implements Command {
  public readonly id = 'asciidoc.saveHTML'

  constructor(
    private readonly engine: AsciidocEngine,
    private readonly previewManager: AsciidocPreviewManager,
    private readonly extensionUri: vscode.Uri,
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
    let htmlPath

    if (textDocument.isUntitled) {
      htmlPath = path.join(docPath.dir, 'untitled.html')
    } else {
      htmlPath = path.join(docPath.dir, docPath.name + '.html')
    }

    const { output: exportedHtml } = await this.engine.export(
      textDocument,
      'html5',
    )
    const html = await this.withBundledMermaid(exportedHtml)

    fs.writeFile(htmlPath, html, function (err) {
      if (err) {
        vscode.window.showErrorMessage(
          'Error writing file ' + htmlPath + '\n' + err.toString(),
        )
        return
      }
      vscode.window
        .showInformationMessage('Successfully converted to ', htmlPath)
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

  private async withBundledMermaid(html: string): Promise<string> {
    if (!hasMermaidBlocks(html)) {
      return html
    }
    const mermaidBundle = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(
        this.extensionUri,
        'media',
        'mermaid',
        'export',
        'mermaid-export.js',
      ),
    )
    return injectMermaidExportScript(
      html,
      new TextDecoder().decode(mermaidBundle),
    )
  }
}
