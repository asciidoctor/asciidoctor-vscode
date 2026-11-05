// Shares one parse of a document between the callers that ask for the same
// text: after an edit, VS Code requests the folding ranges and the document
// symbols (several times), and the diagnostics are refreshed, each of which
// used to parse the whole document again (#1251).
//
// This module MUST NOT import `vscode`: it is unit-tested in plain Node.

interface Entry<T> {
  text: string
  options: string
  result: Promise<T>
}

/**
 * Keeps the result of the latest parse of each document, keyed by the document
 * URI and reused as long as the text and the options (serialized by the caller)
 * are the same.
 *
 * The pending promise is cached, not only the result, so that the callers that
 * arrive while a parse is running wait for it instead of starting their own.
 * The cache holds at most `maxEntries` documents, dropping the least recently
 * used one, since a workspace symbol search parses every file of the workspace.
 */
export class ParseCache<T> {
  private readonly entries = new Map<string, Entry<T>>()

  constructor(private readonly maxEntries = 10) {}

  public get(
    key: string,
    { text, options = '' }: { text: string; options?: string },
    parse: () => Promise<T>,
  ): Promise<T> {
    const entry = this.entries.get(key)
    // Move the entry to the end of the map, which keeps the entries in least
    // recently used order.
    this.entries.delete(key)
    if (
      entry !== undefined &&
      entry.text === text &&
      entry.options === options
    ) {
      this.entries.set(key, entry)
      return entry.result
    }
    const result = parse()
    const newEntry = { text, options, result }
    this.entries.set(key, newEntry)
    // Do not keep a failed parse: the next caller tries again.
    result.catch(() => {
      if (this.entries.get(key) === newEntry) {
        this.entries.delete(key)
      }
    })
    if (this.entries.size > this.maxEntries) {
      const leastRecentlyUsed = this.entries.keys().next().value
      if (leastRecentlyUsed !== undefined) {
        this.entries.delete(leastRecentlyUsed)
      }
    }
    return result
  }

  public delete(key: string): void {
    this.entries.delete(key)
  }

  public clear(): void {
    this.entries.clear()
  }

  public get size(): number {
    return this.entries.size
  }
}
