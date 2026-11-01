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
const DEFAULT_INTERVAL_MS = 1000;

function notMeasured(component, reason, evidence) {
  return {claim: 'recovery', status: CLAIM_STATUS.NOT_MEASURED, reason, component, evidence};
}

/**
 * @param {{component: {role: string, host: string, containerId: string},
 *   sshRun: Function, opts: Object, sleep: Function, now?: Function,
 *   attempts: number, intervalMs?: number, observeComponentReady: Function,
 *   userOperation: Function}} input
 * @return {Promise<Object>}
 */
async function measureComponentRecovery({component, sshRun, opts, sleep, now = Date.now,
  attempts, intervalMs = DEFAULT_INTERVAL_MS, observeComponentReady, userOperation}) {
  const interruptedAt = now();
  try {
    await sshRun(component.host, opts,
      `docker restart -t ${RESTART_GRACE_SECONDS} ${shellWord(component.containerId)}`);
  } catch (error) {
    return notMeasured(component, NOT_MEASURED_REASON.INTERRUPT_FAILED, errorText(error));
  }
  let readiness = null;
  for (let attempt = 1; attempt <= attempts && readiness?.ready !== true; attempt += 1) {
    try {
      readiness = await observeComponentReady(component);
    } catch (error) {
      readiness = {ready: false, evidence: errorText(error)};
    }
    if (readiness?.ready !== true && attempt < attempts) await sleep(intervalMs);
  }
  if (readiness?.ready !== true) {
    return notMeasured(component, NOT_MEASURED_REASON.COMPONENT_NOT_RECOVERED,
      readiness?.evidence ?? null);
  }
  const recoveredAt = now();
  let operation;
  try {
    operation = await userOperation(component);
  } catch (error) {
    operation = {ok: false, evidence: errorText(error)};
  }
  if (operation?.ok !== true) {
    return notMeasured(component, NOT_MEASURED_REASON.USER_OPERATION_FAILED,
      operation?.evidence ?? null);
  }
  return {claim: 'recovery', status: CLAIM_STATUS.OBSERVED, component,
    interruption: 'container-restart',
    interruptedAt: new Date(interruptedAt).toISOString(),
    recoveredAt: new Date(recoveredAt).toISOString(),
    recoveryMs: recoveredAt - interruptedAt,
    readiness: readiness.evidence ?? null,
    userOperation: {ok: true, evidence: operation.evidence ?? null}};
}

export {NOT_MEASURED_REASON as RECOVERY_NOT_MEASURED_REASON, measureComponentRecovery};
