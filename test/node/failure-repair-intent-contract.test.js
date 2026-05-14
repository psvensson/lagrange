import {test} from '../../src/test-helpers/tap.js';
import {
  FAILURE_REPAIR_INTENT_ABSENT_VALUE,
  FAILURE_REPAIR_INTENT_BOUNDARY,
  FAILURE_REPAIR_INTENT_OWNER,
  FAILURE_REPAIR_INTENT_REASON_CODE,
  FAILURE_REPAIR_INTENT_STATE,
  FAILURE_REPAIR_INTENT_TRANSITION_TYPE,
  buildFailureRepairIntentOwnerKey,
  buildFailureRepairIntentRecord,
  buildFailureRepairIntentWorkflowKey,
  createInMemoryFailureRepairIntentRecorder,
  normalizeFailureRepairIntentRecord,
} from '../../src/node/failure-repair-intent-contract.js';

const TEST_NODE_ID = 'node-1';
const TEST_SOURCE_NODE_ID = 'detector-node';
const TEST_SERVICE_ID = 'service-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_GROUP_ID = 'group-1';
const TEST_REPLICA_TYPE_PARTITION = 'partition';
const TEST_OBSERVED_AT = 1000;
const TEST_RECORDED_AT = 1001;
const TEST_ATTEMPT = 2;

test('failure repair intent contract builds node failure owner and workflow keys',
  async (t) => {
    const ownerKey = buildFailureRepairIntentOwnerKey({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE,
      nodeId: TEST_NODE_ID,
    });
    const workflowKey = buildFailureRepairIntentWorkflowKey({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE,
      nodeId: TEST_NODE_ID,
    });

    t.equal(
      ownerKey,
      `${FAILURE_REPAIR_INTENT_OWNER}:${FAILURE_REPAIR_INTENT_BOUNDARY}:` +
        `node:${TEST_NODE_ID}`,
    );
    t.equal(
      workflowKey,
      `${FAILURE_REPAIR_INTENT_OWNER}:${FAILURE_REPAIR_INTENT_BOUNDARY}:` +
        `${FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE}:` +
        `${ownerKey}`,
    );
  });

test('failure repair intent contract builds replica intent records',
  async (t) => {
    const record = buildFailureRepairIntentRecord({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.PARTITION_REPLICA_FAILURE,
      nodeId: TEST_NODE_ID,
      serviceId: TEST_SERVICE_ID,
      partitionId: TEST_PARTITION_ID,
      replicaType: TEST_REPLICA_TYPE_PARTITION,
      sourceNodeId: TEST_SOURCE_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      recordedAt: TEST_RECORDED_AT,
      attempt: TEST_ATTEMPT,
    });

    t.match(record, {
      owner: FAILURE_REPAIR_INTENT_OWNER,
      boundary: FAILURE_REPAIR_INTENT_BOUNDARY,
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.PARTITION_REPLICA_FAILURE,
      state: FAILURE_REPAIR_INTENT_STATE.RECORDED,
      reasonCode:
        FAILURE_REPAIR_INTENT_REASON_CODE.PARTITION_REPLICA_ON_FAILED_NODE,
      nodeId: TEST_NODE_ID,
      serviceId: TEST_SERVICE_ID,
      partitionId: TEST_PARTITION_ID,
      groupId: FAILURE_REPAIR_INTENT_ABSENT_VALUE,
      replicaType: TEST_REPLICA_TYPE_PARTITION,
      sourceNodeId: TEST_SOURCE_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      recordedAt: TEST_RECORDED_AT,
      attempt: TEST_ATTEMPT,
    });
    t.equal(
      record.ownerKey,
      `${FAILURE_REPAIR_INTENT_OWNER}:${FAILURE_REPAIR_INTENT_BOUNDARY}:` +
        `partition_replica:${TEST_NODE_ID}:${TEST_SERVICE_ID}:` +
        `${TEST_PARTITION_ID}`,
    );
  });

test('failure repair intent normalizer uses explicit unknown and absent variants',
  async (t) => {
    const record = normalizeFailureRepairIntentRecord({
      transitionType: 'unsupported-transition',
      state: 'unsupported-state',
      reasonCode: 'unsupported-reason',
      groupId: TEST_GROUP_ID,
    });

    t.match(record, {
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.UNKNOWN,
      state: FAILURE_REPAIR_INTENT_STATE.UNKNOWN,
      reasonCode: FAILURE_REPAIR_INTENT_REASON_CODE.UNKNOWN,
      nodeId: FAILURE_REPAIR_INTENT_ABSENT_VALUE,
      serviceId: FAILURE_REPAIR_INTENT_ABSENT_VALUE,
      partitionId: FAILURE_REPAIR_INTENT_ABSENT_VALUE,
      groupId: TEST_GROUP_ID,
      observedAt: 0,
      recordedAt: 0,
    });
  });

test('in-memory failure repair intent recorder stores normalized records',
  async (t) => {
    const recorder = createInMemoryFailureRepairIntentRecorder();
    const recorded = await recorder.recordIntent({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_RECOVERY,
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
    });

    t.equal(
      recorded.reasonCode,
      FAILURE_REPAIR_INTENT_REASON_CODE.NODE_RECOVERY_CONFIRMED,
    );
    t.same(recorder.getRecords(), [recorded]);

    recorder.clear();
    t.same(recorder.getRecords(), []);
  });
