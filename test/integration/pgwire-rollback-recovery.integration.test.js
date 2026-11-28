import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspect} from 'node:util';
import {test} from '../../src/test-helpers/tap.js';
import {
  managedSleep,
  reportOpenHandlesOnTeardown,
} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {witnessPgwireRollbackRecovery} from './helpers/pgwire-rollback-recovery.js';
import {openConsumerSession} from './helpers/public-binding-consumer.js';
import {
  enablePasswordPgwire,
  startSeamRuntime,
  stopPlacedPgwireReplicas,
  useSingleNodeReplicaShape,
} from './helpers/public-binding-seam-harness.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';

const TEST_TIMEOUT_MS = 300_000;
const WAIT_MS = scaleByMachineFactor(60_000);
const POLL_MS = 100;
const ports = createPortAllocator(import.meta.url);
const PROBE_GUARD_SUBJECT = 'pgwire-rollback-recovery starts an embedded runtime';
const TEMPORARY_PREFIX = 'lagrange-pgwire-rollback-';
const APPLICATION_ID = 'pgwire-rollback-recovery';
const NODE_ID = 'pgwire-rollback-recovery-node';
const CREDENTIALS = Object.freeze({
  database: 'pgwire_tags',
  password: 'pgwire-tags-password',
  user: 'pgwire_tags_app',
});
async function startRuntime(t, mark) {
  const root = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  t.teardown(() => rm(root, {force: true, recursive: true}));
  const {restApiPort: restPort} = ports.getListenerPorts();
  const pgwirePort = ports.getPort();
  mark('embedded startup');
  const runtime = await startSeamRuntime({
    credentials: CREDENTIALS,
    dataDir: path.join(root, 'node-data'),
    nodeId: NODE_ID,
    restPort,
  });
  mark('open application database');
  const db = runtime.handle.openApplicationDatabase({
    applicationId: APPLICATION_ID,
  });
  let endpoint = null;
  t.teardown(async () => {
    if (endpoint) await stopPlacedPgwireReplicas(runtime, db);
    await runtime.handle.stop();
    runtime.restoreEnvironment();
  });
  const wait = () => ({
    deadlineMs: Date.now() + WAIT_MS,
    pause: () => managedSleep(t, POLL_MS),
  });
  mark('enable PG-wire listener');
  endpoint = await enablePasswordPgwire(db, pgwirePort, {...wait(), restPort});
  t.comment(`listener desired state: ${JSON.stringify(endpoint.desiredStateResult)}`);
  useSingleNodeReplicaShape(runtime.engine);
  mark('authenticate client');
  const client = await openConsumerSession({...endpoint, ...CREDENTIALS});
  t.teardown(() => client.end());
  return {client, db, endpoint, engine: runtime.engine,
    partitionServices: runtime.partitionServices};
}

function errorFields(error) {
  return {name: error?.name, code: error?.code, message: error?.message,
    errorCode: error?.errorCode, detail: error?.detail};
}

function causeFields(error) {
  return {causeCode: error?.cause?.code, causeMessage: error?.cause?.message,
    response: error?.response ?? error?.details ?? error};
}

function witnessFailure(error, phase, evidence) {
  // TAP annotates exceptions. Product errors may be frozen, so preserve
  // the typed observation on a fresh, extensible test failure.
  const failure = new Error('PG-wire rollback witness failed during ' + phase);
  failure.phase = phase;
  const observed = {...errorFields(error), ...causeFields(error), ...evidence};
  failure.observed = inspect(observed, {depth: 3, maxStringLength: 320, maxArrayLength: 16,
    customInspect: false, getters: false}).slice(0, 4096);
  return failure;
}

test('failed participant rollback recovers on the same live PG-wire session',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    refuseUnderProbe(PROBE_GUARD_SUBJECT);
    reportOpenHandlesOnTeardown(t);
    let phase = 'setup';
    const evidence = {};
    const mark = (name) => {
      phase = name;
    };
    try {
      const runtime = await startRuntime(t, mark);
      mark('create witness tables');
      await witnessPgwireRollbackRecovery(runtime, mark, evidence);
    } catch (error) {
      const failure = witnessFailure(error, phase, evidence);
      t.comment(failure.observed);
      throw failure;
    }
    t.end();
  });
