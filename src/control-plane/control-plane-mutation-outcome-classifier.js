import {types as nodeUtilTypes} from 'node:util';

import {
  CONTROL_PLANE_MUTATION_OUTCOME,
} from './control-plane-system-table-gateway-constants.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from './control-plane-system-table-visibility-constants.js';
import {PRESSURE_GOVERNOR_ACTION} from './pressure-governor.js';

const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectPrototype = Object.prototype;
const numberIsSafeInteger = Number.isSafeInteger;
const utilIsProxy = nodeUtilTypes.isProxy;
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';
const EMPTY_NORMALIZED_TEXT = '';
const AFFECTED_ROWS_PROPERTY = 'affectedRows';

function freezeEffect(
  outcome,
  applied,
  accepted,
  deferred,
  retryable,
  terminal,
) {
  const effect = objectCreate(null);
  effect.outcome = outcome;
  effect.known = true;
  effect.applied = applied;
  effect.accepted = accepted;
  effect.deferred = deferred;
  effect.retryable = retryable;
  effect.terminal = terminal;
  return objectFreeze(effect);
}

const CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION = objectCreate(null);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.APPLIED
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
  true,
  true,
  false,
  false,
  false,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.NO_OP
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
  false,
  true,
  false,
  true,
  false,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
  true,
  true,
  true,
  true,
  false,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
  false,
  true,
  true,
  true,
  false,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.REJECTED
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
  false,
  false,
  false,
  false,
  true,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
  false,
  true,
  true,
  true,
  false,
);
CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[
  CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED
] = freezeEffect(
  CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
  false,
  true,
  false,
  true,
  false,
);
objectFreeze(CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION);

const UNKNOWN_CLASSIFICATION = objectCreate(null);
UNKNOWN_CLASSIFICATION.outcome = EMPTY_NORMALIZED_TEXT;
UNKNOWN_CLASSIFICATION.known = false;
UNKNOWN_CLASSIFICATION.applied = false;
UNKNOWN_CLASSIFICATION.accepted = false;
UNKNOWN_CLASSIFICATION.deferred = false;
UNKNOWN_CLASSIFICATION.retryable = false;
UNKNOWN_CLASSIFICATION.terminal = false;
objectFreeze(UNKNOWN_CLASSIFICATION);

function isPlainDataRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  try {
    if (utilIsProxy(value)) return false;
    const prototype = objectGetPrototypeOf(value);
    return prototype === objectPrototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnDataProperty(target, property) {
  let descriptor;
  try {
    descriptor = objectGetOwnPropertyDescriptor(target, property);
  } catch {
    return {present: true, valid: false, value: undefined};
  }
  if (!descriptor) {
    return {present: false, valid: true, value: undefined};
  }
  if (!objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY)) {
    return {present: true, valid: false, value: undefined};
  }
  return {present: true, valid: true, value: descriptor.value};
}

function normalizeOptionalString(property, allowedValues) {
  if (!property.valid) {
    return {present: false, valid: false, value: EMPTY_NORMALIZED_TEXT};
  }
  if (!property.present || property.value === null ||
    typeof property.value === 'undefined') {
    return {present: false, valid: true, value: EMPTY_NORMALIZED_TEXT};
  }
  if (typeof property.value !== 'string' ||
    (allowedValues && !allowedValues(property.value))) {
    return {present: false, valid: false, value: EMPTY_NORMALIZED_TEXT};
  }
  return {
    present: property.value.length > 0,
    valid: true,
    value: property.value,
  };
}

function isKnownVisibilityState(value) {
  return value === CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE ||
    value ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
    value === CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
      .AUTHORITATIVE_CONFIRMATION_PENDING ||
    value ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE;
}

function isKnownPressureAction(value) {
  return value === PRESSURE_GOVERNOR_ACTION.ALLOW ||
    value === PRESSURE_GOVERNOR_ACTION.DEFER ||
    value === PRESSURE_GOVERNOR_ACTION.REJECT;
}

function normalizeAffectedRows(result, partitionResultProperty) {
  let partitionAffectedRows = {
    present: false,
    valid: true,
    value: 0,
  };
  if (partitionResultProperty.present &&
    partitionResultProperty.value !== null &&
    typeof partitionResultProperty.value !== 'undefined') {
    if (!isPlainDataRecord(partitionResultProperty.value)) {
      return {present: true, valid: false, value: 0};
    }
    partitionAffectedRows = readOwnDataProperty(
      partitionResultProperty.value,
      AFFECTED_ROWS_PROPERTY,
    );
    if (!partitionAffectedRows.valid) {
      return {present: true, valid: false, value: 0};
    }
  }

  const topLevelAffectedRows = readOwnDataProperty(
    result,
    AFFECTED_ROWS_PROPERTY,
  );
  if (!topLevelAffectedRows.valid) {
    return {present: true, valid: false, value: 0};
  }
  const selected = partitionAffectedRows.present ?
    partitionAffectedRows :
    topLevelAffectedRows;
  if (!selected.present) {
    return {present: false, valid: true, value: 0};
  }
  const valid = typeof selected.value === 'number' &&
    numberIsSafeInteger(selected.value) &&
    selected.value >= 0 &&
    !objectIs(selected.value, -0);
  return {present: true, valid, value: valid ? selected.value : 0};
}

function freezeNormalizedView({
  effect,
  valid,
  failed,
  applied,
  affectedRows,
  completionState,
  visibilityState,
  pressureAction,
}) {
  const view = objectCreate(null);
  view.outcome = effect.outcome;
  view.known = valid && effect.known;
  view.valid = valid;
  view.failed = valid && failed;
  view.applied = valid && applied;
  view.accepted = valid && effect.accepted;
  view.deferred = valid && effect.deferred;
  view.retryable = valid && effect.retryable;
  view.terminal = valid && effect.terminal;
  view.affectedRows = affectedRows.value;
  view.affectedRowsPresent = affectedRows.present;
  view.affectedRowsValid = affectedRows.valid;
  view.zeroAffectedRows = valid && affectedRows.present &&
    affectedRows.value === 0;
  view.completionState = completionState.value;
  view.completionStatePresent = completionState.present;
  view.visibilityState = visibilityState.value;
  view.visibilityStatePresent = visibilityState.present;
  view.visibilityPending = visibilityState.present &&
    visibilityState.value !==
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE;
  view.pressureAction = pressureAction.value;
  view.pressureActionPresent = pressureAction.present;
  return objectFreeze(view);
}

function classifyControlPlaneMutationResult(result) {
  if (!isPlainDataRecord(result)) {
    return freezeNormalizedView({
      effect: UNKNOWN_CLASSIFICATION,
      valid: false,
      failed: false,
      applied: false,
      affectedRows: {present: false, valid: false, value: 0},
      completionState: {
        present: false,
        valid: false,
        value: EMPTY_NORMALIZED_TEXT,
      },
      visibilityState: {
        present: false,
        valid: false,
        value: EMPTY_NORMALIZED_TEXT,
      },
      pressureAction: {
        present: false,
        valid: false,
        value: EMPTY_NORMALIZED_TEXT,
      },
    });
  }

  const outcomeProperty = readOwnDataProperty(result, 'outcome');
  const successProperty = readOwnDataProperty(result, 'success');
  const partitionResultProperty = readOwnDataProperty(result, 'partitionResult');
  const completionState = normalizeOptionalString(
    readOwnDataProperty(result, 'completionState'),
  );
  const visibilityState = normalizeOptionalString(
    readOwnDataProperty(result, 'visibilityState'),
    isKnownVisibilityState,
  );
  const pressureAction = normalizeOptionalString(
    readOwnDataProperty(result, 'pressureAction'),
    isKnownPressureAction,
  );
  const affectedRows = normalizeAffectedRows(result, partitionResultProperty);

  const outcomeIsAbsent = outcomeProperty.valid &&
    (!outcomeProperty.present || outcomeProperty.value === null ||
      typeof outcomeProperty.value === 'undefined');
  const outcomeIsKnown = outcomeProperty.valid &&
    outcomeProperty.present &&
    typeof outcomeProperty.value === 'string' &&
    objectHasOwn(
      CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION,
      outcomeProperty.value,
    );
  const effect = outcomeIsKnown ?
    CONTROL_PLANE_MUTATION_OUTCOME_CLASSIFICATION[outcomeProperty.value] :
    UNKNOWN_CLASSIFICATION;
  const successIsAbsent = successProperty.valid &&
    !successProperty.present;
  const successIsBoolean = successProperty.valid &&
    successProperty.present &&
    typeof successProperty.value === 'boolean';
  const valid = partitionResultProperty.valid &&
    (outcomeIsAbsent || outcomeIsKnown) &&
    (successIsAbsent || successIsBoolean) &&
    affectedRows.valid &&
    completionState.valid &&
    visibilityState.valid &&
    pressureAction.valid;
  const failed = successIsBoolean && successProperty.value === false;
  let applied = false;
  if (valid && !failed) {
    if (outcomeIsKnown) {
      applied = effect.applied &&
        (!affectedRows.present || affectedRows.value > 0);
    } else {
      applied = affectedRows.present ? affectedRows.value > 0 : true;
    }
  }

  return freezeNormalizedView({
    effect,
    valid,
    failed,
    applied,
    affectedRows,
    completionState,
    visibilityState,
    pressureAction,
  });
}

export {classifyControlPlaneMutationResult};
