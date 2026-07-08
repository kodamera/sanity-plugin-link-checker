import {Badge, Box, Button, Card, Container, Flex, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {type JSX, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient, useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

import {loadCachedResult, saveCachedResult} from '../lib/cache'
import {buildEditPath} from '../lib/editRoute'
import {readReport, REPORT_DOC_ID, toggleAcknowledged, writeReport} from '../lib/reportDocument'
import {resolveTitles} from '../lib/resolveTitles'
import {runScan} from '../lib/runScan'
import {writeTrigger} from '../lib/triggerDocument'
import {
  getFindingKey,
  type LinkCheckerPluginConfig,
  type ScanFinding,
  type ScanResult,
} from '../lib/types'
import {LinkResultsTabs} from './LinkResultsTabs'
import {ResultRow} from './ResultRow'

const API_VERSION = '2024-01-01'
const AWAIT_FUNCTION_TIMEOUT_MS = 90_000

const SOURCE_LABEL: Record<ScanResult['source'], string> = {
  browser: 'browser scan',
  cli: 'CLI',
  function: 'Function',
}

export function LinkCheckerView(props: {config?: LinkCheckerPluginConfig}): JSX.Element {
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
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{message: string; done: number; total: number} | null>(
    null,
  )
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showReviewedRefs, setShowReviewedRefs] = useState(false)
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
    resolveTitles(client, ids).then(setTitles)
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
  const reviewedBrokenRefs = useMemo(
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

  const issueCount = activeBrokenRefs.length + activeBrokenLinks.length
  const issueBreakdown = [
    activeBrokenRefs.length > 0 &&
      `${activeBrokenRefs.length} broken reference${activeBrokenRefs.length === 1 ? '' : 's'}`,
    activeBrokenLinks.length > 0 &&
      `${activeBrokenLinks.length} broken link${activeBrokenLinks.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const showCorsBanner =
    !bannerDismissed && result?.source === 'browser' && !config.checkUrl && unverifiableCount > 0

  return (
    <Container width={2} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={3}>
            <Flex align="center" gap={2}>
              <Heading size={2}>Link Checker</Heading>
              {dataset && <Badge tone="default">{dataset}</Badge>}
            </Flex>
            {result && (
              <Stack space={2}>
                <Heading size={1}>
                  {issueCount === 0
                    ? 'No issues found'
                    : `${issueCount} issue${issueCount === 1 ? '' : 's'} found`}
                </Heading>
                {issueBreakdown && (
                  <Text size={1} muted>
                    {issueBreakdown}
                  </Text>
                )}
              </Stack>
            )}
            <Text size={1} muted>
              {result
                ? `Scanned ${result.documentsScanned} documents · ${result.urlsChecked} unique external URLs across ${linkFindings.length} link instance${linkFindings.length === 1 ? '' : 's'} — ${new Date(result.ranAt).toLocaleString()} (${SOURCE_LABEL[result.source]})`
                : 'No scan has been run yet.'}
            </Text>
          </Stack>
          <Button
            text={scanning ? 'Scanning…' : 'Run scan'}
            tone="primary"
            disabled={scanning}
            onClick={handleRunScan}
          />
        </Flex>

        {scanning && progress && (
          <Card padding={3} radius={2} tone="primary">
            <Flex align="center" gap={3}>
              <Spinner muted />
              <Text size={1}>
                {progress.message}
                {progress.total > 1 ? ` (${progress.done}/${progress.total})` : ''}
              </Text>
            </Flex>
          </Card>
        )}

        {!scanning && awaitingFunction && (
          <Card padding={3} radius={2} tone="primary">
            <Flex align="center" gap={3}>
              <Spinner muted />
              <Text size={1}>
                Results above are from the quick browser-side pass. If a Document Function is
                deployed, it&apos;s rerunning the check server-side now (can take a couple of
                minutes) and will replace these automatically when done.
              </Text>
            </Flex>
          </Card>
        )}

        {showCorsBanner && (
          <Card padding={3} radius={2} tone="caution">
            <Flex align="flex-start" justify="space-between" gap={3}>
              <Text size={1}>
                Running without a custom <code>checkUrl</code>: most &ldquo;Unverifiable&rdquo;
                results below are the browser blocking cross-origin status reads (CORS), not
                necessarily dead links. For accurate results, deploy a Document Function (
                <code>npx sanity-plugin-link-checker init-function</code>) so &ldquo;Run scan&rdquo;
                triggers one automatically, or run <code>npx sanity-plugin-link-checker</code> by
                hand — see the plugin README.
              </Text>
              <Button
                text="Dismiss"
                mode="bleed"
                fontSize={1}
                padding={2}
                onClick={() => setBannerDismissed(true)}
              />
            </Flex>
          </Card>
        )}

        {result && issueCount === 0 && (
          <Card padding={4} radius={2} tone="positive">
            <Text>No broken links or references found.</Text>
          </Card>
        )}

        {brokenRefs.length > 0 && (
          <Stack space={3}>
            <Heading size={1}>Broken references ({activeBrokenRefs.length})</Heading>
            <Stack space={2}>
              {(showReviewedRefs ? brokenRefs : activeBrokenRefs).map((finding) => {
                const key = getFindingKey(finding)
                return (
                  <ResultRow
                    key={key}
                    finding={finding}
                    title={titles.get(finding.fromId)}
                    acknowledged={acknowledgedKeys.has(key)}
                    onToggleAcknowledged={() => handleToggleAcknowledged(key)}
                    editHref={editHref(finding)}
                    onOpenEdit={() => handleOpenEdit(finding)}
                  />
                )
              })}
              {reviewedBrokenRefs.length > 0 && (
                <Flex justify="flex-end">
                  <Button
                    text={
                      showReviewedRefs
                        ? 'Hide reviewed'
                        : `Show ${reviewedBrokenRefs.length} reviewed`
                    }
                    mode="bleed"
                    fontSize={1}
                    padding={2}
                    onClick={() => setShowReviewedRefs((v) => !v)}
                  />
                </Flex>
              )}
            </Stack>
          </Stack>
        )}

        {linkFindings.length > 0 && (
          <Stack space={3}>
            <Heading size={1}>External links</Heading>
            <LinkResultsTabs
              findings={linkFindings}
              titles={titles}
              acknowledgedKeys={acknowledgedKeys}
              onToggleAcknowledged={handleToggleAcknowledged}
              editHref={editHref}
              onOpenEdit={handleOpenEdit}
            />
          </Stack>
        )}

        <Box />
      </Stack>
    </Container>
  )
}
