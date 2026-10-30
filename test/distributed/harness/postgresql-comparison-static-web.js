import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringReplace = Function.call.bind(String.prototype.replace);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const DEFAULT_POSTGRESQL_PROGRESS_MD_PATH = 'docs/benchmarks/postgresql-comparison-progress.md';
const DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH = 'docs/benchmarks/postgresql-comparison-progress.html';
const DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH = 'docs/benchmarks/postgresql-comparison-progress.svg';

const TARGET_COLORS = {
  'pg-single-primary': '#94a3b8',
  'lagrange': '#38bdf8',
  'pg-patroni-sync-ha-rf3': '#a78bfa',
  'tidb-tikv': '#f59e0b',
};

const TARGET_SHORT_LABELS = {
  'pg-single-primary': 'PG Single (2-unit)',
  'lagrange': 'Lagrange (3-unit)',
  'pg-patroni-sync-ha-rf3': 'PG Patroni HA (6-unit)',
  'tidb-tikv': 'TiDB+TiKV (6-unit)',
};

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function fmtNum(val, digits = 1) {
  return (typeof val === 'number' && Number.isFinite(val)) ? numberToFixed(val, digits) : '0.0';
}

function renderSvgPanel1And2(targets) {
  return arrayJoin(arrayMap(targets, (t, idx) => {
    const y = 135 + idx * 64;
    const col = TARGET_COLORS[t.targetId] || '#94a3b8';
    const lbl = escapeXml(TARGET_SHORT_LABELS[t.targetId] || t.label);
    const tx = t.scenarioA?.throughputTxPerSec || 0;
    const aP95 = t.scenarioA?.commitP95Ms || 0;
    const wA = Math.max(4, Math.min(250, Math.round((tx / 350) * 250)));
    const dec = t.scenarioB?.decisionsPerSec || 0;
    const bP99 = t.scenarioB?.p99Ms || 0;
    const wB = Math.max(4, Math.min(250, Math.round((dec / 500) * 250)));
    const tierA = escapeXml(t.scenarioA?.evidenceTier || 'modeled');
    const tierB = escapeXml(t.scenarioB?.evidenceTier || 'modeled');
    return `    <text x="35" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl}: ${fmtNum(tx, 1)} tx/s (p95: ${fmtNum(aP95, 1)}ms)</text>\n` +
      `    <rect x="35" y="${y + 6}" width="250" height="10" fill="#334155" rx="3"/>\n` +
      `    <rect x="35" y="${y + 6}" width="${wA}" height="10" fill="${col}" rx="3"/>\n` +
      `    <text x="35" y="${y + 26}" fill="#64748b" font-size="9">${tierA}</text>\n` +
      `    <text x="345" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl}: ${fmtNum(dec, 1)} dec/s (p99: ${fmtNum(bP99, 1)}ms)</text>\n` +
      `    <rect x="345" y="${y + 6}" width="250" height="10" fill="#334155" rx="3"/>\n` +
      `    <rect x="345" y="${y + 6}" width="${wB}" height="10" fill="${col}" rx="3"/>\n` +
      `    <text x="345" y="${y + 26}" fill="#64748b" font-size="9">${tierB}</text>`;
  }), '\n');
}

function renderSvgPanel3(targets) {
  return arrayJoin(arrayMap(targets, (t, idx) => {
    const y = 135 + idx * 64;
    const col = TARGET_COLORS[t.targetId] || '#94a3b8';
    const lbl = escapeXml(TARGET_SHORT_LABELS[t.targetId] || t.label);
    const wan = t.scenarioB?.wanBytesPerDecision || 0;
    const wW = Math.max(4, Math.min(260, Math.round((wan / 5000) * 260)));
    const s = t.scenarioB?.shapes || {};
    const loc = fmtNum(s['local-only']?.decisionsPerSec, 0);
    const rem = fmtNum(s['one-remote-stage']?.decisionsPerSec, 0);
    const seq = fmtNum(s['sequential']?.decisionsPerSec, 0);
    const fan = fmtNum(s['fan-out']?.decisionsPerSec, 0);
    return `    <text x="655" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${lbl} - WAN: ${wan}B</text>\n` +
      `    <rect x="655" y="${y + 6}" width="260" height="8" fill="#334155" rx="3"/>\n` +
      `    <rect x="655" y="${y + 6}" width="${wW}" height="8" fill="${col}" rx="3"/>\n` +
      `    <text x="655" y="${y + 25}" fill="#94a3b8" font-size="9" font-family="monospace">${loc} / ${rem} / ${seq} / ${fan} dec/s</text>`;
  }), '\n');
}

function renderPostgresqlComparisonSvg(matrix) {
  const targets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 440" width="960" height="440">\n' +
    '  <rect width="960" height="440" fill="#0f172a" rx="8"/>\n' +
    '  <text x="20" y="32" fill="#f8fafc" font-size="16" font-family="system-ui, sans-serif" font-weight="bold">PostgreSQL &amp; Lagrange Comparative Progress Matrix</text>\n' +
    '  <text x="20" y="48" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Contended OLTP baseline vs distributed risk decision graph shapes</text>\n' +
    '  <rect x="20" y="58" width="290" height="362" fill="#1e293b" rx="6" stroke="#334155"/>\n' +
    '  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="82" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: OLTP Baseline</text></a>\n' +
    '  <text x="35" y="100" fill="#94a3b8" font-size="10">Throughput (tx/s) &amp; p95 latency (ms)</text>\n' +
    '  <rect x="330" y="58" width="290" height="362" fill="#1e293b" rx="6" stroke="#334155"/>\n' +
    '  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="345" y="82" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Risk Decision</text></a>\n' +
    '  <text x="345" y="100" fill="#94a3b8" font-size="10">Decisions/s &amp; p99 latency (ms)</text>\n' +
    '  <rect x="640" y="58" width="300" height="362" fill="#1e293b" rx="6" stroke="#334155"/>\n' +
    '  <text x="655" y="82" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: 4-Shape Ladder &amp; WAN</text>\n' +
    '  <text x="655" y="100" fill="#94a3b8" font-size="10">Throughput (local/remote/seq/fan) &amp; WAN bytes</text>\n' +
    renderSvgPanel1And2(targets) + '\n' +
    renderSvgPanel3(targets) + '\n' +
    '</svg>\n';
}

function renderScenarioATableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No (data-loss window)';
    const proofs = `${a.semanticProofPassed ?? 0}/${a.semanticProofTotal ?? 33}`;
    return `| ${t.targetId} | ${t.version} | ${t.topologyUnits} | ${t.processCount} | ${rpo} | ` +
      `${a.evidenceTier} | ${fmtNum(a.throughputTxPerSec, 2)} | ${fmtNum(a.commitP50Ms, 2)} | ` +
      `${fmtNum(a.commitP95Ms, 2)} | ${fmtNum(a.commitP99Ms, 2)} | ${proofs} |`;
  }), '\n');
}

function renderScenarioBTableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' : 'Not supported';
    return `| ${t.targetId} | ${b.evidenceTier} | ${fmtNum(b.decisionsPerSec, 2)} | ${fmtNum(b.p50Ms, 2)} | ` +
      `${fmtNum(b.p95Ms, 2)} | ${fmtNum(b.p99Ms, 2)} | ${b.wanBytesPerDecision ?? 0} | ` +
      `${fmtNum(b.sqlRoundTripsPerDecision, 2)} | ${mov} |`;
  }), '\n');
}

function renderShapeTableRows(targets) {
  return arrayJoin(arrayMap(targets, (t) => {
    const s = t.scenarioB?.shapes || {};
    const fmt = (sh) => `${fmtNum(sh?.decisionsPerSec, 1)} dec/s, p99 ${fmtNum(sh?.p99Ms, 1)}ms, ` +
      `${sh?.wanBytes ?? 0}B, ${sh?.roundTrips ?? 0}RT`;
    return `| ${t.targetId} | ${fmt(s['local-only'])} | ${fmt(s['one-remote-stage'])} | ` +
      `${fmt(s['sequential'])} | ${fmt(s['fan-out'])} |`;
  }), '\n');
}

function renderPostgresqlComparisonMarkdown(matrix) {
  const targets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  return '# PostgreSQL and Lagrange Comparative Progress\n\n' +
    'Comparative evaluation of Lagrange against PostgreSQL 17 configurations across ' +
    'Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.\n\n' +
    '- Comparative navigation: [Comparative Statistics Landing Page](README.md) | ' +
    '[Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison Detail Page](tidb-comparison-progress.md)\n' +
    '- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), ' +
    '[Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), ' +
    '[Paired Benchmark Owner](tidb-reference-paired-owner.md), and ' +
    '[Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)\n\n' +
    '![PostgreSQL and Lagrange comparative progress chart](postgresql-comparison-progress.svg)\n\n' +
    '## Deployment topology and durability boundary\n\n' +
    '- `pg-single-primary` (2-unit): Standard relational deployment with 1 PostgreSQL 17.2 instance ' +
    'and 1 dedicated application service process. High throughput for localized OLTP without consensus ' +
    'replication overhead, but carries a non-zero recovery point objective (data loss window) upon host failure.\n' +
    '- `pg-patroni-sync-ha-rf3` (6-unit / 9 processes): Strict zero data loss high availability cluster ' +
    'configured with Patroni 4.0, etcd 3.5 distributed consensus, synchronous physical replication ' +
    '(`synchronous_mode_strict: true`), PgBouncer connection pooling, and HAProxy load balancing. ' +
    'Guarantees RPO=0 across primary node failures at the cost of synchronous commit round-trips.\n' +
    '- Query engine capability: PostgreSQL demonstrates full relational competence with pushdown ' +
    'aggregations (`COUNT`, `SUM`), index scan optimizations, and ACID serializability.\n\n' +
    '## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))\n\n' +
    '| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    renderScenarioATableRows(targets) + '\n\n' +
    '## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))\n\n' +
    '| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    renderScenarioBTableRows(targets) + '\n\n' +
    '## Scenario B four-shape latency and throughput ladder\n\n' +
    '| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    renderShapeTableRows(targets) + '\n';
}

function renderHtmlTableRows(targets) {
  const trA = arrayJoin(arrayMap(targets, (t) => {
    const a = t.scenarioA || {};
    const rpo = t.rpoZeroSurvivability ? 'Yes (RPO=0)' : 'No';
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(t.version)}</td>` +
      `<td>${t.topologyUnits}</td><td>${t.processCount}</td><td>${rpo}</td><td>${escapeXml(a.evidenceTier)}</td>` +
      `<td>${fmtNum(a.throughputTxPerSec, 2)}</td><td>${fmtNum(a.commitP50Ms, 2)}</td>` +
      `<td>${fmtNum(a.commitP95Ms, 2)}</td><td>${fmtNum(a.commitP99Ms, 2)}</td><td>${a.semanticProofPassed ?? 0}/33</td></tr>`;
  }), '\n');
  const trB = arrayJoin(arrayMap(targets, (t) => {
    const b = t.scenarioB || {};
    const mov = b.movementContinuityPassed ? 'Passed' : 'Not supported';
    return `<tr><td><strong>${escapeXml(t.targetId)}</strong></td><td>${escapeXml(b.evidenceTier)}</td>` +
      `<td>${fmtNum(b.decisionsPerSec, 2)}</td><td>${fmtNum(b.p50Ms, 2)}</td><td>${fmtNum(b.p95Ms, 2)}</td>` +
      `<td>${fmtNum(b.p99Ms, 2)}</td><td>${b.wanBytesPerDecision ?? 0}</td><td>${fmtNum(b.sqlRoundTripsPerDecision, 2)}</td><td>${mov}</td></tr>`;
  }), '\n');
  return {trA, trB};
}

function renderPostgresqlComparisonHtml(matrix) {
  const targets = matrix?.targets || buildMultiSystemComparativeMatrix().targets;
  const svg = renderPostgresqlComparisonSvg(matrix);
  const {trA, trB} = renderHtmlTableRows(targets);
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8"/>\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n' +
    '  <title>PostgreSQL and Lagrange Comparative Progress</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: #334155; --accent: #38bdf8; }\n' +
    '    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }\n' +
    '    .container { max-width: 1100px; margin: 0 auto; }\n' +
    '    h1 { font-size: 24px; margin: 0 0 8px 0; color: #fff; }\n' +
    '    .nav-bar { margin: 12px 0 20px 0; font-size: 13px; color: var(--muted); }\n' +
    '    .nav-bar a { color: var(--accent); text-decoration: none; margin-right: 12px; }\n' +
    '    .nav-bar a:hover { text-decoration: underline; }\n' +
    '    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 24px; overflow-x: auto; }\n' +
    '    .card h2 { font-size: 16px; margin: 0 0 14px 0; color: var(--accent); }\n' +
    '    table { width: 100%; border-collapse: collapse; font-size: 13px; }\n' +
    '    th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }\n' +
    '    th { color: var(--muted); font-weight: 600; }\n' +
    '    .chart-box { margin-bottom: 24px; display: flex; justify-content: center; }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <div class="container">\n' +
    '    <h1>PostgreSQL and Lagrange Comparative Progress</h1>\n' +
    '    <div class="nav-bar">\n' +
    '      <a href="index.html">Dashboard</a>\n' +
    '      <a href="README.md">Benchmark Index</a>\n' +
    '      <a href="tidb-comparison-progress.html">TiDB Comparison</a>\n' +
    '      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>\n' +
    '      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a>\n' +
    '    </div>\n' +
    `    <div class="chart-box">\n${svg}    </div>\n` +
    '    <div class="card">\n' +
    '      <h2>Scenario A: Contended OLTP Baseline</h2>\n' +
    '      <table><thead><tr><th>Target</th><th>Version</th><th>Units</th><th>Processes</th><th>RPO=0 HA</th><th>Evidence Tier</th><th>Throughput (tx/s)</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Proofs</th></tr></thead>\n' +
    `      <tbody>\n${trA}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Scenario B: Distributed Risk Decision</h2>\n' +
    '      <table><thead><tr><th>Target</th><th>Evidence Tier</th><th>Decisions/s</th><th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>WAN Bytes/Dec</th><th>SQL Round-Trips</th><th>Movement</th></tr></thead>\n' +
    `      <tbody>\n${trB}\n      </tbody></table>\n` +
    '    </div>\n' +
    '  </div>\n</body>\n</html>\n';
}

async function writePostgresqlComparisonStaticWebArtifacts(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const svgPath = options.svgPath || path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_SVG_PATH);
  const markdownPath =
    options.markdownPath || path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_MD_PATH);
  const htmlPath = options.htmlPath || path.resolve(rootDir, DEFAULT_POSTGRESQL_PROGRESS_HTML_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);

  const svg = renderPostgresqlComparisonSvg(matrix);
  const markdown = renderPostgresqlComparisonMarkdown(matrix);
  const html = renderPostgresqlComparisonHtml(matrix);

  const writeTarget = async (filePath, content) => {
    await mkdir(path.dirname(filePath), {recursive: true});
    await writeFile(filePath, content, 'utf8');
  };

  await writeTarget(svgPath, svg);
  await writeTarget(markdownPath, markdown);
  await writeTarget(htmlPath, html);

  return Object.freeze({
    matrix,
    svgPath,
    markdownPath,
    htmlPath,
  });
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
