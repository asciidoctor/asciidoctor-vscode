const { src, dest } = require('gulp')
const ospath = require('path')
const nls = require('vscode-nls-dev')

const languages = [{ folderName: 'fra', id: 'fr' }, { folderName: 'jpn', id: 'ja' }]

const baseDirectory = ospath.join(__dirname, '..', '..')
const i18nBaseDirectory = ospath.join(baseDirectory, 'i18n')

src(ospath.join(baseDirectory, 'package.nls.json'))
  .pipe(nls.createAdditionalLanguageFiles(languages, i18nBaseDirectory))
  .pipe(dest(baseDirectory))
