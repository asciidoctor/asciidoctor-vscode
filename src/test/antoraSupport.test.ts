import os from 'os'
import * as vscode from 'vscode'
import * as assert from 'assert'
import 'mocha'
import { findAntoraConfigFile, getAntoraDocumentContext } from '../features/antora/antoraSupport'
import { createDirectories, createDirectory, createFile, createLink, disableAntoraSupport, enableAntoraSupport, removeFiles } from './workspaceHelper'
import { extensionContext } from './helper'
import { getDefaultWorkspaceFolderUri } from '../util/workspace'

async function testGetAntoraConfig ({ asciidocPathUri, antoraConfigExpectedUri }) {
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

suite('Antora support with multi-documentation components', () => {
  const createdFiles = []
  const testCases = []
  suiteSetup(async () => {
    createdFiles.push(await createDirectory('docs'))
    // documentation component: docs/multiComponents/api
    const apiDocumentationComponentPaths = ['docs', 'multiComponents', 'api']
    const apiAntoraPaths = [...apiDocumentationComponentPaths, 'antora.yml']
    await createFile(`name: "api"
version: "1.0"
`, ...apiAntoraPaths)
    const endpointsPaths = [...apiDocumentationComponentPaths, 'modules', 'auth', 'pages', 'endpoints.adoc']
    await createFile('= Endpoints', ...endpointsPaths)
    const ssoPaths = [...apiDocumentationComponentPaths, 'modules', 'auth', 'pages', '3rd-party', 'sso.adoc']
    await createFile('= Single Sign On', ...ssoPaths)
    const tokenBasedPaths = [...apiDocumentationComponentPaths, 'modules', 'auth', 'pages', 'modules', 'token-based.adoc']
    await createFile('= Token Based', ...tokenBasedPaths)
    const patPaths = [...apiDocumentationComponentPaths, 'modules', 'auth', 'pages', 'modules', 'token', 'pat.adoc']
    await createFile('= Personal Access Token', ...patPaths)
    //await createFile('= Client Id & Client Secret', ...[...apiDocumentationComponentPaths, 'modules', 'auth', 'pages', 'modules', 'credentials', 'secret.adoc'])
    testCases.push({
      title: 'Should return Antora config for document inside a "modules" subdirectory',
      asciidocPathSegments: tokenBasedPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title: 'Should return Antora config for document inside "pages" directory',
      asciidocPathSegments: endpointsPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title: 'Should return Antora config for document inside a subdirectory',
      asciidocPathSegments: ssoPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title: 'Should return Antora config for document inside a directory which has the same name as the workspace',
      asciidocPathSegments: patPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })

    // documentation component: docs/multiComponents/cli
    const cliDocumentationComponentPaths = ['docs', 'multiComponents', 'cli']
    const cliAntoraPaths = [...cliDocumentationComponentPaths, 'antora.yml']
    await createFile(`name: "cli"
version: "2.0"
`, ...cliAntoraPaths)
    await createFile('', ...[...cliDocumentationComponentPaths, 'modules', 'commands', 'images', 'output.png'])
    const convertPaths = [...cliDocumentationComponentPaths, 'module', 'commands', 'pages', 'convert.adoc']
    await createFile(`= Convert Command

image::2.0@cli:commands:output.png[]

image::commands:output.png[]

image::output.png[]
`, ...convertPaths)
    testCases.push({
      title: 'Should return Antora config for document inside "pages" directory which is inside another directory',
      asciidocPathSegments: convertPaths,
      antoraConfigExpectedPathSegments: cliAntoraPaths,
    })

    // documentation component: docs/multiComponents/modules/api/docs/modules
    const modulesDocumentationComponentPaths = ['docs', 'multiComponents', 'modules', 'api', 'docs', 'modules']
    const modulesAntoraPaths = [...modulesDocumentationComponentPaths, 'antora.yml']
    await createFile(`name: asciidoc
version: ~
      `, ...modulesAntoraPaths)
    const admonitionPagePaths = [...modulesDocumentationComponentPaths, 'blocks', 'pages', 'admonition.adoc']
    await createFile(`= Admonition Block

`, ...admonitionPagePaths)
    testCases.push({
      title: 'Should return Antora config for document inside a "modules" directory which is inside an Antora modules in a component named "modules"',
      asciidocPathSegments: admonitionPagePaths,
      antoraConfigExpectedPathSegments: modulesAntoraPaths,
    })

    // outside documentation modules
    const writerGuidePaths = ['docs', 'multiComponents', 'api', 'modules', 'writer-guide.adoc']
    await createFile('= Writer Guide', ...writerGuidePaths)
    testCases.push({
      title: 'Should not return Antora config for document outside "modules" Antora folder',
      asciidocPathSegments: writerGuidePaths,
      antoraConfigExpectedPathSegments: undefined,
    })
    const contributingPaths = ['docs', 'contributing.adoc']
    await createFile('= Contributing', ...contributingPaths)
    testCases.push({
      title: 'Should not return Antora config for document outside of documentation modules',
      asciidocPathSegments: contributingPaths,
      antoraConfigExpectedPathSegments: undefined,
    })
  })

  suiteTeardown(async () => {
    await removeFiles(createdFiles)
  })

  const workspaceUri = getDefaultWorkspaceFolderUri()
  for (const testCase of testCases) {
    test(testCase.title, async () => testGetAntoraConfig({
      asciidocPathUri: vscode.Uri.joinPath(workspaceUri, ...testCase.asciidocPathSegments),
      antoraConfigExpectedUri: testCase.antoraConfigExpectedPathSegments === undefined
        ? undefined
        : vscode.Uri.joinPath(workspaceUri, ...testCase.antoraConfigExpectedPathSegments),
    }))
  }

  test('Should handle symlink', async () => {
    // symlink does not work on Windows
    if (os.platform() !== 'win32') {
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
        await enableAntoraSupport()
        const workspaceState = extensionContext.workspaceState
        const result = await getAntoraDocumentContext(asciidocFile, workspaceState)
        const components = result.getComponents()
        assert.strictEqual(components !== undefined, true, 'Components must not be undefined')
        assert.strictEqual(components.length > 0, true, 'Must contains at least one component')
        const component = components.find((c) => c.versions.find((v) => v.name === 'silver-leaf' && v.version === '7.1') !== undefined)
        assert.strictEqual(component !== undefined, true, 'Component silver-leaf:7.1 must exists')
      } catch (err) {
        console.error('Something bad happened!', err)
        throw err
      } finally {
        await removeFiles(createdFiles)
        await disableAntoraSupport()
      }
    }
  })
})

suite('Antora support with single documentation component', () => {
  test('Should build content catalog', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const asciidocFile = await createFile('image:mountain.jpeg[]', 'modules', 'ROOT', 'pages', 'landscape.adoc')
      createdFiles.push(asciidocFile)
      createdFiles.push(await createFile('', 'modules', 'ROOT', 'images', 'mountain.jpeg'))
      createdFiles.push(await createFile(`name: ROOT
version: ~
`, 'antora.yml'))
      await enableAntoraSupport()
      const workspaceState = extensionContext.workspaceState
      const result = await getAntoraDocumentContext(asciidocFile, workspaceState)
      const images = result.getImages()
      assert.strictEqual(images !== undefined, true, 'Images must not be undefined')
      assert.strictEqual(images.length > 0, true, 'Must contains one image')
      assert.strictEqual(images[0].src.basename, 'mountain.jpeg')
      assert.strictEqual(images[0].src.component, 'ROOT')
      assert.strictEqual(images[0].src.family, 'image')
      assert.strictEqual(images[0].src.version, null)
    } catch (err) {
      console.error('Something bad happened!', err)
      throw err
    } finally {
      await removeFiles(createdFiles)
      await disableAntoraSupport()
    }
  })
})
