/**
 * Headless (no React/@sanity/ui) scanning logic, for use outside the Studio - a Sanity
 * Document/Scheduled Function, a custom CI script, etc. The Studio plugin itself (the
 * default export of this package) uses the same code internally.
 */
export {
  readReport,
  REPORT_DOC_ID,
  REPORT_DOC_TYPE,
  toggleAcknowledged,
  writeReport,
} from './lib/reportDocument'
export {runScan} from './lib/runScan'
export {summarizeResult} from './lib/summarizeResult'
export {
  readTriggerScanConfig,
  TRIGGER_DOC_ID,
  TRIGGER_DOC_TYPE,
  writeTrigger,
} from './lib/triggerDocument'
export type {
  BrokenLink,
  BrokenReference,
  DocumentState,
  LinkCheckerPluginConfig,
  ScanFinding,
  ScanResult,
  UrlCheckResult,
} from './lib/types'
export {getFindingKey} from './lib/types'
