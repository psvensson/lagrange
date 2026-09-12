// Witness of architecture/contracts/rolling-restart-rebalancer-handoff.md's
// bounded-owner-reentry: the REAL OperationWorkflowOwner's coordinator-created
// remote handoff retry - the priority_recovery_event_driven_wait retry wake
// the contract binds the invariant to - stops and clears within ONE
// operation's budget. The bound is per operation (createdAt + the owner's
// operation budget), read from the owner at run time, never restated; the
// count of deferrals inside it is finite because every re-arm waits at least
// the owner's minimum backoff. Red when the owner is mutated to keep the
// budget alive past its deadline, never by editing the test.
//
// What this does NOT prove: the cross-operation cycle. The owner's own stop
// log says the operation "remains for planner rearm / ready-node replay";
// whether the same node is re-planned into a fresh operation is a different
// claim, carried to formation-sim (formation-contracts-registration, 2026-09-12).

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  createNodeHosts,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);

const COORDINATOR_NODE_ID = 'coordinator-node';
const REMOTE_OWNER_NODE_ID = 'remote-owner-node';
const OPERATION_ID = 'reentry-witness-operation';
// A priority control-plane partition: the operation budget is the bound for
// its protected steps (replica-operation-step-policy).
const PARTITION_ID = 'control_plane_publications-p1';
const OPERATION_TYPE_ADD = 'ADD';
const WORKFLOW_STEP_PENDING = 'PENDING';
const REPLICA_OPERATIONS_TABLE = 'replica_operations';
const QUIET_LOGGER = Object.freeze({info() {}, debug() {}});
const STEP_TIMEOUT_MS = 1000;
// The operation was created this long before the end of its budget, so the
// first wake is still inside the budget and the second is past it; the wake's
// own repository read costs about a second on a node with no partition.
const BUDGET_REMAINING_MS = 3000;
const PAST_BUDGET_WAIT_MS = 3200;
const STEP_AGE_MS = 5000;
const SETTLE_MS = 5;
const STOP_LOG_FRAGMENT = 'stopped at its operation budget';

/**
 * The real owner, constructed the way the RebalanceCoordinator constructs it,
 * over the node's real repository, CDC owner, gateway and readiness owner;
 * timers injected (recorded, fired by the test), no jitter, and a router
 * whose remote owner never answers - the deferral the invariant is about.
 * @return {object}
 */
function createHandoffOwner() {
  const cache = new SystemTableCache();
  const hosts = createNodeHosts(cache, {nodeId: COORDINATOR_NODE_ID});
  const warnings = [];
  const timers = [];
  const deliveries = [];
  const logger = {
    ...QUIET_LOGGER,
    warn: (message, fields) => warnings.push({message, fields}),
    error: (message, fields) => warnings.push({message, fields}),
  };
  const repository = new ReplicaOperationRepository({
    nodeId: COORDINATOR_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: hosts.cdcIntegrationService,
    controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    logger,
  });
  const owner = new OperationWorkflowOwner({
    repository,
    operationLane: {run: (key, fn) => (typeof key === 'function' ? key() : fn())},
    operationWorkflowCoordinator: {},
    controlPlaneReadinessService: hosts.controlPlaneReadinessService,
    messageRouter: {
      async deliver(target) {
        deliveries.push(target);
        // Not acknowledged, retry later: the deferral the invariant is about.
        return {acknowledged: false, error: 'remote owner did not answer',
          errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
          retryAfterMs: OPERATION_WORKFLOW_OWNER_SHARED.DISPATCH_RETRY_DELAY_MS};
      },
    },
    tablePolicyService: hosts.tablePolicyService,
    logger,
    emitter: new EventEmitter(),
    config: {
      pendingTimeoutMs: STEP_TIMEOUT_MS, creatingTimeoutMs: STEP_TIMEOUT_MS,
      syncingTimeoutMs: STEP_TIMEOUT_MS, removingTimeoutMs: STEP_TIMEOUT_MS,
    },
    nodeId: COORDINATOR_NODE_ID,
    stats: null,
    isShuttingDown: () => false,
    isInitialized: () => true,
    releaseReservationForOperation: async () => {},
    ensureReservationForOperation: async () => {},
    hasStorageReservationSupport: () => false,
    getCurrentPublishedMembershipEpoch: () => 1,
    reconcileReservations: async () => {},
    allocateCanonicalReplicaId: () => null,
    getActualReplicaStatus: async () => null,
    engageOperationLedgerSelfMoveHold: () => {},
    disengageOperationLedgerSelfMoveHold: () => {},
    releaseOperationLedgerSelfMoveHoldOnLocalTerminal: () => {},
    setTimeoutFn: (fn, ms) => {
      timers.push({fn, ms});
      return {unref() {}};
    },
    clearTimeoutFn: () => {},
    randomFn: () => 0,
  });
  return {owner, hosts, repository, warnings, timers, deliveries};
}

/**
 * The operation as a real replica_operations row written through the CDC
 * owner, so the retry loop's repository read finds the same operation it
 * was armed with; the repository's own row mapping yields the operation.
 * @param {object} hosts
 * @param {ReplicaOperationRepository} repository
 * @param {number} nowMs
 * @return {Promise<object>}
 */
async function persistOperationNearBudgetEnd(hosts, repository, nowMs) {
  const budgetMs = TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
  const row = {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    entity_type: 'partition',
    entity_id: PARTITION_ID,
    type: OPERATION_TYPE_ADD,
    status: 'pending',
    workflow_step: WORKFLOW_STEP_PENDING,
    source_node_id: null,
    target_node_id: REMOTE_OWNER_NODE_ID,
    replica_id: `${PARTITION_ID}-r2`,
    created_at: nowMs - budgetMs + BUDGET_REMAINING_MS,
    updated_at: nowMs - STEP_AGE_MS,
  };
  const written = await hosts.cdcIntegrationService.insertSystemTableRow(
    REPLICA_OPERATIONS_TABLE, row);
  assert.equal(written.success, true, 'the operation row is written on the real path');
  return {...repository.rowToOperation(row), ownerNodeId: REMOTE_OWNER_NODE_ID};
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('bounded-owner-reentry: one operation\'s deferred handoff re-entry stops and ' +
  'clears within the operation budget the owner reads, after finitely many deferrals',
async () => {
  initializeTestEnvironment();
  const minBackoffMs = OPERATION_WORKFLOW_OWNER_SHARED.DISPATCH_RETRY_DELAY_MS;
  const budgetMs = TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
  const {owner, hosts, repository, warnings, timers, deliveries} = createHandoffOwner();
  // The budget is measured from createdAt on the owner's wall clock, so the
  // operation is dated after the owner is built, right before it is armed.
  const operation = await persistOperationNearBudgetEnd(hosts, repository, Date.now());

  // Inside the budget the owner defers: it arms a follow-up, wakes the remote
  // owner, and on no answer re-arms with at least its minimum backoff.
  assert.equal(owner.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
    operation, minBackoffMs, {}), true, 'inside the budget the handoff re-arms');
  assert.equal(owner.hasActiveCreatedOperationHandoffRetry(OPERATION_ID), true);
  await timers[0].fn();
  await settle(SETTLE_MS);
  assert.equal(deliveries.length, 1, 'the wake reached the transport');
  assert.equal(timers.length, 2, 'no answer: the owner deferred again');
  assert.equal(owner.hasActiveCreatedOperationHandoffRetry(OPERATION_ID), true);

  // Past the budget the same wake stops and clears the retry: the bound.
  await settle(PAST_BUDGET_WAIT_MS);
  const deferralsBefore = timers.length;
  await timers[1].fn();
  await settle(SETTLE_MS);
  const stop = arraySome(warnings, (entry) =>
    stringIncludes(String(entry.message), STOP_LOG_FRAGMENT));
  assert.ok(stop, `the owner stops at its budget: ${arrayMap(warnings, (w) => w.message).join(' | ')}`);
  assert.equal(owner.hasActiveCreatedOperationHandoffRetry(OPERATION_ID), false,
    'the retry is cleared, not re-armed');
  assert.equal(timers.length, deferralsBefore, 'nothing was armed after the stop');
  const decision = owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
    operation, Date.now(), {});
  assert.equal(decision.shouldStop, true);
  assert.equal(decision.operationBudgetDeadlineMs, operation.createdAt + budgetMs,
    'the bound is the operation budget the owner reads, not a number typed here');

  // Finite: every deferral waited at least the owner's minimum backoff, so
  // the deferrals one budget can hold are bounded by budget / minimum.
  assert.ok(arrayEvery(timers, (timer) => timer.ms >= minBackoffMs),
    `every deferral waits at least ${minBackoffMs} ms: ${arrayMap(timers, (t) => t.ms)}`);
  const deferralBound = Math.floor(budgetMs / minBackoffMs) + 1;
  assert.ok(timers.length <= deferralBound,
    `${timers.length} deferrals within a bound of ${deferralBound}`);
});
