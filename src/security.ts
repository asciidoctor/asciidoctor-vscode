import * as vscode from 'vscode'
import { AsciidocPreviewManager } from './features/previewManager'
import { getWorkspaceFolder, getWorkspaceFolders } from './util/workspace'

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
              ) + vscode.l10n.t('security.strict.title'),
            description: vscode.l10n.t('security.strict.description'),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
              ) + vscode.l10n.t('security.insecureLocalContent.title'),
            description: vscode.l10n.t(
              'security.insecureLocalContent.description',
            ),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowInsecureContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowInsecureContent,
              ) + vscode.l10n.t('security.insecureContent.title'),
            description: vscode.l10n.t('security.insecureContent.description'),
          },
          {
            type: AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
            label:
              markActiveWhen(
                currentSecurityLevel ===
                  AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
              ) + vscode.l10n.t('security.disable.title'),
            description: vscode.l10n.t('security.disable.description'),
          },
          {
            type: 'toggle',
            label: this.cspArbiter.shouldDisableSecurityWarnings()
              ? vscode.l10n.t('security.enableSecurityWarning.title')
              : vscode.l10n.t('security.disableSecurityWarning.title'),
            description: vscode.l10n.t(
              'security.toggleSecurityWarning.description',
            ),
          },
        ],
        {
          placeHolder: vscode.l10n.t(
            'security.showPreviewSecuritySelector.title',
          ),
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
            vscode.l10n.t(
              'security.restrictAsciidoctorExtensionsAuthors.title',
            ),
          description: vscode.l10n.t(
            'security.restrictAsciidoctorExtensionsAuthors.description',
          ),
        },
        {
          type: 'trust_asciidoctor_extensions_authors',
          label:
            markActiveWhen(asciidoctorExtensionsAuthorsTrusted === true) +
            vscode.l10n.t('security.trustAsciidoctorExtensionsAuthors.title'),
          description: vscode.l10n.t(
            'security.trustAsciidoctorExtensionsAuthors.description',
          ),
        },
      ],
      {
        placeHolder: vscode.l10n.t(
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
