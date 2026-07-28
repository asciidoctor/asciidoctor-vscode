import { createRequire } from 'node:module'

/**
 * Loads a CommonJS module by absolute path from this ESM bundle, clearing any
 * previously cached copy first so an edited file is picked up on the next
 * call (used to hot-reload workspace `.asciidoctor/lib` extensions between
 * preview refreshes).
 */
export function requireFresh(modulePath: string): unknown {
  const req = createRequire(import.meta.url)
  delete req.cache[modulePath]
  return req(modulePath)
}
