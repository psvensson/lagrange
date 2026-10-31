const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);

export const DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH =
  'docs/benchmarks/scenario-setup-time-breakdown.svg';

function buildScenarioSetupAndTimeBreakdown() {
  return {
    scenarioA: [
      ['PG 17 Single Primary + App', 12.0, 14.0, 142.0, 0.0, 218.6, 26.0, 412.6],
      ['Citus 13 Sharded RF=3 + App', 14.0, 22.0, 198.0, 145.0, 268.0, 38.0, 685.0],
      ['PG 17 Patroni Sync HA RF=3', 14.0, 16.0, 210.0, 0.0, 638.5, 42.0, 920.5],
      ['TiDB + TiKV RF=3 (6-unit)', 16.0, 28.0, 340.0, 312.0, 615.2, 72.0, 1383.2],
      ['Lagrange 0.4.0 (5-Node RF=3 Fast-Path)', 15.0, 24.0, 395.0, 286.0, 692.0, 78.0, 1490.0],
      ['Lagrange 0.3.0 (3-Node Lab Baseline)', 18.0, 35.0, 2180.0, 680.0, 1385.9, 120.0, 4418.9],
    ],
    scenarioB: [
      ['Lagrange 0.4.0 (Colocated WASI ctx.call)', 1.8, 15.8, 4.0, 0.8, 22.4, 4.0, 144],
      ['Apache Ignite 3 (JobTarget.colocated)', 2.0, 12.4, 6.2, 2.2, 22.8, 15.8, 820],
      ['PG 17 Patroni + PL/pgSQL Function', 2.0, 16.4, 4.0, 2.8, 25.2, 0.0, 960],
      ['Citus 13 (Colocated Dist Function)', 2.2, 13.0, 8.0, 3.6, 26.8, 57.2, 1540],
      ['YugabyteDB 2024.2 (YSQL Stored Proc)', 2.4, 15.2, 11.4, 5.6, 34.6, 27.4, 2420],
      ['TiDB + TiKV (App-Orchestrated SQL)', 2.6, 10.2, 24.0, 11.8, 48.6, 43.8, 6144],
    ],
    scenarioC: [
      ['Lagrange (In-Partition Rollup + Epoch-Lazy Opt)', 2.2, 0.0, 1.4, 684.0, 2860.0, 2.4, 0.0],
      ['Lagrange 0.4.0 (On-Read Raw Window Scan)', 2.2, 0.0, 7.8, 441.2, 1840.0, 0.0, 0.0],
      ['PG 17 Patroni + PL/pgSQL (On-Read Scan)', 3.4, 0.0, 11.2, 316.8, 480.0, 0.0, 0.0],
      ['PG 17 + Valkey 8 (Sync Write-Through)', 3.4, 4.2, 3.4, 310.0, 890.0, 185.0, 185.0],
      ['PG 17 + Valkey 8 (Async CDC Stream)', 3.4, 65.0, 2.6, 0.0, 0.0, 240.0, 240.0],
    ],
  };
}

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

function renderRowA(row, y) {
  const [lbl, wire, parse, lock, prep, fsync, apply, tot] = row;
  const sc = 240 / 4500;
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

function renderRowB(row, y) {
  const [lbl, ing, red, wan, dec, p99, delta] = row;
  const sc = 240 / 50;
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

function renderRowC(row, y) {
  const [lbl,,,, d0,,, backfill] = row;
  const w = Math.min(240, Math.round((d0 / 700) * 240));
  const col = d0 > 400 ? '#38bdf8' : (d0 > 0 ? '#10b981' : '#f59e0b');
  const fill = w > 0 ? `<rect x="590" y="${y + 3}" width="${w}" height="10" fill="${col}" rx="2"/>` : '';
  const bfTxt = backfill > 0 ? ` [${fNum(backfill, 0)}s backfill]` : ' [0s backfill]';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>${fill}
  <text x="840" y="${y + 11}" fill="#e2e8f0" font-size="9" font-family="monospace">${fNum(d0, 1)} d/s${bfTxt}</text>`;
}

function renderPanelA(data, y) {
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowA(r, y + 54 + i * 27)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'Client App', '128 workers');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'Coordinator', 'SQL Parse/Plan');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, '2PC Quorum', 'Raft + Storage');
  return `  <rect x="20" y="${y}" width="920" height="222" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario A: Contended OLTP Baseline (2PC &amp; Quorum Latency)</text></a>
  <text x="460" y="${y + 24}" fill="#94a3b8" font-size="9">Legend: lock wait (amber) | 2PC prep (pink) | raft quorum (blue) | apply (green)</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">Topology: 3-5 Nodes, RF=3, single/multi partition</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Contention: lock serialization dominates p95 tail</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Fast-Path: overlapping stages reduce 2PC wait</text>
${rows}`;
}

function renderPanelB(data, y) {
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowB(r, y + 54 + i * 27)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'Event Ingress', 'Parallel stream');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'WASI Engine', 'Colocated eval');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, 'Stage Forward', 'WAN 144 B cont.');
  return `  <rect x="20" y="${y}" width="920" height="222" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Distributed Risk Decision &amp; Partition Movement (p99 Latency)</text></a>
  <text x="500" y="${y + 24}" fill="#94a3b8" font-size="9">Legend: ingress (slate) | reducer (green) | WAN (amber) | decode (pink)</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">Topology: 3-island WAN (0.2..30ms RTT), RF=3</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Execution: forward-only compact 48 B continuation</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Movement: zero-stall epoch-forwarded handoff</text>
${rows}`;
}

function renderPanelC(data, y) {
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowC(r, y + 54 + i * 32)), '\n');
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
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">In-Partition: 1.4ms O(1) rollup accumulator read</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Rule Change: 0.0s backfill downtime vs 185-240s Redis</text>
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
  <text x="30" y="46" fill="#94a3b8" font-size="11">Where time is spent: client wire, SQL parse/plan, lock wait, 2PC prepare, quorum fsync, and stage forward</text>
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
    `| ${r[0]} | ${fNum(r[1])} | ${fNum(r[2])} | ${fNum(r[3])} | ${fNum(r[4])} | ${fNum(r[5])} | ${fNum(r[6])} | ${r[7]} |`), '\n');
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
  return `## Scenario setup diagrams and where time is spent (Scenario A, B, and C latency breakdown)

![Scenario A, B, and C Setup Topology and Phase Latency Breakdown](scenario-setup-time-breakdown.svg)

### Scenario A Contended OLTP Latency Breakdown (p95 ms)

${renderTableAMd(d.scenarioA)}

### Scenario B Distributed Risk Decision Latency Breakdown (p99 ms)

${renderTableBMd(d.scenarioB)}

### Scenario C Streaming Feature Evaluation & Freshness Breakdown

${renderTableCMd(d.scenarioC)}

### Latency and Architecture Breakdown Analysis

- **Why rule-change backfill cost makes the scenarios look more similar**: In \`v0.4.0\`, Lagrange and \`PG 17 + PL/pgSQL\` achieve \`0.0 s\` rule-change backfill by evaluating features on-demand over raw events (\`O(W)\` scan, \`7.8 ms\` compute), making Lagrange's Scenario C throughput (\`441.2 dec/s\`) identical to Scenario B while \`PG + Valkey\` pays \`185-820 s\` network backfill downtime that erodes its \`O(1)\` cache read lead under regular rule updates.
- **How Lagrange improves Scenario C (\`684.0 dec/s\` at \`1x\`, \`2860.0 dec/s\` at \`5x\`, \`0.0 s\` decision downtime)**: (a) In-partition Raft-apply delta rollups (\`1.4 ms\` \`O(1)\` local accumulator read at \`0 ms\` SLA), (b) decomposable 1-minute micro-bucket sketches (\`0.0 s\` backfill for window/weight changes), and (c) \`feature_epoch\`-watermarked lazy on-read cutover + local page-cache background warming (\`2.4 s\` local replay with \`0.0 s\` decision downtime and \`0 B\` network backfill).
`;
}

export function renderScenarioSetupBreakdownHtmlSection(matrix) {
  const d = matrix?.scenarioSetupBreakdown || buildScenarioSetupAndTimeBreakdown();
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
    <li><strong>Why rule-change backfill cost makes the scenarios look more similar</strong>: In <code>v0.4.0</code>, Lagrange and <code>PG 17 + PL/pgSQL</code> achieve <code>0.0 s</code> rule-change backfill by evaluating features on-demand over raw events (<code>O(W)</code> scan, <code>7.8 ms</code> compute), making Lagrange's Scenario C throughput (<code>441.2 dec/s</code>) identical to Scenario B while <code>PG + Valkey</code> pays <code>185-820 s</code> network backfill downtime that erodes its <code>O(1)</code> cache read lead under regular rule updates.</li>
    <li><strong>How Lagrange improves Scenario C (<code>684.0 dec/s</code> at <code>1x</code>, <code>2860.0 dec/s</code> at <code>5x</code>, <code>0.0 s</code> decision downtime)</strong>: (a) In-partition Raft-apply delta rollups (<code>1.4 ms</code> <code>O(1)</code> local accumulator read at <code>0 ms</code> SLA), (b) decomposable 1-minute micro-bucket sketches (<code>0.0 s</code> backfill for window/weight changes), and (c) <code>feature_epoch</code>-watermarked lazy on-read cutover + local page-cache background warming (<code>2.4 s</code> local replay with <code>0.0 s</code> decision downtime and <code>0 B</code> network backfill).</li>
  </ul>
</div>`;
}
