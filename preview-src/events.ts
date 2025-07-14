export function onceDocumentLoaded(f: () => void) {
  if (
    document.readyState === 'loading' ||
    (document.readyState as string) === 'uninitialized'
  ) {
    document.addEventListener('DOMContentLoaded', f)
  } else {
    f()
  }
}
