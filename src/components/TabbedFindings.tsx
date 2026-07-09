import {Box, Stack, Tab, TabList, TabPanel, Text} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import {getFindingKey, type ScanFinding} from '../lib/types'
import {ResultRow} from './ResultRow'

export interface FindingTabDef<T extends ScanFinding> {
  key: string
  label: string
  emptyMessage: string
  items: T[]
}

/**
 * Shared tabbed list used by both the "Broken references" and "External links" sections, so
 * an editor sees the same overview pattern (tabs by status, counts in the tab labels) no
 * matter which finding kind they're looking at.
 */
export function TabbedFindings<T extends ScanFinding>({
  idPrefix,
  tabs,
  titles,
  acknowledgedKeys,
  onToggleAcknowledged,
  onOpenEdit,
  editHref,
}: {
  idPrefix: string
  tabs: FindingTabDef<T>[]
  titles: Map<string, string>
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  onOpenEdit: (finding: ScanFinding) => void
  editHref: (finding: ScanFinding) => string
}): JSX.Element {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key)

  // Named handlers keyed by tab, built once per `tabs` identity - keeps each Tab's onClick a
  // stable reference lookup instead of a fresh inline arrow per tab on every render.
  const tabClickHandlers = useMemo(
    () => Object.fromEntries(tabs.map((t) => [t.key, () => setActiveTabKey(t.key)])),
    [tabs],
  )

  const activeTab = tabs.find((t) => t.key === activeTabKey) ?? tabs[0]

  return (
    <Stack gap={3}>
      {/* Horizontally scrollable within its own box on narrow screens, rather than wrapping
          or forcing the whole page wider - an unwrapped Flex row (TabList) otherwise blows
          out the page's horizontal extent past the viewport. */}
      <Box style={{overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
        <TabList gap={2} style={{width: 'max-content'}}>
          {tabs.map((t) => {
            const handleClick = tabClickHandlers[t.key]
            return (
              <Tab
                key={t.key}
                aria-controls={`${idPrefix}-panel-${t.key}`}
                id={`${idPrefix}-tab-${t.key}`}
                label={`${t.label} (${t.items.length})`}
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
        {activeTab.items.length === 0 && (
          // Same padding as a row's own top inset, so the empty message's text sits at the
          // exact spot a row's title would - switching tabs doesn't jump the content start.
          <Box paddingY={4} paddingX={1}>
            <Text size={1} muted>
              {activeTab.emptyMessage}
            </Text>
          </Box>
        )}
        <Stack gap={0} marginTop={2}>
          {activeTab.items.map((finding, index) => {
            const key = getFindingKey(finding)
            return (
              <ResultRow
                key={key}
                finding={finding}
                title={titles.get(finding.fromId)}
                acknowledged={acknowledgedKeys.has(key)}
                onToggleAcknowledged={onToggleAcknowledged}
                editHref={editHref(finding)}
                onOpenEdit={onOpenEdit}
                showDivider={index < activeTab.items.length - 1}
              />
            )
          })}
        </Stack>
      </TabPanel>
    </Stack>
  )
}
