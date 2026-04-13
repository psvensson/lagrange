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
import { NUM, TIME_MS, TABLES } from '../constants/index.js';
const QUERY_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("114429") ? {} : (stryCov_9fa48("114429"), {
  QUERY_ROUTER: stryMutAct_9fa48("114430") ? "" : (stryCov_9fa48("114430"), 'query-router'),
  SQL_QUERY_ENGINE: stryMutAct_9fa48("114431") ? "" : (stryCov_9fa48("114431"), 'sql-query-engine'),
  QUERY_EXECUTOR: stryMutAct_9fa48("114432") ? "" : (stryCov_9fa48("114432"), 'query-executor'),
  PARALLEL_QUERY_COORDINATOR: stryMutAct_9fa48("114433") ? "" : (stryCov_9fa48("114433"), 'parallel-query-coordinator'),
  STREAMING_AGGREGATOR: stryMutAct_9fa48("114434") ? "" : (stryCov_9fa48("114434"), 'streaming-aggregator'),
  STRAGGLER_DETECTOR: stryMutAct_9fa48("114435") ? "" : (stryCov_9fa48("114435"), 'straggler-detector'),
  SPECULATIVE_EXECUTOR: stryMutAct_9fa48("114436") ? "" : (stryCov_9fa48("114436"), 'speculative-executor'),
  PARTITION_RESOLVER: stryMutAct_9fa48("114437") ? "" : (stryCov_9fa48("114437"), 'partition-resolver'),
  TABLE_CREATION_SERVICE: stryMutAct_9fa48("114438") ? "" : (stryCov_9fa48("114438"), 'table-creation-service')
}));
const QUERY_STATUS = Object.freeze(stryMutAct_9fa48("114439") ? {} : (stryCov_9fa48("114439"), {
  PENDING: stryMutAct_9fa48("114440") ? "" : (stryCov_9fa48("114440"), 'pending'),
  RUNNING: stryMutAct_9fa48("114441") ? "" : (stryCov_9fa48("114441"), 'running'),
  COMPLETED: stryMutAct_9fa48("114442") ? "" : (stryCov_9fa48("114442"), 'completed'),
  FAILED: stryMutAct_9fa48("114443") ? "" : (stryCov_9fa48("114443"), 'failed'),
  TIMEOUT: stryMutAct_9fa48("114444") ? "" : (stryCov_9fa48("114444"), 'timeout')
}));
const QUERY_AST_TYPE = Object.freeze(stryMutAct_9fa48("114445") ? {} : (stryCov_9fa48("114445"), {
  SELECT: stryMutAct_9fa48("114446") ? "" : (stryCov_9fa48("114446"), 'SELECT'),
  INSERT: stryMutAct_9fa48("114447") ? "" : (stryCov_9fa48("114447"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("114448") ? "" : (stryCov_9fa48("114448"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("114449") ? "" : (stryCov_9fa48("114449"), 'DELETE'),
  CREATE_TABLE: stryMutAct_9fa48("114450") ? "" : (stryCov_9fa48("114450"), 'CREATE_TABLE'),
  ALTER_TABLE: stryMutAct_9fa48("114451") ? "" : (stryCov_9fa48("114451"), 'ALTER_TABLE'),
  BEGIN_TRANSACTION: stryMutAct_9fa48("114452") ? "" : (stryCov_9fa48("114452"), 'BEGIN_TRANSACTION'),
  COMMIT: stryMutAct_9fa48("114453") ? "" : (stryCov_9fa48("114453"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("114454") ? "" : (stryCov_9fa48("114454"), 'ROLLBACK')
}));
const QUERY_OPERATION = Object.freeze(stryMutAct_9fa48("114455") ? {} : (stryCov_9fa48("114455"), {
  INSERT: stryMutAct_9fa48("114456") ? "" : (stryCov_9fa48("114456"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("114457") ? "" : (stryCov_9fa48("114457"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("114458") ? "" : (stryCov_9fa48("114458"), 'DELETE'),
  CREATE_TABLE: stryMutAct_9fa48("114459") ? "" : (stryCov_9fa48("114459"), 'CREATE_TABLE'),
  ALTER_TABLE: stryMutAct_9fa48("114460") ? "" : (stryCov_9fa48("114460"), 'ALTER_TABLE'),
  BEGIN_TRANSACTION: stryMutAct_9fa48("114461") ? "" : (stryCov_9fa48("114461"), 'BEGIN_TRANSACTION'),
  COMMIT: stryMutAct_9fa48("114462") ? "" : (stryCov_9fa48("114462"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("114463") ? "" : (stryCov_9fa48("114463"), 'ROLLBACK'),
  PREPARE: stryMutAct_9fa48("114464") ? "" : (stryCov_9fa48("114464"), 'PREPARE'),
  TRANSACTION: stryMutAct_9fa48("114465") ? "" : (stryCov_9fa48("114465"), 'TRANSACTION'),
  BEGIN: stryMutAct_9fa48("114466") ? "" : (stryCov_9fa48("114466"), 'BEGIN'),
  EXPLAIN_DISTRIBUTED: stryMutAct_9fa48("114467") ? "" : (stryCov_9fa48("114467"), 'EXPLAIN_DISTRIBUTED')
}));
const QUERY_ERROR_CODE = Object.freeze(stryMutAct_9fa48("114468") ? {} : (stryCov_9fa48("114468"), {
  TABLE_NOT_FOUND: stryMutAct_9fa48("114469") ? "" : (stryCov_9fa48("114469"), 'TABLE_NOT_FOUND'),
  PARTITION_NOT_FOUND: stryMutAct_9fa48("114470") ? "" : (stryCov_9fa48("114470"), 'PARTITION_NOT_FOUND'),
  CROSS_PARTITION_TRANSACTION: stryMutAct_9fa48("114471") ? "" : (stryCov_9fa48("114471"), 'CROSS_PARTITION_TRANSACTION'),
  TRANSACTION_ACTIVE: stryMutAct_9fa48("114472") ? "" : (stryCov_9fa48("114472"), 'TRANSACTION_ACTIVE'),
  NO_TRANSACTION: stryMutAct_9fa48("114473") ? "" : (stryCov_9fa48("114473"), 'NO_TRANSACTION'),
  COMMIT_FAILED: stryMutAct_9fa48("114474") ? "" : (stryCov_9fa48("114474"), 'COMMIT_FAILED'),
  ROLLBACK_FAILED: stryMutAct_9fa48("114475") ? "" : (stryCov_9fa48("114475"), 'ROLLBACK_FAILED'),
  PREPARE_FAILED: stryMutAct_9fa48("114476") ? "" : (stryCov_9fa48("114476"), 'PREPARE_FAILED'),
  WRITE_CONFLICT: stryMutAct_9fa48("114477") ? "" : (stryCov_9fa48("114477"), 'WRITE_CONFLICT'),
  SNAPSHOT_EXPIRED: stryMutAct_9fa48("114478") ? "" : (stryCov_9fa48("114478"), 'SNAPSHOT_EXPIRED'),
  PREPARE_LOST: stryMutAct_9fa48("114479") ? "" : (stryCov_9fa48("114479"), 'PREPARE_LOST'),
  PRIMARY_KEY_REQUIRED: stryMutAct_9fa48("114480") ? "" : (stryCov_9fa48("114480"), 'PRIMARY_KEY_REQUIRED'),
  TABLE_EXISTS: stryMutAct_9fa48("114481") ? "" : (stryCov_9fa48("114481"), 'TABLE_EXISTS'),
  DISTRIBUTED_PARTICIPANT_FAILURE: stryMutAct_9fa48("114482") ? "" : (stryCov_9fa48("114482"), 'DISTRIBUTED_PARTICIPANT_FAILURE'),
  SYNTAX_ERROR: stryMutAct_9fa48("114483") ? "" : (stryCov_9fa48("114483"), 'SYNTAX_ERROR'),
  TIMEOUT: stryMutAct_9fa48("114484") ? "" : (stryCov_9fa48("114484"), 'TIMEOUT'),
  INTERNAL_ERROR: stryMutAct_9fa48("114485") ? "" : (stryCov_9fa48("114485"), 'INTERNAL_ERROR')
}));
const QUERY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("114486") ? {} : (stryCov_9fa48("114486"), {
  UNSUPPORTED_STATEMENT_PREFIX: stryMutAct_9fa48("114487") ? "" : (stryCov_9fa48("114487"), 'Unsupported statement type: '),
  TABLE_NOT_FOUND_PREFIX: stryMutAct_9fa48("114488") ? "" : (stryCov_9fa48("114488"), 'Table not found: '),
  PARTITION_FOR_KEY_PREFIX: stryMutAct_9fa48("114489") ? "" : (stryCov_9fa48("114489"), 'No partition found for key: '),
  QUERY_TIMEOUT: stryMutAct_9fa48("114490") ? "" : (stryCov_9fa48("114490"), 'Query timeout'),
  QUERY_TIMED_OUT: stryMutAct_9fa48("114491") ? "" : (stryCov_9fa48("114491"), 'Query timed out'),
  MESSAGE_ROUTER_UNAVAILABLE: stryMutAct_9fa48("114492") ? "" : (stryCov_9fa48("114492"), 'Message router not available'),
  NO_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114493") ? "" : (stryCov_9fa48("114493"), 'No service found for partition'),
  PARTITION_SERVICE_NOT_FOUND: stryMutAct_9fa48("114494") ? "" : (stryCov_9fa48("114494"), 'Partition service not found'),
  PARTITION_SERVICE_NOT_FOUND_PREFIX: stryMutAct_9fa48("114495") ? "" : (stryCov_9fa48("114495"), 'Partition service not found: '),
  QUERY_ROUTING_FAILED: stryMutAct_9fa48("114496") ? "" : (stryCov_9fa48("114496"), 'Query routing failed'),
  READ_CANDIDATES_EXHAUSTED: stryMutAct_9fa48("114497") ? "" : (stryCov_9fa48("114497"), 'All read candidates exhausted with transient errors'),
  SYSTEM_CACHE_NOT_AVAILABLE: stryMutAct_9fa48("114498") ? "" : (stryCov_9fa48("114498"), 'System cache not available for table'),
  SYSTEM_CACHE_FILTER_UNSUPPORTED: stryMutAct_9fa48("114499") ? "" : (stryCov_9fa48("114499"), 'System cache does not support filter'),
  SYSTEM_CACHE_UNSUPPORTED: stryMutAct_9fa48("114500") ? "" : (stryCov_9fa48("114500"), 'System cache does not support filter or getAll'),
  NO_ACTIVE_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114501") ? "" : (stryCov_9fa48("114501"), 'No active service found for partition'),
  NO_LEADER_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114502") ? "" : (stryCov_9fa48("114502"), 'No leader service found for partition'),
  NO_SUCCESSFUL_PARTITION_RESPONSE: stryMutAct_9fa48("114503") ? "" : (stryCov_9fa48("114503"), 'No successful responses from partitions'),
  TRANSACTION_ACTIVE: stryMutAct_9fa48("114504") ? "" : (stryCov_9fa48("114504"), 'Transaction already active for this session'),
  NO_TRANSACTION_COMMIT: stryMutAct_9fa48("114505") ? "" : (stryCov_9fa48("114505"), 'No active transaction to commit'),
  NO_TRANSACTION_ROLLBACK: stryMutAct_9fa48("114506") ? "" : (stryCov_9fa48("114506"), 'No active transaction to rollback'),
  NO_ACTIVE_TRANSACTION: stryMutAct_9fa48("114507") ? "" : (stryCov_9fa48("114507"), 'No active transaction'),
  COMMIT_FAILED: stryMutAct_9fa48("114508") ? "" : (stryCov_9fa48("114508"), 'Commit failed'),
  ROLLBACK_FAILED: stryMutAct_9fa48("114509") ? "" : (stryCov_9fa48("114509"), 'Rollback failed'),
  PREPARE_FAILED: stryMutAct_9fa48("114510") ? "" : (stryCov_9fa48("114510"), 'Prepare failed'),
  WRITE_CONFLICT: stryMutAct_9fa48("114511") ? "" : (stryCov_9fa48("114511"), 'Write conflict detected'),
  SNAPSHOT_EXPIRED: stryMutAct_9fa48("114512") ? "" : (stryCov_9fa48("114512"), 'Snapshot expired'),
  PREPARE_LOST: stryMutAct_9fa48("114513") ? "" : (stryCov_9fa48("114513"), 'Prepared state lost'),
  BEGIN_FAILED: stryMutAct_9fa48("114514") ? "" : (stryCov_9fa48("114514"), 'Failed to begin transaction'),
  CROSS_PARTITION_INSERT: stryMutAct_9fa48("114515") ? "" : (stryCov_9fa48("114515"), 'Cross-partition transactions are not supported. INSERT affects multiple partitions.'),
  CROSS_PARTITION_UPDATE: stryMutAct_9fa48("114516") ? "" : (stryCov_9fa48("114516"), 'Cross-partition transactions are not supported. UPDATE affects multiple partitions.'),
  CROSS_PARTITION_DELETE: stryMutAct_9fa48("114517") ? "" : (stryCov_9fa48("114517"), 'Cross-partition transactions are not supported. DELETE affects multiple partitions.'),
  TX_BOUND_PREFIX: stryMutAct_9fa48("114518") ? "" : (stryCov_9fa48("114518"), 'Cross-partition transactions are not supported. Transaction bound to partition '),
  TX_BOUND_INSERT_SUFFIX: stryMutAct_9fa48("114519") ? "" : (stryCov_9fa48("114519"), ', but INSERT targets partition '),
  TX_BOUND_UPDATE_SUFFIX: stryMutAct_9fa48("114520") ? "" : (stryCov_9fa48("114520"), ', but UPDATE targets different partition(s)'),
  TX_BOUND_DELETE_SUFFIX: stryMutAct_9fa48("114521") ? "" : (stryCov_9fa48("114521"), ', but DELETE targets different partition(s)'),
  TX_BOUND_OPERATION_SUFFIX: stryMutAct_9fa48("114522") ? "" : (stryCov_9fa48("114522"), ', but operation targets partition '),
  QUERY_TIMEOUT_AFTER_PREFIX: stryMutAct_9fa48("114523") ? "" : (stryCov_9fa48("114523"), 'Query timeout after '),
  QUERY_TIMEOUT_AFTER_SUFFIX: stryMutAct_9fa48("114524") ? "" : (stryCov_9fa48("114524"), 'ms'),
  PARTITION_NOT_FOUND: stryMutAct_9fa48("114525") ? "" : (stryCov_9fa48("114525"), 'Partition not found'),
  SERVICE_EXECUTE_UNSUPPORTED: stryMutAct_9fa48("114526") ? "" : (stryCov_9fa48("114526"), 'Service does not support executeQuery'),
  MAX_CONNECTIONS_PREFIX: stryMutAct_9fa48("114527") ? "" : (stryCov_9fa48("114527"), 'Query would exceed max concurrent connections: '),
  RESULT_BUFFER_LIMIT_PREFIX: stryMutAct_9fa48("114528") ? "" : (stryCov_9fa48("114528"), 'Result buffer exceeds limit: '),
  PRIMARY_KEY_REQUIRED_PREFIX: stryMutAct_9fa48("114529") ? "" : (stryCov_9fa48("114529"), 'Table \''),
  PRIMARY_KEY_REQUIRED_SUFFIX: stryMutAct_9fa48("114530") ? "" : (stryCov_9fa48("114530"), '\' must have a PRIMARY KEY defined'),
  PRIMARY_KEY_REQUIRED_DETAIL: stryMutAct_9fa48("114531") ? "" : (stryCov_9fa48("114531"), 'User tables require a PRIMARY KEY for partition key derivation.'),
  TABLE_EXISTS_PREFIX: stryMutAct_9fa48("114532") ? "" : (stryCov_9fa48("114532"), 'Table \''),
  TABLE_EXISTS_SUFFIX: stryMutAct_9fa48("114533") ? "" : (stryCov_9fa48("114533"), '\' already exists'),
  DISTRIBUTED_PARTICIPANT_FAILURE: stryMutAct_9fa48("114534") ? "" : (stryCov_9fa48("114534"), 'Distributed operation failed due to participant failures'),
  EXPLAIN_DISTRIBUTED_REQUIRES_STATEMENT: stryMutAct_9fa48("114535") ? "" : (stryCov_9fa48("114535"), 'EXPLAIN DISTRIBUTED requires a SQL statement'),
  MIGRATION_PIPELINE_UNAVAILABLE: stryMutAct_9fa48("114536") ? "" : (stryCov_9fa48("114536"), 'ALTER TABLE requires a configured migration pipeline'),
  TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED: stryMutAct_9fa48("114537") ? "" : (stryCov_9fa48("114537"), 'Table partition provisioning requires a rebalance coordinator'),
  TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED: stryMutAct_9fa48("114538") ? "" : (stryCov_9fa48("114538"), 'Table partition provisioning requires partitionId'),
  TABLE_PARTITION_METADATA_TIMEOUT_PREFIX: stryMutAct_9fa48("114539") ? "" : (stryCov_9fa48("114539"), 'Timed out waiting for table partition metadata for partition '),
  TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX: stryMutAct_9fa48("114540") ? "" : (stryCov_9fa48("114540"), 'Timed out waiting for partition service metadata for replica '),
  TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX: stryMutAct_9fa48("114541") ? "" : (stryCov_9fa48("114541"), 'Timed out waiting for active provisioning target nodes for partition '),
  TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX: stryMutAct_9fa48("114542") ? "" : (stryCov_9fa48("114542"), 'Timed out waiting for routable partition service for partition '),
  TABLE_PARTITION_LEADER_TIMEOUT_PREFIX: stryMutAct_9fa48("114543") ? "" : (stryCov_9fa48("114543"), 'Timed out waiting for partition leader service for partition '),
  TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX: stryMutAct_9fa48("114544") ? "" : (stryCov_9fa48("114544"), 'Unable to satisfy minimum routable provisioning cohort for partition '),
  TABLE_PARTITION_PROVISION_DISPATCH_FAILED: stryMutAct_9fa48("114545") ? "" : (stryCov_9fa48("114545"), 'Failed to dispatch initial table partition replica creation'),
  TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH: stryMutAct_9fa48("114546") ? "" : (stryCov_9fa48("114546"), 'Aborted provisional replica operations before initial partition dispatch'),
  MISSING_JOIN_PLAN: stryMutAct_9fa48("114547") ? "" : (stryCov_9fa48("114547"), 'Missing canonical join partition plan'),
  TABLE_SPLIT_ALREADY_IN_PROGRESS: stryMutAct_9fa48("114548") ? "" : (stryCov_9fa48("114548"), 'Table already has a partition split transition in progress'),
  TABLE_SPLIT_PRIMARY_KEY_REQUIRED: stryMutAct_9fa48("114549") ? "" : (stryCov_9fa48("114549"), 'Partition split orchestration requires a single-column partition key'),
  TABLE_SPLIT_PARTITION_NOT_FOUND: stryMutAct_9fa48("114550") ? "" : (stryCov_9fa48("114550"), 'Partition split source partition metadata not found'),
  TABLE_SPLIT_TABLE_NOT_FOUND: stryMutAct_9fa48("114551") ? "" : (stryCov_9fa48("114551"), 'Partition split table metadata not found'),
  TABLE_SPLIT_LEADER_REQUIRED: stryMutAct_9fa48("114552") ? "" : (stryCov_9fa48("114552"), 'Managed partition split must be initiated by the source partition leader'),
  TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED: stryMutAct_9fa48("114553") ? "" : (stryCov_9fa48("114553"), 'Managed partition split requires DistributedTransactionCoordinator for atomic partition metadata insertion'),
  TABLE_SPLIT_BOOTSTRAP_TARGETS_REQUIRED_PREFIX: stryMutAct_9fa48("114554") ? "" : (stryCov_9fa48("114554"), 'Managed partition split requires at least '),
  TABLE_SPLIT_SOURCE_QUORUM_REQUIRED_PREFIX: stryMutAct_9fa48("114555") ? "" : (stryCov_9fa48("114555"), 'Managed partition split requires at least '),
  TABLE_SPLIT_START_FAILED: stryMutAct_9fa48("114556") ? "" : (stryCov_9fa48("114556"), 'Failed to start partition split replication on source partition'),
  TABLE_SPLIT_INVALID_PHASE_TRANSITION: stryMutAct_9fa48("114557") ? "" : (stryCov_9fa48("114557"), 'Invalid split phase transition: phase not in owner-managed set'),
  TABLE_SPLIT_WORKFLOW_NOT_FOUND: stryMutAct_9fa48("114558") ? "" : (stryCov_9fa48("114558"), 'Split workflow not found for phase advancement')
}));
const QUERY_ROUTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("114559") ? {} : (stryCov_9fa48("114559"), {
  SYSTEM_CACHE_REQUIRED: stryMutAct_9fa48("114560") ? "" : (stryCov_9fa48("114560"), 'QueryRouter requires systemCache'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("114561") ? "" : (stryCov_9fa48("114561"), 'QueryRouter requires messageRouter'),
  noServiceCandidates: stryMutAct_9fa48("114562") ? () => undefined : (stryCov_9fa48("114562"), partitionId => stryMutAct_9fa48("114563") ? `` : (stryCov_9fa48("114563"), `No service candidates found for partition: ${partitionId}`)),
  routingTimeout: stryMutAct_9fa48("114564") ? () => undefined : (stryCov_9fa48("114564"), (partitionId, timeoutMs) => stryMutAct_9fa48("114565") ? `` : (stryCov_9fa48("114565"), `Routing timed out for partition ${partitionId} after ${timeoutMs}ms`)),
  routingFailed: stryMutAct_9fa48("114566") ? () => undefined : (stryCov_9fa48("114566"), (partitionId, retryAttempts) => stryMutAct_9fa48("114567") ? `` : (stryCov_9fa48("114567"), `Failed to route query to partition ${partitionId} after ${retryAttempts} attempts`))
}));
const QUERY_LOG_MSG = Object.freeze(stryMutAct_9fa48("114568") ? {} : (stryCov_9fa48("114568"), {
  EXECUTING_DISTRIBUTED_SELECT: stryMutAct_9fa48("114569") ? "" : (stryCov_9fa48("114569"), 'Executing distributed SELECT'),
  EXECUTING_CROSS_PARTITION_JOIN: stryMutAct_9fa48("114570") ? "" : (stryCov_9fa48("114570"), 'Executing cross-partition JOIN'),
  EXECUTING_SQL_QUERY: stryMutAct_9fa48("114571") ? "" : (stryCov_9fa48("114571"), 'Executing SQL query'),
  QUERY_ADMISSION_DEFERRED: stryMutAct_9fa48("114572") ? "" : (stryCov_9fa48("114572"), 'Query admission deferred'),
  QUERY_ADMISSION_REJECTED: stryMutAct_9fa48("114573") ? "" : (stryCov_9fa48("114573"), 'Query admission rejected'),
  QUERY_EXECUTION_FAILED: stryMutAct_9fa48("114574") ? "" : (stryCov_9fa48("114574"), 'Query execution failed'),
  RESOLVED_PARTITIONS_SELECT: stryMutAct_9fa48("114575") ? "" : (stryCov_9fa48("114575"), 'Resolved partitions for SELECT'),
  ROUTING_INSERT: stryMutAct_9fa48("114576") ? "" : (stryCov_9fa48("114576"), 'Routing INSERT to partitions'),
  ROUTING_UPDATE: stryMutAct_9fa48("114577") ? "" : (stryCov_9fa48("114577"), 'Routing UPDATE to partitions'),
  ROUTING_DELETE: stryMutAct_9fa48("114578") ? "" : (stryCov_9fa48("114578"), 'Routing DELETE to partitions'),
  BEGIN_TRANSACTION: stryMutAct_9fa48("114579") ? "" : (stryCov_9fa48("114579"), 'BEGIN TRANSACTION'),
  COMMIT: stryMutAct_9fa48("114580") ? "" : (stryCov_9fa48("114580"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("114581") ? "" : (stryCov_9fa48("114581"), 'ROLLBACK'),
  SYSTEM_CACHE_UNSUPPORTED: stryMutAct_9fa48("114582") ? "" : (stryCov_9fa48("114582"), 'System cache does not support filter or getAll'),
  ROUTING_QUERY_TO_PARTITION: stryMutAct_9fa48("114583") ? "" : (stryCov_9fa48("114583"), 'Routing query to partition service'),
  QUERY_TIMED_OUT: stryMutAct_9fa48("114584") ? "" : (stryCov_9fa48("114584"), 'Query timed out'),
  MESSAGE_ROUTER_UNAVAILABLE: stryMutAct_9fa48("114585") ? "" : (stryCov_9fa48("114585"), 'Message router not available'),
  NO_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114586") ? "" : (stryCov_9fa48("114586"), 'No service found for partition'),
  PARTITION_SERVICE_NOT_FOUND: stryMutAct_9fa48("114587") ? "" : (stryCov_9fa48("114587"), 'Partition service not found'),
  QUERY_ROUTING_FAILED: stryMutAct_9fa48("114588") ? "" : (stryCov_9fa48("114588"), 'Query routing failed'),
  NO_HANDLER_FOR_PARTITION: stryMutAct_9fa48("114589") ? "" : (stryCov_9fa48("114589"), 'No handler registered for partition service'),
  READ_CANDIDATE_TRANSIENT_FAILURE: stryMutAct_9fa48("114590") ? "" : (stryCov_9fa48("114590"), 'Read candidate failed with transient error, trying next'),
  SYSTEM_CACHE_FILTER_UNSUPPORTED: stryMutAct_9fa48("114591") ? "" : (stryCov_9fa48("114591"), 'System cache does not support filter'),
  NO_ACTIVE_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114592") ? "" : (stryCov_9fa48("114592"), 'No active service found for partition'),
  PARTITION_ROUTING_CANDIDATES_FILTERED: stryMutAct_9fa48("114593") ? "" : (stryCov_9fa48("114593"), 'Partition routing candidates filtered by readiness'),
  NO_LEADER_SERVICE_FOR_PARTITION: stryMutAct_9fa48("114594") ? "" : (stryCov_9fa48("114594"), 'No leader service found for partition'),
  CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION: stryMutAct_9fa48("114595") ? "" : (stryCov_9fa48("114595"), 'Canonical partition leader metadata missing'),
  CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION: stryMutAct_9fa48("114596") ? "" : (stryCov_9fa48("114596"), 'Canonical partition leader service missing'),
  NO_PARTITIONS_FOR_TABLE: stryMutAct_9fa48("114597") ? "" : (stryCov_9fa48("114597"), 'No partitions available for table'),
  NO_KEY_CONDITIONS: stryMutAct_9fa48("114598") ? "" : (stryCov_9fa48("114598"), 'No key conditions, using scatter-gather'),
  RESOLVED_PARTITIONS: stryMutAct_9fa48("114599") ? "" : (stryCov_9fa48("114599"), 'Resolved partitions for query'),
  NO_PARTITION_FOR_KEY: stryMutAct_9fa48("114600") ? "" : (stryCov_9fa48("114600"), 'No partition found for key'),
  PARALLEL_QUERY_START: stryMutAct_9fa48("114601") ? "" : (stryCov_9fa48("114601"), 'Starting parallel query execution'),
  PARALLEL_QUERY_FAILED: stryMutAct_9fa48("114602") ? "" : (stryCov_9fa48("114602"), 'Parallel query execution failed'),
  PARTITION_LIMIT_TRUNCATE: stryMutAct_9fa48("114603") ? "" : (stryCov_9fa48("114603"), 'Partition count exceeds limit, truncating'),
  STRAGGLER_DETECTED: stryMutAct_9fa48("114604") ? "" : (stryCov_9fa48("114604"), 'Slow partition detected (straggler)'),
  NO_ALTERNATIVE_REPLICAS: stryMutAct_9fa48("114605") ? "" : (stryCov_9fa48("114605"), 'No alternative replicas for speculative execution'),
  SPECULATIVE_EXEC_START: stryMutAct_9fa48("114606") ? "" : (stryCov_9fa48("114606"), 'Starting speculative execution for straggler'),
  SPECULATIVE_EXEC_FAILED: stryMutAct_9fa48("114607") ? "" : (stryCov_9fa48("114607"), 'Speculative execution failed'),
  STREAMING_MEMORY_LIMIT_REACHED: stryMutAct_9fa48("114608") ? "" : (stryCov_9fa48("114608"), 'Streaming aggregator memory limit reached'),
  TABLE_CREATE_START: stryMutAct_9fa48("114609") ? "" : (stryCov_9fa48("114609"), 'Creating table'),
  TABLE_EXISTS_SKIP: stryMutAct_9fa48("114610") ? "" : (stryCov_9fa48("114610"), 'Table already exists, skipping creation'),
  TABLE_CREATED_SUCCESS: stryMutAct_9fa48("114611") ? "" : (stryCov_9fa48("114611"), 'Table created successfully'),
  TABLE_PARTITION_PROVISION_START: stryMutAct_9fa48("114612") ? "" : (stryCov_9fa48("114612"), 'Provisioning initial table partition replica'),
  TABLE_PARTITION_PROVISION_SUCCESS: stryMutAct_9fa48("114613") ? "" : (stryCov_9fa48("114613"), 'Initial table partition provisioning completed'),
  TABLE_PARTITION_PROVISION_FAILED: stryMutAct_9fa48("114614") ? "" : (stryCov_9fa48("114614"), 'Initial table partition provisioning failed'),
  TABLE_PARTITION_TARGET_NODE_FALLBACK_USED: stryMutAct_9fa48("114615") ? "" : (stryCov_9fa48("114615"), 'Using degraded provisioning target-node fallback'),
  TABLE_PARTITION_TARGET_NODE_REJECTED: stryMutAct_9fa48("114616") ? "" : (stryCov_9fa48("114616"), 'Provisioning target node rejected during operation planning'),
  TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS: stryMutAct_9fa48("114617") ? "" : (stryCov_9fa48("114617"), 'Insufficient admissible provisioning targets for initial table partition'),
  TABLE_PARTITION_PROVISION_ABORT_PENDING: stryMutAct_9fa48("114618") ? "" : (stryCov_9fa48("114618"), 'Aborting provisional table partition operations before dispatch'),
  TABLE_PARTITION_PROVISION_ABORT_FAILED: stryMutAct_9fa48("114619") ? "" : (stryCov_9fa48("114619"), 'Failed to abort provisional table partition operation'),
  TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT: stryMutAct_9fa48("114620") ? "" : (stryCov_9fa48("114620"), 'Provisioning target-node convergence timed out'),
  TABLE_SPLIT_MERGE_EVAL_FAILED: stryMutAct_9fa48("114621") ? "" : (stryCov_9fa48("114621"), 'Split/merge evaluation after table create failed'),
  TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL: stryMutAct_9fa48("114622") ? "" : (stryCov_9fa48("114622"), 'Table policy update triggered split/merge evaluation'),
  TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL: stryMutAct_9fa48("114623") ? "" : (stryCov_9fa48("114623"), 'Partition size update triggered split/merge evaluation'),
  TABLE_SPLIT_START: stryMutAct_9fa48("114624") ? "" : (stryCov_9fa48("114624"), 'Starting managed partition split'),
  TABLE_SPLIT_PREPARED: stryMutAct_9fa48("114625") ? "" : (stryCov_9fa48("114625"), 'Prepared managed partition split'),
  TABLE_SPLIT_START_FAILED: stryMutAct_9fa48("114626") ? "" : (stryCov_9fa48("114626"), 'Managed partition split start failed'),
  FOLLOWING_LEADER_REDIRECT: stryMutAct_9fa48("114627") ? "" : (stryCov_9fa48("114627"), 'Following leader redirect'),
  WRITE_OP_PERSIST_FAILED: stryMutAct_9fa48("114628") ? "" : (stryCov_9fa48("114628"), 'Non-transactional write operation persistence failed'),
  DISTRIBUTED_TX_RECOVERY_REPLAY_FAILED: stryMutAct_9fa48("114629") ? "" : (stryCov_9fa48("114629"), 'Distributed transaction recovery replay failed'),
  INIT_LOGGER_FAILED: stryMutAct_9fa48("114630") ? "" : (stryCov_9fa48("114630"), 'initLogger failed')
}));
const QUERY_ROUTER_LOG_MSG = Object.freeze(stryMutAct_9fa48("114631") ? {} : (stryCov_9fa48("114631"), {
  ROUTING_TO_PARTITION: stryMutAct_9fa48("114632") ? "" : (stryCov_9fa48("114632"), 'Routing query to partition'),
  TIMEOUT_EXCEEDED: stryMutAct_9fa48("114633") ? "" : (stryCov_9fa48("114633"), 'Routing timeout exceeded'),
  NO_CANDIDATES: stryMutAct_9fa48("114634") ? "" : (stryCov_9fa48("114634"), 'No service candidates available for partition'),
  ROUTE_SUCCESS: stryMutAct_9fa48("114635") ? "" : (stryCov_9fa48("114635"), 'Route to partition succeeded'),
  FOLLOWING_REDIRECT: stryMutAct_9fa48("114636") ? "" : (stryCov_9fa48("114636"), 'Following leader redirect'),
  RETRY_ATTEMPT: stryMutAct_9fa48("114637") ? "" : (stryCov_9fa48("114637"), 'Retrying partition route'),
  ROUTE_FAILED: stryMutAct_9fa48("114638") ? "" : (stryCov_9fa48("114638"), 'Route to partition failed')
}));
const QUERY_ROUTING_DIAGNOSTIC_REASON = Object.freeze(stryMutAct_9fa48("114639") ? {} : (stryCov_9fa48("114639"), {
  OK: stryMutAct_9fa48("114640") ? "" : (stryCov_9fa48("114640"), 'ok'),
  NO_SERVICE_ROWS: stryMutAct_9fa48("114641") ? "" : (stryCov_9fa48("114641"), 'no_service_rows'),
  NO_ACTIVE_ADDRESSED_SERVICES: stryMutAct_9fa48("114642") ? "" : (stryCov_9fa48("114642"), 'no_active_addressed_services'),
  ALL_SERVICES_FILTERED_BY_READINESS: stryMutAct_9fa48("114643") ? "" : (stryCov_9fa48("114643"), 'all_services_filtered_by_readiness'),
  SERVICE_INACTIVE: stryMutAct_9fa48("114644") ? "" : (stryCov_9fa48("114644"), 'service_inactive'),
  SERVICE_ADDRESS_MISSING: stryMutAct_9fa48("114645") ? "" : (stryCov_9fa48("114645"), 'service_address_missing'),
  READINESS_UNAVAILABLE: stryMutAct_9fa48("114646") ? "" : (stryCov_9fa48("114646"), 'readiness_unavailable'),
  NODE_NOT_ELIGIBLE: stryMutAct_9fa48("114647") ? "" : (stryCov_9fa48("114647"), 'node_not_eligible')
}));
const QUERY_ROUTING_REPAIR_REASON = Object.freeze(stryMutAct_9fa48("114648") ? {} : (stryCov_9fa48("114648"), {
  NO_HANDLER_STALE_SERVICE: stryMutAct_9fa48("114649") ? "" : (stryCov_9fa48("114649"), 'no_handler_stale_service')
}));
const QUERY_SQL = Object.freeze(stryMutAct_9fa48("114650") ? {} : (stryCov_9fa48("114650"), {
  SELECT_ALL_FROM_PREFIX: stryMutAct_9fa48("114651") ? "" : (stryCov_9fa48("114651"), 'SELECT * FROM ')
}));
const QUERY_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("114652") ? {} : (stryCov_9fa48("114652"), {
  QUERY: stryMutAct_9fa48("114653") ? "" : (stryCov_9fa48("114653"), 'QUERY')
}));
const QUERY_RESPONSE_TYPE = Object.freeze(stryMutAct_9fa48("114654") ? {} : (stryCov_9fa48("114654"), {
  LEADER_REDIRECT: stryMutAct_9fa48("114655") ? "" : (stryCov_9fa48("114655"), 'LEADER_REDIRECT')
}));
const QUERY_JOIN_TYPE = Object.freeze(stryMutAct_9fa48("114656") ? {} : (stryCov_9fa48("114656"), {
  INNER: stryMutAct_9fa48("114657") ? "" : (stryCov_9fa48("114657"), 'INNER'),
  LEFT: stryMutAct_9fa48("114658") ? "" : (stryCov_9fa48("114658"), 'LEFT'),
  LEFT_OUTER: stryMutAct_9fa48("114659") ? "" : (stryCov_9fa48("114659"), 'LEFT OUTER'),
  RIGHT: stryMutAct_9fa48("114660") ? "" : (stryCov_9fa48("114660"), 'RIGHT'),
  RIGHT_OUTER: stryMutAct_9fa48("114661") ? "" : (stryCov_9fa48("114661"), 'RIGHT OUTER')
}));
const QUERY_AST_NODE = Object.freeze(stryMutAct_9fa48("114662") ? {} : (stryCov_9fa48("114662"), {
  BINARY: stryMutAct_9fa48("114663") ? "" : (stryCov_9fa48("114663"), 'binary'),
  LITERAL: stryMutAct_9fa48("114664") ? "" : (stryCov_9fa48("114664"), 'literal'),
  COLUMN_REF: stryMutAct_9fa48("114665") ? "" : (stryCov_9fa48("114665"), 'column_ref'),
  AGGREGATE: stryMutAct_9fa48("114666") ? "" : (stryCov_9fa48("114666"), 'aggregate'),
  STAR: stryMutAct_9fa48("114667") ? "" : (stryCov_9fa48("114667"), 'star'),
  UNARY: stryMutAct_9fa48("114668") ? "" : (stryCov_9fa48("114668"), 'unary'),
  IN: stryMutAct_9fa48("114669") ? "" : (stryCov_9fa48("114669"), 'in'),
  BETWEEN: stryMutAct_9fa48("114670") ? "" : (stryCov_9fa48("114670"), 'between'),
  LIKE: stryMutAct_9fa48("114671") ? "" : (stryCov_9fa48("114671"), 'like'),
  PARAMETER: stryMutAct_9fa48("114672") ? "" : (stryCov_9fa48("114672"), 'parameter')
}));
const QUERY_OPERATOR = Object.freeze(stryMutAct_9fa48("114673") ? {} : (stryCov_9fa48("114673"), {
  AND: stryMutAct_9fa48("114674") ? "" : (stryCov_9fa48("114674"), 'AND'),
  OR: stryMutAct_9fa48("114675") ? "" : (stryCov_9fa48("114675"), 'OR'),
  EQUALS: stryMutAct_9fa48("114676") ? "" : (stryCov_9fa48("114676"), '='),
  NOT_EQUALS: stryMutAct_9fa48("114677") ? "" : (stryCov_9fa48("114677"), '!='),
  NOT_EQUALS_ALT: stryMutAct_9fa48("114678") ? "" : (stryCov_9fa48("114678"), '<>'),
  LESS_THAN: stryMutAct_9fa48("114679") ? "" : (stryCov_9fa48("114679"), '<'),
  LESS_THAN_OR_EQUAL: stryMutAct_9fa48("114680") ? "" : (stryCov_9fa48("114680"), '<='),
  GREATER_THAN: stryMutAct_9fa48("114681") ? "" : (stryCov_9fa48("114681"), '>'),
  GREATER_THAN_OR_EQUAL: stryMutAct_9fa48("114682") ? "" : (stryCov_9fa48("114682"), '>=')
}));
const QUERY_AGGREGATE = Object.freeze(stryMutAct_9fa48("114683") ? {} : (stryCov_9fa48("114683"), {
  COUNT: stryMutAct_9fa48("114684") ? "" : (stryCov_9fa48("114684"), 'COUNT'),
  SUM: stryMutAct_9fa48("114685") ? "" : (stryCov_9fa48("114685"), 'SUM'),
  AVG: stryMutAct_9fa48("114686") ? "" : (stryCov_9fa48("114686"), 'AVG'),
  MIN: stryMutAct_9fa48("114687") ? "" : (stryCov_9fa48("114687"), 'MIN'),
  MAX: stryMutAct_9fa48("114688") ? "" : (stryCov_9fa48("114688"), 'MAX')
}));
const QUERY_SQL_FRAGMENT = Object.freeze(stryMutAct_9fa48("114689") ? {} : (stryCov_9fa48("114689"), {
  SELECT_PREFIX: stryMutAct_9fa48("114690") ? "" : (stryCov_9fa48("114690"), 'SELECT '),
  DISTINCT_PREFIX: stryMutAct_9fa48("114691") ? "" : (stryCov_9fa48("114691"), 'DISTINCT '),
  STAR: stryMutAct_9fa48("114692") ? "" : (stryCov_9fa48("114692"), '*'),
  GROUP_BY_PREFIX: stryMutAct_9fa48("114693") ? "" : (stryCov_9fa48("114693"), ' GROUP BY '),
  ORDER_BY_PREFIX: stryMutAct_9fa48("114694") ? "" : (stryCov_9fa48("114694"), ' ORDER BY '),
  IN: stryMutAct_9fa48("114695") ? "" : (stryCov_9fa48("114695"), ' IN '),
  BETWEEN: stryMutAct_9fa48("114696") ? "" : (stryCov_9fa48("114696"), ' BETWEEN '),
  LIKE: stryMutAct_9fa48("114697") ? "" : (stryCov_9fa48("114697"), ' LIKE '),
  NULL: stryMutAct_9fa48("114698") ? "" : (stryCov_9fa48("114698"), 'NULL'),
  PARAMETER: stryMutAct_9fa48("114699") ? "" : (stryCov_9fa48("114699"), '?'),
  COMMA_SPACE: stryMutAct_9fa48("114700") ? "" : (stryCov_9fa48("114700"), ', '),
  PIPE: stryMutAct_9fa48("114701") ? "" : (stryCov_9fa48("114701"), '|')
}));
const QUERY_SORT_DIRECTION = Object.freeze(stryMutAct_9fa48("114702") ? {} : (stryCov_9fa48("114702"), {
  ASC: stryMutAct_9fa48("114703") ? "" : (stryCov_9fa48("114703"), 'ASC'),
  DESC: stryMutAct_9fa48("114704") ? "" : (stryCov_9fa48("114704"), 'DESC')
}));
const QUERY_SESSION = Object.freeze(stryMutAct_9fa48("114705") ? {} : (stryCov_9fa48("114705"), {
  DEFAULT: stryMutAct_9fa48("114706") ? "" : (stryCov_9fa48("114706"), 'default')
}));
const QUERY_DEFAULT_VALUE = Object.freeze(stryMutAct_9fa48("114707") ? {} : (stryCov_9fa48("114707"), {
  PRIMARY_KEY: stryMutAct_9fa48("114708") ? "" : (stryCov_9fa48("114708"), 'id')
}));
const SQL_PARSE_CACHE = Object.freeze(stryMutAct_9fa48("114709") ? {} : (stryCov_9fa48("114709"), {
  DEFAULT_MAX_SIZE: NUM.THOUSAND
}));

/**
 * System tables excluded from non-transactional write tracking.
 * This path is observability-only and would otherwise amplify control-plane
 * churn by emitting extra sql_write_operations rows for every system write.
 * User-table writes remain tracked.
 */
const WRITE_TRACKING_EXCLUDED_TABLES = Object.freeze(new Set(stryMutAct_9fa48("114710") ? [] : (stryCov_9fa48("114710"), [...Object.values(TABLES)])));

// Canonical config keys used by query subsystem components.
const QUERY_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("114711") ? {} : (stryCov_9fa48("114711"), {
  QUERY_TIMEOUT_MS: CONFIG_KEY.QUERY_TIMEOUT_MS,
  MAX_PARALLEL_PARTITIONS: CONFIG_KEY.QUERY_MAX_PARALLEL_PARTITIONS,
  LEADER_RETRY_ATTEMPTS: CONFIG_KEY.QUERY_LEADER_RETRY_ATTEMPTS,
  LEADER_RETRY_DELAY_MS: CONFIG_KEY.QUERY_LEADER_RETRY_DELAY_MS,
  READ_RETRY_ATTEMPTS: CONFIG_KEY.QUERY_READ_RETRY_ATTEMPTS,
  COORDINATOR_MAX_PARALLEL_PARTITIONS: CONFIG_KEY.QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS,
  COORDINATOR_MAX_CONCURRENT_CONNECTIONS: CONFIG_KEY.QUERY_COORDINATOR_MAX_CONCURRENT_CONNECTIONS,
  COORDINATOR_MAX_RESULT_BUFFER_BYTES: CONFIG_KEY.QUERY_COORDINATOR_MAX_RESULT_BUFFER_BYTES,
  COORDINATOR_QUERY_TIMEOUT_MS: CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS,
  COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER: CONFIG_KEY.QUERY_COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER,
  COORDINATOR_SPECULATIVE_EXECUTION_ENABLED: CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED,
  COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS: CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS,
  COORDINATOR_STREAMING_ENABLED: CONFIG_KEY.QUERY_COORDINATOR_STREAMING_ENABLED,
  COORDINATOR_STREAMING_CHUNK_SIZE: CONFIG_KEY.QUERY_COORDINATOR_STREAMING_CHUNK_SIZE
}));
const QUERY_DEFAULTS = Object.freeze(stryMutAct_9fa48("114712") ? {} : (stryCov_9fa48("114712"), {
  QUERY_TIMEOUT_MS: stryMutAct_9fa48("114713") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("114713"), (stryMutAct_9fa48("114714") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("114714"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  MAX_PARALLEL_PARTITIONS: NUM.THOUSAND,
  LEADER_RETRY_ATTEMPTS: NUM.FIVE,
  LEADER_RETRY_DELAY_MS: stryMutAct_9fa48("114715") ? NUM.FIVE / NUM.TEN : (stryCov_9fa48("114715"), NUM.FIVE * NUM.TEN),
  READ_RETRY_ATTEMPTS: NUM.THREE,
  NO_SERVICE_WARN_THROTTLE_MS: stryMutAct_9fa48("114716") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("114716"), TIME_MS.SECOND * NUM.FIVE),
  CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS: stryMutAct_9fa48("114717") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("114717"), (stryMutAct_9fa48("114718") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("114718"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  TABLE_CREATE_PROVISION_TIMEOUT_MS: stryMutAct_9fa48("114719") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("114719"), (stryMutAct_9fa48("114720") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("114720"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  TABLE_CREATE_PROVISION_POLL_INTERVAL_MS: stryMutAct_9fa48("114721") ? NUM.FIVE / NUM.TEN : (stryCov_9fa48("114721"), NUM.FIVE * NUM.TEN),
  TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS: TIME_MS.SECOND,
  COORDINATOR_MAX_PARALLEL_PARTITIONS: NUM.THOUSAND,
  COORDINATOR_MAX_CONCURRENT_CONNECTIONS: stryMutAct_9fa48("114722") ? NUM.THOUSAND / NUM.TEN : (stryCov_9fa48("114722"), NUM.THOUSAND * NUM.TEN),
  COORDINATOR_MAX_RESULT_BUFFER_BYTES: stryMutAct_9fa48("114723") ? NUM.BYTES_PER_MIB / NUM.BYTES_PER_KIB : (stryCov_9fa48("114723"), NUM.BYTES_PER_MIB * NUM.BYTES_PER_KIB),
  COORDINATOR_QUERY_TIMEOUT_MS: stryMutAct_9fa48("114724") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("114724"), (stryMutAct_9fa48("114725") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("114725"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER: NUM.TWO,
  COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS: stryMutAct_9fa48("114726") ? NUM.TEN / NUM.TEN : (stryCov_9fa48("114726"), NUM.TEN * NUM.TEN),
  COORDINATOR_STREAMING_CHUNK_SIZE: NUM.THOUSAND
}));
export { QUERY_AGGREGATE, QUERY_AST_TYPE, QUERY_AST_NODE, QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_DEFAULT_VALUE, QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_JOIN_TYPE, QUERY_LOG_MSG, QUERY_MESSAGE_TYPE, QUERY_OPERATION, QUERY_OPERATOR, QUERY_RESPONSE_TYPE, QUERY_ROUTER_ERROR_MSG, QUERY_ROUTER_LOG_MSG, QUERY_ROUTING_DIAGNOSTIC_REASON, QUERY_ROUTING_REPAIR_REASON, QUERY_SESSION, QUERY_SQL, QUERY_SQL_FRAGMENT, QUERY_STATUS, QUERY_SUBSYSTEM, QUERY_SORT_DIRECTION, SQL_PARSE_CACHE, WRITE_TRACKING_EXCLUDED_TABLES };