// Deterministic evidence harness for the solver-friction-2026-09-06 quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact. Fill every testFile (a whole
// test file) or testNamePattern (an anchored ^...$ node:test name) before
// the receipt can pass; a placeholder receipt fails closed.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'F1-process-quest-declares-test-receipt-probe',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F1: .*$',
    detail: 'solve new declares test-receipt for a process quest, honours --probe and --required-receipt, and lint warns on a harness under a non-receipt probe',
  }),
  Object.freeze({
    id: 'F2-preflight-reports-stale-steering-pack',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F2: .*$',
    detail: 'preflight --full names every stale steering pack file from a scratch regeneration and never touches the tree',
  }),
  Object.freeze({
    id: 'F3-epic-planning-bound-at-lint-and-static-gate',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F3: .*$',
    detail: 'an over-bound version-2 epic is refused by quest lint through links.planDoc and named by the attempt static gate',
  }),
  Object.freeze({
    id: 'F4-package-json-model-evidence-only-for-model-changes',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F4: .*$',
    detail: 'package.json owes model evidence only when its diff touches a model-checking command',
  }),
  Object.freeze({
    id: 'F5-standing-rejection-waives-widen-scope-theory',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F5: .*$',
    detail: 'a standing candidate rejection waives the widen-scope theory demand at commit only',
  }),
  Object.freeze({
    id: 'F6-scope-pressure-ignores-deletions-and-generated-outputs',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F6: .*$',
    detail: 'deleted files and registered generated outputs do not count toward admission files, owners or bytes',
  }),
  Object.freeze({
    id: 'F7-comment-only-runtime-edit-not-runtime-scope',
    testFile: 'test/solve/solver-friction-2026-09-06.test.js',
    testNamePattern: '^F7: .*$',
    detail: 'a comment-only runtime section is admitted on a workflow quest; a code change on the same path is still refused',
  }),
  Object.freeze({
    id: 'F8-existing-gate-suites-green',
    testFile: 'test/solve/quest-lint.test.js',
    testNamePattern: null,
    detail: 'the gate suites the seven changes touch stay green',
  }),
]);

const QUEST_ID = 'solver-friction-2026-09-06';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'evidence', 'solver-friction-2026-09-06.receipt.json',
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(...OUTPUT_FILE_SEGMENTS),
  receipts: RECEIPTS,
});
