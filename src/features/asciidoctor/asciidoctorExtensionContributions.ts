import type { Registry } from '@asciidoctor/core'
import type { Uri } from 'vscode'

/**
 * `package.json` contribution point that a VS Code extension declares to provide
 * Asciidoctor.js extensions to the AsciiDoc preview, export and analysis flows.
 *
 * ```jsonc
 * "contributes": { "asciidoc.asciidoctorExtensions": true }
 * ```
 */
export const ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT =
  'asciidoc.asciidoctorExtensions'

/**
 * What the freshly created Asciidoctor.js registry is going to be used for.
 *
 * - `preview`: rendering the live AsciiDoc preview webview.
 * - `export`: converting the document for an export command (HTML, DocBook, …).
 * - `load`: parsing the document to power editor features (outline, links,
 *   folding, completion, diagnostics).
 *
 * New modes may be added over time, so consumers should handle unknown values
 * defensively.
 */
export type AsciidoctorProcessingMode = 'preview' | 'export' | 'load'

/**
 * Contextual information passed to a contributed extension every time a new
 * Asciidoctor.js registry is created. New, optional fields may be added over
 * time, so consumers should treat unknown fields defensively.
 */
export interface AsciidoctorExtensionContext {
  /**
   * What the registry is being built for. Lets a contributed extension behave
   * differently depending on the flow (e.g. register a converter only for
   * `export`).
   */
  readonly mode: AsciidoctorProcessingMode

  /**
   * URI of the AsciiDoc document the registry is being built for, when known.
   * Useful to read resource-scoped VS Code settings. It is `undefined` for
   * registries created outside of a document context.
   */
  readonly documentUri?: Uri
}

/**
 * Shape of the API a contributing VS Code extension returns from its `activate()`
 * function. Mirrors the `extendMarkdownIt` pattern used by VS Code's built-in
 * Markdown extension.
 */
export interface AsciidoctorExtensionApi {
  registerAsciidoctorExtensions(
    registry: Registry,
    context: AsciidoctorExtensionContext,
  ): void | Promise<void>
}

/**
 * Minimal structural view of a VS Code extension. Declared here (instead of
 * importing `vscode.Extension`) so this module stays free of any runtime
 * dependency on the `vscode` API and can be exercised by plain Node unit tests.
 * `vscode.Extension<T>` is structurally assignable to this interface.
 */
export interface AsciidoctorExtensionContributor {
  readonly id: string
  readonly packageJSON: {
    contributes?: Record<string, unknown> | undefined
  }
  activate(): PromiseLike<unknown>
}

/**
 * A failure that occurred while registering the Asciidoctor.js extensions
 * contributed by a single VS Code extension.
 */
export interface AsciidoctorExtensionRegistrationFailure {
  readonly extensionId: string
  readonly error: Error
}

/**
 * Whether the given extension declares the Asciidoctor extensions contribution
 * point in its `package.json`. This check reads static metadata only and does
 * not activate the extension.
 */
export function contributesAsciidoctorExtensions(
  extension: AsciidoctorExtensionContributor,
): boolean {
  return Boolean(
    extension.packageJSON?.contributes?.[
      ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT
    ],
  )
}

/**
 * Discover every VS Code extension that contributes Asciidoctor.js extensions,
 * activate it and let it register its extensions on the provided registry.
 *
 * Registration never throws: a failing contributor is isolated, collected and
 * returned so the caller can surface it without aborting the other
 * contributors or the document processing itself.
 */
export async function registerContributedAsciidoctorExtensions(
  extensions: readonly AsciidoctorExtensionContributor[],
  registry: Registry,
  context: AsciidoctorExtensionContext,
): Promise<AsciidoctorExtensionRegistrationFailure[]> {
  const failures: AsciidoctorExtensionRegistrationFailure[] = []
  for (const extension of extensions) {
    if (!contributesAsciidoctorExtensions(extension)) {
      continue
    }
    try {
      const api = (await extension.activate()) as
        | Partial<AsciidoctorExtensionApi>
        | undefined
      const register = api?.registerAsciidoctorExtensions
      if (typeof register !== 'function') {
        throw new Error(
          `extension contributes '${ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT}' but its activate() return value does not expose a 'registerAsciidoctorExtensions(registry, context)' function`,
        )
      }
      await register.call(api, registry, context)
    } catch (error) {
      failures.push({
        extensionId: extension.id,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }
  return failures
}
