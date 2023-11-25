import vscode, { FileSystemError, FileType } from 'vscode'
import { getDefaultWorkspaceFolderUri, normalizeUri } from '../util/workspace'
import { extensionContext } from './helper'

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
  const file = vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), ...pathSegments)
  await vscode.workspace.fs.writeFile(file, Buffer.from(content))
  return normalizeUri(file)
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
  const dir = vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), ...pathSegments)
  await vscode.workspace.fs.createDirectory(dir)
  return normalizeUri(dir)
}

export async function createLink (existingPathSegments: string[], newPathSegments: string[]): Promise<vscode.Uri> {
  const fs = require('fs').promises
  const workspaceUri = getDefaultWorkspaceFolderUri()
  const existingPath = vscode.Uri.joinPath(workspaceUri, ...existingPathSegments)
  const newPath = vscode.Uri.joinPath(workspaceUri, ...newPathSegments)
  await fs.symlink(existingPath.fsPath, newPath.fsPath)
  return normalizeUri(newPath)
}

export async function enableAntoraSupport () {
  const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
  await workspaceConfiguration.update('antora.enableAntoraSupport', true)
  await extensionContext.workspaceState.update('antoraSupportSetting', true)
}

export async function disableAntoraSupport () {
  await extensionContext.workspaceState.update('antoraSupportSetting', undefined)
  await vscode.workspace.getConfiguration('asciidoc', null).update('antora.enableAntoraSupport', undefined)
}
