interface IncludeEntry {
  index: number,
  name: string,
  position: number,
  length: string,
}

export interface IncludeItems extends Array<IncludeEntry>{}

let baseDocIncludes: IncludeItems = []
let includeIndex = 0

function findIncludeProcessor () {
  const self = this

  self.handles(function (_target) {
    return true
  })

  self.process(function (doc, reader, target, attrs) {
    // We don't meaningfully process the includes, we just want to identify
    // their line number and path if they belong in the base document
    if (reader.path === '<stdin>') {
      baseDocIncludes.push({ index: includeIndex, name: target, position: reader.lineno - 1, length: target.length })
      includeIndex += 1
    }
    return reader.pushInclude(['nothing'], target, target, 1, attrs)
  })
}

module.exports.getBaseDocIncludes = function getBaseDocIncludes () {
  return baseDocIncludes
}

module.exports.resetIncludes = function resetIncludes () {
  includeIndex = 0
  baseDocIncludes = []
}

module.exports.register = function register (registry) {
  if (typeof registry.register === 'function') {
    registry.register(function () {
      this.includeProcessor(findIncludeProcessor)
    })
  } else if (typeof registry.block === 'function') {
    registry.includeProcessor(findIncludeProcessor)
  }
  return registry
}
