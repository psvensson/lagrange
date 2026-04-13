// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF, SERVICE_PROFILE } from '../constants/index.js';
import { RUNTIME_KIND } from '../constants/runtime.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { READ_CONSISTENCY_MODE, WRITE_CONSISTENCY_MODE, WASM_SERVICE_ERROR_MSG } from './wasm-service-constants.js';
import { RB_FIELD } from './wasm-service-models.js';
import { validateRuntimeDescriptor } from './runtime-descriptor-validator.js';

/**
 * SQL query to check if a handler function exists in the code table.
 * @type {string}
 */
const SQL_CHECK_HANDLER = stryMutAct_9fa48("162970") ? "" : (stryCov_9fa48("162970"), 'SELECT function_id FROM code WHERE function_id = ?');

/**
 * Set of valid read consistency mode values.
 * @type {Set<string>}
 */
const VALID_READ_MODES = new Set(Object.values(READ_CONSISTENCY_MODE));

/**
 * Set of valid write consistency mode values.
 * @type {Set<string>}
 */
const VALID_WRITE_MODES = new Set(Object.values(WRITE_CONSISTENCY_MODE));

/**
 * All resource budget field names that must be non-negative numbers.
 * @type {string[]}
 */
const BUDGET_FIELDS = stryMutAct_9fa48("162971") ? [] : (stryCov_9fa48("162971"), [RB_FIELD.CPU_TIME_LIMIT_MS, RB_FIELD.MEMORY_LIMIT_BYTES, RB_FIELD.SESSION_SIZE_LIMIT_BYTES, RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]);

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
  constructor({
    sqlQueryEngine
  }) {
    if (stryMutAct_9fa48("162972")) {
      {}
    } else {
      stryCov_9fa48("162972");
      this.sqlQueryEngine = sqlQueryEngine;
      this.controlPlaneSystemTableGateway = null;
    }
  }

  /**
   * Validate a service definition.
   * @param {Object} definition - ServiceDefinition object.
   * @return {Promise<{valid: boolean, errors: string[]}>}
   *   Validation result with any error messages.
   */
  async validate(definition) {
    if (stryMutAct_9fa48("162973")) {
      {}
    } else {
      stryCov_9fa48("162973");
      const errors = stryMutAct_9fa48("162974") ? ["Stryker was here"] : (stryCov_9fa48("162974"), []);
      const runtimeKind = stryMutAct_9fa48("162975") ? (definition.runtimeKind ?? definition.runtime_kind) && null : (stryCov_9fa48("162975"), (stryMutAct_9fa48("162976") ? definition.runtimeKind && definition.runtime_kind : (stryCov_9fa48("162976"), definition.runtimeKind ?? definition.runtime_kind)) ?? null);
      const runtimeRef = stryMutAct_9fa48("162977") ? (definition.runtimeRef ?? definition.runtime_ref) && null : (stryCov_9fa48("162977"), (stryMutAct_9fa48("162978") ? definition.runtimeRef && definition.runtime_ref : (stryCov_9fa48("162978"), definition.runtimeRef ?? definition.runtime_ref)) ?? null);
      const runtimeConfig = stryMutAct_9fa48("162979") ? (definition.runtimeConfig ?? definition.runtime_config) && null : (stryCov_9fa48("162979"), (stryMutAct_9fa48("162980") ? definition.runtimeConfig && definition.runtime_config : (stryCov_9fa48("162980"), definition.runtimeConfig ?? definition.runtime_config)) ?? null);
      if (stryMutAct_9fa48("162983") ? runtimeKind === null : stryMutAct_9fa48("162982") ? false : stryMutAct_9fa48("162981") ? true : (stryCov_9fa48("162981", "162982", "162983"), runtimeKind !== null)) {
        if (stryMutAct_9fa48("162984")) {
          {}
        } else {
          stryCov_9fa48("162984");
          const descriptorResult = validateRuntimeDescriptor(stryMutAct_9fa48("162985") ? {} : (stryCov_9fa48("162985"), {
            runtimeKind,
            runtimeRef,
            runtimeConfig
          }));
          if (stryMutAct_9fa48("162988") ? false : stryMutAct_9fa48("162987") ? true : stryMutAct_9fa48("162986") ? descriptorResult.valid : (stryCov_9fa48("162986", "162987", "162988"), !descriptorResult.valid)) {
            if (stryMutAct_9fa48("162989")) {
              {}
            } else {
              stryCov_9fa48("162989");
              errors.push(...descriptorResult.errors);
            }
          }
        }
      }
      if (stryMutAct_9fa48("162991") ? false : stryMutAct_9fa48("162990") ? true : (stryCov_9fa48("162990", "162991"), this.shouldValidateHandler(definition, runtimeKind))) {
        if (stryMutAct_9fa48("162992")) {
          {}
        } else {
          stryCov_9fa48("162992");
          const handlerId = stryMutAct_9fa48("162995") ? definition.handlerFunctionId && (runtimeKind === RUNTIME_KIND.WASM_COMPONENT ? runtimeRef : null) : stryMutAct_9fa48("162994") ? false : stryMutAct_9fa48("162993") ? true : (stryCov_9fa48("162993", "162994", "162995"), definition.handlerFunctionId || ((stryMutAct_9fa48("162998") ? runtimeKind !== RUNTIME_KIND.WASM_COMPONENT : stryMutAct_9fa48("162997") ? false : stryMutAct_9fa48("162996") ? true : (stryCov_9fa48("162996", "162997", "162998"), runtimeKind === RUNTIME_KIND.WASM_COMPONENT)) ? runtimeRef : null));
          await this._validateHandlerFunction(handlerId, errors);
        }
      }
      this._validateReplicaCount(definition.replicaCount, errors);
      this._validateConsistencyModes(definition, errors);
      this._validateResourceBudget(definition.resourceBudget, errors);
      return stryMutAct_9fa48("162999") ? {} : (stryCov_9fa48("162999"), {
        valid: stryMutAct_9fa48("163002") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("163001") ? false : stryMutAct_9fa48("163000") ? true : (stryCov_9fa48("163000", "163001", "163002"), errors.length === NUM.ZERO),
        errors
      });
    }
  }

  /**
   * Determine whether handler existence must be validated.
   * @param {Object} definition - ServiceDefinition object.
   * @param {string|null} runtimeKind - Runtime kind value.
   * @return {boolean} True when handler lookup is required.
   * @private
   */
  shouldValidateHandler(definition, runtimeKind) {
    if (stryMutAct_9fa48("163003")) {
      {}
    } else {
      stryCov_9fa48("163003");
      if (stryMutAct_9fa48("163006") ? definition.serviceProfile !== SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("163005") ? false : stryMutAct_9fa48("163004") ? true : (stryCov_9fa48("163004", "163005", "163006"), definition.serviceProfile === SERVICE_PROFILE.SQL_ENGINE)) {
        if (stryMutAct_9fa48("163007")) {
          {}
        } else {
          stryCov_9fa48("163007");
          return stryMutAct_9fa48("163008") ? true : (stryCov_9fa48("163008"), false);
        }
      }
      if (stryMutAct_9fa48("163011") ? runtimeKind !== null : stryMutAct_9fa48("163010") ? false : stryMutAct_9fa48("163009") ? true : (stryCov_9fa48("163009", "163010", "163011"), runtimeKind === null)) {
        if (stryMutAct_9fa48("163012")) {
          {}
        } else {
          stryCov_9fa48("163012");
          return stryMutAct_9fa48("163013") ? false : (stryCov_9fa48("163013"), true);
        }
      }
      return stryMutAct_9fa48("163016") ? runtimeKind !== RUNTIME_KIND.WASM_COMPONENT : stryMutAct_9fa48("163015") ? false : stryMutAct_9fa48("163014") ? true : (stryCov_9fa48("163014", "163015", "163016"), runtimeKind === RUNTIME_KIND.WASM_COMPONENT);
    }
  }

  /**
   * Check that the handler function exists in the code table.
   * @param {string} handlerFunctionId - Function ID to check.
   * @param {string[]} errors - Errors array to append to.
   * @return {Promise<void>}
   * @private
   */
  async _validateHandlerFunction(handlerFunctionId, errors) {
    if (stryMutAct_9fa48("163017")) {
      {}
    } else {
      stryCov_9fa48("163017");
      if (stryMutAct_9fa48("163020") ? false : stryMutAct_9fa48("163019") ? true : stryMutAct_9fa48("163018") ? handlerFunctionId : (stryCov_9fa48("163018", "163019", "163020"), !handlerFunctionId)) {
        if (stryMutAct_9fa48("163021")) {
          {}
        } else {
          stryCov_9fa48("163021");
          errors.push(WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND);
          return;
        }
      }
      const result = await this.getControlPlaneSystemTableGateway().readRows(SYSTEM_TABLE_NAME.CODE, SQL_CHECK_HANDLER, stryMutAct_9fa48("163022") ? [] : (stryCov_9fa48("163022"), [handlerFunctionId]));
      if (stryMutAct_9fa48("163025") ? !result.rows && result.rows.length === NUM.ZERO : stryMutAct_9fa48("163024") ? false : stryMutAct_9fa48("163023") ? true : (stryCov_9fa48("163023", "163024", "163025"), (stryMutAct_9fa48("163026") ? result.rows : (stryCov_9fa48("163026"), !result.rows)) || (stryMutAct_9fa48("163028") ? result.rows.length !== NUM.ZERO : stryMutAct_9fa48("163027") ? false : (stryCov_9fa48("163027", "163028"), result.rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("163029")) {
          {}
        } else {
          stryCov_9fa48("163029");
          errors.push(WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND);
        }
      }
    }
  }

  /**
   * Check that replica count is an odd number >= 3.
   * @param {number} replicaCount - Replica count to validate.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateReplicaCount(replicaCount, errors) {
    if (stryMutAct_9fa48("163030")) {
      {}
    } else {
      stryCov_9fa48("163030");
      const isOdd = stryMutAct_9fa48("163033") ? replicaCount % NUM.TWO === NUM.ZERO : stryMutAct_9fa48("163032") ? false : stryMutAct_9fa48("163031") ? true : (stryCov_9fa48("163031", "163032", "163033"), (stryMutAct_9fa48("163034") ? replicaCount * NUM.TWO : (stryCov_9fa48("163034"), replicaCount % NUM.TWO)) !== NUM.ZERO);
      const isAtLeastThree = stryMutAct_9fa48("163038") ? replicaCount < NUM.THREE : stryMutAct_9fa48("163037") ? replicaCount > NUM.THREE : stryMutAct_9fa48("163036") ? false : stryMutAct_9fa48("163035") ? true : (stryCov_9fa48("163035", "163036", "163037", "163038"), replicaCount >= NUM.THREE);
      if (stryMutAct_9fa48("163041") ? !isOdd && !isAtLeastThree : stryMutAct_9fa48("163040") ? false : stryMutAct_9fa48("163039") ? true : (stryCov_9fa48("163039", "163040", "163041"), (stryMutAct_9fa48("163042") ? isOdd : (stryCov_9fa48("163042"), !isOdd)) || (stryMutAct_9fa48("163043") ? isAtLeastThree : (stryCov_9fa48("163043"), !isAtLeastThree)))) {
        if (stryMutAct_9fa48("163044")) {
          {}
        } else {
          stryCov_9fa48("163044");
          errors.push(WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED);
        }
      }
    }
  }

  /**
   * Check that read and write consistency modes are valid.
   * @param {Object} definition - ServiceDefinition object.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateConsistencyModes(definition, errors) {
    if (stryMutAct_9fa48("163045")) {
      {}
    } else {
      stryCov_9fa48("163045");
      if (stryMutAct_9fa48("163048") ? false : stryMutAct_9fa48("163047") ? true : stryMutAct_9fa48("163046") ? VALID_READ_MODES.has(definition.readConsistency) : (stryCov_9fa48("163046", "163047", "163048"), !VALID_READ_MODES.has(definition.readConsistency))) {
        if (stryMutAct_9fa48("163049")) {
          {}
        } else {
          stryCov_9fa48("163049");
          errors.push(WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE);
        }
      }
      if (stryMutAct_9fa48("163052") ? false : stryMutAct_9fa48("163051") ? true : stryMutAct_9fa48("163050") ? VALID_WRITE_MODES.has(definition.writeConsistency) : (stryCov_9fa48("163050", "163051", "163052"), !VALID_WRITE_MODES.has(definition.writeConsistency))) {
        if (stryMutAct_9fa48("163053")) {
          {}
        } else {
          stryCov_9fa48("163053");
          errors.push(WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE);
        }
      }
    }
  }

  /**
   * Check that all resource budget values are non-negative numbers.
   * @param {Object} budget - ResourceBudget object.
   * @param {string[]} errors - Errors array to append to.
   * @private
   */
  _validateResourceBudget(budget, errors) {
    if (stryMutAct_9fa48("163054")) {
      {}
    } else {
      stryCov_9fa48("163054");
      if (stryMutAct_9fa48("163057") ? false : stryMutAct_9fa48("163056") ? true : stryMutAct_9fa48("163055") ? budget : (stryCov_9fa48("163055", "163056", "163057"), !budget)) {
        if (stryMutAct_9fa48("163058")) {
          {}
        } else {
          stryCov_9fa48("163058");
          return;
        }
      }
      for (const field of BUDGET_FIELDS) {
        if (stryMutAct_9fa48("163059")) {
          {}
        } else {
          stryCov_9fa48("163059");
          const value = budget[field];
          if (stryMutAct_9fa48("163062") ? value === undefined && value === null : stryMutAct_9fa48("163061") ? false : stryMutAct_9fa48("163060") ? true : (stryCov_9fa48("163060", "163061", "163062"), (stryMutAct_9fa48("163064") ? value !== undefined : stryMutAct_9fa48("163063") ? false : (stryCov_9fa48("163063", "163064"), value === undefined)) || (stryMutAct_9fa48("163066") ? value !== null : stryMutAct_9fa48("163065") ? false : (stryCov_9fa48("163065", "163066"), value === null)))) {
            if (stryMutAct_9fa48("163067")) {
              {}
            } else {
              stryCov_9fa48("163067");
              continue;
            }
          }
          if (stryMutAct_9fa48("163070") ? typeof value !== TYPEOF.NUMBER && value < NUM.ZERO : stryMutAct_9fa48("163069") ? false : stryMutAct_9fa48("163068") ? true : (stryCov_9fa48("163068", "163069", "163070"), (stryMutAct_9fa48("163072") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("163071") ? false : (stryCov_9fa48("163071", "163072"), typeof value !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("163075") ? value >= NUM.ZERO : stryMutAct_9fa48("163074") ? value <= NUM.ZERO : stryMutAct_9fa48("163073") ? false : (stryCov_9fa48("163073", "163074", "163075"), value < NUM.ZERO)))) {
            if (stryMutAct_9fa48("163076")) {
              {}
            } else {
              stryCov_9fa48("163076");
              errors.push((stryMutAct_9fa48("163077") ? `` : (stryCov_9fa48("163077"), `Resource budget field '${field}' must be a `)) + (stryMutAct_9fa48("163078") ? "" : (stryCov_9fa48("163078"), 'non-negative number')));
            }
          }
        }
      }
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("163079")) {
      {}
    } else {
      stryCov_9fa48("163079");
      if (stryMutAct_9fa48("163081") ? false : stryMutAct_9fa48("163080") ? true : (stryCov_9fa48("163080", "163081"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("163082")) {
          {}
        } else {
          stryCov_9fa48("163082");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("163083") ? {} : (stryCov_9fa48("163083"), {
        getSqlQueryEngine: stryMutAct_9fa48("163084") ? () => undefined : (stryCov_9fa48("163084"), () => this.sqlQueryEngine)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { ServiceDefinitionValidator };