// Deterministic evidence harness for the
// formation-release-handoff-interaction-registry quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the test-receipt probe
// artifact
// (solve/evidence/formation-release-handoff-interaction-registry.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the registry edit)
// registry-contract-formation-release-handoff-present,
// registry-pair-seed-contract-joiner-consumer-present and
// pair-witnesses-are-classified-contract-tests are RED (the interaction is
// unregistered, so neither the proof cone nor the landing guard selects the
// consumer-parity witness when a seed owner changes);
// impact-contracts-audit-passes, no-owner-semantics-change and
// witness-deterministic are green and must stay green — a registration that
// turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/formation-release-handoff-interaction-registry.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'registry-contract-formation-release-handoff-present',
    command: scenarioCommand('^registry-contract-formation-release-handoff-present'),
    detail: 'test/shards/impact-contracts.json carries the contract ' +
      'formation-release-handoff whose owners are exactly the four seed ' +
      'release-authority files (closure owner, contract, evidence, ' +
      'publication) and the two joiner consumer/barrier files (readiness ' +
      'formation-release methods, node-joining formation readiness), and ' +
      'whose tests are the closure and consumer-parity witnesses',
  }),
  Object.freeze({
    id: 'registry-pair-seed-contract-joiner-consumer-present',
    command: scenarioCommand('^registry-pair-seed-contract-joiner-consumer-present'),
    detail: 'the coupled pair formation-release-seed-contract-joiner-consumer ' +
      'declares exactly two endpoints — seed-release-authority and ' +
      'joiner-consumer-barrier — under contract formation-release-handoff ' +
      'with both witnesses, introducing no third authority',
  }),
  Object.freeze({
    id: 'pair-witnesses-are-classified-contract-tests',
    command: scenarioCommand('^pair-witnesses-are-classified-contract-tests'),
    detail: 'every witness of the pair exists in the tree, is an exact test ' +
      'of the formation-release-handoff contract and is primary-classified ' +
      'in test/shards/primary-classes.json',
  }),
  Object.freeze({
    id: 'impact-contracts-audit-passes',
    command: scenarioCommand('^impact-contracts-audit-passes'),
    detail: 'node scripts/checks/impact-contract-registry.js exits 0 with ' +
      'an empty stderr, prints impact-contracts: PASS and reports the ' +
      'digest of the registry on disk',
  }),
  Object.freeze({
    id: 'no-owner-semantics-change',
    command: scenarioCommand('^no-owner-semantics-change'),
    detail: 'git diff --name-only HEAD -- src is empty for this candidate: ' +
      'the registration changes no formation-release owner semantics',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two independent loads project the identical registered ' +
      'interaction (contract entry, pair entry, audit problems) and the ' +
      'identical registry digest',
  }),
]);

const QUEST_ID = 'formation-release-handoff-interaction-registry';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-release-handoff-interaction-registry.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
