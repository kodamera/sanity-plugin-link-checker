// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {LinkStatusBadge, ReferenceStatusBadge} from './StatusBadge'
import {renderUi} from './test/setup'

// Dynamic import inside the factory (rather than a static import of `sanityMock` used
// directly) so this is immune to import-sort reordering elsewhere in the file: vi.mock is
// hoisted above all imports, and if `sanityMock` were a plain imported binding, evaluation
// order between this import and any other local import that transitively imports 'sanity'
// (e.g. './StatusBadge') would decide whether the binding is initialized yet.
vi.mock('sanity', async () => {
  const {sanityMock} = await import('./test/setup')
  return sanityMock()
})

describe('LinkStatusBadge', () => {
  it('shows the HTTP status code for a broken link', () => {
    renderUi(<LinkStatusBadge result={{status: 'broken', httpStatus: 404}} />)
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('shows the timeout badge key when a broken link timed out', () => {
    renderUi(<LinkStatusBadge result={{status: 'broken', reason: 'timeout'}} />)
    expect(screen.getByText('badge.timeout')).toBeInTheDocument()
  })

  it('shows the status code for a bot-blocked (caution) link', () => {
    renderUi(
      <LinkStatusBadge result={{status: 'unverifiable', reason: 'blocked', httpStatus: 999}} />,
    )
    expect(screen.getByText('999')).toBeInTheDocument()
  })

  it('shows the unverifiable badge key for a CORS-blocked link', () => {
    renderUi(<LinkStatusBadge result={{status: 'unverifiable', reason: 'cors'}} />)
    expect(screen.getByText('badge.unverifiable')).toBeInTheDocument()
  })

  it('shows the HTTP status code for an ok link', () => {
    renderUi(<LinkStatusBadge result={{status: 'ok', httpStatus: 200}} />)
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('shows a distinct badge for a syntactically malformed URL', () => {
    renderUi(<LinkStatusBadge result={{status: 'broken', reason: 'malformed-url'}} />)
    expect(screen.getByText('badge.malformed-url')).toBeInTheDocument()
  })
})

describe('ReferenceStatusBadge', () => {
  it('shows the dangling-reference badge key', () => {
    renderUi(<ReferenceStatusBadge />)
    expect(screen.getByText('badge.dangling-reference')).toBeInTheDocument()
  })
})
