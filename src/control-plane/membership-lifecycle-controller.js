import {STARTUP_JOIN_MODE} from '../bootstrap/rejoin-hints-constants.js';
import {TYPEOF} from '../constants/index.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';

export const MEMBERSHIP_LIFECYCLE_INTENT = Object.freeze({
  JOIN_ADMISSION: 'join_admission',
  RESTART_REENTRY: 'restart_reentry',
  DRAIN: 'drain',
  REMOVAL: 'removal',
});

function normalizeString(value, fallback = '') {
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

export function resolveMembershipJoinIntentType(startupMode) {
  return normalizeJoinStartupMode(startupMode) ===
    STARTUP_JOIN_MODE.DURABLE_REJOIN ?
    MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
}

function buildJoinIntent(options = {}) {
  const startupMode = normalizeJoinStartupMode(options.startupMode);
  const intentType = resolveMembershipJoinIntentType(startupMode);
  return {
    intentType,
    nodeId: normalizeString(options.nodeId),
    startupMode,
    joinSessionId: normalizeString(options.joinSessionId),
    nodeAddress: normalizeString(options.nodeAddress),
    seedNodeAddress: normalizeString(options.seedNodeAddress),
    requestedAt: normalizeTimestamp(options.requestedAt, Date.now()),
    reasonCode: normalizeString(
      options.reasonCode,
      intentType === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY ?
        'restart_reentry_requested' :
        'join_admission_requested',
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
    reasonCode: normalizeString(options.reasonCode, 'membership_removal_requested'),
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