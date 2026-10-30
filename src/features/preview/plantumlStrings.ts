import { t as l10nT } from '../../core/l10n.js'
import type { PlantUmlStrings } from './plantuml.js'

export function plantUmlStrings(): PlantUmlStrings {
  return {
    alt: l10nT('preview.plantuml.alt'),
    loadFailed: l10nT('preview.plantuml.loadFailed', '{0}'),
    timeout: l10nT('preview.plantuml.timeout'),
  }
}
