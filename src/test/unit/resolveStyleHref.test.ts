import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { URI } from 'vscode-uri'
import {
  type ResolvedStyle,
  resolveStyleUri,
} from '../../features/preview/resolveStyleHref.js'

// The VS Code Web editor (e.g. github.dev) mounts the workspace on a
// `vscode-vfs://` filesystem rather than on disk — the scenario of #651.
const workspace = URI.parse('vscode-vfs://github/acme/website')
const document = URI.parse('vscode-vfs://github/acme/website/docs/guide.adoc')

function asUri(resolved: ResolvedStyle): URI {
  assert.equal(resolved.kind, 'uri', `expected a URI, got ${resolved.kind}`)
  return (resolved as { kind: 'uri'; uri: URI }).uri
}

describe('resolveStyleUri (#651 custom stylesheet in the Web editor)', () => {
  test('an https URL is passed through verbatim (not resolved against the project path)', () => {
    const resolved = resolveStyleUri(
      'https://cdn.example.com/theme.css',
      workspace,
      document,
    )
    assert.deepEqual(resolved, {
      kind: 'url',
      href: 'https://cdn.example.com/theme.css',
    })
  })

  test('a file: URL is passed through verbatim', () => {
    const resolved = resolveStyleUri(
      'file:///opt/styles/theme.css',
      workspace,
      document,
    )
    assert.deepEqual(resolved, {
      kind: 'url',
      href: 'file:///opt/styles/theme.css',
    })
  })

  test('a relative path resolves under the workspace folder (works on vscode-vfs)', () => {
    const resolved = resolveStyleUri('styles/site.css', workspace, document)
    assert.equal(
      asUri(resolved).toString(),
      'vscode-vfs://github/acme/website/styles/site.css',
    )
  })

  test('with no workspace, a relative path resolves next to the document', () => {
    const resolved = resolveStyleUri('styles/site.css', undefined, document)
    assert.equal(
      asUri(resolved).toString(),
      'vscode-vfs://github/acme/website/docs/styles/site.css',
    )
  })

  test('an absolute path becomes a file:// URI — a known limitation in the Web editor', () => {
    // Documents (and guards against silent regressions of) the one case that
    // still cannot work in github.dev, whose files live on vscode-vfs://.
    const resolved = resolveStyleUri(
      '/opt/styles/theme.css',
      workspace,
      document,
    )
    assert.equal(asUri(resolved).scheme, 'file')
  })
})
