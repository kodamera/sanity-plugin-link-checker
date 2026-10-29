import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {type LiveSnapshot, observeLiveReport, pruneResolvedFindings} from './liveReport'
import type {BrokenLink, BrokenReference, ScanResult} from './types'

const RAN_AT = '2026-10-01T12:00:00.000Z'
const BEFORE = '2026-10-01T11:00:00.000Z'
const AFTER = '2026-10-01T13:00:00.000Z'
const DEAD = 'https://example.com/gone'

const link: BrokenLink = {
  kind: 'link',
  fromId: 'article1',
  fromType: 'article',
  fieldPath: 'body[0].markDefs[0].href',
  href: DEAD,
  result: {status: 'broken', httpStatus: 404, reason: 'http-error'},
}

const ref: BrokenReference = {
  kind: 'reference',
  fromId: 'article1',
  fromType: 'article',
  fieldPath: 'related[0]',
  refId: 'deleted-author',
}

function report(...findings: ScanResult['findings']): ScanResult {
  return {ranAt: RAN_AT, findings, documentsScanned: 1, urlsChecked: 1, source: 'cli'}
}

function body(id: string, href?: string, refId?: string) {
  return {
    _id: id,
    _type: 'article',
    _updatedAt: AFTER,
    body: [
      {
        _type: 'block',
        _key: 'b1',
        children: [{_type: 'span', _key: 's1', text: 'Read more', marks: href ? ['m1'] : []}],
        markDefs: href ? [{_type: 'link', _key: 'm1', href}] : [],
      },
    ],
    related: refId ? [{_type: 'reference', _key: 'r1', _ref: refId}] : [],
  }
}

function snapshot(partial: Partial<LiveSnapshot>): LiveSnapshot {
  return {versions: [], bodies: [], existingIds: [], ...partial}
}

describe('pruneResolvedFindings', () => {
  it('keeps a finding whose document has not changed since the scan', () => {
    const result = pruneResolvedFindings(
      report(link),
      snapshot({versions: [{_id: 'article1', _updatedAt: BEFORE}]}),
    )
    expect(result.findings).toEqual([link])
  })

  it('drops a link removed from a document edited after the scan', () => {
    const result = pruneResolvedFindings(
      report(link),
      snapshot({versions: [{_id: 'article1', _updatedAt: AFTER}], bodies: [body('article1')]}),
    )
    expect(result.findings).toEqual([])
  })

  it('keeps a link that is still there after an unrelated edit, even at another path', () => {
    const result = pruneResolvedFindings(
      report({...link, fieldPath: 'somewhere[9].else'}),
      snapshot({
        versions: [{_id: 'article1', _updatedAt: AFTER}],
        bodies: [body('article1', DEAD)],
      }),
    )
    expect(result.findings).toHaveLength(1)
  })

  it('keeps a link removed in a draft while the published version still has it', () => {
    const result = pruneResolvedFindings(
      report(link),
      snapshot({
        versions: [
          {_id: 'article1', _updatedAt: BEFORE},
          {_id: 'drafts.article1', _updatedAt: AFTER},
        ],
        bodies: [{...body('article1', DEAD), _updatedAt: BEFORE}, body('drafts.article1')],
      }),
    )
    expect(result.findings).toHaveLength(1)
  })

  it('keeps a link that only a release version still contains', () => {
    const result = pruneResolvedFindings(
      report(link),
      snapshot({
        versions: [
          {_id: 'article1', _updatedAt: AFTER},
          {_id: 'versions.rSummer.article1', _updatedAt: BEFORE},
        ],
        bodies: [
          body('article1'),
          {...body('versions.rSummer.article1', DEAD), _updatedAt: BEFORE},
        ],
      }),
    )
    expect(result.findings).toHaveLength(1)
  })

  it('keeps a changed document whose bodies have not arrived yet', () => {
    const result = pruneResolvedFindings(
      report(link),
      snapshot({versions: [{_id: 'article1', _updatedAt: AFTER}], bodies: []}),
    )
    expect(result.findings).toHaveLength(1)
  })

  it('drops every finding of a deleted document', () => {
    const result = pruneResolvedFindings(report(link, ref), snapshot({versions: []}))
    expect(result.findings).toEqual([])
  })

  it('drops a broken reference once its target exists again, even with no source edit', () => {
    const result = pruneResolvedFindings(
      report(ref),
      snapshot({
        versions: [{_id: 'article1', _updatedAt: BEFORE}],
        existingIds: ['drafts.deleted-author'],
      }),
    )
    expect(result.findings).toEqual([])
  })

  it('drops a broken reference removed from the document', () => {
    const result = pruneResolvedFindings(
      report(ref),
      snapshot({versions: [{_id: 'article1', _updatedAt: AFTER}], bodies: [body('article1')]}),
    )
    expect(result.findings).toEqual([])
  })

  it('keeps a broken reference the document still holds', () => {
    const result = pruneResolvedFindings(
      report(ref),
      snapshot({
        versions: [{_id: 'article1', _updatedAt: AFTER}],
        bodies: [body('article1', undefined, 'deleted-author')],
      }),
    )
    expect(result.findings).toEqual([ref])
  })

  it('checks an unlinked-url finding against plain text, not link fields', () => {
    const unlinked: BrokenLink = {
      ...link,
      result: {status: 'unverifiable', reason: 'unlinked-url'},
    }
    const withText = {
      ...body('article1'),
      body: [
        {
          _type: 'block',
          _key: 'b1',
          children: [{_type: 'span', _key: 's1', text: `See ${DEAD} for more`, marks: []}],
          markDefs: [],
        },
      ],
    }
    const kept = pruneResolvedFindings(
      report(unlinked),
      snapshot({versions: [{_id: 'article1', _updatedAt: AFTER}], bodies: [withText]}),
    )
    expect(kept.findings).toHaveLength(1)

    const dropped = pruneResolvedFindings(
      report(unlinked),
      snapshot({versions: [{_id: 'article1', _updatedAt: AFTER}], bodies: [body('article1')]}),
    )
    expect(dropped.findings).toEqual([])
  })

  it('never touches ok findings', () => {
    const ok: BrokenLink = {...link, href: 'https://example.com/fine', result: {status: 'ok'}}
    const result = pruneResolvedFindings(report(ok), snapshot({versions: []}))
    expect(result.findings).toEqual([ok])
  })

  it('returns the same report object when nothing was pruned', () => {
    const input = report(link)
    const result = pruneResolvedFindings(
      input,
      snapshot({versions: [{_id: 'article1', _updatedAt: BEFORE}]}),
    )
    expect(result).toBe(input)
  })
})

/**
 * A client whose `fetch` routes by query: the report read, the snapshot query, and the
 * bodies query. `listen` captures one callback per filter so a test can fire either the
 * report listener or the document listener.
 */
function fakeClient(state: {
  report: ScanResult | null
  snapshot: () => Promise<Omit<LiveSnapshot, 'bodies'>>
  bodies?: unknown[]
}) {
  const listeners: Array<{filter: string; next: () => void}> = []
  const client = {
    withConfig: () => client,
    fetch: vi.fn(async (query: string) => {
      if (query.includes('acknowledgedKeys')) return state.report
      if (query.includes('"versions"')) return state.snapshot()
      return state.bodies ?? []
    }),
    listen: vi.fn((filter: string) => ({
      subscribe: (observer: (() => void) | {next: () => void}) => {
        const next = typeof observer === 'function' ? observer : observer.next
        listeners.push({filter, next})
        return {unsubscribe: vi.fn()}
      },
    })),
  } as unknown as SanityClient

  const fire = (match: string) =>
    listeners.filter((l) => l.filter.includes(match)).forEach((l) => l.next())
  return {client, fireReport: () => fire('_id == $id'), fireDocs: () => fire('$refIds')}
}

describe('observeLiveReport', () => {
  it('emits the report pruned of findings fixed since the scan', async () => {
    const {client} = fakeClient({
      report: report(link),
      snapshot: async () => ({versions: [{_id: 'article1', _updatedAt: AFTER}], existingIds: []}),
      bodies: [body('article1')],
    })
    const onReport = vi.fn()

    observeLiveReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(report()))
  })

  it('re-checks when a finding document changes, without a new report', async () => {
    const state = {
      report: report(link),
      snapshot: async () => ({versions: [{_id: 'article1', _updatedAt: BEFORE}], existingIds: []}),
      bodies: [] as unknown[],
    }
    const {client, fireDocs} = fakeClient(state)
    const onReport = vi.fn()

    observeLiveReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(report(link)))

    state.snapshot = async () => ({
      versions: [{_id: 'article1', _updatedAt: AFTER}],
      existingIds: [],
    })
    state.bodies = [body('article1')]
    fireDocs()
    await vi.waitFor(() => expect(onReport).toHaveBeenLastCalledWith(report()))
  })

  it('fails open: emits the stored report unpruned when the live check errors', async () => {
    const {client} = fakeClient({
      report: report(link),
      snapshot: async () => {
        throw new Error('network')
      },
    })
    const onReport = vi.fn()

    observeLiveReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(report(link)))
  })

  it('emits null when no report exists yet', async () => {
    const {client} = fakeClient({
      report: null,
      snapshot: async () => ({versions: [], existingIds: []}),
    })
    const onReport = vi.fn()

    observeLiveReport(client, onReport)
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(null))
  })

  it('stops emitting after unsubscribe', async () => {
    // eslint-disable-next-line no-empty-function
    let release: () => void = () => {}
    const {client} = fakeClient({
      report: report(link),
      snapshot: () =>
        new Promise((resolve) => {
          release = () => resolve({versions: [], existingIds: []})
        }),
    })
    const onReport = vi.fn()

    const stop = observeLiveReport(client, onReport)
    await vi.waitFor(() => expect(client.fetch).toHaveBeenCalledTimes(2))
    stop()
    release()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(onReport).not.toHaveBeenCalled()
  })
})
