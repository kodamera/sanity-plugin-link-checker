import {Box, Button, Flex, Stack, Text, Tooltip} from '@sanity/ui'
import {type CSSProperties, type JSX, type MouseEvent, useCallback, useState} from 'react'

import {describeFieldPath} from '../lib/humanizeFieldPath'
import {getFindingKey, type ScanFinding} from '../lib/types'
import {DocStateDot, LinkStatusBadge, ReferenceStatusBadge} from './StatusBadge'

const EXIT_ANIMATION_MS = 180

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

// Exactly what Tailwind's line-clamp-1 utility compiles to (per tailwindcss.com/docs/line-clamp):
// overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1.
// Must go on a plain element whose ONLY child is the text itself - Sanity UI's <Text> renders
// its own div with ::before/::after pseudo-elements alongside the text span for its own
// styling, and -webkit-box-orient treats every one of those as a "box child" to lay out, not
// just the wrapped lines of the text. Putting the clamp directly on <Text> (or an ancestor of
// it) means it's clamping the wrong set of children and renders garbled. So this goes on a
// plain <span> nested *inside* <Text> - Text still supplies the typography, the span is fully
// ours and has nothing in it but the text node.
const clampStyle: CSSProperties = {
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 1,
}

// Title is ordinary prose - word-break: break-all would let it snap mid-syllable in rare long
// words for no reason. The subtitle line embeds a raw URL with no spaces, so without break-all
// the browser has no place to wrap it and the clamp never gets a chance to engage before the
// URL just overflows the row width.
const clampStyleUrl: CSSProperties = {
  ...clampStyle,
  wordBreak: 'break-all',
}

export function ResultRow({
  finding,
  title,
  acknowledged,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
  showDivider = true,
}: {
  finding: ScanFinding
  title?: string
  acknowledged: boolean
  onToggleAcknowledged: (key: string) => void
  /** Full URL of the standalone editor - used as the anchor href so cmd/middle-click opens a new tab. */
  editHref: string
  /** Client-side same-tab navigation for a plain left-click. */
  onOpenEdit: (f: ScanFinding) => void
  /** False for the last row in a list, so no trailing hairline is left dangling below it. */
  showDivider?: boolean
}): JSX.Element {
  const brokenValue = finding.kind === 'reference' ? finding.refId : finding.href
  const key = getFindingKey(finding)
  const [leaving, setLeaving] = useState(false)

  // A working link has nothing to fix - only offer the action where there's an actual
  // problem (always true for a dangling reference), or to let someone revert a past mark.
  const isActionable =
    finding.kind === 'reference' || finding.result.status !== 'ok' || acknowledged

  // Fades the row out before it actually leaves the "Active"/"Resolved" tab it's in, instead of
  // it just vanishing mid-list the instant acknowledgedKeys changes and the parent re-filters.
  const handleToggle = useCallback(() => {
    if (prefersReducedMotion()) {
      onToggleAcknowledged(key)
      return
    }
    setLeaving(true)
    window.setTimeout(() => onToggleAcknowledged(key), EXIT_ANIMATION_MS)
  }, [onToggleAcknowledged, key])

  const handleOpen = useCallback(() => onOpenEdit(finding), [onOpenEdit, finding])

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // Let the browser handle modifier/middle clicks natively (open in new tab/window).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return
      }
      event.preventDefault()
      handleOpen()
    },
    [handleOpen],
  )

  return (
    <Box
      paddingY={3}
      style={{
        borderBottom: showDivider ? '1px solid var(--card-border-color)' : undefined,
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'translateX(6px)' : 'translateX(0)',
        transition: `opacity ${EXIT_ANIMATION_MS}ms ease, transform ${EXIT_ANIMATION_MS}ms ease`,
      }}
    >
      <Flex align="center" gap={3}>
        <Stack gap={2} flex={1} style={{minWidth: 0, opacity: acknowledged ? 0.5 : 1}}>
          <a href={editHref} onClick={handleClick} style={{textDecoration: 'none', minWidth: 0}}>
            <Text size={1} weight="medium">
              <span style={clampStyle}>{title ?? `${finding.fromType} (${finding.fromId})`}</span>
            </Text>
          </a>
          <Box title={`${finding.fieldPath} — ${brokenValue}`} style={{minWidth: 0}}>
            <Text size={1} muted>
              <span style={clampStyleUrl}>
                {describeFieldPath(finding.fieldPath)} · {brokenValue}
              </span>
            </Text>
          </Box>
        </Stack>
        {/* One flex group, one gap value, for all three trailing elements - badge, action,
            and dot (anchored last: badge width varies row to row, so the far right edge is
            the only position the dot doesn't drift depending on what the badge says). Tighter
            on mobile, where every pixel back to the title/subtitle column matters more. */}
        <Flex align="center" gap={[2, 2, 3]} style={{flexShrink: 0}}>
          {finding.kind === 'reference' ? (
            <ReferenceStatusBadge />
          ) : (
            <LinkStatusBadge result={finding.result} />
          )}
          {isActionable && (
            // "Resolve"/"Unresolve" - the same pairing GitHub uses on PR review threads for
            // the identical pattern (a flagged item a human confirms they've looked at, which
            // then hides but can be reopened). A button should be an imperative verb, not a
            // question - "Fixed?" read as hesitant rather than a confident action. Tooltip
            // spells out the effect. mode="ghost" (visible outline) instead of "bleed"
            // (invisible until hover) - otherwise this reads as plain text next to the badge.
            <Tooltip
              content={
                <Text size={1}>
                  {acknowledged
                    ? 'Unresolve - move this back to Active.'
                    : "Resolve if you've checked and fixed the link."}
                </Text>
              }
              placement="top"
              portal
            >
              <Button
                text={acknowledged ? 'Unresolve' : 'Resolve'}
                mode="ghost"
                fontSize={1}
                padding={2}
                disabled={leaving}
                onClick={handleToggle}
              />
            </Tooltip>
          )}
          <DocStateDot state={finding.docState} />
        </Flex>
      </Flex>
    </Box>
  )
}
