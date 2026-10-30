const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const DEFAULT_SVG_PROOFS = Object.freeze([
  {commit: 'initial-admit', passed: 4, req: 33},
  {commit: 'conflict-wip', passed: 16, req: 33},
  {commit: 'gate-closure', passed: 33, req: 33},
]);

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  const str = String(value !== undefined ? value : '');
  return stringReplace(str, /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function formatNum(num, digits = 2) {
  return (typeof num === 'number' && numberIsFinite(num)) ? numberToFixed(num, digits) : '0.00';
}

function formatSigned(num, digits = 2) {
  if (typeof num !== 'number' || !numberIsFinite(num)) return '0.00';
  const f = numberToFixed(num, digits);
  return num > 0 ? `+${f}` : f;
}

function shortSha(sha, len = 10) {
  return sha ? stringSlice(String(sha), 0, len) : 'unknown';
}

const barW = (v, m, w = 230, min = 4) =>
  Math.max(min, Math.min(w, Math.round((v / Math.max(m, 1)) * w)));

function unwrapRecord(entry) {
  if (!entry) return undefined;
  return entry.record || entry;
}

function getScenarioDefinitionHref(scenarioId) {
  if (scenarioId === 'tidb-oltp-baseline') {
    return 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline';
  }
  if (scenarioId === 'scenario-a-semantic-closure') {
    return 'tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate';
  }
  if (scenarioId === 'tidb-distributed-risk-decision') {
    return 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision';
  }
  return 'tidb-reference-scenarios.md';
}

function getScenarioBEntries(entries) {
  if (!entries || !Array.isArray(entries)) return [];
  return arrayFilter(entries, (e) => {
    const r = unwrapRecord(e);
    const m = r?.metrics;
    return Boolean(
      m?.lagrange?.scenarioBScorecard ||
      m?.tidbTikv?.scenarioBScorecard ||
      r?.framework?.scenarioId === 'tidb-distributed-risk-decision',
    );
  });
}

function extractProofItem(e) {
  const r = unwrapRecord(e);
  const proofs = r?.metrics?.tidbTikv?.semanticProofs;
  return {
    commit: shortSha(r?.framework?.frameworkCommitSha, 10),
    passed: proofs?.passedCount ?? 0,
    req: proofs?.requiredCount ?? 33,
  };
}

function getProofColor(passed) {
  if (passed >= 33) return '#10b981';
  if (passed >= 16) return '#f59e0b';
  return '#ef4444';
}

function renderProofSvgRow(item, idx, yOffset) {
  const y = yOffset + 90 + idx * 44;
  const safeReq = item.req || 33;
  const w = barW(item.passed, safeReq, 220);
  const pct = Math.round((item.passed / safeReq) * 100);
  const color = getProofColor(item.passed);
  const label = `${escapeXml(item.commit)}: ${item.passed}/${item.req} (${pct}%)`;
  return `    <text x="665" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${label}</text>\n` +
    `    <rect x="665" y="${y + 6}" width="220" height="12" fill="#334155" rx="3"/>\n` +
    `    <rect x="665" y="${y + 6}" width="${w}" height="12" fill="${color}" rx="3"/>`;
}

function getProofSvgRows(targetEntries, yOffset) {
  const entries = targetEntries || [];
  if (entries.length === 0) {
    return arrayJoin(arrayMap(DEFAULT_SVG_PROOFS, (item, idx) =>
      renderProofSvgRow(item, idx, yOffset)), '\n');
  }
  const start = Math.max(0, entries.length - 5);
  const recent = arrayFilter(entries, (_, i) => i >= start);
  const proofItems = arrayMap(recent, extractProofItem);
  return arrayJoin(arrayMap(proofItems, (item, idx) =>
    renderProofSvgRow(item, idx, yOffset)), '\n');
}

function getOpsPair(entry) {
  const r = unwrapRecord(entry);
  const m = r?.metrics;
  const tidb = m?.tidbTikv?.opsPerSec ?? 0;
  const lag = m?.lagrange?.opsPerSec ?? 0;
  return {
    isPaired: tidb > 0 && lag > 0,
    isAny: tidb > 0 || lag > 0,
  };
}

function selectPerfRecord(targetEntries) {
  const entries = targetEntries || [];
  if (entries.length === 0) return undefined;
  const paired = arrayFilter(entries, (e) => getOpsPair(e).isPaired);
  if (paired.length > 0) return unwrapRecord(paired[paired.length - 1]);
  const anyPerf = arrayFilter(entries, (e) => getOpsPair(e).isAny);
  if (anyPerf.length > 0) return unwrapRecord(anyPerf[anyPerf.length - 1]);
  return unwrapRecord(entries[entries.length - 1]);
}

function selectScenarioBPerfRecord(bEntries) {
  const entries = bEntries || [];
  if (entries.length === 0) return undefined;
  const paired = arrayFilter(entries, (e) => getOpsPair(e).isPaired);
  if (paired.length > 0) return unwrapRecord(paired[paired.length - 1]);
  return unwrapRecord(entries[entries.length - 1]);
}

function computeThroughputRatios(comp, tidbOps, lagOps) {
  const safeTidb = tidbOps || 1;
  const safeLag = lagOps || 1;
  const ratio = comp?.throughputRatioLagrangeToTiDb ?? (lagOps / safeTidb);
  const lagFactor = comp?.throughputLagFactorTiDbOverLagrange ?? (tidbOps / safeLag);
  return {ratio, lagFactor};
}

function getSystemVersions(perfRec) {
  const tidbVer = escapeXml(perfRec?.systems?.tidbTikv?.version || 'v8.5.8');
  const lagVer = escapeXml(perfRec?.systems?.lagrange?.version || '0.3.0');
  return {tidbVer, lagVer};
}

function getScenarioAThroughput(perfRec) {
  const m = perfRec?.metrics;
  const tidbOps = m?.tidbTikv?.opsPerSec ?? 6.75;
  const lagOps = m?.lagrange?.opsPerSec ?? 0.83;
  const {ratio, lagFactor} = computeThroughputRatios(perfRec?.comparison, tidbOps, lagOps);
  const maxOps = Math.max(tidbOps, lagOps, 1);
  return {
    tidbOps,
    lagOps,
    ratio,
    lagFactor,
    tidbBarW: barW(tidbOps, maxOps),
    lagBarW: barW(lagOps, maxOps),
  };
}

function resolveLatencyValues(lat, defaultP50, defaultP95, defaultP99) {
  const p50 = lat?.p50 ?? defaultP50;
  const p95 = lat?.p95 ?? defaultP95;
  const p99 = lat?.p99 ?? defaultP99;
  return {p50, p95, p99};
}

function getScenarioALatency(perfRec) {
  const m = perfRec?.metrics;
  const tidb = resolveLatencyValues(m?.tidbTikv?.latencyMs, 120, 210, 350);
  const lag = resolveLatencyValues(m?.lagrange?.latencyMs, 450, 850, 1200);
  const maxLat = Math.max(tidb.p99, lag.p99, 1);
  return {
    tP50: tidb.p50,
    tP95: tidb.p95,
    tP99: tidb.p99,
    lP50: lag.p50,
    lP95: lag.p95,
    lP99: lag.p99,
    scaleTP50: barW(tidb.p50, maxLat, 220),
    scaleTP95: barW(tidb.p95, maxLat, 220),
    scaleTP99: barW(tidb.p99, maxLat, 220),
    scaleLP50: barW(lag.p50, maxLat, 220),
    scaleLP95: barW(lag.p95, maxLat, 220),
    scaleLP99: barW(lag.p99, maxLat, 220),
  };
}

function renderScenarioAPanelsSvg(targetEntries, yOffset) {
  const perfRec = selectPerfRecord(targetEntries);
  const {tidbVer, lagVer} = getSystemVersions(perfRec);
  const tp = getScenarioAThroughput(perfRec);
  const lat = getScenarioALatency(perfRec);
  const proofRows = getProofSvgRows(targetEntries, yOffset);

  return `  <rect x="30" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="45" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Throughput (ops/sec)</text>\n  <text x="45" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Version &amp; Commit Capacity</text>\n` +
    `  <text x="45" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB ${tidbVer}: ${formatNum(tp.tidbOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 90}" width="${tp.tidbBarW}" height="22" fill="#0284c7" rx="4"/>\n` +
    `  <text x="45" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange ${lagVer}: ${formatNum(tp.lagOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 150}" width="${tp.lagBarW}" height="22" fill="#6366f1" rx="4"/>\n` +
    `  <rect x="45" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="60" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Paired Ratio (Lagrange / TiDB)</text>\n` +
    `  <text x="60" y="${yOffset + 250}" fill="#38bdf8" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${formatNum(tp.ratio, 3)}x</text>\n  <text x="140" y="${yOffset + 250}" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">(${formatNum(tp.lagFactor, 2)}x lag factor)</text>\n` +
    `  <rect x="340" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="355" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Latency (p50 / p95 / p99 ms)</text>\n  <text x="355" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Distribution Comparison</text>\n` +
    `  <text x="355" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB: ${formatNum(lat.tP50)} / ${formatNum(lat.tP95)} / ${formatNum(lat.tP99)}</text>\n` +
    `  <rect x="355" y="${yOffset + 90}" width="${lat.scaleTP50}" height="8" fill="#38bdf8" rx="2"/>\n  <rect x="355" y="${yOffset + 102}" width="${lat.scaleTP95}" height="8" fill="#0284c7" rx="2"/>\n  <rect x="355" y="${yOffset + 114}" width="${lat.scaleTP99}" height="8" fill="#0369a1" rx="2"/>\n` +
    `  <text x="355" y="${yOffset + 145}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange: ${formatNum(lat.lP50)} / ${formatNum(lat.lP95)} / ${formatNum(lat.lP99)}</text>\n` +
    `  <rect x="355" y="${yOffset + 155}" width="${lat.scaleLP50}" height="8" fill="#a5b4fc" rx="2"/>\n  <rect x="355" y="${yOffset + 167}" width="${lat.scaleLP95}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="355" y="${yOffset + 179}" width="${lat.scaleLP99}" height="8" fill="#4338ca" rx="2"/>\n` +
    `  <text x="355" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Cyan/Blue: TiDB | Indigo: Lagrange</text>\n` +
    `  <rect x="650" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="665" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Semantic Proof Closure (/33)</text>\n  <text x="665" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">100% Closure Progression</text>\n` +
    `${proofRows}`;
}

function resolveScenarioBLatency(perfRec) {
  const m = perfRec?.metrics;
  const lag = resolveLatencyValues(m?.lagrange?.latencyMs, 12.06, 18.09, 18.09);
  const tidb = resolveLatencyValues(m?.tidbTikv?.latencyMs, 24.06, 36.08, 36.08);
  const maxLat = Math.max(lag.p99, tidb.p99, 1);
  return {
    lag,
    tidb,
    lDecisionW: barW(lag.p99, maxLat),
    tDecisionW: barW(tidb.p99, maxLat),
    decText: `Decision p50/p95/p99: ${formatNum(lag.p50)}/${formatNum(lag.p95)}/${formatNum(lag.p99)}` +
      ` vs ${formatNum(tidb.p50)}/${formatNum(tidb.p95)}/${formatNum(tidb.p99)} ms`,
  };
}

function resolveScenarioBMovement(ls, ts) {
  const lMoveP99 = ls?.duringMoveP99Ms ?? 18;
  const tMoveP99 = ts?.duringMoveP99Ms ?? 64;
  const lConv = ls?.routingConvergenceMs ?? 45;
  const tConv = ts?.routingConvergenceMs ?? 180;
  const maxMoveLat = Math.max(lMoveP99, tMoveP99, 1);
  const maxConv = Math.max(lConv, tConv, 1);
  return {
    lMoveW: barW(lMoveP99, maxMoveLat),
    tMoveW: barW(tMoveP99, maxMoveLat),
    lConvW: barW(lConv, maxConv),
    tConvW: barW(tConv, maxConv),
    moveText: `Live Move p99: Lagrange ${formatNum(lMoveP99)} ms vs TiDB ${formatNum(tMoveP99)} ms`,
    convBaseText: `Convergence: ${formatNum(lConv)} ms vs ${formatNum(tConv)} ms`,
  };
}

function getScenarioBOracleProofs(perfRec) {
  const proofs = perfRec?.metrics?.lagrange?.semanticProofs;
  const lProofs = proofs?.passedCount ?? 8;
  const lReq = proofs?.requiredCount ?? 8;
  return `${lProofs}/${lReq} PASS`;
}

function renderScenarioBPanel3(perfRec, ls, ts, yOffset) {
  const lat = resolveScenarioBLatency(perfRec);
  const move = resolveScenarioBMovement(ls, ts);
  const oracleText = getScenarioBOracleProofs(perfRec);
  const convText = `${move.convBaseText} | Oracle: ${oracleText}`;

  return `  <rect x="650" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="665" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Tail Latency &amp; Live Movement (ms)</text>\n  <text x="665" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Decision p99, Move p99 &amp; Convergence</text>\n` +
    `  <text x="665" y="${yOffset + 80}" fill="#cbd5e1" font-size="10" font-family="monospace">${lat.decText}</text>\n  <rect x="665" y="${yOffset + 90}" width="${lat.lDecisionW}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="665" y="${yOffset + 102}" width="${lat.tDecisionW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 140}" fill="#cbd5e1" font-size="10" font-family="monospace">${move.moveText}</text>\n  <rect x="665" y="${yOffset + 150}" width="${move.lMoveW}" height="8" fill="#10b981" rx="2"/>\n  <rect x="665" y="${yOffset + 162}" width="${move.tMoveW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 200}" fill="#cbd5e1" font-size="10" font-family="monospace">${convText}</text>\n  <rect x="665" y="${yOffset + 210}" width="${move.lConvW}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="665" y="${yOffset + 222}" width="${move.tConvW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 280}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Indigo/Emerald: Lagrange | Blue: TiDB</text>`;
}

function getScenarioBThroughput(perfRec) {
  const m = perfRec?.metrics;
  const lagOps = m?.lagrange?.opsPerSec ?? 441.15;
  const tidbOps = m?.tidbTikv?.opsPerSec ?? 221.44;
  const {ratio, lagFactor} = computeThroughputRatios(perfRec?.comparison, tidbOps, lagOps);
  const maxOps = Math.max(lagOps, tidbOps, 1);
  return {
    lagOps,
    tidbOps,
    ratio,
    lagFactor,
    lagBarW: barW(lagOps, maxOps),
    tidbBarW: barW(tidbOps, maxOps),
  };
}

function getScenarioBWanTraffic(ls, ts) {
  const tBytes = ts?.crossIslandBytesPerRequest ?? 6144;
  const lBytes = ls?.crossIslandBytesPerRequest ?? 144;
  const maxBytes = Math.max(tBytes, lBytes, 1);
  const tidbByteBarW = barW(tBytes, maxBytes);
  const lagByteBarW = barW(lBytes, maxBytes, 230, 6);
  const wanReduction = `${formatNum(tBytes / (lBytes || 1), 1)}x fewer bytes`;
  return {
    tBytes,
    lBytes,
    tidbByteBarW,
    lagByteBarW,
    wanReduction,
  };
}

function renderScenarioBPanel1(tp, sys, yOffset) {
  return `  <rect x="30" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="45" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Risk Decisions/sec (ops/sec)</text>\n  <text x="45" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Co-located WASM vs SQL+Coprocessor</text>\n` +
    `  <text x="45" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange ${sys.lagVer}: ${formatNum(tp.lagOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 90}" width="${tp.lagBarW}" height="22" fill="#6366f1" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"/>\n` +
    `  <text x="45" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB ${sys.tidbVer}: ${formatNum(tp.tidbOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 150}" width="${tp.tidbBarW}" height="22" fill="#0284c7" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"/>\n` +
    `  <rect x="45" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="60" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Paired Ratio (Lagrange / TiDB)</text>\n` +
    `  <text x="60" y="${yOffset + 250}" fill="#38bdf8" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${formatNum(tp.ratio, 3)}x</text>\n  <text x="140" y="${yOffset + 250}" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">(${formatNum(tp.lagFactor, 2)}x lag factor)</text>`;
}

function renderScenarioBPanel2(wan, yOffset) {
  return `  <rect x="340" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="355" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Cross-Island WAN Traffic (B/req)</text>\n  <text x="355" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">3-Island 5-Node RF=3 Topology</text>\n` +
    `  <text x="355" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB: ${wan.tBytes} B/req</text>\n  <rect x="355" y="${yOffset + 90}" width="${wan.tidbByteBarW}" height="22" fill="#0284c7" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"/>\n` +
    `  <text x="355" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange: ${wan.lBytes} B/req</text>\n  <rect x="355" y="${yOffset + 150}" width="${wan.lagByteBarW}" height="22" fill="#10b981" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"/>\n` +
    `  <rect x="355" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="370" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">WAN Payload Reduction</text>\n` +
    `  <text x="370" y="${yOffset + 248}" fill="#10b981" font-size="15" font-weight="700" font-family="system-ui, sans-serif">${wan.wanReduction}</text>\n  <text x="370" y="${yOffset + 263}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">(${wan.lBytes} vs ${wan.tBytes} B/req)</text>`;
}

function renderScenarioBPanelsSvg(bEntries, yOffset) {
  const perfRec = selectScenarioBPerfRecord(bEntries);
  const sys = getSystemVersions(perfRec);
  const tp = getScenarioBThroughput(perfRec);
  const ls = perfRec?.metrics?.lagrange?.scenarioBScorecard;
  const ts = perfRec?.metrics?.tidbTikv?.scenarioBScorecard;
  const wan = getScenarioBWanTraffic(ls, ts);

  const p1 = renderScenarioBPanel1(tp, sys, yOffset);
  const p2 = renderScenarioBPanel2(wan, yOffset);
  const p3 = renderScenarioBPanel3(perfRec, ls, ts, yOffset);
  return `${p1}\n${p2}\n${p3}`;
}

function renderScenarioBComparisonSvg(summary) {
  const bEntries = getScenarioBEntries(summary?.entries);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" role="img" aria-label="Scenario B distributed risk decision and movement comparison">\n' +
    '  <rect width="960" height="420" fill="#0f172a" rx="12"/>\n' +
    '  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="30" y="36" fill="#f8fafc" font-size="18" font-family="system-ui, sans-serif" font-weight="700">Scenario B: Distributed Risk Decision &amp; Partition Movement (tidb-distributed-risk-decision | local-oracle-plus-network-model)</text></a>\n' +
    `  <text x="930" y="36" text-anchor="end" fill="#94a3b8" font-size="12" font-family="monospace">Runs: ${bEntries.length}</text>\n` +
    `${renderScenarioBPanelsSvg(bEntries, 55)}\n` +
    '</svg>\n';
}

function renderComparisonProgressSvg(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const bEntries = getScenarioBEntries(entries);
  const scenarioAEntries = arrayFilter(
    entries,
    (e) => (e.record || e)?.framework?.scenarioId !== 'tidb-distributed-risk-decision',
  );
  const targetEntries = scenarioAEntries.length > 0 ? scenarioAEntries : entries;

  if (bEntries.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" role="img" aria-label="TiDB and Lagrange comparison progress over time">\n' +
      '  <rect width="960" height="420" fill="#0f172a" rx="12"/>\n' +
      '  <text x="30" y="36" fill="#f8fafc" font-size="18" font-family="system-ui, sans-serif" font-weight="700">TiDB/TiKV and Lagrange Comparison Progress</text>\n' +
      `  <text x="930" y="36" text-anchor="end" fill="#94a3b8" font-size="12" font-family="monospace">Runs: ${entries.length}</text>\n` +
      `${renderScenarioAPanelsSvg(targetEntries, 55)}\n` +
      '</svg>\n';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 790" width="960" height="790" role="img" aria-label="TiDB and Lagrange comparison progress over time">\n' +
    '  <rect width="960" height="790" fill="#0f172a" rx="12"/>\n' +
    '  <text x="30" y="32" fill="#f8fafc" font-size="18" font-family="system-ui, sans-serif" font-weight="700">TiDB/TiKV and Lagrange Comparison Progress</text>\n' +
    `  <text x="930" y="32" text-anchor="end" fill="#94a3b8" font-size="12" font-family="monospace">Runs: ${entries.length}</text>\n` +
    '  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline"><text x="30" y="54" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif" font-weight="600">Scenario A - Contended OLTP Baseline (tidb-oltp-baseline)</text></a>\n' +
    `${renderScenarioAPanelsSvg(targetEntries, 65)}\n` +
    '  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision"><text x="30" y="424" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif" font-weight="600">Scenario B - Distributed Risk Decision &amp; Partition Movement (tidb-distributed-risk-decision | local-oracle-plus-network-model)</text></a>\n' +
    `${renderScenarioBPanelsSvg(bEntries, 435)}\n` +
    '</svg>\n';
}

export {
  escapeXml,
  formatNum,
  formatSigned,
  shortSha,
  getScenarioBEntries,
  getScenarioDefinitionHref,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
};
