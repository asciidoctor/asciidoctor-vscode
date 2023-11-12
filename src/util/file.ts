/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import * as fs from 'fs'
import ospath from 'path'

export function isAsciidocFile (document: vscode.TextDocument) {
  return document.languageId === 'asciidoc'
}

export class FileInfo {
  file: string
  isFile: boolean

  constructor (path: string, file: string) {
    this.file = file
    this.isFile = fs.statSync(ospath.join(path, file)).isFile()
  }
}

export async function getChildrenOfPath (path: string) {
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
  } catch (error) {
    return []
  }
}

export const sortFilesAndDirectories = (filesAndDirs: FileInfo[]): FileInfo[] => {
  const dirs = filesAndDirs.filter((f) => f.isFile !== true)
  const files = filesAndDirs.filter((f) => f.isFile === true)
  return [...dirs, ...files]
}

export function dir (uri: vscode.Uri, workspaceFolder: vscode.Uri | undefined): vscode.Uri | undefined {
  if (uri.path === workspaceFolder?.path) {
    return undefined
  }
  if (uri.path.lastIndexOf('/') <= 0) {
    return undefined
  }
  return uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf('/')) })
}

export async function exists (uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch (err) {
    // file does not exist, ignore
    return false
  }
}
