const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);

export const DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH =
  'docs/benchmarks/scenario-setup-time-breakdown.svg';

function buildScenarioSetupAndTimeBreakdown() {
  return {
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt with phase latency decomposition',
    scenarioA: [
      ['PG 17 Single Primary + App', null, null, null, null, null, null, null],
      ['Citus 13 Sharded RF=3 + App', null, null, null, null, null, null, null],
      ['PG 17 Patroni Sync HA RF=3', null, null, null, null, null, null, null],
      ['TiDB + TiKV RF=3 (6-unit)', null, null, null, null, null, null, null],
      ['Lagrange 0.4.0 (5-Node RF=3 Fast-Path)', null, null, null, null, null, null, null],
      ['Lagrange 0.3.0 (3-Node Lab Baseline)', null, null, null, null, null, null, null],
    ],
    scenarioB: [
      ['Lagrange 0.4.0 (Colocated WASI ctx.call)', null, null, null, null, null, null, null],
      ['Apache Ignite 3 (JobTarget.colocated)', null, null, null, null, null, null, null],
      ['PG 17 Patroni + PL/pgSQL Function', null, null, null, null, null, null, null],
      ['Citus 13 (Colocated Dist Function)', null, null, null, null, null, null, null],
      ['YugabyteDB 2024.2 (YSQL Stored Proc)', null, null, null, null, null, null, null],
      ['TiDB + TiKV (App-Orchestrated SQL)', null, null, null, null, null, null, null],
    ],
    scenarioC: [
      ['Lagrange (In-Partition Rollup + Epoch-Lazy Opt)', null, null, null, null, null, null, null],
      ['Lagrange 0.4.0 (On-Read Raw Window Scan)', null, null, null, null, null, null, null],
      ['PG 17 Patroni + PL/pgSQL (On-Read Scan)', null, null, null, null, null, null, null],
      ['PG 17 + Valkey 8 (Sync Write-Through)', null, null, null, null, null, null, null],
      ['PG 17 + Valkey 8 (Async CDC Stream)', null, null, null, null, null, null, null],
    ],
  };
}

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function fNum(num, digits = 1) {
  if (num === null || num === undefined) return '[not measured]';
  return (typeof num === 'number' && Number.isFinite(num)) ? numberToFixed(num, digits) : '[not measured]';
}

function fBadge(num, digits = 1) {
  if (num === null || num === undefined) return '<span class="badge">not measured</span>';
  return (typeof num === 'number' && Number.isFinite(num)) ? numberToFixed(num, digits) : '<span class="badge">not measured</span>';
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
  const [lbl,,,,,,, tot] = row;
  const isMeasured = typeof tot === 'number' && Number.isFinite(tot);
  const totalText = isMeasured ? `${fNum(tot, 1)} ms` : '[not measured]';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>
  <text x="840" y="${y + 11}" fill="${isMeasured ? '#e2e8f0' : '#94a3b8'}" font-size="9" font-family="monospace">${totalText}</text>`;
}

function renderRowB(row, y) {
  const [lbl,,,,, p99, delta] = row;
  const isMeasured = typeof p99 === 'number' && Number.isFinite(p99);
  const moveTxt = (typeof delta === 'number' && delta > 0) ? ` (+${fNum(delta, 1)}ms mv)` : '';
  const totalText = isMeasured ? `${fNum(p99, 1)} ms${moveTxt}` : '[not measured]';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>
  <text x="840" y="${y + 11}" fill="${isMeasured ? '#e2e8f0' : '#94a3b8'}" font-size="9" font-family="monospace">${totalText}</text>`;
}

function renderRowC(row, y) {
  const [lbl,,,, d0,,, backfill] = row;
  const isMeasured = typeof d0 === 'number' && Number.isFinite(d0);
  const bfTxt = (typeof backfill === 'number' && backfill > 0) ? ` [${fNum(backfill, 0)}s backfill]` : '';
  const totalText = isMeasured ? `${fNum(d0, 1)} d/s${bfTxt}` : '[not measured]';
  return `  <text x="365" y="${y + 11}" fill="#cbd5e1" font-size="9" font-family="monospace">${lbl}</text>
  <rect x="590" y="${y + 3}" width="240" height="10" fill="#334155" rx="2"/>
  <text x="840" y="${y + 11}" fill="${isMeasured ? '#e2e8f0' : '#94a3b8'}" font-size="9" font-family="monospace">${totalText}</text>`;
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
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Measurements await admitted GCP/lab execution receipts</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Decompositions: real product process wall-clock observation required</text>
${rows}`;
}

function renderPanelB(data, y) {
  const rows = arrayJoin(arrayMap(data, (r, i) => renderRowB(r, y + 54 + i * 27)), '\n');
  const b1 = renderFlowBox(35, y + 40, 85, 36, 'Event Ingress', 'Parallel stream');
  const a1 = renderArrow(130, y + 62);
  const b2 = renderFlowBox(140, y + 40, 95, 36, 'WASI Engine', 'Colocated eval');
  const a2 = renderArrow(245, y + 62);
  const b3 = renderFlowBox(255, y + 40, 95, 36, 'Stage Forward', 'WAN continuation');
  return `  <rect x="20" y="${y}" width="920" height="222" fill="#1e293b" rx="6" stroke="#334155"/>
  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="35" y="${y + 24}" fill="#38bdf8" font-size="13" font-weight="bold">Scenario B: Distributed Risk Decision &amp; Partition Movement (p99 Latency)</text></a>
  <text x="500" y="${y + 24}" fill="#94a3b8" font-size="9">Legend: ingress (slate) | reducer (green) | WAN (amber) | decode (pink)</text>
${b1}\n${a1}\n${b2}\n${a2}\n${b3}
  <text x="35" y="${y + 98}" fill="#94a3b8" font-size="9">Topology: 3-island WAN (0.2..30ms RTT), RF=3</text>
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Measurements await admitted GCP/lab execution receipts</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Movement: verified on live wire with physical placement</text>
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
  <text x="35" y="${y + 114}" fill="#cbd5e1" font-size="9">Measurements await admitted GCP/lab execution receipts</text>
  <text x="35" y="${y + 130}" fill="#94a3b8" font-size="9">Rule Change: measured live under real workload execution</text>
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
    `| ${r[0]} | ${fNum(r[1])} | ${fNum(r[2])} | ${fNum(r[3])} | ${fNum(r[4])} | ${fNum(r[5])} | ${fNum(r[6])} | ${fNum(r[7])} |`), '\n');
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
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fBadge(r[1])}</td><td>${fBadge(r[2])}</td><td>${fBadge(r[3])}</td><td>${fBadge(r[4])}</td><td>${fBadge(r[5])}</td><td>${fBadge(r[6])}</td><td><strong>${fBadge(r[7])}</strong></td></tr>`), '\n');
  return `<table><thead><tr><th>Target</th><th>Wire</th><th>Parse</th><th>Lock Wait</th><th>2PC Prepare</th><th>Quorum</th><th>Apply</th><th>Total p95</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

function renderTableBHtml(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fBadge(r[1])}</td><td>${fBadge(r[2])}</td><td>${fBadge(r[3])}</td><td>${fBadge(r[4])}</td><td><strong>${fBadge(r[5])}</strong></td><td>${fBadge(r[6])}</td><td>${fBadge(r[7])}</td></tr>`), '\n');
  return `<table><thead><tr><th>Target</th><th>Ingress</th><th>Reducer</th><th>WAN Wait</th><th>Decode</th><th>Steady p99</th><th>Move Delta</th><th>WAN Bytes</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

function renderTableCHtml(data) {
  const rows = arrayJoin(arrayMap(data, (r) =>
    `<tr><td><strong>${escapeXml(r[0])}</strong></td><td>${fBadge(r[1])}</td><td>${fBadge(r[2])}</td><td>${fBadge(r[3])}</td><td><strong>${fBadge(r[4])}</strong></td><td>${fBadge(r[5])}</td><td>${fBadge(r[6])}</td><td>${fBadge(r[7])}</td></tr>`), '\n');
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

- **Phase decomposition admission policy**: All comparative phase decompositions and breakdown timings await admitted GCP/lab execution receipts. Analytical formulas and synthetic delay additions are rejected under canonical evidence admission rules.
- **Verification across architectures**: Physical placement and real network measurement on live clusters will derive genuine latency attribution across client transport, query planning, lock contention, consensus quorum, and cross-partition dispatch.
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
    <li><strong>Phase decomposition admission policy</strong>: All comparative phase decompositions and breakdown timings await admitted GCP/lab execution receipts. Analytical formulas and synthetic delay additions are rejected under canonical evidence admission rules.</li>
    <li><strong>Verification across architectures</strong>: Physical placement and real network measurement on live clusters will derive genuine latency attribution across client transport, query planning, lock contention, consensus quorum, and cross-partition dispatch.</li>
  </ul>
</div>`;
}
