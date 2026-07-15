const ospath = require('path')
const fsp = require('fs').promises

const semver = require('semver')

const pkg = require(ospath.join(__dirname, '..', 'package.json'))
const { spawn } = require('child_process')
const releaseTag = `v${pkg.version}`
const releaseActor = process.env.GITHUB_ACTOR || 'ggrossetie'
// `RELEASE_VERSION` keeps the original semver pre-release tag (e.g. 4.0.0-beta.1)
// that `release.sh` coerces to `pkg.version` (4.0.0) for the marketplace/tag.
const releaseVersion = process.env.RELEASE_VERSION || pkg.version
const parsedVersion = semver.parse(releaseVersion)
// A pre-release is signalled by the workflow's checkbox (`PRERELEASE`), and a
// semver pre-release suffix on the version is still honored as a fallback.
const isPrerelease =
  process.env.PRERELEASE === 'true' ||
  (parsedVersion ? parsedVersion.prerelease.length > 0 : false)
// When it is a pre-release, keep the coerced version (the beta tag never
// surfaces) and only append a visible marker so the CHANGELOG entry is clear.
const versionLabel = isPrerelease ? `${pkg.version} (pre-release)` : pkg.version

async function execute(command, args) {
  return new Promise(function (resolve, reject) {
    const childProcess = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    })
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
        reject(
          new Error(
            `command failed: ${command} ${args.join(' ')}\n${stderrOutput.join('\n')}`,
          ),
        )
      }
    })
    childProcess.on('error', function (err) {
      reject(err)
    })
  })
}

async function getReleaseChangelog() {
  const content = await fsp.readFile('CHANGELOG.md', { encoding: 'utf8' })
  const lines = content.split('\n')
  const releaseChangelog = []
  let start
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
  const previousTag = await execute('sh', [
    '-c',
    'git -c versionsort.suffix=. -c versionsort.suffix=- ls-remote --tags --refs --sort -v:refname origin | head -n+2 | tail -n +2 | cut -d" " -f2 | cut -d"/" -f3',
  ])
  const releaseChangelog = await getReleaseChangelog()

  const notes = `## What's Changed

## Changelog
${releaseChangelog}
## Release meta

Released by: @${releaseActor}

**Full Changelog**: https://github.com/asciidoctor/asciidoctor-vscode/compare/${previousTag}...${releaseTag}
`
  const releaseDate = new Date()
  await fsp.writeFile(
    ospath.join(__dirname, '..', 'release-notes.md'),
    notes,
    'utf8',
  )
  const content = await fsp.readFile('CHANGELOG.md', 'utf8')
  const pad = (value) => String(value).padStart(2, '0')
  const year = releaseDate.getUTCFullYear()
  const month = pad(releaseDate.getUTCMonth() + 1)
  const day = pad(releaseDate.getUTCDate())
  // update CHANGELOG.md: keep an empty Unreleased section on top and stamp the
  // released changelog with the version and date
  const updatedContent = content
    .split('\n')
    .map((line) => {
      if (line.startsWith('## Unreleased')) {
        return `## Unreleased

## ${versionLabel} (${year}-${month}-${day}) - @${releaseActor}`
      }
      return line
    })
    .join('\n')
  await fsp.writeFile(
    ospath.join(__dirname, '..', 'CHANGELOG.md'),
    updatedContent,
    'utf8',
  )
})()
