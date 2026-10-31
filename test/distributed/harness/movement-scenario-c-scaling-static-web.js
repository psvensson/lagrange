import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {escapeXml, formatNum} from './comparative-landing-svg-renderer.js';
import {
  buildMultiSystemComparativeMatrix,
  buildLiveMovementAndScenarioCScalingExperiment,
} from './comparative-matrix-runner.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);

export const DEFAULT_MOVEMENT_SCENARIO_C_SVG_PATH =
  'docs/benchmarks/movement-and-scenario-c-scaling-progress.svg';
export const DEFAULT_MOVEMENT_SCENARIO_C_MD_PATH =
  'docs/benchmarks/movement-and-scenario-c-scaling-progress.md';
export const DEFAULT_MOVEMENT_SCENARIO_C_HTML_PATH =
  'docs/benchmarks/movement-and-scenario-c-scaling-progress.html';

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8', 'ignite3-colocated-compute': '#ef4444',
  'citus-distributed-function': '#ec4899', 'yugabytedb-stored-proc': '#8b5cf6',
  'tidb-tikv': '#0284c7', 'pg-plpgsql-sync-ha-rf3': '#f59e0b',
  'pg-valkey-sync-write-through': '#10b981', 'pg-valkey-async-stream': '#a855f7',
});

const TARGET_LABELS = Object.freeze({
  'lagrange': ['Lagrange', 'Native WASI (RF=3)'],
  'ignite3-colocated-compute': ['Apache Ignite 3', 'Colocated Compute (RF=3)'],
  'citus-distributed-function': ['Citus 13', 'Dist Function (RF=3)'],
  'yugabytedb-stored-proc': ['YugabyteDB 2024.2', 'Stored Proc (RF=3)'],
  'tidb-tikv': ['TiDB + TiKV', 'Distributed SQL (RF=3)'],
  'pg-plpgsql-sync-ha-rf3': ['PG 17 Patroni', 'PL/pgSQL Sync HA (RF=3)'],
  'pg-valkey-sync-write-through': ['PG 17 + Valkey 8', 'Sync Write-Through (RF=3)'],
  'pg-valkey-async-stream': ['PG 17 + Valkey 8', 'Async CDC Stream (RF=3)'],
});

const HTML_PAGE_STYLE = `<style>:root{--bg:#0f172a;--card-bg:#1e293b;--text:#f8fafc;--muted:#94a3b8;--border:#334155;--accent:#38bdf8}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px}.container{max-width:1100px;margin:0 auto}h1{font-size:24px;color:#fff;margin:0 0 8px 0}.nav-bar{margin:12px 0 20px 0;font-size:13px}.nav-bar a{color:var(--accent);text-decoration:none;margin-right:12px}.card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:24px}.card h2{font-size:16px;color:var(--accent);margin:0 0 12px 0}.card p,.card li{font-size:13px;line-height:1.6;color:#cbd5e1}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;overflow-wrap:anywhere;word-break:break-word}th{color:var(--muted);font-weight:600}.chart-box{margin-bottom:24px;display:flex;justify-content:center}</style>`;

function getExperiment(matrix) {
  return matrix?.liveMovementAndScenarioCScalingExperiment ||
    buildLiveMovementAndScenarioCScalingExperiment();
}

function renderSvgItem(x, y, [l1, l2], metric, valW, color, sub) {
  const dash = ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"';
  const fillBar = valW > 0 ?
    `\n    <rect x="${x}" y="${y + 26}" width="${valW}" height="7" fill="${color}" rx="2"${dash}/>` : '';
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${l1}</text>
    <text x="${x}" y="${y + 11}" fill="#94a3b8" font-size="10" font-family="monospace">${l2}</text>
    <text x="${x}" y="${y + 22}" fill="#cbd5e1" font-size="10">${escapeXml(metric)}</text>
    <rect x="${x}" y="${y + 26}" width="250" height="7" fill="#334155" rx="2"/>${fillBar}
    <text x="${x}" y="${y + 43}" fill="#64748b" font-size="9">${escapeXml(sub)}</text>`;
}

function renderSvgPanels(exp) {
  const f = formatNum;
  const r1 = arrayJoin(arrayMap(exp.liveMovementPhases, (m, i) => {
    const w = (typeof m.duringMoveP99Ms === 'number') ?
      Math.max(4, Math.min(250, Math.round((m.duringMoveP99Ms / 100) * 250))) : 0;
    const sub = `Convergence: ${f(m.routingConvergenceMs, 0)}ms | Stall: ${f(m.writeStallMs, 0)}ms`;
    const label = (typeof m.duringMoveP99Ms === 'number') ?
      `During: ${f(m.duringMoveP99Ms, 1)}ms (Pre: ${f(m.preMoveP99Ms, 1)}ms)` : '[not measured]';
    return renderSvgItem(45, 132 + i * 72, TARGET_LABELS[m.targetId] || [m.label, ''],
      label, w, TARGET_COLORS[m.targetId] || '#94a3b8', sub);
  }), '\n');
  const r2 = arrayJoin(arrayMap(exp.scenarioCJointScaling, (s, i) => {
    const w = (typeof s.scale5xFresh0msDecPerSec === 'number' && s.scale5xFresh0msDecPerSec > 0) ?
      Math.max(4, Math.min(250, Math.round((s.scale5xFresh0msDecPerSec / 2200) * 250))) : 0;
    const sub = `1x: ${f(s.scale1xFresh0msDecPerSec, 0)} dec/s | Stale: ${f(s.staleDecisionRatePct, 2)}%`;
    const label = (typeof s.scale5xFresh0msDecPerSec === 'number') ?
      `0ms: ${f(s.scale5xFresh0msDecPerSec, 0)} | 1k: ${f(s.scale5xFresh1000msDecPerSec, 0)} dec/s` : '[not measured]';
    return renderSvgItem(355, 132 + i * 72, TARGET_LABELS[s.targetId] || [s.label, ''],
      label, w, TARGET_COLORS[s.targetId] || '#94a3b8', sub);
  }), '\n');
  const r3 = arrayJoin(arrayMap(exp.scenarioCJointScaling, (s, i) => {
    const w = (typeof s.ruleChangeBackfillSec === 'number' && s.ruleChangeBackfillSec > 0) ?
      Math.max(4, Math.min(250, Math.round((s.ruleChangeBackfillSec / 900) * 250))) : 0;
    const sub = `Pipelines: ${s.operationalPipelines} | Stale: ${f(s.staleDecisionRatePct, 2)}%`;
    const label = (typeof s.ruleChangeBackfillSec === 'number') ?
      `Backfill: ${f(s.ruleChangeBackfillSec, 0)}s | Rec: ${f(s.cacheRestartRecoverySec, 1)}s` : '[not measured]';
    return renderSvgItem(665, 132 + i * 72, TARGET_LABELS[s.targetId] || [s.label, ''],
      label, w, TARGET_COLORS[s.targetId] || '#94a3b8', sub);
  }), '\n');
  return `${r1}\n${r2}\n${r3}`;
}

export function renderMovementScenarioCScalingSvg(matrix) {
  const exp = getExperiment(matrix);
  const title = 'Live Movement Under Load &amp; Scenario C 5x Joint Scaling';
  const sub1 = 'Partition rebalancing under load and 5x ingestion &amp; decision scaling';
  const sub2 = 'Legend: dashed border = modeled-topology-oracle (simulated cluster wire)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560" width="960" height="560">
  <rect width="960" height="560" fill="#0f172a" rx="8"/>
  <text x="30" y="28" fill="#f8fafc" font-size="16" font-weight="bold">${title}</text>
  <text x="30" y="44" fill="#94a3b8" font-size="11">${sub1}</text>
  <text x="30" y="58" fill="#64748b" font-size="10">${sub2}</text>
  <a href="README.md"><text x="530" y="28" fill="#38bdf8" font-size="11">Overview</text></a>
  <a href="lagrange-metrics-evolution.md"><text x="600" y="28" fill="#38bdf8" font-size="11">Evolution</text></a>
  <a href="scaleout-3to5-node-rf3-progress.md"><text x="670" y="28" fill="#38bdf8" font-size="11">3-to-5 Scale</text></a>
  <a href="partition-granularity-sweep-progress.md"><text x="755" y="28" fill="#38bdf8" font-size="11">Partition Sweep</text></a>
  <a href="scenario-b-rtt-working-set-crossover.md"><text x="860" y="28" fill="#38bdf8" font-size="11">RTT Crossover</text></a>
  <rect x="30" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="45" y="98" fill="#38bdf8" font-size="12" font-weight="bold">Live Movement p99 Latency: Pre, During &amp; Post (ms)</text>
  <text x="45" y="114" fill="#94a3b8" font-size="10">Pre, during, and post move latency under load</text>
  <rect x="340" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="355" y="98" fill="#38bdf8" font-size="12" font-weight="bold">Scenario C 5x Joint Scale: 0ms vs 1000ms SLA (dec/s)</text>
  <text x="355" y="114" fill="#94a3b8" font-size="10">Ingestion &amp; decision scaling across SLA tiers</text>
  <rect x="650" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="665" y="98" fill="#38bdf8" font-size="12" font-weight="bold">5x Scale Rule-Change Backfill &amp; Recovery (sec)</text>
  <text x="665" y="114" fill="#94a3b8" font-size="10">Cold cache restart recovery &amp; backfill delay</text>
${renderSvgPanels(exp)}
</svg>\n`;
}

function renderTables(exp) {
  const f = formatNum;
  const mdMv = arrayJoin(arrayMap(exp.liveMovementPhases, (m) => {
    const verified = m.zeroLossIdentityVerified !== null ? (m.zeroLossIdentityVerified ? 'Yes' : 'No') : '[not measured]';
    return `| ${m.label} | ${f(m.preMoveP99Ms, 2)} | ${f(m.duringMoveP99Ms, 1)} | ` +
      `${f(m.postMoveP99Ms, 1)} | ${f(m.routingConvergenceMs, 1)} | ${f(m.writeStallMs, 1)} | ` +
      `${verified} | ${m.evidenceTier} |`;
  }), '\n');
  const htMv = arrayJoin(arrayMap(exp.liveMovementPhases, (m) => {
    const pre = m.preMoveP99Ms !== null ? f(m.preMoveP99Ms, 2) : '<span class="badge">not measured</span>';
    const dur = m.duringMoveP99Ms !== null ? f(m.duringMoveP99Ms, 1) : '<span class="badge">not measured</span>';
    const post = m.postMoveP99Ms !== null ? f(m.postMoveP99Ms, 1) : '<span class="badge">not measured</span>';
    const conv = m.routingConvergenceMs !== null ? f(m.routingConvergenceMs, 1) : '<span class="badge">not measured</span>';
    const stall = m.writeStallMs !== null ? f(m.writeStallMs, 1) : '<span class="badge">not measured</span>';
    const verified = m.zeroLossIdentityVerified !== null ? (m.zeroLossIdentityVerified ? 'Yes' : 'No') : '<span class="badge">not measured</span>';
    return `<tr><td><strong>${escapeXml(m.label)}</strong></td><td>${pre}</td>` +
      `<td>${dur}</td><td>${post}</td>` +
      `<td>${conv}</td><td>${stall}</td>` +
      `<td>${verified}</td><td>${escapeXml(m.evidenceTier)}</td></tr>`;
  }), '\n');

  const mdSc = arrayJoin(arrayMap(exp.scenarioCJointScaling, (s) => {
    const stale = s.staleDecisionRatePct !== null ? `${f(s.staleDecisionRatePct, 2)}%` : '[not measured]';
    return `| ${s.label} | ${f(s.scale1xFresh0msDecPerSec, 1)} | ${f(s.scale5xFresh0msDecPerSec, 1)} | ` +
      `${f(s.scale5xFresh1000msDecPerSec, 1)} | ${stale} | ` +
      `${f(s.ruleChangeBackfillSec, 1)} | ${f(s.cacheRestartRecoverySec, 1)} | ${s.operationalPipelines} | ` +
      `${s.evidenceTier} |`;
  }), '\n');
  const htSc = arrayJoin(arrayMap(exp.scenarioCJointScaling, (s) => {
    const s1x = s.scale1xFresh0msDecPerSec !== null ? f(s.scale1xFresh0msDecPerSec, 1) : '<span class="badge">not measured</span>';
    const s5x0 = s.scale5xFresh0msDecPerSec !== null ? f(s.scale5xFresh0msDecPerSec, 1) : '<span class="badge">not measured</span>';
    const s5x1k = s.scale5xFresh1000msDecPerSec !== null ? f(s.scale5xFresh1000msDecPerSec, 1) : '<span class="badge">not measured</span>';
    const stale = s.staleDecisionRatePct !== null ? `${f(s.staleDecisionRatePct, 2)}%` : '<span class="badge">not measured</span>';
    const backfill = s.ruleChangeBackfillSec !== null ? f(s.ruleChangeBackfillSec, 1) : '<span class="badge">not measured</span>';
    const rec = s.cacheRestartRecoverySec !== null ? f(s.cacheRestartRecoverySec, 1) : '<span class="badge">not measured</span>';
    return `<tr><td><strong>${escapeXml(s.label)}</strong></td><td>${s1x}</td>` +
      `<td>${s5x0}</td><td>${s5x1k}</td>` +
      `<td>${stale}</td><td>${backfill}</td>` +
      `<td>${rec}</td><td>${s.operationalPipelines}</td>` +
      `<td>${escapeXml(s.evidenceTier)}</td></tr>`;
  }), '\n');

  const mdOb = arrayJoin(arrayMap(exp.operatingBoundaryMap, (b) =>
    `| ${b.regimeId} | ${b.workloadDescription} | ${b.winningSystem} | ${b.architecturalReason} |`), '\n');
  const htOb = arrayJoin(arrayMap(exp.operatingBoundaryMap, (b) =>
    `<tr><td><code>${escapeXml(b.regimeId)}</code></td><td>${escapeXml(b.workloadDescription)}</td>` +
    `<td><strong>${escapeXml(b.winningSystem)}</strong></td><td>${escapeXml(b.architecturalReason)}</td></tr>`), '\n');

  return {mdMv, htMv, mdSc, htSc, mdOb, htOb};
}

const DESC_MV = 'Evaluating partition movement under steady background load demonstrates ' +
  'the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. ' +
  'Modeled pause times have been withdrawn; empirical movement measurements require original ' +
  'GCP or lab execution receipts under verifiable cluster telemetry.';

const DESC_SC = 'Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, ' +
  'and decision evaluation tests state freshness guarantees and recovery pipelines. ' +
  'Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts ' +
  'with end-to-end receipt digests.';

const DESC_OB = 'The operating-boundary map delineates architectural trade-offs across candidate systems. ' +
  'Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.';

const NAV_MD = '- Navigation: [Comparative Benchmarks Landing Page](README.md) | ' +
  '[Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | ' +
  '[3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | ' +
  '[5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | ' +
  '[Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)';

export function renderMovementScenarioCScalingMarkdown(matrix) {
  const exp = getExperiment(matrix);
  const {mdMv, mdSc, mdOb} = renderTables(exp);
  return `# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

${NAV_MD}

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

${DESC_MV}

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
${mdMv}

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

${DESC_SC}

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${mdSc}

## Architectural operating-boundary map (where each system wins)

${DESC_OB}

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
${mdOb}
`;
}

export function renderMovementScenarioCScalingHtml(matrix) {
  const exp = getExperiment(matrix);
  const {htMv, htSc, htOb} = renderTables(exp);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Live Partition Movement Under Steady Load and Scenario C 5x Scaling</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>Live Partition Movement Under Steady Load and Scenario C 5x Scaling</h1>
    <div class="nav-bar">
      <a href="index.html">Comparative Benchmarks Landing Page</a>
      <a href="lagrange-metrics-evolution.html">Lagrange Metrics Evolution Over Time</a>
      <a href="scaleout-3to5-node-rf3-progress.html">3-to-5-Node RF=3 Scale-Out Comparison</a>
      <a href="partition-granularity-sweep-progress.html">5-Node RF=3 Partition Granularity Sweep</a>
      <a href="scenario-b-rtt-working-set-crossover.html">Scenario B RTT Crossover &amp; Working Set</a>
    </div>
    <div class="chart-box">\n${renderMovementScenarioCScalingSvg(matrix)}    </div>
    <div class="card">
      <h2>Live Partition Movement Under Steady Load (Pre-Move, During-Move, Post-Move)</h2>
      <p>${DESC_MV}</p>
      <table><thead><tr><th>Target</th><th>Pre-Move (ms)</th><th>During-Move (ms)</th><th>Post-Move (ms)</th><th>Convergence (ms)</th><th>Write Stall (ms)</th><th>Zero-Loss Verified</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htMv}\n      </tbody></table>
    </div>
    <div class="card">
      <h2>Scenario C Joint Scaling (5x Ingestion, Active Entities, and Decision Load)</h2>
      <p>${DESC_SC}</p>
      <table><thead><tr><th>Target</th><th>1x Scale (0ms)</th><th>5x Scale (0ms)</th><th>5x Scale (1000ms)</th><th>Stale Rate %</th><th>Rule Backfill (s)</th><th>Cache Recovery (s)</th><th>Pipelines</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htSc}\n      </tbody></table>
    </div>
    <div class="card">
      <h2>Architectural Operating-Boundary Map (Where Each System Wins)</h2>
      <p>${DESC_OB}</p>
      <table><thead><tr><th>Operating Regime</th><th>Workload Description</th><th>Winning System</th><th>Architectural Reason</th></tr></thead>
        <tbody>\n${htOb}\n      </tbody></table>
    </div>
  </div>
</body>
</html>\n`;
}

export async function writeMovementScenarioCScalingStaticWebArtifacts(options = {}) {
  const root = options.rootDir || process.cwd();
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const paths = {
    svgPath: options.svgPath || path.resolve(root, DEFAULT_MOVEMENT_SCENARIO_C_SVG_PATH),
    markdownPath: options.markdownPath || path.resolve(root, DEFAULT_MOVEMENT_SCENARIO_C_MD_PATH),
    htmlPath: options.htmlPath || path.resolve(root, DEFAULT_MOVEMENT_SCENARIO_C_HTML_PATH),
  };
  const write = async (fp, c) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, c, 'utf8');
  };
  await Promise.all([
    write(paths.svgPath, renderMovementScenarioCScalingSvg(matrix)),
    write(paths.markdownPath, renderMovementScenarioCScalingMarkdown(matrix)),
    write(paths.htmlPath, renderMovementScenarioCScalingHtml(matrix)),
  ]);
  return Object.freeze({matrix, ...paths});
}
