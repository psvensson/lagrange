import {CONTROL_PLANE_PRIORITY_RECOVERY_REASON} from
  './control-plane-readiness-constants.js';

const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const numberIsSafeInteger = Number.isSafeInteger;

function formationReleaseObservedNodeBootMatchesExpected(
  expectedBootIncarnation,
  observedNodeBootIncarnation,
) {
  return numberIsSafeInteger(expectedBootIncarnation) &&
    expectedBootIncarnation > 0 &&
    numberIsSafeInteger(observedNodeBootIncarnation) &&
    observedNodeBootIncarnation >= 0 &&
    (
      observedNodeBootIncarnation === 0 ||
      observedNodeBootIncarnation === expectedBootIncarnation
    );
}

function listIsSubset(values, allowed) {
  for (let index = 0; index < values.length; index += 1) {
    if (!arrayPrototypeIncludes(allowed, values[index])) return false;
  }
  return true;
}

function listsAreDisjoint(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (arrayPrototypeIncludes(right, left[index])) return false;
  }
  return true;
}

function listCoversCohort(readyNodeIds, pendingNodeIds, cohortNodeIds) {
  if (readyNodeIds.length + pendingNodeIds.length !== cohortNodeIds.length) {
    return false;
  }
  for (let index = 0; index < cohortNodeIds.length; index += 1) {
    if (
      !arrayPrototypeIncludes(readyNodeIds, cohortNodeIds[index]) &&
      !arrayPrototypeIncludes(pendingNodeIds, cohortNodeIds[index])
    ) {
      return false;
    }
  }
  return true;
}

function formationReleaseContractListsAreValid(parts) {
  if (parts.canonicalNodeIds === null) return false;
  if (!parts.requiredCohort) return false;
  if (parts.readyNodeIds === null || parts.pendingNodeIds === null) return false;
  if (parts.recoveryReasonCodes === null) return false;
  if (!listIsSubset(parts.cohortNodeIds, parts.canonicalNodeIds)) return false;
  if (!listIsSubset(parts.readyNodeIds, parts.cohortNodeIds)) return false;
  if (!listIsSubset(parts.pendingNodeIds, parts.cohortNodeIds)) return false;
  return listsAreDisjoint(parts.readyNodeIds, parts.pendingNodeIds);
}

function formationReleaseAuthorityReadyFlagIsValid(value) {
  return value === true || value === false || value === null;
}

function activeProjectionIsValid(
  parts,
  allowUnacknowledgedActive,
  reason,
) {
  if (parts.reason !== reason.RETAINED_UNTIL_READY) return false;
  if (parts.active !== true) return false;
  const releaseValid = parts.releaseAuthorized === true ||
    (allowUnacknowledgedActive && parts.releaseAuthorized === false);
  if (!releaseValid) return false;
  if (parts.pendingNodeIds.length > 0) {
    return listCoversCohort(
      parts.readyNodeIds,
      parts.pendingNodeIds,
      parts.cohortNodeIds,
    );
  }
  if (parts.readyNodeIds.length !== parts.cohortNodeIds.length) return false;
  if (!listCoversCohort(
    parts.readyNodeIds,
    parts.pendingNodeIds,
    parts.cohortNodeIds,
  )) return false;
  // READY leases may finish before the first spread reopen.  That state is
  // still ACTIVE: it waits for the causal reopen required by the handoff
  // contract instead of treating readiness alone as terminal authority.
  if (parts.observedAuthorityReady === true) {
    return parts.recoveryReasonCodes.length === 0;
  }
  // The first exact spread reopen and final READY lease can also be one owner
  // observation.  Preserve that causal edge for one evaluation before close.
  return parts.observedAuthorityReady === false &&
    parts.recoveryReasonCodes.length === 1 &&
    parts.recoveryReasonCodes[0] ===
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD;
}

function completeProjectionIsValid(parts, reason) {
  if (parts.reason !== reason.CAPTURED_COHORT_READY) return false;
  if (parts.active !== false || parts.releaseAuthorized !== false) return false;
  if (parts.pendingNodeIds.length !== 0) return false;
  if (parts.readyNodeIds.length !== parts.cohortNodeIds.length) return false;
  return listCoversCohort(
    parts.readyNodeIds,
    parts.pendingNodeIds,
    parts.cohortNodeIds,
  );
}

function revokedProjectionIsValid(parts, reason) {
  const allowedReasons = [
    reason.AUTHORITY_INCOMPATIBLE,
    reason.COHORT_MEMBER_MISSING,
    reason.COHORT_INCARNATION_CHANGED,
    reason.COHORT_MEMBER_INELIGIBLE,
  ];
  if (!arrayPrototypeIncludes(allowedReasons, parts.reason)) return false;
  if (parts.active !== false || parts.releaseAuthorized !== false) return false;
  return parts.readyNodeIds.length === 0 && parts.pendingNodeIds.length === 0;
}

function formationReleaseStateProjectionIsValid(
  parts,
  allowUnacknowledgedActive,
  state,
  reason,
) {
  if (
    parts.pendingTerminalState !== null ||
    parts.pendingTerminalReason !== null
  ) {
    return false;
  }
  if (parts.state === state.ACTIVE) {
    return activeProjectionIsValid(
      parts,
      allowUnacknowledgedActive,
      reason,
    );
  }
  if (parts.state === state.COMPLETE) {
    return completeProjectionIsValid(parts, reason);
  }
  if (parts.state === state.REVOKED) {
    return revokedProjectionIsValid(parts, reason);
  }
  return false;
}

export {
  formationReleaseAuthorityReadyFlagIsValid,
  formationReleaseContractListsAreValid,
  formationReleaseObservedNodeBootMatchesExpected,
  formationReleaseStateProjectionIsValid,
};
