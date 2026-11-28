// Copied into the fresh consumer directory by the npm packaging proof owner.
// Only the installed public facade and Node built-ins are available here.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {createEmbeddedLagrange} from 'lagrange-server';

const CONFIG_ARGUMENT = 2;
const PORT_COUNT = 3;
const LOOPBACK = '127.0.0.1';
const LOG_LEVEL = 'error';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440037';
const HOST_ID = 'npm-runtime-smoke-host';
const ERROR_EVENT = 'error';
const CLEANUP_FAILURE = 'cleanup failure';
const READYZ_PATH = '/readyz';
const HEALTH_PATH = '/health';
const CONNECTION_REFUSED_CODE = 'ECONNREFUSED';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const READINESS_POLL_MS = 250;
const HEALTH_IDENTITY_MISMATCH = 'foreground health did not identify the installed seed';
const SOCKET_NODE_MISMATCH = 'SQL socket must belong to the fresh foreground seed';
const SIGINT_NOT_DELIVERED = 'foreground CLI did not receive SIGINT';
const LOG_SQL_SUBMITTING = 'Installed foreground SQL submitting';
const LOG_SQL_RESULT = 'Installed foreground SQL result';
const LOG_CLI_VERIFIED =
  'Installed foreground CLI verified CREATE/INSERT/SELECT and exited 0 after SIGINT';
const SQL_CREATE_TABLE = 'CREATE TABLE npm_smoke (id INTEGER PRIMARY KEY, value TEXT)';
const SQL_SELECT_ROW = 'SELECT id, value FROM npm_smoke WHERE id = 1';
const ADMIN_MESSAGE = Object.freeze({
  QUERY: 'query',
  ERROR: 'error',
  // The first frame the admin stream sends; it carries the serving node's id. The product
  // names this message type ADMIN_MESSAGE_TYPE.CACHE_DUMP (src/admin/admin-constants.js).
  INITIAL_STATE: 'cache_dump',
  QUERY_RESULT: 'query_result',
});
const DATA_DIR_PREFIX = 'single-node-data-';
const SINGLE_NODE_REPLICA_COUNT = '1';
const NODE_MODULES_DIR = 'node_modules';
const BIN_DIR = '.bin';
const LAGRANGE_BIN_NAME = 'lagrange';
const DATA_DIR_FLAG = '--data-dir';
const STDIO_INHERIT = 'inherit';
const CLOSE_EVENT = 'close';
const SIGNAL_INTERRUPT = 'SIGINT';
const SIGNAL_KILL = 'SIGKILL';
const config = JSON.parse(process.argv[CONFIG_ARGUMENT]);
const reservations = [];
let runtime;
let failure;

async function reservePort() {
  const server = createServer();
  reservations.push(server);
  await new Promise((resolve, reject) => {
    server.once(ERROR_EVENT, reject);
    server.listen(0, LOOPBACK, resolve);
  });
  return server.address().port;
}

async function releasePorts() {
  await Promise.all(reservations.map((server) => new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => error ? reject(error) : resolve());
  })));
}

async function freshListenerPorts() {
  const ports = [];
  try {
    for (let index = 0; index < PORT_COUNT; index += 1) ports.push(await reservePort());
    return ports;
  } finally {
    // Hold the whole distinct set until it is known, including on partial failure.
    await releasePorts();
  }
}

async function waitForCliReadiness(baseUrl, nodeId, signal) {
  for (;;) {
    let response;
    try {
      response = await fetch(baseUrl + READYZ_PATH, {signal});
    } catch (error) {
      if (error.cause?.code !== CONNECTION_REFUSED_CODE) throw error;
    }
    if (response) {
      const state = await response.json();
      if (response.status === HTTP_STATUS_OK && state.ready === true) {
        const health = await fetch(baseUrl + HEALTH_PATH, {signal});
        const identity = await health.json();
        if (!health.ok || identity.nodeId !== nodeId || identity.ready !== true) {
          throw new Error(HEALTH_IDENTITY_MISMATCH);
        }
        return;
      }
      if (response.status !== HTTP_STATUS_SERVICE_UNAVAILABLE || state.ready !== false) {
        throw new Error(`unexpected foreground readiness response: ${response.status}`);
      }
    }
    await delay(READINESS_POLL_MS, undefined, {signal});
  }
}

async function verifyForegroundSql(adminPort, nodeId) {
  const socket = new globalThis.WebSocket(`ws://${LOOPBACK}:${adminPort}/api/admin/stream`);
  const statements = [
    SQL_CREATE_TABLE,
    `INSERT INTO npm_smoke (id, value) VALUES (1, '${nodeId}')`,
    SQL_SELECT_ROW,
  ];
  let index = -1;
  let queryId;
  function submit() {
    queryId = randomUUID();
    console.log(LOG_SQL_SUBMITTING, statements[index]);
    socket.send(JSON.stringify({type: ADMIN_MESSAGE.QUERY, queryId, sql: statements[index]}));
  }
  try {
    await new Promise((resolve, reject) => {
      socket.onerror = (event) => reject(event.error ?? new Error(event.message));
      socket.onclose = (event) => reject(new Error(`SQL socket closed at statement ${index + 1}: ${event.code} ${event.reason}`));
      socket.onmessage = ({data}) => {
        try {
          const message = JSON.parse(data);
          if (message.type === ADMIN_MESSAGE.ERROR) throw new Error(JSON.stringify(message));
          if (index === -1 && message.type === ADMIN_MESSAGE.INITIAL_STATE) {
            assert.equal(message.nodeId, nodeId, SOCKET_NODE_MISMATCH);
            index++;
            submit();
          } else if (message.type === ADMIN_MESSAGE.QUERY_RESULT &&
              message.queryId === queryId && index >= 0) {
            console.log(LOG_SQL_RESULT, JSON.stringify(message));
            if (message.error || message.errorCode) throw new Error(JSON.stringify(message));
            if (index === 1) assert.equal(message.affectedRows, 1);
            if (index === 2) {
              assert.deepEqual(message.results, [{id: 1, value: nodeId}]);
              resolve();
            } else {
              index++;
              submit();
            }
          }
        } catch (error) {
          reject(error);
        }
      };
    });
  } finally {
    socket.close();
  }
}

async function verifyForegroundCli() {
  const dataDir = await mkdtemp(join(process.cwd(), DATA_DIR_PREFIX));
  const nodeId = randomUUID();
  const [rest, admin, transport] = await freshListenerPorts();
  const env = {...process.env, NODE_ID: nodeId, NODE_HOST_ID: HOST_ID,
    PARTITION_DEFAULT_REPLICA_COUNT: SINGLE_NODE_REPLICA_COUNT,
    REST_API_PORT: String(rest), ADMIN_WS_PORT: String(admin),
    TRANSPORT_WS_PORT: String(transport)};
  delete env.SEED_NODE_ADDRESS;
  // Inherit the smoke owner's process group, output budget and deadline.
  const child = spawn(join(process.cwd(), NODE_MODULES_DIR, BIN_DIR, LAGRANGE_BIN_NAME),
    [DATA_DIR_FLAG, dataDir], {env, stdio: STDIO_INHERIT});
  const stopProbe = new AbortController();
  const closed = once(child, CLOSE_EVENT);
  const earlyExit = closed.then(([code, signal]) => {
    throw new Error(`foreground CLI exited before completing public SQL: ${code} (${signal})`);
  });
  try {
    await Promise.race([earlyExit, waitForCliReadiness(
      `http://${LOOPBACK}:${rest}`, nodeId, stopProbe.signal)]);
    await Promise.race([earlyExit, verifyForegroundSql(admin, nodeId)]);
    if (!child.kill(SIGNAL_INTERRUPT)) throw new Error(SIGINT_NOT_DELIVERED);
    const [code, signal] = await closed;
    if (code !== 0 || signal !== null) {
      throw new Error(`foreground CLI did not shut down cleanly: ${code} (${signal})`);
    }
    console.log(LOG_CLI_VERIFIED);
  } finally {
    stopProbe.abort();
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      child.kill(SIGNAL_KILL);
      await closed;
    }
  }
}

try {
  const ports = await freshListenerPorts();
  runtime = createEmbeddedLagrange({configuration: {
    logging: {level: LOG_LEVEL, prettyPrint: false},
    node: {id: NODE_ID, hostId: HOST_ID, restApiPort: ports[0], wsPort: ports[2]},
    admin: {websocketPort: ports[1]},
    storage: {dataDir: config.dataDir},
    worker: {maxThreads: 2, minThreads: 2},
  }});
  await runtime.start();
  console.log(config.startedMarker);
} catch (error) {
  failure = error;
} finally {
  try {
    await releasePorts();
    await runtime?.stop();
    if (!failure) {
      await verifyForegroundCli();
      console.log(config.stoppedMarker);
    }
  } catch (error) {
    if (failure) console.error(CLEANUP_FAILURE, error);
    else failure = error;
  }
}
if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
