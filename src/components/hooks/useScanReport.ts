import type {SanityClient} from '@sanity/client'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {loadCachedResult, saveCachedResult} from '../../lib/cache'
import {readReport, REPORT_DOC_ID, toggleAcknowledged} from '../../lib/reportDocument'
import {type PreviewDocumentValue, resolvePreviewDocuments} from '../../lib/resolvePreviewDocuments'
import type {ScanResult} from '../../lib/types'

/**
 * Owns the report document: fetching/subscribing to it, the local cache seed, previews for
 * the documents it references, and acknowledged-key state (which lives on the report).
 *
 * `onFreshReport` decouples this hook from the scan runner's `awaitingFunction` state - the
 * report listener needs to clear that state when a fresher report arrives, but that state
 * lives in `useScanRunner`. The caller bridges the two with a ref (see LinkCheckerView).
 */
export function useScanReport(
  client: SanityClient,
  onFreshReport?: () => void,
): {
  result: ScanResult | null
  persistResult: (scanResult: ScanResult) => void
  acknowledgedKeys: Set<string>
  handleToggleAcknowledged: (key: string) => void
  previewDocuments: Map<string, PreviewDocumentValue>
  previewsLoading: boolean
  bannerDismissed: boolean
  handleDismissBanner: () => void
} {
  const {projectId, dataset} = client.config()

  const [result, setResult] = useState<ScanResult | null>(() =>
    projectId && dataset ? loadCachedResult(projectId, dataset) : null,
  )
  // Tagged with the scan it belongs to so "still loading" is derived (previews lag the
  // current result) instead of stored - rows render native skeletons until the batch
  // lands rather than flashing the raw type/id fallback and reflowing.
  const [previews, setPreviews] = useState<{
    forRanAt: string | null
    docs: Map<string, PreviewDocumentValue>
  }>({forRanAt: null, docs: new Map()})
  const previewDocuments = previews.docs
  const [bannerDismissed, setBannerDismissed] = useState(false)

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
          onFreshReport?.()
        })
      })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  useEffect(() => {
    if (!result) return undefined
    let cancelled = false
    const ids = Array.from(new Set(result.findings.map((f) => f.fromId)))
    resolvePreviewDocuments(client, ids).then((docs) => {
      if (!cancelled) setPreviews({forRanAt: result.ranAt, docs})
    })
    return () => {
      cancelled = true
    }
  }, [result, client])

  const previewsLoading = Boolean(result) && previews.forRanAt !== result?.ranAt

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

  return {
    result,
    persistResult,
    acknowledgedKeys,
    handleToggleAcknowledged,
    previewDocuments,
    previewsLoading,
    bannerDismissed,
    handleDismissBanner,
  }
}
