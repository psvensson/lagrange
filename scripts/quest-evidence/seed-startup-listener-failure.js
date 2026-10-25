#!/usr/bin/env node
// Execute the occupied-listener discriminator and unchanged supported-start
// positive. The shared harness writes receipts from real executions only.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'seed-startup-listener-failure';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'occupied-listener-refusal-and-custody',
    testFile: 'test/bootstrap/seed-startup-listener-failure.integration.test.js',
    detail: 'Actual bind refusal preserves EADDRINUSE, no runtime or ready HTTP ' +
      'publication, successful owner cleanup and real process-directory release.',
  }),
  Object.freeze({
    id: 'unoccupied-supported-start',
    testFile: 'test/bootstrap/fresh-seed-activation.integration.test.js',
    detail: 'Actual unoccupied public startup, native activation, durable handoff, ' +
      'public write/read and typed held restart remain discriminated.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: RECEIPTS,
});
