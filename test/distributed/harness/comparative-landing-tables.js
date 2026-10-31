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

function formatScenCMd(c) {
  if (!c) return 'n/a';
  if (c.freshDecisionsPerSec0ms != null) {
    return `${formatNum(c.freshDecisionsPerSec0ms)} (${formatNum(c.staleDecisionRatePct)}% / ${formatNum(c.ruleChangeBackfillSec, 1)}s)`;
  }
  return `[${c.status || 'not measured'}]`;
}

function formatScenAMd(t) {
  if (t.scenarioA?.throughputTxPerSec != null) {
    return `${formatNum(getTxPerSec(t))} (${formatNum(getP95(t))} ms)`;
  }
  return `[${t.scenarioA?.status || 'not measured'}]`;
}

function formatScenBMd(t) {
  if (t.scenarioB?.decisionsPerSec != null) {
    return `${formatNum(getDecisionsPerSec(t))} (${formatNum(getP99(t))} ms)`;
  }
  return `[${t.scenarioB?.status || 'not measured'}]`;
}

function formatDetailMd(t) {
  if (t.detailPageMd && t.detailPageHtml) {
    return `[${t.detailPageMd}](${t.detailPageMd}) ([HTML](${t.detailPageHtml}))`;
  }
  if (t.detailPageMd) {
    return `[${t.detailPageMd}](${t.detailPageMd})`;
  }
  return 'n/a';
}

function renderExecutiveMarkdownRow(t) {
  const tierA = getEvidenceTier(t, 'scenarioA');
  const tierB = getEvidenceTier(t, 'scenarioB');
  const rpoText = isRpoZero(t) ? 'Yes' : 'No';
  const scenC = formatScenCMd(t.scenarioC);
  const scenA = formatScenAMd(t);
  const scenB = formatScenBMd(t);
  const wireBytes = getWireBytes(t) != null ?
    `${getWireBytes(t)} B` : `[${t.scenarioB?.status || 'not measured'}]`;
  const detail = formatDetailMd(t);
  return `| ${t.label} ${t.version} | ${t.category || 'n/a'} | ${t.topologyUnits ?? 1} (${t.processCount ?? 1}) | ` +
    `${rpoText} | ${scenA} | ${scenB} | ${scenC} | ` +
    `${wireBytes} | A: \`${tierA}\` / B: \`${tierB}\` | ${detail} |`;
}

function renderExecutiveMatrixRowsMd(targets) {
  return arrayJoin(arrayMap(targets, renderExecutiveMarkdownRow), '\n');
}

function formatScenCHtml(c) {
  if (!c) return 'n/a';
  if (c.freshDecisionsPerSec0ms != null) {
    return `${formatNum(c.freshDecisionsPerSec0ms)} dec/s (${formatNum(c.staleDecisionRatePct)}% / ${formatNum(c.ruleChangeBackfillSec, 1)}s)`;
  }
  return `<span class="badge">${escapeXml(c.status || 'not measured')}</span>`;
}

function formatScenAHtml(t) {
  if (t.scenarioA?.throughputTxPerSec != null) {
    return `${formatNum(getTxPerSec(t))} tx/s (${formatNum(getP95(t))} ms)`;
  }
  return `<span class="badge">${escapeXml(t.scenarioA?.status || 'not measured')}</span>`;
}

function formatScenBHtml(t) {
  if (t.scenarioB?.decisionsPerSec != null) {
    return `${formatNum(getDecisionsPerSec(t))} dec/s (${formatNum(getP99(t))} ms)`;
  }
  return `<span class="badge">${escapeXml(t.scenarioB?.status || 'not measured')}</span>`;
}

function formatDetailHtml(t) {
  if (t.detailPageMd && t.detailPageHtml) {
    return `<a href="${escapeXml(t.detailPageHtml)}">${escapeXml(t.detailPageMd)}</a>`;
  }
  return 'n/a';
}

function renderExecutiveHtmlRow(t) {
  const tierA = getEvidenceTier(t, 'scenarioA');
  const tierB = getEvidenceTier(t, 'scenarioB');
  const rpoZero = isRpoZero(t);
  const scenC = formatScenCHtml(t.scenarioC);
  const scenA = formatScenAHtml(t);
  const scenB = formatScenBHtml(t);
  const wireBytes = getWireBytes(t) != null ?
    `${getWireBytes(t)} B` : `<span class="badge">${escapeXml(t.scenarioB?.status || 'not measured')}</span>`;
  const detail = formatDetailHtml(t);
  return '        <tr>' +
    `<td><strong>${escapeXml(t.label)}</strong> <span class="badge">${escapeXml(t.version)}</span></td>` +
    `<td>${escapeXml(t.category || 'n/a')}</td><td>${t.topologyUnits ?? 1} units (${t.processCount ?? 1} procs)</td>` +
    `<td><span class="badge ${rpoZero ? 'badge-green' : 'badge-red'}">${rpoZero ? 'Yes' : 'No'}</span></td>` +
    `<td>${scenA}</td>` +
    `<td>${scenB}</td>` +
    `<td>${scenC}</td>` +
    `<td>${wireBytes}</td><td><span class="badge">A: ${escapeXml(tierA)}</span> <span class="badge">B: ${escapeXml(tierB)}</span></td>` +
    `<td>${detail}</td></tr>`;
}

function renderExecutiveMatrixRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, renderExecutiveHtmlRow), '\n');
}

function renderShapeMarkdownRows(t) {
  return arrayJoin(arrayMap(SHAPES, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    if (sh.decisionsPerSec != null) {
      return `| ${t.label} | ${s} | ${formatNum(sh.decisionsPerSec)} | ${formatNum(sh.p99Ms)} | ${sh.roundTrips ?? 0} | ${sh.wanBytes ?? 0} B |`;
    }
    const st = `[${sh.status || 'not measured'}]`;
    return `| ${t.label} | ${s} | ${st} | ${st} | ${st} | ${st} |`;
  }), '\n');
}

function renderShapesRowsMd(targets) {
  return arrayJoin(arrayMap(targets, renderShapeMarkdownRows), '\n');
}

function renderShapeHtmlRows(t) {
  return arrayJoin(arrayMap(SHAPES, (s) => {
    const sh = t.scenarioB?.shapes?.[s] || {};
    if (sh.decisionsPerSec != null) {
      return `        <tr><td>${escapeXml(t.label)}</td><td><span class="badge">${s}</span></td><td>${formatNum(sh.decisionsPerSec)}</td><td>${formatNum(sh.p99Ms)}</td><td>${sh.roundTrips ?? 0}</td><td>${sh.wanBytes ?? 0} B</td></tr>`;
    }
    const b = `<span class="badge">${escapeXml(sh.status || 'not measured')}</span>`;
    return `        <tr><td>${escapeXml(t.label)}</td><td><span class="badge">${s}</span></td><td>${b}</td><td>${b}</td><td>${b}</td><td>${b}</td></tr>`;
  }), '\n');
}

function renderShapesRowsHtml(targets) {
  return arrayJoin(arrayMap(targets, renderShapeHtmlRows), '\n');
}

function renderEvolutionMarkdownRow(m) {
  const scenA = m.scenarioATxPerSec != null ?
    `${formatNum(m.scenarioATxPerSec)} (${formatNum(m.scenarioAP95Ms)} ms)` :
    `[${m.status || 'not measured'}]`;
  const proofs = m.semanticProofPassed != null ?
    `${m.semanticProofPassed}/${m.semanticProofRequired}` :
    `[${m.status || 'not measured'}]`;
  const scenB = m.scenarioBDecisionsPerSec != null ?
    `${formatNum(m.scenarioBDecisionsPerSec)} (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B)` :
    `[${m.status || 'not measured'}]`;
  const scenC = m.scenarioCFresh0msDecPerSec != null ?
    `${formatNum(m.scenarioCFresh0msDecPerSec)}` :
    `[${m.status || 'not measured'}]`;
  return `| ${m.milestoneId} (\`${m.commitSha}\`) | ${scenA} | ${proofs} | ${scenB} | ${scenC} | \`${m.evidenceTier}\` / \`${m.executionPath}\` |`;
}

function renderMilestoneRowsMd(timeline) {
  return arrayJoin(arrayMap(timeline || [], renderEvolutionMarkdownRow), '\n');
}

function renderEvolutionHtmlRow(m) {
  const scenA = m.scenarioATxPerSec != null ?
    `${formatNum(m.scenarioATxPerSec)} tx/s (${formatNum(m.scenarioAP95Ms)} ms)` :
    `<span class="badge">${escapeXml(m.status || 'not measured')}</span>`;
  const proofs = m.semanticProofPassed != null ?
    `<span class="badge">${m.semanticProofPassed}/${m.semanticProofRequired}</span>` :
    `<span class="badge">${escapeXml(m.status || 'not measured')}</span>`;
  const scenB = m.scenarioBDecisionsPerSec != null ?
    `${formatNum(m.scenarioBDecisionsPerSec)} dec/s (${formatNum(m.scenarioBP99Ms)} ms / ${m.scenarioBWanBytes} B)` :
    `<span class="badge">${escapeXml(m.status || 'not measured')}</span>`;
  const scenC = m.scenarioCFresh0msDecPerSec != null ?
    `${formatNum(m.scenarioCFresh0msDecPerSec)} dec/s` :
    `<span class="badge">${escapeXml(m.status || 'not measured')}</span>`;
  return '        <tr>' +
    `<td><strong>${escapeXml(m.milestoneId)}</strong> <span class="badge">${escapeXml(m.commitSha)}</span></td>` +
    `<td>${scenA}</td>` +
    `<td>${proofs}</td>` +
    `<td>${scenB}</td>` +
    `<td>${scenC}</td>` +
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
    if (a.tx3Node != null) {
      const gainPrefix = (a.scaleGainPct ?? 0) >= 0 ? '+' : '';
      return `| ${a.label} | ${formatNum(a.tx3Node)} (${formatNum(a.p95Ms3Node, 1)} ms) | ` +
        `${formatNum(a.tx5Node)} (${formatNum(a.p95Ms5Node, 1)} ms) | ` +
        `${gainPrefix}${formatNum(a.scaleGainPct, 1)}% | ` +
        `${formatNum(b.dec3Node100Pct, 1)} | ` +
        `${formatNum(b.dec5Node60Pct, 1)} (${formatNum(b.p99Ms5Node, 1)} ms) | ` +
        `${formatNum(b.aggregate5NodeDecPerSec, 1)} (${b.wire5Node ?? 0} B) |`;
    }
    const stA = `[${a.status || 'not measured'}]`;
    const stB = `[${b.status || 'not measured'}]`;
    return `| ${a.label} | ${stA} | ${stA} | ${stA} | ${stB} | ${stB} | ${stB} |`;
  }), '\n');
}

function renderScaleoutSummaryHtmlRows(scaleoutExp) {
  const propA = scaleoutExp?.scenarioAModes?.['proportional-growth-scaleout'] || [];
  const covB = scaleoutExp?.scenarioBCoverage || [];
  return arrayJoin(arrayMap(propA, (a, idx) => {
    const b = covB[idx] || {};
    if (a.tx3Node != null) {
      const gainPrefix = (a.scaleGainPct ?? 0) >= 0 ? '+' : '';
      return '        <tr>' +
        `<td><strong>${escapeXml(a.label)}</strong></td>` +
        `<td>${formatNum(a.tx3Node)} (${formatNum(a.p95Ms3Node, 1)} ms)</td>` +
        `<td>${formatNum(a.tx5Node)} (${formatNum(a.p95Ms5Node, 1)} ms)</td>` +
        `<td>${gainPrefix}${formatNum(a.scaleGainPct, 1)}%</td>` +
        `<td>${formatNum(b.dec3Node100Pct, 1)}</td>` +
        `<td>${formatNum(b.dec5Node60Pct, 1)} (${formatNum(b.p99Ms5Node, 1)} ms)</td>` +
        `<td>${formatNum(b.aggregate5NodeDecPerSec, 1)} (${b.wire5Node ?? 0} B)</td></tr>`;
    }
    const badgeA = `<td><span class="badge">${escapeXml(a.status || 'not measured')}</span></td>`;
    const badgeB = `<td><span class="badge">${escapeXml(b.status || 'not measured')}</span></td>`;
    return '        <tr>' +
      `<td><strong>${escapeXml(a.label)}</strong></td>` +
      `${badgeA}${badgeA}${badgeA}${badgeB}${badgeB}${badgeB}</tr>`;
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
      if (item.tx3Node != null) {
        const gainPrefix = (item.scaleGainPct ?? 0) >= 0 ? '+' : '';
        rows.push(
          `| ${modeLabel} | ${item.label} | ${formatNum(item.tx3Node)} (${formatNum(item.p95Ms3Node, 1)} ms) | ` +
          `${formatNum(item.tx5Node)} (${formatNum(item.p95Ms5Node, 1)} ms) | ` +
          `${gainPrefix}${formatNum(item.scaleGainPct, 1)}% | \`${item.evidenceTier}\` |`,
        );
      } else {
        const st = `[${item.status || 'not measured'}]`;
        rows.push(
          `| ${modeLabel} | ${item.label} | ${st} | ${st} | ${st} | \`${item.evidenceTier}\` |`,
        );
      }
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
      if (item.tx3Node != null) {
        const gainPrefix = (item.scaleGainPct ?? 0) >= 0 ? '+' : '';
        rows.push(
          '        <tr>' +
          `<td>${escapeXml(modeLabel)}</td><td><strong>${escapeXml(item.label)}</strong></td>` +
          `<td>${formatNum(item.tx3Node)} (${formatNum(item.p95Ms3Node, 1)} ms)</td>` +
          `<td>${formatNum(item.tx5Node)} (${formatNum(item.p95Ms5Node, 1)} ms)</td>` +
          `<td>${gainPrefix}${formatNum(item.scaleGainPct, 1)}%</td>` +
          `<td><span class="badge">${escapeXml(item.evidenceTier)}</span></td></tr>`,
        );
      } else {
        const badge = `<td><span class="badge">${escapeXml(item.status || 'not measured')}</span></td>`;
        rows.push(
          '        <tr>' +
          `<td>${escapeXml(modeLabel)}</td><td><strong>${escapeXml(item.label)}</strong></td>` +
          `${badge}${badge}${badge}` +
          `<td><span class="badge">${escapeXml(item.evidenceTier)}</span></td></tr>`,
        );
      }
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
  renderExecutiveMatrixRowsHtml,
  renderExecutiveMatrixRowsMd,
  renderMilestoneRowsHtml,
  renderMilestoneRowsMd,
  renderProvenanceRowsHtml,
  renderProvenanceRowsMd,
  renderScaleoutSummaryHtmlSection,
  renderScaleoutSummaryMarkdownSection,
  renderShapesRowsHtml,
  renderShapesRowsMd,
};
