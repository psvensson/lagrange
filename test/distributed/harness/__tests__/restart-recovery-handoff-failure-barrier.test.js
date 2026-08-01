import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCluster} from './cluster-test-helpers.js';
import {
  resolveFailureBarrier,
} from '../failure-bundle-diagnostics-merge.js';
import {
  buildRestartRecoveryStabilityGate,
} from '../failure-bundle-stability-gates.js';

const NODE_ID = 'restart-target';
const SCENARIO = 'rolling-restart';
const RESTART_INFRASTRUCTURE_JOIN = 'restart_infrastructure_join';
const RESTART_STARTUP_AUTHORITY = 'restart_startup_authority';
const RESTART_TRANSACTION_RECOVERY = 'restart_transaction_recovery';
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);

function buildError(overrides = {}) {
  const fields = {
    reachable: true,
    ready: false,
    adminReady: false,
    controlPlaneRecoveryReady: true,
    publishedControlPlaneEpoch: 65,
    expectedPublicationEpoch: 'none',
    readinessPhase: 'DEGRADED',
    readinessStage: 'traffic_ready',
    readinessStageRank: 5,
    readinessReasons: 'none',
    recoveryStage: 'unknown',
    bootstrapJoinProjectionBlocker: 'none',
    bootstrapJoinProjectionRule: 'control_degraded_non_blocking',
    startupPhase: 'none',
    seedContactOutcome: 'none',
    seedContactAttempt: 'none',
    seedContactRemainingBudgetMs: 'none',
    seedContactAuthoritySource: 'none',
    startupBranch: 'durable_rejoin',
    infrastructureJoinComplete: false,
    canonicalAuthorityConsumed: false,
    canonicalAuthorityState: 'none',
    canonicalAuthoritySource: 'seed-a:8080',
    transactionRecoveryState: 'not_started',
    transactionRecoveryReady: false,
    transactionRecoveryOutcomeKind: 'none',
    transactionRecoveryOutcomeErrorCode: 'none',
    transactionRecoveryOutcomeDecisionDimension: 'none',
    transactionRecoveryOutcomeRouteSource: 'none',
    reachableBy: 'bootstrap_health',
    lastError: 'connect ECONNREFUSED 172.18.0.6:8081',
    ...overrides,
  };
  return (
    'Restarted node did not become recovery-ready within 120000ms for node ' +
    NODE_ID +
    ' (' +
    arrayMap(
      Object.entries(fields),
      ([key, value]) => key + '=' + String(value),
    ).join(', ') +
    ')'
  );
}

function resolveBarrier(error) {
  return resolveFailureBarrier({
    entry: {error},
    existingFailure: {},
    publicationConvergence: null,
  });
}

function buildGate(failure) {
  return buildRestartRecoveryStabilityGate({
    entry: {scenario: SCENARIO},
    failure,
  });
}

test('Unit: restart timeout formatter preserves direct handoff evidence', () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  const formatted = cluster._formatRestartRecoveryReadinessObservation({
    reachable: true,
    ready: false,
    adminReady: false,
    controlPlaneRecoveryReady: true,
    startupRuntimeHandoff: {
      startupBranch: 'durable_rejoin',
      infrastructureJoinComplete: true,
      canonicalAuthorityConsumed: true,
      canonicalAuthorityState: 'ready',
      canonicalAuthoritySource: 'seed-a:8080',
      transactionRecoveryState: 'failed',
      transactionRecoveryReady: false,
      transactionRecoveryOutcome: {
        kind: 'transaction_recovery_incomplete',
        errorCode: 'transaction_recovery_incomplete',
        decisionDimension: 'commit_mode',
        routeSource: 'seed-a:8080',
      },
    },
  }, null);

  for (const expected of [
    'startupBranch=durable_rejoin',
    'infrastructureJoinComplete=true',
    'canonicalAuthorityConsumed=true',
    'canonicalAuthorityState=ready',
    'canonicalAuthoritySource=seed-a:8080',
    'transactionRecoveryState=failed',
    'transactionRecoveryReady=false',
    'transactionRecoveryOutcomeKind=transaction_recovery_incomplete',
    'transactionRecoveryOutcomeErrorCode=transaction_recovery_incomplete',
    'transactionRecoveryOutcomeDecisionDimension=commit_mode',
    'transactionRecoveryOutcomeRouteSource=seed-a:8080',
  ]) {
    assert.match(formatted, new RegExp(expected));
  }
});

test('Unit: pre-handoff timeout attributes infrastructure join first', () => {
  const barrier = resolveBarrier(buildError());
  assert.equal(barrier.dominantReason, RESTART_INFRASTRUCTURE_JOIN);
  assert.deepEqual(
    {
      startupBranch: barrier.terminalRecoveryReadiness.startupBranch,
      infrastructureJoinComplete:
        barrier.terminalRecoveryReadiness.infrastructureJoinComplete,
      canonicalAuthorityConsumed:
        barrier.terminalRecoveryReadiness.canonicalAuthorityConsumed,
      transactionRecoveryState:
        barrier.terminalRecoveryReadiness.transactionRecoveryState,
      ownerState: barrier.terminalRecoveryReadiness.ownerState,
      ownerBoundary: barrier.terminalRecoveryReadiness.ownerBoundary,
    },
    {
      startupBranch: 'durable_rejoin',
      infrastructureJoinComplete: false,
      canonicalAuthorityConsumed: false,
      transactionRecoveryState: 'not_started',
      ownerState: RESTART_INFRASTRUCTURE_JOIN,
      ownerBoundary: 'infrastructure_join_completion',
    },
  );
  const gate = buildGate({failureBarrier: barrier});
  assert.equal(gate.status, 'open');
  assert.ok(arrayIncludes(gate.blockers, RESTART_INFRASTRUCTURE_JOIN));
});

test('Unit: post-join timeout attributes missing canonical authority next', () => {
  const barrier = resolveBarrier(buildError({
    infrastructureJoinComplete: true,
  }));
  assert.equal(barrier.dominantReason, RESTART_STARTUP_AUTHORITY);
  assert.equal(
    barrier.terminalRecoveryReadiness.ownerBoundary,
    'startup_authority_consumption',
  );
  assert.ok(
    arrayIncludes(
      buildGate({failureBarrier: barrier}).blockers,
      RESTART_STARTUP_AUTHORITY,
    ),
  );
});

test('Unit: post-authority timeout attributes transaction recovery last', () => {
  const barrier = resolveBarrier(buildError({
    infrastructureJoinComplete: true,
    canonicalAuthorityConsumed: true,
    canonicalAuthorityState: 'ready',
    transactionRecoveryState: 'failed',
    transactionRecoveryOutcomeKind: 'transaction_recovery_incomplete',
    transactionRecoveryOutcomeErrorCode: 'transaction_recovery_incomplete',
    transactionRecoveryOutcomeDecisionDimension: 'commit_mode',
    transactionRecoveryOutcomeRouteSource: 'seed-a:8080',
  }));
  assert.equal(barrier.dominantReason, RESTART_TRANSACTION_RECOVERY);
  assert.equal(
    barrier.terminalRecoveryReadiness.ownerBoundary,
    'transaction_recovery_completion',
  );
  assert.deepEqual(
    barrier.terminalRecoveryReadiness.transactionRecoveryOutcome,
    {
      kind: 'transaction_recovery_incomplete',
      errorCode: 'transaction_recovery_incomplete',
      decisionDimension: 'commit_mode',
      routeSource: 'seed-a:8080',
    },
  );
  assert.ok(
    arrayIncludes(
      buildGate({failureBarrier: barrier}).blockers,
      RESTART_TRANSACTION_RECOVERY,
    ),
  );
});

test('Unit: state-only pending recovery cannot be masked as recovered', () => {
  const barrier = resolveBarrier(buildError({
    infrastructureJoinComplete: true,
    canonicalAuthorityConsumed: true,
    canonicalAuthorityState: 'ready',
    transactionRecoveryState: 'pending',
    transactionRecoveryReady: 'none',
  }));
  assert.equal(barrier.dominantReason, RESTART_TRANSACTION_RECOVERY);
  assert.equal(
    barrier.terminalRecoveryReadiness.ownerBoundary,
    'transaction_recovery_completion',
  );
});

test('Unit: legacy timeout with missing handoff fields stays unknown', () => {
  const barrier = resolveBarrier(
    'Restarted node did not become recovery-ready within 120000ms for node ' +
      NODE_ID +
      ' (reachable=true, ready=false, adminReady=false, ' +
      'controlPlaneRecoveryReady=true, reachableBy=bootstrap_health, ' +
      'lastError=connect ECONNREFUSED 172.18.0.6:8081)',
  );
  assert.equal(barrier.dominantReason, 'restart_recovery_timeout');
  assert.equal(barrier.terminalRecoveryReadiness.ownerState, null);
  assert.equal(
    barrier.terminalRecoveryReadiness.infrastructureJoinComplete,
    null,
  );
  assert.deepEqual(
    {
      startupBranch: barrier.terminalRecoveryReadiness.startupBranch,
      canonicalAuthorityState:
        barrier.terminalRecoveryReadiness.canonicalAuthorityState,
      canonicalAuthoritySource:
        barrier.terminalRecoveryReadiness.canonicalAuthoritySource,
      transactionRecoveryState:
        barrier.terminalRecoveryReadiness.transactionRecoveryState,
      transactionRecoveryOutcome:
        barrier.terminalRecoveryReadiness.transactionRecoveryOutcome,
    },
    {
      startupBranch: null,
      canonicalAuthorityState: null,
      canonicalAuthoritySource: null,
      transactionRecoveryState: null,
      transactionRecoveryOutcome: null,
    },
  );
});

test('Unit: prototype pollution cannot fabricate direct handoff evidence', () => {
  // eslint-disable-next-line no-extend-native -- adversarial integrity fixture
  Object.defineProperty(Object.prototype, 'infrastructureJoinComplete', {
    configurable: true,
    value: false,
  });
  let barrier;
  try {
    barrier = resolveBarrier(
      'Restarted node did not become recovery-ready within 120000ms for node ' +
        NODE_ID +
        ' (reachable=true, ready=false, adminReady=false, ' +
        'controlPlaneRecoveryReady=true, reachableBy=bootstrap_health, ' +
        'lastError=connect ECONNREFUSED 172.18.0.6:8081)',
    );
  } finally {
    delete Object.prototype.infrastructureJoinComplete;
  }
  assert.equal(barrier.dominantReason, 'restart_recovery_timeout');
  assert.equal(barrier.terminalRecoveryReadiness.ownerState, null);
  assert.equal(
    barrier.terminalRecoveryReadiness.infrastructureJoinComplete,
    null,
  );
});

test('Unit: mutable Object.values cannot fabricate a recovery outcome', () => {
  const originalObjectValues = Object.values;
  let objectValuesCalls = 0;
  Object.values = () => {
    objectValuesCalls += 1;
    return ['fabricated'];
  };
  let barrier;
  try {
    barrier = resolveBarrier(buildError({
      ready: false,
      infrastructureJoinComplete: true,
      canonicalAuthorityConsumed: true,
      transactionRecoveryState: 'completed',
      transactionRecoveryReady: 'none',
    }));
  } finally {
    Object.values = originalObjectValues;
  }
  assert.equal(objectValuesCalls, 0);
  assert.equal(barrier.dominantReason, 'restart_recovery_timeout');
  assert.equal(barrier.terminalRecoveryReadiness.ownerState, null);
  assert.equal(
    barrier.terminalRecoveryReadiness.transactionRecoveryOutcome,
    null,
  );
});
