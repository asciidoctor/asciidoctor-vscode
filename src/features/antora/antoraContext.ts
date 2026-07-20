import ospath from 'node:path'
import type { ContentCatalog } from '@antora/content-classifier'
import * as vscode from 'vscode'
import { Memento, Uri } from 'vscode'
import { disposeAll } from '../../core/dispose.js'
import { t as l10n_t } from '../../core/l10n.js'
import { logger } from '../../core/logger.js'
import AntoraCompletionProvider from './antoraCompletionProvider.js'
import {
  antoraConfigFileExists,
  getAntoraConfig,
  getAttributes,
} from './antoraDocument.js'
import { createAntoraSupportPromptHandler } from './antoraSupportPrompt.js'

export interface AntoraResourceContext {
  component: string
  version: string
  module: string
}

export class AntoraConfig {
  public contentSourceRootPath: string
  public contentSourceRootFsPath: string

  private static versionMap = new Map<string, number>()

  constructor(
    public uri: vscode.Uri,
    public config: { [key: string]: any },
  ) {
    const path = uri.path
    this.contentSourceRootPath = path.slice(0, path.lastIndexOf('/'))
    this.contentSourceRootFsPath = ospath.dirname(uri.fsPath)
    if (config.version === true || config.version === undefined) {
      config.version = this.getVersionForPath(path)
    } else if (config.version !== null && typeof config.version !== 'string') {
      // An unquoted `version: 2.0` comes out of the YAML parser as a number;
      // the content classifier requires a string (or null for an unversioned
      // component) and would otherwise throw, taking the whole content
      // catalog down with it.
      config.version = String(config.version)
    }
  }

  public getVersionForPath(path: string): string {
    const version = AntoraConfig.versionMap.get(path)
    if (version) {
      return `V-${version}`
    }

    const nextVersion = AntoraConfig.versionMap.size + 1
    AntoraConfig.versionMap.set(path, nextVersion)
    return `V-${nextVersion}`
  }
}

export class AntoraDocumentContext {
  private PERMITTED_FAMILIES = [
    'attachment',
    'example',
    'image',
    'page',
    'partial',
  ]

  constructor(
    private antoraContext: AntoraContext,
    public resourceContext: AntoraResourceContext,
  ) {}

  public resolveAntoraResourceIds(
    id: string,
    defaultFamily: string,
  ): string | undefined {
    const resource = this.antoraContext.contentCatalog.resolveResource(
      id,
      this.resourceContext,
      defaultFamily,
      this.PERMITTED_FAMILIES,
    )
    if (resource) {
      return resource.src?.abspath
    }
    return undefined
  }

  /**
   * Resolve a resource id to its content catalog entry. Unlike
   * `resolveAntoraResourceIds`, this exposes the whole resource (including its
   * loaded `contents`) so callers can, for example, read the anchors declared in
   * a referenced page.
   */
  public resolveResource(id: string, defaultFamily: string): any | undefined {
    return this.antoraContext.contentCatalog.resolveResource(
      id,
      this.resourceContext,
      defaultFamily,
      this.PERMITTED_FAMILIES,
    )
  }

  public getComponents() {
    return this.antoraContext.contentCatalog.getComponents()
  }

  public getImages() {
    return this.antoraContext.contentCatalog.findBy({ family: 'image' })
  }

  public getContentCatalog() {
    return this.antoraContext.contentCatalog
  }
}

export class AntoraContext {
  constructor(public contentCatalog: ContentCatalog) {}

  public async getResource(
    textDocumentUri: Uri,
  ): Promise<AntoraResourceContext | undefined> {
    const antoraConfig = await getAntoraConfig(textDocumentUri)
    if (antoraConfig === undefined) {
      return undefined
    }
    const contentSourceRootPath = antoraConfig.contentSourceRootFsPath
    const config = antoraConfig.config
    if (config.name === undefined) {
      logger.debug(
        `Antora: the configuration file at ${antoraConfig.uri.path} has no "name", ${textDocumentUri.path} cannot be associated with a component`,
      )
      return undefined
    }
    // Vinyl will normalize the path to a system-dependent path :(
    const relativePath = ospath.relative(
      contentSourceRootPath,
      textDocumentUri.fsPath,
    )
    const page = this.contentCatalog.getByPath({
      component: config.name,
      version: config.version,
      path: relativePath,
    })
    if (page === undefined) {
      logger.debug(
        `Antora: no entry in the content catalog for component "${config.name}", version "${config.version}", path "${relativePath}" (looked up for ${textDocumentUri.path}). The document may be outside modules/*/{pages,partials,examples,...}, or it was not picked up when the content catalog was built (see the "Antora: resolved ... antora.yml" and "duplicate component" log lines above).`,
      )
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
  private readonly _featureDisposables: vscode.Disposable[] = []

  private constructor() {}

  public static getInstance(workspaceState: Memento) {
    if (AntoraSupportManager.instance) {
      AntoraSupportManager.workspaceState = workspaceState
      return AntoraSupportManager.instance
    }
    AntoraSupportManager.instance = new AntoraSupportManager()
    AntoraSupportManager.workspaceState = workspaceState
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined = workspaceState.get(
      'antoraSupportSetting',
    )
    if (isEnableAntoraSupportSettingDefined === true) {
      AntoraSupportManager.instance.registerFeatures()
    } else if (isEnableAntoraSupportSettingDefined === undefined) {
      // The choice has not been made yet: ask the first time an Antora document
      // is opened. The handler keeps the prompt to a single occurrence — see
      // `createAntoraSupportPromptHandler` (asciidoctor/asciidoctor-vscode#896).
      const handleOpenedDocument =
        createAntoraSupportPromptHandler<vscode.TextDocument>({
          // Checked before anything else so that, with the prompt disabled
          // (the default), opening documents never triggers the potentially
          // expensive antora.yml lookup.
          isPromptEnabled: () =>
            vscode.workspace
              .getConfiguration('asciidoc.antora', null)
              .get<boolean>('showEnableAntoraPrompt', false),
          appliesToAntora: (textDocument) => {
            // Convert Git URI to `file://` URI since the Git file system
            // provider produces unexpected results.
            const textDocumentUri =
              textDocument.uri.scheme === 'git'
                ? Uri.file(textDocument.uri.path)
                : textDocument.uri
            return antoraConfigFileExists(textDocumentUri)
          },
          askToEnable: async () => {
            const yesAnswer = l10n_t('antora.activateSupport.yes')
            const neverAnswer = l10n_t('antora.activateSupport.never')
            const answer = await vscode.window.showInformationMessage(
              l10n_t('antora.activateSupport.message'),
              yesAnswer,
              l10n_t('antora.activateSupport.no'),
              neverAnswer,
            )
            // "Yes" enables, "Never" persists a refusal so we stop asking. "No"
            // and dismissing the prompt are both "not now": leave the choice
            // unmade (`undefined`) so it can be asked again in a later session.
            if (answer === yesAnswer) {
              return true
            }
            if (answer === neverAnswer) {
              return false
            }
            return undefined
          },
          getDecision: () =>
            workspaceState.get('antoraSupportSetting') as boolean | undefined,
          setDecision: async (enabled) => {
            await workspaceState.update('antoraSupportSetting', enabled)
          },
          enableFeatures: () =>
            AntoraSupportManager.instance.registerFeatures(),
          dispose: () => onDidOpenAsciiDocFileAskAntoraSupport.dispose(),
        })
      const onDidOpenAsciiDocFileAskAntoraSupport =
        vscode.workspace.onDidOpenTextDocument(handleOpenedDocument)
      AntoraSupportManager.instance._disposables.push(
        onDidOpenAsciiDocFileAskAntoraSupport,
      )
      // The extension is usually activated *because* an AsciiDoc document was
      // just opened, so that document's open event has already fired and the
      // listener above will never see it. Run the handler over the documents
      // already open, otherwise a session where the user opens a single Antora
      // page never shows the prompt.
      for (const textDocument of vscode.workspace.textDocuments) {
        handleOpenedDocument(textDocument)
      }
    }
    return AntoraSupportManager.instance
  }

  public async getAttributes(
    textDocumentUri: Uri,
  ): Promise<{ [key: string]: string }> {
    const antoraEnabled = this.isEnabled()
    if (antoraEnabled) {
      return getAttributes(textDocumentUri)
    }
    return {}
  }

  public isEnabled(): Boolean {
    // look for Antora support setting in workspace state
    const isEnableAntoraSupportSettingDefined =
      AntoraSupportManager.workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      return true
    }
    // choice has not been made or Antora is explicitly disabled
    return false
  }

  /**
   * Register the features gated on Antora support (currently the `{` attributes
   * completion). Idempotent, so enabling support again — e.g. through the
   * "Enable Antora support" command after the prompt already enabled it — does
   * not stack duplicate providers.
   */
  public registerFeatures(): void {
    if (this._featureDisposables.length > 0) {
      return
    }
    const attributesCompletionProvider =
      vscode.languages.registerCompletionItemProvider(
        {
          language: 'asciidoc',
          scheme: 'file',
        },
        new AntoraCompletionProvider(),
        '{',
      )
    this._featureDisposables.push(attributesCompletionProvider)
  }

  /** Tear down the features registered by {@link registerFeatures}. */
  public unregisterFeatures(): void {
    disposeAll(this._featureDisposables)
    this._featureDisposables.length = 0
  }

  public dispose(): void {
    this.unregisterFeatures()
    disposeAll(this._disposables)
  }
}
