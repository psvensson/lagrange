export function registerFailureBundleCore10Tests(context) {
  const {
    it,
    ACTIVE_GATE_ACK_IDS_CLEAR_STALE_COUNT_TEST_NAME,
    ACTIVE_GATE_ACK_SET_DIFFERENCE_TEST_NAME,
    ACTIVE_GATE_CANONICAL_MISSING_WITH_STALE_CLOSURE_TEST_NAME,
    ACTIVE_GATE_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    ACTIVE_GATE_NESTED_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    assert,
    buildCanonicalPublicationEvidenceFromControlPlane,
    buildPublicationConvergenceSummary,
    hasPublicationMissingActiveNodeBlocker,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_WAIT_MODE,
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  } = context;

  it(
    ACTIVE_GATE_CANONICAL_MISSING_WITH_STALE_CLOSURE_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 99;
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const SNAPSHOT_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const MISSING_NODE_ID = 'missing-published-node-current';
      const PUBLICATION_GATE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE +
        '=' +
        MISSING_NODE_ID;
      const CLOSURE_RECORD_ID = 'CL-004';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 2;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: ONE_COUNT,
          publicationPending: true,
          prioritySpreadPending: true,
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
          publicationRecoveryGate: {
            ready: false,
            publicationEpoch: PUBLICATION_EPOCH,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
            pendingAckNodeIds: [],
            pendingAckCount: ZERO_COUNT,
            missingPublishedNodeIds: [MISSING_NODE_ID],
            missingPublishedCount: ONE_COUNT,
            publicationPending: true,
            prioritySpreadPending: true,
            closureRecordId: CLOSURE_RECORD_ID,
            closureWitnessClass: CLOSURE_WITNESS_CLASS,
          },
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: ONE_COUNT,
          publicationPending: true,
          prioritySpreadPending: true,
          publicationConvergenceGateReasons: [PUBLICATION_GATE_REASON],
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            inactiveNodeCount: INACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
            selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
            pendingAckNodeIds: [],
            pendingAckCount: ZERO_COUNT,
            missingPublishedCount: ONE_COUNT,
            gateReasons: [PUBLICATION_GATE_REASON],
            prioritySpreadSatisfied: false,
            prioritySpreadGap: ONE_COUNT,
            priorityBlockedPartitionCount: ZERO_COUNT,
            blockers: [SNAPSHOT_COVERAGE_BLOCKER],
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.activeGateSnapshotCoveragePending,
        true,
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        ONE_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(
        publicationConvergence.closureWitnessClass,
        CLOSURE_WITNESS_CLASS,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          PUBLICATION_GATE_REASON,
        ),
        true,
      );
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        true,
      );
    },
  );

  it(
    ACTIVE_GATE_ACK_IDS_CLEAR_STALE_COUNT_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 94;
      const PUBLICATION_STATUS_OPEN = 'OPEN';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const MISSING_NODE_ID = 'missing-published-node';
      const PUBLISHED_NODE_ONE = 'published-node-1';
      const PUBLISHED_NODE_TWO = 'published-node-2';
      const PUBLISHED_NODE_THREE = 'published-node-3';
      const PUBLISHED_NODE_FOUR = 'published-node-4';
      const PUBLISHED_NODE_FIVE = 'published-node-5';
      const EXPECTED_NODE_COUNT = 5;
      const CURRENT_PENDING_ACK_COUNT = 1;
      const STALE_PENDING_ACK_COUNT = 2;
      const MISSING_PUBLISHED_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_OPEN,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: CURRENT_PENDING_ACK_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: MISSING_PUBLISHED_COUNT,
          publicationPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_OPEN,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: STALE_PENDING_ACK_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: MISSING_PUBLISHED_COUNT,
          publicationPending: true,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_OPEN,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                PUBLISHED_NODE_ONE,
                PUBLISHED_NODE_TWO,
                PUBLISHED_NODE_THREE,
                PUBLISHED_NODE_FOUR,
              ],
              selectedPublishedActiveCount:
                EXPECTED_NODE_COUNT - CURRENT_PENDING_ACK_COUNT,
              selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
              pendingAckCount: STALE_PENDING_ACK_COUNT,
              missingPublishedCount: MISSING_PUBLISHED_COUNT,
              gateReasons: [],
              blockers: [],
            },
            bestProgress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                PUBLISHED_NODE_ONE,
                PUBLISHED_NODE_TWO,
                PUBLISHED_NODE_THREE,
                PUBLISHED_NODE_FOUR,
                PUBLISHED_NODE_FIVE,
              ],
              selectedPublishedActiveCount: EXPECTED_NODE_COUNT,
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: STALE_PENDING_ACK_COUNT,
              missingPublishedCount: ZERO_COUNT,
              gateReasons: [],
              blockers: [],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        CURRENT_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
    },
  );

  it(
    ACTIVE_GATE_ACK_SET_DIFFERENCE_TEST_NAME,
    () => {
      const REQUIRED_ACK_NODE_ONE = 'required-ack-node-1';
      const REQUIRED_ACK_NODE_TWO = 'required-ack-node-2';
      const ACKED_FOREIGN_NODE = 'acked-foreign-node';
      const PUBLICATION_EPOCH = 95;
      const SINGLE_PENDING_ACK_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        activeGateProgress: {
          publicationEpoch: PUBLICATION_EPOCH,
          requiredAckNodeIds: [
            REQUIRED_ACK_NODE_ONE,
            REQUIRED_ACK_NODE_TWO,
          ],
          acknowledgedNodeIds: [
            REQUIRED_ACK_NODE_TWO,
            ACKED_FOREIGN_NODE,
          ],
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
        },
      };

      const publicationEvidence =
        buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
      const canonicalActiveGateProgress =
        publicationEvidence.priorityRecoveryObservation?.activeGateProgress ||
        publicationEvidence.priorityRecoveryObservation?.activeGate?.progress;
      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.deepEqual(
        canonicalActiveGateProgress.pendingAckNodeIds,
        [REQUIRED_ACK_NODE_ONE],
      );
      assert.equal(
        canonicalActiveGateProgress.pendingAckCount,
        SINGLE_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [REQUIRED_ACK_NODE_ONE],
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        SINGLE_PENDING_ACK_COUNT,
      );
    },
  );

  it(
    'keeps publication debt cleared while waiting for operation-workflow progress',
    () => {
      const PUBLICATION_EPOCH = 95;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const PARTITION_ID = PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID;
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const SNAPSHOT_COVERAGE_NODE_COUNT = 1;
      const EXPECTED_NODE_COUNT = 3;
      const PENDING_ACK_COUNT = 2;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          blockedNodeIds: [],
          blockedNodeCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: true,
          priorityRecoveryPartitionWitnesses: [{
            partitionId: PARTITION_ID,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            actuationOwner:
              PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            blockingBoundary:
              PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
            waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            nextRequiredAction:
              PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
            actuationState:
              PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
          }],
        },
        activeGateProgress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          snapshotCoverageComplete: false,
          snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publicationEpoch: PUBLICATION_EPOCH,
          selectedMissingPublishedNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [],
      );
    },
  );

  it(
    'suppresses active-gate pending ACK reentry while waiting on operation-workflow progress',
    () => {
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 3;
      const ZERO_COUNT = 0;
      const PENDING_ACK_COUNT = 2;
      const PENDING_ACK_NODE_ONE = '11601fe0-72d6-5853-8590-ec2881853e72';
      const PENDING_ACK_NODE_TWO = 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58';
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: 'OPEN',
          pendingAckNodeIds: [
            PENDING_ACK_NODE_ONE,
            PENDING_ACK_NODE_TWO,
          ],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            '8be8d30f-4499-5eed-865c-71b4d529a67a',
          ],
          missingPublishedCount: 1,
          publicationPending: true,
          prioritySpreadPending: true,
          priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
          priorityRecoveryGateReasons: [],
          priorityRecoveryClosureState: 'closure_pending',
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: 'OPEN',
          recoveryProtocolState: 'publication_pending',
          publicationPending: true,
          prioritySpreadPending: true,
          pendingAckNodeIds: [
            PENDING_ACK_NODE_ONE,
            PENDING_ACK_NODE_TWO,
          ],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            '8be8d30f-4499-5eed-865c-71b4d529a67a',
          ],
          missingPublishedCount: 1,
          publicationConvergenceGateReasons: ['priority_partitions_not_spread'],
          priorityRecoveryPartitionWitnesses: [
            {
              partitionId: 'replica_operations-p1',
              currentOwner:
                PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
              actuationOwner:
                PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
              blockingBoundary:
                PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
              semanticStateId:
                PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
              actuationState:
                PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
              waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            },
            {
              partitionId: 'sql_write_operations-p1',
              currentOwner:
                PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
              actuationOwner:
                PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
              blockingBoundary:
                PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
              semanticStateId:
                PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
              actuationState:
                PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
              waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            },
          ],
        },
        activeGate: {
          mode: 'startup',
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: 1,
            inactiveNodeCount: 4,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: 'OPEN',
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState: 'publication_pending',
            pendingAckCount: ZERO_COUNT,
            selectedPublishedActiveNodeIds: [
              PENDING_ACK_NODE_ONE,
              '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
              '7493b0ab-a054-5fad-a91b-5e331db29304',
              PENDING_ACK_NODE_TWO,
            ],
            selectedMissingPublishedNodeIds: [
              '8be8d30f-4499-5eed-865c-71b4d529a67a',
            ],
            missingPublishedCount: 1,
            blockers: [
              'inactive_nodes=4',
              'snapshot_coverage=3/5',
            ],
          },
          bestProgress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: 3,
            inactiveNodeCount: 2,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: 'OPEN',
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState: 'publication_pending',
            pendingAckCount: PENDING_ACK_COUNT,
            selectedPublishedActiveNodeIds: [
              '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
              '7493b0ab-a054-5fad-a91b-5e331db29304',
            ],
            selectedMissingPublishedNodeIds: [
              PENDING_ACK_NODE_ONE,
              '8be8d30f-4499-5eed-865c-71b4d529a67a',
              PENDING_ACK_NODE_TWO,
            ],
            missingPublishedCount: 3,
            blockers: [
              'inactive_nodes=2',
              'snapshot_coverage=3/5',
            ],
          },
        },
      };

      const publicationConvergence = buildPublicationConvergenceSummary(controlPlane);
      const dominantWitness =
        publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness;

      assert.equal(
        publicationConvergence.activeGateSnapshotCoveragePending,
        true,
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [],
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          'snapshot_coverage=3/5',
        ),
        true,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          'publication_epoch_pending',
        ),
        false,
      );
      assert.equal(
        publicationConvergence.publicationStatus,
        'OPEN',
      );
      assert.equal(
        dominantWitness.currentOwner,
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      );
      assert.equal(
        dominantWitness.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      );
      assert.equal(
        dominantWitness.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      );
      assert.equal(
        dominantWitness.actuationState,
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      );
    },
  );

  it(
    ACTIVE_GATE_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 96;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 3;
      const PENDING_ACK_COUNT = 1;
      const UNRESOLVED_PARTITION_COUNT = 1;
      const ZERO_COUNT = 0;
      const PARTITION_ID = 'replica_operations-p1';
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
          priorityRecoveryProgressClassIds: [
            PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
          ],
          priorityRecoverySemanticStateIds: [
            PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
          ],
          priorityRecoveryPartitionWitnesses: [{
            partitionId: PARTITION_ID,
            semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progressClassIds: [
              PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
            ],
            blockerReasonCodes: [
              PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
            ],
            actuationState:
              PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
            currentOwner:
              PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
            blockingBoundary:
              PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
            nextRequiredAction:
              PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
            waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
          }],
        },
        activeGate: {
          mode: 'startup',
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            inactiveNodeCount: INACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            pendingAckCount: PENDING_ACK_COUNT,
            missingPublishedCount: ZERO_COUNT,
            priorityRecoveryProgressClasses: {
              unresolvedClassIds: [
                PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
              ],
              unresolvedClassCount: UNRESOLVED_PARTITION_COUNT,
              unresolvedSemanticStateIds: [
                PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
              ],
              unresolvedSemanticStateCount: UNRESOLVED_PARTITION_COUNT,
              blockedPartitionIds: [PARTITION_ID],
              blockedPartitionCount: UNRESOLVED_PARTITION_COUNT,
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.activeGateSnapshotCoveragePending,
        true,
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
    },
  );

  it(
    ACTIVE_GATE_NESTED_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 97;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 3;
      const PENDING_ACK_COUNT = 1;
      const UNRESOLVED_PARTITION_COUNT = 1;
      const ZERO_COUNT = 0;
      const PARTITION_ID = 'replica_operations-p1';
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
          priorityRecoveryProgressClassIds: [
            PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
          ],
          priorityRecoverySemanticStateIds: [
            PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
          ],
          priorityRecoveryPartitionWitnesses: [{
            partitionId: PARTITION_ID,
            semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progressClassIds: [
              PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
            ],
            blockerReasonCodes: [
              PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
            ],
            actuationState:
              PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
            currentOwner:
              PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
            blockingBoundary:
              PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
            nextRequiredAction:
              PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
            waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
          }],
          activeGate: {
            mode: ACTIVE_GATE_MODE_STARTUP,
            progress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              activeNodeCount: ACTIVE_NODE_COUNT,
              inactiveNodeCount: INACTIVE_NODE_COUNT,
              snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
              snapshotCoverageComplete: false,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              publicationEpoch: PUBLICATION_EPOCH,
              pendingAckCount: PENDING_ACK_COUNT,
              missingPublishedCount: ZERO_COUNT,
              priorityRecoveryProgressClasses: {
                unresolvedClassIds: [
                  PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
                ],
                unresolvedClassCount: UNRESOLVED_PARTITION_COUNT,
                unresolvedSemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
                ],
                unresolvedSemanticStateCount: UNRESOLVED_PARTITION_COUNT,
                blockedPartitionIds: [PARTITION_ID],
                blockedPartitionCount: UNRESOLVED_PARTITION_COUNT,
              },
            },
          },
        },
        activeGateProgress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
          snapshotCoverageComplete: false,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publicationEpoch: PUBLICATION_EPOCH,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.activeGateSnapshotCoveragePending,
        true,
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
    },
  );

  it(
    'ignores stale best-progress missing publication evidence when current active-gate progress is clean',
    () => {
      const PUBLICATION_EPOCH = 92;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const MISSING_NODE_ID = 'stale-missing-node';
      const PUBLISHED_NODE_ID = 'published-node';
      const MISSING_NODE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ID;
      const ACTIVE_GATE_MISSING_BLOCKER = 'publication_gate=' +
        MISSING_NODE_REASON;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
              selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: ZERO_COUNT,
              missingPublishedCount: ZERO_COUNT,
              gateReasons: [],
              blockers: [],
            },
            bestProgress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
              selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
              selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
              pendingAckCount: ZERO_COUNT,
              missingPublishedCount: ONE_COUNT,
              gateReasons: [MISSING_NODE_REASON],
              blockers: [ACTIVE_GATE_MISSING_BLOCKER],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(publicationConvergence.missingPublishedNodeIds, []);
      assert.deepEqual(
        publicationConvergence.publicationConvergenceGateReasons,
        [],
      );
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        false,
      );
    },
  );
}
