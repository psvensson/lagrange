import {
  CDC_OPERATION,
  TABLES,
} from '../constants/index.js';
import {
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';
import {
  buildDirectGlobalProjection,
  classifyShadowTableImpact,
  classifyTableImpact,
  copySourceRowsSnapshot,
  defineValue,
  freezeImpact,
  readSourceRowKey,
  sharedLivenessComponentChanged,
  sourceObservationsEqual,
} from './readiness-planning-table-impact-classification.js';

const PLANNING_IDENTITY_FIELD = Object.freeze({
  GLOBAL_GENERATION: 'globalPlanningGeneration',
  NODE_GENERATION: 'nodePlanningGeneration',
  SATURATED: 'saturated',
});

const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsSafeInteger = Number.isSafeInteger;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const DATA_DESCRIPTOR_FIELD = 'value';
// UNBASELINED: an earlier revision was INVALID (gap, null, or a classifier
// failure) and the tracker is waiting for the next bracketed quiescent read to
// re-adopt the cache's observed revisions; events in that window are already
// fail-closed by the missing baseline and must not rotate again per event.
const SOURCE_REVISION_STATE = objectFreeze({
  DUPLICATE: 'duplicate',
  EXACT: 'exact',
  INVALID: 'invalid',
  UNBASELINED: 'unbaselined',
});
const REVISIONED_SOURCE_TABLES = objectFreeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
]);

function readOwnDataValue(record, name) {
  if (!record || (typeof record !== 'object' && typeof record !== 'function')) {
    return undefined;
  }
  try {
    const descriptor = objectGetOwnPropertyDescriptor(record, name);
    return descriptor && objectHasOwn(descriptor, DATA_DESCRIPTOR_FIELD) ?
      descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function readGeneration(record, name) {
  const value = readOwnDataValue(record, name);
  return numberIsSafeInteger(value) && value >= 0 ? value : null;
}

function readSaturated(record) {
  const value = readOwnDataValue(record, PLANNING_IDENTITY_FIELD.SATURATED);
  return typeof value === 'boolean' ? value : null;
}

// A planning identity is CURRENT only when both generations are readable and
// it is not saturated. A saturated identity (unclassified source revision,
// unavailable semantic input, stopped owner) blocks admission by design; it
// carries no reusable memo currency, so memo layers fall back to their
// floored table-version key until the ordered barrier closes.
function isPlanningIdentityCurrent(identity) {
  return readGeneration(identity, PLANNING_IDENTITY_FIELD.GLOBAL_GENERATION) !== null &&
    readGeneration(identity, PLANNING_IDENTITY_FIELD.NODE_GENERATION) !== null &&
    readSaturated(identity) === false;
}

function planningIdentitiesEqual(left, right) {
  const leftGlobal = readGeneration(left, PLANNING_IDENTITY_FIELD.GLOBAL_GENERATION);
  const rightGlobal = readGeneration(right, PLANNING_IDENTITY_FIELD.GLOBAL_GENERATION);
  const leftNode = readGeneration(left, PLANNING_IDENTITY_FIELD.NODE_GENERATION);
  const rightNode = readGeneration(right, PLANNING_IDENTITY_FIELD.NODE_GENERATION);
  const leftSaturated = readSaturated(left);
  const rightSaturated = readSaturated(right);
  return leftGlobal !== null && rightGlobal !== null &&
    leftNode !== null && rightNode !== null &&
    leftSaturated !== null && rightSaturated !== null &&
    leftSaturated === false && rightSaturated === false &&
    leftGlobal === rightGlobal && leftNode === rightNode &&
    leftSaturated === rightSaturated;
}

function nextGeneration(tracker, current) {
  if (!numberIsSafeInteger(current) || current < 0 ||
      current >= numberMaxSafeInteger) {
    tracker.saturated = true;
    return numberMaxSafeInteger;
  }
  return current + 1;
}

function isValidSourceRevision(value) {
  return numberIsSafeInteger(value) && value >= 0;
}

function isDuplicateSourceRevision(sourceRevision, previous) {
  return isValidSourceRevision(sourceRevision) &&
    isValidSourceRevision(previous) && sourceRevision <= previous;
}

function isExactSourceRevision(sourceRevision, previous, observed) {
  return isValidSourceRevision(sourceRevision) &&
    isValidSourceRevision(previous) &&
    isValidSourceRevision(observed) &&
    sourceRevision === previous + 1 && sourceRevision <= observed;
}

class ReadinessPlanningSemanticGenerationTracker {
  constructor() {
    this.currentGlobalProjection = null;
    this.globalPlanningGeneration = 0;
    this.byNodePlanningGeneration = new MapConstructor();
    this.semanticChangeSequence = 0;
    this.saturated = false;
    this.classifiedSourceRevisions = objectCreate(null);
    this.sourceRevisionBaselineEstablished = false;
    this.sourceRevisionRebaselinePending = false;
    this.sourceRevisionRebaselineCompleted = false;
    this.sourceRevisionTrackingActive = false;
    this.sourceRowsByTable = new MapConstructor();
    this.currentGlobalProjection = null;
    this.transactionDepth = 0;
    this.transactionGlobalChanged = false;
    this.transactionNodeIds = [];
  }

  initializeSourceRevisionTracking(cache) {
    const observation = this.readSourceObservation(cache);
    if (!observation) return false;
    for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
      const tableName = REVISIONED_SOURCE_TABLES[index];
      defineValue(
        this.classifiedSourceRevisions,
        tableName,
        observation[tableName],
      );
    }
    this.sourceRevisionTrackingActive = true;
    return true;
  }

  beginTransaction() {
    this.transactionDepth++;
  }

  commitTransaction() {
    if (this.transactionDepth === 0) return null;
    this.transactionDepth--;
    if (this.transactionDepth > 0) return null;
    const semanticChanged = this.transactionGlobalChanged ||
      this.transactionNodeIds.length > 0;
    const impact = freezeImpact(
      this.transactionGlobalChanged,
      this.transactionNodeIds,
      semanticChanged,
    );
    this.transactionGlobalChanged = false;
    this.transactionNodeIds = [];
    return semanticChanged ? this.applyImpactImmediately(impact) : impact;
  }

  readSourceObservation(cache) {
    if (typeof cache?.getTableMutationVersion !== 'function') return null;
    const observation = objectCreate(null);
    try {
      for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
        const tableName = REVISIONED_SOURCE_TABLES[index];
        const revision = cache.getTableMutationVersion(tableName);
        if (!numberIsSafeInteger(revision) || revision < 0) return null;
        defineValue(observation, tableName, revision);
      }
    } catch {
      return null;
    }
    return objectFreeze(observation);
  }

  ensureSourceRevisionBaseline(observation, cache = null) {
    if (this.sourceRevisionBaselineEstablished) return true;
    if (!this.canAttemptSourceRevisionBaseline(observation, cache)) {
      return false;
    }
    const bracketed = this.captureBracketedSourceSnapshot(observation, cache);
    if (!bracketed) return false;
    this.sourceRowsByTable = bracketed.rowsByTable;
    this.currentGlobalProjection = null;
    this.sourceRevisionBaselineEstablished = true;
    if (this.sourceRevisionRebaselinePending) {
      this.completeSourceRevisionRebaseline(bracketed.observation);
    }
    return true;
  }

  // Tracking must be active, and outside a pending re-baseline the observed
  // revisions must already equal the classified frontier (the bootstrap
  // precondition); while pending, the bracketed snapshot supplies the frontier.
  canAttemptSourceRevisionBaseline(observation, cache) {
    if (!observation || typeof cache?.getAll !== 'function') return false;
    if (!this.sourceRevisionTrackingActive) {
      this.initializeSourceRevisionTracking(cache);
    }
    return this.sourceRevisionRebaselinePending ||
      sourceObservationsEqual(observation, this.classifiedSourceRevisions);
  }

  // A row snapshot bracketed by two equal observations is a consistent copy
  // of the whole source at that observation; null when a write interleaved.
  captureBracketedSourceSnapshot(observation, cache) {
    const before = this.readSourceObservation(cache);
    if (!sourceObservationsEqual(before, observation)) return null;
    const rowsByTable = copySourceRowsSnapshot(cache);
    if (!rowsByTable) return null;
    const after = this.readSourceObservation(cache);
    if (!sourceObservationsEqual(before, after)) return null;
    return {observation: after, rowsByTable};
  }

  // Re-baseline after an INVALID revision: the bracketed snapshot is the whole
  // current source, so its observed revisions become the classified frontier,
  // and the unclassified span between the invalid event and this snapshot
  // rotates the global identity exactly once (fail closed).
  completeSourceRevisionRebaseline(observation) {
    this.adoptClassifiedSourceRevisions(observation);
    this.sourceRevisionRebaselinePending = false;
    this.sourceRevisionRebaselineCompleted = true;
    this.recordGlobalChange();
  }

  adoptClassifiedSourceRevisions(observation) {
    const classified = objectCreate(null);
    for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
      const tableName = REVISIONED_SOURCE_TABLES[index];
      defineValue(classified, tableName, observation[tableName]);
    }
    this.classifiedSourceRevisions = classified;
  }

  // One-shot: true exactly once after a pending re-baseline completed, so the
  // owner wakes barrier-blocked builds once when the barrier reopens.
  consumeSourceRevisionRebaselineCompletion() {
    const completed = this.sourceRevisionRebaselineCompleted;
    this.sourceRevisionRebaselineCompleted = false;
    return completed;
  }

  resetSourceRevisionBaseline() {
    this.classifiedSourceRevisions = objectCreate(null);
    this.sourceRevisionBaselineEstablished = false;
    this.sourceRevisionRebaselinePending = false;
    this.sourceRevisionRebaselineCompleted = false;
    this.sourceRevisionTrackingActive = false;
    this.sourceRowsByTable = new MapConstructor();
    this.currentGlobalProjection = null;
  }

  hasUnclassifiedSourceChange(observation) {
    if (!this.sourceRevisionTrackingActive || !observation) return false;
    if (!this.sourceRevisionBaselineEstablished) return true;
    for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
      const tableName = REVISIONED_SOURCE_TABLES[index];
      if (observation[tableName] !==
          this.classifiedSourceRevisions[tableName]) return true;
    }
    return false;
  }

  // True when the only unclassified source change is the nodes table (a
  // heartbeat or lease advance): the one change the CL-012 stored-reuse
  // witnesses are built to arbitrate, so a barrier-blocked read may bridge a
  // completed snapshot through them instead of failing closed.
  hasNodeTableOnlyUnclassifiedChange(observation) {
    if (!this.sourceRevisionTrackingActive || !observation ||
      !this.sourceRevisionBaselineEstablished) return false;
    let nodesChanged = false;
    for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
      const tableName = REVISIONED_SOURCE_TABLES[index];
      if (observation[tableName] === this.classifiedSourceRevisions[tableName]) {
        continue;
      }
      if (tableName !== TABLES.NODES) return false;
      nodesChanged = true;
    }
    return nodesChanged;
  }

  classifySourceRevision(tableName, sourceRevision, observation) {
    if (!this.sourceRevisionTrackingActive) {
      return SOURCE_REVISION_STATE.EXACT;
    }
    if (this.sourceRevisionRebaselinePending) {
      return SOURCE_REVISION_STATE.UNBASELINED;
    }
    const previous = this.classifiedSourceRevisions[tableName];
    const observed = observation?.[tableName];
    if (isDuplicateSourceRevision(sourceRevision, previous)) {
      return SOURCE_REVISION_STATE.DUPLICATE;
    }
    return isExactSourceRevision(sourceRevision, previous, observed) ?
      SOURCE_REVISION_STATE.EXACT : SOURCE_REVISION_STATE.INVALID;
  }

  invalidateSourceRevisionBaseline() {
    this.sourceRevisionBaselineEstablished = false;
    // The classified frontier is unknown from here: keeping the stale
    // revisions would classify every later exact event as INVALID and close
    // the barrier permanently. Drop them and re-adopt at the next bracketed
    // quiescent read (ensureSourceRevisionBaseline).
    this.sourceRevisionRebaselinePending = true;
    this.classifiedSourceRevisions = objectCreate(null);
    this.sourceRowsByTable = new MapConstructor();
    this.currentGlobalProjection = null;
  }

  applyShadowTableChange(tableName, operation, record) {
    const source = copyStrictOwnDataRecord(record);
    const byKey = mapGet(this.sourceRowsByTable, tableName);
    const key = readSourceRowKey(tableName, source);
    if (!source || !byKey || key === null) return null;
    const previousRecord = mapGet(byKey, key) || null;
    // The previous event's post-change projection is this event's pre-change
    // projection: one direct projection build per event, not two.
    const previousGlobalProjection = this.currentGlobalProjection ??
      buildDirectGlobalProjection(this.sourceRowsByTable);
    if (operation === CDC_OPERATION.DELETE) {
      mapDelete(byKey, key);
    } else if (operation === CDC_OPERATION.INSERT ||
        operation === CDC_OPERATION.UPDATE ||
        operation === CDC_OPERATION.UPSERT) {
      mapSet(byKey, key, objectFreeze(source));
    } else {
      return null;
    }
    const currentRecord = operation === CDC_OPERATION.DELETE ?
      null : mapGet(byKey, key);
    const currentGlobalProjection = buildDirectGlobalProjection(
      this.sourceRowsByTable,
    );
    this.currentGlobalProjection = currentGlobalProjection;
    return classifyShadowTableImpact(
      tableName,
      previousRecord,
      currentRecord,
      previousGlobalProjection,
      currentGlobalProjection,
    );
  }

  captureIdentity(nodeId) {
    const normalizedNodeId = typeof nodeId === 'string' ? nodeId : '';
    const identity = objectCreate(null);
    defineValue(
      identity,
      PLANNING_IDENTITY_FIELD.GLOBAL_GENERATION,
      this.globalPlanningGeneration,
    );
    defineValue(
      identity,
      PLANNING_IDENTITY_FIELD.NODE_GENERATION,
      mapGet(this.byNodePlanningGeneration, normalizedNodeId) || 0,
    );
    defineValue(identity, PLANNING_IDENTITY_FIELD.SATURATED, this.saturated);
    return objectFreeze(identity);
  }

  applyImpact(impact) {
    if (!impact?.semanticChanged) return impact;
    if (this.transactionDepth > 0) {
      this.transactionGlobalChanged = this.transactionGlobalChanged ||
        impact.globalChanged;
      for (let index = 0; index < impact.affectedNodeIds.length; index += 1) {
        const nodeId = impact.affectedNodeIds[index];
        let found = false;
        for (let candidateIndex = 0;
          candidateIndex < this.transactionNodeIds.length;
          candidateIndex += 1) {
          if (this.transactionNodeIds[candidateIndex] === nodeId) found = true;
        }
        if (!found) {
          defineValue(
            this.transactionNodeIds,
            this.transactionNodeIds.length,
            nodeId,
          );
        }
      }
      return impact;
    }
    return this.applyImpactImmediately(impact);
  }

  applyImpactImmediately(impact) {
    if (impact.globalChanged) {
      this.globalPlanningGeneration = nextGeneration(
        this,
        this.globalPlanningGeneration,
      );
    }
    for (let index = 0; index < impact.affectedNodeIds.length; index += 1) {
      const nodeId = impact.affectedNodeIds[index];
      const current = mapGet(this.byNodePlanningGeneration, nodeId) || 0;
      mapSet(
        this.byNodePlanningGeneration,
        nodeId,
        nextGeneration(this, current),
      );
    }
    this.semanticChangeSequence = nextGeneration(
      this,
      this.semanticChangeSequence,
    );
    return impact;
  }

  recordTableChange(
    tableName,
    operation,
    record,
    sourceRevision = null,
    observation = null,
  ) {
    const revisionState = this.classifySourceRevision(
      tableName,
      sourceRevision,
      observation,
    );
    if (revisionState === SOURCE_REVISION_STATE.DUPLICATE ||
        revisionState === SOURCE_REVISION_STATE.UNBASELINED) {
      return freezeImpact(false, [], false);
    }
    if (revisionState === SOURCE_REVISION_STATE.INVALID) {
      this.invalidateSourceRevisionBaseline();
      return this.applyImpact(freezeImpact(true, []));
    }
    let classifiedImpact;
    try {
      classifiedImpact = this.sourceRevisionBaselineEstablished ?
        this.applyShadowTableChange(tableName, operation, record) :
        classifyTableImpact(tableName, operation, record);
    } catch {
      classifiedImpact = null;
    }
    if (!classifiedImpact) {
      this.invalidateSourceRevisionBaseline();
      return this.applyImpact(freezeImpact(true, []));
    }
    const impact = this.applyImpact(classifiedImpact);
    if (this.sourceRevisionTrackingActive) {
      this.classifiedSourceRevisions[tableName] = sourceRevision;
    }
    return impact;
  }

  recordNodeLivenessChange(change) {
    const source = copyStrictOwnDataRecord(change);
    const nodeId = typeof source?.nodeId === 'string' ? source.nodeId : '';
    if (!source || !nodeId) return this.applyImpact(freezeImpact(true, []));
    if (source.previousProjection === null) {
      return freezeImpact(false, [], false);
    }
    return this.applyImpact(freezeImpact(
      sharedLivenessComponentChanged(
        source.previousProjection,
        source.projection,
      ),
      [nodeId],
    ));
  }

  recordGlobalChange() {
    return this.applyImpact(freezeImpact(true, []));
  }

  recordNodeChange(nodeId) {
    return typeof nodeId === 'string' && nodeId.length > 0 ?
      this.applyImpact(freezeImpact(false, [nodeId])) :
      this.recordGlobalChange();
  }

  getDiagnostics() {
    const byNode = objectCreate(null);
    mapForEach(this.byNodePlanningGeneration, (generation, nodeId) => {
      defineValue(byNode, nodeId, generation);
    });
    return objectFreeze({
      byNodePlanningGeneration: objectFreeze(byNode),
      classifiedSourceRevisions: objectFreeze({
        ...this.classifiedSourceRevisions,
      }),
      generationSaturated: this.saturated,
      globalPlanningGeneration: this.globalPlanningGeneration,
      semanticChangeSequence: this.semanticChangeSequence,
      sourceRevisionBaselineEstablished:
        this.sourceRevisionBaselineEstablished,
      sourceRevisionRebaselinePending: this.sourceRevisionRebaselinePending,
    });
  }
}

export {
  ReadinessPlanningSemanticGenerationTracker,
  isPlanningIdentityCurrent,
  planningIdentitiesEqual,
};
