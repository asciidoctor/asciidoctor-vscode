/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager'
import { AsciidocExtensionSecuritySelector } from '../security'

export class AsciidocExtensionSecuritySelectorCommand implements Command {
  public readonly id = 'asciidoc.showExtensionSecuritySelector'

  constructor (private readonly asciidocExtensionScriptsSecuritySelector: AsciidocExtensionSecuritySelector) {
    this.asciidocExtensionScriptsSecuritySelector = asciidocExtensionScriptsSecuritySelector
  }

  public execute () {
    this.asciidocExtensionScriptsSecuritySelector.showSelector()
  }
}
