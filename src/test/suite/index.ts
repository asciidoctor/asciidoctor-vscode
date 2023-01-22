import * as path from 'path'
import * as Mocha from 'mocha'
import * as glob from 'glob'

export function run (): Promise<void> {
  // Create the mocha test
  // eslint-disable-next-line new-cap
  const mocha = new Mocha.default({
    ui: 'tdd',
    color: true,
    timeout: 60000,
  })

  const testsRoot = path.resolve(__dirname, '..')

  return new Promise((resolve, reject) => {
    glob.default('**/**.test.js', { cwd: testsRoot }, (err, files) => {
      if (err) {
        return reject(err)
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)))

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`))
          } else {
            resolve()
          }
        })
      } catch (err) {
        console.error(err)
        reject(err)
      }
    })
  })
}
