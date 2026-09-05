// Deterministic evidence harness for the solver-streamlining-2026-09 process
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'P5-foreign-quest-bookkeeping-excluded-and-named',
    testFile: 'test/solve/solver-capture-foreign-bookkeeping-exclusion.test.js',
    detail: 'another declared quest\'s bookkeeping stays out of the attempt ' +
      'and is named on stdout; owners resolve by longest declared id; an ' +
      'undeclared owner is never foreign; a shared spec still refuses a ' +
      'product quest and the refusal names the path',
  }),
  Object.freeze({
    id: 'P8-stall-gate-excludes-verifier-demanded-replacements',
    testFile: 'test/solve/theory-stall-under-rejection.test.js',
    detail: 'attempts recorded under a standing candidate rejection do not ' +
      'count as stalls; ordinary flat attempts still do',
  }),
  Object.freeze({
    id: 'P7a-override-charged-only-by-the-recording-run',
    testFile: 'test/solve/override-run-consumption.test.js',
    detail: 'a run that bypasses one gate and stops at a later one leaves ' +
      'the override active; the recording run charges each bypass exactly ' +
      'once before its attempt; every blocked commit gate is reported in one ' +
      'pass with its override command',
  }),
  Object.freeze({
    id: 'P7a-gate-deferred-consumption',
    testFile: 'test/solve/gate.test.js',
    detail: 'deferred consumption is not charged when the run aborts; a ' +
      'flush charges exactly once; legacy callers consume immediately',
  }),
  Object.freeze({
    id: 'P4-finding-severity-fail-closed',
    testFile: 'test/solve/rejection-findings.test.js',
    detail: 'observations parse with their severity, never enter the bar ' +
      'accounting, and a rejection must carry at least one defect',
  }),
  Object.freeze({
    id: 'P4-verdict-file-severity',
    testFile: 'test/solve/landing-envelope-contract.test.js',
    detail: 'a verdict file may carry finding severity; an all-observation ' +
      'reject verdict is refused',
  }),
  Object.freeze({
    id: 'P4b-monotone-amendment-cap',
    testFile: 'test/solve/amend.test.js',
    detail: 'monotone amendments carry their own cap of four and never spend ' +
      'a correction',
  }),
  Object.freeze({
    id: 'P4-land-observations',
    testFile: 'test/solve/operator-workflow.test.js',
    detail: 'land records --finding as a defect and refuses a rejection ' +
      'carrying only observations',
  }),
  Object.freeze({
    id: 'P3-complexity-admission',
    testFile: 'test/solve/complexity-admission.test.js',
    detail: 'a function the candidate pushes over the complexity threshold ' +
      'blocks at seal; a pre-existing over-threshold function is tolerated',
  }),
  Object.freeze({
    id: 'P3-seal-gate-checkers',
    testFile: 'test/solve/static-gate.test.js',
    detail: 'silent-catch and decision-boundary checkers block with bounded ' +
      'output over the changed paths',
  }),
  Object.freeze({
    id: 'P3-preflight-full-publish-statics',
    testFile: 'test/solve/solver-preflight.test.js',
    detail: 'preflight --full runs the publish statics; the cheap run names ' +
      'the opt-in',
  }),
  Object.freeze({
    id: 'P7c-publish-data-fail-fast',
    testFile: 'test/scripts/publish-head.test.js',
    detail: 'publish prints the links it will make and fails fast when data/ ' +
      'is absent unless --allow-missing-data is passed',
  }),
  Object.freeze({
    id: 'P7b-load-headroom-before-import-graph-verify',
    testFile: 'test/scripts/wait-for-load-headroom.test.js',
    detail: 'the load gate waits, gives up after the bounded wait, and honours ' +
      'the skip env',
  }),
  Object.freeze({
    id: 'P7b-landing-preflight-consults-the-load-gate',
    testFile: 'test/solve/landing-preflight-retry.test.js',
    detail: 'the import-graph verify consults the load gate once before its ' +
      'first spawn and keeps its single retry',
  }),
  Object.freeze({
    id: 'P6a-subtest-receipts-fail-closed',
    testFile: 'test/solve/quest-evidence-harness-runtime.test.js',
    detail: 'a subtest receipt runs exactly one named node:test test and ' +
      'fails on zero selected tests, multiple tests, a failing test, or an ' +
      'unanchored pattern',
  }),
  Object.freeze({
    id: 'P6b-harness-scaffold',
    testFile: 'test/solve/harness-scaffold.test.js',
    detail: 'start scaffolds a fail-closed harness skeleton for a ' +
      'test-receipt quest, never overwrites, and lint warns while one is ' +
      'missing',
  }),
  Object.freeze({
    id: 'P2-rebase-epoch',
    testFile: 'test/solve/epoch-rebase.test.js',
    detail: 'rebase-epoch retires the epoch, demands a covering attempt at ' +
      'the new base, transfers a standing rejection to live-base coverage, ' +
      'and refuses every unsafe shape',
  }),
  Object.freeze({
    id: 'CLI-smoke-unchanged',
    testFile: 'test/solve/cli.test.js',
    detail: 'the solve CLI smoke suite stays green with severity on ' +
      'recorded findings',
  }),
]);

const QUEST_ID = 'solver-streamlining-2026-09';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'solver-streamlining-2026-09.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
