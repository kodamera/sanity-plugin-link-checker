import {Card, Heading, Stack, Text} from '@sanity/ui'
import type {JSX} from 'react'
import {useCurrentLocale, useTranslation} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'
import type {ScanResult} from '../lib/types'

const SOURCE_LABEL_KEY: Record<ScanResult['source'], string> = {
  browser: 'summary.source.browser',
  cli: 'summary.source.cli',
  function: 'summary.source.function',
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
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const currentLocale = useCurrentLocale()
  const formattedRanAt = new Intl.DateTimeFormat(currentLocale.id, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ranAt))

  return (
    <Card border radius={2} shadow={0} padding={4} tone={issueCount > 0 ? 'caution' : 'positive'}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Heading size={1}>
            {issueCount === 0
              ? t('summary.no-issues')
              : t('summary.documents-with-issues', {count: issueCount})}
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
              row-gap: 1.5rem;
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
              {t('summary.last-scan')}
            </Text>
            <Text size={1}>{formattedRanAt}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size={1} muted>
              {t('summary.scanned-via')}
            </Text>
            <Text size={1}>{t(SOURCE_LABEL_KEY[source])}</Text>
          </Stack>
          {/* Third cell of the meta row on desktop, completing it so grid auto-flow wraps the
              divider (and then the stats) onto their own row instead of into this one. Hidden
              on mobile, where it isn't part of a grid at all. */}
          <div className={`${GRID_CLASS}-spacer`} />

          <StatTile value={documentsScanned} label={t('summary.documents-scanned')} />
          <StatTile value={urlsChecked} label={t('summary.unique-urls')} />
          <StatTile value={linkInstanceCount} label={t('summary.link-instances')} />
        </div>
      </Stack>
    </Card>
  )
}
