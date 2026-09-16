import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {observeReport, toggleAcknowledged, writeReport} from './reportDocument'
import {getFindingKey, type ScanFinding, type ScanResult} from './types'

const baseResult: ScanResult = {
  ranAt: '2026-07-09T00:00:00.000Z',
  findings: [],
  documentsScanned: 3,
  urlsChecked: 2,
  source: 'cli',
}

const finding: ScanFinding = {
  kind: 'reference',
  fromId: 'doc1',
  fromType: 'page',
  fieldPath: 'related',
  refId: 'missing-doc',
}

describe('writeReport', () => {
  it('carries forward acknowledgedKeys whose finding still exists', async () => {
    const key = getFindingKey(finding)
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: [key]}),
      createOrReplace: vi.fn().mockResolvedValue(undefined),
    } as unknown as SanityClient

    await writeReport(client, {...baseResult, findings: [finding]})

    expect(client.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'link-checker-report',
        _type: 'linkCheckerReport',
        acknowledgedKeys: [key],
      }),
    )
  })

  it('drops acknowledgedKeys whose finding no longer exists', async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: ['stale-key']}),
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

/** A fake `client.listen(...)` whose `subscribe` captures the callback so a test can fire it manually. */
function fakeListenClient(fetchImpl: () => Promise<ScanResult | null>) {
  let onMutation: (() => void) | undefined
  const unsubscribe = vi.fn()
  const client = {
    fetch: vi.fn(fetchImpl),
    listen: vi.fn().mockReturnValue({
      subscribe: (cb: () => void) => {
        onMutation = cb
        return {unsubscribe}
      },
    }),
  } as unknown as SanityClient

  return {client, unsubscribe, fireMutation: () => onMutation?.()}
}

describe('observeReport', () => {
  it('emits the current report immediately, with no mutation needed', async () => {
    const {client} = fakeListenClient(async () => baseResult)
    const onReport = vi.fn()

    observeReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(baseResult))
  })

  it('emits null when no report exists yet, rather than never calling back', async () => {
    const {client} = fakeListenClient(async () => null)
    const onReport = vi.fn()

    observeReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(null))
  })

  it('refetches and emits again when a matching document changes', async () => {
    let call = 0
    const {client, fireMutation} = fakeListenClient(async () => ({
      ...baseResult,
      documentsScanned: ++call,
    }))
    const onReport = vi.fn()

    observeReport(client, onReport)
    await vi.waitFor(() =>
      expect(onReport).toHaveBeenCalledWith(expect.objectContaining({documentsScanned: 1})),
    )

    fireMutation()
    await vi.waitFor(() =>
      expect(onReport).toHaveBeenCalledWith(expect.objectContaining({documentsScanned: 2})),
    )
  })

  it('unsubscribes from listen, and stops calling back, once stopped', async () => {
    let call = 0
    const {client, unsubscribe, fireMutation} = fakeListenClient(async () => ({
      ...baseResult,
      documentsScanned: ++call,
    }))
    const onReport = vi.fn()

    const stop = observeReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledTimes(1))

    stop()
    expect(unsubscribe).toHaveBeenCalled()

    fireMutation()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('passes listen the report document id and query-visibility', () => {
    const {client} = fakeListenClient(async () => baseResult)

    observeReport(client, vi.fn())

    expect(client.listen).toHaveBeenCalledWith(
      '*[_id == $id]',
      {id: 'link-checker-report'},
      {visibility: 'query'},
    )
  })
})
