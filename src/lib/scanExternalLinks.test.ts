import {describe, expect, it} from 'vitest'

import {interleaveByHost, scanExternalLinks} from './scanExternalLinks'

describe('scanExternalLinks excludeUrls', () => {
  it('skips URLs matching a substring or RegExp pattern without checking them', async () => {
    const docs = [
      {
        _id: 'a',
        _type: 'person',
        linkedin: 'https://www.linkedin.com/in/someone',
        website: 'https://example.com',
        twitter: 'https://twitter.com/someone',
      },
    ]
    const checked: string[] = []

    const {findings, urlsChecked} = await scanExternalLinks(
      docs,
      {
        excludeUrls: ['linkedin.com', /twitter\.com/],
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual(['https://example.com'])
    expect(urlsChecked).toBe(1)
    expect(findings.map((f) => f.href)).toEqual(['https://example.com'])
  })

  it('flags malformed URLs without calling checkUrl, but still checks valid ones', async () => {
    const docs = [
      {
        _id: 'a',
        _type: 'post',
        good: 'https://example.com',
        bad: 'https://example .com',
      },
    ]
    const checked: string[] = []

    const {findings, urlsChecked} = await scanExternalLinks(
      docs,
      {
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual(['https://example.com'])
    expect(urlsChecked).toBe(2)
    const badFinding = findings.find((f) => f.href === 'https://example .com')
    expect(badFinding?.result).toEqual({status: 'broken', reason: 'malformed-url'})
    const goodFinding = findings.find((f) => f.href === 'https://example.com')
    expect(goodFinding?.result).toEqual({status: 'ok'})
  })

  it('flags a bare domain as missing-protocol without calling checkUrl, when detectBareDomains is on', async () => {
    const docs = [{_id: 'a', _type: 'post', good: 'https://example.com', bare: 'example.se'}]
    const checked: string[] = []

    const {findings, urlsChecked} = await scanExternalLinks(
      docs,
      {
        detectBareDomains: true,
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual(['https://example.com'])
    expect(urlsChecked).toBe(2)
    const bareFinding = findings.find((f) => f.href === 'example.se')
    expect(bareFinding?.result).toEqual({status: 'broken', reason: 'missing-protocol'})
  })

  it('does not extract bare domains at all when detectBareDomains is unset', async () => {
    const docs = [{_id: 'a', _type: 'post', bare: 'example.se'}]
    const {findings} = await scanExternalLinks(docs, {}, undefined)
    expect(findings).toHaveLength(0)
  })
})

describe('scanExternalLinks unlinked URLs', () => {
  it('flags an unlinked URL in prose as unverifiable, without calling checkUrl, when detectUnlinkedUrls is on', async () => {
    const docs = [
      {
        _id: 'a',
        _type: 'post',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            markDefs: [],
            children: [
              {_type: 'span', _key: 's1', text: 'see https://example.com here', marks: []},
            ],
          },
        ],
      },
    ]
    const checked: string[] = []

    const {findings} = await scanExternalLinks(
      docs,
      {
        detectUnlinkedUrls: true,
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual([])
    const finding = findings.find((f) => f.href === 'https://example.com')
    expect(finding?.result).toEqual({status: 'unverifiable', reason: 'unlinked-url'})
  })

  it('does not run extractUnlinkedUrls at all when detectUnlinkedUrls is unset', async () => {
    const docs = [
      {
        _id: 'a',
        _type: 'post',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            markDefs: [],
            children: [
              {_type: 'span', _key: 's1', text: 'see https://example.com here', marks: []},
            ],
          },
        ],
      },
    ]
    const {findings} = await scanExternalLinks(docs, {}, undefined)
    expect(findings).toHaveLength(0)
  })
})

describe('scanExternalLinks internal hosts', () => {
  it('flags internal-host URLs without calling checkUrl, but still checks public ones', async () => {
    const docs = [
      {_id: 'a', _type: 'post', good: 'https://example.com', bad: 'http://localhost:3000/x'},
    ]
    const checked: string[] = []

    const {findings} = await scanExternalLinks(
      docs,
      {
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual(['https://example.com'])
    const badFinding = findings.find((f) => f.href === 'http://localhost:3000/x')
    expect(badFinding?.result).toEqual({status: 'broken', reason: 'internal-host'})
  })

  it('skips the internal-host check when skipInternalHostCheck is set', async () => {
    const docs = [{_id: 'a', _type: 'post', link: 'http://localhost:3000/x'}]
    const checked: string[] = []

    const {findings} = await scanExternalLinks(
      docs,
      {
        skipInternalHostCheck: true,
        checkUrl: async (url) => {
          checked.push(url)
          return {status: 'ok' as const}
        },
      },
      undefined,
    )

    expect(checked).toEqual(['http://localhost:3000/x'])
    expect(findings[0].result).toEqual({status: 'ok'})
  })
})

describe('interleaveByHost', () => {
  it('round-robins URLs across hosts so no host is queued back-to-back', () => {
    const urls = [
      'https://a.com/1',
      'https://a.com/2',
      'https://a.com/3',
      'https://b.com/1',
      'https://c.com/1',
    ]

    expect(interleaveByHost(urls)).toEqual([
      'https://a.com/1',
      'https://b.com/1',
      'https://c.com/1',
      'https://a.com/2',
      'https://a.com/3',
    ])
  })

  it('keeps every URL exactly once', () => {
    const urls = ['https://a.com/1', 'https://b.com/1', 'https://a.com/2']

    expect(interleaveByHost(urls).sort()).toEqual([...urls].sort())
  })

  it('does not crash on unparseable URLs', () => {
    expect(interleaveByHost(['http://%'])).toEqual(['http://%'])
  })
})
