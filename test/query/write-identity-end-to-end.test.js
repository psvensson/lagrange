// Receipts (quest reroute-carries-the-entry-id):
//   rerouted-write-after-outcome-unknown-applies-once-and-answers-success
//   every-release-cause-reroutes-with-the-entry-id
//   a-client-idempotency-key-makes-resubmission-idempotent
//   write-answers-cross-the-wire-whole-and-reroute-admission-is-by-code
//   admin-receipt-binds-a-replayed-answer-by-entry-id
//
// A client write goes the whole production way: SQLQueryEngine -> the
// distributed write coordinator -> QueryExecutor -> the message router -> the
// partition's own transport handler (handleRemoteQuery) on real
// PartitionService replicas. Groups are formed through the production
// admission path (partition-admitted-group-fixture.js); the one replica whose
// proposal must stay uncommitted until its commit deadline runs on the
// controllable consensus port with its own clock virtual, as the typed-release
// witnesses stage it. The router is the replicas' own loopback transport with
// a log of every statement the executor sent and what came back; it answers
// for a stopped replica the way the production router answers an address with
// no handler, and a scenario may delay a delivery (network delay) or act while
// it is pending (the environment: a clock).
//
// Every expectation is read from production: the replicas' databases on
// independent connections, the committed-statement outcome rows, the
// proposals of the durable log (the store owner's statement and the proposal
// codec), the router log, and the answers the engine gives its client. An
// application of a statement is a proposal carrying it whose log index holds
// an outcome row: a same-entryId re-proposal is answered from the first
// entry's row and holds none. The literals are inputs (rows, values, keys) and
// the names of the contract this quest seals: the typed fields of a write
// answer that must cross the wire, and the text-classification names that must
// have no source consumer left.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
  createLoopbackTransport,
} from '../partition/partition-service-test-support.js';
import {buildAdminWriteReceipt} from '../../src/admin/admin-write-receipt.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCOperation} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMP_PREFIX = 'write-identity-end-to-end-';
const TABLE_NAME = 'identity_rows';
const KEY_COLUMN = 'id';
const TEST_TIMEOUT_MS = 120000;
const GROUP_BUDGET_MS = 15000;
const CLIENT_BUDGET_MS = 12000;
const REISSUE_BUDGET_MS = 3000;
const POLL_MS = 10;
const PAYLOAD_ENCODING = 'base64';
const VIRTUAL_START_MS = 1000000;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
// Inputs: the rows a client writes. The UPDATE sets a value (it does not
// append to the value it finds: the engine's parser does not carry an
// expression in SET), so an application is counted from the durable record,
// never from the value.
const SEED_ID = 'row-0';
const SEED_VALUE = 'seed';
const UPDATED_VALUE = 'updated';
const INSERTED_ID = 'row-a';
const INSERTED_VALUE = 'inserted';
const OVERSIZED_ID = 'row-oversized';
const OVERSIZED_VALUE_BYTES = 200000;
const NUDGE_ID = 'row-nudge';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const UPDATE_SQL = `UPDATE ${TABLE_NAME} SET value = ? WHERE id = ?`;
const VALUE_SQL = `SELECT value FROM ${TABLE_NAME} WHERE id = ?`;
const COUNT_SQL = `SELECT COUNT(*) AS count FROM ${TABLE_NAME} WHERE id = ?`;
const OUTCOME_ROWS_SQL =
  'SELECT log_index, outcome FROM _partition_statement_outcomes';
const {
  QUERY_MESSAGE_FIELD_ENTRY_ID: ENTRY_ID_FIELD,
  QUERY_MESSAGE_TYPE,
} = QUERY_EXECUTOR_SHARED;
// The table's catalogue row, as the engine's and every replica's
// system-table cache hold it (its active partition version is the epoch the
// engine fences a write with and the partition validates).
const TABLE_ROW = Object.freeze({
  table_id: TABLE_NAME,
  table_name: TABLE_NAME,
  primaryKey: KEY_COLUMN,
  active_partition_version: 1,
});

// The contract: the typed fields of a partition write answer that must reach
// the executor as the partition answered them (quest
// reroute-carries-the-entry-id, C4).
const WRITE_ANSWER_WIRE_FIELDS = Object.freeze([
  'failureCode',
  'retryAfterMs',
  'consensus',
  'entryId',
  'idempotentReplay',
  'logIndex',
  'replayOfLogIndex',
  'changes',
]);
// The text classification of a partition write answer that must have no
// source consumer left (C5): the errors owner's fragment list and its text
// predicate (a fragment-based isLeaderUnavailable consumes the predicate).
const TEXT_CLASSIFICATION_NAMES = Object.freeze([
  'REROUTABLE_WRITE_ERROR_FRAGMENTS',
  'isReroutableWriteError',
]);
const ERRORS_OWNER = 'src/constants/errors.js';
const SOURCE_ROOT = 'src';
const SOURCE_EXTENSION = '.js';

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'write-identity-node'}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, budgetMs = GROUP_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

function deferred() {
  let resolve = null;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return {promise, resolve};
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: KEY_COLUMN, type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function membersOf(partitionId, size) {
  return Array.from({length: size}, (_unused, index) =>
    [`${partitionId}-r${index + 1}`, `node-${index + 1}`]);
}

function withIndependent(dbPath, read) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

function valueOn(dbPath, id) {
  return withIndependent(dbPath, (db) =>
    db.prepare(VALUE_SQL).get(id)?.value ?? null);
}

function countOn(dbPath, id) {
  return withIndependent(dbPath, (db) => db.prepare(COUNT_SQL).get(id).count);
}

// The proposals of a group's durable log, by the store owner's own statement
// and the proposal codec, on an independent connection.
function durableProposals(dbPath, groupId) {
  return withIndependent(dbPath, (db) =>
    db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(groupId)
      .filter((row) => Number(row.entry_type) === RAFT_RS_ENTRY_TYPE.NORMAL &&
        typeof row.data === 'string' && row.data.length > 0)
      .map((row) => ({
        index: Number(row.log_index),
        term: Number(row.term),
        command: decodeCommittedProposal(
          Buffer.from(row.data, PAYLOAD_ENCODING)),
      })));
}

// The log indexes whose committed statement has a recorded outcome.
function settledIndexes(dbPath) {
  return withIndependent(dbPath, (db) => new Set(db.prepare(OUTCOME_ROWS_SQL)
    .all().map((row) => Number(row.log_index))));
}

// The engine re-renders a statement's text from its parse, so a statement is
// identified by its verb and its parameters (every scenario's inputs are
// distinct).
function verbOf(sql) {
  return String(sql ?? '').trim().split(/\s+/u, 1)[0].toUpperCase();
}

function sameStatement(candidate, statement) {
  return verbOf(candidate.sql) === verbOf(statement.sql) &&
    JSON.stringify(candidate.params) === JSON.stringify(statement.params);
}

// How many times a replica applied a statement: the proposals of its log
// carrying it (under any entryId) whose index holds an outcome row.
function applicationsIn(dbPath, proposals, statement) {
  const settled = settledIndexes(dbPath);
  return proposals.filter((proposal) =>
    sameStatement(proposal.command, statement) &&
    settled.has(proposal.index)).length;
}

function applicationsOn(dbPath, groupId, statement) {
  return applicationsIn(dbPath, durableProposals(dbPath, groupId), statement);
}

// The applied proposal of an entryId on one replica.
function appliedProposalOf(dbPath, groupId, entryId) {
  const settled = settledIndexes(dbPath);
  return durableProposals(dbPath, groupId).find((proposal) =>
    proposal.command.entryId === entryId && settled.has(proposal.index)) ||
    null;
}

function proposedOn(dbPath, groupId, entryId) {
  return durableProposals(dbPath, groupId).some((proposal) =>
    proposal.command.entryId === entryId);
}

// The engine's catalogue for the one partition of the table: the table, its
// partition, and the replicas' service rows (the first replica published as
// the leader, as the fixture forms the group).
function createSystemCache(partitionId, members, addressOf) {
  const rows = {
    tables: [TABLE_ROW],
    partitions: [{
      partition_id: partitionId,
      table_name: TABLE_NAME,
      leader_node_id: members[0][1],
      partition_key_start: null,
      partition_key_end: null,
    }],
    services: members.map((member, index) => ({
      service_id: member[0],
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: member[1],
      raft_role: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
      address: addressOf(member),
      status: SERVICE_STATUS.ACTIVE,
    })),
  };
  return {
    get(type, key) {
      const keyField = type === 'tables' ? 'table_name' : 'partition_id';
      return (rows[type] || []).find((row) => row[keyField] === key) || null;
    },
    filter(type, predicate) {
      return (rows[type] || []).filter(predicate);
    },
    getAll(type) {
      return rows[type] || [];
    },
  };
}

// Every replica's cache holds the table's catalogue row, as a node's does.
function publishTableRow(services) {
  for (const service of services) {
    service.systemTableCache.applySystemTableChange(TABLES.TABLES,
      CDCOperation.INSERT, {...TABLE_ROW});
  }
}

// The executor's message router: the replicas' own loopback transport
// (`send`), with a log of every statement sent and its answer. A stopped
// replica is answered the way the production router answers an address with
// no handler. `intercept(record, deliver)`, when a scenario sets it, performs
// the delivery (it may delay it, or act while it is pending).
function createLoggedRouter(send) {
  const router = {
    log: [],
    stopped: new Set(),
    intercept: null,
    async deliver(address, message) {
      const record = {
        address,
        sql: message?.sql ?? null,
        params: message?.params ?? null,
        entryId: message?.[ENTRY_ID_FIELD] ?? null,
        message,
        answer: undefined,
      };
      router.log.push(record);
      const deliver = () => router.stopped.has(address) ?
        {noHandler: true, error: ROUTER_ERROR_MSG.noHandlerForAddress(address)} :
        send(address, message);
      record.answer = await (router.intercept ?
        router.intercept(record, deliver) : deliver());
      return record.answer;
    },
  };
  return router;
}

function createClient(partitionId, members, addressOf, send) {
  const router = createLoggedRouter(send);
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(partitionId, members, addressOf),
    messageRouter: router,
  });
  return {engine, router};
}

function clientWrite(client, statement, options = {}) {
  return client.engine.executeQuery(statement.sql, statement.params, {
    timeoutMs: CLIENT_BUDGET_MS,
    ...options,
  });
}

function sentOf(router, statement) {
  return router.log.filter((entry) => sameStatement(entry, statement));
}

function participantsOf(answer) {
  return [
    ...(Array.isArray(answer?.participantResults) ?
      answer.participantResults : []),
    ...(Array.isArray(answer?.participantFailures) ?
      answer.participantFailures : []),
    ...(answer?.firstFailedParticipant ? [answer.firstFailedParticipant] : []),
  ];
}

// The entryIds an engine answer names for its client: its own, and those of
// its participants (their answers and their durable commit witnesses).
function entryIdsNamedBy(answer) {
  return new Set([answer, ...participantsOf(answer)].flatMap((part) => [
    part?.entryId,
    part?.durableCommitWitness?.entryId,
  ]).filter((entryId) => typeof entryId === 'string'));
}

function answeredAsReplay(answer) {
  return [answer, ...participantsOf(answer)].some((part) =>
    part?.idempotentReplay === true);
}

function summarize(answer) {
  return JSON.stringify({
    success: answer?.success,
    affectedRows: answer?.affectedRows,
    error: answer?.error,
    entryIds: [...entryIdsNamedBy(answer)],
    replay: answeredAsReplay(answer),
  });
}

function currentLeader(services) {
  return services.find((service) => service.raft &&
    service.raft.readStatus().role === RAFT_ROLE.LEADER) || null;
}

const SEED = Object.freeze({sql: INSERT_SQL, params: [SEED_ID, SEED_VALUE]});
const UPDATE = Object.freeze({
  sql: UPDATE_SQL, params: [UPDATED_VALUE, SEED_ID], rowId: SEED_ID});
const INSERT = Object.freeze({
  sql: INSERT_SQL, params: [INSERTED_ID, INSERTED_VALUE], rowId: INSERTED_ID});

// A 3-replica (or lone) admitted group serving a client write, a client in
// front of it, and the group's transport with switches that drop the first
// replica's outgoing consensus traffic (its proposal stays in its log,
// unacknowledged) or the consensus messages of named peer pairs.
async function withGroup(partitionId, size, body) {
  quietEnvironment(GROUP_TIMING);
  const members = membersOf(partitionId, size);
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  publishTableRow(group.services);
  const network = group.services[0].transport;
  const deliver = network.deliver;
  const send = (address, message) => deliver.call(network, address, message);
  const client = createClient(partitionId, members, group.addressOf, send);
  const traffic = {dropLeaderOutgoing: false, blocked: null};
  network.deliver = (address, envelope, ...rest) => {
    const consensus = envelope?.payload ?? envelope;
    const dropped = (traffic.dropLeaderOutgoing &&
      !String(address).startsWith(`${members[0][1]}/`)) ||
      (traffic.blocked !== null && typeof consensus?.from === 'string' &&
        traffic.blocked.has(`${consensus.from}>${consensus.to}`));
    return dropped ? Promise.resolve({acknowledged: true}) :
      deliver.call(network, address, envelope, ...rest);
  };
  try {
    const seeded = await clientWrite(client, SEED);
    assert.equal(seeded.success, true,
      `setup: the group serves a client write (${summarize(seeded)})`);
    assert.equal(await waitUntil(() => members.every((member) =>
      countOn(group.dbFileOf(member), SEED_ID) === 1)), true,
    'setup: every replica applied it');
    await body({group, members, client, traffic,
      partitionId: group.services[0].partitionId});
  } finally {
    network.deliver = deliver;
    await group.dispose();
    resetEnvironment();
  }
}

// ---------------------------------------------------------------------------
// W1: the r5-g2-dup shape through a node. Two client writes are pending on a
// leader whose outgoing consensus traffic is dropped; its disk fills, so the
// next proposal's persistence fails and the pending writes are released
// OUTCOME_UNKNOWN; after the heal they commit. The executor sends each again
// under its entryId (the router holds a second delivery until the commit is
// on every replica), and the partition answers it from the outcome row.

test('rerouted write after outcome unknown applies once and answers success',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withGroup('identity-reroute', 3, async ({group, members, client,
      traffic, partitionId}) => {
      const [leader] = group.services;
      const leaderDb = group.dbFileOf(members[0]);
      const statements = [UPDATE, INSERT];
      const committed = deferred();
      client.router.intercept = async (record, deliver) => {
        if (sentOf(client.router, record).length > 1) {
          await committed.promise;
        }
        return deliver();
      };
      traffic.dropLeaderOutgoing = true;
      const answers = statements.map((statement) =>
        clientWrite(client, statement));
      assert.equal(await waitUntil(() => statements.every((statement) =>
        sentOf(client.router, statement).some((entry) =>
          proposedOn(leaderDb, partitionId, entry.entryId)))), true,
      'setup: both writes are proposed on the leader and pending');
      const maxPages = leader.db.pragma('max_page_count', {simple: true});
      leader.db.pragma('wal_checkpoint(TRUNCATE)');
      leader.db.pragma(`max_page_count = ${
        leader.db.pragma('page_count', {simple: true})}`);
      const refused = await leader.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT_SQL,
        params: [OVERSIZED_ID, 'x'.repeat(OVERSIZED_VALUE_BYTES)],
        entryId: 'e-oversized',
      });
      assert.equal(refused.success, false,
        'setup: the proposal whose persistence fails is refused');
      assert.equal(await waitUntil(() => statements.every((statement) =>
        sentOf(client.router, statement)[0].answer?.success === false)), true,
      'setup: the leader released the pending writes unanswered by consensus');
      leader.db.pragma(`max_page_count = ${maxPages}`);
      traffic.dropLeaderOutgoing = false;
      assert.equal(await waitUntil(async () => {
        const current = currentLeader(group.services);
        const nudged = current ? await current.applyWrite({
          type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT_SQL,
          params: [NUDGE_ID, SEED_VALUE], entryId: 'e-nudge',
        }) : null;
        return nudged?.success === true && members.every((member) =>
          statements.every((statement) => applicationsOn(
            group.dbFileOf(member), partitionId, statement) === 1));
      }), true, 'setup: the released writes commit after the heal');
      committed.resolve();
      const answered = await Promise.all(answers);

      for (const member of members) {
        const dbPath = group.dbFileOf(member);
        assert.deepEqual(statements.map((statement) =>
          applicationsOn(dbPath, partitionId, statement)), [1, 1],
        `${member[0]} applied each write once`);
        assert.deepEqual([valueOn(dbPath, SEED_ID), countOn(dbPath,
          INSERTED_ID)], [UPDATED_VALUE, 1],
        `${member[0]} holds the writes' rows`);
      }
      assert.deepEqual(answered.map((answer) => answer.success), [true, true],
        'the released writes, sent again under their entryId, answer the ' +
        `client success (${answered.map(summarize).join(' | ')})`);
      for (const [index, statement] of statements.entries()) {
        const sent = sentOf(client.router, statement);
        assert.ok(sent.length > 1, 'the executor sent the write again');
        assert.equal(new Set(sent.map((entry) => entry.entryId)).size, 1,
          'every delivery of the write carries its one entryId');
        assert.equal(answeredAsReplay(answered[index]), true,
          'the answer is the replay of the committed write');
        assert.equal(answered[index].affectedRows,
          countOn(leaderDb, statement.rowId),
          'the replay answers the rows the write changed');
      }
    });
  });

// ---------------------------------------------------------------------------
// W2 + W3 + W4: every cause that releases a proposed write (leadership lost,
// the commit deadline, the leader's shutdown). The client supplies an
// idempotency key. Each write (an INSERT: its success answer carries the
// durable commit witness of its entry) must be sent again under its own
// entryId and answered success naming it; a re-issue under the same key
// applies nothing a second time.

// The client's re-issue under its idempotency key once a leader serves, and
// what every replica applied of the statement.
async function reissue(record, {client, services, dbFiles, proposalsOf}) {
  const sent = sentOf(client.router, INSERT);
  assert.equal(sent[0]?.answer?.success, false,
    `setup: ${record.cause}: the partition released the proposed write`);
  record.entryId = sent[0]?.entryId ?? null;
  record.deliveries = sent.map((entry) => entry.entryId);
  await waitUntil(() => currentLeader(services) !== null);
  record.reissue = await clientWrite(client, INSERT,
    {idempotencyKey: record.idempotencyKey, timeoutMs: REISSUE_BUDGET_MS});
  const applications = () => dbFiles.map((dbPath) =>
    applicationsIn(dbPath, proposalsOf(dbPath), INSERT));
  await waitUntil(() => new Set(applications()).size === 1);
  record.applications = applications();
}

async function releaseByLeadershipLoss(record) {
  await withGroup('identity-cause-leadership', 3, async ({group, members,
    client, traffic, partitionId}) => {
    const [r1, r2, r3] = group.services;
    const peer = (service) => String(service.raft.readStatus().peerId);
    const [p1, p2, p3] = [peer(r1), peer(r2), peer(r3)];
    // r1 -> r2 passes; r1 -> r3 and everything to r1 is dropped: r2 holds
    // the proposal, r2 is made to lead and commits it, r1 has not heard.
    traffic.blocked = new Set([`${p1}>${p3}`, `${p2}>${p1}`, `${p3}>${p1}`]);
    const answer = clientWrite(client, INSERT,
      {idempotencyKey: record.idempotencyKey});
    const dbFiles = members.map((member) => group.dbFileOf(member));
    assert.equal(await waitUntil(() => sentOf(client.router, INSERT).some(
      (entry) => proposedOn(dbFiles[1], partitionId, entry.entryId))), true,
    'setup: r2 holds the proposal');
    r2.raft.campaign();
    assert.equal(await waitUntil(() =>
      r2.raft.readStatus().role === RAFT_ROLE.LEADER), true, 'setup: r2 leads');
    assert.equal(await waitUntil(() => dbFiles.slice(1).every((dbPath) =>
      applicationsOn(dbPath, partitionId, INSERT) === 1)), true,
    'setup: the new leader committed it');
    traffic.blocked = null;
    record.answer = await answer;
    await reissue(record, {client, services: group.services, dbFiles,
      proposalsOf: (dbPath) => durableProposals(dbPath, partitionId)});
  });
}

async function releaseByCommitDeadline(record) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const partitionId = 'identity-cause-deadline';
  const members = membersOf(partitionId, 1);
  const dbPath = path.join(directory, `${members[0][0]}.db`);
  const clock = new VirtualTimeSource({startMs: VIRTUAL_START_MS});
  const provider = new ControllablePartitionRaftProvider();
  const network = createLoopbackTransport();
  const service = createControllablePartitionService({
    ...tableOptions(), partitionId, replicaId: members[0][0],
    replicaIds: [members[0][0]], nodeId: members[0][1], dbPath,
    transport: network, systemTableCache: new SystemTableCache(),
    timeSource: clock,
  }, provider);
  // This port's log: what it committed, at the index it committed it.
  const committedLog = [];
  const commit = (command) => {
    provider.commit(command);
    committedLog.push({index: provider.committedIndex, term: provider.term,
      command});
  };
  const captured = [];
  const capture = {on: false};
  provider.setProposeHandler(async (entry) => {
    if (capture.on) {
      captured.push(entry);
      return;
    }
    commit(entry);
  });
  try {
    await service.initialize();
    publishTableRow([service]);
    const client = createClient(partitionId, members,
      ([replicaId, nodeId]) => `${nodeId}/partition/${replicaId}`,
      (address, message) => network.deliver(address, message));
    assert.equal((await clientWrite(client, SEED)).success, true,
      'setup: the partition serves a client write');
    // The proposal is accepted and never committed; the partition's own
    // clock passes its commit deadline; the released proposal then commits.
    client.router.intercept = async (entry, deliver) => {
      if (!capture.on || sentOf(client.router, entry).length > 1) {
        return deliver();
      }
      const pending = deliver();
      await waitUntil(() => captured.length > 0);
      clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
      const released = await pending;
      capture.on = false;
      commit(captured[0]);
      return released;
    };
    capture.on = true;
    record.answer = await clientWrite(client, INSERT,
      {idempotencyKey: record.idempotencyKey});
    capture.on = false;
    client.router.intercept = null;
    await reissue(record, {client, services: [service], dbFiles: [dbPath],
      proposalsOf: () => committedLog});
  } finally {
    await service.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

async function releaseByShutdown(record) {
  await withGroup('identity-cause-shutdown', 3, async ({group, members,
    client, traffic, partitionId}) => {
    const [leader] = group.services;
    traffic.dropLeaderOutgoing = true;
    const answer = clientWrite(client, INSERT,
      {idempotencyKey: record.idempotencyKey});
    assert.equal(await waitUntil(() => sentOf(client.router, INSERT).some(
      (entry) => proposedOn(group.dbFileOf(members[0]), partitionId,
        entry.entryId))), true,
    'setup: the leader holds the proposal, unacknowledged');
    client.router.stopped.add(group.addressOf(members[0]));
    await leader.shutdown();
    traffic.dropLeaderOutgoing = false;
    record.answer = await answer;
    await reissue(record, {client, services: group.services.slice(1),
      dbFiles: members.slice(1).map((member) => group.dbFileOf(member)),
      proposalsOf: (dbPath) => durableProposals(dbPath, partitionId)});
  });
}

test('every release cause reroutes with the entry id',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const causes = [
      ['leadership-lost', releaseByLeadershipLoss],
      ['commit-deadline', releaseByCommitDeadline],
      ['shutdown', releaseByShutdown],
    ];
    const records = [];
    for (const [cause, stage] of causes) {
      const record = {cause, idempotencyKey: `client-key-${cause}`};
      await stage(record);
      records.push(record);
    }
    const notRerouted = records.filter((record) => !(
      record.deliveries.length > 1 &&
      new Set(record.deliveries).size === 1 &&
      record.answer?.success === true &&
      entryIdsNamedBy(record.answer).has(record.entryId)))
      .map((record) => `${record.cause}: sent ${record.deliveries.length}x ` +
        `under ${[...new Set(record.deliveries)].join(',')}, answered ` +
        summarize(record.answer));
    assert.deepEqual(notRerouted, [],
      'every released write is sent again under its own entryId and ' +
      'answers the client success naming it');
    for (const record of records) {
      assert.equal(record.reissue?.success, true,
        `${record.cause}: the keyed re-issue succeeds`);
      assert.deepEqual(record.applications,
        record.applications.map(() => 1),
        `${record.cause}: the write and its keyed re-issue apply once`);
    }
  });

// ---------------------------------------------------------------------------
// W5: a client-supplied idempotency key reaches the coordinator's identity
// derivation: two submissions under one key are one write; two without a key
// are two.

test('a client idempotency key makes resubmission idempotent',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withGroup('identity-key', 1, async ({group, members, client,
      partitionId}) => {
      const dbPath = group.dbFileOf(members[0]);
      const keyless = {sql: UPDATE_SQL, params: ['keyless', SEED_ID]};
      const keyed = {sql: UPDATE_SQL, params: ['keyed', SEED_ID]};
      const idempotencyKey = 'client-key-update-once';
      const keyedAnswers = [];
      for (let submission = 0; submission < 2; submission += 1) {
        await clientWrite(client, keyless);
      }
      for (let submission = 0; submission < 2; submission += 1) {
        keyedAnswers.push(await clientWrite(client, keyed, {idempotencyKey}));
      }
      assert.equal(applicationsOn(dbPath, partitionId, keyless), 2,
        'two keyless submissions are two writes, each applied');
      assert.equal(applicationsOn(dbPath, partitionId, keyed), 1,
        'two submissions under one client idempotency key apply once ' +
        `(answers: ${keyedAnswers.map(summarize).join(' | ')})`);
      assert.equal(new Set(sentOf(client.router, keyed).map((entry) =>
        entry.entryId)).size, 1,
      'both keyed submissions reach the partition under one entryId');
      assert.equal(keyedAnswers[1].success, true, 'the resubmission succeeds');
      assert.equal(answeredAsReplay(keyedAnswers[1]), true,
        'the resubmission is answered as a replay');
      assert.equal(keyedAnswers[1].affectedRows, keyedAnswers[0].affectedRows,
        'the replay answers the original affected rows');
      assert.equal(keyedAnswers[0].affectedRows, countOn(dbPath, SEED_ID),
        'the original affected rows are the rows the statement matched');
    });
  });

// ---------------------------------------------------------------------------
// W7 + W8: the partition's write answers (a replay, a backpressure refusal, a
// released unknown outcome) cross the transport as the partition answered
// them, and no source file classifies a partition answer by its text.

function sourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(SOURCE_EXTENSION) ? [full] : [];
  });
}

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gmu, '$1');
}

function textClassificationConsumers() {
  const names = new RegExp(`\\b(${TEXT_CLASSIFICATION_NAMES.join('|')})\\b`,
    'u');
  return sourceFiles(path.join(ROOT, SOURCE_ROOT))
    .map((file) => path.relative(ROOT, file))
    .filter((file) => file !== ERRORS_OWNER && names.test(
      withoutComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))))
    .sort();
}

// The typed fields the partition answered that the wire did not carry.
function droppedOnTheWire(kind, inside, wire) {
  return WRITE_ANSWER_WIRE_FIELDS.filter((field) =>
    inside?.[field] !== undefined &&
    JSON.stringify(wire?.[field]) !== JSON.stringify(inside[field]))
    .map((field) => `${kind}.${field}`);
}

test('write answers cross the wire whole and reroute admission is by code',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withGroup('identity-wire', 3, async ({group, members, client,
      traffic, partitionId}) => {
      const [leader] = group.services;
      const address = group.addressOf(members[0]);
      // What the partition answered each transport query, by its entryId
      // (observed on the way out; the call goes through unchanged).
      const answeredInside = new Map();
      const executeQuery = leader.executeQuery.bind(leader);
      leader.executeQuery = async (sql, params, options) => {
        const answer = await executeQuery(sql, params, options);
        answeredInside.set(options?.entryId ?? null, answer);
        return answer;
      };
      const query = (id, entryId) => client.router.deliver(address, {
        type: QUERY_MESSAGE_TYPE.QUERY, sql: INSERT_SQL,
        params: [id, SEED_VALUE], [ENTRY_ID_FIELD]: entryId,
      });
      const kinds = [
        ['replay', 'e-wire-applied'],
        ['backpressure', 'e-wire-refused'],
        ['released', 'e-wire-pending'],
      ];
      const onTheWire = new Map();
      await query('row-wire', 'e-wire-applied');
      onTheWire.set('e-wire-applied', await query('row-wire', 'e-wire-applied'));
      traffic.dropLeaderOutgoing = true;
      // The proposal queue's capacity (a test seam, as the verifier's
      // backpressure shape sets it): one pending write fills it.
      leader.proposalQueue.maxCapacity = 1;
      const pending = query('row-pending', 'e-wire-pending');
      assert.equal(await waitUntil(() => proposedOn(group.dbFileOf(
        members[0]), partitionId, 'e-wire-pending')), true,
      'setup: a write is pending on the leader');
      onTheWire.set('e-wire-refused', await query('row-refused',
        'e-wire-refused'));
      await leader.shutdown();
      onTheWire.set('e-wire-pending', await pending);
      assert.deepEqual(kinds.filter(([, entryId]) =>
        !answeredInside.has(entryId)), [],
      'setup: the partition answered every query');
      assert.deepEqual({
        droppedOnTheWire: kinds.flatMap(([kind, entryId]) => droppedOnTheWire(
          kind, answeredInside.get(entryId), onTheWire.get(entryId))),
        textClassificationConsumers: textClassificationConsumers(),
      }, {
        droppedOnTheWire: [],
        textClassificationConsumers: [],
      }, 'every typed field of a partition write answer crosses the wire, ' +
        'and no source file classifies a partition answer by its text');
    });
  });

// ---------------------------------------------------------------------------
// W6: the admin write receipt of a replayed answer. A client write commits
// through its proposer r1; leadership then moves to r2, and the same request
// sent again reaches r2, which answers it from its outcome row. The receipt
// binds that answer by (partitionId, entryId, term, logIndex) and the replay
// flag, and names the replica that proposed the entry - never the replica
// that answered.

test('admin receipt binds a replayed answer by entry id',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withGroup('identity-receipt', 3, async ({group, members, client,
      partitionId}) => {
      const [, r2] = group.services;
      const original = await clientWrite(client, UPDATE,
        {idempotencyKey: 'client-key-receipt'});
      assert.equal(original.success, true, 'setup: the write commits');
      const [sent] = sentOf(client.router, UPDATE);
      assert.equal(await waitUntil(() => members.every((member) =>
        appliedProposalOf(group.dbFileOf(member), partitionId,
          sent.entryId) !== null)), true, 'setup: every replica applied it');
      const proposal = appliedProposalOf(group.dbFileOf(members[0]),
        partitionId, sent.entryId);
      r2.raft.campaign();
      assert.equal(await waitUntil(() =>
        r2.raft.readStatus().role === RAFT_ROLE.LEADER), true,
      'setup: r2 leads');
      const replayed = await client.router.deliver(
        group.addressOf(members[1]), sent.message);
      assert.equal(replayed.success, true,
        `setup: r2 answers the same request (${JSON.stringify(replayed)})`);
      const receipt = buildAdminWriteReceipt({
        operationId: original.operationId,
        idempotencyKey: original.idempotencyKey,
        participantResults: [{...replayed, partitionId}],
      });
      const [participant] = receipt.participantReceipts;
      const witness = participant?.durableCommitWitness ?? null;
      assert.equal(receipt.commitWitnessComplete, true,
        `the replayed answer's receipt is complete (${JSON.stringify(receipt)})`);
      assert.deepEqual({
        partitionId: witness?.partitionId,
        entryId: witness?.entryId,
        term: witness?.term,
        logIndex: witness?.logIndex,
      }, {
        partitionId,
        entryId: proposal.command.entryId,
        term: proposal.term,
        logIndex: proposal.index,
      }, 'the receipt binds the committed entry of the durable log');
      assert.equal(witness?.leaderReplicaId, proposal.command.proposedBy,
        'the receipt names the replica that proposed the entry, not the ' +
        `replica that answered the replay (${JSON.stringify(witness)})`);
      assert.equal(participant?.idempotentReplay, true,
        'the receipt marks the answer as a replay');
    });
  });
