#!/usr/bin/env node
// Owner of the storage-load report contract and the probe that judges one.
//
// A storage-load report is what the in-process three-node load scenario
// (test/storage-load/run-storage-load.js) writes: measured write and read
// figures, the storage footprint at every snapshot, and the growth rates
// derived from those snapshots. This module says which fields a report must
// carry; the scenario imports the vocabulary from here and never restates it.
//
// The probe reads a file and prints one number (R27): the count of contract
// problems, 0 when the report is complete. It never starts a cluster.
//
//   node scripts/checks/storage-load-report.js [<report path>]
//       [--key-type string|integer]
//   node scripts/checks/storage-load-report.js --epic [<directory>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const arrayJoin = Function.call.bind(Array.prototype.join);

const HOUR_MS = 3600000;
const SOAK_HOURS = 24;
const HEAD_MIN_LENGTH = 7;
const THREE_NODES = 3;
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const UTF8 = 'utf8';
const NEWLINE = '\n';
const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';
const DOT = '.';
const ARGUMENT_PREFIX = '--';
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const DETAIL_OPEN = ' (';
const DETAIL_CLOSE = ')';

const STORAGE_LOAD_REPORT = Object.freeze({
  SCHEMA: 'storage-load-report/1',
  TOPOLOGY_IN_PROCESS_THREE_NODE: 'in-process-three-node',
  KEY_TYPE: Object.freeze({STRING: 'string', INTEGER: 'integer'}),
  END_REASON: Object.freeze({
    COMPLETED: 'completed',
    SIGNAL: 'signal',
    SNAPSHOT: 'snapshot',
    ERROR: 'error',
  }),
  DIRECTORY: 'data/storage-load',
  STRING_REPORT: 'data/storage-load/latest.json',
  INTEGER_REPORT: 'data/storage-load/latest-integer.json',
  SOAK_REPORT: 'data/storage-load/soak.json',
  SOAK_MIN_COVERAGE_MS: SOAK_HOURS * HOUR_MS,
  MIN_SNAPSHOTS: TWO,
});

const KEY_TYPES = Object.freeze(Object.values(STORAGE_LOAD_REPORT.KEY_TYPE));
const END_REASONS = Object.freeze(Object.values(STORAGE_LOAD_REPORT.END_REASON));

const FIELD = Object.freeze({
  SCHEMA: 'schema',
  RUN: 'run',
  HEAD: 'run.head',
  STARTED_AT: 'run.startedAt',
  KEY_TYPE: 'run.keyType',
  TOPOLOGY: 'run.topology',
  NODE_COUNT: 'run.nodeCount',
  DURATION_MS: 'run.durationMs',
  ELAPSED_MS: 'run.elapsedMs',
  SNAPSHOT_INTERVAL_MS: 'run.snapshotIntervalMs',
  OPS_PER_SEC: 'run.opsPerSec',
  END_REASON: 'run.endReason',
  WRITE: 'write',
  READ: 'read',
  ATTEMPTED: 'attempted',
  SUCCEEDED: 'succeeded',
  FIGURE_OPS_PER_SEC: 'opsPerSec',
  LATENCY_P50: 'latencyMs.p50',
  LATENCY_P99: 'latencyMs.p99',
  STORAGE: 'storage',
  DISK_BYTES: 'diskBytes',
  RAFT_LOG_ENTRIES: 'raftLogEntries',
  RAFT_LOG_COMMAND_BYTES: 'raftLogCommandBytes',
  MESSAGE_GROUP_LOG_ENTRIES: 'messageGroupLogEntries',
  RSS_BYTES: 'rssBytes',
  SNAPSHOTS: 'snapshots',
  SNAPSHOT_ELAPSED_MS: 'elapsedMs',
  GROWTH: 'growth',
  GROWTH_DISK: 'growth.diskBytesPerHour',
  GROWTH_RAFT: 'growth.raftLogEntriesPerHour',
  GROWTH_MESSAGE_GROUP: 'growth.messageGroupLogEntriesPerHour',
  BOUND: 'bound',
  PARTITIONS: 'partitions',
  PARTITION_TABLE: 'tableName',
});

const STORAGE_FIELDS = Object.freeze([
  FIELD.DISK_BYTES,
  FIELD.RAFT_LOG_ENTRIES,
  FIELD.RAFT_LOG_COMMAND_BYTES,
  FIELD.MESSAGE_GROUP_LOG_ENTRIES,
  FIELD.RSS_BYTES,
]);
const FIGURE_FIELDS = Object.freeze([
  FIELD.ATTEMPTED,
  FIELD.SUCCEEDED,
  FIELD.FIGURE_OPS_PER_SEC,
  FIELD.LATENCY_P50,
  FIELD.LATENCY_P99,
]);
const GROWTH_FIELDS = Object.freeze([
  FIELD.GROWTH_DISK,
  FIELD.GROWTH_RAFT,
  FIELD.GROWTH_MESSAGE_GROUP,
]);

const PROBLEM = Object.freeze({
  MISSING_FILE: 'report missing: ',
  UNREADABLE: 'report unreadable: ',
  SCHEMA: 'schema must be ' + STORAGE_LOAD_REPORT.SCHEMA,
  NOT_OBJECT: ' must be an object',
  NOT_FINITE: ' must be a finite non-negative number',
  NOT_POSITIVE: ' must be a positive number',
  NOT_STRING: ' must be a non-empty string',
  HEAD_SHORT: 'run.head must name a commit',
  KEY_TYPE: 'run.keyType must be one of ' + arrayJoin(KEY_TYPES, ', '),
  KEY_TYPE_EXPECTED: 'run.keyType must be ',
  TOPOLOGY: 'run.topology must be ' +
    STORAGE_LOAD_REPORT.TOPOLOGY_IN_PROCESS_THREE_NODE,
  NODE_COUNT: 'run.nodeCount must be ' + THREE_NODES,
  END_REASON: 'run.endReason must be one of ' + arrayJoin(END_REASONS, ', '),
  NO_WORK: ' must record at least one succeeded operation',
  SNAPSHOTS_FEW: 'snapshots must hold at least ' +
    STORAGE_LOAD_REPORT.MIN_SNAPSHOTS + ' entries',
  SNAPSHOT_PREFIX: 'snapshots.',
  SNAPSHOT_SUFFIX: '.',
  PARTITIONS_EMPTY: 'partitions must hold at least one entry',
  PARTITION_PREFIX: 'partitions.',
  SOAK_COVERAGE: 'soak run.elapsedMs must cover ' + SOAK_HOURS + ' hours',
  BOUND: 'bound must name the landed message-group log bound',
});

const CLI = Object.freeze({
  KEY_TYPE: '--key-type',
  EPIC: '--epic',
  METRIC: '--metric',
});

function readAt(object, dottedPath) {
  let current = object;
  const parts = stringSplit(dottedPath, DOT);
  for (let index = ZERO; index < parts.length; index += ONE) {
    if (current === null || typeof current !== TYPE_OBJECT) return undefined;
    current = current[parts[index]];
  }
  return current;
}

function isFiniteNonNegative(value) {
  return typeof value === TYPE_NUMBER && Number.isFinite(value) && value >= ZERO;
}

function isPositive(value) {
  return typeof value === TYPE_NUMBER && Number.isFinite(value) && value > ZERO;
}

function isNonEmptyString(value) {
  return typeof value === TYPE_STRING && value.length > ZERO;
}

function requireObject(problems, report, dottedPath) {
  const value = readAt(report, dottedPath);
  if (value === null || typeof value !== TYPE_OBJECT || Array.isArray(value)) {
    problems.push(dottedPath + PROBLEM.NOT_OBJECT);
    return false;
  }
  return true;
}

function requireFinite(problems, report, dottedPath) {
  if (!isFiniteNonNegative(readAt(report, dottedPath))) {
    problems.push(dottedPath + PROBLEM.NOT_FINITE);
  }
}

function requirePositive(problems, report, dottedPath) {
  if (!isPositive(readAt(report, dottedPath))) {
    problems.push(dottedPath + PROBLEM.NOT_POSITIVE);
  }
}

function requireString(problems, report, dottedPath) {
  if (!isNonEmptyString(readAt(report, dottedPath))) {
    problems.push(dottedPath + PROBLEM.NOT_STRING);
  }
}

function judgeRun(problems, report, expectedKeyType) {
  if (!requireObject(problems, report, FIELD.RUN)) return;
  const head = readAt(report, FIELD.HEAD);
  if (!isNonEmptyString(head) || head.length < HEAD_MIN_LENGTH) {
    problems.push(PROBLEM.HEAD_SHORT);
  }
  requireString(problems, report, FIELD.STARTED_AT);
  const keyType = readAt(report, FIELD.KEY_TYPE);
  if (!arrayIncludes(KEY_TYPES, keyType)) {
    problems.push(PROBLEM.KEY_TYPE);
  } else if (expectedKeyType && keyType !== expectedKeyType) {
    problems.push(PROBLEM.KEY_TYPE_EXPECTED + expectedKeyType);
  }
  if (readAt(report, FIELD.TOPOLOGY) !==
      STORAGE_LOAD_REPORT.TOPOLOGY_IN_PROCESS_THREE_NODE) {
    problems.push(PROBLEM.TOPOLOGY);
  }
  if (readAt(report, FIELD.NODE_COUNT) !== THREE_NODES) {
    problems.push(PROBLEM.NODE_COUNT);
  }
  requirePositive(problems, report, FIELD.DURATION_MS);
  requirePositive(problems, report, FIELD.ELAPSED_MS);
  requirePositive(problems, report, FIELD.SNAPSHOT_INTERVAL_MS);
  requirePositive(problems, report, FIELD.OPS_PER_SEC);
  if (!arrayIncludes(END_REASONS, readAt(report, FIELD.END_REASON))) {
    problems.push(PROBLEM.END_REASON);
  }
}

function judgeFigure(problems, report, figureField) {
  if (!requireObject(problems, report, figureField)) return;
  for (let index = ZERO; index < FIGURE_FIELDS.length; index += ONE) {
    requireFinite(problems, report, figureField + DOT + FIGURE_FIELDS[index]);
  }
  if (!isPositive(readAt(report, figureField + DOT + FIELD.SUCCEEDED))) {
    problems.push(figureField + PROBLEM.NO_WORK);
  }
}

function judgeStorage(problems, report, prefix) {
  if (!requireObject(problems, report, prefix)) return;
  for (let index = ZERO; index < STORAGE_FIELDS.length; index += ONE) {
    requireFinite(problems, report, prefix + DOT + STORAGE_FIELDS[index]);
  }
}

function judgeSnapshots(problems, report) {
  const snapshots = readAt(report, FIELD.SNAPSHOTS);
  if (!Array.isArray(snapshots) ||
      snapshots.length < STORAGE_LOAD_REPORT.MIN_SNAPSHOTS) {
    problems.push(PROBLEM.SNAPSHOTS_FEW);
    return;
  }
  for (let index = ZERO; index < snapshots.length; index += ONE) {
    const prefix = PROBLEM.SNAPSHOT_PREFIX + index + PROBLEM.SNAPSHOT_SUFFIX;
    requireFinite(problems, report,
      prefix + FIELD.SNAPSHOT_ELAPSED_MS);
    judgeStorage(problems, report, prefix + FIELD.STORAGE);
  }
}

function judgePartitions(problems, report) {
  const partitions = readAt(report, FIELD.PARTITIONS);
  if (!Array.isArray(partitions) || partitions.length === ZERO) {
    problems.push(PROBLEM.PARTITIONS_EMPTY);
    return;
  }
  for (let index = ZERO; index < partitions.length; index += ONE) {
    const prefix = PROBLEM.PARTITION_PREFIX + index + PROBLEM.SNAPSHOT_SUFFIX;
    requireString(problems, report, prefix + FIELD.PARTITION_TABLE);
    judgeFigure(problems, report, prefix + FIELD.WRITE);
    judgeFigure(problems, report, prefix + FIELD.READ);
  }
}

function judgeGrowth(problems, report) {
  if (!requireObject(problems, report, FIELD.GROWTH)) return;
  for (let index = ZERO; index < GROWTH_FIELDS.length; index += ONE) {
    const value = readAt(report, GROWTH_FIELDS[index]);
    if (typeof value !== TYPE_NUMBER || !Number.isFinite(value)) {
      problems.push(GROWTH_FIELDS[index] + PROBLEM.NOT_FINITE);
    }
  }
}

/**
 * Judge one storage-load report against the contract.
 * @param {Object} report - Parsed report.
 * @param {Object} [options]
 * @param {string} [options.keyType] - Expected key type, when the caller
 *   asks for one.
 * @return {{problems: string[]}}
 */
function judgeStorageLoadReport(report, options = {}) {
  const problems = [];
  if (report === null || typeof report !== TYPE_OBJECT) {
    return {problems: [FIELD.SCHEMA + PROBLEM.NOT_OBJECT]};
  }
  if (report[FIELD.SCHEMA] !== STORAGE_LOAD_REPORT.SCHEMA) {
    problems.push(PROBLEM.SCHEMA);
  }
  judgeRun(problems, report, options.keyType || null);
  judgeFigure(problems, report, FIELD.WRITE);
  judgeFigure(problems, report, FIELD.READ);
  judgePartitions(problems, report);
  judgeStorage(problems, report, FIELD.STORAGE);
  judgeSnapshots(problems, report);
  judgeGrowth(problems, report);
  return {problems};
}

function judgeSoakReport(report) {
  const {problems} = judgeStorageLoadReport(report);
  if (problems.length > ZERO) return {problems};
  if (readAt(report, FIELD.ELAPSED_MS) <
      STORAGE_LOAD_REPORT.SOAK_MIN_COVERAGE_MS) {
    problems.push(PROBLEM.SOAK_COVERAGE);
  }
  if (!isNonEmptyString(readAt(report, FIELD.BOUND))) {
    problems.push(PROBLEM.BOUND);
  }
  return {problems};
}

function readReportFile(root, relativePath) {
  const file = path.resolve(root, relativePath);
  if (!fs.existsSync(file)) {
    return {report: null, problems: [PROBLEM.MISSING_FILE + relativePath]};
  }
  try {
    return {report: JSON.parse(fs.readFileSync(file, UTF8)), problems: []};
  } catch (error) {
    return {
      report: null,
      problems: [PROBLEM.UNREADABLE + relativePath + DETAIL_OPEN +
        String(error && error.message) + DETAIL_CLOSE],
    };
  }
}

/**
 * Judge a report file. Missing or unreadable files are problems, not throws.
 * @param {string} root - Repository root.
 * @param {string} relativePath
 * @param {Object} [options] - judgeStorageLoadReport options.
 * @return {{problems: string[]}}
 */
function judgeStorageLoadReportFile(root, relativePath, options = {}) {
  const read = readReportFile(root, relativePath);
  if (read.report === null) return {problems: read.problems};
  return judgeStorageLoadReport(read.report, options);
}

/**
 * The epic's obligations: a string-keyed report, an integer-keyed report,
 * and a 24-hour soak report naming the landed message-group log bound.
 * @param {string} root
 * @param {string} directory - Report directory, relative to root.
 * @return {{problems: string[]}}
 */
function judgeStorageUnderLoadEpic(root, directory) {
  const problems = [];
  const stringReport = judgeStorageLoadReportFile(root,
    path.join(directory, path.basename(STORAGE_LOAD_REPORT.STRING_REPORT)),
    {keyType: STORAGE_LOAD_REPORT.KEY_TYPE.STRING});
  const integerReport = judgeStorageLoadReportFile(root,
    path.join(directory, path.basename(STORAGE_LOAD_REPORT.INTEGER_REPORT)),
    {keyType: STORAGE_LOAD_REPORT.KEY_TYPE.INTEGER});
  const soakRead = readReportFile(root,
    path.join(directory, path.basename(STORAGE_LOAD_REPORT.SOAK_REPORT)));
  const soakReport = soakRead.report === null ?
    {problems: soakRead.problems} :
    judgeSoakReport(soakRead.report);
  problems.push(...stringReport.problems, ...integerReport.problems,
    ...soakReport.problems);
  return {problems};
}

function parseArguments(argv) {
  const parsed = {
    path: STORAGE_LOAD_REPORT.STRING_REPORT,
    keyType: null,
    epic: false,
  };
  for (let index = ZERO; index < argv.length; index += ONE) {
    const token = argv[index];
    if (token === CLI.KEY_TYPE) {
      parsed.keyType = argv[index + ONE] || null;
      index += ONE;
    } else if (token === CLI.EPIC) {
      parsed.epic = true;
      parsed.path = STORAGE_LOAD_REPORT.DIRECTORY;
    } else if (token === CLI.METRIC) {
      // The metric is always what this probe prints; the flag is accepted
      // so callers can say what they mean.
    } else if (!stringStartsWith(token, ARGUMENT_PREFIX)) {
      parsed.path = token;
    }
  }
  return parsed;
}

function main(argv) {
  const root = process.cwd();
  const parsed = parseArguments(argv);
  const verdict = parsed.epic ?
    judgeStorageUnderLoadEpic(root, parsed.path) :
    judgeStorageLoadReportFile(root, parsed.path,
      parsed.keyType ? {keyType: parsed.keyType} : {});
  for (let index = ZERO; index < verdict.problems.length; index += ONE) {
    process.stderr.write(verdict.problems[index] + NEWLINE);
  }
  process.stdout.write(String(verdict.problems.length) + NEWLINE);
  return verdict.problems.length === ZERO ? EXIT_GREEN : EXIT_RED;
}

if (process.argv[ONE] &&
    path.resolve(process.argv[ONE]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(TWO));
}

export {
  FIELD,
  STORAGE_LOAD_REPORT,
  judgeStorageLoadReport,
  judgeStorageLoadReportFile,
  judgeStorageUnderLoadEpic,
  judgeSoakReport,
};
