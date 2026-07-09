import {Badge, Box, Button, Flex, Stack, Text, Tooltip} from '@sanity/ui'
import {
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react'
import {SanityDefaultPreview, useSchema, useTranslation, useValuePreview} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'
import {describeFieldPath} from '../lib/humanizeFieldPath'
import type {PreviewDocumentValue} from '../lib/resolvePreviewDocuments'
import type {ScanFinding, UrlCheckResult} from '../lib/types'
import {DocStateDot, LinkStatusBadge, ReferenceStatusBadge} from './StatusBadge'

const EXIT_ANIMATION_MS = 180

/** One URL/reference within a document, with every finding key it stands for (multiple
 * when the same value occurs at several field paths). */
export interface FindingGroup {
  finding: ScanFinding
  keys: string[]
}

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

// Same drawing conventions as Sanity's own icon set (25x25 viewBox, 1.2 stroke on
// currentColor) but inlined - @sanity/icons is intentionally not a dependency (see
// LinkCheckerIcon.tsx).
function LaunchIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 25 25"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      style={{display: 'block'}}
    >
      <path d="M11.5 7.5H6.5V18.5H17.5V13.5M14.5 5.5H19.5V10.5M19.5 5.5L11.5 13.5" />
    </svg>
  )
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 25 25"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      style={{display: 'block'}}
    >
      <path d="M8 11l4.5 4.5L17 11" />
    </svg>
  )
}

function ChevronUpIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 25 25"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      style={{display: 'block'}}
    >
      <path d="M8 14.5L12.5 10L17 14.5" />
    </svg>
  )
}

/** All keys resolved -> the row/sub-row reads as resolved; toggling settles a mixed group
 * (possible with report data written before grouping existed) instead of inverting it. */
function useResolveToggle(
  keys: string[],
  acknowledgedKeys: Set<string>,
  onToggleAcknowledged: (key: string) => void,
): {acknowledged: boolean; toggle: () => void} {
  const acknowledged = keys.every((k) => acknowledgedKeys.has(k))
  const toggle = useCallback(() => {
    const targets = acknowledged ? keys : keys.filter((k) => !acknowledgedKeys.has(k))
    targets.forEach((k) => onToggleAcknowledged(k))
  }, [acknowledged, keys, acknowledgedKeys, onToggleAcknowledged])
  return {acknowledged, toggle}
}

/** Fades the element out before `onDone` actually removes it from the tab it's in, instead
 * of it just vanishing mid-list the instant acknowledgedKeys changes and the parent
 * re-filters. */
function useLeaving(onDone: () => void): {leaving: boolean; trigger: () => void} {
  const [leaving, setLeaving] = useState(false)
  const trigger = useCallback(() => {
    if (prefersReducedMotion()) {
      onDone()
      return
    }
    setLeaving(true)
    window.setTimeout(onDone, EXIT_ANIMATION_MS)
  }, [onDone])
  return {leaving, trigger}
}

const leavingStyle = (leaving: boolean): CSSProperties => ({
  opacity: leaving ? 0 : 1,
  transform: leaving ? 'translateX(6px)' : 'translateX(0)',
  transition: `opacity ${EXIT_ANIMATION_MS}ms ease, transform ${EXIT_ANIMATION_MS}ms ease`,
})

// Opens the actual URL so an editor can eyeball a "blocked"/"broken" verdict themselves -
// a plain anchor (not window.open) so middle-click and cmd-click behave natively too.
function OpenLinkButton({href}: {href: string}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  return (
    <Tooltip content={<Text size={1}>{t('result.open-link-tooltip')}</Text>} placement="top" portal>
      <Button
        as="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('result.open-link-tooltip')}
        icon={LaunchIcon}
        mode="ghost"
        fontSize={1}
        padding={2}
      />
    </Tooltip>
  )
}

// "Resolve"/"Unresolve" - the same pairing GitHub uses on PR review threads for the
// identical pattern (a flagged item a human confirms they've looked at, which then hides
// but can be reopened). A button should be an imperative verb, not a question - "Fixed?"
// read as hesitant rather than a confident action. Tooltip spells out the effect.
// mode="ghost" (visible outline) instead of "bleed" (invisible until hover) - otherwise
// this reads as plain text next to the badge.
function ResolveButton({
  acknowledged,
  disabled,
  onClick,
}: {
  acknowledged: boolean
  disabled: boolean
  onClick: () => void
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  return (
    <Tooltip
      content={
        <Text size={1}>
          {acknowledged ? t('result.unresolve-tooltip') : t('result.resolve-tooltip')}
        </Text>
      }
      placement="top"
      portal
    >
      <Button
        text={acknowledged ? t('result.unresolve') : t('result.resolve')}
        mode="ghost"
        fontSize={1}
        padding={2}
        disabled={disabled}
        onClick={onClick}
      />
    </Tooltip>
  )
}

function StatusBadgeFor({finding}: {finding: ScanFinding}): JSX.Element {
  return finding.kind === 'reference' ? (
    <ReferenceStatusBadge />
  ) : (
    <LinkStatusBadge result={finding.result} />
  )
}

const CATEGORY_BADGE: Record<
  UrlCheckResult['status'],
  {labelKey: string; tone: 'critical' | 'default' | 'positive'}
> = {
  broken: {labelKey: 'badge.broken', tone: 'critical'},
  unverifiable: {labelKey: 'badge.unverifiable', tone: 'default'},
  ok: {labelKey: 'badge.ok', tone: 'positive'},
}

/**
 * The document row's badge. All of the document's findings showing the same result render
 * that concrete badge (the 404 itself); different results collapse to a category label
 * ("Broken") whose tooltip says to expand for the per-URL codes. A tab only ever mixes
 * results within one status category, so the label is always truthful.
 */
function AggregateStatusBadge({groups}: {groups: FindingGroup[]}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const first = groups[0].finding
  if (first.kind === 'reference') {
    return <ReferenceStatusBadge />
  }
  const results = groups.map((g) => (g.finding.kind === 'link' ? g.finding.result : null))
  const sameResult = results.every(
    (r) =>
      r &&
      r.status === first.result.status &&
      r.httpStatus === first.result.httpStatus &&
      r.reason === first.result.reason,
  )
  if (sameResult) {
    return <LinkStatusBadge result={first.result} />
  }
  const category = CATEGORY_BADGE[first.result.status]
  return (
    <Tooltip content={<Text size={1}>{t('status.mixed-statuses')}</Text>} placement="top" portal>
      <Badge tone={category.tone} fontSize={1}>
        {t(category.labelKey)}
      </Badge>
    </Tooltip>
  )
}

function isActionable(finding: ScanFinding, acknowledged: boolean): boolean {
  // A working link has nothing to fix - only offer the action where there's an actual
  // problem (always true for a dangling reference), or to let someone revert a past mark.
  return finding.kind === 'reference' || finding.result.status !== 'ok' || acknowledged
}

/** Lets the browser handle modifier/middle clicks natively (open in new tab/window),
 * hijacking only a plain left-click for client-side navigation. */
function makeEditClickHandler(onOpen: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    onOpen()
  }
}

/** One URL/reference line under an expanded document row. */
function SubRow({
  group,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
}: {
  group: FindingGroup
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  editHref: (f: ScanFinding) => string
  onOpenEdit: (f: ScanFinding) => void
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const {finding, keys} = group
  const {acknowledged, toggle} = useResolveToggle(keys, acknowledgedKeys, onToggleAcknowledged)
  const {leaving, trigger} = useLeaving(toggle)

  const value = finding.kind === 'reference' ? finding.refId : finding.href
  const label =
    keys.length > 1 ? `${value} · ${t('result.occurrences', {count: keys.length})}` : value

  const handleOpen = useCallback(() => onOpenEdit(finding), [onOpenEdit, finding])
  const handleClick = useMemo(() => makeEditClickHandler(handleOpen), [handleOpen])

  return (
    <Flex
      align="center"
      gap={[2, 2, 3]}
      paddingY={2}
      style={{borderTop: '1px solid var(--card-border-color)', ...leavingStyle(leaving)}}
    >
      <Box
        flex={1}
        title={`${describeFieldPath(finding.fieldPath)} — ${value}`}
        style={{minWidth: 0, opacity: acknowledged ? 0.5 : 1}}
      >
        <Text size={1} muted>
          {/* The value itself links to the document focused at THIS occurrence - each
              sub-row can point at a different field than its siblings. */}
          <a
            href={editHref(finding)}
            onClick={handleClick}
            style={{color: 'inherit', textDecoration: 'none'}}
          >
            <span style={clampStyleUrl}>{label}</span>
          </a>
        </Text>
      </Box>
      <Flex align="center" gap={[2, 2, 3]} style={{flexShrink: 0}}>
        <StatusBadgeFor finding={finding} />
        {finding.kind === 'link' && <OpenLinkButton href={finding.href} />}
        {isActionable(finding, acknowledged) && (
          <ResolveButton acknowledged={acknowledged} disabled={leaving} onClick={trigger} />
        )}
      </Flex>
    </Flex>
  )
}

/**
 * One row per document: a document with a single problem URL/reference renders exactly like
 * a flat finding row (value in the subtitle, actions inline), while a document with several
 * distinct problems shows counts ("3 links · 5 places") and expands into one sub-row per
 * URL/reference. Editors think in documents to fix, not finding instances - this keeps the
 * list length equal to the number of problem documents.
 */
export function ResultRow({
  groups,
  previewDocument,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
  showDivider = true,
}: {
  /** Every URL/reference group belonging to one document (same fromId), length >= 1. */
  groups: FindingGroup[]
  previewDocument?: PreviewDocumentValue
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  /** Builds the full URL of the standalone editor for a finding - used as anchor hrefs so
   * cmd/middle-click opens a new tab. */
  editHref: (f: ScanFinding) => string
  /** Client-side same-tab navigation for a plain left-click. */
  onOpenEdit: (f: ScanFinding) => void
  /** False for the last row in a list, so no trailing hairline is left dangling below it. */
  showDivider?: boolean
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const schema = useSchema()
  const finding = groups[0].finding
  const schemaType = schema.get(finding.fromType)
  const multi = groups.length > 1
  const [expanded, setExpanded] = useState(false)

  const allKeys = useMemo(() => groups.flatMap((g) => g.keys), [groups])
  const {acknowledged, toggle} = useResolveToggle(allKeys, acknowledgedKeys, onToggleAcknowledged)
  const {leaving, trigger} = useLeaving(toggle)
  // Row-level Resolve settles the whole document; offered when anything in it is actionable.
  const anyActionable = acknowledged || groups.some((g) => isActionable(g.finding, false))

  const preview = useValuePreview({
    enabled: Boolean(schemaType && previewDocument),
    schemaType,
    value: previewDocument,
  })
  const previewValue = preview.value as
    {imageUrl?: string; media?: ReactNode; title?: ReactNode} | undefined

  const brokenValue = finding.kind === 'reference' ? finding.refId : finding.href
  const singleSubtitle = t('result.finding-subtitle', {
    fieldPath: describeFieldPath(finding.fieldPath),
    value: brokenValue,
  })
  const placesSuffix =
    allKeys.length > 1 ? ` · ${t('result.occurrences', {count: allKeys.length})}` : ''
  // Document type leads the subtitle - it's an urgency signal (a dead link on a legacy
  // article and one on the flagship landing page are different emergencies). Schema title
  // when defined (already human/locale-friendly), raw type name as fallback.
  const typeLabel = schemaType?.title ?? finding.fromType
  const findingDetail = multi
    ? `${t(finding.kind === 'reference' ? 'result.reference-count' : 'result.link-count', {
        count: groups.length,
      })}${placesSuffix}`
    : `${singleSubtitle}${placesSuffix}`
  const findingSubtitle = `${typeLabel} · ${findingDetail}`
  const hoverTitle = multi
    ? groups
        .map((g) => (g.finding.kind === 'reference' ? g.finding.refId : g.finding.href))
        .join('\n')
    : `${finding.fieldPath} — ${brokenValue}`

  const handleOpen = useCallback(() => onOpenEdit(finding), [onOpenEdit, finding])
  const handleLinkClick = useMemo(() => makeEditClickHandler(handleOpen), [handleOpen])
  const handleToggleExpanded = useCallback(() => setExpanded((v) => !v), [])

  return (
    <Box
      paddingY={3}
      style={{
        borderBottom: showDivider ? '1px solid var(--card-border-color)' : undefined,
        ...leavingStyle(leaving),
      }}
    >
      <Flex align="center" gap={3} style={{position: 'relative', cursor: 'pointer'}}>
        {/* Full-header overlay anchor: the whole header is a link to the document. Sits at
            z-index 1; the trailing controls group at z-index 2 stays hoverable/clickable
            above it (badges and dots included - their tooltips need real hover). */}
        <a
          aria-label={`${finding.fromType} (${finding.fromId})`}
          href={editHref(finding)}
          onClick={handleLinkClick}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
          }}
        />
        <Stack gap={2} flex={1} style={{minWidth: 0, opacity: acknowledged ? 0.5 : 1}}>
          {schemaType && previewDocument ? (
            <Box title={hoverTitle} style={{minWidth: 0}}>
              <SanityDefaultPreview
                icon={schemaType.icon}
                imageUrl={previewValue?.imageUrl}
                isPlaceholder={preview.isLoading}
                media={previewValue?.media}
                title={previewValue?.title ?? `${finding.fromType} (${finding.fromId})`}
                subtitle={<span style={clampStyleUrl}>{findingSubtitle}</span>}
                error={preview.error}
                layout="default"
                withBorder={false}
                withRadius={false}
                withShadow={false}
              />
            </Box>
          ) : (
            <>
              <Text size={1} weight="medium">
                <span style={clampStyle}>{`${finding.fromType} (${finding.fromId})`}</span>
              </Text>
              <Box title={hoverTitle} style={{minWidth: 0}}>
                <Text size={1} muted>
                  <span style={clampStyleUrl}>{findingSubtitle}</span>
                </Text>
              </Box>
            </>
          )}
        </Stack>
        {/* One flex group, one gap value, for all trailing elements - badge, actions, and
            dot (anchored last: badge width varies row to row, so the far right edge is the
            only position the dot doesn't drift depending on what the badge says). Tighter
            on mobile, where every pixel back to the title/subtitle column matters more.
            z-index 2 lifts the whole group above the row's overlay anchor - hover must
            reach the badges for their explanatory tooltips to show. */}
        <Flex
          align="center"
          gap={[2, 2, 3]}
          style={{flexShrink: 0, position: 'relative', zIndex: 2}}
        >
          <AggregateStatusBadge groups={groups} />
          {anyActionable && (
            <ResolveButton acknowledged={acknowledged} disabled={leaving} onClick={trigger} />
          )}
          <Tooltip
            content={<Text size={1}>{expanded ? t('result.collapse') : t('result.expand')}</Text>}
            placement="top"
            portal
          >
            <Button
              aria-expanded={expanded}
              aria-label={expanded ? t('result.collapse') : t('result.expand')}
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              mode="ghost"
              fontSize={1}
              padding={2}
              onClick={handleToggleExpanded}
            />
          </Tooltip>
          <DocStateDot state={finding.docState} updatedAt={finding.docStateUpdatedAt} />
        </Flex>
      </Flex>
      {expanded && (
        <Box marginTop={3} paddingLeft={4}>
          <Stack gap={0}>
            {groups.map((group) => (
              <SubRow
                key={group.keys[0]}
                group={group}
                acknowledgedKeys={acknowledgedKeys}
                onToggleAcknowledged={onToggleAcknowledged}
                editHref={editHref}
                onOpenEdit={onOpenEdit}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}
