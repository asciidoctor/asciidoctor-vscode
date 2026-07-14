// Hand-written declarations for dependencies that ship without types. They
// only describe the (small) surface this extension actually uses.

declare module 'asciidoctor-kroki' {
  import type { Registry } from '@asciidoctor/core'

  const kroki: {
    register(registry: Registry, context?: object): void
  }
  export default kroki
}

declare module '@antora/content-classifier' {
  /** Identifier of a resource in the content catalog. */
  export interface ResourceId {
    component?: string
    version?: string
    module?: string
    family?: string
    relative?: string
  }

  /** A virtual file held by the content catalog (Vinyl-like). */
  export interface ContentCatalogFile {
    path?: string
    contents?: Buffer
    // Unlike in a query ResourceId, the coordinates of a classified file are
    // always populated.
    src: Required<ResourceId> & {
      path?: string
      abspath?: string
      basename?: string
      stem?: string
      extname?: string
      editUrl?: string
      contents?: Buffer
    }
    pub?: { url?: string }
  }

  /** A documentation component registered in the content catalog. */
  export interface ContentCatalogComponent {
    name: string
    title?: string
    latest?: object
    versions: { name: string; version: string; title?: string }[]
  }

  export interface ContentCatalog {
    findBy(criteria: {
      family?: string
      component?: string
      version?: string
      module?: string
      relative?: string
      basename?: string
      extname?: string
    }): ContentCatalogFile[]
    getById(id: ResourceId): ContentCatalogFile | undefined
    getByPath(query: {
      component: string
      version: string
      path: string
    }): ContentCatalogFile | undefined
    getComponents(): ContentCatalogComponent[]
    resolveResource(
      spec: string,
      context?: ResourceId,
      defaultFamily?: string,
      permittedFamilies?: string[],
    ): ContentCatalogFile | undefined
  }

  function classifyContent(
    playbook: object,
    contentAggregate: object[],
    siteAsciiDocConfig?: object,
  ): ContentCatalog
  export default classifyContent
}

declare module '@orcid/bibtex-parse-js' {
  export interface BibtexEntry {
    citationKey?: string
    entryType?: string
    entryTags?: Record<string, string>
  }
  const bibtexParse: {
    toJSON(bibtex: string): BibtexEntry[]
    toBibtex(json: BibtexEntry[], compact?: boolean): string
  }
  export default bibtexParse
}
