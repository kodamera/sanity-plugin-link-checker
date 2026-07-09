import type {UrlCheckResult} from './types'

// Node has no window global and no CORS concept at all - a thrown fetch error there is a
// genuine network failure (DNS, connection refused, TLS), never an ambiguous CORS block.
const isNode = typeof window === 'undefined'

const NODE_REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent':
    'Mozilla/5.0 (compatible; sanity-plugin-link-checker/1.0; +https://github.com/kodamera/sanity-plugin-link-checker)',
}

// Statuses that auth walls and anti-bot layers return to automated clients regardless of
// whether the page exists for a human visitor: 401/403/407 (auth required), 429 (the
// checker itself got rate-limited), 999 (LinkedIn's blanket bot response). A link behind
// one of these may well be fine in a browser, so it must not be reported as broken.
const BLOCKED_STATUSES = new Set([401, 403, 407, 429, 999])

const RATE_LIMIT_RETRY_DELAY_MS = 2500

async function attemptFetch(url: string, method: 'HEAD' | 'GET', timeoutMs: number) {
  return fetch(url, {
    headers: isNode ? NODE_REQUEST_HEADERS : undefined,
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
}

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
      // Retry blocked statuses too: plenty of servers reject HEAD specifically (403/405)
      // while serving the same URL fine over GET.
      if (
        response.status === 405 ||
        response.status === 501 ||
        BLOCKED_STATUSES.has(response.status)
      ) {
        response = await attemptFetch(url, 'GET', timeoutMs)
      }
    } catch {
      // Some servers reject HEAD outright (connection-level) - fall back to GET once.
      response = await attemptFetch(url, 'GET', timeoutMs)
    }

    if (!isNode && response.type === 'opaque') {
      return {status: 'unverifiable', reason: 'cors'}
    }

    // A 429 is about the checker's request rate, not the link. Give the host a breather
    // and try once more before writing the URL off as rate-limited.
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS))
      response = await attemptFetch(url, 'GET', timeoutMs)
    }

    if (BLOCKED_STATUSES.has(response.status)) {
      return {status: 'unverifiable', httpStatus: response.status, reason: 'blocked'}
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
