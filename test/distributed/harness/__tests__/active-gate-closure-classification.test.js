import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  classifyActiveGateClosureWitness,
} from '../active-gate-closure-classification.js';
import {
  PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
  buildPriorityRecoveryPublicationConvergenceFixture,
} from '../__fixtures__/priority-recovery-actuation-contract-fixture.js';

const ACTIVE_GATE_READINESS_MODE_LOAD = 'load';
const ACTIVE_GATE_READINESS_MODE_STARTUP = 'startup';
const ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const ACTIVE_GATE_REASON_PRIORITY_SPREAD_PENDING =
  'priority_control_plane_spread_pending';
const ACTIVE_GATE_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_SELECTED_NODE_COUNT = 5;
const ACTIVE_GATE_PARTIAL_SNAPSHOT_COVERAGE_COUNT = 3;
const ACTIVE_GATE_MISSING_PUBLISHED_COUNT = 3;
const ACTIVE_GATE_ZERO = 0;
const ACTIVE_GATE_PRIORITY_SPREAD_TEST_NAME =
  'active gate classifies publication-closed priority spread as closure witness';
const ACTIVE_GATE_STARTUP_PUBLICATION_LAG_TEST_NAME =
  'active gate classifies startup publication lag as CL-006 witness when snapshot covers partial nodes and publication gate is stub';

test(ACTIVE_GATE_PRIORITY_SPREAD_TEST_NAME,
  () => {
    const publicationConvergence =
      buildPriorityRecoveryPublicationConvergenceFixture();
    const progressSnapshot = {
      publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
      snapshotCoverageComplete: true,
      snapshotCoverageNodeCount: ACTIVE_GATE_SELECTED_NODE_COUNT,
      expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      activeNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      inactiveNodeCount: ACTIVE_GATE_ZERO,
      pendingAckCount: ACTIVE_GATE_ZERO,
      missingPublishedCount: ACTIVE_GATE_ZERO,
      prioritySpreadSatisfied: false,
      gateReasons: [ACTIVE_GATE_REASON_PRIORITY_SPREAD_PENDING],
      priorityRecoveryDecisionSnapshots: {
        ...PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
        priorityPartitionSummary:
          publicationConvergence.priorityPartitionSummary,
      },
    };

    const witness = classifyActiveGateClosureWitness({
      progressSnapshot,
      publicationConvergence,
      readinessMode: ACTIVE_GATE_READINESS_MODE_LOAD,
    });

    assert.deepEqual(witness, {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
      closureWitnessClass: ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
    });
  });

test(ACTIVE_GATE_STARTUP_PUBLICATION_LAG_TEST_NAME,
  () => {
    const progressSnapshot = {
      publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
      snapshotCoverageComplete: false,
      snapshotCoverageNodeCount: ACTIVE_GATE_PARTIAL_SNAPSHOT_COVERAGE_COUNT,
      expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      activeNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      inactiveNodeCount: ACTIVE_GATE_ZERO,
      pendingAckCount: ACTIVE_GATE_ZERO,
      missingPublishedCount: ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
      gateReasons: [],
      publicationRecoveryGate: {pendingAckCount: ACTIVE_GATE_ZERO},
    };

    const witness = classifyActiveGateClosureWitness({
      progressSnapshot,
      readinessMode: ACTIVE_GATE_READINESS_MODE_STARTUP,
    });

    assert.deepEqual(witness, {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
      closureWitnessClass:
        ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
    });
  });

