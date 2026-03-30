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
  if (!values || typeof values !== 'object') {
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

  return Object.freeze({
    lifecycleState,
    epochBoundary,
    publishedActiveNodeIds,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    suspectedOrTransitioningNodeIds,
    memberStatesByNodeId: Object.freeze({...memberStatesByNodeId}),
    recoveryEpochByNodeId: Object.freeze({...recoveryEpochByNodeId}),
    membershipFreeze,
    projectionDiagnostics,
  });
}

export {
  MEMBERSHIP_LIFECYCLE_EPOCH_BOUNDARY,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
  MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS,
  buildMembershipLifecycleSummary,
  isValidMembershipLifecycleTransition,
  normalizeMembershipLifecycleEpochBoundary,
  normalizeMembershipMemberState,
  normalizeMembershipLifecycleState,
};
