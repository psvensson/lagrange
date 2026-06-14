import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  SERVICE_STATUS,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
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
import {
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {TEST_PRIORITY_RECOVERY_PENDING_REASON, TEST_PRIORITY_SERVE_BUDGET_BYTES, TEST_PRIORITY_SERVE_EPOCH, TEST_PRIORITY_SERVE_LAST_HEARTBEAT, TEST_PRIORITY_SERVE_NODE_ID, TEST_PRIORITY_SERVE_OBSERVED_AT, TEST_PRIORITY_SERVE_PARTITION_ID, TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT, TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT, createAccountingService, createActiveNode, createCache, createMessageGroupService, createPublicationService} from './control-plane-readiness-service-planning-snapshot-support.js';

test('ControlPlaneReadinessService owner-read sync planning answer demotes lower-epoch retained decision snapshots behind the direct publication row',
  (t) => {
    const TEST_NODE_ID = 'node-priority-owner-read-sync-direct-newer-epoch';
    const TEST_OBSERVED_AT = 2500;
    const TEST_DIRECT_PUBLICATION_EPOCH = 51;
    const TEST_STALE_DECISION_PUBLICATION_EPOCH = 50;
    const TEST_PARTITION_ID = 'sql_transactions-p1';
    const TEST_SERIAL_WAIT_PARTITION_ID = 'sql_transaction_participants-p1';
    const TEST_SERIAL_WAIT_OPERATION_ID = 'op-sync-lower-epoch-serial-wait';
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
        getLatestPublicationForNodeSync(targetNodeId) {
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
        deriveClusterMembershipCandidateSync() {
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
      readinessService.getPriorityRecoveryPlanningAnswerForOwnerReadSync(
        TEST_NODE_ID,
        TEST_OBSERVED_AT,
      );

    t.equal(
      planningAnswer?.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'sync owner-read planning should keep the direct newer publication status',
    );
    t.equal(
      planningAnswer?.priorityRecoveryActive,
      true,
      'sync owner-read planning should keep the active spread gate open',
    );
    t.equal(
      planningAnswer?.priorityRecoveryDecisionSnapshots,
      null,
      'sync owner-read planning should demote lower-epoch retained decision snapshots from the operational answer',
    );
    t.end();
  });

test('ControlPlaneReadinessService keeps same-epoch planning closure witnesses diagnostics-only when the direct membership publication row is already ready',
  async (t) => {
    const TEST_NODE_ID = 'node-priority-direct-ready-closure-witness';
    const TEST_OBSERVED_AT = '2026-04-24T10:15:00.000Z';
    const TEST_PUBLICATION_EPOCH = 46;
    const TEST_CLOSURE_PENDING_STATE = 'closure_pending';
    const TEST_PRIORITY_RECOVERY_NEEDS_OPERATION = 'needs_operation';
    const TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
    const TEST_READY_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    });
    const TEST_ACTIVE_CLOSURE_WITNESS = Object.freeze({
      state: TEST_CLOSURE_PENDING_STATE,
      prioritySpreadPending: true,
      publicationRefreshRequired: false,
      closureRecordId: null,
      closureWitnessClass: null,
      blockedPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      blockedPartitionCount: 1,
      unresolvedSemanticStateIds: Object.freeze([
        TEST_PRIORITY_RECOVERY_NEEDS_OPERATION,
      ]),
      satisfiedPartitionIds: Object.freeze([]),
      decisionPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      refreshedPriorityPartitionSummary: null,
      summarySpreadPending: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
    });
    const TEST_ACTIVE_PLANNING_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      publicationObservationState: 'authoritative',
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
      priorityRecoveryClosureWitness: TEST_ACTIVE_CLOSURE_WITNESS,
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache({
        nodes: [createActiveNode(TEST_NODE_ID)],
        services: [createMessageGroupService(TEST_NODE_ID)],
      }),
      storageAccountingService: createAccountingService({
        [TEST_NODE_ID]: {
          nodeId: TEST_NODE_ID,
          budgetBytes: TEST_PRIORITY_SERVE_BUDGET_BYTES,
          pressureState: PRESSURE_STATE.NORMAL,
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
        recentTransitions: [],
      }),
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
        async deriveClusterMembershipCandidate(options = {}) {
          if (options.publisherNodeId !== TEST_NODE_ID) {
            return null;
          }
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            publicationObservationState: 'authoritative',
            recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
            priorityRecoveryClosureWitness: TEST_ACTIVE_CLOSURE_WITNESS,
            publicationRecoveryGate: TEST_ACTIVE_PLANNING_GATE,
          };
        },
      },
      now: () => TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    });

    const readiness = await readinessService.getNodeReadiness(TEST_NODE_ID, {
      now: TEST_OBSERVED_AT,
    });

    t.equal(
      readiness.priorityControlPlaneRecovery.active,
      false,
      'same-epoch planning closure witnesses should not reopen the direct ready publication gate',
    );
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [],
      'the ready direct row should clear publication-gate blocker reasons',
    );
    t.equal(
      readiness.runtimeAuthority.visibility?.priorityRecoveryActive,
      false,
      'runtime authority visibility should follow the resolved ready gate instead of the raw planning witness',
    );
    t.same(
      readiness.runtimeAuthority.reasonCodes,
      [],
      'runtime authority reason codes should come from the resolved planning answer',
    );
    t.equal(
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      true,
      'serve admission should stay open once the direct ready row closes the gate',
    );
    t.equal(
      readiness.reasons.some((reason) =>
        reason.code ===
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING),
      false,
      'the stale planning witness should not emit the priority recovery pending readiness reason',
    );
    t.match(
      readiness.priorityControlPlaneRecovery.priorityRecoveryObservation,
      {
        priorityRecoveryClosureState: TEST_CLOSURE_PENDING_STATE,
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON
            .PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
      },
      'the planning closure witness should remain visible as diagnostics-only observation',
    );
    t.end();
  });

test('ControlPlaneReadinessService closes external serve readiness during priority recovery while keeping recovery admission open',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_PRIORITY_SERVE_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    });
    const nodeRow = {
      ...createActiveNode(TEST_PRIORITY_SERVE_NODE_ID),
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT,
      [COLUMN.LAST_HEARTBEAT]: TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    };

    const readiness = readinessService.buildEvaluatedNodeReadinessSnapshot({
      nodeId: TEST_PRIORITY_SERVE_NODE_ID,
      lifecycleState: SERVICE_STATUS.ACTIVE,
      membershipPublication: {
        publicationEpoch: TEST_PRIORITY_SERVE_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: TEST_PRIORITY_SERVE_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [
            {
              partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
            },
          ],
        },
      },
      nodeEvidence: readinessService.buildNodeEvidence(
        TEST_PRIORITY_SERVE_NODE_ID,
        nodeRow,
      ),
      nodeRow,
      observedAt: TEST_PRIORITY_SERVE_OBSERVED_AT,
      publication: {
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
      },
      serviceRows: [createMessageGroupService(TEST_PRIORITY_SERVE_NODE_ID)],
      capacity: {
        nodeId: TEST_PRIORITY_SERVE_NODE_ID,
        budgetBytes: TEST_PRIORITY_SERVE_BUDGET_BYTES,
        pressureState: PRESSURE_STATE.NORMAL,
      },
    });

    t.equal(
      CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      TEST_PRIORITY_RECOVERY_PENDING_REASON,
      'priority recovery pending must be an owned readiness reason code',
    );
    t.equal(
      readiness.dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ],
      true,
      'internal recovery admission should remain open during priority recovery',
    );
    t.equal(
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE],
      true,
      'repair admission should stay open for the converging control-plane path',
    );
    t.equal(
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      false,
      'external serve readiness must close until publication recovery is ready',
    );
    t.match(
      readiness.reasons.find((reason) =>
        reason.code ===
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ),
      {
        dimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      },
      'serve closure should expose the canonical priority recovery reason',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves source snapshot version in membership publication diagnostics',
  async (t) => {
    const nodeId = 'node-publication-source-version';
    const cache = createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        [nodeId]: {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 12,
            status: 'PUBLISHED',
            publishedActiveNodeIds: [nodeId],
            requiredAckNodeIds: [nodeId],
            acknowledgedNodeIds: [nodeId],
            sourceTopologyEpoch: 8,
            sourceSnapshotVersion: 34,
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(nodeId);

    t.equal(readiness.membershipPublication.publicationEpoch, 12);
    t.equal(readiness.membershipPublication.sourceSnapshotVersion, 34);
    t.end();
  });

test('ControlPlaneReadinessService reports stale published priority summaries without enqueueing reconcile from the read path',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-refresh')],
      services: [createMessageGroupService('node-priority-refresh')],
    });
    const queueEnqueues = [];
    const stalePublication = {
      publicationEpoch: 17,
      status: 'PUBLISHED',
      createdAt: 1200,
      publishedActiveNodeIds: ['node-priority-refresh'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['sql_write_operations-p1'],
      },
    };
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-refresh',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-refresh': {
          nodeId: 'node-priority-refresh',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        async getLatestPublicationForNode() {
          return stalePublication;
        },
        enqueueClusterMembershipReconcile(reason, context) {
          queueEnqueues.push({reason, context});
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-refresh',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD],
    );
    t.match(
      readiness.priorityControlPlaneRecovery.priorityRecoveryObservation,
      {
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: 'priority_spread_pending',
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary: {
          satisfied: false,
          missingPartitionIds: ['sql_write_operations-p1'],
        },
        priorityRecoveryBlockedPartitionCount: 1,
        priorityRecoveryPartitionSnapshots: [],
      },
      'readiness should expose the shared priority-recovery observation contract',
    );
    t.equal(
      queueEnqueues.length,
      0,
      'readiness reads should no longer enqueue reconcile from stale publication observation',
    );
    t.end();
  });

test('ControlPlaneReadinessService keeps priority control-plane recovery mode active when published membership excludes the target node',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-missing')],
      services: [createMessageGroupService('node-priority-missing')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-missing',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-missing': {
          nodeId: 'node-priority-missing',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode() {
          return {
            publicationEpoch: 16,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['different-node'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-missing',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
      'published membership that does not include the target node must remain in recovery mode',
    );
    t.end();
  });

test('ControlPlaneReadinessService marks hard-pressure nodes ineligible',
  async (t) => {
    const overloadedNode = {
      ...createActiveNode('node-3'),
      [COLUMN.CPU_USAGE_PERCENT]: 100,
    };
    const cache = createCache({
      nodes: [overloadedNode],
      services: [createMessageGroupService('node-3')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-3',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-3': {
          nodeId: 'node-3',
          budgetBytes: 1000,
          pressureState: 'hard',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-3');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.loadReady, false);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY));
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService fails closed without storage owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-4')],
      services: [createMessageGroupService('node-4')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-4',
      systemTableCache: cache,
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-4');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.capacity, null);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService warns once when non-strict storage owner ' +
  'is unavailable',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-4-warn')],
    services: [createMessageGroupService('node-4-warn')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-4-warn',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  const warnCalls = [];
  const errorCalls = [];
  readinessService.logger = {
    warn(message, details) {
      warnCalls.push({message, details});
    },
    error(message, details) {
      errorCalls.push({message, details});
    },
  };

  await readinessService.getNodeReadiness('node-4-warn');
  await readinessService.getNodeReadiness('node-4-warn');

  t.equal(warnCalls.length, 1);
  t.equal(errorCalls.length, 0);
  t.match(warnCalls[0], {
    message: 'ControlPlaneReadinessService missing storage accounting owner',
    details: {
      nodeId: 'node-4-warn',
      owner: 'StorageCapacityAccountingService',
      strictOwnerDependencies: false,
    },
  });
  t.end();
});

