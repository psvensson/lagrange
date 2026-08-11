import t from 'tap';
import {
  isCriticalLeaderPublication,
} from '../../src/partition/partition-leader-publication-criticality.js';
import {
  LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS,
  buildLeaderNodeMutationDeliveryOptions,
  createLeaderNodeMutationHelper,
} from '../../src/partition/partition-service-metadata-mutation-helpers.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {
  AUTHORITATIVE_PROBE_DEFER_CAUSE,
  AuthoritativeRowMutationHelper,
} from '../../src/raft/authoritative-row-mutation-helper.js';

// Quest partition-leader-row-publication-integrity: the durable
// partitions.leader_node_id publication rides the delivery lane matching
// its causal criticality (divergence is a first-class initial-publication
// case, not a background refresh) and its silent starvation modes become
// typed events. Live witnesses: runs
// user-table-leader-placement-spread-20260811T052645Z (five
// participant-failure attempts over two minutes at BACKGROUND priority)
// and -20260811T054134Z (split child born anchored on the parent's host;
// the correcting publication demoted to BACKGROUND because the row was
// non-empty).

const NODE_SELF = 'node-self';
const NODE_OTHER = 'node-other';
const ORDINARY_PARTITION = 'tbl-abc_p_1234_left';

t.test('criticality owner: decision table', (t) => {
  t.equal(
    isCriticalLeaderPublication({
      observedLeaderNodeId: NODE_SELF,
      partitionId: 'services-p1',
      publishingNodeId: NODE_SELF,
    }),
    true,
    'bootstrap-critical partitions always publish critically',
  );
  t.equal(
    isCriticalLeaderPublication({
      observedLeaderNodeId: null,
      partitionId: ORDINARY_PARTITION,
      publishingNodeId: NODE_SELF,
    }),
    true,
    'an empty observed row is the classic initial publication',
  );
  t.equal(
    isCriticalLeaderPublication({
      observedLeaderNodeId: NODE_OTHER,
      partitionId: ORDINARY_PARTITION,
      publishingNodeId: NODE_SELF,
    }),
    true,
    'RED-ON-REVERT: a row naming another node is a divergence correction, ' +
      'never a background refresh',
  );
  t.equal(
    isCriticalLeaderPublication({
      observedLeaderNodeId: NODE_SELF,
      partitionId: ORDINARY_PARTITION,
      publishingNodeId: null,
    }),
    true,
    'an unknown publisher cannot rule divergence out',
  );
  t.equal(
    isCriticalLeaderPublication({
      observedLeaderNodeId: NODE_SELF,
      partitionId: ORDINARY_PARTITION,
      publishingNodeId: NODE_SELF,
    }),
    false,
    'only a row already naming the publisher is a routine refresh',
  );
  t.end();
});

function buildOwnerStub(overrides = {}) {
  return {
    getMetadataPublicationDeliveryPriority: () => 'background',
    getMetadataPublicationReadinessDimension: () => 'metadata-publication',
    getMetadataPublicationWorkClass: () => 'background',
    logger: {error: () => {}, info: () => {}, warn: () => {}},
    nodeId: NODE_SELF,
    partitionId: ORDINARY_PARTITION,
    replicaId: `${ORDINARY_PARTITION}-r1`,
    systemTableCache: null,
    cdcIntegrationService: null,
    controlPlaneSystemTableGateway: null,
    refreshMetadataPublicationGuardRow: async () => {},
    ...overrides,
  };
}

t.test('delivery options: divergent observed row rides the critical lane',
  (t) => {
    const owner = buildOwnerStub();
    const divergent = buildLeaderNodeMutationDeliveryOptions(owner, {
      authoritativeRow: {leader_node_id: NODE_OTHER},
    }, NODE_SELF);
    t.equal(divergent.deliveryPriority, 'critical',
      'RED-ON-REVERT: pre-quest this was background for non-empty rows');
    t.equal(divergent.workClass, 'critical');

    const settled = buildLeaderNodeMutationDeliveryOptions(owner, {
      authoritativeRow: {leader_node_id: NODE_SELF},
    }, NODE_SELF);
    t.equal(settled.deliveryPriority, 'background',
      'a row already naming the publisher keeps the background lane');

    const initial = buildLeaderNodeMutationDeliveryOptions(owner, {}, NODE_SELF);
    t.equal(initial.deliveryPriority, 'critical',
      'the empty-row initial publication stays critical');
    t.end();
  });

t.test('row-owner leader publication rides the critical lane for ordinary ' +
  'partitions (no observation = unruled-out divergence)', async (t) => {
  const updates = [];
  const owner = new PartitionServiceRowOwner({
    now: () => 1234,
    systemTableWriter: {
      async upsertSystemTableRow() {},
      async updateSystemTableRow(tableName, whereClause, updateData, options) {
        updates.push({options, tableName});
      },
    },
  });
  await owner.activateReplica({
    nodeId: NODE_SELF,
    partitionId: ORDINARY_PARTITION,
    replicaId: `${ORDINARY_PARTITION}-r1`,
    service: {isLeaderReplica: () => true},
  });
  const leaderUpdate = updates.find((u) => u.tableName === 'partitions');
  t.ok(leaderUpdate, 'canonical leader publication happened');
  t.equal(leaderUpdate.options.deliveryPriority, 'critical',
    'RED-ON-REVERT: pre-quest ordinary partitions published at background');
  t.equal(leaderUpdate.options.workClass, 'critical');
  t.end();
});

function buildHelperHarness(overrides = {}) {
  const events = {budget: [], dropped: [], probeDeferred: []};
  const timers = [];
  const helper = new AuthoritativeRowMutationHelper({
    buildUpdateData: (value, updatedAt) => ({
      leader_node_id: value,
      updated_at: updatedAt,
    }),
    buildWhereClause: () => ({partition_id: ORDINARY_PARTITION}),
    onAuthoritativeProbeDeferred: (context) =>
      events.probeDeferred.push(context),
    onPendingDropped: (context) => events.dropped.push(context),
    onRetryBudgetExhausted: (context) => events.budget.push(context),
    readValueFromCache: () => null,
    retryBudgetAttempts: 3,
    setTimeoutFn: (fn, delayMs) => {
      timers.push({delayMs, fn});
      return {unref: () => {}};
    },
    clearTimeoutFn: () => {},
    tableName: 'partitions',
    ...overrides,
  });
  return {events, helper, timers};
}

t.test('the retry budget fires the typed terminal exactly once and retry ' +
  'ownership continues', (t) => {
  const {events, helper, timers} = buildHelperHarness();
  helper.pendingValue = NODE_SELF;
  for (let i = 0; i < 6; i += 1) {
    helper.retryTimer = null;
    helper.scheduleRetry();
  }
  t.equal(events.budget.length, 1, 'budget terminal fired exactly once');
  t.equal(events.budget[0].attempts, 3);
  t.equal(events.budget[0].value, NODE_SELF);
  t.equal(timers.length, 6, 'retries continue past the budget (liveness)');
  t.end();
});

t.test('a cleared pending publication is a typed event, never silent',
  async (t) => {
    const {events, helper} = buildHelperHarness({
      cdcIntegrationService: {},
      prepareFlush: () => ({
        clearPending: true,
        reason: 'not-owner',
        skip: true,
      }),
    });
    helper.pendingValue = NODE_SELF;
    await helper.flush();
    t.equal(events.dropped.length, 1,
      'RED-ON-REVERT: pre-quest the drop was silent');
    t.equal(events.dropped[0].value, NODE_SELF);
    t.equal(events.dropped[0].reason, 'not-owner');
    t.equal(helper.pendingValue, null, 'pending value was dropped');
    t.end();
  });

t.test('an authoritative probe defer is a typed event for both causes',
  async (t) => {
    const throwing = buildHelperHarness({
      cdcIntegrationService: {},
      readAuthoritativeRow: async () => {
        throw new Error('participant failures');
      },
    });
    throwing.helper.pendingValue = NODE_SELF;
    await throwing.helper.flush();
    t.equal(throwing.events.probeDeferred.length, 1);
    t.equal(
      throwing.events.probeDeferred[0].cause,
      AUTHORITATIVE_PROBE_DEFER_CAUSE.READ_FAILED,
    );
    t.equal(
      throwing.events.probeDeferred[0].error?.message,
      'participant failures',
    );

    const unavailable = buildHelperHarness({
      cdcIntegrationService: {},
      readAuthoritativeRow: async () => ({available: false, row: null}),
    });
    unavailable.helper.pendingValue = NODE_SELF;
    await unavailable.helper.flush();
    t.equal(unavailable.events.probeDeferred.length, 1);
    t.equal(
      unavailable.events.probeDeferred[0].cause,
      AUTHORITATIVE_PROBE_DEFER_CAUSE.ROW_UNAVAILABLE,
    );
    t.end();
  });

t.test('the wired leader helper carries the budget and hooks', (t) => {
  const logged = {error: [], warn: []};
  const owner = buildOwnerStub({
    logger: {
      error: (msg, ctx) => logged.error.push({ctx, msg}),
      info: () => {},
      warn: (msg, ctx) => logged.warn.push({ctx, msg}),
    },
  });
  const helper = createLeaderNodeMutationHelper(owner);
  t.equal(
    helper.retryBudgetAttempts,
    LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS,
    'the leader helper is budget-bounded',
  );
  helper.pendingValue = NODE_SELF;
  helper.onRetryBudgetExhausted({
    attempts: 8,
    nextDelayMs: 30000,
    value: NODE_SELF,
  });
  t.equal(logged.error.length, 1, 'budget exhaustion logs at error level');
  helper.onPendingDropped({
    reason: 'not-owner',
    retryAttemptCount: 2,
    value: NODE_SELF,
  });
  helper.onAuthoritativeProbeDeferred({
    cause: AUTHORITATIVE_PROBE_DEFER_CAUSE.READ_FAILED,
    error: new Error('x'),
    retryAttemptCount: 1,
    value: NODE_SELF,
  });
  t.equal(logged.warn.length, 2, 'drop and defer log as typed warns');
  t.end();
});
