#!/usr/bin/env node
/**
 * Evidence producer for the coordinator-sqlite-merge Quest (design §4.1 rev 2).
 *
 * Each measured oracle receipt runs one top-level test of
 * test/query/sql-semantics-differential-oracle.test.js, selected by its
 * anchored group name, and requires exactly the number of tests that group
 * declares (test/query/sql-semantics-oracle/receipt-groups.js). The oracle
 * always runs its four fixed seeds here: an inherited
 * LAGRANGE_SQL_ORACLE_SEEDS is removed before any receipt runs.
 *
 * Receipts no work package can measure yet run this script with
 * --not-yet-measured <id>, which names the owner and exits non-zero: they are
 * recorded as failing with that reason, never as passing.
 * independent-verification reads the Quest log through the shared
 * verification check.
 */
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';
import {GROUP, expectedTestCount} from
  '../../test/query/sql-semantics-oracle/receipt-groups.js';

const QUEST_ID = 'coordinator-sqlite-merge';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const TEST_FILE = 'test/query/sql-semantics-differential-oracle.test.js';
const SCRIPT = `scripts/quest-evidence/${QUEST_ID}-receipt.js`;
const NOT_YET_MEASURED_FLAG = '--not-yet-measured';
const SEED_ENV = 'LAGRANGE_SQL_ORACLE_SEEDS';
const EXIT_NOT_MEASURED = 1;
const EXIT_UNKNOWN_RECEIPT = 2;
const REGEXP_MATCH_ESCAPE = '\\$&';

// Receipt id -> the work package that will measure it and how.
const NOT_YET_MEASURED = Object.freeze({
  'durable-command-format-fence': 'WP-D: command format v2 and its committed upgrade fence ' +
    'do not exist yet; the WP1 hop census defines the witness',
  'comparative-scenario-a-shapes-unregressed': 'WP6: the Scenario A semantic gate and lab ' +
    'latency delta have not been measured',
});

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const notMeasuredIndex = process.argv.indexOf(NOT_YET_MEASURED_FLAG);
if (notMeasuredIndex >= 0) {
  const id = process.argv[notMeasuredIndex + 1];
  if (!Object.hasOwn(NOT_YET_MEASURED, id)) {
    process.stderr.write(`${id}: not a not-yet-measured receipt of ${QUEST_ID}\n`);
    process.exit(EXIT_UNKNOWN_RECEIPT);
  }
  process.stderr.write(`${id}: not yet measured (${NOT_YET_MEASURED[id]})\n`);
  process.exit(EXIT_NOT_MEASURED);
}

delete process.env[SEED_ENV];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, REGEXP_MATCH_ESCAPE);
}

function groupReceipt(group, detail) {
  return Object.freeze({
    id: group,
    testFile: TEST_FILE,
    testNamePattern: `^${escapeRegExp(group)}: .*$`,
    expectedTests: expectedTestCount(group),
    detail,
  });
}

const receipts = Object.freeze([
  groupReceipt(GROUP.DIFFERENTIAL, 'layer C: seeded families F1-F8 at four fixed seeds, the ' +
    'golden divergences and grammar parity equal single-database SQLite (names, storage ' +
    'classes and values) at 1, 2, 3 and 5 partitions through the production composition'),
  groupReceipt(GROUP.WITNESSES, 'external review witnesses W-A, W-B, W-B-join and W-C, ' +
    'projection and predicate, at every layout'),
  groupReceipt(GROUP.PUSHDOWN, 'F12: LIMIT/OFFSET (negative and parameterized), DISTINCT ' +
    'under LIMIT, self-join, rowid refusal, COLLATE in key predicate and ON, column naming'),
  groupReceipt(GROUP.ORDER_DEPENDENT, 'F13: integer overflow, compensated REAL sums and ' +
    'MIN over storage-class ties compared exactly in canonical layout'),
  groupReceipt(GROUP.DECLARED, 'F11: the reference database is built from the DDL as ' +
    'declared; the catalog creates every declared type as declared'),
  groupReceipt(GROUP.ROUND_TRIP, 'layer A: render(parse(Q)) equals Q on one SQLite ' +
    'database for every statement, or a typed refusal; the catalog creates every declared ' +
    'column with its declared affinity and collation'),
  groupReceipt(GROUP.TYPED_WIRE, 'layer B: every storage class, local and remote, rows and ' +
    'parameters, crosses the query wire as SQLite produced it; a non-canonical answer ' +
    'cell is a typed refusal'),
  Object.freeze({
    id: 'js-sql-evaluator-census-zero',
    testFile: 'test/query/coordinator-sql-evaluation-census.test.js',
    detail: 'WP6 static census guard: the 5 JS SQL evaluator modules and 2 duplicate SQL ' +
      'renderer modules are deleted, zero prohibited evaluator signatures remain, and the ' +
      'classified SQLite/DDL/wire/routing owner inventory is complete',
  }),
  Object.freeze({
    id: 'one-schema-authority-collation',
    testFile: 'test/query/sql-table-definition.test.js',
    detail: 'WP2 one schema authority: catalog records each column collation and affinity, ' +
      'one DDL renderer serves partitions and coordinator, and non-BINARY key columns are ' +
      'refused with UNSUPPORTED_SQL_FEATURE',
  }),
  Object.freeze({
    id: 'write-key-evaluation-by-sqlite',
    testFile: 'test/query/sql-mutation-and-constraint-stabilization.test.js',
    detail: 'WP4 write-key evaluation and batch UNIQUE enforcement by in-memory SQLite over ' +
      'declared column types and collations',
  }),
  Object.freeze({
    id: 'merge-resource-bounds-typed-refusal',
    testFile: 'test/query/distributed-merge-engine.test.js',
    detail: 'WP3 CoordinatorMergeSession enforces MERGE_INPUT_MAX_ROWS, MEMORY_LIMIT_BYTES, ' +
      'PRAGMA max_page_count, and GUARDED_PARTIAL overflow with typed refusals',
  }),
  Object.freeze({
    id: 'coordinator-evaluated-kill-bound',
    testFile: 'test/query/distributed-merge-engine.test.js',
    detail: 'WP3 CoordinatorMergeProcessPool interrupts expensive COORDINATOR_EVALUATED ' +
      'queries at deadline / AbortSignal with SIGKILL and keeps the coordinator responsive',
  }),
  Object.freeze({
    id: 'engine-identity-parity',
    testFile: 'test/query/distributed-merge-engine.test.js',
    detail: 'WP3 CoordinatorMergeSession verifies sqliteVersion, sqliteSourceId, and ' +
      'compileOptionsDigest parity and refuses mismatches with QUERY_ENGINE_MISMATCH',
  }),
  Object.freeze({
    id: 'every-stage-green',
    testFile: 'test/query/coordinator-interim-refusals.test.js',
    detail: 'WP1-WP7 stage verification: all interim refusals I1a-I1e, I2, and I3 are retired ' +
      'in favor of CoordinatorMergeSession and SQLite evaluation while connection-state ' +
      'functions remain permanently refused on coordinator read paths',
  }),
  Object.freeze({
    id: 'consumer-and-test-migration',
    testFile: 'test/live-query/live-query-group.test.js',
    detail: 'WP6/WP7 consumer and test migration: live-query and distributed SELECT consumers ' +
      'use the canonical SQL renderer and SQLite evaluation with aliased collation parity',
  }),
  ...Object.keys(NOT_YET_MEASURED).map((id) => Object.freeze({
    id,
    command: `node ${SCRIPT} ${NOT_YET_MEASURED_FLAG} ${id}`,
    detail: `not yet measured: ${NOT_YET_MEASURED[id]}`,
  })),
  Object.freeze({
    id: 'independent-verification',
    command: `node ${SCRIPT} ${CHECK_VERIFICATION_FLAG}`,
    detail: 'an approving independent subagent verification recorded in log.ndjson newer ' +
      'than the last attempt',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
