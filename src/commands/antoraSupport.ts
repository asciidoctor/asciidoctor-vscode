import { Command } from '../commandManager'
import { Memento, commands } from 'vscode'
import { AsciidocPreviewManager } from '../features/previewManager'

export const antoraSupportEnabledContextKey = 'antoraSupportEnabled'

export class EnableAntoraSupport implements Command {
  public readonly id = 'asciidoc.enableAntoraSupport'

  public constructor (private readonly workspaceState: Memento, private readonly asciidocPreviewManager: AsciidocPreviewManager) {
  }

  public execute () {
    this.workspaceState.update('antoraSupportSetting', true)
      .then(() => {
        commands.executeCommand('setContext', antoraSupportEnabledContextKey, true).then(() => {
          this.asciidocPreviewManager.refresh(true)
        })
      })
  }
}

export class DisableAntoraSupport implements Command {
  public readonly id = 'asciidoc.disableAntoraSupport'

  public constructor (private readonly workspaceState: Memento, private readonly asciidocPreviewManager: AsciidocPreviewManager) {
  }

  public execute () {
    this.workspaceState.update('antoraSupportSetting', false)
      .then(() => {
        commands.executeCommand('setContext', antoraSupportEnabledContextKey, false).then(() => {
          this.asciidocPreviewManager.refresh(true)
        })
      })
  }
}
