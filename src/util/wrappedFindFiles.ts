import { spawn } from 'child_process'
import { rgPath } from 'vscode-ripgrep'
import { Uri } from 'vscode'
import { getWorkspaceFolders } from './workspace'

async function ripgrep (glob: string, rootFolder: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const rg = spawn(rgPath, ['--files', '-g', glob], { cwd: rootFolder })
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

async function internalWrappedFindFiles (glob: string): Promise<Uri[]> {
  // const uris = await vscode.workspace.findFiles(glob, undefined, 100, token)
  const searchedUris : Uri[] = []

  for (const workspaceFolder of getWorkspaceFolders()) {
    const rootUri = workspaceFolder.uri
    const paths = await ripgrep(glob, rootUri.path)
    searchedUris.push(...paths.map((path) => Uri.joinPath(rootUri, path)))
  }
  return searchedUris
}

const cache: Map<string, { timestamp: number, uris: Uri[] }> = new Map()

function isCacheValid (timestamp: number): boolean {
  return (Date.now() - timestamp) < 5000
}

export async function wrappedFindFiles (glob: string): Promise<Uri[]> {
  const cacheEntry = cache.get(glob)
  if (cacheEntry && isCacheValid(cacheEntry.timestamp)) {
    return cacheEntry.uris
  }

  const uris = await internalWrappedFindFiles(glob)
  cache.set(glob, { timestamp: Date.now(), uris })
  return uris
}
