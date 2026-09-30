#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'critical-spread-overflow-budget-audit';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const SETS_TEST = 'test/rebalancer/overflow-budget-partition-sets.test.js';
const GRID_TEST = 'test/partition/overflow-budget-admitted-case-grid.test.js';
const CENSUS_TEST =
  'test/rebalancer/overflow-budget-add-like-producer-census.test.js';
const ROUTES_TEST =
  'test/rebalancer/overflow-budget-mintable-five-routes.test.js';
// The unmintable partitions are audited on the REAL promotion guard, over the
// exhaustive grid the proved-unreachable rows state as their domain.
const GUARD_TEST =
  'test/partition/overflow-budget-unmintable-partitions.test.js';
const REPLACE_TEST =
  'test/rebalancer/overflow-budget-unhealthy-source-replace.test.js';
const EPOCH_CENSUS_TEST =
  'test/rebalancer/membership-epoch-domain-census.test.js';
const EPOCH_DIVERGENCE_TEST =
  'test/control-plane/membership-epoch-reader-divergence.test.js';
const FUTURE_TEST =
  'test/rebalancer/spread-cure-authorization-future-transition.test.js';
const DETAILS_TEST =
  'test/rebalancer/overflow-budget-carried-forward-details.test.js';
const MATRIX_TEST = 'test/rebalancer/overflow-budget-matrix-validator.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['critical-and-mintable-partition-sets-measured', SETS_TEST,
    '^the guard\'s bootstrap-critical set and the mintable subset are measured$',
    'both predicates over every system-table partition, the owner\'s seven ' +
      'and the measured remainder, pinned so a change turns this red'],
  ['budget-admitted-cases-enumerated-by-state-grid', GRID_TEST,
    '^every budget-admitted state grid row maps to exactly one admission class$',
    'the real count check and the real priority-recovery completion owner ' +
      'over an exhaustive grid; admitted with the budget, refused without it'],
  ['every-add-like-producer-is-in-the-matrix', CENSUS_TEST,
    '^every production producer of an add-like operation is in the matrix$',
    'a census of the createOperation callers, the move producers and the ' +
      'provisioning path, crossed with the partition classes'],
  ['mintable-five-have-no-unminted-route-or-it-is-a-row', ROUTES_TEST,
    '^every alternate route to the five carries the mint or is a matrix row$',
    'alternate planners, follow-ups, recovery and coordinator entry points, ' +
      'the ESTABLISHING window and the operation-less promotion'],
  ['every-unmintable-partition-is-audited', GUARD_TEST,
    '^every unmintable admitted partition is audited on the real guard$',
    'the owner\'s seven one row each and the remainder by demonstrated ' +
      'identity, with the budget forced to zero in a completion-owner double'],
  ['unhealthy-source-replace-traced-and-classified', REPLACE_TEST,
    '^the priority-recovery relocation REPLACE is traced end to end and classified$',
    'the real follow-up builder, the real coordinator creation and the real ' +
      'guard; the condition named truthfully, the chain, the censuses and ' +
      'the classification'],
  ['epoch-domain-inventory-is-complete-by-census', EPOCH_CENSUS_TEST,
    '^the membership-publication-epoch census matches the inventory exactly$',
    'a pattern that matches observedMembershipEpoch and every other alias, ' +
      'failing on any src entry the inventory does not carry'],
  ['epoch-reader-divergence-reproduced-on-real-owners', EPOCH_DIVERGENCE_TEST,
    '^the two epoch readers diverge on real owners over the stated row sets$',
    'the readiness service and the publication coordinator reads, each ' +
      'returned value asserted'],
  ['future-honoured-transition-and-its-falsifiers-pinned', FUTURE_TEST,
    '^the future honoured transition and its seven falsifiers are pinned$',
    'against the landed evaluation with a supplied epoch; a falsifier the ' +
      'evaluation does not refuse is recorded as a gate finding'],
  ['only-honoured-can-grant', FUTURE_TEST,
    '^a grant rule that maps any outcome but honoured to grant is caught$',
    'the mutant-style falsifier the enforce quest inherits'],
  ['carried-forward-details-settled-as-findings', DETAILS_TEST,
    '^the partition-row read, the row type and the authorized count are settled$',
    'one test-backed finding each, on the real mint, planner and evaluation'],
  ['matrix-and-gate-are-complete-and-in-sync', MATRIX_TEST,
    '^the matrix, the inventory and the gate are complete and in sync$',
    'fields, enums, witness forms, no frequency language, generated ' +
      'markdown, and gate items citing existing rows and tests'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
