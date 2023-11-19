import vscode, { Uri, WorkspaceFolder } from 'vscode'
import os from 'os'

const driveLetterRx = /(?<=^\/)([A-Z])(?=:\/)/

export function getWorkspaceFolder (uri: Uri): WorkspaceFolder | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
  if (workspaceFolder && os.platform() === 'win32') {
    return {
      uri: workspaceFolder.uri.with({ path: workspaceFolder.uri.path.replace(driveLetterRx, (driverLetter) => driverLetter.toLowerCase()) }),
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
        uri: workspaceFolder.uri.with({ path: workspaceFolder.uri.path.replace(driveLetterRx, (driverLetter) => driverLetter.toLowerCase()) }),
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
  let workspaceUri = workspaceFolders[0].uri
  if (os.platform() === 'win32') {
    workspaceUri = workspaceUri.with({ path: workspaceUri.path.replace(driveLetterRx, (driverLetter) => driverLetter.toLowerCase()) })
  }
  return workspaceUri
}
