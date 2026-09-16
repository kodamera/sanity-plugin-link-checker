import {isProblemFinding, type ScanFinding, type ScanResult} from './types'

function groupKeyOf(finding: ScanFinding): string {
  const identity = finding.kind === 'reference' ? finding.refId : finding.href
  return `${finding.kind}:${finding.fromId}:${identity}`
}

function countDistinct(findings: ScanFinding[]): number {
  return new Set(findings.map(groupKeyOf)).size
}

/**
 * Counts what the CLI (and CI gates) should treat as real problems. Reference findings
 * are broken by construction (only non-existent refs are reported), but link findings
 * include 'ok' and 'unverifiable' results too - the Studio shows those in their own tabs,
 * so they must be filtered here rather than at the scan layer.
 *
 * All counts are DISTINCT problems (same URL/reference in the same document at several
 * field paths counts once), matching how the Studio list groups rows - the CLI, the
 * summary card, and the tabs all speak the same numbers.
 */
export function summarizeResult(result: ScanResult): {
  brokenRefs: number
  brokenLinks: number
  unverifiableLinks: number
  documentsWithIssues: number
  issueCount: number
} {
  const refFindings = result.findings.filter((f) => f.kind === 'reference')
  // `isProblemFinding` (no `includeUnverifiable`) reduces to exactly
  // `status === 'broken'` for a link finding - routed through the shared
  // definition rather than re-checking `.status` inline, so this and any
  // other consumer of `findings` never drift on what "broken" means.
  const brokenLinkFindings = result.findings.filter((f) => f.kind === 'link' && isProblemFinding(f))
  const unverifiableLinkFindings = result.findings.filter(
    (f) => f.kind === 'link' && f.result.status === 'unverifiable',
  )

  const brokenRefs = countDistinct(refFindings)
  const brokenLinks = countDistinct(brokenLinkFindings)
  const documentsWithIssues = new Set([...refFindings, ...brokenLinkFindings].map((f) => f.fromId))
    .size

  return {
    brokenRefs,
    brokenLinks,
    unverifiableLinks: countDistinct(unverifiableLinkFindings),
    documentsWithIssues,
    issueCount: brokenRefs + brokenLinks,
  }
}
