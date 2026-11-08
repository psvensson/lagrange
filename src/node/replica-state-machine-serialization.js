import {
  REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';
import {
  pendingTurn,
  settledTurn,
  turnChainValue,
} from '../raft/raft-rs-turn-answer.js';

function getReplicaRevision(stateMachine, replicaId) {
  return stateMachine.replicaRevisionByReplicaId.get(replicaId) || 0;
}

function captureReplicaAdmission(stateMachine, replicaId) {
  return Object.freeze({
    revision: getReplicaRevision(stateMachine, replicaId),
    sourceState: stateMachine.replicas.get(replicaId)?.state || null,
  });
}

function isReplicaAdmissionCurrent(stateMachine, replicaId, admission) {
  return getReplicaRevision(stateMachine, replicaId) === admission.revision &&
    (stateMachine.replicas.get(replicaId)?.state || null) ===
      admission.sourceState;
}

function advanceReplicaRevision(stateMachine, replicaId) {
  const revision = getReplicaRevision(stateMachine, replicaId) + 1;
  stateMachine.replicaRevisionByReplicaId.set(replicaId, revision);
  return revision;
}

function recordCanonicalLeaderClearSettlement(
  stateMachine,
  replicaId,
  replicaState,
  revision,
) {
  stateMachine.canonicalLeaderClearSettlementByReplicaId.set(
    replicaId,
    Object.freeze({replicaState, revision}),
  );
}

function isCanonicalLeaderClearSettled(
  stateMachine,
  replicaId,
  replicaState = stateMachine.replicas.get(replicaId) || null,
  revision = getReplicaRevision(stateMachine, replicaId),
) {
  const settlement = stateMachine
    .canonicalLeaderClearSettlementByReplicaId.get(replicaId);
  return settlement?.replicaState === replicaState &&
    settlement?.revision === revision;
}

function releaseReplicaMutationTail(stateMachine, replicaId, tail) {
  if (stateMachine.serviceRowPersistInFlightByServiceId.get(replicaId) === tail) {
    stateMachine.serviceRowPersistInFlightByServiceId.delete(replicaId);
  }
}

function observeReplicaMutationTail(stateMachine, replicaId, tail) {
  void tail.then(
    () => releaseReplicaMutationTail(stateMachine, replicaId, tail),
    () => releaseReplicaMutationTail(stateMachine, replicaId, tail),
  );
}

// A mutation refused because the lane no longer admits mutations.
const MUTATION_ADMISSION_CLOSED = settledTurn(false);

function invokeReplicaMutation(stateMachine, action) {
  if (stateMachine.replicaMutationAdmissionClosed === true) {
    return MUTATION_ADMISSION_CLOSED;
  }
  return action();
}

/**
 * Run one mutation in the replica's linearization domain. The first tail is
 * installed before invoking the action, closing synchronous re-entry from a
 * persistence adapter. `action` answers a named turn (raft-rs-turn-answer.js):
 * settled when its mutation completed within the call, pending while it
 * awaits. A settled action keeps the lane synchronous when the lane was
 * idle; a queued action is necessarily pending.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {function(): Object} action - Answers a settled or pending turn.
 * @return {Object} The mutation's turn; settled false when admission is
 *   closed.
 */
function runSerializedReplicaMutation(stateMachine, replicaId, action) {
  if (stateMachine.replicaMutationAdmissionClosed === true) {
    return MUTATION_ADMISSION_CLOSED;
  }
  const tails = stateMachine.serviceRowPersistInFlightByServiceId;
  const previousTail = tails.get(replicaId) || null;
  if (previousTail) {
    const tail = previousTail.catch(() => null).then(() =>
      turnChainValue(invokeReplicaMutation(stateMachine, action)));
    tails.set(replicaId, tail);
    observeReplicaMutationTail(stateMachine, replicaId, tail);
    return pendingTurn(tail);
  }

  let resolveReservation;
  let rejectReservation;
  const reservation = new Promise((resolve, reject) => {
    resolveReservation = resolve;
    rejectReservation = reject;
  });
  tails.set(replicaId, reservation);
  observeReplicaMutationTail(stateMachine, replicaId, reservation);

  let answered;
  try {
    answered = invokeReplicaMutation(stateMachine, action);
  } catch (error) {
    rejectReservation(error);
    releaseReplicaMutationTail(stateMachine, replicaId, reservation);
    return pendingTurn(Promise.reject(error));
  }
  if (answered.settled) {
    resolveReservation(answered.result);
    releaseReplicaMutationTail(stateMachine, replicaId, reservation);
    return answered;
  }
  resolveReservation(answered.pending);
  return pendingTurn(reservation);
}

// The activation effect boundary (owner decision N2): the window from an
// activation's in-lane exact-handler check to the settle of its ACTIVE CAS.
// The activation opens it synchronously at the check, while holding the
// replica's lifecycle lane; handler retirement waits for it. Retirement does
// not wait for unrelated lane work (a queued lifecycle write whose durable
// completion depends on resources being torn down would deadlock shutdown).
function activationEffects(stateMachine) {
  if (!stateMachine.activationEffectByReplicaId) {
    stateMachine.activationEffectByReplicaId = new Map();
  }
  return stateMachine.activationEffectByReplicaId;
}

/**
 * Open the activation effect section; call only in the same synchronous run
 * as the exact-handler check.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @return {Function} Closes the section.
 */
function beginActivationEffect(stateMachine, replicaId) {
  const sections = activationEffects(stateMachine);
  let close;
  const section = new Promise((resolve) => {
    close = resolve;
  });
  sections.set(replicaId, section);
  return () => {
    if (sections.get(replicaId) === section) sections.delete(replicaId);
    close();
  };
}

/**
 * Run an activation's final effect behind the exact handler it depends on:
 * `requireHandler` (throws when the exact handler is not registered) and the
 * section opening run in one synchronous step, and the section stays open
 * until `effect` (the ACTIVE CAS and its lost-ack readback) settles.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {Function} requireHandler - Synchronous exact-handler check.
 * @param {Function} effect - Issues the ACTIVE CAS without a prior await.
 * @return {Promise<*>} The effect's result.
 */
async function runActivationEffectSection(
  stateMachine,
  replicaId,
  requireHandler,
  effect,
) {
  requireHandler();
  const closeEffect = beginActivationEffect(stateMachine, replicaId);
  try {
    return await effect();
  } finally {
    closeEffect();
  }
}

function activationHandlerNotRegisteredError(replicaId) {
  const error = new Error(
    `Replica activation ${REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED}: ` +
    replicaId);
  error.code = REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED;
  error.errorCode = REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED;
  error.deferRetry = false;
  return error;
}

/**
 * The durable effect of one lane-serialized lifecycle transition (owner
 * decision N2, S-F2): a durable ACTIVE for generation G is written only while
 * the exact transport handler of G stays registered. The caller's check
 * (context.isEffectHandlerCurrent) runs in the lane and opens the activation
 * effect section in the same synchronous step, so handler retirement waits
 * for the ACTIVE CAS and its readback. A persisted ACTIVE without the check
 * is refused. Other destinations persist directly.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {string} newState
 * @param {Object} context - Transition context.
 * @param {Function} persist - Issues the durable write without a prior await.
 * @return {*|Promise<*>} The persistence result.
 */
function runPersistedTransitionEffect(
  stateMachine,
  replicaId,
  newState,
  context,
  persist,
) {
  if (newState !== REPLICA_STATE_MACHINE_STATE.ACTIVE) return persist();
  return runActivationEffectSection(stateMachine, replicaId, () => {
    if (typeof context.isEffectHandlerCurrent !== 'function' ||
        context.isEffectHandlerCurrent() !== true) {
      throw activationHandlerNotRegisteredError(replicaId);
    }
  }, persist);
}

/**
 * Run a handler-bound activation in the replica's lifecycle lane: resolve the
 * durable source, then check the exact handler and run the ACTIVE effect in
 * the activation effect section.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {Object} activation - {resolveSource, requireHandler, effect}.
 * @return {*|Promise<*>} The effect's result; false when admission is closed.
 */
function runHandlerBoundActivation(stateMachine, replicaId, activation) {
  const activate = async () => {
    const source = await activation.resolveSource();
    return runActivationEffectSection(stateMachine, replicaId,
      () => activation.requireHandler(source),
      () => activation.effect(source));
  };
  return turnChainValue(runSerializedReplicaMutation(stateMachine, replicaId,
    () => pendingTurn(activate())));
}

/**
 * Retire a replica's transport handler against the activation effect
 * boundary: an activation that confirmed the handler completes its ACTIVE
 * CAS first; one that checks later finds the handler gone. The final check
 * and the removal run in one synchronous step.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {Function} retire - Synchronous handler removal.
 * @return {Promise<boolean>} True once the handler was retired.
 */
async function runReplicaHandlerRetirement(stateMachine, replicaId, retire) {
  const sections = activationEffects(stateMachine);
  while (sections.has(replicaId)) {
    await sections.get(replicaId);
  }
  retire();
  return true;
}

export {
  advanceReplicaRevision,
  captureReplicaAdmission,
  getReplicaRevision,
  isCanonicalLeaderClearSettled,
  isReplicaAdmissionCurrent,
  recordCanonicalLeaderClearSettlement,
  runActivationEffectSection,
  runHandlerBoundActivation,
  runPersistedTransitionEffect,
  runReplicaHandlerRetirement,
  runSerializedReplicaMutation,
};
