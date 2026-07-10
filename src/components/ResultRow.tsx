import {
  Badge,
  Box,
  Button,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Text,
  Tooltip,
} from '@sanity/ui'
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

function EllipsisIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 25 25"
      width="1em"
      height="1em"
      fill="currentColor"
      style={{display: 'block'}}
    >
      <circle cx="6.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="12.5" r="1.5" />
      <circle cx="18.5" cy="12.5" r="1.5" />
    </svg>
  )
}

/** All keys resolved -> the row reads as resolved; toggling settles a mixed group
 * (possible with report data written before grouping existed) instead of inverting it. */
export function useResolveToggle(
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
export function OpenLinkButton({href}: {href: string}): JSX.Element {
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
        mode="bleed"
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
export function ResolveButton({
  acknowledged,
  disabled = false,
  onClick,
}: {
  acknowledged: boolean
  disabled?: boolean
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

export function StatusBadgeFor({finding}: {finding: ScanFinding}): JSX.Element {
  return finding.kind === 'reference' ? (
    <ReferenceStatusBadge />
  ) : (
    <LinkStatusBadge result={finding.result} />
  )
}

export function isActionable(finding: ScanFinding, acknowledged: boolean): boolean {
  // A working link has nothing to fix - only offer the action where there's an actual
  // problem (always true for a dangling reference), or to let someone revert a past mark.
  return finding.kind === 'reference' || finding.result.status !== 'ok' || acknowledged
}

// Concrete badges stay legible up to this many distinct results revealed on hover; beyond
// it the remainder collapses into a single "+N" chip rather than a wall of pills.
const MAX_REVEALED_BADGES = 2

// A tab only ever mixes results within one status category (see AggregateStatusBadge's own
// doc comment), so every badge in a cluster always shares this tone - used for the "+N"
// collapsed-state chip, which has no single concrete result of its own to read a tone from.
const TONE_FOR_STATUS: Record<UrlCheckResult['status'], 'critical' | 'default' | 'positive'> = {
  broken: 'critical',
  unverifiable: 'default',
  ok: 'positive',
}

function resultIdentity(r: UrlCheckResult): string {
  return `${r.status}:${r.httpStatus ?? ''}:${r.reason ?? ''}`
}

/**
 * One concrete badge (the first distinct result) plus, when there's more than one distinct
 * result, a "+N" chip - real values only ever appear via hover/focus reveal, never
 * overlapped. Text-length pills don't stack cleanly like fixed-size avatar circles do (a
 * negative-margin overlap tried first here clipped wider labels like "Timeout" against their
 * neighbor) - showing vs. hiding two non-overlapping groups sidesteps that entirely. Devices
 * with no hover (touch) get the revealed group directly via the `lc-badge-stack` CSS in
 * LinkCheckerView - there's no hover gesture to reveal it with.
 */
function StackedStatusBadges({results}: {results: UrlCheckResult[]}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const distinct = Array.from(new Map(results.map((r) => [resultIdentity(r), r])).values())
  const [primary, ...rest] = distinct
  const revealed = rest.slice(0, MAX_REVEALED_BADGES - 1)
  const overflow = rest.length - revealed.length
  const extraCount = distinct.length - 1

  return (
    <span className="lc-badge-stack">
      <LinkStatusBadge result={primary} />
      {extraCount > 0 && (
        <>
          <span className="lc-badge-stack-collapsed">
            <Badge tone={TONE_FOR_STATUS[primary.status]} fontSize={1}>
              +{extraCount}
            </Badge>
          </span>
          <span className="lc-badge-stack-expanded">
            {revealed.map((result) => (
              <LinkStatusBadge result={result} key={resultIdentity(result)} />
            ))}
            {overflow > 0 && (
              <Tooltip
                content={<Text size={1}>{t('status.mixed-statuses')}</Text>}
                placement="top"
                portal
              >
                <Badge tone={TONE_FOR_STATUS[primary.status]} fontSize={1}>
                  +{overflow}
                </Badge>
              </Tooltip>
            )}
          </span>
        </>
      )}
    </span>
  )
}

/**
 * The document row's badge. All of the document's findings showing the same result render
 * that concrete badge (the 404 itself); different results render as a stacked-badge cluster
 * (see StackedStatusBadges) so the actual codes stay visible instead of collapsing into one
 * generic "Broken" label. A tab only ever mixes results within one status category, so every
 * badge in a cluster always shares the same tone.
 */
function AggregateStatusBadge({groups}: {groups: FindingGroup[]}): JSX.Element {
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
  return <StackedStatusBadges results={results.filter((r): r is UrlCheckResult => r !== null)} />
}

/** Lets the browser handle modifier/middle clicks natively (open in new tab/window),
 * hijacking only a plain left-click for client-side navigation. */
export function makeEditClickHandler(
  onOpen: () => void,
): (event: MouseEvent<HTMLAnchorElement>) => void {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    onOpen()
  }
}

/**
 * One row per document, always one line, always the same trailing controls: aggregate
 * status badge, Details (opens the document's URL dialog), Resolve (settles the whole
 * document), doc-state dot. Per-URL specifics live in the Details dialog. Editors think
 * in documents to fix, not finding instances - the list length equals the number of
 * problem documents.
 */
export function ResultRow({
  groups,
  previewDocument,
  previewLoading = false,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onOpenEdit,
  onOpenDetails,
  showDivider = true,
}: {
  /** Every URL/reference group belonging to one document (same fromId), length >= 1. */
  groups: FindingGroup[]
  previewDocument?: PreviewDocumentValue
  /** True while the preview-documents batch is still resolving - renders the native
   * skeleton instead of flashing the raw type/id fallback and reflowing when data lands. */
  previewLoading?: boolean
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  /** Builds the full URL of the standalone editor for a finding - used as anchor hrefs so
   * cmd/middle-click opens a new tab. `focus: false` skips field focus. */
  editHref: (f: ScanFinding, focus?: boolean) => string
  /** Client-side same-tab navigation for a plain left-click. */
  onOpenEdit: (f: ScanFinding, focus?: boolean) => void
  /** Opens the document's Details dialog. */
  onOpenDetails: (docId: string) => void
  /** False for the last row in a list, so no trailing hairline is left dangling below it. */
  showDivider?: boolean
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const schema = useSchema()
  const finding = groups[0].finding
  const schemaType = schema.get(finding.fromType)
  const multi = groups.length > 1

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

  // A single-problem row targets the exact field instance (unambiguous); a multi-problem
  // row opens the document without focus - focusing any one of its instances would be
  // arbitrary. The per-instance focus links live in the Details dialog.
  const focusOnOpen = !multi
  const handleOpen = useCallback(
    () => onOpenEdit(finding, focusOnOpen),
    [onOpenEdit, finding, focusOnOpen],
  )
  const handleLinkClick = useMemo(() => makeEditClickHandler(handleOpen), [handleOpen])
  const handleDetails = useCallback(
    () => onOpenDetails(finding.fromId),
    [onOpenDetails, finding.fromId],
  )

  return (
    // Bleed pattern (same as Studio pane items): the hover background extends 8px past the
    // content on both sides (negative margin + matching inner padding). Content alignment
    // with the rest of the page is unchanged.
    <Box
      className="lc-row"
      style={{
        margin: '0 -8px',
        padding: '0 8px',
        borderRadius: 3,
        ...leavingStyle(leaving),
      }}
    >
      {/* Divider at reduced strength - separation without the grid feel of full-strength
          hairlines. Sits on the inner element so it spans content width, not the bleed. */}
      <Box
        style={{
          borderBottom: showDivider
            ? '1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent)'
            : undefined,
        }}
      >
        <Flex align="center" gap={3} style={{position: 'relative', cursor: 'pointer'}}>
          {/* Full-row overlay anchor: the whole row is a link to the document. Sits at
            z-index 1; the trailing controls group at z-index 2 stays hoverable/clickable
            above it (badges and dots included - their tooltips need real hover). */}
          <a
            aria-label={`${finding.fromType} (${finding.fromId})`}
            href={editHref(finding, focusOnOpen)}
            onClick={handleLinkClick}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
            }}
          />
          <Stack gap={2} flex={1} style={{minWidth: 0, opacity: acknowledged ? 0.5 : 1}}>
            {schemaType && (previewDocument || previewLoading) ? (
              <Box title={hoverTitle} className="lc-row-preview" style={{minWidth: 0}}>
                <SanityDefaultPreview
                  icon={schemaType.icon}
                  imageUrl={previewValue?.imageUrl}
                  isPlaceholder={preview.isLoading || (previewLoading && !previewDocument)}
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
            {/* Two text buttons eat half a phone screen and truncate every title - below
              the 600px breakpoint they collapse into one overflow menu. The badge and
              doc-state dot stay: they're the signal an editor scans the list by. */}
            <Box display={['none', 'none', 'block']}>
              <Flex align="center" gap={[2, 2, 3]}>
                <Button
                  text={t('result.details')}
                  mode="ghost"
                  fontSize={1}
                  padding={2}
                  onClick={handleDetails}
                />
                {anyActionable && (
                  <ResolveButton acknowledged={acknowledged} disabled={leaving} onClick={trigger} />
                )}
              </Flex>
            </Box>
            <Box display={['block', 'block', 'none']}>
              <MenuButton
                button={
                  <Button
                    aria-label={t('result.more-actions')}
                    icon={EllipsisIcon}
                    mode="bleed"
                    fontSize={1}
                    padding={2}
                  />
                }
                id={`lc-row-menu-${finding.fromId}`}
                menu={
                  <Menu>
                    <MenuItem text={t('result.details')} onClick={handleDetails} />
                    {anyActionable && (
                      <MenuItem
                        text={acknowledged ? t('result.unresolve') : t('result.resolve')}
                        disabled={leaving}
                        onClick={trigger}
                      />
                    )}
                  </Menu>
                }
                popover={{portal: true, placement: 'bottom-end'}}
              />
            </Box>
            <DocStateDot state={finding.docState} updatedAt={finding.docStateUpdatedAt} />
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}
