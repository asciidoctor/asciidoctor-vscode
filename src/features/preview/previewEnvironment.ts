// What the preview conversion needs from the VS Code API, resolved in the
// extension host and passed to the conversion as plain data or services (see
// `previewConversion.ts`).
import * as vscode from 'vscode'
import { t as l10nT } from '../../core/l10n.js'
import { logger } from '../../core/logger.js'
import type { PreviewStrings } from './asciidoctorWebViewConverter.js'
import { plantUmlStrings } from './plantumlStrings.js'
import type { PreviewHost, UriComponents } from './previewConversion.js'

/**
 * Strings used inside the asciidoc preview, localized using our normal
 * localization process.
 */
export function previewStrings(): PreviewStrings {
  return {
    preview: {
      cspAlertMessageText: l10nT('preview.securityMessage.text'),
      cspAlertMessageTitle: l10nT('preview.securityMessage.title'),
      cspAlertMessageLabel: l10nT('preview.securityMessage.label'),
      staleImageTitle: l10nT('preview.staleImage.title'),
    },
    plantUml: plantUmlStrings(),
  }
}

/**
 * Whether the webview logs `[asciidoc.preview]` debug messages: they follow the
 * *Asciidoctor* output channel level (raised via "Developer: Set Log Level…"),
 * not a dedicated setting.
 */
export function isPreviewDebugEnabled(): boolean {
  return logger.logLevel === vscode.LogLevel.Trace
}

export const previewHost: PreviewHost = {
  readFile: async (uri: UriComponents) =>
    vscode.workspace.fs.readFile(vscode.Uri.from(uri)),
  warn: (message: string) => logger.warn(message),
}

export function isDarkTheme(): boolean {
  const themeKind = vscode.window.activeColorTheme.kind
  return (
    themeKind === vscode.ColorThemeKind.Dark ||
    themeKind === vscode.ColorThemeKind.HighContrast
  )
}
