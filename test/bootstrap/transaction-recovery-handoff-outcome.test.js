/**
 * transaction-recovery-poison-row-invariant guard: when distributed
 * transaction replay stops short of completion or fails, the startup runtime
 * handoff must publish a typed transaction_recovery_incomplete outcome on the
 * readiness surface — carrying the exact failed decision dimension and the
 * route source — and must never mint a recovery-ready witness over that
 * incomplete replay.
 *
 * The current handoff surface reports only transactionRecoveryState /
 * transactionRecoveryReady and drops the recorded errorCode/errorMessage, so
 * a failure-classification consumer cannot distinguish a poison-row fatal
 * from generic admission load. These guards pin the sealed contract and go
 * red until the owner publishes the typed outcome.
 */

import {test} from '../../src/test-helpers/tap.js';
import {StartupRuntimeHandoffOwner} from
  '../../src/bootstrap/owners/startup-runtime-handoff-owner.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {BootstrapReadinessOwner} from
  '../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../src/bootstrap/shared/startup-sql-runtime-handoff.js';
import {BOOTSTRAP_API_READINESS_FIELD} from
  '../../src/bootstrap/bootstrap-api-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

const SEED_AUTHORITY_SOURCE = 'http://seed-a:8081';
const JOIN_AUTHORITY_SOURCE = 'http://peer-b:8081';
const POISON_ROW_MESSAGE =
  'Transaction recovery state is incomplete or incompatible';
const RECOVERY_OUTCOME_INCOMPLETE = 'transaction_recovery_incomplete';

function buildTrackingOwner({recoveryError, routeSource}) {
  const owner = new StartupRuntimeHandoffOwner({
    delegates: {
      isShuttingDown: () => false,
      isDistributedTransactionRecoveryAvailable: () => true,
      activateDistributedTransactionRecovery: () => {
        if (recoveryError) {
          throw recoveryError;
        }
        return {totalRecovered: 0, resumed: 0, failed: 0, results: []};
      },
      getRouteSource: () => routeSource,
    },
  });
  return owner;
}

function buildRecoveryError() {
  const error = new Error(POISON_ROW_MESSAGE);
  error.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  return error;
}

test(
  'handoff snapshot publishes a typed transaction_recovery_incomplete ' +
    'outcome with the exact failed decision dimension and route source',
  (t) => {
    const recoveryError = buildRecoveryError();
    recoveryError.decisionDimension = 'frozen_participant_count';
    const owner = buildTrackingOwner({
      recoveryError,
      routeSource: SEED_AUTHORITY_SOURCE,
    });

    t.throws(
      () => owner.activateDistributedTransactionRecovery(),
      {message: POISON_ROW_MESSAGE},
      'the recovery fatal still propagates to its caller',
    );

    const snapshot = owner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      snapshot.outcome?.kind,
      RECOVERY_OUTCOME_INCOMPLETE,
      'the recovery snapshot publishes the typed incomplete outcome kind',
    );
    t.equal(
      snapshot.outcome?.errorCode,
      QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
      'the typed outcome carries the canonical error code',
    );
    t.equal(
      snapshot.outcome?.decisionDimension,
      'frozen_participant_count',
      'the typed outcome names the exact failed decision dimension',
    );
    t.equal(
      snapshot.outcome?.routeSource,
      SEED_AUTHORITY_SOURCE,
      'the typed outcome names the route source that owned the replay path',
    );
    t.equal(
      snapshot.ready,
      false,
      'an incomplete replay never marks the handoff recovery-ready',
    );
    t.end();
  },
);

test(
  'the bootstrap readiness surface projects the typed incomplete outcome ' +
    'instead of a bare not-ready state',
  (t) => {
    const readinessOwner = new BootstrapReadinessOwner({
      delegates: {
        getBootstrapService: () => ({
          getSeedContactStartupAuthoritySnapshot: () => ({
            state: 'ready',
            authorityAvailable: true,
          }),
          getSeedContactDiagnosticsSnapshot: () => ({
            authoritySource: JOIN_AUTHORITY_SOURCE,
          }),
          getStartupRuntimeHandoffSnapshot: () => ({
            startupBranch: 'join',
            infrastructureJoinComplete: true,
            transactionRecoveryState: 'failed',
            transactionRecoveryReady: false,
            transactionRecoveryErrorCode:
              QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
            transactionRecoveryErrorMessage: POISON_ROW_MESSAGE,
            transactionRecoveryOutcome: {
              kind: RECOVERY_OUTCOME_INCOMPLETE,
              errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
              decisionDimension: 'commit_mode',
              routeSource: JOIN_AUTHORITY_SOURCE,
            },
          }),
        }),
      },
    });
    const response = {};

    readinessOwner.appendStartupRuntimeHandoffFields(response);

    const handoff =
      response[BOOTSTRAP_API_READINESS_FIELD.STARTUP_RUNTIME_HANDOFF];
    t.equal(
      handoff?.transactionRecoveryOutcome?.kind,
      RECOVERY_OUTCOME_INCOMPLETE,
      'the readiness probe surface carries the typed incomplete outcome kind',
    );
    t.equal(
      handoff?.transactionRecoveryOutcome?.decisionDimension,
      'commit_mode',
      'the readiness probe surface carries the failed decision dimension',
    );
    t.equal(
      handoff?.transactionRecoveryOutcome?.routeSource,
      JOIN_AUTHORITY_SOURCE,
      'the readiness probe surface carries the route source',
    );
    t.equal(
      handoff?.ready,
      false,
      'the readiness probe never reports handoff ready over incomplete replay',
    );
    t.end();
  },
);

test(
  'a completed replay publishes a ready witness without an incomplete ' +
    'outcome (no false positive on the typed contract)',
  (t) => {
    const owner = buildTrackingOwner({
      recoveryError: null,
      routeSource: SEED_AUTHORITY_SOURCE,
    });

    owner.activateDistributedTransactionRecovery();

    const snapshot = owner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      snapshot.ready,
      true,
      'a clean replay marks the handoff recovery-ready',
    );
    t.equal(
      snapshot.outcome,
      null,
      'a clean replay publishes no incomplete outcome',
    );
    t.end();
  },
);

test(
  'final SQL attachment engages transaction recovery when control-plane ' +
    'background writers are already active',
  async (t) => {
    const recoveryError = buildRecoveryError();
    recoveryError.decisionDimension = 'commit_mode';
    let recoveryActivationCount = 0;
    const startupOwner = {
      activateDistributedTransactionRecovery: null,
    };
    const runtimeHandoffOwner = new StartupRuntimeHandoffOwner({
      delegates: {
        isShuttingDown: () => false,
        getLeaseService: () => ({state: 'running'}),
        getLeaseRunningState: () => 'running',
        getHeartbeatService: () => ({state: 'running'}),
        getHeartbeatRunningState: () => 'running',
        isDistributedTransactionRecoveryAvailable: () => true,
        activateDistributedTransactionRecovery: () => {
          recoveryActivationCount += 1;
          return startupOwner.sqlQueryEngine
            .activateDistributedTransactionRecovery();
        },
        getRouteSource: () => SEED_AUTHORITY_SOURCE,
      },
    });
    startupOwner.activateDistributedTransactionRecovery = () =>
      runtimeHandoffOwner.activateDistributedTransactionRecovery();
    const sqlQueryEngine = {
      activateDistributedTransactionRecovery: async () => ({
        totalRecovered: 0,
        resumed: 0,
        failed: 1,
        results: [],
        error: recoveryError.message,
        errorCode: recoveryError.errorCode,
        decisionDimension: recoveryError.decisionDimension,
      }),
    };

    const recovery = attachSqlRuntimeToStartupOwner({
      owner: startupOwner,
      sqlQueryEngine,
      systemTableCache: null,
    });
    await recovery;

    const snapshot =
      runtimeHandoffOwner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      recoveryActivationCount,
      1,
      'already-active writers do not suppress attachment-owned recovery',
    );
    t.equal(
      snapshot.state,
      'failed',
      'the startup owner records the poison-row replay failure',
    );
    t.equal(
      snapshot.outcome?.decisionDimension,
      'commit_mode',
      'the startup owner retains the failed recovery decision dimension',
    );
    t.equal(
      snapshot.outcome?.routeSource,
      SEED_AUTHORITY_SOURCE,
      'the startup owner retains the canonical seed route source',
    );
    t.equal(
      snapshot.summary?.failed,
      1,
      'the startup owner retains the failed replay summary for diagnostics',
    );
  },
);

test(
  'final SQL runtime attachment engages owner-tracked recovery before ' +
    'steady-state writers become ready',
  async (t) => {
    let recoveryActivationCount = 0;
    const startupOwner = {
      hasActiveControlPlaneBackgroundWriters: () => false,
      activateDistributedTransactionRecovery: null,
    };
    const runtimeHandoffOwner = new StartupRuntimeHandoffOwner({
      delegates: {
        isDistributedTransactionRecoveryAvailable: () => true,
        activateDistributedTransactionRecovery: () => {
          recoveryActivationCount += 1;
          return startupOwner.sqlQueryEngine
            .activateDistributedTransactionRecovery();
        },
        getRouteSource: () => SEED_AUTHORITY_SOURCE,
      },
    });
    startupOwner.activateDistributedTransactionRecovery = () =>
      runtimeHandoffOwner.activateDistributedTransactionRecovery();
    const sqlQueryEngine = {
      activateDistributedTransactionRecovery: async () => ({
        totalRecovered: 0,
        resumed: 0,
        failed: 1,
        results: [],
        error: POISON_ROW_MESSAGE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
        decisionDimension: 'commit_mode',
      }),
    };

    const recovery = attachSqlRuntimeToStartupOwner({
      owner: startupOwner,
      sqlQueryEngine,
      systemTableCache: null,
    });
    await recovery;

    const snapshot =
      runtimeHandoffOwner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      recoveryActivationCount,
      1,
      'final runtime attachment activates recovery without waiting for writers',
    );
    t.equal(
      snapshot.state,
      'failed',
      'the startup owner records the attachment-time poison-row failure',
    );
    t.equal(
      snapshot.outcome?.decisionDimension,
      'commit_mode',
      'the attachment-time failure retains the canonical decision dimension',
    );
  },
);

test(
  'durable-rejoin recovery attributes its typed outcome to the local route',
  async (t) => {
    const localRoute = 'ddb-test-reuse-7-1:8080';
    const service = new NodeJoiningService({
      nodeId: 'restarted-seed',
      nodeAddress: localRoute,
      seedNodeAddress: 'http://ddb-test-reuse-7-2:8080',
    });
    service.cdcIntegrationService = null;
    const sqlQueryEngine = {
      activateDistributedTransactionRecovery: async () => ({
        totalRecovered: 0,
        resumed: 0,
        failed: 1,
        results: [],
        error: POISON_ROW_MESSAGE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
        decisionDimension: 'commit_mode',
      }),
    };

    const recovery = attachSqlRuntimeToStartupOwner({
      owner: service,
      sqlQueryEngine,
      systemTableCache: null,
    });
    await recovery;

    const snapshot =
      service.runtimeHandoffOwner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      snapshot.outcome?.routeSource,
      localRoute,
      'rejoin recovery names the restarted node rather than its seed contact',
    );
    t.equal(
      snapshot.outcome?.decisionDimension,
      'commit_mode',
      'rejoin recovery preserves the canonical poison-row dimension',
    );
  },
);
