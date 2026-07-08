/**
 * Builds a structure-tool URL that opens a document in its standalone "fallback" editor
 * pane (`__edit__<id>`) - a single focused pane with no parent list. This deliberately
 * bypasses normal edit-intent resolution, which walks the project's structure and can land
 * the document under an unrelated parent pane (e.g. when a plugin's list item over-claims
 * the edit intent for types it doesn't actually list).
 *
 * When a `focusPath` is given (e.g. `richText[_key=="a1b2"].markDefs[_key=="c3d4"]`), it's
 * added as a `path` param so the editor opens focused on / scrolled to that field.
 */
export function buildEditPath(options: {
  basePath: string
  structureToolName: string
  documentId: string
  documentType: string
  focusPath?: string
}): string {
  const {basePath, structureToolName, documentId, documentType, focusPath} = options
  const base = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  const params = [`type=${documentType}`]
  if (focusPath) {
    params.push(`path=${encodeURIComponent(focusPath)}`)
  }
  return `${base}/${structureToolName}/__edit__${documentId},${params.join(',')}`
}
