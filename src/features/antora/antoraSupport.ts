import vscode, { CancellationTokenSource, Uri } from 'vscode'
import fs from 'fs'
import yaml from 'js-yaml'
import * as path from 'path'
import AntoraCompletionProvider from './antoraCompletionProvider'
import { disposeAll } from '../../util/dispose'

export class AntoraSupportManager {
  private readonly _disposables: vscode.Disposable[] = []

  public constructor (private readonly context: vscode.ExtensionContext) {
    this.context = context
    const completionProvider = vscode.languages.registerCompletionItemProvider(
      {
        language: 'asciidoc',
        scheme: 'file',
      },
      new AntoraCompletionProvider(),
      '{'
    )

    const onDidOpenAsciiDocFileAskAntoraSupport = vscode.workspace.onDidOpenTextDocument(async (textDocument) => {
      const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
      // look for Antora settings in workspaceState
      const workspaceState: vscode.Memento = this.context.workspaceState
      const isEnableAntoraSupportSettingDefined = await workspaceState.get('antoraSupportSetting')
      let enableAntoraSupport
      if (isEnableAntoraSupportSettingDefined === true) { // choice has already been made
        enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport')
        if (enableAntoraSupport === true) { // User does want Antora Support
          this._disposables.push(completionProvider)
        }
        if (enableAntoraSupport === false) { // User does not want Antora Support
          onDidOpenAsciiDocFileAskAntoraSupport.dispose()
        }
      }
      if (isEnableAntoraSupportSettingDefined === undefined) { // choice has not been made
        if (await getValidConfig(textDocument)) {
          const answer = await vscode.window.showInformationMessage('We detect that you are working with Antora. Do you want to active Antora support?', 'yes', 'no thanks')
          await workspaceState.update('antoraSupportSetting', true)
          enableAntoraSupport = answer === 'yes' ? true : (answer === 'no thanks' ? false : undefined)
          await workspaceConfiguration.update('antora.enableAntoraSupport', enableAntoraSupport)
          if (answer === 'yes') {
            this._disposables.push(completionProvider)
            onDidOpenAsciiDocFileAskAntoraSupport.dispose()
          }
          if (answer === 'no thanks') {
            onDidOpenAsciiDocFileAskAntoraSupport.dispose()
          }
          if (answer === undefined) {
            onDidOpenAsciiDocFileAskAntoraSupport.dispose()
          }
        }
      }
    })
    this._disposables.push(onDidOpenAsciiDocFileAskAntoraSupport)
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
