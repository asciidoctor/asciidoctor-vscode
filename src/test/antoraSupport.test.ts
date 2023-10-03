import os from 'os'
import * as vscode from 'vscode'
import * as assert from 'assert'
import 'mocha'
import { findAntoraConfigFile, getAntoraDocumentContext } from '../features/antora/antoraSupport'
import { createDirectories, createDirectory, createFile, createLink, removeFiles } from './workspaceHelper'
import { extensionContext } from './helper'
import { getDefaultWorkspaceFolderUri } from '../util/workspace'
import * as util from 'util'

async function testGetAntoraConfig ({
  asciidocPathUri,
  antoraConfigExpectedUri,
}) {
  const antoraConfigUri = await findAntoraConfigFile(asciidocPathUri)
  if (antoraConfigExpectedUri === undefined) {
    assert.strictEqual(antoraConfigUri, undefined)
  } else {
    // Windows is case-insensitive
    // https://github.com/microsoft/vscode/issues/194692
    if (os.platform() === 'win32') {
      assert.strictEqual(antoraConfigUri?.path?.toLowerCase(), antoraConfigExpectedUri?.path?.toLowerCase())
    } else {
      assert.strictEqual(antoraConfigUri?.path, antoraConfigExpectedUri?.path)
    }
  }
}

suite('Antora Support', () => {
  const workspaceUri = getDefaultWorkspaceFolderUri()
  const testCases = [
    {
      title: 'Should return Antora config for document inside "pages" directory which is inside another directory',
      asciidocPathSegments: ['antora', 'multiComponents', 'cli', 'modules', 'commands', 'pages', 'page1.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'cli', 'antora.yml'],
    },
    {
      title: 'Should return Antora config for document inside "pages" directory',
      asciidocPathSegments: ['antora', 'multiComponents', 'api', 'modules', 'auth', 'pages', 'page3.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'api', 'antora.yml'],
    },
    {
      title: 'Should return Antora config for document inside a subdirectory',
      asciidocPathSegments: ['antora', 'multiComponents', 'api', 'modules', 'auth', 'pages', 'jwt', 'page2.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'api', 'antora.yml'],
    },
    {
      title: 'Should return Antora config for document inside a "modules" subdirectory',
      asciidocPathSegments: ['antora', 'multiComponents', 'api', 'modules', 'auth', 'pages', 'modules', 'page4.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'api', 'antora.yml'],
    },
    {
      title: 'Should return Antora config for document inside a "modules" directory which is inside an Antora modules in a component named "modules"',
      asciidocPathSegments: ['antora', 'multiComponents', 'modules', 'api', 'docs', 'modules', 'asciidoc', 'pages', 'modules', 'page5.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'modules', 'api', 'docs', 'antora.yml'],
    },
    {
      title: 'Should return Antora config for document inside a directory which has the same name as the workspace',
      asciidocPathSegments: ['antora', 'multiComponents', 'api', 'modules', 'auth', 'pages', 'modules', 'multiComponents', 'page6.adoc'],
      antoraConfigExpectedPathSegments: ['antora', 'multiComponents', 'api', 'antora.yml'],
    },
    {
      title: 'Should not return Antora config for document outside "modules" Antora folder',
      asciidocPathSegments: ['antora', 'multiComponents', 'api', 'modules', 'writer-guide.adoc'],
      antoraConfigExpectedPathSegments: undefined,
    },
    {
      title: 'Should not return Antora config for document outside of workspace',
      asciidocPathSegments: ['antora', 'contributing.adoc'],
      antoraConfigExpectedPathSegments: undefined,
    },
  ]

  for (const testCase of testCases) {
    test(testCase.title, async () => testGetAntoraConfig({
      asciidocPathUri: vscode.Uri.joinPath(workspaceUri, ...testCase.asciidocPathSegments),
      antoraConfigExpectedUri: testCase.antoraConfigExpectedPathSegments === undefined
        ? undefined
        : vscode.Uri.joinPath(workspaceUri, ...testCase.antoraConfigExpectedPathSegments),
    }))
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
      console.log(`getAntoraDocumentContext(${asciidocFile})`, util.inspect({ result }, false, null, true))
      const components = result.getComponents()
      assert.strictEqual(components.length > 0, true, 'Must contains at least one component')
      const component = components.find((c) => c.versions.find((v) => v.name === 'silver-leaf' && v.version === '7.1') !== undefined)
      assert.strictEqual(component !== undefined, true, 'Component silver-leaf:7.1 must exists')
    } catch (err) {
      console.error('Something bad happened!', err)
      throw err
    } finally {
      await removeFiles(createdFiles)
      await extensionContext.workspaceState.update('antoraSupportSetting', undefined)
      await vscode.workspace.getConfiguration('asciidoc', null).update('antora.enableAntoraSupport', undefined)
    }
  })
})
