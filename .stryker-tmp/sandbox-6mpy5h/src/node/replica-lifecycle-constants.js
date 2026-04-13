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
import { NUM, STRING, TIME_MS } from '../constants/index.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
const REPLICA_LIFECYCLE_SUBSYSTEM = stryMutAct_9fa48("95434") ? "" : (stryCov_9fa48("95434"), 'replica-lifecycle');
const REPLICA_LIFECYCLE_STATUS = Object.freeze(stryMutAct_9fa48("95435") ? {} : (stryCov_9fa48("95435"), {
  STARTING: stryMutAct_9fa48("95436") ? "" : (stryCov_9fa48("95436"), 'starting'),
  SYNCING: stryMutAct_9fa48("95437") ? "" : (stryCov_9fa48("95437"), 'syncing'),
  ACTIVE: stryMutAct_9fa48("95438") ? "" : (stryCov_9fa48("95438"), 'active'),
  STOPPING: stryMutAct_9fa48("95439") ? "" : (stryCov_9fa48("95439"), 'stopping'),
  STOPPED: stryMutAct_9fa48("95440") ? "" : (stryCov_9fa48("95440"), 'stopped'),
  FAILED: stryMutAct_9fa48("95441") ? "" : (stryCov_9fa48("95441"), 'failed')
}));
const REPLICA_LIFECYCLE_VALID_TRANSITIONS = Object.freeze(stryMutAct_9fa48("95442") ? {} : (stryCov_9fa48("95442"), {
  [REPLICA_LIFECYCLE_STATUS.STARTING]: stryMutAct_9fa48("95443") ? [] : (stryCov_9fa48("95443"), [REPLICA_LIFECYCLE_STATUS.SYNCING, REPLICA_LIFECYCLE_STATUS.FAILED]),
  [REPLICA_LIFECYCLE_STATUS.SYNCING]: stryMutAct_9fa48("95444") ? [] : (stryCov_9fa48("95444"), [REPLICA_LIFECYCLE_STATUS.ACTIVE, REPLICA_LIFECYCLE_STATUS.FAILED]),
  [REPLICA_LIFECYCLE_STATUS.ACTIVE]: stryMutAct_9fa48("95445") ? [] : (stryCov_9fa48("95445"), [REPLICA_LIFECYCLE_STATUS.STOPPING, REPLICA_LIFECYCLE_STATUS.FAILED]),
  [REPLICA_LIFECYCLE_STATUS.STOPPING]: stryMutAct_9fa48("95446") ? [] : (stryCov_9fa48("95446"), [REPLICA_LIFECYCLE_STATUS.STOPPED, REPLICA_LIFECYCLE_STATUS.FAILED]),
  [REPLICA_LIFECYCLE_STATUS.STOPPED]: stryMutAct_9fa48("95447") ? ["Stryker was here"] : (stryCov_9fa48("95447"), []),
  [REPLICA_LIFECYCLE_STATUS.FAILED]: stryMutAct_9fa48("95448") ? ["Stryker was here"] : (stryCov_9fa48("95448"), [])
}));
const REPLICA_LIFECYCLE_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("95449") ? {} : (stryCov_9fa48("95449"), {
  CREATE_REPLICA: stryMutAct_9fa48("95450") ? "" : (stryCov_9fa48("95450"), 'CREATE_REPLICA'),
  REMOVE_REPLICA: stryMutAct_9fa48("95451") ? "" : (stryCov_9fa48("95451"), 'REMOVE_REPLICA'),
  CREATE_REPLICA_ACK: stryMutAct_9fa48("95452") ? "" : (stryCov_9fa48("95452"), 'CREATE_REPLICA_ACK'),
  REMOVE_REPLICA_ACK: stryMutAct_9fa48("95453") ? "" : (stryCov_9fa48("95453"), 'REMOVE_REPLICA_ACK')
}));
const REPLICA_LIFECYCLE_ACK_STATUS = Object.freeze(stryMutAct_9fa48("95454") ? {} : (stryCov_9fa48("95454"), {
  INITIATED: stryMutAct_9fa48("95455") ? "" : (stryCov_9fa48("95455"), 'initiated'),
  ALREADY_EXISTS: stryMutAct_9fa48("95456") ? "" : (stryCov_9fa48("95456"), 'already_exists'),
  IN_PROGRESS: stryMutAct_9fa48("95457") ? "" : (stryCov_9fa48("95457"), 'in_progress'),
  NOT_FOUND: stryMutAct_9fa48("95458") ? "" : (stryCov_9fa48("95458"), 'not_found'),
  ERROR: stryMutAct_9fa48("95459") ? "" : (stryCov_9fa48("95459"), 'error')
}));
const REPLICA_LIFECYCLE_PENDING_STATUS = Object.freeze(stryMutAct_9fa48("95460") ? {} : (stryCov_9fa48("95460"), {
  PENDING: stryMutAct_9fa48("95461") ? "" : (stryCov_9fa48("95461"), 'pending'),
  COMPLETED: stryMutAct_9fa48("95462") ? "" : (stryCov_9fa48("95462"), 'completed'),
  FAILED: stryMutAct_9fa48("95463") ? "" : (stryCov_9fa48("95463"), 'failed')
}));
const REPLICA_LIFECYCLE_LOG_MSG = Object.freeze(stryMutAct_9fa48("95464") ? {} : (stryCov_9fa48("95464"), {
  INITIALIZING: stryMutAct_9fa48("95465") ? "" : (stryCov_9fa48("95465"), 'Initializing replica lifecycle manager'),
  INITIALIZED: stryMutAct_9fa48("95466") ? "" : (stryCov_9fa48("95466"), 'Replica lifecycle manager initialized'),
  HANDLER_SET: stryMutAct_9fa48("95467") ? "" : (stryCov_9fa48("95467"), 'ReplicaHandler set for lifecycle manager'),
  CLEARING_LOCAL_REPLICAS: stryMutAct_9fa48("95468") ? "" : (stryCov_9fa48("95468"), 'Clearing local replica tracking after handler set'),
  NO_MESSAGE_GROUP: stryMutAct_9fa48("95469") ? "" : (stryCov_9fa48("95469"), 'No message group service available for handler registration'),
  HANDLERS_REGISTERED: stryMutAct_9fa48("95470") ? "" : (stryCov_9fa48("95470"), 'Registered lifecycle message handlers'),
  INVALID_TRANSITION: stryMutAct_9fa48("95471") ? "" : (stryCov_9fa48("95471"), 'Invalid status transition attempted'),
  STATUS_UPDATE: stryMutAct_9fa48("95472") ? "" : (stryCov_9fa48("95472"), 'Updating replica status'),
  CDC_UPDATE_FAILED: stryMutAct_9fa48("95473") ? "" : (stryCov_9fa48("95473"), 'CDC status update failed'),
  CREATE_REQUEST: stryMutAct_9fa48("95474") ? "" : (stryCov_9fa48("95474"), 'Received CREATE_REPLICA message'),
  CREATE_ALREADY_ACTIVE: stryMutAct_9fa48("95475") ? "" : (stryCov_9fa48("95475"), 'Replica already exists in active state'),
  CREATE_IN_PROGRESS: stryMutAct_9fa48("95476") ? "" : (stryCov_9fa48("95476"), 'Replica creation already in progress'),
  CREATE_NON_ACTIVE: stryMutAct_9fa48("95477") ? "" : (stryCov_9fa48("95477"), 'Replica exists in non-active state'),
  ASYNC_CREATE_FAILED: stryMutAct_9fa48("95478") ? "" : (stryCov_9fa48("95478"), 'Async replica creation failed'),
  CREATE_COMPLETE: stryMutAct_9fa48("95479") ? "" : (stryCov_9fa48("95479"), 'Replica creation completed successfully'),
  CREATE_FAILED: stryMutAct_9fa48("95480") ? "" : (stryCov_9fa48("95480"), 'Replica creation failed'),
  STATUS_FAILED_UPDATE: stryMutAct_9fa48("95481") ? "" : (stryCov_9fa48("95481"), 'Failed to update replica status to failed'),
  REMOVE_REQUEST: stryMutAct_9fa48("95482") ? "" : (stryCov_9fa48("95482"), 'Received REMOVE_REPLICA message'),
  REMOVE_NOT_FOUND: stryMutAct_9fa48("95483") ? "" : (stryCov_9fa48("95483"), 'Replica not found for removal'),
  REMOVE_IN_PROGRESS: stryMutAct_9fa48("95484") ? "" : (stryCov_9fa48("95484"), 'Replica removal already in progress'),
  ASYNC_REMOVE_FAILED: stryMutAct_9fa48("95485") ? "" : (stryCov_9fa48("95485"), 'Async replica removal failed'),
  GRACEFUL_SHUTDOWN: stryMutAct_9fa48("95486") ? "" : (stryCov_9fa48("95486"), 'Initiating graceful shutdown'),
  REMOVE_COMPLETE: stryMutAct_9fa48("95487") ? "" : (stryCov_9fa48("95487"), 'Replica removal completed successfully'),
  REMOVE_FAILED: stryMutAct_9fa48("95488") ? "" : (stryCov_9fa48("95488"), 'Replica removal failed'),
  RAFT_SYNC_START: stryMutAct_9fa48("95489") ? "" : (stryCov_9fa48("95489"), 'Starting Raft log sync'),
  RAFT_SYNC_COMPLETE: stryMutAct_9fa48("95490") ? "" : (stryCov_9fa48("95490"), 'Raft log sync completed'),
  CLEANUP_RESOURCES: stryMutAct_9fa48("95491") ? "" : (stryCov_9fa48("95491"), 'Cleaning up replica resources'),
  REMOVED_DB_FILE: stryMutAct_9fa48("95492") ? "" : (stryCov_9fa48("95492"), 'Removed database file'),
  REMOVED_EMPTY_DIR: stryMutAct_9fa48("95493") ? "" : (stryCov_9fa48("95493"), 'Removed empty partition directory'),
  CLEANUP_FAILED: stryMutAct_9fa48("95494") ? "" : (stryCov_9fa48("95494"), 'Error cleaning up replica resources'),
  RECOVERY_START: stryMutAct_9fa48("95495") ? "" : (stryCov_9fa48("95495"), 'Handling node recovery - checking for orphaned replicas'),
  RECOVERY_CACHE_MISSING: stryMutAct_9fa48("95496") ? "" : (stryCov_9fa48("95496"), 'No system table cache available for recovery check'),
  RECOVERY_FOUND: stryMutAct_9fa48("95497") ? "" : (stryCov_9fa48("95497"), 'Found orphaned replicas in transitional states'),
  RECOVERY_PROCESSING: stryMutAct_9fa48("95498") ? "" : (stryCov_9fa48("95498"), 'Processing orphaned replica'),
  RECOVERY_MARKED_FAILED: stryMutAct_9fa48("95499") ? "" : (stryCov_9fa48("95499"), 'Marked orphaned replica as failed'),
  RECOVERY_COMPLETED_REMOVAL: stryMutAct_9fa48("95500") ? "" : (stryCov_9fa48("95500"), 'Completed removal of stopping replica'),
  RECOVERY_FAILED: stryMutAct_9fa48("95501") ? "" : (stryCov_9fa48("95501"), 'Failed to clean up orphaned replica'),
  EXPIRED_OPERATIONS_CLEANED: stryMutAct_9fa48("95502") ? "" : (stryCov_9fa48("95502"), 'Cleaned up expired pending operations'),
  ALREADY_REGISTERED: stryMutAct_9fa48("95503") ? "" : (stryCov_9fa48("95503"), 'Replica already registered'),
  REGISTERED_REPLICA: stryMutAct_9fa48("95504") ? "" : (stryCov_9fa48("95504"), 'Registered existing replica'),
  SHUTTING_DOWN: stryMutAct_9fa48("95505") ? "" : (stryCov_9fa48("95505"), 'Shutting down replica lifecycle manager')
}));
const REPLICA_LIFECYCLE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("95506") ? {} : (stryCov_9fa48("95506"), {
  invalidTransition: stryMutAct_9fa48("95507") ? () => undefined : (stryCov_9fa48("95507"), (currentStatus, newStatus) => stryMutAct_9fa48("95508") ? `` : (stryCov_9fa48("95508"), `Invalid status transition: ${currentStatus} -> ${newStatus}`)),
  statusUpdateFailed: stryMutAct_9fa48("95509") ? () => undefined : (stryCov_9fa48("95509"), error => stryMutAct_9fa48("95510") ? `` : (stryCov_9fa48("95510"), `Failed to update replica status: ${error}`)),
  replicaServiceMissing: stryMutAct_9fa48("95511") ? () => undefined : (stryCov_9fa48("95511"), replicaId => stryMutAct_9fa48("95512") ? `` : (stryCov_9fa48("95512"), `Replica service not found: ${replicaId}`)),
  RECOVERY_CLEANUP_ERROR: stryMutAct_9fa48("95513") ? "" : (stryCov_9fa48("95513"), 'Node recovery cleanup'),
  MISSING_SYSTEM_TABLE_CACHE: stryMutAct_9fa48("95514") ? "" : (stryCov_9fa48("95514"), 'ReplicaLifecycleManager requires systemTableCache'),
  REPLICA_HANDLER_REQUIRED: stryMutAct_9fa48("95515") ? "" : (stryCov_9fa48("95515"), 'ReplicaHandler or createPartitionService is required for lifecycle operations')
}));
const REPLICA_LIFECYCLE_EVENT = Object.freeze(stryMutAct_9fa48("95516") ? {} : (stryCov_9fa48("95516"), {
  STATUS_CHANGED: stryMutAct_9fa48("95517") ? "" : (stryCov_9fa48("95517"), 'statusChanged'),
  CREATED: stryMutAct_9fa48("95518") ? "" : (stryCov_9fa48("95518"), 'replicaCreated'),
  CREATION_FAILED: stryMutAct_9fa48("95519") ? "" : (stryCov_9fa48("95519"), 'replicaCreationFailed'),
  REMOVED: stryMutAct_9fa48("95520") ? "" : (stryCov_9fa48("95520"), 'replicaRemoved'),
  REMOVAL_FAILED: stryMutAct_9fa48("95521") ? "" : (stryCov_9fa48("95521"), 'replicaRemovalFailed'),
  RECOVERY_COMPLETE: stryMutAct_9fa48("95522") ? "" : (stryCov_9fa48("95522"), 'recoveryComplete'),
  SHUTDOWN: stryMutAct_9fa48("95523") ? "" : (stryCov_9fa48("95523"), 'shutdown')
}));
const REPLICA_LIFECYCLE_DEFAULT = Object.freeze(stryMutAct_9fa48("95524") ? {} : (stryCov_9fa48("95524"), {
  OPERATION_TIMEOUT_MS: stryMutAct_9fa48("95525") ? TIME_MS.MINUTE * NUM.TWO : (stryCov_9fa48("95525"), TIME_MS.MINUTE / NUM.TWO),
  SYNC_TIMEOUT_MS: TIME_MS.MINUTE,
  EXPIRED_OPERATION_MAX_AGE_MS: stryMutAct_9fa48("95526") ? TIME_MS.MINUTE / NUM.FIVE : (stryCov_9fa48("95526"), TIME_MS.MINUTE * NUM.FIVE),
  UNKNOWN_NODE_ID: STRING.UNKNOWN,
  DATA_DIR: STORAGE_DEFAULT.DATA_DIR
}));
const REPLICA_LIFECYCLE_NUM = Object.freeze(stryMutAct_9fa48("95527") ? {} : (stryCov_9fa48("95527"), {
  ZERO: NUM.ZERO
}));
export { REPLICA_LIFECYCLE_ACK_STATUS, REPLICA_LIFECYCLE_DEFAULT, REPLICA_LIFECYCLE_ERROR_MSG, REPLICA_LIFECYCLE_EVENT, REPLICA_LIFECYCLE_LOG_MSG, REPLICA_LIFECYCLE_MESSAGE_TYPE, REPLICA_LIFECYCLE_NUM, REPLICA_LIFECYCLE_PENDING_STATUS, REPLICA_LIFECYCLE_STATUS, REPLICA_LIFECYCLE_SUBSYSTEM, REPLICA_LIFECYCLE_VALID_TRANSITIONS };