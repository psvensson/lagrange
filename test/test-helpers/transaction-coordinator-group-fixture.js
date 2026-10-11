/**
 * The integrated TX1 fixture (quest replicated-transaction-decision-and-apply,
 * design revision 10, sections 10.2 and 11): the real SQLQueryEngine and its
 * DistributedTransactionCoordinator drive a real three-replica rs-raft
 * participant group (production PartitionService replicas on the WASM core,
 * one database file each, admitted the way production admits them,
 * partition-admitted-group-fixture.js) over the group's own transport, with
 * participant transaction admission enabled through the participant's
 * production entry point (the cutover sequence's caller, design 0.0.13).
 *
 * The coordinator's durable rows live in transaction-persistence-gateway.js
 * (real SQLite, the production schemas and CDC mutation SQL builder). A
 * restarted coordinator is a new engine over the same rows, recovering them
 * through the engine's production startup path
 * (activateDistributedTransactionRecovery) from a cache that holds them, as
 * the CDC-fed system cache does. A hold stops one coordinator at a named
 * persistence write and never releases it: that coordinator process stops
 * there (nothing after the write runs).
 *
 * Routing rows are the cache's: the engine routes to the replica the cache
 * names leader, and is redirected by the participant's typed not-leader
 * answer after the group's leadership moves.
 */
import Database from 'better-sqlite3';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {CDCOperation, PartitionService} from
  '../../src/partition/partition-service.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from
  '../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {createTransactionPersistenceGateway} from
  './transaction-persistence-gateway.js';

const GROUP_TABLE = 'tx1_rows';
const GROUP_SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]});
const GROUP_BUDGET_MS = 20000;
const COORDINATOR_NODE_ID = 'tx1-coordinator-node';
const RAFT_TIMING = Object.freeze({heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300});
const COORDINATOR_TABLES = Object.freeze([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);

function initializeGroupEnvironment(nodeId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: nodeId},
    raft: RAFT_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function readReplica(dbPath, read) {
  const db = new Database(dbPath, {readonly: true});
  try {
    return read(db);
  } finally {
    db.close();
  }
}

/**
 * A hold on one coordinator persistence write: the first mutation the
 * predicate matches waits until release() - forever when release is never
 * called (its coordinator process stops there); `reached` settles with that
 * mutation.
 * @param {Function} predicate - (mutation) => boolean.
 * @return {Object} {beforeMutation, reached, release, isHeld}.
 */
function createPersistenceHold(predicate) {
  let held = false;
  let signal;
  let release;
  const reached = new Promise((resolve) => {
    signal = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return {
    reached,
    release: () => release(),
    isHeld: () => held,
    async beforeMutation(mutation) {
      if (held || !predicate(mutation)) {
        return;
      }
      held = true;
      signal(mutation);
      await released;
    },
  };
}

/**
 * Whether a mutation writes the transaction row's status.
 * @param {string} status - The status.
 * @return {Function} The predicate.
 */
function statusWriteOf(status) {
  return (mutation) => mutation.tableName === TABLES.SQL_TRANSACTIONS &&
    mutation.data?.status === status;
}

/**
 * Whether a mutation records a transaction decision.
 * @param {Object} mutation - The mutation.
 * @return {boolean}
 */
function isDecisionWrite(mutation) {
  return mutation.tableName === TABLES.SQL_TRANSACTIONS &&
    typeof mutation.data?.decision === 'string';
}

/**
 * Whether a mutation writes a participant row with `status` (the coordinator
 * persists each participant after its answer: PREPARED retains the PREPARE
 * evidence, COMMITTED records a COMMIT answered).
 * @param {string} status - The participant status.
 * @return {Function} The predicate.
 */
function participantWriteOf(status) {
  return (mutation) =>
    mutation.tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS &&
    mutation.row?.status === status;
}

function routingRowsOf(group, members, partitionId, leaderReplicaId) {
  return members.map(([replicaId, nodeId]) => ({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: group.addressOf([replicaId, nodeId]),
    raft_role: replicaId === leaderReplicaId ? RAFT_ROLE.LEADER :
      RAFT_ROLE.FOLLOWER,
  }));
}

/**
 * Form the group and run `body` with the fixture's context.
 * @param {string} name - Names the partition (and its table).
 * @param {Function} body - async (ctx) => result.
 * @return {Promise<*>} What body returned.
 */
async function withTransactionGroup(name, body) {
  initializeGroupEnvironment(COORDINATOR_NODE_ID);
  const partitionId = `${name}-p1`;
  const members = [1, 2, 3].map((index) =>
    [`${partitionId}-r${index}`, `${name}-node-${index}`]);
  const tableRow = {table_id: GROUP_TABLE, table_name: GROUP_TABLE,
    active_partition_version: 1, schema: JSON.stringify(GROUP_SCHEMA),
    partition_key: 'id', primary_key: 'id'};
  const partitionRow = {partition_id: partitionId, table_id: GROUP_TABLE,
    table_name: GROUP_TABLE, partition_key_start: null,
    partition_key_end: null, replica_count: members.length,
    leader_node_id: members[0][1]};
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: `tx1-coord-${name}-`, budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {tableId: GROUP_TABLE, tableName: GROUP_TABLE,
      schema: GROUP_SCHEMA}});
  const engines = [];
  const store = new Database(':memory:');
  const ctx = {
    group,
    members,
    partitionId,
    table: GROUP_TABLE,
    store,
    services: () => group.services,
    leader: () => group.services.find((service) =>
      service.raft?.readStatus?.().role === RAFT_ROLE.LEADER) ?? null,
    /**
     * A coordinator: a new engine whose persistence is the shared durable
     * store (with an optional hold), and whose cache holds the routing rows
     * and, for a restarted coordinator, the durable coordinator rows.
     * @param {Object} [options] - {hold, recoverRows, nowFn}.
     * @return {SQLQueryEngine} The engine.
     */
    createCoordinator(options = {}) {
      const cache = new SystemTableCache();
      cache.applySystemTableChange(TABLES.TABLES, CDCOperation.INSERT, tableRow);
      cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT,
        partitionRow);
      for (const row of routingRowsOf(group, members, partitionId,
        members[0][0])) {
        cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, row);
      }
      const gateway = createTransactionPersistenceGateway({db: store,
        beforeMutation: options.hold?.beforeMutation});
      if (options.recoverRows === true) {
        for (const tableName of COORDINATOR_TABLES) {
          for (const row of gateway.rows(tableName)) {
            cache.applySystemTableChange(tableName, CDCOperation.INSERT, row);
          }
        }
      }
      const engine = new SQLQueryEngine({systemCache: cache,
        messageRouter: group.services[0].transport,
        controlPlaneSystemTableGateway: gateway,
        nodeId: COORDINATOR_NODE_ID,
        autoStartDistributedTransactionRecovery: false,
        migrationAutoWire: false,
        unrefRetryDelayTimers: true,
        ...(options.nowFn ? {nowFn: options.nowFn} : {})});
      engine.coordinatorStore = gateway;
      engines.push(engine);
      return engine;
    },
    /**
     * Wait until every replica applied at least the leader's commit index.
     * @return {Promise<boolean>}
     */
    async settle() {
      const leader = ctx.leader();
      const target = leader ? leader.raft.readStatus().commitIndex : 0;
      return group.waitFor(() => members.every((member) =>
        ctx.appliedIndexOf(member) >= target));
    },
    appliedIndexOf(member) {
      return readReplica(group.dbFileOf(member), (db) =>
        Number(RaftRsDurableStore.readAppliedIndexIn(db, partitionId)));
    },
    /**
     * What one replica durably holds for the transaction witnesses.
     * @param {Array} member - [replicaId, nodeId].
     * @return {Object} {rows, participants, generation, txopOutcomes}.
     */
    replicaState(member) {
      return readReplica(group.dbFileOf(member), (db) => ({
        rows: db.prepare(`SELECT id, value FROM ${GROUP_TABLE} ORDER BY id`)
          .all(),
        participants: db.prepare('SELECT transaction_id, participant_id, ' +
          'state, prepared_digest, prepare_index, prepare_term, decision, ' +
          'decision_digest FROM _participant_transactions ' +
          'ORDER BY transaction_id').all(),
        generation: db.prepare('SELECT generation FROM ' +
          '_partition_write_generation WHERE singleton = 1').get()
          ?.generation ?? null,
        txopOutcomes: db.prepare('SELECT COUNT(*) AS count FROM ' +
          '_partition_statement_outcomes WHERE entry_key LIKE ?')
          .get('txop:%').count,
      }));
    },
    replicaStates() {
      return members.map((member) => ctx.replicaState(member));
    },
    /**
     * Move the group's leadership to the replica at `index`.
     * @param {number} index - The successor's position.
     * @return {Promise<boolean>} Whether it leads now.
     */
    async transferLeadershipTo(index) {
      const from = ctx.leader();
      const to = group.services[index];
      if (from === to) {
        return true;
      }
      await from.raft.transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: to.replicaId,
      });
      return group.waitFor(() =>
        to.raft.readStatus().role === RAFT_ROLE.LEADER);
    },
    /**
     * Stop the replica at `index`; restart() reopens it on its own database.
     * @param {number} index - The replica's position.
     * @return {Promise<Function>} restart: async () => the new service.
     */
    async stopReplica(index) {
      const stopped = group.services[index];
      const member = members[index];
      await stopped.shutdown();
      return async () => {
        const restarted = new PartitionService(withFoundingStamp({
          tableId: GROUP_TABLE,
          tableName: GROUP_TABLE,
          schema: GROUP_SCHEMA,
          partitionId,
          replicaId: member[0],
          replicaIds: members.map(([replicaId]) => replicaId),
          peerAddresses: members.map(group.addressOf),
          nodeId: member[1],
          dbPath: group.dbFileOf(member),
          transport: stopped.transport,
          systemTableCache: stopped.systemTableCache,
        }));
        await restarted.initialize();
        group.services[index] = restarted;
        return restarted;
      };
    },
  };
  try {
    for (const service of group.services) {
      service.systemTableCache.applySystemTableChange(TABLES.TABLES,
        CDCOperation.INSERT, tableRow);
    }
    const enabled = await enableParticipantTransactionAdmission(
      group.services[0]);
    if (enabled.success !== true) {
      throw new Error('setup: participant admission was not enabled ' +
        `(${JSON.stringify(enabled)})`);
    }
    await ctx.settle();
    return await body(ctx);
  } finally {
    for (const engine of engines) {
      await engine.shutdown().catch(() => {});
    }
    await group.dispose();
    store.close();
  }
}

export {
  createPersistenceHold,
  isDecisionWrite,
  participantWriteOf,
  statusWriteOf,
  withTransactionGroup,
};
