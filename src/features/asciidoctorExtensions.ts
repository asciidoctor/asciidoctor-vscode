import vscode from 'vscode'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { Asciidoctor } from '@asciidoctor/core'

export interface AsciidoctorExtensionsProvider {
  activate(registry: Asciidoctor.Extensions.Registry): Promise<void>;
}

export class AsciidoctorExtensions {
  private asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter

  constructor (asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter) {
    this.asciidoctorExtensionsSecurityPolicy = asciidoctorExtensionsSecurityPolicy
  }

  public async activate (registry: Asciidoctor.Extensions.Registry) {
    const enableKroki = vscode.workspace.getConfiguration('asciidoc.extensions', null).get('enableKroki')
    if (enableKroki) {
      const kroki = require('asciidoctor-kroki')
      kroki.register(registry)
    }
    await this.registerExtensionsInWorkspace(registry)
  }

  private async confirmAsciidoctorExtensionsTrusted (): Promise<boolean> {
    if (!this.isAsciidoctorExtensionsRegistrationEnabled()) {
      return false
    }
    const extensionFiles = await this.getExtensionFilesInWorkspace()
    const extensionsCount = extensionFiles.length
    if (extensionsCount === 0) {
      return false
    }
    return this.asciidoctorExtensionsSecurityPolicy.confirmAsciidoctorExtensionsTrustMode(extensionsCount)
  }

  private async getExtensionFilesInWorkspace (): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('.asciidoctor/lib/**/*.js')
  }

  private isAsciidoctorExtensionsRegistrationEnabled (): boolean {
    return vscode.workspace.getConfiguration('asciidoc.extensions', null).get('registerWorkspaceExtensions')
  }

  private async registerExtensionsInWorkspace (registry) {
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
