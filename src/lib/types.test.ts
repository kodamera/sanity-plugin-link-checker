import {describe, expect, it} from 'vitest'

import {type BrokenLink, type BrokenReference, getFindingKey} from './types'

describe('getFindingKey', () => {
  it('builds a reference finding key from kind, fromId, fieldPath and refId', () => {
    const finding: BrokenReference = {
      kind: 'reference',
      fromId: 'doc1',
      fromType: 'post',
      fieldPath: 'author',
      refId: 'author1',
    }

    expect(getFindingKey(finding)).toBe('reference:doc1:author:author1')
  })

  it('builds a link finding key from kind, fromId, fieldPath and href', () => {
    const finding: BrokenLink = {
      kind: 'link',
      fromId: 'doc1',
      fromType: 'post',
      fieldPath: 'body[0].markDefs[0]',
      href: 'https://example.com',
      result: {status: 'broken', reason: 'http-error', httpStatus: 404},
    }

    expect(getFindingKey(finding)).toBe('link:doc1:body[0].markDefs[0]:https://example.com')
  })

  it('produces equal keys for two independently-constructed identical findings', () => {
    const a: BrokenReference = {
      kind: 'reference',
      fromId: 'doc1',
      fromType: 'post',
      fieldPath: 'author',
      refId: 'author1',
    }
    const b: BrokenReference = {
      kind: 'reference',
      fromId: 'doc1',
      fromType: 'post',
      fieldPath: 'author',
      refId: 'author1',
    }

    expect(getFindingKey(a)).toBe(getFindingKey(b))
  })
})
