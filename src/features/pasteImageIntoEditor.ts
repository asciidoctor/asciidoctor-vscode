import * as vscode from 'vscode'
import { t as l10nT } from '../core/l10n.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import {
  buildImageCopyEdit,
  computeImageMacroTarget,
  type ImageSource,
  imageCopyEditKind,
  imageLinkEditKind,
  imageMacrosSnippet,
  isImageFile,
  parseUriList,
  resolveImagesDir,
  resolveImagesLocation,
} from './imageInsertion.js'

const imageMimePrefix = 'image/'

export const pasteImageMetadata: vscode.DocumentPasteProviderMetadata = {
  providedPasteEditKinds: [imageCopyEditKind, imageLinkEditKind],
  pasteMimeTypes: ['text/uri-list', 'image/*'],
}

/**
 * Insert an image when pasting into an AsciiDoc document, mirroring the
 * drag-and-drop experience. Two clipboard shapes are handled: a pasted image
 * *file* (a `text/uri-list`, offering a link and — when copying is enabled and
 * the file is poorly accessible — a copy), and a pasted *bitmap* (e.g. a
 * screenshot under `image/png`), which has no source file and can therefore
 * only be copied into the project.
 */
export class PasteImageIntoEditorProvider
  implements vscode.DocumentPasteEditProvider
{
  constructor(
    private readonly asciidocLoader: AsciidocLoader,
    private readonly workspaceState: vscode.Memento,
  ) {}

  async provideDocumentPasteEdits(
    textDocument: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    const configuration = vscode.workspace.getConfiguration(
      'asciidoc',
      textDocument,
    )
    if (!configuration.get('editor.paste.enabled', true)) {
      return undefined
    }

    const imagesDir = await resolveImagesDir(
      this.asciidocLoader,
      textDocument,
      textDocument.offsetAt(ranges[0].start),
    )
    const copyEnabled =
      configuration.get<'smart' | 'never'>(
        'editor.paste.copyIntoWorkspace',
        'smart',
      ) !== 'never'

    // A pasted image file is handled exactly like a drop: link, plus an
    // optional copy when the file is not already reachable.
    const uriList = await dataTransfer.get('text/uri-list')?.asString()
    const imageUris = uriList ? parseUriList(uriList).filter(isImageFile) : []
    if (imageUris.length > 0) {
      return this.buildFilePasteEdits(
        textDocument,
        imageUris,
        imagesDir,
        copyEnabled,
      )
    }

    // A pasted bitmap can only be copied; there is nothing to link to.
    if (!copyEnabled) {
      return undefined
    }
    const bitmaps = await collectPastedBitmaps(dataTransfer, token)
    if (bitmaps.length === 0 || token.isCancellationRequested) {
      return undefined
    }
    const copyEdit = await this.buildCopyEdit(textDocument, bitmaps, imagesDir)
    return copyEdit ? [copyEdit] : undefined
  }

  private async buildFilePasteEdits(
    textDocument: vscode.TextDocument,
    imageUris: vscode.Uri[],
    imagesDir: string,
    copyEnabled: boolean,
  ): Promise<vscode.DocumentPasteEdit[]> {
    const linkEdit = new vscode.DocumentPasteEdit(
      imageMacrosSnippet(
        imageUris.map((uri) =>
          computeImageMacroTarget(textDocument.uri, uri, imagesDir),
        ),
      ),
      l10nT('imageInsertion.insertLink'),
      imageLinkEditKind,
    )

    const copyEdit = copyEnabled
      ? await this.buildCopyEdit(
          textDocument,
          imageUris.map((uri) => ({ uri })),
          imagesDir,
        )
      : undefined

    // The first edit is the default applied without opening the paste widget.
    return copyEdit ? [copyEdit, linkEdit] : [linkEdit]
  }

  private async buildCopyEdit(
    textDocument: vscode.TextDocument,
    sources: readonly ImageSource[],
    imagesDir: string,
  ): Promise<vscode.DocumentPasteEdit | undefined> {
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
      sources,
      imagesDir,
      location,
    )
    if (copy === undefined) {
      return undefined
    }
    const edit = new vscode.DocumentPasteEdit(
      copy.snippet,
      l10nT('imageInsertion.insertAndCopy'),
      imageCopyEditKind,
    )
    edit.additionalEdit = copy.workspaceEdit
    return edit
  }
}

/** Read every `image/*` entry of the data transfer as named, in-memory bytes. */
async function collectPastedBitmaps(
  dataTransfer: vscode.DataTransfer,
  token: vscode.CancellationToken,
): Promise<{ name: string; data: Uint8Array }[]> {
  const items: { mime: string; file: vscode.DataTransferFile }[] = []
  for (const [mime, item] of dataTransfer) {
    if (!mime.startsWith(imageMimePrefix)) {
      continue
    }
    const file = item.asFile()
    if (file) {
      items.push({ mime, file })
    }
  }

  const bitmaps: { name: string; data: Uint8Array }[] = []
  for (const { mime, file } of items) {
    const data = await file.data()
    if (token.isCancellationRequested) {
      return []
    }
    bitmaps.push({ name: file.name || defaultBitmapName(mime), data })
  }
  return bitmaps
}

function defaultBitmapName(mime: string): string {
  const extension = mime.slice(imageMimePrefix.length) || 'png'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `image-${timestamp}.${extension}`
}
