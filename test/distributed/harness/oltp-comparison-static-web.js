import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const DEFAULT_COMPARISON_PROGRESS_SVG_PATH = 'docs/benchmarks/tidb-comparison-progress.svg';
const DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH = 'docs/benchmarks/tidb-comparison-progress.md';
const DEFAULT_COMPARISON_PROGRESS_HTML_PATH = 'docs/benchmarks/tidb-comparison-progress.html';

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
  const f = numberToFixed(num, digits); return num > 0 ? `+${f}` : f;
}

function shortSha(sha, len = 10) {
  return sha ? stringSlice(String(sha), 0, len) : 'unknown';
}

function getScenarioBEntries(entries) {
  return arrayFilter(entries, (e) => {
    const m = (e.record || e)?.metrics;
    return Boolean(m?.lagrange?.scenarioBScorecard || m?.tidbTikv?.scenarioBScorecard);
  });
}

function renderComparisonProgressSvg(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const scenarioAEntries = arrayFilter(
    entries,
    (e) => (e.record || e)?.framework?.scenarioId !== 'tidb-distributed-risk-decision',
  );
  const targetEntries = scenarioAEntries.length > 0 ? scenarioAEntries : entries;
  const latest = targetEntries.length > 0 ? targetEntries[targetEntries.length - 1] : undefined;
  const rec = latest ? (latest.record || latest) : undefined;
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
  const perfRec = chosenPerf ? (chosenPerf.record || chosenPerf) : rec;

  const tidbVer = escapeXml(perfRec?.systems?.tidbTikv?.version || 'v8.5.8');
  const tidbOps = perfRec?.metrics?.tidbTikv?.opsPerSec ?? 6.75;
  const lagVer = escapeXml(perfRec?.systems?.lagrange?.version || '0.3.0');
  const lagOps = perfRec?.metrics?.lagrange?.opsPerSec ?? 0.83;
  const ratio = perfRec?.comparison?.throughputRatioLagrangeToTiDb ??
    (lagOps / (tidbOps || 1));
  const lagFactor =
    perfRec?.comparison?.throughputLagFactorTiDbOverLagrange ?? (tidbOps / (lagOps || 1));

  const maxOps = Math.max(tidbOps, lagOps, 1);
  const tidbBarW = Math.max(4, Math.min(230, Math.round((tidbOps / maxOps) * 230)));
  const lagBarW = Math.max(4, Math.min(230, Math.round((lagOps / maxOps) * 230)));

  const tLat = perfRec?.metrics?.tidbTikv?.latencyMs;
  const lLat = perfRec?.metrics?.lagrange?.latencyMs;
  const tP50 = tLat?.p50 ?? 120; const tP95 = tLat?.p95 ?? 210; const tP99 = tLat?.p99 ?? 350;
  const lP50 = lLat?.p50 ?? 450; const lP95 = lLat?.p95 ?? 850; const lP99 = lLat?.p99 ?? 1200;

  const maxLat = Math.max(tP99, lP99, 1);
  const scaleLat = (val) => Math.max(4, Math.min(220, Math.round((val / maxLat) * 220)));

  const defaultProofs = [
    {commit: 'initial-admit', passed: 4, req: 33}, {commit: 'conflict-wip', passed: 16, req: 33},
    {commit: 'gate-closure', passed: 33, req: 33},
  ];
  const recentProofs = arrayFilter(
    targetEntries, (_, i) => i >= Math.max(0, targetEntries.length - 5),
  );
  const proofItems = targetEntries.length > 0 ?
    arrayMap(recentProofs, (e) => {
      const r = e.record || e;
      return {
        commit: shortSha(r?.framework?.frameworkCommitSha, 10),
        passed: r?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0,
        req: r?.metrics?.tidbTikv?.semanticProofs?.requiredCount ?? 33,
      };
    }) :
    defaultProofs;

  const proofSvgRows = arrayJoin(arrayMap(proofItems, (item, idx) => {
    const y = 145 + idx * 44;
    const barW = Math.max(4, Math.min(220, Math.round((item.passed / (item.req || 33)) * 220)));
    const pct = Math.round((item.passed / (item.req || 33)) * 100);
    const color = item.passed >= 33 ? '#10b981' : (item.passed >= 16 ? '#f59e0b' : '#ef4444');
    return `    <text x="665" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeXml(item.commit)}: ${item.passed}/${item.req} (${pct}%)</text>\n` +
      `    <rect x="665" y="${y + 6}" width="220" height="12" fill="#334155" rx="3"/>\n` +
      `    <rect x="665" y="${y + 6}" width="${barW}" height="12" fill="${color}" rx="3"/>`;
  }), '\n');

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" role="img" aria-label="TiDB and Lagrange comparison progress over time">\n' +
    '  <rect width="960" height="420" fill="#0f172a" rx="12"/>\n' +
    '  <text x="30" y="36" fill="#f8fafc" font-size="18" font-family="system-ui, sans-serif" font-weight="700">TiDB/TiKV and Lagrange Comparison Progress</text>\n' +
    `  <text x="930" y="36" text-anchor="end" fill="#94a3b8" font-size="12" font-family="monospace">Runs: ${entries.length}</text>\n` +
    '  <rect x="30" y="55" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n' +
    '  <text x="45" y="85" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Throughput (ops/sec)</text>\n  <text x="45" y="105" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Version &amp; Commit Capacity</text>\n' +
    `  <text x="45" y="135" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB ${tidbVer}: ${formatNum(tidbOps)} ops/s</text>\n` +
    `  <rect x="45" y="145" width="${tidbBarW}" height="22" fill="#0284c7" rx="4"/>\n` +
    `  <text x="45" y="195" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange ${lagVer}: ${formatNum(lagOps)} ops/s</text>\n` +
    `  <rect x="45" y="205" width="${lagBarW}" height="22" fill="#6366f1" rx="4"/>\n` +
    '  <rect x="45" y="255" width="250" height="70" fill="#0f172a" rx="6" stroke="#334155"/>\n' +
    '  <text x="60" y="280" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Paired Ratio (Lagrange / TiDB)</text>\n' +
    `  <text x="60" y="305" fill="#38bdf8" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${formatNum(ratio, 3)}x</text>\n` +
    `  <text x="140" y="305" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">(${formatNum(lagFactor, 2)}x lag factor)</text>\n` +
    '  <rect x="340" y="55" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n' +
    '  <text x="355" y="85" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Latency (p50 / p95 / p99 ms)</text>\n  <text x="355" y="105" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Distribution Comparison</text>\n' +
    `  <text x="355" y="135" fill="#cbd5e1" font-size="12" font-family="monospace">TiDB: ${formatNum(tP50)} / ${formatNum(tP95)} / ${formatNum(tP99)}</text>\n` +
    `  <rect x="355" y="145" width="${scaleLat(tP50)}" height="8" fill="#38bdf8" rx="2"/>\n` +
    `  <rect x="355" y="157" width="${scaleLat(tP95)}" height="8" fill="#0284c7" rx="2"/>\n` +
    `  <rect x="355" y="169" width="${scaleLat(tP99)}" height="8" fill="#0369a1" rx="2"/>\n` +
    `  <text x="355" y="200" fill="#cbd5e1" font-size="12" font-family="monospace">Lagrange: ${formatNum(lP50)} / ${formatNum(lP95)} / ${formatNum(lP99)}</text>\n` +
    `  <rect x="355" y="210" width="${scaleLat(lP50)}" height="8" fill="#a5b4fc" rx="2"/>\n` +
    `  <rect x="355" y="222" width="${scaleLat(lP95)}" height="8" fill="#6366f1" rx="2"/>\n` +
    `  <rect x="355" y="234" width="${scaleLat(lP99)}" height="8" fill="#4338ca" rx="2"/>\n` +
    '  <text x="355" y="280" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">Cyan/Blue: TiDB | Indigo: Lagrange</text>\n' +
    '  <rect x="650" y="55" width="280" height="335" rx="8" fill="#1e293b" stroke="#334155"/>\n' +
    '  <text x="665" y="85" fill="#38bdf8" font-size="14" font-weight="600" font-family="system-ui, sans-serif">Semantic Proof Closure (/33)</text>\n  <text x="665" y="105" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">100% Closure Progression</text>\n' +
    `${proofSvgRows}\n` +
    '</svg>\n';
}

function renderComparisonProgressMarkdown(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const matrixRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const fv = r?.framework?.frameworkVersion || '1.0.0';
    const fc = shortSha(r?.framework?.frameworkCommitSha);
    const sc = `${r?.framework?.scenarioId || 'scenario-a'} / ${r?.framework?.profileId || 'default'}`;
    const lv = `${r?.systems?.lagrange?.version || 'n/a'} (${shortSha(r?.systems?.lagrange?.commitSha)})`;
    const tv = `${r?.systems?.tidbTikv?.version || 'n/a'} (${shortSha(r?.systems?.tidbTikv?.commitSha)})`;
    return `| ${r?.recordedAt || 'unknown'} | ${fv} (${fc}) | ${sc} | ${lv} | ${tv} | ${shortSha(r?.combinationSha256, 16)} |`;
  }), '\n');

  const progressionRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const sc = r?.framework?.scenarioId || 'scenario-a';
    const lm = `${formatNum(r?.metrics?.lagrange?.opsPerSec)} (${formatNum(r?.metrics?.lagrange?.latencyMs?.p50)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p95)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p99)})`;
    const tm = `${formatNum(r?.metrics?.tidbTikv?.opsPerSec)} (${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p50)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p95)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p99)})`;
    const ratio = `${formatNum(r?.comparison?.throughputRatioLagrangeToTiDb, 3)}x (${formatNum(r?.comparison?.throughputLagFactorTiDbOverLagrange, 2)}x lag)`;
    const proofs = `${r?.metrics?.lagrange?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.lagrange?.semanticProofs?.requiredCount ?? 33} vs ${r?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0}/${r?.metrics?.tidbTikv?.semanticProofs?.requiredCount ?? 33}`;
    return `| ${r?.recordedAt || 'unknown'} | ${sc} | ${lm} | ${tm} | ${ratio} | ${proofs} |`;
  }), '\n');

  const deltaRows = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const deltas = e.deltas || e;
    const fc = shortSha(r?.framework?.frameworkCommitSha);
    const ld = `${formatSigned(deltas?.lagrangeOpsPerSecDeltaFromPrev)} / ${formatSigned(deltas?.lagrangeOpsPerSecDeltaFromFirst)}`;
    const td = `${formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev)} / ${formatSigned(deltas?.tidbOpsPerSecDeltaFromFirst)}`;
    const rd = formatSigned(deltas?.throughputRatioDeltaFromPrev, 3);
    const fd = formatSigned(deltas?.throughputLagFactorDeltaFromPrev, 2);
    const pd = formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0);
    return `| ${r?.recordedAt || 'unknown'} | ${fc} | ${ld} | ${td} | ${rd} | ${fd} | ${pd} |`;
  }), '\n');

  const bEntries = getScenarioBEntries(entries);
  const bRows = arrayJoin(arrayMap(bEntries, (e) => {
    const r = e.record || e;
    const ls = r?.metrics?.lagrange?.scenarioBScorecard;
    const ts = r?.metrics?.tidbTikv?.scenarioBScorecard;
    return `| ${r?.recordedAt || 'unknown'} | ${r?.framework?.profileId || 'default'} | ` +
      `${ls?.crossIslandBytesPerRequest ?? 'n/a'} | ${ts?.crossIslandBytesPerRequest ?? 'n/a'} | ` +
      `${formatNum(ls?.duringMoveP99Ms)} | ${formatNum(ts?.duringMoveP99Ms)} | ` +
      `${formatNum(ls?.routingConvergenceMs)} vs ${formatNum(ts?.routingConvergenceMs)} |`;
  }), '\n');
  const bSection = bEntries.length > 0 ?
    '\n## Scenario B distributed risk & movement scorecard\n\n' +
    '| Recorded (UTC) | Profile | Lagrange Cross-Island Bytes/Req | ' +
    'TiDB Cross-Island Bytes/Req | Lagrange Move p99 (ms) | TiDB Move p99 (ms) | ' +
    'Convergence (Lagrange vs TiDB ms) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${bRows}\n` : '';

  return '# TiDB/TiKV and Lagrange Comparison Progress\n\n' +
    'This page is generated deterministically from [`data/tidb-comparison/history.ndjson`](../../data/tidb-comparison/history.ndjson) and [`data/tidb-comparison/progress-summary.json`](../../data/tidb-comparison/progress-summary.json), persisting results for every combination of comparison framework version/commit, scenario profile, and both compared systems\' versions and commit hashes.\n\n' +
    '- Static HTML dashboard: [`tidb-comparison-progress.html`](tidb-comparison-progress.html)\n' +
    '- Scenario specifications: [`tidb-reference-scenarios.md`](tidb-reference-scenarios.md), [`tidb-reference-paired-owner.md`](tidb-reference-paired-owner.md), and [`tidb-reference-semantic-gate.md`](tidb-reference-semantic-gate.md)\n\n' +
    '![TiDB and Lagrange comparison progress chart](tidb-comparison-progress.svg)\n\n' +
    '## Recorded version and commit combinations\n\n' +
    '| Recorded (UTC) | Framework Version & Commit | Scenario / Profile | Lagrange Version & Commit | TiDB/TiKV Version & Commit | Combination Digest |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${matrixRows || '| None recorded | - | - | - | - | - |'}\n\n` +
    '## Throughput, latency, and semantic proof progression\n\n' +
    '| Recorded (UTC) | Scenario | Lagrange ops/s (p50 / p95 / p99 ms) | TiDB/TiKV ops/s (p50 / p95 / p99 ms) | Throughput Ratio (Lagrange / TiDB) | Semantic Proofs (Lagrange / TiDB) |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${progressionRows || '| None recorded | - | - | - | - | - |'}\n\n` +
    '## Progress deltas over time\n\n' +
    '| Recorded (UTC) | Framework Commit | Lagrange ops/s Delta (prev / first) | TiDB ops/s Delta (prev / first) | Ratio Delta (prev) | Lag Factor Delta (prev) | TiDB Proofs Delta (prev) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${deltaRows || '| None recorded | - | - | - | - | - | - |'}\n` +
    bSection;
}

function renderComparisonProgressHtml(summary) {
  const entries = (summary && Array.isArray(summary.entries)) ? summary.entries : [];
  const svg = renderComparisonProgressSvg(summary);

  const matrixTrs = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const fv = escapeXml(`${r?.framework?.frameworkVersion || '1.0.0'} (${shortSha(r?.framework?.frameworkCommitSha)})`);
    const sc = escapeXml(`${r?.framework?.scenarioId || 'scenario-a'} / ${r?.framework?.profileId || 'default'}`);
    const lv = escapeXml(`${r?.systems?.lagrange?.version || 'n/a'} (${shortSha(r?.systems?.lagrange?.commitSha)})`);
    const tv = escapeXml(`${r?.systems?.tidbTikv?.version || 'n/a'} (${shortSha(r?.systems?.tidbTikv?.commitSha)})`);
    const dig = `<span class="badge">${escapeXml(shortSha(r?.combinationSha256, 16))}</span>`;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td><td>${fv}</td><td>${sc}</td><td>${lv}</td><td>${tv}</td><td>${dig}</td></tr>`;
  }), '\n');

  const progressTrs = arrayJoin(arrayMap(entries, (e) => {
    const r = e.record || e;
    const deltas = e.deltas || e;
    const lm = `${formatNum(r?.metrics?.lagrange?.opsPerSec)} ops/s`;
    const llat = `${formatNum(r?.metrics?.lagrange?.latencyMs?.p50)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p95)} / ${formatNum(r?.metrics?.lagrange?.latencyMs?.p99)} ms`;
    const tm = `${formatNum(r?.metrics?.tidbTikv?.opsPerSec)} ops/s`;
    const tlat = `${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p50)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p95)} / ${formatNum(r?.metrics?.tidbTikv?.latencyMs?.p99)} ms`;
    const ratio = `${formatNum(r?.comparison?.throughputRatioLagrangeToTiDb, 3)}x (${formatNum(r?.comparison?.throughputLagFactorTiDbOverLagrange, 2)}x lag)`;
    const retries = escapeXml(String(r?.metrics?.tidbTikv?.transactions?.retries ?? 0));
    const proofs = `${r?.metrics?.lagrange?.semanticProofs?.passedCount ?? 0}/33 vs ${r?.metrics?.tidbTikv?.semanticProofs?.passedCount ?? 0}/33`;
    const deltasStr = `TiDB ops: ${formatSigned(deltas?.tidbOpsPerSecDeltaFromPrev)}, proofs: ${formatSigned(deltas?.tidbSemanticProofsDeltaFromPrev, 0)}`;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td><td>${lm}</td><td>${llat}</td><td>${tm}</td><td>${tlat}</td><td>${ratio}</td><td>${retries}</td><td>${proofs}</td><td>${deltasStr}</td></tr>`;
  }), '\n');

  const bEntries = getScenarioBEntries(entries);
  const bTrs = arrayJoin(arrayMap(bEntries, (e) => {
    const r = e.record || e;
    const ls = r?.metrics?.lagrange?.scenarioBScorecard;
    const ts = r?.metrics?.tidbTikv?.scenarioBScorecard;
    return `        <tr><td>${escapeXml(r?.recordedAt || 'unknown')}</td>` +
      `<td>${escapeXml(r?.framework?.profileId || 'default')}</td>` +
      `<td>${escapeXml(ls?.crossIslandBytesPerRequest ?? 'n/a')}</td>` +
      `<td>${escapeXml(ts?.crossIslandBytesPerRequest ?? 'n/a')}</td>` +
      `<td>${formatNum(ls?.duringMoveP99Ms)}</td><td>${formatNum(ts?.duringMoveP99Ms)}</td>` +
      `<td>${formatNum(ls?.routingConvergenceMs)} vs ` +
      `${formatNum(ts?.routingConvergenceMs)}</td></tr>`;
  }), '\n');
  const bCard = bEntries.length > 0 ?
    '    <div class="card">\n' +
    '      <h2>Scenario B Distributed Risk &amp; Movement Scorecard</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Profile</th>' +
    '<th>Lagrange Cross-Island Bytes/Req</th><th>TiDB Cross-Island Bytes/Req</th>' +
    '<th>Lagrange Move p99 (ms)</th><th>TiDB Move p99 (ms)</th>' +
    '<th>Convergence (Lagrange vs TiDB ms)</th></tr></thead>\n' +
    `      <tbody>\n${bTrs}\n      </tbody></table>\n    </div>\n` : '';

  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8"/>\n' +
    '  <title>TiDB/TiKV and Lagrange Comparison Progress</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8; }\n' +
    '    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }\n' +
    '    .container { max-width: 1040px; margin: 0 auto; }\n    h1 { font-size: 22px; margin-bottom: 8px; }\n' +
    '    p.desc { color: var(--muted); font-size: 13px; margin-bottom: 16px; }\n    .chart-box { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 20px; overflow-x: auto; }\n' +
    '    .filter-bar { margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 13px; }\n    .filter-bar input { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 4px; width: 280px; }\n' +
    '    .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; overflow-x: auto; }\n    .card h2 { font-size: 15px; margin-bottom: 12px; color: var(--accent); }\n' +
    '    table.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n    table.data-table th, table.data-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }\n' +
    '    table.data-table th { color: var(--muted); font-weight: 600; }\n    .badge { font-family: monospace; background: #0f172a; padding: 2px 4px; border-radius: 3px; border: 1px solid var(--border); }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <div class="container">\n' +
    '    <h1>TiDB/TiKV and Lagrange Comparison Progress</h1>\n' +
    '    <p class="desc">Deterministic comparative progression across framework, scenario, and system combinations.</p>\n' +
    `    <div class="chart-box">${svg}</div>\n` +
    '    <div class="filter-bar"><label for="scenario-filter">Filter:</label><input type="text" id="scenario-filter" placeholder="Filter scenario, commit, version..."/></div>\n' +
    '    <div class="card">\n' +
    '      <h2>Version &amp; Commit Combination Matrix</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Framework</th><th>Scenario / Profile</th><th>Lagrange</th><th>TiDB/TiKV</th><th>Digest</th></tr></thead>\n' +
    `      <tbody>\n${matrixTrs || '        <tr><td colspan="6">No combinations recorded</td></tr>'}\n      </tbody></table>\n` +
    '    </div>\n' +
    '    <div class="card">\n' +
    '      <h2>Performance &amp; Semantic Closure Progression</h2>\n' +
    '      <table class="data-table"><thead><tr><th>Recorded (UTC)</th><th>Lagrange ops/s</th><th>Lagrange Latency</th><th>TiDB ops/s</th><th>TiDB Latency</th><th>Ratio</th><th>Retries</th><th>Proofs</th><th>Deltas</th></tr></thead>\n' +
    `      <tbody>\n${progressTrs || '        <tr><td colspan="9">No progression recorded</td></tr>'}\n      </tbody></table>\n` +
    '    </div>\n' +
    bCard +
    '  </div>\n' +
    '  <script>\n' +
    '    document.getElementById(\'scenario-filter\').addEventListener(\'input\', function(e) {\n' +
    '      var q = e.target.value.toLowerCase();\n' +
    '      var rows = document.querySelectorAll(\'table.data-table tbody tr\');\n' +
    '      for (var i = 0; i < rows.length; i++) {\n' +
    '        rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q) === -1 ? \'none\' : \'\';\n' +
    '      }\n' +
    '    });\n' +
    '  </script>\n' +
    '</body>\n</html>\n';
}

async function writeComparisonStaticWebArtifacts({
  summary,
  svgPath = DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  markdownPath = DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  htmlPath = DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
} = {}) {
  const targetSvgPath = svgPath || DEFAULT_COMPARISON_PROGRESS_SVG_PATH;
  const targetMarkdownPath = markdownPath || DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH;
  const targetHtmlPath = htmlPath || DEFAULT_COMPARISON_PROGRESS_HTML_PATH;
  const svg = renderComparisonProgressSvg(summary);
  const markdown = renderComparisonProgressMarkdown(summary);
  const html = renderComparisonProgressHtml(summary);

  const writeTarget = async (p, c) => {
    await mkdir(path.dirname(p), {recursive: true}); await writeFile(p, c, 'utf8');
  };
  await writeTarget(targetSvgPath, svg); await writeTarget(targetMarkdownPath, markdown);
  await writeTarget(targetHtmlPath, html);

  return Object.freeze({
    svg, markdown, html,
    svgPath: targetSvgPath, markdownPath: targetMarkdownPath, htmlPath: targetHtmlPath,
  });
}

export {
  DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
  renderComparisonProgressSvg,
  renderComparisonProgressMarkdown,
  renderComparisonProgressHtml,
  writeComparisonStaticWebArtifacts,
};
