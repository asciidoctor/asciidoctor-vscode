import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawn } from 'child_process'
import extract = require('extract-zip')
import fsExtra = require('fs-extra')
import { https } from 'follow-redirects'
import { isNullOrUndefined } from 'util'
import url = require('url')

import { AsciidocEngine } from '../asciidocEngine'
import { Command } from '../commandManager'
import { Logger } from '../logger'

export class ExportAsPDF implements Command
{
  public readonly id = 'asciidoc.exportAsPDF'

  constructor(
    private readonly engine: AsciidocEngine,
    private readonly logger: Logger
  ) { }

  public async execute()
  {
    const editor = vscode.window.activeTextEditor

    if (isNullOrUndefined(editor))
      return

    const doc = editor.document
    const source_name = path.parse(path.resolve(doc.fileName))
    const pdf_filename = vscode.Uri.file(path.join(source_name.root, source_name.dir, source_name.name + '.pdf'))

    const text = doc.getText()
    if (vscode.workspace.getConfiguration('asciidoc', null).get('use_asciidoctorpdf'))
    {
      var docPath = path.parse(path.resolve(doc.fileName))
      var pdfPath = ''

      var pdfUri = await vscode.window.showSaveDialog({ defaultUri: pdf_filename })
      if (!isNullOrUndefined(pdfUri))
      {
        pdfPath = pdfUri.fsPath
      } else
      {
        console.error(`ERROR: invalid pdfUri "${pdfUri}"`)
        return
      }
      let asciidoctorpdf_command = vscode.workspace
        .getConfiguration('asciidoc', null)
        .get('asciidoctorpdf_command', 'asciidoctor-pdf')

      var adocpdf_cmd_array = asciidoctorpdf_command
        .split(/(\s+)/)
        .filter(function (e) { return e.trim().length > 0 })

      let adocpdf_cmd = adocpdf_cmd_array[0]

      let adocpdf_cmd_args = adocpdf_cmd_array.slice(1)
      adocpdf_cmd_args.push.apply(adocpdf_cmd_args, ['-q',
        '-B', '"' + docPath.dir.replace('"', '\\"') + '"',
        '-o', '"' + pdfPath.replace('"', '\\"') + '"', '-',
      ])

      let options = { shell: true, cwd: docPath.dir }

      let asciidoctorpdf = spawn(adocpdf_cmd, adocpdf_cmd_args, options)

      asciidoctorpdf.stderr.on('data', (data) =>
      {
        let errorMessage = data.toString()
        errorMessage += "\n"
        errorMessage += "command: " + adocpdf_cmd + " " + adocpdf_cmd_args.join(" ")
        errorMessage += "\n"
        errorMessage += "If the asciidoctor-pdf binary is not in your PATH, you can set the full path."
        errorMessage += "Go to `File -> Preferences -> User settings` and adjust the asciidoc.asciidoctorpdf_command"
        console.error(errorMessage)
        vscode.window.showErrorMessage(errorMessage)
      })

      asciidoctorpdf.on('close', (code) =>
      {
        offer_open(pdfPath)
      })

      asciidoctorpdf.stdin.write(text)
      asciidoctorpdf.stdin.end()
    }
    else
    {
      let asciidoctorWebPdfPath = vscode.workspace
        .getConfiguration('asciidoc')
        .get('asciidoctorWebPdfPath', '');

      const extPath = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode').extensionPath;
      const platform = process.platform
      const ext = platform == "win32" ? '.exe' : ''
      let binaryDir = path.resolve(path.join(extPath, 'bin', 'asciidoctor-web-pdf-' + platform))
      let binaryPath = path.resolve(binaryDir, 'asciidoctor-web-pdf' + ext)

      if (asciidoctorWebPdfPath != '')
        binaryPath = asciidoctorWebPdfPath;

      if (!fs.existsSync(binaryDir))
      {
        let label = await vscode.window.showInformationMessage("This feature requires asciidoctor-web-pdf.\nDo you want to download?\nWarning ~200 Mb download", "Download")
        if (label != "Download")
          return
          let error_msg = null

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          title: "Downloading asciidoctor-web-pdf",
          // cancellable: true
        }, async (progress) =>
        {
          progress.report({ message: 'Downloading asciidoctor-web-pdf...' });

          const platformMapping = {
            'win32': 'win',
            'darwin': 'mac',
            'linux': 'linux',
          }
          const asciidoctor_web_pdf_version = 'v1.0.0-alpha.12'
          const download_url = `https://github.com/Mogztter/asciidoctor-web-pdf/releases/download/${asciidoctor_web_pdf_version}/asciidoctor-web-pdf-${platformMapping[platform]}-v1.0.0-alpha.12.zip`

          this.logger.log("downloading asciidoctor-web-pdf from:" + download_url)
          fs.mkdirSync(path.join(binaryDir,'../'))
          fs.mkdirSync(binaryDir)
          let filePath = path.join(binaryDir, 'asciidoctor-web-pdf.zip')
          // TODO: Fixme path
          await download_file(download_url, filePath, progress).then( async () => {
            progress.report({ message: 'Unzipping asciidoctor-web-pdf...' })
            await extract(filePath, {dir: binaryDir})
            fs.unlinkSync(filePath)

          }).catch(async (reason) =>
          {
            console.error("Error downloading and extracting", download_url, " ", reason)
            // we leave it clean in case of errors to allow a non-conflicting retry
            fsExtra.removeSync(binaryDir)
            binaryDir = null;
            await vscode.window.showErrorMessage("Error installing asciidoctor-web-pdf, " + reason.toString())
            return
          })
        })
        if (isNullOrUndefined(binaryDir))
          return;
      }
      var save_filename = await vscode.window.showSaveDialog({ defaultUri: pdf_filename })
      
      if (!isNullOrUndefined(save_filename)) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          title: "Converting file",
        }, async (progress) => {
          progress.report({ message: 'Converting file...' })
          await adoc2pdf(text, binaryPath, undefined, undefined, save_filename.fsPath)
          .then((result) => { offer_open(result) })
          .catch((reason) =>
          {
            console.error("Got error", reason)
            vscode.window.showErrorMessage("Error converting to PDF, " + reason.toString())
          })
        })
      }

    }
  }
}

async function download_file(download_url: string, filename: string, progress)
{

  return new Promise((resolve, reject) =>
  {
    var download_options = url.parse(download_url)
    var wstream = fs.createWriteStream(filename)
    var totalDownloaded = 0
    // Proxy support needs to be reworked
    // var proxy = process.env.http_proxy || vscode.workspace.getConfiguration("http", null)["proxy"].trim();
    // var proxyStrictSSL = vscode.workspace.getConfiguration("http", null)["proxyStrictSSL"];
    // if (proxy != '')
    // {
    //   var agent = new HttpsProxyAgent(proxy);
    //   download_options.agent = agent
    //   download_options.rejectUnauthorized = proxyStrictSSL
    // }
    https.get(download_options, (resp) =>
    {
      const contentSize = resp.headers['content-length'];
      if (resp.statusCode != 200)
      {
        wstream.end()
        fs.unlinkSync(filename)
        return reject("http error" + resp.statusCode)
      }

      // A chunk of data has been received
      resp.on('data', (chunk) =>
      {
        totalDownloaded += chunk.length
        progress.report({ message: "Downloading asciidoctor-web-pdf... " + ((totalDownloaded / contentSize) * 100.).toFixed(0) + "%" })
        wstream.write(chunk)
      });

      // The whole response has been received.
      resp.on('end', () =>
      {
        wstream.end()
        resolve(undefined)
      });

    }).on("error", (err) =>
    {
      console.error("Error: " + err.message);
      reject(err.message)
    })
  })
}

function offer_open(destination)
{
  vscode.window.showInformationMessage(("Successfully converted to " + path.basename(destination)), "Open File").then((label: string) =>
  {
    if (label == "Open File")
    {
      switch (process.platform)
      {
        // Use backticks for unix systems to run the open command directly
        // This avoids having to wrap the command AND path in quotes which
        // breaks if there is a single quote (') in the path
        case 'win32':
          exec(`"${destination.replace('"', '\\"')}"`);
          break
        case 'darwin':
          exec(`\`open "${destination.replace('"', '\\"')}" ; exit\``);
          break
        case 'linux':
          exec(`\`xdg-open "${destination.replace('"', '\\"')}" ; exit\``);
          break
        default:
          vscode.window.showWarningMessage("Output type is not supported");
          break
      }
    }
  })
}

export async function adoc2pdf(text: string, binary_path: string, cover: string, footer_center: string, filename: string)
{
  let documentPath = path.dirname(filename)

  return new Promise((resolve, reject) =>
  {
    let options = { cwdir: documentPath, stdio: ['pipe', 'ignore', "pipe"] }
    const krokiPath = path.dirname(require.resolve("asciidoctor-kroki/package.json"))
    let cmd_arguments = ['-r', krokiPath, '-o', filename, '-']

    let command = spawn(binary_path, cmd_arguments, options)
    let error_data = ''

    command.stdin.write(text)
    command.stdin.end()
    command.stderr.on('data', (data) =>
    {
      error_data += data
    })
    command.on('close', (code) =>
    {
      if (code == 0)
        resolve(filename)
      else
        reject(error_data)
    })
  })
}
