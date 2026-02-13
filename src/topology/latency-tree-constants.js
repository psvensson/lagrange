/**
 * Constants for LatencyTreeService.
 */

import {NUM, TABLES} from '../constants/index.js';

const LATENCY_TREE_SUBSYSTEM = 'latency-tree';

const LATENCY_TREE_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const LATENCY_TREE_EVENT = Object.freeze({
  RECOMPUTED: 'latencyTreeRecomputed',
});

const LATENCY_TREE_REASON = Object.freeze({
  START: 'start',
  MANUAL: 'manual',
  TOPOLOGY_CHANGE: 'topology_change',
});

const LATENCY_TREE_TABLE = Object.freeze({
  WATCHED: Object.freeze([
    TABLES.NODES,
    TABLES.LATENCY_GROUPS,
    TABLES.INTER_GROUP_LATENCIES,
  ]),
});

const LATENCY_TREE_DEFAULT = Object.freeze({
  EMPTY_COUNT: NUM.ZERO,
  DISTANCE_SELF: NUM.ZERO,
  EDGE_MIN_SAMPLE_COUNT: NUM.ONE,
  DIJKSTRA_UNREACHABLE: Number.POSITIVE_INFINITY,
});

const LATENCY_TREE_LOG_MSG = Object.freeze({
  INITIALIZED: 'LatencyTreeService initialized',
  STARTED: 'LatencyTreeService started',
  STOPPED: 'LatencyTreeService stopped',
  RECOMPUTED: 'Latency tree recomputed',
});

const LATENCY_TREE_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'LatencyTreeService requires nodeId',
  MISSING_CACHE: 'LatencyTreeService requires systemTableCache',
  NOT_INITIALIZED: 'LatencyTreeService must be initialized first',
});

export {
  LATENCY_TREE_DEFAULT,
  LATENCY_TREE_ERROR_MSG,
  LATENCY_TREE_EVENT,
  LATENCY_TREE_LOG_MSG,
  LATENCY_TREE_REASON,
  LATENCY_TREE_STATE,
  LATENCY_TREE_SUBSYSTEM,
  LATENCY_TREE_TABLE,
};
