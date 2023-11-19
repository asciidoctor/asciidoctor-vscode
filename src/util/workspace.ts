import vscode, { Uri, WorkspaceFolder } from 'vscode'
import os from 'os'

const driveLetterRx = /(?<=^\/)([A-Z])(?=:\/)/

export function getWorkspaceFolder (uri: Uri): WorkspaceFolder | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
  if (workspaceFolder && os.platform() === 'win32') {
    return {
      uri: normalizeUri(workspaceFolder.uri),
      name: workspaceFolder.name,
      index: workspaceFolder.index,
    }
  }
  return workspaceFolder
}

export function getWorkspaceFolders (): WorkspaceFolder[] | undefined {
  return vscode.workspace.workspaceFolders?.map((workspaceFolder) => {
    if (os.platform() === 'win32') {
      return {
        uri: normalizeUri(workspaceFolder.uri),
        name: workspaceFolder.name,
        index: workspaceFolder.index,
      }
    }
    return workspaceFolder
  })
}

export function findDefaultWorkspaceFolderUri (): Uri | undefined {
  const workspaceFolders = getWorkspaceFolders()
  if (workspaceFolders && workspaceFolders.length) {
    return workspaceFolders[0].uri
  }
  return undefined
}

export function getDefaultWorkspaceFolderUri (): Uri | undefined {
  const workspaceFolders = getWorkspaceFolders()
  return normalizeUri(workspaceFolders[0].uri)
}

export function normalizeUri (uri: Uri): Uri {
  // normalize Windows drive letter
  // https://github.com/microsoft/vscode/issues/194692
  if (os.platform() === 'win32') {
    return uri.with({ path: uri.path.replace(driveLetterRx, (driverLetter) => driverLetter.toLowerCase()) })
  }
  return uri
}
