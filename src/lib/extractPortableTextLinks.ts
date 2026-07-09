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

const URL_PATTERN = /^https?:\/\//i

/**
 * Schema-agnostic by VALUE, not by property name: any string anywhere in the document
 * tree that looks like an http(s) URL is a link occurrence - `href` on a Portable Text
 * annotation, a bare `url`/`website` string field, a custom link object's `externalUrl`,
 * all caught identically. Property names vary per schema; URL-shaped values don't.
 * The whole string must be the URL (anchored pattern) - URLs embedded inside prose
 * strings are out of scope.
 */
export function extractPortableTextLinks(doc: RawDoc): LinkOccurrence[] {
  const occurrences: LinkOccurrence[] = []

  walkDocument(doc, [], (value, path) => {
    if (typeof value === 'string' && URL_PATTERN.test(value)) {
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
