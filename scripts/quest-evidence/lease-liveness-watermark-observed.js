#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'lease-liveness-watermark-observed';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WATERMARK_TEST =
  'test/admin/control-snapshot-stale-watermark-transitions.test.js';
const LEASE_TEST = 'test/control-plane/lease-sweep-skip-observability.test.js';
const OBSERVER_TEST =
  'test/diagnostics/admission-observer-ready-lease-witness.test.js';
const NEUTRALITY_TEST =
  'test/diagnostics/lease-liveness-decision-neutrality.test.js';
// Receipt 5 is only as good as the two files it reads, so the receipt binds
// their bytes too: the harness digests every declared `testFile`, and these
// two entries exist to put the grid module and the golden it compares
// against into that digest map. Their commands prove no claim beyond "this
// file is still the thing it says it is"; the claim itself is receipt 5's.
const DECISION_GRID_MODULE =
  'test/diagnostics/lease-liveness-decision-grid.js';
const DECISION_GRID_GOLDEN =
  'test/diagnostics/lease-liveness-decision-grid.golden.json';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['watermark-transition-names-node-and-lease-age', WATERMARK_TEST,
    '^the stale watermark logs set, node changed and cleared exactly once each$',
    'set names node, status, connection_state and leaseExpiredForMs; a new ' +
    'first match logs node changed; a renewal logs cleared with setForMs'],
  ['watermark-steady-state-logs-nothing', WATERMARK_TEST,
    '^an unchanged watermark state logs nothing across repeated evaluations$',
    'N evaluations in one state emit zero lines and report the suppressed count'],
  ['lease-skip-states-lease-age-and-skip-duration', LEASE_TEST,
    '^the skipped lease disconnect line states the lease age and the skip duration$',
    'leaseExpiredForMs and skippedForMs accumulate; disconnect or renewal resets'],
  ['observer-transition-carries-ready-lease-witness', OBSERVER_TEST,
    '^every admission observer transition records the ready-lease witness$',
    'each transition of the observation state carries the witness; the final ' +
    'snapshot is unchanged'],
  ['decisions-unchanged', NEUTRALITY_TEST,
    '^every decision on the grid matches the differential against main$',
    'watermark, observation state, repair trigger and tables, sweeper skip ' +
    'and disconnect decisions and observer classification match main'],
]);
const DIGEST_BINDING = Object.freeze([
  Object.freeze({
    id: 'decision-grid-module-parses',
    testFile: DECISION_GRID_MODULE,
    command: `node --check ${DECISION_GRID_MODULE}`,
    detail: 'binds the grid module\'s bytes to this receipt file',
  }),
  Object.freeze({
    id: 'decision-grid-golden-parses',
    testFile: DECISION_GRID_GOLDEN,
    command: `node -e ${JSON.stringify(
      'JSON.parse(require(\'fs\').readFileSync(\'' +
      DECISION_GRID_GOLDEN + '\',\'utf8\'))',
    )}`,
    detail: 'binds the golden\'s bytes to this receipt file',
  }),
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    ...RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
      Object.freeze({id, testFile, testNamePattern, detail})),
    ...DIGEST_BINDING,
  ]),
});
