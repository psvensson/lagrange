import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const TEST_NODE_ID = 'node-priority-owner';
const TEST_SERVICE_ID = 'control-plane-publications-r4';
const TEST_TARGET_NODE_ID = 'node-priority-target';
const TEST_CACHE_MUTATION_OPERATION = 'update';
const TEST_SERVICE_STATUS = Object.freeze({
  ACTIVE: 'active',
  FAILED: 'failed',
  REMOVED: 'removed',
});
const TEST_RECONCILE_REASON = 'priority_recovery_progress';
const TEST_PARTITION_SERVICE_TYPE = 'partition';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createPriorityPartitionCache() {
  return createMockCache({
    partitions: [{
      partition_id: TEST_PRIORITY_PARTITION_ID,
      table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replica_count: 3,
    }],
  });
}

function buildPriorityServiceVisibilityEvent(status) {
  return Object.freeze({
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    operation: TEST_CACHE_MUTATION_OPERATION,
    data: Object.freeze({
      service_id: TEST_SERVICE_ID,
      node_id: TEST_TARGET_NODE_ID,
      partition_id: TEST_PRIORITY_PARTITION_ID,
      service_type: TEST_PARTITION_SERVICE_TYPE,
      status,
    }),
  });
}

test(
  'UnifiedRebalancer re-enters priority recovery planning on active, failed ' +
    'and removed same-partition service visibility',
  async (t) => {
    initializeTestEnvironment();

    const membershipPublicationReconcileReasons = [];
    const rebalanceReasons = [];
    const systemTableCache = createPriorityPartitionCache();
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
      });
    const rebalancer = createTestRebalancer({
      entityId: TEST_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID,
      systemTableCache,
      controlPlaneReadinessService,
    });
    const serviceStatuses = [
      TEST_SERVICE_STATUS.ACTIVE,
      TEST_SERVICE_STATUS.FAILED,
      TEST_SERVICE_STATUS.REMOVED,
    ];
    rebalancer.isLeader = true;
    rebalancer.enqueueRebalanceCheck = (reason) => {
      rebalanceReasons.push(reason);
      return true;
    };
    rebalancer.enqueueMembershipPublicationReconcile = (reason) => {
      membershipPublicationReconcileReasons.push(reason);
      return true;
    };

    try {
      for (const serviceStatus of serviceStatuses) {
        const handled = rebalancer.handlePriorityRecoveryVisibilityEvent(
          buildPriorityServiceVisibilityEvent(serviceStatus),
        );

        t.equal(
          handled,
          true,
          `${serviceStatus} same-partition service visibility should be handled as recovery progress`,
        );
      }

      t.same(
        rebalanceReasons,
        [
          TEST_RECONCILE_REASON,
          TEST_RECONCILE_REASON,
          TEST_RECONCILE_REASON,
        ],
        'active, failed and removed same-partition service visibility should wake the priority partition rebalance queue with the canonical priority recovery reason',
      );
      t.same(
        membershipPublicationReconcileReasons,
        [
          TEST_RECONCILE_REASON,
          TEST_RECONCILE_REASON,
          TEST_RECONCILE_REASON,
        ],
        'active, failed and removed same-partition service visibility should wake the publication owner with the canonical priority recovery reason',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'CL-020: visibility events pay the heavy planning gate only for ' +
    'PUBLISHED publication events',
  async (t) => {
    initializeTestEnvironment();

    const systemTableCache = createPriorityPartitionCache();
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
      });
    const rebalancer = createTestRebalancer({
      entityId: TEST_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID,
      systemTableCache,
      controlPlaneReadinessService,
    });
    rebalancer.isLeader = true;
    rebalancer.enqueueRebalanceCheck = () => true;
    rebalancer.enqueueMembershipPublicationReconcile = () => true;
    let gateCalls = 0;
    rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot =
      () => {
        gateCalls += 1;
        return Object.freeze({
          operationCreationRequired: true,
          operationCreationPartitionId: TEST_PRIORITY_PARTITION_ID,
          operationCreationScope: 'current_partition',
        });
      };

    try {
      // The production witness (stat-gate-20260611T203619Z run3): every
      // cache-change event of EVERY table ran the full planning re-derive
      // (parseStepsHistory 29% of seed self-time in the freeze windows).
      // Same-partition service visibility must still enqueue via the cheap
      // base decision WITHOUT touching the planning gate.
      const handledService = rebalancer.handlePriorityRecoveryVisibilityEvent(
        buildPriorityServiceVisibilityEvent(TEST_SERVICE_STATUS.ACTIVE),
      );
      t.equal(handledService, true, 'service visibility still enqueues');
      t.equal(gateCalls, 0, 'service event never builds the planning gate');

      rebalancer.handlePriorityRecoveryVisibilityEvent(Object.freeze({
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operation: TEST_CACHE_MUTATION_OPERATION,
        data: Object.freeze({
          operation_id: 'op-1',
          partition_id: 'unrelated-partition',
          status: 'claimed',
        }),
      }));
      t.equal(
        gateCalls,
        0,
        'operation-churn event never builds the planning gate',
      );

      const handledPublication =
        rebalancer.handlePriorityRecoveryVisibilityEvent(Object.freeze({
          tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
          operation: TEST_CACHE_MUTATION_OPERATION,
          data: Object.freeze({
            publication_id: 'pub-1',
            status: 'PUBLISHED',
          }),
        }));
      t.equal(
        handledPublication,
        true,
        'PUBLISHED publication event enqueues via the scheduling snapshot',
      );
      t.equal(
        gateCalls,
        1,
        'only the PUBLISHED publication event builds the planning gate',
      );

      rebalancer.isLeader = false;
      rebalancer.handlePriorityRecoveryVisibilityEvent(Object.freeze({
        tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
        operation: TEST_CACHE_MUTATION_OPERATION,
        data: Object.freeze({
          publication_id: 'pub-1',
          status: 'PUBLISHED',
        }),
      }));
      t.equal(
        gateCalls,
        1,
        'non-leader publication event skips the planning gate (listener path requires leader)',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
