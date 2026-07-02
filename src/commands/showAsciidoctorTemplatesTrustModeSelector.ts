import { Command } from '../core/commandManager.js'
import { AsciidoctorTemplatesTrustModeSelector } from '../features/security.js'

export class ShowAsciidoctorTemplatesTrustModeSelectorCommand
  implements Command
{
  public readonly id = 'asciidoc.showAsciidoctorTemplatesTrustModeSelector'

  constructor(
    private readonly asciidocTemplatesSecuritySelector: AsciidoctorTemplatesTrustModeSelector,
  ) {
    this.asciidocTemplatesSecuritySelector = asciidocTemplatesSecuritySelector
  }

  public execute() {
    this.asciidocTemplatesSecuritySelector.showSelector()
  }
}
