import {createClient} from '@sanity/client'
import {documentEventHandler} from '@sanity/functions'
import {readTriggerScanConfig, runScan, writeReport} from 'sanity-plugin-link-checker/core'

// Triggered by the Studio's "Run scan" button writing the linkCheckerTrigger document.
// Runs entirely in Node (this Function's runtime), so external link checks get real
// status codes - no CORS restriction like a browser-run scan has.
export const handler = documentEventHandler(async ({context}) => {
  const client = createClient({
    ...context.clientOptions,
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  // The scan-scope config (excludeTypes, excludeUrls, concurrency, ...) from
  // sanity.config.ts rides along on the trigger document - the Function always scans
  // with the same scope as the Studio, no config duplicated here.
  const scanConfig = await readTriggerScanConfig(client)
  const result = await runScan(client, scanConfig, 'function')
  await writeReport(client, result)
})
