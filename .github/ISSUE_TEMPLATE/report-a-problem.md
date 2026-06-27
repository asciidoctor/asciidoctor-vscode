---
name: Bug Report
about: If something isn't working the way you expect it to
title: ''
labels: ''
assignees: ''
type: 'bug'

---

Please provide details about:

* What you're trying to do
* What happened
* What you expected to happen

Please share relevant sample content. Or better yet, provide a link to a [minimal reproducible example](https://stackoverflow.com/help/minimal-reproducible-example).

We'll also need your system information (get it under "Help" -> "About" in VS Code). Share the installed extension version (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd> or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd> on macOS).

Provide steps to reproduce the issue and, if applicable, add screenshots to make it easier to understand.

The extension also writes logs that often point straight at the cause. To capture them:

1. Run *Developer: Set Log Level...* from the Command Palette, choose *Asciidoctor*, then pick *Trace*.
2. Reproduce the problem.
3. Open the Output panel (_View -> Output_) and select *Asciidoctor* in the channel dropdown.
4. Copy the relevant lines into the issue.
