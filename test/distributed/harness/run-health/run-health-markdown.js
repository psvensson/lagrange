/**
 * Run health as text: the short summary a reader sees at the top of a
 * failure bundle, and the same summary as its own artefact.
 */

import {INFRASTRUCTURE_SUSPECT, VERDICT_STATE} from './run-health-constants.js';
import {
  arrayFilter,
  arrayMap,
  indexOfIn,
} from './captured-intrinsics.js';

const NODE_ID_DISPLAY_LENGTH = 8;
const LINE_BREAK = '\n';
const BYTES_PER_KIB = 1024;
const TOP_SERVED_TABLES = 3;
const HEADING = '## Run Health';
const SUSPECT_TEXT = Object.freeze({
  [INFRASTRUCTURE_SUSPECT.TRUE]: 'YES - at least one machine or network condition is flagged',
  [INFRASTRUCTURE_SUSPECT.FALSE]:
    'NO - every infrastructure check was evaluated and none is flagged',
  [INFRASTRUCTURE_SUSPECT.UNKNOWN]:
    'UNKNOWN - at least one infrastructure check had no input (listed below)',
});

function short(nodeId) {
  return String(nodeId).slice(0, NODE_ID_DISPLAY_LENGTH);
}

function kib(bytes) {
  return Number.isFinite(bytes) ? `${Math.round(bytes / BYTES_PER_KIB)} KiB` : 'n/a';
}

function compactEvidence(evidence) {
  return arrayMap(arrayFilter(Object.entries(evidence ?? {}), ([, value]) => value !== null && typeof value !== 'object'), ([key, value]) => `${key}=${value}`).join(', ');
}

function verdictLines(verdicts) {
  const flagged = arrayFilter(verdicts, (verdict) => verdict.state === VERDICT_STATE.FLAGGED);
  const unknown = arrayFilter(verdicts, (verdict) => verdict.state === VERDICT_STATE.UNKNOWN);
  const clear = arrayFilter(verdicts, (verdict) => verdict.state === VERDICT_STATE.CLEAR);
  return [
    ...arrayMap(flagged, (verdict) => `  - FLAGGED ${verdict.verdict} [${verdict.attribution}]: ` +
      compactEvidence(verdict.evidence)),
    ...(clear.length > 0 ?
      [`  - clear: ${arrayMap(clear, (verdict) => verdict.verdict).join(', ')}`] : []),
    ...(unknown.length > 0 ? [`  - unknown: ${arrayMap(unknown, (verdict) =>
      `${verdict.verdict} (${verdict.reason})`).join(', ')}`] : []),
  ];
}

function offeredLoadLine(link) {
  const load = link.offeredLoad;
  if (load === null) return '  - offered load: unknown (no peer-traffic samples)';
  return `  - offered load: sent ${kib(load.meanBytesSentPerSecond)}/s mean, ` +
    `${kib(load.peakBytesSentPerSecond)}/s peak, largest frame ` +
    `${kib(load.largestFrameSentBytes)}, max socket backlog ` +
    `${kib(load.maxBufferedAmountBytes)}, frames ${JSON.stringify(load.framesSentByClass)}`;
}

function symptomsLine(link) {
  const symptoms = link.deliverySymptoms;
  const waits = Object.values(symptoms.boundsSpentByWait)
    .reduce((sum, count) => sum + count, 0);
  if (symptoms.routerTimeoutMentions + symptoms.slowNotDeadDecisions + waits +
      symptoms.ackTimeoutDetails === 0) {
    return [];
  }
  return [`  - delivery symptoms: ${symptoms.routerTimeoutMentions} router-timeout ` +
    `line(s), ${waits} spent wait bound(s), ${symptoms.slowNotDeadDecisions} ` +
    `slow-not-dead decision(s), ${symptoms.ackTimeoutDetails} ACK-timeout detail(s)`];
}

function servedLine(node) {
  if (node.servedQueries.length === 0) return [];
  return [`  - served queries (top by bytes): ${arrayMap(node.servedQueries
    .slice(0, TOP_SERVED_TABLES), (served) =>
    `${served.tableName} ${kib(served.responseBytes)} in ${served.queries} quer` +
      `${served.queries === 1 ? 'y' : 'ies'}`).join('; ')}`];
}

/**
 * @param {Object} runHealth - classifyRunHealth's result.
 * @return {string} The run-health section as markdown.
 */
function renderRunHealthMarkdown(runHealth) {
  const lines = [
    HEADING,
    '',
    'Additive evidence about the machines and links this run executed on. It',
    'does not change the scenario outcome or any failure class below.',
    '',
    `- Infrastructure suspect: ${SUSPECT_TEXT[runHealth.infrastructureSuspect]}`,
    `- Checks: ${runHealth.checks.flagged} flagged, ${runHealth.checks.clear} clear, ` +
      `${runHealth.checks.unknown} unknown of ${runHealth.checks.total}`,
    ...arrayMap(runHealth.reasons, (reason) => `- Reason: ${reason}`),
    ...arrayMap(runHealth.workloadFindings, (finding) =>
      `- Workload (not infrastructure): ${finding.subject} ${finding.verdict}`),
    ...arrayMap(runHealth.undeterminedFindings, (finding) =>
      `- Undetermined cause: ${finding.subject} ${finding.verdict}`),
  ];
  for (const node of runHealth.nodes) {
    lines.push(`- Node ${short(node.nodeId)}` +
      (node.address === null ? '' : ` (${node.address})`) + ':');
    lines.push(...verdictLines(node.verdicts), ...servedLine(node));
  }
  for (const link of runHealth.links) {
    lines.push(`- Link ${short(link.from)} -> ${short(link.to)}:`);
    lines.push(...verdictLines(link.verdicts), offeredLoadLine(link), ...symptomsLine(link));
  }
  return `${lines.join(LINE_BREAK)}${LINE_BREAK}`;
}

/**
 * Put the run-health summary directly under a bundle's title line.
 * @param {string} markdown - The failure bundle markdown.
 * @param {Object} runHealth
 * @return {string}
 */
function insertRunHealthSummary(markdown, runHealth) {
  const titleEnd = indexOfIn(markdown, LINE_BREAK);
  const summary = renderRunHealthMarkdown(runHealth);
  return titleEnd < 0 ?
    `${markdown}${LINE_BREAK}${LINE_BREAK}${summary}` :
    `${markdown.slice(0, titleEnd + 1)}${LINE_BREAK}${summary}${markdown.slice(titleEnd + 1)}`;
}

export {insertRunHealthSummary, renderRunHealthMarkdown};
