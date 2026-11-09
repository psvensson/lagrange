/**
 * The base of a table-policy write (census site 6 of quest
 * replica-admission-from-committed-operation, attempt 2; three-class rule,
 * shared row: the TABLES row is written by table creation, split and policy
 * owners). The base is this node's own last committed policy (the committed
 * policy fence) or, at an unknown position, one committed read through the
 * gateway with typed unavailability - never the projection.
 */

import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {requireConfirmedSingleRowMutation} from
  '../control-plane/control-plane-single-row-confirmation.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {POLICY_ERROR_CODE, POLICY_SUBSYSTEM} from './policy-constants.js';

const MAX_COMMITTED_POLICY_FENCES = 256;
const MAX_SUPERSEDED_POLICY_SNAPSHOTS = 64;
const TABLE_POLICY_BASE_READ_SQL = 'SELECT * FROM tables WHERE table_id = ?';
const TABLE_POLICY_BASE_UNAVAILABLE_MESSAGE =
  'The committed table row could not be read as the policy write base';
const TABLE_POLICY_WRITE_DELIVERY_PRIORITY = 'critical';
const POLICY_MUTATION_CONFIRMATION = Object.freeze({
  ownerName: POLICY_SUBSYSTEM.TABLE_POLICY,
  tableName: TABLES.TABLES,
  changed: Object.freeze({code: POLICY_ERROR_CODE.OBSERVATION_CHANGED,
    message: 'The table policy mutation affected no row'}),
  unconfirmed: Object.freeze({code: POLICY_ERROR_CODE.OUTCOME_UNCONFIRMED,
    message: 'The table policy mutation application is not confirmed'}),
});

function initializeTablePolicyCurrencyState(service) {
  service.policyCurrencyByTable = new Map();
  service.activePolicyReadsByTable = new Map();
}

function beginTablePolicyRead(service, tableId) {
  if (!tableId || !service?.activePolicyReadsByTable) {
    return null;
  }
  const token = {
    tableId,
    invalidatedByCommit: false,
    currencyEvicted: false,
  };
  let activeReads = service.activePolicyReadsByTable.get(tableId);
  if (!activeReads) {
    activeReads = new Set();
    service.activePolicyReadsByTable.set(tableId, activeReads);
  }
  activeReads.add(token);
  return token;
}

function endTablePolicyRead(service, token) {
  if (!token || !service?.activePolicyReadsByTable) {
    return;
  }
  const activeReads = service.activePolicyReadsByTable.get(token.tableId);
  if (!activeReads) {
    return;
  }
  activeReads.delete(token);
  if (activeReads.size === 0) {
    service.activePolicyReadsByTable.delete(token.tableId);
  }
}

function markActiveReadsInvalidatedForTable(service, tableId) {
  const activeReads = service?.activePolicyReadsByTable?.get(tableId);
  if (!activeReads) {
    return;
  }
  for (const token of activeReads) {
    token.invalidatedByCommit = true;
  }
}

function markActiveReadsEvictedForTable(service, tableId) {
  const activeReads = service?.activePolicyReadsByTable?.get(tableId);
  if (!activeReads) {
    return;
  }
  for (const token of activeReads) {
    token.currencyEvicted = true;
  }
}

function clearTablePolicyCurrencyForTable(service, tableId) {
  if (!tableId) {
    return;
  }
  service.committedPolicyFences?.delete(tableId);
  service.supersededSnapshots?.delete(tableId);
  service.policyCurrencyByTable?.delete(tableId);
}

function clearAllTablePolicyCurrency(service) {
  service.committedPolicyFences?.clear();
  service.supersededSnapshots?.clear();
  service.policyCurrencyByTable?.clear();
}

function hasKnownTablePolicyCurrency(service, tableId) {
  return Boolean(
    tableId &&
    (service.committedPolicyFences?.has(tableId) ||
      service.policyCurrencyByTable?.has(tableId)),
  );
}

function upsertTablePolicyCurrencyEntry(service, tableId, entry) {
  if (!tableId || !service?.policyCurrencyByTable) {
    return;
  }
  const maxFences = service.maxCommittedPolicyFences ||
    MAX_COMMITTED_POLICY_FENCES;
  if (service.policyCurrencyByTable.has(tableId)) {
    service.policyCurrencyByTable.delete(tableId);
  }
  while (
    service.policyCurrencyByTable.size >= maxFences &&
    service.policyCurrencyByTable.size > 0
  ) {
    const oldestCurrencyKey =
      service.policyCurrencyByTable.keys().next().value;
    service.policyCurrencyByTable.delete(oldestCurrencyKey);
    markActiveReadsEvictedForTable(service, oldestCurrencyKey);
  }
  service.policyCurrencyByTable.set(tableId, entry);
}

function mergeBoundedSupersededSnapshots(
  existingSnapshots,
  nextSnapshots,
  maxSnapshots,
) {
  const merged = [];
  for (const list of [existingSnapshots, nextSnapshots]) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!item) {
        continue;
      }
      const duplicate = merged.some(
        (entry) =>
          entry.table_policies === (item.table_policies ?? null) &&
          entry.updated_at === (item.updated_at ?? null),
      );
      if (!duplicate) {
        merged.push({
          table_policies: item.table_policies ?? null,
          updated_at: item.updated_at ?? null,
        });
      }
    }
  }
  return merged.slice(-maxSnapshots);
}

function resolveMonotonicUpdatedAt(previousUpdatedAt, nextUpdatedAt) {
  if (Number.isFinite(previousUpdatedAt) && Number.isFinite(nextUpdatedAt)) {
    return Math.max(previousUpdatedAt, nextUpdatedAt);
  }
  if (nextUpdatedAt !== undefined && nextUpdatedAt !== null) {
    return nextUpdatedAt;
  }
  return previousUpdatedAt ?? null;
}

function retireCommittedPolicyFence(service, tableId) {
  if (!tableId) {
    return;
  }
  service.committedPolicyFences?.delete(tableId);
  service.supersededSnapshots?.delete(tableId);
}

function evictOldestMapEntries(map, maxEntries, onEvictKey = null) {
  while (map.size >= maxEntries && map.size > 0) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
    onEvictKey?.(oldestKey);
  }
}

function upsertBoundedMapEntry(map, key, value, maxEntries, onEvictKey = null) {
  if (map.has(key)) {
    map.delete(key);
  }
  evictOldestMapEntries(map, maxEntries, onEvictKey);
  map.set(key, value);
}

function resolveMonotonicPolicyVersion(priorRawVersion, nextRawVersion) {
  const nextVersion = Number(nextRawVersion ?? NaN);
  const priorVersion = Number(priorRawVersion ?? NaN);
  if (Number.isFinite(nextVersion) && Number.isFinite(priorVersion)) {
    return Math.max(priorVersion, nextVersion);
  }
  if (Number.isFinite(nextVersion)) {
    return nextVersion;
  }
  return Number.isFinite(priorVersion) ? priorVersion : undefined;
}

function buildChangedSnapshotIfDifferent(existing, nextPolicies, nextUpdatedAt) {
  if (!existing) {
    return [];
  }
  const existingPolicies = existing.table_policies ?? null;
  const existingUpdatedAt = existing.updated_at ?? null;
  if (existingPolicies === nextPolicies && existingUpdatedAt === nextUpdatedAt) {
    return [];
  }
  return [{
    table_policies: existingPolicies,
    updated_at: existingUpdatedAt,
  }];
}

function buildCurrencyEntryPayload({
  tablePolicies,
  updatedAt,
  resolvedVersion,
  supersededSnapshots,
  minWitnessTerm,
  minWitnessAppliedIndex,
}) {
  const entry = {
    table_policies: tablePolicies,
    updated_at: updatedAt,
    supersededSnapshots,
    minWitnessTerm,
    minWitnessAppliedIndex,
  };
  if (resolvedVersion !== undefined) {
    entry.version = resolvedVersion;
  }
  return entry;
}

function resolveMaxSnapshotsLimit(service) {
  return service.maxSupersededPolicySnapshots || MAX_SUPERSEDED_POLICY_SNAPSHOTS;
}

function resolveMaxFencesLimit(service) {
  return service.maxCommittedPolicyFences || MAX_COMMITTED_POLICY_FENCES;
}

function buildUpdatedCurrencyEntry(
  existing,
  nextPolicies,
  nextUpdatedAt,
  nextVersion,
  extraSnapshots,
  maxSnapshots,
  witnessFloor,
) {
  const priorSnapshot = buildChangedSnapshotIfDifferent(
    existing,
    nextPolicies,
    nextUpdatedAt,
  );
  return buildCurrencyEntryPayload({
    tablePolicies: nextPolicies,
    updatedAt: resolveMonotonicUpdatedAt(existing?.updated_at, nextUpdatedAt),
    resolvedVersion: resolveMonotonicPolicyVersion(
      existing?.version,
      nextVersion,
    ),
    supersededSnapshots: mergeBoundedSupersededSnapshots(
      existing?.supersededSnapshots,
      [...priorSnapshot, ...extraSnapshots],
      maxSnapshots,
    ),
    minWitnessTerm: witnessFloor.minWitnessTerm,
    minWitnessAppliedIndex: witnessFloor.minWitnessAppliedIndex,
  });
}

function recordCommittedPolicyFence(service, tableId, fenceEntry, snapshots = []) {
  if (!tableId) {
    return;
  }
  markActiveReadsInvalidatedForTable(service, tableId);
  const maxSnapshots = resolveMaxSnapshotsLimit(service);
  const maxFences = resolveMaxFencesLimit(service);
  const existingCurrency = service.policyCurrencyByTable?.get(tableId) || null;
  const boundedSnapshots = Array.isArray(snapshots) ?
    snapshots.slice(-maxSnapshots) :
    [];
  upsertBoundedMapEntry(
    service.supersededSnapshots,
    tableId,
    boundedSnapshots,
    maxSnapshots,
  );
  upsertBoundedMapEntry(
    service.committedPolicyFences,
    tableId,
    {...fenceEntry, supersededSnapshots: boundedSnapshots},
    maxFences,
    (oldestKey) => {
      service.supersededSnapshots.delete(oldestKey);
      markActiveReadsEvictedForTable(service, oldestKey);
    },
  );
  upsertTablePolicyCurrencyEntry(
    service,
    tableId,
    buildUpdatedCurrencyEntry(
      existingCurrency,
      fenceEntry.table_policies ?? null,
      fenceEntry.updated_at ?? null,
      fenceEntry.version,
      boundedSnapshots,
      maxSnapshots,
      {
        minWitnessTerm: existingCurrency?.minWitnessTerm ?? null,
        minWitnessAppliedIndex: existingCurrency?.minWitnessAppliedIndex ?? null,
      },
    ),
  );
}

function matchesExactPolicyContent(fence, rowPolicies, rowUpdatedAt) {
  return rowPolicies === (fence.table_policies ?? null) &&
    rowUpdatedAt === (fence.updated_at ?? null);
}

function evaluateVersionSupersedence(fence, row, rowPolicies, rowUpdatedAt) {
  const rowVersion = Number(row.version ?? NaN);
  const fenceVersion = Number(fence.version ?? NaN);
  if (
    row.version === null ||
    row.version === undefined ||
    fence.version === null ||
    fence.version === undefined ||
    !Number.isFinite(rowVersion) ||
    !Number.isFinite(fenceVersion)
  ) {
    return null;
  }
  if (rowVersion < fenceVersion) {
    return true;
  }
  if (
    rowVersion > fenceVersion ||
    matchesExactPolicyContent(fence, rowPolicies, rowUpdatedAt)
  ) {
    return false;
  }
  return null;
}

function matchesSupersededSnapshotHistory(snapshots, rowPolicies, rowUpdatedAt) {
  return Array.isArray(snapshots) &&
    snapshots.some(
      (snapshot) =>
        snapshot.table_policies === rowPolicies &&
        snapshot.updated_at === rowUpdatedAt,
    );
}

function resolveCandidateSnapshots(service, fence, tableId) {
  const fromService = tableId ? service.supersededSnapshots?.get(tableId) : null;
  return fromService || fence.supersededSnapshots;
}

function isOlderFiniteTimestamp(rowUpdatedAt, fenceUpdatedAt) {
  return Number.isFinite(rowUpdatedAt) &&
    Number.isFinite(fenceUpdatedAt) &&
    rowUpdatedAt < fenceUpdatedAt;
}

function isSupersededByCommittedPolicyFence(service, fence, row, tableId = null) {
  if (!row) {
    return true;
  }
  const rowPolicies = row.table_policies ?? null;
  const rowUpdatedAt = row.updated_at ?? null;
  const versionVerdict = evaluateVersionSupersedence(
    fence,
    row,
    rowPolicies,
    rowUpdatedAt,
  );
  if (versionVerdict !== null) {
    return versionVerdict;
  }
  if (
    fence.table_policies !== undefined &&
    matchesExactPolicyContent(fence, rowPolicies, rowUpdatedAt)
  ) {
    return false;
  }
  const snapshots = resolveCandidateSnapshots(service, fence, tableId);
  if (matchesSupersededSnapshotHistory(snapshots, rowPolicies, rowUpdatedAt)) {
    return true;
  }
  return isOlderFiniteTimestamp(rowUpdatedAt, fence.updated_at);
}

function hasSafeWitnessPair(term, appliedIndex) {
  return Number.isSafeInteger(term) && Number.isSafeInteger(appliedIndex);
}

function isWitnessOlderThanCurrency(currency, witness) {
  if (
    !hasSafeWitnessPair(currency?.minWitnessTerm, currency?.minWitnessAppliedIndex) ||
    !hasSafeWitnessPair(witness?.term, witness?.appliedIndex)
  ) {
    return false;
  }
  return witness.term < currency.minWitnessTerm ||
    (witness.term === currency.minWitnessTerm &&
      witness.appliedIndex < currency.minWitnessAppliedIndex);
}

function isRowStrictlyNewerThanCurrency(row, currency) {
  const rowVersion = Number(row?.version ?? NaN);
  const currencyVersion = Number(currency?.version ?? NaN);
  if (Number.isFinite(rowVersion) && Number.isFinite(currencyVersion)) {
    return rowVersion > currencyVersion;
  }
  return Number.isFinite(row?.updated_at) &&
    Number.isFinite(currency?.updated_at) &&
    row.updated_at > currency.updated_at;
}

function isWitnessNewerThanFloor(curTerm, curIndex, witness) {
  if (!hasSafeWitnessPair(curTerm, curIndex)) {
    return true;
  }
  return witness.term > curTerm ||
    (witness.term === curTerm && witness.appliedIndex > curIndex);
}

function resolveMaxWitnessPosition(currency, witness) {
  const curTerm = currency?.minWitnessTerm;
  const curIndex = currency?.minWitnessAppliedIndex;
  if (!hasSafeWitnessPair(witness?.term, witness?.appliedIndex)) {
    return hasSafeWitnessPair(curTerm, curIndex) ?
      {minWitnessTerm: curTerm, minWitnessAppliedIndex: curIndex} :
      {minWitnessTerm: null, minWitnessAppliedIndex: null};
  }
  return isWitnessNewerThanFloor(curTerm, curIndex, witness) ?
    {minWitnessTerm: witness.term, minWitnessAppliedIndex: witness.appliedIndex} :
    {minWitnessTerm: curTerm, minWitnessAppliedIndex: curIndex};
}

function advanceTablePolicyCurrencyFromObservation(
  service,
  tableId,
  row,
  witness = null,
) {
  if (!tableId || !row || !service?.policyCurrencyByTable) {
    return;
  }
  const existing = service.policyCurrencyByTable.get(tableId) || null;
  upsertTablePolicyCurrencyEntry(
    service,
    tableId,
    buildUpdatedCurrencyEntry(
      existing,
      row.table_policies ?? null,
      row.updated_at ?? null,
      row.version,
      [],
      resolveMaxSnapshotsLimit(service),
      resolveMaxWitnessPosition(existing, witness),
    ),
  );
}

function isInvalidatedRowStaleAgainstCurrency(currency, row, readToken) {
  if (readToken?.invalidatedByCommit !== true) {
    return false;
  }
  if (!row) {
    return true;
  }
  return !matchesExactPolicyContent(
    currency,
    row.table_policies ?? null,
    row.updated_at ?? null,
  ) && !isRowStrictlyNewerThanCurrency(row, currency);
}

function isRowStaleAgainstCurrency(service, currency, row, readToken) {
  if (!currency) {
    return false;
  }
  if (row && isSupersededByCommittedPolicyFence(service, currency, row, null)) {
    return true;
  }
  return isInvalidatedRowStaleAgainstCurrency(currency, row, readToken);
}

function isAuthoritativeReadStale(
  service,
  tableId,
  currency,
  fence,
  row,
  witness,
  readToken,
) {
  if (readToken?.currencyEvicted === true) {
    return true;
  }
  if (
    isWitnessOlderThanCurrency(currency, witness) ||
    isRowStaleAgainstCurrency(service, currency, row, readToken)
  ) {
    return true;
  }
  if (fence && service.isSupersededByCommittedPolicyFence(fence, row, tableId)) {
    return true;
  }
  return readToken?.invalidatedByCommit === true &&
    !isRowStrictlyNewerThanCurrency(row, currency);
}

function isStaleAgainstCommittedPolicyFence(
  service,
  tableId,
  row,
  witness = null,
  readToken = null,
) {
  const currency = tableId ? service.policyCurrencyByTable?.get(tableId) : null;
  const fence = service.committedPolicyFences?.get(tableId);
  if (isAuthoritativeReadStale(
    service,
    tableId,
    currency,
    fence,
    row,
    witness,
    readToken,
  )) {
    return true;
  }
  if (fence) {
    retireCommittedPolicyFence(service, tableId);
  }
  return false;
}

function isConfiguredPolicyRowStale(
  service,
  tableId,
  row,
  readToken = null,
) {
  if (readToken?.currencyEvicted === true) {
    return true;
  }
  const fence = service.committedPolicyFences?.get(tableId);
  if (fence && service.isSupersededByCommittedPolicyFence(fence, row, tableId)) {
    return true;
  }
  const currency = tableId ? service.policyCurrencyByTable?.get(tableId) : null;
  return isRowStaleAgainstCurrency(service, currency, row, readToken);
}

function applyCommittedPolicyFence(service, tableId, row) {
  const fence = service.committedPolicyFences?.get(tableId);
  if (!fence || !row) {
    return row;
  }
  const rowVersion = Number(row.version ?? NaN);
  const fenceVersion = Number(fence.version ?? NaN);
  if (
    Number.isFinite(rowVersion) &&
    Number.isFinite(fenceVersion) &&
    fenceVersion <= rowVersion &&
    row.table_policies === undefined
  ) {
    retireCommittedPolicyFence(service, tableId);
    return row;
  }
  if (service.isSupersededByCommittedPolicyFence(fence, row, tableId)) {
    return {
      ...row,
      table_policies: fence.table_policies,
      updated_at: fence.updated_at,
      ...(fence.version !== undefined ? {version: fence.version} : {}),
    };
  }
  retireCommittedPolicyFence(service, tableId);
  return row;
}

function buildPostWriteSupersededSnapshots(
  existingFence,
  existingCurrency,
  priorSupersededSnapshots,
  table,
) {
  const priorSnapshot = {
    table_policies: table?.table_policies ?? null,
    updated_at: table?.updated_at ?? null,
  };
  const currencySnapshots = Array.isArray(existingCurrency?.supersededSnapshots) ?
    existingCurrency.supersededSnapshots :
    [];
  const fenceSnapshot = existingFence ?
    [{
      table_policies: existingFence.table_policies,
      updated_at: existingFence.updated_at,
    }] :
    [];
  return [
    ...currencySnapshots,
    ...priorSupersededSnapshots,
    ...fenceSnapshot,
    priorSnapshot,
  ];
}

function commitPolicyFenceAfterWrite(
  service,
  tableId,
  table,
  serializedPolicy,
  updatedAt,
  updatedStoredPolicy,
  priorSupersededSnapshots,
  priorFenceVersion,
) {
  const existingFence = service.committedPolicyFences.get(tableId);
  const existingCurrency = service.policyCurrencyByTable?.get(tableId) || null;
  const supersededSnapshots = buildPostWriteSupersededSnapshots(
    existingFence,
    existingCurrency,
    priorSupersededSnapshots,
    table,
  );
  const nextVersion = Math.max(
    priorFenceVersion,
    Number(existingCurrency?.version ?? 0),
    Number(table?.version ?? 0),
  ) + 1;
  service.recordCommittedPolicyFence(
    tableId,
    {
      table_policies: serializedPolicy,
      updated_at: updatedAt,
      version: updatedStoredPolicy.version ?? nextVersion,
    },
    supersededSnapshots,
  );
}

function hasCommittedRowCaughtUpToFence(service, tableId, fence, committed) {
  if (!committed) {
    return false;
  }
  return !isSupersededByCommittedPolicyFence(service, fence, committed, tableId);
}

function buildPolicyBaseUnavailableError(read) {
  const refusal = new Error(TABLE_POLICY_BASE_UNAVAILABLE_MESSAGE);
  refusal.code = POLICY_ERROR_CODE.BASE_UNAVAILABLE;
  refusal.retryAfterMs = Number.isFinite(read?.retryAfterMs) ?
    read.retryAfterMs : null;
  return refusal;
}

function mergeFenceOverCommittedBase(tableId, fence, committed) {
  const merged = {
    ...(committed || {}),
    table_id: tableId,
    table_policies: fence.table_policies,
    updated_at: fence.updated_at,
  };
  if (fence.version !== undefined) {
    merged.version = fence.version;
  }
  return merged;
}

/**
 * @param {Object} service - The TablePolicyService.
 * @param {string} tableId - Table ID.
 * @return {Promise<Object|null>} The base row ({table_policies,
 *   updated_at, ...}); rejects typed TABLE_POLICY_BASE_UNAVAILABLE with the
 *   authority's retryAfterMs.
 */
async function readCommittedPolicyBase(service, tableId) {
  const fence = service.committedPolicyFences?.get(tableId) ?? null;
  const read = await service.getControlPlaneSystemTableGateway()
    .readAuthoritativeRows(TABLES.TABLES, TABLE_POLICY_BASE_READ_SQL,
      [tableId], {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      });
  if (read?.success !== true || !Array.isArray(read.rows)) {
    throw buildPolicyBaseUnavailableError(read);
  }
  const committed = read.rows[0] ?? null;
  if (!fence) {
    return committed;
  }
  if (hasCommittedRowCaughtUpToFence(service, tableId, fence, committed)) {
    retireCommittedPolicyFence(service, tableId);
    return committed;
  }
  return mergeFenceOverCommittedBase(tableId, fence, committed);
}

/**
 * Write the policy conditionally on its committed base: a zero-row answer
 * is another writer's change, refused typed
 * (TABLE_POLICY_MUTATION_OBSERVATION_CHANGED); any refusal drops the kept
 * base, so the next update re-reads it from the committed authority.
 * @param {Object} service - The TablePolicyService.
 * @param {string} tableId - Table ID.
 * @param {Object|null} base - The committed base row.
 * @param {string} serializedPolicy - The next stored policy.
 * @param {number} updatedAt - The write's updated_at.
 * @return {Promise<void>}
 */
async function writePolicyConditionally(service, tableId, base,
  serializedPolicy, updatedAt) {
  const mutationResult = await service.getControlPlaneSystemTableGateway()
    .submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.TABLES,
      whereClause: {
        table_id: tableId,
        table_policies: base?.table_policies ?? null,
        updated_at: base?.updated_at ?? null,
      },
      data: {table_policies: serializedPolicy, updated_at: updatedAt},
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: TABLE_POLICY_WRITE_DELIVERY_PRIORITY,
    });
  try {
    requireConfirmedSingleRowMutation(mutationResult,
      POLICY_MUTATION_CONFIRMATION);
  } catch (refusal) {
    retireCommittedPolicyFence(service, tableId);
    throw refusal;
  }
}

export {
  MAX_COMMITTED_POLICY_FENCES,
  MAX_SUPERSEDED_POLICY_SNAPSHOTS,
  advanceTablePolicyCurrencyFromObservation,
  applyCommittedPolicyFence,
  beginTablePolicyRead,
  clearAllTablePolicyCurrency,
  clearTablePolicyCurrencyForTable,
  commitPolicyFenceAfterWrite,
  endTablePolicyRead,
  hasKnownTablePolicyCurrency,
  initializeTablePolicyCurrencyState,
  isConfiguredPolicyRowStale,
  isStaleAgainstCommittedPolicyFence,
  isSupersededByCommittedPolicyFence,
  readCommittedPolicyBase,
  recordCommittedPolicyFence,
  retireCommittedPolicyFence,
  writePolicyConditionally,
};
