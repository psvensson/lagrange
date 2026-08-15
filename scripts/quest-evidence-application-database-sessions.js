// Deterministic evidence harness for application-database-sessions.

import path from 'node:path';
import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'public-session-contract',
    command: 'node scripts/run-test-files.js ' +
      'test/query/application-database.test.js',
    detail: 'behavioral tests cover unique session ids, copied bind values, ' +
      'canonical SQLQueryEngine control-SQL refusal, unawaited statement ' +
      'draining, pre-runtime and same-microtask callback-settlement admission, ' +
      'inherited numeric Array-setter resistance, swallowed failure rollback, ' +
      'failed commit without rollback, nesting, expired handles, owned ' +
      'failure metadata, hostile inputs and intrinsics, and single-flight close',
  }),
  Object.freeze({
    id: 'canonical-runtime-factory',
    command: 'node scripts/run-test-files.js ' +
      'test/entrypoint/application-database-runtime-composition.test.js',
    detail: 'behavioral tests cover bound opener exposure, typed public ' +
      'startup failure, same-tick process-claim exclusion, stop-during-start ' +
      'abort, reverse acquisition cleanup, abort immediately after owner ' +
      'acquisition, cancellable join backoff, bounded stop with eventual ' +
      'transaction cleanup, application drain before owner cleanup, typed ' +
      'no-router refusal, and a real reusable dry-run startup; a source-wiring ' +
      'assertion locates the bound facade beside the composed SQLQueryEngine',
  }),
  Object.freeze({
    id: 'side-effect-free-package-import',
    command: 'node scripts/run-test-files.js ' +
      'test/release/public-api-side-effect-boundary.test.js',
    detail: 'package import and createEmbeddedLagrange construction preserve ' +
      'the observed server, socket, timer, signal-resource, and process-listener ' +
      'snapshots while exporting the public start/open/stop handle',
  }),
]);
const QUEST_ID = 'application-database-sessions';
const SOLVE_DIRECTORY = 'solve';
const EVIDENCE_DIRECTORY = 'evidence';
const RECEIPT_FILENAME = 'application-database-sessions.receipt.json';
const outputFile = process.argv[2] || path.join(
  SOLVE_DIRECTORY,
  EVIDENCE_DIRECTORY,
  RECEIPT_FILENAME,
);
const questId = process.argv[3] || QUEST_ID;

runQuestEvidenceHarness({
  questId,
  outputFile,
  receipts: RECEIPTS,
});
