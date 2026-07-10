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
      fieldPath: 'body[0].markDefs[0].href',
    })
    expect(occurrences[0].focusPath).toContain('_key=="b1"')
    expect(occurrences[0].focusPath).toContain('_key=="m1"')
    expect(occurrences[0].focusPath.endsWith('.href')).toBe(true)
  })

  it('ignores non-http(s) hrefs', () => {
    const mailtoDoc = {_id: 'a', _type: 'post', link: {href: 'mailto:x@y.se'}}
    const relativeDoc = {_id: 'a', _type: 'post', link: {href: '/relative'}}

    expect(extractPortableTextLinks(mailtoDoc)).toHaveLength(0)
    expect(extractPortableTextLinks(relativeDoc)).toHaveLength(0)
  })

  it('finds bare string URL fields regardless of property name', () => {
    const doc = {_id: 'a', _type: 'post', website: 'https://example.com'}
    const occurrences = extractPortableTextLinks(doc)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({
      href: 'https://example.com',
      fieldPath: 'website',
    })
  })

  it('finds a URL on a custom link object property that is not named href', () => {
    const doc = {_id: 'a', _type: 'post', cta: {_type: 'link', url: 'https://example.com'}}
    const occurrences = extractPortableTextLinks(doc)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({
      href: 'https://example.com',
      fieldPath: 'cta.url',
    })
  })

  it('ignores URLs embedded inside a larger prose string', () => {
    const doc = {_id: 'a', _type: 'post', body: 'see https://example.com for details'}
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

  it('finds URLs inside a plain string array', () => {
    const doc = {_id: 'a', _type: 'post', links: ['https://a.se', 'https://b.se']}
    const occurrences = extractPortableTextLinks(doc)

    expect(occurrences).toHaveLength(2)
    expect(occurrences[0]).toMatchObject({href: 'https://a.se', fieldPath: 'links[0]'})
    expect(occurrences[1]).toMatchObject({href: 'https://b.se', fieldPath: 'links[1]'})
  })

  it('ignores a bare domain string by default', () => {
    const doc = {_id: 'a', _type: 'post', website: 'example.com'}
    expect(extractPortableTextLinks(doc)).toHaveLength(0)
  })

  it('finds a bare domain string when detectBareDomains is on', () => {
    const doc = {_id: 'a', _type: 'post', website: 'example.com'}
    const occurrences = extractPortableTextLinks(doc, {detectBareDomains: true})
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({href: 'example.com', fieldPath: 'website'})
  })

  it('does not double-count a real https:// URL even with detectBareDomains on', () => {
    const doc = {_id: 'a', _type: 'post', website: 'https://example.com'}
    const occurrences = extractPortableTextLinks(doc, {detectBareDomains: true})
    expect(occurrences).toHaveLength(1)
  })

  it('does not flag a non-domain-shaped string even with detectBareDomains on', () => {
    const doc = {_id: 'a', _type: 'post', tech: 'Node.js'}
    expect(extractPortableTextLinks(doc, {detectBareDomains: true})).toHaveLength(0)
  })
})
