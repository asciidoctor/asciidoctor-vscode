// biome-ignore-all lint/suspicious/noTemplateCurlyInString: these tests assert on literal `${...}` VS Code placeholders
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  resolveVariables,
  type VariableResolutionContext,
} from '../../core/variableSubstitution.js'

describe('resolveVariables', () => {
  const context: VariableResolutionContext = {
    documentWorkspaceFolder: '/home/jane/project-b',
    defaultWorkspaceFolder: '/home/jane/project-a',
    workspaceFoldersByName: {
      'project-a': '/home/jane/project-a',
      'project-b': '/home/jane/project-b',
    },
    userHome: '/home/jane',
    pathSeparator: '/',
    env: { HOME: '/home/jane', ASCIIDOC_OUT: 'build/out' },
  }

  test('resolves ${workspaceFolder} against the document folder', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder}/images', context),
      '/home/jane/project-b/images',
    )
  })

  test('falls back to the default folder when the document has no folder', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder}/images', {
        ...context,
        documentWorkspaceFolder: undefined,
      }),
      '/home/jane/project-a/images',
    )
  })

  test('resolves the named ${workspaceFolder:Name} form', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder:project-a}/out', context),
      '/home/jane/project-a/out',
    )
  })

  test('accepts the deprecated ${workspaceRoot} alias', () => {
    assert.strictEqual(
      resolveVariables('${workspaceRoot}/images', context),
      '/home/jane/project-b/images',
    )
  })

  test('resolves ${workspaceFolderBasename}', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolderBasename}', context),
      'project-b',
    )
    assert.strictEqual(
      resolveVariables('${workspaceFolderBasename}', {
        documentWorkspaceFolder: 'C:\\Users\\jane\\my-docs\\',
      }),
      'my-docs',
    )
  })

  test('resolves ${userHome}', () => {
    assert.strictEqual(
      resolveVariables('${userHome}/notes', context),
      '/home/jane/notes',
    )
  })

  test('resolves ${pathSeparator} and its ${/} shorthand', () => {
    assert.strictEqual(
      resolveVariables('a${pathSeparator}b${/}c', context),
      'a/b/c',
    )
  })

  test('resolves ${env:NAME}', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder}/${env:ASCIIDOC_OUT}', context),
      '/home/jane/project-b/build/out',
    )
  })

  test('resolves a missing environment variable to an empty string', () => {
    assert.strictEqual(
      resolveVariables('[${env:DOES_NOT_EXIST}]', context),
      '[]',
    )
  })

  test('replaces several placeholders in one string', () => {
    assert.strictEqual(
      resolveVariables('${userHome}/${env:ASCIIDOC_OUT}', context),
      '/home/jane/build/out',
    )
  })

  test('leaves an unknown variable untouched', () => {
    assert.strictEqual(resolveVariables('${bogus}/x', context), '${bogus}/x')
  })

  describe('file variables (#1159)', () => {
    const fileContext: VariableResolutionContext = {
      ...context,
      file: '/home/jane/project-b/docs/api/index.adoc',
    }

    test('resolves ${file}', () => {
      assert.strictEqual(
        resolveVariables('${file}', fileContext),
        '/home/jane/project-b/docs/api/index.adoc',
      )
    })

    test('resolves ${fileDirname}', () => {
      assert.strictEqual(
        resolveVariables('${fileDirname}', fileContext),
        '/home/jane/project-b/docs/api',
      )
    })

    test('resolves ${fileBasename}', () => {
      assert.strictEqual(
        resolveVariables('${fileBasename}', fileContext),
        'index.adoc',
      )
    })

    test('resolves ${fileBasenameNoExtension}', () => {
      assert.strictEqual(
        resolveVariables('${fileBasenameNoExtension}', fileContext),
        'index',
      )
    })

    test('resolves ${fileExtname}', () => {
      assert.strictEqual(
        resolveVariables('${fileExtname}', fileContext),
        '.adoc',
      )
    })

    test('resolves ${relativeFile} against the document workspace folder', () => {
      assert.strictEqual(
        resolveVariables('${relativeFile}', fileContext),
        'docs/api/index.adoc',
      )
    })

    test('resolves ${relativeFileDirname}', () => {
      assert.strictEqual(
        resolveVariables('${relativeFileDirname}', fileContext),
        'docs/api',
      )
    })

    test('resolves ${relativeFileDirname} to an empty string for a top-level file', () => {
      assert.strictEqual(
        resolveVariables('[${relativeFileDirname}]', {
          ...fileContext,
          file: '/home/jane/project-b/index.adoc',
        }),
        '[]',
      )
    })

    test('resolves ${relativeFileDirnameFlat} by flattening path separators into dashes', () => {
      assert.strictEqual(
        resolveVariables('${relativeFileDirnameFlat}', fileContext),
        'docs-api',
      )
    })

    test('falls back to the file basename for ${relativeFile} when there is no workspace folder', () => {
      assert.strictEqual(
        resolveVariables('${relativeFile}', {
          file: '/home/jane/project-b/docs/api/index.adoc',
        }),
        'index.adoc',
      )
    })

    test('leaves ${file} and friends untouched when no file is available', () => {
      assert.strictEqual(resolveVariables('${file}', context), '${file}')
      assert.strictEqual(
        resolveVariables('${fileBasenameNoExtension}', context),
        '${fileBasenameNoExtension}',
      )
    })
  })

  test('leaves ${workspaceFolder} untouched when no folder is available', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder}/images', {}),
      '${workspaceFolder}/images',
    )
  })

  test('leaves an unknown named workspace folder untouched', () => {
    assert.strictEqual(
      resolveVariables('${workspaceFolder:nope}/x', context),
      '${workspaceFolder:nope}/x',
    )
  })

  test('returns the string unchanged when there is no placeholder', () => {
    assert.strictEqual(resolveVariables('/plain/path', context), '/plain/path')
  })
})
