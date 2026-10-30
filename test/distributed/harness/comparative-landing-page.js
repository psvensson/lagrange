import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  CANONICAL_DEFAULT_TARGETS,
  DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  escapeXml,
  formatNum,
  getDecisionsPerSec,
  getEvidenceTier,
  getP95,
  getP99,
  getTargets,
  getTxPerSec,
  getWireBytes,
  renderComparativeOverviewSvg,
} from './comparative-landing-svg-renderer.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);

const DEFAULT_COMPARATIVE_LANDING_MD_PATH = 'docs/benchmarks/README.md';
const DEFAULT_COMPARATIVE_LANDING_HTML_PATH = 'docs/benchmarks/index.html';

function renderExecutiveMatrixRowsMd(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const tierA = getEvidenceTier(t, 'scenarioA');
    const tierB = getEvidenceTier(t, 'scenarioB');
    const rpoZero = Boolean(t.rpoZeroSurvivability === true || t.rpoZeroSurvivability === 'Yes' || t.rpoZeroSurvivability === 'true');
    const rpoText = rpoZero ? 'Yes' : 'No';
    const detail = (t.detailPageMd && t.detailPageHtml) ?
      `[${t.detailPageMd}](${t.detailPageMd}) ([HTML](${t.detailPageHtml}))` :
      (t.detailPageMd ? `[${t.detailPageMd}](${t.detailPageMd})` : 'n/a');
    return `| ${t.label} ${t.version} | ${t.category || 'n/a'} | ${t.topologyUnits ?? 1} (${t.processCount ?? 1}) | ${rpoText} | ${formatNum(getTxPerSec(t))} (${formatNum(getP95(t))} ms) | ${formatNum(getDecisionsPerSec(t))} (${formatNum(getP99(t))} ms) | ${getWireBytes(t)} B | A: \`${tierA}\` / B: \`${tierB}\` | ${detail} |`;
  }), '\n');
}

function renderShapesRowsMd(targets) {
  const shapes = ['local-only', 'one-remote-stage', 'sequential', 'fan-out'];
  return arrayJoin(arrayMap(targets, (t) => arrayJoin(arrayMap(shapes, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    return `| ${t.label} | ${s} | ${formatNum(sh.decisionsPerSec ?? 0)} | ${formatNum(sh.p99Ms ?? 0)} | ${sh.roundTrips ?? sh.sqlRoundTripsPerDecision ?? 0} | ${sh.wanBytes ?? sh.wireBytes ?? 0} B |`;
  }), '\n')), '\n');
}

function renderMilestoneRowsMd(timeline) {
  return arrayJoin(arrayMap(timeline || [], (m) => `| ${m.milestoneId} (\`${m.commitSha}\`) | ${formatNum(m.scenarioATxPerSec)} (${formatNum(m.scenarioAP95Ms)} ms) | ${m.semanticProofPassed}/${m.semanticProofRequired} | ${formatNum(m.scenarioBDecisionsPerSec)} (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B) | ${formatNum(m.scenarioCFresh0msDecPerSec)} | \`${m.evidenceTier}\` / \`${m.executionPath}\` |`), '\n');
}

function renderProvenanceRowsMd(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA?.measurementProvenance || {};
    const b = t.scenarioB?.measurementProvenance || {};
    return `| ${t.label} | \`${a.executionPath || 'n/a'}\` (${a.latencySource || 'n/a'}) | \`${b.executionPath || 'n/a'}\` (${b.latencySource || 'n/a'}) | ${b.wireBytesSource || 'n/a'} / ${b.movementSource || 'n/a'} | ${b.comparableClusterEvidence ? 'Yes' : 'No'} |`;
  }), '\n');
}

function renderComparativeLandingMarkdown(matrix) {
  const targets = getTargets(matrix);
  const matrixRows = renderExecutiveMatrixRowsMd(targets);
  const shapeRows = renderShapesRowsMd(targets);
  const milestoneRows = renderMilestoneRowsMd(matrix?.lagrangeEvolutionTimeline);
  const provRows = renderProvenanceRowsMd(targets);

  return '# Comparative Benchmark Statistics\n\n' +
    'Deterministic multi-system comparative benchmark statistics across PostgreSQL, TiDB/TiKV, and Lagrange.\n\n' +
    '- [Interactive Comparative Statistics Dashboard (HTML)](index.html)\n' +
    '- Scenario specifications:\n' +
    '  - [Scenario A: Contended OLTP Baseline (tidb-oltp-baseline)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline)\n' +
    '  - [Scenario B: Distributed Risk Decision & Partition Movement (tidb-distributed-risk-decision)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)\n' +
    '  - [Scenario C: streaming-feature-risk-decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)\n' +
    '  - [Paired Benchmark Owner](tidb-reference-paired-owner.md)\n' +
    '  - [Scenario A Semantic Evidence Gate (scenario-a-semantic-closure)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)\n' +
    '- Detail pages:\n' +
    '  - [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) ([HTML](lagrange-metrics-evolution.html))\n' +
    '  - [TiDB / TiKV & Lagrange Comparison Progress](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html))\n' +
    '  - [PostgreSQL Single-Primary & Patroni Sync-HA Comparison](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html))\n' +
    '  - [Citus Colocated Tables & Distributed Functions Comparison](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html))\n' +
    '  - [YugabyteDB & Apache Ignite 3 Colocated Compute Comparison](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html))\n' +
    '  - [Scenario C: PostgreSQL 17 + Valkey 8 Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html))\n\n' +
    '![Multi-system comparative benchmark overview](comparative-overview.svg)\n\n' +
    'Standalone charts: [Scenario B standalone chart](tidb-scenario-b-comparison.svg) | [TiDB comparison progress chart](tidb-comparison-progress.svg)\n\n' +
    '## Evidence-tier and measurement boundary qualification\n\n' +
    'This comparative benchmark suite qualifies results across two rigorous evidence tiers:\n' +
    '- `observed-docker-cluster`: live containerized cluster execution with recorded container lifecycles, real operating system processes, and measured network and storage calls.\n' +
    '- `modeled-topology-oracle`: deterministic request-oracle execution paired with topology round-trip, quorum, and wire-transfer accounting over identical logical workloads.\n\n' +
    'Two distinct measurement boundaries are evaluated:\n' +
    '- **Scenario A database transaction path**: isolates single-transaction latency and throughput under high row contention, measuring lock acquisition, commit durability, and transaction retry frequency on the primary storage engine.\n' +
    '- **Scenario B complete end-to-end business decision**: evaluates the full multi-stage risk decision pipeline (account, merchant, device, and related-account risk evaluation) traversing cross-partition graph relationships. Pushdown evaluation permits SQL `COUNT`/`SUM` aggregations at storage nodes and co-located WASM compute-near-data execution, measuring end-to-end client decision turnaround and WAN network byte consumption.\n\n' +
    '## Executive multi-system comparison matrix\n\n' +
    '| System / Configuration | Category | Topology Units (Processes) | RPO=0 Host-Loss Survival | [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) tx/sec (p95 ms) | [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) decisions/sec (p99 ms) | WAN / Wire Bytes per Decision | Evidence Tier | Detail Page |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    `${matrixRows}\n\n` +
    '## Scenario B workload-shape progression ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))\n\n' +
    '![Scenario B Per-Shape Locality Crossover](scenario-b-shape-crossover.svg)\n\n' +
    '| System / Configuration | Graph Shape | Decisions/sec | Latency p99 (ms) | Round Trips | Wire Bytes |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${shapeRows}\n\n` +
    '## How Lagrange metrics develop over time\n\n' +
    '![Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.svg)\n\n' +
    '| Milestone / Commit | Scenario A tx/s (p95 ms) | Semantic Proofs | Scenario B dec/s (p99 ms / WAN B) | Scenario C 0ms Fresh dec/s | Provenance |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${milestoneRows}\n\n` +
    '## Measurement provenance and evidence-tier separation\n\n' +
    'Scenario B evaluation uses `local-oracle-plus-network-model` (`contract-model-non-comparable`) stage-delay formulas (`stages * oneWayMs` vs `stages * 2 * oneWayMs` and `stages * 96 B` vs `stages * 4096 B`) with synthetic movement phase constants rather than live wire counters. Only live cluster runs provide comparable cluster evidence.\n\n' +
    '| System / Configuration | Scenario A Provenance | Scenario B Execution & Latency Source | Wire & Movement Source | Comparable Cluster Evidence |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    `${provRows}\n`;
}

function renderExecutiveMatrixRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const tierA = getEvidenceTier(t, 'scenarioA');
    const tierB = getEvidenceTier(t, 'scenarioB');
    const rpoZero = Boolean(t.rpoZeroSurvivability === true || t.rpoZeroSurvivability === 'Yes' || t.rpoZeroSurvivability === 'true');
    const rpoClass = rpoZero ? 'badge-green' : 'badge-red';
    const rpoText = rpoZero ? 'Yes' : 'No';
    const detail = (t.detailPageMd && t.detailPageHtml) ?
      `<a href="${escapeXml(t.detailPageHtml)}">${escapeXml(t.detailPageMd)}</a>` : 'n/a';
    return '        <tr>' +
      `<td><strong>${escapeXml(t.label)}</strong> <span class="badge">${escapeXml(t.version)}</span></td>` +
      `<td>${escapeXml(t.category || 'n/a')}</td>` +
      `<td>${t.topologyUnits ?? 1} units (${t.processCount ?? 1} procs)</td>` +
      `<td><span class="badge ${rpoClass}">${rpoText}</span></td>` +
      `<td>${formatNum(getTxPerSec(t))} tx/s (${formatNum(getP95(t))} ms)</td>` +
      `<td>${formatNum(getDecisionsPerSec(t))} dec/s (${formatNum(getP99(t))} ms)</td>` +
      `<td>${getWireBytes(t)} B</td>` +
      `<td><span class="badge">A: ${escapeXml(tierA)}</span> <span class="badge">B: ${escapeXml(tierB)}</span></td>` +
      `<td>${detail}</td></tr>`;
  }), '\n');
}

function renderShapesRowsHtml(targets) {
  const shapes = ['local-only', 'one-remote-stage', 'sequential', 'fan-out'];
  return arrayJoin(arrayMap(targets, (t) => arrayJoin(arrayMap(shapes, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    return `        <tr><td>${escapeXml(t.label)}</td><td><span class="badge">${s}</span></td><td>${formatNum(sh.decisionsPerSec ?? 0)}</td><td>${formatNum(sh.p99Ms ?? 0)}</td><td>${sh.roundTrips ?? sh.sqlRoundTripsPerDecision ?? 0}</td><td>${sh.wanBytes ?? sh.wireBytes ?? 0} B</td></tr>`;
  }), '\n')), '\n');
}

function renderMilestoneRowsHtml(timeline) {
  return arrayJoin(arrayMap(timeline || [], (m) => '        <tr>' +
    `<td><strong>${escapeXml(m.milestoneId)}</strong> <span class="badge">${escapeXml(m.commitSha)}</span></td>` +
    `<td>${formatNum(m.scenarioATxPerSec)} tx/s (${formatNum(m.scenarioAP95Ms)} ms)</td>` +
    `<td><span class="badge">${m.semanticProofPassed}/${m.semanticProofRequired}</span></td>` +
    `<td>${formatNum(m.scenarioBDecisionsPerSec)} dec/s (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B)</td>` +
    `<td>${formatNum(m.scenarioCFresh0msDecPerSec)} dec/s</td>` +
    `<td><span class="badge">${escapeXml(m.evidenceTier)}</span> <span class="badge">${escapeXml(m.executionPath)}</span></td></tr>`), '\n');
}

function renderProvenanceRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA?.measurementProvenance || {};
    const b = t.scenarioB?.measurementProvenance || {};
    const comp = b.comparableClusterEvidence ? 'Yes' : 'No';
    const cls = b.comparableClusterEvidence ? 'badge-green' : 'badge-red';
    return '        <tr>' +
      `<td><strong>${escapeXml(t.label)}</strong></td>` +
      `<td><span class="badge">${escapeXml(a.executionPath || 'n/a')}</span> ${escapeXml(a.latencySource || 'n/a')}</td>` +
      `<td><span class="badge">${escapeXml(b.executionPath || 'n/a')}</span> ${escapeXml(b.latencySource || 'n/a')}</td>` +
      `<td>${escapeXml(b.wireBytesSource || 'n/a')} / ${escapeXml(b.movementSource || 'n/a')}</td>` +
      `<td><span class="badge ${cls}">${comp}</span></td></tr>`;
  }), '\n');
}

function renderComparativeLandingHtml(matrix) {
  const targets = getTargets(matrix);
  const svg = renderComparativeOverviewSvg(matrix);
  const matrixTrs = renderExecutiveMatrixRowsHtml(targets);
  const shapeTrs = renderShapesRowsHtml(targets);
  const milestoneTrs = renderMilestoneRowsHtml(matrix?.lagrangeEvolutionTimeline);
  const provTrs = renderProvenanceRowsHtml(targets);

  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8"/>\n  <title>Comparative Benchmark Statistics - Multi-System Overview</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8; }\n' +
    '    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
    '    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }\n' +
    '    a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }\n' +
    '    .container { max-width: 1040px; margin: 0 auto; }\n' +
    '    h1 { font-size: 22px; margin-bottom: 8px; }\n    p.desc { color: var(--muted); font-size: 13px; margin-bottom: 16px; }\n' +
    '    .chart-box { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 20px; overflow-x: auto; }\n' +
    '    .filter-bar { margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 13px; }\n' +
    '    .filter-bar input { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 4px; width: 280px; }\n' +
    '    .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; overflow-x: auto; }\n' +
    '    .card h2 { font-size: 15px; margin-bottom: 12px; color: var(--accent); }\n' +
    '    table.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n' +
    '    table.data-table th, table.data-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }\n' +
    '    table.data-table th { color: var(--muted); font-weight: 600; }\n' +
    '    .badge { font-family: monospace; background: #0f172a; padding: 2px 4px; border-radius: 3px; border: 1px solid var(--border); }\n' +
    '    .badge-green { color: #10b981; border-color: #10b981; }\n    .badge-red { color: #ef4444; border-color: #ef4444; }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <div class="container">\n' +
    '    <h1>Comparative Benchmark Statistics</h1>\n' +
    '    <p class="desc">Multi-system executive performance and topology comparison across PostgreSQL, TiDB/TiKV, and Lagrange.</p>\n' +
    '    <p class="desc">Specifications &amp; Detail: ' +
    '<a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a> | ' +
    '<a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a> | ' +
    '<a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">' +
    'Scenario C Spec</a> | ' +
    '<a href="tidb-reference-paired-owner.md">Paired Benchmark Owner</a> | ' +
    '<a href="lagrange-metrics-evolution.html">Lagrange Metrics Evolution Over Time</a> ' +
    '(<a href="lagrange-metrics-evolution.md">MD</a>) | ' +
    '<a href="tidb-comparison-progress.html">TiDB Progress</a> | ' +
    '<a href="postgresql-comparison-progress.html">PostgreSQL Progress</a> | ' +
    '<a href="citus-comparison-progress.html">Citus Distributed Functions (HTML)</a> | ' +
    '<a href="citus-comparison-progress.md">Citus Detail (MD)</a> | ' +
    '<a href="yugabyte-ignite-comparison-progress.html">YugabyteDB &amp; Ignite 3 (HTML)</a> | ' +
    '<a href="yugabyte-ignite-comparison-progress.md">YugabyteDB &amp; Ignite 3 (MD)</a> | ' +
    '<a href="scenario-c-feature-store-progress.html">Scenario C: PG + Valkey (HTML)</a> | ' +
    '<a href="scenario-c-feature-store-progress.md">Scenario C (MD)</a></p>\n' +
    `    <div class="chart-box">${svg}</div>\n` +
    '    <div class="filter-bar"><label for="landing-filter">Filter:</label><input type="text" id="landing-filter" placeholder="Filter targets, categories, shapes..."/></div>\n' +
    '    <div class="card">\n' +
    '      <h2>Executive Multi-System Comparison Matrix</h2>\n' +
    '      <table class="data-table"><thead><tr><th>System</th><th>Category</th><th>Topology (Procs)</th><th>RPO=0</th><th>Scenario A tx/s (p95)</th><th>Scenario B dec/s (p99)</th><th>Wire Bytes</th><th>Tier</th><th>Detail Page</th></tr></thead>\n' +
    `      <tbody>\n${matrixTrs}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Scenario B Workload-Shape Progression</h2>\n' +
    '      <div class="chart-box"><img src="scenario-b-shape-crossover.svg" alt="Scenario B Per-Shape Locality Crossover"/></div>\n' +
    '      <table class="data-table"><thead><tr><th>System</th><th>Graph Shape</th><th>Decisions/sec</th><th>Latency p99 (ms)</th><th>Round Trips</th><th>Wire Bytes</th></tr></thead>\n' +
    `      <tbody>\n${shapeTrs}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>How Lagrange Metrics Develop Over Time</h2>\n' +
    '      <div class="chart-box"><img src="lagrange-metrics-evolution.svg" alt="Lagrange Metrics Evolution Over Time" style="max-width:100%;height:auto;"/></div>\n' +
    '      <table class="data-table"><thead><tr><th>Milestone / Commit</th><th>Scenario A tx/s (p95 ms)</th><th>Semantic Proofs</th><th>Scenario B dec/s (p99 ms / WAN B)</th><th>Scenario C 0ms Fresh dec/s</th><th>Provenance</th></tr></thead>\n' +
    `      <tbody>\n${milestoneTrs}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Measurement Provenance and Evidence-Tier Separation</h2>\n' +
    '      <p class="desc">Scenario B evaluation uses <code>local-oracle-plus-network-model</code> (<code>contract-model-non-comparable</code>) stage-delay formulas (<code>stages * oneWayMs</code> vs <code>stages * 2 * oneWayMs</code> and <code>stages * 96 B</code> vs <code>stages * 4096 B</code>) with synthetic movement phase constants rather than live wire counters. Only live cluster runs provide comparable cluster evidence.</p>\n' +
    '      <table class="data-table"><thead><tr><th>System / Configuration</th><th>Scenario A Provenance</th><th>Scenario B Execution &amp; Latency Source</th><th>Wire &amp; Movement Source</th><th>Comparable Cluster Evidence</th></tr></thead>\n' +
    `      <tbody>\n${provTrs}\n      </tbody></table>\n` +
    '    </div>\n' +
    '  </div>\n' +
    '  <script>\n' +
    '    document.getElementById(\'landing-filter\').addEventListener(\'input\', function(e) {\n' +
    '      var q = e.target.value.toLowerCase(), rows = document.querySelectorAll(\'table.data-table tbody tr\');\n' +
    '      for (var i = 0; i < rows.length; i++) rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q) === -1 ? \'none\' : \'\';\n' +
    '    });\n' +
    '  </script>\n</body>\n</html>\n';
}

async function writeComparativeLandingArtifacts(options = {}) {
  const matrix = options.matrix || options;
  const svgPath = options.svgPath || DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH;
  const markdownPath = options.markdownPath || DEFAULT_COMPARATIVE_LANDING_MD_PATH;
  const htmlPath = options.htmlPath || DEFAULT_COMPARATIVE_LANDING_HTML_PATH;

  await mkdir(path.dirname(svgPath), {recursive: true});
  await mkdir(path.dirname(markdownPath), {recursive: true});
  await mkdir(path.dirname(htmlPath), {recursive: true});

  await writeFile(svgPath, renderComparativeOverviewSvg(matrix), 'utf8');
  await writeFile(markdownPath, renderComparativeLandingMarkdown(matrix), 'utf8');
  await writeFile(htmlPath, renderComparativeLandingHtml(matrix), 'utf8');

  return {svgPath, markdownPath, htmlPath};
}

export {
  CANONICAL_DEFAULT_TARGETS,
  DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
  DEFAULT_COMPARATIVE_LANDING_MD_PATH,
  DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  renderComparativeLandingHtml,
  renderComparativeLandingMarkdown,
  renderComparativeOverviewSvg,
  writeComparativeLandingArtifacts,
};
