#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'public-binding-two-partition-harness';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const INTEGRATION_TEST =
  'test/integration/public-binding-cell-invocation-seam.integration.test.js';
const HARNESS_HELPER =
  'test/integration/helpers/public-binding-seam-harness.js';
const ARCHIVE_DIRECTORY =
  `solve/epics/raft-rs-full-cutover/quest-records/${QUEST_ID}`;
const RED_CONTROL_FILE = path.join(
  ARCHIVE_DIRECTORY, 'red-control-live-metrics-durable.json');
const POSITIVE_LOG =
  `test-output/reports/${QUEST_ID}.log`;
const POSITIVE_TAP = path.join(
  '.tap', 'test-results', `${INTEGRATION_TEST}.tap`);
const UTF8 = 'utf8';
const SHA256 = 'sha256';
const SHA_ENCODING = 'hex';
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const RUN_POSITIVE_FLAG = '--run-positive';
const VERIFY_POSITIVE_FLAG = '--verify-positive';
const VERIFY_NEGATIVE_FLAG = '--verify-negative';
const ARGUMENT_OFFSET = 2;
const RECEIPT_ARGUMENT_OFFSET = 3;
const SIGNAL_SEPARATOR = ' | ';
const POSITIVE_SUMMARY =
  '# test-files total=1 pass=1 fail=0 assertions=70';
const NEGATIVE_LABEL = 'controlled negative';
const CANONICAL_POLICY_RECEIPT_ID =
  'canonical-table-policy-visible-before-split';
const LIVE_METRICS_RECEIPT_ID =
  'live-child-pair-nonvacuous-and-merge-ineligible';
const EXACT_IDENTITIES_RECEIPT_ID = 'exact-two-child-identity-retained';
const FANOUT_RECEIPT_ID = 'literal-one-child-unbounded-two-child';
const NEGATIVE_RECEIPT_ID = 'policy-revert-control-red';
const CANONICAL_POLICY_DETAIL =
  'TablePolicyService persists and reads back the exact 1/1 policy';
const POSITIVE_DETAIL =
  'the single positive run contains every named owner assertion';
const NEGATIVE_DETAIL =
  'the restorable removal-only policy control is bound and red';
const TEST_COMMAND = Object.freeze([
  'run', 'test:file', '--', INTEGRATION_TEST,
]);

const POSITIVE_SIGNALS = Object.freeze({
  [CANONICAL_POLICY_RECEIPT_ID]: Object.freeze([
    'ok 1 - harness: the canonical merge-disabled policy is visible before split',
    'ok 2 - harness: the production manager consumes the same table policy',
  ]),
  [LIVE_METRICS_RECEIPT_ID]: Object.freeze([
    'ok 3 - harness: the production manager consumes both live leader sizes',
    'ok 4 - harness: the live child pair contains more than one byte',
    'ok 5 - harness: the production manager keeps the live children merge-ineligible',
  ]),
  [EXACT_IDENTITIES_RECEIPT_ID]: Object.freeze([
    'ok 6 - harness: both exact split children are current after shaping',
    'ok 10 - both exact split children remain current after Artifact installation',
    'ok 12 - both exact split children remain current after Binding deployment',
    'ok 18 - both exact split children remain current through the full exercise',
  ]),
  [FANOUT_RECEIPT_ID]: Object.freeze([
    'the published result snapshot witnesses exactly one shard',
    'harness evidence: the canonical planner plans the owning shard only',
    'the published result snapshot witnesses every shard',
    'the canonical planner fans out to both exact split children',
  ]),
});

function digestFile(file) {
  return createHash(SHA256).update(fs.readFileSync(file)).digest(SHA_ENCODING);
}

function requireSignals(output, signals, label) {
  const missing = signals.filter((signal) => !output.includes(signal));
  if (missing.length > 0) {
    throw new Error(`${label} is missing: ${missing.join(SIGNAL_SEPARATOR)}`);
  }
}

function runPositive() {
  const result = spawnSync('npm', TEST_COMMAND, {
    encoding: UTF8,
    env: process.env,
  });
  const runnerOutput = `${result.stdout || ''}${result.stderr || ''}`;
  const tapOutput = result.status === EXIT_OK && fs.existsSync(POSITIVE_TAP) ?
    fs.readFileSync(POSITIVE_TAP, UTF8) : '';
  const output = `${runnerOutput}${tapOutput}`;
  fs.mkdirSync(path.dirname(POSITIVE_LOG), {recursive: true});
  fs.writeFileSync(POSITIVE_LOG, output);
  process.stdout.write(output);
  process.exit(result.status ?? EXIT_FAILED);
}

function verifyPositive(receiptId) {
  const output = fs.readFileSync(POSITIVE_LOG, UTF8);
  requireSignals(output, [
    POSITIVE_SUMMARY,
    ...(POSITIVE_SIGNALS[receiptId] || []),
  ], receiptId);
}

function verifyNegative() {
  const control = JSON.parse(fs.readFileSync(RED_CONTROL_FILE, UTF8));
  for (const [file, expected] of Object.entries(control.candidate.files)) {
    if (digestFile(file) !== expected) {
      throw new Error(`candidate source hash mismatch: ${file}`);
    }
  }
  for (const [key, expected] of [
    [control.candidate.patch, control.candidate.patchSha256],
    [control.negative.patch, control.negative.patchSha256],
    [control.output.file, control.output.sha256],
  ]) {
    const file = path.join(ARCHIVE_DIRECTORY, key);
    if (digestFile(file) !== expected) {
      throw new Error(`archived red-control hash mismatch: ${file}`);
    }
  }
  const output = fs.readFileSync(
    path.join(ARCHIVE_DIRECTORY, control.output.file), UTF8);
  requireSignals(output, control.output.requiredSignals, NEGATIVE_LABEL);
}

const operation = process.argv[ARGUMENT_OFFSET];
if (operation === RUN_POSITIVE_FLAG) runPositive();
if (operation === VERIFY_POSITIVE_FLAG) {
  verifyPositive(process.argv[RECEIPT_ARGUMENT_OFFSET]);
  process.exit(EXIT_OK);
}
if (operation === VERIFY_NEGATIVE_FLAG) {
  verifyNegative();
  process.exit(EXIT_OK);
}

const script = 'node scripts/quest-evidence/public-binding-two-partition-harness.js';
const receiptIds = Object.keys(POSITIVE_SIGNALS);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: Object.freeze([
    Object.freeze({
      id: receiptIds[0],
      testFile: INTEGRATION_TEST,
      command: `${script} ${RUN_POSITIVE_FLAG}`,
      detail: CANONICAL_POLICY_DETAIL,
    }),
    ...receiptIds.slice(1).map((id) => Object.freeze({
      id,
      testFile: id === LIVE_METRICS_RECEIPT_ID ?
        HARNESS_HELPER : INTEGRATION_TEST,
      command: `${script} ${VERIFY_POSITIVE_FLAG} ${id}`,
      detail: POSITIVE_DETAIL,
    })),
    Object.freeze({
      id: NEGATIVE_RECEIPT_ID,
      testFile: RED_CONTROL_FILE,
      command: `${script} ${VERIFY_NEGATIVE_FLAG}`,
      detail: NEGATIVE_DETAIL,
    }),
  ]),
});
