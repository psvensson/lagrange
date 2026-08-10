// Deterministic evidence harness for the cdc-null-sentinel-where-rendering
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'null-sentinel-renders-is-null-in-live-ingress',
    testFile:
      'test/cdc/cdc-integration-service-mutations-and-epoch.test.js',
    detail: 'a null whereClause value passed to the live CDC mutation ' +
      'ingress (updateSystemTableRow) renders as an IS NULL predicate ' +
      'with no bound parameter, while non-null where-values keep the ' +
      'bound equality exactly as before — a bound "= NULL" equality is ' +
      'never true in SQL, so the pre-fix rendering silently matched ' +
      'zero rows and every replica-operation terminal CAS ' +
      '(completed_at: null) refused forever (974-992 typed refusals ' +
      'per formation run; red-on-revert: with the HEAD helper the new ' +
      'assertions fail on "= ?" rendering with a bound null)',
  }),
  Object.freeze({
    id: 'builders-agree-on-one-convention',
    testFile:
      'test/cdc/cdc-integration-service-mutations-and-epoch.test.js',
    detail: 'buildSystemTableMutationSqlParts (the ingress builder that ' +
      'production takes) renders the null sentinel byte-identically to ' +
      'the documented buildSqlMutationPlan convention in ' +
      'control-plane-system-table-gateway-query-execution.js — ' +
      '"operation_id = ? AND completed_at IS NULL" binding only the ' +
      'non-null values — so the two SQL builders share one convention ' +
      'and the delete lane is repaired together with the update lane',
  }),
]);

const QUEST_ID = 'cdc-null-sentinel-where-rendering';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'cdc-null-sentinel-where-rendering.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
