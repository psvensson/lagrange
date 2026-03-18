import {LIFECYCLE_EVENT, LIFECYCLE_PHASE} from './lifecycle-controller-constants.js';
import {LIFECYCLE_REASON} from './lifecycle-controller-constants.js';

function getTrafficReadinessSnapshot(readinessState) {
  if (!readinessState || typeof readinessState !== 'object') {
    return null;
  }
  if (typeof readinessState.evaluate === 'function') {
    return readinessState.evaluate();
  }
  if (typeof readinessState.getSnapshot === 'function') {
    return readinessState.getSnapshot();
  }
  return null;
}

function isTrafficReady(readinessState) {
  const snapshot = getTrafficReadinessSnapshot(readinessState);
  return Boolean(
    snapshot &&
    snapshot.ready === true &&
    snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY,
  );
}

function isBackgroundWorkReady(readinessState) {
  if (!readinessState || typeof readinessState !== 'object') {
    return true;
  }
  return isTrafficReady(readinessState);
}

function isMetadataPublicationReady(readinessState) {
  const snapshot = getTrafficReadinessSnapshot(readinessState);
  if (!snapshot || snapshot.draining === true) {
    return false;
  }

  const reasons = Array.isArray(snapshot.reasons) ?
    snapshot.reasons.filter((reason) => typeof reason === 'string' && reason.length > 0) :
    [];

  if (snapshot.ready === true &&
      snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY) {
    return true;
  }

  if (snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY) {
    return reasons.length > 0 &&
      reasons.every((reason) => reason === LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE);
  }

  if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
    return reasons.length === 1 &&
      reasons[0] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
  }

  return false;
}

function attachTrafficReadinessListener(readinessState, listener) {
  if (!readinessState || typeof listener !== 'function') {
    return () => {};
  }
  if (typeof readinessState.on !== 'function') {
    return () => {};
  }
  const removeListener =
    typeof readinessState.off === 'function' ?
      readinessState.off.bind(readinessState) :
      (typeof readinessState.removeListener === 'function' ?
        readinessState.removeListener.bind(readinessState) :
        null);
  if (!removeListener) {
    return () => {};
  }
  readinessState.on(LIFECYCLE_EVENT.TRANSITION, listener);
  return () => {
    removeListener(LIFECYCLE_EVENT.TRANSITION, listener);
  };
}

export {
  attachTrafficReadinessListener,
  isBackgroundWorkReady,
  getTrafficReadinessSnapshot,
  isMetadataPublicationReady,
  isTrafficReady,
};
