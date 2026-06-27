import * as vscode from 'vscode'
import { t as l10nT } from '../core/l10n.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import {
  buildImageCopyEdit,
  computeImageMacroTarget,
  imageCopyEditKind,
  imageLinkEditKind,
  imageMacrosSnippet,
  isImageFile,
  parseUriList,
  resolveImagesDir,
  resolveImagesLocation,
} from './imageInsertion.js'

export const dropImageMetadata: vscode.DocumentDropEditProviderMetadata = {
  providedDropEditKinds: [imageCopyEditKind, imageLinkEditKind],
  dropMimeTypes: ['text/uri-list'],
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
      imageMacrosSnippet(
        imageUris.map((uri) =>
          computeImageMacroTarget(textDocument.uri, uri, imagesDir),
        ),
      ),
      l10nT('imageInsertion.insertLink'),
      imageLinkEditKind,
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
    const location = await resolveImagesLocation(
      textDocument,
      imagesDir,
      this.workspaceState,
    )
    if (location === undefined) {
      return undefined
    }
    const copy = await buildImageCopyEdit(
      textDocument.uri,
      imageUris.map((uri) => ({ uri })),
      imagesDir,
      location,
    )
    if (copy === undefined) {
      return undefined
    }
    const edit = new vscode.DocumentDropEdit(
      copy.snippet,
      l10nT('imageInsertion.insertAndCopy'),
      imageCopyEditKind,
    )
    edit.additionalEdit = copy.workspaceEdit
    return edit
  }
}
