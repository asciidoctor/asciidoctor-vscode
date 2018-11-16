# Changes

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
