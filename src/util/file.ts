/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from "path";
import { join } from "path";
import { readdir, statSync } from "fs";
const { promisify } = require("util");
const readdirAsync = promisify(readdir);

export function isAsciidocFile(document: vscode.TextDocument) {
  return document.languageId === 'asciidoc';
}

export class FileInfo {
  file: string;
  isFile: boolean;

  constructor(path: string, file: string) {
    this.file = file;
    this.isFile = statSync(join(path, file)).isFile();
  }
}

/**
 * @param fileName  {string} current filename the look up is done. Absolute path
 * @param text      {string} text in import string. e.g. './src/'
 */
export function getPathOfFolderToLookupFiles(
  fileName: string,
  text: string | undefined,
  rootPath?: string
): string {
  const normalizedText = path.normalize(text || "");

  const isPathAbsolute = normalizedText.startsWith(path.sep);

  let rootFolder = path.dirname(fileName);
  let pathEntered = normalizedText;

  if (isPathAbsolute) {
    rootFolder = rootPath || "";
  }

  return path.join(rootFolder, pathEntered);
}

export async function getChildrenOfPath(path: string) {
  try {
    const files: string[] = await readdirAsync(path);
    const filesDbg = files
      .map((f) => new FileInfo(path, f));
    return filesDbg;
  } catch (error) {
    return [];
  }
}

export const sortFilesAndDirectories = (filesAndDirs: FileInfo[]): FileInfo[] => {
  const dirs = filesAndDirs.filter((f) => f.isFile !== true);
  const files = filesAndDirs.filter((f) => f.isFile === true);
  return [...dirs, ...files]
};