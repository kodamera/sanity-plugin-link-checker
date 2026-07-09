import {afterEach, describe, expect, it, vi} from 'vitest'

import {checkUrl} from './checkUrl'

function mockResponse(status: number, type = 'basic') {
  return {status, type} as Response
}

describe('checkUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ok for a 200 HEAD response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'ok', httpStatus: 200})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({method: 'HEAD'}),
    )
  })

  it('falls back to GET when HEAD returns 405', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(405))
      .mockResolvedValueOnce(mockResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'ok', httpStatus: 200})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com',
      expect.objectContaining({method: 'HEAD'}),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com',
      expect.objectContaining({method: 'GET'}),
    )
  })

  it('falls back to GET when HEAD throws (connection-level rejection)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('head rejected'))
      .mockResolvedValueOnce(mockResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'ok', httpStatus: 200})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('classifies a >=400 status as a broken http-error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'broken', httpStatus: 404, reason: 'http-error'})
  })

  it('classifies a thrown TimeoutError DOMException as a timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'broken', reason: 'timeout'})
  })

  it('classifies other thrown errors as broken/network in Node', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'broken', reason: 'network'})
  })
})
