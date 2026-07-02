/**
 * Canonical service-message envelope validation.
 */

import {
  SERVICE_MESSAGE_FIELD,
  SERVICE_MESSAGE_REQUIRED_FIELDS,
} from '../constants/unified-service-lifecycle.js';
import {InvalidServiceMessageError} from './service-lifecycle-errors.js';

const LOCAL_STR_ENVELOPE_MUST_BE_AN_OBJECT = 'envelope must be an object';
const LOCAL_STR_SEMI_SPACE = '; ';

/**
 * Validate canonical service message envelope shape.
 *
 * @param {Object} envelope
 * @return {{valid: boolean, errors: string[]}}
 */
function validateServiceMessageEnvelope(envelope) {
  const errors = [];

  if (!envelope || typeof envelope !== 'object') {
    return {
      valid: false,
      errors: [LOCAL_STR_ENVELOPE_MUST_BE_AN_OBJECT],
    };
  }

  for (const fieldName of SERVICE_MESSAGE_REQUIRED_FIELDS) {
    if (!(fieldName in envelope)) {
      errors.push(`missing required field '${fieldName}'`);
    }
  }

  if (envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== 'string') {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.MESSAGE_ID}' must be a string`);
  }

  if (envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== 'string') {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.SERVICE_ID}' must be a string`);
  }

  if (envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== undefined &&
    typeof envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== 'string') {
    errors.push(`field '${SERVICE_MESSAGE_FIELD.OPERATION}' must be a string`);
  }

  return {
    valid: errors.length === 0,
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
      validation.errors.join(LOCAL_STR_SEMI_SPACE),
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
