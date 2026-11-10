#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'node-startup-natural-shutdown';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

function checkVerification() {
  const state = questState(readLog(process.cwd(), QUEST_ID));
  const last = state.lastVerification;
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({
    approved,
    verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent,
    attempts: state.attempts.length,
  })}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  checkVerification();
}

const WITNESS = 'test/node/node-startup-natural-shutdown.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'retained-resource-cause',
    testFile: WITNESS,
    testNamePattern: '^R1 .*$',
    expectedTests: 1,
    detail: 'Explicitly identifies and reproduces retained handles/resources (NodeService intervals, LogsTableService flush timers/buffers, join cleanup leaks) preventing natural exit.',
  }),
  Object.freeze({
    id: 'successful-start-natural-exit',
    testFile: WITNESS,
    testNamePattern: '^R2 .*$',
    expectedTests: 1,
    detail: 'Node startup and shutdown completes and exits naturally with code 0 and zero active handles without SIGKILL or forced-exit workarounds.',
  }),
  Object.freeze({
    id: 'failed-join-natural-exit',
    testFile: WITNESS,
    testNamePattern: '^R3 .*$',
    expectedTests: 1,
    detail: 'Startup failure during join unwinds acquired resources and exits naturally without leaked handles or timers.',
  }),
  Object.freeze({
    id: 'owned-resources-released',
    testFile: WITNESS,
    testNamePattern: '^R4 .*$',
    expectedTests: 1,
    detail: 'Every owned worker, subscription, timer, and runtime service registered in the startup and shutdown chain is released.',
  }),
  Object.freeze({
    id: 'restart-retains-committed-obligations',
    testFile: WITNESS,
    testNamePattern: '^R5 .*$',
    expectedTests: 1,
    detail: 'After natural shutdown and restart, committed durable obligations remain intact and resume while volatile background work is cancelled.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
