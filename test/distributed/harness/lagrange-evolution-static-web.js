import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {escapeXml, formatNum} from './comparative-landing-svg-renderer.js';
import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';
import {buildLagrangeEvolutionTimeline} from './scaleout-series-experiments.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSlice = Function.call.bind(String.prototype.slice);

export const DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH = 'docs/benchmarks/lagrange-metrics-evolution.svg';
export const DEFAULT_LAGRANGE_EVOLUTION_MD_PATH = 'docs/benchmarks/lagrange-metrics-evolution.md';
export const DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH = 'docs/benchmarks/lagrange-metrics-evolution.html';

const HTML_PAGE_STYLE = `<style>:root{--bg:#0f172a;--card-bg:#1e293b;--text:#f8fafc;--muted:#94a3b8;--border:#334155;--accent:#38bdf8}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px}.container{max-width:1100px;margin:0 auto}h1{font-size:24px;color:#fff}.nav-bar{margin:12px 0 20px 0}.nav-bar a{color:var(--accent);margin-right:12px}.card{background:var(--card-bg);border-radius:8px;border:1px solid var(--border);padding:18px;margin-bottom:24px}
.card h2{font-size:16px;color:var(--accent)}.card p,.card li{font-size:13px;line-height:1.6;color:#cbd5e1}th{color:var(--muted);font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border)}.chart-box{margin-bottom:24px;display:flex}</style>`;

const DEFAULT_TIMELINE = buildLagrangeEvolutionTimeline();

const MILESTONE_LABELS = Object.freeze({
  'v0.2.0-tidb-ref': ['v0.2.0 @ b0b2f9a (2026-09-12)', 'TiDB Reference Baseline'],
  'v0.3.0-lab-paired': ['v0.3.0 @ 8039e45 (2026-10-29)', '5-Node Lab Paired Baseline'],
  'v0.3.0-conflict-retry': ['v0.3.0 @ 66d054c (2026-10-30)', 'Conflict & Visibility Gate'],
  'v0.3.0-semantic-closure': ['v0.3.0 @ 27af74d (2026-10-30)', '33/33 Semantic Closure'],
  'v0.3.0-scenario-b-model': ['v0.3.0 @ 2d416de (2026-10-30)', '3-Island RF=3 Risk Model'],
  'v0.3.2-provenance-matrix': ['v0.3.2 @ 4dc6db6 (2026-10-30)', '13-Target Matrix & Scen C'],
  'v0.3.2-scaleout-3to5-rf3': ['v0.3.2 @ 89300e4 (2026-10-30)', '3-to-5-Node RF=3 Scale-Out'],
  'v0.3.2-partition-sweep-p6to60': ['0.3.2@2025f778 (P=6..60)', 'Partition Sweep (784 dec/s)'],
  'v0.3.2-rtt-working-set-crossover': ['0.3.2@bdee84d5 (RTT/WS)', 'RTT & Working-Set Crossover'],
  'v0.3.2-live-movement-scenario-c-scale': ['0.3.2@72c76c66 (5x/Move)', 'Live Move & 5x Scenario C'],
  'v0.3.3-tx-fast-path-5node-summary': ['0.3.3@b41d4cce (FastPath)', 'v0.3.3 Fast-Path & 5n (3.84 tx/s)'],
  'v0.4.0-scaleout-scenario-c-release': ['0.4.0@7565d8c0 (Release)', 'v0.4.0 5n & Scen C Summary'],
});

const COMMIT_DELTAS = Object.freeze([
  ['v0.2.0-tidb-ref', 'b0b2f9abcc', 'Initial TiDB reference baseline established in Docker cluster.'],
  ['v0.3.0-lab-paired', '8039e45f2a', '5-node paired cluster brings Scenario A online (0.83 tx/s, 4/33 proofs).'],
  ['v0.3.0-conflict-retry', '66d054c9c9', 'Retryable conflict handling and visibility gate expand proofs to 16/33.'],
  ['v0.3.0-semantic-closure', '27af74dc7b', 'Full 33/33 semantic proof closure reached under contended OLTP.'],
  ['v0.3.0-scenario-b-model', '2d416de6e5', 'Scenario B 3-island RF=3 risk model (441.15 dec/s, 18.09ms p99, 144 B/req WAN).'],
  ['v0.3.2-provenance-matrix', '4dc6db6b93', '13-target comparison matrix, Scenario C (441.15 dec/s @ 0ms), provenance audit.'],
  ['v0.3.2-scaleout-3to5-rf3', '89300e4d8a', '3-to-5-node RF=3 scale-out (2.24 tx/s proportional, 720.4 dec/s aggregate).'],
  ['v0.3.2-partition-sweep-p6to60', '2025f7780d', 'Peak 784.0 dec/s at P=30 (6 leaders/node) vs -5.9% coordination drop at P=60'],
  ['v0.3.2-rtt-working-set-crossover', 'bdee84d5fc', 'RTT 0.2..30ms crossover (168 dec/s @ 10ms) & heavy 2048-event working set (368 dec/s, 144 B)'],
  ['v0.3.2-live-movement-scenario-c-scale', '72c76c6629', 'Zero-stall live move (26.4 ms during-move p99) & 5x Scenario C (1840 fresh dec/s @ 0ms)'],
  ['v0.3.3-tx-fast-path-5node-summary', 'b41d4ccec4', 'v0.3.3 Scenario A tx coordination fast-path (3.84 tx/s 5-node proportional, 1490ms p95) & 5-node summary.'],
  ['v0.4.0-scaleout-scenario-c-release', '7565d8c09a', 'v0.4.0 release with 5-node RF=3 and Scenario C summary statistics on the landing page.'],
]);

function getMilestoneLabels(m) {
  return MILESTONE_LABELS[m.id] || [
    `v${m.version} @ ${stringSlice(String(m.commit || ''), 0, 7)} (${stringSlice(String(m.date || ''), 0, 10)})`,
    stringSlice(String(m.description || m.id || ''), 0, 28),
  ];
}

function getTimeline(matrix) {
  const raw = Array.isArray(matrix?.lagrangeEvolutionTimeline) &&
    matrix.lagrangeEvolutionTimeline.length > 0 ?
    matrix.lagrangeEvolutionTimeline : DEFAULT_TIMELINE;
  return arrayMap(raw, (m) => ({
    ...m, id: m.id || m.milestoneId, commit: m.commit || m.commitSha || '',
    date: m.date || m.recordedAt || '', description: m.description || m.label || '',
    executionMode: m.executionMode || m.executionPath || 'live-cluster-wire',
  }));
}

function renderMilestoneRow(x, y, [l1, l2], met, sub, barW, col, isDashed) {
  const dash = isDashed ? ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
  const fillBar = barW > 0 ?
    `\n    <rect x="${x}" y="${y + 26}" width="${barW}" height="6" fill="${col}" rx="2"${dash}/>` : '';
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="10" font-family="monospace">${escapeXml(l1)}</text>
    <text x="${x}" y="${y + 11}" fill="#94a3b8" font-size="9" font-family="monospace">${escapeXml(l2)}</text>
    <text x="${x}" y="${y + 22}" fill="#e2e8f0" font-size="9">${escapeXml(met)}</text>
    <rect x="${x}" y="${y + 26}" width="250" height="6" fill="#334155" rx="2"/>${fillBar}
    <text x="${x}" y="${y + 42}" fill="#64748b" font-size="9">${escapeXml(sub)}</text>`;
}

function getPanelInfo(m, panelType) {
  if (panelType === 1) {
    return {
      met: `${formatNum(m.scenarioATxPerSec, 2)} tx/s | p95: ${formatNum(m.scenarioAP95Ms, 1)}ms`,
      sub: `Proofs: ${m.semanticProofPassed}/${m.semanticProofRequired || 33} (${m.executionMode})`,
      val: m.semanticProofPassed / 33, col: '#38bdf8', isDashed: m.executionMode !== 'live-cluster-wire',
    };
  }
  if (panelType === 2) {
    return {
      met: `${formatNum(m.scenarioBDecisionsPerSec, 1)} dec/s | p99: ${formatNum(m.scenarioBP99Ms, 1)}ms`,
      sub: `WAN: ${m.scenarioBWanBytes || 0} B/req | Mode: ${m.executionMode}`,
      val: m.scenarioBDecisionsPerSec / 800, col: '#10b981', isDashed: m.executionMode === 'local-js-oracle',
    };
  }
  return {
    met: `${formatNum(m.scenarioCFresh0msDecPerSec, 1)} dec/s @ 0ms freshness`,
    sub: `Move p99: ${formatNum(m.scenarioBMoveP99Ms, 1)}ms | Conv: ${formatNum(m.scenarioBConvergenceMs, 1)}ms`,
    val: m.scenarioCFresh0msDecPerSec / 500, col: '#a855f7', isDashed: m.executionMode === 'local-js-oracle',
  };
}

function renderPanel(px, href, title, subTitle, timeline, panelType) {
  const innerX = px + 15;
  const panelH = 64 + timeline.length * 56;
  const pHeader = `  <rect x="${px}" y="80" width="280" height="${panelH}" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="${href}"><text x="${innerX}" y="104" fill="#38bdf8" font-size="12" font-weight="bold">${title}</text></a>
  <text x="${innerX}" y="120" fill="#94a3b8" font-size="10">${subTitle}</text>`;
  const rows = arrayMap(timeline, (m, idx) => {
    const y = 136 + idx * 56;
    const labels = getMilestoneLabels(m);
    const {met, sub, val, col, isDashed} = getPanelInfo(m, panelType);
    const w = Math.max(val > 0 ? 4 : 0, Math.min(250, Math.round(val * 250)));
    return renderMilestoneRow(innerX, y, labels, met, sub, w, col, isDashed);
  });
  return `${pHeader}\n${arrayJoin(rows, '\n')}`;
}

export function renderLagrangeEvolutionSvg(matrix) {
  const tl = getTimeline(matrix);
  const svgH = 160 + tl.length * 56;
  const p1 = renderPanel(30, 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
    'Scenario A OLTP &amp; Proofs Over Time', 'tx/s, p95 ms, and proofs (33 max)', tl, 1);
  const p2 = renderPanel(340, 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
    'Scenario B Risk Decision Over Time', 'Decisions/s, p99 ms latency, WAN bytes', tl, 2);
  const p3 = renderPanel(650, 'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision',
    'Scenario C 0ms Freshness &amp; Movement', '441.15 dec/s @ 0ms, 18.0 ms p99, 45.0 ms conv', tl, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgH}" width="960" height="${svgH}">
  <rect width="960" height="${svgH}" fill="#0f172a" rx="8"/>
  <text x="30" y="28" fill="#f8fafc" font-size="16" font-weight="bold">Lagrange Longitudinal Metrics Evolution</text>
  <text x="30" y="46" fill="#94a3b8" font-size="11">Version and commit progression across Scenario A OLTP, Scenario B Risk, and Scenario C Features</text>
  <text x="30" y="62" fill="#64748b" font-size="10">Legend: solid bar = observed-docker-cluster (live wire) | dashed bar = modeled-topology-oracle</text>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="630" y="28" fill="#94a3b8" font-size="11">Scenario A</text></a>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="720" y="28" fill="#94a3b8" font-size="11">Scenario B</text></a>
  <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision"><text x="810" y="28" fill="#38bdf8" font-size="11" font-weight="bold">Scenario C</text></a>
${p1}\n${p2}\n${p3}
</svg>\n`;
}

function renderTables(timeline) {
  const f = formatNum;
  const trM = arrayJoin(arrayMap(timeline, (m) =>
    `| ${m.id} | ${m.version} | ${m.commit} | ${stringSlice(String(m.date || ''), 0, 10)} | ` +
    `${m.evidenceTier} | ${m.executionMode} | ${f(m.scenarioATxPerSec, 2)} | ${f(m.scenarioAP95Ms, 1)} | ` +
    `${m.semanticProofPassed}/${m.semanticProofRequired || 33} | ${f(m.scenarioBDecisionsPerSec, 1)} | ${f(m.scenarioCFresh0msDecPerSec, 1)} |`), '\n');
  const htM = arrayJoin(arrayMap(timeline, (m) =>
    `<tr><td><strong>${escapeXml(m.id)}</strong></td><td>${escapeXml(m.version)}</td>` +
    `<td><code>${escapeXml(m.commit)}</code></td><td>${stringSlice(String(m.date || ''), 0, 10)}</td>` +
    `<td>${escapeXml(m.evidenceTier)}</td><td>${escapeXml(m.executionMode)}</td><td>${f(m.scenarioATxPerSec, 2)}</td>` +
    `<td>${f(m.scenarioAP95Ms, 1)}</td><td>${m.semanticProofPassed}/${m.semanticProofRequired || 33}</td><td>${f(m.scenarioBDecisionsPerSec, 1)}</td><td>${f(m.scenarioCFresh0msDecPerSec, 1)}</td></tr>`), '\n');
  return {trM, htM};
}

export function renderLagrangeEvolutionMarkdown(matrix) {
  const {trM} = renderTables(getTimeline(matrix));
  const mdD = arrayJoin(arrayMap(COMMIT_DELTAS, ([id, c, d]) => `- **${id} (commit ${c})**: ${d}`), '\n');
  return `# Lagrange Longitudinal Metrics Evolution

Progressive evolution of Lagrange across chronological milestones, tracking Scenario A OLTP throughput,
semantic proof closure, Scenario B distributed risk decision latency, and Scenario C streaming feature evaluation.

- Navigation: [Benchmark Index](README.md) | [Dashboard](index.html) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A OLTP Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk Decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | [Scenario C Streaming Feature Risk Decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![Lagrange metrics evolution over time](lagrange-metrics-evolution.svg)

## How Lagrange metrics develop over time (version and commit progression)

| Milestone | Version | Commit | Date | Evidence Tier | Execution Mode | Scenario A (tx/s) | p95 (ms) | Proofs | Scenario B (dec/s) | Scenario C (dec/s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${trM}

## Commit-over-commit delta progression

${mdD}

## Provenance qualification across historical milestones

Historical progression explicitly distinguishes physical cluster measurements from modeled topological projections:

- **observed-docker-cluster (live-cluster-wire)**: Scenario A runs in a 5-node Docker cluster over live socket connections. Transaction conflict backoffs, retry queues, and commit latencies reflect actual Linux networking and storage execution.
- **modeled-topology-oracle (local-oracle-plus-network-model / local-js-oracle)**: Scenario B distributed risk decision and Scenario C streaming feature evaluation are evaluated using simulated 3-island WAN topology models with deterministic network latency simulation and colocated memory state.
`;
}

export function renderLagrangeEvolutionHtml(matrix) {
  const {htM} = renderTables(getTimeline(matrix));
  const htD = arrayJoin(arrayMap(COMMIT_DELTAS, ([id, c, d]) =>
    `        <li><strong>${id} (${c})</strong>: ${escapeXml(d)}</li>`), '\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Lagrange Longitudinal Metrics Evolution</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>Lagrange Longitudinal Metrics Evolution</h1>
    <div class="nav-bar">
      <a href="index.html">Dashboard</a><a href="README.md">Benchmark Index</a>
      <a href="tidb-comparison-progress.md">TiDB Comparison</a>
      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a>
      <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision">Scenario C</a>
    </div>
    <div class="chart-box">\n${renderLagrangeEvolutionSvg(matrix)}    </div>
    <div class="card">
      <h2>How Lagrange Metrics Develop Over Time (Version and Commit Progression)</h2>
      <table>
        <thead><tr><th>Milestone</th><th>Version</th><th>Commit</th><th>Date</th><th>Evidence Tier</th><th>Execution Mode</th><th>Scenario A (tx/s)</th><th>p95 (ms)</th><th>Proofs</th><th>Scenario B (dec/s)</th><th>Scenario C (dec/s)</th></tr></thead>
        <tbody>\n${htM}\n        </tbody>
      </table>
    </div>
    <div class="card"><h2>Commit-Over-Commit Delta Progression</h2><ul>\n${htD}\n      </ul></div>
    <div class="card">
      <h2>Provenance Qualification Across Historical Milestones</h2>
      <p>Historical progression explicitly distinguishes physical cluster measurements from modeled topological projections:</p>
      <ul><li><strong>observed-docker-cluster (live-cluster-wire)</strong>: Scenario A runs in a 5-node Docker cluster over live socket connections.</li><li><strong>modeled-topology-oracle (local-oracle-plus-network-model / local-js-oracle)</strong>: Scenario B distributed risk decision and Scenario C streaming feature evaluation are evaluated using simulated 3-island WAN topology models.</li></ul>
    </div>
  </div>
</body>
</html>\n`;
}

export async function writeLagrangeEvolutionStaticWebArtifacts(options = {}) {
  const r = options.rootDir || process.cwd();
  const svgPath = options.svgPath || path.resolve(r, DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH);
  const markdownPath = options.markdownPath || path.resolve(r, DEFAULT_LAGRANGE_EVOLUTION_MD_PATH);
  const htmlPath = options.htmlPath || path.resolve(r, DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const write = async (f, c) => {
    await mkdir(path.dirname(f), {recursive: true});
    await writeFile(f, c, 'utf8');
  };
  await Promise.all([
    write(svgPath, renderLagrangeEvolutionSvg(matrix)),
    write(markdownPath, renderLagrangeEvolutionMarkdown(matrix)),
    write(htmlPath, renderLagrangeEvolutionHtml(matrix)),
  ]);
  return Object.freeze({matrix, svgPath, markdownPath, htmlPath});
}
