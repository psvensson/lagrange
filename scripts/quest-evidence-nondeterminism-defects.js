#!/usr/bin/env node
/**
 * Receipt harness for restore-deterministic-cloud-gate-nondeterminism-defects.
 * What it seals lives in the shared frontier table beside it.
 */

import {
  NONDETERMINISM_DEFECTS, receiptPath, receiptsFor,
} from './checks/deterministic-cloud-gate-receipts.js';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'restore-deterministic-cloud-gate-nondeterminism-defects';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: receiptPath(QUEST_ID),
  receipts: receiptsFor(NONDETERMINISM_DEFECTS),
});
