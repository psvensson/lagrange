/**
 * Durable-rejoin coverage for the final SQL runtime recovery handoff.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../src/bootstrap/shared/startup-sql-runtime-handoff.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const DURABLE_REJOIN_FINAL_HANDOFF_TEST = Object.freeze({
  name:
    'NodeJoiningService - durable rejoin recovery starts only on final SQL attachment',
  nodeId: 'joining-node-final-runtime-recovery',
  nodeAddress: 'ws://localhost:19103',
  seedAddress: 'http://localhost:8080',
  seedNodeId: 'seed-node-1',
  messageGroupId: 'mg-1',
  poisonMessage: 'durable rejoin poison recovery failure',
  errorCode: 'TRANSACTION_RECOVERY_INCOMPLETE',
  decisionDimension: 'commit_mode',
  functionType: 'function',
  lifecycleConnecting: 'connecting',
  lifecycleDiscovering: 'discovering',
  lifecycleJoining: 'joining',
  failedRecoveryState: 'failed',
  provisionalDormant:
    'join-time recovery attempts must not consume the provisional CDC SQL engine',
  joinCompletionDormant:
    'READY join completion must leave provisional recovery dormant',
  rejectedAttachment:
    'final SQL attachment must return the normalized typed recovery rejection',
  finalActivated:
    'final SQL attachment must activate recovery exactly once on the final engine',
  finalOwnerBinding:
    'the join owner must retain the final SQL engine before recovery activation',
  finalCdcBinding:
    'the CDC integration service must switch to the final SQL engine before recovery activation',
  failedState:
    'the final attachment failure must remain observable on the startup owner',
  failedReadiness:
    'the final attachment failure must keep external readiness closed',
  failedDimension:
    'the final attachment failure must preserve the poison decision dimension',
  failedRoute:
    'the final attachment failure must publish the durable joiner route',
});
const EMPTY_TRANSACTION_RECOVERY_SUMMARY = Object.freeze({
  totalRecovered: 0,
  resumed: 0,
  failed: 0,
  results: Object.freeze([]),
});

test(DURABLE_REJOIN_FINAL_HANDOFF_TEST.name, async (t) => {
  initializeTestEnvironment();

  const cache = new SystemTableCache();
  const service = new NodeJoiningService({
    nodeId: DURABLE_REJOIN_FINAL_HANDOFF_TEST.nodeId,
    nodeAddress: DURABLE_REJOIN_FINAL_HANDOFF_TEST.nodeAddress,
    seedNodeAddress: DURABLE_REJOIN_FINAL_HANDOFF_TEST.seedAddress,
  });

  service.seedNodeId = DURABLE_REJOIN_FINAL_HANDOFF_TEST.seedNodeId;
  service.bootstrapResponse = {systemTableSnapshots: {}};
  service.messageRouter = {
    deliver: async () => ({acknowledged: true, success: true}),
  };
  service.rebalanceCoordinator = {controlPlaneReadinessService: null};
  service.messageGroupServices = new Map([
    [DURABLE_REJOIN_FINAL_HANDOFF_TEST.messageGroupId, {
      getReadOnlyCache: () => cache,
      getWritableCache: () => cache,
      setCdcIntegrationService() {},
    }],
  ]);

  const cdcIntegrationService = service.createCdcIntegrationService();
  const provisionalEngine = cdcIntegrationService.sqlQueryEngine;
  let provisionalActivationCount = 0;
  provisionalEngine.activateDistributedTransactionRecovery = () => {
    provisionalActivationCount += 1;
    return EMPTY_TRANSACTION_RECOVERY_SUMMARY;
  };

  const earlyActivation =
    service.runtimeHandoffOwner.activateDistributedTransactionRecovery();
  t.equal(
    earlyActivation,
    null,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.provisionalDormant,
  );

  service.lifecycleStateMachine.transition(
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.lifecycleConnecting,
  );
  service.lifecycleStateMachine.transition(
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.lifecycleDiscovering,
  );
  service.lifecycleStateMachine.transition(
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.lifecycleJoining,
  );
  service.activateControlPlaneBackgroundWriters = () => {};
  service.createMessageGroupPhase = {
    flushDeferredCreateSelfHostedMetadata() {
      return Promise.resolve({success: true});
    },
  };
  service.startLatencyTopologyLifecycle = () => {};

  service.completeSuccessfulJoin();
  t.equal(
    provisionalActivationCount,
    0,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.joinCompletionDormant,
  );

  const finalEngine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    messageRouter: service.messageRouter,
    nodeId: service.nodeId,
    systemCache: cache,
  });
  const poisonFailure = new Error(
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.poisonMessage,
  );
  poisonFailure.errorCode = DURABLE_REJOIN_FINAL_HANDOFF_TEST.errorCode;
  poisonFailure.decisionDimension =
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.decisionDimension;
  let finalActivationCount = 0;
  finalEngine.activateDistributedTransactionRecovery = () => {
    finalActivationCount += 1;
    throw poisonFailure;
  };

  const attachment = attachSqlRuntimeToStartupOwner({
    owner: service,
    sqlQueryEngine: finalEngine,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: service.messageRouter,
    partitionServicesProvider: () => service.partitionServices,
  });

  t.equal(
    typeof attachment?.then,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.functionType,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.rejectedAttachment,
  );
  await t.rejects(
    attachment,
    poisonFailure,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.rejectedAttachment,
  );
  t.equal(
    finalActivationCount,
    1,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.finalActivated,
  );
  t.equal(
    service.sqlQueryEngine,
    finalEngine,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.finalOwnerBinding,
  );
  t.equal(
    cdcIntegrationService.sqlQueryEngine,
    finalEngine,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.finalCdcBinding,
  );

  const snapshot =
    service.runtimeHandoffOwner.getDistributedTransactionRecoverySnapshot();
  t.equal(
    snapshot.state,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.failedRecoveryState,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.failedState,
  );
  t.equal(
    snapshot.ready,
    false,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.failedReadiness,
  );
  t.equal(
    snapshot.outcome?.decisionDimension,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.decisionDimension,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.failedDimension,
  );
  t.equal(
    snapshot.outcome?.routeSource,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.nodeAddress,
    DURABLE_REJOIN_FINAL_HANDOFF_TEST.failedRoute,
  );

  await provisionalEngine.shutdown();
  await finalEngine.shutdown();
});
