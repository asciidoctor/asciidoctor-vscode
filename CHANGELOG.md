# Changes

## 2.7.2

* Fix an error caused by incorrectly accessing the workspace folder (issue #191)

## 2.7.1

* Fix `preview.attributes` description.

## 2.7.0

* Add `preview.style` option to set preview stylesheet in settings

## 2.6.0

* Add `preview.attributes` option to set preview attributes in the user/workspace settings
* Overhaul README

## 2.5.2

* Fix an error from [2.5.1](#2.5.1) that caused all syntax highlighting to fail

## 2.5.1

* Change remaining Markdown-named variables/modules to AsciiDoc
* Improve automated building/packaging script
* Fix contrained literal (\`) or closing single typographic quote (\`') bug when used inside typographic quotes (e.g. "\`busy \`'till tomorrow\`" would create a recursive match)
* Add syntax highlight for closing single typographic quote (\`')

## 2.5.0

* Repaired preview.useEditorStyle option
* Improved the editor-style css to match the default one used by asciidoctor

## 2.4.1

* Fix missing highlight for single character constrained inlines (e.g. \*a\*)

## 2.4.0

* Fix errors with the preview security setting
* Fix an error with jsonValidation (thanks to @shaneknysh <shane.knysh@gmail.com>)
* Fix descriptions still using "Markdown" instead of "AsciiDoc" (thanks to @ygra <joey@muhkuhsaft.de>)
* Update preview to ascidoctor.js v1.5.9 (thanks to @Mogztter <ggrossetie@gmail.com>)
* Fix encoding errors (thanks to @mojavelinux <dan.j.allen@gmail.com>)

## 2.3.3

* Fix plantUML preview from multiple files and folders (thanks to @Dimeiza <dimeiza@hotmail.com>)

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
