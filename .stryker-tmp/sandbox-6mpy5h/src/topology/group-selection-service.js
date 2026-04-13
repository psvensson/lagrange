/**
 * GroupSelectionService - single owner for deterministic group leadership.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { COLUMN, NODE_STATE, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { LATENCY_GROUP_STATE } from './latency-topology-constants.js';
import { GROUP_SELECTION_DEFAULT, GROUP_SELECTION_ERROR_MSG, GROUP_SELECTION_EVENT, GROUP_SELECTION_LOG_MSG, GROUP_SELECTION_SUBSYSTEM } from './group-selection-constants.js';
class GroupSelectionService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("153717")) {
      {}
    } else {
      stryCov_9fa48("153717");
      super();
      this.systemTableCache = stryMutAct_9fa48("153720") ? options.systemTableCache && null : stryMutAct_9fa48("153719") ? false : stryMutAct_9fa48("153718") ? true : (stryCov_9fa48("153718", "153719", "153720"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("153723") ? options.cdcIntegrationService && null : stryMutAct_9fa48("153722") ? false : stryMutAct_9fa48("153721") ? true : (stryCov_9fa48("153721", "153722", "153723"), options.cdcIntegrationService || null);
      this.nowFn = stryMutAct_9fa48("153726") ? options.nowFn && Date.now : stryMutAct_9fa48("153725") ? false : stryMutAct_9fa48("153724") ? true : (stryCov_9fa48("153724", "153725", "153726"), options.nowFn || Date.now);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(GROUP_SELECTION_SUBSYSTEM) : console;
      this.stats = stryMutAct_9fa48("153727") ? {} : (stryCov_9fa48("153727"), {
        leadershipChangeCount: NUM.ZERO,
        leadershipUnchangedCount: NUM.ZERO,
        reconcileCount: NUM.ZERO,
        lastGroupId: null,
        lastReconciledAt: null
      });
    }
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("153728")) {
      {}
    } else {
      stryCov_9fa48("153728");
      if (stryMutAct_9fa48("153730") ? false : stryMutAct_9fa48("153729") ? true : (stryCov_9fa48("153729", "153730"), options.systemTableCache)) {
        if (stryMutAct_9fa48("153731")) {
          {}
        } else {
          stryCov_9fa48("153731");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("153733") ? false : stryMutAct_9fa48("153732") ? true : (stryCov_9fa48("153732", "153733"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("153734")) {
          {}
        } else {
          stryCov_9fa48("153734");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("153736") ? false : stryMutAct_9fa48("153735") ? true : (stryCov_9fa48("153735", "153736"), options.nowFn)) {
        if (stryMutAct_9fa48("153737")) {
          {}
        } else {
          stryCov_9fa48("153737");
          this.nowFn = options.nowFn;
        }
      }
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
    if (stryMutAct_9fa48("153738")) {
      {}
    } else {
      stryCov_9fa48("153738");
      const groupRow = stryMutAct_9fa48("153741") ? options.groupRow && {} : stryMutAct_9fa48("153740") ? false : stryMutAct_9fa48("153739") ? true : (stryCov_9fa48("153739", "153740", "153741"), options.groupRow || {});
      const groupId = groupRow[COLUMN.GROUP_ID];
      const memberRows = stryMutAct_9fa48("153744") ? options.memberRows && [] : stryMutAct_9fa48("153743") ? false : stryMutAct_9fa48("153742") ? true : (stryCov_9fa48("153742", "153743", "153744"), options.memberRows || (stryMutAct_9fa48("153745") ? ["Stryker was here"] : (stryCov_9fa48("153745"), [])));
      assertCritical(groupId, GROUP_SELECTION_ERROR_MSG.MISSING_GROUP_ID);
      assertCritical(Array.isArray(memberRows), GROUP_SELECTION_ERROR_MSG.MEMBERS_MUST_BE_ARRAY);
      const members = this.sortMembersDeterministically(memberRows);
      const eligible = this.getEligibleMembers(members);
      const representativeNodeId = this.selectRepresentativeNodeId(eligible, members, groupRow[COLUMN.REPRESENTATIVE_NODE_ID]);
      const coordinatorNodeId = this.selectCoordinatorNodeId(eligible, members, representativeNodeId, groupRow[COLUMN.COORDINATOR_NODE_ID]);
      return stryMutAct_9fa48("153746") ? {} : (stryCov_9fa48("153746"), {
        groupId,
        representativeNodeId,
        coordinatorNodeId,
        representativeChanged: stryMutAct_9fa48("153749") ? representativeNodeId === groupRow[COLUMN.REPRESENTATIVE_NODE_ID] : stryMutAct_9fa48("153748") ? false : stryMutAct_9fa48("153747") ? true : (stryCov_9fa48("153747", "153748", "153749"), representativeNodeId !== groupRow[COLUMN.REPRESENTATIVE_NODE_ID]),
        coordinatorChanged: stryMutAct_9fa48("153752") ? coordinatorNodeId === groupRow[COLUMN.COORDINATOR_NODE_ID] : stryMutAct_9fa48("153751") ? false : stryMutAct_9fa48("153750") ? true : (stryCov_9fa48("153750", "153751", "153752"), coordinatorNodeId !== groupRow[COLUMN.COORDINATOR_NODE_ID]),
        memberCount: members.length,
        eligibleMemberCount: eligible.length
      });
    }
  }

  /**
   * Recompute and persist leadership for a group via CDC owner path.
   * @param {Object} options
   * @param {Object} options.groupRow
   * @param {Object[]} options.memberRows
   * @return {Promise<Object>}
   */
  async applyGroupLeadership(options = {}) {
    if (stryMutAct_9fa48("153753")) {
      {}
    } else {
      stryCov_9fa48("153753");
      const selection = this.selectGroupLeadership(options);
      stryMutAct_9fa48("153754") ? this.stats.reconcileCount -= NUM.ONE : (stryCov_9fa48("153754"), this.stats.reconcileCount += NUM.ONE);
      this.stats.lastGroupId = selection.groupId;
      this.stats.lastReconciledAt = this.now();
      if (stryMutAct_9fa48("153757") ? !selection.representativeChanged || !selection.coordinatorChanged : stryMutAct_9fa48("153756") ? false : stryMutAct_9fa48("153755") ? true : (stryCov_9fa48("153755", "153756", "153757"), (stryMutAct_9fa48("153758") ? selection.representativeChanged : (stryCov_9fa48("153758"), !selection.representativeChanged)) && (stryMutAct_9fa48("153759") ? selection.coordinatorChanged : (stryCov_9fa48("153759"), !selection.coordinatorChanged)))) {
        if (stryMutAct_9fa48("153760")) {
          {}
        } else {
          stryCov_9fa48("153760");
          stryMutAct_9fa48("153761") ? this.stats.leadershipUnchangedCount -= NUM.ONE : (stryCov_9fa48("153761"), this.stats.leadershipUnchangedCount += NUM.ONE);
          this.logger.debug(GROUP_SELECTION_LOG_MSG.LEADERSHIP_UNCHANGED, stryMutAct_9fa48("153762") ? {} : (stryCov_9fa48("153762"), {
            groupId: selection.groupId,
            representativeNodeId: selection.representativeNodeId,
            coordinatorNodeId: selection.coordinatorNodeId
          }));
          return stryMutAct_9fa48("153763") ? {} : (stryCov_9fa48("153763"), {
            changed: stryMutAct_9fa48("153764") ? true : (stryCov_9fa48("153764"), false),
            selection
          });
        }
      }
      const upsert = assertCritical(stryMutAct_9fa48("153765") ? this.cdcIntegrationService.upsertSystemTableRow : (stryCov_9fa48("153765"), this.cdcIntegrationService?.upsertSystemTableRow), GROUP_SELECTION_ERROR_MSG.MISSING_CDC);
      const groupRow = stryMutAct_9fa48("153768") ? options.groupRow && {} : stryMutAct_9fa48("153767") ? false : stryMutAct_9fa48("153766") ? true : (stryCov_9fa48("153766", "153767", "153768"), options.groupRow || {});
      const now = this.now();
      const row = stryMutAct_9fa48("153769") ? {} : (stryCov_9fa48("153769"), {
        ...groupRow,
        [COLUMN.GROUP_ID]: selection.groupId,
        [COLUMN.REPRESENTATIVE_NODE_ID]: selection.representativeNodeId,
        [COLUMN.COORDINATOR_NODE_ID]: selection.coordinatorNodeId,
        [COLUMN.STATE]: stryMutAct_9fa48("153772") ? groupRow[COLUMN.STATE] && LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("153771") ? false : stryMutAct_9fa48("153770") ? true : (stryCov_9fa48("153770", "153771", "153772"), groupRow[COLUMN.STATE] || LATENCY_GROUP_STATE.ACTIVE),
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("153775") ? groupRow[COLUMN.CREATED_AT] && now : stryMutAct_9fa48("153774") ? false : stryMutAct_9fa48("153773") ? true : (stryCov_9fa48("153773", "153774", "153775"), groupRow[COLUMN.CREATED_AT] || now),
        [COLUMN.UPDATED_AT]: now
      });
      const result = await upsert.call(this.cdcIntegrationService, TABLES.LATENCY_GROUPS, row);
      this.logger.info(GROUP_SELECTION_LOG_MSG.LEADERSHIP_CHANGED, stryMutAct_9fa48("153776") ? {} : (stryCov_9fa48("153776"), {
        groupId: selection.groupId,
        representativeNodeId: selection.representativeNodeId,
        coordinatorNodeId: selection.coordinatorNodeId
      }));
      this.emit(GROUP_SELECTION_EVENT.LEADERSHIP_CHANGED, stryMutAct_9fa48("153777") ? {} : (stryCov_9fa48("153777"), {
        selection,
        row,
        result
      }));
      stryMutAct_9fa48("153778") ? this.stats.leadershipChangeCount -= NUM.ONE : (stryCov_9fa48("153778"), this.stats.leadershipChangeCount += NUM.ONE);
      return stryMutAct_9fa48("153779") ? {} : (stryCov_9fa48("153779"), {
        changed: stryMutAct_9fa48("153780") ? false : (stryCov_9fa48("153780"), true),
        selection,
        row,
        result
      });
    }
  }

  /**
   * Reconcile one group using cached metadata and persist if changed.
   * @param {string} groupId
   * @return {Promise<Object>}
   */
  async reconcileGroupLeadership(groupId) {
    if (stryMutAct_9fa48("153781")) {
      {}
    } else {
      stryCov_9fa48("153781");
      assertCritical(groupId, GROUP_SELECTION_ERROR_MSG.MISSING_GROUP_ID);
      const cache = this.systemTableCache;
      const groupRow = stryMutAct_9fa48("153783") ? cache.get?.(TABLES.LATENCY_GROUPS, groupId) : stryMutAct_9fa48("153782") ? cache?.get(TABLES.LATENCY_GROUPS, groupId) : (stryCov_9fa48("153782", "153783"), cache?.get?.(TABLES.LATENCY_GROUPS, groupId));
      if (stryMutAct_9fa48("153786") ? false : stryMutAct_9fa48("153785") ? true : stryMutAct_9fa48("153784") ? groupRow : (stryCov_9fa48("153784", "153785", "153786"), !groupRow)) {
        if (stryMutAct_9fa48("153787")) {
          {}
        } else {
          stryCov_9fa48("153787");
          return stryMutAct_9fa48("153788") ? {} : (stryCov_9fa48("153788"), {
            changed: stryMutAct_9fa48("153789") ? true : (stryCov_9fa48("153789"), false),
            selection: stryMutAct_9fa48("153790") ? {} : (stryCov_9fa48("153790"), {
              groupId,
              representativeNodeId: null,
              coordinatorNodeId: null,
              memberCount: GROUP_SELECTION_DEFAULT.EMPTY_MEMBER_COUNT,
              eligibleMemberCount: GROUP_SELECTION_DEFAULT.EMPTY_MEMBER_COUNT
            })
          });
        }
      }
      const memberRows = stryMutAct_9fa48("153791") ? cache : (stryCov_9fa48("153791"), cache.filter(TABLES.NODES, stryMutAct_9fa48("153792") ? () => undefined : (stryCov_9fa48("153792"), nodeRow => stryMutAct_9fa48("153795") ? nodeRow?.[COLUMN.LATENCY_GROUP_ID] !== groupId : stryMutAct_9fa48("153794") ? false : stryMutAct_9fa48("153793") ? true : (stryCov_9fa48("153793", "153794", "153795"), (stryMutAct_9fa48("153796") ? nodeRow[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("153796"), nodeRow?.[COLUMN.LATENCY_GROUP_ID])) === groupId))));
      return this.applyGroupLeadership(stryMutAct_9fa48("153797") ? {} : (stryCov_9fa48("153797"), {
        groupRow,
        memberRows
      }));
    }
  }

  /**
   * Select representative node ID with deterministic tie-breaking.
   * @param {Object[]} eligible
   * @param {Object[]} members
   * @param {string} currentRepresentativeNodeId
   * @return {string|null}
   */
  selectRepresentativeNodeId(eligible, members, currentRepresentativeNodeId) {
    if (stryMutAct_9fa48("153798")) {
      {}
    } else {
      stryCov_9fa48("153798");
      if (stryMutAct_9fa48("153801") ? currentRepresentativeNodeId || this.includesNodeId(eligible, currentRepresentativeNodeId) : stryMutAct_9fa48("153800") ? false : stryMutAct_9fa48("153799") ? true : (stryCov_9fa48("153799", "153800", "153801"), currentRepresentativeNodeId && this.includesNodeId(eligible, currentRepresentativeNodeId))) {
        if (stryMutAct_9fa48("153802")) {
          {}
        } else {
          stryCov_9fa48("153802");
          return currentRepresentativeNodeId;
        }
      }
      if (stryMutAct_9fa48("153806") ? eligible.length <= NUM.ZERO : stryMutAct_9fa48("153805") ? eligible.length >= NUM.ZERO : stryMutAct_9fa48("153804") ? false : stryMutAct_9fa48("153803") ? true : (stryCov_9fa48("153803", "153804", "153805", "153806"), eligible.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153807")) {
          {}
        } else {
          stryCov_9fa48("153807");
          return eligible[NUM.ZERO][COLUMN.NODE_ID];
        }
      }
      if (stryMutAct_9fa48("153811") ? members.length <= NUM.ZERO : stryMutAct_9fa48("153810") ? members.length >= NUM.ZERO : stryMutAct_9fa48("153809") ? false : stryMutAct_9fa48("153808") ? true : (stryCov_9fa48("153808", "153809", "153810", "153811"), members.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153812")) {
          {}
        } else {
          stryCov_9fa48("153812");
          return members[NUM.ZERO][COLUMN.NODE_ID];
        }
      }
      return null;
    }
  }

  /**
   * Select coordinator node ID with deterministic tie-breaking.
   * @param {Object[]} eligible
   * @param {Object[]} members
   * @param {string} representativeNodeId
   * @param {string} currentCoordinatorNodeId
   * @return {string|null}
   */
  selectCoordinatorNodeId(eligible, members, representativeNodeId, currentCoordinatorNodeId) {
    if (stryMutAct_9fa48("153813")) {
      {}
    } else {
      stryCov_9fa48("153813");
      const coordinatorPool = (stryMutAct_9fa48("153817") ? eligible.length <= NUM.ZERO : stryMutAct_9fa48("153816") ? eligible.length >= NUM.ZERO : stryMutAct_9fa48("153815") ? false : stryMutAct_9fa48("153814") ? true : (stryCov_9fa48("153814", "153815", "153816", "153817"), eligible.length > NUM.ZERO)) ? eligible : members;
      const nonRepresentativePool = stryMutAct_9fa48("153818") ? coordinatorPool : (stryCov_9fa48("153818"), coordinatorPool.filter(member => {
        if (stryMutAct_9fa48("153819")) {
          {}
        } else {
          stryCov_9fa48("153819");
          return stryMutAct_9fa48("153822") ? member?.[COLUMN.NODE_ID] === representativeNodeId : stryMutAct_9fa48("153821") ? false : stryMutAct_9fa48("153820") ? true : (stryCov_9fa48("153820", "153821", "153822"), (stryMutAct_9fa48("153823") ? member[COLUMN.NODE_ID] : (stryCov_9fa48("153823"), member?.[COLUMN.NODE_ID])) !== representativeNodeId);
        }
      }));
      if (stryMutAct_9fa48("153826") ? currentCoordinatorNodeId || this.includesNodeId(nonRepresentativePool, currentCoordinatorNodeId) : stryMutAct_9fa48("153825") ? false : stryMutAct_9fa48("153824") ? true : (stryCov_9fa48("153824", "153825", "153826"), currentCoordinatorNodeId && this.includesNodeId(nonRepresentativePool, currentCoordinatorNodeId))) {
        if (stryMutAct_9fa48("153827")) {
          {}
        } else {
          stryCov_9fa48("153827");
          return currentCoordinatorNodeId;
        }
      }
      if (stryMutAct_9fa48("153831") ? nonRepresentativePool.length <= NUM.ZERO : stryMutAct_9fa48("153830") ? nonRepresentativePool.length >= NUM.ZERO : stryMutAct_9fa48("153829") ? false : stryMutAct_9fa48("153828") ? true : (stryCov_9fa48("153828", "153829", "153830", "153831"), nonRepresentativePool.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153832")) {
          {}
        } else {
          stryCov_9fa48("153832");
          return nonRepresentativePool[NUM.ZERO][COLUMN.NODE_ID];
        }
      }
      return stryMutAct_9fa48("153835") ? representativeNodeId && null : stryMutAct_9fa48("153834") ? false : stryMutAct_9fa48("153833") ? true : (stryCov_9fa48("153833", "153834", "153835"), representativeNodeId || null);
    }
  }

  /**
   * Filter members that are eligible for representative/coordinator roles.
   * @param {Object[]} members
   * @return {Object[]}
   * @private
   */
  getEligibleMembers(members) {
    if (stryMutAct_9fa48("153836")) {
      {}
    } else {
      stryCov_9fa48("153836");
      return stryMutAct_9fa48("153837") ? members : (stryCov_9fa48("153837"), members.filter(member => {
        if (stryMutAct_9fa48("153838")) {
          {}
        } else {
          stryCov_9fa48("153838");
          return stryMutAct_9fa48("153841") ? member?.[COLUMN.STATUS] !== NODE_STATE.ACTIVE : stryMutAct_9fa48("153840") ? false : stryMutAct_9fa48("153839") ? true : (stryCov_9fa48("153839", "153840", "153841"), (stryMutAct_9fa48("153842") ? member[COLUMN.STATUS] : (stryCov_9fa48("153842"), member?.[COLUMN.STATUS])) === NODE_STATE.ACTIVE);
        }
      }));
    }
  }

  /**
   * Sort member rows deterministically by node_id, then created_at.
   * @param {Object[]} memberRows
   * @return {Object[]}
   * @private
   */
  sortMembersDeterministically(memberRows) {
    if (stryMutAct_9fa48("153843")) {
      {}
    } else {
      stryCov_9fa48("153843");
      return stryMutAct_9fa48("153845") ? [...memberRows].sort((left, right) => {
        const leftNodeId = left[COLUMN.NODE_ID];
        const rightNodeId = right[COLUMN.NODE_ID];
        if (leftNodeId < rightNodeId) {
          return NUM.NEGATIVE_ONE;
        }
        if (leftNodeId > rightNodeId) {
          return NUM.ONE;
        }
        const leftCreatedAt = Number(left?.[COLUMN.CREATED_AT]) || NUM.ZERO;
        const rightCreatedAt = Number(right?.[COLUMN.CREATED_AT]) || NUM.ZERO;
        return leftCreatedAt - rightCreatedAt;
      }) : stryMutAct_9fa48("153844") ? [...memberRows].filter(member => typeof member?.[COLUMN.NODE_ID] === TYPEOF.STRING) : (stryCov_9fa48("153844", "153845"), (stryMutAct_9fa48("153846") ? [] : (stryCov_9fa48("153846"), [...memberRows])).filter(stryMutAct_9fa48("153847") ? () => undefined : (stryCov_9fa48("153847"), member => stryMutAct_9fa48("153850") ? typeof member?.[COLUMN.NODE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("153849") ? false : stryMutAct_9fa48("153848") ? true : (stryCov_9fa48("153848", "153849", "153850"), typeof (stryMutAct_9fa48("153851") ? member[COLUMN.NODE_ID] : (stryCov_9fa48("153851"), member?.[COLUMN.NODE_ID])) === TYPEOF.STRING))).sort((left, right) => {
        if (stryMutAct_9fa48("153852")) {
          {}
        } else {
          stryCov_9fa48("153852");
          const leftNodeId = left[COLUMN.NODE_ID];
          const rightNodeId = right[COLUMN.NODE_ID];
          if (stryMutAct_9fa48("153856") ? leftNodeId >= rightNodeId : stryMutAct_9fa48("153855") ? leftNodeId <= rightNodeId : stryMutAct_9fa48("153854") ? false : stryMutAct_9fa48("153853") ? true : (stryCov_9fa48("153853", "153854", "153855", "153856"), leftNodeId < rightNodeId)) {
            if (stryMutAct_9fa48("153857")) {
              {}
            } else {
              stryCov_9fa48("153857");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("153861") ? leftNodeId <= rightNodeId : stryMutAct_9fa48("153860") ? leftNodeId >= rightNodeId : stryMutAct_9fa48("153859") ? false : stryMutAct_9fa48("153858") ? true : (stryCov_9fa48("153858", "153859", "153860", "153861"), leftNodeId > rightNodeId)) {
            if (stryMutAct_9fa48("153862")) {
              {}
            } else {
              stryCov_9fa48("153862");
              return NUM.ONE;
            }
          }
          const leftCreatedAt = stryMutAct_9fa48("153865") ? Number(left?.[COLUMN.CREATED_AT]) && NUM.ZERO : stryMutAct_9fa48("153864") ? false : stryMutAct_9fa48("153863") ? true : (stryCov_9fa48("153863", "153864", "153865"), Number(stryMutAct_9fa48("153866") ? left[COLUMN.CREATED_AT] : (stryCov_9fa48("153866"), left?.[COLUMN.CREATED_AT])) || NUM.ZERO);
          const rightCreatedAt = stryMutAct_9fa48("153869") ? Number(right?.[COLUMN.CREATED_AT]) && NUM.ZERO : stryMutAct_9fa48("153868") ? false : stryMutAct_9fa48("153867") ? true : (stryCov_9fa48("153867", "153868", "153869"), Number(stryMutAct_9fa48("153870") ? right[COLUMN.CREATED_AT] : (stryCov_9fa48("153870"), right?.[COLUMN.CREATED_AT])) || NUM.ZERO);
          return stryMutAct_9fa48("153871") ? leftCreatedAt + rightCreatedAt : (stryCov_9fa48("153871"), leftCreatedAt - rightCreatedAt);
        }
      }));
    }
  }

  /**
   * Check whether a node set includes node ID.
   * @param {Object[]} members
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  includesNodeId(members, nodeId) {
    if (stryMutAct_9fa48("153872")) {
      {}
    } else {
      stryCov_9fa48("153872");
      return stryMutAct_9fa48("153873") ? members.every(member => member?.[COLUMN.NODE_ID] === nodeId) : (stryCov_9fa48("153873"), members.some(stryMutAct_9fa48("153874") ? () => undefined : (stryCov_9fa48("153874"), member => stryMutAct_9fa48("153877") ? member?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("153876") ? false : stryMutAct_9fa48("153875") ? true : (stryCov_9fa48("153875", "153876", "153877"), (stryMutAct_9fa48("153878") ? member[COLUMN.NODE_ID] : (stryCov_9fa48("153878"), member?.[COLUMN.NODE_ID])) === nodeId))));
    }
  }

  /**
   * Current timestamp.
   * @return {number}
   * @private
   */
  now() {
    if (stryMutAct_9fa48("153879")) {
      {}
    } else {
      stryCov_9fa48("153879");
      return this.nowFn();
    }
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("153880")) {
      {}
    } else {
      stryCov_9fa48("153880");
      return stryMutAct_9fa48("153881") ? {} : (stryCov_9fa48("153881"), {
        ...this.stats
      });
    }
  }
}
export { GroupSelectionService };