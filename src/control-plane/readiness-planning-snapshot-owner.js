import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  READINESS_PLANNING_OWNER_DEPENDENCIES,
  READINESS_PLANNING_REASON,
  READINESS_PLANNING_TABLES,
  TOKEN_STATUS,
  appendArrayValue,
  buildQueueOwnerKey,
  canRebaseStoredSnapshot,
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
  buildDeferredSnapshot,
  capturePositiveDecisionLiveVeto,
  capturePositiveDecisionPublicationGuard,
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
}

class ReadinessPlanningSnapshotOwner {
  constructor(options = {}) {
    this.service = options.service;
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.tableRevisions = objectCreate(null);
    for (let index = 0; index < READINESS_PLANNING_TABLES.length; index++) {
      defineRecordValue(
        this.tableRevisions,
        READINESS_PLANNING_TABLES[index],
        0,
      );
    }
    this.cacheGeneration = 1;
    this.membershipOwnerGeneration = 1;
    this.ownerDependencyGenerations = objectCreate(null);
    for (let index = 0;
      index < READINESS_PLANNING_OWNER_DEPENDENCIES.length;
      index++) {
      defineRecordValue(
        this.ownerDependencyGenerations,
        READINESS_PLANNING_OWNER_DEPENDENCIES[index],
        1,
      );
    }
    this.readinessSnapshotGeneration = 0;
    this.recoveryEpochRevision = 0;
    this.transportTopologyGeneration = 0;
    this.generationSaturated = false;
    this.transportTopologyFingerprint = readConnectedNodeFingerprint(
      this.service?.messageRouter,
    );
    this.completedSnapshotsByOwnerKey = new MapConstructor();
    initializeBuildVariantState(this);
    this.logicalOwnerKeyByQueueOwnerKey = new MapConstructor();
    this.initialBootstrapConsumed = false;
    this.buildCount = 0;
    this.diagnosticRetention = new ReadinessPlanningDiagnosticRetention();
    this.snapshotListeners = new SetConstructor();
    this.snapshotListenerFailureCount = 0;
    // Lazily baselined on the first enqueue: an eager read here performs a
    // full-table cache scan at service construction, which the async
    // owner-path contract forbids before any planning consumer exists.
    this.formationEpochKey = null;
    this.prioritizedFormationOwnerKeys = new SetConstructor();
    this.queue = new OwnerKeyReconcileQueue({
      name: READINESS_PLANNING_QUEUE_NAME,
      maxConcurrency: 1,
      maxItemsPerDrain: 1,
      scheduleDrainFn:
        typeof options.scheduleDrainFn === 'function' ?
          options.scheduleDrainFn :
          defaultMacrotaskScheduler,
      now: this.now,
      setTimeoutFn: this.service?.setTimeoutFn,
      clearTimeoutFn: this.service?.clearTimeoutFn,
      reconcileFn: (_queueOwnerKey, _reasons, context) =>
        this.reconcile(context?.ownerKey, context),
      retryPolicy: {
        isRetryableError: isReadinessBuildFailureRetryable,
        getRetryAfterMs: getReadinessBuildRetryAfterMs,
        getFailureReason: getReadinessBuildFailureReason,
        shouldResetAttempts: shouldResetReadinessBuildAttempts,
        maxAttempts: READINESS_PLANNING_MAX_RETRY_ATTEMPTS,
      },
    });
  }

  captureToken() {
    const fingerprint = readConnectedNodeFingerprint(
      this.service?.messageRouter,
    );
    if (fingerprint !== this.transportTopologyFingerprint) {
      this.transportTopologyFingerprint = fingerprint;
      this.transportTopologyGeneration = nextSemanticGeneration(
        this,
        this.transportTopologyGeneration,
      );
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
    this.queue.enqueue(queueOwnerKey, reason, {ownerKey, options, token});
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

  enqueueOwnerKeys(reason, record = null) {
    const token = this.captureToken();
    // One shared frozen node-row read serves the owner list and both
    // formation keys below; per-callee re-reads amplified full-table reads
    // several times per enqueue on the live seed.
    const sharedNodeRows = readSharedNodeRows(this.service);
    const ownerKeys = this.listOwnerKeys(record, sharedNodeRows);
    for (let index = 0; index < ownerKeys.length; index++) {
      const ownerKey = ownerKeys[index];
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
      for (let variantIndex = 0;
        variantIndex < variants.length;
        variantIndex++) {
        this.enqueueBuild(ownerKey, reason, variants[variantIndex], token);
      }
    }
    const formationOwnerKey =
      readFormationBootstrapOwnerKey(this.service, sharedNodeRows);
    const formationEpochKey =
      readFormationEpochKey(this.service, sharedNodeRows);
    if (formationEpochKey !== this.formationEpochKey) {
      this.formationEpochKey = formationEpochKey;
      setClear(this.prioritizedFormationOwnerKeys);
    }
    if (
      formationOwnerKey &&
      !setHas(this.prioritizedFormationOwnerKeys, formationOwnerKey)
    ) {
      const buildOptionsKey = this.captureBuildOptionsKey(
        formationOwnerKey,
        {},
      );
      this.queue.promotePending(
        buildQueueOwnerKey(formationOwnerKey, buildOptionsKey),
      );
      setAdd(this.prioritizedFormationOwnerKeys, formationOwnerKey);
    }
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

  recordTableChange(tableName, record = null) {
    if (!arrayIncludes(READINESS_PLANNING_TABLES, tableName)) {
      return;
    }
    this.tableRevisions[tableName] = nextSemanticGeneration(
      this,
      this.tableRevisions[tableName],
    );
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED, record);
  }

  recordCacheReplacement() {
    this.cacheGeneration = nextSemanticGeneration(this, this.cacheGeneration);
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
  }

  recordMembershipOwnerReplacement() {
    this.membershipOwnerGeneration = nextSemanticGeneration(
      this,
      this.membershipOwnerGeneration,
    );
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
  }

  recordOwnerDependencyReplacement(ownerName) {
    if (!arrayIncludes(READINESS_PLANNING_OWNER_DEPENDENCIES, ownerName)) {
      return;
    }
    this.ownerDependencyGenerations[ownerName] = nextSemanticGeneration(
      this,
      this.ownerDependencyGenerations[ownerName],
    );
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
  }

  recordReadinessSnapshotChange(ownerKey = null) {
    this.readinessSnapshotGeneration = nextSemanticGeneration(
      this,
      this.readinessSnapshotGeneration,
    );
    if (ownerKey) {
      this.requestSourceRefresh(ownerKey);
      return;
    }
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
  }

  recordRecoveryEpochChange(ownerKey = null) {
    this.recoveryEpochRevision = nextSemanticGeneration(
      this,
      this.recoveryEpochRevision,
    );
    if (ownerKey) {
      this.requestSourceRefresh(ownerKey);
      return;
    }
    this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED);
  }

  requestSourceRefresh(ownerKey) {
    this.enqueueBuild(ownerKey, READINESS_PLANNING_REASON.SOURCE_CHANGED, {});
  }

  isCompletedSnapshotLive(ownerKey, completed) {
    const snapshot = completed?.snapshot;
    if (!snapshot) {
      return false;
    }
    return completed.positiveDecisionLiveVeto ===
      this.capturePositiveDecisionLiveVeto(
        ownerKey,
        snapshot,
        completed.completedAtMs,
      );
  }

  capturePositiveDecisionLiveVeto(ownerKey, snapshot, capturedAtMs) {
    return capturePositiveDecisionLiveVeto(
      this.service,
      ownerKey,
      snapshot,
      capturedAtMs,
      this.now(),
    );
  }

  capturePublicationGuard(ownerKey) {
    return capturePositiveDecisionPublicationGuard(this.service, ownerKey);
  }

  canConsumeInitialBootstrap(ownerKey) {
    // Short-circuit before the node-table scan: once the initial bootstrap
    // is consumed the answer is unconditionally false, and this sits on the
    // readSync miss path where the scan ran on every read.
    if (this.initialBootstrapConsumed) {
      return false;
    }
    const formationOwnerKey = readFormationBootstrapOwnerKey(this.service);
    return !formationOwnerKey || formationOwnerKey === ownerKey;
  }

  // The floored planning generation from the service (null when the service
  // or its cache cannot version tables — sealed stubs keep exact token
  // semantics). Every source-table write reaches this key within one 250ms
  // latch window, the same bound every planning-layer memo below already
  // accepts; token-only inputs (transport fingerprint, owner-dependency
  // generations) stay exact via the token comparison and the per-read
  // live-veto check.
  readCompletedSourceGeneration() {
    return typeof this.service?.readPlanningProjectionSourceGeneration ===
      'function' ?
      this.service.readPlanningProjectionSourceGeneration(this.now()) :
      null;
  }

  matchesCompletedSourceGeneration(completed) {
    return completed.sourceGeneration !== null &&
      completed.sourceGeneration !== undefined &&
      completed.sourceGeneration === this.readCompletedSourceGeneration();
  }

  isNodeRowStillPresent(ownerKey) {
    if (typeof this.service?.getNodeRow !== 'function') {
      return true;
    }
    const nodeRow = this.service.getNodeRow(ownerKey);
    return nodeRow !== null && nodeRow !== undefined;
  }

  canReuseCompletedSnapshot(ownerKey, completed, token, buildOptionsKey) {
    return !token.generationSaturated &&
      completed.tokenStatus === TOKEN_STATUS.CURRENT &&
      completed.buildOptionsKey === buildOptionsKey &&
      (this.tokensEqual(completed.capturedToken, token) ||
        // Floored reuse: under formation-rate churn the exact token rotates
        // between consecutive reads (live: every readiness evaluation
        // rebuilt its snapshot plus a full projection-evidence
        // normalization — the 31.4% inclusive residual in the archived
        // profiled run 20-55-51-160Z). One completed snapshot per floored
        // generation caps that at one rebuild per window.
        this.matchesCompletedSourceGeneration(completed)) &&
      this.isCompletedSnapshotLive(ownerKey, completed);
  }

  // Live profiling of the archived run
  // run-2026-08-15T16-36-59-912Z-profiled-manual measured every deferred
  // read minting a fresh frozen evidence graph, so the identity-keyed
  // retention in projection-readiness-evidence could never hit for
  // evidence-absent joiners (9x per-build cost against a same-identity
  // read). The deferred snapshot is a pure derivation of (source snapshot,
  // token generation, ownerKey); any source change rotates the token key
  // and rebuilds.
  buildMemoizedDeferredSnapshot(snapshot, token, ownerKey) {
    if (!this.deferredSnapshotMemoByOwnerKey) {
      this.deferredSnapshotMemoByOwnerKey = new Map();
    }
    const entry = this.deferredSnapshotMemoByOwnerKey.get(ownerKey);
    if (entry && entry.sourceSnapshot === snapshot &&
      entry.tokenKey === token?.tokenKey) {
      return entry.deferred;
    }
    const deferred = buildDeferredSnapshot(snapshot, token, ownerKey);
    this.deferredSnapshotMemoByOwnerKey.set(ownerKey, {
      sourceSnapshot: snapshot,
      tokenKey: token?.tokenKey,
      deferred,
    });
    return deferred;
  }

  readSync(ownerKey, options, buildSnapshot) {
    const currentToken = this.captureToken();
    const buildOptionsKey = this.captureBuildOptionsKey(ownerKey, options);
    this.rememberBuildOptions(ownerKey, buildOptionsKey, options);
    const completed = this.readCompleted(ownerKey, buildOptionsKey);
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
    // A node-table-only token advance may rebase stored evidence forward,
    // but only while the node row still exists: a DELETE is a real removal,
    // not lag, and rebasing the old positive snapshot current would let a
    // deleted node keep serving. A removed node falls through to the
    // fail-closed LIVE_VETO replan.
    if (
      this.isNodeRowStillPresent(ownerKey) &&
      canRebaseStoredSnapshot(completed.capturedToken, currentToken) &&
      completed.buildOptionsKey === buildOptionsKey &&
      typeof this.service?.getReusableNodeReadinessSnapshotSync === 'function'
    ) {
      const publicationGuard = this.capturePublicationGuard(ownerKey);
      const reusable = this.service.getReusableNodeReadinessSnapshotSync(
        ownerKey,
      );
      if (reusable) {
        return this.publishCompleted(
          ownerKey,
          reusable,
          currentToken,
          buildOptionsKey,
          false,
          options,
          publicationGuard,
        );
      }
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

  publishCompleted(
    ownerKey,
    snapshot,
    capturedToken,
    buildOptionsKey,
    notifyListeners = false,
    buildOptions = {},
    buildStartedPublicationGuard = null,
  ) {
    const currentToken = this.captureToken();
    const tokenCurrent = !currentToken.generationSaturated &&
      this.tokensEqual(capturedToken, currentToken);
    const currentPublicationGuard = this.capturePublicationGuard(ownerKey);
    const publicationGuardCurrent = buildStartedPublicationGuard === null ||
      buildStartedPublicationGuard === currentPublicationGuard;
    const current = tokenCurrent && publicationGuardCurrent;
    const completedAtMs = this.now();
    const completed = Object.freeze({
      snapshot,
      capturedToken,
      buildOptionsKey,
      sourceGeneration: this.readCompletedSourceGeneration(),
      tokenStatus: current ? TOKEN_STATUS.CURRENT : TOKEN_STATUS.STALE,
      completedAtMs,
      positiveDecisionLiveVeto: this.capturePositiveDecisionLiveVeto(
        ownerKey,
        snapshot,
        completedAtMs,
      ),
    });
    this.rememberCompleted(ownerKey, buildOptionsKey, completed);
    if (!current) {
      this.enqueueBuild(
        ownerKey,
        tokenCurrent ?
          READINESS_PLANNING_REASON.LIVE_VETO :
          READINESS_PLANNING_REASON.TOKEN_ADVANCED_DURING_BUILD,
        buildOptions,
        currentToken,
      );
      return this.buildMemoizedDeferredSnapshot(snapshot, currentToken, ownerKey);
    }
    if (notifyListeners) {
      this.notifySnapshotPublished(ownerKey, snapshot, capturedToken);
    }
    return snapshot;
  }

  reconcile(ownerKey, context = {}) {
    const capturedToken = this.captureToken();
    const buildOptionsKey = this.captureBuildOptionsKey(
      ownerKey,
      context?.options,
    );
    const startedAt = this.now();
    const publicationGuard = this.capturePublicationGuard(ownerKey);
    const snapshot = this.service.buildNodeReadinessSyncCurrent(ownerKey, {
      ...(context?.options || {}),
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
      context?.options,
      publicationGuard,
    );
    const completed = this.readCompleted(ownerKey, buildOptionsKey);
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
    this.queue.shutdown();
    setClear(this.snapshotListeners);
    mapClear(this.completedSnapshotsByOwnerKey);
    mapClear(this.completedSnapshotsByOwnerAndBuildKey);
    mapClear(this.buildOptionsByOwnerAndBuildKey);
    mapClear(this.logicalOwnerKeyByQueueOwnerKey);
    if (this.deferredSnapshotMemoByOwnerKey) {
      mapClear(this.deferredSnapshotMemoByOwnerKey);
    }
    setClear(this.prioritizedFormationOwnerKeys);
    this.diagnosticRetention.clear();
  }
}

export {
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  ReadinessPlanningSnapshotOwner,
};
