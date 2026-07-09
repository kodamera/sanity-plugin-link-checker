import {describe, expect, it} from 'vitest'

import {extractPortableTextLinks} from './extractPortableTextLinks'

describe('extractPortableTextLinks', () => {
  it('finds an href inside a Portable Text-like shape', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        {
          _key: 'b1',
          markDefs: [{_key: 'm1', _type: 'link', href: 'https://example.com'}],
        },
      ],
    }

    const occurrences = extractPortableTextLinks(doc)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({
      href: 'https://example.com',
      fromId: 'a',
    })
    expect(occurrences[0].focusPath).toContain('_key=="b1"')
    expect(occurrences[0].focusPath).toContain('_key=="m1"')
  })

  it('ignores non-http(s) hrefs', () => {
    const mailtoDoc = {_id: 'a', _type: 'post', link: {href: 'mailto:x@y.se'}}
    const relativeDoc = {_id: 'a', _type: 'post', link: {href: '/relative'}}

    expect(extractPortableTextLinks(mailtoDoc)).toHaveLength(0)
    expect(extractPortableTextLinks(relativeDoc)).toHaveLength(0)
  })

  it('ignores bare string URL fields (documents current behavior)', () => {
    const doc = {_id: 'a', _type: 'post', website: 'https://example.com'}
    expect(extractPortableTextLinks(doc)).toHaveLength(0)
  })

  it('returns multiple occurrences of the same URL in one doc', () => {
    const doc = {
      _id: 'a',
      _type: 'post',
      body: [
        {_key: 'b1', markDefs: [{_key: 'm1', _type: 'link', href: 'https://example.com'}]},
        {_key: 'b2', markDefs: [{_key: 'm2', _type: 'link', href: 'https://example.com'}]},
      ],
    }

    const occurrences = extractPortableTextLinks(doc)
    expect(occurrences).toHaveLength(2)
  })
})
