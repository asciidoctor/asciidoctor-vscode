import os from 'node:os'
import path from 'node:path'
import * as vscode from 'vscode'
import { isBrowserEnvironment } from './environment.js'
import {
  resolveVariables,
  type VariableResolutionContext,
} from './variableSubstitution.js'
import { getWorkspaceFolder, getWorkspaceFolders } from './workspace.js'

/**
 * Build a {@link VariableResolutionContext} from the current VS Code state so
 * that {@link resolveVariables} can expand `${workspaceFolder}` and friends the
 * same way everywhere (#1154).
 *
 * Web-safety: this file is part of the browser bundle (the preview uses it), so
 * it must not call anything unavailable on the web extension host. `path.sep`
 * and `process.env` are safe (aliased / shimmed by the browser build), but
 * `os.homedir()` is **not** implemented by `os-browserify` and would throw —
 * hence it is only read on the desktop host.
 */
export function buildVariableResolutionContext(
  documentUri?: vscode.Uri,
): VariableResolutionContext {
  // On the desktop host paths are compared/used as OS file-system paths; on the
  // web host only the URI `path` is meaningful. This mirrors the existing
  // handling in AsciidoctorAttributesConfig.
  const isDesktop = vscode.env.uiKind === vscode.UIKind.Desktop
  const pathOf = (uri: vscode.Uri) => (isDesktop ? uri.fsPath : uri.path)

  const folders = getWorkspaceFolders() ?? []
  const workspaceFoldersByName: Record<string, string> = {}
  for (const folder of folders) {
    workspaceFoldersByName[folder.name] = pathOf(folder.uri)
  }

  const documentFolder = documentUri
    ? getWorkspaceFolder(documentUri)
    : undefined

  return {
    documentWorkspaceFolder: documentFolder
      ? pathOf(documentFolder.uri)
      : undefined,
    defaultWorkspaceFolder: folders.length ? pathOf(folders[0].uri) : undefined,
    workspaceFoldersByName,
    userHome: isBrowserEnvironment() ? undefined : os.homedir(),
    pathSeparator: path.sep,
    env: process.env,
  }
}

/**
 * Convenience wrapper that resolves the VS Code variables in `value` against the
 * context of `documentUri`.
 */
export function resolveVariablesForDocument(
  value: string,
  documentUri?: vscode.Uri,
): string {
  return resolveVariables(value, buildVariableResolutionContext(documentUri))
}
