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

function isPromiseLike(value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function';
}

function invokeReplicaMutation(stateMachine, action) {
  if (stateMachine.replicaMutationAdmissionClosed === true) {
    return false;
  }
  return action();
}

/**
 * Run one mutation in the replica's linearization domain. The first tail is
 * installed before invoking the action, closing synchronous re-entry from a
 * persistence adapter. A synchronous action stays synchronous when the lane
 * was idle; queued actions are necessarily awaitable.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {Function} action
 * @return {*|Promise<*>}
 */
function runSerializedReplicaMutation(stateMachine, replicaId, action) {
  if (stateMachine.replicaMutationAdmissionClosed === true) {
    return false;
  }
  const tails = stateMachine.serviceRowPersistInFlightByServiceId;
  const previousTail = tails.get(replicaId) || null;
  if (previousTail) {
    const tail = previousTail.catch(() => null).then(() =>
      invokeReplicaMutation(stateMachine, action));
    tails.set(replicaId, tail);
    observeReplicaMutationTail(stateMachine, replicaId, tail);
    return tail;
  }

  let resolveReservation;
  let rejectReservation;
  const reservation = new Promise((resolve, reject) => {
    resolveReservation = resolve;
    rejectReservation = reject;
  });
  tails.set(replicaId, reservation);
  observeReplicaMutationTail(stateMachine, replicaId, reservation);

  let result;
  try {
    result = invokeReplicaMutation(stateMachine, action);
  } catch (error) {
    rejectReservation(error);
    releaseReplicaMutationTail(stateMachine, replicaId, reservation);
    return Promise.reject(error);
  }
  resolveReservation(result);
  if (!isPromiseLike(result)) {
    releaseReplicaMutationTail(stateMachine, replicaId, reservation);
    return result;
  }
  return reservation;
}

/**
 * Retire a replica's transport handler inside the replica's linearization
 * domain (owner decision N2): an activation that confirmed the exact handler
 * and wrote ACTIVE in this lane completes before the handler is removed, and
 * one that runs later sees it gone. Once admission is closed (shutdown drain)
 * no new activation can start; the retirement waits for the replica's
 * already-invoked mutation before removing the handler.
 * @param {Object} stateMachine
 * @param {string} replicaId
 * @param {Function} retire - Synchronous handler removal.
 * @return {Promise<boolean>} True once the handler was retired.
 */
async function runReplicaHandlerRetirement(stateMachine, replicaId, retire) {
  const retireInLane = () => {
    retire();
    return true;
  };
  if (await runSerializedReplicaMutation(stateMachine, replicaId,
    retireInLane) === true) {
    return true;
  }
  await stateMachine.serviceRowPersistInFlightByServiceId.get(replicaId)
    ?.catch(() => null);
  return retireInLane();
}

export {
  advanceReplicaRevision,
  captureReplicaAdmission,
  getReplicaRevision,
  isCanonicalLeaderClearSettled,
  isReplicaAdmissionCurrent,
  recordCanonicalLeaderClearSettlement,
  runReplicaHandlerRetirement,
  runSerializedReplicaMutation,
};
