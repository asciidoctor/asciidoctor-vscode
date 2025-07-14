/*---------------------------------------------------------------------------------------------
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs'
import ospath from 'path'
import * as vscode from 'vscode'

export function isAsciidocFile(document: vscode.TextDocument) {
  return document.languageId === 'asciidoc'
}

export class FileInfo {
  file: string
  isFile: boolean

  constructor(path: string, file: string) {
    this.file = file
    this.isFile = fs.statSync(ospath.join(path, file)).isFile()
  }
}

export async function getChildrenOfPath(path: string) {
  try {
    const files: string[] = await new Promise((resolve, reject) => {
      fs.readdir(path, (err, files) => {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
    return files.map((f) => new FileInfo(path, f))
  } catch (_error) {
    return []
  }
}

export const sortFilesAndDirectories = (
  filesAndDirs: FileInfo[],
): FileInfo[] => {
  const dirs = filesAndDirs.filter((f) => f.isFile !== true)
  const files = filesAndDirs.filter((f) => f.isFile === true)
  return [...dirs, ...files]
}

export function dir(
  uri: vscode.Uri,
  workspaceFolder: vscode.Uri | undefined,
): vscode.Uri | undefined {
  if (uri.path === workspaceFolder?.path) {
    return undefined
  }
  if (uri.path.lastIndexOf('/') <= 0) {
    return undefined
  }
  let query = uri.query
  // The Git file system provider is using a JSON-encoded string in `query` to store the path of the file.
  if (uri.scheme === 'git') {
    try {
      const queryObject = JSON.parse(query)
      queryObject.path = queryObject.path.slice(
        0,
        queryObject.path.lastIndexOf('/'),
      )
      query = JSON.stringify(queryObject)
    } catch (_e) {
      // something went wrong, use the initial value
    }
  }
  return uri.with({
    path: uri.path.slice(0, uri.path.lastIndexOf('/')),
    query,
  })
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch (_err) {
    // file does not exist, ignore
    return false
  }
}
