// Witness for the behaviour-changing-consumer-convergence quest (S1.1-B).
// Raw node:test so the anchored runner selects exactly one scenario.
//
// SCOPE. Quest A proved the authority CONTRACT (one positional row, own data
// properties only, fail-closed) and its CREATION BOUNDARY. This quest proves
// the CONSUMER INVENTORY: every behaviour-changing desired-RF consumer in the
// partition/message-group plane resolves its target through
// resolveDesiredReplicationFactor, an undeclared policy fails closed in the
// non-releasing direction each consumer documents, the one recorded planner
// divergence is WITNESSED and not silently repaired, and the self-hosted
// message-group hand-off (declared RF 3, recovery convergible) holds.
//
// It makes NO service-plane claim (service descriptors, join-admission
// projections) — that inventory belongs to the drafted
// service-plane-replication-authority-inventory quest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  FIXTURE_SCENARIO,
} from './anchored-runner-fixture-cases.js';

import {
  DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../../src/bootstrap/replication-target-authority.js';
import {TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  NodeStatus,
  ReplicaStatus as RecoveryReplicaStatus,
  ReplicaRecoveryService,
  ServiceType as RecoveryServiceType,
} from '../../src/node/replica-recovery-service.js';
import {
  createPartitionServiceLearnerPromotionMethods,
} from '../../src/partition/partition-service-learner-promotion-methods.js';
import {ManagedSplitWorkflow} from '../../src/partition/managed-split-workflow.js';
import {ManagedMergeWorkflow} from '../../src/partition/managed-merge-workflow.js';
import {MANAGED_MERGE_ERROR_MSG} from '../../src/partition/partition-constants.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {
  defineTableCreationExistingTableReconciliation,
} from '../../src/query/table-creation-service-existing-table-reconciliation.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
} from '../../src/query/table-creation-service-completion.js';
import {
  createSQLQueryEngineRoutingMetadataMethods,
} from '../../src/query/sql-query-engine-routing-metadata-methods.js';
import {
  evaluateOperationLedgerQuorumConcentration,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {
  ReplicaStatus as LedgerReplicaStatus,
} from '../../src/rebalancer/replica-operation-progress.js';
import {VOTER_RAFT_ROLES} from '../../src/raft/replica-voter-readiness.js';
import {
  applyUnifiedRebalancerControlPlaneReadinessMethods,
} from '../../src/rebalancer/unified-rebalancer-control-plane-readiness-methods.js';
import {
  buildDurableRejoinPartitionRestorePlans,
} from '../../src/bootstrap/shared/durable-rejoin-partition-restore-planner.js';
import {
  MessageGroupAssignment,
} from '../../src/bootstrap/message-group-assignment.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');

// Quiet, deterministic singletons for every consumer under witness.
if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/**
 * Table-keyed in-memory system-table cache honouring the getAll/filter/get
 * trio every consumer under witness reads through.
 * @param {Object<string, Array<Object>>} data - Rows keyed by table name.
 * @return {Object} Cache facade.
 */
function makeCache(data = {}) {
  const tables = {...data};
  return {
    getAll(tableName) {
      return tables[tableName] || [];
    },
    filter(tableName, predicate) {
      return (tables[tableName] || []).filter(predicate);
    },
    get(tableName, id) {
      return (tables[tableName] || []).find((row) =>
        row.id === id ||
        row.node_id === id ||
        row.partition_id === id ||
        row.group_id === id ||
        row.table_id === id,
      );
    },
    tables,
  };
}

/**
 * Gateway capture: records every control-plane mutation a consumer submits.
 * @return {Object} Gateway with a mutations log.
 */
function makeGatewayCapture() {
  const mutations = [];
  return {
    mutations,
    async submitMutation(mutation) {
      mutations.push(mutation);
      return {success: true, visibilityState: 'visible'};
    },
  };
}

const activeNodes = (ids) => ids.map((nodeId) => ({
  node_id: nodeId,
  status: NodeStatus.ACTIVE,
  connection_state: 'ready',
}));

/**
 * Recovery service over a mock cache and gateway capture.
 * @param {Object} tables - Cache rows keyed by table name.
 * @return {{service: ReplicaRecoveryService, gateway: Object}} Pair.
 */
function makeRecoveryFixture(tables) {
  const gateway = makeGatewayCapture();
  const service = new ReplicaRecoveryService({
    nodeId: 'witness-node',
    systemTableCache: makeCache(tables),
    controlPlaneSystemTableGateway: gateway,
  });
  return {service, gateway};
}

const SENTINEL = 'consumer-convergence-witness-sentinel';

/**
 * Run an async workflow expected to abort at the sentinel capture point.
 * @param {Function} run - Async invocation.
 * @return {Promise<void>} Resolves when the sentinel rejection is observed.
 */
async function expectSentinel(run) {
  await assert.rejects(run, (error) => error?.message === SENTINEL);
}

/**
 * Fake split-workflow context aborting at calculateQuorumReplicaCount.
 * @param {Object} partitionRow - Persisted source-partition row.
 * @param {Object} capture - Mutable holder for the captured count.
 * @return {Object} Prototype-borrow context.
 */
function makeSplitContext(partitionRow, capture) {
  return {
    getPartitionInfo: () => partitionRow,
    isLocalManagedSplitLeader: () => true,
    resolveSplitAdmissionTableContext: () => ({
      tableName: 'witness_table',
      tableId: 'witness-table',
      tableInfo: {partition_key: 'id'},
      existingTransition: null,
    }),
    assertSplitTransitionAdmission: () => {},
    calculateQuorumReplicaCount: (count) => {
      capture.replicaCount = count;
      throw new Error(SENTINEL);
    },
  };
}

/**
 * Fake merge-workflow context aborting at calculateQuorumReplicaCount.
 * @param {Object} leftInfo - Persisted left source-partition row.
 * @param {Object} capture - Mutable holder for the captured count.
 * @return {Object} Prototype-borrow context.
 */
function makeMergeContext(leftInfo, capture) {
  return {
    resolveMergeExecutionContext: () => ({
      leftInfo,
      rightInfo: {partition_id: 'witness-right'},
      leftRange: {},
      rightRange: {},
      tableInfo: {},
      tableId: 'witness-table',
      tableName: 'witness_table',
      primaryKeyColumn: 'id',
      existingTransition: null,
    }),
    estimateMergedBytes: () => 0,
    assertUnderMergeThreshold: () => {},
    calculateQuorumReplicaCount: (count) => {
      capture.replicaCount = count;
      throw new Error(SENTINEL);
    },
  };
}

/**
 * Reconciliation host with the decision point instrumented.
 * @param {Object} partitionRow - Existing partition row the cache serves.
 * @param {Object} capture - Mutable holder for the captured count.
 * @return {Object} Instance carrying reconcileExistingInitialPartition.
 */
function makeReconciliationInstance(partitionRow, capture) {
  class ReconciliationHost {}
  defineTableCreationExistingTableReconciliation(ReconciliationHost);
  const instance = new ReconciliationHost();
  instance.findExistingPartitionRecord = async () => partitionRow;
  instance.provisionInitialPartition = async (options) => {
    capture.replicaCount = options.replicaCount;
    throw new Error(SENTINEL);
  };
  return instance;
}

/**
 * Routing-metadata host built from the exported descriptor factory.
 * @return {Object} Instance carrying the overlay coverage resolver.
 */
function makeRoutingInstance() {
  class RoutingHost {}
  Object.defineProperties(
    RoutingHost.prototype,
    createSQLQueryEngineRoutingMetadataMethods(),
  );
  return new RoutingHost();
}

/**
 * Promotion target read over a cache-served partition row.
 * @param {Object|null} partitionRow - Row or null.
 * @return {number} Promotion target.
 */
function promotionTargetFor(partitionRow) {
  const methods = createPartitionServiceLearnerPromotionMethods();
  const context = {
    partitionId: 'witness-p1',
    systemTableCache: makeCache({
      [TABLES.PARTITIONS]: partitionRow ? [partitionRow] : [],
    }),
  };
  return methods.getTargetReplicaCountForPromotion.call(context);
}

/**
 * Readiness host with priority classification pinned on.
 * @param {Object|null} partitionRow - Row the cache serves for entityId.
 * @return {number} Priority control-plane target replica count.
 */
function readinessTargetFor(partitionRow) {
  class ReadinessHost {}
  applyUnifiedRebalancerControlPlaneReadinessMethods(ReadinessHost);
  const instance = new ReadinessHost();
  instance.entityId = 'witness-p1';
  instance.systemTableCache = makeCache({
    [TABLES.PARTITIONS]: partitionRow ? [partitionRow] : [],
  });
  instance.isControlPlanePriorityPartition = () => true;
  return instance.getPriorityControlPlaneTargetReplicaCount();
}

const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const VOTER_ROLE = [...VOTER_RAFT_ROLES][0];

/**
 * Concentrated operation-ledger cache: three voters on one node.
 * @param {Object} partitionRow - Ledger partition row (policy carrier).
 * @return {Object} Cache.
 */
function makeConcentratedLedgerCache(partitionRow) {
  const voter = (replicaIndex) => ({
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: LEDGER_PARTITION_ID,
    node_id: 'n1',
    replica_id: `ledger-r${replicaIndex}`,
    status: LedgerReplicaStatus.ACTIVE,
    raft_role: VOTER_ROLE,
  });
  return makeCache({
    [TABLES.SERVICES]: [voter(1), voter(2), voter(3)],
    [TABLES.NODES]: activeNodes(['n1', 'n2']),
    [TABLES.PARTITIONS]: [partitionRow],
  });
}

/**
 * Durable-rejoin cache: four restorable replicas of p1, one on the joiner.
 * @param {Object} partitionRow - Partition row (policy carrier).
 * @return {Object} Cache.
 */
function makeRejoinCache(partitionRow) {
  const serviceRow = (replicaIndex, nodeId) => ({
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    replica_id: `rejoin-r${replicaIndex}`,
    service_id: `rejoin-r${replicaIndex}`,
    partition_id: 'p1',
    status: 'active',
    address: `${nodeId}:9000`,
  });
  return makeCache({
    [TABLES.SERVICES]: [
      serviceRow(1, 'joiner-node'),
      serviceRow(2, 'n2'),
      serviceRow(3, 'n3'),
      serviceRow(4, 'n4'),
    ],
    [TABLES.PARTITIONS]: [partitionRow],
    [TABLES.TABLES]: [{
      table_id: 't1',
      table_name: 'witness_table',
      schema_definition: JSON.stringify({
        columns: [{name: 'id', type: 'TEXT'}],
        primaryKey: 'id',
      }),
    }],
    [TABLES.REPLICA_OPERATIONS]: [],
  });
}

/**
 * Rejoin restore plans for a partition row.
 * @param {Object} partitionRow - Partition row (policy carrier).
 * @return {Array<Object>} Restore plans for the joiner node.
 */
function rejoinPlansFor(partitionRow) {
  return buildDurableRejoinPartitionRestorePlans({
    systemTableCache: makeRejoinCache(partitionRow),
    nodeId: 'joiner-node',
    dataDir: '/tmp/consumer-convergence-witness',
  });
}

const CONSUMER_INVENTORY_FILES = [
  'src/node/replica-recovery-service.js',
  'src/partition/partition-service-learner-promotion-methods.js',
  'src/partition/managed-split-workflow.js',
  'src/partition/managed-merge-workflow.js',
  'src/query/table-creation-service-existing-table-reconciliation.js',
  'src/query/sql-query-engine-routing-metadata-methods.js',
  'src/rebalancer/operation-ledger-quorum-concentration.js',
  'src/rebalancer/unified-rebalancer-control-plane-readiness-methods.js',
  'src/bootstrap/shared/durable-rejoin-partition-restore-planner.js',
  'src/bootstrap/message-group-assignment.js',
  'src/bootstrap/phases/create-message-group-phase.js',
];

const MOVE_PLANNER_FILE = 'src/rebalancer/move-planner.js';
const MOVE_PLANNER_DIVERGENT_FALLBACK =
  'policy.targetReplicaCount || policy.replicaCount || NUM.THREE';
const AUTHORITY_MODULE_TOKEN = 'replication-target-authority';

/**
 * Read a repo file as text.
 * @param {string} relativePath - Path from the repo root.
 * @return {string} File contents.
 */
function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// Routed-consumer receipts
// ---------------------------------------------------------------------------

test('recovery-partition-target-resolves-through-authority', async () => {
  const partitionTables = (declaredCount) => ({
    [SYSTEM_TABLE_NAME.PARTITIONS]: [{
      partition_id: 'p1',
      table_id: 't1',
      replica_count: declaredCount,
    }],
    [SYSTEM_TABLE_NAME.SERVICES]: [{
      partition_id: 'p1',
      service_type: RecoveryServiceType.PARTITION_REPLICA,
      status: RecoveryReplicaStatus.ACTIVE,
      node_id: 'n1',
    }],
    [SYSTEM_TABLE_NAME.NODES]: activeNodes(['n1', 'n2', 'n3', 'n4', 'n5']),
  });

  const five = makeRecoveryFixture(partitionTables(5));
  await five.service.checkPartitionReplicas();
  assert.equal(five.gateway.mutations.length, 4,
    'declared RF 5 with 1 healthy replica must create exactly 4');

  const three = makeRecoveryFixture(partitionTables(3));
  await three.service.checkPartitionReplicas();
  assert.equal(three.gateway.mutations.length, 2,
    'declared RF 3 with 1 healthy replica must create exactly 2');

  // The target is a function of the ROW: identical identity state, different
  // declaration, different behaviour. No config minimum can restate it.
  assert.notEqual(
    five.gateway.mutations.length,
    three.gateway.mutations.length,
  );
});

test('recovery-message-group-target-resolves-through-authority', async () => {
  const groupTables = (declaredCount) => ({
    [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: [{
      group_id: 'g1',
      replica_count: declaredCount,
    }],
    [SYSTEM_TABLE_NAME.SERVICES]: [{
      group_id: 'g1',
      service_type: RecoveryServiceType.MESSAGE_GROUP_REPLICA,
      status: RecoveryReplicaStatus.ACTIVE,
      node_id: 'n1',
    }],
    [SYSTEM_TABLE_NAME.NODES]: activeNodes(['n1', 'n2', 'n3', 'n4', 'n5']),
  });

  const five = makeRecoveryFixture(groupTables(5));
  await five.service.checkMessageGroupReplicas();
  assert.equal(five.gateway.mutations.length, 4,
    'declared RF 5 with 1 healthy replica must create exactly 4');

  const three = makeRecoveryFixture(groupTables(3));
  await three.service.checkMessageGroupReplicas();
  assert.equal(three.gateway.mutations.length, 2,
    'declared RF 3 with 1 healthy replica must create exactly 2');
});

test('learner-promotion-target-resolves-through-authority', () => {
  assert.equal(
    promotionTargetFor({partition_id: 'witness-p1', replica_count: 5}),
    5,
  );
  assert.equal(
    promotionTargetFor({partition_id: 'witness-p1', replica_count: 3}),
    3,
  );
  // The removed ladder read this.replicaCount (identity-derived). A context
  // carrying a contradictory identity count must not influence the target.
  const methods = createPartitionServiceLearnerPromotionMethods();
  const context = {
    partitionId: 'witness-p1',
    replicaCount: 7,
    systemTableCache: makeCache({
      [TABLES.PARTITIONS]: [{partition_id: 'witness-p1', replica_count: 3}],
    }),
  };
  assert.equal(methods.getTargetReplicaCountForPromotion.call(context), 3,
    'identity-derived context count must not leak into the promotion target');
});

test('split-workflow-target-resolves-through-authority', async () => {
  const captureFive = {};
  await expectSentinel(() => ManagedSplitWorkflow.prototype.executeInternal
    .call(makeSplitContext(
      {partition_id: 'p1', replica_count: 5}, captureFive,
    ), 'p1'));
  assert.equal(captureFive.replicaCount, 5);

  const captureThree = {};
  await expectSentinel(() => ManagedSplitWorkflow.prototype.executeInternal
    .call(makeSplitContext(
      {partition_id: 'p1', replica_count: 3}, captureThree,
    ), 'p1'));
  assert.equal(captureThree.replicaCount, 3);
});

test('merge-workflow-target-resolves-through-authority', async () => {
  const captureFive = {};
  await expectSentinel(() => ManagedMergeWorkflow.prototype.executeInternal
    .call(makeMergeContext(
      {partition_id: 'pL', replica_count: 5}, captureFive,
    ), ['pL', 'pR']));
  assert.equal(captureFive.replicaCount, 5);

  const captureThree = {};
  await expectSentinel(() => ManagedMergeWorkflow.prototype.executeInternal
    .call(makeMergeContext(
      {partition_id: 'pL', replica_count: 3}, captureThree,
    ), ['pL', 'pR']));
  assert.equal(captureThree.replicaCount, 3);
});

test('table-reconciliation-target-resolves-through-authority', async () => {
  const captureFive = {};
  await expectSentinel(() => makeReconciliationInstance(
    {partition_id: 't1-p1', replica_count: 5}, captureFive,
  ).reconcileExistingInitialPartition('witness_table', {table_id: 't1'}, {}));
  assert.equal(captureFive.replicaCount, 5);

  const captureThree = {};
  await expectSentinel(() => makeReconciliationInstance(
    {partition_id: 't1-p1', replica_count: 3}, captureThree,
  ).reconcileExistingInitialPartition('witness_table', {table_id: 't1'}, {}));
  assert.equal(captureThree.replicaCount, 3);
});

test('routing-overlay-target-resolves-through-authority', () => {
  const routing = makeRoutingInstance();
  const threeServices = [{}, {}, {}];

  const expectingFive = routing.resolveAuthoritativeRoutingOverlayServiceCoverage(
    {partition_id: 'p1', replica_count: 5},
    threeServices,
  );
  assert.equal(expectingFive.expectedReplicaCount, 5);

  const expectingThree = routing.resolveAuthoritativeRoutingOverlayServiceCoverage(
    {partition_id: 'p1', replica_count: 3},
    threeServices,
  );
  assert.equal(expectingThree.expectedReplicaCount, 3);

  // Same observation, different declaration, different coverage verdict:
  // 3 observed services are INCOMPLETE against RF 5 and COMPLETE against RF 3.
  assert.notEqual(expectingFive.state, expectingThree.state);
});

test('quorum-concentration-target-resolves-through-authority', () => {
  const underTarget = evaluateOperationLedgerQuorumConcentration(
    makeConcentratedLedgerCache({
      partition_id: LEDGER_PARTITION_ID,
      replica_count: 5,
    }),
  );
  assert.equal(underTarget.concentratedPartitions.length, 1);
  assert.equal(underTarget.concentratedPartitions[0].targetReplicaCount, 5);
  assert.equal(underTarget.concentratedPartitions[0].overTarget, false);

  const overTarget = evaluateOperationLedgerQuorumConcentration(
    makeConcentratedLedgerCache({
      partition_id: LEDGER_PARTITION_ID,
      replica_count: 2,
    }),
  );
  assert.equal(overTarget.concentratedPartitions[0].targetReplicaCount, 2);
  assert.equal(overTarget.concentratedPartitions[0].overTarget, true,
    '3 voters against a declared target of 2 must classify over-target');
});

test('control-plane-readiness-target-resolves-through-authority', () => {
  assert.equal(
    readinessTargetFor({partition_id: 'witness-p1', replica_count: 5}),
    5,
    'a declared row must decide the readiness target, not the bootstrap value',
  );
  assert.equal(
    readinessTargetFor({partition_id: 'witness-p1', replica_count: 3}),
    3,
  );
});

test('rejoin-restore-target-resolves-through-authority', () => {
  const partitionRow = (declaredCount) => ({
    partition_id: 'p1',
    table_id: 't1',
    table_name: 'witness_table',
    replica_count: declaredCount,
    partition_key_start: null,
    partition_key_end: null,
  });

  // 4 restorable service rows <= RF 5: the joiner's replica must be restored.
  assert.equal(rejoinPlansFor(partitionRow(5)).length, 1);
  // 4 restorable service rows > RF 3 with no active replica-operation owner:
  // restoring would re-add surplus identity, so the plan must be withheld.
  assert.equal(rejoinPlansFor(partitionRow(3)).length, 0);
});

test('message-group-assignment-policy-not-identity-count', () => {
  const assignment = new MessageGroupAssignment({seedNodeAddress: 'seed:9000'});
  const groupId = assignment.generateGroupId('n1');
  const groupWith = (declaredCount) => [{
    group_id: groupId,
    replica_count: declaredCount,
    replicas: [{node_id: 'n1', replica_id: `${groupId}-replica-1`}],
  }];

  const reusedFive = assignment.determineAssignment('n1', groupWith(5));
  assert.equal(reusedFive.reuseExistingGroup, true);
  assert.equal(reusedFive.replicaCount, 5,
    'the reuse plan must carry the DECLARED policy');
  assert.notEqual(reusedFive.replicaCount, 1,
    'the observed identity count (1 replica) must never restate the plan');

  const reusedThree = assignment.determineAssignment('n1', groupWith(3));
  assert.equal(reusedThree.replicaCount, 3);

  const fresh = assignment.determineAssignment('n9', []);
  assert.equal(fresh.replicaCount, DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
    'a fresh self-hosted plan follows the MESSAGE_GROUPS schema declaration');
});

// ---------------------------------------------------------------------------
// Fail-closed and divergence receipts
// ---------------------------------------------------------------------------

test('undeclared-policy-fails-closed-in-consumers', async () => {
  // Recovery: an undeclared row is SKIPPED — no deficit is manufactured from
  // a config minimum, no replica is created.
  const recovery = makeRecoveryFixture({
    [SYSTEM_TABLE_NAME.PARTITIONS]: [{partition_id: 'pU', table_id: 't1'}],
    [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: [{group_id: 'gU'}],
    [SYSTEM_TABLE_NAME.SERVICES]: [],
    [SYSTEM_TABLE_NAME.NODES]: activeNodes(['n1', 'n2', 'n3']),
  });
  const partitionSummary = await recovery.service.checkPartitionReplicas();
  const groupSummary = await recovery.service.checkMessageGroupReplicas();
  assert.equal(recovery.gateway.mutations.length, 0);
  assert.equal(partitionSummary.deficitCount, 0);
  assert.equal(groupSummary.deficitCount, 0);

  // Promotion: an undeclared target DEFERS promotion (0), never admits one.
  assert.equal(promotionTargetFor({partition_id: 'witness-p1'}), 0);
  assert.equal(promotionTargetFor(null), 0);

  // Split and merge: an undeclared policy REFUSES the workflow.
  await assert.rejects(
    () => ManagedSplitWorkflow.prototype.executeInternal
      .call(makeSplitContext({partition_id: 'p1'}, {}), 'p1'),
    (error) => error?.message ===
      QUERY_ERROR_MSG.TABLE_SPLIT_REPLICATION_POLICY_UNDECLARED,
  );
  await assert.rejects(
    () => ManagedMergeWorkflow.prototype.executeInternal
      .call(makeMergeContext({partition_id: 'pL'}, {}), ['pL', 'pR']),
    (error) => error?.message ===
      MANAGED_MERGE_ERROR_MSG.REPLICATION_POLICY_UNDECLARED,
  );

  // Reconciliation: an undeclared existing partition fails the retry closed
  // instead of silently provisioning with the creation default.
  await assert.rejects(
    () => makeReconciliationInstance({partition_id: 't1-p1'}, {})
      .reconcileExistingInitialPartition('witness_table', {table_id: 't1'}, {}),
    (error) => String(error?.message || '').startsWith(
      TABLE_CREATION_SERVICE_LITERAL.EXISTING_PARTITION_REPLICATION_POLICY_UNDECLARED,
    ),
  );

  // Routing overlay: an undeclared policy is an explicit UNKNOWN, never a
  // complete-coverage verdict.
  const routing = makeRoutingInstance();
  const unknownCoverage = routing.resolveAuthoritativeRoutingOverlayServiceCoverage(
    {partition_id: 'p1'},
    [{}, {}, {}],
  );
  assert.equal(unknownCoverage.expectedReplicaCount, 0);
  const declaredCoverage = routing.resolveAuthoritativeRoutingOverlayServiceCoverage(
    {partition_id: 'p1', replica_count: 3},
    [{}, {}, {}],
  );
  assert.notEqual(unknownCoverage.state, declaredCoverage.state);

  // Quorum concentration: an undeclared target stays null and can never
  // classify a partition as over-target.
  const ledger = evaluateOperationLedgerQuorumConcentration(
    makeConcentratedLedgerCache({partition_id: LEDGER_PARTITION_ID}),
  );
  assert.equal(ledger.concentratedPartitions[0].targetReplicaCount, null);
  assert.equal(ledger.concentratedPartitions[0].overTarget, false);

  // Readiness: the bootstrap expected RF may only keep the gate CONSERVATIVE.
  // Undeclared must never resolve to 0 — that would shrink the quorum target
  // to 1 and RELEASE readiness on a lone node.
  const undeclaredReadinessTarget = readinessTargetFor(null);
  assert.ok(undeclaredReadinessTarget >= 3,
    'undeclared readiness target must stay in the blocking direction');

  // Rejoin restore: undeclared keeps the planner's conservative branch —
  // the durable replica is restored, never silently dropped.
  assert.equal(rejoinPlansFor({
    partition_id: 'p1',
    table_id: 't1',
    table_name: 'witness_table',
    partition_key_start: null,
    partition_key_end: null,
  }).length, 1);

  // Assignment: an undeclared reused group falls back to the DECLARED schema
  // default, never to the observed identity count.
  const assignment = new MessageGroupAssignment({seedNodeAddress: 'seed:9000'});
  const groupId = assignment.generateGroupId('n1');
  const reused = assignment.determineAssignment('n1', [{
    group_id: groupId,
    replicas: [{node_id: 'n1', replica_id: `${groupId}-replica-1`}],
  }]);
  assert.equal(reused.replicaCount, DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT);
  assert.notEqual(reused.replicaCount, 1);
});

test('planner-placement-divergence-witnessed-not-repaired', () => {
  // Constraint planner-exception-not-repaired: move-planner's divergent
  // fallback is S6b scope. This receipt WITNESSES the divergence so a silent
  // repair (or a silent widening) turns the quest red instead of passing
  // unremarked.
  const plannerSource = readRepoFile(MOVE_PLANNER_FILE);
  assert.ok(plannerSource.includes(MOVE_PLANNER_DIVERGENT_FALLBACK),
    'move-planner must still carry its recorded divergent fallback verbatim');
  assert.ok(!plannerSource.includes(AUTHORITY_MODULE_TOKEN),
    'move-planner must not import the authority behind this receipt\'s back');
});

test('self-hosted-group-declared-policy-recovery-convergible', async () => {
  // HAND-OFF DECISION A (recorded on quest A): the self-hosted message group
  // persists declared replica_count 3 where it once persisted the observed
  // count 1. Recovery reading that declaration must CONVERGE the group to 3
  // and then stop. Restoring the observed count is sealed as forbidden.
  const selfHostedTables = {
    [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: [{
      group_id: 'mg-selfhosted',
      replica_count: 3,
    }],
    [SYSTEM_TABLE_NAME.SERVICES]: [{
      group_id: 'mg-selfhosted',
      service_type: RecoveryServiceType.MESSAGE_GROUP_REPLICA,
      status: RecoveryReplicaStatus.ACTIVE,
      node_id: 'n1',
    }],
    [SYSTEM_TABLE_NAME.NODES]: activeNodes(['n1', 'n2', 'n3']),
  };
  const {service, gateway} = makeRecoveryFixture(selfHostedTables);

  await service.checkMessageGroupReplicas();
  assert.equal(gateway.mutations.length, 2,
    'a one-replica RF-3 group must drive exactly two replica creations');
  const targetNodeIds = gateway.mutations.map((m) => m.row.node_id);
  assert.equal(new Set(targetNodeIds).size, 2,
    'the two creations must land on distinct nodes');
  assert.ok(!targetNodeIds.includes('n1'),
    'creations must prefer nodes without an existing replica');
  for (const mutation of gateway.mutations) {
    assert.equal(mutation.row.group_id, 'mg-selfhosted');
  }

  // Convergence: with the created replicas ACTIVE the deficit is closed and
  // recovery is quiescent — no oscillation, no surplus.
  for (const mutation of gateway.mutations) {
    selfHostedTables[SYSTEM_TABLE_NAME.SERVICES].push({
      ...mutation.row,
      status: RecoveryReplicaStatus.ACTIVE,
    });
  }
  const converged = makeRecoveryFixture(selfHostedTables);
  const summary = await converged.service.checkMessageGroupReplicas();
  assert.equal(converged.gateway.mutations.length, 0);
  assert.equal(summary.deficitCount, 0);
});

test('no-consumer-fallback-grammar-outside-authority', () => {
  // Census over the inventoried consumer files: every desired-RF fallback
  // spelled `<x>.replica_count || y` / `?? y` was the class-(1) grammar this
  // quest removes. The only permitted right operand is a DECLARED_* authority
  // export (declared-default grammar), and every consumer must import the
  // authority. move-planner is deliberately absent from this census: its
  // divergence is witnessed, not repaired (S6b).
  // A leading `!` makes the left side a boolean guard (`!x || x < min`),
  // which cannot yield a policy value; only un-negated reads are fallbacks.
  const fallbackPattern =
    /(!)?[\w$.]*replica_?[cC]ount\s*(?:\|\||\?\?)\s*([A-Za-z_$][\w$.]*)/g;
  for (const relativePath of CONSUMER_INVENTORY_FILES) {
    const source = readRepoFile(relativePath);
    assert.ok(source.includes(AUTHORITY_MODULE_TOKEN),
      `${relativePath} must import the replication target authority`);
    for (const match of source.matchAll(fallbackPattern)) {
      if (match[1] === '!') {
        continue;
      }
      assert.ok(match[2].startsWith('DECLARED_'),
        `${relativePath} carries forbidden fallback grammar: ${match[0]}`);
    }
    assert.ok(!/(?:\|\||\?\?)\s*NUM\.THREE/.test(source),
      `${relativePath} must not restate the policy literal NUM.THREE`);
  }
});

test('absent-scenario-cannot-pass-as-a-receipt', () => {
  // The harness-fidelity control, inherited from quest A because the failure
  // it guards is a property of the runner, not of any one quest: a zero-match
  // --test-name-pattern run exits 0, so a renamed scenario reports green
  // having never run. The runner must accept a genuinely passing scenario,
  // reject a failing one, and reject an absent one.
  const runner = 'test/bootstrap/run-anchored-scenario-helper.js';
  const witness =
    'test/bootstrap/behaviour-changing-consumer-convergence.test.js';
  const run = (testFile, scenarioName) => spawnSync(
    process.execPath, [runner, testFile, scenarioName],
    {cwd: REPO_ROOT, encoding: 'utf8'});

  const present = run(witness, 'witness-deterministic');
  assert.equal(present.status, 0,
    `a real scenario must pass: ${present.stderr}`);

  const absent = run(witness, 'this-scenario-does-not-exist');
  assert.notEqual(absent.status, 0,
    'an ABSENT scenario must fail the receipt, not pass silently');
  assert.match(absent.stderr, /DID NOT RUN/u);

  // All THREE outcome classes through the real CLI against the fixture file.
  const fixtures = 'test/bootstrap/anchored-runner-fixture-cases.js';
  assert.equal(run(fixtures, FIXTURE_SCENARIO.PASSES).status, 0,
    'a fixture scenario that genuinely passes must be accepted');
  assert.notEqual(run(fixtures, FIXTURE_SCENARIO.FAILS).status, 0,
    'a fixture scenario that FAILED must be rejected, not reported as run');
  assert.notEqual(run(fixtures, FIXTURE_SCENARIO.ABSENT).status, 0,
    'a fixture scenario that does not exist must be rejected');

  // The bare form still exits 0 on no match, which is why the runner exists.
  // If node ever fixes this, the assertion fails and the runner can be
  // reconsidered - it must not silently become dead.
  const bare = spawnSync(process.execPath,
    ['--test', '--test-name-pattern=^this-scenario-does-not-exist$', witness],
    {cwd: REPO_ROOT, encoding: 'utf8'});
  assert.equal(bare.status, 0,
    'documented node behaviour: a zero-match pattern run still exits 0');
});

test('witness-deterministic', () => {
  // The decisive decode surface is a pure function of the row: two fresh
  // passes over the same matrix must produce byte-identical digests.
  const matrix = [
    {partition_id: 'p1', replica_count: 1},
    {partition_id: 'p1', replica_count: 3},
    {partition_id: 'p1', replica_count: 5},
    {partition_id: 'p1', replica_count: 7},
    {partition_id: 'p1', replicaCount: 3},
    {partition_id: 'p1', replica_count: '3'},
    {partition_id: 'p1', replica_count: 0},
    {partition_id: 'p1', replica_count: -1},
    {partition_id: 'p1'},
    null,
  ];

  const digestPass = () => JSON.stringify(matrix.map((row) => {
    const decoded = resolveDesiredReplicationFactor(row);
    return {
      decoded: {
        factor: decoded.replicationFactor,
        source: decoded.source,
      },
      promotion: promotionTargetFor(row),
      readiness: readinessTargetFor(row),
      undeclared: decoded.source === REPLICATION_TARGET_SOURCE.UNDECLARED,
    };
  }));

  assert.equal(digestPass(), digestPass());
});
