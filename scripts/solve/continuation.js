import {
  DISPOSITION_REROUTE,
  DISPOSITION_EXPLORE,
  DISPOSITION_PARK_RESUMABLE,
  DISPOSITION_TERMINAL,
} from './constants.js';

const LOCAL_STR_OWNED_001 = '--claim "<how the regressed invariant was restored or why it was abandoned>"';
const STATIC_QUALITY_NEXT_COMMAND =
  '# fix the listed lint/guideline violations in the changed paths, ' +
  'then re-run the attempt';
const REJECTION_ESCALATION_SUCCESSOR_GUIDANCE =
  '# or author a successor quest with a sealed verification bar: ';
const QUEST_ID_PLACEHOLDER = '<questId>';

export const CONTINUATION_ALLOWED = 'allowed';
export const CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE =
  'blocked-unrecorded-evidence';
export const CONTINUATION_BLOCKED_METRIC_PROJECTION =
  'blocked-metric-projection';
export const CONTINUATION_BLOCKED_SCOPE = 'blocked-scope';
export const CONTINUATION_BLOCKED_REGRESSION = 'blocked-regression';
export const CONTINUATION_BLOCKED_THEORY = 'blocked-theory';
export const CONTINUATION_BLOCKED_MEASUREMENT = 'blocked-measurement';
// Deterministic lint/guideline findings in the attempt's changed paths: fix
// them before sealing so an independent verifier turn is never spent on
// machine-checkable output.
const LOCAL_STR_OWNED_002 = 'blocked-static-quality';
export const CONTINUATION_BLOCKED_STATIC_QUALITY = LOCAL_STR_OWNED_002;
// Repeated candidate rejections on one frontier without an intervening
// approval: reframe (decompose the standing rejection or author a successor
// quest with a sealed verification bar) instead of iterating.
const LOCAL_STR_OWNED_003 = 'blocked-rejection-escalation';
export const CONTINUATION_BLOCKED_REJECTION_ESCALATION = LOCAL_STR_OWNED_003;

// Tiering for the override escape hatch (recorded-reason override of a soft guard). Only
// HEURISTIC, process-shaping guards are overridable: a theory/explore gate (produce a
// theory artifact, including the convergence-forcing coupled-invariant/system-theory
// variants) and a scope reroute. These are exactly the rules whose judgement an agent may
// legitimately need to bypass — with a falsifiable reason left in the log. The
// honesty/integrity INVARIANTS are never overridable: a regression (restore green), an
// unrecorded-evidence or metric-projection precondition (record the truth first), a
// cannot-measure park (you literally cannot claim progress), and any unmapped/terminal
// precondition error. Overriding those would let the scaffold sign off on a dishonest move,
// which is the one thing the structure must refuse.
const OVERRIDABLE_CODES = Object.freeze([
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_STATIC_QUALITY,
  CONTINUATION_BLOCKED_REJECTION_ESCALATION,
]);

export function continuationOverridable(continuation) {
  if (continuationIsAllowed(continuation)) return false;
  const code = continuation.code || continuation.status;
  return OVERRIDABLE_CODES.includes(code);
}

// Reversible mapping from a blocking continuation code to a graded disposition. Flip any
// entry to DISPOSITION_TERMINAL to restore the original "guard -> stop" behaviour for
// that code. BLOCKED_THEORY -> explore is the direct fix for the spurious stop: a missing
// theory opens a bounded free-explore rung instead of halting the run. The recoverable
// preconditions (scope/regression/unrecorded/projection) reroute to a concrete next move;
// a measurement gate parks the single frontier as resumable (never exhaustion).
export const CONTINUATION_DISPOSITIONS = Object.freeze({
  [CONTINUATION_BLOCKED_THEORY]: DISPOSITION_EXPLORE,
  [CONTINUATION_BLOCKED_SCOPE]: DISPOSITION_REROUTE,
  [CONTINUATION_BLOCKED_REGRESSION]: DISPOSITION_REROUTE,
  [CONTINUATION_BLOCKED_MEASUREMENT]: DISPOSITION_PARK_RESUMABLE,
  [CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE]: DISPOSITION_REROUTE,
  [CONTINUATION_BLOCKED_METRIC_PROJECTION]: DISPOSITION_REROUTE,
  [CONTINUATION_BLOCKED_STATIC_QUALITY]: DISPOSITION_REROUTE,
  [CONTINUATION_BLOCKED_REJECTION_ESCALATION]: DISPOSITION_REROUTE,
});


const BLOCKING_SIGNAL_CODES = Object.freeze({
  'fresh-evidence-unrecorded': CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
  'live-probe-diverges-from-projection': CONTINUATION_BLOCKED_METRIC_PROJECTION,
  'scope-pressure-terminal': CONTINUATION_BLOCKED_SCOPE,
  'regression-restore-required': CONTINUATION_BLOCKED_REGRESSION,
  'cannot-measure': CONTINUATION_BLOCKED_MEASUREMENT,
  'system-theory-required': CONTINUATION_BLOCKED_THEORY,
  'frontier-theory-required': CONTINUATION_BLOCKED_THEORY,
  'selected-theory-stale': CONTINUATION_BLOCKED_THEORY,
  'metric-zero-but-done-false': CONTINUATION_BLOCKED_THEORY,
});

const CODE_PRECEDENCE = Object.freeze([
  CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
  CONTINUATION_BLOCKED_METRIC_PROJECTION,
  CONTINUATION_BLOCKED_REGRESSION,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_MEASUREMENT,
  CONTINUATION_BLOCKED_THEORY,
]);

function signalMessage(signal) {
  if (signal.type === 'fresh-evidence-unrecorded') {
    return signal.command ?
      `fresh frontier evidence is not recorded; run ${signal.command}` :
      'fresh frontier evidence is not recorded';
  }
  if (signal.type === 'live-probe-diverges-from-projection') {
    return `live frontier metric ${signal.liveMetric} differs from recorded ` +
      `metric ${signal.projectedMetric}`;
  }
  if (signal.type === 'scope-pressure-terminal') {
    return signal.mechanism ?
      `scope pressure terminal: ${signal.mechanism}` :
      'scope pressure terminal';
  }
  if (signal.type === 'regression-restore-required') {
    return signal.mechanism ?
      `regression restore required: ${signal.mechanism}` :
      'regression restore required';
  }
  if (signal.type === 'frontier-theory-required') {
    return signal.mechanism ?
      `frontier theory required for ${signal.mechanism}` :
      'frontier theory required';
  }
  if (signal.type === 'system-theory-required') {
    return signal.mechanism ?
      `system theory required for ${signal.mechanism}` :
      'system theory required';
  }
  if (signal.type === 'selected-theory-stale') {
    return signal.mechanism ?
      `selected theory stale: ${signal.mechanism}` :
      'selected theory stale';
  }
  if (signal.type === 'metric-zero-but-done-false') {
    return 'theory result required when metric is 0 but done is false';
  }
  if (signal.type === 'model-contract-evidence-required') {
    return signal.mechanism ?
      `model evidence required: ${signal.mechanism}` :
      'model evidence required';
  }
  return signal.mechanism ? `${signal.type}: ${signal.mechanism}` : signal.type;
}

function signalCode(signal, options) {
  if (signal.type === 'model-contract-evidence-required' &&
    options.requireModelEvidence === true) {
    return CONTINUATION_BLOCKED_THEORY;
  }
  return BLOCKING_SIGNAL_CODES[signal.type] || null;
}

export function continuationFromHealth(health, options = {}) {
  if (!health || health.questStatus === 'solved') {
    return {status: CONTINUATION_ALLOWED, code: null, problems: []};
  }
  const grouped = new Map();
  for (const signal of health.signals || []) {
    const code = signalCode(signal, options);
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(signalMessage(signal));
  }
  for (const code of CODE_PRECEDENCE) {
    const problems = grouped.get(code);
    if (problems?.length > 0) {
      return {status: code, code, problems};
    }
  }
  return {status: CONTINUATION_ALLOWED, code: null, problems: []};
}

export function continuationIsAllowed(continuation) {
  return !continuation || continuation.status === CONTINUATION_ALLOWED;
}

export function continuationErrorMessage(continuation) {
  if (continuationIsAllowed(continuation)) return '';
  return `continuation gate failed (${continuation.status}): ` +
    continuation.problems.join('; ');
}

// The graded disposition for a (possibly blocked) continuation. Returns null when the
// continuation is allowed. Unmapped codes fall back to DISPOSITION_TERMINAL so a new,
// unclassified block can never be silently downgraded to "keep going".
export function dispositionForContinuation(continuation) {
  if (continuationIsAllowed(continuation)) return null;
  return CONTINUATION_DISPOSITIONS[continuation.status] || DISPOSITION_TERMINAL;
}

// Build a blocked continuation for an unrecorded-evidence precondition so it routes through
// the graded gate (reroute) instead of crashing the driver. The ingest command is embedded
// in the problem string so continuationNextCommand surfaces it verbatim as the next move.
export function unrecordedEvidenceContinuation(unrecorded) {
  const command = unrecorded?.command || '';
  const problem = command ?
    `latest probe evidence is newer than Quest memory; ingest it first: ${command}` :
    'latest probe evidence is newer than Quest memory; ingest it first';
  return {
    status: CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
    code: CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
    problems: [problem],
  };
}

function embeddedCommand(problems) {
  for (const problem of problems || []) {
    const match = /(node scripts\/solve\.js [^\n]+)/.exec(problem || '');
    if (match) return match[1].trim();
  }
  return null;
}

// A concrete, copy-pasteable next command for a blocked continuation, so a driver (human
// or agent) is told exactly how to unblock the quest instead of being left at a silent
// stop. Prefers a command already embedded in a problem message (e.g. ingest-evidence).
export function continuationNextCommand(continuation, context = {}) {
  if (continuationIsAllowed(continuation)) return null;
  const {questId, frontier} = context;
  const problems = continuation.problems || [];
  const embedded = embeddedCommand(problems);
  if (embedded) return embedded;
  const id = questId ? ` --id ${questId}` : '';
  const f = frontier ? ` --frontier ${frontier}` : '';
  switch (continuation.code || continuation.status) {
  case CONTINUATION_BLOCKED_THEORY: {
    const wantsSystem = problems.some((p) => /system theory/.test(p));
    if (wantsSystem) {
      return `node scripts/solve.js theory system${id} ` +
          '--problem <...> --mechanism <...> --owner <...> --evidence <path> ' +
          '--success <...> --discriminator <...> --missing-edge <...>';
    }
    return `node scripts/solve.js theory option${id}${f} ` +
        '--layer <...> --mechanism <...> --intervention <...> ' +
        '--expected-movement <...> --negative-result <...> --discriminator <...> ' +
        '--promotion <...> --rejection <...>';
  }
  case CONTINUATION_BLOCKED_SCOPE:
    return `node scripts/solve.js status${id} ` +
        '# land or split the current changes to reduce scope before the next attempt';
  case CONTINUATION_BLOCKED_STATIC_QUALITY:
    return STATIC_QUALITY_NEXT_COMMAND;
  case CONTINUATION_BLOCKED_REJECTION_ESCALATION:
    return `node scripts/solve.js decompose-rejection${id} ` +
        REJECTION_ESCALATION_SUCCESSOR_GUIDANCE +
        `node scripts/solve.js new --from ${questId || QUEST_ID_PLACEHOLDER}`;
  case CONTINUATION_BLOCKED_REGRESSION:
    return `node scripts/solve.js finding${id}${f} ` +
        LOCAL_STR_OWNED_001;
  case CONTINUATION_BLOCKED_MEASUREMENT:
    return `# fix the measurement harness for ${frontier || 'the frontier'}, ` +
        `then: node scripts/solve.js reopen${id}${f} --reason "harness fixed"`;
  case CONTINUATION_BLOCKED_METRIC_PROJECTION:
    return `node scripts/solve.js ingest-evidence${id}${f} --evidence <fresh report>`;
  default:
    return null;
  }
}

// One-shot graded decision for a blocked continuation: its disposition, the originating
// code/problems, and an actionable next command. Callers route on `disposition` and
// surface `nextCommand` so a stop is never silent.
export function continuationDisposition(continuation, context = {}) {
  const disposition = dispositionForContinuation(continuation);
  return {
    disposition,
    code: continuation?.code || continuation?.status || null,
    problems: continuation?.problems || [],
    nextCommand: disposition ?
      continuationNextCommand(continuation, context) :
      null,
  };
}
