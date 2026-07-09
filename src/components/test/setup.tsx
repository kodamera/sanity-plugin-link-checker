// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import {studioTheme, ThemeProvider} from '@sanity/ui'
import {render} from '@testing-library/react'
import type {JSX, ReactNode} from 'react'

import type {ScanFinding} from '../../lib/types'
import type {FindingGroup} from '../ResultRow'

/** Mocks every 'sanity' export the components use. Call from vi.mock factories. */
export function sanityMock() {
  return {
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) =>
        values && 'count' in values ? `${key}:${values.count}` : key,
    }),
    useSchema: () => ({get: () => undefined}),
    useValuePreview: () => ({isLoading: false, value: undefined, error: undefined}),
    SanityDefaultPreview: ({title, subtitle}: {title?: ReactNode; subtitle?: ReactNode}) => (
      <div data-testid="mock-preview">
        {title}
        {subtitle}
      </div>
    ),
    DocumentStatus: () => <div data-testid="mock-doc-status" />,
    DocumentStatusIndicator: () => <div data-testid="mock-doc-status-indicator" />,
    useCurrentLocale: () => ({id: 'en-US'}),
    Translate: ({i18nKey}: {i18nKey: string}) => <span>{i18nKey}</span>,
    // Called at module-eval time by src/i18n/index.ts (`linkCheckerLocaleBundles`), which
    // every component transitively imports for `linkCheckerLocaleNamespace` - must be a
    // real (if inert) function, not left out, or that import throws before any test runs.
    defineLocaleResourceBundle: (bundle: unknown) => bundle,
  }
}

export function renderUi(node: JSX.Element) {
  return render(<ThemeProvider theme={studioTheme}>{node}</ThemeProvider>)
}

export function linkFinding(over: Partial<Extract<ScanFinding, {kind: 'link'}>> = {}) {
  return {
    kind: 'link' as const,
    fromId: 'doc1',
    fromType: 'article',
    fieldPath: 'body[0]',
    href: 'https://example.com/broken',
    result: {status: 'broken' as const, httpStatus: 404, reason: 'http-error' as const},
    ...over,
  }
}

export function group(finding: ScanFinding, keys?: string[]): FindingGroup {
  return {finding, keys: keys ?? ['k1']}
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({matches: true, addEventListener: () => {}, removeEventListener: () => {}}),
})
