import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { Import } from './clipboardImage.js'

import Configuration = Import.Configuration

import { logger } from '../core/logger.js'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { findImagesDirBeforeCursor } from '../features/imagesDir.js'

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
 * Reads the `:imagesdir:` [attribute](https://asciidoctor.org/docs/user-manual/#setting-the-location-of-images)
 * in effect at the cursor.
 *
 * The attribute can be redefined in the document body, and Asciidoctor applies
 * the value in effect at each location when rendering images. So we first scan
 * for the nearest `:imagesdir:` declared above the cursor — ignoring lines that
 * only appear inside a delimited block, which a naive scan would wrongly pick up
 * (https://github.com/asciidoctor/asciidoctor-vscode/issues/879). The parser's
 * `Document#getAttribute` cannot be used for this, as it only reports the header
 * value. We fall back to it only when no entry is found in the text, to catch an
 * `imagesdir` set elsewhere (e.g. `.asciidoctorconfig` or a setting).
 */
export async function getCurrentImagesDir(
  asciidocLoader: AsciidocLoader,
  textDocument: vscode.TextDocument,
  selection: vscode.Selection,
): Promise<string> {
  const cursorOffset = textDocument.offsetAt(selection.start)
  const imagesDir = findImagesDirBeforeCursor(
    textDocument.getText(),
    cursorOffset,
  )
  if (imagesDir !== undefined) {
    return imagesDir
  }

  // Resolving imagesdir must never interrupt the paste: if the parse fails, log
  // it and degrade to an empty imagesdir (the document's own directory) rather
  // than surfacing an error to the user.
  try {
    const document = await asciidocLoader.load(textDocument)
    return document.getAttribute('imagesdir', '')
  } catch (err) {
    logger.warn(`Unable to resolve the imagesdir attribute, cause: ${err}`)
    return ''
  }
}
