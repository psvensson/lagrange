#!/usr/bin/env node
// Evidence harness for the sealed retained-seed-original-handoff Quest.
// Receipts 1-6 select the named tests of the witness file ("R<n> ...") with
// exact counts. Receipt 7 re-runs the owner witnesses that keep retained,
// partial, uncertain and cold states held. Receipt 8 reads the quest log
// through the solve store owner for an approving independent verification,
// then runs the applicable gates outside the land gate.
//
//   node scripts/quest-evidence/retained-seed-original-handoff.js [--output <path>]
//   node scripts/quest-evidence/retained-seed-original-handoff.js --check-verification
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'retained-seed-original-handoff';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';
const SHARED_CACHE_ENV = 'RETAINED_SEED_SHARED_CACHE_DIR';
const SHARED_CACHE_PREFIX = 'retained-seed-evidence-cache-';
const EXIT_EVENT = 'exit';
const run = (...files) => `npm run test:file -- ${files.join(' ')}`;

const WITNESS = 'test/bootstrap/retained-seed-original-handoff.integration.test.js';
const LIFETIME = 'test/bootstrap/seed-original-attempt-lifetime.test.js';
const PROTECTION_WITNESSES = Object.freeze([
  LIFETIME,
  'test/raft/raft-rs-original-allocation-cold-inspection.test.js',
  'test/raft/raft-rs-original-allocation-custody.test.js',
  'test/raft/raft-rs-original-allocation-preparation.test.js',
  'test/raft/raft-rs-original-allocation-lifecycle-operation.test.js',
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
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({approved, verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent, attempts: state.attempts.length})}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) checkVerification();

const sharedCacheDir = fs.mkdtempSync(path.join(tmpdir(), SHARED_CACHE_PREFIX));
process.env[SHARED_CACHE_ENV] = sharedCacheDir;
process.on(EXIT_EVENT, () => {
  fs.rmSync(sharedCacheDir, {recursive: true, force: true});
});

const receipts = Object.freeze([
  Object.freeze({
    id: 'cold-public-entry-committed-origin-and-original-deadline',
    testFile: WITNESS,
    testNamePattern: '^R6 .*$',
    expectedTests: 1,
    detail: 'Cold public entry reaches the first non-control ENABLE origin ' +
      'commit at the issued 30000ms deadline and completes bounded handoff ' +
      'on cold restart with HANDOFF_COMPLETE_SERVING_DEFERRED.',
  }),
  Object.freeze({
    id: 'prospective-complete-allocation-before-native-effects',
    testFile: WITNESS,
    testNamePattern: '^R1 .*$',
    expectedTests: 1,
    detail: 'Prospective original allocation persists the complete 141-member ' +
      'cohort and owner-minted incarnations before the first native effect.',
  }),
  Object.freeze({
    id: 'nonserving-original-recovery-and-pre-origin-release',
    testFile: WITNESS,
    testNamePattern: '^R3 .*$',
    expectedTests: 1,
    detail: 'Completed cold cohort preserves the committed ENABLE origin, ' +
      'completes remaining pre-origin and existing-origin release across all ' +
      '46 partition cohorts, and refuses continuation before all 141 open.',
  }),
  Object.freeze({
    id: 'exact-services-and-cluster-identity-handoff',
    testFile: WITNESS,
    testNamePattern: '^R4 .*$',
    expectedTests: 1,
    detail: 'Release-completed cold cohort publishes the exact 141 SERVICES ' +
      'rows and reserved cluster_id and transitions all 142 rights to ' +
      'TRANSFERRED.',
  }),
  Object.freeze({
    id: 'public-admission-and-exact-cleanup-custody',
    testFile: WITNESS,
    testNamePattern: '^R5 .*$',
    expectedTests: 1,
    detail: 'Public serving admission stays closed across every retained ' +
      'continuation boundary and all native databases and directory custody ' +
      'release cleanly on exit.',
  }),
  Object.freeze({
    id: 'cold-mid-handoff-and-invalid-evidence-holds',
    testFile: WITNESS,
    testNamePattern: '^(R2|R7|R8) .*$',
    expectedTests: 3,
    detail: 'Cold retained cohort validates all founders and UNUSED rights ' +
      'before opening, refuses transferred publication rights with SPENT, ' +
      'and fails closed on contrary or partial retained state.',
  }),
  Object.freeze({
    id: 'engaged-semantic-negatives-and-owner-regressions',
    testFile: LIFETIME,
    command: run(...PROTECTION_WITNESSES),
    detail: 'Owner witnesses for original allocation preparation, cold ' +
      'inspection, custody, opening authority, effect cut, and retained ' +
      'effects remain green.',
  }),
  Object.freeze({
    id: 'independent-correspondence-and-applicable-gates',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG} && ` +
      'npm run -s test:duplication && npm run -s audit:shards',
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner, and the ratchets outside land.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
