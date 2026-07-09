import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {toggleAcknowledged, writeReport} from './reportDocument'
import type {ScanResult} from './types'

const baseResult: ScanResult = {
  ranAt: '2026-07-09T00:00:00.000Z',
  findings: [],
  documentsScanned: 3,
  urlsChecked: 2,
  source: 'cli',
}

describe('writeReport', () => {
  it('carries forward acknowledgedKeys from the existing report', async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: ['k1']}),
      createOrReplace: vi.fn().mockResolvedValue(undefined),
    } as unknown as SanityClient

    await writeReport(client, baseResult)

    expect(client.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'link-checker-report',
        _type: 'linkCheckerReport',
        acknowledgedKeys: ['k1'],
      }),
    )
  })

  it('defaults acknowledgedKeys to an empty array when no report exists', async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue(null),
      createOrReplace: vi.fn().mockResolvedValue(undefined),
    } as unknown as SanityClient

    await writeReport(client, baseResult)

    expect(client.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'link-checker-report',
        _type: 'linkCheckerReport',
        acknowledgedKeys: [],
      }),
    )
  })
})

function mockPatch() {
  const calls: Record<string, unknown[]> = {}
  const chain = {
    unset: (...a: unknown[]) => {
      calls.unset = a
      return chain
    },
    setIfMissing: (...a: unknown[]) => {
      calls.setIfMissing = a
      return chain
    },
    insert: (...a: unknown[]) => {
      calls.insert = a
      return chain
    },
    commit: vi.fn().mockResolvedValue(undefined),
  }
  return {chain, calls}
}

describe('toggleAcknowledged', () => {
  it('adds the key with setIfMissing + insert when absent', async () => {
    const {chain, calls} = mockPatch()
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: ['other-key']}),
      patch: vi.fn().mockReturnValue(chain),
    } as unknown as SanityClient

    await toggleAcknowledged(client, 'the-key')

    expect(client.patch).toHaveBeenCalledWith('link-checker-report')
    expect(calls.setIfMissing).toEqual([{acknowledgedKeys: []}])
    expect(calls.insert).toEqual(['after', 'acknowledgedKeys[-1]', ['the-key']])
    expect(calls.unset).toBeUndefined()
    expect(chain.commit).toHaveBeenCalled()
  })

  it('removes the key with unset when present', async () => {
    const {chain, calls} = mockPatch()
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: ['the-key']}),
      patch: vi.fn().mockReturnValue(chain),
    } as unknown as SanityClient

    await toggleAcknowledged(client, 'the-key')

    expect(client.patch).toHaveBeenCalledWith('link-checker-report')
    expect(calls.unset).toEqual([['acknowledgedKeys[@ == "the-key"]']])
    expect(calls.setIfMissing).toBeUndefined()
    expect(calls.insert).toBeUndefined()
    expect(chain.commit).toHaveBeenCalled()
  })

  it('JSON-escapes keys containing quotes in the unset filter', async () => {
    const key = 'link:a:body[0]:https://x.se/?q="hi"'
    const {chain, calls} = mockPatch()
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: [key]}),
      patch: vi.fn().mockReturnValue(chain),
    } as unknown as SanityClient

    await toggleAcknowledged(client, key)

    expect(calls.unset).toEqual([[`acknowledgedKeys[@ == ${JSON.stringify(key)}]`]])
  })

  it('takes the add path when no report exists yet', async () => {
    const {chain, calls} = mockPatch()
    const client = {
      fetch: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockReturnValue(chain),
    } as unknown as SanityClient

    await toggleAcknowledged(client, 'the-key')

    expect(calls.setIfMissing).toEqual([{acknowledgedKeys: []}])
    expect(calls.insert).toEqual(['after', 'acknowledgedKeys[-1]', ['the-key']])
    expect(calls.unset).toBeUndefined()
  })
})
