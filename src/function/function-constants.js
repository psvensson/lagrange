import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STRING, TYPEOF} from '../constants/index.js';

const FUNCTION_SUBSYSTEM = Object.freeze({
  QUERY_EXECUTOR: 'function-query-executor',
  CDC_SUBSCRIPTION_MANAGER: 'cdc-subscription-manager',
  CONTEXT_MANAGER: 'context-manager',
  REGISTRY: 'function-registry',
});

const FUNCTION_CONFIG_KEY = Object.freeze({
  QUERY_TIMEOUT_MS: CONFIG_KEY.FUNCTION_QUERY_TIMEOUT_MS,
  QUERY_BATCH_SIZE: CONFIG_KEY.FUNCTION_QUERY_BATCH_SIZE,
});

const FUNCTION_DEFAULT = Object.freeze({
  QUERY_TIMEOUT_MS: 30000,
  QUERY_BATCH_SIZE: 100,
});

const FUNCTION_CONTEXT_TYPE = Object.freeze({
  FUNCTION: 'function',
  SERVICE: 'service',
  USER: 'user',
});

const FUNCTION_SUBSCRIPTION_TYPE = Object.freeze({
  CALLBACK: 'callback',
  INVOKE: 'invoke',
});

const FUNCTION_CDC_MATCH_TYPE = Object.freeze({
  INSERT: 'insert',
  ENTER: 'enter',
  EXIT: 'exit',
  UPDATE: 'update',
  DELETE: 'delete',
});

const FUNCTION_CDC_OPERATION = Object.freeze({
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});

const FUNCTION_EVENT = Object.freeze({
  SUBSCRIPTION_CREATED: 'subscription-created',
  SUBSCRIPTION_REMOVED: 'subscription-removed',
});

const FUNCTION_SEPARATOR = Object.freeze({
  SUBSCRIPTION_ID: ':',
});

const FUNCTION_LOG_LIMIT = Object.freeze({
  SQL_SNIPPET_LENGTH: NUM.HUNDRED,
});

const FUNCTION_LOG_MSG = Object.freeze({
  QUERY_EXECUTOR_INITIALIZED: 'Function query executor initialized',
  QUERY_EXECUTE_START: 'Executing query via FunctionQueryExecutor',
  QUERY_EXECUTE_SUCCESS: 'Query executed successfully',
  QUERY_EXECUTE_FAILURE: 'Query execution failed',
  STREAMING_EXECUTE_START: 'Executing streaming query',
  STREAMING_EXECUTE_COMPLETE: 'Streaming query completed',
  BATCHED_EXECUTE_COMPLETE: 'Batched query completed',
  QUERY_INVOKE_START: 'Executing query then invoke',
  QUERY_INVOKE_SUCCESS: 'Query completed, function invoked',
  QUERY_INVOKE_FAILURE: 'Function invocation failed after query',
  REGISTRY_INITIALIZED: 'Function registry initialized',
  EXECUTOR_OVERWRITE: 'Overwriting existing executor',
  EXECUTOR_REGISTERED: 'Function executor registered',
  EXECUTOR_UNREGISTERED: 'Function executor unregistered',
  INVOKING_FUNCTION: 'Invoking function',
  FUNCTION_COMPLETED: 'Function completed',
  FUNCTION_LOOKUP_FAILED: 'Failed to get function',
  FUNCTION_LOOKUP_BY_NAME_FAILED: 'Failed to get function by name',
  CONTEXT_MANAGER_INITIALIZED: 'Context manager initialized',
  CONTEXT_UPDATED: 'Context updated',
  CONTEXT_CREATED: 'Context created',
  CONTEXT_DELETE_NOT_FOUND: 'Context not found for deletion',
  CONTEXT_DELETED: 'Context deleted',
  CONTEXT_LOOKUP_FAILED: 'Failed to get context',
  CONTEXTS_BY_OWNER_FAILED: 'Failed to get contexts by owner',
  CONTEXTS_BY_TYPE_FAILED: 'Failed to get contexts by type',
  SUBSCRIPTION_MANAGER_INITIALIZED: 'CDC subscription manager initialized',
  SUBSCRIPTION_CREATED: 'CDC subscription created',
  SUBSCRIPTION_INVOKE_CREATED: 'CDC subscription with invoke created',
  SUBSCRIPTION_REMOVED: 'CDC subscription removed',
  SUBSCRIPTION_NOT_FOUND: 'Subscription not found for unsubscribe',
  SUBSCRIPTIONS_REMOVED_FOR_SUBSCRIBER: 'All subscriptions removed for subscriber',
  CDC_EVENT_HANDLING_FAILED: 'Error handling CDC event for subscription',
  CDC_CALLBACK_EXECUTED: 'CDC callback executed',
  CDC_CALLBACK_FAILED: 'CDC callback failed',
  CDC_INVOKE_MISSING_REGISTRY: 'Function registry not available for invoke',
  CDC_INVOKE_EXECUTED: 'CDC function invoked',
  CDC_INVOKE_FAILED: 'CDC function invocation failed',
  PREDICATE_COMPILE_FAILED: 'Could not compile predicate, matching all',
  PREDICATE_PARSE_FAILED: 'Could not parse predicate, matching all',
  SUBSCRIPTION_MANAGER_SHUTDOWN: 'CDC subscription manager shutdown',
});

const FUNCTION_ERROR_MSG = Object.freeze({
  SYSTEM_TABLE_CACHE_REQUIRED: 'System table cache not available',
  SQL_ENGINE_UNAVAILABLE: 'SQL query engine not available',
  CALLBACK_MUST_BE_FUNCTION: 'Callback must be a function',
  FUNCTION_REGISTRY_UNAVAILABLE: 'Function registry not available',
  EXECUTOR_TYPE_REQUIRED: 'Executor type must be a non-empty string',
  EXECUTOR_METHOD_REQUIRED: 'Executor must have an execute(func, context, args) method',
  FUNCTION_NOT_FOUND_PREFIX: 'Function not found: ',
  EXECUTOR_NOT_FOUND_PREFIX: 'No executor registered for type ',
  EXECUTOR_NOT_FOUND_SUFFIX: '.',
  EXECUTOR_AVAILABLE_PREFIX: 'Available types: ',
  EXECUTOR_AVAILABLE_NONE: 'none',
  INVALID_CONTEXT_TYPE_PREFIX: 'Invalid context type: ',
  VALID_CONTEXT_TYPE_PREFIX: 'Valid types are: ',
  CDC_INTEGRATION_REQUIRED: 'CDC integration service not available',
  CDC_INTEGRATION_REQUIRED_FOR_POLICY: 'CDC integration service not available',
  FUNCTION_ID_REQUIRED: 'Function ID is required',
  QUERY_TIMEOUT_PREFIX: 'Query timeout after ',
  QUERY_TIMEOUT_SUFFIX: 'ms',
});

const FUNCTION_DEFAULT_VALUE = Object.freeze({
  EXECUTOR_NAME_FALLBACK: 'anonymous',
  EMPTY_CONTEXT: STRING.EMPTY_JSON_OBJECT,
});

const FUNCTION_PREDICATE = Object.freeze({
  MATCH_ALL: '*',
  TRUE: 'true',
});

const FUNCTION_CDC_PREDICATE = Object.freeze({
  SIMPLE_EQUALS: /^(\w+)\s*=\s*['"]?([^'"]+)['"]?$/,
});

export {FUNCTION_CONFIG_KEY, FUNCTION_DEFAULT, FUNCTION_LOG_MSG, FUNCTION_SUBSYSTEM};
export {
  FUNCTION_CDC_MATCH_TYPE,
  FUNCTION_CDC_OPERATION,
  FUNCTION_CDC_PREDICATE,
  FUNCTION_CONTEXT_TYPE,
  FUNCTION_DEFAULT_VALUE,
  FUNCTION_ERROR_MSG,
  FUNCTION_EVENT,
  FUNCTION_LOG_LIMIT,
  FUNCTION_PREDICATE,
  FUNCTION_SEPARATOR,
  FUNCTION_SUBSCRIPTION_TYPE,
  TYPEOF,
};
