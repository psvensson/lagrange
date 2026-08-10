import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  CANONICAL_SCENARIO_MATRIX,
  TOPOLOGY_FAILURE_GATE_MATRIX,
  formatCanonicalScenarioMatrixLines,
  formatCanonicalTopologyFailureGateExecutionLines,
  formatCanonicalTopologyFailureGateMatrixLines,
  listCanonicalScenarioEntries,
  listCanonicalTopologyFailureGateExecutionPlan,
  listCanonicalTopologyFailureGateEntries,
  normalizeScenarioConfigName,
  selectCanonicalScenariosForConfig,
  selectCanonicalTopologyFailureGateScenariosForConfig,
} from '../scenario-registry.js';

const EXPECTED_TOPOLOGY_FAILURE_GATE_COUNT = 10;
const EXPECTED_LOCAL_THREE_NODE_FAILURE_GATE_IDS = [
  'failure-detection-rolling-restart',
  'remote-handoff-missed-ack',
  'stale-evidence-snapshot-coverage-monotonic',
  'stale-publication-durable-truth-ahead',
];
const EXPECTED_LOCAL_THREE_NODE_FAILURE_GATE_SCENARIOS = [
  'rolling-restart',
  'write-ack-visibility',
];
const EXPECTED_FIRST_FAILURE_GATE_LINE =
  'local-three-node.json|rolling-restart|' +
  'failure-detection-rolling-restart|failure_detection|' +
  'topology_control_plane|failure_detection_repair_intent|' +
  'node_lifecycle_repair_intent_reconciled';
const EXPECTED_LAST_FAILURE_GATE_LINE =
  'local-benchmark-7node.json|seven-node-load-during-partitioning|' +
  'rebalance-disruption-split-during-recovery|rebalance_disruption|' +
  'topology_rebalance_owner|split_rebalance_during_recovery|' +
  'split_rebalance_drains_and_converges_durable_placement';
const EXECUTION_PLAN_RUN_ID = '20260514T000000Z';
const EXPECTED_FIRST_EXECUTION_LINE =
  'failure-detection-rolling-restart|local-three-node.json|' +
  'rolling-restart|test-output/reports/topology-failure-gates/' +
  '20260514T000000Z/failure-detection-rolling-restart.report.json|' +
  'topology_control_plane|failure_detection_repair_intent|' +
  '_legacy_work/packages/todo-20260514-topology-failure-detection-repair-gate.md|' +
  'active_gate_active_nodes_5_of_5,snapshot_coverage_5_of_5,' +
  'missing_published_zero,no_priority_recovery_event_driven_wait,' +
  'failure_repair_intent_consumed';
const EXPECTED_LOCAL_THREE_NODE_EXECUTION_GATE_IDS = [
  'failure-detection-rolling-restart',
  'remote-handoff-missed-ack',
  'stale-evidence-snapshot-coverage-monotonic',
  'stale-publication-durable-truth-ahead',
];

test('scenario-registry tracks the canonical 24-scenario matrix', (t) => {
  assert.equal(CANONICAL_SCENARIO_MATRIX.length, 24);
  t.end();
});

test('scenario-registry tracks the canonical topology failure gate matrix', (t) => {
  assert.equal(
    TOPOLOGY_FAILURE_GATE_MATRIX.length,
    EXPECTED_TOPOLOGY_FAILURE_GATE_COUNT,
  );

  const entries = listCanonicalTopologyFailureGateEntries(
    'test/distributed/config/local-three-node.json',
  );
  assert.deepEqual(
    entries.map((entry) => entry.gateId),
    EXPECTED_LOCAL_THREE_NODE_FAILURE_GATE_IDS,
  );
  t.end();
});

test('scenario-registry normalizes config basenames from paths', (t) => {
  assert.equal(
    normalizeScenarioConfigName('test/distributed/config/local.json'),
    'local.json',
  );
  assert.equal(
    normalizeScenarioConfigName('local-three-node.json'),
    'local-three-node.json',
  );
  assert.equal(normalizeScenarioConfigName(null), null);
  t.end();
});

test('scenario-registry lists canonical entries for a specific config', (t) => {
  const entries = listCanonicalScenarioEntries('local-three-node.json');

  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [
      'admin-query-smoke',
      'examples-catalog',
      'network-partition-split-brain',
      'node-failure-rebalance',
      'public-path-multinode-baseline',
      'rolling-restart',
      'three-node-seed-rebalance',
      'user-table-leader-placement-spread',
      'wasm-service-failover',
      'write-ack-visibility',
    ],
  );
  t.end();
});

test('scenario-registry selects canonical scenarios in matrix order', (t) => {
  const scenarios = [
    {name: 'write-ack-visibility', path: '/tmp/write-ack-visibility.js'},
    {name: 'rolling-restart', path: '/tmp/rolling-restart.js'},
    {name: 'admin-query-smoke', path: '/tmp/admin-query-smoke.js'},
    {name: 'slow-follower-under-load', path: '/tmp/slow-follower.js'},
    {name: 'examples-catalog', path: '/tmp/examples-catalog.js'},
  ];

  const selected = selectCanonicalScenariosForConfig(
    scenarios,
    'test/distributed/config/local-three-node.json',
  );

  assert.deepEqual(
    selected.map((scenario) => scenario.name),
    [
      'admin-query-smoke',
      'examples-catalog',
      'rolling-restart',
      'write-ack-visibility',
    ],
  );
  t.end();
});

test('scenario-registry formats canonical scenario matrix lines', (t) => {
  const lines = formatCanonicalScenarioMatrixLines();

  assert.equal(lines.length, 24);
  assert.equal(lines[0], 'local-three-node.json|admin-query-smoke');
  assert.equal(
    lines[lines.length - 1],
    'local-partition-merge.json|partition-merge-under-load',
  );
  t.end();
});

test('scenario-registry formats topology failure gate handoff lines', (t) => {
  const lines = formatCanonicalTopologyFailureGateMatrixLines();

  assert.equal(lines.length, EXPECTED_TOPOLOGY_FAILURE_GATE_COUNT);
  assert.equal(lines[0], EXPECTED_FIRST_FAILURE_GATE_LINE);
  assert.equal(
    lines[lines.length - 1],
    EXPECTED_LAST_FAILURE_GATE_LINE,
  );
  t.end();
});

test('scenario-registry exposes topology failure gate execution plans', (t) => {
  const plan = listCanonicalTopologyFailureGateExecutionPlan(
    EXECUTION_PLAN_RUN_ID,
    'test/distributed/config/local-three-node.json',
  );

  assert.deepEqual(
    plan.map((entry) => entry.gateId),
    EXPECTED_LOCAL_THREE_NODE_EXECUTION_GATE_IDS,
  );
  assert.equal(
    plan[0].artifactPath,
    'test-output/reports/topology-failure-gates/20260514T000000Z/' +
      'failure-detection-rolling-restart.report.json',
  );
  assert.equal(
    formatCanonicalTopologyFailureGateExecutionLines(EXECUTION_PLAN_RUN_ID)[0],
    EXPECTED_FIRST_EXECUTION_LINE,
  );
  t.end();
});

test('scenario-registry selects unique topology failure gate scenarios', (t) => {
  const scenarios = [
    {name: 'write-ack-visibility', path: '/tmp/write-ack-visibility.js'},
    {name: 'admin-query-smoke', path: '/tmp/admin-query-smoke.js'},
    {name: 'rolling-restart', path: '/tmp/rolling-restart.js'},
  ];

  const selected = selectCanonicalTopologyFailureGateScenariosForConfig(
    scenarios,
    'test/distributed/config/local-three-node.json',
  );

  assert.deepEqual(
    selected.map((scenario) => scenario.name),
    EXPECTED_LOCAL_THREE_NODE_FAILURE_GATE_SCENARIOS,
  );
  t.end();
});
