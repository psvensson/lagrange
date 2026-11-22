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
  clearAllReservations,
  clearMemoryReservations,
  stageLocalWriteReservation,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  applyLockingReadReservationCommand,
} from '../../src/partition/partition-locking-read-service.js';
import {
  ensureLockingReadTableInitialized,
} from '../../src/partition/partition-locking-read-store.js';
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

export async function setupTwoNodeCluster(options = {}) {
  clearAllReservations();
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
      await releaseOwners.dispose().catch(() => {});
      await group.dispose().catch(() => {});
      gateway.db.close();
      clearAllReservations();
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
  db.prepare('INSERT INTO accounts (id, balance) VALUES (1, 100), (2, 200)').run();
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

function buildModelPrepare(svc, txId, sql, params, genBase) {
  return buildPrepareCommand(
    modelIdentity(txId),
    {
      operationsText: JSON.stringify([{sql, params}]),
      validationText: validationTextOf(genBase, ACCOUNTS_PARTITION_ID, 1),
    },
    modelStamp(svc),
  );
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

/**
 * P5.3 bounded schedule explorer connected directly to real production partition apply
 * (`applyLockingReadReservationCommand`, `applyCommittedTransactionCommand`).
 * Enumerates all 48 legal committed-order interleavings across ACQUIRE-first / PREPARE-first,
 * provisional leader staging, disjoint-row writes, same-tx reentrancy, duplicate delivery,
 * winner commit vs release/rollback, and successor progress on two replicas with diverged memory.
 *
 * @return {Object} Summary statistics of explored schedules and verified transitions.
 */
export function runBoundedReciprocalExclusionExplorer() {
  const stats = {
    schedulesExplored: 0,
    stepsVerified: 0,
    acquireFirstRefusals: 0,
    prepareFirstRefusals: 0,
    reentrantSuccesses: 0,
    duplicateReplays: 0,
    disjointCommits: 0,
    successorWins: 0,
  };
  const orders = ['ACQUIRE_FIRST', 'PREPARE_FIRST'];
  const stagings = ['STAGED_BEFORE_LOG', 'UNSTAGED'];
  const disjointSlots = ['BEFORE_BOTH', 'BETWEEN', 'AFTER_BOTH'];
  const extras = ['REENTRANT_SAME_TX', 'DUPLICATE_DELIVERY'];
  const settlements = ['WINNER_COMMITS', 'WINNER_RELEASES'];

  for (const order of orders) {
    for (const staging of stagings) {
      for (const disjointSlot of disjointSlots) {
        for (const extra of extras) {
          for (const settlement of settlements) {
            const label = `${order}/${staging}/${disjointSlot}/${extra}/${settlement}`;
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
                rA, 'tx-D', 'UPDATE accounts SET balance = 250 WHERE id = 2', [], genD,
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

            try {
              const genStart = readPartitionWriteGeneration(rA.db);
              if (staging === 'STAGED_BEFORE_LOG') {
                const sessW = openParticipantSession(
                  rA, modelIdentity('tx-W'), {generationBase: genStart, originIndex: 1},
                );
                const staged = runParticipantSessionStatement(rA, sessW, {
                  sql: 'UPDATE accounts SET balance = 500 WHERE id = 1',
                  params: [],
                });
                assert.equal(staged.success, true, `${label}: provisional staging on rA`);
              }
              if (disjointSlot === 'BEFORE_BOTH') runDisjointD();

              const acqT = buildLockingReadCommand(rA, {
                op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
                transactionId: 'tx-T', sessionId: 's-tx-T',
                participantId: `tx-T:${ACCOUNTS_PARTITION_ID}`,
              });
              const prepW = buildModelPrepare(
                rA, 'tx-W', 'UPDATE accounts SET balance = 500 WHERE id = 1', [],
                readPartitionWriteGeneration(rA.db),
              );

              if (order === 'ACQUIRE_FIRST') {
                const acqAns = applyBoth(acqT);
                assert.equal(acqAns.success, true, `${label}: ACQUIRE(T) first must succeed`);
                if (disjointSlot === 'BETWEEN') runDisjointD();
                const prepWAns = applyBoth(prepW);
                assert.equal(prepWAns.success, false, `${label}: conflicting PREPARE(W) must refuse`);
                assert.equal(prepWAns.refusalCause, 'lock_conflict');
                assert.equal(prepWAns.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);
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
                  const dupPrep = applyBoth(prepW);
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
                // Terminal cleanup & fresh successor progress on id = 1.
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
              } else {
                const prepWAns = applyBoth(prepW);
                assert.equal(prepWAns.success, true, `${label}: PREPARE(W) first must succeed`);
                if (disjointSlot === 'BETWEEN') runDisjointD();
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
                  // Re-entrant ACQUIRE by the prepared writer itself (tx-W) is permitted.
                  const selfAcq = buildLockingReadCommand(rA, {
                    op: 'ACQUIRE', tableName: ACCOUNTS_TABLE, pkValues: [1],
                    transactionId: 'tx-W', sessionId: 's-tx-W',
                    participantId: `tx-W:${ACCOUNTS_PARTITION_ID}`,
                  });
                  assert.equal(applyBoth(selfAcq).success, true);
                  stats.reentrantSuccesses += 1;
                }
                if (disjointSlot === 'AFTER_BOTH') runDisjointD();
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
                // Successor T_next acquires id = 1 cleanly after W settles, then releases.
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
              assert.equal(readAccountBalance(rA.db, 2), 250, `${label}: disjoint id=2 committed`);
              assert.equal(readAccountBalance(rB.db, 2), 250, `${label}: disjoint id=2 replicated`);
              stats.schedulesExplored += 1;
            } finally {
              rA.db.close();
              rB.db.close();
              clearMemoryReservations();
            }
          }
        }
      }
    }
  }
  return stats;
}
