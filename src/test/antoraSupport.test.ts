import assert from 'node:assert/strict'
import os from 'node:os'
import { after, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import {
  clearAntoraCache,
  findAntoraConfigFile,
  getAntoraDocumentContext,
} from '../features/antora/antoraDocument.js'
import { resolveIncludeFile } from '../features/antora/resolveIncludeFile.js'
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

    const partialPaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'partials',
      'login.adoc',
    ]
    await createFile('Reusable login steps', ...partialPaths)
    testCases.push({
      title:
        'Should return Antora config for document inside "partials" directory',
      asciidocPathSegments: partialPaths,
      antoraConfigExpectedPathSegments: apiAntoraPaths,
    })
    const examplePaths = [
      ...apiDocumentationComponentPaths,
      'modules',
      'auth',
      'examples',
      'sample.adoc',
    ]
    await createFile('= Example', ...examplePaths)
    testCases.push({
      title:
        'Should return Antora config for document inside "examples" directory',
      asciidocPathSegments: examplePaths,
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

describe('Antora content catalog construction', () => {
  test('Should load contents of text resources but not of binary resources', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        'include::partial$intro.adoc[]\n\nimage:mountain.jpeg[]',
        'modules',
        'ROOT',
        'pages',
        'landscape.adoc',
      )
      createdFiles.push(asciidocFile)
      createdFiles.push(
        await createFile(
          'Reusable introduction',
          'modules',
          'ROOT',
          'partials',
          'intro.adoc',
        ),
      )
      // Give the image a non-empty content on purpose: the catalog must NOT read
      // those bytes, so its contents in the catalog must stay empty.
      createdFiles.push(
        await createFile(
          'pretend-this-is-a-large-binary-image',
          'modules',
          'ROOT',
          'images',
          'mountain.jpeg',
        ),
      )
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const result = await getAntoraDocumentContext(
        asciidocFile,
        extensionContext.workspaceState,
      )
      const contentCatalog = result.getContentCatalog()

      const partial = contentCatalog.findBy({ family: 'partial' })[0]
      assert.strictEqual(
        partial !== undefined,
        true,
        'Partial must be present in the content catalog',
      )
      assert.strictEqual(
        partial.contents.toString(),
        'Reusable introduction',
        'Contents of text resources (partials) must be loaded in the catalog',
      )

      const image = contentCatalog.findBy({ family: 'image' })[0]
      assert.strictEqual(
        image !== undefined,
        true,
        'Image must be present in the content catalog',
      )
      assert.strictEqual(
        image.contents.length,
        0,
        'Contents of binary resources (images) must not be loaded in the catalog',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should resolve a resource id to its absolute path', async () => {
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
      const imageFile = await createFile(
        '',
        'modules',
        'ROOT',
        'images',
        'mountain.jpeg',
      )
      createdFiles.push(imageFile)
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const result = await getAntoraDocumentContext(
        asciidocFile,
        extensionContext.workspaceState,
      )
      const resolved = result.resolveAntoraResourceIds('mountain.jpeg', 'image')
      assert.strictEqual(
        resolved,
        imageFile.path,
        'Resource id must resolve to the absolute path of the image',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  // #880 — `include::example$…[]` resolved to nothing (so Asciidoctor fell back
  // to a literal relative include, "include file not found: …/pages/example$…").
  // Resolving the `example$` family resource id against the content catalog must
  // return the example file's contents.
  test('Should resolve an example$ include resource id to its contents', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        'include::example$some_python_code.py[]',
        'modules',
        'ROOT',
        'pages',
        'landscape.adoc',
      )
      createdFiles.push(asciidocFile)
      createdFiles.push(
        await createFile(
          'print("hello")',
          'modules',
          'ROOT',
          'examples',
          'some_python_code.py',
        ),
      )
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const result = await getAntoraDocumentContext(
        asciidocFile,
        extensionContext.workspaceState,
      )
      assert.notStrictEqual(
        result,
        undefined,
        'An Antora document context must be established for the page',
      )
      const resolved = resolveIncludeFile(
        'example$some_python_code.py',
        { src: result.resourceContext },
        // The example$ branch resolves by resource id and never touches the
        // reader cursor, which is only used for plain relative includes.
        { file: undefined, dir: undefined },
        result.getContentCatalog(),
        undefined,
      )
      assert.notStrictEqual(
        resolved,
        undefined,
        'The example$ resource id must resolve to a catalog entry',
      )
      assert.strictEqual(
        resolved.contents,
        'print("hello")',
        'The include must resolve to the example file contents',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})

describe('Antora content catalog caching', () => {
  async function createSingleComponent(createdFiles: vscode.Uri[]) {
    createdFiles.push(await createDirectory('modules'))
    await createDirectories('modules', 'ROOT', 'pages')
    const asciidocFile = await createFile(
      '= Landscape',
      'modules',
      'ROOT',
      'pages',
      'landscape.adoc',
    )
    createdFiles.push(asciidocFile)
    createdFiles.push(
      await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
    )
    return asciidocFile
  }

  test('Should reuse the cached content catalog across calls', async () => {
    const createdFiles = []
    try {
      const asciidocFile = await createSingleComponent(createdFiles)
      await enableAntoraSupport()
      const workspaceState = extensionContext.workspaceState
      const first = await getAntoraDocumentContext(asciidocFile, workspaceState)
      const second = await getAntoraDocumentContext(
        asciidocFile,
        workspaceState,
      )
      assert.strictEqual(
        first.getContentCatalog(),
        second.getContentCatalog(),
        'The content catalog must be reused from the cache between calls',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should rebuild the content catalog after the cache is cleared', async () => {
    const createdFiles = []
    try {
      const asciidocFile = await createSingleComponent(createdFiles)
      await enableAntoraSupport()
      const workspaceState = extensionContext.workspaceState
      const first = await getAntoraDocumentContext(asciidocFile, workspaceState)
      clearAntoraCache()
      const second = await getAntoraDocumentContext(
        asciidocFile,
        workspaceState,
      )
      assert.notStrictEqual(
        first.getContentCatalog(),
        second.getContentCatalog(),
        'The content catalog must be rebuilt once the cache is invalidated',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})

describe('Antora content catalog robustness', () => {
  // Two antora.yml declaring the same component name and version — e.g. a clone
  // and a copy of the same component, or overlapping folders in a multi-root
  // workspace — used to make the classifier throw `Duplicate version detected`,
  // taking the whole content catalog (and every Antora feature) down.
  test('Should merge two content sources declaring the same component version', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('duplicated'))
      await createDirectories('duplicated', 'main', 'modules', 'ROOT', 'pages')
      await createDirectories('duplicated', 'copy', 'modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        '= Hello World',
        'duplicated',
        'main',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      // The copy holds the same page (a collision the classifier would reject)
      // plus a page of its own (which the merge must keep).
      await createFile(
        '= Hello World (copy)',
        'duplicated',
        'copy',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      await createFile(
        '= Other',
        'duplicated',
        'copy',
        'modules',
        'ROOT',
        'pages',
        'other.adoc',
      )
      await createFile(
        `name: duplicated\nversion: '1.0'\n`,
        'duplicated',
        'main',
        'antora.yml',
      )
      await createFile(
        `name: duplicated\nversion: '1.0'\n`,
        'duplicated',
        'copy',
        'antora.yml',
      )
      await enableAntoraSupport()
      const result = await getAntoraDocumentContext(
        asciidocFile,
        extensionContext.workspaceState,
      )
      assert.notStrictEqual(
        result,
        undefined,
        'The Antora context must survive a duplicated component version',
      )
      const pages = result
        .getContentCatalog()
        .findBy({ component: 'duplicated', family: 'page' })
      assert.deepStrictEqual(
        pages.map((page) => page.src.relative).sort(),
        ['index.adoc', 'other.adoc'],
        'The pages of both content sources must be merged, keeping the first of the colliding copies',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  // An unquoted `version: 2.0` comes out of the YAML parser as a number; the
  // classifier requires a string and used to throw, killing the whole catalog.
  test('Should coerce a non-string component version instead of failing', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('numeric-version'))
      await createDirectories('numeric-version', 'modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        '= Hello World',
        'numeric-version',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      await createFile(
        `name: numver\nversion: 2.0\n`,
        'numeric-version',
        'antora.yml',
      )
      await enableAntoraSupport()
      const result = await getAntoraDocumentContext(
        asciidocFile,
        extensionContext.workspaceState,
      )
      assert.notStrictEqual(
        result,
        undefined,
        'The Antora context must survive a non-string component version',
      )
      assert.strictEqual(
        result.resourceContext.version,
        '2',
        'The numeric version must be coerced to a string',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})
