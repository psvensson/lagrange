/**
 * Reduce coordination for a single `call`/`pushdown` Cell invocation.
 *
 * Shards `emit` partials under leased slots in a coordination table, a
 * fail-closed gate accepts only a complete fresh bounded partial set
 * (with deterministic ordering and delivery deduplication), and one atomic
 * result-row UPDATE carries the witness that makes the snapshot's provenance
 * checkable. All persistence goes through the injected `executeInternal(sql, params)`.
 */

import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../service/call-cell-routing-contract.js';
import {
  PARTIAL_CODEC_ERROR_CODE,
  compareCanonicalStrings,
  encodeCanonicalPartialValue,
  isWellFormedUnicode,
  validateCanonicalPartialValue,
} from '../service/call-canonical-partial-codec.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EMPTY_PARTIAL_JSON = '[]';
const UTF8_ENCODING = 'utf8';
const DEFAULT_MAX_PARTIAL_BYTES = 16777216;
const SQL_SINGLE_QUOTE_ESCAPE = '\'\'';
const COORDINATION_QUERY_FAILED =
  'call cell reduce coordination query failed';
const RESULT_SNAPSHOT_SCHEMA_VERSION = 1;
const RESULT_SNAPSHOT_WITNESS_COLUMN = 'source_snapshot_json';
const PARTIAL_ENTRY_SHAPE = Object.freeze({
  KEY_FIELD: 'groupKey',
  VALUE_FIELD: 'aggValue',
});

const CALL_CELL_REDUCE_SNAPSHOT_STATE = Object.freeze({
  AVAILABLE: 'available',
  INVALID: 'invalid',
  UNAVAILABLE: 'unavailable',
});

const CALL_CELL_REDUCE_INCOMPLETE_REASON = Object.freeze({
  DELIVERY_CONFLICT: 'delivery_conflict',
  PARTIAL_INVALID: 'partial_invalid',
  PARTIAL_STALE: 'partial_stale',
  PARTIAL_UNBOUNDED: 'partial_unbounded',
  SHARD_OVERLAP: 'shard_overlap',
  SLOT_LEASE_EXPIRED: 'slot_lease_expired',
  SLOT_SET_INCOMPLETE: 'slot_set_incomplete',
  SLOT_UNAVAILABLE: 'slot_unavailable',
  STALE_DELIVERY: 'stale_delivery',
});

const CALL_CELL_REDUCE_FAILURE_MESSAGE = Object.freeze({
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT]:
    'a delivery identity was replayed with conflicting canonical bytes or fence',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_UNAVAILABLE]:
    'no leased reduce slot is available for the invocation',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_SET_INCOMPLETE]:
    'the invocation partial set does not cover every expected slot',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_LEASE_EXPIRED]:
    'a contributing slot lease expired before reduce completed',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_STALE]:
    'a contributing partial is older than the reduce lease window',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID]:
    'a contributing partial is not a valid bounded partial JSON array',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED]:
    'a contributing partial exceeds the declared batch bound',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP]:
    'two partials emit the same group key; shards are not disjoint',
  [CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY]:
    'a contributing partial carries a stale attempt or unadmitted shard fence',
});

const CALL_CELL_REDUCE_ARGUMENT_MESSAGE = Object.freeze({
  CONSTRUCTOR_REQUIRES:
    'createCallCellReduceCoordinator requires executeInternal, ' +
    'coordinationTable, resultTable, leaseMs, slotCount, nowProvider',
  EXPECTED_SLOT_IDS_ARRAY: 'expectedSlotIds must be a non-empty array',
  EXPECTED_SLOT_IDS_UNIQUE:
    'expectedSlotIds must contain unique positive integers',
  ACQUIRE_REQUIRES_IDS:
    'acquireReduceLease requires an invocation id and replica id',
  ACQUIRE_REQUIRES_SLOT: 'acquireReduceLease requires a positive slot id',
  PUBLISH_PARTIAL_REQUIRES:
    'publishPartial requires invocationId, slotId, replicaId, ' +
    'a partial JSON string, and a positive computedAt',
  RESOLVE_REQUIRES_INVOCATION:
    'resolveCompletePartialSet requires an invocation id',
  RESOLVE_REQUIRES_LIMIT:
    'resolveCompletePartialSet requires a positive integer limit',
  RESOLVE_REQUIRES_BYTE_LIMIT:
    'resolveCompletePartialSet requires a positive integer byteLimit',
  PUBLISH_SNAPSHOT_REQUIRES:
    'publishFinalSnapshot requires an invocation id and result JSON',
  SEED_REQUIRES_INVOCATION:
    'seedInvocation requires a fresh invocation id',
  RECLAIM_REQUIRES_RETENTION:
    'reclaimExpiredCoordination requires a positive retention window',
});
const SEED_SLOT_EMPTY_REPLICA = '';
const SEED_EMPTY_JSON = '';
const SEED_SLOT_INSERT_COLUMNS =
  '(invocation_id, slot_id, replica_id, lease_expires_at, ' +
  'partial_json, computed_at) VALUES ';
const SEED_RESULT_INSERT_COLUMNS =
  '(result_id, result_json, computed_at, ' +
  `${RESULT_SNAPSHOT_WITNESS_COLUMN}) VALUES `;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidIdentifier(value) {
  return isNonEmptyString(value) && IDENTIFIER_PATTERN.test(value);
}

function isValidReplicaId(value) {
  return isNonEmptyString(value);
}

function normalizeSlotId(slotId) {
  const numeric = Number(slotId);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function isValidLimit(limit) {
  return Number.isInteger(limit) && limit > 0;
}

function sqlLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ?
    String(value) :
    `'${String(value).replace(/'/g, SQL_SINGLE_QUOTE_ESCAPE)}'`;
}

function resultRows(result) {
  return result?.results || result?.rows || [];
}

function assertQuerySuccess(result) {
  if (result?.success === false) {
    throw new Error(result.error || COORDINATION_QUERY_FAILED);
  }
  return result;
}

function createReduceIncompleteFailure(reason, invocationId) {
  const err = createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
    `${CALL_CELL_REDUCE_FAILURE_MESSAGE[reason]} (invocation=${invocationId}, reason=${reason})`,
    {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  );
  err.reason = reason;
  return err;
}

function hasValidConfigTables(config) {
  return isValidIdentifier(config?.coordinationTable) &&
    isValidIdentifier(config?.resultTable);
}

function hasValidOptionalMaxBytes(config) {
  return config?.maxPartialBytes === undefined ||
    isValidLimit(config.maxPartialBytes);
}

function hasValidConfigBounds(config) {
  return Number.isFinite(config?.leaseMs) && config.leaseMs > 0 &&
    Number.isInteger(config?.slotCount) && config.slotCount > 0 &&
    hasValidOptionalMaxBytes(config);
}

function assertValidConfig(config) {
  const valid = typeof config?.executeInternal === 'function' &&
    hasValidConfigTables(config) &&
    hasValidConfigBounds(config) &&
    typeof config?.nowProvider === 'function';
  if (!valid) {
    throw new TypeError(
      CALL_CELL_REDUCE_ARGUMENT_MESSAGE.CONSTRUCTOR_REQUIRES,
    );
  }
}

function normalizeExpectedSlotIds(expectedSlotIds, config) {
  const source = expectedSlotIds === undefined ?
    Array.from({length: config.slotCount}, (_, index) => index + 1) :
    expectedSlotIds;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError(
      CALL_CELL_REDUCE_ARGUMENT_MESSAGE.EXPECTED_SLOT_IDS_ARRAY);
  }
  const slotIds = source.map(normalizeSlotId);
  if (slotIds.some((slotId) => slotId === null) ||
      new Set(slotIds).size !== slotIds.length) {
    throw new TypeError(
      CALL_CELL_REDUCE_ARGUMENT_MESSAGE.EXPECTED_SLOT_IDS_UNIQUE,
    );
  }
  return [...slotIds].sort((left, right) => left - right);
}

function witnessSlotEntryValid(slot, expectedSlotId, replicaIds, limit) {
  const candidateCount = Number(slot?.candidateCount);
  const computedAt = Number(slot?.computedAt);
  return Number(slot?.slotId) === expectedSlotId &&
    isNonEmptyString(slot?.replicaId) &&
    !replicaIds.has(slot.replicaId) &&
    Number.isFinite(computedAt) && computedAt > 0 &&
    Number.isInteger(candidateCount) && candidateCount >= 0 &&
    candidateCount <= limit;
}

function parseWitnessSlotEntries(parsedSlots, slotIds, limit) {
  const replicaIds = new Set();
  const slots = [];
  for (let index = 0; index < slotIds.length; index += 1) {
    const slot = parsedSlots[index];
    if (!witnessSlotEntryValid(slot, slotIds[index], replicaIds, limit)) {
      return null;
    }
    replicaIds.add(slot.replicaId);
    slots.push({
      slotId: slotIds[index],
      replicaId: slot.replicaId,
      computedAt: Number(slot.computedAt),
      candidateCount: Number(slot.candidateCount),
    });
  }
  return slots;
}

function isValidPartialGroupKey(key) {
  if (typeof key === 'string') {
    return key.length > 0 && isWellFormedUnicode(key);
  }
  return typeof key === 'number' && Number.isFinite(key) &&
    (!Number.isInteger(key) || Number.isSafeInteger(key));
}

function normalizeEntryGroupKey(key) {
  return typeof key === 'number' && Object.is(key, -0) ? 0 : key;
}

function classifyCodecErrorReason(error) {
  if (error?.code === PARTIAL_CODEC_ERROR_CODE.BYTE_OVERFLOW ||
      error?.code === PARTIAL_CODEC_ERROR_CODE.ELEMENT_COUNT_OVERFLOW ||
      error?.code === PARTIAL_CODEC_ERROR_CODE.DEPTH_OVERFLOW) {
    return CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED;
  }
  return CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID;
}

function isStaleOrInvalidEntryAttempt(entry, activeAttempt) {
  if (entry.stale === true) return true;
  if (entry.attempt === undefined) return false;
  if (!Number.isInteger(entry.attempt) || entry.attempt <= 0) return true;
  return activeAttempt !== undefined && entry.attempt !== activeAttempt;
}

function extractContributionDeliveryMeta(entry, row, ordinal) {
  const slotId = Number(row.slot_id);
  const explicitShardId = isNonEmptyString(entry.shardId) ?
    entry.shardId :
    null;
  const shardId = explicitShardId ?? String(slotId);
  const emissionOrdinal =
    Number.isInteger(entry.emissionOrdinal) && entry.emissionOrdinal >= 0 ?
      entry.emissionOrdinal :
      ordinal;
  const attempt = Number.isInteger(entry.attempt) ? entry.attempt : 1;
  const deliveryId = isNonEmptyString(entry.deliveryId) ?
    entry.deliveryId :
    `slot=${slotId}:shard=${shardId}:ord=${emissionOrdinal}`;
  return {attempt, deliveryId, emissionOrdinal, explicitShardId, shardId, slotId};
}

function entryAdmissionFailureReason(entry, activeAttempt) {
  const validShape = Boolean(
    entry && typeof entry === 'object' && !Array.isArray(entry) &&
    isValidPartialGroupKey(entry[PARTIAL_ENTRY_SHAPE.KEY_FIELD]) &&
    Object.prototype.hasOwnProperty.call(entry, PARTIAL_ENTRY_SHAPE.VALUE_FIELD),
  );
  if (!validShape) return CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID;
  return isStaleOrInvalidEntryAttempt(entry, activeAttempt) ?
    CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY :
    null;
}

function normalizeSinglePartialEntry(entry, row, ordinal, activeAttempt) {
  const admissionReason = entryAdmissionFailureReason(entry, activeAttempt);
  if (admissionReason !== null) {
    return {reason: admissionReason};
  }
  const groupKey = normalizeEntryGroupKey(entry[PARTIAL_ENTRY_SHAPE.KEY_FIELD]);
  let aggValue;
  let canonicalValueJson;
  try {
    aggValue = validateCanonicalPartialValue(
      entry[PARTIAL_ENTRY_SHAPE.VALUE_FIELD]);
    canonicalValueJson = encodeCanonicalPartialValue(aggValue);
  } catch (error) {
    return {reason: classifyCodecErrorReason(error)};
  }
  const meta = extractContributionDeliveryMeta(entry, row, ordinal);
  return {
    contribution: Object.freeze({
      ...meta,
      aggValue,
      canonicalValueJson,
      groupKey,
      groupKeyIdentity: `${typeof groupKey}:${String(groupKey)}`,
    }),
  };
}

function compareOrderedContributions(left, right) {
  if (left.explicitShardId !== null && right.explicitShardId !== null) {
    const shardOrder = compareCanonicalStrings(
      left.explicitShardId,
      right.explicitShardId,
    );
    if (shardOrder !== 0) return shardOrder;
  }
  if (left.slotId !== right.slotId) {
    return left.slotId - right.slotId;
  }
  return left.emissionOrdinal - right.emissionOrdinal;
}

function isIdenticalDeliveryContribution(existing, candidate) {
  return existing.groupKeyIdentity === candidate.groupKeyIdentity &&
    existing.canonicalValueJson === candidate.canonicalValueJson &&
    existing.attempt === candidate.attempt &&
    existing.shardId === candidate.shardId;
}

function admitAndOrderContributions(slotStates, limit) {
  const byDeliveryId = new Map();
  const uniqueCountBySlot = new Map();
  for (const {row, partial} of slotStates) {
    const slotId = Number(row.slot_id);
    let slotUnique = uniqueCountBySlot.get(slotId) ?? 0;
    for (const item of partial.contributions) {
      const existing = byDeliveryId.get(item.deliveryId);
      if (existing) {
        if (!isIdenticalDeliveryContribution(existing, item)) {
          throw new Error(CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT);
        }
        continue;
      }
      byDeliveryId.set(item.deliveryId, item);
      slotUnique += 1;
    }
    if (slotUnique > limit) {
      throw new Error(CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED);
    }
    uniqueCountBySlot.set(slotId, slotUnique);
  }
  if (byDeliveryId.size > limit) {
    throw new Error(CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED);
  }
  const ordered = [...byDeliveryId.values()].sort(compareOrderedContributions);
  return {
    partials: ordered.map((item) => [item.groupKey, item.aggValue]),
    uniqueCountBySlot,
  };
}

function createCallCellReduceCoordinator(options) {
  const config = Object.freeze({...options});
  assertValidConfig(config);

  function nowMs() {
    return Number(config.nowProvider());
  }

  async function readSlotRows(invocationId) {
    const result = assertQuerySuccess(await config.executeInternal(
      'SELECT slot_id, replica_id, lease_expires_at, partial_json, ' +
      `computed_at FROM ${config.coordinationTable} ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)}`,
      [],
    ));
    return resultRows(result);
  }

  function ownedSlotRow(rows, replicaId, slotId, atMs) {
    return rows.find((row) =>
      Number(row.slot_id) === Number(slotId) &&
      row.replica_id === replicaId &&
      Number(row.lease_expires_at) > atMs) || null;
  }

  async function renewOwnedSlot(invocationId, replicaId, slotId, atMs) {
    const leaseExpiresAt = atMs + config.leaseMs;
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.coordinationTable} SET ` +
      `lease_expires_at = ${leaseExpiresAt} ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)} AND ` +
      `slot_id = ${slotId} AND replica_id = ${sqlLiteral(replicaId)}`,
      [],
    ));
    return ownedSlotRow(
      await readSlotRows(invocationId), replicaId, slotId, atMs);
  }

  async function claimExpiredSlot(invocationId, replicaId, slotId, atMs) {
    const leaseExpiresAt = atMs + config.leaseMs;
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.coordinationTable} SET ` +
      `replica_id = ${sqlLiteral(replicaId)}, ` +
      `lease_expires_at = ${leaseExpiresAt}, ` +
      `partial_json = ${sqlLiteral(EMPTY_PARTIAL_JSON)}, computed_at = 0 ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)} AND ` +
      `slot_id = ${slotId} AND lease_expires_at <= ${atMs}`,
      [],
    ));
    return ownedSlotRow(
      await readSlotRows(invocationId), replicaId, slotId, atMs);
  }

  // Seed per-invocation coordination rows (one expired-lease slot row per
  // expected slot plus the result row the final snapshot atomically fills).
  async function seedInvocation(invocationId, expectedSlotIds, admissionMeta) {
    if (!isNonEmptyString(invocationId)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.SEED_REQUIRES_INVOCATION,
      );
    }
    const slotIds = normalizeExpectedSlotIds(expectedSlotIds, config);
    const seededAt = nowMs();
    for (const slotId of slotIds) {
      assertQuerySuccess(await config.executeInternal(
        `INSERT INTO ${config.coordinationTable} ` +
        SEED_SLOT_INSERT_COLUMNS +
        `(${sqlLiteral(invocationId)}, ${slotId}, ` +
        `${sqlLiteral(SEED_SLOT_EMPTY_REPLICA)}, ${seededAt}, ` +
        `${sqlLiteral(EMPTY_PARTIAL_JSON)}, 0)`,
        [],
      ));
    }
    const initialWitness = admissionMeta ? JSON.stringify({admissionMeta}) : SEED_EMPTY_JSON;
    assertQuerySuccess(await config.executeInternal(
      `INSERT INTO ${config.resultTable} ` + SEED_RESULT_INSERT_COLUMNS +
      `(${sqlLiteral(invocationId)}, ${sqlLiteral(SEED_EMPTY_JSON)}, ` +
      `${nowMs()}, ${sqlLiteral(initialWitness)})`, [],
    ));
    return {slotIds};
  }

  async function readResultRow(invocationId) {
    if (!isNonEmptyString(invocationId)) return null;
    const result = assertQuerySuccess(await config.executeInternal(
      `SELECT result_id, result_json, computed_at, ${RESULT_SNAPSHOT_WITNESS_COLUMN} ` +
      `FROM ${config.resultTable} WHERE result_id = ${sqlLiteral(invocationId)}`, [],
    ));
    return resultRows(result)[0] || null;
  }

  async function updateResultWitness(invocationId, witness) {
    if (!isNonEmptyString(invocationId)) return;
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.resultTable} SET computed_at = ${nowMs()}, ` +
      `${RESULT_SNAPSHOT_WITNESS_COLUMN} = ${sqlLiteral(JSON.stringify(witness ?? null))} ` +
      `WHERE result_id = ${sqlLiteral(invocationId)}`, [],
    ));
  }

  // Bounded reclaim of coordination garbage: expired slot rows and abandoned
  // result rows older than the retention window. Published snapshots stay.
  async function reclaimExpiredCoordination(retentionMs) {
    if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.RECLAIM_REQUIRES_RETENTION,
      );
    }
    const reclaimBefore = nowMs() - retentionMs;
    assertQuerySuccess(await config.executeInternal(
      `DELETE FROM ${config.coordinationTable} ` +
      `WHERE lease_expires_at <= ${reclaimBefore}`,
      [],
    ));
    assertQuerySuccess(await config.executeInternal(
      `DELETE FROM ${config.resultTable} ` +
      `WHERE result_json = ${sqlLiteral(SEED_EMPTY_JSON)} AND ` +
      `computed_at <= ${reclaimBefore}`,
      [],
    ));
    return {reclaimBefore};
  }

  async function acquireReduceLease(invocationId, replicaId, slotId) {
    if (!isNonEmptyString(invocationId) || !isValidReplicaId(replicaId)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.ACQUIRE_REQUIRES_IDS,
      );
    }
    const requestedSlotId = normalizeSlotId(slotId);
    if (requestedSlotId === null) {
      throw new TypeError(CALL_CELL_REDUCE_ARGUMENT_MESSAGE.ACQUIRE_REQUIRES_SLOT);
    }
    const atMs = nowMs();
    const renewed = await renewOwnedSlot(
      invocationId, replicaId, requestedSlotId, atMs,
    );
    if (renewed && Number(renewed.slot_id) === requestedSlotId) {
      return renewed;
    }
    const claimed = await claimExpiredSlot(
      invocationId, replicaId, requestedSlotId, atMs,
    );
    if (claimed && Number(claimed.slot_id) === requestedSlotId) {
      return claimed;
    }
    throw createReduceIncompleteFailure(
      CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_UNAVAILABLE, invocationId,
    );
  }

  async function releaseReduceLease(invocationId, replicaId, slotId) {
    const releasedSlotId = normalizeSlotId(slotId);
    if (!isNonEmptyString(invocationId) || !isValidReplicaId(replicaId) ||
        releasedSlotId === null) {
      return;
    }
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.coordinationTable} SET lease_expires_at = 0 ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)} AND ` +
      `slot_id = ${releasedSlotId} AND ` +
      `replica_id = ${sqlLiteral(replicaId)}`,
      [],
    ));
  }

  function assertPublishSlotArgs(
    invocationId, publishedSlotId, replicaId, partialJson, computedAt, options,
  ) {
    if (!isNonEmptyString(invocationId) || !isValidReplicaId(replicaId) ||
        publishedSlotId === null || !Number.isFinite(computedAt) ||
        computedAt <= 0 || typeof partialJson !== 'string') {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.PUBLISH_PARTIAL_REQUIRES);
    }
    if (options?.attempt < options?.fenceAttempt) {
      throw createReduceIncompleteFailure(
        CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY, invocationId);
    }
  }

  async function publishPartial(
    invocationId, slotId, replicaId, partialJson, computedAt, options,
  ) {
    const publishedSlotId = normalizeSlotId(slotId);
    assertPublishSlotArgs(
      invocationId, publishedSlotId, replicaId, partialJson, computedAt, options);
    const existingRows = await readSlotRows(invocationId);
    const ownedRow = existingRows.find(
      (row) => Number(row.slot_id) === publishedSlotId &&
        row.replica_id === replicaId);
    if (ownedRow && ownedRow.partial_json !== EMPTY_PARTIAL_JSON &&
        Number(ownedRow.computed_at) > 0 &&
        ownedRow.partial_json !== partialJson) {
      throw createReduceIncompleteFailure(
        CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT, invocationId);
    }
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.coordinationTable} SET ` +
      `partial_json = ${sqlLiteral(partialJson)}, ` +
      `computed_at = ${Math.trunc(computedAt)} ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)} AND ` +
      `slot_id = ${publishedSlotId} AND ` +
      `replica_id = ${sqlLiteral(replicaId)}`,
      [],
    ));
  }

  function parsePartialRows(row, limit, byteLimit) {
    const byteLength = Buffer.byteLength(
      String(row.partial_json), UTF8_ENCODING);
    if (byteLength > byteLimit) {
      return {
        valid: false,
        byteLength,
        reason: CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
      };
    }
    let parsed;
    try {
      parsed = JSON.parse(row.partial_json);
    } catch {
      return {
        valid: false,
        byteLength,
        reason: CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID,
      };
    }
    if (!Array.isArray(parsed)) {
      return {
        valid: false,
        byteLength,
        reason: CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID,
      };
    }
    const contributions = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const normalized = normalizeSinglePartialEntry(
        parsed[index], row, index, config.activeAttempt);
      if (normalized.reason) {
        return {valid: false, byteLength, reason: normalized.reason};
      }
      contributions.push(normalized.contribution);
    }
    return {
      valid: true,
      byteLength,
      contributions,
      rows: contributions.map((item) => [item.groupKey, item.aggValue]),
    };
  }

  function buildResultSnapshotWitness(slotStates, uniqueCountBySlot) {
    return {
      schemaVersion: RESULT_SNAPSHOT_SCHEMA_VERSION,
      slots: slotStates.map(({row, partial}) => ({
        slotId: Number(row.slot_id),
        replicaId: row.replica_id,
        computedAt: Number(row.computed_at),
        candidateCount:
          uniqueCountBySlot?.get(Number(row.slot_id)) ?? partial.rows.length,
      })),
    };
  }

  function sumSlotPartialBytes(slotStates) {
    let totalBytes = 0;
    for (const {partial} of slotStates) totalBytes += partial.byteLength || 0;
    return totalBytes;
  }

  function isMergeIncompleteReason(reason) {
    return reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT ||
      reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY ||
      reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP ||
      reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED;
  }

  function gateCompletePartialSet(slotRows, slotIds, limit, atMs, byteLimit) {
    const rowsBySlotId = new Map(
      slotRows.map((row) => [Number(row.slot_id), row]));
    const slotStates = slotIds.map((expectedSlotId) => {
      const row = rowsBySlotId.get(expectedSlotId);
      const partial = row ?
        parsePartialRows(row, limit, byteLimit) :
        {valid: false, byteLength: 0};
      return {row, partial};
    });
    const failure = [
      [slotStates.some(({row}) => !row || !isNonEmptyString(row.replica_id)),
        CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_SET_INCOMPLETE],
      [slotStates.some(({row}) => row && Number(row.lease_expires_at) <= atMs),
        CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_LEASE_EXPIRED],
      [slotStates.some(({row}) =>
        row && Number(row.computed_at) <= atMs - config.leaseMs),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_STALE],
      [slotStates.some(({partial}) => !partial.valid),
        slotStates.find(({partial}) => !partial.valid)?.partial.reason ||
          CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID],
      [sumSlotPartialBytes(slotStates) > byteLimit,
        CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED],
    ].find(([failed]) => failed);
    if (failure) return {complete: false, reason: failure[1]};
    try {
      const {partials, uniqueCountBySlot} = admitAndOrderContributions(
        slotStates, limit);
      return {
        complete: true,
        partials,
        witness: buildResultSnapshotWitness(slotStates, uniqueCountBySlot),
      };
    } catch (error) {
      if (!isMergeIncompleteReason(error?.message)) throw error;
      return {complete: false, reason: error.message};
    }
  }

  function resolveEffectiveByteLimit(byteLimit) {
    const rawLimit = typeof byteLimit === 'object' && byteLimit !== null ?
      byteLimit.byteLimit :
      byteLimit;
    const resolved = rawLimit === undefined ?
      (config.maxPartialBytes ?? DEFAULT_MAX_PARTIAL_BYTES) :
      rawLimit;
    if (!isValidLimit(resolved)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.RESOLVE_REQUIRES_BYTE_LIMIT);
    }
    return resolved;
  }

  async function resolveCompletePartialSet(
    invocationId, expectedSlotIds, limit, byteLimit,
  ) {
    if (!isNonEmptyString(invocationId)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.RESOLVE_REQUIRES_INVOCATION,
      );
    }
    if (!isValidLimit(limit)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.RESOLVE_REQUIRES_LIMIT,
      );
    }
    const effectiveByteLimit = resolveEffectiveByteLimit(byteLimit);
    const slotIds = normalizeExpectedSlotIds(expectedSlotIds, config);
    const gate = gateCompletePartialSet(
      await readSlotRows(invocationId),
      slotIds,
      limit,
      nowMs(),
      effectiveByteLimit,
    );
    if (!gate.complete) {
      throw createReduceIncompleteFailure(gate.reason, invocationId);
    }
    return gate;
  }

  async function publishFinalSnapshot(invocationId, resultJson, witness) {
    if (!isNonEmptyString(invocationId) || typeof resultJson !== 'string') {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.PUBLISH_SNAPSHOT_REQUIRES,
      );
    }
    const witnessJson = JSON.stringify(witness ?? null);
    const computedAt = nowMs();
    assertQuerySuccess(await config.executeInternal(
      `UPDATE ${config.resultTable} SET ` +
      `result_json = ${sqlLiteral(resultJson)}, ` +
      `computed_at = ${computedAt}, ` +
      `${RESULT_SNAPSHOT_WITNESS_COLUMN} = ${sqlLiteral(witnessJson)} ` +
      `WHERE result_id = ${sqlLiteral(invocationId)}`,
      [],
    ));
    return {computedAt, witness};
  }

  function parseResultSnapshotWitness(value, expectedSlotIds, limit) {
    const slotIds = normalizeExpectedSlotIds(expectedSlotIds, config);
    let parsed;
    if (value === undefined || value === null || value === '') {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.UNAVAILABLE};
    }
    try {
      parsed = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
    }
    if (!parsed || typeof parsed !== 'object') {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
    }
    const headerValid =
      parsed.schemaVersion === RESULT_SNAPSHOT_SCHEMA_VERSION &&
      Array.isArray(parsed.slots) &&
      parsed.slots.length === slotIds.length;
    if (!headerValid) {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
    }
    const slots = parseWitnessSlotEntries(parsed.slots, slotIds, limit);
    if (!slots) {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
    }
    return {
      state: CALL_CELL_REDUCE_SNAPSHOT_STATE.AVAILABLE,
      schemaVersion: RESULT_SNAPSHOT_SCHEMA_VERSION,
      slots,
    };
  }

  return Object.freeze({
    acquireReduceLease, parseResultSnapshotWitness, publishFinalSnapshot,
    publishPartial, readResultRow, readSlotRows, reclaimExpiredCoordination,
    releaseReduceLease, resolveCompletePartialSet, seedInvocation,
    updateResultWitness,
  });
}

export {
  CALL_CELL_REDUCE_INCOMPLETE_REASON,
  CALL_CELL_REDUCE_SNAPSHOT_STATE,
  createCallCellReduceCoordinator,
};
