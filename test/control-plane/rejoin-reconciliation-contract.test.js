import {test} from '../../src/test-helpers/tap.js';
import {
  POST_REJOIN_RECONCILIATION_BOUNDARY,
  POST_REJOIN_RECONCILIATION_DECISION_STATE,
  POST_REJOIN_RECONCILIATION_EVIDENCE_STATE,
  POST_REJOIN_RECONCILIATION_OWNER,
  POST_REJOIN_RECONCILIATION_REASON_CODE,
  buildPostRejoinReconciliationDecision,
  buildPostRejoinReconciliationSnapshot,
  isPostRejoinReconciliationSatisfied,
} from '../../src/control-plane/rejoin-reconciliation-contract.js';

const TEST_NODE_ID = 'node-1';
const TEST_OBSERVED_AT = 12345;
const TEST_EXTERNAL_REMOTE_BLOCK_REASON = 'remote_operation_owner_blocked';

test('post-rejoin reconciliation snapshot normalizes owner boundary and evidence',
  async (t) => {
    const snapshot = buildPostRejoinReconciliationSnapshot({
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      localTopologyState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      remoteOperationState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      startupAdmissionState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
    });

    t.match(snapshot, {
      owner: POST_REJOIN_RECONCILIATION_OWNER,
      boundary: POST_REJOIN_RECONCILIATION_BOUNDARY,
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      evidence: {
        localTopology: {
          state: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
        },
        remoteOperation: {
          state: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
        },
        startupAdmission: {
          state: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
        },
      },
    });
  });

test('post-rejoin reconciliation is satisfied only when all evidence is satisfied',
  async (t) => {
    const decision = buildPostRejoinReconciliationDecision({
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      localTopologyState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      remoteOperationState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      startupAdmissionState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
    });

    t.equal(decision.state, POST_REJOIN_RECONCILIATION_DECISION_STATE.SATISFIED);
    t.equal(isPostRejoinReconciliationSatisfied(decision), true);
    t.ok(
      decision.reasonCodes.includes(
        POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_SATISFIED,
      ),
      'satisfied decision should carry the canonical satisfied reason',
    );
  });

test('post-rejoin reconciliation remains pending when remote evidence is unavailable',
  async (t) => {
    const decision = buildPostRejoinReconciliationDecision({
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      localTopologyState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      startupAdmissionState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
    });

    t.equal(decision.state, POST_REJOIN_RECONCILIATION_DECISION_STATE.PENDING);
    t.equal(isPostRejoinReconciliationSatisfied(decision), false);
    t.same(decision.reasonCodes, [
      POST_REJOIN_RECONCILIATION_REASON_CODE.REMOTE_OPERATION_UNAVAILABLE,
      POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_PENDING,
    ]);
  });

test('post-rejoin reconciliation blocked evidence dominates pending evidence',
  async (t) => {
    const decision = buildPostRejoinReconciliationDecision({
      nodeId: TEST_NODE_ID,
      observedAt: TEST_OBSERVED_AT,
      localTopologyState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      remoteOperationState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING,
      startupAdmissionState: POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED,
      startupAdmissionReasonCodes: [TEST_EXTERNAL_REMOTE_BLOCK_REASON],
    });

    t.equal(decision.state, POST_REJOIN_RECONCILIATION_DECISION_STATE.BLOCKED);
    t.same(decision.reasonCodes, [
      TEST_EXTERNAL_REMOTE_BLOCK_REASON,
      POST_REJOIN_RECONCILIATION_REASON_CODE.STARTUP_ADMISSION_BLOCKED,
      POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_BLOCKED,
    ]);
  });
