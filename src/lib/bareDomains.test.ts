import {describe, expect, it} from 'vitest'

import {looksLikeBareDomain} from './bareDomains'

describe('looksLikeBareDomain', () => {
  it.each(['example.com', 'kodamera.se', 'my-site.io', 'example.dev', 'a.tech', 'sub.example.com'])(
    'flags %s as a bare domain',
    (value) => {
      expect(looksLikeBareDomain(value)).toBe(true)
    },
  )

  it.each([
    'Node.js',
    'README.md',
    'install.sh',
    'script.py',
    'photo.jpg',
    'report.pdf',
    'data.csv',
    'styles.css',
    'package.json',
    '1.2.3',
    'v2.0',
    '3.14',
    'e.g.',
    'i.e.',
    'Mr. Smith',
    'J.R.R. Tolkien',
    'see example.com for more',
    'nodot',
  ])('does not flag %s', (value) => {
    expect(looksLikeBareDomain(value)).toBe(false)
  })
})
