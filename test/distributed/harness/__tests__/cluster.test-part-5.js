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
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH = 3;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps admin-ready authority over ' +
  'stronger publication when 102455Z coverage ties';
const SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION =
  'same-coverage active-gate selection should keep the admin-ready authority ' +
  'witness';
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);


/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test('Unit: _probeControlSnapshotCoverage preserves a meaningful timeout floor ' +
  'for late active-wait probes',
async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];
  for (const [index, nodeId] of ['node-a', 'node-b'].entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          rows: [{
            nodes: [nodeId],
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
    Date.now() + 1,
    ['node-a', 'node-b'],
  );

  assert.strictEqual(
    snapshotProbeCalls.length,
    2,
    'late coverage probes should still inspect the remaining nodes when the first witness is partial',
  );
  assert.ok(
    snapshotProbeCalls.every((call) => call.timeoutMs >= 100),
    'snapshot coverage probes should preserve a meaningful timeout floor instead of collapsing to 1ms near the deadline',
  );
  assert.ok(
    reachabilityProbeCalls.every((call) => call.timeoutMs >= 100),
    'reachability probes should preserve the same meaningful timeout floor for late coverage attempts',
  );
  assert.ok(
    coverage.selectedSnapshotTimeoutMs >= 100,
    'coverage summary should report the preserved late snapshot timeout floor',
  );
  assert.ok(
    coverage.selectedReachabilityTimeoutMs >= 100,
    'coverage summary should report the preserved late reachability timeout floor',
  );
});

test('Unit: _probeControlSnapshotCoverage falls back to default lane after snapshot-lane failure',
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
        if (options?.lane === 'snapshot') {
          throw new Error('snapshot lane timed out');
        }
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 456,
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
    );

    assert.strictEqual(coverage.completeCoverage, true);
    assert.strictEqual(probeCalls.length, 2);
    assert.strictEqual(
      probeCalls[0]?.lane,
      'snapshot',
      'coverage probe should try snapshot lane first',
    );
    assert.strictEqual(
      probeCalls[1]?.lane,
      'default',
      'coverage probe should fall back to default lane after snapshot lane failure',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      456,
      'coverage summary should use fallback lane snapshot payload',
    );
  });

test('Unit: _probeControlSnapshotCoverage prefers authoritative admin-ready witnesses when coverage ties',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: false,
          adminReady: false,
          reachableBy: null,
          lastError: 'connect ECONNREFUSED 127.0.0.1:8081',
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 200,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._nodes.set('node-b', {
      id: 'node-b',
      role: NODE_ROLES.JOINER,
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
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-b'],
            capturedAtMs: 100,
            controlPlaneDiagnostics: {
              readinessByNodeId: {
                'node-b': {
                  dimensions: {
                    clusterMemberHealthy: true,
                  },
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

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 1000,
      ['node-a', 'node-b'],
    );

    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      'node-b',
      'authoritative admin-ready witnesses should win snapshot selection when coverage is otherwise tied',
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      'selected witness should preserve the authoritative admin-ready status',
    );
    assert.strictEqual(
      coverage.selectedControlPlaneDiagnosticsAvailable,
      true,
      'selected witness should preserve control-plane diagnostics availability',
    );
  });

test('Unit: _probeControlSnapshotCoverage parses stringified snapshot fields',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: JSON.stringify(['node-a']),
            capturedAtMs: '123',
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
    );

    assert.strictEqual(
      coverage.completeCoverage,
      true,
      'stringified control snapshot fields should still satisfy coverage',
    );
    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      1,
      'coverage should count parsed node ids from stringified JSON',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      123,
      'coverage should parse numeric capturedAtMs strings',
    );
  });

test('Unit: _probeControlSnapshotCoverage counts projected and suspected nodes ' +
  'when authoritative nodes remain publication-scoped', async () => {
  const cluster = createCluster({
    size: 5,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  cluster._nodes.set('node-a', {
    id: 'node-a',
    role: NODE_ROLES.SEED,
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
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-a', 'node-b'],
          projectedNodes: ['node-a', 'node-b', 'node-c', 'node-d'],
          suspectedOrTransitioningNodes: ['node-e'],
          capturedAtMs: 321,
        }],
      };
    },
    async getLogs(_options) {
      return '';
    },
  });

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'],
  );

  assert.strictEqual(
    coverage.completeCoverage,
    true,
    'coverage should treat projected and suspected nodes as observed membership',
  );
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    5,
    'coverage should union authoritative, projected, and suspected node ids',
  );
  assert.deepStrictEqual(
    coverage.selectedObservedNodeIds,
    ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'],
    'coverage should retain the expanded observed node set',
  );
});

test('Unit: _probeControlSnapshotCoverage surfaces publication diagnostics from the selected snapshot',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
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
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [],
            capturedAtMs: 123,
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: '18',
                publicationStatus: 'OPEN',
                publishedActiveNodeIds: JSON.stringify(['node-a', 'node-b']),
                pendingAckNodeIds: ['node-b'],
                acknowledgedNodeIds: ['node-a'],
                recoveryProtocolState: 'publication_pending',
                priorityRecoveryReasonCodes: [
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ],
                participationByNodeId: {
                  'node-a': {
                    state: 'published_active',
                    publishedActive: true,
                    recoveryActive: true,
                  },
                  'node-b': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                  'node-c': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                },
                participationStateCounts: {
                  published_active: 1,
                  recovery_pending_publish: 2,
                },
                membershipLifecycleSummary: {
                  lifecycleState: 'publish_pending',
                  epochBoundary: 'publication_pending',
                  publishedActiveNodeIds: ['node-a', 'node-b'],
                  projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
                  locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
                  suspectedOrTransitioningNodeIds: ['node-c'],
                  projectionDiagnostics: {
                    readinessDecisionMode:
                      'cluster_member_or_recovery_eligible',
                    readinessDecisionDimensions: [
                      'clusterMemberHealthy',
                      'controlPlaneRecoveryEligible',
                      'controlPlaneWritable',
                    ],
                    recoveryEligibleProjectionEnabled: true,
                    recoveryEligibleIncludedNodeIds: ['node-b'],
                    readinessExcludedNodeIds: ['node-c'],
                    clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
                  },
                },
              },
              publishedMembershipObservation: {
                publicationEpoch: 17,
                status: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a'],
                acknowledgedNodeIds: ['node-a'],
              },
              readinessByNodeId: {
                'node-a': {
                  dimensions: {
                    clusterMemberHealthy: true,
                  },
                },
                'node-b': {
                  dimensions: {
                    clusterMemberHealthy: false,
                  },
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

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a', 'node-b'],
      {forceRepair: true},
    );

    assert.strictEqual(coverage.completeCoverage, false);
    const selectedPublicationConvergence =
      coverage.selectedPublicationConvergence;
    assert.deepStrictEqual(
      {
        publicationEpoch: selectedPublicationConvergence.publicationEpoch,
        publicationStatus: selectedPublicationConvergence.publicationStatus,
        publishedActiveNodeIds:
          selectedPublicationConvergence.publishedActiveNodeIds,
        pendingAckNodeIds: selectedPublicationConvergence.pendingAckNodeIds,
        acknowledgedNodeIds:
          selectedPublicationConvergence.acknowledgedNodeIds,
        recoveryActiveNodeIds:
          selectedPublicationConvergence.recoveryActiveNodeIds,
        recoveryActiveNodeSource:
          selectedPublicationConvergence.recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds:
          selectedPublicationConvergence.missingPublishedRecoveryActiveNodeIds,
        recoveryProtocolState:
          selectedPublicationConvergence.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          selectedPublicationConvergence.priorityRecoveryReasonCodes,
        participationByNodeId:
          selectedPublicationConvergence.participationByNodeId,
        participationStateCounts:
          selectedPublicationConvergence.participationStateCounts,
        priorityPartitionSummary:
          selectedPublicationConvergence.priorityPartitionSummary,
        membershipLifecycleSummary:
          selectedPublicationConvergence.membershipLifecycleSummary,
        projectionDiagnostics:
          selectedPublicationConvergence.projectionDiagnostics,
      },
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        recoveryActiveNodeSource: 'locally_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-c'],
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
          'publication_epoch_pending',
        ],
        participationByNodeId: {
          'node-a': {
            state: 'published_active',
            durable: false,
            publishedActive: true,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: null,
            reasons: [],
          },
          'node-b': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
          'node-c': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
        },
        participationStateCounts: {
          published_active: 1,
          recovery_pending_publish: 2,
        },
        priorityPartitionSummary: null,
        membershipLifecycleSummary: {
          lifecycleState: 'publish_pending',
          epochBoundary: 'publication_pending',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
          suspectedOrTransitioningNodeIds: ['node-c'],
          recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
          recoveryActiveNodeSource: 'locally_eligible_projection',
          missingPublishedRecoveryActiveNodeIds: ['node-c'],
          recoveryProtocolState: 'publication_pending',
          recoveryProtocolReasonCodes: [
            'priority_partitions_not_spread',
            'publication_epoch_pending',
          ],
          participationByNodeId: {
            'node-a': {
              state: 'published_active',
              durable: false,
              publishedActive: true,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: null,
              reasons: [],
            },
            'node-b': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
            'node-c': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
          },
          participationStateCounts: {
            published_active: 1,
            recovery_pending_publish: 2,
          },
          projectionDiagnostics: {
            readinessDecisionMode: 'cluster_member_or_recovery_eligible',
            readinessDecisionDimensions: [
              'clusterMemberHealthy',
              'controlPlaneRecoveryEligible',
              'controlPlaneWritable',
            ],
            recoveryEligibleProjectionEnabled: true,
            recoveryEligibleIncludedNodeIds: ['node-b'],
            readinessExcludedNodeIds: ['node-c'],
            clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
          },
        },
        projectionDiagnostics: {
          readinessDecisionMode: 'cluster_member_or_recovery_eligible',
          readinessDecisionDimensions: [
            'clusterMemberHealthy',
            'controlPlaneRecoveryEligible',
            'controlPlaneWritable',
          ],
          recoveryEligibleProjectionEnabled: true,
          recoveryEligibleIncludedNodeIds: ['node-b'],
          readinessExcludedNodeIds: ['node-c'],
          clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
        },
      },
      'coverage probe should retain current publication convergence details for failing snapshots',
    );
    assert.deepStrictEqual(
      coverage.selectedPublishedMembershipObservation,
      {
        publicationEpoch: 17,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a'],
        pendingAckNodeIds: [],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a'],
        recoveryActiveNodeSource: 'published_membership',
        missingPublishedRecoveryActiveNodeIds: [],
        priorityPartitionSummary: null,
        membershipLifecycleSummary: null,
        projectionDiagnostics: null,
      },
      'coverage probe should surface the last published membership separately from newer open publications',
    );
    assert.deepStrictEqual(
      {
        publicationEpoch:
          coverage.selectedPriorityRecoveryObservation?.publicationEpoch,
        publicationStatus:
          coverage.selectedPriorityRecoveryObservation?.publicationStatus,
        recoveryProtocolState:
          coverage.selectedPriorityRecoveryObservation?.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryReasonCodes,
        pendingAckCount:
          coverage.selectedPriorityRecoveryObservation?.pendingAckCount,
        priorityRecoveryBlockedPartitionCount:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryBlockedPartitionCount,
      },
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
          'publication_epoch_pending',
        ],
        pendingAckCount: 1,
        priorityRecoveryBlockedPartitionCount: 0,
      },
      'coverage probe should preserve the canonical priority-recovery observation for the selected snapshot',
    );
    assert.deepStrictEqual(
      coverage.selectedHealthyReadinessNodeIds,
      ['node-a'],
      'coverage probe should report readiness-healthy nodes from the selected snapshot diagnostics',
    );
    assert.strictEqual(
      coverage.selectedAdminReady,
      true,
      'coverage probe should preserve admin-readiness for the selected snapshot node',
    );
    assert.deepStrictEqual(
      coverage.selectedMissingPublishedNodeIds,
      [],
      'coverage probe should preserve the selected snapshot publication disagreement set',
    );
    assert.deepStrictEqual(
      coverage.probeWitnesses,
      [{
        nodeId: 'node-a',
        snapshotQuerySucceeded: true,
        adminReady: true,
        reachable: true,
        reachableBy: 'admin_health',
        reachabilityError: null,
        error: null,
        observedNodeCount: 0,
        missingExpectedNodeCount: 2,
        capturedAtMs: 123,
        snapshotRevision: null,
        snapshotRevisionState: null,
        snapshotRevisionGap: null,
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        missingPublishedNodeIds: [],
      }],
      'coverage probe should emit compact per-attempt witness data for closure-ledger updates',
    );
  });

test('Unit: _probeControlSnapshotCoverage captures per-node publication ' +
  'disagreement for 3-node active-gate characterization', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    observedNodes,
    capturedAtMs,
    publishedActiveNodeIds,
    pendingWrites,
    bufferedEvents,
  ) => ({
    id: nodeId,
    role,
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
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: observedNodes,
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 1,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
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
    ['node-a', 'node-b'],
    100,
    ['node-a', 'node-b'],
    4,
    9,
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    ['node-a', 'node-b'],
    200,
    ['node-a', 'node-c'],
    7,
    13,
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    ['node-a'],
    300,
    ['node-a'],
    1,
    5,
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(coverage.completeCoverage, false);
  assert.strictEqual(
    coverage.selectedNodeId,
    'node-b',
    'probe should select the best 3-node snapshot candidate for gate diagnostics',
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-b'],
    'selected snapshot should preserve the publication disagreement set',
  );
  assert.deepStrictEqual(
    coverage.publicationDisagreementByNodeId,
    {
      'node-a': ['node-c'],
      'node-b': ['node-b'],
      'node-c': ['node-b', 'node-c'],
    },
    'coverage probe should expose per-node publication disagreement witnesses',
  );
  assert.strictEqual(
    coverage.selectedControlPlaneOwnerQueueDepth?.pendingWrites,
    7,
    'selected snapshot should carry owner queue-depth witness at the active gate',
  );
  assert.strictEqual(
    coverage.selectedCdcReplayLag?.bufferedEvents,
    13,
    'selected snapshot should carry CDC lag witness at the active gate',
  );
});

test('Unit: _probeControlSnapshotCoverage prefers the strongest publication ' +
  'witness when coverage ties', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    capturedAtMs,
    publishedActiveNodeIds,
  ) => ({
    id: nodeId,
    role,
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
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-a', 'node-b'],
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites: 0,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents: 0,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 0,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
        }],
      };
    },
    async getLogs() {
      return '';
    },
  });

  cluster._nodes.set('node-a', createNode(
    'node-a',
    NODE_ROLES.SEED,
    100,
    ['node-a', 'node-b'],
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    200,
    ['node-a'],
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    300,
    ['node-a'],
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    'node-a',
    'probe should prefer the witness with fewer missing published nodes over a newer stale witness',
  );
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    ['node-a', 'node-b'],
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-c'],
  );
});

test(SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
            },
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const seedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.strictEqual(coverage.selectedSnapshotAdminReady, true);
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
  );
  assert.ok(seedWitness);
  assert.strictEqual(
    seedWitness.publicationEpoch,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
  );
  assert.deepStrictEqual(
    seedWitness.publishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    seedWitness.missingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS,
  );
});

test('Unit: _waitForAllActive carries selected snapshot witness into no-progress diagnostics',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};
    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 1,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1'],
          selectedMissingPublishedNodeIds: ['joiner-1'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['publication_missing_active_node=joiner-1'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: ['joiner-1'],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await assert.rejects(
      async () => cluster._waitForAllActive({mode: 'load'}),
      (error) => {
        assert.match(error.message, /snapshotNode=seed-1#adminReady=true/);
        assert.match(error.message, /missingPublishedIds=joiner-1/);
        assert.equal(
          error?.diagnostics?.noProgress?.currentProgress?.selectedSnapshotNodeId,
          'seed-1',
        );
        assert.deepStrictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedMissingPublishedNodeIds,
          ['joiner-1'],
        );
        return true;
      },
    );

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true;
    });
    assert.ok(waitingStage, 'should record waiting-active stall details');
    assert.equal(
      waitingStage.details?.activeGateProgress?.selectedSnapshotNodeId,
      'seed-1',
    );
    assert.deepStrictEqual(
      waitingStage.details?.activeGateProgress?.selectedMissingPublishedNodeIds,
      ['joiner-1'],
    );
  });

test('Unit: _waitForAllActive treats CL-003 witness as load-mode soft success',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true;
    });
    assert.equal(
      waitingStage,
      undefined,
      'soft-success closure should complete without recording a stalled waiting-active stage',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'soft-success closure should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive respects an existing CL-003 gate witness in load mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    const CL_003 = 'CL-003';
    const CL_003_WITNESS_CLASS =
      'publication_converged_priority_spread_pending';

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 15,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: 0,
              totalSpreadGap: 0,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true;
    });
    assert.equal(
      waitingStage,
      undefined,
      'an explicit CL-003 witness should complete load-mode ACTIVE wait without a no-progress stall',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'an explicit CL-003 witness should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive derives CL-003 load-mode soft success from ' +
  'selected priority-recovery decision snapshots', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      convergence: 200,
      activeWaitNoProgressMaxAttempts: 2,
    },
  });

  const CL_003 = 'CL-003';
  const CL_003_WITNESS_CLASS =
    'publication_converged_priority_spread_pending';

  cluster._sleep = async () => {};
  let collectedFailureLogs = false;
  cluster._collectFailureLogs = async () => {
    collectedFailureLogs = true;
  };

  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };

  for (const [index, nodeId] of ['seed-1', 'joiner-1'].entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness() {
        return {
          status: 503,
          state: 'traffic_blocked',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
    });
  }

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: true,
      expectedNodeCount: 2,
      bestCoverageNodeCount: 2,
      selectedNodeId: 'seed-1',
      selectedAdminReady: true,
      selectedReachableBy: 'admin_health',
      selectedPublicationConvergence: {
        publicationEpoch: 16,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['seed-1', 'joiner-1'],
        pendingAckNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPublicationConvergenceGate: {
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPriorityRecoveryDecisionSnapshots: {
        closureWitness: {
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
          prioritySpreadPending: false,
          blockedPartitionIds: [],
          blockedPartitionCount: 0,
          unresolvedSemanticStateIds: [],
          satisfiedPartitionIds: ['control_plane_publications-p1'],
          decisionPartitionIds: ['control_plane_publications-p1'],
          refreshedPriorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
        },
        snapshots: [],
      },
      selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
      selectedMissingPublishedNodeIds: [],
      selectedError: null,
    };
  };

  await cluster._waitForAllActive({mode: 'load'});

  const waitingStage = recordedStages.find((entry) => {
    return entry.stage === 'setup.cluster.waiting-active' &&
      entry.details?.activeGateNoProgress?.stalled === true;
  });
  assert.equal(
    waitingStage,
    undefined,
    'selected decision-snapshot closure evidence should complete load-mode ACTIVE wait without a no-progress stall',
  );
  assert.equal(
    collectedFailureLogs,
    false,
    'selected decision-snapshot closure evidence should not trigger failure log collection',
  );
});

test('Unit: _waitForAllActive rejects CL-004 witness without strong admission',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 0,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedError:
            'Admin API query timed out for node seed-1 on lane snapshot after 3000ms',
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup snapshot timeout should timeout until active admission is strong',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'snapshot_timeout',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      'terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup snapshot-timeout path should collect failure logs',
    );
  });

test('Unit: _waitForAllActive rejects CL-006 witness without strong admin proof',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    cluster._recordClusterStage = () => {};

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-2',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 3,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 2,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: ['joiner-2'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup publication lag witness should timeout when strong admission is absent',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'no_progress_terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.cause,
      'none',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup publication-lag timeout should collect failure logs',
    );
  });
