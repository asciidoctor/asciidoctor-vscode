import ospath from 'node:path'
import * as vscode from 'vscode'
import { dir, exists } from '../../core/file.js'
import { findFiles } from '../../core/findFiles.js'
import { AsciidoctorTemplatesSecurityPolicyArbiter } from '../security.js'

/**
 * Resolve the directories passed to Asciidoctor as `template_dirs`.
 *
 * The result combines two sources:
 *
 * 1. the directories configured through `asciidoc.preview.templates` — absolute
 *    paths are used as-is, relative paths are resolved against the document's
 *    workspace folder (or, when the document does not belong to any workspace
 *    folder, against the directory containing the document). This matches the
 *    behaviour that the setting has always documented but never implemented
 *    (see #777);
 * 2. the conventional `.asciidoctor/templates` directory found at the root of
 *    each workspace folder, echoing the `.asciidoctor/lib` convention used for
 *    workspace Asciidoctor.js extensions (see #843).
 *
 * Template converters are loaded through Node's file system, so directories are
 * returned as file-system paths and templates therefore only apply on the
 * desktop.
 *
 * The auto-discovered directory holds executable code shipped with the opened
 * workspace, so — exactly like `.asciidoctor/lib` extensions — it is only loaded
 * once the user has trusted its authors (see
 * {@link AsciidoctorTemplatesSecurityPolicyArbiter}). Paths listed explicitly in
 * the setting are a deliberate opt-in and are not gated.
 */
export async function getTemplateDirs(
  documentUri: vscode.Uri,
  templatesSecurityPolicy?: AsciidoctorTemplatesSecurityPolicyArbiter,
): Promise<string[]> {
  // A Set keeps the order of first insertion while dropping duplicates, e.g.
  // when `.asciidoctor/templates` is both auto-discovered and configured
  // explicitly.
  const templateDirs = new Set<string>()

  const configuredTemplates = vscode.workspace
    .getConfiguration('asciidoc.preview', documentUri)
    .get<string[]>('templates', [])
  const baseUri = getBaseUri(documentUri)
  for (const template of configuredTemplates) {
    if (!template) {
      continue
    }
    if (ospath.isAbsolute(template)) {
      templateDirs.add(template)
    } else if (baseUri !== undefined) {
      templateDirs.add(uriToFsPath(vscode.Uri.joinPath(baseUri, template)))
    }
  }

  // Auto-discover `.asciidoctor/templates` at the root of every workspace
  // folder, mirroring how `.asciidoctor/lib` extensions are picked up.
  const discoveredDirs: vscode.Uri[] = []
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    const templatesDirUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.asciidoctor',
      'templates',
    )
    if (await exists(templatesDirUri)) {
      discoveredDirs.push(templatesDirUri)
    }
  }
  if (discoveredDirs.length > 0) {
    // Only prompt when there is actually something to run, and gate the load on
    // the user trusting the authors of these files. The security policy is
    // resolved lazily (rather than as a default parameter) so callers that have
    // no auto-discovered templates never require the singleton to be activated.
    const templateFiles = await findFiles('.asciidoctor/templates/**/*')
    if (templateFiles.length > 0) {
      const securityPolicy =
        templatesSecurityPolicy ??
        AsciidoctorTemplatesSecurityPolicyArbiter.getInstance()
      if (
        await securityPolicy.confirmAsciidoctorTemplatesTrustMode(
          templateFiles.length,
        )
      ) {
        for (const templatesDirUri of discoveredDirs) {
          templateDirs.add(uriToFsPath(templatesDirUri))
        }
      }
    }
  }

  return [...templateDirs]
}

/**
 * Base directory used to resolve relative `asciidoc.preview.templates` entries:
 * the document's workspace folder root when it has one, otherwise the directory
 * containing the document.
 */
function getBaseUri(documentUri: vscode.Uri): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri)
  if (workspaceFolder !== undefined) {
    return workspaceFolder.uri
  }
  return dir(documentUri, undefined)
}

function uriToFsPath(uri: vscode.Uri): string {
  return vscode.env.uiKind === vscode.UIKind.Desktop ? uri.fsPath : uri.path
}
