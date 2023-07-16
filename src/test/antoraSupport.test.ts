import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { findAntoraConfigFile, getAntoraDocumentContext } from '../features/antora/antoraSupport'
import { createDirectories, createDirectory, createFile, createLink, removeFiles } from './workspaceHelper'
import { extensionContext } from './helper'

async function testGetAntoraConfig (asciidocPath, antoraConfigExpectedFsPath, root) {
  const antoraConfigUri = await findAntoraConfigFile(vscode.Uri.file(`${root}/${asciidocPath}`))
  if (antoraConfigExpectedFsPath === undefined) {
    assert.strictEqual(antoraConfigUri, undefined)
  } else {
    assert.strictEqual(antoraConfigUri.fsPath, antoraConfigExpectedFsPath)
  }
}

suite('Antora Support', () => {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  const testCases = [
    {
      title: 'Should return Antora config for document inside "pages" directory which is inside another directory',
      asciidocPath: 'antora/multiComponents/cli/modules/commands/pages/page1.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/cli/antora.yml`,
    },
    {
      title: 'Should return Antora config for document inside "pages" directory',
      asciidocPath: 'antora/multiComponents/api/modules/auth/pages/page3.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/api/antora.yml`,
    },
    {
      title: 'Should return Antora config for document inside a subdirectory',
      asciidocPath: 'antora/multiComponents/api/modules/auth/pages/jwt/page2.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/api/antora.yml`,
    },
    {
      title: 'Should return Antora config for document inside a "modules" subdirectory',
      asciidocPath: 'antora/multiComponents/api/modules/auth/pages/modules/page4.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/api/antora.yml`,
    },
    {
      title: 'Should return Antora config for document inside a "modules" directory which is inside an Antora modules in a composant named "modules"',
      asciidocPath: 'antora/multiComponents/modules/api/docs/modules/asciidoc/pages/modules/page5.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/modules/api/docs/antora.yml`,
    },
    {
      title: 'Should return Antora config for document inside a directory which has the same name as the workspace',
      asciidocPath: 'antora/multiComponents/api/modules/auth/pages/modules/multiComponents/page6.adoc',
      antoraConfigExpectedFsPath: `${root}/antora/multiComponents/api/antora.yml`,
    },
    {
      title: 'Should not return Antora config for document outside "modules" Antora folder',
      asciidocPath: 'antora/multiComponents/api/modules/writer-guide.adoc',
      antoraConfigExpectedFsPath: undefined,
    },
    {
      title: 'Should not return Antora config for document outside of workspace',
      asciidocPath: 'antora/contributing.adoc',
      antoraConfigExpectedFsPath: undefined,
    },
  ]

  for (const testCase of testCases) {
    test(testCase.title, async () => testGetAntoraConfig(testCase.asciidocPath, testCase.antoraConfigExpectedFsPath, root))
  }

  test('Should handle symlink', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('antora-test'))
      await createDirectories('antora-test', 'docs', 'modules', 'ROOT', 'pages')
      const asciidocFile = await createFile('= Hello World', 'antora-test', 'docs', 'modules', 'ROOT', 'pages', 'index.adoc')
      await createLink(['antora-test', 'docs'], ['antora-test', 'docs-symlink']) // create a symlink!
      await createFile(`name: silver-leaf
version: '7.1'
`, 'antora-test', 'docs', 'antora.yml')
      // enable Antora support
      const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)
      await workspaceConfiguration.update('antora.enableAntoraSupport', true)
      const workspaceState = extensionContext.workspaceState
      await workspaceState.update('antoraSupportSetting', true)
      // GO!
      const result = await getAntoraDocumentContext(asciidocFile, workspaceState)
      const components = result.getComponents()
      assert.strictEqual(components.length > 0, true, 'Must contains at least one component')
      const component = components.find((c) => c.versions.find((v) => v.name === 'silver-leaf' && v.version === '7.1') !== undefined)
      assert.strictEqual(component !== undefined, true, 'Component silver-leaf:7.1 must exists')
    } finally {
      await removeFiles(createdFiles)
      await extensionContext.workspaceState.update('antoraSupportSetting', undefined)
      await vscode.workspace.getConfiguration('asciidoc', null).update('antora.enableAntoraSupport', undefined)
    }
  })
})
