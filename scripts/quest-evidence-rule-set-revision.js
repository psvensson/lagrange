#!/usr/bin/env node
/**
 * Receipt harness for rule-set-revision-26, superseded before it landed. It
 * seals the thirteen claims that quest declared; the successor seals the rest.
 */

import {receiptPath, receiptsFor} from './checks/rule-set-revision-receipts.js';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'rule-set-revision-26';
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
  'authorization-removed-inside-scope-fails-r26-only',
  'scope-left-with-valid-authorization-fails-r16-only',
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: receiptPath(QUEST_ID),
  receipts: receiptsFor([...SEALED]),
});
