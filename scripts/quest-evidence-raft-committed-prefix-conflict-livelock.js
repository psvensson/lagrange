// Deterministic evidence harness for the raft-committed-prefix-conflict-
// livelock quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'committed-prefix-conflict-routes-to-repair-once',
    testFile:
      'test/raft/liferaft-committed-prefix-conflict-livelock.test.js',
    detail: 'a follower with a same-index term conflict at or below its ' +
      'DURABLE committed index (per-entry committed flag and cached ' +
      'committedIndex both lagging — the CL-040 hazard shape) requests ' +
      'ZERO truncations across repeated leader heartbeats (the adapter ' +
      'refusal witness stays at 0), surfaces the poisoned committed prefix ' +
      'exactly once per conflict identity as the typed ' +
      'committed-prefix-divergence event, and rejects every heartbeat with ' +
      'the typed committed-conflict append-fail that feeds the existing ' +
      'leader catch-up/install repair route; the uncommitted-conflict ' +
      'truncation path is proven unchanged (red-on-revert: restoring the ' +
      'flag-gated truncation makes every delivered heartbeat re-request ' +
      'the refused truncation and surface nothing, failing the ' +
      'zero-truncation, zero-refusal, and exactly-once assertions)',
  }),
  Object.freeze({
    id: 'adapter-committed-refusal-preserved',
    testFile:
      'test/raft/sqlite-log-adapter-committed-truncation-guard.test.js',
    detail: 'the log adapter\'s committed-entry-loss refusal is untouched: ' +
      'removeEntriesAfter still refuses any truncation intruding into the ' +
      'committed prefix (recording the blocked request) and still ' +
      'truncates a legitimate uncommitted suffix — the pre-existing guard ' +
      'suite passes without modification',
  }),
]);

const QUEST_ID = 'raft-committed-prefix-conflict-livelock';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'raft-committed-prefix-conflict-livelock.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
