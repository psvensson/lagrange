#!/usr/bin/env node
/**
 * Receipt harness for steering-diet. The numeric targets are proved by the
 * acceptance budget rather than counted by hand, and the architectural claims
 * (the inventory accounts for every line, rules route instead of restating,
 * representative tasks reach their owner) are proved by named scenarios.
 */

import {METRIC} from './checks/solve-v2-budget.js';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'steering-diet';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/steering-diet.test.js';
const PATH_JOINER = '/';
const BUDGET = 'node scripts/checks/solve-v2-budget.js --metric ';

const RECEIPT_ID = Object.freeze({
  INVENTORY: 'steering-inventory-accounts-for-every-line',
  RULES_COUNT: 'rules-md-holds-exactly-25-structural-rules',
  RULES_JSON: 'rules-json-is-absent',
  RETIRED_SURFACES: 'retired-v1-steering-surface-is-absent',
  ALWAYS_LOAD: 'always-load-transitive-path-within-360-lines',
  CORPUS: 'steering-corpus-within-3000-lines',
  RETIRED: 'no-current-steering-teaches-a-retired-verb',
  ROUTER: 'rules-route-to-owners-rather-than-restating-them',
  TASKS: 'representative-tasks-reach-their-owner-from-always-load',
});
const SCENARIO = Object.freeze({
  INVENTORY: '^the inventory is re-derived from the frozen baseline, not transcribed$',
  RETIRED: '^current steering refers only to registered solver operations$',
  ROUTER: '^a detail change at an owner does not require editing rules.md$',
  TASKS: '^each representative task reaches its owner from the always-load layer$',
});
const DETAIL = Object.freeze({
  INVENTORY: 'the corpus at the frozen baseline is enumerated from the ' +
    'baseline itself and every section is classified by responsibility ' +
    'before anything is edited, so deletions are decisions about ownership ' +
    'rather than about length and the accounting cannot be silent about a file',
  RULES_COUNT: 'rules.md holds exactly 25 structurally recognised rules',
  RULES_JSON: 'the generated rule corpus is gone: the sealed claim, proved ' +
    'by the broader measurement that covers it',
  RETIRED_SURFACES: 'the compiled rule corpus, its query CLI, the pack ' +
    'generator and the domain packs are all gone',
  ALWAYS_LOAD: 'the transitive always-load path, not one file, is within 360 lines',
  CORPUS: 'the steering corpus is within 3000 lines',
  RETIRED: 'registered-operation closure: current steering refers to a solver ' +
    'operation only if the canonical command registry contains it, so a fresh ' +
    'agent cannot discover a retired operation and no historical vocabulary ' +
    'has to be maintained',
  ROUTER: 'rules.md states invariants and routes to owners: changing an ' +
    'owner detail does not require editing it, which is what stops the ' +
    'corpus growing back',
  TASKS: 'for each representative task the always-load layer reaches the ' +
    'authoritative owner with no invariant lost',
});

function scenarioReceipt(id, testNamePattern, detail) {
  return Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail});
}

function budgetReceipt(id, metric, detail) {
  return Object.freeze({id, command: `${BUDGET}${metric}`, detail});
}

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    scenarioReceipt(RECEIPT_ID.INVENTORY, SCENARIO.INVENTORY, DETAIL.INVENTORY),
    budgetReceipt(RECEIPT_ID.RULES_COUNT, METRIC.RULES_MD_COUNT,
      DETAIL.RULES_COUNT),
    budgetReceipt(RECEIPT_ID.RULES_JSON, METRIC.RETIRED_STEERING_SURFACES,
      DETAIL.RULES_JSON),
    budgetReceipt(RECEIPT_ID.RETIRED_SURFACES, METRIC.RETIRED_STEERING_SURFACES,
      DETAIL.RETIRED_SURFACES),
    budgetReceipt(RECEIPT_ID.ALWAYS_LOAD, METRIC.ALWAYS_LOAD_LINES,
      DETAIL.ALWAYS_LOAD),
    budgetReceipt(RECEIPT_ID.CORPUS, METRIC.STEERING_LINES, DETAIL.CORPUS),
    scenarioReceipt(RECEIPT_ID.RETIRED, SCENARIO.RETIRED, DETAIL.RETIRED),
    scenarioReceipt(RECEIPT_ID.ROUTER, SCENARIO.ROUTER, DETAIL.ROUTER),
    scenarioReceipt(RECEIPT_ID.TASKS, SCENARIO.TASKS, DETAIL.TASKS),
  ]),
});
