import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {resolvePreviewDocuments} from './resolvePreviewDocuments'

// resolvePreviewDocuments pins the perspective via `client.withConfig({perspective: 'raw'})`
// before issuing any queries, so the mock's `withConfig` must return a client whose `fetch`
// is the same spy we assert against.
function mockClient(fetch: ReturnType<typeof vi.fn>): SanityClient {
  const client = {withConfig: vi.fn()} as unknown as SanityClient
  ;(client.withConfig as ReturnType<typeof vi.fn>).mockReturnValue({fetch})
  return client
}

// Echoes each queried id back as a bare-bones document, so the test can assert on how many
// ids were requested per call and that every id round-trips through the merge.
function echoIdsAsDocs(_query: string, params: {ids: string[]}): Promise<unknown[]> {
  return Promise.resolve(params.ids.map((id) => ({_id: id, _type: 'post'})))
}

describe('resolvePreviewDocuments', () => {
  it('resolves ids within a single chunk in one fetch call, preferring drafts', async () => {
    const fetch = vi.fn().mockResolvedValueOnce([
      {_id: 'a', _type: 'post', title: 'Published A'},
      {_id: 'drafts.a', _type: 'post', title: 'Draft A'},
      {_id: 'b', _type: 'post', title: 'Published B'},
    ])
    const client = mockClient(fetch)

    const result = await resolvePreviewDocuments(client, ['a', 'b', 'c'])

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.size).toBe(2)
    expect(result.get('a')).toMatchObject({_id: 'drafts.a', title: 'Draft A'})
    expect(result.get('b')).toMatchObject({_id: 'b', title: 'Published B'})
  })

  it('chunks ids over CHUNK_SIZE (500) into multiple parallel fetch calls and merges results', async () => {
    const ids = Array.from({length: 501}, (_, i) => `id-${i}`)
    const fetch = vi.fn().mockImplementation(echoIdsAsDocs)
    const client = mockClient(fetch)

    const result = await resolvePreviewDocuments(client, ids)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.size).toBe(501)
    expect(result.get('id-0')).toMatchObject({_id: 'id-0'})
    expect(result.get('id-500')).toMatchObject({_id: 'id-500'})
  })

  it('returns an empty map and makes no fetch calls for empty input', async () => {
    const fetch = vi.fn()
    const client = mockClient(fetch)

    const result = await resolvePreviewDocuments(client, [])

    expect(fetch).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('dedupes ids before chunking, so duplicates do not push a chunk over the boundary', async () => {
    // 502 ids with 2 duplicates of an existing id -> 500 unique ids -> 1 chunk -> 1 fetch call.
    const uniqueIds = Array.from({length: 500}, (_, i) => `id-${i}`)
    const ids = [...uniqueIds, 'id-0', 'id-1']
    const fetch = vi.fn().mockImplementation(echoIdsAsDocs)
    const client = mockClient(fetch)

    const result = await resolvePreviewDocuments(client, ids)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.size).toBe(500)
  })
})
