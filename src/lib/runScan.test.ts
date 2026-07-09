import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {runScan} from './runScan'
import type {LinkCheckerPluginConfig} from './types'

const config: LinkCheckerPluginConfig = {
  checkUrl: async () => ({status: 'ok' as const}),
}

function mockClient(docs: unknown[], existingIds: string[]): SanityClient {
  const fetch = vi.fn().mockResolvedValueOnce(docs).mockResolvedValueOnce(existingIds)
  return {fetch} as unknown as SanityClient
}

describe('runScan', () => {
  it('normalizes a draft-only document finding to its published id and marks it draft', async () => {
    const docs = [{_id: 'drafts.a', _type: 'post', ref: {_type: 'reference', _ref: 'gone'}}]
    const client = mockClient(docs, [])

    const result = await runScan(client, config, 'cli')

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      kind: 'reference',
      fromId: 'a',
      docState: 'draft',
    })
  })

  it('dedupes the same broken reference carried by both draft and published copies', async () => {
    const docs = [
      {_id: 'a', _type: 'post', ref: {_type: 'reference', _ref: 'gone'}},
      {_id: 'drafts.a', _type: 'post', ref: {_type: 'reference', _ref: 'gone'}},
    ]
    const client = mockClient(docs, [])

    const result = await runScan(client, config, 'cli')

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      kind: 'reference',
      fromId: 'a',
      docState: 'edited',
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
})
