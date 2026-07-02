
const LOCAL_STR_CURRENT = 'current';
const LOCAL_STR_IDENTITY_MISMATCH = 'identity_mismatch';
const LOCAL_STR_NOT_REQUIRED = 'not_required';
const LOCAL_STR_PEER_PROOF_MISSING = 'peer_proof_missing';
const LOCAL_STR_MATCHED = 'matched';
const LOCAL_STR_MISMATCHED = 'mismatched';
const LOCAL_STR_UNOBSERVED = 'unobserved';
const LOCAL_STR_ABSENT = 'absent';
const LOCAL_STR_PRESENT = 'present';
const LOCAL_STR_MISSING = 'missing';
const LOCAL_STR_RECOVERED = 'recovered';
const LOCAL_STR_CLUSTER_INCARNATION_IDENTITY_MISMATCH = 'cluster_incarnation_identity_mismatch';
const LOCAL_STR_CLUSTER_INCARNATION_PEER_PROOF_MISSING = 'cluster_incarnation_peer_proof_missing';

export const CLUSTER_INCARNATION_FENCE_STATE = Object.freeze({
  CURRENT: LOCAL_STR_CURRENT,
  IDENTITY_MISMATCH: LOCAL_STR_IDENTITY_MISMATCH,
  NOT_REQUIRED: LOCAL_STR_NOT_REQUIRED,
  PEER_PROOF_MISSING: LOCAL_STR_PEER_PROOF_MISSING,
});

export const CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE = Object.freeze({
  MATCHED: LOCAL_STR_MATCHED,
  MISMATCHED: LOCAL_STR_MISMATCHED,
  UNOBSERVED: LOCAL_STR_UNOBSERVED,
});

export const CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE = Object.freeze({
  ABSENT: LOCAL_STR_ABSENT,
  PRESENT: LOCAL_STR_PRESENT,
});

export const CLUSTER_INCARNATION_PEER_PROOF_STATE = Object.freeze({
  MISSING: LOCAL_STR_MISSING,
  NOT_REQUIRED: LOCAL_STR_NOT_REQUIRED,
  RECOVERED: LOCAL_STR_RECOVERED,
});

export const CLUSTER_INCARNATION_FENCE_REASON = Object.freeze({
  IDENTITY_MISMATCH: LOCAL_STR_CLUSTER_INCARNATION_IDENTITY_MISMATCH,
  PEER_PROOF_MISSING: LOCAL_STR_CLUSTER_INCARNATION_PEER_PROOF_MISSING,
});

function normalizeDistinctReasonCodes(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          typeof value === 'string' ? value.trim() : '')
        .filter((value) => value.length > 0),
    )],
  );
}

function resolveLocalIdentityState(options = {}) {
  if (options.durableStateDetected !== true) {
    return CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE.UNOBSERVED;
  }
  return options.localIdentityMatched === true ?
    CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE.MATCHED :
    CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE.MISMATCHED;
}

function resolvePeerProofState(options = {}) {
  if (options.peerProofRequired !== true || options.durableStateDetected !== true) {
    return CLUSTER_INCARNATION_PEER_PROOF_STATE.NOT_REQUIRED;
  }
  return Array.isArray(options.peerAddresses) &&
    options.peerAddresses.length > 0 ?
    CLUSTER_INCARNATION_PEER_PROOF_STATE.RECOVERED :
    CLUSTER_INCARNATION_PEER_PROOF_STATE.MISSING;
}

export function buildClusterIncarnationFence(options = {}) {
  const durableStateDetected = options.durableStateDetected === true;
  const localIdentityState = resolveLocalIdentityState(options);
  const durableMembershipState = durableStateDetected === true ?
    CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE.PRESENT :
    CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE.ABSENT;
  const peerProofState = resolvePeerProofState({
    durableStateDetected,
    peerProofRequired: options.peerProofRequired === true,
    peerAddresses: options.peerAddresses,
  });
  const reasonCodes = [];

  if (durableStateDetected !== true) {
    return Object.freeze({
      state: CLUSTER_INCARNATION_FENCE_STATE.NOT_REQUIRED,
      allowed: true,
      reasonCodes: Object.freeze([]),
      localIdentityState,
      durableMembershipState,
      peerProofState,
    });
  }

  if (localIdentityState ===
    CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE.MISMATCHED) {
    reasonCodes.push(CLUSTER_INCARNATION_FENCE_REASON.IDENTITY_MISMATCH);
    return Object.freeze({
      state: CLUSTER_INCARNATION_FENCE_STATE.IDENTITY_MISMATCH,
      allowed: false,
      reasonCodes: normalizeDistinctReasonCodes(reasonCodes),
      localIdentityState,
      durableMembershipState,
      peerProofState,
    });
  }

  if (peerProofState === CLUSTER_INCARNATION_PEER_PROOF_STATE.MISSING) {
    reasonCodes.push(CLUSTER_INCARNATION_FENCE_REASON.PEER_PROOF_MISSING);
    return Object.freeze({
      state: CLUSTER_INCARNATION_FENCE_STATE.PEER_PROOF_MISSING,
      allowed: false,
      reasonCodes: normalizeDistinctReasonCodes(reasonCodes),
      localIdentityState,
      durableMembershipState,
      peerProofState,
    });
  }

  return Object.freeze({
    state: CLUSTER_INCARNATION_FENCE_STATE.CURRENT,
    allowed: true,
    reasonCodes: Object.freeze([]),
    localIdentityState,
    durableMembershipState,
    peerProofState,
  });
}
