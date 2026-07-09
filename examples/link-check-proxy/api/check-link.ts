// Example server-side link-check proxy (Vercel Node function shape: default export (req, res)).
// Deploy this anywhere that runs Node (Vercel, Netlify function, a small Express route, etc).
// Wire it up in sanity.config.ts:
//
//   import {linkChecker} from 'sanity-plugin-link-checker'
//
//   linkChecker({
//     checkUrl: async (url) => {
//       const res = await fetch(
//         `https://your-proxy.example.com/api/check-link?url=${encodeURIComponent(url)}`,
//         {headers: {'x-proxy-secret': process.env.SANITY_STUDIO_LINK_PROXY_SECRET ?? ''}},
//       )
//       return res.json()
//     },
//   })
//
// Why this exists: a browser can't read the real HTTP status of a cross-origin request
// unless the target site sends CORS headers (most don't) - see the plugin README. Running
// the fetch server-side sidesteps that entirely and returns real status codes.
//
// This proxy fetches arbitrary user-supplied URLs server-side, which is an SSRF vector if
// left open to the public internet. Guardrails below: only http/https, block loopback /
// private / link-local / cloud-metadata hosts, and an optional shared-secret header - set
// LINK_PROXY_SECRET in your deployment env and pass the same value as `x-proxy-secret` from
// the Studio config above if this proxy is reachable from outside your own network.
// Redirects are never blindly followed: each hop's Location target is re-validated against
// the same protocol/host guardrails before it is fetched, so a same-host redirect to a
// blocked target can't be used to bypass the checks above.
// Known limitation: a public hostname that *resolves* to a private/internal IP is not
// caught here (the check is on the hostname, not the resolved address) - run this proxy in
// an environment without access to internal networks, or add DNS resolution checks if that
// matters for your deployment.

interface ProxyRequest {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

interface ProxyResponse {
  status: (code: number) => ProxyResponse
  json: (body: unknown) => void
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./, // link-local, incl. cloud metadata (169.254.169.254)
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i, // unique local IPv6
  /^\[?::ffff:127\./i, // IPv4-mapped IPv6 loopback
  /^\[?::ffff:(10|192\.168|169\.254)\./i, // IPv4-mapped IPv6 private/link-local
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?fd[0-9a-f]{2}:/i, // unique local IPv6 (fd00::/8 - the fc pattern above only covers fc00-fcff)
]

/**
 * Node's URL parser canonicalizes IPv4-mapped IPv6 literals to compressed hex form
 * (e.g. 'http://[::ffff:127.0.0.1]/' yields hostname '::ffff:7f00:1'), so dotted-decimal
 * patterns never see them. Convert the mapped payload back to dotted decimal so the
 * IPv4 blocklist entries apply.
 */
function normalizeHost(hostname: string): string {
  const unbracketed = hostname.replace(/^\[|\]$/g, '')
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(unbracketed)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    // eslint-disable-next-line no-bitwise
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(unbracketed)
  if (mappedDotted) return mappedDotted[1]
  return unbracketed
}

function isBlockedHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(host))
}

function isBlockedUrl(candidate: URL): boolean {
  return !['http:', 'https:'].includes(candidate.protocol) || isBlockedHost(candidate.hostname)
}

const timeoutMs = 8000
const MAX_REDIRECTS = 5

async function fetchWithGuardedRedirects(
  start: URL,
  method: 'HEAD' | 'GET',
): Promise<Response | 'blocked-redirect' | 'too-many-redirects'> {
  let current = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get('location')
    if (!location) return response
    const next = new URL(location, current) // relative Location is resolved against current
    if (isBlockedUrl(next)) return 'blocked-redirect'
    current = next
  }
  return 'too-many-redirects'
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  const secret = process.env.LINK_PROXY_SECRET
  if (secret && req.headers['x-proxy-secret'] !== secret) {
    res.status(401).json({status: 'unverifiable', reason: 'unauthorized'})
    return
  }

  const rawUrl = req.query?.url
  const url = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl
  if (!url) {
    res.status(400).json({status: 'unverifiable', reason: 'missing url'})
    return
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    res.status(400).json({status: 'broken', reason: 'invalid-url'})
    return
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    res.status(400).json({status: 'unverifiable', reason: 'blocked-host'})
    return
  }

  try {
    let result: Response | 'blocked-redirect' | 'too-many-redirects'
    try {
      result = await fetchWithGuardedRedirects(parsed, 'HEAD')
      if (result instanceof Response && (result.status === 405 || result.status === 501)) {
        result = await fetchWithGuardedRedirects(parsed, 'GET')
      }
    } catch {
      result = await fetchWithGuardedRedirects(parsed, 'GET')
    }

    if (result === 'blocked-redirect') {
      res.status(200).json({status: 'unverifiable', reason: 'blocked-redirect'})
      return
    }

    if (result === 'too-many-redirects') {
      res.status(200).json({status: 'broken', reason: 'too-many-redirects'})
      return
    }

    if (result.status >= 400) {
      res.status(200).json({status: 'broken', httpStatus: result.status, reason: 'http-error'})
      return
    }

    res.status(200).json({status: 'ok', httpStatus: result.status})
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      res.status(200).json({status: 'broken', reason: 'timeout'})
      return
    }
    res.status(200).json({status: 'broken', reason: 'network'})
  }
}
