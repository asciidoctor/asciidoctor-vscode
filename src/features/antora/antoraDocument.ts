import fs from 'node:fs'
import { posix as posixpath } from 'node:path'
import classifyContent from '@antora/content-classifier'
import yaml from 'js-yaml'
import * as vscode from 'vscode'
import { FileType, Memento, Uri } from 'vscode'
import { dir, exists } from '../../core/file.js'
import { findFiles } from '../../core/findFiles.js'
import { logger } from '../../core/logger.js'
import { getWorkspaceFolder } from '../../core/workspace.js'
import { findApplicableAntoraConfigPath } from './antoraConfigMatcher.js'
import {
  AntoraConfig,
  AntoraContext,
  AntoraDocumentContext,
  AntoraSupportManager,
} from './antoraContext.js'

const MAX_DEPTH_SEARCH_ANTORA_CONFIG = 100

// Antora content families whose files are AsciiDoc/text and may be pulled into a
// page (e.g. through an include). Only those need their contents loaded into the
// content catalog; binary families (images, attachments, assets) are referenced
// by resource id only, so reading their bytes into memory is pure overhead.
const TEXT_FAMILY_DIRS = new Set(['pages', 'partials', 'examples'])
const EMPTY_CONTENTS = Buffer.alloc(0)

function isTextResource(relativePath: string): boolean {
  // relative path looks like `modules/<module>/<family>/...`
  const family = relativePath.split('/')[2]
  return family !== undefined && TEXT_FAMILY_DIRS.has(family)
}

// Building the Antora content catalog means globbing the whole workspace and
// reading every content file, then running the content classifier. This is far
// too expensive to redo on every preview render (i.e. on virtually every
// keystroke), so we memoize the expensive pieces and reuse them until a relevant
// file changes on disk. Each cache holds the in-flight promise as well, so
// concurrent renders share a single build instead of racing.
let antoraConfigUrisPromise: Promise<Uri[]> | undefined
let antoraConfigsPromise: Promise<AntoraConfig[]> | undefined
let contentCatalogPromise: Promise<any> | undefined

// Resolving which `antora.yml` applies to a given document is pure string
// matching over the (already memoized) config URIs, but it is requested on every
// render and every completion. Memoize the outcome per document — including the
// "no applicable config" result — so a document that never matches (e.g. a file
// outside any module) does not re-run the lookup, and does not re-log, on every
// keystroke. Keyed by the document path; invalidated alongside the other caches.
const applicableConfigUriByDocumentPath = new Map<string, Uri | undefined>()

/**
 * Drop every cached Antora artifact. Called by the file system watchers when a
 * configuration or content file changes, and by tests between scenarios.
 */
export function clearAntoraCache(): void {
  antoraConfigUrisPromise = undefined
  antoraConfigsPromise = undefined
  contentCatalogPromise = undefined
  applicableConfigUriByDocumentPath.clear()
}

/**
 * Register file system watchers that invalidate the Antora caches whenever an
 * `antora.yml` or a file below a `modules` directory is created, changed or
 * removed. Returns a disposable that tears the watchers down.
 */
export function registerAntoraCacheInvalidation(): vscode.Disposable {
  const invalidate = () => clearAntoraCache()
  const watchers = [
    vscode.workspace.createFileSystemWatcher('**/antora.yml'),
    vscode.workspace.createFileSystemWatcher('**/modules/**'),
  ]
  for (const watcher of watchers) {
    watcher.onDidCreate(invalidate)
    watcher.onDidChange(invalidate)
    watcher.onDidDelete(invalidate)
  }
  return vscode.Disposable.from(...watchers)
}

function getAntoraConfigUris(): Promise<Uri[]> {
  if (antoraConfigUrisPromise === undefined) {
    antoraConfigUrisPromise = Promise.resolve(findFiles('**/antora.yml'))
      .then((uris) => {
        // Overlapping workspace folders (e.g. a repository and one of its
        // subdirectories opened as two roots) surface the same antora.yml
        // several times; the duplicates would register the same component
        // version twice and break the content catalog build.
        const seen = new Set<string>()
        return uris.filter((uri) => {
          const key = uri.toString()
          if (seen.has(key)) {
            return false
          }
          seen.add(key)
          return true
        })
      })
      .catch((err) => {
        antoraConfigUrisPromise = undefined
        throw err
      })
  }
  return antoraConfigUrisPromise
}

export async function findAntoraConfigFile(
  textDocumentUri: Uri,
): Promise<Uri | undefined> {
  const cacheKey = textDocumentUri.path
  if (applicableConfigUriByDocumentPath.has(cacheKey)) {
    return applicableConfigUriByDocumentPath.get(cacheKey)
  }
  const antoraConfigUris = await getAntoraConfigUris()
  const matchedConfigPath = findApplicableAntoraConfigPath(
    textDocumentUri.path,
    antoraConfigUris.map((uri) => uri.path),
  )
  if (matchedConfigPath === undefined) {
    const antoraConfigPaths = antoraConfigUris.map((uri) => uri.path)
    logger.trace(
      `Unable to find an applicable Antora configuration file in [${antoraConfigPaths.join(', ')}] for the AsciiDoc document ${textDocumentUri.path}`,
    )
    applicableConfigUriByDocumentPath.set(cacheKey, undefined)
    return undefined
  }
  const matchedConfigUri = antoraConfigUris.find(
    (uri) => uri.path === matchedConfigPath,
  )
  logger.trace(
    `Found an Antora configuration file at ${matchedConfigUri.path} for the AsciiDoc document ${textDocumentUri.path}`,
  )
  applicableConfigUriByDocumentPath.set(cacheKey, matchedConfigUri)
  return matchedConfigUri
}

export async function antoraConfigFileExists(
  textDocumentUri: Uri,
): Promise<boolean> {
  const workspaceFolderUri =
    vscode.workspace.getWorkspaceFolder(textDocumentUri)?.uri
  let currentDirectoryUri = dir(textDocumentUri, workspaceFolderUri)
  let depth = 0
  let antoraConfig: vscode.Uri
  while (
    currentDirectoryUri !== undefined &&
    depth < MAX_DEPTH_SEARCH_ANTORA_CONFIG
  ) {
    depth++
    const antoraConfigUri = vscode.Uri.joinPath(
      currentDirectoryUri,
      'antora.yml',
    )
    if (await exists(antoraConfigUri)) {
      // Important: some file system providers, most notably the built-in git file system provider,
      // return true when calling `exists` even if the file does not exist on the local file system.
      // The Git file system provider will also return an empty buffer when calling `readFile`!

      // antora.yml file must have a name and version key.
      // In other words, the file must not be empty to be valid!
      try {
        const content = await vscode.workspace.fs.readFile(antoraConfigUri)
        if (content.length > 0) {
          antoraConfig = antoraConfigUri
        }
      } catch (_e) {
        // ignore, assume that the file does not exist
      }
      break
    }
    currentDirectoryUri = dir(currentDirectoryUri, workspaceFolderUri)
  }
  return antoraConfig !== undefined
}

function getAntoraConfigs(): Promise<AntoraConfig[]> {
  if (antoraConfigsPromise === undefined) {
    antoraConfigsPromise = buildAntoraConfigs().catch((err) => {
      antoraConfigsPromise = undefined
      throw err
    })
  }
  return antoraConfigsPromise
}

async function buildAntoraConfigs(): Promise<AntoraConfig[]> {
  const antoraConfigUris = await getAntoraConfigUris()
  // check for Antora configuration
  const antoraConfigs = await Promise.all(
    antoraConfigUris.map(async (antoraConfigUri) => {
      let config = {}
      const parentPath = antoraConfigUri.path.slice(
        0,
        antoraConfigUri.path.lastIndexOf('/'),
      )
      const parentDirectoryStat = await vscode.workspace.fs.stat(
        antoraConfigUri.with({ path: parentPath }),
      )
      if (
        parentDirectoryStat.type ===
          (FileType.Directory | FileType.SymbolicLink) ||
        parentDirectoryStat.type === FileType.SymbolicLink
      ) {
        // ignore!
        return undefined
      }
      try {
        config =
          yaml.load(
            new TextDecoder().decode(
              await vscode.workspace.fs.readFile(antoraConfigUri),
            ),
          ) || {}
      } catch (err) {
        logger.warn(
          `Unable to parse ${antoraConfigUri}, cause:` + err.toString(),
        )
      }
      return new AntoraConfig(antoraConfigUri, config)
    }),
  )
  return antoraConfigs.filter((c) => c) // filter undefined
}

export async function getAntoraConfig(
  textDocumentUri: Uri,
): Promise<AntoraConfig | undefined> {
  const antoraConfigUri = await findAntoraConfigFile(textDocumentUri)
  if (antoraConfigUri === undefined) {
    return undefined
  }
  let config = {}
  try {
    config = yaml.load(fs.readFileSync(antoraConfigUri.fsPath, 'utf8')) || {}
  } catch (err) {
    logger.warn(
      `Unable to parse ${antoraConfigUri.fsPath}, cause:` + err.toString(),
    )
  }
  return new AntoraConfig(antoraConfigUri, config)
}

export async function getAttributes(
  textDocumentUri: Uri,
): Promise<{ [key: string]: string }> {
  const antoraConfig = await getAntoraConfig(textDocumentUri)
  if (antoraConfig === undefined) {
    return {}
  }
  return antoraConfig.config.asciidoc?.attributes || {}
}

function getContentCatalog(): Promise<any> {
  if (contentCatalogPromise === undefined) {
    contentCatalogPromise = buildContentCatalog().catch((err) => {
      contentCatalogPromise = undefined
      throw err
    })
  }
  return contentCatalogPromise
}

async function buildContentCatalog(): Promise<any> {
  const antoraConfigs = await getAntoraConfigs()
  const contentAggregate: { name: string; version: string; files: any[] }[] =
    await Promise.all(
      antoraConfigs
        .filter(
          (antoraConfig) =>
            antoraConfig.config !== undefined &&
            'name' in antoraConfig.config &&
            'version' in antoraConfig.config,
        )
        .map(async (antoraConfig) => {
          const workspaceFolder = getWorkspaceFolder(antoraConfig.uri)
          const workspaceRelative = posixpath.relative(
            workspaceFolder.uri.path,
            antoraConfig.contentSourceRootPath,
          )
          const globPattern =
            'modules/*/{attachments,examples,images,pages,partials,assets}/**'
          const contentSourceRootPath = antoraConfig.contentSourceRootPath
          const files = await Promise.all(
            (
              await findFiles(
                `${workspaceRelative ? `${workspaceRelative}/` : ''}${globPattern}`,
              )
            ).map(async (file) => {
              const relativePath = posixpath.relative(
                contentSourceRootPath,
                file.path,
              )
              // Only AsciiDoc/text resources can be pulled into a page; loading
              // the bytes of images & attachments would waste time and memory.
              const contents = isTextResource(relativePath)
                ? Buffer.from(await vscode.workspace.fs.readFile(file))
                : EMPTY_CONTENTS
              return {
                base: contentSourceRootPath,
                path: relativePath,
                contents,
                extname: posixpath.extname(file.path),
                stem: posixpath.basename(
                  file.path,
                  posixpath.extname(file.path),
                ),
                src: {
                  abspath: file.path,
                  basename: posixpath.basename(file.path),
                  editUrl: '',
                  extname: posixpath.extname(file.path),
                  path: file.path,
                  stem: posixpath.basename(
                    file.path,
                    posixpath.extname(file.path),
                  ),
                },
              }
            }),
          )
          return {
            name: antoraConfig.config.name,
            version: antoraConfig.config.version,
            ...antoraConfig.config,
            files,
          }
        }),
    )
  return classifyContent(
    {
      site: {},
    },
    mergeDuplicateComponentVersions(contentAggregate),
  )
}

/**
 * The classifier throws `Duplicate version detected` as soon as the aggregate
 * holds two entries for the same component name and version — which happens
 * when the workspace contains two copies of a component (e.g. a clone and its
 * worktree, or overlapping folders in a multi-root workspace) — and that
 * single collision would take the *whole* content catalog down. Antora proper
 * merges such entries during aggregation, so do the same: keep the first
 * descriptor and concatenate the files. Files are deduplicated by their path
 * *within* the component (not their absolute path), so two copies of the same
 * tree — where the classifier would throw on every duplicated page — collapse
 * to the first copy.
 */
function mergeDuplicateComponentVersions(
  contentAggregate: { name: string; version: string; files: any[] }[],
): { name: string; version: string; files: any[] }[] {
  const entriesByNameAndVersion = new Map<
    string,
    { name: string; version: string; files: any[] }
  >()
  for (const entry of contentAggregate) {
    const key = `${entry.version}@${entry.name}`
    const existing = entriesByNameAndVersion.get(key)
    if (existing === undefined) {
      entriesByNameAndVersion.set(key, entry)
      continue
    }
    const knownPaths = new Set(existing.files.map((file) => file.path))
    for (const file of entry.files) {
      if (!knownPaths.has(file.path)) {
        existing.files.push(file)
      }
    }
  }
  return [...entriesByNameAndVersion.values()]
}

export async function getAntoraDocumentContext(
  textDocumentUri: Uri,
  workspaceState: Memento,
): Promise<AntoraDocumentContext | undefined> {
  const antoraSupportManager = AntoraSupportManager.getInstance(workspaceState)
  if (!antoraSupportManager.isEnabled()) {
    return undefined
  }
  try {
    const contentCatalog = await getContentCatalog()
    const antoraContext = new AntoraContext(contentCatalog)
    const antoraResourceContext =
      await antoraContext.getResource(textDocumentUri)
    if (antoraResourceContext === undefined) {
      return undefined
    }
    return new AntoraDocumentContext(antoraContext, antoraResourceContext)
  } catch (err) {
    logger.error(`Unable to get Antora context for ${textDocumentUri}`, err)
    return undefined
  }
}
