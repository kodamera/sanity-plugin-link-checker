import type {SanityClient} from '@sanity/client'
import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'

import type {BrokenReference} from './types'
import {formatFocusPath, formatPath, walkDocument} from './walkDocument'

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

interface RefCandidate {
  fromId: string
  fromType: string
  fieldPath: string
  focusPath: string
  refId: string
}

/**
 * Fetches every document in the dataset, walks each one for `{_type: 'reference', _ref}`
 * shapes, then checks which referenced ids don't actually exist (as their exact id,
 * published, or draft counterpart).
 */
export async function scanInternalRefs(
  client: SanityClient,
  docs: RawDoc[],
): Promise<BrokenReference[]> {
  const candidates: RefCandidate[] = []

  for (const doc of docs) {
    walkDocument(doc, [], (value, path) => {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>)._type === 'reference' &&
        typeof (value as Record<string, unknown>)._ref === 'string'
      ) {
        candidates.push({
          fromId: doc._id,
          fromType: doc._type,
          fieldPath: formatPath(path),
          focusPath: formatFocusPath(path),
          refId: (value as Record<string, unknown>)._ref as string,
        })
      }
    })
  }

  if (candidates.length === 0) {
    return []
  }

  const uniqueRefIds = Array.from(new Set(candidates.map((c) => c.refId)))
  const idsToCheck = Array.from(
    new Set(
      uniqueRefIds.flatMap((id) => {
        const published: string = getPublishedId(DocumentId(id))
        const draft: string = getDraftId(DocumentId(published))
        return [id, published, draft]
      }),
    ),
  )

  const existingIds = new Set<string>(
    await client.fetch<string[]>(`*[_id in $ids]._id`, {ids: idsToCheck}),
  )

  const refExists = (refId: string) => {
    const published: string = getPublishedId(DocumentId(refId))
    const draft: string = getDraftId(DocumentId(published))
    return existingIds.has(refId) || existingIds.has(published) || existingIds.has(draft)
  }

  return candidates
    .filter((c) => !refExists(c.refId))
    .map((c) => ({
      kind: 'reference',
      fromId: c.fromId,
      fromType: c.fromType,
      fieldPath: c.fieldPath,
      focusPath: c.focusPath,
      refId: c.refId,
    }))
}
