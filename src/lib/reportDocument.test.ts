import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {writeReport} from './reportDocument'
import type {ScanResult} from './types'

const baseResult: ScanResult = {
  ranAt: '2026-07-09T00:00:00.000Z',
  findings: [],
  documentsScanned: 3,
  urlsChecked: 2,
  source: 'cli',
}

describe('writeReport', () => {
  it('carries forward acknowledgedKeys from the existing report', async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue({acknowledgedKeys: ['k1']}),
      createOrReplace: vi.fn().mockResolvedValue(undefined),
    } as unknown as SanityClient

    await writeReport(client, baseResult)

    expect(client.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'link-checker-report',
        _type: 'linkCheckerReport',
        acknowledgedKeys: ['k1'],
      }),
    )
  })

  it('defaults acknowledgedKeys to an empty array when no report exists', async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue(null),
      createOrReplace: vi.fn().mockResolvedValue(undefined),
    } as unknown as SanityClient

    await writeReport(client, baseResult)

    expect(client.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'link-checker-report',
        _type: 'linkCheckerReport',
        acknowledgedKeys: [],
      }),
    )
  })
})
