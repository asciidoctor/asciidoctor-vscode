import { posix as posixpath } from 'node:path'

// Antora content families that hold AsciiDoc/text documents a user may open and
// edit. A document under one of these (i.e. `modules/<module>/<family>/…`)
// belongs to the Antora component described by the nearest `antora.yml`.
// Restricting this to `pages` (the historical behaviour) left partials and
// examples without an Antora context, which broke resource resolution (images,
// includes, …). See #958.
const ANTORA_TEXT_FAMILY_PATH_RX = /^\/[^/]+\/(pages|partials|examples)\/.*/

// Matches an upper-case Windows drive letter at the start of a URI path, e.g.
// the `E` in `/E:/aaa/…`.
const driveLetterRx = /(?<=^\/)([A-Z])(?=:\/)/

/**
 * Lower-case a Windows drive letter so paths coming from different VS Code APIs
 * compare equal. On Windows, `vscode.workspace.findFiles` yields a lower-case
 * drive letter (`/e:/…`) while the URI of the open document keeps the upper-case
 * one (`/E:/…`), so a naive `startsWith` against the config path fails. This is
 * a no-op for POSIX paths (they have no drive letter). See microsoft/vscode#194692
 * and #957.
 */
export function normalizeDriveLetter(path: string): string {
  return path.replace(driveLetterRx, (driveLetter) => driveLetter.toLowerCase())
}

/**
 * Decide which `antora.yml` applies to an AsciiDoc document, working purely from
 * paths (no VS Code APIs) so the logic can be unit tested outside the extension
 * host. Returns the matching config path (verbatim, as passed in) or `undefined`
 * when the document does not live in any Antora module.
 *
 * @param asciidocDocumentPath the path of the AsciiDoc document (URI `path`)
 * @param antoraConfigPaths the paths of the discovered `antora.yml` files
 */
export function findApplicableAntoraConfigPath(
  asciidocDocumentPath: string,
  antoraConfigPaths: string[],
): string | undefined {
  const documentPath = posixpath.normalize(
    normalizeDriveLetter(asciidocDocumentPath),
  )
  for (const antoraConfigPath of antoraConfigPaths) {
    const configPath = normalizeDriveLetter(antoraConfigPath)
    const parentDirPath = configPath.slice(0, configPath.lastIndexOf('/'))
    const modulesDirPath = posixpath.normalize(`${parentDirPath}/modules`)
    if (
      documentPath.startsWith(modulesDirPath) &&
      documentPath
        .slice(modulesDirPath.length)
        .match(ANTORA_TEXT_FAMILY_PATH_RX)
    ) {
      return antoraConfigPath
    }
  }
  return undefined
}
