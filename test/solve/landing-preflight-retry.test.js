// canonicalImportGraphProblem transient-timeout retry (C7).
//
// A single ETIMEDOUT of the import-graph verify producer on a loaded machine
// is transient: the verify is retried exactly once, a second timeout reports
// both plainly, and any non-timeout failure reports immediately with no
// retry. The spawn implementation is injected so no producer ever runs.

import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  canonicalImportGraphProblem,
} from '../../scripts/solve/landing-preflight.js';

const REQUIRED_INPUTS = [
  'scripts/generate-global-owner-debt-inventory.js',
  'test-output/analysis/global-owner-debt-import-graph.json',
  'test/shards/impact-graph-seal.json',
];
const TIMEOUT_MS = 1234;

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-retry-'));
  for (const relative of REQUIRED_INPUTS) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, '{}\n');
  }
  return root;
}

function timedOutResult() {
  const error = new Error('spawnSync /usr/bin/node ETIMEDOUT');
  error.code = 'ETIMEDOUT';
  return {status: null, signal: 'SIGKILL', stdout: '', stderr: '', error};
}

function spawnScript(results, calls) {
  return (executable, spawnArguments, options) => {
    calls.push({executable, spawnArguments, options});
    return results.shift();
  };
}

tap.test('a second timeout reports both timeouts after exactly one retry', (t) => {
  const root = fixtureRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const calls = [];
  const spawn = spawnScript([timedOutResult(), timedOutResult()], calls);
  const problem = canonicalImportGraphProblem(root, TIMEOUT_MS, spawn);
  t.equal(calls.length, 2, 'the verify is retried exactly once');
  t.match(problem, /timed out twice/u, 'both timeouts are reported');
  t.match(problem, /1234/u, 'the timeout budget is named');
  t.end();
});

tap.test('a transient timeout followed by a real failure reports the failure',
  (t) => {
    const root = fixtureRoot();
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    const calls = [];
    const spawn = spawnScript([
      timedOutResult(),
      {status: 1, signal: null, stdout: '', stderr: 'seal digest mismatch'},
    ], calls);
    const problem = canonicalImportGraphProblem(root, TIMEOUT_MS, spawn);
    t.equal(calls.length, 2, 'the retry ran');
    t.match(problem, /seal digest mismatch/u,
      'the retry outcome is reported verbatim');
    t.end();
  });

tap.test('a non-timeout failure is never retried', (t) => {
  const root = fixtureRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const calls = [];
  const spawn = spawnScript([
    {status: 1, signal: null, stdout: '', stderr: 'graph is stale'},
  ], calls);
  const problem = canonicalImportGraphProblem(root, TIMEOUT_MS, spawn);
  t.equal(calls.length, 1, 'no retry for a deterministic failure');
  t.match(problem, /graph is stale/u);
  t.end();
});
