import {looksLikeBareDomain} from './bareDomains'
import {formatFocusPath, formatPath, walkDocument} from './walkDocument'

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

export interface LinkOccurrence {
  fromId: string
  fromType: string
  fieldPath: string
  focusPath: string
  href: string
}

export const URL_PATTERN = /^https?:\/\//i

/** Whether `href` is already protocol-anchored (matches this module's `URL_PATTERN`) -
 * exported so callers (e.g. `scanExternalLinks`) can tell a real URL occurrence apart
 * from a bare-domain occurrence without duplicating or reaching into the raw regex. */
export function isUrlShaped(href: string): boolean {
  return URL_PATTERN.test(href)
}

/**
 * Schema-agnostic by VALUE, not by property name: any string anywhere in the document
 * tree that looks like an http(s) URL is a link occurrence - `href` on a Portable Text
 * annotation, a bare `url`/`website` string field, a custom link object's `externalUrl`,
 * all caught identically. Property names vary per schema; URL-shaped values don't.
 * The whole string must be the URL (anchored pattern) - URLs embedded inside prose
 * strings are out of scope.
 *
 * When `options.detectBareDomains` is set, a string that isn't URL-shaped but looks like
 * a domain name missing its protocol (`example.com`, no `http(s)://`) is also captured -
 * see `bareDomains.ts` for the detection heuristic and its false-positive analysis.
 */
export function extractPortableTextLinks(
  doc: RawDoc,
  options: {detectBareDomains?: boolean} = {},
): LinkOccurrence[] {
  const occurrences: LinkOccurrence[] = []

  walkDocument(doc, [], (value, path) => {
    if (typeof value !== 'string') return
    const isUrl = URL_PATTERN.test(value)
    const isBareDomain = !isUrl && options.detectBareDomains && looksLikeBareDomain(value)
    if (isUrl || isBareDomain) {
      occurrences.push({
        fromId: doc._id,
        fromType: doc._type,
        fieldPath: formatPath(path),
        focusPath: formatFocusPath(path),
        href: value,
      })
    }
  })

  return occurrences
}
