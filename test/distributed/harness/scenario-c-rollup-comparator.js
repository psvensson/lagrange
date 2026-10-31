import {
  ROLLUP_DECISION_OUTCOME,
  ROLLUP_DEFAULT_CONFIG,
  ROLLUP_DEFAULT_WEIGHTS,
  ROLLUP_RESOLUTION_MS,
} from '../../../src/workflow/partition-feature-rollup-constants.js';
import {
  PartitionFeatureRollupStore,
  computeSketchPopcount,
  hashIdentifierToBitMask,
} from '../../../src/workflow/partition-feature-rollup-store.js';
import {
  EpochLazyFeatureBackfillCoordinator,
} from '../../../src/workflow/epoch-lazy-feature-backfill.js';

const DEFAULT_ENTITY_COUNT = 8;
const DEFAULT_HOT_ENTITY_COUNT = 2;
const DEFAULT_MINUTES = 30;
const DEFAULT_EVENTS_PER_MINUTE = 4;
const BASE_TIMESTAMP_MS = 1700000000000;
const EVENT_OFFSET_STEP_MS = 10000;
const BASE_AMOUNT_CENTS = 1200;
const AMOUNT_STEP_CENTS = 350;
const EPOCH_TWO = 2;
const EPOCH_THREE = 3;
const EPOCH_TWO_COUNT_WEIGHT = 18;
const EPOCH_THREE_CUSTOM_WEIGHT = 35;
const BACKFILL_STEP_BATCH = 3;

function bucketStart(timestampMs, bucketDurationMs) {
  return Math.floor(timestampMs / bucketDurationMs) * bucketDurationMs;
}

function scoreFromAggregates(a, weights, customAttributeWeight) {
  const w = weights || ROLLUP_DEFAULT_WEIGHTS;
  const cWeight =
    typeof customAttributeWeight === 'number' ?
      customAttributeWeight :
      w.CUSTOM_ATTRIBUTE_WEIGHT;
  return (
    a.eventCount * w.COUNT_WEIGHT +
    Math.floor(a.amountCentsSum / w.AMOUNT_CENTS_DIVISOR) +
    Math.floor(a.maxAmountCents / w.MAX_AMOUNT_DIVISOR) +
    a.distinctDevices * w.DEVICE_CARDINALITY_WEIGHT +
    a.distinctMerchants * w.MERCHANT_CARDINALITY_WEIGHT +
    a.customAttributeSum * cWeight
  );
}

function isEventInWindow(event, range) {
  const evBucket = bucketStart(event.timestampMs, range.bucketDurationMs);
  return (
    event.entityId === range.entityId &&
    evBucket >= range.cutoffBucketMs &&
    evBucket <= range.currentBucketMs
  );
}

function accumulateMatchingRawEvent(totals, event, extractor) {
  totals.eventCount += 1;
  totals.amountCentsSum += event.amountCents;
  totals.maxAmountCents = Math.max(totals.maxAmountCents, event.amountCents);
  totals.deviceMask |= hashIdentifierToBitMask(event.deviceId);
  totals.merchantMask |= hashIdentifierToBitMask(event.merchantId);
  if (typeof extractor === 'function') {
    totals.customAttributeSum += extractor(event);
  }
}

export function evaluateRawWindowOracle(options = {}) {
  const bucketDurationMs =
    options.bucketDurationMs || ROLLUP_RESOLUTION_MS.ONE_MINUTE;
  const windowMs = options.windowMs || ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS;
  const threshold =
    options.threshold || ROLLUP_DEFAULT_CONFIG.RISK_DECISION_THRESHOLD;
  const range = {
    entityId: options.entityId,
    bucketDurationMs,
    currentBucketMs: bucketStart(options.nowMs, bucketDurationMs),
    cutoffBucketMs: bucketStart(options.nowMs - windowMs + 1, bucketDurationMs),
  };
  const t = {
    eventCount: 0,
    amountCentsSum: 0,
    maxAmountCents: 0,
    deviceMask: 0,
    merchantMask: 0,
    customAttributeSum: 0,
  };
  const events = options.events || [];
  for (const event of events) {
    if (isEventInWindow(event, range)) {
      accumulateMatchingRawEvent(t, event, options.customAttributeExtractor);
    }
  }
  const aggregates = {
    eventCount: t.eventCount,
    amountCentsSum: t.amountCentsSum,
    maxAmountCents: t.maxAmountCents,
    distinctDevices: computeSketchPopcount(t.deviceMask),
    distinctMerchants: computeSketchPopcount(t.merchantMask),
    customAttributeSum: t.customAttributeSum,
  };
  const riskScore = scoreFromAggregates(
    aggregates,
    options.weights,
    options.customAttributeWeight,
  );
  const decision =
    riskScore >= threshold ?
      ROLLUP_DECISION_OUTCOME.REVIEW :
      ROLLUP_DECISION_OUTCOME.ALLOW;
  return {...aggregates, riskScore, decision, eventsScanned: events.length};
}

function buildSyntheticEntityStreams(entityCount) {
  const entityEvents = new Map();
  const entityIds = [];
  let maxTimestampMs = BASE_TIMESTAMP_MS;
  for (let eIdx = 0; eIdx < entityCount; eIdx += 1) {
    const entityId = `acct-${eIdx + 1}`;
    entityIds.push(entityId);
    const stream = [];
    for (let m = 0; m < DEFAULT_MINUTES; m += 1) {
      const minuteBase = BASE_TIMESTAMP_MS + m * ROLLUP_RESOLUTION_MS.ONE_MINUTE;
      for (let k = 0; k < DEFAULT_EVENTS_PER_MINUTE; k += 1) {
        const timestampMs = minuteBase + k * EVENT_OFFSET_STEP_MS;
        maxTimestampMs = Math.max(maxTimestampMs, timestampMs);
        stream.push({
          entityId,
          timestampMs,
          amountCents: BASE_AMOUNT_CENTS + (eIdx + m + k) * AMOUNT_STEP_CENTS,
          deviceId: `dev-${(eIdx + k) % 3}`,
          merchantId: `merch-${(m + k) % 4}`,
          isCrossBorder: (eIdx + m + k) % 2 === 0 ? 1 : 0,
        });
      }
    }
    entityEvents.set(entityId, stream);
  }
  return {entityIds, entityEvents, nowMs: maxTimestampMs};
}

function compareEntitySet(p) {
  for (const entityId of p.entityIds) {
    const raw = evaluateRawWindowOracle({
      entityId,
      events: p.entityEvents.get(entityId) || [],
      nowMs: p.nowMs,
      windowMs: p.windowMs,
      weights: p.weights,
      customAttributeWeight: p.customAttributeWeight,
      customAttributeExtractor: p.customAttributeExtractor,
    });
    const rollup = p.coordinator.evaluateDecision({entityId, nowMs: p.nowMs});
    p.metrics.totalDecisionsCompared += 1;
    p.metrics.rawEventsScannedTotal += raw.eventsScanned;
    p.metrics.rollupBucketsScannedTotal += rollup.bucketsScanned;
    if (raw.riskScore !== rollup.riskScore || raw.decision !== rollup.decision) {
      p.metrics.parityMismatches += 1;
    }
    if (rollup.staleRead) {
      p.metrics.staleReads += 1;
    }
  }
}

export function runScenarioCRollupComparison(options = {}) {
  const entityCount = options.entityCount || DEFAULT_ENTITY_COUNT;
  const hotEntityCount = options.hotEntityCount || DEFAULT_HOT_ENTITY_COUNT;
  const {entityIds, entityEvents, nowMs} =
    buildSyntheticEntityStreams(entityCount);
  const coordinator = new EpochLazyFeatureBackfillCoordinator({
    rollupStore: new PartitionFeatureRollupStore(),
    getEntityEvents: (id) => entityEvents.get(id) || [],
    windowMs: ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS,
  });
  for (const entityId of entityIds) {
    for (const event of entityEvents.get(entityId)) {
      coordinator.ingestCommittedEvent(event);
    }
  }
  const metrics = {
    totalDecisionsCompared: 0,
    parityMismatches: 0,
    staleReads: 0,
    decisionDowntimeMs: 0,
    wanBytesTransferred: 0,
    rawEventsScannedTotal: 0,
    rollupBucketsScannedTotal: 0,
  };
  const baseParams = {entityIds, entityEvents, coordinator, nowMs, metrics};
  const win15m = ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS;
  const win30m = ROLLUP_DEFAULT_CONFIG.EXTENDED_WINDOW_MS;
  compareEntitySet({...baseParams, windowMs: win15m, weights: ROLLUP_DEFAULT_WEIGHTS});
  const epoch2Weights = Object.freeze({
    ...ROLLUP_DEFAULT_WEIGHTS,
    COUNT_WEIGHT: EPOCH_TWO_COUNT_WEIGHT,
  });
  const epoch2Params = {...baseParams, windowMs: win30m, weights: epoch2Weights};
  const deploy2 = coordinator.deployRuleChange({
    ruleEpoch: EPOCH_TWO,
    windowMs: win30m,
    weights: epoch2Weights,
    requiresRawReplay: false,
  });
  metrics.decisionDowntimeMs += deploy2.decisionDowntimeMs;
  compareEntitySet(epoch2Params);
  const crossBorderExtractor = (ev) => (ev.isCrossBorder ? 1 : 0);
  const deploy3 = coordinator.deployRuleChange({
    ruleEpoch: EPOCH_THREE,
    windowMs: win30m,
    weights: epoch2Weights,
    customAttributeWeight: EPOCH_THREE_CUSTOM_WEIGHT,
    customAttributeExtractor: crossBorderExtractor,
    requiresRawReplay: true,
  });
  metrics.decisionDowntimeMs += deploy3.decisionDowntimeMs;
  const epoch3Params = {
    ...epoch2Params,
    customAttributeWeight: EPOCH_THREE_CUSTOM_WEIGHT,
    customAttributeExtractor: crossBorderExtractor,
  };
  compareEntitySet({...epoch3Params, entityIds: entityIds.slice(0, hotEntityCount)});
  while (coordinator.pendingEntityIds.length > 0) {
    const step = coordinator.stepBackgroundBackfill({batchSize: BACKFILL_STEP_BATCH});
    metrics.wanBytesTransferred += step.wanBytesTransferred;
  }
  compareEntitySet(epoch3Params);
  return {
    entityCount,
    ...metrics,
    lazyCutoverCount: coordinator.lazyCutoverCount,
    backgroundUpgradedCount: coordinator.backgroundUpgradedCount,
    skippedAlreadyUpgradedCount: coordinator.skippedAlreadyUpgradedCount,
  };
}
