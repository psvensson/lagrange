import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';
import {
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  COLUMN,
  NODE_STATE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {NODE_SERVICE_EVENT} from '../../src/node/node-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const NODE_ID = 'durable-rejoin-owner-handoff-node';
const NODE_ADDRESS = 'ws://localhost:9197';
const SEED_ADDRESS = 'http://localhost:8080';
const JOIN_SESSION_ID = 'durable-rejoin-owner-handoff-session';

function publishMembershipState(calls, state) {
  const cache = NodeService.getInstance().getSystemTableCache();
  const previous = cache.get(TABLES.NODES, NODE_ID);
  const row = {
    ...previous,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
    [COLUMN.STATUS]: state.status,
    [COLUMN.CONNECTION_STATE]: state.connectionState,
    [COLUMN.UPDATED_AT]: Date.now(),
  };
  cache.applySystemTableChange(TABLES.NODES, 'UPSERT', row);
  calls.membershipTransitions.push({
    status: row[COLUMN.STATUS],
    connectionState: row[COLUMN.CONNECTION_STATE],
  });
  return row;
}

function stubDurableRejoin(service, calls, options = {}) {
  const attempt = options.attempt || 'unknown';
  let readinessFailuresRemaining =
    Number.isInteger(options.readinessFailures) ?
      options.readinessFailures :
      0;
  service.phaseContactSeed = async () => {
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      systemTableSnapshots: {},
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-owner-handoff',
        replicaCount: 1,
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    service.messageRouter = {
      deliver: async () => ({acknowledged: true}),
      setExternalAdmissionEnabled() {},
    };
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {
    service.messageGroupServices.set('mg-owner-handoff-r0', {
      isLeaderReplica: () => true,
      getLeaderId: () => 'mg-owner-handoff-r0',
      completeJoinConvergence() {},
    });
  };
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {};
  service.initializeJoinInfrastructure = async () => {
    calls.infrastructure.push(attempt);
    service.rpcClient = {
      async shutdown() {},
    };
    service.cdcIntegrationService = {};
    service.heartbeatService = {
      setNodeStateReporter() {},
      start() {},
      stop() {},
    };
    service.latencyTopology = {};
  };
  service.notifyLocalAdminRuntimeReady = async () => {};
  service.phaseQuerySystemState = async () => {
    calls.membership.push(attempt);
    await service.querySystemStatePhase.hydrateSystemCacheFromBootstrap();
    publishMembershipState(calls, {
      status: NODE_STATE.JOINING,
      connectionState: STATE.CONNECTED,
    });
  };
  const nodeRegistrationOwner =
    service.querySystemStatePhase.nodeRegistrationOwner;
  const withdrawalGateway = {
    async updateSystemTableRow(tableName, whereClause, data) {
      calls.withdrawalTables.push(tableName);
      if (tableName === TABLES.NODES) {
        calls.withdrawals.push({
          attempt,
          registeredNodeId: whereClause[COLUMN.NODE_ID],
        });
        publishMembershipState(calls, {
          status: data[COLUMN.STATUS],
          connectionState: data[COLUMN.CONNECTION_STATE],
        });
      }
      return {success: true};
    },
  };
  nodeRegistrationOwner.getJoinAdmissionControlPlaneSystemTableGateway =
    () => withdrawalGateway;
  const productionWithdraw =
    nodeRegistrationOwner.withdrawFailedJoinAdmission
      .bind(nodeRegistrationOwner);
  nodeRegistrationOwner.withdrawFailedJoinAdmission = async (withdrawOptions) => {
    calls.withdrawalOwnerCalls.push(withdrawOptions);
    try {
      return await productionWithdraw(withdrawOptions);
    } catch (error) {
      calls.withdrawalErrors.push(error.message);
      throw error;
    }
  };
  service.activateMessageGroupServiceRows = async () => {
    calls.messageGroupRows.push(attempt);
  };
  service.joinReadinessEvaluator
    .waitForCanonicalJoinReadinessConvergence = async () => {
      calls.readiness.push(attempt);
      calls.sharedLifecycleOwners.push(
        NodeService.getInstance().getLifecycleStateMachine() ===
          service.getLifecycleStateMachine(),
      );
      const membershipRow = NodeService.getInstance()
        .getSystemTableCache()
        .get(TABLES.NODES, NODE_ID);
      calls.readinessMembershipStates.push({
        status: membershipRow?.[COLUMN.STATUS] || null,
        connectionState:
          membershipRow?.[COLUMN.CONNECTION_STATE] || null,
      });
      if (
        membershipRow?.[COLUMN.STATUS] !== NODE_STATE.JOINING ||
        membershipRow?.[COLUMN.CONNECTION_STATE] !== STATE.CONNECTED
      ) {
        const error = new Error(
          'outer reattempt reached readiness with withdrawn membership',
        );
        error.retryable = false;
        throw error;
      }
      if (readinessFailuresRemaining > 0) {
        readinessFailuresRemaining -= 1;
        const error = new Error('canonical readiness retry witness');
        error.code = 'JOIN_READINESS_TIMEOUT';
        error.deferRetry = true;
        throw error;
      }
    };
  service.signalReadyForReplicas = async () => {
    calls.readySignal += 1;
    publishMembershipState(calls, {
      status: NODE_STATE.ACTIVE,
      connectionState: STATE.CONNECTED,
    });
  };
  service.hasActiveControlPlaneBackgroundWriters = () => calls.writers > 0;
  service.activateControlPlaneBackgroundWriters = () => {
    calls.writerLifecycleStates.push(
      NodeService.getInstance().getLifecycleState(),
    );
    calls.writerMembershipStates.push(
      NodeService.getInstance()
        .getSystemTableCache()
        .get(TABLES.NODES, NODE_ID)?.[COLUMN.STATUS] || null,
    );
    calls.writers += 1;
  };
  service.startLatencyTopologyLifecycle = () => {};
  service.createMessageGroupPhase.flushDeferredCreateSelfHostedMetadata =
    async () => {};
}

test('durable rejoin outer reattempt hands the canonical lifecycle owner to ' +
  'its retry session', async (t) => {
  initializeTestEnvironment();

  const durableStorage = new Map();
  const calls = {
    infrastructure: [],
    membership: [],
    messageGroupRows: [],
    readiness: [],
    readySignal: 0,
    writers: 0,
    sharedLifecycleOwners: [],
    lifecycleTransitions: [],
    writerLifecycleStates: [],
    writerMembershipStates: [],
    readinessMembershipStates: [],
    membershipTransitions: [],
    withdrawals: [],
    withdrawalTables: [],
    withdrawalOwnerCalls: [],
    withdrawalErrors: [],
  };
  const nodeService = NodeService.getInstance();
  nodeService.on(NODE_SERVICE_EVENT.LIFECYCLE_STATE_CHANGE, (event) => {
    calls.lifecycleTransitions.push(event.to);
  });

  const firstJoinSessionStore = new JoinSessionStore({
    storage: durableStorage,
    now: () => Date.now(),
  });
  const exhaustedService = new NodeJoiningService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    seedNodeAddress: SEED_ADDRESS,
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    joinSessionId: JOIN_SESSION_ID,
    joinSessionStore: firstJoinSessionStore,
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: 1,
      retryableFailureResumeBaseDelayMs: 1,
      retryableFailureResumeMaxDelayMs: 1,
    },
  });
  stubDurableRejoin(exhaustedService, calls, {
    attempt: 'outer-1',
    readinessFailures: 1,
  });

  const failure = await exhaustedService.join();
  const exhaustedLifecycle =
    exhaustedService.getLifecycleStateMachine();
  const failedSession = await firstJoinSessionStore.loadSession({
    nodeId: NODE_ID,
    sessionId: JOIN_SESSION_ID,
  });

  t.equal(failure.success, false, 'the prior retryable join should be exhausted');
  t.equal(failure.retryable, true,
    'the readiness failure should remain eligible for an outer reattempt');
  t.equal(failedSession?.checkpoint, JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
    'attempt one should durably complete membership before readiness fails');
  t.equal(exhaustedLifecycle.getState(), 'stopped',
    'terminal join cleanup should stop its lifecycle owner');
  t.equal(nodeService.isInitialized(), true,
    'production join cleanup retains the initialized NodeService singleton');
  t.equal(nodeService.getLifecycleStateMachine(), exhaustedLifecycle,
    'NodeService should still identify the exact exhausted owner');
  t.same(calls.withdrawals, [{
    attempt: 'outer-1',
    registeredNodeId: NODE_ID,
  }], 'terminal cleanup should withdraw the registered membership once');
  t.same(calls.withdrawalOwnerCalls, [{registeredNodeId: NODE_ID}],
    'cleanup should invoke the production withdrawal owner with the exact node');
  t.same(calls.withdrawalErrors, [],
    'the production withdrawal owner should complete without fallback');
  t.same(calls.withdrawalTables, [TABLES.NODES, TABLES.NODE_ENDPOINTS],
    'the production withdrawal owner should stop membership and its node endpoint');
  t.match(
    nodeService.getSystemTableCache().get(TABLES.NODES, NODE_ID),
    {
      [COLUMN.STATUS]: NODE_STATE.STOPPED,
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
    },
    'the first outer attempt should leave real withdrawal state behind',
  );

  const unknownOwnerService = new NodeJoiningService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    seedNodeAddress: SEED_ADDRESS,
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
  });
  unknownOwnerService.getLifecycleStateMachine().transition('connecting');
  unknownOwnerService.getLifecycleStateMachine().transition('stopped');
  t.throws(
    () => new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: SEED_ADDRESS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      previousLifecycleStateMachine:
        unknownOwnerService.getLifecycleStateMachine(),
    }),
    /Join retry could not restore the canonical lifecycle owner binding/,
    'an unknown stopped predecessor must fail closed instead of stealing ownership',
  );
  t.equal(nodeService.getLifecycleStateMachine(), exhaustedLifecycle,
    'a rejected predecessor must leave the canonical binding unchanged');

  const resumedJoinSessionStore = new JoinSessionStore({
    storage: durableStorage,
    now: () => Date.now(),
  });
  const service = new NodeJoiningService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    seedNodeAddress: SEED_ADDRESS,
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    previousLifecycleStateMachine: exhaustedLifecycle,
    joinSessionStore: resumedJoinSessionStore,
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeBaseDelayMs: 1,
      retryableFailureResumeMaxDelayMs: 1,
    },
  });
  t.equal(nodeService.getLifecycleStateMachine(),
    service.getLifecycleStateMachine(),
    'construction should hand off the exact predecessor before join work');
  stubDurableRejoin(service, calls, {
    attempt: 'outer-2',
    readinessFailures: 1,
  });

  const result = await service.join();
  const session = await resumedJoinSessionStore.loadSession({
    nodeId: NODE_ID,
    sessionId: JOIN_SESSION_ID,
  });

  t.equal(result.success, true, 'the durable rejoin retry should remain alive');
  t.equal(service.joinSessionId, JOIN_SESSION_ID,
    'the outer reattempt should resolve the same durable join session');
  t.same(calls.sharedLifecycleOwners, [true, true, true],
    'both outer attempts and the inner retry should share their canonical owner');
  t.same(calls.lifecycleTransitions.slice(-5), [
    'stopped',
    'connecting',
    'discovering',
    'joining',
    'ready',
  ], 'the inner retry should reconstruct lifecycle before READY');
  t.same(calls.writerLifecycleStates, ['ready'],
    'steady-state writers should activate only after canonical READY');
  t.same(calls.writerMembershipStates, [NODE_STATE.ACTIVE],
    'steady-state writers should observe restored active membership');
  t.same(calls.infrastructure, ['outer-1', 'outer-2'],
    'the new process-local owner should reconstruct cleaned infrastructure once');
  t.same(calls.membership, ['outer-1', 'outer-2'],
    'outer retry should restore membership invalidated by terminal cleanup once');
  t.same(calls.messageGroupRows, ['outer-1', 'outer-2'],
    'membership restoration should reactivate its message-group rows once');
  t.same(calls.readiness, ['outer-1', 'outer-2', 'outer-2'],
    'the outer reattempt should resume at readiness and survive one inner retry');
  t.same(calls.readinessMembershipStates, [
    {status: NODE_STATE.JOINING, connectionState: STATE.CONNECTED},
    {status: NODE_STATE.JOINING, connectionState: STATE.CONNECTED},
    {status: NODE_STATE.JOINING, connectionState: STATE.CONNECTED},
  ], 'readiness must never run against withdrawn membership');
  t.same(calls.membershipTransitions, [
    {status: NODE_STATE.JOINING, connectionState: STATE.CONNECTED},
    {status: NODE_STATE.STOPPED, connectionState: STATE.DISCONNECTED},
    {status: NODE_STATE.JOINING, connectionState: STATE.CONNECTED},
    {status: NODE_STATE.ACTIVE, connectionState: STATE.CONNECTED},
  ], 'membership should register, withdraw, restore, and publish active exactly once');
  t.match(calls, {
    readySignal: 1,
    writers: 1,
  }, 'only the successful resumed attempt should finalize steady-state work');
  t.equal(nodeService.getLifecycleStateMachine(),
    service.getLifecycleStateMachine(),
    'NodeService should remain bound to the active durable-rejoin owner');
  t.equal(service.getLifecycleStateMachine().getState(), 'ready',
    'the canonical lifecycle should finish READY');
  t.equal(session?.checkpoint, JOIN_CHECKPOINT.FINALIZED,
    'one durable join session should reach FINALIZED');
});

test('entrypoint outer reattempt carries the exact lifecycle predecessor',
  (t) => {
    const source = readFileSync('src/index.js', 'utf8');

    t.match(
      source,
      /previousLifecycleStateMachine:\s*options\._previousLifecycleStateMachine \|\| null/,
      'join construction should consume only the explicit predecessor token',
    );
    t.match(
      source,
      /_previousLifecycleStateMachine:\s*nodeJoiningService\.getLifecycleStateMachine\(\)/,
      'recursive reattempt should pass the exact exhausted join owner',
    );
    t.end();
  });
