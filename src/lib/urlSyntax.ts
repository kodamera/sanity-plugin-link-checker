/**
 * True when `url` fails to parse under the same WHATWG URL algorithm every
 * browser and Node itself use - a hard, unambiguous "this can never resolve"
 * signal, not a style/heuristic judgment. Deliberately narrow: the URL parser
 * is lenient about a lot (auto-encodes spaces, accepts trailing punctuation,
 * doesn't validate percent-encoding) - what it DOES reject is a malformed
 * hostname, an invalid port, a bad IPv6 literal, or a truncated URL. See
 * plan 024's "Current state" table for the empirical cases this covers and
 * deliberately doesn't.
 *
 * Callers must only pass strings already known to start with `http://` or
 * `https://` (extractPortableTextLinks guarantees this at extraction time) -
 * this function doesn't re-check the scheme.
 */
export function isMalformedUrl(url: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return false
  } catch {
    return true
  }
}
