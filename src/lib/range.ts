export const range = function (min: number, max?: number): number[] {
  // If only one number is provided, start at one
  if (max === undefined) {
    max = min
    min = 1
  }

  // Create a ranged array
  return Array.from(new Array(max - min + 1).keys()).map(function (num) {
    return num + min
  })
}
