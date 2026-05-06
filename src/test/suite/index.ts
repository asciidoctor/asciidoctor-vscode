import { readdirSync } from 'node:fs'
import { run as nodeTestRun } from 'node:test'
import { spec as SpecReporter } from 'node:test/reporters'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as vscode from 'vscode'
import { setExtensionContext } from '../helper.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode')
  await extension?.activate()
  setExtensionContext((globalThis as any).testExtensionContext)

  const testDir = path.join(__dirname, '..')
  const testFiles = readdirSync(testDir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(testDir, f))

  const stream = nodeTestRun({
    files: testFiles,
    isolation: 'none',
    timeout: 60000,
  })

  let passed = 0
  let failures = 0

  await new Promise<void>((resolve) => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleExit = () => {
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(resolve, 8000)
    }

    stream.on('test:pass', (event) => {
      if (event.details?.type !== 'suite') passed++
      scheduleExit()
    })
    stream.on('test:fail', (event) => {
      scheduleExit()
      if (event.details?.type !== 'suite') {
        failures++
        const err = event.details?.error as (Error & { cause?: unknown }) | undefined
        console.error(`\n  ${err?.stack ?? err?.message ?? String(err)}`)
      }
    })
    stream.on('end', resolve)

    stream.compose(new SpecReporter()).pipe(process.stdout, { end: false })
  })

  const total = passed + failures
  console.log(`\nTests: ${passed} passed, ${failures} failed, ${total} total`)

  process.exit(failures > 0 ? 1 : 0)
}
