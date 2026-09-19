#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'seed-replica-production-scheduling-defaults';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PATH_JOINER = '/';
// One file holds the four production-scheduling witnesses: they measure the
// same seam on the same composition, and the primitive recorder they share
// cannot be copied into a second file without duplicating it.
const SCHEDULING_TEST = 'test/bootstrap/production-scheduling-defaults.test.js';
// The reconcile-queue witnesses live beside Q1-Q5 in the queue's own
// current-work file, which runs under tap rather than node:test, so the
// receipt re-runs that file rather than one named subtest of it.
const RECONCILE_QUEUE_TEST =
  'test/workflow/owner-key-reconcile-queue-current-work.test.js';
const RECEIPT = Object.freeze([
  ['seed-hosted-replicas-schedule-like-production', SCHEDULING_TEST,
    '^a seed-hosted replica schedules like a production replica$',
    'tick-tock timers and setImmediate hops on a seed-hosted replica'],
  ['seed-and-joiner-replicas-schedule-alike', SCHEDULING_TEST,
    '^a seed-hosted and a joiner-hosted replica schedule alike$',
    'one node schedules its replicas the same way however it hosts them'],
  ['reconciler-yields-on-setimmediate-in-production', SCHEDULING_TEST,
    '^a production reconciler takes each per-action turn on setImmediate$',
    'the per-action turn is a setImmediate with no clock supplied'],
  ['supplied-clock-still-owns-scheduling', SCHEDULING_TEST,
    '^a supplied clock still owns hosted replica and reconciler scheduling$',
    'a supplied clock still owns every hop, timer and turn'],
]);
const QUEUE_RECEIPT = Object.freeze({
  id: 'reconcile-queue-idle-and-shutdown-witnessed',
  testFile: RECONCILE_QUEUE_TEST,
  detail: 'the draining clause of the idle predicate, and shutdown clearing ' +
    'draining and releasing current-work waiters',
});
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    ...RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
      Object.freeze({id, testFile, testNamePattern, detail})),
    QUEUE_RECEIPT,
  ]),
});
