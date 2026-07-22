/**
 * Stable work ownership and atomic snapshot exchange for the SQL query
 * loop's cross-replica reduce mode.
 *
 * Replica ids are generations (`service-r1`, then `-r3` after a
 * REPLACE), so they cannot own shard identity. The coordination table
 * owns a fixed set of leased slots instead. A replacement waits for or
 * claims the expired slot, clears its predecessor's partial atomically,
 * and then runs the SQL assigned to that slot.
 */

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EMPTY_PARTIAL_JSON = '[]';
const SQL_SINGLE_QUOTE_ESCAPE = '\'\'';
const COORDINATION_QUERY_FAILED =
  'parallel reduce coordination query failed';
const UNASSIGNED_SLOT_ID = 0;
const RESULT_SNAPSHOT_SCHEMA_VERSION = 1;
const RESULT_SNAPSHOT_STATE = Object.freeze({
  AVAILABLE: 'available',
  INVALID: 'invalid',
  UNAVAILABLE: 'unavailable',
});
const RESULT_SNAPSHOT_RESERVED_COLUMNS = new Set([
  'result_id',
  'result_json',
  'computed_at',
]);

const PARALLEL_REDUCE_REASON = Object.freeze({
  SLOT_UNAVAILABLE: 'slot_unavailable',
  SLOT_SET_INCOMPLETE: 'slot_set_incomplete',
  SLOT_LEASE_EXPIRED: 'slot_lease_expired',
  PARTIAL_STALE: 'partial_stale',
  PARTIAL_INVALID: 'partial_invalid',
  PARTIAL_UNBOUNDED: 'partial_unbounded',
  SHARD_OVERLAP: 'shard_overlap',
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidIdentifier(value) {
  return isNonEmptyString(value) && IDENTIFIER_PATTERN.test(value);
}

function configuredSlotIds(config) {
  return Object.keys(config?.shardSqlBySlot || {})
    .map(Number)
    .sort((left, right) => left - right);
}

function hasValidSlotSql(config, slotIds) {
  return slotIds.length > 1 && slotIds.every((slotId) =>
    Number.isInteger(slotId) && slotId > 0 &&
    isNonEmptyString(config.shardSqlBySlot[String(slotId)]));
}

function hasValidResultSnapshotIdentifiers(config, resultTable) {
  return [
    config?.coordinationTable,
    resultTable,
    config?.resultSnapshotColumn,
  ].every(isValidIdentifier) &&
    !RESULT_SNAPSHOT_RESERVED_COLUMNS.has(config.resultSnapshotColumn);
}

function isValidParallelReduceConfig(config, resultTable) {
  const slotIds = configuredSlotIds(config);
  return hasValidResultSnapshotIdentifiers(config, resultTable) &&
    isNonEmptyString(config?.resultId) &&
    Number.isFinite(config?.leaseMs) && config.leaseMs > 0 &&
    Number.isInteger(config?.coordinatorSlot) &&
    slotIds.includes(config.coordinatorSlot) &&
    hasValidSlotSql(config, slotIds);
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

async function readSlotRows(queryExecutor, coordinationTable) {
  const result = assertQuerySuccess(await queryExecutor(
    'SELECT slot_id, replica_id, lease_expires_at, partial_json, ' +
    `computed_at FROM ${coordinationTable}`,
    [],
  ));
  return resultRows(result);
}

function ownedSlotRow(rows, serviceId, nowMs) {
  return rows.find((row) =>
    row.replica_id === serviceId && Number(row.lease_expires_at) > nowMs);
}

async function renewOwnedSlot(
  queryExecutor, config, serviceId, slotId, nowMs,
) {
  const leaseExpiresAt = nowMs + config.leaseMs;
  assertQuerySuccess(await queryExecutor(
    `UPDATE ${config.coordinationTable} SET ` +
    `lease_expires_at = ${leaseExpiresAt} ` +
    `WHERE slot_id = ${slotId} AND replica_id = ${sqlLiteral(serviceId)}`,
    [],
  ));
  const rows = await readSlotRows(queryExecutor, config.coordinationTable);
  return ownedSlotRow(rows, serviceId, nowMs) || null;
}

async function claimExpiredSlot(
  queryExecutor, config, serviceId, slotId, nowMs,
) {
  const leaseExpiresAt = nowMs + config.leaseMs;
  assertQuerySuccess(await queryExecutor(
    `UPDATE ${config.coordinationTable} SET ` +
    `replica_id = ${sqlLiteral(serviceId)}, ` +
    `lease_expires_at = ${leaseExpiresAt}, ` +
    `partial_json = ${sqlLiteral(EMPTY_PARTIAL_JSON)}, computed_at = 0 ` +
    `WHERE slot_id = ${slotId} AND lease_expires_at <= ${nowMs}`,
    [],
  ));
  const rows = await readSlotRows(queryExecutor, config.coordinationTable);
  return ownedSlotRow(rows, serviceId, nowMs) || null;
}

async function acquireReduceSlot(
  currentSlotId, queryExecutor, config, serviceId,
) {
  const nowMs = Date.now();
  if (currentSlotId !== UNASSIGNED_SLOT_ID) {
    const renewed = await renewOwnedSlot(
      queryExecutor, config, serviceId, currentSlotId, nowMs,
    );
    if (renewed) {
      return renewed;
    }
  }
  const rows = await readSlotRows(queryExecutor, config.coordinationTable);
  const alreadyOwned = ownedSlotRow(rows, serviceId, nowMs);
  if (alreadyOwned) {
    return alreadyOwned;
  }
  const expired = rows
    .filter((row) => Number(row.lease_expires_at) <= nowMs)
    .sort((left, right) => Number(left.slot_id) - Number(right.slot_id));
  for (const candidate of expired) {
    const claimed = await claimExpiredSlot(
      queryExecutor, config, serviceId, Number(candidate.slot_id), nowMs,
    );
    if (claimed) {
      return claimed;
    }
  }
  return null;
}

function parsePartialRows(row, limit) {
  let parsed;
  try {
    parsed = JSON.parse(row.partial_json);
  } catch {
    return {valid: false, reason: PARALLEL_REDUCE_REASON.PARTIAL_INVALID};
  }
  const entriesValid = Array.isArray(parsed) && parsed.every((entry) => {
    const groupKeyType = typeof entry?.groupKey;
    const groupKeyValid = groupKeyType === 'string' ||
      (groupKeyType === 'number' && Number.isFinite(entry.groupKey));
    return groupKeyValid && typeof entry.aggValue === 'number' &&
      Number.isFinite(entry.aggValue);
  });
  const failure = [
    [!Array.isArray(parsed), PARALLEL_REDUCE_REASON.PARTIAL_INVALID],
    [Array.isArray(parsed) && parsed.length > limit,
      PARALLEL_REDUCE_REASON.PARTIAL_UNBOUNDED],
    [!entriesValid, PARALLEL_REDUCE_REASON.PARTIAL_INVALID],
  ].find(([failed]) => failed);
  return !failure ?
    {valid: true, rows: parsed.map((entry) => ({
      groupKey: entry.groupKey,
      aggValue: entry.aggValue,
    }))} :
    {valid: false, reason: failure[1]};
}

function mergeDisjointPartialRows(rows, limit) {
  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const key = String(row.groupKey);
    if (seen.has(key)) {
      throw new Error(PARALLEL_REDUCE_REASON.SHARD_OVERLAP);
    }
    seen.add(key);
    candidates.push(row);
  }
  return candidates
    .sort((left, right) => {
      const aggregateOrder = right.aggValue - left.aggValue;
      return aggregateOrder || String(left.groupKey).localeCompare(
        String(right.groupKey), undefined, {numeric: true},
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

function parseResultSnapshotJson(value) {
  if (value === undefined || value === null || value === '') {
    return {state: RESULT_SNAPSHOT_STATE.UNAVAILABLE};
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ?
      {state: RESULT_SNAPSHOT_STATE.AVAILABLE, value: parsed} :
      {state: RESULT_SNAPSHOT_STATE.INVALID};
  } catch {
    return {state: RESULT_SNAPSHOT_STATE.INVALID};
  }
}

function resultSnapshotHeaderIsValid(parsed, slotIds) {
  return parsed?.schemaVersion === RESULT_SNAPSHOT_SCHEMA_VERSION &&
    Array.isArray(parsed.slots) &&
    parsed.slots.length === slotIds.length;
}

function resultSnapshotIdentityIsValid(slot, replicaIds) {
  return isNonEmptyString(slot?.replicaId) &&
    !replicaIds.has(slot.replicaId);
}

function resultSnapshotComputedAtIsValid(computedAt) {
  return Number.isFinite(computedAt) && computedAt > 0;
}

function resultSnapshotCandidateCountIsValid(candidateCount, limit) {
  return Number.isInteger(candidateCount) &&
    candidateCount >= 0 &&
    candidateCount <= limit;
}

function normalizeResultSnapshotSlot(slot, expectedSlotId, limit, replicaIds) {
  const candidateCount = Number(slot?.candidateCount);
  const computedAt = Number(slot?.computedAt);
  const valid = [
    Number(slot?.slotId) === expectedSlotId,
    resultSnapshotIdentityIsValid(slot, replicaIds),
    resultSnapshotComputedAtIsValid(computedAt),
    resultSnapshotCandidateCountIsValid(candidateCount, limit),
  ].every(Boolean);
  if (!valid) {
    return {state: RESULT_SNAPSHOT_STATE.INVALID};
  }
  return {
    state: RESULT_SNAPSHOT_STATE.AVAILABLE,
    value: {
      slotId: expectedSlotId,
      replicaId: slot.replicaId,
      computedAt,
      candidateCount,
    },
  };
}

function parseResultSnapshotWitness(value, config, limit) {
  const parsedResult = parseResultSnapshotJson(value);
  const slotIds = configuredSlotIds(config);
  let result = {state: parsedResult.state};
  const replicaIds = new Set();
  const slots = [];
  const headerAvailable =
    parsedResult.state === RESULT_SNAPSHOT_STATE.AVAILABLE &&
    resultSnapshotHeaderIsValid(parsedResult.value, slotIds);
  let slotsAvailable = headerAvailable;
  if (headerAvailable) {
    for (let index = 0; index < slotIds.length; index += 1) {
      const slotResult = normalizeResultSnapshotSlot(
        parsedResult.value.slots[index],
        slotIds[index],
        limit,
        replicaIds,
      );
      slotsAvailable =
        slotResult.state === RESULT_SNAPSHOT_STATE.AVAILABLE;
      if (!slotsAvailable) {
        break;
      }
      const slot = slotResult.value;
      replicaIds.add(slot.replicaId);
      slots.push(slot);
    }
  }
  if (headerAvailable && slotsAvailable) {
    result = {
      state: RESULT_SNAPSHOT_STATE.AVAILABLE,
      schemaVersion: RESULT_SNAPSHOT_SCHEMA_VERSION,
      slots,
    };
  } else if (parsedResult.state === RESULT_SNAPSHOT_STATE.AVAILABLE) {
    result = {state: RESULT_SNAPSHOT_STATE.INVALID};
  }
  return result;
}

function resolveCompletePartialSnapshot(slotRows, config, limit, nowMs) {
  const slotIds = configuredSlotIds(config);
  const slotStates = slotIds.map((slotId) => {
    const row = slotRows.find((entry) => Number(entry.slot_id) === slotId);
    const partial = row ? parsePartialRows(row, limit) : {valid: false};
    return {row, partial};
  });
  const failure = [
    [slotRows.length !== slotIds.length,
      PARALLEL_REDUCE_REASON.SLOT_SET_INCOMPLETE],
    ...slotStates.flatMap(({row, partial}) => [
      [!row || !isNonEmptyString(row?.replica_id),
        PARALLEL_REDUCE_REASON.SLOT_SET_INCOMPLETE],
      [Number(row?.lease_expires_at) <= nowMs,
        PARALLEL_REDUCE_REASON.SLOT_LEASE_EXPIRED],
      [Number(row?.computed_at) <= nowMs - config.leaseMs,
        PARALLEL_REDUCE_REASON.PARTIAL_STALE],
      [!partial.valid,
        partial.reason || PARALLEL_REDUCE_REASON.PARTIAL_INVALID],
    ]),
  ].find(([failed]) => failed);
  if (failure) {
    return {complete: false, reason: failure[1]};
  }
  const candidates = slotStates.flatMap(({partial}) => partial.rows);
  try {
    return {
      complete: true,
      candidates,
      merged: mergeDisjointPartialRows(candidates, limit),
      witness: buildResultSnapshotWitness(slotStates),
    };
  } catch (error) {
    if (error?.message !== PARALLEL_REDUCE_REASON.SHARD_OVERLAP) {
      throw error;
    }
    return {
      complete: false,
      candidates,
      reason: PARALLEL_REDUCE_REASON.SHARD_OVERLAP,
    };
  }
}

async function publishPartialSnapshot(
  queryExecutor, config, serviceId, slotId, reduced,
) {
  const partialJson = JSON.stringify(reduced);
  const computedAt = Date.now();
  assertQuerySuccess(await queryExecutor(
    `UPDATE ${config.coordinationTable} SET ` +
    `partial_json = ${sqlLiteral(partialJson)}, computed_at = ${computedAt} ` +
    `WHERE slot_id = ${slotId} AND replica_id = ${sqlLiteral(serviceId)}`,
    [],
  ));
  return computedAt;
}

async function publishResultSnapshot(
  queryExecutor,
  resultTable,
  resultId,
  rows,
  resultSnapshotColumn,
  resultSnapshotWitness,
) {
  const resultJson = JSON.stringify(rows);
  const sourceSnapshotJson = JSON.stringify(resultSnapshotWitness);
  const computedAt = Date.now();
  assertQuerySuccess(await queryExecutor(
    `UPDATE ${resultTable} SET result_json = ${sqlLiteral(resultJson)}, ` +
    `computed_at = ${computedAt}, ${resultSnapshotColumn} = ` +
    `${sqlLiteral(sourceSnapshotJson)} ` +
    `WHERE result_id = ${sqlLiteral(resultId)}`,
    [],
  ));
  return computedAt;
}

async function releaseReduceSlot(slotId, queryExecutor, config, serviceId) {
  if (slotId === UNASSIGNED_SLOT_ID) {
    return;
  }
  assertQuerySuccess(await queryExecutor(
    `UPDATE ${config.coordinationTable} SET lease_expires_at = 0 ` +
    `WHERE slot_id = ${slotId} AND replica_id = ${sqlLiteral(serviceId)}`,
    [],
  ));
}

export {
  PARALLEL_REDUCE_REASON,
  RESULT_SNAPSHOT_STATE,
  UNASSIGNED_SLOT_ID,
  acquireReduceSlot,
  isValidParallelReduceConfig,
  mergeDisjointPartialRows,
  parseResultSnapshotWitness,
  publishPartialSnapshot,
  publishResultSnapshot,
  readSlotRows,
  releaseReduceSlot,
  resolveCompletePartialSnapshot,
};
