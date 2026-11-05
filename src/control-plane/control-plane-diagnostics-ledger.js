
const LOCAL_NUM_ONE_HUNDRED_TWENTY_EIGHT = 128;
const MAX_DIAGNOSTIC_STRING_LENGTH = 512;
const MAX_DIAGNOSTIC_ARRAY_LENGTH = 32;
const MAX_DIAGNOSTIC_OBJECT_KEYS = 32;
const MAX_DIAGNOSTIC_DEPTH = 4;
const MAX_STRING_VALUE_LENGTH = MAX_DIAGNOSTIC_STRING_LENGTH;
const MAX_ARRAY_ITEMS = MAX_DIAGNOSTIC_ARRAY_LENGTH;
const MAX_OBJECT_KEYS = MAX_DIAGNOSTIC_OBJECT_KEYS;
const MAX_OBJECT_DEPTH = MAX_DIAGNOSTIC_DEPTH;
const MIN_INTERMEDIATE_DROP_COUNT = 2;
const LOSS_ACCOUNTING_PROP = 'lossAccounting';
const DEFAULT_AGGREGATION_KEY = 'default';
const KEY_PART_SEPARATOR = '/';
const BOUNDARY_FIELDS = Object.freeze(['decidingBoundary', 'boundary', 'type']);
const CAUSE_FIELDS = Object.freeze([
  'originalCause',
  'cause',
  'reasonCode',
  'reason',
]);
const IDENTITY_FIELDS = Object.freeze([
  'identity',
  'operationId',
  'partitionId',
  'replicaId',
  'nodeId',
]);
const REVISION_FIELDS = Object.freeze(['acceptedRevision', 'revision']);
const OBLIGATION_FIELDS = Object.freeze(['remainingObligation', 'obligation']);
const OWNER_FIELDS = Object.freeze(['responsibleOwner', 'owner']);
const TRIGGER_FIELDS = Object.freeze(['nextTrigger', 'trigger']);
const PROGRESS_FIELDS = Object.freeze(['lastMeaningfulProgress']);
const SUMMARY_FIELD = Object.freeze({
  ORIGINAL_CAUSE: 'originalCause',
  DECIDING_BOUNDARY: 'decidingBoundary',
  IDENTITY: 'identity',
  ACCEPTED_REVISION: 'acceptedRevision',
  REMAINING_OBLIGATION: 'remainingObligation',
  RESPONSIBLE_OWNER: 'responsibleOwner',
  NEXT_TRIGGER: 'nextTrigger',
  LAST_MEANINGFUL_PROGRESS: 'lastMeaningfulProgress',
});

function createLossCounters() {
  return {
    evictedKeys: 0,
    overwrittenEntries: 0,
    droppedSamples: 0,
    truncatedStrings: 0,
    truncatedArrays: 0,
    truncatedObjects: 0,
  };
}

function buildFrozenLossAccountingSnapshot(counters) {
  const evictedKeys = counters.evictedKeys;
  const overwrittenEntries = counters.overwrittenEntries;
  const droppedSamples = counters.droppedSamples;
  const truncatedStrings = counters.truncatedStrings;
  const truncatedArrays = counters.truncatedArrays;
  const truncatedObjects = counters.truncatedObjects;
  const totalLossEvents =
    evictedKeys +
    overwrittenEntries +
    droppedSamples +
    truncatedStrings +
    truncatedArrays +
    truncatedObjects;
  return Object.freeze({
    evictedKeys,
    overwrittenEntries,
    droppedSamples,
    truncatedStrings,
    truncatedArrays,
    truncatedObjects,
    totalLossEvents,
  });
}

function attachLossAccountingMetadata(items, lossAccounting) {
  Object.defineProperty(items, LOSS_ACCOUNTING_PROP, {
    value: lossAccounting,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(items);
}

function freezeStringValue(value, lossCounters) {
  if (value.length <= MAX_STRING_VALUE_LENGTH) {
    return value;
  }
  if (lossCounters) {
    lossCounters.truncatedStrings += 1;
  }
  return value.slice(0, MAX_STRING_VALUE_LENGTH);
}

function freezeArrayValue(value, depth, lossCounters) {
  const exceedsDepth = depth >= MAX_OBJECT_DEPTH;
  const isTruncated = exceedsDepth ?
    value.length > 0 :
    value.length > MAX_ARRAY_ITEMS;
  if (lossCounters && isTruncated) {
    lossCounters.truncatedArrays += 1;
  }
  if (exceedsDepth) {
    return Object.freeze([]);
  }
  return Object.freeze(
    value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => freezeValue(entry, depth + 1, lossCounters)),
  );
}

function freezeObjectValue(value, depth, lossCounters) {
  const entries = Object.entries(value);
  const exceedsDepth = depth >= MAX_OBJECT_DEPTH;
  const isTruncated = exceedsDepth ?
    entries.length > 0 :
    entries.length > MAX_OBJECT_KEYS;
  if (lossCounters && isTruncated) {
    lossCounters.truncatedObjects += 1;
  }
  if (exceedsDepth) {
    return Object.freeze({});
  }
  const frozen = {};
  for (const [key, entry] of entries.slice(0, MAX_OBJECT_KEYS)) {
    frozen[key] = freezeValue(entry, depth + 1, lossCounters);
  }
  return Object.freeze(frozen);
}

function freezeValue(value, depth = 0, lossCounters = null) {
  if (typeof value === 'string') {
    return freezeStringValue(value, lossCounters);
  }
  if (Array.isArray(value)) {
    return freezeArrayValue(value, depth, lossCounters);
  }
  if (value && typeof value === 'object') {
    return freezeObjectValue(value, depth, lossCounters);
  }
  return value;
}

function pickFirstDefinedField(entry, fields, fallback = null) {
  for (const field of fields) {
    if (entry?.[field] !== undefined && entry?.[field] !== null) {
      return entry[field];
    }
  }
  return fallback;
}

function resolveAggregationKey(entry = {}) {
  const explicitKey = entry.aggregationKey;
  if (typeof explicitKey === 'string' && explicitKey.length > 0) {
    return explicitKey;
  }
  const parts = [
    pickFirstDefinedField(entry, BOUNDARY_FIELDS),
    pickFirstDefinedField(entry, CAUSE_FIELDS),
    pickFirstDefinedField(entry, IDENTITY_FIELDS),
  ].filter((part) => typeof part === 'string' && part.length > 0);
  return parts.length > 0 ?
    parts.join(KEY_PART_SEPARATOR) :
    DEFAULT_AGGREGATION_KEY;
}

function pickCausalField(entry, existing, fields, existingField) {
  const existingValue =
    existing && existing[existingField] !== undefined ?
      existing[existingField] :
      null;
  return pickFirstDefinedField(entry, fields, existingValue);
}

function buildAggregatedSummary(entry, existing, normalized) {
  return Object.freeze({
    aggregationKey: normalized.aggregationKey,
    count: normalized.count,
    firstOccurrenceAtMs: normalized.firstOccurrenceAtMs,
    firstOccurrenceAt: normalized.firstOccurrenceAt,
    latestOccurrenceAtMs: normalized.recordedAtMs,
    latestOccurrenceAt: normalized.recordedAt,
    originalCause: pickCausalField(
      entry,
      existing,
      CAUSE_FIELDS,
      SUMMARY_FIELD.ORIGINAL_CAUSE,
    ),
    decidingBoundary: pickCausalField(
      entry,
      existing,
      BOUNDARY_FIELDS,
      SUMMARY_FIELD.DECIDING_BOUNDARY,
    ),
    identity: pickCausalField(
      entry,
      existing,
      IDENTITY_FIELDS,
      SUMMARY_FIELD.IDENTITY,
    ),
    acceptedRevision: pickCausalField(
      entry,
      existing,
      REVISION_FIELDS,
      SUMMARY_FIELD.ACCEPTED_REVISION,
    ),
    remainingObligation: pickCausalField(
      entry,
      existing,
      OBLIGATION_FIELDS,
      SUMMARY_FIELD.REMAINING_OBLIGATION,
    ),
    responsibleOwner: pickCausalField(
      entry,
      existing,
      OWNER_FIELDS,
      SUMMARY_FIELD.RESPONSIBLE_OWNER,
    ),
    nextTrigger: pickCausalField(
      entry,
      existing,
      TRIGGER_FIELDS,
      SUMMARY_FIELD.NEXT_TRIGGER,
    ),
    lastMeaningfulProgress: normalized.lastMeaningfulProgress,
    firstSample: existing?.firstSample || normalized,
    latestSample: normalized,
  });
}

function buildNormalizedDiagnosticEntry({
  sequence,
  recordedAtMs,
  key,
  existing,
  entry,
}) {
  const recordedAt = new Date(recordedAtMs).toISOString();
  const count = existing ? existing.count + 1 : 1;
  const firstOccurrenceAtMs = existing ?
    existing.firstOccurrenceAtMs :
    recordedAtMs;
  const firstOccurrenceAt = existing ?
    existing.firstOccurrenceAt :
    recordedAt;
  const lastMeaningfulProgress = pickCausalField(
    entry,
    existing,
    PROGRESS_FIELDS,
    SUMMARY_FIELD.LAST_MEANINGFUL_PROGRESS,
  );
  return Object.freeze({
    sequence,
    recordedAtMs,
    recordedAt,
    aggregationKey: key,
    count,
    firstOccurrenceAtMs,
    firstOccurrenceAt,
    lastMeaningfulProgress,
    ...entry,
  });
}

function countEntriesByAggregationKey(entries) {
  const countsByKey = new Map();
  for (const item of entries) {
    countsByKey.set(
      item.aggregationKey,
      (countsByKey.get(item.aggregationKey) || 0) + 1,
    );
  }
  return countsByKey;
}

function trimEntriesPreservingDistinctKeys(entries, maxEntries, lossCounters) {
  while (entries.length > maxEntries) {
    const countsByKey = countEntriesByAggregationKey(entries);
    const duplicateIndex = entries.findIndex(
      (item) => (countsByKey.get(item.aggregationKey) || 0) > 1,
    );
    if (duplicateIndex >= 0) {
      entries.splice(duplicateIndex, 1);
    } else {
      entries.shift();
    }
    if (lossCounters) {
      lossCounters.overwrittenEntries += 1;
    }
  }
}

function recordAggregatedSummary({
  map,
  maxAggregatedKeys,
  key,
  summary,
  lossCounters,
}) {
  map.delete(key);
  map.set(key, summary);
  while (map.size > maxAggregatedKeys) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
    if (lossCounters) {
      lossCounters.evictedKeys += 1;
    }
  }
}

function sliceRecentItems(items, limit) {
  const validLimit =
    Number.isInteger(limit) && limit > 0 ? limit : null;
  return validLimit === null ?
    items :
    items.slice(Math.max(0, items.length - validLimit));
}

function resolvePositiveLimit(candidate, defaultLimit) {
  return Number.isInteger(candidate) && candidate > 0 ?
    candidate :
    defaultLimit;
}

class ControlPlaneDiagnosticsLedger {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxEntries=128]
   * @param {number} [options.maxAggregatedKeys]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.maxEntries = resolvePositiveLimit(
      options.maxEntries,
      LOCAL_NUM_ONE_HUNDRED_TWENTY_EIGHT,
    );
    this.maxAggregatedKeys = resolvePositiveLimit(
      options.maxAggregatedKeys,
      this.maxEntries,
    );
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.reset();
  }

  /**
   * @param {Object} entry
   * @return {Object}
   */
  append(entry = {}) {
    const rawEntry = entry && typeof entry === 'object' ? entry : {};
    const sanitizedEntry = freezeValue(rawEntry, 0, this.lossCounters);
    const recordedAtMs = this.now();
    const key = resolveAggregationKey(sanitizedEntry);
    const existing = this.aggregatedByKey.get(key) || null;
    const normalized = buildNormalizedDiagnosticEntry({
      sequence: this.nextSequence,
      recordedAtMs,
      key,
      existing,
      entry: sanitizedEntry,
    });
    if (normalized.count > MIN_INTERMEDIATE_DROP_COUNT) {
      this.lossCounters.droppedSamples += 1;
    }
    this.nextSequence += 1;
    this.entries.push(normalized);
    if (this.entries.length > this.maxEntries) {
      trimEntriesPreservingDistinctKeys(
        this.entries,
        this.maxEntries,
        this.lossCounters,
      );
    }
    recordAggregatedSummary({
      map: this.aggregatedByKey,
      maxAggregatedKeys: this.maxAggregatedKeys,
      key,
      summary: buildAggregatedSummary(sanitizedEntry, existing, normalized),
      lossCounters: this.lossCounters,
    });
    this.lossAccountingSnapshot = null;
    return normalized;
  }

  /**
   * @param {Object} entry
   * @return {Object}
   */
  record(entry = {}) {
    return this.append(entry);
  }

  /**
   * Reset all ledger entries, aggregated summaries, and loss counters.
   * @return {Object}
   */
  reset() {
    this.nextSequence = 1;
    this.entries = [];
    this.aggregatedByKey = new Map();
    this.lossCounters = createLossCounters();
    this.lossAccountingSnapshot = null;
    return this.getLossAccounting();
  }

  /**
   * @return {Object}
   */
  getLossAccounting() {
    if (!this.lossAccountingSnapshot) {
      this.lossAccountingSnapshot = buildFrozenLossAccountingSnapshot(
        this.lossCounters,
      );
    }
    return this.lossAccountingSnapshot;
  }

  /**
   * @return {Object}
   */
  getLatestSummary() {
    const summaries = [...this.aggregatedByKey.values()];
    const latestAggregated =
      summaries.length > 0 ? summaries[summaries.length - 1] : null;
    const lossAccounting = this.getLossAccounting();
    if (!latestAggregated) {
      return Object.freeze({
        aggregationKey: null,
        count: 0,
        entriesCount: this.entries.length,
        aggregatedKeyCount: 0,
        aggregatedSummaries: this.getAggregatedSummaries(),
        lossAccounting,
      });
    }
    return Object.freeze({
      ...latestAggregated,
      entriesCount: this.entries.length,
      aggregatedKeyCount: this.aggregatedByKey.size,
      aggregatedSummaries: this.getAggregatedSummaries(),
      lossAccounting,
    });
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getEntries(options = {}) {
    const entries = sliceRecentItems(this.entries, options.limit).map(
      (entry) => entry,
    );
    return attachLossAccountingMetadata(entries, this.getLossAccounting());
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getAggregatedSummaries(options = {}) {
    const all = [...this.aggregatedByKey.values()];
    const summaries = sliceRecentItems(all, options.limit).map(
      (summary) => summary,
    );
    return attachLossAccountingMetadata(summaries, this.getLossAccounting());
  }

  /**
   * @return {number}
   */
  getSize() {
    return this.entries.length;
  }
}

export {ControlPlaneDiagnosticsLedger};
