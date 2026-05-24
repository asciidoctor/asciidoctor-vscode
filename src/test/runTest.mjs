import * as path from 'node:path'
import { runTests } from '@vscode/test-electron'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    })
  } catch (_err) {
    process.exit(1)
  }
}

main().then()
