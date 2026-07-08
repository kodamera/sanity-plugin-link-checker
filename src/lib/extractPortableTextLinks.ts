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
 * Schema-agnostic: finds any object with a string `href` property anywhere in the
 * document tree, rather than hardcoding a specific annotation type name (e.g. `link`),
 * since custom schemas commonly name their link annotation differently.
 */
export function extractPortableTextLinks(doc: RawDoc): LinkOccurrence[] {
  const occurrences: LinkOccurrence[] = []

  walkDocument(doc, [], (value, path) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).href === 'string' &&
      URL_PATTERN.test((value as Record<string, unknown>).href as string)
    ) {
      occurrences.push({
        fromId: doc._id,
        fromType: doc._type,
        fieldPath: formatPath(path),
        focusPath: formatFocusPath(path),
        href: (value as Record<string, unknown>).href as string,
      })
    }
  })

  return occurrences
}
