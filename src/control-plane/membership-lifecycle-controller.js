import {
  MEMBERSHIP_OWNER_EVIDENCE_SOURCE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
} from '../bootstrap/rejoin-hints-constants.js';
import {TYPEOF} from '../constants/index.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';

const LOCAL_STR_JOIN_ADMISSION = 'join_admission';
const LOCAL_STR_RESTART_REENTRY = 'restart_reentry';
const LOCAL_STR_DRAIN = 'drain';
const LOCAL_STR_REMOVAL = 'removal';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1IZGR = 'restart_reentry_requested';
const LOCAL_STR_1J4BI = 'join_admission_requested';
const LOCAL_STR_U0NVB = 'membership_removal_requested';
const MEMBERSHIP_OWNER_STARTUP_MODE_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
  }),
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.SEED,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BOOTSTRAP_SEED,
  }),
  Object.freeze({
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.JOIN_ADMISSION,
  }),
]);

export const MEMBERSHIP_LIFECYCLE_INTENT = Object.freeze({
  JOIN_ADMISSION: LOCAL_STR_JOIN_ADMISSION,
  RESTART_REENTRY: LOCAL_STR_RESTART_REENTRY,
  DRAIN: LOCAL_STR_DRAIN,
  REMOVAL: LOCAL_STR_REMOVAL,
});

function normalizeString(value, fallback = LOCAL_STR_EMPTY) {
  return typeof value === TYPEOF.STRING ? value.trim() || fallback : fallback;
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
    LOCAL_STR_EMPTY;
}

function resolveMembershipOwnerOutcomeTypeForStartupMode(startupMode) {
  const normalizedStartupMode = normalizeJoinStartupMode(startupMode);
  return MEMBERSHIP_OWNER_STARTUP_MODE_OUTCOME_RULES.find((rule) =>
    rule.startupMode === normalizedStartupMode,
  ).outcomeType;
}

export function isBootJoinRejoinMembershipOwnerOutcome(value) {
  return value &&
    typeof value === TYPEOF.OBJECT &&
    value.semanticOwner ===
      TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER &&
    value.boundary === TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY &&
    normalizeMembershipOwnerOutcomeType(value.outcomeType) !==
      LOCAL_STR_EMPTY;
}

export function buildMembershipOwnerOutcome(options = {}) {
  const normalizedOptions = options && typeof options === TYPEOF.OBJECT ?
    options :
    {};
  const suppliedOutcome = isBootJoinRejoinMembershipOwnerOutcome(
    normalizedOptions.membershipOwnerOutcome,
  ) ?
    normalizedOptions.membershipOwnerOutcome :
    {};
  const startupMode = normalizeJoinStartupMode(
    suppliedOutcome.startupMode || normalizedOptions.startupMode,
  );
  const outcomeType =
    normalizeMembershipOwnerOutcomeType(suppliedOutcome.outcomeType) ||
    resolveMembershipOwnerOutcomeTypeForStartupMode(startupMode);

  return {
    semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
    boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
    outcomeType,
    startupMode,
    reasonCode: normalizeString(
      suppliedOutcome.reasonCode || normalizedOptions.reasonCode,
      MEMBERSHIP_OWNER_REASON.STARTUP_MODE_COMPAT,
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
  const outcomeOptions = typeof options === TYPEOF.STRING ?
    {startupMode: options} :
    options && typeof options === TYPEOF.OBJECT ?
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
        LOCAL_STR_1IZGR :
        LOCAL_STR_1J4BI,
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
    reasonCode: normalizeString(options.reasonCode, LOCAL_STR_U0NVB),
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
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.delegates = {
      onJoinIntent: typeof options.delegates?.onJoinIntent === TYPEOF.FUNCTION ?
        options.delegates.onJoinIntent :
        null,
      onDrainIntent: typeof options.delegates?.onDrainIntent === TYPEOF.FUNCTION ?
        options.delegates.onDrainIntent :
        null,
      onRemovalIntent:
        typeof options.delegates?.onRemovalIntent === TYPEOF.FUNCTION ?
          options.delegates.onRemovalIntent :
          null,
    };
    this.intentHistory = [];
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
    if (this.delegates.onRemovalIntent) {
      return this.delegates.onRemovalIntent({intent, controller: this});
    }
    return intent;
  }
}
