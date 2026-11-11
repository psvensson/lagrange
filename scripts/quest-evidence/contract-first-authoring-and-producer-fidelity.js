#!/usr/bin/env node
/**
 * Receipt harness for Quest: contract-first-authoring-and-producer-fidelity.
 *
 * Verifies the 6 required receipts:
 * 1. real-producer-contract-typecheck: producer and consumer pass TypeScript checkJs
 * 2. phantom-member-rejected: phantom members (e.g. hasQuorum) rejected statically and at runtime
 * 3. fixture-producer-conformance: shared fixtures conform to owner shape and reject drift
 * 4. real-interaction-refusal-recovery-cleanup: real PartitionService interaction proves refusal, recovery, cleanup
 * 5. steering-owner-alignment: verification templates and workflow guidelines align with fixtures.md
 * 6. independent-verification: approving subagent verification in quest log
 */

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'contract-first-authoring-and-producer-fidelity';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const WITNESS_TEST = 'test/bootstrap/contract-first-authoring-fidelity.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'real-producer-contract-typecheck',
    testFile: WITNESS_TEST,
    testNamePattern: '^real producer and consumer pass contract-first typecheck with zero diagnostics$',
    expectedTests: 1,
    detail: 'Producer and consumer pass TypeScript checkJs typecheck with zero diagnostics.',
  }),
  Object.freeze({
    id: 'phantom-member-rejected',
    testFile: WITNESS_TEST,
    testNamePattern: '^phantom members are rejected by static typecheck and runtime conformance$',
    expectedTests: 1,
    detail: 'Deliberately invented phantom members are rejected before integration statically and at runtime.',
  }),
  Object.freeze({
    id: 'fixture-producer-conformance',
    testFile: WITNESS_TEST,
    testNamePattern: '^shared fixture doubles conform to producer contract and reject drift$',
    expectedTests: 1,
    detail: 'Shared fixture doubles conform to the owner-defined status contract and reject silent drift.',
  }),
  Object.freeze({
    id: 'real-interaction-refusal-recovery-cleanup',
    testFile: WITNESS_TEST,
    testNamePattern: '^real partition service interaction proves refusal, recovery and cleanup$',
    expectedTests: 1,
    detail: 'Real PartitionService and quorum authority demonstrate refusal, recovery, and clean resource cleanup.',
  }),
  Object.freeze({
    id: 'steering-owner-alignment',
    testFile: WITNESS_TEST,
    testNamePattern: '^steering and verification templates align with zero legacy fallback$',
    expectedTests: 1,
    detail: 'Harness fidelity and owner interaction templates align with fixtures.md and zero-fallback discipline.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
