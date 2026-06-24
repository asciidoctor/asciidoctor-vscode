import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  findApplicableAntoraConfigPath,
  normalizeDriveLetter,
} from '../../features/antora/antoraConfigMatcher.js'

describe('findApplicableAntoraConfigPath', () => {
  const configPath = '/docs/antora.yml'
  const configs = [configPath]

  test('Should match a document under a "pages" directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/ROOT/pages/index.adoc',
        configs,
      ),
      configPath,
    )
  })

  // #958 — documents under partials used to be left without an Antora context.
  test('Should match a document under a "partials" directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/auth/partials/login.adoc',
        configs,
      ),
      configPath,
    )
  })

  test('Should match a document under an "examples" directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/auth/examples/sample.adoc',
        configs,
      ),
      configPath,
    )
  })

  test('Should match a document nested inside the family directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/auth/pages/3rd-party/sso.adoc',
        configs,
      ),
      configPath,
    )
  })

  test('Should not match a document outside a content family directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/auth/writer-guide.adoc',
        configs,
      ),
      undefined,
    )
  })

  test('Should not match a document under a non-text family (e.g. images)', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath(
        '/docs/modules/ROOT/images/diagram.png',
        configs,
      ),
      undefined,
    )
  })

  test('Should not match a document outside any "modules" directory', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath('/docs/contributing.adoc', configs),
      undefined,
    )
  })

  test('Should pick the config whose module tree contains the document', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath('/docs/cli/modules/ROOT/pages/run.adoc', [
        '/docs/api/antora.yml',
        '/docs/cli/antora.yml',
      ]),
      '/docs/cli/antora.yml',
    )
  })

  // #957 — on Windows the config path and the open document differ only by the
  // case of the drive letter, which used to defeat the prefix comparison.
  test('Should match despite a Windows drive-letter case mismatch', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath('/E:/aaa/modules/ROOT/pages/index.adoc', [
        '/e:/aaa/antora.yml',
      ]),
      '/e:/aaa/antora.yml',
    )
  })

  test('Should return the config path verbatim (not the normalized one)', () => {
    assert.strictEqual(
      findApplicableAntoraConfigPath('/E:/aaa/modules/ROOT/pages/index.adoc', [
        '/E:/aaa/antora.yml',
      ]),
      '/E:/aaa/antora.yml',
    )
  })
})

describe('normalizeDriveLetter', () => {
  test('Should lower-case an upper-case Windows drive letter', () => {
    assert.strictEqual(
      normalizeDriveLetter('/E:/aaa/index.adoc'),
      '/e:/aaa/index.adoc',
    )
  })

  test('Should leave a POSIX path untouched', () => {
    assert.strictEqual(
      normalizeDriveLetter('/docs/index.adoc'),
      '/docs/index.adoc',
    )
  })

  test('Should only touch the leading drive letter', () => {
    assert.strictEqual(normalizeDriveLetter('/E:/A:/x.adoc'), '/e:/A:/x.adoc')
  })
})
