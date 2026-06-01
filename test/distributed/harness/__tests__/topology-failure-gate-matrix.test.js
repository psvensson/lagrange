import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {CANONICAL_SCENARIO_MATRIX} from '../scenario-registry.js';
import {
  REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS,
  TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS,
  TOPOLOGY_FAILURE_GATE_DIMENSION,
  TOPOLOGY_FAILURE_GATE_MATRIX,
  buildTopologyFailureGateCoverageSnapshot,
  buildTopologyFailureGateExecutionPlan,
  formatTopologyFailureGateExecutionLines,
  formatTopologyFailureGateMatrixLines,
  hasTopologyFailureGateBoundedProgressMechanism,
  hasTopologyFailureGateDurableAssertions,
  listTopologyFailureGateEntries,
  listRequiredTopologyFailureGateDimensions,
  normalizeTopologyFailureGateConfigName,
} from '../topology-failure-gate-matrix.js';

const EXPECTED_FAILURE_GATE_COUNT = 10;
const EXECUTION_PLAN_RUN_ID = '20260514T000000Z';
const EXPECTED_LOCAL_GATE_IDS = [
  'failure-injection-leader-kill-during-dispatch',
  'join-killed-node-under-load',
  'rejoin-killed-seed-under-load',
  'slow-network-publication-visible-or-retained',
];
const EXPECTED_LOCAL_THREE_NODE_GATE_IDS = [
  'failure-detection-rolling-restart',
  'remote-handoff-missed-ack',
  'stale-evidence-snapshot-coverage-monotonic',
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
  'splitTargetPackage',
];
const EXPECTED_COVERAGE_BY_DIMENSION = {
  failure_detection: ['failure-detection-rolling-restart'],
  failure_injection: ['failure-injection-leader-kill-during-dispatch'],
  join: ['join-killed-node-under-load'],
  rejoin: ['rejoin-killed-seed-under-load'],
  remote_handoff: [
    'remote-handoff-replica-operation-coordinator',
    'remote-handoff-missed-ack',
  ],
  slow_network: ['slow-network-publication-visible-or-retained'],
  stale_evidence: ['stale-evidence-snapshot-coverage-monotonic'],
  stale_publication: ['stale-publication-durable-truth-ahead'],
  rebalance_disruption: ['rebalance-disruption-split-during-recovery'],
};
const EXPECTED_MATRIX_LINES = [
  'local-three-node.json|rolling-restart|' +
    'failure-detection-rolling-restart|failure_detection|' +
    'topology_control_plane|failure_detection_repair_intent|' +
    'node_lifecycle_repair_intent_reconciled',
  'local.json|partition-kill-heal-under-load|' +
    'failure-injection-leader-kill-during-dispatch|' +
    'failure_injection|operation_workflow_owner|operation_progress|' +
    'every_dispatched_operation_reaches_terminal_bound',
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
  'local.json|slow-follower-under-load|' +
    'slow-network-publication-visible-or-retained|slow_network|' +
    'topology_publication_owner|publication_visibility_retry|' +
    'every_accepted_publication_visible_or_retained',
  'local-three-node.json|write-ack-visibility|' +
    'stale-evidence-snapshot-coverage-monotonic|stale_evidence|' +
    'startup_active_gate_owner|snapshot_coverage|' +
    'snapshot_coverage_monotonic_under_no_failure',
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
const EXPECTED_FIRST_EXECUTION_ARGS = [
  'test/distributed/run.js',
  '--config',
  'test/distributed/config/local-three-node.json',
  '--scenario',
  'rolling-restart',
  '--output',
  'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'failure-detection-rolling-restart.report.json',
];
const EXPECTED_EXECUTION_LINES = [
  'failure-detection-rolling-restart|local-three-node.json|' +
    'rolling-restart|test-output/reports/topology-failure-gates/' +
    '20260514T000000Z/failure-detection-rolling-restart.report.json|' +
    'topology_control_plane|failure_detection_repair_intent|' +
    '_legacy_work/packages/todo-20260514-topology-failure-detection-repair-gate.md|' +
    'active_gate_active_nodes_5_of_5,snapshot_coverage_5_of_5,' +
    'missing_published_zero,no_priority_recovery_event_driven_wait,' +
    'failure_repair_intent_consumed',
  'failure-injection-leader-kill-during-dispatch|local.json|' +
    'partition-kill-heal-under-load|test-output/reports/' +
    'topology-failure-gates/20260514T000000Z/' +
    'failure-injection-leader-kill-during-dispatch.report.json|' +
    'operation_workflow_owner|operation_progress|' +
    '_legacy_work/packages/todo-20260520-topology-leader-kill-during-dispatch-gate.md|' +
    'IV-OP-1,durable_operation_replay,workflow_terminal_status',
  'join-killed-node-under-load|local.json|node-join-under-load|' +
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'join-killed-node-under-load.report.json|topology_join_owner|' +
    'join_admission_rebalance|' +
    '_legacy_work/packages/todo-20260514-topology-killed-join-gate.md|' +
    'durable_join_intent_recorded,membership_epoch_fenced,' +
    'rebalance_repair_converged,active_admission_owner_truth',
  'rejoin-killed-seed-under-load|local.json|seed-restart-under-load|' +
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'rejoin-killed-seed-under-load.report.json|topology_rejoin_owner|' +
    'post_restore_reconciliation|' +
    '_legacy_work/packages/todo-20260514-topology-killed-rejoin-gate.md|' +
    'restored_member_rediscovered,post_restore_reconciliation_completed,' +
    'local_services_rearmed,active_admission_owner_truth',
  'remote-handoff-replica-operation-coordinator|' +
    'local-benchmark-7node.json|' +
    'seven-node-read-write-load-transaction-recovery|' +
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'remote-handoff-replica-operation-coordinator.report.json|' +
    'operation_workflow_owner|replica_operation_coordinator_handoff|' +
    '_legacy_work/packages/todo-20260514-topology-remote-coordinator-handoff-gate.md|' +
    'durable_operation_replay,remote_wakeup_recorded,' +
    'ack_or_timeout_terminal,workflow_terminal_status',
  'remote-handoff-missed-ack|local-three-node.json|write-ack-visibility|' +
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'remote-handoff-missed-ack.report.json|topology_publication_owner|' +
    'remote_handoff_ack_closure|' +
    '_legacy_work/packages/todo-20260514-topology-missed-handoff-ack-gate.md|' +
    'ack_absence_detected,retry_or_terminal_degraded,' +
    'publication_closure_fenced',
  'slow-network-publication-visible-or-retained|local.json|' +
    'slow-follower-under-load|test-output/reports/topology-failure-gates/' +
    '20260514T000000Z/' +
    'slow-network-publication-visible-or-retained.report.json|' +
    'topology_publication_owner|publication_visibility_retry|' +
    '_legacy_work/packages/todo-20260520-topology-slow-network-publication-gate.md|' +
    'IV-PUB-1,retry_or_terminal_degraded,publication_closure_fenced',
  'stale-evidence-snapshot-coverage-monotonic|local-three-node.json|' +
    'write-ack-visibility|test-output/reports/topology-failure-gates/' +
    '20260514T000000Z/' +
    'stale-evidence-snapshot-coverage-monotonic.report.json|' +
    'startup_active_gate_owner|snapshot_coverage|' +
    '_legacy_work/packages/todo-20260520-topology-stale-evidence-snapshot-coverage-gate.md|' +
    'IV-COV-1,snapshot_coverage_5_of_5,stale_projection_detected',
  'stale-publication-durable-truth-ahead|local-three-node.json|' +
    'write-ack-visibility|test-output/reports/topology-failure-gates/' +
    '20260514T000000Z/stale-publication-durable-truth-ahead.report.json|' +
    'topology_publication_owner|publication_truth_ahead_of_projection|' +
    '_legacy_work/packages/todo-20260514-topology-stale-publication-durable-truth-gate.md|' +
    'durable_owner_truth_selected,stale_projection_detected,' +
    'owner_key_reconcile_scheduled',
  'rebalance-disruption-split-during-recovery|' +
    'local-benchmark-7node.json|seven-node-load-during-partitioning|' +
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
    'rebalance-disruption-split-during-recovery.report.json|' +
    'topology_rebalance_owner|split_rebalance_during_recovery|' +
    '_legacy_work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md|' +
    'descriptor_epoch_fenced,capacity_degraded_accounting,' +
    'anti_entropy_owner_key_repair,final_placement_convergence',
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
      TOPOLOGY_FAILURE_GATE_DIMENSION.FAILURE_INJECTION,
      TOPOLOGY_FAILURE_GATE_DIMENSION.JOIN,
      TOPOLOGY_FAILURE_GATE_DIMENSION.REJOIN,
      TOPOLOGY_FAILURE_GATE_DIMENSION.REMOTE_HANDOFF,
      TOPOLOGY_FAILURE_GATE_DIMENSION.SLOW_NETWORK,
      TOPOLOGY_FAILURE_GATE_DIMENSION.STALE_EVIDENCE,
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
    assert.ok(
      hasTopologyFailureGateDurableAssertions(entry),
      `${entry.gateId} must declare durable assertions`,
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

test('topology-failure-gate-matrix builds executable gate plans', (t) => {
  const plan = buildTopologyFailureGateExecutionPlan(EXECUTION_PLAN_RUN_ID);

  assert.equal(plan.length, EXPECTED_FAILURE_GATE_COUNT);
  assert.equal(plan[0].command, 'node');
  assert.deepEqual(plan[0].args, EXPECTED_FIRST_EXECUTION_ARGS);
  assert.equal(
    plan[0].artifactPath,
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
      'failure-detection-rolling-restart.report.json',
  );
  assert.equal(
    plan[0].splitTargetPackage,
    '_legacy_work/packages/todo-20260514-topology-failure-detection-repair-gate.md',
  );
  assert.deepEqual(
    formatTopologyFailureGateExecutionLines(EXECUTION_PLAN_RUN_ID),
    EXPECTED_EXECUTION_LINES,
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
