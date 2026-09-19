#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'critical-spread-transition-authority-carry';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const AUTHORIZATION_TEST =
  'test/rebalancer/spread-cure-transition-authorization.test.js';
const ROW_TEST =
  'test/rebalancer/spread-cure-transition-authorization-row.test.js';
// The sibling of the row receipt: the same clause proven on the real
// planner -> coordinator -> row path rather than on one owner.
const PRODUCTION_PATH_TEST =
  'test/rebalancer/spread-cure-transition-authorization-production-path.test.js';
const GUARD_TEST = 'test/partition/learner-promotion-count-check-inputs.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['policy-mints-one-exact-transition', AUTHORIZATION_TEST,
    '^the cure policy mints one exact transition authorization$',
    'the mint states intent, row-decoded RF, observed epoch and voter count, ' +
      'the observed count plus one, and the destination node'],
  ['only-the-over-target-spread-cure-mints', AUTHORIZATION_TEST,
    '^only the priority over-target spread cure mints an authorization$',
    'expand, ledger expand, drain, REPLACE, follow-up and ordinary ' +
      'partitions carry no authorization'],
  ['authorization-rides-the-operation-row', ROW_TEST,
    '^the authorization rides the operation row and rows without it stay byte-identical to main$',
    'end to end through the real coordinator creation path, against frozen ' +
      'digests captured from main before any src edit'],
  ['authorization-rides-the-production-path', PRODUCTION_PATH_TEST,
    '^one authorization travels the real planner, coordinator and row$',
    'the same clause through the real rebalance cycle: one authorized move, ' +
      'request and row, and Object.hasOwn on every unauthorized one'],
  ['a-plan-that-reaches-no-cure-costs-mains-reads', PRODUCTION_PATH_TEST,
    '^a plan that reaches no cure costs exactly main\'s cache reads$',
    'per entity class, against main\'s own measured per-plan cache reads; ' +
      'only a plan that reaches the cure reads the policy row, once'],
  ['binding-decodes-present-absent-malformed-and-never-throws', AUTHORIZATION_TEST,
    '^the binding decodes present, absent and malformed and never throws$',
    'every malformed shape is named by type and bounded size, and nothing throws'],
  ['evaluation-names-each-refusal-reason', AUTHORIZATION_TEST,
    '^the evaluation names each refusal reason$',
    'absent, malformed, intent, operation, destination, desired RF, stale ' +
      'generation and honoured, one row each'],
  ['guard-states-the-authorization-it-read', GUARD_TEST,
    '^the guard states the authorization it read$',
    'countCheckInputs.authorization on the refusal line and the first-pass line'],
  ['decisions-unchanged', GUARD_TEST,
    '^an authorization on the row changes no count-check decision$',
    'the frozen oracle and the frozen guard-grid digest hold with valid, ' +
      'absent, stale, mismatched and malformed authorizations on the row'],
  ['owner-interaction-registered', AUTHORIZATION_TEST,
    '^the spread-cure transition authorization has a registered owner-interaction contract$',
    'the mint and consumer endpoints are a registered coupled pair'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
