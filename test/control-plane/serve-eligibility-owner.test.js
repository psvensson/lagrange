import {test} from '../../src/test-helpers/tap.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  ServeEligibilityOwner,
  isServeEligibilityAnswerEligible,
} from '../../src/control-plane/serve-eligibility-owner.js';

const NODE_A = 'node-a';
const INITIAL_NOW_MS = 1000;
const LEASE_EXPIRES_AT_MS = 5000;
const READ_TIMEOUT_MS = 2500;
const READ_FAILURE_RETRY_MS = 100;
const EPOCH_THREE = 3;
const EPOCH_FOUR = 4;
const EPOCH_FIVE = 5;

function buildNodeRow(nodeId = NODE_A, leaseExpiresAtMs = LEASE_EXPIRES_AT_MS) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAtMs,
  };
}

function buildPublicationRow(publicationEpoch, nodeIds = [NODE_A]) {
  return {
    publication_id: `cluster_membership-${publicationEpoch}`,
    publication_kind: 'cluster_membership',
    publication_epoch: publicationEpoch,
    publisher_node_id: NODE_A,
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
    priority_partition_summary: JSON.stringify({
      satisfied: true,
      blockedPartitions: [],
    }),
    status: 'PUBLISHED',
  };
}

function createHarness({
  initialNowMs = INITIAL_NOW_MS,
  nodes = [buildNodeRow()],
  publications = [buildPublicationRow(EPOCH_FIVE)],
} = {}) {
  const state = {
    nowMs: initialNowMs,
    failReads: false,
    nodes,
    publications,
    readCount: 0,
    timers: [],
  };
  const owner = new ServeEligibilityOwner({
    now: () => state.nowMs,
    readTimeoutMs: READ_TIMEOUT_MS,
    isNodeLoadReady: () => true,
    setTimeout: (fn, delayMs) => {
      const timer = {
        delayMs,
        cleared: false,
        fn: () => {
          timer.cleared = true;
          fn();
        },
      };
      state.timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) {
        timer.cleared = true;
      }
    },
    readCommittedRows: async (tableName) => {
      state.readCount += 1;
      if (state.failReads) {
        return {success: false, rows: []};
      }
      if (tableName === TABLES.NODES) {
        return {success: true, rows: state.nodes};
      }
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        return {success: true, rows: state.publications};
      }
      return {success: false, rows: []};
    },
  });
  return {owner, state};
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test(
  'ServeEligibilityOwner expired lease while refresh fails becomes ineligible and does not arm a 0ms retry loop',
  async (t) => {
    const {owner, state} = createHarness();
    await owner.readServeEligibility();

    t.equal(
      isServeEligibilityAnswerEligible(owner.answer(NODE_A)),
      true,
      'node is initially eligible before lease expiry',
    );
    t.equal(state.timers.length, 1, 'initial future lease timer is armed');
    t.equal(
      state.timers[0].delayMs,
      LEASE_EXPIRES_AT_MS - INITIAL_NOW_MS,
      'initial timer is scheduled for leaseExpiresAtMs - nowMs',
    );

    // Advance clock to lease expiration while refresh reads fail.
    state.nowMs = LEASE_EXPIRES_AT_MS;
    state.failReads = true;

    const expiredAnswer = owner.answer(NODE_A);
    t.equal(
      isServeEligibilityAnswerEligible(expiredAnswer),
      false,
      'eligibility for the expired node becomes false at leaseExpiresAtMs',
    );
    t.equal(
      expiredAnswer.state,
      SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
      'expired lease answers unavailable',
    );
    t.equal(
      expiredAnswer.reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'expired lease reason is unavailable_stale',
    );

    // Let the scheduled refresh triggered by lease expiry run and fail.
    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }
    await flushMicrotasks();

    const activeTimers = state.timers.filter((timer) => !timer.cleared);
    t.equal(
      activeTimers.length,
      0,
      'armLeaseRefresh does not arm a 0ms timer for an already-expired lease',
    );
    t.equal(
      owner.leaseRefreshHandle,
      null,
      'leaseRefreshHandle remains null after failed refresh on expired lease',
    );
    const readCountAfterFailure = state.readCount;
    await flushMicrotasks();
    t.equal(
      state.readCount,
      readCountAfterFailure,
      'no background retry loop spins after failed refresh',
    );

    owner.shutdown();
    t.end();
  },
);

test(
  'ServeEligibilityOwner rejects regressed publication epoch after noteSourceChange and adopts when epoch catches up',
  async (t) => {
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_THREE)],
    });
    await owner.readServeEligibility();
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_THREE,
      'initial record is adopted at epoch 3',
    );
    t.equal(owner.superseded, false, 'initial record is not superseded');

    // Source change announces publication_epoch = 5, but the next refresh
    // reads a stale source at publication_epoch = 4.
    state.publications = [buildPublicationRow(EPOCH_FOUR)];
    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
      publication_kind: 'cluster_membership',
      publication_epoch: EPOCH_FIVE,
    });
    t.equal(
      owner.minPublicationEpoch,
      EPOCH_FIVE,
      'minPublicationEpoch tracks observed publication_epoch = 5',
    );
    t.equal(owner.superseded, true, 'noteSourceChange marks owner superseded');

    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }

    t.equal(
      owner.superseded,
      true,
      'stale refresh at epoch 4 does not clear superseded',
    );
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_THREE,
      'stale refresh at epoch 4 does not overwrite the record',
    );
    t.equal(
      owner.answer(NODE_A).state,
      SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
      'owner stays unavailable while refresh epoch < minPublicationEpoch',
    );

    // Subsequent refresh returns publication_epoch = 5.
    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    await owner.readServeEligibility();

    t.equal(
      owner.superseded,
      false,
      'refresh at epoch 5 clears superseded',
    );
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_FIVE,
      'refresh at epoch 5 adopts the new record',
    );
    const currentAnswer = owner.answer(NODE_A);
    t.equal(currentAnswer.state, SERVE_ELIGIBILITY_STATE.READY);
    t.equal(currentAnswer.decision, SERVE_ELIGIBILITY_DECISION.ELIGIBLE);

    // Now test direct regression when this.record is already at epoch 5 and a
    // subsequent refresh returns epoch 4.
    state.publications = [buildPublicationRow(EPOCH_FOUR)];
    await owner.readServeEligibility();

    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_FIVE,
      'stale refresh at epoch 4 does not overwrite committed record at epoch 5',
    );
    t.equal(
      owner.superseded,
      true,
      'regressed refresh marks the memo superseded',
    );

    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    await owner.readServeEligibility();
    t.equal(owner.superseded, false, 'subsequent epoch 5 refresh restores currency');
    t.equal(owner.record?.epoch?.publicationEpoch, EPOCH_FIVE);

    owner.shutdown();
    t.end();
  },
);

test(
  'ServeEligibilityOwner ignores non-membership publication rows and recovers from initial regressed or NO_RECORD reads via bounded retry',
  async (t) => {
    // 1. Initial regressed read when record === null: noteSourceChange observes
    // epoch 5 before the first read completes, and the first read returns a
    // stale epoch 4 (and then NO_RECORD).
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_FOUR)],
    });

    // Empty or non-membership publication_kind must be ignored.
    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
      publication_kind: '',
      publication_epoch: EPOCH_FIVE,
    });
    t.equal(
      owner.minPublicationEpoch,
      null,
      'empty publication_kind is ignored by notePublicationSourceChange',
    );
    t.equal(
      owner.superseded,
      false,
      'empty publication_kind does not mark owner superseded',
    );

    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
      publication_kind: 'cluster_membership',
      publication_epoch: EPOCH_FIVE,
    });
    t.equal(owner.minPublicationEpoch, EPOCH_FIVE);

    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }

    t.equal(owner.record, null, 'initial regressed read is not adopted');
    t.equal(owner.superseded, true, 'owner remains superseded after initial regressed read');
    const initialRegressedAnswer = owner.answer(NODE_A);
    t.equal(
      initialRegressedAnswer.state,
      SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
      'initial regressed read answers unavailable',
    );
    t.equal(
      initialRegressedAnswer.reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'initial regressed read answers unavailable_stale rather than committed_read_pending',
    );

    const activeRetryTimers = state.timers.filter((timer) => !timer.cleared);
    t.equal(
      activeRetryTimers.length,
      1,
      'bounded retry timer is armed when regressed read finishes with no newer trigger',
    );
    t.equal(
      activeRetryTimers[0].delayMs,
      READ_FAILURE_RETRY_MS,
      'bounded retry timer uses READ_FAILURE_RETRY_MS (100ms)',
    );

    // 2. Stale NO_RECORD when minPublicationEpoch > 0 is also treated as a
    // regressed read and arms a bounded retry timer.
    state.publications = [];
    activeRetryTimers[0].fn();
    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }

    t.equal(owner.superseded, true, 'stale NO_RECORD keeps superseded = true');
    t.equal(
      owner.answer(NODE_A).reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'stale NO_RECORD when minPublicationEpoch > 0 answers unavailable_stale',
    );

    // 3. When the bounded retry timer fires after the source catches up to
    // epoch 5, the owner adopts epoch 5 and clears superseded.
    const nextRetryTimers = state.timers.filter((timer) => !timer.cleared);
    t.equal(nextRetryTimers.length, 1, 'bounded retry timer re-armed after stale NO_RECORD');
    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    nextRetryTimers[0].fn();
    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }

    t.equal(owner.superseded, false, 'bounded retry clears superseded once source catches up');
    t.equal(owner.record?.epoch?.publicationEpoch, EPOCH_FIVE, 'epoch 5 record adopted');
    t.equal(isServeEligibilityAnswerEligible(owner.answer(NODE_A)), true);

    // 4. Stale NO_RECORD when this.record !== null must not wipe this.record.
    state.publications = [];
    await owner.readServeEligibility();
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_FIVE,
      'stale NO_RECORD does not wipe existing committed record',
    );
    t.equal(
      owner.superseded,
      true,
      'stale NO_RECORD marks existing committed record superseded',
    );
    t.equal(
      owner.answer(NODE_A).reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'stale NO_RECORD with existing record answers unavailable_stale',
    );

    owner.shutdown();
    t.end();
  },
);

test(
  'ServeEligibilityOwner does not ratchet minPublicationEpoch on OPEN, ACK_PENDING, or ABANDONED publications',
  async (t) => {
    const {owner} = createHarness({
      publications: [buildPublicationRow(EPOCH_THREE)],
    });
    await owner.readServeEligibility();
    t.equal(owner.minPublicationEpoch, EPOCH_THREE);
    t.equal(owner.superseded, false);

    for (const nonPublishedStatus of ['OPEN', 'ACK_PENDING', 'ABANDONED']) {
      owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
        publication_id: `cluster_membership-${EPOCH_FIVE}`,
        publication_kind: 'cluster_membership',
        publication_epoch: EPOCH_FIVE,
        status: nonPublishedStatus,
      });
      t.equal(
        owner.minPublicationEpoch,
        EPOCH_THREE,
        `${nonPublishedStatus} publication must not advance minPublicationEpoch`,
      );
      t.equal(
        owner.superseded,
        false,
        `${nonPublishedStatus} publication for a different publication_id must not supersede committed epoch 3`,
      );
    }

    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
      publication_id: `cluster_membership-${EPOCH_FIVE}`,
      publication_kind: 'cluster_membership',
      publication_epoch: EPOCH_FIVE,
      status: 'PUBLISHED',
    });
    t.equal(
      owner.minPublicationEpoch,
      EPOCH_FIVE,
      'PUBLISHED publication advances minPublicationEpoch to 5',
    );
    t.equal(
      owner.superseded,
      true,
      'PUBLISHED publication at higher epoch marks committed record superseded',
    );

    owner.shutdown();
    t.end();
  },
);
