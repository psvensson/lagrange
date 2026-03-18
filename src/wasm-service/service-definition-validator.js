import {NUM, TYPEOF, SERVICE_PROFILE} from '../constants/index.js';
import {RUNTIME_KIND} from '../constants/runtime.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {ControlPlaneSystemTableGateway} from '../control-plane/control-plane-system-table-gateway.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_ERROR_MSG,
} from './wasm-service-constants.js';
import {RB_FIELD} from './wasm-service-models.js';
import {validateRuntimeDescriptor} from './runtime-descriptor-validator.js';

/**
 * SQL query to check if a handler function exists in the code table.
 * @type {string}
 */
const SQL_CHECK_HANDLER =
  'SELECT function_id FROM code WHERE function_id = ?';

/**
 * Set of valid read consistency mode values.
 * @type {Set<string>}
 */
const VALID_READ_MODES = new Set(
  Object.values(READ_CONSISTENCY_MODE),
);

/**
 * Set of valid write consistency mode values.
 * @type {Set<string>}
 */
const VALID_WRITE_MODES = new Set(
  Object.values(WRITE_CONSISTENCY_MODE),
);

/**
 * All resource budget field names that must be non-negative numbers.
 * @type {string[]}
 */
const BUDGET_FIELDS = [
  RB_FIELD.CPU_TIME_LIMIT_MS,
  RB_FIELD.MEMORY_LIMIT_BYTES,
  RB_FIELD.SESSION_SIZE_LIMIT_BYTES,
  RB_FIELD.SERVICE_SIZE_LIMIT_BYTES,
];

/**
 * Validates service definitions before creation.
 * Checks handler function existence, replica count, consistency
 * modes, and resource budget values.
 */
class ServiceDefinitionValidator {
  /**
   * @param {Object} options - Validator options.
   * @param {Object} options.sqlQueryEngine - SQL query engine
   *   for querying the code table.
   */
  constructor({sqlQueryEngine}) {
    this.sqlQueryEngine = sqlQueryEngine;
    this.controlPlaneSystemTableGateway = null;
  }

  /**
   * Validate a service definition.
   * @param {Object} definition - ServiceDefinition object.
   * @return {Promise<{valid: boolean, errors: string[]}>}
   *   Validation result with any error messages.
   */
  async validate(definition) {
    const errors = [];

    const runtimeKind = definition.runtimeKind ??
      definition.runtime_kind ??
      null;
    const runtimeRef = definition.runtimeRef ??
      definition.runtime_ref ??
      null;
    const runtimeConfig = definition.runtimeConfig ??
      definition.runtime_config ??
      null;

    if (runtimeKind !== null) {
      const descriptorResult = validateRuntimeDescriptor({
        runtimeKind,
        runtimeRef,
        runtimeConfig,
      });
      if (!descriptorResult.valid) {
        errors.push(...descriptorResult.errors);
      }
    }

    if (this.shouldValidateHandler(definition, runtimeKind)) {
      const handlerId = definition.handlerFunctionId ||
        (runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
          runtimeRef :
          null);
      await this._validateHandlerFunction(handlerId, errors);
    }
    this._validateReplicaCount(definition.replicaCount, errors);
    this._validateConsistencyModes(definition, errors);
    this._validateResourceBudget(
      definition.resourceBudget, errors,
    );

    return {
      valid: errors.length === NUM.ZERO,
      errors,
    };
  }

  /**
   * Determine whether handler existence must be validated.
   * @param {Object} definition - ServiceDefinition object.
   * @param {string|null} runtimeKind - Runtime kind value.
   * @return {boolean} True when handler lookup is required.
   * @private
   */
  shouldValidateHandler(definition, runtimeKind) {
    if (definition.serviceProfile === SERVICE_PROFILE.SQL_ENGINE) {
      return false;
    }
    if (runtimeKind === null) {
      return true;
    }
    return runtimeKind === RUNTIME_KIND.WASM_COMPONENT;
  }

  /**
   * Check that the handler function exists in the code table.
   * @param {string} handlerFunctionId - Function ID to check.
   * @param {string[]} errors - Errors array to append to.
   * @return {Promise<void>}
   * @private
   */
  async _validateHandlerFunction(handlerFunctionId, errors) {
    if (!handlerFunctionId) {
      errors.push(
        WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
      );
      return;
    }
    const result = await this.getControlPlaneSystemTableGateway().readRows(
      SYSTEM_TABLE_NAME.CODE,
      SQL_CHECK_HANDLER,
      [handlerFunctionId],
    );
    if (!result.rows || result.rows.length === NUM.ZERO) {
      errors.push(
        WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
      );
    }
  }

  /**
   * Check that replica count is an odd number >= 3.
   * @param {number} replicaCount - Replica count to validate.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateReplicaCount(replicaCount, errors) {
    const isOdd = replicaCount % NUM.TWO !== NUM.ZERO;
    const isAtLeastThree = replicaCount >= NUM.THREE;
    if (!isOdd || !isAtLeastThree) {
      errors.push(
        WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED,
      );
    }
  }

  /**
   * Check that read and write consistency modes are valid.
   * @param {Object} definition - ServiceDefinition object.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateConsistencyModes(definition, errors) {
    if (!VALID_READ_MODES.has(definition.readConsistency)) {
      errors.push(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      );
    }
    if (!VALID_WRITE_MODES.has(definition.writeConsistency)) {
      errors.push(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      );
    }
  }

  /**
   * Check that all resource budget values are non-negative numbers.
   * @param {Object} budget - ResourceBudget object.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateResourceBudget(budget, errors) {
    if (!budget) {
      return;
    }
    for (const field of BUDGET_FIELDS) {
      const value = budget[field];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value !== TYPEOF.NUMBER || value < NUM.ZERO) {
        errors.push(
          `Resource budget field '${field}' must be a ` +
          'non-negative number',
        );
      }
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      if (!this.controlPlaneSystemTableGateway.sqlQueryEngine &&
          this.sqlQueryEngine) {
        this.controlPlaneSystemTableGateway.setSqlQueryEngine(this.sqlQueryEngine);
      }
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
      sqlQueryEngine: this.sqlQueryEngine,
    });
    return this.controlPlaneSystemTableGateway;
  }
}

export {ServiceDefinitionValidator};
