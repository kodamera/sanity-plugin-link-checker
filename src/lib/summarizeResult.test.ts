import {describe, expect, it} from 'vitest'

import {summarizeResult} from './summarizeResult'
import type {ScanFinding, ScanResult} from './types'

function makeResult(findings: ScanFinding[]): ScanResult {
  return {
    ranAt: '2026-07-09T00:00:00.000Z',
    documentsScanned: 3,
    urlsChecked: findings.length,
    source: 'cli',
    findings,
  }
}

describe('summarizeResult', () => {
  it('does not treat ok links as issues (regression: CLI used to fail CI on this)', () => {
    const result = makeResult([
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://example.com',
        result: {status: 'ok'},
      },
      {
        kind: 'link',
        fromId: 'doc2',
        fromType: 'page',
        fieldPath: 'body[1]',
        href: 'https://example.org',
        result: {status: 'ok'},
      },
    ])

    expect(summarizeResult(result)).toEqual({
      brokenRefs: 0,
      brokenLinks: 0,
      unverifiableLinks: 0,
      documentsWithIssues: 0,
      issueCount: 0,
    })
  })

  it('counts references and broken links as issues, but not ok/unverifiable links', () => {
    const result = makeResult([
      {
        kind: 'reference',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'related[0]',
        refId: 'missing-doc',
      },
      {
        kind: 'link',
        fromId: 'doc2',
        fromType: 'page',
        fieldPath: 'body[0]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
      {
        kind: 'link',
        fromId: 'doc3',
        fromType: 'page',
        fieldPath: 'body[1]',
        href: 'https://ok.example.com',
        result: {status: 'ok'},
      },
      {
        kind: 'link',
        fromId: 'doc4',
        fromType: 'page',
        fieldPath: 'body[2]',
        href: 'https://unverifiable.example.com',
        result: {status: 'unverifiable', reason: 'cors'},
      },
    ])

    expect(summarizeResult(result)).toEqual({
      brokenRefs: 1,
      brokenLinks: 1,
      unverifiableLinks: 1,
      documentsWithIssues: 2,
      issueCount: 2,
    })
  })

  it('counts the same URL at several field paths in one document as one problem', () => {
    const result = makeResult([
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
        fieldPath: 'body[7]',
        href: 'https://broken.example.com',
        result: {status: 'broken', httpStatus: 404},
      },
      {
        kind: 'link',
        fromId: 'doc1',
        fromType: 'page',
        fieldPath: 'footer[0]',
        href: 'https://also-broken.example.com',
        result: {status: 'broken', httpStatus: 410},
      },
    ])

    expect(summarizeResult(result)).toEqual({
      brokenRefs: 0,
      brokenLinks: 2,
      unverifiableLinks: 0,
      documentsWithIssues: 1,
      issueCount: 2,
    })
  })

  it('returns all zeros for empty findings', () => {
    const result = makeResult([])

    expect(summarizeResult(result)).toEqual({
      brokenRefs: 0,
      brokenLinks: 0,
      unverifiableLinks: 0,
      documentsWithIssues: 0,
      issueCount: 0,
    })
  })
})
