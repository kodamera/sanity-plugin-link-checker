import type {JSX} from 'react'
import {useTranslation} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'
import type {PreviewDocumentValue} from '../lib/resolvePreviewDocuments'
import {type BrokenLink, getFindingKey, type ScanFinding} from '../lib/types'
import {TabbedFindings} from './TabbedFindings'

export function LinkResultsTabs({
  findings,
  previewDocuments,
  previewsLoading,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
  onOpenDetails,
  okFindingsTruncated,
}: {
  findings: BrokenLink[]
  previewDocuments: Map<string, PreviewDocumentValue>
  previewsLoading?: boolean
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  editHref: (finding: ScanFinding) => string
  onOpenEdit: (finding: ScanFinding) => void
  onOpenDetails: (docId: string) => void
  /** Count of `ok` findings dropped from the stored report - see ScanResult.okFindingsTruncated.
   * Surfaced as a suffix on the OK tab's label rather than a panel note, so it's visible
   * without touching TabbedFindings' rendering. */
  okFindingsTruncated?: number
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
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
          label: t('tabs.broken'),
          emptyMessage: t('empty.broken-links'),
          items: active.filter((f) => f.result.status === 'broken'),
        },
        {
          key: 'unverifiable',
          label: t('tabs.unverifiable'),
          emptyMessage: t('empty.unverifiable-links'),
          items: active.filter((f) => f.result.status === 'unverifiable'),
        },
        {
          key: 'ok',
          // Suffixed with the truncated count (if any) rather than shown as a separate note -
          // TabbedFindings only renders `label`, and this keeps that shared component untouched.
          label: okFindingsTruncated ? `${t('tabs.ok')} (+${okFindingsTruncated})` : t('tabs.ok'),
          emptyMessage: t('empty.working-links'),
          items: active.filter((f) => f.result.status === 'ok'),
        },
        {
          key: 'resolved',
          label: t('tabs.resolved'),
          emptyMessage: t('empty.resolved'),
          items: findings.filter(isResolved),
        },
      ]}
      previewDocuments={previewDocuments}
      previewsLoading={previewsLoading}
      acknowledgedKeys={acknowledgedKeys}
      onToggleAcknowledged={onToggleAcknowledged}
      onOpenEdit={onOpenEdit}
      onOpenDetails={onOpenDetails}
      editHref={editHref}
    />
  )
}
