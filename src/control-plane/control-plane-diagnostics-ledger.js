
const LOCAL_NUM_ONE_HUNDRED_TWENTY_EIGHT = 128;
const MAX_DIAGNOSTIC_STRING_LENGTH = 512;
const MAX_DIAGNOSTIC_ARRAY_LENGTH = 32;
const MAX_DIAGNOSTIC_OBJECT_KEYS = 32;
const MAX_DIAGNOSTIC_DEPTH = 4;
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

function freezeValue(value, depth = 0) {
  if (typeof value === 'string') {
    return value.length > MAX_DIAGNOSTIC_STRING_LENGTH ?
      value.slice(0, MAX_DIAGNOSTIC_STRING_LENGTH) :
      value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DIAGNOSTIC_DEPTH) return Object.freeze([]);
    return Object.freeze(
      value.slice(0, MAX_DIAGNOSTIC_ARRAY_LENGTH).map((entry) => freezeValue(entry, depth + 1)),
    );
  }
  if (value && typeof value === 'object') {
    if (depth >= MAX_DIAGNOSTIC_DEPTH) return Object.freeze({});
    const frozen = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_DIAGNOSTIC_OBJECT_KEYS)) {
      frozen[key] = freezeValue(entry, depth + 1);
    }
    return Object.freeze(frozen);
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
  return freezeValue({
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

function buildNormalizedDiagnosticEntry(
  sequence,
  recordedAtMs,
  key,
  existing,
  entry,
) {
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
  return freezeValue({
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

function trimEntriesPreservingDistinctKeys(entries, maxEntries) {
  while (entries.length > maxEntries) {
    const countsByKey = new Map();
    for (const item of entries) {
      countsByKey.set(item.aggregationKey, (countsByKey.get(item.aggregationKey) || 0) + 1);
    }
    const duplicateIndex = entries.findIndex(
      (item) => (countsByKey.get(item.aggregationKey) || 0) > 1,
    );
    if (duplicateIndex >= 0) {
      entries.splice(duplicateIndex, 1);
    } else {
      entries.shift();
    }
  }
}

function recordAggregatedSummary(map, maxEntries, key, summary) {
  map.delete(key);
  map.set(key, summary);
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

function sliceRecentItems(items, limit) {
  const validLimit =
    Number.isInteger(limit) && limit > 0 ? limit : null;
  return validLimit === null ?
    items :
    items.slice(Math.max(0, items.length - validLimit));
}

class ControlPlaneDiagnosticsLedger {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxEntries=128]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.maxEntries = Number.isInteger(options.maxEntries) &&
      options.maxEntries > 0 ?
      options.maxEntries :
      LOCAL_NUM_ONE_HUNDRED_TWENTY_EIGHT;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.nextSequence = 1;
    this.entries = [];
    this.aggregatedByKey = new Map();
  }

  /**
   * @param {Object} entry
   * @return {Object}
   */
  append(entry = {}) {
    const recordedAtMs = this.now();
    const key = resolveAggregationKey(entry);
    const existing = this.aggregatedByKey.get(key) || null;
    const normalized = buildNormalizedDiagnosticEntry(
      this.nextSequence,
      recordedAtMs,
      key,
      existing,
      entry,
    );
    this.nextSequence += 1;
    this.entries.push(normalized);
    if (this.entries.length > this.maxEntries) {
      trimEntriesPreservingDistinctKeys(this.entries, this.maxEntries);
    }
    recordAggregatedSummary(
      this.aggregatedByKey,
      this.maxEntries,
      key,
      buildAggregatedSummary(entry, existing, normalized),
    );
    return normalized;
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getEntries(options = {}) {
    const entries = sliceRecentItems(this.entries, options.limit);
    return Object.freeze(entries.map((entry) => entry));
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getAggregatedSummaries(options = {}) {
    const all = [...this.aggregatedByKey.values()];
    return Object.freeze(sliceRecentItems(all, options.limit));
  }

  /**
   * @return {number}
   */
  getSize() {
    return this.entries.length;
  }
}

export {ControlPlaneDiagnosticsLedger};
