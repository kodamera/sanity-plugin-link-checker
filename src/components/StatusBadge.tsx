import {Badge} from '@sanity/ui'
import type {JSX} from 'react'

import type {DocumentState, UrlCheckResult} from '../lib/types'

export function ReferenceStatusBadge(): JSX.Element {
  return <Badge tone="critical">Dangling reference</Badge>
}

const DOC_STATE_LABEL: Record<DocumentState, string> = {
  published: 'Published',
  draft: 'Draft only',
  edited: 'Published, edited',
}

const DOC_STATE_TONE: Record<DocumentState, 'positive' | 'default' | 'caution'> = {
  published: 'positive',
  draft: 'default',
  edited: 'caution',
}

export function DocStateBadge({state}: {state?: DocumentState}): JSX.Element | null {
  if (!state) return null
  return <Badge tone={DOC_STATE_TONE[state]}>{DOC_STATE_LABEL[state]}</Badge>
}

export function LinkStatusBadge({result}: {result: UrlCheckResult}): JSX.Element {
  if (result.status === 'ok') {
    return <Badge tone="positive">{result.httpStatus ?? 'OK'}</Badge>
  }

  if (result.status === 'unverifiable') {
    return <Badge tone="default">Unverifiable</Badge>
  }

  if (result.reason === 'timeout') {
    return <Badge tone="critical">Timeout</Badge>
  }

  return <Badge tone="critical">{result.httpStatus ?? 'Broken'}</Badge>
}
