# CHANGELOG

## Unreleased

### Features

* Resolve VS Code path variables consistently across the extension's settings (#1154). The `${...}` placeholders VS Code substitutes in `settings.json` are not exposed to extensions, so each setting reimplemented its own expansion — and only the bare `${workspaceFolder}` was handled, resolved differently depending on the context (the preview's `asciidoctorAttributes` used the *first* workspace folder while the PDF export used the document's own folder, which drift apart in a multi-root workspace). Expansion is now centralised in a single helper used by both the preview attributes and the PDF export (output directory and the `asciidoctor-pdf`/`wkhtmltopdf` command paths). It resolves the named `${workspaceFolder:Name}` form, the deprecated `${workspaceRoot}` alias, `${workspaceFolderBasename}`, `${userHome}`, `${pathSeparator}` (and its `${/}` shorthand) and `${env:NAME}` in addition to the bare `${workspaceFolder}` — which now consistently resolves against the *document's own* workspace folder, so multi-root workspaces behave predictably. An unresolvable placeholder is left untouched rather than collapsing to an empty string. `${userHome}` is only available on the desktop host (there is no home directory on the web extension host)

### Bug fixes

* Make the `asciidoc.antora.showEnableAntoraPrompt` setting effective, and stop missing the "enable Antora support?" prompt for the document that activated the extension. The setting was declared (default `false`) and documented but never read, so the prompt always showed as long as no decision had been recorded for the workspace. It is now honoured: the prompt is opt-in — the check runs before anything else, so with the prompt disabled (the default) opening documents no longer triggers the `antora.yml` file system lookup at all — and the setting can be flipped mid-session without reloading the window. Additionally, the prompt only listened to document-open events registered *during* activation, while the very document whose opening activates the extension fires that event *before* the listener exists — so a session where a single Antora page was opened never showed the prompt (when enabled); the already-open documents are now scanned at activation. Finally, the "Enable Antora support in this workspace" command now registers the Antora-gated features (the `{` attributes completion) immediately — previously they only appeared after the window was reloaded — registration is idempotent so enabling twice (prompt then command) does not stack duplicate providers, and "Disable Antora support in this workspace" now tears them down symmetrically
* Keep the Antora content catalog alive when the workspace aggregates the same component version twice or declares a non-string version. Two `antora.yml` files with the same `name` and `version` — e.g. a clone and a copy of the same component, or overlapping folders in a multi-root workspace — made the content classifier throw `Duplicate version detected`, and an unquoted `version: 2.0` (parsed by YAML as a number) made it throw as well; either failure took the *whole* catalog down, so every Antora feature (resource id completion, go to definition, preview resolution) silently stopped working for *all* components, with only an "Unable to get Antora context" entry in the Asciidoctor output channel as a clue. The same `antora.yml` surfaced several times by overlapping workspace folders is now deduplicated, entries sharing a component name and version are merged before classification (first descriptor wins, files concatenated and deduplicated by their path within the component, so two copies of the same tree collapse to the first — mirroring Antora's own aggregator, which legitimately assembles one component version from several content sources), and a non-string `version` is coerced to a string instead of crashing the classifier
* Fully reload the preview when a document edit changes the webview "shell" — most visibly toggling `:stem:` or `:source-highlighter:` — instead of leaving the incremental update in an inconsistent state. The incremental preview update morphs only the rendered content (`#preview-root`) and leaves the `<head>` untouched, so it can neither load nor unload the MathJax and highlight.js scripts; toggling `:stem:` left every equation as raw text (or, when removing it, kept stale rendered math), and toggling `:source-highlighter:` produced a mix of highlighted and unhighlighted code blocks. The converter now stamps the document-driven shell parts (MathJax configuration, syntax highlighter head/footer markup — including the per-language highlight.js scripts, so a listing in a newly used language loads its grammar too — docinfo, body classes such as the TOC position, `stylesheet`/`icons` attributes) with a `data-shell` fingerprint, and the preview falls back to a full webview reload whenever it changes between renders, re-rendering every block consistently. Regular edits keep the scroll-preserving incremental path: the fingerprint strips the per-render CSP nonce, so it is stable across renders of an identical document
* Fix STEM rendering in the preview on a machine without internet access (#1160). The preview bundles the whole MathJax 4 runtime in the extension, but one file slipped through: when the mhchem TeX extension (`\ce`/`\pu`) initialises, it loads its font-specific component from MathJax's `[fonts]` loader path, which defaults to `https://cdn.jsdelivr.net` — so every preview quietly fetched `mathjax-mhchem-font-extension/chtml.js` from the CDN (unpinned, so it could even serve a MathJax version newer than the bundled one). When that request failed — no network and the file not yet in the WebView's HTTP disk cache — MathJax's startup promise never settled and *nothing* was typeset, leaving every `latexmath`/`asciimath` block as raw source; one connected launch "fixed" it because the CDN response landed in the disk cache. The extension now ships the mhchem font extension (component and its woff2 fonts) inside the VSIX and points the `[fonts]` loader path at the bundled fonts directory, so the preview performs no network request at all and STEM renders offline from the first launch

### Deprecations

* Deprecate the `asciidoc.useWorkspaceRootAsBaseDirectory` setting; it will be removed in a future release (#1155). Overriding Asciidoctor's base directory is a known footgun — it detaches `{docdir}` from the current file and forces every relative `include::`/`image::` path to be written relative to the workspace root — and its shared-folder use case is better served by an `.asciidoctorconfig` file anchored on `{asciidoctorconfigdir}`, which also stays portable to the Asciidoctor CLI and other editors. The setting is marked deprecated in the VS Code settings UI (`markdownDeprecationMessage`, all locales) with a link to a new migration guide, and a "Migrate from useWorkspaceRootAsBaseDirectory" section was added to the ".asciidoctorconfig" documentation page covering both the single-folder and multi-root workspace layouts

### Documentation

* Clarify the "remote content sources" limitation on the Antora page: it refers to content sources an Antora *playbook* would fetch from remote git repositories (the playbook is not processed; only files present in the workspace folders are aggregated) and is unrelated to remote development setups such as VS Code Remote - SSH, where the extension runs on the remote host and the workspace files count as local content. Also document that the "enable Antora support?" prompt is opt-in through `asciidoc.antora.showEnableAntoraPrompt` (disabled by default, because detecting `antora.yml` requires a file system lookup every time a document opens), the Command Palette commands remaining the primary way to toggle support
* Clarify the `asciidoc.useWorkspaceRootAsBaseDirectory` setting description regarding how relative paths resolve when it is enabled (#700). Because Asciidoctor ties `docdir` to the base directory, setting the base directory to the workspace root makes `{docdir}` resolve to the workspace root as well — so it cannot be used to reach a file sitting next to the current document, and *every* include/image path in the top-level document (even a same-folder one) must be written relative to the workspace root. Includes inside an already-included file keep resolving relative to that file. This behaviour is identical in the preview and in the PDF export; the wording previously left it ambiguous. Clarified in the setting description (all locales) and in a dedicated "Base directory resolution" section on the "Settings" documentation page

### Infrastructure

* Enable the `noImplicitAny` TypeScript compiler flag (step 2 of the progressive migration to `"strict": true`). Every implicitly-`any` parameter, variable and member across `src/` and the test suite is now explicitly typed; untyped dependencies gained hand-written declarations (`@antora/content-classifier`, `@orcid/bibtex-parse-js`) or their DefinitelyTyped packages (`@types/js-yaml`, `@types/sinon`). The code was also adapted to the extension typings shipped with `@asciidoctor/core` 4.0.4 (updated along with `asciidoctor-kroki` 1.0.1, which now ships its own types): the `[mermaid]` block processor now relies on the typed block DSL (`createBlock` and contextual `process` parameters), and the preprocessor/include-processor callbacks type their reader as `PreprocessorReader` (`getIncludeDepth`, `pushInclude`). Remaining before `"strict": true`: `strictNullChecks`, then `strictPropertyInitialization`
* Fix a latent web-extension bug found by the stricter type checking: `antora.yml` files were parsed by passing the raw `Uint8Array` returned by `vscode.workspace.fs.readFile` straight to `yaml.load`, which only worked on the desktop because Node's `Buffer` stringifies to UTF-8 — in the browser extension host a plain `Uint8Array` stringifies to a comma-separated byte list. The bytes are now decoded with `TextDecoder` before parsing

* Shrink the packaged VSIX from ~29 MB / 3825 files to ~14 MB / 2503 files by excluding artifacts that are never loaded at runtime. Two changes: (1) `.vscodeignore` was reworked around how `vsce` actually collects files — it already ships only production dependencies, and it splits ignore/negate patterns into two lists where a `!` negate always wins regardless of order, so a broad `!node_modules/`/`!syntaxes/` re-included the whole subtree and later ignores had no effect. The re-includes are now narrow: `syntaxes/` ships only the registered `asciidoc.tmLanguage.json` (dropping the base/source grammars, the generator and the `syntaxes/tests` snapshot fixtures), and `node_modules/` re-includes only the file types needed at runtime (dropping the bundled TypeScript sources, source maps, docs and linter/test config). (2) `tasks/copy-mermaid.mjs` now filters the Mermaid bundle it copies into `media/`, keeping the ESM entry (`mermaid.esm.min.mjs`) and its lazily loaded `.mjs` chunks but dropping the TypeScript declarations, source maps (~51 MB alone) and the unused UMD builds (`mermaid.js`, `mermaid.min.js`) — taking `media/mermaid` from ~76 MB to ~15 MB

## 4.0.0 (pre-release) (2026-07-07) - @ggrossetie

### Features

* Add an "AsciiDoc: Open AsciiDoc Cheat Sheet" command that opens a concise, always-available syntax reference right inside the editor, so beginners no longer have to leave VS Code to look up the syntax (#297). The cheat sheet is authored in AsciiDoc and bundled with the extension (`media/cheatsheet.adoc`), then rendered through the regular preview pipeline — so it stays in sync with what the extension can actually render (dogfooding) and needs no bespoke viewer. It opens as a locked preview to the side, which keeps it pinned in place instead of being hijacked by whichever document is edited next. The command is available from the command palette even when no AsciiDoc file is open, so it works as a discoverable entry point to the syntax. Because the source is plain AsciiDoc, contributing to the reference is as simple as editing that file
* Surface a one-time notification when a previewed document contains a diagram that Kroki could render while the Kroki extension is disabled (#480). Kroki rendering is off by default — it sends the diagram source to a server — so diagrams stay unrendered until it is explicitly enabled, and users had no way to discover that the extension can render them at all. The preview now detects a Kroki-renderable diagram block (any of the asciidoctor-kroki block styles or block macros — `[plantuml]`, `plantuml::…[]`, `[graphviz]`, `[d2]`, … — Mermaid excluded, as it is always rendered) through a cheap textual scan and shows a single, non-recurring notification offering to "Enable Kroki" or to open the documentation. Enabling remains an explicit opt-in (nothing is sent anywhere on its own): choosing "Enable Kroki" flips `asciidoc.extensions.enableKroki` on and refreshes the preview so the diagrams render immediately. The hint is shown at most once ever (tracked in the extension's global state) and never while Kroki is already enabled
* Add an `asciidoc.extensions.kroki.serverUrl` setting to point the Kroki diagram extension at a specific server — typically a self-hosted instance such as `http://localhost:8000` — without editing every document (#480). Previously the server could only be chosen through the `kroki-server-url` attribute (in the document header or an `.asciidoctorconfig` file); many users need a private Kroki server for confidentiality reasons and asked for a discoverable, workspace-wide setting like the IntelliJ AsciiDoc plugin offers. The setting is applied as a soft default, so it sits at the bottom of the usual "closer to the document wins" precedence chain: a `kroki-server-url` set in the document header takes precedence over one in the nearest `.asciidoctorconfig`, which takes precedence over the setting, which itself falls back to the public `https://kroki.io` server when left empty. The resolved URL is also added to the preview's Content Security Policy allow-list (from a header parse that now applies `.asciidoctorconfig` too), so diagrams served from a non-`https:` server such as `http://localhost:8000` — which the CSP's blanket `https:` rule does not cover — are no longer blocked. The setting is `resource`-scoped, so it can be overridden per workspace folder, and it applies to the preview as well as the HTML/PDF/DocBook exports. Documented on the "Diagram integration" and "Settings" pages
* Pick up an `.asciidoctorconfig` (or `.asciidoctorconfig.adoc`) sitting at the root of the *other* workspace folders in a multi-root workspace (#766). Previously the configuration lookup only walked from the document up to the root of the workspace folder containing it, so a configuration file kept in a separate workspace folder (e.g. a folder dedicated to shared `.asciidoctorconfig` and `docinfo` assets) was never found. The roots of the other workspace folders are now scanned as the most general configuration — applied before the document's own folder chain, so anything defined closer to the document still takes precedence — restoring the pre-2.9 ability to share one configuration across several roots. Single-folder workspaces and loose files are unaffected. The recommended, portable way to reference assets from a configuration file remains the built-in `{asciidoctorconfigdir}` attribute (it resolves to the directory of the config file and keeps working across editors and the Asciidoctor CLI), rather than an editor-specific `${workspaceFolder}` variable. The `.asciidoctorconfig` feature is now fully documented (discovery order and precedence, multi-root behaviour, `{asciidoctorconfigdir}`, and per-profile switching with `ifdef`/`ifndef` in a `.asciidoctorconfig.adoc`)
* Add a right-click context menu in the preview exposing the document export commands — "Save HTML", "Export Document as PDF" and "Save to DocBook" (#832). The menu is contributed through VS Code's `webview/context` extension point, gated on the preview's view type; the previewed `<body>` carries a `data-vscode-context` marker so the export commands target the document backing the focused preview rather than the (possibly unrelated) active text editor. Document resolution falls back to the active editor when a command is run from the editor title, the editor or the command palette, preserving the previous behaviour. The menu entries are hidden in the web extension, where the export commands rely on the local filesystem. VS Code's native Cut/Copy/Paste entries are suppressed (`preventDefaultContextMenuItems`): Cut and Paste are meaningless in a read-only preview, and copying remains available through <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>C</kbd> — VS Code offers no way to keep only Copy (microsoft/vscode#165679)
* Add keyboard shortcuts to toggle inline formatting in the editor (#975): <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>B</kbd> for bold (`*…*`), <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>I</kbd> for italic (`_…_`) and <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>M</kbd> for monospace (`` `…` ``), plus the matching "AsciiDoc: Toggle Bold/Italic/Monospace" commands. Each shortcut wraps the selection, unwraps it again when it is already wrapped (toggle off), wraps the word under the cursor when nothing is selected, or inserts an empty marker pair with the cursor between the markers. AsciiDoc's two formatting forms are honoured: the constrained single marker (`*bold*`) is used at word boundaries and the unconstrained doubled marker (`**bold**`) when the selection is glued to a word (e.g. mid-word `fo**ob**ar`); toggling off recognises either form, whether the marks are inside the selection or immediately around it, and leading/trailing whitespace is kept outside the marks. The bindings only apply while editing an AsciiDoc document
* Make custom converter templates work in the preview, resolve relative `asciidoc.preview.templates` paths, and auto-discover a `.asciidoctor/templates` directory (#777, #843). Three things were broken. (1) Templates were never applied to the preview at all: the preview's custom `webview-html5` converter advertised template support through the legacy `supports_templates` property, but Asciidoctor.js 4.0 only builds the composite (template + backend) converter when the backend converter answers a `hasSupportsTemplates()` method — so `template_dirs` was silently ignored and every node kept its default rendering. The converter now implements the 4.0 template-composition API (`hasSupportsTemplates()`, `handles()` and `backendInfo()`), letting user templates override individual node transforms in the preview (the export path already worked, as it uses the built-in HTML5 converter). (2) The setting has always documented that relative paths are interpreted relative to the folder open in the Explorer (or, failing that, the document's directory), but the configured values were passed to Asciidoctor verbatim — so a relative path such as `templates` was resolved against the process working directory and never found. Relative entries are now resolved against the document's workspace folder root (or the document's own directory when it does not belong to a workspace folder); absolute paths are still used as-is. (3) A `.asciidoctor/templates` directory sitting at the root of a workspace folder is now picked up automatically — no configuration required — mirroring the `.asciidoctor/lib` convention already used for workspace Asciidoctor.js extensions; a directory that is both configured and auto-discovered is only passed once. Because these templates are executable code shipped with the opened workspace, the auto-discovered directory is gated behind a trust prompt — exactly like `.asciidoctor/lib` extensions: the templates are only loaded once you have confirmed you trust the authors of the files, and the decision can be revisited through the new "Manage Asciidoctor Templates Trust Mode" command. Paths you list explicitly in `asciidoc.preview.templates` are a deliberate opt-in and are not gated. Templates written as plain JavaScript need no extra dependency (Asciidoctor requires the `.js`/`.cjs` file and calls its exported `render({ node })` function); Nunjucks, Handlebars, EJS and Pug templates additionally require their engine to be installed in the workspace. As before, custom templates rely on Node's file system and therefore only apply to the desktop preview and export, not the web extension
* Honor the standard `stylesheet` (and `stylesdir`) document attributes in the preview, so a document that sets `:stylesheet:` (inline or through an included attributes file) is previewed with that stylesheet instead of the default one — matching the generated HTML and restoring the pre-3.0 behaviour (#598, #322). The custom WebView converter builds the preview `<head>` itself and previously only consulted the `asciidoc.preview.style`/`asciidoc.preview.additionalStyles` settings, silently ignoring the document's own `stylesheet` attribute. Precedence and resolution mirror Asciidoctor: the `asciidoc.preview.style` setting still wins when set (the attributes are then ignored); a `stylesheet` attribute *replaces* the default stylesheet while `asciidoc.preview.additionalStyles` remain layered on top; an absolute path or a `http:`/`https:`/`file:` URL is used as-is (ignoring `stylesdir`); and a relative `stylesheet` is looked up under `stylesdir` relative to the document's base directory — the folder containing the AsciiDoc file by default, or the workspace root when `asciidoc.useWorkspaceRootAsBaseDirectory` is enabled — so it resolves the same way it does in the exported HTML. Documented on the "Preview" page
* Show the resolved value of an attribute reference on hover (#729): hovering over `{name}` displays the attribute's value (or indicates that it is not set, helping catch typos). The value is read from the parsed document via `getAttributes()`, so header attributes, `.asciidoctorconfig` attributes, `asciidoc.preview.asciidoctorAttributes` settings and intrinsic attributes (`{docname}`, `{docfile}`, …) are resolved. To avoid showing a misleading value, no hover is provided inside a verbatim block that does not run the `attributes` substitution (a `----` listing without `[subs=+attributes]`), matching the attribute-reference completion behaviour. Known limitation: the document is parsed but not converted, and attribute entries placed in the *body* (after the header) are only applied during conversion — so an attribute declared after the header, one coming from a body-level `include::`, or a redefinition is not resolved and shows as "not set". Handling those would require a positional scan of attribute entries in document order rather than reading `getAttributes()`. The hover, and in particular what it does and does not resolve (so an empty or "not set" hover is not mistaken for a bug), is documented on the "Edit AsciiDoc files" page
* Give index terms their own TextMate scopes so they can be colored — typically dimmed — in the editor (#379). All four forms are now recognized: the concealed forms `(((primary, secondary, tertiary)))` and `indexterm:[…]`, which produce no visible text and only feed the index, get `markup.other.indexterm.concealed.asciidoc`; the flow (visible) forms `((primary))` and `indexterm2:[…]`, whose term is rendered in the document, get `markup.other.indexterm.flow.asciidoc` on the term only, so it stays legible while the surrounding markers can be dimmed. In every form the `((`/`))` (and `[`/`]`) delimiters carry `punctuation.definition.indexterm.begin/end.asciidoc`, the macro name carries `entity.name.function.asciidoc`, and attribute references inside a term are still highlighted. The triple form is matched ahead of the double so `(((…)))` reads as concealed rather than a flow term wrapped in a paren, and a backslash-escaped term (`\(((…)))`, `\((…))`) is left as literal text. None of this changes the rendered output — index terms behave exactly as before — it only exposes scopes for `editor.tokenColorCustomizations`; nothing is hidden in the editor. Covered by grammar snapshot tests, and the "Edit AsciiDoc files" page now documents how to recolor (e.g. dim) a construct — inspecting its TextMate scope, opening the settings, and scoping the rule to a theme

### Bug fixes

* Stop VS Code's rainbow bracket-pair colorization from tinting the parentheses, brackets and angle brackets that pepper AsciiDoc prose — most visibly the `(((…)))`/`((…))` of an index term, whose delimiters lit up in bracket-pair colors that no token-color rule could override (they are painted as a separate decoration layer on top of the syntax tokens). The language configuration now sets `colorizedBracketPairs` to an empty list, disabling bracket-pair colorization for AsciiDoc — a prose-first language where these characters are ordinary text rather than nested code brackets. Bracket matching, navigation and auto-closing are unaffected (they come from the untouched `brackets` field), and anyone who prefers the colors back can re-enable them per-language with `"[asciidoc]": { "editor.bracketPairColorization.enabled": true }`
* Fix an uncaught `outfilesuffix.substring is not a function` error thrown while rendering the preview (visible in the VS Code for the Web developer console). The preview derived the intrinsic `filetype` attribute by reading `outfilesuffix` back off the custom `webview-html5` converter instance, but Asciidoctor.js 4.0 rewrites that plain `.html` string property into a backend-traits accessor *function* the first time it normalises a registered converter — so a subsequent read got a function and `.substring(1)` threw. The value is now derived from a fixed `WEBVIEW_OUTFILESUFFIX` constant (the converter always emits HTML) instead of the mutable instance, so it no longer depends on Asciidoctor.js's internal normalisation. The preview rendered correctly regardless — the thrown promise was uncaught but harmless — so this only removes the console noise
* Confirm that a source block no longer leaks bold formatting onto the text that follows it (#305), and add a grammar regression test. The original symptom — a `[source,c]` block whose content contains a C-style `/* … */` comment turning every line after the block bold — is resolved: the trailing text is no longer picked up by AsciiDoc's inline `*…*` bold rule. One caveat remains and is a structural limitation of the TextMate grammar rather than a fixable bug: when text is placed *immediately* after the closing `----`, with no blank line, the source scope still extends onto it (the text is highlighted as code rather than as a normal paragraph). The opening and closing `----` delimiters are identical, so the block's outer end condition cannot distinguish them without state — the inner delimited sub-block consumes the closing `----` line, and the block only really closes at the next blank line. Leaving the conventional blank line after the closing delimiter — standard AsciiDoc style — makes it render correctly; a precise fix requires modeling block boundaries with a semantic token provider (#686). The regression test (`syntaxes/tests/snap/block/listing/source-style-with-c-comment-input.adoc`) covers the well-formed case
* Improve the table of contents in the preview. A `toc: left` sidebar overlapped the document text instead of reserving a column for it, hiding content; every sidebar TOC is now pinned to the right, where it lays out correctly (so `toc: left` renders like `toc: right`). A header-anchored TOC — `:toc:` (auto), or a `toc: left`/`right` sidebar that collapses into the normal flow below the sidebar breakpoint — is now cleanly bracketed by exactly two rules: one below the title (or the author details, when present) and one below the TOC. Previously a collapsed sidebar stacked the title's own bottom border against the TOC's top border, drawing two lines a few pixels apart; the title's redundant border is now dropped whenever a TOC follows it, leaving a single top rule, and the TOC gets matching top/bottom padding so its content is evenly spaced between the two rules. A body-placed TOC (the `toc::[]` macro, which can sit anywhere) keeps its boxed-card styling, so it still reads as a self-contained block wherever it appears. Additionally, when the preview follows the editor theme (`asciidoc.preview.useEditorStyle`, on by default) these header/TOC separators — and the sidebar divider — were drawn with `currentColor`, rendering as a harsh solid black (light theme) or white (dark theme) line; they now use the same subtle, theme-derived border color as the rest of the preview chrome. The table-of-contents behaviour in the preview — including the unsupported left sidebar — is documented on the "Preview" page
* Fix the preview failing to render in VS Code for the Web when the document has no `.asciidoctorconfig` file. The `.asciidoctorconfig` lookup walks the document's parent directories and reads any config it finds. Existence is probed with `stat()`, but the file system provider that serves a document living under the extension's own bundled resources (for example the built-in AsciiDoc cheat sheet) answers `stat()` optimistically and then returns a 404 on `readFile()` — an uncaught error that aborted the whole render. A config file that cannot be read is now treated as absent instead of breaking the preview
* Fix the preview jumping by roughly one source line when editing a document below the top — e.g. typing into a formula or any block that is scrolled into view. To stay stable while block heights change (MathJax, images, diagrams), an incremental content update reads the source line at the top of the preview and then re-pins to it. But the two halves of that round-trip disagreed on line numbering: the reader returns a 1-based source line (a `data-line-N` value) while the re-pin treated its input as a 0-based editor line and added 1, so it re-pinned to the *next* anchor and the preview slid down by one source line on every edit. The line ↔ pixel mapping now carries an explicit "this value is already a source line" flag, and the pure arithmetic behind it has been extracted (`scrollMapping`) and unit tested to document the convention. Two related refinements ship alongside: a selection change (click, arrow key) now only moves the active-line highlight instead of overwriting the scroll anchor with the cursor line (which a later reload could jump to), and the editor → preview sync leaves the preview put when the target line is already comfortably on screen, only scrolling to reveal a line that is off screen or at the very top (so smooth lockstep scrolling is preserved)
* Fix the preview nudging a table's header row by 1px when the editor selection lands on the table (`asciidoc.preview.markEditorSelection`). The `<table>` element carries the block's `data-line-*` anchor, so it received the `code-active-line` class and, with it, the `position: relative` that anchors the active-line marker bar; positioning a `border-collapse: collapse` table makes Chromium re-snap the collapsed borders, shifting the header. Tables now render that marker with a `box-shadow` instead — pure paint with no reflow — so the position indicator is preserved without disturbing the table layout. The bar keeps its gutter gap through a pair of stacked shadows; since CSS cannot read the background painted behind an element, the container blocks that give a table a non-page background (sidebar, example, quote, collapsible details, admonitions) publish their colour through an inherited `--adoc-marker-gap` custom property so the gap of a nested table matches its surroundings (for the translucent admonition tint, the opaque colour composited over the page background is published)
* Fix an absolute local `asciidoc.preview.style` stylesheet located outside the workspace being blocked by the preview on Windows (#430). The stylesheet's directory is whitelisted as a webview resource root, but the path was parsed with `vscode.Uri.parse`, which mistakes a Windows drive path such as `C:\styles\site.css` for a URI whose scheme is the drive letter (`c:`) — producing a bogus root that never matched the file. It now uses `vscode.Uri.file`, and only absolute local paths are whitelisted (relative paths already resolve under the workspace folder or the document's own folder, and URLs are loaded directly). Note: the historical `stylesheet does not exist or cannot be read: /C:/…` error from Asciidoctor reported on the same issue came from the pre-3.0 architecture, which passed the setting to Asciidoctor as `stylesheet`/`stylesdir` attributes with a malformed leading slash; the current preview builds the stylesheet `<link>` itself and no longer triggers it
* Fix an attribute reference such as `{context}` looking unhighlighted in the editor, so users assumed the reference was not recognized (#677). The grammar did match the reference, but the whole `{name}` span carried a single `markup.substitution.attribute-reference.asciidoc` scope with no sub-captures — a scope the default color themes (Dark+/Light+, …) do not color — so the only thing that stood out was the curly braces, and those only because of VS Code's bracket-pair colorization. The reference now breaks the name out into its own `support.constant.attribute-name.asciidoc` capture (the scope already used by the name in a `{set:…}`/`{counter:…}` reference, which the default themes do color) and the braces into `punctuation.definition.attribute-reference.begin/end.asciidoc`, so the attribute name is highlighted like any other recognized token
* Fix the built-in text-span color roles (`[.red]#…#`, `[.blue-background]#…#`, …) being unreadable in the preview when it follows the editor theme (`asciidoc.preview.useEditorStyle`, on by default). These roles ship with the colors from the default Asciidoctor stylesheet, which are tuned for a white page: against a dark theme the dark foreground colors (`black`, `navy`, `blue`, `gray`, …) were nearly invisible, and the light color backgrounds kept the theme's (light) foreground, leaving the text unreadable. The editor stylesheet now re-derives them to stay legible on any theme — the foreground color roles keep their semantic hue but switch to a brighter shade under a dark color-scheme, and the color backgrounds force a fixed, contrasting text color. The sizing and decoration roles (`big`, `small`, `underline`, `overline`, `line-through`) are theme-independent and unchanged. The line-breaking roles are also restored to match the default stylesheet: `[.pre-wrap]#…#` was missing entirely, and `[.nobreak]#…#` / `[.nowrap]#…#` only applied to inline code (`:not(pre)>code.nobreak`) instead of any text span (`:not(pre).nobreak`)
* Fix a table border going missing around merged cells in the preview when it follows the editor theme (`asciidoc.preview.useEditorStyle`, on by default) — e.g. the segment between a `3+|` colspan cell and an adjacent `.2+|` rowspan cell (#609). The editor stylesheet still used Asciidoctor's legacy table border model — `border-collapse: separate` with each cell drawing only its right/bottom borders and `:last-child` rules stripping the outer edges — which assumes the last cell of a row is also the visually last cell. With merged cells a spanned cell can be the last child of its `<tr>` without sitting at the table's edge, so its border was wrongly removed and a gap appeared. The editor stylesheet now uses the same modern model as the default Asciidoctor stylesheet (`border-collapse: collapse` with a full `1px` border on every grid cell), which renders merged cells with complete borders. Tables keep square corners: rounding a `border-collapse: collapse` table requires an `overflow: hidden` clip that the webview does not apply cleanly around header backgrounds and merged cells (the header fill and corners spilled past the rounded frame) and that would also hide the collapsed outer border, so the corners are left square and the frame comes from the merged-border model itself
* Stop non-actionable Asciidoctor log messages from cluttering the Problems panel: `INFO` and `DEBUG` records (such as "possible invalid reference") were surfaced as `Information` diagnostics — log output, not document problems — and a `FATAL` record was mislabelled `Information` instead of an error. Only `WARN` (→ Warning) and `ERROR`/`FATAL` (→ Error) now produce diagnostics. The full Asciidoctor log, including the filtered `INFO`/`DEBUG` messages, is still mirrored to the "Asciidoctor" output channel (with its source location) for troubleshooting, regardless of the `asciidoc.debug.enableErrorDiagnostics` setting — visible through "Developer: Show Logs…" and filtered by the channel's log level
* Fix cross-reference (`<<…>>`) completion crashing with `ReferenceError: Buffer is not defined` in VS Code for the Web. Reading a referenced file to harvest its anchors decoded the bytes with `Buffer`, a Node global that does not exist in the browser extension host; it now uses `TextDecoder`, which works in both hosts
* Fix a non-string Asciidoctor log message crashing the editor with `message.replace is not a function`. An extension could log a message whose text was not a string — asciidoctor-kroki, for one, used to log an object payload when a diagram failed to render — and the diagnostic code passed it straight into `vscode.Diagnostic.message`, which VS Code assumes is a string and throws on while rendering the marker's hover. This surfaced in VS Code for the Web, where a failed Kroki render crashed the editor and reported a useless `[object Object]` problem instead of the actual error. Asciidoctor log messages are now coerced to a string before being surfaced, so a misbehaving message can never crash the editor. (Diagram rendering in the web extension itself is fixed upstream in asciidoctor-kroki.)
* Fix a `[verse]` (or `[quote]`) block delimited by `----` (or `....`) breaking the highlighting of everything below it (#893): the verse/quote rule only knew the `____`, `""` and `--` delimiters, so a `----` line — which ends in `--` — tripped the paragraph's "ends after a line finishing in `--`" rule and closed the verse immediately, dropping the verse style from the body and letting the closing delimiter and following text leak. The verse/quote block now recognises the `----` and `....` delimited forms and runs them to their matching closing delimiter, so the content keeps the verse style and the block ends cleanly
* Fix the embedded source-code highlighting of a `[source,<lang>]` block being lost as soon as a positional or named attribute follows the language, e.g. `[source,cpp,linenums]` or `[source,cpp,subs="verbatim"]` (#793): the rule that recognises the block expected the language to be either the last attribute (right before `]`) or followed by more attributes, but the "followed by more attributes" branch never consumed the closing `]`, so the match failed and the block fell back to plain text. The pattern now treats the extra attributes as optional before the closing bracket, so the language is recognised whether or not it is the last attribute (and with the `source` style omitted, e.g. `[,cpp]`). The language is still only detected in the second position
* Fix a backslash-escaped URL such as `\https://asciidoc.org` being turned into a clickable link and, worse, breaking every other link on the page (#980). In AsciiDoc a leading backslash escapes the URL so it is rendered literally and must not be linked, but the document-link provider included the backslash in the matched URL and passed `\https://…` to `Uri.parse`, which threw `[UriError]: Scheme contains illegal characters` and aborted the whole provider — so all the document's links disappeared. Escaped URLs are now excluded from link detection, and the URL parsing is guarded so a single malformed URL can no longer drop the remaining links
* Fix comment lines and comment blocks placed directly below a one-line admonition (`TIP: …`, `NOTE: …`, …) not being highlighted as comments (#953): the one-line admonition paragraph only ended at a blank line, so any following `//` line or `////…////` block was swallowed as admonition text. It now also ends right before a comment line, letting the comment be highlighted — matching the behaviour already seen below delimited admonition blocks. Regular continuation lines of the admonition paragraph are unaffected
* Fix syntax highlighting breaking on an escaped closing bracket (`\]`) inside an inline macro such as `latexmath:[\]]` (#375): the affected macros (`stem:`/`latexmath:`/`asciimath:`, `xref:`, `footnote:`/`footnoteref:`, `pass:` and `citenp:`) ended their content at the *first* `]`, so an escaped bracket cut the macro short and the rest of the line (and its highlighting) leaked out as plain text. Their end pattern now ignores a backslash-escaped `]`, so the macro spans up to the real closing bracket
* Fix the preview scrolling on its own when clicking back into the editor to move focus there. The preview is a webview in the editor area, so giving it focus clears `activeTextEditor` and clicking back into the previewed editor fires `onDidChangeActiveTextEditor` again with the same document; the preview handled that by running an update whose unchanged-version path re-emits the scroll-sync message, snapping the preview back to the editor's top line (a jump when the preview had been scrolled independently, e.g. to the bottom). The active-editor handler now only reacts to a switch to a *different* document — a genuine editor scroll still syncs through the topmost-line monitor as before
* Fix runtime-localized strings showing as raw keys (e.g. a preview tab titled `preview.unlocked.title` instead of `Preview <file>`) in the desktop extension when the display language is English. These strings go through `vscode.l10n.t()` keyed by identifier, but VS Code only loads a `bundle.l10n.<locale>.json` for non-English display languages — in English it loads no bundle and `t()` returns the key verbatim. The desktop build now embeds the default (English) `bundle.l10n.json` as a fallback the wrapper consults when `vscode.l10n.t()` returns the key, mirroring what the web build already did; non-English locales are unaffected (their translation bundle is loaded as before)
* Fix attribute-reference autocompletion and the attribute-value hover silently doing nothing in any document that contains a table. To locate the block around the cursor, the provider scanned every block and called `getLineNumber()` on its source location — but a `table_cell` exposes a source-location object without that method, so the call threw and rejected the whole completion/hover request, killing both features for the entire document as soon as it held one table. The scan now skips source locations that do not expose `getLineNumber`, and is wrapped so a single unexpected node can no longer break the lookup (the error is logged to the "Asciidoctor" output channel instead)
* Fix a rendered diagram reverting to its raw source in the preview on every keystroke, only rendering again after a click forced a full refresh — most visible with a native `[mermaid]` block (no Kroki), and also affecting the inline SVG asciidoctor-kroki emits with `opts=inline`. These diagrams are produced as passthrough blocks, which the custom preview converter emitted verbatim with no wrapping element, dropping the `data-line-*`/`data-h-*` roles the engine attaches to every source block. The incremental preview update relies on those roles: without a `data-line-*` ancestor the block was never recognized as changed, so its renderer (Mermaid) was never re-run, and without a `data-h-*` content hash the morph could not tell the block was unchanged and kept replacing the rendered diagram with its raw source. Passthrough content is now wrapped in an element carrying those roles, so diagrams re-render on edit and unchanged diagrams are left untouched. Kroki's default image output was unaffected (an `<img>` block already carries the roles)
* Improve highlighting of blocks nested inside an admonition (`[NOTE]`/`[TIP]`/… over a `--` open block or `====` example block): the nested block only re-parsed inline markup and lists and used a zero-width end, so a blank line cut it short and any nested block (lists across paragraphs, further blocks) was not recognised — and the stray closing delimiter could leak the admonition scope into the rest of the document. The nested open/example blocks now recurse into the full grammar with a proper closing delimiter, matching how example and sidebar blocks already behave. (A source/listing block nested inside such an open block — #389 — is improved but still over-extends because of a separate, pre-existing greediness in the source-block rule, to be addressed on its own)
* Fix syntax highlighting breaking on a `[quote]`/`[verse]` block whose attribute list contains an inline macro with its own brackets, such as `[quote, Louis Berkhof, 'cite:[Berkhof1975, page=29]']` (#767): the rules matching the attribute line stopped each attribute at the *first* `]`, so the macro's closing bracket was mistaken for the end of the list — the match failed, the block was not recognised as a quote and its body lost the quote highlighting. The attribute scan now accepts a `]` that is followed by more non-blank text on the line (i.e. not the real closing bracket), so the list spans up to the actual `]$`. The shared block-attribute-list rule is fixed the same way, benefitting every block-attribute line
* Fix the built-in document attribute completion offering nothing when explicitly triggered (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Space</kbd>) on a partially typed declaration such as `:sect`: the provider only returned suggestions when the line prefix was exactly `:`, so as soon as a few characters were typed it bailed out. It now matches `:` followed by a (partial) attribute name, filters the suggestions on that name (so `:sect` keeps `:sectnums:`, `:sectids:`, …) and replaces the typed text with the chosen snippet instead of appending to it
* Fix `asciidoc.preview.asciidoctorAttributes` set at the workspace or folder level (`.vscode/settings.json`) being ignored, while the same setting in the User settings worked (#928). The attributes were read with `vscode.workspace.getConfiguration('asciidoc.preview', null)`, and passing `null` as the scope only returns the global (User) configuration; the document URI is now passed as the configuration scope so workspace and multi-root folder overrides are honoured
* Fix "Export Document as PDF" ignoring a relative `:pdf-theme:` such as `:pdf-theme: custom-theme.yml` located next to the document (#979): the document is piped to `asciidoctor-pdf` through stdin with the process running from the workspace root, and asciidoctor-pdf resolves a `.yml` theme file (when no `pdf-themesdir` is set) relative to the current working directory — so the theme was looked up at the workspace root and silently fell back to the default theme, even though `asciidoctor-pdf <file>` run from the document's directory honoured it. The export now points `pdf-themesdir` at the document's base directory for a relative `.yml` theme, leaving built-in named themes, absolute paths and an explicit `pdf-themesdir` untouched
* Fix "Export Document as PDF" failing — sometimes with a cryptic `spawn /bin/sh ENOENT` — when `asciidoctor-pdf` could not be found on the `PATH` (#973). This typically happens when VS Code is launched from the Dock/Finder rather than a terminal, so it does not inherit the shell `PATH` that exposes a Homebrew/rbenv/rvm install. Three changes: (1) the spawn `PATH` is now enriched with the usual install locations (`/opt/homebrew/bin`, `/usr/local/bin`, rbenv/rvm/gem bin directories) so the executable is found even from a GUI launch; (2) when the executable is still not found, the export falls back to the Bundler-installed copy in the extension's global storage — that directory only exists after a successful local install, and `spawn` reports a missing working directory as `ENOENT` against the shell rather than the directory, so the fallback now checks the directory exists before probing it (offering to install otherwise) and turns a missing-`cwd` `ENOENT` into an explicit "working directory does not exist" message; (3) the "executable not found" notification now distinguishes the two causes — asciidoctor-pdf not installed yet (install it) versus installed but invisible because VS Code was launched from the GUI (set its full path in the "Asciidoctor Pdf Command Path" setting)
* Fix "Export Document as PDF" aborting with an obscure "Unable to get the workspace folder, aborting." when the document does not belong to any workspace folder (#749). A workspace was never actually required — it was only used to set the working directory of the export process — so the export now falls back to the document's own directory instead of refusing to run. The launched command (executable, arguments and working directory) is also logged at the debug level to ease troubleshooting
 * Reduce the frequency of the "We detect that you are working with Antora. Do you want to activate Antora support?" prompt (#896): opening several Antora documents at once (e.g. when a workspace restores its editors) used to stack one notification per document, and ignoring the notification — rather than answering it — left it free to pop up again on the next opened document, because the listener was only disposed *after* an answer. The prompt is now shown at most once at a time: it is never stacked while one is already pending, and a decision made meanwhile (including through the "Enable/Disable Antora support" command) is honoured instead of being asked again. It also gains a "Never" choice and clearer semantics: "No" (or dismissing it with the X or <kbd>Escape</kbd>) just means "not now" — it stops the nagging for the session without disabling Antora support, so the question can be asked again in a later session — whereas "Never" records the refusal and stops asking for good
* Fix dragging/dropping or pasting an image into an Antora page offering broken insertions: under Antora, images are referenced within the module's image family (by their bare name), so the "Insert image link" option produced a document-relative path (e.g. `image::../external/pic.png[]`) that does not resolve, and the editor's built-in "insert path" was equally useless. In an Antora page the link option is now suppressed and only the copy-into-module edit is offered (targeting the image by its bare name); an image already sitting in the module's `images` directory is referenced by its bare name without copying. As part of this, the one-shot "Enable Antora support?" prompt no longer overwrites a decision already made through the "Enable/Disable Antora support" command
* Fix `xref:` / `<<` cross-reference completion offering nothing in a typical document outside Antora: it only recognised explicit anchors (`[[id]]`, `[#id]`, `[id=…]`) scraped with a regular expression, so a document whose targets are plain sections — the common case — got no suggestions (and `xref:` with an empty target returned an empty list). Candidates now come from Asciidoctor's reference catalog, so sections (including their auto-generated ids such as `_section_title`, with the title shown as detail), block and inline anchors, and bibliography entries are all offered. The `<<` macro also gains `<` as a completion trigger so the suggestions pop up as you type it, and word-based suggestions (the editor proposing other words from the document) are turned off for AsciiDoc files where they add noise
* Fix <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click on a same-document `xref:` to an (often auto-generated) id such as `xref:_block_image[]` trying to open a file instead of scrolling to the target: a macro target without a `#` and without a dot is, per AsciiDoc, an id in the current document, but it was treated as a file path. Such targets now resolve to the target's source line through Asciidoctor's reference catalog (covering sections, blocks and anchors) and navigate within the document
* Fix following an interdocument link with an anchor (e.g. `link:other.adoc#section[…]` or `xref:other.adoc#section[…]`) in the preview opening the target document at its top instead of scrolling to the anchor (#705): when links to AsciiDoc files open in the preview (`asciidoc.preview.openLinksToAsciidocFiles`), the `#fragment` was dropped. The fragment is now carried into the freshly rendered document, which scrolls to the referenced anchor and moves the editor to its source line, just like clicking an in-page anchor
* Fix <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click on an interdocument `xref:other.adoc#anchor[]` in the editor opening the target file at its top when the anchor is not a section (#705): the jump was resolved through the table of contents, which only knows section headings, so an inline `[[id]]` anchor on a paragraph or a block id was not found. The anchor is now resolved through Asciidoctor's reference catalog (sections, blocks and inline anchors), so the editor scrolls to the right line
* Add <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click navigation on the `link:` macro when it points to a file (e.g. `link:other.adoc[]`, `link:other.adoc#anchor[]`): previously only `xref:`, `include::`, internal cross references and bare URLs were clickable, so a `link:` to another document offered no navigation. `link:` macros to a URL keep being handled by the URL detection
* Add <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click navigation on the `<<id>>` / `<<id,link text>>` shorthand internal cross references (previously only the `xref:` macro was navigable). The target is resolved to its source line through the same reference catalog, so ids, auto-generated section ids and natural cross references by title (`<<Section Title>>`) all jump to the right place
* Fix `:data-uri:` not embedding images in the preview (desktop and VS Code for the Web): Asciidoctor's built-in `data-uri` embedding reads from disk, which does not work for VS Code workspaces, so it was disabled. When `:data-uri:` is set the preview now embeds images itself — reading local files (honouring `imagesdir`) through `vscode.workspace.fs` and fetching remote images over HTTP — so both local and remote images (including SVG) are inlined as `data:` URIs
* Fix paste image (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>) saving to a bogus folder and breaking the inserted macro when a `:imagesdir:` line merely appears inside a delimited block (e.g. a listing block) (#879). The `imagesdir` resolution used a naive text scan that matched those literal lines; it now skips delimited blocks while still honouring an `:imagesdir:` redefined in the document body (so the value reflects where the image is pasted), and falls back to Asciidoctor when the attribute is set outside the document text (e.g. `.asciidoctorconfig`)
* Fix the MathJax 4 preview leaving a stray `$` on each side of every formula: Asciidoctor wraps AsciiMath in `\$…\$` delimiters, but MathJax 4 turns `tex.processEscapes` on by default, which rewrites each `\$` into a literal `<span>$</span>` before AsciiMath runs and steals the delimiters. `processEscapes` is now disabled so the `\$` delimiters reach the AsciiMath input jax intact
* Fix MathJax equations in the preview not re-typesetting while editing (they stayed as raw `\$…\$` text until the preview was reloaded/focused): MathJax 4 enables the accessibility extensions by default, whose speech/Braille generation runs in a web worker loading `sre/speech-worker.js` and the SRE mathmaps, neither of which is bundled. The missing worker left the `attachSpeech` render action pending forever, so the document's ready promise never resolved and every later `typesetPromise` (the incremental updates) hung. The speech/Braille/enrichment tooling is now disabled via the menu settings
* Fix an open preview not reflecting setting changes (e.g. `asciidoc.preview.style`) and the "Refresh Preview" command appearing to do nothing — you had to close and reopen the preview. Two issues: (1) on a settings change the preview was refreshed without forcing an update, so with the document text unchanged the refresh was throttled and then skipped by the unchanged-version early-return, and the new settings never took effect; (2) a forced refresh re-rendered but only morphed `#preview-root`, leaving the webview `<head>` — where styles, security level and the theme attribute live — untouched. A forced refresh now also does a full reload, and settings changes force the refresh
* Fix "No symbols found in document" in the Outline/breadcrumbs when a section is followed by an `include::` directive whose file contains sections (#936). Sections coming from an included file report a line number relative to that file, which produced a negative range that threw and wiped the whole outline; included sections are now anchored to the `include::` directive line in the host document — the only location the Outline (`DocumentSymbol`) can navigate to — and section ranges are clamped so they never end before they start
* Fix the Outline/breadcrumbs serving a stale tree: the document symbol provider cached the outline on its (singleton) instance behind a 2s throttle, so it could return another document's symbols, and never refreshed when an included file changed. It now rebuilds on every request (like the folding provider), and the provider is re-registered when any `.adoc` file is saved so the parent document's outline reflects edits to its includes (resolved from disk, hence refreshed on save like the preview)
* Fix false-positive diagnostics such as "no callout found for `<1>`" on a source block that pulls code via `include::file[]` (#971), and the diagnostics flapping/disappearing when the preview is opened (#944). The document-link provider enumerates includes through a parse that replaces every include with a `nothing` placeholder — which strips the callout markers from the block — and this degraded parse was publishing (and clearing) diagnostics. It no longer touches the diagnostic collection; diagnostics come solely from the fully-resolved parse and the preview conversion
* Fix the spurious "level 0 sections can only be used when doctype is book" diagnostic when an `include::` directive sits before the document title (#987). The include-enumeration parse replaced each include with a `nothing` placeholder paragraph, which pushed the `= Document Title` into the document body; it now uses an empty line, keeping the surrounding structure intact
* Stop diagnostics from flickering as you interact with a document (#944): they used to be (re)computed by every parse — each preview render, completion, folding, symbol or link request — and cleared whenever the active editor changed, so they appeared/disappeared when opening the preview or refocusing the editor. They are now produced from a single fully-resolved parse, refreshed only when a document is opened or its text changes (debounced) and cleared when it is closed, via a dedicated `AsciidocDiagnosticManager`. Opening or closing the preview no longer recomputes them
* Fix callout numbers disappearing from highlighted code blocks in the preview — register a highlight.js "merge HTML" plugin that preserves the conum markup through client-side highlighting, so syntax colors and callouts coexist ([highlight.js#2889](https://github.com/highlightjs/highlight.js/issues/2889))
* Fix preview document header and table of contents rendering as `[object Promise]` — await the now-asynchronous Asciidoctor.js 4.0 calls in the header chain (`subMacros` for author emails and the `outline` conversion for the TOC)
* Fix Mermaid diagrams failing to render with "reader.$read is not a function" — replace the removed Opal `reader.$read()` call with the `reader.getString()` JS API, compatible with Asciidoctor.js 4.0
* Fix web extension: `include::` directives left unresolved ("Unresolved directive in &lt;stdin&gt; - include::…") because Asciidoctor.js cannot read include targets from disk in the browser (#942). Relative includes are now pre-loaded recursively through `vscode.workspace.fs` and served by a dedicated include processor during the parse, mirroring how the Antora support resolves files from its in-memory catalog
* Fix web extension: the preview rendering on a black background under a light theme — the editor stylesheet left the body transparent so the webview backdrop showed through. The body now uses the editor background (falling back to white), so a light theme is never drawn on black
* Fix web extension: highlight.js (`hljs`) not defined due to missing `cspSource` in the preview `script-src` CSP directive
* Fix web extension: l10n keys shown as-is instead of translated strings — embed `bundle.l10n.json` at build time as a fallback when VS Code web does not load the bundle
* Fix web extension: `global is not defined` — replace `global` with `globalThis` for cross-environment compatibility
* Fix preview dark theme support and missing English localization (#981) - thanks @ryanCodes
* Fix incorrect scope for `markup.inline.raw` in TextMate grammar (#986)
* Fix Windows path generation by using `fsPath` (#998) - thanks @anoymouserver
* Fix TextMate grammar: support dots as delimiter in listing paragraph (#1004)
* Only provide attribute reference completion when typing inside `{ ... }`, instead of on every word, to reduce noise (notably inside macro targets such as `image::`)
* Stop offering `:skip-front-matter:` and `:front-matter:` in the `:` document-attribute completion: both are set via the API/CLI (or populated by the processor) and have no effect when declared in the document, so suggesting them as something to set was misleading. They remain referenceable through `{ ... }` completion when present in the parsed document
* Fix the docked table of contents (`toc2`) text color referencing a non-existent `--vscode-editor-color` theme variable, which left the text without an explicit color; use `--vscode-editor-foreground`
* Fix the `[.text-center]` role not centering a block's caption/title in the preview (e.g. an image caption stayed left-aligned): the default `.imageblock > .title` rule pinned the title to the left, overriding the centering inherited from the role; add a `.text-center > .title` override (#1031)
* Fix the bundled "Noto Serif" preview font never loading because its `@font-face` rules used `src: local('./fonts/…woff') format('woff')` — `local()` resolves an installed font by name, not a file, and `format()` is invalid after it; load the files with `url()` so the preview uses the bundled Noto Serif instead of falling back to a generic serif
* Fix `antora.yml` detection failing for AsciiDoc documents that live under `partials/` or `examples/` rather than `pages/` (#958): the detection was hardcoded to `modules/<module>/pages/…`, so partials and examples had no Antora context and their resource ids (images, includes) could not resolve. It now recognizes the `pages`, `partials` and `examples` content families
* Fix `antora.yml` detection failing on Windows when the workspace scan and the open document disagree on the drive-letter case (e.g. `/e:/…` vs `/E:/…`), which defeated the path prefix comparison and broke features such as image preview (#957)
* Fix Kroki diagrams with a transparent background (e.g. TikZ) being invisible in the dark/high-contrast preview themes: give Kroki image blocks a light background card so every diagram stays legible, regardless of whether the backend emits a transparent or opaque-white image
* Fix saving a document jolting the preview (and the editor it is synced with) back to a different scroll position even though the text is unchanged: the save handler forced a *full reload* of the webview, which rebuilds the whole DOM and resets the scroll. A save now forces a re-render only through the incremental morph path — enough to pick up `include::`d files changed on disk (a save does not bump the document version), while preserving the preview and editor scroll position. Forced refreshes triggered by shell-level changes (settings, theme, security level, "Refresh Preview") still do a full reload
* Fix the editor ⇄ preview scroll synchronization fighting itself (#1062, #638): with both "scroll preview with editor" and "scroll editor with preview" enabled, scrolling one pane echoed back from the other, so the preview flickered/jumped while you scrolled it and the editor would roll back a little. The previous guards were one-shot booleans that swallowed a single scroll event only — not enough once `editor.smoothScrolling` turns a reveal into a stream of events — and are replaced by short time-window guards on both sides, so a scroll the extension triggers on one pane no longer bounces back to the other
* Fix the preview scrolling to the wrong place relative to the editor, and never reaching the end of the document (#1062, #873, #991): the source-line mapping snapped from one block anchor straight to the next (e.g. from line 42 to 62) instead of interpolating, and the end of the document had no anchor so scrolling the preview to the bottom never took the editor down to the last line. The mapping now interpolates a fractional source line proportionally to the preview pixels between two consecutive blocks, a sentinel anchors the end of the document, and reaching the bottom of the preview brings the editor's last line just into view (instead of pinning it to the top)
* Fix clicking an in-page link in the preview — most visibly a table-of-contents entry — not moving the editor (#1062): the anchor target is now mapped back to its source line and the editor is revealed there, while the preview still scrolls to the anchor
* Fix the preview jumping straight to the end of the document, with no scroll synchronization, when a table is the first block (no paragraph before it) (#873): a table renders as `<table>` and its cells as `<td>`, but the scroll-sync only collected `<div>` line anchors, so every table anchor was dropped. With nothing else preceding the table, the only anchor left was the end-of-document sentinel, which collapsed every scroll position onto the last line. Scroll-sync now collects any element carrying a `data-line-*` anchor (matching the incremental-update selector), so tables anchor the mapping and scrolling tracks per row
* Fix the preview ⇄ editor scroll synchronization being broken by `include::` directives (#1062, #869, #59): with `sourcemap` enabled, a block pulled in from an included file reports its line number *relative to that included file* (e.g. the first paragraph of an include reports line 1), so the `data-line-N` anchors were no longer in ascending order — which both the binary search and the linear interpolation that map preview pixels to source lines rely on. Blocks coming from an included file are now anchored to the `include::` directive's neighbourhood in the host document instead, keeping the anchor list monotonic so the preview tracks the editor (and vice versa) across includes
* Fix the intrinsic attribute `{docname}` (the root name of the source document, with no leading path or file extension) not being offered by attribute-reference (`{`) completion even though it resolved in the preview (#82). Asciidoctor.js only derives the intrinsic `docname`/`docfilesuffix` attributes when the input is a file, not when it is a string — the preview set them explicitly but the language-features parse (which backs completion) did not. They are now set there too, so `{docname}` shows up in the completion list and matches what the preview renders
* Stop setting Asciidoctor's `base_dir` by default, which could break relative includes (#926). Because the extension parses the document as a string (not from disk), the intrinsic `docdir`/`docfile` attributes are not set automatically; the preview already provided them, but the diagnostics/outline/links parse and the HTML/DocBook export did not — they relied on `base_dir` alone. They now set `docdir`/`docfile` so relative includes and images resolve from the document's own directory (Asciidoctor derives `base_dir` from `docdir`), and `base_dir` is no longer passed unless the user opts into `asciidoc.useWorkspaceRootAsBaseDirectory`. That setting (and the PDF export's `-B` base directory) is unchanged. Now that `docfile` is always set, the document's source location is reported under its file name instead of `<stdin>`; the few places that special-cased `<stdin>` to tell the host document apart from an included file (diagnostics, the outline/folding via the table of contents, the include enumeration) now compare the source file (or use the reader's include depth), so they keep working whether or not `docfile` is set
* Fix the `asciidoc.preview.openLinksToAsciidocFiles` setting showing its two choices with swapped descriptions: `inEditor` was described as "open links in the preview" and `inPreview` as "open links in the editor". The labels were inverted when the setting was renamed from `openAsciiDocLinks` (whose still-correct labels sat right above), and the mix-up was copied into the French and German translations. The behaviour was always correct — `inPreview` opens the link in the preview, otherwise in the editor — only the wording was wrong. Fixed in the base strings and the fr/de localizations (the Japanese one was already correct)
* Proofread the Japanese localization (`package.nls.ja.json`, `l10n/bundle.l10n.ja.json`): translate the strings that were still in English (the Antora enable/disable titles, the `showEnableAntoraPrompt`/`preservePreviewWhenHidden`/`templates` descriptions and two deprecation messages), fix mistranslations and wrong particles (`セクション` → `選択範囲` for "editor selection", `コマンドを実行パス` → `コマンドの実行パス`, `警告の無効/有効` → `警告を無効/有効`), a wrong setting name in an error message (`'asciidoc.styles'` → `'asciidoc.preview.style'`), a katakana typo (`エキスポート` → `エクスポート`), and normalize terminology (`セキュリティー` → `セキュリティ`, `Asciidoc` → `AsciiDoc`, `エディタ`/`フォルダ`/`エクスプローラ` → `エディター`/`フォルダー`/`エクスプローラー`). Add the missing Japanese labels for the "Toggle Bold/Italic/Monospace" commands
* Proofread the French localization (`package.nls.fr.json`, `l10n/bundle.l10n.fr.json`): fix typos and missing accents (`sécurité`, `sécurisé`, `séparément`, `prévisualisations`), agreement and elisions (`déclarées`, `résolus`, `s'il`), stray English left in the strings (`and` → `et`, a duplicated `editor`, `l'Explorer` → `l'Explorateur`), apply French typography (space before `: ; ! ?`), and unify the wording (`Débogage`, `dans cet espace de travail`, `Strict`). Add the missing French labels for the "Toggle Bold/Italic/Monospace" commands and complete the `asciidoctor-pdf` command path description
* Proofread the English setting strings (`package.nls.json`, `l10n/bundle.l10n.json`): add the missing space in "It should be`-a`"/"It should be`--orientation`", a missing article ("no effect on the content security level"), a missing full stop, and reword the deprecated `openAsciiDocLinks` description from a question into a sentence; use "Full path to" (instead of "for") consistently
* Proofread the German localization (`package.nls.de.json`, `l10n/bundle.l10n.de.json`): translate the strings that were still in English (the Antora enable/disable titles, the `showEnableAntoraPrompt` description and a deprecation message), fix typos (`Regisistrierung` → `Registrierung`, `Interval` → `Intervall`, `heisst` → `heißt`, a stray English `and`, a doubled full stop and doubled spaces, `Nicht Vertrauenswürdig` → `Nicht vertrauenswürdig`, `in diesen` → `in diesem`), apply German compound spelling (`AsciiDoc-Dokument`, `Asciidoctor.js-Erweiterungen`, `JSON-Objekt`, `Debug-Logging`, …) and grammar (missing commas, `anstatt dem` → `anstelle des`). Add the missing German labels for the "Toggle Bold/Italic/Monospace" commands

### Improvements

* Add control over where "Export Document as PDF" writes its output and whether it prompts (#868). Two new `resource`-scoped settings: `asciidoc.pdf.outputDirectory` chooses the destination directory (empty keeps the historical behaviour of saving next to the document; a relative path is resolved against the workspace folder — or the document's directory when there is no workspace — and `${workspaceFolder}` is supported; the directory is created if missing and the exported file keeps the document name with a `.pdf` extension), and `asciidoc.pdf.askOutputLocation` (default `true`) keeps the save dialog. Setting it to `false` skips the prompt and writes directly to the resolved path, overwriting any existing file — useful to repeatedly regenerate the same PDF in a tight save-and-export iteration cycle
* Offer to copy an image into the project when dragging and dropping one that is not already reachable from the document (outside `imagesdir`, or outside the current Antora module). Dropping such an image now shows two options in the editor's drop widget — "Insert image and copy to workspace" (the default, which copies the file next to the others under `imagesdir`, or into `modules/<module>/images` under Antora, without overwriting an existing file) and "Insert image link" (the previous behaviour). An image already located under `imagesdir`/the module still inserts a plain link with no prompt. Controlled by the new `asciidoc.editor.drop.copyIntoWorkspace` setting (`smart` by default, or `never` to always link)
* Insert an image when **pasting** into the editor, mirroring the drag-and-drop experience (#879). Pasting an image *file* offers the same link/copy options as a drop, and pasting a *bitmap* — e.g. a screenshot or an image copied from a browser — copies it into the project (under `imagesdir`, or `modules/<module>/images` under Antora) and inserts the macro, so there is no longer a separate keyboard shortcut to remember. The copy is part of the paste and can be undone in one step. Controlled by `asciidoc.editor.paste.enabled` (on by default) and `asciidoc.editor.paste.copyIntoWorkspace` (`smart` by default, or `never`)
* Deprecate the "Paste Image" command (`asciidoc.pasteImage`, <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>) in favor of the standard paste above. It relied on bundled platform-specific clipboard scripts (`res/mac.applescript`, `res/pc.ps1`, `res/linux.sh`, now removed) because the VS Code clipboard API cannot read image bitmaps outside a paste gesture. The command still works — it now shows a one-time notice and delegates to the normal paste, so the old shortcut keeps inserting images — but it will be removed in a future release; use <kbd>Ctrl/Cmd</kbd>+<kbd>V</kbd> instead
* Fold every delimited block in the editor, not just open (`--`) and comment (`////`) blocks: listing (`----`), literal (`....`), example (`====`), sidebar (`****`), quote/verse (`____`), passthrough (`++++`) and tables (`|===`, `,===`, `:===`, `!===`) now show a folding control so long blocks (e.g. source listings) can be collapsed. The scanner is verbatim-aware — delimiter-looking lines (and `//` comments or `:` attributes) inside a listing, literal, passthrough, comment or table block are treated as content, not as nested blocks — while compound blocks (example, sidebar, quote, open) still let nested blocks fold independently. As part of this, a run of `//` comments sitting just above a `////` comment block no longer folds down into the block's closing delimiter; the two fold as separate ranges
* Add `asciidoc.preview.additionalStyles`, a list of stylesheets *layered on top of* the preview style instead of replacing it (#977). Until now `asciidoc.preview.style` was the only option and it dropped the default Asciidoctor stylesheet entirely, forcing users who only wanted to tweak a few rules to re-implement the whole theme. The additional stylesheets are applied in order, after the base style (default, editor, or the one set in `asciidoc.preview.style`), so they take precedence while keeping the built-in look
* Auto-load Highlight.js languages used in the document so any of the ~190 languages it supports is highlighted in the preview without configuration (#969). The bundled `highlight.min.js` only registers the ~37 "common" languages; the preview now detects the languages of the source blocks and loads the matching grammar (all are already bundled), so blocks such as `[source,dockerfile]` or `[source,nginx]` are colored out of the box. HTML-based exports still need the languages listed via the `highlightjs-languages` attribute. Use the canonical Highlight.js name (e.g. `bash`, not `zsh`, which Highlight.js does not provide)
* Highlight source code blocks out of the box (#970): enable the bundled Highlight.js syntax highlighter by default in the preview and in HTML-based exports (HTML and the `wkhtmltopdf` PDF engine), so `[source,…]` blocks are colored without having to set `:source-highlighter: highlightjs` first. It is a soft default — a document's own `:source-highlighter:` still wins, and you can pick another highlighter (or set `source-highlighter` to an empty string to opt out) through the `asciidoc.preview.asciidoctorAttributes` setting. DocBook export is unaffected (highlighting is left to the DocBook toolchain), and so are PDFs generated with the `asciidoctor-pdf` engine, which relies on the Ruby toolchain's own highlighters
* Refresh the default preview look and integrate it with the active VS Code color theme (light/dark/high-contrast): theme-aware admonitions with per-type accents, framed code blocks with unified backgrounds, cleaner tables (theme borders, header shading, zebra striping), and restyled quotes, sidebars, example/collapsible blocks and table of contents, via a new `asciidoctor-editor-enhancements.css` layered on top of the editor stylesheet
* Improve Antora performance on large projects: cache the Antora configuration and content catalog instead of rebuilding them on every preview render, invalidating through file system watchers, and stop loading the bytes of binary resources (images, attachments) into the content catalog (#434)
* Stop re-resolving (and re-logging) which `antora.yml` applies to a document on every render and completion: memoize the per-document lookup — including the "no applicable configuration" result — so a document outside any module no longer repeats the workspace scan or floods the logs. The cache is invalidated alongside the other Antora caches when a configuration or content file changes
* Log to a proper VS Code log output channel (#960): the extension now routes its messages through a single **Asciidoctor** `LogOutputChannel` with real levels (trace/debug/info/warn/error) and timestamps, instead of `console.*` calls that were only visible with the developer tools open. Logs are now available through **Output → Asciidoctor** and **Developer: Show Logs…**, and the verbosity is controlled by the standard **Developer: Set Log Level…** command. The `asciidoc.debug.trace` setting is deprecated as a result and no longer has any effect — including the verbose `[asciidoc.preview]` webview-console diagnostics, which now turn on when the **Asciidoctor** channel is set to **Trace**
* Add go-to-definition / Ctrl+click navigation on Antora resource ids in `image:`, `xref:` and `include::` macros (#434)
* Add Antora-aware auto-completion of resource ids (pages, images, partials, examples) in `image:`, `xref:` and `include::` macros, sourced from the content catalog. Every valid form is offered, from the shortest relative path to the fully qualified id (e.g. `seaswell.png`, `commands:seaswell.png`, `cli:commands:seaswell.png`, `2.0@cli:commands:seaswell.png`), and selecting one completes the macro with its `[]` (#434)
* Restrict `image::`/`image:` path completion to image files (png, jpg, jpeg, gif, svg, …) instead of listing every file such as `.adoc` pages
* On Antora pages, stop the workspace-wide `xref:` file-path completion (e.g. `../../../../full.adoc#…`) that competed with the Antora resource id completion, leaving the Antora-aware provider as the sole contributor (#434)
* Complete the anchors of the referenced page after `xref:<page>#` on Antora pages, sourced from the block ids declared in the target page (e.g. `xref:api:auth:page3.adoc#oauth`) (#434)
* Resolve Antora `xref:` resource ids in the preview so cross-component/cross-module links (and their `#anchor`) navigate to the referenced page instead of producing a broken link (#434)
* Re-enable Kroki diagrams: upgrade `asciidoctor-kroki` to `1.0.0-beta.1`, which is compatible with Asciidoctor.js 4.0. The new release also drops the `unxhr` dependency in favor of native `fetch`, so `:kroki-fetch-diagram:` now works in VS Code
* Extend the bundled Mermaid renderer beyond the core diagrams: register the ELK layout engine (`@mermaid-js/layout-elk`, enabling `layout: elk`) and the ZenUML diagram (`@mermaid-js/mermaid-zenuml`, #947). The preview now disables Mermaid's `startOnLoad` and calls `run()` itself, so these external diagrams are registered before any diagram is detected
* Expose the active VS Code color theme to the preview conversion as a `vscode-theme` document attribute (`dark`/`light`), so documents can branch on it (e.g. `ifeval::["{vscode-theme}" == "dark"]`) and diagram extensions can request a matching theme; the preview re-renders when the color theme changes
* Update the preview incrementally instead of reloading the whole webview on every edit (#1062). Each render previously replaced `webview.html` entirely, which re-downloaded MathJax/Mermaid/highlight.js, re-rendered every equation and diagram from scratch, and made the preview jump — especially noticeable on long or math-heavy documents (#169, #709, #776). The new content is now morphed into the page (via `morphdom`): blocks are tagged with a content hash so unchanged ones keep their already-rendered MathJax/Mermaid/highlight.js/image output untouched, and only the leaf blocks that actually changed are re-processed (section containers are never re-typeset as a whole). The scroll position is anchored to the top source line and re-pinned after asynchronous layout shifts (MathJax typesetting, images loading), so editing no longer scrolls the preview away. Enable `asciidoc.debug.trace: verbose` to log incremental-update diagnostics to the preview console
* Speed up math while editing: render MathJax with the CommonHTML output and coalesce re-typesetting so editing the same equation repeatedly (e.g. typing a number digit by digit) collapses to a single typeset instead of piling up one per keystroke. Combined with the per-block incremental update, editing one equation in a long document is now near-instant instead of taking a second or more
* Upgrade the preview's math engine from MathJax 2 to MathJax 4. The preview now ships the self-contained `tex-mml-chtml` combined component bundled with the default `mathjax-newcm` font (no CDN access, so it keeps working offline and under the WebView's Content-Security-Policy), with AsciiMath loaded on demand. Typesetting moves to the promise-based API (`MathJax.typesetPromise`), LaTeX equation numbering (`eqnums`) maps to MathJax 4's `tex.tags` (a bare `:eqnums:` now correctly enables AMS auto-numbering), and AsciiMath block equations are still rendered in display mode. Only the font assets actually used by CommonHTML are bundled, so the shipped MathJax payload shrinks from ~66 MB to a few MB
* Support the MathJax mhchem extension (`\ce` chemical equations and `\pu` physical units) in the preview (#344). The combined component already carries the `autoload` map that resolves these macros to `[tex]/mhchem`, but the extension code itself was not bundled, so it failed to load offline under the WebView's Content-Security-Policy. The mhchem extension is now copied next to the other MathJax assets at the path autoload fetches, so `\pu` / `\ce` render without any configuration
* Mirror the editor's `scrollBeyondLastLine` in the preview: when the setting is enabled, reserve a viewport's worth of empty space below the content so the last lines can be scrolled up toward the top, like the editor lets you scroll past its last line. This also makes the end of both panes line up when synchronizing scroll
* Let another VS Code extension contribute Asciidoctor.js extensions to the preview, the export commands and the language features, without asking users to copy executable JavaScript into their workspace. Modeled on the built-in Markdown extension's `markdownItPlugins`: the contributing extension declares the `asciidoc.asciidoctorExtensions` contribution point and exports a `registerAsciidoctorExtensions(registry, context)` hook from `activate()`; this extension discovers the contributors statically, activates only those, and hands each the freshly created Asciidoctor.js registry. The `context` carries the processing mode (`preview`/`export`/`load`) and the document URI, and registration is isolated per contributor so a failing hook is reported and skipped without breaking the others or the document processing

### Documentation

* Migrate the README content into the Antora documentation (`docs/`): one page per topic (install, quick start, preview, export as PDF/HTML/DocBook, paste image, snippets, diagram integration, Asciidoctor.js extensions, Asciidoctor config file, VS Code environment, settings, build from source, contributing, get help) wired into the navigation, and slim the README down to an overview that links to the documentation
* Add an Antora support page documenting how to enable it and the features available (resource id completion, cross-reference anchor completion, go-to-definition, attribute completion, preview), along with the current limitations
* Remove the obsolete `unxhr` limitation note about `:kroki-fetch-diagram:` from the diagram integration page, since `asciidoctor-kroki` no longer depends on `unxhr`
* Clarify the `asciidoctor-emoji` example on the Asciidoctor.js extensions page: name the extension file and document that emojis are images served from the Twemoji CDN (an internet connection is required), which the preview's Content Security Policy allows over HTTPS by default — so no security setting needs to be changed
* Add a "Contribute Asciidoctor.js extensions from another VS Code extension" page documenting the `asciidoc.asciidoctorExtensions` contribution point and the `registerAsciidoctorExtensions(registry, context)` hook used to register Asciidoctor.js extensions from a companion VS Code extension
* Mark "Paste image" as supported in VS Code for the Web in the support matrix: the document paste edit provider is registered unconditionally, so copying an image and pasting it with <kbd>Ctrl</kbd>+<kbd>V</kbd> in the editor works in the browser
* Drop the "requires security to be disabled" caveat from the "Equations (via MathJax)" and "Syntax highlighting" rows of the VS Code for the Web support matrix: both now render in the web preview at the default security level, without changing any preview security setting
* Add a "File extensions and associations" page documenting the recognized extensions (`.adoc`, `.ad`, `.asciidoc`, `.asc`), how to use the extension with other extensions such as `.txt` via the `files.associations` setting, and why this is discouraged — a few features (workspace symbols, cross-file cross-reference completion, extension-less link resolution) look files up by the `.adoc` extension rather than by language, so they silently ignore non-`.adoc` files (#376)
* Document how to keep static-site front matter (the `---`/`+++` metadata block at the top of a file) out of the preview by setting the `skip-front-matter` attribute through `asciidoc.preview.asciidoctorAttributes`, and why it must be set there rather than in the document header or `.asciidoctorconfig` (#104)
* Document how to control when the preview updates: setting `asciidoc.preview.refreshInterval` to `0` disables live updates, after which the preview refreshes only on save (<kbd>Ctrl</kbd>+<kbd>S</kbd>, which re-reads `include::`d files from disk while keeping the scroll position) or on demand through the "Refresh Preview" command (a full reload that also picks up includes changed outside VS Code) — useful for heavy documents that contains complex MathJax equations (#229)
* Document how to bind a keyboard shortcut to a specific snippet through VS Code's built-in `editor.action.insertSnippet` command, either by referencing a snippet by name or by giving the snippet body inline (#778)
* Document how to use a custom PDF theme with the `asciidoctor-pdf` engine through the `:pdf-themesdir:` / `:pdf-theme:` document header attributes (resolved from the document's directory via `--base-dir`), and clarify that a PDF theme (`theme.yml`) only affects the PDF export and never the HTML preview, which is styled with CSS (#307)
* Document the VS Code editor defaults the extension sets for AsciiDoc files via `configurationDefaults` (`editor.wordWrap`, `editor.wordBasedSuggestions` and `editor.quickSuggestions`), why word-based and automatic suggestions are turned off (they add noise around attribute references, attribute entries and cross references, where context-aware completion already applies), and how to override them — scoped under `[asciidoc]` so the language-specific value wins, and in the *Remote*/*Workspace* settings rather than the local ones when working over Remote-SSH (#398). Spell out that changing a setting from the Settings UI search box (for example toggling *Editor: Word Wrap*) has no effect on AsciiDoc files because it writes a non-language-specific value that the `[asciidoc]` default overrides, and list the AsciiDoc-specific ways to override it: the `Preferences: Configure Language Specific Settings…` command, the `@lang:asciidoc` Settings UI filter, or an `[asciidoc]` block in `settings.json` (#800)

### Infrastructure

* Fix and simplify the release automation. The release notes generator (`tasks/release-notes.js`) now actually stamps the released version into `CHANGELOG.md` — the version heading was computed but the result was discarded, leaving the `## Unreleased` section untouched — and the off-by-one month in the stamped date is corrected. The release workflow gains a **pre-release** checkbox (a `workflow_dispatch` boolean input), so a pre-release is triggered by ticking a box on a plain version (e.g. `4.0.0`) instead of inventing a throwaway `-beta.1` suffix; when set, the Marketplace, Open VSX and GitHub release are published as pre-releases and the CHANGELOG entry is marked `## 4.0.0 (pre-release)`. A semver pre-release suffix on the version is still honored as a fallback
* Announce each release on the Asciidoctor Zulip (the `#releases` topic), mirroring what Asciidoctor.js does. After the extension is built, tagged and published, the release workflow posts a message linking to the GitHub release; the message notes whether the release is a pre-release. The announcement targets the exact tag created by `release.sh` (the coerced `major.minor.patch`, e.g. `v4.0.0`) rather than the raw input version, so a pre-release triggered by ticking the checkbox on a plain version links correctly, and requires two secrets on the `releases` environment (`ZULIP_USERNAME`, `ZULIP_API_KEY`)
* Extract the pure completion logic (Antora resource id forms, Antora resource macro matching, xref/`<<` anchor id extraction, and the xref/`<<` query parsing and label building) into `vscode`-free modules and cover it with fast Node `test:unit` unit tests instead of the extension-host suite (#434)
* Extract the custom preview stylesheet path resolution out of the WebView converter's `fixHref` into a pure, `vscode`-free `resolveStyleUri` module and cover it with fast Node `test:unit` unit tests, locking in the behaviour of a custom `asciidoc.preview.style` in the VS Code Web editor (#651): an `http:`/`https:`/`file:` URL is passed through verbatim (rather than being resolved against the project path), and a relative path resolves under the workspace folder — working on the `vscode-vfs://` filesystem used by github.dev/vscode.dev. The scheme detection is now case-insensitive, matching the webview resource-root whitelist
* Migrate from webpack to esbuild
* Switch Node.js extension output to `.mjs` and remove `"type": "module"` from `package.json` to prevent VS Code web worker host from misidentifying the CJS browser bundle as ESM
* Migrate to Asciidoctor.js 4.0.x (#999) — a major rewrite that is asynchronous and no longer based on Opal — bumping `@asciidoctor/core` from 2.2.7 to 4.0.x and asciidoctor-kroki from 0.18.1 to 1.0.x
* Raise the minimum VS Code version to 1.97 to use the finalized drag-and-drop and paste edit APIs (multiple drop/paste options with titles, and `registerDocumentPasteEditProvider`), needed for the copy-on-drop and paste-image features
* Upgrade Mermaid from 10.9.0 to 11.15.0
* Upgrade TypeScript from 4.9.5 to 5.x (#1003)
* Reduce npm audit vulnerabilities (#1002)
* Source the CI Node.js version from `package.json` (`volta.node`) and bump `actions/checkout` to v7 and `actions/setup-node` to v6
* Replace `vscode-tmgrammar-test` with the more actively maintained `textmate-grammar-test` fork for grammar snapshot tests
* Force LF line endings on grammar snapshot fixtures via `.gitattributes` so the snapshot tests pass on Windows CI
* Add `ide-external-custom-properties.css`, a non-bundled stub declaring the custom properties injected at runtime (`--vscode-*` from the webview theme, `--asciidoc-*` from the extension), so IDEs resolve `var(--…)` references in the preview stylesheets while still flagging typos in our own variables
* Lint the preview stylesheets with Biome (CSS) and drop browser hacks that are dead weight in the Chromium-based webview: remove the `-moz-`/`-ms-`/`-o-` vendor prefixes and the redundant `-webkit-` ones that already have a standard equivalent (`border-radius`, `box-shadow`, `appearance`, old flexbox, `box-sizing`), along with the IE `*zoom` hasLayout hacks, while keeping the webkit-only properties that still apply (`-webkit-font-smoothing`, `-webkit-tap-highlight-color`, `-webkit-text-size-adjust`, `::-webkit-details-marker`)
* Publish the extension to the [Open VSX Registry](https://open-vsx.org) during release (in addition to the VS Code Marketplace), making it installable from VSCodium, Cursor, Gitpod, code-server and other VS Code-compatible editors: the release publishes the same `.vsix` via `ovsx`, gated on an `OVSX_TOKEN` secret so it is skipped (without failing the release) until the token is configured (#285)
* Allow running the extension-host test suite on a single file with `node ./src/test/runTest.mjs --file <substring>` (alias `-f`), instead of always running every `*.test.ts`

## 3.4.5  (2025-09-16)

### Bug fixes

* Improve completion for `xref` and `image` (#968) - thanks @bongiozzo
* Fix navigation on anchors that contains underscore (#963) - thanks @bongiozzo
* Improve source block TextMate grammar (#961)

### Infrastructure

* Switch from `vscode-nls` (deprecated) to `vscode-l10n` (#955)
* Update node to v22 (#934)
* Replace eslint by biome (#954)

## 3.4.4 (2025-07-14)

### Bug fixes

* Extension was incorrectly asking to enable Antora support even though no `antora.yml` file existed - thanks @oliviercailloux

## 3.4.2 (2024-10-31)

### Bug fixes

* Replace `ripgrep` by `workspace.findFiles`. `ripgrep` was introduced in 3.4.0 but caused too many compatibility and instability issues.

## 3.4.1 (2024-10-12)

### Bug fixes

* Use the `rg` binary from the local VS code installation

## 3.4.0 (2024-10-12)

### Bug fixes

* Honor xrefstyle in the preview - thanks @r0ckarong
* Fix document to document xrefs in preview when the documents are included - thanks @birdman7260
* Replace dynamic import (unsupported by VS code)
* Allow spaces after table delimiter - thanks @ebousse 

### Improvements

* Set intrinsic attributes `docdir`, `docfile` and `docname`
* Set attributes `docfilesuffix` and `filetype`
* Enable/disable Antora support using commands
* Use `ripgrep` instead of `findFiles` to improve performance - thanks @alaindresse

## 3.3.1 (2024-06-19)

### Bug fixes

* Support `antora.yml` files when version is undefined or `true` (#871) - thanks @leonardopavanrocha @alaindresse 
* Check if WebView is disposed (before refreshing) 

### Improvements

* Add activation event for .adoc files - thanks @ohhmm
* Render Mermaid diagrams locally (i.e., without relying on Kroki) - thanks @ztuowen

## 3.2.3 (2024-03-26)

### Bug fixes

* Fix a regression on xref introduced in 3.2.1 by @ViToni

### Infrastructure

* Bump dependencies by @ViToni

## 3.2.1 (2024-03-20)

### Improvements

* Use color variable defined by theme for ToC by @ViToni in #850

### Bug fixes

* Fix non working xref in preview pane by @ViToni in #853

## 3.1.12 (2024-02-11)

### Bug fixes

- Only prompt to enable Antora when antora.yml is not empty (#847)
- Consistent code completion for includes (#839)
- Fix highlighting a footnote with id (#835)

### Improvements

- Add doc role when the asciidoc page is used in an antora context (#845)
- Bump dependencies (#840)
- If Antora popup is closed (no answer) ask again later (#841)
- Improve autolink feature (#836)


## 3.1.10 (2023-11-25)

### Bug fixes

- Fix glob pattern while building the Antora content catalog - previously, if the documentation component was located at the root of the workspace the content catalog was empty
- Add `asciidoc.preview.style` directory as a local resource roots in the WebView - hopefully loading stylesheets from outside the workspace will work again!


## 3.1.9 (2023-11-19)

### Bug fixes

- Fix drive letter normalization - previously, we were applying `toLowerCase` on the whole path causing the WebView to return 401 on resources such as images (#825)


## 3.1.8 (2023-11-12)

### Bug fixes

- Allow Kroki server in strict CSP defined as a preview attribute
- Add `https` to `style-src` and `script-src` in strict CSP
- Fix a typo on the message "Do you want to active Antora support?" -> "Do you want to activate Antora support?"

### Improvements

- Use a more restrictive glob search for `antora.yml` files
- Use a faster implementation when suggesting to the user to activate Antora support

### Infrastructure

- Update GitHub Actions to v4 (major)

### Documentation

- Mention that `:kroki-fetch-diagram` is unsupported


## 3.1.7 (2023-11-02)

### Performance

- Replace `findFiles` by a recursive method that relies on `workspace.fs.stat` in the .asciidoctorconfig feature - should improve performance on large projects (#809)


## 3.1.6 (2023-10-24)

### Bug fixes

- Fix preview in the Web version (on vscode.dev)
- Decode section titles in outline (#795)

### Improvements

- Allow Kroki server in strict CSP
- Added German translation strings - thanks @r0ckarong
- Support Antora resource IDs on include

### Infrastructure

- Run CI on Windows (#796)
- Bump dependencies


## 3.1.5 (2023-09-17)

### Improvements

- Update asciidoctor Kroki to 0.17.0 - thanks @sixtysecrun


## 3.1.4 (2023-08-29)

### Bug fixes

- Fix the web bundle - the extension was no longer working on vscode.dev (#774)
- Fix the convert and export functions to DocBook - the extension was exporting HTML instead of XML/DocBook (#775)

### Improvements

- Allow MathJax to load in strict CSP (#780)

### Documentation

- Update the bug template on GitHub to refer to extension logs (#782) - thanks @jonathan-s


## 3.1.3 (2023-07-21)

### Bug fixes

- Ignore Antora documentation component symlinks (#755)
- Disable data-uri in preview (not supported) (#756)
- Provide image completion relative to the `imagesdir` attribute (#759)
- Move `getContent` call after generating the document header (#762)
- Remove the `imagesdir` attribute from image paths when drag and dropping images in the editor (#761)


## 3.1.2 (2023-07-15)

### Bug fixes

- Use `textDocument.lineAt` to avoid issues with line separators discrepancy (#750)
- Include .asciidoctorconfig, AsciiDoc attributes defined in the extension configuration and Antora AsciiDoc attributes in attributes completion (#754)


## 3.1.0 (2023-07-11)

First stable release of 3.x which includes all changes from 3.0.x.

### Improvements

- provide folding for list of sibling attributes by @apupier (#719)
- support remote includes when exporting in PDF without additional setting configuration (#731)

### Bug fixes

- folding of several single line comments is not working for more than 2 lines (#722)
- attribute coming from include files are missing in completion with 3.0.x (#727)


## 3.0.5 "pre-release" (2023-06-03)

### Breaking changes

- use vscode fs api instead of Node fs by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/669
- `pdf-themesdir` is now relative to the working directory (i.e., workspace folder) not relative to the document (#703)
- remove Asciidoctor CLI support (#539)
- `stylesdir` and `stylesheet` attributes are now _ignored_ in the preview. Instead, you should define `asciidoc.preview.style`.
Please note that when exporting to HTML, `stylesdir` and `stylesheet` will be used and should be defined in an `.asciidoctorconfig` file.

**NOTE:** We strongly recommend to use [`.asciidoctorconfig` file](https://intellij-asciidoc-plugin.ahus1.de/docs/users-guide/features/advanced/asciidoctorconfig-file.html) to define common attributes.
This file will be used in the preview and when exporting to HTML and PDF (using `asciidoctor-pdf`).

### Improvements

- Include path to completion item for xref by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/671
- add ability for asciidocParser to pass the krokiServerUrl  by @haydencbarnes in https://github.com/asciidoctor/asciidoctor-vscode/pull/701
-  provide completion short hand and long hand notation with similar scope of legacy by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/668
- append AsciiDoc attributes defined in antora.yml by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/694
- add UI message with Japanese locale by @YoshihideShirai in https://github.com/asciidoctor/asciidoctor-vscode/pull/689
- support non-Git workspace by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/696
- provide completion after<<from same document by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/670

### Bug fixes

- Fix completion after xref: for old double-square bracket notation by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/667

## 3.0.3 "pre-release" (2022-11-17) - @ggrossetie

### Bug fixes

- declare `supports_templates` as attribute otherwise `backendTraits` overrides other values, as a result syntax highlighting wasn't working anymore! (#666)

## 3.0.2 "pre-release" (2022-11-15) - @ggrossetie

### Improvements

- support `.asciidoctorconfig` and `.asciidoctorconfig.adoc` by @apupier, @ggrossetie and @ahus1 (#380)
- initial support for Antora by @marieflorescontact
- resolve Antora resources IDs on images by @marieflorescontact in https://github.com/asciidoctor/asciidoctor-vscode/pull/614
- add an option to preserve the preview window to avoid refreshing when switching away, and added setting to control this behavior by @rben01 in https://github.com/asciidoctor/asciidoctor-vscode/pull/607
- simplify contributions and add editor-selection style
- add support for custom templates by @xdavidson in https://github.com/asciidoctor/asciidoctor-vscode/pull/616
- provide sorttext on include suggestions by @eiswind in https://github.com/asciidoctor/asciidoctor-vscode/pull/626
- search path for included files by @eiswind in https://github.com/asciidoctor/asciidoctor-vscode/pull/618
- add drop images into editor feature by @marieflorescontact in https://github.com/asciidoctor/asciidoctor-vscode/pull/627
- set env attribute to vscode by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/644
- open xref from preview by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/643

### Bug fixes

- fix the logic that detects if `asciidoctor-pdf` and/or `bundler` are available in the `PATH`
- fix base directory when exporting to PDF on Windows (#593)
- fix localization generation by @YoshihideShirai (#594)
- fix Table Of Content sidebar color not aligned with the active theme by @apupier (#340)
- fix typo Recomendations -> Recommendations in snippets by @apupier
- fix release automation
- fix autocompletion on files (by replacing `.md` by `.adoc`)
- allow loading local resources from all workspace folders
- fix extensions loading on Windows (using `fsPath` otherwise Node require doesn't work on Windows) https://github.com/asciidoctor/asciidoctor-vscode/pull/630
- fix show preview/preview localization by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/640

### Infrastructure

- improve pull request and issue templates by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/633
- add renovate config by @ggrossetie in https://github.com/asciidoctor/asciidoctor-vscode/pull/657

### Documentation

- fix 2 small typos in readme by @apupier in https://github.com/asciidoctor/asciidoctor-vscode/pull/642
- add an introduction and a prerequisite section. by @ahus1 in https://github.com/asciidoctor/asciidoctor-vscode/pull/656

## 3.0.0 "pre-release" (2022-07-06) - @ggrossetie

### Improvements

- add Japanese localisation by @YoshihideShirai (#581)
- register Asciidoctor.js extensions by @YoshihideShirai (#569)
- create a complete HTML document using the WebView converter by @ggrossetie (#547)
- add code folding based on sections by @marieflorescontact (#550)
- add code folding on conditionals by @marieflorescontact (#555)
- add code folding on open blocks by @marieflorescontact (#559)
- add code folding on comment blocks by @marieflorescontact (#561)
- add code folding on single line comment by @marieflorescontact (#565)
- update preview icons and use codicons by @ggrossetie (#54)
- use load instead of convert for performance by @ggrossetie (#542)
- normalize setting names and group settings by category by @ggrossetie (#577)
- do not offer to download an outdated version of `wkhtmltopdf` by @ggrossetie (#577)
- add a new setting to add command line arguments for `wkhtmltopdf` by @ggrossetie (#577)
- offer to install locally the latest version of `asciidoctor-pdf` by @ggrossetie (#577)

### Bug fixes

- set `basebackend` and `outfilesuffix` on the WebView converter otherwise Docinfo are not correctly included (#522)
- activate completion only when `:` is at the start of the line by @ggrossetie (#529)
- correctly pass the `--footer-center` option to `wkthtmltopdf` by @gurbindersingh (#526)
- fix asciidoctor-pdf and wkhtmltopdf user settings by @meznom (#533)
- set CSS variables for font size, font family and line height by @ggrossetie (#530)
- fix format of paste image default filename by @Zhou-Yicheng (#558)
- show source action does not open a new pane (if the source is already opened) by @marieflorescontact (#562)
- fix for opening links to local files in preview window by @tombolano & @marieflorescontact (#572 #573)

### Infrastructure

- upgrade dependencies (#515)
- extract the report errors logic into a dedicated function by @ggrossetie (#534)
- extract get baseDir logic by @ggrossetie (#535)
- remove superfluous `copycss` by @ggrossetie (#538)
- unwrap convertUsingJavascript function by @ggrossetie (#537)
- introduce a load function by @ggrossetie (#541)
- remove slugifier (unused) from AsciidocEngine by @ggrossetie (#545)
- introduce an export function by @ggrossetie (#546)

### Documentation

- add basic instructions on how to develop/test the extension by @danyill (#540)
- fix manual install command in README by @marieflorescontact (#544)
- update contributing guide by @ggrossetie (#554)

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
* Update preview to ascidoctor.js v1.5.9 (thanks to @ggrossetie <ggrossetie@gmail.com>)
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
