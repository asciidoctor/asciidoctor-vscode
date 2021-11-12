
const BAD_PROTO_RE = /^(vbscript|javascript|data):/i
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/i

/**
 * Disallow blacklisted URL types following MarkdownIt and the
 * VS Code Markdown extension
 * @param   {String}  href   The link address
 * @returns {boolean}        Whether the link is valid
 */
export function isSchemeBlacklisted (href: string): boolean {
  if (href && typeof (href) === 'string') {
    const hrefCheck = href.trim()
    if (BAD_PROTO_RE.test(hrefCheck)) {
      // we still allow specific safe "data:image/" URIs
      return !GOOD_DATA_RE.test(hrefCheck)
    }
  }
  return false
}
