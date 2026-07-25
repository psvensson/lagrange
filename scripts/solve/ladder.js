// The finite strategy ladder, as worker-facing guidance. Each rung turns a frontier
// + its metric history into a concrete instruction for whoever does the work (a human
// in manual mode, or the generic agent adapter in agent mode). The ladder is the same
// for every quest — this is where "how to work" lives, instead of in
// legacy workflow rules.

import {
  LADDER,
  RUNG_OBSERVE,
  RUNG_LOCAL_FIX,
  RUNG_WIDEN_SCOPE,
  RUNG_MODEL,
  RUNG_CHANGE_APPROACH,
  RUNG_PARK,
} from './constants.js';

const COMMENT_MARKER = '#';
const RULED_OUT_INDEX_HEADER =
  '# Also already ruled out (older, claims elided for length):';
const ELISION_NOTE_TAIL =
  'is in the Quest log; treat absence here as "not shown", never "not found")';
const HISTORY_ELISION_PREFIX = '… -> ';

const RUNG_GUIDANCE = Object.freeze({
  [RUNG_OBSERVE]:
    'Do not patch yet. Instrument the frontier and run a discriminator that ' +
    'confirms or refutes the selected theory, then report discrimination=confirmed ' +
    'or discrimination=refuted with the evidence. A refuted theory is progress: it ' +
    'rules out a path and frees you to select the next hypothesis.',
  [RUNG_LOCAL_FIX]:
    'Make the smallest direct change you believe moves the metric. Stay inside the ' +
    'frontier component.',
  [RUNG_WIDEN_SCOPE]:
    'The local fix stalled. Widen scope to adjacent components and coupled ' +
    'invariants; the cause likely sits at a boundary.',
  [RUNG_MODEL]:
    'Cheap iteration has stalled. Build or refine a formal model (TLA+/fast-check) ' +
    'that discriminates the competing hypotheses, then act on what it proves.',
  [RUNG_CHANGE_APPROACH]:
    'The current mechanism is not converging. Adopt a different approach informed ' +
    'by the model; do not retry the same shape.',
  [RUNG_PARK]:
    'No approach on the ladder moved the metric. Record why and let the scheduler ' +
    'redirect to another frontier (or escalate for a human decision).',
});

export function rungName(rungIndex) {
  return LADDER[rungIndex] || RUNG_PARK;
}

export function rungPrompt(task) {
  const rung = rungName(task.rungIndex);
  // A truncated history keeps an explicit leading marker: the SHAPE of the trend is
  // what this line is read for, and silently dropping its head would misreport where
  // the metric started.
  const historyValues = (task.metricHistory || [])
    .map((m) => (m === null ? '?' : m));
  const history = historyValues.length === 0 ? '(none)' :
    `${task.metricHistoryElided > 0 ? HISTORY_ELISION_PREFIX : ''}` +
    `${historyValues.join(' -> ')}`;
  const lines = [
    `# Goal: ${task.quest.statement}`,
    `# Frontier: ${task.frontierDef.id}`,
    `# Rung ${task.rungIndex} (${rung}) — metric "${task.metricName}" ` +
      '(lower is better)',
    `# Metric history: ${history}`,
  ];
  if (task.selectedTheory) {
    lines.push(
      `# Selected theory: ${task.selectedTheory.id} ` +
      `(${task.selectedTheory.layer || task.selectedTheory.scope})`,
    );
  }
  const findings = task.findings || [];
  if (findings.length > 0) {
    lines.push('#', '# Known findings (do not re-derive or re-try ruled-out paths):');
    for (const f of findings) {
      const rules = f.rulesOut ? ` [rules out: ${f.rulesOut}]` : '';
      lines.push(`#  - ${f.claim}${rules}`);
    }
  }
  // Elision must be VISIBLE. A silently shortened list is worse than a long one: it
  // reads as "no such finding exists" and invites re-deriving a lever that was already
  // ruled out. Older findings that did not fit still contribute their dead-lever
  // labels, which is the part that carries the guard.
  const ruledOutIndex = task.ruledOutIndex || [];
  if (ruledOutIndex.length > 0) {
    lines.push(COMMENT_MARKER, RULED_OUT_INDEX_HEADER);
    for (const label of ruledOutIndex) lines.push(`#  - ${label}`);
  }
  if (task.findingsElided > 0) {
    lines.push(COMMENT_MARKER,
      `# (${task.findingsElided} older finding(s) elided for length — the full set ` +
      ELISION_NOTE_TAIL);
  }
  lines.push('', RUNG_GUIDANCE[rung]);
  return lines.join('\n');
}
