interface IncludeEntry {
  name: string
  position: number
  length: string
}

interface IncludeItem {
  [index: number]: IncludeEntry
}

interface IncludeItems extends Array<IncludeItem>{}

let baseDocIncludes: IncludeItems[] = []

function findIncludeProcessor () {
  const self = this

  self.handles(function (_target) {
    return true
  })

  self.process(function (doc, reader, target, attrs) {
    // We don't meaningfully process the includes, we just want to identify
    // their line number and path if they belong in the base document
    if (reader.path === '<stdin>') {
      baseDocIncludes.push([target, reader.lineno - 1, target.length])
    }
    return reader.pushInclude(['nothing'], target, target, 1, attrs)
  })
}

module.exports.getBaseDocIncludes = function getBaseDocIncludes () {
  return baseDocIncludes
}

module.exports.resetIncludes = function resetIncludes () {
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
