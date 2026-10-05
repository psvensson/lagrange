// The production write surface the unknown-outcome witnesses drive: lone
// rs-raft leaders (one per table) or a three-replica group behind the real
// SQLQueryEngine, QueryExecutor, distributed write coordinator and the
// control-plane gateway; a runtime replacement is the runtime owner's
// setCoreFaultInjector trap on a group's light-Ready advance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {setCoreFaultInjector} from
  '../../src/raft/raft-rs-runtime-owner.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {CONTROL_PLANE_PHASE_SCOPE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';

const TEMP_PREFIX = 'unknown-outcome-surface-';
const NODE_ID = 'uo-node';
const EXECUTOR_RETRY_DELAY_MS = 5;
// The executor budget of a delivery the trap outlasts.
const SPENT_BUDGET_MS = 600;
const SETTLE_BUDGET_MS = 8000;
const POLL_MS = 10;
const ADVANCE_APPEND = 'advance_append';
const TRAP_MESSAGE = 'unreachable';
const JOINER_ID = 'uo-joiner';
const USER_TABLE = 'uo_rows';
const COUNTER_TABLE = 'uo_counters';
const SURFACE_INSERT = `INSERT INTO ${USER_TABLE} (node_id, value) ` +
  'VALUES (?, ?)';
const ACTIVE_PARTITION_VERSION = 1;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const GROUP_BUDGET_MS = 10000;
const JOIN_WRITE_OPTIONS = Object.freeze({
  deliveryPriority: 'critical',
  phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN,
  skipCacheWait: true,
});

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, budgetMs = SETTLE_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

// Every row a query reads, as an independent reader sees it.
function selectRows(dbPath, sql, params = []) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(sql).all(...params);
  } finally {
    independent.close();
  }
}

function rowsOf(dbPath, table, keyColumn) {
  return selectRows(dbPath, `SELECT ${keyColumn} AS k FROM ${table}`)
    .map((row) => row.k);
}

// The partition schema of a table: a witness table's own columns, or a
// system table's real columns and key.
function partitionSchemaOf(table) {
  if (table === USER_TABLE) {
    return {columns: [
      {name: 'node_id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]};
  }
  if (table === COUNTER_TABLE) {
    return {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'n', type: 'INTEGER'},
    ]};
  }
  return {columns: getSchemaByTableName(table).columns.map(
    ({name, type, primaryKey}) => ({name, type, primaryKey: primaryKey === true}))};
}

function keyOf(table) {
  return partitionSchemaOf(table).columns.find((column) => column.primaryKey)
    .name;
}

// A trap of the shared core on `groupId`'s light-Ready advance (after the
// write's entry is durable, before it commits), as a trapped WASM instance
// throws: `once` traps the next one; otherwise every one until released.
let activeTrap = null;

function trapCore(groupId, {once}) {
  const trap = {count: 0, armed: true};
  activeTrap = trap;
  setCoreFaultInjector((stepGroupId, operation) => {
    if (trap.armed && stepGroupId === groupId &&
        operation === ADVANCE_APPEND) {
      trap.count += 1;
      if (once) {
        trap.armed = false;
        setCoreFaultInjector(null);
      }
      throw new globalThis.WebAssembly.RuntimeError(TRAP_MESSAGE);
    }
  });
  trap.release = () => {
    trap.armed = false;
    setCoreFaultInjector(null);
  };
  return trap;
}

// The trap in force, once it has trapped, ends now (the runtime is replaced
// and recovers while the call that hit it goes on - e.g. before its owner's
// readback).
function releaseActiveTrap() {
  if (activeTrap?.count > 0) {
    activeTrap.release();
  }
}

async function withMutedConsoleError(body) {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await body();
  } finally {
    console.error = original;
  }
}

// The engine over a routing view of `tableRows`/`partitionRows`/
// `serviceRows`, delivering through `messageRouter`.
function buildSurfaceEngine({tableRows, partitionRows, serviceRows,
  messageRouter}) {
  const byType = {tables: tableRows, partitions: partitionRows,
    services: serviceRows};
  const engine = new SQLQueryEngine({
    nodeId: NODE_ID,
    systemCache: {
      get(type, key) {
        if (type === TABLES.TABLES) {
          return tableRows.find((row) => row.table_name === key);
        }
        if (type === TABLES.PARTITIONS) {
          return partitionRows.find((row) => row.partition_id === key) ||
            null;
        }
        return null;
      },
      filter: (type, predicate) => (byType[type] || []).filter(predicate),
      getAll: (type) => byType[type] || [],
    },
    messageRouter,
    cdcIntegrationService: {
      async upsertSystemTableRow() {
        return {success: true};
      },
    },
  });
  engine.persistDistributedWriteOperationRow = async () => ({success: true});
  engine.queryExecutor.leaderRetryDelayMs = EXECUTOR_RETRY_DELAY_MS;
  return engine;
}

async function startLoneLeader(directory, table) {
  const partitionId = `${table}-p1`;
  const replicaId = `${partitionId}-r1`;
  const address = `${NODE_ID}/partition/${replicaId}`;
  const dbPath = path.join(directory, `${partitionId}.sqlite`);
  const tableRow = {table_name: table, primaryKey: keyOf(table),
    active_partition_version: ACTIVE_PARTITION_VERSION};
  const partition = new PartitionService(withFoundingStamp({
    tableId: table, tableName: table, partitionId, replicaId,
    replicaIds: [replicaId], nodeId: NODE_ID, dbPath,
    systemTableCache: {get: (type, key) => (type === TABLES.TABLES &&
      key === table ? tableRow : null)},
    schema: partitionSchemaOf(table),
  }));
  await partition.initialize();
  partition.startElection();
  // Leading, as the core says and as the service's write path sees it.
  assert.equal(await waitFor(() => partition.raft.readStatus().role ===
    RAFT_ROLE.LEADER && partition.role === RAFT_ROLE.LEADER), true,
  `setup: ${partitionId} leads`);
  return {address, tableRow,
    surface: {partition, dbPath, partitionId, table},
    partitionRow: {partition_id: partitionId, table_name: table,
      leader_node_id: NODE_ID, partition_key_start: null,
      partition_key_end: null},
    serviceRow: {service_id: replicaId, service_type: 'partition',
      partition_id: partitionId, node_id: NODE_ID, raft_role: 'leader',
      address, status: 'active'}};
}

// Lone rs-raft leaders, one per table, behind the production engine and a
// router that delivers to each partition's remote-query handler; the
// control-plane gateway on that engine: its SQL path (as the joiner's), or
// with `{cdc: true}` the real CDC routed path every other writer takes.
async function withSurface(tables, body, {cdc = false} = {}) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const surfaces = new Map();
  const tableRows = [];
  const partitionRows = [];
  const serviceRows = [];
  const deliveries = [];
  let cdcIntegrationService = null;
  try {
    for (const table of tables) {
      const leader = await startLoneLeader(directory, table);
      surfaces.set(leader.address, leader.surface);
      tableRows.push(leader.tableRow);
      partitionRows.push(leader.partitionRow);
      serviceRows.push(leader.serviceRow);
    }
    const messageRouter = {
      async deliver(address, message) {
        const surface = surfaces.get(address);
        const answer = await surface.partition.handleRemoteQuery(message);
        deliveries.push({table: surface.table, entryId: message.entryId,
          answer});
        return answer;
      },
    };
    const engine = buildSurfaceEngine({tableRows, partitionRows,
      serviceRows, messageRouter});
    if (cdc) {
      cdcIntegrationService = new CDCIntegrationService({nodeId: NODE_ID,
        sqlQueryEngine: engine});
      cdcIntegrationService.initialize();
      cdcIntegrationService.retryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    }
    const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID,
      sqlQueryEngine: engine, messageRouter,
      ...(cdcIntegrationService ? {cdcIntegrationService} : {}),
    }).controlPlaneSystemTableGateway;
    const of = (table) => [...surfaces.values()].find((surface) =>
      surface.table === table);
    await body({engine, gateway, deliveries, of});
  } finally {
    setCoreFaultInjector(null);
    cdcIntegrationService?.shutdown?.();
    for (const {partition} of surfaces.values()) {
      // A group the trap left held is restored before its partition stops
      // (a group stopped while held keeps the shared core from electing the
      // next test's groups - recorded as a runtime-owner finding).
      await waitFor(() => partition.raft.readStatus().role ===
        RAFT_ROLE.LEADER);
      await partition.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

// Wait until the partition applied a row with this key (the replaced
// runtime commits the trapped entry; reads drive the runtime).
async function appliedRow(surface, key) {
  return waitFor(() => {
    surface.partition.raft.readStatus();
    return rowsOf(surface.dbPath, surface.table, keyOf(surface.table))
      .includes(key);
  });
}

function nodeRow() {
  const now = Date.now();
  return {node_id: JOINER_ID, node_address: 'ws://uo-joiner:1',
    cpu_cores: 1, memory_mb: 1, disk_gb: 1, status: 'joining',
    connection_state: 'connected', last_heartbeat: now,
    latency_assignment_state: 'unassigned', created_at: now};
}

// The budget-spent shape (the lab chain): the trap outlasts the executor's
// budget, so the attempt ends unknown; the entry commits once it is gone.
async function spendFirstAttempt({engine, surface, attempt}) {
  engine.queryExecutor.queryTimeoutMs = SPENT_BUDGET_MS;
  const warnings = [];
  const logger = engine.queryExecutor.logger;
  engine.queryExecutor.logger = {...logger,
    warn: (message, context) => warnings.push({message, context}),
    debug: () => undefined, info: () => undefined, error: () => undefined};
  const trap = trapCore(surface.partitionId, {once: false});
  let first;
  try {
    first = await withMutedConsoleError(attempt);
  } finally {
    trap.release();
    engine.queryExecutor.logger = logger;
  }
  return {first, trap, warnings};
}

// One budget spent unknown inside a longer call: the trap lasts until the
// executor reports the wait it spent on the first unknown outcome, then the
// replaced runtime commits the entry while the call goes on (its owner's
// readback, its retry loop).
async function spendOneBudget({engine, surface, attempt}) {
  engine.queryExecutor.queryTimeoutMs = SPENT_BUDGET_MS;
  const trap = trapCore(surface.partitionId, {once: false});
  const logger = engine.queryExecutor.logger;
  engine.queryExecutor.logger = {...logger, debug: () => undefined,
    info: () => undefined, error: () => undefined,
    warn: (_message, context) => {
      if (context?.awaited !== undefined) {
        trap.release();
      }
    }};
  let result;
  try {
    result = await withMutedConsoleError(attempt);
  } finally {
    trap.release();
    engine.queryExecutor.logger = logger;
  }
  return {result, trap};
}

const READBACK_SETTLE_MS = 2000;
const RAFT_LOG_TABLE = '_raft_rs_log';
const BASE64 = 'base64';

// The log entries of a replica that carry `entryId`.
function logEntriesOf(dbFile, entryId) {
  return selectRows(dbFile, 'SELECT log_index, term, data FROM ' +
    `${RAFT_LOG_TABLE} ORDER BY log_index`).filter((row) => {
    const data = String(row.data ?? '');
    return data.includes(entryId) ||
      Buffer.from(data, BASE64).toString().includes(entryId);
  }).map((row) => ({logIndex: Number(row.log_index), term: Number(row.term)}));
}

// The last index of a replica's durable log.
function lastLogIndexOf(dbFile) {
  return Number(selectRows(dbFile, 'SELECT MAX(log_index) AS i FROM ' +
    RAFT_LOG_TABLE)[0]?.i ?? 0);
}


// The gateway's authoritative read answered by a lone leader: its applied
// rows once the runtime is driven and an entry in flight had its chance to
// commit (the readback an owner classifies an unknown with; the trap that
// cut the write, if it trapped, ends first).
function authoritativeLeaderReads(gateway, surface) {
  gateway.readAuthoritativeRows = async (_table, sql, params = []) => {
    releaseActiveTrap();
    await waitFor(() => {
      surface.partition.raft.readStatus();
      return selectRows(surface.dbPath, sql, params).length > 0;
    }, READBACK_SETTLE_MS);
    return {success: true, rows: selectRows(surface.dbPath, sql, params)};
  };
}

// A three-replica rs-raft group of `table` behind the production engine; the
// group's network drops the directed peer pairs in `blocked` ("p1>p3") and
// every Raft packet a predicate in `dropIf` matches.
async function withGroupSurface({partitionId, table, tempPrefix}, body) {
  quietEnvironment(GROUP_TIMING);
  const members = [[`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'], [`${partitionId}-r3`, 'node-3']];
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: tempPrefix || TEMP_PREFIX, budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {tableId: table, tableName: table,
      schema: partitionSchemaOf(table)}});
  const {services, dbFileOf, addressOf} = group;
  const network = services[0].transport;
  const deliver = network.deliver;
  const blocked = new Set();
  const dropIf = new Set();
  network.deliver = (address, envelope, ...rest) => {
    const packet = envelope?.payload ?? envelope;
    return blocked.has(`${packet?.from}>${packet?.to}`) ||
      [...dropIf].some((drop) => drop(packet)) ?
      Promise.resolve({acknowledged: true}) :
      deliver.call(network, address, envelope, ...rest);
  };
  try {
    const tableRow = {table_id: table, table_name: table,
      primaryKey: keyOf(table),
      active_partition_version: ACTIVE_PARTITION_VERSION};
    // Each replica validates the engine's epoch fence against its own
    // tables row.
    for (const service of services) {
      service.systemTableCache.applySystemTableChange(TABLES.TABLES,
        CDCOperation.INSERT, tableRow);
    }
    const sent = [];
    const interceptors = [];
    const messageRouter = {
      async deliver(address, message) {
        const index = members.findIndex((member) =>
          addressOf(member) === address);
        const entry = {address, index, entryId: message.entryId,
          answer: null};
        sent.push(entry);
        for (const intercept of interceptors) {
          const replaced = await intercept(entry, message);
          if (replaced !== undefined) {
            entry.answer = replaced;
            return replaced;
          }
        }
        entry.answer = await services[index].handleRemoteQuery(message);
        return entry.answer;
      },
    };
    const engine = buildSurfaceEngine({tableRows: [tableRow],
      partitionRows: [{partition_id: partitionId, table_name: table,
        leader_node_id: 'node-1', partition_key_start: null,
        partition_key_end: null}],
      serviceRows: members.map((member, index) => ({
        service_id: member[0], service_type: 'partition', partition_id:
          partitionId, node_id: member[1], address: addressOf(member),
        raft_role: index === 0 ? 'leader' : 'follower', status: 'active'})),
      messageRouter});
    const peers = services.map((service) =>
      String(service.raft.readStatus().peerId));
    const rowsEverywhere = (sql) => members.map((member) =>
      selectRows(dbFileOf(member), sql));
    await body({engine, services, members, peers, blocked, dropIf, sent,
      interceptors, dbFileOf, rowsEverywhere});
  } finally {
    network.deliver = deliver;
    await group.dispose();
    resetEnvironment();
  }
}

export {
  COUNTER_TABLE,
  EXECUTOR_RETRY_DELAY_MS,
  JOINER_ID,
  JOIN_WRITE_OPTIONS,
  NODE_ID,
  SETTLE_BUDGET_MS,
  SPENT_BUDGET_MS,
  SURFACE_INSERT,
  USER_TABLE,
  appliedRow,
  authoritativeLeaderReads,
  keyOf,
  lastLogIndexOf,
  logEntriesOf,
  nodeRow,
  partitionSchemaOf,
  releaseActiveTrap,
  quietEnvironment,
  resetEnvironment,
  rowsOf,
  selectRows,
  sleep,
  spendFirstAttempt,
  spendOneBudget,
  trapCore,
  waitFor,
  withGroupSurface,
  withMutedConsoleError,
  withSurface,
};
