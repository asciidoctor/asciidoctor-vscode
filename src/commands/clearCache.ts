import { Command } from '../core/commandManager.js'

/**
 * Drops the cached parses of the documents, then parses them again for the
 * outline, the folding ranges, the diagnostics and the preview.
 *
 * The cache is cleared automatically when a document is saved in VS Code, but
 * not when an included file changes outside VS Code (e.g. `git checkout`): this
 * command takes such a change into account without editing the document. It
 * also helps troubleshooting, by ruling out a stale parse.
 */
export class ClearCacheCommand implements Command {
  public readonly id = 'asciidoc.clearCache'

  public constructor(private readonly clearCache: () => void) {}

  public execute() {
    this.clearCache()
  }
}
