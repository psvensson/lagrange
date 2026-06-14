import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NUM,
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
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {TEST_COUNT_ONLY_ACK_DEBT_COUNT, TEST_COUNT_ONLY_ACK_NODE_ID, TEST_COUNT_ONLY_ACK_OBSERVED_AT, TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT, TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH, TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY, TEST_PRIORITY_SERVE_BUDGET_BYTES, TEST_PRIORITY_SERVE_LAST_HEARTBEAT, TEST_PRIORITY_SERVE_PARTITION_ID, TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT, TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT, createActiveNode, createCache, createMessageGroupService} from './control-plane-readiness-service-planning-snapshot-support.js';

test('ControlPlaneReadinessService projects recovery eligibility blockers without overriding publication-gate blockers',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed-node',
      systemTableCache: createCache(),
      now: () => 1500,
    });

    const settledProjection =
      readinessService.getPriorityControlPlaneRecoveryState({
        observedAt: 1500,
        membershipPublication: {
          publicationEpoch: 24,
          status: 'PUBLISHED',
          createdAt: 1200,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: 24,
          publicationStatus: 'PUBLISHED',
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            false,
        },
      });

    t.same(
      settledProjection.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING],
      'recovery eligibility should project one explicit blocker when publication has already settled',
    );

    const pendingProjection =
      readinessService.getPriorityControlPlaneRecoveryState({
        observedAt: 1600,
        membershipPublication: {
          publicationEpoch: 25,
          status: 'ACK_PENDING',
          createdAt: 1300,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: 25,
          publicationStatus: 'ACK_PENDING',
          requiredAckNodeIds: ['seed-node', 'node-b'],
          acknowledgedNodeIds: ['seed-node'],
        },
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            false,
        },
      });

    t.same(
      pendingProjection.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
      'publication-gate blockers should remain canonical without an extra recovery-eligibility shadow blocker',
    );
    t.end();
  });

test('ControlPlaneReadinessService clears stale priority-spread reasons once the publication gate is ready',
  (t) => {
    const TEST_NODE_ID = 'node-priority-spread-stale-ready';
    const TEST_OBSERVED_AT = 1800;
    const TEST_PUBLICATION_CREATED_AT = 1500;
    const TEST_PUBLICATION_EPOCH = 31;
    const TEST_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
    });
    const TEST_STALE_PRIORITY_RECOVERY_REASONS = Object.freeze([
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ]);
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_OBSERVED_AT,
    });

    const projection = readinessService.getPriorityControlPlaneRecoveryState({
      observedAt: TEST_OBSERVED_AT,
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: TEST_PUBLICATION_CREATED_AT,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryReasonCodes: TEST_STALE_PRIORITY_RECOVERY_REASONS,
      },
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
      },
    });

    t.equal(
      projection.publicationRecoveryGate.active,
      false,
      'summary-satisfied publication gate should stay ready',
    );
    t.same(
      projection.reasonCodes,
      [],
      'readiness projection should not reintroduce a stale priority-spread blocker',
    );
    t.equal(
      projection.active,
      false,
      'stale priority-spread reason alone should not keep recovery active',
    );
    t.end();
  });

test('ControlPlaneReadinessService rebuilds stale embedded publication gates from the planning snapshot',
  (t) => {
    const TEST_NODE_ID = 'node-priority-embedded-gate-stale';
    const TEST_OBSERVED_AT = 1850;
    const TEST_PUBLICATION_EPOCH = 32;
    const TEST_READY_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    });
    const TEST_STALE_EMBEDDED_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: Object.freeze({
        satisfied: false,
        missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
      }),
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_OBSERVED_AT,
    });

    const projection = readinessService.getPriorityControlPlaneRecoveryState({
      observedAt: TEST_OBSERVED_AT,
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: 1500,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        publicationRecoveryGate: TEST_STALE_EMBEDDED_GATE,
      },
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
      },
    });

    t.equal(
      projection.publicationRecoveryGate.ready,
      true,
      'the projection should canonicalize the embedded gate from the current planning snapshot',
    );
    t.equal(
      projection.active,
      false,
      'the projection should not keep a stale embedded priority-spread gate active',
    );
    t.same(
      projection.reasonCodes,
      [],
      'stale embedded spread reasons should clear once the current planning snapshot is satisfied',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves count-only ACK debt in rebuilt publication gates',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_COUNT_ONLY_ACK_OBSERVED_AT,
    });
    const membershipPublicationPlanningSnapshot = {
      publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      pendingAckCount: TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      pendingAckEvidenceState:
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      priorityPartitionSummary: TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
      priorityRecoveryReasonCodes: [],
    };

    const projection = readinessService.getPriorityControlPlaneRecoveryState({
      observedAt: TEST_COUNT_ONLY_ACK_OBSERVED_AT,
      membershipPublication: {
        publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT,
      },
      membershipPublicationPlanningSnapshot,
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
      },
    });

    t.equal(
      readinessService.isPriorityControlPlaneRecoveryActive(
        membershipPublicationPlanningSnapshot,
      ),
      true,
      'count-only ACK debt should keep the direct recovery-active check open',
    );
    t.equal(
      projection.publicationRecoveryGate.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'rebuilt publication gates should retain count-only ACK debt',
    );
    t.equal(
      projection.publicationRecoveryGate.ackPending,
      true,
      'count-only ACK debt should stay ACK-pending after gate rebuild',
    );
    t.equal(
      projection.active,
      true,
      'count-only ACK debt should keep priority recovery active',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves provided count-only ACK debt when direct publication has an empty ACK list',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_COUNT_ONLY_ACK_OBSERVED_AT,
    });
    const resolvedSnapshot =
      readinessService.resolveMembershipPublicationPlanningSnapshot({
        nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
        observedAt: TEST_COUNT_ONLY_ACK_OBSERVED_AT,
        membershipPublication: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          createdAt: TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT,
          requiredAckNodeIds: [],
          acknowledgedNodeIds: [],
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          requiredAckNodeIds: [],
          acknowledgedNodeIds: [],
          pendingAckCount: TEST_COUNT_ONLY_ACK_DEBT_COUNT,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
          priorityRecoveryReasonCodes: [],
        },
      });

    t.equal(
      resolvedSnapshot.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      'explicit count-only evidence should survive the direct/provided merge',
    );
    t.equal(
      resolvedSnapshot.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'explicit count-only ACK debt should not be zeroed by an empty direct list',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'rebuilt publication gate should keep count-only ACK debt',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.active,
      true,
      'count-only ACK debt should keep the recovery gate active',
    );
    t.end();
  });

test('ControlPlaneReadinessService infers count-only ACK debt when a provided snapshot has an empty ACK list',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_COUNT_ONLY_ACK_OBSERVED_AT,
    });
    const resolvedSnapshot =
      readinessService.resolveMembershipPublicationPlanningSnapshot({
        nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
        observedAt: TEST_COUNT_ONLY_ACK_OBSERVED_AT,
        membershipPublication: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          createdAt: TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT,
          requiredAckNodeIds: [],
          acknowledgedNodeIds: [],
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          requiredAckNodeIds: [],
          acknowledgedNodeIds: [],
          pendingAckCount: TEST_COUNT_ONLY_ACK_DEBT_COUNT,
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
          priorityRecoveryReasonCodes: [],
        },
      });

    t.equal(
      resolvedSnapshot.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      'count-only debt should be inferred when the ACK list is empty but count debt exists',
    );
    t.equal(
      resolvedSnapshot.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'inferred count-only ACK debt should survive the direct/provided merge',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'rebuilt publication gate should keep inferred count-only ACK debt',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.active,
      true,
      'inferred count-only ACK debt should keep the recovery gate active',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves direct count-only ACK debt over provided empty ACK list',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_COUNT_ONLY_ACK_OBSERVED_AT,
    });
    const resolvedSnapshot =
      readinessService.resolveMembershipPublicationPlanningSnapshot({
        nodeId: TEST_COUNT_ONLY_ACK_NODE_ID,
        observedAt: TEST_COUNT_ONLY_ACK_OBSERVED_AT,
        membershipPublication: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          createdAt: TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT,
          pendingAckCount: TEST_COUNT_ONLY_ACK_DEBT_COUNT,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          requiredAckNodeIds: [],
          acknowledgedNodeIds: [],
          pendingAckCount: NUM.ZERO,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST,
          priorityPartitionSummary:
            TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
          priorityRecoveryReasonCodes: [],
        },
      });

    t.equal(
      resolvedSnapshot.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      'direct count-only evidence should not be replaced by an empty ACK list',
    );
    t.equal(
      resolvedSnapshot.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'direct count-only ACK debt should survive the direct/provided merge',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.pendingAckCount,
      TEST_COUNT_ONLY_ACK_DEBT_COUNT,
      'rebuilt publication gate should keep direct count-only ACK debt',
    );
    t.equal(
      resolvedSnapshot.publicationRecoveryGate.active,
      true,
      'direct count-only ACK debt should keep the recovery gate active',
    );
    t.end();
  });

test('ControlPlaneReadinessService reopens serve readiness when the current planning snapshot closes a stale embedded priority gate',
  (t) => {
    const TEST_NODE_ID = 'node-priority-serve-stale-gate';
    const TEST_OBSERVED_AT = '2026-04-23T09:10:00.000Z';
    const TEST_PUBLICATION_EPOCH = 45;
    const TEST_READY_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    });
    const TEST_STALE_EMBEDDED_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: Object.freeze({
        satisfied: false,
        blockedPartitions: Object.freeze([
          Object.freeze({
            partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          }),
        ]),
      }),
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    });
    const nodeRow = {
      ...createActiveNode(TEST_NODE_ID),
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT,
      [COLUMN.LAST_HEARTBEAT]: TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    };

    const readiness = readinessService.buildEvaluatedNodeReadinessSnapshot({
      nodeId: TEST_NODE_ID,
      lifecycleState: SERVICE_STATUS.ACTIVE,
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        publicationRecoveryGate: TEST_STALE_EMBEDDED_GATE,
      },
      nodeEvidence: readinessService.buildNodeEvidence(
        TEST_NODE_ID,
        nodeRow,
      ),
      nodeRow,
      observedAt: TEST_OBSERVED_AT,
      publication: {
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
      },
      serviceRows: [createMessageGroupService(TEST_NODE_ID)],
      capacity: {
        nodeId: TEST_NODE_ID,
        budgetBytes: TEST_PRIORITY_SERVE_BUDGET_BYTES,
        pressureState: PRESSURE_STATE.NORMAL,
      },
    });

    t.equal(
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      true,
      'serve readiness should follow the canonical rebuilt publication gate instead of a stale embedded gate',
    );
    t.equal(
      readiness.priorityControlPlaneRecovery.active,
      false,
      'the readiness projection should treat the rebuilt publication gate as settled',
    );
    t.equal(
      readiness.reasons.some((reason) =>
        reason.code ===
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING),
      false,
      'serve admission should not emit the priority-recovery pending reason once the rebuilt gate is ready',
    );
    t.end();
  });

test('ControlPlaneReadinessService prefers the direct membership publication row when a retained planning snapshot keeps an older recovery gate open',
  (t) => {
    const TEST_NODE_ID = 'node-priority-serve-retained-planning';
    const TEST_OBSERVED_AT = '2026-04-23T09:11:00.000Z';
    const TEST_PUBLICATION_EPOCH = 46;
    const TEST_READY_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 1,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    });
    const TEST_STALE_RETAINED_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      publicationObservationState: 'authoritative',
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 1,
        missingPartitionIds: Object.freeze([TEST_PRIORITY_SERVE_PARTITION_ID]),
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: TEST_PRIORITY_SERVE_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        })]),
      }),
      pendingAckNodeIds: Object.freeze([]),
      missingPublishedNodeIds: Object.freeze([]),
      prioritySpreadPending: true,
      publicationPending: false,
      ackPending: false,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: TEST_NODE_ID,
      systemTableCache: createCache(),
      now: () => TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    });
    const nodeRow = {
      ...createActiveNode(TEST_NODE_ID),
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT,
      [COLUMN.LAST_HEARTBEAT]: TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
    };

    const readiness = readinessService.buildEvaluatedNodeReadinessSnapshot({
      nodeId: TEST_NODE_ID,
      lifecycleState: SERVICE_STATUS.ACTIVE,
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
        publishedActiveNodeIds: [TEST_NODE_ID],
        requiredAckNodeIds: [TEST_NODE_ID],
        acknowledgedNodeIds: [TEST_NODE_ID],
        priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publicationObservationState: 'authoritative',
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary:
          TEST_STALE_RETAINED_GATE.priorityPartitionSummary,
        publicationRecoveryGate: TEST_STALE_RETAINED_GATE,
      },
      nodeEvidence: readinessService.buildNodeEvidence(
        TEST_NODE_ID,
        nodeRow,
      ),
      nodeRow,
      observedAt: TEST_OBSERVED_AT,
      publication: {
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
      },
      serviceRows: [createMessageGroupService(TEST_NODE_ID)],
      capacity: {
        nodeId: TEST_NODE_ID,
        budgetBytes: TEST_PRIORITY_SERVE_BUDGET_BYTES,
        pressureState: PRESSURE_STATE.NORMAL,
      },
    });

    t.equal(
      readiness.priorityControlPlaneRecovery.active,
      false,
      'the direct current membership publication row should retire the older retained planning gate',
    );
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [],
      'no recovery-pending reason should remain once the current direct row closes the canonical gate',
    );
    t.equal(
      readiness.runtimeAuthority.visibility?.priorityRecoveryActive,
      false,
      'runtime authority should stop carrying the stale recovery-active state',
    );
    t.equal(
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      true,
      'serve readiness should follow the current direct row rather than the retained stale planning answer',
    );
    t.equal(
      readiness.reasons.some((reason) =>
        reason.code ===
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING),
      false,
      'serve readiness should not emit the recovery-pending reason once the direct row is ready',
    );
    t.end();
  });

test('ControlPlaneReadinessService priority recovery health uses the direct ready publication row over stale sync planning',
  (t) => {
    const TEST_NODE_ID = 'node-priority-health-direct-ready';
    const TEST_OBSERVED_AT = 2100;
    const TEST_PUBLICATION_EPOCH = 47;
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
    const TEST_STALE_PLANNING_GATE = Object.freeze({
      state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      ready: false,
      active: true,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      publicationObservationState: 'authoritative',
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      reasonCodes: Object.freeze([
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ]),
      priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
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
            publishedActiveNodeIds: [TEST_NODE_ID],
            requiredAckNodeIds: [TEST_NODE_ID],
            acknowledgedNodeIds: [TEST_NODE_ID],
            priorityPartitionSummary: TEST_READY_PRIORITY_PARTITION_SUMMARY,
          };
        },
        deriveClusterMembershipCandidateSync() {
          return {
            targetNodeId: TEST_NODE_ID,
            publicationEpoch: TEST_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            publicationObservationState: 'authoritative',
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
            priorityRecoveryReasonCodes: [
              CONTROL_PLANE_PRIORITY_RECOVERY_REASON
                .PRIORITY_PARTITIONS_NOT_SPREAD,
            ],
            priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
            publicationRecoveryGate: TEST_STALE_PLANNING_GATE,
          };
        },
      },
      now: () => TEST_OBSERVED_AT,
    });

    const health = readinessService.getPriorityControlPlaneRecoveryHealthSync(
      TEST_NODE_ID,
      TEST_OBSERVED_AT,
    );

    t.equal(
      health.healthy,
      true,
      'priority recovery health should follow the current direct publication row',
    );
    t.equal(
      health.details,
      undefined,
      'stale planning details should not keep health degraded after the direct row is ready',
    );
    t.end();
  });

