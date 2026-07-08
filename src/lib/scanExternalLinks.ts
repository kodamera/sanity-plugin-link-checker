import {checkUrl as defaultCheckUrl} from './checkUrl'
import {runWithConcurrency} from './concurrencyPool'
import {extractPortableTextLinks, type LinkOccurrence} from './extractPortableTextLinks'
import type {BrokenLink, LinkCheckerPluginConfig, UrlCheckResult} from './types'

interface RawDoc {
  _id: string
  _type: string
  [key: string]: unknown
}

export async function scanExternalLinks(
  docs: RawDoc[],
  config: Pick<LinkCheckerPluginConfig, 'concurrency' | 'timeoutMs' | 'checkUrl'>,
  onProgress?: (done: number, total: number) => void,
): Promise<{findings: BrokenLink[]; urlsChecked: number}> {
  const occurrences: LinkOccurrence[] = docs.flatMap((doc) => extractPortableTextLinks(doc))

  const uniqueUrls = Array.from(new Set(occurrences.map((o) => o.href)))
  if (uniqueUrls.length === 0) {
    return {findings: [], urlsChecked: 0}
  }

  const concurrency = config.concurrency ?? 4
  const timeoutMs = config.timeoutMs ?? 8000
  const checker = config.checkUrl ?? ((url: string) => defaultCheckUrl(url, timeoutMs))

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
