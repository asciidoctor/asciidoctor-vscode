import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  isRemoteUrl,
  parseSiteManifest,
  RemoteAntoraCatalog,
  SiteManifest,
} from '../../features/antora/siteManifest.js'

function buildManifest(): SiteManifest {
  return {
    url: 'https://docs.example.org',
    components: {
      cli: {
        title: 'CLI',
        latest: '2.0',
        versions: {
          '2.0': {
            url: '/cli/2.0/index.html',
            pages: [
              {
                path: 'index.adoc',
                url: '/cli/2.0/index.html',
                title: 'CLI Home',
              },
              {
                module: 'commands',
                path: 'seaswell.adoc',
                url: '/cli/2.0/commands/seaswell.html',
                title: 'Seaswell',
              },
              {
                path: 'old-name.adoc',
                url: '/cli/2.0/get-help.html',
                title: 'Get Help',
                alias: { ref: 'get-help.adoc', url: '/cli/2.0/get-help.html' },
              },
            ],
          },
        },
      },
      about: {
        title: 'Community',
        latest: '',
        versions: {
          '': {
            url: '/about/index.html',
            pages: [
              {
                path: 'index.adoc',
                url: '/about/index.html',
                title: 'Community',
              },
            ],
          },
        },
      },
    },
  }
}

describe('parseSiteManifest', () => {
  test('parses a well-formed manifest', () => {
    const manifest = parseSiteManifest(JSON.stringify(buildManifest()))
    assert.ok(manifest)
    assert.strictEqual(manifest.components.cli.latest, '2.0')
  })

  test('returns undefined for malformed JSON', () => {
    assert.strictEqual(parseSiteManifest('not json'), undefined)
  })

  test('returns undefined when "components" is missing', () => {
    assert.strictEqual(
      parseSiteManifest(JSON.stringify({ url: '' })),
      undefined,
    )
  })
})

describe('isRemoteUrl', () => {
  test('accepts http(s) URLs', () => {
    assert.strictEqual(isRemoteUrl('https://docs.example.org/index.html'), true)
    assert.strictEqual(isRemoteUrl('http://docs.example.org/index.html'), true)
  })

  test('rejects a plain file system path', () => {
    assert.strictEqual(isRemoteUrl('/Users/dev/project/index.adoc'), false)
    assert.strictEqual(isRemoteUrl('index.adoc'), false)
  })
})

describe('RemoteAntoraCatalog', () => {
  const current = { component: 'docs', version: '1.0', module: 'ROOT' }

  test('resolves a fully-qualified page id to its absolute URL', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      '2.0@cli::index.adoc',
      current,
      'page',
      new Set(),
    )
    assert.ok(resource)
    assert.strictEqual(
      resource.url,
      'https://docs.example.org/cli/2.0/index.html',
    )
  })

  test('resolves a module-qualified page id', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      '2.0@cli:commands:seaswell.adoc',
      current,
      'page',
      new Set(),
    )
    assert.ok(resource)
    assert.strictEqual(resource.module, 'commands')
    assert.strictEqual(
      resource.url,
      'https://docs.example.org/cli/2.0/commands/seaswell.html',
    )
  })

  test('defaults to the component "latest" version when none is specified', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      'cli::index.adoc',
      current,
      'page',
      new Set(),
    )
    assert.ok(resource)
    assert.strictEqual(resource.version, '2.0')
  })

  test('resolves an aliased page to its own manifest entry (already pointing at the canonical URL)', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      '2.0@cli::old-name.adoc',
      current,
      'page',
      new Set(),
    )
    assert.ok(resource)
    assert.strictEqual(
      resource.url,
      'https://docs.example.org/cli/2.0/get-help.html',
    )
  })

  test('resolves an unversioned component', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      '_@about::index.adoc',
      current,
      'page',
      new Set(),
    )
    assert.ok(resource)
    assert.strictEqual(resource.version, '')
  })

  test('returns undefined for a component absent from the manifest', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    assert.strictEqual(
      catalog.resolveResourceId(
        'unknown::index.adoc',
        current,
        'page',
        new Set(),
      ),
      undefined,
    )
  })

  test('returns undefined for a family other than "page" (manifest has no images/partials/examples)', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    assert.strictEqual(
      catalog.resolveResourceId(
        '2.0@cli:commands:image$logo.png',
        current,
        'image',
        new Set(),
      ),
      undefined,
    )
  })

  test('defers to the local content catalog: excluded component/version pairs never resolve', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const resource = catalog.resolveResourceId(
      '2.0@cli::index.adoc',
      current,
      'page',
      new Set(['cli@2.0']),
    )
    assert.strictEqual(resource, undefined)
  })

  test('findPages lists every page, excluding component/version pairs already known locally', () => {
    const catalog = new RemoteAntoraCatalog(buildManifest())
    const allPages = catalog.findPages(new Set())
    assert.strictEqual(allPages.length, 4)

    const withoutCli = catalog.findPages(new Set(['cli@2.0']))
    assert.strictEqual(withoutCli.length, 1)
    assert.strictEqual(withoutCli[0].component, 'about')
  })
})
