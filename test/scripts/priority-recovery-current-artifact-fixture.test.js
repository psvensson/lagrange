import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPriorityRecoveryResiduals,
} from '../../scripts/analyze-priority-recovery-residuals.js';

const ENCODING_UTF8 = 'utf8';
const FIXTURE_PATH =
  'test/scripts/__fixtures__/topology-convergence/' +
  'rolling-restart-green-only-baseline-priority-recovery.fixture.json';
const BASELINE_REPORT_PATH = FIXTURE_PATH;
const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const OWNER_OPERATION_WORKFLOW = 'operation_workflow_owner';
const BOUNDARY_WORKFLOW_PROGRESS = 'workflow_progress';
const BOUNDARY_REBALANCER_HANDOFF = 'rebalancer_handoff';
const ACTION_ADVANCE_EXISTING_OPERATION = 'advance_existing_operation';
const ACTION_WAIT_FOR_OPERATION_PROGRESS = 'wait_for_operation_progress';
const STATE_COORDINATION_MISMATCH = 'coordination_mismatch';
const STATE_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
const STATE_SPREAD_SATISFIED_IN_FLIGHT = 'spread_satisfied_in_flight';
const CLASS_OPERATION_CREATED_NO_TRANSITIONS =
  'operation_created_but_no_step_transitions';
const CLASS_COORDINATOR_EXCLUDES_NODE =
  'publication_recovery_eligible_but_coordinator_excludes_node';
const WAIT_EVENT_DRIVEN = 'event_driven';
const WAIT_RETRY_SCHEDULED = 'retry_scheduled';
const ACTUATION_DISPATCHED_WAITING_PROGRESS =
  'dispatched_waiting_progress';
const ACTUATION_PERSISTED_NOT_DISPATCHED = 'persisted_not_dispatched';
const PARTITION_CONTROL_PLANE_PUBLICATIONS = 'control_plane_publications-p1';
const PARTITION_REPLICA_OPERATIONS = 'replica_operations-p1';
const PARTITION_SQL_TRANSACTION_PARTICIPANTS =
  'sql_transaction_participants-p1';
const PARTITION_SQL_TRANSACTIONS = 'sql_transactions-p1';
const EXPECTED_WITNESS_COUNT = 6;
const EXPECTED_GROUP_COUNT = 2;
const EXPECTED_WORKFLOW_WITNESS_COUNT = 4;
const EXPECTED_HANDOFF_WITNESS_COUNT = 2;
const EXPECTED_EMPTY_WITNESS_COUNT = 0;
const EXPECTED_EMPTY_GROUP_COUNT = 0;
const NON_BLOCKING_FIXTURE_PATH = 'inline-non-blocking-priority-witness';
const NON_BLOCKING_OPERATION_ID = 'non-blocking-priority-operation';

const EXPECTED_BURNDOWN = Object.freeze({
  scenario: SCENARIO_ROLLING_RESTART,
  witnessCount: EXPECTED_WITNESS_COUNT,
  splitRequired: true,
  ownerBoundaryGroupCount: EXPECTED_GROUP_COUNT,
  groups: [
    {
      owner: OWNER_OPERATION_WORKFLOW,
      boundary: BOUNDARY_WORKFLOW_PROGRESS,
      witnessCount: EXPECTED_WORKFLOW_WITNESS_COUNT,
      partitionIds: [
        PARTITION_CONTROL_PLANE_PUBLICATIONS,
        PARTITION_REPLICA_OPERATIONS,
        PARTITION_SQL_TRANSACTION_PARTICIPANTS,
        PARTITION_SQL_TRANSACTIONS,
      ],
      semanticStateIds: [
        STATE_COORDINATION_MISMATCH,
        STATE_RECOVERING_IN_FLIGHT,
      ],
      progressClassIds: [
        CLASS_OPERATION_CREATED_NO_TRANSITIONS,
        CLASS_COORDINATOR_EXCLUDES_NODE,
      ],
      nextRequiredActions: [ACTION_ADVANCE_EXISTING_OPERATION],
      actuationStates: [
        ACTUATION_DISPATCHED_WAITING_PROGRESS,
        ACTUATION_PERSISTED_NOT_DISPATCHED,
      ],
      waitModes: [WAIT_EVENT_DRIVEN],
    },
    {
      owner: OWNER_OPERATION_WORKFLOW,
      boundary: BOUNDARY_REBALANCER_HANDOFF,
      witnessCount: EXPECTED_HANDOFF_WITNESS_COUNT,
      partitionIds: [
        PARTITION_SQL_TRANSACTION_PARTICIPANTS,
        PARTITION_SQL_TRANSACTIONS,
      ],
      semanticStateIds: [STATE_RECOVERING_IN_FLIGHT],
      progressClassIds: [],
      nextRequiredActions: [ACTION_WAIT_FOR_OPERATION_PROGRESS],
      actuationStates: [ACTUATION_DISPATCHED_WAITING_PROGRESS],
      waitModes: [WAIT_RETRY_SCHEDULED],
    },
  ],
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function projectBurndown(summary) {
  return {
    scenario: summary.scenario,
    witnessCount: summary.witnessCount,
    splitRequired: summary.splitRequired,
    ownerBoundaryGroupCount: summary.ownerBoundaryGroupCount,
    groups: summary.ownerBoundaryGroups.map((group) => ({
      owner: group.owner,
      boundary: group.boundary,
      witnessCount: group.witnessCount,
      partitionIds: group.partitionIds,
      semanticStateIds: group.semanticStateIds,
      progressClassIds: group.progressClassIds,
      nextRequiredActions: group.nextRequiredActions,
      actuationStates: group.actuationStates,
      waitModes: group.waitModes,
    })),
  };
}

test('May 13 priority recovery fixture freezes the blocker burn-down shape', () => {
  const summary = buildPriorityRecoveryResiduals(
    FIXTURE_PATH,
    readJson(FIXTURE_PATH),
  );

  assert.deepEqual(projectBurndown(summary), EXPECTED_BURNDOWN);
});

test('May 13 priority recovery fixture matches the representative artifact', () => {
  const fixtureSummary = buildPriorityRecoveryResiduals(
    FIXTURE_PATH,
    readJson(FIXTURE_PATH),
  );
  const reportSummary = buildPriorityRecoveryResiduals(
    BASELINE_REPORT_PATH,
    readJson(BASELINE_REPORT_PATH),
  );

  assert.deepEqual(
    projectBurndown(fixtureSummary),
    projectBurndown(reportSummary),
  );
});

test('spread-satisfied closure witnesses are not residual blockers', () => {
  const summary = buildPriorityRecoveryResiduals(
    NON_BLOCKING_FIXTURE_PATH,
    {
      scenario: SCENARIO_ROLLING_RESTART,
      publicationConvergence: {
        priorityRecoveryPartitionWitnesses: [
          {
            partitionId: PARTITION_CONTROL_PLANE_PUBLICATIONS,
            semanticStateId: STATE_SPREAD_SATISFIED_IN_FLIGHT,
            operationIds: [NON_BLOCKING_OPERATION_ID],
            currentOwner: OWNER_OPERATION_WORKFLOW,
            blockingBoundary: BOUNDARY_WORKFLOW_PROGRESS,
            waitMode: WAIT_EVENT_DRIVEN,
            nextRequiredAction: ACTION_WAIT_FOR_OPERATION_PROGRESS,
            actuationState: ACTUATION_PERSISTED_NOT_DISPATCHED,
          },
        ],
      },
    },
  );

  assert.equal(summary.witnessCount, EXPECTED_EMPTY_WITNESS_COUNT);
  assert.equal(summary.ownerBoundaryGroupCount, EXPECTED_EMPTY_GROUP_COUNT);
  assert.deepEqual(summary.ownerBoundaryGroups, []);
});
