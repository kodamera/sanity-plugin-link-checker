import type {FindingGroup} from '../components/ResultRow'
import {getFindingKey, type ScanFinding} from './types'

/**
 * The inspected document's findings for the Details dialog, grouped exactly like the
 * list rows group them. Problem findings (broken/unverifiable links, dangling
 * references) are what the dialog is for - but when a document has ONLY ok findings
 * (it sits in the OK tab), fall back to showing those instead of rendering nothing:
 * a Details button that silently does nothing reads as broken UI.
 */
export function groupDocFindings(findings: ScanFinding[], docId: string): FindingGroup[] {
  const problems = collect(findings, docId, false)
  if (problems.length > 0) return problems
  return collect(findings, docId, true)
}

function collect(findings: ScanFinding[], docId: string, includeOk: boolean): FindingGroup[] {
  const groups = new Map<string, FindingGroup>()
  for (const finding of findings) {
    if (finding.fromId !== docId) continue
    const isOk = finding.kind === 'link' && finding.result.status === 'ok'
    if (isOk !== includeOk) continue
    const identity = finding.kind === 'reference' ? finding.refId : finding.href
    const group = groups.get(identity)
    if (group) {
      group.keys.push(getFindingKey(finding))
    } else {
      groups.set(identity, {finding, keys: [getFindingKey(finding)]})
    }
  }
  return Array.from(groups.values())
}
