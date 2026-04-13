/**
 * Command handlers for sys-admin-meta service.
 * Each handler validates input and returns SQL statements
 * or metadata for the caller to execute. No direct SQL execution.
 *
 * Requirements: 1.3, 11.1
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
import { SQL, TABLES, COLUMN, WASM_META_ACTION } from '../constants/index.js';
const ADMIN_META_ACTION = Object.freeze(stryMutAct_9fa48("4066") ? {} : (stryCov_9fa48("4066"), {
  EXECUTE_QUERY: stryMutAct_9fa48("4067") ? "" : (stryCov_9fa48("4067"), 'executeQuery'),
  GET_CACHE_DUMP: stryMutAct_9fa48("4068") ? "" : (stryCov_9fa48("4068"), 'getCacheDump'),
  GET_NODE_STATUS: stryMutAct_9fa48("4069") ? "" : (stryCov_9fa48("4069"), 'getNodeStatus'),
  LIST_SERVICES: stryMutAct_9fa48("4070") ? "" : (stryCov_9fa48("4070"), 'listServices'),
  LIST_NODES: stryMutAct_9fa48("4071") ? "" : (stryCov_9fa48("4071"), 'listNodes'),
  LIST_PARTITIONS: stryMutAct_9fa48("4072") ? "" : (stryCov_9fa48("4072"), 'listPartitions'),
  LIST_LATENCY_GROUPS: stryMutAct_9fa48("4073") ? "" : (stryCov_9fa48("4073"), 'listLatencyGroups'),
  LIST_INTER_GROUP_LATENCIES: stryMutAct_9fa48("4074") ? "" : (stryCov_9fa48("4074"), 'listInterGroupLatencies')
}));
const ADMIN_META_ERROR_MSG = Object.freeze(stryMutAct_9fa48("4075") ? {} : (stryCov_9fa48("4075"), {
  SQL_REQUIRED: stryMutAct_9fa48("4076") ? "" : (stryCov_9fa48("4076"), 'SQL statement is required'),
  SQL_MUST_BE_STRING: stryMutAct_9fa48("4077") ? "" : (stryCov_9fa48("4077"), 'SQL must be a string')
}));

/**
 * Actions that must be delegated to sys-wasm-meta.
 * Contains all WASM_META_ACTION values.
 */
const WASM_DELEGATION_ACTIONS = new Set(Object.values(WASM_META_ACTION));
const CACHE_DUMP_TABLES = Object.freeze(stryMutAct_9fa48("4078") ? [] : (stryCov_9fa48("4078"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.MESSAGE_GROUPS, TABLES.TABLES, TABLES.INDICES, TABLES.CONFIG, TABLES.REPLICA_OPERATIONS, TABLES.SERVICE_DEFINITIONS, TABLES.SERVICE_ENDPOINTS, TABLES.DEBUG_SESSIONS, TABLES.LATENCY_GROUPS, TABLES.INTER_GROUP_LATENCIES]));
const SELECT_ALL_FROM = stryMutAct_9fa48("4079") ? `` : (stryCov_9fa48("4079"), `${SQL.SELECT} * FROM`);

/**
 * Handle execute query command.
 * Validates sql param and returns it for execution.
 * @param {Object} params - {sql, queryParams}.
 * @return {Object} Result with sql/params or errors.
 */
function handleExecuteQuery(params) {
  if (stryMutAct_9fa48("4080")) {
    {}
  } else {
    stryCov_9fa48("4080");
    if (stryMutAct_9fa48("4083") ? !params && !params.sql : stryMutAct_9fa48("4082") ? false : stryMutAct_9fa48("4081") ? true : (stryCov_9fa48("4081", "4082", "4083"), (stryMutAct_9fa48("4084") ? params : (stryCov_9fa48("4084"), !params)) || (stryMutAct_9fa48("4085") ? params.sql : (stryCov_9fa48("4085"), !params.sql)))) {
      if (stryMutAct_9fa48("4086")) {
        {}
      } else {
        stryCov_9fa48("4086");
        return stryMutAct_9fa48("4087") ? {} : (stryCov_9fa48("4087"), {
          success: stryMutAct_9fa48("4088") ? true : (stryCov_9fa48("4088"), false),
          errors: stryMutAct_9fa48("4089") ? [] : (stryCov_9fa48("4089"), [ADMIN_META_ERROR_MSG.SQL_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("4092") ? typeof params.sql === 'string' : stryMutAct_9fa48("4091") ? false : stryMutAct_9fa48("4090") ? true : (stryCov_9fa48("4090", "4091", "4092"), typeof params.sql !== (stryMutAct_9fa48("4093") ? "" : (stryCov_9fa48("4093"), 'string')))) {
      if (stryMutAct_9fa48("4094")) {
        {}
      } else {
        stryCov_9fa48("4094");
        return stryMutAct_9fa48("4095") ? {} : (stryCov_9fa48("4095"), {
          success: stryMutAct_9fa48("4096") ? true : (stryCov_9fa48("4096"), false),
          errors: stryMutAct_9fa48("4097") ? [] : (stryCov_9fa48("4097"), [ADMIN_META_ERROR_MSG.SQL_MUST_BE_STRING])
        });
      }
    }
    return stryMutAct_9fa48("4098") ? {} : (stryCov_9fa48("4098"), {
      success: stryMutAct_9fa48("4099") ? false : (stryCov_9fa48("4099"), true),
      sql: params.sql,
      params: stryMutAct_9fa48("4102") ? params.queryParams && [] : stryMutAct_9fa48("4101") ? false : stryMutAct_9fa48("4100") ? true : (stryCov_9fa48("4100", "4101", "4102"), params.queryParams || (stryMutAct_9fa48("4103") ? ["Stryker was here"] : (stryCov_9fa48("4103"), [])))
    });
  }
}

/**
 * Handle get cache dump command.
 * Returns list of system table names to dump.
 * @param {Object} _params - Unused.
 * @return {Object} Result with tables list.
 */
function handleGetCacheDump(_params) {
  if (stryMutAct_9fa48("4104")) {
    {}
  } else {
    stryCov_9fa48("4104");
    return stryMutAct_9fa48("4105") ? {} : (stryCov_9fa48("4105"), {
      success: stryMutAct_9fa48("4106") ? false : (stryCov_9fa48("4106"), true),
      tables: CACHE_DUMP_TABLES
    });
  }
}

/**
 * Handle get node status command.
 * Returns SQL to query nodes table, optionally filtered.
 * @param {Object} params - Optional {nodeId}.
 * @return {Object} Result with sql/params.
 */
function handleGetNodeStatus(params) {
  if (stryMutAct_9fa48("4107")) {
    {}
  } else {
    stryCov_9fa48("4107");
    let sql = stryMutAct_9fa48("4108") ? `` : (stryCov_9fa48("4108"), `${SELECT_ALL_FROM} ${TABLES.NODES}`);
    const sqlParams = stryMutAct_9fa48("4109") ? ["Stryker was here"] : (stryCov_9fa48("4109"), []);
    if (stryMutAct_9fa48("4112") ? params || params.nodeId : stryMutAct_9fa48("4111") ? false : stryMutAct_9fa48("4110") ? true : (stryCov_9fa48("4110", "4111", "4112"), params && params.nodeId)) {
      if (stryMutAct_9fa48("4113")) {
        {}
      } else {
        stryCov_9fa48("4113");
        sqlParams.push(params.nodeId);
        sql += stryMutAct_9fa48("4114") ? `` : (stryCov_9fa48("4114"), ` ${SQL.WHERE} ${COLUMN.NODE_ID} = ?1`);
      }
    }
    return stryMutAct_9fa48("4115") ? {} : (stryCov_9fa48("4115"), {
      success: stryMutAct_9fa48("4116") ? false : (stryCov_9fa48("4116"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Handle list services command.
 * Returns SQL to query services table with optional filters.
 * @param {Object} params - Optional {serviceType, nodeId}.
 * @return {Object} Result with sql/params.
 */
function handleListServices(params) {
  if (stryMutAct_9fa48("4117")) {
    {}
  } else {
    stryCov_9fa48("4117");
    let sql = stryMutAct_9fa48("4118") ? `` : (stryCov_9fa48("4118"), `${SELECT_ALL_FROM} ${TABLES.SERVICES}`);
    const filters = stryMutAct_9fa48("4119") ? ["Stryker was here"] : (stryCov_9fa48("4119"), []);
    const sqlParams = stryMutAct_9fa48("4120") ? ["Stryker was here"] : (stryCov_9fa48("4120"), []);
    if (stryMutAct_9fa48("4123") ? params || params.serviceType : stryMutAct_9fa48("4122") ? false : stryMutAct_9fa48("4121") ? true : (stryCov_9fa48("4121", "4122", "4123"), params && params.serviceType)) {
      if (stryMutAct_9fa48("4124")) {
        {}
      } else {
        stryCov_9fa48("4124");
        sqlParams.push(params.serviceType);
        filters.push(stryMutAct_9fa48("4125") ? `` : (stryCov_9fa48("4125"), `${COLUMN.SERVICE_TYPE} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4128") ? params || params.nodeId : stryMutAct_9fa48("4127") ? false : stryMutAct_9fa48("4126") ? true : (stryCov_9fa48("4126", "4127", "4128"), params && params.nodeId)) {
      if (stryMutAct_9fa48("4129")) {
        {}
      } else {
        stryCov_9fa48("4129");
        sqlParams.push(params.nodeId);
        filters.push(stryMutAct_9fa48("4130") ? `` : (stryCov_9fa48("4130"), `${COLUMN.NODE_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4134") ? filters.length <= 0 : stryMutAct_9fa48("4133") ? filters.length >= 0 : stryMutAct_9fa48("4132") ? false : stryMutAct_9fa48("4131") ? true : (stryCov_9fa48("4131", "4132", "4133", "4134"), filters.length > 0)) {
      if (stryMutAct_9fa48("4135")) {
        {}
      } else {
        stryCov_9fa48("4135");
        sql += stryMutAct_9fa48("4136") ? `` : (stryCov_9fa48("4136"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("4137") ? `` : (stryCov_9fa48("4137"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("4138") ? {} : (stryCov_9fa48("4138"), {
      success: stryMutAct_9fa48("4139") ? false : (stryCov_9fa48("4139"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Handle list nodes command.
 * Returns SQL to query all nodes.
 * @param {Object} _params - Unused.
 * @return {Object} Result with sql/params.
 */
function handleListNodes(_params) {
  if (stryMutAct_9fa48("4140")) {
    {}
  } else {
    stryCov_9fa48("4140");
    return stryMutAct_9fa48("4141") ? {} : (stryCov_9fa48("4141"), {
      success: stryMutAct_9fa48("4142") ? false : (stryCov_9fa48("4142"), true),
      sql: stryMutAct_9fa48("4143") ? `` : (stryCov_9fa48("4143"), `${SELECT_ALL_FROM} ${TABLES.NODES}`),
      params: stryMutAct_9fa48("4144") ? ["Stryker was here"] : (stryCov_9fa48("4144"), [])
    });
  }
}

/**
 * Handle list partitions command.
 * Returns SQL to query partitions, optionally filtered by tableId.
 * @param {Object} params - Optional {tableId}.
 * @return {Object} Result with sql/params.
 */
function handleListPartitions(params) {
  if (stryMutAct_9fa48("4145")) {
    {}
  } else {
    stryCov_9fa48("4145");
    let sql = stryMutAct_9fa48("4146") ? `` : (stryCov_9fa48("4146"), `${SELECT_ALL_FROM} ${TABLES.PARTITIONS}`);
    const sqlParams = stryMutAct_9fa48("4147") ? ["Stryker was here"] : (stryCov_9fa48("4147"), []);
    if (stryMutAct_9fa48("4150") ? params || params.tableId : stryMutAct_9fa48("4149") ? false : stryMutAct_9fa48("4148") ? true : (stryCov_9fa48("4148", "4149", "4150"), params && params.tableId)) {
      if (stryMutAct_9fa48("4151")) {
        {}
      } else {
        stryCov_9fa48("4151");
        sqlParams.push(params.tableId);
        sql += stryMutAct_9fa48("4152") ? `` : (stryCov_9fa48("4152"), ` ${SQL.WHERE} ${COLUMN.TABLE_ID} = ?1`);
      }
    }
    return stryMutAct_9fa48("4153") ? {} : (stryCov_9fa48("4153"), {
      success: stryMutAct_9fa48("4154") ? false : (stryCov_9fa48("4154"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Handle list latency groups command.
 * Returns SQL to query all latency groups.
 * @param {Object} _params - Unused.
 * @return {Object} Result with sql/params.
 */
function handleListLatencyGroups(_params) {
  if (stryMutAct_9fa48("4155")) {
    {}
  } else {
    stryCov_9fa48("4155");
    return stryMutAct_9fa48("4156") ? {} : (stryCov_9fa48("4156"), {
      success: stryMutAct_9fa48("4157") ? false : (stryCov_9fa48("4157"), true),
      sql: stryMutAct_9fa48("4158") ? `` : (stryCov_9fa48("4158"), `${SELECT_ALL_FROM} ${TABLES.LATENCY_GROUPS}`),
      params: stryMutAct_9fa48("4159") ? ["Stryker was here"] : (stryCov_9fa48("4159"), [])
    });
  }
}

/**
 * Handle list inter-group latencies command.
 * Returns SQL to query inter-group latencies with optional filters.
 * @param {Object} params - Optional {sourceGroupId, targetGroupId}.
 * @return {Object} Result with sql/params.
 */
function handleListInterGroupLatencies(params) {
  if (stryMutAct_9fa48("4160")) {
    {}
  } else {
    stryCov_9fa48("4160");
    let sql = stryMutAct_9fa48("4161") ? `` : (stryCov_9fa48("4161"), `${SELECT_ALL_FROM} ${TABLES.INTER_GROUP_LATENCIES}`);
    const filters = stryMutAct_9fa48("4162") ? ["Stryker was here"] : (stryCov_9fa48("4162"), []);
    const sqlParams = stryMutAct_9fa48("4163") ? ["Stryker was here"] : (stryCov_9fa48("4163"), []);
    if (stryMutAct_9fa48("4166") ? params || params.sourceGroupId : stryMutAct_9fa48("4165") ? false : stryMutAct_9fa48("4164") ? true : (stryCov_9fa48("4164", "4165", "4166"), params && params.sourceGroupId)) {
      if (stryMutAct_9fa48("4167")) {
        {}
      } else {
        stryCov_9fa48("4167");
        sqlParams.push(params.sourceGroupId);
        filters.push(stryMutAct_9fa48("4168") ? `` : (stryCov_9fa48("4168"), `${COLUMN.SOURCE_GROUP_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4171") ? params || params.targetGroupId : stryMutAct_9fa48("4170") ? false : stryMutAct_9fa48("4169") ? true : (stryCov_9fa48("4169", "4170", "4171"), params && params.targetGroupId)) {
      if (stryMutAct_9fa48("4172")) {
        {}
      } else {
        stryCov_9fa48("4172");
        sqlParams.push(params.targetGroupId);
        filters.push(stryMutAct_9fa48("4173") ? `` : (stryCov_9fa48("4173"), `${COLUMN.TARGET_GROUP_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4177") ? filters.length <= 0 : stryMutAct_9fa48("4176") ? filters.length >= 0 : stryMutAct_9fa48("4175") ? false : stryMutAct_9fa48("4174") ? true : (stryCov_9fa48("4174", "4175", "4176", "4177"), filters.length > 0)) {
      if (stryMutAct_9fa48("4178")) {
        {}
      } else {
        stryCov_9fa48("4178");
        sql += stryMutAct_9fa48("4179") ? `` : (stryCov_9fa48("4179"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("4180") ? `` : (stryCov_9fa48("4180"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("4181") ? {} : (stryCov_9fa48("4181"), {
      success: stryMutAct_9fa48("4182") ? false : (stryCov_9fa48("4182"), true),
      sql,
      params: sqlParams
    });
  }
}
export { ADMIN_META_ACTION, ADMIN_META_ERROR_MSG, WASM_DELEGATION_ACTIONS, CACHE_DUMP_TABLES, handleExecuteQuery, handleGetCacheDump, handleGetNodeStatus, handleListServices, handleListNodes, handleListPartitions, handleListLatencyGroups, handleListInterGroupLatencies };