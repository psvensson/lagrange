/**
 * Learner-promotion proof-channel wake (quest
 * learner-promotion-proof-channel-wake): unit seams of the promotion owner
 * around the existing single-flight schedule — an event wake re-arms the
 * one timer now (the cadence stays the floor), wakes during an in-flight
 * check coalesce into one immediate re-check, the cache-change hook wakes
 * only on CONTENT TRANSITIONS (the first observation of the learner's own
 * services row; the latest PUBLISHED epoch differing from the last observed
 * value — churn of either is silent), the learner_address_unresolvable
 * cause re-asserts the durable row through the replica state machine, and
 * the proof delivery timeout is the router-configured message timeout.
 * Promotion itself is untouched: the dt6 witnesses prove the proof
 * semantics end to end.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  PartitionService,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
} from '../../src/partition/partition-service-constants.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  LEARNER_PROMOTION_PROOF_REASON,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
  evaluateLearnerPromotionProof,
  refuseLearnerPromotionProof,
} from '../../src/raft/learner-promotion-progress.js';

const PARTITION_ID = 'wake-partition';
const LEARNER_REPLICA_ID = 'replica-learner';
const OTHER_REPLICA_ID = 'replica-other';
const NODE_ID = 'node-learner';
const RETRY_INTERVAL_MS = 1000;
const SHORT_RETRY_INTERVAL_MS = 10;
const ROUTER_TIMEOUT_MS = 7000;
const CONFIGURED_TIMEOUT_MS = 1234;
const BOOTSTRAP_EPOCH = 0;
const PUBLISHED_EPOCH = 1;
const NEXT_PUBLISHED_EPOCH = 2;
const CHURN_COUNT = 50;
const CHURN_OPERATIONS = [
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.UPSERT,
];
const SCHEDULE_REASON = PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createLearner(options = {}) {
  const partition = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: 'wake-table',
    replicaId: LEARNER_REPLICA_ID,
    replicaIds: [LEARNER_REPLICA_ID],
    nodeId: NODE_ID,
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    learnerCatchUpCheckIntervalMs:
      options.retryIntervalMs || RETRY_INTERVAL_MS,
    replicaStateMachine: options.replicaStateMachine,
    transport: options.transport,
  });
  partition.role = RaftRole.LEARNER;
  return partition;
}

// Timer seam: capture arm/clear without running any check.
function stubTimers(t) {
  const armed = [];
  const cleared = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback, delayMs) => {
    const handle = {callback, delayMs};
    armed.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    cleared.push(handle);
  };
  t.teardown(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });
  return {armed, cleared};
}

test('an event wake re-arms the single timer immediately; the cadence ' +
  'stays the delay of a plain reschedule', async (t) => {
  const timers = stubTimers(t);
  const partition = createLearner();
  partition.scheduleLearnerPromotion(SCHEDULE_REASON.DEFERRED_RECHECK);
  t.equal(timers.armed.length, 1, 'one timer armed');
  t.equal(timers.armed[0].delayMs, RETRY_INTERVAL_MS,
    'a plain reschedule waits the retry cadence');
  const cadenceTimer = partition.learnerPromotionTimer;

  partition.wakeLearnerPromotion(SCHEDULE_REASON.SERVICES_ROW_VISIBLE);
  t.equal(timers.cleared[0], cadenceTimer,
    'the wake clears the armed cadence timer (still one timer)');
  t.equal(timers.armed.length, 2, 'the wake re-arms the same single timer');
  t.equal(timers.armed[1].delayMs,
    PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_WAKE_DELAY_MS,
    'the wake arms the check now');
  t.equal(partition.learnerPromotionTimer, timers.armed[1],
    'the wake timer is the owner timer');

  partition.scheduleLearnerPromotion(SCHEDULE_REASON.DEFERRED_RECHECK);
  t.equal(timers.armed.length, 2,
    'a plain reschedule never pre-empts an armed timer');
  partition.learnerPromotionTimer = null;
});

test('wakes during an in-flight check coalesce into one immediate ' +
  're-check once the check completes', async (t) => {
  const timers = stubTimers(t);
  const partition = createLearner();
  partition.learnerPromotionWake.checkInFlight = true;
  partition.wakeLearnerPromotion(SCHEDULE_REASON.SERVICES_ROW_VISIBLE);
  partition.wakeLearnerPromotion(SCHEDULE_REASON.PUBLISHED_EPOCH_CHANGED);
  t.equal(timers.armed.length, 0,
    'no timer is armed while the check is in flight (single-flight)');
  t.equal(partition.learnerPromotionWake.pendingReasons.size, 2,
    'both wake reasons are pending');

  partition.drainLearnerPromotionWake();
  t.equal(partition.learnerPromotionWake.checkInFlight, false,
    'the drain marks the check complete');
  t.equal(partition.learnerPromotionWake.pendingReasons.size, 0,
    'the drain consumes the pending wakes');
  t.equal(timers.armed.length, 1, 'exactly one immediate re-check');
  t.equal(timers.armed[0].delayMs,
    PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_WAKE_DELAY_MS,
    'the drained re-check runs now');
  partition.learnerPromotionTimer = null;

  partition.learnerPromotionWake.checkInFlight = true;
  partition.wakeLearnerPromotion(SCHEDULE_REASON.SERVICES_ROW_VISIBLE);
  partition.role = RaftRole.FOLLOWER;
  partition.drainLearnerPromotionWake();
  t.equal(timers.armed.length, 1,
    'a promoted replica drains without re-arming');
});

function churnOwnRow(partition, ownRow) {
  for (let seq = 0; seq < CHURN_COUNT; seq++) {
    partition.observeLearnerPromotionWakeSource(
      TABLES.SERVICES, CHURN_OPERATIONS[seq % CHURN_OPERATIONS.length],
      {...ownRow, churn: seq},
    );
  }
}

function churnPublications(partition) {
  for (let seq = 0; seq < CHURN_COUNT; seq++) {
    partition.observeLearnerPromotionWakeSource(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      CHURN_OPERATIONS[seq % CHURN_OPERATIONS.length],
      {publication_id: `p-${seq}`},
    );
  }
}

test('the cache-change hook wakes on the first observation of the ' +
  'learner\'s own services row and on a published-epoch transition; ' +
  'churn of either is silent', async (t) => {
  const partition = createLearner();
  const wakes = [];
  partition.wakeLearnerPromotion = (reason) => wakes.push(reason);
  let membershipEpoch = BOOTSTRAP_EPOCH;
  partition.resolveLearnerPromotionMembershipEpoch = () => membershipEpoch;
  const ownRow = {
    service_id: LEARNER_REPLICA_ID,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: NODE_ID,
  };

  partition.observeLearnerPromotionWakeSource(
    TABLES.SERVICES, CDCOperation.INSERT, {...ownRow, service_id: OTHER_REPLICA_ID},
  );
  partition.observeLearnerPromotionWakeSource(
    TABLES.SERVICES, CDCOperation.INSERT, {...ownRow, partition_id: 'other'},
  );
  partition.observeLearnerPromotionWakeSource(
    TABLES.PARTITIONS, CDCOperation.UPDATE, {partition_id: PARTITION_ID},
  );
  partition.observeLearnerPromotionWakeSource(
    TABLES.SERVICES, CDCOperation.INSERT, null,
  );
  t.same(wakes, [], 'peer rows, other partitions and other tables never wake');
  t.equal(partition.learnerPromotionWake.ownServicesRowVisible, false,
    'the own row is unobserved until the hook sees it');

  partition.observeLearnerPromotionWakeSource(
    TABLES.SERVICES, CDCOperation.UPDATE, ownRow,
  );
  t.same(wakes, [SCHEDULE_REASON.SERVICES_ROW_VISIBLE],
    'the first observation of the own row wakes services_row_visible');
  t.equal(partition.learnerPromotionWake.ownServicesRowVisible, true,
    'the wake state records the visible own row');
  churnOwnRow(partition, ownRow);
  t.equal(wakes.length, 1,
    `${CHURN_COUNT} later updates of the visible own row never wake`);

  churnPublications(partition);
  t.equal(wakes.length, 1,
    `${CHURN_COUNT} publication changes at the observed epoch are silent`);
  membershipEpoch = PUBLISHED_EPOCH;
  partition.observeLearnerPromotionWakeSource(
    TABLES.CONTROL_PLANE_PUBLICATIONS, CDCOperation.INSERT,
    {publication_id: 'p-epoch-1'},
  );
  t.same(wakes, [
    SCHEDULE_REASON.SERVICES_ROW_VISIBLE,
    SCHEDULE_REASON.PUBLISHED_EPOCH_CHANGED,
  ], 'a newer published epoch wakes published_epoch_changed');
  t.equal(partition.learnerPromotionWake.observedMembershipEpoch,
    PUBLISHED_EPOCH, 'the hook itself records the observed epoch');
  churnPublications(partition);
  t.equal(wakes.length, 2,
    'same-epoch publication changes after the transition are silent even ' +
    'though no proof was ever requested');
  membershipEpoch = NEXT_PUBLISHED_EPOCH;
  partition.observeLearnerPromotionWakeSource(
    TABLES.CONTROL_PLANE_PUBLICATIONS, CDCOperation.UPDATE,
    {publication_id: 'p-epoch-2'},
  );
  t.equal(wakes.length, 3, 'every epoch transition wakes exactly once');

  partition.role = RaftRole.FOLLOWER;
  membershipEpoch = BOOTSTRAP_EPOCH;
  partition.observeLearnerPromotionWakeSource(
    TABLES.CONTROL_PLANE_PUBLICATIONS, CDCOperation.UPDATE,
    {publication_id: 'p-epoch-0'},
  );
  const voter = createLearner();
  voter.role = RaftRole.FOLLOWER;
  voter.wakeLearnerPromotion = (reason) => wakes.push(reason);
  voter.observeLearnerPromotionWakeSource(
    TABLES.SERVICES, CDCOperation.UPDATE, ownRow,
  );
  t.equal(wakes.length, 3, 'a voter never wakes the promotion check');
});

test('the learner start seeds the observed epoch from its cache, so the ' +
  'epoch already hydrated is not a transition', async (t) => {
  const partition = createLearner();
  const wakes = [];
  partition.wakeLearnerPromotion = (reason) => wakes.push(reason);
  partition.resolveLearnerPromotionMembershipEpoch = () => PUBLISHED_EPOCH;
  t.equal(partition.learnerPromotionWake.observedMembershipEpoch,
    BOOTSTRAP_EPOCH, 'the wake state starts at the bootstrap epoch');
  partition.seedLearnerPromotionWakeObservation();
  t.equal(partition.learnerPromotionWake.observedMembershipEpoch,
    PUBLISHED_EPOCH, 'the seed observes the hydrated epoch');
  t.equal(partition.learnerPromotionWake.ownServicesRowVisible, false,
    'the seed leaves the own row unobserved (its durable landing is the ' +
    'transition under watch)');
  churnPublications(partition);
  t.same(wakes, [], 'publication churn at the seeded epoch never wakes');
});

test('learner_address_unresolvable re-asserts the durable services row ' +
  'through the replica state machine; no other cause does', async (t) => {
  const kicks = [];
  const partition = createLearner({
    replicaStateMachine: {
      reconcileLocalOnlyServiceRowsNow() {
        kicks.push(Date.now());
        return Promise.resolve(0);
      },
    },
  });
  partition.reactToLearnerPromotionRefusalCause(refuseLearnerPromotionProof(
    LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
    LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
  ));
  t.equal(kicks.length, 1, 'the unresolvable cause kicks the CL-021 retry');
  partition.reactToLearnerPromotionRefusalCause(refuseLearnerPromotionProof(
    LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
    LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.REQUEST_SHAPE,
  ));
  partition.reactToLearnerPromotionRefusalCause(refuseLearnerPromotionProof(
    LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
    LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.DELIVERY_FAILED,
  ));
  partition.reactToLearnerPromotionRefusalCause(evaluateLearnerPromotionProof({
    raftIsLeader: true,
    currentTerm: 1,
    committedIndex: 1,
    learnerMatchIndex: 0,
    leaderMembershipEpoch: BOOTSTRAP_EPOCH,
    learnerMembershipEpoch: BOOTSTRAP_EPOCH,
  }));
  t.equal(kicks.length, 1,
    'request_shape, transport failures and evaluated refusals never kick');

  const bootstrapLearner = createLearner();
  t.doesNotThrow(
    () => bootstrapLearner.reactToLearnerPromotionRefusalCause(
      refuseLearnerPromotionProof(
        LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
      ),
    ),
    'without a replica state machine there is no deferred row to re-assert',
  );
});

test('the proof delivery timeout is the router-configured message timeout, ' +
  'never a cadence multiple', async (t) => {
  const bare = createLearner();
  t.equal(bare.resolveLearnerPromotionProofDeliveryTimeoutMs(),
    TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
    'without a router timeout the transport default (5000 ms) applies');
  const routed = createLearner({
    retryIntervalMs: SHORT_RETRY_INTERVAL_MS,
    transport: {messageTimeoutMs: ROUTER_TIMEOUT_MS},
  });
  t.equal(routed.resolveLearnerPromotionProofDeliveryTimeoutMs(),
    ROUTER_TIMEOUT_MS,
    'the router\'s own messageTimeoutMs passes through unbounded, ' +
    'independent of the cadence');
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'test-node'},
    transport: {messageTimeoutMs: CONFIGURED_TIMEOUT_MS},
  });
  const configured = createLearner();
  t.equal(configured.resolveLearnerPromotionProofDeliveryTimeoutMs(),
    CONFIGURED_TIMEOUT_MS,
    'a configured transport.messageTimeoutMs resolves the way the router ' +
    'resolves it');
});
