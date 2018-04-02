import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawnSync } from "child_process";
import * as request from 'request';
import * as zlib from 'zlib';
import { parseText } from './text-parser';
import { isNullOrUndefined } from 'util';


export default async function ExportAsPDF(provider) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const text = doc.getText();
    //RebuildPhantomJS(); // Rebuild Phantom JS if required
    var options = { format: 'Letter' };
    var destination;
    if (!doc.isUntitled)
        destination = doc.fileName+".pdf"
    else
        destination = 'temp.pdf'
    var html = await parseText('', text)
    var binary_path = path.resolve(path.join(__dirname, 'wkhtmltopdf-'+process.platform+'-'+process.arch))
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
                const platform = process.platform;
                const arch = process.arch;
                const download_url = `https://github.com/joaompinto/asciidoctor-vscode/raw/master/wkhtmltopdf-bin/wkhtmltopdf-${platform}-${arch}.gz`
                await download_file(download_url, binary_path+".gz")
                progress.report({ message: 'Unzipping wkhtmltopdf...'});
                const ungzip = zlib.createGunzip();
                const inp = fs.createReadStream(binary_path+".gz");
                const out = fs.createWriteStream(binary_path);
                inp.pipe(ungzip).pipe(out);
                progress.report({ message: 'Downloading wkhtmltopdf...'});
                //resolve()
        }).then( () => {console.log("done")} , reason => {vscode.window.showErrorMessage("Error installing wkhtmltopdf, "+reason.toString()); return})
    }
    const source_name = path.parse(path.resolve(doc.fileName))
    const pdf_filename = vscode.Uri.file(path.join(source_name.root, source_name.dir, source_name.name+'.pdf'))
    var save_filename = await vscode.window.showSaveDialog({ defaultUri: pdf_filename})
    if(! isNullOrUndefined(save_filename))
        convert(path.resolve(doc.fileName), save_filename.path)
            .then(offer_open),
            reason => {vscode.window.showErrorMessage("Error converting file, "+reason.toString()); return}
}

async function convert(source_filename, destination_filename) {
    return new Promise( (resolve, reject) => {
        resolve(path.resolve(destination_filename))
    })
}

async function download_file(url: string, filename: string) {

    // axios image download with response type "stream"
    return new Promise( (resolve, reject) => {
        request
            .get(url)
            .on('response', function(response) {
                console.log(response.statusCode) // 200
                if(response.statusCode != 200)
                    reject("http error "+ response.statusCode)
                else {
                    resolve()
                }
            })
            .on('error', function(err) {
                throw(err)
            })
            .pipe(fs.createWriteStream(filename));
    })
}

function offer_open(destination){

    // Saving the JSON that represents the document to a temporary JSON-file.
    vscode.window.showInformationMessage(("Successfully converted to "+destination), "Open File").then((label: string) => {
        if (label == "Open File") {
            switch (process.platform)
            {
                case 'win32':
                    exec(`"${destination}"`);
                    break;
                case 'darwin':
                    exec(`"bash -c 'open "${destination}"'`);
                    break;
                case 'linux':
                    exec(`"bash -c 'xdg-oopen "${destination}"'`);
                    break;
                default:
                    vscode. window.showWarningMessage("Output type is not supported");
                    break;
            }
        }
    })
}