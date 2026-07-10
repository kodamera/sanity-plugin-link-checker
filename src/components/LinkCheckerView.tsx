import {Box, Button, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef} from 'react'
import {Translate, useClient, useTranslation, useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

import {linkCheckerLocaleNamespace} from '../i18n'
import {buildEditPath} from '../lib/editRoute'
import {groupDocFindings} from '../lib/groupDocFindings'
import {
  getFindingKey,
  type LinkCheckerPluginConfig,
  type ScanFinding,
  type ScanResult,
} from '../lib/types'
import {DocumentDialog} from './DocumentDialog'
import {useScanReport} from './hooks/useScanReport'
import {useScanRunner} from './hooks/useScanRunner'
import {LinkResultsTabs} from './LinkResultsTabs'
import {
  AwaitingFunctionBanner,
  CorsBanner,
  PreviousResultsBanner,
  ScanProgressBanner,
  VerifyingLinksPlaceholder,
} from './ScanStatusBanners'
import {ScanSummaryCard} from './ScanSummaryCard'
import {TabbedFindings} from './TabbedFindings'

const API_VERSION = '2024-01-01'

/**
 * All headline numbers speak the same language as the result list: the heading counts
 * problem DOCUMENTS (like the tabs), the breakdown counts DISTINCT broken links/references
 * (like the expanded sub-rows) - never raw per-field occurrences.
 */
function summarizeHeadline(
  activeBrokenRefs: ScanFinding[],
  activeBrokenLinks: ScanFinding[],
  t: (key: string, values?: Record<string, number>) => string,
): {issueCount: number; issueBreakdown: string | null; distinctBrokenRefs: number} {
  const groupKeyOf = (f: ScanFinding) =>
    `${f.kind}:${f.fromId}:${f.kind === 'reference' ? f.refId : f.href}`
  const issueCount = new Set([...activeBrokenRefs, ...activeBrokenLinks].map((f) => f.fromId)).size
  const distinctBrokenRefs = new Set(activeBrokenRefs.map(groupKeyOf)).size
  const distinctBrokenLinks = new Set(activeBrokenLinks.map(groupKeyOf)).size
  const breakdownParts = [
    distinctBrokenLinks > 0 ? t('findings.broken-links', {count: distinctBrokenLinks}) : null,
    distinctBrokenRefs > 0 ? t('findings.broken-references', {count: distinctBrokenRefs}) : null,
  ].filter(Boolean)
  return {
    issueCount,
    issueBreakdown: breakdownParts.length > 0 ? breakdownParts.join(' · ') : null,
    distinctBrokenRefs,
  }
}

/** Local, subtle stand-in for the global summary card while it's suppressed
 * (holdingExternalLinks - see ScanSummaryCard's own render condition): the reference check
 * itself is already complete and accurate, it just shouldn't be framed as a whole-scan
 * verdict until links finish too. Own component so its branch doesn't count against
 * LinkCheckerView's own complexity budget. */
function RefsSubtitle({
  holdingExternalLinks,
  distinctBrokenRefs,
  t,
}: {
  holdingExternalLinks: boolean
  distinctBrokenRefs: number
  t: (key: string, values?: Record<string, number>) => string
}): JSX.Element | null {
  if (!holdingExternalLinks || distinctBrokenRefs === 0) return null
  return (
    <Text size={1} muted>
      {t('findings.broken-references', {count: distinctBrokenRefs})}
    </Text>
  )
}

/** Suppressed while holdingExternalLinks: a browser-only result's headline counts are
 * provisional (unverifiable links may resolve to broken once the Function replaces this
 * result), so a confident-looking number here would be misleading for the ~90s window it's
 * live. The pending banner below already covers this case; a previous, complete result
 * stays visible via the separate showingPreviousResults dim-not-hide path (unaffected
 * here). Own component so its branch doesn't count against LinkCheckerView's complexity
 * budget. */
function MaybeScanSummaryCard({
  result,
  holdingExternalLinks,
  issueCount,
  issueBreakdown,
}: {
  result: ScanResult | null
  holdingExternalLinks: boolean
  issueCount: number
  issueBreakdown: string | null
}): JSX.Element | null {
  if (!result || holdingExternalLinks) return null
  return (
    <ScanSummaryCard
      issueCount={issueCount}
      issueBreakdown={issueBreakdown}
      ranAt={result.ranAt}
      source={result.source}
      documentsScanned={result.documentsScanned}
      urlsChecked={result.urlsChecked}
    />
  )
}

function DatasetName({children}: {children?: ReactNode}): JSX.Element {
  return (
    <strong>
      <i>{children}</i>
    </strong>
  )
}

export function LinkCheckerView(props: {config?: LinkCheckerPluginConfig}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const config = useMemo(() => props.config ?? {}, [props.config])
  const client = useClient({apiVersion: config.apiVersion ?? API_VERSION})
  const {dataset} = client.config()
  const router = useRouter()
  const {basePath} = useWorkspace()
  const structureToolName = config.structureToolName ?? 'structure'

  // `focus: false` opens the document without field focus - used when a row stands for
  // several link instances and focusing any single one of them would be arbitrary.
  const editHref = useCallback(
    (finding: ScanFinding, focus = true) =>
      buildEditPath({
        basePath,
        structureToolName,
        documentId: finding.fromId,
        documentType: finding.fromType,
        focusPath: focus ? finding.focusPath : undefined,
      }),
    [basePath, structureToolName],
  )

  // Opens the document's standalone editor pane in the current tab, bypassing edit-intent
  // resolution (which can nest it under an unrelated parent pane).
  const handleOpenEdit = useCallback(
    (finding: ScanFinding, focus = true) => {
      router.navigateUrl({path: editHref(finding, focus)})
    },
    [router, editHref],
  )

  // Which document's Details dialog is open lives in the tool's router state
  // (/doc/:inspectDocId) rather than useState - refresh restores the dialog, the browser
  // back button closes it, and the URL is shareable with a teammate.
  const inspectDocId = (router.state as {inspectDocId?: string}).inspectDocId
  const handleOpenDetails = useCallback(
    (docId: string) => router.navigate({inspectDocId: docId}),
    [router],
  )
  const handleCloseDetails = useCallback(() => router.navigate({}), [router])

  // listener fires from useScanReport; runner state lives in useScanRunner - a ref bridges
  // without re-subscribing (see the wiring after useScanRunner below).
  const clearAwaitingRef = useRef<(() => void) | null>(null)
  const {
    result,
    persistResult,
    acknowledgedKeys,
    handleToggleAcknowledged,
    previewDocuments,
    previewsLoading,
    bannerDismissed,
    handleDismissBanner,
  } = useScanReport(client, () => clearAwaitingRef.current?.())
  const {scanning, progress, awaitingFunction, clearAwaiting, handleRunScan} = useScanRunner({
    client,
    config,
    persistResult,
  })
  // Refs must not be written during render - `clearAwaiting` is a stable useCallback
  // reference, so this effect runs once on mount (and again only if it ever changes).
  useEffect(() => {
    clearAwaitingRef.current = clearAwaiting
  }, [clearAwaiting])

  const brokenRefs = useMemo(
    () => result?.findings.filter((f) => f.kind === 'reference') ?? [],
    [result],
  )
  const activeBrokenRefs = useMemo(
    () => brokenRefs.filter((f) => !acknowledgedKeys.has(getFindingKey(f))),
    [brokenRefs, acknowledgedKeys],
  )
  const resolvedBrokenRefs = useMemo(
    () => brokenRefs.filter((f) => acknowledgedKeys.has(getFindingKey(f))),
    [brokenRefs, acknowledgedKeys],
  )
  const linkFindings = useMemo(
    () => result?.findings.filter((f) => f.kind === 'link') ?? [],
    [result],
  )
  // "Issue" = a confirmed problem only (broken), never 'unverifiable' (couldn't determine).
  const activeBrokenLinks = useMemo(
    () =>
      linkFindings.filter(
        (f) => f.result.status === 'broken' && !acknowledgedKeys.has(getFindingKey(f)),
      ),
    [linkFindings, acknowledgedKeys],
  )
  const unverifiableCount = useMemo(
    () => linkFindings.filter((f) => f.result.status === 'unverifiable').length,
    [linkFindings],
  )

  const {issueCount, issueBreakdown, distinctBrokenRefs} = summarizeHeadline(
    activeBrokenRefs,
    activeBrokenLinks,
    t,
  )

  const showLinkSection = useMemo(
    () =>
      linkFindings.some((f) => f.result.status !== 'ok' || acknowledgedKeys.has(getFindingKey(f))),
    [linkFindings, acknowledgedKeys],
  )

  const inspectedGroups = useMemo(
    () => (inspectDocId && result ? groupDocFindings(result.findings, inspectDocId) : []),
    [inspectDocId, result],
  )
  // Hold external-link display while a Function may be about to replace them: only a
  // browser-sourced result is provisional, and only when no custom checkUrl is configured
  // (a proxy-backed browser scan IS accurate and should show immediately).
  const holdingExternalLinks = awaitingFunction && result?.source === 'browser' && !config.checkUrl
  const showCorsBanner =
    !bannerDismissed &&
    result?.source === 'browser' &&
    !config.checkUrl &&
    unverifiableCount > 0 &&
    !holdingExternalLinks
  const showingPreviousResults = scanning && Boolean(result)
  const translateProgressMessage = useCallback(
    (message: string) => {
      if (message === 'Starting') return t('progress.starting')
      if (message === 'Fetching documents') return t('progress.fetching-documents')
      if (message === 'Checking references') return t('progress.checking-references')
      if (message === 'Checking external links') return t('progress.checking-external-links')
      return message
    },
    [t],
  )

  return (
    <Container
      width="auto"
      paddingX={[3, 3, 5]}
      paddingTop={[4, 4, 6]}
      paddingBottom={[3, 3, 5]}
      style={{overflowX: 'hidden', maxWidth: '100vw', boxSizing: 'border-box'}}
    >
      {/* display:flex sizes to fit-content by default, not its parent's width - without an
          explicit width here every row below thinks it has unlimited room and never wraps,
          even though the Container itself is correctly capped. This is what actually makes
          the cap apply to the content instead of just clipping it. */}
      {/* SanityDefaultPreview's root carries its own left padding (built for Studio pane
          lists, where it aligns with pane chrome) - here it just insets every row's media
          from the list edge. Its stable data-testid is the only hook it exposes.

          Row hover: Studio pane items get their hover background from being interactive
          Cards (as="a"), which these rows can't be - they contain nested buttons, so the
          document link is an overlay anchor instead. The same visual is recreated from the
          theme's foreground color, so it tracks light/dark and tone automatically. */}
      <style>{`
        .lc-row-preview [data-testid="default-preview"] { padding-left: 0; }
        .lc-row:hover { background-color: color-mix(in srgb, var(--card-fg-color) 5%, transparent); }

        /* Mixed-status badge cluster (AggregateStatusBadge/StackedStatusBadges): one
           concrete badge plus either a "+N" chip (collapsed) or the remaining real badges
           (expanded) - never both, never overlapped, so nothing ever clips a neighbor's
           text. Both groups share the same grid cell and crossfade rather than hard-swap
           via display, so revealing on hover doesn't jump. Devices with no hover (touch)
           get the expanded group directly - there's no hover gesture to reveal it with. */
        .lc-badge-stack { display: inline-flex; align-items: center; gap: 4px; }
        .lc-badge-stack-reveal { display: inline-grid; }
        .lc-badge-stack-collapsed, .lc-badge-stack-expanded {
          grid-area: 1 / 1;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: opacity 150ms ease;
        }
        .lc-badge-stack-expanded { opacity: 0; pointer-events: none; }

        /* Every badge in this tool shows a status code or count at some point (200, 404,
           +1, ...) - tabular figures keep digit widths consistent instead of a narrow "1"
           sitting oddly inside a pill sized for "4"/"0". Sanity's Badge passes fontSize down
           to an inner Text as an explicit size token (not inherited), so only a
           descendant-targeting !important rule reliably reaches it - global rather than
           .lc-row-scoped since the Details dialog (badges here too) likely portals its
           content outside this view's DOM subtree, out of reach of an ancestor-scoped rule. */
        [data-ui="Badge"] * { font-size: 0.75rem !important; font-variant-numeric: tabular-nums; }

        /* The "+N" chip is 1-2 digits, always - a plain Badge (sized for arbitrary text)
           reads as a squat, oddly-shaped pill next to a real code/label. Fixed min-width and
           centered text make it read as a compact counter instead. */
        .lc-badge-stack-collapsed [data-ui="Badge"],
        .lc-badge-stack-expanded [data-ui="Badge"]:last-child:not(:first-child) {
          min-width: 1.75em;
          text-align: center;
        }

        @media (hover: hover) {
          .lc-badge-stack-reveal:hover .lc-badge-stack-collapsed,
          .lc-badge-stack-reveal:focus-within .lc-badge-stack-collapsed {
            opacity: 0;
            pointer-events: none;
          }
          .lc-badge-stack-reveal:hover .lc-badge-stack-expanded,
          .lc-badge-stack-reveal:focus-within .lc-badge-stack-expanded {
            opacity: 1;
            pointer-events: auto;
          }
        }
        @media not (hover: hover) {
          .lc-badge-stack-collapsed { display: none; }
          .lc-badge-stack-expanded { opacity: 1; pointer-events: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lc-badge-stack-collapsed, .lc-badge-stack-expanded { transition: none; }
        }
      `}</style>
      <Stack gap={[4, 4, 5]} style={{width: '100%', minWidth: 0}}>
        {/* Column on narrow screens, not a row that hopes flex-wrap kicks in at the right
            threshold - the button unconditionally sits below the title instead of risking
            getting clipped by a wrap that doesn't trigger. */}
        {/* align flex-start: the default (stretch) makes the button grow to whatever
            height the title column happens to have. */}
        <Flex
          direction={['column', 'column', 'row']}
          justify="space-between"
          align={['stretch', 'stretch', 'flex-start']}
          gap={4}
        >
          <Stack gap={3} style={{minWidth: 0}}>
            <Heading size={[2, 2, 3]}>{t('tool.title')}</Heading>
            {dataset && (
              <Text size={1} muted>
                <Translate
                  t={t}
                  i18nKey="scan.dataset-note"
                  values={{dataset}}
                  components={{Strong: DatasetName}}
                />
              </Text>
            )}
          </Stack>
          <Button
            text={scanning ? t('scan.running-button') : t('scan.run-button')}
            tone="primary"
            disabled={scanning}
            onClick={handleRunScan}
          />
        </Flex>

        {!result && (
          <Text size={1} muted>
            {t('empty.no-scan')}
          </Text>
        )}

        {scanning && progress && (
          <ScanProgressBanner
            message={translateProgressMessage(progress.message)}
            done={progress.done}
            total={progress.total}
          />
        )}

        {showingPreviousResults && <PreviousResultsBanner />}

        <Box
          aria-busy={showingPreviousResults || undefined}
          inert={showingPreviousResults || undefined}
          style={
            showingPreviousResults
              ? {opacity: 0.6, pointerEvents: 'none', transition: 'opacity 120ms ease'}
              : undefined
          }
        >
          <Stack gap={[4, 4, 5]}>
            <MaybeScanSummaryCard
              result={result}
              holdingExternalLinks={holdingExternalLinks}
              issueCount={issueCount}
              issueBreakdown={issueBreakdown}
            />

            {!scanning && awaitingFunction && !holdingExternalLinks && <AwaitingFunctionBanner />}

            {showCorsBanner && <CorsBanner onDismiss={handleDismissBanner} />}

            {/* Own, larger gap between these two - they're distinct sections, not part of
                the same tight group as the summary card/banners above. A single child (only
                one of the two present) gets no extra gap either side - Stack only spaces
                between children that actually render. */}
            <Stack gap={5}>
              {brokenRefs.length > 0 && (
                <Stack gap={4}>
                  <Stack gap={2}>
                    <Heading size={1}>{t('findings.broken-references.title')}</Heading>
                    <Text size={1} muted>
                      {t('findings.broken-references.description')}
                    </Text>
                    <RefsSubtitle
                      holdingExternalLinks={holdingExternalLinks}
                      distinctBrokenRefs={distinctBrokenRefs}
                      t={t}
                    />
                  </Stack>
                  <TabbedFindings
                    idPrefix="broken-refs"
                    tabs={[
                      {
                        key: 'active',
                        label: t('tabs.active'),
                        emptyMessage: t('empty.active-broken-references'),
                        items: activeBrokenRefs,
                      },
                      {
                        key: 'resolved',
                        label: t('tabs.resolved'),
                        emptyMessage: t('empty.resolved'),
                        items: resolvedBrokenRefs,
                      },
                    ]}
                    previewDocuments={previewDocuments}
                    previewsLoading={previewsLoading}
                    acknowledgedKeys={acknowledgedKeys}
                    onToggleAcknowledged={handleToggleAcknowledged}
                    onOpenEdit={handleOpenEdit}
                    onOpenDetails={handleOpenDetails}
                    editHref={editHref}
                  />
                </Stack>
              )}

              {/* Hidden when every checked link is fine - the all-clear card above already
                  says so, and tabs full of zeros under it read as unfinished work. Appears
                  as soon as there's anything to triage (or to audit in Resolved). */}
              {(showLinkSection || holdingExternalLinks) && (
                <Stack gap={4}>
                  <Stack gap={3}>
                    <Heading size={1}>{t('findings.external-links.title')}</Heading>
                    <Text size={1} muted>
                      {t('findings.external-links.description')}
                    </Text>
                  </Stack>
                  {holdingExternalLinks ? (
                    <VerifyingLinksPlaceholder />
                  ) : (
                    <LinkResultsTabs
                      findings={linkFindings}
                      previewDocuments={previewDocuments}
                      previewsLoading={previewsLoading}
                      acknowledgedKeys={acknowledgedKeys}
                      onToggleAcknowledged={handleToggleAcknowledged}
                      editHref={editHref}
                      onOpenEdit={handleOpenEdit}
                      onOpenDetails={handleOpenDetails}
                      okFindingsTruncated={result?.okFindingsTruncated}
                    />
                  )}
                </Stack>
              )}
            </Stack>
          </Stack>
        </Box>

        {inspectedGroups.length > 0 && (
          <DocumentDialog
            groups={inspectedGroups}
            previewDocument={inspectDocId ? previewDocuments.get(inspectDocId) : undefined}
            acknowledgedKeys={acknowledgedKeys}
            onToggleAcknowledged={handleToggleAcknowledged}
            editHref={editHref}
            onOpenEdit={handleOpenEdit}
            onClose={handleCloseDetails}
          />
        )}

        <Box />
      </Stack>
    </Container>
  )
}
