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

  it('uses browser-like headers for Node checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404))
    vi.stubGlobal('fetch', fetchMock)

    await checkUrl('https://example.com/missing')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/missing',
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining('text/html'),
          'user-agent': expect.stringContaining('sanity-plugin-link-checker'),
        }),
        method: 'HEAD',
      }),
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

  it('classifies bot-wall statuses as unverifiable/blocked, not broken', async () => {
    // LinkedIn answers every automated request with 999 - HEAD and the GET retry alike.
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(999))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://www.linkedin.com/in/someone')

    expect(result).toEqual({status: 'unverifiable', httpStatus: 999, reason: 'blocked'})
  })

  it('retries a blocked HEAD over GET and trusts the GET outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403))
      .mockResolvedValueOnce(mockResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkUrl('https://example.com')

    expect(result).toEqual({status: 'ok', httpStatus: 200})
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com',
      expect.objectContaining({method: 'GET'}),
    )
  })

  it('waits out a 429 and retries once before classifying', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockResponse(429)) // HEAD
        .mockResolvedValueOnce(mockResponse(429)) // GET retry of the blocked HEAD
        .mockResolvedValueOnce(mockResponse(200)) // GET after the rate-limit pause
      vi.stubGlobal('fetch', fetchMock)

      const promise = checkUrl('https://example.com')
      await vi.advanceTimersByTimeAsync(2500)
      const result = await promise

      expect(result).toEqual({status: 'ok', httpStatus: 200})
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
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
