import * as vscode from 'vscode'

async function exists (uri: vscode.Uri) {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch (err) {
    if (err && err.code === 'FileNotFound') {
      return false
    }
    throw err
  }
}

export async function getAsciidoctorConfigContent (documentUri: vscode.Uri): Promise<String | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri)
  if (workspaceFolder === undefined) {
    return undefined
  }
  const asciidoctorConfigUri = vscode.Uri.joinPath(workspaceFolder.uri, '.asciidoctorconfig')
  if (await exists(asciidoctorConfigUri)) {
    const asciidoctorConfigContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(asciidoctorConfigUri))
    return `${asciidoctorConfigContent.trim()}\n\n`
  }
}
