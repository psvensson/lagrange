import {
  NODE_LIVENESS_SEMANTIC_STATE,
  normalizeSemanticNowMs,
  normalizeThresholds,
  projectNodeLivenessSemantics,
} from './node-liveness-semantic-projection.js';
import {
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const MapConstructor = Map;
const SetConstructor = Set;
const mapPrototypeClear = Function.call.bind(Map.prototype.clear);
const mapPrototypeDelete = Function.call.bind(Map.prototype.delete);
const mapPrototypeEntries = Function.call.bind(Map.prototype.entries);
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const mapPrototypeKeys = Function.call.bind(Map.prototype.keys);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const mapPrototypeValues = Function.call.bind(Map.prototype.values);
const mathMax = Math.max;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const numberIsFinite = Number.isFinite;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const setPrototypeAdd = Function.call.bind(Set.prototype.add);
const setPrototypeClear = Function.call.bind(Set.prototype.clear);
const setPrototypeDelete = Function.call.bind(Set.prototype.delete);
const setPrototypeValues = Function.call.bind(Set.prototype.values);

const NODE_LIVENESS_OWNER_TIME_ERROR =
  'Node liveness owner requires numeric nowMs';
const EMPTY_EVIDENCE = objectFreeze({});

function normalizeNodeId(value) {
  return typeof value === 'string' ? value : '';
}

function nextGeneration(previousGeneration) {
  if (!numberIsFinite(previousGeneration)) return 1;
  return previousGeneration < numberMaxSafeInteger ?
    previousGeneration + 1 : numberMaxSafeInteger;
}

function readProjectionEvidence(owner, nodeId) {
  const recorded = mapPrototypeGet(owner.sourceEvidenceByNodeId, nodeId);
  const rawEvidence = recorded || owner.readNodeEvidence(nodeId) ||
    EMPTY_EVIDENCE;
  return copyStrictOwnDataRecord(rawEvidence) || EMPTY_EVIDENCE;
}

function readSupplementalEvidence(records, nodeId) {
  return mapPrototypeGet(records, nodeId) || EMPTY_EVIDENCE;
}

function buildProjectionRecord(previous, result) {
  const semanticChanged = !previous ||
    previous.semanticSignature !== result.semanticSignature;
  const generation = semanticChanged ?
    nextGeneration(previous?.generation) : previous.generation;
  return {
    record: objectFreeze({
      generation,
      projection: result.projection,
      semanticSignature: result.semanticSignature,
    }),
    semanticChanged,
  };
}

function deliverSemanticChange(observer, change, firstError) {
  try {
    observer(change);
  } catch (error) {
    return firstError || error;
  }
  return firstError;
}

class NodeLivenessSemanticProjectionOwner {
  constructor(options = {}) {
    const source = copyStrictOwnDataRecord(options) || {};
    this.localNodeId = normalizeNodeId(source.localNodeId) || null;
    this.timeSource = source.timeSource || null;
    this.now = typeof source.now === 'function' ?
      source.now :
      () => this.timeSource?.now();
    this.setTimeoutFn = typeof source.setTimeoutFn === 'function' ?
      source.setTimeoutFn :
      (callback, delayMs) => this.timeSource?.setTimeout(callback, delayMs);
    this.clearTimeoutFn = typeof source.clearTimeoutFn === 'function' ?
      source.clearTimeoutFn :
      (handle) => this.timeSource?.clearTimeout(handle);
    this.readNodeEvidence = typeof source.readNodeEvidence === 'function' ?
      source.readNodeEvidence :
      () => objectFreeze({nodeRow: null});
    this.thresholds = normalizeThresholds(source.thresholds);
    this.onSemanticChange = typeof source.onSemanticChange === 'function' ?
      source.onSemanticChange : null;
    this.recordsByNodeId = new MapConstructor();
    this.sourceEvidenceByNodeId = new MapConstructor();
    this.transportGraceEvidenceByNodeId = new MapConstructor();
    this.provisioningTrustEvidenceByNodeId = new MapConstructor();
    this.pendingSemanticChangesBySequence = new MapConstructor();
    this.listeners = new SetConstructor();
    this.semanticChangeEnqueueSequence = 0;
    this.semanticChangeDispatchSequence = 0;
    this.dispatchingSemanticChanges = false;
    this.timerHandle = null;
    this.timerDeadlineAtMs = null;
    this.timerRevision = 0;
    this.stopped = false;
  }

  projectNodeLiveness(nodeId, nowMs = this.now()) {
    let normalizedNowMs;
    try {
      normalizedNowMs = normalizeSemanticNowMs(nowMs);
    } catch {
      throw new TypeError(NODE_LIVENESS_OWNER_TIME_ERROR);
    }
    const key = normalizeNodeId(nodeId);
    const existing = mapPrototypeGet(this.recordsByNodeId, key);
    if (this.stopped) return existing?.projection || null;
    if (
      !existing ||
      (numberIsFinite(existing.projection.nextSemanticChangeAtMs) &&
        normalizedNowMs >= existing.projection.nextSemanticChangeAtMs)
    ) {
      return this.reprojectNode(key, normalizedNowMs);
    }
    return existing.projection;
  }

  recordNodeSourceChange(nodeId, nowMs = this.now()) {
    if (this.stopped) return null;
    const key = normalizeNodeId(nodeId);
    mapPrototypeDelete(this.sourceEvidenceByNodeId, key);
    return this.reprojectNode(key, normalizeSemanticNowMs(nowMs));
  }

  projectNodeLivenessFromEvidence(
    nodeId,
    evidence,
    nowMs = this.now(),
  ) {
    if (this.stopped) return null;
    const key = normalizeNodeId(nodeId);
    const source = copyStrictOwnDataRecord(evidence) || objectFreeze({});
    mapPrototypeSet(this.sourceEvidenceByNodeId, key, objectFreeze(source));
    return this.reprojectNode(key, normalizeSemanticNowMs(nowMs));
  }

  recordAllSourceChanges(nowMs = this.now()) {
    if (this.stopped) return;
    const normalizedNowMs = normalizeSemanticNowMs(nowMs);
    let firstError = null;
    try {
      for (const nodeId of mapPrototypeKeys(this.recordsByNodeId)) {
        mapPrototypeDelete(this.sourceEvidenceByNodeId, nodeId);
        try {
          this.reprojectNode(nodeId, normalizedNowMs, false);
        } catch (error) {
          firstError = firstError || error;
        }
      }
    } finally {
      this.armEarliestTimer(normalizedNowMs);
    }
    if (firstError) throw firstError;
  }

  recordTransportGraceEvidence(nodeId, evidence = {}, nowMs = this.now()) {
    if (this.stopped) return null;
    const key = normalizeNodeId(nodeId);
    const source = copyStrictOwnDataRecord(evidence) || {};
    mapPrototypeSet(this.transportGraceEvidenceByNodeId, key, objectFreeze({
      transportGraceEligible: source.eligible === true,
      transportGraceStartedAtMs: source.startedAtMs,
    }));
    return this.reprojectNode(key, normalizeSemanticNowMs(nowMs));
  }

  recordProvisioningTrustGraceEvidence(
    nodeId,
    evidence = {},
    nowMs = this.now(),
  ) {
    if (this.stopped) return null;
    const key = normalizeNodeId(nodeId);
    const source = copyStrictOwnDataRecord(evidence) || {};
    mapPrototypeSet(this.provisioningTrustEvidenceByNodeId, key, objectFreeze({
      provisioningTrustGraceEligible: source.eligible === true,
      provisioningTrustGraceStartedAtMs: source.startedAtMs,
    }));
    return this.reprojectNode(key, normalizeSemanticNowMs(nowMs));
  }

  getNodeLivenessGeneration(nodeId, nowMs = this.now()) {
    const key = normalizeNodeId(nodeId);
    const existing = mapPrototypeGet(this.recordsByNodeId, key);
    if (existing && !this.stopped) this.projectNodeLiveness(key, nowMs);
    return mapPrototypeGet(this.recordsByNodeId, key)?.generation || 0;
  }

  getNodeLivenessSemanticIdentity(nodeId, nowMs = this.now()) {
    const projection = this.projectNodeLiveness(nodeId, nowMs);
    const record = mapPrototypeGet(
      this.recordsByNodeId,
      normalizeNodeId(nodeId),
    );
    return objectFreeze({
      generation: record?.generation || 0,
      semanticSignature: record?.semanticSignature || '',
      projection,
    });
  }

  getNodeLivenessProjections(nodeIds, nowMs = this.now()) {
    const projections = objectCreate(null);
    const normalizedNowMs = normalizeSemanticNowMs(nowMs);
    const values = copyDenseOwnDataArray(nodeIds) || [];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const row = copyStrictOwnDataRecord(value);
      const key = row ?
        normalizeNodeId(row.node_id ?? row.nodeId) :
        normalizeNodeId(value);
      if (key) projections[key] = this.projectNodeLiveness(key, normalizedNowMs);
    }
    return objectFreeze(projections);
  }

  subscribe(listener) {
    if (typeof listener !== 'function' || this.stopped) return () => {};
    setPrototypeAdd(this.listeners, listener);
    return () => setPrototypeDelete(this.listeners, listener);
  }

  reprojectNode(nodeId, nowMs, rearm = true) {
    if (this.stopped || !numberIsFinite(nowMs)) return null;
    const evidence = readProjectionEvidence(this, nodeId);
    const result = this.evaluateNodeLiveness(nodeId, evidence, nowMs);
    const previous = mapPrototypeGet(this.recordsByNodeId, nodeId);
    const {record, semanticChanged} = buildProjectionRecord(previous, result);
    mapPrototypeSet(this.recordsByNodeId, nodeId, record);
    if (rearm) this.armEarliestTimer(nowMs);
    if (semanticChanged) {
      this.publishSemanticChange(nodeId, previous || null, record);
    }
    return mapPrototypeGet(this.recordsByNodeId, nodeId)?.projection ||
      record.projection;
  }

  evaluateNodeLiveness(nodeId, evidence, nowMs) {
    const transportGraceEvidence = readSupplementalEvidence(
      this.transportGraceEvidenceByNodeId,
      nodeId,
    );
    const provisioningTrustEvidence = readSupplementalEvidence(
      this.provisioningTrustEvidenceByNodeId,
      nodeId,
    );
    return projectNodeLivenessSemantics({
      ...evidence,
      ...transportGraceEvidence,
      ...provisioningTrustEvidence,
      localNodeId: this.localNodeId,
      nodeId,
      nowMs,
      thresholds: this.thresholds,
    });
  }

  publishSemanticChange(nodeId, previous, current) {
    const change = objectFreeze({
      generation: current.generation,
      nodeId,
      previousProjection: previous?.projection || null,
      projection: current.projection,
    });
    if (!this.dispatchingSemanticChanges) {
      this.semanticChangeEnqueueSequence = 0;
      this.semanticChangeDispatchSequence = 0;
      mapPrototypeClear(this.pendingSemanticChangesBySequence);
    }
    this.semanticChangeEnqueueSequence++;
    mapPrototypeSet(
      this.pendingSemanticChangesBySequence,
      this.semanticChangeEnqueueSequence,
      change,
    );
    if (this.dispatchingSemanticChanges) return;

    this.dispatchingSemanticChanges = true;
    let firstError = null;
    try {
      while (this.semanticChangeDispatchSequence <
        this.semanticChangeEnqueueSequence) {
        this.semanticChangeDispatchSequence++;
        const queuedChange = mapPrototypeGet(
          this.pendingSemanticChangesBySequence,
          this.semanticChangeDispatchSequence,
        );
        mapPrototypeDelete(
          this.pendingSemanticChangesBySequence,
          this.semanticChangeDispatchSequence,
        );
        if (!queuedChange) continue;
        if (this.onSemanticChange) {
          firstError = deliverSemanticChange(
            this.onSemanticChange,
            queuedChange,
            firstError,
          );
        }
        for (const listener of setPrototypeValues(this.listeners)) {
          firstError = deliverSemanticChange(
            listener,
            queuedChange,
            firstError,
          );
        }
      }
    } finally {
      this.dispatchingSemanticChanges = false;
      mapPrototypeClear(this.pendingSemanticChangesBySequence);
    }
    if (firstError) throw firstError;
  }

  findEarliestDeadline() {
    let earliest = null;
    for (const record of mapPrototypeValues(this.recordsByNodeId)) {
      const deadlineAtMs = record.projection.nextSemanticChangeAtMs;
      if (!numberIsFinite(deadlineAtMs)) continue;
      if (earliest === null || deadlineAtMs < earliest) earliest = deadlineAtMs;
    }
    return earliest;
  }

  clearTimer() {
    this.timerRevision++;
    if (this.timerHandle !== null) this.clearTimeoutFn(this.timerHandle);
    this.timerHandle = null;
    this.timerDeadlineAtMs = null;
  }

  armEarliestTimer(nowMs) {
    if (this.stopped) return;
    const deadlineAtMs = this.findEarliestDeadline();
    if (
      this.timerHandle !== null &&
      this.timerDeadlineAtMs === deadlineAtMs
    ) {
      return;
    }
    this.clearTimer();
    if (!numberIsFinite(deadlineAtMs)) return;
    const revision = this.timerRevision;
    const delayMs = mathMax(0, deadlineAtMs - nowMs);
    const handle = this.setTimeoutFn(() => {
      if (this.stopped || revision !== this.timerRevision) return;
      this.timerHandle = null;
      this.timerDeadlineAtMs = null;
      this.reprojectDueNodes(normalizeSemanticNowMs(this.now()));
    }, delayMs);
    this.timerHandle = handle ?? null;
    this.timerDeadlineAtMs = deadlineAtMs;
    if (typeof this.timerHandle?.unref === 'function') this.timerHandle.unref();
  }

  reprojectDueNodes(nowMs) {
    if (this.stopped || !numberIsFinite(nowMs)) return;
    let firstError = null;
    try {
      for (const [nodeId, record] of mapPrototypeEntries(this.recordsByNodeId)) {
        const deadlineAtMs = record.projection.nextSemanticChangeAtMs;
        if (numberIsFinite(deadlineAtMs) && nowMs >= deadlineAtMs) {
          try {
            this.reprojectNode(nodeId, nowMs, false);
          } catch (error) {
            firstError = firstError || error;
          }
        }
      }
    } finally {
      this.armEarliestTimer(nowMs);
    }
    if (firstError) throw firstError;
  }

  shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimer();
    setPrototypeClear(this.listeners);
    mapPrototypeClear(this.sourceEvidenceByNodeId);
    mapPrototypeClear(this.transportGraceEvidenceByNodeId);
    mapPrototypeClear(this.provisioningTrustEvidenceByNodeId);
    mapPrototypeClear(this.pendingSemanticChangesBySequence);
  }
}

export {
  NODE_LIVENESS_SEMANTIC_STATE,
  NodeLivenessSemanticProjectionOwner,
};
