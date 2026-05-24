import assert from 'node:assert/strict'
import * as path from 'node:path'
import { describe, test } from 'node:test'
import { load } from '@asciidoctor/core'
import { fileURLToPath } from 'url'
import * as vscode from 'vscode'
import { _generateCoverHtmlContent } from '../commands/exportAsPDF.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('asciidoc.exportAsPDF', () => {
  test('Should create an HTML cover page without title page logo', async () => {
    const document = await load(`= The Intrepid Chronicles
Kismet R. Lee <kismet@asciidoctor.org>`)
    const coverHtmlContent = _generateCoverHtmlContent(
      undefined,
      __dirname,
      document,
      vscode.Uri.parse(''),
    )
    assert.strictEqual(
      coverHtmlContent,
      `<!DOCTYPE html>
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
  </html>`,
    )
  })
})
