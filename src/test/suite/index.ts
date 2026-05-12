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

  const controller = new AbortController()
  const stream = nodeTestRun({
    files: testFiles,
    isolation: 'none',
    timeout: 60000,
    signal: controller.signal,
  })

  let passed = 0
  const failedTests: Array<{ name: string; error: string }> = []

  // Use 'data' listener instead of pipe so each chunk is written synchronously
  // as it arrives, avoiding flush timing issues with process.exit()
  stream.compose(new SpecReporter()).on('data', (chunk: Buffer | string) => {
    process.stdout.write(chunk)
  })

  await new Promise<void>((resolve) => {
    // node:test stream never emits 'end' in VS Code's extension host because
    // VS Code keeps async handles alive. We abort after 5s of inactivity.
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleAbort = () => {
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { controller.abort(); resolve() }, 5000)
    }

    stream.on('test:pass', (event) => {
      if (event.details?.type !== 'suite') passed++
      scheduleAbort()
    })
    stream.on('test:fail', (event) => {
      scheduleAbort()
      if (event.details?.type !== 'suite') {
        const err = event.details?.error as (Error & { cause?: unknown }) | undefined
        failedTests.push({
          name: event.name,
          error: err?.stack ?? err?.message ?? String(err),
        })
      }
    })
    stream.on('end', () => { if (idleTimer !== null) clearTimeout(idleTimer); resolve() })
  })

  // Yield once so any pending 'data' events from the reporter are flushed first
  await new Promise<void>((resolve) => setImmediate(resolve))

  if (failedTests.length > 0) {
    process.stdout.write('\nFailures:\n')
    for (const { name, error } of failedTests) {
      process.stdout.write(`\n  ✖ ${name}\n`)
      process.stdout.write(error.split('\n').map((l) => `    ${l}`).join('\n') + '\n')
    }
  }

  const total = passed + failedTests.length
  console.log(`\nTests: ${passed} passed, ${failedTests.length} failed, ${total} total`)

  process.exit(failedTests.length > 0 ? 1 : 0)
}