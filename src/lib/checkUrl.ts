import type {UrlCheckResult} from './types'

async function attemptFetch(url: string, method: 'HEAD' | 'GET', timeoutMs: number) {
  return fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
}

// Node has no window global and no CORS concept at all - a thrown fetch error there is a
// genuine network failure (DNS, connection refused, TLS), never an ambiguous CORS block.
const isNode = typeof window === 'undefined'

/**
 * Checks a single external URL. Browser CORS means a cross-origin response without an
 * `Access-Control-Allow-Origin` header can't be read for its real status code — those
 * cases are classified as `unverifiable` rather than `broken`, since we genuinely can't
 * tell a CORS block apart from a dead host at this layer. In Node (CLI/Function) that
 * ambiguity doesn't exist, so the same failure is classified as `broken` instead.
 */
export async function checkUrl(url: string, timeoutMs = 8000): Promise<UrlCheckResult> {
  try {
    let response: Response
    try {
      response = await attemptFetch(url, 'HEAD', timeoutMs)
      if (response.status === 405 || response.status === 501) {
        response = await attemptFetch(url, 'GET', timeoutMs)
      }
    } catch {
      // Some servers reject HEAD outright (connection-level) - fall back to GET once.
      response = await attemptFetch(url, 'GET', timeoutMs)
    }

    if (!isNode && response.type === 'opaque') {
      return {status: 'unverifiable', reason: 'cors'}
    }

    if (response.status >= 400) {
      return {status: 'broken', httpStatus: response.status, reason: 'http-error'}
    }

    return {status: 'ok', httpStatus: response.status}
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return {status: 'broken', reason: 'timeout'}
    }
    if (isNode) {
      return {status: 'broken', reason: 'network'}
    }
    // A thrown TypeError here is indistinguishable between "CORS blocked" and
    // "genuinely unreachable" from JS - label as unverifiable rather than a false broken.
    return {status: 'unverifiable', reason: 'network'}
  }
}
