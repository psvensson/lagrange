/**
 * Disagreement evidence extraction, revision comparison, and discriminating
 * investigation-target classification for the
 * `fresh-formation-user-table-routability` formation oracle.
 */

import {
  isPrioritySpreadHolderServiceRow,
} from '../../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  isTerminalReplicaOperationRecord,
} from '../../../src/rebalancer/replica-operation-progress.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const PARTITION_INDEX_PATTERN = /^[1-9]\d*$/u;

const ZERO = 0;
const ONE = 1;
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TABLE_PARTITIONS = 'partitions';
const TABLE_SERVICES = 'services';
const TABLE_REPLICA_OPERATIONS = 'replica_operations';

const INVESTIGATION_TARGET = Object.freeze({
  ORACLE_PROVENANCE: 'Oracle provenance',
  PUBLICATION_DELIVERY_OR_CACHE_APPLICATION:
    'Publication, delivery or cache application',
  PROJECTION_INVALIDATION_OR_REUSE: 'Projection invalidation or reuse',
  OBSERVER_PURITY: 'Observer purity',
});

function isRecord(value) {
  return value !== null && typeof value === TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function rowsOfRead(read) {
  return isRecord(read) && Array.isArray(read.rows) && !read.error ?
    read.rows :
    null;
}

function snapshotDiagnostics(snapshot) {
  const diagnostics = snapshot?.payload?.controlPlaneDiagnostics;
  return isRecord(diagnostics) ? diagnostics : null;
}

function readyPriorityPartitionServiceNodeIds(serviceRows, partitionId) {
  return uniqueSorted(arrayMap(arrayFilter(serviceRows, (row) =>
    row?.partition_id === partitionId &&
    isPrioritySpreadHolderServiceRow(row) &&
    typeof row?.node_id === TYPEOF_STRING), (row) => row.node_id));
}

function resolveAuthorityWitnesses(tableObservation) {
  if (Array.isArray(tableObservation?.readAuthorityWitnesses)) {
    return tableObservation.readAuthorityWitnesses;
  }
  if (isRecord(tableObservation?.readAuthorityWitness)) {
    return [tableObservation.readAuthorityWitness];
  }
  return [];
}

function updateMaxSafeInteger(current, candidate) {
  if (!Number.isSafeInteger(candidate)) return current;
  return current === null ? candidate : Math.max(current, candidate);
}

function updateMaxPositiveFinite(current, candidate) {
  const num = Number(candidate);
  if (!Number.isFinite(num) || num <= ZERO) return current;
  return current === null ? num : Math.max(current, num);
}

function summarizeAuthorityWitnesses(witnesses) {
  let maxAppliedIndex = null;
  let maxCommitIndex = null;
  let maxTerm = null;
  let maxObservedAtMs = null;
  for (const witness of witnesses) {
    maxAppliedIndex = updateMaxSafeInteger(maxAppliedIndex,
      witness?.appliedIndex);
    maxCommitIndex = updateMaxSafeInteger(maxCommitIndex, witness?.commitIndex);
    maxTerm = updateMaxSafeInteger(maxTerm, witness?.term);
    maxObservedAtMs = updateMaxPositiveFinite(maxObservedAtMs,
      witness?.observedAtMs);
  }
  return {maxAppliedIndex, maxCommitIndex, maxObservedAtMs, maxTerm};
}

function updateMaxHlcString(current, candidate) {
  if (typeof candidate !== TYPEOF_STRING || candidate.length === ZERO) {
    return current;
  }
  return current === null || candidate > current ? candidate : current;
}

function collectRowTimestampCandidates(row) {
  if (!isRecord(row)) return [];
  return [row.updated_at, row.created_at, row.completed_at, row.started_at,
    row.state_entered_at];
}

function collectRowHlcCandidates(row) {
  if (!isRecord(row)) return [];
  return [row.origin_hlc, row.originHlc, row.updated_at_hlc, row.updatedAtHlc];
}

function summarizeAuthorityRows(rowList) {
  let maxRowTimestampMs = null;
  let maxOriginHlc = null;
  for (const row of rowList) {
    for (const ts of collectRowTimestampCandidates(row)) {
      maxRowTimestampMs = updateMaxPositiveFinite(maxRowTimestampMs, ts);
    }
    for (const hlc of collectRowHlcCandidates(row)) {
      maxOriginHlc = updateMaxHlcString(maxOriginHlc, hlc);
    }
  }
  return {maxOriginHlc, maxRowTimestampMs};
}

function isNonEmptyString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO;
}

function resolveRowKey(row) {
  if (!isRecord(row)) return null;
  const candidates = [
    row.service_id,
    row.operation_id,
    row.partition_id,
    row.node_id,
    row.table_id,
    row.id,
  ];
  return arrayFind(candidates, isNonEmptyString) || null;
}

function summarizeRowVersion(rowList) {
  const rows = Array.isArray(rowList) ? arrayFilter(rowList, isRecord) : [];
  const summary = summarizeAuthorityRows(rows);
  const byRowId = {};
  for (const row of rows) {
    const key = resolveRowKey(row);
    if (key === null) continue;
    byRowId[key] = summarizeAuthorityRows([row]);
  }
  return {
    byRowId,
    maxOriginHlc: summary.maxOriginHlc,
    maxRowTimestampMs: summary.maxRowTimestampMs,
    rowCount: rows.length,
  };
}

function hasValidConsensusReceiptIndices(record) {
  return Number.isSafeInteger(record.term) && record.term >= ONE &&
    Number.isSafeInteger(record.appliedIndex) && record.appliedIndex >= ZERO &&
    Number.isSafeInteger(record.commitIndex) && record.commitIndex >= ZERO;
}

function isMatchingTablePartitionId(partitionId, expectedTableName) {
  if (!isNonEmptyString(partitionId)) return false;
  if (!isNonEmptyString(expectedTableName)) return true;
  const prefix = `${expectedTableName}-p`;
  return stringStartsWith(partitionId, prefix) &&
    regExpTest(PARTITION_INDEX_PATTERN, stringSlice(partitionId, prefix.length));
}

function hasValidLeaderWitnessIdentity(witness, expectedTableName) {
  return isNonEmptyString(witness.servingNodeId) &&
    isNonEmptyString(witness.servingReplicaId) &&
    isMatchingTablePartitionId(witness.partitionId, expectedTableName);
}

function isValidAuthorityWitness(witness, expectedTableName) {
  if (!isRecord(witness)) return false;
  if (witness.state !== 'observed' || witness.role !== 'leader') return false;
  if (!Number.isFinite(witness.observedAtMs) || witness.observedAtMs <= ZERO) {
    return false;
  }
  return hasValidLeaderWitnessIdentity(witness, expectedTableName) &&
    hasValidConsensusReceiptIndices(witness);
}

function doesReceiptMatchWitnesses(observation, witnesses) {
  if (!Array.isArray(witnesses) || witnesses.length === ZERO) return false;
  const matchingPrimary = arrayFind(witnesses, (witness) =>
    witness?.servingNodeId === observation.servingNodeId &&
    witness?.partitionId === observation.partitionId);
  if (!matchingPrimary) return false;
  const summary = summarizeAuthorityWitnesses(witnesses);
  return observation.term === summary.maxTerm &&
    observation.appliedIndex === summary.maxAppliedIndex &&
    observation.commitIndex === summary.maxCommitIndex;
}

function isValidAuthoritativeObservationReceipt(
  observation,
  expectedTableName,
  witnesses,
) {
  if (!isRecord(observation)) return false;
  if (observation.scope !== 'complete_table' ||
      observation.rowSetComplete !== true) {
    return false;
  }
  if (isNonEmptyString(expectedTableName) &&
      observation.tableName !== expectedTableName) {
    return false;
  }
  return isNonEmptyString(observation.servingNodeId) &&
    isMatchingTablePartitionId(observation.partitionId, expectedTableName) &&
    hasValidConsensusReceiptIndices(observation) &&
    doesReceiptMatchWitnesses(observation, witnesses);
}

function isTableObservationRowSetComplete(tableObservation) {
  return tableObservation?.complete === true &&
    tableObservation?.rowSetComplete === true;
}

function areAllWitnessesValidForTable(witnesses, expectedTableName) {
  return witnesses.length > ZERO && arrayEvery(witnesses, (witness) =>
    isValidAuthorityWitness(witness, expectedTableName));
}

function extractAuthorityProvenance(
  tableObservation,
  expectedTableName = null,
) {
  const complete = isTableObservationRowSetComplete(tableObservation);
  const witnesses = resolveAuthorityWitnesses(tableObservation);
  const authoritativeObservation = isRecord(
    tableObservation?.authoritativeObservation,
  ) ? tableObservation.authoritativeObservation : null;
  const validReceipt = complete &&
    areAllWitnessesValidForTable(witnesses, expectedTableName) &&
    isValidAuthoritativeObservationReceipt(
      authoritativeObservation, expectedTableName, witnesses);
  return {authoritativeObservation, complete, validReceipt, witnesses};
}

function extractDeliveryApplicationWatermark(snapshot, observerRevision) {
  const diagnostics = snapshotDiagnostics(snapshot);
  return {
    capturedAtMs: observerRevision?.capturedAtMs ?? null,
    cdcReplay: isRecord(diagnostics?.cdcReplay) ? diagnostics.cdcReplay : null,
    watermark: observerRevision?.watermark ?? null,
  };
}

function formatTableRowId(prefix, id) {
  return prefix.length > ZERO ? `${prefix}:${id}` : id;
}

function appendNonEmptyStringIds(target, candidates, prefix = '') {
  if (!Array.isArray(candidates)) return;
  for (const id of arrayFilter(candidates, isNonEmptyString)) {
    target.push(formatTableRowId(prefix, id));
  }
}

function extractRepairChangedRowIds(snapshot, tableNames) {
  const repair = snapshot?.payload?.authoritativeRepair;
  if (!isRecord(repair)) return [];
  const ids = [];
  appendNonEmptyStringIds(ids, repair.changedRowIds);
  const byTable = isRecord(repair.changedRowIdsByTable) ?
    repair.changedRowIdsByTable :
    {};
  for (const tableName of tableNames) {
    appendNonEmptyStringIds(ids, byTable[tableName], tableName);
  }
  return uniqueSorted(ids);
}

function didSnapshotAcquisitionChangeState(snapshot, repairChangedRowIds) {
  if (repairChangedRowIds.length > ZERO) return true;
  const repair = snapshot?.payload?.authoritativeRepair;
  if (!isRecord(repair)) return false;
  return repair.repaired === true ||
    (Array.isArray(repair.repairedTables) &&
      repair.repairedTables.length > ZERO);
}

function extractPlacementObservationPartitionRows(snapshot, partitionId) {
  const byPartition = snapshotDiagnostics(snapshot)
    ?.currentPriorityPlacementObservation?.rowsByPartitionId;
  const entry = isRecord(byPartition) ? byPartition[partitionId] : null;
  if (!isRecord(entry)) return null;
  const partitionRow = isRecord(entry.partitionRow) ?
    entry.partitionRow :
    null;
  const serviceRows = Array.isArray(entry.serviceRows) ?
    arrayFilter(entry.serviceRows, isRecord) :
    [];
  return {available: true, partitionRow, serviceRows};
}

function resolvePayloadRowArray(tableSection) {
  if (Array.isArray(tableSection?.rows)) return tableSection.rows;
  return Array.isArray(tableSection) ? tableSection : null;
}

function filterRowsByPartitionId(rows, partitionId) {
  if (!Array.isArray(rows)) return [];
  return arrayFilter(rows, (row) => row?.partition_id === partitionId);
}

function extractPayloadPartitionSpreadRows(snapshot, partitionId) {
  const payloadPartitions = resolvePayloadRowArray(
    snapshot?.payload?.partitions,
  );
  const payloadServices = resolvePayloadRowArray(snapshot?.payload?.services);
  if (payloadPartitions === null && payloadServices === null) return null;
  const matchingPartitions = filterRowsByPartitionId(
    payloadPartitions,
    partitionId,
  );
  return {
    available: true,
    partitionRow: matchingPartitions[ZERO] || null,
    serviceRows: filterRowsByPartitionId(payloadServices, partitionId),
  };
}

function extractObserverCachedPartitionSpreadRows(snapshot, partitionId) {
  return extractPlacementObservationPartitionRows(snapshot, partitionId) ||
    extractPayloadPartitionSpreadRows(snapshot, partitionId) ||
    {available: false, partitionRow: null, serviceRows: []};
}

function derivePartitionSpreadFromRows(partitionId, partitionRow, serviceRows) {
  const required = Number(partitionRow?.replica_count);
  const nodeIds = readyPriorityPartitionServiceNodeIds(
    serviceRows,
    partitionId,
  );
  const validRequired = Number.isSafeInteger(required) && required >= ONE;
  return {
    partitionId,
    readyDistinctNodeCount: nodeIds.length,
    readyNodeIds: nodeIds,
    requiredDistinctNodeCount: validRequired ? required : null,
    satisfied: validRequired && nodeIds.length >= required,
  };
}

function isSafeIntegerLagging(observerVal, authorityVal) {
  return Number.isSafeInteger(observerVal) &&
    Number.isSafeInteger(authorityVal) &&
    observerVal < authorityVal;
}

function isFiniteTimestampLagging(observerVal, authorityVal) {
  return Number.isFinite(observerVal) &&
    Number.isFinite(authorityVal) &&
    observerVal < authorityVal;
}

function isHlcStringLagging(observerHlc, authorityHlc) {
  return isNonEmptyString(observerHlc) &&
    isNonEmptyString(authorityHlc) &&
    observerHlc < authorityHlc;
}

function evaluateRevisionSkew(authorityRevision, observerRevision) {
  const auth = isRecord(authorityRevision) ? authorityRevision : {};
  const obs = isRecord(observerRevision) ? observerRevision : {};
  const wm = isRecord(obs.watermark) ? obs.watermark : {};
  return isSafeIntegerLagging(
    wm.lastAuthoritativeAppliedIndex,
    auth.maxAppliedIndex,
  ) ||
  isSafeIntegerLagging(wm.lastSourceLogIndex, auth.maxAppliedIndex) ||
  isFiniteTimestampLagging(obs.capturedAtMs, auth.maxRowTimestampMs) ||
  isHlcStringLagging(wm.lastOriginHlc, auth.maxOriginHlc);
}

function isSingleVersionSummaryNewer(authVer, obsVer) {
  return isFiniteTimestampLagging(
    obsVer?.maxRowTimestampMs,
    authVer?.maxRowTimestampMs,
  ) ||
  isHlcStringLagging(obsVer?.maxOriginHlc, authVer?.maxOriginHlc);
}

function hasNewerPerRowVersion(authById, obsById) {
  for (const [rowId, authVer] of Object.entries(authById)) {
    const obsVer = obsById[rowId];
    if (!isRecord(obsVer) || isSingleVersionSummaryNewer(authVer, obsVer)) {
      return true;
    }
  }
  return false;
}

function isRowVersionNewer(authorityRowVersion, observerCacheRowVersion) {
  if (!observerCacheRowVersion?.available) return false;
  if (
    isSingleVersionSummaryNewer(authorityRowVersion, observerCacheRowVersion)
  ) {
    return true;
  }
  const authById = isRecord(authorityRowVersion?.byRowId) ?
    authorityRowVersion.byRowId :
    {};
  const obsById = isRecord(observerCacheRowVersion?.byRowId) ?
    observerCacheRowVersion.byRowId :
    {};
  return hasNewerPerRowVersion(authById, obsById);
}

function areStringArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = ZERO; i < left.length; i += ONE) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function sameSpreadCounts(authorityDecision, cacheDecision) {
  return authorityDecision.satisfied === cacheDecision.satisfied &&
    authorityDecision.readyDistinctNodeCount ===
      cacheDecision.readyDistinctNodeCount &&
    authorityDecision.requiredDistinctNodeCount ===
      cacheDecision.requiredDistinctNodeCount;
}

function getServiceRowListLength(rowGroup) {
  return Array.isArray(rowGroup?.serviceRows) ?
    rowGroup.serviceRows.length :
    ZERO;
}

function sameSpreadDecisionAndRelevantFields(
  authorityDecision,
  cacheDecision,
  authorityRows,
  observerCacheRows,
) {
  if (!isRecord(cacheDecision) || !observerCacheRows?.available) return false;
  if (!sameSpreadCounts(authorityDecision, cacheDecision)) return false;
  if (!areStringArraysEqual(
    authorityDecision.readyNodeIds || [],
    cacheDecision.readyNodeIds || [],
  )) {
    return false;
  }
  return getServiceRowListLength(authorityRows) ===
    getServiceRowListLength(observerCacheRows);
}

function classifySpreadInvestigationTarget(evidence) {
  if (!evidence.authorityProvenance.validReceipt) {
    return INVESTIGATION_TARGET.ORACLE_PROVENANCE;
  }
  if (evidence.snapshotChangedState) {
    return INVESTIGATION_TARGET.OBSERVER_PURITY;
  }
  if (evidence.observerCacheRows.available) {
    if (
      isRowVersionNewer(
        evidence.authorityRowVersion,
        evidence.observerCacheRowVersion,
      ) ||
      !sameSpreadDecisionAndRelevantFields(
        evidence.derivedDecision.authority,
        evidence.derivedDecision.observerCache,
        evidence.authorityRows,
        evidence.observerCacheRows,
      )
    ) {
      return INVESTIGATION_TARGET.PUBLICATION_DELIVERY_OR_CACHE_APPLICATION;
    }
    return INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE;
  }
  return evidence.revisionSkew ?
    INVESTIGATION_TARGET.PUBLICATION_DELIVERY_OR_CACHE_APPLICATION :
    INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE;
}

function selectPartitionRowAndServices(
  partitionRows,
  serviceRows,
  partitionId,
) {
  const partitionRow = filterRowsByPartitionId(
    partitionRows,
    partitionId,
  )[ZERO] || null;
  const matchingServices = filterRowsByPartitionId(serviceRows, partitionId);
  const rows = {partitionRow, serviceRows: matchingServices};
  const primaryRow = matchingServices[matchingServices.length - ONE] ||
    partitionRow || null;
  const combined = partitionRow ?
    [partitionRow, ...matchingServices] :
    matchingServices;
  return {
    primaryRow,
    rowVersion: summarizeRowVersion(combined),
    rows,
  };
}

function summarizeObserverCacheSpreadRows(observerCacheRows, partitionId) {
  if (!observerCacheRows.available) {
    return {
      decision: null,
      primaryRow: null,
      rowVersion: {...summarizeRowVersion([]), available: false},
    };
  }
  const {partitionRow, serviceRows} = observerCacheRows;
  const combined = partitionRow ? [partitionRow, ...serviceRows] : serviceRows;
  return {
    decision: derivePartitionSpreadFromRows(
      partitionId,
      partitionRow,
      serviceRows,
    ),
    primaryRow: serviceRows[serviceRows.length - ONE] || partitionRow || null,
    rowVersion: {...summarizeRowVersion(combined), available: true},
  };
}

function buildSpreadDisagreementEvidence(context, entry, projection) {
  const {
    authorityPartitionsRows,
    authorityProvenance,
    authorityServicesRows,
    observerRevision,
    revisionSkew,
    snapshot,
  } = context;
  const partitionId = entry.partitionId;
  const auth = selectPartitionRowAndServices(
    authorityPartitionsRows,
    authorityServicesRows,
    partitionId,
  );
  const observerCacheRows = extractObserverCachedPartitionSpreadRows(
    snapshot,
    partitionId,
  );
  const cacheSummary = summarizeObserverCacheSpreadRows(
    observerCacheRows,
    partitionId,
  );
  const derivedDecision = {
    authority: entry,
    observerCache: cacheSummary.decision,
    observerProjection: projection,
  };
  const deliveryApplicationWatermark = extractDeliveryApplicationWatermark(
    snapshot,
    observerRevision,
  );
  const repairChangedRowIds = extractRepairChangedRowIds(
    snapshot,
    [TABLE_PARTITIONS, TABLE_SERVICES],
  );
  const snapshotChangedState = didSnapshotAcquisitionChangeState(
    snapshot,
    repairChangedRowIds,
  );
  const investigationTarget = classifySpreadInvestigationTarget({
    authorityProvenance,
    authorityRowVersion: auth.rowVersion,
    authorityRows: auth.rows,
    derivedDecision,
    observerCacheRowVersion: cacheSummary.rowVersion,
    observerCacheRows,
    revisionSkew,
    snapshotChangedState,
  });
  return {
    authorityProvenance,
    authorityRow: auth.primaryRow,
    authorityRowVersion: auth.rowVersion,
    authorityRows: auth.rows,
    deliveryApplicationWatermark,
    derivedDecision,
    investigationTarget,
    observerCacheRow: cacheSummary.primaryRow,
    observerCacheRowVersion: cacheSummary.rowVersion,
    observerCacheRows,
    repairChangedRowIds,
  };
}

function extractAuthorityTableRevision(tableObservation, rows) {
  const witnesses = resolveAuthorityWitnesses(tableObservation);
  const rowList = Array.isArray(rows) ? rows :
    (rowsOfRead(tableObservation) || []);
  return {
    ...summarizeAuthorityWitnesses(witnesses),
    ...summarizeAuthorityRows(rowList),
    witnesses,
  };
}

function extractObserverTableRevision(snapshot, tableName) {
  const rawCapturedAt = Number(snapshot?.payload?.capturedAt ??
    snapshot?.payload?.controlPlaneDiagnostics?.capturedAt);
  const capturedAtMs = Number.isFinite(rawCapturedAt) && rawCapturedAt > ZERO ?
    rawCapturedAt :
    null;
  const watermarks = snapshotDiagnostics(snapshot)?.tableRevisionWatermarks;
  const watermark = isRecord(watermarks) && isRecord(watermarks[tableName]) ?
    watermarks[tableName] :
    null;
  return {capturedAtMs, watermark};
}

function extractObserverCachedLedgerRows(snapshot) {
  const rawRows = snapshot?.payload?.replicaOperations?.rows;
  if (!Array.isArray(rawRows)) {
    return {available: false, inFlightRows: [], rows: []};
  }
  const rows = arrayFilter(rawRows, isRecord);
  const inFlightRows = arrayFilter(
    rows,
    (row) => !isTerminalReplicaOperationRecord(row),
  );
  return {available: true, inFlightRows, rows};
}

function classifyLedgerInvestigationTarget(evidence) {
  if (!evidence.authorityProvenance.validReceipt) {
    return INVESTIGATION_TARGET.ORACLE_PROVENANCE;
  }
  if (evidence.snapshotChangedState) {
    return INVESTIGATION_TARGET.OBSERVER_PURITY;
  }
  if (evidence.observerCacheRows.available) {
    const sameInFlight =
      (evidence.derivedDecision.authority.inFlightCount === ZERO) ===
      (evidence.derivedDecision.observerCache?.inFlightCount === ZERO);
    if (
      isRowVersionNewer(
        evidence.authorityRowVersion,
        evidence.observerCacheRowVersion,
      ) ||
      !sameInFlight
    ) {
      return INVESTIGATION_TARGET.PUBLICATION_DELIVERY_OR_CACHE_APPLICATION;
    }
    return INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE;
  }
  return evidence.revisionSkew ?
    INVESTIGATION_TARGET.PUBLICATION_DELIVERY_OR_CACHE_APPLICATION :
    INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE;
}

function selectPrimaryLedgerRow(inFlightRows, allRows) {
  return inFlightRows[ZERO] || allRows[allRows.length - ONE] || null;
}

function summarizeObserverCacheLedgerRows(observerCacheRows) {
  if (!observerCacheRows.available) {
    return {
      decision: null,
      primaryRow: null,
      rowVersion: {...summarizeRowVersion([]), available: false},
    };
  }
  return {
    decision: {inFlightCount: observerCacheRows.inFlightRows.length},
    primaryRow: selectPrimaryLedgerRow(
      observerCacheRows.inFlightRows,
      observerCacheRows.rows,
    ),
    rowVersion: {
      ...summarizeRowVersion(observerCacheRows.rows),
      available: true,
    },
  };
}

function buildLedgerDisagreementEvidence(context) {
  const {
    authorityCount,
    authorityInFlightRows,
    authorityProvenance,
    authorityRowsList,
    observerRevision,
    projectedCount,
    revisionSkew,
    snapshot,
  } = context;
  const authorityRows = {
    inFlightRows: authorityInFlightRows,
    rows: authorityRowsList,
  };
  const authorityRow = selectPrimaryLedgerRow(
    authorityInFlightRows,
    authorityRowsList,
  );
  const authorityRowVersion = summarizeRowVersion(authorityRowsList);
  const observerCacheRows = extractObserverCachedLedgerRows(snapshot);
  const cacheSummary = summarizeObserverCacheLedgerRows(observerCacheRows);
  const derivedDecision = {
    authority: {inFlightCount: authorityCount},
    observerCache: cacheSummary.decision,
    observerProjection: {inFlightCount: projectedCount},
  };
  const deliveryApplicationWatermark = extractDeliveryApplicationWatermark(
    snapshot,
    observerRevision,
  );
  const repairChangedRowIds = extractRepairChangedRowIds(
    snapshot,
    [TABLE_REPLICA_OPERATIONS],
  );
  const snapshotChangedState = didSnapshotAcquisitionChangeState(
    snapshot,
    repairChangedRowIds,
  );
  const investigationTarget = classifyLedgerInvestigationTarget({
    authorityProvenance,
    authorityRowVersion,
    derivedDecision,
    observerCacheRowVersion: cacheSummary.rowVersion,
    observerCacheRows,
    revisionSkew,
    snapshotChangedState,
  });
  return {
    authorityProvenance,
    authorityRow,
    authorityRowVersion,
    authorityRows,
    deliveryApplicationWatermark,
    derivedDecision,
    investigationTarget,
    observerCacheRow: cacheSummary.primaryRow,
    observerCacheRowVersion: cacheSummary.rowVersion,
    observerCacheRows,
    repairChangedRowIds,
  };
}

function extractDisagreementEvidenceSnapshot(entry) {
  return {
    authorityProvenance: entry.authorityProvenance,
    authorityRow: entry.authorityRow,
    authorityRowVersion: entry.authorityRowVersion,
    authorityRows: entry.authorityRows,
    deliveryApplicationWatermark: entry.deliveryApplicationWatermark,
    derivedDecision: entry.derivedDecision,
    investigationTarget: entry.investigationTarget,
    observerCacheRow: entry.observerCacheRow,
    observerCacheRowVersion: entry.observerCacheRowVersion,
    observerCacheRows: entry.observerCacheRows,
    repairChangedRowIds: entry.repairChangedRowIds,
  };
}

function buildPersistentDisagreementEntry(episode, entry, prior, spanMs) {
  return {
    ...extractDisagreementEvidenceSnapshot(entry),
    authorityWatermark: episode.authorityWatermark,
    firstAuthorityRevision: episode.firstAuthorityRevision,
    firstObserverCapturedAtMs: episode.firstObserverCapturedAtMs,
    firstObserverRevision: episode.firstObserverRevision,
    firstProjectionRevision: episode.firstProjectionRevision,
    firstSeenAtMs: episode.firstSeenAtMs,
    key: entry.key,
    lastEntry: entry,
    latestAuthorityRevision: episode.latestAuthorityRevision,
    latestObserverCapturedAtMs: episode.latestObserverCapturedAtMs,
    latestObserverRevision: episode.latestObserverRevision,
    latestProjectionRevision: episode.latestProjectionRevision,
    longestSpanMs: Math.max(prior?.longestSpanMs ?? ZERO, spanMs),
    observerSpanMs: episode.observerSpanMs,
    projectionRevision: episode.projectionRevision,
    revisionSkewObserved: episode.revisionSkewObserved,
  };
}

export {
  INVESTIGATION_TARGET,
  buildLedgerDisagreementEvidence,
  buildPersistentDisagreementEntry,
  buildSpreadDisagreementEvidence,
  evaluateRevisionSkew,
  extractAuthorityProvenance,
  extractAuthorityTableRevision,
  extractObserverTableRevision,
  readyPriorityPartitionServiceNodeIds,
};
