import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  READINESS_PLANNING_OWNER_DEPENDENCIES,
  READINESS_PLANNING_REASON,
  READINESS_PLANNING_TABLES,
  appendArrayValue,
  buildQueueOwnerKey,
  defaultMacrotaskScheduler,
  freezeToken,
  getReadinessBuildFailureReason,
  getReadinessBuildRetryAfterMs,
  isReadinessBuildFailureRetryable,
  nextSemanticGeneration,
  readConnectedNodeFingerprint,
  shouldResetReadinessBuildAttempts,
} from './readiness-planning-version-contract.js';
import {
  ReadinessPlanningSemanticGenerationTracker,
} from './readiness-planning-semantic-generation.js';
import {
  defineRecordValue,
} from './readiness-planning-publication-contract.js';
import {
  readSharedNodeRows,
  readFormationBootstrapOwnerKey,
  readFormationEpochKey,
  readOwnerKey,
} from './readiness-planning-formation-source.js';
import {copyDenseOwnDataArray} from '../utils/strict-own-data.js';
import {ReadinessPlanningDiagnosticRetention} from
  './readiness-planning-diagnostic-retention.js';
import {installReadinessPlanningSemanticCurrencyMethods} from './readiness-planning-semantic-currency-methods.js';
import {installReadinessPlanningCompletionAdmissionMethods} from './readiness-planning-completion-admission-methods.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const mathMax = Math.max;
const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapClear = Function.call.bind(Map.prototype.clear);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
);
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const setAdd = Function.call.bind(Set.prototype.add);
const setClear = Function.call.bind(Set.prototype.clear);
const setDelete = Function.call.bind(Set.prototype.delete);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;
const stringConstructor = String;
const READINESS_PLANNING_QUEUE_NAME = 'readiness-planning-snapshot-owner';
const READINESS_PLANNING_MAX_RETRY_ATTEMPTS = 3;
const READINESS_PLANNING_MAX_OPTION_VARIANTS_PER_OWNER = 16;

function initializeBuildVariantState(owner) {
  owner.completedSnapshotsByOwnerAndBuildKey = new MapConstructor();
  owner.buildOptionsByOwnerAndBuildKey = new MapConstructor();
  owner.barrierBlockedOptionsByOwnerAndBuildKey = new MapConstructor();
}

function initializeGenerationState(owner) {
  owner.tableRevisions = objectCreate(null);
  for (let index = 0; index < READINESS_PLANNING_TABLES.length; index++) {
    defineRecordValue(owner.tableRevisions, READINESS_PLANNING_TABLES[index], 0);
  }
  owner.cacheGeneration = 1;
  owner.membershipOwnerGeneration = 1;
  owner.ownerDependencyGenerations = objectCreate(null);
  for (let index = 0;
    index < READINESS_PLANNING_OWNER_DEPENDENCIES.length;
    index++) {
    defineRecordValue(
      owner.ownerDependencyGenerations,
      READINESS_PLANNING_OWNER_DEPENDENCIES[index],
      1,
    );
  }
  owner.readinessSnapshotGeneration = 0;
  owner.recoveryEpochRevision = 0;
  owner.transportTopologyGeneration = 0;
  owner.generationSaturated = false;
}

function supportsCapacitySemanticPlanning(service) {
  return typeof service?.storageAccountingService
    ?.subscribeCapacitySemanticChanges === 'function' &&
    typeof service?.storageAccountingService
      ?.getCapacitySemanticIdentity === 'function';
}

function initializeSemanticPlanningState(owner) {
  owner.transportTopologyProjection = readConnectedNodeFingerprint(
    owner.service?.messageRouter,
  );
  owner.transportTopologyValid = owner.transportTopologyProjection.valid;
  owner.pendingLazyGlobalImpact = false;
  owner.semanticGenerationTracker =
    new ReadinessPlanningSemanticGenerationTracker();
  owner.semanticGenerationTracker.initializeSourceRevisionTracking(
    owner.service?.systemTableCache,
  );
  owner.semanticPlanningEnabled =
    typeof owner.service?.nodeLivenessSemanticProjectionOwner?.subscribe ===
      'function';
  owner.capacitySemanticPlanningEnabled = supportsCapacitySemanticPlanning(
    owner.service,
  );
}

function createPlanningQueue(owner, options) {
  return new OwnerKeyReconcileQueue({
    name: READINESS_PLANNING_QUEUE_NAME,
    maxConcurrency: 1,
    maxItemsPerDrain: 1,
    scheduleDrainFn: typeof options.scheduleDrainFn === 'function' ?
      options.scheduleDrainFn : defaultMacrotaskScheduler,
    now: owner.now,
    setTimeoutFn: owner.service?.setTimeoutFn,
    clearTimeoutFn: owner.service?.clearTimeoutFn,
    reconcileFn: (_queueOwnerKey, _reasons, context) =>
      owner.reconcile(context?.ownerKey, context),
    retryPolicy: {
      isRetryableError: isReadinessBuildFailureRetryable,
      getRetryAfterMs: getReadinessBuildRetryAfterMs,
      getFailureReason: getReadinessBuildFailureReason,
      shouldResetAttempts: shouldResetReadinessBuildAttempts,
      maxAttempts: READINESS_PLANNING_MAX_RETRY_ATTEMPTS,
    },
  });
}

function subscribeNodeLivenessChanges(owner) {
  const livenessOwner = owner.service?.nodeLivenessSemanticProjectionOwner;
  if (typeof livenessOwner?.subscribe !== 'function') return () => {};
  return livenessOwner.subscribe(
    (change) => owner.recordNodeLivenessChange(change),
  );
}

class ReadinessPlanningSnapshotOwner {
  constructor(options = {}) {
    this.service = options.service;
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    initializeGenerationState(this);
    initializeSemanticPlanningState(this);
    this.completedSnapshotsByOwnerKey = new MapConstructor();
    initializeBuildVariantState(this);
    this.logicalOwnerKeyByQueueOwnerKey = new MapConstructor();
    this.initialBootstrapConsumed = false;
    this.buildCount = 0;
    this.diagnosticRetention = new ReadinessPlanningDiagnosticRetention();
    this.snapshotListeners = new SetConstructor();
    this.snapshotListenerFailureCount = 0;
    this.feedbackSignatureByNodeId = new MapConstructor();
    // Lazily baselined on the first enqueue: an eager read here performs a
    // full-table cache scan at service construction, which the async
    // owner-path contract forbids before any planning consumer exists.
    this.formationEpochKey = null;
    this.prioritizedFormationOwnerKeys = new SetConstructor();
    this.queue = createPlanningQueue(this, options);
    this.stopped = false;
    this.sourceChangeTransactionDepth = 0;
    this.nodeLivenessUnsubscribe = subscribeNodeLivenessChanges(this);
    this.capacityUnsubscribe = () => {};
    this.refreshCapacitySemanticSubscription();
  }

  captureToken() {
    if (this.stopped) return freezeToken(this);
    const projection = readConnectedNodeFingerprint(
      this.service?.messageRouter,
    );
    if (projection.valid !== this.transportTopologyProjection.valid ||
        projection.fingerprint !==
          this.transportTopologyProjection.fingerprint) {
      this.transportTopologyProjection = projection;
      this.transportTopologyValid = projection.valid;
      this.transportTopologyGeneration = nextSemanticGeneration(
        this,
        this.transportTopologyGeneration,
      );
      const impact = this.semanticGenerationTracker.recordGlobalChange();
      this.pendingLazyGlobalImpact = impact.semanticChanged === true;
    }
    return freezeToken(this);
  }

  tokensEqual(left, right) {
    return left?.tokenKey === right?.tokenKey;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    setAdd(this.snapshotListeners, listener);
    return () => setDelete(this.snapshotListeners, listener);
  }

  notifySnapshotPublished(ownerKey, snapshot, capturedToken) {
    const event = Object.freeze({ownerKey, snapshot, capturedToken});
    setForEach(this.snapshotListeners, (listener) => {
      try {
        listener(event);
      } catch {
        this.snapshotListenerFailureCount++;
      }
    });
  }

  captureBuildOptionsKey(ownerKey, options = {}) {
    if (typeof this.service?.buildReadinessEvaluationKey !== 'function') {
      return stringConstructor(ownerKey);
    }
    return this.service.buildReadinessEvaluationKey(ownerKey, options);
  }

  enqueueBuild(ownerKey, reason, options, token = this.captureToken()) {
    const buildOptionsKey = this.captureBuildOptionsKey(ownerKey, options);
    this.rememberBuildOptions(ownerKey, buildOptionsKey, options);
    const queueOwnerKey = buildQueueOwnerKey(ownerKey, buildOptionsKey);
    mapSet(this.logicalOwnerKeyByQueueOwnerKey, queueOwnerKey, ownerKey);
    this.queue.enqueue(queueOwnerKey, reason, {
      ownerKey,
      options,
      // Enqueue is an invalidation bookkeeping path, not an admission read.
      // The semantic event has already rotated the tracker, so capture its
      // current identity without forcing all-node P/C lazy projection here.
      planningIdentity: this.semanticGenerationTracker.captureIdentity(
        ownerKey,
      ),
      token,
    });
    return queueOwnerKey;
  }

  rememberBuildOptions(ownerKey, buildOptionsKey, options) {
    let variants = mapGet(this.buildOptionsByOwnerAndBuildKey, ownerKey);
    if (!variants) {
      variants = new MapConstructor();
      mapSet(this.buildOptionsByOwnerAndBuildKey, ownerKey, variants);
    }
    if (mapHas(variants, buildOptionsKey)) mapDelete(variants, buildOptionsKey);
    mapSet(variants, buildOptionsKey, options);
    while (mapSize(variants) >
      READINESS_PLANNING_MAX_OPTION_VARIANTS_PER_OWNER) {
      let oldestKey = null;
      mapForEach(variants, (_value, key) => {
        const queueOwnerKey = buildQueueOwnerKey(ownerKey, key);
        if (
          oldestKey === null &&
          !this.queue.isInFlight(queueOwnerKey)
        ) {
          oldestKey = key;
        }
      });
      if (oldestKey === null) break;
      mapDelete(variants, oldestKey);
      const completedVariants = mapGet(
        this.completedSnapshotsByOwnerAndBuildKey,
        ownerKey,
      );
      if (completedVariants) mapDelete(completedVariants, oldestKey);
      const queueOwnerKey = buildQueueOwnerKey(ownerKey, oldestKey);
      this.queue.discard(queueOwnerKey);
      mapDelete(this.logicalOwnerKeyByQueueOwnerKey, queueOwnerKey);
    }
  }

  readCompleted(ownerKey, buildOptionsKey) {
    const variants = mapGet(
      this.completedSnapshotsByOwnerAndBuildKey,
      ownerKey,
    );
    return variants ? mapGet(variants, buildOptionsKey) || null : null;
  }

  rememberCompleted(ownerKey, buildOptionsKey, completed) {
    let variants = mapGet(
      this.completedSnapshotsByOwnerAndBuildKey,
      ownerKey,
    );
    if (!variants) {
      variants = new MapConstructor();
      mapSet(this.completedSnapshotsByOwnerAndBuildKey, ownerKey, variants);
    }
    if (mapHas(variants, buildOptionsKey)) mapDelete(variants, buildOptionsKey);
    mapSet(variants, buildOptionsKey, completed);
    while (mapSize(variants) >
      READINESS_PLANNING_MAX_OPTION_VARIANTS_PER_OWNER) {
      let oldestKey = null;
      mapForEach(variants, (_value, key) => {
        if (oldestKey === null) oldestKey = key;
      });
      mapDelete(variants, oldestKey);
    }
    mapSet(this.completedSnapshotsByOwnerKey, ownerKey, completed);
  }

  listOwnerKeys(record = null, sharedNodeRows = null) {
    const ownerKeys = [];
    const appendUniqueOwnerKey = (ownerKey) => {
      if (ownerKey && !arrayIncludes(ownerKeys, ownerKey)) {
        appendArrayValue(ownerKeys, ownerKey);
      }
    };
    const changedNodeId = readOwnerKey(record);
    appendUniqueOwnerKey(changedNodeId);
    const rows = Array.isArray(sharedNodeRows) ?
      sharedNodeRows :
      readSharedNodeRows(this.service);
    for (let index = 0; index < rows.length; index++) {
      appendUniqueOwnerKey(readOwnerKey(rows[index]));
    }
    mapForEach(this.buildOptionsByOwnerAndBuildKey, (_variants, ownerKey) => {
      appendUniqueOwnerKey(ownerKey);
    });
    if (ownerKeys.length === 0 && typeof this.service?.nodeId === 'string') {
      appendUniqueOwnerKey(this.service.nodeId);
    }
    const formationOwnerKey =
      readFormationBootstrapOwnerKey(this.service, rows);
    if (!formationOwnerKey || !arrayIncludes(ownerKeys, formationOwnerKey)) {
      return ownerKeys;
    }
    const prioritizedOwnerKeys = [formationOwnerKey];
    for (let index = 0; index < ownerKeys.length; index++) {
      if (ownerKeys[index] !== formationOwnerKey) {
        appendArrayValue(prioritizedOwnerKeys, ownerKeys[index]);
      }
    }
    return prioritizedOwnerKeys;
  }

  readSharedNodeRowsForEnqueue() {
    const ownerBackedWithoutVersionedCache = Boolean(
      this.service?.nodesOwner &&
      typeof this.service?.systemTableCache?.getTableMutationVersion !==
        'function',
    );
    return ownerBackedWithoutVersionedCache ? [] :
      readSharedNodeRows(this.service);
  }

  readOwnerBuildVariants(ownerKey) {
    const optionsByBuildKey = mapGet(
      this.buildOptionsByOwnerAndBuildKey,
      ownerKey,
    );
    const variants = [];
    if (optionsByBuildKey) {
      mapForEach(optionsByBuildKey, (options) => {
        appendArrayValue(variants, options);
      });
    }
    const defaultOptions = {};
    const defaultBuildOptionsKey = this.captureBuildOptionsKey(
      ownerKey,
      defaultOptions,
    );
    if (!optionsByBuildKey ||
        !mapHas(optionsByBuildKey, defaultBuildOptionsKey)) {
      appendArrayValue(variants, defaultOptions);
    }
    return variants;
  }

  enqueueOwnerVariants(
    ownerKey,
    reason,
    token,
    excludedQueueOwnerKey,
  ) {
    const variants = this.readOwnerBuildVariants(ownerKey);
    for (let index = 0; index < variants.length; index += 1) {
      const options = variants[index];
      const buildOptionsKey = this.captureBuildOptionsKey(ownerKey, options);
      if (buildQueueOwnerKey(ownerKey, buildOptionsKey) !==
          excludedQueueOwnerKey) {
        this.enqueueBuild(ownerKey, reason, options, token);
      }
    }
  }

  promoteFormationOwner(sharedNodeRows) {
    const formationOwnerKey =
      readFormationBootstrapOwnerKey(this.service, sharedNodeRows);
    const formationEpochKey =
      readFormationEpochKey(this.service, sharedNodeRows);
    if (formationEpochKey !== this.formationEpochKey) {
      this.formationEpochKey = formationEpochKey;
      setClear(this.prioritizedFormationOwnerKeys);
    }
    if (!formationOwnerKey ||
        setHas(this.prioritizedFormationOwnerKeys, formationOwnerKey)) return;
    const buildOptionsKey = this.captureBuildOptionsKey(formationOwnerKey, {});
    this.queue.promotePending(
      buildQueueOwnerKey(formationOwnerKey, buildOptionsKey),
    );
    setAdd(this.prioritizedFormationOwnerKeys, formationOwnerKey);
  }

  enqueueOwnerKeys(reason, record = null, excludedQueueOwnerKey = null) {
    const token = this.captureToken();
    // One shared frozen node-row read serves the owner list and both
    // formation keys below; per-callee re-reads amplified full-table reads
    // several times per enqueue on the live seed.
    const sharedNodeRows = this.readSharedNodeRowsForEnqueue();
    const ownerKeys = this.listOwnerKeys(record, sharedNodeRows);
    for (let index = 0; index < ownerKeys.length; index++) {
      this.enqueueOwnerVariants(
        ownerKeys[index],
        reason,
        token,
        excludedQueueOwnerKey,
      );
    }
    this.promoteFormationOwner(sharedNodeRows);
  }

  requestRefresh(ownerKey, options = {}) {
    if (!ownerKey) {
      return;
    }
    this.enqueueBuild(
      ownerKey,
      READINESS_PLANNING_REASON.LIVE_VETO,
      options,
    );
  }

  flushLazyGlobalImpact(excludedQueueOwnerKey = null) {
    if (!this.pendingLazyGlobalImpact || this.stopped) return;
    this.pendingLazyGlobalImpact = false;
    this.enqueueOwnerKeys(
      READINESS_PLANNING_REASON.SOURCE_CHANGED,
      null,
      excludedQueueOwnerKey,
    );
  }

  enqueueAffectedOwnerKey(ownerKey, reason) {
    const optionsByBuildKey = mapGet(
      this.buildOptionsByOwnerAndBuildKey,
      ownerKey,
    );
    if (!optionsByBuildKey) {
      this.enqueueBuild(ownerKey, reason, {});
      return;
    }
    const variants = [];
    mapForEach(optionsByBuildKey, (options) => {
      appendArrayValue(variants, options);
    });
    for (let index = 0; index < variants.length; index += 1) {
      this.enqueueBuild(ownerKey, reason, variants[index]);
    }
  }

  applyPlanningImpact(impact) {
    if (this.stopped || !impact?.semanticChanged) return;
    if (this.sourceChangeTransactionDepth > 0) return;
    if (impact.globalChanged) {
      this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
      return;
    }
    for (let index = 0; index < impact.affectedNodeIds.length; index += 1) {
      this.enqueueAffectedOwnerKey(
        impact.affectedNodeIds[index],
        READINESS_PLANNING_REASON.SOURCE_CHANGED,
      );
    }
  }

  beginCacheChangeTransaction() {
    if (this.stopped) return;
    this.sourceChangeTransactionDepth++;
    this.semanticGenerationTracker.beginTransaction();
  }

  commitCacheChangeTransaction() {
    if (this.sourceChangeTransactionDepth === 0) return;
    this.sourceChangeTransactionDepth--;
    const impact = this.semanticGenerationTracker.commitTransaction();
    if (this.sourceChangeTransactionDepth === 0 && impact) {
      this.applyPlanningImpact(impact);
      if (!this.hasUnclassifiedSourceChange()) {
        this.wakeBarrierBlockedVariants();
      }
    }
  }

  readSync(ownerKey, options, buildSnapshot) {
    const currentSource = this.captureCurrentPlanningSource(ownerKey);
    const currentToken = currentSource.token;
    const buildOptionsKey = this.captureBuildOptionsKey(ownerKey, options);
    const currentQueueOwnerKey = buildQueueOwnerKey(ownerKey, buildOptionsKey);
    this.rememberBuildOptions(ownerKey, buildOptionsKey, options);
    const completed = this.readCompleted(ownerKey, buildOptionsKey);
    if (!this.hasUnclassifiedSourceChange(currentSource.observation)) {
      this.wakeBarrierBlockedVariants(currentQueueOwnerKey);
    }
    this.flushLazyGlobalImpact(currentQueueOwnerKey);
    if (currentToken.transportTopologyValid === false ||
        this.hasUnclassifiedSourceChange(currentSource.observation)) {
      this.rememberBarrierBlockedBuild(ownerKey, buildOptionsKey, options);
      this.enqueueBuild(
        ownerKey,
        READINESS_PLANNING_REASON.SOURCE_CHANGED,
        options,
        currentToken,
      );
      return this.buildMemoizedDeferredSnapshot(
        completed?.snapshot || null,
        currentToken,
        ownerKey,
      );
    }
    if (!completed) {
      if (this.canConsumeInitialBootstrap(ownerKey)) {
        this.initialBootstrapConsumed = true;
        const publicationGuard = this.capturePublicationGuard(ownerKey);
        const snapshot = buildSnapshot();
        return this.publishCompleted(
          ownerKey,
          snapshot,
          currentToken,
          buildOptionsKey,
          false,
          options,
          publicationGuard,
          currentSource.identity,
          currentSource,
        );
      }
      this.enqueueBuild(
        ownerKey,
        READINESS_PLANNING_REASON.SOURCE_CHANGED,
        options,
        currentToken,
      );
      return this.buildMemoizedDeferredSnapshot(null, currentToken, ownerKey);
    }
    if (this.canReuseCompletedSnapshot(
      ownerKey,
      completed,
      currentToken,
      buildOptionsKey,
    )) {
      return completed.snapshot;
    }
    this.enqueueBuild(
      ownerKey,
      READINESS_PLANNING_REASON.LIVE_VETO,
      options,
      currentToken,
    );
    return this.buildMemoizedDeferredSnapshot(
      completed.snapshot,
      currentToken,
      ownerKey,
    );
  }

  prepareReconcileSource(ownerKey, options) {
    const capturedSource = this.captureCurrentPlanningSource(ownerKey);
    const buildOptionsKey = this.captureBuildOptionsKey(ownerKey, options);
    this.rememberBuildOptions(ownerKey, buildOptionsKey, options);
    const currentQueueOwnerKey = buildQueueOwnerKey(ownerKey, buildOptionsKey);
    const sourceUnclassified = this.hasUnclassifiedSourceChange(
      capturedSource.observation,
    );
    if (!sourceUnclassified) {
      this.wakeBarrierBlockedVariants(currentQueueOwnerKey);
    }
    this.flushLazyGlobalImpact(currentQueueOwnerKey);
    const blocked = capturedSource.token.transportTopologyValid === false ||
      sourceUnclassified;
    if (blocked) {
      this.rememberBarrierBlockedBuild(ownerKey, buildOptionsKey, options);
    }
    return objectFreeze({
      blocked,
      buildOptionsKey,
      capturedSource,
    });
  }

  reconcile(ownerKey, context = {}) {
    const options = context?.options || {};
    const prepared = this.prepareReconcileSource(ownerKey, options);
    const {buildOptionsKey, capturedSource} = prepared;
    const capturedToken = capturedSource.token;
    const capturedPlanningIdentity = capturedSource.identity;
    if (prepared.blocked) {
      return this.buildMemoizedDeferredSnapshot(null, capturedToken, ownerKey);
    }
    const startedAt = this.now();
    const publicationGuard = this.capturePublicationGuard(ownerKey);
    const snapshot = this.service.buildNodeReadinessSyncCurrent(ownerKey, {
      ...options,
      readinessPlanningOwnerBuild: true,
    });
    this.buildCount++;
    this.diagnosticRetention.record(ownerKey, capturedToken.tokenKey);
    const result = this.publishCompleted(
      ownerKey,
      snapshot,
      capturedToken,
      buildOptionsKey,
      true,
      options,
      publicationGuard,
      capturedPlanningIdentity,
      capturedSource,
    );
    const completed = this.readCompleted(ownerKey, buildOptionsKey);
    if (!completed || completed.snapshot !== snapshot) return result;
    const completedWithDuration = objectFreeze({
      ...completed,
      buildDurationMs: mathMax(0, this.now() - startedAt),
    });
    this.rememberCompleted(ownerKey, buildOptionsKey, completedWithDuration);
    return result;
  }

  getDiagnostics() {
    const queue = this.queue.getDiagnostics();
    const readLogicalQueueOwnerKey = (queueOwnerKey) =>
      mapGet(this.logicalOwnerKeyByQueueOwnerKey, queueOwnerKey) || queueOwnerKey;
    const completedTokenStatusByOwnerKey = objectCreate(null);
    const completedOwnerKeys = [];
    mapForEach(this.completedSnapshotsByOwnerKey, (completed, ownerKey) => {
      defineRecordValue(
        completedTokenStatusByOwnerKey,
        ownerKey,
        completed.tokenStatus,
      );
      appendArrayValue(completedOwnerKeys, ownerKey);
    });
    return objectFreeze({
      currentToken: this.captureToken(),
      ...this.semanticGenerationTracker.getDiagnostics(),
      completedOwnerKeys: objectFreeze(completedOwnerKeys),
      pendingOwnerKeys: objectFreeze(arrayMap(
        copyDenseOwnDataArray(queue.pendingKeys),
        readLogicalQueueOwnerKey,
      )),
      inFlightOwnerKeys: objectFreeze(arrayMap(
        copyDenseOwnDataArray(queue.inFlightKeys),
        readLogicalQueueOwnerKey,
      )),
      buildCount: this.buildCount,
      ...this.diagnosticRetention.snapshot(),
      snapshotListenerFailureCount: this.snapshotListenerFailureCount,
      completedTokenStatusByOwnerKey: objectFreeze(
        completedTokenStatusByOwnerKey,
      ),
      maxItemsPerDrain: queue.maxItemsPerDrain,
      retryingOwnerKeys: objectFreeze(
        arrayMap(
          copyDenseOwnDataArray(queue.retryingKeys),
          readLogicalQueueOwnerKey,
        ),
      ),
      exhaustedRetryOwnerKeys: objectFreeze(
        arrayMap(
          copyDenseOwnDataArray(queue.exhaustedRetryKeys),
          readLogicalQueueOwnerKey,
        ),
      ),
      retryableBuildFailureCount: queue.retryableDrainFailureCount,
      retryableBuildExhaustedCount: queue.retryableDrainExhaustedCount,
      dependencyRegistry: READINESS_PLANNING_DEPENDENCY_REGISTRY,
    });
  }

  shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    this.nodeLivenessUnsubscribe();
    this.capacityUnsubscribe();
    this.queue.shutdown();
    setClear(this.snapshotListeners);
    mapClear(this.completedSnapshotsByOwnerKey);
    mapClear(this.completedSnapshotsByOwnerAndBuildKey);
    mapClear(this.buildOptionsByOwnerAndBuildKey);
    mapClear(this.barrierBlockedOptionsByOwnerAndBuildKey);
    mapClear(this.logicalOwnerKeyByQueueOwnerKey);
    if (this.deferredSnapshotMemoByOwnerKey) {
      mapClear(this.deferredSnapshotMemoByOwnerKey);
    }
    setClear(this.prioritizedFormationOwnerKeys);
    this.diagnosticRetention.clear();
  }
}

installReadinessPlanningCompletionAdmissionMethods(ReadinessPlanningSnapshotOwner.prototype);

installReadinessPlanningSemanticCurrencyMethods(ReadinessPlanningSnapshotOwner.prototype);

export {
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  ReadinessPlanningSnapshotOwner,
};
