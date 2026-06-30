import { exec, SpawnOptions, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Document as AsciidoctorDocument, load } from '@asciidoctor/core'
import { v4 as uuidv4 } from 'uuid'
import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { logger } from '../core/logger.js'
import { getWorkspaceFolder } from '../core/workspace.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidocTextDocument } from '../features/asciidoctor/asciidocTextDocument.js'
import { getAsciidoctorConfigContent } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'
import {
  resolveAsciidocDocument,
  WebviewContext,
} from './resolveAsciidocDocument.js'

export class ExportAsPDF implements Command {
  public readonly id = 'asciidoc.exportAsPDF'
  private readonly exportAsPdfStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )

  constructor(
    private readonly engine: AsciidocEngine,
    private readonly context: vscode.ExtensionContext,
    private readonly previewManager: AsciidocPreviewManager,
  ) {}

  public async execute(context?: WebviewContext) {
    const doc = await resolveAsciidocDocument(this.previewManager, context)
    if (!doc) {
      return
    }
    const asciidocTextDocument = AsciidocTextDocument.fromTextDocument(doc)
    const baseDirectory = asciidocTextDocument.baseDir

    const asciidocPdfConfig = vscode.workspace.getConfiguration('asciidoc.pdf')

    // Resolve the working directory used to run the export process and to
    // expand `${workspaceFolder}` placeholders in configured command paths.
    // A workspace is not required: when the document does not belong to any
    // workspace folder, fall back to the document's own directory rather than
    // aborting the export (#749).
    const workspaceFolder = getWorkspaceFolder(doc.uri)
    const workspacePath =
      workspaceFolder?.uri.fsPath ?? path.dirname(doc.uri.fsPath)

    // Compute the default output path. By default the PDF is written next to the
    // document, but `asciidoc.pdf.outputDirectory` can redirect it elsewhere
    // while keeping the document's base name (#868).
    const defaultPdfPath = _resolvePdfOutputPath(
      asciidocPdfConfig.get<string>('outputDirectory', ''),
      baseDirectory,
      workspacePath,
      asciidocTextDocument.fileName + '.pdf',
    )

    // When `asciidoc.pdf.askOutputLocation` is disabled, skip the save dialog
    // and write directly to the default path, overwriting any existing file.
    // This enables a tight save/regenerate iteration cycle (#868). The default
    // (true) preserves the historical prompt-on-every-export behaviour.
    let pdfOutputUri: vscode.Uri
    if (asciidocPdfConfig.get<boolean>('askOutputLocation', true)) {
      const selectedUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPdfPath),
      })
      if (!selectedUri) {
        logger.debug('No output directory selected to save the PDF, aborting.')
        return
      }
      pdfOutputUri = selectedUri
    } else {
      pdfOutputUri = vscode.Uri.file(defaultPdfPath)
    }

    const pdfOutputPath = pdfOutputUri.fsPath
    // Make sure the destination directory exists (mkdir -p) so the PDF engine
    // can write the output file even when `outputDirectory` points to a folder
    // that does not exist yet.
    fs.mkdirSync(path.dirname(pdfOutputPath), { recursive: true })

    const asciidoctorConfigContent = await getAsciidoctorConfigContent(doc.uri)
    let text = doc.getText()
    if (asciidoctorConfigContent !== undefined) {
      text = `${asciidoctorConfigContent}
${text}`
    }
    const pdfEngine = asciidocPdfConfig.get('engine')
    if (pdfEngine === 'asciidoctor-pdf') {
      const asciidoctorPdfCommand = await this.resolveAsciidoctorPdfCommand(
        asciidocPdfConfig,
        workspacePath,
      )
      if (asciidoctorPdfCommand === undefined) {
        return
      }
      const asciidoctorPdfCommandArgs = asciidocPdfConfig.get<string[]>(
        'asciidoctorPdfCommandArgs',
        [],
      )
      const defaultArgs = [
        '-q', // quiet
        '-B',
        `"${baseDirectory.replace('"', '\\"')}"`, // base directory
        '-o',
        `"${pdfOutputPath.replace('"', '\\"')}"`, // output file
        '-a',
        'allow-uri-read',
      ]
      // Resolve a relative `pdf-theme` against the document's base directory.
      // Since the document is piped through stdin and the process runs from the
      // workspace root, asciidoctor-pdf would otherwise resolve the theme file
      // relative to the current working directory rather than the document (#979).
      const headerDocument = await load(text, { header_only: true })
      const pdfThemeArgs = _resolvePdfThemesArgs(
        headerDocument.getAttribute('pdf-theme'),
        headerDocument.getAttribute('pdf-themesdir'),
        baseDirectory,
      )
      const args = defaultArgs
        .concat(pdfThemeArgs)
        .concat(asciidoctorPdfCommandArgs)
        .concat(['-']) // read from stdin

      try {
        this.exportAsPdfStatusBarItem.name = 'Export As PDF'
        this.exportAsPdfStatusBarItem.text =
          '$(loading~spin) Generating a PDF using asciidoctor-pdf...'
        this.exportAsPdfStatusBarItem.show()
        await execute(asciidoctorPdfCommand.command, args, text, {
          shell: true,
          cwd: asciidoctorPdfCommand.cwd,
        })
        this.exportAsPdfStatusBarItem.text =
          '$(pass) PDF has been successfully generated!'
        offerOpen(pdfOutputPath)
      } catch (err) {
        logger.error('Unable to generate a PDF using asciidoctor-pdf: ', err)
        await vscode.window.showErrorMessage(
          `Unable to generate a PDF using asciidoctor-pdf: ${err}`,
        )
      } finally {
        this.exportAsPdfStatusBarItem.hide()
      }
    } else if (pdfEngine === 'wkhtmltopdf') {
      let wkhtmltopdfCommandPath = asciidocPdfConfig.get(
        'wkhtmltopdfCommandPath',
        '',
      )
      if (wkhtmltopdfCommandPath === '') {
        wkhtmltopdfCommandPath = `wkhtmltopdf${process.platform === 'win32' ? '.exe' : ''}`
      } else {
        wkhtmltopdfCommandPath = wkhtmltopdfCommandPath.replace(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: magic-value used in the VS code settings
          '${workspaceFolder}',
          workspacePath,
        )
      }
      try {
        await commandExists(wkhtmltopdfCommandPath, {
          shell: true,
          cwd: workspacePath,
        })
      } catch (error) {
        // command does not exist!
        logger.error('wkhtmltopdf command is not available', error)
        const answer = await vscode.window.showInformationMessage(
          'This feature requires wkhtmltopdf. Please download the latest version from https://wkhtmltopdf.org/downloads.html. If wkhtmltopdf is not available on your path, you can configure the path to wkhtmltopdf executable from the extension settings.',
          'Download',
        )
        if (answer === 'Download') {
          vscode.env.openExternal(
            vscode.Uri.parse('https://wkhtmltopdf.org/downloads.html'),
          )
        }
        return
      }
      const wkhtmltopdfCommandArgs = asciidocPdfConfig.get<string[]>(
        'wkhtmltopdfCommandArgs',
        [],
      )
      const defaultArgs = [
        '--enable-local-file-access',
        '--encoding',
        ' utf-8',
        '--javascript-delay',
        '1000',
      ]

      const { output: html, document } = await this.engine.export(
        doc,
        'html5',
        { 'data-uri@': '' },
      )
      const footerCenter = document?.getAttribute('footer-center')
      if (footerCenter) {
        defaultArgs.push('--footer-center', footerCenter)
      }
      const objectArgs = []
      const showTitlePage = document?.isAttribute(
        'showTitlePage',
      ) as unknown as boolean // incorrect type definition in Asciidoctor.js
      const titlePageLogo = document?.getAttribute('titlePageLogo')
      const coverFilePath = showTitlePage
        ? createCoverFile(titlePageLogo, baseDirectory, document)
        : undefined
      if (coverFilePath) {
        objectArgs.push('cover', coverFilePath)
      }
      // wkhtmltopdf [GLOBAL OPTION]... [OBJECT]... <output file>
      const args = defaultArgs
        .concat(wkhtmltopdfCommandArgs)
        .concat(objectArgs)
        .concat(['-', pdfOutputPath]) // read from stdin and outputfile

      try {
        this.exportAsPdfStatusBarItem.name = 'Export As PDF'
        this.exportAsPdfStatusBarItem.text =
          '$(loading~spin) Generating a PDF using wkhtmltopdf...'
        this.exportAsPdfStatusBarItem.show()
        await execute(wkhtmltopdfCommandPath, args, html, {
          shell: true,
          cwd: workspacePath,
          stdio: ['pipe', 'ignore', 'pipe'],
        })
        this.exportAsPdfStatusBarItem.text =
          '$(pass) PDF has been successfully generated!'
        offerOpen(pdfOutputPath)
      } catch (err) {
        logger.error('Unable to generate a PDF using wkhtmltopdf: ', err)
        await vscode.window.showErrorMessage(
          `Unable to generate a PDF using wkhtmltopdf: ${err}`,
        )
      } finally {
        this.exportAsPdfStatusBarItem.hide()
        if (coverFilePath) {
          // remove temporary file
          fs.unlinkSync(coverFilePath)
        }
      }
    }
  }

  private async resolveAsciidoctorPdfCommand(
    asciidocPdfConfig,
    workspacePath,
  ): Promise<{ cwd: string; command: string } | undefined> {
    let asciidoctorPdfCommandPath = asciidocPdfConfig.get(
      'asciidoctorPdfCommandPath',
      '',
    )
    if (asciidoctorPdfCommandPath !== '') {
      asciidoctorPdfCommandPath = asciidoctorPdfCommandPath.replace(
        // biome-ignore lint/suspicious/noTemplateCurlyInString: magic-value used in the VS code settings
        '${workspaceFolder}',
        workspacePath,
      )
      // use the command specified
      return {
        cwd: workspacePath,
        command: asciidoctorPdfCommandPath,
      }
    }
    if (await this.isAsciidoctorPdfAvailable(workspacePath)) {
      // `asciidoctor-pdf` is available
      return {
        cwd: workspacePath,
        command: 'asciidoctor-pdf',
      }
    }
    if (await this.isBundlerAvailable()) {
      const globalStorageUri = this.context.globalStorageUri
      const installDirectory = path.join(
        globalStorageUri.fsPath,
        'asciidoctor-pdf-install',
      )
      try {
        // The install directory only exists once a local install has succeeded.
        // Probing `bundle exec asciidoctor-pdf` with a non-existent `cwd` would
        // make `spawn` fail with a misleading `spawn /bin/sh ENOENT` instead of a
        // clear "not installed" signal, so bail out explicitly first (#973).
        if (!fs.existsSync(installDirectory)) {
          throw new Error(
            `Asciidoctor PDF is not installed locally (missing '${installDirectory}')`,
          )
        }
        await commandExists('bundle exec asciidoctor-pdf', {
          shell: true,
          cwd: installDirectory,
        })
        return {
          cwd: installDirectory,
          command: 'bundle exec asciidoctor-pdf',
        }
      } catch (bundleExecError) {
        logger.info(
          `Error while trying to execute 'bundle exec asciidoctor-pdf' from '${installDirectory}', cause: `,
          bundleExecError,
        )
        // `asciidoctor-pdf` is not available in global storage, offer to automatically install it
        const answer = await vscode.window.showInformationMessage(
          'This feature requires asciidoctor-pdf. Do you want to install the latest version locally using Bundler? Alternatively, you can configure the path to the asciidoctor-pdf executable from the extension settings.',
          'Install locally',
        )
        if (answer === 'Install locally') {
          this.exportAsPdfStatusBarItem.name = 'Asciidoctor PDF Installer'
          this.exportAsPdfStatusBarItem.text =
            '$(loading~spin) Installing Asciidoctor PDF...'
          this.exportAsPdfStatusBarItem.show()
          try {
            if (!fs.existsSync(installDirectory)) {
              fs.mkdirSync(installDirectory, { recursive: true })
            }
            const gemfile = path.join(installDirectory, 'Gemfile')

            await execute(
              'bundle',
              ['config', '--local', 'path', '.bundle/gem'],
              undefined,
              { cwd: installDirectory },
            )
            fs.writeFileSync(
              gemfile,
              `source 'https://rubygems.org'

gem 'asciidoctor-pdf'`,
              { encoding: 'utf8' },
            )
            await execute('bundle', ['install'], undefined, {
              cwd: installDirectory,
            })
            this.exportAsPdfStatusBarItem.text =
              '$(pass) Asciidoctor PDF installed!'
            const answer = await vscode.window.showInformationMessage(
              `Successfully installed Asciidoctor PDF in ${installDirectory}`,
              'Continue',
            )
            if (answer === 'Continue') {
              return {
                command: 'bundle exec asciidoctor-pdf',
                cwd: installDirectory,
              }
            } else {
              return undefined
            }
          } catch (err) {
            await vscode.window.showErrorMessage(
              `Unable to install the latest version of asciidoctor-pdf using Bundler: ${err}`,
            )
            return undefined
          } finally {
            this.exportAsPdfStatusBarItem.hide()
          }
        } else {
          return undefined
        }
      }
    } else {
      const answer = await vscode.window.showInformationMessage(
        'This feature requires asciidoctor-pdf, but the executable was not found on your PATH. ' +
          "If you haven't installed it yet, install asciidoctor-pdf. " +
          'If you have already installed it, VS Code may not see it because it was launched from the Dock/Finder rather than a terminal and does not inherit your shell PATH: ' +
          'set its full path in the "Asciidoc › Pdf: Asciidoctor Pdf Command Path" setting (e.g. /opt/homebrew/bin/asciidoctor-pdf).',
        'Install',
        'Configure',
      )
      if (answer === 'Configure') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:asciidoctor.asciidoctor-vscode asciidoctorPdfCommand',
        )
      } else if (answer === 'Install') {
        await vscode.env.openExternal(
          vscode.Uri.parse(
            'https://docs.asciidoctor.org/pdf-converter/latest/install/',
          ),
        )
      }
      return undefined
    }
  }

  private async isBundlerAvailable(): Promise<boolean> {
    try {
      await commandExists('bundle', { shell: true })
      return true
    } catch (_err) {
      // unable to find `bundle`, Bundler is probably not installed
      return false
    }
  }

  private async isAsciidoctorPdfAvailable(cwd: string) {
    try {
      await commandExists('asciidoctor-pdf', { shell: true, cwd })
      return true
    } catch (err) {
      // command does not exist
      logger.warn('asciidoctor-pdf command is not available', err)
      return false
    }
  }
}

/**
 * Augment `process.env.PATH` with the common locations where Homebrew, rbenv,
 * rvm and `gem` install CLI tools. VS Code launched from the GUI (Dock, Finder,
 * Spotlight) does not inherit the shell PATH, so `asciidoctor-pdf`/`bundle`
 * installed in those directories are otherwise invisible to child processes,
 * which makes the export fall back to (or fail on) the Bundler install (#973).
 * Only existing directories not already on PATH are appended, so precedence of
 * the configured PATH is preserved. Windows inherits the PATH, so it is left
 * untouched.
 */
export function getSpawnEnv(): NodeJS.ProcessEnv {
  if (process.platform === 'win32') {
    return process.env
  }
  const home = os.homedir()
  const currentPath = process.env.PATH ?? ''
  const known = new Set(currentPath.split(path.delimiter))
  const missing = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    path.join(home, '.rbenv/shims'),
    path.join(home, '.rvm/bin'),
    path.join(home, '.local/bin'),
  ].filter((dir) => !known.has(dir) && fs.existsSync(dir))
  if (missing.length === 0) {
    return process.env
  }
  return {
    ...process.env,
    PATH: [currentPath, ...missing].filter(Boolean).join(path.delimiter),
  }
}

function commandExists(
  command: string,
  options: SpawnOptions,
): Promise<{ stdout: string; code: number }> {
  const childProcess = spawn(command, ['--version'], {
    env: getSpawnEnv(),
    ...options,
  })
  return new Promise(function (resolve, reject) {
    const stdoutOutput = []
    childProcess.stdout.on('data', (data) => {
      stdoutOutput.push(data)
    })
    childProcess.on('close', function (code) {
      if (code === 0) {
        resolve({
          stdout: stdoutOutput.join('\n'),
          code,
        })
      } else {
        reject(new Error(`command failed: ${command}`))
      }
    })
    childProcess.on('error', function (err) {
      reject(decorateSpawnError(err, command, options))
    })
  })
}

/**
 * Turn the opaque `spawn /bin/sh ENOENT` error that Node reports when the spawn
 * `cwd` is missing into an actionable message. With `shell: true`, an invalid
 * working directory is attributed to the shell binary rather than the directory
 * itself, which is highly misleading (#973).
 */
export function decorateSpawnError(
  err: NodeJS.ErrnoException,
  command: string,
  options: SpawnOptions,
): Error {
  if (err?.code === 'ENOENT' && options.cwd && !fs.existsSync(options.cwd)) {
    return new Error(
      `Unable to run '${command}': working directory does not exist ('${options.cwd}')`,
    )
  }
  return err
}

function execute(
  command: string,
  args: string[],
  input: string | undefined,
  options: SpawnOptions,
): Promise<boolean> {
  logger.debug(
    `Executing command: '${command} ${args.join(' ')}' (cwd: '${options.cwd ?? process.cwd()}')`,
  )
  return new Promise(function (resolve, reject) {
    const childProcess = spawn(command, args, {
      env: getSpawnEnv(),
      ...options,
    })
    const stderrOutput = []
    childProcess.stderr.on('data', (data) => {
      stderrOutput.push(data)
    })
    childProcess.on('close', function (code) {
      if (code === 0) {
        resolve(true)
      } else {
        reject(
          new Error(
            `command failed: ${command} ${args.join(' ')}\n${stderrOutput.join('\n')}`,
          ),
        )
      }
    })
    childProcess.on('error', function (err) {
      reject(decorateSpawnError(err, command, options))
    })
    if (input !== undefined) {
      childProcess.stdin.write(input)
      childProcess.stdin.end()
    }
  })
}

/**
 * Compute the extra asciidoctor-pdf arguments needed so that a relative
 * `pdf-theme` file resolves against the document's base directory.
 *
 * asciidoctor-pdf resolves a `.yml` theme path (when no `pdf-themesdir` is set)
 * relative to the current working directory. Because the extension pipes the
 * document through stdin and runs the process from the workspace root, a theme
 * such as `pdf-theme: custom-theme.yml` located next to the document is not
 * found. Setting `pdf-themesdir` to the document's base directory restores the
 * behaviour one gets when running `asciidoctor-pdf <file>` from that directory.
 *
 * Built-in named themes (e.g. `pdf-theme: default`) and explicit `pdf-themesdir`
 * or absolute theme paths are left untouched. (#979)
 */
export function _resolvePdfThemesArgs(
  pdfTheme: string | undefined,
  pdfThemesDir: string | undefined,
  baseDirectory: string,
): string[] {
  if (
    pdfTheme &&
    pdfTheme.endsWith('.yml') &&
    !pdfThemesDir &&
    !path.isAbsolute(pdfTheme)
  ) {
    return ['-a', `pdf-themesdir=${baseDirectory}`]
  }
  return []
}

/**
 * Resolve the absolute path of the exported PDF file.
 *
 * When `outputDirectory` is empty, the PDF is written next to the document
 * (historical behaviour). Otherwise the file is written into `outputDirectory`,
 * keeping the document's base name. The `${workspaceFolder}` placeholder is
 * expanded and a relative directory is resolved against the workspace folder
 * (or, without a workspace, the document's own directory). (#868)
 */
export function _resolvePdfOutputPath(
  outputDirectory: string | undefined,
  baseDirectory: string,
  workspacePath: string,
  pdfFileName: string,
): string {
  if (!outputDirectory || outputDirectory.trim() === '') {
    return path.join(baseDirectory, pdfFileName)
  }
  let directory = outputDirectory.replace(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: magic-value used in the VS code settings
    '${workspaceFolder}',
    workspacePath,
  )
  if (!path.isAbsolute(directory)) {
    directory = path.resolve(workspacePath, directory)
  }
  return path.join(directory, pdfFileName)
}

export function _generateCoverHtmlContent(
  titlePageLogo: string | undefined,
  baseDir: string,
  document: AsciidoctorDocument,
  extensionUri: vscode.Uri,
): string {
  let imageHTML = ''
  if (titlePageLogo) {
    const imageURL = titlePageLogo.startsWith('http')
      ? titlePageLogo
      : path.join(baseDir, titlePageLogo)
    imageHTML = `<img src="${imageURL}">`
  }
  const styleHref = vscode.Uri.joinPath(
    extensionUri,
    'media',
    'all-centered.css',
  )
  const doctitle: string = document?.getAttribute('doctitle', '')
  const author = document?.getAttribute('author', '')
  const email = document?.getAttribute('email', '')
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="${styleHref}">
  </head>
  <body>
  <div class="outer">
    <div class="middle">
      <div class="inner">
${imageHTML}
        <h1>${doctitle}</h1>
        p>${author} &lt;${email}&gt;</p>
      </div>
    </div>
  </div>
  </body>
  </html>`
}

function createCoverFile(
  titlePageLogo: string,
  baseDir: string,
  document: AsciidoctorDocument,
) {
  const extensionContext = vscode.extensions.getExtension(
    'asciidoctor.asciidoctor-vscode',
  )
  const coverHtmlContent = _generateCoverHtmlContent(
    titlePageLogo,
    baseDir,
    document,
    extensionContext.extensionUri,
  )

  const tmpFilePath = path.join(os.tmpdir(), uuidv4() + '.html')
  fs.writeFileSync(tmpFilePath, coverHtmlContent, 'utf-8')
  return tmpFilePath
}

function offerOpen(destination) {
  // Saving the JSON that represents the document to a temporary JSON-file.
  vscode.window
    .showInformationMessage(
      'Successfully converted to ' + path.basename(destination),
      'Open File',
    )
    .then((label: string) => {
      if (label === 'Open File') {
        switch (process.platform) {
          // Use backticks for unix systems to run the open command directly
          // This avoids having to wrap the command AND path in quotes which
          // breaks if there is a single quote (') in the path
          case 'win32':
            exec(`"${destination.replace('"', '\\"')}"`)
            break
          case 'darwin':
            exec(`\`open "${destination.replace('"', '\\"')}" ; exit\``)
            break
          case 'linux':
            exec(`\`xdg-open "${destination.replace('"', '\\"')}" ; exit\``)
            break
          default:
            vscode.window.showWarningMessage('Output type is not supported')
            break
        }
      }
    })
}
