// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import type {FindingTabDef} from './TabbedFindings'
import {TabbedFindings} from './TabbedFindings'
import {linkFinding, renderUi} from './test/setup'

// See StatusBadge.test.tsx for why this is a dynamic import rather than a static one.
vi.mock('sanity', async () => {
  const {sanityMock} = await import('./test/setup')
  return sanityMock()
})

function baseProps() {
  return {
    previewDocuments: new Map(),
    acknowledgedKeys: new Set<string>(),
    onToggleAcknowledged: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenDetails: vi.fn(),
    editHref: () => '/edit',
  }
}

describe('TabbedFindings', () => {
  it('groups findings per document and shows the document count in the tab label', () => {
    const tabs: FindingTabDef<ReturnType<typeof linkFinding>>[] = [
      {
        key: 'links',
        label: 'External links',
        emptyMessage: 'No broken links',
        items: [
          linkFinding({fromId: 'doc1', href: 'https://example.com/one'}),
          linkFinding({fromId: 'doc1', href: 'https://example.com/two'}),
          linkFinding({fromId: 'doc2', href: 'https://example.com/three'}),
        ],
      },
    ]
    renderUi(<TabbedFindings idPrefix="lc" tabs={tabs} {...baseProps()} />)

    expect(screen.getAllByText(/article \(/)).toHaveLength(2)
    expect(screen.getByText(/External links \(2\)/)).toBeInTheDocument()
  })

  it('switches to the clicked tab and renders its empty message', async () => {
    const user = userEvent.setup()
    const tabs: FindingTabDef<ReturnType<typeof linkFinding>>[] = [
      {
        key: 'a',
        label: 'Tab A',
        emptyMessage: 'empty-a',
        items: [linkFinding({fromId: 'doc1'})],
      },
      {
        key: 'b',
        label: 'Tab B',
        emptyMessage: 'empty-b',
        items: [],
      },
    ]
    renderUi(<TabbedFindings idPrefix="lc" tabs={tabs} {...baseProps()} />)

    expect(screen.queryByText('empty-b')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: /Tab B/, hidden: true}))

    expect(screen.getByText('empty-b')).toBeInTheDocument()
  })

  it('renders the empty message when a tab has no items', () => {
    const tabs: FindingTabDef<ReturnType<typeof linkFinding>>[] = [
      {
        key: 'links',
        label: 'External links',
        emptyMessage: 'No broken links',
        items: [],
      },
    ]
    renderUi(<TabbedFindings idPrefix="lc" tabs={tabs} {...baseProps()} />)

    expect(screen.getByText('No broken links')).toBeInTheDocument()
  })
})
