import vscode, { CancellationTokenSource, Uri } from 'vscode'
import fs from 'fs'
import yaml from 'js-yaml'
import * as path from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export class AntoraSupportManager implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = []

  public constructor (private readonly context: vscode.ExtensionContext) {
    this.context = context
    const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
    // look for Antora support setting in workspace state
    const workspaceState: vscode.Memento = this.context.workspaceState
    const isEnableAntoraSupportSettingDefined = workspaceState.get('antoraSupportSetting')
    if (isEnableAntoraSupportSettingDefined === true) {
      const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
      if (enableAntoraSupport === true) {
        this.activate()
      }
    } else if (isEnableAntoraSupportSettingDefined === undefined) {
      // choice has not been made
      const onDidOpenAsciiDocFileAskAntoraSupport = vscode.workspace.onDidOpenTextDocument(async (textDocument) => {
        if (await getValidConfig(textDocument)) {
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

export async function getAntoraConfig (textDocument: vscode.TextDocument): Promise<Uri | undefined> {
  const pathToAsciidocFile = textDocument.uri.fsPath
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

export async function getAttributes (textDocument: vscode.TextDocument): Promise<{ [key: string]: string }> {
  const antoraConfigUri = await getAntoraConfig(textDocument)
  const antoraConfigPath = antoraConfigUri.fsPath
  try {
    const doc = yaml.load(fs.readFileSync(antoraConfigPath, 'utf8'))
    return doc.asciidoc.attributes
  } catch (err) {
    console.log(`Unable to parse ${antoraConfigPath}, cause:` + err.toString())
    return {}
  }
}

export async function getValidConfig (textDocument: vscode.TextDocument): Promise<boolean> {
  return await getAntoraConfig(textDocument) !== undefined
}
