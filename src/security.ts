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
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.Strict) + localize('strict.title', 'Strict'),
          description: localize('strict.description', 'Only load secure content'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowInsecureLocalContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowInsecureLocalContent) + localize('insecureLocalContent.title', 'Allow insecure local content'),
          description: localize('insecureLocalContent.description', 'Enable loading content over http served from localhost'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowInsecureContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowInsecureContent) + localize('insecureContent.title', 'Allow insecure content'),
          description: localize('insecureContent.description', 'Enable loading content over http'),
        }, {
          type: AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent,
          label: markActiveWhen(currentSecurityLevel === AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent) + localize('disable.title', 'Disable'),
          description: localize('disable.description', 'Allow all content and script execution. Not recommended'),
        }, {
          type: 'moreinfo',
          label: localize('moreInfo.title', 'More Information'),
          description: '',
        }, {
          type: 'toggle',
          label: this.cspArbiter.shouldDisableSecurityWarnings()
            ? localize('enableSecurityWarning.title', 'Enable preview security warnings in this workspace')
            : localize('disableSecurityWarning.title', 'Disable preview security warning in this workspace'),
          description: localize('toggleSecurityWarning.description', 'Does not affect the content security level'),
        },
      ], {
        placeHolder: localize(
          'preview.showPreviewSecuritySelector.title',
          'Select security settings for Asciidoc previews in this workspace'),
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

export class AsciidocParserSecurityPolicyArbiter {
  private readonly enableAsciidocExtensionScriptKey = 'enable_asciidoc_extension_script:'

  constructor (
    private readonly context: vscode.ExtensionContext
  ) {
    this.context = context
  }

  public getEnableScripts (): boolean {
    return this.context.workspaceState.get<boolean>(this.enableAsciidocExtensionScriptKey, false)
  }

  public async setEnableScripts (enabled: boolean): Promise<void> {
    return this.context.workspaceState.update(this.enableAsciidocExtensionScriptKey, enabled)
  }
}

export class AsciidocExtensionSecuritySelector {
  private static readonly enableAsciidocExtensionScriptKey = 'enable_asciidoc_extension_script:'

  constructor (
    private readonly apsArbiter: AsciidocParserSecurityPolicyArbiter
  ) {
    this.apsArbiter = apsArbiter
  }

  public async showSelector (): Promise<void> {
    const enableExtension = this.apsArbiter.getEnableScripts()

    interface ExtensionPickItem extends vscode.QuickPickItem {
      readonly type: 'disable_extension' | 'enable_extension';
    }

    function markActiveWhen (when: boolean): string {
      return when ? '• ' : ''
    }

    const selection = await vscode.window.showQuickPick<ExtensionPickItem>(
      [
        {
          type: 'disable_extension',
          label: markActiveWhen(enableExtension === false) + localize('disable_extension.title', 'Disable AsciiDoc extension scripts'),
          description: localize('disable_extension.description', 'Disable AsciiDoc extension scripts in the workspace.'),
        }, {
          type: 'enable_extension',
          label: markActiveWhen(enableExtension === true) + localize('enable_extension.title', 'Enable AsciiDoc extension scripts'),
          description: localize('enable_extension.description', 'Enable AsciiDoc extension scripts in the workspace.'),
        },
      ], {
        placeHolder: localize(
          'asciidocExtensionSecuritySelector.title',
          'Select security settings for Asciidoc extension scripts in this workspace'),
      })

    if (!selection) {
      return
    }
    if (selection.type === 'disable_extension') {
      await this.apsArbiter.setEnableScripts(false)
    }
    if (selection.type === 'enable_extension') {
      if (!enableExtension) {
        const confirmYes = await vscode.window.showWarningMessage(
          'AsciiDoc extension will execute scripts in workspace(.asciidoctor/lib/*.js). Do you trust authors of scripts in workspace?',
          { modal: true },
          { title: 'Yes, I trust the authors.', value: true },
          { title: 'No, I don\'t trust the authors.', value: false })
        if (!confirmYes.value) {
          return
        }
      }
      await this.apsArbiter.setEnableScripts(true)
    }
  }
}
