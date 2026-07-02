import {
  STARTUP_AUTHORITY_STATE,
} from '../control-plane/startup-authority-snapshot-owner.js';
import {
  POST_REJOIN_RECONCILIATION_EVIDENCE_STATE,
  buildPostRejoinReconciliationDecision,
} from '../control-plane/rejoin-reconciliation-contract.js';
import {
  NODE_REINTEGRATION_REASON,
} from './node-constants.js';


function resolveStartupAuthorityAdmissionEvidence(readinessService, nodeId) {
  if (!readinessService ||
      typeof readinessService.getStartupAuthoritySnapshotSync !==
        'function') {
    return {
      startupAdmissionState:
        POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
      startupAuthorityState: '',
      reasonCodes: [],
    };
  }

  try {
    const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
      nodeId,
    );
    const admission =
      startupAuthority?.admission &&
        typeof startupAuthority.admission === 'object' ?
        startupAuthority.admission :
        {};
    const blocked =
      startupAuthority?.state === STARTUP_AUTHORITY_STATE.BLOCKED ||
      admission?.admitted === false;
    const startupAdmissionState = blocked === true ?
      POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED :
      POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED;
    const reasonCode =
      Array.isArray(admission?.reasonCodes) &&
        admission.reasonCodes.length > 0 ?
        admission.reasonCodes[0] :
        NODE_REINTEGRATION_REASON.ADMISSION_BLOCKED;
    return {
      startupAdmissionState,
      startupAuthorityState: startupAuthority?.state || '',
      reasonCodes: blocked === true ? [reasonCode] : [],
    };
  } catch (_error) {
    return {
      startupAdmissionState:
        POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING,
      startupAuthorityState: '',
      reasonCodes: [NODE_REINTEGRATION_REASON.ADMISSION_BLOCKED],
    };
  }
}

function resolveStartupAuthorityAdmissionBlockFromEvidence(evidence = {}) {
  return {
    blocked:
      evidence.startupAdmissionState ===
        POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED,
    reasonCode:
      evidence.reasonCodes?.[0] ||
      NODE_REINTEGRATION_REASON.ADMISSION_BLOCKED,
    startupAuthorityState: evidence.startupAuthorityState || '',
  };
}

function buildStartupAdmissionEvidenceFromReconciliationDecision(decision) {
  return {
    startupAdmissionState: decision.evidence.startupAdmission.state,
    startupAuthorityState: '',
    reasonCodes: decision.evidence.startupAdmission.reasonCodes,
  };
}

async function readPostRejoinReconciliationEvidence(
  reconciliationService,
  node,
  observedAt,
) {
  const nodeId = node.node_id;
  const context = {node, nodeId, observedAt};
  const readerRule = Object.freeze([
    Object.freeze({
      matches:
        typeof reconciliationService?.resolvePostRejoinReconciliationEvidence ===
        'function',
      read: () =>
        reconciliationService.resolvePostRejoinReconciliationEvidence(context),
    }),
    Object.freeze({
      matches:
        typeof reconciliationService?.getPostRejoinReconciliationEvidenceSync ===
        'function',
      read: () =>
        reconciliationService.getPostRejoinReconciliationEvidenceSync(context),
    }),
    Object.freeze({
      matches: true,
      read: () => ({}),
    }),
  ]).find((rule) => rule.matches === true);
  return readerRule.read();
}

function buildPostRejoinReconciliationDecisionForNode({
  node,
  observedAt,
  reconciliationEvidence,
  startupAdmissionEvidence,
}) {
  return buildPostRejoinReconciliationDecision({
    ...(reconciliationEvidence || {}),
    nodeId: node.node_id,
    observedAt,
    localTopologyState:
      reconciliationEvidence?.localTopologyState ||
      POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED,
    startupAdmissionState:
      startupAdmissionEvidence.startupAdmissionState,
    startupAdmissionReasonCodes:
      startupAdmissionEvidence.reasonCodes,
  });
}

export {
  buildPostRejoinReconciliationDecisionForNode,
  buildStartupAdmissionEvidenceFromReconciliationDecision,
  readPostRejoinReconciliationEvidence,
  resolveStartupAuthorityAdmissionBlockFromEvidence,
  resolveStartupAuthorityAdmissionEvidence,
};
