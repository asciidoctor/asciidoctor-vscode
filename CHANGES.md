# Changes

## 0.4.3
* Allways rebuild preview when preview uri changes, closes #43

## 0.4.2
* Use `convertFile()` instead off `Convert()`, closes #50

## 0.4.1
* Fixed the "how to install" instructions

# 0.4.0
* Use Asciidoctor.js by default (setting AsciiDoc.use_asciidoctor_js = true), closes #29

# 0.3.8
* Added symbol view, closes #3
* Keyboard binding changed to `ctrl+shift+r` (Mac: `cmd+shift+r`)
* Add auto closing brackets
* Fix syntax highlighter breaking
* Added buffer size parameter for larger Asciidoc rendering capability
* Support # symbol as section header

# 0.3.5 - 0.3.7

# 0.3.3

* Do not prefix links for local #sections

# 0.3.2
* Apply fixLinks to local links, closes #12

# 0.3.1
* Removed broken fixLinks transformation (this closes #6, closes #10)

# 0.3.0

* Use time based preview refresh instead of on document change, this closes #9
* Major code reorgnization and documentation

# 0.2.1
* Quote filename when invoking asciidoctor, this closes #4

# 0.2.0
* Added full error message display when asciidoctor execution fails
* Improved samples with CSS and icons
* Added animated showcase on the README.md
