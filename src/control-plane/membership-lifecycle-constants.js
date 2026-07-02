const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';

const MEMBERSHIP_LIFECYCLE_STATE = Object.freeze({
  ABSENT: 'absent',
  ADMITTED: 'admitted',
  PROVISIONING: 'provisioning',
  CAUGHT_UP: 'caught_up',
  PUBLISH_PENDING: 'publish_pending',
  PUBLISHED_ACTIVE: 'published_active',
  DRAINING: 'draining',
  REMOVED: 'removed',
});

const MEMBERSHIP_MEMBER_STATE = Object.freeze({
  JOINING: 'joining',
  CATCHING_UP: 'catching_up',
  SERVING: 'serving',
  DRAINING: 'draining',
  UNREACHABLE: 'unreachable',
  RETIRED: 'retired',
});

const NODE_PARTICIPATION_STATE = Object.freeze({
  INACTIVE: 'inactive',
  JOINING: 'joining',
  CATCHING_UP: 'catching_up',
  OBSERVED_PENDING_PUBLISH: 'observed_pending_publish',
  RECOVERY_PENDING_PUBLISH: 'recovery_pending_publish',
  PUBLISHED_ACTIVE: 'published_active',
  SUSPECTED: 'suspected',
  DRAINING: 'draining',
  RETIRED: 'retired',
});

const NODE_PARTICIPATION_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
});

const NODE_RUNTIME_PARTICIPATION_STATE = Object.freeze({
  INACTIVE: 'inactive',
  JOINING: 'joining',
  RECOVERING: 'recovering',
  PUBLISHED_ACTIVE: 'published_active',
  SUSPECTED: 'suspected',
  DRAINING: 'draining',
  RETIRED: 'retired',
  BLOCKED: 'blocked',
});

const NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD = Object.freeze({
  ADMISSION_STATE: 'admissionState',
  LIFECYCLE_STATE: 'lifecycleState',
  MEMBER_STATE: 'memberState',
  PARTICIPATION_STATE: 'participationState',
  RECOVERY_PROTOCOL_STATE: 'recoveryProtocolState',
});

const RECOVERY_PROTOCOL_STATE = Object.freeze({
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
  PUBLICATION_PENDING: 'publication_pending',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  STEADY_PUBLISHED: 'steady_published',
});

const NODE_RUNTIME_PARTICIPATION_STATE_RULES = Object.freeze([
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.BLOCKED,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.ADMISSION_STATE,
        [NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.RETIRED,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.LIFECYCLE_STATE,
        [MEMBERSHIP_LIFECYCLE_STATE.REMOVED],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.RETIRED],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [NODE_PARTICIPATION_STATE.RETIRED],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.DRAINING,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.LIFECYCLE_STATE,
        [MEMBERSHIP_LIFECYCLE_STATE.DRAINING],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.DRAINING],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [NODE_PARTICIPATION_STATE.DRAINING],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.SUSPECTED,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.UNREACHABLE],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [NODE_PARTICIPATION_STATE.SUSPECTED],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.PUBLISHED_ACTIVE,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.LIFECYCLE_STATE,
        [MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.SERVING],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.RECOVERING,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.LIFECYCLE_STATE,
        [
          MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP,
          MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        ],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.CATCHING_UP],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [
          NODE_PARTICIPATION_STATE.CATCHING_UP,
          NODE_PARTICIPATION_STATE.OBSERVED_PENDING_PUBLISH,
          NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH,
        ],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.RECOVERY_PROTOCOL_STATE,
        [
          RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        ],
      ),
    ],
  ),
  buildNodeRuntimeParticipationRule(
    NODE_RUNTIME_PARTICIPATION_STATE.JOINING,
    [
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.LIFECYCLE_STATE,
        [
          MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
          MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
        ],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.MEMBER_STATE,
        [MEMBERSHIP_MEMBER_STATE.JOINING],
      ),
      buildNodeRuntimeParticipationSignal(
        NODE_RUNTIME_PARTICIPATION_EVIDENCE_FIELD.PARTICIPATION_STATE,
        [NODE_PARTICIPATION_STATE.JOINING],
      ),
    ],
  ),
]);

const MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS = Object.freeze({
  [MEMBERSHIP_LIFECYCLE_STATE.ABSENT]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.ADMITTED]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
    MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP,
    MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
    MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
    MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
    MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
    MEMBERSHIP_LIFECYCLE_STATE.DRAINING,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.DRAINING]: Object.freeze([
    MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
    MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
  ]),
  [MEMBERSHIP_LIFECYCLE_STATE.REMOVED]: Object.freeze([]),
});

const MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY = Object.freeze({
  NONE: 'none',
  PUBLICATION_PENDING: 'publication_pending',
  PUBLISHED_MEMBERSHIP: 'published_membership',
});

function normalizeMembershipLifecycleState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(MEMBERSHIP_LIFECYCLE_STATE).includes(normalized) ?
    normalized :
    null;
}

function normalizeMembershipLifecycleEpochBoundary(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY).includes(
    normalized,
  ) ?
    normalized :
    null;
}

function normalizeMembershipMemberState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(MEMBERSHIP_MEMBER_STATE).includes(normalized) ?
    normalized :
    null;
}

function normalizeNodeParticipationState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(NODE_PARTICIPATION_STATE).includes(normalized) ?
    normalized :
    null;
}

function normalizeNodeParticipationAdmissionState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(NODE_PARTICIPATION_ADMISSION_STATE).includes(normalized) ?
    normalized :
    NODE_PARTICIPATION_ADMISSION_STATE.UNAVAILABLE;
}

function normalizeRecoveryProtocolState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(RECOVERY_PROTOCOL_STATE).includes(normalized) ?
    normalized :
    null;
}

function normalizeNodeIdList(values = []) {
  return normalizeStringList(values);
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].sort();
}

function normalizeStringMap(values = {}) {
  if (!values || typeof values !== LOCAL_STR_OBJECT) {
    return {};
  }
  return Object.keys(values)
    .sort()
    .reduce((accumulator, key) => {
      const normalizedValue = String(values[key] || '').trim();
      if (normalizedValue) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {});
}

function normalizeParticipationByNodeId(values = {}) {
  if (!values || typeof values !== LOCAL_STR_OBJECT) {
    return {};
  }
  return Object.keys(values)
    .sort()
    .reduce((accumulator, nodeId) => {
      const participation = values[nodeId];
      const state = normalizeNodeParticipationState(
        participation?.state || participation,
      );
      if (!state) {
        return accumulator;
      }
      const memberState = normalizeMembershipMemberState(
        participation?.memberState,
      );
      const reasons = normalizeStringList(participation?.reasons);
      const admissionState = normalizeNodeParticipationAdmissionState(
        participation?.admissionState,
      );
      const admissionReasonCodes = normalizeStringList(
        participation?.admissionReasonCodes,
      );
      const clusterIncarnationFence =
        participation?.clusterIncarnationFence &&
          typeof participation.clusterIncarnationFence === 'object' ?
          Object.freeze({
            ...participation.clusterIncarnationFence,
            reasonCodes: Object.freeze(normalizeStringList(
              participation.clusterIncarnationFence.reasonCodes,
            )),
          }) :
          null;
      accumulator[nodeId] = Object.freeze({
        nodeId,
        state,
        memberState,
        durable: participation?.durable === true,
        publishedActive: participation?.publishedActive === true,
        recoveryActive: participation?.recoveryActive === true,
        projectedServing: participation?.projectedServing === true,
        locallyEligible: participation?.locallyEligible === true,
        suspectedOrTransitioning:
          participation?.suspectedOrTransitioning === true,
        recoverySource:
          typeof participation?.recoverySource === LOCAL_STR_STRING &&
            participation.recoverySource.trim().length > 0 ?
            participation.recoverySource.trim() :
            null,
        recoveryEpoch:
          typeof participation?.recoveryEpoch === LOCAL_STR_STRING &&
            participation.recoveryEpoch.trim().length > 0 ?
            participation.recoveryEpoch.trim() :
            null,
        admissionState,
        admitted: admissionState === NODE_PARTICIPATION_ADMISSION_STATE.ADMITTED,
        admissionReasonCodes: Object.freeze(admissionReasonCodes),
        ...(clusterIncarnationFence ?
          {
            clusterIncarnationFence,
          } :
          {}),
        reasons: Object.freeze(reasons),
      });
      return accumulator;
    }, {});
}

function buildNodeRuntimeParticipationRule(state, signals) {
  return Object.freeze({
    state,
    signals: Object.freeze(signals),
  });
}

function buildNodeRuntimeParticipationSignal(field, values) {
  return Object.freeze({
    field,
    values: Object.freeze(new Set(values)),
  });
}

function buildNodeRuntimeParticipationEvidence(options = {}) {
  const participation =
    options.participation && typeof options.participation === LOCAL_STR_OBJECT ?
      options.participation :
      {};
  return Object.freeze({
    admissionState: normalizeNodeParticipationAdmissionState(
      options.admissionState ?? participation.admissionState,
    ),
    lifecycleState: normalizeMembershipLifecycleState(
      options.lifecycleState ?? participation.lifecycleState,
    ),
    memberState: normalizeMembershipMemberState(
      options.memberState ?? participation.memberState,
    ),
    participationState: normalizeNodeParticipationState(
      options.participationState ?? participation.state,
    ),
    recoveryProtocolState: normalizeRecoveryProtocolState(
      options.recoveryProtocolState ?? participation.recoveryProtocolState,
    ),
  });
}

function nodeRuntimeParticipationSignalMatches(signal, evidence) {
  return signal.values.has(evidence[signal.field]);
}

function nodeRuntimeParticipationRuleMatches(rule, evidence) {
  return rule.signals.some((signal) =>
    nodeRuntimeParticipationSignalMatches(signal, evidence),
  );
}

function resolveNodeRuntimeParticipationState(evidence) {
  const rule = NODE_RUNTIME_PARTICIPATION_STATE_RULES.find((candidate) =>
    nodeRuntimeParticipationRuleMatches(candidate, evidence),
  );
  return rule?.state || NODE_RUNTIME_PARTICIPATION_STATE.INACTIVE;
}

function buildNodeRuntimeParticipationProjection(options = {}) {
  const evidence = buildNodeRuntimeParticipationEvidence(options);
  return Object.freeze({
    state: resolveNodeRuntimeParticipationState(evidence),
    admissionState: evidence.admissionState,
  });
}

function isNodeRuntimeParticipationBlocked(options = {}) {
  return buildNodeRuntimeParticipationProjection(options).state ===
    NODE_RUNTIME_PARTICIPATION_STATE.BLOCKED;
}

function normalizeParticipationStateCounts(values = {}) {
  if (!values || typeof values !== LOCAL_STR_OBJECT) {
    return {};
  }
  return Object.keys(values)
    .reduce((accumulator, state) => {
      const normalizedState = normalizeNodeParticipationState(state);
      const count = Number(values[state]);
      if (!normalizedState || !Number.isFinite(count) || count <= 0) {
        return accumulator;
      }
      accumulator[normalizedState] = Math.trunc(count);
      return accumulator;
    }, {});
}

function resolveDefaultMemberState(lifecycleState) {
  switch (lifecycleState) {
  case MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE:
    return MEMBERSHIP_MEMBER_STATE.SERVING;
  case MEMBERSHIP_LIFECYCLE_STATE.DRAINING:
    return MEMBERSHIP_MEMBER_STATE.DRAINING;
  case MEMBERSHIP_LIFECYCLE_STATE.REMOVED:
    return MEMBERSHIP_MEMBER_STATE.RETIRED;
  case MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP:
    return MEMBERSHIP_MEMBER_STATE.CATCHING_UP;
  case MEMBERSHIP_LIFECYCLE_STATE.ADMITTED:
  case MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING:
  case MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING:
  default:
    return MEMBERSHIP_MEMBER_STATE.JOINING;
  }
}

function isValidMembershipLifecycleTransition(fromState, toState) {
  const normalizedFromState = normalizeMembershipLifecycleState(fromState);
  const normalizedToState = normalizeMembershipLifecycleState(toState);
  if (!normalizedFromState || !normalizedToState) {
    return false;
  }
  const validTransitions =
    MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS[normalizedFromState] || [];
  return validTransitions.includes(normalizedToState);
}

function buildMembershipLifecycleSummary(options = {}) {
  const lifecycleState = normalizeMembershipLifecycleState(
    options.lifecycleState,
  ) || MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
  const publishedActiveNodeIds = normalizeNodeIdList(
    options.publishedActiveNodeIds,
  );
  const projectedServingNodeIds = normalizeNodeIdList(
    options.projectedServingNodeIds,
  );
  const locallyEligibleNodeIds = normalizeNodeIdList(
    options.locallyEligibleNodeIds?.length ?
      options.locallyEligibleNodeIds :
      projectedServingNodeIds,
  );
  const recoveryActiveNodeIds = normalizeNodeIdList(
    options.recoveryActiveNodeIds?.length ?
      options.recoveryActiveNodeIds :
      locallyEligibleNodeIds.length > 0 ?
        locallyEligibleNodeIds :
        projectedServingNodeIds,
  );
  const recoveryActiveNodeSource =
    typeof options.recoveryActiveNodeSource === 'string' &&
      options.recoveryActiveNodeSource.trim().length > 0 ?
      options.recoveryActiveNodeSource.trim() :
      null;
  const missingPublishedRecoveryActiveNodeIds = normalizeNodeIdList(
    options.missingPublishedRecoveryActiveNodeIds?.length ?
      options.missingPublishedRecoveryActiveNodeIds :
      recoveryActiveNodeIds.filter((nodeId) =>
        !publishedActiveNodeIds.includes(nodeId),
      ),
  );
  const suspectedOrTransitioningNodeIds = normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds,
  );
  const recoveryEpochByNodeId = normalizeStringMap(options.recoveryEpochByNodeId);
  const defaultMemberState = resolveDefaultMemberState(lifecycleState);
  const memberStatesByNodeId =
    options.memberStatesByNodeId &&
      typeof options.memberStatesByNodeId === 'object' ?
      Object.keys(options.memberStatesByNodeId)
        .sort()
        .reduce((accumulator, nodeId) => {
          const normalizedState = normalizeMembershipMemberState(
            options.memberStatesByNodeId[nodeId],
          );
          if (normalizedState) {
            accumulator[nodeId] = normalizedState;
          }
          return accumulator;
        }, {}) :
      normalizeNodeIdList([
        ...publishedActiveNodeIds,
        ...projectedServingNodeIds,
        ...suspectedOrTransitioningNodeIds,
      ]).reduce((accumulator, nodeId) => {
        accumulator[nodeId] = defaultMemberState;
        return accumulator;
      }, {});
  const epochBoundary =
    normalizeMembershipLifecycleEpochBoundary(options.epochBoundary) ||
    (lifecycleState === MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE ?
      MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLISHED_MEMBERSHIP :
      MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY.PUBLICATION_PENDING);
  const membershipFreeze =
    options.membershipFreeze && typeof options.membershipFreeze === 'object' ?
      Object.freeze({
        active: options.membershipFreeze.active === true,
        reasonCode: String(options.membershipFreeze.reasonCode || '') || null,
        retainedPublishedNodeIds: Object.freeze(normalizeNodeIdList(
          options.membershipFreeze.retainedPublishedNodeIds,
        )),
        missingProjectedNodeIds: Object.freeze(normalizeNodeIdList(
          options.membershipFreeze.missingProjectedNodeIds,
        )),
        unconfirmedProjectedNodeIds: Object.freeze(normalizeNodeIdList(
          options.membershipFreeze.unconfirmedProjectedNodeIds,
        )),
      }) :
      Object.freeze({
        active: false,
        reasonCode: null,
        retainedPublishedNodeIds: Object.freeze([...publishedActiveNodeIds]),
        missingProjectedNodeIds: Object.freeze([]),
        unconfirmedProjectedNodeIds: Object.freeze([]),
      });
  const projectionDiagnostics =
    options.projectionDiagnostics &&
      typeof options.projectionDiagnostics === 'object' ?
      Object.freeze({
        readinessDecisionMode:
          String(
            options.projectionDiagnostics.readinessDecisionMode || '',
          ).trim() || null,
        readinessDecisionDimensions: Object.freeze(normalizeStringList(
          options.projectionDiagnostics.readinessDecisionDimensions,
        )),
        recoveryEligibleProjectionEnabled:
          options.projectionDiagnostics
            .recoveryEligibleProjectionEnabled === true,
        recoveryEligibleIncludedNodeIds: Object.freeze(normalizeNodeIdList(
          options.projectionDiagnostics.recoveryEligibleIncludedNodeIds,
        )),
        runtimeAuthorityIncludedNodeIds: Object.freeze(normalizeNodeIdList(
          options.projectionDiagnostics.runtimeAuthorityIncludedNodeIds,
        )),
        livenessFallbackIncludedNodeIds: Object.freeze(normalizeNodeIdList(
          options.projectionDiagnostics.livenessFallbackIncludedNodeIds,
        )),
        readinessExcludedNodeIds: Object.freeze(normalizeNodeIdList(
          options.projectionDiagnostics.readinessExcludedNodeIds,
        )),
        clusterMemberUnhealthyExcludedNodeIds:
          Object.freeze(normalizeNodeIdList(
            options.projectionDiagnostics
              .clusterMemberUnhealthyExcludedNodeIds,
          )),
      }) :
      null;
  const participationByNodeId = Object.freeze(
    normalizeParticipationByNodeId(options.participationByNodeId),
  );
  const participationStateCounts = Object.freeze(
    normalizeParticipationStateCounts(options.participationStateCounts),
  );
  const recoveryProtocolState = normalizeRecoveryProtocolState(
    options.recoveryProtocolState,
  );
  const recoveryProtocolReasonCodes = Object.freeze(
    normalizeStringList(options.recoveryProtocolReasonCodes),
  );

  return Object.freeze({
    lifecycleState,
    epochBoundary,
    publishedActiveNodeIds,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    recoveryActiveNodeIds,
    recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds,
    suspectedOrTransitioningNodeIds,
    memberStatesByNodeId: Object.freeze({...memberStatesByNodeId}),
    recoveryEpochByNodeId: Object.freeze({...recoveryEpochByNodeId}),
    membershipFreeze,
    projectionDiagnostics,
    participationByNodeId,
    participationStateCounts,
    recoveryProtocolState,
    recoveryProtocolReasonCodes,
  });
}

export {
  MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
  MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS,
  NODE_PARTICIPATION_ADMISSION_STATE,
  NODE_PARTICIPATION_STATE,
  NODE_RUNTIME_PARTICIPATION_STATE,
  RECOVERY_PROTOCOL_STATE,
  buildMembershipLifecycleSummary,
  buildNodeRuntimeParticipationProjection,
  isNodeRuntimeParticipationBlocked,
  isValidMembershipLifecycleTransition,
  normalizeMembershipLifecycleEpochBoundary,
  normalizeMembershipMemberState,
  normalizeMembershipLifecycleState,
  normalizeNodeParticipationAdmissionState,
  normalizeNodeParticipationState,
  normalizeRecoveryProtocolState,
};
