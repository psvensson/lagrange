/**
 * Canonical service-message envelope validation.
 */

import {TYPEOF} from '../constants/types.js';
import {
  SERVICE_MESSAGE_FIELD,
  SERVICE_MESSAGE_REQUIRED_FIELDS,
} from '../constants/unified-service-lifecycle.js';
import {InvalidServiceMessageError} from './service-lifecycle-errors.js';

const LOCAL_STR_1XPH1 = 'envelope must be an object';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1AM9G = '; ';

/**
 * Validate canonical service message envelope shape.
 *
 * @param {Object} envelope
 * @return {{valid: boolean, errors: string[]}}
 */
function validateServiceMessageEnvelope(envelope) {
  const errors = [];

  if (!envelope || typeof envelope !== TYPEOF.OBJECT) {
    return {
      valid: false,
      errors: [LOCAL_STR_1XPH1],
    };
  }

  for (const fieldName of SERVICE_MESSAGE_REQUIRED_FIELDS) {
    if (!(fieldName in envelope)) {
      errors.push(`missing required field '${fieldName}'`);
    }
  }

  if (envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== TYPEOF.STRING) {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.MESSAGE_ID}' must be a string`);
  }

  if (envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== TYPEOF.STRING) {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.SERVICE_ID}' must be a string`);
  }

  if (envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== TYPEOF.STRING) {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.OPERATION}' must be a string`);
  }

  return {
    valid: errors.length === LOCAL_NUM_ZERO,
    errors,
  };
}

/**
 * Assert canonical envelope validity and throw a typed error on failure.
 *
 * @param {Object} envelope
 * @return {Object}
 */
function assertServiceMessageEnvelope(envelope) {
  const validation = validateServiceMessageEnvelope(envelope);
  if (!validation.valid) {
    throw new InvalidServiceMessageError(
      validation.errors.join(LOCAL_STR_1AM9G),
      {
        errors: validation.errors,
      },
    );
  }
  return envelope;
}

export {
  validateServiceMessageEnvelope,
  assertServiceMessageEnvelope,
};
