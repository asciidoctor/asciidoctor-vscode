import vscode from 'vscode'
import { Asciidoctor } from '@asciidoctor/core'
import { readFileSync } from 'fs'

const PERMITTED_FAMILIES = ['attachment', 'example', 'image', 'page', 'partial']

function extractPartialModuleAndFilename (resourceId: string): { module?: string, family?: string, filename?: string } {
  const regexString = `^(?:(.*):)?(${PERMITTED_FAMILIES.join('|')})\\$(.*)$`
  const regex = new RegExp(regexString)
  const matches = regex.exec(resourceId)
  if (!matches) {
    return {}
  }

  const [, module, family, filename] = matches
  return { module, family, filename }
}

function isLocalAntoraIncludeEnabled () {
  const workspaceConfiguration = vscode.workspace.getConfiguration('asciidoc', null)

  // if Antora support is enabled, don't enable local includes
  const enableAntoraSupport = workspaceConfiguration.get('antora.enableAntoraSupport') || false
  if (enableAntoraSupport) {
    return false
  }

  return workspaceConfiguration.get('antora.enableLocalIncludes')
}

const localFamilyInclude = function (this: Asciidoctor.Extensions.IncludeProcessorDsl): void {
  const self = this
  self.handles(function (target) {
    if (!isLocalAntoraIncludeEnabled()) {
      return false
    }
    const { filename } = extractPartialModuleAndFilename(target)
    return filename !== undefined
  })
  self.process(function (doc, reader, target, attrs) {
    const { module, family, filename } = extractPartialModuleAndFilename(target)

    const currentDocumentPath = doc.getBaseDir()

    const [antoraPath, currentRelativePath] = currentDocumentPath.split('/modules/')
    const currentModule = currentRelativePath.split('/')[0]

    const adjustedPath = `${antoraPath}/modules/${module || currentModule}/${family}s/${filename}`

    try {
      const content = readFileSync(adjustedPath, 'utf8')
      reader.pushInclude(content, target, target, 1, attrs)
    } catch (e) {
      reader.getLogger().error(e)
      reader.pushInclude(`Unresolved include: ${target} (tried ${adjustedPath})`, target, target, 1, attrs)
    }
  })
}

export function registerLocalAntoraProcessors (registry: Asciidoctor.Extensions.Registry) {
  registry.includeProcessor(localFamilyInclude)
}
