/**
 * Operation lifecycle manager for wasm_operations.
 * Creates, transitions, and builds SQL for persisting
 * async operation state. All writes go through SQL engine.
 *
 * Requirements: 8.1, 8.3
 */
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
import { v4 as uuidv4 } from 'uuid';
import { NUM, SQL, TABLES, WASM_OPERATION_STATE } from '../constants/index.js';
import { validateWasmOperation } from './wasm-meta-models.js';
import { WASM_OPERATION_COL as WO_COL, WASM_OPERATION_FIELD as WO } from './wasm-meta-models-constants.js';
const OPERATION_LIFECYCLE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("162248") ? {} : (stryCov_9fa48("162248"), {
  TENANT_ID_REQUIRED: stryMutAct_9fa48("162249") ? "" : (stryCov_9fa48("162249"), 'Tenant ID is required'),
  COMMAND_REQUIRED: stryMutAct_9fa48("162250") ? "" : (stryCov_9fa48("162250"), 'Command is required'),
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("162251") ? "" : (stryCov_9fa48("162251"), 'Operation ID is required'),
  INVALID_TRANSITION: stryMutAct_9fa48("162252") ? "" : (stryCov_9fa48("162252"), 'Invalid state transition'),
  IDEMPOTENCY_KEY_REQUIRED: stryMutAct_9fa48("162253") ? "" : (stryCov_9fa48("162253"), 'Idempotency key is required for dedupe check')
}));
const VALID_TRANSITIONS = Object.freeze(stryMutAct_9fa48("162254") ? {} : (stryCov_9fa48("162254"), {
  [WASM_OPERATION_STATE.PENDING]: stryMutAct_9fa48("162255") ? [] : (stryCov_9fa48("162255"), [WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.CANCELLED]),
  [WASM_OPERATION_STATE.IN_PROGRESS]: stryMutAct_9fa48("162256") ? [] : (stryCov_9fa48("162256"), [WASM_OPERATION_STATE.COMPLETED, WASM_OPERATION_STATE.FAILED, WASM_OPERATION_STATE.CANCELLED])
}));
const INSERT_COLUMNS = stryMutAct_9fa48("162257") ? [] : (stryCov_9fa48("162257"), [WO_COL.OPERATION_ID, WO_COL.TENANT_ID, WO_COL.COMMAND, WO_COL.IDEMPOTENCY_KEY, WO_COL.STATE, WO_COL.RESULT, WO_COL.ERROR, WO_COL.CREATED_AT, WO_COL.UPDATED_AT]);
const TERMINAL_STATES = new Set(stryMutAct_9fa48("162258") ? [] : (stryCov_9fa48("162258"), [WASM_OPERATION_STATE.COMPLETED, WASM_OPERATION_STATE.FAILED, WASM_OPERATION_STATE.CANCELLED]));

/**
 * Create a new operation with PENDING state.
 * @param {string} tenantId - Tenant identifier.
 * @param {string} command - Command name.
 * @param {string|null} [idempotencyKey] - Optional idempotency key.
 * @return {{success: boolean, operation?: Object, sql?: string,
 *   params?: Array, errors?: string[]}}
 */
function createOperation(tenantId, command, idempotencyKey) {
  if (stryMutAct_9fa48("162259")) {
    {}
  } else {
    stryCov_9fa48("162259");
    const errors = stryMutAct_9fa48("162260") ? ["Stryker was here"] : (stryCov_9fa48("162260"), []);
    if (stryMutAct_9fa48("162263") ? false : stryMutAct_9fa48("162262") ? true : stryMutAct_9fa48("162261") ? tenantId : (stryCov_9fa48("162261", "162262", "162263"), !tenantId)) {
      if (stryMutAct_9fa48("162264")) {
        {}
      } else {
        stryCov_9fa48("162264");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("162267") ? false : stryMutAct_9fa48("162266") ? true : stryMutAct_9fa48("162265") ? command : (stryCov_9fa48("162265", "162266", "162267"), !command)) {
      if (stryMutAct_9fa48("162268")) {
        {}
      } else {
        stryCov_9fa48("162268");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.COMMAND_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("162272") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162271") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162270") ? false : stryMutAct_9fa48("162269") ? true : (stryCov_9fa48("162269", "162270", "162271", "162272"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162273")) {
        {}
      } else {
        stryCov_9fa48("162273");
        return stryMutAct_9fa48("162274") ? {} : (stryCov_9fa48("162274"), {
          success: stryMutAct_9fa48("162275") ? true : (stryCov_9fa48("162275"), false),
          errors
        });
      }
    }
    const now = Date.now();
    const operation = stryMutAct_9fa48("162276") ? {} : (stryCov_9fa48("162276"), {
      [WO.OPERATION_ID]: uuidv4(),
      [WO.TENANT_ID]: tenantId,
      [WO.COMMAND]: command,
      [WO.IDEMPOTENCY_KEY]: stryMutAct_9fa48("162277") ? idempotencyKey && null : (stryCov_9fa48("162277"), idempotencyKey ?? null),
      [WO.STATE]: WASM_OPERATION_STATE.PENDING,
      [WO.RESULT]: null,
      [WO.ERROR]: null,
      createdAt: now,
      updatedAt: now
    });
    const validation = validateWasmOperation(operation);
    if (stryMutAct_9fa48("162280") ? false : stryMutAct_9fa48("162279") ? true : stryMutAct_9fa48("162278") ? validation.valid : (stryCov_9fa48("162278", "162279", "162280"), !validation.valid)) {
      if (stryMutAct_9fa48("162281")) {
        {}
      } else {
        stryCov_9fa48("162281");
        return stryMutAct_9fa48("162282") ? {} : (stryCov_9fa48("162282"), {
          success: stryMutAct_9fa48("162283") ? true : (stryCov_9fa48("162283"), false),
          errors: validation.errors
        });
      }
    }
    const placeholders = INSERT_COLUMNS.map(stryMutAct_9fa48("162284") ? () => undefined : (stryCov_9fa48("162284"), (_col, i) => stryMutAct_9fa48("162285") ? `` : (stryCov_9fa48("162285"), `$${stryMutAct_9fa48("162286") ? i - NUM.ONE : (stryCov_9fa48("162286"), i + NUM.ONE)}`))).join(stryMutAct_9fa48("162287") ? "" : (stryCov_9fa48("162287"), ', '));
    const sql = (stryMutAct_9fa48("162288") ? `` : (stryCov_9fa48("162288"), `${SQL.INSERT_INTO} ${TABLES.WASM_OPERATIONS}`)) + (stryMutAct_9fa48("162289") ? `` : (stryCov_9fa48("162289"), ` (${INSERT_COLUMNS.join(stryMutAct_9fa48("162290") ? "" : (stryCov_9fa48("162290"), ', '))})`)) + (stryMutAct_9fa48("162291") ? `` : (stryCov_9fa48("162291"), ` ${SQL.VALUES} (${placeholders})`));
    const params = stryMutAct_9fa48("162292") ? [] : (stryCov_9fa48("162292"), [operation[WO.OPERATION_ID], operation[WO.TENANT_ID], operation[WO.COMMAND], operation[WO.IDEMPOTENCY_KEY], operation[WO.STATE], JSON.stringify(stryMutAct_9fa48("162295") ? operation[WO.RESULT] && {} : stryMutAct_9fa48("162294") ? false : stryMutAct_9fa48("162293") ? true : (stryCov_9fa48("162293", "162294", "162295"), operation[WO.RESULT] || {})), JSON.stringify(stryMutAct_9fa48("162298") ? operation[WO.ERROR] && {} : stryMutAct_9fa48("162297") ? false : stryMutAct_9fa48("162296") ? true : (stryCov_9fa48("162296", "162297", "162298"), operation[WO.ERROR] || {})), operation.createdAt, operation.updatedAt]);
    return stryMutAct_9fa48("162299") ? {} : (stryCov_9fa48("162299"), {
      success: stryMutAct_9fa48("162300") ? false : (stryCov_9fa48("162300"), true),
      operation,
      sql,
      params
    });
  }
}

/**
 * Transition an operation between states.
 * @param {string} operationId - Operation identifier.
 * @param {string} fromState - Current state.
 * @param {string} toState - Target state.
 * @param {*} [resultOrError] - Result or error payload.
 * @return {{success: boolean, sql?: string, params?: Array,
 *   errors?: string[]}}
 */
function transitionOperation(operationId, fromState, toState, resultOrError) {
  if (stryMutAct_9fa48("162301")) {
    {}
  } else {
    stryCov_9fa48("162301");
    const errors = stryMutAct_9fa48("162302") ? ["Stryker was here"] : (stryCov_9fa48("162302"), []);
    if (stryMutAct_9fa48("162305") ? false : stryMutAct_9fa48("162304") ? true : stryMutAct_9fa48("162303") ? operationId : (stryCov_9fa48("162303", "162304", "162305"), !operationId)) {
      if (stryMutAct_9fa48("162306")) {
        {}
      } else {
        stryCov_9fa48("162306");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.OPERATION_ID_REQUIRED);
        return stryMutAct_9fa48("162307") ? {} : (stryCov_9fa48("162307"), {
          success: stryMutAct_9fa48("162308") ? true : (stryCov_9fa48("162308"), false),
          errors
        });
      }
    }
    const allowed = VALID_TRANSITIONS[fromState];
    if (stryMutAct_9fa48("162311") ? !allowed && !allowed.includes(toState) : stryMutAct_9fa48("162310") ? false : stryMutAct_9fa48("162309") ? true : (stryCov_9fa48("162309", "162310", "162311"), (stryMutAct_9fa48("162312") ? allowed : (stryCov_9fa48("162312"), !allowed)) || (stryMutAct_9fa48("162313") ? allowed.includes(toState) : (stryCov_9fa48("162313"), !allowed.includes(toState))))) {
      if (stryMutAct_9fa48("162314")) {
        {}
      } else {
        stryCov_9fa48("162314");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.INVALID_TRANSITION);
        return stryMutAct_9fa48("162315") ? {} : (stryCov_9fa48("162315"), {
          success: stryMutAct_9fa48("162316") ? true : (stryCov_9fa48("162316"), false),
          errors
        });
      }
    }
    const now = Date.now();
    const setClauses = stryMutAct_9fa48("162317") ? [] : (stryCov_9fa48("162317"), [stryMutAct_9fa48("162318") ? `` : (stryCov_9fa48("162318"), `${WO_COL.STATE} = $1`), stryMutAct_9fa48("162319") ? `` : (stryCov_9fa48("162319"), `${WO_COL.UPDATED_AT} = $2`)]);
    const params = stryMutAct_9fa48("162320") ? [] : (stryCov_9fa48("162320"), [toState, now]);
    if (stryMutAct_9fa48("162323") ? toState !== WASM_OPERATION_STATE.COMPLETED : stryMutAct_9fa48("162322") ? false : stryMutAct_9fa48("162321") ? true : (stryCov_9fa48("162321", "162322", "162323"), toState === WASM_OPERATION_STATE.COMPLETED)) {
      if (stryMutAct_9fa48("162324")) {
        {}
      } else {
        stryCov_9fa48("162324");
        setClauses.push(stryMutAct_9fa48("162325") ? `` : (stryCov_9fa48("162325"), `${WO_COL.RESULT} = $${stryMutAct_9fa48("162326") ? params.length - NUM.ONE : (stryCov_9fa48("162326"), params.length + NUM.ONE)}`));
        params.push(JSON.stringify(stryMutAct_9fa48("162329") ? resultOrError && {} : stryMutAct_9fa48("162328") ? false : stryMutAct_9fa48("162327") ? true : (stryCov_9fa48("162327", "162328", "162329"), resultOrError || {})));
      }
    } else if (stryMutAct_9fa48("162332") ? TERMINAL_STATES.has(toState) || toState !== WASM_OPERATION_STATE.COMPLETED : stryMutAct_9fa48("162331") ? false : stryMutAct_9fa48("162330") ? true : (stryCov_9fa48("162330", "162331", "162332"), TERMINAL_STATES.has(toState) && (stryMutAct_9fa48("162334") ? toState === WASM_OPERATION_STATE.COMPLETED : stryMutAct_9fa48("162333") ? true : (stryCov_9fa48("162333", "162334"), toState !== WASM_OPERATION_STATE.COMPLETED)))) {
      if (stryMutAct_9fa48("162335")) {
        {}
      } else {
        stryCov_9fa48("162335");
        setClauses.push(stryMutAct_9fa48("162336") ? `` : (stryCov_9fa48("162336"), `${WO_COL.ERROR} = $${stryMutAct_9fa48("162337") ? params.length - NUM.ONE : (stryCov_9fa48("162337"), params.length + NUM.ONE)}`));
        params.push(JSON.stringify(stryMutAct_9fa48("162340") ? resultOrError && {} : stryMutAct_9fa48("162339") ? false : stryMutAct_9fa48("162338") ? true : (stryCov_9fa48("162338", "162339", "162340"), resultOrError || {})));
      }
    }
    params.push(operationId, fromState);
    const idIdx = stryMutAct_9fa48("162341") ? params.length + NUM.ONE : (stryCov_9fa48("162341"), params.length - NUM.ONE);
    const stateIdx = params.length;
    const sql = (stryMutAct_9fa48("162342") ? `` : (stryCov_9fa48("162342"), `${SQL.UPDATE} ${TABLES.WASM_OPERATIONS}`)) + (stryMutAct_9fa48("162343") ? `` : (stryCov_9fa48("162343"), ` ${SQL.SET} ${setClauses.join(stryMutAct_9fa48("162344") ? "" : (stryCov_9fa48("162344"), ', '))}`)) + (stryMutAct_9fa48("162345") ? `` : (stryCov_9fa48("162345"), ` ${SQL.WHERE} ${WO_COL.OPERATION_ID} = $${idIdx}`)) + (stryMutAct_9fa48("162346") ? `` : (stryCov_9fa48("162346"), ` ${SQL.AND} ${WO_COL.STATE} = $${stateIdx}`));
    return stryMutAct_9fa48("162347") ? {} : (stryCov_9fa48("162347"), {
      success: stryMutAct_9fa48("162348") ? false : (stryCov_9fa48("162348"), true),
      sql,
      params
    });
  }
}

/**
 * Build SQL to fetch a single operation by ID.
 * @param {string} operationId - Operation identifier.
 * @return {{sql: string, params: Array}}
 */
function buildGetOperationSQL(operationId) {
  if (stryMutAct_9fa48("162349")) {
    {}
  } else {
    stryCov_9fa48("162349");
    const sql = (stryMutAct_9fa48("162350") ? `` : (stryCov_9fa48("162350"), `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`)) + (stryMutAct_9fa48("162351") ? `` : (stryCov_9fa48("162351"), ` ${SQL.WHERE} ${WO_COL.OPERATION_ID} = $1`));
    return stryMutAct_9fa48("162352") ? {} : (stryCov_9fa48("162352"), {
      sql,
      params: stryMutAct_9fa48("162353") ? [] : (stryCov_9fa48("162353"), [operationId])
    });
  }
}

/**
 * Build SQL to list operations with optional filters.
 * @param {string} [tenantId] - Optional tenant filter.
 * @param {string} [state] - Optional state filter.
 * @return {{sql: string, params: Array}}
 */
function buildListOperationsSQL(tenantId, state) {
  if (stryMutAct_9fa48("162354")) {
    {}
  } else {
    stryCov_9fa48("162354");
    let sql = stryMutAct_9fa48("162355") ? `` : (stryCov_9fa48("162355"), `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`);
    const conditions = stryMutAct_9fa48("162356") ? ["Stryker was here"] : (stryCov_9fa48("162356"), []);
    const params = stryMutAct_9fa48("162357") ? ["Stryker was here"] : (stryCov_9fa48("162357"), []);
    if (stryMutAct_9fa48("162359") ? false : stryMutAct_9fa48("162358") ? true : (stryCov_9fa48("162358", "162359"), tenantId)) {
      if (stryMutAct_9fa48("162360")) {
        {}
      } else {
        stryCov_9fa48("162360");
        params.push(tenantId);
        conditions.push(stryMutAct_9fa48("162361") ? `` : (stryCov_9fa48("162361"), `${WO_COL.TENANT_ID} = $${params.length}`));
      }
    }
    if (stryMutAct_9fa48("162363") ? false : stryMutAct_9fa48("162362") ? true : (stryCov_9fa48("162362", "162363"), state)) {
      if (stryMutAct_9fa48("162364")) {
        {}
      } else {
        stryCov_9fa48("162364");
        params.push(state);
        conditions.push(stryMutAct_9fa48("162365") ? `` : (stryCov_9fa48("162365"), `${WO_COL.STATE} = $${params.length}`));
      }
    }
    if (stryMutAct_9fa48("162369") ? conditions.length <= NUM.ZERO : stryMutAct_9fa48("162368") ? conditions.length >= NUM.ZERO : stryMutAct_9fa48("162367") ? false : stryMutAct_9fa48("162366") ? true : (stryCov_9fa48("162366", "162367", "162368", "162369"), conditions.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162370")) {
        {}
      } else {
        stryCov_9fa48("162370");
        sql += stryMutAct_9fa48("162371") ? `` : (stryCov_9fa48("162371"), ` ${SQL.WHERE} ${conditions.join(stryMutAct_9fa48("162372") ? `` : (stryCov_9fa48("162372"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("162373") ? {} : (stryCov_9fa48("162373"), {
      sql,
      params
    });
  }
}

/**
 * Build SQL to check for an existing operation by idempotency key.
 * @param {string} tenantId - Tenant identifier.
 * @param {string} idempotencyKey - Idempotency key to check.
 * @return {{success: boolean, sql?: string, params?: Array,
 *   errors?: string[]}}
 */
function buildIdempotencyCheckSQL(tenantId, idempotencyKey) {
  if (stryMutAct_9fa48("162374")) {
    {}
  } else {
    stryCov_9fa48("162374");
    const errors = stryMutAct_9fa48("162375") ? ["Stryker was here"] : (stryCov_9fa48("162375"), []);
    if (stryMutAct_9fa48("162378") ? false : stryMutAct_9fa48("162377") ? true : stryMutAct_9fa48("162376") ? tenantId : (stryCov_9fa48("162376", "162377", "162378"), !tenantId)) {
      if (stryMutAct_9fa48("162379")) {
        {}
      } else {
        stryCov_9fa48("162379");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("162382") ? false : stryMutAct_9fa48("162381") ? true : stryMutAct_9fa48("162380") ? idempotencyKey : (stryCov_9fa48("162380", "162381", "162382"), !idempotencyKey)) {
      if (stryMutAct_9fa48("162383")) {
        {}
      } else {
        stryCov_9fa48("162383");
        errors.push(OPERATION_LIFECYCLE_ERROR_MSG.IDEMPOTENCY_KEY_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("162387") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162386") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162385") ? false : stryMutAct_9fa48("162384") ? true : (stryCov_9fa48("162384", "162385", "162386", "162387"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162388")) {
        {}
      } else {
        stryCov_9fa48("162388");
        return stryMutAct_9fa48("162389") ? {} : (stryCov_9fa48("162389"), {
          success: stryMutAct_9fa48("162390") ? true : (stryCov_9fa48("162390"), false),
          errors
        });
      }
    }
    const sql = (stryMutAct_9fa48("162391") ? `` : (stryCov_9fa48("162391"), `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`)) + (stryMutAct_9fa48("162392") ? `` : (stryCov_9fa48("162392"), ` ${SQL.WHERE} ${WO_COL.TENANT_ID} = $1`)) + (stryMutAct_9fa48("162393") ? `` : (stryCov_9fa48("162393"), ` ${SQL.AND} ${WO_COL.IDEMPOTENCY_KEY} = $2`));
    return stryMutAct_9fa48("162394") ? {} : (stryCov_9fa48("162394"), {
      success: stryMutAct_9fa48("162395") ? false : (stryCov_9fa48("162395"), true),
      sql,
      params: stryMutAct_9fa48("162396") ? [] : (stryCov_9fa48("162396"), [tenantId, idempotencyKey])
    });
  }
}
export { OPERATION_LIFECYCLE_ERROR_MSG, VALID_TRANSITIONS, createOperation, transitionOperation, buildGetOperationSQL, buildListOperationsSQL, buildIdempotencyCheckSQL };