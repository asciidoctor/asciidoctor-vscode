/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Slug {
  constructor (public readonly value: string) {
    this.value = value
  }

  public equals (other: Slug): boolean {
    return this.value === other.value
  }
}

export interface Slugifier {
  fromHeading(heading: string): Slug;
}
