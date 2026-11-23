import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeRegistrationOwner} from '../../src/bootstrap/shared/node-registration-owner.js';
import {
  DeferredPartitionServiceActivationOwner,
} from '../../src/bootstrap/shared/deferred-partition-service-activation-owner.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  activatePartitionServiceRows,
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
} from '../../src/node/replica-state-machine-registered-activation.js';
import {
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
} from '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
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

function createRegisteredPartitionRow(overrides = {}) {
  return {
    service_id: 'p1-r1',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: 'p1',
    node_id: NODE_ID,
    replica_id: 'p1-r1',
    group_id: null,
    raft_role: 'follower',
    status: SERVICE_STATUS.STOPPED,
    address: `${NODE_ID}/partition/p1-r1`,
    cleanup_token: null,
    create_attempt_token: null,
    created_at: 100,
    state_entered_at: 100,
    updated_at: 100,
    ...overrides,
  };
}

function rowMatchesWhere(row, whereClause) {
  return Object.entries(whereClause).every(([key, value]) => row?.[key] === value);
}

function createRealJoinActivationHarness(initialRow, hooks = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'fatal'});

  let authoritativeRow = {...initialRow};
  const reads = [];
  const updates = [];
  const registeredHandlers = new Map();
  const writer = {
    reads,
    updates,
    get row() {
      return {...authoritativeRow};
    },
    setRow(nextRow) {
      authoritativeRow = {...nextRow};
    },
    async readAuthoritativeRows(tableName, sql, params, options) {
      reads.push({tableName, sql, params, options});
      if (typeof hooks.onRead === 'function') {
        await hooks.onRead({tableName, sql, params, options, index: reads.length});
      }
      return {success: true, rows: authoritativeRow ? [{...authoritativeRow}] : []};
    },
    async updateSystemTableRow(tableName, whereClause, data, writeOptions) {
      const entry = {tableName, whereClause, data, writeOptions, index: updates.length + 1};
      updates.push(entry);
      if (typeof hooks.onUpdate === 'function') {
        const custom = await hooks.onUpdate(entry, () => {
          const applied = rowMatchesWhere(authoritativeRow, whereClause);
          if (applied) authoritativeRow = {...authoritativeRow, ...data};
          return applied;
        });
        if (custom !== undefined) {
          return custom;
        }
      }
      const applied = rowMatchesWhere(authoritativeRow, whereClause);
      if (applied) authoritativeRow = {...authoritativeRow, ...data};
      return {
        success: true,
        outcome: applied ? 'applied' : 'observed_state_changed',
        partitionResult: {affectedRows: applied ? 1 : 0},
      };
    },
  };

  const stateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    controlPlaneSystemTableGateway: writer,
    now: () => NOW,
  });
  const joiningService = new NodeJoiningService({
    bootIncarnation: 2,
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeId: NODE_ID,
    nodeAddress: 'ws://127.0.0.1:9090',
    seedNodeAddress: 'http://127.0.0.1:8080',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    dataDir: '/tmp/test-join-activation-budget',
  });
  joiningService.logger = createSilentLogger();
  joiningService.controlPlaneSystemTableGateway = writer;
  joiningService.replicaStateMachine = stateMachine;
  joiningService.messageRouter = {
    isRegistered: (address) => registeredHandlers.has(address),
    getRegisteredHandler: (address) => registeredHandlers.get(address) || null,
  };
  joiningService.durableRejoinRestoreState =
    JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;

  const registerService = (replicaId, service) => {
    joiningService.partitionServices.set(replicaId, service);
    registeredHandlers.set(service.unifiedAddress, service.transportHandler);
  };
  const retireServiceHandler = (service) => {
    if (registeredHandlers.get(service.unifiedAddress) === service.transportHandler) {
      registeredHandlers.delete(service.unifiedAddress);
    }
  };
  const cleanup = () => {
    joiningService.clearDeferredPartitionServiceRowActivations();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };

  return {
    writer,
    stateMachine,
    joiningService,
    registerService,
    retireServiceHandler,
    cleanup,
  };
}

function assertLiveBudgetOptions(t, opts, maxMs, label) {
  t.ok(
    Number.isFinite(opts?.timeoutMs) && opts.timeoutMs > 0 && opts.timeoutMs <= maxMs,
    `${label} receives remaining timeoutMs`,
  );
  t.ok(Number.isFinite(opts?.deadlineMs), `${label} receives deadlineMs`);
  t.ok(
    opts?.signal instanceof globalThis.AbortSignal && opts.signal.aborted === false,
    `${label} receives live AbortSignal`,
  );
}

test('Issue 1: settleBeforeDeadline propagates {deadlineMs, timeoutMs, signal} ' +
  'through activateJoinPartitionServiceRows to updateSystemTableRow', async (t) => {
  const harness = createRealJoinActivationHarness(createRegisteredPartitionRow());
  t.teardown(() => harness.cleanup());

  const service1 = {
    initialized: true,
    partitionId: 'p1',
    replicaId: 'p1-r1',
    unifiedAddress: `${NODE_ID}/partition/p1-r1`,
    transportHandler: () => null,
  };
  harness.registerService('p1-r1', service1);
  const owner = harness.joiningService.getDeferredPartitionActivationOwner();
  owner.recordDeferred({
    replicaId: 'p1-r1',
    partitionId: 'p1',
    service: service1,
    expectedReplicaIncarnation: 100,
    error: new Error('initial transient error'),
  });

  await harness.joiningService.awaitDeferredPartitionServiceActivationsForReadySignal({
    timeoutMs: 400,
    retryDelayMs: 10,
  });

  t.equal(harness.writer.reads.length, 1, 'observed authoritative source row once');
  t.equal(harness.writer.updates.length, 1, 'submitted authoritative ACTIVE CAS once');
  assertLiveBudgetOptions(t, harness.writer.reads[0].options, 400, 'observeRegisteredReplica');
  assertLiveBudgetOptions(t, harness.writer.updates[0].writeOptions, 400, 'updateSystemTableRow');
  t.equal(owner.hasPending(), false, 'activation settled cleanly');
  t.equal(harness.joiningService.durableRejoinRestoreState,
    JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED);
});

test('Issue 1: distinguishes pre-submission abort (never submitted) from ' +
  'post-submission abort (uncertain outcome)', async (t) => {
  await t.test('pre-submission abort skips updateSystemTableRow and marks submitted=false',
    async (t) => {
      const harness = createRealJoinActivationHarness(createRegisteredPartitionRow());
      t.teardown(() => harness.cleanup());

      const service1 = {
        initialized: true,
        partitionId: 'p1',
        replicaId: 'p1-r1',
        unifiedAddress: `${NODE_ID}/partition/p1-r1`,
        transportHandler: () => null,
      };
      harness.registerService('p1-r1', service1);
      const controller = new AbortController();
      controller.abort(new Error('deadline already spent'));

      const err = await t.rejects(
        activatePartitionServiceRows({
          nodeId: NODE_ID,
          systemTableWriter: harness.writer,
          replicaStateMachine: harness.stateMachine,
          messageRouter: harness.joiningService.messageRouter,
          partitionServices: new Map([['p1-r1', service1]]),
          expectedReplicaIncarnationByReplicaId: new Map([['p1-r1', 100]]),
          timeoutMs: 100,
          deadlineMs: Date.now() + 100,
          signal: controller.signal,
        }),
        {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
      );
      t.equal(harness.writer.updates.length, 0, 'mutation was never submitted');
      t.equal(err.submitted, false, 'marks submitted=false');
      t.equal(err.abortedBeforeSubmission, true, 'marks abortedBeforeSubmission=true');
      t.equal(err.outcomeUncertain, false, 'pre-submission abort outcome is certain (not submitted)');
    });

  await t.test('post-submission abort after write started marks submitted=true and uncertain',
    async (t) => {
      const writeEntered = Promise.withResolvers();
      const writeReleased = Promise.withResolvers();
      const harness = createRealJoinActivationHarness(createRegisteredPartitionRow(), {
        async onUpdate() {
          writeEntered.resolve();
          await writeReleased.promise;
          throw new Error('transport aborted after submission');
        },
      });
      t.teardown(() => harness.cleanup());

      const service1 = {
        initialized: true,
        partitionId: 'p1',
        replicaId: 'p1-r1',
        unifiedAddress: `${NODE_ID}/partition/p1-r1`,
        transportHandler: () => null,
      };
      harness.registerService('p1-r1', service1);
      const controller = new AbortController();

      const pending = activatePartitionServiceRows({
        nodeId: NODE_ID,
        systemTableWriter: harness.writer,
        replicaStateMachine: harness.stateMachine,
        messageRouter: harness.joiningService.messageRouter,
        partitionServices: new Map([['p1-r1', service1]]),
        expectedReplicaIncarnationByReplicaId: new Map([['p1-r1', 100]]),
        timeoutMs: 500,
        deadlineMs: Date.now() + 500,
        signal: controller.signal,
      });
      await writeEntered.promise;
      controller.abort(new Error('budget expired while mutation was in flight'));
      writeReleased.resolve();

      const err = await t.rejects(
        pending,
        {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
      );
      t.equal(harness.writer.updates.length, 1, 'mutation was submitted once');
      t.equal(err.submitted, true, 'marks submitted=true');
      t.equal(err.abortedBeforeSubmission, false, 'marks abortedBeforeSubmission=false');
      t.equal(err.abortedAfterSubmission, true, 'marks abortedAfterSubmission=true');
      t.equal(err.outcomeUncertain, true, 'marks committed outcome uncertain');
    });
});

test('Issue 1 held-activation overlap regression: holding pass 1 in flight, ' +
  'expiring settleBeforeDeadline, starting pass 2, then releasing pass 1 ' +
  'admits no stale activation or overlapping ownership', async (t) => {
  await t.test('same replica: pass 1 held write commits late after timeout; pass 2 serializes ' +
    'and adopts truth without overlapping writes or stale admission', async (t) => {
    const pass1Entered = Promise.withResolvers();
    const pass1Release = Promise.withResolvers();
    let pass1Signal = null;
    const harness = createRealJoinActivationHarness(createRegisteredPartitionRow(), {
      async onUpdate(entry, applyUpdate) {
        if (entry.index === 1) {
          pass1Signal = entry.writeOptions?.signal || null;
          pass1Entered.resolve();
          await pass1Release.promise;
          const applied = applyUpdate();
          return {
            success: true,
            outcome: applied ? 'applied' : 'observed_state_changed',
            partitionResult: {affectedRows: applied ? 1 : 0},
          };
        }
        return undefined;
      },
    });
    t.teardown(() => harness.cleanup());

    const service1 = {
      initialized: true,
      partitionId: 'p1',
      replicaId: 'p1-r1',
      unifiedAddress: `${NODE_ID}/partition/p1-r1`,
      transportHandler: () => null,
    };
    harness.registerService('p1-r1', service1);
    const owner = harness.joiningService.getDeferredPartitionActivationOwner();
    owner.recordDeferred({
      replicaId: 'p1-r1',
      partitionId: 'p1',
      service: service1,
      expectedReplicaIncarnation: 100,
      error: new Error('initial transient error'),
    });

    // Pass 1 starts and holds inside updateSystemTableRow until settleBeforeDeadline expires.
    const pass1Wait = harness.joiningService
      .awaitDeferredPartitionServiceActivationsForReadySignal({
        timeoutMs: 40,
        retryDelayMs: 10,
      });
    await pass1Entered.promise;
    t.ok(pass1Signal instanceof globalThis.AbortSignal && pass1Signal.aborted === false,
      'pass 1 received live AbortSignal');

    await t.rejects(
      pass1Wait,
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
      'pass 1 expires strictly at deadline',
    );
    t.equal(pass1Signal.aborted, true, 'expiring settleBeforeDeadline aborts pass 1 signal');
    t.equal(owner.hasPending(), true, 'p1-r1 remains pending after pass 1 expiry');

    // Start pass 2 while pass 1 is STILL held inside updateSystemTableRow.
    const pass2Wait = harness.joiningService
      .awaitDeferredPartitionServiceActivationsForReadySignal({
        timeoutMs: 1000,
        retryDelayMs: 10,
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    t.equal(harness.writer.updates.length, 1,
      'pass 2 does not overlap a concurrent write while pass 1 holds the replica lane');

    // Release pass 1 late (its write actually committed on the server).
    pass1Release.resolve();
    await pass2Wait;

    t.equal(harness.writer.updates.length, 1,
      'pass 2 observed committed ACTIVE row and issued no duplicate write');
    t.equal(owner.hasPending(), false, 'pass 2 settled pending activation cleanly');
    t.equal(harness.joiningService.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED);
    const installed = harness.stateMachine.getState('p1-r1');
    t.equal(installed?.state, SERVICE_STATUS.ACTIVE);
    t.equal(installed?.createdAt, 100);
    t.equal(installed?.durableVersion, 101);
  });

  await t.test('superseded lifecycle: releasing old held pass 1 after service2 (incarnation 200) ' +
    'starts pass 2 never admits stale incarnation 100 or clears service2', async (t) => {
    const pass1Entered = Promise.withResolvers();
    const pass1Release = Promise.withResolvers();
    let pass1Signal = null;
    const harness = createRealJoinActivationHarness(
      createRegisteredPartitionRow({created_at: 100, state_entered_at: 100, updated_at: 100}),
      {
        async onUpdate(entry, applyUpdate) {
          if (entry.index === 1) {
            pass1Signal = entry.writeOptions?.signal || null;
            pass1Entered.resolve();
            await pass1Release.promise;
            // Even if old pass 1's transport returns a stale applied reply, it must be rejected.
            return {
              success: true,
              outcome: 'applied',
              partitionResult: {affectedRows: 1},
            };
          }
          const applied = applyUpdate();
          return {
            success: true,
            outcome: applied ? 'applied' : 'observed_state_changed',
            partitionResult: {affectedRows: applied ? 1 : 0},
          };
        },
      },
    );
    t.teardown(() => harness.cleanup());

    const service1 = {
      initialized: true,
      partitionId: 'p1',
      replicaId: 'p1-r1',
      unifiedAddress: `${NODE_ID}/partition/p1-r1`,
      transportHandler: () => 'svc-1',
    };
    const service2 = {
      initialized: true,
      partitionId: 'p1',
      replicaId: 'p1-r1',
      unifiedAddress: `${NODE_ID}/partition/p1-r1`,
      transportHandler: () => 'svc-2',
    };
    harness.registerService('p1-r1', service1);
    const owner = harness.joiningService.getDeferredPartitionActivationOwner();
    owner.recordDeferred({
      replicaId: 'p1-r1',
      partitionId: 'p1',
      service: service1,
      expectedReplicaIncarnation: 100,
      error: new Error('initial transient error'),
    });

    const pass1Wait = harness.joiningService
      .awaitDeferredPartitionServiceActivationsForReadySignal({
        timeoutMs: 40,
        retryDelayMs: 10,
      });
    await pass1Entered.promise;
    await t.rejects(
      pass1Wait,
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
    );
    t.equal(pass1Signal?.aborted, true, 'pass 1 signal aborted at deadline');

    // Supersede service1 with service2 (new incarnation 200) and start pass 2.
    harness.retireServiceHandler(service1);
    harness.registerService('p1-r1', service2);
    harness.writer.setRow(createRegisteredPartitionRow({
      created_at: 200,
      state_entered_at: 200,
      updated_at: 200,
    }));
    owner.recordDeferred({
      replicaId: 'p1-r1',
      partitionId: 'p1',
      service: service2,
      expectedReplicaIncarnation: 200,
      error: new Error('new incarnation pending activation'),
    });

    const pass2Wait = harness.joiningService
      .awaitDeferredPartitionServiceActivationsForReadySignal({
        timeoutMs: 1000,
        retryDelayMs: 10,
      });

    // Release old held pass 1 while pass 2 is active.
    pass1Release.resolve();
    await pass2Wait;

    t.equal(harness.writer.updates.length, 2, 'pass 2 executed authoritative CAS for incarnation 200');
    t.equal(harness.writer.updates[1].whereClause.created_at, 200,
      'pass 2 CAS targeted incarnation 200');
    t.equal(harness.writer.row.status, SERVICE_STATUS.ACTIVE);
    t.equal(harness.writer.row.created_at, 200);
    t.equal(harness.writer.row.state_entered_at, 201);
    const installed = harness.stateMachine.getState('p1-r1');
    t.equal(installed?.createdAt, 200,
      'replica state machine holds ONLY incarnation 200, never stale incarnation 100');
    t.equal(installed?.durableVersion, 201);
    t.equal(owner.hasPending(), false, 'service2 settled cleanly');
    t.equal(harness.joiningService.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED);
  });
});
