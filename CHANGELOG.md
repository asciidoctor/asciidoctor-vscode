# CHANGELOG

## Unreleased

### Improvements

- support .asciidoctorconfig at root of the workspace by @apupier (#380)

### Bug fixes

- fix the logic that detects if `asciidoctor-pdf` and/or `bundler` are available in the `PATH`
- fix base directory when exporting to PDF on Windows (#593)
- fix localization generation by @YoshihideShirai (#594)
- fix Table Of Content sidebar color not aligned with the active theme by @apupier (#340)
- fix typo Recomendations -> Recommendations in snippets by @apupier

## 3.0.0 "pre-release" (2022-07-06) - @mogztter

### Improvements

- add Japanese localisation by @YoshihideShirai (#581)
- register Asciidoctor.js extensions by @YoshihideShirai (#569)
- create a complete HTML document using the WebView converter by @Mogztter (#547)
- add code folding based on sections by @marieflorescontact (#550)
- add code folding on conditionals by @marieflorescontact (#555)
- add code folding on open blocks by @marieflorescontact (#559)
- add code folding on comment blocks by @marieflorescontact (#561)
- add code folding on single line comment by @marieflorescontact (#565)
- update preview icons and use codicons by @Mogztter (#54)
- use load instead of convert for performance by @Mogztter (#542)
- normalize setting names and group settings by category by @Mogztter (#577)
- do not offer to download an outdated version of `wkhtmltopdf` by @Mogztter (#577)
- add a new setting to add command line arguments for `wkhtmltopdf` by @Mogztter (#577)
- offer to install locally the latest version of `asciidoctor-pdf` by @Mogztter (#577)

### Bug fixes

- set `basebackend` and `outfilesuffix` on the WebView converter otherwise Docinfo are not correctly included (#522)
- activate completion only when `:` is at the start of the line by @Mogztter (#529)
- correctly pass the `--footer-center` option to `wkthtmltopdf` by @gurbindersingh (#526)
- fix asciidoctor-pdf and wkhtmltopdf user settings by @meznom (#533)
- set CSS variables for font size, font family and line height by @Mogztter (#530)
- fix format of paste image default filename by @Zhou-Yicheng (#558)
- show source action does not open a new pane (if the source is already opened) by @marieflorescontact (#562)
- fix for opening links to local files in preview window by @tombolano & @marieflorescontact (#572 #573)

### Infrastructure

- upgrade dependencies (#515)
- extract the report errors logic into a dedicated function by @Mogztter (#534)
- extract get baseDir logic by @Mogztter (#535)
- remove superfluous `copycss` by @Mogztter (#538)
- unwrap convertUsingJavascript function by @Mogztter (#537)
- introduce a load function by @Mogztter (#541)
- remove slugifier (unused) from AsciidocEngine by @Mogztter (#545)
- introduce an export function by @Mogztter (#546)

### Documentation

- add basic instructions on how to develop/test the extension by @danyill (#540)
- fix manual install command in README by @marieflorescontact (#544)
- update contributing guide by @Mogztter (#554)

## 2.9.8

- Fix regression about Docinfo files by setting `basebackend` and `outfilesuffix` (#524)
- Upgrade dependencies (#515)
- Fix regression about footer in the PDF export (#528)
- Only activate completion when `:` is at the start of the line (#529)
- Fix regression about reading `asciidoctorpdf_command` configuration (#533)
- Fix regression about reading `wkhtmltopdf_path` configuration (#533)

## 2.9.5

- Fix regression in the PDF export (#512)
- Restructure the PDF export logic for testing (#512)
- Reduce bundle size (#517)
- Register the custom converter as `webview-html5` instead of replacing the built-in one `html5` (#513)

## 2.9.4

- Fix regression in default preview styling (#501)
- Upgrade Asciidoctor.js to 2.2.6 (#514)

## 2.9.3

- Build the web extension when packaging (#500)

## 2.9.2

- Initial work to make the extension available as a Web Extension (#473)
- Scroll to the first line when the preview hits top (closes #348)
- Removed a double word, add some colons for clarity, and puctuation in README.md (#483)
- Support hyperlinks in source pane for include directive (#498)

## 2.8.10

- Ensure Asciidoctor.js error reporting is displayed on Windows (closes #466)
- Provide offline and integrated code syntax highlighting with highlight.js (closes #459)
- Update preview on preferences change (closes #447)
- Enforce code style (closes #446)
- Make `use_kroki` setting change effective without VS code restart (closes #444)
- Allow links to work in the preview pane (closes #435)
- Update Asciidoctor.js to 2.2.5 (closes #431)
- Upgrade asciidoctor-kroki to allow use of pikchr diagrams (closes #419)
- Allow chapter to start from zero (closes #415)
- Fix options link in README.md (closes #405)

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
