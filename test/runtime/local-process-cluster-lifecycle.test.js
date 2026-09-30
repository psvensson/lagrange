import {EventEmitter} from 'node:events';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {setImmediate as waitForTurn} from 'node:timers/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  LOCAL_PROCESS_DATA_DISPOSITION,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  LOCAL_PROCESS_RESTART_DECISION,
  createLocalProcessCluster,
} from '../../examples/service-data-affinity/cluster-harness.js';

const NODE_IDS = Object.freeze([
  '550e8400-e29b-41d4-a716-446655440720',
  '550e8400-e29b-41d4-a716-446655440721',
]);

function createFakeChild(options = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = options.pid || 1001;
  child.signals = [];
  let exited = false;
  let closed = false;
  child.exit = (exitCode = 0, signal = null) => {
    if (exited) return;
    exited = true;
    child.exitCode = exitCode;
    child.signalCode = signal;
    child.emit('exit', exitCode, signal);
  };
  child.close = (exitCode = 0, signal = null) => {
    if (closed) return;
    child.exit(exitCode, signal);
    closed = true;
    if (options.holdStreamsAfterClose !== true) {
      child.stdout.end();
      child.stderr.end();
    }
    queueMicrotask(() => child.emit('close', exitCode, signal));
  };
  child.kill = (signal) => {
    child.signals.push(signal);
    if (options.rejectSignals === true) return false;
    if (options.ignoreSigterm === true && signal === 'SIGTERM') return true;
    if (options.exitWithoutClose === true && signal === 'SIGKILL') {
      child.exit(null, signal);
      return true;
    }
    child.close(null, signal);
    return true;
  };
  return child;
}

function nodeSpec(dataRoot, overrides = {}) {
  return {
    index: 0,
    nodeId: NODE_IDS[0],
    dataDir: join(dataRoot, 'node-0'),
    restPort: 19080,
    adminPort: 19081,
    transportPort: 19082,
    seedAddresses: [],
    ...overrides,
  };
}

function startNode(cluster, spec, timeoutMs = 1000) {
  return cluster.startNode(spec, {deadlineMs: Date.now() + timeoutMs});
}

test('node observations cannot mutate lifecycle authority', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-observation-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const child = createFakeChild();
  const cluster = createLocalProcessCluster({dataRoot, spawn: () => child});
  const node = await startNode(cluster, nodeSpec(dataRoot));
  const nodes = cluster.nodes;

  t.equal(Object.isFrozen(nodes), true, 'the registry observation is frozen');
  t.equal(Object.isFrozen(node), true, 'the node observation is frozen');
  try {
    nodes.splice(0);
  } catch {
    // Frozen observations reject caller mutation in strict module code.
  }
  t.equal(cluster.nodes.length, 1,
    'mutating an observation cannot remove an owned child');
  await cluster.stop();
  t.end();
});

test('ordinary start cannot silently erase a predecessor failure',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-restart-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [createFakeChild(), createFakeChild()];
    let spawnIndex = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => children[spawnIndex++],
    });
    const first = await startNode(cluster, nodeSpec(dataRoot));
    children[0].close(7, null);
    await first.closed;
    await t.rejects(startNode(cluster, nodeSpec(dataRoot)), {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REQUIRED,
    }, 'restart requires a typed adjudication of the exact failed generation');
    await cluster.stop().catch(() => undefined);
    t.equal(spawnIndex, 1, 'no successor spawns through ordinary start');
    t.end();
  });

test('a retained data .env is never the child execution cwd', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-cwd-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const spec = nodeSpec(dataRoot);
  const children = [createFakeChild(), createFakeChild()];
  const spawnOptions = [];
  const cluster = createLocalProcessCluster({
    dataRoot,
    spawn: (_command, _args, options) => {
      spawnOptions.push(options);
      return children[spawnOptions.length - 1];
    },
  });
  const first = await startNode(cluster, spec);
  await writeFile(join(spec.dataDir, '.env'), 'NODE_ID=hostile\n');
  children[0].close(1, null);
  await first.closed;
  await cluster.restartNode(first, {
    decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
    dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
    deadlineMs: Date.now() + 1000,
  });
  t.not(spawnOptions[1].cwd, spec.dataDir,
    'persistent state cannot reintroduce scrubbed process configuration');
  t.notMatch(spawnOptions[1].env.NODE_ID, /hostile/u,
    'the retained file never supplies successor process configuration');
  await cluster.stop();
  t.end();
});

test('explicit environment cannot create a harness-only fast cadence',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-cadence-'));
    const retryRoot = await mkdtemp(join(tmpdir(), 'local-owner-retry-'));
    t.teardown(() => Promise.all([dataRoot, retryRoot].map((path) =>
      rm(path, {recursive: true, force: true}))));
    let spawnCount = 0;
    const shortened = createLocalProcessCluster({
      dataRoot,
      environmentOverrides: {
        [LOCAL_PROCESS_ENVIRONMENT_NAME.PARTITION_EVALUATION_INTERVAL_MS]:
          '59999',
      },
      spawn: () => {
        spawnCount += 1;
        return createFakeChild();
      },
    });
    await t.rejects(startNode(shortened, nodeSpec(dataRoot)), {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
    }, 'the owner enforces the canonical production floor');
    const retryOverride = createLocalProcessCluster({
      dataRoot: retryRoot,
      environmentOverrides: {LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS: '99'},
      spawn: () => {
        spawnCount += 1;
        return createFakeChild();
      },
    });
    await t.rejects(startNode(retryOverride, nodeSpec(retryRoot)), {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
    }, 'join retry policy cannot be overridden by the harness');
    t.equal(spawnCount, 0, 'cadence policy fails before acquisition');
    t.end();
  });

test('log-open failure waits for owned stream disposal', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-log-open-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const logStream = new Writable({write(_chunk, _encoding, done) {
    done();
  }});
  logStream.pending = true;
  let destroyCalled = false;
  logStream.destroy = () => {
    destroyCalled = true;
    return logStream;
  };
  const logCreated = Promise.withResolvers();
  const cluster = createLocalProcessCluster({
    dataRoot,
    createLogStream: () => {
      logCreated.resolve();
      return logStream;
    },
    spawn: () => createFakeChild(),
  });
  let settled = false;
  const starting = startNode(cluster, nodeSpec(dataRoot)).finally(() => {
    settled = true;
  });
  const observedStarting = starting.catch((error) => error);
  await logCreated.promise;
  logStream.emit('error', new Error('open failed'));
  await waitForTurn();
  t.equal(destroyCalled, true, 'the failed log is disposed');
  t.equal(settled, false, 'acquisition still owns the held log close');
  logStream.emit('close');
  const error = await observedStarting;
  t.equal(error.code, LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE);
  t.end();
});

test('force refusal and missing close produce bounded typed stop evidence',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-force-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild({rejectSignals: true});
    const deadlineStages = [];
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => child,
      sleep: async (durationMs) => {
        deadlineStages.push(durationMs);
      },
    });
    await startNode(cluster, nodeSpec(dataRoot));
    const stopPromise = cluster.stop();
    const observed = await Promise.race([
      stopPromise.then(
        (value) => ({value}),
        (error) => ({error}),
      ),
      waitForTurn().then(() => ({unbounded: true})),
    ]);
    t.equal(observed.unbounded, undefined,
      'stop returns at the forced-disposal boundary');
    t.equal(observed.error?.code,
      LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE);
    t.same(deadlineStages, [15000, 15000],
      'the existing grace and bounded force stages share the exact budget');
    t.same(child.signals, ['SIGTERM', 'SIGKILL'],
      'the owner attempts each signal once without retry');
    const failureCodes = observed.error.details.failures.map(({code}) => code);
    t.ok(failureCodes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.KILL_REFUSED),
      'force refusal is explicit');
    t.ok(failureCodes.includes(
      LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT),
    'missing close remains explicit after force disposal');
    t.equal(observed.error.details.resources[0].closeObserved, false,
      'the returned failure freezes the still-owned resource state');
    child.close(null, 'SIGKILL');
    await stopPromise.catch(() => undefined);
    t.equal(observed.error.details.resources[0].closeObserved, false,
      'a late close cannot rewrite the returned failure evidence');
    t.end();
  });

test('accepted SIGKILL without close remains incomplete', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-force-close-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const child = createFakeChild({ignoreSigterm: true, exitWithoutClose: true});
  const cluster = createLocalProcessCluster({
    dataRoot,
    spawn: () => child,
    sleep: async () => {},
  });
  const node = await startNode(cluster, nodeSpec(dataRoot));
  const error = await cluster.stop().catch((cause) => cause);
  const codes = error.details.failures.map(({code}) => code);
  t.ok(codes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.FORCED_KILL),
    'accepted force remains a loud teardown outcome');
  t.ok(codes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT),
    'exit cannot substitute for the child close/pipe retirement fact');
  t.same(child.signals, ['SIGTERM', 'SIGKILL'],
    'the force attempt is not retried');
  child.close(null, 'SIGKILL');
  await node.closed;
  t.end();
});

test('child close cannot substitute for pipe and log retirement', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-held-pipes-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const child = createFakeChild({holdStreamsAfterClose: true});
  const cluster = createLocalProcessCluster({
    dataRoot,
    sleep: async () => {},
    spawn: () => child,
  });
  await startNode(cluster, nodeSpec(dataRoot));
  const error = await cluster.stop().catch((cause) => cause);
  const codes = error.details.failures.map(({code}) => code);
  t.ok(codes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.STREAM_TIMEOUT),
    'held pipes require typed forced-retirement evidence');
  t.ok(codes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT),
    'process close alone cannot mint successful teardown');
  t.same(child.signals, ['SIGTERM'],
    'an exited child is not signalled again to compensate for held streams');
  t.end();
});

test('successful repeated waits release per-call termination reactions',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-waits-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const cluster = createLocalProcessCluster({dataRoot, spawn: () => child});
    const node = await startNode(cluster, nodeSpec(dataRoot));
    const baseline = cluster.nodes[0].activeWaitSubscriptions;
    for (let index = 0; index < 5; index += 1) {
      await cluster.waitFor(node, () => ({ready: true}), {
        deadlineMs: Date.now() + 100,
      });
    }
    t.equal(cluster.nodes[0].activeWaitSubscriptions, baseline,
      'successful waits restore owner subscriptions to baseline');
    await cluster.stop();
    t.end();
  });

test('explicit restart retains generation evidence and log bytes',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-generation-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [createFakeChild(), createFakeChild()];
    let spawnIndex = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => children[spawnIndex++],
    });
    const first = await startNode(cluster, nodeSpec(dataRoot));
    children[0].stdout.write('generation-zero\n');
    children[0].close(7, null);
    await first.closed;
    const second = await cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 1000,
    });
    children[1].stdout.write('generation-one\n');
    t.equal(second.generation, 1, 'the successor has a distinct generation');
    t.same(cluster.restartHistory, [{
      nodeId: NODE_IDS[0],
      index: 0,
      generation: 0,
      exitCode: 7,
      signal: null,
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      failures: [
        LOCAL_PROCESS_CLUSTER_FAILURE.NONZERO_EXIT,
        LOCAL_PROCESS_CLUSTER_FAILURE.EARLY_EXIT,
      ],
    }], 'nonzero predecessor evidence remains visible after adjudication');
    await t.rejects(cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 1000,
    }), {code: LOCAL_PROCESS_CLUSTER_FAILURE.STALE_RESTART},
    'a stale generation cannot restart its successor');
    await cluster.stop();
    const logs = await cluster.getLogs();
    t.match(logs[0].text, /generation-zero/u,
      'the predecessor log generation remains readable');
    t.match(logs[0].text, /generation-one/u,
      'the successor appends rather than truncating predecessor evidence');
    t.end();
  });

test('restart waits for full close before resetting persistent state',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-reset-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [createFakeChild(), createFakeChild()];
    let spawnIndex = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => children[spawnIndex++],
    });
    const spec = nodeSpec(dataRoot);
    const first = await startNode(cluster, spec);
    const marker = join(spec.dataDir, 'retained.marker');
    await writeFile(marker, 'owned');
    children[0].exit(1, null);
    const restarting = cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 1000,
    });
    await waitForTurn();
    await access(marker);
    t.equal(spawnIndex, 1,
      'neither reset nor successor acquisition precedes full close');
    children[0].close(1, null);
    const successor = await restarting;
    await t.rejects(access(marker), {}, 'reset follows resource retirement');
    t.equal(successor.generation, 1, 'the next generation then acquires');
    await cluster.stop();
    t.end();
  });

test('restart refuses log-failed predecessor and does not spawn',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-refusal-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [createFakeChild(), createFakeChild()];
    let spawnIndex = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => children[spawnIndex++],
    });
    const first = await startNode(cluster, nodeSpec(dataRoot));
    children[0].stdout.emit('error', new Error('pipeline failed'));
    children[0].close(1, null);
    await first.closed;
    await t.rejects(cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 1000,
    }), {code: LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REFUSED});
    t.equal(spawnIndex, 1, 'fatal predecessor evidence blocks reacquisition');
    await cluster.stop().catch(() => undefined);
    t.end();
  });

test('restart deadline retains an incompletely closed predecessor',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-close-bound-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [createFakeChild(), createFakeChild()];
    let spawnIndex = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => children[spawnIndex++],
      sleep: async () => {},
    });
    const spec = nodeSpec(dataRoot);
    const first = await startNode(cluster, spec);
    const marker = join(spec.dataDir, 'retained.marker');
    await writeFile(marker, 'owned');
    children[0].exit(1, null);
    const error = await cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 10,
    }).catch((cause) => cause);
    t.equal(error.code,
      LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_PREDECESSOR_CLOSE_TIMEOUT,
      'a descendant-held stream cannot wedge restart beyond its caller budget');
    await access(marker);
    t.equal(spawnIndex, 1,
      'deadline expiry neither resets state nor acquires a successor');
    t.equal(error.details.resources.closeObserved, false,
      'the typed refusal retains the incomplete predecessor resource state');
    await t.rejects(cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 1000,
    }), {code: LOCAL_PROCESS_CLUSTER_FAILURE.STALE_RESTART},
    'a failed adjudication cannot be replayed with a fresh budget');
    children[0].close(1, null);
    await first.closed;
    await cluster.stop().catch(() => undefined);
    t.end();
  });

test('stop cancels a serialized restart closure wait', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-stop-restart-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const child = createFakeChild();
  const cluster = createLocalProcessCluster({
    dataRoot,
    spawn: () => child,
    sleep: async () => {},
  });
  const first = await startNode(cluster, nodeSpec(dataRoot));
  child.exit(1, null);
  const restarting = cluster.restartNode(first, {
    decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
    dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
    deadlineMs: Date.now() + 60000,
  });
  await waitForTurn();
  const stopping = cluster.stop();
  await t.rejects(restarting, {code: LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE},
    'teardown cancels the pending acquisition without resetting its deadline');
  const stopError = await stopping.catch((error) => error);
  t.equal(stopError.code, LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
    'incomplete predecessor retirement remains release-blocking');
  child.close(1, null);
  await first.closed;
  t.end();
});

test('start admission snapshots caller spec and deadline authority',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-admission-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const observed = [];
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: (_command, _args, options) => {
        observed.push(options.env);
        return child;
      },
    });
    const spec = nodeSpec(dataRoot);
    const admission = {deadlineMs: Date.now() + 1000};
    const starting = cluster.startNode(spec, admission);
    spec.nodeId = NODE_IDS[1];
    spec.restPort = 19999;
    admission.deadlineMs = 0;
    const node = await starting;
    t.equal(node.nodeId, NODE_IDS[0],
      'post-admission identity mutation cannot change the acquired node');
    t.equal(node.restPort, 19080,
      'post-admission port mutation cannot change listener ownership');
    t.equal(observed.length, 1,
      'post-admission deadline mutation cannot mint or remove acquisition');
    await cluster.stop();
    t.end();
  });

test('an already-expired acquisition deadline cannot begin resource ownership',
  async (t) => {
    const dataRoot = join(tmpdir(), `local-owner-expired-${Date.now()}`);
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    let spawnCount = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => {
        spawnCount += 1;
        return createFakeChild();
      },
    });
    const error = await cluster.startNode(nodeSpec(dataRoot), {
      deadlineMs: Date.now() - 1,
    }).catch((cause) => cause);
    t.equal(error.code, LOCAL_PROCESS_CLUSTER_FAILURE.ACQUISITION_TIMEOUT,
      'expired authority is rejected with the typed acquisition boundary');
    t.equal(spawnCount, 0, 'expired authority cannot acquire a child');
    await t.rejects(access(dataRoot), {code: 'ENOENT'},
      'expired authority cannot claim or create its data root');
    await cluster.stop().catch(() => undefined);
    t.end();
  });

test('populated foreign root is preserved and never adopted', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-foreign-root-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const foreignPath = join(dataRoot, 'foreign.txt');
  await writeFile(foreignPath, 'must survive');
  let spawnCount = 0;
  const cluster = createLocalProcessCluster({
    dataRoot,
    spawn: () => {
      spawnCount += 1;
      return createFakeChild();
    },
  });
  const acquired = await cluster.startNode(nodeSpec(dataRoot), {
    deadlineMs: Date.now() + 100,
  }).catch((error) => error);
  t.equal(acquired.code, LOCAL_PROCESS_CLUSTER_FAILURE.DATA_ROOT_AUTHORITY,
    'a populated unowned root fails closed');
  t.equal(await readFile(foreignPath, 'utf8'), 'must survive',
    'foreign contents remain byte-identical');
  t.equal(spawnCount, 0, 'no child is acquired under foreign authority');
  await cluster.stop().catch(() => undefined);
  t.end();
});

test('stop bounds a log-open acquisition and forbids late spawn',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-open-stop-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const logStream = new Writable({write(_chunk, _encoding, done) {
      done();
    }});
    logStream.pending = true;
    let spawnCount = 0;
    const created = Promise.withResolvers();
    const cluster = createLocalProcessCluster({
      dataRoot,
      createLogStream: () => {
        created.resolve();
        return logStream;
      },
      sleep: async () => {},
      spawn: () => {
        spawnCount += 1;
        return createFakeChild();
      },
    });
    const starting = cluster.startNode(nodeSpec(dataRoot), {
      deadlineMs: Date.now() + 60000,
    });
    const observedStart = starting.catch((error) => error);
    await created.promise;
    const stopping = cluster.stop();
    const observedStop = await Promise.race([
      stopping.then(
        (value) => ({value}),
        (error) => ({error}),
      ),
      waitForTurn().then(() => ({unbounded: true})),
    ]);
    t.equal(observedStop.unbounded, undefined,
      'pending log ownership participates in bounded teardown');
    logStream.emit('open');
    await observedStart;
    await stopping.catch(() => undefined);
    t.equal(spawnCount, 0, 'an acquisition cannot spawn after owner stop');
    t.end();
  });

test('restart deadline covers successor log acquisition', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-reacquire-bound-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const heldLog = new Writable({write(_chunk, _encoding, done) {
    done();
  }});
  heldLog.pending = true;
  let logIndex = 0;
  const children = [createFakeChild(), createFakeChild()];
  let spawnIndex = 0;
  const cluster = createLocalProcessCluster({
    dataRoot,
    createLogStream: () => {
      logIndex += 1;
      return logIndex === 1 ? new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      }) : heldLog;
    },
    sleep: async () => {},
    spawn: () => children[spawnIndex++],
  });
  const first = await cluster.startNode(nodeSpec(dataRoot), {
    deadlineMs: Date.now() + 1000,
  });
  children[0].close(1, null);
  await first.closed;
  const restarting = cluster.restartNode(first, {
    decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
    dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
    deadlineMs: Date.now() + 10,
  });
  const observedRestart = restarting.catch((error) => error);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  const state = await Promise.race([
    observedRestart.then((error) => ({error})),
    waitForTurn().then(() => ({unbounded: true})),
  ]);
  t.equal(state.error?.code,
    LOCAL_PROCESS_CLUSTER_FAILURE.ACQUISITION_TIMEOUT,
    'the same absolute deadline bounds successor acquisition');
  heldLog.emit('error', new Error('release held successor log'));
  await waitForTurn();
  heldLog.emit('close');
  await observedRestart;
  await cluster.stop().catch(() => undefined);
  t.equal(spawnIndex, 1, 'deadline expiry cannot spawn a late successor');
  t.end();
});

test('restart deadline covers owned reset without late reacquisition',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-reset-bound-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const heldReset = Promise.withResolvers();
    const resetStarted = Promise.withResolvers();
    let spawnCount = 0;
    const cluster = createLocalProcessCluster({
      dataRoot,
      resetDataDirectory: () => {
        resetStarted.resolve();
        return heldReset.promise;
      },
      spawn: () => {
        spawnCount += 1;
        return child;
      },
    });
    const first = await startNode(cluster, nodeSpec(dataRoot));
    child.close(1, null);
    await first.closed;
    const restarting = cluster.restartNode(first, {
      decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
      dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
      deadlineMs: Date.now() + 50,
    });
    await resetStarted.promise;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
    const error = await restarting.catch((cause) => cause);
    t.equal(error.code, LOCAL_PROCESS_CLUSTER_FAILURE.ACQUISITION_TIMEOUT,
      'the caller deadline includes the reset transaction');
    heldReset.resolve();
    await waitForTurn();
    t.equal(spawnCount, 1,
      'a reset completing after expiry cannot acquire a successor');
    await cluster.stop().catch(() => undefined);
    t.end();
  });

test('restart reset revalidates exact node path authority', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'local-owner-path-'));
  const foreignRoot = await mkdtemp(join(tmpdir(), 'local-owner-foreign-'));
  t.teardown(() => Promise.all([dataRoot, foreignRoot].map((path) =>
    rm(path, {recursive: true, force: true}))));
  const child = createFakeChild();
  const spec = nodeSpec(dataRoot);
  const cluster = createLocalProcessCluster({dataRoot, spawn: () => child});
  const first = await startNode(cluster, spec);
  child.close(1, null);
  await first.closed;
  await rm(spec.dataDir, {recursive: true, force: true});
  await writeFile(join(foreignRoot, 'preserved.txt'), 'foreign');
  await symlink(foreignRoot, spec.dataDir, 'dir');
  await t.rejects(cluster.restartNode(first, {
    decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
    dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
    deadlineMs: Date.now() + 1000,
  }), {code: LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_RESET_FAILURE},
  'a replaced/symlinked node path cannot inherit destructive authority');
  t.equal(await readFile(join(foreignRoot, 'preserved.txt'), 'utf8'), 'foreign',
    'the refused reset preserves the foreign target');
  await cluster.stop().catch(() => undefined);
  t.end();
});
