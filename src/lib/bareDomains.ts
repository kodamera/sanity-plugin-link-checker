// Curated common TLD list - NOT the full ~1500-entry IANA registry. Missing an
// obscure/newer TLD here is a false NEGATIVE (this check simply won't flag it),
// the safe failure direction, so completeness is a nice-to-have, not a
// correctness requirement.
//
// Deliberately EXCLUDES a handful of real ccTLDs that collide hard with common
// tech vocabulary and have near-zero real-world use as actual registered
// domains: .js (Jersey, but "Node.js"), .md (Moldova, but "Markdown"/README.md),
// .py (Paraguay, but "script.py"), .sh (Saint Helena, but "install.sh"). For
// this plugin's likely audience (a dev agency's own CMS content), those four
// specific exclusions kill the highest-probability false-positive class.
const COMMON_TLDS = new Set([
  'com',
  'net',
  'org',
  'io',
  'dev',
  'app',
  'co',
  'info',
  'biz',
  'name',
  'pro',
  'tech',
  'xyz',
  'online',
  'site',
  'store',
  'shop',
  'blog',
  'me',
  'tv',
  'cc',
  'ai',
  'edu',
  'gov',
  'se',
  'no',
  'dk',
  'fi',
  'is',
  'uk',
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'be',
  'pt',
  'ch',
  'at',
  'ie',
  'gr',
  'us',
  'ca',
  'au',
  'nz',
  'jp',
  'cn',
  'in',
  'br',
  'ru',
  'kr',
  'mx',
  'za',
])

// Reasonable domain-label shape (alphanumeric + hyphen, no leading/trailing
// hyphen, 1-63 chars) - not exhaustively RFC 1035-correct, but close enough to
// reject the actual false-positive shapes this plan cares about (see plan 026's
// "Current state" for the empirical cases).
const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i

/**
 * True when `value` - taken as a WHOLE string, matching
 * extractPortableTextLinks' existing "the whole string must be the URL"
 * invariant - looks like a domain name with no protocol: dot-separated
 * label shape, ending in a real, allowlisted TLD, no embedded whitespace
 * (which would mean it's prose, not a standalone value). See plan 026's
 * "Why this matters" for the false-positive analysis behind the TLD list.
 */
export function looksLikeBareDomain(value: string): boolean {
  if (/\s/.test(value)) return false
  if (!value.includes('.')) return false
  const labels = value.split('.')
  if (labels.length < 2) return false
  if (!labels.every((label) => LABEL_PATTERN.test(label))) return false
  const tld = labels[labels.length - 1].toLowerCase()
  return COMMON_TLDS.has(tld)
}
