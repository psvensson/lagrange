import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {RaftRole} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
} from '../../src/partition/partition-service-constants.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';
import {TIME_MS} from '../../src/constants/time.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
  evaluateLearnerPromotionProof,
} from '../../src/raft/learner-promotion-progress.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  COMMITTED_ENTRY_COUNT,
  LEADER_REPLICA,
  LEARNER_NODE,
  LEARNER_REPLICA,
  PARTITION_ID,
  configureFixtureRuntime,
  createFiveNodeFixture,
  insertPublishedEpochRow,
  insertServiceRow,
  recordServiceLog,
  resetFixtureRuntime,
  updateServiceRow,
  waitFor,
} from './dt6-learner-promotion-fixture.js';

// Deterministic witness for the learner-promotion proof channel (quest
// learner-promotion-proof-channel-wake), scoped from the 4bc6c1d25 GCP
// runs: control_plane_publications learner creation cost 25-32 s in every
// run — request_invalid at epoch 1 while the target's status write was
// deferred (the leader could not resolve the learner's address from its
// services cache), then progress_behind cycles behind 2-5 s seed
// event-loop stalls and 5 s transport timeouts, each proof retry a 1 s
// timer + the round trip.
//
// REAL owners: a live PartitionService leader and learner on the loopback
// transport with split system-table caches (the seed and the target hydrate
// independently). Injected environment, all on the scenario clock:
//   - the learner's SERVICES row is WITHHELD from the leader cache (the
//     target's deferred status write) and lands on its own only at
//     ROW_WITHHOLD_S — or earlier when the learner re-asserts it through
//     the replica state machine's CL-021 deferred-row retry;
//   - the leader STALLS in periodic windows (LEADER_STALL_S stalled,
//     LEADER_AWAKE_S awake): a proof delivery sent during a stall completes
//     when the stall ends, or fails with a timeout when its bound expires
//     first — the router semantics of transport.deliver({timeoutMs}), with
//     the router default MESSAGE_TIMEOUT_MS when no bound is given.
//
// SCENARIO CLOCK: liferaft's heartbeat/election timers are wall-clock, so
// the drive runs on a scaled real clock: one scenario second is the
// learner's proof retry interval in real milliseconds (VIRTUAL_SECOND_MS).
// Every injected delay and every bound is a multiple of that interval;
// timings are reported in scenario seconds. The wake bound is half an
// interval: an event-driven re-request lands within a few milliseconds,
// a timer-only re-request no earlier than a full interval.
//
// Each test below is one quest receipt
// (scripts/quest-evidence-learner-promotion-proof-channel-wake.js).

const VIRTUAL_SECOND_MS = 200;
const RETRY_INTERVAL_MS = VIRTUAL_SECOND_MS;
const ROW_WITHHOLD_S = 22;
const LEADER_STALL_S = 5;
const LEADER_AWAKE_S = 2;
const ROUTER_DEFAULT_TIMEOUT_S =
  TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS / TIME_MS.SECOND;
const GREEN_ACTIVE_BOUND_S = 12;
const HEAD_ACTIVE_FLOOR_S = 26;
const DRIVE_BUDGET_S = 40;
const WAKE_BOUND_MS = VIRTUAL_SECOND_MS / 2;
const TIMEOUT_INTERVAL_MULTIPLE = 2;
const EXPECTED_PROOF_TIMEOUT_MS = Math.min(
  TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
  RETRY_INTERVAL_MS * TIMEOUT_INTERVAL_MULTIPLE,
);
const HEAD_MESSAGE_TIMEOUT_MS = 5000;
const HEAD_RETRY_INTERVAL_MS = 1000;
const PUBLISHED_EPOCH_ONE = 1;
const BOOTSTRAP_EPOCH = 0;
const LAGGING_MATCH_INDEX = COMMITTED_ENTRY_COUNT - 1;
const SURPLUS_VOTERS = [['replica-6', 'node-6'], ['replica-7', 'node-7']];
const FOREIGN_LEARNER_REPLICA = 'replica-foreign';
const FOREIGN_PARTITION_ID = 'progress-proof-other';
const OBSERVATION_INTERVALS = 5;
const MIN_TIMEOUT_REQUESTS = 3;
const SCHEDULING_SLACK_MS = VIRTUAL_SECOND_MS / 2;
const REQUEST_INVALID = LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID;
const PROGRESS_BEHIND = LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND;
const TRANSPORT_FAILED = LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED;
const EPOCH_MISMATCH = LEARNER_PROMOTION_PROOF_REASON.EPOCH_MISMATCH;
const WOULD_EXCEED_TARGET = 'would_exceed_target_replica_count';
// Typed refusal causes and wake reasons under witness (string-pinned so
// the file links on HEAD, where the typed contract does not yet exist).
const CAUSE_ADDRESS_UNRESOLVABLE = 'learner_address_unresolvable';
const CAUSE_REQUEST_SHAPE = 'request_shape';
const CAUSE_RESPONSE_BINDING_MISMATCH = 'response_binding_mismatch';
const WAKE_SERVICES_ROW_VISIBLE = 'services_row_visible';
const WAKE_PUBLISHED_EPOCH_CHANGED = 'published_epoch_changed';
const LOG_LEVEL_INFO = 'info';
const OUTCOME_TIMEOUT = 'timeout';

function seconds(clock, atMs) {
  return Number(((atMs - clock.originMs) / VIRTUAL_SECOND_MS).toFixed(2));
}

function createScenarioClock() {
  const clock = {originMs: Date.now()};
  clock.now = () => Date.now();
  clock.start = () => {
    clock.originMs = Date.now();
  };
  return clock;
}

// Leader event-loop stalls as periodic windows on the scenario clock:
// [k*period, k*period + stall) stalled, then awake. A delivery sent while
// stalled is answered at the window end.
function createLeaderStallPlan(clock, options) {
  const plan = {enabled: options.enabled === true};
  const stallMs = options.stallS * VIRTUAL_SECOND_MS;
  const periodMs = stallMs + options.awakeS * VIRTUAL_SECOND_MS;
  plan.remainingStallMs = (nowMs) => {
    if (!plan.enabled) {
      return 0;
    }
    if (options.awakeS === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const elapsedMs = Math.max(0, nowMs - clock.originMs);
    const phaseMs = elapsedMs % periodMs;
    return phaseMs < stallMs ? stallMs - phaseMs : 0;
  };
  return plan;
}

function recordProofRequest(requests, clock, payload, options) {
  const request = {
    sentAtMs: clock.now(),
    membershipEpoch: payload.membershipEpoch,
    timeoutMs: options?.timeoutMs,
    outcome: null,
    proof: null,
    completedAtMs: null,
  };
  requests.push(request);
  return request;
}

// The router's bound: options.timeoutMs when given, else its default.
function resolveDeliveryBoundMs(options, routerDefaultTimeoutMs) {
  return Number.isFinite(options?.timeoutMs) ?
    options.timeoutMs :
    routerDefaultTimeoutMs;
}

async function failProofDeliveryAtBound(request, clock, boundMs) {
  await sleep(boundMs);
  request.outcome = OUTCOME_TIMEOUT;
  request.completedAtMs = clock.now();
  throw new Error(`proof delivery timed out after ${boundMs}ms`);
}

function completeProofRequest(request, clock, response, listeners) {
  request.outcome = response?.proof?.reason ?? null;
  request.proof = response?.proof ?? null;
  request.completedAtMs = clock.now();
  if (typeof listeners.onResponse === 'function') {
    listeners.onResponse(request);
  }
}

// Learner-side transport: observes every proof request (send instant,
// carried epoch, delivery bound) and applies the leader stall with the
// router's timeout semantics.
function createProofChannelTransport(inner, clock, stallPlan) {
  const requests = [];
  const listeners = {onResponse: null};
  const routerDefaultTimeoutMs = ROUTER_DEFAULT_TIMEOUT_S * VIRTUAL_SECOND_MS;
  return {
    requests,
    listeners,
    register: (address, handler) => inner.register(address, handler),
    unregister: (address) => inner.unregister(address),
    deliver: async (address, payload, options) => {
      if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF) {
        return inner.deliver(address, payload, options);
      }
      const request = recordProofRequest(requests, clock, payload, options);
      const boundMs = resolveDeliveryBoundMs(options, routerDefaultTimeoutMs);
      const stallMs = stallPlan.remainingStallMs(request.sentAtMs);
      if (stallMs > boundMs) {
        return failProofDeliveryAtBound(request, clock, boundMs);
      }
      if (stallMs > 0) {
        await sleep(stallMs);
      }
      const response = await inner.deliver(address, payload, options);
      completeProofRequest(request, clock, response, listeners);
      return response;
    },
  };
}

// The durable landing of the learner's services row: the leader cache gains
// it (INSERT, CDC fan-out) and the target's own cache sees its local-only
// seed row converge (UPDATE). Idempotent.
function createRowLanding(clock) {
  const landing = {landedAtMs: null, requestCountAtLanding: null, fixture: null};
  landing.land = () => {
    if (landing.landedAtMs !== null || !landing.fixture) {
      return;
    }
    landing.landedAtMs = clock.now();
    landing.requestCountAtLanding =
      landing.fixture.learnerTransport.requests.length;
    insertServiceRow(
      landing.fixture.leaderCache, LEARNER_REPLICA, LEARNER_NODE,
      RaftRole.LEARNER,
    );
    updateServiceRow(
      landing.fixture.learnerCache, LEARNER_REPLICA, LEARNER_NODE,
      RaftRole.LEARNER,
    );
  };
  return landing;
}

// The target's replica state machine as the durable services-row owner:
// its CL-021 deferred-row retry is the only path that lands the row early.
function createDeferredRowStateMachine(clock, landing) {
  const kicks = [];
  return {
    kicks,
    reconcileLocalOnlyServiceRowsNow() {
      kicks.push(clock.now());
      landing.land();
      return Promise.resolve(kicks.length);
    },
  };
}

// The first proof request sent after an event, by request index (a
// same-millisecond response and event never alias by timestamp).
function requestAfterEvent(requests, requestCountAtEvent) {
  return Number.isInteger(requestCountAtEvent) ?
    requests[requestCountAtEvent] || null :
    null;
}

function wakeReasons(learnerLog) {
  return learnerLog
    .filter((entry) =>
      entry.message === PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED)
    .map((entry) => entry.payload?.scheduleReason);
}

function learnerDeferrals(learnerLog) {
  return learnerLog
    .filter((entry) =>
      entry.level === LOG_LEVEL_INFO &&
      entry.message === PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED &&
      entry.payload?.replicaId === LEARNER_REPLICA)
    .map((entry) => ({
      reason: entry.payload.reason,
      proofReason: entry.payload.proofReason ?? entry.payload.reason,
      cause: entry.payload.proofCause ?? entry.payload.cause ?? null,
      atMs: entry.atMs,
    }));
}

async function createChannelFixture(options = {}) {
  const clock = createScenarioClock();
  const stallPlan = createLeaderStallPlan(clock, {
    enabled: options.stall === true,
    stallS: options.stallS ?? LEADER_STALL_S,
    awakeS: options.awakeS ?? LEADER_AWAKE_S,
  });
  const landing = createRowLanding(clock);
  let transport = null;
  const fixture = await createFiveNodeFixture({
    splitCaches: true,
    startPartitioned: options.startPartitioned === true,
    learnerRow: true,
    leaderLearnerRow: options.withholdRow !== true,
    publishedEpoch: options.publishedEpoch,
    retryIntervalMs: RETRY_INTERVAL_MS,
    replicaStateMachine: options.stateMachine === true ?
      createDeferredRowStateMachine(clock, landing) :
      undefined,
    wrapLearnerTransport: (inner) => {
      transport = createProofChannelTransport(inner, clock, stallPlan);
      return transport;
    },
  });
  clock.start();
  landing.fixture = fixture;
  const leaderLog = recordServiceLog(fixture.leader);
  const learnerLog = recordServiceLog(fixture.learner);
  let withholdTimer = null;
  if (options.withholdRow === true) {
    withholdTimer = setTimeout(
      landing.land,
      ROW_WITHHOLD_S * VIRTUAL_SECOND_MS,
    );
  }
  return {
    ...fixture,
    clock,
    stallPlan,
    landing,
    transport,
    leaderLog,
    learnerLog,
    stateMachine: fixture.learner.replicaStateMachine,
    async shutdown() {
      clearTimeout(withholdTimer);
      await fixture.shutdown();
    },
  };
}

function waitForPromotion(fixture, budgetS = DRIVE_BUDGET_S) {
  return waitFor(
    () => fixture.learner.role === RaftRole.FOLLOWER,
    budgetS * VIRTUAL_SECOND_MS,
  );
}

function waitForRequests(fixture, count, budgetS = DRIVE_BUDGET_S) {
  return waitFor(
    () => fixture.transport.requests.filter(
      (request) => request.completedAtMs !== null,
    ).length >= count,
    budgetS * VIRTUAL_SECOND_MS,
  );
}

function grantedProof(fixture) {
  return fixture.transport.requests
    .map((request) => request.proof)
    .find((proof) =>
      proof?.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED) || null;
}

// The full cpp drive: row withheld, leader stalls, state machine present.
async function runCppDrive() {
  configureFixtureRuntime();
  const fixture = await createChannelFixture({
    withholdRow: true,
    stall: true,
    stateMachine: true,
    publishedEpoch: PUBLISHED_EPOCH_ONE,
  });
  try {
    const promoted = await waitForPromotion(fixture);
    const activeAtMs = fixture.clock.now();
    const deferrals = learnerDeferrals(fixture.learnerLog);
    const wakeRequest = requestAfterEvent(
      fixture.transport.requests, fixture.landing.requestCountAtLanding,
    );
    return {
      promoted,
      activeAtS: promoted ?
        seconds(fixture.clock, activeAtMs) :
        Number.POSITIVE_INFINITY,
      rowLandedAtS: fixture.landing.landedAtMs === null ?
        null :
        seconds(fixture.clock, fixture.landing.landedAtMs),
      wakeDelayMs: wakeRequest ?
        wakeRequest.sentAtMs - fixture.landing.landedAtMs :
        null,
      kicks: fixture.stateMachine.kicks.length,
      deferrals: deferrals.map((d) => [d.proofReason, d.cause]),
      wakes: wakeReasons(fixture.learnerLog).filter((reason) =>
        reason === WAKE_SERVICES_ROW_VISIBLE ||
        reason === WAKE_PUBLISHED_EPOCH_CHANGED),
      proof: grantedProof(fixture),
      leaderEpoch: fixture.leader.resolveLearnerPromotionMembershipEpoch(),
      learnerEpoch: fixture.learner.resolveLearnerPromotionMembershipEpoch(),
      requests: fixture.transport.requests.map((request) => [
        seconds(fixture.clock, request.sentAtMs),
        request.outcome,
      ]),
    };
  } finally {
    await fixture.shutdown();
    resetFixtureRuntime();
  }
}

function describeDrive(drive) {
  return JSON.stringify({
    deferrals: drive.deferrals,
    wakes: drive.wakes,
    activeWithinBound: drive.activeAtS <= GREEN_ACTIVE_BOUND_S,
    granted: drive.proof !== null,
  });
}

test(
  'proof-wakes-on-services-row-visibility: the learner re-requests its ' +
  'proof immediately when its own services row becomes visible',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({withholdRow: true});
    try {
      // Land the row the instant the first (unresolvable) refusal returns —
      // phase zero of the retry timer, so a timer-only owner re-requests a
      // full interval later while an event-driven owner re-requests now.
      fixture.transport.listeners.onResponse = () => {
        fixture.transport.listeners.onResponse = null;
        fixture.landing.land();
      };
      const promoted = await waitForPromotion(fixture);
      assert.equal(promoted, true, 'the learner promotes once resolvable');
      const {requests} = fixture.transport;
      assert.equal(requests[0].outcome, REQUEST_INVALID,
        'the first proof is refused while the row is withheld');
      const wakeRequest = requestAfterEvent(
        requests, fixture.landing.requestCountAtLanding,
      );
      assert.ok(wakeRequest, 'a proof request follows the row landing');
      const wakeDelayMs = wakeRequest.sentAtMs - fixture.landing.landedAtMs;
      t.diagnostic(`row visible -> next proof request after ${wakeDelayMs} ms ` +
        `(retry interval ${RETRY_INTERVAL_MS} ms)`);
      assert.ok(wakeDelayMs < WAKE_BOUND_MS,
        `the proof re-request follows the row landing within ${WAKE_BOUND_MS} ` +
        `ms, not on the ${RETRY_INTERVAL_MS} ms timer (observed ${wakeDelayMs} ms)`);
      assert.ok(wakeReasons(fixture.learnerLog).includes(WAKE_SERVICES_ROW_VISIBLE),
        'the wake is typed services_row_visible on the existing schedule');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'proof-wakes-on-published-epoch-change: the learner re-requests its ' +
  'proof immediately when the latest PUBLISHED epoch changes',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({startPartitioned: true});
    try {
      let epochPublishedAtMs = null;
      let requestCountAtPublish = null;
      fixture.transport.listeners.onResponse = () => {
        fixture.transport.listeners.onResponse = null;
        insertPublishedEpochRow(fixture.leaderCache, PUBLISHED_EPOCH_ONE);
        insertPublishedEpochRow(fixture.learnerCache, PUBLISHED_EPOCH_ONE);
        epochPublishedAtMs = fixture.clock.now();
        requestCountAtPublish = fixture.transport.requests.length;
      };
      const epochRequestSeen = await waitFor(
        () => requestAfterEvent(
          fixture.transport.requests, requestCountAtPublish,
        ) !== null,
        DRIVE_BUDGET_S * VIRTUAL_SECOND_MS,
      );
      assert.equal(epochRequestSeen, true,
        'a proof request follows the publication');
      const {requests} = fixture.transport;
      assert.equal(requests[0].membershipEpoch, BOOTSTRAP_EPOCH,
        'the first request carried the bootstrap epoch');
      assert.notEqual(requests[0].proof?.decision,
        LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
        'the lagging learner is refused, never promoted');
      const wakeRequest = requestAfterEvent(requests, requestCountAtPublish);
      const wakeDelayMs = wakeRequest.sentAtMs - epochPublishedAtMs;
      t.diagnostic('epoch published -> next proof request after ' +
        `${wakeDelayMs} ms`);
      assert.equal(wakeRequest.membershipEpoch, PUBLISHED_EPOCH_ONE,
        'the re-request binds the new published epoch');
      assert.ok(wakeDelayMs < WAKE_BOUND_MS,
        `the re-request follows the epoch change within ${WAKE_BOUND_MS} ms ` +
        `(observed ${wakeDelayMs} ms)`);
      assert.ok(
        wakeReasons(fixture.learnerLog).includes(WAKE_PUBLISHED_EPOCH_CHANGED),
        'the wake is typed published_epoch_changed');
      fixture.leaderTransport.state.dropToLearner = false;
      const promoted = await waitForPromotion(fixture);
      assert.equal(promoted, true, 'healing replication still promotes');
      assert.equal(grantedProof(fixture).membershipEpoch, PUBLISHED_EPOCH_ONE,
        'the grant is bound to the published epoch');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'typed-refusal-cause-address-unresolvable: request_invalid carries a ' +
  'typed cause on both sides and is logged at info',
  async () => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({withholdRow: true});
    try {
      const refused = await waitForRequests(fixture, 1);
      assert.equal(refused, true, 'the first proof round trip completed');
      const {leader, learner} = fixture;
      const leaderRefusal = fixture.leaderLog.find((entry) =>
        entry.level === LOG_LEVEL_INFO &&
        entry.message ===
          PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_REQUEST_REFUSED);
      assert.ok(leaderRefusal,
        'the leader logs the refusal at info');
      assert.equal(leaderRefusal.payload.learnerReplicaId, LEARNER_REPLICA);
      assert.equal(leaderRefusal.payload.partitionId, PARTITION_ID);
      assert.equal(leaderRefusal.payload.cause, CAUSE_ADDRESS_UNRESOLVABLE,
        'the leader-side cause is learner_address_unresolvable');
      const learnerDeferral = learnerDeferrals(fixture.learnerLog)[0];
      assert.ok(learnerDeferral, 'the learner logs the deferral at info');
      assert.equal(learnerDeferral.proofReason, REQUEST_INVALID);
      assert.equal(learnerDeferral.cause, CAUSE_ADDRESS_UNRESOLVABLE,
        'the learner sees the typed cause');
      assert.equal(fixture.transport.requests[0].proof.cause,
        CAUSE_ADDRESS_UNRESOLVABLE, 'the refusal itself carries the cause');

      const shapeResponse = leader.handleLearnerPromotionProofRequest({
        partitionId: FOREIGN_PARTITION_ID,
        replicaId: LEARNER_REPLICA,
      });
      assert.equal(shapeResponse.proof.reason, REQUEST_INVALID);
      assert.equal(shapeResponse.proof.cause, CAUSE_REQUEST_SHAPE,
        'a malformed request is typed request_shape');
      assert.ok(fixture.leaderLog.some((entry) =>
        entry.level === LOG_LEVEL_INFO &&
        entry.payload?.cause === CAUSE_REQUEST_SHAPE &&
        entry.payload?.learnerReplicaId === LEARNER_REPLICA),
      'request_shape is logged at info with the learner id');

      const realTransport = learner.transport;
      learner.transport = {
        deliver: async () => ({
          acknowledged: true,
          partitionId: PARTITION_ID,
          learnerReplicaId: FOREIGN_LEARNER_REPLICA,
          proof: evaluateLearnerPromotionProof({
            raftIsLeader: true,
            currentTerm: leader.raft.term,
            committedIndex: COMMITTED_ENTRY_COUNT,
            learnerMatchIndex: COMMITTED_ENTRY_COUNT,
            leaderMembershipEpoch: BOOTSTRAP_EPOCH,
            learnerMembershipEpoch: BOOTSTRAP_EPOCH,
          }),
        }),
      };
      let bindingProof = null;
      try {
        bindingProof = await learner.requestLearnerPromotionProofFromLeader({
          leaderReplicaId: LEADER_REPLICA,
          membershipEpoch: BOOTSTRAP_EPOCH,
        });
      } finally {
        learner.transport = realTransport;
      }
      assert.equal(bindingProof.decision,
        LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
        'a grant bound to another learner never promotes this one');
      assert.equal(bindingProof.reason, REQUEST_INVALID);
      assert.equal(bindingProof.cause, CAUSE_RESPONSE_BINDING_MISMATCH,
        'the learner mints response_binding_mismatch');
      assert.ok(fixture.learnerLog.some((entry) =>
        entry.level === LOG_LEVEL_INFO &&
        entry.payload?.cause === CAUSE_RESPONSE_BINDING_MISMATCH &&
        entry.payload?.learnerReplicaId === LEARNER_REPLICA &&
        entry.payload?.partitionId === PARTITION_ID),
      'response_binding_mismatch is logged at info with learner/partition');
      assert.equal(learner.role, RaftRole.LEARNER,
        'no refusal shape ever promotes');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'learner-reasserts-row-on-unresolvable: an unresolvable refusal kicks ' +
  'the CL-021 deferred services-row retry now, not on its tick',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({
      withholdRow: true,
      stateMachine: true,
    });
    try {
      assert.equal(
        typeof ReplicaStateMachine.prototype.reconcileLocalOnlyServiceRowsNow,
        'function',
        'the replica state machine owns the deferred-row retry entry point ' +
          'the learner kicks (its per-row backoff bounds apply inside)');
      const promoted = await waitForPromotion(fixture);
      assert.equal(promoted, true, 'the re-asserted row lets the proof grant');
      const {requests} = fixture.transport;
      const {kicks} = fixture.stateMachine;
      assert.equal(requests[0].outcome, REQUEST_INVALID,
        'the first proof is refused while the row is withheld');
      assert.ok(kicks.length >= 1, 'the learner kicked the deferred-row retry');
      const kickDelayMs = kicks[0] - requests[0].completedAtMs;
      t.diagnostic(`unresolvable refusal -> CL-021 kick after ${kickDelayMs} ` +
        `ms; kicks ${kicks.length}; row landed at ` +
        `${seconds(fixture.clock, fixture.landing.landedAtMs)} s`);
      assert.ok(kicks[0] >= requests[0].completedAtMs,
        'the kick follows the unresolvable refusal, never precedes it');
      assert.ok(kickDelayMs < WAKE_BOUND_MS,
        'the kick is immediate, not deferred to the retry timer');
      const unresolvableRefusals = requests.filter((request) =>
        request.outcome === REQUEST_INVALID).length;
      assert.ok(kicks.length <= unresolvableRefusals,
        'at most one kick per unresolvable refusal (bounded by the cadence)');
      const wakeRequest = requestAfterEvent(
        requests, fixture.landing.requestCountAtLanding,
      );
      assert.ok(wakeRequest, 'a proof request follows the re-asserted row');
      assert.ok(
        wakeRequest.sentAtMs - fixture.landing.landedAtMs < WAKE_BOUND_MS,
        'the re-asserted row wakes the proof request');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'proof-delivery-timeout-bounded-and-logged: each proof delivery carries ' +
  'a bounded timeoutMs and a timeout is logged at info without stacking',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({
      startPartitioned: true,
      stall: true,
      awakeS: 0,
    });
    try {
      const observed = await waitForRequests(fixture, MIN_TIMEOUT_REQUESTS);
      assert.equal(observed, true, 'several proof deliveries were attempted');
      const {requests} = fixture.transport;
      t.diagnostic(`proof deliveries: ${JSON.stringify(requests.map((r) => [
        seconds(fixture.clock, r.sentAtMs), r.timeoutMs, r.outcome,
      ]))}`);
      assert.equal(requests[0].timeoutMs, EXPECTED_PROOF_TIMEOUT_MS,
        'the delivery bound is min(MESSAGE_TIMEOUT_MS, ' +
        `${TIMEOUT_INTERVAL_MULTIPLE} x retry interval) = ` +
        `${EXPECTED_PROOF_TIMEOUT_MS} ms`);
      assert.ok(requests[0].timeoutMs <= TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
        'never larger than MESSAGE_TIMEOUT_MS');
      assert.equal(requests[0].outcome, OUTCOME_TIMEOUT,
        'the stalled delivery timed out at its bound');
      const transportFailures = fixture.learnerLog.filter((entry) =>
        entry.level === LOG_LEVEL_INFO &&
        entry.payload?.replicaId === LEARNER_REPLICA &&
        (entry.payload?.reason === TRANSPORT_FAILED ||
          entry.payload?.proofReason === TRANSPORT_FAILED));
      assert.ok(transportFailures.length >= 1,
        'proof_transport_failed is logged at info');
      for (let index = 1; index < requests.length; index++) {
        const spacingMs = requests[index].sentAtMs - requests[index - 1].sentAtMs;
        assert.ok(
          spacingMs <= EXPECTED_PROOF_TIMEOUT_MS + RETRY_INTERVAL_MS +
            SCHEDULING_SLACK_MS,
          'a timeout never stacks beyond bound + interval (spacing ' +
            `${spacingMs} ms)`);
      }
      assert.equal(fixture.learner.role, RaftRole.LEARNER,
        'transport failures never promote');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'proof-semantics-and-voter-cap-unchanged: leader-proven progress, epoch ' +
  'binding, the target+1 voter cap and the budgets are the HEAD contract',
  async () => {
    const lagging = evaluateLearnerPromotionProof({
      raftIsLeader: true,
      currentTerm: 1,
      committedIndex: COMMITTED_ENTRY_COUNT,
      learnerMatchIndex: LAGGING_MATCH_INDEX,
      leaderMembershipEpoch: PUBLISHED_EPOCH_ONE,
      learnerMembershipEpoch: PUBLISHED_EPOCH_ONE,
    });
    assert.equal(lagging.reason, PROGRESS_BEHIND,
      'learnerMatchIndex < safePromotionIndex refuses progress_behind');
    const mismatched = evaluateLearnerPromotionProof({
      raftIsLeader: true,
      currentTerm: 1,
      committedIndex: COMMITTED_ENTRY_COUNT,
      learnerMatchIndex: COMMITTED_ENTRY_COUNT,
      leaderMembershipEpoch: PUBLISHED_EPOCH_ONE,
      learnerMembershipEpoch: BOOTSTRAP_EPOCH,
    });
    assert.equal(mismatched.reason, EPOCH_MISMATCH,
      'a publication-epoch mismatch is fenced epoch_mismatch');
    const granted = evaluateLearnerPromotionProof({
      raftIsLeader: true,
      currentTerm: 1,
      committedIndex: COMMITTED_ENTRY_COUNT,
      learnerMatchIndex: COMMITTED_ENTRY_COUNT,
      leaderMembershipEpoch: PUBLISHED_EPOCH_ONE,
      learnerMembershipEpoch: PUBLISHED_EPOCH_ONE,
    });
    assert.equal(granted.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED);
    assert.equal(granted.safePromotionIndex, COMMITTED_ENTRY_COUNT,
      'the safe promotion index is the leader committed index');
    assert.equal(PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS,
      HEAD_RETRY_INTERVAL_MS, 'LEARNER_CATCH_UP_CHECK_INTERVAL_MS unchanged');
    assert.equal(TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS, HEAD_MESSAGE_TIMEOUT_MS,
      'MESSAGE_TIMEOUT_MS unchanged');

    configureFixtureRuntime();
    const fixture = await createChannelFixture({startPartitioned: true});
    try {
      await sleep(OBSERVATION_INTERVALS * RETRY_INTERVAL_MS);
      assert.equal(fixture.learner.role, RaftRole.LEARNER,
        'a lagging learner is never promoted by elapsed retry ticks');
      const deferrals = learnerDeferrals(fixture.learnerLog);
      assert.ok(deferrals.length > 0, 'the retries were refused');
      assert.ok(deferrals.every((d) => d.proofReason === PROGRESS_BEHIND),
        'every refusal while lagging is typed progress_behind');
      // Surplus ACTIVE voters (target 5, 6 active) in both caches — the
      // quorum-shape gates read the learner's own cache — then heal
      // replication so the progress proof WOULD grant.
      for (const [replicaId, nodeId] of SURPLUS_VOTERS) {
        insertServiceRow(fixture.leaderCache, replicaId, nodeId,
          RaftRole.FOLLOWER);
        insertServiceRow(fixture.learnerCache, replicaId, nodeId,
          RaftRole.FOLLOWER);
      }
      fixture.leaderTransport.state.dropToLearner = false;
      const capSeen = await waitFor(
        () => learnerDeferrals(fixture.learnerLog).some(
          (d) => d.reason === WOULD_EXCEED_TARGET),
        DRIVE_BUDGET_S * VIRTUAL_SECOND_MS,
      );
      assert.equal(capSeen, true,
        'above target+1 active voters the quorum-shape gate refuses');
      assert.equal(fixture.learner.role, RaftRole.LEARNER,
        'the voter cap is never weakened by a grantable proof');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'cpp-learner-active-within-bound: with the row withheld and the leader ' +
  'stalling, the learner is a voter within the bound on a proven proof',
  async (t) => {
    const drive = await runCppDrive();
    t.diagnostic(`learner voter at +${drive.activeAtS} s (HEAD floor ` +
      `${HEAD_ACTIVE_FLOOR_S} s, bound ${GREEN_ACTIVE_BOUND_S} s); row landed ` +
      `at +${drive.rowLandedAtS} s; kicks ${drive.kicks}; wake delay ` +
      `${drive.wakeDelayMs} ms; requests ${JSON.stringify(drive.requests)}; ` +
      `deferrals ${JSON.stringify(drive.deferrals)}`);
    assert.equal(drive.promoted, true, 'the learner became a voter');
    assert.ok(drive.activeAtS <= GREEN_ACTIVE_BOUND_S,
      `voter by +${GREEN_ACTIVE_BOUND_S} s (observed +${drive.activeAtS} s)`);
    assert.ok(drive.deferrals.some(([reason, cause]) =>
      reason === REQUEST_INVALID && cause === CAUSE_ADDRESS_UNRESOLVABLE),
    'the first refusal is typed learner_address_unresolvable');
    assert.ok(drive.kicks >= 1, 'the learner re-asserted its services row');
    assert.ok(drive.wakeDelayMs !== null && drive.wakeDelayMs < WAKE_BOUND_MS,
      `the proof re-request follows the row landing within ${WAKE_BOUND_MS} ms`);
    assert.ok(drive.proof, 'promotion was granted on a proof');
    assert.equal(drive.proof.learnerMatchIndex, drive.proof.safePromotionIndex,
      'the granted proof has learnerMatchIndex === safePromotionIndex');
    assert.equal(drive.proof.safePromotionIndex, COMMITTED_ENTRY_COUNT,
      'the safe promotion index is the leader committed prefix');
    assert.equal(drive.proof.membershipEpoch, PUBLISHED_EPOCH_ONE);
    assert.equal(drive.leaderEpoch, drive.learnerEpoch,
      'leader and learner observe the same published epoch');
    assert.equal(drive.learnerEpoch, PUBLISHED_EPOCH_ONE);
  },
);

test(
  'witness-deterministic: two identical cpp drives produce the identical ' +
  'refusal/wake event sequence and outcome',
  async (t) => {
    const first = await runCppDrive();
    const second = await runCppDrive();
    t.diagnostic(`drive 1: +${first.activeAtS} s ${describeDrive(first)}`);
    t.diagnostic(`drive 2: +${second.activeAtS} s ${describeDrive(second)}`);
    assert.equal(describeDrive(second), describeDrive(first),
      'identical drives produce the identical event sequence');
    assert.ok(first.activeAtS <= GREEN_ACTIVE_BOUND_S,
      'both drives land inside the bound');
  },
);
