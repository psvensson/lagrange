/**
 * A recovery observation: interrupt the NAMED component (restart its own
 * container), observe THAT component's recovery through its product
 * readiness surface, then a user operation against it. Anything short of
 * that returns a typed `not-measured` with its reason; there is no fixed or
 * fallback timing (D10). Backfill is not measured anywhere in this layer.
 */
import {CLAIM_STATUS} from './real-product-deployment-contract.js';
import {errorText, shellWord} from './real-product-remote-shell.js';

const NOT_MEASURED_REASON = Object.freeze({
  INTERRUPT_FAILED: 'interrupt-failed',
  COMPONENT_NOT_RECOVERED: 'component-not-recovered',
  USER_OPERATION_FAILED: 'user-operation-failed',
});
const RESTART_GRACE_SECONDS = 1;

function notMeasured(component, reason, evidence) {
  return {claim: 'recovery', status: CLAIM_STATUS.NOT_MEASURED, reason, component, evidence};
}

// One observation through a caller's probe: its answer ({ready|ok, evidence}),
// or, when the probe throws, a negative observation whose evidence is the error.
async function observeOnce(probe, component, verdictKey) {
  try {
    return await probe(component);
  } catch (error) {
    return {[verdictKey]: false, evidence: errorText(error)};
  }
}

// The named component's own readiness surface, polled up to `attempts` times
// `intervalMs` apart; the last observation decides.
async function awaitComponentReady({component, attempts, intervalMs, sleep,
  observeComponentReady}) {
  let readiness = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    readiness = await observeOnce(observeComponentReady, component, 'ready');
    if (readiness.ready === true) return readiness;
    if (attempt < attempts) await sleep(intervalMs);
  }
  return readiness;
}

function requirePollPlan(attempts, intervalMs) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 ||
      !Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('recovery observation needs attempts >= 1 and an interval in ms');
  }
}

/**
 * @param {{component: {role: string, host: string, containerId: string},
 *   sshRun: Function, opts: Object, sleep: Function, now?: Function,
 *   attempts: number, intervalMs: number, observeComponentReady: Function,
 *   userOperation: Function}} input observeComponentReady answers
 *   {ready, evidence}; userOperation answers {ok, evidence}
 * @return {Promise<Object>}
 */
async function measureComponentRecovery({component, sshRun, opts, sleep, now = Date.now,
  attempts, intervalMs, observeComponentReady, userOperation}) {
  requirePollPlan(attempts, intervalMs);
  const interruptedAt = now();
  try {
    await sshRun(component.host, opts,
      `docker restart -t ${RESTART_GRACE_SECONDS} ${shellWord(component.containerId)}`);
  } catch (error) {
    return notMeasured(component, NOT_MEASURED_REASON.INTERRUPT_FAILED, errorText(error));
  }
  const readiness = await awaitComponentReady({component, attempts, intervalMs, sleep,
    observeComponentReady});
  if (readiness.ready !== true) {
    return notMeasured(component, NOT_MEASURED_REASON.COMPONENT_NOT_RECOVERED,
      readiness.evidence);
  }
  const recoveredAt = now();
  const operation = await observeOnce(userOperation, component, 'ok');
  if (operation.ok !== true) {
    return notMeasured(component, NOT_MEASURED_REASON.USER_OPERATION_FAILED, operation.evidence);
  }
  return {claim: 'recovery', status: CLAIM_STATUS.OBSERVED, component,
    interruption: 'container-restart',
    interruptedAt: new Date(interruptedAt).toISOString(),
    recoveredAt: new Date(recoveredAt).toISOString(),
    recoveryMs: recoveredAt - interruptedAt,
    readiness: readiness.evidence,
    userOperation: {ok: true, evidence: operation.evidence}};
}

export {measureComponentRecovery};
