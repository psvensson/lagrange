#!/usr/bin/env node
// Evidence harness for the sealed fresh-seed-activation Quest (owner decision
// 2, 2026-10-26). Receipts 1-5 select the named tests of the one witness file
// ("R<n> ..."), positive and engaged negative together, with exact counts so a
// renamed or dropped witness cannot pass as a smaller subset. Receipt 6 re-runs
// the existing owner witnesses that keep retained, partial, uncertain and cold
// states held. Receipt 7 reads the quest log through the solve store owner for
// an approving independent verification newer than the last attempt, then runs
// the applicable gates outside the land gate. Receipts stay false until this
// writer runs on canonical lab execution with retries 0.
//
//   node scripts/quest-evidence/fresh-seed-activation.js [--output <path>]
//   node scripts/quest-evidence/fresh-seed-activation.js --check-verification
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'fresh-seed-activation';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';
const run = (...files) => `npm run test:file -- ${files.join(' ')}`;

const WITNESS = 'test/bootstrap/fresh-seed-activation.integration.test.js';
const LIFETIME = 'test/bootstrap/seed-original-attempt-lifetime.test.js';
const PROTECTION_WITNESSES = Object.freeze([
  LIFETIME,
  'test/raft/raft-rs-original-allocation-cold-inspection.test.js',
  'test/raft/raft-rs-original-allocation-custody.test.js',
  'test/raft/raft-rs-original-allocation-preparation.test.js',
  'test/raft/raft-rs-original-allocation-store.test.js',
  'test/raft/raft-rs-original-opening-authority.test.js',
  'test/raft/raft-rs-original-opening-effect-cut.test.js',
  'test/raft/raft-rs-original-opening.test.js',
  'test/bootstrap/seed-retained-effects.test.js',
  'test/bootstrap/seed-retained-effects-preparation.test.js',
  'test/bootstrap/seed-retained-effects.integration.test.js',
]);

function checkVerification() {
  const state = questState(readLog(process.cwd(), QUEST_ID));
  const last = state.lastVerification;
  // A seal review approves no source: an attempt must precede the verdict.
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({approved, verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent, attempts: state.attempts.length})}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) checkVerification();

const receipts = Object.freeze([
  Object.freeze({
    id: 'protected-activation-admitted-openings-only',
    testFile: WITNESS,
    testNamePattern: '^R1 .*$',
    expectedTests: 2,
    detail: 'Startup natively opens, activates election scheduling and observes ' +
      'leadership for exactly the declared groups after their admitted openings; ' +
      'without a live attempt every ' +
      'continuation entry holds AUTHORITY.',
  }),
  Object.freeze({
    id: 'original-rights-durable-monotonic-transfer',
    testFile: WITNESS,
    testNamePattern: '^R2 .*$',
    expectedTests: 2,
    detail: 'Every declared SERVICES right and the anchor identity right reads ' +
      'UNUSED, SUBMITTED, TRANSFERRED; the owner read at settle equals the ' +
      'durable read after custody is released. Unknown publication retains ' +
      'SUBMITTED until exact live readback without another INSERT.',
  }),
  Object.freeze({
    id: 'public-admission-closed-until-handoff',
    testFile: WITNESS,
    testNamePattern: '^R3 .*$',
    expectedTests: 2,
    detail: 'No bracketed public accept precedes all rights TRANSFERRED and ' +
      'readiness serves after; with rights untransferred startWebSocketServer, ' +
      'openExternalTransportAdmission and completeSuccessfulBootstrap hold.',
  }),
  Object.freeze({
    id: 'public-write-and-read-served',
    testFile: WITNESS,
    testNamePattern: '^R4 .*$',
    expectedTests: 1,
    detail: 'CREATE, INSERT and SELECT through openApplicationDatabase.',
  }),
  Object.freeze({
    id: 'same-data-restart-served-or-typed-hold',
    testFile: WITNESS,
    testNamePattern: '^R5 .*$',
    expectedTests: 1,
    detail: 'A cold restart serves the pre-restart row or is an owner-named ' +
      'hold; durable rights are unchanged. Not a recovery claim.',
  }),
  Object.freeze({
    id: 'retained-partial-uncertain-cold-states-keep-hold',
    testFile: LIFETIME,
    command: run(...PROTECTION_WITNESSES),
    detail: 'Existing owner witnesses (with the recorded correspondence ' +
      'update of the lifetime continuation negative) stay green.',
  }),
  Object.freeze({
    id: 'independent-verification-and-applicable-gates',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG} && ` +
      'npm run -s test:duplication && npm run -s audit:shards',
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner, and the ratchets outside land.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
