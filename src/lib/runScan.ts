import type {SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'

import {REPORT_DOC_TYPE} from './reportDocument'
import {scanExternalLinks} from './scanExternalLinks'
import {scanInternalRefs} from './scanInternalRefs'
import {TRIGGER_DOC_TYPE} from './triggerDocument'
import type {
  DocumentState,
  DocumentStateUpdatedAt,
  LinkCheckerPluginConfig,
  ScanFinding,
  ScanResult,
} from './types'

interface RawDoc {
  _id: string
  _type: string
  _updatedAt?: string
  [key: string]: unknown
}

export const PAGE_SIZE = 500

/**
 * Upper bound on `ok` link findings kept in the stored result. Problem findings
 * (broken/unverifiable/references) are always kept in full - they're the product.
 * `ok` findings only feed the OK tab; past this count they're counted, not stored,
 * so a 50k-link dataset can't produce a multi-MB report document that breaks
 * mutations, listeners, and the localStorage mirror.
 */
export const MAX_OK_FINDINGS = 2000

/**
 * Excludes system docs (`_.**`, e.g. `_.schemas...`) but keeps drafts and release versions
 * (`versions.<releaseId>.<id>`), since a dangling reference to/from either is still real.
 *
 * Also excludes our own report/trigger documents - the report stores every finding as
 * `{href: ...}`/`{refId: ...}`, and without this exclusion those would be rediscovered as
 * new findings on every subsequent scan (self-contamination, roughly doubling the count
 * each generation).
 *
 * Also excludes the whole `sanity.` type namespace: `sanity.imageAsset`/`sanity.fileAsset`
 * carry upstream metadata URLs (e.g. the Unsplash page an image was imported from) that
 * aren't content links, and `sanity.previewUrlSecret` documents (Presentation tool) hold
 * live preview secrets that must never surface in a findings list. Excluding assets from
 * the scan does NOT hide broken references to assets - the existence check in
 * scanInternalRefs queries the dataset directly, not this document set.
 *
 * Paginated by _id cursor: bounds each request's payload so datasets with tens of
 * thousands of documents don't hit response-size limits or hold one giant response
 * in memory at once. _id is unique and totally ordered, so `_id > $lastId` with
 * `order(_id asc)` visits every document exactly once.
 */
const PAGE_QUERY = `*[!(_id in path("_.**")) && !string::startsWith(_type, "sanity.") && _type != $reportType && _type != $triggerType && !(_type in $excludeTypes) && _id > $lastId] | order(_id asc) [0...${PAGE_SIZE}]`

async function fetchAllDocs(
  client: SanityClient,
  excludeTypes: string[],
  onProgress?: (message: string, done: number, total: number) => void,
): Promise<RawDoc[]> {
  const docs: RawDoc[] = []
  let lastId = ''
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await client.fetch<RawDoc[]>(PAGE_QUERY, {
      reportType: REPORT_DOC_TYPE,
      triggerType: TRIGGER_DOC_TYPE,
      excludeTypes,
      lastId,
    })
    docs.push(...page)
    onProgress?.(
      'Fetching documents',
      docs.length,
      docs.length + (page.length === PAGE_SIZE ? 1 : 0),
    )
    if (page.length < PAGE_SIZE) return docs
    lastId = page[page.length - 1]._id
  }
}

/**
 * Drops draft-only documents (no published counterpart anywhere in the dataset) whose last
 * edit is older than the cutoff - abandoned drafts nobody will publish. Drafts/versions of
 * a published document survive regardless of age (the published copy is live and the edits
 * are presumably still heading somewhere), as do fresh drafts and anything undated.
 */
export function filterStaleDrafts(docs: RawDoc[], maxAgeDays: number | undefined): RawDoc[] {
  if (!maxAgeDays || maxAgeDays <= 0) return docs
  const publishedIds = new Set(
    docs.filter((d) => getPublishedId(DocumentId(d._id)) === d._id).map((d) => d._id),
  )
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  return docs.filter((doc) => {
    const publishedId: string = getPublishedId(DocumentId(doc._id))
    if (doc._id === publishedId) return true
    if (publishedIds.has(publishedId)) return true
    if (!doc._updatedAt) return true
    return Date.parse(doc._updatedAt) >= cutoff
  })
}

/**
 * A document with an unpublished draft (or a release version) appears as a second entry in
 * the dataset (`foo`, `drafts.foo`, `versions.summer-sale.foo`, ...). Maps each published id
 * to its edit state so findings can show whether the offending document is only a draft,
 * only published, or published-with-pending-edits.
 */
function latestDate(current: string | undefined, next: string | undefined): string | undefined {
  if (!current) return next
  if (!next) return current
  return next > current ? next : current
}

function buildDocStateMap(
  docs: RawDoc[],
): Map<string, {state: DocumentState; updatedAt: DocumentStateUpdatedAt}> {
  const flags = new Map<
    string,
    {
      draftUpdatedAt?: string
      hasPublished: boolean
      hasUnpublishedChanges: boolean
      publishedUpdatedAt?: string
    }
  >()

  for (const doc of docs) {
    const publishedId: string = getPublishedId(DocumentId(doc._id))
    const entry = flags.get(publishedId) ?? {hasPublished: false, hasUnpublishedChanges: false}
    if (doc._id === publishedId) {
      entry.hasPublished = true
      entry.publishedUpdatedAt = latestDate(entry.publishedUpdatedAt, doc._updatedAt)
    } else {
      entry.hasUnpublishedChanges = true
      entry.draftUpdatedAt = latestDate(entry.draftUpdatedAt, doc._updatedAt)
    }
    flags.set(publishedId, entry)
  }

  const states = new Map<string, {state: DocumentState; updatedAt: DocumentStateUpdatedAt}>()
  for (const [
    publishedId,
    {draftUpdatedAt, hasPublished, hasUnpublishedChanges, publishedUpdatedAt},
  ] of flags) {
    if (hasPublished && hasUnpublishedChanges) {
      states.set(publishedId, {
        state: 'edited',
        updatedAt: {draft: draftUpdatedAt, published: publishedUpdatedAt},
      })
    } else if (hasPublished) {
      states.set(publishedId, {state: 'published', updatedAt: {published: publishedUpdatedAt}})
    } else {
      states.set(publishedId, {state: 'draft', updatedAt: {draft: draftUpdatedAt}})
    }
  }
  return states
}

/**
 * Normalizes each finding's `fromId` to the published id (the one Studio's edit intent
 * understands - see `getPublishedId` from `sanity`), attaches the document's edit state,
 * and collapses duplicate findings that came from a document's draft/version copy carrying
 * the same broken reference/link as its published copy.
 */
function normalizeAndDedupe(
  findings: ScanFinding[],
  docStates: Map<string, {state: DocumentState; updatedAt: DocumentStateUpdatedAt}>,
): ScanFinding[] {
  const seen = new Map<string, ScanFinding>()

  for (const finding of findings) {
    const fromId: string = getPublishedId(DocumentId(finding.fromId))
    const docState = docStates.get(fromId)
    const normalized: ScanFinding = {
      ...finding,
      fromId,
      docState: docState?.state,
      docStateUpdatedAt: docState?.updatedAt,
    }
    const identity = normalized.kind === 'reference' ? normalized.refId : normalized.href
    const key = `${normalized.kind}:${fromId}:${normalized.fieldPath}:${identity}`
    if (!seen.has(key)) {
      seen.set(key, normalized)
    }
  }

  return Array.from(seen.values())
}

export async function runScan(
  client: SanityClient,
  config: LinkCheckerPluginConfig,
  source: ScanResult['source'],
  onProgress?: (message: string, done: number, total: number) => void,
): Promise<ScanResult> {
  // Draft scanning depends on the 'raw' perspective. @sanity/client defaults to raw only
  // for API versions < v2025-02-19 - for newer versions the default is 'published', which
  // silently excludes drafts (and makes the existence check treat every draft-only target
  // as broken). Pin it so draft coverage doesn't hinge on which apiVersion a user picked.
  const rawClient = client.withConfig({perspective: 'raw'})

  const docs = filterStaleDrafts(
    await fetchAllDocs(rawClient, config.excludeTypes ?? [], onProgress),
    config.ignoreDraftsOlderThanDays,
  )

  onProgress?.('Checking references', 0, 1)
  const brokenRefs = await scanInternalRefs(rawClient, docs)

  const {findings: brokenLinks, urlsChecked} = await scanExternalLinks(
    docs,
    config,
    (done, total) => onProgress?.('Checking external links', done, total),
  )

  const docStates = buildDocStateMap(docs)

  const deduped = normalizeAndDedupe([...brokenRefs, ...brokenLinks], docStates)
  const okFindings = deduped.filter((f) => f.kind === 'link' && f.result.status === 'ok')
  const problemFindings = deduped.filter((f) => !(f.kind === 'link' && f.result.status === 'ok'))
  const keptOk = okFindings.slice(0, MAX_OK_FINDINGS)

  return {
    ranAt: new Date().toISOString(),
    findings: [...problemFindings, ...keptOk],
    documentsScanned: docs.length,
    urlsChecked,
    okFindingsTruncated: okFindings.length - keptOk.length || undefined,
    source,
  }
}
