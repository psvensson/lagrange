// Deterministic evidence harness for the critical-placement-formation-observer
// quest: receipt declarations only. The witness uses raw node:test (not the
// repo tap shim), so --test-name-pattern selects exactly one anchored scenario
// per receipt.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/bootstrap/critical-placement-formation-observer.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'spread-critical-set-observes-converged',
    command: scenarioCommand('^spread-critical-set-observes-converged'),
    detail: 'every declared critical partition spread across its required ' +
      'distinct voting nodes observes as converged with no pending ids, so ' +
      'the generalized question is satisfiable and not vacuously false',
  }),
  Object.freeze({
    id: 'seed-local-critical-set-observes-pending',
    command: scenarioCommand('^seed-local-critical-set-observes-pending'),
    detail: 'the shape a cluster is ACTUALLY created in — every critical ' +
      'partition holding its full replica count on the seed alone — observes ' +
      'as pending, with EVERY critical partition pending rather than one. ' +
      'This is the state an RF-only check calls satisfied at t=0',
  }),
  Object.freeze({
    id: 'partial-spread-names-the-pending-partitions',
    command: scenarioCommand('^partial-spread-names-the-pending-partitions'),
    detail: 'three partitions pending by MIXED causes — two with no rows and ' +
      'one present but on a single node — with pendingPartitionIds asserted ' +
      'to equal exactly those three, sorted. Cardinality three and mixed ' +
      'causes together defeat a constant, a cap-at-one or a cap-at-two ' +
      'accumulation, and an implementation keyed on absence alone',
  }),
  Object.freeze({
    id: 'unavailable-cache-is-typed-and-not-converged',
    command: scenarioCommand('^unavailable-cache-is-typed-and-not-converged'),
    detail: 'six unreadable cache shapes (absent, null, no filter, a ' +
      'non-function filter, a filter answering null, a filter answering a ' +
      'string) all observe NOT converged with the typed cache-unavailable ' +
      'state. Absent evidence is never satisfaction. Mutation-verified: ' +
      'flipping that branch to converged, or dropping the array check, each ' +
      'reds this scenario',
  }),
  Object.freeze({
    id: 'observer-reads-only-the-services-table',
    command: scenarioCommand('^observer-reads-only-the-services-table'),
    detail: 'the observer asks the cache for exactly one table, so the ' +
      'observation cannot silently drift onto another and report a different ' +
      'question\'s answer. Mutation-verified: reading NODES instead reds three ' +
      'scenarios',
  }),
  Object.freeze({
    id: 'observer-mints-no-readiness-state',
    command: scenarioCommand('^observer-mints-no-readiness-state'),
    detail: 'the observation is frozen and carries exactly state, converged, ' +
      'pendingPartitionIds and observedPartitionCount — no ready, phase, ' +
      'active, verdict, release, barrier or admitted key — so it creates no ' +
      'second readiness or release authority',
  }),
  Object.freeze({
    id: 'barrier-release-is-unchanged-by-the-observation',
    command: scenarioCommand(
      '^barrier-release-is-unchanged-by-the-observation'),
    detail: 'CONTROL and the safety property of this slice: the barrier ' +
      'REPORTS the observation and must not gate on it. A joiner that waited ' +
      'for spread which only its own join can supply would deadlock ' +
      'formation, so the release condition stays the startup-authority answer ' +
      'and the lifecycle owner consumes this evidence in a later slice. ' +
      'Mutation-verified: adding the observation to the release condition ' +
      'reds this scenario. Must stay green',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'repeated observation and reversed row order produce one ' +
      'identical projection, so no receipt passes by row ordering or ' +
      'retained state',
  }),
]);

const QUEST_ID = 'critical-placement-formation-observer';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'critical-placement-formation-observer.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
