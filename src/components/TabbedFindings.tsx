import {Box, Stack, Tab, TabList, TabPanel, Text} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import type {PreviewDocumentValue} from '../lib/resolvePreviewDocuments'
import {getFindingKey, type ScanFinding} from '../lib/types'
import {ResultRow} from './ResultRow'

export interface FindingTabDef<T extends ScanFinding> {
  key: string
  label: string
  emptyMessage: string
  items: T[]
}

interface FindingGroup<T extends ScanFinding> {
  finding: T
  keys: string[]
}

/**
 * Collapses occurrences of the same URL/reference within the same document into one row -
 * a page linking to the same dead URL from four blocks is one problem to fix, not four
 * list entries. Each group keeps every member's finding key so resolving the row resolves
 * all of them; the first occurrence's focus path is what the row links to.
 */
function groupFindings<T extends ScanFinding>(items: T[]): FindingGroup<T>[] {
  const groups = new Map<string, FindingGroup<T>>()
  for (const finding of items) {
    const identity = finding.kind === 'reference' ? finding.refId : finding.href
    const groupKey = `${finding.kind}:${finding.fromId}:${identity}`
    const group = groups.get(groupKey)
    if (group) {
      group.keys.push(getFindingKey(finding))
    } else {
      groups.set(groupKey, {finding, keys: [getFindingKey(finding)]})
    }
  }
  return Array.from(groups.values())
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
  acknowledgedKeys,
  onToggleAcknowledged,
  onOpenEdit,
  editHref,
}: {
  idPrefix: string
  tabs: FindingTabDef<T>[]
  previewDocuments: Map<string, PreviewDocumentValue>
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  onOpenEdit: (finding: ScanFinding) => void
  editHref: (finding: ScanFinding) => string
}): JSX.Element {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key)

  const groupedTabs = useMemo(
    () => tabs.map((tab) => ({...tab, groups: groupFindings(tab.items)})),
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
                label={`${t.label} (${t.groups.length})`}
                onClick={handleClick}
                selected={activeTab.key === t.key}
              />
            )
          })}
        </TabList>
      </Box>

      {/* A little min-height so an empty tab doesn't collapse the whole page height - softens
          the jump when switching from a tall tab to an empty one, without faking scroll space
          that genuinely isn't needed. */}
      <TabPanel
        aria-labelledby={`${idPrefix}-tab-${activeTab.key}`}
        id={`${idPrefix}-panel-${activeTab.key}`}
        style={{minHeight: 160}}
      >
        {activeTab.groups.length === 0 && (
          // Same padding as a row's own top inset, so the empty message's text sits at the
          // exact spot a row's title would - switching tabs doesn't jump the content start.
          <Box paddingY={4} paddingX={1}>
            <Text size={1} muted>
              {activeTab.emptyMessage}
            </Text>
          </Box>
        )}
        <Stack gap={0} marginTop={2}>
          {activeTab.groups.map(({finding, keys}, index) => {
            const allAcknowledged = keys.every((k) => acknowledgedKeys.has(k))
            return (
              <ResultRow
                key={keys[0]}
                finding={finding}
                // Resolving a partially-resolved group (possible with pre-grouping report
                // data) only flips the still-unresolved members - toggling every key would
                // invert the mixed state instead of settling it.
                findingKeys={allAcknowledged ? keys : keys.filter((k) => !acknowledgedKeys.has(k))}
                occurrenceCount={keys.length}
                previewDocument={previewDocuments.get(finding.fromId)}
                acknowledged={allAcknowledged}
                onToggleAcknowledged={onToggleAcknowledged}
                editHref={editHref(finding)}
                onOpenEdit={onOpenEdit}
                showDivider={index < activeTab.groups.length - 1}
              />
            )
          })}
        </Stack>
      </TabPanel>
    </Stack>
  )
}
