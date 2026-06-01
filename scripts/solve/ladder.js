// The finite strategy ladder, as worker-facing guidance. Each rung turns a frontier
// + its metric history into a concrete instruction for whoever does the work (a human
// in manual mode, or the generic agent adapter in agent mode). The ladder is the same
// for every quest — this is where "how to work" lives, instead of in per-sprint rules.

import {
  LADDER,
  RUNG_LOCAL_FIX,
  RUNG_WIDEN_SCOPE,
  RUNG_MODEL,
  RUNG_CHANGE_APPROACH,
  RUNG_PARK,
} from './constants.js';

const RUNG_GUIDANCE = Object.freeze({
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
  const history = (task.metricHistory || [])
    .map((m) => (m === null ? '?' : m)).join(' -> ') || '(none)';
  const lines = [
    `# Goal: ${task.quest.statement}`,
    `# Frontier: ${task.frontierDef.id}`,
    `# Rung ${task.rungIndex} (${rung}) — metric "${task.metricName}" ` +
      '(lower is better)',
    `# Metric history: ${history}`,
  ];
  const findings = task.findings || [];
  if (findings.length > 0) {
    lines.push('#', '# Known findings (do not re-derive or re-try ruled-out paths):');
    for (const f of findings) {
      const rules = f.rulesOut ? ` [rules out: ${f.rulesOut}]` : '';
      lines.push(`#  - ${f.claim}${rules}`);
    }
  }
  lines.push('', RUNG_GUIDANCE[rung]);
  return lines.join('\n');
}
