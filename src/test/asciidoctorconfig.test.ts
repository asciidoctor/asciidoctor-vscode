import assert from 'node:assert/strict'
import { after, afterEach, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import {
  AsciidoctorConfig,
  getAsciidoctorConfigContent,
} from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import {
  AsciidocContributionProvider,
  AsciidocContributions,
} from '../features/extensionContributions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { createDirectory, createFile, removeFiles } from './workspaceHelper.js'

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

describe('asciidoc.Asciidoctorconfig', () => {
  let createdFiles: vscode.Uri[] = []
  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })
  const configFileNames = ['.asciidoctorconfig', '.asciidoctorconfig.adoc']
  configFileNames.forEach((configFileName) => {
    test(`Pick up ${configFileName} from root workspace folder`, async () => {
      const configFile = await createFile(
        ':application-name: Asciidoctor VS Code Extension',
        '.asciidoctorconfig',
      )
      createdFiles.push(configFile)
      const textDocument = await createFile(
        '= {application-name}',
        'attribute-defined-in-asciidoctorconfig.adoc',
      )
      createdFiles.push(textDocument)
      const asciidocParser = new AsciidocEngine(
        new AsciidocContributionProviderTest(extensionContext.extensionUri),
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(
          AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
        ),
      )
      const { html } = await asciidocParser.convertFromUri(
        textDocument,
        extensionContext,
        new TestWebviewResourceProvider(),
      )
      assert.strictEqual(
        html.includes('<h1>Asciidoctor VS Code Extension</h1>'),
        true,
        `{application-name} should be substituted by the value defined in ${configFileName}`,
      )
    })
  })

  describe('Pick up .asciidoctorconfig and .asciidoctorconfig.adoc from root workspace folder', async () => {
    let html: string
    const createdFiles: vscode.Uri[] = []

    before(async () => {
      const workspaceUri = getDefaultWorkspaceFolderUri()!

      createdFiles.push(
        await createFileWithContentAtWorkspaceRoot(
          workspaceUri,
          '.asciidoctorconfig',
          `:var-only-in-asciidoctorconfig: From .asciidoctorconfig\n:var-in-both: var-in-both value from .asciidoctorconfig`,
        ),
      )
      createdFiles.push(
        await createFileWithContentAtWorkspaceRoot(
          workspaceUri,
          '.asciidoctorconfig.adoc',
          `:var-only-in-asciidoctorconfig-adoc: From .asciidoctorconfig.adoc\n:var-in-both: var-in-both value from .asciidoctorconfig.adoc`,
        ),
      )

      const adocForTest = await createFileWithContentAtWorkspaceRoot(
        workspaceUri,
        'test-pickup-both-asciidoctorconfig-at-workspace-root.adoc',
        `{var-in-both}\n\n{var-only-in-asciidoctorconfig-adoc}\n\n{var-only-in-asciidoctorconfig}`,
      )
      createdFiles.push(adocForTest)
      const textDocument = await vscode.workspace.openTextDocument(adocForTest)
      const asciidocParser = new AsciidocEngine(
        new AsciidocContributionProviderTest(extensionContext.extensionUri),
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(
          AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
        ),
      )
      html = (
        await asciidocParser.convertFromTextDocument(
          textDocument,
          extensionContext,
          new TestWebviewResourceProvider(),
        )
      ).html
    })

    after(async () => {
      for (const createdFile of createdFiles) {
        await vscode.workspace.fs.delete(createdFile)
      }
    })

    test('Var from .asciidocforconfig is used', async () => {
      assert.strictEqual(
        html.includes('<p>From .asciidoctorconfig</p>'),
        true,
        '{var-only-in-asciidoctorconfig} should be substituted by the value defined in .asciidoctorconfig',
      )
    })

    test('Var from .asciidocforconfig.adoc is used', async () => {
      assert.strictEqual(
        html.includes('<p>From .asciidoctorconfig.adoc</p>'),
        true,
        '{var-only-in-asciidoctorconfig.adoc} should be substituted by the value defined in .asciidoctorconfig.adoc',
      )
    })

    test('Var from .asciidocforconfig.adoc has precedence on .asciidoctorconfig.adoc', async () => {
      assert.strictEqual(
        html.includes('<p>var-in-both value from .asciidoctorconfig.adoc</p>'),
        true,
        '{var-in-both} should be substituted by the value defined in .asciidoctorconfig.adoc',
      )
    })

    async function createFileWithContentAtWorkspaceRoot(
      workspaceUri: vscode.Uri,
      configFileName: string,
      fileContent: string,
    ) {
      const configFile = vscode.Uri.joinPath(workspaceUri, configFileName)
      await vscode.workspace.fs.writeFile(configFile, Buffer.from(fileContent))
      return configFile
    }
  })

  describe('Pick up .asciidocConfig file recursively', async () => {
    let html: string
    const createdFiles: vscode.Uri[] = []

    before(async () => {
      const workspaceUri = getDefaultWorkspaceFolderUri()!
      const configFileName = '.asciidoctorconfig'
      const rootConfigFile = vscode.Uri.joinPath(workspaceUri, configFileName)
      await vscode.workspace.fs.writeFile(
        rootConfigFile,
        Buffer.from(
          `:only-root: Only root. Should appear.\n:root-and-level1: Value of root-and-level1 specified in root. Should not appear.\n:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in root. Should not appear.`,
        ),
      )
      createdFiles.push(rootConfigFile)
      createdFiles.push(await createDirectory('level-empty'))
      await createFile(
        `:only-level1: Only level 1. Should appear.\n:root-and-level1: Value of root-and-level1 specified in level1. Should appear.\n:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in level1. Should not appear.`,
        'level-empty',
        'level1',
        configFileName,
      )
      await createFile(
        `:only-level2: Only level 2. Should appear.\n:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in level2. Should appear.`,
        'level-empty',
        'level1',
        'level2',
        configFileName,
      )
      const adocFile = await createFile(
        `{only-root}\n\n{only-level1}\n\n{only-level2}\n\n{root-and-level1}\n\n{root-and-level1-and-level2}\n              `,
        'level-empty',
        'level1',
        'level2',
        'fileToTestRecursiveAsciidoctorConfigs.adoc',
      )

      const textDocument = await vscode.workspace.openTextDocument(adocFile)
      const asciidocParser = new AsciidocEngine(
        new AsciidocContributionProviderTest(extensionContext.extensionUri),
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(
          AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
        ),
      )
      html = (
        await asciidocParser.convertFromTextDocument(
          textDocument,
          extensionContext,
          new TestWebviewResourceProvider(),
        )
      ).html
    })

    after(async () => {
      await removeFiles(createdFiles)
    })

    test('Var from root level is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only root. Should appear.</p>'),
        true,
        '{only-root} should be substituted by the value defined at root level',
      )
    })

    test('Var from level1 is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only level 1. Should appear.</p>'),
        true,
        '{only-level1} should be substituted by the value defined at level 1',
      )
    })

    test('Var from level2 is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only level 2. Should appear.</p>'),
        true,
        '{only-level2} should be substituted by the value defined at level 2',
      )
    })

    test('Deepest level should be use to substitue var', async () => {
      assert.strictEqual(
        html.includes(
          '<p>Value of root-and-level1-and-level2 specified in level2. Should appear.</p>',
        ),
        true,
        '{root-and-level1-and-level2} should be substituted by the value defined at level 2',
      )
    })

    test('Intermediate but deepest level defined should be use to substitue var', async () => {
      assert.strictEqual(
        html.includes(
          '<p>Value of root-and-level1 specified in level1. Should appear.</p>',
        ),
        true,
        '{root-and-level1} should be substituted by the value defined at level 1',
      )
    })
  })

  describe('Pick up .asciidoctorconfig from other workspace folder roots (multi-root workspace)', () => {
    const createdFiles: vscode.Uri[] = []

    after(async () => {
      await removeFiles(createdFiles)
    })

    test('config at another workspace folder root is applied with the lowest precedence', async () => {
      const workspaceUri = getDefaultWorkspaceFolderUri()!
      // Track the top-level directories so they are cleaned up recursively.
      createdFiles.push(vscode.Uri.joinPath(workspaceUri, 'shared-config-root'))
      createdFiles.push(vscode.Uri.joinPath(workspaceUri, 'docs-root'))

      // A workspace folder dedicated to shared configuration.
      await createFile(
        `:shared-attribute: from shared root\n:overridden: from shared root`,
        'shared-config-root',
        '.asciidoctorconfig',
      )
      // The document lives in another folder with its own, more specific config.
      await createFile(
        `:overridden: from document folder`,
        'docs-root',
        '.asciidoctorconfig',
      )
      const documentUri = await createFile('= Title', 'docs-root', 'doc.adoc')

      // Simulate a multi-root workspace: the document's own folder plus a
      // dedicated configuration folder declared as another workspace folder.
      const content = await getAsciidoctorConfigContent(documentUri, [
        workspaceUri,
        vscode.Uri.joinPath(workspaceUri, 'shared-config-root'),
      ])

      assert.ok(content !== undefined, 'config content should be resolved')
      assert.ok(
        content.includes(':shared-attribute: from shared root'),
        'an attribute from another workspace folder root should be picked up',
      )
      // The shared root is the most general config (applied first); the
      // document-folder config is applied last and therefore wins.
      const sharedIndex = content.indexOf('from shared root')
      const documentIndex = content.indexOf('from document folder')
      assert.ok(
        sharedIndex >= 0 && documentIndex > sharedIndex,
        'the document-folder config must be applied after (and override) the shared root config',
      )
    })
  })
})
