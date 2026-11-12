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
import {
  PRIORITY_PARTITION_CENSUS_STATE,
  readPriorityPartitionCensusState,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
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

for (const preloadedRows of [[{node_id: 'projected-node'}], []]) {
  test(`raw ${preloadedRows.length ? 'populated' : 'empty'} row input cannot replace the owner`,
    async () => {
      let supplied = {success: false, error: 'held node owner'};
      let reads = 0;
      const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
        authoritativeControlPlaneView: {canRead: () => true, readRows: async () => {
          reads++;
          return supplied;
        }},
      }));
      const options = {...REMOTE_READ, preloadedRows, allowEmptyPreloadedRows: true};
      await assert.rejects(coordinator.readTableRows(TABLES.NODES, options), UNAVAILABLE);
      supplied = {success: true, rows: []};
      assert.deepEqual(await coordinator.readTableRows(TABLES.NODES, options), []);
      supplied = {success: true, rows: [{node_id: 'owner-node'}]};
      assert.deepEqual(await coordinator.readTableRows(TABLES.NODES, options), supplied.rows);
      assert.equal(reads, 3, 'every answer belongs to the same canonical supplier');
    });
}

for (const method of ['getLatestPublicationRow', 'getLatestPublishedPublicationRow']) {
  test(`${method} cannot accept a publication array as authority`, async () => {
    let supplied = {success: false, error: 'held publication owner'};
    let reads = 0;
    const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
      controlPlanePublicationsOwner: {listPublications: async () => {
        reads++;
        return supplied;
      }},
    }));
    const options = {...REMOTE_READ, publicationRows: [
      {...PUBLICATION, publication_epoch: 99, status: 'PUBLISHED'},
    ]};
    await assert.rejects(coordinator[method](options), UNAVAILABLE);
    supplied = {success: true, rows: []};
    assert.equal(await coordinator[method](options), null);
    supplied = {success: true, rows: [{...PUBLICATION, status: 'PUBLISHED'}]};
    assert.equal((await coordinator[method](options)).publicationEpoch,
      PUBLICATION.publication_epoch);
    assert.equal(reads, 3);
  });
}

for (const method of ['readPublicationPlanningSnapshot',
  'deriveClusterMembershipCandidate', 'reconcileClusterMembership']) {
  test(`${method} must read the owner despite caller latest rows and planning snapshot`,
    async () => {
      const store = createPublicationStore({rows: [PUBLICATION]});
      store.control.readsUnavailable = true;
      const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        controlPlanePublicationsOwner: store.owner,
        authoritativeControlPlaneView: {canRead: () => true,
          readRows: async () => ({success: true, rows: []})},
      }));
      const latest = {...PUBLICATION, status: 'PUBLISHED'};
      await assert.rejects(coordinator[method]({
        latestPublicationRow: latest, latestPublishedPublicationRow: latest,
        publicationRows: [latest], planningSnapshot: {
          latestPublicationRow: latest, latestPublishedPublicationRow: latest,
          nodeRows: [{node_id: NODE_ID, status: 'active'}],
          nodeEndpointRows: [], serviceRows: [], partitionRows: [], replicaOperationRows: [],
        },
      }), UNAVAILABLE);
      assert.equal(store.reads.length, 1, 'the canonical list was actually attempted');
      assert.equal(store.writes.length, 0, 'caller observations cannot authorize a write');
    });
}

for (const deferNestedPriorityRecoveryPlanning of [false, true]) {
  test(`${deferNestedPriorityRecoveryPlanning ? 'deferred' : 'ordinary'} planning cannot admit a caller-supplied satisfied census`,
    async (t) => {
      const store = createPublicationStore();
      const observedTables = [];
      const coordinator = new MembershipPublicationCoordinator(coordinatorOptions({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        controlPlanePublicationsOwner: store.owner,
        reconcileQueue: createRecordingReconcileQueue(),
        authoritativeControlPlaneView: {canRead: () => true,
          readRows: async (tableName) => {
            observedTables.push(tableName);
            return {success: true, rows: []};
          }},
      }));
      t.after(() => coordinator.stopOwnerMembershipDriver());
      const options = {
        publishedActiveNodeIds: [NODE_ID], requiredAckNodeIds: [NODE_ID],
        acknowledgedNodeIds: [NODE_ID], deferNestedPriorityRecoveryPlanning,
        priorityPartitionSummary: {
          satisfied: true, requiredDistinctNodeCount: 1, readyEligibleNodeCount: 1,
          totalPriorityPartitionCount: 6, missingPartitionIds: [], blockedPartitions: [],
        },
        membershipLifecycleSummary: {
          lifecycleState: 'published_active', publishedActiveNodeIds: [NODE_ID],
          projectedServingNodeIds: ['donated-node'], locallyEligibleNodeIds: ['donated-node'],
        },
      };
      const snapshot = await coordinator.readPublicationPlanningSnapshot(options);
      assert.equal(snapshot.membershipLifecycleSummary, null,
        'caller lifecycle observations cannot replace the derived owner summary');
      assert.notEqual(readPriorityPartitionCensusState(snapshot.priorityPartitionSummary),
        PRIORITY_PARTITION_CENSUS_STATE.DERIVED);
      const candidate = await coordinator.deriveClusterMembershipCandidate(options);
      assert.notEqual(readPriorityPartitionCensusState(candidate.priorityPartitionSummary),
        PRIORITY_PARTITION_CENSUS_STATE.DERIVED);
      const answer = await coordinator.reconcileClusterMembership(options);
      assert.ok(answer.publicationRow, 'the explicit desired target was actually admitted');
      assert.equal(store.writes.length, 1);
      assert.equal(store.landed.length, 1);
      const admitted = normalizeControlPlanePublicationRow(store.rows()[0]);
      assert.equal(readPriorityPartitionCensusState(admitted.priorityPartitionSummary),
        PRIORITY_PARTITION_CENSUS_STATE.NOT_DERIVED,
        'the real writer cannot certify a census without its own row evidence');
      assert.deepEqual([...new Set(observedTables)].sort(),
        deferNestedPriorityRecoveryPlanning ? [] : [TABLES.NODES, TABLES.NODE_ENDPOINTS,
          TABLES.SERVICES, TABLES.PARTITIONS, TABLES.REPLICA_OPERATIONS].sort());
      assert.ok(store.reads.some((read) => read.params.length === 0),
        'both routes attempted the actual publication owner');
    });
}
