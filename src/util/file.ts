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

/**
 * @param currentPath  {string} current path to look up
 * @param text      {string} text in import string. e.g. './src/'
 */
export function getPathOfFolderToLookupFiles (
  currentPath: string,
  text: string | undefined
): string {
  const normalizedText = ospath.normalize(text || '')
  const normalizedPath = ospath.normalize(currentPath)

  const isPathAbsolute = normalizedText.startsWith(ospath.sep)

  let rootFolder = ospath.dirname(normalizedPath)
  const pathEntered = normalizedText

  if (isPathAbsolute) {
    rootFolder = ''
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
