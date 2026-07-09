import {Badge, Text, Tooltip} from '@sanity/ui'
import type {JSX} from 'react'
import {useCurrentLocale, useTranslation} from 'sanity'

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

// Fixed semantic colors (not theme tone tokens) - a status dot reads the same saturated hue
// on light or dark, same as Sanity's own draft/publish indicators.
const DOC_STATE_DOT_COLOR = {
  draft: '#F7B500',
  published: '#43D675',
}

type DocStateVariant = keyof typeof DOC_STATE_DOT_COLOR

// Matches Sanity's own "dot" icon exactly (same viewBox, same <circle> r/cx/cy/stroke-width -
// inspected from Sanity's own release-status dot: `data-sanity-icon="dot"`, a 25x25 viewBox
// with a `<circle cx="12.5" cy="12.5" r="2.5" fill="currentColor" stroke="currentColor"
// stroke-width="1.2">`), rather than a plain CSS border-radius div, so it reads as the same
// visual language as status dots elsewhere in the Studio. Color is set via `color` (not fill
// directly) so `currentColor` picks it up, matching how Sanity's own icon is colored via a
// CSS custom property.
function formatUpdatedAt(value: string | undefined, locale: string): string | undefined {
  if (!value) return undefined
  return new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(
    new Date(value),
  )
}

function DotIcon({label, variant}: {label: string; variant: DocStateVariant}): JSX.Element {
  return (
    <Tooltip content={<Text size={1}>{label}</Text>} placement="top" portal>
      {/* The wrapper is the actual hover/focus target (16px) - larger than the icon itself,
          so hitting "near" the dot still triggers the tooltip instead of requiring pixel
          precision. */}
      <span
        aria-label={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 16,
          height: 16,
          color: DOC_STATE_DOT_COLOR[variant],
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

export function DocStateDot({
  state,
  updatedAt,
}: {
  state?: DocumentState
  updatedAt?: DocumentStateUpdatedAt
}): JSX.Element | null {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const currentLocale = useCurrentLocale()
  if (!state) return null
  const draftDate = formatUpdatedAt(updatedAt?.draft, currentLocale.id)
  const publishedDate = formatUpdatedAt(updatedAt?.published, currentLocale.id)
  const draftLabel = draftDate
    ? t('doc-state.draft-with-date', {date: draftDate})
    : t('doc-state.draft')
  const publishedLabel = publishedDate
    ? t('doc-state.published-with-date', {date: publishedDate})
    : t('doc-state.published')

  if (state === 'edited') {
    return (
      <span style={{display: 'inline-flex', gap: 2}}>
        <DotIcon label={publishedLabel} variant="published" />
        <DotIcon label={draftLabel} variant="draft" />
      </span>
    )
  }

  return state === 'published' ? (
    <DotIcon label={publishedLabel} variant="published" />
  ) : (
    <DotIcon label={draftLabel} variant="draft" />
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
    return result.reason === 'cors' ? t('status.blocked-by-cors') : t('status.status-unconfirmed')
  }

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
    return (
      <StatusTooltip description={description}>
        <Badge tone="default" fontSize={1}>
          {t('badge.unverifiable')}
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
