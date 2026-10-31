import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringReplace = Function.call.bind(String.prototype.replace);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const DEFAULT_POSTGRESQL_PROGRESS_MD_PATH = 'docs/benchmarks/postgresql-comparison-progress.md';
const DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH = 'docs/benchmarks/postgresql-comparison-progress.html';
const DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH = 'docs/benchmarks/postgresql-comparison-progress.svg';

const POSTGRESQL_COMPARISON_TARGET_IDS = Object.freeze([
  'lagrange', 'tidb-tikv', 'pg-single-primary',
  'pg-patroni-sync-ha-rf3', 'pg-plpgsql-single-primary', 'pg-plpgsql-sync-ha-rf3',
]);

const TARGET_COLORS = {
  'pg-single-primary': '#94a3b8', 'lagrange': '#38bdf8', 'tidb-tikv': '#f59e0b',
  'pg-patroni-sync-ha-rf3': '#a78bfa', 'pg-plpgsql-single-primary': '#14b8a6',
  'pg-plpgsql-sync-ha-rf3': '#d97706',
};

const TARGET_SHORT_LABELS = {
  'pg-single-primary': 'PG Single + App Svc (2-unit)', 'lagrange': 'Lagrange (3-unit)',
  'tidb-tikv': 'TiDB+TiKV (6-unit)',
  'pg-patroni-sync-ha-rf3': 'PG Patroni HA + App Svc (6-unit)',
  'pg-plpgsql-single-primary': 'PG Single + PL/pgSQL (1-unit)',
  'pg-plpgsql-sync-ha-rf3': 'PG Patroni HA + PL/pgSQL (5-unit)',
};

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

function getPostgresqlComparisonTargets(matrix) {
  const allTargets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  return arrayFilter(allTargets, (t) =>
    arrayIncludes(POSTGRESQL_COMPARISON_TARGET_IDS, t.targetId),
  );
}

function renderCardRow(x, y, lbl, met, w, col, tier) {
  const fillBar = w > 0 ?
    `\n    <rect x="${x}" y="${y + 20}" width="${w}" height="8" fill="${col}" rx="3"/>` : '';
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl}</text>
    <text x="${x}" y="${y + 14}" fill="#94a3b8" font-size="10">${met}</text>
    <rect x="${x}" y="${y + 20}" width="250" height="8" fill="#334155" rx="3"/>${fillBar}
    <text x="${x}" y="${y + 38}" fill="#64748b" font-size="9">${tier}</text>`;
}

function renderPgTargetCardRowA(y, lbl, a, col) {
  const hasA = typeof a.throughputTxPerSec === 'number' && Number.isFinite(a.throughputTxPerSec);
  const wA = hasA ?
    Math.max(4, Math.min(250, Math.round(((a.throughputTxPerSec || 0) / 350) * 250))) : 0;
  const aMet = hasA ?
    `${fmtNum(a.throughputTxPerSec, 1)} tx/s (p95: ${fmtNum(a.commitP95Ms, 1)}ms)` :
    `[${a.status || 'not measured'}]`;
  return renderCardRow(35, y, lbl, aMet, wA, col, escapeXml(a.evidenceTier || 'not-measured'));
}

function renderPgTargetCardRowB(y, lbl, b, col) {
  const hasB = typeof b.decisionsPerSec === 'number' && Number.isFinite(b.decisionsPerSec);
  const wB = hasB ?
    Math.max(4, Math.min(250, Math.round(((b.decisionsPerSec || 0) / 500) * 250))) : 0;
  const bMet = hasB ?
    `${fmtNum(b.decisionsPerSec, 1)} dec/s (p99: ${fmtNum(b.p99Ms, 1)}ms)` :
    `[${b.status || 'not measured'}]`;
  return renderCardRow(345, y, lbl, bMet, wB, col, escapeXml(b.evidenceTier || 'not-measured'));
}

function renderSinglePgTargetPanels1And2(t, idx) {
  const y = 138 + idx * 62;
  const col = TARGET_COLORS[t.targetId] || '#94a3b8';
  const lbl = escapeXml(TARGET_SHORT_LABELS[t.targetId] || t.label);
  const r1 = renderPgTargetCardRowA(y, lbl, t.scenarioA || {}, col);
  const r2 = renderPgTargetCardRowB(y, lbl, t.scenarioB || {}, col);
  return `${r1}\n${r2}`;
}

function renderSvgPanel1And2(targets) {
  return arrayJoin(arrayMap(targets, renderSinglePgTargetPanels1And2), '\n');
}

function formatLadderShapesSummary(shapes, fallbackStatus) {
  const s = shapes || {};
  if (typeof s['local-only']?.decisionsPerSec === 'number') {
    return `${fmtNum(s['local-only']?.decisionsPerSec, 0)} / ` +
      `${fmtNum(s['one-remote-stage']?.decisionsPerSec, 0)} / ` +
      `${fmtNum(s['sequential']?.decisionsPerSec, 0)} / ` +
      `${fmtNum(s['fan-out']?.decisionsPerSec, 0)} dec/s`;
  }
  return `[${fallbackStatus || 'not measured'}]`;
}

function renderSinglePgTargetPanel3(t, idx) {
  const y = 138 + idx * 62;
  const col = TARGET_COLORS[t.targetId] || '#94a3b8';
  const lbl = escapeXml(TARGET_SHORT_LABELS[t.targetId] || t.label);
  const b = t.scenarioB || {};
  const hasWan = typeof b.wanBytesPerDecision === 'number' && Number.isFinite(b.wanBytesPerDecision);
  const wan = hasWan ? b.wanBytesPerDecision : null;
  const rt = (typeof b.sqlRoundTripsPerDecision === 'number' &&
      Number.isFinite(b.sqlRoundTripsPerDecision)) ?
    fmtNum(b.sqlRoundTripsPerDecision, 1) : null;
  const wW = hasWan ? Math.max(4, Math.min(260, Math.round((wan / 5000) * 260))) : 0;
  const wanMet = hasWan ? `WAN: ${wan}B (${rt} RT)` : `[${b.status || 'not measured'}]`;
  const ladMet = formatLadderShapesSummary(b.shapes, b.status);
  const fillBar = wW > 0 ?
    `\n    <rect x="655" y="${y + 20}" width="${wW}" height="8" fill="${col}" rx="3"/>` : '';
  return `    <text x="655" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl}</text>
    <text x="655" y="${y + 14}" fill="#94a3b8" font-size="10">${wanMet}</text>
    <rect x="655" y="${y + 20}" width="260" height="8" fill="#334155" rx="3"/>${fillBar}
    <text x="655" y="${y + 38}" fill="#94a3b8" font-size="9">${ladMet}</text>`;
}

function renderSvgPanel3(targets) {
  return arrayJoin(arrayMap(targets, renderSinglePgTargetPanel3), '\n');
}

function renderPostgresqlComparisonSvg(matrix) {
  const targets = getPostgresqlComparisonTargets(matrix);
  const panelHeight = Math.max(362, 80 + targets.length * 62);
  const svgHeight = panelHeight + 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgHeight}" width="960" height="${svgHeight}">
  <rect width="960" height="${svgHeight}" fill="#0f172a" rx="8"/>
  <text x="20" y="28" fill="#f8fafc" font-size="16" font-family="system-ui, sans-serif" font-weight="bold">PostgreSQL &amp; Lagrange Comparative Progress Matrix</text>
  <text x="20" y="46" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Contended OLTP baseline vs distributed risk decision graph shapes</text>
  <text x="20" y="60" fill="#64748b" font-size="10" font-family="system-ui, sans-serif">Three-way control: App Service vs PL/pgSQL Function vs Lagrange WASI Service</text>
  <rect x="20" y="74" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: OLTP Baseline</text></a>
  <text x="35" y="116" fill="#94a3b8" font-size="10">Throughput (tx/s) &amp; p95 latency (ms)</text>
  <rect x="330" y="74" width="290" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="345" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Risk Decision</text></a>
  <text x="345" y="116" fill="#94a3b8" font-size="10">Decisions/s &amp; p99 latency (ms)</text>
  <rect x="640" y="74" width="300" height="${panelHeight}" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="655" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: 4-Shape Ladder &amp; WAN</text>
  <text x="655" y="116" fill="#94a3b8" font-size="10">Throughput (local/remote/seq/fan) &amp; WAN bytes</text>
${renderSvgPanel1And2(targets)}
${renderSvgPanel3(targets)}
</svg>
`;
}

function renderScenarioATableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No (data-loss window)';
    const proofs = `${a.semanticProofPassed ?? 0}/${a.semanticProofTotal ?? 33}`;
    if (a.throughputTxPerSec != null) {
      return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ${t.processCount} | ${rpo} | ` +
        `${a.evidenceTier} | ${fmtNum(a.throughputTxPerSec, 2)} | ${fmtNum(a.commitP50Ms, 2)} | ` +
        `${fmtNum(a.commitP95Ms, 2)} | ${fmtNum(a.commitP99Ms, 2)} | ${proofs} |`;
    }
    const st = `[${a.status || 'not measured'}]`;
    return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ${t.processCount} | ${rpo} | ` +
      `${a.evidenceTier} | ${st} | ${st} | ${st} | ${st} | ${proofs} |`;
  }), '\n');
}

function renderScenarioBTableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' : (b.status ? `[${b.status}]` : 'Not supported');
    if (b.decisionsPerSec != null) {
      return `| ${t.targetId} | ${b.evidenceTier} | ${fmtNum(b.decisionsPerSec, 2)} | ` +
        `${fmtNum(b.p50Ms, 2)} | ${fmtNum(b.p95Ms, 2)} | ${fmtNum(b.p99Ms, 2)} | ` +
        `${b.wanBytesPerDecision ?? 0} | ${fmtNum(b.sqlRoundTripsPerDecision, 2)} | ${mov} |`;
    }
    const st = `[${b.status || 'not measured'}]`;
    return `| ${t.targetId} | ${b.evidenceTier} | ${st} | ${st} | ${st} | ${st} | ${st} | ${st} | ${mov} |`;
  }), '\n');
}

function renderShapeTableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const s = t.scenarioB?.shapes || {};
    const fmt = (sh) => {
      if (sh?.decisionsPerSec != null) {
        return `${fmtNum(sh.decisionsPerSec, 1)} dec/s, p99 ${fmtNum(sh.p99Ms, 1)}ms, ` +
          `${sh.wanBytes ?? 0}B, ${sh.roundTrips ?? 0}RT`;
      }
      return `[${sh?.status || t.scenarioB?.status || 'not measured'}]`;
    };
    return `| ${t.targetId} | ${fmt(s['local-only'])} | ${fmt(s['one-remote-stage'])} | ` +
      `${fmt(s['sequential'])} | ${fmt(s['fan-out'])} |`;
  }), '\n');
}

function renderPostgresqlComparisonMarkdown(matrix) {
  const targets = getPostgresqlComparisonTargets(matrix);
  return `# PostgreSQL and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 configurations across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison Detail Page](tidb-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![PostgreSQL and Lagrange comparative progress chart](postgresql-comparison-progress.svg)

## Deployment topology and durability boundary

- \`pg-single-primary\` (2-unit): Standard relational deployment with 1 PostgreSQL 17.2 instance and 1 dedicated application service process. High throughput for localized OLTP without consensus replication overhead, but carries a non-zero recovery point objective (data loss window) upon host failure.
- \`pg-patroni-sync-ha-rf3\` (6-unit / 9 processes): Strict zero data loss high availability cluster configured with Patroni 4.0, etcd 3.5 distributed consensus, synchronous physical replication (\`synchronous_mode_strict: true\`), PgBouncer connection pooling, and HAProxy load balancing. Guarantees RPO=0 across primary node failures at the cost of synchronous commit round-trips.
- \`pg-plpgsql-single-primary\` (1-unit): Embedded server-side stored procedure execution within a single PostgreSQL instance without an external application service tier.
- \`pg-plpgsql-sync-ha-rf3\` (5-unit / 8 processes): Server-side stored procedure execution directly on the Patroni synchronous HA primary, eliminating application container hops.
- Query engine capability: PostgreSQL demonstrates full relational competence with pushdown aggregations (\`COUNT\`, \`SUM\`), index scan optimizations, and ACID serializability.

## Three-way locality control (Application Service vs PL/pgSQL Function vs Lagrange)

Comparative evaluation of three distinct control-flow models across Scenario B graph shapes:

- **PostgreSQL + Application Service** (\`pg-single-primary\` / \`pg-patroni-sync-ha-rf3\`): Executes business logic in an external application service tier, issuing SQL queries across client/database network boundaries.
- **PostgreSQL + Server-Side PL/pgSQL Function** (\`pg-plpgsql-single-primary\` / \`pg-plpgsql-sync-ha-rf3\`): Colocates decision logic inside PostgreSQL procedures, collapsing multi-statement SQL round-trips while keeping Scenario A separate on the ordinary-SQL transaction baseline.
- **Lagrange WASI Service** (\`lagrange\`): Colocates execution directly with partition ownership and consensus state machines. Comparative performance claims across systems await admitted GCP/lab measurements.

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${renderScenarioATableRows(targets)}

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${renderScenarioBTableRows(targets)}

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
${renderShapeTableRows(targets)}
`;
}

function renderHtmlTableRows(targets) {
  const trA = arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No';
    if (a.throughputTxPerSec != null) {
      return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(t.version)}</td>` +
        `<td>${t.topologyUnits}</td><td>${t.processCount}</td><td>${rpo}</td>` +
        `<td>${escapeXml(a.evidenceTier)}</td><td>${fmtNum(a.throughputTxPerSec, 2)}</td><td>${fmtNum(a.commitP50Ms, 2)}</td>` +
        `<td>${fmtNum(a.commitP95Ms, 2)}</td><td>${fmtNum(a.commitP99Ms, 2)}</td><td>${a.semanticProofPassed ?? 0}/33</td></tr>`;
    }
    const badge = `<span class="badge">${escapeXml(a.status || 'not measured')}</span>`;
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(t.version)}</td>` +
      `<td>${t.topologyUnits}</td><td>${t.processCount}</td><td>${rpo}</td>` +
      `<td>${escapeXml(a.evidenceTier)}</td><td>${badge}</td><td>${badge}</td>` +
      `<td>${badge}</td><td>${badge}</td><td>${a.semanticProofPassed ?? 0}/33</td></tr>`;
  }), '\n');
  const trB = arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' :
      (b.status ? `<span class="badge">${escapeXml(b.status)}</span>` : 'Not supported');
    if (b.decisionsPerSec != null) {
      return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(b.evidenceTier)}</td>` +
        `<td>${fmtNum(b.decisionsPerSec, 2)}</td><td>${fmtNum(b.p50Ms, 2)}</td><td>${fmtNum(b.p95Ms, 2)}</td>` +
        `<td>${fmtNum(b.p99Ms, 2)}</td><td>${b.wanBytesPerDecision ?? 0}</td>` +
        `<td>${fmtNum(b.sqlRoundTripsPerDecision, 2)}</td><td>${mov}</td></tr>`;
    }
    const badge = `<span class="badge">${escapeXml(b.status || 'not measured')}</span>`;
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(b.evidenceTier)}</td>` +
      `<td>${badge}</td><td>${badge}</td><td>${badge}</td>` +
      `<td>${badge}</td><td>${badge}</td>` +
      `<td>${badge}</td><td>${mov}</td></tr>`;
  }), '\n');
  return {trA, trB};
}

function renderPostgresqlComparisonHtml(matrix) {
  const targets = getPostgresqlComparisonTargets(matrix);
  const {trA, trB} = renderHtmlTableRows(targets);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>PostgreSQL and Lagrange Comparative Progress</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>PostgreSQL and Lagrange Comparative Progress</h1>
    <div class="nav-bar">
      <a href="index.html">Dashboard</a>
      <a href="README.md">Benchmark Index</a>
      <a href="tidb-comparison-progress.html">TiDB Comparison</a>
      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a>
    </div>
    <div class="chart-box">\n${renderPostgresqlComparisonSvg(matrix)}    </div>
    <div class="card">
      <h2>Three-Way Locality Control (Application Service vs PL/pgSQL Function vs Lagrange)</h2>
      <p>Comparative evaluation of three control-flow models across Scenario B graph shapes:</p>
      <ul>
        <li><strong>PostgreSQL + Application Service</strong>: Business logic in external process; issues SQL queries across client/database network boundaries (evaluating <code>pg-single-primary</code> and <code>pg-patroni-sync-ha-rf3</code>).</li>
        <li><strong>PostgreSQL + Server-Side PL/pgSQL Function</strong>: Logic in database procedure; collapses multi-statement round-trips while preserving ordinary-SQL Scenario A baseline (evaluating <code>pg-plpgsql-single-primary</code> and <code>pg-plpgsql-sync-ha-rf3</code>).</li>
        <li><strong>Lagrange WASI Service</strong>: Native partition state colocated with consensus; comparative performance claims await admitted GCP/lab measurements.</li>
      </ul>
    </div>
    <div class="card">
      <h2>Scenario A: Contended OLTP Baseline</h2>
      <table><thead><tr><th>Target</th><th>Version</th><th>Units</th><th>Processes</th><th>RPO=0 HA</th><th>Evidence Tier</th><th>Throughput (tx/s)</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Proofs</th></tr></thead><tbody>\n${trA}\n</tbody></table>
    </div>
    <div class="card">
      <h2>Scenario B: Distributed Risk Decision</h2>
      <table><thead><tr><th>Target</th><th>Evidence Tier</th><th>Decisions/s</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>WAN Bytes/Dec</th><th>SQL Round-Trips</th><th>Movement</th></tr></thead><tbody>\n${trB}\n</tbody></table>
    </div>
  </div>
</body>
</html>
`;
}

async function writePostgresqlComparisonStaticWebArtifacts(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const svgPath = options.svgPath || path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH);
  const markdownPath = options.markdownPath ||
    path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH);
  const htmlPath = options.htmlPath || path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const writeTarget = async (fp, content) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, content, 'utf8');
  };
  await Promise.all([writeTarget(svgPath, renderPostgresqlComparisonSvg(matrix)),
    writeTarget(markdownPath, renderPostgresqlComparisonMarkdown(matrix)),
    writeTarget(htmlPath, renderPostgresqlComparisonHtml(matrix))]);
  return Object.freeze({matrix, svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_POSTGRESQL_PROGRESS_MD_PATH,
  DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH,
  DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH,
  renderPostgresqlComparisonSvg,
  renderPostgresqlComparisonMarkdown,
  renderPostgresqlComparisonHtml,
  writePostgresqlComparisonStaticWebArtifacts,
};
