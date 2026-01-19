/**
 * Function Extensibility Framework - Extension points for user-defined functions.
 * Provides plugin architecture for external function executors.
 * Requirements: 34.1-34.18
 */

export {ContextManager, ContextType} from './context-manager.js';
export {FunctionQueryExecutor} from './function-query-executor.js';
export {FunctionRegistry} from './function-registry.js';
export {CDCSubscriptionManager, SubscriptionType} from './cdc-subscription-manager.js';
