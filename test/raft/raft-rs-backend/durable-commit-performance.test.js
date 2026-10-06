// Performance evidence for the owner-decided Raft FULL-sync boundary.
//
// These exact test bytes run twice on the same physical host/filesystem:
// once as a test-only carrier on predecessor 26bdc07e3, and once on the
// durability head. The report is evidence, not an environment-dependent
// performance gate. Correctness remains owned by durable-commit-sync,
// durable-commit-power-loss and durable-commit-replica-kinds.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {MessageGroupService} from
  '../../../src/message-group/message-group-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {REPLICA_DB_PRAGMA} from '../../../src/storage/storage-constants.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from
  '../../test-helpers/boot-incarnation-fixture.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const FOUNDING = Object.freeze(['perf-a', 'perf-b', 'perf-c']);
const LEADER_STATE = 2;
const SETTLE_ROUNDS = 500;
const SEQUENTIAL_WRITES = 12;
const BATCHED_WRITES = 24;
const IDLE_ROUNDS = 160;
const MESSAGE_GROUP_WRITES = 30;
const WORKER_OPERATIONS = 40;
const WORKER_WARMUP = 20;
const WORKER_SAMPLES = 5;
const TEST_TIMEOUT_MS = 120000;
const PERF_MARKER = 'RAFT_DURABLE_PERFORMANCE ';
const DIRECT_RUN_ENV = 'LAGRANGE_DURABILITY_PERF_DIRECT';
const REPORT_FILE_ENV = 'LAGRANGE_DURABILITY_PERF_REPORT_FILE';
const WORKER = fileURLToPath(new URL(
  './durable-commit-performance-worker.js', import.meta.url));
const THIS_TEST = fileURLToPath(import.meta.url);

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1)];
}

function latencySummary(values) {
  return {
    p50: percentile(values, 0.50),
    p99: percentile(values, 0.99),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

function gitHead() {
  return spawnSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'})
    .stdout.trim();
}

function physicalEvidenceRoot() {
  const root = path.resolve('test-output', 'raft-durable-performance',
    `${process.pid}-${Date.now()}`);
  fs.mkdirSync(root, {recursive: true});
  return root;
}

function filesystemOf(root) {
  const stat = fs.statSync(root);
  const statfs = fs.statfsSync(root);
  return {
    root,
    realRoot: fs.realpathSync(root),
    device: String(stat.dev),
    type: `0x${Number(statfs.type).toString(16)}`,
    blockSize: statfs.bsize,
  };
}

function runWorker(directory, {trace = false} = {}) {
  fs.mkdirSync(directory, {recursive: true});
  const output = path.join(directory, 'result.json');
  const workerArgs = [WORKER, '--directory', directory, '--operations',
    String(WORKER_OPERATIONS), '--output', output,
    '--warmup', String(WORKER_WARMUP)];
  const command = trace ? 'strace' : process.execPath;
  const args = trace ? ['-f', '-qq', '-c', '-e',
    'trace=fsync,fdatasync', process.execPath, ...workerArgs] : workerArgs;
  const started = performance.now();
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 60000});
  const wallMs = performance.now() - started;
  if (result.error?.code === 'ENOENT' && trace) {
    return {available: false, reason: 'strace-unavailable'};
  }
  if (trace && result.status !== 0 &&
      /PTRACE_TRACEME|Operation not permitted/u.test(result.stderr)) {
    return {
      available: false,
      reason: 'strace-ptrace-not-permitted',
      stderr: result.stderr.trim(),
    };
  }
  assert.equal(result.status, 0,
    `${command} failed: ${result.stderr || result.error?.message}`);
  const measured = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (!trace) return measured;
  const counts = {fsync: 0, fdatasync: 0};
  for (const line of result.stderr.split('\n')) {
    const match = /^\s*[\d.]+\s+[\d.]+\s+\d+\s+(\d+)(?:\s+\d+)?\s+(f?datasync|fsync)\s*$/u
      .exec(line);
    if (match) counts[match[2]] += Number(match[1]);
  }
  const total = counts.fsync + counts.fdatasync;
  return {
    available: true,
    ...counts,
    total,
    wallMs,
    observedSyncSyscallsPerSec: total / (wallMs / 1000),
    measured,
  };
}

function runWorkerSamples(directory) {
  const samples = Array.from({length: WORKER_SAMPLES}, (_unused, index) =>
    runWorker(path.join(directory, `sample-${index + 1}`)));
  const rates = samples.map(({opsPerSec}) => opsPerSec);
  return {
    sampleCount: samples.length,
    operationsPerSample: WORKER_OPERATIONS,
    warmupPerSample: WORKER_WARMUP,
    opsPerSecSamples: rates,
    opsPerSec: {
      median: percentile(rates, 0.50),
      min: Math.min(...rates),
      max: Math.max(...rates),
    },
    samples,
  };
}

function installReadyCounter() {
  const original = RaftRsDurableStore.prototype.persistReady;
  const counts = {persistReady: 0, mustSyncReady: 0, unflaggedReady: 0};
  RaftRsDurableStore.prototype.persistReady = function counted(groupId,
    ready) {
    counts.persistReady += 1;
    if (ready.mustSync === true) counts.mustSyncReady += 1;
    if (ready.mustSync === undefined) counts.unflaggedReady += 1;
    return original.call(this, groupId, ready);
  };
  return {
    counts,
    snapshot: () => ({...counts}),
    reset: () => {
      counts.persistReady = 0;
      counts.mustSyncReady = 0;
      counts.unflaggedReady = 0;
    },
    uninstall: () => {
      RaftRsDurableStore.prototype.persistReady = original;
    },
  };
}

function configureRuntime() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'raft-durable-performance'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetRuntime() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function leaderOf(cluster) {
  const leaders = FOUNDING.filter((replicaId) =>
    cluster.coreStatus(replicaId).raftState === LEADER_STATE);
  return leaders.length === 1 ? leaders[0] : null;
}

function measureCluster(root, counter) {
  const priorTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = root;
  const started = performance.now();
  const cluster = new PartitionNodeCluster({
    partitionId: 'durable-performance-partition',
    replicaIds: FOUNDING,
    wrapDatabase: (_replicaId, db) => {
      db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
      db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
      return db;
    },
  });
  try {
    cluster.tickers = [FOUNDING[0]];
    assert.ok(cluster.settle(() => leaderOf(cluster) !== null,
      {rounds: SETTLE_ROUNDS}), 'three-replica group elects a leader');
    const formationMs = performance.now() - started;
    const leader = leaderOf(cluster);
    counter.reset();
    const sequentialLatencyMs = [];
    for (let index = 0; index < SEQUENTIAL_WRITES; index += 1) {
      const command = `sequential-${index}`;
      const writeStarted = performance.now();
      cluster.propose(leader, command);
      assert.ok(cluster.settle(() => FOUNDING.every((replicaId) =>
        cluster.replica(replicaId).appliedCommands.includes(command)),
      {rounds: SETTLE_ROUNDS}), `sequential command ${index} commits`);
      sequentialLatencyMs.push(performance.now() - writeStarted);
    }
    const sequential = counter.snapshot();
    const sequentialElapsedMs = sequentialLatencyMs.reduce(
      (sum, value) => sum + value, 0);
    counter.reset();
    const lastBatch = `batch-${BATCHED_WRITES - 1}`;
    const batchStarted = performance.now();
    for (let index = 0; index < BATCHED_WRITES; index += 1) {
      cluster.propose(leader, `batch-${index}`);
    }
    assert.ok(cluster.settle(() => FOUNDING.every((replicaId) =>
      cluster.replica(replicaId).appliedCommands.includes(lastBatch)),
    {rounds: SETTLE_ROUNDS}), 'batched commands commit on every replica');
    const batchElapsedMs = performance.now() - batchStarted;
    const batch = counter.snapshot();
    counter.reset();
    const idleStarted = performance.now();
    for (let round = 0; round < IDLE_ROUNDS; round += 1) {
      for (const replicaId of FOUNDING) cluster.tick(replicaId);
      cluster.deliverAll();
    }
    const idleElapsedMs = performance.now() - idleStarted;
    const idle = counter.snapshot();
    return {
      formationMs,
      sequential: {
        writes: SEQUENTIAL_WRITES,
        elapsedMs: sequentialElapsedMs,
        writesPerSec: SEQUENTIAL_WRITES / (sequentialElapsedMs / 1000),
        latencyMs: latencySummary(sequentialLatencyMs),
        ...sequential,
      },
      batch: {
        writes: BATCHED_WRITES,
        elapsedMs: batchElapsedMs,
        writesPerSec: BATCHED_WRITES / (batchElapsedMs / 1000),
        mustSyncReadyPerProposal: batch.mustSyncReady / BATCHED_WRITES,
        proposalsPerReplicaMustSyncReady: BATCHED_WRITES * FOUNDING.length /
          Math.max(1, batch.mustSyncReady),
        ...batch,
      },
      idle: {rounds: IDLE_ROUNDS, elapsedMs: idleElapsedMs, ...idle},
    };
  } finally {
    cluster.dispose();
    if (priorTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = priorTmpdir;
  }
}

async function measureMessageGroup(root, counter) {
  configureRuntime();
  const directory = path.join(root, 'message-group');
  const groupId = 'durable-performance-message-group';
  const replicaId = 'durable-performance-mg-r1';
  const dbPath = path.join(directory, `${replicaId}.sqlite`);
  fs.mkdirSync(directory, {recursive: true});
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'raft-durable-performance', wsPort: 0});
  await router.initialize({startServer: false});
  const cache = new SystemTableCache();
  const service = new MessageGroupService({
    groupId,
    replicaId,
    nodeId: 'raft-durable-performance',
    replicaIds: [replicaId],
    peerAddresses: [`raft-durable-performance/message-group/${replicaId}`],
    transport: router,
    nodeService: {
      getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache,
    },
    dbPath,
  });
  try {
    await service.initialize();
    counter.reset();
    const latenciesMs = [];
    const started = performance.now();
    for (let index = 0; index < MESSAGE_GROUP_WRITES; index += 1) {
      const writeStarted = performance.now();
      await service.proposeCDCCommand({
        type: 'CDC',
        tableName: 'nodes',
        operation: 'UPDATE',
        data: {node_id: `performance-${index}`},
        timestamp: String(index),
        causeId: `performance-${index}`,
      });
      latenciesMs.push(performance.now() - writeStarted);
    }
    const elapsedMs = performance.now() - started;
    return {
      writes: MESSAGE_GROUP_WRITES,
      elapsedMs,
      writesPerSec: MESSAGE_GROUP_WRITES / (elapsedMs / 1000),
      latencyMs: latencySummary(latenciesMs),
      ...counter.snapshot(),
    };
  } finally {
    await service.shutdown().catch(() => undefined);
    await router.shutdown().catch(() => undefined);
    resetRuntime();
  }
}

test('measures the Raft durable commit cost on physical storage',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    if (process.execArgv.some((value) => value.startsWith('--import=')) &&
        process.env[DIRECT_RUN_ENV] !== '1') {
      const relayRoot = physicalEvidenceRoot();
      const reportFile = path.join(relayRoot, 'direct-report.json');
      const directEnv = {...process.env, [DIRECT_RUN_ENV]: '1'};
      delete directEnv.NODE_TEST_CONTEXT;
      directEnv[REPORT_FILE_ENV] = reportFile;
      const direct = spawnSync(process.execPath, [THIS_TEST], {
        encoding: 'utf8',
        env: directEnv,
        timeout: TEST_TIMEOUT_MS,
      });
      try {
        assert.equal(direct.status, 0,
          `direct performance process failed: ${direct.stderr ||
            direct.stdout || direct.error?.message}`);
        const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
        t.diagnostic(PERF_MARKER + JSON.stringify(report));
        return;
      } finally {
        fs.rmSync(relayRoot, {recursive: true, force: true});
      }
    }
    const root = physicalEvidenceRoot();
    const counter = installReadyCounter();
    try {
      const report = {
        head: gitHead(),
        host: os.hostname(),
        platform: `${process.platform}/${process.arch}`,
        filesystem: filesystemOf(root),
        store: runWorkerSamples(path.join(root, 'store')),
        syscalls: runWorker(path.join(root, 'strace'), {trace: true}),
        cluster: measureCluster(root, counter),
        messageGroup: await measureMessageGroup(root, counter),
      };
      if (process.env[REPORT_FILE_ENV]) {
        fs.writeFileSync(process.env[REPORT_FILE_ENV],
          JSON.stringify(report) + '\n');
      }
      t.diagnostic(PERF_MARKER + JSON.stringify(report));
      assert.equal(report.cluster.idle.mustSyncReady, 0,
        'idle heartbeats require no synced Ready');
      assert.ok(report.cluster.batch.persistReady > 0,
        'the measured batch reports persisted Ready work');
      assert.ok(report.messageGroup.writesPerSec > 0,
        'message-group writes completed');
    } finally {
      counter.uninstall();
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
