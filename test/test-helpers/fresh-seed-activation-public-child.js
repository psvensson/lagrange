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
import WebSocket from 'ws';
import {performance} from 'node:perf_hooks';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {setOriginalAllocationRightObserver} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {setNativeStatusObserver} from '../../src/raft/raft-rs-status-observation.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {BOOTSTRAP_API_ROUTE} from '../../src/bootstrap/bootstrap-api-constants.js';
import {createRightsSampler, everyRightTransferred, readIssuedDeclaration,
  readOwnerRights} from './original-allocation-durable-reader.js';

// R27: a solver probe never starts a seed.
refuseUnderProbe('a fresh seed runtime');
const [mode, directory, nodeId, portsJson, host] = process.argv.slice(2);
const ports = JSON.parse(portsJson);
// Periodic sampling is bounded to one sample per macrotask and interval.
// The committed transition observer below also samples each durable change,
// so a short SUBMITTED interval cannot disappear between macrotasks.
const MIN_SAMPLE_INTERVAL_MS = 1;
const ADMISSION_PROBE_INTERVAL_MS = 5;
const READY_BOUND_MS = 30000;
// A distinct loopback source cannot accidentally connect an ephemeral client
// to itself at the still-closed runtime listen port. The runtime's advertised
// and bound address remain the requested host.
const PROBE_CLIENT_ADDRESS = '127.0.0.2';
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
    membershipOwnerOutcome: error.membershipOwnerOutcome,
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
const tcpConnections = [];
const probeOutcomes = new Map();

function recordProbe(surface, outcome) {
  const key = `${surface}:${outcome}`;
  probeOutcomes.set(key, (probeOutcomes.get(key) || 0) + 1);
}

function recordAccepted(surface, port, before) {
  const after = everyRightTransferred(observe(sampleRights));
  // The accept happened between the two samples. after=false is a definite
  // violation; before=false/after=true is ambiguous and reported as such.
  admission.push({surface, port, afterReturn: returned, before, after,
    ambiguous: before === false && after === true});
}

function recordConnection(socket, surface, before) {
  const tuple = {localAddress: socket.localAddress, localPort: socket.localPort,
    remoteAddress: socket.remoteAddress, remotePort: socket.remotePort};
  const selfConnected = tuple.localAddress === tuple.remoteAddress &&
    tuple.localPort === tuple.remotePort;
  tcpConnections.push({...tuple, surface, selfConnected, before,
    after: everyRightTransferred(observe(sampleRights)), afterReturn: returned});
  return selfConnected;
}

function probeTcp(port, surface) {
  return new Promise((resolve) => {
    const before = everyRightTransferred(observe(sampleRights));
    const socket = net.connect({port, host, localAddress: PROBE_CLIENT_ADDRESS});
    socket.once('connect', () => {
      const selfConnected = recordConnection(socket, surface, before);
      // Linux can self-connect an ephemeral socket without any listener.
      // Keep that observation, but only a distinct TCP endpoint is a listener.
      if (!selfConnected) recordAccepted(surface, port, before);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error) => {
      recordProbe(surface, error.code || error.message);
      resolve(false);
    });
  });
}

function probeWebSocket() {
  return new Promise((resolve) => {
    const before = everyRightTransferred(observe(sampleRights));
    const port = ports.transportWebSocketPort;
    const socket = new WebSocket(`ws://${host}:${port}`, {
      localAddress: PROBE_CLIENT_ADDRESS, handshakeTimeout: READY_BOUND_MS,
      finishRequest(request) {
        request.once('socket', (connection) => connection.once('connect', () =>
          recordConnection(connection, 'transport-websocket-handshake', before)));
        request.end();
      },
    });
    socket.once('open', () => {
      recordAccepted('transport-websocket-handshake', port, before);
      socket.terminate();
      resolve(true);
    });
    socket.once('error', (error) => {
      recordProbe('transport-websocket-handshake', error.code || error.message);
      resolve(false);
    });
  });
}

function probeReady() {
  return new Promise((resolve) => {
    const before = everyRightTransferred(observe(sampleRights));
    const request = http.get({host, port: ports.restApiPort, localAddress: PROBE_CLIENT_ADDRESS,
      path: BOOTSTRAP_API_ROUTE.READYZ}, (response) => {
      response.resume();
      const served = response.statusCode === HTTP_OK;
      recordProbe('rest-readyz', response.statusCode);
      if (served) recordAccepted('rest-readyz', ports.restApiPort, before);
      resolve(served);
    });
    request.once('socket', (socket) => socket.once('connect', () =>
      recordConnection(socket, 'rest-readyz', before)));
    request.once('error', (error) => {
      recordProbe('rest-readyz', error.code || error.message);
      resolve(false);
    });
  });
}

let probing = true;
async function probeAdmission() {
  while (probing && !returned) {
    await probeTcp(ports.transportWebSocketPort, 'transport-websocket');
    await probeWebSocket();
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
const activated = new Set();
const nativeLeaders = new Map();
let observationSequence = 0;
let nativeEntryCount = 0;
setActualCoreEntryObserver((entry) => {
  nativeEntryCount += 1;
  const activates = entry.operation === 'campaign' || entry.operation === 'tick';
  if (entry.operation === 'create_node' || (activates && !activated.has(entry.groupId))) {
    if (activates) activated.add(entry.groupId);
    coreEntries.push({...entry, observationSequence: ++observationSequence, afterReturn: returned});
  }
});
setNativeStatusObserver((status) => {
  if (status.role === RAFT_ROLE.LEADER && !nativeLeaders.has(status.groupId)) {
    nativeLeaders.set(status.groupId, {groupId: status.groupId,
      replicaId: status.replicaIdentity, incarnation: status.lifecycleIncarnation,
      role: status.role, term: status.term, observationSequence: ++observationSequence,
      afterReturn: returned});
  }
});
// Q3 places the one writer. Sample its committed transition seam synchronously
// so a short SUBMITTED interval cannot disappear between macrotasks. The
// owner read at settle and after child exit remains the durable authority.
setOriginalAllocationRightObserver(() => observe(sampleRights));

// --- the supported startup path --------------------------------------------

let startupError = null;
let cleanupError = null;
let service = null;
let listeners = null;
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
      transport: {wsHost: host},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment: {NODE_ID: nodeId,
      REST_API_PORT: String(ports.restApiPort),
      ADMIN_WS_PORT: String(ports.adminWebSocketPort),
      TRANSPORT_WS_PORT: String(ports.transportWebSocketPort)},
  });
  returned = true;
  listeners = {rest: runtime.bootstrapAPI.getFastify().server.address(),
    transport: runtime.startupOwner.messageRouter.server.address()};
} catch (error) {
  startupError = errorRecord(error);
}
probing = false;
await admissionProbe;
const rightsAtSettle = durable.declaration === null ? null :
  observe(() => readOwnerRights(durable.declaration));

if (runtime !== null) {
  try {
    service = {ready: await readyAfterReturn(), transport: await probeWebSocket()};
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
setOriginalAllocationRightObserver(null);
setNativeStatusObserver(null);
closeDurable();

const report = {kind: 'fresh-seed-startup-settled', mode, pid: process.pid, directory,
  ports, host, returnedRuntime: runtime !== null, startupError, cleanupError, service,
  observation: {declaration: durable.declaration,
    rightSequences: durable.sampler?.sequences ?? {}, rightsAtSettle, admission, tcpConnections,
    probeOutcomes: Object.fromEntries(probeOutcomes), listeners,
    coreEntries, nativeEntryCount, nativeLeaders: [...nativeLeaders.values()], observerErrors,
    samplingCost: {samples: durable.samples, totalMs: durable.sampleMs}}};
// The parent records the real outcome before explicitly reaping this process.
process.once('message', (message) => {
  if (message !== 'exit-after-observation') throw new Error('unexpected parent command');
  process.exit(0);
});
await new Promise((resolve, reject) => {
  process.send(report, (error) => error ? reject(error) : resolve());
});
