import vscode, { CancellationTokenSource, Memento, Uri, workspace } from 'vscode'
import fs from 'fs'
import yaml from 'js-yaml'
import * as path from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'
import * as nls from 'vscode-nls'
import aggregateContent from '@antora/content-aggregator'
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
  private readonly _disposables: vscode.Disposable[] = []

  public constructor (private readonly context: Memento) {
    this.context = context
    const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
    // look for Antora support setting in workspace state
    const workspaceState: vscode.Memento = this.context
    const isEnableAntoraSupportSettingDefined = workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
      if (enableAntoraSupport === true) {
        this.activate()
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
            this.activate()
          }
          // do not ask again to avoid bothering users
          onDidOpenAsciiDocFileAskAntoraSupport.dispose()
        }
      })
      this._disposables.push(onDidOpenAsciiDocFileAskAntoraSupport)
    }
  }

  private activate (): void {
    const completionProvider = vscode.languages.registerCompletionItemProvider(
      {
        language: 'asciidoc',
        scheme: 'file',
      },
      new AntoraCompletionProvider(),
      '{'
    )
    this._disposables.push(completionProvider)
  }

  public dispose (): void {
    disposeAll(this._disposables)
  }
}

export async function findAntoraConfigFile (textDocumentUri: Uri): Promise<Uri | undefined> {
  const pathToAsciidocFile = textDocumentUri.fsPath
  const cancellationToken = new CancellationTokenSource()
  cancellationToken.token.onCancellationRequested((e) => {
    console.log('Cancellation requested, cause: ' + e)
  })
  const antoraConfigs = await vscode.workspace.findFiles('**/antora.yml', '/node_modules/', 100, cancellationToken.token)
  // check for Antora configuration
  for (const antoraConfig of antoraConfigs) {
    const modulesPath = path.join(path.dirname(antoraConfig.path), 'modules')
    if (pathToAsciidocFile.startsWith(modulesPath) && pathToAsciidocFile.slice(modulesPath.length).match(/^\/[^/]+\/pages\/.*/)) {
      console.log(`Found an Antora configuration file at ${antoraConfig.fsPath} for the AsciiDoc document ${pathToAsciidocFile}`)
      return antoraConfig
    }
  }
  console.log(`Unable to find an applicable Antora configuration file in [${antoraConfigs.join(', ')}] for the AsciiDoc document ${pathToAsciidocFile}`)
  return undefined
}

export async function antoraConfigFileExists (textDocumentUri: Uri): Promise<boolean> {
  return await findAntoraConfigFile(textDocumentUri) !== undefined
}

export async function getAntoraConfig (textDocumentUri: Uri): Promise<AntoraConfig | undefined> {
  const antoraConfigUri = await findAntoraConfigFile(textDocumentUri)
  if (antoraConfigUri === undefined) {
    return undefined
  }
  const antoraConfigPath = antoraConfigUri.fsPath
  let config = {}
  try {
    config = yaml.load(fs.readFileSync(antoraConfigPath, 'utf8'))
  } catch (err) {
    console.log(`Unable to parse ${antoraConfigPath}, cause:` + err.toString())
  }
  return new AntoraConfig(antoraConfigPath, config)
}

export async function getAttributes (textDocumentUri: Uri): Promise<{ [key: string]: string }> {
  const doc = await getAntoraConfig(textDocumentUri)
  if (doc === undefined) {
    return {}
  }
  return doc.config.asciidoc?.attributes || {}
}

export async function getAntoraDocumentContext (textDocumentUri: Uri, workspaceState: Memento): Promise<AntoraDocumentContext | undefined> {
  const contentCatalog = await getContentCatalog(textDocumentUri, workspaceState)
  if (contentCatalog === undefined) {
    return undefined
  }
  const antoraContext = new AntoraContext(contentCatalog)
  const antoraResourceContext = await antoraContext.getResource(textDocumentUri)
  if (antoraResourceContext === undefined) {
    return undefined
  }
  return new AntoraDocumentContext(antoraContext, antoraResourceContext)
}

export async function getContentCatalog (textDocumentUri: Uri, workspaceState: Memento): Promise<ContentCatalog | undefined> {
  try {
    const playbook = await createPlaybook(textDocumentUri, workspaceState)
    if (playbook === undefined) {
      return undefined
    }
    const contentAggregate = await aggregateContent(playbook)
    return classifyContent(playbook, contentAggregate)
  } catch (e) {
    console.log(`Unable to create contentCatalog : ${e}`)
    throw e
  }
}

async function createPlaybook (textDocumentUri: Uri, workspaceState: Memento): Promise<{
  site: {};
  runtime: {};
  content: {
    sources: {
      startPath: string;
      branches: string;
      url: string
    }[]
  }
} | undefined> {
  const activeAntoraConfig = await getActiveAntoraConfig(textDocumentUri, workspaceState)
  if (activeAntoraConfig === undefined) {
    return undefined
  }
  const contentSourceRootPath = path.dirname(activeAntoraConfig.fsPath)
  const contentSourceRepositoryRootPath = workspace.getWorkspaceFolder(activeAntoraConfig).uri.fsPath
  // https://docs.antora.org/antora/latest/playbook/content-source-start-path/#start-path-key
  const startPath = path.relative(contentSourceRepositoryRootPath, contentSourceRootPath)
  return {
    content: {
      sources: [{
        url: contentSourceRepositoryRootPath,
        branches: 'HEAD',
        startPath,
      }],
    },
    runtime: {},
    site: {},
  }
}

function getActiveAntoraConfig (textDocumentUri: Uri, workspaceState: Memento): Promise<Uri | undefined> {
  // look for Antora support setting in workspace state
  const isEnableAntoraSupportSettingDefined = workspaceState.get('antoraSupportSetting')
  if (isEnableAntoraSupportSettingDefined === true) {
    const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
    const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
    if (enableAntoraSupport === true) {
      return findAntoraConfigFile(textDocumentUri)
    }
  }
  return undefined
}
