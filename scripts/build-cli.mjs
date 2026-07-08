import {chmod} from 'node:fs/promises'
import * as esbuild from 'esbuild'

const outfile = 'dist/bin/cli.js'

await esbuild.build({
  entryPoints: ['src/bin/cli.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
})

await chmod(outfile, 0o755)
