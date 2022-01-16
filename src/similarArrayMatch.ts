import { range } from './util/range'

/**
 * Calculate the cost for mapping between two different arrays
 * @param {Array} haystack        an array of numbers contained but with offsets
 *                                in `similarNeedles`
 * @param {Array} similarNeedles  items matchable against the `haystack` array
 * @returns {Array}               an array of arrays with costs for each item
 *                                against each other item in the array.
 */
function calculateAdjacency (haystack, similarNeedles) {
  // Calculate adjacency using a cost function
  const rows = []
  haystack.forEach((v1) => {
    const row = []
    similarNeedles.forEach((v2) => {
      // Distance-like cost function
      row.push(Math.abs(v1 - v2))
    })
    rows.push(row)
  })
  return rows
}

/**
 * Returns the indexes in the adjacency matrix of lowest cost
 * @param {Array} adjacency     Cost mappings between arrays
 * @param {Array} col
 * @returns {Array}             Returns the index and the error term
 */
function columnMin (adjacency, col, removals) {
  const colValues = []
  adjacency.forEach((row, rowIndex) => {
    if (rowIndex <= Math.max(...removals)) {
      // values must be strictly increasing
      colValues.push(Infinity)
    } else {
      colValues.push(row[col])
    }
  })
  const chosenIndex = colValues.indexOf(Math.min(...colValues))
  return [chosenIndex, colValues[chosenIndex]]
}

/**
 * Given an adjacency matrix, select the lowest cost item
 * and return the matching item in the `haystack` array.
 * @param {Array} haystack  list of items from which lowest cost
 *                          array will be provided
 * @param {Array} adjacency list of costs of selecting items
 * @returns {Array}         returns a match and as an error term
 *                          the differences in lines
 */
function findNearest (haystack, adjacency) {
  const selectedEntries = []
  const removals = []
  let errorSum = 0
  adjacency[0].forEach((_entry, idx) => {
    const [removedEntry, errorTerm] = columnMin(adjacency, idx, removals)
    selectedEntries.push(haystack[removedEntry])
    removals.push(removedEntry)
    if (errorTerm !== Infinity) {
      errorSum += errorTerm
    }
  })
  return [selectedEntries, errorSum]
}

function arrIsIncreasing (num) {
  if (num.length === 1) {
    return true
  }
  const numDirection = num[1] - num[0]
  for (let i = 0; i < num.length - 1; i++) {
    if (numDirection * (num[i + 1] - num[i]) <= 0) {
      return false
    }
  }
  return true
}

/**
 * Given a set of `matchableItems` known to be contained in
 * `candidateItems` but potentially with offsets return a reasonable
 * guess at which `candidateItems` are the correct match and return these
 * @param   {Array} candidateItems list of items containing items similar
 *                                 to matchableItems
 * @param   {Array} matchableItems items which can be matched against
 *                                 candidateItems
 * @returns {Array}                items in candidateItems which are closest
 *                                 matches to matchableItems
 */
export function similarArrayMatch (candidateItems, matchableItems) {
  // if the arrays are equal because they are in strict ascending order
  // we can simply return the candidateItems
  if (candidateItems.length === matchableItems.length) {
    return candidateItems
  } else {
    // we assume a maximum error between lines and converter of +/- 10 lines
    // We sum the error term over all matchableItems and choose the lowest
    // value
    const offsets = range(-10, 10)
    const options = new Map()
    offsets.forEach((offset) => {
      const newMatchableItems = matchableItems.map((x) => x + offset)
      const adj = calculateAdjacency(candidateItems, newMatchableItems)
      const [result, error] = findNearest(candidateItems, adj)
      options.set(error, result)
    })
    // Enforce that options have strictly ascending arrays
    options.forEach((lines, key) => {
      if (!arrIsIncreasing(lines)) {
        options.delete(key)
      }
    })
    return options.get(Math.min(...options.keys()))
  }
}
