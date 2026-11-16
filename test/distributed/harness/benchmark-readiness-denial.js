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
import {arrayIsArray} from './real-product-captured-intrinsics.js';

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
    reasons: arrayIsArray(reasons) ? [...reasons] : [],
  };
}

function resolveLastObservation(diagnostic, last) {
  return fieldOrNull(diagnostic, 'lastCompletedObservation') ??
    fieldOrNull(diagnostic, 'lastObservation') ??
    last;
}

function denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg) {
  if (lastProbeErrorMsg) {
    return {
      ...base,
      phase: null,
      state: 'probe-failed',
      reasons: [lastProbeErrorMsg],
      lastProbeError: lastProbeErrorMsg,
    };
  }
  const deniedObs = fieldOrNull(diagnostic, 'lastDeniedObservation');
  const deniedJson = fieldOrNull(deniedObs, 'json');
  if (deniedJson && typeof deniedJson === 'object' && deniedJson.ready !== true) {
    return denialFromJsonLast(diagnostic, deniedJson);
  }
  if (arrayIsArray(deniedObs?.denials) && deniedObs.denials.length > 0) {
    return {
      ...base,
      phase: 'cluster-readiness',
      state: 'denied',
      reasons: [...deniedObs.denials],
    };
  }
  if (diagnostic?.deadlineExpired === true) {
    return {
      ...base,
      phase: null,
      state: 'deadline-expired',
      reasons: ['formation_deadline_expired'],
    };
  }
  if (diagnostic?.aborted === true) {
    return {
      ...base,
      phase: null,
      state: 'aborted',
      reasons: ['readiness_poll_aborted'],
    };
  }
  return {...base, phase: null, state: null, reasons: []};
}

function denialFromExitedObservation(base, obs, probeExtra) {
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

function isPostReadyObservation(diagnostic, obs) {
  if (diagnostic?.lastCompletedReady === true) return true;
  return arrayIsArray(obs?.denials) && obs.denials.length === 0;
}

function denialFromUnclassifiedObservation(diagnostic, base, obs, lastProbeErrorMsg) {
  const errorReason = textOrNull(fieldOrNull(obs, 'error')) ?? lastProbeErrorMsg;
  if (!errorReason && diagnostic?.deadlineExpired === true) {
    return {
      ...base,
      phase: null,
      state: 'deadline-expired',
      reasons: ['formation_deadline_expired'],
    };
  }
  return {...base, phase: null, state: null, reasons: errorReason ? [errorReason] : []};
}

function denialFromObservation(diagnostic, base, obs, lastProbeErrorMsg) {
  if (isPostReadyObservation(diagnostic, obs)) {
    return denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg);
  }
  const probeExtra = lastProbeErrorMsg ? {lastProbeError: lastProbeErrorMsg} : {};
  if (arrayIsArray(obs?.denials)) {
    return {
      ...base,
      phase: 'cluster-readiness',
      state: 'denied',
      reasons: [...obs.denials],
      ...probeExtra,
    };
  }
  if (obs?.containerExited === true) {
    return denialFromExitedObservation(base, obs, probeExtra);
  }
  return denialFromUnclassifiedObservation(diagnostic, base, obs, lastProbeErrorMsg);
}

function readinessDenialOf(run) {
  const diagnostic = fieldOrNull(run?.deployment?.readiness?.evidence, 'diagnostic');
  const last = fieldOrNull(diagnostic, 'last');
  const lastJson = fieldOrNull(last, 'json');
  const lastProbeErrorMsg = textOrNull(
    fieldOrNull(fieldOrNull(diagnostic, 'lastProbeError'), 'error'),
  );
  if (lastJson && typeof lastJson === 'object' && lastJson.ready !== true) {
    return denialFromJsonLast(diagnostic, lastJson);
  }
  const base = {
    component: fieldOrNull(diagnostic, 'component'),
    attempts: fieldOrNull(diagnostic, 'attempts'),
    elapsedMs: fieldOrNull(diagnostic, 'elapsedMs'),
  };
  if (lastJson?.ready === true) {
    return denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg);
  }
  const obs = resolveLastObservation(diagnostic, last);
  return denialFromObservation(diagnostic, base, obs, lastProbeErrorMsg);
}

export {readinessDenialOf};
