/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocPreviewManager } from './features/previewManager'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export const enum AsciidocPreviewSecurityLevel {
  Strict = 0,
  AllowInsecureContent = 1,
  AllowScriptsAndAllContent = 2,
  AllowInsecureLocalContent = 3
}

export interface ContentSecurityPolicyArbiter {
  getSecurityLevelForResource(resource: vscode.Uri): AsciidocPreviewSecurityLevel;

  setSecurityLevelForResource(resource: vscode.Uri, level: AsciidocPreviewSecurityLevel): Promise<void>;

  shouldAllowSvgsForResource(resource: vscode.Uri): void;

  shouldDisableSecurityWarnings(): boolean;

  setShouldDisableSecurityWarning(shouldShow: boolean): Promise<void>;
}

export class ExtensionContentSecurityPolicyArbiter implements ContentSecurityPolicyArbiter {
  private readonly oldTrustedWorkspaceKey = 'trusted_preview_workspace:'
  private readonly securityLevelKey = 'preview_security_level:'
  private readonly shouldDisableSecurityWarningKey = 'preview_should_show_security_warning:'

  constructor (
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento
  ) {
    this.globalState = globalState
    this.workspaceState = workspaceState
  }

  public getSecurityLevelForResource (resource: vscode.Uri): AsciidocPreviewSecurityLevel {
    // Use new security level setting first
    const level = this.globalState.get<AsciidocPreviewSecurityLevel | undefined>(this.securityLevelKey + this.getRoot(resource), undefined)
    if (typeof level !== 'undefined') {
      return level
    }

    // Fallback to old trusted workspace setting
    if (this.globalState.get<boolean>(this.oldTrustedWorkspaceKey + this.getRoot(resource), false)) {
      return AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent
    }
    return AsciidocPreviewSecurityLevel.Strict
  }

  public async setSecurityLevelForResource (resource: vscode.Uri, level: AsciidocPreviewSecurityLevel): Promise<void> {
    return this.globalState.update(this.securityLevelKey + this.getRoot(resource), level)
  }

  public shouldAllowSvgsForResource (resource: vscode.Uri) {
    const securityLevel = this.getSecurityLevelForResource(resource)
    return securityLevel === AsciidocPreviewSecurityLevel.AllowInsecureContent || securityLevel === AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent
  }

  public shouldDisableSecurityWarnings (): boolean {
    return this.workspaceState.get<boolean>(this.shouldDisableSecurityWarningKey, false)
  }

  public async setShouldDisableSecurityWarning (disabled: boolean): Promise<void> {
    return this.workspaceState.update(this.shouldDisableSecurityWarningKey, disabled)
  }

  private getRoot (resource: vscode.Uri): vscode.Uri {
    if (vscode.workspace.workspaceFolders) {
      const folderForResource = vscode.workspace.getWorkspaceFolder(resource)
      if (folderForResource) {
        return folderForResource.uri
      }

      if (vscode.workspace.workspaceFolders.length) {
        return vscode.workspace.workspaceFolders[0].uri
      }
    }

    return resource
  }
}

export class PreviewSecuritySelector {
  public constructor (private readonly cspArbiter: ContentSecurityPolicyArbiter,
    private readonly webviewManager: AsciidocPreviewManager
  ) {
    this.cspArbiter = cspArbiter
    this.webviewManager = webviewManager
  }

  public async showSecuritySelectorForResource (resource: vscode.Uri): Promise<void> {
    interface PreviewSecurityPickItem extends vscode.QuickPickItem {
      readonly type: 'moreinfo' | 'toggle' | AsciidocPreviewSecurityLevel;
    }

    function markActiveWhen (when: boolean): string {
      return when ? '• ' : ''
    }

    const currentSecurityLevel = this.cspArbiter.getSecurityLevelForResource(resource)
    const selection = await vscode.window.showQuickPick<PreviewSecurityPickItem>(
      [
        {
          type: AsciidocPreviewSecurityLevel.Strict,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.Strict) + localize('security.strict.title', 'Strict'),
          description: localize('security.strict.description', 'Only load secure content.'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowInsecureLocalContent) + localize('security.insecureLocalContent.title', 'Allow insecure local content'),
          description: localize('security.insecureLocalContent.description', 'Enable loading content over HTTP served from localhost.'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowInsecureContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowInsecureContent) + localize('security.insecureContent.title', 'Allow insecure content'),
          description: localize('security.insecureContent.description', 'Enable loading content over HTTP.'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent) + localize('security.disable.title', 'Disable'),
          description: localize('security.disable.description', 'Allow all content and script execution. Not recommended.'),
        }, {
          type: 'toggle',
          label: this.cspArbiter.shouldDisableSecurityWarnings()
            ? localize('security.enableSecurityWarning.title', 'Enable preview security warnings in this workspace')
            : localize('security.disableSecurityWarning.title', 'Disable preview security warning in this workspace'),
          description: localize('security.toggleSecurityWarning.description', 'Please note that it does not affect the content security level.'),
        },
      ], {
        placeHolder: localize(
          'security.showPreviewSecuritySelector.title',
          'Select security settings for Asciidoc previews in this workspace.'),
      })
    if (!selection) {
      return
    }

    if (selection.type === 'moreinfo') {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=854414'))
      return
    }

    if (selection.type === 'toggle') {
      await this.cspArbiter.setShouldDisableSecurityWarning(!this.cspArbiter.shouldDisableSecurityWarnings())
      return
    }
    await this.cspArbiter.setSecurityLevelForResource(resource, selection.type)
    this.webviewManager.refresh()
  }
}

export class AsciidoctorExtensionsSecurityPolicyArbiter {
  private readonly allowAsciidoctorExtensionsKey = 'asciidoc.allow_asciidoctor_extensions'
  public readonly trustAsciidoctorExtensionsAuthorsKey = 'asciidoc.trust_asciidoctor_extensions_authors'

  constructor (private readonly context: vscode.ExtensionContext) {
    this.context = context
  }

  public asciidoctorExtensionsAllowed (): boolean {
    return this.context.workspaceState.get<boolean>(this.allowAsciidoctorExtensionsKey, false)
  }

  public async enableAsciidoctorExtensions (): Promise<void> {
    return this.setAllowAsciidoctorExtensions(true)
  }

  public async disableAsciidoctorExtensions (): Promise<void> {
    return this.setAllowAsciidoctorExtensions(false)
  }

  public asciidoctorExtensionsAuthorsTrusted (): boolean {
    return this.context.workspaceState.get<boolean>(this.trustAsciidoctorExtensionsAuthorsKey, undefined)
  }

  public async denyAsciidoctorExtensionsAuthors (): Promise<void> {
    return this.setTrustAsciidoctorExtensionsAuthors(false)
  }

  public async trustAsciidoctorExtensionsAuthors (): Promise<void> {
    return this.setTrustAsciidoctorExtensionsAuthors(true)
  }

  public async confirmAsciidoctorExtensionsTrustMode (extensionsCount: number): Promise<boolean> {
    const extensionsTrusted = this.asciidoctorExtensionsAuthorsTrusted()
    if (extensionsTrusted !== undefined) {
      // Asciidoctor.js extensions authors are already trusted or not, do not ask again.
      return extensionsTrusted
    }
    return this.showTrustAsciidoctorExtensionsDialog(extensionsCount)
  }

  private async showTrustAsciidoctorExtensionsDialog (extensionsCount: number): Promise<boolean> {
    const userChoice = await vscode.window.showWarningMessage(
      `This feature will execute ${extensionsCount} JavaScript ${extensionsCount > 1 ? 'files' : 'file'} from .asciidoctor/lib/**/*.js.
      Do you trust the authors of ${extensionsCount > 1 ? 'these files' : 'this file'}?`,
      // "modal" is disabled. Because, I couldn't control the button's order in Linux when "modal" is enabled.
      { title: 'Yes, I trust the authors', value: true },
      { title: 'No, I don\'t trust the authors', value: false })
    // if userChoice is undefined, no choice was selected, consider that we don't trust authors.
    const trustGranted = userChoice?.value || false
    await this.setTrustAsciidoctorExtensionsAuthors(trustGranted)
    return trustGranted
  }

  private async setAllowAsciidoctorExtensions (value: boolean): Promise<void> {
    return this.context.workspaceState.update(this.allowAsciidoctorExtensionsKey, value)
  }

  private async setTrustAsciidoctorExtensionsAuthors (value: boolean): Promise<void> {
    return this.context.workspaceState.update(this.trustAsciidoctorExtensionsAuthorsKey, value)
  }
}

export class AsciidoctorExtensionsTrustModeSelector {
  constructor (
    private readonly aespArbiter: AsciidoctorExtensionsSecurityPolicyArbiter
  ) {
    this.aespArbiter = aespArbiter
  }

  public async showSelector (): Promise<void> {
    const asciidoctorExtensionsAuthorsTrusted = this.aespArbiter.asciidoctorExtensionsAuthorsTrusted()

    interface ExtensionPickItem extends vscode.QuickPickItem {
      readonly type: 'trust_asciidoctor_extensions_authors' | 'deny_asciidoctor_extensions_authors';
    }

    function markActiveWhen (when: boolean): string {
      return when ? '• ' : ''
    }

    const userChoice = await vscode.window.showQuickPick<ExtensionPickItem>(
      [
        {
          type: 'deny_asciidoctor_extensions_authors',
          label: markActiveWhen(asciidoctorExtensionsAuthorsTrusted === false) + localize('security.restrictAsciidoctorExtensionsAuthors.title', 'Untrusted'),
          description: localize('security.restrictAsciidoctorExtensionsAuthors.description', 'Prevent code execution by disabling Asciidoctor.js extensions.'),
        }, {
          type: 'trust_asciidoctor_extensions_authors',
          label: markActiveWhen(asciidoctorExtensionsAuthorsTrusted === true) + localize('security.trustAsciidoctorExtensionsAuthors.title', 'Trusted'),
          description: localize('security.trustAsciidoctorExtensionsAuthors.description', 'Allow code execution by activating Asciidoctor.js extensions.'),
        },
      ], {
        placeHolder: localize(
          'security.asciidoctorExtensionsTrustModeSelector.title',
          'Select the trust mode for the Asciidoctor.js extensions in this workspace.'),
      })

    if (!userChoice) {
      return
    }
    if (userChoice.type === 'deny_asciidoctor_extensions_authors') {
      await this.aespArbiter.denyAsciidoctorExtensionsAuthors()
    }
    if (userChoice.type === 'trust_asciidoctor_extensions_authors') {
      await this.aespArbiter.enableAsciidoctorExtensions() // make sure that Asciidoctor.js extensions are enabled
      await this.aespArbiter.trustAsciidoctorExtensionsAuthors()
    }
  }
}
