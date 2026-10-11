const CURRENT = new WeakMap();

function publishParticipantReleaseLocalCurrent(service, authorizationId, target,
  controlOwner = null) {
  CURRENT.set(service, Object.freeze({authorizationId, target, controlOwner}));
}

function readParticipantReleaseLocalCurrent(service) {
  return CURRENT.get(service) ?? null;
}

function invalidateParticipantReleaseLocalCurrent(service) {
  CURRENT.delete(service);
}

export {invalidateParticipantReleaseLocalCurrent,
  publishParticipantReleaseLocalCurrent, readParticipantReleaseLocalCurrent};
