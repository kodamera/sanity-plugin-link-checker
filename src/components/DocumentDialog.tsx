import {Box, Button, Dialog, Flex, Stack, Text} from '@sanity/ui'
import type {JSX} from 'react'
import {useSchema, useTranslation, useValuePreview} from 'sanity'

import {linkCheckerLocaleNamespace} from '../i18n'
import {describeFieldPath} from '../lib/humanizeFieldPath'
import type {PreviewDocumentValue} from '../lib/resolvePreviewDocuments'
import type {ScanFinding} from '../lib/types'
import {
  type FindingGroup,
  isActionable,
  OpenLinkButton,
  ResolveButton,
  StatusBadgeFor,
  useResolveToggle,
} from './ResultRow'

/**
 * One line per distinct URL/reference in the inspected document. Everything opens in a
 * NEW tab (plain anchors with target="_blank") - the dialog is the editor's working
 * context and must survive excursions to the site or the document editor.
 */
function DialogRow({
  group,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  showDivider,
  showMeta,
}: {
  group: FindingGroup
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  editHref: (f: ScanFinding, focus?: boolean) => string
  showDivider: boolean
  /** The field-path line earns its ink when it disambiguates between several rows or
   * several occurrences - for a document's single, single-occurrence problem it just
   * echoes a field name ("Url") under the URL itself. */
  showMeta: boolean
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const {finding, keys} = group
  const {acknowledged, toggle} = useResolveToggle(keys, acknowledgedKeys, onToggleAcknowledged)

  const value = finding.kind === 'reference' ? finding.refId : finding.href
  const placesSuffix = keys.length > 1 ? ` · ${t('result.occurrences', {count: keys.length})}` : ''

  return (
    <Flex
      align="flex-start"
      gap={3}
      paddingY={3}
      style={{
        borderBottom: showDivider ? '1px solid var(--card-border-color)' : undefined,
        opacity: acknowledged ? 0.5 : 1,
      }}
    >
      <Stack gap={2} flex={1} style={{minWidth: 0}}>
        {/* Full value, wrapped rather than clamped - reading the exact URL is what this
            dialog is for. Links to the document focused at this occurrence, in a new tab. */}
        <Text size={1}>
          <a
            href={editHref(finding)}
            target="_blank"
            rel="noopener noreferrer"
            style={{color: 'inherit'}}
          >
            <span style={{wordBreak: 'break-all'}}>{value}</span>
          </a>
        </Text>
        {(showMeta || keys.length > 1) && (
          <Text size={1} muted>
            {describeFieldPath(finding.fieldPath)}
            {placesSuffix}
          </Text>
        )}
      </Stack>
      <Flex align="center" gap={2} style={{flexShrink: 0}}>
        <StatusBadgeFor finding={finding} />
        {finding.kind === 'link' && <OpenLinkButton href={finding.href} />}
        {isActionable(finding, acknowledged) && (
          <ResolveButton acknowledged={acknowledged} onClick={toggle} />
        )}
      </Flex>
    </Flex>
  )
}

/**
 * The per-document detail view: every distinct problem URL/reference in one document,
 * with the exact status code, open-in-new-tab, and per-URL resolve. Opened via the
 * row's Details button; which document is open lives in the tool's router state
 * (`/doc/:inspectDocId`), so refresh and the back button restore it.
 */
export function DocumentDialog({
  groups,
  previewDocument,
  acknowledgedKeys,
  onToggleAcknowledged,
  editHref,
  onClose,
}: {
  /** Every URL/reference group of the inspected document, length >= 1. */
  groups: FindingGroup[]
  previewDocument?: PreviewDocumentValue
  acknowledgedKeys: Set<string>
  onToggleAcknowledged: (key: string) => void
  editHref: (f: ScanFinding, focus?: boolean) => string
  onClose: () => void
}): JSX.Element {
  const {t} = useTranslation(linkCheckerLocaleNamespace)
  const schema = useSchema()
  const finding = groups[0].finding
  const schemaType = schema.get(finding.fromType)
  const preview = useValuePreview({
    enabled: Boolean(schemaType && previewDocument),
    schemaType,
    value: previewDocument,
  })
  const title =
    (preview.value?.title as string | undefined) ?? `${finding.fromType} (${finding.fromId})`
  const typeLabel = schemaType?.title ?? finding.fromType

  return (
    <Dialog
      id="link-checker-document-dialog"
      header={
        <span>
          {title}{' '}
          <span style={{color: 'var(--card-muted-fg-color)', fontWeight: 400}}>· {typeLabel}</span>
        </span>
      }
      onClose={onClose}
      onClickOutside={onClose}
      width={1}
    >
      <Box padding={4}>
        <Stack gap={3}>
          <Stack gap={0}>
            {groups.map((group, index) => (
              <DialogRow
                key={group.keys[0]}
                group={group}
                acknowledgedKeys={acknowledgedKeys}
                onToggleAcknowledged={onToggleAcknowledged}
                editHref={editHref}
                showDivider={index < groups.length - 1}
                showMeta={groups.length > 1}
              />
            ))}
          </Stack>
          <Flex justify="flex-end">
            <Button
              as="a"
              href={editHref(finding, false)}
              target="_blank"
              rel="noopener noreferrer"
              text={t('dialog.open-document')}
              tone="primary"
              mode="ghost"
              fontSize={1}
            />
          </Flex>
        </Stack>
      </Box>
    </Dialog>
  )
}
