import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  escapeXml,
  formatNum,
  formatSigned,
  shortSha,
  getScenarioBEntries,
  getScenarioDefinitionHref,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
} from './oltp-comparison-svg-renderer.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);

const DEFAULT_COMPARISON_PROGRESS_SVG_PATH = 'docs/benchmarks/tidb-comparison-progress.svg';
const DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH = 'docs/benchmarks/tidb-scenario-b-comparison.svg';
const DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH = 'docs/benchmarks/tidb-comparison-progress.md';
const DEFAULT_COMPARISON_PROGRESS_HTML_PATH = 'docs/benchmarks/tidb-comparison-progress.html';

function unwrapRecord(entry) {
  if (!entry) return undefined;
  return entry.record || entry;
}

function getFrameworkSummary(fw) {
  const version = fw?.frameworkVersion || '1.0.0';
  const sha = shortSha(fw?.frameworkCommitSha);
  const scenarioId = fw?.scenarioId || 'scenario-a';
  const profile = fw?.profileId || 'default';
  const href = getScenarioDefinitionHref(scenarioId);
  return {
    versionSha: `${version} (${sha})`,
    scenarioId,
    profile,
    href,
  };
}

function getSystemSummary(sys) {
  const version = sys?.version || 'n/a';
  const sha = shortSha(sys?.commitSha);
  return `${version} (${sha})`;
}

function renderMatrixMarkdownRow(e) {
  const r = unwrapRecord(e);
  const fw = getFrameworkSummary(r?.framework);
  const sc = `[${fw.scenarioId}](${fw.href}) / ${fw.profile}`;
  const lv = getSystemSummary(r?.systems?.lagrange);
  const tv = getSystemSummary(r?.systems?.tidbTikv);
  const recorded = r?.recordedAt || 'unknown';
  const digest = shortSha(r?.combinationSha256, 16);
  return `| ${recorded} | ${fw.versionSha} | ${sc} | ${lv} | ${tv} | ${digest} |`;
}

function renderMatrixHtmlRow(e) {
  const r = unwrapRecord(e);
  const fw = getFrameworkSummary(r?.framework);
  const sc = `<a href="${escapeXml(fw.href)}">${escapeXml(fw.scenarioId)}</a> / ${escapeXml(fw.profile)}`;
  const lv = escapeXml(getSystemSummary(r?.systems?.lagrange));
  const tv = escapeXml(getSystemSummary(r?.systems?.tidbTikv));
  const recorded = escapeXml(r?.recordedAt || 'unknown');
  const digest = escapeXml(shortSha(r?.combinationSha256, 16));
  const fv = escapeXml(fw.versionSha);
  const badge = `<span class="badge">${digest}</span>`;
  return `        <tr><td>${recorded}</td><td>${fv}</td><td>${sc}</td><td>${lv}</td><td>${tv}</td><td>${badge}</td></tr>`;
}

function formatLatencyTriple(lat) {
  const p50 = formatNum(lat?.p50);
  const p95 = formatNum(lat?.p95);
  const p99 = formatNum(lat?.p99);
  return `${p50} / ${p95} / ${p99}`;
}

function formatSystemPerfSummary(metrics) {
  const ops = formatNum(metrics?.opsPerSec);
  const triple = formatLatencyTriple(metrics?.latencyMs);
  return `${ops} (${triple})`;
}

function formatComparisonRatio(comp) {
  const ratio = formatNum(comp?.throughputRatioLagrangeToTiDb, 3);
  const lag = formatNum(comp?.throughputLagFactorTiDbOverLagrange, 2);
  return `${ratio}x (${lag}x lag)`;
}

function formatProofCount(proofs, defaultReq = 33) {
  const passed = proofs?.passedCount ?? 0;
  const req = proofs?.requiredCount ?? defaultReq;
  return `${passed}/${req}`;
}

function formatScenarioProofs(metrics) {
  const lag = formatProofCount(metrics?.lagrange?.semanticProofs, 33);
  const tidb = formatProofCount(metrics?.tidbTikv?.semanticProofs, 33);
  return `${lag} vs ${tidb}`;
}

function getScenarioLink(scenarioId, isHtml = false) {
  const scId = scenarioId || 'scenario-a';
  const href = getScenarioDefinitionHref(scId);
  if (isHtml) {
    return `<a href="${escapeXml(href)}">${escapeXml(scId)}</a>`;
  }
  return `[${scId}](${href})`;
}

function renderProgressionMarkdownRow(e) {
  const r = unwrapRecord(e);
  const m = r?.metrics;
  const sc = getScenarioLink(r?.framework?.scenarioId, false);
  const lm = formatSystemPerfSummary(m?.lagrange);
  const tm = formatSystemPerfSummary(m?.tidbTikv);
  const ratio = formatComparisonRatio(r?.comparison);
  const proofs = formatScenarioProofs(m);
  const recorded = r?.recordedAt || 'unknown';
  return `| ${recorded} | ${sc} | ${lm} | ${tm} | ${ratio} | ${proofs} |`;
}

function formatDeltasSummary(deltas) {
  const opsDelta = formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev);
  const proofDelta = formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0);
  return `TiDB ops: ${opsDelta}, proofs: ${proofDelta}`;
}

function getProgressionMetricsSummary(metrics) {
  const lag = metrics?.lagrange;
  const tidb = metrics?.tidbTikv;
  return {
    lm: `${formatNum(lag?.opsPerSec)} ops/s`,
    llat: `${formatLatencyTriple(lag?.latencyMs)} ms`,
    tm: `${formatNum(tidb?.opsPerSec)} ops/s`,
    tlat: `${formatLatencyTriple(tidb?.latencyMs)} ms`,
    retries: escapeXml(String(tidb?.transactions?.retries ?? 0)),
    proofs: formatScenarioProofs(metrics),
  };
}

function renderProgressionHtmlRow(e) {
  const r = unwrapRecord(e);
  const deltas = e.deltas || e;
  const scLink = getScenarioLink(r?.framework?.scenarioId, true);
  const p = getProgressionMetricsSummary(r?.metrics);
  const ratio = formatComparisonRatio(r?.comparison);
  const deltasStr = formatDeltasSummary(deltas);
  const recorded = escapeXml(r?.recordedAt || 'unknown');
  return `        <tr><td>${recorded}</td><td>${scLink}</td><td>${p.lm}</td><td>${p.llat}</td>` +
    `<td>${p.tm}</td><td>${p.tlat}</td><td>${ratio}</td><td>${p.retries}</td>` +
    `<td>${p.proofs}</td><td>${deltasStr}</td></tr>`;
}

function formatDeltaColumns(deltas) {
  const lp = formatSigned(deltas?.lagrangeOpsPerSecDeltaFromPrev);
  const lf = formatSigned(deltas?.lagrangeOpsPerSecDeltaFromFirst);
  const tp = formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev);
  const tf = formatSigned(deltas?.tidbOpsPerSecDeltaFromFirst);
  return {
    ld: `${lp} / ${lf}`,
    td: `${tp} / ${tf}`,
    rd: formatSigned(deltas?.throughputRatioDeltaFromPrev, 3),
    fd: formatSigned(deltas?.throughputLagFactorDeltaFromPrev, 2),
    pd: formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0),
  };
}

function renderDeltaMarkdownRow(e) {
  const r = unwrapRecord(e);
  const deltas = e.deltas || e;
  const fc = shortSha(r?.framework?.frameworkCommitSha);
  const d = formatDeltaColumns(deltas);
  const recorded = r?.recordedAt || 'unknown';
  return `| ${recorded} | ${fc} | ${d.ld} | ${d.td} | ${d.rd} | ${d.fd} | ${d.pd} |`;
}

function extractScorecardMetrics(sc) {
  return {
    bytes: sc?.crossIslandBytesPerRequest ?? 'n/a',
    moveP99: formatNum(sc?.duringMoveP99Ms),
    convMs: formatNum(sc?.routingConvergenceMs),
  };
}

function extractScenarioBFields(r) {
  const m = r?.metrics;
  const ls = extractScorecardMetrics(m?.lagrange?.scenarioBScorecard);
  const ts = extractScorecardMetrics(m?.tidbTikv?.scenarioBScorecard);
  return {
    recorded: r?.recordedAt || 'unknown',
    profile: r?.framework?.profileId || 'default',
    ls,
    ts,
  };
}

function renderScenarioBMarkdownRow(e) {
  const r = unwrapRecord(e);
  const f = extractScenarioBFields(r);
  const profLink = `[${f.profile}](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)`;
  return `| ${f.recorded} | ${profLink} | ` +
    `${f.ls.bytes} | ${f.ts.bytes} | ` +
    `${f.ls.moveP99} | ${f.ts.moveP99} | ` +
    `${f.ls.convMs} vs ${f.ts.convMs} |`;
}

function renderScenarioBHtmlRow(e) {
  const r = unwrapRecord(e);
  const f = extractScenarioBFields(r);
  const recorded = escapeXml(f.recorded);
  const profLink = `<a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">${escapeXml(f.profile)}</a>`;
  const lBytes = escapeXml(String(f.ls.bytes));
  const tBytes = escapeXml(String(f.ts.bytes));
  return `        <tr><td>${recorded}</td>` +
    `<td>${profLink}</td>` +
    `<td>${lBytes}</td><td>${tBytes}</td>` +
    `<td>${f.ls.moveP99}</td><td>${f.ts.moveP99}</td>` +
    `<td>${f.ls.convMs} vs ${f.ts.convMs}</td></tr>`;
}

function renderScenarioBMarkdownSection(bEntries) {
  if (bEntries.length === 0) return '';
  const bRows = arrayJoin(arrayMap(bEntries, renderScenarioBMarkdownRow), '\n');
  return '\n## Scenario B distributed risk & movement scorecard ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))\n\n' +
    '> **Provenance notice (`local-oracle-plus-network-model` | `contract-model-non-comparable`):** ' +
    'This series combines local JavaScript request-oracle execution with stage-delay and payload-multiplier formulas ' +
    '(`stages * oneWayMs` vs `stages * 2 * oneWayMs`, `stages * 96 B` vs `stages * 4096 B`) ' +
    'and is classified as a non-comparable modeled hypothesis rather than live cluster wire execution.\n\n' +
    '![Scenario B distributed risk and movement comparison chart](tidb-scenario-b-comparison.svg)\n\n' +
    '| Recorded (UTC) | Profile | Lagrange Cross-Island Bytes/Req | ' +
    'TiDB Cross-Island Bytes/Req | Lagrange Move p99 (ms) | TiDB Move p99 (ms) | ' +
    'Convergence (Lagrange vs TiDB ms) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${bRows}\n`;
}

function renderComparisonProgressMarkdown(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const matrixRows = arrayJoin(arrayMap(entries, renderMatrixMarkdownRow), '\n');
  const progressionRows = arrayJoin(arrayMap(entries, renderProgressionMarkdownRow), '\n');
  const deltaRows = arrayJoin(arrayMap(entries, renderDeltaMarkdownRow), '\n');
  const bEntries = getScenarioBEntries(entries);
  const bSection = renderScenarioBMarkdownSection(bEntries);

  return '# TiDB/TiKV and Lagrange Comparison Progress\n\n' +
    'This page is generated deterministically from [`data/tidb-comparison/history.ndjson`](../../data/tidb-comparison/history.ndjson) and [`data/tidb-comparison/progress-summary.json`](../../data/tidb-comparison/progress-summary.json), persisting results for every combination of comparison framework version/commit, scenario profile, and both compared systems\' versions and commit hashes.\n\n' +
    '- Static HTML dashboard: [`tidb-comparison-progress.html`](tidb-comparison-progress.html)\n' +
    '- Scenario specifications: [Scenario A (`tidb-oltp-baseline`)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B (`tidb-distributed-risk-decision`)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate (`scenario-a-semantic-closure`)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)\n\n' +
    '![TiDB and Lagrange comparison progress chart](tidb-comparison-progress.svg)\n\n' +
    '## Recorded version and commit combinations\n\n' +
    '| Recorded (UTC) | Framework Version & Commit | Scenario / Profile | Lagrange Version & Commit | TiDB/TiKV Version & Commit | Combination Digest |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${matrixRows || '| None recorded | - | - | - | - | - |'}\n\n` +
    '## Throughput, latency, and semantic proof progression\n\n' +
    '| Recorded (UTC) | Scenario | Lagrange ops/s (p50 / p95 / p99 ms) | TiDB/TiKV ops/s (p50 / p95 / p99 ms) | Throughput Ratio (Lagrange / TiDB) | Semantic Proofs (Lagrange / TiDB) |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${progressionRows || '| None recorded | - | - | - | - | - |'}\n\n` +
    '## Progress deltas over time\n\n' +
    '| Recorded (UTC) | Framework Commit | Lagrange ops/s Delta (prev / first) | TiDB ops/s Delta (prev / first) | Ratio Delta (prev) | Lag Factor Delta (prev) | TiDB Proofs Delta (prev) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${deltaRows || '| None recorded | - | - | - | - | - | - |'}\n` +
    bSection;
}

function renderScenarioBHtmlCard(summary, bEntries) {
  if (bEntries.length === 0) return '';
  const bTrs = arrayJoin(arrayMap(bEntries, renderScenarioBHtmlRow), '\n');
  return '    <div class="card">\n' +
    '      <h2><a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B Distributed Risk &amp; Movement Scorecard (tidb-distributed-risk-decision)</a></h2>\n' +
    '      <p class="desc"><strong>Provenance notice (<code>local-oracle-plus-network-model</code> | <code>contract-model-non-comparable</code>):</strong> ' +
    'This series combines local JavaScript request-oracle execution with stage-delay and payload-multiplier formulas ' +
    '(<code>stages * oneWayMs</code> vs <code>stages * 2 * oneWayMs</code>, <code>stages * 96 B</code> vs <code>stages * 4096 B</code>) ' +
    'and is classified as a non-comparable modeled hypothesis rather than live cluster wire execution.</p>\n' +
    `      <div class="chart-box">${renderScenarioBComparisonSvg(summary)}</div>\n` +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Profile</th>' +
    '<th>Lagrange Cross-Island Bytes/Req</th><th>TiDB Cross-Island Bytes/Req</th>' +
    '<th>Lagrange Move p99 (ms)</th><th>TiDB Move p99 (ms)</th>' +
    '<th>Convergence (Lagrange vs TiDB ms)</th></tr></thead>\n' +
    `      <tbody>\n${bTrs}\n      </tbody></table>\n    </div>\n`;
}

function renderComparisonProgressHtml(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const svg = renderComparisonProgressSvg(summary);
  const matrixTrs = arrayJoin(arrayMap(entries, renderMatrixHtmlRow), '\n');
  const progressTrs = arrayJoin(arrayMap(entries, renderProgressionHtmlRow), '\n');
  const bEntries = getScenarioBEntries(entries);
  const bCard = renderScenarioBHtmlCard(summary, bEntries);

  const matrixBody = matrixTrs || '        <tr><td colspan="6">No combinations recorded</td></tr>';
  const progressBody = progressTrs || '        <tr><td colspan="10">No progression recorded</td></tr>';

  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8"/>\n' +
    '  <title>TiDB/TiKV and Lagrange Comparison Progress</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8; }\n' +
    '    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }\n' +
    '    a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }\n' +
    '    .container { max-width: 1040px; margin: 0 auto; }\n    h1 { font-size: 22px; margin-bottom: 8px; }\n' +
    '    p.desc { color: var(--muted); font-size: 13px; margin-bottom: 16px; }\n    .chart-box { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 20px; overflow-x: auto; }\n' +
    '    .filter-bar { margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 13px; }\n    .filter-bar input { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 4px; width: 280px; }\n' +
    '    .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; overflow-x: auto; }\n    .card h2 { font-size: 15px; margin-bottom: 12px; color: var(--accent); }\n' +
    '    table.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n    table.data-table th, table.data-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }\n' +
    '    table.data-table th { color: var(--muted); font-weight: 600; }\n    .badge { font-family: monospace; background: #0f172a; padding: 2px 4px; border-radius: 3px; border: 1px solid var(--border); }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <div class="container">\n' +
    '    <h1>TiDB/TiKV and Lagrange Comparison Progress</h1>\n' +
    '    <p class="desc">Deterministic comparative progression across framework, scenario, and system combinations.</p>\n' +
    '    <p class="desc">Scenario definitions: <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A (tidb-oltp-baseline)</a> | <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B (tidb-distributed-risk-decision)</a> | <a href="tidb-reference-paired-owner.md">Paired Benchmark Owner</a> | <a href="tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate">Scenario A Semantic Gate (scenario-a-semantic-closure)</a></p>\n' +
    `    <div class="chart-box">${svg}</div>\n` +
    '    <div class="filter-bar"><label for="scenario-filter">Filter:</label><input type="text" id="scenario-filter" placeholder="Filter scenario, commit, version..."/></div>\n' +
    '    <div class="card">\n' +
    '      <h2>Version &amp; Commit Combination Matrix</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Framework</th><th>Scenario / Profile</th><th>Lagrange</th><th>TiDB/TiKV</th><th>Digest</th></tr></thead>\n' +
    `      <tbody>\n${matrixBody}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Performance &amp; Semantic Closure Progression</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Scenario</th><th>Lagrange ops/s</th><th>Lagrange Latency</th><th>TiDB ops/s</th><th>TiDB Latency</th><th>Ratio</th><th>Retries</th><th>Proofs</th><th>Deltas</th></tr></thead>\n' +
    `      <tbody>\n${progressBody}\n      </tbody></table>\n` +
    '    </div>\n' +
    bCard +
    '  </div>\n' +
    '  <script>\n' +
    '    document.getElementById(\'scenario-filter\').addEventListener(\'input\', function(e) {\n' +
    '      var q = e.target.value.toLowerCase();\n' +
    '      var rows = document.querySelectorAll(\'table.data-table tbody tr\');\n' +
    '      for (var i = 0; i < rows.length; i++) {\n' +
    '        rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q) === -1 ? \'none\' : \'\';\n' +
    '      }\n' +
    '    });\n' +
    '  </script>\n' +
    '</body>\n</html>\n';
}

async function writeComparisonStaticWebArtifacts({
  summary,
  svgPath = DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  scenarioBSvgPath = DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  markdownPath = DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  htmlPath = DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
} = {}) {
  const targetSvgPath = svgPath || DEFAULT_COMPARISON_PROGRESS_SVG_PATH;
  const targetScenarioBSvgPath = scenarioBSvgPath || DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH;
  const targetMarkdownPath = markdownPath || DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH;
  const targetHtmlPath = htmlPath || DEFAULT_COMPARISON_PROGRESS_HTML_PATH;
  const svg = renderComparisonProgressSvg(summary);
  const scenarioBSvg = renderScenarioBComparisonSvg(summary);
  const markdown = renderComparisonProgressMarkdown(summary);
  const html = renderComparisonProgressHtml(summary);

  const writeTarget = async (p, c) => {
    await mkdir(path.dirname(p), {recursive: true});
    await writeFile(p, c, 'utf8');
  };
  await writeTarget(targetSvgPath, svg);
  await writeTarget(targetScenarioBSvgPath, scenarioBSvg);
  await writeTarget(targetMarkdownPath, markdown);
  await writeTarget(targetHtmlPath, html);

  return Object.freeze({
    svg,
    scenarioBSvg,
    markdown,
    html,
    svgPath: targetSvgPath,
    scenarioBSvgPath: targetScenarioBSvgPath,
    markdownPath: targetMarkdownPath,
    htmlPath: targetHtmlPath,
  });
}

export {
  DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
  getScenarioDefinitionHref,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
  renderComparisonProgressMarkdown,
  renderComparisonProgressHtml,
  writeComparisonStaticWebArtifacts,
};
