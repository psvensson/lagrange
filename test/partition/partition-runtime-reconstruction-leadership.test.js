// A partition keeps serving after its host heals, without a process restart
// (quest raft-rs-single-path-partition-cutover, verification round 2: F-m,
// the narrow form of F9).
//
// An environmental SQLite failure (the disk is full) is a host failure: the
// entry is not consumed, the group is RECOVERY_REQUIRED, and the next
// operation reconstructs the shared rs-raft runtime from the durable record.
// The reconstructed core starts every group as a follower. A group that is
// its configuration's sole voter must campaign again - nothing else would
// make it leader, and a partition whose election is deferred (every seed
// system partition) has no tick to time out on - and every partition's
// leadership observation must follow the core, never stay at the leader it
// was before the failure.
//
// The failure is real, not stubbed: SQLite's own page limit
// (`max_page_count`) makes the application statement (through a trigger that
// amplifies it) or the store's log append fail with SQLITE_FULL. Healing is
// lifting the limit. Every observation is the port's (readStatus) or the
// durable record's on an independent read-only connection.

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
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';

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

function appliedIndexOf(dbPath, partitionId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return Number(
      RaftRsDurableStore.readAppliedIndexIn(independent, partitionId));
  } finally {
    independent.close();
  }
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

async function singleReplicaCase(partitionId, extraOptions) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dbPath = path.join(directory, DB_FILE);
  const partition = new PartitionService({
    ...tableOptions(),
    partitionId,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'reconstruction-node',
    dbPath,
    ...extraOptions,
  });
  try {
    await partition.initialize();
    partition.startElection();
    const setup = await insert(partition, 'row-0', 'setup', 'entry-setup');
    assert.equal(setup.success, true, 'setup: the lone leader serves a write');
    const generationBefore = partition.raft.readStatus().runtimeGeneration;
    const appliedBefore = appliedIndexOf(dbPath, partitionId);

    limitPagesForTheApplication(partition.db);
    const failed = await insert(partition, 'row-1', 'full', 'entry-full');
    assert.equal(failed.success, false,
      `the write is not acknowledged (${JSON.stringify(failed)})`);
    assert.ok(String(failed.error).startsWith(
      PARTITION_SERVICE_ERROR_MSG.COMMITTED_STATEMENT_ENVIRONMENT_FAILED),
    `the failure is the typed environmental outcome (${failed.error})`);
    assert.ok(String(failed.error).includes(SQLITE_FULL),
      'it carries the SQLite code the host raised');
    assert.equal(appliedIndexOf(dbPath, partitionId), appliedBefore,
      'the failed entry is not consumed');

    healApplicationLimit(partition.db);
    const next = await insert(partition, 'row-2', 'healed', 'entry-healed');
    const status = partition.raft.readStatus();
    assert.equal(next.success, true,
      'the next write after the host heals succeeds without a restart ' +
      `(${JSON.stringify(next)})`);
    assert.equal(status.role, RAFT_ROLE.LEADER,
      'the sole voter leads its group again');
    assert.equal(partition.isLeader, true,
      'the partition observes the leadership its port reports');
    assert.ok(status.runtimeGeneration > generationBefore,
      'the runtime was reconstructed in process (no restart)');
    assert.ok(appliedIndexOf(dbPath, partitionId) > appliedBefore,
      'the applied index advances');
    assert.deepEqual(rowIds(dbPath), ['row-0', 'row-1', 'row-2'],
      'the committed entry the host failed is applied once it heals, then ' +
      'the next write');
  } finally {
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

test('F-m: a lone leader whose election runs on its own clock serves the ' +
  'next write after an environmental failure heals', {timeout: TEST_TIMEOUT_MS},
async () => {
  await singleReplicaCase('fm-scheduled', {});
});

test('F-m: a lone leader with a deferred election (the seed\'s system ' +
  'partitions) serves the next write after an environmental failure heals',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await singleReplicaCase('fm-deferred', {deferElection: true});
});

test('F-m: a three-replica group whose leader fails to persist is not left ' +
  'leaderless, and every replica observes the leadership its port reports',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment({
    heartbeatIntervalMs: 20,
    electionTimeoutMinMs: 150,
    electionTimeoutMaxMs: 300,
  });
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
    // The next operation reconstructs the runtime; the reconstructed core
    // starts the old leader as a follower, and the partition must observe
    // that at once - not keep acting as leader until some later tick.
    const reconstructed = leader.raft.readStatus();
    assert.ok(reconstructed.runtimeGeneration > generationBefore,
      'reading the status reconstructed the runtime');
    assert.equal(leader.isLeader,
      reconstructed.role === RAFT_ROLE.LEADER,
      'the old leader\'s leadership observation follows its port right ' +
      `after the reconstruction (port role ${reconstructed.role})`);
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
    assert.ok(current.raft.readStatus().runtimeGeneration > generationBefore,
      'the runtime was reconstructed in process');
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
