import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapReadinessOwner} from
  '../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {NodeService} from '../../src/node/node-service.js';
import {STARTUP_JOIN_MODE} from
  '../../src/bootstrap/rejoin-hints-constants.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const READINESS_PHASE = 'joining:readiness-convergence';
const READINESS_CHECKPOINT = 'READY_LEASE_ASSIGNED';
const JOIN_CHECKPOINT_COUNT = 5;

function buildNodeStats() {
  return {
    cpu: {count: 4, usagePercent: 10},
    memory: {totalBytes: 1024, usagePercent: 20},
    diskGb: 100,
    diskUsagePercent: 30,
  };
}

function projectHandoff(handoff) {
  const readinessOwner = new BootstrapReadinessOwner({
    delegates: {
      getBootstrapService: () => ({
        getSeedContactDiagnosticsSnapshot: () => null,
        getStartupRuntimeHandoffSnapshot: () => handoff,
      }),
    },
  });
  const response = {};
  readinessOwner.appendStartupRuntimeHandoffFields(response);
  return response.startupRuntimeHandoff;
}

test('NodeJoiningService projects the ordered ready-signal gate witness',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'restart-progress-witness',
      nodeAddress: 'ws://localhost:19090',
      seedNodeAddress: 'http://localhost:18080',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.phase = READINESS_PHASE;
    service.recordInfrastructureJoinCheckpointTarget(READINESS_CHECKPOINT);

    const observed = [];
    const capture = () => {
      observed.push(service.getStartupRuntimeHandoffSnapshot());
    };
    service.awaitCdcSubscriptionsForReadiness = async () => capture();
    service.awaitLocalQueryTransportReadinessForReadySignal =
      async () => capture();
    service.awaitMetadataPublicationReadinessForReadySignal =
      async () => capture();
    service.awaitOperationLedgerFormationBarrier = async () => capture();
    service.heartbeatService = {
      sendHeartbeat: async () => capture(),
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({getNodeStats: async () => buildNodeStats()});
    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.same(
      observed.map((snapshot) => snapshot.joinReadySignalGate),
      [
        'cdc_subscription',
        'local_query_transport',
        'metadata_publication',
        'operation_ledger_formation',
        'heartbeat_publication',
      ],
      'the witness follows the existing ready-signal execution order',
    );
    for (const snapshot of observed) {
      t.equal(snapshot.startupBranch, STARTUP_JOIN_MODE.DURABLE_REJOIN);
      t.equal(snapshot.infrastructureJoinComplete, false);
      t.equal(snapshot.joinPhase, READINESS_PHASE);
      t.equal(snapshot.joinLifecycleState, 'starting');
      t.equal(snapshot.joinCheckpointTarget, READINESS_CHECKPOINT);
      t.equal(snapshot.joinReadySignalAttempt, 1);
      t.equal(snapshot.joinReadySignalLastFailureCode, null);
    }
    t.end();
  });

test('join checkpoint steps publish their live checkpoint targets',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'restart-checkpoint-witness',
      nodeAddress: 'ws://localhost:19092',
      seedNodeAddress: 'http://localhost:18082',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.runJoinInfrastructurePhases = async () => {};
    service.advanceLifecycleAfterResumedInfrastructure = () => {};
    service.activateMessageGroupServiceRows = async () => {};
    service.signalReadyForReplicas = async () => {};
    service.completeSuccessfulJoin = () => {};

    const steps = service.buildJoinCheckpointSteps(
      {run: async () => {}},
      {segments: {}},
    );
    t.equal(steps.length, JOIN_CHECKPOINT_COUNT);
    for (const step of steps) {
      service.infrastructureJoinProgress.checkpointTarget = null;
      await step.run();
      t.equal(
        service.getStartupRuntimeHandoffSnapshot().joinCheckpointTarget,
        step.checkpoint,
        `the ${step.checkpoint} producer publishes its own target`,
      );
    }
    t.end();
  });

test('bootstrap readiness projects only own join-progress data', (t) => {
  const valid = projectHandoff({
    startupBranch: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    infrastructureJoinComplete: false,
    joinPhase: READINESS_PHASE,
    joinLifecycleState: 'joining',
    joinCheckpointTarget: READINESS_CHECKPOINT,
    joinReadySignalGate: 'metadata_publication',
    joinReadySignalAttempt: 4,
    joinReadySignalLastFailureCode:
      'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY',
    transactionRecoveryReady: false,
  });
  t.match(valid, {
    joinPhase: READINESS_PHASE,
    joinLifecycleState: 'joining',
    joinCheckpointTarget: READINESS_CHECKPOINT,
    joinReadySignalGate: 'metadata_publication',
    joinReadySignalAttempt: 4,
    joinReadySignalLastFailureCode:
      'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY',
  });

  const inherited = Object.create({
    joinPhase: 'fabricated',
    joinLifecycleState: 'ready',
    joinCheckpointTarget: 'FINALIZED',
    joinReadySignalGate: 'heartbeat_publication',
    joinReadySignalAttempt: 99,
    joinReadySignalLastFailureCode: 'none',
  });
  inherited.startupBranch = STARTUP_JOIN_MODE.DURABLE_REJOIN;
  inherited.infrastructureJoinComplete = false;
  inherited.transactionRecoveryReady = false;
  const inheritedProjection = projectHandoff(inherited);
  t.notOk(
    Object.hasOwn(inheritedProjection, 'joinPhase'),
    'inherited progress cannot fabricate the join-progress block',
  );

  let accessorReads = 0;
  const accessor = {
    startupBranch: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    infrastructureJoinComplete: false,
    joinPhase: READINESS_PHASE,
    transactionRecoveryReady: false,
  };
  Object.defineProperty(accessor, 'joinReadySignalGate', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'heartbeat_publication';
    },
  });
  t.equal(
    projectHandoff(accessor).joinReadySignalGate,
    null,
    'an accessor inside a legitimate progress block is rejected',
  );
  t.equal(accessorReads, 0, 'the readiness projection never executes accessors');

  const seedProjection = projectHandoff({
    startupBranch: STARTUP_JOIN_MODE.SEED,
    infrastructureJoinComplete: false,
    transactionRecoveryReady: false,
  });
  t.notOk(
    Object.hasOwn(seedProjection, 'joinPhase'),
    'seed handoff shape remains free of join-only progress fields',
  );
  t.end();
});

test('join progress rejects unsafe attempts and poisoned intrinsics', (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'restart-hostile-attempt-witness',
    nodeAddress: 'ws://localhost:19093',
    seedNodeAddress: 'http://localhost:18083',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
  });
  const originalIsSafeInteger = Number.isSafeInteger;
  const originalIsFinite = Number.isFinite;
  const originalFloor = Math.floor;
  let invalidAttempts;
  let validAttempt;
  try {
    Number.isSafeInteger = () => true;
    Number.isFinite = () => true;
    Math.floor = () => 7;
    invalidAttempts = [
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      -1,
      1.5,
      true,
      Object(3),
    ].map((attempt) => {
      service.recordInfrastructureJoinReadySignalProgress({
        gate: 'heartbeat_publication',
        attempt,
      });
      return service.getStartupRuntimeHandoffSnapshot()
        .joinReadySignalAttempt;
    });
    service.recordInfrastructureJoinReadySignalProgress({
      gate: 'heartbeat_publication',
      attempt: 4,
    });
    validAttempt = service.getStartupRuntimeHandoffSnapshot()
      .joinReadySignalAttempt;
  } finally {
    Number.isSafeInteger = originalIsSafeInteger;
    Number.isFinite = originalIsFinite;
    Math.floor = originalFloor;
  }
  t.same(
    invalidAttempts,
    Array.from({length: invalidAttempts.length}, () => null),
  );
  t.equal(validAttempt, 4, 'the module-load safe-integer intrinsic is used');
  t.end();
});

test('join failure codes require own data properties', (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'restart-hostile-failure-witness',
    nodeAddress: 'ws://localhost:19094',
    seedNodeAddress: 'http://localhost:18084',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
  });
  const inherited = Object.create({code: 'FABRICATED_INHERITED_CODE'});
  let accessorReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'code', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'FABRICATED_ACCESSOR_CODE';
    },
  });
  const owned = {code: 'OWNED_FAILURE_CODE'};

  t.equal(service.resolveInfrastructureJoinFailureCode(inherited), null);
  t.equal(service.resolveInfrastructureJoinFailureCode(accessor), null);
  t.equal(accessorReads, 0, 'failure-code normalization never runs accessors');
  t.equal(
    service.resolveInfrastructureJoinFailureCode(owned),
    'OWNED_FAILURE_CODE',
  );
  t.end();
});

test('NodeJoiningService retains the current ready-signal retry failure',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'restart-progress-retry',
      nodeAddress: 'ws://localhost:19091',
      seedNodeAddress: 'http://localhost:18081',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      config: {
        readySignalMaxAttempts: 2,
        readySignalRetryDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
    });
    service.phase = READINESS_PHASE;
    service.recordInfrastructureJoinCheckpointTarget(READINESS_CHECKPOINT);
    service.awaitCdcSubscriptionsForReadiness = async () => {};
    service.awaitLocalQueryTransportReadinessForReadySignal = async () => {};
    service.awaitMetadataPublicationReadinessForReadySignal = async () => {};
    service.awaitOperationLedgerFormationBarrier = async () => {};

    let attempt = 0;
    let retrySnapshot = null;
    service.sleep = async () => {
      retrySnapshot = service.getStartupRuntimeHandoffSnapshot();
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        attempt += 1;
        if (attempt === 1) {
          const error = new Error('route unavailable');
          error.code = 'HEARTBEAT_ROUTE_UNAVAILABLE';
          throw error;
        }
      },
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({getNodeStats: async () => buildNodeStats()});
    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(retrySnapshot.joinReadySignalGate, 'heartbeat_publication');
    t.equal(retrySnapshot.joinReadySignalAttempt, 1);
    t.equal(
      retrySnapshot.joinReadySignalLastFailureCode,
      'HEARTBEAT_ROUTE_UNAVAILABLE',
    );
    const completed = service.getStartupRuntimeHandoffSnapshot();
    t.equal(completed.joinReadySignalAttempt, 2);
    t.equal(completed.joinReadySignalLastFailureCode, null);
    t.end();
  });
