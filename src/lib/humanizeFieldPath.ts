function humanizeSegmentName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

/**
 * Turns a raw field path like `richText[2].markDefs[0].customLink` into a short,
 * editor-friendly label - just the field it's in (e.g. `Rich Text`). Schema-agnostic - the
 * plugin has no access to field titles, only field names, so this humanizes the root
 * segment's name rather than looking up its actual schema title. Kind/location context
 * (link vs. reference, portable text vs. plain field) is already carried by which section
 * and tab the row is in, so it isn't repeated here.
 */
export function describeFieldPath(fieldPath: string): string {
  const rootSegment = fieldPath.split(/[.[]/)[0]
  return humanizeSegmentName(rootSegment)
}
