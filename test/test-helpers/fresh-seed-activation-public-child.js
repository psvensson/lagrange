// Fresh-seed activation witness child (Quest fresh-seed-activation).
// Each invocation is a genuinely new process entering the supported public
// startup path, startLagrangeRuntime, which itself composes the production
// data-directory owner and prepares the original attempt. Nothing in the
// startup path is replaced. Observation is passive: the native core-entry
// observer seam, read-only reads of the durable lifecycle rows (a cached
// sampler as the hint, the store owner's reader as the authority), and
// bracketed public-port probes from outside the runtime.
import http from 'node:http';
import net from 'node:net';
import {performance} from 'node:perf_hooks';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {BOOTSTRAP_API_ROUTE} from '../../src/bootstrap/bootstrap-api-constants.js';
import {createRightsSampler, everyRightTransferred, readIssuedDeclaration,
  readOwnerRights} from './original-allocation-durable-reader.js';

// R27: a solver probe never starts a seed.
refuseUnderProbe('a fresh seed runtime');
const [mode, directory, nodeId, portsJson, host] = process.argv.slice(2);
const ports = JSON.parse(portsJson);
// Bounded sampling: at most one sample per macrotask and per interval. A
// SUBMITTED window shorter than the interval reads [UNUSED, TRANSFERRED] and
// fails the witness (a false red, never a false green).
const MIN_SAMPLE_INTERVAL_MS = 1;
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

// --- durable original rights ----------------------------------------------

const durable = {declaration: null, sampler: null, closed: false,
  samples: 0, sampleMs: 0, lastSampleAt: -Infinity};

function sampleRights() {
  if (durable.closed) return null;
  if (durable.sampler === null) {
    durable.declaration = readIssuedDeclaration(directory);
    if (durable.declaration === null) return null;
    durable.sampler = createRightsSampler(durable.declaration);
  }
  const started = performance.now();
  const snapshot = durable.sampler.sample();
  durable.samples += 1;
  durable.sampleMs += performance.now() - started;
  durable.lastSampleAt = started;
  return snapshot;
}

let polling = true;
function pollRights() {
  if (!polling) return;
  if (performance.now() - durable.lastSampleAt >= MIN_SAMPLE_INTERVAL_MS) {
    observe(sampleRights);
  }
  setImmediate(pollRights);
}

function closeDurable() {
  durable.closed = true;
  if (durable.sampler !== null) observe(() => durable.sampler.close());
}

// --- public admission, bracketed and observed from outside the runtime ----

// Whether startLagrangeRuntime has returned a runtime yet.
let returned = false;
const admission = [];

function recordAccepted(surface, port, before) {
  const after = everyRightTransferred(observe(sampleRights));
  // The accept happened between the two samples. after=false is a definite
  // violation; before=false/after=true is ambiguous and reported as such.
  admission.push({surface, port, afterReturn: returned, before, after,
    ambiguous: before === false && after === true});
}

function probeTcp(port, surface) {
  return new Promise((resolve) => {
    const before = everyRightTransferred(observe(sampleRights));
    const socket = net.connect({port, host});
    socket.once('connect', () => {
      recordAccepted(surface, port, before);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function probeReady() {
  return new Promise((resolve) => {
    const before = everyRightTransferred(observe(sampleRights));
    const request = http.get({host, port: ports.restApiPort,
      path: BOOTSTRAP_API_ROUTE.READYZ}, (response) => {
      response.resume();
      const served = response.statusCode === HTTP_OK;
      if (served) recordAccepted('rest-readyz', ports.restApiPort, before);
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
pollRights();
const admissionProbe = probeAdmission();
let runtime = null;
try {
  runtime = await startLagrangeRuntime({
    cliArgs: {dataDir: directory},
    configuration: {
      node: {id: nodeId, address: `${host}:${ports.restApiPort}`,
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
const rightsAtSettle = durable.declaration === null ? null :
  observe(() => readOwnerRights(durable.declaration));

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
  ports, host, returnedRuntime: runtime !== null, startupError, cleanupError, service,
  observation: {declaration: durable.declaration,
    rightSequences: durable.sampler?.sequences ?? {}, rightsAtSettle, admission,
    coreEntries, observerErrors,
    samplingCost: {samples: durable.samples, totalMs: durable.sampleMs}}};
// The parent records the real outcome before explicitly reaping this process.
process.once('message', (message) => {
  if (message !== 'exit-after-observation') throw new Error('unexpected parent command');
  process.exit(0);
});
await new Promise((resolve, reject) => {
  process.send(report, (error) => error ? reject(error) : resolve());
});
