import {Button, Card, Flex, Spinner, Text} from '@sanity/ui'
import type {JSX} from 'react'

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
  return (
    <Card padding={4} radius={2} shadow={0} border tone="transparent">
      <Flex align="center" gap={3}>
        <Spinner muted />
        <Text size={1} muted>
          Results above are from the quick browser-side pass. If a Document Function is deployed,
          it&apos;s rerunning the check server-side now (can take a couple of minutes) and will
          replace these automatically when done.
        </Text>
      </Flex>
    </Card>
  )
}

export function CorsBanner({onDismiss}: {onDismiss: () => void}): JSX.Element {
  return (
    <Card padding={4} radius={2} shadow={0} border tone="transparent">
      <Flex align="flex-start" justify="space-between" gap={4}>
        <Text size={1} muted>
          Running without a custom <code>checkUrl</code>: most &ldquo;Unverifiable&rdquo; results
          below are the browser blocking cross-origin status reads (CORS), not necessarily dead
          links. For accurate results, deploy a Document Function (
          <code>npx sanity-plugin-link-checker init-function</code>) so &ldquo;Run scan&rdquo;
          triggers one automatically, or run <code>npx sanity-plugin-link-checker</code> by hand —
          see the plugin README.
        </Text>
        <Button text="Dismiss" mode="bleed" fontSize={1} padding={2} onClick={onDismiss} />
      </Flex>
    </Card>
  )
}
