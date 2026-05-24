import {buildCanonicalPublicationRecoveryEvidence} from
  '../../../src/control-plane/publication-recovery-evidence.js';
import {
  derivePriorityRecoveryActiveGateReportFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  buildCanonicalPublicationConvergence,
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
} from './publication-evidence-convergence-contract.js';
import {
  buildPublicationEvidenceControlPlane,
} from './publication-evidence-source-selection.js';
import {
  isRecord,
  resolveRawPublicationConvergenceGate,
} from './publication-evidence-shared.js';

function buildCanonicalPublicationEvidenceFromControlPlane(controlPlane = null) {
  if (!isRecord(controlPlane)) {
    return Object.freeze({
      publicationConvergence: null,
      publicationConvergenceGate: null,
      priorityRecoveryObservation: null,
    });
  }
  const evidenceControlPlane =
    buildPublicationEvidenceControlPlane(controlPlane);
  const basePublicationEvidence =
    buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: evidenceControlPlane.publicationConvergence,
      publicationConvergenceGate:
        resolveRawPublicationConvergenceGate(evidenceControlPlane),
      priorityRecoveryObservation:
        evidenceControlPlane.priorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots:
        evidenceControlPlane.priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants:
        evidenceControlPlane.priorityRecoveryInvariants,
      activeGate: evidenceControlPlane.activeGate,
      activeGateProgress: evidenceControlPlane.activeGateProgress,
      logsTable: evidenceControlPlane.logsTable,
    });
  const publicationConvergenceGate =
    basePublicationEvidence.publicationConvergenceGate ||
    buildCanonicalPublicationConvergenceGate(evidenceControlPlane);
  const hasExplicitPublicationConvergenceGate = isRecord(
    resolveRawPublicationConvergenceGate(evidenceControlPlane),
  );
  const priorityRecoveryObservation =
    buildCanonicalPriorityRecoveryObservation(
      evidenceControlPlane,
      publicationConvergenceGate,
      basePublicationEvidence.priorityRecoveryObservation,
      hasExplicitPublicationConvergenceGate,
    );
  const publicationConvergence =
    buildCanonicalPublicationConvergence(
      evidenceControlPlane,
      publicationConvergenceGate,
      priorityRecoveryObservation,
    );

  return Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });
}

function buildCanonicalControlPlaneDiagnosticsFromControlPlane(controlPlane = null) {
  if (!isRecord(controlPlane)) {
    return null;
  }
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const activeGate =
    normalizePriorityRecoveryActiveGateSnapshot({
      activeGate:
        publicationEvidence.priorityRecoveryObservation?.activeGate ||
        controlPlane?.activeGate ||
        null,
      activeGateProgress:
        publicationEvidence.priorityRecoveryObservation?.activeGateProgress ||
        controlPlane?.activeGateProgress ||
        null,
      activeGateAdmissionState:
        controlPlane?.activeGateAdmissionState || null,
    });
  const activeGateReportFields = activeGate ?
    derivePriorityRecoveryActiveGateReportFields(activeGate) :
    null;
  return {
    ...controlPlane,
    publicationConvergence:
      publicationEvidence.publicationConvergence ||
      controlPlane.publicationConvergence ||
      null,
    publicationConvergenceGate:
      publicationEvidence.publicationConvergenceGate ||
      controlPlane.publicationConvergenceGate ||
      null,
    priorityRecoveryObservation:
      publicationEvidence.priorityRecoveryObservation ||
      controlPlane.priorityRecoveryObservation ||
      null,
    ...(activeGate ? {activeGate} : {}),
    ...(activeGateReportFields || {}),
  };
}

export {
  buildCanonicalControlPlaneDiagnosticsFromControlPlane,
  buildCanonicalPublicationEvidenceFromControlPlane,
};
