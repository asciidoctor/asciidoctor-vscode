import { Command } from '../commandManager'
import { window } from 'vscode'
import { Import } from '../image-paste'

export class PasteImage implements Command {
  public readonly id = 'asciidoc.pasteImage'

  public execute () {
    try {
      Import.Image.importFromClipboard(undefined)
    } catch (e) {
      window.showErrorMessage(e)
    }
  }
}
