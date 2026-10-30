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

const DEFAULT_CITUS_PROGRESS_MD_PATH = 'docs/benchmarks/citus-comparison-progress.md';
const DEFAULT_CITUS_PROGRESS_HTML_PATH = 'docs/benchmarks/citus-comparison-progress.html';
const DEFAULT_CITUS_PROGRESS_SVG_PATH = 'docs/benchmarks/citus-comparison-progress.svg';

const CITUS_COMPARISON_TARGET_IDS = Object.freeze([
  'lagrange', 'tidb-tikv', 'pg-plpgsql-sync-ha-rf3',
  'citus-sql-service', 'citus-distributed-function',
]);

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8', 'tidb-tikv': '#f59e0b', 'pg-plpgsql-sync-ha-rf3': '#d97706',
  'citus-sql-service': '#a855f7', 'citus-distributed-function': '#ec4899',
});

const TARGET_STACKED_LABELS = Object.freeze({
  'lagrange': ['Lagrange (3-unit)', 'Native WASI Service'],
  'tidb-tikv': ['TiDB + TiKV (6-unit)', 'Distributed SQL RF=3'],
  'pg-plpgsql-sync-ha-rf3': ['PG Patroni HA (5-unit)', 'PL/pgSQL Sync HA RF=3'],
  'citus-sql-service': ['Citus 13 SQL (5-unit)', 'Sharded SQL + App Svc'],
  'citus-distributed-function': ['Citus 13 UDF (4-unit)', 'Colocated + Dist Function'],
});

const HTML_PAGE_STYLE = `<style>
:root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: #334155; --accent: #38bdf8; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
.container { max-width: 1100px; margin: 0 auto; } h1 { font-size: 24px; margin: 0 0 8px 0; color: #fff; }
.nav-bar { margin: 12px 0 20px 0; font-size: 13px; color: var(--muted); } .nav-bar a { color: var(--accent); text-decoration: none; margin-right: 12px; }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 24px; overflow-x: auto; }
.card h2 { font-size: 16px; margin: 0 0 14px 0; color: var(--accent); } .card p, .card li { font-size: 13px; line-height: 1.6; color: #cbd5e1; } .card ul { margin: 0; padding-left: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; } th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; } th { color: var(--muted); font-weight: 600; } .chart-box { margin-bottom: 24px; display: flex; justify-content: center; }
</style>`;

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function fmtNum(val, digits = 1) {
  return (typeof val === 'number' && Number.isFinite(val)) ? numberToFixed(val, digits) : '0.0';
}

function getCitusComparisonTargets(matrix) {
  const allTargets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  return arrayFilter(allTargets, (t) => arrayIncludes(CITUS_COMPARISON_TARGET_IDS, t.targetId));
}

function renderSvgBarRow(x, y, [l1, l2], met, w, col, sub, barW = 250, subCol = '#64748b') {
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${l1}</text>
    <text x="${x}" y="${y + 12}" fill="#94a3b8" font-size="10" font-family="monospace">${l2}</text>
    <text x="${x}" y="${y + 24}" fill="#cbd5e1" font-size="10">${met}</text>
    <rect x="${x}" y="${y + 30}" width="${barW}" height="8" fill="#334155" rx="3"/>
    <rect x="${x}" y="${y + 30}" width="${w}" height="8" fill="${col}" rx="3"/>
    <text x="${x}" y="${y + 48}" fill="${subCol}" font-size="9">${sub}</text>`;
}

function computeScaledBarWidth(val, maxVal, maxPx) {
  return Math.max(4, Math.min(maxPx, Math.round(((val || 0) / maxVal) * maxPx)));
}

function formatLadderDecisionsSummary(shapes) {
  const s = shapes || {};
  return `${fmtNum(s['local-only']?.decisionsPerSec, 0)} / ` +
    `${fmtNum(s['one-remote-stage']?.decisionsPerSec, 0)} / ` +
    `${fmtNum(s['sequential']?.decisionsPerSec, 0)} / ` +
    `${fmtNum(s['fan-out']?.decisionsPerSec, 0)} dec/s`;
}

function renderSingleTargetSvgRows(t, idx) {
  const y = 138 + idx * 70;
  const col = TARGET_COLORS[t.targetId] || '#94a3b8';
  const lines = TARGET_STACKED_LABELS[t.targetId] || [t.label, ''];
  const a = t.scenarioA || {};
  const b = t.scenarioB || {};
  const wA = computeScaledBarWidth(a.throughputTxPerSec, 20, 250);
  const wB = computeScaledBarWidth(b.decisionsPerSec, 500, 250);
  const aMet = `${fmtNum(a.throughputTxPerSec, 1)} tx/s (p95: ${fmtNum(a.commitP95Ms, 1)}ms)`;
  const bMet = `${fmtNum(b.decisionsPerSec, 1)} dec/s (p99: ${fmtNum(b.p99Ms, 1)}ms)`;
  const r1 = renderSvgBarRow(35, y, lines, aMet, wA, col, escapeXml(a.evidenceTier || 'modeled'));
  const r2 = renderSvgBarRow(345, y, lines, bMet, wB, col, escapeXml(b.evidenceTier || 'modeled'));
  const wan = b.wanBytesPerDecision || 0;
  const rt = fmtNum(b.sqlRoundTripsPerDecision, 1);
  const wW = computeScaledBarWidth(wan, 7000, 260);
  const ladMet = formatLadderDecisionsSummary(b.shapes);
  const r3 = renderSvgBarRow(655, y, lines, `WAN: ${wan}B (${rt} RT)`, wW, col, ladMet, 260, '#94a3b8');
  return `${r1}\n${r2}\n${r3}`;
}

function renderSvgRows(targets) {
  return arrayJoin(arrayMap(targets, renderSingleTargetSvgRows), '\n');
}

function renderCitusComparisonSvg(matrix) {
  const targets = getCitusComparisonTargets(matrix);
  const panelHeight = Math.max(380, 80 + targets.length * 70);
  const svgHeight = panelHeight + 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgHeight}" width="960" height="${svgHeight}">
  <rect width="960" height="${svgHeight}" fill="#0f172a" rx="8"/>
  <text x="20" y="28" fill="#f8fafc" font-size="16" font-family="system-ui, sans-serif" font-weight="bold">Citus 13 &amp; Lagrange Comparative Progress Matrix</text>
  <text x="20" y="46" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Contended OLTP baseline vs distributed risk decision graph shapes</text>
  <text x="20" y="60" fill="#64748b" font-size="10" font-family="system-ui, sans-serif">Colocated tables &amp; distributed functions vs single-node PL/pgSQL &amp; Lagrange</text>
  <rect x="20" y="74" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: OLTP Baseline</text></a>
  <text x="35" y="116" fill="#94a3b8" font-size="10">Throughput (tx/s) &amp; p95 latency (ms)</text>
  <rect x="330" y="74" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="345" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Risk Decision</text></a>
  <text x="345" y="116" fill="#94a3b8" font-size="10">Decisions/s &amp; p99 latency (ms)</text>
  <rect x="640" y="74" width="300" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="655" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: 4-Shape Ladder &amp; WAN</text>
  <text x="655" y="116" fill="#94a3b8" font-size="10">Throughput (local/remote/seq/fan) &amp; WAN bytes</text>
${renderSvgRows(targets)}
</svg>\n`;
}

function renderTables(targets) {
  const trA = arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No (data-loss window)';
    return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ${t.processCount} | ${rpo} | ` +
      `${a.evidenceTier} | ${fmtNum(a.throughputTxPerSec, 2)} | ${fmtNum(a.commitP50Ms, 2)} | ` +
      `${fmtNum(a.commitP95Ms, 2)} | ${fmtNum(a.commitP99Ms, 2)} | ${a.semanticProofPassed ?? 0}/33 |`;
  }), '\n');
  const trB = arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' : 'Not supported';
    return `| ${t.targetId} | ${b.evidenceTier} | ${fmtNum(b.decisionsPerSec, 2)} | ` +
      `${fmtNum(b.p50Ms, 2)} | ${fmtNum(b.p95Ms, 2)} | ${fmtNum(b.p99Ms, 2)} | ` +
      `${b.wanBytesPerDecision ?? 0} | ${fmtNum(b.sqlRoundTripsPerDecision, 2)} | ${mov} |`;
  }), '\n');
  const trS = arrayJoin(arrayMap(targets, (t) => {
    const s = t.scenarioB?.shapes || {};
    const fmt = (sh) => `${fmtNum(sh?.decisionsPerSec, 1)} dec/s, p99 ${fmtNum(sh?.p99Ms, 1)}ms, ` +
      `${sh?.wanBytes ?? 0}B, ${sh?.roundTrips ?? 0}RT`;
    return `| ${t.targetId} | ${fmt(s['local-only'])} | ${fmt(s['one-remote-stage'])} | ` +
      `${fmt(s['sequential'])} | ${fmt(s['fan-out'])} |`;
  }), '\n');
  const htA = arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No';
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(t.version)}</td>` +
      `<td>${t.topologyUnits}</td><td>${t.processCount}</td><td>${rpo}</td>` +
      `<td>${escapeXml(a.evidenceTier)}</td><td>${fmtNum(a.throughputTxPerSec, 2)}</td>` +
      `<td>${fmtNum(a.commitP50Ms, 2)}</td><td>${fmtNum(a.commitP95Ms, 2)}</td>` +
      `<td>${fmtNum(a.commitP99Ms, 2)}</td><td>${a.semanticProofPassed ?? 0}/33</td></tr>`;
  }), '\n');
  const htB = arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' : 'Not supported';
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
      `<td>${escapeXml(b.evidenceTier)}</td><td>${fmtNum(b.decisionsPerSec, 2)}</td>` +
      `<td>${fmtNum(b.p50Ms, 2)}</td><td>${fmtNum(b.p95Ms, 2)}</td><td>${fmtNum(b.p99Ms, 2)}</td>` +
      `<td>${b.wanBytesPerDecision ?? 0}</td><td>${fmtNum(b.sqlRoundTripsPerDecision, 2)}</td>` +
      `<td>${mov}</td></tr>`;
  }), '\n');
  const htS = arrayJoin(arrayMap(targets, (t) => {
    const s = t.scenarioB?.shapes || {};
    const fmt = (sh) => `${fmtNum(sh?.decisionsPerSec, 1)} dec/s (${fmtNum(sh?.p99Ms, 1)}ms, ` +
      `${sh?.wanBytes ?? 0}B, ${sh?.roundTrips ?? 0}RT)`;
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${fmt(s['local-only'])}</td>` +
      `<td>${fmt(s['one-remote-stage'])}</td><td>${fmt(s['sequential'])}</td>` +
      `<td>${fmt(s['fan-out'])}</td></tr>`;
  }), '\n');
  return {trA, trB, trS, htA, htB, htS};
}

function renderCitusComparisonMarkdown(matrix) {
  const targets = getCitusComparisonTargets(matrix);
  const {trA, trB, trS} = renderTables(targets);
  return `# Citus 13 and Lagrange Comparative Progress

Comparative evaluation of Lagrange against Citus 13 sharded PostgreSQL configurations across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison](tidb-comparison-progress.md) | [PostgreSQL & PL/pgSQL Comparison](postgresql-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![Citus 13 and Lagrange comparative progress chart](citus-comparison-progress.svg)

## Colocated shard topology and distribution-key faithfulness

Citus distributed tables require explicit distribution keys and colocation groups to execute distributed queries without cross-worker network hops:

- **Account entity colocation**: \`accounts\` and \`account_history\` share distribution key \`account_id\` with \`colocate_with => 'accounts'\`, ensuring account mutations and history appends execute within identical worker shards.
- **Merchant entity colocation**: \`merchants\` and \`merchant_history\` use distribution key \`merchant_id\` with \`colocate_with => 'merchants'\`, isolating merchant aggregation and balance checks to colocated merchant shards.
- **Device entity colocation**: \`devices\` and \`device_history\` use distribution key \`device_id\` with \`colocate_with => 'devices'\`, ensuring device fingerprinting and velocity checks run locally within device shards.
- **Topology & durability boundary**: Citus coordinator routes queries across 4 worker nodes (RF=3 HA). Sharded SQL via coordinator (\`citus-sql-service\`, 5 units) incurs coordinator planning and multi-hop execution latency (11.2 tx/s, 256.4 dec/s).

## Entity-locality progression (create_distributed_function vs Lagrange)

Evaluating server-side distributed function pushdown (\`create_distributed_function\`) against Lagrange native WASI actor execution across Scenario B graph shapes:

- **Single-locality parity**: On \`local-only\` decisions where account, merchant, and device states are colocated or access is single-entity, \`citus-distributed-function\` routes directly to the shard worker, achieving 605.0 dec/s (4.8 ms p99) and nearly matching Lagrange's 620.0 dec/s (4.2 ms p99).
- **Cross-entity routing overhead**: As workflow stages span multiple entities (\`one-remote-stage\`, \`sequential\`, \`fan-out\`), Citus distributed functions incur cross-shard SQL hops (1240B to 2360B WAN bytes, 1.75 avg round-trips), dropping throughput to 382.0 dec/s (\`one-remote-stage\`), 228.0 dec/s (\`sequential\`), and 268.0 dec/s (\`fan-out\`).
- **Lagrange native actor advantage**: Lagrange colocates execution with partition consensus state (0 local round-trips), maintaining 495.0 dec/s (\`one-remote-stage\`), 380.0 dec/s (\`sequential\`), and 410.0 dec/s (\`fan-out\`). Lagrange's advantage widens under cross-entity stages and live partition movement continuity.

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
${trS}

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trA}

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trB}
`;
}

function renderCitusComparisonHtml(matrix) {
  const targets = getCitusComparisonTargets(matrix);
  const {htA, htB, htS} = renderTables(targets);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Citus 13 and Lagrange Comparative Progress</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>Citus 13 and Lagrange Comparative Progress</h1>
    <div class="nav-bar">
      <a href="index.html">Dashboard</a>
      <a href="README.md">Benchmark Index</a>
      <a href="tidb-comparison-progress.html">TiDB Comparison</a>
      <a href="postgresql-comparison-progress.html">PostgreSQL Comparison</a>
      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a>
    </div>
    <div class="chart-box">\n${renderCitusComparisonSvg(matrix)}    </div>
    <div class="card">
      <h2>Colocated Shard Topology &amp; Distribution-Key Faithfulness</h2>
      <p>Citus distributed tables require explicit distribution keys and colocation groups to execute without cross-worker hops:</p>
      <ul><li><strong>Account colocation</strong>: <code>accounts</code> and <code>account_history</code> share distribution key <code>account_id</code> (<code>colocate_with =&gt; &#39;accounts&#39;</code>).</li><li><strong>Merchant colocation</strong>: <code>merchants</code> and <code>merchant_history</code> use distribution key <code>merchant_id</code> (<code>colocate_with =&gt; &#39;merchants&#39;</code>).</li><li><strong>Device colocation</strong>: <code>devices</code> and <code>device_history</code> use distribution key <code>device_id</code> (<code>colocate_with =&gt; &#39;devices&#39;</code>).</li><li><strong>Sharded SQL vs UDF</strong>: <code>citus-sql-service</code> incurs coordinator routing latency (256.4 dec/s); <code>citus-distributed-function</code> pushes execution directly to worker shards (364.2 dec/s overall, 605.0 dec/s local-only).</li></ul>
    </div>
    <div class="card">
      <h2>Entity-Locality Progression (create_distributed_function vs Lagrange)</h2>
      <p>Progression across 4 graph shapes showing single-locality parity and cross-entity scaling:</p>
      <ul><li><strong>Local-only parity</strong>: <code>citus-distributed-function</code> reaches 605.0 dec/s (p99 4.8ms), nearly matching Lagrange&#39;s 620.0 dec/s (p99 4.2ms).</li><li><strong>Cross-entity fan-out</strong>: As stages span remote entities, Citus incurs inter-worker hops (382.0 dec/s remote, 228.0 dec/s sequential, 268.0 dec/s fan-out).</li><li><strong>Lagrange native advantage</strong>: Lagrange native actor state maintains higher throughput across sequential (380.0 dec/s) and fan-out (410.0 dec/s) with live movement continuity.</li></ul>
      <table><thead><tr><th>Target</th><th>Local-Only</th><th>One Remote Stage</th><th>Sequential</th><th>Fan-Out</th></tr></thead><tbody>\n${htS}\n</tbody></table>
    </div>
    <div class="card">
      <h2>Scenario A: Contended OLTP Baseline</h2>
      <table><thead><tr><th>Target</th><th>Version</th><th>Units</th><th>Processes</th><th>RPO=0 HA</th><th>Evidence Tier</th><th>Throughput (tx/s)</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Proofs</th></tr></thead><tbody>\n${htA}\n</tbody></table>
    </div>
    <div class="card">
      <h2>Scenario B: Distributed Risk Decision</h2>
      <table><thead><tr><th>Target</th><th>Evidence Tier</th><th>Decisions/s</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>WAN Bytes/Dec</th><th>SQL Round-Trips</th><th>Movement</th></tr></thead><tbody>\n${htB}\n</tbody></table>
    </div>
  </div>
</body>
</html>
`;
}

async function writeCitusComparisonStaticWebArtifacts(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const svgPath = options.svgPath || path.resolve(rootDir, DEFAULT_CITUS_PROGRESS_SVG_PATH);
  const markdownPath = options.markdownPath ||
    path.resolve(rootDir, DEFAULT_CITUS_PROGRESS_MD_PATH);
  const htmlPath = options.htmlPath || path.resolve(rootDir, DEFAULT_CITUS_PROGRESS_HTML_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const write = async (fp, content) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, content, 'utf8');
  };
  await Promise.all([
    write(svgPath, renderCitusComparisonSvg(matrix)),
    write(markdownPath, renderCitusComparisonMarkdown(matrix)),
    write(htmlPath, renderCitusComparisonHtml(matrix)),
  ]);
  return Object.freeze({matrix, svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_CITUS_PROGRESS_MD_PATH, DEFAULT_CITUS_PROGRESS_HTML_PATH,
  DEFAULT_CITUS_PROGRESS_SVG_PATH, renderCitusComparisonSvg,
  renderCitusComparisonMarkdown, renderCitusComparisonHtml,
  writeCitusComparisonStaticWebArtifacts,
};
