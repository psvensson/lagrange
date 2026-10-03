// Adversarial witness for the readiness planning identity consumed by
// initial table-partition provisioning admission (Lagrange-Images #316).
//
// The defect. On a cleanly started single-node server the system-table
// churn the node itself books (leader-claim annotations, membership
// publications, CDC echoes of its own writes) applies to the revisioned
// planning-source tables several times per second from boot. The readiness
// planning owner classifies each change through the cache's deferred
// notification, so between the apply and the next turn every such change
// reads as an *unclassified* source change: `readCurrentPlanningProjectionIdentity`
// reports the identity saturated and `getProvisioningNodeTrustViewSync`
// serves the deferred stand-in. Initial partition provisioning then refuses
// the sole admissible node (`readiness_planning_identity_unavailable`,
// `candidateTargetNodeIds: []`) although the node is demonstrably serving.
//
// The witness drives the REAL ControlPlaneReadinessService, the REAL
// MembershipPublicationCoordinator and the PRODUCTION SystemTableCache (so
// the deferred apply-to-notify hop the rigs fake away is present) on a
// virtual clock.
//
// Case A — current single-node identity: one legitimate current cohort,
// one bookkeeping-class source write (a leader-claim annotation update on
// a partition row that asserts leadership the row already names), read the
// identity and the provisioning trust view in the same tick. The identity
// must be CURRENT (not saturated by the pending classification) and the
// trust view must serve the node. Red on the defective baseline.
//
// Case B — genuinely stale/changed identity: a REAL semantic planning
// change (a replica operation row entering the planning source, then a
// membership publication that removes the node from the published active
// set) must rotate the planning identity and refuse the node in the trust
// view. Fail-closed semantics must survive the cure.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SystemTableCache} from
  '../../src/cache/system-table-cache.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  isPlanningIdentityCurrent,
  planningIdentitiesEqual,
} from '../../src/control-plane/readiness-planning-semantic-generation.js';

const NODE_ID = 'node-a';
const T0 = Date.parse('2026-10-02T06:00:00.000Z');
const READY_LEASE_WINDOW_MS = 60000;
const PRIORITY_PARTITION_ID = 'nodes-p1';
const SECOND_PARTITION_ID = 'app-table-p1';

function flushDeferredNotifications() {
  return new Promise((resolve) => setImmediate(resolve));
}

function publicationRow(nodeIds) {
  return {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: 1,
    status: 'PUBLISHED',
    published_active_node_ids: JSON.stringify(
      nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
  };
}

async function composeSingleNodeReadiness({clock}) {
  const cache = new SystemTableCache({
    cacheId: 'witness-cache',
  });
  const readiness = new ControlPlaneReadinessService({
    nodeId: NODE_ID,
    systemTableCache: cache,
    now: () => clock,
    readinessPlanningScheduleDrainFn: () => {},
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set([NODE_ID]),
    },
  });
  readiness.syncOwnerDependencies({
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: readiness,
      now: () => clock,
    }),
  });
  return {cache, readiness};
}

function seedCurrentSingleNodeWorld(cache, clock) {
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: clock,
    [COLUMN.READY_LEASE_EXPIRES_AT]: clock + READY_LEASE_WINDOW_MS,
    connection_state: 'ready',
  });
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'endpoint-a',
    node_id: NODE_ID,
    transport_type: 'websocket',
    status: 'active',
    address: `${NODE_ID}/transport`,
    priority: 1,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: 'service-a',
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${NODE_ID}/partition/${PRIORITY_PARTITION_ID}`,
    partition_id: PRIORITY_PARTITION_ID,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PRIORITY_PARTITION_ID,
    table_id: 'nodes',
    table_name: TABLES.NODES,
    leader_node_id: NODE_ID,
    replica_count: 1,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: SECOND_PARTITION_ID,
    table_id: 'app-table',
    table_name: 'app_table',
    leader_node_id: null,
    replica_count: 0,
  });
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT',
    publicationRow([NODE_ID]));
}

test('Case A: current single-node cohort stays admit-admissible across bookkeeping churn', async () => {
  let clock = T0;
  const {cache, readiness} = await composeSingleNodeReadiness({clock});
  seedCurrentSingleNodeWorld(cache, clock);
  await flushDeferredNotifications();

  try {
    // Precondition: on a churn-free world the composition serves real
    // evidence for the sole node (the serve lane itself is judged
    // end-to-end by the create-table integration witness; the identity is
    // judged here).
    assert.equal(
      isPlanningIdentityCurrent(
        readiness.readCurrentPlanningProjectionIdentity(NODE_ID)),
      true, 'precondition: churn-free world serves a CURRENT identity',
    );

    // Bookkeeping-class churn: the partition row already names this node
    // as leader; the update re-asserts the same leadership plus tenant
    // annotations (the repeatedly minted leader-claim class observed in
    // #316). Nothing about placement changes.
    clock += 1;
    cache.applySystemTableChange(TABLES.PARTITIONS, 'UPDATE', {
      partition_id: PRIORITY_PARTITION_ID,
      leader_node_id: NODE_ID,
      leader_claim_node_id: NODE_ID,
      leader_claim_raft_term: 3,
      leader_claim_minted_against_updated_at: String(clock),
    });

    // Same tick as the apply: the identity read the operation-creation
    // admission captures must be CURRENT, and the readiness read the
    // provisioning trust view serves must be real node evidence — never a
    // deferred stand-in carrying placeholder facts.
    const identity = readiness.readCurrentPlanningProjectionIdentity(NODE_ID);
    assert.ok(identity, 'planning identity available');
    assert.equal(
      isPlanningIdentityCurrent(identity), true,
      'planning identity must be CURRENT across bookkeeping churn; ' +
        `identity=${JSON.stringify(identity)}`,
    );

    const served = readiness.getNodeReadinessSync(NODE_ID, {
      membershipPublicationPlanningSource: 'direct_publication_row',
    });
    const servedReasons = (served?.reasons || []).map(
      (reason) => reason?.code || reason,
    );
    assert.equal(
      servedReasons.includes('planning_snapshot_refresh_pending'), false,
      'readiness served to provisioning admission must never be the ' +
        'deferred stand-in when a current verdict exists; reasons=' +
        `${JSON.stringify(servedReasons)}`,
    );
    assert.equal(
      served?.nodeEvidence?.status, SERVICE_STATUS.ACTIVE,
      'served readiness must carry the node\'s real evidence, not ' +
        `placeholder facts; nodeEvidence=${JSON.stringify(
          served?.nodeEvidence)}`,
    );
  } finally {
    readiness.shutdown?.();
  }
});

test('Case B: genuinely changed planning identity still rotates and refuses', async () => {
  let clock = T0;
  const {cache, readiness} = await composeSingleNodeReadiness({clock});
  seedCurrentSingleNodeWorld(cache, clock);
  await flushDeferredNotifications();

  try {
    const stale = readiness.readCurrentPlanningProjectionIdentity(NODE_ID);
    assert.ok(stale, 'precondition: identity available');

    // A real semantic planning change: a replica-operation row for the
    // priority control-plane partition (the operation class the rebalance
    // coordinator creates and the planning source classifies globally)
    // enters the source.
    clock += 1;
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-1',
      operation_type: 'ADD',
      entity_type: 'partition',
      entity_id: 'replica_operations-p1',
      target_node_id: NODE_ID,
      status: 'PENDING',
      partition_id: 'replica_operations-p1',
    });
    await flushDeferredNotifications();

    const rotated = readiness.readCurrentPlanningProjectionIdentity(NODE_ID);
    assert.ok(rotated, 'identity still available after semantic change');
    assert.equal(
      planningIdentitiesEqual(stale, rotated), false,
      'a genuine semantic source change must rotate the planning ' +
        `identity; stale=${JSON.stringify(stale)} ` +
        `rotated=${JSON.stringify(rotated)}`,
    );

    // Cohort revocation: the published active set drops the node. The
    // trust view must refuse it — no cure may weaken membership-fed
    // fail-closed refusal.
    clock += 1;
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPSERT',
      publicationRow([]),
    );
    await flushDeferredNotifications();

    const trust = readiness.getProvisioningNodeTrustViewSync();
    const entry = trust.find((candidate) => candidate.nodeId === NODE_ID);
    const admitted = entry?.serveEligible === true;
    assert.equal(
      admitted, false,
      'a node removed from the published membership must not be ' +
        `admit-admissible; trust=${JSON.stringify(trust)}`,
    );
  } finally {
    readiness.shutdown?.();
  }
});
