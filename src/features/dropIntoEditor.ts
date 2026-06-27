import * as path from 'node:path'
import * as vscode from 'vscode'
import * as URI from 'vscode-uri'
import { t as l10nT } from '../core/l10n.js'
import { logger } from '../core/logger.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from './antora/antoraDocument.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import {
  computeImageMacroTarget,
  findFreeDestination,
  isImageFile,
  isWithinDirectory,
  resolveImagesDir,
} from './imageInsertion.js'

const remoteOrAbsoluteImagesDirRx = /^(?:[a-z]+:)?\/\/|^[/\\]|^[a-z]:[/\\]/i

const linkEditKind = vscode.DocumentDropOrPasteEditKind.Empty.append(
  'asciidoc',
  'image',
  'link',
)
const copyEditKind = vscode.DocumentDropOrPasteEditKind.Empty.append(
  'asciidoc',
  'image',
  'copyInto',
)

export const dropImageMetadata: vscode.DocumentDropEditProviderMetadata = {
  providedDropEditKinds: [copyEditKind, linkEditKind],
  dropMimeTypes: ['text/uri-list'],
}

/** Where images for a given document should live, and how to target them. */
interface ImagesLocation {
  /** Directory under which copied images are stored. */
  directory: vscode.Uri
  /**
   * Under Antora a copied image is targeted by its bare file name (the pipeline
   * resolves it within the module's image family), whereas outside Antora the
   * target is the path relative to `imagesdir`.
   */
  antora: boolean
}

export class DropImageIntoEditorProvider
  implements vscode.DocumentDropEditProvider
{
  constructor(
    private readonly asciidocLoader: AsciidocLoader,
    private readonly workspaceState: vscode.Memento,
  ) {}

  async provideDocumentDropEdits(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentDropEdit[] | undefined> {
    const configuration = vscode.workspace.getConfiguration(
      'asciidoc',
      textDocument,
    )
    if (!configuration.get('editor.enableDrop', true)) {
      return undefined
    }

    const uriList = await dataTransfer.get('text/uri-list')?.asString()
    if (!uriList || token.isCancellationRequested) {
      return undefined
    }
    const imageUris = parseUriList(uriList).filter(isImageFile)
    if (imageUris.length === 0) {
      return undefined
    }

    const imagesDir = await resolveImagesDir(
      this.asciidocLoader,
      textDocument,
      textDocument.offsetAt(position),
    )

    // Always offer to insert a link, preserving the historical behavior.
    const linkEdit = new vscode.DocumentDropEdit(
      imageMacros(
        imageUris.map((uri) =>
          computeImageMacroTarget(textDocument.uri, uri, imagesDir),
        ),
      ),
      l10nT('dropImage.insertLink'),
      linkEditKind,
    )

    // Offer to copy when enabled and at least one image cannot be linked
    // cleanly from where it currently sits.
    const copyEdit =
      configuration.get<'smart' | 'never'>(
        'editor.drop.copyIntoWorkspace',
        'smart',
      ) !== 'never'
        ? await this.tryBuildCopyEdit(textDocument, imageUris, imagesDir)
        : undefined

    // The first edit is applied when the user does not pick from the widget, so
    // copying — when offered — becomes the default for poorly accessible images.
    return copyEdit ? [copyEdit, linkEdit] : [linkEdit]
  }

  private async tryBuildCopyEdit(
    textDocument: vscode.TextDocument,
    imageUris: vscode.Uri[],
    imagesDir: string,
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const location = await this.resolveImagesLocation(textDocument, imagesDir)
    if (location === undefined) {
      return undefined
    }
    try {
      const workspaceEdit = new vscode.WorkspaceEdit()
      const targets: string[] = []
      let copies = 0
      for (const imageUri of imageUris) {
        if (isWithinDirectory(imageUri, location.directory)) {
          // Already conveniently located: a plain link is enough.
          targets.push(
            computeImageMacroTarget(textDocument.uri, imageUri, imagesDir),
          )
          continue
        }
        const destination = await findFreeDestination(
          location.directory,
          path.basename(imageUri.fsPath),
        )
        const contents = await vscode.workspace.fs.readFile(imageUri)
        workspaceEdit.createFile(destination, {
          contents,
          ignoreIfExists: false,
        })
        targets.push(
          location.antora
            ? encodeURI(path.basename(destination.fsPath))
            : computeImageMacroTarget(textDocument.uri, destination, imagesDir),
        )
        copies++
      }
      if (copies === 0) {
        // Every image is already in place; nothing to copy.
        return undefined
      }
      const edit = new vscode.DocumentDropEdit(
        imageMacros(targets),
        l10nT('dropImage.insertAndCopy'),
        copyEditKind,
      )
      edit.additionalEdit = workspaceEdit
      return edit
    } catch (err) {
      logger.warn(`Unable to prepare the image copy on drop, cause: ${err}`)
      return undefined
    }
  }

  /**
   * Resolve where dropped images should be copied: the current module's image
   * family under Antora, otherwise the document's `imagesdir`. Returns
   * `undefined` when copying does not apply (non-file document, or an
   * `imagesdir` that points outside the project).
   */
  private async resolveImagesLocation(
    textDocument: vscode.TextDocument,
    imagesDir: string,
  ): Promise<ImagesLocation | undefined> {
    if (textDocument.uri.scheme !== 'file') {
      return undefined
    }

    const antoraContext = await getAntoraDocumentContext(
      textDocument.uri,
      this.workspaceState,
    )
    if (antoraContext !== undefined) {
      const antoraConfig = await getAntoraConfig(textDocument.uri)
      const module = antoraContext.resourceContext.module
      if (antoraConfig !== undefined && module) {
        return {
          directory: vscode.Uri.file(
            path.join(
              antoraConfig.contentSourceRootFsPath,
              'modules',
              module,
              'images',
            ),
          ),
          antora: true,
        }
      }
    }

    if (remoteOrAbsoluteImagesDirRx.test(imagesDir)) {
      return undefined
    }
    const directory = imagesDir
      ? vscode.Uri.joinPath(
          URI.Utils.dirname(textDocument.uri),
          ...imagesDir.split('/').filter(Boolean),
        )
      : URI.Utils.dirname(textDocument.uri)
    return { directory, antora: false }
  }
}

/** Build a snippet that inserts one `image::target[]` block per target. */
function imageMacros(targets: readonly string[]): vscode.SnippetString {
  // `appendText` keeps `$`, `}` and `\` in file names from being interpreted as
  // snippet syntax.
  const snippet = new vscode.SnippetString()
  targets.forEach((target, index) => {
    if (index > 0) {
      snippet.appendText('\n')
    }
    snippet.appendText(`image::${target}[]`)
  })
  return snippet
}

function parseUriList(uriList: string): vscode.Uri[] {
  return (
    uriList
      .split('\n')
      .map((line) => line.replace('\r', '').trim())
      // The text/uri-list format allows blank lines and `#` comments.
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => vscode.Uri.parse(line))
  )
}
