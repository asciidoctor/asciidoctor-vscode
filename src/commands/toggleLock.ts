/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager'
import { AsciidocPreviewManager } from '../features/previewManager'

export class ToggleLockCommand implements Command {
  public readonly id = 'asciidoc.preview.toggleLock'
  private readonly previewManager: AsciidocPreviewManager

  public execute () {
    this.previewManager.toggleLock()
  }
}
