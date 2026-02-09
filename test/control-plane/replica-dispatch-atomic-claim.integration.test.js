/**
 * Integration test for atomic dispatch claims in ReplicaDispatchService.
 * Task 18: expected to fail until atomic PENDING->SENDING claim is enforced.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneField} from
  '../../src/control-plane/control-plane-constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test(
  'ReplicaDispatchService dispatches a pending operation once across triggers',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-atomic-claim-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SystemTableName.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: STATE.ACTIVE,
              ws_connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SystemTableName.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: STATE.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const leaderMessageGroup = {
      isLeaderReplica: () => true,
    };

    try {
      await service.handleCdcApplied(leaderMessageGroup, {
        tableName: SystemTableName.REPLICA_OPERATIONS,
        data: operationRow,
      });
      await service.handleReplicaOperationDispatch({
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
      });

      t.equal(
        executeCount,
        1,
        'should dispatch exactly once after a single operation claim',
      );
    } finally {
      service.stop();
    }
  },
);
