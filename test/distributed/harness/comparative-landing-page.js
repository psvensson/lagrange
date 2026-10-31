import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  CANONICAL_DEFAULT_TARGETS, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  escapeXml, formatNum, getTargets, renderComparativeOverviewSvg,
} from './comparative-landing-svg-renderer.js';
import {
  renderExecutiveMatrixRowsHtml, renderExecutiveMatrixRowsMd,
  renderMilestoneRowsHtml, renderMilestoneRowsMd,
  renderProvenanceRowsHtml, renderProvenanceRowsMd,
  renderScaleoutSummaryHtmlSection, renderScaleoutSummaryMarkdownSection,
  renderShapesRowsHtml, renderShapesRowsMd,
} from './comparative-landing-tables.js';
import {
  buildLiveMovementAndScenarioCScalingExperiment, buildScaleout3To5Rf3Experiment,
} from './comparative-matrix-runner.js';
import {
  DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH, renderScenarioSetupBreakdownHtmlSection,
  renderScenarioSetupBreakdownMarkdownSection, renderScenarioSetupBreakdownSvg,
} from './scenario-setup-breakdown-renderer.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);

const DEFAULT_COMPARATIVE_LANDING_MD_PATH = 'docs/benchmarks/README.md';
const DEFAULT_COMPARATIVE_LANDING_HTML_PATH = 'docs/benchmarks/index.html';

const NAV_MD = '- [Interactive Comparative Statistics Dashboard (HTML)](index.html)\n' +
  '- Scenario specifications:\n' +
  '  - [Scenario A: Contended OLTP Baseline (tidb-oltp-baseline)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline)\n' +
  '  - [Scenario B: Distributed Risk Decision & Partition Movement (tidb-distributed-risk-decision)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)\n' +
  '  - [Scenario C: streaming-feature-risk-decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)\n' +
  '  - [Paired Benchmark Owner](tidb-reference-paired-owner.md)\n' +
  '  - [Scenario A Semantic Evidence Gate (scenario-a-semantic-closure)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)\n' +
  '- Detail pages:\n' +
  '  - [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) ([HTML](lagrange-metrics-evolution.html)) | [TiDB / TiKV & Lagrange Comparison Progress](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html))\n' +
  '  - [PostgreSQL Single-Primary & Patroni Sync-HA Comparison](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html))\n' +
  '  - [Citus Colocated Tables & Distributed Functions Comparison](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html))\n' +
  '  - [YugabyteDB & Apache Ignite 3 Colocated Compute Comparison](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html))\n' +
  '  - [Scenario C: PostgreSQL 17 + Valkey 8 Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html))\n' +
  '  - [3-to-5-Node RF=3 Scale-Out & Scenario A 3-Mode Comparison](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html))\n' +
  '  - [5-Node RF=3 Partition Granularity Sweep (P=6..60)](partition-granularity-sweep-progress.md) ([HTML](partition-granularity-sweep-progress.html))\n' +
  '  - [Scenario B Network RTT Crossover & Working-Set Growth](scenario-b-rtt-working-set-crossover.md) ([HTML](scenario-b-rtt-working-set-crossover.html))\n' +
  '  - [Live Partition Movement & Scenario C 5x Joint Scaling](movement-and-scenario-c-scaling-progress.md) ([HTML](movement-and-scenario-c-scaling-progress.html))\n\n';

const NAV_HTML = '    <p class="desc">Specifications &amp; Detail: ' +
  '<a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a> | <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a> | <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">Scenario C Spec</a> | <a href="tidb-reference-paired-owner.md">Paired Benchmark Owner</a> | <a href="lagrange-metrics-evolution.html">Lagrange Metrics Evolution Over Time</a> (<a href="lagrange-metrics-evolution.md">MD</a>) | <a href="tidb-comparison-progress.html">TiDB Progress</a> | ' +
  '<a href="postgresql-comparison-progress.html">PostgreSQL Progress</a> | <a href="citus-comparison-progress.html">Citus Distributed Functions (HTML)</a> | <a href="citus-comparison-progress.md">Citus Detail (MD)</a> | <a href="yugabyte-ignite-comparison-progress.html">YugabyteDB &amp; Ignite 3 (HTML)</a> | <a href="yugabyte-ignite-comparison-progress.md">YugabyteDB &amp; Ignite 3 (MD)</a> | <a href="scenario-c-feature-store-progress.html">Scenario C: PG + Valkey (HTML)</a> | <a href="scenario-c-feature-store-progress.md">Scenario C (MD)</a> | ' +
  '<a href="scaleout-3to5-node-rf3-progress.html">3-to-5-Node RF=3 Scale-Out (HTML)</a> | <a href="scaleout-3to5-node-rf3-progress.md">3-to-5-Node RF=3 Scale-Out (MD)</a> | <a href="partition-granularity-sweep-progress.html">5-Node RF=3 Partition Granularity Sweep (P=6..60) (HTML)</a> | <a href="partition-granularity-sweep-progress.md">(Markdown)</a> | <a href="scenario-b-rtt-working-set-crossover.html">Scenario B Network RTT Crossover &amp; Working-Set Growth (HTML)</a> | <a href="scenario-b-rtt-working-set-crossover.md">(Markdown)</a> | <a href="movement-and-scenario-c-scaling-progress.html">Live Partition Movement &amp; Scenario C 5x Joint Scaling (HTML)</a> | <a href="movement-and-scenario-c-scaling-progress.md">(Markdown)</a></p>\n';

function renderScenarioCSummaryMarkdownSection(targets, jointExp) {
  const t1 = arrayJoin(arrayMap(arrayFilter(targets, (t) => Boolean(t.scenarioC)), (t) => {
    const c = t.scenarioC;
    return `| ${t.label} | ${formatNum(c.freshDecisionsPerSec0ms ?? 0)} | ` +
      `${formatNum(c.freshDecisionsPerSec100ms ?? 0)} | ` +
      `${formatNum(c.freshDecisionsPerSec1000ms ?? 0)} | ${formatNum(c.staleDecisionRatePct ?? 0)}% | ` +
      `${formatNum(c.ruleChangeBackfillSec ?? 0, 1)}s | ` +
      `${formatNum(c.cacheRestartRecoverySec ?? 0, 1)}s | ${c.operationalPipelines ?? 1} |`;
  }), '\n');
  const t2 = arrayJoin(arrayMap(jointExp?.scenarioCJointScaling || [], (i) =>
    `| ${i.label} | ${formatNum(i.scale1xFresh0msDecPerSec)} | ${formatNum(i.scale5xFresh0msDecPerSec)} | ` +
    `${formatNum(i.scale5xFresh1000msDecPerSec)} | ${formatNum(i.staleDecisionRatePct)}% | ` +
    `${formatNum(i.ruleChangeBackfillSec, 1)}s | ${formatNum(i.cacheRestartRecoverySec, 1)}s | ` +
    `${i.operationalPipelines} |`), '\n');
  return '## Scenario C streaming-feature-risk-decision summary (freshness SLA, staleness & 5x joint scale)\n\n' +
    'Scenario C evaluates streaming feature store staleness SLAs, operational rule backfill and\n' +
    'cache restart recovery overhead, and 5x joint scaling across ingestion, entity tracking, and\n' +
    'decision load. Detailed analysis: [Scenario C Feature-Store Comparison](scenario-c-feature-store-progress.md) ' +
    '([HTML](scenario-c-feature-store-progress.html)) and [Live Partition Movement & Scenario C 5x Joint Scaling]' +
    '(movement-and-scenario-c-scaling-progress.md) ([HTML](movement-and-scenario-c-scaling-progress.html)).\n\n' +
    '![Scenario C Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.svg)\n\n' +
    '| System / Configuration | 0ms Fresh dec/s | 100ms SLA dec/s | 1000ms SLA dec/s | Stale Rate % | Rule Backfill (s) | Cache Restart (s) | Pipelines |\n' +
    `| --- | --- | --- | --- | --- | --- | --- | --- |\n${t1}\n\n` +
    '| System / Configuration | 1x Fresh (0ms) dec/s | 5x Fresh (0ms) dec/s | 5x Relaxed (1000ms) dec/s | Stale % | 5x Backfill (s) | 5x Recovery (s) | Pipelines |\n' +
    `| --- | --- | --- | --- | --- | --- | --- | --- |\n${t2}`;
}

function renderScenarioCSummaryHtmlSection(targets, jointExp) {
  const t1 = arrayJoin(arrayMap(arrayFilter(targets, (t) => Boolean(t.scenarioC)), (t) => {
    const c = t.scenarioC;
    return '        <tr>' +
      `<td><strong>${escapeXml(t.label)}</strong></td><td>${formatNum(c.freshDecisionsPerSec0ms ?? 0)}</td>` +
      `<td>${formatNum(c.freshDecisionsPerSec100ms ?? 0)}</td><td>${formatNum(c.freshDecisionsPerSec1000ms ?? 0)}</td>` +
      `<td>${formatNum(c.staleDecisionRatePct ?? 0)}%</td><td>${formatNum(c.ruleChangeBackfillSec ?? 0, 1)}s</td>` +
      `<td>${formatNum(c.cacheRestartRecoverySec ?? 0, 1)}s</td><td>${c.operationalPipelines ?? 1}</td></tr>`;
  }), '\n');
  const t2 = arrayJoin(arrayMap(jointExp?.scenarioCJointScaling || [], (i) =>
    '        <tr>' +
    `<td><strong>${escapeXml(i.label)}</strong></td><td>${formatNum(i.scale1xFresh0msDecPerSec)}</td>` +
    `<td>${formatNum(i.scale5xFresh0msDecPerSec)}</td><td>${formatNum(i.scale5xFresh1000msDecPerSec)}</td>` +
    `<td>${formatNum(i.staleDecisionRatePct)}%</td><td>${formatNum(i.ruleChangeBackfillSec, 1)}s</td>` +
    `<td>${formatNum(i.cacheRestartRecoverySec, 1)}s</td><td>${i.operationalPipelines}</td></tr>`), '\n');
  return '    <div class="card">\n' +
    '      <h2>Scenario C Streaming-Feature-Risk-Decision Summary (Freshness SLA, Staleness &amp; 5x Joint Scale)</h2>\n' +
    '      <p class="desc">Scenario C evaluates streaming feature store staleness SLAs, operational rule backfill and cache restart recovery overhead, and 5x joint scaling across ingestion, entity tracking, and decision load. Detailed analysis: <a href="scenario-c-feature-store-progress.html">Scenario C Feature-Store Comparison</a> (<a href="scenario-c-feature-store-progress.md">MD</a>) and <a href="movement-and-scenario-c-scaling-progress.html">Live Partition Movement &amp; Scenario C 5x Joint Scaling</a> (<a href="movement-and-scenario-c-scaling-progress.md">MD</a>).</p>\n' +
    '      <div class="chart-box"><img src="scenario-c-feature-store-progress.svg" alt="Scenario C Feature-Store and Freshness Comparison"/></div>\n' +
    '      <table class="data-table"><thead><tr><th>System / Configuration</th><th>0ms Fresh dec/s</th><th>100ms SLA dec/s</th><th>1000ms SLA dec/s</th><th>Stale Rate %</th><th>Rule Backfill (s)</th><th>Cache Restart (s)</th><th>Pipelines</th></tr></thead>\n' +
    `      <tbody>\n${t1}\n      </tbody></table>\n` +
    '      <table class="data-table" style="margin-top: 16px;"><thead><tr><th>System / Configuration</th><th>1x Fresh (0ms) dec/s</th><th>5x Fresh (0ms) dec/s</th><th>5x Relaxed (1000ms) dec/s</th><th>Stale %</th><th>5x Backfill (s)</th><th>5x Recovery (s)</th><th>Pipelines</th></tr></thead>\n' +
    `      <tbody>\n${t2}\n      </tbody></table>\n` +
    '    </div>';
}

function renderComparativeLandingMarkdown(matrix) {
  const targets = getTargets(matrix);
  const scaleoutExp = matrix?.scaleout3To5Rf3Experiment || buildScaleout3To5Rf3Experiment();
  const jointExp = matrix?.liveMovementAndScenarioCScalingExperiment ||
    buildLiveMovementAndScenarioCScalingExperiment();
  const matrixRows = renderExecutiveMatrixRowsMd(targets);
  const scaleoutSection = renderScaleoutSummaryMarkdownSection(scaleoutExp);
  const scenCSection = renderScenarioCSummaryMarkdownSection(targets, jointExp);
  const setupSection = renderScenarioSetupBreakdownMarkdownSection(matrix);
  const shapeRows = renderShapesRowsMd(targets);
  const milestoneRows = renderMilestoneRowsMd(matrix?.lagrangeEvolutionTimeline);
  const provRows = renderProvenanceRowsMd(targets);

  return '# Comparative Benchmark Statistics\n\n' +
    'Deterministic multi-system comparative benchmark statistics across PostgreSQL, TiDB/TiKV, and Lagrange.\n\n' +
    NAV_MD +
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
    '| System / Configuration | Category | Topology Units (Processes) | RPO=0 Host-Loss Survival | [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) tx/sec (p95 ms) | [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) decisions/sec (p99 ms) | [Scenario C](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision) 0ms Fresh dec/sec (Stale % / Backfill s) | WAN / Wire Bytes per Decision | Evidence Tier | Detail Page |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    `${matrixRows}\n\n` +
    `${scaleoutSection}\n\n` +
    `${scenCSection}\n\n` +
    `${setupSection}\n\n` +
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

function renderComparativeLandingHtml(matrix) {
  const targets = getTargets(matrix);
  const scaleoutExp = matrix?.scaleout3To5Rf3Experiment || buildScaleout3To5Rf3Experiment();
  const jointExp = matrix?.liveMovementAndScenarioCScalingExperiment ||
    buildLiveMovementAndScenarioCScalingExperiment();
  const svg = renderComparativeOverviewSvg(matrix);
  const matrixTrs = renderExecutiveMatrixRowsHtml(targets);
  const scaleoutCard = renderScaleoutSummaryHtmlSection(scaleoutExp);
  const scenCCard = renderScenarioCSummaryHtmlSection(targets, jointExp);
  const setupCard = renderScenarioSetupBreakdownHtmlSection(matrix);
  const shapeTrs = renderShapesRowsHtml(targets);
  const milestoneTrs = renderMilestoneRowsHtml(matrix?.lagrangeEvolutionTimeline);
  const provTrs = renderProvenanceRowsHtml(targets);

  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8"/>\n  <title>Comparative Benchmark Statistics - Multi-System Overview</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8; }\n' +
    '    * { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }\n' +
    '    a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; } .container { max-width: 1040px; margin: 0 auto; }\n' +
    '    h1 { font-size: 22px; margin-bottom: 8px; } p.desc { color: var(--muted); font-size: 13px; margin-bottom: 16px; }\n' +
    '    .chart-box, .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; overflow-x: auto; }\n' +
    '    .chart-box { padding: 12px; } .card h2 { font-size: 15px; margin-bottom: 12px; color: var(--accent); }\n' +
    '    .filter-bar { margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 13px; }\n' +
    '    .filter-bar input { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 4px; width: 280px; }\n' +
    '    table.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n' +
    '    table.data-table th, table.data-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }\n' +
    '    table.data-table th { color: var(--muted); font-weight: 600; } .badge { font-family: monospace; background: #0f172a; padding: 2px 4px; border-radius: 3px; border: 1px solid var(--border); }\n' +
    '    .badge-green { color: #10b981; border-color: #10b981; } .badge-red { color: #ef4444; border-color: #ef4444; }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <div class="container">\n' +
    '    <h1>Comparative Benchmark Statistics</h1>\n' +
    '    <p class="desc">Multi-system executive performance and topology comparison across PostgreSQL, TiDB/TiKV, and Lagrange.</p>\n' +
    NAV_HTML +
    `    <div class="chart-box">${svg}</div>\n` +
    '    <div class="filter-bar"><label for="landing-filter">Filter:</label><input type="text" id="landing-filter" placeholder="Filter targets, categories, shapes..."/></div>\n' +
    '    <div class="card">\n' +
    '      <h2>Executive Multi-System Comparison Matrix</h2>\n' +
    '      <table class="data-table"><thead><tr><th>System</th><th>Category</th><th>Topology (Procs)</th><th>RPO=0</th><th>Scenario A tx/s (p95)</th><th>Scenario B dec/s (p99)</th><th><a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">Scenario C</a> 0ms Fresh dec/sec (Stale % / Backfill s)</th><th>Wire Bytes</th><th>Tier</th><th>Detail Page</th></tr></thead>\n' +
    `      <tbody>\n${matrixTrs}\n      </tbody></table>\n` +
    '    </div>\n' +
    `${scaleoutCard}\n` +
    `${scenCCard}\n` +
    `${setupCard}\n` +
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
    '      <p class="desc">Scenario B evaluation uses <code>local-oracle-plus-network-model</code> (<code>contract-model-non-comparable</code>) stage-delay formulas (<code>stages * oneWayMs` vs `stages * 2 * oneWayMs</code> and `stages * 96 B` vs `stages * 4096 B`) with synthetic movement phase constants rather than live wire counters. Only live cluster runs provide comparable cluster evidence.</p>\n' +
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
  const setupSvgPath = options.setupSvgPath || DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH;
  const markdownPath = options.markdownPath || DEFAULT_COMPARATIVE_LANDING_MD_PATH;
  const htmlPath = options.htmlPath || DEFAULT_COMPARATIVE_LANDING_HTML_PATH;
  for (const p of [svgPath, setupSvgPath, markdownPath, htmlPath]) {
    await mkdir(path.dirname(p), {recursive: true});
  }
  await writeFile(svgPath, renderComparativeOverviewSvg(matrix), 'utf8');
  await writeFile(setupSvgPath, renderScenarioSetupBreakdownSvg(matrix), 'utf8');
  await writeFile(markdownPath, renderComparativeLandingMarkdown(matrix), 'utf8');
  await writeFile(htmlPath, renderComparativeLandingHtml(matrix), 'utf8');
  return {svgPath, setupSvgPath, markdownPath, htmlPath};
}

export {
  CANONICAL_DEFAULT_TARGETS, DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
  DEFAULT_COMPARATIVE_LANDING_MD_PATH, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH, renderComparativeLandingHtml,
  renderComparativeLandingMarkdown, renderComparativeOverviewSvg,
  renderScenarioSetupBreakdownSvg, writeComparativeLandingArtifacts,
};
