import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);

const DEFAULT_SCENARIO_C_PROGRESS_MD_PATH = 'docs/benchmarks/scenario-c-feature-store-progress.md';
const DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH =
  'docs/benchmarks/scenario-c-feature-store-progress.html';
const DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH =
  'docs/benchmarks/scenario-c-feature-store-progress.svg';

const SCENARIO_C_TARGET_IDS = Object.freeze([
  'lagrange', 'pg-plpgsql-sync-ha-rf3', 'pg-valkey-sync-write-through', 'pg-valkey-async-stream',
]);

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8', 'pg-plpgsql-sync-ha-rf3': '#d97706',
  'pg-valkey-sync-write-through': '#10b981', 'pg-valkey-async-stream': '#8b5cf6',
});

const TARGET_STACKED_LABELS = Object.freeze({
  'lagrange': ['Lagrange (3-unit)', 'Native WASI Colocated'],
  'pg-plpgsql-sync-ha-rf3': ['PG Patroni HA (5-unit)', 'PL/pgSQL Sync HA RF=3'],
  'pg-valkey-sync-write-through': ['PG 17 + Valkey 8 Sync', 'Sync Write-Through (8-u)'],
  'pg-valkey-async-stream': ['PG 17 + Valkey 8 Async', 'Async CDC Stream (9-u)'],
});

const HTML_PAGE_STYLE = `<style>
:root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: #334155;
  --accent: #38bdf8; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
.container { max-width: 1100px; margin: 0 auto; } h1 { font-size: 24px; color: #fff; }
.nav-bar { margin: 12px 0 20px 0; font-size: 13px; color: var(--muted); }
.nav-bar a { color: var(--accent); text-decoration: none; margin-right: 12px; }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 18px; margin-bottom: 24px; } .card h2 { font-size: 16px; color: var(--accent); }
.card p, .card li { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }
th { color: var(--muted); font-weight: 600; } .chart-box { margin-bottom: 24px; }
</style>`;

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function fmtNum(val, digits = 1) {
  return (typeof val === 'number' && Number.isFinite(val)) ? numberToFixed(val, digits) : '0.0';
}

function filterTargets(matrix, allowedIds) {
  const allTargets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  return arrayFilter(allTargets, (t) => arrayIncludes(allowedIds, t.targetId));
}

function renderSvgBarRow(x, y, [l1, l2], met, w, col, sub, barW = 250, subCol = '#64748b') {
  const fillBar = w > 0 ?
    `\n    <rect x="${x}" y="${y + 30}" width="${w}" height="8" fill="${col}" rx="3"/>` : '';
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${l1}</text>
    <text x="${x}" y="${y + 12}" fill="#94a3b8" font-size="10" font-family="monospace">${l2}</text>
    <text x="${x}" y="${y + 24}" fill="#cbd5e1" font-size="10">${met}</text>
    <rect x="${x}" y="${y + 30}" width="${barW}" height="8" fill="#334155" rx="3"/>${fillBar}
    <text x="${x}" y="${y + 48}" fill="${subCol}" font-size="9">${sub}</text>`;
}

function renderScenarioCRow1(y, lines, c, col) {
  const hasD0 = typeof c.freshDecisionsPerSec0ms === 'number' &&
    Number.isFinite(c.freshDecisionsPerSec0ms);
  const d0 = hasD0 ? c.freshDecisionsPerSec0ms : null;
  const w1 = hasD0 ? Math.max(4, Math.min(250, Math.round((d0 / 500) * 250))) : 0;
  const m1 = hasD0 ?
    `${fmtNum(d0)} dec/s (${fmtNum(c.staleDecisionRatePct, 2)}% stale)` :
    `[${c.status || 'not measured'}]`;
  return renderSvgBarRow(35, y, lines, m1, w1, col, `Tier: ${c.evidenceTier || 'not-measured'}`);
}

function renderScenarioCRow2(y, lines, b, c, col) {
  const hasD1k = typeof c.freshDecisionsPerSec1000ms === 'number' &&
    Number.isFinite(c.freshDecisionsPerSec1000ms);
  const d1k = hasD1k ? c.freshDecisionsPerSec1000ms : null;
  const w2 = hasD1k ? Math.max(4, Math.min(250, Math.round((d1k / 600) * 250))) : 0;
  const m2 = hasD1k ?
    `${fmtNum(d1k)} dec/s (p99: ${fmtNum(b.p99Ms)}ms)` :
    `[${c.status || 'not measured'}]`;
  const sub2 = hasD1k ?
    `100ms: ${fmtNum(c.freshDecisionsPerSec100ms)} dec/s` :
    `[${c.status || 'not measured'}]`;
  return renderSvgBarRow(345, y, lines, m2, w2, col, sub2);
}

function renderScenarioCRow3(y, lines, c, col) {
  const hasBf = typeof c.ruleChangeBackfillSec === 'number' &&
    Number.isFinite(c.ruleChangeBackfillSec);
  const bf = hasBf ? c.ruleChangeBackfillSec : null;
  const w3 = hasBf ? Math.max(4, Math.min(260, Math.round((bf / 250) * 260))) : 0;
  const m3 = hasBf ?
    `Backfill: ${fmtNum(bf, 0)}s (Restart: ${fmtNum(c.cacheRestartRecoverySec)}s)` :
    `[${c.status || 'not measured'}]`;
  const recov = hasBf ? `${fmtNum(c.cacheRestartRecoverySec)}s` : `[${c.status || 'not measured'}]`;
  const s3 = `${c.operationalPipelines || 1} pipeline(s) | Recovery: ${recov}`;
  return renderSvgBarRow(655, y, lines, m3, w3, col, s3, 260, '#94a3b8');
}

function renderSingleScenarioCTargetSvgRow(t, idx) {
  const y = 146 + idx * 72;
  const col = TARGET_COLORS[t.targetId] || '#94a3b8';
  const lines = TARGET_STACKED_LABELS[t.targetId] || [t.label, ''];
  const b = t.scenarioB || {};
  const c = t.scenarioC || {};
  const r1 = renderScenarioCRow1(y, lines, c, col);
  const r2 = renderScenarioCRow2(y, lines, b, c, col);
  const r3 = renderScenarioCRow3(y, lines, c, col);
  return `${r1}\n${r2}\n${r3}`;
}

function renderSvgRows(targets) {
  return arrayJoin(arrayMap(targets, renderSingleScenarioCTargetSvgRow), '\n');
}

function renderScenarioCComparisonSvg(matrix) {
  const targets = filterTargets(matrix, SCENARIO_C_TARGET_IDS);
  const panelHeight = Math.max(380, 80 + targets.length * 72);
  const svgHeight = panelHeight + 96;
  const title = 'PostgreSQL 17 + Valkey 8 &amp; Lagrange Feature Store Matrix';
  const sub1 = 'Continuous ingestion paired with freshness-bounded risk decision';
  const sub2 = 'Synchronous write-through cache vs asynchronous CDC streaming';
  const aL = (href, x, txt, fill = '#94a3b8', b = '') =>
    `<a href="${href}"><text x="${x}" y="28" fill="${fill}" font-size="11"${b}>${txt}</text></a>`;
  const pH = (x, t) => '<a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">' +
    `<text x="${x}" y="100" fill="#38bdf8" font-size="13" font-weight="bold">${t}</text></a>`;
  const pB = (x, w, t, s1, s2) =>
    `  <rect x="${x}" y="78" width="${w}" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>\n` +
    `  ${pH(x + 15, t)}\n` +
    `  <text x="${x + 15}" y="116" fill="#94a3b8" font-size="10">${s1}</text>\n` +
    `  <text x="${x + 15}" y="128" fill="#64748b" font-size="9">${s2}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgHeight}" width="960" height="${svgHeight}">
  <rect width="960" height="${svgHeight}" fill="#0f172a" rx="8"/>
  <text x="20" y="28" fill="#f8fafc" font-size="16" font-weight="bold">${title}</text>
  <text x="20" y="44" fill="#94a3b8" font-size="11">${sub1}</text>
  <text x="20" y="58" fill="#64748b" font-size="10">${sub2}</text>
  ${aL('tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline', 640, 'Scenario A')}
  ${aL('tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision', 730, 'Scenario B')}
  ${aL('tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision', 820, 'Scenario C', '#38bdf8', ' font-weight="bold"')}
${pB(20, 290, '0 ms Read-Your-Writes SLA', 'Fresh decisions/s &amp; stale rate', 'Strict transactional visibility')}
${pB(330, 290, '1000 ms Relaxed Staleness', 'Decisions/s &amp; p99 latency', 'Bounded precomputed cache')}
${pB(640, 300, 'Rule-Change Backfill &amp; Recovery', 'Backfill &amp; restart (sec)', 'Operational pipeline count')}
${renderSvgRows(targets)}
</svg>\n`;
}

function renderTables(targets) {
  const r = (fn) => arrayJoin(arrayMap(targets, fn), '\n');
  const f = fmtNum;
  return {
    trC: r((t) => {
      const c = t.scenarioC;
      if (c?.freshDecisionsPerSec0ms != null) {
        return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ` +
          `${c.operationalPipelines} | ${f(c.freshDecisionsPerSec0ms)} | ` +
          `${f(c.freshDecisionsPerSec100ms)} | ` +
          `${f(c.freshDecisionsPerSec1000ms)} | ` +
          `${f(c.staleDecisionRatePct, 2)}% | ` +
          `${f(c.ruleChangeBackfillSec)}s | ${f(c.cacheRestartRecoverySec)}s |`;
      }
      const st = `[${c?.status || 'not measured'}]`;
      return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ` +
        `${c?.operationalPipelines || 1} | ${st} | ${st} | ${st} | ${st} | ${st} | ${st} |`;
    }),
    trCtx: r((t) => {
      const a = t.scenarioA || {};
      const b = t.scenarioB || {};
      const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No';
      const aMet = a.throughputTxPerSec != null ? f(a.throughputTxPerSec) : `[${a.status || 'not measured'}]`;
      const bMet = b.decisionsPerSec != null ? f(b.decisionsPerSec) : `[${b.status || 'not measured'}]`;
      const bP99 = b.p99Ms != null ? f(b.p99Ms) : `[${b.status || 'not measured'}]`;
      const bWan = b.wanBytesPerDecision != null ? `${b.wanBytesPerDecision}` : `[${b.status || 'not measured'}]`;
      return `| ${t.targetId} | ${t.topologyUnits} | ${t.processCount} | ` +
        `${rpo} | ${aMet} | ${bMet} | ${bP99} | ${bWan} |`;
    }),
    htC: r((t) => {
      const c = t.scenarioC;
      if (c?.freshDecisionsPerSec0ms != null) {
        return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
          `<td>${escapeXml(t.version)}</td><td>${t.topologyUnits}</td>` +
          `<td>${c.operationalPipelines}</td>` +
          `<td>${f(c.freshDecisionsPerSec0ms)}</td>` +
          `<td>${f(c.freshDecisionsPerSec100ms)}</td>` +
          `<td>${f(c.freshDecisionsPerSec1000ms)}</td>` +
          `<td>${f(c.staleDecisionRatePct, 2)}%</td>` +
          `<td>${f(c.ruleChangeBackfillSec)}s</td>` +
          `<td>${f(c.cacheRestartRecoverySec)}s</td></tr>`;
      }
      const badge = `<span class="badge">${escapeXml(c?.status || 'not measured')}</span>`;
      return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
        `<td>${escapeXml(t.version)}</td><td>${t.topologyUnits}</td>` +
        `<td>${c?.operationalPipelines || 1}</td>` +
        `<td>${badge}</td><td>${badge}</td><td>${badge}</td><td>${badge}</td>` +
        `<td>${badge}</td><td>${badge}</td></tr>`;
    }),
    htCtx: r((t) => {
      const a = t.scenarioA || {};
      const b = t.scenarioB || {};
      const rpo = t.rpoZeroSurvivability ? 'Yes' : 'No';
      const aBadge = a.throughputTxPerSec != null ? f(a.throughputTxPerSec) : `<span class="badge">${escapeXml(a.status || 'not measured')}</span>`;
      const bBadge = b.decisionsPerSec != null ? f(b.decisionsPerSec) : `<span class="badge">${escapeXml(b.status || 'not measured')}</span>`;
      const p99Badge = b.p99Ms != null ? f(b.p99Ms) : `<span class="badge">${escapeXml(b.status || 'not measured')}</span>`;
      const wanBadge = b.wanBytesPerDecision != null ? `${b.wanBytesPerDecision}` : `<span class="badge">${escapeXml(b.status || 'not measured')}</span>`;
      return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
        `<td>${t.topologyUnits}</td><td>${t.processCount}</td>` +
        `<td>${rpo}</td>` +
        `<td>${aBadge}</td>` +
        `<td>${bBadge}</td><td>${p99Badge}</td>` +
        `<td>${wanBadge}</td></tr>`;
    }),
  };
}

function renderScenarioCComparisonMarkdown(matrix) {
  const targets = filterTargets(matrix, SCENARIO_C_TARGET_IDS);
  const {trC, trCtx} = renderTables(targets);
  return `# PostgreSQL 17 + Valkey 8 Feature Store and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 + Valkey 8 in-memory feature caching
across sync write-through and async CDC streaming under explicit freshness SLAs.

- Comparative navigation: [Landing](README.md) | [Dashboard](index.html) | [TiDB](tidb-comparison-progress.md) |
  [PostgreSQL](postgresql-comparison-progress.md) | [Citus](citus-comparison-progress.md) | [Yugabyte](yugabyte-ignite-comparison-progress.md)
- Scenario specs: [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision),
  and [Scenario C](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![PostgreSQL 17 + Valkey 8 feature store and Lagrange comparative progress chart](scenario-c-feature-store-progress.svg)

## Feature-freshness SLA tradeoff (0 ms read-your-writes vs 1000 ms relaxed staleness)
- **0 ms strict read-your-writes**: Evaluates strict transactional visibility across continuous streaming ingestion.
- **1000 ms relaxed staleness**: Precomputed Valkey caching decouples decision evaluation from relational storage transactions.

## Rule-change agility, backfill downtime, and operational footprint
- **Rule-change backfill cost**: Evaluates offline/online index and feature backfill requirements across relational and in-memory caches.
- **Cache-node restart recovery**: Evaluates cache warm-up vs log-replay recovery duration.
- **Operational pipeline count**: Evaluates unified streaming actor execution against multi-tier caching architectures (evaluating \`pg-valkey-sync-write-through\` and \`pg-valkey-async-stream\`). Comparative performance claims await admitted GCP/lab measurements.

## Scenario C feature store and freshness-bounded risk decision comparison

| Target | Version | Units | Pipelines | 0 ms SLA | 100 ms SLA | 1000 ms SLA | Stale | Backfill | Recovery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trC}

## Topology and baseline context

| Target | Units | Procs | RPO=0 HA | Scenario A (tx/s) | Scenario B (dec/s) | p99 (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
${trCtx}
`;
}

function renderScenarioCComparisonHtml(matrix) {
  const targets = filterTargets(matrix, SCENARIO_C_TARGET_IDS);
  const {htC, htCtx} = renderTables(targets);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>PostgreSQL 17 + Valkey 8 Feature Store and Lagrange Comparative Progress</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>PostgreSQL 17 + Valkey 8 Feature Store and Lagrange Comparative Progress</h1>
    <div class="nav-bar"><a href="index.html">Dashboard</a><a href="README.md">Index</a>
      <a href="tidb-comparison-progress.html">TiDB</a><a href="postgresql-comparison-progress.html">PG</a>
      <a href="citus-comparison-progress.html">Citus</a><a href="yugabyte-ignite-comparison-progress.html">YB</a>
      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scen A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scen B</a>
      <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">Scen C</a></div>
    <div class="chart-box">\n${renderScenarioCComparisonSvg(matrix)}    </div>
    <div class="card">
      <h2>Feature-Freshness SLA Tradeoff (0 ms Read-Your-Writes vs 1000 ms Relaxed Staleness)</h2>
      <ul><li><strong>0 ms read-your-writes</strong>: Evaluates strict transactional visibility across streaming ingestion.</li>
      <li><strong>1000 ms relaxed staleness</strong>: Valkey caching decouples decision evaluation from relational storage transactions.</li></ul></div>
    <div class="card">
      <h2>Rule-Change Agility, Backfill Downtime, and Operational Footprint</h2>
      <ul><li><strong>Rule-change backfill</strong>: Evaluates operational rule backfill requirements across architectures.</li>
      <li><strong>Cache restart recovery</strong>: Evaluates cache warm-up vs log replay duration.</li>
      <li><strong>Operational pipelines</strong>: Evaluates unified streaming actor execution against multi-tier caching architectures (evaluating <code>pg-valkey-sync-write-through</code> and <code>pg-valkey-async-stream</code>); comparative performance claims await admitted GCP/lab measurements.</li></ul>
      <table><thead><tr><th>Target</th><th>Version</th><th>Units</th><th>Pipelines</th>
        <th>0 ms SLA</th><th>100 ms SLA</th><th>1000 ms SLA</th><th>Stale</th>
        <th>Backfill</th><th>Recovery</th></tr></thead><tbody>\n${htC}\n</tbody></table></div>
    <div class="card"><h2>Topology and Baseline Context</h2>
      <table><thead><tr><th>Target</th><th>Units</th><th>Procs</th><th>RPO=0 HA</th>
        <th>Scenario A (tx/s)</th><th>Scenario B (dec/s)</th><th>p99</th>
        <th>WAN Bytes</th></tr></thead><tbody>\n${htCtx}\n</tbody></table></div>
  </div>
</body>
</html>\n`;
}

async function writeScenarioCComparisonStaticWebArtifacts(options = {}) {
  const root = options.rootDir || process.cwd();
  const r = (p) => path.resolve(root, p);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const paths = {
    svgPath: options.svgPath || r(DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH),
    markdownPath: options.markdownPath || r(DEFAULT_SCENARIO_C_PROGRESS_MD_PATH),
    htmlPath: options.htmlPath || r(DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH),
  };
  const write = async (fp, c) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, c, 'utf8');
  };
  await Promise.all([
    write(paths.svgPath, renderScenarioCComparisonSvg(matrix)),
    write(paths.markdownPath, renderScenarioCComparisonMarkdown(matrix)),
    write(paths.htmlPath, renderScenarioCComparisonHtml(matrix)),
  ]);
  return Object.freeze({matrix, ...paths});
}

export {
  DEFAULT_SCENARIO_C_PROGRESS_MD_PATH,
  DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH,
  DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH,
  renderScenarioCComparisonSvg,
  renderScenarioCComparisonMarkdown,
  renderScenarioCComparisonHtml,
  writeScenarioCComparisonStaticWebArtifacts,
};
