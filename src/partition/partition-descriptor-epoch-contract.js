import {NUM} from '../constants/index.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_DECISION,
  PARTITION_DESCRIPTOR_EPOCH_REASON,
  PARTITION_DESCRIPTOR_EPOCH_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from './partition-constants.js';

const DESCRIPTOR_EPOCH_FIELD = Object.freeze({
  ACTIVE_PARTITION_VERSION: 'active_partition_version',
  ACTIVE_PARTITION_VERSION_CAMEL: 'activePartitionVersion',
  PENDING_PARTITION_VERSION: 'pending_partition_version',
  PENDING_PARTITION_VERSION_CAMEL: 'pendingPartitionVersion',
  PARTITION_VERSION: 'partition_version',
  PARTITION_VERSION_CAMEL: 'partitionVersion',
});

const DESCRIPTOR_EPOCH_LITERAL = Object.freeze({
  OBJECT: 'object',
});

const DESCRIPTOR_EPOCH_EMPTY_LIST = Object.freeze([]);

function normalizeDescriptorEpochVersion(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > NUM.ZERO ?
    numericValue :
    null;
}

function resolveFirstDescriptorEpochVersion(...values) {
  for (const value of values) {
    const normalized = normalizeDescriptorEpochVersion(value);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function normalizeTargetPartitionDescriptors(descriptors) {
  if (!Array.isArray(descriptors)) {
    return DESCRIPTOR_EPOCH_EMPTY_LIST;
  }
  return Object.freeze(
    descriptors
      .filter((descriptor) =>
        descriptor && typeof descriptor === DESCRIPTOR_EPOCH_LITERAL.OBJECT)
      .map((descriptor) => Object.freeze({
        partitionId:
          descriptor.partition_id || descriptor.partitionId || null,
        partitionVersion: resolveFirstDescriptorEpochVersion(
          descriptor[DESCRIPTOR_EPOCH_FIELD.PARTITION_VERSION],
          descriptor[DESCRIPTOR_EPOCH_FIELD.PARTITION_VERSION_CAMEL],
        ),
      })),
  );
}

function buildPartitionDescriptorEpochSnapshot(options = {}) {
  const tableDescriptor = options.tableDescriptor || {};
  const partitionDescriptor =
    options.partitionDescriptor || options.sourcePartitionDescriptor || {};
  const splitMetadata = options.splitMetadata || {};
  const targetPartitionDescriptors = normalizeTargetPartitionDescriptors(
    options.targetPartitionDescriptors,
  );
  return Object.freeze({
    activePartitionVersion: resolveFirstDescriptorEpochVersion(
      options.activePartitionVersion,
      tableDescriptor[DESCRIPTOR_EPOCH_FIELD.ACTIVE_PARTITION_VERSION],
      tableDescriptor[DESCRIPTOR_EPOCH_FIELD.ACTIVE_PARTITION_VERSION_CAMEL],
    ),
    pendingPartitionVersion: resolveFirstDescriptorEpochVersion(
      options.pendingPartitionVersion,
      tableDescriptor[DESCRIPTOR_EPOCH_FIELD.PENDING_PARTITION_VERSION],
      tableDescriptor[DESCRIPTOR_EPOCH_FIELD.PENDING_PARTITION_VERSION_CAMEL],
    ),
    partitionVersion: resolveFirstDescriptorEpochVersion(
      options.partitionVersion,
      partitionDescriptor[DESCRIPTOR_EPOCH_FIELD.PARTITION_VERSION],
      partitionDescriptor[DESCRIPTOR_EPOCH_FIELD.PARTITION_VERSION_CAMEL],
    ),
    routeTargetPartitionVersion: resolveFirstDescriptorEpochVersion(
      options.routeTargetPartitionVersion,
      options.metadataTargetPartitionVersion,
      splitMetadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
      ],
    ),
    targetPartitionDescriptors,
    allowNextActivePartitionVersion:
      options.allowNextActivePartitionVersion === true,
    requirePartitionDescriptor: options.requirePartitionDescriptor === true,
    requireRouteTargetVersion: options.requireRouteTargetVersion === true,
    requireTargetDescriptors: options.requireTargetDescriptors === true,
  });
}

function rejectDescriptorEpoch(snapshot, state, reason) {
  return Object.freeze({
    decision: PARTITION_DESCRIPTOR_EPOCH_DECISION.REJECT,
    state,
    reason,
    snapshot,
    routable: false,
  });
}

function acceptDescriptorEpoch(snapshot, state, reason, descriptorEpoch) {
  return Object.freeze({
    decision: PARTITION_DESCRIPTOR_EPOCH_DECISION.ACCEPT,
    state,
    reason,
    descriptorEpoch,
    snapshot,
    routable: true,
  });
}

function buildExpectedDescriptorEpochRule(
  matches,
  descriptorEpoch,
  state,
  reason,
) {
  return Object.freeze({
    matches,
    descriptorEpoch,
    state,
    reason,
  });
}

function normalizeExpectedDescriptorEpochRule(rule) {
  return rule?.matches === true ?
    {
      descriptorEpoch: rule.descriptorEpoch,
      state: rule.state,
      reason: rule.reason,
    } :
    null;
}

function buildRouteTargetDescriptorEpochRules(snapshot, routeTargetVersion) {
  return Object.freeze([
    buildExpectedDescriptorEpochRule(
      snapshot.pendingPartitionVersion === routeTargetVersion,
      routeTargetVersion,
      PARTITION_DESCRIPTOR_EPOCH_STATE.PENDING_MATCH,
      PARTITION_DESCRIPTOR_EPOCH_REASON.PENDING_DESCRIPTOR_EPOCH_MATCH,
    ),
    buildExpectedDescriptorEpochRule(
      snapshot.activePartitionVersion === routeTargetVersion,
      routeTargetVersion,
      PARTITION_DESCRIPTOR_EPOCH_STATE.ACTIVE_MATCH,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ACTIVE_DESCRIPTOR_EPOCH_MATCH,
    ),
    buildExpectedDescriptorEpochRule(
      snapshot.allowNextActivePartitionVersion === true &&
        snapshot.activePartitionVersion + NUM.ONE === routeTargetVersion,
      routeTargetVersion,
      PARTITION_DESCRIPTOR_EPOCH_STATE.SPLIT_TARGET_MATCH,
      PARTITION_DESCRIPTOR_EPOCH_REASON.SPLIT_TARGET_VERSION_MATCH,
    ),
  ]);
}

function buildActiveDescriptorEpochRules(snapshot) {
  return Object.freeze([
    buildExpectedDescriptorEpochRule(
      true,
      snapshot.activePartitionVersion,
      PARTITION_DESCRIPTOR_EPOCH_STATE.ACTIVE_MATCH,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ACTIVE_DESCRIPTOR_EPOCH_MATCH,
    ),
  ]);
}

function resolveExpectedDescriptorEpoch(snapshot) {
  const routeTargetVersion = snapshot.routeTargetPartitionVersion;
  const rules = routeTargetVersion === null ?
    buildActiveDescriptorEpochRules(snapshot) :
    buildRouteTargetDescriptorEpochRules(snapshot, routeTargetVersion);
  return normalizeExpectedDescriptorEpochRule(
    rules.find((rule) => rule.matches) || null,
  );
}

function findStaleTargetDescriptor(snapshot, expectedVersion) {
  return snapshot.targetPartitionDescriptors.find((descriptor) =>
    descriptor.partitionVersion !== expectedVersion,
  ) || null;
}

function buildPartitionDescriptorEpochDecision(options = {}) {
  const snapshot = buildPartitionDescriptorEpochSnapshot(options);
  if (snapshot.activePartitionVersion === null) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.MISSING_EVIDENCE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.TABLE_ACTIVE_VERSION_MISSING,
    );
  }
  if (
    snapshot.requirePartitionDescriptor === true &&
    snapshot.partitionVersion === null
  ) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.MISSING_EVIDENCE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.PARTITION_DESCRIPTOR_VERSION_MISSING,
    );
  }
  if (
    snapshot.requireRouteTargetVersion === true &&
    snapshot.routeTargetPartitionVersion === null
  ) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.MISSING_EVIDENCE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ROUTE_TARGET_VERSION_MISSING,
    );
  }

  const expected = resolveExpectedDescriptorEpoch(snapshot);
  if (!expected) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.STALE_ROUTE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ROUTE_TARGET_VERSION_STALE,
    );
  }
  if (
    snapshot.partitionVersion !== null &&
    snapshot.routeTargetPartitionVersion === null &&
    snapshot.partitionVersion !== expected.descriptorEpoch
  ) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.STALE_ROUTE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.PARTITION_DESCRIPTOR_STALE,
    );
  }
  if (
    snapshot.requireTargetDescriptors === true &&
    snapshot.targetPartitionDescriptors.length === NUM.ZERO
  ) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.MISSING_EVIDENCE,
      PARTITION_DESCRIPTOR_EPOCH_REASON.TARGET_DESCRIPTOR_VERSION_MISSING,
    );
  }

  const staleTargetDescriptor = findStaleTargetDescriptor(
    snapshot,
    expected.descriptorEpoch,
  );
  if (staleTargetDescriptor) {
    return rejectDescriptorEpoch(
      snapshot,
      PARTITION_DESCRIPTOR_EPOCH_STATE.STALE_ROUTE,
      staleTargetDescriptor.partitionVersion === null ?
        PARTITION_DESCRIPTOR_EPOCH_REASON.TARGET_DESCRIPTOR_VERSION_MISSING :
        PARTITION_DESCRIPTOR_EPOCH_REASON.TARGET_DESCRIPTOR_VERSION_STALE,
    );
  }

  return acceptDescriptorEpoch(
    snapshot,
    expected.state,
    expected.reason,
    expected.descriptorEpoch,
  );
}

function isPartitionDescriptorEpochAccepted(decision) {
  return decision?.decision === PARTITION_DESCRIPTOR_EPOCH_DECISION.ACCEPT;
}

export {
  buildPartitionDescriptorEpochDecision,
  buildPartitionDescriptorEpochSnapshot,
  isPartitionDescriptorEpochAccepted,
  normalizeDescriptorEpochVersion,
};
