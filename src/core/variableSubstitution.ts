/**
 * Centralized resolution of VS Code "variable" placeholders (the `${...}`
 * syntax used across `settings.json`).
 *
 * VS Code performs this substitution internally through its
 * `ConfigurationResolverService`, which is **not** exposed to extensions
 * (microsoft/vscode#2809, #46471). Every extension that wants to honor
 * `${workspaceFolder}` and friends has to reimplement it — which is why this
 * used to be duplicated (and resolved inconsistently) between the preview
 * attributes and the PDF export command (#1154).
 *
 * This module is deliberately free of any `vscode` import: it takes a plain
 * {@link VariableResolutionContext} of primitives so it can run in the browser
 * build (no Node globals) and be unit-tested without the extension host. The
 * callers, which do have access to `vscode`, are responsible for building the
 * context.
 */

export interface VariableResolutionContext {
  /**
   * Absolute path of the workspace folder that owns the *current document*.
   * `${workspaceFolder}` resolves against this first so that, in a multi-root
   * workspace, a placeholder means "the folder of the file I'm working on"
   * (#1154). Falls back to {@link defaultWorkspaceFolder} when the document is
   * not inside any folder.
   */
  documentWorkspaceFolder?: string

  /**
   * Fallback for a bare `${workspaceFolder}` when the document has no owning
   * folder — typically the first workspace folder.
   */
  defaultWorkspaceFolder?: string

  /**
   * All workspace folders keyed by name, used to resolve the named form
   * `${workspaceFolder:Name}`.
   */
  workspaceFoldersByName?: Record<string, string | undefined>

  /** Value for `${userHome}` (undefined on the web build). */
  userHome?: string

  /** Value for `${pathSeparator}` / `${/}`. */
  pathSeparator?: string

  /** Environment variables, used to resolve `${env:NAME}`. */
  env?: Record<string, string | undefined>
}

// Matches `${name}` and `${name:argument}`. The name captures anything that is
// not `:` or `}` so single-character variables such as `${/}` are handled too;
// the argument (workspace folder name, env var name) captures up to the `}`.
const VARIABLE_RX = /\$\{([^}:]+)(?::([^}]*))?\}/g

/**
 * Replace the VS Code variable placeholders in `value` using `context`.
 *
 * A placeholder that cannot be resolved (unknown variable, or a known variable
 * whose value is not available in the given context — e.g. `${workspaceFolder}`
 * with no open workspace) is left untouched. This is intentionally conservative:
 * it preserves the previous behavior where an unresolvable placeholder remained
 * as literal text rather than collapsing to an empty string.
 */
export function resolveVariables(
  value: string,
  context: VariableResolutionContext,
): string {
  return value.replace(
    VARIABLE_RX,
    (match, name: string, argument?: string) => {
      const resolved = resolveVariable(name, argument, context)
      return resolved ?? match
    },
  )
}

function resolveVariable(
  name: string,
  argument: string | undefined,
  context: VariableResolutionContext,
): string | undefined {
  switch (name) {
    case 'workspaceFolder':
    // `${workspaceRoot}` is the deprecated alias VS Code still accepts.
    case 'workspaceRoot':
      if (argument !== undefined) {
        return context.workspaceFoldersByName?.[argument]
      }
      return context.documentWorkspaceFolder ?? context.defaultWorkspaceFolder
    case 'workspaceFolderBasename':
    case 'workspaceRootFolderName': {
      const folder =
        argument !== undefined
          ? context.workspaceFoldersByName?.[argument]
          : (context.documentWorkspaceFolder ?? context.defaultWorkspaceFolder)
      return folder === undefined ? undefined : basename(folder)
    }
    case 'userHome':
      return context.userHome
    case 'pathSeparator':
    case '/':
      return context.pathSeparator
    case 'env':
      // A missing environment variable resolves to an empty string, matching
      // VS Code's own behavior for `${env:...}`.
      return argument === undefined
        ? undefined
        : (context.env?.[argument] ?? '')
    default:
      return undefined
  }
}

// Last path segment, tolerant of both `/` and `\` separators and of trailing
// slashes, without pulling in Node's `path` (kept web-safe).
function basename(folder: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '')
  const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return lastSep === -1 ? trimmed : trimmed.slice(lastSep + 1)
}
