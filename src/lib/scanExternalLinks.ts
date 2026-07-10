import {checkUrl as defaultCheckUrl} from './checkUrl'
import {runWithConcurrency} from './concurrencyPool'
import {
  extractPortableTextLinks,
  isUrlShaped,
  type LinkOccurrence,
} from './extractPortableTextLinks'
import {extractUnlinkedUrls} from './extractUnlinkedUrls'
import {isInternalHost} from './internalHosts'
import type {BrokenLink, LinkCheckerPluginConfig, UrlCheckResult} from './types'
import {isMalformedUrl} from './urlSyntax'

/**
 * A check that can flag a URL and produce its UrlCheckResult without ever
 * reaching the network - for values that are guaranteed to fail (or
 * shouldn't be attempted at all) regardless of what's actually listening at
 * that address. Each entry short-circuits scanExternalLinks' network stage
 * for URLs it matches; first match wins (checks are tried in array order).
 */
interface PreflightCheck {
  reason: NonNullable<UrlCheckResult['reason']>
  test: (url: string) => boolean
}

function classifyPreflight(url: string, checks: PreflightCheck[]): UrlCheckResult['reason'] | null {
  for (const check of checks) {
    if (check.test(url)) return check.reason
  }
  return null
}

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

/**
 * Round-robin the URL list across hostnames so requests to the same host never queue
 * back-to-back. Datasets tend to cluster URLs per host (30 LinkedIn profiles in a row),
 * and firing those consecutively is exactly what trips rate limiters (429). Spreading
 * hosts out gives each one breathing room without slowing the overall scan down.
 */
export function interleaveByHost(urls: string[]): string[] {
  const byHost = new Map<string, string[]>()
  for (const url of urls) {
    const host = hostOf(url)
    const bucket = byHost.get(host)
    if (bucket) bucket.push(url)
    else byHost.set(host, [url])
  }

  const buckets = Array.from(byHost.values())
  const interleaved: string[] = []
  for (let i = 0; interleaved.length < urls.length; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) interleaved.push(bucket[i])
    }
  }
  return interleaved
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Wraps a URL checker so two requests to the same host are always at least `delayMs`
 * apart, whatever the pool's global concurrency is doing. Reads and writes to
 * `lastRequestAt` are only interleaved at awaits (single-threaded), so the
 * check-then-set below can't double-admit two waiters of the same host: whichever
 * wakes first re-stamps the host before the other re-checks.
 */
function withHostPacing(
  checker: (url: string) => Promise<UrlCheckResult>,
  delayMs: number,
): (url: string) => Promise<UrlCheckResult> {
  const lastRequestAt = new Map<string, number>()
  return async (url) => {
    const host = hostOf(url)
    for (;;) {
      const last = lastRequestAt.get(host)
      const waitMs = last === undefined ? 0 : last + delayMs - Date.now()
      if (waitMs <= 0) break
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    lastRequestAt.set(host, Date.now())
    return checker(url)
  }
}

export async function scanExternalLinks(
  docs: RawDoc[],
  config: Pick<
    LinkCheckerPluginConfig,
    | 'concurrency'
    | 'timeoutMs'
    | 'hostDelayMs'
    | 'checkUrl'
    | 'excludeUrls'
    | 'skipInternalHostCheck'
    | 'internalHostPatterns'
    | 'detectBareDomains'
    | 'detectUnlinkedUrls'
  >,
  onProgress?: (done: number, total: number) => void,
): Promise<{findings: BrokenLink[]; urlsChecked: number}> {
  const excludeUrls = config.excludeUrls ?? []
  const isExcluded = (url: string) =>
    excludeUrls.some((pattern) =>
      typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
    )
  const occurrences: LinkOccurrence[] = docs
    .flatMap((doc) => extractPortableTextLinks(doc, {detectBareDomains: config.detectBareDomains}))
    .filter((occ) => !isExcluded(occ.href))

  // A structurally separate check - unlinked URLs never went through extractPortableTextLinks
  // (that walk only matches a string's ENTIRE value; these are substrings of prose) and never
  // become uniqueUrls candidates, so they're gathered and short-circuited to a result of their
  // own, same bypass-the-network-stage pattern as bareDomainHrefs below.
  const unlinkedOccurrences = config.detectUnlinkedUrls
    ? docs.flatMap((doc) => extractUnlinkedUrls(doc)).filter((occ) => !isExcluded(occ.href))
    : []

  // Split by whether this occurrence's href is a URL_PATTERN match (goes through the
  // normal uniqueUrls/preflight/network pipeline) or a bare-domain occurrence (short-
  // circuits straight to a result, same as a preflight-flagged URL) - a bare-domain
  // "URL" was never a uniqueUrls candidate for network checking in the first place.
  const bareDomainHrefs = new Set(
    occurrences.filter((occ) => !isUrlShaped(occ.href)).map((occ) => occ.href),
  )

  const uniqueUrls = interleaveByHost(
    Array.from(
      new Set(occurrences.map((o) => o.href).filter((href) => !bareDomainHrefs.has(href))),
    ),
  )
  if (uniqueUrls.length === 0 && bareDomainHrefs.size === 0 && unlinkedOccurrences.length === 0) {
    return {findings: [], urlsChecked: 0}
  }

  // Built per-call (not module-level) since later checks in this list may read from `config`.
  const preflightChecks: PreflightCheck[] = [{reason: 'malformed-url', test: isMalformedUrl}]
  if (!config.skipInternalHostCheck) {
    preflightChecks.push({
      reason: 'internal-host',
      test: (url) => isInternalHost(url, config.internalHostPatterns ?? []),
    })
  }

  const preflightResults = new Map<string, UrlCheckResult['reason']>()
  const urlsToCheck: string[] = []
  for (const url of uniqueUrls) {
    const reason = classifyPreflight(url, preflightChecks)
    if (reason) preflightResults.set(url, reason)
    else urlsToCheck.push(url)
  }

  const concurrency = config.concurrency ?? 4
  const timeoutMs = config.timeoutMs ?? 8000
  const baseChecker = config.checkUrl ?? ((url: string) => defaultCheckUrl(url, timeoutMs))
  const checker = withHostPacing(baseChecker, config.hostDelayMs ?? 1000)

  const results =
    urlsToCheck.length > 0
      ? await runWithConcurrency<string, UrlCheckResult>(
          urlsToCheck,
          concurrency,
          150,
          (url) => checker(url),
          onProgress,
        )
      : []

  const resultByUrl = new Map<string, UrlCheckResult>([
    ...urlsToCheck.map((url, i) => [url, results[i]] as const),
    ...Array.from(preflightResults.entries()).map(
      ([url, reason]) => [url, {status: 'broken', reason} as UrlCheckResult] as const,
    ),
    ...Array.from(bareDomainHrefs).map(
      (href) => [href, {status: 'broken', reason: 'missing-protocol'} as UrlCheckResult] as const,
    ),
  ])

  // Includes 'ok' results too (not just broken/unverifiable) so the Studio tool can show
  // a "Working" tab alongside "Broken"/"Unverifiable".
  const findings: BrokenLink[] = occurrences.map((occ) => ({
    kind: 'link' as const,
    fromId: occ.fromId,
    fromType: occ.fromType,
    fieldPath: occ.fieldPath,
    focusPath: occ.focusPath,
    href: occ.href,
    result: resultByUrl.get(occ.href) as UrlCheckResult,
  }))

  // Unlinked-URL occurrences never went through uniqueUrls/resultByUrl at all (there's
  // nothing to check over the network - the "problem" is the missing link annotation,
  // not the destination), so they're appended as their own separately-sourced findings.
  const unlinkedFindings: BrokenLink[] = unlinkedOccurrences.map((occ) => ({
    kind: 'link' as const,
    fromId: occ.fromId,
    fromType: occ.fromType,
    fieldPath: occ.fieldPath,
    focusPath: occ.focusPath,
    href: occ.href,
    result: {status: 'unverifiable', reason: 'unlinked-url'},
  }))

  return {
    findings: [...findings, ...unlinkedFindings],
    urlsChecked: uniqueUrls.length + bareDomainHrefs.size + unlinkedOccurrences.length,
  }
}
