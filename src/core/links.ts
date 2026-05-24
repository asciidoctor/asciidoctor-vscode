import * as vscode from 'vscode'

const knownSchemes = ['http:', 'https:', 'file:', 'mailto:']

export function getUriForLinkWithKnownExternalScheme(
  link: string,
): vscode.Uri | undefined {
  if (
    knownSchemes.some((knownScheme) =>
      link.toLowerCase().startsWith(knownScheme),
    )
  ) {
    return vscode.Uri.parse(link)
  }

  return undefined
}
