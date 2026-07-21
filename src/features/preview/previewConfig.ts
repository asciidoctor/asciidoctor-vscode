import * as vscode from 'vscode'
import { getWorkspaceFolder } from '../../core/workspace.js'

// Single source of truth for the valid `asciidoc.preview.defaultStyle`
// values (must match the enum in package.json): the type is derived from
// this array instead of duplicated, so validating an untrusted runtime
// value (e.g. a hand-edited settings.json) only requires checking
// membership here, with no separate list to keep in sync.
const ASCIIDOC_PREVIEW_DEFAULT_STYLES = [
  'vscode',
  'asciidoctor',
  'antora',
  'github',
] as const

export type AsciidocPreviewDefaultStyle =
  (typeof ASCIIDOC_PREVIEW_DEFAULT_STYLES)[number]

function isAsciidocPreviewDefaultStyle(
  value: string,
): value is AsciidocPreviewDefaultStyle {
  return (ASCIIDOC_PREVIEW_DEFAULT_STYLES as readonly string[]).includes(value)
}

export class AsciidocPreviewConfiguration {
  public static getForResource(resource: vscode.Uri) {
    return new AsciidocPreviewConfiguration(resource)
  }

  public readonly scrollBeyondLastLine: boolean
  public readonly wordWrap: boolean
  public readonly doubleClickToSwitchToEditor: boolean
  public readonly scrollEditorWithPreview: boolean
  public readonly scrollPreviewWithEditor: boolean
  public readonly markEditorSelection: boolean
  public readonly preservePreviewWhenHidden: boolean

  public readonly lineHeight: number
  public readonly fontSize: number
  public readonly fontFamily: string | undefined
  public readonly additionalStyles: string[]
  public readonly refreshInterval: number
  public readonly defaultStyle: AsciidocPreviewDefaultStyle
  // Whether `defaultStyle` came from an explicit `preview.defaultStyle`
  // setting, as opposed to falling back to the deprecated
  // `preview.useEditorStyle` boolean. Antora auto-detection (see
  // AsciidoctorWebViewConverter.resolveEffectiveDefaultStyle) only kicks in
  // when this is false: an explicit choice — including an explicit
  // `vscode` — always wins, but neither value of the legacy boolean should
  // block auto-detection, since neither expresses an opinion about Antora.
  public readonly defaultStyleExplicit: boolean
  public readonly previewStyle: string
  public readonly previewTemplates: string[]

  private constructor(resource: vscode.Uri) {
    const editorConfig = vscode.workspace.getConfiguration('editor', resource)
    const asciidocConfig = vscode.workspace.getConfiguration(
      'asciidoc',
      resource,
    )
    const asciidocEditorConfig = vscode.workspace.getConfiguration(
      '[asciidoc]',
      resource,
    )

    this.scrollBeyondLastLine = editorConfig.get<boolean>(
      'scrollBeyondLastLine',
      false,
    )

    this.wordWrap = editorConfig.get<string>('wordWrap', 'off') !== 'off'
    if (asciidocEditorConfig && asciidocEditorConfig['editor.wordWrap']) {
      this.wordWrap = asciidocEditorConfig['editor.wordWrap'] !== 'off'
    }

    this.scrollPreviewWithEditor = !!asciidocConfig.get<boolean>(
      'preview.scrollPreviewWithEditor',
      true,
    )
    this.scrollEditorWithPreview = !!asciidocConfig.get<boolean>(
      'preview.scrollEditorWithPreview',
      true,
    )
    this.doubleClickToSwitchToEditor = !!asciidocConfig.get<boolean>(
      'preview.doubleClickToSwitchToEditor',
      true,
    )
    this.markEditorSelection = !!asciidocConfig.get<boolean>(
      'preview.markEditorSelection',
      true,
    )
    this.preservePreviewWhenHidden = !!asciidocConfig.get<boolean>(
      'preview.preservePreviewWhenHidden',
      false,
    )

    this.fontFamily = asciidocConfig.get<string | undefined>(
      'preview.fontFamily',
      undefined,
    )
    this.fontSize = Math.max(
      8,
      +asciidocConfig.get<number>('preview.fontSize', NaN),
    )
    this.lineHeight = Math.max(
      0.6,
      +asciidocConfig.get<number>('preview.lineHeight', NaN),
    )

    this.additionalStyles = asciidocConfig.get<string[]>(
      'preview.additionalStyles',
      [],
    )
    const defaultStyleResolution = this.resolveDefaultStyle(asciidocConfig)
    this.defaultStyle = defaultStyleResolution.style
    this.defaultStyleExplicit = defaultStyleResolution.explicit
    this.previewStyle = asciidocConfig.get<string>('preview.style', '')
    this.previewTemplates = asciidocConfig.get<string[]>(
      'preview.templates',
      [],
    )
    this.refreshInterval = Math.max(
      0.6,
      +asciidocConfig.get<number>('preview.refreshInterval', NaN),
    )
  }

  // The schema default for `preview.defaultStyle` is `''` ("Automatic"),
  // distinct from every real style value (including 'vscode', which is also
  // the *effective* default via the legacy fallback below). That distinction
  // matters in the Settings UI: if 'vscode' were both the schema default and
  // a selectable value, a dropdown already showing 'vscode' as the inherited
  // default may not register a "change" — and so not persist anything — when
  // the user picks the identical-looking 'vscode' entry on purpose. With a
  // dedicated empty default, picking any real style is always a change from
  // what was already displayed.
  private resolveDefaultStyle(asciidocConfig: vscode.WorkspaceConfiguration): {
    style: AsciidocPreviewDefaultStyle
    explicit: boolean
  } {
    const defaultStyle = asciidocConfig.get<string>('preview.defaultStyle', '')
    if (isAsciidocPreviewDefaultStyle(defaultStyle)) {
      return { style: defaultStyle, explicit: true }
    }

    const useEditorStyle = asciidocConfig.get<boolean>(
      'preview.useEditorStyle',
      true,
    )
    return { style: useEditorStyle ? 'vscode' : 'asciidoctor', explicit: false }
  }

  public isEqualTo(otherConfig: AsciidocPreviewConfiguration) {
    // eslint-disable-next-line prefer-const
    for (const key in this) {
      if (Object.hasOwn(this, key) && key !== 'additionalStyles') {
        if (this[key] !== otherConfig[key]) {
          return false
        }
      }
    }

    // Check additional styles
    if (this.additionalStyles.length !== otherConfig.additionalStyles.length) {
      return false
    }
    for (let i = 0; i < this.additionalStyles.length; ++i) {
      if (this.additionalStyles[i] !== otherConfig.additionalStyles[i]) {
        return false
      }
    }

    return true
  }

  // eslint-disable-next-line no-undef
  [key: string]: any
}

export class AsciidocPreviewConfigurationManager {
  private readonly previewConfigurationsForWorkspaces = new Map<
    string,
    AsciidocPreviewConfiguration
  >()

  public loadAndCacheConfiguration(
    resource: vscode.Uri,
  ): AsciidocPreviewConfiguration {
    const config = AsciidocPreviewConfiguration.getForResource(resource)
    this.previewConfigurationsForWorkspaces.set(this.getKey(resource), config)
    return config
  }

  public hasConfigurationChanged(resource: vscode.Uri): boolean {
    const key = this.getKey(resource)
    const currentConfig = this.previewConfigurationsForWorkspaces.get(key)
    const newConfig = AsciidocPreviewConfiguration.getForResource(resource)
    return !currentConfig || !currentConfig.isEqualTo(newConfig)
  }

  private getKey(resource: vscode.Uri): string {
    return getWorkspaceFolder(resource)?.uri?.path || ''
  }
}
