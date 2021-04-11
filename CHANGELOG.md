# CHANGELOG

## 2.8.9

- Fix links in preview (closes #397)

## 2.8.8

- updated asciidoc-kroki to 0.12.0
- allow use of ${workspaceFolder} in attributes
- provide import completion for include and images

## 2.8.7

- update asciidoc-kroki to v0.11.0

## 2.8.4

- Fix "TypeError: range must be set" when previewing (closes #364)
- Bump lodash from 4.17.15 to 4.17.19 closes (#354)

## 2.8.3

* Fix unexpected splitting multibyte chars while chunking (closes #350)
* Fixed default export PDF filename when using asciidoctorpdf (closes #349)

## 2.8.2

* Remove depdendency on "copy-paste" which is never used

## 2.8.1

* No changes, release/publish using GitHub Actions

## 2.8.0

* Provide a safer default and configurable refresh interval (closes #334)

## 2.7.20

* Replace all references from joaompinto.asciidoctor-vscode to asciidoctor.asciidoctor-vscode

## 2.7.19

* Updated the extension path retrieval to use the new asciidoctor publisher
* Updated the demo gif

## 2.7.18

* Add "vsce" as a development dependency
* Fix problem creating .pdf with v2.7.16 (closes #332)
* Move wkhtmltopdf binaries to their own repository


## 2.7.17

* Add "vsce" as a development dependency
* Fix problem creating .pdf with v2.7.16 (closes #331)
* Provide diagnostics information for asciidoctor errors (PR #329)


## 2.7.16

* Update asciidoctor-kroki to 0.9.1
* Remove asciidoctor-plantuml «out of maintenance» (closes #308)
* Add CI to provide linting
* Update webpack configuration and restructure preview and app folders (closes #276)
* Added the ability to use the workspace path as the base_dir (closes #326)
* Added eslint validation (closes #290)

## 2.7.15

* Align the "Export to PDF" to the "Save as HTML" (closes #298)
* Support URI encoded characters in anchors links (closes #281)
* Add env-vscode attribute to detect vs code environment (closes #280)

## 2.7.14

* Add support for saving to Docbook (closes #102)

## 2.7.13

* Fix Save HTML file path on Windows (closes #269)
* Remove viz.js, let kroki handle graphviz (closes #267)

## 2.7.12

* Add support for saving html output

## 2.7.11

* Add Ctrl+Alt+V/Cmd+Alt+V (Mac) as shortcut key for image paste

## 2.7.10

* Change language definition to be the same as that of the Atom extension [atom-language-asciidoc](https://github.com/asciidoctor/atom-language-asciidoc/)
* Support the source block (closes #212)
* Support image pasting on Linux/Mac (closes #255)
* Add Ctrl+Alt+V/Cmd+Alt+V (Mac) as shortcut key for image paste
* Add `.png` extension automatically for image pasting

## 2.7.9

* Prevent table of contents overlapping document for `:toc: left` and `:toc: right` (closes #141)
* Provide Intellisense autocomplete for attributes
* Provide basic support for setext two-line titles (closes #248)
* Update to Asciidoctor 2.0.10 and Asciidoctor.js 2.1.0
* Update dependencies to latest versions
* Update TextMate language generation to use safe_load in Python script
* Revise asciidoctor-pdf command to prepare for use of asciidoctor-pdf.js
* Tidy up licensing and copyright notices in files

## 2.7.8

* Disable foldingProvider and add throttling to SymbolProvider
* Add asciidoctor-kroki support

## 2.7.7

* Add basic symbol provider (closes #234)
* Clean use of '-o' option for compatibility with asciidoctorj (closes #232)

## 2.7.6

* Add config option to set the wkhtmltopdf binary path (closes #202)

## 2.7.5

* Update Asciidoctor(.JS) requirement to 2.0.3 (fixes #203, thanks to @jvalkeal)

## 2.7.4

* Fixes: No autoscroll in VSCode > 1.28 #182

## 2.7.3

* Fixes to README (thanks to @jstafman <jstafman@protonmail.com>)
* Changed the order of configuration settings
* Display an error notification when asciidoctor.js fails

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

## 1.0.99

* Rebuilt using vscode-1.28.2/extensions/markdown* from Microsoft

## 1.0.x

* Test release

## 0.15.1

* asciidoctor_command can have arguments (closes #103)
* updated fs-extra requirements (closes #88)

## 0.15.0

* Support for copy/paste images

## 0.14.0

* Style/Disable Preview Highlighting (closes #85)

## 0.13.0

* Add support for Mermaid Diagrams (unprintable)

## 0.12.0

* Add graphviz support using Viz.js (closes #78)

## 0.11.2

* Support :footer-center: to place a footer center on exported PDF (closes #77)

## 0.11.1

* Removed unnecessary binary files from the extension package

## 0.11.0

* Improve the default CSS (closes #76)
* Add page break support for PDF export  (closes #75)

## 0.10.0

* Support logo on title page (closes #74)

## 0.9.1

* Rename CHANGES.md CHANGELOG.md to have it shown in the extension info

## 0.9.0

* Quote filename on asciidoctor call (closes #73)
* Added title page with author info (closes #71)
* Added Technical Document snippet, based on <http://web.mit.edu/course/21/21.guide/elemtech.htm>

## 0.8.0

* wordwrap if the file type is .adoc (closes #65)
* activate on "asciidoc" related commands (closes #64)

## 0.7.2

* runInterval is now respected during document changes (closes #68)

## 0.7.1

* Fix links when using external asciidoctor (closes #67)

## 0.7.0

* Added Export to PDF command (using wkhtmltopdf)

## 0.6.0

* Synchronize preview with the selected/edited source line
* The preview window is now shared accross documents

## 0.5.0

* Use asciidoctor with -q since we now rely on stderr for error detection
* On settings replaced html_generator with asciidoctor_command
* Add data-line-(source-nr) for preview synchronization
* Do not use temporary files for adoc generation, closes #54
* Use the same keybindins as the markdown extension. closes #55
* Merge pull request #53 from malvim/formatting-surround
* Enable auto surrounding for formatting symbols

## 0.4.3

* Always rebuild preview when preview uri changes, closes #43

## 0.4.2

* Use `convertFile()` instead off `Convert()`, closes #50

## 0.4.1

* Fixed the "how to install" instructions

## 0.4.0

* Use Asciidoctor.js by default (setting AsciiDoc.use_asciidoctor_js = true), closes #29

## 0.3.8

* Added symbol view, closes #3
* Keyboard binding changed to `ctrl+shift+r` (Mac: `cmd+shift+r`)
* Add auto closing brackets
* Fix syntax highlighter breaking
* Added buffer size parameter for larger Asciidoc rendering capability
* Support # symbol as section header

## 0.3.5 - 0.3.7

## 0.3.3

* Do not prefix links for local #sections

## 0.3.2

* Apply fixLinks to local links, closes #12

## 0.3.1

* Removed broken fixLinks transformation (this closes #6, closes #10)

## 0.3.0

* Use time based preview refresh instead of on document change, this closes #9
* Major code reorganization and documentation

## 0.2.1

* Quote filename when invoking asciidoctor, this closes #4

## 0.2.0

* Added full error message display when asciidoctor execution fails
* Improved samples with CSS and icons
* Added animated showcase on the README.md
