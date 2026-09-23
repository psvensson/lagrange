// A host failure of one partition's group is that group's own failure
// (quest raft-rs-single-path-partition-cutover: F-m after verification round
// 2, B6 after verification round 3).
//
// An environmental SQLite failure (the disk is full) is a host failure: the
// entry is not consumed and the group is RECOVERY_REQUIRED. Its failure scope
// follows its class. Only a core failure (the shared WASM instance trapped)
// replaces the shared rs-raft runtime and resumes every group once. A host
// failure reconstructs the failing group alone, in the current core, at most
// once per retry window while the failure persists; nothing reaches any other
// group - no core call, no term, no log entry, no announcement - and every
// operation inside the window is a typed deferral that touches no core.
//
// While its group is unusable a partition does not lead: the runtime
// announces once that the group has no role and no leader, so the partition's
// leadership observation follows its port and a write is refused with a typed
// outcome instead of being proposed into a broken group. After a successful
// reconstruction the group's real role is announced: a sole voter campaigns
// again (a partition whose election is deferred has no tick to time out on).
//
// The failure is real, not stubbed: SQLite's own page limit
// (`max_page_count`) makes the application statement (through a trigger that
// amplifies it) or the store's log append fail with SQLITE_FULL. Healing is
// lifting the limit. Every observation is the port's (readStatus) or the
// durable record's, read on an independent read-only connection through the
// store owner's own reader; the retry window is the tuning owner's.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import * as partitionConstants from
  '../../src/partition/partition-service-constants.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import * as runtimeConstants from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import * as runtimeTuning from '../../src/raft/raft-rs-runtime-tuning.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} = partitionConstants;
const TEMP_PREFIX = 'runtime-reconstruction-leadership-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'reconstruction_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_IDS_SQL = `SELECT id FROM ${TABLE_NAME} ORDER BY id`;
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
// Inputs that make SQLite itself run out of pages: the amplifier copies this
// many blobs of this size per application statement, and the limit leaves
// this many pages of headroom, so the store's own small writes still fit.
const AMPLIFIER_ROWS = 400;
const AMPLIFIER_BLOB_BYTES = 4000;
const APPLY_PAGE_HEADROOM = 12;
// A value larger than the page limit leaves room for, so the store's log
// append of the proposal itself fails.
const OVERSIZED_VALUE_BYTES = 200000;
const SQLITE_FULL = 'SQLITE_FULL';
const UNLIMITED_PAGES = 1073741823;
// The verifier's r3-s7 shape: a quiet period driven only by the broken
// partition's own clock, then this many reads and writes on it.
const QUIET_PERIOD_MS = 2000;
const STORM_READS = 50;
const STORM_WRITES = 10;
// A test clock of the configuration's own (the verifier's timing).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
// An inbound heartbeat whose commit lies far beyond any log: raft-rs traps
// on it (the seam the runtime's own recovery tests use for a CORE_FATAL).
const TRAPPING_COMMIT = '999999';
const HEARTBEAT_MESSAGE_TYPE = 8;
const FOREIGN_PEER_OFFSET = 1000;

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'reconstruction-node'}, raft});
  LoggingService.getInstance().initialize({level: 'error'});
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

// The whole durable record of a group, through the store owner's own reader
// on a read view of an independent connection (no DDL, nothing written).
function durableRecordOf(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const view = Object.create(RaftRsDurableStore.prototype);
    view.db = independent;
    return view.readDurableRecord(groupId);
  } finally {
    independent.close();
  }
}

// The facts a reconstruction of another group would move: the durable
// record (term, hard state, every log entry) and the runtime generation.
function untouchedFacts(service, dbPath) {
  const record = durableRecordOf(dbPath, service.partitionId);
  return {
    term: record.hardState?.term ?? null,
    hardState: record.hardState,
    logEntries: record.entries.length,
    runtimeGeneration: service.raft.readStatus().runtimeGeneration,
  };
}

function rowIds(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(SELECT_IDS_SQL).all().map((row) => row.id);
  } finally {
    independent.close();
  }
}

// Every application statement on the table also copies the amplifier's
// blobs, and SQLite may grow the file by only a few pages: the statement
// fails with SQLITE_FULL while the store's own small writes still fit.
function limitPagesForTheApplication(db) {
  db.exec('CREATE TABLE reconstruction_amplifier_source ' +
    '(k INTEGER PRIMARY KEY, b BLOB)');
  const fill = db.prepare(
    'INSERT INTO reconstruction_amplifier_source (b) VALUES (zeroblob(?))');
  for (let row = 0; row < AMPLIFIER_ROWS; row += 1) {
    fill.run(AMPLIFIER_BLOB_BYTES);
  }
  db.exec('CREATE TABLE reconstruction_amplifier_sink (k INTEGER, b BLOB)');
  db.exec('CREATE TRIGGER reconstruction_amplifier AFTER INSERT ON ' +
    `${TABLE_NAME} BEGIN INSERT INTO reconstruction_amplifier_sink ` +
    'SELECT k, b FROM reconstruction_amplifier_source; END');
  db.pragma('wal_checkpoint(TRUNCATE)');
  const pages = db.pragma('page_count', {simple: true});
  db.pragma(`max_page_count = ${pages + APPLY_PAGE_HEADROOM}`);
}

function healApplicationLimit(db) {
  db.pragma(`max_page_count = ${UNLIMITED_PAGES}`);
  db.exec('DROP TRIGGER reconstruction_amplifier');
}

// The page limit leaves no room at all: the store's log append of a large
// proposal fails.
function limitPagesForPersistence(db) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma(`max_page_count = ${db.pragma('page_count', {simple: true})}`);
}

// The retry window the runtime's tuning owner derives for a partition's
// group from the timing the partition gave its port.
function retryWindowOf(service) {
  return runtimeTuning.recoveryRetryWindowMsOf(service.raftTimingConfig);
}

// Asserts one outcome is the typed recovery deferral (or the failure of a
// reconstruction attempt) of a group whose application failed, and returns
// it.
function assertRecoveryOutcome(outcome, window, label) {
  const {HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
  assert.equal(outcome?.outcome, HOST_FAILURE,
    `${label}: a host failure outcome (${JSON.stringify(outcome)})`);
  assert.equal(outcome.recoveryRequired, true, `${label}: recoveryRequired`);
  assert.equal(outcome.role, null, `${label}: the group has no role`);
  assert.equal(outcome.failure?.phase,
    runtimeConstants.RUNTIME_PHASE.APPLICATION,
    `${label}: it names the original failure's phase`);
  assert.ok(String(outcome.failure?.reason).includes(SQLITE_FULL),
    `${label}: it names the original failure's reason`);
  assert.ok(Number.isFinite(outcome.retryAfterMs) &&
    outcome.retryAfterMs >= 0 && outcome.retryAfterMs <= window,
  `${label}: retryAfterMs within one window (${outcome.retryAfterMs})`);
  assert.ok(Number.isInteger(outcome.attempts) && outcome.attempts >= 0,
    `${label}: it counts the reconstruction attempts`);
  return outcome;
}

function isDeferral(outcome) {
  return outcome?.reason === runtimeConstants.RUNTIME_REASON.RECOVERY_DEFERRED;
}

// Lone leaders in one process, on the configuration's raft timing.
async function withLonePartitions(extraOptions, body, raft = {}) {
  quietEnvironment(raft);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const services = [];
  const open = async (partitionId, options = extraOptions) => {
    const dbPath = path.join(directory, `${partitionId}-${DB_FILE}`);
    const partition = new PartitionService({
      ...tableOptions(),
      partitionId,
      replicaId: `${partitionId}-r1`,
      replicaIds: [`${partitionId}-r1`],
      nodeId: 'reconstruction-node',
      dbPath,
      ...options,
    });
    services.push(partition);
    await partition.initialize();
    partition.startElection();
    return {partition, dbPath};
  };
  try {
    await body(open);
  } finally {
    for (const service of services) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

// W-B6-2 and W-B6-4 on one lone leader: honest leadership during the outage,
// the next write after the heal served in process, the sibling untouched.
async function loneLeaderCase(partitionId, extraOptions) {
  await withLonePartitions(extraOptions, async (open) => {
    const {partition, dbPath} = await open(partitionId);
    const sibling = await open(`${partitionId}-sibling`);
    const setup = await insert(partition, 'row-0', 'setup', 'entry-setup');
    assert.equal(setup.success, true, 'setup: the lone leader serves a write');
    assert.equal((await insert(sibling.partition, 's-0', 'setup',
      'sibling-setup')).success, true, 'setup: the sibling serves a write');
    const generationBefore = partition.raft.readStatus().runtimeGeneration;
    const appliedBefore = durableRecordOf(dbPath, partitionId).appliedIndex;
    const siblingBefore = untouchedFacts(sibling.partition, sibling.dbPath);

    limitPagesForTheApplication(partition.db);
    const failed = await insert(partition, 'row-1', 'full', 'entry-full');
    assert.equal(failed.success, false,
      `the write is not acknowledged (${JSON.stringify(failed)})`);
    assert.ok(String(failed.error).startsWith(
      PARTITION_SERVICE_ERROR_MSG.COMMITTED_STATEMENT_ENVIRONMENT_FAILED),
    `the failure is the typed environmental outcome (${failed.error})`);
    assert.ok(String(failed.error).includes(SQLITE_FULL),
      'it carries the SQLite code the host raised');
    assert.equal(durableRecordOf(dbPath, partitionId).appliedIndex,
      appliedBefore, 'the failed entry is not consumed');

    // W-B6-4: during the outage the partition does not lead, and a write is
    // refused at once with a typed outcome; nothing is proposed.
    assert.equal(partition.isLeader, false,
      'W-B6-4: the partition does not observe itself as leader while its ' +
      'group is unusable');
    const entriesDuring = durableRecordOf(dbPath, partitionId).entries.length;
    const refused = await insert(partition, 'row-x', 'outage', 'entry-outage');
    assert.equal(refused.success, false, 'W-B6-4: the write is refused');
    assert.equal(refused.failureCode, partitionWriteKernel
      .PARTITION_WRITE_LEADERSHIP_REFUSAL?.CONSENSUS_RECOVERY_REQUIRED,
    `W-B6-4: with the typed recovery outcome (${JSON.stringify(refused)})`);
    assert.equal(durableRecordOf(dbPath, partitionId).entries.length,
      entriesDuring, 'W-B6-4: nothing was proposed (entriesAdded 0)');

    healApplicationLimit(partition.db);
    const beforeHeal = partition.raft.readStatus();
    if (beforeHeal.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      // The next attempt is due when the typed outcome says so.
      await sleep(assertRecoveryOutcome(beforeHeal, retryWindowOf(partition),
        'the outage').retryAfterMs + 1);
    }
    const next = await insert(partition, 'row-2', 'healed', 'entry-healed');
    const status = partition.raft.readStatus();
    assert.equal(next.success, true,
      'W-B6-2: the next write after the host heals succeeds without a ' +
      `restart (${JSON.stringify(next)})`);
    assert.equal(status.role, RAFT_ROLE.LEADER,
      'W-B6-2: the sole voter leads its group again');
    assert.equal(partition.isLeader, true,
      'W-B6-2: the partition observes the leadership its port reports');
    assert.equal(status.runtimeGeneration, generationBefore,
      'W-B6-2: the group was reconstructed in the current core (no ' +
      'runtime replacement, no restart)');
    assert.deepEqual(rowIds(dbPath), ['row-0', 'row-1', 'row-2'],
      'W-B6-2: the committed entry the host failed is applied once it ' +
      'heals, then the next write');
    assert.deepEqual(untouchedFacts(sibling.partition, sibling.dbPath),
      siblingBefore, 'W-B6-2: the sibling was never touched (+0 term, +0 ' +
      'log entries, same hard state and runtime generation)');
  });
}

test('W-B6-2/W-B6-4: a lone leader whose election runs on its own clock ' +
  'does not lead during an environmental failure and serves the next write ' +
  'after it heals; its sibling is untouched', {timeout: TEST_TIMEOUT_MS},
async () => {
  await loneLeaderCase('fm-scheduled', {});
});

test('W-B6-2/W-B6-4: a lone leader with a deferred election (the seed\'s ' +
  'system partitions) does the same', {timeout: TEST_TIMEOUT_MS}, async () => {
  await loneLeaderCase('fm-deferred', {deferElection: true});
});

test('W-B6-1: a persistent host failure of one partition never touches its ' +
  'sibling, and its reconstruction is attempted at most once per retry ' +
  'window', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions({}, async (open) => {
    const {partition, dbPath} = await open('b6-broken');
    const sibling = await open('b6-healthy');
    assert.equal((await insert(partition, 'row-0', 'setup', 'b-setup'))
      .success, true, 'setup: the broken-to-be partition serves a write');
    assert.equal((await insert(sibling.partition, 's-0', 'setup', 's-setup'))
      .success, true, 'setup: the sibling serves a write');
    limitPagesForTheApplication(partition.db);
    const failed = await insert(partition, 'row-1', 'full', 'b-full');
    assert.equal(failed.success, false, 'setup: the application fails');
    const failedAt = Date.now();
    const siblingBefore = untouchedFacts(sibling.partition, sibling.dbPath);

    // Only the broken partition's own clock drives it.
    await sleep(QUIET_PERIOD_MS);
    const reads = [];
    for (let read = 0; read < STORM_READS; read += 1) {
      reads.push(partition.raft.readStatus());
    }
    const writes = [];
    for (let write = 0; write < STORM_WRITES; write += 1) {
      writes.push(await insert(partition, `storm-${write}`, 'v',
        `b-storm-${write}`));
    }
    const elapsedMs = Date.now() - failedAt;
    const siblingAfter = untouchedFacts(sibling.partition, sibling.dbPath);

    assert.equal(siblingAfter.term, siblingBefore.term,
      'sibling term unchanged while the broken partition\'s failure ' +
      `persists (${siblingBefore.term} -> ${siblingAfter.term})`);
    assert.equal(siblingAfter.logEntries, siblingBefore.logEntries,
      'sibling log unchanged (+0 entries)');
    assert.deepEqual(siblingAfter.hardState, siblingBefore.hardState,
      'sibling hard state unchanged');
    assert.equal(siblingAfter.runtimeGeneration,
      siblingBefore.runtimeGeneration,
      'the shared runtime was never replaced (+0 generations)');

    const window = retryWindowOf(partition);
    for (const [index, read] of reads.entries()) {
      assertRecoveryOutcome(read, window, `read ${index}`);
    }
    assert.ok(reads.some(isDeferral),
      'reads inside the window are typed deferrals');
    for (const [index, write] of writes.entries()) {
      assert.equal(write.success, false, `write ${index} is refused`);
      assert.equal(write.failureCode, partitionWriteKernel
        .PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
      `write ${index} carries the typed recovery outcome`);
    }
    const last = assertRecoveryOutcome(partition.raft.readStatus(), window,
      'after the storm');
    const bound = Math.ceil(elapsedMs / window) + 1;
    assert.ok(last.attempts <= bound,
      `reconstruction attempts ${last.attempts} <= ceil(${elapsedMs} / ` +
      `${window}) + 1 = ${bound}`);
    assert.equal((await insert(sibling.partition, 's-1', 'served', 's-1'))
      .success, true, 'the sibling serves a write throughout');
    assert.equal(untouchedFacts(sibling.partition, sibling.dbPath).term,
      siblingBefore.term, 'the sibling still leads in the same term');
    assert.deepEqual(rowIds(dbPath), ['row-0'],
      'the broken partition acknowledged nothing it did not apply');
  }, GROUP_TIMING);
});

test('W-B6-3: a follower\'s persistence failure reconstructs only the ' +
  'follower\'s group; the leader keeps serving and the follower catches up ' +
  'after the heal', {timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'b6-follower';
  const members = [['b6f-r1', 'node-1'], ['b6f-r2', 'node-2'],
    ['b6f-r3', 'node-3']];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const {services, dbFileOf, waitFor} = group;
  const [leader, follower] = services;
  try {
    assert.equal((await insert(leader, 'row-0', 'setup', 'f-setup')).success,
      true, 'setup: the group serves a write');
    const leaderBefore = durableRecordOf(dbFileOf(members[0]), partitionId);
    const generationBefore = leader.raft.readStatus().runtimeGeneration;

    limitPagesForPersistence(follower.db);
    const big = await insert(leader, 'row-1', 'x'.repeat(
      OVERSIZED_VALUE_BYTES), 'f-big');
    const small = await insert(leader, 'row-2', 'small', 'f-small');
    const leaderDuring = durableRecordOf(dbFileOf(members[0]), partitionId);
    assert.equal(leaderDuring.hardState.term, leaderBefore.hardState.term,
      'the leader\'s term is unchanged by the follower\'s failure');
    assert.equal(leader.raft.readStatus().runtimeGeneration,
      generationBefore, 'the shared runtime was not replaced');
    assert.equal(leaderDuring.entries.length,
      leaderBefore.entries.length + 2,
      'the leader\'s log holds exactly the two writes it served (no ' +
      'reconstruction entry)');
    assert.equal(big.success && small.success, true,
      `the leader keeps serving writes (${JSON.stringify([big, small])})`);
    assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER,
      'the leader keeps leading');
    assert.equal(await waitFor(() => follower.raft.readStatus().outcome ===
      RAFT_OPERATION_OUTCOME.HOST_FAILURE), true,
    'the follower reports its own host failure');

    follower.db.pragma(`max_page_count = ${UNLIMITED_PAGES}`);
    const leaderApplied = () =>
      durableRecordOf(dbFileOf(members[0]), partitionId).appliedIndex;
    assert.equal(await waitFor(() =>
      durableRecordOf(dbFileOf(members[1]), partitionId).appliedIndex ===
        leaderApplied()), true, 'the follower catches up after the heal');
    assert.deepEqual(rowIds(dbFileOf(members[1])),
      rowIds(dbFileOf(members[0])), 'the follower holds the leader\'s rows');
    assert.equal(durableRecordOf(dbFileOf(members[0]), partitionId)
      .hardState.term, leaderBefore.hardState.term,
    'the leader never lost its term');
    assert.equal(leader.raft.readStatus().runtimeGeneration,
      generationBefore, 'no runtime replacement at any point');
  } finally {
    await group.dispose();
    resetEnvironment();
  }
});

test('W-B6-3: a leader\'s persistence failure reconstructs only the ' +
  'leader\'s group; after the heal exactly one replica leads and every ' +
  'replica observes the leadership its port reports',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'fm-group';
  const members = [['fm-group-r1', 'node-1'], ['fm-group-r2', 'node-2'],
    ['fm-group-r3', 'node-3']];
  const group = await formAdmittedGroup({
    partitionId,
    members,
    tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(),
    budgetMs: GROUP_BUDGET_MS,
  });
  const {services, dbFileOf, waitFor} = group;
  const [leader] = services;
  const leaderOf = () => services.find((service) =>
    service.raft?.readStatus().role === RAFT_ROLE.LEADER);
  try {
    const setup = await insert(leader, 'row-0', 'setup', 'entry-setup');
    assert.equal(setup.success, true, 'setup: the group serves a write');
    const generationBefore = leader.raft.readStatus().runtimeGeneration;

    limitPagesForPersistence(leader.db);
    const failed = await insert(leader, 'row-1', 'x'.repeat(
      OVERSIZED_VALUE_BYTES), 'entry-full');
    assert.equal(failed.success, false,
      `the leader's write is not acknowledged (${failed.error})`);
    const during = leader.raft.readStatus();
    assert.equal(during.runtimeGeneration ?? generationBefore,
      generationBefore, 'the shared runtime was not replaced for one ' +
      'group\'s host failure');
    for (const follower of services.slice(1)) {
      assert.equal(follower.raft.readStatus().runtimeGeneration,
        generationBefore, 'no follower group was restored');
    }
    // The failed group announced that it has no role: the partition must
    // observe that at once, not keep acting as leader until a later tick.
    assert.equal(leader.isLeader, false,
      'the old leader\'s leadership observation follows its port right ' +
      `after the failure (port ${JSON.stringify(during.role ?? null)})`);
    leader.db.pragma(`max_page_count = ${UNLIMITED_PAGES}`);

    let served = null;
    assert.equal(await waitFor(async () => {
      const current = leaderOf();
      if (current === undefined) {
        return false;
      }
      served = await insert(current, 'row-2', 'healed', 'entry-healed');
      return served.success === true;
    }), true, 'a leader serves a write after the host heals, without a ' +
      `restart (${JSON.stringify(served)})`);
    const current = leaderOf();
    assert.equal(current.raft.readStatus().runtimeGeneration,
      generationBefore, 'the recovery happened in the current core');
    assert.equal(await waitFor(() => services.every((service) =>
      service.isLeader ===
        (service.raft.readStatus().role === RAFT_ROLE.LEADER))), true,
    'every replica\'s leadership observation matches its port: ' +
      JSON.stringify(services.map((service) => [service.isLeader,
        service.raft.readStatus().role])));
    assert.equal(services.filter((service) => service.isLeader).length, 1,
      'exactly one replica observes itself as leader');
    assert.ok(rowIds(dbFileOf(members[services.indexOf(current)]))
      .includes('row-2'), 'the leader holds the write it acknowledged');
  } finally {
    await group.dispose();
    resetEnvironment();
  }
});

test('W-B6-5: a core failure (the shared WASM instance trapped) still ' +
  'replaces the runtime and resumes every group exactly once',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions({deferElection: true}, async (open) => {
    const victim = await open('b6-trapped');
    const sibling = await open('b6-resumed');
    assert.equal((await insert(victim.partition, 'v-0', 'setup', 'v-setup'))
      .success, true, 'setup: the victim serves a write');
    assert.equal((await insert(sibling.partition, 's-0', 'setup', 's-setup'))
      .success, true, 'setup: the sibling serves a write');
    const before = victim.partition.raft.readStatus();
    const siblingBefore = untouchedFacts(sibling.partition, sibling.dbPath);

    const accepted = await victim.partition.raft.step({
      groupId: victim.partition.partitionId,
      to: before.peerId,
      message: {
        from: String(Number(before.peerId) + FOREIGN_PEER_OFFSET),
        to: before.peerId,
        msgType: HEARTBEAT_MESSAGE_TYPE,
        term: String(Number(before.term) + 1),
        logTerm: '0',
        index: '0',
        commit: TRAPPING_COMMIT,
      },
    });
    assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'setup: the envelope is admitted');
    const originalConsoleError = console.error;
    let trapped;
    try {
      console.error = () => undefined;
      trapped = await victim.partition.raft.tick();
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
      `setup: the core trapped (${JSON.stringify(trapped)})`);

    // The next operation replaces the runtime: every group is restored and
    // resumed once - the sibling, a sole voter, campaigns once.
    const siblingStatus = sibling.partition.raft.readStatus();
    assert.equal(siblingStatus.runtimeGeneration,
      siblingBefore.runtimeGeneration + 1,
      'a core failure replaces the shared runtime once');
    assert.equal(siblingStatus.role, RAFT_ROLE.LEADER,
      'the sibling leads in the replaced runtime');
    for (let read = 0; read < STORM_READS; read += 1) {
      victim.partition.raft.readStatus();
      sibling.partition.raft.readStatus();
    }
    assert.equal((await insert(victim.partition, 'v-1', 'after', 'v-after'))
      .success, true, 'the victim serves a write after the replacement');
    assert.equal((await insert(sibling.partition, 's-1', 'after', 's-after'))
      .success, true, 'the sibling serves a write after the replacement');
    const siblingAfter = untouchedFacts(sibling.partition, sibling.dbPath);
    assert.equal(siblingAfter.runtimeGeneration,
      siblingBefore.runtimeGeneration + 1,
      'exactly one replacement: later operations do not replace it again');
    assert.equal(Number(siblingAfter.term), Number(siblingBefore.term) + 1,
      'the sibling was resumed exactly once (one campaign, +1 term)');
    assert.equal(victim.partition.isLeader && sibling.partition.isLeader,
      true, 'both partitions observe the leadership their ports report');
  });
});
