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
