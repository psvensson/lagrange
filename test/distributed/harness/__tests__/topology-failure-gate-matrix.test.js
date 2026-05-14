import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {CANONICAL_SCENARIO_MATRIX} from '../scenario-registry.js';
import {
  REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS,
  TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS,
  TOPOLOGY_FAILURE_GATE_DIMENSION,
  TOPOLOGY_FAILURE_GATE_MATRIX,
  buildTopologyFailureGateCoverageSnapshot,
  formatTopologyFailureGateMatrixLines,
  hasTopologyFailureGateBoundedProgressMechanism,
  listTopologyFailureGateEntries,
  listRequiredTopologyFailureGateDimensions,
  normalizeTopologyFailureGateConfigName,
} from '../topology-failure-gate-matrix.js';

const EXPECTED_FAILURE_GATE_COUNT = 7;
const EXPECTED_LOCAL_GATE_IDS = [
  'join-killed-node-under-load',
  'rejoin-killed-seed-under-load',
];
const EXPECTED_LOCAL_THREE_NODE_GATE_IDS = [
  'failure-detection-rolling-restart',
  'remote-handoff-missed-ack',
  'stale-publication-durable-truth-ahead',
];
const REQUIRED_TEXT_FIELDS = [
  'gateId',
  'dimension',
  'config',
  'scenario',
  'owner',
  'boundary',
  'expectedDurableOutcome',
  'fencingRequirement',
];
const EXPECTED_COVERAGE_BY_DIMENSION = {
  failure_detection: ['failure-detection-rolling-restart'],
  join: ['join-killed-node-under-load'],
  rejoin: ['rejoin-killed-seed-under-load'],
  remote_handoff: [
    'remote-handoff-replica-operation-coordinator',
    'remote-handoff-missed-ack',
  ],
  stale_publication: ['stale-publication-durable-truth-ahead'],
  rebalance_disruption: ['rebalance-disruption-split-during-recovery'],
};
const EXPECTED_MATRIX_LINES = [
  'local-three-node.json|rolling-restart|' +
    'failure-detection-rolling-restart|failure_detection|' +
    'topology_control_plane|failure_detection_repair_intent|' +
    'node_lifecycle_repair_intent_reconciled',
  'local.json|node-join-under-load|' +
    'join-killed-node-under-load|join|topology_join_owner|' +
    'join_admission_rebalance|joining_member_admitted_or_fenced_durably',
  'local.json|seed-restart-under-load|' +
    'rejoin-killed-seed-under-load|rejoin|topology_rejoin_owner|' +
    'post_restore_reconciliation|' +
    'rejoined_member_validated_against_durable_topology',
  'local-benchmark-7node.json|' +
    'seven-node-read-write-load-transaction-recovery|' +
    'remote-handoff-replica-operation-coordinator|remote_handoff|' +
    'operation_workflow_owner|replica_operation_coordinator_handoff|' +
    'in_flight_coordinator_handoff_reaches_terminal_workflow_status',
  'local-three-node.json|write-ack-visibility|' +
    'remote-handoff-missed-ack|remote_handoff|' +
    'topology_publication_owner|remote_handoff_ack_closure|' +
    'missed_handoff_ack_retried_before_publication_closes',
  'local-three-node.json|write-ack-visibility|' +
    'stale-publication-durable-truth-ahead|stale_publication|' +
    'topology_publication_owner|publication_truth_ahead_of_projection|' +
    'durable_acked_write_truth_outranks_stale_publication_projection',
  'local-benchmark-7node.json|seven-node-load-during-partitioning|' +
    'rebalance-disruption-split-during-recovery|' +
    'rebalance_disruption|topology_rebalance_owner|' +
    'split_rebalance_during_recovery|' +
    'split_rebalance_drains_and_converges_durable_placement',
];
const MIN_TEXT_LENGTH = 1;
const MIN_REASON_COUNT = 1;

function scenarioKey(entry) {
  return `${entry.config}|${entry.name}`;
}

function gateScenarioKey(entry) {
  return `${entry.config}|${entry.scenario}`;
}

test('topology-failure-gate-matrix covers required dimensions', (t) => {
  assert.equal(TOPOLOGY_FAILURE_GATE_MATRIX.length, EXPECTED_FAILURE_GATE_COUNT);
  assert.deepEqual(
    listRequiredTopologyFailureGateDimensions(),
    REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS,
  );

  const coverage = buildTopologyFailureGateCoverageSnapshot();
  assert.equal(coverage.gateCount, EXPECTED_FAILURE_GATE_COUNT);
  assert.deepEqual(
    coverage.requiredDimensions,
    [
      TOPOLOGY_FAILURE_GATE_DIMENSION.FAILURE_DETECTION,
      TOPOLOGY_FAILURE_GATE_DIMENSION.JOIN,
      TOPOLOGY_FAILURE_GATE_DIMENSION.REJOIN,
      TOPOLOGY_FAILURE_GATE_DIMENSION.REMOTE_HANDOFF,
      TOPOLOGY_FAILURE_GATE_DIMENSION.STALE_PUBLICATION,
      TOPOLOGY_FAILURE_GATE_DIMENSION.REBALANCE_DISRUPTION,
    ],
  );
  assert.deepEqual(coverage.gatesByDimension, EXPECTED_COVERAGE_BY_DIMENSION);
  t.end();
});

test('topology-failure-gate-matrix requires owner outcome fields', (t) => {
  const allowedMechanisms = new Set(
    TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS,
  );

  for (const entry of TOPOLOGY_FAILURE_GATE_MATRIX) {
    for (const field of REQUIRED_TEXT_FIELDS) {
      assert.equal(
        typeof entry[field],
        'string',
        `${entry.gateId} must declare ${field}`,
      );
      assert.ok(
        entry[field].length >= MIN_TEXT_LENGTH,
        `${entry.gateId} must not leave ${field} blank`,
      );
    }

    assert.ok(
      entry.expectedOwnerReasons.length >= MIN_REASON_COUNT,
      `${entry.gateId} must declare owner reasons`,
    );
    assert.ok(
      hasTopologyFailureGateBoundedProgressMechanism(entry),
      `${entry.gateId} must declare a bounded progress mechanism`,
    );
    assert.ok(
      entry.boundedProgressMechanisms.every((mechanism) =>
        allowedMechanisms.has(mechanism)),
      `${entry.gateId} must use canonical bounded progress vocabulary`,
    );
  }
  t.end();
});

test('topology-failure-gate-matrix maps gates to canonical scenarios', (t) => {
  const canonicalScenarioKeys = new Set(
    CANONICAL_SCENARIO_MATRIX.map(scenarioKey),
  );

  for (const entry of TOPOLOGY_FAILURE_GATE_MATRIX) {
    assert.ok(
      canonicalScenarioKeys.has(gateScenarioKey(entry)),
      `${entry.gateId} must reference a canonical scenario/config pair`,
    );
  }
  t.end();
});

test('topology-failure-gate-matrix formats stable handoff lines', (t) => {
  assert.deepEqual(
    formatTopologyFailureGateMatrixLines(),
    EXPECTED_MATRIX_LINES,
  );
  t.end();
});

test('topology-failure-gate-matrix filters gates by config basename', (t) => {
  assert.equal(
    normalizeTopologyFailureGateConfigName(
      'test/distributed/config/local.json',
    ),
    'local.json',
  );
  assert.equal(normalizeTopologyFailureGateConfigName(null), null);
  assert.deepEqual(
    listTopologyFailureGateEntries('local.json').map((entry) => entry.gateId),
    EXPECTED_LOCAL_GATE_IDS,
  );
  assert.deepEqual(
    listTopologyFailureGateEntries('local-three-node.json')
      .map((entry) => entry.gateId),
    EXPECTED_LOCAL_THREE_NODE_GATE_IDS,
  );
  t.end();
});
