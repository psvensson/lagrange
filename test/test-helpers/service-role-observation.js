// Component fixture input is the desired SERVICE participation role, not a
// native StateRole. The native membership/recovery tests independently prove
// these shapes against real applied configurations. This supplies no committed
// membership read, native admission, or lifecycle tenure.
const OBSERVATION_BY_SERVICE_ROLE = Object.freeze({
  'leader': {role: 'leader', membership: 'voter', gateOpen: true},
  'follower': {role: 'follower', membership: 'voter', gateOpen: true},
  'candidate': {role: 'candidate', membership: 'voter', gateOpen: true},
  'pre-candidate': {role: 'pre-candidate', membership: 'voter', gateOpen: true},
  'learner': {role: 'follower', membership: 'learner', gateOpen: false},
});

function serviceRoleObservation(serviceRole, term = 1) {
  if (!Object.hasOwn(OBSERVATION_BY_SERVICE_ROLE, serviceRole)) {
    throw new Error(`Unspecified fixture service role: ${serviceRole}`);
  }
  return Object.freeze({outcome: 'CORE_OK', ...OBSERVATION_BY_SERVICE_ROLE[serviceRole], term});
}

export {serviceRoleObservation};
