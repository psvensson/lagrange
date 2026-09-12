#!/usr/bin/env node
// Probe for the lean-push-gate quest: how many push-gate surfaces are still in
// their pre-quest shape (0 = the lean push gate is in place). Structural on
// purpose - the behaviour is proved by the tests the safety spine carries.
//
//   node scripts/checks/lean-push-gate.js --metric

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const jsonParse = JSON.parse.bind(JSON);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const NEWLINE = '\n';
const POSTPUSH_MANIFEST =
  'test/manifests/project-hardening-proof-postpush-manifest.json';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const SAFETY_SPINE = 'test/shards/safety-spine.json';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const CANARY_WORKFLOW = '.github/workflows/full-corpus-canary.yml';
const SELECTOR = 'scripts/checks/change-selection.js';
const CHANGE_PROOF_SCRIPT = 'scripts/checks/push-gate-change-proof.js';
const CLOSURE_MODULE = 'helper-import-closure.js';
const CORPUS_SCRIPTS = Object.freeze(['test:fast', 'test:all']);
const SPINE_ADDITIONS = Object.freeze([
  'test/scripts/changed-paths.test.js',
  'test/scripts/change-selection-taxonomy.test.js',
  'test/scripts/publish-head.test.js',
  'test/scripts/helper-import-closure.test.js',
  'test/scripts/push-gate-change-proof.test.js',
]);
const HOOK_EXPORTS_BASE = /export LAGRANGE_CHECK_BASE=/u;
const HOOK_IN_PLACE_RATCHETS = /push-gate-corpus-worktree\.js --in-place/u;
const CI_PREPARES_GRAPH = /--refresh-import-graph-only/u;
const CANARY_RUNS_CORPUS = /npm run test:all/u;
const CANARY_SCHEDULED = /^\s*schedule:/mu;
const SELECTOR_IMPORTS_CLOSURE = /helper-import-closure\.js/u;

function read(relative) {
  try {
    return fs.readFileSync(path.join(root, relative), UTF8);
  } catch {
    return null;
  }
}

function manifestRunsChangeProof() {
  const text = read(POSTPUSH_MANIFEST);
  if (!text) return false;
  const commands = jsonParse(text).commands || [];
  const last = commands[commands.length - 1];
  return Boolean(last) && last.argv?.[0] === CHANGE_PROOF_SCRIPT &&
    arrayEvery(commands, (command) => !arraySome(command.argv || [],
      (argument) => arrayIncludes(CORPUS_SCRIPTS, argument)));
}

function spineCarriesAdditions() {
  const text = read(SAFETY_SPINE);
  if (!text) return false;
  const tests = jsonParse(text).tests || [];
  return arrayEvery(SPINE_ADDITIONS, (entry) => arrayIncludes(tests, entry));
}

function textMatches(relative, pattern) {
  const text = read(relative);
  return text !== null && regExpTest(pattern, text);
}

const CONDITIONS = Object.freeze([
  {id: 'postpush manifest runs the change proof, no corpus script',
    holds: manifestRunsChangeProof},
  {id: 'hook exports LAGRANGE_CHECK_BASE from the pushed ref',
    holds: () => textMatches(PRE_PUSH_HOOK, HOOK_EXPORTS_BASE)},
  {id: 'hook runs the corpus ratchets in place inside the exact-HEAD worktree',
    holds: () => textMatches(PRE_PUSH_HOOK, HOOK_IN_PLACE_RATCHETS)},
  {id: 'safety spine carries the gate machinery tests',
    holds: spineCarriesAdditions},
  {id: 'ci prepares the sealed import graph before the ordinary proof',
    holds: () => textMatches(CI_WORKFLOW, CI_PREPARES_GRAPH)},
  {id: 'full-corpus canary runs test:all on main without a schedule',
    holds: () => textMatches(CANARY_WORKFLOW, CANARY_RUNS_CORPUS) &&
      !textMatches(CANARY_WORKFLOW, CANARY_SCHEDULED)},
  {id: 'selector consults the helper import closure',
    holds: () => textMatches(SELECTOR, SELECTOR_IMPORTS_CLOSURE) &&
      read(path.join(path.dirname(SELECTOR), CLOSURE_MODULE)) !== null},
]);

const unmet = arrayFilter(CONDITIONS, (condition) => !condition.holds());
if (unmet.length > 0) {
  process.stderr.write(arrayJoin(arrayMap(unmet, (condition) =>
    `unmet: ${condition.id}`), NEWLINE) + NEWLINE);
}
process.stdout.write(`${unmet.length}${NEWLINE}`);
process.exitCode = unmet.length === 0 ? 0 : 1;
