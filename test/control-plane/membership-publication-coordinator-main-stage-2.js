import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  shouldPreferAuthoritativeMembershipState,
} from '../../src/control-plane/membership-publication-coordinator-stage-2.js';
import {MEMBERSHIP_LIFECYCLE_STATE} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING, MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY, MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED, buildMembershipPublicationAckDeferralNodeRow, buildMembershipPublicationTrimEndpointRow, buildMembershipPublicationTrimServiceRow} from './membership-publication-coordinator-main-stage-1.js';

const PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH = 29;
const PUBLICATION_CONVERGENCE_REPAIR_NOW_MS = 1000;
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID = 'seed-node';
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID = 'node-1';
const PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID = 'node-2';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID = 'node-1-ws';
const PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID = 'svc-1';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS = 'ws://node-1:8082';
const PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT = 'ws';
const PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS = 'active';
const PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION = 'ready';
const PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH = 31;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID = 'node-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY = Object.freeze({
  satisfied: true,
  readyEligibleNodeCount: 1,
  totalPriorityPartitionCount: 1,
  blockedPartitionCount: 0,
});
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PUBLICATION_ID =
  'publication-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID =
  'node-auth-refresh-missing';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NOW_MS = 2500;

test('shouldPreferAuthoritativeMembershipState refreshes published count-only rows without lifecycle projection evidence',
  async (t) => {
    const preferAuthoritativeRead = shouldPreferAuthoritativeMembershipState({
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
        ],
        priority_partition_summary:
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
      },
    });
    const steadyProjectionRead =
      shouldPreferAuthoritativeMembershipState({
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          published_active_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          required_ack_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          acknowledged_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          priority_partition_summary:
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
          membership_lifecycle_summary: {
            publishedActiveNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
            projectedServingNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
            locallyEligibleNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
          },
        },
      });

    t.equal(
      preferAuthoritativeRead,
      true,
      'count-only published rows without lifecycle projection evidence should refresh owner planning inputs',
    );
    t.equal(
      steadyProjectionRead,
      false,
      'published rows with explicit ACK and lifecycle projection evidence can stay on local planning inputs',
    );
    t.end();
  });

test('readPublicationPlanningSnapshot uses authoritative membership evidence for published rows without lifecycle projection evidence',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_AUTH_REFRESH_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const cachedNodeRows = [{
      [COLUMN.NODE_ID]: PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      [COLUMN.STATUS]: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
      [COLUMN.CONNECTION_STATE]: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT,
    }];
    const authoritativeNodeRows = [
      ...cachedNodeRows,
      {
        [COLUMN.NODE_ID]: PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID,
        [COLUMN.STATUS]: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        [COLUMN.CONNECTION_STATE]:
          PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
        [COLUMN.READY_LEASE_EXPIRES_AT]:
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT,
      },
    ];
    const readinessRefreshModes = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
      },
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows(tableName, _sql, _params, options) {
          if (tableName !== TABLES.NODES) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows:
              options.authoritativeReadMode ===
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE
                  .OWNER_RPC_PREFERRED_SQL_FALLBACK ?
                authoritativeNodeRows :
                cachedNodeRows,
          };
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRefreshModes.push(options.allowAuthoritativeRefresh === true);
          return [];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
        async getMembershipPublicationPlanningSnapshotBestEffort() {
          return null;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return cachedNodeRows;
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_AUTH_REFRESH_NOW_MS,
    });

    const snapshot = await coordinator.readPublicationPlanningSnapshot();

    t.same(
      readinessRefreshModes,
      [true],
      'lifecycle-thin published rows should ask readiness for authoritative planning evidence',
    );
    t.same(
      snapshot.nodeRows.map((row) => row[COLUMN.NODE_ID]).sort(),
      [
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID,
      ],
      'planning should merge authoritative node rows instead of retaining the stale local cache only',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate promotes healthy projected members while publication acknowledgements are still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'convergence-time promotions should advance the publication epoch from the latest durable epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'healthy projected members should be promoted even while the current publication epoch is still awaiting acknowledgements',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'serving',
          'node-3': 'joining',
        },
      },
      'the promoted member should remain publish-pending while the new epoch converges',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible projected members while publication is not converged',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'ack-pending convergence should accept projected members that are recovery-eligible even before full traffic eligibility converges',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.lifecycleState,
      MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      'promoted recovery-eligible members should stay publish-pending until acknowledgements close the new epoch',
    );
  });

test('deriveMembershipPublicationCandidate closes unchanged recovery-eligible ACK debt through the publication owner',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      false,
      'the fixture must stay on the existing publication epoch',
    );
    t.equal(
      candidate.publicationStatus,
      'PUBLISHED',
      'unchanged recovery-eligible ACK debt should close through canonical owner planning',
    );
    t.same(
      candidate.acknowledgedNodeIds,
      ['node-1', 'node-2'],
      'the pending required node should be folded into the owner ACK set',
    );
    t.same(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'serving',
      },
      'ACK closure should publish the durable member state instead of preserving publish-pending debt',
    );
  });

test('deriveMembershipPublicationCandidate does not block recovery-eligible promotion while recovery epochs are open',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      recoveryEpochsByNodeId: {
        'node-2': [
          {
            epochId: 'node-2:1',
            open: true,
          },
        ],
        'node-3': [
          {
            epochId: 'node-3:1',
            open: true,
          },
        ],
      },
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'open recovery epochs should not prevent promotion once recovery-eligible readiness is true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-2': 'catching_up',
        'node-3': 'catching_up',
      },
      'promoted members with open recovery epochs should remain marked as catching_up until convergence closes',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible joiners when publication health is still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 16,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'ack-pending convergence should not deadlock on clusterMemberHealthy when controlPlaneRecoveryEligible is already true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'joining',
      },
      'recovery-eligible joiners should remain lifecycle-visible while the publication epoch converges',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        readinessDecisionDimensions: [
          'clusterMemberHealthy',
          'controlPlaneRecoveryEligible',
        ],
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
        readinessExcludedNodeIds: [],
        clusterMemberUnhealthyExcludedNodeIds: [],
      },
      'membership lifecycle diagnostics should capture that projection included the joiner via recovery eligibility',
    );
  });

test('deriveMembershipPublicationCandidate defers process-dead recovery joiners from publication acknowledgements',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY,
        ),
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED,
        ),
      ],
      readinessEntries: [
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
        },
      ],
      nodeEndpointRows: [
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      serviceRows: [
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      nowMs: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS,
    });

    t.same(
      candidate.projectedServingNodeIds,
      [
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
      ],
      'the recovery-only node should remain visible in the observed projection',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'process-dead recovery-only nodes must not enter the ack-required publication set',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'the publication should not require acknowledgement from the deferred node',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleIncludedNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferredNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferralReasonCodesByNodeId: {
          [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID]: [
            CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
          ],
        },
      },
      'publication diagnostics should retain the recovery projection and the ack deferral reason',
    );
    t.same(
      candidate.recoveryActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'deferred recovery projections should not hold the publication recovery gate open as missing published members',
    );
    t.same(
      candidate.missingPublishedRecoveryActiveNodeIds,
      [],
      'deferred recovery projections should not create publication trim debt',
    );
  });

test('deriveMembershipPublicationCandidate reopens a stale published membership for recovery-eligible joiners',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      true,
      'a stale published baseline should reopen when recovery-eligible joiners are visible',
    );
    t.equal(
      candidate.publicationEpoch,
      18,
      'the reopened publication should advance from the last published epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'recovery-eligible joiners should be promoted even when the latest epoch is currently published',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
      },
      'the reopened publication should record that recovery eligibility drove the projection',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.recoveryProtocolState,
      'publication_pending',
      'the reopened publication should expose the shared recovery protocol phase',
    );
    t.match(
      candidate.membershipLifecycleSummary?.participationByNodeId,
      {
        'node-1': {
          state: 'published_active',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoverySource: 'recovery_eligible_projection',
        },
      },
      'the publication candidate should preserve canonical node participation states',
    );
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication when recovery eligibility proves missing members',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'the publication owner should schedule a bounded repair publication',
    );
    t.equal(
      candidate.publicationEpoch,
      PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH + 1,
      'the repair publication should advance the stale published epoch',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'missing published members must not remain classified as a closed published publication',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'recovery-eligible readiness is the bounded owner evidence for the missing member',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'the reopened publication should require ACK evidence from the repaired cohort',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'the repair evidence should be visible in owner diagnostics',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending reason-only evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'reason-only priority recovery evidence should reopen stale published membership',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending reason-only evidence should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the reason-only recovery projection',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending blocked readiness evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'priority recovery pending readiness should reopen stale published membership even when serve dimensions are blocked',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'blocked serve readiness should become an open repair publication instead of retaining stale published truth',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending readiness should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the blocked readiness recovery projection',
    );
    t.end();
  });
