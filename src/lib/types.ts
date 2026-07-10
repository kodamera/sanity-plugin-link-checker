export type UrlCheckStatus = 'ok' | 'broken' | 'unverifiable'

export interface UrlCheckResult {
  status: UrlCheckStatus
  /** HTTP status code, when one was actually readable. */
  httpStatus?: number
  reason?:
    'timeout' | 'cors' | 'network' | 'http-error' | 'blocked' | 'malformed-url' | 'missing-protocol'
}

export interface LinkCheckerPluginConfig {
  /** Max concurrent external URL checks. Default: 4 */
  concurrency?: number
  /** Per-request timeout in ms. Default: 8000 */
  timeoutMs?: number
  /**
   * Minimum ms between two requests to the same host. Default: 1000. Slows the scan only
   * where one host dominates the URL list, in exchange for far fewer rate-limit (429)
   * false flags.
   */
  hostDelayMs?: number
  /** API version used for the Sanity client. Default: '2024-01-01' */
  apiVersion?: string
  /** Override how a single URL is checked, e.g. to route through a server-side proxy. */
  checkUrl?: (url: string) => Promise<UrlCheckResult>
  /**
   * Name of the structure tool to open documents in. Default: 'structure'. Only needs
   * changing if the structure tool was renamed via `structureTool({name: '...'})`.
   */
  structureToolName?: string
  /**
   * Additional document types to skip when scanning. Types in the `sanity.` namespace
   * (image/file assets, Presentation preview secrets, ...) are always skipped.
   */
  excludeTypes?: string[]
  /**
   * URLs to skip when checking external links. A string matches as a substring
   * (`'linkedin.com'` skips every LinkedIn URL), a RegExp is tested against the full URL.
   * Use for hosts that block automated checks anyway - the finding would only ever be
   * noise.
   */
  excludeUrls?: (string | RegExp)[]
  /**
   * Skip draft-only documents (never published) whose last edit is older than this many
   * days - abandoned drafts nobody will publish don't need their links fixed. Drafts and
   * versions OF a published document are always scanned regardless of age, and so are
   * fresh drafts. Default: no age limit (all drafts scanned).
   */
  ignoreDraftsOlderThanDays?: number
  /**
   * Also flag string values that look like a domain but are missing the
   * `http://`/`https://` protocol (e.g. a field whose whole value is
   * `example.com`) - invisible to the normal scan otherwise. Off by default:
   * detecting these needs a heuristic (domain-shape + a real-TLD check), and
   * while tuned to avoid the likely false positives for this plugin's
   * audience (see README), it can't be made airtight the way the other
   * syntax checks are. Turn on deliberately, review what it finds.
   */
  detectBareDomains?: boolean
}

/** Publish state of the document a finding came from, at scan time. */
export type DocumentState = 'draft' | 'published' | 'edited'

export interface DocumentStateUpdatedAt {
  draft?: string
  published?: string
}

interface BaseFinding {
  fromId: string
  fromType: string
  /** Human-readable field path, for display (e.g. `richText[10].markDefs[1].customLink`). */
  fieldPath: string
  /** Editor-focus path (e.g. `richText[_key=="a1b2"].markDefs[_key=="c3d4"]`), used to open
   * the document scrolled to the offending field. Absent for older cached reports. */
  focusPath?: string
  docState?: DocumentState
  docStateUpdatedAt?: DocumentStateUpdatedAt
}

export interface BrokenReference extends BaseFinding {
  kind: 'reference'
  refId: string
}

export interface BrokenLink extends BaseFinding {
  kind: 'link'
  href: string
  result: UrlCheckResult
}

export type ScanFinding = BrokenReference | BrokenLink

/**
 * Stable identity for a finding, unaffected by array position - survives re-scans so an
 * "acknowledged" mark on one scan still matches the same finding on the next.
 */
export function getFindingKey(finding: ScanFinding): string {
  const identity = finding.kind === 'reference' ? finding.refId : finding.href
  return `${finding.kind}:${finding.fromId}:${finding.fieldPath}:${identity}`
}

export interface ScanResult {
  ranAt: string
  findings: ScanFinding[]
  documentsScanned: number
  urlsChecked: number
  /**
   * Where this report came from - a live in-Studio scan (CORS-limited for external links),
   * the CLI, or a server-side Document Function (both of the latter run in Node, so their
   * external-link results are fully accurate, not CORS-limited).
   */
  source: 'browser' | 'cli' | 'function'
  /** Keys (see getFindingKey) of findings a user has marked reviewed/fixed - carried forward
   * across scans by writeReport, so re-scanning doesn't keep re-surfacing them. */
  acknowledgedKeys?: string[]
  /** Number of `ok` link findings dropped from `findings` to keep the stored report
   * within Sanity document / localStorage size limits. Problem findings are never
   * dropped. 0 or absent = nothing was dropped. */
  okFindingsTruncated?: number
}
