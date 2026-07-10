import {URL_PATTERN} from './extractPortableTextLinks'
import {formatFocusPath, formatPath, type PathSegment} from './walkDocument'

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

export interface UnlinkedUrlOccurrence {
  fromId: string
  fromType: string
  fieldPath: string
  focusPath: string
  href: string
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/gi

/**
 * Trims trailing punctuation that's almost certainly sentence punctuation, not
 * part of the URL - except a closing paren that's balanced by an opening paren
 * earlier in the match (e.g. a Wikipedia article slug like
 * .../wiki/Rain_(Beatles_song)), which is kept. Approximate, display-quality
 * boundary detection - see plan 027's "Current state" for the verified cases.
 */
function trimTrailingPunctuation(url: string): string {
  let result = url
  for (;;) {
    const last = result[result.length - 1]
    if (!last || !')]}.,;:!?"\''.includes(last)) break
    if (last === ')') {
      const opens = (result.match(/\(/g) ?? []).length
      const closes = (result.match(/\)/g) ?? []).length
      if (closes <= opens) break
    }
    result = result.slice(0, -1)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPortableTextBlock(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value._type === 'block' && Array.isArray(value.children)
}

function isSpan(value: unknown): value is {_key?: string; text: string; marks?: string[]} {
  return isRecord(value) && value._type === 'span' && typeof value.text === 'string'
}

/**
 * A markDef is "link-shaped" if any of its own string properties is itself a
 * URL - matches extractPortableTextLinks' existing schema-agnostic-by-VALUE
 * philosophy rather than assuming the annotation's `_type` is literally
 * 'link' (a schema might name it 'externalLink', 'cta', anything).
 */
function linkShapedMarkDefKeys(markDefs: unknown): Set<string> {
  const keys = new Set<string>()
  if (!Array.isArray(markDefs)) return keys
  for (const def of markDefs) {
    if (!isRecord(def) || typeof def._key !== 'string') continue
    const isLinkShaped = Object.values(def).some(
      (v) => typeof v === 'string' && URL_PATTERN.test(v),
    )
    if (isLinkShaped) keys.add(def._key)
  }
  return keys
}

/**
 * Finds URL-shaped substrings inside Portable Text span text that have no
 * link mark attached - text that LOOKS like a link but isn't one, invisible
 * to a site visitor's cursor. Unlike extractPortableTextLinks (which matches
 * a string's ENTIRE value), this deliberately searches substrings, since the
 * failure mode here is a URL embedded in a sentence, not standing alone.
 */
export function extractUnlinkedUrls(doc: RawDoc): UnlinkedUrlOccurrence[] {
  const occurrences: UnlinkedUrlOccurrence[] = []

  function walk(value: unknown, path: PathSegment[]): void {
    if (isPortableTextBlock(value)) {
      const linkKeys = linkShapedMarkDefKeys(value.markDefs)
      const children = value.children as unknown[]
      children.forEach((child, index) => {
        // Inline non-span children ("components" - a link-button, badge, embed,
        // anything with its own _type) are structured content the editor chose
        // deliberately, not plain text - categorically exempt, not a blind spot.
        // See plan 027's "Current state" for why a URL living inside such a
        // component's own fields is already a different check's job.
        if (!isSpan(child)) return
        const marks = child.marks ?? []
        const isLinked = marks.some((mark) => linkKeys.has(mark))
        if (isLinked) return
        const matches = child.text.matchAll(URL_IN_TEXT)
        for (const match of matches) {
          const href = trimTrailingPunctuation(match[0])
          const childPath = [...path, 'children', {index, key: child._key}]
          occurrences.push({
            fromId: doc._id,
            fromType: doc._type,
            fieldPath: formatPath(childPath),
            focusPath: formatFocusPath(childPath),
            href,
          })
        }
      })
      return // don't also generically recurse into a block we've handled structurally
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const key = isRecord(item) && typeof item._key === 'string' ? item._key : undefined
        walk(item, [...path, {index, key}])
      })
      return
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value)) walk(value[key], [...path, key])
    }
  }

  walk(doc, [])
  return occurrences
}
