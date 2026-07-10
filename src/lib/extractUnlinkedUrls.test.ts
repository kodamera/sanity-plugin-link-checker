import {describe, expect, it} from 'vitest'

import {extractUnlinkedUrls} from './extractUnlinkedUrls'

function block(text: string, opts: {marks?: string[]; markDefs?: unknown[]} = {}) {
  return {
    _type: 'block',
    _key: 'b1',
    markDefs: opts.markDefs ?? [],
    children: [{_type: 'span', _key: 's1', text, marks: opts.marks ?? []}],
  }
}

describe('extractUnlinkedUrls', () => {
  it('finds a URL embedded in unlinked prose', () => {
    const doc = {_id: 'a', _type: 'post', body: [block('see https://example.com for details')]}
    const occurrences = extractUnlinkedUrls(doc)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({href: 'https://example.com', fromId: 'a'})
  })

  it('does not flag a span whose mark points at a link-shaped markDef', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        block('see https://example.com for details', {
          marks: ['m1'],
          markDefs: [{_key: 'm1', _type: 'link', href: 'https://example.com'}],
        }),
      ],
    }
    expect(extractUnlinkedUrls(doc)).toHaveLength(0)
  })

  it('recognizes a link-shaped markDef by value, regardless of its _type name', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        block('see https://example.com for details', {
          marks: ['m1'],
          markDefs: [{_key: 'm1', _type: 'customCallToAction', target: 'https://example.com'}],
        }),
      ],
    }
    expect(extractUnlinkedUrls(doc)).toHaveLength(0)
  })

  it('still flags an unlinked URL in a span that has other, non-link marks', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        block('see https://example.com for details', {
          marks: ['strong'],
          markDefs: [],
        }),
      ],
    }
    expect(extractUnlinkedUrls(doc)).toHaveLength(1)
  })

  it('trims trailing sentence punctuation but keeps a balanced internal paren', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [block('wiki page: https://en.wikipedia.org/wiki/Rain_(Beatles_song)')],
    }
    const occurrences = extractUnlinkedUrls(doc)
    expect(occurrences[0].href).toBe('https://en.wikipedia.org/wiki/Rain_(Beatles_song)')
  })

  it('strips a wrapping paren that is not part of the URL', () => {
    const doc = {_id: 'a', _type: 'post', body: [block('see (https://example.com/page) for more')]}
    expect(extractUnlinkedUrls(doc)[0].href).toBe('https://example.com/page')
  })

  it('ignores plain string fields with no Portable Text block structure', () => {
    const doc = {_id: 'a', _type: 'post', bio: 'contact me at https://example.com anytime'}
    expect(extractUnlinkedUrls(doc)).toHaveLength(0)
  })

  it('ignores an inline custom component child, even one holding a raw URL field', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        {
          _type: 'block',
          _key: 'b1',
          markDefs: [],
          children: [
            {_type: 'span', _key: 's1', text: 'see our button below', marks: []},
            {_type: 'ctaButton', _key: 'c1', url: 'https://example.com', label: 'Click here'},
          ],
        },
      ],
    }
    // Zero findings from THIS check - the component is exempt (see plan 027's
    // "Current state"). The component's own `url` field is still caught by the
    // separate, existing extractPortableTextLinks whole-value walk, not this one.
    expect(extractUnlinkedUrls(doc)).toHaveLength(0)
  })

  it('finds multiple unlinked URLs across separate spans', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        {
          _type: 'block',
          _key: 'b1',
          markDefs: [],
          children: [
            {_type: 'span', _key: 's1', text: 'first https://a.example.com here', marks: []},
            {_type: 'span', _key: 's2', text: 'second https://b.example.com there', marks: []},
          ],
        },
      ],
    }
    expect(extractUnlinkedUrls(doc)).toHaveLength(2)
  })
})
