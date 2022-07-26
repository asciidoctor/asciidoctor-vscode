import * as path from 'path'

import { runTests } from 'vscode-test'

async function main () {
  try {
    const projectRootPath = path.join(__dirname, '..', '..', '..')
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = projectRootPath

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.join(__dirname, 'suite', 'index')

    // The path to the extension test workspace directory
    const testsWorkspaceDirectoryPath = path.join(projectRootPath, 'test-workspace')

    const testOptions = {
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testsWorkspaceDirectoryPath],
    }
    console.log('Run tests with options: ', testOptions)

    // Download VS Code, unzip it and run the integration test
    const exitCode = await runTests(testOptions)
    console.log('Exit code: ', exitCode)
  } catch (err) {
    console.error('Failed to run tests')
    process.exit(1)
  }
}

main()
