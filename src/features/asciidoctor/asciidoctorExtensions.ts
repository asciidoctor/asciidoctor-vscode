import { Registry } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { plantUmlStrings } from '../preview/plantumlStrings.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import {
  type AsciidoctorExtensionContext,
  contributesAsciidoctorExtensions,
  registerContributedAsciidoctorExtensions,
} from './asciidoctorExtensionContributions.js'
import {
  registerBuiltInExtensions,
  registerWorkspaceExtensions,
} from './registryExtensions.js'

/**
 * The Asciidoctor extensions to register, resolved from the settings and the
 * workspace, as plain data (see `registryExtensions.ts`).
 */
export interface ResolvedAsciidoctorExtensions {
  /** The `asciidoc.extensions.enableKroki` setting. */
  readonly enableKroki: boolean
  /** The localized alternative text of the PlantUML diagrams. */
  readonly plantUmlAlt: string
  /** The paths of the trusted workspace extensions (`.asciidoctor/lib`). */
  readonly workspaceExtensionFiles: string[]
  /**
   * Whether another VS Code extension contributes Asciidoctor extensions: they
   * are registered by that extension, in the extension host.
   */
  readonly hasContributedExtensions: boolean
}

export interface AsciidoctorExtensionsProvider {
  activate(
    registry: Registry,
    context?: AsciidoctorExtensionContext,
  ): Promise<void>
}

/**
 * Resolves the extensions as plain data, so that the registry can be built
 * elsewhere, e.g. in the preview's worker thread.
 */
export interface AsciidoctorExtensionsResolver
  extends AsciidoctorExtensionsProvider {
  resolve(): Promise<ResolvedAsciidoctorExtensions>

  registerContributedExtensions(
    registry: Registry,
    context: AsciidoctorExtensionContext,
  ): Promise<void>

  /** Shows the workspace extensions that failed to load. */
  reportFailures(failures: readonly { file: string; error: string }[]): void
}

export class AsciidoctorExtensions implements AsciidoctorExtensionsResolver {
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
    const resolved = await this.resolve()
    registerBuiltInExtensions(registry, {
      enableKroki: resolved.enableKroki,
      mode: context?.mode,
      plantUmlAlt: resolved.plantUmlAlt,
    })
    if (context !== undefined) {
      await this.registerContributedExtensions(registry, context)
    }
    this.reportFailures(
      registerWorkspaceExtensions(registry, resolved.workspaceExtensionFiles),
    )
  }

  public async resolve(): Promise<ResolvedAsciidoctorExtensions> {
    const enableKroki = Boolean(
      vscode.workspace
        .getConfiguration('asciidoc.extensions', null)
        .get('enableKroki'),
    )
    const extensionsTrusted = await this.confirmAsciidoctorExtensionsTrusted()
    const workspaceExtensionFiles = extensionsTrusted
      ? (await this.getExtensionFilesInWorkspace()).map(
          (extfile) => extfile.fsPath,
        )
      : []
    return {
      enableKroki,
      plantUmlAlt: plantUmlStrings().alt,
      workspaceExtensionFiles,
      hasContributedExtensions: vscode.extensions.all.some(
        contributesAsciidoctorExtensions,
      ),
    }
  }

  public reportFailures(
    failures: readonly { file: string; error: string }[],
  ): void {
    for (const { file, error } of failures) {
      vscode.window.showErrorMessage(file + ': ' + error)
    }
  }

  /**
   * Let other installed VS Code extensions register their packaged
   * Asciidoctor.js extensions on the registry. Extensions are discovered
   * through the `asciidoc.asciidoctorExtensions` contribution point and only
   * those are activated, mirroring the `markdownItPlugins` mechanism of the
   * built-in Markdown extension.
   */
  public async registerContributedExtensions(
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
      .get('registerWorkspaceExtensions', false)
  }
}
