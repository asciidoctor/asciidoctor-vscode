import vscode, { Memento, Uri } from 'vscode'
import ospath from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'
import * as nls from 'vscode-nls'
import { antoraConfigFileExists, getAntoraConfig, getAttributes } from './antoraDocument'

const localize = nls.loadMessageBundle()

export interface AntoraResourceContext {
  component: string;
  version: string;
  module: string;
}

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
  constructor (public contentCatalog) {
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
      // Vinyl will normalize the path to a system-dependent path :(
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
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined = workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      AntoraSupportManager.instance.registerFeatures()
    } else if (isEnableAntoraSupportSettingDefined === undefined) {
      // choice has not been made
      const onDidOpenAsciiDocFileAskAntoraSupport = vscode.workspace.onDidOpenTextDocument(async (textDocument) => {
        // Convert Git URI to `file://` URI since the Git file system provider produces unexpected results.
        const textDocumentUri = textDocument.uri.scheme === 'git'
          ? Uri.file(textDocument.uri.path)
          : textDocument.uri
        if (await antoraConfigFileExists(textDocumentUri)) {
          const yesAnswer = localize('antora.activateSupport.yes', 'Yes')
          const noAnswer = localize('antora.activateSupport.no', 'No, thanks')
          const answer = await vscode.window.showInformationMessage(
            localize('antora.activateSupport.message', 'We detect that you are working with Antora. Do you want to activate Antora support?'),
            yesAnswer,
            noAnswer
          )
          const enableAntoraSupport = answer === yesAnswer
          await workspaceState.update('antoraSupportSetting', enableAntoraSupport)
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

  public async getAttributes (textDocumentUri: Uri): Promise<{ [key: string]: string }> {
    const antoraEnabled = this.isEnabled()
    if (antoraEnabled) {
      return getAttributes(textDocumentUri)
    }
    return {}
  }

  public isEnabled (): Boolean {
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined = AntoraSupportManager.workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      return true
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
