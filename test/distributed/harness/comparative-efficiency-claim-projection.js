import {types} from 'node:util';
import {
  calculateComparativeOpportunity,
} from '../../../src/diagnostics/comparative-efficiency-opportunity-calculator.js';
import {
  appendOwnArrayValue,
  isMissingDataValue,
  ownDataValue,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE,
  BENCHMARK_RESOURCE_CLAIM_MEASUREMENT_STATE,
} from './benchmark-resource-claim-evidence-view.js';
import {
  inspectBenchmarkResourceClaimEvidenceRoot,
} from './benchmark-resource-evidence-root.js';
import {
  BENCHMARK_RESOURCE_EFFECT_DIRECTION,
} from './benchmark-resource-contract-constants.js';
import {
  inspectBenchmarkResourcePairedEffect,
} from './benchmark-resource-cost-and-effects.js';
import {
  COMPARATIVE_EVIDENCE_CLASS,
} from './comparative-efficiency-evidence-contract.js';
import {
  COMPARATIVE_CLAIM_CERTIFICATION_STATE,
  COMPARATIVE_CLAIM_EFFECT_OUTCOME,
  COMPARATIVE_CLAIM_EVIDENCE_STATE,
  COMPARATIVE_CLAIM_METRIC,
  COMPARATIVE_CLAIM_PROFILE_STATE,
  COMPARATIVE_CLAIM_REASON,
  COMPARATIVE_CLAIM_SOURCE_STATE,
  COMPARATIVE_CLAIM_SUBJECT_KIND,
} from './comparative-efficiency-claim-projection-constants.js';
import {
  createComparativeEfficiencyClaimRow,
  createComparativeEfficiencyClaimTable,
} from './comparative-efficiency-claim-table.js';
import {
  SCALE_CERTIFICATION_RECEIPT_DECISION_STATE,
  SCALE_PROFILE_ID,
  validateScaleCertificationReceipt,
} from './scale-evidence-contract.js';

const dateParse = Date.parse;
const ArrayConstructor = Array;
const arrayJoinMethod = Array.prototype.join;
const isProxy = types.isProxy;
const numberIsFinite = Number.isFinite;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const setHas = Function.call.bind(Set.prototype.has);
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const projectionKeys = Object.freeze([
  'evaluatedAt',
  'analyticalEvidence',
  'measuredEvidence',
]);
const analyticalKeys = Object.freeze(['workloadId', 'input']);
const measuredKeys = Object.freeze([
  'workloadId',
  'expectedMatrixId',
  'profile',
  'rootReceipt',
  'certification',
]);
const profileKeys = Object.freeze(['id', 'identity']);
const absentCertificationKeys = Object.freeze(['state']);
const attachedCertificationKeys =
  Object.freeze(['state', 'receipt', 'expected']);
const certificationExpectationKeys = Object.freeze([
  'terminalReceiptDigest',
  'questId',
  'profileIdentity',
  'evidenceIdentity',
]);
const maximumEvidenceItems = 256;
const dataValueKey = 'value';
const scaleProfileIds = new Set(Object.values(SCALE_PROFILE_ID));
const localText = Object.freeze({
  ANALYTICAL_ITEM: 'claimProjection.analyticalEvidence.item',
  ANALYTICAL_WORKLOAD_ID: 'analytical.workloadId',
  CERTIFICATION: 'claimProjection.certification',
  CERTIFICATION_EXPECTED: 'claimProjection.certification.expected',
  CERTIFICATION_STATE_UNSUPPORTED:
    'claimProjection.certification.state:unsupported',
  ELIGIBLE: 'eligible',
  EVALUATED_AT: 'evaluatedAt',
  INELIGIBLE: 'ineligible',
  INVALID: 'invalid',
  INVALID_TIMESTAMP: 'invalid',
  MEASURED_EXPECTED_MATRIX_ID: 'measured.expectedMatrixId',
  MEASURED_ITEM: 'claimProjection.measuredEvidence.item',
  MEASURED_PROFILE: 'measured.profile',
  MEASURED_PROFILE_ID: 'measured.profile.id',
  MEASURED_PROFILE_IDENTITY: 'measured.profile.identity',
  MEASURED_WORKLOAD_ID: 'measured.workloadId',
  PROJECTION: 'claimProjection',
  PROJECTION_ANALYTICAL_EVIDENCE: 'claimProjection.analyticalEvidence',
  PROJECTION_FAILED_CLOSED: 'projection_failed_closed',
  PROJECTION_MEASURED_EVIDENCE: 'claimProjection.measuredEvidence',
  REASON_SEPARATOR: ', ',
  VALID: 'valid',
  ANALYTICAL_NOT_MEASURED_SUFFIX:
    'scale, or infrastructure cost.',
});
const pairedMetrics = Object.freeze([
  COMPARATIVE_CLAIM_METRIC.CAPACITY,
  COMPARATIVE_CLAIM_METRIC.COST,
]);

function emptyReasonCodes() {
  return new ArrayConstructor();
}

function appendArrayValues(target, values) {
  for (let index = 0; index < values.length; index += 1) {
    appendOwnArrayValue(target, ownDataValue(values, `${index}`));
  }
}

function copiedArray(values) {
  const copy = [];
  appendArrayValues(copy, values);
  return copy;
}

function combinedReasonCodes(first, second, third, fourth) {
  const combined = [];
  const sources = [first, second, third, fourth];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    appendArrayValues(combined, sources[sourceIndex]);
  }
  return combined;
}

function joinReasonCodes(reasonCodes) {
  return reflectApply(
    arrayJoinMethod,
    reasonCodes,
    [localText.REASON_SEPARATOR],
  );
}

function safeErrorMessage(error) {
  if (!error || typeof error !== 'object' || isProxy(error)) {
    return localText.PROJECTION_FAILED_CLOSED;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
  return descriptor && objectHasOwn(descriptor, dataValueKey) &&
    typeof descriptor.value === 'string' ?
    descriptor.value :
    localText.PROJECTION_FAILED_CLOSED;
}

function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !regexpTest(timestampPattern, value)
  ) {
    return {state: localText.INVALID_TIMESTAMP};
  }
  const milliseconds = dateParse(value);
  return numberIsFinite(milliseconds) ?
    {state: localText.VALID, milliseconds} :
    {state: localText.INVALID_TIMESTAMP};
}

function assertProjectionInput(input) {
  assertBenchmarkResourceExactRecord(input, projectionKeys, localText.PROJECTION);
  assertBenchmarkResourceArray(
    input.analyticalEvidence,
    localText.PROJECTION_ANALYTICAL_EVIDENCE,
    maximumEvidenceItems,
  );
  assertBenchmarkResourceArray(
    input.measuredEvidence,
    localText.PROJECTION_MEASURED_EVIDENCE,
    maximumEvidenceItems,
  );
}

function notApplicableProfile() {
  return {state: COMPARATIVE_CLAIM_PROFILE_STATE.NOT_APPLICABLE};
}

function identifiedProfile(profile) {
  return {
    state: COMPARATIVE_CLAIM_PROFILE_STATE.IDENTIFIED,
    id: profile.id,
    identity: profile.identity,
  };
}

function analyticalRow(item) {
  assertBenchmarkResourceExactRecord(
    item,
    analyticalKeys,
    localText.ANALYTICAL_ITEM,
  );
  assertBenchmarkResourceText(
    item.workloadId,
    localText.ANALYTICAL_WORKLOAD_ID,
  );
  try {
    const output = calculateComparativeOpportunity(item.input);
    return createComparativeEfficiencyClaimRow({
      workloadId: item.workloadId,
      metric: COMPARATIVE_CLAIM_METRIC.ANALYTICAL_OPPORTUNITY,
      profile: notApplicableProfile(),
      subject: {kind: COMPARATIVE_CLAIM_SUBJECT_KIND.ANALYTICAL_WORKLOAD},
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.ANALYTICAL_BOUND,
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.ANALYTICAL_ESTIMATE,
      evidence: {
        state: COMPARATIVE_CLAIM_EVIDENCE_STATE.ANALYTICAL_OUTPUT,
        output,
      },
      source: {state: COMPARATIVE_CLAIM_SOURCE_STATE.CALCULATOR},
      reasonCodes: emptyReasonCodes(),
      statement:
        `Analytical bound for ${item.workloadId}; not measured capacity, ` +
        localText.ANALYTICAL_NOT_MEASURED_SUFFIX,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    return createComparativeEfficiencyClaimRow({
      workloadId: item.workloadId,
      metric: COMPARATIVE_CLAIM_METRIC.ANALYTICAL_OPPORTUNITY,
      profile: notApplicableProfile(),
      subject: {kind: COMPARATIVE_CLAIM_SUBJECT_KIND.ANALYTICAL_WORKLOAD},
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.NOT_EVALUABLE,
      evidence: {
        state: COMPARATIVE_CLAIM_EVIDENCE_STATE.ABSENT,
        error: message,
      },
      source: {state: COMPARATIVE_CLAIM_SOURCE_STATE.INVALID_ROOT},
      reasonCodes: [COMPARATIVE_CLAIM_REASON.CALCULATOR_ERROR],
      statement: `No analytical claim for ${item.workloadId}: ${message}.`,
    });
  }
}

export function classifyComparativeEfficiencyClaimEffect(effect) {
  const inspection = inspectBenchmarkResourcePairedEffect(effect);
  if (!inspection.valid) {
    throw new TypeError(`claimEffect:${inspection.reason}`);
  }
  const neutral = 1;
  if (
    effect.estimate === neutral &&
    effect.confidenceInterval.lower === neutral &&
    effect.confidenceInterval.upper === neutral
  ) {
    return COMPARATIVE_CLAIM_EFFECT_OUTCOME.NEUTRAL;
  }
  if (
    effect.confidenceInterval.lower <= neutral &&
    effect.confidenceInterval.upper >= neutral
  ) {
    return COMPARATIVE_CLAIM_EFFECT_OUTCOME.INCONCLUSIVE;
  }
  const favorableBoundary = neutral + effect.practicalThreshold;
  const unfavorableBoundary = neutral - effect.practicalThreshold;
  if (effect.direction === BENCHMARK_RESOURCE_EFFECT_DIRECTION.HIGHER_IS_BETTER) {
    if (effect.confidenceInterval.lower > favorableBoundary) {
      return COMPARATIVE_CLAIM_EFFECT_OUTCOME.CANDIDATE_WIN;
    }
    if (effect.confidenceInterval.upper < unfavorableBoundary) {
      return COMPARATIVE_CLAIM_EFFECT_OUTCOME.ALTERNATIVE_WIN;
    }
  } else {
    if (effect.confidenceInterval.upper < unfavorableBoundary) {
      return COMPARATIVE_CLAIM_EFFECT_OUTCOME.CANDIDATE_WIN;
    }
    if (effect.confidenceInterval.lower > favorableBoundary) {
      return COMPARATIVE_CLAIM_EFFECT_OUTCOME.ALTERNATIVE_WIN;
    }
  }
  return COMPARATIVE_CLAIM_EFFECT_OUTCOME.PRACTICALLY_INSIGNIFICANT;
}

function rootCurrentness(evidence, evaluatedAt) {
  if (!evidence.claimEligible) {
    return [COMPARATIVE_CLAIM_REASON.EVIDENCE_NOT_CLAIM_ELIGIBLE];
  }
  const evaluation = timestamp(evaluatedAt);
  if (evaluation.state === localText.INVALID_TIMESTAMP) {
    return [COMPARATIVE_CLAIM_REASON.EVALUATION_TIME_INVALID];
  }
  if (evaluation.milliseconds < dateParse(evidence.producedAt)) {
    return [COMPARATIVE_CLAIM_REASON.EVIDENCE_NOT_YET_VALID];
  }
  if (evaluation.milliseconds >= dateParse(evidence.validUntil)) {
    return [COMPARATIVE_CLAIM_REASON.EVIDENCE_EXPIRED];
  }
  return [];
}

function priceCurrentness(evidence, evaluatedAt) {
  const evaluation = timestamp(evaluatedAt);
  if (evaluation.state === localText.INVALID_TIMESTAMP) {
    return [COMPARATIVE_CLAIM_REASON.EVALUATION_TIME_INVALID];
  }
  if (evaluation.milliseconds < dateParse(evidence.priceSheet.validFrom)) {
    return [COMPARATIVE_CLAIM_REASON.PRICE_NOT_YET_VALID];
  }
  if (evaluation.milliseconds >= dateParse(evidence.priceSheet.validUntil)) {
    return [COMPARATIVE_CLAIM_REASON.PRICE_EXPIRED];
  }
  return [];
}

function certificationMode(item, certificationState) {
  return !setHas(scaleProfileIds, item.profile.id) ?
    localText.INVALID :
    item.profile.id === SCALE_PROFILE_ID.DEVELOPMENT ?
      SCALE_PROFILE_ID.DEVELOPMENT :
      certificationState;
}

function attachedCertificationDecision(
  item,
  certification,
  rootDigest,
  evaluatedAt,
) {
  assertBenchmarkResourceExactRecord(
    certification.expected,
    certificationExpectationKeys,
    localText.CERTIFICATION_EXPECTED,
  );
  const expected = certification.expected;
  if (
    expected.profileIdentity !== item.profile.identity ||
    expected.evidenceIdentity !== rootDigest
  ) {
    return {
      state: localText.INELIGIBLE,
      reasonCodes: [COMPARATIVE_CLAIM_REASON.CERTIFICATION_INVALID],
    };
  }
  const receiptDecision = validateScaleCertificationReceipt(
    certification.receipt,
    {
      terminalReceiptDigest: expected.terminalReceiptDigest,
      questId: expected.questId,
      profileIdentity: expected.profileIdentity,
      evidenceIdentity: expected.evidenceIdentity,
      evaluatedAt,
    },
  );
  return receiptDecision.state ===
    SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT ?
    {
      state: localText.ELIGIBLE,
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.CERTIFIED_PROFILE,
      reasonCodes: emptyReasonCodes(),
    } :
    {
      state: localText.INELIGIBLE,
      reasonCodes: copiedArray(receiptDecision.reasonCodes),
    };
}

function certificationDecision(item, rootDigest, evaluatedAt) {
  const certification = item.certification;
  const certificationState = ownDataValue(certification, 'state');
  const keys = certificationState ===
    COMPARATIVE_CLAIM_CERTIFICATION_STATE.ATTACHED ?
    attachedCertificationKeys :
    absentCertificationKeys;
  assertBenchmarkResourceExactRecord(
    certification,
    keys,
    localText.CERTIFICATION,
  );
  if (
    certificationState !== COMPARATIVE_CLAIM_CERTIFICATION_STATE.ABSENT &&
    certificationState !== COMPARATIVE_CLAIM_CERTIFICATION_STATE.ATTACHED
  ) {
    throw new TypeError(localText.CERTIFICATION_STATE_UNSUPPORTED);
  }
  const mode = certificationMode(item, certificationState);
  let decision;
  switch (mode) {
  case localText.INVALID:
    decision = {
      state: localText.INELIGIBLE,
      reasonCodes: [COMPARATIVE_CLAIM_REASON.CERTIFICATION_INVALID],
    };
    break;
  case SCALE_PROFILE_ID.DEVELOPMENT:
    decision = {
      state: localText.ELIGIBLE,
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
      reasonCodes: emptyReasonCodes(),
    };
    break;
  case COMPARATIVE_CLAIM_CERTIFICATION_STATE.ABSENT:
    decision = {
      state: localText.INELIGIBLE,
      reasonCodes: [COMPARATIVE_CLAIM_REASON.CERTIFICATION_ABSENT],
    };
    break;
  case COMPARATIVE_CLAIM_CERTIFICATION_STATE.ATTACHED:
    decision = attachedCertificationDecision(
      item,
      certification,
      rootDigest,
      evaluatedAt,
    );
    break;
  default:
    throw new TypeError(localText.CERTIFICATION_STATE_UNSUPPORTED);
  }
  return decision;
}

function effectReasonCodes(outcome) {
  if (outcome === COMPARATIVE_CLAIM_EFFECT_OUTCOME.INCONCLUSIVE) {
    return [COMPARATIVE_CLAIM_REASON.EFFECT_INCONCLUSIVE];
  }
  if (
    outcome ===
      COMPARATIVE_CLAIM_EFFECT_OUTCOME.PRACTICALLY_INSIGNIFICANT
  ) {
    return [
      COMPARATIVE_CLAIM_REASON.EFFECT_PRACTICALLY_INSIGNIFICANT,
    ];
  }
  return emptyReasonCodes();
}

function outcomeStatement(item, metric, evidenceClass, outcome, reasonCodes) {
  if (evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM) {
    return `No current ${metric} claim for ${item.workloadId}: ` +
      `${outcome}; ${joinReasonCodes(reasonCodes)}.`;
  }
  if (outcome === COMPARATIVE_CLAIM_EFFECT_OUTCOME.ALTERNATIVE_WIN) {
    return `${item.workloadId} ${metric}: alternative win; candidate ` +
      `regression (${evidenceClass}).`;
  }
  return `${item.workloadId} ${metric}: ${outcome} (${evidenceClass}).`;
}

function effectRow(input) {
  const outcome = classifyComparativeEfficiencyClaimEffect(input.effect);
  const reasonCodes = combinedReasonCodes(
    input.rootReasons,
    input.metricReasons,
    input.profileDecision.reasonCodes,
    effectReasonCodes(outcome),
  );
  const evidenceClass = reasonCodes.length === 0 ?
    input.profileDecision.evidenceClass :
    COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM;
  return createComparativeEfficiencyClaimRow({
    workloadId: input.item.workloadId,
    metric: input.metric,
    profile: identifiedProfile(input.item.profile),
    subject: {
      kind: COMPARATIVE_CLAIM_SUBJECT_KIND.MATRIX_CELL,
      matrixId: input.evidence.matrixId,
      cellId: input.cell.cellId,
      dimensions: input.cell.dimensions,
    },
    evidenceClass,
    outcome,
    evidence: {
      state: COMPARATIVE_CLAIM_EVIDENCE_STATE.VERIFIED_EFFECT,
      effect: input.effect,
    },
    source: {
      state: COMPARATIVE_CLAIM_SOURCE_STATE.VERIFIED_ROOT,
      rootDigest: input.evidence.rootDigest,
      sourceRevision: input.evidence.sourceRevision,
      producedAt: input.evidence.producedAt,
      validUntil: input.evidence.validUntil,
      priceSheetDigest: input.evidence.priceSheet.digest,
    },
    reasonCodes,
    statement: outcomeStatement(
      input.item,
      input.metric,
      evidenceClass,
      outcome,
      reasonCodes,
    ),
  });
}

function nonMeasuringRows(item, evidence, cell, rootReasons) {
  const rows = [];
  const reasonCodes = combinedReasonCodes(
    rootReasons,
    [COMPARATIVE_CLAIM_REASON.NON_MEASURING],
    cell.measurement.reasonCodes,
    emptyReasonCodes(),
  );
  for (
    let metricIndex = 0;
    metricIndex < pairedMetrics.length;
    metricIndex += 1
  ) {
    const metric = pairedMetrics[metricIndex];
    appendOwnArrayValue(rows, createComparativeEfficiencyClaimRow({
      workloadId: item.workloadId,
      metric,
      profile: identifiedProfile(item.profile),
      subject: {
        kind: COMPARATIVE_CLAIM_SUBJECT_KIND.MATRIX_CELL,
        matrixId: evidence.matrixId,
        cellId: cell.cellId,
        dimensions: cell.dimensions,
      },
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.NOT_EVALUABLE,
      evidence: {state: COMPARATIVE_CLAIM_EVIDENCE_STATE.ABSENT},
      source: {
        state: COMPARATIVE_CLAIM_SOURCE_STATE.VERIFIED_ROOT,
        rootDigest: evidence.rootDigest,
        sourceRevision: evidence.sourceRevision,
        producedAt: evidence.producedAt,
        validUntil: evidence.validUntil,
        priceSheetDigest: evidence.priceSheet.digest,
      },
      reasonCodes,
      statement: `No current ${metric} claim for ${item.workloadId}: ` +
        `non-measuring cell; ${joinReasonCodes(reasonCodes)}.`,
    }));
  }
  return rows;
}

function invalidRootRows(
  item,
  reason,
  reasonCode = COMPARATIVE_CLAIM_REASON.EVIDENCE_INVALID,
) {
  const rows = [];
  for (
    let metricIndex = 0;
    metricIndex < pairedMetrics.length;
    metricIndex += 1
  ) {
    const metric = pairedMetrics[metricIndex];
    appendOwnArrayValue(rows, createComparativeEfficiencyClaimRow({
      workloadId: item.workloadId,
      metric,
      profile: identifiedProfile(item.profile),
      subject: {
        kind: COMPARATIVE_CLAIM_SUBJECT_KIND.EVIDENCE_ROOT,
        expectedMatrixId: item.expectedMatrixId,
      },
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.NOT_EVALUABLE,
      evidence: {
        state: COMPARATIVE_CLAIM_EVIDENCE_STATE.ABSENT,
        error: reason,
      },
      source: {state: COMPARATIVE_CLAIM_SOURCE_STATE.INVALID_ROOT},
      reasonCodes: [reasonCode],
      statement: `No current ${metric} claim for ${item.workloadId}: ` +
        `invalid evidence root (${reason}).`,
    }));
  }
  return rows;
}

function measuredRows(item, evaluatedAt) {
  assertBenchmarkResourceExactRecord(
    item,
    measuredKeys,
    localText.MEASURED_ITEM,
  );
  assertBenchmarkResourceText(item.workloadId, localText.MEASURED_WORKLOAD_ID);
  assertBenchmarkResourceText(
    item.expectedMatrixId,
    localText.MEASURED_EXPECTED_MATRIX_ID,
  );
  assertBenchmarkResourceExactRecord(
    item.profile,
    profileKeys,
    localText.MEASURED_PROFILE,
  );
  assertBenchmarkResourceText(item.profile.id, localText.MEASURED_PROFILE_ID);
  assertBenchmarkResourceDigest(
    item.profile.identity,
    localText.MEASURED_PROFILE_IDENTITY,
  );
  const inspection =
    inspectBenchmarkResourceClaimEvidenceRoot(item.rootReceipt);
  if (inspection.state !== BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.ACCEPTED) {
    return invalidRootRows(item, inspection.reason);
  }
  const evidence = inspection.evidence;
  if (evidence.matrixId !== item.expectedMatrixId) {
    return invalidRootRows(
      item,
      COMPARATIVE_CLAIM_REASON.MATRIX_ID_MISMATCH,
      COMPARATIVE_CLAIM_REASON.MATRIX_ID_MISMATCH,
    );
  }
  const rootReasons = rootCurrentness(evidence, evaluatedAt);
  const profileDecision = certificationDecision(
    item,
    evidence.rootDigest,
    evaluatedAt,
  );
  const rows = [];
  for (let index = 0; index < evidence.cells.length; index += 1) {
    const cell = evidence.cells[index];
    if (
      cell.measurement.state ===
        BENCHMARK_RESOURCE_CLAIM_MEASUREMENT_STATE.NON_MEASURING
    ) {
      appendArrayValues(
        rows,
        nonMeasuringRows(item, evidence, cell, rootReasons),
      );
      continue;
    }
    appendOwnArrayValue(rows, effectRow({
      item,
      evidence,
      cell,
      metric: COMPARATIVE_CLAIM_METRIC.CAPACITY,
      effect: cell.measurement.capacityEffect,
      rootReasons,
      metricReasons: emptyReasonCodes(),
      profileDecision,
    }));
    appendOwnArrayValue(rows, effectRow({
      item,
      evidence,
      cell,
      metric: COMPARATIVE_CLAIM_METRIC.COST,
      effect: cell.measurement.costEffect,
      rootReasons,
      metricReasons: priceCurrentness(evidence, evaluatedAt),
      profileDecision,
    }));
  }
  return rows;
}

function projectionFailureTable(evaluatedAt, error) {
  const message = safeErrorMessage(error);
  const row = createComparativeEfficiencyClaimRow({
    workloadId: 'claim-projection',
    metric: COMPARATIVE_CLAIM_METRIC.ANALYTICAL_OPPORTUNITY,
    profile: notApplicableProfile(),
    subject: {kind: COMPARATIVE_CLAIM_SUBJECT_KIND.EVIDENCE_ROOT},
    evidenceClass: COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.NOT_EVALUABLE,
    evidence: {state: COMPARATIVE_CLAIM_EVIDENCE_STATE.ABSENT, error: message},
    source: {state: COMPARATIVE_CLAIM_SOURCE_STATE.INVALID_ROOT},
    reasonCodes: [COMPARATIVE_CLAIM_REASON.EVIDENCE_INVALID],
    statement: `No claim table: ${message}.`,
  });
  return createComparativeEfficiencyClaimTable(
    typeof evaluatedAt === 'string' ? evaluatedAt : localText.INVALID,
    [row],
  );
}

export function projectComparativeEfficiencyClaims(input) {
  try {
    assertProjectionInput(input);
    const rows = [];
    for (let index = 0; index < input.analyticalEvidence.length; index += 1) {
      appendOwnArrayValue(rows, analyticalRow(input.analyticalEvidence[index]));
    }
    for (let index = 0; index < input.measuredEvidence.length; index += 1) {
      appendArrayValues(
        rows,
        measuredRows(input.measuredEvidence[index], input.evaluatedAt),
      );
    }
    return createComparativeEfficiencyClaimTable(input.evaluatedAt, rows);
  } catch (error) {
    let evaluatedAt;
    try {
      evaluatedAt = ownDataValue(input, localText.EVALUATED_AT);
      if (isMissingDataValue(evaluatedAt)) evaluatedAt = undefined;
    } catch {
      evaluatedAt = undefined;
    }
    return projectionFailureTable(evaluatedAt, error);
  }
}
