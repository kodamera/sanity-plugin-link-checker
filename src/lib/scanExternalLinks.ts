import {checkUrl as defaultCheckUrl} from './checkUrl'
import {runWithConcurrency} from './concurrencyPool'
import {extractPortableTextLinks, type LinkOccurrence} from './extractPortableTextLinks'
import type {BrokenLink, LinkCheckerPluginConfig, UrlCheckResult} from './types'

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
    'concurrency' | 'timeoutMs' | 'hostDelayMs' | 'checkUrl' | 'excludeUrls'
  >,
  onProgress?: (done: number, total: number) => void,
): Promise<{findings: BrokenLink[]; urlsChecked: number}> {
  const excludeUrls = config.excludeUrls ?? []
  const isExcluded = (url: string) =>
    excludeUrls.some((pattern) =>
      typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
    )
  const occurrences: LinkOccurrence[] = docs
    .flatMap((doc) => extractPortableTextLinks(doc))
    .filter((occ) => !isExcluded(occ.href))

  const uniqueUrls = interleaveByHost(Array.from(new Set(occurrences.map((o) => o.href))))
  if (uniqueUrls.length === 0) {
    return {findings: [], urlsChecked: 0}
  }

  const concurrency = config.concurrency ?? 4
  const timeoutMs = config.timeoutMs ?? 8000
  const baseChecker = config.checkUrl ?? ((url: string) => defaultCheckUrl(url, timeoutMs))
  const checker = withHostPacing(baseChecker, config.hostDelayMs ?? 1000)

  const results = await runWithConcurrency<string, UrlCheckResult>(
    uniqueUrls,
    concurrency,
    150,
    (url) => checker(url),
    onProgress,
  )

  const resultByUrl = new Map<string, UrlCheckResult>(uniqueUrls.map((url, i) => [url, results[i]]))

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

  return {findings, urlsChecked: uniqueUrls.length}
}
