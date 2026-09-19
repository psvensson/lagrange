#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'readiness-admission-transitions-observed';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PLANNING_TEST =
  'test/control-plane/readiness-admission-transitions-observed.test.js';
const ROUTING_TEST =
  'test/query/readiness-routing-denial-observability.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['deferral-transition-names-the-failing-terms', PLANNING_TEST,
    '^the planning owner names the failing terms of each deferral transition$',
    'each transition names exactly the failed terms, the inherited age, and ' +
      'on return the time spent deferred'],
  ['steady-state-logs-nothing', PLANNING_TEST,
    '^a steady state logs nothing and a flap states the suppressed reads$',
    'no line for repeated reads in one state; a flap is bounded by state ' +
      'changes and every line states its suppressed count'],
  ['refused-publish-names-its-reason', PLANNING_TEST,
    '^a refused publish names its refusal reason once per change$',
    'one line per refusal reason, the next reason reports the suppressed ' +
      'identical refusals'],
  ['routing-denial-states-record-age-and-deferral', ROUTING_TEST,
    '^the routing denial states each denied candidate\'s record age and deferral$',
    'observedAgeMs and deferred on each denied candidate, every pre-existing ' +
      'field byte-identical to main\'s frozen payload'],
  ['decisions-unchanged', PLANNING_TEST,
    '^every planning and routing decision matches the frozen oracle of main$',
    'served records, object identities, build counts and routing outcomes ' +
      'digest to main\'s measured value'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
