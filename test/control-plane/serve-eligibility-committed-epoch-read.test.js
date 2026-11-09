/**
 * Quest serve-eligibility-committed-epoch-read, attempt 1, owner witness.
 *
 * Per-node serve eligibility is one fact with one owner: the control-plane
 * readiness owner answers it from a committed read of the nodes rows and the
 * latest published control_plane_publications row, taken through the
 * readiness-owner leader-required read (AuthoritativeControlPlaneView
 * readReadinessOwnerRows), as {state: ready, decision, epoch} or a typed
 * {state: unavailable, reason, epoch, retryAfterMs}. The SystemTableCache is
 * only a trigger: it marks the epoch memo stale, it never grants.
 */
import {test} from '../../src/test-helpers/tap.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {createCache} from './control-plane-readiness-service-test-support.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';

const NODE_A = 'node-serve-a';
const NODE_B = 'node-serve-b';
const NOW_MS = 1_000_000;
const LEASE_MS = 15_000;
const EPOCH = 7;

function nodeRow(nodeId, overrides = {}) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: 3,
    [COLUMN.LAST_HEARTBEAT]: NOW_MS - 1000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + LEASE_MS,
    ...overrides,
  };
}

function publicationRow(overrides = {}) {
  return {
    publication_id: `cluster_membership-${EPOCH}`,
    publication_kind: 'cluster_membership',
    publication_epoch: EPOCH,
    publisher_node_id: NODE_A,
    published_active_node_ids: JSON.stringify([NODE_A, NODE_B]),
    required_ack_node_ids: JSON.stringify([NODE_A, NODE_B]),
    acknowledged_node_ids: JSON.stringify([NODE_A, NODE_B]),
    priority_partition_summary: JSON.stringify({
      satisfied: true, blockedPartitions: [],
    }),
    status: 'PUBLISHED',
    created_at: NOW_MS - 5000,
    updated_at: NOW_MS - 4000,
    transition_history: '[]',
    ...overrides,
  };
}

function committedView(state) {
  const calls = [];
  return {
    calls,
    async readReadinessOwnerRows(tableName, sql, params, options) {
      calls.push({tableName, sql, params, options});
      if (state.fail === tableName) {
        return {success: false, error: 'authoritative_row_source_unavailable',
          rows: []};
      }
      if (tableName === TABLES.NODES) {
        return {success: true, rows: state.nodes};
      }
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        return {success: true, rows: state.publications};
      }
      return {success: false, error: 'unexpected_table', rows: []};
    },
    async readRows() {
      throw new Error('the serve decision must use the readiness-owner read');
    },
    canRead: () => true,
  };
}

function createReadiness({cacheNodes, state, clock = {now: NOW_MS}}) {
  const cache = createCache({nodes: cacheNodes});
  const view = committedView(state);
  const readiness = createReadinessServiceForTest({
    nodeId: NODE_A,
    systemTableCache: cache,
    authoritativeControlPlaneView: view,
    now: () => clock.now,
  });
  return {readiness, cache, view, clock};
}

async function answerAfterRead(readiness, nodeId) {
  await readiness.readServeEligibility?.();
  return readiness.answerServeEligibility?.(nodeId) ?? null;
}

function summarize(answer) {
  return answer === null ? null : {
    state: answer.state,
    decision: answer.decision ?? null,
    reason: answer.reason ?? null,
    publicationEpoch: answer.epoch?.publicationEpoch ?? null,
  };
}

test('the committed read grants serving where the cache projection would ' +
  'deny it', async (t) => {
  const {readiness, view} = createReadiness({
    // The cache still holds an expired lease for B; the committed row is
    // current and B is in the published membership at epoch 7.
    cacheNodes: [nodeRow(NODE_A),
      nodeRow(NODE_B, {[COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS - 1})],
    state: {nodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
      publications: [publicationRow()]},
  });
  const answer = await answerAfterRead(readiness, NODE_B);
  t.same(summarize(answer), {
    state: 'ready', decision: 'eligible', reason: null,
    publicationEpoch: EPOCH,
  }, 'B is eligible at the committed epoch');
  t.same(view.calls.map((call) => call.tableName).sort(),
    [TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.NODES].sort(),
    'exactly the nodes and publications tables are read, through the ' +
    'leader-required readiness-owner read');
  readiness.shutdown();
  t.end();
});

test('a committed expired lease is a committed negative even when the cache ' +
  'says the lease is current', async (t) => {
  const {readiness} = createReadiness({
    cacheNodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
    state: {nodes: [nodeRow(NODE_A),
      nodeRow(NODE_B, {[COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS - 1})],
    publications: [publicationRow()]},
  });
  const answer = await answerAfterRead(readiness, NODE_B);
  t.same(summarize(answer), {
    state: 'ready', decision: 'not_eligible', reason: null,
    publicationEpoch: EPOCH,
  }, 'B is not eligible: its committed lease expired');
  t.ok(answer?.reasons?.includes('ready_lease_expired'),
    'the reason names the committed lease');
  readiness.shutdown();
  t.end();
});

test('a node outside the published membership, an unacknowledged ' +
  'publication, a pending or unstated priority spread are committed ' +
  'negatives', async (t) => {
  const cases = [
    ['not published', publicationRow({
      published_active_node_ids: JSON.stringify([NODE_A])}),
    'node_not_published'],
    ['publication not acknowledged', publicationRow({
      acknowledged_node_ids: JSON.stringify([NODE_A])}),
    'publication_not_acknowledged'],
    ['priority spread pending', publicationRow({
      priority_partition_summary: JSON.stringify({
        satisfied: false, blockedPartitions: []})}),
    'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
    ['priority spread unstated', publicationRow({
      priority_partition_summary: null}),
    'priority_spread_unstated'],
  ];
  for (const [label, publication, reason] of cases) {
    const {readiness} = createReadiness({
      cacheNodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
      state: {nodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
        publications: [publication]},
    });
    const answer = await answerAfterRead(readiness, NODE_B);
    t.equal(answer?.decision ?? null, 'not_eligible', `${label}: not eligible`);
    t.ok(answer?.reasons?.includes(reason), `${label}: reason ${reason}`);
    readiness.shutdown();
  }
  t.end();
});

test('no published epoch and a failed committed read are typed ' +
  'unavailability, never eligibility', async (t) => {
  const noEpoch = createReadiness({
    cacheNodes: [nodeRow(NODE_A)],
    state: {nodes: [nodeRow(NODE_A)],
      publications: [publicationRow({status: 'ACK_PENDING'})]},
  });
  t.same(summarize(await answerAfterRead(noEpoch.readiness, NODE_A)), {
    state: 'unavailable', decision: null, reason: 'no_committed_record',
    publicationEpoch: null,
  }, 'no published membership: unavailable, no epoch');
  noEpoch.readiness.shutdown();

  const failed = createReadiness({
    cacheNodes: [nodeRow(NODE_A)],
    state: {nodes: [nodeRow(NODE_A)], publications: [publicationRow()],
      fail: TABLES.NODES},
  });
  const answer = await answerAfterRead(failed.readiness, NODE_A);
  t.same(summarize(answer), {
    state: 'unavailable', decision: null, reason: 'committed_read_failed',
    publicationEpoch: null,
  }, 'a failed leader read is unavailability, not an answer');
  t.ok(Number.isFinite(answer?.retryAfterMs) && answer.retryAfterMs > 0,
    'the unavailability states when to ask again');
  failed.readiness.shutdown();
  t.end();
});

test('the cache is a trigger: a newer publication epoch or a revoking node ' +
  'change makes the memo stale; a lease extension does not', async (t) => {
  const {readiness, cache} = createReadiness({
    cacheNodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
    state: {nodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
      publications: [publicationRow()]},
  });
  t.equal((await answerAfterRead(readiness, NODE_B))?.decision ?? null,
    'eligible', 'baseline eligible at epoch 7');

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', nodeRow(NODE_B, {
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 2 * LEASE_MS}));
  t.equal(readiness.answerServeEligibility?.(NODE_B)?.decision ?? null,
    'eligible', 'a lease extension keeps the committed answer');

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', nodeRow(NODE_B, {
    [COLUMN.READY_LEASE_EXPIRES_AT]: null}));
  t.same(summarize(readiness.answerServeEligibility?.(NODE_B) ?? null), {
    state: 'unavailable', decision: null, reason: 'unavailable_stale',
    publicationEpoch: EPOCH,
  }, 'a cleared lease in the cache makes the memo stale; it does not grant ' +
    'or deny on the projection');
  readiness.shutdown();
  t.end();
});

test('a positive answer does not outlive its committed lease', async (t) => {
  const clock = {now: NOW_MS};
  const {readiness} = createReadiness({
    cacheNodes: [nodeRow(NODE_A)],
    state: {nodes: [nodeRow(NODE_A)], publications: [publicationRow()]},
    clock,
  });
  t.equal((await answerAfterRead(readiness, NODE_A))?.decision ?? null,
    'eligible', 'eligible inside the lease');
  clock.now = NOW_MS + LEASE_MS + 1;
  t.same(summarize(readiness.answerServeEligibility?.(NODE_A) ?? null), {
    state: 'unavailable', decision: null, reason: 'unavailable_stale',
    publicationEpoch: EPOCH,
  }, 'past the committed lease the answer is stale, not eligible');
  readiness.shutdown();
  t.end();
});

// The readiness owner's cache listener, as the test cache stub carries
// NODES and SERVICES only: a publications change is delivered on the same
// change channel the owner listens to.
function applyPublicationChange(cache, row) {
  for (const listener of cache.capturedListeners) {
    listener(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', row, null);
  }
}

function createPublicationAwareReadiness({state, clock = {now: NOW_MS}}) {
  const cache = createCache({nodes: state.nodes});
  cache.capturedListeners = [];
  const onCacheChange = cache.onCacheChange.bind(cache);
  cache.onCacheChange = (listener) => {
    cache.capturedListeners.push(listener);
    return onCacheChange(listener);
  };
  const readiness = createReadinessServiceForTest({
    nodeId: NODE_A,
    systemTableCache: cache,
    authoritativeControlPlaneView: committedView(state),
    now: () => clock.now,
  });
  return {readiness, cache, clock};
}

test('a newer publication epoch in the cache makes the memo stale at its ' +
  'own epoch until the committed read answers the new epoch', async (t) => {
  const state = {nodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
    publications: [publicationRow()]};
  const {readiness, cache} = createPublicationAwareReadiness({state});
  t.same(summarize(await answerAfterRead(readiness, NODE_B)), {
    state: 'ready', decision: 'eligible', reason: null,
    publicationEpoch: EPOCH,
  }, 'memo at epoch E');

  const nextEpochRow = publicationRow({
    publication_id: `cluster_membership-${EPOCH + 1}`,
    publication_epoch: EPOCH + 1,
  });
  applyPublicationChange(cache, nextEpochRow);
  t.same(summarize(readiness.answerServeEligibility(NODE_B)), {
    state: 'unavailable', decision: null, reason: 'unavailable_stale',
    publicationEpoch: EPOCH,
  }, 'a cached publication at E+1 answers unavailable_stale{E}: it neither ' +
    'grants nor denies on the projection');

  state.publications = [publicationRow(), nextEpochRow];
  t.same(summarize(await answerAfterRead(readiness, NODE_B)), {
    state: 'ready', decision: 'eligible', reason: null,
    publicationEpoch: EPOCH + 1,
  }, 'the committed read answers at E+1');
  readiness.shutdown();
  t.end();
});

test('a failed background refresh does not revoke a committed lease that is ' +
  'still valid; lease expiry with no successful read answers stale',
async (t) => {
  const clock = {now: NOW_MS};
  const state = {nodes: [nodeRow(NODE_A), nodeRow(NODE_B)],
    publications: [publicationRow()]};
  const {readiness, cache} = createPublicationAwareReadiness({state, clock});
  t.equal((await answerAfterRead(readiness, NODE_B))?.decision ?? null,
    'eligible', 'committed eligible with 15 s of lease');

  state.fail = TABLES.NODES;
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', nodeRow(NODE_B, {
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 2 * LEASE_MS}));
  await readiness.readServeEligibility();
  const owner = readiness.getServeEligibilityOwner();
  t.equal(owner.lastReadFailure?.reason ?? null, 'committed_read_failed',
    'the failed refresh is a typed observation');
  t.same(summarize(readiness.answerServeEligibility(NODE_B)), {
    state: 'ready', decision: 'eligible', reason: null,
    publicationEpoch: EPOCH,
  }, 'the committed answer stands while its lease is valid');

  clock.now = NOW_MS + LEASE_MS + 1;
  t.same(summarize(readiness.answerServeEligibility(NODE_B)), {
    state: 'unavailable', decision: null, reason: 'unavailable_stale',
    publicationEpoch: EPOCH,
  }, 'past the committed lease with no successful read the answer is stale');
  readiness.shutdown();
  t.end();
});
