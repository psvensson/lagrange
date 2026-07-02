/**
 * GroupSelectionService - single owner for deterministic group leadership.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, NODE_STATE, TABLES} from '../constants/index.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';
import {
  GROUP_SELECTION_DEFAULT,
  GROUP_SELECTION_ERROR_MSG,
  GROUP_SELECTION_EVENT,
  GROUP_SELECTION_LOG_MSG,
  GROUP_SELECTION_SUBSYSTEM,
} from './group-selection-constants.js';

class GroupSelectionService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    super();
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nowFn = options.nowFn || Date.now;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(GROUP_SELECTION_SUBSYSTEM) : console;
    this.stats = {
      leadershipChangeCount: 0,
      leadershipUnchangedCount: 0,
      reconcileCount: 0,
      lastGroupId: null,
      lastReconciledAt: null,
    };
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }
  }

  /**
   * Select deterministic representative and coordinator for one group.
   * @param {Object} options
   * @param {Object} options.groupRow
   * @param {Object[]} options.memberRows
   * @return {Object}
   */
  selectGroupLeadership(options = {}) {
    const groupRow = options.groupRow || {};
    const groupId = groupRow[COLUMN.GROUP_ID];
    const memberRows = options.memberRows || [];

    assertCritical(groupId, GROUP_SELECTION_ERROR_MSG.MISSING_GROUP_ID);
    assertCritical(
      Array.isArray(memberRows),
      GROUP_SELECTION_ERROR_MSG.MEMBERS_MUST_BE_ARRAY,
    );

    const members = this.sortMembersDeterministically(memberRows);
    const eligible = this.getEligibleMembers(members);
    const representativeNodeId = this.selectRepresentativeNodeId(
      eligible,
      members,
      groupRow[COLUMN.REPRESENTATIVE_NODE_ID],
    );
    const coordinatorNodeId = this.selectCoordinatorNodeId(
      eligible,
      members,
      representativeNodeId,
      groupRow[COLUMN.COORDINATOR_NODE_ID],
    );

    return {
      groupId,
      representativeNodeId,
      coordinatorNodeId,
      representativeChanged:
        representativeNodeId !== groupRow[COLUMN.REPRESENTATIVE_NODE_ID],
      coordinatorChanged:
        coordinatorNodeId !== groupRow[COLUMN.COORDINATOR_NODE_ID],
      memberCount: members.length,
      eligibleMemberCount: eligible.length,
    };
  }

  /**
   * Recompute and persist leadership for a group via CDC owner path.
   * @param {Object} options
   * @param {Object} options.groupRow
   * @param {Object[]} options.memberRows
   * @return {Promise<Object>}
   */
  async applyGroupLeadership(options = {}) {
    const selection = this.selectGroupLeadership(options);
    this.stats.reconcileCount += 1;
    this.stats.lastGroupId = selection.groupId;
    this.stats.lastReconciledAt = this.now();
    if (!selection.representativeChanged && !selection.coordinatorChanged) {
      this.stats.leadershipUnchangedCount += 1;
      this.logger.debug(GROUP_SELECTION_LOG_MSG.LEADERSHIP_UNCHANGED, {
        groupId: selection.groupId,
        representativeNodeId: selection.representativeNodeId,
        coordinatorNodeId: selection.coordinatorNodeId,
      });
      return {
        changed: false,
        selection,
      };
    }

    const upsert = assertCritical(
      this.cdcIntegrationService?.upsertSystemTableRow,
      GROUP_SELECTION_ERROR_MSG.MISSING_CDC,
    );
    const groupRow = options.groupRow || {};
    const now = this.now();
    const row = {
      ...groupRow,
      [COLUMN.GROUP_ID]: selection.groupId,
      [COLUMN.REPRESENTATIVE_NODE_ID]: selection.representativeNodeId,
      [COLUMN.COORDINATOR_NODE_ID]: selection.coordinatorNodeId,
      [COLUMN.STATE]:
        groupRow[COLUMN.STATE] || LATENCY_GROUP_STATE.ACTIVE,
      [COLUMN.CREATED_AT]:
        groupRow[COLUMN.CREATED_AT] || now,
      [COLUMN.UPDATED_AT]: now,
    };

    const result = await upsert.call(
      this.cdcIntegrationService,
      TABLES.LATENCY_GROUPS,
      row,
    );

    this.logger.info(GROUP_SELECTION_LOG_MSG.LEADERSHIP_CHANGED, {
      groupId: selection.groupId,
      representativeNodeId: selection.representativeNodeId,
      coordinatorNodeId: selection.coordinatorNodeId,
    });

    this.emit(GROUP_SELECTION_EVENT.LEADERSHIP_CHANGED, {
      selection,
      row,
      result,
    });
    this.stats.leadershipChangeCount += 1;

    return {
      changed: true,
      selection,
      row,
      result,
    };
  }

  /**
   * Reconcile one group using cached metadata and persist if changed.
   * @param {string} groupId
   * @return {Promise<Object>}
   */
  async reconcileGroupLeadership(groupId) {
    assertCritical(groupId, GROUP_SELECTION_ERROR_MSG.MISSING_GROUP_ID);
    const cache = this.systemTableCache;
    const groupRow = cache?.get?.(TABLES.LATENCY_GROUPS, groupId);
    if (!groupRow) {
      return {
        changed: false,
        selection: {
          groupId,
          representativeNodeId: null,
          coordinatorNodeId: null,
          memberCount: GROUP_SELECTION_DEFAULT.EMPTY_MEMBER_COUNT,
          eligibleMemberCount: GROUP_SELECTION_DEFAULT.EMPTY_MEMBER_COUNT,
        },
      };
    }

    const memberRows = cache.filter(
      TABLES.NODES,
      (nodeRow) => nodeRow?.[COLUMN.LATENCY_GROUP_ID] === groupId,
    );

    return this.applyGroupLeadership({groupRow, memberRows});
  }

  /**
   * Select representative node ID with deterministic tie-breaking.
   * @param {Object[]} eligible
   * @param {Object[]} members
   * @param {string} currentRepresentativeNodeId
   * @return {string|null}
   */
  selectRepresentativeNodeId(eligible, members, currentRepresentativeNodeId) {
    if (currentRepresentativeNodeId &&
      this.includesNodeId(eligible, currentRepresentativeNodeId)) {
      return currentRepresentativeNodeId;
    }

    if (eligible.length > 0) {
      return eligible[0][COLUMN.NODE_ID];
    }

    if (members.length > 0) {
      return members[0][COLUMN.NODE_ID];
    }

    return null;
  }

  /**
   * Select coordinator node ID with deterministic tie-breaking.
   * @param {Object[]} eligible
   * @param {Object[]} members
   * @param {string} representativeNodeId
   * @param {string} currentCoordinatorNodeId
   * @return {string|null}
   */
  selectCoordinatorNodeId(
    eligible,
    members,
    representativeNodeId,
    currentCoordinatorNodeId,
  ) {
    const coordinatorPool = eligible.length > 0 ? eligible : members;
    const nonRepresentativePool = coordinatorPool.filter((member) => {
      return member?.[COLUMN.NODE_ID] !== representativeNodeId;
    });

    if (currentCoordinatorNodeId &&
      this.includesNodeId(nonRepresentativePool, currentCoordinatorNodeId)) {
      return currentCoordinatorNodeId;
    }

    if (nonRepresentativePool.length > 0) {
      return nonRepresentativePool[0][COLUMN.NODE_ID];
    }

    return representativeNodeId || null;
  }

  /**
   * Filter members that are eligible for representative/coordinator roles.
   * @param {Object[]} members
   * @return {Object[]}
   * @private
   */
  getEligibleMembers(members) {
    return members.filter((member) => {
      return member?.[COLUMN.STATUS] === NODE_STATE.ACTIVE;
    });
  }

  /**
   * Sort member rows deterministically by node_id, then created_at.
   * @param {Object[]} memberRows
   * @return {Object[]}
   * @private
   */
  sortMembersDeterministically(memberRows) {
    return [...memberRows]
      .filter((member) => typeof member?.[COLUMN.NODE_ID] === 'string')
      .sort((left, right) => {
        const leftNodeId = left[COLUMN.NODE_ID];
        const rightNodeId = right[COLUMN.NODE_ID];
        if (leftNodeId < rightNodeId) {
          return -1;
        }
        if (leftNodeId > rightNodeId) {
          return 1;
        }
        const leftCreatedAt = Number(left?.[COLUMN.CREATED_AT]) || 0;
        const rightCreatedAt = Number(right?.[COLUMN.CREATED_AT]) || 0;
        return leftCreatedAt - rightCreatedAt;
      });
  }

  /**
   * Check whether a node set includes node ID.
   * @param {Object[]} members
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  includesNodeId(members, nodeId) {
    return members.some((member) => member?.[COLUMN.NODE_ID] === nodeId);
  }

  /**
   * Current timestamp.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
    };
  }
}

export {GroupSelectionService};
