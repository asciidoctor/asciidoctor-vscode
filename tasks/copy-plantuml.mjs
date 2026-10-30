// Copy the PlantUML browser runtime into media/.
//
// The preview loads `viz-global.js` as a classic script, then imports the
// `plantuml.js` module. The rest of the package is demo pages and the optional
// icon sets, which the engine would not find in media/ anyway.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const src = join(process.cwd(), 'node_modules', '@plantuml', 'core')
const dest = join(process.cwd(), 'media', '@plantuml', 'core')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const filename of ['plantuml.js', 'viz-global.js', 'LICENSE']) {
  cpSync(join(src, filename), join(dest, filename))
}
