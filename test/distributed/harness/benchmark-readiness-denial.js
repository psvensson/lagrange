/**
 * Structured extraction of a readiness-exhausted run's last observation into
 * the admission / landing-table summary `{component, attempts, elapsedMs,
 * phase, state, reasons, lastProbeError?}`.
 *
 * Preserves exact output on historical `/readyz` JSON entries (`last.json`)
 * so `npm run audit:comparative-recompute` remains deterministic, while also
 * decoding `clusterReady` `{denials}`, `containerExited`, and preserved
 * `lastProbeError` entries.
 */
function textOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function fieldOrNull(record, key) {
  return record?.[key] ?? null;
}

function denialFromJsonLast(diagnostic, lastJson) {
  const reasons = fieldOrNull(lastJson, 'reasons');
  return {
    component: fieldOrNull(diagnostic, 'component'),
    attempts: fieldOrNull(diagnostic, 'attempts'),
    elapsedMs: fieldOrNull(diagnostic, 'elapsedMs'),
    phase: textOrNull(fieldOrNull(lastJson, 'phase')),
    state: textOrNull(fieldOrNull(lastJson, 'state')),
    reasons: Array.isArray(reasons) ? [...reasons] : [],
  };
}

function resolveFallbackObservation(diagnostic, last) {
  return fieldOrNull(diagnostic, 'lastCompletedObservation') ??
    fieldOrNull(diagnostic, 'lastObservation') ??
    last;
}

function denialFromObservation(base, obs, lastProbeErrorMsg) {
  const probeExtra = lastProbeErrorMsg ? {lastProbeError: lastProbeErrorMsg} : {};
  if (Array.isArray(obs?.denials)) {
    return {...base, phase: 'cluster-readiness', state: 'denied', reasons: [...obs.denials], ...probeExtra};
  }
  if (obs?.containerExited === true) {
    const roleText = obs.role ?? 'unknown';
    const exitText = obs.exitCode ?? 'null';
    return {
      ...base,
      phase: 'container-exited',
      state: textOrNull(obs.status) ?? 'exited',
      reasons: [`container_exited:${roleText}:${exitText}`],
      ...probeExtra,
    };
  }
  const errorReason = textOrNull(fieldOrNull(obs, 'error')) ?? lastProbeErrorMsg;
  return {...base, phase: null, state: null, reasons: errorReason ? [errorReason] : []};
}

function readinessDenialOf(run) {
  const diagnostic = fieldOrNull(run?.deployment?.readiness?.evidence, 'diagnostic');
  const last = fieldOrNull(diagnostic, 'last');
  const lastJson = fieldOrNull(last, 'json');
  if (lastJson && typeof lastJson === 'object') {
    return denialFromJsonLast(diagnostic, lastJson);
  }
  const base = {
    component: fieldOrNull(diagnostic, 'component'),
    attempts: fieldOrNull(diagnostic, 'attempts'),
    elapsedMs: fieldOrNull(diagnostic, 'elapsedMs'),
  };
  const obs = resolveFallbackObservation(diagnostic, last);
  const lastProbeErrorMsg = textOrNull(
    fieldOrNull(fieldOrNull(diagnostic, 'lastProbeError'), 'error'),
  );
  return denialFromObservation(base, obs, lastProbeErrorMsg);
}

export {readinessDenialOf};
