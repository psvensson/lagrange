import {test} from '../../src/test-helpers/tap.js';
import {indexCommittedNodeRows} from '../../src/control-plane/committed-node-rows.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
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

for (const stopBeforeCompletion of [false, true]) {
  test('ServeEligibilityOwner retains an in-flight publication wake through ' +
    `read failure (shutdown: ${stopBeforeCompletion})`, async (t) => {
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_THREE)],
    });
    t.teardown(() => owner.shutdown());
    await owner.readServeEligibility();
    const readRows = owner.readCommittedRows;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    owner.readCommittedRows = async (tableName) => {
      const answer = await readRows(tableName);
      await held;
      return answer;
    };
    state.failReads = true;
    const inFlight = owner.readServeEligibility();
    state.failReads = false;
    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE',
      buildPublicationRow(EPOCH_FIVE));
    owner.readCommittedRows = readRows;
    if (stopBeforeCompletion) owner.shutdown();
    release();
    await inFlight;
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(state.readCount, stopBeforeCompletion ? 4 : 6,
      'one retained event authorizes one successor, unless its owner stopped');
    t.equal(owner.answer(NODE_A).state, stopBeforeCompletion ?
      SERVE_ELIGIBILITY_STATE.UNAVAILABLE : SERVE_ELIGIBILITY_STATE.READY);
    if (stopBeforeCompletion) {
      t.equal(owner.answer(NODE_A).reason,
        SERVE_ELIGIBILITY_UNAVAILABLE_REASON.OWNER_STOPPED);
      t.equal(state.timers.filter((timer) => !timer.cleared).length, 0);
    } else {
      t.equal(owner.answer(NODE_A).epoch.publicationEpoch, EPOCH_FIVE);
      t.equal(isServeEligibilityAnswerEligible(owner.answer(NODE_A)), true);
    }
    const settledReadCount = state.readCount;
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(state.readCount, settledReadCount, 'the wake is consumed once');
  });
}

test('ServeEligibilityOwner cold NO_RECORD waits for an actual source change',
  async (t) => {
    const {owner, state} = createHarness({publications: []});
    t.teardown(() => owner.shutdown());
    await owner.readServeEligibility();
    t.equal(owner.answer(NODE_A).reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.NO_RECORD);
    t.equal(state.timers.filter((timer) => !timer.cleared).length, 0);
    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    owner.noteSourceChange(TABLES.NODES, 'UPDATE', buildNodeRow());
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(state.readCount, 4);
    t.equal(owner.answer(NODE_A).epoch.publicationEpoch, EPOCH_FIVE);
    t.equal(isServeEligibilityAnswerEligible(owner.answer(NODE_A)), true);
  });

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
    const initialActiveTimers = state.timers.filter((timer) => !timer.cleared);
    t.equal(initialActiveTimers.length, 1, 'initial future lease timer is armed');
    t.equal(
      initialActiveTimers[0].delayMs,
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
  'ServeEligibilityOwner ignores non-membership rows and recovers from regressed or NO_RECORD reads on demand and source change',
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
      0,
      'a regressed read without a committed lease arms no polling timer',
    );

    // 2. Stale NO_RECORD when minPublicationEpoch > 0 is also treated as a
    // regressed read; an actual caller may demand a refresh.
    state.publications = [];
    await owner.readServeEligibility();

    t.equal(owner.superseded, true, 'stale NO_RECORD keeps superseded = true');
    t.equal(
      owner.answer(NODE_A).reason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'stale NO_RECORD when minPublicationEpoch > 0 answers unavailable_stale',
    );

    // 3. A node source change after authority catches up retains the refresh
    // needed to adopt epoch 5; no diagnostic reader or timer drives progress.
    const nextRetryTimers = state.timers.filter((timer) => !timer.cleared);
    t.equal(nextRetryTimers.length, 0, 'stale NO_RECORD creates no polling timer');
    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    owner.noteSourceChange(TABLES.NODES, 'UPDATE', buildNodeRow());
    await flushMicrotasks();
    if (owner.inFlight) {
      await owner.inFlight;
    }

    t.equal(owner.superseded, false, 'source-triggered refresh adopts current authority');
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

test(
  'ServeEligibilityOwner does not mark committed record superseded on idempotent publication re-application',
  async (t) => {
    const pubRow = buildPublicationRow(EPOCH_THREE);
    const {owner} = createHarness({
      publications: [pubRow],
    });
    await owner.readServeEligibility();
    t.equal(owner.superseded, false);

    // Re-applying the identical PUBLISHED publication row (e.g., via CDC catch-up
    // hydration or cache repair) must not mark the committed record superseded.
    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPSERT', {
      ...pubRow,
    });
    t.equal(
      owner.superseded,
      false,
      'idempotent PUBLISHED publication re-application preserves committed currency',
    );

    // Mutating the held publication in place (e.g., revoking/superseding status)
    // must mark the committed record superseded.
    owner.noteSourceChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
      ...pubRow,
      status: 'SUPERSEDED',
    });
    t.equal(
      owner.superseded,
      true,
      'in-place status change on held publication marks committed record superseded',
    );

    owner.shutdown();
    t.end();
  },
);

test('committed NODES rejects malformed collections before indexing and preserves retained records',
  async (t) => {
    let accessorCalls = 0;
    const getterRow = Object.defineProperty({}, 'node_id', {
      enumerable: true, get() {
        accessorCalls++; return NODE_A;
      },
    });
    const getterArray = Object.defineProperty([], '0', {
      enumerable: true, get() {
        accessorCalls++; return buildNodeRow();
      },
    });
    const proxyRow = new Proxy(buildNodeRow(), {
      get(target, key) {
        accessorCalls++; return Reflect.get(target, key);
      },
    });
    const invalidRows = [undefined, {}, [null], new Array(2),
      [getterRow], getterArray, [proxyRow],
      [{nodeId: NODE_A}], [{node_id: ''}],
      [buildNodeRow(), buildNodeRow()]];
    for (const nodes of invalidRows) {
      const {owner, state} = createHarness();
      state.nodes = nodes;
      await owner.readServeEligibility();
      t.equal(owner.answerCommittedNodes().reason,
        SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_FAILED);
      state.nodes = [buildNodeRow()];
      await owner.readServeEligibility();
      state.nodes = nodes;
      await owner.readServeEligibility();
      t.equal(owner.answer(NODE_A).decision, SERVE_ELIGIBILITY_DECISION.ELIGIBLE,
        'a rejected collection preserves the owned valid retained-record policy');
      owner.shutdown();
    }
    t.equal(accessorCalls, 0, 'authority admission never executes row or array accessors');
  });

test('committed notifications distinguish lease meaning while serving stays denied', async (t) => {
  const {owner, state} = createHarness({nodes: [buildNodeRow(NODE_A, 5000.5)]});
  t.teardown(() => owner.shutdown());
  owner.isNodeLoadReady = () => false;
  let notifications = 0;
  owner.subscribe(() => {
    notifications++;
  });
  for (const [lease, expected] of [[5000.5, 1], [null, 2], [undefined, 3],
    [5000, 4], ['6000', 4]]) {
    state.nodes = [buildNodeRow(NODE_A, lease)];
    if (lease === undefined) delete state.nodes[0].ready_lease_expires_at;
    await owner.readServeEligibility();
    t.equal(owner.answer(NODE_A).decision, SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE);
    t.equal(notifications, expected,
      'canonical meaning changes notify; a valid renewal does not');
  }
});

test('a fractional future lease cannot grant serving through a private coercing parser', async (t) => {
  const {owner} = createHarness({nodes: [buildNodeRow(NODE_A, 5000.5)]});
  t.teardown(() => owner.shutdown());
  await owner.readServeEligibility();
  t.equal(owner.answer(NODE_A).decision, SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE);
});


test('committed node admission preserves the validated population under mutable intrinsic poisons', (t) => {
  const OriginalMap = Map;
  const originalSet = Function.call.bind(Map.prototype.set);
  const forged = buildNodeRow('forged-node');
  const poisons = [
    [Array.prototype, Symbol.iterator, function* () {
      yield forged;
    }],
    [globalThis, 'Map', function() {
      return new OriginalMap([['forged-node', forged]]);
    }],
    [String.prototype, 'trim', function() {
      return String(this);
    }],
    [Map.prototype, 'has', () => false],
    [Map.prototype, 'set', function() {
      return originalSet(this, 'forged-node', forged);
    }],
    [Object, 'freeze', (value) => value],
  ];
  for (const [target, key, poison] of poisons) {
    const original = target[key];
    let accepted;
    let duplicate;
    let whitespace;
    let missing;
    try {
      target[key] = poison;
      accepted = indexCommittedNodeRows([buildNodeRow(NODE_A), buildNodeRow('node-b')]);
      duplicate = indexCommittedNodeRows([buildNodeRow(NODE_A), buildNodeRow(NODE_A)]);
      whitespace = indexCommittedNodeRows([buildNodeRow(' node-a ')]);
      missing = indexCommittedNodeRows([{status: 'active'}]);
    } finally {
      target[key] = original;
    }
    t.same([...accepted.keys()], [NODE_A, 'node-b'], `${String(key)} cannot replace the input set`);
    t.equal(Object.isFrozen(accepted.get(NODE_A)), true, 'admitted rows retain immutability');
    t.equal(duplicate, null, 'duplicate identity remains refused');
    t.equal(whitespace, null, 'noncanonical identity remains refused');
    t.equal(missing, null, 'a missing identity cannot borrow an iterator value');
  }
  t.end();
});

test(
  'ServeEligibilityOwner detaches a caller at its deadline under repeated invalidations while inFlight finishes reconciling in the background',
  async (t) => {
    const CALLER_TIMEOUT_MS = 300;
    const EPOCH_SIX = 6;
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_THREE)],
    });
    t.teardown(() => owner.shutdown());
    await owner.readServeEligibility();
    t.equal(owner.record?.epoch?.publicationEpoch, EPOCH_THREE);

    let round = 0;
    let releaseRoundTwo;
    const roundTwoHeld = new Promise((resolve) => {
      releaseRoundTwo = resolve;
    });
    const baseRead = owner.readCommittedRows;
    owner.readCommittedRows = async (tableName) => {
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        round += 1;
        if (round === 1) {
          state.publications = [buildPublicationRow(EPOCH_FOUR)];
          owner.noteSourceChange(
            TABLES.CONTROL_PLANE_PUBLICATIONS,
            'UPDATE',
            buildPublicationRow(EPOCH_FIVE),
          );
        } else if (round === 2) {
          await roundTwoHeld;
          state.publications = [buildPublicationRow(EPOCH_SIX)];
        }
      }
      return baseRead(tableName);
    };

    const callerPromise = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
    });
    t.equal(owner.waiters.size, 1, 'caller attaches one waiter');
    await flushMicrotasks();
    await flushMicrotasks();

    t.ok(owner.inFlight, 'background reconciliation remains in flight in round 2');
    const callerTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === CALLER_TIMEOUT_MS,
    );
    t.ok(callerTimer, 'caller deadline timer is armed for caller timeoutMs');

    callerTimer.fn();
    const callerResult = await callerPromise;
    t.equal(
      owner.waiters.size,
      0,
      'caller detaches from owner.waiters at its deadline',
    );
    t.equal(
      callerResult.outcome,
      'stale_retained',
      'timed-out caller resolves with stale_retained while prior record exists',
    );
    t.ok(
      owner.inFlight,
      'owner.inFlight continues reconciling in the background after caller detaches',
    );

    releaseRoundTwo();
    await owner.inFlight;
    t.equal(owner.inFlight, null, 'background reconciliation completes');
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_SIX,
      'background reconciliation adopts the subsequent committed record',
    );
    t.equal(owner.superseded, false, 'owner converges to current after background round');
    t.equal(isServeEligibilityAnswerEligible(owner.answer(NODE_A)), true);
  },
);

test(
  'ServeEligibilityOwner cancellationToken detaches waiter immediately, clears its timer, and rejects without aborting shared refresh',
  async (t) => {
    const CALLER_TIMEOUT_MS = 800;
    const CANCEL_REASON = 'caller_cancelled_wait';
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_THREE)],
    });
    t.teardown(() => owner.shutdown());

    let releaseRead;
    const readHeld = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const baseRead = owner.readCommittedRows;
    owner.readCommittedRows = async (tableName) => {
      const answer = await baseRead(tableName);
      await readHeld;
      return answer;
    };

    const token = new CancellationToken();
    const callerPromise = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
      cancellationToken: token,
    });
    t.equal(owner.waiters.size, 1, 'waiter is attached before cancellation');
    const waiterTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === CALLER_TIMEOUT_MS,
    );
    t.ok(waiterTimer, 'waiter deadline timer is active before cancellation');

    token.cancel(CANCEL_REASON);
    t.equal(
      owner.waiters.size,
      0,
      'cancellation detaches waiter immediately',
    );
    t.equal(
      waiterTimer.cleared,
      true,
      'cancellation clears the waiter deadline timer immediately',
    );
    t.ok(
      owner.inFlight,
      'shared background refresh continues running after caller cancellation',
    );

    await t.rejects(
      callerPromise,
      new RegExp(CANCEL_REASON),
      'cancelled caller promise rejects with the cancellation reason',
    );

    state.publications = [buildPublicationRow(EPOCH_FIVE)];
    releaseRead();
    await owner.inFlight;
    t.equal(
      owner.record?.epoch?.publicationEpoch,
      EPOCH_THREE,
      'shared background refresh completes and adopts the committed record',
    );
    t.equal(isServeEligibilityAnswerEligible(owner.answer(NODE_A)), true);
  },
);

test(
  'ServeEligibilityOwner detaches multiple concurrent callers independently at their respective timeoutMs deadlines',
  async (t) => {
    const SHORT_TIMEOUT_MS = 200;
    const MEDIUM_TIMEOUT_MS = 600;
    const LONG_TIMEOUT_MS = 1200;
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_FIVE)],
    });
    t.teardown(() => owner.shutdown());

    let releaseRead;
    const readHeld = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const baseRead = owner.readCommittedRows;
    owner.readCommittedRows = async (tableName) => {
      const answer = await baseRead(tableName);
      await readHeld;
      return answer;
    };

    const shortCaller = owner.readServeEligibility({timeoutMs: SHORT_TIMEOUT_MS});
    const mediumCaller = owner.readServeEligibility({timeoutMs: MEDIUM_TIMEOUT_MS});
    const longCaller = owner.readServeEligibility({timeoutMs: LONG_TIMEOUT_MS});

    t.equal(owner.waiters.size, 3, 'all three concurrent callers attach waiters');
    t.equal(
      state.readCount,
      2,
      'all three concurrent callers share one in-flight committed read',
    );

    const shortTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === SHORT_TIMEOUT_MS,
    );
    const mediumTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === MEDIUM_TIMEOUT_MS,
    );
    const longTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === LONG_TIMEOUT_MS,
    );
    t.ok(shortTimer && mediumTimer && longTimer, 'each caller arms its own deadline timer');

    shortTimer.fn();
    const shortResult = await shortCaller;
    t.equal(shortResult.outcome, 'read_failed');
    t.equal(owner.waiters.size, 2, 'only short caller detaches at short deadline');
    t.equal(mediumTimer.cleared, false, 'medium caller timer remains active');
    t.equal(longTimer.cleared, false, 'long caller timer remains active');

    mediumTimer.fn();
    const mediumResult = await mediumCaller;
    t.equal(mediumResult.outcome, 'read_failed');
    t.equal(owner.waiters.size, 1, 'medium caller detaches at medium deadline');
    t.equal(longTimer.cleared, false, 'long caller timer remains active');

    releaseRead();
    const longResult = await longCaller;
    t.equal(longResult.outcome, 'record', 'long caller receives the completed refresh');
    t.equal(owner.waiters.size, 0, 'all waiters are cleared once refresh settles');
    t.equal(longTimer.cleared, true, 'long caller timer is cleared on resolution');
    t.equal(owner.record?.epoch?.publicationEpoch, EPOCH_FIVE);
  },
);

test(
  'ServeEligibilityOwner cancels all concurrent waiters sharing one CancellationToken without skipping any waiter when callbacks unsubscribe synchronously',
  async (t) => {
    const CALLER_TIMEOUT_MS = 900;
    const CANCEL_REASON = 'QUERY_CANCELLED';
    const {owner} = createHarness({
      publications: [buildPublicationRow(EPOCH_FIVE)],
    });
    t.teardown(() => owner.shutdown());

    let releaseRead;
    const readHeld = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const baseRead = owner.readCommittedRows;
    owner.readCommittedRows = async (tableName) => {
      const answer = await baseRead(tableName);
      await readHeld;
      return answer;
    };

    const sharedToken = new CancellationToken();
    const callerOne = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
      cancellationToken: sharedToken,
    });
    const callerTwo = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
      cancellationToken: sharedToken,
    });
    const callerThree = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
      cancellationToken: sharedToken,
    });

    t.equal(owner.waiters.size, 3, 'three concurrent callers share one token');
    sharedToken.cancel(CANCEL_REASON);
    t.equal(
      owner.waiters.size,
      0,
      'all three waiters detach synchronously when shared token cancels',
    );

    await t.rejects(callerOne, /QUERY_CANCELLED/, 'first waiter rejects immediately');
    await t.rejects(callerTwo, /QUERY_CANCELLED/, 'second waiter rejects immediately');
    await t.rejects(callerThree, /QUERY_CANCELLED/, 'third waiter rejects immediately');

    releaseRead();
    await owner.inFlight;
  },
);

test(
  'ServeEligibilityOwner does not accumulate per-waiter promise handlers on shared inFlight across repeated timed-out or cancelled callers',
  async (t) => {
    const CALLER_TIMEOUT_MS = 150;
    const {owner, state} = createHarness({
      publications: [buildPublicationRow(EPOCH_FIVE)],
    });
    t.teardown(() => owner.shutdown());

    let releaseRead;
    const readHeld = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const baseRead = owner.readCommittedRows;
    owner.readCommittedRows = async (tableName) => {
      const answer = await baseRead(tableName);
      await readHeld;
      return answer;
    };

    const firstCaller = owner.readServeEligibility({
      timeoutMs: CALLER_TIMEOUT_MS,
    });
    t.ok(owner.inFlight, 'shared inFlight promise is created once');

    let inFlightCatchRegistrations = 0;
    const originalCatch = owner.inFlight.catch.bind(owner.inFlight);
    owner.inFlight.catch = (...args) => {
      inFlightCatchRegistrations += 1;
      return originalCatch(...args);
    };

    const firstTimer = state.timers.find(
      (timer) => !timer.cleared && timer.delayMs === CALLER_TIMEOUT_MS,
    );
    firstTimer.fn();
    await firstCaller;
    t.equal(owner.waiters.size, 0, 'first timed-out waiter is detached');

    for (let index = 0; index < 4; index += 1) {
      const token = new CancellationToken();
      const promise = owner.readServeEligibility({
        timeoutMs: CALLER_TIMEOUT_MS,
        cancellationToken: token,
      });
      token.cancel('QUERY_CANCELLED');
      await t.rejects(promise, /QUERY_CANCELLED/);
      t.equal(owner.waiters.size, 0, `cancelled waiter ${index + 1} is detached`);
    }

    t.equal(
      inFlightCatchRegistrations,
      0,
      'waiter registration attaches no per-caller .catch handler to shared inFlight',
    );

    releaseRead();
    await owner.inFlight;
    t.equal(owner.record?.epoch?.publicationEpoch, EPOCH_FIVE);
  },
);
