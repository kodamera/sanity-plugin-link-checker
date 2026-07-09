import {describe, expect, it} from 'vitest'

import {formatFocusPath, formatPath, type PathSegment, walkDocument} from './walkDocument'

describe('walkDocument', () => {
  it('visits every nested value', () => {
    const doc = {a: {b: [{_key: 'k1', c: 1}]}}
    const visited = new Set<string>()

    walkDocument(doc, [], (_value, path) => {
      visited.add(formatPath(path))
    })

    expect(visited.has('')).toBe(true)
    expect(visited.has('a')).toBe(true)
    expect(visited.has('a.b')).toBe(true)
    expect(visited.has('a.b[0]')).toBe(true)
    expect(visited.has('a.b[0].c')).toBe(true)
    expect(visited.has('a.b[0]._key')).toBe(true)
  })
})

describe('formatPath', () => {
  it('renders array indices without a leading dot', () => {
    const path: PathSegment[] = [{index: 10}, 'markDefs', {index: 1}]
    expect(formatPath(path)).toBe('[10].markDefs[1]')
  })

  it('renders a string segment followed by an array index', () => {
    const path: PathSegment[] = ['richText', {index: 10}]
    expect(formatPath(path)).toBe('richText[10]')
  })
})

describe('formatFocusPath', () => {
  it('renders keyed array segments in the _key=="..." form', () => {
    const path: PathSegment[] = [
      'richText',
      {index: 0, key: 'a1b2'},
      'markDefs',
      {index: 1, key: 'c3d4'},
    ]
    expect(formatFocusPath(path)).toBe('richText[_key=="a1b2"].markDefs[_key=="c3d4"]')
  })

  it('falls back to numeric index when the array item has no _key', () => {
    const path: PathSegment[] = ['arr', {index: 2}]
    expect(formatFocusPath(path)).toBe('arr[2]')
  })
})
