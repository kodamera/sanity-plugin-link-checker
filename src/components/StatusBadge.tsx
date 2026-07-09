import {Badge, Text, Tooltip} from '@sanity/ui'
import type {JSX} from 'react'

import type {DocumentState, UrlCheckResult} from '../lib/types'

// Plain Text as tooltip content, no extra padding/box - Tooltip already supplies its own
// compact chrome (dark pill, tight padding), same as Sanity's own status tooltips.
function StatusTooltip({
  description,
  children,
}: {
  description: string
  children: JSX.Element
}): JSX.Element {
  return (
    <Tooltip content={<Text size={1}>{description}</Text>} placement="top" portal>
      {children}
    </Tooltip>
  )
}

export function ReferenceStatusBadge(): JSX.Element {
  return (
    <StatusTooltip description="Points to a deleted document">
      <Badge tone="critical" fontSize={0}>
        Dangling reference
      </Badge>
    </StatusTooltip>
  )
}

const DOC_STATE_LABEL: Record<DocumentState, string> = {
  published: 'Published',
  draft: 'Draft only',
  edited: 'Published, edited',
}

// Fixed semantic colors (not theme tone tokens) - a status dot reads the same saturated hue
// on light or dark, same as Sanity's own draft/publish indicators.
const DOC_STATE_DOT_COLOR: Record<DocumentState, string> = {
  published: '#43D675',
  draft: '#899193',
  edited: '#F7B500',
}

// Matches Sanity's own "dot" icon exactly (same viewBox, same <circle> r/cx/cy/stroke-width -
// inspected from Sanity's own release-status dot: `data-sanity-icon="dot"`, a 25x25 viewBox
// with a `<circle cx="12.5" cy="12.5" r="2.5" fill="currentColor" stroke="currentColor"
// stroke-width="1.2">`), rather than a plain CSS border-radius div, so it reads as the same
// visual language as status dots elsewhere in the Studio. Color is set via `color` (not fill
// directly) so `currentColor` picks it up, matching how Sanity's own icon is colored via a
// CSS custom property.
export function DocStateDot({state}: {state?: DocumentState}): JSX.Element | null {
  if (!state) return null
  return (
    <Tooltip content={<Text size={1}>{DOC_STATE_LABEL[state]}</Text>} placement="top" portal>
      {/* The wrapper is the actual hover/focus target (16px) - larger than the icon itself,
          so hitting "near" the dot still triggers the tooltip instead of requiring pixel
          precision. */}
      <span
        aria-label={DOC_STATE_LABEL[state]}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 16,
          height: 16,
          color: DOC_STATE_DOT_COLOR[state],
        }}
      >
        <svg viewBox="0 0 25 25" width={16} height={16} fill="none">
          <circle
            cx="12.5"
            cy="12.5"
            r="2.5"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </span>
    </Tooltip>
  )
}

const HTTP_STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad request',
  401: 'Requires login',
  403: 'Forbidden',
  404: 'Not found',
  410: 'Intentionally removed',
  429: 'Rate-limited',
  500: 'Internal server error',
  502: 'Bad gateway',
  503: 'Service unavailable',
  504: 'Gateway timeout',
  520: 'Unknown server error',
}

function httpStatusDescription(httpStatus: number | undefined): string {
  if (!httpStatus) return 'Server error'
  if (HTTP_STATUS_DESCRIPTIONS[httpStatus]) return HTTP_STATUS_DESCRIPTIONS[httpStatus]
  if (httpStatus >= 500) return `Server error (${httpStatus})`
  if (httpStatus >= 400) return `Client error (${httpStatus})`
  return `Unexpected status ${httpStatus}`
}

function describeLinkStatus(result: UrlCheckResult): string {
  if (result.status === 'ok') return 'Responded successfully'

  if (result.status === 'unverifiable') {
    return result.reason === 'cors' ? 'Blocked by CORS - may not be broken' : 'Status unconfirmed'
  }

  if (result.reason === 'timeout') return "Server didn't respond in time"
  if (result.reason === 'network') return 'Could not connect to server'
  return httpStatusDescription(result.httpStatus)
}

export function LinkStatusBadge({result}: {result: UrlCheckResult}): JSX.Element {
  const description = describeLinkStatus(result)

  if (result.status === 'ok') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="positive" fontSize={1}>
          {result.httpStatus ?? 'OK'}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.status === 'unverifiable') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="default" fontSize={1}>
          Unverifiable
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.reason === 'timeout') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="critical" fontSize={1}>
          Timeout
        </Badge>
      </StatusTooltip>
    )
  }

  return (
    <StatusTooltip description={description}>
      <Badge tone="critical" fontSize={1}>
        {result.httpStatus ?? 'Broken'}
      </Badge>
    </StatusTooltip>
  )
}
