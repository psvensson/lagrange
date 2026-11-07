/**
 * Pure predicate evaluation for the `fresh-formation-user-table-routability`
 * scenario (quest `comparative-benchmark-evidence-repair`, analysis
 * `evidence/product-blocker-first-divergence-2026-11-01.md` sections 2 and 5).
 *
 * The claim, evaluated in order; the first unmet predicate names the run:
 *   a. serve lane open: every observer's `controlPlaneDiagnostics
 *      .readinessByNodeId[*]` entry for every cluster node has
 *      `dimensions.serveEligible === true` (the dimension the trust state
 *      reads, src/control-plane/node-trust-state.js buildNodeTrustState) and
 *      carries none of SERVE_BLOCKING_REASON_CODES;
 *   b. priority spread: each of the six priority control-plane partitions
 *      (PRIORITY_CONTROL_PLANE_TABLE_IDS, src/bootstrap/
 *      system-partition-classification.js) has active partition services on
 *      `replica_count` distinct nodes in the AUTHORITATIVE `services` /
 *      `partitions` rows, AND every observer's projection
 *      (`publicationConvergence.priorityPartitionSummary`) agrees;
 *   c. ledger quiet: no non-terminal `replica_operations` row
 *      (isTerminalReplicaOperationRecord, src/rebalancer/
 *      replica-operation-progress.js) and every observer's projected
 *      `replicaOperations.inFlightCount` is 0;
 *   d. user table routable after a-c;
 *   e. one INSERT + readback with rowCount 1 from every node;
 *   f. no `learner_address_unresolvable` refusal for a learner whose services
 *      row was durably committed before the refusal;
 *   g. the class (owner rule 2026-11-01): no serve-gating projection disagrees
 *      with its authoritative committed state for longer than the owner-stated
 *      cache-visibility bound (PROJECTION_PERSISTENCE_BOUND_MS below);
 *   integrity: every read the evaluation needed succeeded. A failed or absent
 *      read is a named unmet reason, never a default (no count defaults to 0,
 *      an absent projection summary is never "satisfied").
 *
 * Reused owners (no parallel logic): PRIORITY_CONTROL_PLANE_TABLE_IDS,
 * isTerminalReplicaOperationRecord from src; the projection
 * summary normaliser normalizePriorityPartitionSummaryForDiagnostics from
 * priority-recovery-summary-normalization.js. The sealed formation quests'
 * own scenarios (formation-joining-ready-phase-fence,
 * cold-node-authority-reacquisition-pressure) were culled from the tree, so
 * no predicate helper of theirs exists to reuse.
 */

import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../../src/bootstrap/system-partition-classification.js';
import {
  isPrioritySpreadHolderServiceRow,
} from '../../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  isTerminalReplicaOperationRecord,
} from '../../../src/rebalancer/replica-operation-progress.js';
import {
  normalizePriorityPartitionSummaryForDiagnostics,
} from './priority-recovery-summary-normalization.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);

const ZERO = 0;
// Predicate (g)'s preregistered bound, 1000 ms: the value of the deleted
// CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS this predicate was sealed against
// (R09 supersession by reference only, lead approval 2026-11-02, quest
// replica-admission-from-committed-operation attempt 2). The bound is not
// changed; only its source moves here because the write-path cache wait
// it was read from is deleted.
const PROJECTION_PERSISTENCE_BOUND_MS = 1000;
const ONE = 1;
const TWO = 2;
const CONTRACT_STATE_PENDING = 'pending';
const SERVE_LANE_PREFIX = 'serve_lane_';
const JSON_OPEN_BRACE = '{';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TABLE_SERVICES = 'services';
const TABLE_REPLICA_OPERATIONS = 'replica_operations';

const PREDICATE = Object.freeze({
  SERVE_LANE: 'a-serve-lane-open',
  PRIORITY_SPREAD: 'b-priority-spread',
  LEDGER_QUIET: 'c-replica-operations-quiet',
  USER_TABLE_ROUTABLE: 'd-user-table-routable',
  WRITE_READBACK: 'e-write-readback-every-node',
  LEARNER_ADDRESS: 'f-no-learner-address-unresolvable-for-committed-row',
  PROJECTION_AGREEMENT: 'g-projection-agrees-with-authority',
  INTEGRITY: 'observation-integrity',
});
const PREDICATE_ORDER = Object.freeze([
  PREDICATE.SERVE_LANE, PREDICATE.PRIORITY_SPREAD, PREDICATE.LEDGER_QUIET,
  PREDICATE.USER_TABLE_ROUTABLE, PREDICATE.WRITE_READBACK,
  PREDICATE.LEARNER_ADDRESS, PREDICATE.PROJECTION_AGREEMENT,
  PREDICATE.INTEGRITY,
]);

// The serve-lane denials the claim names (analysis section 5.3).
const SERVE_BLOCKING_REASON_CODES = Object.freeze([
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
  'priority_partitions_not_spread',
  'publication_stream_not_ready',
  'priority_recovery_active',
  'planning_snapshot_refresh_pending',
  'config_safe_mode',
]);

// Named log observations recorded during formation (owner rule
// 2026-11-01): count and first timestamp per node; `needle` is matched
// against the raw line, the JSON `time` field gives the timestamp.
const LOG_OBSERVATION = Object.freeze({
  LEARNER_ADDRESS_UNRESOLVABLE: Object.freeze({
    key: 'learner_address_unresolvable',
    needle: '"cause":"learner_address_unresolvable"'}),
  // Kept after attempt 2 deleted the wait: expected count zero.
  CACHE_WAIT_TIMEOUT: Object.freeze({
    key: 'CACHE_WAIT_TIMEOUT_MS',
    needle: '"wait":"CACHE_WAIT_TIMEOUT_MS"'}),
  // A routed write that cannot reach its commit is answered typed by the
  // existing partition delivery deadline; attempt 2 introduced no new wait
  // name for commit unavailability.
  PARTITION_EXECUTION_DEADLINE: Object.freeze({
    key: 'partition_execution_deadline',
    needle: '"wait":"partition_execution_deadline"'}),
  CDC_ACCEPTANCE_UNKNOWN: Object.freeze({
    key: 'cdc_committed_acceptance_unknown',
    needle: 'cdc_committed_acceptance_unknown'}),
  CDC_UPDATE_ROW_MISSING: Object.freeze({
    key: 'cdc_update_row_missing',
    needle: 'No row found for CDC update'}),
  CUTOVER_PAUSED: Object.freeze({
    key: 'partition_write_cutover_paused',
    needle: 'partition_write_cutover_paused'}),
  PRIORITY_RECOVERY_PENDING: Object.freeze({
    key: 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
    needle: 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'}),
  READY_LEASE_INCOMPLETE: Object.freeze({
    key: 'node_ready_lease_incomplete',
    needle: 'node_ready_lease_incomplete'}),
  PROCESS_START: Object.freeze({
    key: 'process_start',
    needle: 'Distributed Database System starting'}),
});
const LOG_OBSERVATION_LIST = Object.freeze(Object.values(LOG_OBSERVATION));

function isRecord(value) {
  return value !== null && typeof value === TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function unmet(id, reasonCodes, detail = {}) {
  return {detail, id, met: false, reasonCodes: uniqueSorted(reasonCodes)};
}

function met(id, detail = {}) {
  return {detail, id, met: true, reasonCodes: []};
}

/**
 * A read result: `{rows}` when it succeeded, `{error}` when it did not.
 * @param {Object|null|undefined} read
 * @return {Array<Object>|null} rows, or null when the read failed/absent.
 */
function rowsOfRead(read) {
  return isRecord(read) && Array.isArray(read.rows) && !read.error ?
    read.rows :
    null;
}

function readFailureReason(label, read) {
  const error = isRecord(read) && read.error ? String(read.error) : 'absent';
  return `read_failed:${label}:${error}`;
}

function snapshotDiagnostics(snapshot) {
  const diagnostics = snapshot?.payload?.controlPlaneDiagnostics;
  return isRecord(diagnostics) ? diagnostics : null;
}

function readinessReasonCodes(entry) {
  const codes = Array.isArray(entry?.reasonCodes) ? entry.reasonCodes : [];
  const lane = entry?.projectionReadinessContract?.lanes?.serve?.reasonCodes;
  const laneCodes = Array.isArray(lane) ?
    arrayMap(lane, (code) => SERVE_LANE_PREFIX + code) :
    [];
  return uniqueSorted(arrayFilter([...codes, ...laneCodes],
    (code) => typeof code === TYPEOF_STRING && code.length > ZERO));
}

function isServeBlockingCode(code) {
  return arraySome(SERVE_BLOCKING_REASON_CODES, (blocking) =>
    code === blocking || code === SERVE_LANE_PREFIX + blocking);
}

/**
 * Predicate (a), from every observer's control snapshot.
 * @param {Object} observation {clusterNodeIds, snapshots}
 * @return {Object} predicate result
 */
function collectReadinessView(observerNodeId, nodeId, entry, sink) {
  if (!isRecord(entry)) {
    sink.reasons.push(`readiness_entry_absent:${observerNodeId}->${nodeId}`);
    return;
  }
  const serveEligible = entry.dimensions?.serveEligible === true;
  const codes = readinessReasonCodes(entry);
  sink.views.push({nodeId, observerNodeId, reasonCodes: codes, serveEligible});
  if (!serveEligible) sink.reasons.push('serve_ineligible');
  for (const code of arrayFilter(codes, isServeBlockingCode)) {
    sink.reasons.push(code);
  }
}

function collectObserverServeViews(observation, observerNodeId, sink) {
  const snapshot = observation.snapshots?.[observerNodeId];
  const readinessByNodeId = snapshotDiagnostics(snapshot)?.readinessByNodeId;
  if (!isRecord(readinessByNodeId)) {
    sink.reasons.push(snapshot?.error ?
      `control_snapshot_read_failed:${observerNodeId}` :
      `readiness_by_node_id_absent:${observerNodeId}`);
    return;
  }
  for (const nodeId of observation.clusterNodeIds) {
    collectReadinessView(observerNodeId, nodeId, readinessByNodeId[nodeId],
      sink);
  }
}

function evaluateServeLane(observation) {
  const sink = {reasons: [], views: []};
  for (const observerNodeId of observation.clusterNodeIds) {
    collectObserverServeViews(observation, observerNodeId, sink);
  }
  const {reasons, views} = sink;
  const allCodes = uniqueSorted([].concat(...arrayMap(views,
    (view) => view.reasonCodes)));
  return reasons.length === ZERO ?
    met(PREDICATE.SERVE_LANE, {views}) :
    unmet(PREDICATE.SERVE_LANE, reasons, {observedReasonCodes: allCodes,
      views});
}

function priorityPartitionRows(partitionRows) {
  return arrayFilter(partitionRows, (row) => PRIORITY_CONTROL_PLANE_TABLE_IDS
    .has(row?.table_id ?? row?.table_name));
}

function activePartitionServiceNodeIds(serviceRows, partitionId) {
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
    maxCommitIndex = updateMaxSafeInteger(maxCommitIndex,
      witness?.commitIndex);
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
  return [
    row.updated_at,
    row.created_at,
    row.completed_at,
    row.started_at,
    row.state_entered_at,
  ];
}

function collectRowHlcCandidates(row) {
  if (!isRecord(row)) return [];
  return [
    row.origin_hlc,
    row.originHlc,
    row.updated_at_hlc,
    row.updatedAtHlc,
  ];
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
  return typeof observerHlc === TYPEOF_STRING &&
    observerHlc.length > ZERO &&
    typeof authorityHlc === TYPEOF_STRING &&
    authorityHlc.length > ZERO &&
    observerHlc < authorityHlc;
}

function evaluateRevisionSkew(authorityRevision, observerRevision) {
  const auth = isRecord(authorityRevision) ? authorityRevision : {};
  const obs = isRecord(observerRevision) ? observerRevision : {};
  const wm = isRecord(obs.watermark) ? obs.watermark : {};
  return isSafeIntegerLagging(wm.lastAuthoritativeAppliedIndex,
    auth.maxAppliedIndex) ||
    isSafeIntegerLagging(wm.lastSourceLogIndex, auth.maxAppliedIndex) ||
    isFiniteTimestampLagging(obs.capturedAtMs, auth.maxRowTimestampMs) ||
    isHlcStringLagging(wm.lastOriginHlc, auth.maxOriginHlc);
}

function authoritativePrioritySpread(partitionRows, serviceRows, reasons) {
  const rows = priorityPartitionRows(partitionRows);
  const seenTables = new Set(arrayMap(rows,
    (row) => row.table_id ?? row.table_name));
  for (const tableId of PRIORITY_CONTROL_PLANE_TABLE_IDS) {
    if (!seenTables.has(tableId)) {
      reasons.push(`priority_partition_row_missing:${tableId}`);
    }
  }
  return arrayMap(rows, (row) => {
    const required = Number(row.replica_count);
    const nodeIds = activePartitionServiceNodeIds(serviceRows,
      row.partition_id);
    if (!Number.isSafeInteger(required) || required < ONE) {
      reasons.push(`replica_count_invalid:${row.partition_id}`);
    }
    return {
      partitionId: row.partition_id,
      readyDistinctNodeCount: nodeIds.length,
      readyNodeIds: nodeIds,
      requiredDistinctNodeCount: required,
      satisfied: Number.isSafeInteger(required) && nodeIds.length >= required,
    };
  });
}

function projectionBlockedById(summary) {
  const blocked = new Map();
  for (const entry of summary?.blockedPartitions || []) {
    blocked.set(entry.partitionId, entry);
  }
  for (const partitionId of summary?.missingPartitionIds || []) {
    if (!blocked.has(partitionId)) {
      blocked.set(partitionId, {partitionId, reasons: ['missing']});
    }
  }
  return blocked;
}

function projectionSummaryOf(snapshot) {
  const raw = snapshotDiagnostics(snapshot)?.publicationConvergence
    ?.priorityPartitionSummary;
  return normalizePriorityPartitionSummaryForDiagnostics(raw);
}

/**
 * Predicate (b): authoritative spread plus each observer's projection; a
 * projection that disagrees with authority is returned for predicate (g).
 * @param {Object} observation
 * @return {{result: Object, disagreements: Array<Object>}}
 */
// Both authoritative row sets, or the named failures of the missing ones.
function readAuthorityRows(authority, labels, reasons) {
  const rowsByLabel = {};
  for (const label of labels) {
    rowsByLabel[label] = rowsOfRead(authority?.[label]);
    if (rowsByLabel[label] === null) {
      reasons.push(readFailureReason(label, authority?.[label]));
    }
  }
  return rowsByLabel;
}

function compareObserverSpread(context, authoritative, sink) {
  const {
    authorityRevision,
    observerNodeId,
    observerRevision,
    revisionSkew,
    summary,
  } = context;
  const blocked = projectionBlockedById(summary);
  const satisfied = summary.satisfied === true && blocked.size === ZERO;
  sink.projections.push({blockedPartitions: [...blocked.values()],
    observerNodeId, satisfied});
  if (!satisfied) sink.reasons.push(`projection_not_spread:${observerNodeId}`);
  for (const entry of authoritative) {
    const projected = blocked.get(entry.partitionId) || null;
    if (entry.satisfied === (projected === null)) continue;
    sink.disagreements.push({
      authority: entry,
      authorityRevision,
      key: `priority_spread:${observerNodeId}:${entry.partitionId}`,
      observerNodeId,
      observerRevision,
      projection: projected === null ? {satisfied: true} :
        {satisfied: false, ...projected},
      revisionSkew,
    });
  }
}

function evaluatePrioritySpread(observation) {
  const reasons = [];
  const rows = readAuthorityRows(observation.authority,
    ['partitions', 'services'], reasons);
  if (rows.partitions === null || rows.services === null) {
    return {disagreements: [], result: unmet(PREDICATE.PRIORITY_SPREAD,
      reasons)};
  }
  const authoritative = authoritativePrioritySpread(rows.partitions,
    rows.services, reasons);
  for (const entry of arrayFilter(authoritative, (item) => !item.satisfied)) {
    reasons.push(`authority_not_spread:${entry.partitionId}:` +
      `${entry.readyDistinctNodeCount}/${entry.requiredDistinctNodeCount}`);
  }
  const authorityRevision = extractAuthorityTableRevision(
    observation.authority?.services, rows.services);
  const sink = {disagreements: [], projections: [], reasons};
  for (const observerNodeId of observation.clusterNodeIds) {
    const snapshot = observation.snapshots?.[observerNodeId];
    const summary = projectionSummaryOf(snapshot);
    if (summary === null) {
      reasons.push(`projection_priority_summary_absent:${observerNodeId}`);
      continue;
    }
    const observerRevision = extractObserverTableRevision(snapshot,
      TABLE_SERVICES);
    const revisionSkew = evaluateRevisionSkew(authorityRevision,
      observerRevision);
    compareObserverSpread({
      authorityRevision,
      observerNodeId,
      observerRevision,
      revisionSkew,
      summary,
    }, authoritative, sink);
  }
  const {disagreements, projections} = sink;
  const detail = {authoritative, projections};
  return {
    disagreements,
    result: reasons.length === ZERO ?
      met(PREDICATE.PRIORITY_SPREAD, detail) :
      unmet(PREDICATE.PRIORITY_SPREAD, reasons, detail),
  };
}

function compareProjectedInFlight(
  observation,
  authorityCount,
  authorityRevision,
  reasons,
) {
  const disagreements = [];
  const projected = [];
  for (const observerNodeId of observation.clusterNodeIds) {
    const snapshot = observation.snapshots?.[observerNodeId];
    const count = snapshot?.payload?.replicaOperations?.inFlightCount;
    if (!Number.isSafeInteger(count) || count < ZERO) {
      reasons.push(`projection_in_flight_count_absent:${observerNodeId}`);
      continue;
    }
    projected.push({count, observerNodeId});
    if (count > ZERO) reasons.push(`projection_in_flight:${observerNodeId}`);
    if ((count === ZERO) === (authorityCount === ZERO)) continue;
    const observerRevision = extractObserverTableRevision(snapshot,
      TABLE_REPLICA_OPERATIONS);
    const revisionSkew = evaluateRevisionSkew(authorityRevision,
      observerRevision);
    disagreements.push({
      authority: {inFlightCount: authorityCount},
      authorityRevision,
      key: `ledger_in_flight:${observerNodeId}`,
      observerNodeId,
      observerRevision,
      projection: {inFlightCount: count},
      revisionSkew,
    });
  }
  return {disagreements, projected};
}

/**
 * Predicate (c): authoritative non-terminal ledger rows and projected
 * in-flight counts.
 * @param {Object} observation
 * @return {{result: Object, disagreements: Array<Object>}}
 */
function evaluateLedgerQuiet(observation) {
  const reasons = [];
  const read = observation.authority?.replicaOperations;
  const rows = rowsOfRead(read);
  if (rows === null) {
    return {disagreements: [], result: unmet(PREDICATE.LEDGER_QUIET,
      [readFailureReason('replica_operations', read)])};
  }
  const inFlight = arrayFilter(rows,
    (row) => !isTerminalReplicaOperationRecord(row));
  const inFlightIds = arrayMap(inFlight, (row) =>
    `${row.operation_id}:${row.type}:${row.partition_id}:${row.status}`);
  if (inFlight.length > ZERO) reasons.push('replica_operations_in_flight');
  if (read.complete !== true) {
    reasons.push('replica_operations_observation_incomplete');
  }
  const authorityRevision = extractAuthorityTableRevision(read, rows);
  const {disagreements, projected} = compareProjectedInFlight(observation,
    inFlight.length, authorityRevision, reasons);
  const detail = {authoritativeInFlight: inFlightIds,
    authoritativeInFlightCount: inFlight.length, projected,
    rowsComplete: read.complete === true};
  return {
    disagreements,
    result: reasons.length === ZERO ?
      met(PREDICATE.LEDGER_QUIET, detail) :
      unmet(PREDICATE.LEDGER_QUIET, reasons, detail),
  };
}

/**
 * One formation poll: predicates a-c plus this poll's projection/authority
 * disagreements (input to predicate g).
 * @param {Object} observation {capturedAtMs, clusterNodeIds,
 *   snapshots: {[nodeId]: {payload|null, error|null}},
 *   authority: {partitions, services, replicaOperations}}
 * @return {Object}
 */
function evaluateFormationObservation(observation) {
  const serveLane = evaluateServeLane(observation);
  const spread = evaluatePrioritySpread(observation);
  const ledger = evaluateLedgerQuiet(observation);
  const disagreements = [...spread.disagreements, ...ledger.disagreements];
  return {
    capturedAtMs: observation.capturedAtMs,
    disagreements,
    predicates: [serveLane, spread.result, ledger.result],
    satisfied: serveLane.met && spread.result.met && ledger.result.met,
  };
}

function didAuthorityRevisionAdvance(prevRev, nextRev) {
  if (!isRecord(prevRev) || !isRecord(nextRev)) return false;
  return isSafeIntegerLagging(prevRev.maxAppliedIndex,
    nextRev.maxAppliedIndex) ||
    isFiniteTimestampLagging(prevRev.maxRowTimestampMs,
      nextRev.maxRowTimestampMs) ||
    isHlcStringLagging(prevRev.maxOriginHlc, nextRev.maxOriginHlc);
}

function isPreCommitDisagreement(authorityRevision, observerRevision) {
  return isFiniteTimestampLagging(observerRevision?.capturedAtMs,
    authorityRevision?.maxRowTimestampMs);
}

function createDisagreementEpisode(context) {
  const {authRev, obsRev, postCommitFloorMs, preCommit, skew} = context;
  return {
    firstAuthorityRevision: authRev,
    firstObserverRevision: obsRev,
    firstSeenAtMs: postCommitFloorMs,
    lastWasPreCommit: preCommit,
    latestAuthorityRevision: authRev,
    latestObserverRevision: obsRev,
    postCommitPollCount: preCommit ? ZERO : ONE,
    revisionSkewObserved: skew,
  };
}

function updateDisagreementEpisodeWindow(episode, context) {
  const {authRev, obsRev, postCommitFloorMs, preCommit} = context;
  if (didAuthorityRevisionAdvance(episode.latestAuthorityRevision, authRev)) {
    episode.firstAuthorityRevision = authRev;
    episode.firstObserverRevision = obsRev;
    episode.firstSeenAtMs = postCommitFloorMs;
    episode.postCommitPollCount = preCommit ? ZERO : ONE;
    return;
  }
  if (preCommit || episode.lastWasPreCommit) {
    episode.firstSeenAtMs = postCommitFloorMs;
    episode.postCommitPollCount = preCommit ? ZERO : ONE;
    return;
  }
  episode.postCommitPollCount += ONE;
}

function advanceDisagreementEpisode(episodes, previousKeys, evaluation, entry) {
  const authRev = entry.authorityRevision || null;
  const obsRev = entry.observerRevision || null;
  const skew = entry.revisionSkew === true;
  const preCommit = isPreCommitDisagreement(authRev, obsRev);
  const postCommitFloorMs = Math.max(evaluation.capturedAtMs,
    authRev?.maxRowTimestampMs || ZERO);
  const context = {authRev, obsRev, postCommitFloorMs, preCommit, skew};
  if (!previousKeys.has(entry.key) || !episodes.has(entry.key)) {
    const created = createDisagreementEpisode(context);
    episodes.set(entry.key, created);
    return created;
  }
  const episode = episodes.get(entry.key);
  updateDisagreementEpisodeWindow(episode, context);
  episode.lastWasPreCommit = preCommit;
  episode.latestAuthorityRevision = authRev;
  episode.latestObserverRevision = obsRev;
  episode.revisionSkewObserved = episode.revisionSkewObserved || skew;
  return episode;
}

/**
 * Predicate (g) over the poll history: a disagreement key seen on two
 * consecutive polls spanning more than the cache-visibility bound is a
 * persistent projection/authority split - the class the owner names.
 * @param {Array<Object>} evaluations evaluateFormationObservation results
 * @param {number} [boundMs]
 * @return {Object} predicate result
 */
function evaluateProjectionAgreement(evaluations,
  boundMs = PROJECTION_PERSISTENCE_BOUND_MS) {
  const episodes = new Map();
  const persistent = new Map();
  let previousKeys = new Set();
  for (const evaluation of evaluations) {
    const keys = new Set();
    for (const entry of evaluation.disagreements) {
      keys.add(entry.key);
      const episode = advanceDisagreementEpisode(episodes, previousKeys,
        evaluation, entry);
      const spanMs = evaluation.capturedAtMs - episode.firstSeenAtMs;
      if (episode.postCommitPollCount >= TWO && spanMs > boundMs) {
        const prior = persistent.get(entry.key);
        persistent.set(entry.key, {
          firstAuthorityRevision: episode.firstAuthorityRevision,
          firstObserverRevision: episode.firstObserverRevision,
          firstSeenAtMs: episode.firstSeenAtMs,
          key: entry.key,
          lastEntry: entry,
          latestAuthorityRevision: episode.latestAuthorityRevision,
          latestObserverRevision: episode.latestObserverRevision,
          longestSpanMs: Math.max(prior?.longestSpanMs ?? ZERO, spanMs),
          revisionSkewObserved: episode.revisionSkewObserved,
        });
      }
    }
    previousKeys = keys;
  }
  const detail = {boundMs, persistent: [...persistent.values()]};
  return persistent.size === ZERO ?
    met(PREDICATE.PROJECTION_AGREEMENT, detail) :
    unmet(PREDICATE.PROJECTION_AGREEMENT, arrayMap([...persistent.keys()],
      (key) => `persistent_disagreement:${key}`), detail);
}

function raftQuorum(replicaCount) {
  return Math.floor(replicaCount / TWO) + ONE;
}

function createContractReasons(create) {
  if (create === null) return ['create_table_not_issued'];
  const reasons = [];
  if (create.error) reasons.push(`create_table_failed:${create.error}`);
  if (create.contractState === CONTRACT_STATE_PENDING) {
    reasons.push('create_table_contract_pending', ...(create.reasonCodes || []));
  }
  return reasons;
}

function routingPartitions(input, rows, reasons) {
  if (rows.tables !== null && !arraySome(rows.tables,
    (row) => row?.table_name === input.tableName)) {
    reasons.push('table_row_absent');
  }
  if (rows.partitions === null || rows.services === null) return [];
  const own = arrayFilter(rows.partitions,
    (row) => row?.table_name === input.tableName);
  if (own.length === ZERO) reasons.push('partition_rows_absent');
  return arrayMap(own, (row) => {
    const quorum = raftQuorum(Number(row.replica_count));
    const nodeIds = activePartitionServiceNodeIds(rows.services,
      row.partition_id);
    if (!row.leader_node_id) reasons.push(`leader_absent:${row.partition_id}`);
    if (!(nodeIds.length >= quorum)) {
      reasons.push(`active_services_below_quorum:${row.partition_id}:` +
        `${nodeIds.length}/${quorum}`);
    }
    return {activeNodeIds: nodeIds, leaderNodeId: row.leader_node_id ?? null,
      partitionId: row.partition_id, quorum};
  });
}

function isProbeAnswered(probe) {
  return probe !== null && !probe.error && Array.isArray(probe.rows) &&
    probe.rows.length === ONE;
}

/**
 * Predicate (d): the CREATE TABLE contract, the authoritative routing rows
 * and a routing probe. A probe that fails while the rows say routable is a
 * class disagreement (routing filtered committed services).
 * @param {Object} input {tableName, create: {contractState, reasonCodes,
 *   error}, tables, partitions, services, countProbe: {rows|error}}
 * @return {Object} predicate result
 */
function evaluateUserTableRoutability(input) {
  const reasons = createContractReasons(input.create || null);
  const rows = readAuthorityRows(input, ['tables', 'partitions', 'services'],
    reasons);
  const partitions = routingPartitions(input, rows, reasons);
  const probe = input.countProbe || null;
  const probeOk = isProbeAnswered(probe);
  if (!probeOk) {
    reasons.push(probe?.error ? `count_probe_failed:${probe.error}` :
      'count_probe_absent');
  }
  const rowsSayRoutable = partitions.length > ZERO && !arraySome(partitions,
    (entry) => !entry.leaderNodeId || entry.activeNodeIds.length < entry.quorum);
  const detail = {
    countProbe: probe,
    partitions,
    routingFilteredCommittedServices: rowsSayRoutable && !probeOk,
  };
  if (detail.routingFilteredCommittedServices) {
    reasons.push('routing_filtered_committed_services');
  }
  return reasons.length === ZERO ?
    met(PREDICATE.USER_TABLE_ROUTABLE, detail) :
    unmet(PREDICATE.USER_TABLE_ROUTABLE, reasons, detail);
}

/**
 * Predicate (e).
 * @param {Object} input {clusterNodeIds, insert: {rowCount|error},
 *   readbacks: Array<{via, nodeId|null, rowCount|error}>}
 * @return {Object} predicate result
 */
function evaluateWriteReadback(input) {
  const reasons = [];
  const insert = input.insert || null;
  if (insert === null) reasons.push('insert_not_issued');
  else if (insert.error) reasons.push(`insert_failed:${insert.error}`);
  else if (insert.rowCount !== ONE) {
    reasons.push(`insert_row_count:${insert.rowCount}`);
  }
  const readbacks = Array.isArray(input.readbacks) ? input.readbacks : [];
  for (const nodeId of input.clusterNodeIds) {
    if (!arraySome(readbacks, (entry) => entry.nodeId === nodeId)) {
      reasons.push(`readback_absent:${nodeId}`);
    }
  }
  for (const entry of readbacks) {
    if (entry.error) reasons.push(`readback_failed:${entry.via}`);
    else if (entry.rowCount !== ONE) {
      reasons.push(`readback_row_count:${entry.via}:${entry.rowCount}`);
    }
  }
  const detail = {insert, readbacks};
  return reasons.length === ZERO ?
    met(PREDICATE.WRITE_READBACK, detail) :
    unmet(PREDICATE.WRITE_READBACK, reasons, detail);
}

/**
 * Predicate (f): each refusal is checked against the authoritative services
 * row of its learner. A row whose created_at precedes the refusal was
 * committed when the leader could not resolve it; an unobservable row is a
 * named unmet reason, never assumed absent.
 * @param {Object} input {refusals: Array<{nodeId, timeMs, learnerReplicaId,
 *   partitionId}>, services: {rows|error}}
 * @return {Object} predicate result
 */
function evaluateLearnerRefusals(input) {
  const refusals = Array.isArray(input.refusals) ? input.refusals : [];
  if (refusals.length === ZERO) {
    return met(PREDICATE.LEARNER_ADDRESS, {refusalCount: ZERO});
  }
  const serviceRows = rowsOfRead(input.services);
  if (serviceRows === null) {
    return unmet(PREDICATE.LEARNER_ADDRESS,
      [readFailureReason('services', input.services)],
      {refusalCount: refusals.length});
  }
  const byId = new Map(arrayMap(serviceRows, (row) => [row?.service_id, row]));
  const reasons = [];
  const committed = [];
  for (const refusal of refusals) {
    const row = byId.get(refusal.learnerReplicaId) || null;
    if (row === null) {
      reasons.push(`learner_row_unobservable:${refusal.learnerReplicaId}`);
      continue;
    }
    const createdAt = Number(row.created_at);
    if (Number.isFinite(createdAt) && Number.isFinite(refusal.timeMs) &&
        createdAt <= refusal.timeMs) {
      committed.push({...refusal, rowCreatedAtMs: createdAt});
      reasons.push('learner_address_unresolvable_for_committed_row');
    }
  }
  const detail = {committedRowRefusalCount: committed.length,
    firstCommittedRowRefusal: committed[ZERO] || null,
    refusalCount: refusals.length};
  return reasons.length === ZERO ?
    met(PREDICATE.LEARNER_ADDRESS, detail) :
    unmet(PREDICATE.LEARNER_ADDRESS, reasons, detail);
}

function parseLogLine(line) {
  const start = stringIndexOf(line, JSON_OPEN_BRACE);
  if (start < ZERO) return null;
  try {
    const parsed = JSON.parse(line.slice(start));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function recordLogMatch(record, parsed) {
  record.count += ONE;
  if (parsed === null) {
    record.unparsedMatchCount += ONE;
  } else if (record.firstAt === null && typeof parsed.time === TYPEOF_STRING) {
    record.firstAt = parsed.time;
  }
}

function learnerRefusalOf(parsed) {
  return {
    learnerReplicaId: parsed.learnerReplicaId ?? null,
    nodeId: parsed.nodeId ?? null,
    partitionId: parsed.partitionId ?? null,
    timeMs: Date.parse(parsed.time),
  };
}

/**
 * Scan one node's full log lines for the named observations. A matching
 * line that does not parse is counted (unparsedMatchCount), never dropped.
 * @param {Array<string>} lines
 * @return {Object} {observations: {[key]: {count, firstAt, unparsedMatchCount}},
 *   learnerRefusals: Array<Object>, lineCount}
 */
function scanFormationLogLines(lines) {
  const observations = {};
  for (const entry of LOG_OBSERVATION_LIST) {
    observations[entry.key] = {count: ZERO, firstAt: null,
      unparsedMatchCount: ZERO};
  }
  const learnerRefusals = [];
  for (const line of lines) {
    if (typeof line !== TYPEOF_STRING) continue;
    const matches = arrayFilter(LOG_OBSERVATION_LIST,
      (entry) => stringIncludes(line, entry.needle));
    if (matches.length === ZERO) continue;
    const parsed = parseLogLine(line);
    for (const entry of matches) {
      recordLogMatch(observations[entry.key], parsed);
      if (entry === LOG_OBSERVATION.LEARNER_ADDRESS_UNRESOLVABLE &&
          parsed !== null) {
        learnerRefusals.push(learnerRefusalOf(parsed));
      }
    }
  }
  return {learnerRefusals, lineCount: lines.length, observations};
}

/**
 * The first unmet predicate in claim order, or null when all are met.
 * @param {Array<Object>} predicates predicate results (any order)
 * @return {Object|null}
 */
function firstUnmetPredicate(predicates) {
  for (const id of PREDICATE_ORDER) {
    const result = arrayFilter(predicates, (entry) => entry?.id === id)[ZERO];
    if (result && !result.met) return result;
  }
  return null;
}

/**
 * Integrity: every snapshot / authoritative read across the history
 * succeeded; any failure fails the run named, even if later polls pass.
 * @param {Array<string>} readFailures
 * @return {Object} predicate result
 */
function evaluateObservationIntegrity(readFailures) {
  return readFailures.length === ZERO ?
    met(PREDICATE.INTEGRITY) :
    unmet(PREDICATE.INTEGRITY, readFailures, {failureCount: readFailures.length});
}

export {
  LOG_OBSERVATION,
  PREDICATE,
  SERVE_BLOCKING_REASON_CODES,
  evaluateFormationObservation,
  evaluateLearnerRefusals,
  evaluateObservationIntegrity,
  evaluateProjectionAgreement,
  evaluateRevisionSkew,
  evaluateUserTableRoutability,
  evaluateWriteReadback,
  extractAuthorityTableRevision,
  extractObserverTableRevision,
  firstUnmetPredicate,
  scanFormationLogLines,
};
