import {Button, Card, Flex, Stack, Text} from '@sanity/ui'
import type {JSX, MouseEvent} from 'react'

import type {ScanFinding} from '../lib/types'
import {DocStateBadge, LinkStatusBadge, ReferenceStatusBadge} from './StatusBadge'

export function ResultRow({
  finding,
  title,
  acknowledged,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
}: {
  finding: ScanFinding
  title?: string
  acknowledged: boolean
  onToggleAcknowledged: () => void
  /** Full URL of the standalone editor - used as the anchor href so cmd/middle-click opens a new tab. */
  editHref: string
  /** Client-side same-tab navigation for a plain left-click. */
  onOpenEdit: () => void
}): JSX.Element {
  const brokenValue = finding.kind === 'reference' ? finding.refId : finding.href

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modifier/middle clicks natively (open in new tab/window).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    onOpenEdit()
  }

  return (
    <Card padding={3} radius={2} shadow={1} tone={acknowledged ? 'transparent' : undefined}>
      <Flex align="center" justify="space-between" gap={3}>
        <Stack space={2} flex={1} style={acknowledged ? {opacity: 0.6} : undefined}>
          <Flex align="center" gap={2}>
            <a href={editHref} onClick={handleClick} style={{textDecoration: 'none'}}>
              <Text weight="semibold">{title ?? `${finding.fromType} (${finding.fromId})`}</Text>
            </a>
            <DocStateBadge state={finding.docState} />
          </Flex>
          <Text size={1} muted>
            {finding.fieldPath}
          </Text>
          <Text size={1} muted style={{wordBreak: 'break-all'}}>
            {brokenValue}
          </Text>
        </Stack>
        <Flex align="center" gap={2}>
          {finding.kind === 'reference' ? (
            <ReferenceStatusBadge />
          ) : (
            <LinkStatusBadge result={finding.result} />
          )}
          <Button
            text={acknowledged ? 'Unmark reviewed' : 'Mark reviewed'}
            mode="bleed"
            fontSize={1}
            padding={2}
            onClick={onToggleAcknowledged}
          />
        </Flex>
      </Flex>
    </Card>
  )
}
