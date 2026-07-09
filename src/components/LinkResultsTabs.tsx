import type {JSX} from 'react'

import {type BrokenLink, getFindingKey, type ScanFinding} from '../lib/types'
import {TabbedFindings} from './TabbedFindings'

export function LinkResultsTabs({
  findings,
  titles,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
}: {
  findings: BrokenLink[]
  titles: Map<string, string>
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  editHref: (finding: ScanFinding) => string
  onOpenEdit: (finding: ScanFinding) => void
}): JSX.Element {
  const isResolved = (f: BrokenLink) => acknowledgedKeys.has(getFindingKey(f))
  // The status tabs (Broken/Unverifiable/OK) only show what still needs attention - resolved
  // findings move to their own tab regardless of status, as an audit trail.
  const active = findings.filter((f) => !isResolved(f))

  return (
    <TabbedFindings
      idPrefix="link"
      tabs={[
        {
          key: 'broken',
          label: 'Broken',
          emptyMessage: 'No broken links.',
          items: active.filter((f) => f.result.status === 'broken'),
        },
        {
          key: 'unverifiable',
          label: 'Unverifiable',
          emptyMessage: 'No unverifiable links.',
          items: active.filter((f) => f.result.status === 'unverifiable'),
        },
        {
          key: 'ok',
          label: 'OK',
          emptyMessage: 'No working links checked yet.',
          items: active.filter((f) => f.result.status === 'ok'),
        },
        {
          key: 'resolved',
          label: 'Resolved',
          emptyMessage: 'Nothing resolved yet.',
          items: findings.filter(isResolved),
        },
      ]}
      titles={titles}
      acknowledgedKeys={acknowledgedKeys}
      onToggleAcknowledged={onToggleAcknowledged}
      onOpenEdit={onOpenEdit}
      editHref={editHref}
    />
  )
}
