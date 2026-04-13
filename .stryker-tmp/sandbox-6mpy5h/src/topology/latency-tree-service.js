/**
 * LatencyTreeService - single owner for in-memory latency topology ordering.
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
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { LATENCY_GROUP_STATE } from './latency-topology-constants.js';
import { LATENCY_TREE_DEFAULT, LATENCY_TREE_ERROR_MSG, LATENCY_TREE_EVENT, LATENCY_TREE_LOG_MSG, LATENCY_TREE_REASON, LATENCY_TREE_STATE, LATENCY_TREE_SUBSYSTEM, LATENCY_TREE_TABLE } from './latency-tree-constants.js';
class LatencyTreeService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("154721")) {
      {}
    } else {
      stryCov_9fa48("154721");
      super();
      this.nodeId = stryMutAct_9fa48("154724") ? options.nodeId && null : stryMutAct_9fa48("154723") ? false : stryMutAct_9fa48("154722") ? true : (stryCov_9fa48("154722", "154723", "154724"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("154727") ? options.systemTableCache && null : stryMutAct_9fa48("154726") ? false : stryMutAct_9fa48("154725") ? true : (stryCov_9fa48("154725", "154726", "154727"), options.systemTableCache || null);
      this.nowFn = stryMutAct_9fa48("154730") ? options.nowFn && Date.now : stryMutAct_9fa48("154729") ? false : stryMutAct_9fa48("154728") ? true : (stryCov_9fa48("154728", "154729", "154730"), options.nowFn || Date.now);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(LATENCY_TREE_SUBSYSTEM) : console;
      this.state = LATENCY_TREE_STATE.CREATED;
      this.localGroupId = null;
      this.sourceViews = new Map();
      this.cacheListener = null;
      this.stats = stryMutAct_9fa48("154731") ? {} : (stryCov_9fa48("154731"), {
        recomputeCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
        cacheChangeTriggerCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
        groupCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
        edgeCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
        lastRecomputeAt: null,
        lastReason: null
      });
    }
  }

  /**
   * Initialize dependencies.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("154732")) {
      {}
    } else {
      stryCov_9fa48("154732");
      if (stryMutAct_9fa48("154734") ? false : stryMutAct_9fa48("154733") ? true : (stryCov_9fa48("154733", "154734"), options.nodeId)) {
        if (stryMutAct_9fa48("154735")) {
          {}
        } else {
          stryCov_9fa48("154735");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("154737") ? false : stryMutAct_9fa48("154736") ? true : (stryCov_9fa48("154736", "154737"), options.systemTableCache)) {
        if (stryMutAct_9fa48("154738")) {
          {}
        } else {
          stryCov_9fa48("154738");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("154740") ? false : stryMutAct_9fa48("154739") ? true : (stryCov_9fa48("154739", "154740"), options.nowFn)) {
        if (stryMutAct_9fa48("154741")) {
          {}
        } else {
          stryCov_9fa48("154741");
          this.nowFn = options.nowFn;
        }
      }
      this.nodeId = assertCritical(this.nodeId, LATENCY_TREE_ERROR_MSG.MISSING_NODE_ID);
      this.systemTableCache = assertCritical(this.systemTableCache, LATENCY_TREE_ERROR_MSG.MISSING_CACHE);
      this.state = LATENCY_TREE_STATE.INITIALIZED;
      this.logger.info(LATENCY_TREE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("154742") ? {} : (stryCov_9fa48("154742"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Start topology recomputation lifecycle.
   * @param {Object} options
   * @param {boolean} options.recomputeImmediately
   */
  start(options = {}) {
    if (stryMutAct_9fa48("154743")) {
      {}
    } else {
      stryCov_9fa48("154743");
      this.ensureInitialized();
      if (stryMutAct_9fa48("154746") ? this.state !== LATENCY_TREE_STATE.RUNNING : stryMutAct_9fa48("154745") ? false : stryMutAct_9fa48("154744") ? true : (stryCov_9fa48("154744", "154745", "154746"), this.state === LATENCY_TREE_STATE.RUNNING)) {
        if (stryMutAct_9fa48("154747")) {
          {}
        } else {
          stryCov_9fa48("154747");
          return;
        }
      }
      this.cacheListener = tableName => {
        if (stryMutAct_9fa48("154748")) {
          {}
        } else {
          stryCov_9fa48("154748");
          if (stryMutAct_9fa48("154751") ? false : stryMutAct_9fa48("154750") ? true : stryMutAct_9fa48("154749") ? LATENCY_TREE_TABLE.WATCHED.includes(tableName) : (stryCov_9fa48("154749", "154750", "154751"), !LATENCY_TREE_TABLE.WATCHED.includes(tableName))) {
            if (stryMutAct_9fa48("154752")) {
              {}
            } else {
              stryCov_9fa48("154752");
              return;
            }
          }
          stryMutAct_9fa48("154753") ? this.stats.cacheChangeTriggerCount -= NUM.ONE : (stryCov_9fa48("154753"), this.stats.cacheChangeTriggerCount += NUM.ONE);
          this.recompute(stryMutAct_9fa48("154754") ? {} : (stryCov_9fa48("154754"), {
            reason: LATENCY_TREE_REASON.TOPOLOGY_CHANGE
          }));
        }
      };
      if (stryMutAct_9fa48("154757") ? typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("154756") ? false : stryMutAct_9fa48("154755") ? true : (stryCov_9fa48("154755", "154756", "154757"), typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("154758")) {
          {}
        } else {
          stryCov_9fa48("154758");
          this.systemTableCache.onCacheChange(this.cacheListener);
        }
      }
      this.state = LATENCY_TREE_STATE.RUNNING;
      this.logger.info(LATENCY_TREE_LOG_MSG.STARTED, stryMutAct_9fa48("154759") ? {} : (stryCov_9fa48("154759"), {
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("154762") ? options.recomputeImmediately === false : stryMutAct_9fa48("154761") ? false : stryMutAct_9fa48("154760") ? true : (stryCov_9fa48("154760", "154761", "154762"), options.recomputeImmediately !== (stryMutAct_9fa48("154763") ? true : (stryCov_9fa48("154763"), false)))) {
        if (stryMutAct_9fa48("154764")) {
          {}
        } else {
          stryCov_9fa48("154764");
          this.recompute(stryMutAct_9fa48("154765") ? {} : (stryCov_9fa48("154765"), {
            reason: LATENCY_TREE_REASON.START
          }));
        }
      }
    }
  }

  /**
   * Stop topology recomputation lifecycle.
   */
  stop() {
    if (stryMutAct_9fa48("154766")) {
      {}
    } else {
      stryCov_9fa48("154766");
      if (stryMutAct_9fa48("154769") ? this.cacheListener || typeof this.systemTableCache?.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("154768") ? false : stryMutAct_9fa48("154767") ? true : (stryCov_9fa48("154767", "154768", "154769"), this.cacheListener && (stryMutAct_9fa48("154771") ? typeof this.systemTableCache?.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("154770") ? true : (stryCov_9fa48("154770", "154771"), typeof (stryMutAct_9fa48("154772") ? this.systemTableCache.offCacheChange : (stryCov_9fa48("154772"), this.systemTableCache?.offCacheChange)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("154773")) {
          {}
        } else {
          stryCov_9fa48("154773");
          this.systemTableCache.offCacheChange(this.cacheListener);
        }
      }
      this.cacheListener = null;
      this.state = LATENCY_TREE_STATE.STOPPED;
      this.logger.info(LATENCY_TREE_LOG_MSG.STOPPED, stryMutAct_9fa48("154774") ? {} : (stryCov_9fa48("154774"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Recompute derived topology view from system-table metadata.
   * @param {Object} options
   * @param {string} options.reason
   * @return {Object}
   */
  recompute(options = {}) {
    if (stryMutAct_9fa48("154775")) {
      {}
    } else {
      stryCov_9fa48("154775");
      this.ensureInitialized();
      const reason = stryMutAct_9fa48("154778") ? options.reason && LATENCY_TREE_REASON.MANUAL : stryMutAct_9fa48("154777") ? false : stryMutAct_9fa48("154776") ? true : (stryCov_9fa48("154776", "154777", "154778"), options.reason || LATENCY_TREE_REASON.MANUAL);
      const groupIds = this.getActiveGroupIds();
      const localGroupId = this.resolveLocalGroupId();
      if (stryMutAct_9fa48("154780") ? false : stryMutAct_9fa48("154779") ? true : (stryCov_9fa48("154779", "154780"), localGroupId)) {
        if (stryMutAct_9fa48("154781")) {
          {}
        } else {
          stryCov_9fa48("154781");
          groupIds.add(localGroupId);
        }
      }
      const adjacency = this.buildAdjacency(groupIds);
      const orderedGroupIds = stryMutAct_9fa48("154782") ? [...groupIds] : (stryCov_9fa48("154782"), (stryMutAct_9fa48("154783") ? [] : (stryCov_9fa48("154783"), [...groupIds])).sort());
      const sourceViews = new Map();
      for (const sourceGroupId of orderedGroupIds) {
        if (stryMutAct_9fa48("154784")) {
          {}
        } else {
          stryCov_9fa48("154784");
          const neighborOrder = this.buildNeighborOrder(sourceGroupId, adjacency);
          const routingOrder = this.buildRoutingOrder(sourceGroupId, orderedGroupIds, adjacency);
          sourceViews.set(sourceGroupId, stryMutAct_9fa48("154785") ? {} : (stryCov_9fa48("154785"), {
            sourceGroupId,
            neighborOrder,
            routingOrder
          }));
        }
      }
      this.localGroupId = localGroupId;
      this.sourceViews = sourceViews;
      stryMutAct_9fa48("154786") ? this.stats.recomputeCount -= NUM.ONE : (stryCov_9fa48("154786"), this.stats.recomputeCount += NUM.ONE);
      this.stats.groupCount = orderedGroupIds.length;
      this.stats.edgeCount = this.countUndirectedEdges(adjacency);
      this.stats.lastRecomputeAt = this.now();
      this.stats.lastReason = reason;
      const payload = stryMutAct_9fa48("154787") ? {} : (stryCov_9fa48("154787"), {
        reason,
        localGroupId: this.localGroupId,
        groupCount: this.stats.groupCount,
        edgeCount: this.stats.edgeCount,
        recomputeCount: this.stats.recomputeCount
      });
      this.emit(LATENCY_TREE_EVENT.RECOMPUTED, payload);
      this.logger.debug(LATENCY_TREE_LOG_MSG.RECOMPUTED, stryMutAct_9fa48("154788") ? {} : (stryCov_9fa48("154788"), {
        nodeId: this.nodeId,
        ...payload
      }));
      return payload;
    }
  }

  /**
   * Get ordered target groups for a source group.
   * @param {string} sourceGroupId
   * @return {string[]}
   */
  getRoutingOrder(sourceGroupId = this.localGroupId) {
    if (stryMutAct_9fa48("154789")) {
      {}
    } else {
      stryCov_9fa48("154789");
      if (stryMutAct_9fa48("154792") ? false : stryMutAct_9fa48("154791") ? true : stryMutAct_9fa48("154790") ? sourceGroupId : (stryCov_9fa48("154790", "154791", "154792"), !sourceGroupId)) {
        if (stryMutAct_9fa48("154793")) {
          {}
        } else {
          stryCov_9fa48("154793");
          return stryMutAct_9fa48("154794") ? ["Stryker was here"] : (stryCov_9fa48("154794"), []);
        }
      }
      const view = this.sourceViews.get(sourceGroupId);
      if (stryMutAct_9fa48("154797") ? false : stryMutAct_9fa48("154796") ? true : stryMutAct_9fa48("154795") ? view : (stryCov_9fa48("154795", "154796", "154797"), !view)) {
        if (stryMutAct_9fa48("154798")) {
          {}
        } else {
          stryCov_9fa48("154798");
          return stryMutAct_9fa48("154799") ? [] : (stryCov_9fa48("154799"), [sourceGroupId]);
        }
      }
      return stryMutAct_9fa48("154800") ? [] : (stryCov_9fa48("154800"), [...view.routingOrder]);
    }
  }

  /**
   * Get neighbor order for a source group.
   * @param {string} sourceGroupId
   * @return {Object[]}
   */
  getNeighborOrder(sourceGroupId = this.localGroupId) {
    if (stryMutAct_9fa48("154801")) {
      {}
    } else {
      stryCov_9fa48("154801");
      if (stryMutAct_9fa48("154804") ? false : stryMutAct_9fa48("154803") ? true : stryMutAct_9fa48("154802") ? sourceGroupId : (stryCov_9fa48("154802", "154803", "154804"), !sourceGroupId)) {
        if (stryMutAct_9fa48("154805")) {
          {}
        } else {
          stryCov_9fa48("154805");
          return stryMutAct_9fa48("154806") ? ["Stryker was here"] : (stryCov_9fa48("154806"), []);
        }
      }
      const view = this.sourceViews.get(sourceGroupId);
      if (stryMutAct_9fa48("154809") ? false : stryMutAct_9fa48("154808") ? true : stryMutAct_9fa48("154807") ? view : (stryCov_9fa48("154807", "154808", "154809"), !view)) {
        if (stryMutAct_9fa48("154810")) {
          {}
        } else {
          stryCov_9fa48("154810");
          return stryMutAct_9fa48("154811") ? ["Stryker was here"] : (stryCov_9fa48("154811"), []);
        }
      }
      return view.neighborOrder.map(stryMutAct_9fa48("154812") ? () => undefined : (stryCov_9fa48("154812"), neighbor => stryMutAct_9fa48("154813") ? {} : (stryCov_9fa48("154813"), {
        ...neighbor
      })));
    }
  }

  /**
   * Resolve direct edge latency between source and target groups.
   * @param {string} sourceGroupId
   * @param {string} targetGroupId
   * @return {number|null}
   */
  getLatencyMs(sourceGroupId, targetGroupId) {
    if (stryMutAct_9fa48("154814")) {
      {}
    } else {
      stryCov_9fa48("154814");
      if (stryMutAct_9fa48("154817") ? !sourceGroupId && !targetGroupId : stryMutAct_9fa48("154816") ? false : stryMutAct_9fa48("154815") ? true : (stryCov_9fa48("154815", "154816", "154817"), (stryMutAct_9fa48("154818") ? sourceGroupId : (stryCov_9fa48("154818"), !sourceGroupId)) || (stryMutAct_9fa48("154819") ? targetGroupId : (stryCov_9fa48("154819"), !targetGroupId)))) {
        if (stryMutAct_9fa48("154820")) {
          {}
        } else {
          stryCov_9fa48("154820");
          return null;
        }
      }
      const view = this.sourceViews.get(sourceGroupId);
      if (stryMutAct_9fa48("154823") ? false : stryMutAct_9fa48("154822") ? true : stryMutAct_9fa48("154821") ? view : (stryCov_9fa48("154821", "154822", "154823"), !view)) {
        if (stryMutAct_9fa48("154824")) {
          {}
        } else {
          stryCov_9fa48("154824");
          return null;
        }
      }
      const neighbor = view.neighborOrder.find(stryMutAct_9fa48("154825") ? () => undefined : (stryCov_9fa48("154825"), entry => stryMutAct_9fa48("154828") ? entry.targetGroupId !== targetGroupId : stryMutAct_9fa48("154827") ? false : stryMutAct_9fa48("154826") ? true : (stryCov_9fa48("154826", "154827", "154828"), entry.targetGroupId === targetGroupId)));
      return neighbor ? neighbor.latencyMs : null;
    }
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("154829")) {
      {}
    } else {
      stryCov_9fa48("154829");
      return stryMutAct_9fa48("154830") ? {} : (stryCov_9fa48("154830"), {
        ...this.stats,
        nodeId: this.nodeId,
        state: this.state,
        localGroupId: this.localGroupId
      });
    }
  }

  /**
   * Get active group IDs from cache metadata.
   * @return {Set<string>}
   * @private
   */
  getActiveGroupIds() {
    if (stryMutAct_9fa48("154831")) {
      {}
    } else {
      stryCov_9fa48("154831");
      const rows = stryMutAct_9fa48("154834") ? this.systemTableCache.getAll(TABLES.LATENCY_GROUPS) && [] : stryMutAct_9fa48("154833") ? false : stryMutAct_9fa48("154832") ? true : (stryCov_9fa48("154832", "154833", "154834"), this.systemTableCache.getAll(TABLES.LATENCY_GROUPS) || (stryMutAct_9fa48("154835") ? ["Stryker was here"] : (stryCov_9fa48("154835"), [])));
      const groupIds = new Set();
      for (const row of rows) {
        if (stryMutAct_9fa48("154836")) {
          {}
        } else {
          stryCov_9fa48("154836");
          const groupId = stryMutAct_9fa48("154837") ? row[COLUMN.GROUP_ID] : (stryCov_9fa48("154837"), row?.[COLUMN.GROUP_ID]);
          const state = stryMutAct_9fa48("154838") ? row[COLUMN.STATE] : (stryCov_9fa48("154838"), row?.[COLUMN.STATE]);
          if (stryMutAct_9fa48("154841") ? false : stryMutAct_9fa48("154840") ? true : stryMutAct_9fa48("154839") ? groupId : (stryCov_9fa48("154839", "154840", "154841"), !groupId)) {
            if (stryMutAct_9fa48("154842")) {
              {}
            } else {
              stryCov_9fa48("154842");
              continue;
            }
          }
          if (stryMutAct_9fa48("154845") ? !state && state === LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("154844") ? false : stryMutAct_9fa48("154843") ? true : (stryCov_9fa48("154843", "154844", "154845"), (stryMutAct_9fa48("154846") ? state : (stryCov_9fa48("154846"), !state)) || (stryMutAct_9fa48("154848") ? state !== LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("154847") ? false : (stryCov_9fa48("154847", "154848"), state === LATENCY_GROUP_STATE.ACTIVE)))) {
            if (stryMutAct_9fa48("154849")) {
              {}
            } else {
              stryCov_9fa48("154849");
              groupIds.add(groupId);
            }
          }
        }
      }
      return groupIds;
    }
  }

  /**
   * Resolve local node's current latency group ID.
   * @return {string|null}
   * @private
   */
  resolveLocalGroupId() {
    if (stryMutAct_9fa48("154850")) {
      {}
    } else {
      stryCov_9fa48("154850");
      const localNode = this.systemTableCache.get(TABLES.NODES, this.nodeId);
      const localGroupId = stryMutAct_9fa48("154851") ? localNode[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("154851"), localNode?.[COLUMN.LATENCY_GROUP_ID]);
      return stryMutAct_9fa48("154854") ? localGroupId && null : stryMutAct_9fa48("154853") ? false : stryMutAct_9fa48("154852") ? true : (stryCov_9fa48("154852", "154853", "154854"), localGroupId || null);
    }
  }

  /**
   * Build undirected adjacency map from inter_group_latencies rows.
   * @param {Set<string>} groupIds
   * @return {Map<string, Map<string, Object>>}
   * @private
   */
  buildAdjacency(groupIds) {
    if (stryMutAct_9fa48("154855")) {
      {}
    } else {
      stryCov_9fa48("154855");
      const adjacency = new Map();
      for (const groupId of groupIds) {
        if (stryMutAct_9fa48("154856")) {
          {}
        } else {
          stryCov_9fa48("154856");
          adjacency.set(groupId, new Map());
        }
      }
      const rows = stryMutAct_9fa48("154859") ? this.systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) && [] : stryMutAct_9fa48("154858") ? false : stryMutAct_9fa48("154857") ? true : (stryCov_9fa48("154857", "154858", "154859"), this.systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) || (stryMutAct_9fa48("154860") ? ["Stryker was here"] : (stryCov_9fa48("154860"), [])));
      for (const row of rows) {
        if (stryMutAct_9fa48("154861")) {
          {}
        } else {
          stryCov_9fa48("154861");
          const sourceGroupId = stryMutAct_9fa48("154862") ? row[COLUMN.SOURCE_GROUP_ID] : (stryCov_9fa48("154862"), row?.[COLUMN.SOURCE_GROUP_ID]);
          const targetGroupId = stryMutAct_9fa48("154863") ? row[COLUMN.TARGET_GROUP_ID] : (stryCov_9fa48("154863"), row?.[COLUMN.TARGET_GROUP_ID]);
          const latencyMs = Number(stryMutAct_9fa48("154864") ? row[COLUMN.LATENCY_MS] : (stryCov_9fa48("154864"), row?.[COLUMN.LATENCY_MS]));
          const sampleCount = Number(stryMutAct_9fa48("154865") ? row[COLUMN.SAMPLE_COUNT] : (stryCov_9fa48("154865"), row?.[COLUMN.SAMPLE_COUNT]));
          const lastMeasuredAt = stryMutAct_9fa48("154868") ? Number(row?.[COLUMN.LAST_MEASURED_AT]) && null : stryMutAct_9fa48("154867") ? false : stryMutAct_9fa48("154866") ? true : (stryCov_9fa48("154866", "154867", "154868"), Number(stryMutAct_9fa48("154869") ? row[COLUMN.LAST_MEASURED_AT] : (stryCov_9fa48("154869"), row?.[COLUMN.LAST_MEASURED_AT])) || null);
          if (stryMutAct_9fa48("154872") ? (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId || !Number.isFinite(latencyMs) || latencyMs < LATENCY_TREE_DEFAULT.DISTANCE_SELF || !Number.isFinite(sampleCount)) && sampleCount < LATENCY_TREE_DEFAULT.EDGE_MIN_SAMPLE_COUNT : stryMutAct_9fa48("154871") ? false : stryMutAct_9fa48("154870") ? true : (stryCov_9fa48("154870", "154871", "154872"), (stryMutAct_9fa48("154874") ? (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId || !Number.isFinite(latencyMs) || latencyMs < LATENCY_TREE_DEFAULT.DISTANCE_SELF) && !Number.isFinite(sampleCount) : stryMutAct_9fa48("154873") ? false : (stryCov_9fa48("154873", "154874"), (stryMutAct_9fa48("154876") ? (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId || !Number.isFinite(latencyMs)) && latencyMs < LATENCY_TREE_DEFAULT.DISTANCE_SELF : stryMutAct_9fa48("154875") ? false : (stryCov_9fa48("154875", "154876"), (stryMutAct_9fa48("154878") ? (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) && !Number.isFinite(latencyMs) : stryMutAct_9fa48("154877") ? false : (stryCov_9fa48("154877", "154878"), (stryMutAct_9fa48("154880") ? (!sourceGroupId || !targetGroupId) && sourceGroupId === targetGroupId : stryMutAct_9fa48("154879") ? false : (stryCov_9fa48("154879", "154880"), (stryMutAct_9fa48("154882") ? !sourceGroupId && !targetGroupId : stryMutAct_9fa48("154881") ? false : (stryCov_9fa48("154881", "154882"), (stryMutAct_9fa48("154883") ? sourceGroupId : (stryCov_9fa48("154883"), !sourceGroupId)) || (stryMutAct_9fa48("154884") ? targetGroupId : (stryCov_9fa48("154884"), !targetGroupId)))) || (stryMutAct_9fa48("154886") ? sourceGroupId !== targetGroupId : stryMutAct_9fa48("154885") ? false : (stryCov_9fa48("154885", "154886"), sourceGroupId === targetGroupId)))) || (stryMutAct_9fa48("154887") ? Number.isFinite(latencyMs) : (stryCov_9fa48("154887"), !Number.isFinite(latencyMs))))) || (stryMutAct_9fa48("154890") ? latencyMs >= LATENCY_TREE_DEFAULT.DISTANCE_SELF : stryMutAct_9fa48("154889") ? latencyMs <= LATENCY_TREE_DEFAULT.DISTANCE_SELF : stryMutAct_9fa48("154888") ? false : (stryCov_9fa48("154888", "154889", "154890"), latencyMs < LATENCY_TREE_DEFAULT.DISTANCE_SELF)))) || (stryMutAct_9fa48("154891") ? Number.isFinite(sampleCount) : (stryCov_9fa48("154891"), !Number.isFinite(sampleCount))))) || (stryMutAct_9fa48("154894") ? sampleCount >= LATENCY_TREE_DEFAULT.EDGE_MIN_SAMPLE_COUNT : stryMutAct_9fa48("154893") ? sampleCount <= LATENCY_TREE_DEFAULT.EDGE_MIN_SAMPLE_COUNT : stryMutAct_9fa48("154892") ? false : (stryCov_9fa48("154892", "154893", "154894"), sampleCount < LATENCY_TREE_DEFAULT.EDGE_MIN_SAMPLE_COUNT)))) {
            if (stryMutAct_9fa48("154895")) {
              {}
            } else {
              stryCov_9fa48("154895");
              continue;
            }
          }
          if (stryMutAct_9fa48("154898") ? !groupIds.has(sourceGroupId) && !groupIds.has(targetGroupId) : stryMutAct_9fa48("154897") ? false : stryMutAct_9fa48("154896") ? true : (stryCov_9fa48("154896", "154897", "154898"), (stryMutAct_9fa48("154899") ? groupIds.has(sourceGroupId) : (stryCov_9fa48("154899"), !groupIds.has(sourceGroupId))) || (stryMutAct_9fa48("154900") ? groupIds.has(targetGroupId) : (stryCov_9fa48("154900"), !groupIds.has(targetGroupId))))) {
            if (stryMutAct_9fa48("154901")) {
              {}
            } else {
              stryCov_9fa48("154901");
              continue;
            }
          }
          this.upsertEdge(adjacency, sourceGroupId, targetGroupId, stryMutAct_9fa48("154902") ? {} : (stryCov_9fa48("154902"), {
            targetGroupId,
            latencyMs,
            sampleCount,
            lastMeasuredAt
          }));
          this.upsertEdge(adjacency, targetGroupId, sourceGroupId, stryMutAct_9fa48("154903") ? {} : (stryCov_9fa48("154903"), {
            targetGroupId: sourceGroupId,
            latencyMs,
            sampleCount,
            lastMeasuredAt
          }));
        }
      }
      return adjacency;
    }
  }

  /**
   * Upsert one directed edge in adjacency map using lowest-latency row.
   * @param {Map<string, Map<string, Object>>} adjacency
   * @param {string} sourceGroupId
   * @param {string} targetGroupId
   * @param {Object} edge
   * @private
   */
  upsertEdge(adjacency, sourceGroupId, targetGroupId, edge) {
    if (stryMutAct_9fa48("154904")) {
      {}
    } else {
      stryCov_9fa48("154904");
      const neighbors = adjacency.get(sourceGroupId);
      if (stryMutAct_9fa48("154907") ? false : stryMutAct_9fa48("154906") ? true : stryMutAct_9fa48("154905") ? neighbors : (stryCov_9fa48("154905", "154906", "154907"), !neighbors)) {
        if (stryMutAct_9fa48("154908")) {
          {}
        } else {
          stryCov_9fa48("154908");
          return;
        }
      }
      const existing = neighbors.get(targetGroupId);
      if (stryMutAct_9fa48("154911") ? (!existing || edge.latencyMs < existing.latencyMs) && edge.latencyMs === existing.latencyMs && targetGroupId < existing.targetGroupId : stryMutAct_9fa48("154910") ? false : stryMutAct_9fa48("154909") ? true : (stryCov_9fa48("154909", "154910", "154911"), (stryMutAct_9fa48("154913") ? !existing && edge.latencyMs < existing.latencyMs : stryMutAct_9fa48("154912") ? false : (stryCov_9fa48("154912", "154913"), (stryMutAct_9fa48("154914") ? existing : (stryCov_9fa48("154914"), !existing)) || (stryMutAct_9fa48("154917") ? edge.latencyMs >= existing.latencyMs : stryMutAct_9fa48("154916") ? edge.latencyMs <= existing.latencyMs : stryMutAct_9fa48("154915") ? false : (stryCov_9fa48("154915", "154916", "154917"), edge.latencyMs < existing.latencyMs)))) || (stryMutAct_9fa48("154919") ? edge.latencyMs === existing.latencyMs || targetGroupId < existing.targetGroupId : stryMutAct_9fa48("154918") ? false : (stryCov_9fa48("154918", "154919"), (stryMutAct_9fa48("154921") ? edge.latencyMs !== existing.latencyMs : stryMutAct_9fa48("154920") ? true : (stryCov_9fa48("154920", "154921"), edge.latencyMs === existing.latencyMs)) && (stryMutAct_9fa48("154924") ? targetGroupId >= existing.targetGroupId : stryMutAct_9fa48("154923") ? targetGroupId <= existing.targetGroupId : stryMutAct_9fa48("154922") ? true : (stryCov_9fa48("154922", "154923", "154924"), targetGroupId < existing.targetGroupId)))))) {
        if (stryMutAct_9fa48("154925")) {
          {}
        } else {
          stryCov_9fa48("154925");
          neighbors.set(targetGroupId, edge);
        }
      }
    }
  }

  /**
   * Build neighbor order for a source group.
   * @param {string} sourceGroupId
   * @param {Map<string, Map<string, Object>>} adjacency
   * @return {Object[]}
   * @private
   */
  buildNeighborOrder(sourceGroupId, adjacency) {
    if (stryMutAct_9fa48("154926")) {
      {}
    } else {
      stryCov_9fa48("154926");
      const neighbors = adjacency.get(sourceGroupId);
      if (stryMutAct_9fa48("154929") ? false : stryMutAct_9fa48("154928") ? true : stryMutAct_9fa48("154927") ? neighbors : (stryCov_9fa48("154927", "154928", "154929"), !neighbors)) {
        if (stryMutAct_9fa48("154930")) {
          {}
        } else {
          stryCov_9fa48("154930");
          return stryMutAct_9fa48("154931") ? ["Stryker was here"] : (stryCov_9fa48("154931"), []);
        }
      }
      return stryMutAct_9fa48("154932") ? [...neighbors.values()] : (stryCov_9fa48("154932"), (stryMutAct_9fa48("154933") ? [] : (stryCov_9fa48("154933"), [...neighbors.values()])).sort((left, right) => {
        if (stryMutAct_9fa48("154934")) {
          {}
        } else {
          stryCov_9fa48("154934");
          if (stryMutAct_9fa48("154937") ? left.latencyMs === right.latencyMs : stryMutAct_9fa48("154936") ? false : stryMutAct_9fa48("154935") ? true : (stryCov_9fa48("154935", "154936", "154937"), left.latencyMs !== right.latencyMs)) {
            if (stryMutAct_9fa48("154938")) {
              {}
            } else {
              stryCov_9fa48("154938");
              return stryMutAct_9fa48("154939") ? left.latencyMs + right.latencyMs : (stryCov_9fa48("154939"), left.latencyMs - right.latencyMs);
            }
          }
          if (stryMutAct_9fa48("154943") ? left.targetGroupId >= right.targetGroupId : stryMutAct_9fa48("154942") ? left.targetGroupId <= right.targetGroupId : stryMutAct_9fa48("154941") ? false : stryMutAct_9fa48("154940") ? true : (stryCov_9fa48("154940", "154941", "154942", "154943"), left.targetGroupId < right.targetGroupId)) {
            if (stryMutAct_9fa48("154944")) {
              {}
            } else {
              stryCov_9fa48("154944");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("154948") ? left.targetGroupId <= right.targetGroupId : stryMutAct_9fa48("154947") ? left.targetGroupId >= right.targetGroupId : stryMutAct_9fa48("154946") ? false : stryMutAct_9fa48("154945") ? true : (stryCov_9fa48("154945", "154946", "154947", "154948"), left.targetGroupId > right.targetGroupId)) {
            if (stryMutAct_9fa48("154949")) {
              {}
            } else {
              stryCov_9fa48("154949");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Build deterministic routing order by shortest distance, then group ID.
   * @param {string} sourceGroupId
   * @param {string[]} orderedGroupIds
   * @param {Map<string, Map<string, Object>>} adjacency
   * @return {string[]}
   * @private
   */
  buildRoutingOrder(sourceGroupId, orderedGroupIds, adjacency) {
    if (stryMutAct_9fa48("154950")) {
      {}
    } else {
      stryCov_9fa48("154950");
      const distances = this.computeShortestDistances(sourceGroupId, orderedGroupIds, adjacency);
      return stryMutAct_9fa48("154951") ? [...orderedGroupIds] : (stryCov_9fa48("154951"), (stryMutAct_9fa48("154952") ? [] : (stryCov_9fa48("154952"), [...orderedGroupIds])).sort((left, right) => {
        if (stryMutAct_9fa48("154953")) {
          {}
        } else {
          stryCov_9fa48("154953");
          const leftDistance = stryMutAct_9fa48("154954") ? distances.get(left) && LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE : (stryCov_9fa48("154954"), distances.get(left) ?? LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE);
          const rightDistance = stryMutAct_9fa48("154955") ? distances.get(right) && LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE : (stryCov_9fa48("154955"), distances.get(right) ?? LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE);
          if (stryMutAct_9fa48("154958") ? leftDistance === rightDistance : stryMutAct_9fa48("154957") ? false : stryMutAct_9fa48("154956") ? true : (stryCov_9fa48("154956", "154957", "154958"), leftDistance !== rightDistance)) {
            if (stryMutAct_9fa48("154959")) {
              {}
            } else {
              stryCov_9fa48("154959");
              return stryMutAct_9fa48("154960") ? leftDistance + rightDistance : (stryCov_9fa48("154960"), leftDistance - rightDistance);
            }
          }
          if (stryMutAct_9fa48("154964") ? left >= right : stryMutAct_9fa48("154963") ? left <= right : stryMutAct_9fa48("154962") ? false : stryMutAct_9fa48("154961") ? true : (stryCov_9fa48("154961", "154962", "154963", "154964"), left < right)) {
            if (stryMutAct_9fa48("154965")) {
              {}
            } else {
              stryCov_9fa48("154965");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("154969") ? left <= right : stryMutAct_9fa48("154968") ? left >= right : stryMutAct_9fa48("154967") ? false : stryMutAct_9fa48("154966") ? true : (stryCov_9fa48("154966", "154967", "154968", "154969"), left > right)) {
            if (stryMutAct_9fa48("154970")) {
              {}
            } else {
              stryCov_9fa48("154970");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Compute shortest distances from one source across undirected graph.
   * @param {string} sourceGroupId
   * @param {string[]} orderedGroupIds
   * @param {Map<string, Map<string, Object>>} adjacency
   * @return {Map<string, number>}
   * @private
   */
  computeShortestDistances(sourceGroupId, orderedGroupIds, adjacency) {
    if (stryMutAct_9fa48("154971")) {
      {}
    } else {
      stryCov_9fa48("154971");
      const distances = new Map();
      const visited = new Set();
      for (const groupId of orderedGroupIds) {
        if (stryMutAct_9fa48("154972")) {
          {}
        } else {
          stryCov_9fa48("154972");
          distances.set(groupId, LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE);
        }
      }
      distances.set(sourceGroupId, LATENCY_TREE_DEFAULT.DISTANCE_SELF);
      while (stryMutAct_9fa48("154975") ? visited.size >= orderedGroupIds.length : stryMutAct_9fa48("154974") ? visited.size <= orderedGroupIds.length : stryMutAct_9fa48("154973") ? false : (stryCov_9fa48("154973", "154974", "154975"), visited.size < orderedGroupIds.length)) {
        if (stryMutAct_9fa48("154976")) {
          {}
        } else {
          stryCov_9fa48("154976");
          const currentGroupId = this.selectNearestUnvisited(orderedGroupIds, visited, distances);
          if (stryMutAct_9fa48("154979") ? false : stryMutAct_9fa48("154978") ? true : stryMutAct_9fa48("154977") ? currentGroupId : (stryCov_9fa48("154977", "154978", "154979"), !currentGroupId)) {
            if (stryMutAct_9fa48("154980")) {
              {}
            } else {
              stryCov_9fa48("154980");
              break;
            }
          }
          visited.add(currentGroupId);
          const currentDistance = distances.get(currentGroupId);
          if (stryMutAct_9fa48("154983") ? false : stryMutAct_9fa48("154982") ? true : stryMutAct_9fa48("154981") ? Number.isFinite(currentDistance) : (stryCov_9fa48("154981", "154982", "154983"), !Number.isFinite(currentDistance))) {
            if (stryMutAct_9fa48("154984")) {
              {}
            } else {
              stryCov_9fa48("154984");
              continue;
            }
          }
          const neighbors = adjacency.get(currentGroupId);
          if (stryMutAct_9fa48("154987") ? false : stryMutAct_9fa48("154986") ? true : stryMutAct_9fa48("154985") ? neighbors : (stryCov_9fa48("154985", "154986", "154987"), !neighbors)) {
            if (stryMutAct_9fa48("154988")) {
              {}
            } else {
              stryCov_9fa48("154988");
              continue;
            }
          }
          for (const [neighborGroupId, edge] of neighbors.entries()) {
            if (stryMutAct_9fa48("154989")) {
              {}
            } else {
              stryCov_9fa48("154989");
              if (stryMutAct_9fa48("154991") ? false : stryMutAct_9fa48("154990") ? true : (stryCov_9fa48("154990", "154991"), visited.has(neighborGroupId))) {
                if (stryMutAct_9fa48("154992")) {
                  {}
                } else {
                  stryCov_9fa48("154992");
                  continue;
                }
              }
              const nextDistance = stryMutAct_9fa48("154993") ? currentDistance - edge.latencyMs : (stryCov_9fa48("154993"), currentDistance + edge.latencyMs);
              const previousDistance = distances.get(neighborGroupId);
              if (stryMutAct_9fa48("154997") ? nextDistance >= previousDistance : stryMutAct_9fa48("154996") ? nextDistance <= previousDistance : stryMutAct_9fa48("154995") ? false : stryMutAct_9fa48("154994") ? true : (stryCov_9fa48("154994", "154995", "154996", "154997"), nextDistance < previousDistance)) {
                if (stryMutAct_9fa48("154998")) {
                  {}
                } else {
                  stryCov_9fa48("154998");
                  distances.set(neighborGroupId, nextDistance);
                }
              }
            }
          }
        }
      }
      return distances;
    }
  }

  /**
   * Pick nearest unvisited node by distance, then group ID.
   * @param {string[]} orderedGroupIds
   * @param {Set<string>} visited
   * @param {Map<string, number>} distances
   * @return {string|null}
   * @private
   */
  selectNearestUnvisited(orderedGroupIds, visited, distances) {
    if (stryMutAct_9fa48("154999")) {
      {}
    } else {
      stryCov_9fa48("154999");
      let candidate = null;
      let candidateDistance = LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE;
      for (const groupId of orderedGroupIds) {
        if (stryMutAct_9fa48("155000")) {
          {}
        } else {
          stryCov_9fa48("155000");
          if (stryMutAct_9fa48("155002") ? false : stryMutAct_9fa48("155001") ? true : (stryCov_9fa48("155001", "155002"), visited.has(groupId))) {
            if (stryMutAct_9fa48("155003")) {
              {}
            } else {
              stryCov_9fa48("155003");
              continue;
            }
          }
          const distance = stryMutAct_9fa48("155004") ? distances.get(groupId) && LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE : (stryCov_9fa48("155004"), distances.get(groupId) ?? LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE);
          if (stryMutAct_9fa48("155008") ? distance >= candidateDistance : stryMutAct_9fa48("155007") ? distance <= candidateDistance : stryMutAct_9fa48("155006") ? false : stryMutAct_9fa48("155005") ? true : (stryCov_9fa48("155005", "155006", "155007", "155008"), distance < candidateDistance)) {
            if (stryMutAct_9fa48("155009")) {
              {}
            } else {
              stryCov_9fa48("155009");
              candidate = groupId;
              candidateDistance = distance;
              continue;
            }
          }
          if (stryMutAct_9fa48("155012") ? distance === candidateDistance && candidate || groupId < candidate : stryMutAct_9fa48("155011") ? false : stryMutAct_9fa48("155010") ? true : (stryCov_9fa48("155010", "155011", "155012"), (stryMutAct_9fa48("155014") ? distance === candidateDistance || candidate : stryMutAct_9fa48("155013") ? true : (stryCov_9fa48("155013", "155014"), (stryMutAct_9fa48("155016") ? distance !== candidateDistance : stryMutAct_9fa48("155015") ? true : (stryCov_9fa48("155015", "155016"), distance === candidateDistance)) && candidate)) && (stryMutAct_9fa48("155019") ? groupId >= candidate : stryMutAct_9fa48("155018") ? groupId <= candidate : stryMutAct_9fa48("155017") ? true : (stryCov_9fa48("155017", "155018", "155019"), groupId < candidate)))) {
            if (stryMutAct_9fa48("155020")) {
              {}
            } else {
              stryCov_9fa48("155020");
              candidate = groupId;
            }
          }
        }
      }
      return candidate;
    }
  }

  /**
   * Count undirected edges from directed adjacency.
   * @param {Map<string, Map<string, Object>>} adjacency
   * @return {number}
   * @private
   */
  countUndirectedEdges(adjacency) {
    if (stryMutAct_9fa48("155021")) {
      {}
    } else {
      stryCov_9fa48("155021");
      let directedCount = NUM.ZERO;
      for (const neighbors of adjacency.values()) {
        if (stryMutAct_9fa48("155022")) {
          {}
        } else {
          stryCov_9fa48("155022");
          stryMutAct_9fa48("155023") ? directedCount -= neighbors.size : (stryCov_9fa48("155023"), directedCount += neighbors.size);
        }
      }
      return Math.floor(stryMutAct_9fa48("155024") ? directedCount * NUM.TWO : (stryCov_9fa48("155024"), directedCount / NUM.TWO));
    }
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    if (stryMutAct_9fa48("155025")) {
      {}
    } else {
      stryCov_9fa48("155025");
      assertCritical(stryMutAct_9fa48("155028") ? this.state === LATENCY_TREE_STATE.CREATED : stryMutAct_9fa48("155027") ? false : stryMutAct_9fa48("155026") ? true : (stryCov_9fa48("155026", "155027", "155028"), this.state !== LATENCY_TREE_STATE.CREATED), LATENCY_TREE_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    if (stryMutAct_9fa48("155029")) {
      {}
    } else {
      stryCov_9fa48("155029");
      return this.nowFn();
    }
  }
}
export { LatencyTreeService };