#!/usr/bin/env node
// First measurement only. The Quest's other required receipts remain absent
// until their real proofs run; this packet cannot close the whole interaction.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'shared-control-plane-mutation-ownership';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'gateway-retains-unconfirmed-intent-then-completes',
    testFile: 'test/raft/authoritative-row-mutation-unconfirmed-gateway.test.js',
    detail: 'Real helper and gateway retain empty/success-only CDC answers ' +
      'without publishing application, persistence or visibility; the same ' +
      'pending intent and write key later reach the producer and complete ' +
      'from an exact-one visible receipt. Controlled producer and timer only.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: RECEIPTS,
});
