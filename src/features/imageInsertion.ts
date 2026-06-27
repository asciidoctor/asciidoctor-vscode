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
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import { findImagesDirBeforeCursor } from './imagesDir.js'

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
