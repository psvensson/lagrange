/**
 * Guest-safe SQL statement authoring: a template tag producing frozen
 * statement descriptors. Interpolation values are rejected outright with
 * a typed authoring error until a parameterized meaning is defined —
 * statement text is never assembled by string splicing.
 */
import {AUTHORING_DESCRIPTOR_KIND, deepFreeze} from './define-service.js';

const SQL_INTERPOLATION_MESSAGE =
  'sql template interpolations are not supported; write literal SQL text';
const AUTHORING_ERROR_NAME = 'AuthoringError';

class AuthoringError extends Error {
  constructor(message) {
    super(message);
    this.name = AUTHORING_ERROR_NAME;
  }
}

function sql(strings, ...values) {
  if (!Array.isArray(strings)) {
    throw new AuthoringError(SQL_INTERPOLATION_MESSAGE);
  }
  if (values.length > 0) {
    throw new AuthoringError(SQL_INTERPOLATION_MESSAGE);
  }
  return deepFreeze({
    kind: AUTHORING_DESCRIPTOR_KIND.SQL_STATEMENT,
    text: strings.join(''),
  });
}

export {AuthoringError, sql};
