import os from 'os'
import { Uri } from 'vscode'
import chai from 'chai'
import { normalizeUri } from '../util/workspace'

const expect = chai.expect

suite('Normalize URI', () => {
  test('Should lowercase drive letter on Windows', async () => {
    if (os.platform() === 'win32') {
      const result = normalizeUri(Uri.parse('file:///C:/path/WITH/camelCase/A/b/C/index.adoc'))
      expect(result.path).to.equal('/c:/path/WITH/camelCase/A/b/C/index.adoc')
    }
  })
  test('Should do nothing since the drive letter is already lowercase', async () => {
    if (os.platform() === 'win32') {
      const result = normalizeUri(Uri.parse('file:///c:/path/WITH/camelCase/A/b/C/index.adoc'))
      expect(result.path).to.equal('/c:/path/WITH/camelCase/A/b/C/index.adoc')
    }
  })
  test('Should do nothing on Linux', async () => {
    if (os.platform() !== 'win32') {
      const result = normalizeUri(Uri.parse('/C/path/WITH/camelCase/A/b/C/index.adoc'))
      expect(result.path).to.equal('/C/path/WITH/camelCase/A/b/C/index.adoc')
    }
  })
})
