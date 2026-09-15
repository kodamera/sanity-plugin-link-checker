import {describe, expect, it} from 'vitest'

import {
  type BrokenLink,
  type BrokenReference,
  getFindingKey,
  isAcknowledged,
  isProblemFinding,
} from './types'

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

function link(status: 'ok' | 'broken' | 'unverifiable'): BrokenLink {
  return {
    kind: 'link',
    fromId: 'doc1',
    fromType: 'post',
    fieldPath: 'body[0].markDefs[0]',
    href: 'https://example.com',
    result: {status},
  }
}

const reference: BrokenReference = {
  kind: 'reference',
  fromId: 'doc1',
  fromType: 'post',
  fieldPath: 'author',
  refId: 'author1',
}

describe('isProblemFinding', () => {
  it('always counts a reference finding', () => {
    expect(isProblemFinding(reference)).toBe(true)
  })

  it('counts a broken link', () => {
    expect(isProblemFinding(link('broken'))).toBe(true)
  })

  it('does not count an ok link', () => {
    expect(isProblemFinding(link('ok'))).toBe(false)
  })

  it('does not count an unverifiable link by default', () => {
    expect(isProblemFinding(link('unverifiable'))).toBe(false)
  })

  it('counts an unverifiable link when includeUnverifiable is set', () => {
    expect(isProblemFinding(link('unverifiable'), {includeUnverifiable: true})).toBe(true)
  })

  it('still never counts an ok link even with includeUnverifiable set', () => {
    expect(isProblemFinding(link('ok'), {includeUnverifiable: true})).toBe(false)
  })
})

describe('isAcknowledged', () => {
  it('is true when the finding key is in acknowledgedKeys', () => {
    const report = {acknowledgedKeys: [getFindingKey(reference)]}
    expect(isAcknowledged(report, reference)).toBe(true)
  })

  it('is false when the finding key is absent', () => {
    const report = {acknowledgedKeys: ['reference:other:field:ref']}
    expect(isAcknowledged(report, reference)).toBe(false)
  })

  it('is false when acknowledgedKeys is absent entirely', () => {
    expect(isAcknowledged({}, reference)).toBe(false)
  })
})
