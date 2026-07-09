import {defineLocaleResourceBundle} from 'sanity'

export const linkCheckerLocaleNamespace = 'sanity-plugin-link-checker' as const

export const linkCheckerLocaleBundles = [
  defineLocaleResourceBundle({
    locale: 'en-US',
    namespace: linkCheckerLocaleNamespace,
    resources: () => import('./resources'),
  }),
  defineLocaleResourceBundle({
    locale: 'sv-SE',
    namespace: linkCheckerLocaleNamespace,
    resources: () => import('./resources.sv'),
  }),
]
