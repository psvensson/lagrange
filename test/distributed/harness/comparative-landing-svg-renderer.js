import {buildMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH = 'docs/benchmarks/comparative-overview.svg';
const CANONICAL_DEFAULT_TARGETS = Object.freeze(buildMultiSystemComparativeMatrix().targets);

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c] || '&#39;');
}

function formatNum(num, digits = 2) {
  return (typeof num === 'number' && numberIsFinite(num)) ? numberToFixed(num, digits) : '[not measured]';
}

function barW(v, m, w = 220) {
  if (typeof v !== 'number' || !numberIsFinite(v) || v <= 0) return 0;
  return Math.min(w, Math.round((v / Math.max(m, 1)) * w));
}

const TARGET_COLOR_PREFIXES = Object.freeze([
  ['lagrange-5node', '#38bdf8'], ['lagrange', '#6366f1'], ['tidb', '#0284c7'],
  ['pg-valkey', '#06b6d4'], ['pg-plpgsql-sync-ha', '#d97706'], ['pg-plpgsql', '#14b8a6'],
  ['pg-patroni', '#f59e0b'], ['pg', '#10b981'], ['citus-distributed', '#ec4899'],
  ['citus', '#db2777'], ['yugabyte', '#8b5cf6'], ['ignite', '#ef4444'],
]);

const FALLBACK_PALETTE = Object.freeze([
  '#6366f1', '#0284c7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']);

const TARGET_LABEL_PREFIXES = Object.freeze([
  ['pg-plpgsql-sync-ha', 'PG 17 (Patroni HA + PL/pgSQL)'],
  ['pg-plpgsql', 'PG 17 (Single + PL/pgSQL Fn)'],
  ['pg-patroni', 'PG 17 (Patroni Sync HA + App)'],
  ['pg-valkey', 'PG 17 + Valkey Cache'],
  ['pg', 'PG 17 (Single + App Service)'],
  ['citus-distributed', 'Citus Distributed RF=3'],
  ['citus', 'Citus Single-Node'],
  ['yugabyte', 'YugabyteDB (RF=3)'],
  ['ignite', 'Apache Ignite 3'],
  ['tidb', 'TiDB + TiKV'],
  ['lagrange-5node', 'Lagrange 0.4.0 (5-Node RF=3)'],
  ['lagrange', 'Lagrange 0.4.0 (3-Node RF=3)'],
]);

function getTargetColor(targetId, index = 0) {
  const tid = stringToLowerCase(String(targetId || ''));
  for (let i = 0; i < TARGET_COLOR_PREFIXES.length; i += 1) {
    if (stringStartsWith(tid, TARGET_COLOR_PREFIXES[i][0])) return TARGET_COLOR_PREFIXES[i][1];
  }
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function abbreviateTargetLabel(label) {
  if (label.length <= 30) return label;
  const s = stringReplace(stringReplace(stringReplace(label,
    /PostgreSQL 17/gu, 'PG 17'), /Function/gu, 'Fn'), /Service/gu, 'App');
  return s.length > 30 ? stringSlice(s, 0, 30) : s;
}

function shortTargetLabel(target) {
  if (!target) return '';
  if (typeof target.shortLabel === 'string' && target.shortLabel.length > 0) {
    return target.shortLabel;
  }
  const tid = stringToLowerCase(String(target.targetId || ''));
  for (let i = 0; i < TARGET_LABEL_PREFIXES.length; i += 1) {
    if (stringStartsWith(tid, TARGET_LABEL_PREFIXES[i][0])) return TARGET_LABEL_PREFIXES[i][1];
  }
  return abbreviateTargetLabel(String(target.label || tid));
}

function getTargets(matrix) {
  return (matrix?.targets?.length > 0) ? matrix.targets : CANONICAL_DEFAULT_TARGETS;
}

function getTxPerSec(t) {
  const v = t.scenarioA?.throughputTxPerSec ?? t.scenarioA?.txPerSec ?? t.scenarioA?.opsPerSec;
  return (typeof v === 'number' && numberIsFinite(v)) ? v : null;
}
function getP95(t) {
  const v = t.scenarioA?.commitP95Ms ?? t.scenarioA?.p95Ms ??
    t.scenarioA?.latencyMs?.p95 ?? t.scenarioA?.p95;
  return (typeof v === 'number' && numberIsFinite(v)) ? v : null;
}
function getDecisionsPerSec(t) {
  const v = t.scenarioB?.decisionsPerSec ?? t.scenarioB?.opsPerSec;
  return (typeof v === 'number' && numberIsFinite(v)) ? v : null;
}
function getP99(t) {
  const v = t.scenarioB?.p99Ms ?? t.scenarioB?.latencyMs?.p99 ?? t.scenarioB?.p99;
  return (typeof v === 'number' && numberIsFinite(v)) ? v : null;
}
function getWireBytes(t) {
  const b = t.scenarioB?.wanBytesPerDecision ?? t.scenarioB?.wireBytesPerDecision ??
    t.scenarioB?.crossIslandBytesPerRequest ?? t.scenarioB?.wireBytes;
  return (typeof b === 'number' && numberIsFinite(b)) ? b : null;
}
function getEvidenceTier(t, scenario = 'scenarioA') {
  const s = t[scenario];
  if (s?.evidenceTier && s.evidenceTier !== 'none') return s.evidenceTier;
  return s?.status || 'not measured';
}

function renderCard(x, y, title, subtitle, content, cardHeight = 315) {
  return `  <rect x="${x}" y="${y}" width="280" height="${cardHeight}" rx="8" ` +
    'fill="#1e293b" stroke="#334155"/>\n' +
    `  <text x="${x + 15}" y="${y + 28}" fill="#38bdf8" font-size="13" font-weight="600" ` +
    `font-family="system-ui, sans-serif">${title}</text>\n` +
    `  <text x="${x + 15}" y="${y + 46}" fill="#94a3b8" font-size="11" ` +
    `font-family="system-ui, sans-serif">${subtitle}</text>\n${content}`;
}

function renderMetricBars(targets, {x, yBase, getValue, formatVal, maxVal, scenario}) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 68 + i * 54;
    const val = getValue(t);
    const isMeasured = typeof val === 'number' && numberIsFinite(val);
    const dash = getEvidenceTier(t, scenario) === 'modeled-topology-oracle' ?
      ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
    const w = isMeasured ? barW(val, maxVal, 220) : 0;
    const status = t[scenario]?.status || t.status || 'not measured';
    const textVal = isMeasured ? formatVal(val, t) : `[${status}]`;
    const fillRect = w > 0 ?
      `\n    <rect x="${x}" y="${y + 18}" width="${w}" height="11" fill="${getTargetColor(t.targetId, i)}" rx="3"${dash}/>` : '';
    return `    <text x="${x}" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeXml(shortTargetLabel(t))}</text>\n` +
      `    <text x="${x}" y="${y + 13}" fill="${isMeasured ? '#94a3b8' : '#64748b'}" font-size="10" font-family="monospace">${escapeXml(textVal)}</text>\n` +
      `    <rect x="${x}" y="${y + 18}" width="220" height="11" fill="#334155" rx="3"/>` + fillRect;
  }), '\n');
}

function renderCardMetric(targets, {x, yBase, title, sub, getVal, fmt, scen = 'scenarioC', h = 330}) {
  const vals = arrayMap(targets, (t) => {
    const v = getVal(t);
    return (typeof v === 'number' && numberIsFinite(v)) ? v : 0;
  });
  return renderCard(x, yBase, title, sub, renderMetricBars(targets, {
    x: x + 15, yBase, getValue: getVal, maxVal: Math.max(...vals, 1),
    scenario: scen, formatVal: fmt,
  }), h);
}

function renderPanel3Bars(targets, yBase, maxProcs) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 68 + i * 54;
    const rpoZero = Boolean(
      t.rpoZeroSurvivability === true || t.rpoZeroSurvivability === 'Yes' ||
      t.rpoZeroSurvivability === 'true',
    );
    const rpoColor = rpoZero ? '#10b981' : '#ef4444';
    return `    <text x="665" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeXml(shortTargetLabel(t))}</text>\n` +
      `    <text x="665" y="${y + 13}" fill="#94a3b8" font-size="10" font-family="monospace">${t.topologyUnits ?? 1}u / ${t.processCount ?? 1}p</text>\n` +
      `    <rect x="665" y="${y + 18}" width="140" height="11" fill="#334155" rx="3"/>\n` +
      `    <rect x="665" y="${y + 18}" width="${barW(t.processCount ?? 1, maxProcs, 140)}" height="11" fill="${getTargetColor(t.targetId, i)}" rx="3"/>\n` +
      `    <rect x="815" y="${y + 16}" width="75" height="15" fill="#0f172a" rx="3" stroke="${rpoColor}"/>\n` +
      `    <text x="852" y="${y + 27}" fill="${rpoColor}" font-size="10" font-weight="700" font-family="monospace" text-anchor="middle">${rpoZero ? 'RPO=0: YES' : 'RPO=0: NO'}</text>`;
  }), '\n');
}

function renderPanel5Bars(targets, yBase, maxP99) {
  return arrayJoin(arrayMap(targets, (t, i) => {
    const y = yBase + 68 + i * 54;
    const p99 = getP99(t);
    const isMeasured = typeof p99 === 'number' && numberIsFinite(p99);
    const dash = getEvidenceTier(t, 'scenarioB') === 'modeled-topology-oracle' ?
      ' stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,2"' : '';
    const w = isMeasured ? barW(p99, maxP99, 220) : 0;
    const status = t.scenarioB?.status || t.status || 'not measured';
    const textVal = isMeasured ? `${formatNum(p99)} ms` : `[${status}]`;
    const fillRect = w > 0 ?
      `\n    <rect x="355" y="${y + 18}" width="${w}" height="11" fill="${getTargetColor(t.targetId, i)}" rx="3"${dash}/>` : '';
    return `    <text x="355" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeXml(shortTargetLabel(t))}</text>\n` +
      `    <text x="355" y="${y + 13}" fill="${isMeasured ? '#94a3b8' : '#64748b'}" font-size="10" font-family="monospace">${escapeXml(textVal)}</text>\n` +
      `    <rect x="355" y="${y + 18}" width="220" height="11" fill="#334155" rx="3"/>` + fillRect;
  }), '\n');
}

function renderRow1(targets, yBase = 104, cardHeight = 330) {
  const p1 = renderCardMetric(targets, {
    x: 30, yBase, title: 'Scenario A Throughput (tx/sec)', sub: 'Contended OLTP Capacity',
    getVal: getTxPerSec, scen: 'scenarioA', fmt: (v) => `${formatNum(v)} tx/s`, h: cardHeight,
  });
  const p2 = renderCardMetric(targets, {
    x: 340, yBase, title: 'Scenario A Commit Latency p95 (ms)', sub: 'Commit Tail Distribution',
    getVal: getP95, scen: 'scenarioA', fmt: (v) => `${formatNum(v)} ms`, h: cardHeight,
  });
  const p3 = renderCard(650, yBase, 'Whole-Topology Units &amp; Processes',
    'Footprint &amp; RPO=0 HA Survival', renderPanel3Bars(targets, yBase,
      Math.max(...arrayMap(targets, (t) => t.processCount ?? 1), 1)), cardHeight);
  return `${p1}\n${p2}\n${p3}`;
}

function renderRow2(targets, yBase = 470, cardHeight = 330) {
  const p4 = renderCardMetric(targets, {
    x: 30, yBase, title: 'Scenario B Risk Decisions/sec', sub: 'Throughput (higher is better)',
    getVal: getDecisionsPerSec, scen: 'scenarioB', fmt: (v) => `${formatNum(v)} dec/s`, h: cardHeight,
  });
  const p5 = renderCard(340, yBase, 'Scenario B Decision p99 Latency (ms)',
    'Decision Tail + Shape Markers', renderPanel5Bars(targets, yBase,
      Math.max(...arrayMap(targets, (t) => {
        const v = getP99(t);
        return (typeof v === 'number' && numberIsFinite(v)) ? v : 0;
      }), 1)), cardHeight);
  const p6 = renderCardMetric(targets, {
    x: 650, yBase, title: 'Wire / WAN Traffic per Decision (bytes)',
    sub: 'Network Payload (lower is better)', getVal: getWireBytes,
    scen: 'scenarioB', fmt: (v) => (v != null ? `${v} B/dec` : '[not measured]'), h: cardHeight,
  });
  return `${p4}\n${p5}\n${p6}`;
}

function renderRow3(targets, yBase = 836, cardHeight = 330) {
  const cards = [
    {x: 30, t: 'Scenario C 0ms Freshness (dec/sec)', s: 'Zero-Staleness Capacity',
      g: (t) => t.scenarioC?.freshDecisionsPerSec0ms ?? null,
      f: (v, t) => (v != null ? `${formatNum(v)} dec/s` : `[${t.scenarioC?.status || 'not measured'}]`)},
    {x: 340, t: 'Scenario C 1000ms SLA (dec/sec)', s: 'Relaxed Freshness Capacity',
      g: (t) => t.scenarioC?.freshDecisionsPerSec1000ms ?? null,
      f: (v, t) => (v != null ? `${formatNum(v)} dec/s` : `[${t.scenarioC?.status || 'not measured'}]`)},
    {x: 650, t: 'Rule-Change Backfill &amp; Recovery (sec)', s: 'Operational Overhead (lower is better)',
      g: (t) => ((t.scenarioC?.ruleChangeBackfillSec != null &&
        t.scenarioC?.cacheRestartRecoverySec != null) ?
        (t.scenarioC.ruleChangeBackfillSec + t.scenarioC.cacheRestartRecoverySec) : null),
      f: (_v, t) => {
        if (t.scenarioC?.ruleChangeBackfillSec != null &&
            t.scenarioC?.cacheRestartRecoverySec != null) {
          const bf = formatNum(t.scenarioC.ruleChangeBackfillSec, 1);
          const rec = formatNum(t.scenarioC.cacheRestartRecoverySec, 1);
          return `BF ${bf}s | Rec ${rec}s`;
        }
        return `[${t.scenarioC?.status || 'not measured'}]`;
      }},
  ];
  return arrayJoin(arrayMap(cards, (c) => renderCardMetric(targets, {
    x: c.x, yBase, title: c.t, sub: c.s, getVal: c.g, fmt: c.f, h: cardHeight,
  })), '\n');
}

function renderSectionHeader(y, href, text) {
  return `  <a href="${href}"><text x="30" y="${y}" fill="#94a3b8" font-size="13" ` +
    `font-family="system-ui, sans-serif" font-weight="600">${text}</text></a>\n`;
}

function renderComparativeOverviewSvg(matrix) {
  const targets = getTargets(matrix);
  const labels = arrayMap(targets, (t) => shortTargetLabel(t));
  const targetLines = [];
  for (let i = 0; i < labels.length; i += 4) {
    const prefix = i === 0 ? 'Targets: ' : '         ';
    targetLines.push(`${prefix}${escapeXml(arrayJoin(labels.slice(i, i + 4), ', '))}`);
  }
  const subtitleSvg = arrayJoin(arrayMap(targetLines, (line, idx) =>
    `  <text x="30" y="${50 + idx * 16}" fill="#94a3b8" font-size="11" ` +
    `font-family="system-ui, sans-serif">${line}</text>\n`), '');
  const legendY = 50 + targetLines.length * 16;
  const cardHeight = Math.max(330, 68 + targets.length * 54);
  const r1Y = legendY + 36;
  const r2Y = r1Y + cardHeight + 36;
  const r3Y = r2Y + cardHeight + 36;
  const svgHeight = r3Y + cardHeight + 20;

  const r1 = renderSectionHeader(r1Y - 12,
    'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
    'Scenario A - Contended OLTP Baseline (tidb-oltp-baseline) &amp; Topology Footprint');
  const r2 = renderSectionHeader(r2Y - 12,
    'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
    'Scenario B - Distributed Risk Decision &amp; Partition Movement (tidb-distributed-risk-decision)');
  const r3 = renderSectionHeader(r3Y - 12,
    'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision',
    'Scenario C - Streaming Feature Risk Decision &amp; Freshness SLA (streaming-feature-risk-decision)');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${svgHeight}" ` +
    `width="960" height="${svgHeight}" role="img" ` +
    'aria-label="Lagrange Comparative Benchmark Statistics - Multi-System Overview">\n' +
    `  <rect width="960" height="${svgHeight}" fill="#0f172a" rx="12"/>\n` +
    '  <text x="30" y="32" fill="#f8fafc" font-size="18" font-weight="700" font-family="system-ui, sans-serif">' +
    'Lagrange Comparative Benchmark Statistics - Multi-System Overview</text>\n' +
    subtitleSvg +
    `  <text x="30" y="${legendY}" fill="#94a3b8" font-size="11" font-family="system-ui, sans-serif">` +
    'Legend: solid bar = observed GCP/lab execution | [not measured] = awaiting original GCP/lab receipt</text>\n' +
    `${r1}${renderRow1(targets, r1Y, cardHeight)}\n` +
    `${r2}${renderRow2(targets, r2Y, cardHeight)}\n` +
    `${r3}${renderRow3(targets, r3Y, cardHeight)}\n` +
    '</svg>\n';
}

export {
  CANONICAL_DEFAULT_TARGETS, DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  escapeXml, formatNum, getDecisionsPerSec, getEvidenceTier, getP95, getP99,
  getTargets, getTxPerSec, getWireBytes, renderComparativeOverviewSvg,
};
