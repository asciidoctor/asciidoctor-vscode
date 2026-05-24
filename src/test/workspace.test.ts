import assert from 'node:assert/strict'
import os from 'node:os'
import { describe, test } from 'node:test'
import { Uri } from 'vscode'
import { normalizeUri } from '../core/workspace.js'

describe('Normalize URI', () => {
  test('Should lowercase drive letter on Windows', async () => {
    if (os.platform() === 'win32') {
      const result = normalizeUri(
        Uri.parse('file:///C:/path/WITH/camelCase/A/b/C/index.adoc'),
      )
      assert.strictEqual(
        result.path,
        '/c:/path/WITH/camelCase/A/b/C/index.adoc',
      )
    }
  })
  test('Should do nothing since the drive letter is already lowercase', async () => {
    if (os.platform() === 'win32') {
      const result = normalizeUri(
        Uri.parse('file:///c:/path/WITH/camelCase/A/b/C/index.adoc'),
      )
      assert.strictEqual(
        result.path,
        '/c:/path/WITH/camelCase/A/b/C/index.adoc',
      )
    }
  })
  test('Should do nothing on Linux', async () => {
    if (os.platform() !== 'win32') {
      const result = normalizeUri(
        Uri.parse('/C/path/WITH/camelCase/A/b/C/index.adoc'),
      )
      assert.strictEqual(result.path, '/C/path/WITH/camelCase/A/b/C/index.adoc')
    }
  })
})
