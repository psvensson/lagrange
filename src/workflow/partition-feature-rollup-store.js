import {
  ROLLUP_DECISION_OUTCOME,
  ROLLUP_DEFAULT_CONFIG,
  ROLLUP_DEFAULT_WEIGHTS,
  ROLLUP_ERROR_MSG,
  ROLLUP_RESOLUTION_MS,
} from './partition-feature-rollup-constants.js';

function requireEntityId(entityId) {
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw new Error(ROLLUP_ERROR_MSG.ENTITY_ID_REQUIRED);
  }
  return entityId;
}

function resolveNumber(value, fallback) {
  return typeof value === 'number' ? value : fallback;
}

function createEmptyBucket(bucketStartMs) {
  return {
    bucketStartMs,
    eventCount: 0,
    amountCentsSum: 0,
    maxAmountCents: 0,
    deviceMask: 0,
    merchantMask: 0,
    customAttributeSum: 0,
  };
}

function computeCustomAttributeDelta(event, extractor) {
  if (typeof extractor !== 'function') {
    return 0;
  }
  const extracted = extractor(event);
  return typeof extracted === 'number' ? extracted : 0;
}

function calculateWindowRiskScore(aggregates, weights, customAttributeWeight) {
  const w = weights || ROLLUP_DEFAULT_WEIGHTS;
  const customWeight = resolveNumber(
    customAttributeWeight,
    w.CUSTOM_ATTRIBUTE_WEIGHT,
  );
  return (
    aggregates.eventCount * w.COUNT_WEIGHT +
    Math.floor(aggregates.amountCentsSum / w.AMOUNT_CENTS_DIVISOR) +
    Math.floor(aggregates.maxAmountCents / w.MAX_AMOUNT_DIVISOR) +
    aggregates.distinctDevices * w.DEVICE_CARDINALITY_WEIGHT +
    aggregates.distinctMerchants * w.MERCHANT_CARDINALITY_WEIGHT +
    aggregates.customAttributeSum * customWeight
  );
}

export function computeSketchPopcount(mask) {
  let value = mask | 0;
  let count = 0;
  while (value > 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

export function hashIdentifierToBitMask(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return 0;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i)) % ROLLUP_DEFAULT_CONFIG.SKETCH_MODULUS;
  }
  return 1 << hash;
}

export class PartitionFeatureRollupStore {
  constructor(options = {}) {
    this.entities = new Map();
    this.bucketDurationMs = resolveNumber(
      options.bucketDurationMs,
      ROLLUP_RESOLUTION_MS.ONE_MINUTE,
    );
  }

  bucketStartFor(timestampMs) {
    const ts = resolveNumber(timestampMs, 0);
    return Math.floor(ts / this.bucketDurationMs) * this.bucketDurationMs;
  }

  _getOrCreateEntity(entityId, ruleEpoch) {
    let entity = this.entities.get(entityId);
    if (!entity) {
      const featureEpoch = resolveNumber(
        ruleEpoch,
        ROLLUP_DEFAULT_CONFIG.INITIAL_RULE_EPOCH,
      );
      entity = {entityId, featureEpoch, lastIngestAtMs: 0, buckets: new Map()};
      this.entities.set(entityId, entity);
    }
    return entity;
  }

  _getOrCreateBucket(entity, bucketStartMs) {
    let bucket = entity.buckets.get(bucketStartMs);
    if (!bucket) {
      bucket = createEmptyBucket(bucketStartMs);
      entity.buckets.set(bucketStartMs, bucket);
    }
    return bucket;
  }

  applyCommittedEvent(event, options = {}) {
    const id = requireEntityId(event?.entityId);
    const epoch = resolveNumber(
      options.ruleEpoch,
      ROLLUP_DEFAULT_CONFIG.INITIAL_RULE_EPOCH,
    );
    const ts = resolveNumber(event.timestampMs, 0);
    const amountCents = resolveNumber(event.amountCents, 0);
    const entity = this._getOrCreateEntity(id, epoch);
    entity.lastIngestAtMs = Math.max(entity.lastIngestAtMs, ts);
    const bucket = this._getOrCreateBucket(entity, this.bucketStartFor(ts));

    bucket.eventCount += 1;
    bucket.amountCentsSum += amountCents;
    bucket.maxAmountCents = Math.max(bucket.maxAmountCents, amountCents);
    bucket.deviceMask |= hashIdentifierToBitMask(event.deviceId);
    bucket.merchantMask |= hashIdentifierToBitMask(event.merchantId);
    bucket.customAttributeSum += computeCustomAttributeDelta(
      event,
      options.customAttributeExtractor,
    );
    return {
      entityId: id,
      featureEpoch: entity.featureEpoch,
      lastIngestAtMs: entity.lastIngestAtMs,
      bucketCount: entity.buckets.size,
    };
  }

  _scanWindowBuckets(entity, cutoffBucketMs, currentBucketMs) {
    const totals = createEmptyBucket(0);
    totals.bucketsScanned = 0;
    if (!entity) {
      return totals;
    }
    for (const bucket of entity.buckets.values()) {
      const inRange =
        bucket.bucketStartMs >= cutoffBucketMs &&
        bucket.bucketStartMs <= currentBucketMs;
      if (inRange) {
        totals.eventCount += bucket.eventCount;
        totals.amountCentsSum += bucket.amountCentsSum;
        totals.maxAmountCents = Math.max(
          totals.maxAmountCents,
          bucket.maxAmountCents,
        );
        totals.deviceMask |= bucket.deviceMask;
        totals.merchantMask |= bucket.merchantMask;
        totals.customAttributeSum += bucket.customAttributeSum;
        totals.bucketsScanned += 1;
      }
    }
    return totals;
  }

  evaluateWindowRollup(options = {}) {
    const id = requireEntityId(options?.entityId);
    const nowMs = resolveNumber(options.nowMs, 0);
    const windowMs = resolveNumber(
      options.windowMs,
      ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS,
    );
    const threshold = resolveNumber(
      options.threshold,
      ROLLUP_DEFAULT_CONFIG.RISK_DECISION_THRESHOLD,
    );
    const entity = this.entities.get(id);
    const scanned = this._scanWindowBuckets(
      entity,
      this.bucketStartFor(nowMs - windowMs + 1),
      this.bucketStartFor(nowMs),
    );
    const aggregates = {
      eventCount: scanned.eventCount,
      amountCentsSum: scanned.amountCentsSum,
      maxAmountCents: scanned.maxAmountCents,
      distinctDevices: computeSketchPopcount(scanned.deviceMask),
      distinctMerchants: computeSketchPopcount(scanned.merchantMask),
      customAttributeSum: scanned.customAttributeSum,
    };
    const riskScore = calculateWindowRiskScore(
      aggregates,
      options.weights,
      options.customAttributeWeight,
    );
    const decision =
      riskScore >= threshold ?
        ROLLUP_DECISION_OUTCOME.REVIEW :
        ROLLUP_DECISION_OUTCOME.ALLOW;
    return {
      entityId: id,
      ...aggregates,
      riskScore,
      decision,
      bucketsScanned: scanned.bucketsScanned,
      featureEpoch: entity ?
        entity.featureEpoch :
        ROLLUP_DEFAULT_CONFIG.INITIAL_RULE_EPOCH,
    };
  }

  rebuildEntityCustomAttributeFromLog(
    entityId,
    events = [],
    extractor = undefined,
    ruleEpoch = ROLLUP_DEFAULT_CONFIG.INITIAL_RULE_EPOCH,
  ) {
    const id = requireEntityId(entityId);
    const entity = this._getOrCreateEntity(id, ruleEpoch);
    for (const bucket of entity.buckets.values()) {
      bucket.customAttributeSum = 0;
    }
    for (const event of events) {
      const bStart = this.bucketStartFor(event.timestampMs);
      const bucket = this._getOrCreateBucket(entity, bStart);
      bucket.customAttributeSum += computeCustomAttributeDelta(event, extractor);
    }
    entity.featureEpoch = ruleEpoch;
    return {entityId: id, featureEpoch: ruleEpoch, eventsReplayed: events.length};
  }

  stampAllEntitiesEpoch(ruleEpoch) {
    for (const entity of this.entities.values()) {
      entity.featureEpoch = ruleEpoch;
    }
    return this.entities.size;
  }

  getEntityFeatureEpoch(entityId) {
    const entity = this.entities.get(entityId);
    return entity ? entity.featureEpoch : 0;
  }

  listEntityIds() {
    return Array.from(this.entities.keys());
  }
}
