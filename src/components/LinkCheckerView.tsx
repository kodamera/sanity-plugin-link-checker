import {Box, Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Translate, useClient, useTranslation, useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

import {linkCheckerLocaleNamespace} from '../i18n'
import {loadCachedResult, saveCachedResult} from '../lib/cache'
import {buildEditPath} from '../lib/editRoute'
import {readReport, REPORT_DOC_ID, toggleAcknowledged, writeReport} from '../lib/reportDocument'
import {type PreviewDocumentValue, resolvePreviewDocuments} from '../lib/resolvePreviewDocuments'
import {runScan} from '../lib/runScan'
import {writeTrigger} from '../lib/triggerDocument'
import {
  getFindingKey,
  type LinkCheckerPluginConfig,
  type ScanFinding,
  type ScanResult,
} from '../lib/types'
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
const AWAIT_FUNCTION_TIMEOUT_MS = 90_000

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
  const {projectId, dataset} = client.config()
  const router = useRouter()
  const {basePath} = useWorkspace()
  const structureToolName = config.structureToolName ?? 'structure'

  const editHref = useCallback(
    (finding: ScanFinding) =>
      buildEditPath({
        basePath,
        structureToolName,
        documentId: finding.fromId,
        documentType: finding.fromType,
        focusPath: finding.focusPath,
      }),
    [basePath, structureToolName],
  )

  // Opens the document's standalone editor pane in the current tab, bypassing edit-intent
  // resolution (which can nest it under an unrelated parent pane).
  const handleOpenEdit = useCallback(
    (finding: ScanFinding) => {
      router.navigateUrl({path: editHref(finding)})
    },
    [router, editHref],
  )

  const [result, setResult] = useState<ScanResult | null>(() =>
    projectId && dataset ? loadCachedResult(projectId, dataset) : null,
  )
  const [previewDocuments, setPreviewDocuments] = useState<Map<string, PreviewDocumentValue>>(
    new Map(),
  )
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{message: string; done: number; total: number} | null>(
    null,
  )
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // Distinct from `scanning` (which only covers the quick browser-side pass): true from the
  // moment the trigger doc is written until either a fresher report arrives or the timeout
  // fires. We can't observe a Function actually running, only that its result never showed up.
  const [awaitingFunction, setAwaitingFunction] = useState(false)
  const awaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAwaitTimeout = useCallback(() => {
    if (awaitTimeoutRef.current) {
      clearTimeout(awaitTimeoutRef.current)
      awaitTimeoutRef.current = null
    }
  }, [])

  const handleDismissBanner = useCallback(() => setBannerDismissed(true), [])

  const persistResult = useCallback(
    (scanResult: ScanResult) => {
      setResult(scanResult)
      setBannerDismissed(false)
      if (projectId && dataset) {
        saveCachedResult(projectId, dataset, scanResult)
      }
    },
    [projectId, dataset],
  )

  // The dataset's report document is the source of truth across environments (CI, other
  // Studios, teammates, a deployed Document Function) - fetch it on mount, then subscribe
  // live so a report written elsewhere (e.g. a Function finishing a triggered rescan a few
  // seconds after this button is clicked) shows up here automatically, no reload needed.
  useEffect(() => {
    readReport(client).then((latest) => {
      if (latest) persistResult(latest)
    })

    const subscription = client
      .listen(`*[_id == $id]`, {id: REPORT_DOC_ID}, {visibility: 'query'})
      .subscribe(() => {
        readReport(client).then((latest) => {
          if (!latest) return
          persistResult(latest)
          setAwaitingFunction(false)
          clearAwaitTimeout()
        })
      })

    return () => {
      subscription.unsubscribe()
      clearAwaitTimeout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  useEffect(() => {
    if (!result) return
    const ids = Array.from(new Set(result.findings.map((f) => f.fromId)))
    resolvePreviewDocuments(client, ids).then(setPreviewDocuments)
  }, [result, client])

  const handleRunScan = useCallback(async () => {
    setScanning(true)
    setProgress({message: 'Starting', done: 0, total: 1})
    try {
      const scanResult = await runScan(client, config, 'browser', (message, done, total) =>
        setProgress({message, done, total}),
      )
      persistResult(scanResult)
      await writeReport(client, scanResult)

      // Harmless no-op if no Document Function is deployed - if one is, it'll rerun the
      // scan server-side (no CORS) and the listener above picks up the real result whenever
      // it finishes, which can take a while. We can't observe whether a Function actually
      // exists or is running, only whether a fresher report ever shows up.
      writeTrigger(client)
        .then(() => {
          setAwaitingFunction(true)
          clearAwaitTimeout()
          awaitTimeoutRef.current = setTimeout(() => {
            setAwaitingFunction(false)
          }, AWAIT_FUNCTION_TIMEOUT_MS)
        })
        // eslint-disable-next-line no-empty-function
        .catch(() => {})
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }, [client, config, persistResult, clearAwaitTimeout])

  const acknowledgedKeys = useMemo(
    () => new Set(result?.acknowledgedKeys ?? []),
    [result?.acknowledgedKeys],
  )

  const handleToggleAcknowledged = useCallback(
    (key: string) => {
      setResult((prev) => {
        if (!prev) return prev
        const current = prev.acknowledgedKeys ?? []
        const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
        return {...prev, acknowledgedKeys: next}
      })
      // eslint-disable-next-line no-empty-function
      toggleAcknowledged(client, key).catch(() => {})
    },
    [client],
  )

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
      <Stack gap={[4, 4, 5]} style={{width: '100%', minWidth: 0}}>
        {/* Column on narrow screens, not a row that hopes flex-wrap kicks in at the right
            threshold - the button unconditionally sits below the title instead of risking
            getting clipped by a wrap that doesn't trigger. */}
        <Flex direction={['column', 'column', 'row']} justify="space-between" gap={4}>
          <Stack gap={4} style={{minWidth: 0}}>
            <Stack gap={3}>
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
            {!result && (
              <Text size={1} muted>
                {t('empty.no-scan')}
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
            {result && (
              <ScanSummaryCard
                issueCount={issueCount}
                issueBreakdown={issueBreakdown}
                ranAt={result.ranAt}
                source={result.source}
                documentsScanned={result.documentsScanned}
                urlsChecked={result.urlsChecked}
                linkInstanceCount={linkFindings.length}
              />
            )}

            {!scanning && awaitingFunction && !holdingExternalLinks && <AwaitingFunctionBanner />}

            {showCorsBanner && <CorsBanner onDismiss={handleDismissBanner} />}

            {result && issueCount === 0 && !holdingExternalLinks && (
              <Card padding={4} radius={2} shadow={0} tone="positive">
                <Text>{t('findings.all-clear')}</Text>
              </Card>
            )}

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
                  acknowledgedKeys={acknowledgedKeys}
                  onToggleAcknowledged={handleToggleAcknowledged}
                  onOpenEdit={handleOpenEdit}
                  editHref={editHref}
                />
              </Stack>
            )}

            {(linkFindings.length > 0 || holdingExternalLinks) && (
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
                    acknowledgedKeys={acknowledgedKeys}
                    onToggleAcknowledged={handleToggleAcknowledged}
                    editHref={editHref}
                    onOpenEdit={handleOpenEdit}
                  />
                )}
              </Stack>
            )}
          </Stack>
        </Box>

        <Box />
      </Stack>
    </Container>
  )
}
