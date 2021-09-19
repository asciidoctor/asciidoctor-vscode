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

export const githubSlugifier: Slugifier = new class implements Slugifier {
  fromHeading (heading: string): Slug {
    const slugifiedHeading = encodeURI(
      heading.trim()
        .toLowerCase()
        .replace(/\s+/g, '-') // Replace whitespace with -
        .replace(/[\][!'#$%&'()*+,./:;<=>?@\\^_{|}~`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '') // Remove known punctuators
        .replace(/^-+/, '') // Remove leading -
        .replace(/-+$/, '') // Remove trailing -
    )
    return new Slug(slugifiedHeading)
  }
}()
