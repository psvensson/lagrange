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
  createAdminQueryResultMessageEnvelope,
} from '../../../../src/admin/admin-query-result-message-envelope.js';
import {
  AuthoritativeControlPlaneView,
} from '../../../../src/control-plane/authoritative-control-plane-view.js';
import {
  INVESTIGATION_TARGET,
} from '../fresh-formation-disagreement-evidence.js';
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

function witnessedAuthorityRead(tableName, rows, observedAtMs = T0) {
  const partitionId = `${tableName}-p1`;
  const servingReplicaId = `${partitionId}-r1`;
  const witness = {
    appliedIndex: 42,
    commitIndex: 42,
    nodeId: NODE_IDS[0],
    observedAtMs,
    partitionId,
    role: 'leader',
    servingNodeId: NODE_IDS[0],
    servingReplicaId,
    state: 'observed',
    term: 3,
  };
  return {
    authoritativeObservation: {
      appliedIndex: 42,
      commitIndex: 42,
      maxAppliedIndex: 42,
      maxCommitIndex: 42,
      maxTerm: 3,
      observedAtMs,
      partitionId,
      rowSetComplete: true,
      scope: 'complete_table',
      servingNodeId: NODE_IDS[0],
      servingReplicaId,
      tableName,
      term: 3,
    },
    complete: true,
    readAuthorityWitness: witness,
    readAuthorityWitnesses: [witness],
    rowSetComplete: true,
    rows,
    tableName,
  };
}

// The recorded state at one capture instant, in the scenario's observation
// shape. No snapshot was captured: every observer's read is the recorded
// failure (seed) or absent (joiners).
function recordedObservation(capture, capturedAtIso) {
  const cache = cacheDumpOf(capture);
  const capturedAtMs = Date.parse(capturedAtIso);
  const snapshots = {};
  for (const nodeId of NODE_IDS) {
    snapshots[nodeId] = {error: nodeId === NODE_IDS[0] ? SNAPSHOT_ERROR :
      'not_captured', payload: null};
  }
  return {
    authority: {
      partitions: witnessedAuthorityRead(
        'partitions',
        cache.partitions,
        capturedAtMs,
      ),
      replicaOperations: witnessedAuthorityRead(
        'replica_operations',
        cache.replica_operations,
        capturedAtMs,
      ),
      services: witnessedAuthorityRead(
        'services',
        cache.services,
        capturedAtMs,
      ),
    },
    capturedAtMs,
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
    partitions: witnessedAuthorityRead('partitions', partitions),
    replicaOperations: witnessedAuthorityRead('replica_operations', [{
      operation_id: 'op-1',
      partition_id: 'replica_operations-p1',
      status: 'removed',
      type: 'REMOVE',
      workflow_step: 'REMOVED',
    }]),
    services: witnessedAuthorityRead('services', services),
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

test('disagreements carry projectionRevision, authorityWatermark, authorityRevision, observerRevision, and revisionSkew as diagnostic metadata', (t) => {
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
        tableMutationRevision: 7,
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
  assert.equal(disagreement.projectionRevision, 7);
  assert.equal(disagreement.authorityWatermark.maxAppliedIndex, 42);
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

test('evaluateProjectionAgreement preserves firstSeenAtMs across projectionRevision advances and fails any disagreement lasting > 1000ms', (t) => {
  const buildDisagreeingPoll = ({
    appliedIndex,
    capturedAtMs,
    observerCapturedAtMs,
    projectionRevision,
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
      .tableRevisionWatermarks = {
        services: {
          lastAuthoritativeAppliedIndex: appliedIndex,
          lastSourceLogIndex: appliedIndex,
          tableMutationRevision: projectionRevision,
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
    return evaluateFormationObservation(observation);
  };

  const pollAtT0 = buildDisagreeingPoll({
    appliedIndex: 10,
    capturedAtMs: T0,
    observerCapturedAtMs: T0 - 200,
    projectionRevision: 5,
    rowUpdatedAtMs: T0 + 100,
  });
  const pollAtT800 = buildDisagreeingPoll({
    appliedIndex: 11,
    capturedAtMs: T0 + 800,
    observerCapturedAtMs: T0 + 800,
    projectionRevision: 8,
    rowUpdatedAtMs: T0 + 750,
  });
  assert.equal(
    evaluateProjectionAgreement([pollAtT0, pollAtT800]).met,
    true,
  );

  // Even when projectionRevision and authorityWatermark advance due to
  // unrelated services table activity, firstSeenAtMs stays anchored at T0 and
  // the disagreement at T0 + 1200ms (> 1000ms) fails g-projection-agrees-with-authority.
  const pollAtT1200 = buildDisagreeingPoll({
    appliedIndex: 12,
    capturedAtMs: T0 + 1200,
    observerCapturedAtMs: T0 + 1200,
    projectionRevision: 14,
    rowUpdatedAtMs: T0 + 1150,
  });
  const failed = evaluateProjectionAgreement([
    pollAtT0,
    pollAtT800,
    pollAtT1200,
  ]);
  assert.equal(failed.met, false);
  assert.deepEqual(failed.reasonCodes, [
    `persistent_disagreement:priority_spread:${NODE_IDS[0]}:` +
      'replica_operations-p1',
  ]);
  const persistent = failed.detail.persistent[0];
  assert.equal(persistent.firstSeenAtMs, T0);
  assert.equal(persistent.longestSpanMs, 1200);
  assert.equal(persistent.firstObserverCapturedAtMs, T0 - 200);
  assert.equal(persistent.latestObserverCapturedAtMs, T0 + 1200);
  assert.equal(persistent.observerSpanMs, 1400);
  assert.equal(persistent.firstProjectionRevision, 5);
  assert.equal(persistent.latestProjectionRevision, 14);
  assert.equal(persistent.projectionRevision, 14);
  assert.equal(persistent.authorityWatermark.maxAppliedIndex, 12);
  assert.equal(persistent.lastEntry.projectionRevision, 14);
  assert.equal(persistent.lastEntry.authorityWatermark.maxAppliedIndex, 12);
  t.end();
});

test('authoritativePrioritySpread requires canonical voter holder readiness while user-table routability keeps active services semantics', (t) => {
  const observation = satisfiedObservation(T0);
  const nonVoterTarget = arrayFind(
    observation.authority.services.rows,
    (row) => row.partition_id === 'replica_operations-p1' &&
      row.node_id === NODE_IDS[2],
  );
  nonVoterTarget.raft_role = null;
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
  assert.ok(arrayIncludes(
    spread.reasonCodes,
    'authority_not_spread:replica_operations-p1:2/3',
  ));
  assert.equal(
    evaluation.disagreements.length,
    0,
    'authority and observer projection both exclude active priority replica with raft_role: null',
  );

  const routable = evaluateUserTableRoutability({
    countProbe: {rows: [{cnt: 0}]},
    create: {contractState: 'ready', reasonCodes: []},
    partitions: {rows: [{
      leader_node_id: NODE_IDS[0],
      partition_id: 'tbl-x-p1',
      replica_count: 3,
      table_name: 'ffr_probe',
    }]},
    services: {rows: arrayMap(NODE_IDS, (nodeId, index) => ({
      address: `${nodeId}/partition/tbl-x-p1-r${index + 1}`,
      node_id: nodeId,
      partition_id: 'tbl-x-p1',
      raft_role: null,
      service_id: `tbl-x-p1-r${index + 1}`,
      service_type: 'partition',
      status: 'active',
    }))},
    tableName: 'ffr_probe',
    tables: {rows: [{table_name: 'ffr_probe'}]},
  });
  assert.equal(routable.met, true);
  t.end();
});

test('disagreements retain authority/observer cache rows, versions, decisions, watermarks, repair changedRowIds, and discriminate investigationTarget', (t) => {
  const targetPartitionId = 'replica_operations-p1';
  const buildDisagreeingObservation = () => {
    const observation = satisfiedObservation(T0);
    observation.authority.services.complete = true;
    observation.authority.services.rowSetComplete = true;
    observation.authority.services.readAuthorityWitnesses = [{
      appliedIndex: 55,
      commitIndex: 55,
      nodeId: NODE_IDS[0],
      observedAtMs: T0,
      partitionId: 'services-p1',
      role: 'leader',
      servingNodeId: NODE_IDS[0],
      servingReplicaId: 'services-p1-r1',
      state: 'observed',
      term: 4,
    }];
    observation.authority.services.authoritativeObservation = {
      appliedIndex: 55,
      commitIndex: 55,
      maxAppliedIndex: 55,
      maxCommitIndex: 55,
      maxTerm: 4,
      observedAtMs: T0,
      partitionId: 'services-p1',
      rowSetComplete: true,
      scope: 'complete_table',
      servingNodeId: NODE_IDS[0],
      servingReplicaId: 'services-p1-r1',
      tableName: 'services',
      term: 4,
    };
    for (const row of observation.authority.services.rows) {
      if (row.partition_id === targetPartitionId) {
        row.updated_at = T0 - 10;
        row.origin_hlc = '1793563095000-0-services-p1-r1';
      }
    }
    const authPartitionRow = arrayFind(
      observation.authority.partitions.rows,
      (row) => row.partition_id === targetPartitionId,
    );
    const authServiceRows = arrayFilter(
      observation.authority.services.rows,
      (row) => row.partition_id === targetPartitionId,
    );
    const diagnostics = observation.snapshots[NODE_IDS[0]].payload
      .controlPlaneDiagnostics;
    diagnostics.tableRevisionWatermarks = {
      services: {
        lastAuthoritativeAppliedIndex: 55,
        lastOriginHlc: '1793563095000-0-services-p1-r1',
        lastSourceLogIndex: 55,
        tableMutationRevision: 9,
      },
    };
    diagnostics.currentPriorityPlacementObservation = {
      rowsByPartitionId: {
        [targetPartitionId]: {
          partitionRow: {...authPartitionRow},
          serviceRows: arrayMap(authServiceRows, (row) => ({...row})),
        },
      },
    };
    diagnostics.publicationConvergence.priorityPartitionSummary = {
      blockedPartitions: [{
        partitionId: targetPartitionId,
        readyDistinctNodeCount: 2,
        requiredDistinctNodeCount: 3,
      }],
      satisfied: false,
    };
    return observation;
  };

  // 1. Missing valid completeness/receipt -> Oracle provenance
  const missingReceiptObs = buildDisagreeingObservation();
  missingReceiptObs.authority.services.readAuthorityWitnesses = [];
  const missingReceiptEval = evaluateFormationObservation(missingReceiptObs);
  assert.equal(missingReceiptEval.disagreements.length, 1);
  assert.equal(
    missingReceiptEval.disagreements[0].authorityProvenance.validReceipt,
    false,
  );
  assert.equal(
    missingReceiptEval.disagreements[0].investigationTarget,
    INVESTIGATION_TARGET.ORACLE_PROVENANCE,
  );

  // 1b. Synthetic {term: 0} witness or missing authoritativeObservation -> Oracle provenance
  const zeroTermObs = buildDisagreeingObservation();
  zeroTermObs.authority.services.readAuthorityWitnesses = [{
    appliedIndex: 0,
    commitIndex: 0,
    observedAtMs: T0,
    partitionId: 'services-p1',
    role: 'leader',
    servingNodeId: NODE_IDS[0],
    servingReplicaId: 'services-p1-r1',
    state: 'observed',
    term: 0,
  }];
  const zeroTermEval = evaluateFormationObservation(zeroTermObs);
  assert.equal(
    zeroTermEval.disagreements[0].authorityProvenance.validReceipt,
    false,
  );
  assert.equal(
    zeroTermEval.disagreements[0].investigationTarget,
    INVESTIGATION_TARGET.ORACLE_PROVENANCE,
  );

  // 2. Valid authority row newer than cache -> Publication, delivery or cache application
  const staleCacheObs = buildDisagreeingObservation();
  const cachedTargetRows = staleCacheObs.snapshots[NODE_IDS[0]].payload
    .controlPlaneDiagnostics.currentPriorityPlacementObservation
    .rowsByPartitionId[targetPartitionId];
  cachedTargetRows.serviceRows[2].raft_role = null;
  cachedTargetRows.serviceRows[2].updated_at = T0 - 500;
  cachedTargetRows.serviceRows[2].origin_hlc =
    '1793563094000-0-services-p1-r1';
  const staleCacheEval = evaluateFormationObservation(staleCacheObs);
  const staleDisagreement = staleCacheEval.disagreements[0];
  assert.equal(staleDisagreement.authorityProvenance.validReceipt, true);
  assert.equal(
    staleDisagreement.authorityRows.serviceRows.length,
    3,
  );
  assert.equal(
    staleDisagreement.authorityRowVersion.maxOriginHlc,
    '1793563095000-0-services-p1-r1',
  );
  assert.equal(
    staleDisagreement.observerCacheRowVersion.byRowId[
      `${targetPartitionId}-r3`
    ].maxOriginHlc,
    '1793563094000-0-services-p1-r1',
  );
  assert.equal(staleDisagreement.derivedDecision.authority.satisfied, true);
  assert.equal(
    staleDisagreement.derivedDecision.observerCache.satisfied,
    false,
  );
  assert.equal(
    staleDisagreement.derivedDecision.observerProjection.satisfied,
    false,
  );
  assert.equal(
    staleDisagreement.deliveryApplicationWatermark.watermark
      .tableMutationRevision,
    9,
  );
  assert.equal(
    staleDisagreement.investigationTarget,
    INVESTIGATION_TARGET.PUBLICATION_DELIVERY_OR_CACHE_APPLICATION,
  );

  // 3. Same relevant cache fields, different decision -> Projection invalidation or reuse
  const staleProjectionObs = buildDisagreeingObservation();
  const staleProjectionEval = evaluateFormationObservation(staleProjectionObs);
  const projectionDisagreement = staleProjectionEval.disagreements[0];
  assert.equal(
    projectionDisagreement.derivedDecision.authority.satisfied,
    true,
  );
  assert.equal(
    projectionDisagreement.derivedDecision.observerCache.satisfied,
    true,
  );
  assert.equal(
    projectionDisagreement.derivedDecision.observerProjection.satisfied,
    false,
  );
  assert.equal(
    projectionDisagreement.investigationTarget,
    INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE,
  );

  // 4. Snapshot acquisition changes state -> Observer purity
  const impureObs = buildDisagreeingObservation();
  impureObs.snapshots[NODE_IDS[0]].payload.authoritativeRepair = {
    changedRowIds: [`services:${targetPartitionId}-r3`],
    repaired: true,
    repairedTables: ['services'],
  };
  const impureEval = evaluateFormationObservation(impureObs);
  const impureDisagreement = impureEval.disagreements[0];
  assert.deepEqual(
    impureDisagreement.repairChangedRowIds,
    [`services:${targetPartitionId}-r3`],
  );
  assert.equal(
    impureDisagreement.investigationTarget,
    INVESTIGATION_TARGET.OBSERVER_PURITY,
  );
  t.end();
});

test('evaluateProjectionAgreement preserves both 1,393 ms and 1,336 ms failures and retains per-disagreement evidence on persistent entries', (t) => {
  const buildPoll = (capturedAtMs, blockedNodeId, partitionId) => {
    const observation = satisfiedObservation(capturedAtMs);
    observation.authority.services.complete = true;
    observation.authority.services.rowSetComplete = true;
    observation.authority.services.readAuthorityWitnesses = [{
      appliedIndex: 70,
      commitIndex: 70,
      observedAtMs: capturedAtMs,
      partitionId: 'services-p1',
      role: 'leader',
      servingNodeId: NODE_IDS[0],
      servingReplicaId: 'services-p1-r1',
      state: 'observed',
      term: 3,
    }];
    observation.authority.services.authoritativeObservation = {
      appliedIndex: 70,
      commitIndex: 70,
      maxAppliedIndex: 70,
      maxCommitIndex: 70,
      maxTerm: 3,
      observedAtMs: capturedAtMs,
      partitionId: 'services-p1',
      rowSetComplete: true,
      scope: 'complete_table',
      servingNodeId: NODE_IDS[0],
      servingReplicaId: 'services-p1-r1',
      tableName: 'services',
      term: 3,
    };
    observation.snapshots[blockedNodeId].payload.capturedAt = capturedAtMs;
    observation.snapshots[blockedNodeId].payload.controlPlaneDiagnostics
      .publicationConvergence.priorityPartitionSummary = {
        blockedPartitions: [{
          partitionId,
          readyDistinctNodeCount: 2,
          requiredDistinctNodeCount: 3,
        }],
        satisfied: false,
      };
    return evaluateFormationObservation(observation);
  };

  const eval1393 = evaluateProjectionAgreement([
    buildPoll(T0, NODE_IDS[0], 'control_plane_publications-p1'),
    buildPoll(T0 + 1393, NODE_IDS[0], 'control_plane_publications-p1'),
  ]);
  assert.equal(eval1393.met, false);
  assert.equal(eval1393.detail.persistent[0].longestSpanMs, 1393);
  assert.equal(eval1393.detail.persistent[0].observerSpanMs, 1393);
  assert.equal(
    eval1393.detail.persistent[0].authorityProvenance.validReceipt,
    true,
  );
  assert.equal(
    eval1393.detail.persistent[0].authorityRows.serviceRows.length,
    3,
  );

  const eval1336 = evaluateProjectionAgreement([
    buildPoll(T0, NODE_IDS[2], 'sql_write_operations-p1'),
    buildPoll(T0 + 1336, NODE_IDS[2], 'sql_write_operations-p1'),
  ]);
  assert.equal(eval1336.met, false);
  assert.equal(eval1336.detail.persistent[0].longestSpanMs, 1336);
  assert.equal(eval1336.detail.persistent[0].observerSpanMs, 1336);
  assert.equal(
    eval1336.detail.persistent[0].authorityProvenance.validReceipt,
    true,
  );
  assert.equal(
    eval1336.detail.persistent[0].authorityRows.serviceRows.length,
    3,
  );
  t.end();
});

test('end-to-end authority transport preserves rowSetComplete, leader witness, and authoritativeObservation across AuthoritativeControlPlaneView and admin query envelope', async (_t) => {
  const observation = satisfiedObservation(T0);
  observation.snapshots[NODE_IDS[0]].payload.controlPlaneDiagnostics
    .publicationConvergence.priorityPartitionSummary = {
      blockedPartitions: [{
        partitionId: 'replica_operations-p1',
        readyDistinctNodeCount: 2,
        requiredDistinctNodeCount: 3,
      }],
      satisfied: false,
    };

  const toOracleRead = (envelope) => ({
    authoritativeObservation: envelope.authoritativeObservation ?? null,
    complete: envelope.rowSetComplete === true,
    partitions: envelope.partitions ?? null,
    readAuthorityWitness: envelope.readAuthorityWitness ?? null,
    readAuthorityWitnesses: envelope.readAuthorityWitnesses ?? null,
    rowSetComplete: envelope.rowSetComplete === true,
    rows: envelope.results,
  });

  // 1. Incomplete result with count === rows.length stays incomplete across view + envelope
  const incompleteView = new AuthoritativeControlPlaneView({
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          count: observation.authority.services.rows.length,
          rowSetComplete: false,
          rows: observation.authority.services.rows,
          source: 'local_partition_replica',
          success: true,
        };
      },
    },
    nodeId: NODE_IDS[0],
  });
  const incompleteViewResult = await incompleteView.readRows(
    'services',
    'SELECT * FROM services',
    [],
  );
  const incompleteEnvelope = createAdminQueryResultMessageEnvelope(
    'q-incomplete',
    incompleteViewResult,
  );
  const incompleteObs = satisfiedObservation(T0);
  incompleteObs.authority.services = toOracleRead(incompleteEnvelope);
  incompleteObs.snapshots = observation.snapshots;
  const incompleteEval = evaluateFormationObservation(incompleteObs);
  assert.equal(incompleteEnvelope.rowSetComplete, false);
  assert.equal(
    incompleteEval.disagreements[0].authorityProvenance.validReceipt,
    false,
  );
  assert.equal(
    incompleteEval.disagreements[0].investigationTarget,
    INVESTIGATION_TARGET.ORACLE_PROVENANCE,
  );

  // 2. Complete leader-witnessed result with bound authoritativeObservation survives view + envelope
  const leaderWitness = {
    appliedIndex: 88,
    commitIndex: 88,
    observedAtMs: T0,
    partitionId: 'services-p1',
    role: 'leader',
    servingNodeId: NODE_IDS[0],
    servingReplicaId: 'services-p1-r1',
    state: 'observed',
    term: 5,
  };
  const boundObservation = {
    appliedIndex: 88,
    commitIndex: 88,
    maxAppliedIndex: 88,
    maxCommitIndex: 88,
    maxTerm: 5,
    observedAtMs: T0,
    partitionId: 'services-p1',
    rowSetComplete: true,
    scope: 'complete_table',
    servingNodeId: NODE_IDS[0],
    servingReplicaId: 'services-p1-r1',
    tableName: 'services',
    term: 5,
  };
  const completeView = new AuthoritativeControlPlaneView({
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          authoritativeObservation: boundObservation,
          count: observation.authority.services.rows.length,
          readAuthorityWitness: leaderWitness,
          readAuthorityWitnesses: [leaderWitness],
          rowSetComplete: true,
          rows: observation.authority.services.rows,
          source: 'local_partition_replica',
          success: true,
        };
      },
    },
    nodeId: NODE_IDS[0],
  });
  const completeViewResult = await completeView.readRows(
    'services',
    'SELECT * FROM services',
    [],
  );
  const completeEnvelope = createAdminQueryResultMessageEnvelope(
    'q-complete',
    completeViewResult,
  );
  const completeObs = satisfiedObservation(T0);
  completeObs.authority.services = toOracleRead(completeEnvelope);
  completeObs.snapshots = observation.snapshots;
  const completeEval = evaluateFormationObservation(completeObs);
  assert.equal(completeEnvelope.rowSetComplete, true);
  assert.equal(
    completeEval.disagreements[0].authorityProvenance.validReceipt,
    true,
  );
  assert.equal(
    completeEval.disagreements[0].investigationTarget,
    INVESTIGATION_TARGET.PROJECTION_INVALIDATION_OR_REUSE,
  );

  // 3. Mismatched receipt/witness identity or missing provenance is rejected
  const mismatchedObs = satisfiedObservation(T0);
  mismatchedObs.snapshots = observation.snapshots;
  mismatchedObs.authority.services = {
    ...toOracleRead(completeEnvelope),
    authoritativeObservation: {
      ...boundObservation,
      servingNodeId: NODE_IDS[1],
    },
  };
  const mismatchedEval = evaluateFormationObservation(mismatchedObs);
  assert.equal(
    mismatchedEval.disagreements[0].authorityProvenance.validReceipt,
    false,
  );
  assert.equal(
    mismatchedEval.disagreements[0].investigationTarget,
    INVESTIGATION_TARGET.ORACLE_PROVENANCE,
  );

  const missingProvenanceObs = satisfiedObservation(T0);
  missingProvenanceObs.authority = {
    partitions: {
      complete: true,
      rows: missingProvenanceObs.authority.partitions.rows,
    },
    replicaOperations: {
      complete: true,
      rows: missingProvenanceObs.authority.replicaOperations.rows,
    },
    services: {
      complete: true,
      rows: missingProvenanceObs.authority.services.rows,
    },
  };
  const missingProvenanceEval = evaluateFormationObservation(
    missingProvenanceObs,
  );
  assert.equal(missingProvenanceEval.satisfied, false);
  assert.ok(
    arrayIncludes(
      predicateById(missingProvenanceEval, PREDICATE.PRIORITY_SPREAD)
        .reasonCodes,
      'services_observation_incomplete',
    ),
  );
  assert.ok(
    arrayIncludes(
      predicateById(missingProvenanceEval, PREDICATE.LEDGER_QUIET).reasonCodes,
      'replica_operations_observation_incomplete',
    ),
  );
});
