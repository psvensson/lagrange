/**
 * Predicate evaluation of the fresh-formation-user-table-routability
 * scenario against the recorded live state of the 2026-11-01 three-node
 * diagnosis (fixtures under test/distributed/fixtures/
 * fresh-formation-live-diagnosis-2026-11-01/, origin.json names the source
 * and digests) and against a constructed satisfying state.
 *
 * Fixture limits, stated so no verdict below leans on them: the capture has
 * no control snapshot (the client asked `SELECT control_snapshot_local();`,
 * which the product answers `no such function`), and its routed query
 * results over 20 rows were trimmed by the capture client. The seed's
 * complete cache_dump (its system-table cache) therefore supplies the
 * partitions / services / replica_operations rows here; the red verdicts
 * asserted are those that hold on those rows as captured.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  LOG_OBSERVATION,
  PREDICATE,
  SERVE_BLOCKING_REASON_CODES,
  evaluateFormationObservation,
  evaluateLearnerRefusals,
  evaluateObservationIntegrity,
  evaluateProjectionAgreement,
  evaluateUserTableRoutability,
  evaluateWriteReadback,
  firstUnmetPredicate,
  scanFormationLogLines,
} from '../fresh-formation-routability-predicate.js';
import {
  SCENARIO_REFUSAL,
  evaluateScenarioTopologyRequirement,
} from '../scenario-host-topology.js';
import {
  SCENARIO_TOPOLOGY_REQUIREMENT,
} from '../../scenarios/fresh-formation-user-table-routability.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const FIXTURE_DIR = new URL(
  '../../fixtures/fresh-formation-live-diagnosis-2026-11-01/',
  import.meta.url);
const NODE_IDS = Object.freeze([
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
]);
const PRIORITY_PARTITION_IDS = Object.freeze([
  'control_plane_publications-p1',
  'replica_operations-p1',
  'schema_operations-p1',
  'sql_transaction_participants-p1',
  'sql_transactions-p1',
  'sql_write_operations-p1',
]);
const BENCH_TABLE = 'bench_accounts';
const LEARNER_ID = 'replace-replica-804a44382c8f7676e0f5d04aed17f26e';
const SNAPSHOT_ERROR = 'no such function: control_snapshot_local';
const T0 = Date.parse('2026-11-01T20:00:00.000Z');

function readFixtureJson(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), 'utf8'));
}

function readFixtureLines(name) {
  return stringSplit(readFileSync(new URL(name, FIXTURE_DIR), 'utf8'), '\n');
}

function cacheDumpOf(capture) {
  return capture.unsolicited[0].msg.data;
}

// The recorded state at one capture instant, in the scenario's observation
// shape. No snapshot was captured: every observer's read is the recorded
// failure (seed) or absent (joiners).
function recordedObservation(capture, capturedAtIso) {
  const cache = cacheDumpOf(capture);
  const snapshots = {};
  for (const nodeId of NODE_IDS) {
    snapshots[nodeId] = {error: nodeId === NODE_IDS[0] ? SNAPSHOT_ERROR :
      'not_captured', payload: null};
  }
  return {
    authority: {
      partitions: {complete: true, rows: cache.partitions},
      replicaOperations: {complete: true, rows: cache.replica_operations},
      services: {complete: true, rows: cache.services},
    },
    capturedAtMs: Date.parse(capturedAtIso),
    clusterNodeIds: [...NODE_IDS],
    snapshots,
  };
}

function predicateById(evaluation, id) {
  return arrayFind(evaluation.predicates, (entry) => entry.id === id);
}

test('fixture origin digests still match the copied captures', (t) => {
  const origin = readFixtureJson('origin.json');
  assert.equal(origin.copiedVerbatim, true);
  assert.equal(origin.files.length, 4);
  for (const entry of origin.files) {
    const digest = createHash('sha256')
      .update(readFileSync(new URL(entry.file, FIXTURE_DIR)))
      .digest('hex');
    assert.equal(digest, entry.sha256, entry.file);
  }
  t.end();
});

test('recorded 19:51:47Z state is red at (a) with (b) and (c) unmet', (t) => {
  const capture = readFixtureJson('step2a-membership.json');
  assert.deepEqual(arrayMap(capture.records[0].envelope.results,
    (row) => row.node_id).sort(), [...NODE_IDS]);
  assert.equal(capture.records[1].envelope.error, SNAPSHOT_ERROR);
  const evaluation = evaluateFormationObservation(
    recordedObservation(capture, '2026-11-01T19:51:47.504Z'));
  assert.equal(evaluation.satisfied, false);
  const first = firstUnmetPredicate(evaluation.predicates);
  assert.equal(first.id, PREDICATE.SERVE_LANE);
  assert.ok(arrayIncludes(first.reasonCodes,
    `control_snapshot_read_failed:${NODE_IDS[0]}`));
  const spread = predicateById(evaluation, PREDICATE.PRIORITY_SPREAD);
  assert.equal(spread.met, false);
  // The seed's cache at 19:51:47: the six priority partitions are still on
  // the seed alone or mid-REPLACE.
  assert.ok(arraySome(spread.reasonCodes, (code) =>
    stringStartsWith(code, 'authority_not_spread:')));
  const ledger = predicateById(evaluation, PREDICATE.LEDGER_QUIET);
  assert.equal(ledger.met, false);
  assert.ok(arrayIncludes(ledger.reasonCodes, 'replica_operations_in_flight'));
  assert.ok(ledger.detail.authoritativeInFlightCount >= 2);
  t.end();
});

test('recorded 19:58:17Z state: publications 2/3 and no projection', (t) => {
  const capture = readFixtureJson('step2c-tables.json');
  const evaluation = evaluateFormationObservation(
    recordedObservation(capture, '2026-11-01T19:58:17.626Z'));
  const spread = predicateById(evaluation, PREDICATE.PRIORITY_SPREAD);
  assert.equal(spread.met, false);
  assert.ok(arrayIncludes(spread.reasonCodes,
    'authority_not_spread:control_plane_publications-p1:2/3'));
  assert.ok(arrayIncludes(spread.reasonCodes,
    `projection_priority_summary_absent:${NODE_IDS[1]}`));
  const ledger = predicateById(evaluation, PREDICATE.LEDGER_QUIET);
  // Every ledger row is terminal by 19:58; the predicate stays unmet only
  // because no projected in-flight count was observed (never defaulted).
  assert.equal(ledger.detail.authoritativeInFlightCount, 0);
  assert.equal(ledger.met, false);
  assert.ok(arrayIncludes(ledger.reasonCodes,
    `projection_in_flight_count_absent:${NODE_IDS[0]}`));
  t.end();
});

test('recorded bench_accounts: committed services filtered by routing', (t) => {
  const capture = readFixtureJson('step2c-tables.json');
  const cache = cacheDumpOf(capture);
  const countEnvelope = capture.records[3].envelope;
  assert.equal(countEnvelope.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  const result = evaluateUserTableRoutability({
    countProbe: {error: `${countEnvelope.errorCode}: ` +
      countEnvelope.firstFailedParticipant.error},
    // tables-for-evidence.md step 2b #3: the CREATE TABLE answer.
    create: {contractState: 'pending',
      reasonCodes: ['schema_replica_convergence_pending']},
    partitions: {rows: cache.partitions},
    services: {rows: cache.services},
    tableName: BENCH_TABLE,
    tables: {rows: cache.tables},
  });
  assert.equal(result.met, false);
  assert.ok(arrayIncludes(result.reasonCodes, 'create_table_contract_pending'));
  assert.ok(arrayIncludes(result.reasonCodes, 'routing_filtered_committed_services'));
  assert.equal(result.detail.routingFilteredCommittedServices, true);
  assert.equal(result.detail.partitions[0].activeNodeIds.length, 3);
  t.end();
});

test('recorded seed log: named observations and a committed-row refusal',
  (t) => {
    const scan = scanFormationLogLines(readFixtureLines(
      'seed-log-excerpt.txt'));
    const observations = scan.observations;
    assert.equal(observations[LOG_OBSERVATION.PROCESS_START.key].count, 1);
    assert.equal(observations[LOG_OBSERVATION.CACHE_WAIT_TIMEOUT.key].firstAt,
      '2026-11-01T19:50:58.093Z');
    assert.equal(
      observations[LOG_OBSERVATION.CDC_ACCEPTANCE_UNKNOWN.key].count, 1);
    assert.equal(
      observations[LOG_OBSERVATION.CDC_UPDATE_ROW_MISSING.key].count, 1);
    const refusals = observations[
      LOG_OBSERVATION.LEARNER_ADDRESS_UNRESOLVABLE.key];
    assert.equal(refusals.count, 2);
    assert.equal(refusals.firstAt, '2026-11-01T19:51:19.988Z');
    assert.equal(scan.learnerRefusals[0].learnerReplicaId, LEARNER_ID);
    const services = cacheDumpOf(readFixtureJson('step2c-tables.json'))
      .services;
    const result = evaluateLearnerRefusals({refusals: scan.learnerRefusals,
      services: {rows: services}});
    assert.equal(result.met, false);
    assert.deepEqual(result.reasonCodes,
      ['learner_address_unresolvable_for_committed_row']);
    assert.equal(result.detail.committedRowRefusalCount, 2);
    t.end();
  });

test('an unparseable matching log line is counted, never dropped', (t) => {
  const scan = scanFormationLogLines(['x "cause":"learner_address_unresolvable"']);
  const record = scan.observations[
    LOG_OBSERVATION.LEARNER_ADDRESS_UNRESOLVABLE.key];
  assert.equal(record.count, 1);
  assert.equal(record.unparsedMatchCount, 1);
  t.end();
});

function satisfiedReadiness() {
  const readinessByNodeId = {};
  for (const nodeId of NODE_IDS) {
    readinessByNodeId[nodeId] = {dimensions: {serveEligible: true}, nodeId,
      reasonCodes: []};
  }
  return readinessByNodeId;
}

function satisfiedPayload() {
  return {
    controlPlaneDiagnostics: {
      publicationConvergence: {priorityPartitionSummary: {
        requiredDistinctNodeCount: 3, satisfied: true}},
      readinessByNodeId: satisfiedReadiness(),
    },
    replicaOperations: {inFlightCount: 0},
  };
}

function satisfiedAuthority() {
  const partitions = arrayMap(PRIORITY_PARTITION_IDS, (partitionId) => ({
    partition_id: partitionId, replica_count: 3,
    table_id: partitionId.slice(0, -3)}));
  const services = [];
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    for (let index = 0; index < NODE_IDS.length; index += 1) {
      services.push({
        address: `${NODE_IDS[index]}/partition/${partitionId}-r${index + 1}`,
        node_id: NODE_IDS[index],
        partition_id: partitionId,
        raft_role: index === 0 ? 'leader' : 'follower',
        service_id: `${partitionId}-r${index + 1}`,
        service_type: 'partition',
        status: 'active',
      });
    }
  }
  return {
    partitions: {complete: true, rows: partitions},
    replicaOperations: {complete: true, rows: [{operation_id: 'op-1',
      partition_id: 'replica_operations-p1', status: 'removed',
      type: 'REMOVE', workflow_step: 'REMOVED'}]},
    services: {complete: true, rows: services},
  };
}

function satisfiedObservation(capturedAtMs) {
  const snapshots = {};
  for (const nodeId of NODE_IDS) {
    snapshots[nodeId] = {error: null, payload: satisfiedPayload()};
  }
  return {authority: satisfiedAuthority(), capturedAtMs,
    clusterNodeIds: [...NODE_IDS], snapshots};
}

test('constructed satisfying state is green on every predicate', (t) => {
  const evaluations = arrayMap([T0, T0 + 1000, T0 + 2000], (at) =>
    evaluateFormationObservation(satisfiedObservation(at)));
  for (const evaluation of evaluations) {
    assert.equal(evaluation.satisfied, true, JSON.stringify(
      arrayFilter(evaluation.predicates, (entry) => !entry.met)));
  }
  const table = [{partition_id: 'tbl-x-p1', leader_node_id: NODE_IDS[0],
    replica_count: 3, table_name: 'ffr_probe'}];
  const tableServices = arrayMap(NODE_IDS, (nodeId, index) => ({
    address: `${nodeId}/partition/tbl-x-p1-r${index + 1}`,
    node_id: nodeId,
    partition_id: 'tbl-x-p1',
    raft_role: index === 0 ? 'leader' : 'follower',
    service_id: `tbl-x-p1-r${index + 1}`,
    service_type: 'partition',
    status: 'active',
  }));
  const results = [
    ...evaluations[2].predicates,
    evaluateUserTableRoutability({countProbe: {rows: [{cnt: 0}]},
      create: {contractState: 'ready', reasonCodes: []},
      partitions: {rows: table}, services: {rows: tableServices},
      tableName: 'ffr_probe', tables: {rows: [{table_name: 'ffr_probe'}]}}),
    evaluateWriteReadback({clusterNodeIds: [...NODE_IDS],
      insert: {rowCount: 1}, readbacks: [
        {nodeId: null, rowCount: 1, via: 'public-pg-wire'},
        ...arrayMap(NODE_IDS, (nodeId) => ({nodeId, rowCount: 1,
          via: `admin:${nodeId}`}))]}),
    evaluateLearnerRefusals({refusals: [], services: {rows: []}}),
    evaluateProjectionAgreement(evaluations),
    evaluateObservationIntegrity([]),
  ];
  assert.equal(firstUnmetPredicate(results), null);
  t.end();
});

test('each serve-blocking reason code alone keeps (a) red', (t) => {
  for (const code of SERVE_BLOCKING_REASON_CODES) {
    const observation = satisfiedObservation(T0);
    observation.snapshots[NODE_IDS[2]].payload.controlPlaneDiagnostics
      .readinessByNodeId[NODE_IDS[1]].reasonCodes = [code];
    const first = firstUnmetPredicate(
      evaluateFormationObservation(observation).predicates);
    assert.equal(first?.id, PREDICATE.SERVE_LANE, code);
    assert.ok(arrayIncludes(first.reasonCodes, code));
  }
  t.end();
});

test('a projection disagreeing past the visibility bound fails (g)', (t) => {
  const stale = (at) => {
    const observation = satisfiedObservation(at);
    observation.snapshots[NODE_IDS[0]].payload.controlPlaneDiagnostics
      .publicationConvergence.priorityPartitionSummary = {satisfied: false,
        blockedPartitions: [{partitionId: 'replica_operations-p1',
          readyDistinctNodeCount: 2, requiredDistinctNodeCount: 3}]};
    return evaluateFormationObservation(observation);
  };
  const once = evaluateProjectionAgreement([stale(T0)]);
  assert.equal(once.met, true);
  const persistent = evaluateProjectionAgreement([stale(T0),
    stale(T0 + 1500)]);
  assert.equal(persistent.met, false);
  assert.deepEqual(persistent.reasonCodes, [
    `persistent_disagreement:priority_spread:${NODE_IDS[0]}:` +
      'replica_operations-p1']);
  t.end();
});

test('an absent read is a named failure, never a default', (t) => {
  const observation = satisfiedObservation(T0);
  observation.authority.services = {error: 'timeout'};
  observation.snapshots[NODE_IDS[1]].payload.replicaOperations = {};
  const evaluation = evaluateFormationObservation(observation);
  assert.ok(arrayIncludes(predicateById(evaluation,
    PREDICATE.PRIORITY_SPREAD).reasonCodes, 'read_failed:services:timeout'));
  assert.ok(arrayIncludes(predicateById(evaluation,
    PREDICATE.LEDGER_QUIET).reasonCodes,
  `projection_in_flight_count_absent:${NODE_IDS[1]}`));
  const integrity = evaluateObservationIntegrity(['read_failed:services:x']);
  assert.equal(integrity.met, false);
  t.end();
});

test('a config that is not three nodes refuses the scenario', (t) => {
  assert.equal(evaluateScenarioTopologyRequirement(
    SCENARIO_TOPOLOGY_REQUIREMENT, {size: 3}), null);
  const refusal = evaluateScenarioTopologyRequirement(
    SCENARIO_TOPOLOGY_REQUIREMENT, {size: 5});
  assert.equal(refusal.reason, SCENARIO_REFUSAL.NODE_COUNT_MISMATCH);
  assert.equal(refusal.required, 3);
  assert.equal(refusal.available, 5);
  t.end();
});

test('active learner rows in services do not count as voter holders or trigger false priority_spread disagreements', (t) => {
  const observation = satisfiedObservation(T0);
  observation.authority.services.rows = arrayMap(
    observation.authority.services.rows,
    (row) => row.partition_id === 'replica_operations-p1' &&
      row.node_id === NODE_IDS[2] ?
      {...row, raft_role: 'learner'} :
      row);
  for (const nodeId of NODE_IDS) {
    observation.snapshots[nodeId].payload.controlPlaneDiagnostics
      .publicationConvergence.priorityPartitionSummary = {
        blockedPartitions: [{
          partitionId: 'replica_operations-p1',
          readyDistinctNodeCount: 2,
          requiredDistinctNodeCount: 3,
        }],
        satisfied: false,
      };
  }
  const evaluation = evaluateFormationObservation(observation);
  const spread = predicateById(evaluation, PREDICATE.PRIORITY_SPREAD);
  assert.equal(spread.met, false);
  assert.ok(arrayIncludes(spread.reasonCodes,
    'authority_not_spread:replica_operations-p1:2/3'));
  assert.equal(evaluation.disagreements.length, 0);
  t.end();
});

test('disagreements carry authorityRevision, observerRevision, and revisionSkew', (t) => {
  const observation = satisfiedObservation(T0);
  observation.authority.services.readAuthorityWitnesses = [{
    appliedIndex: 42,
    commitIndex: 42,
    observedAtMs: T0 + 200,
    term: 3,
  }];
  observation.authority.services.rows[0].updated_at = T0 + 100;
  observation.authority.services.rows[0].updated_at_hlc =
    '1793563095000-0-services-p1-r1';
  observation.snapshots[NODE_IDS[0]].payload.capturedAt = T0 - 50;
  observation.snapshots[NODE_IDS[0]].payload.controlPlaneDiagnostics
    .tableRevisionWatermarks = {
      services: {
        lastAuthoritativeAppliedIndex: 40,
        lastOriginHlc: '1793563094000-0-services-p1-r1',
        lastSourceLogIndex: 40,
      },
    };
  observation.snapshots[NODE_IDS[0]].payload.controlPlaneDiagnostics
    .publicationConvergence.priorityPartitionSummary = {
      blockedPartitions: [{
        partitionId: 'replica_operations-p1',
        readyDistinctNodeCount: 2,
        requiredDistinctNodeCount: 3,
      }],
      satisfied: false,
    };
  const evaluation = evaluateFormationObservation(observation);
  assert.equal(evaluation.disagreements.length, 1);
  const disagreement = evaluation.disagreements[0];
  assert.equal(disagreement.authorityRevision.maxAppliedIndex, 42);
  assert.equal(disagreement.authorityRevision.maxCommitIndex, 42);
  assert.equal(disagreement.authorityRevision.maxTerm, 3);
  assert.equal(disagreement.authorityRevision.maxRowTimestampMs, T0 + 100);
  assert.equal(disagreement.authorityRevision.maxOriginHlc,
    '1793563095000-0-services-p1-r1');
  assert.equal(disagreement.observerRevision.capturedAtMs, T0 - 50);
  assert.equal(disagreement.observerRevision.watermark.lastSourceLogIndex, 40);
  assert.equal(disagreement.revisionSkew, true);
  t.end();
});

test('evaluateProjectionAgreement resets episode window on pre-commit skew and authority revision advance', (t) => {
  const buildDisagreeingPoll = ({
    appliedIndex,
    capturedAtMs,
    observerCapturedAtMs,
    rowUpdatedAtMs,
  }) => {
    const observation = satisfiedObservation(capturedAtMs);
    observation.authority.services.readAuthorityWitnesses = [{
      appliedIndex,
      commitIndex: appliedIndex,
      observedAtMs: capturedAtMs,
      term: 2,
    }];
    observation.authority.services.rows[0].updated_at = rowUpdatedAtMs;
    observation.snapshots[NODE_IDS[0]].payload.capturedAt =
      observerCapturedAtMs;
    observation.snapshots[NODE_IDS[0]].payload.controlPlaneDiagnostics
      .publicationConvergence.priorityPartitionSummary = {
        blockedPartitions: [{
          partitionId: 'replica_operations-p1',
          readyDistinctNodeCount: 2,
          requiredDistinctNodeCount: 3,
        }],
        satisfied: false,
      };
    return evaluateFormationObservation(observation);
  };

  // Pre-commit observer snapshot at T0 (observer captured at T0 - 200 before
  // row commit at T0 + 100), followed by first post-commit poll at T0 + 1200:
  // does not fail because T0 + 1200 is the first post-commit observation.
  const preCommitPoll = buildDisagreeingPoll({
    appliedIndex: 10,
    capturedAtMs: T0,
    observerCapturedAtMs: T0 - 200,
    rowUpdatedAtMs: T0 + 100,
  });
  const firstPostCommitPoll = buildDisagreeingPoll({
    appliedIndex: 10,
    capturedAtMs: T0 + 1200,
    observerCapturedAtMs: T0 + 1200,
    rowUpdatedAtMs: T0 + 100,
  });
  assert.equal(
    evaluateProjectionAgreement([preCommitPoll, firstPostCommitPoll]).met,
    true,
  );

  // Authority revision advances at T0 + 2100 (within 900ms of T0 + 1200):
  // resets the episode window for the new revision.
  const advancedRevisionPoll = buildDisagreeingPoll({
    appliedIndex: 11,
    capturedAtMs: T0 + 2100,
    observerCapturedAtMs: T0 + 2100,
    rowUpdatedAtMs: T0 + 2050,
  });
  assert.equal(
    evaluateProjectionAgreement([
      preCommitPoll,
      firstPostCommitPoll,
      advancedRevisionPoll,
    ]).met,
    true,
  );

  // Static authority revision 11 still disagreeing 1500ms later fails (g).
  const persistentOnRevision11 = buildDisagreeingPoll({
    appliedIndex: 11,
    capturedAtMs: T0 + 3600,
    observerCapturedAtMs: T0 + 3600,
    rowUpdatedAtMs: T0 + 2050,
  });
  const failed = evaluateProjectionAgreement([
    preCommitPoll,
    firstPostCommitPoll,
    advancedRevisionPoll,
    persistentOnRevision11,
  ]);
  assert.equal(failed.met, false);
  assert.equal(failed.detail.persistent[0].firstAuthorityRevision
    .maxAppliedIndex, 11);
  assert.equal(failed.detail.persistent[0].latestAuthorityRevision
    .maxAppliedIndex, 11);
  assert.equal(failed.detail.persistent[0].longestSpanMs, 1500);
  t.end();
});
