import {Badge, Text, Tooltip} from '@sanity/ui'
import type {ComponentProps, JSX} from 'react'
import {DocumentStatus, DocumentStatusIndicator, useTranslation} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'
import type {DocumentState, DocumentStateUpdatedAt, UrlCheckResult} from '../lib/types'

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
  const {t} = useTranslation(linkCheckerLocaleNamespace)

  return (
    <StatusTooltip description={t('status.points-to-deleted-document')}>
      <Badge tone="critical" fontSize={0}>
        {t('badge.dangling-reference')}
      </Badge>
    </StatusTooltip>
  )
}

// The indicator only checks presence of draft/published to decide which dots to draw, and
// the tooltip content reads `_updatedAt` - a minimal stub carries everything both need.
// (The indicator's prop type wants a full document stub, hence the cast.)
type IndicatorStub = NonNullable<ComponentProps<typeof DocumentStatusIndicator>['draft']>

function stubOf(updatedAt: string | undefined): IndicatorStub {
  return {_updatedAt: updatedAt ?? ''} as unknown as IndicatorStub
}

/**
 * Sanity's own document-status lockup: the overlapping green/amber dots from the Studio's
 * document lists (`DocumentStatusIndicator`) with the native "Published - Edited Dec 6 /
 * Draft - Edited 3 hr. ago" tooltip (`DocumentStatus`, relative times and Studio i18n
 * included) - rather than hand-drawn dots that only imitate them.
 */
export function DocStateDot({
  state,
  updatedAt,
}: {
  state?: DocumentState
  updatedAt?: DocumentStateUpdatedAt
}): JSX.Element | null {
  if (!state) return null
  const draft = state === 'published' ? undefined : stubOf(updatedAt?.draft)
  const published = state === 'draft' ? undefined : stubOf(updatedAt?.published)

  return (
    <Tooltip
      content={<DocumentStatus draft={draft ?? null} published={published ?? null} />}
      placement="top"
      portal
    >
      {/* The wrapper is the actual hover/focus target - larger than the dots themselves,
          so hitting "near" them still triggers the tooltip instead of requiring pixel
          precision. */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          minWidth: 16,
          height: 16,
        }}
      >
        <DocumentStatusIndicator draft={draft} published={published} />
      </span>
    </Tooltip>
  )
}

const HTTP_STATUS_DESCRIPTION_KEYS: Record<number, string> = {
  400: 'status.bad-request',
  401: 'status.requires-login',
  403: 'status.forbidden',
  404: 'status.not-found',
  410: 'status.intentionally-removed',
  429: 'status.rate-limited',
  500: 'status.internal-server-error',
  502: 'status.bad-gateway',
  503: 'status.service-unavailable',
  504: 'status.gateway-timeout',
  520: 'status.unknown-server-error',
}

function httpStatusDescription(
  httpStatus: number | undefined,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (!httpStatus) return t('status.server-error')
  const key = HTTP_STATUS_DESCRIPTION_KEYS[httpStatus]
  if (key) return t(key)
  if (httpStatus >= 500) return t('status.server-error-with-code', {status: httpStatus})
  if (httpStatus >= 400) return t('status.client-error', {status: httpStatus})
  return t('status.unexpected-status', {status: httpStatus})
}

function describeLinkStatus(
  result: UrlCheckResult,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (result.status === 'ok') return t('status.responded-successfully')

  if (result.status === 'unverifiable') {
    if (result.reason === 'cors') return t('status.blocked-by-cors')
    if (result.reason === 'blocked') return t('status.blocked-by-site')
    return t('status.status-unconfirmed')
  }

  if (result.reason === 'internal-host') return t('status.internal-host')
  if (result.reason === 'malformed-url') return t('status.malformed-url')
  if (result.reason === 'missing-protocol') return t('status.missing-protocol')
  if (result.reason === 'timeout') return t('status.server-did-not-respond')
  if (result.reason === 'network') return t('status.could-not-connect')
  return httpStatusDescription(result.httpStatus, t)
}

export function LinkStatusBadge({result}: {result: UrlCheckResult}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const description = describeLinkStatus(result, t)

  if (result.status === 'ok') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="positive" fontSize={1}>
          {result.httpStatus ?? t('badge.ok')}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.status === 'unverifiable') {
    // Bot walls get a caution badge showing the actual status code (999, 429, ...) - the
    // code is the interesting part ("why does it say broken when it works?"), and caution
    // separates "a machine was turned away" from critical "confirmed dead".
    if (result.reason === 'blocked') {
      return (
        <StatusTooltip description={description}>
          <Badge tone="caution" fontSize={1}>
            {result.httpStatus ?? t('badge.blocked')}
          </Badge>
        </StatusTooltip>
      )
    }
    return (
      <StatusTooltip description={description}>
        <Badge tone="default" fontSize={1}>
          {t('badge.unverifiable')}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.reason === 'internal-host') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="critical" fontSize={1}>
          {t('badge.internal-host')}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.reason === 'malformed-url') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="critical" fontSize={1}>
          {t('badge.malformed-url')}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.reason === 'missing-protocol') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="critical" fontSize={1}>
          {t('badge.missing-protocol')}
        </Badge>
      </StatusTooltip>
    )
  }

  if (result.reason === 'timeout') {
    return (
      <StatusTooltip description={description}>
        <Badge tone="critical" fontSize={1}>
          {t('badge.timeout')}
        </Badge>
      </StatusTooltip>
    )
  }

  return (
    <StatusTooltip description={description}>
      <Badge tone="critical" fontSize={1}>
        {result.httpStatus ?? t('badge.broken')}
      </Badge>
    </StatusTooltip>
  )
}
