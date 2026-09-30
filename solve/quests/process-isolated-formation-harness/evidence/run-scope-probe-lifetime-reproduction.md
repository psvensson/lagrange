# Process formation run-scope probe lifetime reproduction

Run from `/mnt/data/peter/projects/lagrange-process-isolated-formation-harness`:

```sh
node --input-type=module <<'NODE'
import {EventEmitter} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createLocalProcessCluster} from './examples/service-data-affinity/cluster-harness.js';

const dataRoot = await mkdtemp(join(tmpdir(), 'formation-probe-owner-audit-'));
const child = new EventEmitter();
child.stdout = new PassThrough();
child.stderr = new PassThrough();
child.exitCode = null;
child.signalCode = null;
child.pid = 4242;
child.kill = (signal) => {
  child.signalCode = signal;
  child.stdout.end();
  child.stderr.end();
  queueMicrotask(() => {
    child.emit('exit', null, signal);
    child.emit('close', null, signal);
  });
  return true;
};
const cluster = createLocalProcessCluster({
  dataRoot,
  spawn: () => child,
  createLogStream: () => new Writable({
    write(_chunk, _encoding, done) { done(); },
  }),
});
const node = await cluster.startNode({
  index: 0,
  nodeId: '550e8400-e29b-41d4-a716-446655440799',
  dataDir: join(dataRoot, 'node-0'),
  restPort: 19980,
  adminPort: 19981,
  transportPort: 19982,
  seedAddresses: [],
}, {deadlineMs: Date.now() + 1000});
const releaseCleanup = Promise.withResolvers();
let cleanupStarted = false;
let probeSettled = false;
const waitOutcome = await cluster.waitFor(node, ({signal}) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', async () => {
      cleanupStarted = true;
      await releaseCleanup.promise;
      probeSettled = true;
      reject(signal.reason);
    }, {once: true});
  }), {deadlineMs: Date.now() + 15, pollIntervalMs: 1}
).catch((error) => error);
const stopOutcome = await cluster.stop().then(
  () => 'fulfilled', () => 'rejected');
console.log(JSON.stringify({
  waitCode: waitOutcome.code,
  cleanupStarted,
  probeSettledWhenScenarioOwnersStopped: probeSettled,
  stopOutcome,
}));
releaseCleanup.resolve();
await nextTurn();
await rm(dataRoot, {recursive: true, force: true});
NODE
```

Observed output:

```json
{"waitCode":"LOCAL_PROCESS_CLUSTER_WAIT_TIMEOUT","cleanupStarted":true,"probeSettledWhenScenarioOwnersStopped":false,"stopOutcome":"fulfilled"}
```

This distinguishes requested cancellation from observed probe cleanup: the
cluster stop fulfilled while the already-started probe cleanup remained
unresolved.
