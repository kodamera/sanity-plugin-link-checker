import {defineConfig} from 'vitest/config'

export default defineConfig({
  // The repo's tsconfig sets `jsx: "preserve"` (production JSX transform happens in the
  // pkg-utils/esbuild build step, not tsc). This Vite version transforms by default via
  // oxc (not esbuild) and otherwise inherits that "preserve" setting from tsconfig, which
  // oxc can't transform itself - component tests need an explicit override here. This only
  // affects vitest's own transform pipeline, not the tsconfig used by `tsc --noEmit` or the
  // build.
  oxc: {
    jsx: {runtime: 'automatic'},
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
