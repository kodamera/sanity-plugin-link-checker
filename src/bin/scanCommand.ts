import {writeFile} from 'node:fs/promises'
import {parseArgs} from 'node:util'

import {createClient} from '@sanity/client'

import {writeReport} from '../lib/reportDocument'
import {runScan} from '../lib/runScan'
import {summarizeResult} from '../lib/summarizeResult'

const HELP = `
sanity-plugin-link-checker [scan]

Scans a Sanity dataset for dangling references and broken external links, entirely
server-side (Node has no CORS restriction, unlike the browser). Writes the report into
the dataset as a single overwritten document, so the Studio's Link Checker tool picks it
up automatically in any environment - no manual import step.

Usage:
  npx sanity-plugin-link-checker [options]

Options:
  --project-id <id>     Sanity project id (or SANITY_STUDIO_PROJECT_ID env var)
  --dataset <name>      Dataset name (or SANITY_STUDIO_DATASET env var, default "production")
  --token <token>       API token with write access - e.g. Editor role (or SANITY_AUTH_TOKEN env var)
  --api-version <ver>   API version (default "2024-01-01")
  --out <path>          Also write the report to this local file (optional, e.g. for CI logs)
  --concurrency <n>     Max concurrent external URL checks (default 4)
  --timeout <ms>        Per-request timeout in ms (default 8000)
  --host-delay <ms>     Min ms between two requests to the same host (default 1000)
  --exclude-types <t>   Comma-separated document types to skip, in addition to the
                        always-skipped "sanity.*" system types (e.g. "siteSettings,redirect")
  --exclude-urls <s>    Comma-separated URL substrings to skip when checking external
                        links (e.g. "linkedin.com" for hosts that block automated checks)
  --exclude-url-pattern <re>
                        Regular expression tested against each full URL; repeat
                        the flag for multiple patterns (e.g.
                        --exclude-url-pattern "twitter\\.com/\\w+")
  --ignore-drafts-older-than <days>
                        Skip never-published drafts whose last edit is older than this
                        many days (abandoned drafts); drafts of published docs always scan
  --fail-on-findings    Exit with code 1 if any broken links/references are found (for CI)
  --help                Show this help

See also: npx sanity-plugin-link-checker init-function
  Scaffolds a Sanity Document Function so "Run scan" in Studio triggers an accurate,
  server-side rescan automatically - no need to run this command by hand each time.
`

export async function runScanCommand(argv: string[]): Promise<void> {
  const {values} = parseArgs({
    args: argv,
    options: {
      'project-id': {type: 'string'},
      dataset: {type: 'string'},
      token: {type: 'string'},
      'api-version': {type: 'string'},
      out: {type: 'string'},
      concurrency: {type: 'string'},
      timeout: {type: 'string'},
      'host-delay': {type: 'string'},
      'exclude-types': {type: 'string'},
      'exclude-urls': {type: 'string'},
      'exclude-url-pattern': {type: 'string', multiple: true},
      'ignore-drafts-older-than': {type: 'string'},
      'fail-on-findings': {type: 'boolean', default: false},
      help: {type: 'boolean', default: false},
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const projectId = values['project-id'] ?? process.env.SANITY_STUDIO_PROJECT_ID
  const dataset = values.dataset ?? process.env.SANITY_STUDIO_DATASET ?? 'production'
  const token = values.token ?? process.env.SANITY_AUTH_TOKEN
  const apiVersion = values['api-version'] ?? '2024-01-01'
  const outPath = values.out

  if (!projectId) {
    console.error('Missing --project-id (or SANITY_STUDIO_PROJECT_ID env var)')
    process.exitCode = 1
    return
  }
  if (!token) {
    console.error('Missing --token (or SANITY_AUTH_TOKEN env var) - needs write access')
    process.exitCode = 1
    return
  }

  const excludeUrlPatterns: RegExp[] = []
  for (const source of values['exclude-url-pattern'] ?? []) {
    try {
      excludeUrlPatterns.push(new RegExp(source))
    } catch {
      console.error(`Invalid --exclude-url-pattern: ${source}`)
      process.exitCode = 1
      return
    }
  }

  const client = createClient({projectId, dataset, token, apiVersion, useCdn: false})

  const result = await runScan(
    client,
    {
      concurrency: values.concurrency ? Number(values.concurrency) : undefined,
      timeoutMs: values.timeout ? Number(values.timeout) : undefined,
      hostDelayMs: values['host-delay'] ? Number(values['host-delay']) : undefined,
      excludeTypes: values['exclude-types']
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      excludeUrls: [
        ...(values['exclude-urls']
          ?.split(',')
          .map((u) => u.trim())
          .filter(Boolean) ?? []),
        ...excludeUrlPatterns,
      ],
      ignoreDraftsOlderThanDays: values['ignore-drafts-older-than']
        ? Number(values['ignore-drafts-older-than'])
        : undefined,
    },
    'cli',
    (message, done, total) => {
      process.stdout.write(`\r${message}${total > 1 ? ` (${done}/${total})` : ''}...   `)
    },
  )
  process.stdout.write('\n')

  await writeReport(client, result)
  if (outPath) {
    await writeFile(outPath, JSON.stringify(result, null, 2))
  }

  const {brokenRefs, brokenLinks, unverifiableLinks, documentsWithIssues, issueCount} =
    summarizeResult(result)
  console.log(
    `Scanned ${result.documentsScanned} documents, checked ${result.urlsChecked} external URLs.`,
  )
  console.log(
    `Found ${brokenRefs} broken reference(s), ${brokenLinks} broken link(s)${
      unverifiableLinks > 0 ? `, ${unverifiableLinks} unverifiable link(s)` : ''
    } across ${documentsWithIssues} document(s).`,
  )
  console.log(`Report saved to the dataset - the Studio's Link Checker tool will pick it up.`)
  if (outPath) console.log(`Also wrote a local copy to ${outPath}`)

  if (values['fail-on-findings'] && issueCount > 0) {
    process.exitCode = 1
  }
}
