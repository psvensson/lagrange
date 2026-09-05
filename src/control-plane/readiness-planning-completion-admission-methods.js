/**
 * ReadinessPlanningSnapshotOwner completed-record admission and completion
 * publication: the barrier-blocked build registry, the live veto and
 * publication guard, completed-snapshot reuse admission (planning identity
 * plus live veto; legacy token/floored fallback), memoized deferred
 * snapshots, and the completion currency check that publishes a build only
 * when its captured source is still current. Installed on the owner
 * prototype; the owner keeps queue, read, reconcile, and lifecycle.
 */

import {
  READINESS_PLANNING_OWNER_DEPENDENCIES,
  READINESS_PLANNING_REASON,
  READINESS_PLANNING_TABLES,
  TOKEN_STATUS,
  buildQueueOwnerKey,
} from './readiness-planning-version-contract.js';
import {
  planningIdentitiesEqual,
} from './readiness-planning-semantic-generation.js';
import {
  buildDeferredSnapshot,
  capturePositiveDecisionLiveVeto,
  capturePositiveDecisionPublicationGuard,
} from './readiness-planning-publication-contract.js';
import {
  readFormationBootstrapOwnerKey,
} from './readiness-planning-formation-source.js';

const MapConstructor = Map;
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const objectFreeze = Object.freeze;

function namedGenerationsEqual(names, previous, current) {
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (previous?.[name] !== current?.[name]) return false;
  }
  return true;
}

function stableFeedbackTokenFieldsEqual(previous, current) {
  return previous.cacheGeneration === current.cacheGeneration &&
    previous.membershipOwnerGeneration === current.membershipOwnerGeneration &&
    previous.recoveryEpochRevision === current.recoveryEpochRevision &&
    previous.transportTopologyGeneration ===
      current.transportTopologyGeneration &&
    previous.transportTopologyValid === current.transportTopologyValid &&
    current.readinessSnapshotGeneration ===
      previous.readinessSnapshotGeneration + 1;
}

function isOwnedFeedbackTokenAdvance(previous, current) {
  if (!previous || !current || previous.generationSaturated ||
      current.generationSaturated) return false;
  const ownerDependenciesEqual = namedGenerationsEqual(
    READINESS_PLANNING_OWNER_DEPENDENCIES,
    previous.ownerDependencyGenerations,
    current.ownerDependencyGenerations,
  );
  const tableRevisionsEqual = namedGenerationsEqual(
    READINESS_PLANNING_TABLES,
    previous.tableRevisions,
    current.tableRevisions,
  );
  return stableFeedbackTokenFieldsEqual(previous, current) &&
    ownerDependenciesEqual && tableRevisionsEqual;
}

const readinessPlanningCompletionAdmissionMethods = {
  rememberBarrierBlockedBuild(ownerKey, buildOptionsKey, options) {
    let variants = mapGet(
      this.barrierBlockedOptionsByOwnerAndBuildKey,
      ownerKey,
    );
    if (!variants) {
      variants = new MapConstructor();
      mapSet(this.barrierBlockedOptionsByOwnerAndBuildKey, ownerKey, variants);
    }
    mapSet(variants, buildOptionsKey, options);
  },

  // Wake every barrier-blocked variant exactly once when the barrier
  // reopens. A variant whose build is already in flight is not re-enqueued:
  // its completion currency check publishes the build if its captured source
  // is still current and requeues it if not, so re-enqueueing here only
  // produced a second identical build (one redundant build per INVALID
  // revision when the re-baseline happened inside the drain's own capture).
  wakeBarrierBlockedVariants(excludedQueueOwnerKey = null) {
    if (this.hasUnclassifiedSourceChange()) return;
    const blocked = this.barrierBlockedOptionsByOwnerAndBuildKey;
    this.barrierBlockedOptionsByOwnerAndBuildKey = new MapConstructor();
    mapForEach(blocked, (variants, ownerKey) => {
      mapForEach(variants, (options, buildOptionsKey) => {
        const queueOwnerKey = buildQueueOwnerKey(ownerKey, buildOptionsKey);
        if (queueOwnerKey === excludedQueueOwnerKey ||
            this.queue.isInFlight(queueOwnerKey)) return;
        this.enqueueBuild(
          ownerKey,
          READINESS_PLANNING_REASON.SOURCE_CHANGED,
          options,
        );
      });
    });
  },

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
  },

  capturePositiveDecisionLiveVeto(ownerKey, snapshot, capturedAtMs) {
    return capturePositiveDecisionLiveVeto(
      this.service,
      ownerKey,
      snapshot,
      capturedAtMs,
      this.now(),
    );
  },

  capturePublicationGuard(ownerKey) {
    return capturePositiveDecisionPublicationGuard(this.service, ownerKey);
  },

  canConsumeInitialBootstrap(ownerKey) {
    // Short-circuit before the node-table scan: once the initial bootstrap
    // is consumed the answer is unconditionally false, and this sits on the
    // readSync miss path where the scan ran on every read.
    if (this.initialBootstrapConsumed) {
      return false;
    }
    const formationOwnerKey = readFormationBootstrapOwnerKey(this.service);
    return !formationOwnerKey || formationOwnerKey === ownerKey;
  },

  // Retained only for unversioned legacy compositions. Semantic planning
  // admission uses the node-typed PlanningIdentity instead.
  readCompletedSourceGeneration() {
    return typeof this.service?.readPlanningProjectionSourceGeneration ===
      'function' ?
      this.service.readPlanningProjectionSourceGeneration(this.now()) :
      null;
  },

  matchesCompletedSourceGeneration(completed) {
    return completed.sourceGeneration !== null &&
      completed.sourceGeneration !== undefined &&
      completed.sourceGeneration === this.readCompletedSourceGeneration();
  },

  isNodeRowStillPresent(ownerKey) {
    if (typeof this.service?.getNodeRow !== 'function') {
      return true;
    }
    const nodeRow = this.service.getNodeRow(ownerKey);
    return nodeRow !== null && nodeRow !== undefined;
  },

  // Semantic compositions require equal typed planning identity plus the live
  // veto. The exact token remains diagnostic/stronger evidence. Unversioned
  // legacy compositions retain their prior exact-or-floored fallback.
  canReuseCompletedSnapshot(ownerKey, completed, token, buildOptionsKey) {
    const currentPlanningIdentity =
      this.readPlanningProjectionIdentity(ownerKey);
    const freshnessCurrent = this.semanticPlanningEnabled ?
      planningIdentitiesEqual(
        completed.planningIdentity,
        currentPlanningIdentity,
      ) :
      ((completed.tokenStatus === TOKEN_STATUS.CURRENT &&
        this.tokensEqual(completed.capturedToken, token)) ||
        this.matchesCompletedSourceGeneration(completed));
    return !token.generationSaturated &&
      token.transportTopologyValid !== false &&
      !currentPlanningIdentity.saturated &&
      completed.buildOptionsKey === buildOptionsKey &&
      freshnessCurrent &&
      this.isCompletedSnapshotLive(ownerKey, completed);
  },

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
  },

  isCompletionTokenCurrent(startToken, currentToken, feedbackChanged) {
    if (currentToken.generationSaturated) return false;
    return feedbackChanged ?
      isOwnedFeedbackTokenAdvance(startToken, currentToken) :
      this.tokensEqual(startToken, currentToken);
  },

  isCompletionPlanningIdentityCurrent(
    startSource,
    currentSource,
    feedbackChanged,
  ) {
    if (feedbackChanged) {
      return currentSource.sequence === startSource.sequence + 1;
    }
    return planningIdentitiesEqual(
      startSource.identity,
      currentSource.identity,
    ) && currentSource.sequence === startSource.sequence;
  },

  captureCompletionCurrency(
    ownerKey,
    snapshot,
    buildOptionsKey,
    startSource,
    buildStartedPublicationGuard,
  ) {
    const feedbackChanged = this.classifyPlanningBuildFeedback(
      ownerKey,
      buildOptionsKey,
      snapshot,
    );
    const currentSource = this.captureCurrentPlanningSource(ownerKey);
    const currentToken = currentSource.token;
    const tokenCurrent = this.isCompletionTokenCurrent(
      startSource.token,
      currentToken,
      feedbackChanged,
    );
    const publicationGuardCurrent = buildStartedPublicationGuard === null ||
      buildStartedPublicationGuard === this.capturePublicationGuard(ownerKey);
    const planningIdentityCurrent =
      this.isCompletionPlanningIdentityCurrent(
        startSource,
        currentSource,
        feedbackChanged,
      );
    const sourceClassified = !this.hasUnclassifiedSourceChange(
      currentSource.observation,
    );
    return objectFreeze({
      current: tokenCurrent && currentToken.transportTopologyValid !== false &&
        publicationGuardCurrent && planningIdentityCurrent && sourceClassified,
      currentSource,
      currentToken,
      tokenCurrent,
    });
  },

  buildCompletedRecord(
    ownerKey,
    snapshot,
    capturedToken,
    capturedPlanningIdentity,
    buildOptionsKey,
    currency,
  ) {
    const completedAtMs = this.now();
    const completionToken = this.semanticPlanningEnabled ?
      currency.currentToken : capturedToken;
    const completionPlanningIdentity = this.semanticPlanningEnabled ?
      currency.currentSource.identity : capturedPlanningIdentity;
    return objectFreeze({
      snapshot,
      capturedToken: completionToken,
      buildOptionsKey,
      planningIdentity: completionPlanningIdentity,
      sourceGeneration: this.readCompletedSourceGeneration(),
      tokenStatus: currency.current ? TOKEN_STATUS.CURRENT : TOKEN_STATUS.STALE,
      completedAtMs,
      positiveDecisionLiveVeto: this.capturePositiveDecisionLiveVeto(
        ownerKey,
        snapshot,
        completedAtMs,
      ),
    });
  },

  handleStaleCompletion(
    ownerKey,
    snapshot,
    completed,
    buildOptions,
    buildOptionsKey,
    currency,
  ) {
    this.enqueueBuild(
      ownerKey,
      currency.tokenCurrent ?
        READINESS_PLANNING_REASON.LIVE_VETO :
        READINESS_PLANNING_REASON.TOKEN_ADVANCED_DURING_BUILD,
      buildOptions,
      currency.currentToken,
    );
    const legacyReusable = !this.semanticPlanningEnabled &&
      this.canReuseCompletedSnapshot(
        ownerKey,
        completed,
        currency.currentToken,
        buildOptionsKey,
      );
    return legacyReusable ? snapshot : this.buildMemoizedDeferredSnapshot(
      snapshot,
      currency.currentToken,
      ownerKey,
    );
  },

  publishCompleted(
    ownerKey,
    snapshot,
    capturedToken,
    buildOptionsKey,
    notifyListeners = false,
    buildOptions = {},
    buildStartedPublicationGuard = null,
    capturedPlanningIdentity = this.readPlanningProjectionIdentity(ownerKey),
    capturedSource = null,
  ) {
    const startSource = capturedSource || objectFreeze({
      identity: capturedPlanningIdentity,
      sequence: this.semanticGenerationTracker.semanticChangeSequence,
      token: capturedToken,
    });
    const currency = this.captureCompletionCurrency(
      ownerKey,
      snapshot,
      buildOptionsKey,
      startSource,
      buildStartedPublicationGuard,
    );
    const completed = this.buildCompletedRecord(
      ownerKey,
      snapshot,
      capturedToken,
      capturedPlanningIdentity,
      buildOptionsKey,
      currency,
    );
    if (currency.current || !this.semanticPlanningEnabled) {
      this.rememberCompleted(ownerKey, buildOptionsKey, completed);
    }
    if (!currency.current) {
      // The pre-change result is never stored by semantic compositions; a
      // replacement build is queued through the existing macrotask owner.
      return this.handleStaleCompletion(
        ownerKey,
        snapshot,
        completed,
        buildOptions,
        buildOptionsKey,
        currency,
      );
    }
    if (notifyListeners) {
      this.notifySnapshotPublished(
        ownerKey,
        snapshot,
        completed.capturedToken,
      );
    }
    return snapshot;
  },
};

function installReadinessPlanningCompletionAdmissionMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(readinessPlanningCompletionAdmissionMethods).map(([name, value]) => [
        name,
        {configurable: true, value, writable: true},
      ]),
    ),
  );
}

export {installReadinessPlanningCompletionAdmissionMethods};
