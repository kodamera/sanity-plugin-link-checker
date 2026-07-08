import type {SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'

import {REPORT_DOC_TYPE} from './reportDocument'
import {scanExternalLinks} from './scanExternalLinks'
import {scanInternalRefs} from './scanInternalRefs'
import {TRIGGER_DOC_TYPE} from './triggerDocument'
import type {DocumentState, LinkCheckerPluginConfig, ScanFinding, ScanResult} from './types'

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

/**
 * Excludes system docs (`_.**`, e.g. `_.schemas...`) but keeps drafts and release versions
 * (`versions.<releaseId>.<id>`), since a dangling reference to/from either is still real.
 *
 * Also excludes our own report/trigger documents - the report stores every finding as
 * `{href: ...}`/`{refId: ...}`, and without this exclusion those would be rediscovered as
 * new findings on every subsequent scan (self-contamination, roughly doubling the count
 * each generation).
 */
const ALL_DOCS_QUERY = `*[!(_id in path("_.**")) && _type != $reportType && _type != $triggerType]`

/**
 * A document with an unpublished draft (or a release version) appears as a second entry in
 * the dataset (`foo`, `drafts.foo`, `versions.summer-sale.foo`, ...). Maps each published id
 * to its edit state so findings can show whether the offending document is only a draft,
 * only published, or published-with-pending-edits.
 */
function buildDocStateMap(docs: RawDoc[]): Map<string, DocumentState> {
  const flags = new Map<string, {hasPublished: boolean; hasUnpublishedChanges: boolean}>()

  for (const doc of docs) {
    const publishedId: string = getPublishedId(DocumentId(doc._id))
    const entry = flags.get(publishedId) ?? {hasPublished: false, hasUnpublishedChanges: false}
    if (doc._id === publishedId) {
      entry.hasPublished = true
    } else {
      entry.hasUnpublishedChanges = true
    }
    flags.set(publishedId, entry)
  }

  const states = new Map<string, DocumentState>()
  for (const [publishedId, {hasPublished, hasUnpublishedChanges}] of flags) {
    if (hasPublished && hasUnpublishedChanges) {
      states.set(publishedId, 'edited')
    } else if (hasPublished) {
      states.set(publishedId, 'published')
    } else {
      states.set(publishedId, 'draft')
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
  docStates: Map<string, DocumentState>,
): ScanFinding[] {
  const seen = new Map<string, ScanFinding>()

  for (const finding of findings) {
    const fromId: string = getPublishedId(DocumentId(finding.fromId))
    const normalized: ScanFinding = {...finding, fromId, docState: docStates.get(fromId)}
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
  onProgress?.('Fetching documents', 0, 1)
  const docs = await client.fetch<RawDoc[]>(ALL_DOCS_QUERY, {
    reportType: REPORT_DOC_TYPE,
    triggerType: TRIGGER_DOC_TYPE,
  })

  onProgress?.('Checking references', 0, 1)
  const brokenRefs = await scanInternalRefs(client, docs)

  const {findings: brokenLinks, urlsChecked} = await scanExternalLinks(
    docs,
    config,
    (done, total) => onProgress?.('Checking external links', done, total),
  )

  const docStates = buildDocStateMap(docs)

  return {
    ranAt: new Date().toISOString(),
    findings: normalizeAndDedupe([...brokenRefs, ...brokenLinks], docStates),
    documentsScanned: docs.length,
    urlsChecked,
    source,
  }
}
