// A node acknowledges a membership publication only for itself (owner
// ruling 2026-11-11). The dispatch service's triggers are level-triggered:
// its own READY row and every publication row change re-derive, from the
// rows visible now, whether this node owes an acknowledgement. Another
// node's READY row is the publication owner's reason to reconcile and never
// this node's reason to acknowledge on that node's behalf. An acknowledgement
// that is not settled (an unknown write outcome, or a refusal that says
// nothing about the row) keeps the obligation: one deferred re-derive, never
// a silent release.

import {test} from '../../src/test-helpers/tap.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {
  PUBLICATION_WRITE_OUTCOME,
  PUBLICATION_WRITE_REFUSAL,
  PUBLICATION_WRITE_UNKNOWN_REASON,
} from '../../src/control-plane/owners/control-plane-publication-change.js';
import {
  READY_NODE_CAPABILITIES_JSON,
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const LOCAL_NODE_ID = 'node-1';
const OTHER_NODE_ID = 'node-2';
const PUBLICATION_ID = 'membership-publication:self-only';
const RETRY_AFTER_MS = 23;
const READY = Object.freeze({dimensions: Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
})});
const NOT_READY = Object.freeze({dimensions: Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
})});

function flush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function openPublication() {
  return {
    publicationId: PUBLICATION_ID,
    publicationKind: 'cluster_membership',
    publicationEpoch: 31,
    status: 'OPEN',
    publishedActiveNodeIds: [LOCAL_NODE_ID, OTHER_NODE_ID],
    requiredAckNodeIds: [LOCAL_NODE_ID, OTHER_NODE_ID],
    acknowledgedNodeIds: [],
  };
}

function readyNodeRow(nodeId) {
  const now = Date.now();
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}:1`,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now,
    ready_lease_expires_at: now + 60000,
    created_at: now,
  };
}

// The dispatch service of LOCAL_NODE_ID over a membership publication
// service whose visible rows and acknowledgement answers are the test's.
function buildDispatch(state) {
  const acknowledgements = [];
  const reconciles = [];
  const timers = [];
  const includes = (row, nodeId) =>
    Boolean(row) && row.publishedActiveNodeIds.includes(nodeId);
  const service = createService({
    nodeId: LOCAL_NODE_ID,
    cdcIntegrationService: {},
    nodeStateUpdateRetryAfterMs: RETRY_AFTER_MS,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => (state.localReady ? READY : NOT_READY),
      membershipPublicationService: {
        getLatestPublicationRowSync: () => state.publicationRow,
        getLatestPublicationForNodeSync: (nodeId) =>
          (includes(state.publicationRow, nodeId) ?
            state.publicationRow : null),
        enqueueClusterMembershipReconcile(reason, context) {
          reconciles.push({reason, nodeId: context?.nodeId ?? null});
          return true;
        },
        async acknowledgeMembershipPublicationForNode(nodeId) {
          acknowledgements.push(nodeId);
          return state.answer(acknowledgements.length);
        },
      },
    },
  });
  return {service, acknowledgements, reconciles, timers};
}

const committed = () => ({outcome: PUBLICATION_WRITE_OUTCOME.COMMITTED,
  row: {}});

test('another node\'s READY row observed here produces no acknowledgement ' +
  'from this node, only the owner\'s reconcile trigger', async (t) => {
  initEnv();
  const state = {localReady: true, publicationRow: openPublication(),
    answer: committed};
  const {service, acknowledgements, reconciles} = buildDispatch(state);

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES,
    readyNodeRow(OTHER_NODE_ID));
  await flush();

  t.same(acknowledgements, [],
    'no acknowledgement is made on the other node\'s behalf');
  t.same(reconciles, [{reason: RECONCILE_REASON.NODES_CACHE_READY,
    nodeId: OTHER_NODE_ID}],
  'the READY row still re-enters the publication owner\'s reconcile');
  service.stop();
});

test('this node\'s own READY row makes it acknowledge for itself',
  async (t) => {
    initEnv();
    const state = {localReady: true, publicationRow: openPublication(),
      answer: committed};
    const {service, acknowledgements} = buildDispatch(state);

    service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES,
      readyNodeRow(LOCAL_NODE_ID));
    await flush();

    t.same(acknowledgements, [LOCAL_NODE_ID]);
    service.stop();
  });

test('ordering: READY before the publication exists - the publication ' +
  'row\'s arrival makes the node acknowledge', async (t) => {
  initEnv();
  const state = {localReady: true, publicationRow: null, answer: committed};
  const {service, acknowledgements} = buildDispatch(state);

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES,
    readyNodeRow(LOCAL_NODE_ID));
  await flush();
  t.same(acknowledgements, [], 'no publication, nothing owed yet');

  state.publicationRow = openPublication();
  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    state.publicationRow);
  await flush();
  t.same(acknowledgements, [LOCAL_NODE_ID],
    'the row\'s change event is the node\'s own trigger');
  service.stop();
});

test('ordering: the publication row arrived before the node was READY - ' +
  'its own READY row re-derives the acknowledgement from current rows',
async (t) => {
  initEnv();
  const state = {localReady: false, publicationRow: openPublication(),
    answer: committed};
  const {service, acknowledgements} = buildDispatch(state);

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    state.publicationRow);
  await flush();
  t.same(acknowledgements, [], 'a node that is not READY does not acknowledge');

  state.localReady = true;
  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES,
    readyNodeRow(LOCAL_NODE_ID));
  await flush();
  t.same(acknowledgements, [LOCAL_NODE_ID],
    'the missed publication event is recovered by the node\'s own READY row');
  service.stop();
});

for (const [name, unsettled] of [
  ['an UNKNOWN write outcome', {
    outcome: PUBLICATION_WRITE_OUTCOME.UNKNOWN,
    publicationId: PUBLICATION_ID,
    writeKey: 'cpw-witness',
    reason: PUBLICATION_WRITE_UNKNOWN_REASON.CONFIRMING_READ_UNAVAILABLE,
  }],
  ['the durable owner unreadable', {
    outcome: PUBLICATION_WRITE_OUTCOME.REFUSED,
    publicationId: PUBLICATION_ID,
    reason: PUBLICATION_WRITE_REFUSAL.AUTHORITATIVE_READ_UNAVAILABLE,
  }],
]) {
  test(`${name} keeps the acknowledgement obligation: one deferred ` +
    're-derive, which settles it', async (t) => {
    initEnv();
    const state = {localReady: true, publicationRow: openPublication(),
      answer: (attempt) => (attempt === 1 ? unsettled : committed())};
    const {service, acknowledgements, timers} = buildDispatch(state);

    service.handleCacheNodeChange(
      SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS, state.publicationRow);
    await flush();
    t.same(acknowledgements, [LOCAL_NODE_ID]);
    t.equal(timers.length, 1, 'the obligation is retained, not released');
    t.equal(timers[0].delayMs, RETRY_AFTER_MS, 'bounded by the retry delay');
    t.equal(service.membershipPublicationAckDeferredRetries.has(LOCAL_NODE_ID),
      true);

    // The resumed work: the deferred re-derive acknowledges again and the
    // owner settles it by reading the durable row.
    timers[0].callback();
    await flush();
    t.same(acknowledgements, [LOCAL_NODE_ID, LOCAL_NODE_ID]);
    t.equal(timers.length, 1, 'a settled acknowledgement arms nothing more');
    t.equal(service.membershipPublicationAckDeferredRetries.size, 0);
    service.stop();
  });
}

test('a refusal by the row itself releases the obligation: nothing is ' +
  're-derived', async (t) => {
  initEnv();
  const state = {localReady: true, publicationRow: openPublication(),
    answer: () => ({outcome: PUBLICATION_WRITE_OUTCOME.REFUSED,
      reason: 'publication_row_final'})};
  const {service, acknowledgements, timers} = buildDispatch(state);

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    state.publicationRow);
  await flush();
  t.same(acknowledgements, [LOCAL_NODE_ID]);
  t.equal(timers.length, 0);
  service.stop();
});
