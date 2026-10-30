import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  OLTP_COMPARISON_HISTORY_SCHEMA_VERSION,
  buildComparisonCombinationKey,
  buildComparisonProgressSummary,
  createComparisonHistoryRecord,
  parseComparisonHistoryNdjson,
  recordComparisonResultToDisk,
  serializeComparisonHistoryNdjson,
  upsertComparisonHistoryRecord,
  validateComparisonHistoryRecord,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
  DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  renderComparisonProgressHtml,
  renderComparisonProgressMarkdown,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
  writeComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/oltp-comparison-static-web.js';
import {
  escapeXml,
  formatNum,
  formatSigned,
  shortSha,
  getScenarioBEntries,
} from '../../test/distributed/harness/oltp-comparison-svg-renderer.js';

const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const NEWLINE = '\n';
const PASS_MESSAGE = 'oltp-comparison-history-store-guard: PASS';
const FW_V1 = '0.3.0';
const FW_V2 = '0.3.1';
const SHA_A = '8039e45f2ad8314239ed8c67c9883ebb8b47ec9f';
const SHA_B = '66d054c9c9e3546b576fc5fe96db8911ce4431a4';
const SCENARIO_A = 'scenario-a';
const SCENARIO_B = 'scenario-b';
const PROFILE_A = 'profile-a';
const PROFILE_B = 'profile-b';
const SYS_V1 = 'v8.5.8';
const SYS_V2 = 'v8.5.9';
const SYS_SHA_A = 'pingcap/tidb:v8.5.8';
const SYS_SHA_B = 'pingcap/tidb:v8.5.9';
const LAG_V1 = '0.3.0';
const LAG_V2 = '0.3.1';
const TIME_1 = '2026-10-30T10:00:00.000Z';
const TIME_2 = '2026-10-30T11:00:00.000Z';
const TMP_PREFIX = 'cmp-store-guard-';
const TMP_NDJSON_NAME = 'history.ndjson';
const TMP_SUMMARY_NAME = 'summary.json';
const TMP_SVG_NAME = 'progress.svg';
const TMP_MD_NAME = 'progress.md';
const TMP_HTML_NAME = 'progress.html';
const README_PATH = 'README.md';
const DOCS_README_PATH = 'docs/README.md';
const LINK_MD = 'tidb-comparison-progress.md';
const LINK_HTML = 'tidb-comparison-progress.html';
const MIN_COMBINATIONS = 4;
const TMP_SCENARIO_B_SVG_NAME = 'scenario-b.svg';
const MARKER_RISK_DECISIONS = 'Risk Decisions/sec';
const MARKER_WAN_TRAFFIC = 'Cross-Island WAN Traffic';
const MARKER_SCENARIO_B_SVG_FILE = 'tidb-scenario-b-comparison.svg';
const ESCAPE_XML_INPUT = '<test & "val\'>';
const ESCAPE_XML_EXPECTED = '&lt;test &amp; &quot;val&#39;&gt;';
const NUM_FORMAT_INPUT = 12.3456;
const NUM_FORMAT_EXPECTED = '12.35';
const SIGNED_POS_INPUT = 5.2;
const SIGNED_POS_EXPECTED = '+5.20';
const SIGNED_NEG_INPUT = -3.1;
const SIGNED_NEG_EXPECTED = '-3.10';
const SHA_INPUT = '0123456789abcdef';
const SHA_EXPECTED_LEN = 8;
const SHA_EXPECTED = '01234567';
const SCENARIO_B_FULL_ID = 'tidb-distributed-risk-decision';

function verifySvgRendererHelpers() {
  assert.equal(escapeXml(ESCAPE_XML_INPUT), ESCAPE_XML_EXPECTED);
  assert.equal(formatNum(NUM_FORMAT_INPUT), NUM_FORMAT_EXPECTED);
  assert.equal(formatSigned(SIGNED_POS_INPUT), SIGNED_POS_EXPECTED);
  assert.equal(formatSigned(SIGNED_NEG_INPUT), SIGNED_NEG_EXPECTED);
  assert.equal(shortSha(SHA_INPUT, SHA_EXPECTED_LEN), SHA_EXPECTED);
  const sampleEntries = [
    {framework: {scenarioId: SCENARIO_A}},
    {
      record: {
        framework: {scenarioId: SCENARIO_B_FULL_ID},
        metrics: {lagrange: {scenarioBScorecard: {}}},
      },
    },
  ];
  const bEntries = getScenarioBEntries(sampleEntries);
  assert.equal(bEntries.length, 1);
}

function makeCombinationInput(overrides = {}) {
  return {
    framework: {
      frameworkVersion: FW_V1,
      frameworkCommitSha: SHA_A,
      scenarioId: SCENARIO_A,
      profileId: PROFILE_A,
      ...overrides.framework,
    },
    systems: {
      lagrange: {present: true, version: LAG_V1, commitSha: SHA_A, ...overrides.lagrange},
      tidbTikv: {present: true, version: SYS_V1, commitSha: SYS_SHA_A, ...overrides.tidbTikv},
    },
  };
}

async function verifyCombinationKeySensitivities() {
  const baseInput = makeCombinationInput();
  const baseKey = buildComparisonCombinationKey(baseInput);
  const repeatedKey = buildComparisonCombinationKey(baseInput);

  assert.equal(baseKey.combinationKey, repeatedKey.combinationKey);
  assert.equal(baseKey.combinationSha256, repeatedKey.combinationSha256);

  const variations = [
    makeCombinationInput({framework: {frameworkVersion: FW_V2}}),
    makeCombinationInput({framework: {frameworkCommitSha: SHA_B}}),
    makeCombinationInput({framework: {scenarioId: SCENARIO_B}}),
    makeCombinationInput({framework: {profileId: PROFILE_B}}),
    makeCombinationInput({lagrange: {version: LAG_V2}}),
    makeCombinationInput({lagrange: {commitSha: SHA_B}}),
    makeCombinationInput({tidbTikv: {version: SYS_V2}}),
    makeCombinationInput({tidbTikv: {commitSha: SYS_SHA_B}}),
  ];

  for (const variant of variations) {
    const variantKey = buildComparisonCombinationKey(variant);
    assert.notEqual(variantKey.combinationKey, baseKey.combinationKey);
    assert.notEqual(variantKey.combinationSha256, baseKey.combinationSha256);
  }
}

async function verifyUpsertSemantics() {
  const rec1 = createComparisonHistoryRecord({
    ...makeCombinationInput(),
    recordedAt: TIME_1,
  });
  validateComparisonHistoryRecord(rec1);

  const rec1Updated = createComparisonHistoryRecord({
    ...makeCombinationInput(),
    recordedAt: TIME_2,
  });

  const rec2 = createComparisonHistoryRecord({
    ...makeCombinationInput({framework: {frameworkVersion: FW_V2}}),
    recordedAt: TIME_2,
  });

  let history = upsertComparisonHistoryRecord([], rec1);
  assert.equal(history.length, 1);
  assert.equal(history[0].recordedAt, TIME_1);

  history = upsertComparisonHistoryRecord(history, rec1Updated);
  assert.equal(history.length, 1);
  assert.equal(history[0].recordedAt, TIME_2);

  history = upsertComparisonHistoryRecord(history, rec2);
  assert.equal(history.length, 2);
}

async function verifyEndToEndDiskAndStaticWeb() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
  try {
    const tmpNdjson = path.join(tmpDir, TMP_NDJSON_NAME);
    const tmpSummary = path.join(tmpDir, TMP_SUMMARY_NAME);
    const tmpSvg = path.join(tmpDir, TMP_SVG_NAME);
    const tmpScenarioBSvg = path.join(tmpDir, TMP_SCENARIO_B_SVG_NAME);
    const tmpMd = path.join(tmpDir, TMP_MD_NAME);
    const tmpHtml = path.join(tmpDir, TMP_HTML_NAME);

    const rec = createComparisonHistoryRecord({
      ...makeCombinationInput(),
      recordedAt: TIME_1,
    });

    const diskResult = await recordComparisonResultToDisk({
      record: rec,
      ndjsonPath: tmpNdjson,
      summaryPath: tmpSummary,
    });
    assert.equal(diskResult.records.length, 1);
    assert.equal(diskResult.summary.totalCombinations, 1);

    const webResult = await writeComparisonStaticWebArtifacts({
      summary: diskResult.summary,
      svgPath: tmpSvg,
      scenarioBSvgPath: tmpScenarioBSvg,
      markdownPath: tmpMd,
      htmlPath: tmpHtml,
    });
    assert.equal(typeof webResult.svg === 'string', true);
    assert.equal(typeof webResult.scenarioBSvg === 'string', true);
    assert.equal(typeof webResult.markdown === 'string', true);
    assert.equal(typeof webResult.html === 'string', true);
  } finally {
    await fs.rm(tmpDir, {recursive: true, force: true});
  }
}

async function verifyCommittedDataAndWebArtifacts() {
  const rawNdjson = await fs.readFile(DEFAULT_COMPARISON_HISTORY_NDJSON_PATH, UTF8);
  const rawSummary = await fs.readFile(DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH, UTF8);
  const parsedRecords = parseComparisonHistoryNdjson(rawNdjson);

  assert.equal(parsedRecords.length >= MIN_COMBINATIONS, true);
  assert.equal(serializeComparisonHistoryNdjson(parsedRecords), rawNdjson);

  const summary = buildComparisonProgressSummary(parsedRecords);
  assert.equal(summary.schemaVersion, OLTP_COMPARISON_HISTORY_SCHEMA_VERSION);
  assert.equal(summary.totalCombinations, parsedRecords.length);
  assert.equal(JSON.stringify(summary, null, 2) + NEWLINE, rawSummary);

  const rawSvg = await fs.readFile(DEFAULT_COMPARISON_PROGRESS_SVG_PATH, UTF8);
  const rawScenarioBSvg = await fs.readFile(DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH, UTF8);
  const rawMd = await fs.readFile(DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH, UTF8);
  const rawHtml = await fs.readFile(DEFAULT_COMPARISON_PROGRESS_HTML_PATH, UTF8);

  assert.equal(renderComparisonProgressSvg(summary), rawSvg);
  assert.equal(renderScenarioBComparisonSvg(summary), rawScenarioBSvg);
  assert.equal(renderComparisonProgressMarkdown(summary), rawMd);
  assert.equal(renderComparisonProgressHtml(summary), rawHtml);

  assert.equal(stringIncludes(rawSvg, MARKER_RISK_DECISIONS), true);
  assert.equal(stringIncludes(rawSvg, MARKER_WAN_TRAFFIC), true);
  assert.equal(stringIncludes(rawScenarioBSvg, MARKER_RISK_DECISIONS), true);
  assert.equal(stringIncludes(rawScenarioBSvg, MARKER_WAN_TRAFFIC), true);
  assert.equal(stringIncludes(rawMd, MARKER_SCENARIO_B_SVG_FILE), true);
  assert.equal(stringIncludes(rawHtml, MARKER_RISK_DECISIONS), true);
  assert.equal(stringIncludes(rawHtml, MARKER_WAN_TRAFFIC), true);

  const rootReadme = await fs.readFile(README_PATH, UTF8);
  const docsReadme = await fs.readFile(DOCS_README_PATH, UTF8);
  assert.equal(stringIncludes(rootReadme, LINK_MD), true);
  assert.equal(stringIncludes(rootReadme, LINK_HTML), true);
  assert.equal(stringIncludes(docsReadme, LINK_MD), true);
  assert.equal(stringIncludes(docsReadme, LINK_HTML), true);
}

const runGuard = async () => {
  verifySvgRendererHelpers();
  await verifyCombinationKeySensitivities();
  await verifyUpsertSemantics();
  await verifyEndToEndDiskAndStaticWeb();
  await verifyCommittedDataAndWebArtifacts();
};

await runGuard();

console.log(PASS_MESSAGE);
