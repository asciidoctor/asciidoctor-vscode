import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { t as l10nT } from '../core/l10n.js'

const deprecationNoticeShownKey = 'asciidoc.pasteImage.deprecationNoticeShown'

/**
 * Deprecated. Pasting an image is now handled by the standard paste
 * (<kbd>Ctrl/Cmd</kbd>+<kbd>V</kbd>) through `PasteImageIntoEditorProvider`,
 * which works for both image files and bitmaps without the platform-specific
 * clipboard scripts this command used to rely on.
 *
 * The command id is kept so the historical <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>
 * keybinding — and any user keybinding or task that references
 * `asciidoc.pasteImage` — keeps working: it shows a one-time deprecation notice
 * and then delegates to the normal paste (which runs the paste provider).
 */
export class PasteImage implements Command {
  public readonly id = 'asciidoc.pasteImage'

  constructor(private readonly globalState: vscode.Memento) {}

  public async execute() {
    if (!this.globalState.get(deprecationNoticeShownKey, false)) {
      this.globalState.update(deprecationNoticeShownKey, true)
      vscode.window.showInformationMessage(l10nT('pasteImage.deprecated'))
    }
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction')
  }
}
