// Copy the PlantUML browser runtime into media/.
//
// @plantuml/core exposes a small public browser surface: viz-global.js must be
// loaded as a classic script before plantuml.js is imported as an ES module.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const nodeModules = join(process.cwd(), 'node_modules')
const dest = join(process.cwd(), 'media', '@plantuml', 'core')
const plantuml = join(nodeModules, '@plantuml', 'core')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
// Keep the (otherwise git-ignored) media/@plantuml/core directory tracked.
writeFileSync(join(dest, '.gitkeep'), '')

for (const filename of ['plantuml.js', 'viz-global.js']) {
  cpSync(join(plantuml, filename), join(dest, filename))
}
