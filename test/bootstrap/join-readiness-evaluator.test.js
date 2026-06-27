import {test} from '../../src/test-helpers/tap.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';
import {
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const JOIN_READINESS_BLOCKED_ACTION_NONE = 'none';
const JOIN_READINESS_BLOCKED_ACTION_REPAIR_TOPOLOGY_VISIBILITY =
  'repair_topology_visibility';
const JOIN_READINESS_TEST_NODE_ID = 'joining-node-readiness-evaluator';
const JOIN_READINESS_TEST_SEED_NODE_ID = 'seed-node';
const JOIN_READINESS_TEST_TARGET_NODE_ID = 'target-node';
const JOIN_READINESS_TEST_PRIORITY_OPERATION_ID = 'priority-self-source-op-1';
const JOIN_READINESS_TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const JOIN_READINESS_TEST_PRIORITY_REPLICA_ID = 'replica_operations-p1-r6';
const JOIN_READINESS_TEST_PRIORITY_TABLE_NAME = 'replica_operations';
const JOIN_READINESS_TEST_OPERATION_UPDATED_AT_MS = 1234;
const JOIN_READINESS_TEST_NO_BLOCKERS = 0;
const JOIN_READINESS_TEST_ONE_EXCLUSION = 1;
const JOIN_READINESS_TEST_OPERATION_TYPE = Object.freeze({
  REPLACE: 'REPLACE',
});
const JOIN_READINESS_TEST_OPERATION_STATUS = Object.freeze({
  SYNCING: 'syncing',
});
const JOIN_READINESS_TEST_WORKFLOW_STEP = Object.freeze({
  SYNCING: 'SYNCING',
});
const JOIN_READINESS_TEST_NODE_STATUS = Object.freeze({
  ACTIVE: 'active',
  JOINING: 'joining',
});
const JOIN_READINESS_TEST_TABLE = Object.freeze({
  NODES: 'nodes',
  PARTITIONS: 'partitions',
  REPLICA_OPERATIONS: 'replica_operations',
  SERVICES: 'services',
});

function createEvaluatorHarness(options = {}) {
  let nowMs = options.nowMs ?? 10000;
  const readinessEligibleNodeIds = new Set(
    options.readinessEligibleNodeIds || [],
  );
  const backfillCalls = [];
  const warningEvents = [];
  const routerPressure = {
    backpressured: options.backpressured === true,
    saturatedNodeCount: options.backpressured === true ? 1 : 0,
    totalPending: options.backpressured === true ? 48 : 0,
    maxPendingUtilization: options.backpressured === true ? 0.75 : 0,
  };
  const logger = {
    info() {},
    debug() {},
    error() {},
    warn(message, context) {
      warningEvents.push({message, context});
    },
  };
  const evaluator = new JoinReadinessEvaluator({
    nodeId: 'joining-node-readiness-evaluator',
    now: () => nowMs,
    sleep: async () => {},
    delegates: {
      backfillPropagatedCacheTables: async (tables, backfillOptions) => {
        backfillCalls.push({
          tables: Array.isArray(tables) ? [...tables] : tables,
          options: backfillOptions || null,
        });
      },
      getCdcIntegrationService: () => ({sqlQueryEngine: {}}),
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync: (nodeId) => ({
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              readinessEligibleNodeIds.size === 0 ||
              readinessEligibleNodeIds.has(nodeId),
          },
        }),
      }),
      getBootstrapResponse: () => null,
      getLogger: () => logger,
      getMessageRouter: () => ({
        getOutboundPressureSummary: () => ({...routerPressure}),
      }),
      getConfig: () => ({}),
    },
  });

  return {
    evaluator,
    backfillCalls,
    warningEvents,
    routerPressure,
    setNow(value) {
      nowMs = value;
    },
  };
}

function createTopologyBlockedEvaluation() {
  return {
    reasons: [JOIN_READINESS_REASON.TOPOLOGY_NOT_READY],
    missingNodeEndpointNodeIds: ['seed-node'],
    missingPostgresWireNodeIds: ['seed-node'],
  };
}

test(
  'JoinReadinessEvaluator - groups one readiness attempt into snapshot, error, and evaluation',
  async (t) => {
    const harness = createEvaluatorHarness();
    harness.evaluator.delegates.getSystemCacheHydrated = () => true;
    harness.evaluator.delegates.getJoinStartupMode = () => null;
    harness.evaluator.delegates.getDurableRejoinRestoreState = () => null;
    harness.evaluator.delegates.getLifecycleState = () => null;
    harness.evaluator.delegates.getJoinReadinessSnapshotProvider =
      () => async () => ({
        nodeId: 'joining-node-readiness-evaluator',
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '5',
        appliedSchemaVersion: '4',
      });

    const attempt =
      await harness.evaluator.collectCanonicalJoinReadinessAttempt();

    t.equal(
      attempt.snapshotError,
      null,
      'one readiness attempt should preserve the absence of a snapshot error explicitly',
    );
    t.same(
      attempt.snapshot,
      {
        nodeId: 'joining-node-readiness-evaluator',
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '5',
        appliedSchemaVersion: '4',
      },
      'one readiness attempt should preserve the collected snapshot verbatim',
    );
    t.same(
      attempt.evaluation.reasons,
      [JOIN_READINESS_REASON.SCHEMA_VERSION_LAG],
      'one readiness attempt should preserve the evaluated blocker reasons alongside the collected snapshot',
    );
    t.equal(
      attempt.evaluation.ready,
      false,
      'one readiness attempt should report the evaluated readiness directly',
    );
  },
);

test(
  'JoinReadinessEvaluator - resolves one blocked action plan from the evaluated readiness reasons',
  async (t) => {
    const harness = createEvaluatorHarness();

    t.same(
      harness.evaluator.resolveCanonicalJoinBlockedAction(
        {
          reasons: [JOIN_READINESS_REASON.ROUTING_NOT_READY],
        },
        1000,
      ),
      {
        actionId: JOIN_READINESS_BLOCKED_ACTION_NONE,
        pollIntervalMs: null,
      },
      'non-topology blockers should not invent a repair action plan',
    );
    t.same(
      harness.evaluator.resolveCanonicalJoinBlockedAction(
        createTopologyBlockedEvaluation(),
        1000,
      ),
      {
        actionId:
          JOIN_READINESS_BLOCKED_ACTION_REPAIR_TOPOLOGY_VISIBILITY,
        pollIntervalMs: 1000,
      },
      'topology blockers should resolve to the canonical repair action plan',
    );
  },
);

test(
  'JoinReadinessEvaluator - defers canonical repair while local router pressure is active',
  async (t) => {
    const harness = createEvaluatorHarness({backpressured: true});
    const evaluation = createTopologyBlockedEvaluation();

    await harness.evaluator.repairCanonicalJoinReadinessIfNeeded(
      evaluation,
      1000,
    );

    t.equal(
      harness.backfillCalls.length,
      0,
      'topology repair should not trigger another backfill wave while the local router is backpressured',
    );

    harness.routerPressure.backpressured = false;
    harness.routerPressure.saturatedNodeCount = 0;
    harness.routerPressure.totalPending = 0;
    harness.routerPressure.maxPendingUtilization = 0;

    await harness.evaluator.repairCanonicalJoinReadinessIfNeeded(
      evaluation,
      1000,
    );

    t.equal(
      harness.backfillCalls.length,
      1,
      'repair should resume on the canonical backfill path after pressure clears',
    );
  },
);

test(
  'JoinReadinessEvaluator - respects the canonical repair cooldown between attempts',
  async (t) => {
    const harness = createEvaluatorHarness({backpressured: false});
    const evaluation = createTopologyBlockedEvaluation();
    let nowMs = 10000;
    harness.setNow(nowMs);

    await harness.evaluator.repairCanonicalJoinReadinessIfNeeded(
      evaluation,
      1000,
    );
    t.equal(
      harness.backfillCalls.length,
      1,
      'first topology repair attempt should backfill immediately',
    );

    nowMs += JOIN_READINESS_REPAIR.MIN_INTERVAL_MS - 1;
    harness.setNow(nowMs);
    await harness.evaluator.repairCanonicalJoinReadinessIfNeeded(
      evaluation,
      1000,
    );
    t.equal(
      harness.backfillCalls.length,
      1,
      'repair should respect the owner cooldown before launching another backfill attempt',
    );

    nowMs += 1;
    harness.setNow(nowMs);
    await harness.evaluator.repairCanonicalJoinReadinessIfNeeded(
      evaluation,
      1000,
    );
    t.equal(
      harness.backfillCalls.length,
      2,
      'repair should run again once the cooldown window has fully elapsed',
    );
  },
);

test(
  'JoinReadinessEvaluator - self target remains unreachable while local query transport readiness is unknown',
  async (t) => {
    const harness = createEvaluatorHarness();
    harness.evaluator.delegates.getMessageRouter = () => ({
      getOutboundPressureSummary: () => ({...harness.routerPressure}),
      getQueryDataPlaneTransportReadiness: () => ({
        state: 'unknown',
      }),
    });

    t.equal(
      harness.evaluator.isControlPlaneAddressReachable(
        'joining-node-readiness-evaluator/message-group/mg-local-r1',
      ),
      false,
      'self target should stay unreachable until local query transport readiness is explicitly ready',
    );

    t.same(
      harness.evaluator.resolveControlPlaneTargetConnectionStates([
        'joining-node-readiness-evaluator/message-group/mg-local-r1',
      ]),
      {
        'joining-node-readiness-evaluator/message-group/mg-local-r1':
          'self:unknown',
      },
      'diagnostics should preserve unknown self transport state instead of claiming self readiness',
    );
  },
);

test(
  'JoinReadinessEvaluator - excludes observed-converged MOVE_ASSIGNMENT rows from topology blockers',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case 'nodes':
          return [{
            node_id: 'seed-node',
            status: 'active',
          }, {
            node_id: 'target-node',
            status: 'active',
          }];
        case 'services':
          return [{
            service_id: 'mg-1-r2',
            replica_id: 'mg-1-r2',
            service_type: 'message_group',
            node_id: 'target-node',
            status: 'active',
          }];
        case 'replica_operations':
          return [{
            operation_id: 'assignment-1',
            type: 'MOVE_ASSIGNMENT',
            replica_id: 'mg-1-r2',
            source_node_id: 'seed-node',
            target_node_id: 'target-node',
            status: 'creating',
            workflow_step: 'PENDING',
            updated_at: 1234,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const result =
      harness.evaluator.collectCanonicalInFlightReplicaOperationDetails(
        cache,
      );

    t.equal(
      result.inFlightOperations.length,
      0,
      'topology gating should not count a MOVE_ASSIGNMENT whose target already owns the active service row',
    );
  },
);

test(
  'JoinReadinessEvaluator - excludes observed-converged message-group ADD rows from topology blockers',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case 'nodes':
          return [{
            node_id: 'seed-node',
            status: 'active',
          }, {
            node_id: 'target-node',
            status: 'active',
          }];
        case 'services':
          return [{
            service_id: 'mg-1-r2',
            replica_id: 'mg-1-r2',
            service_type: 'message_group',
            group_id: 'mg-1',
            node_id: 'target-node',
            status: 'active',
          }];
        case 'replica_operations':
          return [{
            operation_id: 'add-mg-1',
            type: 'ADD',
            entity_type: 'message_group',
            entity_id: 'mg-1',
            replica_id: 'mg-1-r2',
            source_node_id: 'seed-node',
            target_node_id: 'target-node',
            status: 'creating',
            workflow_step: 'CREATING',
            updated_at: 1234,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const result =
      harness.evaluator.collectCanonicalInFlightReplicaOperationDetails(
        cache,
      );

    t.equal(
      result.inFlightOperations.length,
      0,
      'topology gating should not count a message-group ADD whose target already owns the active service row',
    );
  },
);

test(
  'JoinReadinessEvaluator - excludes non-discovery partition operations from topology blockers',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case 'nodes':
          return [{
            node_id: 'seed-node',
            status: 'active',
          }, {
            node_id: 'target-node',
            status: 'active',
          }];
        case 'partitions':
          return [{
            partition_id: 'services-p1',
            table_name: 'services',
          }, {
            partition_id: 'sql_transactions-p1',
            table_name: 'sql_transactions',
          }];
        case 'services':
          return [];
        case 'replica_operations':
          // Joiner-sourced ops (source = this joining node) so the case
          // isolates the discovery-vs-non-discovery dimension under test;
          // bystander ops (joiner neither source nor target) are excluded by
          // a separate participation-aware rule covered elsewhere.
          return [{
            operation_id: 'svc-op-1',
            type: 'MOVE_REPLICA',
            partition_id: 'services-p1',
            replica_id: 'services-p1-r2',
            source_node_id: 'joining-node-readiness-evaluator',
            target_node_id: 'target-node',
            status: 'creating',
            workflow_step: 'PENDING',
            updated_at: 1234,
          }, {
            operation_id: 'tx-op-1',
            type: 'MOVE_REPLICA',
            partition_id: 'sql_transactions-p1',
            replica_id: 'sql_transactions-p1-r2',
            source_node_id: 'joining-node-readiness-evaluator',
            target_node_id: 'target-node',
            status: 'creating',
            workflow_step: 'PENDING',
            updated_at: 1235,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const result =
      harness.evaluator.collectCanonicalInFlightReplicaOperationDetails(
        cache,
      );

    t.equal(
      result.inFlightOperations.length,
      1,
      'topology gating should keep only discovery-critical partition operations',
    );
    t.equal(
      result.inFlightOperations[0]?.partitionId,
      'services-p1',
      'topology gating should continue to count discovery-critical service partitions',
    );
    t.equal(
      result.excludedNonDiscoveryPartitionCount,
      1,
      'topology gating should exclude unrelated transaction-recovery partitions',
    );
  },
);

test(
  'JoinReadinessEvaluator - topology can converge with only unrelated transaction partitions in flight',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case 'nodes':
          return [{
            node_id: 'seed-node',
            status: 'active',
          }, {
            node_id: 'target-node',
            status: 'active',
          }];
        case 'partitions':
          return [{
            partition_id: 'sql_transactions-p1',
            table_name: 'sql_transactions',
          }];
        case 'services':
          return [];
        case 'replica_operations':
          return [{
            operation_id: 'tx-op-1',
            type: 'MOVE_REPLICA',
            partition_id: 'sql_transactions-p1',
            replica_id: 'sql_transactions-p1-r2',
            source_node_id: 'seed-node',
            target_node_id: 'target-node',
            status: 'creating',
            workflow_step: 'PENDING',
            updated_at: 1234,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const result =
      harness.evaluator.evaluateCanonicalJoinTopologyReadiness(
        cache,
      );

    t.equal(
      result.ready,
      true,
      'topology gating should not strand join readiness on unrelated transaction partitions',
    );
    t.equal(
      result.inFlightReplicaOperations,
      0,
      'unrelated transaction partitions should not count toward topology in-flight blockers',
    );
    t.equal(
      result.excludedNonDiscoveryPartitionCount,
      1,
      'diagnostics should report when unrelated partitions were excluded',
    );
  },
);

test(
  'JoinReadinessEvaluator - topology can converge while remote priority control-plane recovery is still in flight',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case 'nodes':
          return [{
            node_id: 'joining-node-readiness-evaluator',
            status: 'joining',
          }, {
            node_id: 'seed-node',
            status: 'active',
          }, {
            node_id: 'target-node',
            status: 'active',
          }];
        case 'partitions':
          return [{
            partition_id: 'replica_operations-p1',
            table_name: 'replica_operations',
          }];
        case 'services':
          return [];
        case 'replica_operations':
          return [{
            operation_id: 'priority-op-1',
            type: 'REPLACE',
            partition_id: 'replica_operations-p1',
            replica_id: 'replica_operations-p1-r4',
            source_node_id: 'seed-node',
            target_node_id: 'target-node',
            status: 'syncing',
            workflow_step: 'SYNCING',
            updated_at: 1234,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const operationDetails =
      harness.evaluator.collectCanonicalInFlightReplicaOperationDetails(
        cache,
      );
    t.equal(
      operationDetails.inFlightOperations.length,
      0,
      'join topology blockers should exclude remote priority control-plane recovery after active-peer fan-out begins',
    );
    t.equal(
      operationDetails.excludedRemotePriorityControlPlaneCount,
      1,
      'diagnostics should report tolerated remote priority control-plane recovery',
    );
    t.match(
      operationDetails.excludedRemotePriorityControlPlaneOperationDetails,
      [{
        operationId: 'priority-op-1',
        type: 'REPLACE',
        partitionId: 'replica_operations-p1',
        replicaId: 'replica_operations-p1-r4',
        sourceNodeId: 'seed-node',
        targetNodeId: 'target-node',
        status: 'syncing',
        workflowStep: 'SYNCING',
        completedAt: null,
        ageMs: Number,
      }],
      'diagnostics should preserve the tolerated remote priority recovery details',
    );

    const result =
      harness.evaluator.evaluateCanonicalJoinTopologyReadiness(
        cache,
      );

    t.equal(
      result.ready,
      true,
      'join topology should stay open while unrelated remote priority control-plane recovery continues',
    );
    t.equal(
      result.inFlightReplicaOperations,
      0,
      'tolerated remote priority control-plane recovery should not count as a blocking in-flight operation',
    );
    t.equal(
      result.excludedRemotePriorityControlPlaneCount,
      1,
      'topology diagnostics should surface the tolerated remote priority control-plane recovery count',
    );
  },
);

test(
  'JoinReadinessEvaluator - topology can converge while self-source priority control-plane replacement drains to an active target',
  async (t) => {
    const harness = createEvaluatorHarness();
    const cache = {
      getAll(tableName) {
        switch (tableName) {
        case JOIN_READINESS_TEST_TABLE.NODES:
          return [{
            node_id: JOIN_READINESS_TEST_NODE_ID,
            status: JOIN_READINESS_TEST_NODE_STATUS.JOINING,
          }, {
            node_id: JOIN_READINESS_TEST_SEED_NODE_ID,
            status: JOIN_READINESS_TEST_NODE_STATUS.ACTIVE,
          }, {
            node_id: JOIN_READINESS_TEST_TARGET_NODE_ID,
            status: JOIN_READINESS_TEST_NODE_STATUS.ACTIVE,
          }];
        case JOIN_READINESS_TEST_TABLE.PARTITIONS:
          return [{
            partition_id: JOIN_READINESS_TEST_PRIORITY_PARTITION_ID,
            table_name: JOIN_READINESS_TEST_PRIORITY_TABLE_NAME,
          }];
        case JOIN_READINESS_TEST_TABLE.SERVICES:
          return [];
        case JOIN_READINESS_TEST_TABLE.REPLICA_OPERATIONS:
          return [{
            operation_id: JOIN_READINESS_TEST_PRIORITY_OPERATION_ID,
            type: JOIN_READINESS_TEST_OPERATION_TYPE.REPLACE,
            partition_id: JOIN_READINESS_TEST_PRIORITY_PARTITION_ID,
            replica_id: JOIN_READINESS_TEST_PRIORITY_REPLICA_ID,
            source_node_id: JOIN_READINESS_TEST_NODE_ID,
            target_node_id: JOIN_READINESS_TEST_TARGET_NODE_ID,
            status: JOIN_READINESS_TEST_OPERATION_STATUS.SYNCING,
            workflow_step: JOIN_READINESS_TEST_WORKFLOW_STEP.SYNCING,
            updated_at: JOIN_READINESS_TEST_OPERATION_UPDATED_AT_MS,
          }];
        default:
          return [];
        }
      },
    };
    harness.evaluator.delegates.getMissingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });
    harness.evaluator.delegates.getBlockingSystemServiceLeaders = () => ({
      partitions: [],
      messageGroups: [],
    });

    const operationDetails =
      harness.evaluator.collectCanonicalInFlightReplicaOperationDetails(
        cache,
      );
    t.equal(
      operationDetails.inFlightOperations.length,
      JOIN_READINESS_TEST_NO_BLOCKERS,
      'join topology blockers should exclude self-source priority control-plane replacement once the target is active',
    );
    t.equal(
      operationDetails.excludedSelfSourcePriorityControlPlaneCount,
      JOIN_READINESS_TEST_ONE_EXCLUSION,
      'diagnostics should report tolerated self-source priority control-plane replacement',
    );
    t.match(
      operationDetails.excludedSelfSourcePriorityControlPlaneOperationDetails,
      [{
        operationId: JOIN_READINESS_TEST_PRIORITY_OPERATION_ID,
        type: JOIN_READINESS_TEST_OPERATION_TYPE.REPLACE,
        partitionId: JOIN_READINESS_TEST_PRIORITY_PARTITION_ID,
        replicaId: JOIN_READINESS_TEST_PRIORITY_REPLICA_ID,
        sourceNodeId: JOIN_READINESS_TEST_NODE_ID,
        targetNodeId: JOIN_READINESS_TEST_TARGET_NODE_ID,
        status: JOIN_READINESS_TEST_OPERATION_STATUS.SYNCING,
        workflowStep: JOIN_READINESS_TEST_WORKFLOW_STEP.SYNCING,
        ageMs: Number,
      }],
      'diagnostics should preserve the tolerated self-source priority replacement details',
    );

    const result =
      harness.evaluator.evaluateCanonicalJoinTopologyReadiness(
        cache,
      );

    t.equal(
      result.ready,
      true,
      'join topology should stay open while self-source priority control-plane replacement drains to an active target',
    );
    t.equal(
      result.inFlightReplicaOperations,
      JOIN_READINESS_TEST_NO_BLOCKERS,
      'tolerated self-source priority control-plane replacement should not count as a blocking in-flight operation',
    );
    t.equal(
      result.excludedSelfSourcePriorityControlPlaneCount,
      JOIN_READINESS_TEST_ONE_EXCLUSION,
      'topology diagnostics should surface the tolerated self-source priority control-plane replacement count',
    );
  },
);
