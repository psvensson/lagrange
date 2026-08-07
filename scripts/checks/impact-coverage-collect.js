#!/usr/bin/env node
// Observed-coverage edge generator (developer-velocity epic V4a).
//
// Runs each given test file under V8 coverage and records which production
// files it actually executed — the edges static imports cannot see (dynamic
// registration, DI, factories, plugin lookup, late-bound owners). The output
// snapshot carries the import-graph source digest as its freshness bound; a
// digest mismatch widens the proof cone instead of silently narrowing it.
//
// Usage:
//   node scripts/checks/impact-coverage-collect.js --out test/shards/impact-coverage.json <test files...>
//   node scripts/checks/impact-coverage-collect.js --shard <name>   (collect a curated shard)
//
// Full-universe collection is intentionally a periodic (nightly/release)
// operation, never a per-Quest cost.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  COVERAGE_SCHEMA_VERSION,
  ERR_NO_TEST_FILES,
  JSON_FILE_SUFFIX,
  TAP_NOT_OK,
  TAP_OK,
  IMPORT_GRAPH_PATH,
  PROOF_CONE_COVERAGE_PATH,
} from './impact-proof-cone-constants.js';

const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const UTF8_ENCODING = 'utf8';
const DIRECTORY_SEPARATOR = '/';
const FILE_URL_PREFIX = 'file://';
const SRC_PREFIX = 'src/';
const SCRIPTS_PREFIX = 'scripts/';
const TEST_PREFIX = 'test/';
const TEST_FILE_SUFFIX = '.test.js';
const OUT_FLAG = '--out';
const NEWLINE = '\n';
const SHARD_FLAG = '--shard';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function productionPathFromUrl(url) {
  if (!stringStartsWith(url, FILE_URL_PREFIX)) return null;
  const absolute = url.slice(FILE_URL_PREFIX.length);
  const relative = stringSplit(path.relative(root, absolute), path.sep).join(DIRECTORY_SEPARATOR);
  if (stringStartsWith(relative, SRC_PREFIX) ||
      stringStartsWith(relative, SCRIPTS_PREFIX) ||
      (stringStartsWith(relative, TEST_PREFIX) &&
       stringEndsWith(relative, TEST_FILE_SUFFIX))) {
    return relative;
  }
  return null;
}

export function coveredProductionFiles(coverageDir) {
  const covered = new Set();
  if (!fs.existsSync(coverageDir)) return covered;
  for (const entry of fs.readdirSync(coverageDir)) {
    if (!stringEndsWith(entry, JSON_FILE_SUFFIX)) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(coverageDir, entry), UTF8_ENCODING));
    } catch {
      continue;
    }
    for (const script of parsed.result || []) {
      const production = productionPathFromUrl(script.url || '');
      if (!production) continue;
      const executed = arraySome(script.functions || [], (fn) =>
        arraySome(fn.ranges || [], (range) => range.count > 0));
      if (executed) covered.add(production);
    }
  }
  return covered;
}

export function collectCoverageForTest(rootDir, testPath) {
  const coverageDir = fs.mkdtempSync(path.join(rootDir, 'test-output/.impact-coverage-'));
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(rootDir, testPath)],
      {
        cwd: rootDir,
        env: {...process.env, NODE_V8_COVERAGE: coverageDir},
        encoding: UTF8_ENCODING,
        timeout: 600000,
      });
    const covered = coveredProductionFiles(coverageDir);
    return {testPath, exitCode: result.status, covered: [...covered].sort()};
  } finally {
    fs.rmSync(coverageDir, {recursive: true, force: true});
  }
}

function sourceDigest(rootDir) {
  const graphPath = path.join(rootDir, IMPORT_GRAPH_PATH);
  if (!fs.existsSync(graphPath)) return null;
  const graph = JSON.parse(fs.readFileSync(graphPath, UTF8_ENCODING));
  return graph.sourceDigest || null;
}

function main() {
  const args = process.argv.slice(2);
  let outPath = PROOF_CONE_COVERAGE_PATH;
  const testFiles = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === OUT_FLAG) {
      outPath = args[index + 1];
      index += 1;
    } else if (args[index] === SHARD_FLAG) {
      const shardPath = path.join(root, 'test/shards', `${args[index + 1]}.txt`);
      const lines = stringSplit(fs.readFileSync(shardPath, UTF8_ENCODING), NEWLINE);
      for (const line of lines) {
        const trimmed = stringTrim(line);
        if (trimmed.length > 0) testFiles.push(trimmed);
      }
      index += 1;
    } else {
      testFiles.push(args[index]);
    }
  }
  if (testFiles.length === 0) {
    console.error(ERR_NO_TEST_FILES);
    process.exit(1);
  }
  const tests = {};
  for (const testPath of testFiles) {
    const result = collectCoverageForTest(root, testPath);
    tests[testPath] = result.covered;
    console.log(`${result.exitCode === 0 ? TAP_OK : TAP_NOT_OK} ${testPath}: ` +
      `${result.covered.length} production file(s)`);
  }
  const snapshot = {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    sourceDigest: sourceDigest(root),
    collectedAt: new Date().toISOString(),
    tests,
  };
  const target = path.join(root, outPath);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2));
  console.log(`wrote ${outPath}: ${testFiles.length} test(s), digest ${snapshot.sourceDigest}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
