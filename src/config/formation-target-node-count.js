// The declared formation size (owner ruling 2026-11-11, decision D1(a) of
// solve/epics/operation-integrity-and-reliable-formation/
// formation-admission-design-2026-11-11.md): the intended total node count
// of the cluster a seed founds, given once to the node that takes the
// FRESH_SEED decision. There is no default. An undeclared size is the named
// UNDECLARED state, and a node founding a cluster refuses it typed; a value
// that is present but not a positive integer is refused at configuration
// validation. Single-node development declares an explicit 1.
//
// This module owns the configuration side only (key, environment variable,
// validation, the founding requirement). The durable record the seed writes
// once, and its read contract, are owned by
// src/bootstrap/formation-target-record.js.
import {CONFIG_KEY} from './config-key-constants.js';

const FORMATION_TARGET_NODE_COUNT_ENV = 'LAGRANGE_FORMATION_TARGET_NODE_COUNT';

const FORMATION_TARGET_DECLARATION_STATE = Object.freeze({
  DECLARED: 'DECLARED',
  UNDECLARED: 'UNDECLARED',
});

// Typed configuration refusals. Each names the environment variable and the
// configuration key, so an operator can repair the declaration directly.
const FORMATION_TARGET_CONFIG_ERROR_CODE = Object.freeze({
  INVALID: 'CONFIG_FORMATION_TARGET_NODE_COUNT_INVALID',
  REQUIRED: 'CONFIG_FORMATION_TARGET_NODE_COUNT_REQUIRED',
});

const FORMATION_TARGET_CONFIG_ERROR_MSG = Object.freeze({
  INVALID: 'must be a positive integer (the intended total node count of ' +
    'the cluster being formed)',
  REQUIRED: 'is required on a node that founds a new cluster (FRESH_SEED): ' +
    'declare the intended total node count of the cluster being formed ' +
    '(1 for a single-node cluster)',
});

// Decimal digits without sign, exponent, fraction or leading zero.
const POSITIVE_DECIMAL_INTEGER = /^[1-9][0-9]*$/u;

function formationTargetConfigError(code, message, value) {
  const error = new Error(`${FORMATION_TARGET_NODE_COUNT_ENV} ` +
    `(${CONFIG_KEY.FORMATION_TARGET_NODE_COUNT}) ${message}`);
  error.code = code;
  error.variable = FORMATION_TARGET_NODE_COUNT_ENV;
  error.configKey = CONFIG_KEY.FORMATION_TARGET_NODE_COUNT;
  error.value = value;
  return Object.freeze(error);
}

function invalidFormationTarget(value) {
  return formationTargetConfigError(FORMATION_TARGET_CONFIG_ERROR_CODE.INVALID,
    FORMATION_TARGET_CONFIG_ERROR_MSG.INVALID, value);
}

/**
 * Parse the environment text of the declaration. Only a positive decimal
 * integer is accepted; empty text, signs, fractions and exponents are refused.
 * @param {string} text Raw environment value.
 * @return {number} The declared count.
 */
function parseFormationTargetNodeCountEnv(text) {
  const count = POSITIVE_DECIMAL_INTEGER.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(count)) throw invalidFormationTarget(text);
  return count;
}

/**
 * Classify a configured value. Absence is the named UNDECLARED state (never a
 * number); a present value is DECLARED only as a positive safe integer and is
 * otherwise refused typed.
 * @param {*} value The value at formation.targetNodeCount.
 * @return {{state: string, count: (number|undefined)}} Frozen declaration.
 */
function declareFormationTarget(value) {
  if (value === undefined) {
    return Object.freeze({state: FORMATION_TARGET_DECLARATION_STATE.UNDECLARED});
  }
  if (!Number.isSafeInteger(value) || value < 1) throw invalidFormationTarget(value);
  return Object.freeze({state: FORMATION_TARGET_DECLARATION_STATE.DECLARED, count: value});
}

/**
 * The founding requirement: a node that takes the FRESH_SEED decision must
 * carry a DECLARED size. Anything else is the typed REQUIRED refusal.
 * @param {Object|null|undefined} declaration A declareFormationTarget result.
 * @return {number} The declared count.
 */
function requireDeclaredFormationTarget(declaration) {
  if (declaration?.state === FORMATION_TARGET_DECLARATION_STATE.DECLARED) {
    return declaration.count;
  }
  throw formationTargetConfigError(FORMATION_TARGET_CONFIG_ERROR_CODE.REQUIRED,
    FORMATION_TARGET_CONFIG_ERROR_MSG.REQUIRED, undefined);
}

export {
  FORMATION_TARGET_CONFIG_ERROR_CODE,
  FORMATION_TARGET_DECLARATION_STATE,
  FORMATION_TARGET_NODE_COUNT_ENV,
  declareFormationTarget,
  parseFormationTargetNodeCountEnv,
  requireDeclaredFormationTarget,
};
