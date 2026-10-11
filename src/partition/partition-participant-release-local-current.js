const CURRENT = new WeakMap();
const RETIREMENTS = new WeakMap();

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

function retainParticipantReleaseLocalRetirement(service, request) {
  const existing = RETIREMENTS.get(service);
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(request)) {
    throw new Error('Participant release retirement identity changed');
  }
  const retained = existing ?? Object.freeze(request);
  RETIREMENTS.set(service, retained);
  return retained;
}

function readParticipantReleaseLocalRetirement(service) {
  return RETIREMENTS.get(service) ?? null;
}

function clearParticipantReleaseLocalRetirement(service, request) {
  if (RETIREMENTS.get(service) === request) RETIREMENTS.delete(service);
}

export {clearParticipantReleaseLocalRetirement,
  invalidateParticipantReleaseLocalCurrent,
  publishParticipantReleaseLocalCurrent, readParticipantReleaseLocalCurrent,
  readParticipantReleaseLocalRetirement, retainParticipantReleaseLocalRetirement};
