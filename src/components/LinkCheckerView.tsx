import {Box, Button, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef} from 'react'
import {Translate, useClient, useTranslation, useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

import {linkCheckerLocaleNamespace} from '../i18n'
import {buildEditPath} from '../lib/editRoute'
import {groupDocFindings} from '../lib/groupDocFindings'
import {getFindingKey, type LinkCheckerPluginConfig, type ScanFinding} from '../lib/types'
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
): {issueCount: number; issueBreakdown: string | null} {
  const groupKeyOf = (f: ScanFinding) =>
    `${f.kind}:${f.fromId}:${f.kind === 'reference' ? f.refId : f.href}`
  const issueCount = new Set([...activeBrokenRefs, ...activeBrokenLinks].map((f) => f.fromId)).size
  const distinctBrokenRefs = new Set(activeBrokenRefs.map(groupKeyOf)).size
  const distinctBrokenLinks = new Set(activeBrokenLinks.map(groupKeyOf)).size
  const breakdownParts = [
    distinctBrokenLinks > 0 ? t('findings.broken-links', {count: distinctBrokenLinks}) : null,
    distinctBrokenRefs > 0 ? t('findings.broken-references', {count: distinctBrokenRefs}) : null,
  ].filter(Boolean)
  return {issueCount, issueBreakdown: breakdownParts.length > 0 ? breakdownParts.join(' · ') : null}
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

  const {issueCount, issueBreakdown} = summarizeHeadline(activeBrokenRefs, activeBrokenLinks, t)

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
          <Stack gap={4}>
            {result && (
              <ScanSummaryCard
                issueCount={issueCount}
                issueBreakdown={issueBreakdown}
                ranAt={result.ranAt}
                source={result.source}
                documentsScanned={result.documentsScanned}
                urlsChecked={result.urlsChecked}
              />
            )}

            {!scanning && awaitingFunction && !holdingExternalLinks && <AwaitingFunctionBanner />}

            {showCorsBanner && <CorsBanner onDismiss={handleDismissBanner} />}

            {brokenRefs.length > 0 && (
              <Stack gap={4}>
                <Stack gap={2}>
                  <Heading size={1}>{t('findings.broken-references.title')}</Heading>
                  <Text size={1} muted>
                    {t('findings.broken-references.description')}
                  </Text>
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
