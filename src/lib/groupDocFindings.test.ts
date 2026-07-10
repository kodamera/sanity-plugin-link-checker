import {describe, expect, it} from 'vitest'

import {groupDocFindings} from './groupDocFindings'
import type {ScanFinding} from './types'

describe('groupDocFindings', () => {
  it('returns only the broken group for a document with mixed link findings', () => {
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

    const groups = groupDocFindings(findings, 'doc1', 'link')

    expect(groups).toHaveLength(1)
    expect(groups[0].finding.kind).toBe('link')
    expect(groups[0].finding.kind === 'link' ? groups[0].finding.href : null).toBe(
      'https://broken.example.com',
    )
  })

  it('falls back to ok findings when a document has no link problems', () => {
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

    const groups = groupDocFindings(findings, 'doc1', 'link')

    expect(groups).toHaveLength(2)
    const hrefs = groups.map((g) => (g.finding.kind === 'link' ? g.finding.href : null)).sort()
    expect(hrefs).toEqual(['https://ok-one.example.com', 'https://ok-two.example.com'])
    const repeated = groups.find(
      (g) => g.finding.kind === 'link' && g.finding.href === 'https://ok-one.example.com',
    )
    expect(repeated?.keys).toHaveLength(2)
  })

  it('returns only the reference group when opened as kind "reference"', () => {
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

    const groups = groupDocFindings(findings, 'doc1', 'reference')

    expect(groups).toHaveLength(1)
    expect(groups[0].finding.kind).toBe('reference')
    expect(groups[0].finding.kind === 'reference' ? groups[0].finding.refId : null).toBe(
      'missing-doc',
    )
  })

  /**
   * The bug this scoping exists to fix: a document with a broken reference AND fine links
   * previously showed the reference problem in Details no matter which section's row you
   * clicked - a link row correctly listed under the OK tab would open Details and silently
   * jump to an unrelated reference problem instead of showing the OK links you clicked on.
   */
  it('does not leak a reference problem into a details view opened as kind "link"', () => {
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

    const groups = groupDocFindings(findings, 'doc1', 'link')

    expect(groups).toHaveLength(1)
    expect(groups[0].finding.kind).toBe('link')
    expect(groups[0].finding.kind === 'link' ? groups[0].finding.href : null).toBe(
      'https://ok.example.com',
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

    expect(groupDocFindings(findings, 'doc-does-not-exist', 'link')).toEqual([])
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

    const groups = groupDocFindings(findings, 'doc1', 'link')

    expect(groups).toHaveLength(1)
    expect(groups[0].keys).toHaveLength(2)
  })
})
