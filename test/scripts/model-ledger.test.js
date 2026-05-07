import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildLedgerRecord,
  buildRecommendation,
  buildSummary,
  parseCliArgs,
  readLedgerEntries,
  renderSummary,
  runCli,
} from '../../scripts/model-ledger.js';

const TEMP_DIR_PREFIX = 'model-ledger-';
const LEDGER_FILE_NAME = 'model-ledger.jsonl';
const TEST_PACKAGE_PATH =
  'work/packages/active-20260507-work-model-ledger-and-steering-policy.md';
const TEST_MODEL = 'gpt-5-codex';
const TEST_REASONING_EFFORT = 'medium';
const TEST_TASK_CLASS = 'workflow-tooling';
const TEST_OUTCOME = 'success';
const TEST_VALIDATION_STATUS = 'passed';
const TEST_CORRECTION_LOOPS = '0';
const TEST_REVIEW_FINDINGS = '0';
const TEST_NOTES = 'focused workflow package';
const TEST_RECORDED_AT = '2026-05-07T10:00:00.000Z';
const COMMAND_RECORD = 'record';
const COMMAND_SUMMARY = 'summary';
const FLAG_PACKAGE = '--package';
const FLAG_MODEL = '--model';
const FLAG_REASONING_EFFORT = '--reasoning-effort';
const FLAG_TASK_CLASS = '--task-class';
const FLAG_OUTCOME = '--outcome';
const FLAG_VALIDATION_STATUS = '--validation-status';
const FLAG_CORRECTION_LOOPS = '--correction-loops';
const FLAG_REVIEW_FINDINGS = '--review-findings';
const FLAG_NOTES = '--notes';
const FLAG_LEDGER = '--ledger';
const FLAG_RECENT = '--recent';
const SUMMARY_RECOMMEND_ESCALATE = 'Recommendation: escalate';
const SUMMARY_RECOMMEND_DEESCALATE = 'Recommendation: de-escalate';
const SUMMARY_RECOMMEND_HOLD = 'Recommendation: hold';
const SUMMARY_ENTRIES_EMPTY = 'No entries found.';
const SUMMARY_MODEL_COUNT = 'Models: gpt-5-codex=1';

async function makeTempLedgerPath() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  return path.join(directory, LEDGER_FILE_NAME);
}

function buildRecordArgs(ledgerPath) {
  return [
    COMMAND_RECORD,
    FLAG_PACKAGE,
    TEST_PACKAGE_PATH,
    FLAG_MODEL,
    TEST_MODEL,
    FLAG_REASONING_EFFORT,
    TEST_REASONING_EFFORT,
    FLAG_TASK_CLASS,
    TEST_TASK_CLASS,
    FLAG_OUTCOME,
    TEST_OUTCOME,
    FLAG_VALIDATION_STATUS,
    TEST_VALIDATION_STATUS,
    FLAG_CORRECTION_LOOPS,
    TEST_CORRECTION_LOOPS,
    FLAG_REVIEW_FINDINGS,
    TEST_REVIEW_FINDINGS,
    FLAG_NOTES,
    TEST_NOTES,
    FLAG_LEDGER,
    ledgerPath,
  ];
}

test('record command writes explicit JSONL entries', async (t) => {
  const ledgerPath = await makeTempLedgerPath();
  const output = await runCli(buildRecordArgs(ledgerPath));
  const entries = await readLedgerEntries(ledgerPath);

  t.equal(entries.length, 1);
  t.equal(entries[0].package, TEST_PACKAGE_PATH);
  t.equal(entries[0].model, TEST_MODEL);
  t.equal(entries[0].reasoningEffort, TEST_REASONING_EFFORT);
  t.equal(entries[0].taskClass, TEST_TASK_CLASS);
  t.equal(entries[0].outcome, TEST_OUTCOME);
  t.equal(entries[0].validationStatus, TEST_VALIDATION_STATUS);
  t.equal(entries[0].correctionLoops, 0);
  t.equal(entries[0].reviewFindings, 0);
  t.equal(entries[0].notes, TEST_NOTES);
  t.match(output, TEST_MODEL);
});

test('record builder requires explicit package and proof flags', (t) => {
  const args = buildRecordArgs('work/model-ledger.jsonl');
  const parsed = parseCliArgs(args);

  t.equal(parsed.command, COMMAND_RECORD);
  t.throws(
    () => buildLedgerRecord({
      ...parsed.flags,
      'validation-status': '',
    }, TEST_RECORDED_AT),
    /Missing required record flags/u,
  );
  t.throws(
    () => buildLedgerRecord({
      ...parsed.flags,
      'correction-loops': '-1',
    }, TEST_RECORDED_AT),
    /correctionLoops must be a non-negative integer/u,
  );
  t.end();
});

test('summary command renders aggregates and hold on empty evidence',
  async (t) => {
    const ledgerPath = await makeTempLedgerPath();
    const output = await runCli([COMMAND_SUMMARY, FLAG_LEDGER, ledgerPath]);

    t.match(output, SUMMARY_ENTRIES_EMPTY);
    t.match(output, SUMMARY_RECOMMEND_HOLD);
  });

test('summary rejects a zero recent-entry window', async (t) => {
  const ledgerPath = await makeTempLedgerPath();

  await t.rejects(
    runCli([
      COMMAND_SUMMARY,
      FLAG_LEDGER,
      ledgerPath,
      FLAG_RECENT,
      '0',
    ]),
    /recent must be a positive integer/u,
  );
});

test('summary recommends escalation for recent failed proof', (t) => {
  const summary = buildSummary([
    {
      model: TEST_MODEL,
      reasoningEffort: TEST_REASONING_EFFORT,
      taskClass: TEST_TASK_CLASS,
      outcome: 'partial',
      validationStatus: 'failed',
      correctionLoops: 2,
      reviewFindings: 1,
    },
  ]);
  const rendered = renderSummary(summary, 'work/model-ledger.jsonl');

  t.match(rendered, SUMMARY_MODEL_COUNT);
  t.match(rendered, SUMMARY_RECOMMEND_ESCALATE);
  t.end();
});

test('summary recommends de-escalation after repeated clean high-effort work',
  (t) => {
    const cleanHighEffortEntries = [
      {
        model: TEST_MODEL,
        reasoningEffort: 'high',
        taskClass: TEST_TASK_CLASS,
        outcome: TEST_OUTCOME,
        validationStatus: TEST_VALIDATION_STATUS,
        correctionLoops: 0,
        reviewFindings: 0,
      },
      {
        model: TEST_MODEL,
        reasoningEffort: 'high',
        taskClass: TEST_TASK_CLASS,
        outcome: TEST_OUTCOME,
        validationStatus: TEST_VALIDATION_STATUS,
        correctionLoops: 0,
        reviewFindings: 0,
      },
      {
        model: TEST_MODEL,
        reasoningEffort: 'high',
        taskClass: TEST_TASK_CLASS,
        outcome: TEST_OUTCOME,
        validationStatus: TEST_VALIDATION_STATUS,
        correctionLoops: 0,
        reviewFindings: 0,
      },
    ];

    t.same(
      buildRecommendation(cleanHighEffortEntries),
      {
        recommendation: 'de-escalate',
        reason: 'Recent high-effort entries are mostly clean with low correction load.',
      },
    );
    t.match(
      renderSummary(buildSummary(cleanHighEffortEntries), 'work/model-ledger.jsonl'),
      SUMMARY_RECOMMEND_DEESCALATE,
    );
    t.end();
  });

test('summary treats xhigh as high effort for de-escalation signals', (t) => {
  const cleanExtraHighEffortEntries = [
    {
      model: TEST_MODEL,
      reasoningEffort: 'xhigh',
      taskClass: TEST_TASK_CLASS,
      outcome: TEST_OUTCOME,
      validationStatus: TEST_VALIDATION_STATUS,
      correctionLoops: 0,
      reviewFindings: 0,
    },
    {
      model: TEST_MODEL,
      reasoningEffort: 'xhigh',
      taskClass: TEST_TASK_CLASS,
      outcome: TEST_OUTCOME,
      validationStatus: TEST_VALIDATION_STATUS,
      correctionLoops: 0,
      reviewFindings: 0,
    },
    {
      model: TEST_MODEL,
      reasoningEffort: 'xhigh',
      taskClass: TEST_TASK_CLASS,
      outcome: TEST_OUTCOME,
      validationStatus: TEST_VALIDATION_STATUS,
      correctionLoops: 0,
      reviewFindings: 0,
    },
  ];

  t.equal(
    buildRecommendation(cleanExtraHighEffortEntries).recommendation,
    'de-escalate',
  );
  t.end();
});
