import {CDC_PIPELINE_READINESS_TIMEOUT_MS} from
  '../constants/cdc-lifecycle-constants.js';
import {
  captureCdcCoverageToken,
  isCurrentCdcCoverageLifecycle,
  registerCdcCoverageLifecycleCleanup,
} from './cdc-coverage-lifecycle-owner.js';
import {registerCdcCoverageTransferWake} from
  './cdc-coverage-transfer-owner.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const CDC_COVERAGE_RECONCILE_STATE = Object.freeze({
  COMPLETE: 'complete',
  FAILED: 'failed',
  RETIRED: 'retired',
  SPENT: 'spent',
});
const CDC_COVERAGE_RECONCILE_REASON = Object.freeze({
  DEADLINE: 'cdc_coverage_reconcile_deadline_spent',
  IDENTITY_INVALID: 'cdc_coverage_reconcile_identity_invalid',
  LIFECYCLE_STALE: 'cdc_coverage_reconcile_lifecycle_stale',
  OUTCOME_INVALID: 'cdc_coverage_reconcile_outcome_invalid',
  SHUTDOWN: 'cdc_coverage_reconcile_shutdown',
});
const CDC_COVERAGE_RECONCILE_WAIT = Object.freeze({
  AWAITED: 'complete authoritative CDC coverage publication',
  OWNER: 'CDC_COVERAGE_RECONCILE_DEFAULT.WINDOW_MS',
});
const CDC_COVERAGE_RECONCILE_DEFAULT = Object.freeze({
  COOLDOWN_INITIAL_MS: 1000,
  COOLDOWN_MAX_MS: 30000,
  RETRY_MAX_MS: 1000,
  RETRY_MIN_MS: 100,
  WINDOW_MS: CDC_PIPELINE_READINESS_TIMEOUT_MS,
});
const owners = new WeakMap();

function exactIdentity(request) {
  return request && typeof request.partitionId === 'string' &&
    request.partitionId.length > 0 && typeof request.tableName === 'string' &&
    request.tableName.length > 0;
}

function reconcileKey(request) {
  return `${request.partitionId}\u0000${request.tableName}`;
}

function frozenOutcome(state, reasonCode, extra = {}) {
  return Object.freeze({state, success: state ===
    CDC_COVERAGE_RECONCILE_STATE.COMPLETE, reasonCode, ...extra});
}

function clampCdcCoverageBackoff(remaining, requested) {
  if (!Number.isFinite(remaining) || remaining <
      CDC_COVERAGE_RECONCILE_DEFAULT.RETRY_MIN_MS) return null;
  const requestedMs = Number.isFinite(requested) && requested > 0 ?
    Math.floor(requested) : CDC_COVERAGE_RECONCILE_DEFAULT.RETRY_MIN_MS;
  return Math.min(remaining, CDC_COVERAGE_RECONCILE_DEFAULT.RETRY_MAX_MS,
    Math.max(CDC_COVERAGE_RECONCILE_DEFAULT.RETRY_MIN_MS, requestedMs));
}

function clearTimer(service, timer) {
  if (timer !== null) service.timeSource.clearTimeout(timer);
}

function unrefTimer(timer) {
  timer?.unref?.();
  return timer;
}

function reportDebt(owner, debt, reason, generation = debt.generation) {
  reportWaitBoundSpent(owner.service.logger, {
    wait: CDC_COVERAGE_RECONCILE_WAIT.OWNER,
    awaited: CDC_COVERAGE_RECONCILE_WAIT.AWAITED,
    subject: `${debt.tableName}@${debt.partitionId}`,
    boundMs: debt.windowMs,
    elapsedMs: debt.windowMs,
    lastObserved: {reason, attempts: debt.attempts,
      generationId: generation?.id ?? null,
      lastOutcome: debt.lastOutcome},
    scope: {nodeId: owner.service.nodeId,
      tableName: debt.tableName, partitionId: debt.partitionId,
      generationId: generation?.id ?? null},
  });
}

function retireGeneration(service, generation) {
  if (!generation || generation.retired) return;
  generation.retired = true;
  clearTimer(service, generation.deadlineTimer);
  clearTimer(service, generation.backoffTimer);
  generation.deadlineTimer = null;
  generation.backoffTimer = null;
  generation.release?.({retired: true});
  generation.release = null;
}

function retireDebt(owner, debt) {
  retireGeneration(owner.service, debt.generation);
  clearTimer(owner.service, debt.cooldownTimer);
  debt.cooldownTimer = null;
  debt.retired = true;
}

function retireOwner(owner) {
  if (owner.retired) return;
  owner.retired = true;
  for (const debt of owner.debts.values()) {
    reportDebt(owner, debt, CDC_COVERAGE_RECONCILE_REASON.SHUTDOWN);
    retireDebt(owner, debt);
  }
  owner.debts.clear();
  owner.unregisterTransferWake?.();
  owner.unregisterTransferWake = null;
}

function ownerFor(service) {
  const existing = owners.get(service);
  if (existing && isCurrentCdcCoverageLifecycle(existing.lifecycle)) {
    return existing;
  }
  if (existing) retireOwner(existing);
  const lifecycle = captureCdcCoverageToken(service);
  if (lifecycle === null) return null;
  const owner = {service, lifecycle, debts: new Map(), retired: false,
    unregister: null, unregisterTransferWake: null};
  owner.unregister = registerCdcCoverageLifecycleCleanup(service,
    () => retireOwner(owner));
  owner.unregisterTransferWake = registerCdcCoverageTransferWake(service,
    () => wakeAllCdcCoverageReconciles(service));
  owners.set(service, owner);
  return owner;
}

function remainingMs(owner, generation) {
  return Math.max(0, Math.floor(
    generation.deadlineMs - owner.service.timeSource.now()));
}

function generationIsCurrent(owner, debt, generation) {
  return !owner.retired && !debt.retired && !generation.retired &&
    debt.generation === generation &&
    isCurrentCdcCoverageLifecycle(owner.lifecycle);
}

function debtIsCurrent(owner, debt) {
  return !owner.retired && !debt.retired &&
    owner.debts.get(debt.key) === debt &&
    isCurrentCdcCoverageLifecycle(owner.lifecycle);
}

function deadlineSignal(owner, generation) {
  return new Promise((resolve) => {
    generation.release = resolve;
    generation.deadlineTimer = unrefTimer(
      owner.service.timeSource.setTimeout(() => {
        generation.expired = true;
        generation.release = null;
        resolve({deadline: true});
      }, remainingMs(owner, generation)));
  });
}

function backoffSignal(owner, generation, delayMs) {
  return new Promise((resolve) => {
    generation.backoffTimer = unrefTimer(
      owner.service.timeSource.setTimeout(() => {
        generation.backoffTimer = null;
        resolve({retry: true});
      }, delayMs));
  });
}

function validAttemptOutcome(result) {
  return result && typeof result === 'object' &&
    (result.success === true || result.deferRetry === true ||
      result.success === false);
}

function attemptContext(owner, debt, generation) {
  return Object.freeze({
    deadlineMs: generation.deadlineMs,
    generationId: generation.id,
    lifecycle: owner.lifecycle,
    partitionId: debt.partitionId,
    tableName: debt.tableName,
    isCurrent: () => generationIsCurrent(owner, debt, generation),
    remainingMs: () => remainingMs(owner, generation),
  });
}

async function executeAttempt(owner, debt, generation) {
  debt.attempts += 1;
  try {
    return await debt.execute(attemptContext(owner, debt, generation));
  } catch (error) {
    return {success: false, deferRetry: false,
      reasonCode: error?.code || error?.message || String(error)};
  }
}

function spentOutcome(debt, generation) {
  return frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.SPENT,
    CDC_COVERAGE_RECONCILE_REASON.DEADLINE, {
      generationId: generation.id, attempts: debt.attempts,
      deadlineMs: generation.deadlineMs,
      lastOutcome: debt.lastOutcome,
    });
}

function decideValidAttempt(owner, debt, generation, settled) {
  debt.lastOutcome = settled.reasonCode ?? settled.reason ??
    (settled.success === true ? CDC_COVERAGE_RECONCILE_STATE.COMPLETE : null);
  if (settled.success === true) {
    debt.consecutiveSpent = 0;
    return {outcome: frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.COMPLETE, null,
      {generationId: generation.id, value: settled})};
  } else if (settled.deferRetry !== true) {
    return {outcome: frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.FAILED,
      debt.lastOutcome, {generationId: generation.id, value: settled})};
  }
  return {backoffMs: clampCdcCoverageBackoff(remainingMs(owner, generation),
    settled.retryAfterMs)};
}

function decideAttempt(owner, debt, generation, settled) {
  if (!generationIsCurrent(owner, debt, generation)) {
    return {outcome: frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.RETIRED,
      CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE)};
  } else if (!validAttemptOutcome(settled)) {
    debt.lastOutcome = CDC_COVERAGE_RECONCILE_REASON.OUTCOME_INVALID;
    return {outcome: frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.FAILED,
      CDC_COVERAGE_RECONCILE_REASON.OUTCOME_INVALID)};
  }
  return decideValidAttempt(owner, debt, generation, settled);
}

async function runGeneration(owner, debt, generation) {
  const deadline = deadlineSignal(owner, generation);
  while (generationIsCurrent(owner, debt, generation)) {
    if (remainingMs(owner, generation) <= 0) break;
    const attempt = executeAttempt(owner, debt, generation);
    const settled = await Promise.race([attempt, deadline]);
    if (settled?.deadline === true) break;
    const decision = decideAttempt(owner, debt, generation, settled);
    if (decision.outcome) return decision.outcome;
    if (decision.backoffMs === null) {
      await deadline;
      break;
    }
    const retried = await Promise.race([
      backoffSignal(owner, generation, decision.backoffMs), deadline]);
    if (retried?.deadline === true) break;
  }
  return generationIsCurrent(owner, debt, generation) ?
    spentOutcome(debt, generation) :
    frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.RETIRED,
      CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE);
}

function cooldownMs(debt) {
  const exponent = Math.max(0, debt.consecutiveSpent - 1);
  return Math.min(CDC_COVERAGE_RECONCILE_DEFAULT.COOLDOWN_MAX_MS,
    CDC_COVERAGE_RECONCILE_DEFAULT.COOLDOWN_INITIAL_MS * (2 ** exponent));
}

function scheduleCooldown(owner, debt) {
  clearTimer(owner.service, debt.cooldownTimer);
  debt.cooldownTimer = unrefTimer(owner.service.timeSource.setTimeout(() => {
    debt.cooldownTimer = null;
    if (debtIsCurrent(owner, debt)) startGeneration(owner, debt);
  }, cooldownMs(debt)));
}

function generationFinished(owner, debt, generation, outcome) {
  retireGeneration(owner.service, generation);
  if (debt.generation !== generation || debt.retired) return outcome;
  debt.inFlight = null;
  if (outcome.state === CDC_COVERAGE_RECONCILE_STATE.COMPLETE) {
    owner.debts.delete(debt.key);
    retireDebt(owner, debt);
  } else if (outcome.state === CDC_COVERAGE_RECONCILE_STATE.SPENT &&
      isCurrentCdcCoverageLifecycle(owner.lifecycle)) {
    debt.consecutiveSpent += 1;
    debt.windowsSpent += 1;
    reportDebt(owner, debt, outcome.reasonCode, generation);
    scheduleCooldown(owner, debt);
  }
  return outcome;
}

function startGeneration(owner, debt, deadlineMs = null) {
  if (debt.inFlight) return debt.inFlight;
  const windowDeadline = owner.service.timeSource.now() + debt.windowMs;
  const generation = {id: ++debt.generationSequence,
    deadlineMs: deadlineMs ?? windowDeadline, deadlineTimer: null,
    backoffTimer: null, release: null, retired: false, expired: false};
  debt.generation = generation;
  debt.inFlight = runGeneration(owner, debt, generation)
    .then((outcome) => generationFinished(owner, debt, generation, outcome));
  return debt.inFlight;
}

function armCdcCoverageReconcile(service, request, execute) {
  if (!exactIdentity(request) || typeof execute !== 'function') {
    return Promise.resolve(frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.FAILED,
      CDC_COVERAGE_RECONCILE_REASON.IDENTITY_INVALID));
  }
  const owner = ownerFor(service);
  if (owner === null) {
    return Promise.resolve(frozenOutcome(CDC_COVERAGE_RECONCILE_STATE.RETIRED,
      CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE));
  }
  const key = reconcileKey(request);
  let debt = owner.debts.get(key);
  if (debt) {
    debt.execute = execute;
    if (debt.inFlight) return debt.inFlight;
    clearTimer(service, debt.cooldownTimer);
    debt.cooldownTimer = null;
  } else {
    const windowMs = Number.isFinite(request.windowMs) && request.windowMs > 0 ?
      Math.floor(request.windowMs) : CDC_COVERAGE_RECONCILE_DEFAULT.WINDOW_MS;
    debt = {key, partitionId: request.partitionId, tableName: request.tableName,
      windowMs, execute, generationSequence: 0, generation: null,
      inFlight: null, cooldownTimer: null, consecutiveSpent: 0,
      windowsSpent: 0, attempts: 0, lastOutcome: null, retired: false};
    owner.debts.set(key, debt);
  }
  const requestedDeadline = Number.isFinite(request.deadlineMs) ?
    Math.floor(request.deadlineMs) : null;
  return startGeneration(owner, debt, requestedDeadline);
}

function wakeCdcCoverageReconcile(service, identity) {
  const owner = owners.get(service);
  if (!owner || !exactIdentity(identity)) return false;
  const debt = owner.debts.get(reconcileKey(identity));
  if (!debt || debt.retired || debt.inFlight) return false;
  clearTimer(service, debt.cooldownTimer);
  debt.cooldownTimer = null;
  startGeneration(owner, debt);
  return true;
}

function wakeAllCdcCoverageReconciles(service) {
  const owner = owners.get(service);
  if (!owner || owner.retired) return 0;
  let woken = 0;
  for (const debt of owner.debts.values()) {
    if (debt.retired || debt.inFlight) continue;
    clearTimer(service, debt.cooldownTimer);
    debt.cooldownTimer = null;
    startGeneration(owner, debt);
    woken += 1;
  }
  return woken;
}

function readCdcCoverageReconcileDiagnostics(service) {
  const owner = owners.get(service);
  if (!owner || owner.retired) return Object.freeze([]);
  return Object.freeze([...owner.debts.values()].map((debt) => Object.freeze({
    partitionId: debt.partitionId, tableName: debt.tableName,
    generationId: debt.generation?.id ?? null,
    inFlight: debt.inFlight !== null, cooldownArmed: debt.cooldownTimer !== null,
    consecutiveSpent: debt.consecutiveSpent, windowsSpent: debt.windowsSpent,
    attempts: debt.attempts, lastOutcome: debt.lastOutcome,
  })));
}

export {
  CDC_COVERAGE_RECONCILE_DEFAULT,
  CDC_COVERAGE_RECONCILE_REASON,
  CDC_COVERAGE_RECONCILE_STATE,
  armCdcCoverageReconcile,
  clampCdcCoverageBackoff,
  readCdcCoverageReconcileDiagnostics,
  wakeCdcCoverageReconcile,
  wakeAllCdcCoverageReconciles,
};
