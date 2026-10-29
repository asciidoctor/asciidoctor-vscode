import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { after, afterEach, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { exists } from '../core/file.js'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import {
  AsciidocContributionProvider,
  AsciidocContributions,
} from '../features/extensionContributions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { createFile } from './workspaceHelper.js'

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts: vscode.Uri[] = []
  readonly previewStyles: vscode.Uri[] = []
  readonly previewResourceRoots: vscode.Uri[] = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri: vscode.Uri
  onContributionsChanged: vscode.Event<this> = () =>
    new vscode.Disposable(() => {
      // noop
    })
  readonly contributions = new EmptyAsciidocContributions()

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri
  }

  dispose() {
    // noop
  }
}

class TestWebviewResourceProvider implements WebviewResourceProvider {
  cspSource = 'aaaa'

  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return resource
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return pathSegments.toString()
  }
}

function newEngine(): AsciidocEngine {
  return new AsciidocEngine(
    new AsciidocContributionProviderTest(extensionContext.extensionUri),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
  )
}

async function renderCsp(documentUri: vscode.Uri): Promise<string> {
  const { html } = await newEngine().convertFromUri(
    documentUri,
    extensionContext,
    new TestWebviewResourceProvider(),
  )
  // The resolved Kroki server URL is added to the preview's Content Security
  // Policy allow-list; asserting on it exercises the whole resolution chain.
  const match = html.match(/Content-Security-Policy" content="([^"]*)"/)
  return match ? match[1] : ''
}

// The setting is only meaningful for a non-`https:` server: the CSP already
// allows any `https:` source through a blanket rule, so these tests use
// `http://…` URLs, which are only allow-listed when explicitly resolved.
describe('asciidoc.extensions.kroki.serverUrl', () => {
  let createdFiles: vscode.Uri[] = []

  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile, { recursive: true })
    }
    createdFiles = []
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', undefined)
  })

  test('falls back to the public server when nothing sets the URL', async () => {
    const document = await createFile('= Doc\n\ndiagram', 'kroki-default.adoc')
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(
      csp.includes('https://kroki.io'),
      'the CSP should allow the public Kroki server by default',
    )
  })

  test('uses the setting value when set', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    const document = await createFile('= Doc\n\ndiagram', 'kroki-setting.adoc')
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(
      csp.includes('http://kroki-setting:9000'),
      'the CSP should allow the server configured through the setting',
    )
  })

  test('the document header takes precedence over the setting', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    const document = await createFile(
      '= Doc\n:kroki-server-url: http://kroki-header:9000\n\ndiagram',
      'kroki-header-over-setting.adoc',
    )
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(
      csp.includes('http://kroki-header:9000'),
      'the document header value should be used',
    )
    assert.ok(
      !csp.includes('http://kroki-setting:9000'),
      'the setting value should not leak into the CSP when the header wins',
    )
  })

  test('.asciidoctorconfig takes precedence over the setting', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    const configFile = await createFile(
      ':kroki-server-url: http://kroki-config:9000',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const document = await createFile(
      '= Doc\n\ndiagram',
      'kroki-config-over-setting.adoc',
    )
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(
      csp.includes('http://kroki-config:9000'),
      'the .asciidoctorconfig value should be used',
    )
    assert.ok(
      !csp.includes('http://kroki-setting:9000'),
      'the setting value should not leak into the CSP when .asciidoctorconfig wins',
    )
  })

  test('the document header takes precedence over .asciidoctorconfig', async () => {
    const configFile = await createFile(
      ':kroki-server-url: http://kroki-config:9000',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const document = await createFile(
      '= Doc\n:kroki-server-url: http://kroki-header:9000\n\ndiagram',
      'kroki-header-over-config.adoc',
    )
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(
      csp.includes('http://kroki-header:9000'),
      'the document header value should be used',
    )
    assert.ok(
      !csp.includes('http://kroki-config:9000'),
      'the .asciidoctorconfig value should not leak into the CSP when the header wins',
    )
  })
})

describe('kroki-fetch-diagram with data-uri (#1208)', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

  let server: http.Server
  let serverUrl: string
  let createdFiles: vscode.Uri[] = []

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
      res.end(svg)
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const { port } = server.address() as AddressInfo
    serverUrl = `http://127.0.0.1:${port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  afterEach(async () => {
    for (const createdFile of createdFiles) {
      if (await exists(createdFile)) {
        await vscode.workspace.fs.delete(createdFile, { recursive: true })
      }
    }
    createdFiles = []
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', undefined)
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', undefined)
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', undefined)
  })

  test('does not write a diagram file into the workspace when data-uri is set in asciidoc.preview.asciidoctorAttributes', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', true)
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', {
        'kroki-server-url': serverUrl,
        'data-uri': '',
      })
    const document = await createFile(
      `= Sample
:kroki-fetch-diagram: true

[plantuml, target=kroki-data-uri-settings, format=svg]
....
Alice -> Bob : hello
....
`,
      'kroki-data-uri-settings.adoc',
    )
    const diagramFile = vscode.Uri.joinPath(
      document,
      '..',
      'kroki-data-uri-settings.svg',
    )
    createdFiles.push(document, diagramFile)

    const { html } = await newEngine().convertFromUri(
      document,
      extensionContext,
      new TestWebviewResourceProvider(),
    )
    assert.ok(
      html.includes(`<img src="${svgDataUri}"`),
      `expected embedded data-uri in:\n${html}`,
    )
    assert.equal(
      await exists(diagramFile),
      false,
      'the diagram file must not be written into the workspace when data-uri is enabled',
    )
  })

  test('does not write a diagram file into the workspace when :data-uri: is set in the document header', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', true)
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', serverUrl)
    const document = await createFile(
      `= Sample
:data-uri:
:kroki-fetch-diagram: true

[plantuml, target=kroki-data-uri-header, format=svg]
....
Alice -> Bob : hello
....
`,
      'kroki-data-uri-header.adoc',
    )
    const diagramFile = vscode.Uri.joinPath(
      document,
      '..',
      'kroki-data-uri-header.svg',
    )
    createdFiles.push(document, diagramFile)

    const { html } = await newEngine().convertFromUri(
      document,
      extensionContext,
      new TestWebviewResourceProvider(),
    )
    assert.ok(
      html.includes(`<img src="${svgDataUri}"`),
      `expected embedded data-uri in:\n${html}`,
    )
    assert.equal(
      await exists(diagramFile),
      false,
      'the diagram file must not be written into the workspace when :data-uri: is set in the header',
    )
  })

  test('does not write a diagram file into the workspace when :data-uri: is set in .asciidoctorconfig', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('enableKroki', true)
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', serverUrl)
    const configFile = await createFile(':data-uri:', '.asciidoctorconfig')
    const document = await createFile(
      `= Sample
:kroki-fetch-diagram: true

[plantuml, target=kroki-data-uri-config, format=svg]
....
Alice -> Bob : hello
....
`,
      'kroki-data-uri-config.adoc',
    )
    const diagramFile = vscode.Uri.joinPath(
      document,
      '..',
      'kroki-data-uri-config.svg',
    )
    createdFiles.push(configFile, document, diagramFile)

    const { html } = await newEngine().convertFromUri(
      document,
      extensionContext,
      new TestWebviewResourceProvider(),
    )
    assert.ok(
      html.includes(`<img src="${svgDataUri}"`),
      `expected embedded data-uri in:\n${html}`,
    )
    assert.equal(
      await exists(diagramFile),
      false,
      'the diagram file must not be written into the workspace when :data-uri: is set in .asciidoctorconfig',
    )
  })
})
