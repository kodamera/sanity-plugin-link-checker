import {definePlugin} from 'sanity'

import {linkCheckerLocaleBundles, linkCheckerLocaleNamespace} from './i18n'
import type {LinkCheckerPluginConfig} from './lib/types'
import {linkCheckerTool} from './LinkCheckerTool'

/**
 * The i18n namespace this plugin's strings are registered under - export it rather than
 * hardcoding the string, since it's the one stable thing an override bundle must match.
 * Sanity's own `i18n.bundles` mechanism (not a config option on `linkChecker()`) is how a
 * Studio adds or replaces a locale: register another `defineLocaleResourceBundle` with this
 * namespace and any locale (including ones this plugin never shipped) in `sanity.config.ts`;
 * bundles merge with `overwrite: true` by default, so it layers over the built-in strings
 * with no plugin-side config needed. See the README's i18n section for a full example.
 */
export {linkCheckerLocaleNamespace}

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
