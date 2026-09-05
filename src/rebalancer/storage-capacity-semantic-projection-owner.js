import {CDC_OPERATION, COLUMN, TABLES} from '../constants/index.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const CAPACITY_SOURCE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.REPLICA_OPERATIONS,
]);
const MapConstructor = Map;
const SetConstructor = Set;
const mapClear = Function.call.bind(Map.prototype.clear);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const setAdd = Function.call.bind(Set.prototype.add);
const setClear = Function.call.bind(Set.prototype.clear);
const setDelete = Function.call.bind(Set.prototype.delete);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const stringConstructor = String;

function nextGeneration(previous) {
  if (previous === undefined || previous === null) return 1;
  return numberIsSafeInteger(previous) && previous >= 0 &&
    previous < numberMaxSafeInteger ? previous + 1 : numberMaxSafeInteger;
}

const STORAGE_CAPACITY_NOW_MS_ERROR =
  'Storage capacity semantics require numeric nowMs';

function normalizeNowMs(value) {
  if (!numberIsSafeInteger(value) || value < 0) {
    throw new TypeError(STORAGE_CAPACITY_NOW_MS_ERROR);
  }
  return value;
}

function normalizeNodeId(value) {
  return typeof value === 'string' ? value : '';
}

function capacityProjectionChanged(previous, current) {
  if (!previous || !current) return true;
  const left = previous.capacity;
  const right = current.capacity;
  if (!left || !right) return left !== right;
  return left.nodeId !== right.nodeId ||
    left.budgetBytes !== right.budgetBytes ||
    left.usedBytes !== right.usedBytes ||
    left.reservedBytes !== right.reservedBytes ||
    left.availableBytes !== right.availableBytes ||
    left.utilizationPercent !== right.utilizationPercent ||
    left.pressureState !== right.pressureState;
}

function readSourceRowKey(tableName, record) {
  if (!record) return null;
  let field;
  try {
    field = getSystemCachePrimaryKeyFieldOrFallback(tableName);
  } catch {
    return null;
  }
  const value = record[field] ?? record.id;
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
    return null;
  }
  return `${typeof value}:${stringConstructor(value)}`;
}

function copyRowsByKey(tableName, rows) {
  const copied = copyDenseOwnDataRecordArray(rows);
  if (!copied) return null;
  const byKey = new MapConstructor();
  for (let index = 0; index < copied.length; index += 1) {
    const key = readSourceRowKey(tableName, copied[index]);
    if (key === null || mapHas(byKey, key)) return null;
    mapSet(byKey, key, objectFreeze(copied[index]));
  }
  return byKey;
}

function readRows(sourceRowsByTable, tableName) {
  const byKey = mapGet(sourceRowsByTable, tableName);
  const rows = [];
  if (byKey) {
    mapForEach(byKey, (row) => {
      objectDefineProperty(rows, rows.length, {
        configurable: true,
        enumerable: true,
        value: row,
        writable: true,
      });
    });
  }
  return rows;
}

function appendNodeId(nodeIds, value) {
  const nodeId = normalizeNodeId(value);
  if (nodeId) setAdd(nodeIds, nodeId);
}

function readPartitionId(record) {
  const value = record?.[COLUMN.PARTITION_ID] ?? record?.partitionId;
  return typeof value === 'string' ? value : '';
}

function readOperationId(record) {
  const value = record?.[COLUMN.OPERATION_ID] ?? record?.operationId;
  return typeof value === 'string' ? value : '';
}

function collectDirectNodeIds(nodeIds, previousRecord, currentRecord) {
  appendNodeId(nodeIds, previousRecord?.[COLUMN.NODE_ID]);
  appendNodeId(nodeIds, currentRecord?.[COLUMN.NODE_ID]);
}

function collectReservationNodeIds(nodeIds, previousRecord, currentRecord) {
  appendNodeId(nodeIds, previousRecord?.[COLUMN.TARGET_NODE_ID]);
  appendNodeId(nodeIds, currentRecord?.[COLUMN.TARGET_NODE_ID]);
}

function collectJoinIds(previousRecord, currentRecord, readJoinId) {
  const joinIds = new SetConstructor();
  const previousId = readJoinId(previousRecord);
  const currentId = readJoinId(currentRecord);
  if (previousId) setAdd(joinIds, previousId);
  if (currentId) setAdd(joinIds, currentId);
  return joinIds;
}

function collectJoinedRowNodeIds(
  nodeIds,
  rows,
  joinIds,
  readJoinId,
  readNodeId,
) {
  for (let index = 0; index < rows.length; index += 1) {
    if (setHas(joinIds, readJoinId(rows[index]))) {
      appendNodeId(nodeIds, readNodeId(rows[index]));
    }
  }
}

function collectPartitionServiceNodeIds(
  nodeIds,
  previousRecord,
  currentRecord,
  sourceRowsByTable,
) {
  collectJoinedRowNodeIds(
    nodeIds,
    readRows(sourceRowsByTable, TABLES.SERVICES),
    collectJoinIds(previousRecord, currentRecord, readPartitionId),
    readPartitionId,
    (row) => row?.[COLUMN.NODE_ID],
  );
}

function collectOperationReservationNodeIds(
  nodeIds,
  previousRecord,
  currentRecord,
  sourceRowsByTable,
) {
  collectJoinedRowNodeIds(
    nodeIds,
    readRows(sourceRowsByTable, TABLES.STORAGE_RESERVATIONS),
    collectJoinIds(previousRecord, currentRecord, readOperationId),
    readOperationId,
    (row) => row?.[COLUMN.TARGET_NODE_ID],
  );
}

function collectJoinedCapacityNodeIds(
  nodeIds,
  tableName,
  previousRecord,
  currentRecord,
  sourceRowsByTable,
) {
  if (tableName === TABLES.NODES || tableName === TABLES.SERVICES) {
    collectDirectNodeIds(nodeIds, previousRecord, currentRecord);
    return;
  }
  if (tableName === TABLES.STORAGE_RESERVATIONS) {
    collectReservationNodeIds(nodeIds, previousRecord, currentRecord);
    return;
  }
  if (tableName === TABLES.PARTITIONS) {
    collectPartitionServiceNodeIds(
      nodeIds,
      previousRecord,
      currentRecord,
      sourceRowsByTable,
    );
    return;
  }
  if (tableName === TABLES.REPLICA_OPERATIONS) {
    collectOperationReservationNodeIds(
      nodeIds,
      previousRecord,
      currentRecord,
      sourceRowsByTable,
    );
  }
}

class StorageCapacitySemanticProjectionOwner {
  constructor(options = {}) {
    this.service = options.service;
    this.recordsByNodeId = new MapConstructor();
    this.listeners = new SetConstructor();
    this.pendingChangesBySequence = new MapConstructor();
    this.changeEnqueueSequence = 0;
    this.changeDispatchSequence = 0;
    this.dispatchingChanges = false;
    this.sourceRowsByTable = new MapConstructor();
    this.sourceShadowEstablished = false;
    this.timeSource = resolveTimeSource(options);
    this.now = () => this.timeSource.now();
    this.setTimeoutFn = (callback, delayMs) =>
      this.timeSource.setTimeout(callback, delayMs);
    this.clearTimeoutFn = (handle) => this.timeSource.clearTimeout(handle);
    this.timerHandle = null;
    this.timerDeadlineAtMs = null;
    this.timerRevision = 0;
    this.stopped = false;
    this.configure(options);
  }

  configure(options = {}) {
    if (this.stopped) return;
    this.clearTimer();
    if (options.timeSource && typeof options.timeSource.now === 'function') {
      this.timeSource = options.timeSource;
    }
    this.now = typeof options.now === 'function' ?
      options.now : () => this.timeSource.now();
    this.setTimeoutFn = typeof options.setTimeoutFn === 'function' ?
      options.setTimeoutFn :
      (callback, delayMs) => this.timeSource.setTimeout(callback, delayMs);
    this.clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ?
      options.clearTimeoutFn :
      (handle) => this.timeSource.clearTimeout(handle);
    this.resetSourceShadow();
    this.reprojectKnownNodes(normalizeNowMs(this.now()));
  }

  resetSourceShadow() {
    this.sourceRowsByTable = new MapConstructor();
    this.sourceShadowEstablished = false;
  }

  establishSourceShadow() {
    if (this.sourceShadowEstablished) return true;
    const candidate = new MapConstructor();
    try {
      for (let index = 0; index < CAPACITY_SOURCE_TABLES.length; index += 1) {
        const tableName = CAPACITY_SOURCE_TABLES[index];
        const rows = this.service.getSystemTableRowsSync(tableName);
        const byKey = copyRowsByKey(tableName, rows);
        if (!byKey) return false;
        mapSet(candidate, tableName, byKey);
      }
    } catch {
      return false;
    }
    this.sourceRowsByTable = candidate;
    this.sourceShadowEstablished = true;
    return true;
  }

  recordSourceReplacement(nowMs = this.now()) {
    if (this.stopped) return;
    this.resetSourceShadow();
    this.establishSourceShadow();
    this.reprojectKnownNodes(normalizeNowMs(nowMs));
  }

  subscribe(listener) {
    if (typeof listener !== 'function' || this.stopped) return () => {};
    setAdd(this.listeners, listener);
    return () => setDelete(this.listeners, listener);
  }

  getIdentity(nodeId, nowMs = this.now()) {
    const key = normalizeNodeId(nodeId);
    if (this.stopped) {
      return objectFreeze({generation: 0, projection: null});
    }
    const normalizedNowMs = normalizeNowMs(nowMs);
    this.establishSourceShadow();
    const existing = mapGet(this.recordsByNodeId, key);
    if (!existing || (numberIsFinite(existing.projection.nextSemanticChangeAtMs) &&
      normalizedNowMs >= existing.projection.nextSemanticChangeAtMs)) {
      this.reprojectNode(key, normalizedNowMs);
    }
    const current = mapGet(this.recordsByNodeId, key);
    return objectFreeze({
      generation: current?.generation || 0,
      projection: current?.projection || null,
    });
  }

  recordSourceChange(
    tableName,
    operation,
    record,
    nowMs = this.now(),
  ) {
    if (this.stopped) return;
    const normalizedNowMs = normalizeNowMs(nowMs);
    if (!this.establishSourceShadow()) {
      this.reprojectKnownNodes(normalizedNowMs);
      return;
    }
    const source = copyStrictOwnDataRecord(record);
    const byKey = mapGet(this.sourceRowsByTable, tableName);
    const key = readSourceRowKey(tableName, source);
    if (!source || !byKey || key === null) {
      this.resetSourceShadowAndReproject(normalizedNowMs);
      return;
    }
    const changedRows = this.applySourceShadowChange(
      byKey,
      key,
      operation,
      source,
    );
    if (!changedRows) {
      this.resetSourceShadowAndReproject(normalizedNowMs);
      return;
    }
    const {previousRecord, currentRecord} = changedRows;
    const affectedNodeIds = new SetConstructor();
    collectJoinedCapacityNodeIds(
      affectedNodeIds,
      tableName,
      previousRecord,
      currentRecord,
      this.sourceRowsByTable,
    );
    this.reprojectNodeIds(affectedNodeIds, normalizedNowMs);
  }

  resetSourceShadowAndReproject(nowMs) {
    this.resetSourceShadow();
    this.reprojectKnownNodes(nowMs);
  }

  applySourceShadowChange(byKey, key, operation, source) {
    const previousRecord = mapGet(byKey, key) || null;
    if (operation === CDC_OPERATION.DELETE) {
      mapDelete(byKey, key);
    } else if (operation === CDC_OPERATION.INSERT ||
        operation === CDC_OPERATION.UPDATE ||
        operation === CDC_OPERATION.UPSERT) {
      mapSet(byKey, key, objectFreeze(source));
    } else {
      return null;
    }
    return objectFreeze({
      previousRecord,
      currentRecord: operation === CDC_OPERATION.DELETE ?
        null : mapGet(byKey, key),
    });
  }

  reprojectKnownNodes(nowMs) {
    const nodeIds = new SetConstructor();
    mapForEach(this.recordsByNodeId, (_record, nodeId) => {
      setAdd(nodeIds, nodeId);
    });
    this.reprojectNodeIds(nodeIds, nowMs);
  }

  reprojectNodeIds(nodeIds, nowMs) {
    if (this.stopped) return;
    let firstError = null;
    try {
      setForEach(nodeIds, (nodeId) => {
        try {
          this.reprojectNode(nodeId, nowMs, false);
        } catch (error) {
          firstError = firstError || error;
        }
      });
    } finally {
      this.armEarliestTimer(nowMs);
    }
    if (firstError) throw firstError;
  }

  reprojectNode(nodeId, nowMs, rearm = true) {
    if (this.stopped || !nodeId) return null;
    const projection = this.service.buildCapacitySemanticProjection(
      nodeId,
      nowMs,
    );
    const previous = mapGet(this.recordsByNodeId, nodeId);
    const changed = capacityProjectionChanged(previous?.projection, projection);
    const current = objectFreeze({
      generation: changed ? nextGeneration(previous?.generation) :
        previous.generation,
      projection,
    });
    mapSet(this.recordsByNodeId, nodeId, current);
    if (rearm) this.armEarliestTimer(nowMs);
    if (changed) this.publishChange(nodeId, previous || null, current);
    return projection;
  }

  publishChange(nodeId, previous, current) {
    const change = objectFreeze({
      generation: current.generation,
      nodeId,
      previousProjection: previous?.projection || null,
      projection: current.projection,
    });
    if (!this.dispatchingChanges) {
      this.changeEnqueueSequence = 0;
      this.changeDispatchSequence = 0;
      mapClear(this.pendingChangesBySequence);
    }
    this.changeEnqueueSequence += 1;
    mapSet(this.pendingChangesBySequence, this.changeEnqueueSequence, change);
    if (this.dispatchingChanges) return;

    this.dispatchingChanges = true;
    let firstError = null;
    try {
      while (this.changeDispatchSequence < this.changeEnqueueSequence) {
        this.changeDispatchSequence += 1;
        const queued = mapGet(
          this.pendingChangesBySequence,
          this.changeDispatchSequence,
        );
        mapDelete(
          this.pendingChangesBySequence,
          this.changeDispatchSequence,
        );
        if (!queued) continue;
        setForEach(this.listeners, (listener) => {
          try {
            listener(queued);
          } catch (error) {
            firstError = firstError || error;
          }
        });
      }
    } finally {
      this.dispatchingChanges = false;
      mapClear(this.pendingChangesBySequence);
    }
    if (firstError) throw firstError;
  }

  findEarliestDeadline() {
    let earliest = null;
    mapForEach(this.recordsByNodeId, (record) => {
      const deadline = record.projection.nextSemanticChangeAtMs;
      if (!numberIsFinite(deadline)) return;
      if (earliest === null || deadline < earliest) earliest = deadline;
    });
    return earliest;
  }

  clearTimer() {
    this.timerRevision += 1;
    if (this.timerHandle !== null) this.clearTimeoutFn(this.timerHandle);
    this.timerHandle = null;
    this.timerDeadlineAtMs = null;
  }

  armEarliestTimer(nowMs) {
    if (this.stopped) return;
    const deadline = this.findEarliestDeadline();
    if (this.timerHandle !== null && this.timerDeadlineAtMs === deadline) return;
    this.clearTimer();
    if (!numberIsFinite(deadline)) return;
    const revision = this.timerRevision;
    const installation = {installed: false, firedSynchronously: false};
    const callback = this.buildTimerCallback(revision, installation);
    const handle = this.setTimeoutFn(
      callback,
      mathMax(0, deadline - nowMs),
    );
    if (this.stopped || revision !== this.timerRevision) {
      if (handle !== null && handle !== undefined) this.clearTimeoutFn(handle);
      return;
    }
    this.timerHandle = handle ?? null;
    this.timerDeadlineAtMs = deadline;
    installation.installed = true;
    this.unrefTimerHandle();
    if (installation.firedSynchronously &&
        normalizeNowMs(this.now()) >= deadline) {
      callback();
    }
  }

  buildTimerCallback(revision, installation) {
    return () => {
      if (!installation.installed) {
        installation.firedSynchronously = true;
        return;
      }
      this.handleTimer(revision);
    };
  }

  unrefTimerHandle() {
    try {
      if (typeof this.timerHandle?.unref === 'function') {
        this.timerHandle.unref();
      }
    } catch {
      // Timer ownership does not depend on optional process-liveness hints;
      // record the typed outcome instead of swallowing it silently.
      this.timerUnrefUnavailable = true;
    }
  }

  handleTimer(revision) {
    if (this.stopped || revision !== this.timerRevision) return;
    this.timerRevision += 1;
    this.timerHandle = null;
    this.timerDeadlineAtMs = null;
    this.reprojectDueNodes(normalizeNowMs(this.now()));
  }

  reprojectDueNodes(nowMs) {
    const dueNodeIds = new SetConstructor();
    mapForEach(this.recordsByNodeId, (record, nodeId) => {
      const deadline = record.projection.nextSemanticChangeAtMs;
      if (numberIsFinite(deadline) && nowMs >= deadline) {
        setAdd(dueNodeIds, nodeId);
      }
    });
    this.reprojectNodeIds(dueNodeIds, nowMs);
  }

  shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimer();
    setClear(this.listeners);
    mapClear(this.pendingChangesBySequence);
    mapClear(this.recordsByNodeId);
    mapClear(this.sourceRowsByTable);
  }
}

export {
  STORAGE_CAPACITY_NOW_MS_ERROR,
  StorageCapacitySemanticProjectionOwner,
};
