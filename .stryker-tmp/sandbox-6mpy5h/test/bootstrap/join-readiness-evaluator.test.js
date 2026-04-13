// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';
import {
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from '../../src/bootstrap/node-joining-constants.js';

function createEvaluatorHarness(options = {}) {
  let nowMs = options.nowMs ?? 10000;
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
            return [{
              operation_id: 'svc-op-1',
              type: 'MOVE_REPLICA',
              partition_id: 'services-p1',
              replica_id: 'services-p1-r2',
              source_node_id: 'seed-node',
              target_node_id: 'target-node',
              status: 'creating',
              workflow_step: 'PENDING',
              updated_at: 1234,
            }, {
              operation_id: 'tx-op-1',
              type: 'MOVE_REPLICA',
              partition_id: 'sql_transactions-p1',
              replica_id: 'sql_transactions-p1-r2',
              source_node_id: 'seed-node',
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
