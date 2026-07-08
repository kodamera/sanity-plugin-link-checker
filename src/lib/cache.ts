import type {ScanResult} from './types'

function cacheKey(projectId: string, dataset: string): string {
  return `sanity-plugin-link-checker:${projectId}:${dataset}`
}

export function loadCachedResult(projectId: string, dataset: string): ScanResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(projectId, dataset))
    return raw ? (JSON.parse(raw) as ScanResult) : null
  } catch {
    return null
  }
}

export function saveCachedResult(projectId: string, dataset: string, result: ScanResult): void {
  try {
    localStorage.setItem(cacheKey(projectId, dataset), JSON.stringify(result))
  } catch {
    // localStorage can throw (quota, private mode) - caching is a nice-to-have, not critical.
  }
}
