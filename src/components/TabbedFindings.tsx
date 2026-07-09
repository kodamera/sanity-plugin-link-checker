import {Box, Stack, Tab, TabList, TabPanel, Text} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import type {PreviewDocumentValue} from '../lib/resolvePreviewDocuments'
import {getFindingKey, type ScanFinding} from '../lib/types'
import {type FindingGroup, ResultRow} from './ResultRow'

export interface FindingTabDef<T extends ScanFinding> {
  key: string
  label: string
  emptyMessage: string
  items: T[]
}

interface DocumentGroup {
  docId: string
  groups: FindingGroup[]
}

/**
 * Two-level grouping: one entry per document, and inside it one group per distinct
 * URL/reference (a group carries every finding key for that value, since the same value
 * can occur at several field paths). Editors work through documents to fix, not finding
 * instances - the tab counts and list length both track problem documents.
 */
function groupByDocument(items: ScanFinding[]): DocumentGroup[] {
  const docs = new Map<string, Map<string, FindingGroup>>()
  for (const finding of items) {
    const identity = finding.kind === 'reference' ? finding.refId : finding.href
    const byIdentity = docs.get(finding.fromId) ?? new Map<string, FindingGroup>()
    if (!docs.has(finding.fromId)) docs.set(finding.fromId, byIdentity)
    const group = byIdentity.get(identity)
    if (group) {
      group.keys.push(getFindingKey(finding))
    } else {
      byIdentity.set(identity, {finding, keys: [getFindingKey(finding)]})
    }
  }
  return Array.from(docs.entries()).map(([docId, byIdentity]) => ({
    docId,
    groups: Array.from(byIdentity.values()),
  }))
}

/**
 * Shared tabbed list used by both the "Broken references" and "External links" sections, so
 * an editor sees the same overview pattern (tabs by status, counts in the tab labels) no
 * matter which finding kind they're looking at.
 */
export function TabbedFindings<T extends ScanFinding>({
  idPrefix,
  tabs,
  previewDocuments,
  previewsLoading = false,
  acknowledgedKeys,
  onToggleAcknowledged,
  onOpenEdit,
  onOpenDetails,
  editHref,
}: {
  idPrefix: string
  tabs: FindingTabDef<T>[]
  previewDocuments: Map<string, PreviewDocumentValue>
  previewsLoading?: boolean
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  onOpenEdit: (finding: ScanFinding) => void
  onOpenDetails: (docId: string) => void
  editHref: (finding: ScanFinding) => string
}): JSX.Element {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key)

  const groupedTabs = useMemo(
    () => tabs.map((tab) => ({...tab, docGroups: groupByDocument(tab.items)})),
    [tabs],
  )

  // Named handlers keyed by tab, built once per `tabs` identity - keeps each Tab's onClick a
  // stable reference lookup instead of a fresh inline arrow per tab on every render.
  const tabClickHandlers = useMemo(
    () => Object.fromEntries(tabs.map((t) => [t.key, () => setActiveTabKey(t.key)])),
    [tabs],
  )

  const activeTab = groupedTabs.find((t) => t.key === activeTabKey) ?? groupedTabs[0]

  return (
    <Stack gap={3}>
      {/* Horizontally scrollable within its own box on narrow screens, rather than wrapping
          or forcing the whole page wider - an unwrapped Flex row (TabList) otherwise blows
          out the page's horizontal extent past the viewport. */}
      <Box style={{overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
        <TabList gap={2} style={{width: 'max-content'}}>
          {groupedTabs.map((t) => {
            const handleClick = tabClickHandlers[t.key]
            return (
              <Tab
                key={t.key}
                aria-controls={`${idPrefix}-panel-${t.key}`}
                id={`${idPrefix}-tab-${t.key}`}
                label={`${t.label} (${t.docGroups.length})`}
                onClick={handleClick}
                selected={activeTab.key === t.key}
              />
            )
          })}
        </TabList>
      </Box>

      {/* A little min-height so an empty tab doesn't collapse the whole page height - softens
          the jump when switching from a tall tab to an empty one, without faking scroll space
          that genuinely isn't needed. Kept to roughly two rows' worth. */}
      <TabPanel
        aria-labelledby={`${idPrefix}-tab-${activeTab.key}`}
        id={`${idPrefix}-panel-${activeTab.key}`}
        style={{minHeight: 96}}
      >
        {activeTab.docGroups.length === 0 && (
          // Same padding as a row's own top inset, so the empty message's text sits at the
          // exact spot a row's title would - switching tabs doesn't jump the content start.
          <Box paddingY={4} paddingX={1}>
            <Text size={1} muted>
              {activeTab.emptyMessage}
            </Text>
          </Box>
        )}
        <Stack gap={0} marginTop={2}>
          {activeTab.docGroups.map(({docId, groups}, index) => (
            <ResultRow
              key={docId}
              groups={groups}
              previewDocument={previewDocuments.get(docId)}
              previewLoading={previewsLoading}
              acknowledgedKeys={acknowledgedKeys}
              onToggleAcknowledged={onToggleAcknowledged}
              editHref={editHref}
              onOpenEdit={onOpenEdit}
              onOpenDetails={onOpenDetails}
              showDivider={index < activeTab.docGroups.length - 1}
            />
          ))}
        </Stack>
      </TabPanel>
    </Stack>
  )
}
