import * as path from 'path'
import * as vscode from 'vscode'

const MAX_DEPTH_SEARCH_ASCIIDOCCONFIG = 100

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

  const configContents: string[] = []
  let currentFile: string = documentUri.fsPath
  let increment = 0
  while (currentFile !== undefined && currentFile !== workspaceFolder.uri.fsPath && increment < MAX_DEPTH_SEARCH_ASCIIDOCCONFIG) {
    increment++
    currentFile = path.dirname(currentFile)
    configContents.push(await getConfigContent(currentFile, '.asciidoctorconfig.adoc'))
    configContents.push(await getConfigContent(currentFile, '.asciidoctorconfig'))
  }

  const configContentsOrderedAndFiltered = configContents
    .filter((config) => config !== undefined)
    .reverse()

  if (configContentsOrderedAndFiltered.length > 0) {
    return configContentsOrderedAndFiltered.join('\n\n')
  }
  return undefined
}

async function getConfigContent (folderPath: string, configFilename: string) {
  const asciidoctorConfigUri = vscode.Uri.joinPath(vscode.Uri.file(folderPath), configFilename)
  if (await exists(asciidoctorConfigUri)) {
    const asciidoctorConfigContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(asciidoctorConfigUri))
    return `:asciidoctorconfigdir: ${folderPath}\n\n${asciidoctorConfigContent.trim()}\n\n`
  }
  return undefined
}
