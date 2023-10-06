import os from 'os'
import vscode, { FileSystemError, FileType } from 'vscode'
import { getDefaultWorkspaceFolderUri } from '../util/workspace'

export async function removeFiles (files: vscode.Uri[]) {
  for (const file of files) {
    if (await exists(file)) {
      await vscode.workspace.fs.delete(file, { recursive: true })
    }
  }
}

async function exists (file: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(file)
    return true
  } catch (err) {
    if (err instanceof FileSystemError && err.code === 'FileNotFound') {
      return false
    } else {
      throw err
    }
  }
}

export async function createFile (content: string, ...pathSegments: string[]): Promise<vscode.Uri> {
  let file = vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), ...pathSegments)
  await vscode.workspace.fs.writeFile(file, Buffer.from(content))
  if (os.platform() === 'win32') {
    // normalize Windows drive letter
    // https://github.com/microsoft/vscode/issues/194692
    file = file.with({ path: file.path.replace(/^\/([A-Z]):.*/, (v) => v.toLowerCase()) })
  }
  return file
}

export async function createDirectories (...pathSegments: string[]): Promise<void> {
  const currentPath: string[] = []
  for (const pathSegment of pathSegments) {
    currentPath.push(pathSegment)
    const dir = vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), ...currentPath)
    try {
      const stat = await vscode.workspace.fs.stat(dir)
      if (stat.type === (FileType.Directory | FileType.SymbolicLink)) {
        // continue
      } else {
        await vscode.workspace.fs.createDirectory(dir)
      }
    } catch (err) {
      if (err instanceof FileSystemError && err.code === 'FileNotFound') {
        await vscode.workspace.fs.createDirectory(dir)
      } else {
        throw err
      }
    }
  }
}

export async function createDirectory (...pathSegments: string[]): Promise<vscode.Uri> {
  let dir = vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), ...pathSegments)
  await vscode.workspace.fs.createDirectory(dir)
  if (os.platform() === 'win32') {
    // normalize Windows drive letter
    // https://github.com/microsoft/vscode/issues/194692
    dir = dir.with({ path: dir.path.replace(/^\/([A-Z]):.*/, (driverLetter) => driverLetter.toLowerCase()) })
  }
  return dir
}

export async function createLink (existingPathSegments: string[], newPathSegments: string[]): Promise<vscode.Uri> {
  const fs = require('fs').promises
  const workspaceUri = getDefaultWorkspaceFolderUri()
  const existingPath = vscode.Uri.joinPath(workspaceUri, ...existingPathSegments)
  let newPath = vscode.Uri.joinPath(workspaceUri, ...newPathSegments)
  await fs.symlink(existingPath.fsPath, newPath.fsPath)
  if (os.platform() === 'win32') {
    newPath = newPath.with({ path: newPath.path.replace(/^\/([A-Z]):.*/, (driverLetter) => driverLetter.toLowerCase()) })
  }
  return newPath
}
