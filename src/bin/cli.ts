#!/usr/bin/env node
import {runInitFunctionCommand} from './initFunctionCommand'
import {runScanCommand} from './scanCommand'

const argv = process.argv.slice(2)

async function main(): Promise<void> {
  if (argv[0] === 'init-function') {
    await runInitFunctionCommand(argv.slice(1))
    return
  }

  // Default: `sanity-plugin-link-checker [options]` runs a scan.
  await runScanCommand(argv)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
