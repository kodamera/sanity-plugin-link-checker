import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {MAX_OK_FINDINGS, PAGE_SIZE, runScan} from './runScan'
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

  it('skips stale never-published drafts but keeps drafts of published documents', async () => {
    const staleDate = '2020-01-01T00:00:00Z'
    const docs = [
      // Abandoned draft: never published, last touched years ago -> skipped.
      {
        _id: 'drafts.abandoned',
        _type: 'post',
        _updatedAt: staleDate,
        ref: {_type: 'reference', _ref: 'gone'},
      },
      // Old draft OF a published document -> kept regardless of age.
      {
        _id: 'live',
        _type: 'post',
        _updatedAt: staleDate,
      },
      {
        _id: 'drafts.live',
        _type: 'post',
        _updatedAt: staleDate,
        ref: {_type: 'reference', _ref: 'also-gone'},
      },
    ]
    const client = mockClient(docs, [])

    const result = await runScan(client, {...config, ignoreDraftsOlderThanDays: 90}, 'cli')

    expect(result.documentsScanned).toBe(2)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({kind: 'reference', fromId: 'live'})
  })

  it('always excludes sanity.* system types and passes excludeTypes to the docs query', async () => {
    const client = mockClient([], [])

    await runScan(client, {...config, excludeTypes: ['siteSettings']}, 'cli')

    expect(client.fetch).toHaveBeenCalledWith(
      expect.stringContaining('!string::startsWith(_type, "sanity.")'),
      expect.objectContaining({excludeTypes: ['siteSettings']}),
    )
  })

  it('pins the raw perspective so drafts are always scanned regardless of apiVersion', async () => {
    const docs = [{_id: 'a', _type: 'post'}]
    const client = mockClient(docs, [])

    await runScan(client, config, 'cli')

    expect(client.withConfig).toHaveBeenCalledWith({perspective: 'raw'})
  })
})

describe('runScan ok-finding cap', () => {
  // Unlike mockClient above (fixed two-call canned response, fine for < PAGE_SIZE fixtures),
  // this fixture spans multiple PAGE_SIZE pages, so the fetch mock has to actually implement
  // paging: filter by `lastId` and slice to PAGE_SIZE, same as the real `_id > $lastId` /
  // `order(_id asc)` query. Calls without `lastId` are scanInternalRefs' existence-check
  // query - answered with "nothing exists" so any reference candidate reads as broken.
  function mockPagedClient(allDocs: {_id: string}[]): SanityClient {
    const fetch = vi.fn(async (_query: string, params: Record<string, unknown>) => {
      if ('lastId' in params) {
        const lastId = params.lastId as string
        return allDocs
          .filter((d) => d._id > lastId)
          .sort((a, b) => (a._id < b._id ? -1 : 1))
          .slice(0, PAGE_SIZE)
      }
      return []
    })
    const client = {fetch, withConfig: vi.fn()} as unknown as SanityClient
    ;(client.withConfig as ReturnType<typeof vi.fn>).mockReturnValue(client)
    return client
  }

  // High concurrency (one batch, no inter-batch delay) and no host pacing - all the fixture
  // URLs share the example.com host, and the real defaults (concurrency 4, 1s per-host
  // pacing) would serialize thousands of near-instant mock checks and make this test take
  // minutes. `checkUrl` is mocked, so none of this affects what's actually being tested.
  function fastConfig(docCount: number): LinkCheckerPluginConfig {
    return {
      checkUrl: async () => ({status: 'ok' as const}),
      concurrency: docCount + 10,
      hostDelayMs: 0,
    }
  }

  function okDocs(count: number): {_id: string; _type: string; url: string}[] {
    return Array.from({length: count}, (_, i) => ({
      _id: `d${String(i).padStart(6, '0')}`,
      _type: 'post',
      url: `https://example.com/${i}`,
    }))
  }

  it('caps stored ok findings at MAX_OK_FINDINGS and reports the truncated count', async () => {
    const total = MAX_OK_FINDINGS + 5
    const docs = okDocs(total)
    const client = mockPagedClient(docs)

    const result = await runScan(client, fastConfig(total), 'cli')

    const okCount = result.findings.filter(
      (f) => f.kind === 'link' && f.result.status === 'ok',
    ).length
    expect(okCount).toBe(MAX_OK_FINDINGS)
    expect(result.okFindingsTruncated).toBe(5)
    expect(result.urlsChecked).toBe(total)
  })

  it('leaves okFindingsTruncated undefined when the ok-finding count is under the cap', async () => {
    const docs = okDocs(3)
    const client = mockPagedClient(docs)

    const result = await runScan(client, fastConfig(3), 'cli')

    expect(result.findings).toHaveLength(3)
    expect(result.okFindingsTruncated).toBeUndefined()
  })

  it('never drops problem findings even when ok findings exceed the cap', async () => {
    const total = MAX_OK_FINDINGS + 5
    const docs = [
      {_id: 'zzz-broken', _type: 'post', ref: {_type: 'reference', _ref: 'missing-target'}},
      ...okDocs(total),
    ]
    const client = mockPagedClient(docs)

    const result = await runScan(client, fastConfig(total), 'cli')

    const problems = result.findings.filter((f) => !(f.kind === 'link' && f.result.status === 'ok'))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({kind: 'reference', refId: 'missing-target'})
    expect(result.findings).toHaveLength(MAX_OK_FINDINGS + 1)
    expect(result.okFindingsTruncated).toBe(5)
  })
})
