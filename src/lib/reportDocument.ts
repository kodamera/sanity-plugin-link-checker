import type {SanityClient} from '@sanity/client'

import {getFindingKey, type ScanResult} from './types'

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
 * Keys whose finding no longer appears in the new result (fixed, or no longer scanned)
 * are dropped rather than carried forward forever.
 */
export async function writeReport(client: SanityClient, result: ScanResult): Promise<void> {
  const existing = await client.fetch<{acknowledgedKeys?: string[]} | null>(
    `*[_id == $id][0]{acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
  const currentKeys = new Set(result.findings.map(getFindingKey))
  const acknowledgedKeys = (existing?.acknowledgedKeys ?? []).filter((key) => currentKeys.has(key))
  await client.createOrReplace({
    _id: REPORT_DOC_ID,
    _type: REPORT_DOC_TYPE,
    ...result,
    acknowledgedKeys,
  })
}

export async function readReport(client: SanityClient): Promise<ScanResult | null> {
  return client.fetch<ScanResult | null>(
    `*[_id == $id][0]{ranAt, findings, documentsScanned, urlsChecked, source, acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
}

/**
 * Toggles a finding's key (see getFindingKey) in and out of the acknowledged set.
 *
 * The add/remove is an atomic array patch rather than rewriting the whole array, so two
 * editors toggling different keys at the same time both land. The presence check is a
 * separate read - a true concurrent toggle of the SAME key can still double-apply, which
 * degrades to a no-op or a visible re-toggle, never data loss.
 */
export async function toggleAcknowledged(client: SanityClient, findingKey: string): Promise<void> {
  const existing = await client.fetch<{acknowledgedKeys?: string[]} | null>(
    `*[_id == $id][0]{acknowledgedKeys}`,
    {id: REPORT_DOC_ID},
  )
  const current = existing?.acknowledgedKeys ?? []
  // JSON.stringify produces a double-quoted, escaped literal - keys contain arbitrary
  // URL characters (quotes, backslashes) and must never be spliced in raw.
  const keyLiteral = JSON.stringify(findingKey)

  if (current.includes(findingKey)) {
    await client
      .patch(REPORT_DOC_ID)
      .unset([`acknowledgedKeys[@ == ${keyLiteral}]`])
      .commit()
  } else {
    await client
      .patch(REPORT_DOC_ID)
      .setIfMissing({acknowledgedKeys: []})
      .insert('after', 'acknowledgedKeys[-1]', [findingKey])
      .commit()
  }
}
