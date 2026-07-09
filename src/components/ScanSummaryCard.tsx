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

/**
 * Three visual levels, one number to react to: the status heading (documents with issues),
 * the type breakdown under it, and a single muted provenance line. Scan-coverage numbers
 * ("764 documents and 480 links checked") stay - they're what makes a "no issues" result
 * believable - but as quiet metadata, not stat tiles competing with the status.
 */
export function ScanSummaryCard({
  issueCount,
  issueBreakdown,
  ranAt,
  source,
  documentsScanned,
  urlsChecked,
}: {
  issueCount: number
  issueBreakdown: string | null
  ranAt: string
  source: ScanResult['source']
  documentsScanned: number
  urlsChecked: number
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const currentLocale = useCurrentLocale()
  const formattedRanAt = new Intl.DateTimeFormat(currentLocale.id, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ranAt))

  const metaLine = [
    `${t('summary.last-scan')}: ${formattedRanAt}`,
    t(SOURCE_LABEL_KEY[source]),
    t('summary.coverage', {
      documents: documentsScanned.toLocaleString(currentLocale.id),
      urls: urlsChecked.toLocaleString(currentLocale.id),
    }),
  ].join(' · ')

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
        <Text size={1} muted>
          {metaLine}
        </Text>
      </Stack>
    </Card>
  )
}
