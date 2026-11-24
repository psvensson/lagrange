/**
 * Structured extraction of a readiness-exhausted run's last observation into
 * the admission / landing-table summary `{component, attempts, elapsedMs,
 * phase, state, reasons, lastProbeError?, terminalReason?,
 * lastCompletedObservation?, lastDeniedObservation?, completedStages?}`.
 *
 * Preserves exact output on historical `/readyz` JSON entries (`last.json`)
 * so `npm run audit:comparative-recompute` remains deterministic, while
 * distinguishing (1) the terminal reason the journey failed, (2) the last
 * completed observation, and (3) the last negative observation whenever a
 * positive readiness observation completed before exhaustion.
 */
import {
  arrayIsArray,
  arrayJoin,
  numberIsFinite,
} from './real-product-captured-intrinsics.js';

function textOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function fieldOrNull(record, key) {
  return record?.[key] ?? null;
}

function extractCompletedStages(diagnostic) {
  const explicit = fieldOrNull(diagnostic, 'completedStages');
  if (explicit && typeof explicit === 'object') return explicit;
  const nodes = arrayIsArray(diagnostic?.nodes) ? diagnostic.nodes : null;
  const membership = fieldOrNull(diagnostic, 'membership');
  const systemTables = fieldOrNull(diagnostic, 'systemTables') ??
    fieldOrNull(diagnostic, 'cluster');
  if (!nodes && !membership && !systemTables) return null;
  return {
    ...(nodes ? {nodes} : {}),
    ...(membership ? {membership} : {}),
    ...(systemTables ? {systemTables} : {}),
  };
}

function withCompletedStages(diagnostic, result) {
  const completedStages = extractCompletedStages(diagnostic);
  return completedStages ? {...result, completedStages} : result;
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

function hasStructuredPostReadyContext(diagnostic, obs) {
  return Boolean(
    numberIsFinite(diagnostic?.readyAttempts) ||
    numberIsFinite(diagnostic?.stablePolls) ||
    fieldOrNull(diagnostic, 'lastDeniedObservation') !== null ||
    numberIsFinite(obs?.partitions) ||
    fieldOrNull(obs, 'spreadSummary') !== null,
  );
}

function formatSpreadDetail(obs) {
  const rf3 = obs?.spreadSummary?.rf3Partitions;
  const total = obs?.partitions;
  if (numberIsFinite(rf3) && numberIsFinite(total)) {
    return `${rf3}/${total} RF3`;
  }
  return null;
}

function formatReadyAttemptsDetail(diagnostic) {
  const ready = diagnostic?.readyAttempts;
  const stable = diagnostic?.stablePolls;
  if (numberIsFinite(ready) && numberIsFinite(stable)) {
    return `readyAttempts ${ready}/${stable}`;
  }
  if (numberIsFinite(ready)) {
    return `readyAttempts ${ready}`;
  }
  return null;
}

function assignIfFinite(target, key, value) {
  if (numberIsFinite(value)) target[key] = value;
}

function assignIfTruthy(target, key, value) {
  if (value) target[key] = value;
}

function copyObservationCountsAndSpread(target, obs, diagnostic) {
  const obsObj = obs || {};
  const diagObj = diagnostic || {};
  assignIfFinite(target, 'nodes', obsObj.nodes);
  assignIfFinite(target, 'partitions', obsObj.partitions);
  assignIfTruthy(target, 'spreadSummary', obsObj.spreadSummary);
  assignIfFinite(target, 'readyAttempts', diagObj.readyAttempts);
  assignIfFinite(target, 'stablePolls', diagObj.stablePolls);
}

function buildLastCompletedReadyDetails(diagnostic, obs) {
  const details = [];
  const spread = formatSpreadDetail(obs);
  if (spread) details.push(spread);
  if (arrayIsArray(obs?.denials) && obs.denials.length === 0) {
    details.push('denials: []');
  }
  const attemptsDetail = formatReadyAttemptsDetail(diagnostic);
  if (attemptsDetail) details.push(attemptsDetail);
  return details;
}

function buildLastCompletedReadySummary(diagnostic, obs) {
  const details = buildLastCompletedReadyDetails(diagnostic, obs);
  const summary = details.length > 0 ?
    `ready (${arrayJoin(details, ', ')})` :
    'ready';
  const result = {
    ready: true,
    state: 'ready',
    denials: [],
  };
  copyObservationCountsAndSpread(result, obs, diagnostic);
  result.summary = summary;
  return result;
}

function buildDeniedFromJsonSummary(deniedJson, diagnostic) {
  const reasons = fieldOrNull(deniedJson, 'reasons');
  const result = {
    phase: textOrNull(fieldOrNull(deniedJson, 'phase')),
    state: textOrNull(fieldOrNull(deniedJson, 'state')) ?? 'denied',
    reasons: arrayIsArray(reasons) ? [...reasons] : [],
  };
  assignIfFinite(result, 'deniedAttempts', diagnostic?.deniedAttempts);
  return result;
}

function buildDeniedFromDenialsSummary(deniedObs, diagnostic) {
  const result = {
    phase: 'cluster-readiness',
    state: 'denied',
    reasons: [...deniedObs.denials],
  };
  assignIfFinite(result, 'nodes', deniedObs.nodes);
  assignIfFinite(result, 'partitions', deniedObs.partitions);
  assignIfTruthy(result, 'spreadSummary', deniedObs.spreadSummary);
  assignIfFinite(result, 'deniedAttempts', diagnostic?.deniedAttempts);
  return result;
}

function extractLastDeniedSummary(diagnostic) {
  const deniedObs = fieldOrNull(diagnostic, 'lastDeniedObservation');
  if (!deniedObs || typeof deniedObs !== 'object') return null;
  const deniedJson = fieldOrNull(deniedObs, 'json');
  if (deniedJson && typeof deniedJson === 'object' && deniedJson.ready !== true) {
    return buildDeniedFromJsonSummary(deniedJson, diagnostic);
  }
  if (arrayIsArray(deniedObs.denials) && deniedObs.denials.length > 0) {
    return buildDeniedFromDenialsSummary(deniedObs, diagnostic);
  }
  return null;
}

function formatPostReadyCountPrefix(diagnostic) {
  const ready = diagnostic?.readyAttempts;
  const stable = diagnostic?.stablePolls;
  return numberIsFinite(ready) && numberIsFinite(stable) ?
    `readyAttempts ${ready} of stablePolls ${stable}` :
    null;
}

function buildPostReadyCodeOutcome(state, baseCode, countPrefix, suffixText) {
  const terminalReason = countPrefix ? `${countPrefix} ${suffixText}` : baseCode;
  return {
    state,
    terminalReason,
    reasons: countPrefix ? [baseCode, terminalReason] : [baseCode],
  };
}

function buildPostReadyDeadlineOutcome(diagnostic, countPrefix) {
  const deadlineText = numberIsFinite(diagnostic?.deadlineMs) ?
    `before ${diagnostic.deadlineMs}ms deadline` :
    'before formation deadline';
  return buildPostReadyCodeOutcome(
    'deadline-expired',
    'formation_deadline_expired',
    countPrefix,
    deadlineText,
  );
}

function buildPostReadyTerminalOutcome(diagnostic, lastProbeErrorMsg) {
  const countPrefix = formatPostReadyCountPrefix(diagnostic);
  if (lastProbeErrorMsg) {
    const terminalReason = countPrefix ?
      `${countPrefix} before probe failure: ${lastProbeErrorMsg}` :
      lastProbeErrorMsg;
    return {
      state: 'probe-failed',
      terminalReason,
      reasons: [lastProbeErrorMsg],
      lastProbeError: lastProbeErrorMsg,
    };
  }
  if (diagnostic?.deadlineExpired === true) {
    return buildPostReadyDeadlineOutcome(diagnostic, countPrefix);
  }
  if (diagnostic?.aborted === true) {
    return buildPostReadyCodeOutcome(
      'aborted',
      'readiness_poll_aborted',
      countPrefix,
      'before readiness_poll_aborted',
    );
  }
  const terminalReason = countPrefix ?
    `${countPrefix} before readiness_exhausted` :
    'readiness_exhausted';
  return {
    state: 'readiness-exhausted',
    terminalReason,
    reasons: countPrefix ? ['readiness_exhausted', terminalReason] : [],
  };
}

function minimalPostReadyFailure(diagnostic, base, lastProbeErrorMsg) {
  if (lastProbeErrorMsg) {
    return {
      ...base,
      phase: null,
      state: 'probe-failed',
      reasons: [lastProbeErrorMsg],
      lastProbeError: lastProbeErrorMsg,
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

function denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg, obs = null) {
  if (!hasStructuredPostReadyContext(diagnostic, obs)) {
    return minimalPostReadyFailure(diagnostic, base, lastProbeErrorMsg);
  }
  const terminal = buildPostReadyTerminalOutcome(diagnostic, lastProbeErrorMsg);
  const lastCompletedObservation = buildLastCompletedReadySummary(diagnostic, obs);
  const lastDeniedObservation = extractLastDeniedSummary(diagnostic);
  const isClusterObs = arrayIsArray(obs?.denials) ||
    lastDeniedObservation?.phase === 'cluster-readiness';
  return {
    ...base,
    phase: isClusterObs && !lastProbeErrorMsg ? 'cluster-readiness' : null,
    state: terminal.state,
    terminalReason: terminal.terminalReason,
    reasons: terminal.reasons,
    ...(terminal.lastProbeError ? {lastProbeError: terminal.lastProbeError} : {}),
    lastCompletedObservation,
    ...(lastDeniedObservation ? {
      lastDeniedObservation,
      lastNegativeObservation: lastDeniedObservation,
    } : {}),
  };
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
    return denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg, obs);
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
    return withCompletedStages(diagnostic, denialFromJsonLast(diagnostic, lastJson));
  }
  const base = {
    component: fieldOrNull(diagnostic, 'component'),
    attempts: fieldOrNull(diagnostic, 'attempts'),
    elapsedMs: fieldOrNull(diagnostic, 'elapsedMs'),
  };
  const obs = resolveLastObservation(diagnostic, last);
  if (lastJson?.ready === true) {
    return withCompletedStages(
      diagnostic,
      denialFromPostReadyFailure(diagnostic, base, lastProbeErrorMsg, obs),
    );
  }
  return withCompletedStages(
    diagnostic,
    denialFromObservation(diagnostic, base, obs, lastProbeErrorMsg),
  );
}

const extractReadinessDenial = readinessDenialOf;

export {extractReadinessDenial, readinessDenialOf};
