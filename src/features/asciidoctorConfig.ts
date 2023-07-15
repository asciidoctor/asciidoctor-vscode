import * as path from 'path'
import * as vscode from 'vscode'
import { Asciidoctor } from '@asciidoctor/core'
import { AsciidoctorProcessor } from '../asciidoctorProcessor'

const MAX_DEPTH_SEARCH_ASCIIDOCCONFIG = 100

export interface AsciidoctorConfigProvider {
  activate(registry: Asciidoctor.Extensions.Registry, documentUri: vscode.Uri): Promise<void>;
}

/**
 * .asciidoctorconfig support.
 */
export class AsciidoctorConfig implements AsciidoctorConfigProvider {
  private readonly prependExtension: Asciidoctor.Extensions.Preprocessor

  constructor () {
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    this.prependExtension = asciidoctorProcessor.processor.Extensions.createPreprocessor('PrependConfigPreprocessorExtension', {
      postConstruct: function () {
        this.asciidoctorConfigContent = ''
      },
      process: function (doc, reader) {
        if (this.asciidoctorConfigContent.length > 0) {
          // otherwise an empty line at the beginning breaks level 0 detection
          reader.pushInclude(this.asciidoctorConfigContent, undefined, undefined, 1, {})
        }
      },
    }).$new()
  }

  public async activate (registry: Asciidoctor.Extensions.Registry, documentUri: vscode.Uri) {
    await this.configureAsciidoctorConfigPrependExtension(documentUri)
    registry.preprocessor(this.prependExtension)
  }

  private async configureAsciidoctorConfigPrependExtension (documentUri: vscode.Uri) {
    const asciidoctorConfigContent = await getAsciidoctorConfigContent(documentUri)
    if (asciidoctorConfigContent !== undefined) {
      (this.prependExtension as any).asciidoctorConfigContent = asciidoctorConfigContent
    } else {
      (this.prependExtension as any).asciidoctorConfigContent = ''
    }
  }
}

async function exists (uri: vscode.Uri) {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch (err) {
    if (err && err.code === 'FileNotFound') {
      return false
    }
    throw err
  }
}

export async function getAsciidoctorConfigContent (documentUri: vscode.Uri): Promise<String | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri)
  if (workspaceFolder === undefined) {
    return undefined
  }

  const configContents: string[] = []
  let currentFile: string = documentUri.fsPath
  let increment = 0
  while (currentFile !== undefined && currentFile !== workspaceFolder.uri.fsPath && increment < MAX_DEPTH_SEARCH_ASCIIDOCCONFIG) {
    increment++
    currentFile = path.dirname(currentFile)
    configContents.push(await getConfigContent(currentFile, '.asciidoctorconfig.adoc'))
    configContents.push(await getConfigContent(currentFile, '.asciidoctorconfig'))
  }

  const configContentsOrderedAndFiltered = configContents
    .filter((config) => config !== undefined)
    .reverse()

  if (configContentsOrderedAndFiltered.length > 0) {
    return configContentsOrderedAndFiltered.join('\n\n')
  }
  return undefined
}

async function getConfigContent (folderPath: string, configFilename: string) {
  const asciidoctorConfigUri = vscode.Uri.joinPath(vscode.Uri.file(folderPath), configFilename)
  if (await exists(asciidoctorConfigUri)) {
    const asciidoctorConfigContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(asciidoctorConfigUri))
    return `:asciidoctorconfigdir: ${folderPath}\n\n${asciidoctorConfigContent.trim()}\n\n`
  }
  return undefined
}
