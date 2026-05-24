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

const ACTIVE_GATE_BUDGET_CONTRACT_TEST_CLUSTER_SIZE = 2;
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_A = 'node-a';
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_B = 'node-b';
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_IDS = Object.freeze([
  ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_A,
  ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_B,
]);
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_TIMEOUT_MS = 1000;
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_READY_STATUS = 200;
const ACTIVE_GATE_BUDGET_CONTRACT_TEST_REACHABILITY_SOURCE = 'admin_health';

test('Unit: _probeClusterActiveState probes node status in parallel',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let releaseProbes;
    const probeRelease = new Promise((resolve) => {
      releaseProbes = resolve;
    });
    const startedNodeIds = [];

    const createBlockingNode = (nodeId) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        startedNodeIds.push(nodeId);
        await probeRelease;
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: true,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createBlockingNode('node-a'));
    cluster._nodes.set('node-b', createBlockingNode('node-b'));

    const probePromise = cluster._probeClusterActiveState(Date.now() + 1000);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(
      startedNodeIds.length,
      2,
      'all node status probes should start before any probe resolves',
    );

    releaseProbes();

    const probeResult = await probePromise;
    assert.strictEqual(probeResult.allActive, true);
  });
test(
  'Unit: _probeClusterActiveState starts snapshot coverage before slow ' +
    'readiness resolves',
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_BUDGET_CONTRACT_TEST_CLUSTER_SIZE,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let readinessStartedCount = 0;
    let readinessResolvedCount = 0;
    let snapshotCoverageStartedBeforeReadinessResolved = false;

    const createSlowReadinessNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_A ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        readinessStartedCount += 1;
        await new Promise((resolve) => setImmediate(resolve));
        readinessResolvedCount += 1;
        return {
          status: ACTIVE_GATE_BUDGET_CONTRACT_TEST_READY_STATUS,
        };
      },
      async getReachabilityDiagnostics() {
        return {
          adminReady: true,
          reachable: true,
          reachableBy: ACTIVE_GATE_BUDGET_CONTRACT_TEST_REACHABILITY_SOURCE,
        };
      },
    });

    for (const nodeId of ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_IDS) {
      cluster._nodes.set(nodeId, createSlowReadinessNode(nodeId));
    }

    cluster._probeControlSnapshotCoverage = async (_deadline, expectedNodeIds) => {
      snapshotCoverageStartedBeforeReadinessResolved =
        readinessStartedCount === expectedNodeIds.length &&
        readinessResolvedCount === 0;
      return {
        completeCoverage: true,
        expectedNodeCount: expectedNodeIds.length,
        bestCoverageNodeCount: expectedNodeIds.length,
        selectedNodeId: ACTIVE_GATE_BUDGET_CONTRACT_TEST_NODE_A,
        selectedAdminReady: true,
        selectedReachableBy: ACTIVE_GATE_BUDGET_CONTRACT_TEST_REACHABILITY_SOURCE,
        selectedObservedNodeIds: expectedNodeIds,
        selectedPublishedActiveNodeIds: expectedNodeIds,
        selectedMissingPublishedNodeIds: Object.freeze([]),
        publicationDisagreementByNodeId: Object.freeze({}),
      };
    };

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_BUDGET_CONTRACT_TEST_TIMEOUT_MS,
    );

    assert.strictEqual(
      snapshotCoverageStartedBeforeReadinessResolved,
      true,
      'snapshot coverage should not wait for slow readiness probes',
    );
    assert.strictEqual(probeResult.allActive, true);
  },
);

test('Unit: _probeClusterActiveState prefers traffic readiness probe in load mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let trafficProbeCalls = 0;
    let bootstrapProbeCalls = 0;
    let getStatusCalls = 0;
    const createNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness(_options) {
        trafficProbeCalls += 1;
        return {
          status: 200,
          phase: 'TRAFFIC_READY',
          state: 'traffic_ready',
          reasons: [],
        };
      },
      async probeBootstrapReadiness(_options) {
        bootstrapProbeCalls += 1;
        return {
          status: 200,
          phase: 'JOIN_READY',
          state: 'join_ready',
          reasons: [],
        };
      },
      async getStatus() {
        getStatusCalls += 1;
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: true,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a'));
    cluster._nodes.set('node-b', createNode('node-b'));

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
      {mode: 'load'},
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'traffic readiness probe should satisfy load-readiness gate when snapshot coverage is complete',
    );
    assert.strictEqual(
      trafficProbeCalls,
      2,
      'traffic readiness should be queried per node',
    );
    assert.strictEqual(
      bootstrapProbeCalls,
      0,
      'bootstrap join readiness should not drive ACTIVE gate when traffic probe exists',
    );
    assert.strictEqual(
      getStatusCalls,
      0,
      'legacy status query path should not be used when traffic readiness probe exists',
    );
  });
