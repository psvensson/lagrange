// Each invocation is a genuinely new process and uses public runtime acquisition.
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {createRetainedSeedPublicObserver} from './retained-seed-public-observer.js';

const [mode, directory, nodeId, portsJson] = process.argv.slice(2);
const ports = JSON.parse(portsJson);
const observer = createRetainedSeedPublicObserver({expire: mode === 'initial'});
let startupError = null;
let cleanupError = null;
let returnedRuntime = false;

try {
  const runtime = await startLagrangeRuntime({
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
  returnedRuntime = true;
  // Unexpected public success still closes through its actual acquired owner.
  try {
    await runtime.shutdownRuntime();
  } catch (error) {
    cleanupError = observer.errorRecord(error);
  }
} catch (error) {
  startupError = observer.errorRecord(error);
} finally {
  observer.restore();
}

const observation = observer.snapshot();
const report = {kind: 'public-startup-settled', mode, pid: process.pid,
  directory, ports, returnedRuntime, startupError, cleanupError, observation};
// The parent records the real startup/cleanup outcome before explicitly reaping
// this process. Process termination is teardown, never proof cleanup succeeded.
process.once('message', (message) => {
  if (message !== 'exit-after-observation') throw new Error('unexpected parent command');
  process.exit(0);
});
await new Promise((resolve, reject) => {
  process.send(report, (error) => error ? reject(error) : resolve());
});
