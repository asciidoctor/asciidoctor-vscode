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
  const configContentFromAsciidoctorConfig = await getConfigContent(workspaceFolder, '.asciidoctorconfig')
  const configContentFromAsciidoctorConfigDotAdoc = await getConfigContent(workspaceFolder, '.asciidoctorconfig.adoc')

  const configContents = [
    configContentFromAsciidoctorConfig,
    configContentFromAsciidoctorConfigDotAdoc,
  ].filter((config) => config !== undefined)

  if (configContents.length > 0) {
    return configContents.join('\n\n')
  }
  return undefined
}

async function getConfigContent (workspaceFolder: vscode.WorkspaceFolder, configFilename: string) {
  const asciidoctorConfigUri = vscode.Uri.joinPath(workspaceFolder.uri, configFilename)
  if (await exists(asciidoctorConfigUri)) {
    const asciidoctorConfigContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(asciidoctorConfigUri))
    return `:asciidoctorconfigdir: ${workspaceFolder.uri.fsPath}\n\n${asciidoctorConfigContent.trim()}\n\n`
  }
  return undefined
}
