// A contained programming error is named in the partition's log (quest
// raft-rs-single-path-partition-cutover, F-an after verification round 6).
//
// The port contains a throw its runtime did not type - here the caller's
// own leader listener throwing inside the announcement of a reconstruction's
// resumption - as the group's typed host failure of phase unexpected-throw,
// and neither the port nor the runtime owner logs. The partition, which
// observes its group's leadership, names such a hold once at error level
// with the error's message, the group, the replica and the attempts so far,
// however many reconstructions throw again inside it; and once at info when
// the group serves again. Nothing is logged per deferred operation.
//
// The verifier's r6-listener shape on a production PartitionService with a
// real SQLite host failure first (a write whose application meets a full
// database), so the throw happens where it does in production: inside the
// resumption that reconstruction announces. Every expectation is the
// port's (readStatus), the log the partition wrote (its logger, recorded,
// its lines told apart by the level and the runtime's phase they name), and
// the tuning owner's retry window.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_PHASE} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {recoveryRetryWindowMsOf} from
  '../../src/raft/raft-rs-runtime-tuning.js';

const TEMP_PREFIX = 'partition-consensus-hold-log-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'hold_log_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const TEST_TIMEOUT_MS = 30000;
const WINDOW_MARGIN_MS = 80;
// Windows the throwing listener is left in place: each lets the port's own
// scheduled ticks reconstruct the group once more.
const HELD_WINDOWS = 3;
const LISTENER_FAILURE = 'the leader listener cannot handle leadership';
const LOG_LEVELS = Object.freeze(
  ['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
// The injection: every row the partition writes copies this many 4 KiB
// blobs, and the database may grow by only a few pages, so the write's
// application fails in the host environment (SQLITE_FULL).
const AMPLIFIER_ROWS = 400;
const PAGE_HEADROOM = 12;
const UNLIMITED_PAGES = 1073741823;

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'hold-log-node'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

// Every line the partition logs, recorded as it passes to its logger.
function recordLog(service) {
  const entries = [];
  const base = service.logger;
  const recorder = {};
  for (const level of LOG_LEVELS) {
    recorder[level] = (message, payload) => {
      entries.push({level, message, payload});
      base[level]?.(message, payload);
    };
  }
  service.logger = recorder;
  return entries;
}

// A write whose application copies the amplifier's blobs into a database
// that may barely grow: the application fails in the host environment.
function fillOnNextWrite(service) {
  service.db.exec('CREATE TABLE hold_log_amplifier_source ' +
    '(k INTEGER PRIMARY KEY, b BLOB)');
  const fill = service.db.prepare(
    'INSERT INTO hold_log_amplifier_source (b) VALUES (zeroblob(4000))');
  for (let row = 0; row < AMPLIFIER_ROWS; row += 1) {
    fill.run();
  }
  service.db.exec('CREATE TABLE hold_log_amplifier_sink (k INTEGER, b BLOB)');
  service.db.exec('CREATE TRIGGER hold_log_amplifier AFTER INSERT ON ' +
    `${TABLE_NAME} BEGIN INSERT INTO hold_log_amplifier_sink ` +
    'SELECT k, b FROM hold_log_amplifier_source; END');
  service.db.pragma('wal_checkpoint(TRUNCATE)');
  service.db.pragma(`max_page_count = ${
    service.db.pragma('page_count', {simple: true}) + PAGE_HEADROOM}`);
  return () => {
    service.db.pragma(`max_page_count = ${UNLIMITED_PAGES}`);
    service.db.exec('DROP TRIGGER hold_log_amplifier');
  };
}

test('F-an: a hold on a contained unexpected throw is named once at error ' +
  'level with its message, however often it throws again, and its end ' +
  'once at info', {timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const partitionId = 'fan-hold-log';
  const service = new PartitionService({
    partitionId,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'hold-log-node',
    dbPath: path.join(directory, DB_FILE),
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  });
  const log = recordLog(service);
  const namingHold = (level) => log.filter((entry) => entry.level === level &&
    entry.payload?.phase === RUNTIME_PHASE.UNEXPECTED_THROW);
  try {
    await service.initialize();
    assert.equal((await insert(service, 'row-0', 'setup', 'fan-setup'))
      .success, true, 'setup: the lone leader serves a write');
    const window = recoveryRetryWindowMsOf(service.raftTimingConfig);
    const unsubscribe = service.raft.subscribe(RAFT_EVENT.LEADER, () => {
      throw new Error(LISTENER_FAILURE);
    });
    const release = fillOnNextWrite(service);
    const failed = await insert(service, 'row-1', 'full', 'fan-full');
    release();
    assert.equal(failed.success, false, 'setup: the write met the full ' +
      `database (${JSON.stringify(failed)})`);

    await sleep(window * HELD_WINDOWS + WINDOW_MARGIN_MS);
    const held = service.raft.readStatus();
    assert.equal(held.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      `setup: the group is held (${JSON.stringify(held)})`);
    assert.equal(held.phase, RUNTIME_PHASE.UNEXPECTED_THROW,
      'setup: by the contained throw');
    assert.ok(held.attempts >= 2, 'setup: it threw again on more than one ' +
      `reconstruction (${held.attempts} attempts)`);
    const naming = log.filter((entry) =>
      JSON.stringify(entry.payload ?? {}).includes(LISTENER_FAILURE));
    const named = namingHold('error').filter((entry) =>
      entry.payload.reason === LISTENER_FAILURE);
    assert.equal(named.length, 1, 'exactly one error line names the phase ' +
      `and the message during the hold (${JSON.stringify(naming)})`);
    assert.equal(naming.length, 1, 'and no other line names it');
    assert.equal(typeof named[0].message, 'string',
      'it is a log line with its own message');
    assert.equal(named[0].payload.reason, LISTENER_FAILURE,
      'it carries the error\'s message');
    assert.equal(named[0].payload.groupId, held.groupId,
      'and the group');
    assert.equal(named[0].payload.replicaIdentity, held.replicaIdentity,
      'and the replica');
    assert.ok(Number.isInteger(named[0].payload.attempts) &&
      named[0].payload.attempts >= 1 &&
      named[0].payload.attempts <= held.attempts,
    'and the reconstructions it had cost when it was named');

    unsubscribe();
    await sleep(window + WINDOW_MARGIN_MS);
    assert.equal((await insert(service, 'row-2', 'healed', 'fan-healed'))
      .success, true, 'the group serves again once the listener no longer ' +
      'throws');
    assert.equal(service.raft.readStatus().role, RAFT_ROLE.LEADER,
      'the sole voter leads again');
    await nextTurn();
    const healed = namingHold('info');
    assert.equal(healed.length, 1, 'one info line names the end of the ' +
      `hold (${JSON.stringify(healed)})`);
    assert.equal(healed[0].payload.partitionId, partitionId,
      'it names the partition');
    assert.equal(namingHold('error').length, 1, 'the hold was named once');
  } finally {
    await service.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});
