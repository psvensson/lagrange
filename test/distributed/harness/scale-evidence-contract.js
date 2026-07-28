import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {
  SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON,
  SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
  SCALE_CERTIFICATION_RECEIPT_DECISION_STATE,
  SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
  computeScaleCertificationReceiptDigest,
  isScaleSha256Digest,
  validateScaleCertificationReceipt,
} from './scale-certification-receipt-freshness.js';

const localText = Object.freeze({
  REASON_SEPARATOR: ', ',
  ABSENT: 'absent',
  ACCEPTED: 'accepted',
  ARTIFACTS: 'artifacts',
  ARTIFACTS_NON_EMPTY_ARRAY_REQUIRED: 'artifacts:non_empty_array_required',
  ATTACHED: 'attached',
  CANONICALIZATION_NUMBER_NOT_CANONICAL: 'canonicalization:number_not_canonical',
  CANONICALIZATION_PROXY_FORBIDDEN: 'canonicalization:proxy_forbidden',
  CERTIFICATION: 'certification',
  CERTIFICATION_OBJECT_REQUIRED: 'certification:object_required',
  CERTIFICATION_EVIDENCEIDENTITY: 'certification.evidenceIdentity',
  CERTIFICATION_EVIDENCEIDENTITY_MISMATCH: 'certification.evidenceIdentity:mismatch',
  CERTIFICATION_EVIDENCEIDENTITY_UNREADABLE: 'certification.evidenceIdentity:unreadable',
  CERTIFICATION_PROFILEIDENTITY: 'certification.profileIdentity',
  CERTIFICATION_PROFILEIDENTITY_MISMATCH: 'certification.profileIdentity:mismatch',
  CERTIFICATION_QUESTID_REQUIRED_WHEN_ATTACHED: 'certification.questId:required_when_attached',
  CERTIFICATION_RECEIPTSTATE_ATTACHED_REQUIRED: 'certification.receiptState:attached_required',
  CERTIFICATION_RECEIPTSTATE_P0_CANNOT_ATTACH: 'certification.receiptState:p0_cannot_attach',
  CERTIFICATION_RECEIPTSTATE_UNSUPPORTED: 'certification.receiptState:unsupported',
  CERTIFICATION_TERMINALRECEIPTDIGEST: 'certification.terminalReceiptDigest',
  CERTIFICATION_TERMINALRECEIPTDIGEST_UNRESOLVED: 'certification.terminalReceiptDigest:unresolved',
  CLAIMELIGIBILITY_MISMATCH: 'claimEligibility:mismatch',
  CONTRACTID: 'contractId',
  CONTRACTID_UNSUPPORTED: 'contractId:unsupported',
  DATA: 'data',
  DATA_OBJECT_REQUIRED: 'data:object_required',
  DATA_LOGICALBYTES_NON_NEGATIVE_INTEGER_REQUIRED: 'data.logicalBytes:non_negative_integer_required',
  DATA_MANIFESTDIGEST: 'data.manifestDigest',
  DATA_PHYSICALBYTES_NON_NEGATIVE_INTEGER_REQUIRED: 'data.physicalBytes:non_negative_integer_required',
  DATA_SHAPE_REQUIRED: 'data.shape:required',
  DETERMINISTIC_GUARD: 'deterministic_guard',
  DEVELOPMENT_PROFILE_NOT_SCALE_CERTIFICATION: 'development_profile_not_scale_certification',
  EXTENSIONS: 'extensions',
  EXTENSIONS_OBJECT_REQUIRED: 'extensions:object_required',
  FAIL: 'fail',
  FIDELITY: 'fidelity',
  GATES: 'gates',
  GATES_OBJECT_REQUIRED: 'gates:object_required',
  GATES_CONVERGENCE_CONFIDENCEINTERVAL_OBJECT_REQUIRED: 'gates.convergence.confidenceInterval:object_required',
  GATES_CONVERGENCE_CONFIDENCEINTERVAL_REVERSED: 'gates.convergence.confidenceInterval:reversed',
  GATES_CONVERGENCE_CONFIDENCEINTERVAL_LOWER_RATIO_REQUIRED: 'gates.convergence.confidenceInterval.lower:ratio_required',
  GATES_CONVERGENCE_CONFIDENCEINTERVAL_UPPER_RATIO_REQUIRED: 'gates.convergence.confidenceInterval.upper:ratio_required',
  GATES_CONVERGENCE_PASSRATE_RATIO_REQUIRED: 'gates.convergence.passRate:ratio_required',
  GATES_CONVERGENCE_SAMPLECOUNT_POSITIVE_INTEGER_REQUIRED: 'gates.convergence.sampleCount:positive_integer_required',
  GATES_FEASIBILITY_REASONCODES_ARRAY_REQUIRED: 'gates.feasibility.reasonCodes:array_required',
  GATES_FEASIBILITY_REASONCODES_PASS_REQUIRES_EMPTY: 'gates.feasibility.reasonCodes:pass_requires_empty',
  GATES_PERFORMANCE_BASELINEID_REQUIRED: 'gates.performance.baselineId:required',
  GATES_PERFORMANCE_CORRECTOPERATIONS_EXCEEDS_OFFERED: 'gates.performance.correctOperations:exceeds_offered',
  GATES_PERFORMANCE_CORRECTOPERATIONS_NON_NEGATIVE_INTEGER_REQUIRED: 'gates.performance.correctOperations:non_negative_integer_required',
  GATES_PERFORMANCE_ERRORRATE_RATIO_REQUIRED: 'gates.performance.errorRate:ratio_required',
  GATES_PERFORMANCE_OFFEREDOPERATIONS_NON_NEGATIVE_INTEGER_REQUIRED: 'gates.performance.offeredOperations:non_negative_integer_required',
  GATES_SAFETY_VIOLATIONCOUNT_NON_NEGATIVE_INTEGER_REQUIRED: 'gates.safety.violationCount:non_negative_integer_required',
  GATES_SAFETY_VIOLATIONCOUNT_PASS_REQUIRES_ZERO: 'gates.safety.violationCount:pass_requires_zero',
  HARDWARE: 'hardware',
  HARDWARE_OBJECT_REQUIRED: 'hardware:object_required',
  HARDWARE_CPUCOUNT_POSITIVE_INTEGER_REQUIRED: 'hardware.cpuCount:positive_integer_required',
  HARDWARE_MEMORYBYTES_POSITIVE_INTEGER_REQUIRED: 'hardware.memoryBytes:positive_integer_required',
  HEX: 'hex',
  ID: 'id',
  LIVE: 'live',
  LIVE_FIDELITY_REQUIRED: 'live_fidelity_required',
  NOT_MEASURED: 'not_measured',
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  PASS: 'pass',
  PROFILE: 'profile',
  PROFILE_OBJECT_REQUIRED: 'profile:object_required',
  PROFILE_ID_UNSUPPORTED: 'profile.id:unsupported',
  PROFILE_VERSION_POSITIVE_INTEGER_REQUIRED: 'profile.version:positive_integer_required',
  PROFILEIDENTITY: 'profileIdentity',
  PROFILEIDENTITY_MISMATCH: 'profileIdentity:mismatch',
  PROVENANCE: 'provenance',
  PROVENANCE_OBJECT_REQUIRED: 'provenance:object_required',
  PROVENANCE_ARTIFACTMANIFESTDIGEST: 'provenance.artifactManifestDigest',
  PROVENANCE_ARTIFACTMANIFESTDIGEST_MISMATCH: 'provenance.artifactManifestDigest:mismatch',
  PROVENANCE_ENVIRONMENTDIGEST: 'provenance.environmentDigest',
  RECEIPT_UNREADABLE: 'receipt:unreadable',
  RECEIPTSTATE: 'receiptState',
  REJECTED: 'rejected',
  REPORT_CANONICAL_DATA_REQUIRED: 'report:canonical_data_required',
  REPORT_OBJECT_REQUIRED: 'report:object_required',
  REPORT_PLAIN_DATA_OBJECT_REQUIRED: 'report:plain_data_object_required',
  REPORT_UNREADABLE: 'report:unreadable',
  REPORT_ARTIFACTS: 'report.artifacts',
  REPORT_CERTIFICATION: 'report.certification',
  REPORT_CERTIFICATION_RECEIPTSTATE: 'report.certification.receiptState',
  REPORT_CONTRACTID: 'report.contractId',
  REPORT_DATA: 'report.data',
  REPORT_EXTENSIONS: 'report.extensions',
  REPORT_GATES: 'report.gates',
  REPORT_HARDWARE: 'report.hardware',
  REPORT_PROFILE: 'report.profile',
  REPORT_PROFILE_ID: 'report.profile.id',
  REPORT_PROFILEIDENTITY: 'report.profileIdentity',
  REPORT_PROFILEIDENTITY_MISMATCH: 'report.profileIdentity:mismatch',
  REPORT_PROFILEIDENTITY_UNREADABLE: 'report.profileIdentity:unreadable',
  REPORT_PROVENANCE: 'report.provenance',
  REPORT_RUN: 'report.run',
  REPORT_RUN_FIDELITY: 'report.run.fidelity',
  REPORT_SCHEMAVERSION: 'report.schemaVersion',
  REPORT_SOFTWARE: 'report.software',
  REPORT_TOPOLOGY: 'report.topology',
  REPORT_WORKLOAD: 'report.workload',
  REPORTIDENTITY: 'reportIdentity',
  REPORTIDENTITY_MISMATCH: 'reportIdentity:mismatch',
  REQUIRED_GATE_NOT_PASSING: 'required_gate_not_passing',
  RUN: 'run',
  RUN_OBJECT_REQUIRED: 'run:object_required',
  RUN_COMPLETEDAT_ISO_TIMESTAMP_REQUIRED: 'run.completedAt:iso_timestamp_required',
  RUN_COMPLETEDAT_PRECEDES_STARTEDAT: 'run.completedAt:precedes_startedAt',
  RUN_FIDELITY_UNSUPPORTED: 'run.fidelity:unsupported',
  RUN_ID_REQUIRED: 'run.id:required',
  RUN_STARTEDAT_ISO_TIMESTAMP_REQUIRED: 'run.startedAt:iso_timestamp_required',
  RUNIDENTITY_MISMATCH: 'runIdentity:mismatch',
  SCALE_CERTIFICATION_EVIDENCE_CONTRACT: 'scale-certification-evidence-contract',
  SCALE_EVIDENCE_V1: 'scale-evidence-v1',
  SCHEMAVERSION: 'schemaVersion',
  SCHEMAVERSION_UNSUPPORTED: 'schemaVersion:unsupported',
  SHA256: 'sha256',
  SOFTWARE: 'software',
  SOFTWARE_OBJECT_REQUIRED: 'software:object_required',
  SOFTWARE_PACKAGEVERSION_REQUIRED: 'software.packageVersion:required',
  SOFTWARE_REVISION_REQUIRED: 'software.revision:required',
  SOFTWARE_RUNTIME_REQUIRED: 'software.runtime:required',
  TERMINAL_CERTIFICATION_ABSENT: 'terminal_certification_absent',
  TERMINAL_CERTIFICATION_UNVERIFIED: 'terminal_certification_unverified',
  TOPOLOGY: 'topology',
  TOPOLOGY_OBJECT_REQUIRED: 'topology:object_required',
  TOPOLOGY_MANIFESTDIGEST: 'topology.manifestDigest',
  UNRESOLVED: 'unresolved',
  VERIFIEDTERMINALRECEIPTS_MAP_REQUIRED: 'verifiedTerminalReceipts:map_required',
  WORKLOAD: 'workload',
  WORKLOAD_OBJECT_REQUIRED: 'workload:object_required',
  WORKLOAD_DURATION_OBJECT_REQUIRED: 'workload.duration:object_required',
  WORKLOAD_DURATION_MEASUREDMS_POSITIVE_INTEGER_REQUIRED: 'workload.duration.measuredMs:positive_integer_required',
  WORKLOAD_DURATION_WARMUPMS_NON_NEGATIVE_INTEGER_REQUIRED: 'workload.duration.warmupMs:non_negative_integer_required',
  WORKLOAD_ID_REQUIRED: 'workload.id:required',
  WORKLOAD_MANIFESTDIGEST: 'workload.manifestDigest',
});

export {
  SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
  SCALE_CERTIFICATION_RECEIPT_DECISION_STATE,
  SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
  computeScaleCertificationReceiptDigest,
  validateScaleCertificationReceipt,
};

const ZERO = 0;
const ONE = 1;
const ArrayConstructor = Array;
const SetConstructor = Set;
const DateConstructor = Date;
const arrayIsArray = Array.isArray;
const arrayJoinMethod = Array.prototype.join;
const arraySortMethod = Array.prototype.sort;
const dateParse = Date.parse;
const isProxy = types.isProxy;
const jsonStringify = JSON.stringify;
const mapGetMethod = Map.prototype.get;
const mapHasMethod = Map.prototype.has;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const numberMaximumSafeInteger = Number.MAX_SAFE_INTEGER;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const objectSetPrototypeOf = Object.setPrototypeOf;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const regexpExecMethod = RegExp.prototype.exec;
const setAddMethod = Set.prototype.add;
const setHasMethod = Set.prototype.has;
const stringTrimMethod = String.prototype.trim;
const structuredCloneValue = structuredClone;
const canonicalObjectPrototype = Object.prototype;
const DATA_DESCRIPTOR_VALUE = 'value';
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export const SCALE_EVIDENCE_CONTRACT_ID =
  localText.SCALE_CERTIFICATION_EVIDENCE_CONTRACT;
export const SCALE_EVIDENCE_SCHEMA_VERSION = localText.SCALE_EVIDENCE_V1;

export const SCALE_PROFILE_ID = Object.freeze({
  DEVELOPMENT: localText.P0,
  INTEGRATION: localText.P1,
  PERIODIC_SCALE: localText.P2,
  TARGET_SCALE: localText.P3,
});

export const SCALE_EVIDENCE_FIDELITY = Object.freeze({
  DETERMINISTIC_GUARD: localText.DETERMINISTIC_GUARD,
  LIVE: localText.LIVE,
});

export const SCALE_CERTIFICATION_RECEIPT_STATE = Object.freeze({
  ABSENT: localText.ABSENT,
  ATTACHED: localText.ATTACHED,
});

export const SCALE_GATE_STATUS = Object.freeze({
  PASS: localText.PASS,
  FAIL: localText.FAIL,
  NOT_MEASURED: localText.NOT_MEASURED,
});

export const SCALE_CLAIM_REASON = Object.freeze({
  DEVELOPMENT_PROFILE: localText.DEVELOPMENT_PROFILE_NOT_SCALE_CERTIFICATION,
  NON_LIVE_FIDELITY: localText.LIVE_FIDELITY_REQUIRED,
  REQUIRED_GATE_NOT_PASSING: localText.REQUIRED_GATE_NOT_PASSING,
  TERMINAL_CERTIFICATION_ABSENT: localText.TERMINAL_CERTIFICATION_ABSENT,
  TERMINAL_CERTIFICATION_UNVERIFIED: localText.TERMINAL_CERTIFICATION_UNVERIFIED,
  TERMINAL_CERTIFICATION_RECEIPT_INVALID:
    SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.RECEIPT_INVALID,
  TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED:
    SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.EVALUATION_TIME_REQUIRED,
  TERMINAL_CERTIFICATION_NOT_YET_VALID:
    SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.NOT_YET_VALID,
  TERMINAL_CERTIFICATION_EXPIRED:
    SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.EXPIRED,
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
const SCALE_CLAIM_ELIGIBILITY_FIELDS = Object.freeze([
  'profileEvidence',
  'scaleCertification',
  'reasonCodes',
]);

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !arrayIsArray(value);
}

export function isNonEmptyText(value) {
  return typeof value === 'string' &&
    reflectApply(stringTrimMethod, value, []).length > ZERO;
}

export function isNonNegativeNumber(value) {
  return typeof value === 'number' &&
    numberIsFinite(value) &&
    !objectIs(value, -ZERO) &&
    value >= ZERO &&
    value <= numberMaximumSafeInteger;
}

export function isPositiveInteger(value) {
  return numberIsInteger(value) &&
    isNonNegativeNumber(value) &&
    value > ZERO;
}

export function isNonNegativeInteger(value) {
  return numberIsInteger(value) && isNonNegativeNumber(value);
}

export function isRatio(value) {
  return isNonNegativeNumber(value) && value <= ONE;
}

export function pushIf(errors, condition, code) {
  if (condition) appendOwnArrayValue(errors, code);
}

export function validateDigest(errors, value, path) {
  pushIf(errors, !isScaleSha256Digest(value),
    `${path}:sha256_required`);
}

function matchesPattern(pattern, value) {
  return reflectApply(regexpExecMethod, pattern, [value]) !== null;
}

function intrinsicSetHas(values, value) {
  try {
    return reflectApply(setHasMethod, values, [value]);
  } catch {
    return false;
  }
}

function intrinsicSetAdd(values, value) {
  reflectApply(setAddMethod, values, [value]);
}

function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function validateRunFields(report, errors) {
  const run = report.run;
  pushIf(errors, !isRecord(run), localText.RUN_OBJECT_REQUIRED);
  if (isRecord(run)) {
    pushIf(errors, !isNonEmptyText(run.id), localText.RUN_ID_REQUIRED);
    const startedAtValid = typeof run.startedAt === 'string' &&
      matchesPattern(ISO_TIMESTAMP_PATTERN, run.startedAt);
    const completedAtValid = typeof run.completedAt === 'string' &&
      matchesPattern(ISO_TIMESTAMP_PATTERN, run.completedAt);
    pushIf(errors, !startedAtValid,
      localText.RUN_STARTEDAT_ISO_TIMESTAMP_REQUIRED);
    pushIf(errors, !completedAtValid,
      localText.RUN_COMPLETEDAT_ISO_TIMESTAMP_REQUIRED);
    pushIf(
      errors,
      !intrinsicSetHas(FIDELITIES, run.fidelity),
      localText.RUN_FIDELITY_UNSUPPORTED,
    );
    pushIf(
      errors,
      startedAtValid &&
        completedAtValid &&
        reflectApply(dateParse, DateConstructor, [run.completedAt]) <
          reflectApply(dateParse, DateConstructor, [run.startedAt]),
      localText.RUN_COMPLETEDAT_PRECEDES_STARTEDAT,
    );
  }
}

function validateWorkloadFields(report, errors) {
  const workload = report.workload;
  pushIf(errors, !isRecord(workload), localText.WORKLOAD_OBJECT_REQUIRED);
  if (isRecord(workload)) {
    pushIf(errors, !isNonEmptyText(workload.id), localText.WORKLOAD_ID_REQUIRED);
    validateDigest(errors, workload.manifestDigest, localText.WORKLOAD_MANIFESTDIGEST);
    pushIf(errors, !isRecord(workload.duration),
      localText.WORKLOAD_DURATION_OBJECT_REQUIRED);
    if (isRecord(workload.duration)) {
      pushIf(errors, !isNonNegativeInteger(workload.duration.warmupMs),
        localText.WORKLOAD_DURATION_WARMUPMS_NON_NEGATIVE_INTEGER_REQUIRED);
      pushIf(errors, !isPositiveInteger(workload.duration.measuredMs),
        localText.WORKLOAD_DURATION_MEASUREDMS_POSITIVE_INTEGER_REQUIRED);
    }
  }
}

function validateIdentityFields(report, errors) {
  validateRunFields(report, errors);

  const software = report.software;
  pushIf(errors, !isRecord(software), localText.SOFTWARE_OBJECT_REQUIRED);
  if (isRecord(software)) {
    pushIf(errors, !isNonEmptyText(software.revision), localText.SOFTWARE_REVISION_REQUIRED);
    pushIf(errors, !isNonEmptyText(software.runtime), localText.SOFTWARE_RUNTIME_REQUIRED);
    pushIf(errors, !isNonEmptyText(software.packageVersion),
      localText.SOFTWARE_PACKAGEVERSION_REQUIRED);
  }

  const hardware = report.hardware;
  pushIf(errors, !isRecord(hardware), localText.HARDWARE_OBJECT_REQUIRED);
  if (isRecord(hardware)) {
    const hardwareTextFields = [
      'provider',
      'region',
      'instanceClass',
      'storageClass',
    ];
    for (
      let fieldIndex = ZERO;
      fieldIndex < hardwareTextFields.length;
      fieldIndex += ONE
    ) {
      const field = hardwareTextFields[fieldIndex];
      pushIf(errors, !isNonEmptyText(hardware[field]),
        `hardware.${field}:required`);
    }
    pushIf(errors, !isPositiveInteger(hardware.cpuCount),
      localText.HARDWARE_CPUCOUNT_POSITIVE_INTEGER_REQUIRED);
    pushIf(errors, !isPositiveInteger(hardware.memoryBytes),
      localText.HARDWARE_MEMORYBYTES_POSITIVE_INTEGER_REQUIRED);
  }

  const topology = report.topology;
  pushIf(errors, !isRecord(topology), localText.TOPOLOGY_OBJECT_REQUIRED);
  if (isRecord(topology)) {
    const topologyCountFields = [
      'nodeCount',
      'failureDomainCount',
      'tableCount',
      'partitionCount',
      'replicaCount',
    ];
    for (
      let fieldIndex = ZERO;
      fieldIndex < topologyCountFields.length;
      fieldIndex += ONE
    ) {
      const field = topologyCountFields[fieldIndex];
      pushIf(errors, !isPositiveInteger(topology[field]),
        `topology.${field}:positive_integer_required`);
    }
    validateDigest(errors, topology.manifestDigest, localText.TOPOLOGY_MANIFESTDIGEST);
  }

  const data = report.data;
  pushIf(errors, !isRecord(data), localText.DATA_OBJECT_REQUIRED);
  if (isRecord(data)) {
    pushIf(errors, !isNonNegativeInteger(data.logicalBytes),
      localText.DATA_LOGICALBYTES_NON_NEGATIVE_INTEGER_REQUIRED);
    pushIf(errors, !isNonNegativeInteger(data.physicalBytes),
      localText.DATA_PHYSICALBYTES_NON_NEGATIVE_INTEGER_REQUIRED);
    validateDigest(errors, data.manifestDigest, localText.DATA_MANIFESTDIGEST);
    pushIf(errors, !isNonEmptyText(data.shape), localText.DATA_SHAPE_REQUIRED);
  }

  validateWorkloadFields(report, errors);
}

function validateProvenance(report, errors) {
  const provenance = report.provenance;
  pushIf(errors, !isRecord(provenance), localText.PROVENANCE_OBJECT_REQUIRED);
  if (!isRecord(provenance)) return;
  const provenanceTextFields = ['producer', 'invocation'];
  for (
    let fieldIndex = ZERO;
    fieldIndex < provenanceTextFields.length;
    fieldIndex += ONE
  ) {
    const field = provenanceTextFields[fieldIndex];
    pushIf(errors, !isNonEmptyText(provenance[field]),
      `provenance.${field}:required`);
  }
  validateDigest(
    errors,
    provenance.environmentDigest,
    localText.PROVENANCE_ENVIRONMENTDIGEST,
  );
  validateDigest(
    errors,
    provenance.artifactManifestDigest,
    localText.PROVENANCE_ARTIFACTMANIFESTDIGEST,
  );
}

function validateFeasibilityGate(gates, errors) {
  if (isRecord(gates.feasibility)) {
    pushIf(errors, !arrayIsArray(gates.feasibility.reasonCodes),
      localText.GATES_FEASIBILITY_REASONCODES_ARRAY_REQUIRED);
    pushIf(
      errors,
      gates.feasibility.status === SCALE_GATE_STATUS.PASS &&
        arrayIsArray(gates.feasibility.reasonCodes) &&
        gates.feasibility.reasonCodes.length > ZERO,
      localText.GATES_FEASIBILITY_REASONCODES_PASS_REQUIRES_EMPTY,
    );
  }
}

function validateSafetyGate(gates, errors) {
  if (isRecord(gates.safety)) {
    pushIf(errors, !isNonNegativeInteger(gates.safety.violationCount),
      localText.GATES_SAFETY_VIOLATIONCOUNT_NON_NEGATIVE_INTEGER_REQUIRED);
    pushIf(
      errors,
      gates.safety.status === SCALE_GATE_STATUS.PASS &&
        gates.safety.violationCount !== ZERO,
      localText.GATES_SAFETY_VIOLATIONCOUNT_PASS_REQUIRES_ZERO,
    );
  }
}

function validatePerformanceGate(gates, errors) {
  if (isRecord(gates.performance)) {
    pushIf(errors, !isNonEmptyText(gates.performance.baselineId),
      localText.GATES_PERFORMANCE_BASELINEID_REQUIRED);
    pushIf(errors, !isNonNegativeInteger(gates.performance.offeredOperations),
      localText.GATES_PERFORMANCE_OFFEREDOPERATIONS_NON_NEGATIVE_INTEGER_REQUIRED);
    pushIf(errors, !isNonNegativeInteger(gates.performance.correctOperations),
      localText.GATES_PERFORMANCE_CORRECTOPERATIONS_NON_NEGATIVE_INTEGER_REQUIRED);
    pushIf(errors,
      isNonNegativeInteger(gates.performance.offeredOperations) &&
      isNonNegativeInteger(gates.performance.correctOperations) &&
      gates.performance.correctOperations > gates.performance.offeredOperations,
      localText.GATES_PERFORMANCE_CORRECTOPERATIONS_EXCEEDS_OFFERED);
    const latencyFields = ['p95LatencyMs', 'p99LatencyMs'];
    for (
      let fieldIndex = ZERO;
      fieldIndex < latencyFields.length;
      fieldIndex += ONE
    ) {
      const field = latencyFields[fieldIndex];
      pushIf(errors, !isNonNegativeNumber(gates.performance[field]),
        `gates.performance.${field}:non_negative_number_required`);
    }
    pushIf(errors, !isRatio(gates.performance.errorRate),
      localText.GATES_PERFORMANCE_ERRORRATE_RATIO_REQUIRED);
  }
}

function validateResourcesGate(gates, errors) {
  if (isRecord(gates.resources)) {
    const resourceFields = [
      'maxHeapBytes',
      'maxRssBytes',
      'maxFileDescriptors',
      'maxEventLoopLagMs',
      'maxQueueDepth',
      'maxInFlight',
      'retainedRaftBytes',
    ];
    for (
      let fieldIndex = ZERO;
      fieldIndex < resourceFields.length;
      fieldIndex += ONE
    ) {
      const field = resourceFields[fieldIndex];
      pushIf(errors, !isNonNegativeNumber(gates.resources[field]),
        `gates.resources.${field}:non_negative_number_required`);
    }
    const rateFields = ['retryRate', 'diskAmplification'];
    for (
      let fieldIndex = ZERO;
      fieldIndex < rateFields.length;
      fieldIndex += ONE
    ) {
      const field = rateFields[fieldIndex];
      pushIf(errors, !isNonNegativeNumber(gates.resources[field]),
        `gates.resources.${field}:non_negative_number_required`);
    }
  }
}

function validateConvergenceGate(gates, errors) {
  if (isRecord(gates.convergence)) {
    pushIf(errors, !isPositiveInteger(gates.convergence.sampleCount),
      localText.GATES_CONVERGENCE_SAMPLECOUNT_POSITIVE_INTEGER_REQUIRED);
    pushIf(errors, !isRatio(gates.convergence.passRate),
      localText.GATES_CONVERGENCE_PASSRATE_RATIO_REQUIRED);
    const convergenceLatencyFields = ['p50Ms', 'p95Ms'];
    for (
      let fieldIndex = ZERO;
      fieldIndex < convergenceLatencyFields.length;
      fieldIndex += ONE
    ) {
      const field = convergenceLatencyFields[fieldIndex];
      pushIf(errors, !isNonNegativeNumber(gates.convergence[field]),
        `gates.convergence.${field}:non_negative_number_required`);
    }
    const interval = gates.convergence.confidenceInterval;
    pushIf(errors, !isRecord(interval),
      localText.GATES_CONVERGENCE_CONFIDENCEINTERVAL_OBJECT_REQUIRED);
    if (isRecord(interval)) {
      pushIf(errors, !isRatio(interval.lower),
        localText.GATES_CONVERGENCE_CONFIDENCEINTERVAL_LOWER_RATIO_REQUIRED);
      pushIf(errors, !isRatio(interval.upper),
        localText.GATES_CONVERGENCE_CONFIDENCEINTERVAL_UPPER_RATIO_REQUIRED);
      pushIf(errors, isRatio(interval.lower) && isRatio(interval.upper) &&
        interval.lower > interval.upper,
      localText.GATES_CONVERGENCE_CONFIDENCEINTERVAL_REVERSED);
    }
  }
}

function validateGateEnvelope(report, errors) {
  const gates = report.gates;
  pushIf(errors, !isRecord(gates), localText.GATES_OBJECT_REQUIRED);
  if (!isRecord(gates)) return;

  for (
    let gateIndex = ZERO;
    gateIndex < REQUIRED_GATE_NAMES.length;
    gateIndex += ONE
  ) {
    const name = REQUIRED_GATE_NAMES[gateIndex];
    pushIf(errors, !isRecord(gates[name]), `gates.${name}:object_required`);
    if (isRecord(gates[name])) {
      pushIf(errors, !intrinsicSetHas(GATE_STATUSES, gates[name].status),
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

function validateArtifactItems(artifacts, errors) {
  for (
    let artifactIndex = ZERO;
    artifactIndex < artifacts.length;
    artifactIndex += ONE
  ) {
    const artifact = artifacts[artifactIndex];
    const index = artifactIndex;
    const prefix = `artifacts.${index}`;
    pushIf(errors, !isRecord(artifact), `${prefix}:object_required`);
    if (isRecord(artifact)) {
      pushIf(errors, !isNonEmptyText(artifact.kind), `${prefix}.kind:required`);
      pushIf(errors, !isNonEmptyText(artifact.path), `${prefix}.path:required`);
      validateDigest(errors, artifact.digest, `${prefix}.digest`);
    }
  }
}

function collectArtifactDigests(artifacts) {
  const artifactDigests = new SetConstructor();
  for (
    let artifactIndex = ZERO;
    artifactIndex < artifacts.length;
    artifactIndex += ONE
  ) {
    const artifact = artifacts[artifactIndex];
    if (isRecord(artifact)) intrinsicSetAdd(artifactDigests, artifact.digest);
  }
  return artifactDigests;
}

function validateGateArtifactReferences(report, artifactDigests, errors) {
  for (
    let gateIndex = ZERO;
    gateIndex < REQUIRED_GATE_NAMES.length;
    gateIndex += ONE
  ) {
    const name = REQUIRED_GATE_NAMES[gateIndex];
    const evidenceDigest = report.gates?.[name]?.evidenceArtifactDigest;
    pushIf(
      errors,
      isScaleSha256Digest(evidenceDigest) &&
        !intrinsicSetHas(artifactDigests, evidenceDigest),
      `gates.${name}.evidenceArtifactDigest:artifact_not_found`,
    );
  }
}

function createArtifactManifest(artifacts) {
  const artifactManifest = [];
  for (
    let artifactIndex = ZERO;
    artifactIndex < artifacts.length;
    artifactIndex += ONE
  ) {
    const artifact = artifacts[artifactIndex];
    appendOwnArrayValue(artifactManifest, {
      kind: artifact?.kind,
      path: artifact?.path,
      digest: artifact?.digest,
    });
  }
  return artifactManifest;
}

function validateArtifactManifest(report, errors) {
  if (!isRecord(report.provenance)) return;
  const artifactManifest = createArtifactManifest(report.artifacts);
  const expectedManifestDigest = computeScaleEvidenceDigest(artifactManifest);
  pushIf(
    errors,
    report.provenance.artifactManifestDigest !== expectedManifestDigest,
    localText.PROVENANCE_ARTIFACTMANIFESTDIGEST_MISMATCH,
  );
}

function validateArtifacts(report, errors) {
  const artifacts = report.artifacts;
  pushIf(errors, !arrayIsArray(artifacts) ||
    artifacts.length === ZERO, localText.ARTIFACTS_NON_EMPTY_ARRAY_REQUIRED);
  if (!arrayIsArray(artifacts)) return;
  validateArtifactItems(artifacts, errors);
  const artifactDigests = collectArtifactDigests(artifacts);
  validateGateArtifactReferences(report, artifactDigests, errors);
  validateArtifactManifest(report, errors);
}

function validateCertification(report, errors) {
  const certification = report.certification;
  pushIf(errors, !isRecord(certification), localText.CERTIFICATION_OBJECT_REQUIRED);
  if (!isRecord(certification)) return;
  pushIf(
    errors,
    !intrinsicSetHas(
      CERTIFICATION_RECEIPT_STATES,
      certification.receiptState,
    ),
    localText.CERTIFICATION_RECEIPTSTATE_UNSUPPORTED,
  );
  if (certification.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT) {
    const absentCertificationFields = [
      'questId',
      'terminalReceiptDigest',
      'profileIdentity',
      'evidenceIdentity',
    ];
    for (
      let fieldIndex = ZERO;
      fieldIndex < absentCertificationFields.length;
      fieldIndex += ONE
    ) {
      const field = absentCertificationFields[fieldIndex];
      pushIf(
        errors,
        objectHasOwn(certification, field),
        `certification.${field}:forbidden_when_absent`,
      );
    }
  }
  if (certification.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED) {
    pushIf(errors, !isNonEmptyText(certification.questId),
      localText.CERTIFICATION_QUESTID_REQUIRED_WHEN_ATTACHED);
    validateDigest(
      errors,
      certification.terminalReceiptDigest,
      localText.CERTIFICATION_TERMINALRECEIPTDIGEST,
    );
    validateDigest(
      errors,
      certification.profileIdentity,
      localText.CERTIFICATION_PROFILEIDENTITY,
    );
    validateDigest(
      errors,
      certification.evidenceIdentity,
      localText.CERTIFICATION_EVIDENCEIDENTITY,
    );
    pushIf(
      errors,
      certification.profileIdentity !== report.profileIdentity,
      localText.CERTIFICATION_PROFILEIDENTITY_MISMATCH,
    );
    pushIf(
      errors,
      certification.evidenceIdentity !==
        computeScaleCertificationEvidenceIdentity(report),
      localText.CERTIFICATION_EVIDENCEIDENTITY_MISMATCH,
    );
    pushIf(
      errors,
      report.profile?.id === SCALE_PROFILE_ID.DEVELOPMENT,
      localText.CERTIFICATION_RECEIPTSTATE_P0_CANNOT_ATTACH,
    );
  }
}

function ownDataValue(owner, key, path) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, key);
  if (!descriptor || !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE)) {
    throw new TypeError(`${path}:own_data_property_required`);
  }
  return descriptor.value;
}

function canonicalizeArray(value) {
  const canonical = [];
  objectSetPrototypeOf(canonical, null);
  for (
    let valueIndex = ZERO;
    valueIndex < value.length;
    valueIndex += ONE
  ) {
    const descriptor = objectGetOwnPropertyDescriptor(value, valueIndex);
    const item = descriptor ?
      ownDataValue(value, valueIndex, `array.${valueIndex}`) :
      undefined;
    appendOwnArrayValue(canonical, canonicalize(item));
  }
  return canonical;
}

function canonicalizeRecord(value) {
  const keys = objectKeys(value);
  reflectApply(arraySortMethod, keys, []);
  const canonical = objectCreate(null);
  for (
    let keyIndex = ZERO;
    keyIndex < keys.length;
    keyIndex += ONE
  ) {
    const key = keys[keyIndex];
    objectDefineProperty(canonical, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: canonicalize(ownDataValue(value, key, `object.${key}`)),
    });
  }
  return canonical;
}

function canonicalize(value) {
  if (value && typeof value === 'object' && isProxy(value)) {
    throw new TypeError(localText.CANONICALIZATION_PROXY_FORBIDDEN);
  }
  if (
    typeof value === 'number' &&
    (
      !numberIsFinite(value) ||
      objectIs(value, -ZERO) ||
      value > numberMaximumSafeInteger ||
      value < -numberMaximumSafeInteger
    )
  ) {
    throw new TypeError(localText.CANONICALIZATION_NUMBER_NOT_CANONICAL);
  }
  if (arrayIsArray(value)) return canonicalizeArray(value);
  if (!isRecord(value)) return value;
  return canonicalizeRecord(value);
}

export function computeScaleEvidenceDigest(value) {
  const bytes = jsonStringify(canonicalize(value));
  return `sha256:${createHash(localText.SHA256).update(bytes).digest(localText.HEX)}`;
}

function receiptDecision(state, reasonCodes, errors) {
  return {state, reasonCodes, errors};
}

function invalidReceiptDecision(errors = [localText.RECEIPT_UNREADABLE]) {
  return receiptDecision(
    SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
    [SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID],
    errors,
  );
}

function profileIdentityPayload(report) {
  return {
    contractId: ownDataValue(report, localText.CONTRACTID, localText.REPORT_CONTRACTID),
    schemaVersion: ownDataValue(
      report,
      localText.SCHEMAVERSION,
      localText.REPORT_SCHEMAVERSION,
    ),
    profile: ownDataValue(report, localText.PROFILE, localText.REPORT_PROFILE),
    software: ownDataValue(report, localText.SOFTWARE, localText.REPORT_SOFTWARE),
    hardware: ownDataValue(report, localText.HARDWARE, localText.REPORT_HARDWARE),
    topology: ownDataValue(report, localText.TOPOLOGY, localText.REPORT_TOPOLOGY),
    data: ownDataValue(report, localText.DATA, localText.REPORT_DATA),
    workload: ownDataValue(report, localText.WORKLOAD, localText.REPORT_WORKLOAD),
  };
}

export function computeScaleProfileIdentity(report) {
  const bytes = jsonStringify(canonicalize(profileIdentityPayload(report)));
  return `sha256:${createHash(localText.SHA256).update(bytes).digest(localText.HEX)}`;
}

export function computeScaleRunIdentity(report) {
  const bytes = jsonStringify(canonicalize({
    profileIdentity: ownDataValue(
      report,
      'profileIdentity',
      'report.profileIdentity',
    ),
    run: ownDataValue(report, 'run', 'report.run'),
    provenance: ownDataValue(report, 'provenance', 'report.provenance'),
  }));
  return `sha256:${createHash(localText.SHA256).update(bytes).digest(localText.HEX)}`;
}

export function computeScaleCertificationEvidenceIdentity(report) {
  return computeScaleEvidenceDigest({
    contractId: ownDataValue(report, localText.CONTRACTID, localText.REPORT_CONTRACTID),
    schemaVersion: ownDataValue(
      report,
      localText.SCHEMAVERSION,
      localText.REPORT_SCHEMAVERSION,
    ),
    profileIdentity: ownDataValue(
      report,
      localText.PROFILEIDENTITY,
      localText.REPORT_PROFILEIDENTITY,
    ),
    run: ownDataValue(report, localText.RUN, localText.REPORT_RUN),
    provenance: ownDataValue(report, localText.PROVENANCE, localText.REPORT_PROVENANCE),
    gates: ownDataValue(report, localText.GATES, localText.REPORT_GATES),
    artifacts: ownDataValue(report, localText.ARTIFACTS, localText.REPORT_ARTIFACTS),
    extensions: ownDataValue(report, localText.EXTENSIONS, localText.REPORT_EXTENSIONS),
  });
}

export function computeScaleReportIdentity(report) {
  if (!isRecord(report) || isProxy(report)) {
    throw new TypeError(localText.REPORT_PLAIN_DATA_OBJECT_REQUIRED);
  }
  const reportPayload = objectCreate(null);
  const keys = objectKeys(report);
  for (let keyIndex = ZERO; keyIndex < keys.length; keyIndex += ONE) {
    const key = keys[keyIndex];
    if (key === localText.REPORTIDENTITY) continue;
    objectDefineProperty(reportPayload, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: ownDataValue(report, key, `report.${key}`),
    });
  }
  const bytes = jsonStringify(canonicalize(reportPayload));
  return `sha256:${createHash(localText.SHA256).update(bytes).digest(localText.HEX)}`;
}

function snapshotDataField(owner, field, path) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, field);
  if (
    !descriptor ||
    descriptor.enumerable !== true ||
    !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE)
  ) {
    return {
      state: localText.REJECTED,
      error: `${path}:own_enumerable_data_property_required`,
    };
  }
  return {state: localText.ACCEPTED, value: descriptor.value};
}

function snapshotPlainRecordField(owner, field, path) {
  const fieldResult = snapshotDataField(owner, field, path);
  if (fieldResult.state !== localText.ACCEPTED) return fieldResult;
  const value = fieldResult.value;
  if (
    !isRecord(value) ||
    isProxy(value) ||
    objectGetPrototypeOf(value) !== canonicalObjectPrototype
  ) {
    return {state: localText.REJECTED, error: `${path}:plain_data_object_required`};
  }
  return fieldResult;
}

function rejectedClaimEvaluation(error) {
  return {state: localText.REJECTED, error};
}

function isCanonicalPlainRecord(value) {
  if (!isRecord(value) || isProxy(value)) return false;
  const prototype = objectGetPrototypeOf(value);
  return prototype === canonicalObjectPrototype || prototype === null;
}

function firstRejectedFieldResult(fieldResults) {
  for (
    let resultIndex = ZERO;
    resultIndex < fieldResults.length;
    resultIndex += ONE
  ) {
    const result = fieldResults[resultIndex];
    if (result.state !== localText.ACCEPTED) return result;
  }
  return null;
}

function snapshotClaimReportFields(report) {
  return {
    profile: snapshotPlainRecordField(report, localText.PROFILE, localText.REPORT_PROFILE),
    run: snapshotPlainRecordField(report, localText.RUN, localText.REPORT_RUN),
    gates: snapshotPlainRecordField(report, localText.GATES, localText.REPORT_GATES),
    certification: snapshotPlainRecordField(
      report,
      localText.CERTIFICATION,
      localText.REPORT_CERTIFICATION,
    ),
    profileIdentity: snapshotDataField(
      report,
      localText.PROFILEIDENTITY,
      localText.REPORT_PROFILEIDENTITY,
    ),
  };
}

function snapshotClaimEligibilityFields(reportFields) {
  return {
    profileId: snapshotDataField(
      reportFields.profile.value,
      localText.ID,
      localText.REPORT_PROFILE_ID,
    ),
    fidelity: snapshotDataField(
      reportFields.run.value,
      localText.FIDELITY,
      localText.REPORT_RUN_FIDELITY,
    ),
    receiptState: snapshotDataField(
      reportFields.certification.value,
      localText.RECEIPTSTATE,
      localText.REPORT_CERTIFICATION_RECEIPTSTATE,
    ),
  };
}

function snapshotRequiredGatePassState(gates) {
  let gatesPass = true;
  for (
    let gateIndex = ZERO;
    gateIndex < REQUIRED_GATE_NAMES.length;
    gateIndex += ONE
  ) {
    const name = REQUIRED_GATE_NAMES[gateIndex];
    const gateResult = snapshotPlainRecordField(
      gates,
      name,
      `report.gates.${name}`,
    );
    if (gateResult.state !== localText.ACCEPTED) return gateResult;
    const statusResult = snapshotDataField(
      gateResult.value,
      'status',
      `report.gates.${name}.status`,
    );
    if (statusResult.state !== localText.ACCEPTED) return statusResult;
    if (statusResult.value !== SCALE_GATE_STATUS.PASS) gatesPass = false;
  }
  return {state: localText.ACCEPTED, gatesPass};
}

function snapshotAttachedReceiptFields(certification, snapshot) {
  if (snapshot.receiptState !==
      SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED) {
    return {state: localText.ACCEPTED};
  }
  const questIdResult = snapshotDataField(
    certification,
    'questId',
    'report.certification.questId',
  );
  const digestResult = snapshotDataField(
    certification,
    'terminalReceiptDigest',
    'report.certification.terminalReceiptDigest',
  );
  const rejectedResult = firstRejectedFieldResult([
    questIdResult,
    digestResult,
  ]);
  if (rejectedResult) return rejectedResult;
  snapshot.questId = questIdResult.value;
  snapshot.terminalReceiptDigest = digestResult.value;
  return {state: localText.ACCEPTED};
}

function snapshotScaleClaimEvaluation(report) {
  if (
    !isCanonicalPlainRecord(report)
  ) {
    return rejectedClaimEvaluation(localText.REPORT_PLAIN_DATA_OBJECT_REQUIRED);
  }
  const reportFields = snapshotClaimReportFields(report);
  const rejectedReportField = firstRejectedFieldResult([
    reportFields.profile,
    reportFields.run,
    reportFields.gates,
    reportFields.certification,
    reportFields.profileIdentity,
  ]);
  if (rejectedReportField) {
    return rejectedClaimEvaluation(rejectedReportField.error);
  }
  let computedProfileIdentity;
  try {
    computedProfileIdentity = computeScaleProfileIdentity(report);
  } catch {
    return rejectedClaimEvaluation(localText.REPORT_PROFILEIDENTITY_UNREADABLE);
  }
  if (computedProfileIdentity !== reportFields.profileIdentity.value) {
    return rejectedClaimEvaluation(localText.REPORT_PROFILEIDENTITY_MISMATCH);
  }
  const eligibilityFields = snapshotClaimEligibilityFields(reportFields);
  const rejectedEligibilityField = firstRejectedFieldResult([
    eligibilityFields.profileId,
    eligibilityFields.fidelity,
    eligibilityFields.receiptState,
  ]);
  if (rejectedEligibilityField) {
    return rejectedClaimEvaluation(rejectedEligibilityField.error);
  }
  const gateResult = snapshotRequiredGatePassState(reportFields.gates.value);
  if (gateResult.state !== localText.ACCEPTED) {
    return rejectedClaimEvaluation(gateResult.error);
  }
  const snapshot = {
    state: 'accepted',
    profileId: eligibilityFields.profileId.value,
    fidelity: eligibilityFields.fidelity.value,
    gatesPass: gateResult.gatesPass,
    receiptState: eligibilityFields.receiptState.value,
    profileIdentity: reportFields.profileIdentity.value,
    questId: '',
    terminalReceiptDigest: '',
  };
  const attachedReceiptResult = snapshotAttachedReceiptFields(
    reportFields.certification.value,
    snapshot,
  );
  if (attachedReceiptResult.state !== localText.ACCEPTED) {
    return rejectedClaimEvaluation(attachedReceiptResult.error);
  }
  return snapshot;
}

function unverifiedReceiptDecision(error) {
  return receiptDecision(
    SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
    [SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED],
    [error],
  );
}

function snapshotReceiptDecisionOptions(options) {
  let result;
  if (
    !options ||
    typeof options !== 'object' ||
    arrayIsArray(options) ||
    isProxy(options)
  ) {
    result = {state: localText.REJECTED};
  } else {
    const receiptsDescriptor =
      objectGetOwnPropertyDescriptor(options, 'verifiedTerminalReceipts');
    if (
      !receiptsDescriptor ||
      !objectHasOwn(receiptsDescriptor, DATA_DESCRIPTOR_VALUE)
    ) {
      result = {state: localText.REJECTED};
    } else {
      const evaluatedAtDescriptor = objectGetOwnPropertyDescriptor(
        options,
        'evaluatedAt',
      );
      const evaluatedAt = evaluatedAtDescriptor &&
        objectHasOwn(evaluatedAtDescriptor, DATA_DESCRIPTOR_VALUE) ?
        evaluatedAtDescriptor.value :
        '';
      result = {
        state: localText.ACCEPTED,
        verifiedReceipts: receiptsDescriptor.value,
        evaluatedAt,
      };
    }
  }
  return result;
}

function resolveVerifiedReceipt(verifiedReceipts, digest) {
  try {
    const hasReceipt = reflectApply(
      mapHasMethod,
      verifiedReceipts,
      [digest],
    );
    if (!hasReceipt) return {state: localText.UNRESOLVED};
    return {
      state: localText.ACCEPTED,
      receipt: reflectApply(mapGetMethod, verifiedReceipts, [digest]),
    };
  } catch {
    return {state: localText.REJECTED};
  }
}

function snapshotCertificationEvidenceIdentity(report) {
  try {
    return {
      state: localText.ACCEPTED,
      evidenceIdentity: computeScaleCertificationEvidenceIdentity(report),
    };
  } catch {
    return {state: localText.REJECTED};
  }
}

function resolveScaleCertificationReceiptDecision(
  report,
  options,
  evaluation,
) {
  if (evaluation.receiptState !==
      SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED) {
    return unverifiedReceiptDecision(
      localText.CERTIFICATION_RECEIPTSTATE_ATTACHED_REQUIRED,
    );
  }
  const optionsResult = snapshotReceiptDecisionOptions(options);
  if (optionsResult.state !== localText.ACCEPTED) {
    return unverifiedReceiptDecision(localText.VERIFIEDTERMINALRECEIPTS_MAP_REQUIRED);
  }
  const receiptResult = resolveVerifiedReceipt(
    optionsResult.verifiedReceipts,
    evaluation.terminalReceiptDigest,
  );
  if (receiptResult.state === localText.REJECTED) {
    return unverifiedReceiptDecision(localText.VERIFIEDTERMINALRECEIPTS_MAP_REQUIRED);
  }
  if (receiptResult.state === localText.UNRESOLVED) {
    return unverifiedReceiptDecision(
      localText.CERTIFICATION_TERMINALRECEIPTDIGEST_UNRESOLVED,
    );
  }
  const evidenceIdentityResult =
    snapshotCertificationEvidenceIdentity(report);
  if (evidenceIdentityResult.state !== localText.ACCEPTED) {
    return invalidReceiptDecision([
      localText.CERTIFICATION_EVIDENCEIDENTITY_UNREADABLE,
    ]);
  }
  return validateScaleCertificationReceipt(receiptResult.receipt, {
    terminalReceiptDigest: evaluation.terminalReceiptDigest,
    questId: evaluation.questId,
    profileIdentity: evaluation.profileIdentity,
    evidenceIdentity: evidenceIdentityResult.evidenceIdentity,
    evaluatedAt: optionsResult.evaluatedAt,
  });
}

export function evaluateScaleClaimEligibility(report, options = {}) {
  const reasonCodes = new ArrayConstructor();
  let evaluation;
  try {
    evaluation = snapshotScaleClaimEvaluation(report);
  } catch {
    evaluation = rejectedClaimEvaluation(localText.REPORT_UNREADABLE);
  }
  if (evaluation.state !== localText.ACCEPTED) {
    appendOwnArrayValue(
      reasonCodes,
      SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
    );
    return {
      profileEvidence: true,
      scaleCertification: false,
      reasonCodes,
    };
  }
  if (evaluation.profileId === SCALE_PROFILE_ID.DEVELOPMENT) {
    appendOwnArrayValue(reasonCodes, SCALE_CLAIM_REASON.DEVELOPMENT_PROFILE);
  }
  if (evaluation.fidelity !== SCALE_EVIDENCE_FIDELITY.LIVE) {
    appendOwnArrayValue(reasonCodes, SCALE_CLAIM_REASON.NON_LIVE_FIDELITY);
  }
  if (!evaluation.gatesPass) {
    appendOwnArrayValue(
      reasonCodes,
      SCALE_CLAIM_REASON.REQUIRED_GATE_NOT_PASSING,
    );
  }
  if (evaluation.receiptState ===
      SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT) {
    appendOwnArrayValue(
      reasonCodes,
      SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_ABSENT,
    );
  } else {
    const receiptDecisionResult =
      resolveScaleCertificationReceiptDecision(report, options, evaluation);
    for (
      let reasonIndex = ZERO;
      reasonIndex < receiptDecisionResult.reasonCodes.length;
      reasonIndex += ONE
    ) {
      appendOwnArrayValue(
        reasonCodes,
        receiptDecisionResult.reasonCodes[reasonIndex],
      );
    }
  }
  return {
    profileEvidence: true,
    scaleCertification: reasonCodes.length === ZERO,
    reasonCodes,
  };
}

function fieldsContainKey(fields, key) {
  for (
    let fieldIndex = ZERO;
    fieldIndex < fields.length;
    fieldIndex += ONE
  ) {
    if (key === fields[fieldIndex]) return true;
  }
  return false;
}

function keysExactlyMatchFields(keys, fields) {
  if (keys.length !== fields.length) return false;
  for (let keyIndex = ZERO; keyIndex < keys.length; keyIndex += ONE) {
    if (!fieldsContainKey(fields, keys[keyIndex])) return false;
  }
  return true;
}

function isOwnEnumerableDataField(value, field) {
  const descriptor = objectGetOwnPropertyDescriptor(value, field);
  return Boolean(descriptor) &&
    descriptor.enumerable === true &&
    objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE);
}

function allFieldsAreOwnEnumerableData(value, fields) {
  for (
    let fieldIndex = ZERO;
    fieldIndex < fields.length;
    fieldIndex += ONE
  ) {
    if (!isOwnEnumerableDataField(value, fields[fieldIndex])) return false;
  }
  return true;
}

function exactOwnDataFields(value, fields) {
  if (!isCanonicalPlainRecord(value)) return false;
  const keys = reflectOwnKeys(value);
  return keysExactlyMatchFields(keys, fields) &&
    allFieldsAreOwnEnumerableData(value, fields);
}

function reasonCodesMatch(actual, expected) {
  if (
    !arrayIsArray(actual) ||
    actual.length !== expected.length ||
    isProxy(actual)
  ) {
    return false;
  }
  for (
    let reasonIndex = ZERO;
    reasonIndex < expected.length;
    reasonIndex += ONE
  ) {
    const descriptor = objectGetOwnPropertyDescriptor(actual, reasonIndex);
    if (
      !descriptor ||
      !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE) ||
      descriptor.value !== expected[reasonIndex]
    ) {
      return false;
    }
  }
  return true;
}

function scaleClaimEligibilityMatches(actual, expected) {
  if (!exactOwnDataFields(actual, SCALE_CLAIM_ELIGIBILITY_FIELDS)) {
    return false;
  }
  return actual.profileEvidence === expected.profileEvidence &&
    actual.scaleCertification === expected.scaleCertification &&
    reasonCodesMatch(actual.reasonCodes, expected.reasonCodes);
}

function validateBaseReport(report) {
  const errors = [];
  pushIf(errors, !isRecord(report), localText.REPORT_OBJECT_REQUIRED);
  if (!isRecord(report)) return errors;
  pushIf(errors, report.contractId !== SCALE_EVIDENCE_CONTRACT_ID,
    localText.CONTRACTID_UNSUPPORTED);
  pushIf(errors, report.schemaVersion !== SCALE_EVIDENCE_SCHEMA_VERSION,
    localText.SCHEMAVERSION_UNSUPPORTED);
  pushIf(errors, !isRecord(report.profile), localText.PROFILE_OBJECT_REQUIRED);
  if (isRecord(report.profile)) {
    pushIf(
      errors,
      !intrinsicSetHas(PROFILE_IDS, report.profile.id),
      localText.PROFILE_ID_UNSUPPORTED,
    );
    pushIf(errors, !isPositiveInteger(report.profile.version),
      localText.PROFILE_VERSION_POSITIVE_INTEGER_REQUIRED);
  }
  validateIdentityFields(report, errors);
  validateGateEnvelope(report, errors);
  validateProvenance(report, errors);
  validateArtifacts(report, errors);
  validateCertification(report, errors);
  pushIf(errors, !isRecord(report.extensions), localText.EXTENSIONS_OBJECT_REQUIRED);
  return errors;
}

function snapshotReportForValidation(report) {
  if (!isCanonicalPlainRecord(report)) {
    return {
      state: localText.REJECTED,
      error: localText.REPORT_PLAIN_DATA_OBJECT_REQUIRED,
    };
  }
  try {
    return {state: localText.ACCEPTED, report: canonicalize(report)};
  } catch {
    return {state: localText.REJECTED, error: localText.REPORT_CANONICAL_DATA_REQUIRED};
  }
}

export function validateScaleEvidenceReport(report, options = {}) {
  const snapshotResult = snapshotReportForValidation(report);
  if (snapshotResult.state !== localText.ACCEPTED) {
    return {
      valid: false,
      errors: [snapshotResult.error],
      profileIdentity: null,
    };
  }
  const snapshot = snapshotResult.report;
  const errors = validateBaseReport(snapshot);
  if (errors.length === ZERO) {
    const expectedIdentity = computeScaleProfileIdentity(snapshot);
    pushIf(errors, snapshot.profileIdentity !== expectedIdentity,
      localText.PROFILEIDENTITY_MISMATCH);
    const expectedRunIdentity = computeScaleRunIdentity(snapshot);
    pushIf(errors, snapshot.runIdentity !== expectedRunIdentity,
      localText.RUNIDENTITY_MISMATCH);
    const expectedEligibility =
      evaluateScaleClaimEligibility(report, options);
    pushIf(
      errors,
      !scaleClaimEligibilityMatches(
        report.claimEligibility,
        expectedEligibility,
      ),
      localText.CLAIMELIGIBILITY_MISMATCH,
    );
    const expectedReportIdentity = computeScaleReportIdentity(snapshot);
    pushIf(errors, snapshot.reportIdentity !== expectedReportIdentity,
      localText.REPORTIDENTITY_MISMATCH);
  }
  return {
    valid: errors.length === ZERO,
    errors,
    profileIdentity: errors.length === ZERO ? snapshot.profileIdentity : null,
  };
}

export function createScaleEvidenceReport(input, options = {}) {
  const report = {
    ...structuredCloneValue(input),
    contractId: SCALE_EVIDENCE_CONTRACT_ID,
    schemaVersion: SCALE_EVIDENCE_SCHEMA_VERSION,
  };
  report.profileIdentity = computeScaleProfileIdentity(report);
  const baseErrors = validateBaseReport(report);
  if (baseErrors.length > ZERO) {
    throw new TypeError(
      `invalid scale evidence: ${
        reflectApply(arrayJoinMethod, baseErrors, [localText.REASON_SEPARATOR])
      }`,
    );
  }
  report.runIdentity = computeScaleRunIdentity(report);
  report.claimEligibility = evaluateScaleClaimEligibility(report, options);
  report.reportIdentity = computeScaleReportIdentity(report);
  const result = validateScaleEvidenceReport(report, options);
  if (!result.valid) {
    throw new TypeError(
      `invalid scale evidence: ${
        reflectApply(arrayJoinMethod, result.errors, [localText.REASON_SEPARATOR])
      }`,
    );
  }
  return report;
}
