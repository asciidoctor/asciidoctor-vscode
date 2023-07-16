import vscode, { FileSystemError, FileType } from 'vscode'

export function getWorkspaceUri (): vscode.Uri {
  return vscode.workspace.workspaceFolders[0].uri
}

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
  const file = vscode.Uri.joinPath(getWorkspaceUri(), ...pathSegments)
  await vscode.workspace.fs.writeFile(file, Buffer.from(content))
  return file
}

export async function createDirectories (...pathSegments: string[]): Promise<void> {
  const currentPath: string[] = []
  for (const pathSegment of pathSegments) {
    currentPath.push(pathSegment)
    const dir = vscode.Uri.joinPath(getWorkspaceUri(), ...currentPath)
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
  const dir = vscode.Uri.joinPath(getWorkspaceUri(), ...pathSegments)
  await vscode.workspace.fs.createDirectory(dir)
  return dir
}

export async function createLink (existingPathSegments: string[], newPathSegments: string[]): Promise<vscode.Uri> {
  const fs = require('fs').promises
  const workspaceUri = getWorkspaceUri()
  const existingPath = vscode.Uri.joinPath(workspaceUri, ...existingPathSegments)
  const newPath = vscode.Uri.joinPath(workspaceUri, ...newPathSegments)
  await fs.symlink(existingPath.fsPath, newPath.fsPath)
  return newPath
}
