import { Registry } from '@asciidoctor/core'
import kroki from 'asciidoctor-kroki'
import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { mermaidJSProcessor } from '../preview/mermaid.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import {
  type AsciidoctorExtensionContext,
  registerContributedAsciidoctorExtensions,
} from './asciidoctorExtensionContributions.js'

export interface AsciidoctorExtensionsProvider {
  activate(
    registry: Registry,
    context?: AsciidoctorExtensionContext,
  ): Promise<void>
}

export class AsciidoctorExtensions {
  private asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter

  constructor(
    asciidoctorExtensionsSecurityPolicy: AsciidoctorExtensionsSecurityPolicyArbiter,
  ) {
    this.asciidoctorExtensionsSecurityPolicy =
      asciidoctorExtensionsSecurityPolicy
  }

  public async activate(
    registry: Registry,
    context?: AsciidoctorExtensionContext,
  ) {
    const enableKroki = vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .get('enableKroki')
    if (enableKroki) {
      kroki.register(registry)
    }
    registry.block('mermaid', mermaidJSProcessor())
    if (context !== undefined) {
      await this.registerExtensionsFromContributingExtensions(registry, context)
    }
    await this.registerExtensionsInWorkspace(registry)
  }

  /**
   * Let other installed VS Code extensions register their packaged
   * Asciidoctor.js extensions on the registry. Extensions are discovered
   * through the `asciidoc.asciidoctorExtensions` contribution point and only
   * those are activated, mirroring the `markdownItPlugins` mechanism of the
   * built-in Markdown extension.
   */
  private async registerExtensionsFromContributingExtensions(
    registry: Registry,
    context: AsciidoctorExtensionContext,
  ): Promise<void> {
    const failures = await registerContributedAsciidoctorExtensions(
      vscode.extensions.all,
      registry,
      context,
    )
    for (const { extensionId, error } of failures) {
      vscode.window.showErrorMessage(
        `Failed to register Asciidoctor extensions contributed by '${extensionId}': ${error.message}`,
      )
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

  private async registerExtensionsInWorkspace(registry: Registry) {
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
