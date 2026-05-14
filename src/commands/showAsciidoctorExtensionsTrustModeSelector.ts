import { Command } from '../commandManager.js'
import { AsciidoctorExtensionsTrustModeSelector } from '../security.js'

export class ShowAsciidoctorExtensionsTrustModeSelectorCommand
  implements Command
{
  public readonly id = 'asciidoc.showAsciidoctorExtensionsTrustModeSelector'

  constructor(
    private readonly asciidocExtensionScriptsSecuritySelector: AsciidoctorExtensionsTrustModeSelector,
  ) {
    this.asciidocExtensionScriptsSecuritySelector =
      asciidocExtensionScriptsSecuritySelector
  }

  public execute() {
    this.asciidocExtensionScriptsSecuritySelector.showSelector()
  }
}
