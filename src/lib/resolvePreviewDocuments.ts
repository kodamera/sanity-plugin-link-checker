import type {SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'

export interface PreviewDocumentValue {
  _id: string
  _type: string
  [key: string]: unknown
}

/** Fetches document values for Sanity's native Preview component, preferring drafts. */
export async function resolvePreviewDocuments(
  client: SanityClient,
  ids: string[],
): Promise<Map<string, PreviewDocumentValue>> {
  if (ids.length === 0) return new Map()

  const uniqueIds = Array.from(new Set(ids))
  const draftIds = uniqueIds.map((id) => `drafts.${id}`)
  const rows = await client
    .withConfig({perspective: 'raw'})
    .fetch<PreviewDocumentValue[]>(`*[_id in $ids || _id in $draftIds]`, {draftIds, ids: uniqueIds})

  const documents = new Map<string, PreviewDocumentValue>()
  for (const row of rows) {
    const publishedId: string = getPublishedId(DocumentId(row._id))
    const existing = documents.get(publishedId)
    if (!existing || row._id.startsWith('drafts.')) {
      documents.set(publishedId, row)
    }
  }

  return documents
}
