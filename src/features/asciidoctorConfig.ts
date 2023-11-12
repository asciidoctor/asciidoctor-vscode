import * as vscode from 'vscode'
import { Asciidoctor } from '@asciidoctor/core'
import { AsciidoctorProcessor } from '../asciidoctorProcessor'
import { dir, exists } from '../util/file'

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

export async function getAsciidoctorConfigContent (documentUri: vscode.Uri): Promise<String | undefined> {
  const workspaceFolderUri = vscode.workspace.getWorkspaceFolder(documentUri)?.uri
  let currentDirectoryUri = dir(documentUri, workspaceFolderUri)
  let depth = 0
  const asciidoctorConfigs: vscode.Uri[] = []
  while (currentDirectoryUri !== undefined && depth < MAX_DEPTH_SEARCH_ASCIIDOCCONFIG) {
    depth++
    const asciidoctorConfigAdocUri = vscode.Uri.joinPath(currentDirectoryUri, '.asciidoctorconfig.adoc')
    if (await exists(asciidoctorConfigAdocUri)) {
      asciidoctorConfigs.push(asciidoctorConfigAdocUri)
    }
    const asciidoctorConfigUri = vscode.Uri.joinPath(currentDirectoryUri, '.asciidoctorconfig')
    if ((await exists(asciidoctorConfigUri))) {
      asciidoctorConfigs.push(asciidoctorConfigUri)
    }
    currentDirectoryUri = dir(currentDirectoryUri, workspaceFolderUri)
  }
  asciidoctorConfigs.sort((a, b) => a.path.localeCompare(b.path))
  if (asciidoctorConfigs.length === 0) {
    return undefined
  }
  const configContents = []
  for (const asciidoctorConfig of asciidoctorConfigs) {
    const asciidoctorConfigContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(asciidoctorConfig))
    const asciidoctorConfigParentDirectory = asciidoctorConfig.path.slice(0, asciidoctorConfig.path.lastIndexOf('/'))
    configContents.push(`:asciidoctorconfigdir: ${asciidoctorConfigParentDirectory}\n\n${asciidoctorConfigContent.trim()}\n\n`)
  }
  if (configContents.length > 0) {
    return configContents.join('\n\n')
  }
  return undefined
}
