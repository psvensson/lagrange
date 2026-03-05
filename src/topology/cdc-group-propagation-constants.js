/**
 * Constants for CDCGroupPropagationService.
 */

const CDC_GROUP_PROPAGATION_SUBSYSTEM = 'cdc-group-propagation';

const CDC_GROUP_PROPAGATION_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const CDC_GROUP_PROPAGATION_EVENT = Object.freeze({
  PROPAGATED: 'cdcGroupPropagated',
  SAFE_FALLBACK: 'cdcGroupSafeFallback',
});

const CDC_GROUP_PROPAGATION_REASON = Object.freeze({
  CONFIG_GROUPED_MODE: 'config_grouped_mode',
  CONFIG_SAFE_MODE: 'config_safe_mode',
  MISSING_LOCAL_GROUP: 'missing_local_group',
  MISSING_ACTIVE_GROUPS: 'missing_active_groups',
  MISSING_COORDINATOR_NODE: 'missing_coordinator_node',
  MISSING_COORDINATOR_ADDRESS: 'missing_coordinator_address',
  MESSAGE_ROUTER_UNAVAILABLE: 'message_router_unavailable',
  GROUPED_DELIVERY_FAILURE: 'grouped_delivery_failure',
  GROUPED_DELIVERY_RECOVERED: 'grouped_delivery_recovered',
});

const CDC_GROUP_PROPAGATION_STATUS = Object.freeze({
  GROUPED: 'grouped',
  SAFE: 'safe',
});

const CDC_GROUP_PUBLICATION_MODE = Object.freeze({
  GROUPED: 'grouped',
  CONSERVATIVE_FANOUT: 'conservative_fanout',
  REPAIR_ONLY: 'repair_only',
});

const CDC_GROUP_PROPAGATION_STRATEGY = Object.freeze({
  GROUP_COORDINATOR: 'group_coordinator',
  DIRECT_FANOUT: 'direct_fanout',
});

const CDC_GROUP_PROPAGATION_RETRY = Object.freeze({
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 50,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: 1000,
});

const CDC_GROUP_PROPAGATION_LOG_MSG = Object.freeze({
  INITIALIZED: 'CDCGroupPropagationService initialized',
  STARTED: 'CDCGroupPropagationService started',
  STOPPED: 'CDCGroupPropagationService stopped',
  PROPAGATED_GROUPED:
    'CDC event propagated through group-coordinator strategy',
  PROPAGATED_SAFE:
    'CDC event propagated through direct-fanout strategy',
  SAFE_FALLBACK:
    'Falling back to direct-fanout CDC propagation strategy',
  GROUPED_DELIVERY_FAILED: 'Grouped propagation delivery failed',
  RETRYING_DELIVERY_FAILURES: 'Retrying CDC propagation delivery failures',
  DELIVERY_RETRY_EXHAUSTED: 'CDC propagation delivery retries exhausted',
});

const CDC_GROUP_PROPAGATION_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'CDCGroupPropagationService requires nodeId',
  MISSING_CACHE: 'CDCGroupPropagationService requires systemTableCache',
  MISSING_TREE_SERVICE: 'CDCGroupPropagationService requires latencyTreeService',
  NOT_INITIALIZED: 'CDCGroupPropagationService must be initialized first',
  MISSING_MESSAGE_GROUP_SERVICE:
    'CDC propagation requires sourceMessageGroupService',
  MISSING_CDC_PAYLOAD: 'CDC propagation requires tableName/operation/data',
});

export {
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_EVENT,
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_SUBSYSTEM,
};
