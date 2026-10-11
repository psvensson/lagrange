const CURRENT = new WeakMap();
const RETIREMENTS = new WeakMap();

function retirementObligationOf(current) {
  return current === null || current?.controlOwner === null ? null : Object.freeze({
    version: 1,
    authorizationId: current.authorizationId,
    retiredTarget: current.target,
    controlOwner: current.controlOwner,
  });
}

function publishParticipantReleaseLocalCurrent(service, authorizationId, target,
  controlOwner = null) {
  CURRENT.set(service, Object.freeze({authorizationId, target, controlOwner}));
}

function readParticipantReleaseLocalCurrent(service) {
  return CURRENT.get(service) ?? null;
}

function invalidateParticipantReleaseLocalCurrent(service) {
  const current = CURRENT.get(service) ?? null;
  const obligation = retirementObligationOf(current);
  const retained = RETIREMENTS.get(service);
  if (obligation !== null && retained === undefined) {
    RETIREMENTS.set(service, obligation);
  } else if (obligation !== null && JSON.stringify(retained) !== JSON.stringify(obligation)) {
    throw new Error('Participant release retirement identity changed');
  }
  CURRENT.delete(service);
}

function retainParticipantReleaseLocalRetirement(service, current) {
  const request = retirementObligationOf(current);
  if (request === null) throw new Error('Participant release retirement owner unavailable');
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
