// Witness W-T: cross-coordinator target census (quest
// replica-placement-admission-owner, design sections 1.6 and 4.2, receipt
// cross-coordinator-target-census-witness).
//
// Property: target occupancy is one census over every committed operation,
// whichever coordinator created it. With two live system-partition copies
// onto node B (the per-target capacity, K_tgt = 2, the two system ADDs per
// target the tree documents), a third copy onto B is refused, whatever the
// admitting coordinator's own cache holds; once one of the two reaches a
// genuine terminal, the waiting copy is admitted; and a stale cached row of
// an operation that is already terminal does not hold the slot.
//
// REAL: three nodes, each with the real owners createSimulatedNodeHosts
// builds as control-plane setup does (gateway, readiness, CDC owner, rebalance
// coordinator with its operation workflow owner and repository) and EACH
// WITH ITS OWN SystemTableCache. Every admission goes through the tree's
// creation entry on the creating node with the request a placement decider
// builds (unified-rebalancer-move-execution.js); every terminal is the
// workflow owner's own transition.
// DOUBLES: operation and reservation authority share one SQLite database
// built from their production schemas that executes the owners' statements
// unchanged, behind each node's real gateway (the composite engine below
// routes statements on that table to it and every other statement to the
// node's cache seam). Its committed changes are published to every node's
// cache through the cache's apply entry (applySystemTableChange), the CDC
// delivery boundary, where publication to one node can be HELD. Consensus is
// the rows (the partition row names the leader), the transport answers a
// CREATE as initiated and the committed-membership read from the rows
// (committed-membership-fixture.js), and the clock does not move.
// The independent node hosts share this store through their normal gateways;
// the generic createTestCoordinator construction is not used.
//
// The property is observed at the durable store and the creation entry's
// answer, never through a statement shape: on a tree whose admission is one
// conditional insert, the same assertions hold or fail on what commits.
//
// LIMITS: a follower's local read of a system table is not hosted by the
// simulated partition service (it answers no complete row set), so node C
// holds no replica of the services partition and reads it from its leader.
// The witness proves admission and persistence at the creation entry, not
// copy execution.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {
  INITIAL_PARTITION_IDS,
  REPLICA_OPERATIONS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  seedPartitionRow,
  seedTableRow,
} from '../../src/bootstrap/seed-foundation-rows.js';
import {
  CDC_OPERATION, COLUMN, SERVICE_STATUS, STATE, TABLES,
} from '../../src/constants/index.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {
  PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RESULT_FIELD,
} from '../../src/partition/partition-placement-admission-constants.js';
import {
  decidePlacementAdmission,
} from '../../src/partition/partition-placement-admission-decision.js';
import {
  PLACEMENT_OUTCOME,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  leaderReadRequestOf,
} from '../../src/control-plane/control-plane-owner-fact-read-contract.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {createSqlEngineSeam} from '../distributed/harness/sql-engine-seam.js';
import {
  createNodeEntry,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {createSimulatedNodeHosts} from '../simulation/formation-sim-node-hosts.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {engineCommittedWriteAnswer} from '../test-helpers/committed-write-answer.js';
import {withFixtureCommittedMembership} from './committed-membership-fixture.js';

const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_IDS = Object.freeze([NODE_A, NODE_B, NODE_C]);
// Per-target capacity of unresolved copies onto one node.
const K_TGT = 3;
const RANDOM_SEED = 20261117;
const READY_LEASE_MS = 10 * 60 * 1000;
const STORAGE_BUDGET_BYTES = 64 * 1024 * 1024 * 1024;
const STORAGE_BUDGET_SOURCE = 'configured';
const SETTLE_TURNS = 24;
const REPLICA_SUFFIX = '-r';
const STATEMENT_ON_LEDGER = /\b(?:from|into|update)\s+(?:replica_operations|storage_reservations)\b/iu;
const LEDGER_PARTITION_ID = INITIAL_PARTITION_IDS.replica_operations;
const STATEMENT_SHAPE_CHARS = 72;
const ATTEMPT_READS_SHOWN = 6;
const WHITESPACE_RUN = /\s+/gu;
const SPACE = ' ';
const TERMINAL_REASON = 'cross-coordinator census witness: terminal release';
// Three system partitions led by A and one led by C, each below its declared
// spread (two distinct hosts of three) and none on B; nodes-p1 spread; the
// ledger spread and led by B; every other partition on A and B only.
const HELD_BY_A = Object.freeze(['tables-p1', 'indices-p1', 'logs-p1']);
const CONTENDER = 'config-p1';
const PARTITION_LAYOUT = Object.freeze({
  'tables-p1': [NODE_A, NODE_A, NODE_C],
  'indices-p1': [NODE_A, NODE_A, NODE_C],
  'logs-p1': [NODE_A, NODE_A, NODE_C],
  'config-p1': [NODE_C, NODE_C, NODE_A],
  'nodes-p1': [NODE_A, NODE_B, NODE_C],
  'replica_operations-p1': [NODE_B, NODE_A, NODE_C],
});
const DEFAULT_LAYOUT = Object.freeze([NODE_A, NODE_A, NODE_B]);

function readyNodeRow(nodeId, nowMs) {
  return createNodeEntry(nodeId, {
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + READY_LEASE_MS,
    [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
    [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
    [COLUMN.STORAGE_BUDGET_UPDATED_AT]: nowMs,
  }, nowMs);
}

function replicaRow(partitionId, nodeId, index, nowMs) {
  const role = index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER;
  return {
    ...PartitionServiceRowOwner.buildServiceRow({
      partitionId,
      replicaId: `${partitionId}${REPLICA_SUFFIX}${index + 1}`,
      nodeId,
      service: {getRole: () => role},
      timestamp: nowMs,
      status: SERVICE_STATUS.ACTIVE,
    }),
    [COLUMN.RAFT_ROLE]: role,
  };
}

// Every node's cache starts from the same committed rows.
function seedCache(cache, nowMs) {
  const insert = (tableName, row) =>
    cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, row);
  for (const nodeId of NODE_IDS) insert(TABLES.NODES, readyNodeRow(nodeId, nowMs));
  const formationEpoch = 3;
  insert(TABLES.CONTROL_PLANE_PUBLICATIONS, {
    publication_id: `cluster_membership-${formationEpoch}`,
    publication_kind: 'cluster_membership',
    publication_epoch: formationEpoch,
    publisher_node_id: NODE_IDS[0],
    published_active_node_ids: JSON.stringify(NODE_IDS),
    required_ack_node_ids: JSON.stringify(NODE_IDS),
    acknowledged_node_ids: JSON.stringify(NODE_IDS),
    priority_partition_summary: null,
    status: 'PUBLISHED',
    created_at: nowMs,
    updated_at: nowMs,
  });
  insert(TABLES.CONTROL_PLANE_PUBLICATIONS, {
    publication_id: 'cluster_formation',
    publication_kind: 'cluster_formation',
    publication_epoch: formationEpoch,
    publisher_node_id: NODE_IDS[0],
    status: 'FORMED',
    created_at: nowMs,
    updated_at: nowMs,
    formation_record: JSON.stringify({
      version: 1,
      status: 'FORMED',
      clusterId: 'cross-coordinator-census',
      declaredHostCount: NODE_IDS.length,
      declaredByNodeId: NODE_IDS[0],
      declaredAt: nowMs,
      formedAt: nowMs,
      formedByNodeId: NODE_IDS[0],
      formedPublicationEpoch: formationEpoch,
      formedHostIds: NODE_IDS,
      formedReadyNodeIds: NODE_IDS,
      priorityPartitionVoters: {},
    }),
  });
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const partitionId = INITIAL_PARTITION_IDS[schema.tableName];
    if (!partitionId) continue;
    const layout = PARTITION_LAYOUT[partitionId] || DEFAULT_LAYOUT;
    insert(TABLES.TABLES, seedTableRow(schema, nowMs));
    insert(TABLES.PARTITIONS, seedPartitionRow(schema, layout[0], nowMs));
    layout.forEach((nodeId, index) =>
      insert(TABLES.SERVICES, replicaRow(partitionId, nodeId, index, nowMs)));
  }
}

// The one durable REPLICA_OPERATIONS store. Every committed change is
// published to each node's cache through its apply entry; a held node
// queues the changes until it is released.
function createLedgerStore(hostsById) {
  const database = new Database(':memory:');
  for (const schema of [REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA]) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) database.exec(indexSql);
  }
  const selectAll = database.prepare(
    `SELECT * FROM ${REPLICA_OPERATIONS_SCHEMA.tableName}`);
  const held = new Map();
  const reads = [];
  const tableKeys = new Map([[TABLES.REPLICA_OPERATIONS, COLUMN.OPERATION_ID],
    [TABLES.STORAGE_RESERVATIONS, 'reservation_id']]);
  const published = new Map();
  const apply = (nodeId, change) => {
    hostsById.get(nodeId).cache.applySystemTableChange(
      change.tableName, change.operation, {...change.row});
  };
  const publish = () => {
    for (const [tableName, key] of tableKeys) {
      const current = new Map(database.prepare(`SELECT * FROM ${tableName}`).all()
        .map((row) => [row[key], row]));
      const previous = published.get(tableName) || new Map();
      for (const [id, row] of current) {
        const before = previous.get(id);
        if (before && JSON.stringify(before) === JSON.stringify(row)) continue;
        const change = {tableName, row,
          operation: before ? CDC_OPERATION.UPDATE : CDC_OPERATION.INSERT};
        for (const nodeId of NODE_IDS) {
          if (held.has(nodeId)) held.get(nodeId).push(change);
          else apply(nodeId, change);
        }
      }
      published.set(tableName, current);
    }
  };
  // SQLite binds no boolean and no undefined: they bind as 0/1 and NULL.
  const bind = (value) => (typeof value === 'boolean' ? Number(value) :
    value === undefined ? null : value);
  let nextLogIndex = 0;
  return {
    readCount: () => reads.length,
    readsSince: (mark) => reads.slice(mark),
    rows: () => selectAll.all(),
    hold: (nodeId) => held.set(nodeId, held.get(nodeId) || []),
    release(nodeId) {
      const queued = held.get(nodeId) || [];
      held.delete(nodeId);
      for (const change of queued) apply(nodeId, change);
      return queued.length;
    },
    admit(payload, nowMs) {
      nextLogIndex += 1;
      const command = {
        type: PLACEMENT_ADMIT_TYPE,
        partitionId: LEDGER_PARTITION_ID,
        entryId: payload.entryId,
        proposedBy: `${LEDGER_PARTITION_ID}-r1`,
        proposedAt: nowMs,
        body: payload.body,
      };
      const {result} = decidePlacementAdmission(database, {
        command,
        statement: payload.body,
        index: nextLogIndex,
      });
      publish();
      return {
        success: result.outcome !== PLACEMENT_OUTCOME.REFUSED,
        committed: true,
        entryId: payload.entryId,
        partitionId: LEDGER_PARTITION_ID,
        logIndex: nextLogIndex,
        term: 1,
        [PLACEMENT_RESULT_FIELD]: result,
      };
    },
    execute(sql, params, options = {}) {
      try {
        const statement = database.prepare(sql);
        const values = (params || []).map(bind);
        if (statement.reader) {
          const rows = statement.all(...values);
          reads.push({
            statement: String(sql).replace(WHITESPACE_RUN, SPACE).trim()
              .slice(0, STATEMENT_SHAPE_CHARS),
            params: values,
            partitionIds: rows.map((row) => row[COLUMN.PARTITION_ID]),
          });
          return {success: true, rows, rowSetComplete: true};
        }
        const info = statement.run(...values);
        publish();
        // The engine's answer for the committed statement, with the
        // producer's durable commit receipt for this write's own entry.
        return engineCommittedWriteAnswer(sql, params, options, {changes: info.changes});
      } catch (error) {
        return {success: false, rows: [], rowSetComplete: false,
          error: error.message};
      }
    },
    close: () => database.close(),
  };
}

// A node's SQL engine: statements on the ledger table run in the store,
// every other statement in the node's own cache seam; the partition query
// executor routes a partition read to its leader's engine.
function bindNodeEngine(hosts, ledger, engines) {
  const seam = createSqlEngineSeam(hosts.cache);
  const baseQueryExecutor = hosts.sqlQueryEngine.queryExecutor;
  const queryExecutor = Object.freeze({
    ...baseQueryExecutor,
    async executeOnPartition(
      partitionId,
      statement,
      params = [],
      isReadOnly = true,
      preferLeader = true,
      allowFollowerFallback = false,
      executionOptions = {},
    ) {
      const res = await baseQueryExecutor.executeOnPartition(
        partitionId,
        statement,
        params,
        isReadOnly,
        preferLeader,
        allowFollowerFallback,
        executionOptions,
      );
      if (res?.readAuthorityWitness) {
        return {
          ...res,
          readAuthorityWitness: Object.freeze({
            ...res.readAuthorityWitness,
            currentTermApplied: true,
            leaderRead: leaderReadRequestOf(executionOptions?.ownerFactFloor),
          }),
        };
      }
      return res;
    },
  });
  const engine = Object.freeze({
    queryExecutor,
    async executeQuery(sql, params = [], options = {}) {
      return STATEMENT_ON_LEDGER.test(String(sql)) ?
        ledger.execute(sql, params, options) :
        seam.executeQuery(sql, params, options);
    },
  });
  engines.set(hosts.nodeId, engine);
  hosts.controlPlaneSystemTableGateway.sqlQueryEngine = engine;
  hosts.cdcIntegrationService.sqlQueryEngine = engine;
  hosts.rebalanceCoordinator.sqlQueryEngine = engine;
}

// Full-mesh transport; a CREATE is answered as initiated (the copy stays
// live), every other request as completed; the committed-membership read is
// answered from the rows.
function installTransport(hosts, ledger, nowMs) {
  const router = hosts.messageRouter;
  const localNodeId = hosts.nodeId;
  const remote = (nodeId) => nodeId !== localNodeId;
  router.getConnectionState = (nodeId) =>
    (remote(nodeId) ? STATE.CONNECTED : null);
  router.getConnectedNodes = () => NODE_IDS.filter(remote);
  router.hasScheduledReconnect = () => false;
  router.pingNode = async () => true;
  router.isOutboundQueueAvailable = () => true;
  router.getLocalBootIncarnationIdentity = () => Object.freeze({
    nodeId: localNodeId, bootIncarnation: TEST_BOOT_INCARNATION,
    connectionId: `local:${localNodeId}`});
  router.getCurrentPrimaryConnectionBootIncarnation = (nodeId) =>
    (remote(nodeId) ? Object.freeze({nodeId,
      bootIncarnation: TEST_BOOT_INCARNATION,
      connectionId: `primary:${nodeId}`}) : null);
  router.deliver = async (_target, payload) => {
    if (payload?.type === PLACEMENT_ADMIT_TYPE) {
      return buildDeliveryEnvelope({acknowledged: true},
        ledger.admit(payload, nowMs));
    }
    return buildDeliveryEnvelope({acknowledged: true}, {
      status: payload?.[ReplicaOperationField.TYPE] ===
        ReplicaOperationMessageType.CREATE_REPLICA ?
        ReplicaOperationResponseStatus.INITIATED :
        ReplicaOperationResponseStatus.COMPLETED,
    });
  };
  withFixtureCommittedMembership(router, hosts.cache);
}

function createWorld() {
  initializeTestEnvironment();
  const startMs = Date.now();
  const clock = new VirtualTimeSource({startMs});
  const network = Object.freeze({
    networkTimeSource: () => clock,
    setTimer: (_nodeId, callback, delayMs) => clock.setTimeout(callback, delayMs),
  });
  const hostsById = new Map();
  const engines = new Map();
  const consensus = Object.freeze({
    resolvePartitionLeader(partitionId) {
      const leaderId = hostsById.get(NODE_B).cache.get(
        TABLES.PARTITIONS, partitionId)?.[COLUMN.LEADER_NODE_ID];
      return leaderId ?
        Object.freeze({
          leaderId,
          term: 1,
          commitIndex: 1,
          appliedIndex: 1,
          electionLogApplied: true,
        }) :
        null;
    },
    // The store is every replica of the ledger: a ledger read is served
    // from it through the leader, never from a node's cache.
    hasLocalReplica: (nodeId, partitionId) =>
      partitionId !== LEDGER_PARTITION_ID &&
      hostsById.get(nodeId).cache.filter(TABLES.SERVICES, (row) =>
        row[COLUMN.PARTITION_ID] === partitionId &&
        row[COLUMN.NODE_ID] === nodeId).length > 0,
    resolveNodeSqlEngine: (nodeId) => engines.get(nodeId),
    resolveNodeNow: () => clock.now(),
  });
  for (const nodeId of NODE_IDS) {
    hostsById.set(nodeId, createSimulatedNodeHosts({
      network,
      nodeId,
      randomSource: new SeededRandomSource({seed: RANDOM_SEED}),
      partitionAuthority: consensus,
    }));
  }
  const ledger = createLedgerStore(hostsById);
  for (const hosts of hostsById.values()) {
    seedCache(hosts.cache, startMs);
    bindNodeEngine(hosts, ledger, engines);
    installTransport(hosts, ledger, startMs);
  }
  const unresolvedOnto = (nodeId) => ledger.rows().filter((row) =>
    row[COLUMN.TARGET_NODE_ID] === nodeId &&
    (row.completed_at === null || row.completed_at === undefined));
  return {
    hostsById,
    ledger,
    unresolvedOnto,
    async settle() {
      for (const hosts of hostsById.values()) {
        await hosts.controlPlaneReadinessService.readServeEligibility();
      }
      for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
        clock.advance(0);
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    cachedOperationIds(nodeId) {
      return hostsById.get(nodeId).cache.getAll(TABLES.REPLICA_OPERATIONS)
        .map((row) => row[COLUMN.OPERATION_ID]).sort();
    },
    close() {
      for (const hosts of hostsById.values()) {
        hosts.heartbeatService.stop();
        hosts.membershipPublicationService.stopOwnerMembershipDriver();
        hosts.rebalanceCoordinator.isShuttingDown = true;
        hosts.controlPlaneReadinessService.shutdown();
        hosts.stopIntervals();
      }
      ledger.close();
    },
  };
}

// The tree's admission entry on one node, with the request a placement
// decider builds for a move onto the target. The outcome is the entry's own
// answer; the assertions read the durable store.
async function admitCopy(world, nodeId, partitionId, targetNodeId) {
  const coordinator = world.hostsById.get(nodeId).rebalanceCoordinator;
  world.lastAttemptReadMark = world.ledger.readCount();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.ADD,
      partitionId,
      entityType: EntityType.PARTITION,
      entityId: partitionId,
      nodeId: targetNodeId,
      enforceConcurrentOperationBudget: true,
    });
    await world.settle();
    return {admitted: true, operationId: operation?.operationId || null};
  } catch (error) {
    await world.settle();
    return {admitted: false, refusal: error.reasonCode ||
      error.rebalanceSkipReason || error.message};
  }
}

// The genuine terminal of an operation: its creating node's workflow owner
// fails it through its own transition.
async function releaseThroughWorkflow(world, nodeId, operationId) {
  const coordinator = world.hostsById.get(nodeId).rebalanceCoordinator;
  const operation = await coordinator.getOperation(operationId);
  assert.ok(operation, `${nodeId} reads its own operation ${operationId}`);
  await coordinator.failOperation(operation, TERMINAL_REASON);
  await world.settle();
}

async function admitTwoOntoB(world) {
  const admitted = [];
  for (const partitionId of HELD_BY_A) {
    const outcome = await admitCopy(world, NODE_A, partitionId, NODE_B);
    assert.equal(outcome.admitted, true,
      `A admits its copy of ${partitionId} onto B (${outcome.refusal})`);
    admitted.push(outcome.operationId);
  }
  assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT,
    'two live copies onto B are durable');
  return admitted;
}

// What the store and C's cache held, and every read of the store the last
// admission attempt made (with the partitions each returned): the census
// that attempt consumed.
function describeCensus(world) {
  const onto = world.unresolvedOnto(NODE_B).map((row) =>
    `${row[COLUMN.PARTITION_ID]} from ${row.source_node_id}`);
  const reads = world.ledger.readsSince(world.lastAttemptReadMark)
    .slice(0, ATTEMPT_READS_SHOWN);
  return `the store holds ${onto.length} unresolved copies onto B ` +
    `(${onto.join(', ')}); C's cache holds ` +
    `${world.cachedOperationIds(NODE_C).length} operation rows; the ` +
    `attempt read the store ${JSON.stringify(reads)}`;
}

async function withWorld(run) {
  const world = createWorld();
  try {
    await world.settle();
    return await run(world);
  } finally {
    world.close();
  }
}

test('W-T: with B at capacity through A\'s copies, C\'s copy onto B is ' +
  'refused although C\'s cache has not received them', async () => {
  await withWorld(async (world) => {
    world.ledger.hold(NODE_C);
    await admitTwoOntoB(world);
    assert.deepEqual(world.cachedOperationIds(NODE_C), [],
      'publication to C is held: C\'s cache has neither copy');
    const outcome = await admitCopy(world, NODE_C, CONTENDER, NODE_B);
    assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT,
      `no third unresolved copy onto B is committed: ${describeCensus(world)}`);
    assert.equal(outcome.admitted, false,
      'C\'s admission entry refuses the copy');
  });
});

test('W-T: after a genuine terminal of one of A\'s copies, C\'s waiting ' +
  'copy onto B is admitted on the same bindings, once', async () => {
  await withWorld(async (world) => {
    world.ledger.hold(NODE_C);
    const [first] = await admitTwoOntoB(world);
    await releaseThroughWorkflow(world, NODE_A, first);
    assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT - 1,
      'the released copy is terminal in the store');
    const outcome = await admitCopy(world, NODE_C, CONTENDER, NODE_B);
    assert.equal(outcome.admitted, true,
      `C's copy is admitted after the release (${outcome.refusal}): ` +
      describeCensus(world));
    const delivered = world.ledger.release(NODE_C);
    await world.settle();
    assert.ok(delivered > 0, 'C receives the held publications');
    const again = await admitCopy(world, NODE_C, CONTENDER, NODE_B);
    const contenderRows = world.unresolvedOnto(NODE_B).filter((row) =>
      row[COLUMN.PARTITION_ID] === CONTENDER);
    assert.equal(contenderRows.length, 1,
      'releasing C\'s publications and asking again admits no duplicate');
    assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT,
      `B holds exactly its capacity (${JSON.stringify(again)})`);
  });
});

test('W-T converse: a cached row of a copy that is already terminal does ' +
  'not hold B\'s slot', async () => {
  await withWorld(async (world) => {
    const [first] = await admitTwoOntoB(world);
    assert.equal(world.cachedOperationIds(NODE_C).length, K_TGT,
      'C\'s cache received both live copies');
    world.ledger.hold(NODE_C);
    await releaseThroughWorkflow(world, NODE_A, first);
    const outcome = await admitCopy(world, NODE_C, CONTENDER, NODE_B);
    assert.equal(outcome.admitted, true,
      'C\'s copy is admitted although C\'s cache still shows the released ' +
      `copy live (${outcome.refusal}): ${describeCensus(world)}`);
    assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT,
      'B holds exactly its capacity');
  });
});

test('W-T paired control: with both copies published to C, C\'s copy ' +
  'onto B is refused', async () => {
  await withWorld(async (world) => {
    await admitTwoOntoB(world);
    assert.equal(world.cachedOperationIds(NODE_C).length, K_TGT,
      'C\'s cache received both live copies');
    const outcome = await admitCopy(world, NODE_C, CONTENDER, NODE_B);
    assert.equal(outcome.admitted, false,
      `C's admission entry refuses the copy: ${describeCensus(world)}`);
    assert.equal(world.unresolvedOnto(NODE_B).length, K_TGT,
      'no third unresolved copy onto B is committed');
  });
});
