import * as path from 'node:path'
import { runTests } from '@vscode/test-electron'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Parse the optional file filter into the environment passed to the VS Code
 * test host, where it is read back and applied in src/test/suite/index.ts.
 *
 *   --file, -f <substring>   only run test files whose name contains <substring>
 *
 * Also accepts the `--file=value` form. Examples:
 *   node ./src/test/runTest.mjs --file preview
 *   node ./src/test/runTest.mjs -f preview
 */
function parseFilters(argv) {
  const env = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    // Value is either after `=` or the next argument.
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
    if (name === '--file' || name === '-f') {
      env.ASCIIDOC_TEST_FILE = value
    }
  }
  return env
}

async function main() {
  try {
    const projectRootPath = path.join(__dirname, '..', '..')

    const extensionDevelopmentPath = projectRootPath
    const extensionTestsPath = path.join(
      projectRootPath,
      'build',
      'src',
      'test',
      'suite',
      'index',
    )
    const testsWorkspaceDirectoryPath = path.join(
      projectRootPath,
      'test-workspace',
    )

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testsWorkspaceDirectoryPath],
      extensionTestsEnv: parseFilters(process.argv.slice(2)),
    })
  } catch (_err) {
    process.exit(1)
  }
}

main().then()
