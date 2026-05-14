import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine.js'
import {
  AsciidocContributionProvider,
  AsciidocContributions,
} from '../asciidocExtensions.js'
import { AsciidoctorConfig } from '../features/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import { WebviewResourceProvider } from '../util/resources.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'
import {
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return vscode.Uri.file(resource.path)
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return pathSegments.toString()
  }

  cspSource = 'cspSource'
}

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts = []
  readonly previewStyles = []
  readonly previewResourceRoots = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri
  }

  onContributionsChanged: vscode.Event<this>

  readonly contributions = new EmptyAsciidocContributions()

  dispose() {
    // noop
  }
}

describe(
  'AsciiDoc parser with Antora support enabled',
  { timeout: 60000 },
  () => {
    test('convert Antora page', async () => {
      const createdFiles = []
      try {
        createdFiles.push(await createDirectory('docs'))
        await createFile(
          `name: "antora"
version: "1.1.1"
title: Antora
asciidoc:
  attributes:
    url-vscode-marketplace: https://marketplace.visualstudio.com/vscode
`,
          'docs',
          'antora.yml',
        )
        const asciidocFile = await createFile(
          '',
          'docs',
          'modules',
          'ROOT',
          'pages',
          'index.adoc',
        )
        await enableAntoraSupport()
        const asciidocParser = new AsciidocEngine(
          new AsciidocContributionProviderTest(extensionContext.extensionUri),
          new AsciidoctorConfig(),
          new AsciidoctorExtensions(
            AsciidoctorExtensionsSecurityPolicyArbiter.activate(
              extensionContext,
            ),
          ),
          new AsciidoctorDiagnostic('test'),
        )
        const result = await asciidocParser.convertFromTextDocument(
          new InMemoryDocument(
            asciidocFile,
            'Download from the {url-vscode-marketplace}[Visual Studio Code Marketplace].',
          ),
          extensionContext,
          new TestWebviewResourceProvider(),
        )
        assert.strictEqual(
          result.html.includes(
            '<p>Download from the <a href="https://marketplace.visualstudio.com/vscode" data-href="https://marketplace.visualstudio.com/vscode">Visual Studio Code Marketplace</a>.</p>',
          ),
          true,
        )
      } finally {
        await removeFiles(createdFiles)
        await resetAntoraSupport()
      }
    })
  },
)
