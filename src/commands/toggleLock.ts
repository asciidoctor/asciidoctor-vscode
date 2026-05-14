/*---------------------------------------------------------------------------------------------
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager.js'
import { AsciidocPreviewManager } from '../features/previewManager.js'

export class ToggleLockCommand implements Command {
  public readonly id = 'asciidoc.preview.toggleLock'

  public constructor(private readonly previewManager: AsciidocPreviewManager) {
    this.previewManager = previewManager
  }

  public execute() {
    this.previewManager.toggleLock()
  }
}
