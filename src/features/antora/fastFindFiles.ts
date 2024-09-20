import vscode from 'vscode'

let findFiles2Available : boolean | undefined

const exclude : string[] = [
  '**/.DS_Store',
  '**/node_modules',
  '**/vendor',
  '**/coverage',
  '**/build',
]
const excludeString = '{' + exclude.join(',') + '}'

const antoraYmlGlob = '{antora/monorepo-docs/antora.yml,libs/*/docs/*/antora.yml,apps/*/docs/*/antora.yml}'

// Use proposed findFiles2 api if available
export async function fastFindFiles (inputGlob: string, token?: vscode.CancellationToken) {
  const glob = inputGlob.includes('antora.yml') ? antoraYmlGlob : inputGlob

  if (findFiles2Available === false) {
    return vscode.workspace.findFiles(glob, excludeString, 100, token)
  }

  try {
    const files = await findFiles2(glob)
    if (!findFiles2Available) {
      console.info('[Antora] using findFiles2')
      findFiles2Available = true
    }
    return files
  } catch (e) {
    if (!e.message.includes('enabledApiProposals')) {
      throw e
    }
    console.info('[Antora] api proposals not enabled, falling back to findFiles')
    findFiles2Available = false
    return vscode.workspace.findFiles(glob, excludeString, 100, token)
  }

  async function findFiles2 (glob: string) : Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles2(glob, {
      useIgnoreFiles: true,
      // useDefaultExcludes: true,
      useDefaultSearchExcludes: true,
      useGlobalIgnoreFiles: true,
      useParentIgnoreFiles: true,
    }, token)
  }
}
