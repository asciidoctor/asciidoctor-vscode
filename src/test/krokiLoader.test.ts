import assert from 'node:assert/strict'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AsciidocContributionProvider } from '../features/extensionContributions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { createDirectory, createFile } from './workspaceHelper.js'

const contributionProvider: AsciidocContributionProvider = {
  extensionUri: extensionContext.extensionUri,
  onContributionsChanged: () =>
    new vscode.Disposable(() => {
      // noop
    }),
  contributions: {
    previewScripts: [],
    previewStyles: [],
    previewResourceRoots: [],
  },
  dispose() {
    // noop
  },
}

const resourceProvider: WebviewResourceProvider = {
  cspSource: 'aaaa',
  asWebviewUri: (resource) => resource,
  asMediaWebViewSrc: (...pathSegments) => pathSegments.toString(),
}

const newExtensions = () =>
  new AsciidoctorExtensions(
    AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
  )

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

describe('Kroki in the load parse', () => {
  let server: Server
  let requests: number
  let directory: vscode.Uri

  const krokiDocument = () =>
    `= Doc
:kroki-fetch-diagram: true
:kroki-cache: false
:kroki-server-url: http://localhost:${(server.address() as AddressInfo).port}

[plantuml, target=diagram, format=svg]
....
Alice -> Bob : hello
....

plantuml::missing.puml[]
`

  const newLoader = () =>
    new AsciidocLoader(
      new AsciidoctorConfig(),
      newExtensions(),
      new AsciidoctorDiagnostic('test-kroki-load-parse'),
      extensionContext,
    )

  beforeEach(async () => {
    requests = 0
    server = createServer((_, response) => {
      requests++
      response.writeHead(200, { 'content-type': 'image/svg+xml' })
      response.end('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    directory = await createDirectory('kroki-loader')
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', true)
  })

  afterEach(async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', undefined)
    await vscode.workspace.fs.delete(directory, { recursive: true })
    await new Promise((resolve) => server.close(resolve))
  })

  test('language features do not call the server nor write images', async () => {
    const uri = await createFile(
      krokiDocument(),
      'kroki-loader',
      'language-features.adoc',
    )
    const textDocument = await vscode.workspace.openTextDocument(uri)
    const document = await newLoader().load(textDocument)
    assert.equal(requests, 0)
    assert.equal(
      await exists(vscode.Uri.joinPath(directory, 'diagram.svg')),
      false,
    )
    assert.deepEqual(
      document.getBlocks().map((block) => block.getContext()),
      ['literal', 'paragraph'],
    )
  })

  test('diagnostics do not call the server, and do not warn about diagrams', async () => {
    const uri = await createFile(
      krokiDocument(),
      'kroki-loader',
      'diagnostics.adoc',
    )
    const textDocument = await vscode.workspace.openTextDocument(uri)
    await newLoader().reportDiagnostics(textDocument)
    assert.equal(requests, 0)
    assert.equal(
      await exists(vscode.Uri.joinPath(directory, 'diagram.svg')),
      false,
    )
    assert.deepEqual(vscode.languages.getDiagnostics(uri), [])
  })

  test('the preview still renders the diagrams', async () => {
    const uri = await createFile(
      krokiDocument(),
      'kroki-loader',
      'preview.adoc',
    )
    const engine = new AsciidocEngine(
      contributionProvider,
      new AsciidoctorConfig(),
      newExtensions(),
    )
    const { html } = await engine.convertFromUri(
      uri,
      extensionContext,
      resourceProvider,
    )
    assert.ok(requests > 0, 'the preview should fetch the diagram')
    assert.ok(html.includes('diagram.svg'), `expected the image in:\n${html}`)
    assert.ok(await exists(vscode.Uri.joinPath(directory, 'diagram.svg')))
  })
})
