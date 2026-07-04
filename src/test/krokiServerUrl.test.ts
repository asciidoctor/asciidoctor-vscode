import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
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
  readonly previewScripts = []
  readonly previewStyles = []
  readonly previewResourceRoots = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri: vscode.Uri
  onContributionsChanged: vscode.Event<this>
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
