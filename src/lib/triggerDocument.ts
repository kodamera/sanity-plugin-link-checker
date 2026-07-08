import type {SanityClient} from '@sanity/client'

/**
 * Writing this document (a cheap, always-overwritten singleton, same pattern as the report
 * doc) is how the Studio's "Run scan" button asks a deployed Document Function to run an
 * accurate, server-side rescan. Harmless no-op if no such function is deployed - the doc
 * just sits there unused.
 */
export const TRIGGER_DOC_ID = 'link-checker-trigger'
export const TRIGGER_DOC_TYPE = 'linkCheckerTrigger'

export async function writeTrigger(client: SanityClient): Promise<void> {
  await client.createOrReplace({
    _id: TRIGGER_DOC_ID,
    _type: TRIGGER_DOC_TYPE,
    requestedAt: new Date().toISOString(),
  })
}
