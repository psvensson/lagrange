/**
 * LatencyTreeService - single owner for in-memory latency topology ordering.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';
import {
  LATENCY_TREE_DEFAULT,
  LATENCY_TREE_ERROR_MSG,
  LATENCY_TREE_EVENT,
  LATENCY_TREE_LOG_MSG,
  LATENCY_TREE_REASON,
  LATENCY_TREE_STATE,
  LATENCY_TREE_SUBSYSTEM,
  LATENCY_TREE_TABLE,
} from './latency-tree-constants.js';

class LatencyTreeService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.nowFn = options.nowFn || Date.now;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LATENCY_TREE_SUBSYSTEM) :
      console;

    this.state = LATENCY_TREE_STATE.CREATED;
    this.localGroupId = null;
    this.sourceViews = new Map();
    this.cacheListener = null;

    this.stats = {
      recomputeCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
      cacheChangeTriggerCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
      groupCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
      edgeCount: LATENCY_TREE_DEFAULT.EMPTY_COUNT,
      lastRecomputeAt: null,
      lastReason: null,
    };
  }

  /**
   * Initialize dependencies.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }

    this.nodeId = assertCritical(
      this.nodeId,
      LATENCY_TREE_ERROR_MSG.MISSING_NODE_ID,
    );
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      LATENCY_TREE_ERROR_MSG.MISSING_CACHE,
    );

    this.state = LATENCY_TREE_STATE.INITIALIZED;
    this.logger.info(LATENCY_TREE_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Start topology recomputation lifecycle.
   * @param {Object} options
   * @param {boolean} options.recomputeImmediately
   */
  start(options = {}) {
    this.ensureInitialized();
    if (this.state === LATENCY_TREE_STATE.RUNNING) {
      return;
    }

    this.cacheListener = (tableName) => {
      if (!LATENCY_TREE_TABLE.WATCHED.includes(tableName)) {
        return;
      }
      this.stats.cacheChangeTriggerCount += 1;
      this.recompute({reason: LATENCY_TREE_REASON.TOPOLOGY_CHANGE});
    };

    if (typeof this.systemTableCache.onCacheChange === 'function') {
      this.systemTableCache.onCacheChange(this.cacheListener);
    }

    this.state = LATENCY_TREE_STATE.RUNNING;
    this.logger.info(LATENCY_TREE_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
    });

    if (options.recomputeImmediately !== false) {
      this.recompute({reason: LATENCY_TREE_REASON.START});
    }
  }

  /**
   * Stop topology recomputation lifecycle.
   */
  stop() {
    if (this.cacheListener &&
      typeof this.systemTableCache?.offCacheChange === 'function') {
      this.systemTableCache.offCacheChange(this.cacheListener);
    }
    this.cacheListener = null;
    this.state = LATENCY_TREE_STATE.STOPPED;
    this.logger.info(LATENCY_TREE_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Recompute derived topology view from system-table metadata.
   * @param {Object} options
   * @param {string} options.reason
   * @return {Object}
   */
  recompute(options = {}) {
    this.ensureInitialized();
    const reason = options.reason || LATENCY_TREE_REASON.MANUAL;

    const groupIds = this.getActiveGroupIds();
    const localGroupId = this.resolveLocalGroupId();
    if (localGroupId) {
      groupIds.add(localGroupId);
    }

    const adjacency = this.buildAdjacency(groupIds);
    const orderedGroupIds = [...groupIds].sort();
    const sourceViews = new Map();

    for (const sourceGroupId of orderedGroupIds) {
      const neighborOrder = this.buildNeighborOrder(sourceGroupId, adjacency);
      const routingOrder = this.buildRoutingOrder(
        sourceGroupId,
        orderedGroupIds,
        adjacency,
      );
      sourceViews.set(sourceGroupId, {
        sourceGroupId,
        neighborOrder,
        routingOrder,
      });
    }

    this.localGroupId = localGroupId;
    this.sourceViews = sourceViews;
    this.stats.recomputeCount += 1;
    this.stats.groupCount = orderedGroupIds.length;
    this.stats.edgeCount = this.countUndirectedEdges(adjacency);
    this.stats.lastRecomputeAt = this.now();
    this.stats.lastReason = reason;

    const payload = {
      reason,
      localGroupId: this.localGroupId,
      groupCount: this.stats.groupCount,
      edgeCount: this.stats.edgeCount,
      recomputeCount: this.stats.recomputeCount,
    };

    this.emit(LATENCY_TREE_EVENT.RECOMPUTED, payload);
    this.logger.debug(LATENCY_TREE_LOG_MSG.RECOMPUTED, {
      nodeId: this.nodeId,
      ...payload,
    });
    return payload;
  }

  /**
   * Get ordered target groups for a source group.
   * @param {string} sourceGroupId
   * @return {string[]}
   */
  getRoutingOrder(sourceGroupId = this.localGroupId) {
    if (!sourceGroupId) {
      return [];
    }
    const view = this.sourceViews.get(sourceGroupId);
    if (!view) {
      return [sourceGroupId];
    }
    return [...view.routingOrder];
  }

  /**
   * Get neighbor order for a source group.
   * @param {string} sourceGroupId
   * @return {Object[]}
   */
  getNeighborOrder(sourceGroupId = this.localGroupId) {
    if (!sourceGroupId) {
      return [];
    }
    const view = this.sourceViews.get(sourceGroupId);
    if (!view) {
      return [];
    }
    return view.neighborOrder.map((neighbor) => ({...neighbor}));
  }

  /**
   * Resolve direct edge latency between source and target groups.
   * @param {string} sourceGroupId
   * @param {string} targetGroupId
   * @return {number|null}
   */
  getLatencyMs(sourceGroupId, targetGroupId) {
    if (!sourceGroupId || !targetGroupId) {
      return null;
    }
    const view = this.sourceViews.get(sourceGroupId);
    if (!view) {
      return null;
    }
    const neighbor = view.neighborOrder.find((entry) =>
      entry.targetGroupId === targetGroupId,
    );
    return neighbor ? neighbor.latencyMs : null;
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
      localGroupId: this.localGroupId,
    };
  }

  /**
   * Get active group IDs from cache metadata.
   * @return {Set<string>}
   * @private
   */
  getActiveGroupIds() {
    const rows = this.systemTableCache.getAll(TABLES.LATENCY_GROUPS) || [];
    const groupIds = new Set();
    for (const row of rows) {
      const groupId = row?.[COLUMN.GROUP_ID];
      const state = row?.[COLUMN.STATE];
      if (!groupId) {
        continue;
      }
      if (!state || state === LATENCY_GROUP_STATE.ACTIVE) {
        groupIds.add(groupId);
      }
    }
    return groupIds;
  }

  /**
   * Resolve local node's current latency group ID.
   * @return {string|null}
   * @private
   */
  resolveLocalGroupId() {
    const localNode = this.systemTableCache.get(TABLES.NODES, this.nodeId);
    const localGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID];
    return localGroupId || null;
  }

  /**
   * Build undirected adjacency map from inter_group_latencies rows.
   * @param {Set<string>} groupIds
   * @return {Map<string, Map<string, Object>>}
   * @private
   */
  buildAdjacency(groupIds) {
    const adjacency = new Map();
    for (const groupId of groupIds) {
      adjacency.set(groupId, new Map());
    }

    const rows = this.systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) || [];
    for (const row of rows) {
      const sourceGroupId = row?.[COLUMN.SOURCE_GROUP_ID];
      const targetGroupId = row?.[COLUMN.TARGET_GROUP_ID];
      const latencyMs = Number(row?.[COLUMN.LATENCY_MS]);
      const sampleCount = Number(row?.[COLUMN.SAMPLE_COUNT]);
      const lastMeasuredAt = Number(row?.[COLUMN.LAST_MEASURED_AT]) || null;

      if (!sourceGroupId || !targetGroupId ||
        sourceGroupId === targetGroupId ||
        !Number.isFinite(latencyMs) ||
        latencyMs < LATENCY_TREE_DEFAULT.DISTANCE_SELF ||
        !Number.isFinite(sampleCount) ||
        sampleCount < LATENCY_TREE_DEFAULT.EDGE_MIN_SAMPLE_COUNT) {
        continue;
      }

      if (!groupIds.has(sourceGroupId) || !groupIds.has(targetGroupId)) {
        continue;
      }

      this.upsertEdge(adjacency, sourceGroupId, targetGroupId, {
        targetGroupId,
        latencyMs,
        sampleCount,
        lastMeasuredAt,
      });
      this.upsertEdge(adjacency, targetGroupId, sourceGroupId, {
        targetGroupId: sourceGroupId,
        latencyMs,
        sampleCount,
        lastMeasuredAt,
      });
    }

    return adjacency;
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
    const neighbors = adjacency.get(sourceGroupId);
    if (!neighbors) {
      return;
    }
    const existing = neighbors.get(targetGroupId);
    if (!existing || edge.latencyMs < existing.latencyMs ||
      (edge.latencyMs === existing.latencyMs &&
        targetGroupId < existing.targetGroupId)) {
      neighbors.set(targetGroupId, edge);
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
    const neighbors = adjacency.get(sourceGroupId);
    if (!neighbors) {
      return [];
    }
    return [...neighbors.values()].sort((left, right) => {
      if (left.latencyMs !== right.latencyMs) {
        return left.latencyMs - right.latencyMs;
      }
      if (left.targetGroupId < right.targetGroupId) {
        return -1;
      }
      if (left.targetGroupId > right.targetGroupId) {
        return 1;
      }
      return 0;
    });
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
    const distances = this.computeShortestDistances(
      sourceGroupId,
      orderedGroupIds,
      adjacency,
    );
    return [...orderedGroupIds]
      .sort((left, right) => {
        const leftDistance = distances.get(left) ??
          LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE;
        const rightDistance = distances.get(right) ??
          LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE;
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        if (left < right) {
          return -1;
        }
        if (left > right) {
          return 1;
        }
        return 0;
      });
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
    const distances = new Map();
    const visited = new Set();

    for (const groupId of orderedGroupIds) {
      distances.set(groupId, LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE);
    }
    distances.set(sourceGroupId, LATENCY_TREE_DEFAULT.DISTANCE_SELF);

    while (visited.size < orderedGroupIds.length) {
      const currentGroupId = this.selectNearestUnvisited(
        orderedGroupIds,
        visited,
        distances,
      );
      if (!currentGroupId) {
        break;
      }
      visited.add(currentGroupId);

      const currentDistance = distances.get(currentGroupId);
      if (!Number.isFinite(currentDistance)) {
        continue;
      }

      const neighbors = adjacency.get(currentGroupId);
      if (!neighbors) {
        continue;
      }
      for (const [neighborGroupId, edge] of neighbors.entries()) {
        if (visited.has(neighborGroupId)) {
          continue;
        }
        const nextDistance = currentDistance + edge.latencyMs;
        const previousDistance = distances.get(neighborGroupId);
        if (nextDistance < previousDistance) {
          distances.set(neighborGroupId, nextDistance);
        }
      }
    }

    return distances;
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
    let candidate = null;
    let candidateDistance = LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE;

    for (const groupId of orderedGroupIds) {
      if (visited.has(groupId)) {
        continue;
      }
      const distance = distances.get(groupId) ??
        LATENCY_TREE_DEFAULT.DIJKSTRA_UNREACHABLE;
      if (distance < candidateDistance) {
        candidate = groupId;
        candidateDistance = distance;
        continue;
      }
      if (distance === candidateDistance &&
        candidate &&
        groupId < candidate) {
        candidate = groupId;
      }
    }

    return candidate;
  }

  /**
   * Count undirected edges from directed adjacency.
   * @param {Map<string, Map<string, Object>>} adjacency
   * @return {number}
   * @private
   */
  countUndirectedEdges(adjacency) {
    let directedCount = 0;
    for (const neighbors of adjacency.values()) {
      directedCount += neighbors.size;
    }
    return Math.floor(directedCount / 2);
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== LATENCY_TREE_STATE.CREATED,
      LATENCY_TREE_ERROR_MSG.NOT_INITIALIZED,
    );
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }
}

export {LatencyTreeService};
