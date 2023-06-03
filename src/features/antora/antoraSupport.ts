import vscode, { CancellationTokenSource, Memento, Uri } from 'vscode'
import fs from 'fs'
import yaml from 'js-yaml'
import File from 'vinyl'
import * as path from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'
import * as nls from 'vscode-nls'
import classifyContent from '@antora/content-classifier'
import ContentCatalog from '@antora/content-classifier/lib/content-catalog'

const localize = nls.loadMessageBundle()

export interface AntoraResourceContext {
  component: string;
  version: string;
  module: string;
}

export class AntoraConfig {
  constructor (public fsPath: string, public config: { [key: string]: any }) {
  }
}

export class AntoraDocumentContext {
  private PERMITTED_FAMILIES = ['attachment', 'example', 'image', 'page', 'partial']

  constructor (private antoraContext: AntoraContext, private resourceContext: AntoraResourceContext) {
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
}

export class AntoraContext {
  constructor (public contentCatalog: ContentCatalog) {
  }

  public async getResource (textDocumentUri: Uri): Promise<AntoraResourceContext | undefined> {
    const antoraConfig = await getAntoraConfig(textDocumentUri)
    if (antoraConfig === undefined) {
      return undefined
    }
    const contentSourceRootPath = path.dirname(antoraConfig.fsPath)
    const config = antoraConfig.config
    if (config.name === undefined) {
      return undefined
    }
    const page = this.contentCatalog.getByPath({
      component: config.name,
      version: config.version,
      path: path.relative(contentSourceRootPath, textDocumentUri.path),
    }
    )
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
            localize('antora.activateSupport.message', 'We detect that you are working with Antora. Do you want to active Antora support?'),
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
    return (await AntoraSupportManager.getInstance(workspaceState)).isEnabled()
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

  public async getAntoraDocumentContext (textDocumentUri: Uri): Promise<AntoraDocumentContext | undefined> {
    const antoraEnabled = this.isEnabled()
    if (antoraEnabled) {
      return getAntoraDocumentContext(textDocumentUri, AntoraSupportManager.workspaceState)
    }
    return undefined
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
  const pathToAsciidocFile = textDocumentUri.toString()
  const cancellationToken = new CancellationTokenSource()
  cancellationToken.token.onCancellationRequested((e) => {
    console.log('Cancellation requested, cause: ' + e)
  })
  const antoraConfigs = await vscode.workspace.findFiles('**/antora.yml', '/node_modules/', 100, cancellationToken.token)
  // check for Antora configuration
  for (const antoraConfig of antoraConfigs) {
    const modulesUri = antoraConfig.with({ path: path.join(path.dirname(antoraConfig.path), 'modules') })
    if (pathToAsciidocFile.startsWith(modulesUri.toString()) && pathToAsciidocFile.slice(modulesUri.toString().length).match(/^\/[^/]+\/pages\/.*/)) {
      console.log(`Found an Antora configuration file at ${antoraConfig.toString()} for the AsciiDoc document ${pathToAsciidocFile}`)
      return antoraConfig
    }
  }
  console.log(`Unable to find an applicable Antora configuration file in [${antoraConfigs.join(', ')}] for the AsciiDoc document ${pathToAsciidocFile}`)
  return undefined
}

export async function antoraConfigFileExists (textDocumentUri: Uri): Promise<boolean> {
  return await findAntoraConfigFile(textDocumentUri) !== undefined
}

export async function getAntoraConfigs (): Promise<AntoraConfig[]> {
  const cancellationToken = new CancellationTokenSource()
  cancellationToken.token.onCancellationRequested((e) => {
    console.log('Cancellation requested, cause: ' + e)
  })
  const antoraConfigUris = await vscode.workspace.findFiles('**/antora.yml', '/node_modules/', 100, cancellationToken.token)
  // check for Antora configuration
  return Promise.all(antoraConfigUris.map(async (antoraConfigUri) => {
    let config = {}
    try {
      config = yaml.load(await vscode.workspace.fs.readFile(antoraConfigUri)) || {}
    } catch (err) {
      console.log(`Unable to parse ${antoraConfigUri}, cause:` + err.toString())
    }
    return new AntoraConfig(antoraConfigUri.fsPath, config)
  }))
}

export async function getAntoraConfig (textDocumentUri: Uri): Promise<AntoraConfig | undefined> {
  const antoraConfigUri = await findAntoraConfigFile(textDocumentUri)
  if (antoraConfigUri === undefined) {
    return undefined
  }
  const antoraConfigPath = antoraConfigUri.fsPath
  let config = {}
  try {
    config = yaml.load(fs.readFileSync(antoraConfigPath, 'utf8')) || {}
  } catch (err) {
    console.log(`Unable to parse ${antoraConfigPath}, cause:` + err.toString())
  }
  return new AntoraConfig(antoraConfigPath, config)
}

export async function getAttributes (textDocumentUri: Uri): Promise<{ [key: string]: string }> {
  const antoraConfig = await getAntoraConfig(textDocumentUri)
  if (antoraConfig === undefined) {
    return {}
  }
  return antoraConfig.config.asciidoc?.attributes || {}
}

export async function getAntoraDocumentContext (textDocumentUri: Uri, workspaceState: Memento): Promise<AntoraDocumentContext | undefined> {
  const antoraSupportManager = await AntoraSupportManager.getInstance(workspaceState)
  if (!antoraSupportManager.isEnabled()) {
    return undefined
  }
  const antoraConfigs = await getAntoraConfigs()
  const contentAggregate = await Promise.all(antoraConfigs
    .filter((antoraConfig) => antoraConfig.config !== undefined && 'name' in antoraConfig.config && 'version' in antoraConfig.config)
    .map(async (antoraConfig) => {
      const contentSourceRootPath = path.dirname(antoraConfig.fsPath)
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(antoraConfig.fsPath))
      const workspaceRelative = path.relative(workspaceFolder.uri.fsPath, contentSourceRootPath)
      const files = await Promise.all((await vscode.workspace.findFiles(workspaceRelative + '/modules/**/*')).map(async (file) => {
        return new File({
          base: contentSourceRootPath,
          path: path.relative(contentSourceRootPath, file.path),
          contents: Buffer.from((await vscode.workspace.fs.readFile(Uri.file(file.fsPath)))),
          extname: path.extname(file.path),
          stem: path.basename(file.path, path.extname(file.path)),
          src: {
            abspath: file.path,
            basename: path.basename(file.path),
            editUrl: '',
            extname: path.extname(file.path),
            fileUrl: file.fsPath,
            path: file.path,
            stem: path.basename(file.path, path.extname(file.path)),
          },
        })
      }))
      return {
        ...antoraConfig.config,
        files,
      }
    }))
  const contentCatalog = await classifyContent({
    site: {
    },
  }, contentAggregate)
  const antoraContext = new AntoraContext(contentCatalog)
  const antoraResourceContext = await antoraContext.getResource(textDocumentUri)
  if (antoraResourceContext === undefined) {
    return undefined
  }
  return new AntoraDocumentContext(antoraContext, antoraResourceContext)
}
