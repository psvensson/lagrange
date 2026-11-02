import {buildScenarioSetupAndTimeBreakdown} from './scaleout-series-experiments.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);

export const DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH =
  'docs/benchmarks/scenario-setup-time-breakdown.svg';

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function fNum(num, digits = 1) {
  return (typeof num === 'number' && Number.isFinite(num)) ? numberToFixed(num, digits) : '0.0';
}

function renderFlowBox(x, y, w, h, title, sub) {
  return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0f172a" rx="4" stroke="#475569"/>
  <text x="${x + w / 2}" y="${y + 15}" fill="#f8fafc" font-size="10" font-weight="bold" text-anchor="middle">${title}</text>
  <text x="${x + w / 2}" y="${y + 27}" fill="#94a3b8" font-size="8" text-anchor="middle">${sub}</text>`;
}

function renderArrow(x, y) {
  return `  <text x="${x}" y="${y}" fill="#38bdf8" font-size="12" text-anchor="middle">-&gt;</text>`;
}

function renderRowA(row, y, maxTot) {
  const [lbl, wire, parse, lock, prep, fsync, apply, tot] = row;
  const sc = 240 / Math.max(10, maxTot);
  let cx = 590;
  const seg = (val, col) => {
    const w = Math.max(val > 0 ? 1 : 0, Math.round(val * sc));
    const r = w > 0 ? `<rect x="${cx}" y="${y + 3}" width="${w}" height="10" fill="${col}"/>` : '';
    cx += w;
    return r;
  };
  const b1 = seg(wire, '#64748b');
  const b2 = seg(parse, '#94a3b8');
  const b3 = seg(lock, '#f59e0b');
  const b4 = seg(prep, '#ec4899');
  const b5 = seg(fsync, '#0284c7');
  const b6 = seg(apply, '#10b981');
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>
  ${b1}${b2}${b3}${b4}${b5}${b6}
  <text x="840" y="${y + 11}" fill="#e2e8f0" font-size="9" font-family="monospace">${fNum(tot, 1)} ms</text>`;
}

function renderRowB(row, y, maxP99) {
  const [lbl, ing, red, wan, dec, p99, delta] = row;
  const sc = 240 / Math.max(10, maxP99);
  let cx = 590;
  const seg = (val, col) => {
    const w = Math.max(val > 0 ? 1 : 0, Math.round(val * sc));
    const r = w > 0 ? `<rect x="${cx}" y="${y + 3}" width="${w}" height="10" fill="${col}"/>` : '';
    cx += w;
    return r;
  };
  const b1 = seg(ing, '#64748b');
  const b2 = seg(red, '#10b981');
  const b3 = seg(wan, '#f59e0b');
  const b4 = seg(dec, '#ec4899');
  const moveTxt = delta > 0 ? ` (+${fNum(delta, 1)}ms mv)` : '';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>
  ${b1}${b2}${b3}${b4}
  <text x="840" y="${y + 11}" fill="#e2e8f0" font-size="9" font-family="monospace">${fNum(p99, 1)} ms${moveTxt}</text>`;
}

function renderRowC(row, y, maxD0) {
  const [lbl,,,, d0,,, backfill] = row;
  const w = Math.min(240, Math.round((d0 / Math.max(100, maxD0)) * 240));
  const col = d0 > 400 ? '#38bdf8' : (d0 > 0 ? '#10b981' : '#f59e0b');
  const fill = w > 0 ? `<rect x="590" y="${y + 3}" width="${w}" height="10" fill="${col}" rx="2"/>` : '';
  const bfTxt = backfill > 0 ? ` [${fNum(backfill, 0)}s backfill]` : ' [0s backfill]';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>${fill}
  <text x="840" y="${y + 11}" fill="#e2e8f0" font-size="9" font-family="monospace">${fNum(d0, 1)} d/s${bfTxt}</text>`;
}

function renderPanelA(data, y) {
  const maxTot = Math.max(10, ...arrayMap(data, (r) => Number(r[7] || 0)));
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowA(r, y + 54 + i * 27, maxTot)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'Client App', 'Separate Host');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'Coordinator', 'Parse/Plan');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, '2PC Quorum', 'Raft + Storage');
  return `  <rect x="20" y="${y}" width="920" height="222" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: Contended OLTP Baseline (2PC &amp; Quorum Latency)</text></a>
  <text x="460" y="${y + 24}" fill="#94a3b8" font-size="9">Legend: lock wait (amber) | 2PC prep (pink) | raft quorum (blue) | apply (green)</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">Topology: 3-5 Physical Hosts, RF=3 over LAN</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Contention: lock &amp; quorum round-trips dominate p95</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Fast-Path: single-round Raft commit avoids 2PC</text>
${rows}`;
}

function renderPanelB(data, y) {
  const maxP99 = Math.max(10, ...arrayMap(data, (r) => Number(r[5] || 0)));
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowB(r, y + 54 + i * 27, maxP99)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'Event Ingress', 'Separate Host');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'WASI Engine', 'Colocated eval');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, 'Stage Forward', 'LAN Wire Hop');
  return `  <rect x="20" y="${y}" width="920" height="222" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Distributed Risk Decision &amp; Partition Movement (p99 Latency)</text></a>
  <text x="500" y="${y + 24}" fill="#94a3b8" font-size="9">Legend: ingress (slate) | reducer (green) | WAN (amber) | decode (pink)</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">Topology: Multi-Host Physical Cluster, RF=3</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Execution: forward-only compact stage continuation</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Movement: zero-stall epoch-forwarded handoff</text>
${rows}`;
}

function renderPanelC(data, y) {
  const maxD0 = Math.max(100, ...arrayMap(data, (r) => Number(r[4] || 0)));
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowC(r, y + 54 + i * 32, maxD0)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'CDC Events', 'Live ingestion');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'Delta Rollup', 'Micro-buckets');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, '0ms Decision', 'Freshness SLA');
  return `  <rect x="20" y="${y}" width="920" height="238" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario C: Streaming Feature Risk Decision &amp; Freshness Tradeoff</text></a>
  <text x="540" y="${y + 24}" fill="#94a3b8" font-size="9">Bar: fresh 0ms decisions/s | label: backfill downtime</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">SLA: 0ms read-your-writes vs 100-1000ms stale cache</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">In-Partition: O(1) local rollup accumulator read</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Rule Change: 0.0s backfill downtime vs cache rebuild</text>
${rows}`;
}

export function renderScenarioSetupBreakdownSvg(matrix) {
  const data = matrix?.scenarioSetupBreakdown || buildScenarioSetupAndTimeBreakdown();
  const pA = renderPanelA(data.scenarioA, 60);
  const pB = renderPanelB(data.scenarioB, 294);
  const pC = renderPanelC(data.scenarioC, 528);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 780" width="960" height="780">
  <rect width="960" height="780" fill="#0f172a" rx="8"/>
  <text x="30" y="28" fill="#f8fafc" font-size="16" font-weight="bold">Scenario Setup Topology &amp; Phase Latency Breakdown</text>
  <text x="30" y="46" fill="#94a3b8" font-size="11">Where time is spent across physical hosts: client wire, parse/plan, lock wait, 2PC prepare, quorum fsync, and stage forward</text>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="630" y="28" fill="#38bdf8" font-size="11">Scenario A</text></a>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="720" y="28" fill="#38bdf8" font-size="11">Scenario B</text></a>
  <a href="tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision"><text x="810" y="28" fill="#38bdf8" font-size="11">Scenario C</text></a>
${pA}
${pB}
${pC}
</svg>\n`;
}

function renderTableAMd(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `| ${r[0]} | ${fNum(r[1])} | ${fNum(r[2])} | ${fNum(r[3])} | ${fNum(r[4])} | ${fNum(r[5])} | ${fNum(r[6])} | ${fNum(r[7])} |`), '\n');
  return `| Target | Wire (ms) | Parse/Plan (ms) | Lock Wait (ms) | 2PC Prepare (ms) | Quorum Fsync (ms) | Apply (ms) | Total p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}`;
}

function renderTableBMd(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `| ${r[0]} | ${fNum(r[1])} | ${fNum(r[2])} | ${fNum(r[3])} | ${fNum(r[4])} | ${fNum(r[5])} | +${fNum(r[6])} | ${r[7]} |`), '\n');
  return `| Target | Ingress (ms) | Reducer (ms) | WAN Wait (ms) | Wire Decode (ms) | Steady p99 (ms) | Move Delta (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}`;
}

function renderTableCMd(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `| ${r[0]} | ${fNum(r[1])} | ${fNum(r[2])} | ${fNum(r[3])} | ${fNum(r[4])} | ${fNum(r[5])} | ${fNum(r[6])} | ${fNum(r[7])} |`), '\n');
  return `| Target | Ingest Quorum (ms) | Prop Lag (ms) | Compute (ms) | 0ms Fresh (dec/s) | 5x Scale (dec/s) | Backfill (s) | Downtime (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}`;
}

function renderTableAHtml(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fNum(r[1])}</td><td>${fNum(r[2])}</td><td>${fNum(r[3])}</td><td>${fNum(r[4])}</td><td>${fNum(r[5])}</td><td>${fNum(r[6])}</td><td><strong>${fNum(r[7])}</strong></td></tr>`), '\n');
  return `<table><thead><tr><th>Target</th><th>Wire</th><th>Parse</th><th>Lock Wait</th><th>2PC Prepare</th><th>Quorum</th><th>Apply</th><th>Total p95</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

function renderTableBHtml(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fNum(r[1])}</td><td>${fNum(r[2])}</td><td>${fNum(r[3])}</td><td>${fNum(r[4])}</td><td><strong>${fNum(r[5])}</strong></td><td>+${fNum(r[6])}</td><td>${r[7]}</td></tr>`), '\n');
  return `<table><thead><tr><th>Target</th><th>Ingress</th><th>Reducer</th><th>WAN Wait</th><th>Decode</th><th>Steady p99</th><th>Move Delta</th><th>WAN Bytes</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

function renderTableCHtml(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fNum(r[1])}</td><td>${fNum(r[2])}</td><td>${fNum(r[3])}</td><td><strong>${fNum(r[4])}</strong></td><td>${fNum(r[5])}</td><td>${fNum(r[6])}</td><td>${fNum(r[7])}</td></tr>`), '\n');
  return `<table><thead><tr><th>Target</th><th>Ingest Quorum</th><th>Prop Lag</th><th>Compute</th><th>0ms Fresh (dec/s)</th><th>5x Scale</th><th>Backfill (s)</th><th>Downtime (s)</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

export function renderScenarioSetupBreakdownMarkdownSection(matrix) {
  const d = matrix?.scenarioSetupBreakdown || buildScenarioSetupAndTimeBreakdown();
  const topC = d.scenarioC[0] || ['Lagrange', 0, 0, 0, 0, 0, 0, 0];
  const secC = d.scenarioC[1] || ['Lagrange 3-Node', 0, 0, 0, 0, 0, 0, 0];
  return `## Scenario setup diagrams and where time is spent (Scenario A, B, and C latency breakdown)

![Scenario A, B, and C Setup Topology and Phase Latency Breakdown](scenario-setup-time-breakdown.svg)

### Scenario A Contended OLTP Latency Breakdown (p95 ms)

${renderTableAMd(d.scenarioA)}

### Scenario B Distributed Risk Decision Latency Breakdown (p99 ms)

${renderTableBMd(d.scenarioB)}

### Scenario C Streaming Feature Evaluation & Freshness Breakdown

${renderTableCMd(d.scenarioC)}

### Latency and Architecture Breakdown Analysis

- **Why rule-change backfill cost separates colocated rollups from external cache pipelines**: In \`v0.4.0\`, Lagrange and \`PG 17 + PL/pgSQL\` achieve \`0.0 s\` rule-change backfill by evaluating features directly on committed partition state (\`${fNum(secC[4])} dec/s\` on 3-node RF=3), while \`PG + Valkey\` incurs \`185-240 s\` network backfill downtime when recomputing cached feature keys.
- **How Lagrange scales Scenario C (\`${fNum(topC[4])} dec/s\` at \`1x\`, \`${fNum(topC[5])} dec/s\` at \`5x\`, \`0.0 s\` decision downtime)**: (a) In-partition Raft-apply delta rollups (\`${fNum(topC[3])} ms\` local accumulator read at \`0 ms\` SLA), (b) decomposable micro-bucket sketches (\`0.0 s\` backfill for window/weight changes), and (c) \`feature_epoch\`-watermarked lazy on-read cutover with \`0.0 s\` decision downtime and \`0 B\` network backfill.
`;
}

export function renderScenarioSetupBreakdownHtmlSection(matrix) {
  const d = matrix?.scenarioSetupBreakdown || buildScenarioSetupAndTimeBreakdown();
  const topC = d.scenarioC[0] || ['Lagrange', 0, 0, 0, 0, 0, 0, 0];
  const secC = d.scenarioC[1] || ['Lagrange 3-Node', 0, 0, 0, 0, 0, 0, 0];
  return `<div class="card">
  <h2>Scenario Setup Diagrams and Where Time Is Spent (Scenario A, B, and C Latency Breakdown)</h2>
  <div class="chart-box"><img src="scenario-setup-time-breakdown.svg" alt="Scenario A, B, and C Setup Topology and Phase Latency Breakdown"/></div>
  <h3>Scenario A Contended OLTP Latency Breakdown (p95 ms)</h3>
${renderTableAHtml(d.scenarioA)}
  <h3>Scenario B Distributed Risk Decision Latency Breakdown (p99 ms)</h3>
${renderTableBHtml(d.scenarioB)}
  <h3>Scenario C Streaming Feature Evaluation &amp; Freshness Breakdown</h3>
${renderTableCHtml(d.scenarioC)}
  <h3>Latency and Architecture Breakdown Analysis</h3>
  <ul>
    <li><strong>Why rule-change backfill cost separates colocated rollups from external cache pipelines</strong>: In <code>v0.4.0</code>, Lagrange and <code>PG 17 + PL/pgSQL</code> achieve <code>0.0 s</code> rule-change backfill by evaluating features directly on committed partition state (<code>${fNum(secC[4])} dec/s</code> on 3-node RF=3), while <code>PG + Valkey</code> incurs <code>185-240 s</code> network backfill downtime when recomputing cached feature keys.</li>
    <li><strong>How Lagrange scales Scenario C (<code>${fNum(topC[4])} dec/s</code> at <code>1x</code>, <code>${fNum(topC[5])} dec/s</code> at <code>5x</code>, <code>0.0 s</code> decision downtime)</strong>: (a) In-partition Raft-apply delta rollups (<code>${fNum(topC[3])} ms</code> local accumulator read at <code>0 ms</code> SLA), (b) decomposable micro-bucket sketches (<code>0.0 s</code> backfill for window/weight changes), and (c) <code>feature_epoch</code>-watermarked lazy on-read cutover with <code>0.0 s</code> decision downtime and <code>0 B</code> network backfill.</li>
  </ul>
</div>`;
}
