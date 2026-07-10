import {describe, expect, it} from 'vitest'

import {isInternalHost} from './internalHosts'

describe('isInternalHost', () => {
  it.each([
    'http://localhost:3000/x',
    'http://LOCALHOST/x',
    'http://mystudio.local/x',
    'http://127.0.0.1/x',
    'http://127.255.255.255/x',
    'http://10.0.0.5/x',
    'http://192.168.1.5/x',
    'http://169.254.1.1/x',
    'http://172.16.0.1/x',
    'http://172.31.255.255/x',
  ])('flags %s as internal', (url) => {
    expect(isInternalHost(url)).toBe(true)
  })

  it.each([
    'http://172.32.0.1/x',
    'http://172.15.255.255/x',
    'https://example.com/x',
    'https://172.example.com/x',
    'https://mystaging.example.com/x',
  ])('does not flag %s', (url) => {
    expect(isInternalHost(url)).toBe(false)
  })

  it('flags a hostname matching a caller-supplied extra string pattern', () => {
    expect(isInternalHost('https://staging.example.com/x', ['staging.example.com'])).toBe(true)
    expect(isInternalHost('https://example.com/x', ['staging.example.com'])).toBe(false)
  })

  it('flags a hostname matching a caller-supplied RegExp pattern', () => {
    expect(isInternalHost('https://preview-42.example.com/x', [/^preview-\d+\./])).toBe(true)
  })

  it('does not throw and returns false for an unparseable URL', () => {
    expect(isInternalHost('https://example .com/x')).toBe(false)
  })
})
