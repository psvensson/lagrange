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
import { NUM, STRING, TIME_MS, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
const REPLICA_HANDLER_SUBSYSTEM = stryMutAct_9fa48("93875") ? "" : (stryCov_9fa48("93875"), 'replica-handler');
const REPLICA_HANDLER_DEFAULT = Object.freeze(stryMutAct_9fa48("93876") ? {} : (stryCov_9fa48("93876"), {
  NODE_ID: STRING.UNKNOWN,
  DATA_DIR: STORAGE_DEFAULT.DATA_DIR,
  SYNC_TIMEOUT_MS: TIME_MS.MINUTE
}));
const REPLICA_HANDLER_ADDRESS = Object.freeze(stryMutAct_9fa48("93877") ? {} : (stryCov_9fa48("93877"), {
  SERVICE_SEGMENT: stryMutAct_9fa48("93878") ? "" : (stryCov_9fa48("93878"), 'service'),
  HANDLER_ID: stryMutAct_9fa48("93879") ? "" : (stryCov_9fa48("93879"), 'replica-handler')
}));
const REPLICA_HANDLER_LOG_MSG = Object.freeze(stryMutAct_9fa48("93880") ? {} : (stryCov_9fa48("93880"), {
  INITIALIZING: stryMutAct_9fa48("93881") ? "" : (stryCov_9fa48("93881"), 'Initializing ReplicaHandler'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("93882") ? "" : (stryCov_9fa48("93882"), 'ReplicaHandler received message'),
  CREATE_REQUEST: stryMutAct_9fa48("93883") ? "" : (stryCov_9fa48("93883"), 'Handling CREATE_REPLICA request'),
  CREATE_MISSING_FIELDS: stryMutAct_9fa48("93884") ? "" : (stryCov_9fa48("93884"), 'CREATE_REPLICA missing required fields'),
  CREATE_ALREADY_ACTIVE: stryMutAct_9fa48("93885") ? "" : (stryCov_9fa48("93885"), 'Replica already exists in active state'),
  CREATE_IN_PROGRESS: stryMutAct_9fa48("93886") ? "" : (stryCov_9fa48("93886"), 'Replica creation already in progress'),
  WAITING_METADATA_PROPAGATION: stryMutAct_9fa48("93887") ? "" : (stryCov_9fa48("93887"), 'Waiting for partition/table metadata propagation before replica creation'),
  HYDRATED_METADATA_FROM_QUERY: stryMutAct_9fa48("93888") ? "" : (stryCov_9fa48("93888"), 'Hydrated replica metadata from authoritative system-table query'),
  METADATA_HYDRATION_QUERY_FAILED: stryMutAct_9fa48("93889") ? "" : (stryCov_9fa48("93889"), 'Failed to hydrate replica metadata from authoritative system-table query'),
  WAITING_VOTER_READY: stryMutAct_9fa48("93890") ? "" : (stryCov_9fa48("93890"), 'Waiting for replica voter-ready activation'),
  VOTER_READY_ACTIVATED: stryMutAct_9fa48("93891") ? "" : (stryCov_9fa48("93891"), 'Replica reached voter-ready activation state'),
  VOTER_READY_TIMEOUT: stryMutAct_9fa48("93892") ? "" : (stryCov_9fa48("93892"), 'Replica did not reach voter-ready activation before timeout'),
  OPERATION_IN_PROGRESS: stryMutAct_9fa48("93893") ? "" : (stryCov_9fa48("93893"), 'Operation already in progress'),
  OPERATION_NOT_FOUND: stryMutAct_9fa48("93894") ? "" : (stryCov_9fa48("93894"), 'Replica operation not found in system table cache'),
  ASYNC_CREATE_FAILED: stryMutAct_9fa48("93895") ? "" : (stryCov_9fa48("93895"), 'Async replica creation failed'),
  CREATE_COMPLETED: stryMutAct_9fa48("93896") ? "" : (stryCov_9fa48("93896"), 'Replica creation completed'),
  CREATE_FAILED: stryMutAct_9fa48("93897") ? "" : (stryCov_9fa48("93897"), 'Replica creation failed'),
  REMOVE_REQUEST: stryMutAct_9fa48("93898") ? "" : (stryCov_9fa48("93898"), 'Handling REMOVE_REPLICA request'),
  REMOVE_MISSING_FIELDS: stryMutAct_9fa48("93899") ? "" : (stryCov_9fa48("93899"), 'REMOVE_REPLICA missing required fields'),
  REMOVE_NOT_FOUND: stryMutAct_9fa48("93900") ? "" : (stryCov_9fa48("93900"), 'Replica not found for removal'),
  REMOVE_IN_PROGRESS: stryMutAct_9fa48("93901") ? "" : (stryCov_9fa48("93901"), 'Replica removal already in progress'),
  REMOVE_ALREADY_REMOVED: stryMutAct_9fa48("93902") ? "" : (stryCov_9fa48("93902"), 'Replica already removed'),
  ASYNC_REMOVE_FAILED: stryMutAct_9fa48("93903") ? "" : (stryCov_9fa48("93903"), 'Async replica removal failed'),
  GRACEFUL_SHUTDOWN: stryMutAct_9fa48("93904") ? "" : (stryCov_9fa48("93904"), 'Initiating graceful shutdown'),
  DELETE_SERVICE_ROW_FAILED: stryMutAct_9fa48("93905") ? "" : (stryCov_9fa48("93905"), 'Failed to delete service row'),
  REMOVE_COMPLETED: stryMutAct_9fa48("93906") ? "" : (stryCov_9fa48("93906"), 'Replica removal completed'),
  REMOVE_FAILED: stryMutAct_9fa48("93907") ? "" : (stryCov_9fa48("93907"), 'Replica removal failed'),
  UPDATE_STATUS: stryMutAct_9fa48("93908") ? "" : (stryCov_9fa48("93908"), 'Updating replica status'),
  CDC_UNAVAILABLE: stryMutAct_9fa48("93909") ? "" : (stryCov_9fa48("93909"), 'CDC integration service not available'),
  UPDATE_STATUS_FAILED: stryMutAct_9fa48("93910") ? "" : (stryCov_9fa48("93910"), 'Failed to update replica status via CDC'),
  PARSE_STEPS_HISTORY_FAILED: stryMutAct_9fa48("93911") ? "" : (stryCov_9fa48("93911"), 'Failed to parse steps_history'),
  CLEANUP_RESOURCES: stryMutAct_9fa48("93912") ? "" : (stryCov_9fa48("93912"), 'Cleaning up replica resources'),
  REMOVED_DB_FILE: stryMutAct_9fa48("93913") ? "" : (stryCov_9fa48("93913"), 'Removed database file'),
  REMOVED_EMPTY_DIR: stryMutAct_9fa48("93914") ? "" : (stryCov_9fa48("93914"), 'Removed empty partition directory'),
  CLEANUP_FAILED: stryMutAct_9fa48("93915") ? "" : (stryCov_9fa48("93915"), 'Error cleaning up replica resources'),
  ALREADY_REGISTERED: stryMutAct_9fa48("93916") ? "" : (stryCov_9fa48("93916"), 'Replica already registered'),
  REGISTERED_REPLICA: stryMutAct_9fa48("93917") ? "" : (stryCov_9fa48("93917"), 'Registered existing replica'),
  NO_MESSAGE_ROUTER: stryMutAct_9fa48("93918") ? "" : (stryCov_9fa48("93918"), 'No message router provided for registration'),
  REGISTERED_ROUTER: stryMutAct_9fa48("93919") ? "" : (stryCov_9fa48("93919"), 'Registered ReplicaHandler with message router'),
  UNREGISTERED_ROUTER: stryMutAct_9fa48("93920") ? "" : (stryCov_9fa48("93920"), 'Unregistered ReplicaHandler from message router'),
  SHUTTING_DOWN: stryMutAct_9fa48("93921") ? "" : (stryCov_9fa48("93921"), 'Shutting down ReplicaHandler')
}));
const REPLICA_HANDLER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("93922") ? {} : (stryCov_9fa48("93922"), {
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("93923") ? () => undefined : (stryCov_9fa48("93923"), type => stryMutAct_9fa48("93924") ? `` : (stryCov_9fa48("93924"), `Unknown message type: ${type}`)),
  CREATE_PARTITION_SERVICE_REQUIRED: stryMutAct_9fa48("93925") ? "" : (stryCov_9fa48("93925"), 'ReplicaHandler requires createPartitionService'),
  CREATE_REQUIRED_FIELDS: stryMutAct_9fa48("93926") ? "" : (stryCov_9fa48("93926"), 'CREATE_REPLICA requires operationId, partitionId, and replicaId'),
  CDC_REQUIRED: stryMutAct_9fa48("93927") ? "" : (stryCov_9fa48("93927"), 'ReplicaHandler requires cdcIntegrationService'),
  REMOVE_REQUIRED_FIELDS: stryMutAct_9fa48("93928") ? "" : (stryCov_9fa48("93928"), 'REMOVE_REPLICA requires operationId, partitionId, and replicaId'),
  CACHE_NOT_AVAILABLE: stryMutAct_9fa48("93929") ? "" : (stryCov_9fa48("93929"), 'System table cache not available'),
  CACHE_MISSING_FILTER: stryMutAct_9fa48("93930") ? "" : (stryCov_9fa48("93930"), 'System table cache missing filter'),
  PARTITION_METADATA_MISSING: stryMutAct_9fa48("93931") ? () => undefined : (stryCov_9fa48("93931"), partitionId => stryMutAct_9fa48("93932") ? `` : (stryCov_9fa48("93932"), `Partition metadata not found for ${partitionId}`)),
  TABLE_METADATA_MISSING: stryMutAct_9fa48("93933") ? () => undefined : (stryCov_9fa48("93933"), tableId => stryMutAct_9fa48("93934") ? `` : (stryCov_9fa48("93934"), `Table metadata not found for ${tableId}`)),
  SCHEMA_PARSE_FAILED: stryMutAct_9fa48("93935") ? () => undefined : (stryCov_9fa48("93935"), message => stryMutAct_9fa48("93936") ? `` : (stryCov_9fa48("93936"), `Failed to parse schema_definition: ${message}`))
}));
const REPLICA_HANDLER_EVENT = Object.freeze(stryMutAct_9fa48("93937") ? {} : (stryCov_9fa48("93937"), {
  CREATED: stryMutAct_9fa48("93938") ? "" : (stryCov_9fa48("93938"), 'replicaCreated'),
  CREATION_FAILED: stryMutAct_9fa48("93939") ? "" : (stryCov_9fa48("93939"), 'replicaCreationFailed'),
  REMOVED: stryMutAct_9fa48("93940") ? "" : (stryCov_9fa48("93940"), 'replicaRemoved'),
  REMOVAL_FAILED: stryMutAct_9fa48("93941") ? "" : (stryCov_9fa48("93941"), 'replicaRemovalFailed'),
  SHUTDOWN: stryMutAct_9fa48("93942") ? "" : (stryCov_9fa48("93942"), 'shutdown')
}));
const REPLICA_HANDLER_WORKFLOW = Object.freeze(stryMutAct_9fa48("93943") ? {} : (stryCov_9fa48("93943"), {
  COMPLETION_STEPS: stryMutAct_9fa48("93944") ? [] : (stryCov_9fa48("93944"), [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.FAILED])
}));
const REPLICA_HANDLER_PROGRESS = Object.freeze(stryMutAct_9fa48("93945") ? {} : (stryCov_9fa48("93945"), {
  PREFIX: stryMutAct_9fa48("93946") ? "" : (stryCov_9fa48("93946"), '[replica-create]'),
  SPINNER_IDLE: stryMutAct_9fa48("93947") ? "" : (stryCov_9fa48("93947"), '|'),
  STAGE_RESOLVING_CONTEXT: stryMutAct_9fa48("93948") ? "" : (stryCov_9fa48("93948"), 'resolving_context'),
  STAGE_WAITING_VOTER_READY: stryMutAct_9fa48("93949") ? "" : (stryCov_9fa48("93949"), 'waiting_voter_ready')
}));
const REPLICA_HANDLER_SERVICE = Object.freeze(stryMutAct_9fa48("93950") ? {} : (stryCov_9fa48("93950"), {
  TYPE: SERVICE_TYPE.PARTITION
}));
const REPLICA_HANDLER_TYPEOF = Object.freeze(stryMutAct_9fa48("93951") ? {} : (stryCov_9fa48("93951"), {
  FUNCTION: TYPEOF.FUNCTION,
  OBJECT: TYPEOF.OBJECT,
  STRING: TYPEOF.STRING
}));
const REPLICA_HANDLER_NUM = Object.freeze(stryMutAct_9fa48("93952") ? {} : (stryCov_9fa48("93952"), {
  ZERO: NUM.ZERO
}));
export { REPLICA_HANDLER_ADDRESS, REPLICA_HANDLER_DEFAULT, REPLICA_HANDLER_ERROR_MSG, REPLICA_HANDLER_EVENT, REPLICA_HANDLER_LOG_MSG, REPLICA_HANDLER_NUM, REPLICA_HANDLER_PROGRESS, REPLICA_HANDLER_SERVICE, REPLICA_HANDLER_SUBSYSTEM, REPLICA_HANDLER_TYPEOF, REPLICA_HANDLER_WORKFLOW };