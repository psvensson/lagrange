/**
 * ReadinessPlanningSnapshotOwner semantic-currency methods: how source-owner
 * changes (cache table writes, node-liveness and capacity semantic
 * transitions, cache/membership/dependency owner replacement, readiness
 * feedback, recovery epochs) become planning impact, and how the owner reads
 * its per-node planning identity (current versus saturated) and the source
 * observation that the ordered classification barrier compares against.
 * Installed on the owner prototype; the owner keeps queue, admission, build,
 * completion, and lifecycle.
 */

import {
  READINESS_PLANNING_OWNER_DEPENDENCIES,
  READINESS_PLANNING_REASON,
  READINESS_PLANNING_TABLES,
  STORAGE_ACCOUNTING_OWNER_DEPENDENCY,
  nextSemanticGeneration,
} from './readiness-planning-version-contract.js';
import {
  readOwnerKey,
  readSharedNodeRows,
} from './readiness-planning-formation-source.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const objectFreeze = Object.freeze;

const readinessPlanningSemanticCurrencyMethods = {
  recordNodeLivenessChange(change) {
    if (this.stopped) return;
    this.applyPlanningImpact(
      this.semanticGenerationTracker.recordNodeLivenessChange(change),
    );
  },

  recordCapacityChange(change) {
    if (this.stopped) return;
    if (change?.previousProjection === null) return;
    const nodeId = typeof change?.nodeId === 'string' ? change.nodeId : null;
    this.applyPlanningImpact(
      nodeId ?
        this.semanticGenerationTracker.recordNodeChange(nodeId) :
        this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  refreshCapacitySemanticSubscription() {
    if (this.stopped) return;
    this.capacityUnsubscribe();
    this.capacitySemanticPlanningEnabled =
      typeof this.service?.storageAccountingService
        ?.subscribeCapacitySemanticChanges === 'function' &&
      typeof this.service?.storageAccountingService
        ?.getCapacitySemanticIdentity === 'function';
    this.capacityUnsubscribe = this.capacitySemanticPlanningEnabled ?
      this.service.storageAccountingService.subscribeCapacitySemanticChanges(
        (change) => this.recordCapacityChange(change),
      ) :
      () => {};
  },

  prepareCapacitySemanticOwnerReplacement() {
    this.capacityUnsubscribe();
    this.capacityUnsubscribe = () => {};
    this.capacitySemanticPlanningEnabled = false;
  },

  recordTableChange(
    tableName,
    operation,
    record = null,
    sourceRevision = null,
  ) {
    if (this.stopped) return;
    if (!arrayIncludes(READINESS_PLANNING_TABLES, tableName)) {
      return;
    }
    if (record === null && operation && typeof operation === 'object') {
      record = operation;
      operation = null;
    }
    this.tableRevisions[tableName] = nextSemanticGeneration(
      this,
      this.tableRevisions[tableName],
    );
    if (!this.semanticPlanningEnabled) {
      this.enqueueOwnerKeys(READINESS_PLANNING_REASON.SOURCE_CHANGED, record);
      return;
    }
    const observation = this.readCurrentSourceObservation();
    this.applyPlanningImpact(this.semanticGenerationTracker.recordTableChange(
      tableName,
      operation,
      record,
      sourceRevision,
      observation,
    ));
    if (this.sourceChangeTransactionDepth === 0 &&
        !this.hasUnclassifiedSourceChange(observation)) {
      this.wakeBarrierBlockedVariants();
    }
  },

  recordCacheReplacement() {
    if (this.stopped) return;
    this.cacheGeneration = nextSemanticGeneration(this, this.cacheGeneration);
    this.semanticGenerationTracker.resetSourceRevisionBaseline();
    this.semanticGenerationTracker.initializeSourceRevisionTracking(
      this.service?.systemTableCache,
    );
    this.applyPlanningImpact(
      this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  recordMembershipOwnerReplacement() {
    if (this.stopped) return;
    this.membershipOwnerGeneration = nextSemanticGeneration(
      this,
      this.membershipOwnerGeneration,
    );
    this.applyPlanningImpact(
      this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  recordOwnerDependencyReplacement(ownerName) {
    if (this.stopped) return;
    if (!arrayIncludes(READINESS_PLANNING_OWNER_DEPENDENCIES, ownerName)) {
      return;
    }
    this.ownerDependencyGenerations[ownerName] = nextSemanticGeneration(
      this,
      this.ownerDependencyGenerations[ownerName],
    );
    if (ownerName === STORAGE_ACCOUNTING_OWNER_DEPENDENCY) {
      this.refreshCapacitySemanticSubscription();
    }
    this.applyPlanningImpact(
      this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  recordReadinessSnapshotChange(_ownerKey = null) {
    if (this.stopped) return;
    const ownerKey = typeof _ownerKey === 'string' ? _ownerKey : null;
    const snapshot = ownerKey ?
      this.service?.lastReadinessSnapshotByNodeId?.get?.(ownerKey) : null;
    if (ownerKey && snapshot &&
        this.recordFeedbackSemanticChange(ownerKey, snapshot) === false) {
      return;
    }
    this.readinessSnapshotGeneration = nextSemanticGeneration(
      this,
      this.readinessSnapshotGeneration,
    );
    this.applyPlanningImpact(
      this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  readFeedbackSemanticSignature(ownerKey, snapshot) {
    try {
      if (typeof this.service
        ?.buildMembershipPlanningFeedbackSignature === 'function') {
        return this.service.buildMembershipPlanningFeedbackSignature(
          ownerKey,
          snapshot,
        );
      }
      return typeof this.service?.buildRecoveryEpochSignature === 'function' ?
        this.service.buildRecoveryEpochSignature(ownerKey, snapshot) : null;
    } catch {
      return null;
    }
  },

  recordFeedbackSemanticChange(ownerKey, snapshot) {
    const signature = this.readFeedbackSemanticSignature(ownerKey, snapshot);
    if (typeof signature !== 'string') return null;
    const previous = mapGet(this.feedbackSignatureByNodeId, ownerKey);
    if (previous === signature) return false;
    mapSet(this.feedbackSignatureByNodeId, ownerKey, signature);
    return true;
  },

  classifyPlanningBuildFeedback(
    ownerKey,
    buildOptionsKey,
    snapshot,
  ) {
    if (!this.semanticPlanningEnabled ||
        this.recordFeedbackSemanticChange(ownerKey, snapshot) !== true) {
      return false;
    }
    this.readinessSnapshotGeneration = nextSemanticGeneration(
      this,
      this.readinessSnapshotGeneration,
    );
    this.semanticGenerationTracker.recordGlobalChange();
    this.enqueueDependentRecordsExcept(
      ownerKey,
      buildOptionsKey,
      READINESS_PLANNING_REASON.SOURCE_CHANGED,
    );
    return true;
  },

  enqueueDependentRecordsExcept(
    producerOwnerKey,
    producerBuildOptionsKey,
    reason,
  ) {
    const token = this.captureToken();
    mapForEach(
      this.completedSnapshotsByOwnerAndBuildKey,
      (completedVariants, ownerKey) => {
        const optionsByBuildKey = mapGet(
          this.buildOptionsByOwnerAndBuildKey,
          ownerKey,
        );
        mapForEach(completedVariants, (_completed, buildOptionsKey) => {
          if (ownerKey === producerOwnerKey &&
              buildOptionsKey === producerBuildOptionsKey) return;
          const options = optionsByBuildKey ?
            mapGet(optionsByBuildKey, buildOptionsKey) || {} : {};
          this.enqueueBuild(ownerKey, reason, options, token);
        });
      },
    );
  },

  recordRecoveryEpochChange(ownerKey = null) {
    if (this.stopped) return;
    this.recoveryEpochRevision = nextSemanticGeneration(
      this,
      this.recoveryEpochRevision,
    );
    this.applyPlanningImpact(
      ownerKey ?
        this.semanticGenerationTracker.recordNodeChange(ownerKey) :
        this.semanticGenerationTracker.recordGlobalChange(),
    );
  },

  requestSourceRefresh(ownerKey) {
    if (this.stopped) return;
    this.enqueueBuild(ownerKey, READINESS_PLANNING_REASON.SOURCE_CHANGED, {});
  },

  buildSaturatedPlanningIdentity(ownerKey) {
    const identity = this.semanticGenerationTracker.captureIdentity(ownerKey);
    return objectFreeze({
      globalPlanningGeneration: identity.globalPlanningGeneration,
      nodePlanningGeneration: identity.nodePlanningGeneration,
      saturated: true,
    });
  },

  readPlanningIdentityNodeRows() {
    const unavailable = Boolean(
      this.service?.nodesOwner &&
      typeof this.service?.systemTableCache?.getTableMutationVersion !==
        'function',
    );
    return objectFreeze({
      rows: unavailable ? [] : readSharedNodeRows(this.service),
      unavailable,
    });
  },

  refreshLivenessSemanticIdentities(rows, ownerKey, observedAtMs) {
    if (typeof this.service?.getNodeLivenessSemanticIdentity !== 'function') {
      return false;
    }
    if (rows.length === 0 && this.service?.nodesOwner) return true;
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const nodeId = readOwnerKey(rows[index]);
        if (nodeId) {
          this.service.getNodeLivenessSemanticIdentity(nodeId, observedAtMs);
        }
      }
      if (rows.length === 0 && ownerKey) {
        this.service.getNodeLivenessSemanticIdentity(ownerKey, observedAtMs);
      }
      return false;
    } catch {
      return true;
    }
  },

  refreshCapacitySemanticIdentity(ownerKey, observedAtMs) {
    if (!this.capacitySemanticPlanningEnabled || !ownerKey) return false;
    try {
      this.service.storageAccountingService.getCapacitySemanticIdentity(
        ownerKey,
        observedAtMs,
      );
      return false;
    } catch {
      return true;
    }
  },

  isPlanningIdentitySourceCurrent(
    semanticInputUnavailable,
    baselineCurrent,
    observation,
  ) {
    if (semanticInputUnavailable) return false;
    if (this.semanticGenerationTracker.sourceRevisionTrackingActive &&
        !baselineCurrent) return false;
    return !this.hasUnclassifiedSourceChange(observation);
  },

  readPlanningProjectionIdentity(ownerKey, observedAtMs = this.now()) {
    if (this.stopped) return this.buildSaturatedPlanningIdentity(ownerKey);
    const nodeRows = this.readPlanningIdentityNodeRows();
    // Async owner-backed readiness reads obtain their node row after the memo
    // lookup. An unavailable synchronous row therefore saturates this pre-read
    // instead of crossing the injected owner boundary to a fallback cache.
    const livenessUnavailable = this.refreshLivenessSemanticIdentities(
      nodeRows.rows,
      ownerKey,
      observedAtMs,
    );
    const capacityUnavailable = this.refreshCapacitySemanticIdentity(
      ownerKey,
      observedAtMs,
    );
    const semanticInputUnavailable = nodeRows.unavailable ||
      livenessUnavailable || capacityUnavailable;
    const observation = this.readCurrentSourceObservation();
    const baselineCurrent = this.ensureSourceRevisionBaselineAndWake(observation);
    const identity = this.semanticGenerationTracker.captureIdentity(ownerKey);
    return this.isPlanningIdentitySourceCurrent(
      semanticInputUnavailable,
      baselineCurrent,
      observation,
    ) ? identity : this.buildSaturatedPlanningIdentity(ownerKey);
  },

  // (Re-)establish the source revision baseline for a read. When this read
  // completed a pending re-baseline after an INVALID revision, the barrier has
  // just reopened: wake the barrier-blocked builds exactly once (outside a
  // cache-change transaction, whose commit performs its own release).
  ensureSourceRevisionBaselineAndWake(observation) {
    const tracker = this.semanticGenerationTracker;
    const baselineCurrent = tracker.ensureSourceRevisionBaseline(
      observation,
      this.service?.systemTableCache,
    );
    if (tracker.consumeSourceRevisionRebaselineCompletion() &&
        this.sourceChangeTransactionDepth === 0) {
      this.wakeBarrierBlockedVariants();
    }
    return baselineCurrent;
  },

  readCurrentSourceObservation() {
    return this.semanticGenerationTracker.readSourceObservation(
      this.service?.systemTableCache,
    );
  },

  hasUnclassifiedSourceChange(
    observation = this.readCurrentSourceObservation(),
  ) {
    return this.semanticGenerationTracker.hasUnclassifiedSourceChange(
      observation,
    );
  },

  captureCurrentPlanningSource(ownerKey, observedAtMs = this.now()) {
    const observedIdentity = this.readPlanningProjectionIdentity(
      ownerKey,
      observedAtMs,
    );
    const observation = this.readCurrentSourceObservation();
    this.ensureSourceRevisionBaselineAndWake(observation);
    const token = this.captureToken();
    const currentIdentity =
      this.semanticGenerationTracker.captureIdentity(ownerKey);
    const identity = observedIdentity.saturated === true ||
      this.hasUnclassifiedSourceChange(observation) ? objectFreeze({
        globalPlanningGeneration:
          currentIdentity.globalPlanningGeneration,
        nodePlanningGeneration: currentIdentity.nodePlanningGeneration,
        saturated: true,
      }) : currentIdentity;
    return objectFreeze({
      identity,
      observation,
      sequence: this.semanticGenerationTracker.semanticChangeSequence,
      token,
    });
  },
};

function installReadinessPlanningSemanticCurrencyMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(readinessPlanningSemanticCurrencyMethods).map(([name, value]) => [
        name,
        {configurable: true, value, writable: true},
      ]),
    ),
  );
}

export {installReadinessPlanningSemanticCurrencyMethods};
