#!/usr/bin/env node
/**
 * The storage-load scenario on the in-process three-node path.
 *
 * Starts a seed and two joiners in this process with every replica on disk
 * under the run directory, creates one user table, and drives a string-keyed
 * write stream plus a read stream of already-written keys at a target rate
 * for a duration. Every snapshot interval it writes the whole report
 * (figures so far, the storage footprint, the growth rates fitted over the
 * snapshots) atomically to the output path, so a killed or stalled soak
 * still leaves its last snapshot. The report contract is owned by
 * scripts/checks/storage-load-report.js.
 *
 *   npm run soak:storage -- [--duration 2m] [--ops-per-sec 20]
 *     [--read-share 0.5] [--snapshot-interval 10s]
 *     [--output data/storage-load/latest.json]
 *     [--run-dir test-output/storage-load/<startedAt>]
 *
 * This is a harness, not a probe: it refuses to run under the solver's probe
 * mark (R27).
 */
import {mkdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {
  STORAGE_LOAD_REPORT,
} from '../../scripts/checks/storage-load-report.js';
import {
  createTableUntilReady,
  startInProcessThreeNodeCluster,
} from './in-process-three-node-cluster.js';
import {collectStorageFootprint} from './storage-footprint.js';
import {LoadFigures, PacedLoadStream} from './paced-load.js';

const HARNESS_NAME = 'storage-load scenario';
// Each table is one full-range partition, so "per partition" figures are
// per table; the load spreads round-robin over the tables and the nodes.
const TABLE_PREFIX = 'storage_load_p';
const TABLE_COLUMNS =
  '(log_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, level TEXT NOT NULL, ' +
  'node_id TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)';
const INSERT_COLUMNS =
  '(log_id, seq, level, node_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const SELECT_COLUMNS = 'SELECT log_id, seq FROM ';
const WHERE_KEY = ' WHERE log_id = ?';
const LOG_LEVEL = 'info';
const KEY_PREFIX = 'load-';
const MESSAGE_PAYLOAD = 'storage-load '.repeat(10).trim();
const HOUR_MS = 3600000;
const DEFAULTS = Object.freeze({
  DURATION_MS: 120000,
  OPS_PER_SEC: 20,
  PARTITIONS: 4,
  READ_SHARE: 0.5,
  SNAPSHOT_INTERVAL_MS: 10000,
  RUN_DIR_ROOT: 'test-output/storage-load',
  STOP_TIMEOUT_MS: 30000,
});
const CLI = Object.freeze({
  DURATION: '--duration',
  OPS_PER_SEC: '--ops-per-sec',
  READ_SHARE: '--read-share',
  SNAPSHOT_INTERVAL: '--snapshot-interval',
  OUTPUT: '--output',
  RUN_DIR: '--run-dir',
  KEY_TYPE: '--key-type',
  PARTITIONS: '--partitions',
});
const DURATION_UNITS = Object.freeze({ms: 1, s: 1000, m: 60000, h: HOUR_MS});
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/u;
const REFUSAL = Object.freeze({
  BAD_DURATION: 'not a duration: ',
  BAD_NUMBER: 'not a number: ',
  KEY_TYPE_UNAVAILABLE: 'integer keys are not measured until ' +
    'numeric-key-routing lands; use --key-type string',
  UNKNOWN_ARGUMENT: 'unknown argument: ',
});
const SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);
const JSON_INDENT = 2;
const TMP_SUFFIX = '.tmp';
const GIT_HEAD = ['rev-parse', 'HEAD'];
const UNKNOWN_HEAD = 'unknown';

function parseDuration(text) {
  const match = DURATION_PATTERN.exec(String(text));
  if (!match) throw new Error(REFUSAL.BAD_DURATION + text);
  return Math.round(Number(match[1]) * DURATION_UNITS[match[2] || 'ms']);
}

function parseNumber(text) {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(REFUSAL.BAD_NUMBER + text);
  }
  return value;
}

function parseArguments(argv) {
  const startedAt = new Date().toISOString();
  const options = {
    durationMs: DEFAULTS.DURATION_MS,
    opsPerSec: DEFAULTS.OPS_PER_SEC,
    partitions: DEFAULTS.PARTITIONS,
    readShare: DEFAULTS.READ_SHARE,
    snapshotIntervalMs: DEFAULTS.SNAPSHOT_INTERVAL_MS,
    output: STORAGE_LOAD_REPORT.STRING_REPORT,
    runDir: join(DEFAULTS.RUN_DIR_ROOT, startedAt.replace(/[:.]/gu, '-')),
    keyType: STORAGE_LOAD_REPORT.KEY_TYPE.STRING,
    startedAt,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
    case CLI.DURATION: options.durationMs = parseDuration(value); break;
    case CLI.OPS_PER_SEC: options.opsPerSec = parseNumber(value); break;
    case CLI.READ_SHARE: options.readShare = Number(value); break;
    case CLI.SNAPSHOT_INTERVAL:
      options.snapshotIntervalMs = parseDuration(value); break;
    case CLI.OUTPUT: options.output = value; break;
    case CLI.RUN_DIR: options.runDir = value; break;
    case CLI.KEY_TYPE: options.keyType = value; break;
    case CLI.PARTITIONS: options.partitions = Math.round(parseNumber(value)); break;
    default: throw new Error(REFUSAL.UNKNOWN_ARGUMENT + flag);
    }
  }
  if (options.keyType !== STORAGE_LOAD_REPORT.KEY_TYPE.STRING) {
    throw new Error(REFUSAL.KEY_TYPE_UNAVAILABLE);
  }
  return options;
}

function resolvePath(root, candidate) {
  return isAbsolute(candidate) ? candidate : resolve(root, candidate);
}

function currentHead(root) {
  const result = spawnSync('git', GIT_HEAD, {cwd: root, encoding: 'utf8'});
  const head = String(result.stdout || '').trim();
  return head.length > 0 ? head : UNKNOWN_HEAD;
}

function writeAtomically(file, report) {
  mkdirSync(dirname(file), {recursive: true});
  const temporary = file + TMP_SUFFIX;
  writeFileSync(temporary, JSON.stringify(report, null, JSON_INDENT) + '\n');
  renameSync(temporary, file);
}

/** Least-squares slope of value over elapsedMs, scaled to per hour. */
function slopePerHour(snapshots, pick) {
  if (snapshots.length < STORAGE_LOAD_REPORT.MIN_SNAPSHOTS) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const snapshot of snapshots) {
    const x = snapshot.elapsedMs;
    const y = pick(snapshot.storage);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const count = snapshots.length;
  const denominator = count * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return ((count * sumXY - sumX * sumY) / denominator) * HOUR_MS;
}

function growthFigures(snapshots) {
  return {
    diskBytesPerHour: slopePerHour(snapshots, (s) => s.diskBytes),
    raftLogEntriesPerHour: slopePerHour(snapshots, (s) => s.raftLogEntries),
    raftLogCommandBytesPerHour:
      slopePerHour(snapshots, (s) => s.raftLogCommandBytes),
    messageGroupLogEntriesPerHour:
      slopePerHour(snapshots, (s) => s.messageGroupLogEntries),
    rssBytesPerHour: slopePerHour(snapshots, (s) => s.rssBytes),
  };
}

class StorageLoadScenario {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.outputFile = resolvePath(root, options.output);
    this.runDir = resolvePath(root, options.runDir);
    this.dataDir = join(this.runDir, 'data');
    this.head = currentHead(root);
    this.cluster = null;
    this.writer = null;
    this.reader = null;
    this.snapshots = [];
    this.startedAtMs = null;
    this.endReason = STORAGE_LOAD_REPORT.END_REASON.SNAPSHOT;
    this.snapshotTimer = null;
    this.stopping = false;
    this.error = null;
    this.partitions = [];
    for (let index = 0; index < options.partitions; index += 1) {
      this.partitions.push({
        tableName: TABLE_PREFIX + index,
        confirmedKeys: 0,
        write: new LoadFigures(),
        read: new LoadFigures(),
      });
    }
  }

  partitionFor(counter) {
    return this.partitions[counter % this.partitions.length];
  }

  async measured(figures, work) {
    figures.attempted += 1;
    const beganMs = Date.now();
    try {
      await work();
      figures.recordSuccess(Date.now() - beganMs);
    } catch (error) {
      figures.recordFailure(error);
      throw error;
    }
  }

  log(message) {
    process.stderr.write(`[${HARNESS_NAME}] ${message}\n`);
  }

  nodeEngine(counter) {
    const nodes = this.cluster.nodes;
    return nodes[counter % nodes.length];
  }

  insert(counter) {
    const partition = this.partitionFor(counter);
    const node = this.nodeEngine(counter);
    return this.measured(partition.write, async () => {
      const result = await node.sqlEngine.executeQuery(
        `INSERT INTO ${partition.tableName} ${INSERT_COLUMNS}`, [
          KEY_PREFIX + counter, counter, LOG_LEVEL, node.nodeId,
          MESSAGE_PAYLOAD, Date.now(),
        ]);
      if (result?.success !== true) {
        throw new Error(String(result?.error?.message || result?.error ||
          'insert refused'));
      }
      if (counter > partition.confirmedKeys) partition.confirmedKeys = counter;
    });
  }

  select(counter) {
    const partition = this.partitionFor(counter);
    if (partition.confirmedKeys === 0) return Promise.resolve();
    // Keys of this partition are the counters congruent to its index.
    const stride = this.partitions.length;
    const slots = Math.floor((partition.confirmedKeys - 1) / stride);
    const key = (counter % stride) + stride * Math.floor(Math.random() * (slots + 1));
    const node = this.nodeEngine(counter);
    return this.measured(partition.read, async () => {
      const result = await node.sqlEngine.executeQuery(
        SELECT_COLUMNS + partition.tableName + WHERE_KEY,
        [KEY_PREFIX + Math.max(1, key)]);
      if (result?.success !== true) {
        throw new Error(String(result?.error?.message || result?.error ||
          'select refused'));
      }
    });
  }

  partitionFigures() {
    const elapsedMs = this.writer.elapsedMs();
    return this.partitions.map((partition) => ({
      tableName: partition.tableName,
      write: partition.write.figures(elapsedMs),
      read: partition.read.figures(elapsedMs),
    }));
  }

  buildReport() {
    const nowMs = Date.now();
    const elapsedMs = Math.max(1, nowMs - this.startedAtMs);
    const storage = collectStorageFootprint({
      dataDir: this.dataDir, nodes: this.cluster.nodes,
    });
    return {
      schema: STORAGE_LOAD_REPORT.SCHEMA,
      contract: 'scripts/checks/storage-load-report.js',
      run: {
        head: this.head,
        startedAt: this.options.startedAt,
        endedAt: new Date(nowMs).toISOString(),
        keyType: this.options.keyType,
        topology: STORAGE_LOAD_REPORT.TOPOLOGY_IN_PROCESS_THREE_NODE,
        nodeCount: this.cluster.nodeCount,
        nodeIds: this.cluster.nodes.map((node) => node.nodeId),
        partitionCount: this.partitions.length,
        durationMs: this.options.durationMs,
        elapsedMs,
        snapshotIntervalMs: this.options.snapshotIntervalMs,
        opsPerSec: this.options.opsPerSec,
        readShare: this.options.readShare,
        runDir: relative(this.root, this.runDir),
        endReason: this.endReason,
        error: this.error,
      },
      write: this.writer.figures(),
      read: this.reader.figures(),
      partitions: this.partitionFigures(),
      storage,
      snapshots: this.snapshots,
      growth: growthFigures(this.snapshots),
    };
  }

  snapshot() {
    const report = this.buildReport();
    this.snapshots.push({
      at: report.run.endedAt,
      elapsedMs: report.run.elapsedMs,
      storage: report.storage,
      write: {succeeded: report.write.succeeded, opsPerSec: report.write.opsPerSec},
      read: {succeeded: report.read.succeeded, opsPerSec: report.read.opsPerSec},
    });
    report.snapshots = this.snapshots;
    report.growth = growthFigures(this.snapshots);
    writeAtomically(this.outputFile, report);
    this.log(`snapshot ${this.snapshots.length}: ${report.run.elapsedMs} ms, ` +
      `write ${report.write.succeeded}/${report.write.attempted}, ` +
      `read ${report.read.succeeded}/${report.read.attempted}, ` +
      `disk ${report.storage.diskBytes} B, raft ${report.storage.raftLogEntries}, ` +
      `mg ${report.storage.messageGroupLogEntries}, rss ${report.storage.rssBytes}`);
    return report;
  }

  async run() {
    this.log(`head ${this.head}; run directory ${this.runDir}`);
    this.cluster = await startInProcessThreeNodeCluster({runDir: this.runDir});
    this.log(`three nodes up; creating ${this.partitions.length} load tables`);
    for (const partition of this.partitions) {
      await createTableUntilReady(this.cluster.schemaEngine,
        `CREATE TABLE ${partition.tableName} ${TABLE_COLUMNS}`);
    }
    const readRate = this.options.opsPerSec * this.options.readShare;
    const writeRate = this.options.opsPerSec - readRate;
    this.startedAtMs = Date.now();
    this.writer = new PacedLoadStream({
      name: 'write', opsPerSec: writeRate, durationMs: this.options.durationMs,
      operation: (counter) => this.insert(counter),
    }).start();
    this.reader = new PacedLoadStream({
      name: 'read', opsPerSec: readRate, durationMs: this.options.durationMs,
      operation: (counter) => this.select(counter),
    }).start();
    this.snapshotTimer = setInterval(() => this.snapshot(),
      this.options.snapshotIntervalMs);
    await Promise.all([this.writer.waitComplete(), this.reader.waitComplete()]);
    if (!this.stopping) {
      this.endReason = STORAGE_LOAD_REPORT.END_REASON.COMPLETED;
    }
    await this.finish();
  }

  async finish() {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.snapshotTimer = null;
    this.snapshot();
    this.log(`report written: ${this.outputFile} (${this.endReason})`);
    const stop = this.cluster.stop();
    const cap = new Promise((resolve) =>
      setTimeout(resolve, DEFAULTS.STOP_TIMEOUT_MS).unref());
    await Promise.race([stop.catch(() => {}), cap]);
  }

  async stopOnSignal(signal) {
    if (this.stopping) return;
    this.stopping = true;
    this.endReason = STORAGE_LOAD_REPORT.END_REASON.SIGNAL;
    this.log(`${signal}: stopping the streams and writing the last snapshot`);
    this.writer?.stop();
    this.reader?.stop();
  }
}

async function main(argv) {
  refuseUnderProbe(HARNESS_NAME);
  const root = process.cwd();
  const options = parseArguments(argv);
  const scenario = new StorageLoadScenario(root, options);
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      scenario.stopOnSignal(signal).catch(() => {});
    });
  }
  try {
    await scenario.run();
    return 0;
  } catch (error) {
    scenario.error = String(error && error.stack || error);
    scenario.endReason = STORAGE_LOAD_REPORT.END_REASON.ERROR;
    scenario.log(`failed: ${scenario.error}`);
    if (scenario.cluster && scenario.writer) await scenario.finish();
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
  // The in-process nodes leave timers behind; the report is on disk.
  setTimeout(() => process.exit(code), 1000).unref();
});
