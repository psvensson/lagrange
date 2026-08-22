/**
 * Playback Recorder - captures high-level run events, topology snapshots,
 * and resource telemetry for step-through test playback.
 */

import {createWriteStream} from 'node:fs';
import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  OUTPUT,
  PLAYBACK,
  PLAYBACK_EVENT_TYPE,
} from './constants.js';

const NEWLINE = '\n';
const STREAM_FLAGS_TRUNCATE = 'w';
const SCOPE_CLUSTER = 'cluster';
const SCOPE_NODE = 'node';
const SCOPE_TOPOLOGY = 'topology';
const SCOPE_CAPTURE = 'capture';
const ENTITY_CLUSTER = 'cluster';

const NODES_QUERY = 'SELECT * FROM nodes';
const PARTITIONS_QUERY = 'SELECT * FROM partitions';
const SERVICES_QUERY =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const REPLICA_OPERATIONS_QUERY = 'SELECT * FROM replica_operations';

const FIELD_ROWS = 'rows';
const FIELD_RESULTS = 'results';
const FIELD_NODE_ID = 'node_id';
const FIELD_PARTITION_ID = 'partition_id';
const FIELD_SERVICE_ID = 'service_id';
const FIELD_STATUS = 'status';
const FIELD_TABLE_ID = 'table_id';
const FIELD_TABLE_NAME = 'table_name';
const FIELD_RANGE_START = 'partition_key_start';
const FIELD_RANGE_END = 'partition_key_end';
const FIELD_CREATED_AT = 'created_at';
const FIELD_UPDATED_AT = 'updated_at';
const FIELD_REPLICA_ID = 'replica_id';
const FIELD_OPERATION_ID = 'operation_id';
const FIELD_OPERATION_TYPE = 'type';
const FIELD_TARGET_NODE_ID = 'target_node_id';
const FIELD_SOURCE_NODE_ID = 'source_node_id';

const OPERATION_TYPE_ADD = 'ADD';
const OPERATION_TYPE_REMOVE = 'REMOVE';
const OPERATION_TYPE_REPLACE = 'REPLACE';

const WARNING_CODE_MISSING_CLUSTER = 'missing-cluster';
const WARNING_CODE_QUERY_NODE_UNAVAILABLE = 'query-node-unavailable';
const WARNING_CODE_TOPOLOGY_CAPTURE_FAILED = 'topology-capture-failed';
const WARNING_CODE_SERVICE_QUERY_FAILED = 'service-query-failed';
const WARNING_CODE_STATS_CAPTURE_FAILED = 'stats-capture-failed';
const WARNING_CODE_STATS_API_MISSING = 'stats-api-missing';
const WARNING_CODE_PROCESS_DIAGNOSTICS_CAPTURE_FAILED =
  'process-diagnostics-capture-failed';
const WARNING_CODE_PROCESS_DIAGNOSTICS_API_MISSING =
  'process-diagnostics-api-missing';
const SNAPSHOT_QUERY_LANE = 'snapshot';
const CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';

const CAPTURE_ERROR_MESSAGE = 'capture-error';
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REACHABILITY_SOURCE_PROBE = 'reachability_probe';
const REACHABILITY_ERROR_LEGACY_UNAVAILABLE =
  'reachability probe unavailable';
const REACHABILITY_DETAILS_KEY = 'reachability';

function normalizeCaptureErrorMessage(error) {
  return typeof error?.message === 'string' && error.message.length > 0 ?
    error.message :
    String(error || CAPTURE_ERROR_MESSAGE);
}

function extractRows(result) {
  if (!result || typeof result !== 'object') {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result[FIELD_ROWS])) {
    return result[FIELD_ROWS];
  }
  if (Array.isArray(result[FIELD_RESULTS])) {
    return result[FIELD_RESULTS];
  }
  return [];
}

async function queryTopologySnapshot(node, sql) {
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(sql, [], {
      lane: SNAPSHOT_QUERY_LANE,
    });
  }
  if (typeof node?.query === 'function') {
    return node.query(sql);
  }
  throw new Error('Node does not support topology snapshot queries');
}

function normalizeProbeResult(probe) {
  return {
    attempted: probe?.attempted === true,
    ok: probe?.ok === true,
    statusCode: Number.isInteger(probe?.statusCode) ?
      probe.statusCode :
      null,
    error: typeof probe?.error === 'string' ? probe.error : null,
    url: typeof probe?.url === 'string' ? probe.url : null,
    endpoint: typeof probe?.endpoint === 'string' ? probe.endpoint : null,
    query: typeof probe?.query === 'string' ? probe.query : null,
  };
}

function normalizeReachabilityDiagnostics(node, report) {
  const nodeId = String(report?.nodeId || node?.id || 'unknown');
  const reachable = report?.reachable === true;
  const adminReady = report?.adminReady === true ||
    report?.adminHealth?.ok === true ||
    report?.adminWs?.ok === true ||
    report?.sqlProbe?.ok === true;
  const lastError = typeof report?.lastError === 'string' ?
    report.lastError :
    null;

  return {
    nodeId,
    timestamp: Number.isFinite(report?.timestamp) ?
      report.timestamp :
      Date.now(),
    reachable,
    adminReady,
    reachableBy: typeof report?.reachableBy === 'string' ?
      report.reachableBy :
      null,
    bootstrapHealth: normalizeProbeResult(report?.bootstrapHealth),
    adminHealth: normalizeProbeResult(report?.adminHealth),
    adminWs: normalizeProbeResult(report?.adminWs),
    sqlProbe: normalizeProbeResult(report?.sqlProbe),
    lastError,
  };
}

function buildReachabilityProbeDiagnostics(node, reachable, errorMessage) {
  return {
    nodeId: String(node?.id || 'unknown'),
    timestamp: Date.now(),
    reachable: reachable === true,
    adminReady: reachable === true,
    reachableBy: reachable === true ?
      REACHABILITY_SOURCE_PROBE :
      null,
    bootstrapHealth: normalizeProbeResult(null),
    adminHealth: normalizeProbeResult(null),
    adminWs: normalizeProbeResult(null),
    sqlProbe: normalizeProbeResult(null),
    lastError: reachable === true ?
      null :
      (errorMessage || REACHABILITY_ERROR_LEGACY_UNAVAILABLE),
  };
}

function mapBy(rows, keyField) {
  const map = new Map();
  const source = Array.isArray(rows) ? rows : [];
  for (const row of source) {
    const key = row?.[keyField];
    if (!key) {
      continue;
    }
    map.set(key, row);
  }
  return map;
}

function normalizeServiceNodeId(serviceRow, nodeIdHint) {
  const value = serviceRow?.[FIELD_NODE_ID] ||
    serviceRow?.nodeId ||
    nodeIdHint ||
    null;
  if (!value) {
    return null;
  }
  return String(value);
}

function buildServiceIdentity(serviceRow, nodeIdHint, index) {
  const serviceId = serviceRow?.[FIELD_SERVICE_ID] || serviceRow?.serviceId;
  if (serviceId) {
    return `service:${String(serviceId)}`;
  }
  const nodeId = normalizeServiceNodeId(serviceRow, nodeIdHint) || 'unknown-node';
  const partitionId = serviceRow?.[FIELD_PARTITION_ID] ||
    serviceRow?.partitionId ||
    `row-${index}`;
  return `node:${nodeId}|partition:${String(partitionId)}`;
}

function parseEpochLikeValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function getServiceFreshnessScore(serviceRow) {
  const updatedAt = parseEpochLikeValue(serviceRow?.[FIELD_UPDATED_AT]);
  if (updatedAt !== null) {
    return updatedAt;
  }
  const stateEnteredAt = parseEpochLikeValue(serviceRow?.state_entered_at);
  if (stateEnteredAt !== null) {
    return stateEnteredAt;
  }
  const createdAt = parseEpochLikeValue(serviceRow?.[FIELD_CREATED_AT]);
  if (createdAt !== null) {
    return createdAt;
  }
  return null;
}

function normalizeServiceRow(row, nodeIdHint) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  if (row[FIELD_NODE_ID]) {
    return row;
  }
  if (!nodeIdHint) {
    return row;
  }
  return {
    ...row,
    [FIELD_NODE_ID]: String(nodeIdHint),
  };
}

function shouldReplaceServiceRow(existingRow, candidateRow) {
  const existingScore = getServiceFreshnessScore(existingRow);
  const candidateScore = getServiceFreshnessScore(candidateRow);
  if (candidateScore !== null && existingScore !== null) {
    if (candidateScore !== existingScore) {
      return candidateScore > existingScore;
    }
  } else if (candidateScore !== null && existingScore === null) {
    return true;
  }

  const existingStatus = String(existingRow?.[FIELD_STATUS] || '').toLowerCase();
  const candidateStatus = String(candidateRow?.[FIELD_STATUS] || '').toLowerCase();
  if (existingStatus !== 'active' && candidateStatus === 'active') {
    return true;
  }

  const existingNode = existingRow?.[FIELD_NODE_ID] || null;
  const candidateNode = candidateRow?.[FIELD_NODE_ID] || null;
  if (!existingNode && candidateNode) {
    return true;
  }

  return false;
}

function mergeServiceRows(perNodeRows) {
  const mergedByIdentity = new Map();
  const source = Array.isArray(perNodeRows) ? perNodeRows : [];
  for (const nodeRows of source) {
    const nodeIdHint = nodeRows?.nodeId || null;
    const rows = Array.isArray(nodeRows?.rows) ? nodeRows.rows : [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row || typeof row !== 'object') {
        continue;
      }
      const normalized = normalizeServiceRow(row, nodeIdHint);
      const identity = buildServiceIdentity(normalized, nodeIdHint, index);
      const existing = mergedByIdentity.get(identity);
      if (!existing) {
        mergedByIdentity.set(identity, normalized);
        continue;
      }
      if (shouldReplaceServiceRow(existing, normalized)) {
        mergedByIdentity.set(identity, normalized);
      }
    }
  }

  const merged = Array.from(mergedByIdentity.values());
  merged.sort((left, right) => {
    const leftNode = String(left?.[FIELD_NODE_ID] || left?.nodeId || '');
    const rightNode = String(right?.[FIELD_NODE_ID] || right?.nodeId || '');
    if (leftNode !== rightNode) {
      return leftNode.localeCompare(rightNode);
    }
    const leftPartition = String(
      left?.[FIELD_PARTITION_ID] || left?.partitionId || '',
    );
    const rightPartition = String(
      right?.[FIELD_PARTITION_ID] || right?.partitionId || '',
    );
    if (leftPartition !== rightPartition) {
      return leftPartition.localeCompare(rightPartition);
    }
    const leftService = String(left?.[FIELD_SERVICE_ID] || left?.serviceId || '');
    const rightService = String(right?.[FIELD_SERVICE_ID] || right?.serviceId || '');
    return leftService.localeCompare(rightService);
  });

  return merged;
}

function inferReplicaOperationEvents(previousSnapshot, currentSnapshot, timestamp) {
  const events = [];
  const previousOperations =
    mapBy(previousSnapshot?.replicaOperations, FIELD_OPERATION_ID);
  const currentOperations =
    mapBy(currentSnapshot?.replicaOperations, FIELD_OPERATION_ID);

  for (const [operationId, operation] of currentOperations.entries()) {
    if (!operationId || previousOperations.has(operationId)) {
      continue;
    }
    const type = String(operation?.[FIELD_OPERATION_TYPE] || '').toUpperCase();
    const partitionId = operation?.[FIELD_PARTITION_ID] || null;
    const replicaId = operation?.[FIELD_REPLICA_ID] || null;
    const targetNodeId = operation?.[FIELD_TARGET_NODE_ID] || null;
    const sourceNodeId = operation?.[FIELD_SOURCE_NODE_ID] || null;
    const status = operation?.[FIELD_STATUS] || null;

    if (type === OPERATION_TYPE_ADD) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_CREATED,
          SCOPE_TOPOLOGY,
          replicaId || operationId,
          {
            nodeId: targetNodeId,
            partitionId,
            status,
            operationId,
            source: 'replica_operations',
          },
        ),
      );
      continue;
    }

    if (type === OPERATION_TYPE_REMOVE) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_REMOVED,
          SCOPE_TOPOLOGY,
          replicaId || operationId,
          {
            nodeId: sourceNodeId || targetNodeId,
            partitionId,
            status,
            operationId,
            source: 'replica_operations',
          },
        ),
      );
      continue;
    }

    if (type === OPERATION_TYPE_REPLACE) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_MOVED,
          SCOPE_TOPOLOGY,
          replicaId || operationId,
          {
            partitionId,
            fromNodeId: sourceNodeId,
            toNodeId: targetNodeId,
            status,
            operationId,
            source: 'replica_operations',
          },
        ),
      );
    }
  }

  return events;
}

function valuesDiffer(left, right) {
  if (left === right) {
    return false;
  }
  if (left === undefined || left === null) {
    return right !== undefined && right !== null;
  }
  if (right === undefined || right === null) {
    return true;
  }
  return String(left) !== String(right);
}

function normalizePartitionRange(partition) {
  const start = partition?.[FIELD_RANGE_START];
  const end = partition?.[FIELD_RANGE_END];
  if (start === undefined || start === null) {
    return null;
  }
  if (end === undefined || end === null) {
    return null;
  }
  return {
    start: String(start),
    end: String(end),
  };
}

function getPartitionTableKey(partition) {
  const tableId = partition?.[FIELD_TABLE_ID];
  if (tableId) {
    return String(tableId);
  }
  const tableName = partition?.[FIELD_TABLE_NAME];
  if (tableName) {
    return String(tableName);
  }
  return null;
}

function createEvent(timestamp, type, scope, entityId, details = {}) {
  return {
    timestamp,
    type,
    scope,
    entityId,
    details,
  };
}

function inferSplitEvents(addedPartitions, removedPartitions, timestamp) {
  const events = [];
  const usedAdded = new Set();

  for (const removed of removedPartitions) {
    const removedId = removed?.[FIELD_PARTITION_ID];
    const removedRange = normalizePartitionRange(removed);
    const tableKey = getPartitionTableKey(removed);
    if (!removedId || !removedRange || !tableKey) {
      continue;
    }

    const tableAdds = addedPartitions.filter((candidate) =>
      getPartitionTableKey(candidate) === tableKey &&
      !usedAdded.has(candidate?.[FIELD_PARTITION_ID]),
    );

    for (let i = 0; i < tableAdds.length; i++) {
      const left = tableAdds[i];
      const leftId = left?.[FIELD_PARTITION_ID];
      const leftRange = normalizePartitionRange(left);
      if (!leftId || !leftRange) {
        continue;
      }
      for (let j = i + 1; j < tableAdds.length; j++) {
        const right = tableAdds[j];
        const rightId = right?.[FIELD_PARTITION_ID];
        const rightRange = normalizePartitionRange(right);
        if (!rightId || !rightRange) {
          continue;
        }

        const contiguous = leftRange.end === rightRange.start ||
          rightRange.end === leftRange.start;
        if (!contiguous) {
          continue;
        }

        const minStart = leftRange.start < rightRange.start ?
          leftRange.start :
          rightRange.start;
        const maxEnd = leftRange.end > rightRange.end ?
          leftRange.end :
          rightRange.end;

        if (minStart !== removedRange.start ||
            maxEnd !== removedRange.end) {
          continue;
        }

        usedAdded.add(leftId);
        usedAdded.add(rightId);
        events.push(
          createEvent(
            timestamp,
            PLAYBACK_EVENT_TYPE.PARTITION_SPLIT,
            SCOPE_TOPOLOGY,
            removedId,
            {
              partitionId: removedId,
              tableId: removed[FIELD_TABLE_ID] || null,
              tableName: removed[FIELD_TABLE_NAME] || null,
              childPartitionIds: [leftId, rightId],
            },
          ),
        );
      }
    }
  }

  return events;
}

function inferMergeEvents(addedPartitions, removedPartitions, timestamp) {
  const events = [];
  const usedRemoved = new Set();

  for (const added of addedPartitions) {
    const addedId = added?.[FIELD_PARTITION_ID];
    const addedRange = normalizePartitionRange(added);
    const tableKey = getPartitionTableKey(added);
    if (!addedId || !addedRange || !tableKey) {
      continue;
    }

    const tableRemoves = removedPartitions.filter((candidate) =>
      getPartitionTableKey(candidate) === tableKey &&
      !usedRemoved.has(candidate?.[FIELD_PARTITION_ID]),
    );

    for (let i = 0; i < tableRemoves.length; i++) {
      const left = tableRemoves[i];
      const leftId = left?.[FIELD_PARTITION_ID];
      const leftRange = normalizePartitionRange(left);
      if (!leftId || !leftRange) {
        continue;
      }
      for (let j = i + 1; j < tableRemoves.length; j++) {
        const right = tableRemoves[j];
        const rightId = right?.[FIELD_PARTITION_ID];
        const rightRange = normalizePartitionRange(right);
        if (!rightId || !rightRange) {
          continue;
        }

        const contiguous = leftRange.end === rightRange.start ||
          rightRange.end === leftRange.start;
        if (!contiguous) {
          continue;
        }

        const minStart = leftRange.start < rightRange.start ?
          leftRange.start :
          rightRange.start;
        const maxEnd = leftRange.end > rightRange.end ?
          leftRange.end :
          rightRange.end;

        if (minStart !== addedRange.start ||
            maxEnd !== addedRange.end) {
          continue;
        }

        usedRemoved.add(leftId);
        usedRemoved.add(rightId);
        events.push(
          createEvent(
            timestamp,
            PLAYBACK_EVENT_TYPE.PARTITION_MERGE,
            SCOPE_TOPOLOGY,
            addedId,
            {
              partitionId: addedId,
              tableId: added[FIELD_TABLE_ID] || null,
              tableName: added[FIELD_TABLE_NAME] || null,
              parentPartitionIds: [leftId, rightId],
            },
          ),
        );
      }
    }
  }

  return events;
}

function diffTopologySnapshots(previousSnapshot, currentSnapshot) {
  const timestamp = currentSnapshot?.timestamp || Date.now();
  const events = [];

  const previousNodes = mapBy(previousSnapshot?.nodes, FIELD_NODE_ID);
  const currentNodes = mapBy(currentSnapshot?.nodes, FIELD_NODE_ID);
  for (const [nodeId, currentNode] of currentNodes.entries()) {
    const previousNode = previousNodes.get(nodeId);
    if (!previousNode) {
      continue;
    }
    if (valuesDiffer(previousNode[FIELD_STATUS], currentNode[FIELD_STATUS])) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.NODE_STATUS_CHANGED,
          SCOPE_NODE,
          nodeId,
          {
            fromStatus: previousNode[FIELD_STATUS] || null,
            toStatus: currentNode[FIELD_STATUS] || null,
          },
        ),
      );
    }
  }

  const previousPartitions =
    mapBy(previousSnapshot?.partitions, FIELD_PARTITION_ID);
  const currentPartitions =
    mapBy(currentSnapshot?.partitions, FIELD_PARTITION_ID);

  const addedPartitions = [];
  const removedPartitions = [];

  for (const [partitionId, partition] of currentPartitions.entries()) {
    if (!previousPartitions.has(partitionId)) {
      addedPartitions.push(partition);
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.PARTITION_CREATED,
          SCOPE_TOPOLOGY,
          partitionId,
          {
            tableId: partition[FIELD_TABLE_ID] || null,
            tableName: partition[FIELD_TABLE_NAME] || null,
            rangeStart: partition[FIELD_RANGE_START] || null,
            rangeEnd: partition[FIELD_RANGE_END] || null,
            createdAt: partition[FIELD_CREATED_AT] || null,
          },
        ),
      );
    }
  }

  for (const [partitionId, partition] of previousPartitions.entries()) {
    if (!currentPartitions.has(partitionId)) {
      removedPartitions.push(partition);
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.PARTITION_REMOVED,
          SCOPE_TOPOLOGY,
          partitionId,
          {
            tableId: partition[FIELD_TABLE_ID] || null,
            tableName: partition[FIELD_TABLE_NAME] || null,
            rangeStart: partition[FIELD_RANGE_START] || null,
            rangeEnd: partition[FIELD_RANGE_END] || null,
            updatedAt: partition[FIELD_UPDATED_AT] || null,
          },
        ),
      );
    }
  }

  events.push(...inferSplitEvents(addedPartitions, removedPartitions, timestamp));
  events.push(...inferMergeEvents(addedPartitions, removedPartitions, timestamp));

  const previousServices = mapBy(previousSnapshot?.services, FIELD_SERVICE_ID);
  const currentServices = mapBy(currentSnapshot?.services, FIELD_SERVICE_ID);

  for (const [serviceId, service] of currentServices.entries()) {
    if (!previousServices.has(serviceId)) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_CREATED,
          SCOPE_TOPOLOGY,
          serviceId,
          {
            nodeId: service[FIELD_NODE_ID] || null,
            partitionId: service[FIELD_PARTITION_ID] || null,
            status: service[FIELD_STATUS] || null,
          },
        ),
      );
      continue;
    }

    const previous = previousServices.get(serviceId);
    if (valuesDiffer(previous[FIELD_NODE_ID], service[FIELD_NODE_ID])) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_MOVED,
          SCOPE_TOPOLOGY,
          serviceId,
          {
            partitionId: service[FIELD_PARTITION_ID] ||
              previous[FIELD_PARTITION_ID] || null,
            fromNodeId: previous[FIELD_NODE_ID] || null,
            toNodeId: service[FIELD_NODE_ID] || null,
          },
        ),
      );
    }
  }

  for (const [serviceId, service] of previousServices.entries()) {
    if (!currentServices.has(serviceId)) {
      events.push(
        createEvent(
          timestamp,
          PLAYBACK_EVENT_TYPE.REPLICA_REMOVED,
          SCOPE_TOPOLOGY,
          serviceId,
          {
            nodeId: service[FIELD_NODE_ID] || null,
            partitionId: service[FIELD_PARTITION_ID] || null,
            status: service[FIELD_STATUS] || null,
          },
        ),
      );
    }
  }

  events.push(...inferReplicaOperationEvents(
    previousSnapshot,
    currentSnapshot,
    timestamp,
  ));

  return events;
}

class PlaybackRecorder {
  constructor(options = {}) {
    this._outputDir = options.outputDir || OUTPUT.DEFAULT_DIR;
    this._topologyPollIntervalMs = options.topologyPollIntervalMs ||
      PLAYBACK.topologyPollIntervalMs;
    this._resourcePollIntervalMs = options.resourcePollIntervalMs ||
      PLAYBACK.resourcePollIntervalMs;
    this._setInterval = typeof options.setIntervalFn === 'function' ?
      options.setIntervalFn :
      setInterval;
    this._clearInterval = typeof options.clearIntervalFn === 'function' ?
      options.clearIntervalFn :
      clearInterval;

    this._scenarioName = null;
    this._scenarioDir = null;
    this._cluster = null;

    this._eventsPath = null;
    this._samplesPath = null;
    this._snapshotsPath = null;
    this._manifestPath = null;
    this._viewerPath = null;

    this._eventsStream = null;
    this._samplesStream = null;
    this._snapshotsStream = null;

    this._eventsCount = 0;
    this._samplesCount = 0;
    this._snapshotsCount = 0;
    this._previousSnapshot = null;
    this._warnings = [];
    this._warningCodes = new Set();
    this._manifest = null;

    this._startedAt = null;
    this._endedAt = null;
    this._topologyPollTimer = null;
    this._resourcePollTimer = null;
    this._topologyCapturePromise = null;
    this._resourceCapturePromise = null;
    this._shutdownStartedAt = null;
    this._started = false;
    this._adminReadinessObserved = false;
    this._topologySnapshotObserved = false;
    this._clusterActiveObserved = false;
  }

  async start(context = {}) {
    if (this._started) {
      return;
    }

    this._scenarioName = context.scenarioName || 'unknown-scenario';
    this._cluster = context.cluster || null;
    if (!this._cluster) {
      this._captureWarning(
        WARNING_CODE_MISSING_CLUSTER,
        'Playback recorder started without a cluster context',
      );
      return;
    }

    this._scenarioDir = join(this._outputDir, this._scenarioName);
    await mkdir(this._scenarioDir, {recursive: true});

    this._eventsPath = join(
      this._scenarioDir,
      OUTPUT.PLAYBACK_EVENTS_FILENAME,
    );
    this._samplesPath = join(
      this._scenarioDir,
      OUTPUT.PLAYBACK_SAMPLES_FILENAME,
    );
    this._snapshotsPath = join(
      this._scenarioDir,
      OUTPUT.PLAYBACK_SNAPSHOTS_FILENAME,
    );
    this._manifestPath = join(
      this._scenarioDir,
      OUTPUT.PLAYBACK_MANIFEST_FILENAME,
    );
    this._viewerPath = join(
      this._scenarioDir,
      OUTPUT.PLAYBACK_VIEWER_FILENAME,
    );

    this._eventsStream = createWriteStream(this._eventsPath, {
      flags: STREAM_FLAGS_TRUNCATE,
    });
    this._samplesStream = createWriteStream(this._samplesPath, {
      flags: STREAM_FLAGS_TRUNCATE,
    });
    this._snapshotsStream = createWriteStream(this._snapshotsPath, {
      flags: STREAM_FLAGS_TRUNCATE,
    });

    this._startedAt = Date.now();
    this._started = true;
    this._adminReadinessObserved = false;
    this._topologySnapshotObserved = false;
    this._clusterActiveObserved = false;
    this._shutdownStartedAt = null;

    this.recordEvent({
      type: PLAYBACK_EVENT_TYPE.CLUSTER_START,
      scope: SCOPE_CLUSTER,
      entityId: ENTITY_CLUSTER,
      details: {
        scenarioName: this._scenarioName,
      },
    });

    const skipInitialCapture = Boolean(context.skipInitialCapture);
    if (!skipInitialCapture) {
      await this._collectTopologySnapshot();
      await this._collectResourceSamples();
    }
    this._startPollers();
  }

  async stop(summary = {}, options = {}) {
    if (!this._started) {
      return this._manifest;
    }

    const skipFinalCapture = Boolean(options.skipFinalCapture);
    if (skipFinalCapture) {
      await this.beginShutdown({
        awaitInFlightCaptures: true,
      });
    } else {
      this._stopPollers();
      await this._awaitCapture('_topologyCapturePromise');
      await this._awaitCapture('_resourceCapturePromise');
      await this._collectTopologySnapshot();
      await this._collectResourceSamples();
    }
    if (this._shutdownStartedAt === null) {
      this._shutdownStartedAt = Date.now();
    }

    this.recordEvent({
      type: PLAYBACK_EVENT_TYPE.CLUSTER_STOP,
      scope: SCOPE_CLUSTER,
      entityId: ENTITY_CLUSTER,
      details: summary,
    });

    this._endedAt = Date.now();

    await Promise.all([
      closeStream(this._eventsStream),
      closeStream(this._samplesStream),
      closeStream(this._snapshotsStream),
    ]);
    this._started = false;

    try {
      // The admin static viewer is the single owner of the playback UI; the
      // harness ships a copy into each scenario output so bundles stay
      // self-contained without a second checked-in twin of the file.
      await copyFile(
        join(MODULE_DIR, OUTPUT.PLAYBACK_VIEWER_SOURCE_RELATIVE),
        this._viewerPath,
      );
    } catch (_err) {
      this._captureWarning(
        'viewer-copy-failed',
        'Unable to copy playback viewer into scenario output',
      );
    }

    this._manifest = {
      scenarioName: this._scenarioName,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      durationMs: this._endedAt - this._startedAt,
      files: {
        events: this._eventsPath,
        samples: this._samplesPath,
        snapshots: this._snapshotsPath,
        manifest: this._manifestPath,
        viewer: this._viewerPath,
      },
      counts: {
        events: this._eventsCount,
        samples: this._samplesCount,
        snapshots: this._snapshotsCount,
      },
      warnings: this._warnings,
    };

    await writeFile(
      this._manifestPath,
      JSON.stringify(this._manifest, null, 2) + NEWLINE,
      'utf8',
    );

    this._eventsStream = null;
    this._samplesStream = null;
    this._snapshotsStream = null;

    return this._manifest;
  }

  getManifest() {
    return this._manifest;
  }

  getWarnings() {
    return [...this._warnings];
  }

  suspendPolling() {
    this._stopPollers();
  }

  async beginShutdown(options = {}) {
    if (this._shutdownStartedAt === null) {
      this._shutdownStartedAt = Date.now();
    }
    this._stopPollers();
    if (options.awaitInFlightCaptures !== false) {
      await Promise.all([
        this._awaitCapture('_topologyCapturePromise'),
        this._awaitCapture('_resourceCapturePromise'),
      ]);
    }
  }

  recordEvent(event) {
    if (!this._started || !this._eventsStream) {
      return;
    }
    const timestamp = event?.timestamp || Date.now();
    const normalized = {
      timestamp,
      type: event?.type || CAPTURE_ERROR_MESSAGE,
      scope: event?.scope || SCOPE_CAPTURE,
      entityId: event?.entityId || null,
      details: event?.details || {},
    };
    if (
      normalized.type === PLAYBACK_EVENT_TYPE.CLUSTER_STAGE &&
      normalized.details &&
      typeof normalized.details === 'object'
    ) {
      if (
        normalized.details.stage === CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE ||
        normalized.details?.activeGate?.ready === true
      ) {
        this._clusterActiveObserved = true;
      }
    }
    this._appendNdjson(this._eventsStream, normalized);
    this._eventsCount++;
  }

  _startPollers() {
    this._topologyPollTimer = this._setInterval(() => {
      this._collectTopologySnapshot().catch((err) => {
        this._captureWarning(
          WARNING_CODE_TOPOLOGY_CAPTURE_FAILED,
          'Topology snapshot polling failed: ' + err.message,
        );
      });
    }, this._topologyPollIntervalMs);

    this._resourcePollTimer = this._setInterval(() => {
      this._collectResourceSamples().catch((err) => {
        this._captureWarning(
          WARNING_CODE_STATS_CAPTURE_FAILED,
          'Resource sampling failed: ' + err.message,
        );
      });
    }, this._resourcePollIntervalMs);
  }

  _stopPollers() {
    if (this._topologyPollTimer !== null) {
      this._clearInterval(this._topologyPollTimer);
      this._topologyPollTimer = null;
    }
    if (this._resourcePollTimer !== null) {
      this._clearInterval(this._resourcePollTimer);
      this._resourcePollTimer = null;
    }
  }

  async _collectTopologySnapshot() {
    return this._runExclusiveCapture(
      '_topologyCapturePromise',
      () => this._collectTopologySnapshotOnce(),
    );
  }

  async _collectTopologySnapshotOnce() {
    if (!this._cluster || this._shutdownStartedAt !== null) {
      return;
    }
    const selection = await this._selectReachableSnapshotNodes();
    if (this._shutdownStartedAt !== null) {
      return;
    }
    const snapshotNodes = selection.nodes;
    if (selection.adminReady) {
      this._adminReadinessObserved = true;
    }
    if (snapshotNodes.length === 0) {
      if (!this._clusterActiveObserved ||
          !this._adminReadinessObserved ||
          !this._topologySnapshotObserved) {
        return;
      }
      this._captureWarning(
        WARNING_CODE_QUERY_NODE_UNAVAILABLE,
        'No admin-ready reachable node available for topology snapshot query',
        {
          [REACHABILITY_DETAILS_KEY]: selection.diagnostics,
        },
      );
      return;
    }
    const anchorNode = snapshotNodes[0];

    try {
      const [
        nodesResult,
        partitionsResult,
        replicaOperationsResult,
        perNodeServices,
      ] =
        await Promise.all([
          queryTopologySnapshot(anchorNode, NODES_QUERY),
          queryTopologySnapshot(anchorNode, PARTITIONS_QUERY),
          queryTopologySnapshot(anchorNode, REPLICA_OPERATIONS_QUERY),
          Promise.all(snapshotNodes.map(async (node) => {
            const nodeId = String(node?.id || 'unknown');
            try {
              const servicesResult = await queryTopologySnapshot(
                node,
                SERVICES_QUERY,
              );
              return {
                nodeId,
                rows: extractRows(servicesResult),
              };
            } catch (err) {
              this._captureWarning(
                `${WARNING_CODE_SERVICE_QUERY_FAILED}-${nodeId}`,
                'Failed to query services on node ' + nodeId +
                  ': ' + err.message,
                {
                  nodeId,
                  error: err.message,
                  [REACHABILITY_DETAILS_KEY]:
                    selection.byNode[nodeId] || null,
                },
              );
              return {
                nodeId,
                rows: [],
              };
            }
          })),
        ]);

      const snapshot = {
        timestamp: Date.now(),
        nodes: extractRows(nodesResult),
        partitions: extractRows(partitionsResult),
        replicaOperations: extractRows(replicaOperationsResult),
        services: mergeServiceRows(perNodeServices),
      };

      this._appendNdjson(this._snapshotsStream, snapshot);
      this._snapshotsCount++;
      this._topologySnapshotObserved = true;

      if (this._previousSnapshot) {
        const events = diffTopologySnapshots(
          this._previousSnapshot,
          snapshot,
        );
        for (const event of events) {
          this.recordEvent(event);
        }
      }
      this._previousSnapshot = snapshot;
    } catch (err) {
      this._captureWarning(
        WARNING_CODE_TOPOLOGY_CAPTURE_FAILED,
        'Failed to capture topology snapshot: ' + err.message,
        {
          anchorNodeId: String(anchorNode?.id || 'unknown'),
          error: err.message,
          [REACHABILITY_DETAILS_KEY]: selection.diagnostics,
        },
      );
    }
  }

  async _collectResourceSamples() {
    return this._runExclusiveCapture(
      '_resourceCapturePromise',
      () => this._collectResourceSamplesOnce(),
    );
  }

  async _collectResourceSamplesOnce() {
    if (!this._cluster ||
        !this._samplesStream ||
        this._shutdownStartedAt !== null) {
      return;
    }

    const nodes = typeof this._cluster.getNodes === 'function' ?
      this._cluster.getNodes() :
      [];
    for (const node of nodes) {
      if (this._shutdownStartedAt !== null) {
        return;
      }
      const sample = {
        timestamp: Date.now(),
        nodeId: node?.id || null,
        containerId: node?.containerId || null,
      };

      await this._appendContainerResourceSample(node, sample);
      await this._appendProcessResourceSample(node, sample);

      this._appendNdjson(this._samplesStream, sample);
      this._samplesCount++;
    }
  }

  async _appendContainerResourceSample(node, sample) {
    const nodeId = String(node?.id || 'unknown');
    const provider = node?._dockerProvider;
    if (!provider || typeof provider.getContainerStats !== 'function') {
      this._captureWarning(
        WARNING_CODE_STATS_API_MISSING + '-' + nodeId,
        'Docker provider does not expose getContainerStats',
      );
      sample.containerStatsError = 'container stats API unavailable';
      return;
    }
    try {
      const stats = await provider.getContainerStats(node.containerId);
      sample.cpuPercent = stats.cpuPercent;
      sample.containerMemoryWorkingSetBytes = stats.memoryUsageBytes;
      sample.containerMemoryLimitBytes = stats.memoryLimitBytes;
      sample.rxBytes = stats.rxBytes;
      sample.txBytes = stats.txBytes;
    } catch (error) {
      const errorMessage = normalizeCaptureErrorMessage(error);
      sample.containerStatsError = errorMessage;
      this._captureWarning(
        WARNING_CODE_STATS_CAPTURE_FAILED + '-' + nodeId,
        'Failed to capture container stats for node ' + nodeId +
          ': ' + errorMessage,
      );
    }
  }

  async _appendProcessResourceSample(node, sample) {
    const nodeId = String(node?.id || 'unknown');
    if (typeof node?.getProcessResourceDiagnostics !== 'function') {
      this._captureWarning(
        WARNING_CODE_PROCESS_DIAGNOSTICS_API_MISSING + '-' + nodeId,
        'Node handle does not expose process resource diagnostics',
      );
      sample.processDiagnosticsError =
        'process resource diagnostics API unavailable';
      return;
    }
    try {
      const diagnostics = await node.getProcessResourceDiagnostics({
        timeoutMs: PLAYBACK.resourceDiagnosticsTimeoutMs,
      });
      sample.processCapturedAt = diagnostics.capturedAt;
      sample.processRssBytes = diagnostics.process.rssBytes;
      sample.processHeapUsedBytes = diagnostics.process.heapUsedBytes;
      sample.processHeapTotalBytes = diagnostics.process.heapTotalBytes;
      sample.processExternalBytes = diagnostics.process.externalBytes;
      sample.processArrayBuffersBytes = diagnostics.process.arrayBuffersBytes;
    } catch (error) {
      const errorMessage = normalizeCaptureErrorMessage(error);
      sample.processDiagnosticsError = errorMessage;
      this._captureWarning(
        WARNING_CODE_PROCESS_DIAGNOSTICS_CAPTURE_FAILED + '-' + nodeId,
        'Failed to capture process diagnostics for node ' + nodeId +
          ': ' + errorMessage,
      );
    }
  }

  async _runExclusiveCapture(promiseKey, captureFn) {
    const existingPromise = this[promiseKey];
    if (existingPromise) {
      return existingPromise;
    }

    const capturePromise = Promise.resolve().then(() => captureFn());
    this[promiseKey] = capturePromise;
    try {
      return await capturePromise;
    } finally {
      if (this[promiseKey] === capturePromise) {
        this[promiseKey] = null;
      }
    }
  }

  async _awaitCapture(promiseKey) {
    const pendingCapture = this[promiseKey];
    if (!pendingCapture) {
      return;
    }
    await pendingCapture;
  }

  _selectSnapshotNodes() {
    if (!this._cluster || typeof this._cluster.getNodes !== 'function') {
      return [];
    }
    const nodes = this._cluster.getNodes();
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }
    return nodes;
  }

  async _selectReachableSnapshotNodes() {
    const nodes = this._selectSnapshotNodes();
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        nodes: [],
        diagnostics: [],
        byNode: {},
        adminReady: false,
      };
    }
    const reachable = [];
    const diagnostics = [];
    const byNode = {};
    let adminReady = false;
    for (const node of nodes) {
      const report = await this._probeNodeReachability(node);
      diagnostics.push(report);
      byNode[report.nodeId] = report;
      if (report.adminReady) {
        adminReady = true;
      }
      if (report.reachable === true && report.adminReady === true) {
        reachable.push(node);
      }
    }
    return {
      nodes: reachable,
      diagnostics,
      byNode,
      adminReady,
    };
  }

  async _probeNodeReachability(node) {
    if (!node || typeof node !== 'object') {
      return buildReachabilityProbeDiagnostics(
        node,
        false,
        REACHABILITY_ERROR_LEGACY_UNAVAILABLE,
      );
    }

    try {
      if (typeof node.getReachabilityDiagnostics === 'function') {
        const report = await node.getReachabilityDiagnostics();
        return normalizeReachabilityDiagnostics(node, report);
      }

      if (typeof node.isReachable === 'function') {
        const result = await node.isReachable();
        if (result && typeof result === 'object' &&
          Object.prototype.hasOwnProperty.call(result, 'reachable')) {
          return normalizeReachabilityDiagnostics(node, result);
        }
        return buildReachabilityProbeDiagnostics(node, result === true);
      }
    } catch (err) {
      return buildReachabilityProbeDiagnostics(node, false, err.message);
    }

    if (typeof node.query === 'function') {
      return buildReachabilityProbeDiagnostics(node, true);
    }

    return buildReachabilityProbeDiagnostics(
      node,
      false,
      REACHABILITY_ERROR_LEGACY_UNAVAILABLE,
    );
  }

  _appendNdjson(stream, data) {
    if (!stream) {
      return;
    }
    stream.write(JSON.stringify(data) + NEWLINE);
  }

  _captureWarning(code, message, details = null) {
    if (this._warningCodes.has(code)) {
      return;
    }
    this._warningCodes.add(code);

    const warningDetails = details && typeof details === 'object' ?
      details :
      null;
    const warning = {
      code,
      message,
      timestamp: Date.now(),
      details: warningDetails,
    };
    this._warnings.push(warning);

    if (this._started) {
      const eventDetails = warningDetails ?
        {
          message,
          ...warningDetails,
        } :
        {
          message,
        };
      this.recordEvent({
        type: PLAYBACK_EVENT_TYPE.WARNING,
        scope: SCOPE_CAPTURE,
        entityId: code,
        details: eventDetails,
      });
    }
  }
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    if (!stream) {
      resolve();
      return;
    }
    stream.once('error', reject);
    stream.end(() => resolve());
  });
}

export {
  PlaybackRecorder,
  diffTopologySnapshots,
  inferSplitEvents,
  inferMergeEvents,
};
