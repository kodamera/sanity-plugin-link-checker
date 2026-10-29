import type {SanityClient} from '@sanity/client'
import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'

import {extractPortableTextLinks} from './extractPortableTextLinks'
import {extractUnlinkedUrls} from './extractUnlinkedUrls'
import {observeReport} from './reportDocument'
import type {ScanFinding, ScanResult} from './types'
import {walkDocument} from './walkDocument'

interface RawDoc {
  _id: string
  _type: string
  _updatedAt?: string
  [key: string]: unknown
}

/**
 * What the dataset looks like now, for the documents a report's findings came from:
 * every version (published, draft, release) of each, with full bodies only where
 * needed, plus which of the findings' reference targets exist.
 */
export interface LiveSnapshot {
  /** `_id`/`_updatedAt` of every current version of every finding's document. */
  versions: Pick<RawDoc, '_id' | '_updatedAt'>[]
  /** Full bodies of every version of each document that has changed since the scan. */
  bodies: RawDoc[]
  /** Which of the findings' reference targets (exact, published or draft id) exist now. */
  existingIds: string[]
}

/** `ok` link findings are never pruned - there's nothing to resolve, and up to 2000 of
 * them would make the live query far bigger than the problems it exists for. */
function isPrunable(finding: ScanFinding): boolean {
  return !(finding.kind === 'link' && finding.result.status === 'ok')
}

/** Parsed, not string-compared: `_updatedAt` has no milliseconds (`...:48Z`) while `ranAt`
 * does (`...:48.000Z`), and `'Z' > '.'` would misorder two times in the same second. */
function changedSince(version: Pick<RawDoc, '_updatedAt'>, ranAt: string): boolean {
  return Boolean(version._updatedAt) && Date.parse(version._updatedAt!) > Date.parse(ranAt)
}

function refExists(refId: string, existingIds: Set<string>): boolean {
  const published: string = getPublishedId(DocumentId(refId))
  const draft: string = getDraftId(DocumentId(published))
  return existingIds.has(refId) || existingIds.has(published) || existingIds.has(draft)
}

function refIdsToCheck(findings: ScanFinding[]): string[] {
  return Array.from(
    new Set(
      findings.flatMap((f) => {
        if (f.kind !== 'reference') return []
        const published: string = getPublishedId(DocumentId(f.refId))
        return [f.refId, published, getDraftId(DocumentId(published))]
      }),
    ),
  )
}

/**
 * Whether `doc` still contains what `finding` was about, by the same rules the scan
 * used to find it. Matches on the URL/target anywhere in the document, never on the
 * finding's field path: a path shifts when an array is reordered, and treating a
 * moved-but-still-broken link as fixed would hide a real problem. The cost runs the
 * safe way - a document with the same dead URL in two places keeps both rows until
 * both are gone.
 */
function docContains(finding: ScanFinding, doc: RawDoc): boolean {
  if (finding.kind === 'reference') {
    let found = false
    walkDocument(doc, [], (value) => {
      if (
        !found &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>)._type === 'reference' &&
        (value as Record<string, unknown>)._ref === finding.refId
      ) {
        found = true
      }
    })
    return found
  }
  // `detectBareDomains` on unconditionally: it only widens what counts as an occurrence,
  // and only an occurrence with this exact href matters - so it can't invent a match,
  // only keep a bare-domain finding from being mistaken for fixed.
  const occurrences =
    finding.result.reason === 'unlinked-url'
      ? extractUnlinkedUrls(doc)
      : extractPortableTextLinks(doc, {detectBareDomains: true})
  return occurrences.some((occ) => occ.href === finding.href)
}

/**
 * Drops findings the dataset has resolved since `report` was scanned - the link was
 * removed, the document deleted, the missing reference target restored - so a fix shows
 * up without a rescan. Decides exactly what a rescan would: a finding stays while ANY
 * version of its document (published, draft, release) still contains it, since the scan
 * reads them all. Removing a link in a draft therefore clears the row once published,
 * not before - the live site still has the dead link until then.
 *
 * A document none of whose versions changed since the scan is kept as-is: its content is
 * what the scan saw. Only new findings need a rescan - this can only ever remove rows.
 */
export function pruneResolvedFindings(report: ScanResult, snapshot: LiveSnapshot): ScanResult {
  const existingIds = new Set(snapshot.existingIds)
  const versionsByDoc = new Map<string, Pick<RawDoc, '_id' | '_updatedAt'>[]>()
  for (const version of snapshot.versions) {
    const publishedId: string = getPublishedId(DocumentId(version._id))
    versionsByDoc.set(publishedId, [...(versionsByDoc.get(publishedId) ?? []), version])
  }
  const bodiesByDoc = new Map<string, RawDoc[]>()
  for (const body of snapshot.bodies) {
    const publishedId: string = getPublishedId(DocumentId(body._id))
    bodiesByDoc.set(publishedId, [...(bodiesByDoc.get(publishedId) ?? []), body])
  }

  const findings = report.findings.filter((finding) => {
    if (!isPrunable(finding)) return true
    if (finding.kind === 'reference' && refExists(finding.refId, existingIds)) return false

    const versions = versionsByDoc.get(finding.fromId) ?? []
    if (versions.length === 0) return false
    const changed = versions.some((v) => changedSince(v, report.ranAt))
    if (!changed) return true

    const bodies = bodiesByDoc.get(finding.fromId)
    // Changed but bodies missing (fetched before the change landed): keep, the
    // next refetch has them.
    if (!bodies || bodies.length < versions.length) return true
    return bodies.some((body) => docContains(finding, body))
  })

  return findings.length === report.findings.length ? report : {...report, findings}
}

/**
 * Every version of the given published ids. Release versions are `versions.<releaseId>.<id>`
 * and a document id may itself contain dots, so the id is everything after the second dot.
 * (GROQ has no open-ended slice, hence the generous upper bound.)
 */
const VERSIONS_FILTER = `(_id in $ids || _id in $draftIds || (_id in path("versions.**") && array::join(string::split(_id, ".")[2..999], ".") in $ids))`

const SNAPSHOT_QUERY = `{
  "versions": *[${VERSIONS_FILTER}]{_id, _updatedAt},
  "existingIds": *[_id in $refIds]._id
}`

const BODIES_QUERY = `*[${VERSIONS_FILTER}]`

/** The listener can't evaluate the id-splitting expression, so it watches every release
 * version and lets the refetch narrow it down - a spurious refetch is cheap. */
const LISTEN_FILTER = `*[_id in $ids || _id in $draftIds || _id in path("versions.**") || _id in $refIds]`

async function fetchSnapshot(
  client: SanityClient,
  report: ScanResult,
  ids: string[],
  refIds: string[],
): Promise<LiveSnapshot> {
  const draftIds = ids.map((id) => getDraftId(DocumentId(id)))
  const {versions, existingIds} = await client.fetch<Omit<LiveSnapshot, 'bodies'>>(SNAPSHOT_QUERY, {
    ids,
    draftIds,
    refIds,
  })
  const changedIds = Array.from(
    new Set(
      versions
        .filter((v) => changedSince(v, report.ranAt))
        .map((v): string => getPublishedId(DocumentId(v._id))),
    ),
  )
  const bodies =
    changedIds.length === 0
      ? []
      : await client.fetch<RawDoc[]>(BODIES_QUERY, {
          ids: changedIds,
          draftIds: changedIds.map((id) => getDraftId(DocumentId(id))),
        })
  return {versions, bodies, existingIds}
}

/**
 * `observeReport`, minus whatever has been fixed since the scan (see
 * `pruneResolvedFindings`): emits the report as it stands now, and again whenever a fresher
 * report is written OR one of its findings' documents (or missing reference targets)
 * changes. A finding only disappears from the emitted report, never from the stored one -
 * the next scan settles it for good.
 *
 * Fails open: if the live check can't run, the report is emitted unpruned, exactly as
 * `observeReport` would. Showing a fixed link for a while beats hiding a broken one.
 */
export function observeLiveReport(
  client: SanityClient,
  onReport: (report: ScanResult | null) => void,
): () => void {
  // Drafts and release versions are part of what the scan read - see runScan.
  const rawClient = client.withConfig({perspective: 'raw'})
  let cancelled = false
  let generation = 0
  let unlistenDocs: (() => void) | undefined

  const watch = (report: ScanResult | null) => {
    const current = ++generation
    unlistenDocs?.()
    unlistenDocs = undefined

    const prunable = report?.findings.filter(isPrunable) ?? []
    if (!report || prunable.length === 0) {
      onReport(report)
      return
    }

    const ids = Array.from(new Set(prunable.map((f) => f.fromId)))
    const refIds = refIdsToCheck(prunable)
    const refresh = () => {
      fetchSnapshot(rawClient, report, ids, refIds)
        .then((snapshot) => pruneResolvedFindings(report, snapshot))
        .catch(() => report)
        .then((pruned) => {
          if (!cancelled && current === generation) onReport(pruned)
        })
    }

    refresh()
    const subscription = rawClient
      .listen(
        LISTEN_FILTER,
        {ids, draftIds: ids.map((id) => getDraftId(DocumentId(id))), refIds},
        {visibility: 'query', includeResult: false, includeAllVersions: true},
      )
      // A dropped listener only means no further live updates; the last emit stands.
      // eslint-disable-next-line no-empty-function
      .subscribe({next: refresh, error: () => {}})
    unlistenDocs = () => subscription.unsubscribe()
  }

  const unlistenReport = observeReport(client, (report) => {
    if (!cancelled) watch(report)
  })

  return () => {
    cancelled = true
    unlistenReport()
    unlistenDocs?.()
  }
}
