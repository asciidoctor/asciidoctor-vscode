import { spawn } from 'child_process'
import ospath from 'path'
import vscode, { Uri } from 'vscode'
import { getWorkspaceFolders } from './workspace'

/**
 * Find files across all workspace folders in the workspace using a glob expression.
 * Use `@vscode/ripgrep` to find files when there is a platform shell present.
 * @param glob A glob pattern that defines the files to search for.
 */
export async function findFiles (glob: string): Promise<Uri[]> {
  if ('browser' in process && (process as any).browser === true) {
    return vscode.workspace.findFiles(glob)
  }
  const searchedUris : Uri[] = []
  for (const workspaceFolder of getWorkspaceFolders()) {
    const rootUri = workspaceFolder.uri
    const paths = await ripgrep(glob, rootUri.fsPath)
    searchedUris.push(...paths.map((path) => Uri.joinPath(rootUri, path)))
  }
  return searchedUris
}

async function ripgrep (glob: string, rootFolder: string): Promise<string[]> {
  const rgPath = ospath.join(vscode.env.appRoot, `node_modules/@vscode/ripgrep/bin/rg${process.platform === 'win32' ? '.exe' : ''}`)
  return new Promise((resolve, reject) => {
    const rg = spawn(rgPath, ['--hidden', '--follow', '--files', '-g', glob], { cwd: rootFolder })
    let stdout : string = ''
    let stderr = ''

    rg.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    rg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    rg.on('close', (code) => {
      if (code === 0) {
        const result = stdout.split('\n')
          .map((path) => path.trim())
          .filter((path) => !!path) // ensure empty strings are deleted from answer
        resolve(result)
      } else if (code === 1) {
        resolve([])
      } else {
        reject(new Error(`code ${code}: ${stderr}`))
      }
    })

    rg.on('error', (err) => {
      reject(err)
    })
  })
}
