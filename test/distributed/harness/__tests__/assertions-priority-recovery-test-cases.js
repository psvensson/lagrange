import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {waitForConvergence} from '../assertions.js';
import {buildControlSnapshotRecord} from './assertions-test-helpers.js';

const CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID = 'control_plane_publications-p1';
const CACHE_VISIBLE_PRIORITY_RECOVERY_OPERATION_ID =
  'op-cache-visible-spread-satisfied';
const CACHE_VISIBLE_PRIORITY_RECOVERY_DECISION_OPERATION_ID =
  'op-cache-visible-spread-satisfied-decision-snapshot';
const CACHE_VISIBLE_PRIORITY_RECOVERY_FAILED_WORKFLOW_OPERATION_ID =
  'op-cache-visible-failed-workflow-decision-snapshot';
const CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_FALLBACK_OPERATION_ID =
  'op-cache-visible-spread-satisfied-partition-fallback';
const CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID = 'node-d';
const CDC_PROJECTION_OWNER_NODE_ID = 'mock-cdc-projection-owner-node';
const CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID =
  'control_plane_publications-p1';
const CDC_PROJECTION_OWNER_MISSING_PARTITION_ID =
  'sql_transaction_participants-p1';
const CDC_PROJECTION_OWNER_OPERATION_ID =
  'op-cdc-projection-visible-owner';
const CDC_PROJECTION_OWNER_TARGET_NODE_ID = 'node-cdc-owner-target';
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = 'cache_visible';
const PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED = 'converged';
const PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT = 'in_flight';
const PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH =
  'closure_satisfied_fresh';
const PRIORITY_RECOVERY_OPERATION_STATUS_FAILED = 'failed';
const PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED = 'FAILED';

test(
  'waitForConvergence — can ignore cache-visible spread-satisfied priority recovery operations',
  async () => {
    const node = {
      id: 'mock-cache-visible-priority-recovery-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: 'mock-cache-visible-priority-recovery-node',
          partitionIds: [CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address:
                'mock-cache-visible-priority-recovery-node/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r0',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-b/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r1',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-c/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r2',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID +
                '/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r4',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
          ],
          operationRows: [{
            operation_id: CACHE_VISIBLE_PRIORITY_RECOVERY_OPERATION_ID,
            type: 'REPLACE',
            partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            source_node_id: 'node-a',
            target_node_id: CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID,
            replica_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID + '-r4',
            status: 'syncing',
            workflow_step: 'SYNCING',
            updated_at: Date.now() - 1000,
          }],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
            },
            publicationConvergence: {
              priorityRecoveryPartitionWitnesses: [{
                partitionId: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                semanticState: 'spread_satisfied_in_flight',
                completionState: 'spread_satisfied_in_flight',
                visibilityState: 'cache_visible',
                operationIds: [CACHE_VISIBLE_PRIORITY_RECOVERY_OPERATION_ID],
              }],
            },
          },
        })],
      }),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      }),
      /Convergence timeout/,
      'cache-visible spread-satisfied operations should still gate convergence by default',
    );

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  },
);

test(
  'waitForConvergence — can ignore spread-satisfied priority recovery decision snapshots',
  async () => {
    const node = {
      id: 'mock-cache-visible-priority-recovery-decision-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: 'mock-cache-visible-priority-recovery-decision-node',
          partitionIds: [CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address:
                'mock-cache-visible-priority-recovery-decision-node/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r0',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-b/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r1',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-c/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r2',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID +
                '/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r4',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
          ],
          operationRows: [{
            operation_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_DECISION_OPERATION_ID,
            type: 'REPLACE',
            partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            source_node_id: 'node-a',
            target_node_id: CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID,
            replica_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID + '-r4',
            status: 'creating',
            workflow_step: 'CREATING',
            updated_at: Date.now() - 1000,
          }],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
            },
            publicationConvergence: {
              priorityRecoveryPartitionIdsBySemanticState: {
                [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
                  CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                ],
              },
            },
            priorityRecoveryDecisionSnapshots: {
              snapshots: [{
                partitionId: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                operationId:
                  CACHE_VISIBLE_PRIORITY_RECOVERY_DECISION_OPERATION_ID,
                semanticStateId: 'spread_satisfied_in_flight',
                observation: {
                  visibilityState: 'cache_visible',
                },
                completion: {
                  state: 'converged',
                },
                spreadCompletion: {
                  satisfied: true,
                },
                coordinator: {
                  operationIds: [
                    CACHE_VISIBLE_PRIORITY_RECOVERY_DECISION_OPERATION_ID,
                  ],
                },
              }],
            },
          },
        })],
      }),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      }),
      /Convergence timeout/,
      'decision snapshots should still gate convergence by default',
    );

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  },
);

test(
  'waitForConvergence — does not ignore active failed priority recovery decision snapshots',
  async () => {
    const node = {
      id: 'mock-cache-visible-priority-recovery-failed-workflow-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId:
            'mock-cache-visible-priority-recovery-failed-workflow-node',
          partitionIds: [CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address:
                'mock-cache-visible-priority-recovery-failed-workflow-node/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r0',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-b/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r1',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-c/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r2',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID +
                '/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r4',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
          ],
          operationRows: [{
            operation_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_FAILED_WORKFLOW_OPERATION_ID,
            type: 'REPLACE',
            partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            source_node_id: 'node-a',
            target_node_id: CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID,
            replica_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID + '-r4',
            status: 'creating',
            workflow_step: 'CREATING',
            updated_at: Date.now() - 1000,
          }],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
            },
            priorityRecoveryDecisionSnapshots: {
              snapshots: [{
                partitionId: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                operationId:
                  CACHE_VISIBLE_PRIORITY_RECOVERY_FAILED_WORKFLOW_OPERATION_ID,
                semanticStateId:
                  PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
                observation: {
                  visibilityState:
                    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_OPERATION_STATUS_FAILED,
                },
                completion: {
                  state: PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
                },
                spreadCompletion: {
                  satisfied: true,
                },
                coordinator: {
                  operationIds: [
                    CACHE_VISIBLE_PRIORITY_RECOVERY_FAILED_WORKFLOW_OPERATION_ID,
                  ],
                },
              }],
            },
          },
        })],
      }),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
        ignoreStaleInFlightReplicaOperations: true,
      }),
      /Convergence timeout/,
      'active failed priority recovery workflow should keep convergence gated',
    );
  },
);

test(
  'waitForConvergence — can ignore spread-satisfied priority recovery partitions without explicit operation ids',
  async () => {
    const node = {
      id: 'mock-cache-visible-priority-recovery-partition-fallback-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId:
            'mock-cache-visible-priority-recovery-partition-fallback-node',
          partitionIds: [CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address:
                'mock-cache-visible-priority-recovery-partition-fallback-node/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r0',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-b/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r1',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-c/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r2',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID +
                '/' +
                CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID +
                '/r4',
              partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            },
          ],
          operationRows: [{
            operation_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_FALLBACK_OPERATION_ID,
            type: 'REPLACE',
            partition_id: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
            source_node_id: 'node-a',
            target_node_id: CACHE_VISIBLE_PRIORITY_RECOVERY_TARGET_NODE_ID,
            replica_id:
              CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID + '-r4',
            status: 'syncing',
            workflow_step: 'SYNCING',
            updated_at: Date.now() - 1000,
          }],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
            },
            publicationConvergence: {
              priorityRecoveryClosureWitness: {
                state: PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH,
                prioritySpreadPending: false,
                publicationRefreshRequired: false,
                blockedPartitionIds: [],
                blockedPartitionCount: 0,
                unresolvedSemanticStateIds: [],
                unresolvedSemanticStateCount: 0,
              },
              priorityRecoveryPartitionIdsBySemanticState: {
                spread_satisfied_in_flight: [
                  CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                ],
              },
              priorityRecoveryPartitionSemanticStateHistory: [{
                partitionId: CACHE_VISIBLE_PRIORITY_RECOVERY_PARTITION_ID,
                semanticStateIds: ['spread_satisfied_in_flight'],
              }],
            },
          },
        })],
      }),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      }),
      /Convergence timeout/,
      'spread-satisfied partitions should still gate convergence by default',
    );

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  },
);

test(
  'waitForConvergence — can close CDC projection leader gaps from priority recovery owner evidence',
  async () => {
    const node = {
      id: CDC_PROJECTION_OWNER_NODE_ID,
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: CDC_PROJECTION_OWNER_NODE_ID,
          partitionIds: [
            CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID,
            CDC_PROJECTION_OWNER_MISSING_PARTITION_ID,
          ],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address:
                CDC_PROJECTION_OWNER_NODE_ID +
                '/' +
                CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID +
                '/r0',
              partition_id: CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-b/' +
                CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID +
                '/r1',
              partition_id: CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID,
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address:
                'node-c/' +
                CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID +
                '/r2',
              partition_id: CDC_PROJECTION_LEADER_VISIBLE_PARTITION_ID,
            },
          ],
          operationRows: [{
            operation_id: CDC_PROJECTION_OWNER_OPERATION_ID,
            type: 'REPLACE',
            partition_id: CDC_PROJECTION_OWNER_MISSING_PARTITION_ID,
            source_node_id: 'node-a',
            target_node_id: CDC_PROJECTION_OWNER_TARGET_NODE_ID,
            replica_id: CDC_PROJECTION_OWNER_MISSING_PARTITION_ID + '-r4',
            status: 'syncing',
            workflow_step: 'SYNCING',
            updated_at: Date.now() - 1000,
          }],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
            },
            priorityRecoveryDecisionSnapshots: {
              snapshots: [{
                partitionId: CDC_PROJECTION_OWNER_MISSING_PARTITION_ID,
                operationId: CDC_PROJECTION_OWNER_OPERATION_ID,
                semanticState:
                  PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
                observation: {
                  visibilityState:
                    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
                },
                completion: {
                  state: PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
                },
              }],
            },
          },
        })],
      }),
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  },
);
