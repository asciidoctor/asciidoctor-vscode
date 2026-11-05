// Kept apart from `security.ts`, which depends on the VS Code API, so that the
// preview's converter can use it in a worker thread (#1245).
export enum AsciidocPreviewSecurityLevel {
  Strict = 0,
  AllowInsecureContent = 1,
  AllowScriptsAndAllContent = 2,
  AllowInsecureLocalContent = 3,
}
