#!/usr/bin/env node
/**
 * Receipt harness for restore-deterministic-cloud-gate-resource-sensitive-execution-contract.
 * What it seals lives in the shared frontier table beside it.
 */

import {
  RESOURCE_SENSITIVE_EXECUTION_CONTRACT, receiptPath, receiptsFor,
} from './checks/deterministic-cloud-gate-receipts.js';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'restore-deterministic-cloud-gate-resource-sensitive-execution-contract';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: receiptPath(QUEST_ID),
  receipts: receiptsFor(RESOURCE_SENSITIVE_EXECUTION_CONTRACT),
});
