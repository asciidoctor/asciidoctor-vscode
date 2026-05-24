import assert from 'node:assert/strict'
import os from 'node:os'
import { after, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import {
  findAntoraConfigFile,
  getAntoraDocumentContext,
} from '../features/antora/antoraDocument.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createDirectory,
  createFile,
  createLink,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

async function testGetAntoraConfig({
  asciidocPathUri,
  antoraConfigExpectedUri,
}) {
  const antoraConfigUri = await findAntoraConfigFile(asciidocPathUri)
  if (antoraConfigExpectedUri === undefined) {
    assert.strictEqual(antoraConfigUri, undefined)
  } else {
    if (os.platform() === 'win32') {
      assert.strictEqual(
        antoraConfigUri?.path?.toLowerCase(),
        antoraConfigExpectedUri?.path?.toLowerCase(),
      )
    } else {
      assert.strictEqual(antoraConfigUri?.path, antoraConfigExpectedUri?.path)
    }
  }
}

describe('Antora support with multi-documentation components', () => {
  const createdFiles = []
  const testCases = []
  before(async () => {
    createdFiles.push(await createDirectory('docs'))
    const apiDocumentationComponentPaths = ['docs', 'multiComponents', 'api']
    const apiAntoraPaths = [...apiDocumentationComponentPaths, 'antora.yml']
    await createFile(`name: "api"\nversion: "1.0"\n`, ...apiAntoraPaths)
    const endpointsPaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'pages',
      'endpoints.adoc',
    ]
    await createFile('= Endpoints', ...endpointsPaths)
    const ssoPaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'pages',
      '3rd-party',
      'sso.adoc',
    ]
    await createFile('= Single Sign On', ...ssoPaths)
    const tokenBasedPaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'pages',
      'modules',
      'token-based.adoc',
    ]
    await createFile('= Token Based', ...tokenBasedPaths)
    const patPaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'pages',
      'modules',
      'token',
      'pat.adoc',
    ]
    await createFile('= Personal Access Token', ...patPaths)
    testCases.push({
      title:
        'Should return Antora config for document inside a "modules" subdirectory',
      asciidocPathSegments: tokenBasedPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title:
        'Should return Antora config for document inside "pages" directory',
      asciidocPathSegments: endpointsPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title: 'Should return Antora config for document inside a subdirectory',
      asciidocPathSegments: ssoPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    testCases.push({
      title:
        'Should return Antora config for document inside a directory which has the same name as the workspace',
      asciidocPathSegments: patPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })

    const cliDocumentationComponentPaths = ['docs', 'multiComponents', 'cli']
    const cliAntoraPaths = [...cliDocumentationComponentPaths, 'antora.yml']
    await createFile(`name: "cli"\nversion: "2.0"\n`, ...cliAntoraPaths)
    await createFile(
      '',
      ...[
        ...cliDocumentationComponentPaths,
        'modules',
        'commands',
        'images',
        'output.png',
      ],
    )
    const convertPaths = [
      ...cliDocumentationComponentPaths,
      'module',
      'commands',
      'pages',
      'convert.adoc',
    ]
    await createFile(
      `= Convert Command\n\nimage::2.0@cli:commands:output.png[]\n\nimage::commands:output.png[]\n\nimage::output.png[]\n`,
      ...convertPaths,
    )
    testCases.push({
      title:
        'Should return Antora config for document inside "pages" directory which is inside another directory',
      asciidocPathSegments: convertPaths,
      antoraConfigExpectedPathSegments: cliAntoraPaths,
    })

    const modulesDocumentationComponentPaths = [
      'docs',
      'multiComponents',
      'modules',
      'api',
      'docs',
      'modules',
    ]
    const modulesAntoraPaths = [
      ...modulesDocumentationComponentPaths,
      'antora.yml',
    ]
    await createFile(
      `name: asciidoc\nversion: ~\n      `,
      ...modulesAntoraPaths,
    )
    const admonitionPagePaths = [
      ...modulesDocumentationComponentPaths,
      'blocks',
      'pages',
      'admonition.adoc',
    ]
    await createFile(`= Admonition Block\n\n`, ...admonitionPagePaths)
    testCases.push({
      title:
        'Should return Antora config for document inside a "modules" directory which is inside an Antora modules in a component named "modules"',
      asciidocPathSegments: admonitionPagePaths,
      antoraConfigExpectedPathSegments: modulesAntoraPaths,
    })

    const writerGuidePaths = [
      'docs',
      'multiComponents',
      'api',
      'modules',
      'writer-guide.adoc',
    ]
    await createFile('= Writer Guide', ...writerGuidePaths)
    testCases.push({
      title:
        'Should not return Antora config for document outside "modules" Antora folder',
      asciidocPathSegments: writerGuidePaths,
      antoraConfigExpectedPathSegments: undefined,
    })
    const contributingPaths = ['docs', 'contributing.adoc']
    await createFile('= Contributing', ...contributingPaths)
    testCases.push({
      title:
        'Should not return Antora config for document outside of documentation modules',
      asciidocPathSegments: contributingPaths,
      antoraConfigExpectedPathSegments: undefined,
    })
  })

  after(async () => {
    await removeFiles(createdFiles)
  })

  const workspaceUri = getDefaultWorkspaceFolderUri()
  for (const testCase of testCases) {
    test(testCase.title, async () =>
      testGetAntoraConfig({
        asciidocPathUri: vscode.Uri.joinPath(
          workspaceUri,
          ...testCase.asciidocPathSegments,
        ),
        antoraConfigExpectedUri:
          testCase.antoraConfigExpectedPathSegments === undefined
            ? undefined
            : vscode.Uri.joinPath(
                workspaceUri,
                ...testCase.antoraConfigExpectedPathSegments,
              ),
      }),
    )
  }

  test('Should handle symlink', async () => {
    if (os.platform() !== 'win32') {
      const createdFiles = []
      try {
        createdFiles.push(await createDirectory('antora-test'))
        await createDirectories(
          'antora-test',
          'docs',
          'modules',
          'ROOT',
          'pages',
        )
        const asciidocFile = await createFile(
          '= Hello World',
          'antora-test',
          'docs',
          'modules',
          'ROOT',
          'pages',
          'index.adoc',
        )
        await createLink(
          ['antora-test', 'docs'],
          ['antora-test', 'docs-symlink'],
        )
        await createFile(
          `name: silver-leaf\nversion: '7.1'\n`,
          'antora-test',
          'docs',
          'antora.yml',
        )
        await enableAntoraSupport()
        const workspaceState = extensionContext.workspaceState
        const result = await getAntoraDocumentContext(
          asciidocFile,
          workspaceState,
        )
        const components = result.getComponents()
        assert.strictEqual(
          components !== undefined,
          true,
          'Components must not be undefined',
        )
        assert.strictEqual(
          components.length > 0,
          true,
          'Must contains at least one component',
        )
        const component = components.find(
          (c) =>
            c.versions.find(
              (v) => v.name === 'silver-leaf' && v.version === '7.1',
            ) !== undefined,
        )
        assert.strictEqual(
          component !== undefined,
          true,
          'Component silver-leaf:7.1 must exists',
        )
      } finally {
        await removeFiles(createdFiles)
        await resetAntoraSupport()
      }
    }
  })
})

describe('Antora support with single documentation component', () => {
  test('Should build content catalog', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        'image:mountain.jpeg[]',
        'modules',
        'ROOT',
        'pages',
        'landscape.adoc',
      )
      createdFiles.push(asciidocFile)
      createdFiles.push(
        await createFile('', 'modules', 'ROOT', 'images', 'mountain.jpeg'),
      )
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const workspaceState = extensionContext.workspaceState
      const result = await getAntoraDocumentContext(
        asciidocFile,
        workspaceState,
      )
      const images = result.getImages()
      assert.strictEqual(
        images !== undefined,
        true,
        'Images must not be undefined',
      )
      assert.strictEqual(images.length > 0, true, 'Must contains one image')
      assert.strictEqual(images[0].src.basename, 'mountain.jpeg')
      assert.strictEqual(images[0].src.component, 'ROOT')
      assert.strictEqual(images[0].src.family, 'image')
      assert.strictEqual(images[0].src.version, null)
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})
