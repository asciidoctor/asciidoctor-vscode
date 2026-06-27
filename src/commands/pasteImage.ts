import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { Import } from './clipboardImage.js'

import Configuration = Import.Configuration

import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { resolveImagesDir } from '../features/imageInsertion.js'

export class PasteImage implements Command {
  public readonly id = 'asciidoc.pasteImage'

  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  public async execute() {
    try {
      const activeTextEditor = vscode.window.activeTextEditor
      if (activeTextEditor === undefined) {
        return
      }
      const configuration = new Configuration()
      configuration.ImagesDirectory = await getCurrentImagesDir(
        this.asciidocLoader,
        activeTextEditor.document,
        activeTextEditor.selection,
      )
      await Import.Image.importFromClipboard(configuration)
    } catch (e) {
      vscode.window.showErrorMessage(e)
    }
  }
}

/**
 * Reads the `:imagesdir:` attribute in effect at the cursor. Thin wrapper over
 * {@link resolveImagesDir}, which is position- and block-aware (see #879).
 */
export async function getCurrentImagesDir(
  asciidocLoader: AsciidocLoader,
  textDocument: vscode.TextDocument,
  selection: vscode.Selection,
): Promise<string> {
  return resolveImagesDir(
    asciidocLoader,
    textDocument,
    textDocument.offsetAt(selection.start),
  )
}
