const { src, dest } = require('gulp')
const ospath = require('path')
const nls = require('vscode-nls-dev')

const languages = [{ folderName: 'fra', id: 'fr' }, { folderName: 'jpn', id: 'ja' }]
const baseDirectory = ospath.join(__dirname, '..', '..')
const i18nBaseDirectory = ospath.join(baseDirectory, 'i18n')
const distSrcDirectory = ospath.join(baseDirectory, 'dist', 'src')

src(ospath.join(baseDirectory, 'dist', 'src', '**', '*.js'))
  .pipe(nls.rewriteLocalizeCalls())
  .pipe(nls.createAdditionalLanguageFiles(languages, i18nBaseDirectory, 'src'))
  .pipe(dest(distSrcDirectory))
