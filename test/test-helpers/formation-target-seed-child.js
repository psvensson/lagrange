// Declared formation size witness child (stage S1 of
// formation-admission-design-2026-11-11.md). Each invocation is a new process
// entering the supported public startup path, startLagrangeRuntime, as a seed
// (no SEED_NODE_ADDRESS). Modes:
//   undeclared  - fresh data, no declaration: expect the typed refusal.
//   declared    - fresh data, declared size: read the durable row through
//                 the read contract (cache and authoritative), the operator
//                 facts, and re-run the founding publication against the
//                 real writer with the same and with a different value.
//   restart     - the retained data again, with a different declaration.
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {CONTROL_PLANE_READ_STRATEGY as STRATEGY} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildFormationTargetRow, readDeclaredFormationSize} from
  '../../src/bootstrap/formation-target-record.js';
import {publishOriginalSeedFormationTarget} from
  '../../src/bootstrap/seed-original-registration.js';
import {FORMATION_TARGET_NODE_COUNT_ENV} from
  '../../src/config/formation-target-node-count.js';

refuseUnderProbe('a formation-target seed runtime');
const [mode, directory, nodeId, portsJson, declared] = process.argv.slice(2);
const ports = JSON.parse(portsJson);
const HOST = '127.0.0.1';

function errorRecord(error) {
  if (error === null || error === undefined) return null;
  return {name: error.name, message: error.message, code: error.code,
    reason: error.reason, variable: error.variable, detail: error.detail,
    cause: errorRecord(error.cause)};
}

async function settle(promise) {
  try {
    return {value: await promise, error: null};
  } catch (error) {
    return {value: null, error: errorRecord(error)};
  }
}

const environment = {NODE_ID: nodeId,
  REST_API_PORT: String(ports.restApiPort),
  ADMIN_WS_PORT: String(ports.adminWebSocketPort),
  TRANSPORT_WS_PORT: String(ports.transportWebSocketPort)};
if (declared !== 'none') environment[FORMATION_TARGET_NODE_COUNT_ENV] = declared;

let runtime = null;
let startupError = null;
try {
  runtime = await startLagrangeRuntime({
    cliArgs: {dataDir: directory},
    configuration: {
      node: {id: nodeId, address: `${HOST}:${ports.restApiPort}`,
        restApiPort: ports.restApiPort, wsPort: ports.transportWebSocketPort},
      admin: {websocketPort: ports.adminWebSocketPort},
      transport: {wsHost: HOST},
      partition: {defaultReplicaCount: 1},
      logging: {level: 'error'},
      storage: {dataDir: directory},
    },
    environment,
  });
} catch (error) {
  startupError = errorRecord(error);
}

const report = {kind: 'formation-target-seed-settled', mode, pid: process.pid,
  returnedRuntime: runtime !== null, startupError};
if (runtime !== null) {
  const bootstrap = runtime.startupOwner;
  const gateway = runtime.bootstrapAPI.getControlPlaneSystemTableGateway();
  const authoritative = () => readDeclaredFormationSize({
    readStrategy: STRATEGY.AUTHORITATIVE, gateway});
  report.cached = await readDeclaredFormationSize({readStrategy: STRATEGY.CACHE,
    systemTableCache: bootstrap.getSystemTableCache()});
  report.authoritative = await settle(authoritative());
  report.facts = runtime.bootstrapAPI.getManagementV1Owner().getClusterFacts().facts?.cluster;
  if (mode === 'declared') {
    const writer = bootstrap.systemTableWriter;
    const count = Number(declared);
    report.republishSame = await settle(publishOriginalSeedFormationTarget(writer,
      buildFormationTargetRow({count, nodeId, timestamp: Date.now()})));
    report.republishDifferent = await settle(publishOriginalSeedFormationTarget(writer,
      buildFormationTargetRow({count: count + 2, nodeId, timestamp: Date.now()})));
    report.authoritativeAfter = await settle(authoritative());
  }
  report.cleanupError = (await settle(runtime.shutdownRuntime())).error;
}
process.once('message', (message) => {
  if (message !== 'exit-after-observation') throw new Error('unexpected parent command');
  process.exit(0);
});
await new Promise((resolve, reject) => {
  process.send(report, (error) => error ? reject(error) : resolve());
});
