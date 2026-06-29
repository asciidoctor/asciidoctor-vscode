import assert from 'node:assert/strict'
import * as path from 'node:path'
import { describe, test } from 'node:test'
import { load } from '@asciidoctor/core'
import { fileURLToPath } from 'url'
import * as vscode from 'vscode'
import {
  _generateCoverHtmlContent,
  _resolvePdfOutputPath,
  _resolvePdfThemesArgs,
  decorateSpawnError,
  getSpawnEnv,
} from '../commands/exportAsPDF.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('asciidoc.exportAsPDF', () => {
  test('Should create an HTML cover page without title page logo', async () => {
    const document = await load(`= The Intrepid Chronicles
Kismet R. Lee <kismet@asciidoctor.org>`)
    const coverHtmlContent = _generateCoverHtmlContent(
      undefined,
      __dirname,
      document,
      vscode.Uri.parse(''),
    )
    assert.strictEqual(
      coverHtmlContent,
      `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="file:///media/all-centered.css">
  </head>
  <body>
  <div class="outer">
    <div class="middle">
      <div class="inner">

        <h1>The Intrepid Chronicles</h1>
        p>Kismet R. Lee &lt;kismet@asciidoctor.org&gt;</p>
      </div>
    </div>
  </div>
  </body>
  </html>`,
    )
  })

  describe('_resolvePdfOutputPath', () => {
    // Use path.resolve so the fixtures are fully-qualified (drive-anchored on
    // Windows), matching how _resolvePdfOutputPath resolves relative directories.
    const baseDir = path.resolve(path.sep, 'work', 'book')
    const workspacePath = path.resolve(path.sep, 'work')

    test('writes next to the document when no output directory is set', () => {
      assert.strictEqual(
        _resolvePdfOutputPath('', baseDir, workspacePath, 'doc.pdf'),
        path.join(baseDir, 'doc.pdf'),
      )
    })

    test('treats a blank output directory as unset', () => {
      assert.strictEqual(
        _resolvePdfOutputPath('   ', baseDir, workspacePath, 'doc.pdf'),
        path.join(baseDir, 'doc.pdf'),
      )
    })

    test('resolves a relative output directory against the workspace folder', () => {
      assert.strictEqual(
        _resolvePdfOutputPath('out/pdf', baseDir, workspacePath, 'doc.pdf'),
        path.join(workspacePath, 'out', 'pdf', 'doc.pdf'),
      )
    })

    test('keeps an absolute output directory untouched', () => {
      const absolute = path.join(path.sep, 'exports', 'pdf')
      assert.strictEqual(
        _resolvePdfOutputPath(absolute, baseDir, workspacePath, 'doc.pdf'),
        path.join(absolute, 'doc.pdf'),
      )
    })

    test('expands the workspaceFolder variable', () => {
      assert.strictEqual(
        _resolvePdfOutputPath(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: testing the literal `${workspaceFolder}` placeholder
          '${workspaceFolder}/build',
          baseDir,
          workspacePath,
          'doc.pdf',
        ),
        path.join(workspacePath, 'build', 'doc.pdf'),
      )
    })
  })

  describe('_resolvePdfThemesArgs', () => {
    const baseDir = '/work/book'

    test('sets pdf-themesdir to the base directory for a relative .yml theme', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs('custom-theme.yml', undefined, baseDir),
        ['-a', `pdf-themesdir=${baseDir}`],
      )
    })

    test('sets pdf-themesdir for a relative .yml theme in a subdirectory', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs('themes/custom-theme.yml', undefined, baseDir),
        ['-a', `pdf-themesdir=${baseDir}`],
      )
    })

    test('leaves a built-in named theme untouched', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs('default', undefined, baseDir),
        [],
      )
    })

    test('does not override an explicit pdf-themesdir', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs('custom-theme.yml', '/themes', baseDir),
        [],
      )
    })

    test('leaves an absolute theme path untouched', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs('/themes/custom-theme.yml', undefined, baseDir),
        [],
      )
    })

    test('returns no arguments when no theme is set', () => {
      assert.deepStrictEqual(
        _resolvePdfThemesArgs(undefined, undefined, baseDir),
        [],
      )
    })
  })

  describe('decorateSpawnError', () => {
    test('rewrites a spawn ENOENT caused by a missing working directory (#973)', () => {
      const enoent: NodeJS.ErrnoException = new Error('spawn /bin/sh ENOENT')
      enoent.code = 'ENOENT'
      const decorated = decorateSpawnError(
        enoent,
        'bundle exec asciidoctor-pdf',
        {
          shell: true,
          cwd: '/this/path/does/not/exist',
        },
      )
      assert.notStrictEqual(decorated, enoent)
      assert.match(decorated.message, /working directory does not exist/)
      assert.match(decorated.message, /\/this\/path\/does\/not\/exist/)
    })

    test('leaves the error untouched when the working directory exists', () => {
      const enoent: NodeJS.ErrnoException = new Error('spawn /bin/sh ENOENT')
      enoent.code = 'ENOENT'
      const decorated = decorateSpawnError(enoent, 'asciidoctor-pdf', {
        shell: true,
        cwd: __dirname,
      })
      assert.strictEqual(decorated, enoent)
    })

    test('leaves non-ENOENT errors untouched', () => {
      const eacces: NodeJS.ErrnoException = new Error('boom')
      eacces.code = 'EACCES'
      const decorated = decorateSpawnError(eacces, 'asciidoctor-pdf', {
        cwd: '/this/path/does/not/exist',
      })
      assert.strictEqual(decorated, eacces)
    })
  })

  describe('getSpawnEnv', () => {
    test('never drops the existing PATH entries (#973)', function () {
      if (process.platform === 'win32') {
        // PATH is inherited on Windows; the helper is a no-op there.
        assert.strictEqual(getSpawnEnv(), process.env)
        return
      }
      const before = (process.env.PATH ?? '')
        .split(path.delimiter)
        .filter(Boolean)
      const after = new Set(
        (getSpawnEnv().PATH ?? '').split(path.delimiter).filter(Boolean),
      )
      for (const dir of before) {
        assert.ok(after.has(dir), `expected PATH to still contain '${dir}'`)
      }
    })
  })
})
