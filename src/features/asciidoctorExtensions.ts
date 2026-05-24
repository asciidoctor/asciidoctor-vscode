import { Registry } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import { findFiles } from '../util/findFiles.js'
import { mermaidJSProcessor } from './preview/mermaid.js'

export interface AsciidoctorExtensionsProvider {
  activate(registry: Registry): Promise<void>
}

export class AsciidoctorExtensions {
  private asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter

  constructor(
    asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter,
  ) {
    this.asciidoctorExtensionsSecurityPolicy =
      asciidoctorExtensionsSecurityPolicy
  }

  public async activate(registry: Registry) {
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
    await this.registerExtensionsInWorkspace(registry)
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
