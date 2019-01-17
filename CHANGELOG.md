# Changes

## 2.3.2
* Highlight fenced source blocks (Markdown-like syntax) in the editor

## 2.3.1
* Add snippets for general attribute and tagged block
* Temporary fix for transparent side toc (`:toc: left`, `:toc: right`)

## 2.3.0
* Add option to use asciidoctor-pdf instead of wkhtmltopdf
* Fix pdf paths with single quotes not opening from the notification after exportAsPDF

## 2.2.0
* Fix documents with apostrophe in path not rendering with manual command
* Add option to use editor or default style in preview
* Snippets

## 2.1.1

* Use theme background on preview (thanks to matteo.campinoti94@gmail.com)
* Broken links on diagrams in preview (asciidoc.use_asciidoctor_js: false), closes #142

## 2.1.0

* YAML syntax file, improved inline syntax detection, automated building (thanks to matteo.campinoti94@gmail.com)
* fixes typos in Description for AsciiDoc.forceUnixStyleSeparator (thanks to ccb012100)
* diagram (specifically plantUML) support in asciidoctor.js (closes #105)
