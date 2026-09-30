/**
 * Guard tests for the formation + schema-provisioning probe wiring
 * (examples/service-data-affinity/run-formation-probe.js).
 *
 * The probe is the cheap single-axis live validation for formation
 * quests: cluster bring-up + CREATE TABLE ratings (partition
 * provisioning — where the ledger-interlock admission deferrals fire),
 * WITHOUT the 100k-row load and callback example that abort the full
 * demo on axes unrelated to the measured signal. These tests assert
 * exports and wiring only; no cluster is started.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {setImmediate as waitForTurn} from 'node:timers/promises';
import {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  buildLocalNodeSpec,
  createLocalProcessCluster,
  queryRows,
  startCluster,
  startDockerCluster,
  startLocalCluster,
  waitForAdmin,
  waitForClusterSize,
} from '../../examples/service-data-affinity/cluster-harness.js';
import {
  DEFERRAL_COUNTER_STRINGS,
  PROBE_RESULT,
  countOccurrences,
  harvestDeferralCounters,
  parseProbeArgs,
  pollRatingsPartitionsReady,
  resolveProbeResult,
  runFormationProbe,
  summarizeRatingsPartitions,
} from '../../examples/service-data-affinity/run-formation-probe.js';

const require = createRequire(import.meta.url);

const PROBE_PATH = 'examples/service-data-affinity/run-formation-probe.js';
const QUORUM_CONCENTRATED_REASON_CODE = 'operation_ledger_quorum_concentrated';
const QUORUM_CONCENTRATED_EMITTER_PATHS = [
  'src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js',
  'src/query/sql-query-engine-provisioning-admission-methods.js',
];
const LOCAL_NODE_IDS = Object.freeze([
  '550e8400-e29b-41d4-a716-446655440710',
  '550e8400-e29b-41d4-a716-446655440711',
  '550e8400-e29b-41d4-a716-446655440712',
]);

function createFakeChild(options = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
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
    child.stdout.end();
    child.stderr.end();
    queueMicrotask(() => child.emit('close', exitCode, signal));
  };
  child.kill = (signal) => {
    child.signals.push(signal);
    options.onKill?.(signal, child);
    if (signal === 'SIGTERM' && options.ignoreSigterm === true) return true;
    child.close(null, signal);
    return true;
  };
  return child;
}

function localNodeSpec(dataRoot, overrides = {}) {
  return {
    index: 0,
    nodeId: LOCAL_NODE_IDS[0],
    dataDir: join(dataRoot, 'node-0'),
    restPort: 18080,
    adminPort: 18081,
    transportPort: 18082,
    seedAddresses: [],
    ...overrides,
  };
}

function startOwnedNode(cluster, spec, timeoutMs = 1000) {
  return cluster.startNode(spec, {deadlineMs: Date.now() + timeoutMs});
}

test('demo module exports the cluster-start helpers the probe reuses ' +
  '(and importing it starts nothing)', (t) => {
  const helpers = {
    createLocalProcessCluster,
    queryRows,
    startCluster,
    startDockerCluster,
    startLocalCluster,
    waitForAdmin,
    waitForClusterSize,
  };
  for (const [name, helper] of Object.entries(helpers)) {
    t.type(helper, 'function', `${name} is exported as a function`);
  }
  t.end();
});

test('local cluster startup retains rollback ownership until handle return',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-owned-cluster-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [];
    const formationFailure = new Error('injected formation failure');

    const startPromise = startLocalCluster(
      3,
      dataRoot,
      'ws://formation-owner.invalid',
      {
        spawn: () => {
          const child = createFakeChild();
          children.push(child);
          return child;
        },
        waitForAdmin: async () => {},
        waitForClusterSize: async () => {
          throw formationFailure;
        },
      },
    );

    await t.rejects(startPromise, formationFailure,
      'the original formation failure remains the surfaced cause');
    t.equal(children.length, 3, 'the failure occurs after all children exist');
    t.ok(children.every((child) => child.signals.length === 1),
      'the acquisition owner reclaims every child before throwing');
    t.end();
  });

test('local cluster rollback cannot replace an immutable startup failure',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-owned-cluster-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const startupFailure = Object.freeze(new Error('immutable startup failure'));
    let observedFailure = null;
    let cleanupFailure = null;

    try {
      await startLocalCluster(
        1,
        dataRoot,
        'ws://formation-owner.invalid',
        {
          spawn: () => createFakeChild(),
          createLogStream: () => new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            },
            final(callback) {
              callback(new Error('injected rollback log failure'));
            },
          }),
          waitForAdmin: async () => {
            throw startupFailure;
          },
          onCleanupFailure: (error) => {
            cleanupFailure = error;
            throw new Error('hostile cleanup observer');
          },
        },
      );
    } catch (error) {
      observedFailure = error;
    }

    t.equal(observedFailure, startupFailure,
      'rollback failure cannot replace or wrap the immutable primary cause');
    t.equal(cleanupFailure?.code, LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
      'cleanup evidence is surfaced separately as a typed owner outcome');
    t.end();
  });

test('local cluster handle owns one single-flight teardown decision',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-owned-cluster-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    let stopCalls = 0;
    let graceDelayAborted = false;
    let reentrantStop = null;
    let handle = null;
    const child = createFakeChild({
      onKill: () => {
        stopCalls += 1;
        reentrantStop = handle.stop();
      },
    });
    handle = await startLocalCluster(
      1,
      dataRoot,
      'ws://formation-owner.invalid',
      {
        spawn: () => child,
        sleep: (_durationMs, {signal} = {}) => new Promise(
          (_resolve, reject) => signal.addEventListener('abort', () => {
            graceDelayAborted = true;
            reject(signal.reason);
          }, {once: true})),
        waitForAdmin: async () => {},
        waitForClusterSize: async () => 0,
      },
    );

    const firstStop = handle.stop();
    const secondStop = handle.stop();
    t.equal(firstStop, secondStop, 'the owner returns its exact in-flight stop');
    await Promise.all([firstStop, secondStop]);
    t.equal(reentrantStop, firstStop,
      'a synchronous signal callback observes the published stop decision');
    t.equal(stopCalls, 1,
      'concurrent callers consume the owner\'s one teardown, not two kill loops');
    t.equal(graceDelayAborted, true,
      'a fast stop cancels its losing 15-second grace timer');
    t.end();
  });

test('stop fences an in-flight child acquisition without orphaning its spawn',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const logReady = Promise.withResolvers();
    let pendingLog = null;
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => child,
      createLogStream: () => {
        pendingLog = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        });
        pendingLog.pending = true;
        logReady.resolve();
        return pendingLog;
      },
    });

    const starting = startOwnedNode(cluster, localNodeSpec(dataRoot), 60000);
    await logReady.promise;
    const stopping = cluster.stop();
    pendingLog.pending = false;
    pendingLog.emit('open');
    await t.rejects(starting, {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
    }, 'an acquisition crossing the stop fence cannot transfer a live handle');
    await stopping;
    t.same(child.signals, [],
      'the stop fence prevents the deferred acquisition from spawning');
    t.equal(cluster.nodes.length, 0,
      'a cancelled acquisition cannot publish a node observation');
    t.end();
  });

test('local process owner isolates identity, ports, cwd, argv and environment',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const spawnCalls = [];
    const cluster = createLocalProcessCluster({
      dataRoot,
      inheritedEnvironment: {
        DEBUG: 'bootstrap:*',
        FORCE_NEW_CLUSTER: '1',
        LAGRANGE_DEBUG_LOGS: 'true',
        LAGRANGE_FORCE_NEW_CLUSTER: '1',
        LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS: '99',
        LAGRANGE_LOG_FILE: '/tmp/inherited-node.log',
        NODE_ENV: 'test',
        NODE_JOINING_HTTP_TIMEOUT_MS: '1',
        NODE_OPTIONS: '--import=untrusted-loader',
        RAFT_ELECTION_TIMEOUT_MIN_MS: '1',
        RAFT_PROVIDER: 'raft_logic',
        REST_API_PORT: '1',
        SEED_NODE_ADDRESS: 'inherited.invalid:1',
        TAP_CHILD_ID: '7',
        UNRELATED_PARENT_VALUE: 'preserved',
      },
      spawn: (...args) => {
        spawnCalls.push(args);
        return child;
      },
    });
    const spec = localNodeSpec(dataRoot, {
      seedAddresses: ['localhost:17080', 'localhost:17084'],
    });
    const node = await startOwnedNode(cluster, spec);
    const [command, args, options] = spawnCalls[0];

    t.equal(command, process.execPath, 'the owner uses the current Node binary');
    t.ok(isAbsolute(args[0]), 'the production entrypoint path is absolute');
    t.match(args[0], /\/src\/index\.js$/u);
    t.same(args.slice(1), [
      '--data-dir', node.dataDir,
      '--seed', 'localhost:17080,localhost:17084',
    ], 'the typed spec becomes one canonical entrypoint argv');
    t.not(options.cwd, node.dataDir,
      'the empty execution cwd is distinct from persistent node state');
    t.equal(options.cwd, node.executionCwd,
      'the owner exposes the sanitized execution-cwd identity');
    t.equal(options.env[LOCAL_PROCESS_ENVIRONMENT_NAME.DATA_DIR], node.dataDir,
      'production storage remains bound to the typed data directory');
    t.equal(options.env[LOCAL_PROCESS_ENVIRONMENT_NAME.NODE_ID], spec.nodeId);
    t.equal(options.env[LOCAL_PROCESS_ENVIRONMENT_NAME.REST_PORT], '18080');
    t.equal(options.env[LOCAL_PROCESS_ENVIRONMENT_NAME.ADMIN_PORT], '18081');
    t.equal(options.env[LOCAL_PROCESS_ENVIRONMENT_NAME.TRANSPORT_PORT], '18082');
    t.same(node.ports, {rest: 18080, admin: 18081, transport: 18082},
      'the returned owner record exposes the resolved listener tuple');
    t.equal(options.env.UNRELATED_PARENT_VALUE, 'preserved');
    for (const forbidden of [
      'DEBUG',
      'FORCE_NEW_CLUSTER',
      'LAGRANGE_DEBUG_LOGS',
      'LAGRANGE_FORCE_NEW_CLUSTER',
      'LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS',
      'LAGRANGE_LOG_FILE',
      'NODE_ENV',
      'NODE_JOINING_HTTP_TIMEOUT_MS',
      'NODE_OPTIONS',
      'RAFT_ELECTION_TIMEOUT_MIN_MS',
      'RAFT_PROVIDER',
      'SEED_NODE_ADDRESS',
      'TAP_CHILD_ID',
    ]) {
      t.notOk(Object.hasOwn(options.env, forbidden),
        `${forbidden} is scrubbed before explicit node configuration`);
    }

    child.stdout.write('stdout-owned\n');
    child.stderr.write('stderr-owned\n');
    await cluster.stop();
    const logs = await cluster.getLogs();
    t.equal(logs[0].nodeId, node.nodeId,
      'log evidence retains the real process identity');
    t.match(logs[0].text, /stdout-owned/u);
    t.match(logs[0].text, /stderr-owned/u,
      'stop resolves only after both pipes and the log file finish');
    t.equal(node.logPath, join(dataRoot, 'node-0.log'));
    t.end();
  });

test('local process owner rejects invalid identities and resource collisions',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const children = [];
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => {
        const child = createFakeChild();
        children.push(child);
        return child;
      },
    });
    const generated = buildLocalNodeSpec(0, dataRoot);
    t.match(generated.nodeId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      'the compatibility wrapper generates a join-admissible node UUID');
    await t.rejects(startOwnedNode(cluster, localNodeSpec(dataRoot, {
      nodeId: 'node-0',
    })), {code: LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC},
    'the lifecycle owner rejects identities the bootstrap owner cannot admit');
    await t.rejects(startOwnedNode(cluster, localNodeSpec(dataRoot, {
      adminPort: 18080,
    })), {code: LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC},
    'listener-model failures remain typed node-spec failures');
    await startOwnedNode(cluster, localNodeSpec(dataRoot));
    await t.rejects(startOwnedNode(cluster, localNodeSpec(dataRoot, {
      index: 1,
      nodeId: LOCAL_NODE_IDS[1],
      dataDir: join(dataRoot, 'node-1'),
    })), {code: LOCAL_PROCESS_CLUSTER_FAILURE.DUPLICATE_NODE},
    'different identities cannot share a listener port');
    t.equal(children.length, 1, 'resource conflicts fail before another spawn');
    await cluster.stop();
    t.end();
  });

test('local process owner signals all nodes before one grace wait and reports ' +
  'forced kills', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
  t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
  const children = [
    createFakeChild({ignoreSigterm: true}),
    createFakeChild({ignoreSigterm: true}),
  ];
  let spawnIndex = 0;
  let graceWaits = 0;
  const cluster = createLocalProcessCluster({
    dataRoot,
    spawn: () => children[spawnIndex++],
    sleep: async (durationMs) => {
      graceWaits += 1;
      t.equal(durationMs, 15000,
        'the owner keeps the existing common 15-second stop grace');
      t.ok(children.every((child) => child.signals[0] === 'SIGTERM'),
        'all children receive SIGTERM before the common grace wait begins');
      if (graceWaits === 2) {
        await Promise.all(cluster.nodes.map((node) => node.closed));
      }
      await waitForTurn();
    },
  });
  await startOwnedNode(cluster, localNodeSpec(dataRoot));
  await startOwnedNode(cluster, localNodeSpec(dataRoot, {
    index: 1,
    nodeId: LOCAL_NODE_IDS[1],
    dataDir: join(dataRoot, 'node-1'),
    restPort: 18084,
    adminPort: 18085,
    transportPort: 18086,
    seedAddresses: ['localhost:18080'],
  }));

  let stopError = null;
  try {
    await cluster.stop();
  } catch (error) {
    stopError = error;
  }
  t.equal(stopError?.code, LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE);
  t.same(
    stopError?.details.failures.map((failure) => failure.code),
    [
      LOCAL_PROCESS_CLUSTER_FAILURE.FORCED_KILL,
      LOCAL_PROCESS_CLUSTER_FAILURE.FORCED_KILL,
    ],
    'forced teardown stays a loud typed outcome for every child',
  );
  t.equal(graceWaits, 2,
    'one unchanged grace stage and one bounded forced-disposal stage run');
  for (const child of children) {
    t.same(child.signals, ['SIGTERM', 'SIGKILL'],
      'each child receives at most one graceful and one forced signal');
  }
  t.end();
});

test('local process owner waitFor is deadline-aware and races child exit',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const cluster = createLocalProcessCluster({dataRoot, spawn: () => child});
    const node = await startOwnedNode(cluster, localNodeSpec(dataRoot));
    let probes = 0;
    const observed = await cluster.waitFor(node, ({remainingMs, signal}) => {
      probes += 1;
      t.ok(remainingMs > 0, 'the probe receives only its remaining budget');
      t.equal(signal.aborted, false, 'the live probe receives an active signal');
      return probes === 2 ? {ready: true, value: 'ready'} :
        {ready: false, diagnostic: 'booting'};
    }, {
      deadlineMs: Date.now() + 100,
      code: 'LOCAL_READINESS_TIMEOUT',
      pollIntervalMs: 1,
    });
    t.equal(observed, 'ready');
    await cluster.stop();

    const earlyRoot = await mkdtemp(join(tmpdir(), 'lagrange-early-owner-'));
    t.teardown(() => rm(earlyRoot, {recursive: true, force: true}));
    const earlyChild = createFakeChild();
    const earlyCluster = createLocalProcessCluster({
      dataRoot: earlyRoot,
      spawn: () => earlyChild,
    });
    const earlyNode = await startOwnedNode(earlyCluster, localNodeSpec(earlyRoot, {
      nodeId: LOCAL_NODE_IDS[2],
      dataDir: join(earlyRoot, 'early-node'),
    }));
    const waiting = earlyCluster.waitFor(
      earlyNode,
      () => ({ready: false, diagnostic: 'still booting'}),
      {deadlineMs: Date.now() + 100, pollIntervalMs: 1},
    );
    earlyChild.exit(0, null);
    await t.rejects(waiting, {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.EARLY_EXIT,
    }, 'exit is observed even while inherited descendants retain stdio');
    earlyChild.close(0, null);
    await earlyNode.closed;
    t.end();
  });

test('a post-spawn log pipeline failure terminates readiness loudly',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lagrange-process-owner-'));
    t.teardown(() => rm(dataRoot, {recursive: true, force: true}));
    const child = createFakeChild();
    const logStream = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const cluster = createLocalProcessCluster({
      dataRoot,
      spawn: () => child,
      createLogStream: () => logStream,
    });
    const node = await startOwnedNode(cluster, localNodeSpec(dataRoot));
    const waiting = cluster.waitFor(
      node,
      () => ({ready: false, diagnostic: 'booting'}),
      {deadlineMs: Date.now() + 1000, pollIntervalMs: 1},
    );
    logStream.emit('error', new Error('injected log failure'));
    await t.rejects(waiting, {
      code: LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
    }, 'readiness races the owned log pipeline, not only process delivery');
    child.close(0, null);
    await node.closed;
    t.end();
  });

test('probe arg parsing matches the demo mode selection (--local, ' +
  'plus the --mode local|docker alias)', (t) => {
  t.same(parseProbeArgs([]), {local: false, nodeCount: null},
    'default is docker (same as the demo)');
  t.equal(parseProbeArgs(['--local']).local, true, '--local (demo flag)');
  t.equal(parseProbeArgs(['--mode', 'local']).local, true, '--mode local');
  t.equal(parseProbeArgs(['--mode', 'docker']).local, false, '--mode docker');
  t.equal(parseProbeArgs(['--nodes', '3']).nodeCount, 3, '--nodes N');
  t.end();
});

test('harvested counter strings are the REAL emitted source strings ' +
  '(drift guard against the emitting modules)', async (t) => {
  const {PARTITION_SERVICE_SHARED} =
    await import('../../src/partition/partition-service-shared.js');
  const {OPERATION_WORKFLOW_OWNER_SHARED} =
    await import('../../src/rebalancer/operation-workflow-owner-shared.js');

  t.equal(
    DEFERRAL_COUNTER_STRINGS.would_exceed_target_replica_count,
    PARTITION_SERVICE_SHARED.PARTITION_SERVICE_LITERAL
      .WOULD_EXCEED_TARGET_REPLICA_COUNT,
    'would_exceed_target_replica_count matches partition-service-shared',
  );
  t.equal(
    DEFERRAL_COUNTER_STRINGS.would_drop_voter_ready_below_minimum,
    OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_LITERAL
      .WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
    'would-drop-voter-ready matches operation-workflow-owner-shared',
  );
  t.equal(
    DEFERRAL_COUNTER_STRINGS.operation_ledger_quorum_concentrated,
    QUORUM_CONCENTRATED_REASON_CODE,
  );
  for (const sourcePath of QUORUM_CONCENTRATED_EMITTER_PATHS) {
    const source = await readFile(sourcePath, 'utf8');
    t.ok(
      source.includes(`'${QUORUM_CONCENTRATED_REASON_CODE}'`),
      `${sourcePath} still emits the quorum-concentrated reason code`,
    );
  }
  t.end();
});

test('counter harvest counts every counter per node via the cluster ' +
  'handle log accessor', async (t) => {
  const quorum = DEFERRAL_COUNTER_STRINGS.operation_ledger_quorum_concentrated;
  const wouldDrop =
    DEFERRAL_COUNTER_STRINGS.would_drop_voter_ready_below_minimum;
  const handle = {
    getNodeLogs: async () => [
      {nodeId: 'node-0', text: `x ${quorum} y ${quorum} z ${wouldDrop}`},
      {nodeId: 'node-1', text: 'no signals here'},
    ],
  };
  const harvest = await harvestDeferralCounters(handle);
  t.equal(harvest.available, true);
  t.equal(harvest.error, null);
  const counters = harvest.counters;
  t.equal(counters.operation_ledger_quorum_concentrated.total, 2);
  t.same(counters.operation_ledger_quorum_concentrated.perNode,
    {'node-0': 2, 'node-1': 0});
  t.equal(counters.would_drop_voter_ready_below_minimum.total, 1);
  t.equal(counters.would_exceed_target_replica_count.total, 0);

  const noAccessor = await harvestDeferralCounters({mode: 'external'});
  t.equal(noAccessor.available, false,
    'a mode without log access reports unavailable, never hard zeros');
  t.equal(noAccessor.counters, null);
  t.match(noAccessor.error, /external/);

  const failing = await harvestDeferralCounters({
    getNodeLogs: async () => {
      throw new Error('docker logs unreachable');
    },
  });
  t.equal(failing.available, false,
    'a harvest failure degrades to unavailable instead of aborting the run');
  t.match(failing.error, /docker logs unreachable/);

  const partial = await harvestDeferralCounters({
    getNodeLogs: async () => [
      {nodeId: 'node-0', text: quorum},
      {nodeId: 'node-1', text: '', readError: 'ENOENT node-1.log'},
    ],
  });
  t.equal(partial.available, true);
  t.match(partial.error, /node-1: ENOENT/,
    'per-node read errors are surfaced, not silently counted as zero');
  t.equal(partial.counters.operation_ledger_quorum_concentrated.total, 1);

  t.equal(countOccurrences('aXbXc', 'X'), 2);
  t.end();
});

test('partition readiness summary: only tbl- partitions count, and ' +
  'canonical normal-with-leader is READY', (t) => {
  const rows = [
    {partition_id: 'replica_operations-p0', leader_node_id: 'n1',
      state: 'normal'},
    {partition_id: 'tbl-ratings-p0', leader_node_id: 'n1', state: 'normal'},
    {partition_id: 'tbl-ratings-p1', leader_node_id: null, state: 'normal'},
    {partition_id: 'tbl-ratings-p2', leader_node_id: 'n2',
      state: 'splitting'},
  ];
  const summary = summarizeRatingsPartitions(rows);
  t.equal(summary.total, 3, 'system partitions are excluded');
  t.equal(summary.ready, 1);
  t.same(summary.pending.map((p) => p.partitionId),
    ['tbl-ratings-p1', 'tbl-ratings-p2'],
    'leaderless and non-normal partitions are pending');
  t.type(pollRatingsPartitionsReady, 'function');
  t.type(runFormationProbe, 'function');
  t.same(Object.keys(PROBE_RESULT).sort(),
    ['CREATE_TABLE_FAILED', 'READY', 'TIMEOUT']);
  t.end();
});

test('probe result folding: readiness wins over a client-side CREATE ' +
  'timeout (IF NOT EXISTS may land server-side)', (t) => {
  t.equal(resolveProbeResult({ok: false}, {ready: true}),
    PROBE_RESULT.READY,
    'partitions READY after a create timeout is still READY');
  t.equal(resolveProbeResult({ok: true}, {ready: true}),
    PROBE_RESULT.READY);
  t.equal(resolveProbeResult({ok: true}, {ready: false}),
    PROBE_RESULT.TIMEOUT);
  t.equal(resolveProbeResult({ok: false}, {ready: false}),
    PROBE_RESULT.CREATE_TABLE_FAILED);
  t.end();
});

test('probe stays single-axis: no ratings load, no callback example, ' +
  'and the npm script is wired', async (t) => {
  const probeSource = await readFile(PROBE_PATH, 'utf8');
  t.notMatch(probeSource, /lagrange-loader/,
    'the 100k-row loader (admin-timeout abort axis) is not imported');
  t.notMatch(probeSource, /runExamplesCatalog|build-upload-run/,
    'the callback example (second abort axis) is not imported');
  t.match(probeSource, /CREATE_RATINGS_SQL/,
    'the demo CREATE TABLE (provisioning trigger) IS issued');
  t.match(probeSource, /formation-probe-runs\.ndjson/,
    'runs are archived to the ndjson trend corpus');

  const packageJson = require('../../package.json');
  t.equal(packageJson.scripts['demo:formation-probe'],
    `node ${PROBE_PATH}`,
    'npm run demo:formation-probe points at the probe');
  t.end();
});
