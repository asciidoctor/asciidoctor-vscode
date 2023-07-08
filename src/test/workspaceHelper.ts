import vscode from 'vscode'

export function getRootFsPath (): string {
  return vscode.workspace.workspaceFolders[0].uri.fsPath
}

export async function removeFiles (files: vscode.Uri[]) {
  for (const file of files) {
    await vscode.workspace.fs.delete(file)
  }
}

export async function createFile (name: string, content: string): Promise<vscode.Uri> {
  const root = getRootFsPath()
  const file = vscode.Uri.file(`${root}/${name}`)
  await vscode.workspace.fs.writeFile(file, Buffer.from(content))
  return file
}
