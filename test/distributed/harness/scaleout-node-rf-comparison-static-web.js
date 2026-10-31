import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {escapeXml, formatNum} from './comparative-landing-svg-renderer.js';
import {buildMultiSystemComparativeMatrix, buildScaleout3To5Rf3Experiment} from './comparative-matrix-runner.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const objectValues = Object.values;

export const DEFAULT_SCALEOUT_3TO5_SVG_PATH = 'docs/benchmarks/scaleout-3to5-node-rf3-progress.svg';
export const DEFAULT_SCALEOUT_3TO5_MD_PATH = 'docs/benchmarks/scaleout-3to5-node-rf3-progress.md';
export const DEFAULT_SCALEOUT_3TO5_HTML_PATH = 'docs/benchmarks/scaleout-3to5-node-rf3-progress.html';

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8',
  'tidb-tikv': '#0284c7',
  'citus-sql-service': '#ec4899',
  'citus-distributed-function': '#ec4899',
  'yugabytedb-ysql-rf3': '#8b5cf6',
  'yugabytedb-stored-proc': '#8b5cf6',
  'ignite3-colocated-compute': '#ef4444',
  'pg-patroni-sync-ha-rf3': '#d97706',
});

const TARGET_LABELS = Object.freeze({
  'lagrange': ['Lagrange 0.3.3', 'Native WASI (RF=3)'],
  'tidb-tikv': ['TiDB + TiKV', 'Distributed SQL (RF=3)'],
  'citus-sql-service': ['Citus 13', 'Sharded SQL + App (RF=3)'],
  'citus-distributed-function': ['Citus 13', 'Distributed Function (RF=3)'],
  'yugabytedb-ysql-rf3': ['YugabyteDB 2024.2', 'YSQL + App Service (RF=3)'],
  'yugabytedb-stored-proc': ['YugabyteDB 2024.2', 'Stored Procedure (RF=3)'],
  'ignite3-colocated-compute': ['Apache Ignite 3', 'Colocated Compute (RF=3)'],
  'pg-patroni-sync-ha-rf3': ['PG 17 Patroni HA', 'Patroni Sync HA (RF=3)'],
});

const HTML_PAGE_STYLE = `<style>
:root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: #334155; --accent: #38bdf8; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
.container { max-width: 1100px; margin: 0 auto; } h1 { font-size: 24px; color: #fff; margin: 0 0 8px 0; }
.nav-bar { margin: 12px 0 20px 0; font-size: 13px; } .nav-bar a { color: var(--accent); text-decoration: none; margin-right: 12px; }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 24px; }
.card h2 { font-size: 16px; color: var(--accent); margin: 0 0 12px 0; } .card p, .card li { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }
th { color: var(--muted); font-weight: 600; } .chart-box { margin-bottom: 24px; display: flex; justify-content: center; }
</style>`;

function renderSvgItem(x, y, [l1, l2], metric, valW, color, isModeled, sub) {
  const dash = isModeled ? ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
  return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${l1}</text>
    <text x="${x}" y="${y + 11}" fill="#94a3b8" font-size="10" font-family="monospace">${l2}</text>
    <text x="${x}" y="${y + 22}" fill="#cbd5e1" font-size="10">${metric}</text>
    <rect x="${x}" y="${y + 26}" width="250" height="7" fill="#334155" rx="2"/>
    <rect x="${x}" y="${y + 26}" width="${valW}" height="7" fill="${color}" rx="2"${dash}/>
    <text x="${x}" y="${y + 43}" fill="#64748b" font-size="9">${sub}</text>`;
}

function renderSvgPanels(exp) {
  const pA = exp.scenarioAModes['proportional-growth-scaleout'];
  const pB = exp.scenarioBCoverage;
  const f = formatNum;
  const r1 = arrayJoin(arrayMap(pA, (t, i) => renderSvgItem(45, 132 + i * 53,
    TARGET_LABELS[t.targetId] || [t.label, ''],
    `${f(t.tx3Node, 2)} -> ${f(t.tx5Node, 2)} tx/s (+${f(t.scaleGainPct, 1)}%)`,
    Math.max(4, Math.min(250, Math.round((t.tx5Node / 22) * 250))),
    TARGET_COLORS[t.targetId] || '#94a3b8', true,
    `p95: ${f(t.p95Ms3Node, 0)}ms -> ${f(t.p95Ms5Node, 0)}ms (modeled)`)), '\n');
  const r2 = arrayJoin(arrayMap(pB, (t, i) => renderSvgItem(355, 132 + i * 53,
    TARGET_LABELS[t.targetId] || [t.label, ''],
    `${f(t.dec3Node100Pct, 1)} -> ${f(t.dec5Node60Pct, 1)} dec/s (60%)`,
    Math.max(4, Math.min(250, Math.round((t.dec5Node60Pct / 500) * 250))),
    TARGET_COLORS[t.targetId] || '#94a3b8', true,
    `5n p99: ${f(t.p99Ms5Node, 1)}ms | WAN: ${t.wire5Node} B/dec`)), '\n');
  const r3 = arrayJoin(arrayMap(pB, (t, i) => renderSvgItem(665, 132 + i * 53,
    TARGET_LABELS[t.targetId] || [t.label, ''],
    `${f(t.aggregate5NodeDecPerSec, 1)} dec/s cluster aggregate`,
    Math.max(4, Math.min(250, Math.round((t.aggregate5NodeDecPerSec / 800) * 250))),
    TARGET_COLORS[t.targetId] || '#94a3b8', true,
    `cluster aggregate at 5 nodes | ${t.wire5Node} B/dec`)), '\n');
  return `${r1}\n${r2}\n${r3}`;
}

export function renderScaleout3To5ComparisonSvg(matrix) {
  const exp = matrix?.scaleout3To5Rf3Experiment || buildScaleout3To5Rf3Experiment();
  const title = '3-to-5-Node RF=3 Scale-Out &amp; Scenario A 3-Mode Separation';
  const sub1 = 'Replica-coverage transition (100% at 3 nodes vs 60% at 5 nodes) and cross-target scaling';
  const sub2 = 'Legend: solid bar = observed-docker-cluster | dashed border = modeled-topology-oracle';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 440" width="960" height="440">
  <rect width="960" height="440" fill="#0f172a" rx="8"/>
  <text x="30" y="28" fill="#f8fafc" font-size="16" font-weight="bold">${title}</text>
  <text x="30" y="44" fill="#94a3b8" font-size="11">${sub1}</text>
  <text x="30" y="58" fill="#64748b" font-size="10">${sub2}</text>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="690" y="28" fill="#38bdf8" font-size="11">Scenario A</text></a>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="780" y="28" fill="#38bdf8" font-size="11">Scenario B</text></a>
  <text x="870" y="28" fill="#94a3b8" font-size="11">RF=3 Scale</text>
  <rect x="30" y="74" width="280" height="340" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="45" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A Proportional 5-Node (tx/s)</text></a>
  <text x="45" y="114" fill="#94a3b8" font-size="10">Proportional growth: 3n to 5n scale</text>
  <rect x="340" y="74" width="280" height="340" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="355" y="98" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B 60% Coverage (5n dec/s)</text></a>
  <text x="355" y="114" fill="#94a3b8" font-size="10">Single-node 60% replica capacity</text>
  <rect x="650" y="74" width="280" height="340" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="665" y="98" fill="#38bdf8" font-size="13" font-weight="bold">5-Node Aggregate Capacity (dec/s)</text></a>
  <text x="665" y="114" fill="#94a3b8" font-size="10">Cluster-wide aggregate throughput</text>
${renderSvgPanels(exp)}
</svg>\n`;
}

function renderTables(exp) {
  const r = (arr, fn) => arrayJoin(arrayMap(arr, fn), '\n');
  const f = formatNum;
  const covArr = objectValues(exp.replicaCoverageByNodes);
  const mdCov = r(covArr, (c) => `| ${c.nodes} | ${c.rf} | ${f(c.replicaCoveragePct, 1)}% | ${f(c.absentPartitionPct, 1)}% |`);
  const htCov = r(covArr, (c) => `<tr><td>${c.nodes}</td><td>${c.rf}</td><td>${f(c.replicaCoveragePct, 1)}%</td><td>${f(c.absentPartitionPct, 1)}%</td></tr>`);

  const mList = [];
  const add = (name, key) => {
    for (const item of exp.scenarioAModes[key]) mList.push({...item, mName: name});
  };
  add('Fixed-Workload Scale-Out', 'fixed-workload-scaleout');
  add('Proportional-Growth Scale-Out', 'proportional-growth-scaleout');
  add('Hot-Contention Baseline', 'hot-contention-baseline');

  const mdA = r(mList, (t) =>
    `| ${t.mName} | ${t.label} | ${f(t.tx3Node, 2)} | ${f(t.p95Ms3Node, 1)} | ` +
    `${f(t.tx5Node, 2)} | ${f(t.p95Ms5Node, 1)} | ${t.scaleGainPct >= 0 ? '+' : ''}${f(t.scaleGainPct, 1)}% | ` +
    `${t.evidenceTier} |`);
  const htA = r(mList, (t) =>
    `<tr><td>${escapeXml(t.mName)}</td><td><strong>${escapeXml(t.label)}</strong></td>` +
    `<td>${f(t.tx3Node, 2)}</td><td>${f(t.p95Ms3Node, 1)}</td><td>${f(t.tx5Node, 2)}</td>` +
    `<td>${f(t.p95Ms5Node, 1)}</td><td>${t.scaleGainPct >= 0 ? '+' : ''}${f(t.scaleGainPct, 1)}%</td>` +
    `<td>${escapeXml(t.evidenceTier)}</td></tr>`);

  const mdB = r(exp.scenarioBCoverage, (t) =>
    `| ${t.label} | ${f(t.dec3Node100Pct, 1)} | ${f(t.p99Ms3Node, 1)} | ` +
    `${f(t.dec5Node60Pct, 1)} | ${f(t.p99Ms5Node, 1)} | ${t.wire5Node} | ` +
    `${f(t.aggregate5NodeDecPerSec, 1)} | ${t.evidenceTier} |`);
  const htB = r(exp.scenarioBCoverage, (t) =>
    `<tr><td><strong>${escapeXml(t.label)}</strong></td><td>${f(t.dec3Node100Pct, 1)}</td>` +
    `<td>${f(t.p99Ms3Node, 1)}</td><td>${f(t.dec5Node60Pct, 1)}</td><td>${f(t.p99Ms5Node, 1)}</td>` +
    `<td>${t.wire5Node}</td><td>${f(t.aggregate5NodeDecPerSec, 1)}</td>` +
    `<td>${escapeXml(t.evidenceTier)}</td></tr>`);

  return {mdCov, htCov, mdA, htA, mdB, htB};
}

export function renderScaleout3To5ComparisonMarkdown(matrix) {
  const exp = matrix?.scaleout3To5Rf3Experiment || buildScaleout3To5Rf3Experiment();
  const {mdCov, mdA, mdB} = renderTables(exp);
  return `# 3-to-5-Node RF=3 Scale-Out Matrix and Comparative Detail

Comparative evaluation of Lagrange and reference systems across 3-node and 5-node scale-out
topologies under RF=3 replication, examining partial replica-coverage dynamics and Scenario A
three-mode separation.

- Navigation: [Overview](README.md) | [Dashboard](index.html) | [Evolution](lagrange-metrics-evolution.md) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)

![3-to-5-Node RF=3 Scale-Out Progress](scaleout-3to5-node-rf3-progress.svg)

## Replica-coverage transition (RF=3 at 3 nodes 100% vs 5 nodes 60%)

In an RF=3 cluster with 3 nodes, every node holds a complete replica set of all partitions (100.0%
replica coverage, 0.0% absent partition rate). Scaling out to 5 nodes with RF=3 causes each node to
host only 3 of 5 partition replicas (60.0% replica coverage), leaving a 40.0% absent partition rate
where locally routed requests require network forwarding or distributed stage execution.

| Nodes | RF | Replica Coverage % | Absent Partition % |
| --- | --- | --- | --- |
${mdCov}

## Scenario A three-mode scale-out separation (fixed, proportional, hot-contention)

Evaluating scale-out across three distinct operational workload models reveals critical scaling differences:
- Fixed-Workload Scale-Out: Total offered load is kept constant while node count expands from 3 to 5 nodes. Additional Raft/consensus coordination slightly reduces net throughput (-2.2% to -5.7%).
- Proportional-Growth Scale-Out: Offered load expands proportionally with node capacity (+66.7%). Distributed engines scale effectively (+49.4% to +61.3% gain), with Lagrange 0.3.3 advancing to 3.84 tx/s (1490.0 ms p95).
- Hot-Contention Baseline: Single-partition or single-key serialization bottlenecks cannot scale by adding nodes (-5.1% to -8.5% scale gain, Patroni sync HA flat at 0.0%).

| Mode | Target | 3-Node (tx/s) | 3-Node p95 (ms) | 5-Node (tx/s) | 5-Node p95 (ms) | Scale Gain % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
${mdA}

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
yet total cluster aggregate capacity expands. Lagrange achieves 441.2 dec/s per node (18.1ms p99) and
720.4 dec/s cluster aggregate capacity with only 144 B/dec WAN transfer.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
${mdB}
`;
}

export function renderScaleout3To5ComparisonHtml(matrix) {
  const exp = matrix?.scaleout3To5Rf3Experiment || buildScaleout3To5Rf3Experiment();
  const {htCov, htA, htB} = renderTables(exp);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>3-to-5-Node RF=3 Scale-Out Matrix and Comparative Detail</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>3-to-5-Node RF=3 Scale-Out Matrix and Comparative Detail</h1>
    <div class="nav-bar">
      <a href="index.html">Dashboard</a>
      <a href="README.md">Overview</a>
      <a href="lagrange-metrics-evolution.md">Evolution</a>
      <a href="tidb-comparison-progress.md">TiDB</a>
      <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">Scenario A</a>
      <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">Scenario B</a>
    </div>
    <div class="chart-box">\n${renderScaleout3To5ComparisonSvg(matrix)}    </div>
    <div class="card">
      <h2>Replica-Coverage Transition (RF=3 at 3 Nodes 100% vs 5 Nodes 60%)</h2>
      <p>Transition from 3 nodes (100.0% coverage, 0.0% absent) to 5 nodes (60.0% coverage, 40.0% absent) under RF=3.</p>
      <table><thead><tr><th>Nodes</th><th>RF</th><th>Replica Coverage %</th><th>Absent Partition %</th></tr></thead>
        <tbody>\n${htCov}\n      </tbody></table>
    </div>
    <div class="card">
      <h2>Scenario A Three-Mode Scale-Out Separation (Fixed, Proportional, Hot-Contention)</h2>
      <p>Separation of fixed-workload, proportional-growth, and hot-contention baseline modes across 3-node and 5-node topologies.</p>
      <table><thead><tr><th>Mode</th><th>Target</th><th>3-Node (tx/s)</th><th>3-Node p95 (ms)</th><th>5-Node (tx/s)</th>
        <th>5-Node p95 (ms)</th><th>Scale Gain %</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htA}\n      </tbody></table>
    </div>
    <div class="card">
      <h2>Scenario B Partial Replica-Coverage Comparison at 5 Nodes (RF=3)</h2>
      <p>Partial replica-coverage comparison (60% at 5 nodes) with cluster aggregate throughput and WAN efficiency.</p>
      <table><thead><tr><th>Target</th><th>3-Node (100%) dec/s</th><th>3-Node p99 (ms)</th><th>5-Node (60%) dec/s</th>
        <th>5-Node p99 (ms)</th><th>5-Node WAN (B)</th><th>Aggregate dec/s</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htB}\n      </tbody></table>
    </div>
  </div>
</body>
</html>\n`;
}

export async function writeScaleout3To5ComparisonStaticWebArtifacts(options = {}) {
  const root = options.rootDir || process.cwd();
  const r = (p) => path.resolve(root, p);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const paths = {
    svgPath: options.svgPath || r(DEFAULT_SCALEOUT_3TO5_SVG_PATH),
    markdownPath: options.markdownPath || r(DEFAULT_SCALEOUT_3TO5_MD_PATH),
    htmlPath: options.htmlPath || r(DEFAULT_SCALEOUT_3TO5_HTML_PATH),
  };
  const write = async (fp, c) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, c, 'utf8');
  };
  await Promise.all([
    write(paths.svgPath, renderScaleout3To5ComparisonSvg(matrix)),
    write(paths.markdownPath, renderScaleout3To5ComparisonMarkdown(matrix)),
    write(paths.htmlPath, renderScaleout3To5ComparisonHtml(matrix)),
  ]);
  return Object.freeze({matrix, ...paths});
}
