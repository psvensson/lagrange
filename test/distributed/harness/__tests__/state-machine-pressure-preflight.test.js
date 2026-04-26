import {test} from '../../../../src/test-helpers/tap.js';
import {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
} from '../post-rebalance-closure-contract.js';
import {
  PRESSURE_PREFLIGHT_ISSUE_ID,
  STATE_MACHINE_PRESSURE_POINT_ID,
  STATE_MACHINE_PRESSURE_POINT_GRAMMAR,
  STATE_MACHINE_PRESSURE_PREFLIGHT_STATE,
  evaluateStateMachinePressureSnapshot,
  evaluateStaticPressurePointGrammar,
  runStateMachinePressurePreflight,
} from '../state-machine-pressure-preflight.js';

const SNAPSHOT_ID = 'snapshot-under-test';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_STATUS_OPEN = 'OPEN';
const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const NODE_ONE = 'node-1';
const NODE_TWO = 'node-2';
const PARTITION_ONE = 'control_plane_publications-p1';
const PARTITION_TWO = 'replica_operations-p1';
const TARGET_VOTER_COUNT = 3;
const OVER_TARGET_VOTER_COUNT = 4;
const OVER_TARGET_DURATION_MS = 121272;
const OPERATION_ID = 'op-completed-active';
const OPERATION_TYPE_MOVE_ASSIGNMENT = 'MOVE_ASSIGNMENT';
const OPERATION_STATUS_ACTIVE = 'active';
const OPERATION_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const COMPLETED_AT_MS = 1777215659396;
const ISSUE_SORT_SEPARATOR = '|';

function collectIssueIds(result) {
  return result.issues
    .map((issue) => issue.issueId)
    .sort();
}

function findPressurePoint(result, pressurePointId) {
  return result.pressurePoints.find((point) => point.id === pressurePointId);
}

test('state-machine pressure static grammar has closure obligations',
  async (t) => {
    const result = evaluateStaticPressurePointGrammar(
      STATE_MACHINE_PRESSURE_POINT_GRAMMAR,
    );

    t.equal(result.ready, true);
    t.equal(result.issues.length, 0);
    t.equal(result.checkedPointCount, STATE_MACHINE_PRESSURE_POINT_GRAMMAR.length);
  });

test('state-machine pressure preflight flags published pending ACK debt',
  async (t) => {
    const result = evaluateStateMachinePressureSnapshot({
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [NODE_TWO],
          requiredAckNodeIds: [NODE_ONE, NODE_TWO],
          acknowledgedNodeIds: [NODE_ONE],
        },
      },
    }, SNAPSHOT_ID);

    t.same(collectIssueIds(result), [
      PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_PUBLISHED_WITH_PENDING_ACK,
    ]);
  });

test('state-machine pressure preflight flags ack-complete non-terminal publication',
  async (t) => {
    const result = evaluateStateMachinePressureSnapshot({
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_OPEN,
          pendingAckNodeIds: [],
          requiredAckNodeIds: [NODE_ONE, NODE_TWO],
          acknowledgedNodeIds: [NODE_ONE, NODE_TWO],
        },
      },
    }, SNAPSHOT_ID);

    t.same(collectIssueIds(result), [
      PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_COMPLETE_NON_TERMINAL,
    ]);
  });

test('state-machine pressure preflight uses active-gate publication debt',
  async (t) => {
    const result = evaluateStateMachinePressureSnapshot({
      publicationConvergence: {
        publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
        pendingAckCount: 0,
        pendingAckNodeIds: [],
        activeGate: {
          progress: {
            pendingAckCount: 1,
            missingPublishedCount: 1,
            selectedMissingPublishedNodeIds: [NODE_TWO],
          },
        },
      },
    }, SNAPSHOT_ID);
    const publicationPoint = findPressurePoint(
      result,
      STATE_MACHINE_PRESSURE_POINT_ID.PUBLICATION_CONVERGENCE,
    );

    t.same(collectIssueIds(result), [
      PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_PENDING,
    ]);
    t.equal(publicationPoint.evidence.pendingAckCount, 1);
    t.equal(publicationPoint.evidence.missingPublishedCount, 1);
    t.same(publicationPoint.evidence.missingPublishedNodeIds, [NODE_TWO]);
  });

test('state-machine pressure preflight flags missing published-active evidence',
  async (t) => {
    const result = evaluateStateMachinePressureSnapshot({
      publicationConvergence: {
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        activeGateProgress: {
          missingPublishedCount: 1,
          selectedMissingPublishedNodeIds: [NODE_TWO],
        },
      },
    }, SNAPSHOT_ID);

    t.same(collectIssueIds(result), [
      PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_MISSING_PUBLISHED_MEMBERS,
    ]);
  });

test('state-machine pressure preflight surfaces post-active trim pressure',
  async (t) => {
    const result = runStateMachinePressurePreflight({
      diagnosticsSnapshots: [{
        replicaOperationRows: [{
          operationId: OPERATION_ID,
          type: OPERATION_TYPE_MOVE_ASSIGNMENT,
          status: OPERATION_STATUS_ACTIVE,
          workflowStep: OPERATION_WORKFLOW_STEP_ACTIVE,
          completedAt: COMPLETED_AT_MS,
        }],
        priorityRecoveryObservation: {
          prioritySpreadPending: false,
          priorityRecoveryBlockedPartitionCount: 0,
          priorityRecoveryUnresolvedPartitionCount: 0,
        },
        postRebalanceClosure: {
          dimensions: {
            [POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN]: {
              state: POST_REBALANCE_CLOSURE_STATE.CLOSED,
              reasonCodes: [],
              evidence: {},
            },
            [POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM]: {
              state: POST_REBALANCE_CLOSURE_STATE.OPEN,
              reasonCodes: [
                POST_REBALANCE_CLOSURE_REASON.PUBLISHED_MEMBERSHIP_TRIM_DEBT,
              ],
              evidence: {},
            },
            [POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET]: {
              state: POST_REBALANCE_CLOSURE_STATE.OPEN,
              reasonCodes: [
                POST_REBALANCE_CLOSURE_REASON.OVERTARGET_BUDGET_EXCEEDED,
              ],
              evidence: {
                voterCounts: {
                  [PARTITION_ONE]: OVER_TARGET_VOTER_COUNT,
                  [PARTITION_TWO]: OVER_TARGET_VOTER_COUNT,
                },
                overTargetDurations: {
                  [PARTITION_ONE]: OVER_TARGET_DURATION_MS,
                  [PARTITION_TWO]: OVER_TARGET_DURATION_MS,
                },
                targetVoterCount: TARGET_VOTER_COUNT,
              },
            },
          },
        },
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            pendingAckNodeIds: [],
            requiredAckNodeIds: [NODE_ONE, NODE_TWO],
            acknowledgedNodeIds: [NODE_ONE, NODE_TWO],
          },
        },
      }],
    });

    t.equal(result.resultState, STATE_MACHINE_PRESSURE_PREFLIGHT_STATE.WARNING);
    t.equal(result.ready, true);
    t.same(
      result.issues
        .map((issue) => [
          issue.pressurePointId,
          issue.issueId,
        ].join(ISSUE_SORT_SEPARATOR))
        .sort(),
      [
        [
          STATE_MACHINE_PRESSURE_POINT_ID.MEMBERSHIP_TRIM,
          PRESSURE_PREFLIGHT_ISSUE_ID.MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN,
        ].join(ISSUE_SORT_SEPARATOR),
        [
          STATE_MACHINE_PRESSURE_POINT_ID.NO_OVER_TARGET,
          PRESSURE_PREFLIGHT_ISSUE_ID.OVERTARGET_WITH_CLOSED_DRAIN,
        ].join(ISSUE_SORT_SEPARATOR),
        [
          STATE_MACHINE_PRESSURE_POINT_ID.OPERATION_DRAIN,
          PRESSURE_PREFLIGHT_ISSUE_ID.COMPLETED_ACTIVE_OPERATION_ROW,
        ].join(ISSUE_SORT_SEPARATOR),
      ],
    );
  });
