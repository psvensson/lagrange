/**
 * Reduce coordination for a single `call`/`pushdown` Cell invocation.
 *
 * The sealed contract (`architecture/minimal-deployment-surface.md`)
 * requires `reduce` to execute on any replica of the reducing service
 * that holds the reduce lease, with exactly-once VISIBILITY of the final
 * reduced result — one atomically published snapshot per complete partial
 * set — not exactly-once reduce execution. This module is the
 * per-invocation analogue of `sql-query-loop-parallel-reduce.js`: shards
 * `emit` partials under leased slots in a coordination table, a
 * fail-closed gate accepts only a complete fresh bounded disjoint partial
 * set, and one atomic result-row UPDATE carries the witness that makes
 * the snapshot's provenance checkable.
 *
 * All persistence goes through the injected `executeInternal(sql, params)`
 * executor; the module holds no class state beyond its frozen config.
 * Every conditional write is a guarded single-row UPDATE whose effects
 * are verified by a re-read, so a replacement replica claiming an expired
 * lease cannot double-publish a visible final snapshot.
 */

import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../service/call-cell-routing-contract.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EMPTY_PARTIAL_JSON = '[]';
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
  SLOT_UNAVAILABLE: 'slot_unavailable',
  SLOT_SET_INCOMPLETE: 'slot_set_incomplete',
  SLOT_LEASE_EXPIRED: 'slot_lease_expired',
  PARTIAL_STALE: 'partial_stale',
  PARTIAL_INVALID: 'partial_invalid',
  PARTIAL_UNBOUNDED: 'partial_unbounded',
  SHARD_OVERLAP: 'shard_overlap',
});

const CALL_CELL_REDUCE_FAILURE_MESSAGE = Object.freeze({
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
  return createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
    `${CALL_CELL_REDUCE_FAILURE_MESSAGE[reason]} ` +
      `(invocation=${invocationId}, reason=${reason})`,
    {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  );
}

function assertValidConfig(config) {
  const valid = typeof config?.executeInternal === 'function' &&
    isValidIdentifier(config?.coordinationTable) &&
    isValidIdentifier(config?.resultTable) &&
    Number.isFinite(config?.leaseMs) && config.leaseMs > 0 &&
    Number.isInteger(config?.slotCount) && config.slotCount > 0 &&
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

  // Seed the per-invocation coordination rows the guarded UPDATEs bite on:
  // one expired-lease slot row per expected slot plus the result row the
  // final snapshot atomically fills. Invocation ids are content-fresh
  // (UUID identities from the routing contract), so plain INSERTs are
  // correct — re-seeding an id would mean the orchestrator reused an
  // identity, and the coordination table's primary key is the right place
  // for that to fail loudly.
  async function seedInvocation(invocationId, expectedSlotIds) {
    if (!isNonEmptyString(invocationId)) {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.SEED_REQUIRES_INVOCATION,
      );
    }
    const slotIds = normalizeExpectedSlotIds(expectedSlotIds, config);
    // Seed-time (not 0) as the initial lease_expires_at: the row stays
    // immediately claimable (seed-time <= now) while the reclaim
    // predicate cannot touch it until the retention window has passed —
    // a concurrent invocation's sweep can never race away just-seeded,
    // not-yet-leased rows.
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
    // The seed time stamps the result row so an ABANDONED invocation
    // (result_json never filled) is age-discriminable for reclaim; a
    // published snapshot overwrites computed_at with the publish time.
    assertQuerySuccess(await config.executeInternal(
      `INSERT INTO ${config.resultTable} ` +
      SEED_RESULT_INSERT_COLUMNS +
      `(${sqlLiteral(invocationId)}, ${sqlLiteral(SEED_EMPTY_JSON)}, ` +
      `${nowMs()}, ${sqlLiteral(SEED_EMPTY_JSON)})`,
      [],
    ));
    return {slotIds};
  }

  // Bounded reclaim of coordination garbage: slot rows whose lease lapsed
  // more than the retention window ago, and result rows of ABANDONED
  // invocations (no snapshot ever published) older than the window.
  // Published snapshots are the durable visible result and are never
  // touched here — their retention is a product decision, not coordinator
  // hygiene. Callers sweep opportunistically (e.g. once per new
  // invocation), so accumulation is bounded without a background reaper.
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

  async function publishPartial(
    invocationId, slotId, replicaId, partialJson, computedAt,
  ) {
    const publishedSlotId = normalizeSlotId(slotId);
    if (!isNonEmptyString(invocationId) || !isValidReplicaId(replicaId) ||
        publishedSlotId === null || !Number.isFinite(computedAt) ||
        computedAt <= 0 || typeof partialJson !== 'string') {
      throw new TypeError(
        CALL_CELL_REDUCE_ARGUMENT_MESSAGE.PUBLISH_PARTIAL_REQUIRES,
      );
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

  function parsePartialRows(row, limit) {
    let parsed;
    try {
      parsed = JSON.parse(row.partial_json);
    } catch {
      return {
        valid: false,
        reason: CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID,
      };
    }
    const entriesValid = Array.isArray(parsed) && parsed.every((entry) => {
      const key = entry?.[PARTIAL_ENTRY_SHAPE.KEY_FIELD];
      const value = entry?.[PARTIAL_ENTRY_SHAPE.VALUE_FIELD];
      const keyValid = typeof key === 'string' ||
        (typeof key === 'number' && Number.isFinite(key));
      return keyValid && typeof value === 'number' && Number.isFinite(value);
    });
    const failure = [
      [!Array.isArray(parsed),
        CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID],
      [Array.isArray(parsed) && parsed.length > limit,
        CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED],
      [!entriesValid, CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID],
    ].find(([failed]) => failed);
    if (failure) {
      return {valid: false, reason: failure[1]};
    }
    return {
      valid: true,
      rows: parsed.map((entry) => [
        entry[PARTIAL_ENTRY_SHAPE.KEY_FIELD],
        entry[PARTIAL_ENTRY_SHAPE.VALUE_FIELD],
      ]),
    };
  }

  function mergeDisjointPartialRows(partials, limit) {
    const seen = new Set();
    const merged = [];
    for (const [key, value] of partials) {
      const identity = `${typeof key}:${String(key)}`;
      if (seen.has(identity)) {
        throw new Error(CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP);
      }
      seen.add(identity);
      merged.push([key, value]);
    }
    return merged
      .sort((left, right) => {
        const valueOrder = right[1] - left[1];
        return valueOrder || String(left[0]).localeCompare(
          String(right[0]), undefined, {numeric: true},
        );
      })
      .slice(0, limit);
  }

  function buildResultSnapshotWitness(slotStates) {
    return {
      schemaVersion: RESULT_SNAPSHOT_SCHEMA_VERSION,
      slots: slotStates.map(({row, partial}) => ({
        slotId: Number(row.slot_id),
        replicaId: row.replica_id,
        computedAt: Number(row.computed_at),
        candidateCount: partial.rows.length,
      })),
    };
  }

  function gateCompletePartialSet(slotRows, slotIds, limit, atMs) {
    const rowsBySlotId = new Map(
      slotRows.map((row) => [Number(row.slot_id), row]),
    );
    const slotStates = slotIds.map((expectedSlotId) => {
      const row = rowsBySlotId.get(expectedSlotId);
      const partial = row ?
        parsePartialRows(row, limit) :
        {valid: false};
      return {row, partial};
    });
    const failure = [
      [slotStates.some(({row}) =>
        !row || !isNonEmptyString(row.replica_id)),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_SET_INCOMPLETE],
      [slotStates.some(({row}) =>
        row && Number(row.lease_expires_at) <= atMs),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_LEASE_EXPIRED],
      [slotStates.some(({row}) =>
        row && Number(row.computed_at) <= atMs - config.leaseMs),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_STALE],
      [slotStates.some(({partial}) => !partial.valid),
        slotStates.find(({partial}) => !partial.valid)?.partial.reason ||
          CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_INVALID],
    ].find(([failed]) => failed);
    if (failure) {
      return {complete: false, reason: failure[1]};
    }
    const partials = slotStates.flatMap(({partial}) => partial.rows);
    try {
      return {
        complete: true,
        partials: mergeDisjointPartialRows(partials, limit),
        witness: buildResultSnapshotWitness(slotStates),
      };
    } catch (error) {
      if (error?.message !== CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP) {
        throw error;
      }
      return {
        complete: false,
        reason: CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP,
      };
    }
  }

  async function resolveCompletePartialSet(
    invocationId, expectedSlotIds, limit,
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
    const slotIds = normalizeExpectedSlotIds(expectedSlotIds, config);
    const gate = gateCompletePartialSet(
      await readSlotRows(invocationId), slotIds, limit, nowMs(),
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
    const replicaIds = new Set();
    const slots = [];
    const headerValid =
      parsed.schemaVersion === RESULT_SNAPSHOT_SCHEMA_VERSION &&
      Array.isArray(parsed.slots) &&
      parsed.slots.length === slotIds.length;
    if (!headerValid) {
      return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
    }
    for (let index = 0; index < slotIds.length; index += 1) {
      const slot = parsed.slots[index];
      const candidateCount = Number(slot?.candidateCount);
      const computedAt = Number(slot?.computedAt);
      const slotValid = Number(slot?.slotId) === slotIds[index] &&
        isNonEmptyString(slot?.replicaId) &&
        !replicaIds.has(slot.replicaId) &&
        Number.isFinite(computedAt) && computedAt > 0 &&
        Number.isInteger(candidateCount) && candidateCount >= 0 &&
        candidateCount <= limit;
      if (!slotValid) {
        return {state: CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID};
      }
      replicaIds.add(slot.replicaId);
      slots.push({
        slotId: slotIds[index],
        replicaId: slot.replicaId,
        computedAt,
        candidateCount,
      });
    }
    return {
      state: CALL_CELL_REDUCE_SNAPSHOT_STATE.AVAILABLE,
      schemaVersion: RESULT_SNAPSHOT_SCHEMA_VERSION,
      slots,
    };
  }

  return Object.freeze({
    acquireReduceLease,
    releaseReduceLease,
    publishPartial,
    reclaimExpiredCoordination,
    resolveCompletePartialSet,
    publishFinalSnapshot,
    parseResultSnapshotWitness,
    readSlotRows,
    seedInvocation,
  });
}

export {
  CALL_CELL_REDUCE_INCOMPLETE_REASON,
  CALL_CELL_REDUCE_SNAPSHOT_STATE,
  RESULT_SNAPSHOT_SCHEMA_VERSION,
  RESULT_SNAPSHOT_WITNESS_COLUMN,
  createCallCellReduceCoordinator,
};
