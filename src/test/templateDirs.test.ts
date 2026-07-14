import assert from 'node:assert/strict'
import ospath from 'node:path'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { getTemplateDirs } from '../features/asciidoctor/templateDirs.js'
import {
  AsciidocContributionProvider,
  AsciidocContributions,
} from '../features/extensionContributions.js'
import {
  AsciidoctorExtensionsSecurityPolicyArbiter,
  AsciidoctorTemplatesSecurityPolicyArbiter,
} from '../features/security.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createFile,
  removeFiles,
} from './workspaceHelper.js'

// Stubs for the templates consent gate — the auto-discovered `.asciidoctor/
// templates` directory is only loaded once its authors are trusted.
const trustAllTemplates = {
  confirmAsciidoctorTemplatesTrustMode: async () => true,
} as unknown as AsciidoctorTemplatesSecurityPolicyArbiter
const denyAllTemplates = {
  confirmAsciidoctorTemplatesTrustMode: async () => false,
} as unknown as AsciidoctorTemplatesSecurityPolicyArbiter

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts: vscode.Uri[] = []
  readonly previewStyles: vscode.Uri[] = []
  readonly previewResourceRoots: vscode.Uri[] = []
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

function newAsciidocEngine(): AsciidocEngine {
  return new AsciidocEngine(
    new AsciidocContributionProviderTest(extensionContext.extensionUri),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
  )
}

describe('asciidoc.preview.templates resolution', () => {
  let createdFiles: vscode.Uri[] = []

  afterEach(async () => {
    await removeFiles(createdFiles)
    createdFiles = []
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', undefined)
  })

  test('resolves a relative configured path against the workspace folder', async () => {
    const workspaceUri = getDefaultWorkspaceFolderUri()
    const textDocument = await createFile('= Test', 'template-relative.adoc')
    createdFiles.push(textDocument)
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', ['templates'])

    const templateDirs = await getTemplateDirs(textDocument)

    assert.deepStrictEqual(templateDirs, [
      vscode.Uri.joinPath(workspaceUri, 'templates').fsPath,
    ])
  })

  test('keeps an absolute configured path unchanged', async () => {
    const textDocument = await createFile('= Test', 'template-absolute.adoc')
    createdFiles.push(textDocument)
    const absolutePath = ospath.join(ospath.sep, 'opt', 'my-templates')
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', [absolutePath])

    const templateDirs = await getTemplateDirs(textDocument)

    assert.deepStrictEqual(templateDirs, [absolutePath])
  })

  test('auto-discovers `.asciidoctor/templates` at the workspace folder root once trusted', async () => {
    const workspaceUri = getDefaultWorkspaceFolderUri()
    await createDirectories('.asciidoctor', 'templates')
    createdFiles.push(vscode.Uri.joinPath(workspaceUri, '.asciidoctor'))
    await createFile(
      'module.exports = () => ""\n',
      '.asciidoctor',
      'templates',
      'paragraph.js',
    )
    const textDocument = await createFile(
      '= Test',
      'template-autodiscover.adoc',
    )
    createdFiles.push(textDocument)

    const templateDirs = await getTemplateDirs(textDocument, trustAllTemplates)

    assert.deepStrictEqual(templateDirs, [
      vscode.Uri.joinPath(workspaceUri, '.asciidoctor', 'templates').fsPath,
    ])
  })

  test('skips the auto-discovered `.asciidoctor/templates` when the authors are not trusted', async () => {
    const workspaceUri = getDefaultWorkspaceFolderUri()
    await createDirectories('.asciidoctor', 'templates')
    createdFiles.push(vscode.Uri.joinPath(workspaceUri, '.asciidoctor'))
    await createFile(
      'module.exports = () => ""\n',
      '.asciidoctor',
      'templates',
      'paragraph.js',
    )
    const textDocument = await createFile('= Test', 'template-untrusted.adoc')
    createdFiles.push(textDocument)

    const templateDirs = await getTemplateDirs(textDocument, denyAllTemplates)

    assert.deepStrictEqual(templateDirs, [])
  })

  test('does not duplicate a configured path that is also auto-discovered', async () => {
    const workspaceUri = getDefaultWorkspaceFolderUri()
    await createDirectories('.asciidoctor', 'templates')
    createdFiles.push(vscode.Uri.joinPath(workspaceUri, '.asciidoctor'))
    await createFile(
      'module.exports = () => ""\n',
      '.asciidoctor',
      'templates',
      'paragraph.js',
    )
    const textDocument = await createFile('= Test', 'template-dedupe.adoc')
    createdFiles.push(textDocument)
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', ['.asciidoctor/templates'])

    const templateDirs = await getTemplateDirs(textDocument, trustAllTemplates)

    assert.deepStrictEqual(templateDirs, [
      vscode.Uri.joinPath(workspaceUri, '.asciidoctor', 'templates').fsPath,
    ])
  })
})

describe('asciidoc.preview.templates rendering', () => {
  let createdFiles: vscode.Uri[] = []

  afterEach(async () => {
    await removeFiles(createdFiles)
    createdFiles = []
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', undefined)
    // Reset the templates trust decision so it does not leak across tests.
    const arbiter =
      AsciidoctorTemplatesSecurityPolicyArbiter.activate(extensionContext)
    await extensionContext.workspaceState.update(
      arbiter.trustAsciidoctorTemplatesAuthorsKey,
      undefined,
    )
  })

  test('renders paragraphs with a pure-JavaScript template auto-discovered in `.asciidoctor/templates`', async () => {
    // The auto-discovered directory is gated: trust its authors first.
    await AsciidoctorTemplatesSecurityPolicyArbiter.activate(
      extensionContext,
    ).trustAsciidoctorTemplatesAuthors()
    await createDirectories('.asciidoctor', 'templates')
    createdFiles.push(
      vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), '.asciidoctor'),
    )
    // A pure-JS template needs no external engine: Asciidoctor requires the file
    // and calls its default export as `render({ node })`.
    createdFiles.push(
      await createFile(
        `module.exports = ({ node }) => \`<p class="brian">Brian Did This : \${node.getContent()}</p>\`\n`,
        '.asciidoctor',
        'templates',
        'paragraph.js',
      ),
    )
    const textDocument = await createFile(
      'Hello world',
      'template-rendering.adoc',
    )
    createdFiles.push(textDocument)

    const { html } = await newAsciidocEngine().convertFromUri(
      textDocument,
      extensionContext,
      new TestWebviewResourceProvider(),
    )

    assert.ok(
      html.includes('<p class="brian">Brian Did This : Hello world</p>'),
      `the custom paragraph template should be applied, got: ${html}`,
    )
  })

  test('renders paragraphs with a template from a relative configured path', async () => {
    await createDirectories('my-templates')
    createdFiles.push(
      vscode.Uri.joinPath(getDefaultWorkspaceFolderUri(), 'my-templates'),
    )
    createdFiles.push(
      await createFile(
        `module.exports = ({ node }) => \`<p class="configured">\${node.getContent()}</p>\`\n`,
        'my-templates',
        'paragraph.js',
      ),
    )
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('templates', ['my-templates'])
    const textDocument = await createFile(
      'Hello world',
      'template-relative-rendering.adoc',
    )
    createdFiles.push(textDocument)

    const { html } = await newAsciidocEngine().convertFromUri(
      textDocument,
      extensionContext,
      new TestWebviewResourceProvider(),
    )

    assert.ok(
      html.includes('<p class="configured">Hello world</p>'),
      `the custom paragraph template should be applied, got: ${html}`,
    )
  })
})
