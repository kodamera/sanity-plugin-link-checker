import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'

const FUNCTION_NAME = 'link-checker-scan'

const HELP = `
sanity-plugin-link-checker init-function

Scaffolds a Sanity Document Function that reruns the link checker server-side (no CORS
restriction, unlike the browser) whenever Studio's "Run scan" button is clicked - real
results appear automatically a few seconds after clicking, no CLI command to remember.

This can't fully automate deployment - that needs one authenticated, explicit action with
your Sanity org's permissions, which no tool can safely do on your behalf during install.
This command scaffolds the function code and tells you the exact 1-2 commands left to run.

Usage:
  npx sanity-plugin-link-checker init-function [options]

Options:
  --dir <path>   Where to write the function (default: current directory)
  --force        Overwrite the function file if it already exists
  --help         Show this help
`

const FUNCTION_TEMPLATE = `import {documentEventHandler} from '@sanity/functions'
import {createClient} from '@sanity/client'
import {runScan, writeReport} from 'sanity-plugin-link-checker/core'

// Triggered by the Studio's "Run scan" button writing the linkCheckerTrigger document.
// Runs entirely in Node (this Function's runtime), so external link checks get real
// status codes - no CORS restriction like a browser-run scan has.
export const handler = documentEventHandler(async ({context}) => {
  const client = createClient({
    ...context.clientOptions,
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  const result = await runScan(client, {}, 'function')
  await writeReport(client, result)
})
`

const BLUEPRINT_SNIPPET = `import {defineDocumentFunction} from '@sanity/blueprints'

defineDocumentFunction({
  name: '${FUNCTION_NAME}',
  // Sanity Functions default to a 10s execution limit - checking a dataset's worth of
  // external links takes much longer than that, so this needs raising (max 900s). 600s
  // gives comfortable headroom even if many sites are slow rather than fast-failing.
  timeout: 600,
  event: {
    on: ['create', 'update'],
    filter: '_type == "linkCheckerTrigger"',
  },
})
`

export async function runInitFunctionCommand(argv: string[]): Promise<void> {
  const {values} = parseArgs({
    args: argv,
    options: {
      dir: {type: 'string'},
      force: {type: 'boolean', default: false},
      help: {type: 'boolean', default: false},
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const baseDir = values.dir ?? '.'
  const functionDir = path.join(baseDir, 'functions', FUNCTION_NAME)
  const functionFile = path.join(functionDir, 'index.ts')

  const exists = await readFile(functionFile, 'utf-8').then(
    () => true,
    () => false,
  )
  if (exists && !values.force) {
    console.error(`${functionFile} already exists - pass --force to overwrite.`)
    process.exitCode = 1
    return
  }

  await mkdir(functionDir, {recursive: true})
  await writeFile(functionFile, FUNCTION_TEMPLATE)
  console.log(`Wrote ${functionFile}`)

  const blueprintPath = path.join(baseDir, 'sanity.blueprint.ts')
  const hasBlueprint = await readFile(blueprintPath, 'utf-8').then(
    () => true,
    () => false,
  )

  console.log('')
  if (hasBlueprint) {
    console.log(`Found ${blueprintPath}. Next steps:`)
    console.log(`  1. Add this resource to its "resources" array:\n`)
    console.log(BLUEPRINT_SNIPPET)
    console.log(
      `  2. npm install sanity-plugin-link-checker @sanity/client (if not already present)`,
    )
    console.log(`  3. npx sanity blueprints deploy`)
  } else {
    console.log(`No sanity.blueprint.ts found in ${baseDir}. Next steps:`)
    console.log(`  1. npx sanity blueprints init ${baseDir} --type ts`)
    console.log(`  2. Add this resource to the "resources" array in the generated file:\n`)
    console.log(BLUEPRINT_SNIPPET)
    console.log(`  3. npm install sanity-plugin-link-checker @sanity/client`)
    console.log(`  4. npx sanity blueprints deploy`)
  }
  console.log('')
  console.log(
    'Once deployed, clicking "Run scan" in Studio will also trigger this function - real results replace the browser-run ones within a few seconds.',
  )
}
