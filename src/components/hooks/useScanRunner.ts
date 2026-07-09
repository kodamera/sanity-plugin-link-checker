import type {SanityClient} from '@sanity/client'
import {useCallback, useEffect, useRef, useState} from 'react'

import {writeReport} from '../../lib/reportDocument'
import {runScan} from '../../lib/runScan'
import {writeTrigger} from '../../lib/triggerDocument'
import type {LinkCheckerPluginConfig, ScanResult} from '../../lib/types'

const AWAIT_FUNCTION_TIMEOUT_MS = 90_000

/**
 * Owns scan execution: the quick browser-side pass, its progress, and the "awaiting
 * function" window that follows (we can't observe a Document Function actually running,
 * only that its result never showed up before the timeout).
 */
export function useScanRunner(options: {
  client: SanityClient
  config: LinkCheckerPluginConfig
  persistResult: (scanResult: ScanResult) => void
}): {
  scanning: boolean
  progress: {message: string; done: number; total: number} | null
  awaitingFunction: boolean
  clearAwaiting: () => void
  handleRunScan: () => Promise<void>
} {
  const {client, config, persistResult} = options

  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{message: string; done: number; total: number} | null>(
    null,
  )
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

  const clearAwaiting = useCallback(() => {
    setAwaitingFunction(false)
    clearAwaitTimeout()
  }, [clearAwaitTimeout])

  useEffect(() => clearAwaitTimeout, [clearAwaitTimeout])

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
      // exists or is running, only whether a fresher report ever shows up. The plugin
      // config rides along so the Function scans with the same scope as sanity.config.ts.
      writeTrigger(client, config)
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

  return {scanning, progress, awaitingFunction, clearAwaiting, handleRunScan}
}
