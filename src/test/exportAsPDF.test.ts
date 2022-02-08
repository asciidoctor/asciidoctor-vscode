import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { _generateCoverHtmlContent } from '../commands/exportAsPDF'

const asciidoctor = require('@asciidoctor/core')
const processor = asciidoctor()

suite('asciidoc.exportAsPDF', async () => {
  test('Should create an HTML cover page without title page logo', async () => {
    const document = processor.load(`= The Intrepid Chronicles
Kismet R. Lee <kismet@asciidoctor.org>`)
    const coverHtmlContent = _generateCoverHtmlContent(undefined, __dirname, document, vscode.Uri.parse(''))
    assert.strictEqual(coverHtmlContent, `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="file:///media/all-centered.css">
  </head>
  <body>
  <div class="outer">
    <div class="middle">
      <div class="inner">

        <h1>The Intrepid Chronicles</h1>
        p>Kismet R. Lee &lt;kismet@asciidoctor.org&gt;</p>
      </div>
    </div>
  </div>
  </body>
  </html>`)
  })
})
