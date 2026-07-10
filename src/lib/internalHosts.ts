// Loopback (127.0.0.0/8), the three RFC 1918 private ranges, link-local
// (169.254.0.0/16, RFC 3927), and localhost/mDNS by name. Anything matching
// one of these is categorically not a public-facing address - nobody
// intentionally publishes a link to one, so there's no real false-positive
// risk in flagging every match by default.
const RESERVED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
]

// 172.16.0.0/12 spans a numeric range (172.16.x.x through 172.31.x.x) that a
// fixed-prefix regex can't express cleanly - needs an actual number comparison.
function isPrivateClassB172(hostname: string): boolean {
  const match = hostname.match(/^172\.(\d{1,3})\./)
  if (!match) return false
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

/**
 * True when `url`'s hostname is a loopback/private/link-local address (IPv4
 * only - see plan 025's Scope for why IPv6 is deliberately not covered), or
 * matches one of the caller-supplied extra patterns (project-specific
 * staging hostnames, say). Malformed URLs return false here - that's a
 * different check's job (see plan 024, isMalformedUrl), and this function
 * shouldn't throw or double-report on something already flagged elsewhere.
 */
export function isInternalHost(url: string, extraPatterns: (string | RegExp)[] = []): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }
  if (RESERVED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return true
  if (isPrivateClassB172(hostname)) return true
  return extraPatterns.some((pattern) =>
    typeof pattern === 'string' ? hostname.includes(pattern) : pattern.test(hostname),
  )
}
