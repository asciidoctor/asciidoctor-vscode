import vscode, { Uri } from 'vscode'

/**
 * Find files across all workspace folders in the workspace using a glob expression.
 * @param glob A glob pattern that defines the files to search for.
 */
export async function findFiles(glob: string): Promise<Uri[]> {
  return vscode.workspace.findFiles(glob)
}
