// The actual view producer and acknowledgement consumer must preserve an
// unavailable owner observation. Plausible projected rows cannot answer it.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {createRecordingReconcileQueue} from '../helpers/recording-reconcile-queue.js';
import {createPublicationStore} from './publication-owner-test-support.js';
import {createService, initEnv} from './replica-dispatch-node-state-update-test-support.js';

const NODE_ID = 'node-1';
const NOW_MS = 5000;
const RETRY_AFTER_MS = 23;
const UNAVAILABLE = {code: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'};
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const PUBLICATION = Object.freeze({
  publication_id: 'publication-authority', publication_kind: 'cluster_membership',
  publication_epoch: 31, status: 'OPEN',
  published_active_node_ids: [NODE_ID, 'node-2'],
  required_ack_node_ids: [NODE_ID, 'node-2'], acknowledged_node_ids: [],
});
const REMOTE_READ = Object.freeze({
  readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
});

function coordinatorOptions(extra = {}) {
  return {nodeId: NODE_ID, now: () => NOW_MS, logger: QUIET_LOGGER,
    systemTableCache: {getAll: (tableName) =>
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS ? [PUBLICATION] : []},
    ...extra};
}

test('a present publications owner without its list method cannot be replaced by a view',
  async () => {
    let alternateReads = 0;
    const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
      controlPlanePublicationsOwner: {},
      authoritativeControlPlaneView: {canRead: () => true, readRows: async () => {
        alternateReads++;
        return {success: true, rows: [PUBLICATION]};
      }},
    }));
    await assert.rejects(coordinator.getLatestPublicationRow(REMOTE_READ), UNAVAILABLE);
    assert.equal(alternateReads, 0);
  });

for (const capability of ['missing', 'throwing', 'unavailable']) {
  test(`${capability} view capability refuses before using plausible cached rows`,
    async () => {
      const original = new Error('held capability');
      const view = {readRows: async () => ({success: true, rows: []})};
      if (capability !== 'missing') {
        view.canRead = () => {
          if (capability === 'throwing') throw original;
          return false;
        };
      }
      let projectionReads = 0;
      const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
        authoritativeControlPlaneView: view,
        systemTableCache: {getAll: () => {
          projectionReads++;
          return [{node_id: NODE_ID, status: 'active'}];
        }},
      }));
      await assert.rejects(coordinator.readTableRows(TABLES.NODES, REMOTE_READ),
        (error) => error.code === UNAVAILABLE.code &&
          (capability !== 'throwing' || error.cause === original));
      assert.equal(projectionReads, 0);
    });
}

test('the real authoritative view refuses malformed supplier success before normalizing rows',
  async () => {
    let supplied = {success: true, rows: null, rowSetComplete: true};
    const view = new AuthoritativeControlPlaneView({nodeId: NODE_ID, now: () => NOW_MS,
      cdcIntegrationService: {
        executeAuthoritativeSystemTableRead: async () => supplied,
      }});
    const readOptions = {readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    })};
    const malformed = await view.readRows(TABLES.NODES, 'SELECT * FROM nodes', [], readOptions);
    assert.equal(malformed.success, false);
    assert.equal(malformed.rowSetComplete, false);
    assert.deepEqual(malformed.rows, []);
    const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
      authoritativeControlPlaneView: view,
    }));
    await assert.rejects(coordinator.readTableRows(TABLES.NODES, REMOTE_READ), UNAVAILABLE);
    supplied = {success: true, rows: [], rowSetComplete: true};
    assert.deepEqual(await coordinator.readTableRows(TABLES.NODES, REMOTE_READ), []);
  });

for (const outcome of ['unavailable', 'empty']) {
  test(`acknowledgement ${outcome} cannot reuse a cached publication`, async () => {
    const store = createPublicationStore({rows: [PUBLICATION]});
    const read = store.gateway.readAuthoritativeRows.bind(store.gateway);
    store.gateway.readAuthoritativeRows = async (...args) => args[2].length === 0 ?
      (outcome === 'empty' ? {success: true, rows: []} :
        {success: false, error: 'held owner history'}) : read(...args);
    const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
      controlPlanePublicationsOwner: store.owner,
    }));
    if (outcome === 'empty') {
      assert.equal(await coordinator.getAcknowledgementCandidateForNode(NODE_ID), null);
      assert.equal(await coordinator.acknowledgeMembershipPublicationForNode(NODE_ID), null);
    } else {
      await assert.rejects(coordinator.getAcknowledgementCandidateForNode(NODE_ID), UNAVAILABLE);
    }
    assert.equal(store.writes.length, 0);
  });
}

test('the existing acknowledgement wake retains unavailable history and heals through the real writer',
  async (t) => {
    initEnv();
    const store = createPublicationStore({rows: [PUBLICATION]});
    const read = store.gateway.readAuthoritativeRows.bind(store.gateway);
    let unavailable = true;
    store.gateway.readAuthoritativeRows = async (...args) => {
      if (unavailable && args[2].length === 0) {
        return {success: false, error: 'held owner history'};
      }
      return read(...args);
    };
    // Census derivation is a different interaction. Its real queue retains
    // requests here without running them; the acknowledgement lane/writer run.
    const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
      controlPlanePublicationsOwner: store.owner,
      reconcileQueue: createRecordingReconcileQueue(),
    }));
    const timers = [];
    const service = createService({nodeId: NODE_ID, cdcIntegrationService: {},
      nodeStateUpdateRetryAfterMs: RETRY_AFTER_MS,
      setTimeoutFn(callback, delayMs) {
        const handle = {callback, delayMs};
        timers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
      controlPlaneReadinessService: {
        getNodeReadinessSync: () => ({dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
        }}),
        membershipPublicationService: coordinator,
      }});
    t.after(() => service.stop());
    service.handleCacheNodeChange(TABLES.CONTROL_PLANE_PUBLICATIONS, PUBLICATION);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.writes.length, 0, 'a failed list cannot authorize a keyed write');
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, RETRY_AFTER_MS);
    assert.equal(service.membershipPublicationAckDeferredRetries.has(NODE_ID), true);
    unavailable = false;
    timers[0].callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.writes.length, 1);
    assert.equal(store.landed.length, 1);
    assert.deepEqual(store.row(PUBLICATION.publication_id).acknowledged_node_ids, [NODE_ID]);
    assert.equal(timers.length, 1, 'the completed owner effect needs no second timer');
    assert.equal(service.membershipPublicationAckDeferredRetries.size, 0);
  });
