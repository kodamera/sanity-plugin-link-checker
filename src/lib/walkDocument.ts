/**
 * An object key, or an array-item segment carrying both its numeric index and its `_key`
 * (when the item has one). Portable Text blocks, spans and markDefs all have `_key`s.
 */
export type PathSegment = string | {index: number; key?: string}

function itemKey(item: unknown): string | undefined {
  if (
    item !== null &&
    typeof item === 'object' &&
    typeof (item as {_key?: unknown})._key === 'string'
  ) {
    return (item as {_key: string})._key
  }
  return undefined
}

export function walkDocument(
  value: unknown,
  path: PathSegment[],
  visit: (visited: unknown, visitedPath: PathSegment[]) => void,
): void {
  visit(value, path)

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkDocument(item, [...path, {index, key: itemKey(item)}], visit),
    )
    return
  }

  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      walkDocument((value as Record<string, unknown>)[key], [...path, key], visit)
    }
  }
}

/** Human-readable path for display, e.g. `richText[10].markDefs[1].customLink`. */
export function formatPath(path: PathSegment[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'string') {
      return acc ? `${acc}.${segment}` : segment
    }
    return `${acc}[${segment.index}]`
  }, '')
}

/**
 * Path in the shape Sanity's editor focus engine expects, e.g.
 * `richText[_key=="a1b2"].markDefs[_key=="c3d4"].href`. Array items with a `_key` use the
 * keyed form (position-independent, which is what the form uses); indexless arrays fall
 * back to numeric index.
 */
export function formatFocusPath(path: PathSegment[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'string') {
      return acc ? `${acc}.${segment}` : segment
    }
    if (segment.key) {
      return `${acc}[_key=="${segment.key}"]`
    }
    return `${acc}[${segment.index}]`
  }, '')
}
