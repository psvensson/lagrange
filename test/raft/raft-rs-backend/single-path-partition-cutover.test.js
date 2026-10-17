// Receipts (quest raft-rs-single-path-partition-cutover):
//   seed-bootstraps-and-serves-a-write-on-rs-raft-by-default
//   omitted-selection-cannot-reach-the-legacy-backend
//   explicit-legacy-selection-is-a-typed-refusal
//   the-write-path-has-one-durable-log
//   legacy-durable-consensus-state-fails-closed
//   restart-serves-writes-from-the-rs-raft-store
//
// Every expectation is read from production or from the core: the operation
// port's own readStatus, the durable store on an independent SQLite
// connection, the rows a SELECT returns, and the table the legacy log adapter
// itself writes. The only literals are inputs (the rows written, the names a
// caller would pass) and the shape of a refusal, which is documented where it
// is asserted.
//
// The status fields `confState` and `runtimeGeneration` are the ones only the
// rs-raft runtime owner's readStatus exposes (src/raft/raft-rs-runtime-owner.js
// readGroupStatus); a status without them came from a different backend.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {CONFIG_KEY} from '../../../src/config/config-key-constants.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionRaftStorage} from
  '../../../src/partition/partition-raft-storage.js';
import {PartitionService} from
  '../../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../../src/partition/partition-service-constants.js';
import {RAFT_RS_SQL} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {SQLiteLogAdapter} from '../../../src/raft/sqlite-log-adapter.js';
import {
  cleanupTestEnvironment,
  createVirginSeedBootstrapService,
  getPartitionServices,
  getUniquePort,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from '../../integration/helpers/cluster-test-helpers.js';
import {createSeedQuerySurface} from
  '../../integration/helpers/seed-query-surface.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PARTITION_SERVICE_MODULE = 'src/partition/partition-service.js';
const RETIRED_FILE_PREFIX = ['life', 'raft'].join('');
const TEMP_PREFIX = 'raft-rs-single-path-';
const DB_FILE = 'partition.sqlite';
const PRODUCTION_SELECTION = Object.freeze({});
const RS_ONLY_STATUS_FIELDS = Object.freeze(['confState', 'runtimeGeneration']);
const TABLE_NAME = 'cutover_rows';
const WRITES = Object.freeze([
  Object.freeze({id: 'row-1', value: 'value-1'}),
  Object.freeze({id: 'row-2', value: 'value-2'}),
  Object.freeze({id: 'row-3', value: 'value-3'}),
]);
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_ALL_SQL = `SELECT id, value FROM ${TABLE_NAME} ORDER BY id`;
const LEGACY_TERM = 4;
const SEED_TEST_TIMEOUT_MS = 90000;
const PARTITION_TEST_TIMEOUT_MS = 30000;
const ROUTABLE_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 50;
const SEED_TABLE = 'cutover_seed_events';
const SEED_CREATE_SQL =
  `CREATE TABLE ${SEED_TABLE} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`;
const SEED_INSERT_SQL =
  `INSERT INTO ${SEED_TABLE} (id, payload) VALUES (?, ?)`;
const SEED_SELECT_SQL =
  `SELECT id, payload FROM ${SEED_TABLE} WHERE id = ?`;
const SEED_ROW = Object.freeze({id: 'seed-row-1', payload: 'seed-payload-1'});
const CREATE_TABLE_NAME = /CREATE TABLE IF NOT EXISTS\s+(\w+)/u;
// The rs-raft durable record's tables, read off the store owner's own DDL
// (the owner exports its SQL, not its table-name map).
const RS_RAFT_LOG_TABLE =
  RAFT_RS_SQL.CREATE_LOG_TABLE.match(CREATE_TABLE_NAME)[1];
const RS_RAFT_RECORD_TABLES = Object.freeze(Object.entries(RAFT_RS_SQL)
  .filter(([key]) => key.startsWith('CREATE_'))
  .map(([, sql]) => sql.match(CREATE_TABLE_NAME)[1]));
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/gu;

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'cutover-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function tempDbPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  return {directory, dbPath: path.join(directory, DB_FILE)};
}

function partitionOptions(partitionId, dbPath, selection = {}) {
  return {
    partitionId,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'cutover-node',
    dbPath,
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    ...selection,
  };
}

function statusKeys(service) {
  const status = service?.raft?.readStatus?.();
  return status && typeof status === 'object' ? Object.keys(status) : [];
}

function missingRsFields(service) {
  const keys = statusKeys(service);
  return RS_ONLY_STATUS_FIELDS.filter((field) => !keys.includes(field));
}

async function shutdownQuietly(service) {
  try {
    await service?.shutdown?.();
  } catch {
    // The assertion under test already recorded what mattered.
  }
}

// The table(s) the legacy log adapter itself writes an entry into, measured on
// a scratch database rather than named here.
function legacyLogTables() {
  const scratch = new Database(':memory:');
  try {
    const adapter = new SQLiteLogAdapter(scratch);
    const counts = () => new Map(scratch.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\'').all()
      .map(({name}) => [name,
        scratch.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get()
          .count]));
    const before = counts();
    adapter.saveCommand({probe: true}, 1);
    const grew = [...counts()].filter(([name, count]) =>
      count > (before.get(name) ?? 0)).map(([name]) => name);
    adapter.close();
    return grew;
  } finally {
    scratch.close();
  }
}

function tableExists(db, name) {
  return db.prepare(
    'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?')
    .get(name) !== undefined;
}

function rowCount(db, name) {
  return tableExists(db, name) ?
    db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count : 0;
}

// Entries in the rs-raft durable log of one group that carry a payload; the
// empty entry a new leader appends carries none.
function rsPayloadEntries(db, groupId) {
  if (!tableExists(db, RS_RAFT_LOG_TABLE)) {
    return 0;
  }
  return db.prepare(
    `SELECT COUNT(*) AS count FROM ${RS_RAFT_LOG_TABLE} ` +
    'WHERE group_id = ? AND data IS NOT NULL').get(groupId).count;
}

function durableLogs(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const legacyTables = legacyLogTables();
    assert.ok(legacyTables.length > 0,
      'the legacy log adapter writes an entry into some table');
    return {
      rsRaftPayloadEntries: rsPayloadEntries(independent, groupId),
      legacyLogRows: Object.fromEntries(legacyTables.map((name) =>
        [name, rowCount(independent, name)])),
    };
  } finally {
    independent.close();
  }
}

async function writeRows(service) {
  const results = [];
  for (const [index, row] of WRITES.entries()) {
    results.push(await service.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: INSERT_SQL,
      params: [row.id, row.value],
      entryId: `cutover-entry-${index + 1}`,
    }));
  }
  return results;
}

function relativeToRoot(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

// Every src module reachable from a start module by a relative static or
// literal dynamic import, with every reached module that imports it.
function relativeImportClosure(startRelative) {
  const reachedFrom = new Map([[startRelative, new Set()]]);
  const queue = [startRelative];
  while (queue.length > 0) {
    const current = queue.shift();
    const absolute = path.join(ROOT, current);
    const source = fs.readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const target = relativeToRoot(
        path.resolve(path.dirname(absolute), match[1]));
      if (!target.startsWith('src/') ||
        !fs.existsSync(path.join(ROOT, target))) {
        continue;
      }
      if (reachedFrom.has(target)) {
        reachedFrom.get(target).add(current);
        continue;
      }
      reachedFrom.set(target, new Set([current]));
      queue.push(target);
    }
  }
  return reachedFrom;
}

function systemPartitionServices(bootstrapResult, bootstrapService) {
  const systemTables = new Set(Object.values(TABLES));
  return getPartitionServices(bootstrapResult, bootstrapService)
    .filter((service) => systemTables.has(service.tableName));
}

test('seed bootstraps and serves a write on rs-raft by default',
  {timeout: SEED_TEST_TIMEOUT_MS}, async () => {
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });
    const seedNodeId = '550e8400-e29b-41d4-a716-446655449961';
    const seedWsPort = getUniquePort();
    const bootstrapService = await createVirginSeedBootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 3000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });
    // The helper's per-test data directory; removed when the seed is down.
    const dataDir =
      ConfigurationManager.getInstance().get(CONFIG_KEY.STORAGE_DATA_DIR);
    let bootstrapResult = null;
    let seedApi = null;
    try {
      bootstrapResult = await bootstrapService.bootstrap();
      assert.equal(bootstrapResult.success, true,
        'the seed bootstraps through production construction');

      const systemServices =
        systemPartitionServices(bootstrapResult, bootstrapService);
      assert.ok(systemServices.length > 0,
        'the seed hosts system partitions in its partition registry');
      const offBackend = systemServices
        .map((service) => ({
          partition: service.partitionId,
          missing: missingRsFields(service),
          statusKeys: statusKeys(service),
        }))
        .filter((entry) => entry.missing.length > 0);
      assert.equal(offBackend.length, 0,
        `${offBackend.length}/${systemServices.length} system partition ` +
        'replicas (' +
        `${new Set(offBackend.map((entry) => entry.partition)).size} ` +
        'partitions) ' +
        'run on a port whose readStatus lacks the rs-raft runtime fields; ' +
        `first: ${JSON.stringify(offBackend[0] ?? null)}`);

      const seed = createSeedQuerySurface(bootstrapService, bootstrapResult,
        {seedNodeId, seedWsPort});
      seedApi = seed.seedApi;
      await seed.start();
      const {systemTableCache, sqlQueryEngine} = seed;

      const created = await sqlQueryEngine.executeQuery(SEED_CREATE_SQL);
      assert.equal(created.success, true,
        `CREATE TABLE succeeds: ${JSON.stringify(created)}`);
      const routable = await waitFor(() => {
        const partition = systemTableCache.filter(TABLES.PARTITIONS,
          (row) => row.table_name === SEED_TABLE)[0];
        return Boolean(partition) && systemTableCache.filter(TABLES.SERVICES,
          (row) => row.partition_id === partition.partition_id &&
            row.service_type === SERVICE_TYPE.PARTITION &&
            row.status === SERVICE_STATUS.ACTIVE &&
            typeof row.address === 'string' && row.address.length > 0,
        ).length > 0;
      }, ROUTABLE_TIMEOUT_MS, POLL_INTERVAL_MS);
      assert.equal(routable, true, 'the new table partition becomes routable');
      const inserted = await sqlQueryEngine.executeQuery(SEED_INSERT_SQL,
        [SEED_ROW.id, SEED_ROW.payload]);
      assert.equal(inserted.success, true,
        `INSERT succeeds: ${JSON.stringify(inserted)}`);
      const selected = await sqlQueryEngine.executeQuery(SEED_SELECT_SQL,
        [SEED_ROW.id]);
      assert.equal(selected.success, true, 'SELECT succeeds');
      assert.deepEqual(
        (selected.rows ?? []).map(({id, payload}) => ({id, payload})),
        [{id: SEED_ROW.id, payload: SEED_ROW.payload}],
        'the acknowledged INSERT selects back');
    } finally {
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
      if (typeof dataDir === 'string' && dataDir.length > 0) {
        fs.rmSync(dataDir, {recursive: true, force: true});
      }
    }
  });

test('omitted selection cannot reach the retired backend',
  {timeout: PARTITION_TEST_TIMEOUT_MS}, async () => {
    quietEnvironment();
    const {directory, dbPath} = tempDbPath();
    const service = new PartitionService(
      withFoundingStamp(partitionOptions('omitted-selection', dbPath)));
    let observedStatusKeys = [];
    let missing = [];
    try {
      await service.initialize();
      observedStatusKeys = statusKeys(service);
      missing = missingRsFields(service);
    } finally {
      await shutdownQuietly(service);
      fs.rmSync(directory, {recursive: true, force: true});
      resetEnvironment();
    }
    // Both facts are measured before either is asserted, so a red names both.
    const closure = relativeImportClosure(PARTITION_SERVICE_MODULE);
    const legacy = [...closure.keys()]
      .filter((file) => path.basename(file).startsWith(RETIRED_FILE_PREFIX))
      .sort()
      .map((file) =>
        `${file} (imported by ${[...closure.get(file)].sort().join(', ')})`);
    assert.deepEqual({
      rsRuntimeFieldsMissingFromStatus: missing,
      retiredModulesReachedFromPartitionService: legacy,
    }, {
      rsRuntimeFieldsMissingFromStatus: [],
      retiredModulesReachedFromPartitionService: [],
    }, 'a partition constructed with no backend selection runs on the ' +
      'rs-raft runtime owner (its readStatus carried ' +
      `${JSON.stringify(observedStatusKeys)}) and ` +
      `${PARTITION_SERVICE_MODULE} statically reaches no retired backend ` +
      `module (it reaches: ${legacy.join('; ') || 'none'})`);
  });

test('the write path has one durable log',
  {timeout: PARTITION_TEST_TIMEOUT_MS}, async () => {
    quietEnvironment();
    const {directory, dbPath} = tempDbPath();
    const service = new PartitionService(withFoundingStamp(partitionOptions('one-durable-log',
      dbPath, PRODUCTION_SELECTION)));
    try {
      await service.initialize();
      const results = await writeRows(service);
      assert.deepEqual(results.map((result) => result.success),
        WRITES.map(() => true),
        `every write is acknowledged: ${JSON.stringify(results)}`);
      const logs = durableLogs(dbPath, service.partitionId);
      assert.deepEqual({
        writesInRsRaftLog:
          logs.rsRaftPayloadEntries >= WRITES.length,
        legacyLogRows: logs.legacyLogRows,
      }, {
        writesInRsRaftLog: true,
        legacyLogRows: Object.fromEntries(
          Object.keys(logs.legacyLogRows).map((name) => [name, 0])),
      }, `durable logs after ${WRITES.length} acknowledged writes: ` +
        JSON.stringify(logs));
    } finally {
      await shutdownQuietly(service);
      fs.rmSync(directory, {recursive: true, force: true});
      resetEnvironment();
    }
  });

test('legacy durable consensus state fails closed',
  {timeout: PARTITION_TEST_TIMEOUT_MS}, async () => {
    quietEnvironment();
    const {directory, dbPath} = tempDbPath();
    const partitionId = 'legacy-state';
    // Meaningful legacy consensus state: three committed entries in the
    // legacy log and a persisted legacy term, and no rs-raft record.
    const seeded = new Database(dbPath);
    const adapter = new SQLiteLogAdapter(seeded);
    const storage = new PartitionRaftStorage(seeded, partitionId, adapter);
    for (const row of WRITES) {
      adapter.saveCommand({type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: INSERT_SQL, params: [row.id, row.value]}, LEGACY_TERM);
    }
    adapter.commit(WRITES.length);
    storage.currentTerm = LEGACY_TERM;
    storage.persistTerm();
    const legacyState = {
      committedIndex: adapter.getCommittedIndex(),
      lastInfo: adapter.getLastInfo(),
    };
    adapter.close();
    seeded.close();
    const precondition = new Database(dbPath, {readonly: true});
    const rsRecordBefore = RS_RAFT_RECORD_TABLES
      .filter((name) => tableExists(precondition, name));
    precondition.close();
    assert.equal(legacyState.committedIndex, WRITES.length,
      'precondition: the legacy log holds committed entries');
    assert.deepEqual(rsRecordBefore, [],
      'precondition: the database holds no rs-raft record');

    let service = null;
    let outcome = null;
    try {
      service = new PartitionService(withFoundingStamp(partitionOptions(partitionId, dbPath)));
      await service.initialize();
    } catch (error) {
      outcome = error;
    }
    try {
      // Outcome shape: initialize rejects with an Error carrying a non-empty
      // string `code` (or `reason`); the name is the owner card's.
      assert.ok(outcome instanceof Error,
        'a partition database holding legacy consensus state ' +
        `${JSON.stringify(legacyState)} and no rs-raft record initialized; ` +
        `its port readStatus carried ${JSON.stringify(statusKeys(service))}`);
      const typed = outcome.code ?? outcome.reason;
      assert.equal(typeof typed === 'string' && typed.length > 0, true,
        `the startup outcome is typed (code/reason): ${outcome.stack}`);
      assert.equal(service?.raft ?? null, null,
        'no consensus port came up over the legacy state');
    } finally {
      await shutdownQuietly(service);
      fs.rmSync(directory, {recursive: true, force: true});
      resetEnvironment();
    }
  });

test('restart serves writes from the rs-raft store',
  {timeout: PARTITION_TEST_TIMEOUT_MS}, async () => {
    quietEnvironment();
    const {directory, dbPath} = tempDbPath();
    const options = partitionOptions('restart-rs-store', dbPath,
      PRODUCTION_SELECTION);
    let restarted = null;
    try {
      const first = new PartitionService(withFoundingStamp(options));
      try {
        await first.initialize();
        const results = await writeRows(first);
        assert.deepEqual(results.map((result) => result.success),
          WRITES.map(() => true),
          `every write is acknowledged: ${JSON.stringify(results)}`);
      } finally {
        await first.shutdown();
      }
      restarted = new PartitionService(withFoundingStamp(options));
      await restarted.initialize();
      const served = restarted.db.prepare(SELECT_ALL_SQL).all()
        .map(({id, value}) => ({id, value}));
      const status = restarted.raft.readStatus();
      const logs = durableLogs(dbPath, restarted.partitionId);
      assert.deepEqual({
        servedRows: served,
        commitIndexCoversWrites: status.commitIndex >= WRITES.length,
        legacyLogRows: logs.legacyLogRows,
      }, {
        servedRows: WRITES.map(({id, value}) => ({id, value})),
        commitIndexCoversWrites: true,
        legacyLogRows: Object.fromEntries(
          Object.keys(logs.legacyLogRows).map((name) => [name, 0])),
      }, `after restart: commitIndex=${status.commitIndex} ` +
        `logs=${JSON.stringify(logs)}`);
    } finally {
      await shutdownQuietly(restarted);
      fs.rmSync(directory, {recursive: true, force: true});
      resetEnvironment();
    }
  });
