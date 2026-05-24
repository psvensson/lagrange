import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const DISPATCH_RETRY_SOURCE_NODE_ID = 'node-source';
const DISPATCH_RETRY_TARGET_NODE_ID = 'node-target';
const DISPATCH_RETRY_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS];
const DISPATCH_RETRY_OPERATION_ID = 'op-active-source-removal-retry';
const DISPATCH_RETRY_REPLICA_ID =
  'sql_transaction_participants-p1-r5';
const DISPATCH_RETRY_OPERATION_TYPE_REPLACE = 'REPLACE';
const DISPATCH_RETRY_STATUS_ACTIVE = 'active';
const DISPATCH_RETRY_STATUS_CREATING = 'creating';
const DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const DISPATCH_RETRY_WORKFLOW_STEP_CREATING = 'CREATING';
const DISPATCH_RETRY_CREATING_OPERATION_ID =
  'op-creating-target-rearm-retry';
const DISPATCH_RETRY_CREATING_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const DISPATCH_RETRY_CREATING_REPLICA_ID =
  'sql_write_operations-p1-r5';
const DISPATCH_RETRY_SERVICE_TYPE_PARTITION = 'partition';

export function registerMembershipPublicationCoordinatorDispatchRetryTests({
  test,
  MembershipPublicationCoordinator,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
}) {
  test('getDispatchRetryRowsForNode refreshes through the replica-operation owner when priority recovery leaves cache empty',
    async (t) => {
      const authoritativeQueryOptions = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'replica_operations') {
              return [];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 14,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1'],
              priorityPartitionSummary: {
                requiredDistinctNodeCount: 2,
                readyEligibleNodeCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 2,
                  readyDistinctNodeCount: 1,
                  spreadGap: 1,
                }],
                missingPartitionIds: ['replica_operations-p1'],
              },
              membershipLifecycleSummary: {
                locallyEligibleNodeIds: ['node-2'],
                projectedServingNodeIds: ['node-2'],
              },
            };
          },
        },
        replicaOperationRepository: {
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [{
              operationId: 'op-priority-retry-1',
              partitionId: 'replica_operations-p1',
              type: 'REPLACE',
              sourceNodeId: 'node-1',
              targetNodeId: 'node-2',
              status: 'pending',
              workflowStep: 'PENDING',
              stepsHistory: [],
            }];
          },
        },
      });

      const dispatchRows =
        await coordinator.getDispatchRetryRowsForNode('node-2');

      t.same(
        authoritativeQueryOptions,
        [{
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        }],
        'priority recovery should ask the authoritative replica-operation owner for retry rows',
      );
      t.match(
        dispatchRows,
        [{
          operation_id: 'op-priority-retry-1',
          target_node_id: 'node-2',
          workflow_step: 'PENDING',
        }],
        'owner-selected retry rows should be returned in replica_operations row shape',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode keeps authoritative retry rows when ' +
    'cache has stale replayable rows',
  async (t) => {
    const authoritativeQueryOptions = [];
    const staleCacheOperationId = 'op-stale-cache-retry';
    const authoritativeOperationId = 'op-authoritative-priority-retry';
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: DISPATCH_RETRY_TARGET_NODE_ID,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [{
              operation_id: staleCacheOperationId,
              type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
              partition_id: DISPATCH_RETRY_PARTITION_ID,
              replica_id: DISPATCH_RETRY_REPLICA_ID,
              source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
              target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
              status: 'pending',
              workflow_step: 'PENDING',
              steps_history: '[]',
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 16,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: [DISPATCH_RETRY_TARGET_NODE_ID],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 2,
              readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: DISPATCH_RETRY_CREATING_PARTITION_ID,
                requiredDistinctNodeCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
              missingPartitionIds: [DISPATCH_RETRY_CREATING_PARTITION_ID],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: [DISPATCH_RETRY_TARGET_NODE_ID],
              projectedServingNodeIds: [DISPATCH_RETRY_TARGET_NODE_ID],
            },
          };
        },
      },
      replicaOperationRepository: {
        isOperationLocallyOwned(operation) {
          return operation?.targetNodeId === DISPATCH_RETRY_TARGET_NODE_ID;
        },
        async queryIncompleteOperations(options) {
          authoritativeQueryOptions.push(options);
          return [{
            operationId: authoritativeOperationId,
            partitionId: DISPATCH_RETRY_CREATING_PARTITION_ID,
            type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
            sourceNodeId: DISPATCH_RETRY_SOURCE_NODE_ID,
            targetNodeId: DISPATCH_RETRY_TARGET_NODE_ID,
            replicaId: DISPATCH_RETRY_CREATING_REPLICA_ID,
            status: 'pending',
            workflowStep: 'PENDING',
            stepsHistory: [],
          }];
        },
      },
    });

    const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode(
        DISPATCH_RETRY_TARGET_NODE_ID,
      );

    t.same(
      authoritativeQueryOptions,
      [{
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      }],
      'priority recovery should still query authoritative retry rows when cache has replayable work',
    );
    t.same(
      dispatchRows.map((row) => row.operation_id),
      [
        authoritativeOperationId,
        staleCacheOperationId,
      ],
      'authoritative retry rows should be unioned ahead of cache rows',
    );
    t.end();
  });

  test('getDispatchRetryRowsForNode respects canonical target ownership for replace operations',
    async (t) => {
      const authoritativeQueryOptions = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'replica_operations') {
              return [];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 15,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1'],
              priorityPartitionSummary: {
                requiredDistinctNodeCount: 2,
                readyEligibleNodeCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 2,
                  readyDistinctNodeCount: 1,
                  spreadGap: 1,
                }],
                missingPartitionIds: ['replica_operations-p1'],
              },
              membershipLifecycleSummary: {
                locallyEligibleNodeIds: ['node-2'],
                projectedServingNodeIds: ['node-2'],
              },
            };
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === 'node-2';
          },
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [{
              operationId: 'op-priority-retry-target-owner',
              partitionId: 'replica_operations-p1',
              type: 'REPLACE',
              sourceNodeId: 'node-1',
              targetNodeId: 'node-2',
              status: 'pending',
              workflowStep: 'PENDING',
              stepsHistory: [],
            }];
          },
        },
      });

      const dispatchRows =
        await coordinator.getDispatchRetryRowsForNode('node-2');

      t.same(
        authoritativeQueryOptions,
        [{
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        }],
        'canonical ownership resolver should allow authoritative refresh for target-owned rows',
      );
      t.match(
        dispatchRows,
        [{
          operation_id: 'op-priority-retry-target-owner',
          target_node_id: 'node-2',
          workflow_step: 'PENDING',
        }],
        'owner-selected retry rows should include target-owned replace operations',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode replays ACTIVE replace source removal by source node',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: DISPATCH_RETRY_TARGET_NODE_ID,
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return [];
            }
            return [{
              operation_id: DISPATCH_RETRY_OPERATION_ID,
              partition_id: DISPATCH_RETRY_PARTITION_ID,
              entity_id: DISPATCH_RETRY_PARTITION_ID,
              entity_type: DISPATCH_RETRY_SERVICE_TYPE_PARTITION,
              type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
              source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
              target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
              replica_id: DISPATCH_RETRY_REPLICA_ID,
              status: DISPATCH_RETRY_STATUS_ACTIVE,
              workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
              steps_history: [],
            }];
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === DISPATCH_RETRY_TARGET_NODE_ID;
          },
        },
      });

      const dispatchRows =
        await coordinator.getDispatchRetryRowsForNode(
          DISPATCH_RETRY_SOURCE_NODE_ID,
        );

      t.match(
        dispatchRows,
        [{
          operation_id: DISPATCH_RETRY_OPERATION_ID,
          source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
          target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
          workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
        }],
        'source-node retry should include target-owned ACTIVE replace source removal',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode replays ACTIVE replace source removal by owner node',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: DISPATCH_RETRY_TARGET_NODE_ID,
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return [];
            }
            return [{
              operation_id: DISPATCH_RETRY_OPERATION_ID,
              partition_id: DISPATCH_RETRY_PARTITION_ID,
              entity_id: DISPATCH_RETRY_PARTITION_ID,
              entity_type: DISPATCH_RETRY_SERVICE_TYPE_PARTITION,
              type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
              source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
              target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
              replica_id: DISPATCH_RETRY_REPLICA_ID,
              status: DISPATCH_RETRY_STATUS_ACTIVE,
              workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
              steps_history: [],
            }];
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === DISPATCH_RETRY_TARGET_NODE_ID;
          },
        },
      });

      const dispatchRows =
        await coordinator.getDispatchRetryRowsForNode(
          DISPATCH_RETRY_TARGET_NODE_ID,
        );

      t.match(
        dispatchRows,
        [{
          operation_id: DISPATCH_RETRY_OPERATION_ID,
          source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
          target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
          workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
        }],
        'owner-node retry should include target-owned ACTIVE replace source removal',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode replays CREATING system-table replace by target node',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: DISPATCH_RETRY_TARGET_NODE_ID,
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return [];
            }
            return [{
              operation_id: DISPATCH_RETRY_CREATING_OPERATION_ID,
              partition_id: DISPATCH_RETRY_CREATING_PARTITION_ID,
              entity_id: DISPATCH_RETRY_CREATING_PARTITION_ID,
              entity_type: DISPATCH_RETRY_SERVICE_TYPE_PARTITION,
              type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
              source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
              target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
              replica_id: DISPATCH_RETRY_CREATING_REPLICA_ID,
              status: DISPATCH_RETRY_STATUS_CREATING,
              workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_CREATING,
              steps_history: [],
            }];
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === DISPATCH_RETRY_TARGET_NODE_ID;
          },
        },
      });

      const dispatchRows =
        await coordinator.getDispatchRetryRowsForNode(
          DISPATCH_RETRY_TARGET_NODE_ID,
        );

      t.match(
        dispatchRows,
        [{
          operation_id: DISPATCH_RETRY_CREATING_OPERATION_ID,
          target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
          workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_CREATING,
        }],
        'ready target retry should include target-owned CREATING system-table replace work',
      );
      t.end();
    });
}
