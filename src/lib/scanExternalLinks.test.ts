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
