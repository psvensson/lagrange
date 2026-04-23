import {NUM, TYPEOF} from '../constants/index.js';

export const CLUSTER_INCARNATION_FENCE_STATE = Object.freeze({
  CURRENT: 'current',
  IDENTITY_MISMATCH: 'identity_mismatch',
  NOT_REQUIRED: 'not_required',
  PEER_PROOF_MISSING: 'peer_proof_missing',
});

export const CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE = Object.freeze({
  MATCHED: 'matched',
  MISMATCHED: 'mismatched',
  UNOBSERVED: 'unobserved',
});

export const CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE = Object.freeze({
  ABSENT: 'absent',
  PRESENT: 'present',
});

export const CLUSTER_INCARNATION_PEER_PROOF_STATE = Object.freeze({
  MISSING: 'missing',
  NOT_REQUIRED: 'not_required',
  RECOVERED: 'recovered',
});

export const CLUSTER_INCARNATION_FENCE_REASON = Object.freeze({
  IDENTITY_MISMATCH: 'cluster_incarnation_identity_mismatch',
  PEER_PROOF_MISSING: 'cluster_incarnation_peer_proof_missing',
});

function normalizeDistinctReasonCodes(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          typeof value === TYPEOF.STRING ? value.trim() : '')
        .filter((value) => value.length > NUM.ZERO),
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
    options.peerAddresses.length > NUM.ZERO ?
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
