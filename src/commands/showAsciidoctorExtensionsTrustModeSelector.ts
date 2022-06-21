/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager'
import { AsciidoctorExtensionsTrustModeSelector } from '../security'

export class ShowAsciidoctorExtensionsTrustModeSelectorCommand implements Command {
  public readonly id = 'asciidoc.showAsciidoctorExtensionsTrustModeSelector'

  constructor (private readonly asciidocExtensionScriptsSecuritySelector: AsciidoctorExtensionsTrustModeSelector) {
    this.asciidocExtensionScriptsSecuritySelector = asciidocExtensionScriptsSecuritySelector
  }

  public execute () {
    this.asciidocExtensionScriptsSecuritySelector.showSelector()
  }
}
