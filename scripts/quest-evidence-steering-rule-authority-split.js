#!/usr/bin/env node
/**
 * Receipt harness for steering-rule-authority-split: every claim in the table.
 */

import {receiptPath, receiptsFor} from './checks/rule-set-revision-receipts.js';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'steering-rule-authority-split';
const SEALED = Object.freeze([
  'manifest-and-rule-bodies-agree-entry-for-entry',
  'rule-ids-are-unique-and-contiguous',
  'one-independently-violable-invariant-per-rule',
  'exactly-one-owner-key-per-rule',
  'every-owner-key-resolves-through-the-router',
  'no-implementation-identity-leaks-into-a-rule',
  'r16-owner-owns-all-of-r16-and-none-of-r26',
  'r26-routes-to-the-real-authorization-boundary',
  'always-load-transitive-path-within-360-lines',
  'registered-operation-closure-remains-green',
  'representative-tasks-reach-their-owner-from-always-load',
  'the-two-rules-share-no-authority',
  'authorization-removed-inside-scope-fails-r26-only',
  'scope-left-with-valid-authorization-fails-r16-only',
  'neither-verdict-moves-with-the-other-rules-input',
  'the-modelled-table-matches-the-mechanisms',
  'growing-the-sealed-set-requires-a-revision',
  'no-always-load-document-states-a-rule-count',
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: receiptPath(QUEST_ID),
  receipts: receiptsFor([...SEALED]),
});
