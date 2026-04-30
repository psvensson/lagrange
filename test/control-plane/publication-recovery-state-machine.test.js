import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  PUBLICATION_RECOVERY_EVIDENCE_FLAG,
  PUBLICATION_RECOVERY_INVARIANT_ID,
  PUBLICATION_RECOVERY_LIVENESS_ID,
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  PUBLICATION_RECOVERY_MACHINE_SPEC,
  PUBLICATION_RECOVERY_REASON,
  evaluatePublicationRecoveryMachine,
} from '../../src/control-plane/publication-recovery-state-machine.js';

const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-1',
  SECOND: 'node-2',
});
const TEST_FUNCTION_VALUE_TYPE = 'function';
const TEST_STALE_PENDING_ACK_COUNT = 1;
const TEST_ROOT_PATH = 'spec';
const TEST_PATH_SEPARATOR = '.';
const TEST_EMPTY_LIST = Object.freeze([]);

function collectFunctionPaths(value, path = TEST_ROOT_PATH) {
  if (typeof value === TEST_FUNCTION_VALUE_TYPE) {
    return [path];
  }
  if (!value || typeof value !== 'object') {
    return TEST_EMPTY_LIST;
  }
  return Object.entries(value).flatMap(([key, nestedValue]) =>
    collectFunctionPaths(nestedValue, path + TEST_PATH_SEPARATOR + key),
  );
}

test('publication recovery machine spec is declarative data',
  (t) => {
    t.same(collectFunctionPaths(PUBLICATION_RECOVERY_MACHINE_SPEC), []);
    t.ok(
      PUBLICATION_RECOVERY_MACHINE_SPEC.transitions.some((transition) =>
        transition.action ===
          PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
      ),
    );
    t.ok(
      PUBLICATION_RECOVERY_MACHINE_SPEC.invariants.some((invariant) =>
        invariant.id ===
          PUBLICATION_RECOVERY_INVARIANT_ID.ACK_COMPLETE_NON_TERMINAL,
      ),
    );
    t.ok(
      PUBLICATION_RECOVERY_MACHINE_SPEC.liveness.some((obligation) =>
        obligation.id ===
          PUBLICATION_RECOVERY_LIVENESS_ID.ACK_COMPLETE_EVENTUALLY_PUBLISHED,
      ),
    );
    t.end();
  });

test('publication recovery machine closes ACK-complete metadata refresh',
  (t) => {
    const result = evaluatePublicationRecoveryMachine({
      context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
    });

    t.equal(
      result.action,
      PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
    );
    t.equal(result.nextStatus, CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED);
    t.equal(
      result.reasonCode,
      PUBLICATION_RECOVERY_REASON.REQUIRED_ACKNOWLEDGEMENTS_COMPLETED,
    );
    t.equal(
      result.satisfiedFlagIds.includes(
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE,
      ),
      true,
    );
    t.same(result.invariantBreaches.map((breach) => breach.id), [
      PUBLICATION_RECOVERY_INVARIANT_ID.ACK_COMPLETE_NON_TERMINAL,
    ]);
    t.same(result.livenessObligations.map((obligation) => obligation.id), [
      PUBLICATION_RECOVERY_LIVENESS_ID.ACK_COMPLETE_EVENTUALLY_PUBLISHED,
    ]);
    t.end();
  });

test('publication recovery machine closes ACK-pending metadata when the required ACK list is empty',
  (t) => {
    const result = evaluatePublicationRecoveryMachine({
      context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      requiredAckNodeIds: TEST_EMPTY_LIST,
      acknowledgedNodeIds: TEST_EMPTY_LIST,
      pendingAckNodeIds: TEST_EMPTY_LIST,
      pendingAckCount: TEST_STALE_PENDING_ACK_COUNT,
    });

    t.equal(
      result.action,
      PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
    );
    t.equal(result.nextStatus, CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED);
    t.equal(result.evidence.pendingAckCount, 0);
    t.equal(
      result.satisfiedFlagIds.includes(
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE,
      ),
      true,
    );
    t.end();
  });

test('publication recovery machine records partial acknowledgement writes',
  (t) => {
    const result = evaluatePublicationRecoveryMachine({
      context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
      status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      acknowledgementChanged: true,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
    });

    t.equal(result.action, PUBLICATION_RECOVERY_MACHINE_ACTION.RECORD_ACK);
    t.equal(result.nextStatus, CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING);
    t.equal(
      result.reasonCode,
      PUBLICATION_RECOVERY_REASON.ACKNOWLEDGEMENT_RECORDED,
    );
    t.equal(
      result.satisfiedFlagIds.includes(
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
      ),
      true,
    );
    t.same(result.invariantBreaches, []);
    t.end();
  });

test('publication recovery machine flags published pending ACK contradiction',
  (t) => {
    const result = evaluatePublicationRecoveryMachine({
      context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
      pendingAckNodeIds: [TEST_NODE_ID.SECOND],
    });

    t.same(result.invariantBreaches.map((breach) => breach.id), [
      PUBLICATION_RECOVERY_INVARIANT_ID.PUBLISHED_WITH_PENDING_ACK,
    ]);
    t.end();
  });
