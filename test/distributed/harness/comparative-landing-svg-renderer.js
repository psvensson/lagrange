import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH = 'docs/benchmarks/comparative-overview.svg';

const CANONICAL_DEFAULT_TARGETS = Object.freeze(buildMultiSystemComparativeMatrix().targets);

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  const str = String(value !== undefined && value !== null ? value : '');
  return stringReplace(str, /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function formatNum(num, digits = 2) {
  return (typeof num === 'number' && numberIsFinite(num)) ? numberToFixed(num, digits) : '0.00';
}

function barW(v, m, w = 220, min = 4) {
  return Math.max(min, Math.min(w, Math.round((Math.max(0, v) / Math.max(m, 1)) * w)));
}

function getTargetColor(targetId, index = 0) {
  const tid = stringToLowerCase(String(targetId || ''));
  if (stringStartsWith(tid, 'lagrange')) return '#6366f1';
  if (stringStartsWith(tid, 'tidb')) return '#0284c7';
  if (stringStartsWith(tid, 'pg-patroni')) return '#f59e0b';
  if (stringStartsWith(tid, 'pg')) return '#10b981';
  const palette = ['#6366f1', '#0284c7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
  return palette[index % palette.length];
}

function getTargets(matrix) {
  if (matrix && Array.isArray(matrix.targets) && matrix.targets.length > 0) {
    return matrix.targets;
  }
  return CANONICAL_DEFAULT_TARGETS;
}

function getTxPerSec(target) {
  return target.scenarioA?.throughputTxPerSec ??
    target.scenarioA?.txPerSec ??
    target.scenarioA?.opsPerSec ?? 0;
}

function getP95(target) {
  return target.scenarioA?.commitP95Ms ?? target.scenarioA?.p95Ms ??
    target.scenarioA?.latencyMs?.p95 ?? target.scenarioA?.p95 ?? 0;
}

function getDecisionsPerSec(target) {
  return target.scenarioB?.decisionsPerSec ?? target.scenarioB?.opsPerSec ?? 0;
}

function getP99(target) {
  return target.scenarioB?.p99Ms ?? target.scenarioB?.latencyMs?.p99 ?? target.scenarioB?.p99 ?? 0;
}

function getWireBytes(target) {
  return target.scenarioB?.wanBytesPerDecision ?? target.scenarioB?.wireBytesPerDecision ??
    target.scenarioB?.crossIslandBytesPerRequest ?? target.scenarioB?.wireBytes ?? 0;
}

function getEvidenceTier(target, scenario = 'scenarioA') {
  return target[scenario]?.evidenceTier ?? target.evidenceTier ?? 'observed-docker-cluster';
}

function renderCard(x, y, title, subtitle, content) {
  return `  <rect x="${x}" y="${y}" width="280" height="315" rx="8" fill="#1e293b" stroke="#334155"/>\n` +
    `  <text x="${x + 15}" y="${y + 28}" fill="#38bdf8" font-size="13" font-weight="600" font-family="system-ui, sans-serif">${title}</text>\n` +
    `  <text x="${x + 15}" y="${y + 46}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">${subtitle}</text>\n` +
    `${content}`;
}

function renderMetricBars(targets, {x, yBase, getValue, formatVal, maxVal, scenario}) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 65 + i * 55;
    const val = getValue(t);
    const w = barW(val, maxVal, 220);
    const color = getTargetColor(t.targetId, i);
    const tier = getEvidenceTier(t, scenario);
    const dash = tier === 'modeled-topology-oracle' ? ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
    const label = `${escapeXml(t.label)}: ${formatVal(val, t)}`;
    return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${label}</text>\n` +
      `    <rect x="${x}" y="${y + 6}" width="220" height="12" fill="#334155" rx="3"/>\n` +
      `    <rect x="${x}" y="${y + 6}" width="${w}" height="12" fill="${color}" rx="3"${dash}/>`;
  }), '\n');
}

function renderPanel3Bars(targets, yBase, maxProcs) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 65 + i * 55;
    const procs = t.processCount ?? 1;
    const units = t.topologyUnits ?? 1;
    const w = barW(procs, maxProcs, 140);
    const color = getTargetColor(t.targetId, i);
    const rpoZero = Boolean(t.rpoZeroSurvivability === true || t.rpoZeroSurvivability === 'Yes' || t.rpoZeroSurvivability === 'true');
    const rpoColor = rpoZero ? '#10b981' : '#ef4444';
    const rpoText = rpoZero ? 'RPO=0: YES' : 'RPO=0: NO';
    const label = `${escapeXml(t.label)}: ${units}u / ${procs}p`;
    return `    <text x="665" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${label}</text>\n` +
      `    <rect x="665" y="${y + 6}" width="140" height="12" fill="#334155" rx="3"/>\n` +
      `    <rect x="665" y="${y + 6}" width="${w}" height="12" fill="${color}" rx="3"/>\n` +
      `    <rect x="815" y="${y + 4}" width="75" height="15" fill="#0f172a" rx="3" stroke="${rpoColor}"/>\n` +
      `    <text x="852" y="${y + 15}" fill="${rpoColor}" font-size="10" font-weight="700" font-family="monospace" text-anchor="middle">${rpoText}</text>`;
  }), '\n');
}

function renderPanel5Bars(targets, yBase, maxP99) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 65 + i * 55;
    const p99 = getP99(t);
    const w = barW(p99, maxP99, 220);
    const color = getTargetColor(t.targetId, i);
    const tier = getEvidenceTier(t, 'scenarioB');
    const dash = tier === 'modeled-topology-oracle' ? ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
    const localP99 = t.scenarioB?.shapes?.['local-only']?.p99Ms;
    const seqP99 = t.scenarioB?.shapes?.['sequential']?.p99Ms;
    const shapeNote = (localP99 !== undefined && seqP99 !== undefined) ?
      ` [loc: ${formatNum(localP99)}ms | seq: ${formatNum(seqP99)}ms]` : '';
    const label = `${escapeXml(t.label)}: ${formatNum(p99)} ms${shapeNote}`;
    return `    <text x="355" y="${y}" fill="#cbd5e1" font-size="10" font-family="monospace">${label}</text>\n` +
      `    <rect x="355" y="${y + 6}" width="220" height="12" fill="#334155" rx="3"/>\n` +
      `    <rect x="355" y="${y + 6}" width="${w}" height="12" fill="${color}" rx="3"${dash}/>`;
  }), '\n');
}

function renderRow1(targets, yBase = 92) {
  const maxTx = Math.max(...arrayMap(targets, getTxPerSec), 1);
  const maxP95 = Math.max(...arrayMap(targets, getP95), 1);
  const maxProcs = Math.max(...arrayMap(targets, (t) => t.processCount ?? 1), 1);

  const p1 = renderCard(30, yBase, 'Scenario A Throughput (tx/sec)', 'Contended OLTP Capacity',
    renderMetricBars(targets, {x: 45, yBase, getValue: getTxPerSec, formatVal: (v) => `${formatNum(v)} tx/s`, maxVal: maxTx, scenario: 'scenarioA'}));
  const p2 = renderCard(340, yBase, 'Scenario A Commit Latency p95 (ms)', 'Commit Tail Distribution',
    renderMetricBars(targets, {x: 355, yBase, getValue: getP95, formatVal: (v) => `${formatNum(v)} ms`, maxVal: maxP95, scenario: 'scenarioA'}));
  const p3 = renderCard(650, yBase, 'Whole-Topology Units &amp; Processes', 'Footprint &amp; RPO=0 HA Survival',
    renderPanel3Bars(targets, yBase, maxProcs));

  return `${p1}\n${p2}\n${p3}`;
}

function renderRow2(targets, yBase = 442) {
  const maxDec = Math.max(...arrayMap(targets, getDecisionsPerSec), 1);
  const maxP99 = Math.max(...arrayMap(targets, getP99), 1);
  const maxBytes = Math.max(...arrayMap(targets, getWireBytes), 1);

  const p4 = renderCard(30, yBase, 'Scenario B Risk Decisions/sec', 'Throughput (higher is better)',
    renderMetricBars(targets, {x: 45, yBase, getValue: getDecisionsPerSec, formatVal: (v) => `${formatNum(v)} dec/s`, maxVal: maxDec, scenario: 'scenarioB'}));
  const p5 = renderCard(340, yBase, 'Scenario B Decision p99 Latency (ms)', 'Decision Tail + Shape Markers',
    renderPanel5Bars(targets, yBase, maxP99));
  const p6 = renderCard(650, yBase, 'Wire / WAN Traffic per Decision (bytes)', 'Network Payload (lower is better)',
    renderMetricBars(targets, {x: 665, yBase, getValue: getWireBytes, formatVal: (v) => `${v} B/dec`, maxVal: maxBytes, scenario: 'scenarioB'}));

  return `${p4}\n${p5}\n${p6}`;
}

function renderComparativeOverviewSvg(matrix) {
  const targets = getTargets(matrix);
  const targetLabels = arrayJoin(arrayMap(targets, (t) => t.label), ', ');
  const r1Header = '  <a href="tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline">' +
    '<text x="30" y="80" fill="#94a3b8" font-size="13" font-family="system-ui, sans-serif" font-weight="600">' +
    'Scenario A - Contended OLTP Baseline (tidb-oltp-baseline) &amp; Topology Footprint</text></a>\n';
  const r2Header = '  <a href="tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision">' +
    '<text x="30" y="430" fill="#94a3b8" font-size="13" font-family="system-ui, sans-serif" font-weight="600">' +
    'Scenario B - Distributed Risk Decision &amp; Partition Movement (tidb-distributed-risk-decision)</text></a>\n';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 780" width="960" height="780" role="img" ' +
    'aria-label="Lagrange Comparative Benchmark Statistics - Multi-System Overview">\n' +
    '  <rect width="960" height="780" fill="#0f172a" rx="12"/>\n' +
    '  <text x="30" y="32" fill="#f8fafc" font-size="18" font-weight="700" font-family="system-ui, sans-serif">' +
    'Lagrange Comparative Benchmark Statistics - Multi-System Overview</text>\n' +
    '  <text x="30" y="52" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">' +
    `Targets: ${escapeXml(targetLabels)} | Legend: solid = observed-docker-cluster, dashed = modeled-topology-oracle</text>\n` +
    `${r1Header}${renderRow1(targets, 92)}\n` +
    `${r2Header}${renderRow2(targets, 442)}\n` +
    '</svg>\n';
}

export {
  CANONICAL_DEFAULT_TARGETS,
  DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  escapeXml,
  formatNum,
  getDecisionsPerSec,
  getEvidenceTier,
  getP95,
  getP99,
  getTargets,
  getTxPerSec,
  getWireBytes,
  renderComparativeOverviewSvg,
};
