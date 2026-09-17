#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'home-lab-cli-guideline-debt';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS = 'test/scripts/home-lab-cli-guidelines.test.js';
const PATH_JOINER = '/';
const STATIC_AUDITS_RECEIPT = Object.freeze({
  id: 'postpush-static-audits-green',
  command: 'node scripts/checks/run-static-audits.js',
  timeoutMs: 600000,
  detail: 'every post-push static audit passes, audit:guidelines included',
});
const SUBTEST_RECEIPT = Object.freeze([
  ['lab-cli-literal-guideline-clean', WITNESS,
    '^the lab CLI carries no raw literal outside a named constant owner$',
    'check-guideline-literals reports zero new violations over scripts/lab'],
  ['lab-cli-decision-boundaries-clean', WITNESS,
    '^the lab CLI decides each outcome at one boundary$',
    'check-guideline-decision-boundaries reports zero new violations over scripts/lab'],
  ['lab-cli-command-surface-intact', WITNESS,
    '^the lab CLI still states its command surface and refuses an unknown command$',
    'usage and the unknown-command refusal are unchanged by the constant owners'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    ...SUBTEST_RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
      Object.freeze({id, testFile, testNamePattern, detail})),
    STATIC_AUDITS_RECEIPT,
  ]),
});
