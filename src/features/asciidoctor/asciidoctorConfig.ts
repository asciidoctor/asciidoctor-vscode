import { Extensions, Preprocessor, Registry } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { dir, exists } from '../../core/file.js'

const MAX_DEPTH_SEARCH_ASCIIDOCCONFIG = 100

export interface AsciidoctorConfigProvider {
  activate(registry: Registry, documentUri: vscode.Uri): Promise<void>
}

/**
 * .asciidoctorconfig support.
 */
export class AsciidoctorConfig implements AsciidoctorConfigProvider {
  private readonly prependExtension: Preprocessor

  constructor() {
    this.prependExtension = Extensions.newPreprocessor(
      'PrependConfigPreprocessorExtension',
      {
        postConstruct: function () {
          this.asciidoctorConfigContent = ''
        },
        process: function (doc, reader) {
          if (this.asciidoctorConfigContent.length > 0) {
            // otherwise an empty line at the beginning breaks level 0 detection
            reader.pushInclude(
              this.asciidoctorConfigContent,
              undefined,
              undefined,
              1,
              {},
            )
          }
        },
      },
    )
  }

  public async activate(registry: Registry, documentUri: vscode.Uri) {
    await this.configureAsciidoctorConfigPrependExtension(documentUri)
    registry.preprocessor(this.prependExtension)
  }

  private async configureAsciidoctorConfigPrependExtension(
    documentUri: vscode.Uri,
  ) {
    const asciidoctorConfigContent =
      await getAsciidoctorConfigContent(documentUri)
    if (asciidoctorConfigContent !== undefined) {
      ;(this.prependExtension as any).asciidoctorConfigContent =
        asciidoctorConfigContent
    } else {
      ;(this.prependExtension as any).asciidoctorConfigContent = ''
    }
  }
}

export async function getAsciidoctorConfigContent(
  documentUri: vscode.Uri,
  workspaceFolderUris:
    | vscode.Uri[]
    | undefined = vscode.workspace.workspaceFolders?.map(
    (workspaceFolder) => workspaceFolder.uri,
  ),
): Promise<String | undefined> {
  const directories = getConfigSearchDirectories(
    documentUri,
    workspaceFolderUris,
  )
  const asciidoctorConfigs: vscode.Uri[] = []
  for (const directory of directories) {
    // .asciidoctorconfig is read before .asciidoctorconfig.adoc so that, within
    // the same directory, the latter takes precedence over the former.
    const asciidoctorConfigUri = vscode.Uri.joinPath(
      directory,
      '.asciidoctorconfig',
    )
    if (await exists(asciidoctorConfigUri)) {
      asciidoctorConfigs.push(asciidoctorConfigUri)
    }
    const asciidoctorConfigAdocUri = vscode.Uri.joinPath(
      directory,
      '.asciidoctorconfig.adoc',
    )
    if (await exists(asciidoctorConfigAdocUri)) {
      asciidoctorConfigs.push(asciidoctorConfigAdocUri)
    }
  }
  if (asciidoctorConfigs.length === 0) {
    return undefined
  }
  const configContents = []
  for (const asciidoctorConfig of asciidoctorConfigs) {
    const asciidoctorConfigContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(asciidoctorConfig),
    )
    const asciidoctorConfigParentUri = vscode.Uri.joinPath(
      asciidoctorConfig,
      '..',
    )
    const asciidoctorConfigDirectory =
      vscode.env.uiKind === vscode.UIKind.Desktop
        ? asciidoctorConfigParentUri.fsPath
        : asciidoctorConfigParentUri.path
    configContents.push(
      `:asciidoctorconfigdir: ${asciidoctorConfigDirectory}\n\n${asciidoctorConfigContent.trim()}\n\n`,
    )
  }
  return configContents.join('\n\n')
}

/**
 * Build the ordered list of directories to scan for `.asciidoctorconfig`
 * files, from the most general (applied first, lowest precedence) to the most
 * specific (applied last, highest precedence).
 *
 * The list is made of, in order:
 *
 * 1. the root of every *other* workspace folder, in a multi-root workspace —
 *    these hold project-wide configuration shared across roots (e.g. a folder
 *    dedicated to `.asciidoctorconfig` and `docinfo` assets);
 * 2. every directory on the path from the document's own workspace folder root
 *    down to the directory containing the document.
 *
 * When the document does not belong to any workspace folder, the search walks
 * up the file system from the document's directory (bounded by
 * {@link MAX_DEPTH_SEARCH_ASCIIDOCCONFIG}).
 */
function getConfigSearchDirectories(
  documentUri: vscode.Uri,
  workspaceFolderUris: vscode.Uri[] | undefined,
): vscode.Uri[] {
  const workspaceFolderUri =
    vscode.workspace.getWorkspaceFolder(documentUri)?.uri

  // Walk up from the document's directory to its workspace folder root.
  const documentChain: vscode.Uri[] = []
  let currentDirectoryUri = dir(documentUri, workspaceFolderUri)
  let depth = 0
  while (
    currentDirectoryUri !== undefined &&
    depth < MAX_DEPTH_SEARCH_ASCIIDOCCONFIG
  ) {
    depth++
    documentChain.push(currentDirectoryUri)
    currentDirectoryUri = dir(currentDirectoryUri, workspaceFolderUri)
  }
  // documentChain is ordered deepest first; reverse it so the workspace folder
  // root comes first (outermost, lowest precedence).
  documentChain.reverse()

  // In a multi-root workspace, also scan the root of the other workspace
  // folders. They are the most general configuration, so they come first.
  const knownPaths = new Set(documentChain.map((uri) => uri.path))
  const otherWorkspaceRoots = (workspaceFolderUris ?? [])
    .filter(
      (uri) =>
        uri.path !== workspaceFolderUri?.path && !knownPaths.has(uri.path),
    )
    .sort((a, b) => a.path.localeCompare(b.path))

  return [...otherWorkspaceRoots, ...documentChain]
}
