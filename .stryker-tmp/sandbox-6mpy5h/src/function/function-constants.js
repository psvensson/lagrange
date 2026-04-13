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
import { CONFIG_KEY } from '../config/config-constants.js';
import { NUM, STRING, TYPEOF } from '../constants/index.js';
const FUNCTION_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("79487") ? {} : (stryCov_9fa48("79487"), {
  QUERY_EXECUTOR: stryMutAct_9fa48("79488") ? "" : (stryCov_9fa48("79488"), 'function-query-executor'),
  CDC_SUBSCRIPTION_MANAGER: stryMutAct_9fa48("79489") ? "" : (stryCov_9fa48("79489"), 'cdc-subscription-manager'),
  CONTEXT_MANAGER: stryMutAct_9fa48("79490") ? "" : (stryCov_9fa48("79490"), 'context-manager'),
  REGISTRY: stryMutAct_9fa48("79491") ? "" : (stryCov_9fa48("79491"), 'function-registry')
}));
const FUNCTION_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("79492") ? {} : (stryCov_9fa48("79492"), {
  QUERY_TIMEOUT_MS: CONFIG_KEY.FUNCTION_QUERY_TIMEOUT_MS,
  QUERY_BATCH_SIZE: CONFIG_KEY.FUNCTION_QUERY_BATCH_SIZE
}));
const FUNCTION_DEFAULT = Object.freeze(stryMutAct_9fa48("79493") ? {} : (stryCov_9fa48("79493"), {
  QUERY_TIMEOUT_MS: 30000,
  QUERY_BATCH_SIZE: 100
}));
const FUNCTION_CONTEXT_TYPE = Object.freeze(stryMutAct_9fa48("79494") ? {} : (stryCov_9fa48("79494"), {
  FUNCTION: stryMutAct_9fa48("79495") ? "" : (stryCov_9fa48("79495"), 'function'),
  SERVICE: stryMutAct_9fa48("79496") ? "" : (stryCov_9fa48("79496"), 'service'),
  USER: stryMutAct_9fa48("79497") ? "" : (stryCov_9fa48("79497"), 'user')
}));
const FUNCTION_SUBSCRIPTION_TYPE = Object.freeze(stryMutAct_9fa48("79498") ? {} : (stryCov_9fa48("79498"), {
  CALLBACK: stryMutAct_9fa48("79499") ? "" : (stryCov_9fa48("79499"), 'callback'),
  INVOKE: stryMutAct_9fa48("79500") ? "" : (stryCov_9fa48("79500"), 'invoke')
}));
const FUNCTION_CDC_MATCH_TYPE = Object.freeze(stryMutAct_9fa48("79501") ? {} : (stryCov_9fa48("79501"), {
  INSERT: stryMutAct_9fa48("79502") ? "" : (stryCov_9fa48("79502"), 'insert'),
  ENTER: stryMutAct_9fa48("79503") ? "" : (stryCov_9fa48("79503"), 'enter'),
  EXIT: stryMutAct_9fa48("79504") ? "" : (stryCov_9fa48("79504"), 'exit'),
  UPDATE: stryMutAct_9fa48("79505") ? "" : (stryCov_9fa48("79505"), 'update'),
  DELETE: stryMutAct_9fa48("79506") ? "" : (stryCov_9fa48("79506"), 'delete')
}));
const FUNCTION_CDC_OPERATION = Object.freeze(stryMutAct_9fa48("79507") ? {} : (stryCov_9fa48("79507"), {
  INSERT: stryMutAct_9fa48("79508") ? "" : (stryCov_9fa48("79508"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("79509") ? "" : (stryCov_9fa48("79509"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("79510") ? "" : (stryCov_9fa48("79510"), 'DELETE')
}));
const FUNCTION_EVENT = Object.freeze(stryMutAct_9fa48("79511") ? {} : (stryCov_9fa48("79511"), {
  SUBSCRIPTION_CREATED: stryMutAct_9fa48("79512") ? "" : (stryCov_9fa48("79512"), 'subscription-created'),
  SUBSCRIPTION_REMOVED: stryMutAct_9fa48("79513") ? "" : (stryCov_9fa48("79513"), 'subscription-removed')
}));
const FUNCTION_SEPARATOR = Object.freeze(stryMutAct_9fa48("79514") ? {} : (stryCov_9fa48("79514"), {
  SUBSCRIPTION_ID: stryMutAct_9fa48("79515") ? "" : (stryCov_9fa48("79515"), ':')
}));
const FUNCTION_LOG_LIMIT = Object.freeze(stryMutAct_9fa48("79516") ? {} : (stryCov_9fa48("79516"), {
  SQL_SNIPPET_LENGTH: NUM.HUNDRED
}));
const FUNCTION_LOG_MSG = Object.freeze(stryMutAct_9fa48("79517") ? {} : (stryCov_9fa48("79517"), {
  QUERY_EXECUTOR_INITIALIZED: stryMutAct_9fa48("79518") ? "" : (stryCov_9fa48("79518"), 'Function query executor initialized'),
  QUERY_EXECUTE_START: stryMutAct_9fa48("79519") ? "" : (stryCov_9fa48("79519"), 'Executing query via FunctionQueryExecutor'),
  QUERY_EXECUTE_SUCCESS: stryMutAct_9fa48("79520") ? "" : (stryCov_9fa48("79520"), 'Query executed successfully'),
  QUERY_EXECUTE_FAILURE: stryMutAct_9fa48("79521") ? "" : (stryCov_9fa48("79521"), 'Query execution failed'),
  STREAMING_EXECUTE_START: stryMutAct_9fa48("79522") ? "" : (stryCov_9fa48("79522"), 'Executing streaming query'),
  STREAMING_EXECUTE_COMPLETE: stryMutAct_9fa48("79523") ? "" : (stryCov_9fa48("79523"), 'Streaming query completed'),
  BATCHED_EXECUTE_COMPLETE: stryMutAct_9fa48("79524") ? "" : (stryCov_9fa48("79524"), 'Batched query completed'),
  QUERY_INVOKE_START: stryMutAct_9fa48("79525") ? "" : (stryCov_9fa48("79525"), 'Executing query then invoke'),
  QUERY_INVOKE_SUCCESS: stryMutAct_9fa48("79526") ? "" : (stryCov_9fa48("79526"), 'Query completed, function invoked'),
  QUERY_INVOKE_FAILURE: stryMutAct_9fa48("79527") ? "" : (stryCov_9fa48("79527"), 'Function invocation failed after query'),
  REGISTRY_INITIALIZED: stryMutAct_9fa48("79528") ? "" : (stryCov_9fa48("79528"), 'Function registry initialized'),
  EXECUTOR_OVERWRITE: stryMutAct_9fa48("79529") ? "" : (stryCov_9fa48("79529"), 'Overwriting existing executor'),
  EXECUTOR_REGISTERED: stryMutAct_9fa48("79530") ? "" : (stryCov_9fa48("79530"), 'Function executor registered'),
  EXECUTOR_UNREGISTERED: stryMutAct_9fa48("79531") ? "" : (stryCov_9fa48("79531"), 'Function executor unregistered'),
  INVOKING_FUNCTION: stryMutAct_9fa48("79532") ? "" : (stryCov_9fa48("79532"), 'Invoking function'),
  FUNCTION_COMPLETED: stryMutAct_9fa48("79533") ? "" : (stryCov_9fa48("79533"), 'Function completed'),
  FUNCTION_LOOKUP_FAILED: stryMutAct_9fa48("79534") ? "" : (stryCov_9fa48("79534"), 'Failed to get function'),
  FUNCTION_LOOKUP_BY_NAME_FAILED: stryMutAct_9fa48("79535") ? "" : (stryCov_9fa48("79535"), 'Failed to get function by name'),
  CONTEXT_MANAGER_INITIALIZED: stryMutAct_9fa48("79536") ? "" : (stryCov_9fa48("79536"), 'Context manager initialized'),
  CONTEXT_UPDATED: stryMutAct_9fa48("79537") ? "" : (stryCov_9fa48("79537"), 'Context updated'),
  CONTEXT_CREATED: stryMutAct_9fa48("79538") ? "" : (stryCov_9fa48("79538"), 'Context created'),
  CONTEXT_DELETE_NOT_FOUND: stryMutAct_9fa48("79539") ? "" : (stryCov_9fa48("79539"), 'Context not found for deletion'),
  CONTEXT_DELETED: stryMutAct_9fa48("79540") ? "" : (stryCov_9fa48("79540"), 'Context deleted'),
  CONTEXT_LOOKUP_FAILED: stryMutAct_9fa48("79541") ? "" : (stryCov_9fa48("79541"), 'Failed to get context'),
  CONTEXTS_BY_OWNER_FAILED: stryMutAct_9fa48("79542") ? "" : (stryCov_9fa48("79542"), 'Failed to get contexts by owner'),
  CONTEXTS_BY_TYPE_FAILED: stryMutAct_9fa48("79543") ? "" : (stryCov_9fa48("79543"), 'Failed to get contexts by type'),
  SUBSCRIPTION_MANAGER_INITIALIZED: stryMutAct_9fa48("79544") ? "" : (stryCov_9fa48("79544"), 'CDC subscription manager initialized'),
  SUBSCRIPTION_CREATED: stryMutAct_9fa48("79545") ? "" : (stryCov_9fa48("79545"), 'CDC subscription created'),
  SUBSCRIPTION_INVOKE_CREATED: stryMutAct_9fa48("79546") ? "" : (stryCov_9fa48("79546"), 'CDC subscription with invoke created'),
  SUBSCRIPTION_REMOVED: stryMutAct_9fa48("79547") ? "" : (stryCov_9fa48("79547"), 'CDC subscription removed'),
  SUBSCRIPTION_NOT_FOUND: stryMutAct_9fa48("79548") ? "" : (stryCov_9fa48("79548"), 'Subscription not found for unsubscribe'),
  SUBSCRIPTIONS_REMOVED_FOR_SUBSCRIBER: stryMutAct_9fa48("79549") ? "" : (stryCov_9fa48("79549"), 'All subscriptions removed for subscriber'),
  CDC_EVENT_HANDLING_FAILED: stryMutAct_9fa48("79550") ? "" : (stryCov_9fa48("79550"), 'Error handling CDC event for subscription'),
  CDC_CALLBACK_EXECUTED: stryMutAct_9fa48("79551") ? "" : (stryCov_9fa48("79551"), 'CDC callback executed'),
  CDC_CALLBACK_FAILED: stryMutAct_9fa48("79552") ? "" : (stryCov_9fa48("79552"), 'CDC callback failed'),
  CDC_INVOKE_MISSING_REGISTRY: stryMutAct_9fa48("79553") ? "" : (stryCov_9fa48("79553"), 'Function registry not available for invoke'),
  CDC_INVOKE_EXECUTED: stryMutAct_9fa48("79554") ? "" : (stryCov_9fa48("79554"), 'CDC function invoked'),
  CDC_INVOKE_FAILED: stryMutAct_9fa48("79555") ? "" : (stryCov_9fa48("79555"), 'CDC function invocation failed'),
  PREDICATE_COMPILE_FAILED: stryMutAct_9fa48("79556") ? "" : (stryCov_9fa48("79556"), 'Could not compile predicate, matching all'),
  PREDICATE_PARSE_FAILED: stryMutAct_9fa48("79557") ? "" : (stryCov_9fa48("79557"), 'Could not parse predicate, matching all'),
  SUBSCRIPTION_MANAGER_SHUTDOWN: stryMutAct_9fa48("79558") ? "" : (stryCov_9fa48("79558"), 'CDC subscription manager shutdown')
}));
const FUNCTION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("79559") ? {} : (stryCov_9fa48("79559"), {
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("79560") ? "" : (stryCov_9fa48("79560"), 'System table cache not available'),
  SQL_ENGINE_UNAVAILABLE: stryMutAct_9fa48("79561") ? "" : (stryCov_9fa48("79561"), 'SQL query engine not available'),
  CALLBACK_MUST_BE_FUNCTION: stryMutAct_9fa48("79562") ? "" : (stryCov_9fa48("79562"), 'Callback must be a function'),
  FUNCTION_REGISTRY_UNAVAILABLE: stryMutAct_9fa48("79563") ? "" : (stryCov_9fa48("79563"), 'Function registry not available'),
  EXECUTOR_TYPE_REQUIRED: stryMutAct_9fa48("79564") ? "" : (stryCov_9fa48("79564"), 'Executor type must be a non-empty string'),
  EXECUTOR_METHOD_REQUIRED: stryMutAct_9fa48("79565") ? "" : (stryCov_9fa48("79565"), 'Executor must have an execute(func, context, args) method'),
  FUNCTION_NOT_FOUND_PREFIX: stryMutAct_9fa48("79566") ? "" : (stryCov_9fa48("79566"), 'Function not found: '),
  EXECUTOR_NOT_FOUND_PREFIX: stryMutAct_9fa48("79567") ? "" : (stryCov_9fa48("79567"), 'No executor registered for type '),
  EXECUTOR_NOT_FOUND_SUFFIX: stryMutAct_9fa48("79568") ? "" : (stryCov_9fa48("79568"), '.'),
  EXECUTOR_AVAILABLE_PREFIX: stryMutAct_9fa48("79569") ? "" : (stryCov_9fa48("79569"), 'Available types: '),
  EXECUTOR_AVAILABLE_NONE: stryMutAct_9fa48("79570") ? "" : (stryCov_9fa48("79570"), 'none'),
  INVALID_CONTEXT_TYPE_PREFIX: stryMutAct_9fa48("79571") ? "" : (stryCov_9fa48("79571"), 'Invalid context type: '),
  VALID_CONTEXT_TYPE_PREFIX: stryMutAct_9fa48("79572") ? "" : (stryCov_9fa48("79572"), 'Valid types are: '),
  CDC_INTEGRATION_REQUIRED: stryMutAct_9fa48("79573") ? "" : (stryCov_9fa48("79573"), 'CDC integration service not available'),
  CDC_INTEGRATION_REQUIRED_FOR_POLICY: stryMutAct_9fa48("79574") ? "" : (stryCov_9fa48("79574"), 'CDC integration service not available'),
  FUNCTION_ID_REQUIRED: stryMutAct_9fa48("79575") ? "" : (stryCov_9fa48("79575"), 'Function ID is required'),
  QUERY_TIMEOUT_PREFIX: stryMutAct_9fa48("79576") ? "" : (stryCov_9fa48("79576"), 'Query timeout after '),
  QUERY_TIMEOUT_SUFFIX: stryMutAct_9fa48("79577") ? "" : (stryCov_9fa48("79577"), 'ms')
}));
const FUNCTION_DEFAULT_VALUE = Object.freeze(stryMutAct_9fa48("79578") ? {} : (stryCov_9fa48("79578"), {
  EXECUTOR_NAME_FALLBACK: stryMutAct_9fa48("79579") ? "" : (stryCov_9fa48("79579"), 'anonymous'),
  EMPTY_CONTEXT: STRING.EMPTY_JSON_OBJECT
}));
const FUNCTION_PREDICATE = Object.freeze(stryMutAct_9fa48("79580") ? {} : (stryCov_9fa48("79580"), {
  MATCH_ALL: stryMutAct_9fa48("79581") ? "" : (stryCov_9fa48("79581"), '*'),
  TRUE: stryMutAct_9fa48("79582") ? "" : (stryCov_9fa48("79582"), 'true')
}));
const FUNCTION_CDC_PREDICATE = Object.freeze(stryMutAct_9fa48("79583") ? {} : (stryCov_9fa48("79583"), {
  SIMPLE_EQUALS: stryMutAct_9fa48("79597") ? /^(\w+)\s*=\s*['"]?([^'"]+)[^'"]?$/ : stryMutAct_9fa48("79596") ? /^(\w+)\s*=\s*['"]?([^'"]+)['"]$/ : stryMutAct_9fa48("79595") ? /^(\w+)\s*=\s*['"]?(['"]+)['"]?$/ : stryMutAct_9fa48("79594") ? /^(\w+)\s*=\s*['"]?([^'"])['"]?$/ : stryMutAct_9fa48("79593") ? /^(\w+)\s*=\s*[^'"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79592") ? /^(\w+)\s*=\s*['"]([^'"]+)['"]?$/ : stryMutAct_9fa48("79591") ? /^(\w+)\s*=\S*['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79590") ? /^(\w+)\s*=\s['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79589") ? /^(\w+)\S*=\s*['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79588") ? /^(\w+)\s=\s*['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79587") ? /^(\W+)\s*=\s*['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79586") ? /^(\w)\s*=\s*['"]?([^'"]+)['"]?$/ : stryMutAct_9fa48("79585") ? /^(\w+)\s*=\s*['"]?([^'"]+)['"]?/ : stryMutAct_9fa48("79584") ? /(\w+)\s*=\s*['"]?([^'"]+)['"]?$/ : (stryCov_9fa48("79584", "79585", "79586", "79587", "79588", "79589", "79590", "79591", "79592", "79593", "79594", "79595", "79596", "79597"), /^(\w+)\s*=\s*['"]?([^'"]+)['"]?$/)
}));
export { FUNCTION_CONFIG_KEY, FUNCTION_DEFAULT, FUNCTION_LOG_MSG, FUNCTION_SUBSYSTEM };
export { FUNCTION_CDC_MATCH_TYPE, FUNCTION_CDC_OPERATION, FUNCTION_CDC_PREDICATE, FUNCTION_CONTEXT_TYPE, FUNCTION_DEFAULT_VALUE, FUNCTION_ERROR_MSG, FUNCTION_EVENT, FUNCTION_LOG_LIMIT, FUNCTION_PREDICATE, FUNCTION_SEPARATOR, FUNCTION_SUBSCRIPTION_TYPE, TYPEOF };