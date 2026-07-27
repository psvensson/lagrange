import {createHash} from 'node:crypto';

const ZERO = 0;
const ONE = 1;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export const SCALE_EVIDENCE_CONTRACT_ID =
  'scale-certification-evidence-contract';
export const SCALE_EVIDENCE_SCHEMA_VERSION = 'scale-evidence-v1';

export const SCALE_PROFILE_ID = Object.freeze({
  DEVELOPMENT: 'P0',
  INTEGRATION: 'P1',
  PERIODIC_SCALE: 'P2',
  TARGET_SCALE: 'P3',
});

export const SCALE_EVIDENCE_FIDELITY = Object.freeze({
  DETERMINISTIC_GUARD: 'deterministic_guard',
  LIVE: 'live',
});

export const SCALE_CERTIFICATION_RECEIPT_STATE = Object.freeze({
  ABSENT: 'absent',
  ATTACHED: 'attached',
});

export const SCALE_GATE_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  NOT_MEASURED: 'not_measured',
});

export const SCALE_CLAIM_REASON = Object.freeze({
  DEVELOPMENT_PROFILE: 'development_profile_not_scale_certification',
  NON_LIVE_FIDELITY: 'live_fidelity_required',
  REQUIRED_GATE_NOT_PASSING: 'required_gate_not_passing',
  TERMINAL_CERTIFICATION_ABSENT: 'terminal_certification_absent',
  TERMINAL_CERTIFICATION_UNVERIFIED: 'terminal_certification_unverified',
});

const PROFILE_IDS = new Set(Object.values(SCALE_PROFILE_ID));
const FIDELITIES = new Set(Object.values(SCALE_EVIDENCE_FIDELITY));
const CERTIFICATION_RECEIPT_STATES =
  new Set(Object.values(SCALE_CERTIFICATION_RECEIPT_STATE));
const GATE_STATUSES = new Set(Object.values(SCALE_GATE_STATUS));
const REQUIRED_GATE_NAMES = Object.freeze([
  'feasibility',
  'safety',
  'performance',
  'resources',
  'convergence',
]);

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > ZERO;
}

export function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= ZERO;
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > ZERO;
}

export function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= ZERO;
}

export function isRatio(value) {
  return isNonNegativeNumber(value) && value <= ONE;
}

export function pushIf(errors, condition, code) {
  if (condition) errors.push(code);
}

export function validateDigest(errors, value, path) {
  pushIf(errors, !SHA256_PATTERN.test(String(value || '')),
    `${path}:sha256_required`);
}

function validateRunFields(report, errors) {
  const run = report.run;
  pushIf(errors, !isRecord(run), 'run:object_required');
  if (isRecord(run)) {
    pushIf(errors, !isNonEmptyText(run.id), 'run.id:required');
    pushIf(errors, !ISO_TIMESTAMP_PATTERN.test(String(run.startedAt || '')),
      'run.startedAt:iso_timestamp_required');
    pushIf(errors, !ISO_TIMESTAMP_PATTERN.test(String(run.completedAt || '')),
      'run.completedAt:iso_timestamp_required');
    pushIf(errors, !FIDELITIES.has(run.fidelity), 'run.fidelity:unsupported');
    pushIf(
      errors,
      ISO_TIMESTAMP_PATTERN.test(String(run.startedAt || '')) &&
        ISO_TIMESTAMP_PATTERN.test(String(run.completedAt || '')) &&
        Date.parse(run.completedAt) < Date.parse(run.startedAt),
      'run.completedAt:precedes_startedAt',
    );
  }
}

function validateWorkloadFields(report, errors) {
  const workload = report.workload;
  pushIf(errors, !isRecord(workload), 'workload:object_required');
  if (isRecord(workload)) {
    pushIf(errors, !isNonEmptyText(workload.id), 'workload.id:required');
    validateDigest(errors, workload.manifestDigest, 'workload.manifestDigest');
    pushIf(errors, !isRecord(workload.duration),
      'workload.duration:object_required');
    if (isRecord(workload.duration)) {
      pushIf(errors, !isNonNegativeInteger(workload.duration.warmupMs),
        'workload.duration.warmupMs:non_negative_integer_required');
      pushIf(errors, !isPositiveInteger(workload.duration.measuredMs),
        'workload.duration.measuredMs:positive_integer_required');
    }
  }
}

function validateIdentityFields(report, errors) {
  validateRunFields(report, errors);

  const software = report.software;
  pushIf(errors, !isRecord(software), 'software:object_required');
  if (isRecord(software)) {
    pushIf(errors, !isNonEmptyText(software.revision), 'software.revision:required');
    pushIf(errors, !isNonEmptyText(software.runtime), 'software.runtime:required');
    pushIf(errors, !isNonEmptyText(software.packageVersion),
      'software.packageVersion:required');
  }

  const hardware = report.hardware;
  pushIf(errors, !isRecord(hardware), 'hardware:object_required');
  if (isRecord(hardware)) {
    for (const field of ['provider', 'region', 'instanceClass', 'storageClass']) {
      pushIf(errors, !isNonEmptyText(hardware[field]),
        `hardware.${field}:required`);
    }
    pushIf(errors, !isPositiveInteger(hardware.cpuCount),
      'hardware.cpuCount:positive_integer_required');
    pushIf(errors, !isPositiveInteger(hardware.memoryBytes),
      'hardware.memoryBytes:positive_integer_required');
  }

  const topology = report.topology;
  pushIf(errors, !isRecord(topology), 'topology:object_required');
  if (isRecord(topology)) {
    for (const field of [
      'nodeCount',
      'failureDomainCount',
      'tableCount',
      'partitionCount',
      'replicaCount',
    ]) {
      pushIf(errors, !isPositiveInteger(topology[field]),
        `topology.${field}:positive_integer_required`);
    }
    validateDigest(errors, topology.manifestDigest, 'topology.manifestDigest');
  }

  const data = report.data;
  pushIf(errors, !isRecord(data), 'data:object_required');
  if (isRecord(data)) {
    pushIf(errors, !isNonNegativeInteger(data.logicalBytes),
      'data.logicalBytes:non_negative_integer_required');
    pushIf(errors, !isNonNegativeInteger(data.physicalBytes),
      'data.physicalBytes:non_negative_integer_required');
    validateDigest(errors, data.manifestDigest, 'data.manifestDigest');
    pushIf(errors, !isNonEmptyText(data.shape), 'data.shape:required');
  }

  validateWorkloadFields(report, errors);
}

function validateProvenance(report, errors) {
  const provenance = report.provenance;
  pushIf(errors, !isRecord(provenance), 'provenance:object_required');
  if (!isRecord(provenance)) return;
  for (const field of ['producer', 'invocation']) {
    pushIf(errors, !isNonEmptyText(provenance[field]),
      `provenance.${field}:required`);
  }
  validateDigest(
    errors,
    provenance.environmentDigest,
    'provenance.environmentDigest',
  );
  validateDigest(
    errors,
    provenance.artifactManifestDigest,
    'provenance.artifactManifestDigest',
  );
}

function validateFeasibilityGate(gates, errors) {
  if (isRecord(gates.feasibility)) {
    pushIf(errors, !Array.isArray(gates.feasibility.reasonCodes),
      'gates.feasibility.reasonCodes:array_required');
    pushIf(
      errors,
      gates.feasibility.status === SCALE_GATE_STATUS.PASS &&
        Array.isArray(gates.feasibility.reasonCodes) &&
        gates.feasibility.reasonCodes.length > ZERO,
      'gates.feasibility.reasonCodes:pass_requires_empty',
    );
  }
}

function validateSafetyGate(gates, errors) {
  if (isRecord(gates.safety)) {
    pushIf(errors, !isNonNegativeInteger(gates.safety.violationCount),
      'gates.safety.violationCount:non_negative_integer_required');
    pushIf(
      errors,
      gates.safety.status === SCALE_GATE_STATUS.PASS &&
        gates.safety.violationCount !== ZERO,
      'gates.safety.violationCount:pass_requires_zero',
    );
  }
}

function validatePerformanceGate(gates, errors) {
  if (isRecord(gates.performance)) {
    pushIf(errors, !isNonEmptyText(gates.performance.baselineId),
      'gates.performance.baselineId:required');
    pushIf(errors, !isNonNegativeInteger(gates.performance.offeredOperations),
      'gates.performance.offeredOperations:non_negative_integer_required');
    pushIf(errors, !isNonNegativeInteger(gates.performance.correctOperations),
      'gates.performance.correctOperations:non_negative_integer_required');
    pushIf(errors,
      isNonNegativeInteger(gates.performance.offeredOperations) &&
      isNonNegativeInteger(gates.performance.correctOperations) &&
      gates.performance.correctOperations > gates.performance.offeredOperations,
      'gates.performance.correctOperations:exceeds_offered');
    for (const field of ['p95LatencyMs', 'p99LatencyMs']) {
      pushIf(errors, !isNonNegativeNumber(gates.performance[field]),
        `gates.performance.${field}:non_negative_number_required`);
    }
    pushIf(errors, !isRatio(gates.performance.errorRate),
      'gates.performance.errorRate:ratio_required');
  }
}

function validateResourcesGate(gates, errors) {
  if (isRecord(gates.resources)) {
    for (const field of [
      'maxHeapBytes',
      'maxRssBytes',
      'maxFileDescriptors',
      'maxEventLoopLagMs',
      'maxQueueDepth',
      'maxInFlight',
      'retainedRaftBytes',
    ]) {
      pushIf(errors, !isNonNegativeNumber(gates.resources[field]),
        `gates.resources.${field}:non_negative_number_required`);
    }
    for (const field of ['retryRate', 'diskAmplification']) {
      pushIf(errors, !isNonNegativeNumber(gates.resources[field]),
        `gates.resources.${field}:non_negative_number_required`);
    }
  }
}

function validateConvergenceGate(gates, errors) {
  if (isRecord(gates.convergence)) {
    pushIf(errors, !isPositiveInteger(gates.convergence.sampleCount),
      'gates.convergence.sampleCount:positive_integer_required');
    pushIf(errors, !isRatio(gates.convergence.passRate),
      'gates.convergence.passRate:ratio_required');
    for (const field of ['p50Ms', 'p95Ms']) {
      pushIf(errors, !isNonNegativeNumber(gates.convergence[field]),
        `gates.convergence.${field}:non_negative_number_required`);
    }
    const interval = gates.convergence.confidenceInterval;
    pushIf(errors, !isRecord(interval),
      'gates.convergence.confidenceInterval:object_required');
    if (isRecord(interval)) {
      pushIf(errors, !isRatio(interval.lower),
        'gates.convergence.confidenceInterval.lower:ratio_required');
      pushIf(errors, !isRatio(interval.upper),
        'gates.convergence.confidenceInterval.upper:ratio_required');
      pushIf(errors, isRatio(interval.lower) && isRatio(interval.upper) &&
        interval.lower > interval.upper,
      'gates.convergence.confidenceInterval:reversed');
    }
  }
}

function validateGateEnvelope(report, errors) {
  const gates = report.gates;
  pushIf(errors, !isRecord(gates), 'gates:object_required');
  if (!isRecord(gates)) return;

  for (const name of REQUIRED_GATE_NAMES) {
    pushIf(errors, !isRecord(gates[name]), `gates.${name}:object_required`);
    if (isRecord(gates[name])) {
      pushIf(errors, !GATE_STATUSES.has(gates[name].status),
        `gates.${name}.status:unsupported`);
      validateDigest(
        errors,
        gates[name].evidenceArtifactDigest,
        `gates.${name}.evidenceArtifactDigest`,
      );
    }
  }

  validateFeasibilityGate(gates, errors);
  validateSafetyGate(gates, errors);
  validatePerformanceGate(gates, errors);
  validateResourcesGate(gates, errors);
  validateConvergenceGate(gates, errors);
}

function validateArtifacts(report, errors) {
  pushIf(errors, !Array.isArray(report.artifacts) ||
    report.artifacts.length === ZERO, 'artifacts:non_empty_array_required');
  if (!Array.isArray(report.artifacts)) return;
  report.artifacts.forEach((artifact, index) => {
    const prefix = `artifacts.${index}`;
    pushIf(errors, !isRecord(artifact), `${prefix}:object_required`);
    if (!isRecord(artifact)) return;
    pushIf(errors, !isNonEmptyText(artifact.kind), `${prefix}.kind:required`);
    pushIf(errors, !isNonEmptyText(artifact.path), `${prefix}.path:required`);
    validateDigest(errors, artifact.digest, `${prefix}.digest`);
  });

  const artifactDigests = new Set(
    report.artifacts
      .filter(isRecord)
      .map((artifact) => artifact.digest),
  );
  for (const name of REQUIRED_GATE_NAMES) {
    const evidenceDigest = report.gates?.[name]?.evidenceArtifactDigest;
    pushIf(
      errors,
      SHA256_PATTERN.test(String(evidenceDigest || '')) &&
        !artifactDigests.has(evidenceDigest),
      `gates.${name}.evidenceArtifactDigest:artifact_not_found`,
    );
  }
  if (isRecord(report.provenance)) {
    const expectedManifestDigest = computeScaleEvidenceDigest(
      report.artifacts.map((artifact) => ({
        kind: artifact?.kind,
        path: artifact?.path,
        digest: artifact?.digest,
      })),
    );
    pushIf(
      errors,
      report.provenance.artifactManifestDigest !== expectedManifestDigest,
      'provenance.artifactManifestDigest:mismatch',
    );
  }
}

function validateCertification(report, errors) {
  const certification = report.certification;
  pushIf(errors, !isRecord(certification), 'certification:object_required');
  if (!isRecord(certification)) return;
  pushIf(
    errors,
    !CERTIFICATION_RECEIPT_STATES.has(certification.receiptState),
    'certification.receiptState:unsupported',
  );
  if (certification.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT) {
    for (const field of [
      'questId',
      'terminalReceiptDigest',
      'profileIdentity',
      'evidenceIdentity',
    ]) {
      pushIf(
        errors,
        Object.hasOwn(certification, field),
        `certification.${field}:forbidden_when_absent`,
      );
    }
  }
  if (certification.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED) {
    pushIf(errors, !isNonEmptyText(certification.questId),
      'certification.questId:required_when_attached');
    validateDigest(
      errors,
      certification.terminalReceiptDigest,
      'certification.terminalReceiptDigest',
    );
    validateDigest(
      errors,
      certification.profileIdentity,
      'certification.profileIdentity',
    );
    validateDigest(
      errors,
      certification.evidenceIdentity,
      'certification.evidenceIdentity',
    );
    pushIf(
      errors,
      certification.profileIdentity !== report.profileIdentity,
      'certification.profileIdentity:mismatch',
    );
    pushIf(
      errors,
      certification.evidenceIdentity !==
        computeScaleCertificationEvidenceIdentity(report),
      'certification.evidenceIdentity:mismatch',
    );
    pushIf(
      errors,
      report.profile?.id === SCALE_PROFILE_ID.DEVELOPMENT,
      'certification.receiptState:p0_cannot_attach',
    );
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function computeScaleEvidenceDigest(value) {
  const bytes = JSON.stringify(canonicalize(value));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function profileIdentityPayload(report) {
  return {
    contractId: report.contractId,
    schemaVersion: report.schemaVersion,
    profile: report.profile,
    software: report.software,
    hardware: report.hardware,
    topology: report.topology,
    data: report.data,
    workload: report.workload,
  };
}

export function computeScaleProfileIdentity(report) {
  const bytes = JSON.stringify(canonicalize(profileIdentityPayload(report)));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function computeScaleRunIdentity(report) {
  const bytes = JSON.stringify(canonicalize({
    profileIdentity: report.profileIdentity,
    run: report.run,
    provenance: report.provenance,
  }));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function computeScaleCertificationEvidenceIdentity(report) {
  return computeScaleEvidenceDigest({
    contractId: report.contractId,
    schemaVersion: report.schemaVersion,
    profileIdentity: report.profileIdentity,
    run: report.run,
    provenance: report.provenance,
    gates: report.gates,
    artifacts: report.artifacts,
    extensions: report.extensions,
  });
}

export function computeScaleReportIdentity(report) {
  const {reportIdentity: _reportIdentity, ...reportPayload} = report;
  const bytes = JSON.stringify(canonicalize(reportPayload));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function requiredGatesPass(report) {
  return REQUIRED_GATE_NAMES.every(
    (name) => report.gates?.[name]?.status === SCALE_GATE_STATUS.PASS,
  );
}

function hasVerifiedTerminalReceipt(report, options) {
  if (report.certification?.receiptState !==
      SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED) {
    return false;
  }
  const verifiedReceipts = options?.verifiedTerminalReceipts;
  if (!(verifiedReceipts instanceof Map)) return false;
  const trustedReceipt = verifiedReceipts.get(
    report.certification.terminalReceiptDigest,
  );
  return isRecord(trustedReceipt) &&
    trustedReceipt.questId === report.certification.questId &&
    trustedReceipt.profileIdentity === report.profileIdentity &&
    trustedReceipt.evidenceIdentity ===
      computeScaleCertificationEvidenceIdentity(report);
}

function deriveScaleClaimEligibility(report, options = {}) {
  const reasonCodes = [];
  if (report.profile?.id === SCALE_PROFILE_ID.DEVELOPMENT) {
    reasonCodes.push(SCALE_CLAIM_REASON.DEVELOPMENT_PROFILE);
  }
  if (report.run?.fidelity !== SCALE_EVIDENCE_FIDELITY.LIVE) {
    reasonCodes.push(SCALE_CLAIM_REASON.NON_LIVE_FIDELITY);
  }
  if (!requiredGatesPass(report)) {
    reasonCodes.push(SCALE_CLAIM_REASON.REQUIRED_GATE_NOT_PASSING);
  }
  if (report.certification?.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT) {
    reasonCodes.push(SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_ABSENT);
  } else if (!hasVerifiedTerminalReceipt(report, options)) {
    reasonCodes.push(SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED);
  }
  return {
    profileEvidence: true,
    scaleCertification: reasonCodes.length === ZERO,
    reasonCodes,
  };
}

function validateBaseReport(report) {
  const errors = [];
  pushIf(errors, !isRecord(report), 'report:object_required');
  if (!isRecord(report)) return errors;
  pushIf(errors, report.contractId !== SCALE_EVIDENCE_CONTRACT_ID,
    'contractId:unsupported');
  pushIf(errors, report.schemaVersion !== SCALE_EVIDENCE_SCHEMA_VERSION,
    'schemaVersion:unsupported');
  pushIf(errors, !isRecord(report.profile), 'profile:object_required');
  if (isRecord(report.profile)) {
    pushIf(errors, !PROFILE_IDS.has(report.profile.id), 'profile.id:unsupported');
    pushIf(errors, !isPositiveInteger(report.profile.version),
      'profile.version:positive_integer_required');
  }
  validateIdentityFields(report, errors);
  validateGateEnvelope(report, errors);
  validateProvenance(report, errors);
  validateArtifacts(report, errors);
  validateCertification(report, errors);
  pushIf(errors, !isRecord(report.extensions), 'extensions:object_required');
  return errors;
}

export function validateScaleEvidenceReport(report, options = {}) {
  const errors = validateBaseReport(report);
  if (errors.length === ZERO) {
    const expectedIdentity = computeScaleProfileIdentity(report);
    pushIf(errors, report.profileIdentity !== expectedIdentity,
      'profileIdentity:mismatch');
    const expectedRunIdentity = computeScaleRunIdentity(report);
    pushIf(errors, report.runIdentity !== expectedRunIdentity,
      'runIdentity:mismatch');
    const expectedEligibility = deriveScaleClaimEligibility(report, options);
    pushIf(
      errors,
      JSON.stringify(report.claimEligibility) !==
        JSON.stringify(expectedEligibility),
      'claimEligibility:mismatch',
    );
    const expectedReportIdentity = computeScaleReportIdentity(report);
    pushIf(errors, report.reportIdentity !== expectedReportIdentity,
      'reportIdentity:mismatch');
  }
  return {
    valid: errors.length === ZERO,
    errors,
    profileIdentity: errors.length === ZERO ? report.profileIdentity : null,
  };
}

export function createScaleEvidenceReport(input, options = {}) {
  const report = {
    ...structuredClone(input),
    contractId: SCALE_EVIDENCE_CONTRACT_ID,
    schemaVersion: SCALE_EVIDENCE_SCHEMA_VERSION,
  };
  report.profileIdentity = computeScaleProfileIdentity(report);
  const baseErrors = validateBaseReport(report);
  if (baseErrors.length > ZERO) {
    throw new TypeError(`invalid scale evidence: ${baseErrors.join(', ')}`);
  }
  report.runIdentity = computeScaleRunIdentity(report);
  report.claimEligibility = deriveScaleClaimEligibility(report, options);
  report.reportIdentity = computeScaleReportIdentity(report);
  const result = validateScaleEvidenceReport(report, options);
  if (!result.valid) {
    throw new TypeError(`invalid scale evidence: ${result.errors.join(', ')}`);
  }
  return report;
}
