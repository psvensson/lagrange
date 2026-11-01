#!/usr/bin/env node
// Load-generator CLI for one comparative-benchmark run. It executes on a
// provisioned lab/GCP worker from a repository checkout at the recorded
// harness commit (never inside a product image):
//
//   node test/distributed/harness/run-benchmark-workload.js \
//     --manifest <run-request.json> --out <records.ndjson>
//
// The manifest is the executeBenchmarkWorkload request (targetId, system,
// scenario, subkind, connection, plan, evidenceDir). One NDJSON record is
// appended to --out. Exit 0: executed or a typed non-execution (blocked /
// unsupported); exit 2: typed dispatch refusal; exit 1: harness error.
import {appendFile, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';

import {execGit} from '../../../scripts/checks/git-invocation.js';

import {
  isBenchmarkDispatchRefusal,
} from './benchmark-workload-dispatch.js';
import {
  executeBenchmarkWorkload,
} from './real-product-workload-drivers.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const EXIT = Object.freeze({OK: 0, HARNESS_ERROR: 1, REFUSED: 2});
const FLAG = Object.freeze({MANIFEST: '--manifest', OUT: '--out'});
const REFUSED_RECORD_KIND = 'benchmark-dispatch-refused';
const NATIVE_CLIENT_PACKAGES = Object.freeze(['pg', 'mysql2']);
const requireFromHere = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (flag !== FLAG.MANIFEST && flag !== FLAG.OUT) {
      throw new Error(`unknown argument ${flag}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    args[flag] = value;
  }
  if (!args[FLAG.MANIFEST] || !args[FLAG.OUT]) {
    throw new Error('usage: run-benchmark-workload.js --manifest <json> --out <ndjson>');
  }
  return args;
}

const CHECKOUT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The harness checkout the load generator executes, read through the one
// git invocation owner: its commit and whether its tree is clean. A dirty
// checkout is a typed identity fact (`dirty: true`): the executed code is
// not the recorded commit, so the run cannot be valid-observed.
function observedCheckout() {
  try {
    const gitCommit = stringTrim(execGit(['rev-parse', 'HEAD'],
      {cwd: CHECKOUT_ROOT, encoding: 'utf8'}));
    const porcelain = execGit(['status', '--porcelain', '--untracked-files=all'],
      {cwd: CHECKOUT_ROOT, encoding: 'utf8'});
    const changedPaths = arrayFilter(stringSplit(porcelain, '\n'), (line) => line !== '');
    return {
      root: CHECKOUT_ROOT,
      gitCommit,
      dirty: changedPaths.length > 0,
      changedPaths,
      error: null,
    };
  } catch (error) {
    return {root: CHECKOUT_ROOT, gitCommit: null, dirty: null, changedPaths: null,
      error: String(error?.message || error)};
  }
}

function packageVersion(name) {
  try {
    return {version: requireFromHere(`${name}/package.json`).version, error: null};
  } catch (error) {
    return {version: null, error: String(error?.message || error)};
  }
}

function loadGeneratorIdentity() {
  return Object.freeze({
    hostname: hostname(),
    nodeVersion: process.version,
    checkout: Object.freeze(observedCheckout()),
    nativeClients: Object.freeze(Object.fromEntries(
      arrayMap(NATIVE_CLIENT_PACKAGES, (name) => [name, packageVersion(name)]))),
  });
}

async function main(argv) {
  const args = parseArgs(argv);
  const request = JSON.parse(await readFile(args[FLAG.MANIFEST], 'utf8'));
  const loadGenerator = loadGeneratorIdentity();
  let record;
  let exitCode = EXIT.OK;
  try {
    record = {...await executeBenchmarkWorkload(request), loadGenerator};
  } catch (error) {
    if (!isBenchmarkDispatchRefusal(error)) throw error;
    record = {recordKind: REFUSED_RECORD_KIND, dispatch: error.dispatch,
      reason: error.message, loadGenerator};
    exitCode = EXIT.REFUSED;
  }
  await appendFile(args[FLAG.OUT], `${JSON.stringify(record)}\n`);
  return exitCode;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (error) => {
  process.stderr.write(`run-benchmark-workload: ${error?.stack || error}\n`);
  process.exitCode = EXIT.HARNESS_ERROR;
});
