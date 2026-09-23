// Every write this replica did not take is answered through the write
// kernel's builders, typed (quest raft-rs-single-path-partition-cutover, F-ak
// after verification round 5).
//
// A pending write released without an answer from consensus says what the
// proposal queue knew of it and why it was released: handed to consensus
// (PROPOSED) its outcome is not known here - at its commit deadline, or when
// its service shuts down - so it is answered OUTCOME_UNKNOWN with its entryId
// (a retry with it is idempotent) and the cause; never handed to it (QUEUED)
// it was not proposed, and a shutdown answers SERVICE_SHUTDOWN. A write the
// proposal queue refuses at capacity is BACKPRESSURE with the queue's own
// retryAfterMs; a proposal the port refuses is CONSENSUS_REFUSED with the
// port's reason and retryability. Nothing is proposed for the not-proposed
// cases. A router that holds the answer routes it again by its code.
//
// The verifier's r5-g2 shapes, on production partitions where the state is
// real: the leader of an admitted group whose outgoing transport is dropped
// holds a PROPOSED write; a lone leader whose user session holds the
// connection holds a QUEUED write (the port defers it). The 30-second commit
// deadline and a core refusal run on the controllable port (its proposal is
// accepted and never committed, or refused) with the replica's own clock
// virtual, so the deadline is the partition's own timer, advanced. Codes,
// causes and budgets are the owners' (the write kernel, the proposal queue,
// the partition's defaults); the durable log is read on an independent
// connection through the store owner's own statement and proposal codec.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
} from './partition-service-test-support.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import * as proposalQueueConstants from
  '../../src/partition/proposal-queue-constants.js';
import {deepFreeze} from '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TEMP_PREFIX = 'partition-write-typed-releases-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'typed_release_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const PROMPT_ANSWER_MS = 1500;
const PENDING_SETTLE_MS = 80;
const STILL_PENDING = 'still-pending';
const PAYLOAD_ENCODING = 'base64';
const VIRTUAL_START_MS = 1000000;
// A test clock of the configuration's own (the verifier's group timing).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
// Input: what a refusing port answers (the port's own outcome vocabulary).
const CORE_REFUSAL = deepFreeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: 'proposal-refused-by-test-port',
  phase: 'propose',
  retryable: false,
  recoveryRequired: false,
});

const REFUSAL = partitionWriteKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL;
const RELEASE_CAUSE = partitionWriteKernel.PARTITION_WRITE_RELEASE_CAUSE;

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'typed-release-node'}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function loneOptions(partitionId, dbPath, extra = {}) {
  return {
    ...tableOptions(),
    partitionId,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'typed-release-node',
    dbPath,
    ...extra,
  };
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function answeredPromptly(promise) {
  return Promise.race([promise, sleep(PROMPT_ANSWER_MS).then(() =>
    STILL_PENDING)]);
}

// The entryIds of the proposals a group's durable log holds, by the store
// owner's own log statement and the proposal codec, on an independent
// connection.
function durableEntryIds(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(groupId)
      .filter((row) => Number(row.entry_type) === RAFT_RS_ENTRY_TYPE.NORMAL &&
        typeof row.data === 'string' && row.data.length > 0)
      .map((row) => decodeCommittedProposal(
        Buffer.from(row.data, PAYLOAD_ENCODING)).entryId);
  } finally {
    independent.close();
  }
}

// Asserts one answer is the typed answer of a write this replica did not
// take, with its code and its entry.
function assertTyped(answer, {code, entryId}, label) {
  assert.notEqual(answer, STILL_PENDING, `${label}: the write is answered`);
  assert.equal(answer.success, false, `${label}: not acknowledged`);
  assert.ok(typeof code === 'string' && answer.failureCode === code,
    `${label}: typed ${code} (${JSON.stringify(answer)})`);
  assert.equal(answer.entryId, entryId, `${label}: it names its entry`);
}

async function withDirectory(body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    await body(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

test('F-ak: a proposed write still pending at its commit deadline is ' +
  'answered OUTCOME_UNKNOWN with its entry, the cause and the deadline',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  await withDirectory(async (directory) => {
    const clock = new VirtualTimeSource({startMs: VIRTUAL_START_MS});
    const provider = new ControllablePartitionRaftProvider();
    const service = createControllablePartitionService(loneOptions(
      'fak-deadline', path.join(directory, DB_FILE), {timeSource: clock}),
    provider);
    try {
      await service.initialize();
      const pending = insert(service, 'row-a', 'deadline', 'e-deadline');
      await new Promise((resolve) => setImmediate(resolve));
      clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
      const answer = await answeredPromptly(pending);
      assertTyped(answer, {code: REFUSAL?.OUTCOME_UNKNOWN,
        entryId: 'e-deadline'}, 'the deadline');
      assert.deepEqual(answer.consensus, {
        reason: RELEASE_CAUSE?.COMMIT_DEADLINE_EXCEEDED,
        deadlineMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS,
      }, 'it names the commit deadline and its length');
    } finally {
      await service.shutdown();
    }
  });
});

test('F-ak: a proposed write pending on the leader at shutdown is answered ' +
  'OUTCOME_UNKNOWN with its entry and the cause', {timeout: TEST_TIMEOUT_MS},
async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'fak-shutdown-proposed';
  const members = [
    [`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'],
    [`${partitionId}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const [leader] = group.services;
  const network = leader.transport;
  const deliver = network.deliver;
  let dropOutgoing = false;
  // The leader's outgoing messages to its followers are dropped: its
  // proposal is in its log and is never acknowledged.
  network.deliver = (address, ...rest) => (dropOutgoing &&
    !String(address).includes(members[0][1]) ? Promise.resolve(
      {acknowledged: true}) : deliver.call(network, address, ...rest));
  try {
    assert.equal((await insert(leader, 'row-0', 'setup', 's-setup'))
      .success, true, 'setup: the group serves a write');
    dropOutgoing = true;
    const pending = insert(leader, 'row-a', 'pending', 'e-shutdown');
    await sleep(PENDING_SETTLE_MS);
    assert.equal(await Promise.race([pending, sleep(1).then(() =>
      STILL_PENDING)]), STILL_PENDING, 'setup: the write is pending');
    assert.ok(durableEntryIds(group.dbFileOf(members[0]), partitionId)
      .includes('e-shutdown'), 'setup: it was proposed (it is on the ' +
      'leader\'s log)');
    await leader.shutdown();
    const answer = await answeredPromptly(pending);
    assertTyped(answer, {code: REFUSAL?.OUTCOME_UNKNOWN,
      entryId: 'e-shutdown'}, 'the shutdown release');
    assert.equal(answer.consensus?.reason, RELEASE_CAUSE?.SHUTDOWN,
      'it names the shutdown as its cause');
  } finally {
    network.deliver = deliver;
    await group.dispose();
    resetEnvironment();
  }
});

// A lone leader whose user session holds its connection: the port defers
// every proposal, so a write stays QUEUED (registered, never handed over).
async function withSessionHeldLeader(partitionId, body) {
  quietEnvironment();
  await withDirectory(async (directory) => {
    const dbPath = path.join(directory, DB_FILE);
    const service = new PartitionService(loneOptions(partitionId, dbPath));
    try {
      await service.initialize();
      assert.equal((await insert(service, 'row-0', 'setup', 's-setup'))
        .success, true, 'setup: the lone leader serves a write');
      await service.beginTransaction(`${partitionId}-session`);
      await body({service, dbPath});
    } finally {
      await service.shutdown();
    }
  });
}

test('F-ak: a write the proposal queue refuses at capacity is BACKPRESSURE ' +
  'with the queue\'s retryAfterMs and its entry, and never proposed',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSessionHeldLeader('fak-backpressure', async ({service,
    dbPath}) => {
    service.proposalQueue.maxCapacity = 1;
    const queued = insert(service, 'row-q', 'queued', 'e-holds-the-slot');
    await sleep(PENDING_SETTLE_MS);
    const refused = await answeredPromptly(
      insert(service, 'row-b', 'refused', 'e-backpressure'));
    assertTyped(refused, {code: REFUSAL?.BACKPRESSURE,
      entryId: 'e-backpressure'}, 'backpressure');
    assert.equal(refused.retryAfterMs, proposalQueueConstants
      .PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS,
    'it carries the proposal queue\'s own retry time');
    await service.shutdown();
    await answeredPromptly(queued);
    assert.equal(durableEntryIds(dbPath, service.partitionId)
      .includes('e-backpressure'), false, 'it was never proposed');
  });
});

test('F-ak: a queued write at shutdown is answered SERVICE_SHUTDOWN with ' +
  'its entry and the cause, and never proposed', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSessionHeldLeader('fak-queued-shutdown', async ({service,
    dbPath}) => {
    const queued = insert(service, 'row-q', 'queued', 'e-queued');
    await sleep(PENDING_SETTLE_MS);
    assert.equal(await Promise.race([queued, sleep(1).then(() =>
      STILL_PENDING)]), STILL_PENDING, 'setup: the write is pending');
    await service.shutdown();
    const answer = await answeredPromptly(queued);
    assertTyped(answer, {code: REFUSAL?.SERVICE_SHUTDOWN,
      entryId: 'e-queued'}, 'the queued write at shutdown');
    assert.equal(answer.consensus?.reason, RELEASE_CAUSE?.SHUTDOWN,
      'it names the shutdown as its cause');
    assert.equal(durableEntryIds(dbPath, service.partitionId)
      .includes('e-queued'), false, 'it was never proposed');
  });
});

test('F-ak: a proposal the port refuses is answered CONSENSUS_REFUSED with ' +
  'the port\'s reason and retryability, and routed again by its code',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  await withDirectory(async (directory) => {
    const provider = new ControllablePartitionRaftProvider();
    provider.setProposeHandler(() => CORE_REFUSAL);
    const service = createControllablePartitionService(loneOptions(
      'fak-core-refused', path.join(directory, DB_FILE)), provider);
    try {
      await service.initialize();
      const answer = await answeredPromptly(
        insert(service, 'row-r', 'refused', 'e-core-refused'));
      assertTyped(answer, {code: REFUSAL?.CONSENSUS_REFUSED,
        entryId: 'e-core-refused'}, 'the core refusal');
      assert.deepEqual(answer.consensus, {reason: CORE_REFUSAL.reason,
        phase: CORE_REFUSAL.phase, retryable: CORE_REFUSAL.retryable},
      'it carries the port\'s reason, phase and retryability');
      assert.equal(service.proposalQueue.size, 0,
        'no pending write remains');
      assert.equal(partitionWriteKernel.isReroutableWriteFailureCode?.(
        answer.failureCode), true, 'the kernel names it routable again');
    } finally {
      await service.shutdown();
    }
  });
});

// The routers that hold a partition write answer route it again by its code
// (the census: the CDC integration's local system-table write and its
// transient classification, and the replica-operation repository's retry
// classification); a text they cannot classify does not hide a routable
// code. The codes are the write kernel's own.
test('F-ak: the routers that hold a write answer route it again by its code',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    quietEnvironment();
    try {
      const cdc = new CDCIntegrationService({nodeId: 'typed-release-node'});
      const repository = new ReplicaOperationRepository({
        nodeId: 'typed-release-node',
        systemTableCache: {get: () => null, getAll: () => [],
          filter: () => []},
        cdcIntegrationService: {waitForCacheUpdate: async () => {}},
        controlPlaneSystemTableGateway: {},
        logger: {info() {}, warn() {}, error() {}, debug() {}},
      });
      const codes = [REFUSAL.NOT_LEADER, REFUSAL.OUTCOME_UNKNOWN,
        REFUSAL?.SERVICE_SHUTDOWN, REFUSAL?.BACKPRESSURE,
        REFUSAL?.CONSENSUS_REFUSED];
      for (const code of codes) {
        const answer = {success: false, failureCode: code,
          error: 'an answer text no router lists'};
        assert.ok(typeof code === 'string' && cdc.isTransientCdcError(answer),
          `the CDC integration retries ${code} by its code`);
        assert.equal(repository.isRetryableOperationPersistError(answer),
          true, `the replica-operation repository retries ${code} by its ` +
          'code');
      }
      const hostFailure = {success: false, failureCode:
        REFUSAL.CONSENSUS_HOST_FAILURE, error: 'an answer text no router ' +
        'lists'};
      assert.equal(cdc.isTransientCdcError(hostFailure), false,
        'a host failure while proposing is not routed again by its code');
    } finally {
      resetEnvironment();
    }
  });

// F-aj (verification round 6): the CDC integration's local system-table
// lane sends a write its local partition did not take on to the next local
// service - without the write's entryId - so it routes on only an answer the
// kernel names routable again without it. A write released after it was
// proposed has an unknown outcome (it may have committed there): answered as
// it is, never sent on. One released before it was proposed is sent on.
test('F-aj: the CDC local system-table lane sends on a write never ' +
  'proposed, and answers an unknown outcome as it is',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  try {
    const STATE = proposalQueueConstants.PROPOSAL_QUEUE_PROPOSAL_STATE;
    const released = (proposal) => partitionWriteKernel
      .buildReleasedPendingWriteAnswer({entryId: 'e-local', proposal,
        logIndex: null}, 'local-p1', {cause: RELEASE_CAUSE?.LEADERSHIP_LOST});
    for (const [proposal, sentOn] of [[STATE.PROPOSED, false],
      [STATE.QUEUED, true]]) {
      const cdc = new CDCIntegrationService({nodeId: 'typed-release-node'});
      const answer = released(proposal);
      const asked = [];
      const localService = (name, answered) => ({
        executeQuery: async () => {
          asked.push(name);
          return answered;
        },
      });
      cdc.resolveLocalSystemTableServices = () => [
        localService('first', answer),
        localService('next', {success: true, changes: 1})];
      cdc.hasActiveSystemTableWriteMirror = () => false;
      const outcome = await cdc.tryExecuteLocalSystemTableWrite(
        `INSERT INTO ${SYSTEM_TABLE_NAME.NODES} (node_id) VALUES (?)`,
        ['node-local']);
      assert.deepEqual(asked, sentOn ? ['first', 'next'] : ['first'],
        `a ${proposal} release (${answer.failureCode}) is ` +
        `${sentOn ? 'sent on to the next local service' : 'not sent on'}`);
      if (!sentOn) {
        assert.equal(outcome.result?.failureCode, REFUSAL.OUTCOME_UNKNOWN,
          'the unknown outcome is answered as it is');
      }
    }
  } finally {
    resetEnvironment();
  }
});
