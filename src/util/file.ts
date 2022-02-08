/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import * as ospath from 'path'
import * as fs from 'fs'

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

/**
 * @param fileName  {string} current filename the look up is done. Absolute path
 * @param text      {string} text in import string. e.g. './src/'
 */
export function getPathOfFolderToLookupFiles (
  fileName: string,
  text: string | undefined,
  rootPath?: string
): string {
  const normalizedText = ospath.normalize(text || '')

  const isPathAbsolute = normalizedText.startsWith(ospath.sep)

  let rootFolder = ospath.dirname(fileName)
  const pathEntered = normalizedText

  if (isPathAbsolute) {
    rootFolder = rootPath || ''
  }

  return ospath.join(rootFolder, pathEntered)
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
    const filesDbg = files
      .map((f) => new FileInfo(path, f))
    return filesDbg
  } catch (error) {
    return []
  }
}

export const sortFilesAndDirectories = (filesAndDirs: FileInfo[]): FileInfo[] => {
  const dirs = filesAndDirs.filter((f) => f.isFile !== true)
  const files = filesAndDirs.filter((f) => f.isFile === true)
  return [...dirs, ...files]
}
