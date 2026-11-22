/**
 * Shared 3-replica PgWire cluster fixture and assertion helpers for
 * authoritative locking-read reservation tests.
 *
 * @module test/query/locking-read-authoritative-test-support
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  committedStatementEntryKey,
  createCommittedStatementOutcomeTable,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {buildLockingReadCommand} from '../../src/partition/partition-locking-read-command.js';
import {
  clearMemoryReservations,
  deriveRowLockKey,
  stageLocalWriteReservation,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  applyLockingReadReservationCommand,
} from '../../src/partition/partition-locking-read-service.js';
import {
  acquireDbForUpdateReservation,
  ensureLockingReadTableInitialized,
  truncateDbReservations,
} from '../../src/partition/partition-locking-read-store.js';
import {
  readSettledOwnerCommandIn,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  listActiveParticipantSessions,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  applyCommittedTransactionCommand,
} from '../../src/partition/partition-participant-transaction-apply.js';
import {
  buildDecisionCommand,
  buildDecisionRecord,
  buildPrepareCommand,
  operationsOf,
  validationTextOf,
} from '../../src/partition/partition-participant-transaction-bytes.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_DECISION,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  openParticipantSession,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  runParticipantSessionStatement,
} from '../../src/partition/partition-participant-transaction-staging.js';
import {
  openParticipantTransactionStore,
  readPartitionWriteGeneration,
  recordPartitionWriteOrigin,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  executionEnvelopeOf,
} from '../../src/partition/partition-transaction-execution-envelope.js';
import {
  extractStatementWriteFootprint,
} from '../../src/partition/partition-write-footprint-contract.js';
import {PartitionWriteTraffic} from '../../src/partition/partition-write-traffic.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {decodeCommittedProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {PostgresWireRuntimeModule} from '../../src/runtime/pgwire-runtime-module.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';

const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

export const ACCOUNTS_TABLE = 'accounts';
export const ACCOUNTS_PARTITION_ID = 'accounts-p1';
export const ACCOUNTS_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'balance', type: 'INTEGER', nullable: false},
    {name: 'tier', type: 'TEXT', nullable: false},
  ],
});
export const GROUP_BUDGET_MS = 20000;
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const PG_HOST = '127.0.0.1';
const PG_USER = 'postgres';
const PG_DATABASE = 'lagrange';
export const LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';

export function initEnvironment(nodeId = 'locking-node-1') {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId},
    raft: RAFT_TIMING,
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function createAccountsTableRow(leaderNodeId = 'node-1') {
  return {
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    active_partition_version: 1,
    schema: JSON.stringify(ACCOUNTS_SCHEMA),
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    primary_key: 'id',
    leader_node_id: leaderNodeId,
  };
}

function createAccountsPartitionRow(replicaCount, leaderNodeId = 'node-1') {
  return {
    partition_id: ACCOUNTS_PARTITION_ID,
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
    replica_count: replicaCount,
    leader_node_id: leaderNodeId,
  };
}

function buildServiceRows(group, members, leaderReplicaId) {
  return members.map(([replicaId, nodeId]) => ({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: ACCOUNTS_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: group.addressOf([replicaId, nodeId]),
    raft_role: replicaId === leaderReplicaId ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
  }));
}

function buildNodeCache(group, members, leaderMember) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    TABLES.TABLES,
    CDC_OPERATION.INSERT,
    createAccountsTableRow(leaderMember[1]),
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.INSERT,
    createAccountsPartitionRow(members.length, leaderMember[1]),
  );
  for (const row of buildServiceRows(group, members, leaderMember[0])) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  }
  return cache;
}

async function seedAccountsData(engine) {
  const inserts = [
    [1, 100, 'gold'],
    [2, 200, 'silver'],
    [3, 300, 'gold'],
  ];
  for (const [id, balance, tier] of inserts) {
    const res = await engine.executeQuery(
      'INSERT INTO accounts (id, balance, tier) VALUES (?, ?, ?)',
      [id, balance, tier],
    );
    assert.equal(res.success, true, `seed row ${id} failed: ${res.error}`);
  }
  const leaderService = engine.partitionServicesProvider?.()?.values()?.next()?.value;
  if (leaderService?.db) {
    leaderService.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
  }
}

async function startPgWireNode(engine) {
  const runtime = new PostgresWireRuntimeModule({logger: QUIET_LOGGER});
  const prepared = await runtime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: PG_HOST,
      authMode: 'trust',
      tlsMode: 'disable',
    }),
  });
  assert.equal(prepared.status, 'ready');
  const started = await runtime.start({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: PG_HOST,
    port: 0,
    sqlRequestExecutor: (sqlRequest, opts) => engine.executeRequest(sqlRequest, opts),
  });
  assert.equal(started.status, 'running');
  return {
    runtime,
    port: started.endpointIntent.port,
    async connectClient() {
      const client = new pg.Client({
        host: PG_HOST,
        port: started.endpointIntent.port,
        user: PG_USER,
        database: PG_DATABASE,
      });
      await client.connect();
      return client;
    },
    async stop() {
      await runtime.stop({serviceId: META_SERVICE_ID.POSTGRES_WIRE});
    },
  };
}

export function resetFixtureReservations(dbs = []) {
  clearMemoryReservations();
  for (const db of dbs) {
    if (db) truncateDbReservations(db);
  }
}

export async function setupTwoNodeCluster(options = {}) {
  clearMemoryReservations();
  initEnvironment('node-1');
  const members = [
    [`${ACCOUNTS_PARTITION_ID}-r1`, 'node-1'],
    [`${ACCOUNTS_PARTITION_ID}-r2`, 'node-2'],
    [`${ACCOUNTS_PARTITION_ID}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId: ACCOUNTS_PARTITION_ID,
    members,
    tempPrefix: options.tempPrefix || 'lock-auth-cluster-',
    budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {
      tableId: ACCOUNTS_TABLE,
      tableName: ACCOUNTS_TABLE,
      schema: ACCOUNTS_SCHEMA,
      concurrencyGranularity:
        options.concurrencyGranularity || PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    },
  });
  const releaseOwners = await attachPartitionReleaseOwners(group.services, {
    directory: path.dirname(group.dbFileOf(members[0])),
    budgetMs: GROUP_BUDGET_MS,
  });
  for (const sysTable of [TABLES.PARTITIONS, TABLES.SERVICES]) {
    const rows = group.services[0].systemTableCache.getAll(sysTable) || [];
    for (const row of rows) {
      if (row.partition_id === releaseOwners.control.partitionId ||
          row.service_id === releaseOwners.control.replicaId) {
        for (const svc of group.services.slice(1)) {
          svc.systemTableCache.applySystemTableChange(sysTable, CDC_OPERATION.INSERT, row);
        }
      }
    }
  }
  await releaseOwners.release(ACCOUNTS_PARTITION_ID);

  for (const svc of group.services) {
    svc.systemTableCache.applySystemTableChange(
      TABLES.TABLES,
      CDC_OPERATION.INSERT,
      createAccountsTableRow(members[0][1]),
    );
    svc.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
  }

  const gateway = createTransactionPersistenceGateway();
  const makeNodeEngine = (memberIndex) => {
    const member = members[memberIndex];
    const localService = group.services[memberIndex];
    const cache = buildNodeCache(group, members, members[0]);
    const localMap = new Map([[localService.replicaId, localService]]);
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      messageRouter: group.services[0].transport,
      controlPlaneSystemTableGateway: gateway,
      partitionServicesProvider: () => localMap,
      nodeId: member[1],
      autoStartDistributedTransactionRecovery: false,
      migrationAutoWire: false,
      unrefRetryDelayTimers: true,
    });
    return {engine, cache, localService, member};
  };

  const node1 = makeNodeEngine(0);
  const node2 = makeNodeEngine(1);
  node2.engine.queryExecutor.setBootstrapTopologySnapshotOwner({
    resolveCanonicalPartitionLeaderNodeId: (pid) =>
      pid === releaseOwners.control.partitionId ? members[0][1] : null,
  });
  group.services[1].sqlQueryEngine = node2.engine;
  await seedAccountsData(node1.engine);

  const pg1 = await startPgWireNode(node1.engine);
  const pg2 = await startPgWireNode(node2.engine);

  return {
    group,
    members,
    releaseOwners,
    gateway,
    node1,
    node2,
    pg1,
    pg2,
    leader: () =>
      group.services.find(
        (svc) => svc.raft?.readStatus?.().role === RAFT_ROLE.LEADER,
      ) ?? null,
    updateLeaderRouting(newLeaderMember) {
      for (const node of [node1, node2]) {
        for (const row of buildServiceRows(group, members, newLeaderMember[0])) {
          node.cache.applySystemTableChange(
            TABLES.SERVICES,
            CDC_OPERATION.UPDATE,
            row,
          );
        }
      }
    },
    async cleanup() {
      await pg1.stop().catch(() => {});
      await pg2.stop().catch(() => {});
      await node1.engine.shutdown().catch(() => {});
      await node2.engine.shutdown().catch(() => {});
      resetFixtureReservations(group.services.map((svc) => svc.db));
      await releaseOwners.dispose().catch(() => {});
      await group.dispose().catch(() => {});
      gateway.db.close();
      clearMemoryReservations();
    },
  };
}

export async function expectSqlState(client, sql, params, expectedSqlState) {
  let caught = null;
  try {
    await client.query(sql, params);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `Expected SQLSTATE ${expectedSqlState} for "${sql}", but it succeeded`);
  assert.equal(
    caught.code,
    expectedSqlState,
    `Expected SQLSTATE ${expectedSqlState} for "${sql}", got ${caught.code}: ${caught.message}`,
  );
  return caught;
}

export function countDbReservations(db, tableName = ACCOUNTS_TABLE) {
  const exists = db
    .prepare(
      'SELECT 1 AS ok FROM sqlite_master WHERE type = \'table\' AND name = ?',
    )
    .get('_lagrange_locking_read_reservations');
  if (!exists) return 0;
  const row = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM _lagrange_locking_read_reservations WHERE table_name = ?',
    )
    .get(tableName);
  return Number(row?.cnt || 0);
}

export function assertNumericRowValues(rows, expectedRows) {
  assert.equal(rows.length, expectedRows.length);
  for (let i = 0; i < expectedRows.length; i += 1) {
    const actual = rows[i];
    const expected = expectedRows[i];
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(Number(actual[k]), v, `Mismatch on column ${k}`);
    }
  }
}

export function readAccountBalance(db, id) {
  return Number(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(id)?.balance);
}

function decodeAppendCommands(entries) {
  const commands = [];
  for (const entry of entries || []) {
    if (!entry?.data || entry.data.length === 0) continue;
    try {
      const bytes = typeof entry.data === 'string' ?
        Buffer.from(entry.data, 'base64') :
        entry.data;
      commands.push(decodeCommittedProposal(bytes));
    } catch (_err) {
      // Non-proposal entry (e.g. conf change or empty noop).
    }
  }
  return commands;
}

export function installAppendEntriesRaceHarness([r1, r2, r3]) {
  const network = r1.transport;
  const origDeliver = network.deliver.bind(network);
  const origR1Apply = r1.applyCommittedEntry.bind(r1);
  const origR2Apply = r2.applyCommittedEntry.bind(r2);
  const origR3Apply = r3.applyCommittedEntry.bind(r3);

  const state = {
    armMatch: null,
    holding: false,
    heldDeliveries: [],
    triggeredCommand: null,
    capturedPrepareTxId: null,
    poisonR2: false,
    wipeR3: false,
  };

  const flush = () => {
    state.holding = false;
    state.armMatch = null;
    const queued = state.heldDeliveries.splice(0, state.heldDeliveries.length);
    for (const deliverNow of queued) {
      void deliverNow().catch(() => {});
    }
  };

  const isLockingOrPrepare = (cmd) =>
    cmd?.type === 'LOCKING_READ_RESERVATION' ||
    cmd?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE;

  network.deliver = (address, payload) => {
    if ((state.armMatch || state.holding) &&
        isRaftRsTransportEnvelope(payload) &&
        payload.groupId === ACCOUNTS_PARTITION_ID &&
        payload.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
        Array.isArray(payload.message.entries) &&
        payload.message.entries.length > 0) {
      const commands = decodeAppendCommands(payload.message.entries);
      if (state.armMatch) {
        const matched = commands.find(state.armMatch);
        if (matched) {
          state.armMatch = null;
          state.holding = true;
          state.triggeredCommand = matched;
        }
      }
      if (state.holding) {
        const prepCmd = commands.find(
          (cmd) => cmd?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE,
        );
        if (prepCmd?.transactionId) {
          state.capturedPrepareTxId = prepCmd.transactionId;
        }
        state.heldDeliveries.push(() => origDeliver(address, payload));
        return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}, undefined));
      }
    }
    return origDeliver(address, payload);
  };

  r1.applyCommittedEntry = (committedArg) => {
    if (committedArg?.command?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE &&
        committedArg?.command?.transactionId) {
      state.capturedPrepareTxId = committedArg.command.transactionId;
    }
    return origR1Apply(committedArg);
  };

  r2.applyCommittedEntry = (committedArg) => {
    if (committedArg?.command?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE &&
        committedArg?.command?.transactionId) {
      state.capturedPrepareTxId = committedArg.command.transactionId;
    }
    if (state.poisonR2 && isLockingOrPrepare(committedArg?.command)) {
      clearMemoryReservations();
      stageLocalWriteReservation({
        tableName: ACCOUNTS_TABLE,
        partitionId: ACCOUNTS_PARTITION_ID,
        pkValues: [1],
        transactionId: 'tx-divergent-memory-r2',
        sessionId: 's-divergent-memory-r2',
        db: null,
      });
    }
    return origR2Apply(committedArg);
  };

  r3.applyCommittedEntry = (committedArg) => {
    if (state.wipeR3 && isLockingOrPrepare(committedArg?.command)) {
      clearMemoryReservations();
    }
    return origR3Apply(committedArg);
  };

  return {
    state,
    armHoldOn(matchFn) {
      state.triggeredCommand = null;
      state.capturedPrepareTxId = null;
      state.armMatch = matchFn;
    },
    setMemoryDivergence(enabled) {
      state.poisonR2 = enabled;
      state.wipeR3 = enabled;
    },
    flush,
    restore() {
      flush();
      network.deliver = origDeliver;
      r1.applyCommittedEntry = origR1Apply;
      r2.applyCommittedEntry = origR2Apply;
      r3.applyCommittedEntry = origR3Apply;
    },
  };
}

function createModelReplica(replicaId) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
  db.prepare('INSERT INTO accounts (id, balance) VALUES (1, 100), (2, 200), (3, 300)').run();
  openParticipantTransactionStore(db);
  recordPartitionWriteOrigin(db, {index: 1, term: 1});
  createCommittedStatementOutcomeTable(db, ACCOUNTS_PARTITION_ID);
  ensureLockingReadTableInitialized(db, {readOnly: false});
  const answers = new Map();
  return {
    db,
    answers,
    partitionId: ACCOUNTS_PARTITION_ID,
    tableName: ACCOUNTS_TABLE,
    nodeId: `${replicaId}-node`,
    replicaId,
    concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    cdcEnabled: false,
    writeTraffic: new PartitionWriteTraffic(),
    logger: QUIET_LOGGER,
    timeSource: {now: () => 1700000000000},
    hlcClock: {now: () => ({toString: () => '1700000000000-0-model'})},
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    resolveCommittedWrite(entryId, answer) {
      answers.set(entryId, answer);
    },
    rejectCommittedWrite(_entryId, failure) {
      throw failure;
    },
    emit() {},
    scheduleSizeUpdate() {},
  };
}

function applyCommandOnReplica(svc, command, index, {poisonMemory}) {
  clearMemoryReservations();
  if (poisonMemory) {
    stageLocalWriteReservation({
      tableName: ACCOUNTS_TABLE,
      partitionId: ACCOUNTS_PARTITION_ID,
      pkValues: [1],
      transactionId: 'tx-poisoned-model-memory',
      sessionId: 's-poisoned-model-memory',
      db: null,
    });
  }
  const afterCommitQueue = [];
  const afterRollbackQueue = [];
  const committed = {
    command,
    index,
    term: 1,
    afterCommit: (fn) => afterCommitQueue.push(fn),
    afterRollback: (fn) => afterRollbackQueue.push(fn),
  };
  svc.answers.delete(command.entryId);
  try {
    svc.db.transaction(() => {
      if (command.type === 'LOCKING_READ_RESERVATION') {
        applyLockingReadReservationCommand(svc, committed);
      } else {
        applyCommittedTransactionCommand(svc, committed);
      }
    })();
  } catch (err) {
    for (const fn of afterRollbackQueue) fn();
    throw err;
  }
  for (const fn of afterCommitQueue) fn();
  return svc.answers.get(command.entryId);
}

function snapshotReplicaState(svc) {
  const locks = svc.db
    .prepare(
      'SELECT row_key, transaction_id FROM _lagrange_locking_read_reservations ' +
      'ORDER BY row_key, transaction_id',
    )
    .all();
  const txRows = svc.db
    .prepare(
      'SELECT transaction_id, state, refusal_cause, operations_text ' +
      'FROM _participant_transactions ORDER BY transaction_id',
    )
    .all();
  const balances = svc.db
    .prepare('SELECT id, balance FROM accounts ORDER BY id')
    .all();
  return {locks, txRows, balances};
}

function assertReciprocalExclusionAndDeterminism(rA, rB, label) {
  const snapA = snapshotReplicaState(rA);
  const snapB = snapshotReplicaState(rB);
  assert.deepEqual(snapA, snapB, `${label}: rA and rB durable SQLite state must be identical`);
  const lockHolderByPk = new Map();
  for (const row of snapA.locks) {
    const pkKey = row.row_key.split(':').at(-1);
    lockHolderByPk.set(pkKey, row.transaction_id);
  }
  for (const txRow of snapA.txRows) {
    if (txRow.state !== 'PREPARED') continue;
    const ops = operationsOf(txRow.operations_text) || [];
    for (const op of ops) {
      const fp = extractStatementWriteFootprint({
        sql: op.sql,
        params: op.params,
        pkCols: ['id'],
        allCols: ['id', 'balance'],
      });
      const touched = fp.scoped ? fp.rowKeys : Array.from(lockHolderByPk.keys());
      for (const pkKey of touched) {
        const holder = lockHolderByPk.get(pkKey);
        assert.ok(
          !holder || holder === txRow.transaction_id,
          `${label}: forbidden joint state on pk=${pkKey}: FOR_UPDATE=${holder}, PREPARED=${txRow.transaction_id}`,
        );
      }
    }
  }
}

function modelIdentity(txId) {
  return {
    sessionId: `s-${txId}`,
    transactionId: txId,
    participantId: `${txId}:${ACCOUNTS_PARTITION_ID}`,
    commitMode: 'SINGLE_PARTITION_2PC',
    transactionEpoch: 1,
  };
}

function modelStamp(svc) {
  return {
    executionEnvelope: executionEnvelopeOf(svc.db),
    timestamp: '1700000000000-0-model',
    proposedBy: svc.replicaId,
    proposedAt: 1700000000000,
  };
}

const DEPENDENT_PREDICATE_STMT_1 = 'UPDATE accounts SET balance = 201 WHERE id = 2';
const DEPENDENT_PREDICATE_STMT_2 =
  'UPDATE accounts SET balance = 500 WHERE id IN (SELECT 1 FROM accounts WHERE id = 2 AND balance = 201)';
const DISJOINT_DEPENDENT_STMT_1 = 'UPDATE accounts SET balance = 202 WHERE id = 2';
const DISJOINT_DEPENDENT_STMT_2 =
  'UPDATE accounts SET balance = 350 WHERE id IN (SELECT 3 FROM accounts WHERE id = 2 AND balance = 202)';

const DEPENDENT_PREDICATE_OPS = Object.freeze([
  Object.freeze({sql: DEPENDENT_PREDICATE_STMT_1, params: Object.freeze([])}),
  Object.freeze({sql: DEPENDENT_PREDICATE_STMT_2, params: Object.freeze([])}),
]);

function buildModelPrepareOps(svc, txId, operations, genBase) {
  return buildPrepareCommand(
    modelIdentity(txId),
    {
      operationsText: JSON.stringify(operations),
      validationText: validationTextOf(genBase, ACCOUNTS_PARTITION_ID, 1),
    },
    modelStamp(svc),
  );
}

function buildModelPrepare(svc, txId, sql, params, genBase) {
  return buildModelPrepareOps(svc, txId, [{sql, params}], genBase);
}

function buildModelDecision(svc, txId, decision, preparedDigest) {
  const id = modelIdentity(txId);
  const rec = buildDecisionRecord(txId, decision, [[id.participantId, preparedDigest]]);
  return buildDecisionCommand(
    id,
    {
      decision,
      preparedDigest,
      decisionText: rec.decisionText,
      decisionDigest: rec.decisionDigest,
    },
    modelStamp(svc),
  );
}

function runModelAcquireFirstBranch(ctx) {
  const {
    rA, label, writeShape, disjointSlot, extra, settlement, acqT, writeOps, prepW,
    applyBoth, runDisjointD, stats,
  } = ctx;
  const acqAns = applyBoth(acqT);
  assert.equal(acqAns.success, true, `${label}: ACQUIRE(T) first must succeed`);
  if (disjointSlot === 'BETWEEN') runDisjointD();
  let lockTestPrep = prepW;
  if (writeShape === 'DEPENDENT_PREDICATE' && disjointSlot === 'BETWEEN') {
    const staleAns = applyBoth(prepW);
    assert.equal(staleAns.success, false, `${label}: stale unscoped PREPARE(W) must refuse`);
    assert.equal(staleAns.refusalCause, 'conflict');
    lockTestPrep = buildModelPrepareOps(
      rA, 'tx-W-cur', writeOps, readPartitionWriteGeneration(rA.db),
    );
  }
  const prepWAns = applyBoth(lockTestPrep);
  assert.equal(prepWAns.success, false, `${label}: conflicting PREPARE(W) must refuse`);
  assert.equal(prepWAns.refusalCause, 'lock_conflict');
  assert.equal(prepWAns.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);
  assert.equal(readAccountBalance(rA.db, 1), 100, `${label}: id=1 must remain unchanged`);
  assert.equal(readAccountBalance(rA.db, 2), 200, `${label}: id=2 must remain rolled back`);
  stats.acquireFirstRefusals += 1;
  if (extra === 'REENTRANT_SAME_TX') {
    const reAcq = buildLockingReadCommand(rA, {
      op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
      transactionId: 'tx-T', sessionId: 's-tx-T',
      participantId: `tx-T:${ACCOUNTS_PARTITION_ID}`,
    });
    const reAns = applyBoth(reAcq);
    assert.equal(reAns.success, true);
    assert.equal(reAns.reentrant, true);
    stats.reentrantSuccesses += 1;
  } else {
    const dupPrep = applyBoth(lockTestPrep);
    assert.equal(dupPrep.success, false);
    stats.duplicateReplays += 1;
  }
  if (disjointSlot === 'AFTER_BOTH') runDisjointD();
  if (settlement === 'WINNER_COMMITS') {
    const prepT = buildModelPrepare(
      rA, 'tx-T', 'UPDATE accounts SET balance = 175 WHERE id = 1', [],
      readPartitionWriteGeneration(rA.db),
    );
    const prepTAns = applyBoth(prepT);
    assert.equal(prepTAns.success, true, `${label}: owner T PREPARE must succeed`);
    const commitT = buildModelDecision(
      rA, 'tx-T', PARTICIPANT_TRANSACTION_DECISION.COMMIT, prepTAns.preparedDigest,
    );
    assert.equal(applyBoth(commitT).success, true);
  } else {
    const relT = buildLockingReadCommand(rA, {
      op: 'RELEASE_TRANSACTION', transactionId: 'tx-T', sessionId: 's-tx-T',
      participantId: `tx-T:${ACCOUNTS_PARTITION_ID}`,
    });
    assert.equal(applyBoth(relT).success, true);
  }
  assert.equal(countDbReservations(rA.db), 0);
  const prepNext = buildModelPrepare(
    rA, 'tx-W-next', 'UPDATE accounts SET balance = 333 WHERE id = 1', [],
    readPartitionWriteGeneration(rA.db),
  );
  const prepNextAns = applyBoth(prepNext);
  assert.equal(prepNextAns.success, true);
  assert.equal(
    applyBoth(buildModelDecision(
      rA, 'tx-W-next', PARTICIPANT_TRANSACTION_DECISION.COMMIT,
      prepNextAns.preparedDigest,
    )).success,
    true,
  );
  assert.equal(readAccountBalance(rA.db, 1), 333);
  stats.successorWins += 1;
}

function runModelPrepareFirstBranch(ctx) {
  const {
    rA, rB, label, writeShape, disjointSlot, extra, settlement, acqT, prepW,
    applyBoth, runDisjointD, tryDisjointDeferred, stats,
  } = ctx;
  const isUnscopedWrite = writeShape === 'DEPENDENT_PREDICATE';
  const prepWAns = applyBoth(prepW);
  assert.equal(prepWAns.success, true, `${label}: PREPARE(W) first must succeed`);
  if (disjointSlot === 'BETWEEN') {
    if (isUnscopedWrite) tryDisjointDeferred();
    else runDisjointD();
  }
  const acqAns = applyBoth(acqT);
  assert.equal(acqAns.success, false, `${label}: conflicting ACQUIRE(T) must refuse`);
  assert.equal(acqAns.conflict, true);
  assert.equal(acqAns.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);
  assert.equal(acqAns.conflictingTransactionId, 'tx-W');
  stats.prepareFirstRefusals += 1;
  if (extra === 'DUPLICATE_DELIVERY') {
    const dupAcq = applyBoth(acqT);
    assert.equal(dupAcq.success, false);
    assert.equal(dupAcq.conflict, true);
    stats.duplicateReplays += 1;
  } else {
    const selfAcq = buildLockingReadCommand(rA, {
      op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
      transactionId: 'tx-W', sessionId: 's-tx-W',
      participantId: `tx-W:${ACCOUNTS_PARTITION_ID}`,
    });
    assert.equal(applyBoth(selfAcq).success, true);
    stats.reentrantSuccesses += 1;
  }
  if (disjointSlot === 'AFTER_BOTH') {
    if (isUnscopedWrite) tryDisjointDeferred();
    else runDisjointD();
  }
  const decW = buildModelDecision(
    rA,
    'tx-W',
    settlement === 'WINNER_COMMITS' ?
      PARTICIPANT_TRANSACTION_DECISION.COMMIT :
      PARTICIPANT_TRANSACTION_DECISION.ROLLBACK,
    prepWAns.preparedDigest,
  );
  assert.equal(applyBoth(decW).success, true);
  assert.equal(countDbReservations(rA.db), 0);
  if (isUnscopedWrite && settlement === 'WINNER_COMMITS') {
    assert.equal(readAccountBalance(rA.db, 1), 500, `${label}: dependent op2 committed on rA`);
    assert.equal(readAccountBalance(rA.db, 2), 201, `${label}: dependent op1 committed on rA`);
    assert.equal(readAccountBalance(rB.db, 1), 500, `${label}: dependent op2 replicated on rB`);
  }
  if (isUnscopedWrite && disjointSlot !== 'BEFORE_BOTH') {
    runDisjointD();
  }
  const acqNext = buildLockingReadCommand(rA, {
    op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
    transactionId: 'tx-T-next', sessionId: 's-tx-T-next',
    participantId: `tx-T-next:${ACCOUNTS_PARTITION_ID}`,
  });
  assert.equal(applyBoth(acqNext).success, true);
  assert.equal(
    applyBoth(buildLockingReadCommand(rA, {
      op: 'RELEASE_TRANSACTION', transactionId: 'tx-T-next', sessionId: 's-tx-T-next',
      participantId: `tx-T-next:${ACCOUNTS_PARTITION_ID}`,
    })).success,
    true,
  );
  assert.equal(countDbReservations(rA.db), 0);
  stats.successorWins += 1;
}

function runSingleModelSchedule(params, stats) {
  const {writeShape, order, staging, disjointSlot, extra, settlement} = params;
  const label = `${writeShape}/${order}/${staging}/${disjointSlot}/${extra}/${settlement}`;
  const rA = createModelReplica('rA');
  const rB = createModelReplica('rB');
  let logIndex = 2;
  const applyBoth = (cmd) => {
    const idx = logIndex;
    logIndex += 1;
    const ansA = applyCommandOnReplica(rA, cmd, idx, {poisonMemory: true});
    const ansB = applyCommandOnReplica(rB, cmd, idx, {poisonMemory: false});
    assert.deepEqual(ansA, ansB, `${label}@${idx}: proposer answers diverged`);
    assertReciprocalExclusionAndDeterminism(rA, rB, `${label}@${idx}`);
    stats.stepsVerified += 1;
    return ansA;
  };
  const runDisjointD = () => {
    const genD = readPartitionWriteGeneration(rA.db);
    const prepD = buildModelPrepare(
      rA, 'tx-D', 'UPDATE accounts SET balance = 350 WHERE id = 3', [], genD,
    );
    const prepDAns = applyBoth(prepD);
    assert.equal(prepDAns.success, true, `${label}: disjoint D PREPARE must succeed`);
    const commitD = buildModelDecision(
      rA, 'tx-D', PARTICIPANT_TRANSACTION_DECISION.COMMIT, prepDAns.preparedDigest,
    );
    const commitDAns = applyBoth(commitD);
    assert.equal(commitDAns.success, true, `${label}: disjoint D COMMIT must succeed`);
    stats.disjointCommits += 1;
  };
  const tryDisjointDeferred = () => {
    const prepD = buildModelPrepare(
      rA, 'tx-D-reserved', 'UPDATE accounts SET balance = 350 WHERE id = 3', [],
      readPartitionWriteGeneration(rA.db),
    );
    const deferredAns = applyBoth(prepD);
    assert.equal(deferredAns.success, false, `${label}: unscoped PREPARED reserves partition`);
    assert.equal(deferredAns.deferRetry, true);
  };
  const writeOps = writeShape === 'DEPENDENT_PREDICATE' ?
    DEPENDENT_PREDICATE_OPS.map((op) => ({sql: op.sql, params: [...op.params]})) :
    [{sql: 'UPDATE accounts SET balance = 500 WHERE id = 1', params: []}];

  try {
    const genStart = readPartitionWriteGeneration(rA.db);
    if (staging === 'STAGED_BEFORE_LOG') {
      const sessW = openParticipantSession(
        rA, modelIdentity('tx-W'), {generationBase: genStart, originIndex: 1},
      );
      for (const op of writeOps) {
        const staged = runParticipantSessionStatement(rA, sessW, op);
        assert.equal(staged.success, true, `${label}: provisional staging on rA`);
      }
    }
    if (disjointSlot === 'BEFORE_BOTH') runDisjointD();

    const acqT = buildLockingReadCommand(rA, {
      op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
      transactionId: 'tx-T', sessionId: 's-tx-T',
      participantId: `tx-T:${ACCOUNTS_PARTITION_ID}`,
    });
    const prepW = buildModelPrepareOps(
      rA, 'tx-W', writeOps, readPartitionWriteGeneration(rA.db),
    );
    const branchCtx = {
      rA, rB, label, writeShape, disjointSlot, extra, settlement, acqT, writeOps, prepW,
      applyBoth, runDisjointD, tryDisjointDeferred, stats,
    };
    if (order === 'ACQUIRE_FIRST') runModelAcquireFirstBranch(branchCtx);
    else runModelPrepareFirstBranch(branchCtx);
    assert.equal(readAccountBalance(rA.db, 3), 350, `${label}: disjoint id=3 committed`);
    assert.equal(readAccountBalance(rB.db, 3), 350, `${label}: disjoint id=3 replicated`);
    stats.schedulesExplored += 1;
    if (writeShape === 'DEPENDENT_PREDICATE') stats.dependentPredicateSchedules += 1;
  } finally {
    rA.db.close();
    rB.db.close();
    clearMemoryReservations();
  }
}

/**
 * P5.3 bounded schedule explorer connected directly to real production partition apply
 * (`applyLockingReadReservationCommand`, `applyCommittedTransactionCommand`).
 * Enumerates all 96 legal committed-order interleavings across single-statement and
 * multi-statement dependent-predicate writes, ACQUIRE-first / PREPARE-first, provisional
 * leader staging, disjoint-row writes, same-tx reentrancy, duplicate delivery, winner
 * commit vs release/rollback, and successor progress on two replicas with diverged memory.
 *
 * @return {Object} Summary statistics of explored schedules and verified transitions.
 */
export function runBoundedReciprocalExclusionExplorer() {
  const stats = {
    schedulesExplored: 0,
    dependentPredicateSchedules: 0,
    stepsVerified: 0,
    acquireFirstRefusals: 0,
    prepareFirstRefusals: 0,
    reentrantSuccesses: 0,
    duplicateReplays: 0,
    disjointCommits: 0,
    successorWins: 0,
  };
  const writeShapes = ['SINGLE_STATEMENT', 'DEPENDENT_PREDICATE'];
  const orders = ['ACQUIRE_FIRST', 'PREPARE_FIRST'];
  const stagings = ['STAGED_BEFORE_LOG', 'UNSTAGED'];
  const disjointSlots = ['BEFORE_BOTH', 'BETWEEN', 'AFTER_BOTH'];
  const extras = ['REENTRANT_SAME_TX', 'DUPLICATE_DELIVERY'];
  const settlements = ['WINNER_COMMITS', 'WINNER_RELEASES'];

  for (const writeShape of writeShapes) {
    for (const order of orders) {
      for (const staging of stagings) {
        for (const disjointSlot of disjointSlots) {
          for (const extra of extras) {
            for (const settlement of settlements) {
              runSingleModelSchedule(
                {writeShape, order, staging, disjointSlot, extra, settlement},
                stats,
              );
            }
          }
        }
      }
    }
  }
  return stats;
}

/**
 * Direct production-apply witness for commitPrepared sequential lock checking:
 * verifies that when a PREPARED multi-statement dependent-predicate transaction
 * encounters an active durable FOR_UPDATE reservation on row 1 at COMMIT time,
 * commitPrepared evaluates statement 2 against the post-statement-1 savepoint state,
 * refuses with commit_lock_conflict / 55P03, and atomically rolls back statement 1.
 */
export function verifySequentialCommitPreparedLockConflict() {
  const rA = createModelReplica('rA');
  const rB = createModelReplica('rB');
  try {
    const ops = DEPENDENT_PREDICATE_OPS.map((op) => ({sql: op.sql, params: [...op.params]}));
    const prepW = buildModelPrepareOps(rA, 'tx-W-commit-seq', ops, 0);
    const prepA = applyCommandOnReplica(rA, prepW, 2, {poisonMemory: true});
    const prepB = applyCommandOnReplica(rB, prepW, 2, {poisonMemory: false});
    assert.deepEqual(prepA, prepB);
    assert.equal(prepA.success, true);

    const rowKey = deriveRowLockKey(ACCOUNTS_TABLE, ACCOUNTS_PARTITION_ID, [1]);
    for (const svc of [rA, rB]) {
      const acq = acquireDbForUpdateReservation(svc.db, {
        tableName: ACCOUNTS_TABLE,
        partitionId: ACCOUNTS_PARTITION_ID,
        rowKey,
        transactionId: 'tx-T-commit-seq',
        sessionId: 's-tx-T-commit-seq',
        epoch: 0,
        acquiredAt: 1700000000000,
        expiresAt: null,
      });
      assert.equal(acq.status, 'acquired');
    }

    const commitW = buildModelDecision(
      rA, 'tx-W-commit-seq', PARTICIPANT_TRANSACTION_DECISION.COMMIT, prepA.preparedDigest,
    );
    const ansA = applyCommandOnReplica(rA, commitW, 3, {poisonMemory: true});
    const ansB = applyCommandOnReplica(rB, commitW, 3, {poisonMemory: false});
    assert.deepEqual(ansA, ansB, 'commitPrepared sequential refusal must match across replicas');
    assert.equal(ansA.success, false, 'commitPrepared must refuse dependent-predicate conflict');
    assert.equal(ansA.refusalCause, 'commit_lock_conflict');
    assert.equal(ansA.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);
    for (const svc of [rA, rB]) {
      assert.equal(readAccountBalance(svc.db, 1), 100, 'row 1 must remain 100 after refusal');
      assert.equal(readAccountBalance(svc.db, 2), 200, 'statement 1 on row 2 must roll back');
      assert.equal(countDbReservations(svc.db), 1, 'T reservation on row 1 must stay intact');
    }
  } finally {
    rA.db.close();
    rB.db.close();
    clearMemoryReservations();
  }
}

/**
 * Full 3-replica Raft + 2-node PgWire witness for Finding 3A (Witness 3d):
 * exercises sequential dependent-predicate lock checking across sealSession (3d-i),
 * committed applyParticipantPrepare behind uncommitted ACQUIRE (3d-ii), staging-time
 * replay under an active lock (3d-iii), and disjoint dependent-predicate progress (3d-iv).
 *
 * @param {Object} cluster - Cluster returned by setupTwoNodeCluster.
 */
export async function runDependentPredicatePgWireWitness(cluster) {
  const clientT = await cluster.pg1.connectClient();
  const clientW = await cluster.pg2.connectClient();
  const clientW2 = await cluster.pg2.connectClient();
  const clientDisjoint = await cluster.pg2.connectClient();
  const [r1, r2, r3] = cluster.group.services;
  const race = installAppendEntriesRaceHarness([r1, r2, r3]);
  const isAcquireCmd = (cmd) =>
    cmd?.type === 'LOCKING_READ_RESERVATION' && cmd?.reservation?.op === 'ACQUIRE';

  try {
    // --- 3d-i: sealSession path ---
    // T's ACQUIRE on row 1 passes precheck and is held before committed apply;
    // W stages op1 (id=2 -> 201) + op2 (id IN SELECT 1 WHERE id=2 AND balance=201 -> 500);
    // T's ACQUIRE applies across r1/r2/r3; W attempts PREPARE/COMMIT and must fail 55P03.
    await clientW.query('BEGIN');
    assertNumericRowValues(
      (await clientW.query('SELECT balance FROM accounts WHERE id = 2')).rows,
      [{balance: 200}],
    );
    assert.ok(Array.from(listActiveParticipantSessions(r1)).length >= 1);

    await clientT.query('BEGIN');
    race.armHoldOn(isAcquireCmd);
    const tAcquire1 = clientT.query('SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE');
    assert.equal(
      await cluster.group.waitFor(
        () => race.state.triggeredCommand !== null && race.state.heldDeliveries.length >= 2,
      ),
      true,
      '3d-i: T ACQUIRE must pass precheck/proposal and hold AppendEntries before quorum',
    );
    const proposedAcq1 = race.state.triggeredCommand;
    assert.equal(countDbReservations(r1.db), 0);

    await clientW.query(DEPENDENT_PREDICATE_STMT_1);
    await clientW.query(DEPENDENT_PREDICATE_STMT_2);
    assert.equal(countDbReservations(r1.db), 0);

    race.setMemoryDivergence(true);
    race.flush();
    assertNumericRowValues((await tAcquire1).rows, [{id: 1, balance: 100}]);
    assert.equal(
      await cluster.group.waitFor(
        () => [r1, r2, r3].every((svc) => countDbReservations(svc.db) === 1),
      ),
      true,
      '3d-i: all three replicas must durably hold T lock on id = 1',
    );
    for (const svc of [r1, r2, r3]) {
      const settled = readSettledOwnerCommandIn(svc.db, {
        entryId: proposedAcq1.entryId,
        commandDigest: proposedAcq1.commandDigest,
      });
      assert.equal(JSON.parse(settled.recorded.ownerResultText).success, true);
    }

    clearMemoryReservations();
    await expectSqlState(clientW, 'COMMIT', [], LOCK_NOT_AVAILABLE_SQLSTATE);
    for (const svc of [r1, r2, r3]) {
      assert.equal(readAccountBalance(svc.db, 1), 100, `3d-i: id=1 intact on ${svc.replicaId}`);
      assert.equal(readAccountBalance(svc.db, 2), 200, `3d-i: id=2 intact on ${svc.replicaId}`);
      assert.equal(countDbReservations(svc.db), 1, `3d-i: T lock intact on ${svc.replicaId}`);
    }

    // --- 3d-iii: staging-time sequential lock check while T ALREADY holds durable row 1 ---
    clearMemoryReservations();
    await clientW2.query('BEGIN');
    await clientW2.query(DEPENDENT_PREDICATE_STMT_1);
    await expectSqlState(clientW2, DEPENDENT_PREDICATE_STMT_2, [], LOCK_NOT_AVAILABLE_SQLSTATE);
    await clientW2.query('ROLLBACK');
    for (const svc of [r1, r2, r3]) {
      assert.equal(readAccountBalance(svc.db, 1), 100);
      assert.equal(readAccountBalance(svc.db, 2), 200);
      assert.equal(countDbReservations(svc.db), 1);
    }

    // --- 3d-iv: positive control - disjoint 2-statement dependent-predicate tx progresses ---
    await clientDisjoint.query('BEGIN');
    await clientDisjoint.query(DISJOINT_DEPENDENT_STMT_1);
    await clientDisjoint.query(DISJOINT_DEPENDENT_STMT_2);
    await clientDisjoint.query('COMMIT');
    assert.equal(
      await cluster.group.waitFor(
        () => [r1, r2, r3].every((svc) =>
          readAccountBalance(svc.db, 2) === 202 && readAccountBalance(svc.db, 3) === 350),
      ),
      true,
      '3d-iv: disjoint dependent-predicate write must commit across r1/r2/r3',
    );
    assert.equal(readAccountBalance(r1.db, 1), 100);
    assert.equal(countDbReservations(r1.db), 1);

    race.setMemoryDivergence(false);
    await clientT.query('ROLLBACK');
    assert.equal(
      await cluster.group.waitFor(
        () => [r1, r2, r3].every((svc) => countDbReservations(svc.db) === 0),
      ),
      true,
    );
    // Reset row 2 back to 200 before 3d-ii.
    await clientDisjoint.query('UPDATE accounts SET balance = 200 WHERE id = 2');

    // --- 3d-ii: committed Raft applyParticipantPrepare path behind uncommitted ACQUIRE ---
    clearMemoryReservations();
    await clientW2.query('BEGIN');
    await clientW2.query('SELECT balance FROM accounts WHERE id = 2');
    await clientT.query('BEGIN');
    race.armHoldOn(isAcquireCmd);
    const tAcquire2 = clientT.query('SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE');
    assert.equal(
      await cluster.group.waitFor(
        () => race.state.triggeredCommand !== null && race.state.heldDeliveries.length >= 2,
      ),
      true,
    );
    const indexAfterAcquire = r1.raft.readStatus().lastIndex;

    await clientW2.query(DEPENDENT_PREDICATE_STMT_1);
    await clientW2.query(DEPENDENT_PREDICATE_STMT_2);
    const w2CommitOutcome = expectSqlState(clientW2, 'COMMIT', [], LOCK_NOT_AVAILABLE_SQLSTATE);
    assert.equal(
      await cluster.group.waitFor(() => r1.raft.readStatus().lastIndex > indexAfterAcquire),
      true,
      '3d-ii: W2 PARTICIPANT_PREPARE must enter r1 Raft log behind uncommitted ACQUIRE',
    );

    race.setMemoryDivergence(true);
    race.flush();
    assertNumericRowValues((await tAcquire2).rows, [{id: 1, balance: 100}]);
    await w2CommitOutcome;

    const w2TxId = race.state.capturedPrepareTxId;
    assert.ok(w2TxId, '3d-ii: W2 PARTICIPANT_PREPARE transactionId must be observed');
    assert.equal(
      await cluster.group.waitFor(() =>
        [r1, r2, r3].every((svc) => {
          const row = svc.db
            .prepare('SELECT state, refusal_cause FROM _participant_transactions WHERE transaction_id = ?')
            .get(w2TxId);
          return row?.state === 'REFUSED' && row?.refusal_cause === 'lock_conflict';
        }),
      ),
      true,
      '3d-ii: all three replicas must deterministically settle W2 as REFUSED(lock_conflict)',
    );
    for (const svc of [r1, r2, r3]) {
      assert.equal(readAccountBalance(svc.db, 1), 100, `3d-ii: id=1 intact on ${svc.replicaId}`);
      assert.equal(readAccountBalance(svc.db, 2), 200, `3d-ii: id=2 intact on ${svc.replicaId}`);
      assert.equal(countDbReservations(svc.db), 1, `3d-ii: T lock intact on ${svc.replicaId}`);
    }

    race.setMemoryDivergence(false);
    await clientT.query('UPDATE accounts SET balance = 175 WHERE id = 1');
    await clientT.query('COMMIT');
    assert.equal(
      await cluster.group.waitFor(
        () => [r1, r2, r3].every((svc) =>
          readAccountBalance(svc.db, 1) === 175 && countDbReservations(svc.db) === 0),
      ),
      true,
      '3d-ii: T commit must apply 175 and release lock across r1/r2/r3',
    );
  } finally {
    race.restore();
    await clientT.end().catch(() => {});
    await clientW.end().catch(() => {});
    await clientW2.end().catch(() => {});
    await clientDisjoint.end().catch(() => {});
  }
}
