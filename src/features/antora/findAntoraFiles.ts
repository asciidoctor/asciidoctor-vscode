import vscode from 'vscode'

export async function findAntoraFiles (glob: string, token?: vscode.CancellationToken) {
  const excludeArray = vscode.workspace.getConfiguration('asciidoc.antora.search', null).get<string[]>('exclude')
  const excludeString = '{' + excludeArray.join(',') + '}'
  return vscode.workspace.findFiles(glob, excludeString, 100, token)
}
