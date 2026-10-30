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

function renderComparisonProgressMarkdown(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const matrixRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const fv = r?.framework?.frameworkVersion || '1.0.0';
    const fc = shortSha(r?.framework?.frameworkCommitSha);
    const scId = r?.framework?.scenarioId || 'scenario-a';
    const sc = `[${scId}](${getScenarioDefinitionHref(scId)}) / ${r?.framework?.profileId || 'default'}`;
    const lv = `${r?.systems?.lagrange?.version || 'n/a'} (${shortSha(r?.systems?.lagrange?.commitSha)})`;
    const tv = `${r?.systems?.tidbTikv?.version || 'n/a'} (${shortSha(r?.systems?.tidbTikv?.commitSha)})`;
    return `| ${r?.recordedAt || 'unknown'} | ${fv} (${fc}) | ${sc} | ${lv} | ${tv} | ${shortSha(r?.combinationSha256, 16)} |`;
  }), '\n');

  const progressionRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const scId = r?.framework?.scenarioId || 'scenario-a';
    const sc = `[${scId}](${getScenarioDefinitionHref(scId)})`;
    const lm = `${formatNum(r?.metrics?.lagrange?.opsPerSec)} (${formatNum(r?.metrics?.lagrange?.latencyMs?.p50)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p95)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p99)})`;
    const tm = `${formatNum(r?.metrics?.tidbTikv?.opsPerSec)} (${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p50)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p95)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p99)})`;
    const ratio = `${formatNum(r?.comparison?.throughputRatioLagrangeToTiDb, 3)}x (${formatNum(r?.comparison?.throughputLagFactorTiDbOverLagrange, 2)}x lag)`;
    const proofs = `${r?.metrics?.lagrange?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.lagrange?.semanticProofs?.requiredCount ?? 33} vs ${r?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.tidbTikv?.semanticProofs?.requiredCount ?? 33}`;
    return `| ${r?.recordedAt || 'unknown'} | ${sc} | ${lm} | ${tm} | ${ratio} | ${proofs} |`;
  }), '\n');

  const deltaRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const deltas = e.deltas || e;
    const fc = shortSha(r?.framework?.frameworkCommitSha);
    const ld = `${formatSigned(deltas?.lagrangeOpsPerSecDeltaFromPrev)} / ${formatSigned(deltas?.lagrangeOpsPerSecDeltaFromFirst)}`;
    const td = `${formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev)} / ${formatSigned(deltas?.tidbOpsPerSecDeltaFromFirst)}`;
    const rd = formatSigned(deltas?.throughputRatioDeltaFromPrev, 3);
    const fd = formatSigned(deltas?.throughputLagFactorDeltaFromPrev, 2);
    const pd = formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0);
    return `| ${r?.recordedAt || 'unknown'} | ${fc} | ${ld} | ${td} | ${rd} | ${fd} | ${pd} |`;
  }), '\n');

  const bEntries = getScenarioBEntries(entries);
  const bRows = arrayJoin(arrayMap(bEntries, (e) => {
    const r = e.record || e;
    const ls = r?.metrics?.lagrange?.scenarioBScorecard;
    const ts = r?.metrics?.tidbTikv?.scenarioBScorecard;
    return `| ${r?.recordedAt || 'unknown'} | [${r?.framework?.profileId || 'default'}](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | ` +
      `${ls?.crossIslandBytesPerRequest ?? 'n/a'} | ${ts?.crossIslandBytesPerRequest ?? 'n/a'} | ` +
      `${formatNum(ls?.duringMoveP99Ms)} | ${formatNum(ts?.duringMoveP99Ms)} | ` +
      `${formatNum(ls?.routingConvergenceMs)} vs ${formatNum(ts?.routingConvergenceMs)} |`;
  }), '\n');
  const bSection = bEntries.length > 0 ?
    '\n## Scenario B distributed risk & movement scorecard ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))\n\n' +
    '![Scenario B distributed risk and movement comparison chart](tidb-scenario-b-comparison.svg)\n\n' +
    '| Recorded (UTC) | Profile | Lagrange Cross-Island Bytes/Req | ' +
    'TiDB Cross-Island Bytes/Req | Lagrange Move p99 (ms) | TiDB Move p99 (ms) | ' +
    'Convergence (Lagrange vs TiDB ms) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${bRows}\n` : '';

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

function renderComparisonProgressHtml(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const svg = renderComparisonProgressSvg(summary);

  const matrixTrs = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const fv = escapeXml(`${r?.framework?.frameworkVersion || '1.0.0'} (${shortSha(r?.framework?.frameworkCommitSha)})`);
    const scId = r?.framework?.scenarioId || 'scenario-a';
    const sc = `<a href="${escapeXml(getScenarioDefinitionHref(scId))}">${escapeXml(scId)}</a> / ${escapeXml(r?.framework?.profileId || 'default')}`;
    const lv = escapeXml(`${r?.systems?.lagrange?.version || 'n/a'} (${shortSha(r?.systems?.lagrange?.commitSha)})`);
    const tv = escapeXml(`${r?.systems?.tidbTikv?.version || 'n/a'} (${shortSha(r?.systems?.tidbTikv?.commitSha)})`);
    const dig = `<span class="badge">${escapeXml(shortSha(r?.combinationSha256, 16))}</span>`;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td><td>${fv}</td><td>${sc}</td><td>${lv}</td><td>${tv}</td><td>${dig}</td></tr>`;
  }), '\n');

  const progressTrs = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const deltas = e.deltas || e;
    const scId = r?.framework?.scenarioId || 'scenario-a';
    const scLink = `<a href="${escapeXml(getScenarioDefinitionHref(scId))}">${escapeXml(scId)}</a>`;
    const lm = `${formatNum(r?.metrics?.lagrange?.opsPerSec)} ops/s`;
    const llat = `${formatNum(r?.metrics?.lagrange?.latencyMs?.p50)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p95)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p99)} ms`;
    const tm = `${formatNum(r?.metrics?.tidbTikv?.opsPerSec)} ops/s`;
    const tlat = `${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p50)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p95)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p99)} ms`;
    const ratio = `${formatNum(r?.comparison?.throughputRatioLagrangeToTiDb, 3)}x (${formatNum(r?.comparison?.throughputLagFactorTiDbOverLagrange, 2)}x lag)`;
    const retries = escapeXml(String(r?.metrics?.tidbTikv?.transactions?.retries ?? 0));
    const proofs = `${r?.metrics?.lagrange?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.lagrange?.semanticProofs?.requiredCount ?? 33} vs ${r?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.tidbTikv?.semanticProofs?.requiredCount ?? 33}`;
    const deltasStr = `TiDB ops: ${formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev)}, proofs: ${formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0)}`;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td><td>${scLink}</td><td>${lm}</td><td>${llat}</td><td>${tm}</td><td>${tlat}</td><td>${ratio}</td><td>${retries}</td><td>${proofs}</td><td>${deltasStr}</td></tr>`;
  }), '\n');

  const bEntries = getScenarioBEntries(entries);
  const bTrs = arrayJoin(arrayMap(bEntries, (e) => {
    const r = e.record || e;
    const ls = r?.metrics?.lagrange?.scenarioBScorecard;
    const ts = r?.metrics?.tidbTikv?.scenarioBScorecard;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td>` +
      `<td><a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">${escapeXml(r?.framework?.profileId || 'default')}</a></td>` +
      `<td>${escapeXml(ls?.crossIslandBytesPerRequest ?? 'n/a')}</td>` +
      `<td>${escapeXml(ts?.crossIslandBytesPerRequest ?? 'n/a')}</td>` +
      `<td>${formatNum(ls?.duringMoveP99Ms)}</td><td>${formatNum(ts?.duringMoveP99Ms)}</td>` +
      `<td>${formatNum(ls?.routingConvergenceMs)} vs ` +
      `${formatNum(ts?.routingConvergenceMs)}</td></tr>`;
  }), '\n');
  const bCard = bEntries.length > 0 ?
    '    <div class="card">\n' +
    '      <h2><a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B Distributed Risk &amp; Movement Scorecard (tidb-distributed-risk-decision)</a></h2>\n' +
    `      <div class="chart-box">${renderScenarioBComparisonSvg(summary)}</div>\n` +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Profile</th>' +
    '<th>Lagrange Cross-Island Bytes/Req</th><th>TiDB Cross-Island Bytes/Req</th>' +
    '<th>Lagrange Move p99 (ms)</th><th>TiDB Move p99 (ms)</th>' +
    '<th>Convergence (Lagrange vs TiDB ms)</th></tr></thead>\n' +
    `      <tbody>\n${bTrs}\n      </tbody></table>\n    </div>\n` : '';

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
    `      <tbody>\n${matrixTrs || '        <tr><td colspan="6">No combinations recorded</td></tr>'}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Performance &amp; Semantic Closure Progression</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Scenario</th><th>Lagrange ops/s</th><th>Lagrange Latency</th><th>TiDB ops/s</th><th>TiDB Latency</th><th>Ratio</th><th>Retries</th><th>Proofs</th><th>Deltas</th></tr></thead>\n' +
    `      <tbody>\n${progressTrs || '        <tr><td colspan="10">No progression recorded</td></tr>'}\n      </tbody></table>\n` +
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
