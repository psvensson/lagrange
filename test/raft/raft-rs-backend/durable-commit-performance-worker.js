#!/usr/bin/env node
// The process isolated storage boundary used by the durability performance
// evidence. It deliberately contains no assertions or policy: the calling
// test runs these exact bytes on the predecessor and durability commits,
// including once under strace for real fsync/fdatasync counts.

import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {REPLICA_DB_PRAGMA} from
  '../../../src/storage/storage-constants.js';

const ARG = Object.freeze({
  DIRECTORY: '--directory',
  OPERATIONS: '--operations',
  OUTPUT: '--output',
  WARMUP: '--warmup',
});
const DEFAULT = Object.freeze({OPERATIONS: 300, WARMUP: 30});
const ENTRY_TYPE_NORMAL = 0;

function optionsOf(argv) {
  const options = {
    directory: null,
    operations: DEFAULT.OPERATIONS,
    output: null,
    warmup: DEFAULT.WARMUP,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === ARG.DIRECTORY) options.directory = value;
    else if (flag === ARG.OPERATIONS) options.operations = Number(value);
    else if (flag === ARG.OUTPUT) options.output = value;
    else if (flag === ARG.WARMUP) options.warmup = Number(value);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.directory || !options.output ||
      !Number.isInteger(options.operations) ||
      options.operations < 1 || !Number.isInteger(options.warmup) ||
      options.warmup < 0) {
    throw new Error('directory and positive integer operation counts required');
  }
  return options;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1)];
}

function ready(index) {
  return {
    mustSync: true,
    hardState: {term: '1', vote: '1', commit: String(index)},
    entries: [{
      index: String(index),
      term: '1',
      entryType: ENTRY_TYPE_NORMAL,
      data: Buffer.from(`small-write-${index}`).toString('base64'),
    }],
  };
}

function run() {
  const options = optionsOf(process.argv.slice(2));
  fs.mkdirSync(options.directory, {recursive: true});
  const file = path.join(options.directory, `persist-${process.pid}.sqlite`);
  const processStarted = performance.now();
  const db = new Database(file);
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  const store = new RaftRsDurableStore(db);
  let index = 1;
  for (let count = 0; count < options.warmup; count += 1) {
    store.persistReady('performance', ready(index));
    index += 1;
  }
  const latenciesMs = [];
  const measuredStarted = performance.now();
  for (let count = 0; count < options.operations; count += 1) {
    const started = performance.now();
    store.persistReady('performance', ready(index));
    latenciesMs.push(performance.now() - started);
    index += 1;
  }
  const measuredElapsedMs = performance.now() - measuredStarted;
  db.close();
  const sorted = [...latenciesMs].sort((left, right) => left - right);
  fs.writeFileSync(options.output, JSON.stringify({
    operations: options.operations,
    warmup: options.warmup,
    measuredElapsedMs,
    processElapsedMs: performance.now() - processStarted,
    opsPerSec: options.operations / (measuredElapsedMs / 1000),
    latencyMs: {
      p50: percentile(sorted, 0.50),
      p99: percentile(sorted, 0.99),
      max: sorted.at(-1) ?? 0,
    },
  }) + '\n');
}

run();
