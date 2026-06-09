import { Registry } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { mermaidJSProcessor } from '../preview/mermaid.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'

export interface AsciidoctorExtensionsProvider {
  activate(registry: Registry, documentUri?: vscode.Uri): Promise<void>
}

export interface AsciidoctorExtensionRegistration {
  register(registry: Registry, documentUri?: vscode.Uri): void | Promise<void>
}

export interface AsciidoctorExtensionRegistrationApi {
  registerAsciidoctorExtension(
    extension: AsciidoctorExtensionRegistration,
  ): vscode.Disposable
}

export class AsciidoctorExtensions {
  private static readonly registeredExtensions =
    new Set<AsciidoctorExtensionRegistration>()
  private asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter

  constructor(
    asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter,
  ) {
    this.asciidoctorExtensionsSecurityPolicy =
      asciidoctorExtensionsSecurityPolicy
  }

  public static registerAsciidoctorExtension(
    extension: AsciidoctorExtensionRegistration,
  ): vscode.Disposable {
    AsciidoctorExtensions.registeredExtensions.add(extension)
    return {
      dispose(): void {
        AsciidoctorExtensions.registeredExtensions.delete(extension)
      },
    }
  }

  public async activate(registry: Registry, documentUri?: vscode.Uri) {
    const enableKroki = vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .get('enableKroki')
    // asciidoctor-kroki is temporarily disabled: not yet compatible with Asciidoctor 4.0
    if (enableKroki) {
      vscode.window.showWarningMessage(
        'Kroki diagrams are temporarily disabled because asciidoctor-kroki is not yet compatible with Asciidoctor 4.0.',
      )
    }
    registry.block('mermaid', mermaidJSProcessor())
    await this.registerExtensionsFromApi(registry, documentUri)
    await this.registerExtensionsInWorkspace(registry)
  }

  private async registerExtensionsFromApi(
    registry: Registry,
    documentUri?: vscode.Uri,
  ): Promise<void> {
    for (const extension of AsciidoctorExtensions.registeredExtensions) {
      try {
        await extension.register(registry, documentUri)
      } catch (e) {
        vscode.window.showErrorMessage(e.toString())
      }
    }
  }

  private async confirmAsciidoctorExtensionsTrusted(): Promise<boolean> {
    if (!this.isAsciidoctorExtensionsRegistrationEnabled()) {
      return false
    }
    const extensionFiles = await this.getExtensionFilesInWorkspace()
    const extensionsCount = extensionFiles.length
    if (extensionsCount === 0) {
      return false
    }
    return this.asciidoctorExtensionsSecurityPolicy.confirmAsciidoctorExtensionsTrustMode(
      extensionsCount,
    )
  }

  private async getExtensionFilesInWorkspace(): Promise<vscode.Uri[]> {
    return findFiles('.asciidoctor/lib/**/*.js')
  }

  private isAsciidoctorExtensionsRegistrationEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .get('registerWorkspaceExtensions')
  }

  private async registerExtensionsInWorkspace(registry) {
    const extensionsTrusted = await this.confirmAsciidoctorExtensionsTrusted()
    if (!extensionsTrusted) {
      return
    }
    const extfiles = await this.getExtensionFilesInWorkspace()
    for (const extfile of extfiles) {
      const extPath = extfile.fsPath
      try {
        delete require.cache[extPath]
        const extjs = require(extPath)
        extjs.register(registry)
      } catch (e) {
        vscode.window.showErrorMessage(extPath + ': ' + e.toString())
      }
    }
  }
}
