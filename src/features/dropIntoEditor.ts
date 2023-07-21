import * as path from 'path'
import * as vscode from 'vscode'
import * as URI from 'vscode-uri'
import { AsciidocLoader } from '../asciidocLoader'

const imageFileExtensions = new Set<string>([
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

export class DropImageIntoEditorProvider implements vscode.DocumentDropEditProvider {
  constructor (private asciidocLoader: AsciidocLoader) {
  }

  async provideDocumentDropEdits (
    textDocument: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
    // Check if drop config is enabled
    const enabled = vscode.workspace.getConfiguration('asciidoc', textDocument).get('editor.drop.enabled', true)
    if (!enabled) {
      return undefined
    }

    // Return the text or snippet to insert at the drop location.
    const snippet = await tryGetUriListSnippet(textDocument, this.asciidocLoader, dataTransfer, token)
    return snippet ? new vscode.DocumentDropEdit(snippet) : undefined
  }
}

async function tryGetUriListSnippet (
  textDocument: vscode.TextDocument,
  asciidocLoader: AsciidocLoader,
  dataTransfer: vscode.DataTransfer,
  token: vscode.CancellationToken): Promise<vscode.SnippetString | undefined> {
  // Get dropped files uris
  const urlList = await dataTransfer.get('text/uri-list')?.asString()
  if (!urlList || token.isCancellationRequested) {
    return undefined
  }

  const uris: vscode.Uri[] = []
  for (const resource of urlList.split('\n')) {
    uris.push(vscode.Uri.parse(resource.replace('\r', '')))
  }

  if (!uris.length) {
    return
  }

  const document = await asciidocLoader.load(textDocument)
  const imagesDirectory = document.getAttribute('imagesdir')
  const snippet = new vscode.SnippetString()

  // Drop location uri
  const docUri = textDocument.uri
  // Get uri for each uris list value
  uris.forEach((uri, index) => {
    let imagePath
    if (docUri.scheme === uri.scheme && docUri.authority === uri.authority) {
      const imageRelativePath = path.relative(URI.Utils.dirname(docUri).fsPath, uri.fsPath).replace(/\\/g, '/')
      if (imagesDirectory && imageRelativePath.startsWith(imagesDirectory)) {
        imagePath = encodeURI(imageRelativePath.substring(imagesDirectory.length))
      } else {
        imagePath = encodeURI(imageRelativePath)
      }
    } else {
      imagePath = uri.toString(false)
    }

    // Check that the dropped file is an image
    const ext = URI.Utils.extname(uri).toLowerCase()
    snippet.appendText(imageFileExtensions.has(ext) ? `image::${imagePath}[]` : '')

    // Add a line break if multiple dropped documents
    if (index <= uris.length - 1 && uris.length > 1) {
      snippet.appendText('\n')
    }
  })
  return snippet
}
