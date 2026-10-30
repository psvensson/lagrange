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

const DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH = 'docs/benchmarks/yugabyte-ignite-comparison-progress.md';
const DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH = 'docs/benchmarks/yugabyte-ignite-comparison-progress.html';
const DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH = 'docs/benchmarks/yugabyte-ignite-comparison-progress.svg';
const DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH = 'docs/benchmarks/scenario-b-shape-crossover.svg';

const YUGABYTE_IGNITE_TARGET_IDS = Object.freeze([
  'lagrange', 'tidb-tikv', 'citus-distributed-function',
  'yugabytedb-ysql-rf3', 'yugabytedb-stored-proc', 'ignite3-colocated-compute',
]);
const CROSSOVER_TARGET_IDS = Object.freeze([
  'lagrange', 'pg-plpgsql-sync-ha-rf3', 'citus-distributed-function',
  'yugabytedb-stored-proc', 'ignite3-colocated-compute', 'tidb-tikv',
]);

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8', 'tidb-tikv': '#f59e0b', 'pg-plpgsql-sync-ha-rf3': '#d97706',
  'citus-distributed-function': '#ec4899', 'yugabytedb-ysql-rf3': '#8b5cf6',
  'yugabytedb-stored-proc': '#a855f7', 'ignite3-colocated-compute': '#ef4444',
});

const TARGET_SHORT_LABELS = Object.freeze({
  'lagrange': 'Lagrange (3-unit)', 'tidb-tikv': 'TiDB + TiKV (6-unit)',
  'pg-plpgsql-sync-ha-rf3': 'PG Patroni HA (5-unit)',
  'citus-distributed-function': 'Citus 13 (Dist Function)',
  'yugabytedb-ysql-rf3': 'YB 2024.2 (YSQL + App)',
  'yugabytedb-stored-proc': 'YB 2024.2 (Stored Proc)',
  'ignite3-colocated-compute': 'Ignite 3 (Colocated)',
});

const HTML_PAGE_STYLE = `<style>
:root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: #334155; --accent: #38bdf8; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
.container { max-width: 1100px; margin: 0 auto; } h1 { font-size: 24px; margin: 0 0 8px 0; color: #fff; } .nav-bar { margin: 12px 0 20px 0; font-size: 13px; } .nav-bar a { color: var(--accent); text-decoration: none; margin-right: 12px; }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 24px; overflow-x: auto; } .card h2 { font-size: 16px; margin: 0 0 14px 0; color: var(--accent); } .card p, .card li { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
table { width: 100%; border-collapse: collapse; font-size: 13px; } th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; } th { color: var(--muted); font-weight: 600; } .chart-box { margin-bottom: 24px; display: flex; justify-content: center; }
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

function renderSvgBarRow(x, y, lbl, met, w, col, sub, barW = 250, subCol = '#64748b') {
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl}</text>
    <text x="${x}" y="${y + 14}" fill="#94a3b8" font-size="10">${met}</text>
    <rect x="${x}" y="${y + 20}" width="${barW}" height="8" fill="#334155" rx="3"/>
    <rect x="${x}" y="${y + 20}" width="${w}" height="8" fill="${col}" rx="3"/>
    <text x="${x}" y="${y + 38}" fill="${subCol}" font-size="9">${sub}</text>`;
}

function computeScaledBarWidth(val, maxVal, maxPx) {
  return Math.max(4, Math.min(maxPx, Math.round(((val || 0) / maxVal) * maxPx)));
}

function formatLadderDecisionsSummary(shapes) {
  const s = shapes || {};
  return `${fmtNum(s['local-only']?.decisionsPerSec, 0)} / ${fmtNum(s['one-remote-stage']?.decisionsPerSec, 0)} / ` +
    `${fmtNum(s['sequential']?.decisionsPerSec, 0)} / ${fmtNum(s['fan-out']?.decisionsPerSec, 0)} dec/s`;
}

function renderSingleTargetSvgRow(t, idx) {
  const y = 140 + idx * 62;
  const col = TARGET_COLORS[t.targetId] || '#94a3b8';
  const lbl = escapeXml(TARGET_SHORT_LABELS[t.targetId] || t.shortLabel || t.label);
  const a = t.scenarioA || {};
  const b = t.scenarioB || {};
  const wA = computeScaledBarWidth(a.throughputTxPerSec, 20, 250);
  const wB = computeScaledBarWidth(b.decisionsPerSec, 500, 250);
  const aMet = `${fmtNum(a.throughputTxPerSec, 1)} tx/s (p95: ${fmtNum(a.commitP95Ms, 1)}ms)`;
  const bMet = `${fmtNum(b.decisionsPerSec, 1)} dec/s (p99: ${fmtNum(b.p99Ms, 1)}ms)`;
  const wan = b.wanBytesPerDecision || 0;
  const rt = fmtNum(b.sqlRoundTripsPerDecision, 1);
  const wW = computeScaledBarWidth(wan, 7000, 260);
  const ladMet = formatLadderDecisionsSummary(b.shapes);
  return `${renderSvgBarRow(35, y, lbl, aMet, wA, col, escapeXml(a.evidenceTier || 'modeled'))}\n` +
    `${renderSvgBarRow(345, y, lbl, bMet, wB, col, escapeXml(b.evidenceTier || 'modeled'))}\n` +
    `${renderSvgBarRow(655, y, lbl, `WAN: ${wan}B (${rt} RT)`, wW, col, ladMet, 260, '#94a3b8')}`;
}

function renderSvgRows(targets) {
  return arrayJoin(arrayMap(targets, renderSingleTargetSvgRow), '\n');
}

function renderComparisonSvg(targets, [title, sub1, s2a, s2b, c3Title, c3Sub]) {
  const panelHeight = Math.max(380, 80 + targets.length * 62);
  const svgHeight = panelHeight + 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgHeight}" width="960" height="${svgHeight}">
  <rect width="960" height="${svgHeight}" fill="#0f172a" rx="8"/>
  <text x="20" y="28" fill="#f8fafc" font-size="16" font-family="system-ui, sans-serif" font-weight="bold">${title}</text>
  <text x="20" y="44" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">${sub1}</text>
  <text x="20" y="58" fill="#64748b" font-size="10" font-family="system-ui, sans-serif">${s2a}</text>
  <text x="20" y="70" fill="#64748b" font-size="10" font-family="system-ui, sans-serif">${s2b}</text>
  <rect x="20" y="78" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="100" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: OLTP Baseline</text></a>
  <text x="35" y="118" fill="#94a3b8" font-size="10">Throughput &amp; p95 latency</text>
  <rect x="330" y="78" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="345" y="100" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Risk Decision</text></a>
  <text x="345" y="118" fill="#94a3b8" font-size="10">Decisions/s &amp; p99 latency</text>
  <rect x="640" y="78" width="300" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="655" y="100" fill="#38bdf8" font-size="13" font-weight="bold">${c3Title}</text>
  <text x="655" y="118" fill="#94a3b8" font-size="10">${c3Sub}</text>
${renderSvgRows(targets)}
</svg>\n`;
}

function renderYugabyteIgniteComparisonSvg(matrix) {
  return renderComparisonSvg(filterTargets(matrix, YUGABYTE_IGNITE_TARGET_IDS), [
    'YugabyteDB 2024.2, Apache Ignite 3 &amp; Lagrange',
    'Contended OLTP baseline vs distributed risk decision',
    'Lagrange, TiDB+TiKV, Citus UDF, YB YSQL', 'YB Stored Proc, Apache Ignite 3 Colocated',
    'Scenario B: 4-Shape Ladder', 'Throughput &amp; WAN bytes',
  ]);
}

function renderScenarioBShapeCrossoverSvg(matrix) {
  return renderComparisonSvg(filterTargets(matrix, CROSSOVER_TARGET_IDS), [
    'Scenario B Per-Shape Crossover Matrix',
    'Distributed risk decision graph-shape throughput scaling',
    'Lagrange, PG Patroni HA, Citus UDF, YB Proc', 'Apache Ignite 3 Colocated, TiDB+TiKV',
    'Scenario B: Shape Crossover', 'Throughput &amp; WAN bytes',
  ]);
}

function renderTables(targets) {
  const fS = (sh) => `${fmtNum(sh?.decisionsPerSec, 1)} dec/s, p99 ${fmtNum(sh?.p99Ms, 1)}ms, ` +
    `${sh?.wanBytes ?? 0}B, ${sh?.roundTrips ?? 0}RT`;
  const fH = (sh) => `${fmtNum(sh?.decisionsPerSec, 1)} dec/s (${fmtNum(sh?.p99Ms, 1)}ms, ` +
    `${sh?.wanBytes ?? 0}B, ${sh?.roundTrips ?? 0}RT)`;
  const r = (fn) => arrayJoin(arrayMap(targets, fn), '\n');
  return {
    trA: r((t) => `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ${t.processCount} | ` +
      `${t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No (data-loss window)'} | ${t.scenarioA?.evidenceTier} | ` +
      `${fmtNum(t.scenarioA?.throughputTxPerSec, 2)} | ${fmtNum(t.scenarioA?.commitP50Ms, 2)} | ` +
      `${fmtNum(t.scenarioA?.commitP95Ms, 2)} | ${fmtNum(t.scenarioA?.commitP99Ms, 2)} | ` +
      `${t.scenarioA?.semanticProofPassed ?? 0}/33 |`),
    trB: r((t) => `| ${t.targetId} | ${t.scenarioB?.evidenceTier} | ` +
      `${fmtNum(t.scenarioB?.decisionsPerSec, 2)} | ${fmtNum(t.scenarioB?.p50Ms, 2)} | ` +
      `${fmtNum(t.scenarioB?.p95Ms, 2)} | ${fmtNum(t.scenarioB?.p99Ms, 2)} | ` +
      `${t.scenarioB?.wanBytesPerDecision ?? 0} | ${fmtNum(t.scenarioB?.sqlRoundTripsPerDecision, 2)} | ` +
      `${t.scenarioB?.movementContinuityPassed ? 'Passed' : 'Not supported'} |`),
    trS: r((t) => `| ${t.targetId} | ${fS(t.scenarioB?.shapes?.['local-only'])} | ` +
      `${fS(t.scenarioB?.shapes?.['one-remote-stage'])} | ${fS(t.scenarioB?.shapes?.['sequential'])} | ` +
      `${fS(t.scenarioB?.shapes?.['fan-out'])} |`),
    htA: r((t) => `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(t.version)}</td>` +
      `<td>${t.topologyUnits}</td><td>${t.processCount}</td>` +
      `<td>${t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No'}</td><td>${escapeXml(t.scenarioA?.evidenceTier)}</td>` +
      `<td>${fmtNum(t.scenarioA?.throughputTxPerSec, 2)}</td>` +
      `<td>${fmtNum(t.scenarioA?.commitP50Ms, 2)}</td><td>${fmtNum(t.scenarioA?.commitP95Ms, 2)}</td>` +
      `<td>${fmtNum(t.scenarioA?.commitP99Ms, 2)}</td><td>${t.scenarioA?.semanticProofPassed ?? 0}/33</td></tr>`),
    htB: r((t) => `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
      `<td>${escapeXml(t.scenarioB?.evidenceTier)}</td>` +
      `<td>${fmtNum(t.scenarioB?.decisionsPerSec, 2)}</td><td>${fmtNum(t.scenarioB?.p50Ms, 2)}</td>` +
      `<td>${fmtNum(t.scenarioB?.p95Ms, 2)}</td><td>${fmtNum(t.scenarioB?.p99Ms, 2)}</td>` +
      `<td>${t.scenarioB?.wanBytesPerDecision ?? 0}</td>` +
      `<td>${fmtNum(t.scenarioB?.sqlRoundTripsPerDecision, 2)}</td>` +
      `<td>${t.scenarioB?.movementContinuityPassed ? 'Passed' : 'Not supported'}</td></tr>`),
    htS: r((t) => `<tr><td><strong>${escapeXml(t.targetId)}</strong></td>` +
      `<td>${fH(t.scenarioB?.shapes?.['local-only'])}</td>` +
      `<td>${fH(t.scenarioB?.shapes?.['one-remote-stage'])}</td>` +
      `<td>${fH(t.scenarioB?.shapes?.['sequential'])}</td>` +
      `<td>${fH(t.scenarioB?.shapes?.['fan-out'])}</td></tr>`),
  };
}

function renderYugabyteIgniteComparisonMarkdown(matrix) {
  const targets = filterTargets(matrix, YUGABYTE_IGNITE_TARGET_IDS);
  const {trA, trB, trS} = renderTables(targets);
  return `# YugabyteDB 2024.2, Apache Ignite 3, and Lagrange Comparative Progress

Comparative evaluation of Lagrange against YugabyteDB 2024.2 and Apache Ignite 3 across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison](tidb-comparison-progress.md) | [PostgreSQL & PL/pgSQL Comparison](postgresql-comparison-progress.md) | [Citus 13 Comparison](citus-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![YugabyteDB, Apache Ignite 3, and Lagrange comparative progress chart](yugabyte-ignite-comparison-progress.svg)
![Scenario B shape crossover chart](scenario-b-shape-crossover.svg)

## Distributed SQL replication and tablet RPC comparison
YugabyteDB 2024.2 distributes SQL execution over DocDB tablet storage using per-tablet Raft consensus (RF=3):
- **App service vs stored procedure boundary**: Running SQL from an external service (\`yugabytedb-ysql-rf3\`, 4 units) incurs repeated app-to-TServer SQL round-trips (3.0 avg RT, 3840B WAN bytes, 234.8 dec/s). Pushing decision logic into a YSQL stored procedure (\`yugabytedb-stored-proc\`, 3 units) eliminates external SQL round-trips, reducing round-trips to 2.25 and WAN bytes to 2420B, raising throughput to 286.5 dec/s.
- **Cross-tablet RPC overhead**: Even with stored procedures, transactions spanning account, merchant, and device tables must coordinate across tablet leaders. On multi-hop graph shapes, remote tablet RPCs limit throughput (142.0 dec/s on sequential, 159.2 dec/s on fan-out for YSQL; 184.0 dec/s and 209.0 dec/s for stored procedure).
- **Contended OLTP baseline**: In Scenario A, tablet Raft replication and distributed transaction status records yield 7.4 tx/s (commit p95 1190.0 ms), reflecting cross-tablet 2PC commit latency.

## Colocated compute comparison (Apache Ignite 3 vs Citus vs Lagrange)
Evaluating colocated compute grid execution (\`JobTarget.colocated\`) in Apache Ignite 3 against Citus distributed functions and Lagrange native WASI actor state:
- **Single-locality parity**: On \`local-only\` decisions where compute executes directly on the partition primary, Apache Ignite 3 reaches 612.0 dec/s (4.5 ms p99, 180B WAN bytes), closely matching Citus distributed functions (605.0 dec/s, 4.8 ms p99) and Lagrange (620.0 dec/s, 4.2 ms p99).
- **Cross-partition compute dispatch**: In cross-partition shapes (\`one-remote-stage\`, \`sequential\`, \`fan-out\`), Ignite 3 dispatches compute jobs via binary protocol (640B to 1280B WAN bytes), delivering 432.0 dec/s remote, 274.0 dec/s sequential, and 316.4 dec/s fan-out. Ignite 3 outperforms Citus distributed functions (228.0 dec/s sequential, 268.0 dec/s fan-out) by avoiding relational query re-planning across worker nodes.
- **Per-shape crossover dynamics**: On \`sequential\`, single-primary Patroni HA (234.0 dec/s) crosses over Citus (228.0 dec/s) and YugabyteDB stored procedures (184.0 dec/s), because serial multi-hop network round-trips penalize distributed tablet/shard RPCs more than local execution on an HA primary. TiDB (190.0 dec/s) also crosses over YugabyteDB stored procedures (184.0 dec/s) due to TiKV coprocessor pushdown.
- **Lagrange native actor advantage**: Lagrange colocates compute directly with partition consensus state, maintaining 495.0 dec/s (\`one-remote-stage\`), 380.0 dec/s (\`sequential\`), and 410.0 dec/s (\`fan-out\`) while preserving live partition movement continuity.

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
${trS}

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trA}

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trB}
`;
}

function renderYugabyteIgniteComparisonHtml(matrix) {
  const targets = filterTargets(matrix, YUGABYTE_IGNITE_TARGET_IDS);
  const {htA, htB, htS} = renderTables(targets);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>YugabyteDB 2024.2, Apache Ignite 3, and Lagrange Comparative Progress</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>YugabyteDB 2024.2, Apache Ignite 3, and Lagrange Comparative Progress</h1>
    <div class="nav-bar"><a href="index.html">Dashboard</a><a href="README.md">Benchmark Index</a>
      <a href="tidb-comparison-progress.html">TiDB Comparison</a><a href="postgresql-comparison-progress.html">PostgreSQL Comparison</a>
      <a href="citus-comparison-progress.html">Citus Comparison</a><a href="scenario-b-shape-crossover.svg">Crossover SVG</a><a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a></div>
    <div class="chart-box">\n${renderYugabyteIgniteComparisonSvg(matrix)}    </div>
    <div class="chart-box">\n${renderScenarioBShapeCrossoverSvg(matrix)}    </div>
    <div class="card"><h2>Distributed SQL Replication and Tablet RPC Comparison</h2>
      <p>YugabyteDB 2024.2 distributes SQL over DocDB tablet storage using per-tablet Raft (RF=3):</p>
      <ul><li><strong>App service vs stored procedure</strong>: <code>yugabytedb-ysql-rf3</code> incurs repeated app-to-TServer SQL round-trips (3.0 avg RT, 3840B WAN bytes, 234.8 dec/s). Stored procedures (<code>yugabytedb-stored-proc</code>) eliminate external hops (2.25 RT, 2420B, 286.5 dec/s).</li><li><strong>Cross-tablet RPC overhead</strong>: Remote tablet RPCs limit multi-hop shape throughput (142.0 dec/s sequential, 159.2 dec/s fan-out for YSQL; 184.0 and 209.0 dec/s for stored procedure).</li><li><strong>Contended OLTP baseline</strong>: Tablet Raft replication yields 7.4 tx/s (commit p95 1190.0 ms).</li></ul></div>
    <div class="card"><h2>Colocated Compute Comparison (Apache Ignite 3 vs Citus vs Lagrange)</h2>
      <p>Evaluating colocated compute grid execution (<code>JobTarget.colocated</code>) in Apache Ignite 3 against Citus distributed functions and Lagrange native WASI actor state:</p>
      <ul><li><strong>Single-locality parity</strong>: On <code>local-only</code> decisions, Apache Ignite 3 reaches 612.0 dec/s (4.5 ms p99, 180B WAN bytes), closely matching Citus distributed functions (605.0 dec/s) and Lagrange (620.0 dec/s).</li><li><strong>Cross-partition compute dispatch</strong>: In cross-partition shapes, Ignite 3 dispatches compute jobs via binary protocol (640B to 1280B WAN bytes), delivering 432.0 dec/s remote, 274.0 dec/s sequential, and 316.4 dec/s fan-out, outperforming Citus distributed functions.</li><li><strong>Per-shape crossover</strong>: On <code>sequential</code>, Patroni HA (234.0 dec/s) crosses over Citus (228.0 dec/s) and YB stored proc (184.0 dec/s), while TiDB (190.0 dec/s) crosses over YB stored proc due to TiKV coprocessor pushdown.</li><li><strong>Lagrange native advantage</strong>: Lagrange maintains 495.0 dec/s remote, 380.0 dec/s sequential, and 410.0 dec/s fan-out with live partition movement continuity.</li></ul>
      <table><thead><tr><th>Target</th><th>Local-Only</th><th>One Remote Stage</th><th>Sequential</th><th>Fan-Out</th></tr></thead><tbody>\n${htS}\n</tbody></table></div>
    <div class="card"><h2>Scenario A: Contended OLTP Baseline</h2>
      <table><thead><tr><th>Target</th><th>Version</th><th>Units</th><th>Processes</th><th>RPO=0 HA</th><th>Evidence Tier</th><th>Throughput (tx/s)</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Proofs</th></tr></thead><tbody>\n${htA}\n</tbody></table></div>
    <div class="card"><h2>Scenario B: Distributed Risk Decision</h2>
      <table><thead><tr><th>Target</th><th>Evidence Tier</th><th>Decisions/s</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>WAN Bytes/Dec</th><th>SQL Round-Trips</th><th>Movement</th></tr></thead><tbody>\n${htB}\n</tbody></table></div>
  </div>
</body>
</html>
`;
}

async function writeYugabyteIgniteComparisonStaticWebArtifacts(options = {}) {
  const root = options.rootDir || process.cwd();
  const r = (p) => path.resolve(root, p);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const paths = {
    svgPath: options.svgPath || r(DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH),
    crossoverSvgPath: options.crossoverSvgPath || r(DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH),
    markdownPath: options.markdownPath || r(DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH),
    htmlPath: options.htmlPath || r(DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH),
  };
  const write = async (fp, c) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, c, 'utf8');
  };
  await Promise.all([
    write(paths.svgPath, renderYugabyteIgniteComparisonSvg(matrix)),
    write(paths.crossoverSvgPath, renderScenarioBShapeCrossoverSvg(matrix)),
    write(paths.markdownPath, renderYugabyteIgniteComparisonMarkdown(matrix)),
    write(paths.htmlPath, renderYugabyteIgniteComparisonHtml(matrix)),
  ]);
  return Object.freeze({matrix, ...paths});
}

export {
  DEFAULT_YUGABYTE_IGNITE_PROGRESS_MD_PATH, DEFAULT_YUGABYTE_IGNITE_PROGRESS_HTML_PATH,
  DEFAULT_YUGABYTE_IGNITE_PROGRESS_SVG_PATH, DEFAULT_SCENARIO_B_CROSSOVER_SVG_PATH,
  renderYugabyteIgniteComparisonSvg, renderScenarioBShapeCrossoverSvg,
  renderYugabyteIgniteComparisonMarkdown, renderYugabyteIgniteComparisonHtml,
  writeYugabyteIgniteComparisonStaticWebArtifacts,
};
