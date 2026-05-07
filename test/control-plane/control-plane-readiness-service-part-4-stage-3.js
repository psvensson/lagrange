import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PRIORITY_RECOVERY_REASON} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {TEST_PRIORITY_SERVE_PARTITION_ID, TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT, createCache} from './control-plane-readiness-service-part-4-stage-1.js';

test('ControlPlaneReadinessService owner-read planning answer uses the direct ready publication row over a stale same-epoch planning witness',
  async (t) => {
    const TEST_NODE_ID = 'node-priority-owner-read-direct-ready';
    const TEST_OBSERVED_AT = 2200;
    const TEST_PUBLICATION_EPOCH = 48;
    const TEST_READY_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    });
    const TEST_STALE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 2,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
            publishedActiveNodeIds: [TEST_NODE_ID],
            requiredAckNodeIds: [TEST_NODE_ID],
            acknowledgedNodeIds: [TEST_NODE_ID],
            priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
          };
        },
        async deriveClusterMembershipCandidate() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PUBLICATION_EPOCH_PENDING,
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const planningAnswer =
      await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should surface the direct current publication status',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      false,
      'owner-read planning should retire the stale same-epoch active witness',
    );
    t.same(
      planningAnswer?.priorityRecoveryReasonCodes,
      [],
      'owner-read planning should clear stale same-epoch recovery reasons once the direct row is ready',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.ready,
      true,
      'owner-read planning should expose the ready direct publication gate',
    );
    t.end();
  });

test('ControlPlaneReadinessService owner-read planning answer keeps the direct same-epoch published status while spread remains active',
  async (t) => {
    const TEST_NODE_ID = 'node-priority-owner-read-direct-published-status';
    const TEST_OBSERVED_AT = 2300;
    const TEST_PUBLICATION_EPOCH = 49;
    const TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 2,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
            publishedActiveNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            requiredAckNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            acknowledgedNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
          };
        },
        async deriveClusterMembershipCandidate() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const planningAnswer =
      await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should keep the direct same-epoch published row status',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      true,
      'owner-read planning should keep the active spread gate open',
    );
    t.same(
      planningAnswer?.priorityRecoveryReasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'owner-read planning should keep the active spread reason codes',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.ready,
      false,
      'owner-read planning should preserve the open direct publication gate',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should not let a stale same-epoch planning witness reopen the publication status',
    );
    t.end();
  });

test('ControlPlaneReadinessService owner-read planning answer keeps the direct same-epoch publication status over a conflicting stale planning gate',
  async (t) => {
    const TEST_NODE_ID =
      'node-priority-owner-read-direct-published-conflicting-gate';
    const TEST_OBSERVED_AT = 2350;
    const TEST_PUBLICATION_EPOCH = 49;
    const TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 2,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    });
    const TEST_CONFLICTING_PLANNING_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      publicationObservationState: 'authoritative',
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
            publishedActiveNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            requiredAckNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            acknowledgedNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
          };
        },
        async deriveClusterMembershipCandidate() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
            publicationRecoveryGate: TEST_CONFLICTING_PLANNING_GATE,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const planningAnswer =
      await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should keep the direct same-epoch publication status even when the retained gate says open',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      true,
      'owner-read planning should preserve the direct active spread gate',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should rebuild the gate from the direct publication row instead of the stale open gate status',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.ready,
      false,
      'owner-read planning should keep the direct same-epoch spread debt open',
    );
    t.end();
  });

test('ControlPlaneReadinessService owner-read planning answer demotes lower-epoch retained decision snapshots behind the direct publication row',
  async (t) => {
    const TEST_NODE_ID = 'node-priority-owner-read-direct-newer-epoch';
    const TEST_OBSERVED_AT = 2400;
    const TEST_DIRECT_PUBLICATION_EPOCH = 50;
    const TEST_STALE_DECISION_PUBLICATION_EPOCH = 49;
    const TEST_PARTITION_ID = 'sql_transactions-p1';
    const TEST_SERIAL_WAIT_PARTITION_ID = 'sql_transaction_participants-p1';
    const TEST_SERIAL_WAIT_OPERATION_ID = 'op-lower-epoch-serial-wait';
    const TEST_DIRECT_RECOVERY_NODE_IDS = Object.freeze([
      TEST_NODE_ID,
      'node-peer-a',
      'node-peer-b',
    ]);
    const TEST_STALE_RECOVERY_NODE_IDS = Object.freeze([
      TEST_NODE_ID,
      'node-peer-a',
    ]);
    const TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([TEST_PARTITION_ID]),
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    });
    const TEST_STALE_DECISION_SNAPSHOTS = Object.freeze({
      capturedAt: TEST_OBSERVED_AT - 100,
      publicationEpoch: TEST_STALE_DECISION_PUBLICATION_EPOCH,
      priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
      snapshotCount: 1,
      partitionCount: 1,
      snapshots: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          epoch: TEST_STALE_DECISION_PUBLICATION_EPOCH,
          correlationKey:
            `${TEST_PARTITION_ID}|` +
            `${TEST_STALE_DECISION_PUBLICATION_EPOCH}|` +
            'operation_unknown',
          blockerReasons: Object.freeze([
            'priority_operation_serial_wait',
          ]),
          planner: Object.freeze({
            ready: false,
            spreadGap: 1,
            readyDistinctNodeCount: 2,
            requiredDistinctNodeCount: 3,
          }),
          admission: Object.freeze({
            effectiveEligibleNodeIds: TEST_STALE_RECOVERY_NODE_IDS,
            effectiveEligibleNodeCount: TEST_STALE_RECOVERY_NODE_IDS.length,
          }),
          completion: Object.freeze({
            state: 'blocked',
          }),
          observation: Object.freeze({
            workflowState: 'none',
            visibilityState: 'none',
            convergenceState: 'spread_gap',
            provenance: Object.freeze({
              capturedAt: TEST_OBSERVED_AT - 100,
              workflowSource: 'none',
              timelineSource: 'none',
              semanticSource: 'priority_recovery_snapshot',
            }),
          }),
          progress: Object.freeze({
            contractState: 'pending',
            nextAction: 'wait',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'wait_for_operation_progress',
            blockingBoundary: 'workflow_progress',
            waitMode: 'event_driven',
            lastProgressAtMs: TEST_OBSERVED_AT - 100,
            evidenceSourceIds: Object.freeze([
              'blocker_reasons',
            ]),
          }),
          actuation: Object.freeze({
            owner: 'operation_workflow_owner',
            state: 'transition_deferred',
            operationCount: 0,
            lastProgressAtMs: TEST_OBSERVED_AT - 100,
          }),
          coordinator: Object.freeze({
            operationCount: 0,
            operationIds: Object.freeze([]),
            operation: null,
            serialWaitOperationCount: 1,
            serialWaitOperationIds: Object.freeze([
              TEST_SERIAL_WAIT_OPERATION_ID,
            ]),
            serialWaitPartitionIds: Object.freeze([
              TEST_SERIAL_WAIT_PARTITION_ID,
            ]),
          }),
        }),
      ]),
      blockerPartitionIdsByReason: Object.freeze({
        priority_operation_serial_wait: Object.freeze([TEST_PARTITION_ID]),
        eligible_but_no_operation_created: Object.freeze([]),
        operation_created_but_no_step_transitions: Object.freeze([]),
        learner_active_but_never_promotable: Object.freeze([]),
        publication_recovery_eligible_but_coordinator_excludes_node:
          Object.freeze([]),
      }),
      partitionIdsBySemanticState: Object.freeze({
        converged: Object.freeze([]),
        spread_satisfied_in_flight: Object.freeze([]),
        needs_operation: Object.freeze([TEST_PARTITION_ID]),
        operation_stalled: Object.freeze([]),
        learner_promotion_blocked: Object.freeze([]),
        coordination_mismatch: Object.freeze([]),
        recovering_in_flight: Object.freeze([]),
        blocked_unclassified: Object.freeze([]),
      }),
      unresolvedSemanticStateIds: Object.freeze([
        'needs_operation',
      ]),
      unresolvedSemanticStateCount: 1,
      unresolvedSemanticBlockedPartitionIds: Object.freeze([
        TEST_PARTITION_ID,
      ]),
      unresolvedSemanticBlockedPartitionCount: 1,
      hasExplicitSemanticStateContract: true,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: TEST_DIRECT_PUBLICATION_EPOCH,
            status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
            publishedActiveNodeIds: TEST_DIRECT_RECOVERY_NODE_IDS,
            projectedServingNodeIds: TEST_DIRECT_RECOVERY_NODE_IDS,
            locallyEligibleNodeIds: TEST_DIRECT_RECOVERY_NODE_IDS,
            requiredAckNodeIds: TEST_DIRECT_RECOVERY_NODE_IDS,
            acknowledgedNodeIds: TEST_DIRECT_RECOVERY_NODE_IDS,
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
          };
        },
        async deriveClusterMembershipCandidate() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_DIRECT_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
            projectedServingNodeIds: TEST_STALE_RECOVERY_NODE_IDS,
            locallyEligibleNodeIds: TEST_STALE_RECOVERY_NODE_IDS,
            priorityRecoveryDecisionSnapshots: TEST_STALE_DECISION_SNAPSHOTS,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const planningAnswer =
      await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner-read planning should keep the direct newer publication status',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      true,
      'owner-read planning should keep the active spread gate open',
    );
    t.same(
      planningAnswer?.priorityRecoveryReasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'owner-read planning should preserve the direct active spread reasons',
    );
    t.equal(
      planningAnswer?.priorityRecoveryDecisionSnapshots,
      null,
      'owner-read planning should demote lower-epoch retained decision snapshots from the operational answer',
    );
    t.end();
  });

test('ControlPlaneReadinessService owner-read sync planning answer keeps the direct same-epoch publication status over a conflicting stale planning gate',
  (t) => {
    const TEST_NODE_ID =
      'node-priority-owner-read-sync-direct-published-conflicting-gate';
    const TEST_OBSERVED_AT = 2475;
    const TEST_PUBLICATION_EPOCH = 50;
    const TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 2,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    });
    const TEST_CONFLICTING_PLANNING_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      publicationObservationState: 'authoritative',
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
            publishedActiveNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            requiredAckNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            acknowledgedNodeIds: [TEST_NODE_ID, 'node-peer-a'],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
          };
        },
        deriveClusterMembershipCandidateSync() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_ACTIVE_PRIORITY_PARTITION_SUMMARY,
            publicationRecoveryGate: TEST_CONFLICTING_PLANNING_GATE,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const planningAnswer =
      readinessService.getPriorityRecoveryPlanningAnswerForOwnerReadSync(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'sync owner-read planning should keep the direct same-epoch publication status even when the retained gate says open',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      true,
      'sync owner-read planning should preserve the direct active spread gate',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'sync owner-read planning should rebuild the gate from the direct publication row instead of the stale open gate status',
    );
    t.equal(
      planningAnswer?.publicationRecoveryGate?.ready,
      false,
      'sync owner-read planning should keep the direct same-epoch spread debt open',
    );
    t.end();
  });
