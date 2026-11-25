// Copied into the fresh consumer directory by the npm packaging proof owner.
// Only the installed public facade and Node built-ins are available here.
import {createServer} from 'node:net';
import {createEmbeddedLagrange} from 'lagrange-server';

const CONFIG_ARGUMENT = 2;
const PORT_COUNT = 3;
const LOOPBACK = '127.0.0.1';
const LOG_LEVEL = 'error';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440037';
const ERROR_EVENT = 'error';
const CLEANUP_FAILURE = 'cleanup failure';
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

try {
  const ports = [];
  for (let index = 0; index < PORT_COUNT; index += 1) ports.push(await reservePort());
  // All three reservations are held until the entire distinct set is known.
  await releasePorts();
  runtime = createEmbeddedLagrange({configuration: {
    logging: {level: LOG_LEVEL, prettyPrint: false},
    node: {id: NODE_ID, restApiPort: ports[0], wsPort: ports[2]},
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
    if (!failure) console.log(config.stoppedMarker);
  } catch (error) {
    if (failure) console.error(CLEANUP_FAILURE, error);
    else failure = error;
  }
}
if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
