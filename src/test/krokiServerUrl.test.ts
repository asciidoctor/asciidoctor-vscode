import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
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

function newLoader(): AsciidocLoader {
  return new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    new AsciidoctorDiagnostic('test-kroki-loader-diagnostics'),
    extensionContext,
  )
}

async function renderPreview(
  documentUri: vscode.Uri,
): Promise<{ csp: string; krokiServerUrl: string | undefined }> {
  const { html, document } = await newEngine().convertFromUri(
    documentUri,
    extensionContext,
    new TestWebviewResourceProvider(),
  )
  // The resolved Kroki server URL is added to the preview's Content Security
  // Policy allow-list (from the header-only parse), while the main conversion
  // resolves it on `document`; asserting on both covers both parse passes.
  const match = html.match(/Content-Security-Policy" content="([^"]*)"/)
  return {
    csp: match ? match[1] : '',
    krokiServerUrl: document?.getAttribute('kroki-server-url'),
  }
}

async function renderCsp(documentUri: vscode.Uri): Promise<string> {
  const { csp } = await renderPreview(documentUri)
  return csp
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
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', undefined)
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

  test('asciidoc.preview.asciidoctorAttributes takes precedence over the setting (#1207)', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', {
        'kroki-server-url': 'http://kroki-attr:9000',
      })
    const document = await createFile(
      '= Doc\n\ndiagram',
      'kroki-attr-over-setting.adoc',
    )
    createdFiles.push(document)
    const { csp, krokiServerUrl } = await renderPreview(document)
    assert.equal(
      krokiServerUrl,
      'http://kroki-attr:9000',
      'the main preview conversion should resolve kroki-server-url from asciidoctorAttributes',
    )
    assert.ok(
      csp.includes('http://kroki-attr:9000'),
      'the CSP should allow the server from asciidoctorAttributes',
    )
    assert.ok(
      !csp.includes('http://kroki-setting:9000'),
      'the setting value should not leak into the CSP when asciidoctorAttributes wins',
    )
  })

  test('a hard kroki-server-url in asciidoc.preview.asciidoctorAttributes stays locked when the setting is set (#1207)', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', {
        'kroki-server-url': 'http://kroki-attr:9000',
      })
    const configFile = await createFile(
      ':kroki-server-url: http://kroki-config:9000',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const document = await createFile(
      '= Doc\n:kroki-server-url: http://kroki-header:9000\n\ndiagram',
      'kroki-hard-attr-stays-locked.adoc',
    )
    createdFiles.push(document)
    const { csp, krokiServerUrl } = await renderPreview(document)
    assert.equal(
      krokiServerUrl,
      'http://kroki-attr:9000',
      'a hard kroki-server-url in asciidoctorAttributes should not be downgraded to a soft entry by the setting',
    )
    assert.ok(
      csp.includes('http://kroki-attr:9000'),
      'the CSP should allow the locked asciidoctorAttributes server',
    )
    assert.ok(
      !csp.includes('http://kroki-config:9000') &&
        !csp.includes('http://kroki-header:9000') &&
        !csp.includes('http://kroki-setting:9000'),
      'overridden values should not leak into the CSP',
    )
  })

  test('a soft kroki-server-url@ in asciidoc.preview.asciidoctorAttributes beats the setting but yields to .asciidoctorconfig (#1207)', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', {
        'kroki-server-url@': 'http://kroki-soft-attr:9000',
      })
    const document = await createFile(
      '= Doc\n\ndiagram',
      'kroki-soft-attr-over-setting.adoc',
    )
    createdFiles.push(document)
    const withoutConfig = await renderPreview(document)
    assert.equal(withoutConfig.krokiServerUrl, 'http://kroki-soft-attr:9000')
    assert.ok(withoutConfig.csp.includes('http://kroki-soft-attr:9000'))

    const configFile = await createFile(
      ':kroki-server-url: http://kroki-config:9000',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const withConfig = await renderPreview(document)
    assert.equal(withConfig.krokiServerUrl, 'http://kroki-config:9000')
    assert.ok(withConfig.csp.includes('http://kroki-config:9000'))
  })

  test('AsciidocLoader applies the setting and honors asciidoctorAttributes precedence (#1207)', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.extensions', null)
      .update('kroki.serverUrl', 'http://kroki-setting:9000')
    const documentUri = await createFile(
      '= Doc\n\ndiagram',
      'kroki-loader.adoc',
    )
    createdFiles.push(documentUri)
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const loader = newLoader()

    const docFromSetting = await loader.load(textDocument)
    assert.equal(
      docFromSetting.getAttribute('kroki-server-url'),
      'http://kroki-setting:9000',
      'AsciidocLoader should apply asciidoc.extensions.kroki.serverUrl as a soft default',
    )

    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', {
        'kroki-server-url': 'http://kroki-attr:9000',
      })
    const docFromAttr = await loader.load(textDocument)
    assert.equal(
      docFromAttr.getAttribute('kroki-server-url'),
      'http://kroki-attr:9000',
      'asciidoc.preview.asciidoctorAttributes should take precedence in AsciidocLoader too',
    )
  })

  test('a malformed URL cannot inject directives into the CSP', async () => {
    const document = await createFile(
      "= Doc\n:kroki-server-url: x; script-src 'unsafe-inline' *\n\ndiagram",
      'kroki-csp-injection.adoc',
    )
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(!csp.includes("unsafe-inline' *"), csp)
    assert.equal(
      csp.split(';').filter((rule) => rule.trim().startsWith('script-src'))
        .length,
      1,
      'the CSP should contain a single script-src directive',
    )
  })

  test('the CSP only allows the origin of the Kroki server', async () => {
    const document = await createFile(
      '= Doc\n:kroki-server-url: http://kroki-path:9000/kroki/\n\ndiagram',
      'kroki-csp-origin.adoc',
    )
    createdFiles.push(document)
    const csp = await renderCsp(document)
    assert.ok(csp.includes('http://kroki-path:9000;'), csp)
    assert.ok(!csp.includes('/kroki/'), csp)
  })
})
