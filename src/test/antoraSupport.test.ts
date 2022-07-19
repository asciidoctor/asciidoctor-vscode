import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { getAntoraConfig } from '../features/antora/antoraSupport'

async function testGetAntoraConfig (asciidocPath, antoraConfigExpectedFsPath, root) {
  const file = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/${asciidocPath}`))
  const antoraConfigUri = await getAntoraConfig(file)
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
})
