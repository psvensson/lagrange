// Fresh-seed activation witness child (Quest fresh-seed-activation).
// Each invocation is a genuinely new process entering the supported public
// startup path, startLagrangeRuntime, which itself composes the production
// data-directory owner and prepares the original attempt. Nothing in the
// startup path is replaced. Observation is passive: the native core-entry
// observer seam, read-only reads of the durable lifecycle rows through the
// allocation store owner, and public-port probes from outside the runtime.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import Database from 'better-sqlite3';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {BOOTSTRAP_API_ROUTE} from '../../src/bootstrap/bootstrap-api-constants.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_COLUMN as COLUMN,
  REPLICA_LIFECYCLE_TABLE} from '../../src/raft/raft-rs-original-allocation-constants.js';

// R27: a solver probe never starts a seed.
refuseUnderProbe('a fresh seed runtime');
const [mode, directory, nodeId, portsJson] = process.argv.slice(2);
const ports = JSON.parse(portsJson);
const RIGHT_COLUMNS = Object.freeze([COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT]);
const ADMISSION_PROBE_INTERVAL_MS = 5;
const READY_BOUND_MS = 30000;
const HTTP_OK = 200;
const APPLICATION_ID = 'fresh-seed-activation';
const SQL = Object.freeze({
  CREATE: 'CREATE TABLE fresh_seed_witness (id TEXT PRIMARY KEY, value TEXT)',
  INSERT: 'INSERT INTO fresh_seed_witness (id, value) VALUES (?, ?)',
  SELECT: 'SELECT id, value FROM fresh_seed_witness WHERE id = ?',
});

function errorRecord(error) {
  if (error === null || error === undefined) return null;
  return {name: error.name, message: error.message, code: error.code,
    reason: error.reason, errorCode: error.errorCode, stack: error.stack,
    cause: errorRecord(error.cause),
    errors: Array.isArray(error.errors) ? error.errors.map(errorRecord) : null};
}

const observerErrors = [];
function observe(work) {
  try {
    return work();
  } catch (error) {
    observerErrors.push(errorRecord(error));
    return null;
  }
}

// --- durable original rights, read through the allocation store owner ------

const durable = {declaration: null, handles: new Map(), sequences: {}, closed: false};

function readOnly(dbPath) {
  return new Database(dbPath, {readonly: true, fileMustExist: true});
}

function loadDeclaration() {
  const anchor = originalSeedAnchor(directory);
  if (!fs.existsSync(anchor.dbPath)) return null;
  const db = readOnly(anchor.dbPath);
  try {
    const present = db.prepare(`SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = ?`).get(REPLICA_LIFECYCLE_TABLE);
    if (present === undefined) return null;
    const row = db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND replica_identity = ?`).get(anchor.groupId, anchor.replicaId);
    // Only an ISSUED allocation is complete; a PREPARING one is still forming.
    if (row?.[COLUMN.ISSUE] !== STATE.ISSUED) return null;
    return JSON.parse(row[COLUMN.DECLARATION]);
  } finally {
    db.close();
  }
}

function sampleRights() {
  if (durable.closed) return null;
  if (durable.declaration === null) {
    durable.declaration = loadDeclaration();
    if (durable.declaration === null) return null;
  }
  const snapshot = {};
  for (const member of durable.declaration.members) {
    if (!durable.handles.has(member.replicaId)) {
      durable.handles.set(member.replicaId, readOnly(member.dbPath));
    }
    const row = originalAllocationRow(durable.handles.get(member.replicaId), member);
    for (const column of RIGHT_COLUMNS) {
      if (row[column] === null) continue;
      const key = `${member.replicaId}:${column}`;
      snapshot[key] = row[column];
      const sequence = durable.sequences[key] ??= [];
      if (sequence.at(-1) !== row[column]) sequence.push(row[column]);
    }
    snapshot[`${member.replicaId}:native_history_state`] = row.native_history_state;
  }
  return snapshot;
}

function allTransferred(snapshot) {
  if (snapshot === null) return false;
  return Object.entries(snapshot).every(([key, value]) =>
    key.endsWith(':native_history_state') || value === STATE.TRANSFERRED);
}

let polling = true;
function pollRights() {
  if (!polling) return;
  observe(sampleRights);
  setImmediate(pollRights);
}

function closeDurable() {
  durable.closed = true;
  for (const db of durable.handles.values()) observe(() => db.close());
  durable.handles.clear();
}

// --- public admission, observed from outside the runtime ------------------

// Whether startLagrangeRuntime has returned a runtime yet.
let returned = false;
const admission = [];
function probeTcp(port, surface) {
  return new Promise((resolve) => {
    const socket = net.connect({port, host: '127.0.0.1'});
    socket.once('connect', () => {
      // The durable rights at the instant a public listener accepted.
      const rights = observe(sampleRights);
      admission.push({surface, port, at: Date.now(), afterReturn: returned,
        rightsTransferred: allTransferred(rights)});
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function probeReady() {
  return new Promise((resolve) => {
    const request = http.get({host: '127.0.0.1', port: ports.restApiPort,
      path: BOOTSTRAP_API_ROUTE.READYZ}, (response) => {
      response.resume();
      const served = response.statusCode === HTTP_OK;
      if (served) {
        const rights = observe(sampleRights);
        admission.push({surface: 'rest-readyz', port: ports.restApiPort, at: Date.now(),
          afterReturn: returned, rightsTransferred: allTransferred(rights)});
      }
      resolve(served);
    });
    request.once('error', () => resolve(false));
  });
}

let probing = true;
async function probeAdmission() {
  while (probing && !returned) {
    await probeTcp(ports.transportWebSocketPort, 'transport-websocket');
    await probeReady();
    await new Promise((resolve) => setTimeout(resolve, ADMISSION_PROBE_INTERVAL_MS));
  }
}

async function readyAfterReturn() {
  const deadline = Date.now() + READY_BOUND_MS;
  while (Date.now() < deadline) {
    if (await probeReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, ADMISSION_PROBE_INTERVAL_MS));
  }
  return false;
}

// --- native activation, observed through the core-entry seam --------------

const coreEntries = [];
setActualCoreEntryObserver((entry) => coreEntries.push({...entry, afterReturn: returned}));

// --- the supported startup path --------------------------------------------

let startupError = null;
let cleanupError = null;
let service = null;
const startedAt = Date.now();
pollRights();
const admissionProbe = probeAdmission();
let runtime = null;
try {
  runtime = await startLagrangeRuntime({
    cliArgs: {dataDir: directory},
    configuration: {
      node: {id: nodeId, address: `localhost:${ports.restApiPort}`,
        restApiPort: ports.restApiPort, wsPort: ports.transportWebSocketPort},
      admin: {websocketPort: ports.adminWebSocketPort},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment: {NODE_ID: nodeId,
      REST_API_PORT: String(ports.restApiPort),
      ADMIN_WS_PORT: String(ports.adminWebSocketPort),
      TRANSPORT_WS_PORT: String(ports.transportWebSocketPort)},
  });
  returned = true;
} catch (error) {
  startupError = errorRecord(error);
}
probing = false;
await admissionProbe;
const rightsAtSettle = observe(sampleRights);

if (runtime !== null) {
  try {
    service = {ready: await readyAfterReturn()};
    const db = runtime.openApplicationDatabase({applicationId: APPLICATION_ID});
    if (mode === 'initial') {
      await db.query(SQL.CREATE);
      service.write = await db.query(SQL.INSERT, ['row-1', 'written-before-restart']);
    }
    service.read = await db.query(SQL.SELECT, ['row-1']);
  } catch (error) {
    service = {...service, error: errorRecord(error)};
  }
  try {
    await runtime.shutdownRuntime();
  } catch (error) {
    cleanupError = errorRecord(error);
  }
}
polling = false;
setActualCoreEntryObserver(null);
closeDurable();

const report = {kind: 'fresh-seed-startup-settled', mode, pid: process.pid, directory,
  ports, startedAt, returnedRuntime: runtime !== null, startupError, cleanupError,
  service, observation: {declaration: durable.declaration, rightSequences: durable.sequences,
    rightsAtSettle, admission, coreEntries, observerErrors}};
// The parent records the real outcome before explicitly reaping this process.
process.once('message', (message) => {
  if (message !== 'exit-after-observation') throw new Error('unexpected parent command');
  process.exit(0);
});
await new Promise((resolve, reject) => {
  process.send(report, (error) => error ? reject(error) : resolve());
});
