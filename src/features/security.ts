import * as vscode from 'vscode'
import { t as l10nT } from '../core/l10n.js'
import { getWorkspaceFolder, getWorkspaceFolders } from '../core/workspace.js'
import { AsciidocPreviewManager } from './preview/previewManager.js'

export const enum AsciidocPreviewSecurityLevel {
  Strict = 0,
  AllowInsecureContent = 1,
  AllowScriptsAndAllContent = 2,
  AllowInsecureLocalContent = 3,
}

export interface ContentSecurityPolicyArbiter {
  getSecurityLevelForResource(
    resource: vscode.Uri,
  ): AsciidocPreviewSecurityLevel

  setSecurityLevelForResource(
    resource: vscode.Uri,
    level: AsciidocPreviewSecurityLevel,
  ): Promise<void>

  shouldAllowSvgsForResource(resource: vscode.Uri): void

  shouldDisableSecurityWarnings(): boolean

  setShouldDisableSecurityWarning(shouldShow: boolean): Promise<void>
}

export class ExtensionContentSecurityPolicyArbiter
  implements ContentSecurityPolicyArbiter
{
  private readonly oldTrustedWorkspaceKey = 'trusted_preview_workspace:'
  private readonly securityLevelKey = 'preview_security_level:'
  private readonly shouldDisableSecurityWarningKey =
    'preview_should_show_security_warning:'

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
  ) {
    this.globalState = globalState
    this.workspaceState = workspaceState
  }

  public getSecurityLevelForResource(
    resource: vscode.Uri,
  ): AsciidocPreviewSecurityLevel {
    // Use new security level setting first
    const level = this.globalState.get<
      AsciidocPreviewSecurityLevel | undefined
    >(this.securityLevelKey + this.getRoot(resource), undefined)
    if (typeof level !== 'undefined') {
      return level
    }

    // Fallback to old trusted workspace setting
    if (
      this.globalState.get<boolean>(
        this.oldTrustedWorkspaceKey + this.getRoot(resource),
        false,
      )
    ) {
      return AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent
    }
    return AsciidocPreviewSecurityLevel.Strict
  }

  public async setSecurityLevelForResource(
    resource: vscode.Uri,
    level: AsciidocPreviewSecurityLevel,
  ): Promise<void> {
    return this.globalState.update(
      this.securityLevelKey + this.getRoot(resource),
      level,
    )
  }

  public shouldAllowSvgsForResource(resource: vscode.Uri) {
    const securityLevel = this.getSecurityLevelForResource(resource)
    return (
      securityLevel === AsciidocPreviewSecurityLevel.AllowInsecureContent ||
      securityLevel === AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent
    )
  }

  public shouldDisableSecurityWarnings(): boolean {
    return this.workspaceState.get<boolean>(
      this.shouldDisableSecurityWarningKey,
      false,
    )
  }

  public async setShouldDisableSecurityWarning(
    disabled: boolean,
  ): Promise<void> {
    return this.workspaceState.update(
      this.shouldDisableSecurityWarningKey,
      disabled,
    )
  }

  private getRoot(resource: vscode.Uri): vscode.Uri {
    const workspaceFolder = getWorkspaceFolders()
    if (workspaceFolder) {
      const folderForResource = getWorkspaceFolder(resource)
      if (folderForResource) {
        return folderForResource.uri
      }

      if (workspaceFolder.length) {
        return workspaceFolder[0].uri
      }
    }

    return resource
  }
}

export class PreviewSecuritySelector {
  public constructor(
    private readonly cspArbiter: ContentSecurityPolicyArbiter,
    private readonly webviewManager: AsciidocPreviewManager,
  ) {
    this.cspArbiter = cspArbiter
    this.webviewManager = webviewManager
  }

  public async showSecuritySelectorForResource(
    resource: vscode.Uri,
  ): Promise<void> {
    interface PreviewSecurityPickItem extends vscode.QuickPickItem {
      readonly type: 'moreinfo' | 'toggle' | AsciidocPreviewSecurityLevel
    }

    function markActiveWhen(when: boolean): string {
      return when ? '• ' : ''
    }

    const currentSecurityLevel =
      this.cspArbiter.getSecurityLevelForResource(resource)
    const selection =
      await vscode.window.showQuickPick<PreviewSecurityPickItem>(
        [
          {
            type: AsciidocPreviewSecurityLevel.Strict,
            label:
              markActiveWhen(
                currentSecurityLevel === AsciidocPreviewSecurityLevel.Strict,
              ) + l10nT('security.strict.title'),
            description: l10nT('security.strict.description'),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
              ) + l10nT('security.insecureLocalContent.title'),
            description: l10nT('security.insecureLocalContent.description'),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowInsecureContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowInsecureContent,
              ) + l10nT('security.insecureContent.title'),
            description: l10nT('security.insecureContent.description'),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
              ) + l10nT('security.disable.title'),
            description: l10nT('security.disable.description'),
          },
          {
            type: 'toggle',
            label: this.cspArbiter.shouldDisableSecurityWarnings()
              ? l10nT('security.enableSecurityWarning.title')
              : l10nT('security.disableSecurityWarning.title'),
            description: l10nT('security.toggleSecurityWarning.description'),
          },
        ],
        {
          placeHolder: l10nT('security.showPreviewSecuritySelector.title'),
        },
      )
    if (!selection) {
      return
    }

    if (selection.type === 'moreinfo') {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=854414'),
      )
      return
    }

    if (selection.type === 'toggle') {
      await this.cspArbiter.setShouldDisableSecurityWarning(
        !this.cspArbiter.shouldDisableSecurityWarnings(),
      )
      return
    }
    await this.cspArbiter.setSecurityLevelForResource(resource, selection.type)
    this.webviewManager.refresh()
  }
}

export class AsciidoctorExtensionsSecurityPolicyArbiter {
  private readonly allowAsciidoctorExtensionsKey =
    'asciidoc.allow_asciidoctor_extensions'
  public readonly trustAsciidoctorExtensionsAuthorsKey =
    'asciidoc.trust_asciidoctor_extensions_authors'

  // eslint-disable-next-line no-use-before-define
  private static instance: AsciidoctorExtensionsSecurityPolicyArbiter

  protected constructor(private readonly context: vscode.ExtensionContext) {
    this.context = context
  }

  public static activate(
    context: vscode.ExtensionContext,
  ): AsciidoctorExtensionsSecurityPolicyArbiter {
    AsciidoctorExtensionsSecurityPolicyArbiter.instance =
      new AsciidoctorExtensionsSecurityPolicyArbiter(context)
    return AsciidoctorExtensionsSecurityPolicyArbiter.instance
  }

  public static getInstance(): AsciidoctorExtensionsSecurityPolicyArbiter {
    if (!AsciidoctorExtensionsSecurityPolicyArbiter.instance) {
      throw new Error(
        'AsciidoctorExtensionsSecurityPolicyArbiter must be activated by calling #activate()',
      )
    }
    return AsciidoctorExtensionsSecurityPolicyArbiter.instance
  }

  public async enableAsciidoctorExtensions(): Promise<void> {
    return this.setAllowAsciidoctorExtensions(true)
  }

  public asciidoctorExtensionsAuthorsTrusted(): boolean {
    return this.context.workspaceState.get<boolean>(
      this.trustAsciidoctorExtensionsAuthorsKey,
      undefined,
    )
  }

  public async denyAsciidoctorExtensionsAuthors(): Promise<void> {
    return this.setTrustAsciidoctorExtensionsAuthors(false)
  }

  public async trustAsciidoctorExtensionsAuthors(): Promise<void> {
    return this.setTrustAsciidoctorExtensionsAuthors(true)
  }

  public async confirmAsciidoctorExtensionsTrustMode(
    extensionsCount: number,
  ): Promise<boolean> {
    const extensionsTrusted = this.asciidoctorExtensionsAuthorsTrusted()
    if (extensionsTrusted !== undefined) {
      // Asciidoctor.js extensions authors are already trusted or not, do not ask again.
      return extensionsTrusted
    }
    return this.showTrustAsciidoctorExtensionsDialog(extensionsCount)
  }

  private async showTrustAsciidoctorExtensionsDialog(
    extensionsCount: number,
  ): Promise<boolean> {
    const userChoice = await vscode.window.showWarningMessage(
      `This feature will execute ${extensionsCount} JavaScript ${extensionsCount > 1 ? 'files' : 'file'} from .asciidoctor/lib/**/*.js.
      Do you trust the authors of ${extensionsCount > 1 ? 'these files' : 'this file'}?`,
      // "modal" is disabled. Because, I couldn't control the button's order in Linux when "modal" is enabled.
      { title: 'Yes, I trust the authors', value: true },
      { title: "No, I don't trust the authors", value: false },
    )
    // if userChoice is undefined, no choice was selected, consider that we don't trust authors.
    const trustGranted = userChoice?.value || false
    await this.setTrustAsciidoctorExtensionsAuthors(trustGranted)
    return trustGranted
  }

  private async setAllowAsciidoctorExtensions(value: boolean): Promise<void> {
    return this.context.workspaceState.update(
      this.allowAsciidoctorExtensionsKey,
      value,
    )
  }

  private async setTrustAsciidoctorExtensionsAuthors(
    value: boolean,
  ): Promise<void> {
    return this.context.workspaceState.update(
      this.trustAsciidoctorExtensionsAuthorsKey,
      value,
    )
  }
}

/**
 * Consent gate for the templates auto-discovered under `.asciidoctor/templates`.
 *
 * Custom templates are executable code — a plain `.js`/`.cjs` template is
 * `require`d and run, and the supported template engines (Nunjucks, EJS, Pug, …)
 * can evaluate arbitrary expressions — so, exactly like the Asciidoctor.js
 * extensions discovered in `.asciidoctor/lib` (see
 * {@link AsciidoctorExtensionsSecurityPolicyArbiter}), they are only loaded once
 * the user has trusted the authors of the files in the workspace. Templates that
 * the user references explicitly through the `asciidoc.preview.templates` setting
 * are a deliberate opt-in and are not gated here.
 */
export class AsciidoctorTemplatesSecurityPolicyArbiter {
  public readonly trustAsciidoctorTemplatesAuthorsKey =
    'asciidoc.trust_asciidoctor_templates_authors'

  // eslint-disable-next-line no-use-before-define
  private static instance: AsciidoctorTemplatesSecurityPolicyArbiter

  protected constructor(private readonly context: vscode.ExtensionContext) {
    this.context = context
  }

  public static activate(
    context: vscode.ExtensionContext,
  ): AsciidoctorTemplatesSecurityPolicyArbiter {
    AsciidoctorTemplatesSecurityPolicyArbiter.instance =
      new AsciidoctorTemplatesSecurityPolicyArbiter(context)
    return AsciidoctorTemplatesSecurityPolicyArbiter.instance
  }

  public static getInstance(): AsciidoctorTemplatesSecurityPolicyArbiter {
    if (!AsciidoctorTemplatesSecurityPolicyArbiter.instance) {
      throw new Error(
        'AsciidoctorTemplatesSecurityPolicyArbiter must be activated by calling #activate()',
      )
    }
    return AsciidoctorTemplatesSecurityPolicyArbiter.instance
  }

  /**
   * @returns `true`/`false` once the user has answered, or `undefined` while no
   * decision has been recorded yet (so the caller knows to ask).
   */
  public asciidoctorTemplatesAuthorsTrusted(): boolean | undefined {
    return this.context.workspaceState.get<boolean>(
      this.trustAsciidoctorTemplatesAuthorsKey,
      undefined,
    )
  }

  public async denyAsciidoctorTemplatesAuthors(): Promise<void> {
    return this.setTrustAsciidoctorTemplatesAuthors(false)
  }

  public async trustAsciidoctorTemplatesAuthors(): Promise<void> {
    return this.setTrustAsciidoctorTemplatesAuthors(true)
  }

  public async confirmAsciidoctorTemplatesTrustMode(
    templatesCount: number,
  ): Promise<boolean> {
    const templatesTrusted = this.asciidoctorTemplatesAuthorsTrusted()
    if (templatesTrusted !== undefined) {
      // The templates authors are already trusted or not, do not ask again.
      return templatesTrusted
    }
    return this.showTrustAsciidoctorTemplatesDialog(templatesCount)
  }

  private async showTrustAsciidoctorTemplatesDialog(
    templatesCount: number,
  ): Promise<boolean> {
    const userChoice = await vscode.window.showWarningMessage(
      `This feature will execute ${templatesCount} template ${templatesCount > 1 ? 'files' : 'file'} from .asciidoctor/templates.
      Do you trust the authors of ${templatesCount > 1 ? 'these files' : 'this file'}?`,
      // "modal" is disabled. Because, I couldn't control the button's order in Linux when "modal" is enabled.
      { title: 'Yes, I trust the authors', value: true },
      { title: "No, I don't trust the authors", value: false },
    )
    // if userChoice is undefined, no choice was selected, consider that we don't trust authors.
    const trustGranted = userChoice?.value || false
    await this.setTrustAsciidoctorTemplatesAuthors(trustGranted)
    return trustGranted
  }

  private async setTrustAsciidoctorTemplatesAuthors(
    value: boolean,
  ): Promise<void> {
    return this.context.workspaceState.update(
      this.trustAsciidoctorTemplatesAuthorsKey,
      value,
    )
  }
}

export class AsciidoctorExtensionsTrustModeSelector {
  public async showSelector(): Promise<void> {
    const aespArbiter = AsciidoctorExtensionsSecurityPolicyArbiter.getInstance()
    const asciidoctorExtensionsAuthorsTrusted =
      aespArbiter.asciidoctorExtensionsAuthorsTrusted()

    interface ExtensionPickItem extends vscode.QuickPickItem {
      readonly type:
        | 'trust_asciidoctor_extensions_authors'
        | 'deny_asciidoctor_extensions_authors'
    }

    function markActiveWhen(when: boolean): string {
      return when ? '• ' : ''
    }

    const userChoice = await vscode.window.showQuickPick<ExtensionPickItem>(
      [
        {
          type: 'deny_asciidoctor_extensions_authors',
          label:
            markActiveWhen(asciidoctorExtensionsAuthorsTrusted === false) +
            l10nT('security.restrictAsciidoctorExtensionsAuthors.title'),
          description: l10nT(
            'security.restrictAsciidoctorExtensionsAuthors.description',
          ),
        },
        {
          type: 'trust_asciidoctor_extensions_authors',
          label:
            markActiveWhen(asciidoctorExtensionsAuthorsTrusted === true) +
            l10nT('security.trustAsciidoctorExtensionsAuthors.title'),
          description: l10nT(
            'security.trustAsciidoctorExtensionsAuthors.description',
          ),
        },
      ],
      {
        placeHolder: l10nT(
          'security.asciidoctorExtensionsTrustModeSelector.title',
        ),
      },
    )

    if (!userChoice) {
      return
    }
    if (userChoice.type === 'deny_asciidoctor_extensions_authors') {
      await aespArbiter.denyAsciidoctorExtensionsAuthors()
    }
    if (userChoice.type === 'trust_asciidoctor_extensions_authors') {
      await aespArbiter.enableAsciidoctorExtensions() // make sure that Asciidoctor.js extensions are enabled
      await aespArbiter.trustAsciidoctorExtensionsAuthors()
    }
  }
}

export class AsciidoctorTemplatesTrustModeSelector {
  public async showSelector(): Promise<void> {
    const arbiter = AsciidoctorTemplatesSecurityPolicyArbiter.getInstance()
    const asciidoctorTemplatesAuthorsTrusted =
      arbiter.asciidoctorTemplatesAuthorsTrusted()

    interface TemplatePickItem extends vscode.QuickPickItem {
      readonly type:
        | 'trust_asciidoctor_templates_authors'
        | 'deny_asciidoctor_templates_authors'
    }

    function markActiveWhen(when: boolean): string {
      return when ? '• ' : ''
    }

    const userChoice = await vscode.window.showQuickPick<TemplatePickItem>(
      [
        {
          type: 'deny_asciidoctor_templates_authors',
          label:
            markActiveWhen(asciidoctorTemplatesAuthorsTrusted === false) +
            l10nT('security.restrictAsciidoctorTemplatesAuthors.title'),
          description: l10nT(
            'security.restrictAsciidoctorTemplatesAuthors.description',
          ),
        },
        {
          type: 'trust_asciidoctor_templates_authors',
          label:
            markActiveWhen(asciidoctorTemplatesAuthorsTrusted === true) +
            l10nT('security.trustAsciidoctorTemplatesAuthors.title'),
          description: l10nT(
            'security.trustAsciidoctorTemplatesAuthors.description',
          ),
        },
      ],
      {
        placeHolder: l10nT(
          'security.asciidoctorTemplatesTrustModeSelector.title',
        ),
      },
    )

    if (!userChoice) {
      return
    }
    if (userChoice.type === 'deny_asciidoctor_templates_authors') {
      await arbiter.denyAsciidoctorTemplatesAuthors()
    }
    if (userChoice.type === 'trust_asciidoctor_templates_authors') {
      await arbiter.trustAsciidoctorTemplatesAuthors()
    }
  }
}
