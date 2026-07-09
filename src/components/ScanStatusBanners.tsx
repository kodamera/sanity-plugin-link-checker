import {Button, Card, Flex, Spinner, Text} from '@sanity/ui'
import type {JSX} from 'react'
import {Translate, useTranslation} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'

// Bordered, unfilled boxes (no shadow/tone fill) - matches the calm, hairline-box notices used
// throughout Sanity's own document pane, rather than a loud colored alert banner.

export function ScanProgressBanner({
  message,
  done,
  total,
}: {
  message: string
  done: number
  total: number
}): JSX.Element {
  return (
    <Card padding={4} radius={2} shadow={0} border tone="transparent">
      <Flex align="center" gap={3}>
        <Spinner muted />
        <Text size={1} muted>
          {message}
          {total > 1 ? ` (${done}/${total})` : ''}
        </Text>
      </Flex>
    </Card>
  )
}

export function AwaitingFunctionBanner(): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)

  return (
    <Card padding={4} radius={2} shadow={0} border tone="transparent">
      <Flex align="center" gap={3}>
        <Spinner muted />
        <Text size={1} muted>
          {t('banner.awaiting-function')}
        </Text>
      </Flex>
    </Card>
  )
}

/**
 * Replaces the external-links results while a deployed Document Function is (possibly)
 * rerunning the scan server-side. Browser-run external checks are CORS-noise that the
 * Function's report will overwrite within seconds - showing them first would present
 * known-inaccurate statuses. Internal references are NOT held (the browser computes
 * those accurately). If no Function responds within the timeout, the browser results
 * show after all, with the CORS banner explaining their accuracy.
 */
export function VerifyingLinksPlaceholder(): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)

  return (
    <Card padding={4} radius={2} shadow={0} tone="transparent" border>
      <Flex align="center" gap={3}>
        <Spinner muted />
        <Text size={1} muted>
          {t('banner.verifying-links')}
        </Text>
      </Flex>
    </Card>
  )
}

export function CorsBanner({onDismiss}: {onDismiss: () => void}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)

  return (
    <Card padding={4} radius={2} shadow={0} border tone="transparent">
      <Flex align="flex-start" justify="space-between" gap={4}>
        <Text size={1} muted>
          <Translate
            t={t}
            i18nKey="banner.cors"
            components={{Cli: 'code', Code: 'code', Command: 'code'}}
          />
        </Text>
        <Button
          text={t('banner.dismiss')}
          mode="bleed"
          fontSize={1}
          padding={2}
          onClick={onDismiss}
        />
      </Flex>
    </Card>
  )
}
