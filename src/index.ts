import {definePlugin} from 'sanity'

import {linkCheckerLocaleBundles} from './i18n'
import type {LinkCheckerPluginConfig} from './lib/types'
import {linkCheckerTool} from './LinkCheckerTool'

export type {LinkCheckerPluginConfig} from './lib/types'
export type {ScanResult} from './lib/types'
export type {ScanFinding} from './lib/types'
export type {BrokenLink} from './lib/types'
export type {BrokenReference} from './lib/types'
export type {UrlCheckResult} from './lib/types'

/**
 * Usage in `sanity.config.ts`:
 *
 * ```ts
 * import {defineConfig} from 'sanity'
 * import {linkChecker} from 'sanity-plugin-link-checker'
 *
 * export default defineConfig({
 *   // ...
 *   plugins: [linkChecker()],
 * })
 * ```
 *
 * @public
 */
export const linkChecker = definePlugin<LinkCheckerPluginConfig | void>((config) => {
  const resolvedConfig: LinkCheckerPluginConfig = config ?? {}
  return {
    i18n: {
      bundles: linkCheckerLocaleBundles,
    },
    name: 'sanity-plugin-link-checker',
    tools: (prev) => [...prev, linkCheckerTool(resolvedConfig)],
  }
})
