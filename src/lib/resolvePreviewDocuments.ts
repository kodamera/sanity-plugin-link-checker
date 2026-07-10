import type {SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'

export interface PreviewDocumentValue {
  _id: string
  _type: string
  [key: string]: unknown
}

/**
 * Ids per query. Keeps each GROQ request's parameter payload and response bounded
 * when thousands of documents carry findings - one giant `_id in [...]` lookup
 * gets slow and memory-heavy. Chunks resolve in parallel; the merge is
 * order-independent because draft rows always win over published ones.
 *
 * No projection on purpose: these values feed useValuePreview, which resolves the
 * schema type's user-defined preview.select paths - projecting would break any
 * schema that selects a field we didn't include.
 */
const CHUNK_SIZE = 500

/** Fetches document values for Sanity's native Preview component, preferring drafts. */
export async function resolvePreviewDocuments(
  client: SanityClient,
  ids: string[],
): Promise<Map<string, PreviewDocumentValue>> {
  if (ids.length === 0) return new Map()

  const uniqueIds = Array.from(new Set(ids))
  const rawClient = client.withConfig({perspective: 'raw'})

  const chunks: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE))
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      rawClient.fetch<PreviewDocumentValue[]>(`*[_id in $ids || _id in $draftIds]`, {
        draftIds: chunk.map((id) => `drafts.${id}`),
        ids: chunk,
      }),
    ),
  )

  const documents = new Map<string, PreviewDocumentValue>()
  for (const row of chunkResults.flat()) {
    const publishedId: string = getPublishedId(DocumentId(row._id))
    const existing = documents.get(publishedId)
    if (!existing || row._id.startsWith('drafts.')) {
      documents.set(publishedId, row)
    }
  }

  return documents
}
