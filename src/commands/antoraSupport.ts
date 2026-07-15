import { commands, Memento } from 'vscode'
import { Command } from '../core/commandManager.js'
import { AntoraSupportManager } from '../features/antora/antoraContext.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'

export const antoraSupportEnabledContextKey = 'antoraSupportEnabled'

export class EnableAntoraSupport implements Command {
  public readonly id = 'asciidoc.enableAntoraSupport'

  public constructor(
    private readonly workspaceState: Memento,
    private readonly asciidocPreviewManager: AsciidocPreviewManager,
    private readonly antoraSupportManager: AntoraSupportManager,
  ) {}

  public execute() {
    this.workspaceState.update('antoraSupportSetting', true).then(() => {
      // Register the gated features right away; without this the attributes
      // completion would only appear after the window is reloaded.
      this.antoraSupportManager.registerFeatures()
      commands
        .executeCommand('setContext', antoraSupportEnabledContextKey, true)
        .then(() => {
          this.asciidocPreviewManager.refresh(true)
        })
    })
  }
}

export class DisableAntoraSupport implements Command {
  public readonly id = 'asciidoc.disableAntoraSupport'

  public constructor(
    private readonly workspaceState: Memento,
    private readonly asciidocPreviewManager: AsciidocPreviewManager,
    private readonly antoraSupportManager: AntoraSupportManager,
  ) {}

  public execute() {
    this.workspaceState.update('antoraSupportSetting', false).then(() => {
      this.antoraSupportManager.unregisterFeatures()
      commands
        .executeCommand('setContext', antoraSupportEnabledContextKey, false)
        .then(() => {
          this.asciidocPreviewManager.refresh(true)
        })
    })
  }
}
