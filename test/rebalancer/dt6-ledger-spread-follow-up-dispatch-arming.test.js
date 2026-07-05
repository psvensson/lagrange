/**
 * Quest formation-ledger-spread-window-follow-up-latency (run-26 head).
 *
 * Run-26 forensics: the formation ledger-spread window (~25-30s) outlasts
 * the CREATE TABLE provisioning budget NOT because of planner cadence — the
 * planner created the follow-up ledger self-move 30ms after its predecessor
 * settled — but because the newly created REMOTE-owned operation sat in
 * PENDING with dispatch never armed:
 *   - the creator's arm seam (armCoordinatorCreatedOperation) produced no
 *     owner wake, no handoff attempt, and no warn (silent);
 *   - 47ms later the planner's rearm was suppressed by
 *     SKIP_LIVE_DEFERRED_RETRY on the strength of a deferred dispatch retry
 *     that never fires;
 *   - rescue came only from a COINCIDENTAL ready-node replay cascade ~8.7s
 *     later. The predecessor op had the same pre-dispatch idle (11.7s).
 *
 * Contract under test: creating a remote-owned priority operation ARMS its
 * dispatch — the remote owner is woken promptly (or a live retry that
 * actually fires is registered); a registered-but-dead retry never
 * suppresses the only rearm.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const LOCAL_NODE_ID = 'node-creator';
const REMOTE_OWNER_NODE_ID = 'node-remote-owner';
const LEDGER_PARTITION_ID = 'replica_operations-p1';

function createCoordinatorFixture(t, {deliveries}) {
  const coordinator = new RebalanceCoordinator({
    nodeId: LOCAL_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver(address, message) {
        deliveries.push({address, message});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  t.teardown(() => coordinator.shutdown?.());
  return coordinator;
}

function buildRemoteOwnedLedgerSelfMove() {
  return {
    operationId: 'op-ledger-follow-up',
    type: 'REPLACE',
    partitionId: LEDGER_PARTITION_ID,
    entityType: 'partition',
    entityId: LEDGER_PARTITION_ID,
    replicaId: `${LEDGER_PARTITION_ID}-r2`,
    sourceNodeId: 'node-seed',
    targetNodeId: REMOTE_OWNER_NODE_ID,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    // The live create stamps creation time (persistNewOperation); the
    // retained-snapshot retry loop is BOUNDED by it.
    createdAt: Date.now(),
    stepsHistory: [],
  };
}

function recordRemoteWakes(coordinator) {
  const remoteWakes = [];
  const originalWake =
    coordinator.workflowOwner.wakeCoordinatorCreatedRemoteOwner?.bind(
      coordinator.workflowOwner,
    );
  if (originalWake) {
    coordinator.workflowOwner.wakeCoordinatorCreatedRemoteOwner = (
      wakeOperation,
    ) => {
      remoteWakes.push(wakeOperation?.operationId || null);
      return originalWake(wakeOperation);
    };
  }
  return remoteWakes;
}

test('run-26: creating a REMOTE-owned priority ledger self-move ARMS its ' +
  'dispatch — the remote owner is woken instead of the operation idling in ' +
  'PENDING until a coincidental replay (RED on the unfixed head)', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();

  const remoteWakes = recordRemoteWakes(coordinator);
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => null;

  const armed =
    await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation);

  const wakeDelivered =
    remoteWakes.length > 0 ||
    deliveries.some(
      (delivery) =>
        JSON.stringify(delivery.message || {}).includes(
          operation.operationId,
        ),
    );
  t.ok(
    wakeDelivered,
    `the remote owner was woken for the pending operation (armed=${
      JSON.stringify(armed)
    }, wakes=${remoteWakes.length}, deliveries=${deliveries.length})`,
  );
});

/**
 * Run-26 root-cause shape (node-4 12:09:48.706-.753 → 12:09:57.447):
 *
 * The wake transport ACKs without the owner ever processing the message —
 * the receiving router sends ACK BEFORE checking for a registered handler
 * (message-router-inbound-dispatch.js handleServiceMessage), and a
 * mid-startup owner has no `/service/replica-dispatch` ingress yet. The
 * creator's wake path classifies acknowledged:true as DELIVERED, silently
 * arms ONLY the 1s verification follow-up
 * (scheduleCoordinatorCreatedRemoteHandoffFollowUp — zero logging), and
 * returns success. That follow-up re-reads the operation through
 * repository.getOperationByIdVisibilityObservation — but the row lives in
 * the ledger partition BEING MOVED and is not visible (run-26: "No row
 * found for CDC update") — so resolveDeferredRetryVisibleOperation yields
 * null and the timer SELF-CANCELS (clearCreatedOperationHandoffRetry)
 * without any wake or warn. While that doomed retry is live it is exactly
 * what suppresses the planner's only rearm:
 * resolveReusedOperationRearmAction → SKIP_LIVE_DEFERRED_RETRY (node-4
 * 12:09:48.753). After creation the priority planning gate blocks on
 * topology_operations_in_flight, so no later rearm ever comes; the op
 * idles in PENDING until a coincidental replay cascade (12:09:57.447).
 *
 * Contract (RED on the unfixed head): when the wake is ACK-swallowed and
 * the row is read-starved, the arm must leave behind a retry that ACTUALLY
 * fires a re-wake — or must not suppress the rearm seam.
 */
test('run-26 root cause: ACK-swallowed wake + read-starved op row — the ' +
  'silent 1s verification retry self-cancels without ever re-waking the ' +
  'remote owner while its live window suppresses the only planner rearm ' +
  '(RED on the unfixed head)', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();

  // The op row lives in the moving ledger partition: authoritative and
  // visibility reads see nothing (and report no deferred outcome) — the
  // run-26 'No row found for CDC update' starvation.
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => null;
  coordinator.workflowOwner.repository.getOperationByIdVisibilityObservation =
    async () => null;

  const armed =
    await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation);
  const deliveriesAfterArm = deliveries.length;

  // Live mirror of node-4 12:09:48.753: the planner pass dedupes onto the
  // just-created op 47ms later and asks whether to rearm its dispatch.
  const rearmActionAtOnlyRearmOpportunity =
    coordinator.resolveReusedOperationRearmAction(
      operation,
      WORKFLOW_STEP.PENDING,
    );

  // Sanity (not the binding assert): the arm reported success off a bare
  // transport ACK and one delivery attempt exists.
  t.equal(
    deliveriesAfterArm,
    1,
    `the arm produced exactly one (ACK-swallowed) wake delivery (armed=${
      JSON.stringify(armed)
    })`,
  );

  // Cover the 1s verification window: the registered follow-up must either
  // re-fire a real wake attempt, or it must not have suppressed the rearm.
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const retryRefiredWake = deliveries.length > deliveriesAfterArm;
  const rearmNotSuppressed =
    rearmActionAtOnlyRearmOpportunity === 'rearm_dispatch';
  t.ok(
    retryRefiredWake || rearmNotSuppressed,
    'the deferred dispatch retry registered by the ACK-swallowed wake ' +
      'actually fires a re-wake, or the planner rearm is not suppressed (' +
      `deliveries=${deliveries.length}, rearmAction=${
        rearmActionAtOnlyRearmOpportunity
      }, retryStillLive=${
        coordinator.hasLiveDeferredDispatchRetry(operation)
      })`,
  );
});

test('run-26 circularity: the arm still wakes the remote owner when the ' +
  'authoritative operation read fails (the read goes THROUGH the ledger ' +
  'being moved) — RED if the arm silently skips', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();

  const remoteWakes = recordRemoteWakes(coordinator);
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => {
      throw new Error(
        'authoritative read unavailable: replica_operations-p1 mid-move',
      );
    };

  let armError = null;
  let armed = null;
  try {
    armed = await coordinator.workflowOwner.armCoordinatorCreatedOperation(
      operation,
    );
  } catch (error) {
    armError = error;
  }

  const wakeDelivered =
    remoteWakes.length > 0 ||
    deliveries.some(
      (delivery) =>
        JSON.stringify(delivery.message || {}).includes(
          operation.operationId,
        ),
    );
  t.ok(
    wakeDelivered,
    `the remote owner is still woken when the ledger read fails (armed=${
      JSON.stringify(armed)
    }, error=${armError?.message || 'none'}, wakes=${remoteWakes.length})`,
  );
});

test('control: the snapshot retry loop is BOUNDED — past the operation ' +
  'budget it stops LOUDLY instead of re-waking forever', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = {
    ...buildRemoteOwnedLedgerSelfMove(),
    // Created far past the operation budget: the very first follow-up must
    // stop the loop.
    createdAt: Date.now() - 400_000,
    updatedAt: Date.now() - 400_000,
  };
  const warns = [];
  const owner = coordinator.workflowOwner;
  const originalWarn = owner.logger.warn.bind(owner.logger);
  owner.logger = Object.create(owner.logger);
  owner.logger.warn = (message, payload) => {
    warns.push({message, payload});
    return originalWarn(message, payload);
  };
  owner.repository.queryAuthoritativeOperationById = async () => null;
  owner.repository.getOperationByIdVisibilityObservation = async () => null;

  await owner.armCoordinatorCreatedOperation(operation);
  const deliveriesAfterArm = deliveries.length;
  await new Promise((resolve) => setTimeout(resolve, 2500));

  t.equal(
    deliveries.length,
    deliveriesAfterArm,
    'no re-wakes past the operation budget',
  );
  t.notOk(
    owner.createdOperationHandoffRetryTimerByOperationId.has(
      operation.operationId,
    ),
    'the retry is cleared at the bound',
  );
  // Past the budget no live retry exists, so the planner rearm is NOT
  // suppressed — the stranded op self-heals through the ordinary planner
  // lane instead of hiding behind a dead retry.
  t.not(
    coordinator.resolveReusedOperationRearmAction(
      operation,
      WORKFLOW_STEP.PENDING,
    ),
    'skip_live_deferred_retry',
    'a budget-expired op never suppresses the planner rearm',
  );
});

test('control: a degenerate snapshot (no timestamps) stops LOUDLY instead ' +
  'of looping unboundedly', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();
  delete operation.createdAt;
  const warns = [];
  const owner = coordinator.workflowOwner;
  const originalWarn = owner.logger.warn.bind(owner.logger);
  owner.logger = Object.create(owner.logger);
  owner.logger.warn = (message, payload) => {
    warns.push({message, payload});
    return originalWarn(message, payload);
  };
  owner.repository.queryAuthoritativeOperationById = async () => null;
  owner.repository.getOperationByIdVisibilityObservation = async () => null;

  await owner.armCoordinatorCreatedOperation(operation);
  const deliveriesAfterArm = deliveries.length;
  await new Promise((resolve) => setTimeout(resolve, 2200));

  t.equal(
    deliveries.length,
    deliveriesAfterArm,
    'no unbounded re-wakes from a snapshot that cannot bound the loop',
  );
  t.ok(
    warns.some((w) => w.payload?.degenerateSnapshot === true),
    'the degenerate-snapshot stop is loud',
  );
});

test('control (R4): a late delivery-honored event with an INVISIBLE row ' +
  'does not preempt-cancel the armed follow-up', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();
  const owner = coordinator.workflowOwner;
  owner.repository.queryAuthoritativeOperationById = async () => null;
  owner.repository.getOperationByIdVisibilityObservation = async () => null;

  await owner.armCoordinatorCreatedOperation(operation);
  t.ok(
    owner.createdOperationHandoffRetryTimerByOperationId.has(
      operation.operationId,
    ),
    'the verification follow-up is armed after the wake',
  );

  await owner.onLateDispatchDeliveryHonored({
    deliverySource: 'coordinator_created_remote_handoff',
    responseContext: operation.operationId,
  });
  t.ok(
    owner.createdOperationHandoffRetryTimerByOperationId.has(
      operation.operationId,
    ),
    'an invisible-row late honor leaves the follow-up armed (the only ' +
      're-drive for a dropped wake)',
  );
});

test('part 2: a wake whose transport ACK carries noHandler routes into the ' +
  'WARNING retry lane instead of counting as owner-woken', async (t) => {
  const deliveries = [];
  const coordinator = createCoordinatorFixture(t, {deliveries});
  const operation = buildRemoteOwnedLedgerSelfMove();
  const owner = coordinator.workflowOwner;
  const warns = [];
  const originalWarn = owner.logger.warn.bind(owner.logger);
  owner.logger = Object.create(owner.logger);
  owner.logger.warn = (message, payload) => {
    warns.push({message, payload});
    return originalWarn(message, payload);
  };
  // ACK-before-handler-lookup: the target acknowledges but reports no
  // registered handler (mid-startup drop).
  coordinator.messageRouter.deliver = async (address, message) => {
    deliveries.push({address, message});
    return {acknowledged: true, noHandler: true};
  };
  owner.repository.queryAuthoritativeOperationById = async () => null;
  owner.repository.getOperationByIdVisibilityObservation = async () => null;

  const armed = await owner.armCoordinatorCreatedOperation(operation);
  t.notOk(
    armed === true,
    'a dropped (noHandler) wake never reports the owner as woken',
  );
  t.ok(
    warns.some(
      (w) =>
        typeof w.message === 'string' &&
        w.message.includes('Deferred retryable replica operation dispatch'),
    ),
    'the drop is loud (routed into the deferral retry lane)',
  );
});
