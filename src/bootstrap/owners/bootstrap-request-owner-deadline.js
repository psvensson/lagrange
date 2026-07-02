import {
  BOOTSTRAP_API_REQUEST_FIELD,
} from '../bootstrap-api-constants.js';

const BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE = Object.freeze({
  UNBOUNDED: 'unbounded',
  ACTIVE: 'active',
  EXPIRED: 'expired',
});
const BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION = Object.freeze({
  PROCEED: 'proceed',
  DEFER_EXPIRED: 'defer_expired',
});
const BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE = Object.freeze({
  state: BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.UNBOUNDED,
  deadlineMs: 0,
  remainingBudgetMs: 0,
});

function normalizeBootstrapRequestClientAttemptDeadlineMs(requestBody) {
  const rawDeadlineMs =
    requestBody?.[BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS];
  if (!Number.isFinite(rawDeadlineMs)) {
    return 0;
  }
  const deadlineMs = Math.floor(rawDeadlineMs);
  return deadlineMs > 0 ? deadlineMs : 0;
}

function evaluateBootstrapRequestClientAttemptDeadline(
  requestBody,
  observedAtMs,
) {
  const deadlineMs =
    normalizeBootstrapRequestClientAttemptDeadlineMs(requestBody);
  if (deadlineMs <= 0) {
    return BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE;
  }
  const remainingBudgetMs = Math.max(
    0,
    deadlineMs - observedAtMs,
  );
  return Object.freeze({
    state: remainingBudgetMs > 0 ?
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.ACTIVE :
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.EXPIRED,
    deadlineMs,
    remainingBudgetMs,
  });
}

function normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
  requestBody,
  observedAtMs,
) {
  const clientAttemptDeadline =
    evaluateBootstrapRequestClientAttemptDeadline(requestBody, observedAtMs);
  return Object.freeze({
    decision:
      clientAttemptDeadline.state ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.EXPIRED ?
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED :
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.PROCEED,
    observedAtMs,
    clientAttemptDeadline,
  });
}

export {
  BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION,
  BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE,
  BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE,
  normalizeBootstrapRequestClientAttemptDeadlineSnapshot,
};
