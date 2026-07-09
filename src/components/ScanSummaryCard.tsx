import {Card, Heading, Stack, Text} from '@sanity/ui'
import type {JSX} from 'react'

import type {ScanResult} from '../lib/types'

const SOURCE_LABEL: Record<ScanResult['source'], string> = {
  browser: 'Browser scan',
  cli: 'CLI',
  function: 'Sanity Function',
}

// Sanity UI's typed `gridTemplateColumns` prop only accepts numbers (even fractions), not
// arbitrary CSS like `max-content` - so this is a plain scoped class instead. One shared grid
// for both the meta row and the stat tiles (not two separate Flex rows) is what makes "Scanned
// via" and "Unique URLs" land in the same column: they're literally the same grid track, sized
// to the wider of the two, rather than two independently-sized rows that happen to look close.
// max-content keeps each column exactly as wide as its content needs - no stretching to fill
// whatever the card's width happens to be. Below the breakpoint it's a plain single-column
// stack instead, where cross-row alignment isn't meaningful anyway.
const GRID_CLASS = 'sanity-plugin-link-checker-summary-grid'

function StatTile({value, label}: {value: number; label: string}): JSX.Element {
  return (
    <Stack gap={2}>
      <Heading size={[1, 1, 2]}>{value.toLocaleString()}</Heading>
      <Text size={1} muted>
        {label}
      </Text>
    </Stack>
  )
}

export function ScanSummaryCard({
  issueCount,
  issueBreakdown,
  ranAt,
  source,
  documentsScanned,
  urlsChecked,
  linkInstanceCount,
}: {
  issueCount: number
  issueBreakdown: string | null
  ranAt: string
  source: ScanResult['source']
  documentsScanned: number
  urlsChecked: number
  linkInstanceCount: number
}): JSX.Element {
  return (
    <Card border radius={2} shadow={0} padding={4} tone={issueCount > 0 ? 'caution' : 'positive'}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Heading size={1}>
            {issueCount === 0
              ? 'No issues found'
              : `${issueCount} issue${issueCount === 1 ? '' : 's'} found`}
          </Heading>
          {issueBreakdown && (
            <Text size={1} muted>
              {issueBreakdown}
            </Text>
          )}
        </Stack>

        <style>{`
          .${GRID_CLASS} {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }
          .${GRID_CLASS}-spacer {
            display: none;
          }
          @media (min-width: 900px) {
            .${GRID_CLASS} {
              display: grid;
              grid-template-columns: repeat(3, max-content);
              column-gap: 3rem;
              row-gap: 1.25rem;
              align-items: start;
            }
            .${GRID_CLASS}-spacer {
              display: block;
            }
            .${GRID_CLASS}-divider {
              grid-column: 1 / -1;
            }
          }
        `}</style>
        <div className={GRID_CLASS}>
          <Stack gap={2}>
            <Text size={1} muted>
              Last scan
            </Text>
            <Text size={1}>{new Date(ranAt).toLocaleString()}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size={1} muted>
              Scanned via
            </Text>
            <Text size={1}>{SOURCE_LABEL[source]}</Text>
          </Stack>
          {/* Third cell of the meta row on desktop, completing it so grid auto-flow wraps the
              divider (and then the stats) onto their own row instead of into this one. Hidden
              on mobile, where it isn't part of a grid at all. */}
          <div className={`${GRID_CLASS}-spacer`} />

          <div
            className={`${GRID_CLASS}-divider`}
            style={{borderTop: '1px solid var(--card-border-color)'}}
          />

          <StatTile value={documentsScanned} label="Documents scanned" />
          <StatTile value={urlsChecked} label="Unique URLs" />
          <StatTile value={linkInstanceCount} label="Link instances" />
        </div>
      </Stack>
    </Card>
  )
}
