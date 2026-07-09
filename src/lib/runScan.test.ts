import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {PAGE_SIZE, runScan} from './runScan'
import type {LinkCheckerPluginConfig} from './types'

const config: LinkCheckerPluginConfig = {
  checkUrl: async () => ({status: 'ok' as const}),
}

// First call: the paginated docs query. Fixtures here are always < PAGE_SIZE, so the page
// comes back shorter than PAGE_SIZE and the fetch loop in runScan stops after one call.
// Second call: scanInternalRefs' existence-check query for collected ref ids.
//
// runScan pins the perspective via `client.withConfig({perspective: 'raw'})` before issuing
// any queries, so the mock's `withConfig` must return the same mock (fetch stays reachable
// on the derived client).
function mockClient(docs: unknown[], existingIds: string[]): SanityClient {
  const fetch = vi.fn().mockResolvedValueOnce(docs).mockResolvedValueOnce(existingIds)
  const client = {fetch, withConfig: vi.fn()} as unknown as SanityClient
  ;(client.withConfig as ReturnType<typeof vi.fn>).mockReturnValue(client)
  return client
}

describe('runScan', () => {
  it('normalizes a draft-only document finding to its published id and marks it draft', async () => {
    const docs = [
      {
        _id: 'drafts.a',
        _type: 'post',
        _updatedAt: '2026-07-09T08:00:00Z',
        ref: {_type: 'reference', _ref: 'gone'},
      },
    ]
    const client = mockClient(docs, [])

    const result = await runScan(client, config, 'cli')

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      kind: 'reference',
      fromId: 'a',
      docState: 'draft',
      docStateUpdatedAt: {draft: '2026-07-09T08:00:00Z'},
    })
    expect(client.fetch).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({lastId: ''}),
    )
  })

  it('dedupes the same broken reference carried by both draft and published copies', async () => {
    const docs = [
      {
        _id: 'a',
        _type: 'post',
        _updatedAt: '2026-07-08T08:00:00Z',
        ref: {_type: 'reference', _ref: 'gone'},
      },
      {
        _id: 'drafts.a',
        _type: 'post',
        _updatedAt: '2026-07-09T08:00:00Z',
        ref: {_type: 'reference', _ref: 'gone'},
      },
    ]
    const client = mockClient(docs, [])

    const result = await runScan(client, config, 'cli')

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      kind: 'reference',
      fromId: 'a',
      docState: 'edited',
      docStateUpdatedAt: {
        draft: '2026-07-09T08:00:00Z',
        published: '2026-07-08T08:00:00Z',
      },
    })
  })

  it('does not report a reference whose draft counterpart exists', async () => {
    const docs = [{_id: 'c', _type: 'post', ref: {_type: 'reference', _ref: 'b'}}]
    const client = mockClient(docs, ['drafts.b'])

    const result = await runScan(client, config, 'cli')

    expect(result.findings).toHaveLength(0)
  })

  it('reports documentsScanned and passes source through', async () => {
    const docs = [
      {_id: 'a', _type: 'post'},
      {_id: 'b', _type: 'post'},
      {_id: 'c', _type: 'post'},
    ]
    const client = mockClient(docs, [])

    const result = await runScan(client, config, 'function')

    expect(result.documentsScanned).toBe(3)
    expect(result.source).toBe('function')
  })

  it('paginates the docs fetch when the dataset spans more than one page', async () => {
    const totalDocs = PAGE_SIZE + 2
    const allDocs = Array.from({length: totalDocs}, (_, i) => ({
      _id: `doc${String(i + 1).padStart(4, '0')}`,
      _type: 'post',
      ...(i === 0 ? {ref: {_type: 'reference', _ref: 'gone'}} : {}),
    }))
    const page1 = allDocs.slice(0, PAGE_SIZE)
    const page2 = allDocs.slice(PAGE_SIZE)
    expect(page1).toHaveLength(PAGE_SIZE)
    expect(page2).toHaveLength(2)

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce([])
    const client = {fetch, withConfig: vi.fn()} as unknown as SanityClient
    ;(client.withConfig as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await runScan(client, config, 'cli')

    expect(result.documentsScanned).toBe(totalDocs)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({lastId: ''}),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({lastId: page1[page1.length - 1]._id}),
    )
  })

  it('pins the raw perspective so drafts are always scanned regardless of apiVersion', async () => {
    const docs = [{_id: 'a', _type: 'post'}]
    const client = mockClient(docs, [])

    await runScan(client, config, 'cli')

    expect(client.withConfig).toHaveBeenCalledWith({perspective: 'raw'})
  })
})
