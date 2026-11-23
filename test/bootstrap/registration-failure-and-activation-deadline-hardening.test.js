import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from '../../src/bootstrap/shared/node-registration-owner.js';
import {
  DeferredPartitionServiceActivationOwner,
} from '../../src/bootstrap/shared/deferred-partition-service-activation-owner.js';
import {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
} from '../../src/node/replica-state-machine-registered-activation.js';
import {
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
} from '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';

const NOW = 1_795_447_500_000;
const NODE_ID = '00000000-0000-4000-8000-000000000011';

function createSilentLogger() {
  return {info() {}, warn() {}, error() {}};
}

function createRegistrationOwner(overrides = {}) {
  const owner = new NodeRegistrationOwner({
    nodeId: NODE_ID,
    nodeAddress: '172.28.0.11:8080',
    hostId: LOCAL_MACHINE_HOST_ID,
    delegates: {
      getLogger: () => createSilentLogger(),
      getNow: () => () => NOW,
      getNodeCapabilities: () => [],
      getBootIncarnation: () => 2,
      getSystemTableCache: () => ({applySystemTableChange() {}}),
      getNodeStorageBudgetService: () => ({
        resolveBudgetRow: (nodeRow) => ({
          budgetRow: nodeRow,
          resolution: {isValid: true, budgetBytes: 1024, source: 'test', diskBytes: 1024},
        }),
      }),
      ...overrides,
    },
  });
  owner.resolveExistingDurableRejoinMembership = async () => null;
  owner.resolveExistingJoinAdmissionProgress = async () => null;
  return owner;
}

function assertStructuredFailureFields(t, error, expected, label) {
  t.equal(error.code, expected.code, `${label}: preserves code`);
  t.equal(error.failureCode, expected.failureCode, `${label}: preserves failureCode`);
  t.equal(error.outcome, expected.outcome, `${label}: preserves outcome`);
  t.equal(error.entryId, expected.entryId, `${label}: preserves entryId`);
  t.equal(error.retryable, expected.retryable, `${label}: preserves retryable`);
  t.equal(error.deferRetry, expected.deferRetry, `${label}: preserves deferRetry`);
  t.equal(error.retryAfterMs, expected.retryAfterMs, `${label}: preserves retryAfterMs`);
  t.ok(error.cause !== undefined, `${label}: preserves cause`);
}

test('§1: registerNodeInCluster preserves structured failure fields from ' +
  'unsuccessful node upsert result', async (t) => {
  const rootCause = new Error('raft proposal indeterminate');
  const structuredResult = {
    success: false,
    error: 'quorum stalled',
    code: 'PARTITION_WRITE_TIMEOUT',
    failureCode: 'OUTCOME_UNKNOWN',
    outcome: 'unknown',
    entryId: 'entry-node-1',
    retryable: true,
    deferRetry: true,
    retryAfterMs: 350,
    cause: rootCause,
  };
  const owner = createRegistrationOwner();
  owner.upsertSystemTableRowWithRetry = async () => structuredResult;

  const error = await t.rejects(
    owner.registerNodeInCluster(),
    /Failed to register node:.*quorum stalled/,
  );
  assertStructuredFailureFields(t, error, structuredResult, 'registerNodeInCluster');
  t.equal(error.cause?.cause, rootCause,
    'registerNodeInCluster retains the underlying cause through wrapNodeRegistrationError');
});

test('§1: registerNodeEndpoint, registerMetaServiceEndpoints, and ' +
  'advanceSingleReusedEndpointRow preserve structured failure fields', async (t) => {
  const endpointFailure = {
    code: 'ENDPOINT_CAS_BUSY',
    failureCode: 'LEADER_STEPPED_DOWN',
    entryId: 'entry-ep-1',
    retryable: true,
    deferRetry: true,
    retryAfterMs: 400,
    error: 'leader stepped down during endpoint CAS',
  };
  const owner = createRegistrationOwner();
  owner.membershipPublicationRuntimeOwner = {
    async writeJoinEndpointAtIncarnation() {
      return {
        outcome: ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED,
        result: endpointFailure,
        error: null,
      };
    },
  };

  const expected = {
    ...endpointFailure,
    outcome: ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED,
  };

  const nodeEpErr = await t.rejects(
    owner.registerNodeEndpoint(NOW),
    /Failed to register endpoint/,
  );
  assertStructuredFailureFields(t, nodeEpErr, expected, 'registerNodeEndpoint');
  t.equal(nodeEpErr.cause, endpointFailure,
    'registerNodeEndpoint preserves underlying endpoint write result as cause');

  const metaEpErr = await t.rejects(
    owner.registerMetaServiceEndpoints(),
    /Failed to register meta endpoint/,
  );
  assertStructuredFailureFields(t, metaEpErr, expected, 'registerMetaServiceEndpoints');

  const advanceErr = await t.rejects(
    owner.advanceSingleReusedEndpointRow(
      TABLES.NODE_ENDPOINTS,
      {[COLUMN.ENDPOINT_ID]: 'ep-1', [COLUMN.BOOT_INCARNATION]: 1},
      2,
    ),
    /Node boot incarnation advance was not observed/,
  );
  assertStructuredFailureFields(t, advanceErr, expected, 'advanceSingleReusedEndpointRow');
});

test('§1: wrapNodeRegistrationError preserves non-retryable structured fields', async (t) => {
  const nonRetryableResult = {
    success: false,
    error: 'invalid host binding',
    code: 'HOST_BINDING_REJECTED',
    failureCode: 'PRECONDITION_FAILED',
    outcome: 'rejected',
    entryId: 'entry-node-2',
    retryable: false,
    deferRetry: false,
    retryAfterMs: 0,
  };
  const owner = createRegistrationOwner();
  owner.upsertSystemTableRowWithRetry = async () => nonRetryableResult;

  const error = await t.rejects(
    owner.registerNodeInCluster(),
    /Failed to register node:.*invalid host binding/,
  );
  t.equal(error.code, 'HOST_BINDING_REJECTED');
  t.equal(error.failureCode, 'PRECONDITION_FAILED');
  t.equal(error.outcome, 'rejected');
  t.equal(error.entryId, 'entry-node-2');
  t.equal(error.retryable, false);
  t.not(error.deferRetry, true);
});

test('§3: settleBeforeDeadline bounds a hanging retry pass by remainingMs ' +
  'and detaches safely for subsequent retries', async (t) => {
  const service = {id: 'svc-1'};
  let restoreState = JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;
  const receivedOptions = [];
  let rejectHungPass = null;
  let passCount = 0;

  const owner = new DeferredPartitionServiceActivationOwner({
    getPartitionService: (replicaId) => (replicaId === 'p1-r1' ? service : null),
    getDurableRejoinRestoreState: () => restoreState,
    setDurableRejoinRestoreState: (next) => {
      restoreState = next;
    },
    activateReplicaBatch: async (replicaIds, batchOptions) => {
      passCount += 1;
      receivedOptions.push({replicaIds, batchOptions});
      if (passCount === 1) {
        return new Promise((_, reject) => {
          rejectHungPass = reject;
        });
      }
      owner.markSettled('p1-r1');
      return 1;
    },
  });

  owner.recordDeferred({
    replicaId: 'p1-r1',
    partitionId: 'p1',
    service,
    expectedReplicaIncarnation: 2,
    error: new Error('initial transient error'),
  });

  const startedAt = Date.now();
  const timeoutErr = await t.rejects(
    owner.awaitSettledForReadySignal({timeoutMs: 45, retryDelayMs: 10}),
    {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
    'hung activateReplicaBatch must time out strictly at the deadline',
  );
  const elapsedMs = Date.now() - startedAt;
  t.ok(elapsedMs < 500, `bounded timeout returned promptly (${elapsedMs}ms)`);
  t.equal(timeoutErr.deferRetry, true);
  t.same(timeoutErr.pendingReplicaIds, ['p1-r1']);
  t.equal(receivedOptions.length, 1);
  t.ok(
    Number.isFinite(receivedOptions[0].batchOptions.timeoutMs) &&
      receivedOptions[0].batchOptions.timeoutMs <= 45,
    'retry pass receives remainingMs timeout budget',
  );
  t.ok(
    Number.isFinite(receivedOptions[0].batchOptions.deadlineMs),
    'retry pass receives absolute deadlineMs',
  );

  // A late rejection from the detached hung pass must not cause an unhandled
  // rejection or block a subsequent healthy retry pass.
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.once('unhandledRejection', onUnhandled);
  try {
    rejectHungPass(new Error('late failure from detached hung pass'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    t.equal(unhandled, null, 'detached hung pass rejection is safely absorbed');

    await owner.awaitSettledForReadySignal({timeoutMs: 100, retryDelayMs: 10});
    t.equal(owner.hasPending(), false, 'subsequent retry pass settles cleanly');
    t.equal(restoreState, JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('§3: settleBeforeDeadline does not start a new pass once deadline is ' +
  'already exhausted and cancels deadline timers on fast completion', async (t) => {
  const service = {id: 'svc-2'};
  let scheduledCount = 0;
  let cancelledCount = 0;
  let calls = 0;
  const clock = 1000;

  const owner = new DeferredPartitionServiceActivationOwner({
    now: () => clock,
    scheduleTimer: (cb, delayMs) => {
      scheduledCount += 1;
      return setTimeout(cb, delayMs);
    },
    cancelTimer: (timer) => {
      cancelledCount += 1;
      clearTimeout(timer);
    },
    getPartitionService: () => service,
    activateReplicaBatch: async () => {
      calls += 1;
      owner.markSettled('p2-r1');
      return 1;
    },
  });

  owner.recordDeferred({
    replicaId: 'p2-r1',
    partitionId: 'p2',
    service,
  });
  await t.rejects(
    owner.settleBeforeDeadline(clock, 10),
    {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
    'already-expired deadline fails closed before invoking activateReplicaBatch',
  );
  t.equal(calls, 0, 'no retry pass is launched after deadline exhaustion');

  await owner.settleBeforeDeadline(clock + 100, 10);
  t.equal(calls, 1, 'healthy pass completes within budget');
  t.equal(scheduledCount, 1, 'one deadline timer was scheduled');
  t.equal(cancelledCount, 1, 'deadline timer was cancelled cleanly on completion');
});
