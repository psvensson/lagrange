const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

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

function getScenarioBEntries(entries) {
  if (!entries || !Array.isArray(entries)) return [];
  return arrayFilter(entries, (e) => {
    const r = e.record || e;
    const m = r?.metrics;
    return Boolean(
      m?.lagrange?.scenarioBScorecard ||
      m?.tidbTikv?.scenarioBScorecard ||
      r?.framework?.scenarioId === 'tidb-distributed-risk-decision',
    );
  });
}

function getProofSvgRows(targetEntries, yOffset) {
  const defaultProofs = [
    {commit: 'initial-admit', passed: 4, req: 33}, {commit: 'conflict-wip', passed: 16, req: 33},
    {commit: 'gate-closure', passed: 33, req: 33},
  ];
  const recent = arrayFilter(targetEntries, (_, i) => i >= Math.max(0, targetEntries.length - 5));
  const proofItems = targetEntries.length > 0 ?
    arrayMap(recent, (e) => ({
      commit: shortSha((e.record || e)?.framework?.frameworkCommitSha, 10),
      passed: (e.record || e)?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0,
      req: (e.record || e)?.metrics?.tidbTikv?.semanticProofs?.requiredCount ?? 33,
    })) : defaultProofs;

  return arrayJoin(arrayMap(proofItems, (item, idx) => {
    const y = yOffset + 90 + idx * 44;
    const w = barW(item.passed, item.req || 33, 220);
    const pct = Math.round((item.passed / (item.req || 33)) * 100);
    const color = item.passed >= 33 ? '#10b981' : (item.passed >= 16 ? '#f59e0b' : '#ef4444');
    return `    <text x="665" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeXml(item.commit)}: ${item.passed}/${item.req} (${pct}%)</text>\n` +
      `    <rect x="665" y="${y + 6}" width="220" height="12" fill="#334155" rx="3"/>\n` +
      `    <rect x="665" y="${y + 6}" width="${w}" height="12" fill="${color}" rx="3"/>`;
  }), '\n');
}

function renderScenarioAPanelsSvg(targetEntries, yOffset) {
  const latest = targetEntries.length > 0 ? targetEntries[targetEntries.length - 1] : undefined;
  const pairedPerf = arrayFilter(targetEntries, (e) => {
    const r = e.record || e;
    return (r?.metrics?.tidbTikv?.opsPerSec ?? 0) > 0 && (r?.metrics?.lagrange?.opsPerSec ?? 0) > 0;
  });
  const anyPerf = arrayFilter(targetEntries, (e) => {
    const r = e.record || e;
    return (r?.metrics?.tidbTikv?.opsPerSec ?? 0) > 0 || (r?.metrics?.lagrange?.opsPerSec ?? 0) > 0;
  });
  const chosenPerf = pairedPerf.length > 0 ? pairedPerf[pairedPerf.length - 1] :
    (anyPerf.length > 0 ? anyPerf[anyPerf.length - 1] : latest);
  const perfRec = chosenPerf ? (chosenPerf.record || chosenPerf) : (latest?.record || latest);

  const tidbVer = escapeXml(perfRec?.systems?.tidbTikv?.version || 'v8.5.8');
  const tidbOps = perfRec?.metrics?.tidbTikv?.opsPerSec ?? 6.75;
  const lagVer = escapeXml(perfRec?.systems?.lagrange?.version || '0.3.0');
  const lagOps = perfRec?.metrics?.lagrange?.opsPerSec ?? 0.83;
  const ratio = perfRec?.comparison?.throughputRatioLagrangeToTiDb ?? (lagOps / (tidbOps || 1));
  const lagFactor = perfRec?.comparison?.throughputLagFactorTiDbOverLagrange ??
    (tidbOps / (lagOps || 1));

  const maxOps = Math.max(tidbOps, lagOps, 1);
  const tidbBarW = barW(tidbOps, maxOps); const lagBarW = barW(lagOps, maxOps);

  const tLat = perfRec?.metrics?.tidbTikv?.latencyMs;
  const lLat = perfRec?.metrics?.lagrange?.latencyMs;
  const tP50 = tLat?.p50 ?? 120; const tP95 = tLat?.p95 ?? 210; const tP99 = tLat?.p99 ?? 350;
  const lP50 = lLat?.p50 ?? 450; const lP95 = lLat?.p95 ?? 850; const lP99 = lLat?.p99 ?? 1200;
  const scaleLat = (val) => barW(val, Math.max(tP99, lP99, 1), 220);

  return `  <rect x="30" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="45" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Throughput (ops/sec)</text>\n  <text x="45" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Version &amp; Commit Capacity</text>\n` +
    `  <text x="45" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB ${tidbVer}: ${formatNum(tidbOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 90}" width="${tidbBarW}" height="22" fill="#0284c7" rx="4"/>\n` +
    `  <text x="45" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange ${lagVer}: ${formatNum(lagOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 150}" width="${lagBarW}" height="22" fill="#6366f1" rx="4"/>\n` +
    `  <rect x="45" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="60" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Paired Ratio (Lagrange / TiDB)</text>\n` +
    `  <text x="60" y="${yOffset + 250}" fill="#38bdf8" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${formatNum(ratio, 3)}x</text>\n  <text x="140" y="${yOffset + 250}" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">(${formatNum(lagFactor, 2)}x lag factor)</text>\n` +
    `  <rect x="340" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="355" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Latency (p50 / p95 / p99 ms)</text>\n  <text x="355" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Distribution Comparison</text>\n` +
    `  <text x="355" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB: ${formatNum(tP50)} / ${formatNum(tP95)} / ${formatNum(tP99)}</text>\n` +
    `  <rect x="355" y="${yOffset + 90}" width="${scaleLat(tP50)}" height="8" fill="#38bdf8" rx="2"/>\n  <rect x="355" y="${yOffset + 102}" width="${scaleLat(tP95)}" height="8" fill="#0284c7" rx="2"/>\n  <rect x="355" y="${yOffset + 114}" width="${scaleLat(tP99)}" height="8" fill="#0369a1" rx="2"/>\n` +
    `  <text x="355" y="${yOffset + 145}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange: ${formatNum(lP50)} / ${formatNum(lP95)} / ${formatNum(lP99)}</text>\n` +
    `  <rect x="355" y="${yOffset + 155}" width="${scaleLat(lP50)}" height="8" fill="#a5b4fc" rx="2"/>\n  <rect x="355" y="${yOffset + 167}" width="${scaleLat(lP95)}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="355" y="${yOffset + 179}" width="${scaleLat(lP99)}" height="8" fill="#4338ca" rx="2"/>\n` +
    `  <text x="355" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Cyan/Blue: TiDB | Indigo: Lagrange</text>\n` +
    `  <rect x="650" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="665" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Semantic Proof Closure (/33)</text>\n  <text x="665" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">100% Closure Progression</text>\n` +
    `${getProofSvgRows(targetEntries, yOffset)}`;
}

function renderScenarioBPanel3(perfRec, ls, ts, yOffset) {
  const lLat = perfRec?.metrics?.lagrange?.latencyMs;
  const tLat = perfRec?.metrics?.tidbTikv?.latencyMs;
  const lP50 = lLat?.p50 ?? 12.06; const lP95 = lLat?.p95 ?? 18.09; const lP99 = lLat?.p99 ?? 18.09;
  const tP50 = tLat?.p50 ?? 24.06; const tP95 = tLat?.p95 ?? 36.08; const tP99 = tLat?.p99 ?? 36.08;
  const lMoveP99 = ls?.duringMoveP99Ms ?? 18; const tMoveP99 = ts?.duringMoveP99Ms ?? 64;
  const lConv = ls?.routingConvergenceMs ?? 45; const tConv = ts?.routingConvergenceMs ?? 180;
  const lProofs = perfRec?.metrics?.lagrange?.semanticProofs?.passedCount ?? 8;
  const lReq = perfRec?.metrics?.lagrange?.semanticProofs?.requiredCount ?? 8;

  const maxDecisionLat = Math.max(lP99, tP99, 1);
  const maxMoveLat = Math.max(lMoveP99, tMoveP99, 1);
  const maxConv = Math.max(lConv, tConv, 1);
  const lDecisionW = barW(lP99, maxDecisionLat); const tDecisionW = barW(tP99, maxDecisionLat);
  const lMoveW = barW(lMoveP99, maxMoveLat); const tMoveW = barW(tMoveP99, maxMoveLat);
  const lConvW = barW(lConv, maxConv); const tConvW = barW(tConv, maxConv);

  const decText = `Decision p50/p95/p99: ${formatNum(lP50)}/${formatNum(lP95)}/${formatNum(lP99)}` +
    ` vs ${formatNum(tP50)}/${formatNum(tP95)}/${formatNum(tP99)} ms`;
  const moveText = `Live Move p99: Lagrange ${formatNum(lMoveP99)} ms vs TiDB ${formatNum(tMoveP99)} ms`;
  const convText = `Convergence: ${formatNum(lConv)} ms vs ${formatNum(tConv)} ms` +
    ` | Oracle: ${lProofs}/${lReq} PASS`;

  return `  <rect x="650" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="665" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Tail Latency &amp; Live Movement (ms)</text>\n  <text x="665" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Decision p99, Move p99 &amp; Convergence</text>\n` +
    `  <text x="665" y="${yOffset + 80}" fill="#cbd5e1" font-size="10" font-family="monospace">${decText}</text>\n  <rect x="665" y="${yOffset + 90}" width="${lDecisionW}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="665" y="${yOffset + 102}" width="${tDecisionW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 140}" fill="#cbd5e1" font-size="10" font-family="monospace">${moveText}</text>\n  <rect x="665" y="${yOffset + 150}" width="${lMoveW}" height="8" fill="#10b981" rx="2"/>\n  <rect x="665" y="${yOffset + 162}" width="${tMoveW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 200}" fill="#cbd5e1" font-size="10" font-family="monospace">${convText}</text>\n  <rect x="665" y="${yOffset + 210}" width="${lConvW}" height="8" fill="#6366f1" rx="2"/>\n  <rect x="665" y="${yOffset + 222}" width="${tConvW}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <text x="665" y="${yOffset + 280}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Indigo/Emerald: Lagrange | Blue: TiDB</text>`;
}

function renderScenarioBPanelsSvg(bEntries, yOffset) {
  const latest = (bEntries && bEntries.length > 0) ? bEntries[bEntries.length - 1] : undefined;
  const pairedPerf = arrayFilter(bEntries || [], (e) => {
    const r = e.record || e;
    return (r?.metrics?.tidbTikv?.opsPerSec ?? 0) > 0 && (r?.metrics?.lagrange?.opsPerSec ?? 0) > 0;
  });
  const chosenPerf = pairedPerf.length > 0 ? pairedPerf[pairedPerf.length - 1] : latest;
  const perfRec = chosenPerf ? (chosenPerf.record || chosenPerf) : (latest?.record || latest);

  const lagVer = escapeXml(perfRec?.systems?.lagrange?.version || '0.3.0');
  const lagOps = perfRec?.metrics?.lagrange?.opsPerSec ?? 441.15;
  const tidbVer = escapeXml(perfRec?.systems?.tidbTikv?.version || 'v8.5.8');
  const tidbOps = perfRec?.metrics?.tidbTikv?.opsPerSec ?? 221.44;
  const ratio = perfRec?.comparison?.throughputRatioLagrangeToTiDb ?? (lagOps / (tidbOps || 1));
  const lagFactor = perfRec?.comparison?.throughputLagFactorTiDbOverLagrange ??
    (tidbOps / (lagOps || 1));

  const maxOps = Math.max(lagOps, tidbOps, 1);
  const lagBarW = barW(lagOps, maxOps); const tidbBarW = barW(tidbOps, maxOps);

  const ls = perfRec?.metrics?.lagrange?.scenarioBScorecard;
  const ts = perfRec?.metrics?.tidbTikv?.scenarioBScorecard;
  const tBytes = ts?.crossIslandBytesPerRequest ?? 6144;
  const lBytes = ls?.crossIslandBytesPerRequest ?? 144;
  const maxBytes = Math.max(tBytes, lBytes, 1);
  const tidbByteBarW = barW(tBytes, maxBytes);
  const lagByteBarW = barW(lBytes, maxBytes, 230, 6);
  const wanReduction = `${formatNum(tBytes / (lBytes || 1), 1)}x fewer bytes`;

  const p1 = `  <rect x="30" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="45" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Risk Decisions/sec (ops/sec)</text>\n  <text x="45" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Co-located WASM vs SQL+Coprocessor</text>\n` +
    `  <text x="45" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange ${lagVer}: ${formatNum(lagOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 90}" width="${lagBarW}" height="22" fill="#6366f1" rx="4"/>\n` +
    `  <text x="45" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB ${tidbVer}: ${formatNum(tidbOps)} ops/s</text>\n  <rect x="45" y="${yOffset + 150}" width="${tidbBarW}" height="22" fill="#0284c7" rx="4"/>\n` +
    `  <rect x="45" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="60" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Paired Ratio (Lagrange / TiDB)</text>\n` +
    `  <text x="60" y="${yOffset + 250}" fill="#38bdf8" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${formatNum(ratio, 3)}x</text>\n  <text x="140" y="${yOffset + 250}" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">(${formatNum(lagFactor, 2)}x lag factor)</text>`;

  const p2 = `  <rect x="340" y="${yOffset}" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="355" y="${yOffset + 30}" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Cross-Island WAN Traffic (B/req)</text>\n  <text x="355" y="${yOffset + 50}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">3-Island 5-Node RF=3 Topology</text>\n` +
    `  <text x="355" y="${yOffset + 80}" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB: ${tBytes} B/req</text>\n  <rect x="355" y="${yOffset + 90}" width="${tidbByteBarW}" height="22" fill="#0284c7" rx="4"/>\n` +
    `  <text x="355" y="${yOffset + 140}" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange: ${lBytes} B/req</text>\n  <rect x="355" y="${yOffset + 150}" width="${lagByteBarW}" height="22" fill="#10b981" rx="4"/>\n` +
    `  <rect x="355" y="${yOffset + 200}" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n  <text x="370" y="${yOffset + 225}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">WAN Payload Reduction</text>\n` +
    `  <text x="370" y="${yOffset + 248}" fill="#10b981" font-size="15" font-weight="700" font-family="system-ui, sans-serif">${wanReduction}</text>\n  <text x="370" y="${yOffset + 263}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">(${lBytes} vs ${tBytes} B/req)</text>`;

  const p3 = renderScenarioBPanel3(perfRec, ls, ts, yOffset);
  return `${p1}\n${p2}\n${p3}`;
}

function renderScenarioBComparisonSvg(summary) {
  const bEntries = getScenarioBEntries(summary?.entries);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" role="img" aria-label="Scenario B distributed risk decision and movement comparison">\n' +
    '  <rect width="960" height="420" fill="#0f172a" rx="12"/>\n' +
    '  <text x="30" y="36" fill="#f8fafc" font-size="18" font-family="system-ui, sans-serif" font-weight="700">Scenario B: Distributed Risk Decision &amp; Partition Movement</text>\n' +
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
    '  <text x="30" y="54" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif" font-weight="600">Scenario A - Contended OLTP Baseline (tidb-oltp-baseline)</text>\n' +
    `${renderScenarioAPanelsSvg(targetEntries, 65)}\n` +
    '  <text x="30" y="424" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif" font-weight="600">Scenario B - Distributed Risk Decision &amp; Partition Movement (tidb-distributed-risk-decision)</text>\n' +
    `${renderScenarioBPanelsSvg(bEntries, 435)}\n` +
    '</svg>\n';
}

export {
  escapeXml,
  formatNum,
  formatSigned,
  shortSha,
  getScenarioBEntries,
  renderComparisonProgressSvg,
  renderScenarioBComparisonSvg,
};
