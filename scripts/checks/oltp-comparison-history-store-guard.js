// Guard for the Lagrange/TiDB comparison history (R21: history is append-only).
// PASS requires: combination keys separate every framework/system identity; the
// writer appends, preserves existing bytes and refuses a duplicate recordSha256;
// the progress summary is the mutable index (latest record per combination, with
// the count of records behind it and a non-valid admission status); the committed
// summary and history pages equal their regeneration; and the docs index links the
// history page.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CLAIM_CELL_STATUS,
} from '../../test/distributed/harness/benchmark-claim-admission.js';
import {readInvalidationLedger} from '../../test/distributed/harness/benchmark-invalidation-ledger.js';
import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  appendComparisonHistoryRecord,
  buildComparisonCombinationKey,
  buildComparisonProgressSummary,
  createComparisonHistoryRecord,
  parseComparisonHistoryNdjson,
  recordComparisonResultToDisk,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
  DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  getScenarioDefinitionHref,
  renderComparisonProgress,
} from '../../test/distributed/harness/oltp-comparison-static-web.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayEvery = Function.call.bind(Array.prototype.every);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const MSG_APPENDED_NOT_MERGED = 'a later record of one combination is appended, not merged';
const MSG_LATEST_SELECTED = 'the index selects the latest record';
const MSG_BYTES_PRESERVED = 'existing bytes are preserved';
const MSG_REFUSED_UNCHANGED = 'a refused write changes nothing';
const MSG_SUMMARY_CURRENT = 'progress summary is current';
const MSG_FORENSIC_ONLY = 'history records are forensic, never valid-observed';
const PASS_MESSAGE = 'oltp-comparison-history-store-guard: PASS';
const SCENARIO_A = 'tidb-oltp-baseline';
const SCENARIO_B = 'tidb-distributed-risk-decision';
const PROFILE_A = 'oltp-baseline-v1';
const PROFILE_B = 'oltp-baseline-v2';
const FW_V1 = '0.3.0';
const FW_V2 = '0.3.1';
const LAG_V1 = '0.3.0';
const LAG_V2 = '0.3.1';
const SYS_V1 = 'v8.5.8';
const SYS_V2 = 'v8.5.9';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SYS_SHA_A = 'pingcap/tidb:v8.5.8';
const SYS_SHA_B = 'pingcap/tidb:v8.5.9';
const TIME_1 = '2026-10-01T00:00:00.000Z';
const TIME_2 = '2026-10-02T00:00:00.000Z';
const DOCS_README_PATH = 'docs/README.md';
const HISTORY_PAGE_LINK = 'benchmarks/tidb-comparison-progress.md';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeCombinationInput(overrides = {}) {
  return {
    framework: {
      frameworkVersion: FW_V1, frameworkCommitSha: SHA_A, scenarioId: SCENARIO_A,
      profileId: PROFILE_A, ...overrides.framework,
    },
    systems: {
      lagrange: {present: true, version: LAG_V1, commitSha: SHA_A, ...overrides.lagrange},
      tidbTikv: {present: true, version: SYS_V1, commitSha: SYS_SHA_A, ...overrides.tidbTikv},
    },
  };
}

function verifyCombinationKeySensitivities() {
  const baseKey = buildComparisonCombinationKey(makeCombinationInput());
  assert.equal(buildComparisonCombinationKey(makeCombinationInput()).combinationSha256,
    baseKey.combinationSha256);
  for (const variant of [
    makeCombinationInput({framework: {frameworkVersion: FW_V2}}),
    makeCombinationInput({framework: {frameworkCommitSha: SHA_B}}),
    makeCombinationInput({framework: {scenarioId: SCENARIO_B}}),
    makeCombinationInput({framework: {profileId: PROFILE_B}}),
    makeCombinationInput({lagrange: {version: LAG_V2}}),
    makeCombinationInput({lagrange: {commitSha: SHA_B}}),
    makeCombinationInput({tidbTikv: {version: SYS_V2}}),
    makeCombinationInput({tidbTikv: {commitSha: SYS_SHA_B}}),
  ]) {
    assert.notEqual(buildComparisonCombinationKey(variant).combinationSha256,
      baseKey.combinationSha256);
  }
}

function verifyAppendOnlySemantics() {
  const rec1 = createComparisonHistoryRecord({...makeCombinationInput(), recordedAt: TIME_1});
  const rec1Later = createComparisonHistoryRecord({...makeCombinationInput(), recordedAt: TIME_2});
  let history = appendComparisonHistoryRecord([], rec1);
  history = appendComparisonHistoryRecord(history, rec1Later);
  assert.equal(history.length, 2, MSG_APPENDED_NOT_MERGED);
  assert.throws(() => appendComparisonHistoryRecord(history, rec1), /duplicate/u);
  const summary = buildComparisonProgressSummary(history);
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.totalCombinations, 1);
  assert.equal(summary.entries[0].recordedAt, TIME_2, MSG_LATEST_SELECTED);
  assert.equal(summary.entries[0].recordsForCombination, 2);
}

async function verifyDiskWriterAppends() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oltp-history-guard-'));
  try {
    const ndjsonPath = path.join(tmpDir, 'history.ndjson');
    const summaryPath = path.join(tmpDir, 'summary.json');
    const rec1 = createComparisonHistoryRecord({...makeCombinationInput(), recordedAt: TIME_1});
    const rec2 = createComparisonHistoryRecord({...makeCombinationInput(), recordedAt: TIME_2});
    await recordComparisonResultToDisk({record: rec1, ndjsonPath, summaryPath});
    const before = await fs.readFile(ndjsonPath, UTF8);
    const second = await recordComparisonResultToDisk({record: rec2, ndjsonPath, summaryPath});
    const after = await fs.readFile(ndjsonPath, UTF8);
    assert.equal(stringStartsWith(after, before), true, MSG_BYTES_PRESERVED);
    assert.equal(second.records.length, 2);
    await assert.rejects(recordComparisonResultToDisk({record: rec2, ndjsonPath, summaryPath}),
      /duplicate/u);
    assert.equal(await fs.readFile(ndjsonPath, UTF8), after, MSG_REFUSED_UNCHANGED);
  } finally {
    await fs.rm(tmpDir, {recursive: true, force: true});
  }
}

async function verifyCommittedDataAndPages(rootDir) {
  const read = (rel) => fs.readFile(path.resolve(rootDir, rel), UTF8);
  const records = parseComparisonHistoryNdjson(await read(DEFAULT_COMPARISON_HISTORY_NDJSON_PATH));
  const summary = buildComparisonProgressSummary(records,
    {invalidations: readInvalidationLedger(rootDir)});
  assert.equal(`${JSON.stringify(summary, null, 2)}\n`,
    await read(DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH), MSG_SUMMARY_CURRENT);
  assert.equal(summary.totalRecords, records.length);
  assert.equal(arrayEvery(summary.entries,
    (e) => e.admission.status !== CLAIM_CELL_STATUS.VALID_OBSERVED), true,
  MSG_FORENSIC_ONLY);
  const rendered = renderComparisonProgress(summary);
  assert.equal(rendered.svg, await read(DEFAULT_COMPARISON_PROGRESS_SVG_PATH));
  assert.equal(rendered.scenarioBSvg, await read(DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH));
  assert.equal(rendered.markdown, await read(DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH));
  assert.equal(rendered.html, await read(DEFAULT_COMPARISON_PROGRESS_HTML_PATH));
  for (const href of arrayMap([SCENARIO_A, SCENARIO_B], getScenarioDefinitionHref)) {
    assert.equal(stringIncludes(rendered.markdown, href), true, `history page links ${href}`);
  }
  assert.equal(stringIncludes(await read(DOCS_README_PATH), HISTORY_PAGE_LINK), true);
}

verifyCombinationKeySensitivities();
verifyAppendOnlySemantics();
await verifyDiskWriterAppends();
await verifyCommittedDataAndPages(REPO_ROOT);
console.log(PASS_MESSAGE);
