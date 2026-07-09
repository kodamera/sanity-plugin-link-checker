import type {ScanResult} from './types'

/**
 * Counts what the CLI (and CI gates) should treat as real problems. Reference findings
 * are broken by construction (only non-existent refs are reported), but link findings
 * include 'ok' and 'unverifiable' results too - the Studio shows those in their own tabs,
 * so they must be filtered here rather than at the scan layer.
 */
export function summarizeResult(result: ScanResult): {
  brokenRefs: number
  brokenLinks: number
  unverifiableLinks: number
  issueCount: number
} {
  const brokenRefs = result.findings.filter((f) => f.kind === 'reference').length
  const brokenLinks = result.findings.filter(
    (f) => f.kind === 'link' && f.result.status === 'broken',
  ).length
  const unverifiableLinks = result.findings.filter(
    (f) => f.kind === 'link' && f.result.status === 'unverifiable',
  ).length
  return {brokenRefs, brokenLinks, unverifiableLinks, issueCount: brokenRefs + brokenLinks}
}
