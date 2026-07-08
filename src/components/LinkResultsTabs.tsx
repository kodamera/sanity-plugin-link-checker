import {Stack, Tab, TabList, TabPanel, Text} from '@sanity/ui'
import {type JSX, useState} from 'react'

import {type BrokenLink, getFindingKey, type ScanFinding} from '../lib/types'
import {ResultRow} from './ResultRow'

type LinkTab = 'broken' | 'unverifiable' | 'ok' | 'reviewed'

const TAB_LABEL: Record<LinkTab, string> = {
  broken: 'Broken',
  unverifiable: 'Unverifiable',
  ok: 'OK',
  reviewed: 'Reviewed',
}

const TAB_EMPTY_MESSAGE: Record<LinkTab, string> = {
  broken: 'No broken links.',
  unverifiable: 'No unverifiable links.',
  ok: 'No working links checked yet.',
  reviewed: 'Nothing marked reviewed yet.',
}

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
  const [tab, setTab] = useState<LinkTab>('broken')

  const isReviewed = (f: BrokenLink) => acknowledgedKeys.has(getFindingKey(f))
  const unreviewed = findings.filter((f) => !isReviewed(f))

  // The status tabs (Broken/Unverifiable/OK) only show what still needs attention -
  // reviewed findings move to their own tab regardless of status, as an audit trail.
  const groups: Record<LinkTab, BrokenLink[]> = {
    broken: unreviewed.filter((f) => f.result.status === 'broken'),
    unverifiable: unreviewed.filter((f) => f.result.status === 'unverifiable'),
    ok: unreviewed.filter((f) => f.result.status === 'ok'),
    reviewed: findings.filter(isReviewed),
  }

  const visibleFindings = groups[tab]

  return (
    <Stack space={3}>
      <TabList space={2}>
        {(Object.keys(TAB_LABEL) as LinkTab[]).map((key) => (
          <Tab
            key={key}
            aria-controls={`link-tabpanel-${key}`}
            id={`link-tab-${key}`}
            label={`${TAB_LABEL[key]} (${groups[key].length})`}
            onClick={() => setTab(key)}
            selected={tab === key}
          />
        ))}
      </TabList>

      <TabPanel aria-labelledby={`link-tab-${tab}`} id={`link-tabpanel-${tab}`}>
        <Stack space={2}>
          {visibleFindings.length === 0 && (
            <Text size={1} muted>
              {TAB_EMPTY_MESSAGE[tab]}
            </Text>
          )}
          {visibleFindings.map((finding) => {
            const key = getFindingKey(finding)
            return (
              <ResultRow
                key={key}
                finding={finding}
                title={titles.get(finding.fromId)}
                acknowledged={acknowledgedKeys.has(key)}
                onToggleAcknowledged={() => onToggleAcknowledged(key)}
                editHref={editHref(finding)}
                onOpenEdit={() => onOpenEdit(finding)}
              />
            )
          })}
        </Stack>
      </TabPanel>
    </Stack>
  )
}
