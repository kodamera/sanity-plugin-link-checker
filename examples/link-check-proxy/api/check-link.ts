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
]

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))
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

  const timeoutMs = 8000

  try {
    let response: Response
    try {
      response = await fetch(parsed.toString(), {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status === 405 || response.status === 501) {
        response = await fetch(parsed.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        })
      }
    } catch {
      response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
    }

    if (response.status >= 400) {
      res.status(200).json({status: 'broken', httpStatus: response.status, reason: 'http-error'})
      return
    }

    res.status(200).json({status: 'ok', httpStatus: response.status})
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      res.status(200).json({status: 'broken', reason: 'timeout'})
      return
    }
    res.status(200).json({status: 'broken', reason: 'network'})
  }
}
