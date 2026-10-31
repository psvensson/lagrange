import {
  ROLLUP_DEFAULT_CONFIG,
  ROLLUP_DEFAULT_WEIGHTS,
  ROLLUP_ERROR_MSG,
} from './partition-feature-rollup-constants.js';

function requireRollupStore(store) {
  if (!store || typeof store.applyCommittedEvent !== 'function') {
    throw new Error(ROLLUP_ERROR_MSG.STORE_REQUIRED);
  }
  return store;
}

function validateNextRuleEpoch(ruleEpoch, activeRuleEpoch) {
  if (!Number.isInteger(ruleEpoch) || ruleEpoch < activeRuleEpoch) {
    throw new Error(ROLLUP_ERROR_MSG.INVALID_RULE_EPOCH);
  }
  return ruleEpoch;
}

function resolveNumber(value, fallback) {
  return typeof value === 'number' ? value : fallback;
}

export class EpochLazyFeatureBackfillCoordinator {
  constructor(options = {}) {
    this.rollupStore = requireRollupStore(options?.rollupStore);
    this.getEntityEvents =
      typeof options.getEntityEvents === 'function' ?
        options.getEntityEvents :
        () => [];
    this.activeRuleEpoch = resolveNumber(
      options.initialRuleEpoch,
      ROLLUP_DEFAULT_CONFIG.INITIAL_RULE_EPOCH,
    );
    this.windowMs = resolveNumber(
      options.windowMs,
      ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS,
    );
    this.weights = options.weights || ROLLUP_DEFAULT_WEIGHTS;
    this.customAttributeWeight = resolveNumber(
      options.customAttributeWeight,
      ROLLUP_DEFAULT_WEIGHTS.CUSTOM_ATTRIBUTE_WEIGHT,
    );
    this.threshold = resolveNumber(
      options.threshold,
      ROLLUP_DEFAULT_CONFIG.RISK_DECISION_THRESHOLD,
    );
    this.customAttributeExtractor =
      typeof options.customAttributeExtractor === 'function' ?
        options.customAttributeExtractor :
        undefined;
    this.requiresRawReplay = Boolean(options.requiresRawReplay);
    this.pendingEntityIds = [];
    this.lazyCutoverCount = 0;
    this.backgroundUpgradedCount = 0;
    this.skippedAlreadyUpgradedCount = 0;
  }

  ingestCommittedEvent(event) {
    return this.rollupStore.applyCommittedEvent(event, {
      ruleEpoch: this.activeRuleEpoch,
      customAttributeExtractor: this.customAttributeExtractor,
    });
  }

  deployRuleChange(options = {}) {
    const nextEpoch = validateNextRuleEpoch(
      options?.ruleEpoch,
      this.activeRuleEpoch,
    );
    this.activeRuleEpoch = nextEpoch;
    this.windowMs = resolveNumber(options.windowMs, this.windowMs);
    this.weights = options.weights || this.weights;
    this.customAttributeWeight = resolveNumber(
      options.customAttributeWeight,
      this.customAttributeWeight,
    );
    this.threshold = resolveNumber(options.threshold, this.threshold);
    if (typeof options.customAttributeExtractor === 'function') {
      this.customAttributeExtractor = options.customAttributeExtractor;
    }
    this.requiresRawReplay = Boolean(options.requiresRawReplay);
    if (this.requiresRawReplay) {
      this.pendingEntityIds = this.rollupStore.listEntityIds();
    } else {
      this.rollupStore.stampAllEntitiesEpoch(this.activeRuleEpoch);
      this.pendingEntityIds = [];
    }
    return {
      ruleEpoch: this.activeRuleEpoch,
      requiresRawReplay: this.requiresRawReplay,
      decisionDowntimeMs: 0,
      backfillPendingCount: this.pendingEntityIds.length,
      wanBytesTransferred: 0,
    };
  }

  _rebuildEntityForActiveEpoch(entityId) {
    const events = this.getEntityEvents(entityId) || [];
    return this.rollupStore.rebuildEntityCustomAttributeFromLog(
      entityId,
      events,
      this.customAttributeExtractor,
      this.activeRuleEpoch,
    );
  }

  evaluateDecision({entityId, nowMs} = {}) {
    const currentEpoch = this.rollupStore.getEntityFeatureEpoch(entityId);
    const needsLazyUpgrade =
      this.requiresRawReplay && currentEpoch < this.activeRuleEpoch;
    if (needsLazyUpgrade) {
      this._rebuildEntityForActiveEpoch(entityId);
      this.lazyCutoverCount += 1;
    }
    const rollup = this.rollupStore.evaluateWindowRollup({
      entityId,
      nowMs,
      windowMs: this.windowMs,
      weights: this.weights,
      customAttributeWeight: this.customAttributeWeight,
      threshold: this.threshold,
    });
    return {
      ...rollup,
      ruleEpoch: this.activeRuleEpoch,
      lazyCutoverApplied: needsLazyUpgrade,
      staleRead: false,
      decisionDowntimeMs: 0,
    };
  }

  stepBackgroundBackfill(options = {}) {
    const batchSize = resolveNumber(
      options?.batchSize,
      ROLLUP_DEFAULT_CONFIG.DEFAULT_BATCH_SIZE,
    );
    let upgradedInBatch = 0;
    let skippedAlreadyUpgraded = 0;
    let processed = 0;
    while (this.pendingEntityIds.length > 0 && processed < batchSize) {
      const entityId = this.pendingEntityIds.shift();
      processed += 1;
      const entityEpoch = this.rollupStore.getEntityFeatureEpoch(entityId);
      if (entityEpoch >= this.activeRuleEpoch) {
        skippedAlreadyUpgraded += 1;
        this.skippedAlreadyUpgradedCount += 1;
      } else {
        this._rebuildEntityForActiveEpoch(entityId);
        upgradedInBatch += 1;
        this.backgroundUpgradedCount += 1;
      }
    }
    return {
      upgradedInBatch,
      skippedAlreadyUpgraded,
      remainingPendingCount: this.pendingEntityIds.length,
      wanBytesTransferred: 0,
    };
  }
}
