// Canonical participant read dependency accumulator, durable validationText
// codec, and serializability footprint conflict predicate:
// - Public entries: ParticipantReadDependencyAccumulator,
//   createParticipantReadAccumulator, attachSessionReadDependencyAccumulator,
//   recordSessionReadDependencyFootprint, widenSessionReadToPartition,
//   getSessionReadDependencySnapshot, encodeCanonicalReadDependencyRecord,
//   decodeCanonicalReadDependencyRecord, decodeParticipantValidationText,
//   resolveValidationRecordBaseGeneration, normalizeTransactionFootprint,
//   classifyTransactionFootprintConflict, doTransactionFootprintsConflict,
//   isKeyTouchedByTransactionFootprint.
// - Invariants:
//   1. Read dependencies accumulate through one owner method with private state
//      counting both distinct keys and cumulative UTF-8 bytes. Reaching either
//      ceiling or executing an unscoped read widens irreversibly to
//      PARTICIPANT_READ_DEPENDENCY_SCOPE.PARTITION and releases individual keys.
//   2. Every pinned validationText explicitly encodes readScope ('none',
//      'keys', or 'partition'); omitted, malformed, unsorted, duplicate, or
//      over-budget read scopes fail closed in the decoder.
//   3. Two transactions conflict iff (W1 ∩ W2) ∨ (W1 ∩ R2) ∨ (R1 ∩ W2), where
//      read/read overlap (R1 ∩ R2) is permitted and a whole-partition read
//      ('partition') conflicts with every non-empty write (W ≠ ∅).

import {createHash} from 'node:crypto';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {
  PARTICIPANT_READ_DEPENDENCY_BOUND as BOUND,
  PARTICIPANT_READ_DEPENDENCY_SCOPE as SCOPE,
  PARTICIPANT_TRANSACTION_BYTES as BYTES,
} from './partition-participant-transaction-constants.js';

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const FIVE = 5;
const TEXT_ENCODING = 'utf8';
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const EMPTY_KEYS = Object.freeze([]);
const EMPTY_KEY_SET = Object.freeze(new Set());
const READ_ONLY_MUTATION_ERROR =
  'Participant session read dependencies are owned by ParticipantReadDependencyAccumulator';

const NONE_CANONICAL_RECORD = Object.freeze({readScope: SCOPE.NONE});
const PARTITION_CANONICAL_RECORD = Object.freeze({readScope: SCOPE.PARTITION});

const NONE_READ_DEPENDENCY_SNAPSHOT = Object.freeze({
  readScope: SCOPE.NONE,
  readKeys: EMPTY_KEYS,
  readKeysSet: EMPTY_KEY_SET,
  keyCount: ZERO,
  byteCount: ZERO,
  hasUnscopedRead: false,
  canonicalRecord: NONE_CANONICAL_RECORD,
});

const FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT = Object.freeze({
  readScope: SCOPE.PARTITION,
  readKeys: EMPTY_KEYS,
  readKeysSet: EMPTY_KEY_SET,
  keyCount: ZERO,
  byteCount: ZERO,
  hasUnscopedRead: true,
  canonicalRecord: PARTITION_CANONICAL_RECORD,
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > ZERO;
}

function sha256Hex(text) {
  return createHash(BYTES.DIGEST_ALGORITHM)
    .update(text)
    .digest(BYTES.DIGEST_ENCODING);
}

function generationDigestOf(generation) {
  return sha256Hex(`${BYTES.GENERATION_DIGEST_PREFIX}${generation}`);
}

const UNPARSABLE_JSON_VALUE = null;
const EMPTY_OPERATIONS_JSON = '[]';
const JSON_COMMA_SEPARATOR = ',';

function parsedJsonOf(text) {
  if (typeof text !== 'string') return UNPARSABLE_JSON_VALUE;
  try {
    return JSON.parse(text);
  } catch {
    return UNPARSABLE_JSON_VALUE;
  }
}

function resolveBounds(options) {
  const maxKeys = Number.isSafeInteger(options?.maxKeys) && options.maxKeys > ZERO ?
    options.maxKeys : BOUND.MAX_KEYS;
  const maxBytes = Number.isSafeInteger(options?.maxBytes) && options.maxBytes > ZERO ?
    options.maxBytes : BOUND.MAX_BYTES;
  return {maxKeys, maxBytes};
}

class ParticipantReadDependencyAccumulator {
  #scope = SCOPE.NONE;
  #keys = new Set();
  #byteCount = ZERO;
  #overflowed = false;
  #revision = ZERO;
  #cachedSnapshot = null;
  #cachedSnapshotRevision = -ONE;
  #cachedSortedKeys = EMPTY_KEYS;
  #cachedKeySet = EMPTY_KEY_SET;
  #cachedKeysRevision = -ONE;
  #snapshotBuildCount = ZERO;
  #maxKeys;
  #maxBytes;

  constructor(options = {}) {
    const {maxKeys, maxBytes} = resolveBounds(options);
    this.#maxKeys = maxKeys;
    this.#maxBytes = maxBytes;
  }

  get readScope() {
    return this.#scope;
  }
  get mode() {
    return this.#scope;
  }
  get hasUnscopedRead() {
    return this.#scope === SCOPE.PARTITION;
  }
  get overflowed() {
    return this.#overflowed;
  }
  get keyCount() {
    return this.#keys.size;
  }
  get byteCount() {
    return this.#byteCount;
  }
  get maxKeys() {
    return this.#maxKeys;
  }
  get maxBytes() {
    return this.#maxBytes;
  }
  get revision() {
    return this.#revision;
  }
  get cachedSnapshot() {
    return this.#cachedSnapshot;
  }
  get cachedSnapshotRevision() {
    return this.#cachedSnapshotRevision;
  }
  get snapshotBuildCount() {
    return this.#snapshotBuildCount;
  }
  hasKey(rowKey) {
    return this.#scope === SCOPE.KEYS && this.#keys.has(rowKey);
  }
  #ensureCachedKeys() {
    if (this.#scope !== SCOPE.KEYS) return EMPTY_KEYS;
    if (this.#cachedKeysRevision !== this.#revision) {
      this.#cachedSortedKeys = Object.freeze([...this.#keys].sort());
      this.#cachedKeySet = Object.freeze(new Set(this.#cachedSortedKeys));
      this.#cachedKeysRevision = this.#revision;
    }
    return this.#cachedSortedKeys;
  }
  keys() {
    return this.#ensureCachedKeys();
  }
  values() {
    return this.#keys.values();
  }
  #widenScope(overflowed = false) {
    const nextOverflowed = this.#overflowed || Boolean(overflowed);
    if (this.#scope === SCOPE.PARTITION &&
        this.#keys.size === ZERO &&
        this.#byteCount === ZERO &&
        this.#overflowed === nextOverflowed) {
      return this.#scope;
    }
    this.#scope = SCOPE.PARTITION;
    this.#keys.clear();
    this.#byteCount = ZERO;
    this.#overflowed = nextOverflowed;
    this.#revision += ONE;
    return this.#scope;
  }
  widenToPartitionScope() {
    return this.#widenScope(false);
  }
  recordPartitionRead() {
    return this.#widenScope(false);
  }
  #tryAddKey(rowKey) {
    if (!isNonEmptyString(rowKey)) {
      this.#widenScope(false);
      return false;
    }
    if (this.#keys.has(rowKey)) return true;
    const keyBytes = Buffer.byteLength(rowKey, TEXT_ENCODING);
    if (this.#keys.size + ONE > this.#maxKeys ||
        this.#byteCount + keyBytes > this.#maxBytes) {
      this.#widenScope(true);
      return false;
    }
    this.#keys.add(rowKey);
    this.#byteCount += keyBytes;
    this.#scope = SCOPE.KEYS;
    this.#revision += ONE;
    return true;
  }
  recordKeyReads(keys) {
    if (this.#scope === SCOPE.PARTITION) return this.#scope;
    const list = collectNormalizedKeyArray(keys);
    if (list === null || list.length === ZERO) return this.#widenScope(false);
    for (let i = ZERO; i < list.length; i += ONE) {
      if (!this.#tryAddKey(list[i])) break;
    }
    return this.#scope;
  }
  recordReadFootprint(footprint) {
    if (this.#scope === SCOPE.PARTITION) return this.#scope;
    if (!footprint || footprint.scoped !== true ||
        !Array.isArray(footprint.rowKeys) || footprint.rowKeys.length === ZERO) {
      return this.#widenScope(false);
    }
    for (let i = ZERO; i < footprint.rowKeys.length; i += ONE) {
      if (!this.#tryAddKey(footprint.rowKeys[i])) break;
    }
    return this.#scope;
  }
  getSnapshot() {
    if (this.#cachedSnapshot !== null &&
        this.#cachedSnapshotRevision === this.#revision) {
      return this.#cachedSnapshot;
    }
    this.#snapshotBuildCount += ONE;
    let built;
    if (this.#scope === SCOPE.NONE) {
      built = NONE_READ_DEPENDENCY_SNAPSHOT;
    } else if (this.#scope === SCOPE.PARTITION) {
      built = FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT;
    } else {
      const readKeys = this.#ensureCachedKeys();
      built = Object.freeze({
        readScope: SCOPE.KEYS,
        readKeys,
        readKeysSet: this.#cachedKeySet,
        keyCount: readKeys.length,
        byteCount: this.#byteCount,
        hasUnscopedRead: false,
        canonicalRecord: Object.freeze({readScope: SCOPE.KEYS, readKeys}),
      });
    }
    this.#cachedSnapshot = built;
    this.#cachedSnapshotRevision = this.#revision;
    return built;
  }
  snapshot() {
    return this.getSnapshot();
  }
}

function throwReadOnlyMutation() {
  throw new TypeError(READ_ONLY_MUTATION_ERROR);
}

function createReadOnlyKeySetView(accumulator) {
  return Object.freeze({
    get size() {
      return accumulator.keyCount;
    },
    has(rowKey) {
      return accumulator.hasKey(rowKey);
    },
    values() {
      return accumulator.values();
    },
    keys() {
      return accumulator.values();
    },
    [Symbol.iterator]() {
      return accumulator.values();
    },
    add: throwReadOnlyMutation,
    delete: throwReadOnlyMutation,
    clear: throwReadOnlyMutation,
  });
}

function createParticipantReadAccumulator(options = {}) {
  return new ParticipantReadDependencyAccumulator(options);
}

function attachSessionReadDependencyAccumulator(session, options = {}) {
  const accumulator = createParticipantReadAccumulator(options);
  const keySetView = createReadOnlyKeySetView(accumulator);
  Object.defineProperties(session, {
    readDependencies: {value: accumulator, enumerable: true, configurable: false, writable: false},
    readScope: {get: () => accumulator.readScope, enumerable: true, configurable: false},
    hasUnscopedRead: {
      get: () => accumulator.hasUnscopedRead, enumerable: true, configurable: false,
    },
    readRowKeys: {get: () => keySetView, enumerable: true, configurable: false},
    readKeyCount: {get: () => accumulator.keyCount, enumerable: true, configurable: false},
    readBytes: {get: () => accumulator.byteCount, enumerable: true, configurable: false},
    aggregateFootprintBytes: {
      get: () => (Number(session.bytes) || ZERO) + accumulator.byteCount,
      enumerable: true,
      configurable: false,
    },
  });
  return accumulator;
}

function recordSessionReadDependencyFootprint(session, footprint) {
  if (!session?.readDependencies) return FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT.readScope;
  return session.readDependencies.recordReadFootprint(footprint);
}

function widenSessionReadToPartition(session) {
  if (!session?.readDependencies) return FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT.readScope;
  return session.readDependencies.widenToPartitionScope();
}

function getSessionReadDependencySnapshot(session) {
  if (!session?.readDependencies) return FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT;
  return session.readDependencies.getSnapshot();
}

function validateAndMeasureSortedReadKeys(keys, maxKeys, maxBytes) {
  if (!Array.isArray(keys) || keys.length === ZERO || keys.length > maxKeys) {
    return null;
  }
  let byteCount = ZERO;
  for (let i = ZERO; i < keys.length; i += ONE) {
    const key = keys[i];
    if (!isNonEmptyString(key) || (i > ZERO && !(keys[i - ONE] < key))) {
      return null;
    }
    byteCount += Buffer.byteLength(key, TEXT_ENCODING);
    if (byteCount > maxBytes) return null;
  }
  const frozenKeys = Object.freeze([...keys]);
  return Object.freeze({
    readScope: SCOPE.KEYS,
    readKeys: frozenKeys,
    readKeysSet: new Set(frozenKeys),
    keyCount: frozenKeys.length,
    byteCount,
    hasUnscopedRead: false,
    canonicalRecord: Object.freeze({
      readScope: SCOPE.KEYS,
      readKeys: frozenKeys,
    }),
  });
}

function decodeCanonicalReadDependencyRecord(rawRecord, options = {}) {
  const record = copyStrictOwnDataRecord(rawRecord);
  if (record === null) return null;
  const fieldCount = Object.keys(record).length;
  if (record.readScope === SCOPE.NONE) {
    return fieldCount === ONE ? NONE_READ_DEPENDENCY_SNAPSHOT : null;
  }
  if (record.readScope === SCOPE.PARTITION) {
    return fieldCount === ONE ? FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT : null;
  }
  if (record.readScope === SCOPE.KEYS && fieldCount === TWO) {
    const {maxKeys, maxBytes} = resolveBounds(options);
    return validateAndMeasureSortedReadKeys(record.readKeys, maxKeys, maxBytes);
  }
  return null;
}

function collectNormalizedKeyArray(rawKeys) {
  if (rawKeys instanceof Set) return [...rawKeys];
  if (Array.isArray(rawKeys)) return [...rawKeys];
  return null;
}

function encodeScopedReadKeysRecord(rawKeys, options) {
  const list = collectNormalizedKeyArray(rawKeys);
  if (list === null || list.length === ZERO || !list.every(isNonEmptyString)) {
    return null;
  }
  const uniqueSorted = [...new Set(list)].sort();
  const {maxKeys, maxBytes} = resolveBounds(options);
  const validated = validateAndMeasureSortedReadKeys(uniqueSorted, maxKeys, maxBytes);
  return validated?.canonicalRecord ?? null;
}

function hasNoProvidedReadKeys(rawKeys) {
  if (rawKeys === undefined || rawKeys === null) return true;
  if (rawKeys instanceof Set) return rawKeys.size === ZERO;
  return Array.isArray(rawKeys) && rawKeys.length === ZERO;
}

function encodeCanonicalReadDependencyRecord(readDependencies, options = {}) {
  if (readDependencies === undefined) return NONE_CANONICAL_RECORD;
  if (readDependencies instanceof ParticipantReadDependencyAccumulator) {
    return readDependencies.snapshot().canonicalRecord;
  }
  const record = copyStrictOwnDataRecord(readDependencies);
  if (record === null) return null;
  const rawKeys = record.readKeys ?? record.readRowKeys;
  if (record.readScope === SCOPE.NONE) {
    return hasNoProvidedReadKeys(rawKeys) ? NONE_CANONICAL_RECORD : null;
  }
  if (record.readScope === SCOPE.PARTITION) {
    return hasNoProvidedReadKeys(rawKeys) ? PARTITION_CANONICAL_RECORD : null;
  }
  if (record.readScope === SCOPE.KEYS) {
    return encodeScopedReadKeysRecord(rawKeys, options);
  }
  return null;
}

function isValidValidationTupleHeader(scope, partitionId, generationDigest, originIndex) {
  return scope === BYTES.VALIDATION_SCOPE &&
    isNonEmptyString(partitionId) &&
    typeof generationDigest === 'string' &&
    HEX_DIGEST_PATTERN.test(generationDigest) &&
    Number.isSafeInteger(originIndex);
}

function decodeParticipantValidationText(validationText, options = {}) {
  const parsed = parsedJsonOf(validationText);
  if (!Array.isArray(parsed) || parsed.length !== ONE ||
      !Array.isArray(parsed[ZERO]) || parsed[ZERO].length !== FIVE) {
    return null;
  }
  const [scope, partitionId, generationDigest, originIndex, rawReadDep] = parsed[ZERO];
  if (!isValidValidationTupleHeader(scope, partitionId, generationDigest, originIndex)) {
    return null;
  }
  const readDependencies = decodeCanonicalReadDependencyRecord(rawReadDep, options);
  if (readDependencies === null) return null;
  const canonicalText = JSON.stringify([
    [scope, partitionId, generationDigest, originIndex, readDependencies.canonicalRecord],
  ]);
  if (canonicalText !== validationText) return null;
  return Object.freeze({
    scope,
    partitionId,
    generationDigest,
    originIndex,
    readScope: readDependencies.readScope,
    readKeys: readDependencies.readKeys,
    readKeysSet: readDependencies.readKeysSet,
    hasUnscopedRead: readDependencies.hasUnscopedRead,
    readDependencies,
    validationText: canonicalText,
  });
}

function resolveValidationRecordBaseGeneration(
  decodedRecord,
  currentGeneration,
  partitionId,
  originIndex,
) {
  if (!decodedRecord ||
      decodedRecord.partitionId !== partitionId ||
      decodedRecord.originIndex !== originIndex ||
      !Number.isSafeInteger(currentGeneration) ||
      currentGeneration < ZERO) {
    return null;
  }
  for (let gen = currentGeneration; gen >= ZERO; gen -= ONE) {
    if (decodedRecord.generationDigest === generationDigestOf(gen)) {
      return Object.freeze({...decodedRecord, baseGeneration: gen});
    }
  }
  return null;
}

function toKeySet(keys) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys);
  return EMPTY_KEY_SET;
}

const PARTITION_READ_HALF = Object.freeze({
  readScope: SCOPE.PARTITION,
  readKeys: EMPTY_KEY_SET,
  hasUnscopedRead: true,
});
const NONE_READ_HALF = Object.freeze({
  readScope: SCOPE.NONE,
  readKeys: EMPTY_KEY_SET,
  hasUnscopedRead: false,
});

function buildScopedOrPartitionReadHalf(readKeys) {
  return readKeys.size > ZERO ?
    {readScope: SCOPE.KEYS, readKeys, hasUnscopedRead: false} :
    PARTITION_READ_HALF;
}

function buildUndefinedScopeReadHalf(readKeys) {
  return readKeys.size > ZERO ?
    {readScope: SCOPE.KEYS, readKeys, hasUnscopedRead: false} :
    NONE_READ_HALF;
}

function resolveReadHalfByScope(readScope, readKeys) {
  if (readScope === SCOPE.NONE) {
    return readKeys.size === ZERO ? NONE_READ_HALF : PARTITION_READ_HALF;
  }
  if (readScope === SCOPE.KEYS) return buildScopedOrPartitionReadHalf(readKeys);
  if (readScope === undefined) return buildUndefinedScopeReadHalf(readKeys);
  return PARTITION_READ_HALF;
}

function unwrapNestedReadSource(source) {
  return source.readDependencies && typeof source.readDependencies === 'object' ?
    source.readDependencies : source;
}

function resolveReadHalf(source) {
  if (!source || typeof source !== 'object') return PARTITION_READ_HALF;
  const nested = unwrapNestedReadSource(source);
  if (nested instanceof ParticipantReadDependencyAccumulator) {
    if (nested.readScope === SCOPE.NONE) return NONE_READ_HALF;
    if (nested.readScope === SCOPE.PARTITION) return PARTITION_READ_HALF;
    return buildScopedOrPartitionReadHalf(nested.getSnapshot().readKeysSet);
  }
  if (nested.hasUnscopedRead === true || nested.readScope === SCOPE.PARTITION) {
    return PARTITION_READ_HALF;
  }
  const readKeys = toKeySet(nested.readKeysSet ?? nested.readKeys ?? nested.readRowKeys);
  return resolveReadHalfByScope(nested.readScope, readKeys);
}

function isFootprintLikeObject(value) {
  return Boolean(value) && typeof value === 'object' &&
    !(value instanceof Set) && !Array.isArray(value);
}

function normalizeTransactionFootprint(
  rowKeysOrFootprint,
  hasUnscopedWrite = false,
  readDependencies = null,
) {
  if (isFootprintLikeObject(rowKeysOrFootprint)) {
    const rowKeys = toKeySet(rowKeysOrFootprint.rowKeys ?? rowKeysOrFootprint.touchedRowKeys);
    const unscopedWrite = Boolean(rowKeysOrFootprint.hasUnscopedWrite || hasUnscopedWrite);
    const readSource = readDependencies ?? rowKeysOrFootprint;
    const readHalf = resolveReadHalf(readSource);
    return {
      rowKeys,
      hasUnscopedWrite: unscopedWrite,
      hasWrite: unscopedWrite || rowKeys.size > ZERO,
      ...readHalf,
    };
  }
  const rowKeys = toKeySet(rowKeysOrFootprint);
  const unscopedWrite = Boolean(hasUnscopedWrite);
  const readHalf = readDependencies === null ?
    {readScope: SCOPE.NONE, readKeys: EMPTY_KEY_SET, hasUnscopedRead: false} :
    resolveReadHalf(readDependencies);
  return {
    rowKeys,
    hasUnscopedWrite: unscopedWrite,
    hasWrite: unscopedWrite || rowKeys.size > ZERO,
    ...readHalf,
  };
}

function setsIntersect(left, right) {
  if (!left || !right || left.size === ZERO || right.size === ZERO) return false;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const key of smaller) {
    if (larger.has(key)) return true;
  }
  return false;
}

function doesWriteOverlapWrite(first, second) {
  if (!first.hasWrite || !second.hasWrite) return false;
  if (first.hasUnscopedWrite) return true;
  if (second.hasUnscopedWrite) return true;
  return setsIntersect(first.rowKeys, second.rowKeys);
}

function doesWriteOverlapRead(writer, reader) {
  if (!writer.hasWrite || reader.readScope === SCOPE.NONE) return false;
  if (reader.readScope === SCOPE.PARTITION || writer.hasUnscopedWrite) return true;
  return setsIntersect(writer.rowKeys, reader.readKeys);
}

const NO_FOOTPRINT_CONFLICT = Object.freeze({conflict: false, readWriteConflict: false});
const WRITE_ONLY_FOOTPRINT_CONFLICT = Object.freeze({conflict: true, readWriteConflict: false});
const READ_WRITE_FOOTPRINT_CONFLICT = Object.freeze({conflict: true, readWriteConflict: true});

function classifyTransactionFootprintConflict(existingEntry, candidateFootprint) {
  if (!existingEntry || !candidateFootprint) return WRITE_ONLY_FOOTPRINT_CONFLICT;
  const normalizedExisting = normalizeTransactionFootprint(existingEntry);
  const normalizedCandidate = normalizeTransactionFootprint(candidateFootprint);
  if (doesWriteOverlapRead(normalizedExisting, normalizedCandidate) ||
      doesWriteOverlapRead(normalizedCandidate, normalizedExisting)) {
    return READ_WRITE_FOOTPRINT_CONFLICT;
  }
  return doesWriteOverlapWrite(normalizedExisting, normalizedCandidate) ?
    WRITE_ONLY_FOOTPRINT_CONFLICT : NO_FOOTPRINT_CONFLICT;
}

function doTransactionFootprintsConflict(first, second) {
  return classifyTransactionFootprintConflict(first, second).conflict;
}

function isKeyTouchedByTransactionFootprint(footprint, rowKey) {
  const normalized = normalizeTransactionFootprint(footprint);
  if (normalized.hasUnscopedWrite || normalized.readScope === SCOPE.PARTITION) {
    return true;
  }
  return normalized.rowKeys.has(rowKey) ||
    (normalized.readScope === SCOPE.KEYS && normalized.readKeys.has(rowKey));
}

function decodeParticipantValidationForPartition({
  validationText,
  currentGeneration,
  partitionId,
  originIndex,
}) {
  if (typeof validationText !== 'string' || originIndex === null || originIndex === undefined) {
    return null;
  }
  const decoded = decodeParticipantValidationText(validationText);
  if (decoded === null) return null;
  return resolveValidationRecordBaseGeneration(
    decoded, currentGeneration, partitionId, originIndex);
}

function buildPreparedEntryFromFootprintAndValidation({
  opsFootprint,
  decodedValidation,
  baseGen,
  prepareGen,
}) {
  const readDeps = decodedValidation === null ?
    FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT : decodedValidation.readDependencies;
  return {
    rowKeys: new Set(opsFootprint.rowKeys),
    hasUnscopedWrite: Boolean(opsFootprint.hasUnscopedWrite) || decodedValidation === null,
    readScope: readDeps.readScope,
    readKeys: new Set(readDeps.readKeys),
    hasUnscopedRead: Boolean(readDeps.hasUnscopedRead),
    generationBase: baseGen,
    validatedThroughGeneration: prepareGen,
  };
}

function resolvePreparedEntryReadDependencies({existing, validationText, readDeps, session}) {
  if (readDeps !== null && readDeps !== undefined) {
    return normalizeTransactionFootprint(null, false, readDeps);
  }
  if (typeof validationText === 'string') {
    const decoded = decodeParticipantValidationText(validationText);
    return decoded === null ? FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT : decoded.readDependencies;
  }
  if (existing?.readScope) return existing;
  return session ? getSessionReadDependencySnapshot(session) : NONE_READ_DEPENDENCY_SNAPSHOT;
}

function buildStagedPreparedEntry({
  touchedRowKeys,
  hasUnscopedWrite,
  baseGen,
  currentGen,
  existing,
  validationText,
  readDeps,
  session,
}) {
  const validatedThrough = Math.max(existing?.validatedThroughGeneration ?? baseGen, currentGen);
  const resolvedRead = resolvePreparedEntryReadDependencies({
    existing, validationText, readDeps, session});
  return {
    rowKeys: new Set(touchedRowKeys),
    hasUnscopedWrite: Boolean(hasUnscopedWrite),
    readScope: resolvedRead.readScope,
    readKeys: new Set(resolvedRead.readKeys ?? []),
    hasUnscopedRead: Boolean(resolvedRead.hasUnscopedRead),
    generationBase: baseGen,
    validatedThroughGeneration: validatedThrough,
  };
}

function isEntryDisjointFromCommittedMap(entry, committedGenMap) {
  if (!committedGenMap) return true;
  for (const rk of entry.rowKeys ?? []) {
    if ((committedGenMap.get(rk) ?? ZERO) > entry.generationBase) return false;
  }
  for (const rk of entry.readKeys ?? []) {
    if ((committedGenMap.get(rk) ?? ZERO) > entry.generationBase) return false;
  }
  return true;
}

function hasScopedCandidateFootprint(operationsFootprint, decodedValidation) {
  return Boolean(operationsFootprint?.scoped) &&
    !operationsFootprint.hasUnscopedWrite &&
    Boolean(decodedValidation) &&
    !decodedValidation.hasUnscopedRead;
}

function isRowTouchedInGeneration(row, expectedGen, candidateFootprint) {
  if (Number(row.generation) !== expectedGen || Number(row.scoped) !== ONE) return true;
  const keys = parsedJsonOf(row.row_keys_text);
  if (!Array.isArray(keys) || keys.length === ZERO) return true;
  return keys.some((rk) => isKeyTouchedByTransactionFootprint(candidateFootprint, rk));
}

function areGenerationRowsDisjointFromCandidate(rows, baseGen, candidateFootprint) {
  for (let idx = ZERO; idx < rows.length; idx += ONE) {
    if (isRowTouchedInGeneration(rows[idx], baseGen + idx + ONE, candidateFootprint)) {
      return false;
    }
  }
  return true;
}

function collectPreparedContradictions(footprints) {
  const contradictoryIds = new Set();
  const contradictions = [];
  for (let i = ZERO; i < footprints.length; i += ONE) {
    for (let j = i + ONE; j < footprints.length; j += ONE) {
      if (doTransactionFootprintsConflict(footprints[i].fp, footprints[j].fp)) {
        contradictoryIds.add(footprints[i].participantId);
        contradictoryIds.add(footprints[j].participantId);
        contradictions.push(Object.freeze({
          leftParticipantId: footprints[i].participantId,
          rightParticipantId: footprints[j].participantId,
        }));
      }
    }
  }
  return Object.freeze({
    healthy: contradictions.length === ZERO,
    preparedCount: footprints.length,
    contradictoryParticipantIds: Object.freeze([...contradictoryIds]),
    contradictions: Object.freeze(contradictions),
  });
}

function assembleSessionOperationsText(session) {
  const operations = session?.operations ?? [];
  if (operations.length === ZERO) return EMPTY_OPERATIONS_JSON;
  const encoded = session?.encodedOperations;
  if (Array.isArray(encoded) && encoded.length === operations.length) {
    const assembled = `[${encoded.join(JSON_COMMA_SEPARATOR)}]`;
    if (Buffer.byteLength(assembled, TEXT_ENCODING) === session.bytes) {
      return assembled;
    }
  }
  return JSON.stringify(operations);
}

export {
  FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT,
  areGenerationRowsDisjointFromCandidate,
  assembleSessionOperationsText,
  attachSessionReadDependencyAccumulator,
  buildPreparedEntryFromFootprintAndValidation,
  buildStagedPreparedEntry,
  classifyTransactionFootprintConflict,
  collectPreparedContradictions,
  decodeParticipantValidationForPartition,
  decodeParticipantValidationText,
  doTransactionFootprintsConflict,
  encodeCanonicalReadDependencyRecord,
  getSessionReadDependencySnapshot,
  hasScopedCandidateFootprint,
  isEntryDisjointFromCommittedMap,
  normalizeTransactionFootprint,
  recordSessionReadDependencyFootprint,
  widenSessionReadToPartition,
};
