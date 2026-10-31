import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {escapeXml, formatNum} from './comparative-landing-svg-renderer.js';
import {
  buildMultiSystemComparativeMatrix,
  buildScenarioBRttWorkingSetExperiment,
} from './comparative-matrix-runner.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringTrim = Function.call.bind(String.prototype.trim);

export const DEFAULT_RTT_WORKING_SET_SVG_PATH =
  'docs/benchmarks/scenario-b-rtt-working-set-crossover.svg';
export const DEFAULT_RTT_WORKING_SET_MD_PATH =
  'docs/benchmarks/scenario-b-rtt-working-set-crossover.md';
export const DEFAULT_RTT_WORKING_SET_HTML_PATH =
  'docs/benchmarks/scenario-b-rtt-working-set-crossover.html';

const TARGET_COLORS = Object.freeze({
  'lagrange': '#38bdf8',
  'ignite3-colocated-compute': '#ef4444',
  'citus-distributed-function': '#ec4899',
  'pg-plpgsql-sync-ha-rf3': '#f59e0b',
  'yugabytedb-stored-proc': '#8b5cf6',
  'tidb-tikv': '#0284c7',
});

const TARGET_LABELS = Object.freeze({
  'lagrange': ['Lagrange', 'Native WASI (RF=3)'],
  'ignite3-colocated-compute': ['Apache Ignite 3', 'Colocated (RF=3)'],
  'citus-distributed-function': ['Citus 13', 'Dist Function (RF=3)'],
  'pg-plpgsql-sync-ha-rf3': ['PG 17 Patroni', 'PL/pgSQL Sync HA (RF=3)'],
  'yugabytedb-stored-proc': ['YugabyteDB 2024.2', 'Stored Proc (RF=3)'],
  'tidb-tikv': ['TiDB + TiKV', 'Distributed SQL (RF=3)'],
});

const HTML_PAGE_STYLE = `<style>:root{--bg:#0f172a;--card-bg:#1e293b;--text:#f8fafc;--muted:#94a3b8;--border:#334155;--accent:#38bdf8}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px}
.container{max-width:1100px;margin:0 auto}h1{font-size:24px;color:#fff;margin:0 0 8px 0}
.nav-bar{margin:12px 0 20px 0;font-size:13px}.nav-bar a{color:var(--accent);text-decoration:none;margin-right:12px}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:24px}
.card h2{font-size:16px;color:var(--accent);margin:0 0 12px 0}.card p,.card li{font-size:13px;line-height:1.6;color:#cbd5e1}
table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}
th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;overflow-wrap:anywhere;word-break:break-word}
th{color:var(--muted);font-weight:600}.chart-box{margin-bottom:24px;display:flex;justify-content:center}</style>`;

function getExperiment(matrix) {
  return matrix?.scenarioBRttWorkingSetExperiment ||
    buildScenarioBRttWorkingSetExperiment();
}

function getSeriesPt(series, rttMs) {
  return arrayFind(series, (s) => s.rttMs === rttMs) || {};
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
  const r1 = arrayJoin(arrayMap(exp.sequentialRttSeries, (t, i) => {
    const s02 = getSeriesPt(t.rttSeries, 0.2);
    const s10 = getSeriesPt(t.rttSeries, 10.0);
    const s30 = getSeriesPt(t.rttSeries, 30.0);
    const w = (typeof s10.decisionsPerSec === 'number') ?
      Math.max(4, Math.min(250, Math.round((s10.decisionsPerSec / 200) * 250))) : 0;
    const sub = `30ms: ${f(s30.decisionsPerSec, 0)} dec/s | ${t.oneWayHopsSequential} sequential hops`;
    const label = (typeof s10.decisionsPerSec === 'number') ?
      `10ms: ${f(s10.decisionsPerSec, 0)} dec/s (0.2ms: ${f(s02.decisionsPerSec, 0)})` : '[not measured]';
    return renderSvgItem(45, 132 + i * 70, TARGET_LABELS[t.targetId] || [t.label, ''],
      label, w, TARGET_COLORS[t.targetId] || '#94a3b8', sub);
  }), '\n');
  const r2 = arrayJoin(arrayMap(exp.sequentialRttSeries, (t, i) => {
    const s10 = getSeriesPt(t.rttSeries, 10.0);
    const s30 = getSeriesPt(t.rttSeries, 30.0);
    const w = (typeof s10.p99Ms === 'number') ?
      Math.max(4, Math.min(250, Math.round((s10.p99Ms / 160) * 250))) : 0;
    const sub = `Local: ${f(t.localOnly02msP99Ms, 1)}ms | 30ms: ${f(s30.p99Ms, 1)}ms`;
    const label = (typeof s10.p99Ms === 'number') ?
      `${f(s10.p99Ms, 1)}ms p99 @ 10ms RTT` : '[not measured]';
    return renderSvgItem(355, 132 + i * 70, TARGET_LABELS[t.targetId] || [t.label, ''],
      label, w, TARGET_COLORS[t.targetId] || '#94a3b8', sub);
  }), '\n');
  const r3 = arrayJoin(arrayMap(exp.workingSetComparison, (w, i) => {
    const barW = (typeof w.heavyDecPerSec === 'number') ?
      Math.max(4, Math.min(250, Math.round((w.heavyDecPerSec / 400) * 250))) : 0;
    const wan = w.heavyWanBytes !== null ? `${w.heavyWanBytes} B/req` : '[not measured]';
    const sub = `WAN: ${wan} | p99: ${f(w.heavyP99Ms, 1)}ms`;
    const drop = w.throughputDropPct !== null ? `(${f(w.throughputDropPct, 1)}%)` : '';
    const label = (typeof w.heavyDecPerSec === 'number') ?
      stringTrim(`${f(w.heavyDecPerSec, 1)} dec/s ${drop}`) : '[not measured]';
    return renderSvgItem(665, 132 + i * 70, TARGET_LABELS[w.targetId] || [w.label, ''],
      label, barW, TARGET_COLORS[w.targetId] || '#94a3b8', sub);
  }), '\n');
  return `${r1}\n${r2}\n${r3}`;
}

export function renderScenarioBRttWorkingSetSvg(matrix) {
  const exp = getExperiment(matrix);
  const title = 'Scenario B Network RTT Crossover &amp; Working-Set Growth';
  const sub1 = 'Sequential graph shape across 0.2..30ms RTT &amp; heavy 2048-event working set';
  const sub2 = 'Legend: dashed border = modeled-topology-oracle (simulated cluster wire)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560" width="960" height="560">
  <rect width="960" height="560" fill="#0f172a" rx="8"/>
  <text x="30" y="28" fill="#f8fafc" font-size="16" font-weight="bold">${title}</text>
  <text x="30" y="44" fill="#94a3b8" font-size="11">${sub1}</text>
  <text x="30" y="58" fill="#64748b" font-size="10">${sub2}</text>
  <a href="README.md"><text x="590" y="28" fill="#38bdf8" font-size="11">Overview</text></a>
  <a href="lagrange-metrics-evolution.md"><text x="660" y="28" fill="#38bdf8" font-size="11">Evolution</text></a>
  <a href="scaleout-3to5-node-rf3-progress.md"><text x="735" y="28" fill="#38bdf8" font-size="11">3-to-5 Scale</text></a>
  <a href="partition-granularity-sweep-progress.md"><text x="825" y="28" fill="#38bdf8" font-size="11">Partition Sweep</text></a>
  <rect x="30" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="45" y="98" fill="#38bdf8" font-size="12" font-weight="bold">Sequential Shape Across RTT 0.2..30ms (dec/s)</text>
  <text x="45" y="114" fill="#94a3b8" font-size="10">Throughput degradation from LAN to WAN</text>
  <rect x="340" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="355" y="98" fill="#38bdf8" font-size="12" font-weight="bold">Cross-AZ (10ms RTT) Sequential p99 Latency (ms)</text>
  <text x="355" y="114" fill="#94a3b8" font-size="10">Sequential stage latency penalty</text>
  <rect x="650" y="74" width="280" height="466" fill="#1e293b" rx="6" stroke="#334155"/>
  <text x="665" y="98" fill="#38bdf8" font-size="12" font-weight="bold">Heavy-Correlation Working-Set Throughput &amp; Wire Bytes</text>
  <text x="665" y="114" fill="#94a3b8" font-size="10">2048-event working set scaling drop</text>
${renderSvgPanels(exp)}
</svg>\n`;
}

function renderTables(exp) {
  const f = formatNum;
  const mdRtt = arrayJoin(arrayMap(exp.sequentialRttSeries, (t) => {
    const s02 = getSeriesPt(t.rttSeries, 0.2);
    const s20 = getSeriesPt(t.rttSeries, 2.0);
    const s10 = getSeriesPt(t.rttSeries, 10.0);
    const s30 = getSeriesPt(t.rttSeries, 30.0);
    const tier = s10.evidenceTier || 'not measured';
    return `| ${t.label} | ${t.oneWayHopsSequential} | ${f(t.localOnly02msDecPerSec, 1)} | ` +
      `${f(s02.decisionsPerSec, 1)} | ${f(s20.decisionsPerSec, 1)} | ${f(s10.decisionsPerSec, 1)} | ${f(s30.decisionsPerSec, 1)} | ${tier} |`;
  }), '\n');
  const htRtt = arrayJoin(arrayMap(exp.sequentialRttSeries, (t) => {
    const s02 = getSeriesPt(t.rttSeries, 0.2);
    const s20 = getSeriesPt(t.rttSeries, 2.0);
    const s10 = getSeriesPt(t.rttSeries, 10.0);
    const s30 = getSeriesPt(t.rttSeries, 30.0);
    const tier = s10.evidenceTier || 'not measured';
    const loc = t.localOnly02msDecPerSec !== null ? f(t.localOnly02msDecPerSec, 1) : '<span class="badge">not measured</span>';
    const v02 = s02.decisionsPerSec !== null ? f(s02.decisionsPerSec, 1) : '<span class="badge">not measured</span>';
    const v20 = s20.decisionsPerSec !== null ? f(s20.decisionsPerSec, 1) : '<span class="badge">not measured</span>';
    const v10 = s10.decisionsPerSec !== null ? f(s10.decisionsPerSec, 1) : '<span class="badge">not measured</span>';
    const v30 = s30.decisionsPerSec !== null ? f(s30.decisionsPerSec, 1) : '<span class="badge">not measured</span>';
    return `<tr><td><strong>${escapeXml(t.label)}</strong></td><td>${t.oneWayHopsSequential}</td>` +
      `<td>${loc}</td><td>${v02}</td>` +
      `<td>${v20}</td><td>${v10}</td>` +
      `<td>${v30}</td><td>${escapeXml(tier)}</td></tr>`;
  }), '\n');

  const mdWs = arrayJoin(arrayMap(exp.workingSetComparison, (w) => {
    const tier = w.evidenceTier || 'not measured';
    const modWan = w.moderateWanBytes !== null ? `${w.moderateWanBytes}` : '[not measured]';
    const hvyWan = w.heavyWanBytes !== null ? `${w.heavyWanBytes}` : '[not measured]';
    const drop = w.throughputDropPct !== null ? `${f(w.throughputDropPct, 1)}%` : '[not measured]';
    return `| ${w.label} | ${f(w.moderateDecPerSec, 1)} | ${f(w.moderateP99Ms, 1)} | ${modWan} | ` +
      `${f(w.heavyDecPerSec, 1)} | ${f(w.heavyP99Ms, 1)} | ${hvyWan} | ${drop} | ${tier} |`;
  }), '\n');
  const htWs = arrayJoin(arrayMap(exp.workingSetComparison, (w) => {
    const tier = w.evidenceTier || 'not measured';
    const modDec = w.moderateDecPerSec !== null ? f(w.moderateDecPerSec, 1) : '<span class="badge">not measured</span>';
    const modP99 = w.moderateP99Ms !== null ? f(w.moderateP99Ms, 1) : '<span class="badge">not measured</span>';
    const modWan = w.moderateWanBytes !== null ? `${w.moderateWanBytes}` : '<span class="badge">not measured</span>';
    const hvyDec = w.heavyDecPerSec !== null ? f(w.heavyDecPerSec, 1) : '<span class="badge">not measured</span>';
    const hvyP99 = w.heavyP99Ms !== null ? f(w.heavyP99Ms, 1) : '<span class="badge">not measured</span>';
    const hvyWan = w.heavyWanBytes !== null ? `${w.heavyWanBytes}` : '<span class="badge">not measured</span>';
    const drop = w.throughputDropPct !== null ? `${f(w.throughputDropPct, 1)}%` : '<span class="badge">not measured</span>';
    return `<tr><td><strong>${escapeXml(w.label)}</strong></td><td>${modDec}</td>` +
      `<td>${modP99}</td><td>${modWan}</td><td>${hvyDec}</td>` +
      `<td>${hvyP99}</td><td>${hvyWan}</td><td>${drop}</td>` +
      `<td>${escapeXml(tier)}</td></tr>`;
  }), '\n');
  return {mdRtt, htRtt, mdWs, htWs};
}

export function renderScenarioBRttWorkingSetMarkdown(matrix) {
  const exp = getExperiment(matrix);
  const {mdRtt, mdWs} = renderTables(exp);
  const nav = '- Navigation: [Comparative Benchmarks Landing Page](README.md) | ' +
    '[Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | ' +
    '[3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | ' +
    '[5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md)';
  const descRtt = 'Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN ' +
    'highlights the architectural overhead of multi-hop sequential orchestration across distributed nodes. ' +
    'Simulated network delay additions have been withdrawn in favor of live-wire client adapters; ' +
    'comparative RTT crossover curves require admitted GCP or lab execution receipts.';
  const descWs = 'Increasing historical state from a moderate 64-event history to a heavy-correlation ' +
    '2048-event working set evaluates the wire efficiency and serialization overhead of candidate architectures. ' +
    'Empirical throughput and byte transmission measurements require original GCP or lab execution receipts ' +
    'under verifiable host placement and network accounting.';
  return `# Scenario B Network RTT Crossover and Working-Set Growth

Comparative evaluation of network round-trip time scaling and working-set expansion under Scenario B distributed risk decisions.

${nav}

![Scenario B RTT Crossover and Working-Set Growth](scenario-b-rtt-working-set-crossover.svg)

## Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)

${descRtt}

| Target | Hops | Local (0.2ms) | 0.2 ms | 2.0 ms | 10.0 ms | 30.0 ms | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
${mdRtt}

## Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)

${descWs}

| Target | Moderate (dec/s) | Moderate p99 (ms) | Moderate WAN | Heavy (dec/s) | Heavy p99 (ms) | Heavy WAN | Drop % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${mdWs}
`;
}

export function renderScenarioBRttWorkingSetHtml(matrix) {
  const exp = getExperiment(matrix);
  const {htRtt, htWs} = renderTables(exp);
  const descRtt = 'Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN ' +
    'highlights the architectural overhead of multi-hop sequential orchestration across distributed nodes. ' +
    'Simulated network delay additions have been withdrawn in favor of live-wire client adapters; ' +
    'comparative RTT crossover curves require admitted GCP or lab execution receipts.';
  const descWs = 'Increasing historical state from a moderate 64-event history to a heavy-correlation ' +
    '2048-event working set evaluates the wire efficiency and serialization overhead of candidate architectures. ' +
    'Empirical throughput and byte transmission measurements require original GCP or lab execution receipts ' +
    'under verifiable host placement and network accounting.';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Scenario B Network RTT Crossover and Working-Set Growth</title>
  ${HTML_PAGE_STYLE}
</head>
<body>
  <div class="container">
    <h1>Scenario B Network RTT Crossover and Working-Set Growth</h1>
    <div class="nav-bar">
      <a href="index.html">Comparative Benchmarks Landing Page</a>
      <a href="lagrange-metrics-evolution.html">Lagrange Metrics Evolution Over Time</a>
      <a href="scaleout-3to5-node-rf3-progress.html">3-to-5-Node RF=3 Scale-Out Comparison</a>
      <a href="partition-granularity-sweep-progress.html">5-Node RF=3 Partition Granularity Sweep</a>
    </div>
    <div class="chart-box">\n${renderScenarioBRttWorkingSetSvg(matrix)}    </div>
    <div class="card">
      <h2>Network RTT Crossover Across Scenario B Graph Shapes (0.2 ms LAN to 30 ms WAN)</h2>
      <p>${descRtt}</p>
      <table><thead><tr><th>Target</th><th>Hops</th><th>Local (0.2ms)</th><th>0.2 ms</th><th>2.0 ms</th><th>10.0 ms</th><th>30.0 ms</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htRtt}\n      </tbody></table>
    </div>
    <div class="card">
      <h2>Working-Set Growth (Moderate 64-Event vs Heavy-Correlation 2048-Event Histories)</h2>
      <p>${descWs}</p>
      <table><thead><tr><th>Target</th><th>Moderate (dec/s)</th><th>Moderate p99 (ms)</th><th>Moderate WAN</th><th>Heavy (dec/s)</th><th>Heavy p99 (ms)</th><th>Heavy WAN</th><th>Drop %</th><th>Evidence Tier</th></tr></thead>
        <tbody>\n${htWs}\n      </tbody></table>
    </div>
  </div>
</body>
</html>\n`;
}

export async function writeScenarioBRttWorkingSetStaticWebArtifacts(options = {}) {
  const root = options.rootDir || process.cwd();
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  const paths = {
    svgPath: options.svgPath || path.resolve(root, DEFAULT_RTT_WORKING_SET_SVG_PATH),
    markdownPath: options.markdownPath || path.resolve(root, DEFAULT_RTT_WORKING_SET_MD_PATH),
    htmlPath: options.htmlPath || path.resolve(root, DEFAULT_RTT_WORKING_SET_HTML_PATH),
  };
  const write = async (fp, c) => {
    await mkdir(path.dirname(fp), {recursive: true});
    await writeFile(fp, c, 'utf8');
  };
  await Promise.all([
    write(paths.svgPath, renderScenarioBRttWorkingSetSvg(matrix)),
    write(paths.markdownPath, renderScenarioBRttWorkingSetMarkdown(matrix)),
    write(paths.htmlPath, renderScenarioBRttWorkingSetHtml(matrix)),
  ]);
  return Object.freeze({matrix, ...paths});
}
