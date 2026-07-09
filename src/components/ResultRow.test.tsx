// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {ResultRow} from './ResultRow'
import {group, linkFinding, renderUi} from './test/setup'

// See StatusBadge.test.tsx for why this is a dynamic import rather than a static one.
vi.mock('sanity', async () => {
  const {sanityMock} = await import('./test/setup')
  return sanityMock()
})

// The trailing controls collapse to an overflow menu below a CSS breakpoint (see
// ResultRow.tsx's `display={['none', 'none', 'block']}` / `['block', 'block', 'none']`
// pair). jsdom doesn't evaluate `@media (min-width: ...)` when computing style, so it only
// ever "sees" the narrowest (mobile) breakpoint - the desktop Details/Resolve buttons come
// back as accessibility-hidden even though they're what a real browser shows above that
// breakpoint. `hidden: true` opts every role query in this file out of that visibility
// filtering so the assertions reflect the actual button markup, not jsdom's viewport gap.
const button = (name: string) => screen.getByRole('button', {name, hidden: true})
const queryButton = (name: string) => screen.queryByRole('button', {name, hidden: true})

function defaultProps() {
  return {
    acknowledgedKeys: new Set<string>(),
    onToggleAcknowledged: vi.fn(),
    editHref: () => '/edit',
    onOpenEdit: vi.fn(),
    onOpenDetails: vi.fn(),
  }
}

describe('ResultRow', () => {
  it('renders Details and Resolve controls plus the status badge for a single broken link', () => {
    renderUi(<ResultRow groups={[group(linkFinding())]} {...defaultProps()} />)

    expect(button('result.details')).toBeInTheDocument()
    expect(button('result.resolve')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('fires onOpenDetails with the document id when Details is clicked', async () => {
    const user = userEvent.setup()
    const onOpenDetails = vi.fn()
    renderUi(
      <ResultRow
        groups={[group(linkFinding())]}
        {...defaultProps()}
        onOpenDetails={onOpenDetails}
      />,
    )

    await user.click(button('result.details'))

    expect(onOpenDetails).toHaveBeenCalledWith('doc1')
  })

  it('collapses a multi-group row to a link-count subtitle with no raw href text', () => {
    const groups = [
      group(linkFinding({href: 'https://example.com/one'}), ['k1']),
      group(linkFinding({href: 'https://example.com/two'}), ['k2']),
    ]
    renderUi(<ResultRow groups={groups} {...defaultProps()} />)

    expect(screen.getByText(/result\.link-count:2/)).toBeInTheDocument()
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument()
  })

  it('resolves every key of every group when Resolve is clicked', async () => {
    const user = userEvent.setup()
    const onToggleAcknowledged = vi.fn()
    const groups = [
      group(linkFinding({href: 'https://example.com/one'}), ['k1']),
      group(linkFinding({href: 'https://example.com/two'}), ['k2']),
    ]
    renderUi(
      <ResultRow groups={groups} {...defaultProps()} onToggleAcknowledged={onToggleAcknowledged} />,
    )

    await user.click(button('result.resolve'))

    expect(onToggleAcknowledged).toHaveBeenCalledTimes(2)
    expect(onToggleAcknowledged).toHaveBeenCalledWith('k1')
    expect(onToggleAcknowledged).toHaveBeenCalledWith('k2')
  })

  it('hides the Resolve control for an ok-only group but keeps Details and shows its badge', () => {
    const okFinding = linkFinding({result: {status: 'ok', httpStatus: 200}})
    renderUi(<ResultRow groups={[group(okFinding)]} {...defaultProps()} />)

    expect(queryButton('result.resolve')).not.toBeInTheDocument()
    expect(button('result.details')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })
})
