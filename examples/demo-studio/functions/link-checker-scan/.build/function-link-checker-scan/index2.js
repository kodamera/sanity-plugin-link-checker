import { getPublishedId, DocumentId, getDraftId } from "@sanity/id-utils";
const REPORT_DOC_ID = "link-checker-report", REPORT_DOC_TYPE = "linkCheckerReport";
async function writeReport(client, result) {
  const existing = await client.fetch(
    "*[_id == $id][0]{acknowledgedKeys}",
    { id: REPORT_DOC_ID }
  );
  await client.createOrReplace({
    _id: REPORT_DOC_ID,
    _type: REPORT_DOC_TYPE,
    ...result,
    acknowledgedKeys: existing?.acknowledgedKeys ?? []
  });
}
const isNode = typeof window > "u", NODE_REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (compatible; sanity-plugin-link-checker/1.0; +https://github.com/kodamera/sanity-plugin-link-checker)"
}, BLOCKED_STATUSES = /* @__PURE__ */ new Set([401, 403, 407, 429, 999]), RATE_LIMIT_RETRY_DELAY_MS = 2500;
async function attemptFetch(url, method, timeoutMs) {
  return fetch(url, {
    headers: isNode ? NODE_REQUEST_HEADERS : void 0,
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
}
async function checkUrl(url, timeoutMs = 8e3) {
  try {
    let response;
    try {
      response = await attemptFetch(url, "HEAD", timeoutMs), (response.status === 405 || response.status === 501 || BLOCKED_STATUSES.has(response.status)) && (response = await attemptFetch(url, "GET", timeoutMs));
    } catch {
      response = await attemptFetch(url, "GET", timeoutMs);
    }
    return !isNode && response.type === "opaque" ? { status: "unverifiable", reason: "cors" } : (response.status === 429 && (await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS)), response = await attemptFetch(url, "GET", timeoutMs)), BLOCKED_STATUSES.has(response.status) ? { status: "unverifiable", httpStatus: response.status, reason: "blocked" } : response.status >= 400 ? { status: "broken", httpStatus: response.status, reason: "http-error" } : { status: "ok", httpStatus: response.status });
  } catch (err) {
    return err instanceof DOMException && err.name === "TimeoutError" ? { status: "broken", reason: "timeout" } : isNode ? { status: "broken", reason: "network" } : { status: "unverifiable", reason: "network" };
  }
}
async function runWithConcurrency(items, concurrency, delayMs, worker, onProgress) {
  const results = new Array(items.length);
  let cursor = 0, completed = 0;
  async function runNext() {
    const index = cursor++;
    index >= items.length || (index > 0 && index % concurrency === 0 && delayMs > 0 && await new Promise((resolve) => setTimeout(resolve, delayMs)), results[index] = await worker(items[index], index), completed += 1, onProgress?.(completed, items.length), await runNext());
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  return await Promise.all(runners), results;
}
function itemKey(item) {
  if (item !== null && typeof item == "object" && typeof item._key == "string")
    return item._key;
}
function walkDocument(value, path, visit) {
  if (visit(value, path), Array.isArray(value)) {
    value.forEach(
      (item, index) => walkDocument(item, [...path, { index, key: itemKey(item) }], visit)
    );
    return;
  }
  if (value !== null && typeof value == "object")
    for (const key of Object.keys(value))
      walkDocument(value[key], [...path, key], visit);
}
function formatPath(path) {
  return path.reduce((acc, segment) => typeof segment == "string" ? acc ? `${acc}.${segment}` : segment : `${acc}[${segment.index}]`, "");
}
function formatFocusPath(path) {
  return path.reduce((acc, segment) => typeof segment == "string" ? acc ? `${acc}.${segment}` : segment : segment.key ? `${acc}[_key=="${segment.key}"]` : `${acc}[${segment.index}]`, "");
}
const URL_PATTERN = /^https?:\/\//i;
function extractPortableTextLinks(doc) {
  const occurrences = [];
  return walkDocument(doc, [], (value, path) => {
    typeof value == "string" && URL_PATTERN.test(value) && occurrences.push({
      fromId: doc._id,
      fromType: doc._type,
      fieldPath: formatPath(path),
      focusPath: formatFocusPath(path),
      href: value
    });
  }), occurrences;
}
function interleaveByHost(urls) {
  const byHost = /* @__PURE__ */ new Map();
  for (const url of urls) {
    const host = hostOf(url), bucket = byHost.get(host);
    bucket ? bucket.push(url) : byHost.set(host, [url]);
  }
  const buckets = Array.from(byHost.values()), interleaved = [];
  for (let i = 0; interleaved.length < urls.length; i++)
    for (const bucket of buckets)
      i < bucket.length && interleaved.push(bucket[i]);
  return interleaved;
}
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
function withHostPacing(checker, delayMs) {
  const lastRequestAt = /* @__PURE__ */ new Map();
  return async (url) => {
    const host = hostOf(url);
    for (; ; ) {
      const last = lastRequestAt.get(host), waitMs = last === void 0 ? 0 : last + delayMs - Date.now();
      if (waitMs <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return lastRequestAt.set(host, Date.now()), checker(url);
  };
}
async function scanExternalLinks(docs, config, onProgress) {
  const excludeUrls = config.excludeUrls ?? [], isExcluded = (url) => excludeUrls.some(
    (pattern) => typeof pattern == "string" ? url.includes(pattern) : pattern.test(url)
  ), occurrences = docs.flatMap((doc) => extractPortableTextLinks(doc)).filter((occ) => !isExcluded(occ.href)), uniqueUrls = interleaveByHost(Array.from(new Set(occurrences.map((o) => o.href))));
  if (uniqueUrls.length === 0)
    return { findings: [], urlsChecked: 0 };
  const concurrency = config.concurrency ?? 4, timeoutMs = config.timeoutMs ?? 8e3, baseChecker = config.checkUrl ?? ((url) => checkUrl(url, timeoutMs)), checker = withHostPacing(baseChecker, config.hostDelayMs ?? 1e3), results = await runWithConcurrency(
    uniqueUrls,
    concurrency,
    150,
    (url) => checker(url),
    onProgress
  ), resultByUrl = new Map(uniqueUrls.map((url, i) => [url, results[i]]));
  return { findings: occurrences.map((occ) => ({
    kind: "link",
    fromId: occ.fromId,
    fromType: occ.fromType,
    fieldPath: occ.fieldPath,
    focusPath: occ.focusPath,
    href: occ.href,
    result: resultByUrl.get(occ.href)
  })), urlsChecked: uniqueUrls.length };
}
async function scanInternalRefs(client, docs) {
  const candidates = [];
  for (const doc of docs)
    walkDocument(doc, [], (value, path) => {
      value !== null && typeof value == "object" && !Array.isArray(value) && value._type === "reference" && typeof value._ref == "string" && candidates.push({
        fromId: doc._id,
        fromType: doc._type,
        fieldPath: formatPath(path),
        focusPath: formatFocusPath(path),
        refId: value._ref
      });
    });
  if (candidates.length === 0)
    return [];
  const uniqueRefIds = Array.from(new Set(candidates.map((c) => c.refId))), idsToCheck = Array.from(
    new Set(
      uniqueRefIds.flatMap((id) => {
        const published = getPublishedId(DocumentId(id)), draft = getDraftId(DocumentId(published));
        return [id, published, draft];
      })
    )
  ), existingIds = new Set(
    await client.fetch("*[_id in $ids]._id", { ids: idsToCheck })
  ), refExists = (refId) => {
    const published = getPublishedId(DocumentId(refId)), draft = getDraftId(DocumentId(published));
    return existingIds.has(refId) || existingIds.has(published) || existingIds.has(draft);
  };
  return candidates.filter((c) => !refExists(c.refId)).map((c) => ({
    kind: "reference",
    fromId: c.fromId,
    fromType: c.fromType,
    fieldPath: c.fieldPath,
    focusPath: c.focusPath,
    refId: c.refId
  }));
}
const TRIGGER_DOC_ID = "link-checker-trigger", TRIGGER_DOC_TYPE = "linkCheckerTrigger";
function deserializeScanConfig(raw) {
  return raw ? {
    concurrency: raw.concurrency ?? void 0,
    timeoutMs: raw.timeoutMs ?? void 0,
    hostDelayMs: raw.hostDelayMs ?? void 0,
    ignoreDraftsOlderThanDays: raw.ignoreDraftsOlderThanDays ?? void 0,
    excludeTypes: raw.excludeTypes ?? void 0,
    excludeUrls: [
      ...raw.excludeUrls ?? [],
      ...(raw.excludeUrlPatterns ?? []).map((p) => new RegExp(p.source, p.flags))
    ]
  } : {};
}
async function readTriggerScanConfig(client) {
  const raw = await client.fetch("*[_id == $id][0].scanConfig", {
    id: TRIGGER_DOC_ID
  });
  return deserializeScanConfig(raw);
}
const PAGE_SIZE = 500, PAGE_QUERY = `*[!(_id in path("_.**")) && !string::startsWith(_type, "sanity.") && _type != $reportType && _type != $triggerType && !(_type in $excludeTypes) && _id > $lastId] | order(_id asc) [0...${PAGE_SIZE}]`;
async function fetchAllDocs(client, excludeTypes, onProgress) {
  const docs = [];
  let lastId = "";
  for (; ; ) {
    const page = await client.fetch(PAGE_QUERY, {
      reportType: REPORT_DOC_TYPE,
      triggerType: TRIGGER_DOC_TYPE,
      excludeTypes,
      lastId
    });
    if (docs.push(...page), page.length < PAGE_SIZE) return docs;
    lastId = page[page.length - 1]._id;
  }
}
function filterStaleDrafts(docs, maxAgeDays) {
  if (!maxAgeDays || maxAgeDays <= 0) return docs;
  const publishedIds = new Set(
    docs.filter((d) => getPublishedId(DocumentId(d._id)) === d._id).map((d) => d._id)
  ), cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
  return docs.filter((doc) => {
    const publishedId = getPublishedId(DocumentId(doc._id));
    return doc._id === publishedId || publishedIds.has(publishedId) || !doc._updatedAt ? true : Date.parse(doc._updatedAt) >= cutoff;
  });
}
function latestDate(current, next) {
  return current ? next && next > current ? next : current : next;
}
function buildDocStateMap(docs) {
  const flags = /* @__PURE__ */ new Map();
  for (const doc of docs) {
    const publishedId = getPublishedId(DocumentId(doc._id)), entry = flags.get(publishedId) ?? { hasPublished: false, hasUnpublishedChanges: false };
    doc._id === publishedId ? (entry.hasPublished = true, entry.publishedUpdatedAt = latestDate(entry.publishedUpdatedAt, doc._updatedAt)) : (entry.hasUnpublishedChanges = true, entry.draftUpdatedAt = latestDate(entry.draftUpdatedAt, doc._updatedAt)), flags.set(publishedId, entry);
  }
  const states = /* @__PURE__ */ new Map();
  for (const [
    publishedId,
    { draftUpdatedAt, hasPublished, hasUnpublishedChanges, publishedUpdatedAt }
  ] of flags)
    hasPublished && hasUnpublishedChanges ? states.set(publishedId, {
      state: "edited",
      updatedAt: { draft: draftUpdatedAt, published: publishedUpdatedAt }
    }) : hasPublished ? states.set(publishedId, { state: "published", updatedAt: { published: publishedUpdatedAt } }) : states.set(publishedId, { state: "draft", updatedAt: { draft: draftUpdatedAt } });
  return states;
}
function normalizeAndDedupe(findings, docStates) {
  const seen = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const fromId = getPublishedId(DocumentId(finding.fromId)), docState = docStates.get(fromId), normalized = {
      ...finding,
      fromId,
      docState: docState?.state,
      docStateUpdatedAt: docState?.updatedAt
    }, identity = normalized.kind === "reference" ? normalized.refId : normalized.href, key = `${normalized.kind}:${fromId}:${normalized.fieldPath}:${identity}`;
    seen.has(key) || seen.set(key, normalized);
  }
  return Array.from(seen.values());
}
async function runScan(client, config, source, onProgress) {
  const rawClient = client.withConfig({ perspective: "raw" }), docs = filterStaleDrafts(
    await fetchAllDocs(rawClient, config.excludeTypes ?? []),
    config.ignoreDraftsOlderThanDays
  );
  const brokenRefs = await scanInternalRefs(rawClient, docs), { findings: brokenLinks, urlsChecked } = await scanExternalLinks(
    docs,
    config,
    (done, total) => onProgress?.("Checking external links", done, total)
  ), docStates = buildDocStateMap(docs);
  return {
    ranAt: (/* @__PURE__ */ new Date()).toISOString(),
    findings: normalizeAndDedupe([...brokenRefs, ...brokenLinks], docStates),
    documentsScanned: docs.length,
    urlsChecked,
    source
  };
}
export {
  REPORT_DOC_ID,
  REPORT_DOC_TYPE,
  TRIGGER_DOC_ID,
  TRIGGER_DOC_TYPE,
  readTriggerScanConfig,
  runScan,
  writeReport
};
//# sourceMappingURL=index2.js.map
