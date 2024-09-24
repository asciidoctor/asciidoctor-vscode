import vscode, { CancellationTokenSource, FileType } from 'vscode'
import { fastFindFiles } from './fastFindFiles'
import yaml from 'js-yaml'
import ospath from 'path'

export class AntoraConfig {
  public contentSourceRootPath: string
  public contentSourceRootFsPath: string

  private static versionMap = new Map<string, number>()

  constructor (public uri: vscode.Uri, public config: { [key: string]: any }) {
    const path = uri.path
    this.contentSourceRootPath = path.slice(0, path.lastIndexOf('/'))
    this.contentSourceRootFsPath = ospath.dirname(uri.fsPath)
    if (config.version === true || config.version === undefined) {
      config.version = this.getVersionForPath(path)
    }
  }

  public getVersionForPath (path: string): string {
    const version = AntoraConfig.versionMap.get(path)
    if (version) return `V-${version}`

    const nextVersion = AntoraConfig.versionMap.size + 1
    AntoraConfig.versionMap.set(path, nextVersion)
    return `V-${nextVersion}`
  }
}

const cache = {
  antoraConfigs: [] as AntoraConfig[],
  antoraConfigUris: [] as vscode.Uri[],
}

let ongoingRefreshPromise : Promise<void> | undefined

async function refreshAntoraConfigs (token?: vscode.CancellationToken) {
  if (!ongoingRefreshPromise) {
    ongoingRefreshPromise = asyncTriggerRefresh(token).then(() => {
      ongoingRefreshPromise = undefined
    })
  }
  await ongoingRefreshPromise

  async function asyncTriggerRefresh (token: vscode.CancellationToken): Promise<void> {
    const antoraConfigUris = await fastFindFiles('**/antora.yml', token)

    const cancellationToken = new CancellationTokenSource()
    cancellationToken.token.onCancellationRequested((e) => {
      console.log('Cancellation requested, cause: ' + e)
    })
    // check for Antora configuration
    const antoraConfigs = (await Promise.all(antoraConfigUris.map(async (antoraConfigUri) => {
      let config = {}
      const parentPath = antoraConfigUri.path.slice(0, antoraConfigUri.path.lastIndexOf('/'))
      const parentDirectoryStat = await vscode.workspace.fs.stat(antoraConfigUri.with({ path: parentPath }))
      if (parentDirectoryStat.type === (FileType.Directory | FileType.SymbolicLink) || parentDirectoryStat.type === FileType.SymbolicLink) {
        // ignore!
        return undefined
      }
      try {
        config = yaml.load(await vscode.workspace.fs.readFile(antoraConfigUri)) || {}
      } catch (err) {
        console.log(`Unable to parse ${antoraConfigUri}, cause:` + err.toString())
      }
      return new AntoraConfig(antoraConfigUri, config)
    }))).filter((c) => c) // filter undefined

    cache.antoraConfigs = antoraConfigs
    cache.antoraConfigUris = antoraConfigUris
  }
}

export async function getAntoraConfigs (token?: vscode.CancellationToken) {
  if (!cache.antoraConfigs.length) {
    await refreshAntoraConfigs(token)
  }
  return cache.antoraConfigs
}

export async function getAntoraConfigUris (token?: vscode.CancellationToken) {
  if (!cache.antoraConfigUris.length) {
    await refreshAntoraConfigs(token)
  }
  return cache.antoraConfigUris
}

// initial refresh of antora configs
refreshAntoraConfigs()

// Update the configs when an antora.yml file changes
vscode.workspace.onDidChangeTextDocument(async (event) => {
  if (event.document.uri.path.endsWith('antora.yml')) {
    await refreshAntoraConfigs()
  }
})
