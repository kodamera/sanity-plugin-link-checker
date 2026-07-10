import {describe, expect, it} from 'vitest'

import {isMalformedUrl} from './urlSyntax'

describe('isMalformedUrl', () => {
  it.each([
    'https://example .com',
    'https://exa mple.com/path',
    'https://example.com:notaport/',
    'https://[not-valid-ipv6]/',
    'https://',
  ])('flags %s as malformed', (url) => {
    expect(isMalformedUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com',
    'https://example.com/page one',
    'https://example.com.',
    'https://example.com/page).',
    'https://example.com/%zz',
  ])('does not flag %s (WHATWG URL parses it, even though it looks odd)', (url) => {
    expect(isMalformedUrl(url)).toBe(false)
  })
})
