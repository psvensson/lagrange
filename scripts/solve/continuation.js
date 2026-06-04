export const CONTINUATION_ALLOWED = 'allowed';
export const CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE =
  'blocked-unrecorded-evidence';
export const CONTINUATION_BLOCKED_METRIC_PROJECTION =
  'blocked-metric-projection';
export const CONTINUATION_BLOCKED_SCOPE = 'blocked-scope';
export const CONTINUATION_BLOCKED_REGRESSION = 'blocked-regression';
export const CONTINUATION_BLOCKED_THEORY = 'blocked-theory';
export const CONTINUATION_BLOCKED_MEASUREMENT = 'blocked-measurement';

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
