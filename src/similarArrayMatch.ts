/**
 * Calculate the cost for mapping between two different arrays
 * @param {Array} haystack        an array of numbers contained but with offsets
 *                                in `similarNeedles`
 * @param {Array} similarNeedles  items matchable against the `haystack` array
 * @returns {Array}               an array of arrays with costs for each item
 *                                against each other item in the array.
 */
function calculateAdjacency (haystack, similarNeedles) {
  // Calculate adjacency using a  cost function
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
 * @param {Array} adjacency     Cost mapppings between arrays
 * @param {Array} col
 * @returns
 */
function columnMin (adjacency, col) {
  const colValues = []
  adjacency.forEach((row) => {
    colValues.push(row[col])
  })
  // We just return the value. Ideally we'd eliminate the row
  // to avoid producing incorrect later matches but this may
  // be unlikely anyway...
  return colValues.indexOf(Math.min(...colValues))
}

/**
 * Given an adjacency matrix, select the lowest cost item
 * and return the matching item in the `haystack` array.
 * @param {Array} haystack  list of items from which lowest cost
 *                          array will be provided
 * @param {Array} adjacency list of costs of selecting items
 * @returns {Array}         matched items
 */
function findNearest (haystack, adjacency) {
  const selectedEntries = []
  adjacency[0].forEach((_entry, idx) => {
    const removedEntry = columnMin(adjacency, idx)
    selectedEntries.push(haystack[removedEntry])
  })
  return selectedEntries
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
    const adj = calculateAdjacency(candidateItems, matchableItems)
    return findNearest(candidateItems, adj)
  }
}
