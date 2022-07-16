const ospath = require('path')
const childProcess = require('child_process')
const fsp = require('fs').promises

const pkg = require(ospath.join(__dirname, '..', 'package.json'))
const { spawn } = require('child_process')
const releaseTag = `v${pkg.version}`
const releaseActor = process.env['GITHUB_ACTOR'] || 'mogztter'


async function execute(command, args) {
  return new Promise(function (resolve, reject) {
    const childProcess = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] })
    const stderrOutput = []
    const stdoutOutput = []
    childProcess.stdout.on('data', (data) => {
      stdoutOutput.push(data)
    })
    childProcess.stderr.on('data', (data) => {
      stderrOutput.push(data)
    })
    childProcess.on('close', function (code) {
      if (code === 0) {
        resolve(stdoutOutput.join('').trim())
      } else {
        reject(new Error(`command failed: ${command} ${args.join(' ')}\n${stderrOutput.join('\n')}`))
      }
    })
    childProcess.on('error', function (err) {
      reject(err)
    })
  })
}

async function getReleaseChangelog() {
  const content = await fsp.readFile('CHANGELOG.md', 'utf8')
  const lines = content.split('\n')
  const releaseChangelog = []
  let start
  let end = false
  for (const [lineNumber, lineContent] of lines.entries()) {
    if (start) {
      if (lineContent.startsWith('## ')) {
        return releaseChangelog.join('\n')
      }
      releaseChangelog.push(lineContent)
    }
    if (lineContent.startsWith('## Unreleased')) {
      start = lineNumber
    }
  }
  return releaseChangelog
}

;(async () => {
  const previousTag = await execute('sh', ['-c', 'git -c versionsort.suffix=. -c versionsort.suffix=- ls-remote --tags --refs --sort -v:refname origin | head -n+2 | tail -n +2 | cut -d" " -f2 | cut -d"/" -f3'])
  const releaseChangelog = await getReleaseChangelog()

  const notes = `## What's Changed

## Changelog
${releaseChangelog}
## Release meta

Released by: @${releaseActor}

**Full Changelog**: https://github.com/asciidoctor/asciidoctor-vscode/compare/${previousTag}...${releaseTag}
`
  const releaseDate = new Date()
  await fsp.writeFile(ospath.join(__dirname, '..', 'release-notes.md'), notes, 'utf8')
  const content = await fsp.readFile('CHANGELOG.md', 'utf8')
  const lines = content.split('\n')
  // update CHANGELOG.md
  lines.map((line) => {
    if (line.startsWith('## Unreleased')) {
      return `## Unreleased

## ${pkg.version} (${releaseDate.getUTCFullYear()}-${releaseDate.getUTCMonth()}-${releaseDate.getUTCDate()}) - @${releaseActor}`
    }
    return line
  }).join('\n')
  await fsp.writeFile(ospath.join(__dirname, '..', 'CHANGELOG.md'), notes, 'utf8')
})()
