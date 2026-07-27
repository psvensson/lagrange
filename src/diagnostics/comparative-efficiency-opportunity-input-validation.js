import {
  OPPORTUNITY_CALCULATOR_FORMULA_VERSION,
  OPPORTUNITY_CALCULATOR_SCHEMA_VERSION,
  OPPORTUNITY_CALIBRATION_STATE,
  OPPORTUNITY_QUANTITY_UNITS,
  OPPORTUNITY_UNCERTAINTY_CLASSES,
} from './comparative-efficiency-opportunity-constants.js';
import {
  appendOwnArrayValue,
  isDenseDataArray,
  isNonEmptyText,
  isRecord,
  isSha256Digest,
} from './comparative-efficiency-opportunity-input-integrity.js';

const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const MAX_SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const MISSING_VALUE = Symbol('missing_value');

const TOP_LEVEL_FIELDS = objectFreeze({
  assumptions: true,
  calibration: true,
  fixtureId: true,
  formulaVersion: true,
  quantities: true,
  schemaVersion: true,
  uncertainty: true,
});
const QUANTITY_VALUE_FIELDS = objectFreeze({
  unit: 'unit',
  value: 'value',
});
const CALIBRATION_FIELDS = objectFreeze({
  artifactDigest: true,
  measuredCpuSecondsPerOperation: true,
  measuredNetworkBytesPerOperation: true,
  state: true,
});
const CALIBRATION_QUANTITY_UNITS = objectFreeze({
  measuredCpuSecondsPerOperation: 'cpu_second/operation',
  measuredNetworkBytesPerOperation: 'byte/operation',
});
const FRACTION_FIELDS = objectFreeze({
  rebuildFraction: true,
  remoteFraction: true,
  reuseRate: true,
  shuffleFraction: true,
});
const POSITIVE_FIELDS = objectFreeze({
  correctOperations: true,
  cpuCoresPerNode: true,
  highMultiplier: true,
  ioBlockBytes: true,
  lowMultiplier: true,
  memoryBytesPerNode: true,
  minimumNodes: true,
  operationRate: true,
  replicationFactor: true,
  storageBytesPerNode: true,
});
const INTEGER_FIELDS = objectFreeze({
  correctOperations: true,
  minimumNodes: true,
  replicationFactor: true,
});
const ROOT_FIELD = objectFreeze({
  ASSUMPTIONS: 'assumptions',
  CALIBRATION: 'calibration',
  FIXTURE_ID: 'fixtureId',
  FORMULA_VERSION: 'formulaVersion',
  INPUT: 'input',
  QUANTITIES: 'quantities',
  SCHEMA_VERSION: 'schemaVersion',
  UNCERTAINTY: 'uncertainty',
});
const QUANTITY_FIELD = objectFreeze({
  HEADROOM_FRACTION: 'headroomFraction',
  HIGH_MULTIPLIER: 'highMultiplier',
  LOW_MULTIPLIER: 'lowMultiplier',
});
const CALIBRATION_FIELD = objectFreeze({
  ARTIFACT_DIGEST: 'artifactDigest',
  STATE: 'state',
});
const VALIDATION_ERROR = objectFreeze({
  ASSUMPTIONS_REQUIRED: 'assumptions:non_empty_array_required',
  CALIBRATION_DIGEST_REQUIRED:
    'calibration.artifactDigest:sha256_required',
  CALIBRATION_OBJECT_REQUIRED: 'calibration:object_required',
  CALIBRATION_STATE_UNSUPPORTED: 'calibration.state:unsupported',
  FIXTURE_ID_REQUIRED: 'fixtureId:required',
  FORMULA_VERSION_UNSUPPORTED: 'formulaVersion:unsupported',
  HEADROOM_RANGE:
    'quantities.headroomFraction:must_be_less_than_one',
  HIGH_MULTIPLIER_RANGE:
    'quantities.highMultiplier:must_be_at_least_one',
  INPUT_OBJECT_REQUIRED: 'input:object_required',
  LOW_MULTIPLIER_RANGE:
    'quantities.lowMultiplier:must_not_exceed_one',
  QUANTITIES_OBJECT_REQUIRED: 'quantities:object_required',
  SCHEMA_VERSION_UNSUPPORTED: 'schemaVersion:unsupported',
  SENSITIVITY_REVERSED: 'quantities.sensitivity:reversed',
  UNCERTAINTY_UNSUPPORTED: 'uncertainty:unsupported',
});
const FORBIDDEN_ABSENT_CALIBRATION_FIELDS = objectFreeze([
  CALIBRATION_FIELD.ARTIFACT_DIGEST,
  'measuredNetworkBytesPerOperation',
  'measuredCpuSecondsPerOperation',
]);

function ownValue(record, field) {
  return objectHasOwn(record, field) ? record[field] : MISSING_VALUE;
}

function pushIf(errors, condition, code) {
  if (condition) appendOwnArrayValue(errors, code);
}

function rejectUnsupportedFields(errors, value, supported, path) {
  const fields = objectKeys(value);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    pushIf(
      errors,
      !objectHasOwn(supported, field),
      `${path}.${field}:unsupported`,
    );
  }
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' &&
    numberIsFinite(value) &&
    value >= 0 &&
    !objectIs(value, -0);
}

function isSafeMagnitude(value) {
  return value <= MAX_SAFE_MAGNITUDE;
}

function validateIntegerPolicy(errors, field, quantityValue) {
  if (!objectHasOwn(INTEGER_FIELDS, field)) return;
  pushIf(
    errors,
    !numberIsInteger(quantityValue),
    `quantities.${field}:integer_required`,
  );
  pushIf(
    errors,
    numberIsInteger(quantityValue) && !numberIsSafeInteger(quantityValue),
    `quantities.${field}:safe_integer_required`,
  );
}

function validateQuantityPolicy(errors, field, quantityValue) {
  pushIf(
    errors,
    !isSafeMagnitude(quantityValue),
    `quantities.${field}:safe_number_required`,
  );
  pushIf(
    errors,
    objectHasOwn(POSITIVE_FIELDS, field) && quantityValue <= 0,
    `quantities.${field}:positive_number_required`,
  );
  pushIf(
    errors,
    objectHasOwn(FRACTION_FIELDS, field) && quantityValue > 1,
    `quantities.${field}:fraction_required`,
  );
  pushIf(
    errors,
    field === QUANTITY_FIELD.HEADROOM_FRACTION && quantityValue >= 1,
    VALIDATION_ERROR.HEADROOM_RANGE,
  );
  validateIntegerPolicy(errors, field, quantityValue);
}

function validateQuantity(errors, quantities, field) {
  const quantity = ownValue(quantities, field);
  pushIf(errors, !isRecord(quantity), `quantities.${field}:object_required`);
  if (!isRecord(quantity)) return;
  rejectUnsupportedFields(
    errors,
    quantity,
    QUANTITY_VALUE_FIELDS,
    `quantities.${field}`,
  );
  const quantityValue = ownValue(quantity, QUANTITY_VALUE_FIELDS.value);
  pushIf(
    errors,
    ownValue(quantity, QUANTITY_VALUE_FIELDS.unit) !==
      OPPORTUNITY_QUANTITY_UNITS[field],
    `quantities.${field}:expected_unit:${OPPORTUNITY_QUANTITY_UNITS[field]}`,
  );
  pushIf(
    errors,
    !isNonNegativeNumber(quantityValue),
    `quantities.${field}:non_negative_number_required`,
  );
  if (isNonNegativeNumber(quantityValue)) {
    validateQuantityPolicy(errors, field, quantityValue);
  }
}

function validateAbsentCalibration(errors, calibration) {
  for (
    let index = 0;
    index < FORBIDDEN_ABSENT_CALIBRATION_FIELDS.length;
    index += 1
  ) {
    const field = FORBIDDEN_ABSENT_CALIBRATION_FIELDS[index];
    pushIf(
      errors,
      objectHasOwn(calibration, field),
      `calibration.${field}:forbidden_when_absent`,
    );
  }
}

function validateMeasuredCalibrationQuantity(
  errors,
  calibration,
  field,
  unit,
) {
  const quantity = ownValue(calibration, field);
  pushIf(errors, !isRecord(quantity), `calibration.${field}:object_required`);
  if (!isRecord(quantity)) return;
  rejectUnsupportedFields(
    errors,
    quantity,
    QUANTITY_VALUE_FIELDS,
    `calibration.${field}`,
  );
  const quantityValue = ownValue(quantity, QUANTITY_VALUE_FIELDS.value);
  pushIf(
    errors,
    ownValue(quantity, QUANTITY_VALUE_FIELDS.unit) !== unit,
    `calibration.${field}:expected_unit:${unit}`,
  );
  pushIf(
    errors,
    !isNonNegativeNumber(quantityValue),
    `calibration.${field}:non_negative_number_required`,
  );
  if (!isNonNegativeNumber(quantityValue)) return;
  pushIf(
    errors,
    quantityValue <= 0,
    `calibration.${field}:positive_number_required`,
  );
  pushIf(
    errors,
    !isSafeMagnitude(quantityValue),
    `calibration.${field}:safe_number_required`,
  );
}

function validateMeasuredCalibration(errors, calibration) {
  const artifactDigest = ownValue(
    calibration,
    CALIBRATION_FIELD.ARTIFACT_DIGEST,
  );
  pushIf(
    errors,
    !isSha256Digest(artifactDigest),
    VALIDATION_ERROR.CALIBRATION_DIGEST_REQUIRED,
  );
  const fields = objectKeys(CALIBRATION_QUANTITY_UNITS);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    validateMeasuredCalibrationQuantity(
      errors,
      calibration,
      field,
      CALIBRATION_QUANTITY_UNITS[field],
    );
  }
}

function validateCalibration(errors, calibration) {
  pushIf(
    errors,
    !isRecord(calibration),
    VALIDATION_ERROR.CALIBRATION_OBJECT_REQUIRED,
  );
  if (!isRecord(calibration)) return;
  rejectUnsupportedFields(
    errors,
    calibration,
    CALIBRATION_FIELDS,
    ROOT_FIELD.CALIBRATION,
  );
  const state = ownValue(calibration, CALIBRATION_FIELD.STATE);
  const supported =
    state === OPPORTUNITY_CALIBRATION_STATE.ABSENT ||
    state === OPPORTUNITY_CALIBRATION_STATE.MEASURED;
  pushIf(errors, !supported, VALIDATION_ERROR.CALIBRATION_STATE_UNSUPPORTED);
  if (state === OPPORTUNITY_CALIBRATION_STATE.ABSENT) {
    validateAbsentCalibration(errors, calibration);
  }
  if (state === OPPORTUNITY_CALIBRATION_STATE.MEASURED) {
    validateMeasuredCalibration(errors, calibration);
  }
}

function validateRootMetadata(errors, input) {
  pushIf(
    errors,
    ownValue(input, ROOT_FIELD.SCHEMA_VERSION) !==
      OPPORTUNITY_CALCULATOR_SCHEMA_VERSION,
    VALIDATION_ERROR.SCHEMA_VERSION_UNSUPPORTED,
  );
  pushIf(
    errors,
    ownValue(input, ROOT_FIELD.FORMULA_VERSION) !==
      OPPORTUNITY_CALCULATOR_FORMULA_VERSION,
    VALIDATION_ERROR.FORMULA_VERSION_UNSUPPORTED,
  );
  pushIf(
    errors,
    !isNonEmptyText(ownValue(input, ROOT_FIELD.FIXTURE_ID)),
    VALIDATION_ERROR.FIXTURE_ID_REQUIRED,
  );
  const uncertainty = ownValue(input, ROOT_FIELD.UNCERTAINTY);
  pushIf(
    errors,
    typeof uncertainty !== 'string' ||
      !objectHasOwn(OPPORTUNITY_UNCERTAINTY_CLASSES, uncertainty),
    VALIDATION_ERROR.UNCERTAINTY_UNSUPPORTED,
  );
}

function validateAssumptions(errors, assumptions) {
  const dense = isDenseDataArray(assumptions);
  pushIf(
    errors,
    !dense || assumptions.length === 0,
    VALIDATION_ERROR.ASSUMPTIONS_REQUIRED,
  );
  if (!dense) return;
  for (let index = 0; index < assumptions.length; index += 1) {
    pushIf(
      errors,
      !isNonEmptyText(assumptions[index]),
      `assumptions.${index}:non_empty_text_required`,
    );
  }
}

function quantityNumber(quantities, field) {
  const quantity = ownValue(quantities, field);
  return isRecord(quantity) ?
    ownValue(quantity, QUANTITY_VALUE_FIELDS.value) :
    MISSING_VALUE;
}

function validateSensitivity(errors, quantities) {
  const low = quantityNumber(quantities, QUANTITY_FIELD.LOW_MULTIPLIER);
  const high = quantityNumber(quantities, QUANTITY_FIELD.HIGH_MULTIPLIER);
  if (isNonNegativeNumber(low)) {
    pushIf(errors, low > 1, VALIDATION_ERROR.LOW_MULTIPLIER_RANGE);
  }
  if (isNonNegativeNumber(high)) {
    pushIf(errors, high < 1, VALIDATION_ERROR.HIGH_MULTIPLIER_RANGE);
  }
  pushIf(
    errors,
    isNonNegativeNumber(low) &&
      isNonNegativeNumber(high) &&
      low > high,
    VALIDATION_ERROR.SENSITIVITY_REVERSED,
  );
}

function validateQuantities(errors, quantities) {
  pushIf(
    errors,
    !isRecord(quantities),
    VALIDATION_ERROR.QUANTITIES_OBJECT_REQUIRED,
  );
  if (!isRecord(quantities)) return;
  rejectUnsupportedFields(
    errors,
    quantities,
    OPPORTUNITY_QUANTITY_UNITS,
    ROOT_FIELD.QUANTITIES,
  );
  const fields = objectKeys(OPPORTUNITY_QUANTITY_UNITS);
  for (let index = 0; index < fields.length; index += 1) {
    validateQuantity(errors, quantities, fields[index]);
  }
  validateSensitivity(errors, quantities);
}

export function validateOpportunityCalculatorInput(input) {
  const errors = [];
  pushIf(errors, !isRecord(input), VALIDATION_ERROR.INPUT_OBJECT_REQUIRED);
  if (!isRecord(input)) return {valid: false, errors};
  rejectUnsupportedFields(errors, input, TOP_LEVEL_FIELDS, ROOT_FIELD.INPUT);
  validateRootMetadata(errors, input);
  validateAssumptions(errors, ownValue(input, ROOT_FIELD.ASSUMPTIONS));
  validateQuantities(errors, ownValue(input, ROOT_FIELD.QUANTITIES));
  validateCalibration(errors, ownValue(input, ROOT_FIELD.CALIBRATION));
  return {valid: errors.length === 0, errors};
}
