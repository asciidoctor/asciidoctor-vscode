import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawnSync } from "child_process"
import * as zlib from 'zlib';
import { https } from 'follow-redirects'
import { isNullOrUndefined } from 'util'
import { spawn } from "child_process";
import { AsciidocParser } from '../text-parser';
import { Command } from '../commandManager';
import { AsciidocEngine } from '../asciidocEngine';
import * as tmp from "tmp";

var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');

export class ExportAsPDF implements Command {
    public readonly id = 'asciidoc.exportAsPDF';

	constructor(
		private readonly engine: AsciidocEngine
	) { }

    public async execute() {
        const editor = vscode.window.activeTextEditor
        if(isNullOrUndefined(editor))
            return

        const doc = editor.document
        const text = doc.getText()

        if (vscode.workspace.getConfiguration('asciidoc').get('use_asciidoctorpdf')) {
            var docPath = path.parse(path.resolve(doc.fileName))
            var pdfPath = ''

            if (doc.isUntitled) {
                pdfPath = path.join(docPath.root, docPath.dir, "temp.pdf")
            } else {
                pdfPath = path.join(docPath.root, docPath.dir, docPath.name+".pdf")
            }

            var pdfUri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(pdfPath) })
            if (!isNullOrUndefined(pdfUri)) {
                pdfPath = pdfUri.fsPath
            } else {
                console.error(`ERROR: invalid pdfUri "${pdfUri}"`)
                return
            }

            let asciidoctorpdf_command = vscode.workspace
                .getConfiguration('asciidoc')
                .get('asciidoctorpdf_command', 'asciidoctor-pdf')

            var adocpdf_cmd_array = asciidoctorpdf_command
                .split(/(\s+)/)
                .filter( function(e) { return e.trim().length > 0 } )

            var adocpdf_cmd = adocpdf_cmd_array[0]

            var adocpdf_cmd_args = adocpdf_cmd_array.slice(1)
            adocpdf_cmd_args.push.apply(adocpdf_cmd_args, ['-q', '-o-', '-',
                '-B', '"' + docPath.dir.replace('"', '\\"') + '"',
                '-o', '"' + pdfPath.replace('"', '\\"') + '"'
            ])

            var options = { shell: true, cwd: docPath.dir }

            var asciidoctorpdf = spawn(adocpdf_cmd, adocpdf_cmd_args, options)

            asciidoctorpdf.stderr.on('data', (data) => {
                let errorMessage = data.toString()
                errorMessage += "\n"
                errorMessage += "command: " + adocpdf_cmd + " " + adocpdf_cmd_args.join(" ")
                errorMessage += "\n"
                errorMessage += "If the asciidoctor-pdf binary is not in your PATH, you can set the full path."
                errorMessage += "Go to `File -> Preferences -> User settings` and adjust the asciidoc.asciidoctorpdf_command"
                console.error(errorMessage)
                vscode.window.showErrorMessage(errorMessage)
            })

            asciidoctorpdf.on('close', (code) => {
                offer_open(pdfPath)
            })

            asciidoctorpdf.stdin.write(text)
            asciidoctorpdf.stdin.end()
        } else {
            let parser = new AsciidocParser(path.resolve(doc.fileName))
            //const body =  await parser.parseText()
            const body = await this.engine.render(doc.uri, true, text)
            const ext_path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;
            const html = body;
            const showtitlepage = parser.getAttribute("showtitlepage")
            const author = parser.getAttribute("author")
            const email = parser.getAttribute("email")
            const doctitle : string | undefined = parser.getAttribute("doctitle");
            const titlepagelogo : string | undefined = parser.getAttribute("titlepagelogo");
            const footer_center: string | undefined = parser.getAttribute("footer-center");
            const source_name = path.parse(path.resolve(doc.fileName))
            let cover: string | undefined = undefined;
            let img_html: string = '';
            if(!isNullOrUndefined(showtitlepage)) {
                if(!isNullOrUndefined(titlepagelogo)) {
                    const image_url = titlepagelogo.startsWith('http') ? titlepagelogo : path.join(source_name.dir, titlepagelogo)
                    img_html = isNullOrUndefined(titlepagelogo) ? "" : `<img src="${image_url}">`
                }
                var tmpobj = tmp.fileSync({postfix: '.html'});
                let html =  `\
                <!DOCTYPE html>
                <html>
                    <head>
                    <meta charset="UTF-8">
                    <link rel="stylesheet" type="text/css" href="${ext_path + "/media/all-centered.css"}">
                    </head>
                    <body>
                    <div class="outer">
                        <div class="middle">
                            <div class="inner">
                                ${img_html}
                                <h1>${doctitle}</h1>
                                <p>${author} &lt;${email}&gt;</p>
                            </div>
                        </div>
                    </div>
                    </body>
                </html>
                `;
                fs.writeFileSync(tmpobj.name, html, 'utf-8')
                cover = `cover ${tmpobj.name}`;
            }
            const platform = process.platform
            const ext = platform == "win32" ? '.exe': ''
            const arch = process.arch;
            var binary_path = path.resolve(path.join(__dirname, 'wkhtmltopdf-'+platform+'-'+arch+ext))
            const pdf_filename = vscode.Uri.file(path.join(source_name.root, source_name.dir, source_name.name+'.pdf'))
            if(!fs.existsSync(binary_path) ) {
                var label = await vscode.window.showInformationMessage("This feature requires wkhtmltopdf\ndo you want to download", "Download")
                if (label != "Download")
                    return
                var error_msg = null

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Window,
                    title: "Downloading wkhtmltopdf",
                    // cancellable: true
                }, async(progress) => {
                    progress.report({ message: 'Downloading wkhtmltopdf...'});
                    const download_url = `https://github.com/asciidoctor/asciidoctor-vscode/raw/master/wkhtmltopdf-bin/wkhtmltopdf-${platform}-${arch}${ext}.gz`
                    await download_file(download_url, binary_path+".gz", progress).then( () => {
                        progress.report({ message: 'Unzipping wkhtmltopdf...'})
                        const ungzip = zlib.createGunzip()
                        const inp = fs.createReadStream(binary_path+".gz")
                        const out = fs.createWriteStream(binary_path)
                        inp.pipe(ungzip).pipe(out)
                        fs.chmodSync(binary_path, 0x755)
                    }).catch( async(reason) => {
                        binary_path = null;
                        console.error("Error downloading", download_url, " ", reason)
                        await vscode.window.showErrorMessage("Error installing wkhtmltopdf, "+reason.toString())
                        return
                    })
                })
                if(isNullOrUndefined(binary_path))
                    return;
            }
            var save_filename = await vscode.window.showSaveDialog({ defaultUri: pdf_filename})
            if(!isNullOrUndefined(save_filename)) {
                html2pdf(html, binary_path, cover, footer_center, save_filename.fsPath)
                .then((result) => { offer_open(result) })
                .catch(reason => {
                    console.error("Got error", reason)
                    vscode.window.showErrorMessage("Error converting to PDF, "+reason.toString());
                })
            }
        }
    }
}

async function download_file(download_url: string, filename: string, progress) {

    return new Promise( (resolve, reject) => {
        var download_options = url.parse(download_url);
        var wstream = fs.createWriteStream(filename)
        var totalDownloaded = 0;
        var proxy = process.env.http_proxy || vscode.workspace.getConfiguration("http")["proxy"].trim();
        var proxyStrictSSL = vscode.workspace.getConfiguration("http")["proxyStrictSSL"];
        if( proxy != '') {
            var agent = new HttpsProxyAgent(proxy);
            download_options.agent = agent
            download_options.rejectUnauthorized = proxyStrictSSL
        }
        https.get(download_options, (resp) => {
            const contentSize = resp.headers['content-length'];
            if(resp.statusCode != 200)
            {
                wstream.end()
                fs.unlinkSync(filename)
                return reject("http error"+resp.statusCode)
            }

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                totalDownloaded += chunk.length
                progress.report( { message: "Downloading wkhtmltopdf ... "+ ((totalDownloaded/contentSize)*100.).toFixed(0)+"%"})
                wstream.write(chunk)
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                wstream.end()
                resolve()
            });

            }).on("error", (err) => {
                console.error("Error: " + err.message);
                reject(err.message)
            });
        })
}

function offer_open(destination){

    // Saving the JSON that represents the document to a temporary JSON-file.
    vscode.window.showInformationMessage(("Successfully converted to "+path.basename(destination)), "Open File").then((label: string) => {
        if (label == "Open File") {
            switch (process.platform)
            {
                // Use backticks for unix systems to run the open command directly
                // This avoids having to wrap the command AND path in quotes which
                // breaks if there is a single quote (') in the path
                case 'win32':
                    exec(`"${destination.replace('"', '\\"')}"`);
                    break;
                case 'darwin':
                    exec(`\`open "${destination.replace('"', '\\"')}" ; exit\``);
                    break;
                case 'linux':
                    exec(`\`xdg-open "${destination.replace('"', '\\"')}" ; exit\``);
                    break;
                default:
                    vscode. window.showWarningMessage("Output type is not supported");
                    break;
            }
        }
    })
}

export async function html2pdf(html: string, binary_path: string, cover: string, footer_center: string, filename: string) {
    let documentPath = path.dirname(filename);

    return new Promise((resolve, reject) => {
        var options = { cwdir: documentPath, stdio: ['pipe', 'ignore', "pipe"] }
        let cmd_arguments =  [ '--encoding', ' utf-8', '--javascript-delay', '1000'];
        if(!isNullOrUndefined(footer_center)) {
            cmd_arguments = cmd_arguments.concat(['--footer-center', footer_center])
        }
        if(!isNullOrUndefined(cover)) {
            cmd_arguments = cmd_arguments.concat(cover.split(" "))
        }
        cmd_arguments = cmd_arguments.concat(['-', filename]);
        var command = spawn(binary_path, cmd_arguments, options)
        var error_data = '';
        command.stdin.write(html);
        command.stdin.end();
        command.stderr.on('data', (data) => {
            error_data += data;
        })
        command.on('close', (code) => {
            if(code == 0)
                resolve(filename)
            else
                reject(error_data)
        })
    });
}
