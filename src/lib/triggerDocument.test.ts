import {describe, expect, it} from 'vitest'

import {deserializeScanConfig, serializeScanConfig} from './triggerDocument'

describe('scan config serialization', () => {
  it('round-trips scan-scope options including RegExp excludeUrls', () => {
    const roundTripped = deserializeScanConfig(
      serializeScanConfig({
        concurrency: 8,
        timeoutMs: 5000,
        hostDelayMs: 2000,
        excludeTypes: ['person'],
        excludeUrls: ['linkedin.com', /twitter\.com\/\w+/i],
      }),
    )

    expect(roundTripped.concurrency).toBe(8)
    expect(roundTripped.timeoutMs).toBe(5000)
    expect(roundTripped.hostDelayMs).toBe(2000)
    expect(roundTripped.excludeTypes).toEqual(['person'])
    expect(roundTripped.excludeUrls).toHaveLength(2)
    expect(roundTripped.excludeUrls?.[0]).toBe('linkedin.com')
    const pattern = roundTripped.excludeUrls?.[1] as RegExp
    expect(pattern).toBeInstanceOf(RegExp)
    expect(pattern.test('https://twitter.com/someone')).toBe(true)
    expect(pattern.flags).toBe('i')
  })

  it('returns an empty config for a missing trigger payload', () => {
    expect(deserializeScanConfig(null)).toEqual({})
    expect(deserializeScanConfig(undefined)).toEqual({})
  })

  it('never serializes the checkUrl function', () => {
    const serialized = serializeScanConfig({checkUrl: async () => ({status: 'ok' as const})})
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized)
    expect('checkUrl' in serialized).toBe(false)
  })
})
