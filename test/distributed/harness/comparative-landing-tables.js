import {
  escapeXml, formatNum, getDecisionsPerSec, getEvidenceTier,
  getP95, getP99, getTxPerSec, getWireBytes,
} from './comparative-landing-svg-renderer.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);

const SHAPES = Object.freeze(['local-only', 'one-remote-stage', 'sequential', 'fan-out']);
const SCENARIO_A_MODES = Object.freeze([
  ['Fixed-Workload Scale-Out', 'fixed-workload-scaleout'],
  ['Proportional-Growth Scale-Out', 'proportional-growth-scaleout'],
  ['Hot-Contention Baseline', 'hot-contention-baseline'],
]);

function isRpoZero(t) {
  return Boolean(t.rpoZeroSurvivability === true || t.rpoZeroSurvivability === 'Yes' || t.rpoZeroSurvivability === 'true');
}

function renderExecutiveMarkdownRow(t) {
  const tierA = getEvidenceTier(t, 'scenarioA');
  const tierB = getEvidenceTier(t, 'scenarioB');
  const rpoText = isRpoZero(t) ? 'Yes' : 'No';
  const c = t.scenarioC || {};
  const scenC = `${formatNum(c.freshDecisionsPerSec0ms ?? 0)} ` +
    `(${formatNum(c.staleDecisionRatePct ?? 0)}% / ${formatNum(c.ruleChangeBackfillSec ?? 0, 1)}s)`;
  const detail = (t.detailPageMd && t.detailPageHtml) ?
    `[${t.detailPageMd}](${t.detailPageMd}) ([HTML](${t.detailPageHtml}))` :
    (t.detailPageMd ? `[${t.detailPageMd}](${t.detailPageMd})` : 'n/a');
  return `| ${t.label} ${t.version} | ${t.category || 'n/a'} | ${t.topologyUnits ?? 1} (${t.processCount ?? 1}) | ` +
    `${rpoText} | ${formatNum(getTxPerSec(t))} (${formatNum(getP95(t))} ms) | ` +
    `${formatNum(getDecisionsPerSec(t))} (${formatNum(getP99(t))} ms) | ${scenC} | ` +
    `${getWireBytes(t)} B | A: \`${tierA}\` / B: \`${tierB}\` | ${detail} |`;
}

function renderExecutiveMatrixRowsMd(targets) {
  return arrayJoin(arrayMap(targets, renderExecutiveMarkdownRow), '\n');
}

function renderExecutiveHtmlRow(t) {
  const tierA = getEvidenceTier(t, 'scenarioA');
  const tierB = getEvidenceTier(t, 'scenarioB');
  const rpoZero = isRpoZero(t);
  const c = t.scenarioC || {};
  const scenC = `${formatNum(c.freshDecisionsPerSec0ms ?? 0)} dec/s ` +
    `(${formatNum(c.staleDecisionRatePct ?? 0)}% / ${formatNum(c.ruleChangeBackfillSec ?? 0, 1)}s)`;
  const detail = (t.detailPageMd && t.detailPageHtml) ?
    `<a href="${escapeXml(t.detailPageHtml)}">${escapeXml(t.detailPageMd)}</a>` : 'n/a';
  return '        <tr>' +
    `<td><strong>${escapeXml(t.label)}</strong> <span class="badge">${escapeXml(t.version)}</span></td>` +
    `<td>${escapeXml(t.category || 'n/a')}</td><td>${t.topologyUnits ?? 1} units (${t.processCount ?? 1} procs)</td>` +
    `<td><span class="badge ${rpoZero ? 'badge-green' : 'badge-red'}">${rpoZero ? 'Yes' : 'No'}</span></td>` +
    `<td>${formatNum(getTxPerSec(t))} tx/s (${formatNum(getP95(t))} ms)</td>` +
    `<td>${formatNum(getDecisionsPerSec(t))} dec/s (${formatNum(getP99(t))} ms)</td>` +
    `<td>${scenC}</td>` +
    `<td>${getWireBytes(t)} B</td><td><span class="badge">A: ${escapeXml(tierA)}</span> <span class="badge">B: ${escapeXml(tierB)}</span></td>` +
    `<td>${detail}</td></tr>`;
}

function renderExecutiveMatrixRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, renderExecutiveHtmlRow), '\n');
}

function renderShapeMarkdownRows(t) {
  return arrayJoin(arrayMap(SHAPES, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    return `| ${t.label} | ${s} | ${formatNum(sh.decisionsPerSec ?? 0)} | ${formatNum(sh.p99Ms ?? 0)} | ${sh.roundTrips ?? sh.sqlRoundTripsPerDecision ?? 0} | ${sh.wanBytes ?? sh.wireBytes ?? 0} B |`;
  }), '\n');
}

function renderShapesRowsMd(targets) {
  return arrayJoin(arrayMap(targets, renderShapeMarkdownRows), '\n');
}

function renderShapeHtmlRows(t) {
  return arrayJoin(arrayMap(SHAPES, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    return `        <tr><td>${escapeXml(t.label)}</td><td><span class="badge">${s}</span></td><td>${formatNum(sh.decisionsPerSec ?? 0)}</td><td>${formatNum(sh.p99Ms ?? 0)}</td><td>${sh.roundTrips ?? sh.sqlRoundTripsPerDecision ?? 0}</td><td>${sh.wanBytes ?? sh.wireBytes ?? 0} B</td></tr>`;
  }), '\n');
}

function renderShapesRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, renderShapeHtmlRows), '\n');
}

function renderEvolutionMarkdownRow(m) {
  return `| ${m.milestoneId} (\`${m.commitSha}\`) | ${formatNum(m.scenarioATxPerSec)} (${formatNum(m.scenarioAP95Ms)} ms) | ${m.semanticProofPassed}/${m.semanticProofRequired} | ${formatNum(m.scenarioBDecisionsPerSec)} (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B) | ${formatNum(m.scenarioCFresh0msDecPerSec)} | \`${m.evidenceTier}\` / \`${m.executionPath}\` |`;
}

function renderMilestoneRowsMd(timeline) {
  return arrayJoin(arrayMap(timeline || [], renderEvolutionMarkdownRow), '\n');
}

function renderEvolutionHtmlRow(m) {
  return '        <tr>' +
    `<td><strong>${escapeXml(m.milestoneId)}</strong> <span class="badge">${escapeXml(m.commitSha)}</span></td>` +
    `<td>${formatNum(m.scenarioATxPerSec)} tx/s (${formatNum(m.scenarioAP95Ms)} ms)</td>` +
    `<td><span class="badge">${m.semanticProofPassed}/${m.semanticProofRequired}</span></td>` +
    `<td>${formatNum(m.scenarioBDecisionsPerSec)} dec/s (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B)</td>` +
    `<td>${formatNum(m.scenarioCFresh0msDecPerSec)} dec/s</td>` +
    `<td><span class="badge">${escapeXml(m.evidenceTier)}</span> <span class="badge">${escapeXml(m.executionPath)}</span></td></tr>`;
}

function renderMilestoneRowsHtml(timeline) {
  return arrayJoin(arrayMap(timeline || [], renderEvolutionHtmlRow), '\n');
}

function provVal(obj, prop) {
  const v = obj && obj[prop];
  return v ? escapeXml(v) : 'n/a';
}

function renderProvenanceMarkdownRow(t) {
  const a = t.scenarioA?.measurementProvenance || {};
  const b = t.scenarioB?.measurementProvenance || {};
  return `| ${t.label} | \`${a.executionPath || 'n/a'}\` (${a.latencySource || 'n/a'}) | \`${b.executionPath || 'n/a'}\` (${b.latencySource || 'n/a'}) | ${b.wireBytesSource || 'n/a'} / ${b.movementSource || 'n/a'} | ${b.comparableClusterEvidence ? 'Yes' : 'No'} |`;
}

function renderProvenanceRowsMd(targets) {
  return arrayJoin(arrayMap(targets, renderProvenanceMarkdownRow), '\n');
}

function renderProvenanceHtmlRow(t) {
  const a = t.scenarioA ? t.scenarioA.measurementProvenance : null;
  const b = t.scenarioB ? t.scenarioB.measurementProvenance : null;
  const isComp = Boolean(b && b.comparableClusterEvidence);
  return '        <tr>' +
    `<td><strong>${escapeXml(t.label)}</strong></td>` +
    `<td><span class="badge">${provVal(a, 'executionPath')}</span> ${provVal(a, 'latencySource')}</td>` +
    `<td><span class="badge">${provVal(b, 'executionPath')}</span> ${provVal(b, 'latencySource')}</td>` +
    `<td>${provVal(b, 'wireBytesSource')} / ${provVal(b, 'movementSource')}</td>` +
    `<td><span class="badge ${isComp ? 'badge-green' : 'badge-red'}">${isComp ? 'Yes' : 'No'}</span></td></tr>`;
}

function renderProvenanceRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, renderProvenanceHtmlRow), '\n');
}

function renderScaleoutSummaryMarkdownRows(scaleoutExp) {
  const propA = scaleoutExp?.scenarioAModes?.['proportional-growth-scaleout'] || [];
  const covB = scaleoutExp?.scenarioBCoverage || [];
  return arrayJoin(arrayMap(propA, (a, idx) => {
    const b = covB[idx] || {};
    const gainPrefix = (a.scaleGainPct ?? 0) >= 0 ? '+' : '';
    return `| ${a.label} | ${formatNum(a.tx3Node)} (${formatNum(a.p95Ms3Node, 1)} ms) | ` +
      `${formatNum(a.tx5Node)} (${formatNum(a.p95Ms5Node, 1)} ms) | ` +
      `${gainPrefix}${formatNum(a.scaleGainPct, 1)}% | ` +
      `${formatNum(b.dec3Node100Pct, 1)} | ` +
      `${formatNum(b.dec5Node60Pct, 1)} (${formatNum(b.p99Ms5Node, 1)} ms) | ` +
      `${formatNum(b.aggregate5NodeDecPerSec, 1)} (${b.wire5Node ?? 0} B) |`;
  }), '\n');
}

function renderScaleoutSummaryHtmlRows(scaleoutExp) {
  const propA = scaleoutExp?.scenarioAModes?.['proportional-growth-scaleout'] || [];
  const covB = scaleoutExp?.scenarioBCoverage || [];
  return arrayJoin(arrayMap(propA, (a, idx) => {
    const b = covB[idx] || {};
    const gainPrefix = (a.scaleGainPct ?? 0) >= 0 ? '+' : '';
    return '        <tr>' +
      `<td><strong>${escapeXml(a.label)}</strong></td>` +
      `<td>${formatNum(a.tx3Node)} (${formatNum(a.p95Ms3Node, 1)} ms)</td>` +
      `<td>${formatNum(a.tx5Node)} (${formatNum(a.p95Ms5Node, 1)} ms)</td>` +
      `<td>${gainPrefix}${formatNum(a.scaleGainPct, 1)}%</td>` +
      `<td>${formatNum(b.dec3Node100Pct, 1)}</td>` +
      `<td>${formatNum(b.dec5Node60Pct, 1)} (${formatNum(b.p99Ms5Node, 1)} ms)</td>` +
      `<td>${formatNum(b.aggregate5NodeDecPerSec, 1)} (${b.wire5Node ?? 0} B)</td></tr>`;
  }), '\n');
}

function renderScenarioAModesMarkdownRows(scaleoutExp) {
  const modes = scaleoutExp?.scenarioAModes || {};
  const rows = [];
  for (let i = 0; i < SCENARIO_A_MODES.length; i += 1) {
    const [modeLabel, modeKey] = SCENARIO_A_MODES[i];
    const list = modes[modeKey] || [];
    for (let j = 0; j < list.length; j += 1) {
      const item = list[j];
      const gainPrefix = (item.scaleGainPct ?? 0) >= 0 ? '+' : '';
      rows.push(
        `| ${modeLabel} | ${item.label} | ${formatNum(item.tx3Node)} (${formatNum(item.p95Ms3Node, 1)} ms) | ` +
        `${formatNum(item.tx5Node)} (${formatNum(item.p95Ms5Node, 1)} ms) | ` +
        `${gainPrefix}${formatNum(item.scaleGainPct, 1)}% | \`${item.evidenceTier}\` |`,
      );
    }
  }
  return arrayJoin(rows, '\n');
}

function renderScenarioAModesHtmlRows(scaleoutExp) {
  const modes = scaleoutExp?.scenarioAModes || {};
  const rows = [];
  for (let i = 0; i < SCENARIO_A_MODES.length; i += 1) {
    const [modeLabel, modeKey] = SCENARIO_A_MODES[i];
    const list = modes[modeKey] || [];
    for (let j = 0; j < list.length; j += 1) {
      const item = list[j];
      const gainPrefix = (item.scaleGainPct ?? 0) >= 0 ? '+' : '';
      rows.push(
        '        <tr>' +
        `<td>${escapeXml(modeLabel)}</td><td><strong>${escapeXml(item.label)}</strong></td>` +
        `<td>${formatNum(item.tx3Node)} (${formatNum(item.p95Ms3Node, 1)} ms)</td>` +
        `<td>${formatNum(item.tx5Node)} (${formatNum(item.p95Ms5Node, 1)} ms)</td>` +
        `<td>${gainPrefix}${formatNum(item.scaleGainPct, 1)}%</td>` +
        `<td><span class="badge">${escapeXml(item.evidenceTier)}</span></td></tr>`,
      );
    }
  }
  return arrayJoin(rows, '\n');
}

function renderScaleoutSummaryMarkdownSection(scaleoutExp) {
  const t1 = renderScaleoutSummaryMarkdownRows(scaleoutExp);
  const t2 = renderScenarioAModesMarkdownRows(scaleoutExp);
  return '## 5-node RF=3 (60% replica coverage) scale-out summary\n\n' +
    'At 3 nodes with RF=3, every node holds 100.0% of partitions locally. At 5 nodes with RF=3, replica\n' +
    'coverage transitions to 60.0% (40.0% absent partitions per node), testing partial data locality,\n' +
    'v0.3.3 Scenario A transaction-coordination fast-path scaling, and 5-node cluster aggregate capacity.\n' +
    'Detailed analysis: [3-to-5-Node RF=3 Scale-Out](scaleout-3to5-node-rf3-progress.md) ' +
    '([HTML](scaleout-3to5-node-rf3-progress.html)) and [5-Node Partition Granularity Sweep (P=6..60)]' +
    '(partition-granularity-sweep-progress.md) ([HTML](partition-granularity-sweep-progress.html)).\n\n' +
    '![3-to-5-Node RF=3 Scale-Out Progress](scaleout-3to5-node-rf3-progress.svg)\n\n' +
    '| System / Configuration | 3-Node (100%) A tx/s (p95 ms) | 5-Node (60%) Proportional A tx/s (p95 ms) | A Scale Gain % | 3-Node (100%) B dec/s | 5-Node (60%) Node B dec/s (p99 ms) | 5-Node Cluster Aggregate B dec/s (WAN B) |\n' +
    '| --- | --- | --- | --- | --- | --- | --- |\n' +
    `${t1}\n\n` +
    '| Scale-Out Mode | Target | 3-Node tx/s (p95 ms) | 5-Node tx/s (p95 ms) | Scale Gain % | Evidence Tier |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' +
    `${t2}`;
}

function renderScaleoutSummaryHtmlSection(scaleoutExp) {
  const t1 = renderScaleoutSummaryHtmlRows(scaleoutExp);
  const t2 = renderScenarioAModesHtmlRows(scaleoutExp);
  return '    <div class="card">\n' +
    '      <h2>5-Node RF=3 (60% Replica Coverage) Scale-Out Summary</h2>\n' +
    '      <p class="desc">At 3 nodes with RF=3, every node holds 100.0% of partitions locally. At 5 nodes with RF=3, replica coverage transitions to 60.0% (40.0% absent partitions per node), testing partial data locality, v0.3.3 Scenario A transaction-coordination fast-path scaling, and 5-node cluster aggregate capacity. Detailed analysis: <a href="scaleout-3to5-node-rf3-progress.html">3-to-5-Node RF=3 Scale-Out</a> (<a href="scaleout-3to5-node-rf3-progress.md">MD</a>) and <a href="partition-granularity-sweep-progress.html">5-Node Partition Granularity Sweep (P=6..60)</a> (<a href="partition-granularity-sweep-progress.md">MD</a>).</p>\n' +
    '      <div class="chart-box"><img src="scaleout-3to5-node-rf3-progress.svg" alt="3-to-5-Node RF=3 Scale-Out Progress"/></div>\n' +
    '      <table class="data-table"><thead><tr><th>System / Configuration</th><th>3-Node (100%) A tx/s (p95 ms)</th><th>5-Node (60%) Proportional A tx/s (p95 ms)</th><th>A Scale Gain %</th><th>3-Node (100%) B dec/s</th><th>5-Node (60%) Node B dec/s (p99 ms)</th><th>5-Node Cluster Aggregate B dec/s (WAN B)</th></tr></thead>\n' +
    `      <tbody>\n${t1}\n      </tbody></table>\n` +
    '      <table class="data-table" style="margin-top: 16px;"><thead><tr><th>Scale-Out Mode</th><th>Target</th><th>3-Node tx/s (p95 ms)</th><th>5-Node tx/s (p95 ms)</th><th>Scale Gain %</th><th>Evidence Tier</th></tr></thead>\n' +
    `      <tbody>\n${t2}\n      </tbody></table>\n` +
    '    </div>';
}

export {
  renderEvolutionHtmlRow,
  renderEvolutionMarkdownRow,
  renderExecutiveHtmlRow,
  renderExecutiveMarkdownRow,
  renderExecutiveMatrixRowsHtml,
  renderExecutiveMatrixRowsMd,
  renderMilestoneRowsHtml,
  renderMilestoneRowsMd,
  renderProvenanceHtmlRow,
  renderProvenanceMarkdownRow,
  renderProvenanceRowsHtml,
  renderProvenanceRowsMd,
  renderScaleoutSummaryHtmlRows,
  renderScaleoutSummaryHtmlSection,
  renderScaleoutSummaryMarkdownRows,
  renderScaleoutSummaryMarkdownSection,
  renderScenarioAModesHtmlRows,
  renderScenarioAModesMarkdownRows,
  renderShapeHtmlRows,
  renderShapeMarkdownRows,
  renderShapesRowsHtml,
  renderShapesRowsMd,
};
