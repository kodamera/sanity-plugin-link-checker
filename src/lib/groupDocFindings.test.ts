import {describe, expect, it} from 'vitest'

import {groupDocFindings} from './groupDocFindings'
import type {ScanFinding} from './types'

describe('groupDocFindings', () => {
  it('returns only the broken group for a document with mixed findings', () => {
    const findings: ScanFinding[] = [
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[1]',
        href: 'https://ok.example.com',
        result: {status: 'ok'},
      },
    ]

    const groups = groupDocFindings(findings, 'doc1')

    expect(groups).toHaveLength(1)
    expect(groups[0].finding.kind).toBe('link')
    expect(groups[0].finding.kind === 'link' ? groups[0].finding.href : null).toBe(
      'https://broken.example.com',
    )
  })

  it('falls back to ok findings when a document has no problems', () => {
    const findings: ScanFinding[] = [
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://ok-one.example.com',
        result: {status: 'ok'},
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[1]',
        href: 'https://ok-two.example.com',
        result: {status: 'ok'},
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[2]',
        href: 'https://ok-one.example.com',
        result: {status: 'ok'},
      },
    ]

    const groups = groupDocFindings(findings, 'doc1')

    expect(groups).toHaveLength(2)
    const hrefs = groups.map((g) => (g.finding.kind === 'link' ? g.finding.href : null)).sort()
    expect(hrefs).toEqual(['https://ok-one.example.com', 'https://ok-two.example.com'])
    const repeated = groups.find(
      (g) => g.finding.kind === 'link' && g.finding.href === 'https://ok-one.example.com',
    )
    expect(repeated?.keys).toHaveLength(2)
  })

  it('returns only the reference group when a document has a dangling reference and ok links', () => {
    const findings: ScanFinding[] = [
      {
        kind: 'reference',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'related[0]',
        refId: 'missing-doc',
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://ok.example.com',
        result: {status: 'ok'},
      },
    ]

    const groups = groupDocFindings(findings, 'doc1')

    expect(groups).toHaveLength(1)
    expect(groups[0].finding.kind).toBe('reference')
    expect(groups[0].finding.kind === 'reference' ? groups[0].finding.refId : null).toBe(
      'missing-doc',
    )
  })

  it('returns an empty array when the docId is not present in the findings', () => {
    const findings: ScanFinding[] = [
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
    ]

    expect(groupDocFindings(findings, 'doc-does-not-exist')).toEqual([])
  })

  it('groups the same broken href at two field paths into one group with two keys', () => {
    const findings: ScanFinding[] = [
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'footer[0]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
    ]

    const groups = groupDocFindings(findings, 'doc1')

    expect(groups).toHaveLength(1)
    expect(groups[0].keys).toHaveLength(2)
  })
})
