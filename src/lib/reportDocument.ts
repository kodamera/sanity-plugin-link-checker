import type {SanityClient} from '@sanity/client'

import type {ScanResult} from './types'

/**
 * A single, always-overwritten document (never one-per-scan) that both the CLI and the
 * in-Studio scan write to, so any environment reading the dataset sees the same latest
 * report with no manual import step. Not registered in the plugin's schema - it doesn't
 * need to be edited via the document form, only read/written via the API.
 */
export const REPORT_DOC_ID = 'link-checker-report'
export const REPORT_DOC_TYPE = 'linkCheckerReport'

/**
 * Writing a new scan result replaces the whole document (createOrReplace), so
 * `acknowledgedKeys` from whatever report currently exists is carried forward here -
 * otherwise every re-scan would silently wipe out anything a user marked reviewed/fixed.
 */
export async function writeReport(client: SanityClient, result: ScanResult): Promise<void> {
  const existing = await client.fetch<{acknowledgedKeys?: string[]} | null>(
    `*[_id == $id][0]{acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
  await client.createOrReplace({
    _id: REPORT_DOC_ID,
    _type: REPORT_DOC_TYPE,
    ...result,
    acknowledgedKeys: existing?.acknowledgedKeys ?? [],
  })
}

export async function readReport(client: SanityClient): Promise<ScanResult | null> {
  return client.fetch<ScanResult | null>(
    `*[_id == $id][0]{ranAt, findings, documentsScanned, urlsChecked, source, acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
}

/** Toggles a finding's key (see getFindingKey) in and out of the acknowledged set. */
export async function toggleAcknowledged(client: SanityClient, findingKey: string): Promise<void> {
  const existing = await client.fetch<{acknowledgedKeys?: string[]} | null>(
    `*[_id == $id][0]{acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
  const current = existing?.acknowledgedKeys ?? []
  const next = current.includes(findingKey)
    ? current.filter((key) => key !== findingKey)
    : [...current, findingKey]
  await client.patch(REPORT_DOC_ID).set({acknowledgedKeys: next}).commit()
}
