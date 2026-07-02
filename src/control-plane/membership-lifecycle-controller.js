import {
  MEMBERSHIP_OWNER_EVIDENCE_SOURCE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
} from '../bootstrap/rejoin-hints-constants.js';
import {
  buildMembershipLifecycleSummary,
  isValidMembershipLifecycleTransition,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';

const LOCAL_STR_JOIN_ADMISSION = 'join_admission';
const LOCAL_STR_RESTART_REENTRY = 'restart_reentry';
const LOCAL_STR_DRAIN = 'drain';
const LOCAL_STR_REMOVAL = 'removal';
const LOCAL_STR_RESTART_REENTRY_REQUESTED = 'restart_reentry_requested';
const LOCAL_STR_JOIN_ADMISSION_REQUESTED = 'join_admission_requested';
const LOCAL_STR_MEMBERSHIP_REMOVAL_REQUESTED = 'membership_removal_requested';
const MEMBERSHIP_OWNER_STARTUP_MODE_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
    reasonCode: MEMBERSHIP_OWNER_REASON.STARTUP_MODE_COMPAT,
  }),
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.SEED,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BOOTSTRAP_SEED,
    reasonCode: MEMBERSHIP_OWNER_REASON.STARTUP_MODE_COMPAT,
  }),
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.JOIN_ADMISSION,
    reasonCode: MEMBERSHIP_OWNER_REASON.STARTUP_MODE_COMPAT,
  }),
]);
const MEMBERSHIP_OWNER_INVALID_STARTUP_MODE_RULE = Object.freeze({
  startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
  outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
  reasonCode: MEMBERSHIP_OWNER_REASON.INVALID_STARTUP_MODE,
});

export const MEMBERSHIP_LIFECYCLE_INTENT = Object.freeze({
  JOIN_ADMISSION: LOCAL_STR_JOIN_ADMISSION,
  RESTART_REENTRY: LOCAL_STR_RESTART_REENTRY,
  DRAIN: LOCAL_STR_DRAIN,
  REMOVAL: LOCAL_STR_REMOVAL,
});

// Phase 1 executable machine: the single lifecycle state each intent drives a
// member toward. Transitions are validated against
// MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS; an intent whose mapped step is not a
// legal transition from the member's current state is recorded as rejected
// rather than silently applied. RESTART_REENTRY models a node that was published
// before the restart, so a fresh controller seeds PUBLISHED_ACTIVE before the
// re-entry step (the durable-rejoin premise).
const MEMBERSHIP_INTENT_TARGET_LIFECYCLE_STATE = Object.freeze({
  [MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION]:
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  [MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY]:
    MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING,
  [MEMBERSHIP_LIFECYCLE_INTENT.DRAIN]: MEMBERSHIP_LIFECYCLE_STATE.DRAINING,
  [MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL]: MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
});

const MEMBERSHIP_TRANSITION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  NOOP: 'noop',
  INVALID_TRANSITION: 'invalid_transition',
  UNKNOWN_INTENT: 'unknown_intent',
});

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeTimestamp(value, fallback) {
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  return fallback;
}

function normalizeJoinStartupMode(startupMode) {
  return normalizeString(startupMode, STARTUP_JOIN_MODE.FRESH_JOIN);
}

function normalizeMembershipOwnerOutcomeType(value) {
  const normalized = normalizeString(value);
  return Object.values(MEMBERSHIP_OWNER_OUTCOME_TYPE).includes(normalized) ?
    normalized :
    '';
}

function resolveMembershipOwnerStartupModeRule(startupMode) {
  const normalizedStartupMode = normalizeJoinStartupMode(startupMode);
  return MEMBERSHIP_OWNER_STARTUP_MODE_OUTCOME_RULES.find((rule) =>
    rule.startupMode === normalizedStartupMode,
  ) || MEMBERSHIP_OWNER_INVALID_STARTUP_MODE_RULE;
}

export function isBootJoinRejoinMembershipOwnerOutcome(value) {
  return value &&
    typeof value === 'object' &&
    value.semanticOwner ===
      TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER &&
    value.boundary === TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY &&
    normalizeMembershipOwnerOutcomeType(value.outcomeType) !==
      '';
}

export function buildMembershipOwnerOutcome(options = {}) {
  const normalizedOptions = options && typeof options === 'object' ?
    options :
    {};
  const suppliedOutcome = isBootJoinRejoinMembershipOwnerOutcome(
    normalizedOptions.membershipOwnerOutcome,
  ) ?
    normalizedOptions.membershipOwnerOutcome :
    {};
  const startupModeRule = resolveMembershipOwnerStartupModeRule(
    suppliedOutcome.startupMode || normalizedOptions.startupMode,
  );
  const outcomeType =
    normalizeMembershipOwnerOutcomeType(suppliedOutcome.outcomeType) ||
    startupModeRule.outcomeType;

  return {
    semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
    boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
    outcomeType,
    startupMode: startupModeRule.startupMode,
    reasonCode: normalizeString(
      suppliedOutcome.reasonCode || normalizedOptions.reasonCode,
      startupModeRule.reasonCode,
    ),
    evidenceSource: normalizeString(
      suppliedOutcome.evidenceSource ||
        suppliedOutcome.source ||
        normalizedOptions.evidenceSource,
      MEMBERSHIP_OWNER_EVIDENCE_SOURCE.STARTUP_MODE,
    ),
  };
}

export function resolveMembershipOwnerOutcomeType(options = {}) {
  const outcomeOptions = typeof options === 'string' ?
    {startupMode: options} :
    options && typeof options === 'object' ?
      options :
      {};
  return buildMembershipOwnerOutcome(outcomeOptions).outcomeType;
}

export function isMembershipOwnerRestartReentryOutcome(options = {}) {
  return resolveMembershipOwnerOutcomeType(options) ===
    MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY;
}

export function resolveMembershipJoinIntentType(options = {}) {
  return isMembershipOwnerRestartReentryOutcome(options) ?
    MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
}

function buildJoinIntent(options = {}) {
  const startupMode = normalizeJoinStartupMode(options.startupMode);
  const membershipOwnerOutcome = buildMembershipOwnerOutcome({
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    startupMode,
  });
  const intentType = resolveMembershipJoinIntentType({
    membershipOwnerOutcome,
    startupMode,
  });
  return {
    intentType,
    nodeId: normalizeString(options.nodeId),
    startupMode,
    membershipOwnerOutcome,
    joinSessionId: normalizeString(options.joinSessionId),
    nodeAddress: normalizeString(options.nodeAddress),
    seedNodeAddress: normalizeString(options.seedNodeAddress),
    requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
    reasonCode: normalizeString(
      options.reasonCode,
      intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY ?
        LOCAL_STR_RESTART_REENTRY_REQUESTED :
        LOCAL_STR_JOIN_ADMISSION_REQUESTED,
    ),
    membershipLifecycleSummary: buildMembershipLifecycleSummary({
      lifecycleState:
        intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY ?
          MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP :
          MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
      publishedActiveNodeIds: options.publishedActiveNodeIds,
      memberStatesByNodeId: normalizeString(options.nodeId) ? {
        [normalizeString(options.nodeId)]:
          intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY ?
            MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
            MEMBERSHIP_MEMBER_STATE.JOINING,
      } : undefined,
      recoveryEpochByNodeId:
        normalizeString(options.nodeId) && normalizeString(options.recoveryEpoch) ? {
          [normalizeString(options.nodeId)]: normalizeString(options.recoveryEpoch),
        } : undefined,
    }),
  };
}

function buildDrainIntent(options = {}) {
  const reasonCode = normalizeString(options.reasonCode, 'node_draining');
  return {
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.DRAIN,
    nodeId: normalizeString(options.nodeId),
    requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
    drainDeadlineMs: Number.isFinite(options.drainDeadlineMs) ?
      Math.floor(options.drainDeadlineMs) :
      null,
    signal: normalizeString(options.signal),
    reasonCode,
    membershipLifecycleSummary: buildMembershipLifecycleSummary({
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.DRAINING,
      publishedActiveNodeIds: options.publishedActiveNodeIds,
      memberStatesByNodeId: normalizeString(options.nodeId) ? {
        [normalizeString(options.nodeId)]: MEMBERSHIP_MEMBER_STATE.DRAINING,
      } : undefined,
    }),
  };
}

function buildRemovalIntent(options = {}) {
  return {
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL,
    nodeId: normalizeString(options.nodeId),
    requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
    reasonCode: normalizeString(options.reasonCode, LOCAL_STR_MEMBERSHIP_REMOVAL_REQUESTED),
    membershipLifecycleSummary: buildMembershipLifecycleSummary({
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.REMOVED,
      publishedActiveNodeIds: options.publishedActiveNodeIds,
      memberStatesByNodeId: normalizeString(options.nodeId) ? {
        [normalizeString(options.nodeId)]: MEMBERSHIP_MEMBER_STATE.RETIRED,
      } : undefined,
    }),
  };
}

export class MembershipLifecycleController {
  constructor(options = {}) {
    this.nodeId = normalizeString(options.nodeId);
    this.startupMode = normalizeJoinStartupMode(options.startupMode);
    this.membershipOwnerOutcome = buildMembershipOwnerOutcome({
      membershipOwnerOutcome: options.membershipOwnerOutcome,
      startupMode: this.startupMode,
    });
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.delegates = {
      onJoinIntent: typeof options.delegates?.onJoinIntent === 'function' ?
        options.delegates.onJoinIntent :
        null,
      onDrainIntent: typeof options.delegates?.onDrainIntent === 'function' ?
        options.delegates.onDrainIntent :
        null,
      onRemovalIntent:
        typeof options.delegates?.onRemovalIntent === 'function' ?
          options.delegates.onRemovalIntent :
          null,
    };
    this.intentHistory = [];
    // Phase 1 executable machine state: per-node lifecycle state + an append-only
    // transition log. Shadow-only; no consumer reads this yet.
    this.memberLifecycleStates = new Map();
    this.memberTransitionHistory = [];
  }

  getMemberLifecycleState(nodeId) {
    const normalizedNodeId = normalizeString(nodeId);
    return this.memberLifecycleStates.get(normalizedNodeId) ||
      MEMBERSHIP_LIFECYCLE_STATE.ABSENT;
  }

  snapshotMemberLifecycleStates() {
    return Object.fromEntries(this.memberLifecycleStates.entries());
  }

  // Apply one validated lifecycle transition for a member. Returns a typed
  // outcome and never throws; an illegal step is rejected, not forced.
  applyMemberTransition(nodeId, toState) {
    const normalizedNodeId = normalizeString(nodeId);
    if (!normalizedNodeId || !toState) {
      return {
        applied: false,
        outcome: MEMBERSHIP_TRANSITION_OUTCOME.UNKNOWN_INTENT,
        nodeId: normalizedNodeId,
        fromState: null,
        toState: toState || null,
      };
    }
    const fromState = this.getMemberLifecycleState(normalizedNodeId);
    if (fromState === toState) {
      return {
        applied: false,
        outcome: MEMBERSHIP_TRANSITION_OUTCOME.NOOP,
        nodeId: normalizedNodeId,
        fromState,
        toState,
      };
    }
    if (!isValidMembershipLifecycleTransition(fromState, toState)) {
      return {
        applied: false,
        outcome: MEMBERSHIP_TRANSITION_OUTCOME.INVALID_TRANSITION,
        nodeId: normalizedNodeId,
        fromState,
        toState,
      };
    }
    this.memberLifecycleStates.set(normalizedNodeId, toState);
    const record = {
      nodeId: normalizedNodeId,
      fromState,
      toState,
      at: this.now(),
    };
    this.memberTransitionHistory.push(record);
    return {
      applied: true,
      outcome: MEMBERSHIP_TRANSITION_OUTCOME.APPLIED,
      ...record,
    };
  }

  // Drive a member toward the state mapped from an intent. RESTART_REENTRY on a
  // member with no recorded state seeds PUBLISHED_ACTIVE first (the node was
  // published before the restart) so the re-entry step is a legal transition.
  advanceMemberForIntent(intent = {}) {
    const intentType = normalizeString(intent.intentType);
    const nodeId = normalizeString(intent.nodeId);
    const toState = MEMBERSHIP_INTENT_TARGET_LIFECYCLE_STATE[intentType];
    // Guard nodeId before any state mutation so an empty id cannot seed a junk
    // key into the shadow map.
    if (!toState || !nodeId) {
      return {
        applied: false,
        outcome: MEMBERSHIP_TRANSITION_OUTCOME.UNKNOWN_INTENT,
        nodeId,
        fromState: nodeId ? this.getMemberLifecycleState(nodeId) : null,
        toState: null,
      };
    }
    // NOTE (Phase 1 first-cut gap): REMOVAL maps directly to REMOVED, which is
    // not a legal step from PUBLISHED_ACTIVE (the table routes removal through
    // DRAINING). A published-active node's REMOVAL is therefore recorded as
    // invalid_transition today. Inert while the machine drives nothing; must be
    // made multi-step (PUBLISHED_ACTIVE -> DRAINING -> REMOVED) before the
    // authority flip (Phase 2).
    if (
      intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY &&
      this.getMemberLifecycleState(nodeId) === MEMBERSHIP_LIFECYCLE_STATE.ABSENT
    ) {
      this.memberLifecycleStates.set(
        nodeId,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      );
    }
    return this.applyMemberTransition(nodeId, toState);
  }

  async submitJoinIntent(options = {}) {
    const intent = buildJoinIntent({
      ...options,
      nodeId: options.nodeId || this.nodeId,
      startupMode: options.startupMode || this.startupMode,
      membershipOwnerOutcome:
        options.membershipOwnerOutcome || this.membershipOwnerOutcome,
      requestedAt: options.requestedAt ?? this.now(),
    });
    this.intentHistory.push(intent);
    this.advanceMemberForIntent(intent);
    if (this.delegates.onJoinIntent) {
      return this.delegates.onJoinIntent({intent, controller: this});
    }
    return intent;
  }

  async submitDrainIntent(options = {}) {
    const intent = buildDrainIntent({
      ...options,
      nodeId: options.nodeId || this.nodeId,
      requestedAt: options.requestedAt ?? this.now(),
    });
    this.intentHistory.push(intent);
    this.advanceMemberForIntent(intent);
    if (this.delegates.onDrainIntent) {
      return this.delegates.onDrainIntent({intent, controller: this});
    }
    return intent;
  }

  async submitRemovalIntent(options = {}) {
    const intent = buildRemovalIntent({
      ...options,
      nodeId: options.nodeId || this.nodeId,
      requestedAt: options.requestedAt ?? this.now(),
    });
    this.intentHistory.push(intent);
    this.advanceMemberForIntent(intent);
    if (this.delegates.onRemovalIntent) {
      return this.delegates.onRemovalIntent({intent, controller: this});
    }
    return intent;
  }
}
