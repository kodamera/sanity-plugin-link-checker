// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {DocumentDialog} from './DocumentDialog'
import {group, linkFinding, renderUi} from './test/setup'

// See StatusBadge.test.tsx for why this is a dynamic import rather than a static one.
vi.mock('sanity', async () => {
  const {sanityMock} = await import('./test/setup')
  return sanityMock()
})

function twoGroups() {
  return [
    group(linkFinding({href: 'https://example.com/broken-one'}), ['k1']),
    group(linkFinding({href: 'https://example.com/broken-two'}), ['k2']),
  ]
}

describe('DocumentDialog', () => {
  it('renders both hrefs in full, unclamped', () => {
    renderUi(
      <DocumentDialog
        groups={twoGroups()}
        acknowledgedKeys={new Set()}
        onToggleAcknowledged={vi.fn()}
        editHref={() => '/edit'}
        onOpenEdit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Dialog renders in a portal - screen queries search document.body, so no need to dig
    // into a specific container.
    expect(screen.getByText('https://example.com/broken-one')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/broken-two')).toBeInTheDocument()
  })

  it('gives each row an open-link anchor targeting a new tab', () => {
    renderUi(
      <DocumentDialog
        groups={twoGroups()}
        acknowledgedKeys={new Set()}
        onToggleAcknowledged={vi.fn()}
        editHref={() => '/edit'}
        onOpenEdit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const openLinks = screen.getAllByRole('link', {
      name: 'result.open-link-tooltip',
      hidden: true,
    })
    expect(openLinks).toHaveLength(2)
    openLinks.forEach((link) => expect(link).toHaveAttribute('target', '_blank'))
  })

  it("resolves only the clicked row's keys", async () => {
    const user = userEvent.setup()
    const onToggleAcknowledged = vi.fn()
    renderUi(
      <DocumentDialog
        groups={twoGroups()}
        acknowledgedKeys={new Set()}
        onToggleAcknowledged={onToggleAcknowledged}
        editHref={() => '/edit'}
        onOpenEdit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const resolveButtons = screen.getAllByRole('button', {name: 'result.resolve', hidden: true})
    expect(resolveButtons).toHaveLength(2)

    await user.click(resolveButtons[0])

    expect(onToggleAcknowledged).toHaveBeenCalledTimes(1)
    expect(onToggleAcknowledged).toHaveBeenCalledWith('k1')
  })

  it('renders the footer open-document button pointing at editHref', () => {
    renderUi(
      <DocumentDialog
        groups={twoGroups()}
        acknowledgedKeys={new Set()}
        onToggleAcknowledged={vi.fn()}
        editHref={() => '/edit'}
        onOpenEdit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const openDocument = screen.getByRole('link', {name: 'dialog.open-document', hidden: true})
    expect(openDocument).toHaveAttribute('href', '/edit')
  })
})
