/**
 * The participant-release-completion-contract-restoration probe adds no rule:
 * it prints the sealed completion audit's own violation count over a tree.
 * Over the real tree its count, listing and exit code agree from any working
 * directory. A planted caller that no file list names is counted exactly
 * once, and a tree the audit cannot read yields no number at all.
 */

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {runCompletionContractProbe} from
  '../../scripts/checks/participant-release-completion-contract-probe.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROBE = path.join(REPO_ROOT, 'scripts/checks/participant-release-completion-contract-probe.js');
const METRIC_FLAG = '--metric';
const ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const CONTRACT = 'participant_release_completion_contract';
const UNMEASURED = 'could not read its inputs';
const EXIT = Object.freeze({CLEAN: 0, VIOLATIONS: 1, UNMEASURED: 2});
const NUMBER_LINE = /^\d+$/u;
// The owner, both bounded-completion callers and the nested control route:
// the same four files the sealed audit test plants for a tree.
const CONTRACT_FILES = Object.freeze([
  'src/node/participant-release-client.js',
  'src/node/replica-handler-release-recovery.js',
  'src/bootstrap/bootstrap-service-seed-workflow.js',
  'src/node/replica-handler-participant-cutover.js',
]);
const UNNAMED_CALLER = 'src/node/planted-completion-caller.js';
const UNNAMED_CALLER_SOURCE = [
  'import {completeParticipantRelease} from \'./participant-release-client.js\';',
  '',
  'export function plantedCompletion(handler, request, clock) {',
  '  return completeParticipantRelease(handler, request, clock);',
  '}',
  '',
].join(LINE_SEPARATOR);

function lines(text) {
  return arrayFilter(stringSplit(text, LINE_SEPARATOR), Boolean);
}

function spawnProbe(args, cwd) {
  const result = spawnSync(process.execPath, [PROBE, ...args], {cwd, encoding: ENCODING});
  return {status: result.status, stdout: lines(result.stdout), stderr: result.stderr};
}

async function runInProcess(args, root) {
  const out = {stdout: '', stderr: ''};
  const status = await runCompletionContractProbe(args, root, {
    stdout: (text) => {
      out.stdout += text;
    },
    stderr: (text) => {
      out.stderr += text;
    },
  });
  return {status, stdout: lines(out.stdout), stderr: out.stderr};
}

async function plantTree(t, planted = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'completion-contract-probe-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const write = async (file, source) => {
    await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true});
    await fs.writeFile(path.join(root, file), source);
  };
  for (const file of CONTRACT_FILES) {
    await write(file, await fs.readFile(path.join(REPO_ROOT, file), ENCODING));
  }
  for (const [file, source] of planted) await write(file, source);
  return root;
}

function metricOf(run) {
  assert.ok(run.stdout.length > 0, 'the probe printed a measurement');
  const last = run.stdout[run.stdout.length - 1];
  assert.match(last, NUMBER_LINE, 'the last stdout line is the count');
  return Number(last);
}

function expectedExit(count) {
  return count === 0 ? EXIT.CLEAN : EXIT.VIOLATIONS;
}

test('over the real tree the count, the listing and the exit code agree from any directory',
  () => {
    const fromRoot = spawnProbe([METRIC_FLAG], REPO_ROOT);
    assert.equal(fromRoot.stdout.length, 1, '--metric prints the count alone');
    const count = metricOf(fromRoot);
    assert.equal(fromRoot.status, expectedExit(count));
    const outside = spawnProbe([METRIC_FLAG], os.tmpdir());
    assert.deepEqual(outside.stdout, fromRoot.stdout,
      'the audit reads the same tree whatever the working directory');
    assert.equal(outside.status, fromRoot.status);
    const listed = spawnProbe([], REPO_ROOT);
    assert.equal(metricOf(listed), count);
    const violations = arraySlice(listed.stdout, 0, -1);
    assert.equal(violations.length, count, 'one listed line per counted violation');
    assert.ok(arrayEvery(violations, (line) => stringStartsWith(line, 'src/') &&
      stringIncludes(line, ` ${CONTRACT}: `)), 'only the audit\'s own violations are listed');
  });

test('a planted caller that no file list names is counted exactly once', async (t) => {
  const base = await runInProcess([METRIC_FLAG], await plantTree(t));
  const baseCount = metricOf(base);
  assert.equal(base.status, expectedExit(baseCount));
  const planted = await runInProcess([], await plantTree(t,
    [[UNNAMED_CALLER, UNNAMED_CALLER_SOURCE]]));
  assert.equal(metricOf(planted), baseCount + 1);
  assert.equal(planted.status, EXIT.VIOLATIONS);
  assert.equal(arrayFilter(planted.stdout, (line) =>
    stringStartsWith(line, `${UNNAMED_CALLER} ${CONTRACT}: `)).length, 1,
  'the audit refuses the planted caller itself');
});

test('a tree the audit cannot read yields no number and a non-zero exit', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'completion-contract-probe-empty-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  for (const args of [[METRIC_FLAG], []]) {
    const run = await runInProcess(args, root);
    assert.equal(run.status, EXIT.UNMEASURED);
    assert.deepEqual(run.stdout, [], 'nothing is printed where solve reads the metric');
    assert.ok(stringIncludes(run.stderr, UNMEASURED), 'the refusal names its cause');
  }
});
