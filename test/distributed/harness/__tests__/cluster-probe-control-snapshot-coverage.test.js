/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_A = 'node-a';
const CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_B = 'node-b';
const CONTROL_SNAPSHOT_COVERAGE_TEST_TIMEOUT_MS = 1000;
const CONTROL_SNAPSHOT_COVERAGE_TEST_PENDING_RECONCILE_COUNT = 1;
const CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_IDS = Object.freeze([
  CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_A,
  CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_B,
]);
const CONTROL_SNAPSHOT_COVERAGE_TEST_PENDING_RECONCILE_NODE_IDS =
  Object.freeze([CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_B]);
const CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT_STATE = 'pending';
const CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT_REASON =
  'owner_reconcile_pending';
const CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT = Object.freeze({
  state: CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT_STATE,
  reasonCode: CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT_REASON,
  pendingRecoveryNodeIds: Object.freeze([]),
  pendingRecoveryCount: 0,
  pendingReconcileNodeIds:
    CONTROL_SNAPSHOT_COVERAGE_TEST_PENDING_RECONCILE_NODE_IDS,
  pendingReconcileCount: CONTROL_SNAPSHOT_COVERAGE_TEST_PENDING_RECONCILE_COUNT,
});

test('Unit: _probeClusterActiveState requires control snapshot coverage even when ACTIVE',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const createNode = (nodeId) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_A],
            controlPlaneDiagnostics: {
              activeGateOwnerCohort:
                CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT,
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set(
      CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_A,
      createNode(CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_A),
    );
    cluster._nodes.set(
      CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_B,
      createNode(CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_B),
    );

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + CONTROL_SNAPSHOT_COVERAGE_TEST_TIMEOUT_MS,
    );
    assert.strictEqual(
      probeResult.allActive,
      false,
      'ACTIVE gate should stay closed until snapshot coverage includes all nodes',
    );
    assert.ok(
      probeResult.snapshotCoverage,
      'startup probe should include snapshot coverage diagnostics',
    );
    assert.deepStrictEqual(
      probeResult.snapshotCoverage.selectedActiveGateOwnerCohort,
      CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT,
      'selected coverage should preserve active-gate owner cohort evidence',
    );
    assert.deepStrictEqual(
      probeResult.snapshotCoverage.probeWitnesses.map(
        (witness) => witness.activeGateOwnerCohort,
      ),
      CONTROL_SNAPSHOT_COVERAGE_TEST_NODE_IDS.map(
        () => CONTROL_SNAPSHOT_COVERAGE_TEST_OWNER_COHORT,
      ),
      'probe witnesses should preserve per-node active-gate cohort evidence',
    );
  });

test('Unit: _probeClusterActiveState does not bypass ACTIVE status with snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const expectedNodeIds = ['node-a', 'node-b', 'node-c'];
    const createNode = (nodeId, snapshotNodes) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        throw new Error('Admin API query failed for node ' + nodeId);
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: snapshotNodes,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a', expectedNodeIds));
    cluster._nodes.set('node-b', createNode('node-b', []));
    cluster._nodes.set('node-c', createNode('node-c', []));

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      false,
      'snapshot coverage should not bypass non-ACTIVE node status',
    );
  });

test('Unit: _probeControlSnapshotCoverage short-circuits after complete coverage',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    const createNode = (nodeId, role, observedNodes) => ({
      id: nodeId,
      role,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push({
          nodeId,
          options,
        });
        return {
          rows: [{
            nodes: observedNodes,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode(
      'node-a',
      NODE_ROLES.SEED,
      ['node-a', 'node-b', 'node-c'],
    ));
    cluster._nodes.set('node-b', createNode(
      'node-b',
      NODE_ROLES.JOINER,
      ['node-a'],
    ));
    cluster._nodes.set('node-c', createNode(
      'node-c',
      NODE_ROLES.JOINER,
      ['node-a'],
    ));

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a', 'node-b', 'node-c'],
    );
    assert.strictEqual(
      coverage.completeCoverage,
      true,
      'single complete coverage snapshot should satisfy startup gate coverage',
    );
    assert.strictEqual(
      probeCalls.length,
      1,
      'snapshot probing should short-circuit after first complete coverage result',
    );
    assert.strictEqual(
      probeCalls[0].options.lane,
      'snapshot',
      'control snapshot probe should use snapshot lane',
    );
    assert.ok(
      Number.isInteger(probeCalls[0].options.timeoutMs) &&
      probeCalls[0].options.timeoutMs > 0,
      'control snapshot probe should pass explicit timeout budget to node query',
    );
    assert.strictEqual(
      probeCalls[0].options.forceRepair,
      false,
      'control snapshot probe should not force repair by default',
    );
  });

test('Unit: _probeControlSnapshotCoverage forwards forced repair requests',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push(options);
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 123,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a'],
      {forceRepair: true},
    );

    assert.strictEqual(coverage.completeCoverage, true);
    assert.strictEqual(probeCalls.length, 1);
    assert.strictEqual(
      probeCalls[0].forceRepair,
      true,
      'forced repair should be forwarded to the control snapshot query',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      123,
      'coverage summary should prefer capturedAtMs when present',
    );
  });

test('Unit: _probeControlSnapshotCoverage parallelizes remaining nodes after ' +
  'a partial seed snapshot',
async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const probeCalls = [];
  const nodeIds = ['node-a', 'node-b', 'node-c'];
  for (const [index, nodeId] of nodeIds.entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
      async getControlSnapshot(options) {
        probeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          rows: [{
            nodes: nodeIds.slice(0, index + 1),
            capturedAtMs: 100 + index,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 3500,
    nodeIds,
  );

  assert.strictEqual(
    coverage.completeCoverage,
    true,
    'final node should still be able to satisfy complete coverage',
  );
  assert.strictEqual(
    probeCalls.length,
    3,
    'coverage probe should continue probing until a complete snapshot is found',
  );
  assert.ok(
    Number.isInteger(probeCalls[0].timeoutMs) &&
        probeCalls[0].timeoutMs > 0,
    'seed snapshot probe should receive a positive timeout budget',
  );
  assert.ok(
    probeCalls.every((call) =>
      Number.isInteger(call.timeoutMs) && call.timeoutMs > 0),
    'every snapshot probe should receive a positive timeout budget',
  );
  assert.strictEqual(
    probeCalls[1].timeoutMs,
    probeCalls[2].timeoutMs,
    'remaining node probes should share the same timeout budget instead of ' +
        'serially starving the tail node',
  );
});
