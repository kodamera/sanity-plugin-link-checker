import type {SanityClient} from '@sanity/client'

import type {LinkCheckerPluginConfig} from './types'

/**
 * Writing this document (a cheap, always-overwritten singleton, same pattern as the report
 * doc) is how the Studio's "Run scan" button asks a deployed Document Function to run an
 * accurate, server-side rescan. Harmless no-op if no such function is deployed - the doc
 * just sits there unused.
 *
 * The trigger also carries the plugin's scan-scope config (exclusions, concurrency, ...),
 * so the Function scans with exactly what `sanity.config.ts` says - one source of truth,
 * no config duplicated into the function code, no redeploy to change scan scope.
 */
export const TRIGGER_DOC_ID = 'link-checker-trigger'
export const TRIGGER_DOC_TYPE = 'linkCheckerTrigger'

/** The JSON-safe subset of the plugin config that a Function scan can honor. `checkUrl`
 * is a function and can't travel; RegExp excludeUrls are stored as source+flags pairs. */
interface SerializedScanConfig {
  concurrency?: number
  timeoutMs?: number
  hostDelayMs?: number
  ignoreDraftsOlderThanDays?: number
  excludeTypes?: string[]
  excludeUrls?: string[]
  excludeUrlPatterns?: {source: string; flags: string}[]
}

export function serializeScanConfig(config: LinkCheckerPluginConfig): SerializedScanConfig {
  const excludeUrls = config.excludeUrls ?? []
  return {
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    hostDelayMs: config.hostDelayMs,
    ignoreDraftsOlderThanDays: config.ignoreDraftsOlderThanDays,
    excludeTypes: config.excludeTypes,
    excludeUrls: excludeUrls.filter((p): p is string => typeof p === 'string'),
    excludeUrlPatterns: excludeUrls
      .filter((p): p is RegExp => p instanceof RegExp)
      .map((p) => ({source: p.source, flags: p.flags})),
  }
}

export function deserializeScanConfig(
  raw: SerializedScanConfig | null | undefined,
): LinkCheckerPluginConfig {
  if (!raw) return {}
  return {
    concurrency: raw.concurrency ?? undefined,
    timeoutMs: raw.timeoutMs ?? undefined,
    hostDelayMs: raw.hostDelayMs ?? undefined,
    ignoreDraftsOlderThanDays: raw.ignoreDraftsOlderThanDays ?? undefined,
    excludeTypes: raw.excludeTypes ?? undefined,
    excludeUrls: [
      ...(raw.excludeUrls ?? []),
      ...(raw.excludeUrlPatterns ?? []).map((p) => new RegExp(p.source, p.flags)),
    ],
  }
}

export async function writeTrigger(
  client: SanityClient,
  config: LinkCheckerPluginConfig = {},
): Promise<void> {
  await client.createOrReplace({
    _id: TRIGGER_DOC_ID,
    _type: TRIGGER_DOC_TYPE,
    requestedAt: new Date().toISOString(),
    scanConfig: serializeScanConfig(config),
  })
}

/**
 * Reads the scan config the Studio last wrote to the trigger document - what a Document
 * Function should scan with. Returns {} when no trigger exists yet (e.g. the Function was
 * invoked manually), which falls back to the scan defaults.
 */
export async function readTriggerScanConfig(
  client: SanityClient,
): Promise<LinkCheckerPluginConfig> {
  const raw = await client.fetch<SerializedScanConfig | null>(`*[_id == $id][0].scanConfig`, {
    id: TRIGGER_DOC_ID,
  })
  return deserializeScanConfig(raw)
}
