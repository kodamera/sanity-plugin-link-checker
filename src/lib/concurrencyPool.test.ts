import {describe, expect, it} from 'vitest'

import {runWithConcurrency} from './concurrencyPool'

describe('runWithConcurrency', () => {
  it('preserves input order even when workers resolve out of order', async () => {
    const items = [0, 1, 2, 3]
    const results = await runWithConcurrency(items, 4, 0, async (item) => {
      if (item === 0) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      return item
    })

    expect(results).toEqual([0, 1, 2, 3])
  })

  it('never exceeds the concurrency bound', async () => {
    const items = Array.from({length: 10}, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0

    await runWithConcurrency(items, 3, 0, async (item) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return item
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('calls onProgress once per item, ending at (total, total)', async () => {
    const items = ['a', 'b', 'c']
    const calls: Array<[number, number]> = []

    await runWithConcurrency(
      items,
      2,
      0,
      async (item) => item,
      (done, total) => calls.push([done, total]),
    )

    expect(calls).toHaveLength(items.length)
    expect(calls[calls.length - 1]).toEqual([items.length, items.length])
  })

  it('resolves to an empty array for empty items', async () => {
    const results = await runWithConcurrency<number, number>([], 4, 0, async (item) => item)
    expect(results).toEqual([])
  })
})
