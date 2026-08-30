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
  readLeaderReplicationToLearner,
  recordServiceLog,
  resetFixtureRuntime,
  touchPublishedEpochRow,
  updateServiceRow,
  waitFor,
  waitForLeaderReplicationToLearner,
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
//     LEADER_AWAKE_S awake) and, when a sustained app-channel latency is
//     injected, every proof round trip takes that long: a proof delivery
//     completes when its delay elapses, or fails with a timeout when its
//     bound expires first — the router semantics of
//     transport.deliver({timeoutMs}), with the transport's configured
//     messageTimeoutMs (the router default MESSAGE_TIMEOUT_MS on the
//     scenario clock) when no bound is given.
//
// SCENARIO CLOCK: liferaft's heartbeat/election timers are wall-clock, so
// the drive runs on a scaled real clock: one scenario second is the
// learner's proof retry interval in real milliseconds (VIRTUAL_SECOND_MS).
// Every injected delay and every bound is a multiple of that interval;
// timings are reported in scenario seconds. The wake bound is half an
// interval: an event-driven re-request lands within a few milliseconds,
// a timer-only re-request no earlier than a full interval.
//
// ROW LANDING SCHEDULE (quest
// learner-promotion-proof-channel-witness-determinism): the durable landing
// of the learner's services row is an explicit fixture schedule, never a
// wall-clock race. The leader cache gains the row first (INSERT; the leader
// joins the learner as a raft peer and replicates the committed prefix on
// liferaft's wall-clock heartbeat), the fixture then waits until the leader
// has PROVEN that replication (its own learnerMatchIndex observable at the
// committed prefix — the proof's input, never elapsed time), and only then
// does the target's own cache see its local-only seed row converge
// (UPDATE, the services_row_visible wake). The wake proof request therefore
// always meets a caught-up learner: two drives yield the identical
// sequence on any host. Before this schedule both landings were applied
// together and the wake request raced the leader's first append+ack on the
// host event loop — progress_behind then a cadence grant when the request
// won, a direct grant when it lost under load.
//
// Each test below is one quest receipt
// (scripts/quest-evidence-learner-promotion-proof-channel-wake.js and
// scripts/quest-evidence-learner-promotion-proof-channel-witness-determinism.js).

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
// The router-configured message timeout on the scenario clock: the proof
// delivery timeout is exactly this value, never a multiple of the cadence.
const ROUTER_TIMEOUT_MS = ROUTER_DEFAULT_TIMEOUT_S * VIRTUAL_SECOND_MS;
const SUSTAINED_LATENCY_S = 3;
const NO_LATENCY_S = 0;
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
// Churn windows: the learner settles on its cadence, then CHURN_COUNT
// same-content changes land CHURN_SPACING_MS apart, then the log is read
// after CHURN_OBSERVE_INTERVALS more intervals. A transition-only wake
// yields exactly one immediate wake in the window; a change-notification
// wake yields one per change (the rejected candidate: 51 / 52).
const SETTLE_INTERVALS = 3;
const CHURN_COUNT = 50;
const CHURN_SPACING_MS = 5;
const CHURN_OBSERVE_INTERVALS = 2;
const CHURN_WINDOW_INTERVALS = CHURN_OBSERVE_INTERVALS + Math.ceil(
  (CHURN_COUNT * CHURN_SPACING_MS) / RETRY_INTERVAL_MS,
);
// Cadence ticks that fit the churn window, plus the one wake and one
// boundary tick: the ceiling for checks that are NOT churn-driven.
const MAX_CHURN_WINDOW_CHECKS = CHURN_WINDOW_INTERVALS + 2;
const SINGLE_WAKE = 1;
const NO_REQUESTS = 0;
const SCHEDULING_SLACK_MS = VIRTUAL_SECOND_MS / 2;
const REQUEST_INVALID = LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID;
const PROGRESS_BEHIND = LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND;
const PROGRESS_PROVEN = LEARNER_PROMOTION_PROOF_REASON.PROGRESS_PROVEN;
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
const WAKE_DELAY_MS = PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_WAKE_DELAY_MS;
// The exact cpp drive on the row landing schedule: one typed refusal while
// the row is withheld, one CL-021 kick, one services_row_visible wake, and
// the wake proof request granted — never a progress_behind cycle.
const SINGLE_KICK = 1;
const NO_REQUESTS_DURING_LANDING = 0;
const QUANTIZED_DEFERRALS = Object.freeze([
  [REQUEST_INVALID, CAUSE_ADDRESS_UNRESOLVABLE],
]);
const QUANTIZED_REQUEST_OUTCOMES =
  Object.freeze([REQUEST_INVALID, PROGRESS_PROVEN]);
const QUANTIZED_WAKES = Object.freeze([WAKE_SERVICES_ROW_VISIBLE]);

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
// carried epoch, delivery bound) and applies the leader stall plus the
// sustained round-trip latency with the router's timeout semantics. Like
// the message router it carries its configured messageTimeoutMs — the
// bound the learner passes explicitly on every proof delivery.
function createProofChannelTransport(inner, clock, stallPlan, latencyMs) {
  const requests = [];
  const listeners = {onResponse: null};
  return {
    requests,
    listeners,
    messageTimeoutMs: ROUTER_TIMEOUT_MS,
    register: (address, handler) => inner.register(address, handler),
    unregister: (address) => inner.unregister(address),
    deliver: async (address, payload, options) => {
      if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF) {
        return inner.deliver(address, payload, options);
      }
      const request = recordProofRequest(requests, clock, payload, options);
      const boundMs = resolveDeliveryBoundMs(options, ROUTER_TIMEOUT_MS);
      const delayMs =
        stallPlan.remainingStallMs(request.sentAtMs) + latencyMs;
      if (delayMs > boundMs) {
        return failProofDeliveryAtBound(request, clock, boundMs);
      }
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      const response = await inner.deliver(address, payload, options);
      completeProofRequest(request, clock, response, listeners);
      return response;
    },
  };
}

// The durable landing of the learner's services row on the fixture's
// explicit schedule (see ROW LANDING SCHEDULE above): (1) the leader cache
// gains the row (INSERT, CDC fan-out; the leader joins the learner as a
// raft peer), (2) the fixture waits for the leader to PROVE the learner's
// replication on its own match-index observable, (3) the target's own
// cache sees its local-only seed row converge (UPDATE — the wake).
// landedAtMs / requestCountAtLanding anchor step 3, the learner-visible
// landing. Idempotent; never rejects; cancelled by fixture shutdown.
function createRowLanding(clock) {
  const landing = {
    landedAtMs: null,
    requestCountAtLanding: null,
    leaderLandedAtMs: null,
    requestCountAtLeaderLanding: null,
    replicationProven: null,
    replicationAtLanding: null,
    fixture: null,
    cancelled: false,
    settled: null,
  };
  landing.cancel = () => {
    landing.cancelled = true;
  };
  landing.land = () => {
    if (landing.settled !== null || !landing.fixture) {
      return landing.settled || Promise.resolve();
    }
    const {fixture} = landing;
    landing.leaderLandedAtMs = clock.now();
    landing.requestCountAtLeaderLanding =
      fixture.learnerTransport.requests.length;
    insertServiceRow(
      fixture.leaderCache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER,
    );
    landing.settled = waitForLeaderReplicationToLearner(
      fixture.leader, DRIVE_BUDGET_S * VIRTUAL_SECOND_MS,
      {isCancelled: () => landing.cancelled},
    ).then((proven) => {
      landing.replicationProven = proven;
      landing.replicationAtLanding =
        readLeaderReplicationToLearner(fixture.leader);
      landing.landedAtMs = clock.now();
      landing.requestCountAtLanding =
        fixture.learnerTransport.requests.length;
      updateServiceRow(
        fixture.learnerCache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER,
      );
    });
    return landing.settled;
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
      return landing.land().then(() => kicks.length);
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

// Every immediate wake of one typed reason: the ones that armed the check
// now and the ones coalesced into an in-flight check.
function immediateWakeCount(learnerLog, wakeReason) {
  return learnerLog.filter((entry) =>
    (entry.message === PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED &&
      entry.payload?.delayMs === WAKE_DELAY_MS &&
      entry.payload?.scheduleReason === wakeReason) ||
    (entry.message ===
      PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_WAKE_COALESCED &&
      entry.payload?.wakeReason === wakeReason)).length;
}

// Observe a churn window: settle, mark, apply the changes, observe.
async function driveChurnWindow(fixture, applyChange) {
  await sleep(SETTLE_INTERVALS * RETRY_INTERVAL_MS);
  const logIndex = fixture.learnerLog.length;
  const requestCount = fixture.transport.requests.length;
  for (let seq = 0; seq < CHURN_COUNT; seq++) {
    applyChange(seq);
    await sleep(CHURN_SPACING_MS);
  }
  await sleep(CHURN_OBSERVE_INTERVALS * RETRY_INTERVAL_MS);
  return {
    log: fixture.learnerLog.slice(logIndex),
    requests: fixture.transport.requests.length - requestCount,
  };
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
  const latencyMs = (options.latencyS ?? NO_LATENCY_S) * VIRTUAL_SECOND_MS;
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
      transport =
        createProofChannelTransport(inner, clock, stallPlan, latencyMs);
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
      () => {
        landing.land();
      },
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
      landing.cancel();
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
      // The landing schedule as observed: replication proven before the
      // learner-visible landing, the phase length in real ms, and the proof
      // requests sent inside the phase (must be none).
      replicationProven: fixture.landing.replicationProven,
      replicationAtLanding: fixture.landing.replicationAtLanding,
      landingPhaseMs: fixture.landing.landedAtMs === null ?
        null :
        fixture.landing.landedAtMs - fixture.landing.leaderLandedAtMs,
      requestsDuringLanding: fixture.landing.requestCountAtLanding === null ?
        null :
        fixture.landing.requestCountAtLanding -
          fixture.landing.requestCountAtLeaderLanding,
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
      assert.equal(requests[0].timeoutMs, fixture.transport.messageTimeoutMs,
        'the delivery timeout is the router-configured message timeout, ' +
        'passed explicitly');
      assert.equal(requests[0].timeoutMs, ROUTER_TIMEOUT_MS,
        `the router-configured timeout is ${ROUTER_DEFAULT_TIMEOUT_S} s of ` +
        'scenario time, never bounded to a multiple of the cadence');
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
          spacingMs <= ROUTER_TIMEOUT_MS + RETRY_INTERVAL_MS +
            SCHEDULING_SLACK_MS,
          'the next request is scheduled from completion: a timeout never ' +
            `stacks beyond timeout + interval (spacing ${spacingMs} ms)`);
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
  'proof-delivery-timeout-bounded-and-logged-under-latency: with the ' +
  'router-configured timeout as the bound, a sustained 3 s round trip ' +
  'still promotes',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({
      publishedEpoch: PUBLISHED_EPOCH_ONE,
      latencyS: SUSTAINED_LATENCY_S,
    });
    try {
      const promoted = await waitForPromotion(fixture);
      const activeAtS = seconds(fixture.clock, fixture.clock.now());
      const {requests} = fixture.transport;
      t.diagnostic(`latency ${SUSTAINED_LATENCY_S} s: promoted=${promoted} ` +
        `at +${activeAtS} s; deliveries ${JSON.stringify(requests.map((r) => [
          seconds(fixture.clock, r.sentAtMs), r.timeoutMs, r.outcome,
        ]))}`);
      assert.ok(requests.length >= 1, 'a proof was delivered');
      assert.equal(requests[0].timeoutMs, fixture.transport.messageTimeoutMs,
        'timeoutMs is the router-configured message timeout');
      assert.equal(requests[0].timeoutMs, ROUTER_TIMEOUT_MS,
        `the bound is ${ROUTER_DEFAULT_TIMEOUT_S} s of scenario time ` +
        '(the router default), not 2 x the cadence');
      assert.equal(promoted, true,
        `a ${SUSTAINED_LATENCY_S} s round trip below the router timeout ` +
        'promotes (a cadence-multiple bound times out forever)');
      assert.ok(requests.every((request) => request.outcome !== OUTCOME_TIMEOUT),
        'no delivery timed out below the router timeout');
      assert.ok(activeAtS <= GREEN_ACTIVE_BOUND_S,
        `voter by +${GREEN_ACTIVE_BOUND_S} s (observed +${activeAtS} s)`);
      assert.ok(grantedProof(fixture), 'promotion was granted on a proof');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'proof-wakes-on-published-epoch-change-transition-only: a learner ' +
  'deferred before the proof gate wakes once per epoch transition, never ' +
  'per publication change',
  async (t) => {
    configureFixtureRuntime();
    const fixture = await createChannelFixture({startPartitioned: true});
    try {
      // Surplus ACTIVE voters cap the learner in the quorum-shape gate, so
      // no proof is ever requested: the wake state has no request to
      // anchor on and must track the observed epoch itself.
      for (const [replicaId, nodeId] of SURPLUS_VOTERS) {
        insertServiceRow(fixture.leaderCache, replicaId, nodeId,
          RaftRole.FOLLOWER);
        insertServiceRow(fixture.learnerCache, replicaId, nodeId,
          RaftRole.FOLLOWER);
      }
      const capSeen = await waitFor(
        () => learnerDeferrals(fixture.learnerLog).some(
          (d) => d.reason === WOULD_EXCEED_TARGET),
        DRIVE_BUDGET_S * VIRTUAL_SECOND_MS,
      );
      assert.equal(capSeen, true, 'the learner defers before the proof gate');
      const window = await driveChurnWindow(fixture, (seq) => {
        if (seq === 0) {
          insertPublishedEpochRow(fixture.learnerCache, PUBLISHED_EPOCH_ONE);
        }
        touchPublishedEpochRow(fixture.learnerCache, PUBLISHED_EPOCH_ONE, seq);
      });
      const wakes = immediateWakeCount(window.log, WAKE_PUBLISHED_EPOCH_CHANGED);
      const deferrals = learnerDeferrals(window.log).length;
      t.diagnostic(`1 epoch insert + ${CHURN_COUNT} same-epoch updates: ` +
        `immediate wakes ${wakes}, info deferrals ${deferrals}, proof ` +
        `requests ${window.requests}`);
      assert.equal(wakes, SINGLE_WAKE,
        'exactly one published_epoch_changed wake: the epoch transition, ' +
        `not the ${CHURN_COUNT} same-epoch publication changes`);
      assert.ok(deferrals <= MAX_CHURN_WINDOW_CHECKS,
        `info deferrals stay on the cadence (${deferrals} in the window)`);
      assert.equal(window.requests, NO_REQUESTS,
        'the capped learner never reaches the proof gate (gate order unchanged)');
      assert.equal(fixture.learner.learnerPromotionWake.observedMembershipEpoch,
        PUBLISHED_EPOCH_ONE, 'the hook itself tracks the observed epoch');
      assert.equal(fixture.learner.role, RaftRole.LEARNER,
        'no wake ever promotes');
    } finally {
      await fixture.shutdown();
      resetFixtureRuntime();
    }
  },
);

test(
  'proof-wakes-on-services-row-visibility-transition-only: the own row ' +
  'wakes once when it first becomes visible, never on later row updates',
  async (t) => {
    configureFixtureRuntime();
    // Replication is partitioned so every proof is refused progress_behind
    // and the learner stays a learner for the whole window; its own row is
    // the fixture's seed (never observed by the learner) until the first
    // durable landing below.
    const fixture = await createChannelFixture({startPartitioned: true});
    try {
      const window = await driveChurnWindow(fixture, () => {
        updateServiceRow(
          fixture.learnerCache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER,
        );
      });
      const wakes = immediateWakeCount(window.log, WAKE_SERVICES_ROW_VISIBLE);
      t.diagnostic(`${CHURN_COUNT} own-row updates (first = the durable ` +
        `landing): immediate wakes ${wakes}, proof requests ` +
        `${window.requests} (cadence ceiling ${MAX_CHURN_WINDOW_CHECKS})`);
      assert.equal(wakes, SINGLE_WAKE,
        'exactly one services_row_visible wake: the local-only -> visible ' +
        `transition, not the ${CHURN_COUNT - 1} later updates of the row`);
      assert.ok(window.requests <= MAX_CHURN_WINDOW_CHECKS,
        'proof requests stay on the cadence plus the one wake ' +
        `(${window.requests} in the window)`);
      assert.equal(fixture.learner.learnerPromotionWake.ownServicesRowVisible,
        true, 'the wake state records the visible own row');
      assert.equal(fixture.learner.role, RaftRole.LEARNER,
        'no wake ever promotes');
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

test(
  'witness-landing-quantized: the row landing is the fixture\'s explicit ' +
  'schedule — the leader proves the learner\'s replication before the ' +
  'learner-visible landing, so the wake proof request never races it',
  async (t) => {
    const drive = await runCppDrive();
    t.diagnostic(`landing phase ${drive.landingPhaseMs} ms real (cadence ` +
      `${RETRY_INTERVAL_MS} ms); replication at landing ` +
      `${JSON.stringify(drive.replicationAtLanding)}; requests during ` +
      `landing ${drive.requestsDuringLanding}; requests ` +
      `${JSON.stringify(drive.requests)}; deferrals ` +
      `${JSON.stringify(drive.deferrals)}; voter at +${drive.activeAtS} s`);
    assert.equal(drive.replicationProven, true,
      'the leader proved the learner\'s replication (match index at the ' +
      'committed prefix) before the learner-visible landing');
    assert.equal(drive.replicationAtLanding.matchIndex, COMMITTED_ENTRY_COUNT,
      'the leader-observed match index at the landing is the committed prefix');
    assert.equal(drive.requestsDuringLanding, NO_REQUESTS_DURING_LANDING,
      'no proof request was sent between the leader-side and the ' +
      'learner-visible landing');
    assert.deepEqual(drive.deferrals, QUANTIZED_DEFERRALS,
      'exactly one refusal, typed learner_address_unresolvable — never a ' +
      'progress_behind cycle');
    assert.deepEqual(drive.requests.map(([, outcome]) => outcome),
      QUANTIZED_REQUEST_OUTCOMES,
      'exactly two proof round trips: the withheld-row refusal and the ' +
      'granted wake request');
    assert.deepEqual(drive.wakes, QUANTIZED_WAKES,
      'exactly one wake, typed services_row_visible');
    assert.equal(drive.kicks, SINGLE_KICK, 'exactly one CL-021 kick');
    assert.equal(drive.promoted, true, 'the learner became a voter');
    assert.ok(drive.wakeDelayMs !== null && drive.wakeDelayMs < WAKE_BOUND_MS,
      `the granted request follows the landing within ${WAKE_BOUND_MS} ms`);
    assert.equal(drive.proof.learnerMatchIndex, drive.proof.safePromotionIndex,
      'the grant carries learnerMatchIndex === safePromotionIndex');
  },
);
