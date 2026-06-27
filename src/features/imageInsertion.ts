/*
 * Shared logic for inserting an image into an AsciiDoc document, used by both
 * the drag-and-drop and (later) the paste providers. Because these helpers work
 * on `vscode.Uri`/the workspace file system, they are exercised by the
 * extension-host integration tests rather than the VS Code-independent unit
 * tests.
 */

import * as path from 'node:path'
import * as vscode from 'vscode'
import * as URI from 'vscode-uri'
import { logger } from '../core/logger.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from './antora/antoraDocument.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import { findImagesDirBeforeCursor } from './imagesDir.js'

const remoteOrAbsoluteImagesDirRx = /^(?:[a-z]+:)?\/\/|^[/\\]|^[a-z]:[/\\]/i

/** Kind of the edit that links a dragged/pasted image where it already is. */
export const imageLinkEditKind =
  vscode.DocumentDropOrPasteEditKind.Empty.append('asciidoc', 'image', 'link')

/** Kind of the edit that copies a dragged/pasted image into the project. */
export const imageCopyEditKind =
  vscode.DocumentDropOrPasteEditKind.Empty.append(
    'asciidoc',
    'image',
    'copyInto',
  )

export const imageFileExtensions: ReadonlySet<string> = new Set<string>([
  '.bmp',
  '.gif',
  '.ico',
  '.jpe',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tga',
  '.tif',
  '.tiff',
  '.webp',
])

export function isImageFile(uri: vscode.Uri): boolean {
  return imageFileExtensions.has(URI.Utils.extname(uri).toLowerCase())
}

/**
 * Resolve the `:imagesdir:` attribute in effect at `offset` in `textDocument`.
 *
 * Prefers the nearest entry declared in the text above that offset (so the
 * value reflects where the image is inserted, ignoring lines inside delimited
 * blocks — see {@link findImagesDirBeforeCursor} and #879), and falls back to
 * Asciidoctor for an `imagesdir` set outside the document text (e.g.
 * `.asciidoctorconfig`). Resolution never throws: a parse failure is logged and
 * degraded to an empty `imagesdir` (the document's own directory).
 */
export async function resolveImagesDir(
  asciidocLoader: AsciidocLoader,
  textDocument: vscode.TextDocument,
  offset: number,
): Promise<string> {
  const imagesDir = findImagesDirBeforeCursor(textDocument.getText(), offset)
  if (imagesDir !== undefined) {
    return imagesDir
  }
  try {
    const document = await asciidocLoader.load(textDocument)
    return document.getAttribute('imagesdir', '')
  } catch (err) {
    logger.warn(`Unable to resolve the imagesdir attribute, cause: ${err}`)
    return ''
  }
}

/**
 * Compute the `image::…[]` macro target for linking to `imageUri` from a
 * document at `docUri`, without copying anything.
 *
 * A resource that lives on the same file system as the document becomes a path
 * relative to the document, with the `imagesdir` prefix stripped so Asciidoctor
 * re-applies it at render time. Anything else (e.g. an `https:` image) keeps its
 * full URI.
 */
export function computeImageMacroTarget(
  docUri: vscode.Uri,
  imageUri: vscode.Uri,
  imagesdir: string,
): string {
  if (
    docUri.scheme !== imageUri.scheme ||
    docUri.authority !== imageUri.authority
  ) {
    return imageUri.toString(false)
  }
  const relativeToDoc = path
    .relative(URI.Utils.dirname(docUri).fsPath, imageUri.fsPath)
    .replace(/\\/g, '/')
  if (imagesdir && isWithinPosixPrefix(relativeToDoc, imagesdir)) {
    // Drop the imagesdir prefix (and the separator that follows it) so the
    // remaining path is relative to imagesdir, as Asciidoctor expects.
    const withoutImagesDir = relativeToDoc
      .slice(imagesdir.length)
      .replace(/^\/+/, '')
    return encodeURI(withoutImagesDir)
  }
  return encodeURI(relativeToDoc)
}

/**
 * Whether `posixPath` sits under the `prefix` directory, comparing whole path
 * segments (so `images` does not match `images-archive/…`).
 */
function isWithinPosixPrefix(posixPath: string, prefix: string): boolean {
  const normalizedPrefix = prefix.replace(/\/+$/, '')
  return (
    posixPath === normalizedPrefix ||
    posixPath.startsWith(`${normalizedPrefix}/`)
  )
}

/**
 * Whether `child` is the same as, or nested inside, the `dir` directory on the
 * same file system. Used to decide whether a dropped image is already
 * conveniently located (and therefore does not need to be copied).
 */
export function isWithinDirectory(child: vscode.Uri, dir: vscode.Uri): boolean {
  if (child.scheme !== dir.scheme || child.authority !== dir.authority) {
    return false
  }
  const relative = path.relative(dir.fsPath, child.fsPath)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

/**
 * Find a destination URI inside `directory` for a file named `fileName` that
 * does not clash with an existing file, appending `-1`, `-2`, … to the stem
 * until a free name is found (so a copy never overwrites an existing image).
 */
export async function findFreeDestination(
  directory: vscode.Uri,
  fileName: string,
): Promise<vscode.Uri> {
  const extension = path.extname(fileName)
  const stem = path.basename(fileName, extension)
  for (let index = 0; ; index++) {
    const candidateName =
      index === 0 ? fileName : `${stem}-${index}${extension}`
    const candidate = vscode.Uri.joinPath(directory, candidateName)
    if (!(await exists(candidate))) {
      return candidate
    }
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

/** Build a snippet that inserts one `image::target[]` block per target. */
export function imageMacrosSnippet(
  targets: readonly string[],
): vscode.SnippetString {
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

/** Parse a `text/uri-list` payload into URIs, skipping blank and comment lines. */
export function parseUriList(uriList: string): vscode.Uri[] {
  return (
    uriList
      .split('\n')
      .map((line) => line.replace('\r', '').trim())
      // The text/uri-list format allows blank lines and `#` comments.
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => vscode.Uri.parse(line))
  )
}

/** Where images for a given document should live, and how to target them. */
export interface ImagesLocation {
  /** Directory under which copied images are stored. */
  directory: vscode.Uri
  /**
   * Under Antora a copied image is targeted by its bare file name (the pipeline
   * resolves it within the module's image family), whereas outside Antora the
   * target is the path relative to `imagesdir`.
   */
  antora: boolean
}

/**
 * Resolve where dragged/pasted images should be copied: the current module's
 * image family under Antora, otherwise the document's `imagesdir`. Returns
 * `undefined` when copying does not apply (non-file document, or an `imagesdir`
 * that points outside the project).
 */
export async function resolveImagesLocation(
  textDocument: vscode.TextDocument,
  imagesDir: string,
  workspaceState: vscode.Memento,
): Promise<ImagesLocation | undefined> {
  if (textDocument.uri.scheme !== 'file') {
    return undefined
  }

  const antoraContext = await getAntoraDocumentContext(
    textDocument.uri,
    workspaceState,
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

/**
 * An image to insert: either a file already on disk (linked when it is already
 * conveniently located, copied otherwise) or in-memory bytes — e.g. a bitmap
 * pasted from the clipboard — which can only be copied.
 */
export type ImageSource =
  | { readonly uri: vscode.Uri }
  | { readonly name: string; readonly data: Uint8Array }

export interface ImageCopyEdit {
  /** Snippet inserting the resulting image macro(s). */
  snippet: vscode.SnippetString
  /** File copies to perform alongside the insertion. */
  workspaceEdit: vscode.WorkspaceEdit
}

/**
 * Build the snippet and {@link vscode.WorkspaceEdit} to insert `sources` into
 * `location`, copying every source except a file already sitting inside the
 * destination (which is linked in place instead). Returns `undefined` when no
 * copy is needed, or `undefined` (after logging) if a source cannot be read, so
 * the insertion never interrupts the drop/paste.
 */
export async function buildImageCopyEdit(
  docUri: vscode.Uri,
  sources: readonly ImageSource[],
  imagesDir: string,
  location: ImagesLocation,
): Promise<ImageCopyEdit | undefined> {
  try {
    const workspaceEdit = new vscode.WorkspaceEdit()
    const targets: string[] = []
    let copies = 0
    for (const source of sources) {
      if (
        'uri' in source &&
        isWithinDirectory(source.uri, location.directory)
      ) {
        // Already conveniently located: a plain link is enough.
        targets.push(computeImageMacroTarget(docUri, source.uri, imagesDir))
        continue
      }
      const fileName =
        'uri' in source ? path.basename(source.uri.fsPath) : source.name
      const destination = await findFreeDestination(
        location.directory,
        fileName,
      )
      const contents =
        'uri' in source
          ? await vscode.workspace.fs.readFile(source.uri)
          : source.data
      workspaceEdit.createFile(destination, {
        contents,
        ignoreIfExists: false,
      })
      targets.push(
        location.antora
          ? encodeURI(path.basename(destination.fsPath))
          : computeImageMacroTarget(docUri, destination, imagesDir),
      )
      copies++
    }
    if (copies === 0) {
      return undefined
    }
    return { snippet: imageMacrosSnippet(targets), workspaceEdit }
  } catch (err) {
    logger.warn(`Unable to prepare the image copy, cause: ${err}`)
    return undefined
  }
}
