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
test('Unit: _probeControlSnapshotCoverage surfaces stringified publication diagnostics from the selected snapshot',
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
                publication_epoch: '18',
                status: 'OPEN',
                published_active_node_ids: JSON.stringify(['node-a', 'node-b']),
                pending_ack_node_ids: JSON.stringify(['node-b']),
                acknowledged_node_ids: JSON.stringify(['node-a']),
                priority_recovery_reason_codes: JSON.stringify([
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ]),
                participation_by_node_id: JSON.stringify({
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
                }),
                participation_state_counts: JSON.stringify({
                  published_active: 1,
                  recovery_pending_publish: 2,
                }),
                membership_lifecycle_summary: JSON.stringify({
                  lifecycleState: 'publish_pending',
                  epochBoundary: 'publication_pending',
                  publishedActiveNodeIds: ['node-a', 'node-b'],
                  projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
                  locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
                  suspectedOrTransitioningNodeIds: ['node-c'],
                  recoveryProtocolState: 'publication_pending',
                  projection_diagnostics: {
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
                }),
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
          'publication_epoch_pending',
          'priority_partitions_not_spread',
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
            // CL-001 variant-C trim attribution (source commit 462663ca): no
            // already-published node was trimmed here, so the list is empty.
            retentionGraceMisses: [],
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
          // CL-001 variant-C trim attribution (source commit 462663ca): no
          // already-published node was trimmed here, so the list is empty.
          retentionGraceMisses: [],
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
          'publication_epoch_pending',
          'priority_partitions_not_spread',
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
        snapshotObservationMode: null,
        snapshotObservationState: null,
        snapshotObservationContractState: null,
        snapshotObservationRefreshState: null,
        snapshotObservationNextAction: null,
        snapshotObservationReasonCodes: [],
        snapshotObservationRetryAfterMs: null,
        snapshotRepairDeferred: false,
        snapshotTimeoutEncountered: false,
        activeGateOwnerCohort: null,
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
