import vscode, { CancellationTokenSource, FileType, Memento, Uri } from 'vscode'
import fs from 'fs'
import yaml from 'js-yaml'
import ospath, { posix as posixpath } from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'
import * as nls from 'vscode-nls'
import ContentCatalog from '@antora/content-classifier/lib/content-catalog'
import { getWorkspaceFolder } from '../../util/workspace'
import { dir, exists } from '../../util/file'

const MAX_DEPTH_SEARCH_ANTORACONFIG = 100
const localize = nls.loadMessageBundle()

export interface AntoraResourceContext {
  component: string;
  version: string;
  module: string;
}

export class AntoraConfig {
  public contentSourceRootPath: string
  public contentSourceRootFsPath: string
  constructor (public uri: vscode.Uri, public config: { [key: string]: any }) {
    const path = uri.path
    this.contentSourceRootPath = path.slice(0, path.lastIndexOf('/'))
    this.contentSourceRootFsPath = ospath.dirname(uri.fsPath)
  }
}

export class AntoraDocumentContext {
  private PERMITTED_FAMILIES = ['attachment', 'example', 'image', 'page', 'partial']

  constructor (private antoraContext: AntoraContext, public resourceContext: AntoraResourceContext) {
  }

  public resolveAntoraResourceIds (id: string, defaultFamily: string): string | undefined {
    const resource = this.antoraContext.contentCatalog.resolveResource(id, this.resourceContext, defaultFamily, this.PERMITTED_FAMILIES)
    if (resource) {
      return resource.src?.abspath
    }
    return undefined
  }

  public getComponents () {
    return this.antoraContext.contentCatalog.getComponents()
  }

  public getImages () {
    return this.antoraContext.contentCatalog.findBy({ family: 'image' })
  }

  public getContentCatalog () {
    return this.antoraContext.contentCatalog
  }
}

export class AntoraContext {
  constructor (public contentCatalog: ContentCatalog) {
  }

  public async getResource (textDocumentUri: Uri): Promise<AntoraResourceContext | undefined> {
    const antoraConfig = await getAntoraConfig(textDocumentUri)
    if (antoraConfig === undefined) {
      return undefined
    }
    const contentSourceRootPath = antoraConfig.contentSourceRootFsPath
    const config = antoraConfig.config
    if (config.name === undefined) {
      return undefined
    }
    const page = this.contentCatalog.getByPath({
      component: config.name,
      version: config.version,
      // Vinyl will normalize path to system dependent path :(
      path: ospath.relative(contentSourceRootPath, textDocumentUri.fsPath),
    })
    if (page === undefined) {
      return undefined
    }
    return page.src
  }
}

export class AntoraSupportManager implements vscode.Disposable {
  // eslint-disable-next-line no-use-before-define
  private static instance: AntoraSupportManager
  private static workspaceState: Memento
  private readonly _disposables: vscode.Disposable[] = []

  private constructor () {
  }

  public static getInstance (workspaceState: Memento) {
    if (AntoraSupportManager.instance) {
      AntoraSupportManager.workspaceState = workspaceState
      return AntoraSupportManager.instance
    }
    AntoraSupportManager.instance = new AntoraSupportManager()
    AntoraSupportManager.workspaceState = workspaceState
    const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined = workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
      if (enableAntoraSupport === true) {
        AntoraSupportManager.instance.registerFeatures()
      }
    } else if (isEnableAntoraSupportSettingDefined === undefined) {
      // choice has not been made
      const onDidOpenAsciiDocFileAskAntoraSupport = vscode.workspace.onDidOpenTextDocument(async (textDocument) => {
        if (await antoraConfigFileExists(textDocument.uri)) {
          const yesAnswer = localize('antora.activateSupport.yes', 'Yes')
          const noAnswer = localize('antora.activateSupport.no', 'No, thanks')
          const answer = await vscode.window.showInformationMessage(
            localize('antora.activateSupport.message', 'We detect that you are working with Antora. Do you want to activate Antora support?'),
            yesAnswer,
            noAnswer
          )
          await workspaceState.update('antoraSupportSetting', true)
          const enableAntoraSupport = answer === yesAnswer ? true : (answer === noAnswer ? false : undefined)
          await workspaceConfiguration.update('antora.enableAntoraSupport', enableAntoraSupport)
          if (enableAntoraSupport) {
            AntoraSupportManager.instance.registerFeatures()
          }
          // do not ask again to avoid bothering users
          onDidOpenAsciiDocFileAskAntoraSupport.dispose()
        }
      })
      AntoraSupportManager.instance._disposables.push(onDidOpenAsciiDocFileAskAntoraSupport)
    }
  }

  public static async isEnabled (workspaceState: Memento): Promise<Boolean> {
    return AntoraSupportManager.getInstance(workspaceState).isEnabled()
  }

  public async getAttributes (textDocumentUri: Uri): Promise<{ [key: string]: string }> {
    const antoraEnabled = this.isEnabled()
    if (antoraEnabled) {
      return getAttributes(textDocumentUri)
    }
    return {}
  }

  public isEnabled (): Boolean {
    const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined = AntoraSupportManager.workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
      if (enableAntoraSupport === true) {
        return true
      }
    }
    // choice has not been made or Antora is explicitly disabled
    return false
  }

  private registerFeatures (): void {
    const attributesCompletionProvider = vscode.languages.registerCompletionItemProvider({
      language: 'asciidoc',
      scheme: 'file',
    },
    new AntoraCompletionProvider(),
    '{'
    )
    this._disposables.push(attributesCompletionProvider)
  }

  public dispose (): void {
    disposeAll(this._disposables)
  }
}

export async function findAntoraConfigFile (textDocumentUri: Uri): Promise<Uri | undefined> {
  const asciidocFilePath = posixpath.normalize(textDocumentUri.path)
  const cancellationToken = new CancellationTokenSource()
  cancellationToken.token.onCancellationRequested((e) => {
    console.log('Cancellation requested, cause: ' + e)
  })
  const antoraConfigUris = await vscode.workspace.findFiles('**/antora.yml', undefined, 100, cancellationToken.token)
  // check for Antora configuration
  for (const antoraConfigUri of antoraConfigUris) {
    const antoraConfigParentDirPath = antoraConfigUri.path.slice(0, antoraConfigUri.path.lastIndexOf('/'))
    const modulesDirPath = posixpath.normalize(`${antoraConfigParentDirPath}/modules`)
    if (asciidocFilePath.startsWith(modulesDirPath) && asciidocFilePath.slice(modulesDirPath.length).match(/^\/[^/]+\/pages\/.*/)) {
      console.log(`Found an Antora configuration file at ${antoraConfigUri.path} for the AsciiDoc document ${asciidocFilePath}`)
      return antoraConfigUri
    }
  }
  const antoraConfigPaths = antoraConfigUris.map((uri) => uri.path)
  console.log(`Unable to find an applicable Antora configuration file in [${antoraConfigPaths.join(', ')}] for the AsciiDoc document ${asciidocFilePath}`)
  return undefined
}

export async function antoraConfigFileExists (textDocumentUri: Uri): Promise<boolean> {
  const workspaceFolderUri = vscode.workspace.getWorkspaceFolder(textDocumentUri)?.uri
  let currentDirectoryUri = dir(textDocumentUri, workspaceFolderUri)
  let depth = 0
  let antoraConfig: vscode.Uri
  while (currentDirectoryUri !== undefined && depth < MAX_DEPTH_SEARCH_ANTORACONFIG) {
    depth++
    const antoraConfigUri = vscode.Uri.joinPath(currentDirectoryUri, 'antora.yml')
    if (await exists(antoraConfigUri)) {
      antoraConfig = antoraConfigUri
      break
    }
    currentDirectoryUri = dir(currentDirectoryUri, workspaceFolderUri)
  }
  return antoraConfig !== undefined
}

export async function getAntoraConfigs (): Promise<AntoraConfig[]> {
  const cancellationToken = new CancellationTokenSource()
  cancellationToken.token.onCancellationRequested((e) => {
    console.log('Cancellation requested, cause: ' + e)
  })
  const antoraConfigUris = await vscode.workspace.findFiles('**/antora.yml', undefined, 100, cancellationToken.token)
  // check for Antora configuration
  const antoraConfigs = await Promise.all(antoraConfigUris.map(async (antoraConfigUri) => {
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
  }))
  return antoraConfigs.filter((c) => c) // filter undefined
}

export async function getAntoraConfig (textDocumentUri: Uri): Promise<AntoraConfig | undefined> {
  const antoraConfigUri = await findAntoraConfigFile(textDocumentUri)
  if (antoraConfigUri === undefined) {
    return undefined
  }
  let config = {}
  try {
    config = yaml.load(fs.readFileSync(antoraConfigUri.fsPath, 'utf8')) || {}
  } catch (err) {
    console.log(`Unable to parse ${antoraConfigUri.fsPath}, cause:` + err.toString())
  }
  return new AntoraConfig(antoraConfigUri, config)
}

export async function getAttributes (textDocumentUri: Uri): Promise<{ [key: string]: string }> {
  const antoraConfig = await getAntoraConfig(textDocumentUri)
  if (antoraConfig === undefined) {
    return {}
  }
  return antoraConfig.config.asciidoc?.attributes || {}
}

export async function getAntoraDocumentContext (textDocumentUri: Uri, workspaceState: Memento): Promise<AntoraDocumentContext | undefined> {
  const antoraSupportManager = AntoraSupportManager.getInstance(workspaceState)
  if (!antoraSupportManager.isEnabled()) {
    return undefined
  }
  try {
    const antoraConfigs = await getAntoraConfigs()
    const contentAggregate: { name: string, version: string, files: any[] }[] = (await Promise.all(antoraConfigs
      .filter((antoraConfig) => antoraConfig.config !== undefined && 'name' in antoraConfig.config && 'version' in antoraConfig.config)
      .map(async (antoraConfig) => {
        const workspaceFolder = getWorkspaceFolder(antoraConfig.uri)
        const workspaceRelative = posixpath.relative(workspaceFolder.uri.path, antoraConfig.contentSourceRootPath)
        const globPattern = 'modules/*/{attachments,examples,images,pages,partials,assets}/**'
        const files = await Promise.all((await vscode.workspace.findFiles(`${workspaceRelative ? `${workspaceRelative}/` : ''}${globPattern}`)).map(async (file) => {
          const contentSourceRootPath = antoraConfig.contentSourceRootPath
          return {
            base: contentSourceRootPath,
            path: posixpath.relative(contentSourceRootPath, file.path),
            contents: Buffer.from((await vscode.workspace.fs.readFile(file))),
            extname: posixpath.extname(file.path),
            stem: posixpath.basename(file.path, posixpath.extname(file.path)),
            src: {
              abspath: file.path,
              basename: posixpath.basename(file.path),
              editUrl: '',
              extname: posixpath.extname(file.path),
              path: file.path,
              stem: posixpath.basename(file.path, posixpath.extname(file.path)),
            },
          }
        }))
        return {
          name: antoraConfig.config.name,
          version: antoraConfig.config.version,
          ...antoraConfig.config,
          files,
        }
      })))
    let classifyContent = await import('@antora/content-classifier')
    if ('default' in classifyContent) {
      classifyContent = classifyContent.default // default export
    }
    const contentCatalog = await classifyContent({
      site: {},
    }, contentAggregate)
    const antoraContext = new AntoraContext(contentCatalog)
    const antoraResourceContext = await antoraContext.getResource(textDocumentUri)
    if (antoraResourceContext === undefined) {
      return undefined
    }
    return new AntoraDocumentContext(antoraContext, antoraResourceContext)
  } catch (err) {
    console.error(`Unable to get Antora context for ${textDocumentUri}`, err)
    return undefined
  }
}
