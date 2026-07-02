
const FAILURE_REPAIR_INTENT_OWNER = 'failure_detector';
const FAILURE_REPAIR_INTENT_BOUNDARY = 'durable_repair_intent';

const FAILURE_REPAIR_INTENT_ABSENT_VALUE = 'not_applicable';
const FAILURE_REPAIR_INTENT_UNKNOWN_VALUE = 'unknown';
const FAILURE_REPAIR_INTENT_KEY_DELIMITER = ':';
const FAILURE_REPAIR_INTENT_ID_OBSERVED_AT_SEGMENT = 'observed_at';

const FAILURE_REPAIR_INTENT_TRANSITION_TYPE = Object.freeze({
  NODE_FAILURE: 'node_failure',
  NODE_RECOVERY: 'node_recovery',
  PARTITION_REPLICA_FAILURE: 'partition_replica_failure',
  MESSAGE_GROUP_REPLICA_FAILURE: 'message_group_replica_failure',
  UNKNOWN: FAILURE_REPAIR_INTENT_UNKNOWN_VALUE,
});

const FAILURE_REPAIR_INTENT_STATE = Object.freeze({
  RECORDED: 'recorded',
  CLAIMED: 'claimed',
  COMPLETED: 'completed',
  SUPERSEDED: 'superseded',
  FAILED: 'failed',
  UNKNOWN: FAILURE_REPAIR_INTENT_UNKNOWN_VALUE,
});

const FAILURE_REPAIR_INTENT_REASON_CODE = Object.freeze({
  NODE_FAILURE_CONFIRMED: 'failure_repair_intent_node_failure_confirmed',
  NODE_RECOVERY_CONFIRMED: 'failure_repair_intent_node_recovery_confirmed',
  PARTITION_REPLICA_ON_FAILED_NODE:
    'failure_repair_intent_partition_replica_on_failed_node',
  MESSAGE_GROUP_REPLICA_ON_FAILED_NODE:
    'failure_repair_intent_message_group_replica_on_failed_node',
  UNKNOWN: 'failure_repair_intent_unknown_reason',
});

const FAILURE_REPAIR_INTENT_ENTITY_TYPE = Object.freeze({
  NODE: 'node',
  PARTITION_REPLICA: 'partition_replica',
  MESSAGE_GROUP_REPLICA: 'message_group_replica',
  UNKNOWN: FAILURE_REPAIR_INTENT_UNKNOWN_VALUE,
});

const FAILURE_REPAIR_INTENT_RECORDER_METHOD = Object.freeze({
  RECORD_INTENT: 'recordIntent',
});

const FAILURE_REPAIR_INTENT_DEFAULT_ATTEMPT = 1;
const FAILURE_REPAIR_INTENT_DEFAULT_TIMESTAMP = 0;

function normalizeFailureRepairIntentText(value, fallback) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function normalizeFailureRepairIntentNumber(value, fallback) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) {
    return fallback;
  }
  return Math.trunc(normalizedValue);
}

function normalizeFailureRepairIntentEnum(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

function buildFailureRepairIntentReasonCode(transitionType, reasonCode) {
  const normalizedReasonCode = normalizeFailureRepairIntentEnum(
    reasonCode,
    Object.values(FAILURE_REPAIR_INTENT_REASON_CODE),
    FAILURE_REPAIR_INTENT_REASON_CODE.UNKNOWN,
  );
  if (normalizedReasonCode !== FAILURE_REPAIR_INTENT_REASON_CODE.UNKNOWN) {
    return normalizedReasonCode;
  }
  const reasonDecision = Object.freeze([
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE,
      reasonCode: FAILURE_REPAIR_INTENT_REASON_CODE.NODE_FAILURE_CONFIRMED,
    }),
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_RECOVERY,
      reasonCode: FAILURE_REPAIR_INTENT_REASON_CODE.NODE_RECOVERY_CONFIRMED,
    }),
    Object.freeze({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.PARTITION_REPLICA_FAILURE,
      reasonCode:
        FAILURE_REPAIR_INTENT_REASON_CODE.PARTITION_REPLICA_ON_FAILED_NODE,
    }),
    Object.freeze({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.MESSAGE_GROUP_REPLICA_FAILURE,
      reasonCode:
        FAILURE_REPAIR_INTENT_REASON_CODE.MESSAGE_GROUP_REPLICA_ON_FAILED_NODE,
    }),
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
      reasonCode: FAILURE_REPAIR_INTENT_REASON_CODE.UNKNOWN,
    }),
  ]).find((entry) => entry.transitionType === transitionType);
  return reasonDecision.reasonCode;
}

function buildFailureRepairIntentKeySegment(...segments) {
  return segments
    .map((segment) => normalizeFailureRepairIntentText(
      segment,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ))
    .join(FAILURE_REPAIR_INTENT_KEY_DELIMITER);
}

function buildFailureRepairIntentOwnerKey(options = {}) {
  const transitionType = normalizeFailureRepairIntentEnum(
    options.transitionType,
    Object.values(FAILURE_REPAIR_INTENT_TRANSITION_TYPE),
    FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
  );
  const nodeId = normalizeFailureRepairIntentText(
    options.nodeId,
    FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  );
  const serviceId = normalizeFailureRepairIntentText(
    options.serviceId,
    FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  );
  const partitionId = normalizeFailureRepairIntentText(
    options.partitionId,
    FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  );
  const groupId = normalizeFailureRepairIntentText(
    options.groupId,
    FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  );
  const ownerKeyDecision = Object.freeze([
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE,
      entityType: FAILURE_REPAIR_INTENT_ENTITY_TYPE.NODE,
      entityKey: buildFailureRepairIntentKeySegment(nodeId),
    }),
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_RECOVERY,
      entityType: FAILURE_REPAIR_INTENT_ENTITY_TYPE.NODE,
      entityKey: buildFailureRepairIntentKeySegment(nodeId),
    }),
    Object.freeze({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.PARTITION_REPLICA_FAILURE,
      entityType: FAILURE_REPAIR_INTENT_ENTITY_TYPE.PARTITION_REPLICA,
      entityKey: buildFailureRepairIntentKeySegment(nodeId, serviceId, partitionId),
    }),
    Object.freeze({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.MESSAGE_GROUP_REPLICA_FAILURE,
      entityType: FAILURE_REPAIR_INTENT_ENTITY_TYPE.MESSAGE_GROUP_REPLICA,
      entityKey: buildFailureRepairIntentKeySegment(nodeId, serviceId, groupId),
    }),
    Object.freeze({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
      entityType: FAILURE_REPAIR_INTENT_ENTITY_TYPE.UNKNOWN,
      entityKey: FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    }),
  ]).find((entry) => entry.transitionType === transitionType);
  return buildFailureRepairIntentKeySegment(
    FAILURE_REPAIR_INTENT_OWNER,
    FAILURE_REPAIR_INTENT_BOUNDARY,
    ownerKeyDecision.entityType,
    ownerKeyDecision.entityKey,
  );
}

function buildFailureRepairIntentWorkflowKey(options = {}) {
  const transitionType = normalizeFailureRepairIntentEnum(
    options.transitionType,
    Object.values(FAILURE_REPAIR_INTENT_TRANSITION_TYPE),
    FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
  );
  return buildFailureRepairIntentKeySegment(
    FAILURE_REPAIR_INTENT_OWNER,
    FAILURE_REPAIR_INTENT_BOUNDARY,
    transitionType,
    buildFailureRepairIntentOwnerKey(options),
  );
}

function normalizeFailureRepairIntentRecord(record = {}) {
  const transitionType = normalizeFailureRepairIntentEnum(
    record.transitionType,
    Object.values(FAILURE_REPAIR_INTENT_TRANSITION_TYPE),
    FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
  );
  const state = normalizeFailureRepairIntentEnum(
    record.state,
    Object.values(FAILURE_REPAIR_INTENT_STATE),
    FAILURE_REPAIR_INTENT_STATE.UNKNOWN,
  );
  const observedAt = normalizeFailureRepairIntentNumber(
    record.observedAt,
    FAILURE_REPAIR_INTENT_DEFAULT_TIMESTAMP,
  );
  const recordedAt = normalizeFailureRepairIntentNumber(
    record.recordedAt,
    observedAt,
  );
  const normalizedRecord = Object.freeze({
    owner: FAILURE_REPAIR_INTENT_OWNER,
    boundary: FAILURE_REPAIR_INTENT_BOUNDARY,
    transitionType,
    state,
    reasonCode: buildFailureRepairIntentReasonCode(
      transitionType,
      record.reasonCode,
    ),
    ownerKey: normalizeFailureRepairIntentText(
      record.ownerKey,
      buildFailureRepairIntentOwnerKey(record),
    ),
    workflowKey: normalizeFailureRepairIntentText(
      record.workflowKey,
      buildFailureRepairIntentWorkflowKey(record),
    ),
    intentId: normalizeFailureRepairIntentText(
      record.intentId,
      buildFailureRepairIntentKeySegment(
        buildFailureRepairIntentWorkflowKey(record),
        FAILURE_REPAIR_INTENT_ID_OBSERVED_AT_SEGMENT,
        observedAt,
      ),
    ),
    nodeId: normalizeFailureRepairIntentText(
      record.nodeId,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    serviceId: normalizeFailureRepairIntentText(
      record.serviceId,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    partitionId: normalizeFailureRepairIntentText(
      record.partitionId,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    groupId: normalizeFailureRepairIntentText(
      record.groupId,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    replicaType: normalizeFailureRepairIntentText(
      record.replicaType,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    sourceNodeId: normalizeFailureRepairIntentText(
      record.sourceNodeId,
      FAILURE_REPAIR_INTENT_ABSENT_VALUE,
    ),
    observedAt,
    recordedAt,
    attempt: normalizeFailureRepairIntentNumber(
      record.attempt,
      FAILURE_REPAIR_INTENT_DEFAULT_ATTEMPT,
    ),
  });
  return normalizedRecord;
}

function buildFailureRepairIntentRecord(options = {}) {
  return normalizeFailureRepairIntentRecord({
    ...options,
    state: options.state || FAILURE_REPAIR_INTENT_STATE.RECORDED,
  });
}

function createInMemoryFailureRepairIntentRecorder() {
  const records = [];
  return Object.freeze({
    async recordIntent(record) {
      const normalizedRecord = normalizeFailureRepairIntentRecord(record);
      records.push(normalizedRecord);
      return normalizedRecord;
    },
    getRecords() {
      return [...records];
    },
    clear() {
      records.length = 0;
    },
  });
}

export {
  FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  FAILURE_REPAIR_INTENT_BOUNDARY,
  FAILURE_REPAIR_INTENT_ENTITY_TYPE,
  FAILURE_REPAIR_INTENT_OWNER,
  FAILURE_REPAIR_INTENT_REASON_CODE,
  FAILURE_REPAIR_INTENT_RECORDER_METHOD,
  FAILURE_REPAIR_INTENT_STATE,
  FAILURE_REPAIR_INTENT_TRANSITION_TYPE,
  buildFailureRepairIntentOwnerKey,
  buildFailureRepairIntentRecord,
  buildFailureRepairIntentWorkflowKey,
  createInMemoryFailureRepairIntentRecorder,
  normalizeFailureRepairIntentRecord,
};
