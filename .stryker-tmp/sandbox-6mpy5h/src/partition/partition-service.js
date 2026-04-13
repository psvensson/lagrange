/**
 * Partition Service - SQLite-backed Raft group for data storage.
 * Implements table partitions with Raft consensus for replication.
 * Uses liferaft library for Raft consensus with simplified transport.
 * Requirements: 1.4, 3.2, 3.3, 3.4, 3.5, 4.4, 8.1, 10.1, 35.1, 35.5
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
import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import LifeRaft from '../raft/liferaft.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { LoggingService } from '../logging/logging-service.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { UnifiedRebalancer, EntityType } from '../rebalancer/unified-rebalancer.js';
import { OperationType, ReplicaStatus, TERMINAL_STATUSES } from '../rebalancer/replica-status.js';
import { assertCritical } from '../utils/assert.js';
import { PendingRequestTracker } from './pending-request-tracker.js';
import { ProposalQueue } from './proposal-queue.js';
import { CDCEventBuffer } from './cdc-event-buffer.js';
import { extractInsertDataFromSQL as extractInsertDataFromSQLImpl, extractUpdateDataFromSQL as extractUpdateDataFromSQLImpl, extractDeleteDataFromSQL as extractDeleteDataFromSQLImpl, extractDataFromParameterizedSQL as extractDataFromParameterizedSQLImpl, parseValuesFromSQL as parseValuesFromSQLImpl, parseValue as parseValueImpl } from './partition-sql-parser.js';
import { PartitionCDCDelivery } from './partition-cdc-delivery.js';
import { CDCPipelineMetrics } from '../cdc/cdc-pipeline-metrics.js';
import { CDC_PIPELINE_METRIC, CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { isRaftPacket } from '../raft/raft-packet-utils.js';
import { resolveRaftTransportDeliveryOptions } from '../raft/constants.js';
import { SQLiteLogAdapter } from '../raft/sqlite-log-adapter.js';
import { assertRaftProviderContract } from '../raft/raft-provider-contract.js';
import { LiferaftProvider } from '../raft/liferaft-provider.js';
import { AuthoritativeRowMutationHelper } from '../raft/authoritative-row-mutation-helper.js';
import { wireReplicaLifecycleEvents } from '../raft/replica-leadership-state.js';
import { normalizePublishedRaftRole } from '../raft/published-raft-role.js';
import { applyRuntimeRaftTiming, computeReplicaElectionTimeouts } from '../raft/raft-timing-utils.js';
import { LeaderActivationGate } from '../raft/leader-activation-gate.js';
import { LeaderActivationScheduler } from '../raft/leader-activation-scheduler.js';
import { INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { LIFECYCLE_REASON } from '../bootstrap/lifecycle-controller-constants.js';
import { isPriorityControlPlanePartition } from '../bootstrap/system-partition-classification.js';
import { runRetryableControlPlaneWrite } from '../bootstrap/shared/retryable-control-plane-write.js';
import { attachTrafficReadinessListener, getTrafficReadinessSnapshot, isBackgroundWorkReady as isBackgroundWorkLifecycleReady, isMetadataPublicationReady as isMetadataPublicationLifecycleReady } from '../bootstrap/traffic-readiness-utils.js';
import { AddressManager } from '../address/address-manager.js';
import { isSystemTableWriteReady } from '../cache/leader-readiness-gate.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { COLUMN, CDC_OPERATION, ENTITY_TYPE, ERRORS, METRICS_LOG_TAG, NUM, SQL, SERVICE_TYPE, STRING, TABLES, TYPEOF } from '../constants/index.js';
import { PARTITION_RAFT_ROLE, PARTITION_SPLIT_MIRROR_ORIGIN, PARTITION_STATE, PARTITION_SUBSYSTEM, PARTITION_TRANSITION_METADATA_FIELD, PARTITION_TRANSITION_STATE } from './partition-constants.js';
import { SPLIT_ACK_STATUS, SPLIT_ACK_CHECKPOINT_FIELD, SPLIT_PARTICIPANT_PREFIX } from './split-ack-constants.js';
import { PARTICIPANT_ACK_FIELD } from '../workflow/workflow-constants.js';
import { PARTITION_SERVICE_ADDRESS, PARTITION_SERVICE_COLUMN, PARTITION_SERVICE_COLUMN_SQL, PARTITION_SERVICE_DB, PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_EVENT, PARTITION_SERVICE_INIT_STAGE, PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON, PARTITION_SERVICE_LIFERAFT_TIMER, PARTITION_SERVICE_MIGRATION_OPERATION, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_MESSAGE_TYPE, PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_REASON, PARTITION_SERVICE_RESPONSE, PARTITION_SERVICE_ROLE, PARTITION_SERVICE_SQL, PARTITION_SERVICE_SQL_FRAGMENT, PARTITION_SERVICE_STATUS, PARTITION_SERVICE_TYPE, PARTITION_SERVICE_VALUE } from './partition-service-constants.js';
import { PartitionRaftStorage, PartitionRaftLogEntry } from './partition-raft-storage.js';
import { TIMEOUT_BUDGET_DEFAULT } from '../control-plane/timeout-budget.js';

/**
 * Partition state enumeration.
 */
const PARTITION_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("101515") ? {} : (stryCov_9fa48("101515"), {
  BOOLEAN: stryMutAct_9fa48("101516") ? "" : (stryCov_9fa48("101516"), 'boolean'),
  VALUE_250: 250,
  VALUE_25: 25,
  FAILED_TO_FLUSH_DEFERRED_PARTITION_RAFT_ROLE_UPDATE: stryMutAct_9fa48("101517") ? "" : (stryCov_9fa48("101517"), 'Failed to flush deferred partition raft-role update'),
  FAILED_TO_FLUSH_DEFERRED_PARTITION_LEADER_UPDATE: stryMutAct_9fa48("101518") ? "" : (stryCov_9fa48("101518"), 'Failed to flush deferred partition leader update'),
  BACKGROUND: stryMutAct_9fa48("101519") ? "" : (stryCov_9fa48("101519"), 'background'),
  READY: stryMutAct_9fa48("101520") ? "" : (stryCov_9fa48("101520"), 'ready'),
  NOT_OWNER: stryMutAct_9fa48("101521") ? "" : (stryCov_9fa48("101521"), 'not-owner'),
  TICKINTERVALMS: stryMutAct_9fa48("101522") ? "" : (stryCov_9fa48("101522"), 'tickIntervalMs'),
  BEGIN: stryMutAct_9fa48("101523") ? "" : (stryCov_9fa48("101523"), 'BEGIN'),
  PREPARE: stryMutAct_9fa48("101524") ? "" : (stryCov_9fa48("101524"), 'PREPARE'),
  OBJECT: stryMutAct_9fa48("101525") ? "" : (stryCov_9fa48("101525"), 'object'),
  INSERT: stryMutAct_9fa48("101526") ? "" : (stryCov_9fa48("101526"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("101527") ? "" : (stryCov_9fa48("101527"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("101528") ? "" : (stryCov_9fa48("101528"), 'DELETE'),
  CREATE: stryMutAct_9fa48("101529") ? "" : (stryCov_9fa48("101529"), 'CREATE'),
  DROP: stryMutAct_9fa48("101530") ? "" : (stryCov_9fa48("101530"), 'DROP'),
  ALTER: stryMutAct_9fa48("101531") ? "" : (stryCov_9fa48("101531"), 'ALTER'),
  PREPAREDSTATEHOLDTIMER: stryMutAct_9fa48("101532") ? "" : (stryCov_9fa48("101532"), 'preparedStateHoldTimer'),
  SELECT: stryMutAct_9fa48("101533") ? "" : (stryCov_9fa48("101533"), 'select'),
  SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE: stryMutAct_9fa48("101534") ? "" : (stryCov_9fa48("101534"), 'Suppressing CDC event for no-op write'),
  BUFFERED_BACKLOG_PRESENT: stryMutAct_9fa48("101535") ? "" : (stryCov_9fa48("101535"), 'buffered_backlog_present'),
  SUBSCRIBER_DELIVERY_FAILED: stryMutAct_9fa48("101536") ? "" : (stryCov_9fa48("101536"), 'subscriber_delivery_failed'),
  WRITE_ACTIVITY: stryMutAct_9fa48("101537") ? "" : (stryCov_9fa48("101537"), 'write_activity'),
  VALUE: stryMutAct_9fa48("101538") ? "" : (stryCov_9fa48("101538"), '|'),
  SQLITE_CONSTRAINT_PRIMARYKEY: stryMutAct_9fa48("101539") ? "" : (stryCov_9fa48("101539"), 'SQLITE_CONSTRAINT_PRIMARYKEY'),
  SQLITE_CONSTRAINT: stryMutAct_9fa48("101540") ? "" : (stryCov_9fa48("101540"), 'SQLITE_CONSTRAINT'),
  UNIQUE_CONSTRAINT_FAILED: stryMutAct_9fa48("101541") ? "" : (stryCov_9fa48("101541"), 'UNIQUE CONSTRAINT FAILED'),
  ENOENT: stryMutAct_9fa48("101542") ? "" : (stryCov_9fa48("101542"), 'ENOENT'),
  SIZEUPDATETIMER: stryMutAct_9fa48("101543") ? "" : (stryCov_9fa48("101543"), 'sizeUpdateTimer'),
  SIZE_PERSISTENCE_FAILED: stryMutAct_9fa48("101544") ? "" : (stryCov_9fa48("101544"), 'size persistence failed'),
  CRITICAL: stryMutAct_9fa48("101545") ? "" : (stryCov_9fa48("101545"), 'critical'),
  LEARNERPROMOTIONTIMER: stryMutAct_9fa48("101546") ? "" : (stryCov_9fa48("101546"), 'learnerPromotionTimer'),
  LEADER_NOT_DISCOVERED: stryMutAct_9fa48("101547") ? "" : (stryCov_9fa48("101547"), 'leader_not_discovered'),
  WOULD_EXCEED_TARGET_REPLICA_COUNT: stryMutAct_9fa48("101548") ? "" : (stryCov_9fa48("101548"), 'would_exceed_target_replica_count'),
  WOULD_CAUSE_EVEN_VOTER_COUNT: stryMutAct_9fa48("101549") ? "" : (stryCov_9fa48("101549"), 'would_cause_even_voter_count'),
  PARTITION_SERVICE_SHUTDOWN: stryMutAct_9fa48("101550") ? "" : (stryCov_9fa48("101550"), 'Partition service shutdown')
}));
const PartitionState = PARTITION_STATE; /**
                                        * Raft role enumeration.
                                        */
const RaftRole = PARTITION_RAFT_ROLE;
const CONTROL_PLANE_PARTITION_IDS = new Set(Object.values(INITIAL_PARTITION_IDS)); /**
                                                                                   * CDC operation types.
                                                                                   */
const CDCOperation = CDC_OPERATION;
const ACTIVE_VOTER_ROLES = new Set(stryMutAct_9fa48("101551") ? [] : (stryCov_9fa48("101551"), [PARTITION_RAFT_ROLE.LEADER, PARTITION_RAFT_ROLE.FOLLOWER, PARTITION_RAFT_ROLE.CANDIDATE]));
const ADD_LIKE_REPLICA_OPERATION_TYPES = new Set(stryMutAct_9fa48("101552") ? [] : (stryCov_9fa48("101552"), [OperationType.ADD, OperationType.REPLACE]));
const WRITE_PHASE_FIELD_ENTRY_BUILD_MS = stryMutAct_9fa48("101553") ? "" : (stryCov_9fa48("101553"), 'entryBuildMs');
const WRITE_PHASE_FIELD_LOG_APPEND_MS = stryMutAct_9fa48("101554") ? "" : (stryCov_9fa48("101554"), 'logAppendMs');
const WRITE_PHASE_FIELD_SQLITE_RUN_MS = stryMutAct_9fa48("101555") ? "" : (stryCov_9fa48("101555"), 'sqliteRunMs');
const WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS = stryMutAct_9fa48("101556") ? "" : (stryCov_9fa48("101556"), 'raftCommandDispatchMs');
const WRITE_PHASE_FIELD_FORWARD_DELIVER_MS = stryMutAct_9fa48("101557") ? "" : (stryCov_9fa48("101557"), 'forwardDeliverMs');
const WRITE_PHASE_FIELD_APPLY_WRITE_MS = stryMutAct_9fa48("101558") ? "" : (stryCov_9fa48("101558"), 'applyWriteMs');
const WRITE_PHASE_FIELD_TOTAL_MS = stryMutAct_9fa48("101559") ? "" : (stryCov_9fa48("101559"), 'totalMs');
const SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS = 64;
const DEFAULT_TRANSACTION_SESSION_ID = stryMutAct_9fa48("101560") ? "" : (stryCov_9fa48("101560"), 'default');
const QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION = stryMutAct_9fa48("101561") ? "" : (stryCov_9fa48("101561"), 'migrationOperation');
const QUERY_PAYLOAD_FIELD_MIGRATION_ID = stryMutAct_9fa48("101562") ? "" : (stryCov_9fa48("101562"), 'migrationId');
const PARTITION_REPLICA_COUNT_FIELD = stryMutAct_9fa48("101563") ? "" : (stryCov_9fa48("101563"), 'replica_count');
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(Object.values(SYSTEM_TABLE_NAME).map(stryMutAct_9fa48("101564") ? () => undefined : (stryCov_9fa48("101564"), tableName => stryMutAct_9fa48("101565") ? `` : (stryCov_9fa48("101565"), `${tableName}-p1`)))); /**
                                                                                                                                                                                                                                                            * PartitionService implements a SQLite-backed Raft group for data storage.
                                                                                                                                                                                                                                                            * Each partition is a Raft consensus group with odd-numbered replicas.
                                                                                                                                                                                                                                                            */
class PartitionService extends EventEmitter {
  /**
  * Create a new PartitionService.
  * @param {Object} options - Configuration options.
  * @param {string} options.partitionId - Partition ID.
  * @param {string} options.tableId - Table ID this partition belongs to.
  * @param {string} options.tableName - Table name.
  * @param {Object} options.schema - Table schema definition.
  * @param {Object} options.keyRange - Partition key range {start, end}.
  * @param {string} options.replicaId - This replica's ID.
  * @param {Array<string>} options.replicaIds - All replica IDs in the partition.
  * @param {string} options.nodeId - Node ID hosting this replica.
  * @param {Object} options.transport - MessageRouter for Raft communication.
  * @param {string} options.dbPath - Path to SQLite database file.
  * @param {Object} options.messageGroupService - Message group service for lifecycle messages.
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("101566")) {
      {}
    } else {
      stryCov_9fa48("101566");
      super();
      if (stryMutAct_9fa48("101569") ? false : stryMutAct_9fa48("101568") ? true : stryMutAct_9fa48("101567") ? options.partitionId : (stryCov_9fa48("101567", "101568", "101569"), !options.partitionId)) {
        if (stryMutAct_9fa48("101570")) {
          {}
        } else {
          stryCov_9fa48("101570");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_PARTITION_ID);
        }
      }
      if (stryMutAct_9fa48("101573") ? false : stryMutAct_9fa48("101572") ? true : stryMutAct_9fa48("101571") ? options.tableId : (stryCov_9fa48("101571", "101572", "101573"), !options.tableId)) {
        if (stryMutAct_9fa48("101574")) {
          {}
        } else {
          stryCov_9fa48("101574");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_TABLE_ID);
        }
      }
      if (stryMutAct_9fa48("101577") ? false : stryMutAct_9fa48("101576") ? true : stryMutAct_9fa48("101575") ? options.replicaId : (stryCov_9fa48("101575", "101576", "101577"), !options.replicaId)) {
        if (stryMutAct_9fa48("101578")) {
          {}
        } else {
          stryCov_9fa48("101578");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_REPLICA_ID);
        }
      }
      this.partitionId = options.partitionId;
      this.tableId = options.tableId;
      this.tableName = stryMutAct_9fa48("101581") ? options.tableName && options.tableId : stryMutAct_9fa48("101580") ? false : stryMutAct_9fa48("101579") ? true : (stryCov_9fa48("101579", "101580", "101581"), options.tableName || options.tableId);
      this.externalCdcAllowed = (stryMutAct_9fa48("101584") ? typeof options.externalCdcAllowed !== PARTITION_SERVICE_LITERAL.BOOLEAN : stryMutAct_9fa48("101583") ? false : stryMutAct_9fa48("101582") ? true : (stryCov_9fa48("101582", "101583", "101584"), typeof options.externalCdcAllowed === PARTITION_SERVICE_LITERAL.BOOLEAN)) ? options.externalCdcAllowed : null;
      this.schema = stryMutAct_9fa48("101587") ? options.schema && null : stryMutAct_9fa48("101586") ? false : stryMutAct_9fa48("101585") ? true : (stryCov_9fa48("101585", "101586", "101587"), options.schema || null);
      this.keyRange = stryMutAct_9fa48("101590") ? options.keyRange && {
        start: PARTITION_SERVICE_DEFAULT.KEY_RANGE_START,
        end: PARTITION_SERVICE_DEFAULT.KEY_RANGE_END
      } : stryMutAct_9fa48("101589") ? false : stryMutAct_9fa48("101588") ? true : (stryCov_9fa48("101588", "101589", "101590"), options.keyRange || (stryMutAct_9fa48("101591") ? {} : (stryCov_9fa48("101591"), {
        start: PARTITION_SERVICE_DEFAULT.KEY_RANGE_START,
        end: PARTITION_SERVICE_DEFAULT.KEY_RANGE_END
      })));
      this.replicaId = options.replicaId;
      this.replicaIds = stryMutAct_9fa48("101594") ? options.replicaIds && [this.replicaId] : stryMutAct_9fa48("101593") ? false : stryMutAct_9fa48("101592") ? true : (stryCov_9fa48("101592", "101593", "101594"), options.replicaIds || (stryMutAct_9fa48("101595") ? [] : (stryCov_9fa48("101595"), [this.replicaId])));
      this.nodeId = stryMutAct_9fa48("101598") ? options.nodeId && PARTITION_SERVICE_DEFAULT.NODE_ID : stryMutAct_9fa48("101597") ? false : stryMutAct_9fa48("101596") ? true : (stryCov_9fa48("101596", "101597", "101598"), options.nodeId || PARTITION_SERVICE_DEFAULT.NODE_ID);
      this.transport = stryMutAct_9fa48("101601") ? options.transport && null : stryMutAct_9fa48("101600") ? false : stryMutAct_9fa48("101599") ? true : (stryCov_9fa48("101599", "101600", "101601"), options.transport || null);
      this.raftProvider = stryMutAct_9fa48("101604") ? options.raftProvider && new LiferaftProvider() : stryMutAct_9fa48("101603") ? false : stryMutAct_9fa48("101602") ? true : (stryCov_9fa48("101602", "101603", "101604"), options.raftProvider || new LiferaftProvider());
      assertRaftProviderContract(this.raftProvider);
      this.dbPath = stryMutAct_9fa48("101607") ? options.dbPath && PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("101606") ? false : stryMutAct_9fa48("101605") ? true : (stryCov_9fa48("101605", "101606", "101607"), options.dbPath || PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH);
      this.leaderAddressHint = (stryMutAct_9fa48("101610") ? typeof options.leaderAddress === TYPEOF.STRING || options.leaderAddress.length > NUM.ZERO : stryMutAct_9fa48("101609") ? false : stryMutAct_9fa48("101608") ? true : (stryCov_9fa48("101608", "101609", "101610"), (stryMutAct_9fa48("101612") ? typeof options.leaderAddress !== TYPEOF.STRING : stryMutAct_9fa48("101611") ? true : (stryCov_9fa48("101611", "101612"), typeof options.leaderAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("101615") ? options.leaderAddress.length <= NUM.ZERO : stryMutAct_9fa48("101614") ? options.leaderAddress.length >= NUM.ZERO : stryMutAct_9fa48("101613") ? true : (stryCov_9fa48("101613", "101614", "101615"), options.leaderAddress.length > NUM.ZERO)))) ? options.leaderAddress : null; // Unified address format: {nodeId}/partition/{replicaId}
      // Requirements: 1.1, 1.4, 5.1
      const addressManager = AddressManager.getInstance();
      this.unifiedAddress = addressManager.format(this.nodeId, ENTITY_TYPE.PARTITION, this.replicaId); // Configuration
      const config = ConfigurationManager.getInstance();
      this.defaultReplicaCount = stryMutAct_9fa48("101618") ? config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) && PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT : stryMutAct_9fa48("101617") ? false : stryMutAct_9fa48("101616") ? true : (stryCov_9fa48("101616", "101617", "101618"), config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT);
      this.sizeUpdateDebounceMs = stryMutAct_9fa48("101621") ? config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_DEBOUNCE_MS) && PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_DEBOUNCE_MS : stryMutAct_9fa48("101620") ? false : stryMutAct_9fa48("101619") ? true : (stryCov_9fa48("101619", "101620", "101621"), config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_DEBOUNCE_MS) || PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_DEBOUNCE_MS);
      this.sizeUpdateIntervalMs = stryMutAct_9fa48("101624") ? config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_INTERVAL_MS) && PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_INTERVAL_MS : stryMutAct_9fa48("101623") ? false : stryMutAct_9fa48("101622") ? true : (stryCov_9fa48("101622", "101623", "101624"), config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_INTERVAL_MS) || PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_INTERVAL_MS);
      this.leaderActivationStabilizationMs = (stryMutAct_9fa48("101627") ? Number.isFinite(options.leaderActivationStabilizationMs) || options.leaderActivationStabilizationMs >= NUM.ZERO : stryMutAct_9fa48("101626") ? false : stryMutAct_9fa48("101625") ? true : (stryCov_9fa48("101625", "101626", "101627"), Number.isFinite(options.leaderActivationStabilizationMs) && (stryMutAct_9fa48("101630") ? options.leaderActivationStabilizationMs < NUM.ZERO : stryMutAct_9fa48("101629") ? options.leaderActivationStabilizationMs > NUM.ZERO : stryMutAct_9fa48("101628") ? true : (stryCov_9fa48("101628", "101629", "101630"), options.leaderActivationStabilizationMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationStabilizationMs) : stryMutAct_9fa48("101631") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) && PARTITION_SERVICE_LITERAL.VALUE_250 : (stryCov_9fa48("101631"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ?? PARTITION_SERVICE_LITERAL.VALUE_250);
      this.leaderActivationNodeSpacingMs = (stryMutAct_9fa48("101634") ? Number.isFinite(options.leaderActivationNodeSpacingMs) || options.leaderActivationNodeSpacingMs >= NUM.ZERO : stryMutAct_9fa48("101633") ? false : stryMutAct_9fa48("101632") ? true : (stryCov_9fa48("101632", "101633", "101634"), Number.isFinite(options.leaderActivationNodeSpacingMs) && (stryMutAct_9fa48("101637") ? options.leaderActivationNodeSpacingMs < NUM.ZERO : stryMutAct_9fa48("101636") ? options.leaderActivationNodeSpacingMs > NUM.ZERO : stryMutAct_9fa48("101635") ? true : (stryCov_9fa48("101635", "101636", "101637"), options.leaderActivationNodeSpacingMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationNodeSpacingMs) : stryMutAct_9fa48("101638") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) && PARTITION_SERVICE_LITERAL.VALUE_25 : (stryCov_9fa48("101638"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ?? PARTITION_SERVICE_LITERAL.VALUE_25);
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("101639") ? {} : (stryCov_9fa48("101639"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("101640") ? () => undefined : (stryCov_9fa48("101640"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("101641") ? () => undefined : (stryCov_9fa48("101641"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("101642") ? () => undefined : (stryCov_9fa48("101642"), () => this.systemTableCache),
        getMessageRouter: stryMutAct_9fa48("101643") ? () => undefined : (stryCov_9fa48("101643"), () => this.transport)
      })).controlPlaneSystemTableGateway; // SQLite database
      this.db = null;
      this.storage = null; // Raft state - liferaft handles election/heartbeat timers internally
      // Requirements: 11.9
      this.role = RaftRole.FOLLOWER;
      this.leaderId = null; // Partition state
      this.state = PartitionState.NORMAL; // Size tracking
      this.sizeBytes = NUM.ZERO;
      this.sizeUpdatePending = stryMutAct_9fa48("101644") ? true : (stryCov_9fa48("101644"), false);
      this.lastSizeUpdate = NUM.ZERO;
      this.sizeUpdateTimer = null;
      this.managedSplitWriteActivityDebounceMs = PARTITION_SERVICE_DEFAULT.MANAGED_SPLIT_WRITE_ACTIVITY_DEBOUNCE_MS;
      this.lastManagedSplitWriteActivityAtMs = NUM.ZERO; // CDC subscribers
      this.cdcSubscribers = new Set();
      this.cdcSubscriberWrappers = new Map();
      this.cdcSubscriberStates = new Map();
      this.cdcSubscriptionEpoch = NUM.ZERO;
      this.cdcEventSequenceNumber = NUM.ZERO; // CDC event buffer for events generated before subscribers register
      this.cdcEventBuffer = new CDCEventBuffer(stryMutAct_9fa48("101645") ? {} : (stryCov_9fa48("101645"), {
        logger: this.logger
      }));
      this.cdcBufferReplayTimer = null;
      this.cdcBufferReplayInFlight = stryMutAct_9fa48("101646") ? true : (stryCov_9fa48("101646"), false);
      this.cdcBufferReplayDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
      this.cdcReplayBufferGrowthCount = NUM.ZERO;
      this.cdcReplayRetryDepth = NUM.ZERO; // CDC pipeline metrics (shared across the node)
      this.cdcPipelineMetrics = stryMutAct_9fa48("101649") ? options.cdcPipelineMetrics && new CDCPipelineMetrics() : stryMutAct_9fa48("101648") ? false : stryMutAct_9fa48("101647") ? true : (stryCov_9fa48("101647", "101648", "101649"), options.cdcPipelineMetrics || new CDCPipelineMetrics()); // Optional CDC confirmation tracker for awaitable CDC delivery
      this.cdcConfirmationTracker = stryMutAct_9fa48("101652") ? options.cdcConfirmationTracker && null : stryMutAct_9fa48("101651") ? false : stryMutAct_9fa48("101650") ? true : (stryCov_9fa48("101650", "101651", "101652"), options.cdcConfirmationTracker || null);
      this.pendingCDCEventDeliveries = new Set();
      this.proposalQueue = new ProposalQueue(); // CDC delivery helper (subscriber management, buffering, replay)
      this.cdcDelivery = new PartitionCDCDelivery(this); // Recently-applied write keys for idempotent Raft replay handling.
      this.recentlyAppliedEntryKeys = new Set();
      this.recentlyAppliedEntryOrder = stryMutAct_9fa48("101653") ? ["Stryker was here"] : (stryCov_9fa48("101653"), []);
      this.migrationColumnDefaultsByTable = new Map();
      this.maxTrackedAppliedEntries = PARTITION_SERVICE_DEFAULT.MAX_TRACKED_APPLIED_ENTRIES; // HLC clock for ordering
      this.hlcClock = new HLCClockService(this.replicaId); // Transaction state
      this.activeTransactions = new Map();
      this.preparedTransactions = new Map();
      this.preparedStateLostSessions = new Set();
      this.committedWriteLog = stryMutAct_9fa48("101654") ? ["Stryker was here"] : (stryCov_9fa48("101654"), []);
      this.rowCommitEpoch = new Map();
      this.maxCommittedWriteLogEntries = (stryMutAct_9fa48("101657") ? Number.isFinite(options.maxCommittedWriteLogEntries) || options.maxCommittedWriteLogEntries > NUM.ZERO : stryMutAct_9fa48("101656") ? false : stryMutAct_9fa48("101655") ? true : (stryCov_9fa48("101655", "101656", "101657"), Number.isFinite(options.maxCommittedWriteLogEntries) && (stryMutAct_9fa48("101660") ? options.maxCommittedWriteLogEntries <= NUM.ZERO : stryMutAct_9fa48("101659") ? options.maxCommittedWriteLogEntries >= NUM.ZERO : stryMutAct_9fa48("101658") ? true : (stryCov_9fa48("101658", "101659", "101660"), options.maxCommittedWriteLogEntries > NUM.ZERO)))) ? Math.floor(options.maxCommittedWriteLogEntries) : PARTITION_SERVICE_DEFAULT.MAX_COMMITTED_WRITE_LOG_ENTRIES;
      this.preparedStateHoldTimeoutMs = (stryMutAct_9fa48("101663") ? Number.isFinite(options.preparedStateHoldTimeoutMs) || options.preparedStateHoldTimeoutMs > NUM.ZERO : stryMutAct_9fa48("101662") ? false : stryMutAct_9fa48("101661") ? true : (stryCov_9fa48("101661", "101662", "101663"), Number.isFinite(options.preparedStateHoldTimeoutMs) && (stryMutAct_9fa48("101666") ? options.preparedStateHoldTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("101665") ? options.preparedStateHoldTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("101664") ? true : (stryCov_9fa48("101664", "101665", "101666"), options.preparedStateHoldTimeoutMs > NUM.ZERO)))) ? Math.floor(options.preparedStateHoldTimeoutMs) : TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
      this.preparedStateHoldSweepIntervalMs = (stryMutAct_9fa48("101669") ? Number.isFinite(options.preparedStateHoldSweepIntervalMs) || options.preparedStateHoldSweepIntervalMs > NUM.ZERO : stryMutAct_9fa48("101668") ? false : stryMutAct_9fa48("101667") ? true : (stryCov_9fa48("101667", "101668", "101669"), Number.isFinite(options.preparedStateHoldSweepIntervalMs) && (stryMutAct_9fa48("101672") ? options.preparedStateHoldSweepIntervalMs <= NUM.ZERO : stryMutAct_9fa48("101671") ? options.preparedStateHoldSweepIntervalMs >= NUM.ZERO : stryMutAct_9fa48("101670") ? true : (stryCov_9fa48("101670", "101671", "101672"), options.preparedStateHoldSweepIntervalMs > NUM.ZERO)))) ? Math.floor(options.preparedStateHoldSweepIntervalMs) : PARTITION_SERVICE_DEFAULT.PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS;
      this.preparedStateHoldTimer = null;
      this.activeTransaction = null;
      this.transactionOperations = stryMutAct_9fa48("101673") ? ["Stryker was here"] : (stryCov_9fa48("101673"), []); // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(PARTITION_SUBSYSTEM.PARTITION) : console;
      this.suppressLifecycleLogs = Boolean(options.suppressLifecycleLogs);
      this.onInitializationStage = (stryMutAct_9fa48("101676") ? typeof options.onInitializationStage !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101675") ? false : stryMutAct_9fa48("101674") ? true : (stryCov_9fa48("101674", "101675", "101676"), typeof options.onInitializationStage === PARTITION_SERVICE_TYPE.FUNCTION)) ? options.onInitializationStage : null; // State
      this.initialized = stryMutAct_9fa48("101677") ? true : (stryCov_9fa48("101677"), false);
      this.isShutdown = stryMutAct_9fa48("101678") ? true : (stryCov_9fa48("101678"), false);
      this.isLeader = stryMutAct_9fa48("101679") ? true : (stryCov_9fa48("101679"), false);
      this.leaderActivationScheduler = stryMutAct_9fa48("101682") ? options.leaderActivationScheduler && LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      }) : stryMutAct_9fa48("101681") ? false : stryMutAct_9fa48("101680") ? true : (stryCov_9fa48("101680", "101681", "101682"), options.leaderActivationScheduler || LeaderActivationScheduler.getShared(stryMutAct_9fa48("101683") ? {} : (stryCov_9fa48("101683"), {
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      })));
      this.leaderActivationGate = new LeaderActivationGate(stryMutAct_9fa48("101684") ? {} : (stryCov_9fa48("101684"), {
        holdoffMs: this.leaderActivationStabilizationMs,
        activationScheduler: this.leaderActivationScheduler
      }));
      this.lastPreparedStateReconstructionTerm = null; // PendingRequestTracker for lifecycle messages (replaces EventEmitter-based ACK handling)
      // Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
      this.pendingRequestTracker = new PendingRequestTracker(stryMutAct_9fa48("101685") ? {} : (stryCov_9fa48("101685"), {
        defaultTimeoutMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS
      }));
      this.systemTableCacheChangeListener = this.handleSystemTableCacheChange.bind(this);
      this.peerReconciliationScheduled = stryMutAct_9fa48("101686") ? true : (stryCov_9fa48("101686"), false); // Rebalancer - manages replica placement when this partition is leader
      this.rebalancer = null;
      this.rebalanceCoordinator = stryMutAct_9fa48("101689") ? options.rebalanceCoordinator && null : stryMutAct_9fa48("101688") ? false : stryMutAct_9fa48("101687") ? true : (stryCov_9fa48("101687", "101688", "101689"), options.rebalanceCoordinator || null);
      this.ownsRebalanceCoordinator = stryMutAct_9fa48("101690") ? true : (stryCov_9fa48("101690"), false);
      this.systemTableCache = stryMutAct_9fa48("101693") ? options.systemTableCache && null : stryMutAct_9fa48("101692") ? false : stryMutAct_9fa48("101691") ? true : (stryCov_9fa48("101691", "101692", "101693"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("101696") ? options.cdcIntegrationService && null : stryMutAct_9fa48("101695") ? false : stryMutAct_9fa48("101694") ? true : (stryCov_9fa48("101694", "101695", "101696"), options.cdcIntegrationService || null);
      this.sqlQueryEngine = stryMutAct_9fa48("101699") ? options.sqlQueryEngine && null : stryMutAct_9fa48("101698") ? false : stryMutAct_9fa48("101697") ? true : (stryCov_9fa48("101697", "101698", "101699"), options.sqlQueryEngine || null);
      this.tablePolicyService = stryMutAct_9fa48("101702") ? options.tablePolicyService && null : stryMutAct_9fa48("101701") ? false : stryMutAct_9fa48("101700") ? true : (stryCov_9fa48("101700", "101701", "101702"), options.tablePolicyService || null);
      if (stryMutAct_9fa48("101704") ? false : stryMutAct_9fa48("101703") ? true : (stryCov_9fa48("101703", "101704"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("101705")) {
          {}
        } else {
          stryCov_9fa48("101705");
          this.rebalanceCoordinator.sqlQueryEngine = this.sqlQueryEngine;
        }
      } // Message group service for sending CREATE_REPLICA/REMOVE_REPLICA messages
      this.messageGroupService = stryMutAct_9fa48("101708") ? options.messageGroupService && null : stryMutAct_9fa48("101707") ? false : stryMutAct_9fa48("101706") ? true : (stryCov_9fa48("101706", "101707", "101708"), options.messageGroupService || null); // MessageRouter for cross-node lifecycle messages (CREATE_REPLICA/REMOVE_REPLICA)
      // This transport properly routes through WebSocket to reach remote nodes
      this.messageRouter = stryMutAct_9fa48("101711") ? options.messageRouter && null : stryMutAct_9fa48("101710") ? false : stryMutAct_9fa48("101709") ? true : (stryCov_9fa48("101709", "101710", "101711"), options.messageRouter || null); // Defer election start until all replicas are ready
      // Learner phase support - new replicas joining existing groups start as learners
      // They receive log entries but don't vote until caught up
      // This prevents new replicas from disrupting existing leadership
      this.isJoiningExistingGroup = stryMutAct_9fa48("101714") ? options.isJoiningExistingGroup && false : stryMutAct_9fa48("101713") ? false : stryMutAct_9fa48("101712") ? true : (stryCov_9fa48("101712", "101713", "101714"), options.isJoiningExistingGroup || (stryMutAct_9fa48("101715") ? true : (stryCov_9fa48("101715"), false)));
      this.roleMutationHelper = this.createRoleMutationHelper();
      this.pendingRoleUpdate = this.role;
      this.persistedRole = null;
      this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.metadataPublicationReadinessTransitionListener = this.handleMetadataPublicationReadinessTransition.bind(this);
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.metadataPublicationReadinessState = stryMutAct_9fa48("101718") ? (options.metadataPublicationReadinessState || options.bootstrapReadinessState) && null : stryMutAct_9fa48("101717") ? false : stryMutAct_9fa48("101716") ? true : (stryCov_9fa48("101716", "101717", "101718"), (stryMutAct_9fa48("101720") ? options.metadataPublicationReadinessState && options.bootstrapReadinessState : stryMutAct_9fa48("101719") ? false : (stryCov_9fa48("101719", "101720"), options.metadataPublicationReadinessState || options.bootstrapReadinessState)) || null); // When true, the Raft election timer won't start until startElection() is called
      // This prevents election storms when multiple replicas are created on the same node
      // CRITICAL: Learners must defer elections to prevent disrupting existing leadership
      this.deferElection = stryMutAct_9fa48("101723") ? options.deferElection && this.isJoiningExistingGroup : stryMutAct_9fa48("101722") ? false : stryMutAct_9fa48("101721") ? true : (stryCov_9fa48("101721", "101722", "101723"), options.deferElection || this.isJoiningExistingGroup);
      this.electionStarted = stryMutAct_9fa48("101724") ? true : (stryCov_9fa48("101724"), false);
      this.raftTimingConfig = null; // ReplicaStateMachine for tracking replica lifecycle states
      this.replicaStateMachine = stryMutAct_9fa48("101727") ? options.replicaStateMachine && null : stryMutAct_9fa48("101726") ? false : stryMutAct_9fa48("101725") ? true : (stryCov_9fa48("101725", "101726", "101727"), options.replicaStateMachine || null); // Map of replicaId -> unified address (e.g., 'nodeId/partition/replicaId')
      // Used when joining an existing partition on a different node
      // Requirements: 1.1, 3.1, 3.2, 3.3
      this.peerAddresses = stryMutAct_9fa48("101730") ? options.peerAddresses && [] : stryMutAct_9fa48("101729") ? false : stryMutAct_9fa48("101728") ? true : (stryCov_9fa48("101728", "101729", "101730"), options.peerAddresses || (stryMutAct_9fa48("101731") ? ["Stryker was here"] : (stryCov_9fa48("101731"), [])));
      this.learnerPromotionDelayMs = stryMutAct_9fa48("101734") ? options.learnerPromotionDelayMs && PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS : stryMutAct_9fa48("101733") ? false : stryMutAct_9fa48("101732") ? true : (stryCov_9fa48("101732", "101733", "101734"), options.learnerPromotionDelayMs || PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS);
      this.learnerPromotionPriorityRecoveryDelayMs = stryMutAct_9fa48("101737") ? options.learnerPromotionPriorityRecoveryDelayMs && PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS : stryMutAct_9fa48("101736") ? false : stryMutAct_9fa48("101735") ? true : (stryCov_9fa48("101735", "101736", "101737"), options.learnerPromotionPriorityRecoveryDelayMs || PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS);
      this.learnerCatchUpCheckIntervalMs = stryMutAct_9fa48("101740") ? options.learnerCatchUpCheckIntervalMs && PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS : stryMutAct_9fa48("101739") ? false : stryMutAct_9fa48("101738") ? true : (stryCov_9fa48("101738", "101739", "101740"), options.learnerCatchUpCheckIntervalMs || PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS);
      this.learnerPromotionTimer = null; // Transient split execution handle — NOT canonical workflow state.
      // The durable split phase is owned by ManagedSplitWorkflow via
      // DurableWorkflowCoordinator. This object caches active execution
      // context (phase, pending write entries, flush guard) for the
      // duration of one runSplitReplicationWorkflow() invocation.
      // On process restart, the workflow owner reconstructs canonical
      // state from durable rows; this handle is rebuilt from that state
      // via reconstructSplitExecutionState().
      this.splitReplication = null;
      this.splitReplicationRun = null;
      this.splitSnapshotBackfillYieldEveryRows = SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS;
    }
  }
  get systemTableCache() {
    if (stryMutAct_9fa48("101741")) {
      {}
    } else {
      stryCov_9fa48("101741");
      return stryMutAct_9fa48("101744") ? this._systemTableCache && null : stryMutAct_9fa48("101743") ? false : stryMutAct_9fa48("101742") ? true : (stryCov_9fa48("101742", "101743", "101744"), this._systemTableCache || null);
    }
  }
  set systemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("101745")) {
      {}
    } else {
      stryCov_9fa48("101745");
      const previousCache = stryMutAct_9fa48("101748") ? this._systemTableCache && null : stryMutAct_9fa48("101747") ? false : stryMutAct_9fa48("101746") ? true : (stryCov_9fa48("101746", "101747", "101748"), this._systemTableCache || null);
      if (stryMutAct_9fa48("101751") ? previousCache && previousCache !== systemTableCache && typeof previousCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("101750") ? false : stryMutAct_9fa48("101749") ? true : (stryCov_9fa48("101749", "101750", "101751"), (stryMutAct_9fa48("101753") ? previousCache && previousCache !== systemTableCache || typeof previousCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101752") ? true : (stryCov_9fa48("101752", "101753"), (stryMutAct_9fa48("101755") ? previousCache || previousCache !== systemTableCache : stryMutAct_9fa48("101754") ? true : (stryCov_9fa48("101754", "101755"), previousCache && (stryMutAct_9fa48("101757") ? previousCache === systemTableCache : stryMutAct_9fa48("101756") ? true : (stryCov_9fa48("101756", "101757"), previousCache !== systemTableCache)))) && (stryMutAct_9fa48("101759") ? typeof previousCache.offCacheChange !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101758") ? true : (stryCov_9fa48("101758", "101759"), typeof previousCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("101760")) {
          {}
        } else {
          stryCov_9fa48("101760");
          previousCache.offCacheChange(this.systemTableCacheChangeListener);
        }
      }
      this._systemTableCache = systemTableCache;
      stryMutAct_9fa48("101761") ? this.roleMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("101761"), this.roleMutationHelper?.setSystemTableCache(systemTableCache));
      stryMutAct_9fa48("101762") ? this.leaderNodeMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("101762"), this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache));
      if (stryMutAct_9fa48("101764") ? false : stryMutAct_9fa48("101763") ? true : (stryCov_9fa48("101763", "101764"), this.rebalancer)) {
        if (stryMutAct_9fa48("101765")) {
          {}
        } else {
          stryCov_9fa48("101765");
          this.rebalancer.systemTableCache = systemTableCache;
        }
      }
      if (stryMutAct_9fa48("101767") ? false : stryMutAct_9fa48("101766") ? true : (stryCov_9fa48("101766", "101767"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("101768")) {
          {}
        } else {
          stryCov_9fa48("101768");
          this.rebalanceCoordinator.systemTableCache = systemTableCache;
        }
      }
      if (stryMutAct_9fa48("101771") ? systemTableCache && systemTableCache !== previousCache && typeof systemTableCache.onCacheChange === PARTITION_SERVICE_TYPE.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("101770") ? false : stryMutAct_9fa48("101769") ? true : (stryCov_9fa48("101769", "101770", "101771"), (stryMutAct_9fa48("101773") ? systemTableCache && systemTableCache !== previousCache || typeof systemTableCache.onCacheChange === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101772") ? true : (stryCov_9fa48("101772", "101773"), (stryMutAct_9fa48("101775") ? systemTableCache || systemTableCache !== previousCache : stryMutAct_9fa48("101774") ? true : (stryCov_9fa48("101774", "101775"), systemTableCache && (stryMutAct_9fa48("101777") ? systemTableCache === previousCache : stryMutAct_9fa48("101776") ? true : (stryCov_9fa48("101776", "101777"), systemTableCache !== previousCache)))) && (stryMutAct_9fa48("101779") ? typeof systemTableCache.onCacheChange !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101778") ? true : (stryCov_9fa48("101778", "101779"), typeof systemTableCache.onCacheChange === PARTITION_SERVICE_TYPE.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("101780")) {
          {}
        } else {
          stryCov_9fa48("101780");
          systemTableCache.onCacheChange(this.systemTableCacheChangeListener);
        }
      }
      this.scheduleRaftPeerReconciliation();
    }
  }
  get cdcIntegrationService() {
    if (stryMutAct_9fa48("101781")) {
      {}
    } else {
      stryCov_9fa48("101781");
      return stryMutAct_9fa48("101784") ? this._cdcIntegrationService && null : stryMutAct_9fa48("101783") ? false : stryMutAct_9fa48("101782") ? true : (stryCov_9fa48("101782", "101783", "101784"), this._cdcIntegrationService || null);
    }
  }
  set cdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("101785")) {
      {}
    } else {
      stryCov_9fa48("101785");
      this._cdcIntegrationService = cdcIntegrationService;
      stryMutAct_9fa48("101786") ? this.roleMutationHelper.setCdcIntegrationService(cdcIntegrationService) : (stryCov_9fa48("101786"), this.roleMutationHelper?.setCdcIntegrationService(cdcIntegrationService));
      stryMutAct_9fa48("101787") ? this.leaderNodeMutationHelper.setCdcIntegrationService(cdcIntegrationService) : (stryCov_9fa48("101787"), this.leaderNodeMutationHelper?.setCdcIntegrationService(cdcIntegrationService));
      if (stryMutAct_9fa48("101789") ? false : stryMutAct_9fa48("101788") ? true : (stryCov_9fa48("101788", "101789"), this.rebalancer)) {
        if (stryMutAct_9fa48("101790")) {
          {}
        } else {
          stryCov_9fa48("101790");
          this.rebalancer.cdcIntegrationService = cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("101792") ? false : stryMutAct_9fa48("101791") ? true : (stryCov_9fa48("101791", "101792"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("101793")) {
          {}
        } else {
          stryCov_9fa48("101793");
          this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
        }
      }
    }
  }
  get pendingRoleUpdate() {
    if (stryMutAct_9fa48("101794")) {
      {}
    } else {
      stryCov_9fa48("101794");
      return stryMutAct_9fa48("101797") ? this.roleMutationHelper?.pendingValue && null : stryMutAct_9fa48("101796") ? false : stryMutAct_9fa48("101795") ? true : (stryCov_9fa48("101795", "101796", "101797"), (stryMutAct_9fa48("101798") ? this.roleMutationHelper.pendingValue : (stryCov_9fa48("101798"), this.roleMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingRoleUpdate(role) {
    if (stryMutAct_9fa48("101799")) {
      {}
    } else {
      stryCov_9fa48("101799");
      if (stryMutAct_9fa48("101801") ? false : stryMutAct_9fa48("101800") ? true : (stryCov_9fa48("101800", "101801"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("101802")) {
          {}
        } else {
          stryCov_9fa48("101802");
          this.roleMutationHelper.pendingValue = normalizePublishedRaftRole(role, stryMutAct_9fa48("101803") ? {} : (stryCov_9fa48("101803"), {
            collapseLeaderToFollower: stryMutAct_9fa48("101804") ? false : (stryCov_9fa48("101804"), true)
          }));
        }
      }
    }
  }
  get persistedRole() {
    if (stryMutAct_9fa48("101805")) {
      {}
    } else {
      stryCov_9fa48("101805");
      return stryMutAct_9fa48("101808") ? this.roleMutationHelper?.persistedValue && null : stryMutAct_9fa48("101807") ? false : stryMutAct_9fa48("101806") ? true : (stryCov_9fa48("101806", "101807", "101808"), (stryMutAct_9fa48("101809") ? this.roleMutationHelper.persistedValue : (stryCov_9fa48("101809"), this.roleMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedRole(role) {
    if (stryMutAct_9fa48("101810")) {
      {}
    } else {
      stryCov_9fa48("101810");
      if (stryMutAct_9fa48("101812") ? false : stryMutAct_9fa48("101811") ? true : (stryCov_9fa48("101811", "101812"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("101813")) {
          {}
        } else {
          stryCov_9fa48("101813");
          this.roleMutationHelper.persistedValue = role;
        }
      }
    }
  }
  get roleUpdateInFlight() {
    if (stryMutAct_9fa48("101814")) {
      {}
    } else {
      stryCov_9fa48("101814");
      return stryMutAct_9fa48("101817") ? this.roleMutationHelper?.inFlight && false : stryMutAct_9fa48("101816") ? false : stryMutAct_9fa48("101815") ? true : (stryCov_9fa48("101815", "101816", "101817"), (stryMutAct_9fa48("101818") ? this.roleMutationHelper.inFlight : (stryCov_9fa48("101818"), this.roleMutationHelper?.inFlight)) || (stryMutAct_9fa48("101819") ? true : (stryCov_9fa48("101819"), false)));
    }
  }
  get roleUpdateRetryTimer() {
    if (stryMutAct_9fa48("101820")) {
      {}
    } else {
      stryCov_9fa48("101820");
      return stryMutAct_9fa48("101823") ? this.roleMutationHelper?.retryTimer && null : stryMutAct_9fa48("101822") ? false : stryMutAct_9fa48("101821") ? true : (stryCov_9fa48("101821", "101822", "101823"), (stryMutAct_9fa48("101824") ? this.roleMutationHelper.retryTimer : (stryCov_9fa48("101824"), this.roleMutationHelper?.retryTimer)) || null);
    }
  }
  set roleUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("101825")) {
      {}
    } else {
      stryCov_9fa48("101825");
      if (stryMutAct_9fa48("101827") ? false : stryMutAct_9fa48("101826") ? true : (stryCov_9fa48("101826", "101827"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("101828")) {
          {}
        } else {
          stryCov_9fa48("101828");
          this.roleMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  get pendingLeaderNodeUpdate() {
    if (stryMutAct_9fa48("101829")) {
      {}
    } else {
      stryCov_9fa48("101829");
      return stryMutAct_9fa48("101832") ? this.leaderNodeMutationHelper?.pendingValue && null : stryMutAct_9fa48("101831") ? false : stryMutAct_9fa48("101830") ? true : (stryCov_9fa48("101830", "101831", "101832"), (stryMutAct_9fa48("101833") ? this.leaderNodeMutationHelper.pendingValue : (stryCov_9fa48("101833"), this.leaderNodeMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("101834")) {
      {}
    } else {
      stryCov_9fa48("101834");
      if (stryMutAct_9fa48("101836") ? false : stryMutAct_9fa48("101835") ? true : (stryCov_9fa48("101835", "101836"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("101837")) {
          {}
        } else {
          stryCov_9fa48("101837");
          this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
        }
      }
    }
  }
  get persistedLeaderNodeId() {
    if (stryMutAct_9fa48("101838")) {
      {}
    } else {
      stryCov_9fa48("101838");
      return stryMutAct_9fa48("101841") ? this.leaderNodeMutationHelper?.persistedValue && null : stryMutAct_9fa48("101840") ? false : stryMutAct_9fa48("101839") ? true : (stryCov_9fa48("101839", "101840", "101841"), (stryMutAct_9fa48("101842") ? this.leaderNodeMutationHelper.persistedValue : (stryCov_9fa48("101842"), this.leaderNodeMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedLeaderNodeId(leaderNodeId) {
    if (stryMutAct_9fa48("101843")) {
      {}
    } else {
      stryCov_9fa48("101843");
      if (stryMutAct_9fa48("101845") ? false : stryMutAct_9fa48("101844") ? true : (stryCov_9fa48("101844", "101845"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("101846")) {
          {}
        } else {
          stryCov_9fa48("101846");
          this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
        }
      }
    }
  }
  get leaderNodeUpdateInFlight() {
    if (stryMutAct_9fa48("101847")) {
      {}
    } else {
      stryCov_9fa48("101847");
      return stryMutAct_9fa48("101850") ? this.leaderNodeMutationHelper?.inFlight && false : stryMutAct_9fa48("101849") ? false : stryMutAct_9fa48("101848") ? true : (stryCov_9fa48("101848", "101849", "101850"), (stryMutAct_9fa48("101851") ? this.leaderNodeMutationHelper.inFlight : (stryCov_9fa48("101851"), this.leaderNodeMutationHelper?.inFlight)) || (stryMutAct_9fa48("101852") ? true : (stryCov_9fa48("101852"), false)));
    }
  }
  set leaderNodeUpdateInFlight(inFlight) {
    if (stryMutAct_9fa48("101853")) {
      {}
    } else {
      stryCov_9fa48("101853");
      if (stryMutAct_9fa48("101855") ? false : stryMutAct_9fa48("101854") ? true : (stryCov_9fa48("101854", "101855"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("101856")) {
          {}
        } else {
          stryCov_9fa48("101856");
          this.leaderNodeMutationHelper.inFlight = inFlight;
        }
      }
    }
  }
  get leaderNodeUpdateRetryTimer() {
    if (stryMutAct_9fa48("101857")) {
      {}
    } else {
      stryCov_9fa48("101857");
      return stryMutAct_9fa48("101860") ? this.leaderNodeMutationHelper?.retryTimer && null : stryMutAct_9fa48("101859") ? false : stryMutAct_9fa48("101858") ? true : (stryCov_9fa48("101858", "101859", "101860"), (stryMutAct_9fa48("101861") ? this.leaderNodeMutationHelper.retryTimer : (stryCov_9fa48("101861"), this.leaderNodeMutationHelper?.retryTimer)) || null);
    }
  }
  set leaderNodeUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("101862")) {
      {}
    } else {
      stryCov_9fa48("101862");
      if (stryMutAct_9fa48("101864") ? false : stryMutAct_9fa48("101863") ? true : (stryCov_9fa48("101863", "101864"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("101865")) {
          {}
        } else {
          stryCov_9fa48("101865");
          this.leaderNodeMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  get metadataPublicationReadinessState() {
    if (stryMutAct_9fa48("101866")) {
      {}
    } else {
      stryCov_9fa48("101866");
      return stryMutAct_9fa48("101869") ? this._metadataPublicationReadinessState && null : stryMutAct_9fa48("101868") ? false : stryMutAct_9fa48("101867") ? true : (stryCov_9fa48("101867", "101868", "101869"), this._metadataPublicationReadinessState || null);
    }
  }
  set metadataPublicationReadinessState(readinessState) {
    if (stryMutAct_9fa48("101870")) {
      {}
    } else {
      stryCov_9fa48("101870");
      if (stryMutAct_9fa48("101873") ? typeof this.releaseMetadataPublicationReadinessListener !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101872") ? false : stryMutAct_9fa48("101871") ? true : (stryCov_9fa48("101871", "101872", "101873"), typeof this.releaseMetadataPublicationReadinessListener === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("101874")) {
          {}
        } else {
          stryCov_9fa48("101874");
          this.releaseMetadataPublicationReadinessListener();
        }
      }
      this._metadataPublicationReadinessState = stryMutAct_9fa48("101877") ? readinessState && null : stryMutAct_9fa48("101876") ? false : stryMutAct_9fa48("101875") ? true : (stryCov_9fa48("101875", "101876", "101877"), readinessState || null);
      this.releaseMetadataPublicationReadinessListener = attachTrafficReadinessListener(this._metadataPublicationReadinessState, this.metadataPublicationReadinessTransitionListener);
    }
  }
  isMetadataPublicationReady() {
    if (stryMutAct_9fa48("101878")) {
      {}
    } else {
      stryCov_9fa48("101878");
      if (stryMutAct_9fa48("101881") ? false : stryMutAct_9fa48("101880") ? true : stryMutAct_9fa48("101879") ? this.metadataPublicationReadinessState : (stryCov_9fa48("101879", "101880", "101881"), !this.metadataPublicationReadinessState)) {
        if (stryMutAct_9fa48("101882")) {
          {}
        } else {
          stryCov_9fa48("101882");
          return stryMutAct_9fa48("101883") ? false : (stryCov_9fa48("101883"), true);
        }
      }
      return isMetadataPublicationLifecycleReady(this.metadataPublicationReadinessState);
    }
  }
  isBackgroundWorkReady() {
    if (stryMutAct_9fa48("101884")) {
      {}
    } else {
      stryCov_9fa48("101884");
      return isBackgroundWorkLifecycleReady(this.metadataPublicationReadinessState, stryMutAct_9fa48("101885") ? {} : (stryCov_9fa48("101885"), {
        partitionId: this.partitionId
      }));
    }
  }
  handleMetadataPublicationReadinessTransition() {
    if (stryMutAct_9fa48("101886")) {
      {}
    } else {
      stryCov_9fa48("101886");
      this.maybeInitializeRebalancer();
      if (stryMutAct_9fa48("101889") ? false : stryMutAct_9fa48("101888") ? true : stryMutAct_9fa48("101887") ? this.isMetadataPublicationReady() : (stryCov_9fa48("101887", "101888", "101889"), !this.isMetadataPublicationReady())) {
        if (stryMutAct_9fa48("101890")) {
          {}
        } else {
          stryCov_9fa48("101890");
          return;
        }
      }
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("101891")) {
          {}
        } else {
          stryCov_9fa48("101891");
          this.logger.warn(PARTITION_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_PARTITION_RAFT_ROLE_UPDATE, stryMutAct_9fa48("101892") ? {} : (stryCov_9fa48("101892"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("101893")) {
          {}
        } else {
          stryCov_9fa48("101893");
          this.logger.warn(PARTITION_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_PARTITION_LEADER_UPDATE, stryMutAct_9fa48("101894") ? {} : (stryCov_9fa48("101894"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
    }
  }
  updateRebalancerLeadership() {
    if (stryMutAct_9fa48("101895")) {
      {}
    } else {
      stryCov_9fa48("101895");
      if (stryMutAct_9fa48("101898") ? false : stryMutAct_9fa48("101897") ? true : stryMutAct_9fa48("101896") ? this.rebalancer : (stryCov_9fa48("101896", "101897", "101898"), !this.rebalancer)) {
        if (stryMutAct_9fa48("101899")) {
          {}
        } else {
          stryCov_9fa48("101899");
          this.maybeInitializeRebalancer();
          return;
        }
      }
      if (stryMutAct_9fa48("101902") ? typeof this.rebalancer.setLeader !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("101901") ? false : stryMutAct_9fa48("101900") ? true : (stryCov_9fa48("101900", "101901", "101902"), typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("101903")) {
          {}
        } else {
          stryCov_9fa48("101903");
          this.rebalancer.setLeader(stryMutAct_9fa48("101906") ? this.isBackgroundWorkReady() || this.isLeader : stryMutAct_9fa48("101905") ? false : stryMutAct_9fa48("101904") ? true : (stryCov_9fa48("101904", "101905", "101906"), this.isBackgroundWorkReady() && this.isLeader));
        }
      }
    }
  }
  cancelLeaderOwnedActivation() {
    if (stryMutAct_9fa48("101907")) {
      {}
    } else {
      stryCov_9fa48("101907");
      this.leaderActivationGate.cancel(stryMutAct_9fa48("101908") ? {} : (stryCov_9fa48("101908"), {
        clearActivatedTerm: stryMutAct_9fa48("101909") ? false : (stryCov_9fa48("101909"), true)
      }));
    }
  }
  scheduleLeaderOwnedActivation(term) {
    if (stryMutAct_9fa48("101910")) {
      {}
    } else {
      stryCov_9fa48("101910");
      this.leaderActivationGate.schedule(term, () => {
        if (stryMutAct_9fa48("101911")) {
          {}
        } else {
          stryCov_9fa48("101911");
          if (stryMutAct_9fa48("101914") ? this.isShutdown && !this.isLeader : stryMutAct_9fa48("101913") ? false : stryMutAct_9fa48("101912") ? true : (stryCov_9fa48("101912", "101913", "101914"), this.isShutdown || (stryMutAct_9fa48("101915") ? this.isLeader : (stryCov_9fa48("101915"), !this.isLeader)))) {
            if (stryMutAct_9fa48("101916")) {
              {}
            } else {
              stryCov_9fa48("101916");
              return;
            }
          }
          if (stryMutAct_9fa48("101919") ? false : stryMutAct_9fa48("101918") ? true : stryMutAct_9fa48("101917") ? this.isJoiningExistingGroup : (stryCov_9fa48("101917", "101918", "101919"), !this.isJoiningExistingGroup)) {
            if (stryMutAct_9fa48("101920")) {
              {}
            } else {
              stryCov_9fa48("101920");
              this.updateRebalancerLeadership();
            }
          }
          this.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("101921") ? {} : (stryCov_9fa48("101921"), {
            term,
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            rebalancerActive: stryMutAct_9fa48("101924") ? !this.isJoiningExistingGroup || this.isBackgroundWorkReady() : stryMutAct_9fa48("101923") ? false : stryMutAct_9fa48("101922") ? true : (stryCov_9fa48("101922", "101923", "101924"), (stryMutAct_9fa48("101925") ? this.isJoiningExistingGroup : (stryCov_9fa48("101925"), !this.isJoiningExistingGroup)) && this.isBackgroundWorkReady())
          }));
          if (stryMutAct_9fa48("101928") ? this.lastPreparedStateReconstructionTerm === term : stryMutAct_9fa48("101927") ? false : stryMutAct_9fa48("101926") ? true : (stryCov_9fa48("101926", "101927", "101928"), this.lastPreparedStateReconstructionTerm !== term)) {
            if (stryMutAct_9fa48("101929")) {
              {}
            } else {
              stryCov_9fa48("101929");
              const reconstruction = this.reconstructPreparedState();
              this.lastPreparedStateReconstructionTerm = term;
              this.logger.info(PARTITION_SERVICE_LOG_MSG.PREPARED_STATE_RECONSTRUCTED, stryMutAct_9fa48("101930") ? {} : (stryCov_9fa48("101930"), {
                partitionId: this.partitionId,
                preparedTransactionCount: reconstruction.preparedTransactionCount,
                prepareLostCount: reconstruction.prepareLostCount
              }));
            }
          }
          this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, stryMutAct_9fa48("101931") ? {} : (stryCov_9fa48("101931"), {
            leaderId: this.replicaId,
            term,
            partitionId: this.partitionId
          }));
        }
      }, stryMutAct_9fa48("101932") ? {} : (stryCov_9fa48("101932"), {
        immediate: stryMutAct_9fa48("101935") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("101934") ? false : stryMutAct_9fa48("101933") ? true : (stryCov_9fa48("101933", "101934", "101935"), this.replicaIds.length === NUM.ONE),
        shouldActivate: stryMutAct_9fa48("101936") ? () => undefined : (stryCov_9fa48("101936"), () => stryMutAct_9fa48("101939") ? !this.isShutdown || this.isLeader : stryMutAct_9fa48("101938") ? false : stryMutAct_9fa48("101937") ? true : (stryCov_9fa48("101937", "101938", "101939"), (stryMutAct_9fa48("101940") ? this.isShutdown : (stryCov_9fa48("101940"), !this.isShutdown)) && this.isLeader))
      }));
    }
  }
  createRoleMutationHelper() {
    if (stryMutAct_9fa48("101941")) {
      {}
    } else {
      stryCov_9fa48("101941");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("101942") ? {} : (stryCov_9fa48("101942"), {
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        buildWhereClause: (_role, context = {}) => {
          if (stryMutAct_9fa48("101943")) {
            {}
          } else {
            stryCov_9fa48("101943");
            const whereClause = stryMutAct_9fa48("101944") ? {} : (stryCov_9fa48("101944"), {
              service_id: this.replicaId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("101947") ? typeof cachedRow?.raft_role === TYPEOF.STRING || cachedRow.raft_role.length > NUM.ZERO : stryMutAct_9fa48("101946") ? false : stryMutAct_9fa48("101945") ? true : (stryCov_9fa48("101945", "101946", "101947"), (stryMutAct_9fa48("101949") ? typeof cachedRow?.raft_role !== TYPEOF.STRING : stryMutAct_9fa48("101948") ? true : (stryCov_9fa48("101948", "101949"), typeof (stryMutAct_9fa48("101950") ? cachedRow.raft_role : (stryCov_9fa48("101950"), cachedRow?.raft_role)) === TYPEOF.STRING)) && (stryMutAct_9fa48("101953") ? cachedRow.raft_role.length <= NUM.ZERO : stryMutAct_9fa48("101952") ? cachedRow.raft_role.length >= NUM.ZERO : stryMutAct_9fa48("101951") ? true : (stryCov_9fa48("101951", "101952", "101953"), cachedRow.raft_role.length > NUM.ZERO)))) {
              if (stryMutAct_9fa48("101954")) {
                {}
              } else {
                stryCov_9fa48("101954");
                whereClause.raft_role = cachedRow.raft_role;
              }
            }
            if (stryMutAct_9fa48("101956") ? false : stryMutAct_9fa48("101955") ? true : (stryCov_9fa48("101955", "101956"), Number.isFinite(stryMutAct_9fa48("101957") ? cachedRow.updated_at : (stryCov_9fa48("101957"), cachedRow?.updated_at)))) {
              if (stryMutAct_9fa48("101958")) {
                {}
              } else {
                stryCov_9fa48("101958");
                whereClause.updated_at = cachedRow.updated_at;
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("101959") ? () => undefined : (stryCov_9fa48("101959"), (role, updatedAt) => stryMutAct_9fa48("101960") ? {} : (stryCov_9fa48("101960"), {
          raft_role: role,
          updated_at: updatedAt
        })),
        buildUpdateOptions: stryMutAct_9fa48("101961") ? () => undefined : (stryCov_9fa48("101961"), () => stryMutAct_9fa48("101962") ? {} : (stryCov_9fa48("101962"), {
          deliveryPriority: PARTITION_SERVICE_LITERAL.BACKGROUND,
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          allowPressureDefer: stryMutAct_9fa48("101963") ? false : (stryCov_9fa48("101963"), true),
          routingReadinessDimension: this.getMetadataPublicationReadinessDimension()
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("101964") ? () => undefined : (stryCov_9fa48("101964"), role => stryMutAct_9fa48("101965") ? {} : (stryCov_9fa48("101965"), {
          raft_role: role
        })),
        prepareFlush: stryMutAct_9fa48("101966") ? () => undefined : (stryCov_9fa48("101966"), () => stryMutAct_9fa48("101967") ? {} : (stryCov_9fa48("101967"), {
          skip: stryMutAct_9fa48("101968") ? true : (stryCov_9fa48("101968"), false),
          clearPending: stryMutAct_9fa48("101969") ? true : (stryCov_9fa48("101969"), false),
          reason: PARTITION_SERVICE_LITERAL.READY
        })),
        readRowFromCache: stryMutAct_9fa48("101970") ? () => undefined : (stryCov_9fa48("101970"), systemTableCache => stryMutAct_9fa48("101973") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) && null : stryMutAct_9fa48("101972") ? false : stryMutAct_9fa48("101971") ? true : (stryCov_9fa48("101971", "101972", "101973"), (stryMutAct_9fa48("101975") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("101974") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("101974", "101975"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId))) || null)),
        readValueFromCache: systemTableCache => {
          if (stryMutAct_9fa48("101976")) {
            {}
          } else {
            stryCov_9fa48("101976");
            const cached = stryMutAct_9fa48("101978") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("101977") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("101977", "101978"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId));
            return stryMutAct_9fa48("101981") ? cached?.raft_role && null : stryMutAct_9fa48("101980") ? false : stryMutAct_9fa48("101979") ? true : (stryCov_9fa48("101979", "101980", "101981"), (stryMutAct_9fa48("101982") ? cached.raft_role : (stryCov_9fa48("101982"), cached?.raft_role)) || null);
          }
        },
        isWriteReady: stryMutAct_9fa48("101983") ? () => undefined : (stryCov_9fa48("101983"), () => this.isServicesLeaderAvailable()),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("101984")) {
            {}
          } else {
            stryCov_9fa48("101984");
            this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_RAFT_ROLE_FAILED, stryMutAct_9fa48("101985") ? {} : (stryCov_9fa48("101985"), {
              partitionId: this.partitionId,
              replicaId: this.replicaId,
              role: stryMutAct_9fa48("101986") ? context.value && this.pendingRoleUpdate : (stryCov_9fa48("101986"), context.value ?? this.pendingRoleUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  }
  createLeaderNodeMutationHelper() {
    if (stryMutAct_9fa48("101987")) {
      {}
    } else {
      stryCov_9fa48("101987");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("101988") ? {} : (stryCov_9fa48("101988"), {
        tableName: SYSTEM_TABLE_NAME.PARTITIONS,
        buildWhereClause: (_leaderNodeId, context = {}) => {
          if (stryMutAct_9fa48("101989")) {
            {}
          } else {
            stryCov_9fa48("101989");
            const whereClause = stryMutAct_9fa48("101990") ? {} : (stryCov_9fa48("101990"), {
              [COLUMN.PARTITION_ID]: this.partitionId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("101993") ? typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === TYPEOF.STRING || cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO : stryMutAct_9fa48("101992") ? false : stryMutAct_9fa48("101991") ? true : (stryCov_9fa48("101991", "101992", "101993"), (stryMutAct_9fa48("101995") ? typeof cachedRow?.[COLUMN.LEADER_NODE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("101994") ? true : (stryCov_9fa48("101994", "101995"), typeof (stryMutAct_9fa48("101996") ? cachedRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("101996"), cachedRow?.[COLUMN.LEADER_NODE_ID])) === TYPEOF.STRING)) && (stryMutAct_9fa48("101999") ? cachedRow[COLUMN.LEADER_NODE_ID].length <= NUM.ZERO : stryMutAct_9fa48("101998") ? cachedRow[COLUMN.LEADER_NODE_ID].length >= NUM.ZERO : stryMutAct_9fa48("101997") ? true : (stryCov_9fa48("101997", "101998", "101999"), cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO)))) {
              if (stryMutAct_9fa48("102000")) {
                {}
              } else {
                stryCov_9fa48("102000");
                whereClause[COLUMN.LEADER_NODE_ID] = cachedRow[COLUMN.LEADER_NODE_ID];
              }
            }
            if (stryMutAct_9fa48("102002") ? false : stryMutAct_9fa48("102001") ? true : (stryCov_9fa48("102001", "102002"), Number.isFinite(stryMutAct_9fa48("102003") ? cachedRow[COLUMN.UPDATED_AT] : (stryCov_9fa48("102003"), cachedRow?.[COLUMN.UPDATED_AT])))) {
              if (stryMutAct_9fa48("102004")) {
                {}
              } else {
                stryCov_9fa48("102004");
                whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("102005") ? () => undefined : (stryCov_9fa48("102005"), (leaderNodeId, updatedAt) => stryMutAct_9fa48("102006") ? {} : (stryCov_9fa48("102006"), {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
          [COLUMN.UPDATED_AT]: updatedAt
        })),
        buildUpdateOptions: stryMutAct_9fa48("102007") ? () => undefined : (stryCov_9fa48("102007"), () => stryMutAct_9fa48("102008") ? {} : (stryCov_9fa48("102008"), {
          deliveryPriority: this.getMetadataPublicationDeliveryPriority(),
          routingReadinessDimension: this.getMetadataPublicationReadinessDimension()
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("102009") ? () => undefined : (stryCov_9fa48("102009"), leaderNodeId => stryMutAct_9fa48("102010") ? {} : (stryCov_9fa48("102010"), {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId
        })),
        readRowFromCache: stryMutAct_9fa48("102011") ? () => undefined : (stryCov_9fa48("102011"), systemTableCache => stryMutAct_9fa48("102014") ? systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId) && null : stryMutAct_9fa48("102013") ? false : stryMutAct_9fa48("102012") ? true : (stryCov_9fa48("102012", "102013", "102014"), (stryMutAct_9fa48("102016") ? systemTableCache.get?.(TABLES.PARTITIONS, this.partitionId) : stryMutAct_9fa48("102015") ? systemTableCache?.get(TABLES.PARTITIONS, this.partitionId) : (stryCov_9fa48("102015", "102016"), systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId))) || null)),
        readValueFromCache: systemTableCache => {
          if (stryMutAct_9fa48("102017")) {
            {}
          } else {
            stryCov_9fa48("102017");
            const cached = stryMutAct_9fa48("102019") ? systemTableCache.get?.(TABLES.PARTITIONS, this.partitionId) : stryMutAct_9fa48("102018") ? systemTableCache?.get(TABLES.PARTITIONS, this.partitionId) : (stryCov_9fa48("102018", "102019"), systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId));
            return stryMutAct_9fa48("102022") ? cached?.[COLUMN.LEADER_NODE_ID] && null : stryMutAct_9fa48("102021") ? false : stryMutAct_9fa48("102020") ? true : (stryCov_9fa48("102020", "102021", "102022"), (stryMutAct_9fa48("102023") ? cached[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("102023"), cached?.[COLUMN.LEADER_NODE_ID])) || null);
          }
        },
        prepareFlush: stryMutAct_9fa48("102024") ? () => undefined : (stryCov_9fa48("102024"), () => stryMutAct_9fa48("102025") ? {} : (stryCov_9fa48("102025"), {
          skip: stryMutAct_9fa48("102026") ? this.isLeader : (stryCov_9fa48("102026"), !this.isLeader),
          clearPending: stryMutAct_9fa48("102027") ? this.isLeader : (stryCov_9fa48("102027"), !this.isLeader),
          reason: (stryMutAct_9fa48("102028") ? this.isLeader : (stryCov_9fa48("102028"), !this.isLeader)) ? PARTITION_SERVICE_LITERAL.NOT_OWNER : PARTITION_SERVICE_LITERAL.READY
        })),
        isWriteReady: stryMutAct_9fa48("102029") ? () => undefined : (stryCov_9fa48("102029"), () => this.isPartitionsLeaderAvailable()),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("102030")) {
            {}
          } else {
            stryCov_9fa48("102030");
            this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED, stryMutAct_9fa48("102031") ? {} : (stryCov_9fa48("102031"), {
              partitionId: this.partitionId,
              replicaId: this.replicaId,
              leaderNodeId: stryMutAct_9fa48("102032") ? context.value && this.pendingLeaderNodeUpdate : (stryCov_9fa48("102032"), context.value ?? this.pendingLeaderNodeUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  } /**
    * Get the unified address for this service.
    * Format: ${nodeId}/partition/${replicaId}
    * Requirements: 1.1, 5.1
    * @return {string} Unified address.
    */
  getUnifiedAddress() {
    if (stryMutAct_9fa48("102033")) {
      {}
    } else {
      stryCov_9fa48("102033");
      return this.unifiedAddress;
    }
  } /**
    * Build a unified address for a peer replica.
    * Looks up the nodeId from the system table cache if available.
    * Throws if a unified address cannot be resolved.
    * All addresses use fully qualified network identity format: {nodeId}/partition/{replicaId}
    * Requirements: 1.1, 1.4, 3.1, 3.2, 3.3, 9.1
    * @param {string} peerId - Peer replica ID.
    * @return {string} Unified address for the peer.
    */
  buildPeerAddress(peerId) {
    if (stryMutAct_9fa48("102034")) {
      {}
    } else {
      stryCov_9fa48("102034");
      const addressManager = AddressManager.getInstance();
      const cacheAddress = this.resolvePeerAddressFromCache(peerId); // If peerId is already in unified format, validate and return as-is.
      // Fail fast (and log) when a provided address is not unified.
      if (stryMutAct_9fa48("102036") ? false : stryMutAct_9fa48("102035") ? true : (stryCov_9fa48("102035", "102036"), peerId.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("102037")) {
          {}
        } else {
          stryCov_9fa48("102037");
          const validation = addressManager.validate(peerId);
          if (stryMutAct_9fa48("102039") ? false : stryMutAct_9fa48("102038") ? true : (stryCov_9fa48("102038", "102039"), validation.valid)) {
            if (stryMutAct_9fa48("102040")) {
              {}
            } else {
              stryCov_9fa48("102040");
              return peerId;
            }
          }
          this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("102041") ? {} : (stryCov_9fa48("102041"), {
            peerId,
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: validation.error
          }));
          throw new Error(stryMutAct_9fa48("102042") ? `` : (stryCov_9fa48("102042"), `Peer address must be unified: ${peerId}`));
        }
      } // Check peerAddresses array (provided during cross-node joining)
      // Format: ['nodeId/partition/replicaId', ...]
      // Requirements: 1.1, 1.4, 3.1, 3.2, 3.3
      if (stryMutAct_9fa48("102045") ? this.peerAddresses || this.peerAddresses.length > NUM.ZERO : stryMutAct_9fa48("102044") ? false : stryMutAct_9fa48("102043") ? true : (stryCov_9fa48("102043", "102044", "102045"), this.peerAddresses && (stryMutAct_9fa48("102048") ? this.peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("102047") ? this.peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("102046") ? true : (stryCov_9fa48("102046", "102047", "102048"), this.peerAddresses.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("102049")) {
          {}
        } else {
          stryCov_9fa48("102049");
          for (const addr of this.peerAddresses) {
            if (stryMutAct_9fa48("102050")) {
              {}
            } else {
              stryCov_9fa48("102050");
              const validation = addressManager.validate(addr);
              if (stryMutAct_9fa48("102053") ? false : stryMutAct_9fa48("102052") ? true : stryMutAct_9fa48("102051") ? validation.valid : (stryCov_9fa48("102051", "102052", "102053"), !validation.valid)) {
                if (stryMutAct_9fa48("102054")) {
                  {}
                } else {
                  stryCov_9fa48("102054");
                  this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("102055") ? {} : (stryCov_9fa48("102055"), {
                    peerId: addr,
                    partitionId: this.partitionId,
                    replicaId: this.replicaId,
                    error: validation.error
                  }));
                  throw new Error(stryMutAct_9fa48("102056") ? `` : (stryCov_9fa48("102056"), `Peer address must be unified: ${addr}`));
                }
              }
              if (stryMutAct_9fa48("102059") ? addr.endsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` + `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`) && addr.endsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`) : stryMutAct_9fa48("102058") ? false : stryMutAct_9fa48("102057") ? true : (stryCov_9fa48("102057", "102058", "102059"), (stryMutAct_9fa48("102060") ? addr.startsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` + `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`) : (stryCov_9fa48("102060"), addr.endsWith((stryMutAct_9fa48("102061") ? `` : (stryCov_9fa48("102061"), `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}`)) + (stryMutAct_9fa48("102062") ? `` : (stryCov_9fa48("102062"), `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`))))) || (stryMutAct_9fa48("102063") ? addr.startsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`) : (stryCov_9fa48("102063"), addr.endsWith(stryMutAct_9fa48("102064") ? `` : (stryCov_9fa48("102064"), `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`)))))) {
                if (stryMutAct_9fa48("102065")) {
                  {}
                } else {
                  stryCov_9fa48("102065");
                  if (stryMutAct_9fa48("102067") ? false : stryMutAct_9fa48("102066") ? true : (stryCov_9fa48("102066", "102067"), cacheAddress)) {
                    if (stryMutAct_9fa48("102068")) {
                      {}
                    } else {
                      stryCov_9fa48("102068");
                      return cacheAddress;
                    }
                  }
                  this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_LIST, stryMutAct_9fa48("102069") ? {} : (stryCov_9fa48("102069"), {
                    peerId,
                    address: addr,
                    partitionId: this.partitionId
                  }));
                  return addr;
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("102071") ? false : stryMutAct_9fa48("102070") ? true : (stryCov_9fa48("102070", "102071"), cacheAddress)) {
        if (stryMutAct_9fa48("102072")) {
          {}
        } else {
          stryCov_9fa48("102072");
          return cacheAddress;
        }
      }
      throw new Error(stryMutAct_9fa48("102073") ? `` : (stryCov_9fa48("102073"), `Unable to resolve unified peer address for ${peerId}`));
    }
  } /**
    * Resolve the leader's unified address for write forwarding.
    * @return {string|null} Unified leader address or null if unavailable.
    * @private
    */
  resolveLeaderAddress() {
    if (stryMutAct_9fa48("102074")) {
      {}
    } else {
      stryCov_9fa48("102074");
      const leaderReplicaId = this.normalizeLeaderReplicaId(this.leaderId);
      if (stryMutAct_9fa48("102077") ? false : stryMutAct_9fa48("102076") ? true : stryMutAct_9fa48("102075") ? leaderReplicaId : (stryCov_9fa48("102075", "102076", "102077"), !leaderReplicaId)) {
        if (stryMutAct_9fa48("102078")) {
          {}
        } else {
          stryCov_9fa48("102078");
          return null;
        }
      }
      return this.buildPeerAddress(leaderReplicaId);
    }
  } /**
    * Normalize one raw leader identifier into the canonical replica ID.
    * Liferaft leader-change notifications use peer addresses, while partition
    * runtime state should track replica IDs.
    * @param {*} candidate
    * @return {string|null}
    * @private
    */
  normalizeLeaderReplicaId(candidate) {
    if (stryMutAct_9fa48("102079")) {
      {}
    } else {
      stryCov_9fa48("102079");
      if (stryMutAct_9fa48("102082") ? typeof candidate !== TYPEOF.STRING && candidate.length === NUM.ZERO : stryMutAct_9fa48("102081") ? false : stryMutAct_9fa48("102080") ? true : (stryCov_9fa48("102080", "102081", "102082"), (stryMutAct_9fa48("102084") ? typeof candidate === TYPEOF.STRING : stryMutAct_9fa48("102083") ? false : (stryCov_9fa48("102083", "102084"), typeof candidate !== TYPEOF.STRING)) || (stryMutAct_9fa48("102086") ? candidate.length !== NUM.ZERO : stryMutAct_9fa48("102085") ? false : (stryCov_9fa48("102085", "102086"), candidate.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("102087")) {
          {}
        } else {
          stryCov_9fa48("102087");
          return null;
        }
      }
      if (stryMutAct_9fa48("102090") ? false : stryMutAct_9fa48("102089") ? true : stryMutAct_9fa48("102088") ? candidate.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR) : (stryCov_9fa48("102088", "102089", "102090"), !candidate.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("102091")) {
          {}
        } else {
          stryCov_9fa48("102091");
          return candidate;
        }
      }
      try {
        if (stryMutAct_9fa48("102092")) {
          {}
        } else {
          stryCov_9fa48("102092");
          const parsed = AddressManager.getInstance().parse(candidate);
          if (stryMutAct_9fa48("102095") ? parsed?.serviceType === ENTITY_TYPE.PARTITION && typeof parsed?.serviceId === TYPEOF.STRING || parsed.serviceId.length > NUM.ZERO : stryMutAct_9fa48("102094") ? false : stryMutAct_9fa48("102093") ? true : (stryCov_9fa48("102093", "102094", "102095"), (stryMutAct_9fa48("102097") ? parsed?.serviceType === ENTITY_TYPE.PARTITION || typeof parsed?.serviceId === TYPEOF.STRING : stryMutAct_9fa48("102096") ? true : (stryCov_9fa48("102096", "102097"), (stryMutAct_9fa48("102099") ? parsed?.serviceType !== ENTITY_TYPE.PARTITION : stryMutAct_9fa48("102098") ? true : (stryCov_9fa48("102098", "102099"), (stryMutAct_9fa48("102100") ? parsed.serviceType : (stryCov_9fa48("102100"), parsed?.serviceType)) === ENTITY_TYPE.PARTITION)) && (stryMutAct_9fa48("102102") ? typeof parsed?.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("102101") ? true : (stryCov_9fa48("102101", "102102"), typeof (stryMutAct_9fa48("102103") ? parsed.serviceId : (stryCov_9fa48("102103"), parsed?.serviceId)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("102106") ? parsed.serviceId.length <= NUM.ZERO : stryMutAct_9fa48("102105") ? parsed.serviceId.length >= NUM.ZERO : stryMutAct_9fa48("102104") ? true : (stryCov_9fa48("102104", "102105", "102106"), parsed.serviceId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("102107")) {
              {}
            } else {
              stryCov_9fa48("102107");
              return parsed.serviceId;
            }
          }
        }
      } catch (_error) {// Ignore malformed addresses and preserve the original value.
      }
      return candidate;
    }
  } /**
    * Resolve one peer address from authoritative services cache state.
    * Cache-backed rows override stale bootstrap peer hints when ownership moves.
    * @param {string} peerId
    * @return {string|null}
    * @private
    */
  resolvePeerAddressFromCache(peerId) {
    if (stryMutAct_9fa48("102108")) {
      {}
    } else {
      stryCov_9fa48("102108");
      if (stryMutAct_9fa48("102111") ? !this.systemTableCache && typeof this.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102110") ? false : stryMutAct_9fa48("102109") ? true : (stryCov_9fa48("102109", "102110", "102111"), (stryMutAct_9fa48("102112") ? this.systemTableCache : (stryCov_9fa48("102112"), !this.systemTableCache)) || (stryMutAct_9fa48("102114") ? typeof this.systemTableCache.get === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102113") ? false : (stryCov_9fa48("102113", "102114"), typeof this.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("102115")) {
          {}
        } else {
          stryCov_9fa48("102115");
          return null;
        }
      }
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (stryMutAct_9fa48("102118") ? !service && !service.node_id : stryMutAct_9fa48("102117") ? false : stryMutAct_9fa48("102116") ? true : (stryCov_9fa48("102116", "102117", "102118"), (stryMutAct_9fa48("102119") ? service : (stryCov_9fa48("102119"), !service)) || (stryMutAct_9fa48("102120") ? service.node_id : (stryCov_9fa48("102120"), !service.node_id)))) {
        if (stryMutAct_9fa48("102121")) {
          {}
        } else {
          stryCov_9fa48("102121");
          return null;
        }
      }
      const address = AddressManager.getInstance().format(service.node_id, ENTITY_TYPE.PARTITION, peerId);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, stryMutAct_9fa48("102122") ? {} : (stryCov_9fa48("102122"), {
        peerId,
        nodeId: service.node_id,
        address,
        partitionId: this.partitionId
      }));
      return address;
    }
  } /**
    * React to authoritative services cache changes for this partition.
    * Existing voters need this to discover newly added or moved peers.
    * @param {string} tableName
    * @param {string} _operation
    * @param {Object} record
    * @private
    */
  handleSystemTableCacheChange(tableName, _operation, record) {
    if (stryMutAct_9fa48("102123")) {
      {}
    } else {
      stryCov_9fa48("102123");
      if (stryMutAct_9fa48("102126") ? tableName !== TABLES.SERVICES && !record : stryMutAct_9fa48("102125") ? false : stryMutAct_9fa48("102124") ? true : (stryCov_9fa48("102124", "102125", "102126"), (stryMutAct_9fa48("102128") ? tableName === TABLES.SERVICES : stryMutAct_9fa48("102127") ? false : (stryCov_9fa48("102127", "102128"), tableName !== TABLES.SERVICES)) || (stryMutAct_9fa48("102129") ? record : (stryCov_9fa48("102129"), !record)))) {
        if (stryMutAct_9fa48("102130")) {
          {}
        } else {
          stryCov_9fa48("102130");
          return;
        }
      }
      if (stryMutAct_9fa48("102133") ? record.partition_id !== this.partitionId && record.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102132") ? false : stryMutAct_9fa48("102131") ? true : (stryCov_9fa48("102131", "102132", "102133"), (stryMutAct_9fa48("102135") ? record.partition_id === this.partitionId : stryMutAct_9fa48("102134") ? false : (stryCov_9fa48("102134", "102135"), record.partition_id !== this.partitionId)) || (stryMutAct_9fa48("102137") ? record.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102136") ? false : (stryCov_9fa48("102136", "102137"), record.service_type !== SERVICE_TYPE.PARTITION)))) {
        if (stryMutAct_9fa48("102138")) {
          {}
        } else {
          stryCov_9fa48("102138");
          return;
        }
      }
      this.scheduleRaftPeerReconciliation();
    }
  } /**
    * Coalesce peer reconciliation work triggered by cache updates.
    * @private
    */
  scheduleRaftPeerReconciliation() {
    if (stryMutAct_9fa48("102139")) {
      {}
    } else {
      stryCov_9fa48("102139");
      if (stryMutAct_9fa48("102141") ? false : stryMutAct_9fa48("102140") ? true : (stryCov_9fa48("102140", "102141"), this.peerReconciliationScheduled)) {
        if (stryMutAct_9fa48("102142")) {
          {}
        } else {
          stryCov_9fa48("102142");
          return;
        }
      }
      this.peerReconciliationScheduled = stryMutAct_9fa48("102143") ? false : (stryCov_9fa48("102143"), true);
      setImmediate(() => {
        if (stryMutAct_9fa48("102144")) {
          {}
        } else {
          stryCov_9fa48("102144");
          this.peerReconciliationScheduled = stryMutAct_9fa48("102145") ? true : (stryCov_9fa48("102145"), false);
          this.reconcileRaftPeersFromCache();
        }
      });
    }
  } /**
    * Join newly visible peers and replace moved peer addresses using the
    * authoritative services cache. Missing rows are ignored conservatively.
    * @private
    */
  reconcileRaftPeersFromCache() {
    if (stryMutAct_9fa48("102146")) {
      {}
    } else {
      stryCov_9fa48("102146");
      if (stryMutAct_9fa48("102149") ? (!this.raft || !this.systemTableCache) && typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102148") ? false : stryMutAct_9fa48("102147") ? true : (stryCov_9fa48("102147", "102148", "102149"), (stryMutAct_9fa48("102151") ? !this.raft && !this.systemTableCache : stryMutAct_9fa48("102150") ? false : (stryCov_9fa48("102150", "102151"), (stryMutAct_9fa48("102152") ? this.raft : (stryCov_9fa48("102152"), !this.raft)) || (stryMutAct_9fa48("102153") ? this.systemTableCache : (stryCov_9fa48("102153"), !this.systemTableCache)))) || (stryMutAct_9fa48("102155") ? typeof this.systemTableCache.filter === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102154") ? false : (stryCov_9fa48("102154", "102155"), typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("102156")) {
          {}
        } else {
          stryCov_9fa48("102156");
          return;
        }
      }
      const services = stryMutAct_9fa48("102157") ? this.systemTableCache : (stryCov_9fa48("102157"), this.systemTableCache.filter(TABLES.SERVICES, service => {
        if (stryMutAct_9fa48("102158")) {
          {}
        } else {
          stryCov_9fa48("102158");
          return stryMutAct_9fa48("102161") ? service.partition_id === this.partitionId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102160") ? false : stryMutAct_9fa48("102159") ? true : (stryCov_9fa48("102159", "102160", "102161"), (stryMutAct_9fa48("102163") ? service.partition_id !== this.partitionId : stryMutAct_9fa48("102162") ? true : (stryCov_9fa48("102162", "102163"), service.partition_id === this.partitionId)) && (stryMutAct_9fa48("102165") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102164") ? true : (stryCov_9fa48("102164", "102165"), service.service_type === SERVICE_TYPE.PARTITION)));
        }
      }));
      if (stryMutAct_9fa48("102168") ? services.length !== NUM.ZERO : stryMutAct_9fa48("102167") ? false : stryMutAct_9fa48("102166") ? true : (stryCov_9fa48("102166", "102167", "102168"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("102169")) {
          {}
        } else {
          stryCov_9fa48("102169");
          return;
        }
      }
      const addressManager = AddressManager.getInstance();
      const expectedAddressesByReplicaId = new Map();
      for (const service of services) {
        if (stryMutAct_9fa48("102170")) {
          {}
        } else {
          stryCov_9fa48("102170");
          const replicaId = stryMutAct_9fa48("102173") ? service.service_id && service.replica_id : stryMutAct_9fa48("102172") ? false : stryMutAct_9fa48("102171") ? true : (stryCov_9fa48("102171", "102172", "102173"), service.service_id || service.replica_id);
          if (stryMutAct_9fa48("102176") ? !replicaId && replicaId === this.replicaId : stryMutAct_9fa48("102175") ? false : stryMutAct_9fa48("102174") ? true : (stryCov_9fa48("102174", "102175", "102176"), (stryMutAct_9fa48("102177") ? replicaId : (stryCov_9fa48("102177"), !replicaId)) || (stryMutAct_9fa48("102179") ? replicaId !== this.replicaId : stryMutAct_9fa48("102178") ? false : (stryCov_9fa48("102178", "102179"), replicaId === this.replicaId)))) {
            if (stryMutAct_9fa48("102180")) {
              {}
            } else {
              stryCov_9fa48("102180");
              continue;
            }
          }
          const status = stryMutAct_9fa48("102183") ? service.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("102182") ? false : stryMutAct_9fa48("102181") ? true : (stryCov_9fa48("102181", "102182", "102183"), service.status || ReplicaStatus.ACTIVE);
          if (stryMutAct_9fa48("102186") ? (status === ReplicaStatus.FAILED || status === ReplicaStatus.REMOVING) && status === ReplicaStatus.REMOVED : stryMutAct_9fa48("102185") ? false : stryMutAct_9fa48("102184") ? true : (stryCov_9fa48("102184", "102185", "102186"), (stryMutAct_9fa48("102188") ? status === ReplicaStatus.FAILED && status === ReplicaStatus.REMOVING : stryMutAct_9fa48("102187") ? false : (stryCov_9fa48("102187", "102188"), (stryMutAct_9fa48("102190") ? status !== ReplicaStatus.FAILED : stryMutAct_9fa48("102189") ? false : (stryCov_9fa48("102189", "102190"), status === ReplicaStatus.FAILED)) || (stryMutAct_9fa48("102192") ? status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("102191") ? false : (stryCov_9fa48("102191", "102192"), status === ReplicaStatus.REMOVING)))) || (stryMutAct_9fa48("102194") ? status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("102193") ? false : (stryCov_9fa48("102193", "102194"), status === ReplicaStatus.REMOVED)))) {
            if (stryMutAct_9fa48("102195")) {
              {}
            } else {
              stryCov_9fa48("102195");
              continue;
            }
          }
          const peerAddress = (stryMutAct_9fa48("102198") ? typeof service.address === 'string' || service.address.length > NUM.ZERO : stryMutAct_9fa48("102197") ? false : stryMutAct_9fa48("102196") ? true : (stryCov_9fa48("102196", "102197", "102198"), (stryMutAct_9fa48("102200") ? typeof service.address !== 'string' : stryMutAct_9fa48("102199") ? true : (stryCov_9fa48("102199", "102200"), typeof service.address === (stryMutAct_9fa48("102201") ? "" : (stryCov_9fa48("102201"), 'string')))) && (stryMutAct_9fa48("102204") ? service.address.length <= NUM.ZERO : stryMutAct_9fa48("102203") ? service.address.length >= NUM.ZERO : stryMutAct_9fa48("102202") ? true : (stryCov_9fa48("102202", "102203", "102204"), service.address.length > NUM.ZERO)))) ? service.address : (stryMutAct_9fa48("102207") ? typeof service.node_id === 'string' || service.node_id.length > NUM.ZERO : stryMutAct_9fa48("102206") ? false : stryMutAct_9fa48("102205") ? true : (stryCov_9fa48("102205", "102206", "102207"), (stryMutAct_9fa48("102209") ? typeof service.node_id !== 'string' : stryMutAct_9fa48("102208") ? true : (stryCov_9fa48("102208", "102209"), typeof service.node_id === (stryMutAct_9fa48("102210") ? "" : (stryCov_9fa48("102210"), 'string')))) && (stryMutAct_9fa48("102213") ? service.node_id.length <= NUM.ZERO : stryMutAct_9fa48("102212") ? service.node_id.length >= NUM.ZERO : stryMutAct_9fa48("102211") ? true : (stryCov_9fa48("102211", "102212", "102213"), service.node_id.length > NUM.ZERO)))) ? addressManager.format(service.node_id, ENTITY_TYPE.PARTITION, replicaId) : null;
          if (stryMutAct_9fa48("102216") ? false : stryMutAct_9fa48("102215") ? true : stryMutAct_9fa48("102214") ? peerAddress : (stryCov_9fa48("102214", "102215", "102216"), !peerAddress)) {
            if (stryMutAct_9fa48("102217")) {
              {}
            } else {
              stryCov_9fa48("102217");
              continue;
            }
          }
          expectedAddressesByReplicaId.set(replicaId, peerAddress);
          if (stryMutAct_9fa48("102220") ? false : stryMutAct_9fa48("102219") ? true : stryMutAct_9fa48("102218") ? this.replicaIds.includes(replicaId) : (stryCov_9fa48("102218", "102219", "102220"), !this.replicaIds.includes(replicaId))) {
            if (stryMutAct_9fa48("102221")) {
              {}
            } else {
              stryCov_9fa48("102221");
              this.replicaIds.push(replicaId);
            }
          }
        }
      }
      const currentNodes = Array.isArray(this.raft.nodes) ? stryMutAct_9fa48("102222") ? [] : (stryCov_9fa48("102222"), [...this.raft.nodes]) : stryMutAct_9fa48("102223") ? ["Stryker was here"] : (stryCov_9fa48("102223"), []);
      const currentAddresses = new Set(stryMutAct_9fa48("102224") ? currentNodes.map(node => node?.address) : (stryCov_9fa48("102224"), currentNodes.map(stryMutAct_9fa48("102225") ? () => undefined : (stryCov_9fa48("102225"), node => stryMutAct_9fa48("102226") ? node.address : (stryCov_9fa48("102226"), node?.address))).filter(stryMutAct_9fa48("102227") ? () => undefined : (stryCov_9fa48("102227"), address => stryMutAct_9fa48("102230") ? typeof address === 'string' || address.length > NUM.ZERO : stryMutAct_9fa48("102229") ? false : stryMutAct_9fa48("102228") ? true : (stryCov_9fa48("102228", "102229", "102230"), (stryMutAct_9fa48("102232") ? typeof address !== 'string' : stryMutAct_9fa48("102231") ? true : (stryCov_9fa48("102231", "102232"), typeof address === (stryMutAct_9fa48("102233") ? "" : (stryCov_9fa48("102233"), 'string')))) && (stryMutAct_9fa48("102236") ? address.length <= NUM.ZERO : stryMutAct_9fa48("102235") ? address.length >= NUM.ZERO : stryMutAct_9fa48("102234") ? true : (stryCov_9fa48("102234", "102235", "102236"), address.length > NUM.ZERO)))))));
      for (const [replicaId, expectedAddress] of expectedAddressesByReplicaId.entries()) {
        if (stryMutAct_9fa48("102237")) {
          {}
        } else {
          stryCov_9fa48("102237");
          const staleAddresses = stryMutAct_9fa48("102238") ? currentNodes.map(node => node?.address) : (stryCov_9fa48("102238"), currentNodes.map(stryMutAct_9fa48("102239") ? () => undefined : (stryCov_9fa48("102239"), node => stryMutAct_9fa48("102240") ? node.address : (stryCov_9fa48("102240"), node?.address))).filter(address => {
            if (stryMutAct_9fa48("102241")) {
              {}
            } else {
              stryCov_9fa48("102241");
              if (stryMutAct_9fa48("102244") ? (typeof address !== 'string' || address.length === NUM.ZERO) && address === expectedAddress : stryMutAct_9fa48("102243") ? false : stryMutAct_9fa48("102242") ? true : (stryCov_9fa48("102242", "102243", "102244"), (stryMutAct_9fa48("102246") ? typeof address !== 'string' && address.length === NUM.ZERO : stryMutAct_9fa48("102245") ? false : (stryCov_9fa48("102245", "102246"), (stryMutAct_9fa48("102248") ? typeof address === 'string' : stryMutAct_9fa48("102247") ? false : (stryCov_9fa48("102247", "102248"), typeof address !== (stryMutAct_9fa48("102249") ? "" : (stryCov_9fa48("102249"), 'string')))) || (stryMutAct_9fa48("102251") ? address.length !== NUM.ZERO : stryMutAct_9fa48("102250") ? false : (stryCov_9fa48("102250", "102251"), address.length === NUM.ZERO)))) || (stryMutAct_9fa48("102253") ? address !== expectedAddress : stryMutAct_9fa48("102252") ? false : (stryCov_9fa48("102252", "102253"), address === expectedAddress)))) {
                if (stryMutAct_9fa48("102254")) {
                  {}
                } else {
                  stryCov_9fa48("102254");
                  return stryMutAct_9fa48("102255") ? true : (stryCov_9fa48("102255"), false);
                }
              }
              try {
                if (stryMutAct_9fa48("102256")) {
                  {}
                } else {
                  stryCov_9fa48("102256");
                  const parsed = addressManager.parse(address);
                  return stryMutAct_9fa48("102259") ? parsed.serviceType === ENTITY_TYPE.PARTITION || parsed.serviceId === replicaId : stryMutAct_9fa48("102258") ? false : stryMutAct_9fa48("102257") ? true : (stryCov_9fa48("102257", "102258", "102259"), (stryMutAct_9fa48("102261") ? parsed.serviceType !== ENTITY_TYPE.PARTITION : stryMutAct_9fa48("102260") ? true : (stryCov_9fa48("102260", "102261"), parsed.serviceType === ENTITY_TYPE.PARTITION)) && (stryMutAct_9fa48("102263") ? parsed.serviceId !== replicaId : stryMutAct_9fa48("102262") ? true : (stryCov_9fa48("102262", "102263"), parsed.serviceId === replicaId)));
                }
              } catch (_error) {
                if (stryMutAct_9fa48("102264")) {
                  {}
                } else {
                  stryCov_9fa48("102264");
                  return stryMutAct_9fa48("102265") ? true : (stryCov_9fa48("102265"), false);
                }
              }
            }
          }));
          if (stryMutAct_9fa48("102268") ? typeof this.raft.leave !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102267") ? false : stryMutAct_9fa48("102266") ? true : (stryCov_9fa48("102266", "102267", "102268"), typeof this.raft.leave === PARTITION_SERVICE_TYPE.FUNCTION)) {
            if (stryMutAct_9fa48("102269")) {
              {}
            } else {
              stryCov_9fa48("102269");
              for (const staleAddress of staleAddresses) {
                if (stryMutAct_9fa48("102270")) {
                  {}
                } else {
                  stryCov_9fa48("102270");
                  this.raft.leave(staleAddress);
                  currentAddresses.delete(staleAddress);
                }
              }
            }
          }
          if (stryMutAct_9fa48("102273") ? false : stryMutAct_9fa48("102272") ? true : stryMutAct_9fa48("102271") ? currentAddresses.has(expectedAddress) : (stryCov_9fa48("102271", "102272", "102273"), !currentAddresses.has(expectedAddress))) {
            if (stryMutAct_9fa48("102274")) {
              {}
            } else {
              stryCov_9fa48("102274");
              this.raftProvider.joinPeer(this.raft, expectedAddress);
              currentAddresses.add(expectedAddress);
            }
          }
        }
      }
    }
  } /**
    * Read one system table row from the local cache when present.
    * @param {string} tableName
    * @param {Function} predicate
    * @return {Object|null}
    * @private
    */
  getCachedSystemTableRow(tableName, predicate) {
    if (stryMutAct_9fa48("102275")) {
      {}
    } else {
      stryCov_9fa48("102275");
      if (stryMutAct_9fa48("102278") ? !this.systemTableCache && typeof predicate !== TYPEOF.FUNCTION : stryMutAct_9fa48("102277") ? false : stryMutAct_9fa48("102276") ? true : (stryCov_9fa48("102276", "102277", "102278"), (stryMutAct_9fa48("102279") ? this.systemTableCache : (stryCov_9fa48("102279"), !this.systemTableCache)) || (stryMutAct_9fa48("102281") ? typeof predicate === TYPEOF.FUNCTION : stryMutAct_9fa48("102280") ? false : (stryCov_9fa48("102280", "102281"), typeof predicate !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("102282")) {
          {}
        } else {
          stryCov_9fa48("102282");
          return null;
        }
      }
      if (stryMutAct_9fa48("102285") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("102284") ? false : stryMutAct_9fa48("102283") ? true : (stryCov_9fa48("102283", "102284", "102285"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("102286")) {
          {}
        } else {
          stryCov_9fa48("102286");
          const rows = stryMutAct_9fa48("102287") ? this.systemTableCache : (stryCov_9fa48("102287"), this.systemTableCache.filter(tableName, predicate));
          return stryMutAct_9fa48("102290") ? rows[NUM.ZERO] && null : stryMutAct_9fa48("102289") ? false : stryMutAct_9fa48("102288") ? true : (stryCov_9fa48("102288", "102289", "102290"), rows[NUM.ZERO] || null);
        }
      }
      if (stryMutAct_9fa48("102293") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("102292") ? false : stryMutAct_9fa48("102291") ? true : (stryCov_9fa48("102291", "102292", "102293"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("102294")) {
          {}
        } else {
          stryCov_9fa48("102294");
          const rows = stryMutAct_9fa48("102297") ? this.systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("102296") ? false : stryMutAct_9fa48("102295") ? true : (stryCov_9fa48("102295", "102296", "102297"), this.systemTableCache.getAll(tableName) || (stryMutAct_9fa48("102298") ? ["Stryker was here"] : (stryCov_9fa48("102298"), [])));
          return stryMutAct_9fa48("102301") ? rows.find(predicate) && null : stryMutAct_9fa48("102300") ? false : stryMutAct_9fa48("102299") ? true : (stryCov_9fa48("102299", "102300", "102301"), rows.find(predicate) || null);
        }
      }
      return null;
    }
  } /**
    * Read matching system table rows from the local cache when present.
    * @param {string} tableName
    * @param {Function} predicate
    * @return {Array<Object>}
    * @private
    */
  getCachedSystemTableRows(tableName, predicate) {
    if (stryMutAct_9fa48("102302")) {
      {}
    } else {
      stryCov_9fa48("102302");
      if (stryMutAct_9fa48("102305") ? !this.systemTableCache && typeof predicate !== TYPEOF.FUNCTION : stryMutAct_9fa48("102304") ? false : stryMutAct_9fa48("102303") ? true : (stryCov_9fa48("102303", "102304", "102305"), (stryMutAct_9fa48("102306") ? this.systemTableCache : (stryCov_9fa48("102306"), !this.systemTableCache)) || (stryMutAct_9fa48("102308") ? typeof predicate === TYPEOF.FUNCTION : stryMutAct_9fa48("102307") ? false : (stryCov_9fa48("102307", "102308"), typeof predicate !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("102309")) {
          {}
        } else {
          stryCov_9fa48("102309");
          return stryMutAct_9fa48("102310") ? ["Stryker was here"] : (stryCov_9fa48("102310"), []);
        }
      }
      if (stryMutAct_9fa48("102313") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("102312") ? false : stryMutAct_9fa48("102311") ? true : (stryCov_9fa48("102311", "102312", "102313"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("102314")) {
          {}
        } else {
          stryCov_9fa48("102314");
          return stryMutAct_9fa48("102315") ? this.systemTableCache : (stryCov_9fa48("102315"), this.systemTableCache.filter(tableName, predicate));
        }
      }
      if (stryMutAct_9fa48("102318") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("102317") ? false : stryMutAct_9fa48("102316") ? true : (stryCov_9fa48("102316", "102317", "102318"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("102319")) {
          {}
        } else {
          stryCov_9fa48("102319");
          const rows = stryMutAct_9fa48("102322") ? this.systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("102321") ? false : stryMutAct_9fa48("102320") ? true : (stryCov_9fa48("102320", "102321", "102322"), this.systemTableCache.getAll(tableName) || (stryMutAct_9fa48("102323") ? ["Stryker was here"] : (stryCov_9fa48("102323"), [])));
          return stryMutAct_9fa48("102324") ? rows : (stryCov_9fa48("102324"), rows.filter(predicate));
        }
      }
      return stryMutAct_9fa48("102325") ? ["Stryker was here"] : (stryCov_9fa48("102325"), []);
    }
  } /**
    * Resolve the current leader replica from canonical owner-row metadata.
    * Owner rows outrank derived services roles; if leader_node_id is present,
    * prefer the replica on that node before falling back to services.raft_role.
    * @return {string|null}
    * @private
    */
  resolveLeaderIdFromMetadata() {
    if (stryMutAct_9fa48("102326")) {
      {}
    } else {
      stryCov_9fa48("102326");
      const serviceRows = this.getCachedSystemTableRows(TABLES.SERVICES, stryMutAct_9fa48("102327") ? () => undefined : (stryCov_9fa48("102327"), service => stryMutAct_9fa48("102330") ? service?.[COLUMN.PARTITION_ID] === this.partitionId && service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED || service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED : stryMutAct_9fa48("102329") ? false : stryMutAct_9fa48("102328") ? true : (stryCov_9fa48("102328", "102329", "102330"), (stryMutAct_9fa48("102332") ? service?.[COLUMN.PARTITION_ID] === this.partitionId && service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION || service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED : stryMutAct_9fa48("102331") ? true : (stryCov_9fa48("102331", "102332"), (stryMutAct_9fa48("102334") ? service?.[COLUMN.PARTITION_ID] === this.partitionId || service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102333") ? true : (stryCov_9fa48("102333", "102334"), (stryMutAct_9fa48("102336") ? service?.[COLUMN.PARTITION_ID] !== this.partitionId : stryMutAct_9fa48("102335") ? true : (stryCov_9fa48("102335", "102336"), (stryMutAct_9fa48("102337") ? service[COLUMN.PARTITION_ID] : (stryCov_9fa48("102337"), service?.[COLUMN.PARTITION_ID])) === this.partitionId)) && (stryMutAct_9fa48("102339") ? service?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("102338") ? true : (stryCov_9fa48("102338", "102339"), (stryMutAct_9fa48("102340") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("102340"), service?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.PARTITION)))) && (stryMutAct_9fa48("102342") ? service?.[COLUMN.STATUS] === ReplicaStatus.FAILED : stryMutAct_9fa48("102341") ? true : (stryCov_9fa48("102341", "102342"), (stryMutAct_9fa48("102343") ? service[COLUMN.STATUS] : (stryCov_9fa48("102343"), service?.[COLUMN.STATUS])) !== ReplicaStatus.FAILED)))) && (stryMutAct_9fa48("102345") ? service?.[COLUMN.STATUS] === ReplicaStatus.REMOVED : stryMutAct_9fa48("102344") ? true : (stryCov_9fa48("102344", "102345"), (stryMutAct_9fa48("102346") ? service[COLUMN.STATUS] : (stryCov_9fa48("102346"), service?.[COLUMN.STATUS])) !== ReplicaStatus.REMOVED)))));
      if (stryMutAct_9fa48("102349") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("102348") ? false : stryMutAct_9fa48("102347") ? true : (stryCov_9fa48("102347", "102348", "102349"), serviceRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("102350")) {
          {}
        } else {
          stryCov_9fa48("102350");
          return null;
        }
      }
      const partitionRow = this.getCachedSystemTableRow(TABLES.PARTITIONS, stryMutAct_9fa48("102351") ? () => undefined : (stryCov_9fa48("102351"), partition => stryMutAct_9fa48("102354") ? partition?.[COLUMN.PARTITION_ID] !== this.partitionId : stryMutAct_9fa48("102353") ? false : stryMutAct_9fa48("102352") ? true : (stryCov_9fa48("102352", "102353", "102354"), (stryMutAct_9fa48("102355") ? partition[COLUMN.PARTITION_ID] : (stryCov_9fa48("102355"), partition?.[COLUMN.PARTITION_ID])) === this.partitionId)));
      const leaderNodeId = stryMutAct_9fa48("102358") ? partitionRow?.[COLUMN.LEADER_NODE_ID] && null : stryMutAct_9fa48("102357") ? false : stryMutAct_9fa48("102356") ? true : (stryCov_9fa48("102356", "102357", "102358"), (stryMutAct_9fa48("102359") ? partitionRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("102359"), partitionRow?.[COLUMN.LEADER_NODE_ID])) || null);
      if (stryMutAct_9fa48("102362") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("102361") ? false : stryMutAct_9fa48("102360") ? true : (stryCov_9fa48("102360", "102361", "102362"), (stryMutAct_9fa48("102364") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("102363") ? true : (stryCov_9fa48("102363", "102364"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("102367") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("102366") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("102365") ? true : (stryCov_9fa48("102365", "102366", "102367"), leaderNodeId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("102368")) {
          {}
        } else {
          stryCov_9fa48("102368");
          const leaderReplica = serviceRows.find(stryMutAct_9fa48("102369") ? () => undefined : (stryCov_9fa48("102369"), service => stryMutAct_9fa48("102372") ? service?.[COLUMN.NODE_ID] !== leaderNodeId : stryMutAct_9fa48("102371") ? false : stryMutAct_9fa48("102370") ? true : (stryCov_9fa48("102370", "102371", "102372"), (stryMutAct_9fa48("102373") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("102373"), service?.[COLUMN.NODE_ID])) === leaderNodeId)));
          const leaderReplicaId = stryMutAct_9fa48("102376") ? (leaderReplica?.[COLUMN.REPLICA_ID] || leaderReplica?.[COLUMN.SERVICE_ID]) && null : stryMutAct_9fa48("102375") ? false : stryMutAct_9fa48("102374") ? true : (stryCov_9fa48("102374", "102375", "102376"), (stryMutAct_9fa48("102378") ? leaderReplica?.[COLUMN.REPLICA_ID] && leaderReplica?.[COLUMN.SERVICE_ID] : stryMutAct_9fa48("102377") ? false : (stryCov_9fa48("102377", "102378"), (stryMutAct_9fa48("102379") ? leaderReplica[COLUMN.REPLICA_ID] : (stryCov_9fa48("102379"), leaderReplica?.[COLUMN.REPLICA_ID])) || (stryMutAct_9fa48("102380") ? leaderReplica[COLUMN.SERVICE_ID] : (stryCov_9fa48("102380"), leaderReplica?.[COLUMN.SERVICE_ID])))) || null);
          if (stryMutAct_9fa48("102383") ? typeof leaderReplicaId === TYPEOF.STRING || leaderReplicaId.length > NUM.ZERO : stryMutAct_9fa48("102382") ? false : stryMutAct_9fa48("102381") ? true : (stryCov_9fa48("102381", "102382", "102383"), (stryMutAct_9fa48("102385") ? typeof leaderReplicaId !== TYPEOF.STRING : stryMutAct_9fa48("102384") ? true : (stryCov_9fa48("102384", "102385"), typeof leaderReplicaId === TYPEOF.STRING)) && (stryMutAct_9fa48("102388") ? leaderReplicaId.length <= NUM.ZERO : stryMutAct_9fa48("102387") ? leaderReplicaId.length >= NUM.ZERO : stryMutAct_9fa48("102386") ? true : (stryCov_9fa48("102386", "102387", "102388"), leaderReplicaId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("102389")) {
              {}
            } else {
              stryCov_9fa48("102389");
              return leaderReplicaId;
            }
          }
        }
      }
      const leaderService = serviceRows.find(stryMutAct_9fa48("102390") ? () => undefined : (stryCov_9fa48("102390"), service => stryMutAct_9fa48("102393") ? String(service?.[COLUMN.RAFT_ROLE] || '').toLowerCase() !== PARTITION_RAFT_ROLE.LEADER : stryMutAct_9fa48("102392") ? false : stryMutAct_9fa48("102391") ? true : (stryCov_9fa48("102391", "102392", "102393"), (stryMutAct_9fa48("102394") ? String(service?.[COLUMN.RAFT_ROLE] || '').toUpperCase() : (stryCov_9fa48("102394"), String(stryMutAct_9fa48("102397") ? service?.[COLUMN.RAFT_ROLE] && '' : stryMutAct_9fa48("102396") ? false : stryMutAct_9fa48("102395") ? true : (stryCov_9fa48("102395", "102396", "102397"), (stryMutAct_9fa48("102398") ? service[COLUMN.RAFT_ROLE] : (stryCov_9fa48("102398"), service?.[COLUMN.RAFT_ROLE])) || (stryMutAct_9fa48("102399") ? "Stryker was here!" : (stryCov_9fa48("102399"), '')))).toLowerCase())) === PARTITION_RAFT_ROLE.LEADER)));
      const leaderServiceId = stryMutAct_9fa48("102402") ? (leaderService?.[COLUMN.REPLICA_ID] || leaderService?.[COLUMN.SERVICE_ID]) && null : stryMutAct_9fa48("102401") ? false : stryMutAct_9fa48("102400") ? true : (stryCov_9fa48("102400", "102401", "102402"), (stryMutAct_9fa48("102404") ? leaderService?.[COLUMN.REPLICA_ID] && leaderService?.[COLUMN.SERVICE_ID] : stryMutAct_9fa48("102403") ? false : (stryCov_9fa48("102403", "102404"), (stryMutAct_9fa48("102405") ? leaderService[COLUMN.REPLICA_ID] : (stryCov_9fa48("102405"), leaderService?.[COLUMN.REPLICA_ID])) || (stryMutAct_9fa48("102406") ? leaderService[COLUMN.SERVICE_ID] : (stryCov_9fa48("102406"), leaderService?.[COLUMN.SERVICE_ID])))) || null);
      return (stryMutAct_9fa48("102409") ? typeof leaderServiceId === TYPEOF.STRING || leaderServiceId.length > NUM.ZERO : stryMutAct_9fa48("102408") ? false : stryMutAct_9fa48("102407") ? true : (stryCov_9fa48("102407", "102408", "102409"), (stryMutAct_9fa48("102411") ? typeof leaderServiceId !== TYPEOF.STRING : stryMutAct_9fa48("102410") ? true : (stryCov_9fa48("102410", "102411"), typeof leaderServiceId === TYPEOF.STRING)) && (stryMutAct_9fa48("102414") ? leaderServiceId.length <= NUM.ZERO : stryMutAct_9fa48("102413") ? leaderServiceId.length >= NUM.ZERO : stryMutAct_9fa48("102412") ? true : (stryCov_9fa48("102412", "102413", "102414"), leaderServiceId.length > NUM.ZERO)))) ? leaderServiceId : null;
    }
  } /**
    * Seed leader identity from the startup leader-address hint when joining
    * an already-established group. Stable joins may not observe a fresh Raft
    * leader-change event before learner promotion needs to run.
    * @return {string|null}
    * @private
    */
  resolveLeaderIdFromHint() {
    if (stryMutAct_9fa48("102415")) {
      {}
    } else {
      stryCov_9fa48("102415");
      if (stryMutAct_9fa48("102418") ? false : stryMutAct_9fa48("102417") ? true : stryMutAct_9fa48("102416") ? this.leaderAddressHint : (stryCov_9fa48("102416", "102417", "102418"), !this.leaderAddressHint)) {
        if (stryMutAct_9fa48("102419")) {
          {}
        } else {
          stryCov_9fa48("102419");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("102420")) {
          {}
        } else {
          stryCov_9fa48("102420");
          const parsed = AddressManager.getInstance().parse(this.leaderAddressHint);
          return (stryMutAct_9fa48("102423") ? parsed.serviceType !== ENTITY_TYPE.PARTITION : stryMutAct_9fa48("102422") ? false : stryMutAct_9fa48("102421") ? true : (stryCov_9fa48("102421", "102422", "102423"), parsed.serviceType === ENTITY_TYPE.PARTITION)) ? parsed.serviceId : null;
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("102424")) {
          {}
        } else {
          stryCov_9fa48("102424");
          return null;
        }
      }
    }
  } /**
    * Report partition initialization progress stage.
    * @param {string} stage - Initialization stage.
    * @param {Object} details - Additional stage details.
    * @private
    */
  reportInitializationStage(stage, details = {}) {
    if (stryMutAct_9fa48("102425")) {
      {}
    } else {
      stryCov_9fa48("102425");
      if (stryMutAct_9fa48("102428") ? false : stryMutAct_9fa48("102427") ? true : stryMutAct_9fa48("102426") ? this.onInitializationStage : (stryCov_9fa48("102426", "102427", "102428"), !this.onInitializationStage)) {
        if (stryMutAct_9fa48("102429")) {
          {}
        } else {
          stryCov_9fa48("102429");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("102430")) {
          {}
        } else {
          stryCov_9fa48("102430");
          this.onInitializationStage(stryMutAct_9fa48("102431") ? {} : (stryCov_9fa48("102431"), {
            stage,
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            ...details
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("102432")) {
          {}
        } else {
          stryCov_9fa48("102432");
          this.logger.warn(PARTITION_SERVICE_LOG_MSG.INIT_STAGE_CALLBACK_FAILED, stryMutAct_9fa48("102433") ? {} : (stryCov_9fa48("102433"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            stage,
            error: error.message
          }));
        }
      }
    }
  } /**
    * Initialize the partition service.
    * Uses liferaft library for Raft consensus with simplified transport.
    * Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5
    * @return {Promise<void>}
    */
  async initialize() {
    if (stryMutAct_9fa48("102434")) {
      {}
    } else {
      stryCov_9fa48("102434");
      if (stryMutAct_9fa48("102436") ? false : stryMutAct_9fa48("102435") ? true : (stryCov_9fa48("102435", "102436"), this.initialized)) {
        if (stryMutAct_9fa48("102437")) {
          {}
        } else {
          stryCov_9fa48("102437");
          return;
        }
      }
      this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.STARTING, stryMutAct_9fa48("102438") ? {} : (stryCov_9fa48("102438"), {
        partitionId: this.partitionId,
        tableId: this.tableId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        replicaCount: this.replicaIds.length,
        dbPath: this.dbPath
      }));
      if (stryMutAct_9fa48("102441") ? false : stryMutAct_9fa48("102440") ? true : stryMutAct_9fa48("102439") ? this.suppressLifecycleLogs : (stryCov_9fa48("102439", "102440", "102441"), !this.suppressLifecycleLogs)) {
        if (stryMutAct_9fa48("102442")) {
          {}
        } else {
          stryCov_9fa48("102442");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZING, stryMutAct_9fa48("102443") ? {} : (stryCov_9fa48("102443"), {
            partitionId: this.partitionId,
            tableId: this.tableId,
            replicaId: this.replicaId,
            nodeId: this.nodeId,
            replicaCount: this.replicaIds.length,
            dbPath: this.dbPath
          }));
        }
      } // Ensure directory exists for file-based databases
      if (stryMutAct_9fa48("102446") ? this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("102445") ? false : stryMutAct_9fa48("102444") ? true : (stryCov_9fa48("102444", "102445", "102446"), this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH)) {
        if (stryMutAct_9fa48("102447")) {
          {}
        } else {
          stryCov_9fa48("102447");
          const dbDir = path.dirname(this.dbPath);
          if (stryMutAct_9fa48("102450") ? false : stryMutAct_9fa48("102449") ? true : stryMutAct_9fa48("102448") ? fs.existsSync(dbDir) : (stryCov_9fa48("102448", "102449", "102450"), !fs.existsSync(dbDir))) {
            if (stryMutAct_9fa48("102451")) {
              {}
            } else {
              stryCov_9fa48("102451");
              fs.mkdirSync(dbDir, stryMutAct_9fa48("102452") ? {} : (stryCov_9fa48("102452"), {
                recursive: stryMutAct_9fa48("102453") ? false : (stryCov_9fa48("102453"), true)
              }));
              this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_PARTITION_DIR, stryMutAct_9fa48("102454") ? {} : (stryCov_9fa48("102454"), {
                path: dbDir
              }));
            }
          }
        }
      }
      this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.OPENING_DB, stryMutAct_9fa48("102455") ? {} : (stryCov_9fa48("102455"), {
        dbPath: this.dbPath
      })); // Open SQLite database
      this.db = new Database(this.dbPath);
      this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_JOURNAL_MODE);
      this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_SYNCHRONOUS); // Initialize Raft storage
      this.storage = new PartitionRaftStorage(this.db, this.partitionId); // Create table if schema provided
      if (stryMutAct_9fa48("102457") ? false : stryMutAct_9fa48("102456") ? true : (stryCov_9fa48("102456", "102457"), this.schema)) {
        if (stryMutAct_9fa48("102458")) {
          {}
        } else {
          stryCov_9fa48("102458");
          this.createTable();
        }
      } // Register with transport if available using unified address format
      // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
      if (stryMutAct_9fa48("102460") ? false : stryMutAct_9fa48("102459") ? true : (stryCov_9fa48("102459", "102460"), this.transport)) {
        if (stryMutAct_9fa48("102461")) {
          {}
        } else {
          stryCov_9fa48("102461");
          this.transport.register(this.unifiedAddress, this.handleTransportMessage.bind(this));
        }
      } // Start as follower
      this.role = RaftRole.FOLLOWER; // Get Raft configuration from ConfigurationManager
      // Requirements: 10.1
      const config = ConfigurationManager.getInstance();
      const heartbeatMs = stryMutAct_9fa48("102464") ? config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) && PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS : stryMutAct_9fa48("102463") ? false : stryMutAct_9fa48("102462") ? true : (stryCov_9fa48("102462", "102463", "102464"), config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) || PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS);
      const baseElectionMinMs = stryMutAct_9fa48("102467") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) && PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS : stryMutAct_9fa48("102466") ? false : stryMutAct_9fa48("102465") ? true : (stryCov_9fa48("102465", "102466", "102467"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) || PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS);
      const baseElectionMaxMs = stryMutAct_9fa48("102470") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) && PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS : stryMutAct_9fa48("102469") ? false : stryMutAct_9fa48("102468") ? true : (stryCov_9fa48("102468", "102469", "102470"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) || PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS);
      const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
      const {
        electionMinMs,
        electionMaxMs
      } = computeReplicaElectionTimeouts(stryMutAct_9fa48("102471") ? {} : (stryCov_9fa48("102471"), {
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS
      }));
      this.raftTimingConfig = stryMutAct_9fa48("102472") ? {} : (stryCov_9fa48("102472"), {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null
      }); // Create extended LifeRaft class with our transport using ES6 class inheritance
      // Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
      const self = this;
      const deferElection = this.deferElection; /**
                                                * Custom Raft node class that extends LifeRaft with our transport.
                                                * Simplified to call transport.deliver() directly without type conversion.
                                                * Supports deferred election start to prevent election storms during bootstrap.
                                                * Requirements: 10.1, 10.2, 10.3, 10.4
                                                */
      class RaftNode extends LifeRaft {
        /**
        * Override initialize to support deferred election start.
        * When deferElection is true, we don't start the heartbeat timer.
        * Call startElection() later to begin the election process.
        * @param {Object} options - Initialization options.
        * @param {Function} callback - Completion callback.
        */
        initialize(options, callback) {
          if (stryMutAct_9fa48("102473")) {
            {}
          } else {
            stryCov_9fa48("102473");
            if (stryMutAct_9fa48("102475") ? false : stryMutAct_9fa48("102474") ? true : (stryCov_9fa48("102474", "102475"), deferElection)) {
              if (stryMutAct_9fa48("102476")) {
                {}
              } else {
                stryCov_9fa48("102476");
                // Don't start heartbeat timer - election will be started manually
                self.logger.debug(PARTITION_SERVICE_LOG_MSG.DEFERRING_ELECTION_START, stryMutAct_9fa48("102477") ? {} : (stryCov_9fa48("102477"), {
                  replicaId: self.replicaId,
                  partitionId: self.partitionId
                })); // Just signal initialization complete without starting timer
                if (stryMutAct_9fa48("102479") ? false : stryMutAct_9fa48("102478") ? true : (stryCov_9fa48("102478", "102479"), callback)) callback();
              }
            } else {
              if (stryMutAct_9fa48("102480")) {
                {}
              } else {
                stryCov_9fa48("102480");
                // Normal initialization - heartbeat timer will start automatically
                if (stryMutAct_9fa48("102482") ? false : stryMutAct_9fa48("102481") ? true : (stryCov_9fa48("102481", "102482"), callback)) callback();
              }
            }
          }
        } /**
          * Write method for sending Raft messages to peers.
          * Called by liferaft when it needs to communicate with other nodes.
          * Sends packets directly to transport without type conversion.
          * Note: When liferaft calls node.write(), 'this' is the cloned node
          * representing the peer, so 'this.address' is the destination address.
          * Requirements: 10.2, 10.3, 10.4
          * @param {Object} packet - Raft protocol packet (packet.address is sender)
          * @param {Function} callback - Completion callback
          */
        write(packet, callback) {
          if (stryMutAct_9fa48("102483")) {
            {}
          } else {
            stryCov_9fa48("102483");
            // Build peer address for routing
            // this.address is the destination, packet.address is the sender
            const peerAddress = self.buildPeerAddress(this.address); // Send packet unchanged - no type conversion
            // Only add destination address for routing, preserve all packet fields
            // Requirements: 10.2, 10.3
            self.transport.deliver(peerAddress, packet, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("102484") ? {} : (stryCov_9fa48("102484"), {
              ...packet,
              targetAddress: peerAddress
            }))).then(stryMutAct_9fa48("102485") ? () => undefined : (stryCov_9fa48("102485"), result => callback(null, result))).catch(stryMutAct_9fa48("102486") ? () => undefined : (stryCov_9fa48("102486"), err => callback(err)));
          }
        }
      } // Create SQLiteLogAdapter for liferaft
      // Requirements: 12.1, 12.2, 12.3, 12.4
      this.logAdapter = new SQLiteLogAdapter(this.db); // Create liferaft instance
      // Use unified address so that packet.address contains the full address
      // This allows other nodes to respond to vote requests correctly
      // Requirements: 8.1, 10.1, 10.5
      const logAdapter = this.logAdapter;
      this.raft = new RaftNode(this.unifiedAddress, stryMutAct_9fa48("102487") ? {} : (stryCov_9fa48("102487"), {
        [PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
        [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
        [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
        [PARTITION_SERVICE_LIFERAFT_TIMER.LOG]: function () {
          if (stryMutAct_9fa48("102488")) {
            {}
          } else {
            stryCov_9fa48("102488");
            return logAdapter;
          }
        }
      })); // If deferElection is true, clear all timers that liferaft started automatically
      // This prevents elections from starting until startElection() is called
      // Liferaft's _initialize() sets up a 'state change' handler that starts timers
      if (stryMutAct_9fa48("102491") ? this.deferElection || this.raft : stryMutAct_9fa48("102490") ? false : stryMutAct_9fa48("102489") ? true : (stryCov_9fa48("102489", "102490", "102491"), this.deferElection && this.raft)) {
        if (stryMutAct_9fa48("102492")) {
          {}
        } else {
          stryCov_9fa48("102492");
          this.raftProvider.clearTimers(this.raft, PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION);
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, stryMutAct_9fa48("102493") ? {} : (stryCov_9fa48("102493"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId
          }));
        }
      } // Track if this is a truly single-replica group for special handling
      // Only consider it single-replica if replicaIds.length === 1
      // Do NOT use replicaIds.every() check as that could cause premature leadership
      // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
      const isSingleReplica = () => {
        if (stryMutAct_9fa48("102494")) {
          {}
        } else {
          stryCov_9fa48("102494");
          const peerCount = Array.isArray(stryMutAct_9fa48("102495") ? this.raft.nodes : (stryCov_9fa48("102495"), this.raft?.nodes)) ? this.raft.nodes.length : NUM.ZERO;
          return stryMutAct_9fa48("102498") ? this.replicaIds.length === NUM.ONE || peerCount === NUM.ZERO : stryMutAct_9fa48("102497") ? false : stryMutAct_9fa48("102496") ? true : (stryCov_9fa48("102496", "102497", "102498"), (stryMutAct_9fa48("102500") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("102499") ? true : (stryCov_9fa48("102499", "102500"), this.replicaIds.length === NUM.ONE)) && (stryMutAct_9fa48("102502") ? peerCount !== NUM.ZERO : stryMutAct_9fa48("102501") ? true : (stryCov_9fa48("102501", "102502"), peerCount === NUM.ZERO)));
        }
      };
      const shouldIgnoreDemotionEvent = eventName => {
        if (stryMutAct_9fa48("102503")) {
          {}
        } else {
          stryCov_9fa48("102503");
          if (stryMutAct_9fa48("102506") ? isSingleReplica() || this.isLeader : stryMutAct_9fa48("102505") ? false : stryMutAct_9fa48("102504") ? true : (stryCov_9fa48("102504", "102505", "102506"), isSingleReplica() && this.isLeader)) {
            if (stryMutAct_9fa48("102507")) {
              {}
            } else {
              stryCov_9fa48("102507");
              return stryMutAct_9fa48("102508") ? false : (stryCov_9fa48("102508"), true);
            }
          }
          const isJoiningLearner = stryMutAct_9fa48("102511") ? this.isJoiningExistingGroup === true || this.role === RaftRole.LEARNER : stryMutAct_9fa48("102510") ? false : stryMutAct_9fa48("102509") ? true : (stryCov_9fa48("102509", "102510", "102511"), (stryMutAct_9fa48("102513") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("102512") ? true : (stryCov_9fa48("102512", "102513"), this.isJoiningExistingGroup === (stryMutAct_9fa48("102514") ? false : (stryCov_9fa48("102514"), true)))) && (stryMutAct_9fa48("102516") ? this.role !== RaftRole.LEARNER : stryMutAct_9fa48("102515") ? true : (stryCov_9fa48("102515", "102516"), this.role === RaftRole.LEARNER)));
          if (stryMutAct_9fa48("102519") ? false : stryMutAct_9fa48("102518") ? true : stryMutAct_9fa48("102517") ? isJoiningLearner : (stryCov_9fa48("102517", "102518", "102519"), !isJoiningLearner)) {
            if (stryMutAct_9fa48("102520")) {
              {}
            } else {
              stryCov_9fa48("102520");
              return stryMutAct_9fa48("102521") ? true : (stryCov_9fa48("102521"), false);
            }
          }
          if (stryMutAct_9fa48("102524") ? eventName !== PARTITION_SERVICE_ROLE.FOLLOWER || eventName !== PARTITION_SERVICE_ROLE.CANDIDATE : stryMutAct_9fa48("102523") ? false : stryMutAct_9fa48("102522") ? true : (stryCov_9fa48("102522", "102523", "102524"), (stryMutAct_9fa48("102526") ? eventName === PARTITION_SERVICE_ROLE.FOLLOWER : stryMutAct_9fa48("102525") ? true : (stryCov_9fa48("102525", "102526"), eventName !== PARTITION_SERVICE_ROLE.FOLLOWER)) && (stryMutAct_9fa48("102528") ? eventName === PARTITION_SERVICE_ROLE.CANDIDATE : stryMutAct_9fa48("102527") ? true : (stryCov_9fa48("102527", "102528"), eventName !== PARTITION_SERVICE_ROLE.CANDIDATE)))) {
            if (stryMutAct_9fa48("102529")) {
              {}
            } else {
              stryCov_9fa48("102529");
              return stryMutAct_9fa48("102530") ? true : (stryCov_9fa48("102530"), false);
            }
          }
          if (stryMutAct_9fa48("102532") ? false : stryMutAct_9fa48("102531") ? true : (stryCov_9fa48("102531", "102532"), this.raft)) {
            if (stryMutAct_9fa48("102533")) {
              {}
            } else {
              stryCov_9fa48("102533");
              this.raftProvider.clearTimers(this.raft, PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION);
            }
          }
          return stryMutAct_9fa48("102534") ? false : (stryCov_9fa48("102534"), true);
        }
      }; // Learner phase: new replicas joining existing groups start as non-voting learners
      // They receive log entries but don't vote until caught up
      // This prevents new replicas from disrupting existing leadership
      if (stryMutAct_9fa48("102536") ? false : stryMutAct_9fa48("102535") ? true : (stryCov_9fa48("102535", "102536"), this.isJoiningExistingGroup)) {
        if (stryMutAct_9fa48("102537")) {
          {}
        } else {
          stryCov_9fa48("102537");
          this.role = RaftRole.LEARNER;
          this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_AS_LEARNER, stryMutAct_9fa48("102538") ? {} : (stryCov_9fa48("102538"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            promotionDelayMs: this.learnerPromotionDelayMs
          })); // Schedule promotion check after minimum delay
          this.scheduleLearnerPromotion(PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY);
        }
      }
      wireReplicaLifecycleEvents(this, stryMutAct_9fa48("102539") ? {} : (stryCov_9fa48("102539"), {
        events: stryMutAct_9fa48("102540") ? {} : (stryCov_9fa48("102540"), {
          LEADER: PARTITION_SERVICE_ROLE.LEADER,
          FOLLOWER: PARTITION_SERVICE_ROLE.FOLLOWER,
          CANDIDATE: PARTITION_SERVICE_ROLE.CANDIDATE,
          COMMIT: PARTITION_SERVICE_REASON.COMMIT,
          LEADER_CHANGE: PARTITION_SERVICE_REASON.LEADER_CHANGE,
          TERM_CHANGE: PARTITION_SERVICE_REASON.TERM_CHANGE
        }),
        roles: RaftRole,
        getCurrentTerm: stryMutAct_9fa48("102541") ? () => undefined : (stryCov_9fa48("102541"), () => this.raftProvider.getCurrentTerm(this.raft)),
        normalizeLeaderId: stryMutAct_9fa48("102542") ? () => undefined : (stryCov_9fa48("102542"), candidate => this.normalizeLeaderReplicaId(candidate)),
        shouldIgnoreDemotionEvent,
        onLeader: ({
          term
        }) => {
          if (stryMutAct_9fa48("102543")) {
            {}
          } else {
            stryCov_9fa48("102543");
            this.storage.currentTerm = term;
            this.scheduleLeaderOwnedActivation(term);
          }
        },
        onFollower: ({
          term
        }) => {
          if (stryMutAct_9fa48("102544")) {
            {}
          } else {
            stryCov_9fa48("102544");
            this.storage.currentTerm = term;
            this.cancelLeaderOwnedActivation();
            this.updateRebalancerLeadership();
          }
        },
        onCandidate: ({
          term
        }) => {
          if (stryMutAct_9fa48("102545")) {
            {}
          } else {
            stryCov_9fa48("102545");
            this.storage.currentTerm = term;
            this.cancelLeaderOwnedActivation();
            this.updateRebalancerLeadership();
          }
        },
        onCommit: command => {
          if (stryMutAct_9fa48("102546")) {
            {}
          } else {
            stryCov_9fa48("102546");
            this.applyCommittedEntry(command);
          }
        },
        onLeaderChange: ({
          leaderId
        }) => {
          if (stryMutAct_9fa48("102547")) {
            {}
          } else {
            stryCov_9fa48("102547");
            this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("102548") ? {} : (stryCov_9fa48("102548"), {
              newLeader: leaderId,
              partitionId: this.partitionId
            }));
          }
        },
        onTermChange: ({
          term
        }) => {
          if (stryMutAct_9fa48("102549")) {
            {}
          } else {
            stryCov_9fa48("102549");
            this.storage.currentTerm = term;
          }
        }
      })); // Join peer nodes
      // Requirements: 3.1, 3.2, 3.3 - All peer addresses use fully qualified format
      const totalPeerCount = stryMutAct_9fa48("102550") ? Math.min(NUM.ZERO, this.replicaIds.length - NUM.ONE) : (stryCov_9fa48("102550"), Math.max(NUM.ZERO, stryMutAct_9fa48("102551") ? this.replicaIds.length + NUM.ONE : (stryCov_9fa48("102551"), this.replicaIds.length - NUM.ONE)));
      let joinedPeerCount = NUM.ZERO;
      this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.JOINING_PEERS, stryMutAct_9fa48("102552") ? {} : (stryCov_9fa48("102552"), {
        peerTotal: totalPeerCount,
        peerJoined: joinedPeerCount
      }));
      for (const peerId of this.replicaIds) {
        if (stryMutAct_9fa48("102553")) {
          {}
        } else {
          stryCov_9fa48("102553");
          if (stryMutAct_9fa48("102556") ? peerId === this.replicaId : stryMutAct_9fa48("102555") ? false : stryMutAct_9fa48("102554") ? true : (stryCov_9fa48("102554", "102555", "102556"), peerId !== this.replicaId)) {
            if (stryMutAct_9fa48("102557")) {
              {}
            } else {
              stryCov_9fa48("102557");
              const peerAddress = this.buildPeerAddress(peerId);
              if (stryMutAct_9fa48("102560") ? false : stryMutAct_9fa48("102559") ? true : stryMutAct_9fa48("102558") ? this.suppressLifecycleLogs : (stryCov_9fa48("102558", "102559", "102560"), !this.suppressLifecycleLogs)) {
                if (stryMutAct_9fa48("102561")) {
                  {}
                } else {
                  stryCov_9fa48("102561");
                  this.logger.info(PARTITION_SERVICE_LOG_MSG.JOINING_PEER_ADDRESS, stryMutAct_9fa48("102562") ? {} : (stryCov_9fa48("102562"), {
                    peerId,
                    peerAddress,
                    replicaId: this.replicaId,
                    partitionId: this.partitionId,
                    addressFormat: peerAddress.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR) ? PARTITION_SERVICE_ADDRESS.FORMAT_UNIFIED : PARTITION_SERVICE_ADDRESS.FORMAT_SIMPLE
                  }));
                }
              }
              this.raftProvider.joinPeer(this.raft, peerAddress);
              stryMutAct_9fa48("102563") ? joinedPeerCount -= NUM.ONE : (stryCov_9fa48("102563"), joinedPeerCount += NUM.ONE);
              this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.JOINED_PEER, stryMutAct_9fa48("102564") ? {} : (stryCov_9fa48("102564"), {
                peerId,
                peerAddress,
                peerTotal: totalPeerCount,
                peerJoined: joinedPeerCount
              }));
            }
          }
        }
      }
      this.reconcileRaftPeersFromCache();
      this.maybeInitializeRebalancer(); // For truly single-replica groups, become leader immediately
      // This avoids the election timer delay during bootstrap
      // Only do this when replicaIds.length === 1 (truly single replica)
      // Do NOT use replicaIds.every() check - that could cause premature leadership
      // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
      // Let liferaft handle all multi-replica elections
      // Requirements: 10.5
      if (stryMutAct_9fa48("102567") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("102566") ? false : stryMutAct_9fa48("102565") ? true : (stryCov_9fa48("102565", "102566", "102567"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("102568")) {
          {}
        } else {
          stryCov_9fa48("102568");
          assertCritical(stryMutAct_9fa48("102571") ? this.raft || typeof this.raft.change === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102570") ? false : stryMutAct_9fa48("102569") ? true : (stryCov_9fa48("102569", "102570", "102571"), this.raft && (stryMutAct_9fa48("102573") ? typeof this.raft.change !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102572") ? true : (stryCov_9fa48("102572", "102573"), typeof this.raft.change === PARTITION_SERVICE_TYPE.FUNCTION))), PARTITION_SERVICE_ERROR_MSG.SINGLE_REPLICA_RAFT_OWNER_REQUIRED, stryMutAct_9fa48("102574") ? {} : (stryCov_9fa48("102574"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          this.raft.change(stryMutAct_9fa48("102575") ? {} : (stryCov_9fa48("102575"), {
            state: LifeRaft.LEADER
          }));
          this.raft.leader = this.unifiedAddress;
          this.logger.info(PARTITION_SERVICE_LOG_MSG.SINGLE_REPLICA_LEADER, stryMutAct_9fa48("102576") ? {} : (stryCov_9fa48("102576"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId
          }));
        }
      } else {
        if (stryMutAct_9fa48("102577")) {
          {}
        } else {
          stryCov_9fa48("102577");
          // Followers and learners may never emit a role-change event during
          // steady-state startup, so publish the startup role explicitly.
          this.queueRoleUpdate(this.role);
        }
      } // Start periodic size updates
      this.startPeriodicSizeUpdates();
      this.startPreparedStateHoldTimeoutSweep(); // Calculate initial size
      await this.updatePartitionSize();
      this.initialized = stryMutAct_9fa48("102578") ? false : (stryCov_9fa48("102578"), true);
      this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.READY, stryMutAct_9fa48("102579") ? {} : (stryCov_9fa48("102579"), {
        sizeBytes: this.sizeBytes,
        peerTotal: totalPeerCount,
        peerJoined: joinedPeerCount
      }));
      if (stryMutAct_9fa48("102582") ? false : stryMutAct_9fa48("102581") ? true : stryMutAct_9fa48("102580") ? this.suppressLifecycleLogs : (stryCov_9fa48("102580", "102581", "102582"), !this.suppressLifecycleLogs)) {
        if (stryMutAct_9fa48("102583")) {
          {}
        } else {
          stryCov_9fa48("102583");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("102584") ? {} : (stryCov_9fa48("102584"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            sizeBytes: this.sizeBytes
          }));
        }
      }
      this.emit(PARTITION_SERVICE_EVENT.INITIALIZED, stryMutAct_9fa48("102585") ? {} : (stryCov_9fa48("102585"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
    }
  } /**
    * Start the Raft election timer.
    * Call this after all replicas in the group have been created and registered.
    * This prevents election storms when multiple replicas are created on the same node.
    * If deferElection was false, this is a no-op (election already started).
    */
  startElection() {
    if (stryMutAct_9fa48("102586")) {
      {}
    } else {
      stryCov_9fa48("102586");
      if (stryMutAct_9fa48("102588") ? false : stryMutAct_9fa48("102587") ? true : (stryCov_9fa48("102587", "102588"), this.electionStarted)) {
        if (stryMutAct_9fa48("102589")) {
          {}
        } else {
          stryCov_9fa48("102589");
          return;
        }
      } // For single-replica groups, we're already leader
      if (stryMutAct_9fa48("102592") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("102591") ? false : stryMutAct_9fa48("102590") ? true : (stryCov_9fa48("102590", "102591", "102592"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("102593")) {
          {}
        } else {
          stryCov_9fa48("102593");
          this.electionStarted = stryMutAct_9fa48("102594") ? false : (stryCov_9fa48("102594"), true);
          return;
        }
      }
      this.electionStarted = stryMutAct_9fa48("102595") ? false : (stryCov_9fa48("102595"), true);
      if (stryMutAct_9fa48("102597") ? false : stryMutAct_9fa48("102596") ? true : (stryCov_9fa48("102596", "102597"), this.raft)) {
        if (stryMutAct_9fa48("102598")) {
          {}
        } else {
          stryCov_9fa48("102598");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_ELECTION_TIMER, stryMutAct_9fa48("102599") ? {} : (stryCov_9fa48("102599"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            peerCount: stryMutAct_9fa48("102600") ? this.replicaIds.length + NUM.ONE : (stryCov_9fa48("102600"), this.replicaIds.length - NUM.ONE)
          }));
          this.raftProvider.startElectionTimer(this.raft);
        }
      }
    }
  } /**
    * Apply raft timing configuration to this live replica.
    * @param {Object} timingConfig
    * @param {number} timingConfig.heartbeatIntervalMs
    * @param {number} timingConfig.electionTimeoutMinMs
    * @param {number} timingConfig.electionTimeoutMaxMs
    * @param {number} [timingConfig.tickIntervalMs]
    * @return {boolean} True when applied to an initialized raft instance.
    */
  applyRaftTimingConfig(timingConfig = {}) {
    if (stryMutAct_9fa48("102601")) {
      {}
    } else {
      stryCov_9fa48("102601");
      const heartbeatMs = timingConfig.heartbeatIntervalMs;
      const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
      const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
      const previousTickIntervalMs = stryMutAct_9fa48("102604") ? this.raftTimingConfig?.tickIntervalMs && null : stryMutAct_9fa48("102603") ? false : stryMutAct_9fa48("102602") ? true : (stryCov_9fa48("102602", "102603", "102604"), (stryMutAct_9fa48("102605") ? this.raftTimingConfig.tickIntervalMs : (stryCov_9fa48("102605"), this.raftTimingConfig?.tickIntervalMs)) || null);
      const hasTickInterval = Object.prototype.hasOwnProperty.call(timingConfig, stryMutAct_9fa48("102606") ? "" : (stryCov_9fa48("102606"), 'tickIntervalMs'));
      const tickIntervalMs = timingConfig.tickIntervalMs;
      if (stryMutAct_9fa48("102609") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs) || !Number.isFinite(baseElectionMaxMs) || hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO)) && baseElectionMinMs > baseElectionMaxMs : stryMutAct_9fa48("102608") ? false : stryMutAct_9fa48("102607") ? true : (stryCov_9fa48("102607", "102608", "102609"), (stryMutAct_9fa48("102611") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs) || !Number.isFinite(baseElectionMaxMs)) && hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO) : stryMutAct_9fa48("102610") ? false : (stryCov_9fa48("102610", "102611"), (stryMutAct_9fa48("102613") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs)) && !Number.isFinite(baseElectionMaxMs) : stryMutAct_9fa48("102612") ? false : (stryCov_9fa48("102612", "102613"), (stryMutAct_9fa48("102615") ? !Number.isFinite(heartbeatMs) && !Number.isFinite(baseElectionMinMs) : stryMutAct_9fa48("102614") ? false : (stryCov_9fa48("102614", "102615"), (stryMutAct_9fa48("102616") ? Number.isFinite(heartbeatMs) : (stryCov_9fa48("102616"), !Number.isFinite(heartbeatMs))) || (stryMutAct_9fa48("102617") ? Number.isFinite(baseElectionMinMs) : (stryCov_9fa48("102617"), !Number.isFinite(baseElectionMinMs))))) || (stryMutAct_9fa48("102618") ? Number.isFinite(baseElectionMaxMs) : (stryCov_9fa48("102618"), !Number.isFinite(baseElectionMaxMs))))) || (stryMutAct_9fa48("102620") ? hasTickInterval || !Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("102619") ? false : (stryCov_9fa48("102619", "102620"), hasTickInterval && (stryMutAct_9fa48("102622") ? !Number.isFinite(tickIntervalMs) && tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("102621") ? true : (stryCov_9fa48("102621", "102622"), (stryMutAct_9fa48("102623") ? Number.isFinite(tickIntervalMs) : (stryCov_9fa48("102623"), !Number.isFinite(tickIntervalMs))) || (stryMutAct_9fa48("102626") ? tickIntervalMs > NUM.ZERO : stryMutAct_9fa48("102625") ? tickIntervalMs < NUM.ZERO : stryMutAct_9fa48("102624") ? false : (stryCov_9fa48("102624", "102625", "102626"), tickIntervalMs <= NUM.ZERO)))))))) || (stryMutAct_9fa48("102629") ? baseElectionMinMs <= baseElectionMaxMs : stryMutAct_9fa48("102628") ? baseElectionMinMs >= baseElectionMaxMs : stryMutAct_9fa48("102627") ? false : (stryCov_9fa48("102627", "102628", "102629"), baseElectionMinMs > baseElectionMaxMs)))) {
        if (stryMutAct_9fa48("102630")) {
          {}
        } else {
          stryCov_9fa48("102630");
          return stryMutAct_9fa48("102631") ? true : (stryCov_9fa48("102631"), false);
        }
      }
      const {
        electionMinMs,
        electionMaxMs,
        jitterMs
      } = computeReplicaElectionTimeouts(stryMutAct_9fa48("102632") ? {} : (stryCov_9fa48("102632"), {
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS
      }));
      this.raftTimingConfig = stryMutAct_9fa48("102633") ? {} : (stryCov_9fa48("102633"), {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ? tickIntervalMs : stryMutAct_9fa48("102636") ? this.raftTimingConfig?.tickIntervalMs && null : stryMutAct_9fa48("102635") ? false : stryMutAct_9fa48("102634") ? true : (stryCov_9fa48("102634", "102635", "102636"), (stryMutAct_9fa48("102637") ? this.raftTimingConfig.tickIntervalMs : (stryCov_9fa48("102637"), this.raftTimingConfig?.tickIntervalMs)) || null)
      });
      const shouldRearmTimer = stryMutAct_9fa48("102640") ? this.replicaIds.length > NUM.ONE || !this.deferElection || this.electionStarted : stryMutAct_9fa48("102639") ? false : stryMutAct_9fa48("102638") ? true : (stryCov_9fa48("102638", "102639", "102640"), (stryMutAct_9fa48("102643") ? this.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("102642") ? this.replicaIds.length >= NUM.ONE : stryMutAct_9fa48("102641") ? true : (stryCov_9fa48("102641", "102642", "102643"), this.replicaIds.length > NUM.ONE)) && (stryMutAct_9fa48("102645") ? !this.deferElection && this.electionStarted : stryMutAct_9fa48("102644") ? true : (stryCov_9fa48("102644", "102645"), (stryMutAct_9fa48("102646") ? this.deferElection : (stryCov_9fa48("102646"), !this.deferElection)) || this.electionStarted)));
      const applied = applyRuntimeRaftTiming(stryMutAct_9fa48("102647") ? {} : (stryCov_9fa48("102647"), {
        raft: this.raft,
        heartbeatMs,
        electionMinMs,
        electionMaxMs,
        rearmTimer: shouldRearmTimer
      }));
      if (stryMutAct_9fa48("102650") ? false : stryMutAct_9fa48("102649") ? true : stryMutAct_9fa48("102648") ? applied : (stryCov_9fa48("102648", "102649", "102650"), !applied)) {
        if (stryMutAct_9fa48("102651")) {
          {}
        } else {
          stryCov_9fa48("102651");
          return stryMutAct_9fa48("102652") ? true : (stryCov_9fa48("102652"), false);
        }
      }
      const tickChanged = stryMutAct_9fa48("102655") ? hasTickInterval || tickIntervalMs !== previousTickIntervalMs : stryMutAct_9fa48("102654") ? false : stryMutAct_9fa48("102653") ? true : (stryCov_9fa48("102653", "102654", "102655"), hasTickInterval && (stryMutAct_9fa48("102657") ? tickIntervalMs === previousTickIntervalMs : stryMutAct_9fa48("102656") ? true : (stryCov_9fa48("102656", "102657"), tickIntervalMs !== previousTickIntervalMs)));
      const tickRuntimeApplied = stryMutAct_9fa48("102660") ? !tickChanged && this.applyRuntimeTickInterval(tickIntervalMs) : stryMutAct_9fa48("102659") ? false : stryMutAct_9fa48("102658") ? true : (stryCov_9fa48("102658", "102659", "102660"), (stryMutAct_9fa48("102661") ? tickChanged : (stryCov_9fa48("102661"), !tickChanged)) || this.applyRuntimeTickInterval(tickIntervalMs));
      this.logger.info(PARTITION_SERVICE_LOG_MSG.APPLIED_RUNTIME_RAFT_TIMING, stryMutAct_9fa48("102662") ? {} : (stryCov_9fa48("102662"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        heartbeatMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
        tickRuntimeApplied,
        jitterMs,
        rearmTimer: shouldRearmTimer
      }));
      return tickRuntimeApplied;
    }
  } /**
    * Apply raft provider tick interval when supported by the active provider.
    * @param {number} tickIntervalMs
    * @return {boolean} True when applied to a live raft instance.
    */
  applyRuntimeTickInterval(tickIntervalMs) {
    if (stryMutAct_9fa48("102663")) {
      {}
    } else {
      stryCov_9fa48("102663");
      if (stryMutAct_9fa48("102666") ? (!this.raft || !Number.isFinite(tickIntervalMs)) && tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("102665") ? false : stryMutAct_9fa48("102664") ? true : (stryCov_9fa48("102664", "102665", "102666"), (stryMutAct_9fa48("102668") ? !this.raft && !Number.isFinite(tickIntervalMs) : stryMutAct_9fa48("102667") ? false : (stryCov_9fa48("102667", "102668"), (stryMutAct_9fa48("102669") ? this.raft : (stryCov_9fa48("102669"), !this.raft)) || (stryMutAct_9fa48("102670") ? Number.isFinite(tickIntervalMs) : (stryCov_9fa48("102670"), !Number.isFinite(tickIntervalMs))))) || (stryMutAct_9fa48("102673") ? tickIntervalMs > NUM.ZERO : stryMutAct_9fa48("102672") ? tickIntervalMs < NUM.ZERO : stryMutAct_9fa48("102671") ? false : (stryCov_9fa48("102671", "102672", "102673"), tickIntervalMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("102674")) {
          {}
        } else {
          stryCov_9fa48("102674");
          return stryMutAct_9fa48("102675") ? true : (stryCov_9fa48("102675"), false);
        }
      }
      if (stryMutAct_9fa48("102678") ? typeof this.raft.setTickInterval !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102677") ? false : stryMutAct_9fa48("102676") ? true : (stryCov_9fa48("102676", "102677", "102678"), typeof this.raft.setTickInterval === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("102679")) {
          {}
        } else {
          stryCov_9fa48("102679");
          this.raft.setTickInterval(tickIntervalMs);
          return stryMutAct_9fa48("102680") ? false : (stryCov_9fa48("102680"), true);
        }
      }
      if (stryMutAct_9fa48("102683") ? typeof this.raft.configureTickInterval !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("102682") ? false : stryMutAct_9fa48("102681") ? true : (stryCov_9fa48("102681", "102682", "102683"), typeof this.raft.configureTickInterval === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("102684")) {
          {}
        } else {
          stryCov_9fa48("102684");
          this.raft.configureTickInterval(tickIntervalMs);
          return stryMutAct_9fa48("102685") ? false : (stryCov_9fa48("102685"), true);
        }
      }
      if (stryMutAct_9fa48("102687") ? false : stryMutAct_9fa48("102686") ? true : (stryCov_9fa48("102686", "102687"), Object.prototype.hasOwnProperty.call(this.raft, PARTITION_SERVICE_LITERAL.TICKINTERVALMS))) {
        if (stryMutAct_9fa48("102688")) {
          {}
        } else {
          stryCov_9fa48("102688");
          this.raft.tickIntervalMs = tickIntervalMs;
          return stryMutAct_9fa48("102689") ? false : (stryCov_9fa48("102689"), true);
        }
      }
      return stryMutAct_9fa48("102690") ? true : (stryCov_9fa48("102690"), false);
    }
  } /**
    * Create the table based on schema.
    * @private
    */
  createTable() {
    if (stryMutAct_9fa48("102691")) {
      {}
    } else {
      stryCov_9fa48("102691");
      if (stryMutAct_9fa48("102694") ? !this.schema && !this.schema.columns : stryMutAct_9fa48("102693") ? false : stryMutAct_9fa48("102692") ? true : (stryCov_9fa48("102692", "102693", "102694"), (stryMutAct_9fa48("102695") ? this.schema : (stryCov_9fa48("102695"), !this.schema)) || (stryMutAct_9fa48("102696") ? this.schema.columns : (stryCov_9fa48("102696"), !this.schema.columns)))) {
        if (stryMutAct_9fa48("102697")) {
          {}
        } else {
          stryCov_9fa48("102697");
          return;
        }
      }
      const columns = this.schema.columns.map(col => {
        if (stryMutAct_9fa48("102698")) {
          {}
        } else {
          stryCov_9fa48("102698");
          let def = stryMutAct_9fa48("102699") ? `` : (stryCov_9fa48("102699"), `${col.name} ${col.type}`);
          if (stryMutAct_9fa48("102701") ? false : stryMutAct_9fa48("102700") ? true : (stryCov_9fa48("102700", "102701"), col.primaryKey)) {
            if (stryMutAct_9fa48("102702")) {
              {}
            } else {
              stryCov_9fa48("102702");
              stryMutAct_9fa48("102703") ? def -= PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY : (stryCov_9fa48("102703"), def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY);
            }
          }
          if (stryMutAct_9fa48("102705") ? false : stryMutAct_9fa48("102704") ? true : (stryCov_9fa48("102704", "102705"), col.notNull)) {
            if (stryMutAct_9fa48("102706")) {
              {}
            } else {
              stryCov_9fa48("102706");
              stryMutAct_9fa48("102707") ? def -= PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL : (stryCov_9fa48("102707"), def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL);
            }
          }
          if (stryMutAct_9fa48("102710") ? col.defaultValue === undefined : stryMutAct_9fa48("102709") ? false : stryMutAct_9fa48("102708") ? true : (stryCov_9fa48("102708", "102709", "102710"), col.defaultValue !== undefined)) {
            if (stryMutAct_9fa48("102711")) {
              {}
            } else {
              stryCov_9fa48("102711");
              def += stryMutAct_9fa48("102712") ? `` : (stryCov_9fa48("102712"), ` DEFAULT ${col.defaultValue}`);
            }
          }
          return def;
        }
      }).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const sql = stryMutAct_9fa48("102713") ? `` : (stryCov_9fa48("102713"), `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`);
      this.db.exec(sql);
      this.ensureNodesTableColumns();
      this.ensureTablesTableColumns();
      this.ensureMessageGroupsTableColumns();
      this.ensurePartitionsTableColumns();
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_TABLE, stryMutAct_9fa48("102714") ? {} : (stryCov_9fa48("102714"), {
        tableName: this.tableName,
        partitionId: this.partitionId
      }));
    }
  } /**
    * Ensure nodes table includes connection_state column for readiness tracking.
    * @private
    */
  ensureNodesTableColumns() {
    if (stryMutAct_9fa48("102715")) {
      {}
    } else {
      stryCov_9fa48("102715");
      if (stryMutAct_9fa48("102718") ? this.tableName === SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("102717") ? false : stryMutAct_9fa48("102716") ? true : (stryCov_9fa48("102716", "102717", "102718"), this.tableName !== SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("102719")) {
          {}
        } else {
          stryCov_9fa48("102719");
          return;
        }
      }
      const columns = this.db.prepare(stryMutAct_9fa48("102720") ? `` : (stryCov_9fa48("102720"), `PRAGMA table_info(${this.tableName})`)).all();
      const hasConnectionState = stryMutAct_9fa48("102721") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.CONNECTION_STATE) : (stryCov_9fa48("102721"), columns.some(stryMutAct_9fa48("102722") ? () => undefined : (stryCov_9fa48("102722"), col => stryMutAct_9fa48("102725") ? col.name !== PARTITION_SERVICE_COLUMN.CONNECTION_STATE : stryMutAct_9fa48("102724") ? false : stryMutAct_9fa48("102723") ? true : (stryCov_9fa48("102723", "102724", "102725"), col.name === PARTITION_SERVICE_COLUMN.CONNECTION_STATE))));
      const hasLegacyWsConnectionState = stryMutAct_9fa48("102726") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE) : (stryCov_9fa48("102726"), columns.some(stryMutAct_9fa48("102727") ? () => undefined : (stryCov_9fa48("102727"), col => stryMutAct_9fa48("102730") ? col.name !== PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE : stryMutAct_9fa48("102729") ? false : stryMutAct_9fa48("102728") ? true : (stryCov_9fa48("102728", "102729", "102730"), col.name === PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE))));
      const hasCapabilities = stryMutAct_9fa48("102731") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES) : (stryCov_9fa48("102731"), columns.some(stryMutAct_9fa48("102732") ? () => undefined : (stryCov_9fa48("102732"), col => stryMutAct_9fa48("102735") ? col.name !== PARTITION_SERVICE_COLUMN.CAPABILITIES : stryMutAct_9fa48("102734") ? false : stryMutAct_9fa48("102733") ? true : (stryCov_9fa48("102733", "102734", "102735"), col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES))));
      const hasReadyLease = stryMutAct_9fa48("102736") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT) : (stryCov_9fa48("102736"), columns.some(stryMutAct_9fa48("102737") ? () => undefined : (stryCov_9fa48("102737"), col => stryMutAct_9fa48("102740") ? col.name !== PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT : stryMutAct_9fa48("102739") ? false : stryMutAct_9fa48("102738") ? true : (stryCov_9fa48("102738", "102739", "102740"), col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT))));
      let connectionStateAdded = stryMutAct_9fa48("102741") ? true : (stryCov_9fa48("102741"), false);
      if (stryMutAct_9fa48("102744") ? false : stryMutAct_9fa48("102743") ? true : stryMutAct_9fa48("102742") ? hasConnectionState : (stryCov_9fa48("102742", "102743", "102744"), !hasConnectionState)) {
        if (stryMutAct_9fa48("102745")) {
          {}
        } else {
          stryCov_9fa48("102745");
          this.db.exec((stryMutAct_9fa48("102746") ? `` : (stryCov_9fa48("102746"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_CONNECTION_STATE);
          connectionStateAdded = stryMutAct_9fa48("102747") ? false : (stryCov_9fa48("102747"), true);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CONNECTION_STATE, stryMutAct_9fa48("102748") ? {} : (stryCov_9fa48("102748"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102751") ? connectionStateAdded || hasLegacyWsConnectionState : stryMutAct_9fa48("102750") ? false : stryMutAct_9fa48("102749") ? true : (stryCov_9fa48("102749", "102750", "102751"), connectionStateAdded && hasLegacyWsConnectionState)) {
        if (stryMutAct_9fa48("102752")) {
          {}
        } else {
          stryCov_9fa48("102752");
          this.db.exec((stryMutAct_9fa48("102753") ? `` : (stryCov_9fa48("102753"), `UPDATE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS, stryMutAct_9fa48("102754") ? {} : (stryCov_9fa48("102754"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102757") ? false : stryMutAct_9fa48("102756") ? true : stryMutAct_9fa48("102755") ? hasCapabilities : (stryCov_9fa48("102755", "102756", "102757"), !hasCapabilities)) {
        if (stryMutAct_9fa48("102758")) {
          {}
        } else {
          stryCov_9fa48("102758");
          this.db.exec((stryMutAct_9fa48("102759") ? `` : (stryCov_9fa48("102759"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_CAPABILITIES);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CAPABILITIES, stryMutAct_9fa48("102760") ? {} : (stryCov_9fa48("102760"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102763") ? false : stryMutAct_9fa48("102762") ? true : stryMutAct_9fa48("102761") ? hasReadyLease : (stryCov_9fa48("102761", "102762", "102763"), !hasReadyLease)) {
        if (stryMutAct_9fa48("102764")) {
          {}
        } else {
          stryCov_9fa48("102764");
          this.db.exec((stryMutAct_9fa48("102765") ? `` : (stryCov_9fa48("102765"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_READY_LEASE_EXPIRES_AT);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_READY_LEASE, stryMutAct_9fa48("102766") ? {} : (stryCov_9fa48("102766"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
    }
  } /**
    * Ensure message_groups table includes leader_node_id column.
    * @private
    */
  ensureMessageGroupsTableColumns() {
    if (stryMutAct_9fa48("102767")) {
      {}
    } else {
      stryCov_9fa48("102767");
      if (stryMutAct_9fa48("102770") ? this.tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS : stryMutAct_9fa48("102769") ? false : stryMutAct_9fa48("102768") ? true : (stryCov_9fa48("102768", "102769", "102770"), this.tableName !== SYSTEM_TABLE_NAME.MESSAGE_GROUPS)) {
        if (stryMutAct_9fa48("102771")) {
          {}
        } else {
          stryCov_9fa48("102771");
          return;
        }
      }
      const columns = this.db.prepare(stryMutAct_9fa48("102772") ? `` : (stryCov_9fa48("102772"), `PRAGMA table_info(${this.tableName})`)).all();
      const hasLeaderNode = stryMutAct_9fa48("102773") ? columns.every(col => col.name === COLUMN.LEADER_NODE_ID) : (stryCov_9fa48("102773"), columns.some(stryMutAct_9fa48("102774") ? () => undefined : (stryCov_9fa48("102774"), col => stryMutAct_9fa48("102777") ? col.name !== COLUMN.LEADER_NODE_ID : stryMutAct_9fa48("102776") ? false : stryMutAct_9fa48("102775") ? true : (stryCov_9fa48("102775", "102776", "102777"), col.name === COLUMN.LEADER_NODE_ID))));
      if (stryMutAct_9fa48("102780") ? false : stryMutAct_9fa48("102779") ? true : stryMutAct_9fa48("102778") ? hasLeaderNode : (stryCov_9fa48("102778", "102779", "102780"), !hasLeaderNode)) {
        if (stryMutAct_9fa48("102781")) {
          {}
        } else {
          stryCov_9fa48("102781");
          this.db.exec((stryMutAct_9fa48("102782") ? `` : (stryCov_9fa48("102782"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_LEADER_NODE_ID);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_MESSAGE_GROUP_LEADER, stryMutAct_9fa48("102783") ? {} : (stryCov_9fa48("102783"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
    }
  } /**
    * Ensure tables table includes partition lifecycle columns.
    * @private
    */
  ensureTablesTableColumns() {
    if (stryMutAct_9fa48("102784")) {
      {}
    } else {
      stryCov_9fa48("102784");
      if (stryMutAct_9fa48("102787") ? this.tableName === SYSTEM_TABLE_NAME.TABLES : stryMutAct_9fa48("102786") ? false : stryMutAct_9fa48("102785") ? true : (stryCov_9fa48("102785", "102786", "102787"), this.tableName !== SYSTEM_TABLE_NAME.TABLES)) {
        if (stryMutAct_9fa48("102788")) {
          {}
        } else {
          stryCov_9fa48("102788");
          return;
        }
      }
      const columns = this.db.prepare(stryMutAct_9fa48("102789") ? `` : (stryCov_9fa48("102789"), `PRAGMA table_info(${this.tableName})`)).all();
      const hasActivePartitionVersion = stryMutAct_9fa48("102790") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION) : (stryCov_9fa48("102790"), columns.some(stryMutAct_9fa48("102791") ? () => undefined : (stryCov_9fa48("102791"), col => stryMutAct_9fa48("102794") ? col.name !== PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION : stryMutAct_9fa48("102793") ? false : stryMutAct_9fa48("102792") ? true : (stryCov_9fa48("102792", "102793", "102794"), col.name === PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION))));
      const hasPendingPartitionVersion = stryMutAct_9fa48("102795") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION) : (stryCov_9fa48("102795"), columns.some(stryMutAct_9fa48("102796") ? () => undefined : (stryCov_9fa48("102796"), col => stryMutAct_9fa48("102799") ? col.name !== PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION : stryMutAct_9fa48("102798") ? false : stryMutAct_9fa48("102797") ? true : (stryCov_9fa48("102797", "102798", "102799"), col.name === PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION))));
      const hasPartitionTransitionState = stryMutAct_9fa48("102800") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE) : (stryCov_9fa48("102800"), columns.some(stryMutAct_9fa48("102801") ? () => undefined : (stryCov_9fa48("102801"), col => stryMutAct_9fa48("102804") ? col.name !== PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE : stryMutAct_9fa48("102803") ? false : stryMutAct_9fa48("102802") ? true : (stryCov_9fa48("102802", "102803", "102804"), col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE))));
      const hasPartitionTransitionMetadata = stryMutAct_9fa48("102805") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA) : (stryCov_9fa48("102805"), columns.some(stryMutAct_9fa48("102806") ? () => undefined : (stryCov_9fa48("102806"), col => stryMutAct_9fa48("102809") ? col.name !== PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA : stryMutAct_9fa48("102808") ? false : stryMutAct_9fa48("102807") ? true : (stryCov_9fa48("102807", "102808", "102809"), col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA))));
      if (stryMutAct_9fa48("102812") ? false : stryMutAct_9fa48("102811") ? true : stryMutAct_9fa48("102810") ? hasActivePartitionVersion : (stryCov_9fa48("102810", "102811", "102812"), !hasActivePartitionVersion)) {
        if (stryMutAct_9fa48("102813")) {
          {}
        } else {
          stryCov_9fa48("102813");
          this.db.exec((stryMutAct_9fa48("102814") ? `` : (stryCov_9fa48("102814"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_ACTIVE_PARTITION_VERSION);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_ACTIVE_PARTITION_VERSION, stryMutAct_9fa48("102815") ? {} : (stryCov_9fa48("102815"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102818") ? false : stryMutAct_9fa48("102817") ? true : stryMutAct_9fa48("102816") ? hasPendingPartitionVersion : (stryCov_9fa48("102816", "102817", "102818"), !hasPendingPartitionVersion)) {
        if (stryMutAct_9fa48("102819")) {
          {}
        } else {
          stryCov_9fa48("102819");
          this.db.exec((stryMutAct_9fa48("102820") ? `` : (stryCov_9fa48("102820"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_PENDING_PARTITION_VERSION);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PENDING_PARTITION_VERSION, stryMutAct_9fa48("102821") ? {} : (stryCov_9fa48("102821"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102824") ? false : stryMutAct_9fa48("102823") ? true : stryMutAct_9fa48("102822") ? hasPartitionTransitionState : (stryCov_9fa48("102822", "102823", "102824"), !hasPartitionTransitionState)) {
        if (stryMutAct_9fa48("102825")) {
          {}
        } else {
          stryCov_9fa48("102825");
          this.db.exec((stryMutAct_9fa48("102826") ? `` : (stryCov_9fa48("102826"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_STATE);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_STATE, stryMutAct_9fa48("102827") ? {} : (stryCov_9fa48("102827"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102830") ? false : stryMutAct_9fa48("102829") ? true : stryMutAct_9fa48("102828") ? hasPartitionTransitionMetadata : (stryCov_9fa48("102828", "102829", "102830"), !hasPartitionTransitionMetadata)) {
        if (stryMutAct_9fa48("102831")) {
          {}
        } else {
          stryCov_9fa48("102831");
          this.db.exec((stryMutAct_9fa48("102832") ? `` : (stryCov_9fa48("102832"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_METADATA);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_METADATA, stryMutAct_9fa48("102833") ? {} : (stryCov_9fa48("102833"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
    }
  } /**
    * Ensure partitions table includes table_name column for compatibility.
    * @private
    */
  ensurePartitionsTableColumns() {
    if (stryMutAct_9fa48("102834")) {
      {}
    } else {
      stryCov_9fa48("102834");
      if (stryMutAct_9fa48("102837") ? this.tableName === SYSTEM_TABLE_NAME.PARTITIONS : stryMutAct_9fa48("102836") ? false : stryMutAct_9fa48("102835") ? true : (stryCov_9fa48("102835", "102836", "102837"), this.tableName !== SYSTEM_TABLE_NAME.PARTITIONS)) {
        if (stryMutAct_9fa48("102838")) {
          {}
        } else {
          stryCov_9fa48("102838");
          return;
        }
      }
      const columns = this.db.prepare(stryMutAct_9fa48("102839") ? `` : (stryCov_9fa48("102839"), `PRAGMA table_info(${this.tableName})`)).all();
      const hasTableName = stryMutAct_9fa48("102840") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.TABLE_NAME) : (stryCov_9fa48("102840"), columns.some(stryMutAct_9fa48("102841") ? () => undefined : (stryCov_9fa48("102841"), col => stryMutAct_9fa48("102844") ? col.name !== PARTITION_SERVICE_COLUMN.TABLE_NAME : stryMutAct_9fa48("102843") ? false : stryMutAct_9fa48("102842") ? true : (stryCov_9fa48("102842", "102843", "102844"), col.name === PARTITION_SERVICE_COLUMN.TABLE_NAME))));
      const hasPartitionVersion = stryMutAct_9fa48("102845") ? columns.every(col => col.name === PARTITION_SERVICE_COLUMN.PARTITION_VERSION) : (stryCov_9fa48("102845"), columns.some(stryMutAct_9fa48("102846") ? () => undefined : (stryCov_9fa48("102846"), col => stryMutAct_9fa48("102849") ? col.name !== PARTITION_SERVICE_COLUMN.PARTITION_VERSION : stryMutAct_9fa48("102848") ? false : stryMutAct_9fa48("102847") ? true : (stryCov_9fa48("102847", "102848", "102849"), col.name === PARTITION_SERVICE_COLUMN.PARTITION_VERSION))));
      if (stryMutAct_9fa48("102852") ? false : stryMutAct_9fa48("102851") ? true : stryMutAct_9fa48("102850") ? hasTableName : (stryCov_9fa48("102850", "102851", "102852"), !hasTableName)) {
        if (stryMutAct_9fa48("102853")) {
          {}
        } else {
          stryCov_9fa48("102853");
          this.db.exec((stryMutAct_9fa48("102854") ? `` : (stryCov_9fa48("102854"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_TABLE_NAME);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITIONS_TABLE_NAME, stryMutAct_9fa48("102855") ? {} : (stryCov_9fa48("102855"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
      if (stryMutAct_9fa48("102858") ? false : stryMutAct_9fa48("102857") ? true : stryMutAct_9fa48("102856") ? hasPartitionVersion : (stryCov_9fa48("102856", "102857", "102858"), !hasPartitionVersion)) {
        if (stryMutAct_9fa48("102859")) {
          {}
        } else {
          stryCov_9fa48("102859");
          this.db.exec((stryMutAct_9fa48("102860") ? `` : (stryCov_9fa48("102860"), `ALTER TABLE ${this.tableName} `)) + PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_VERSION);
          this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_VERSION, stryMutAct_9fa48("102861") ? {} : (stryCov_9fa48("102861"), {
            tableName: this.tableName,
            partitionId: this.partitionId
          }));
        }
      }
    }
  } /**
    * Handle incoming transport message.
    * Detects Raft packets using isRaftPacket() and routes them directly to liferaft.
    * Handles non-Raft messages as application messages.
    * Requirements: 8.3, 8.4, 13.1, 13.2, 13.3, 13.4
    * @param {Object} envelope - Message envelope.
    * @return {Promise<Object>} Response.
    * @private
    */
  async handleTransportMessage(envelope) {
    if (stryMutAct_9fa48("102862")) {
      {}
    } else {
      stryCov_9fa48("102862");
      // Extract payload - handle both envelope and direct packet formats
      const payload = stryMutAct_9fa48("102865") ? envelope.payload && envelope : stryMutAct_9fa48("102864") ? false : stryMutAct_9fa48("102863") ? true : (stryCov_9fa48("102863", "102864", "102865"), envelope.payload || envelope); // Detect and handle Raft packets directly using isRaftPacket()
      // No type conversion needed - packets flow through unchanged
      // Requirements: 8.3, 8.4, 13.1, 13.2
      if (stryMutAct_9fa48("102867") ? false : stryMutAct_9fa48("102866") ? true : (stryCov_9fa48("102866", "102867"), isRaftPacket(payload))) {
        if (stryMutAct_9fa48("102868")) {
          {}
        } else {
          stryCov_9fa48("102868");
          if (stryMutAct_9fa48("102870") ? false : stryMutAct_9fa48("102869") ? true : (stryCov_9fa48("102869", "102870"), this.raft)) {
            if (stryMutAct_9fa48("102871")) {
              {}
            } else {
              stryCov_9fa48("102871");
              this.logger.trace(PARTITION_SERVICE_LOG_MSG.RECEIVED_RAFT_PACKET, stryMutAct_9fa48("102872") ? {} : (stryCov_9fa48("102872"), {
                type: payload.type,
                term: payload.term,
                address: payload.address,
                replicaId: this.replicaId,
                partitionId: this.partitionId
              })); // Create write function for sending responses back to the sender
              // The sender's address is in payload.address
              // Requirements: 8.4
              const senderAddress = payload.address;
              const write = responsePacket => {
                if (stryMutAct_9fa48("102873")) {
                  {}
                } else {
                  stryCov_9fa48("102873");
                  if (stryMutAct_9fa48("102875") ? false : stryMutAct_9fa48("102874") ? true : (stryCov_9fa48("102874", "102875"), responsePacket)) {
                    if (stryMutAct_9fa48("102876")) {
                      {}
                    } else {
                      stryCov_9fa48("102876");
                      this.logger.trace(PARTITION_SERVICE_LOG_MSG.SENDING_RAFT_RESPONSE, stryMutAct_9fa48("102877") ? {} : (stryCov_9fa48("102877"), {
                        type: responsePacket.type,
                        destination: senderAddress,
                        term: responsePacket.term
                      })); // Send response to the sender
                      this.transport.deliver(senderAddress, responsePacket, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("102878") ? {} : (stryCov_9fa48("102878"), {
                        ...responsePacket,
                        targetAddress: senderAddress
                      }))).catch(err => {
                        if (stryMutAct_9fa48("102879")) {
                          {}
                        } else {
                          stryCov_9fa48("102879");
                          this.logger.error(PARTITION_SERVICE_LOG_MSG.FAILED_RAFT_RESPONSE, stryMutAct_9fa48("102880") ? {} : (stryCov_9fa48("102880"), {
                            error: err.message,
                            destination: senderAddress
                          }));
                        }
                      });
                    }
                  }
                }
              }; // Emit to liferaft with write function for responses
              // Requirements: 8.4
              this.raft.emit(PARTITION_SERVICE_EVENT.DATA, payload, write);
            }
          }
          return stryMutAct_9fa48("102881") ? {} : (stryCov_9fa48("102881"), {
            acknowledged: stryMutAct_9fa48("102882") ? false : (stryCov_9fa48("102882"), true)
          });
        }
      } // Handle application messages (non-Raft)
      // Requirements: 13.3
      return this.handleApplicationMessage(envelope);
    }
  } /**
    * Handle application messages (non-Raft messages).
    * Raft packets are handled by handleTransportMessage() using isRaftPacket().
    * This method only handles application-level messages like FORWARD_WRITE.
    * Requirements: 13.3, 13.4
    * @param {Object} message - Application message
    * @return {Promise<Object>} Processing result
    */
  async handleApplicationMessage(message) {
    if (stryMutAct_9fa48("102883")) {
      {}
    } else {
      stryCov_9fa48("102883");
      const payload = this.extractApplicationPayload(message);
      if (stryMutAct_9fa48("102886") ? !payload && !payload.type : stryMutAct_9fa48("102885") ? false : stryMutAct_9fa48("102884") ? true : (stryCov_9fa48("102884", "102885", "102886"), (stryMutAct_9fa48("102887") ? payload : (stryCov_9fa48("102887"), !payload)) || (stryMutAct_9fa48("102888") ? payload.type : (stryCov_9fa48("102888"), !payload.type)))) {
        if (stryMutAct_9fa48("102889")) {
          {}
        } else {
          stryCov_9fa48("102889");
          return stryMutAct_9fa48("102890") ? {} : (stryCov_9fa48("102890"), {
            acknowledged: stryMutAct_9fa48("102891") ? true : (stryCov_9fa48("102891"), false),
            error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE
          });
        }
      } // Handle application messages only - Raft packets are handled by
      // handleTransportMessage() using isRaftPacket() and emitted to liferaft
      // Requirements: 13.3, 13.4
      switch (payload.type) {
        case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
          if (stryMutAct_9fa48("102892")) {} else {
            stryCov_9fa48("102892");
            // Handle forwarded write operations from followers
            if (stryMutAct_9fa48("102894") ? false : stryMutAct_9fa48("102893") ? true : (stryCov_9fa48("102893", "102894"), payload.operation)) {
              if (stryMutAct_9fa48("102895")) {
                {}
              } else {
                stryCov_9fa48("102895");
                return this.applyWrite(payload.operation);
              }
            }
            return stryMutAct_9fa48("102896") ? {} : (stryCov_9fa48("102896"), {
              acknowledged: stryMutAct_9fa48("102897") ? true : (stryCov_9fa48("102897"), false),
              error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE
            });
          }
        case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
          if (stryMutAct_9fa48("102898")) {} else {
            stryCov_9fa48("102898");
            // Handle system table writes from joining nodes
            // Routes CDC updates from nodes that don't have local system partitions
            return this.handleSystemTableWrite(payload);
          }
        case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
          if (stryMutAct_9fa48("102899")) {} else {
            stryCov_9fa48("102899");
            // Handle remote SQL query execution
            // Enables transparent query routing across the cluster
            return this.handleRemoteQuery(payload);
          }
        case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
          if (stryMutAct_9fa48("102900")) {} else {
            stryCov_9fa48("102900");
            return this.handleTransactionMessage(payload);
          }
        case PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION:
          if (stryMutAct_9fa48("102901")) {} else {
            stryCov_9fa48("102901");
            return this.handleStartSplitReplication(payload);
          }
        default:
          if (stryMutAct_9fa48("102902")) {} else {
            stryCov_9fa48("102902");
            // Unknown message type - log and acknowledge to avoid blocking
            this.logger.debug(PARTITION_SERVICE_LOG_MSG.UNKNOWN_MESSAGE_TYPE, stryMutAct_9fa48("102903") ? {} : (stryCov_9fa48("102903"), {
              type: payload.type,
              partitionId: this.partitionId
            }));
            return stryMutAct_9fa48("102904") ? {} : (stryCov_9fa48("102904"), {
              acknowledged: stryMutAct_9fa48("102905") ? true : (stryCov_9fa48("102905"), false),
              error: PARTITION_SERVICE_ERROR_MSG.unknownMessage(payload.type)
            });
          }
      }
    }
  } /**
    * Handle remote transaction control operations.
    * @param {Object} payload - Transaction message payload.
    * @return {Promise<Object>} Transaction operation response.
    * @private
    */
  async handleTransactionMessage(payload) {
    if (stryMutAct_9fa48("102906")) {
      {}
    } else {
      stryCov_9fa48("102906");
      const operation = stryMutAct_9fa48("102907") ? payload.operation : (stryCov_9fa48("102907"), payload?.operation);
      const sessionId = stryMutAct_9fa48("102910") ? payload?.sessionId && null : stryMutAct_9fa48("102909") ? false : stryMutAct_9fa48("102908") ? true : (stryCov_9fa48("102908", "102909", "102910"), (stryMutAct_9fa48("102911") ? payload.sessionId : (stryCov_9fa48("102911"), payload?.sessionId)) || null);
      const transactionEpoch = Number.isFinite(stryMutAct_9fa48("102912") ? payload.transactionEpoch : (stryCov_9fa48("102912"), payload?.transactionEpoch)) ? Math.floor(payload.transactionEpoch) : null;
      try {
        if (stryMutAct_9fa48("102913")) {
          {}
        } else {
          stryCov_9fa48("102913");
          let result;
          switch (operation) {
            case PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION:
            case PARTITION_SERVICE_LITERAL.BEGIN:
              if (stryMutAct_9fa48("102914")) {} else {
                stryCov_9fa48("102914");
                result = await this.beginTransaction(sessionId, transactionEpoch);
                break;
              }
            case PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION:
            case PARTITION_SERVICE_LITERAL.PREPARE:
              if (stryMutAct_9fa48("102915")) {} else {
                stryCov_9fa48("102915");
                result = await this.prepareTransaction(sessionId);
                break;
              }
            case PARTITION_SERVICE_OPERATION.COMMIT:
              if (stryMutAct_9fa48("102916")) {} else {
                stryCov_9fa48("102916");
                result = await this.commitTransaction(sessionId);
                break;
              }
            case PARTITION_SERVICE_OPERATION.ROLLBACK:
              if (stryMutAct_9fa48("102917")) {} else {
                stryCov_9fa48("102917");
                result = await this.rollbackTransaction(sessionId);
                break;
              }
            default:
              if (stryMutAct_9fa48("102918")) {} else {
                stryCov_9fa48("102918");
                return stryMutAct_9fa48("102919") ? {} : (stryCov_9fa48("102919"), {
                  acknowledged: stryMutAct_9fa48("102920") ? true : (stryCov_9fa48("102920"), false),
                  success: stryMutAct_9fa48("102921") ? true : (stryCov_9fa48("102921"), false),
                  error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation)
                });
              }
          }
          return stryMutAct_9fa48("102922") ? {} : (stryCov_9fa48("102922"), {
            acknowledged: stryMutAct_9fa48("102923") ? false : (stryCov_9fa48("102923"), true),
            success: stryMutAct_9fa48("102926") ? result?.success !== true : stryMutAct_9fa48("102925") ? false : stryMutAct_9fa48("102924") ? true : (stryCov_9fa48("102924", "102925", "102926"), (stryMutAct_9fa48("102927") ? result.success : (stryCov_9fa48("102927"), result?.success)) === (stryMutAct_9fa48("102928") ? false : (stryCov_9fa48("102928"), true))),
            ...result
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("102929")) {
          {}
        } else {
          stryCov_9fa48("102929");
          return stryMutAct_9fa48("102930") ? {} : (stryCov_9fa48("102930"), {
            acknowledged: stryMutAct_9fa48("102931") ? false : (stryCov_9fa48("102931"), true),
            success: stryMutAct_9fa48("102932") ? true : (stryCov_9fa48("102932"), false),
            error: error.message
          });
        }
      }
    }
  } /**
    * Extract canonical application payload from transport envelopes.
    * Message-group direct deliveries wrap payloads as:
    * {messageId, payload, sourceGroup, sourceReplica}.
    * @param {Object} message - Incoming transport message/envelope.
    * @return {Object|null} Canonical payload.
    * @private
    */
  extractApplicationPayload(message) {
    if (stryMutAct_9fa48("102933")) {
      {}
    } else {
      stryCov_9fa48("102933");
      const directPayload = stryMutAct_9fa48("102936") ? message?.payload && message : stryMutAct_9fa48("102935") ? false : stryMutAct_9fa48("102934") ? true : (stryCov_9fa48("102934", "102935", "102936"), (stryMutAct_9fa48("102937") ? message.payload : (stryCov_9fa48("102937"), message?.payload)) || message);
      if (stryMutAct_9fa48("102940") ? directPayload && typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT && !directPayload.type && directPayload.payload || typeof directPayload.payload === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("102939") ? false : stryMutAct_9fa48("102938") ? true : (stryCov_9fa48("102938", "102939", "102940"), (stryMutAct_9fa48("102942") ? directPayload && typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT && !directPayload.type || directPayload.payload : stryMutAct_9fa48("102941") ? true : (stryCov_9fa48("102941", "102942"), (stryMutAct_9fa48("102944") ? directPayload && typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT || !directPayload.type : stryMutAct_9fa48("102943") ? true : (stryCov_9fa48("102943", "102944"), (stryMutAct_9fa48("102946") ? directPayload || typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("102945") ? true : (stryCov_9fa48("102945", "102946"), directPayload && (stryMutAct_9fa48("102948") ? typeof directPayload !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("102947") ? true : (stryCov_9fa48("102947", "102948"), typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT)))) && (stryMutAct_9fa48("102949") ? directPayload.type : (stryCov_9fa48("102949"), !directPayload.type)))) && directPayload.payload)) && (stryMutAct_9fa48("102951") ? typeof directPayload.payload !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("102950") ? true : (stryCov_9fa48("102950", "102951"), typeof directPayload.payload === PARTITION_SERVICE_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("102952")) {
          {}
        } else {
          stryCov_9fa48("102952");
          return directPayload.payload;
        }
      }
      return stryMutAct_9fa48("102955") ? directPayload && null : stryMutAct_9fa48("102954") ? false : stryMutAct_9fa48("102953") ? true : (stryCov_9fa48("102953", "102954", "102955"), directPayload || null);
    }
  } /**
    * Handle system table write operations from remote nodes.
    * This allows joining nodes to update system tables via CDC routing.
    * @param {Object} payload - Write operation payload.
    * @param {string} payload.operation - Operation type (INSERT, UPDATE, DELETE).
    * @param {string} payload.tableName - Target table name.
    * @param {Object} payload.data - Data for INSERT/UPDATE.
    * @param {Object} payload.whereClause - WHERE clause for UPDATE/DELETE.
    * @return {Promise<Object>} Operation result.
    * @private
    */
  async handleSystemTableWrite(payload) {
    if (stryMutAct_9fa48("102956")) {
      {}
    } else {
      stryCov_9fa48("102956");
      const {
        operation,
        tableName,
        data,
        whereClause
      } = payload;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_SYSTEM_TABLE_WRITE, stryMutAct_9fa48("102957") ? {} : (stryCov_9fa48("102957"), {
        operation,
        tableName,
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
      try {
        if (stryMutAct_9fa48("102958")) {
          {}
        } else {
          stryCov_9fa48("102958");
          let result;
          switch (operation) {
            case PARTITION_SERVICE_OPERATION.INSERT:
              if (stryMutAct_9fa48("102959")) {} else {
                stryCov_9fa48("102959");
                result = await this.insertData(tableName, data);
                break;
              }
            case PARTITION_SERVICE_OPERATION.UPDATE:
              if (stryMutAct_9fa48("102960")) {} else {
                stryCov_9fa48("102960");
                result = await this.updateData(tableName, whereClause, data);
                break;
              }
            case PARTITION_SERVICE_OPERATION.DELETE:
              if (stryMutAct_9fa48("102961")) {} else {
                stryCov_9fa48("102961");
                result = await this.deleteData(tableName, whereClause);
                break;
              }
            case PARTITION_SERVICE_OPERATION.UPSERT:
              if (stryMutAct_9fa48("102962")) {} else {
                stryCov_9fa48("102962");
                result = await this.upsertData(tableName, data);
                break;
              }
            default:
              if (stryMutAct_9fa48("102963")) {} else {
                stryCov_9fa48("102963");
                return stryMutAct_9fa48("102964") ? {} : (stryCov_9fa48("102964"), {
                  acknowledged: stryMutAct_9fa48("102965") ? true : (stryCov_9fa48("102965"), false),
                  error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation)
                });
              }
          }
          return stryMutAct_9fa48("102966") ? {} : (stryCov_9fa48("102966"), {
            acknowledged: stryMutAct_9fa48("102967") ? false : (stryCov_9fa48("102967"), true),
            success: result.success,
            changes: stryMutAct_9fa48("102970") ? result.changes && NUM.ZERO : stryMutAct_9fa48("102969") ? false : stryMutAct_9fa48("102968") ? true : (stryCov_9fa48("102968", "102969", "102970"), result.changes || NUM.ZERO)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("102971")) {
          {}
        } else {
          stryCov_9fa48("102971");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.SYSTEM_TABLE_WRITE_FAILED, stryMutAct_9fa48("102972") ? {} : (stryCov_9fa48("102972"), {
            operation,
            tableName,
            error: error.message,
            partitionId: this.partitionId
          }));
          throw error;
        }
      }
    }
  } /**
    * Handle remote SQL query execution.
    * Enables transparent query routing - any node can execute queries on any partition.
    * For write operations on non-leaders, returns a redirect response with leader address.
    * @param {Object} payload - Query payload.
    * @param {string} payload.sql - SQL query string.
    * @param {Array} payload.params - Query parameters.
    * @return {Promise<Object>} Query result or redirect response.
    * @private
    */
  async handleRemoteQuery(payload) {
    if (stryMutAct_9fa48("102973")) {
      {}
    } else {
      stryCov_9fa48("102973");
      const {
        sql,
        params,
        splitMirrorOrigin,
        sessionId,
        [QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION]: migrationOperation,
        [QUERY_PAYLOAD_FIELD_MIGRATION_ID]: migrationId
      } = payload;
      if (stryMutAct_9fa48("102976") ? false : stryMutAct_9fa48("102975") ? true : stryMutAct_9fa48("102974") ? sql : (stryCov_9fa48("102974", "102975", "102976"), !sql)) {
        if (stryMutAct_9fa48("102977")) {
          {}
        } else {
          stryCov_9fa48("102977");
          return stryMutAct_9fa48("102978") ? {} : (stryCov_9fa48("102978"), {
            acknowledged: stryMutAct_9fa48("102979") ? true : (stryCov_9fa48("102979"), false),
            error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY
          });
        }
      }
      const isWriteOperation = this.isWriteQuery(sql); // For write operations, redirect to leader if we're not the leader
      if (stryMutAct_9fa48("102982") ? isWriteOperation || this.role !== RaftRole.LEADER : stryMutAct_9fa48("102981") ? false : stryMutAct_9fa48("102980") ? true : (stryCov_9fa48("102980", "102981", "102982"), isWriteOperation && (stryMutAct_9fa48("102984") ? this.role === RaftRole.LEADER : stryMutAct_9fa48("102983") ? true : (stryCov_9fa48("102983", "102984"), this.role !== RaftRole.LEADER)))) {
        if (stryMutAct_9fa48("102985")) {
          {}
        } else {
          stryCov_9fa48("102985");
          const leaderAddress = this.resolveLeaderAddress();
          if (stryMutAct_9fa48("102987") ? false : stryMutAct_9fa48("102986") ? true : (stryCov_9fa48("102986", "102987"), leaderAddress)) {
            if (stryMutAct_9fa48("102988")) {
              {}
            } else {
              stryCov_9fa48("102988");
              this.logger.debug(PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER, stryMutAct_9fa48("102989") ? {} : (stryCov_9fa48("102989"), {
                partitionId: this.partitionId,
                replicaId: this.replicaId,
                leaderAddress
              }));
              return stryMutAct_9fa48("102990") ? {} : (stryCov_9fa48("102990"), {
                acknowledged: stryMutAct_9fa48("102991") ? false : (stryCov_9fa48("102991"), true),
                success: stryMutAct_9fa48("102992") ? true : (stryCov_9fa48("102992"), false),
                redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
                leaderAddress,
                partitionId: this.partitionId
              });
            }
          } // No leader known - return error so client can retry
          return stryMutAct_9fa48("102993") ? {} : (stryCov_9fa48("102993"), {
            acknowledged: stryMutAct_9fa48("102994") ? false : (stryCov_9fa48("102994"), true),
            success: stryMutAct_9fa48("102995") ? true : (stryCov_9fa48("102995"), false),
            error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
            partitionId: this.partitionId
          });
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, stryMutAct_9fa48("102996") ? {} : (stryCov_9fa48("102996"), {
        sql: stryMutAct_9fa48("102997") ? sql : (stryCov_9fa48("102997"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS)),
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
      try {
        if (stryMutAct_9fa48("102998")) {
          {}
        } else {
          stryCov_9fa48("102998");
          let result = null;
          if (stryMutAct_9fa48("103001") ? migrationOperation !== PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE : stryMutAct_9fa48("103000") ? false : stryMutAct_9fa48("102999") ? true : (stryCov_9fa48("102999", "103000", "103001"), migrationOperation === PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE)) {
            if (stryMutAct_9fa48("103002")) {
              {}
            } else {
              stryCov_9fa48("103002");
              result = await this.executeMigrationAlterQuery(sql, stryMutAct_9fa48("103005") ? params && [] : stryMutAct_9fa48("103004") ? false : stryMutAct_9fa48("103003") ? true : (stryCov_9fa48("103003", "103004", "103005"), params || (stryMutAct_9fa48("103006") ? ["Stryker was here"] : (stryCov_9fa48("103006"), []))), stryMutAct_9fa48("103007") ? {} : (stryCov_9fa48("103007"), {
                migrationId: stryMutAct_9fa48("103010") ? migrationId && null : stryMutAct_9fa48("103009") ? false : stryMutAct_9fa48("103008") ? true : (stryCov_9fa48("103008", "103009", "103010"), migrationId || null),
                sessionId: stryMutAct_9fa48("103013") ? sessionId && null : stryMutAct_9fa48("103012") ? false : stryMutAct_9fa48("103011") ? true : (stryCov_9fa48("103011", "103012", "103013"), sessionId || null)
              }));
            }
          } else {
            if (stryMutAct_9fa48("103014")) {
              {}
            } else {
              stryCov_9fa48("103014");
              result = await this.executeQuery(sql, stryMutAct_9fa48("103017") ? params && [] : stryMutAct_9fa48("103016") ? false : stryMutAct_9fa48("103015") ? true : (stryCov_9fa48("103015", "103016", "103017"), params || (stryMutAct_9fa48("103018") ? ["Stryker was here"] : (stryCov_9fa48("103018"), []))), stryMutAct_9fa48("103019") ? {} : (stryCov_9fa48("103019"), {
                splitMirrorOrigin: stryMutAct_9fa48("103022") ? splitMirrorOrigin && null : stryMutAct_9fa48("103021") ? false : stryMutAct_9fa48("103020") ? true : (stryCov_9fa48("103020", "103021", "103022"), splitMirrorOrigin || null),
                sessionId: stryMutAct_9fa48("103025") ? sessionId && null : stryMutAct_9fa48("103024") ? false : stryMutAct_9fa48("103023") ? true : (stryCov_9fa48("103023", "103024", "103025"), sessionId || null)
              }));
            }
          }
          return stryMutAct_9fa48("103026") ? {} : (stryCov_9fa48("103026"), {
            acknowledged: stryMutAct_9fa48("103027") ? false : (stryCov_9fa48("103027"), true),
            success: stryMutAct_9fa48("103028") ? false : (stryCov_9fa48("103028"), true),
            rows: result.rows,
            changes: result.changes,
            count: result.count,
            partitionId: this.partitionId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103029")) {
          {}
        } else {
          stryCov_9fa48("103029");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.REMOTE_QUERY_FAILED, stryMutAct_9fa48("103030") ? {} : (stryCov_9fa48("103030"), {
            sql: stryMutAct_9fa48("103031") ? sql : (stryCov_9fa48("103031"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS)),
            error: error.message,
            partitionId: this.partitionId
          }));
          throw error;
        }
      }
    }
  } /**
    * Validate and start one source-partition split replication workflow.
    * The request is acknowledged once accepted; backfill/cutover continues
    * asynchronously on the source leader.
    * @param {Object} payload - Split replication request.
    * @return {Promise<Object>} ACK response.
    * @private
    */
  async handleStartSplitReplication(payload) {
    if (stryMutAct_9fa48("103032")) {
      {}
    } else {
      stryCov_9fa48("103032");
      const transitionMetadata = stryMutAct_9fa48("103033") ? payload.transitionMetadata : (stryCov_9fa48("103033"), payload?.transitionMetadata);
      const metadata = this.normalizeSplitTransitionMetadata(transitionMetadata);
      if (stryMutAct_9fa48("103036") ? false : stryMutAct_9fa48("103035") ? true : stryMutAct_9fa48("103034") ? metadata : (stryCov_9fa48("103034", "103035", "103036"), !metadata)) {
        if (stryMutAct_9fa48("103037")) {
          {}
        } else {
          stryCov_9fa48("103037");
          return stryMutAct_9fa48("103038") ? {} : (stryCov_9fa48("103038"), {
            acknowledged: stryMutAct_9fa48("103039") ? true : (stryCov_9fa48("103039"), false),
            error: PARTITION_SERVICE_ERROR_MSG.INVALID_SPLIT_REPLICATION
          });
        }
      }
      this.logger.info(PARTITION_SERVICE_LOG_MSG.START_SPLIT_REPLICATION_REQUEST, stryMutAct_9fa48("103040") ? {} : (stryCov_9fa48("103040"), {
        partitionId: this.partitionId,
        tableId: stryMutAct_9fa48("103043") ? payload?.tableId && this.tableId : stryMutAct_9fa48("103042") ? false : stryMutAct_9fa48("103041") ? true : (stryCov_9fa48("103041", "103042", "103043"), (stryMutAct_9fa48("103044") ? payload.tableId : (stryCov_9fa48("103044"), payload?.tableId)) || this.tableId),
        tableName: stryMutAct_9fa48("103047") ? payload?.tableName && this.tableName : stryMutAct_9fa48("103046") ? false : stryMutAct_9fa48("103045") ? true : (stryCov_9fa48("103045", "103046", "103047"), (stryMutAct_9fa48("103048") ? payload.tableName : (stryCov_9fa48("103048"), payload?.tableName)) || this.tableName),
        targetPartitionIds: metadata.targetPartitionIds,
        targetPartitionVersion: metadata.targetPartitionVersion
      }));
      if (stryMutAct_9fa48("103051") ? this.role === RaftRole.LEADER : stryMutAct_9fa48("103050") ? false : stryMutAct_9fa48("103049") ? true : (stryCov_9fa48("103049", "103050", "103051"), this.role !== RaftRole.LEADER)) {
        if (stryMutAct_9fa48("103052")) {
          {}
        } else {
          stryCov_9fa48("103052");
          const leaderAddress = this.resolveLeaderAddress();
          if (stryMutAct_9fa48("103055") ? leaderAddress || this.transport : stryMutAct_9fa48("103054") ? false : stryMutAct_9fa48("103053") ? true : (stryCov_9fa48("103053", "103054", "103055"), leaderAddress && this.transport)) {
            if (stryMutAct_9fa48("103056")) {
              {}
            } else {
              stryCov_9fa48("103056");
              return this.transport.deliver(leaderAddress, stryMutAct_9fa48("103057") ? {} : (stryCov_9fa48("103057"), {
                type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
                partitionId: stryMutAct_9fa48("103060") ? payload?.partitionId && this.partitionId : stryMutAct_9fa48("103059") ? false : stryMutAct_9fa48("103058") ? true : (stryCov_9fa48("103058", "103059", "103060"), (stryMutAct_9fa48("103061") ? payload.partitionId : (stryCov_9fa48("103061"), payload?.partitionId)) || this.partitionId),
                tableId: stryMutAct_9fa48("103064") ? payload?.tableId && this.tableId : stryMutAct_9fa48("103063") ? false : stryMutAct_9fa48("103062") ? true : (stryCov_9fa48("103062", "103063", "103064"), (stryMutAct_9fa48("103065") ? payload.tableId : (stryCov_9fa48("103065"), payload?.tableId)) || this.tableId),
                tableName: stryMutAct_9fa48("103068") ? payload?.tableName && this.tableName : stryMutAct_9fa48("103067") ? false : stryMutAct_9fa48("103066") ? true : (stryCov_9fa48("103066", "103067", "103068"), (stryMutAct_9fa48("103069") ? payload.tableName : (stryCov_9fa48("103069"), payload?.tableName)) || this.tableName),
                transitionMetadata
              }));
            }
          }
          return stryMutAct_9fa48("103070") ? {} : (stryCov_9fa48("103070"), {
            acknowledged: stryMutAct_9fa48("103071") ? true : (stryCov_9fa48("103071"), false),
            error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE
          });
        }
      }
      if (stryMutAct_9fa48("103074") ? this.splitReplication || this.isSameSplitReplication(this.splitReplication.metadata, metadata) : stryMutAct_9fa48("103073") ? false : stryMutAct_9fa48("103072") ? true : (stryCov_9fa48("103072", "103073", "103074"), this.splitReplication && this.isSameSplitReplication(this.splitReplication.metadata, metadata))) {
        if (stryMutAct_9fa48("103075")) {
          {}
        } else {
          stryCov_9fa48("103075");
          return stryMutAct_9fa48("103076") ? {} : (stryCov_9fa48("103076"), {
            acknowledged: stryMutAct_9fa48("103077") ? false : (stryCov_9fa48("103077"), true),
            success: stryMutAct_9fa48("103078") ? false : (stryCov_9fa48("103078"), true)
          });
        }
      }
      if (stryMutAct_9fa48("103080") ? false : stryMutAct_9fa48("103079") ? true : (stryCov_9fa48("103079", "103080"), this.splitReplication)) {
        if (stryMutAct_9fa48("103081")) {
          {}
        } else {
          stryCov_9fa48("103081");
          return stryMutAct_9fa48("103082") ? {} : (stryCov_9fa48("103082"), {
            acknowledged: stryMutAct_9fa48("103083") ? true : (stryCov_9fa48("103083"), false),
            error: PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED
          });
        }
      } // Transient execution handle — the durable split phase is owned
      // by ManagedSplitWorkflow. This object caches active execution
      // context for the duration of runSplitReplicationWorkflow().
      this.splitReplication = stryMutAct_9fa48("103084") ? {} : (stryCov_9fa48("103084"), {
        metadata,
        phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
        pendingEntries: stryMutAct_9fa48("103085") ? ["Stryker was here"] : (stryCov_9fa48("103085"), []),
        flushInFlight: stryMutAct_9fa48("103086") ? true : (stryCov_9fa48("103086"), false),
        startedAt: Date.now(),
        lastError: null
      });
      this.splitReplicationRun = this.runSplitReplicationWorkflow().catch(error => {
        if (stryMutAct_9fa48("103087")) {
          {}
        } else {
          stryCov_9fa48("103087");
          if (stryMutAct_9fa48("103089") ? false : stryMutAct_9fa48("103088") ? true : (stryCov_9fa48("103088", "103089"), this.splitReplication)) {
            if (stryMutAct_9fa48("103090")) {
              {}
            } else {
              stryCov_9fa48("103090");
              this.splitReplication.lastError = error.message;
              this.splitReplication.phase = PARTITION_TRANSITION_STATE.FAILED;
            }
          }
          this.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED, stryMutAct_9fa48("103091") ? {} : (stryCov_9fa48("103091"), {
            partitionId: this.partitionId,
            error: error.message
          }));
        }
      });
      return stryMutAct_9fa48("103092") ? {} : (stryCov_9fa48("103092"), {
        acknowledged: stryMutAct_9fa48("103093") ? false : (stryCov_9fa48("103093"), true),
        success: stryMutAct_9fa48("103094") ? false : (stryCov_9fa48("103094"), true)
      });
    }
  } /**
    * Execute one migration ALTER TABLE request through the Raft write path.
    * @param {string} sql - ALTER TABLE SQL.
    * @param {Array} params - SQL params.
    * @param {Object} options - Migration context.
    * @return {Promise<Object>} Execution result.
    * @private
    */
  async executeMigrationAlterQuery(sql, params = stryMutAct_9fa48("103095") ? ["Stryker was here"] : (stryCov_9fa48("103095"), []), options = {}) {
    if (stryMutAct_9fa48("103096")) {
      {}
    } else {
      stryCov_9fa48("103096");
      if (stryMutAct_9fa48("103099") ? false : stryMutAct_9fa48("103098") ? true : stryMutAct_9fa48("103097") ? sql : (stryCov_9fa48("103097", "103098", "103099"), !sql)) {
        if (stryMutAct_9fa48("103100")) {
          {}
        } else {
          stryCov_9fa48("103100");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.MIGRATION_ALTER_MISSING_SQL);
        }
      }
      this.registerMigrationDefaultFromAlterSql(sql);
      return this.proposeWrite(stryMutAct_9fa48("103101") ? {} : (stryCov_9fa48("103101"), {
        type: PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE,
        sql,
        params,
        migrationId: stryMutAct_9fa48("103104") ? options.migrationId && null : stryMutAct_9fa48("103103") ? false : stryMutAct_9fa48("103102") ? true : (stryCov_9fa48("103102", "103103", "103104"), options.migrationId || null),
        sessionId: stryMutAct_9fa48("103107") ? options.sessionId && null : stryMutAct_9fa48("103106") ? false : stryMutAct_9fa48("103105") ? true : (stryCov_9fa48("103105", "103106", "103107"), options.sessionId || null)
      }));
    }
  } /**
    * Parse and register one column default from ALTER TABLE ADD COLUMN SQL.
    * @param {string} sql - ALTER TABLE SQL.
    * @return {void}
    * @private
    */
  registerMigrationDefaultFromAlterSql(sql) {
    if (stryMutAct_9fa48("103108")) {
      {}
    } else {
      stryCov_9fa48("103108");
      const parsed = this.parseAddColumnDefaultFromAlterSql(sql);
      if (stryMutAct_9fa48("103111") ? (!parsed || !parsed.columnName) && !parsed.hasDefault : stryMutAct_9fa48("103110") ? false : stryMutAct_9fa48("103109") ? true : (stryCov_9fa48("103109", "103110", "103111"), (stryMutAct_9fa48("103113") ? !parsed && !parsed.columnName : stryMutAct_9fa48("103112") ? false : (stryCov_9fa48("103112", "103113"), (stryMutAct_9fa48("103114") ? parsed : (stryCov_9fa48("103114"), !parsed)) || (stryMutAct_9fa48("103115") ? parsed.columnName : (stryCov_9fa48("103115"), !parsed.columnName)))) || (stryMutAct_9fa48("103116") ? parsed.hasDefault : (stryCov_9fa48("103116"), !parsed.hasDefault)))) {
        if (stryMutAct_9fa48("103117")) {
          {}
        } else {
          stryCov_9fa48("103117");
          return;
        }
      }
      const tableKey = String(stryMutAct_9fa48("103120") ? (this.tableName || this.tableId) && '' : stryMutAct_9fa48("103119") ? false : stryMutAct_9fa48("103118") ? true : (stryCov_9fa48("103118", "103119", "103120"), (stryMutAct_9fa48("103122") ? this.tableName && this.tableId : stryMutAct_9fa48("103121") ? false : (stryCov_9fa48("103121", "103122"), this.tableName || this.tableId)) || (stryMutAct_9fa48("103123") ? "Stryker was here!" : (stryCov_9fa48("103123"), ''))));
      if (stryMutAct_9fa48("103126") ? false : stryMutAct_9fa48("103125") ? true : stryMutAct_9fa48("103124") ? tableKey : (stryCov_9fa48("103124", "103125", "103126"), !tableKey)) {
        if (stryMutAct_9fa48("103127")) {
          {}
        } else {
          stryCov_9fa48("103127");
          return;
        }
      }
      let columnDefaults = this.migrationColumnDefaultsByTable.get(tableKey);
      if (stryMutAct_9fa48("103130") ? false : stryMutAct_9fa48("103129") ? true : stryMutAct_9fa48("103128") ? columnDefaults : (stryCov_9fa48("103128", "103129", "103130"), !columnDefaults)) {
        if (stryMutAct_9fa48("103131")) {
          {}
        } else {
          stryCov_9fa48("103131");
          columnDefaults = new Map();
          this.migrationColumnDefaultsByTable.set(tableKey, columnDefaults);
        }
      }
      columnDefaults.set(parsed.columnName, parsed.defaultLiteral);
      this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATION_DEFAULT_REGISTERED, stryMutAct_9fa48("103132") ? {} : (stryCov_9fa48("103132"), {
        partitionId: this.partitionId,
        tableName: tableKey,
        columnName: parsed.columnName
      }));
    }
  } /**
    * Extract one default literal from ALTER TABLE ... ADD COLUMN SQL.
    * @param {string} sql - ALTER TABLE SQL.
    * @return {Object|null} Parsed default metadata.
    * @private
    */
  parseAddColumnDefaultFromAlterSql(sql) {
    if (stryMutAct_9fa48("103133")) {
      {}
    } else {
      stryCov_9fa48("103133");
      const normalizedSql = String(stryMutAct_9fa48("103136") ? sql && '' : stryMutAct_9fa48("103135") ? false : stryMutAct_9fa48("103134") ? true : (stryCov_9fa48("103134", "103135", "103136"), sql || (stryMutAct_9fa48("103137") ? "Stryker was here!" : (stryCov_9fa48("103137"), ''))));
      const addColumnMatch = normalizedSql.match(stryMutAct_9fa48("103161") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\s]+)$/i : stryMutAct_9fa48("103160") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\S\S]+)$/i : stryMutAct_9fa48("103159") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([^\s\S]+)$/i : stryMutAct_9fa48("103158") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S])$/i : stryMutAct_9fa48("103157") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\S+([\s\S]+)$/i : stryMutAct_9fa48("103156") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s([\s\S]+)$/i : stryMutAct_9fa48("103155") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\S]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103154") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103153") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s])\s+([\s\S]+)$/i : stryMutAct_9fa48("103152") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\S+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103151") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103150") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\S+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103149") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\sCOLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103148") ? /^\s*ALTER\s+TABLE\s+.+?\S+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103147") ? /^\s*ALTER\s+TABLE\s+.+?\sADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103146") ? /^\s*ALTER\s+TABLE\s+.\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103145") ? /^\s*ALTER\s+TABLE\S+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103144") ? /^\s*ALTER\s+TABLE\s.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103143") ? /^\s*ALTER\S+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103142") ? /^\s*ALTER\sTABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103141") ? /^\S*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103140") ? /^\sALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : stryMutAct_9fa48("103139") ? /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)/i : stryMutAct_9fa48("103138") ? /\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i : (stryCov_9fa48("103138", "103139", "103140", "103141", "103142", "103143", "103144", "103145", "103146", "103147", "103148", "103149", "103150", "103151", "103152", "103153", "103154", "103155", "103156", "103157", "103158", "103159", "103160", "103161"), /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i));
      if (stryMutAct_9fa48("103164") ? false : stryMutAct_9fa48("103163") ? true : stryMutAct_9fa48("103162") ? addColumnMatch : (stryCov_9fa48("103162", "103163", "103164"), !addColumnMatch)) {
        if (stryMutAct_9fa48("103165")) {
          {}
        } else {
          stryCov_9fa48("103165");
          return null;
        }
      }
      const columnName = String(stryMutAct_9fa48("103168") ? addColumnMatch[1] && '' : stryMutAct_9fa48("103167") ? false : stryMutAct_9fa48("103166") ? true : (stryCov_9fa48("103166", "103167", "103168"), addColumnMatch[1] || (stryMutAct_9fa48("103169") ? "Stryker was here!" : (stryCov_9fa48("103169"), '')))).replace(stryMutAct_9fa48("103173") ? /^["'`]|[^"'`]$/g : stryMutAct_9fa48("103172") ? /^["'`]|["'`]/g : stryMutAct_9fa48("103171") ? /^[^"'`]|["'`]$/g : stryMutAct_9fa48("103170") ? /["'`]|["'`]$/g : (stryCov_9fa48("103170", "103171", "103172", "103173"), /^["'`]|["'`]$/g), stryMutAct_9fa48("103174") ? "Stryker was here!" : (stryCov_9fa48("103174"), ''));
      const definitionTail = String(stryMutAct_9fa48("103177") ? addColumnMatch[2] && '' : stryMutAct_9fa48("103176") ? false : stryMutAct_9fa48("103175") ? true : (stryCov_9fa48("103175", "103176", "103177"), addColumnMatch[2] || (stryMutAct_9fa48("103178") ? "Stryker was here!" : (stryCov_9fa48("103178"), ''))));
      const defaultMatch = definitionTail.match(stryMutAct_9fa48("103189") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]*`|[^\S,]+))/i : stryMutAct_9fa48("103188") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]*`|[\s,]+))/i : stryMutAct_9fa48("103187") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]*`|[^\s,]))/i : stryMutAct_9fa48("103186") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[`]*`|[^\s,]+))/i : stryMutAct_9fa48("103185") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]`|[^\s,]+))/i : stryMutAct_9fa48("103184") ? /\bDEFAULT\s+((?:'[^']*'|"["]*"|`[^`]*`|[^\s,]+))/i : stryMutAct_9fa48("103183") ? /\bDEFAULT\s+((?:'[^']*'|"[^"]"|`[^`]*`|[^\s,]+))/i : stryMutAct_9fa48("103182") ? /\bDEFAULT\s+((?:'[']*'|"[^"]*"|`[^`]*`|[^\s,]+))/i : stryMutAct_9fa48("103181") ? /\bDEFAULT\s+((?:'[^']'|"[^"]*"|`[^`]*`|[^\s,]+))/i : stryMutAct_9fa48("103180") ? /\bDEFAULT\S+((?:'[^']*'|"[^"]*"|`[^`]*`|[^\s,]+))/i : stryMutAct_9fa48("103179") ? /\bDEFAULT\s((?:'[^']*'|"[^"]*"|`[^`]*`|[^\s,]+))/i : (stryCov_9fa48("103179", "103180", "103181", "103182", "103183", "103184", "103185", "103186", "103187", "103188", "103189"), /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]*`|[^\s,]+))/i));
      return stryMutAct_9fa48("103190") ? {} : (stryCov_9fa48("103190"), {
        columnName,
        hasDefault: stryMutAct_9fa48("103193") ? defaultMatch === null : stryMutAct_9fa48("103192") ? false : stryMutAct_9fa48("103191") ? true : (stryCov_9fa48("103191", "103192", "103193"), defaultMatch !== null),
        defaultLiteral: defaultMatch ? defaultMatch[NUM.ONE] : null
      });
    }
  } /**
    * Check if a SQL query is a write operation.
    * @param {string} sql - SQL query string.
    * @return {boolean} True if write operation.
    * @private
    */
  isWriteQuery(sql) {
    if (stryMutAct_9fa48("103194")) {
      {}
    } else {
      stryCov_9fa48("103194");
      if (stryMutAct_9fa48("103197") ? false : stryMutAct_9fa48("103196") ? true : stryMutAct_9fa48("103195") ? sql : (stryCov_9fa48("103195", "103196", "103197"), !sql)) return stryMutAct_9fa48("103198") ? true : (stryCov_9fa48("103198"), false);
      const trimmed = stryMutAct_9fa48("103200") ? sql.toUpperCase() : stryMutAct_9fa48("103199") ? sql.trim().toLowerCase() : (stryCov_9fa48("103199", "103200"), sql.trim().toUpperCase());
      return stryMutAct_9fa48("103203") ? (trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.CREATE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.DROP)) && trimmed.startsWith(PARTITION_SERVICE_LITERAL.ALTER) : stryMutAct_9fa48("103202") ? false : stryMutAct_9fa48("103201") ? true : (stryCov_9fa48("103201", "103202", "103203"), (stryMutAct_9fa48("103205") ? (trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.CREATE)) && trimmed.startsWith(PARTITION_SERVICE_LITERAL.DROP) : stryMutAct_9fa48("103204") ? false : (stryCov_9fa48("103204", "103205"), (stryMutAct_9fa48("103207") ? (trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE)) && trimmed.startsWith(PARTITION_SERVICE_LITERAL.CREATE) : stryMutAct_9fa48("103206") ? false : (stryCov_9fa48("103206", "103207"), (stryMutAct_9fa48("103209") ? (trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) || trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE)) && trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE) : stryMutAct_9fa48("103208") ? false : (stryCov_9fa48("103208", "103209"), (stryMutAct_9fa48("103211") ? trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) && trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE) : stryMutAct_9fa48("103210") ? false : (stryCov_9fa48("103210", "103211"), (stryMutAct_9fa48("103212") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.INSERT) : (stryCov_9fa48("103212"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT))) || (stryMutAct_9fa48("103213") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.UPDATE) : (stryCov_9fa48("103213"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE))))) || (stryMutAct_9fa48("103214") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.DELETE) : (stryCov_9fa48("103214"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE))))) || (stryMutAct_9fa48("103215") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.CREATE) : (stryCov_9fa48("103215"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.CREATE))))) || (stryMutAct_9fa48("103216") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.DROP) : (stryCov_9fa48("103216"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.DROP))))) || (stryMutAct_9fa48("103217") ? trimmed.endsWith(PARTITION_SERVICE_LITERAL.ALTER) : (stryCov_9fa48("103217"), trimmed.startsWith(PARTITION_SERVICE_LITERAL.ALTER))));
    }
  } /**
    * Apply a committed entry to the state machine.
    * This is called by liferaft when an entry is committed.
    * Requirements: 10.5
    * @param {Object} command - The committed command
    */
  applyCommittedEntry(command) {
    if (stryMutAct_9fa48("103218")) {
      {}
    } else {
      stryCov_9fa48("103218");
      if (stryMutAct_9fa48("103221") ? false : stryMutAct_9fa48("103220") ? true : stryMutAct_9fa48("103219") ? command : (stryCov_9fa48("103219", "103220", "103221"), !command)) {
        if (stryMutAct_9fa48("103222")) {
          {}
        } else {
          stryCov_9fa48("103222");
          return;
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, stryMutAct_9fa48("103223") ? {} : (stryCov_9fa48("103223"), {
        partitionId: this.partitionId,
        commandType: command.type
      })); // Handle different command types
      if (stryMutAct_9fa48("103226") ? (command.type === PARTITION_SERVICE_OPERATION.WRITE || command.type === PARTITION_SERVICE_OPERATION.INSERT || command.type === PARTITION_SERVICE_OPERATION.UPDATE || command.type === PARTITION_SERVICE_OPERATION.DELETE || command.type === PARTITION_SERVICE_OPERATION.UPSERT || command.type === PARTITION_SERVICE_OPERATION.QUERY) && command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE : stryMutAct_9fa48("103225") ? false : stryMutAct_9fa48("103224") ? true : (stryCov_9fa48("103224", "103225", "103226"), (stryMutAct_9fa48("103228") ? (command.type === PARTITION_SERVICE_OPERATION.WRITE || command.type === PARTITION_SERVICE_OPERATION.INSERT || command.type === PARTITION_SERVICE_OPERATION.UPDATE || command.type === PARTITION_SERVICE_OPERATION.DELETE || command.type === PARTITION_SERVICE_OPERATION.UPSERT) && command.type === PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("103227") ? false : (stryCov_9fa48("103227", "103228"), (stryMutAct_9fa48("103230") ? (command.type === PARTITION_SERVICE_OPERATION.WRITE || command.type === PARTITION_SERVICE_OPERATION.INSERT || command.type === PARTITION_SERVICE_OPERATION.UPDATE || command.type === PARTITION_SERVICE_OPERATION.DELETE) && command.type === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("103229") ? false : (stryCov_9fa48("103229", "103230"), (stryMutAct_9fa48("103232") ? (command.type === PARTITION_SERVICE_OPERATION.WRITE || command.type === PARTITION_SERVICE_OPERATION.INSERT || command.type === PARTITION_SERVICE_OPERATION.UPDATE) && command.type === PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("103231") ? false : (stryCov_9fa48("103231", "103232"), (stryMutAct_9fa48("103234") ? (command.type === PARTITION_SERVICE_OPERATION.WRITE || command.type === PARTITION_SERVICE_OPERATION.INSERT) && command.type === PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("103233") ? false : (stryCov_9fa48("103233", "103234"), (stryMutAct_9fa48("103236") ? command.type === PARTITION_SERVICE_OPERATION.WRITE && command.type === PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("103235") ? false : (stryCov_9fa48("103235", "103236"), (stryMutAct_9fa48("103238") ? command.type !== PARTITION_SERVICE_OPERATION.WRITE : stryMutAct_9fa48("103237") ? false : (stryCov_9fa48("103237", "103238"), command.type === PARTITION_SERVICE_OPERATION.WRITE)) || (stryMutAct_9fa48("103240") ? command.type !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("103239") ? false : (stryCov_9fa48("103239", "103240"), command.type === PARTITION_SERVICE_OPERATION.INSERT)))) || (stryMutAct_9fa48("103242") ? command.type !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("103241") ? false : (stryCov_9fa48("103241", "103242"), command.type === PARTITION_SERVICE_OPERATION.UPDATE)))) || (stryMutAct_9fa48("103244") ? command.type !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("103243") ? false : (stryCov_9fa48("103243", "103244"), command.type === PARTITION_SERVICE_OPERATION.DELETE)))) || (stryMutAct_9fa48("103246") ? command.type !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("103245") ? false : (stryCov_9fa48("103245", "103246"), command.type === PARTITION_SERVICE_OPERATION.UPSERT)))) || (stryMutAct_9fa48("103248") ? command.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("103247") ? false : (stryCov_9fa48("103247", "103248"), command.type === PARTITION_SERVICE_OPERATION.QUERY)))) || (stryMutAct_9fa48("103250") ? command.type !== PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE : stryMutAct_9fa48("103249") ? false : (stryCov_9fa48("103249", "103250"), command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE)))) {
        if (stryMutAct_9fa48("103251")) {
          {}
        } else {
          stryCov_9fa48("103251");
          // Apply SQL write operation
          if (stryMutAct_9fa48("103253") ? false : stryMutAct_9fa48("103252") ? true : (stryCov_9fa48("103252", "103253"), command.sql)) {
            if (stryMutAct_9fa48("103254")) {
              {}
            } else {
              stryCov_9fa48("103254");
              if (stryMutAct_9fa48("103257") ? command.type !== PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE : stryMutAct_9fa48("103256") ? false : stryMutAct_9fa48("103255") ? true : (stryCov_9fa48("103255", "103256", "103257"), command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE)) {
                if (stryMutAct_9fa48("103258")) {
                  {}
                } else {
                  stryCov_9fa48("103258");
                  this.registerMigrationDefaultFromAlterSql(command.sql);
                }
              }
              const entryKey = this.getCommittedEntryKey(command);
              if (stryMutAct_9fa48("103261") ? entryKey || this.recentlyAppliedEntryKeys.has(entryKey) : stryMutAct_9fa48("103260") ? false : stryMutAct_9fa48("103259") ? true : (stryCov_9fa48("103259", "103260", "103261"), entryKey && this.recentlyAppliedEntryKeys.has(entryKey))) {
                if (stryMutAct_9fa48("103262")) {
                  {}
                } else {
                  stryCov_9fa48("103262");
                  this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, stryMutAct_9fa48("103263") ? {} : (stryCov_9fa48("103263"), {
                    partitionId: this.partitionId,
                    commandType: command.type,
                    skippedReplay: stryMutAct_9fa48("103264") ? false : (stryCov_9fa48("103264"), true)
                  }));
                  this.resolveCommittedWrite(command.entryId);
                  this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, stryMutAct_9fa48("103265") ? {} : (stryCov_9fa48("103265"), {
                    partitionId: this.partitionId,
                    command
                  }));
                  return;
                }
              }
              try {
                if (stryMutAct_9fa48("103266")) {
                  {}
                } else {
                  stryCov_9fa48("103266");
                  const stmt = this.db.prepare(command.sql);
                  const info = stmt.run(...(stryMutAct_9fa48("103269") ? command.params && [] : stryMutAct_9fa48("103268") ? false : stryMutAct_9fa48("103267") ? true : (stryCov_9fa48("103267", "103268", "103269"), command.params || (stryMutAct_9fa48("103270") ? ["Stryker was here"] : (stryCov_9fa48("103270"), [])))));
                  this.trackAppliedEntryKey(entryKey);
                  this.resolveCommittedWrite(command.entryId, stryMutAct_9fa48("103271") ? {} : (stryCov_9fa48("103271"), {
                    success: stryMutAct_9fa48("103272") ? false : (stryCov_9fa48("103272"), true),
                    changes: info.changes,
                    lastInsertRowid: info.lastInsertRowid,
                    partitionId: this.partitionId
                  })); // Generate CDC event only on the leader.
                  // The leader already emits CDC in applyWrite(); followers
                  // must not duplicate those events.
                  if (stryMutAct_9fa48("103274") ? false : stryMutAct_9fa48("103273") ? true : (stryCov_9fa48("103273", "103274"), this.isLeader)) {
                    if (stryMutAct_9fa48("103275")) {
                      {}
                    } else {
                      stryCov_9fa48("103275");
                      this.trackPendingCDCEvent(this.generateCDCEvent(command).catch(err => {
                        if (stryMutAct_9fa48("103276")) {
                          {}
                        } else {
                          stryCov_9fa48("103276");
                          if (stryMutAct_9fa48("103278") ? false : stryMutAct_9fa48("103277") ? true : (stryCov_9fa48("103277", "103278"), this.isShutdown)) {
                            if (stryMutAct_9fa48("103279")) {
                              {}
                            } else {
                              stryCov_9fa48("103279");
                              return;
                            }
                          }
                          this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, stryMutAct_9fa48("103280") ? {} : (stryCov_9fa48("103280"), {
                            partitionId: this.partitionId,
                            error: err.message
                          }));
                        }
                      }));
                    }
                  }
                }
              } catch (error) {
                if (stryMutAct_9fa48("103281")) {
                  {}
                } else {
                  stryCov_9fa48("103281");
                  if (stryMutAct_9fa48("103283") ? false : stryMutAct_9fa48("103282") ? true : (stryCov_9fa48("103282", "103283"), this.isIdempotentInsertReplayConstraint(error, command))) {
                    if (stryMutAct_9fa48("103284")) {
                      {}
                    } else {
                      stryCov_9fa48("103284");
                      this.trackAppliedEntryKey(entryKey);
                      this.logger.warn(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, stryMutAct_9fa48("103285") ? {} : (stryCov_9fa48("103285"), {
                        partitionId: this.partitionId,
                        commandType: command.type,
                        skippedReplay: stryMutAct_9fa48("103286") ? false : (stryCov_9fa48("103286"), true),
                        replayConstraintSuppressed: stryMutAct_9fa48("103287") ? false : (stryCov_9fa48("103287"), true),
                        error: error.message
                      }));
                      this.resolveCommittedWrite(command.entryId, stryMutAct_9fa48("103288") ? {} : (stryCov_9fa48("103288"), {
                        success: stryMutAct_9fa48("103289") ? false : (stryCov_9fa48("103289"), true),
                        changes: NUM.ZERO,
                        partitionId: this.partitionId
                      }));
                      this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, stryMutAct_9fa48("103290") ? {} : (stryCov_9fa48("103290"), {
                        partitionId: this.partitionId,
                        command
                      }));
                      return;
                    }
                  }
                  this.rejectCommittedWrite(command.entryId, error);
                  this.logger.error(PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED, stryMutAct_9fa48("103291") ? {} : (stryCov_9fa48("103291"), {
                    partitionId: this.partitionId,
                    error: error.message,
                    sql: command.sql ? stryMutAct_9fa48("103292") ? command.sql : (stryCov_9fa48("103292"), command.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_REDACTION_LIMIT)) : null,
                    params: stryMutAct_9fa48("103295") ? command.params && [] : stryMutAct_9fa48("103294") ? false : stryMutAct_9fa48("103293") ? true : (stryCov_9fa48("103293", "103294", "103295"), command.params || (stryMutAct_9fa48("103296") ? ["Stryker was here"] : (stryCov_9fa48("103296"), [])))
                  }));
                  throw error;
                }
              }
            }
          }
        }
      } else if (stryMutAct_9fa48("103299") ? command.type !== PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT : stryMutAct_9fa48("103298") ? false : stryMutAct_9fa48("103297") ? true : (stryCov_9fa48("103297", "103298", "103299"), command.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT)) {
        if (stryMutAct_9fa48("103300")) {
          {}
        } else {
          stryCov_9fa48("103300");
          // Handle transaction commit - operations already applied
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRANSACTION_COMMIT_APPLIED, stryMutAct_9fa48("103301") ? {} : (stryCov_9fa48("103301"), {
            partitionId: this.partitionId,
            operationCount: stryMutAct_9fa48("103304") ? command.operations?.length && NUM.ZERO : stryMutAct_9fa48("103303") ? false : stryMutAct_9fa48("103302") ? true : (stryCov_9fa48("103302", "103303", "103304"), (stryMutAct_9fa48("103305") ? command.operations.length : (stryCov_9fa48("103305"), command.operations?.length)) || NUM.ZERO)
          }));
          this.resolveCommittedWrite(command.entryId, stryMutAct_9fa48("103306") ? {} : (stryCov_9fa48("103306"), {
            success: stryMutAct_9fa48("103307") ? false : (stryCov_9fa48("103307"), true),
            partitionId: this.partitionId
          }));
        }
      }
      this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, stryMutAct_9fa48("103308") ? {} : (stryCov_9fa48("103308"), {
        partitionId: this.partitionId,
        command
      }));
    }
  } /**
    * Resolve the canonical transaction session ID.
    * @param {string|null} sessionId - Requested session ID.
    * @return {string} Canonical session ID.
    * @private
    */
  normalizeTransactionSessionId(sessionId) {
    if (stryMutAct_9fa48("103309")) {
      {}
    } else {
      stryCov_9fa48("103309");
      return (stryMutAct_9fa48("103312") ? typeof sessionId === TYPEOF.STRING || sessionId.length > NUM.ZERO : stryMutAct_9fa48("103311") ? false : stryMutAct_9fa48("103310") ? true : (stryCov_9fa48("103310", "103311", "103312"), (stryMutAct_9fa48("103314") ? typeof sessionId !== TYPEOF.STRING : stryMutAct_9fa48("103313") ? true : (stryCov_9fa48("103313", "103314"), typeof sessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("103317") ? sessionId.length <= NUM.ZERO : stryMutAct_9fa48("103316") ? sessionId.length >= NUM.ZERO : stryMutAct_9fa48("103315") ? true : (stryCov_9fa48("103315", "103316", "103317"), sessionId.length > NUM.ZERO)))) ? sessionId : DEFAULT_TRANSACTION_SESSION_ID;
    }
  } /**
    * Resolve one active session ID for transaction operations.
    * @param {string|null} sessionId - Requested session ID.
    * @return {string|null} Active session ID or null.
    * @private
    */
  resolveActiveTransactionSessionId(sessionId) {
    if (stryMutAct_9fa48("103318")) {
      {}
    } else {
      stryCov_9fa48("103318");
      if (stryMutAct_9fa48("103321") ? typeof sessionId === TYPEOF.STRING || sessionId.length > NUM.ZERO : stryMutAct_9fa48("103320") ? false : stryMutAct_9fa48("103319") ? true : (stryCov_9fa48("103319", "103320", "103321"), (stryMutAct_9fa48("103323") ? typeof sessionId !== TYPEOF.STRING : stryMutAct_9fa48("103322") ? true : (stryCov_9fa48("103322", "103323"), typeof sessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("103326") ? sessionId.length <= NUM.ZERO : stryMutAct_9fa48("103325") ? sessionId.length >= NUM.ZERO : stryMutAct_9fa48("103324") ? true : (stryCov_9fa48("103324", "103325", "103326"), sessionId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("103327")) {
          {}
        } else {
          stryCov_9fa48("103327");
          return sessionId;
        }
      }
      if (stryMutAct_9fa48("103329") ? false : stryMutAct_9fa48("103328") ? true : (stryCov_9fa48("103328", "103329"), this.activeTransactions.has(DEFAULT_TRANSACTION_SESSION_ID))) {
        if (stryMutAct_9fa48("103330")) {
          {}
        } else {
          stryCov_9fa48("103330");
          return DEFAULT_TRANSACTION_SESSION_ID;
        }
      }
      if (stryMutAct_9fa48("103333") ? this.activeTransactions.size !== NUM.ONE : stryMutAct_9fa48("103332") ? false : stryMutAct_9fa48("103331") ? true : (stryCov_9fa48("103331", "103332", "103333"), this.activeTransactions.size === NUM.ONE)) {
        if (stryMutAct_9fa48("103334")) {
          {}
        } else {
          stryCov_9fa48("103334");
          return stryMutAct_9fa48("103337") ? this.activeTransactions.keys().next().value && null : stryMutAct_9fa48("103336") ? false : stryMutAct_9fa48("103335") ? true : (stryCov_9fa48("103335", "103336", "103337"), this.activeTransactions.keys().next().value || null);
        }
      }
      return null;
    }
  } /**
    * Synchronize legacy transaction aliases for compatibility.
    * @private
    */
  syncLegacyTransactionAliases() {
    if (stryMutAct_9fa48("103338")) {
      {}
    } else {
      stryCov_9fa48("103338");
      const defaultState = this.activeTransactions.get(DEFAULT_TRANSACTION_SESSION_ID);
      const fallbackState = (stryMutAct_9fa48("103341") ? this.activeTransactions.size !== NUM.ONE : stryMutAct_9fa48("103340") ? false : stryMutAct_9fa48("103339") ? true : (stryCov_9fa48("103339", "103340", "103341"), this.activeTransactions.size === NUM.ONE)) ? this.activeTransactions.values().next().value : null;
      const defaultPreparedState = this.preparedTransactions.get(DEFAULT_TRANSACTION_SESSION_ID);
      const fallbackPreparedState = (stryMutAct_9fa48("103344") ? this.preparedTransactions.size !== NUM.ONE : stryMutAct_9fa48("103343") ? false : stryMutAct_9fa48("103342") ? true : (stryCov_9fa48("103342", "103343", "103344"), this.preparedTransactions.size === NUM.ONE)) ? this.preparedTransactions.values().next().value : null;
      const activeState = stryMutAct_9fa48("103347") ? (defaultState || fallbackState || defaultPreparedState || fallbackPreparedState) && null : stryMutAct_9fa48("103346") ? false : stryMutAct_9fa48("103345") ? true : (stryCov_9fa48("103345", "103346", "103347"), (stryMutAct_9fa48("103349") ? (defaultState || fallbackState || defaultPreparedState) && fallbackPreparedState : stryMutAct_9fa48("103348") ? false : (stryCov_9fa48("103348", "103349"), (stryMutAct_9fa48("103351") ? (defaultState || fallbackState) && defaultPreparedState : stryMutAct_9fa48("103350") ? false : (stryCov_9fa48("103350", "103351"), (stryMutAct_9fa48("103353") ? defaultState && fallbackState : stryMutAct_9fa48("103352") ? false : (stryCov_9fa48("103352", "103353"), defaultState || fallbackState)) || defaultPreparedState)) || fallbackPreparedState)) || null);
      this.activeTransaction = activeState;
      this.transactionOperations = stryMutAct_9fa48("103356") ? activeState?.operations && [] : stryMutAct_9fa48("103355") ? false : stryMutAct_9fa48("103354") ? true : (stryCov_9fa48("103354", "103355", "103356"), (stryMutAct_9fa48("103357") ? activeState.operations : (stryCov_9fa48("103357"), activeState?.operations)) || (stryMutAct_9fa48("103358") ? ["Stryker was here"] : (stryCov_9fa48("103358"), [])));
    }
  } /**
    * Resolve one transaction state by session.
    * @param {string|null} sessionId - Requested session ID.
    * @return {{sessionId: string, state: Object}|null} Resolved state.
    * @private
    */
  resolveActiveTransactionState(sessionId = null) {
    if (stryMutAct_9fa48("103359")) {
      {}
    } else {
      stryCov_9fa48("103359");
      const resolvedSessionId = this.resolveActiveTransactionSessionId(sessionId);
      if (stryMutAct_9fa48("103362") ? false : stryMutAct_9fa48("103361") ? true : stryMutAct_9fa48("103360") ? resolvedSessionId : (stryCov_9fa48("103360", "103361", "103362"), !resolvedSessionId)) {
        if (stryMutAct_9fa48("103363")) {
          {}
        } else {
          stryCov_9fa48("103363");
          return null;
        }
      }
      const state = stryMutAct_9fa48("103366") ? this.activeTransactions.get(resolvedSessionId) && null : stryMutAct_9fa48("103365") ? false : stryMutAct_9fa48("103364") ? true : (stryCov_9fa48("103364", "103365", "103366"), this.activeTransactions.get(resolvedSessionId) || null);
      if (stryMutAct_9fa48("103369") ? false : stryMutAct_9fa48("103368") ? true : stryMutAct_9fa48("103367") ? state : (stryCov_9fa48("103367", "103368", "103369"), !state)) {
        if (stryMutAct_9fa48("103370")) {
          {}
        } else {
          stryCov_9fa48("103370");
          return null;
        }
      }
      return stryMutAct_9fa48("103371") ? {} : (stryCov_9fa48("103371"), {
        sessionId: resolvedSessionId,
        state
      });
    }
  } /**
    * Resolve one prepared session ID for transaction operations.
    * @param {string|null} sessionId - Requested session ID.
    * @return {string|null} Prepared session ID or null.
    * @private
    */
  resolvePreparedTransactionSessionId(sessionId) {
    if (stryMutAct_9fa48("103372")) {
      {}
    } else {
      stryCov_9fa48("103372");
      if (stryMutAct_9fa48("103375") ? typeof sessionId === TYPEOF.STRING || sessionId.length > NUM.ZERO : stryMutAct_9fa48("103374") ? false : stryMutAct_9fa48("103373") ? true : (stryCov_9fa48("103373", "103374", "103375"), (stryMutAct_9fa48("103377") ? typeof sessionId !== TYPEOF.STRING : stryMutAct_9fa48("103376") ? true : (stryCov_9fa48("103376", "103377"), typeof sessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("103380") ? sessionId.length <= NUM.ZERO : stryMutAct_9fa48("103379") ? sessionId.length >= NUM.ZERO : stryMutAct_9fa48("103378") ? true : (stryCov_9fa48("103378", "103379", "103380"), sessionId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("103381")) {
          {}
        } else {
          stryCov_9fa48("103381");
          return sessionId;
        }
      }
      if (stryMutAct_9fa48("103383") ? false : stryMutAct_9fa48("103382") ? true : (stryCov_9fa48("103382", "103383"), this.preparedTransactions.has(DEFAULT_TRANSACTION_SESSION_ID))) {
        if (stryMutAct_9fa48("103384")) {
          {}
        } else {
          stryCov_9fa48("103384");
          return DEFAULT_TRANSACTION_SESSION_ID;
        }
      }
      if (stryMutAct_9fa48("103387") ? this.preparedTransactions.size !== NUM.ONE : stryMutAct_9fa48("103386") ? false : stryMutAct_9fa48("103385") ? true : (stryCov_9fa48("103385", "103386", "103387"), this.preparedTransactions.size === NUM.ONE)) {
        if (stryMutAct_9fa48("103388")) {
          {}
        } else {
          stryCov_9fa48("103388");
          return stryMutAct_9fa48("103391") ? this.preparedTransactions.keys().next().value && null : stryMutAct_9fa48("103390") ? false : stryMutAct_9fa48("103389") ? true : (stryCov_9fa48("103389", "103390", "103391"), this.preparedTransactions.keys().next().value || null);
        }
      }
      return null;
    }
  } /**
    * Resolve one prepared transaction state by session.
    * @param {string|null} sessionId - Requested session ID.
    * @return {{sessionId: string, state: Object}|null} Resolved state.
    * @private
    */
  resolvePreparedTransactionState(sessionId = null) {
    if (stryMutAct_9fa48("103392")) {
      {}
    } else {
      stryCov_9fa48("103392");
      const resolvedSessionId = this.resolvePreparedTransactionSessionId(sessionId);
      if (stryMutAct_9fa48("103395") ? false : stryMutAct_9fa48("103394") ? true : stryMutAct_9fa48("103393") ? resolvedSessionId : (stryCov_9fa48("103393", "103394", "103395"), !resolvedSessionId)) {
        if (stryMutAct_9fa48("103396")) {
          {}
        } else {
          stryCov_9fa48("103396");
          return null;
        }
      }
      const state = stryMutAct_9fa48("103399") ? this.preparedTransactions.get(resolvedSessionId) && null : stryMutAct_9fa48("103398") ? false : stryMutAct_9fa48("103397") ? true : (stryCov_9fa48("103397", "103398", "103399"), this.preparedTransactions.get(resolvedSessionId) || null);
      if (stryMutAct_9fa48("103402") ? false : stryMutAct_9fa48("103401") ? true : stryMutAct_9fa48("103400") ? state : (stryCov_9fa48("103400", "103401", "103402"), !state)) {
        if (stryMutAct_9fa48("103403")) {
          {}
        } else {
          stryCov_9fa48("103403");
          return null;
        }
      }
      return stryMutAct_9fa48("103404") ? {} : (stryCov_9fa48("103404"), {
        sessionId: resolvedSessionId,
        state
      });
    }
  } /**
    * Resolve one open transaction state by session across active and prepared
    * phases.
    * @param {string|null} sessionId - Requested session ID.
    * @return {{sessionId: string, state: Object}|null} Resolved state.
    * @private
    */
  resolveOpenTransactionState(sessionId = null) {
    if (stryMutAct_9fa48("103405")) {
      {}
    } else {
      stryCov_9fa48("103405");
      return stryMutAct_9fa48("103408") ? this.resolveActiveTransactionState(sessionId) && this.resolvePreparedTransactionState(sessionId) : stryMutAct_9fa48("103407") ? false : stryMutAct_9fa48("103406") ? true : (stryCov_9fa48("103406", "103407", "103408"), this.resolveActiveTransactionState(sessionId) || this.resolvePreparedTransactionState(sessionId));
    }
  } /**
    * Build one prepare-lost response payload.
    * @param {string} operation - Transaction operation.
    * @param {string|null} sessionId - Session ID.
    * @return {Object} Prepare-lost response payload.
    * @private
    */
  buildPrepareLostResponse(operation, sessionId = null) {
    if (stryMutAct_9fa48("103409")) {
      {}
    } else {
      stryCov_9fa48("103409");
      return stryMutAct_9fa48("103410") ? {} : (stryCov_9fa48("103410"), {
        success: stryMutAct_9fa48("103411") ? true : (stryCov_9fa48("103411"), false),
        operation,
        partitionId: this.partitionId,
        sessionId: this.normalizeTransactionSessionId(sessionId),
        error: PARTITION_SERVICE_ERROR_MSG.PREPARE_LOST
      });
    }
  } /**
    * Reconstruct prepared transaction state from the persisted Raft log.
    * @return {{preparedTransactionCount: number, prepareLostCount: number}}
    *   Reconstruction summary.
    */
  reconstructPreparedState() {
    if (stryMutAct_9fa48("103412")) {
      {}
    } else {
      stryCov_9fa48("103412");
      const reconstructedPreparedTransactions = new Map();
      const terminalSessions = new Set();
      const prepareLostSessions = new Set();
      const logEntries = stryMutAct_9fa48("103415") ? this.storage?.getEntriesFrom(NUM.ONE) && [] : stryMutAct_9fa48("103414") ? false : stryMutAct_9fa48("103413") ? true : (stryCov_9fa48("103413", "103414", "103415"), (stryMutAct_9fa48("103416") ? this.storage.getEntriesFrom(NUM.ONE) : (stryCov_9fa48("103416"), this.storage?.getEntriesFrom(NUM.ONE))) || (stryMutAct_9fa48("103417") ? ["Stryker was here"] : (stryCov_9fa48("103417"), [])));
      for (const logEntry of logEntries) {
        if (stryMutAct_9fa48("103418")) {
          {}
        } else {
          stryCov_9fa48("103418");
          const data = stryMutAct_9fa48("103421") ? logEntry?.data && null : stryMutAct_9fa48("103420") ? false : stryMutAct_9fa48("103419") ? true : (stryCov_9fa48("103419", "103420", "103421"), (stryMutAct_9fa48("103422") ? logEntry.data : (stryCov_9fa48("103422"), logEntry?.data)) || null);
          if (stryMutAct_9fa48("103425") ? !data && typeof data !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("103424") ? false : stryMutAct_9fa48("103423") ? true : (stryCov_9fa48("103423", "103424", "103425"), (stryMutAct_9fa48("103426") ? data : (stryCov_9fa48("103426"), !data)) || (stryMutAct_9fa48("103428") ? typeof data === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("103427") ? false : (stryCov_9fa48("103427", "103428"), typeof data !== PARTITION_SERVICE_LITERAL.OBJECT)))) {
            if (stryMutAct_9fa48("103429")) {
              {}
            } else {
              stryCov_9fa48("103429");
              continue;
            }
          }
          const sessionId = this.normalizeTransactionSessionId(stryMutAct_9fa48("103432") ? data.sessionId && null : stryMutAct_9fa48("103431") ? false : stryMutAct_9fa48("103430") ? true : (stryCov_9fa48("103430", "103431", "103432"), data.sessionId || null));
          if (stryMutAct_9fa48("103435") ? false : stryMutAct_9fa48("103434") ? true : stryMutAct_9fa48("103433") ? sessionId : (stryCov_9fa48("103433", "103434", "103435"), !sessionId)) {
            if (stryMutAct_9fa48("103436")) {
              {}
            } else {
              stryCov_9fa48("103436");
              continue;
            }
          }
          if (stryMutAct_9fa48("103439") ? data.type !== PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION : stryMutAct_9fa48("103438") ? false : stryMutAct_9fa48("103437") ? true : (stryCov_9fa48("103437", "103438", "103439"), data.type === PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION)) {
            if (stryMutAct_9fa48("103440")) {
              {}
            } else {
              stryCov_9fa48("103440");
              if (stryMutAct_9fa48("103443") ? false : stryMutAct_9fa48("103442") ? true : stryMutAct_9fa48("103441") ? Array.isArray(data.writeSet) : (stryCov_9fa48("103441", "103442", "103443"), !Array.isArray(data.writeSet))) {
                if (stryMutAct_9fa48("103444")) {
                  {}
                } else {
                  stryCov_9fa48("103444");
                  prepareLostSessions.add(sessionId);
                  reconstructedPreparedTransactions.delete(sessionId);
                  continue;
                }
              }
              reconstructedPreparedTransactions.set(sessionId, stryMutAct_9fa48("103445") ? {} : (stryCov_9fa48("103445"), {
                sessionId,
                transactionEpoch: Number.isFinite(data.epoch) ? data.epoch : null,
                startTime: Number.isFinite(data.proposedAt) ? data.proposedAt : Date.now(),
                operations: stryMutAct_9fa48("103446") ? ["Stryker was here"] : (stryCov_9fa48("103446"), []),
                writeSet: new Set(data.writeSet),
                readSet: new Set(),
                raftLogIndex: Number.isFinite(stryMutAct_9fa48("103447") ? logEntry.index : (stryCov_9fa48("103447"), logEntry?.index)) ? logEntry.index : null,
                preparedAt: Number.isFinite(data.proposedAt) ? data.proposedAt : Date.now()
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("103450") ? (data.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT || data.type === PARTITION_SERVICE_OPERATION.COMMIT) && data.type === PARTITION_SERVICE_OPERATION.ROLLBACK : stryMutAct_9fa48("103449") ? false : stryMutAct_9fa48("103448") ? true : (stryCov_9fa48("103448", "103449", "103450"), (stryMutAct_9fa48("103452") ? data.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT && data.type === PARTITION_SERVICE_OPERATION.COMMIT : stryMutAct_9fa48("103451") ? false : (stryCov_9fa48("103451", "103452"), (stryMutAct_9fa48("103454") ? data.type !== PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT : stryMutAct_9fa48("103453") ? false : (stryCov_9fa48("103453", "103454"), data.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT)) || (stryMutAct_9fa48("103456") ? data.type !== PARTITION_SERVICE_OPERATION.COMMIT : stryMutAct_9fa48("103455") ? false : (stryCov_9fa48("103455", "103456"), data.type === PARTITION_SERVICE_OPERATION.COMMIT)))) || (stryMutAct_9fa48("103458") ? data.type !== PARTITION_SERVICE_OPERATION.ROLLBACK : stryMutAct_9fa48("103457") ? false : (stryCov_9fa48("103457", "103458"), data.type === PARTITION_SERVICE_OPERATION.ROLLBACK)))) {
            if (stryMutAct_9fa48("103459")) {
              {}
            } else {
              stryCov_9fa48("103459");
              terminalSessions.add(sessionId);
              reconstructedPreparedTransactions.delete(sessionId);
              prepareLostSessions.delete(sessionId);
            }
          }
        }
      }
      this.preparedTransactions.clear();
      for (const [sessionId, state] of reconstructedPreparedTransactions.entries()) {
        if (stryMutAct_9fa48("103460")) {
          {}
        } else {
          stryCov_9fa48("103460");
          if (stryMutAct_9fa48("103462") ? false : stryMutAct_9fa48("103461") ? true : (stryCov_9fa48("103461", "103462"), terminalSessions.has(sessionId))) {
            if (stryMutAct_9fa48("103463")) {
              {}
            } else {
              stryCov_9fa48("103463");
              continue;
            }
          }
          this.preparedTransactions.set(sessionId, state);
        }
      }
      for (const sessionId of terminalSessions) {
        if (stryMutAct_9fa48("103464")) {
          {}
        } else {
          stryCov_9fa48("103464");
          this.preparedStateLostSessions.delete(sessionId);
        }
      }
      for (const sessionId of prepareLostSessions) {
        if (stryMutAct_9fa48("103465")) {
          {}
        } else {
          stryCov_9fa48("103465");
          this.preparedTransactions.delete(sessionId);
          this.preparedStateLostSessions.add(sessionId);
        }
      }
      this.syncLegacyTransactionAliases();
      return stryMutAct_9fa48("103466") ? {} : (stryCov_9fa48("103466"), {
        preparedTransactionCount: this.preparedTransactions.size,
        prepareLostCount: this.preparedStateLostSessions.size
      });
    }
  } /**
    * Resolve the primary-key column used for write-set tracking.
    * @return {string|null} Primary-key column name.
    * @private
    */
  resolveTransactionPrimaryKeyColumn() {
    if (stryMutAct_9fa48("103467")) {
      {}
    } else {
      stryCov_9fa48("103467");
      if (stryMutAct_9fa48("103470") ? !this.schema && !Array.isArray(this.schema.columns) : stryMutAct_9fa48("103469") ? false : stryMutAct_9fa48("103468") ? true : (stryCov_9fa48("103468", "103469", "103470"), (stryMutAct_9fa48("103471") ? this.schema : (stryCov_9fa48("103471"), !this.schema)) || (stryMutAct_9fa48("103472") ? Array.isArray(this.schema.columns) : (stryCov_9fa48("103472"), !Array.isArray(this.schema.columns))))) {
        if (stryMutAct_9fa48("103473")) {
          {}
        } else {
          stryCov_9fa48("103473");
          return null;
        }
      }
      const primaryKeyColumn = this.schema.columns.find(stryMutAct_9fa48("103474") ? () => undefined : (stryCov_9fa48("103474"), column => column.primaryKey));
      return stryMutAct_9fa48("103477") ? primaryKeyColumn?.name && null : stryMutAct_9fa48("103476") ? false : stryMutAct_9fa48("103475") ? true : (stryCov_9fa48("103475", "103476", "103477"), (stryMutAct_9fa48("103478") ? primaryKeyColumn.name : (stryCov_9fa48("103478"), primaryKeyColumn?.name)) || null);
    }
  } /**
    * Resolve one write-set key from a transaction entry.
    * @param {Object} entry - Transaction write entry.
    * @return {string|null} Write-set key.
    * @private
    */
  resolveTransactionWriteSetKey(entry) {
    if (stryMutAct_9fa48("103479")) {
      {}
    } else {
      stryCov_9fa48("103479");
      const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
      if (stryMutAct_9fa48("103482") ? false : stryMutAct_9fa48("103481") ? true : stryMutAct_9fa48("103480") ? primaryKeyColumn : (stryCov_9fa48("103480", "103481", "103482"), !primaryKeyColumn)) {
        if (stryMutAct_9fa48("103483")) {
          {}
        } else {
          stryCov_9fa48("103483");
          return null;
        }
      }
      const tableName = stryMutAct_9fa48("103486") ? entry.tableName && this.tableName : stryMutAct_9fa48("103485") ? false : stryMutAct_9fa48("103484") ? true : (stryCov_9fa48("103484", "103485", "103486"), entry.tableName || this.tableName);
      if (stryMutAct_9fa48("103489") ? entry?.whereClause || Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn) : stryMutAct_9fa48("103488") ? false : stryMutAct_9fa48("103487") ? true : (stryCov_9fa48("103487", "103488", "103489"), (stryMutAct_9fa48("103490") ? entry.whereClause : (stryCov_9fa48("103490"), entry?.whereClause)) && Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn))) {
        if (stryMutAct_9fa48("103491")) {
          {}
        } else {
          stryCov_9fa48("103491");
          return stryMutAct_9fa48("103492") ? `` : (stryCov_9fa48("103492"), `${tableName}:${entry.whereClause[primaryKeyColumn]}`);
        }
      }
      if (stryMutAct_9fa48("103495") ? entry?.data || Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn) : stryMutAct_9fa48("103494") ? false : stryMutAct_9fa48("103493") ? true : (stryCov_9fa48("103493", "103494", "103495"), (stryMutAct_9fa48("103496") ? entry.data : (stryCov_9fa48("103496"), entry?.data)) && Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn))) {
        if (stryMutAct_9fa48("103497")) {
          {}
        } else {
          stryCov_9fa48("103497");
          return stryMutAct_9fa48("103498") ? `` : (stryCov_9fa48("103498"), `${tableName}:${entry.data[primaryKeyColumn]}`);
        }
      }
      try {
        if (stryMutAct_9fa48("103499")) {
          {}
        } else {
          stryCov_9fa48("103499");
          const routingKey = this.extractSplitRoutingKey(entry, primaryKeyColumn);
          if (stryMutAct_9fa48("103502") ? routingKey === undefined && routingKey === null : stryMutAct_9fa48("103501") ? false : stryMutAct_9fa48("103500") ? true : (stryCov_9fa48("103500", "103501", "103502"), (stryMutAct_9fa48("103504") ? routingKey !== undefined : stryMutAct_9fa48("103503") ? false : (stryCov_9fa48("103503", "103504"), routingKey === undefined)) || (stryMutAct_9fa48("103506") ? routingKey !== null : stryMutAct_9fa48("103505") ? false : (stryCov_9fa48("103505", "103506"), routingKey === null)))) {
            if (stryMutAct_9fa48("103507")) {
              {}
            } else {
              stryCov_9fa48("103507");
              return null;
            }
          }
          return stryMutAct_9fa48("103508") ? `` : (stryCov_9fa48("103508"), `${tableName}:${routingKey}`);
        }
      } catch (_err) {
        if (stryMutAct_9fa48("103509")) {
          {}
        } else {
          stryCov_9fa48("103509");
          return null;
        }
      }
    }
  } /**
    * Track one transaction write-set key.
    * @param {Object} transactionState - Active transaction state.
    * @param {Object} entry - Transaction write entry.
    * @private
    */
  trackTransactionWriteSetKey(transactionState, entry) {
    if (stryMutAct_9fa48("103510")) {
      {}
    } else {
      stryCov_9fa48("103510");
      const writeSetKey = this.resolveTransactionWriteSetKey(entry);
      if (stryMutAct_9fa48("103513") ? false : stryMutAct_9fa48("103512") ? true : stryMutAct_9fa48("103511") ? writeSetKey : (stryCov_9fa48("103511", "103512", "103513"), !writeSetKey)) {
        if (stryMutAct_9fa48("103514")) {
          {}
        } else {
          stryCov_9fa48("103514");
          return;
        }
      }
      transactionState.writeSet.add(writeSetKey);
    }
  } /**
    * Check whether a write set conflicts with later committed writes.
    * @param {Set<string>} writeSet - Transaction write set.
    * @param {number|null} transactionEpoch - Transaction snapshot epoch.
    * @return {Object} Conflict check result.
    */
  checkWriteConflicts(writeSet, transactionEpoch) {
    if (stryMutAct_9fa48("103515")) {
      {}
    } else {
      stryCov_9fa48("103515");
      if (stryMutAct_9fa48("103518") ? !(writeSet instanceof Set) && writeSet.size === NUM.ZERO : stryMutAct_9fa48("103517") ? false : stryMutAct_9fa48("103516") ? true : (stryCov_9fa48("103516", "103517", "103518"), (stryMutAct_9fa48("103519") ? writeSet instanceof Set : (stryCov_9fa48("103519"), !(writeSet instanceof Set))) || (stryMutAct_9fa48("103521") ? writeSet.size !== NUM.ZERO : stryMutAct_9fa48("103520") ? false : (stryCov_9fa48("103520", "103521"), writeSet.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("103522")) {
          {}
        } else {
          stryCov_9fa48("103522");
          return stryMutAct_9fa48("103523") ? {} : (stryCov_9fa48("103523"), {
            hasConflict: stryMutAct_9fa48("103524") ? true : (stryCov_9fa48("103524"), false),
            conflicts: stryMutAct_9fa48("103525") ? ["Stryker was here"] : (stryCov_9fa48("103525"), [])
          });
        }
      }
      if (stryMutAct_9fa48("103528") ? false : stryMutAct_9fa48("103527") ? true : stryMutAct_9fa48("103526") ? Number.isFinite(transactionEpoch) : (stryCov_9fa48("103526", "103527", "103528"), !Number.isFinite(transactionEpoch))) {
        if (stryMutAct_9fa48("103529")) {
          {}
        } else {
          stryCov_9fa48("103529");
          return stryMutAct_9fa48("103530") ? {} : (stryCov_9fa48("103530"), {
            hasConflict: stryMutAct_9fa48("103531") ? true : (stryCov_9fa48("103531"), false),
            conflicts: stryMutAct_9fa48("103532") ? ["Stryker was here"] : (stryCov_9fa48("103532"), [])
          });
        }
      }
      const conflicts = stryMutAct_9fa48("103533") ? ["Stryker was here"] : (stryCov_9fa48("103533"), []);
      for (const commitRecord of this.committedWriteLog) {
        if (stryMutAct_9fa48("103534")) {
          {}
        } else {
          stryCov_9fa48("103534");
          if (stryMutAct_9fa48("103537") ? !Number.isFinite(commitRecord?.epoch) && commitRecord.epoch <= transactionEpoch : stryMutAct_9fa48("103536") ? false : stryMutAct_9fa48("103535") ? true : (stryCov_9fa48("103535", "103536", "103537"), (stryMutAct_9fa48("103538") ? Number.isFinite(commitRecord?.epoch) : (stryCov_9fa48("103538"), !Number.isFinite(stryMutAct_9fa48("103539") ? commitRecord.epoch : (stryCov_9fa48("103539"), commitRecord?.epoch)))) || (stryMutAct_9fa48("103542") ? commitRecord.epoch > transactionEpoch : stryMutAct_9fa48("103541") ? commitRecord.epoch < transactionEpoch : stryMutAct_9fa48("103540") ? false : (stryCov_9fa48("103540", "103541", "103542"), commitRecord.epoch <= transactionEpoch)))) {
            if (stryMutAct_9fa48("103543")) {
              {}
            } else {
              stryCov_9fa48("103543");
              continue;
            }
          }
          for (const key of writeSet) {
            if (stryMutAct_9fa48("103544")) {
              {}
            } else {
              stryCov_9fa48("103544");
              if (stryMutAct_9fa48("103547") ? false : stryMutAct_9fa48("103546") ? true : stryMutAct_9fa48("103545") ? commitRecord.writeSet.has(key) : (stryCov_9fa48("103545", "103546", "103547"), !commitRecord.writeSet.has(key))) {
                if (stryMutAct_9fa48("103548")) {
                  {}
                } else {
                  stryCov_9fa48("103548");
                  continue;
                }
              }
              conflicts.push(stryMutAct_9fa48("103549") ? {} : (stryCov_9fa48("103549"), {
                key,
                conflictingEpoch: commitRecord.epoch
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("103550") ? {} : (stryCov_9fa48("103550"), {
        hasConflict: stryMutAct_9fa48("103554") ? conflicts.length <= NUM.ZERO : stryMutAct_9fa48("103553") ? conflicts.length >= NUM.ZERO : stryMutAct_9fa48("103552") ? false : stryMutAct_9fa48("103551") ? true : (stryCov_9fa48("103551", "103552", "103553", "103554"), conflicts.length > NUM.ZERO),
        conflicts
      });
    }
  } /**
    * Resolve oldest retained commit epoch from the write log.
    * @return {number|null} Oldest retained commit epoch.
    * @private
    */
  getOldestRetainedCommitEpoch() {
    if (stryMutAct_9fa48("103555")) {
      {}
    } else {
      stryCov_9fa48("103555");
      let oldest = null;
      for (const commitRecord of this.committedWriteLog) {
        if (stryMutAct_9fa48("103556")) {
          {}
        } else {
          stryCov_9fa48("103556");
          if (stryMutAct_9fa48("103559") ? false : stryMutAct_9fa48("103558") ? true : stryMutAct_9fa48("103557") ? Number.isFinite(commitRecord?.epoch) : (stryCov_9fa48("103557", "103558", "103559"), !Number.isFinite(stryMutAct_9fa48("103560") ? commitRecord.epoch : (stryCov_9fa48("103560"), commitRecord?.epoch)))) {
            if (stryMutAct_9fa48("103561")) {
              {}
            } else {
              stryCov_9fa48("103561");
              continue;
            }
          }
          if (stryMutAct_9fa48("103564") ? oldest === null && commitRecord.epoch < oldest : stryMutAct_9fa48("103563") ? false : stryMutAct_9fa48("103562") ? true : (stryCov_9fa48("103562", "103563", "103564"), (stryMutAct_9fa48("103566") ? oldest !== null : stryMutAct_9fa48("103565") ? false : (stryCov_9fa48("103565", "103566"), oldest === null)) || (stryMutAct_9fa48("103569") ? commitRecord.epoch >= oldest : stryMutAct_9fa48("103568") ? commitRecord.epoch <= oldest : stryMutAct_9fa48("103567") ? false : (stryCov_9fa48("103567", "103568", "103569"), commitRecord.epoch < oldest)))) {
            if (stryMutAct_9fa48("103570")) {
              {}
            } else {
              stryCov_9fa48("103570");
              oldest = commitRecord.epoch;
            }
          }
        }
      }
      return oldest;
    }
  } /**
    * Determine whether a transaction snapshot epoch is no longer available.
    * @param {number|null} transactionEpoch - Transaction snapshot epoch.
    * @return {boolean} True when snapshot history has expired.
    * @private
    */
  isSnapshotExpired(transactionEpoch) {
    if (stryMutAct_9fa48("103571")) {
      {}
    } else {
      stryCov_9fa48("103571");
      if (stryMutAct_9fa48("103574") ? false : stryMutAct_9fa48("103573") ? true : stryMutAct_9fa48("103572") ? Number.isFinite(transactionEpoch) : (stryCov_9fa48("103572", "103573", "103574"), !Number.isFinite(transactionEpoch))) {
        if (stryMutAct_9fa48("103575")) {
          {}
        } else {
          stryCov_9fa48("103575");
          return stryMutAct_9fa48("103576") ? true : (stryCov_9fa48("103576"), false);
        }
      }
      if (stryMutAct_9fa48("103580") ? this.committedWriteLog.length >= this.maxCommittedWriteLogEntries : stryMutAct_9fa48("103579") ? this.committedWriteLog.length <= this.maxCommittedWriteLogEntries : stryMutAct_9fa48("103578") ? false : stryMutAct_9fa48("103577") ? true : (stryCov_9fa48("103577", "103578", "103579", "103580"), this.committedWriteLog.length < this.maxCommittedWriteLogEntries)) {
        if (stryMutAct_9fa48("103581")) {
          {}
        } else {
          stryCov_9fa48("103581");
          return stryMutAct_9fa48("103582") ? true : (stryCov_9fa48("103582"), false);
        }
      }
      const oldestRetainedEpoch = this.getOldestRetainedCommitEpoch();
      if (stryMutAct_9fa48("103585") ? false : stryMutAct_9fa48("103584") ? true : stryMutAct_9fa48("103583") ? Number.isFinite(oldestRetainedEpoch) : (stryCov_9fa48("103583", "103584", "103585"), !Number.isFinite(oldestRetainedEpoch))) {
        if (stryMutAct_9fa48("103586")) {
          {}
        } else {
          stryCov_9fa48("103586");
          return stryMutAct_9fa48("103587") ? true : (stryCov_9fa48("103587"), false);
        }
      }
      return stryMutAct_9fa48("103591") ? transactionEpoch >= oldestRetainedEpoch : stryMutAct_9fa48("103590") ? transactionEpoch <= oldestRetainedEpoch : stryMutAct_9fa48("103589") ? false : stryMutAct_9fa48("103588") ? true : (stryCov_9fa48("103588", "103589", "103590", "103591"), transactionEpoch < oldestRetainedEpoch);
    }
  } /**
    * Apply snapshot visibility filtering for transactional reads.
    * @param {Object[]} rows - SQLite result rows.
    * @param {Object} transactionState - Active transaction state.
    * @return {Object[]} Snapshot-visible rows.
    * @private
    */
  applySnapshotReadFilter(rows, transactionState) {
    if (stryMutAct_9fa48("103592")) {
      {}
    } else {
      stryCov_9fa48("103592");
      if (stryMutAct_9fa48("103595") ? !transactionState && !Number.isFinite(transactionState.transactionEpoch) : stryMutAct_9fa48("103594") ? false : stryMutAct_9fa48("103593") ? true : (stryCov_9fa48("103593", "103594", "103595"), (stryMutAct_9fa48("103596") ? transactionState : (stryCov_9fa48("103596"), !transactionState)) || (stryMutAct_9fa48("103597") ? Number.isFinite(transactionState.transactionEpoch) : (stryCov_9fa48("103597"), !Number.isFinite(transactionState.transactionEpoch))))) {
        if (stryMutAct_9fa48("103598")) {
          {}
        } else {
          stryCov_9fa48("103598");
          return rows;
        }
      }
      if (stryMutAct_9fa48("103600") ? false : stryMutAct_9fa48("103599") ? true : (stryCov_9fa48("103599", "103600"), this.isSnapshotExpired(transactionState.transactionEpoch))) {
        if (stryMutAct_9fa48("103601")) {
          {}
        } else {
          stryCov_9fa48("103601");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SNAPSHOT_EXPIRED);
        }
      }
      const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
      if (stryMutAct_9fa48("103604") ? false : stryMutAct_9fa48("103603") ? true : stryMutAct_9fa48("103602") ? primaryKeyColumn : (stryCov_9fa48("103602", "103603", "103604"), !primaryKeyColumn)) {
        if (stryMutAct_9fa48("103605")) {
          {}
        } else {
          stryCov_9fa48("103605");
          return rows;
        }
      }
      const filteredRows = stryMutAct_9fa48("103606") ? ["Stryker was here"] : (stryCov_9fa48("103606"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("103607")) {
          {}
        } else {
          stryCov_9fa48("103607");
          const primaryKeyValue = stryMutAct_9fa48("103608") ? row[primaryKeyColumn] : (stryCov_9fa48("103608"), row?.[primaryKeyColumn]);
          const writeSetKey = stryMutAct_9fa48("103609") ? `` : (stryCov_9fa48("103609"), `${this.tableName}:${primaryKeyValue}`);
          const isOwnWrite = transactionState.writeSet.has(writeSetKey);
          const commitEpoch = this.rowCommitEpoch.get(writeSetKey);
          const committedBeforeSnapshot = stryMutAct_9fa48("103612") ? !Number.isFinite(commitEpoch) && commitEpoch < transactionState.transactionEpoch : stryMutAct_9fa48("103611") ? false : stryMutAct_9fa48("103610") ? true : (stryCov_9fa48("103610", "103611", "103612"), (stryMutAct_9fa48("103613") ? Number.isFinite(commitEpoch) : (stryCov_9fa48("103613"), !Number.isFinite(commitEpoch))) || (stryMutAct_9fa48("103616") ? commitEpoch >= transactionState.transactionEpoch : stryMutAct_9fa48("103615") ? commitEpoch <= transactionState.transactionEpoch : stryMutAct_9fa48("103614") ? false : (stryCov_9fa48("103614", "103615", "103616"), commitEpoch < transactionState.transactionEpoch)));
          if (stryMutAct_9fa48("103619") ? !isOwnWrite || !committedBeforeSnapshot : stryMutAct_9fa48("103618") ? false : stryMutAct_9fa48("103617") ? true : (stryCov_9fa48("103617", "103618", "103619"), (stryMutAct_9fa48("103620") ? isOwnWrite : (stryCov_9fa48("103620"), !isOwnWrite)) && (stryMutAct_9fa48("103621") ? committedBeforeSnapshot : (stryCov_9fa48("103621"), !committedBeforeSnapshot)))) {
            if (stryMutAct_9fa48("103622")) {
              {}
            } else {
              stryCov_9fa48("103622");
              continue;
            }
          }
          transactionState.readSet.add(writeSetKey);
          filteredRows.push(row);
        }
      }
      return filteredRows;
    }
  } /**
    * Trim retained commit history to the configured maximum.
    * @private
    */
  pruneCommittedWriteLog() {
    if (stryMutAct_9fa48("103623")) {
      {}
    } else {
      stryCov_9fa48("103623");
      while (stryMutAct_9fa48("103626") ? this.committedWriteLog.length <= this.maxCommittedWriteLogEntries : stryMutAct_9fa48("103625") ? this.committedWriteLog.length >= this.maxCommittedWriteLogEntries : stryMutAct_9fa48("103624") ? false : (stryCov_9fa48("103624", "103625", "103626"), this.committedWriteLog.length > this.maxCommittedWriteLogEntries)) {
        if (stryMutAct_9fa48("103627")) {
          {}
        } else {
          stryCov_9fa48("103627");
          this.committedWriteLog.shift();
        }
      }
    }
  } /**
    * Release prepared transaction state that exceeded the hold timeout.
    * @param {number} [nowMs] - Clock override for deterministic tests.
    * @return {number} Number of released prepared transactions.
    */
  enforcePreparedStateHoldTimeouts(nowMs = Date.now()) {
    if (stryMutAct_9fa48("103628")) {
      {}
    } else {
      stryCov_9fa48("103628");
      const expiredPreparedSessions = stryMutAct_9fa48("103629") ? ["Stryker was here"] : (stryCov_9fa48("103629"), []);
      for (const [sessionId, state] of this.preparedTransactions.entries()) {
        if (stryMutAct_9fa48("103630")) {
          {}
        } else {
          stryCov_9fa48("103630");
          if (stryMutAct_9fa48("103633") ? false : stryMutAct_9fa48("103632") ? true : stryMutAct_9fa48("103631") ? Number.isFinite(state?.preparedAt) : (stryCov_9fa48("103631", "103632", "103633"), !Number.isFinite(stryMutAct_9fa48("103634") ? state.preparedAt : (stryCov_9fa48("103634"), state?.preparedAt)))) {
            if (stryMutAct_9fa48("103635")) {
              {}
            } else {
              stryCov_9fa48("103635");
              continue;
            }
          }
          const holdDurationMs = stryMutAct_9fa48("103636") ? nowMs + state.preparedAt : (stryCov_9fa48("103636"), nowMs - state.preparedAt);
          if (stryMutAct_9fa48("103640") ? holdDurationMs >= this.preparedStateHoldTimeoutMs : stryMutAct_9fa48("103639") ? holdDurationMs <= this.preparedStateHoldTimeoutMs : stryMutAct_9fa48("103638") ? false : stryMutAct_9fa48("103637") ? true : (stryCov_9fa48("103637", "103638", "103639", "103640"), holdDurationMs < this.preparedStateHoldTimeoutMs)) {
            if (stryMutAct_9fa48("103641")) {
              {}
            } else {
              stryCov_9fa48("103641");
              continue;
            }
          }
          expiredPreparedSessions.push(stryMutAct_9fa48("103642") ? {} : (stryCov_9fa48("103642"), {
            sessionId,
            holdDurationMs,
            preparedAt: state.preparedAt
          }));
        }
      }
      if (stryMutAct_9fa48("103645") ? expiredPreparedSessions.length !== NUM.ZERO : stryMutAct_9fa48("103644") ? false : stryMutAct_9fa48("103643") ? true : (stryCov_9fa48("103643", "103644", "103645"), expiredPreparedSessions.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("103646")) {
          {}
        } else {
          stryCov_9fa48("103646");
          return NUM.ZERO;
        }
      }
      try {
        if (stryMutAct_9fa48("103647")) {
          {}
        } else {
          stryCov_9fa48("103647");
          this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
        }
      } catch (error) {
        if (stryMutAct_9fa48("103648")) {
          {}
        } else {
          stryCov_9fa48("103648");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED, stryMutAct_9fa48("103649") ? {} : (stryCov_9fa48("103649"), {
            partitionId: this.partitionId,
            error: error.message
          }));
        }
      }
      for (const expiredSession of expiredPreparedSessions) {
        if (stryMutAct_9fa48("103650")) {
          {}
        } else {
          stryCov_9fa48("103650");
          this.preparedTransactions.delete(expiredSession.sessionId);
          this.activeTransactions.delete(expiredSession.sessionId);
          this.preparedStateLostSessions.add(expiredSession.sessionId);
          this.logger.warn(PARTITION_SERVICE_LOG_MSG.PREPARED_STATE_HOLD_TIMEOUT, stryMutAct_9fa48("103651") ? {} : (stryCov_9fa48("103651"), {
            partitionId: this.partitionId,
            transactionId: expiredSession.sessionId,
            sessionId: expiredSession.sessionId,
            holdDurationMs: expiredSession.holdDurationMs,
            preparedAt: expiredSession.preparedAt
          }));
        }
      }
      this.syncLegacyTransactionAliases();
      return expiredPreparedSessions.length;
    }
  } /**
    * Start periodic prepared-state hold-timeout enforcement.
    * @private
    */
  startPreparedStateHoldTimeoutSweep() {
    if (stryMutAct_9fa48("103652")) {
      {}
    } else {
      stryCov_9fa48("103652");
      if (stryMutAct_9fa48("103654") ? false : stryMutAct_9fa48("103653") ? true : (stryCov_9fa48("103653", "103654"), this.preparedStateHoldTimer)) {
        if (stryMutAct_9fa48("103655")) {
          {}
        } else {
          stryCov_9fa48("103655");
          return;
        }
      }
      if (stryMutAct_9fa48("103657") ? false : stryMutAct_9fa48("103656") ? true : (stryCov_9fa48("103656", "103657"), this.isShutdown)) {
        if (stryMutAct_9fa48("103658")) {
          {}
        } else {
          stryCov_9fa48("103658");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, stryMutAct_9fa48("103659") ? {} : (stryCov_9fa48("103659"), {
            partitionId: this.partitionId,
            timer: PARTITION_SERVICE_LITERAL.PREPAREDSTATEHOLDTIMER
          }));
          return;
        }
      }
      this.preparedStateHoldTimer = setInterval(() => {
        if (stryMutAct_9fa48("103660")) {
          {}
        } else {
          stryCov_9fa48("103660");
          this.enforcePreparedStateHoldTimeouts(Date.now());
        }
      }, this.preparedStateHoldSweepIntervalMs);
      this.preparedStateHoldTimer.unref();
    }
  } /**
    * Stop periodic prepared-state hold-timeout enforcement.
    * @private
    */
  stopPreparedStateHoldTimeoutSweep() {
    if (stryMutAct_9fa48("103661")) {
      {}
    } else {
      stryCov_9fa48("103661");
      if (stryMutAct_9fa48("103663") ? false : stryMutAct_9fa48("103662") ? true : (stryCov_9fa48("103662", "103663"), this.preparedStateHoldTimer)) {
        if (stryMutAct_9fa48("103664")) {
          {}
        } else {
          stryCov_9fa48("103664");
          clearInterval(this.preparedStateHoldTimer);
          this.preparedStateHoldTimer = null;
        }
      }
    }
  } /**
    * Begin a transaction on this partition.
    * Uses SQLite's transaction support for READ COMMITTED isolation.
    * @param {string} [sessionId] - Transaction session ID.
    * @param {number} [transactionEpoch] - Snapshot epoch for this transaction.
    * @return {Promise<Object>} Transaction result.
    */
  async beginTransaction(sessionId = null, transactionEpoch = null) {
    if (stryMutAct_9fa48("103665")) {
      {}
    } else {
      stryCov_9fa48("103665");
      if (stryMutAct_9fa48("103668") ? false : stryMutAct_9fa48("103667") ? true : stryMutAct_9fa48("103666") ? this.initialized : (stryCov_9fa48("103666", "103667", "103668"), !this.initialized)) {
        if (stryMutAct_9fa48("103669")) {
          {}
        } else {
          stryCov_9fa48("103669");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
      const openTransaction = this.resolveOpenTransactionState(transactionSessionId);
      if (stryMutAct_9fa48("103671") ? false : stryMutAct_9fa48("103670") ? true : (stryCov_9fa48("103670", "103671"), openTransaction)) {
        if (stryMutAct_9fa48("103672")) {
          {}
        } else {
          stryCov_9fa48("103672");
          const requestedEpoch = Number.isFinite(transactionEpoch) ? transactionEpoch : null;
          const openEpoch = Number.isFinite(openTransaction.state.transactionEpoch) ? openTransaction.state.transactionEpoch : null;
          if (stryMutAct_9fa48("103675") ? (requestedEpoch === null || openEpoch === null) && requestedEpoch === openEpoch : stryMutAct_9fa48("103674") ? false : stryMutAct_9fa48("103673") ? true : (stryCov_9fa48("103673", "103674", "103675"), (stryMutAct_9fa48("103677") ? requestedEpoch === null && openEpoch === null : stryMutAct_9fa48("103676") ? false : (stryCov_9fa48("103676", "103677"), (stryMutAct_9fa48("103679") ? requestedEpoch !== null : stryMutAct_9fa48("103678") ? false : (stryCov_9fa48("103678", "103679"), requestedEpoch === null)) || (stryMutAct_9fa48("103681") ? openEpoch !== null : stryMutAct_9fa48("103680") ? false : (stryCov_9fa48("103680", "103681"), openEpoch === null)))) || (stryMutAct_9fa48("103683") ? requestedEpoch !== openEpoch : stryMutAct_9fa48("103682") ? false : (stryCov_9fa48("103682", "103683"), requestedEpoch === openEpoch)))) {
            if (stryMutAct_9fa48("103684")) {
              {}
            } else {
              stryCov_9fa48("103684");
              return stryMutAct_9fa48("103685") ? {} : (stryCov_9fa48("103685"), {
                success: stryMutAct_9fa48("103686") ? false : (stryCov_9fa48("103686"), true),
                operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
                partitionId: this.partitionId,
                inTransaction: stryMutAct_9fa48("103687") ? false : (stryCov_9fa48("103687"), true),
                idempotent: stryMutAct_9fa48("103688") ? false : (stryCov_9fa48("103688"), true),
                sessionId: transactionSessionId,
                transactionEpoch: openTransaction.state.transactionEpoch
              });
            }
          }
          throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
        }
      }
      if (stryMutAct_9fa48("103691") ? this.activeTransactions.size > NUM.ZERO && this.preparedTransactions.size > NUM.ZERO : stryMutAct_9fa48("103690") ? false : stryMutAct_9fa48("103689") ? true : (stryCov_9fa48("103689", "103690", "103691"), (stryMutAct_9fa48("103694") ? this.activeTransactions.size <= NUM.ZERO : stryMutAct_9fa48("103693") ? this.activeTransactions.size >= NUM.ZERO : stryMutAct_9fa48("103692") ? false : (stryCov_9fa48("103692", "103693", "103694"), this.activeTransactions.size > NUM.ZERO)) || (stryMutAct_9fa48("103697") ? this.preparedTransactions.size <= NUM.ZERO : stryMutAct_9fa48("103696") ? this.preparedTransactions.size >= NUM.ZERO : stryMutAct_9fa48("103695") ? false : (stryCov_9fa48("103695", "103696", "103697"), this.preparedTransactions.size > NUM.ZERO)))) {
        if (stryMutAct_9fa48("103698")) {
          {}
        } else {
          stryCov_9fa48("103698");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
        }
      }
      this.preparedStateLostSessions.delete(transactionSessionId);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, stryMutAct_9fa48("103699") ? {} : (stryCov_9fa48("103699"), {
        partitionId: this.partitionId,
        sessionId: transactionSessionId,
        transactionEpoch
      }));
      try {
        if (stryMutAct_9fa48("103700")) {
          {}
        } else {
          stryCov_9fa48("103700");
          // Use SQLite's BEGIN for transaction support
          this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
          const transactionState = stryMutAct_9fa48("103701") ? {} : (stryCov_9fa48("103701"), {
            sessionId: transactionSessionId,
            transactionEpoch,
            startTime: Date.now(),
            operations: stryMutAct_9fa48("103702") ? ["Stryker was here"] : (stryCov_9fa48("103702"), []),
            writeSet: new Set(),
            readSet: new Set()
          });
          this.activeTransactions.set(transactionSessionId, transactionState);
          this.syncLegacyTransactionAliases();
          return stryMutAct_9fa48("103703") ? {} : (stryCov_9fa48("103703"), {
            success: stryMutAct_9fa48("103704") ? false : (stryCov_9fa48("103704"), true),
            operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
            partitionId: this.partitionId,
            inTransaction: stryMutAct_9fa48("103705") ? false : (stryCov_9fa48("103705"), true),
            sessionId: transactionSessionId,
            transactionEpoch
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103706")) {
          {}
        } else {
          stryCov_9fa48("103706");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.BEGIN_TRANSACTION_FAILED, stryMutAct_9fa48("103707") ? {} : (stryCov_9fa48("103707"), {
            partitionId: this.partitionId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Prepare one active transaction on this partition.
    * @param {string|null} sessionId - Transaction session ID.
    * @return {Promise<Object>} Prepare result.
    */
  async prepareTransaction(sessionId = null) {
    if (stryMutAct_9fa48("103708")) {
      {}
    } else {
      stryCov_9fa48("103708");
      if (stryMutAct_9fa48("103711") ? false : stryMutAct_9fa48("103710") ? true : stryMutAct_9fa48("103709") ? this.initialized : (stryCov_9fa48("103709", "103710", "103711"), !this.initialized)) {
        if (stryMutAct_9fa48("103712")) {
          {}
        } else {
          stryCov_9fa48("103712");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const transaction = stryMutAct_9fa48("103715") ? this.resolveActiveTransactionState(sessionId) && this.resolvePreparedTransactionState(sessionId) : stryMutAct_9fa48("103714") ? false : stryMutAct_9fa48("103713") ? true : (stryCov_9fa48("103713", "103714", "103715"), this.resolveActiveTransactionState(sessionId) || this.resolvePreparedTransactionState(sessionId));
      if (stryMutAct_9fa48("103718") ? false : stryMutAct_9fa48("103717") ? true : stryMutAct_9fa48("103716") ? transaction : (stryCov_9fa48("103716", "103717", "103718"), !transaction)) {
        if (stryMutAct_9fa48("103719")) {
          {}
        } else {
          stryCov_9fa48("103719");
          return stryMutAct_9fa48("103720") ? {} : (stryCov_9fa48("103720"), {
            success: stryMutAct_9fa48("103721") ? true : (stryCov_9fa48("103721"), false),
            operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
            partitionId: this.partitionId,
            error: PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_PREPARE
          });
        }
      }
      const {
        sessionId: transactionSessionId,
        state: transactionState
      } = transaction;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.PREPARING_TRANSACTION, stryMutAct_9fa48("103722") ? {} : (stryCov_9fa48("103722"), {
        partitionId: this.partitionId,
        sessionId: transactionSessionId,
        operationCount: transactionState.operations.length,
        writeSetSize: transactionState.writeSet.size
      }));
      const conflictCheck = this.checkWriteConflicts(transactionState.writeSet, transactionState.transactionEpoch);
      if (stryMutAct_9fa48("103724") ? false : stryMutAct_9fa48("103723") ? true : (stryCov_9fa48("103723", "103724"), conflictCheck.hasConflict)) {
        if (stryMutAct_9fa48("103725")) {
          {}
        } else {
          stryCov_9fa48("103725");
          return stryMutAct_9fa48("103726") ? {} : (stryCov_9fa48("103726"), {
            success: stryMutAct_9fa48("103727") ? true : (stryCov_9fa48("103727"), false),
            operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
            partitionId: this.partitionId,
            error: PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT,
            conflicts: conflictCheck.conflicts
          });
        }
      }
      const raftEntry = await this.replicatePreparedTransaction(transactionSessionId, transactionState);
      this.activeTransactions.delete(transactionSessionId);
      this.preparedTransactions.set(transactionSessionId, stryMutAct_9fa48("103728") ? {} : (stryCov_9fa48("103728"), {
        sessionId: transactionSessionId,
        transactionEpoch: transactionState.transactionEpoch,
        startTime: transactionState.startTime,
        operations: transactionState.operations,
        writeSet: transactionState.writeSet,
        readSet: transactionState.readSet,
        raftLogIndex: stryMutAct_9fa48("103731") ? raftEntry?.index && null : stryMutAct_9fa48("103730") ? false : stryMutAct_9fa48("103729") ? true : (stryCov_9fa48("103729", "103730", "103731"), (stryMutAct_9fa48("103732") ? raftEntry.index : (stryCov_9fa48("103732"), raftEntry?.index)) || null),
        preparedAt: Date.now()
      }));
      this.syncLegacyTransactionAliases();
      return stryMutAct_9fa48("103733") ? {} : (stryCov_9fa48("103733"), {
        success: stryMutAct_9fa48("103734") ? false : (stryCov_9fa48("103734"), true),
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        prepared: stryMutAct_9fa48("103735") ? false : (stryCov_9fa48("103735"), true),
        sessionId: transactionSessionId,
        raftLogIndex: stryMutAct_9fa48("103738") ? raftEntry?.index && null : stryMutAct_9fa48("103737") ? false : stryMutAct_9fa48("103736") ? true : (stryCov_9fa48("103736", "103737", "103738"), (stryMutAct_9fa48("103739") ? raftEntry.index : (stryCov_9fa48("103739"), raftEntry?.index)) || null)
      });
    }
  } /**
    * Commit the active transaction.
    * Ensures durability through Raft replication before acknowledging.
    * @return {Promise<Object>} Commit result.
    */
  async commitTransaction(sessionId = null) {
    if (stryMutAct_9fa48("103740")) {
      {}
    } else {
      stryCov_9fa48("103740");
      if (stryMutAct_9fa48("103743") ? false : stryMutAct_9fa48("103742") ? true : stryMutAct_9fa48("103741") ? this.initialized : (stryCov_9fa48("103741", "103742", "103743"), !this.initialized)) {
        if (stryMutAct_9fa48("103744")) {
          {}
        } else {
          stryCov_9fa48("103744");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
      if (stryMutAct_9fa48("103746") ? false : stryMutAct_9fa48("103745") ? true : (stryCov_9fa48("103745", "103746"), this.preparedStateLostSessions.has(transactionSessionId))) {
        if (stryMutAct_9fa48("103747")) {
          {}
        } else {
          stryCov_9fa48("103747");
          return this.buildPrepareLostResponse(PARTITION_SERVICE_OPERATION.COMMIT, transactionSessionId);
        }
      }
      const transaction = stryMutAct_9fa48("103750") ? this.resolveActiveTransactionState(transactionSessionId) && this.resolvePreparedTransactionState(transactionSessionId) : stryMutAct_9fa48("103749") ? false : stryMutAct_9fa48("103748") ? true : (stryCov_9fa48("103748", "103749", "103750"), this.resolveActiveTransactionState(transactionSessionId) || this.resolvePreparedTransactionState(transactionSessionId));
      if (stryMutAct_9fa48("103753") ? false : stryMutAct_9fa48("103752") ? true : stryMutAct_9fa48("103751") ? transaction : (stryCov_9fa48("103751", "103752", "103753"), !transaction)) {
        if (stryMutAct_9fa48("103754")) {
          {}
        } else {
          stryCov_9fa48("103754");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
        }
      }
      const {
        sessionId: resolvedSessionId,
        state: transactionState
      } = transaction;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, stryMutAct_9fa48("103755") ? {} : (stryCov_9fa48("103755"), {
        partitionId: this.partitionId,
        sessionId: resolvedSessionId,
        operationCount: transactionState.operations.length
      }));
      try {
        if (stryMutAct_9fa48("103756")) {
          {}
        } else {
          stryCov_9fa48("103756");
          // Replicate transaction operations through Raft for durability
          const raftEntry = await this.replicateTransactionCommit(transactionState.operations, resolvedSessionId, transactionState.transactionEpoch); // Commit in SQLite
          this.db.exec(PARTITION_SERVICE_SQL.COMMIT);
          const duration = stryMutAct_9fa48("103757") ? Date.now() + transactionState.startTime : (stryCov_9fa48("103757"), Date.now() - transactionState.startTime);
          const operationCount = transactionState.operations.length; // Generate CDC events for all operations
          for (const op of transactionState.operations) {
            if (stryMutAct_9fa48("103758")) {
              {}
            } else {
              stryCov_9fa48("103758");
              await this.generateCDCEvent(op);
            }
          }
          if (stryMutAct_9fa48("103762") ? transactionState.writeSet.size <= NUM.ZERO : stryMutAct_9fa48("103761") ? transactionState.writeSet.size >= NUM.ZERO : stryMutAct_9fa48("103760") ? false : stryMutAct_9fa48("103759") ? true : (stryCov_9fa48("103759", "103760", "103761", "103762"), transactionState.writeSet.size > NUM.ZERO)) {
            if (stryMutAct_9fa48("103763")) {
              {}
            } else {
              stryCov_9fa48("103763");
              const committedAt = Date.now();
              for (const writeSetKey of transactionState.writeSet) {
                if (stryMutAct_9fa48("103764")) {
                  {}
                } else {
                  stryCov_9fa48("103764");
                  this.rowCommitEpoch.set(writeSetKey, Number.isFinite(transactionState.transactionEpoch) ? transactionState.transactionEpoch : committedAt);
                }
              }
              this.committedWriteLog.push(stryMutAct_9fa48("103765") ? {} : (stryCov_9fa48("103765"), {
                epoch: transactionState.transactionEpoch,
                writeSet: new Set(transactionState.writeSet),
                committedAt
              }));
              this.pruneCommittedWriteLog();
            }
          }
          this.activeTransactions.delete(resolvedSessionId);
          this.preparedTransactions.delete(resolvedSessionId);
          this.preparedStateLostSessions.delete(resolvedSessionId);
          this.syncLegacyTransactionAliases(); // Schedule size update
          this.scheduleSizeUpdate();
          return stryMutAct_9fa48("103766") ? {} : (stryCov_9fa48("103766"), {
            success: stryMutAct_9fa48("103767") ? false : (stryCov_9fa48("103767"), true),
            operation: PARTITION_SERVICE_OPERATION.COMMIT,
            partitionId: this.partitionId,
            committed: stryMutAct_9fa48("103768") ? false : (stryCov_9fa48("103768"), true),
            durationMs: duration,
            operationCount,
            raftLogIndex: stryMutAct_9fa48("103771") ? raftEntry?.index && null : stryMutAct_9fa48("103770") ? false : stryMutAct_9fa48("103769") ? true : (stryCov_9fa48("103769", "103770", "103771"), (stryMutAct_9fa48("103772") ? raftEntry.index : (stryCov_9fa48("103772"), raftEntry?.index)) || null),
            sessionId: resolvedSessionId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103773")) {
          {}
        } else {
          stryCov_9fa48("103773");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.COMMIT_TRANSACTION_FAILED, stryMutAct_9fa48("103774") ? {} : (stryCov_9fa48("103774"), {
            partitionId: this.partitionId,
            sessionId: resolvedSessionId,
            error: error.message
          })); // Rollback on failure
          try {
            if (stryMutAct_9fa48("103775")) {
              {}
            } else {
              stryCov_9fa48("103775");
              this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
            }
          } catch (_rollbackErr) {// Ignore rollback errors
          }
          this.activeTransactions.delete(resolvedSessionId);
          this.preparedTransactions.delete(resolvedSessionId);
          this.syncLegacyTransactionAliases();
          throw error;
        }
      }
    }
  } /**
    * Rollback the active transaction.
    * @return {Promise<Object>} Rollback result.
    */
  async rollbackTransaction(sessionId = null) {
    if (stryMutAct_9fa48("103776")) {
      {}
    } else {
      stryCov_9fa48("103776");
      if (stryMutAct_9fa48("103779") ? false : stryMutAct_9fa48("103778") ? true : stryMutAct_9fa48("103777") ? this.initialized : (stryCov_9fa48("103777", "103778", "103779"), !this.initialized)) {
        if (stryMutAct_9fa48("103780")) {
          {}
        } else {
          stryCov_9fa48("103780");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
      if (stryMutAct_9fa48("103782") ? false : stryMutAct_9fa48("103781") ? true : (stryCov_9fa48("103781", "103782"), this.preparedStateLostSessions.has(transactionSessionId))) {
        if (stryMutAct_9fa48("103783")) {
          {}
        } else {
          stryCov_9fa48("103783");
          return this.buildPrepareLostResponse(PARTITION_SERVICE_OPERATION.ROLLBACK, transactionSessionId);
        }
      }
      const transaction = stryMutAct_9fa48("103786") ? this.resolveActiveTransactionState(transactionSessionId) && this.resolvePreparedTransactionState(transactionSessionId) : stryMutAct_9fa48("103785") ? false : stryMutAct_9fa48("103784") ? true : (stryCov_9fa48("103784", "103785", "103786"), this.resolveActiveTransactionState(transactionSessionId) || this.resolvePreparedTransactionState(transactionSessionId));
      if (stryMutAct_9fa48("103789") ? false : stryMutAct_9fa48("103788") ? true : stryMutAct_9fa48("103787") ? transaction : (stryCov_9fa48("103787", "103788", "103789"), !transaction)) {
        if (stryMutAct_9fa48("103790")) {
          {}
        } else {
          stryCov_9fa48("103790");
          return stryMutAct_9fa48("103791") ? {} : (stryCov_9fa48("103791"), {
            success: stryMutAct_9fa48("103792") ? false : (stryCov_9fa48("103792"), true),
            operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
            partitionId: this.partitionId,
            rolledBack: stryMutAct_9fa48("103793") ? false : (stryCov_9fa48("103793"), true),
            idempotent: stryMutAct_9fa48("103794") ? false : (stryCov_9fa48("103794"), true),
            sessionId: transactionSessionId
          });
        }
      }
      const {
        sessionId: resolvedSessionId,
        state: transactionState
      } = transaction;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, stryMutAct_9fa48("103795") ? {} : (stryCov_9fa48("103795"), {
        partitionId: this.partitionId,
        sessionId: resolvedSessionId,
        operationCount: transactionState.operations.length
      }));
      try {
        if (stryMutAct_9fa48("103796")) {
          {}
        } else {
          stryCov_9fa48("103796");
          const raftEntry = await this.replicateTransactionRollback(resolvedSessionId, transactionState.transactionEpoch); // Rollback in SQLite - this reverts all changes
          this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
          const duration = stryMutAct_9fa48("103797") ? Date.now() + transactionState.startTime : (stryCov_9fa48("103797"), Date.now() - transactionState.startTime);
          const operationCount = transactionState.operations.length; // Clear transaction state
          this.activeTransactions.delete(resolvedSessionId);
          this.preparedTransactions.delete(resolvedSessionId);
          this.preparedStateLostSessions.delete(resolvedSessionId);
          this.syncLegacyTransactionAliases();
          return stryMutAct_9fa48("103798") ? {} : (stryCov_9fa48("103798"), {
            success: stryMutAct_9fa48("103799") ? false : (stryCov_9fa48("103799"), true),
            operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
            partitionId: this.partitionId,
            rolledBack: stryMutAct_9fa48("103800") ? false : (stryCov_9fa48("103800"), true),
            durationMs: duration,
            operationCount,
            sessionId: resolvedSessionId,
            raftLogIndex: stryMutAct_9fa48("103803") ? raftEntry?.index && null : stryMutAct_9fa48("103802") ? false : stryMutAct_9fa48("103801") ? true : (stryCov_9fa48("103801", "103802", "103803"), (stryMutAct_9fa48("103804") ? raftEntry.index : (stryCov_9fa48("103804"), raftEntry?.index)) || null)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103805")) {
          {}
        } else {
          stryCov_9fa48("103805");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED, stryMutAct_9fa48("103806") ? {} : (stryCov_9fa48("103806"), {
            partitionId: this.partitionId,
            sessionId: resolvedSessionId,
            error: error.message
          })); // Clear transaction state anyway
          this.activeTransactions.delete(resolvedSessionId);
          this.preparedTransactions.delete(resolvedSessionId);
          this.syncLegacyTransactionAliases();
          throw error;
        }
      }
    }
  } /**
    * Check if a transaction is active.
    * @return {boolean} True if transaction is active.
    */
  isInTransaction() {
    if (stryMutAct_9fa48("103807")) {
      {}
    } else {
      stryCov_9fa48("103807");
      return stryMutAct_9fa48("103810") ? this.activeTransactions.size > NUM.ZERO && this.preparedTransactions.size > NUM.ZERO : stryMutAct_9fa48("103809") ? false : stryMutAct_9fa48("103808") ? true : (stryCov_9fa48("103808", "103809", "103810"), (stryMutAct_9fa48("103813") ? this.activeTransactions.size <= NUM.ZERO : stryMutAct_9fa48("103812") ? this.activeTransactions.size >= NUM.ZERO : stryMutAct_9fa48("103811") ? false : (stryCov_9fa48("103811", "103812", "103813"), this.activeTransactions.size > NUM.ZERO)) || (stryMutAct_9fa48("103816") ? this.preparedTransactions.size <= NUM.ZERO : stryMutAct_9fa48("103815") ? this.preparedTransactions.size >= NUM.ZERO : stryMutAct_9fa48("103814") ? false : (stryCov_9fa48("103814", "103815", "103816"), this.preparedTransactions.size > NUM.ZERO)));
    }
  } /**
    * Replicate transaction commit through Raft for durability.
    * @return {Promise<Object>} Raft log entry.
    * @private
    */
  async replicateTransactionCommit(operations = stryMutAct_9fa48("103817") ? ["Stryker was here"] : (stryCov_9fa48("103817"), []), sessionId = null, transactionEpoch = null) {
    if (stryMutAct_9fa48("103818")) {
      {}
    } else {
      stryCov_9fa48("103818");
      const timestamp = this.hlcClock.now();
      const entry = stryMutAct_9fa48("103819") ? {} : (stryCov_9fa48("103819"), {
        type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
        sessionId,
        transactionEpoch,
        operations: Array.isArray(operations) ? operations : stryMutAct_9fa48("103820") ? ["Stryker was here"] : (stryCov_9fa48("103820"), []),
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      }); // Append to Raft log
      const logEntry = this.storage.appendEntry(entry); // Replicate to followers via liferaft if we're the active raft leader.
      // Requirements: 11.9
      const isLiferaftLeader = stryMutAct_9fa48("103823") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("103822") ? false : stryMutAct_9fa48("103821") ? true : (stryCov_9fa48("103821", "103822", "103823"), this.raft && (stryMutAct_9fa48("103825") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("103824") ? true : (stryCov_9fa48("103824", "103825"), this.raft.state === LifeRaft.LEADER)));
      if (stryMutAct_9fa48("103827") ? false : stryMutAct_9fa48("103826") ? true : (stryCov_9fa48("103826", "103827"), isLiferaftLeader)) {
        if (stryMutAct_9fa48("103828")) {
          {}
        } else {
          stryCov_9fa48("103828");
          this.raftProvider.propose(this.raft, entry, err => {
            if (stryMutAct_9fa48("103829")) {
              {}
            } else {
              stryCov_9fa48("103829");
              if (stryMutAct_9fa48("103831") ? false : stryMutAct_9fa48("103830") ? true : (stryCov_9fa48("103830", "103831"), err)) {
                if (stryMutAct_9fa48("103832")) {
                  {}
                } else {
                  stryCov_9fa48("103832");
                  this.logger.debug(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_COMMIT_RAFT_FAILED, stryMutAct_9fa48("103833") ? {} : (stryCov_9fa48("103833"), {
                    partitionId: this.partitionId,
                    error: err.message
                  }));
                }
              }
            }
          });
        }
      }
      return logEntry;
    }
  } /**
    * Replicate one transaction rollback marker through Raft.
    * @param {string} sessionId - Transaction session ID.
    * @param {number|null} transactionEpoch - Transaction snapshot epoch.
    * @return {Promise<Object>} Raft log entry.
    * @private
    */
  async replicateTransactionRollback(sessionId = null, transactionEpoch = null) {
    if (stryMutAct_9fa48("103834")) {
      {}
    } else {
      stryCov_9fa48("103834");
      const timestamp = this.hlcClock.now();
      const entry = stryMutAct_9fa48("103835") ? {} : (stryCov_9fa48("103835"), {
        type: PARTITION_SERVICE_OPERATION.ROLLBACK,
        sessionId,
        transactionEpoch,
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      });
      const logEntry = this.storage.appendEntry(entry);
      const isLiferaftLeader = stryMutAct_9fa48("103838") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("103837") ? false : stryMutAct_9fa48("103836") ? true : (stryCov_9fa48("103836", "103837", "103838"), this.raft && (stryMutAct_9fa48("103840") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("103839") ? true : (stryCov_9fa48("103839", "103840"), this.raft.state === LifeRaft.LEADER)));
      if (stryMutAct_9fa48("103842") ? false : stryMutAct_9fa48("103841") ? true : (stryCov_9fa48("103841", "103842"), isLiferaftLeader)) {
        if (stryMutAct_9fa48("103843")) {
          {}
        } else {
          stryCov_9fa48("103843");
          this.raftProvider.propose(this.raft, entry, err => {
            if (stryMutAct_9fa48("103844")) {
              {}
            } else {
              stryCov_9fa48("103844");
              if (stryMutAct_9fa48("103846") ? false : stryMutAct_9fa48("103845") ? true : (stryCov_9fa48("103845", "103846"), err)) {
                if (stryMutAct_9fa48("103847")) {
                  {}
                } else {
                  stryCov_9fa48("103847");
                  this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, stryMutAct_9fa48("103848") ? {} : (stryCov_9fa48("103848"), {
                    partitionId: this.partitionId,
                    error: err.message
                  }));
                }
              }
            }
          });
        }
      }
      return logEntry;
    }
  } /**
    * Replicate prepared transaction state through Raft for durability.
    * @param {string} sessionId - Transaction session ID.
    * @param {Object} transactionState - Active transaction state.
    * @return {Promise<Object>} Raft log entry.
    * @private
    */
  async replicatePreparedTransaction(sessionId, transactionState) {
    if (stryMutAct_9fa48("103849")) {
      {}
    } else {
      stryCov_9fa48("103849");
      const timestamp = this.hlcClock.now();
      const entry = stryMutAct_9fa48("103850") ? {} : (stryCov_9fa48("103850"), {
        type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        sessionId,
        epoch: transactionState.transactionEpoch,
        writeSet: stryMutAct_9fa48("103851") ? [] : (stryCov_9fa48("103851"), [...transactionState.writeSet]),
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      });
      const logEntry = this.storage.appendEntry(entry);
      const isLiferaftLeader = stryMutAct_9fa48("103854") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("103853") ? false : stryMutAct_9fa48("103852") ? true : (stryCov_9fa48("103852", "103853", "103854"), this.raft && (stryMutAct_9fa48("103856") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("103855") ? true : (stryCov_9fa48("103855", "103856"), this.raft.state === LifeRaft.LEADER)));
      if (stryMutAct_9fa48("103858") ? false : stryMutAct_9fa48("103857") ? true : (stryCov_9fa48("103857", "103858"), isLiferaftLeader)) {
        if (stryMutAct_9fa48("103859")) {
          {}
        } else {
          stryCov_9fa48("103859");
          this.raftProvider.propose(this.raft, entry, err => {
            if (stryMutAct_9fa48("103860")) {
              {}
            } else {
              stryCov_9fa48("103860");
              if (stryMutAct_9fa48("103862") ? false : stryMutAct_9fa48("103861") ? true : (stryCov_9fa48("103861", "103862"), err)) {
                if (stryMutAct_9fa48("103863")) {
                  {}
                } else {
                  stryCov_9fa48("103863");
                  this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, stryMutAct_9fa48("103864") ? {} : (stryCov_9fa48("103864"), {
                    partitionId: this.partitionId,
                    error: err.message
                  }));
                }
              }
            }
          });
        }
      }
      return logEntry;
    }
  } /**
    * Execute a SQL query on this partition.
    * @param {string} sql - SQL query string.
    * @param {Array} params - Query parameters.
    * @return {Promise<Object>} Query result.
    */
  async executeQuery(sql, params = stryMutAct_9fa48("103865") ? ["Stryker was here"] : (stryCov_9fa48("103865"), []), options = {}) {
    if (stryMutAct_9fa48("103866")) {
      {}
    } else {
      stryCov_9fa48("103866");
      if (stryMutAct_9fa48("103869") ? false : stryMutAct_9fa48("103868") ? true : stryMutAct_9fa48("103867") ? this.initialized : (stryCov_9fa48("103867", "103868", "103869"), !this.initialized)) {
        if (stryMutAct_9fa48("103870")) {
          {}
        } else {
          stryCov_9fa48("103870");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("103871") ? {} : (stryCov_9fa48("103871"), {
        partitionId: this.partitionId,
        sql: stryMutAct_9fa48("103872") ? sql : (stryCov_9fa48("103872"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS))
      }));
      try {
        if (stryMutAct_9fa48("103873")) {
          {}
        } else {
          stryCov_9fa48("103873");
          const stmt = this.db.prepare(sql);
          const isSelect = stryMutAct_9fa48("103876") ? sql.toUpperCase().startsWith(SQL.SELECT) : stryMutAct_9fa48("103875") ? sql.trim().toLowerCase().startsWith(SQL.SELECT) : stryMutAct_9fa48("103874") ? sql.trim().toUpperCase().endsWith(SQL.SELECT) : (stryCov_9fa48("103874", "103875", "103876"), sql.trim().toUpperCase().startsWith(SQL.SELECT));
          if (stryMutAct_9fa48("103878") ? false : stryMutAct_9fa48("103877") ? true : (stryCov_9fa48("103877", "103878"), isSelect)) {
            if (stryMutAct_9fa48("103879")) {
              {}
            } else {
              stryCov_9fa48("103879");
              const sqliteStartMs = Date.now();
              const rows = stmt.all(...params);
              const transaction = this.resolveActiveTransactionState(stryMutAct_9fa48("103882") ? options.sessionId && null : stryMutAct_9fa48("103881") ? false : stryMutAct_9fa48("103880") ? true : (stryCov_9fa48("103880", "103881", "103882"), options.sessionId || null));
              const visibleRows = transaction ? this.applySnapshotReadFilter(rows, transaction.state) : rows;
              const durationMs = stryMutAct_9fa48("103883") ? Date.now() + sqliteStartMs : (stryCov_9fa48("103883"), Date.now() - sqliteStartMs);
              try {
                if (stryMutAct_9fa48("103884")) {
                  {}
                } else {
                  stryCov_9fa48("103884");
                  this.logger.info(METRICS_LOG_TAG.PARTITION_SQLITE, stryMutAct_9fa48("103885") ? {} : (stryCov_9fa48("103885"), {
                    partitionId: this.partitionId,
                    operation: PARTITION_SERVICE_LITERAL.SELECT,
                    durationMs,
                    rowCount: visibleRows.length
                  }));
                }
              } catch (_metricsErr) {// Metrics logging must not propagate to callers
              }
              return stryMutAct_9fa48("103886") ? {} : (stryCov_9fa48("103886"), {
                success: stryMutAct_9fa48("103887") ? false : (stryCov_9fa48("103887"), true),
                rows: visibleRows,
                count: visibleRows.length,
                partitionId: this.partitionId
              });
            }
          } else {
            if (stryMutAct_9fa48("103888")) {
              {}
            } else {
              stryCov_9fa48("103888");
              // Only reuse the transactional write path when this request resolves
              // to the active transaction session for the partition.
              const transaction = this.resolveActiveTransactionState(stryMutAct_9fa48("103891") ? options.sessionId && null : stryMutAct_9fa48("103890") ? false : stryMutAct_9fa48("103889") ? true : (stryCov_9fa48("103889", "103890", "103891"), options.sessionId || null));
              if (stryMutAct_9fa48("103893") ? false : stryMutAct_9fa48("103892") ? true : (stryCov_9fa48("103892", "103893"), transaction)) {
                if (stryMutAct_9fa48("103894")) {
                  {}
                } else {
                  stryCov_9fa48("103894");
                  return this.executeTransactionWrite(stryMutAct_9fa48("103895") ? {} : (stryCov_9fa48("103895"), {
                    type: PARTITION_SERVICE_OPERATION.QUERY,
                    sql,
                    params,
                    splitMirrorOrigin: stryMutAct_9fa48("103898") ? options.splitMirrorOrigin && null : stryMutAct_9fa48("103897") ? false : stryMutAct_9fa48("103896") ? true : (stryCov_9fa48("103896", "103897", "103898"), options.splitMirrorOrigin || null)
                  }), transaction.sessionId);
                }
              } // For write operations outside transaction, go through Raft
              return this.proposeWrite(stryMutAct_9fa48("103899") ? {} : (stryCov_9fa48("103899"), {
                type: PARTITION_SERVICE_OPERATION.QUERY,
                sql,
                params,
                splitMirrorOrigin: stryMutAct_9fa48("103902") ? options.splitMirrorOrigin && null : stryMutAct_9fa48("103901") ? false : stryMutAct_9fa48("103900") ? true : (stryCov_9fa48("103900", "103901", "103902"), options.splitMirrorOrigin || null)
              }));
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("103903")) {
          {}
        } else {
          stryCov_9fa48("103903");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, stryMutAct_9fa48("103904") ? {} : (stryCov_9fa48("103904"), {
            partitionId: this.partitionId,
            sql: stryMutAct_9fa48("103905") ? sql : (stryCov_9fa48("103905"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS)),
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Execute a SQL query directly on the local SQLite database.
    * Bootstrap-only helper: bypasses Raft and does not replicate.
    * @param {string} sql - SQL query string.
    * @param {Array} params - Query parameters.
    * @return {Promise<Object>} Query result.
    */
  async executeLocalQuery(sql, params = stryMutAct_9fa48("103906") ? ["Stryker was here"] : (stryCov_9fa48("103906"), [])) {
    if (stryMutAct_9fa48("103907")) {
      {}
    } else {
      stryCov_9fa48("103907");
      if (stryMutAct_9fa48("103910") ? false : stryMutAct_9fa48("103909") ? true : stryMutAct_9fa48("103908") ? this.initialized : (stryCov_9fa48("103908", "103909", "103910"), !this.initialized)) {
        if (stryMutAct_9fa48("103911")) {
          {}
        } else {
          stryCov_9fa48("103911");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("103912") ? {} : (stryCov_9fa48("103912"), {
        partitionId: this.partitionId,
        sql: stryMutAct_9fa48("103913") ? sql : (stryCov_9fa48("103913"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS)),
        bootstrap: stryMutAct_9fa48("103914") ? false : (stryCov_9fa48("103914"), true)
      }));
      try {
        if (stryMutAct_9fa48("103915")) {
          {}
        } else {
          stryCov_9fa48("103915");
          const stmt = this.db.prepare(sql);
          const isSelect = stryMutAct_9fa48("103918") ? sql.toUpperCase().startsWith(SQL.SELECT) : stryMutAct_9fa48("103917") ? sql.trim().toLowerCase().startsWith(SQL.SELECT) : stryMutAct_9fa48("103916") ? sql.trim().toUpperCase().endsWith(SQL.SELECT) : (stryCov_9fa48("103916", "103917", "103918"), sql.trim().toUpperCase().startsWith(SQL.SELECT));
          if (stryMutAct_9fa48("103920") ? false : stryMutAct_9fa48("103919") ? true : (stryCov_9fa48("103919", "103920"), isSelect)) {
            if (stryMutAct_9fa48("103921")) {
              {}
            } else {
              stryCov_9fa48("103921");
              const rows = stmt.all(...params);
              return stryMutAct_9fa48("103922") ? {} : (stryCov_9fa48("103922"), {
                success: stryMutAct_9fa48("103923") ? false : (stryCov_9fa48("103923"), true),
                rows,
                count: rows.length,
                partitionId: this.partitionId
              });
            }
          }
          const info = stmt.run(...params);
          this.scheduleSizeUpdate();
          return stryMutAct_9fa48("103924") ? {} : (stryCov_9fa48("103924"), {
            success: stryMutAct_9fa48("103925") ? false : (stryCov_9fa48("103925"), true),
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid,
            partitionId: this.partitionId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103926")) {
          {}
        } else {
          stryCov_9fa48("103926");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, stryMutAct_9fa48("103927") ? {} : (stryCov_9fa48("103927"), {
            partitionId: this.partitionId,
            sql: stryMutAct_9fa48("103928") ? sql : (stryCov_9fa48("103928"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS)),
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Execute a write operation within an active transaction.
    * @param {Object} operation - Write operation.
    * @param {string|null} sessionId - Transaction session ID.
    * @return {Promise<Object>} Operation result.
    * @private
    */
  async executeTransactionWrite(operation, sessionId = null) {
    if (stryMutAct_9fa48("103929")) {
      {}
    } else {
      stryCov_9fa48("103929");
      const transaction = this.resolveActiveTransactionState(sessionId);
      if (stryMutAct_9fa48("103932") ? false : stryMutAct_9fa48("103931") ? true : stryMutAct_9fa48("103930") ? transaction : (stryCov_9fa48("103930", "103931", "103932"), !transaction)) {
        if (stryMutAct_9fa48("103933")) {
          {}
        } else {
          stryCov_9fa48("103933");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
        }
      }
      const {
        sessionId: transactionSessionId,
        state: transactionState
      } = transaction;
      const timestamp = this.hlcClock.now();
      const entry = stryMutAct_9fa48("103934") ? {} : (stryCov_9fa48("103934"), {
        ...operation,
        sessionId: transactionSessionId,
        entryId: stryMutAct_9fa48("103937") ? operation.entryId && randomUUID() : stryMutAct_9fa48("103936") ? false : stryMutAct_9fa48("103935") ? true : (stryCov_9fa48("103935", "103936", "103937"), operation.entryId || randomUUID()),
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      });
      try {
        if (stryMutAct_9fa48("103938")) {
          {}
        } else {
          stryCov_9fa48("103938");
          const stmt = this.db.prepare(entry.sql);
          const info = stmt.run(...(stryMutAct_9fa48("103941") ? entry.params && [] : stryMutAct_9fa48("103940") ? false : stryMutAct_9fa48("103939") ? true : (stryCov_9fa48("103939", "103940", "103941"), entry.params || (stryMutAct_9fa48("103942") ? ["Stryker was here"] : (stryCov_9fa48("103942"), []))))); // Track operation for later CDC generation and Raft replication
          const trackedEntry = stryMutAct_9fa48("103943") ? {} : (stryCov_9fa48("103943"), {
            ...entry,
            changes: info.changes
          });
          transactionState.operations.push(trackedEntry);
          this.trackTransactionWriteSetKey(transactionState, trackedEntry);
          this.syncLegacyTransactionAliases();
          return stryMutAct_9fa48("103944") ? {} : (stryCov_9fa48("103944"), {
            success: stryMutAct_9fa48("103945") ? false : (stryCov_9fa48("103945"), true),
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid,
            partitionId: this.partitionId,
            inTransaction: stryMutAct_9fa48("103946") ? false : (stryCov_9fa48("103946"), true),
            sessionId: transactionSessionId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("103947")) {
          {}
        } else {
          stryCov_9fa48("103947");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_WRITE_FAILED, stryMutAct_9fa48("103948") ? {} : (stryCov_9fa48("103948"), {
            partitionId: this.partitionId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Insert data into the partition.
    * @param {string} tableName - Table name.
    * @param {Object} data - Data to insert.
    * @return {Promise<Object>} Insert result.
    */
  async insertData(tableName, data, options) {
    if (stryMutAct_9fa48("103949")) {
      {}
    } else {
      stryCov_9fa48("103949");
      if (stryMutAct_9fa48("103952") ? false : stryMutAct_9fa48("103951") ? true : stryMutAct_9fa48("103950") ? this.initialized : (stryCov_9fa48("103950", "103951", "103952"), !this.initialized)) {
        if (stryMutAct_9fa48("103953")) {
          {}
        } else {
          stryCov_9fa48("103953");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(stryMutAct_9fa48("103954") ? () => undefined : (stryCov_9fa48("103954"), () => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const sql = (stryMutAct_9fa48("103955") ? `` : (stryCov_9fa48("103955"), `${SQL.INSERT_INTO} ${tableName} `)) + (stryMutAct_9fa48("103956") ? `` : (stryCov_9fa48("103956"), `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) `)) + (stryMutAct_9fa48("103957") ? `` : (stryCov_9fa48("103957"), `${SQL.VALUES} (${placeholders})`));
      return this.proposeWrite(stryMutAct_9fa48("103958") ? {} : (stryCov_9fa48("103958"), {
        type: PARTITION_SERVICE_OPERATION.INSERT,
        tableName,
        data,
        sql,
        params: values
      }), options);
    }
  } /**
    * Update data in the partition.
    * @param {string} tableName - Table name.
    * @param {Object} whereClause - WHERE clause conditions.
    * @param {Object} data - Data to update.
    * @return {Promise<Object>} Update result.
    */
  async updateData(tableName, whereClause, data, options) {
    if (stryMutAct_9fa48("103959")) {
      {}
    } else {
      stryCov_9fa48("103959");
      if (stryMutAct_9fa48("103962") ? false : stryMutAct_9fa48("103961") ? true : stryMutAct_9fa48("103960") ? this.initialized : (stryCov_9fa48("103960", "103961", "103962"), !this.initialized)) {
        if (stryMutAct_9fa48("103963")) {
          {}
        } else {
          stryCov_9fa48("103963");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const setClauses = Object.keys(data).map(stryMutAct_9fa48("103964") ? () => undefined : (stryCov_9fa48("103964"), k => stryMutAct_9fa48("103965") ? `` : (stryCov_9fa48("103965"), `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`))).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const whereClauses = Object.keys(whereClause).map(stryMutAct_9fa48("103966") ? () => undefined : (stryCov_9fa48("103966"), k => stryMutAct_9fa48("103967") ? `` : (stryCov_9fa48("103967"), `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`))).join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
      const sql = (stryMutAct_9fa48("103968") ? `` : (stryCov_9fa48("103968"), `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClauses} `)) + (stryMutAct_9fa48("103969") ? `` : (stryCov_9fa48("103969"), `${SQL.WHERE} ${whereClauses}`));
      const params = stryMutAct_9fa48("103970") ? [] : (stryCov_9fa48("103970"), [...Object.values(data), ...Object.values(whereClause)]);
      return this.proposeWrite(stryMutAct_9fa48("103971") ? {} : (stryCov_9fa48("103971"), {
        type: PARTITION_SERVICE_OPERATION.UPDATE,
        tableName,
        data,
        whereClause,
        sql,
        params
      }), options);
    }
  } /**
    * Delete data from the partition.
    * @param {string} tableName - Table name.
    * @param {Object} whereClause - WHERE clause conditions.
    * @return {Promise<Object>} Delete result.
    */
  async deleteData(tableName, whereClause, options) {
    if (stryMutAct_9fa48("103972")) {
      {}
    } else {
      stryCov_9fa48("103972");
      if (stryMutAct_9fa48("103975") ? false : stryMutAct_9fa48("103974") ? true : stryMutAct_9fa48("103973") ? this.initialized : (stryCov_9fa48("103973", "103974", "103975"), !this.initialized)) {
        if (stryMutAct_9fa48("103976")) {
          {}
        } else {
          stryCov_9fa48("103976");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const whereClauses = Object.keys(whereClause).map(stryMutAct_9fa48("103977") ? () => undefined : (stryCov_9fa48("103977"), k => stryMutAct_9fa48("103978") ? `` : (stryCov_9fa48("103978"), `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`))).join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
      const sql = stryMutAct_9fa48("103979") ? `` : (stryCov_9fa48("103979"), `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClauses}`);
      const params = Object.values(whereClause);
      return this.proposeWrite(stryMutAct_9fa48("103980") ? {} : (stryCov_9fa48("103980"), {
        type: PARTITION_SERVICE_OPERATION.DELETE,
        tableName,
        whereClause,
        sql,
        params
      }), options);
    }
  } /**
    * Upsert data in the partition (insert or replace on conflict).
    * @param {string} tableName - Table name.
    * @param {Object} data - Data to upsert.
    * @return {Promise<Object>} Upsert result.
    */
  async upsertData(tableName, data, options) {
    if (stryMutAct_9fa48("103981")) {
      {}
    } else {
      stryCov_9fa48("103981");
      if (stryMutAct_9fa48("103984") ? false : stryMutAct_9fa48("103983") ? true : stryMutAct_9fa48("103982") ? this.initialized : (stryCov_9fa48("103982", "103983", "103984"), !this.initialized)) {
        if (stryMutAct_9fa48("103985")) {
          {}
        } else {
          stryCov_9fa48("103985");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(stryMutAct_9fa48("103986") ? () => undefined : (stryCov_9fa48("103986"), () => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const sql = (stryMutAct_9fa48("103987") ? `` : (stryCov_9fa48("103987"), `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} `)) + (stryMutAct_9fa48("103988") ? `` : (stryCov_9fa48("103988"), `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) `)) + (stryMutAct_9fa48("103989") ? `` : (stryCov_9fa48("103989"), `${SQL.VALUES} (${placeholders})`));
      return this.proposeWrite(stryMutAct_9fa48("103990") ? {} : (stryCov_9fa48("103990"), {
        type: PARTITION_SERVICE_OPERATION.UPSERT,
        tableName,
        data,
        sql,
        params: values
      }), options);
    }
  } /**
    * Resolve write-correlation identifiers for metrics payloads.
    * @param {Object} entry - Write entry.
    * @return {Object}
    * @private
    */
  resolveWriteMetricCorrelation(entry) {
    if (stryMutAct_9fa48("103991")) {
      {}
    } else {
      stryCov_9fa48("103991");
      const requestId = this.normalizeMetricIdentifier(stryMutAct_9fa48("103994") ? entry?.requestId && entry?.request_id : stryMutAct_9fa48("103993") ? false : stryMutAct_9fa48("103992") ? true : (stryCov_9fa48("103992", "103993", "103994"), (stryMutAct_9fa48("103995") ? entry.requestId : (stryCov_9fa48("103995"), entry?.requestId)) || (stryMutAct_9fa48("103996") ? entry.request_id : (stryCov_9fa48("103996"), entry?.request_id))));
      const correlationId = this.normalizeMetricIdentifier(stryMutAct_9fa48("103999") ? entry?.correlationId && entry?.correlation_id : stryMutAct_9fa48("103998") ? false : stryMutAct_9fa48("103997") ? true : (stryCov_9fa48("103997", "103998", "103999"), (stryMutAct_9fa48("104000") ? entry.correlationId : (stryCov_9fa48("104000"), entry?.correlationId)) || (stryMutAct_9fa48("104001") ? entry.correlation_id : (stryCov_9fa48("104001"), entry?.correlation_id))));
      const operationId = stryMutAct_9fa48("104004") ? (this.normalizeMetricIdentifier(entry?.operationId || entry?.operation_id || entry?.id) || requestId || correlationId) && this.partitionId + ':' + this.replicaId + ':' + String(entry?.proposedAt || Date.now()) : stryMutAct_9fa48("104003") ? false : stryMutAct_9fa48("104002") ? true : (stryCov_9fa48("104002", "104003", "104004"), (stryMutAct_9fa48("104006") ? (this.normalizeMetricIdentifier(entry?.operationId || entry?.operation_id || entry?.id) || requestId) && correlationId : stryMutAct_9fa48("104005") ? false : (stryCov_9fa48("104005", "104006"), (stryMutAct_9fa48("104008") ? this.normalizeMetricIdentifier(entry?.operationId || entry?.operation_id || entry?.id) && requestId : stryMutAct_9fa48("104007") ? false : (stryCov_9fa48("104007", "104008"), this.normalizeMetricIdentifier(stryMutAct_9fa48("104011") ? (entry?.operationId || entry?.operation_id) && entry?.id : stryMutAct_9fa48("104010") ? false : stryMutAct_9fa48("104009") ? true : (stryCov_9fa48("104009", "104010", "104011"), (stryMutAct_9fa48("104013") ? entry?.operationId && entry?.operation_id : stryMutAct_9fa48("104012") ? false : (stryCov_9fa48("104012", "104013"), (stryMutAct_9fa48("104014") ? entry.operationId : (stryCov_9fa48("104014"), entry?.operationId)) || (stryMutAct_9fa48("104015") ? entry.operation_id : (stryCov_9fa48("104015"), entry?.operation_id)))) || (stryMutAct_9fa48("104016") ? entry.id : (stryCov_9fa48("104016"), entry?.id)))) || requestId)) || correlationId)) || this.partitionId + (stryMutAct_9fa48("104017") ? "" : (stryCov_9fa48("104017"), ':')) + this.replicaId + (stryMutAct_9fa48("104018") ? "" : (stryCov_9fa48("104018"), ':')) + String(stryMutAct_9fa48("104021") ? entry?.proposedAt && Date.now() : stryMutAct_9fa48("104020") ? false : stryMutAct_9fa48("104019") ? true : (stryCov_9fa48("104019", "104020", "104021"), (stryMutAct_9fa48("104022") ? entry.proposedAt : (stryCov_9fa48("104022"), entry?.proposedAt)) || Date.now())));
      return stryMutAct_9fa48("104023") ? {} : (stryCov_9fa48("104023"), {
        operationId,
        requestId,
        correlationId: stryMutAct_9fa48("104026") ? (correlationId || requestId) && operationId : stryMutAct_9fa48("104025") ? false : stryMutAct_9fa48("104024") ? true : (stryCov_9fa48("104024", "104025", "104026"), (stryMutAct_9fa48("104028") ? correlationId && requestId : stryMutAct_9fa48("104027") ? false : (stryCov_9fa48("104027", "104028"), correlationId || requestId)) || operationId)
      });
    }
  } /**
    * Normalize identifier-like values for metric payload fields.
    * @param {*} value - Candidate value.
    * @return {string|null}
    * @private
    */
  normalizeMetricIdentifier(value) {
    if (stryMutAct_9fa48("104029")) {
      {}
    } else {
      stryCov_9fa48("104029");
      if (stryMutAct_9fa48("104032") ? value === null && value === undefined : stryMutAct_9fa48("104031") ? false : stryMutAct_9fa48("104030") ? true : (stryCov_9fa48("104030", "104031", "104032"), (stryMutAct_9fa48("104034") ? value !== null : stryMutAct_9fa48("104033") ? false : (stryCov_9fa48("104033", "104034"), value === null)) || (stryMutAct_9fa48("104036") ? value !== undefined : stryMutAct_9fa48("104035") ? false : (stryCov_9fa48("104035", "104036"), value === undefined)))) {
        if (stryMutAct_9fa48("104037")) {
          {}
        } else {
          stryCov_9fa48("104037");
          return null;
        }
      }
      const normalized = stryMutAct_9fa48("104038") ? String(value) : (stryCov_9fa48("104038"), String(value).trim());
      return (stryMutAct_9fa48("104042") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("104041") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("104040") ? false : stryMutAct_9fa48("104039") ? true : (stryCov_9fa48("104039", "104040", "104041", "104042"), normalized.length > NUM.ZERO)) ? normalized : null;
    }
  } /**
    * Record a write phase timing duration.
    * @param {Object|null} phaseTimings - Target phase timing object.
    * @param {string} field - Phase field name.
    * @param {number} startedAtMs - Phase start timestamp.
    * @private
    */
  recordWritePhaseDuration(phaseTimings, field, startedAtMs) {
    if (stryMutAct_9fa48("104043")) {
      {}
    } else {
      stryCov_9fa48("104043");
      if (stryMutAct_9fa48("104046") ? !phaseTimings && !Number.isFinite(startedAtMs) : stryMutAct_9fa48("104045") ? false : stryMutAct_9fa48("104044") ? true : (stryCov_9fa48("104044", "104045", "104046"), (stryMutAct_9fa48("104047") ? phaseTimings : (stryCov_9fa48("104047"), !phaseTimings)) || (stryMutAct_9fa48("104048") ? Number.isFinite(startedAtMs) : (stryCov_9fa48("104048"), !Number.isFinite(startedAtMs))))) {
        if (stryMutAct_9fa48("104049")) {
          {}
        } else {
          stryCov_9fa48("104049");
          return;
        }
      }
      const durationMs = stryMutAct_9fa48("104050") ? Math.min(NUM.ZERO, Date.now() - startedAtMs) : (stryCov_9fa48("104050"), Math.max(NUM.ZERO, stryMutAct_9fa48("104051") ? Date.now() + startedAtMs : (stryCov_9fa48("104051"), Date.now() - startedAtMs)));
      phaseTimings[field] = durationMs;
    }
  } /**
    * Merge baseline and measured write phase timings for metric payloads.
    * @param {Object} phaseTimings - Measured phase timings.
    * @param {number} totalDurationMs - End-to-end write duration.
    * @param {number} entryBuildMs - Entry-construction duration.
    * @return {Object}
    * @private
    */
  buildWritePhaseTimingPayload(phaseTimings, totalDurationMs, entryBuildMs) {
    if (stryMutAct_9fa48("104052")) {
      {}
    } else {
      stryCov_9fa48("104052");
      return stryMutAct_9fa48("104053") ? {} : (stryCov_9fa48("104053"), {
        [WRITE_PHASE_FIELD_ENTRY_BUILD_MS]: entryBuildMs,
        [WRITE_PHASE_FIELD_FORWARD_DELIVER_MS]: stryMutAct_9fa48("104056") ? phaseTimings?.[WRITE_PHASE_FIELD_FORWARD_DELIVER_MS] && NUM.ZERO : stryMutAct_9fa48("104055") ? false : stryMutAct_9fa48("104054") ? true : (stryCov_9fa48("104054", "104055", "104056"), (stryMutAct_9fa48("104057") ? phaseTimings[WRITE_PHASE_FIELD_FORWARD_DELIVER_MS] : (stryCov_9fa48("104057"), phaseTimings?.[WRITE_PHASE_FIELD_FORWARD_DELIVER_MS])) || NUM.ZERO),
        [WRITE_PHASE_FIELD_LOG_APPEND_MS]: stryMutAct_9fa48("104060") ? phaseTimings?.[WRITE_PHASE_FIELD_LOG_APPEND_MS] && NUM.ZERO : stryMutAct_9fa48("104059") ? false : stryMutAct_9fa48("104058") ? true : (stryCov_9fa48("104058", "104059", "104060"), (stryMutAct_9fa48("104061") ? phaseTimings[WRITE_PHASE_FIELD_LOG_APPEND_MS] : (stryCov_9fa48("104061"), phaseTimings?.[WRITE_PHASE_FIELD_LOG_APPEND_MS])) || NUM.ZERO),
        [WRITE_PHASE_FIELD_SQLITE_RUN_MS]: stryMutAct_9fa48("104064") ? phaseTimings?.[WRITE_PHASE_FIELD_SQLITE_RUN_MS] && NUM.ZERO : stryMutAct_9fa48("104063") ? false : stryMutAct_9fa48("104062") ? true : (stryCov_9fa48("104062", "104063", "104064"), (stryMutAct_9fa48("104065") ? phaseTimings[WRITE_PHASE_FIELD_SQLITE_RUN_MS] : (stryCov_9fa48("104065"), phaseTimings?.[WRITE_PHASE_FIELD_SQLITE_RUN_MS])) || NUM.ZERO),
        [WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS]: stryMutAct_9fa48("104068") ? phaseTimings?.[WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS] && NUM.ZERO : stryMutAct_9fa48("104067") ? false : stryMutAct_9fa48("104066") ? true : (stryCov_9fa48("104066", "104067", "104068"), (stryMutAct_9fa48("104069") ? phaseTimings[WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS] : (stryCov_9fa48("104069"), phaseTimings?.[WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS])) || NUM.ZERO),
        [WRITE_PHASE_FIELD_APPLY_WRITE_MS]: stryMutAct_9fa48("104072") ? phaseTimings?.[WRITE_PHASE_FIELD_APPLY_WRITE_MS] && NUM.ZERO : stryMutAct_9fa48("104071") ? false : stryMutAct_9fa48("104070") ? true : (stryCov_9fa48("104070", "104071", "104072"), (stryMutAct_9fa48("104073") ? phaseTimings[WRITE_PHASE_FIELD_APPLY_WRITE_MS] : (stryCov_9fa48("104073"), phaseTimings?.[WRITE_PHASE_FIELD_APPLY_WRITE_MS])) || NUM.ZERO),
        [WRITE_PHASE_FIELD_TOTAL_MS]: stryMutAct_9fa48("104074") ? Math.min(NUM.ZERO, totalDurationMs) : (stryCov_9fa48("104074"), Math.max(NUM.ZERO, totalDurationMs))
      });
    }
  } /**
    * Propose a write operation through Raft.
    * @param {Object} operation - Write operation.
    * @return {Promise<Object>} Operation result.
    * @private
    */
  async proposeWrite(operation, options) {
    if (stryMutAct_9fa48("104075")) {
      {}
    } else {
      stryCov_9fa48("104075");
      const proposeStartMs = Date.now();
      const timestamp = this.hlcClock.now();
      const entryBuildStartMs = Date.now();
      const entry = stryMutAct_9fa48("104076") ? {} : (stryCov_9fa48("104076"), {
        ...operation,
        entryId: stryMutAct_9fa48("104079") ? operation.entryId && randomUUID() : stryMutAct_9fa48("104078") ? false : stryMutAct_9fa48("104077") ? true : (stryCov_9fa48("104077", "104078", "104079"), operation.entryId || randomUUID()),
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      });
      const entryBuildMs = stryMutAct_9fa48("104080") ? Math.min(NUM.ZERO, Date.now() - entryBuildStartMs) : (stryCov_9fa48("104080"), Math.max(NUM.ZERO, stryMutAct_9fa48("104081") ? Date.now() + entryBuildStartMs : (stryCov_9fa48("104081"), Date.now() - entryBuildStartMs)));
      const correlation = this.resolveWriteMetricCorrelation(entry);
      const isLeader = stryMutAct_9fa48("104084") ? this.role !== RaftRole.LEADER : stryMutAct_9fa48("104083") ? false : stryMutAct_9fa48("104082") ? true : (stryCov_9fa48("104082", "104083", "104084"), this.role === RaftRole.LEADER); // If we're the leader, append and replicate
      if (stryMutAct_9fa48("104086") ? false : stryMutAct_9fa48("104085") ? true : (stryCov_9fa48("104085", "104086"), isLeader)) {
        if (stryMutAct_9fa48("104087")) {
          {}
        } else {
          stryCov_9fa48("104087");
          const phaseTimings = {};
          const result = await this.applyWrite(entry, phaseTimings);
          const durationMs = stryMutAct_9fa48("104088") ? Date.now() + proposeStartMs : (stryCov_9fa48("104088"), Date.now() - proposeStartMs);
          try {
            if (stryMutAct_9fa48("104089")) {
              {}
            } else {
              stryCov_9fa48("104089");
              this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, stryMutAct_9fa48("104090") ? {} : (stryCov_9fa48("104090"), {
                partitionId: this.partitionId,
                durationMs,
                isLeader: stryMutAct_9fa48("104091") ? false : (stryCov_9fa48("104091"), true),
                forwarded: stryMutAct_9fa48("104092") ? true : (stryCov_9fa48("104092"), false),
                operationId: correlation.operationId,
                requestId: correlation.requestId,
                correlationId: correlation.correlationId,
                acknowledged: stryMutAct_9fa48("104095") ? result?.success !== true : stryMutAct_9fa48("104094") ? false : stryMutAct_9fa48("104093") ? true : (stryCov_9fa48("104093", "104094", "104095"), (stryMutAct_9fa48("104096") ? result.success : (stryCov_9fa48("104096"), result?.success)) === (stryMutAct_9fa48("104097") ? false : (stryCov_9fa48("104097"), true))),
                error: (stryMutAct_9fa48("104100") ? result?.success !== true : stryMutAct_9fa48("104099") ? false : stryMutAct_9fa48("104098") ? true : (stryCov_9fa48("104098", "104099", "104100"), (stryMutAct_9fa48("104101") ? result.success : (stryCov_9fa48("104101"), result?.success)) === (stryMutAct_9fa48("104102") ? false : (stryCov_9fa48("104102"), true)))) ? null : stryMutAct_9fa48("104105") ? result?.error && null : stryMutAct_9fa48("104104") ? false : stryMutAct_9fa48("104103") ? true : (stryCov_9fa48("104103", "104104", "104105"), (stryMutAct_9fa48("104106") ? result.error : (stryCov_9fa48("104106"), result?.error)) || null),
                writePhaseTimingMs: this.buildWritePhaseTimingPayload(phaseTimings, durationMs, entryBuildMs)
              }));
            }
          } catch (_metricsErr) {// Metrics logging must not propagate to callers
          }
          this._attachCdcConfirmation(result, operation, options);
          return result;
        }
      } // If we're not the leader, forward to leader
      if (stryMutAct_9fa48("104109") ? this.leaderId || this.transport : stryMutAct_9fa48("104108") ? false : stryMutAct_9fa48("104107") ? true : (stryCov_9fa48("104107", "104108", "104109"), this.leaderId && this.transport)) {
        if (stryMutAct_9fa48("104110")) {
          {}
        } else {
          stryCov_9fa48("104110");
          const phaseTimings = {};
          const forwardDeliverStartMs = Date.now();
          try {
            if (stryMutAct_9fa48("104111")) {
              {}
            } else {
              stryCov_9fa48("104111");
              const leaderAddress = this.resolveLeaderAddress();
              if (stryMutAct_9fa48("104114") ? false : stryMutAct_9fa48("104113") ? true : stryMutAct_9fa48("104112") ? leaderAddress : (stryCov_9fa48("104112", "104113", "104114"), !leaderAddress)) {
                if (stryMutAct_9fa48("104115")) {
                  {}
                } else {
                  stryCov_9fa48("104115");
                  throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
                }
              }
              const result = await this.transport.deliver(leaderAddress, stryMutAct_9fa48("104116") ? {} : (stryCov_9fa48("104116"), {
                type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
                operation: entry,
                operationId: correlation.operationId,
                requestId: correlation.requestId,
                correlationId: correlation.correlationId
              }));
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_FORWARD_DELIVER_MS, forwardDeliverStartMs);
              const durationMs = stryMutAct_9fa48("104117") ? Date.now() + proposeStartMs : (stryCov_9fa48("104117"), Date.now() - proposeStartMs);
              try {
                if (stryMutAct_9fa48("104118")) {
                  {}
                } else {
                  stryCov_9fa48("104118");
                  this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, stryMutAct_9fa48("104119") ? {} : (stryCov_9fa48("104119"), {
                    partitionId: this.partitionId,
                    durationMs,
                    isLeader: stryMutAct_9fa48("104120") ? true : (stryCov_9fa48("104120"), false),
                    forwarded: stryMutAct_9fa48("104121") ? false : (stryCov_9fa48("104121"), true),
                    operationId: correlation.operationId,
                    requestId: correlation.requestId,
                    correlationId: correlation.correlationId,
                    acknowledged: stryMutAct_9fa48("104124") ? result?.acknowledged !== true : stryMutAct_9fa48("104123") ? false : stryMutAct_9fa48("104122") ? true : (stryCov_9fa48("104122", "104123", "104124"), (stryMutAct_9fa48("104125") ? result.acknowledged : (stryCov_9fa48("104125"), result?.acknowledged)) === (stryMutAct_9fa48("104126") ? false : (stryCov_9fa48("104126"), true))),
                    error: (stryMutAct_9fa48("104129") ? result?.acknowledged !== true : stryMutAct_9fa48("104128") ? false : stryMutAct_9fa48("104127") ? true : (stryCov_9fa48("104127", "104128", "104129"), (stryMutAct_9fa48("104130") ? result.acknowledged : (stryCov_9fa48("104130"), result?.acknowledged)) === (stryMutAct_9fa48("104131") ? false : (stryCov_9fa48("104131"), true)))) ? null : stryMutAct_9fa48("104134") ? result?.error && null : stryMutAct_9fa48("104133") ? false : stryMutAct_9fa48("104132") ? true : (stryCov_9fa48("104132", "104133", "104134"), (stryMutAct_9fa48("104135") ? result.error : (stryCov_9fa48("104135"), result?.error)) || null),
                    writePhaseTimingMs: this.buildWritePhaseTimingPayload(phaseTimings, durationMs, entryBuildMs)
                  }));
                }
              } catch (_metricsErr) {// Metrics logging must not propagate to callers
              }
              this._attachCdcConfirmation(result, operation, options);
              return result;
            }
          } catch (error) {
            if (stryMutAct_9fa48("104136")) {
              {}
            } else {
              stryCov_9fa48("104136");
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_FORWARD_DELIVER_MS, forwardDeliverStartMs);
              const durationMs = stryMutAct_9fa48("104137") ? Date.now() + proposeStartMs : (stryCov_9fa48("104137"), Date.now() - proposeStartMs);
              try {
                if (stryMutAct_9fa48("104138")) {
                  {}
                } else {
                  stryCov_9fa48("104138");
                  this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, stryMutAct_9fa48("104139") ? {} : (stryCov_9fa48("104139"), {
                    partitionId: this.partitionId,
                    durationMs,
                    isLeader: stryMutAct_9fa48("104140") ? true : (stryCov_9fa48("104140"), false),
                    forwarded: stryMutAct_9fa48("104141") ? false : (stryCov_9fa48("104141"), true),
                    operationId: correlation.operationId,
                    requestId: correlation.requestId,
                    correlationId: correlation.correlationId,
                    acknowledged: stryMutAct_9fa48("104142") ? true : (stryCov_9fa48("104142"), false),
                    error: stryMutAct_9fa48("104145") ? error?.message && null : stryMutAct_9fa48("104144") ? false : stryMutAct_9fa48("104143") ? true : (stryCov_9fa48("104143", "104144", "104145"), (stryMutAct_9fa48("104146") ? error.message : (stryCov_9fa48("104146"), error?.message)) || null),
                    writePhaseTimingMs: this.buildWritePhaseTimingPayload(phaseTimings, durationMs, entryBuildMs)
                  }));
                }
              } catch (_metricsErr) {// Metrics logging must not propagate to callers
              }
              throw new Error(PARTITION_SERVICE_ERROR_MSG.forwardWriteFailed(error.message));
            }
          }
        }
      }
      throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
    }
  } /**
    * Attach a CDC confirmation promise to the write result when the
    * caller requested awaitable CDC confirmation.
    *
    * @param {Object} result - Write result to augment.
    * @param {Object} operation - Write operation with tableName and data.
    * @param {Object} [options] - Write options.
    * @private
    */
  _attachCdcConfirmation(result, operation, options) {
    if (stryMutAct_9fa48("104147")) {
      {}
    } else {
      stryCov_9fa48("104147");
      if (stryMutAct_9fa48("104150") ? !options?.awaitCDCConfirmation && !this.cdcConfirmationTracker : stryMutAct_9fa48("104149") ? false : stryMutAct_9fa48("104148") ? true : (stryCov_9fa48("104148", "104149", "104150"), (stryMutAct_9fa48("104151") ? options?.awaitCDCConfirmation : (stryCov_9fa48("104151"), !(stryMutAct_9fa48("104152") ? options.awaitCDCConfirmation : (stryCov_9fa48("104152"), options?.awaitCDCConfirmation)))) || (stryMutAct_9fa48("104153") ? this.cdcConfirmationTracker : (stryCov_9fa48("104153"), !this.cdcConfirmationTracker)))) {
        if (stryMutAct_9fa48("104154")) {
          {}
        } else {
          stryCov_9fa48("104154");
          return;
        }
      }
      const tableName = stryMutAct_9fa48("104157") ? operation.tableName && this.tableName : stryMutAct_9fa48("104156") ? false : stryMutAct_9fa48("104155") ? true : (stryCov_9fa48("104155", "104156", "104157"), operation.tableName || this.tableName);
      const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName); // For UPDATE/DELETE the primary key lives in whereClause, not data.
      const whereClause = stryMutAct_9fa48("104160") ? operation.whereClause && {} : stryMutAct_9fa48("104159") ? false : stryMutAct_9fa48("104158") ? true : (stryCov_9fa48("104158", "104159", "104160"), operation.whereClause || {});
      const data = stryMutAct_9fa48("104163") ? operation.data && {} : stryMutAct_9fa48("104162") ? false : stryMutAct_9fa48("104161") ? true : (stryCov_9fa48("104161", "104162", "104163"), operation.data || {});
      const pkValue = stryMutAct_9fa48("104164") ? whereClause[pkField] && data[pkField] : (stryCov_9fa48("104164"), whereClause[pkField] ?? data[pkField]);
      if (stryMutAct_9fa48("104167") ? pkValue !== undefined || pkValue !== null : stryMutAct_9fa48("104166") ? false : stryMutAct_9fa48("104165") ? true : (stryCov_9fa48("104165", "104166", "104167"), (stryMutAct_9fa48("104169") ? pkValue === undefined : stryMutAct_9fa48("104168") ? true : (stryCov_9fa48("104168", "104169"), pkValue !== undefined)) && (stryMutAct_9fa48("104171") ? pkValue === null : stryMutAct_9fa48("104170") ? true : (stryCov_9fa48("104170", "104171"), pkValue !== null)))) {
        if (stryMutAct_9fa48("104172")) {
          {}
        } else {
          stryCov_9fa48("104172");
          result.cdcConfirmation = this.cdcConfirmationTracker.awaitConfirmation(tableName, pkValue);
        }
      }
    }
  } /**
    * Apply a write operation (leader only).
    * @param {Object} entry - Write entry.
    * @param {Object|null} phaseTimings - Optional phase timing collector.
    * @return {Promise<Object>} Operation result.
    * @private
    */
  async applyWrite(entry, phaseTimings = null) {
    if (stryMutAct_9fa48("104173")) {
      {}
    } else {
      stryCov_9fa48("104173");
      const applyStartMs = Date.now();
      entry = stryMutAct_9fa48("104174") ? {} : (stryCov_9fa48("104174"), {
        ...entry,
        entryId: stryMutAct_9fa48("104177") ? entry?.entryId && randomUUID() : stryMutAct_9fa48("104176") ? false : stryMutAct_9fa48("104175") ? true : (stryCov_9fa48("104175", "104176", "104177"), (stryMutAct_9fa48("104178") ? entry.entryId : (stryCov_9fa48("104178"), entry?.entryId)) || randomUUID())
      });
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLY_WRITE_CALLED, stryMutAct_9fa48("104179") ? {} : (stryCov_9fa48("104179"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        tableName: this.tableName,
        isLeader: this.isLeader,
        cdcSubscribers: this.cdcSubscribers.size,
        entryType: entry.type
      }));
      const entryKey = this.getCommittedEntryKey(entry); // Append to Raft log
      const logAppendStartMs = Date.now();
      const logEntry = this.storage.appendEntry(entry);
      this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_LOG_APPEND_MS, logAppendStartMs);
      const isMultiReplica = stryMutAct_9fa48("104182") ? Array.isArray(this.replicaIds) || this.replicaIds.length > NUM.ONE : stryMutAct_9fa48("104181") ? false : stryMutAct_9fa48("104180") ? true : (stryCov_9fa48("104180", "104181", "104182"), Array.isArray(this.replicaIds) && (stryMutAct_9fa48("104185") ? this.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("104184") ? this.replicaIds.length >= NUM.ONE : stryMutAct_9fa48("104183") ? true : (stryCov_9fa48("104183", "104184", "104185"), this.replicaIds.length > NUM.ONE)));
      const isLiferaftLeader = stryMutAct_9fa48("104188") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("104187") ? false : stryMutAct_9fa48("104186") ? true : (stryCov_9fa48("104186", "104187", "104188"), this.raft && (stryMutAct_9fa48("104190") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("104189") ? true : (stryCov_9fa48("104189", "104190"), this.raft.state === LifeRaft.LEADER)));
      let commitPromise = null;
      if (stryMutAct_9fa48("104192") ? false : stryMutAct_9fa48("104191") ? true : (stryCov_9fa48("104191", "104192"), isMultiReplica)) {
        if (stryMutAct_9fa48("104193")) {
          {}
        } else {
          stryCov_9fa48("104193");
          if (stryMutAct_9fa48("104196") ? false : stryMutAct_9fa48("104195") ? true : stryMutAct_9fa48("104194") ? isLiferaftLeader : (stryCov_9fa48("104194", "104195", "104196"), !isLiferaftLeader)) {
            if (stryMutAct_9fa48("104197")) {
              {}
            } else {
              stryCov_9fa48("104197");
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
              return stryMutAct_9fa48("104198") ? {} : (stryCov_9fa48("104198"), {
                success: stryMutAct_9fa48("104199") ? true : (stryCov_9fa48("104199"), false),
                error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
                partitionId: this.partitionId
              });
            }
          }
          try {
            if (stryMutAct_9fa48("104200")) {
              {}
            } else {
              stryCov_9fa48("104200");
              commitPromise = this.waitForCommittedWrite(entry.entryId, stryMutAct_9fa48("104201") ? {} : (stryCov_9fa48("104201"), {
                logIndex: logEntry.index
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("104202")) {
              {}
            } else {
              stryCov_9fa48("104202");
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
              return stryMutAct_9fa48("104203") ? {} : (stryCov_9fa48("104203"), {
                success: stryMutAct_9fa48("104204") ? true : (stryCov_9fa48("104204"), false),
                error: error.message,
                partitionId: this.partitionId
              });
            }
          }
          commitPromise.catch(() => {});
        }
      } // Execute the SQL
      let result;
      const sqliteRunStartMs = Date.now();
      try {
        if (stryMutAct_9fa48("104205")) {
          {}
        } else {
          stryCov_9fa48("104205");
          if (stryMutAct_9fa48("104208") ? entry.type !== PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE : stryMutAct_9fa48("104207") ? false : stryMutAct_9fa48("104206") ? true : (stryCov_9fa48("104206", "104207", "104208"), entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE)) {
            if (stryMutAct_9fa48("104209")) {
              {}
            } else {
              stryCov_9fa48("104209");
              this.registerMigrationDefaultFromAlterSql(entry.sql);
            }
          }
          const stmt = this.db.prepare(entry.sql);
          const info = stmt.run(...(stryMutAct_9fa48("104212") ? entry.params && [] : stryMutAct_9fa48("104211") ? false : stryMutAct_9fa48("104210") ? true : (stryCov_9fa48("104210", "104211", "104212"), entry.params || (stryMutAct_9fa48("104213") ? ["Stryker was here"] : (stryCov_9fa48("104213"), [])))));
          this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_SQLITE_RUN_MS, sqliteRunStartMs);
          result = stryMutAct_9fa48("104214") ? {} : (stryCov_9fa48("104214"), {
            success: stryMutAct_9fa48("104215") ? false : (stryCov_9fa48("104215"), true),
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid,
            partitionId: this.partitionId,
            logIndex: logEntry.index
          }); // The owner has already applied this write locally. Track the replay
          // key now so the later committed-entry callback does not emit duplicate
          // CDC for the same mutation.
          this.trackAppliedEntryKey(entryKey);
          if (stryMutAct_9fa48("104217") ? false : stryMutAct_9fa48("104216") ? true : (stryCov_9fa48("104216", "104217"), commitPromise)) {
            if (stryMutAct_9fa48("104218")) {
              {}
            } else {
              stryCov_9fa48("104218");
              this.setPendingCommittedWriteResult(entry.entryId, result);
            }
          } // Generate CDC event asynchronously to avoid blocking write acknowledgments.
          this.trackPendingCDCEvent(this.generateCDCEvent(stryMutAct_9fa48("104219") ? {} : (stryCov_9fa48("104219"), {
            ...entry,
            changes: info.changes
          })).catch(error => {
            if (stryMutAct_9fa48("104220")) {
              {}
            } else {
              stryCov_9fa48("104220");
              if (stryMutAct_9fa48("104222") ? false : stryMutAct_9fa48("104221") ? true : (stryCov_9fa48("104221", "104222"), this.isShutdown)) {
                if (stryMutAct_9fa48("104223")) {
                  {}
                } else {
                  stryCov_9fa48("104223");
                  return;
                }
              }
              this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, stryMutAct_9fa48("104224") ? {} : (stryCov_9fa48("104224"), {
                partitionId: this.partitionId,
                error: error.message
              }));
            }
          }));
          try {
            if (stryMutAct_9fa48("104225")) {
              {}
            } else {
              stryCov_9fa48("104225");
              await this.handleSplitReplicationAfterWrite(stryMutAct_9fa48("104226") ? {} : (stryCov_9fa48("104226"), {
                ...entry,
                changes: info.changes
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("104227")) {
              {}
            } else {
              stryCov_9fa48("104227");
              if (stryMutAct_9fa48("104229") ? false : stryMutAct_9fa48("104228") ? true : (stryCov_9fa48("104228", "104229"), commitPromise)) {
                if (stryMutAct_9fa48("104230")) {
                  {}
                } else {
                  stryCov_9fa48("104230");
                  this.rejectCommittedWrite(entry.entryId, error);
                }
              }
              throw error;
            }
          }
          if (stryMutAct_9fa48("104233") ? entry.type !== PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE : stryMutAct_9fa48("104232") ? false : stryMutAct_9fa48("104231") ? true : (stryCov_9fa48("104231", "104232", "104233"), entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE)) {
            if (stryMutAct_9fa48("104234")) {
              {}
            } else {
              stryCov_9fa48("104234");
              this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATION_ALTER_TABLE_APPLIED, stryMutAct_9fa48("104235") ? {} : (stryCov_9fa48("104235"), {
                partitionId: this.partitionId,
                tableName: this.tableName,
                migrationId: stryMutAct_9fa48("104238") ? entry.migrationId && null : stryMutAct_9fa48("104237") ? false : stryMutAct_9fa48("104236") ? true : (stryCov_9fa48("104236", "104237", "104238"), entry.migrationId || null)
              }));
            }
          } // Schedule size update
          this.scheduleSizeUpdate();
          this.requestManagedSplitEvaluationAfterWrite(entry);
        }
      } catch (error) {
        if (stryMutAct_9fa48("104239")) {
          {}
        } else {
          stryCov_9fa48("104239");
          this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_SQLITE_RUN_MS, sqliteRunStartMs);
          result = stryMutAct_9fa48("104240") ? {} : (stryCov_9fa48("104240"), {
            success: stryMutAct_9fa48("104241") ? true : (stryCov_9fa48("104241"), false),
            error: error.message,
            partitionId: this.partitionId
          });
          if (stryMutAct_9fa48("104243") ? false : stryMutAct_9fa48("104242") ? true : (stryCov_9fa48("104242", "104243"), commitPromise)) {
            if (stryMutAct_9fa48("104244")) {
              {}
            } else {
              stryCov_9fa48("104244");
              this.rejectCommittedWrite(entry.entryId, error);
            }
          }
        }
      }
      if (stryMutAct_9fa48("104247") ? false : stryMutAct_9fa48("104246") ? true : stryMutAct_9fa48("104245") ? result.success : (stryCov_9fa48("104245", "104246", "104247"), !result.success)) {
        if (stryMutAct_9fa48("104248")) {
          {}
        } else {
          stryCov_9fa48("104248");
          this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
          return result;
        }
      }
      if (stryMutAct_9fa48("104250") ? false : stryMutAct_9fa48("104249") ? true : (stryCov_9fa48("104249", "104250"), commitPromise)) {
        if (stryMutAct_9fa48("104251")) {
          {}
        } else {
          stryCov_9fa48("104251");
          const raftCommandDispatchStartMs = Date.now();
          try {
            if (stryMutAct_9fa48("104252")) {
              {}
            } else {
              stryCov_9fa48("104252");
              await this.raftProvider.propose(this.raft, entry);
            }
          } catch (error) {
            if (stryMutAct_9fa48("104253")) {
              {}
            } else {
              stryCov_9fa48("104253");
              this.rejectCommittedWrite(entry.entryId, error);
              this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, stryMutAct_9fa48("104254") ? {} : (stryCov_9fa48("104254"), {
                partitionId: this.partitionId,
                error: error.message
              }));
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS, raftCommandDispatchStartMs);
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
              return stryMutAct_9fa48("104255") ? {} : (stryCov_9fa48("104255"), {
                success: stryMutAct_9fa48("104256") ? true : (stryCov_9fa48("104256"), false),
                error: error.message,
                partitionId: this.partitionId
              });
            }
          }
          this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS, raftCommandDispatchStartMs);
          try {
            if (stryMutAct_9fa48("104257")) {
              {}
            } else {
              stryCov_9fa48("104257");
              const committedResult = await commitPromise;
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
              return committedResult;
            }
          } catch (error) {
            if (stryMutAct_9fa48("104258")) {
              {}
            } else {
              stryCov_9fa48("104258");
              this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
              return stryMutAct_9fa48("104259") ? {} : (stryCov_9fa48("104259"), {
                success: stryMutAct_9fa48("104260") ? true : (stryCov_9fa48("104260"), false),
                error: error.message,
                partitionId: this.partitionId,
                logIndex: logEntry.index
              });
            }
          }
        }
      }
      this.recordWritePhaseDuration(phaseTimings, WRITE_PHASE_FIELD_APPLY_WRITE_MS, applyStartMs);
      return result;
    }
  } /**
    * Generate a CDC event for a write operation.
    * @param {Object} entry - Write entry.
    * @return {Promise<void>}
    * @private
    */
  async generateCDCEvent(entry) {
    if (stryMutAct_9fa48("104261")) {
      {}
    } else {
      stryCov_9fa48("104261");
      if (stryMutAct_9fa48("104263") ? false : stryMutAct_9fa48("104262") ? true : (stryCov_9fa48("104262", "104263"), this.isShutdown)) {
        if (stryMutAct_9fa48("104264")) {
          {}
        } else {
          stryCov_9fa48("104264");
          return;
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, stryMutAct_9fa48("104265") ? {} : (stryCov_9fa48("104265"), {
        partitionId: this.partitionId,
        entryType: entry.type,
        sql: entry.sql ? stryMutAct_9fa48("104266") ? entry.sql : (stryCov_9fa48("104266"), entry.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT)) : null,
        subscriberCount: this.cdcSubscribers.size
      }));
      let operation;
      const entryType = this.resolveWriteMutationType(entry);
      if (stryMutAct_9fa48("104269") ? entry.type === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("104268") ? false : stryMutAct_9fa48("104267") ? true : (stryCov_9fa48("104267", "104268", "104269"), (stryMutAct_9fa48("104271") ? entry.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104270") ? true : (stryCov_9fa48("104270", "104271"), entry.type === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("104272")) {
          {}
        } else {
          stryCov_9fa48("104272");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.DETECTED_OPERATION_TYPE, stryMutAct_9fa48("104273") ? {} : (stryCov_9fa48("104273"), {
            originalType: entry.type,
            detectedType: entryType
          }));
        }
      }
      const hasChangeCount = stryMutAct_9fa48("104276") ? typeof entry.changes !== 'number' : stryMutAct_9fa48("104275") ? false : stryMutAct_9fa48("104274") ? true : (stryCov_9fa48("104274", "104275", "104276"), typeof entry.changes === (stryMutAct_9fa48("104277") ? "" : (stryCov_9fa48("104277"), 'number')));
      const isNoOpWrite = stryMutAct_9fa48("104280") ? hasChangeCount && entry.changes <= NUM.ZERO || entryType === PARTITION_SERVICE_OPERATION.UPDATE || entryType === PARTITION_SERVICE_OPERATION.DELETE || entryType === PARTITION_SERVICE_OPERATION.UPSERT || entryType === PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104279") ? false : stryMutAct_9fa48("104278") ? true : (stryCov_9fa48("104278", "104279", "104280"), (stryMutAct_9fa48("104282") ? hasChangeCount || entry.changes <= NUM.ZERO : stryMutAct_9fa48("104281") ? true : (stryCov_9fa48("104281", "104282"), hasChangeCount && (stryMutAct_9fa48("104285") ? entry.changes > NUM.ZERO : stryMutAct_9fa48("104284") ? entry.changes < NUM.ZERO : stryMutAct_9fa48("104283") ? true : (stryCov_9fa48("104283", "104284", "104285"), entry.changes <= NUM.ZERO)))) && (stryMutAct_9fa48("104287") ? (entryType === PARTITION_SERVICE_OPERATION.UPDATE || entryType === PARTITION_SERVICE_OPERATION.DELETE || entryType === PARTITION_SERVICE_OPERATION.UPSERT) && entryType === PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104286") ? true : (stryCov_9fa48("104286", "104287"), (stryMutAct_9fa48("104289") ? (entryType === PARTITION_SERVICE_OPERATION.UPDATE || entryType === PARTITION_SERVICE_OPERATION.DELETE) && entryType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("104288") ? false : (stryCov_9fa48("104288", "104289"), (stryMutAct_9fa48("104291") ? entryType === PARTITION_SERVICE_OPERATION.UPDATE && entryType === PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104290") ? false : (stryCov_9fa48("104290", "104291"), (stryMutAct_9fa48("104293") ? entryType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("104292") ? false : (stryCov_9fa48("104292", "104293"), entryType === PARTITION_SERVICE_OPERATION.UPDATE)) || (stryMutAct_9fa48("104295") ? entryType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104294") ? false : (stryCov_9fa48("104294", "104295"), entryType === PARTITION_SERVICE_OPERATION.DELETE)))) || (stryMutAct_9fa48("104297") ? entryType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("104296") ? false : (stryCov_9fa48("104296", "104297"), entryType === PARTITION_SERVICE_OPERATION.UPSERT)))) || (stryMutAct_9fa48("104299") ? entryType !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104298") ? false : (stryCov_9fa48("104298", "104299"), entryType === PARTITION_SERVICE_OPERATION.QUERY)))));
      if (stryMutAct_9fa48("104301") ? false : stryMutAct_9fa48("104300") ? true : (stryCov_9fa48("104300", "104301"), isNoOpWrite)) {
        if (stryMutAct_9fa48("104302")) {
          {}
        } else {
          stryCov_9fa48("104302");
          this.logger.debug(PARTITION_SERVICE_LITERAL.SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE, stryMutAct_9fa48("104303") ? {} : (stryCov_9fa48("104303"), {
            partitionId: this.partitionId,
            entryType,
            changes: entry.changes
          }));
          return;
        }
      }
      switch (entryType) {
        case PARTITION_SERVICE_OPERATION.INSERT:
          if (stryMutAct_9fa48("104304")) {} else {
            stryCov_9fa48("104304");
            operation = CDCOperation.INSERT;
            break;
          }
        case PARTITION_SERVICE_OPERATION.UPDATE:
          if (stryMutAct_9fa48("104305")) {} else {
            stryCov_9fa48("104305");
            operation = CDCOperation.UPDATE;
            break;
          }
        case PARTITION_SERVICE_OPERATION.UPSERT:
          if (stryMutAct_9fa48("104306")) {} else {
            stryCov_9fa48("104306");
            operation = CDCOperation.UPSERT;
            break;
          }
        case PARTITION_SERVICE_OPERATION.DELETE:
          if (stryMutAct_9fa48("104307")) {} else {
            stryCov_9fa48("104307");
            operation = CDCOperation.DELETE;
            break;
          }
        default:
          if (stryMutAct_9fa48("104308")) {} else {
            stryCov_9fa48("104308");
            this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_UNKNOWN_OPERATION, stryMutAct_9fa48("104309") ? {} : (stryCov_9fa48("104309"), {
              entryType,
              partitionId: this.partitionId
            }));
            return;
          }
        // No CDC for other operations
      } // For raw SQL queries, extract table name and data from SQL
      let tableName = stryMutAct_9fa48("104312") ? entry.tableName && this.tableName : stryMutAct_9fa48("104311") ? false : stryMutAct_9fa48("104310") ? true : (stryCov_9fa48("104310", "104311", "104312"), entry.tableName || this.tableName);
      if (stryMutAct_9fa48("104315") ? entry.type === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("104314") ? false : stryMutAct_9fa48("104313") ? true : (stryCov_9fa48("104313", "104314", "104315"), (stryMutAct_9fa48("104317") ? entry.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104316") ? true : (stryCov_9fa48("104316", "104317"), entry.type === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("104318")) {
          {}
        } else {
          stryCov_9fa48("104318");
          // Extract table name from SQL
          const tableMatch = entry.sql.match(stryMutAct_9fa48("104331") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\W+)/i : stryMutAct_9fa48("104330") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w)/i : stryMutAct_9fa48("104329") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\S+(\w+)/i : stryMutAct_9fa48("104328") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s(\w+)/i : stryMutAct_9fa48("104327") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\S+FROM)\s+(\w+)/i : stryMutAct_9fa48("104326") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\sFROM)\s+(\w+)/i : stryMutAct_9fa48("104325") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\S+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104324") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104323") ? /(?:UPDATE|INSERT\s+(?:OR\S+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104322") ? /(?:UPDATE|INSERT\s+(?:OR\s(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104321") ? /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104320") ? /(?:UPDATE|INSERT\S+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("104319") ? /(?:UPDATE|INSERT\s(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : (stryCov_9fa48("104319", "104320", "104321", "104322", "104323", "104324", "104325", "104326", "104327", "104328", "104329", "104330", "104331"), /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i));
          if (stryMutAct_9fa48("104333") ? false : stryMutAct_9fa48("104332") ? true : (stryCov_9fa48("104332", "104333"), tableMatch)) {
            if (stryMutAct_9fa48("104334")) {
              {}
            } else {
              stryCov_9fa48("104334");
              tableName = tableMatch[NUM.ONE];
              this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, stryMutAct_9fa48("104335") ? {} : (stryCov_9fa48("104335"), {
                tableName
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("104338") ? this.cdcSubscribers.size === NUM.ZERO || !this.shouldBufferCdcWithoutSubscribers(tableName) : stryMutAct_9fa48("104337") ? false : stryMutAct_9fa48("104336") ? true : (stryCov_9fa48("104336", "104337", "104338"), (stryMutAct_9fa48("104340") ? this.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("104339") ? true : (stryCov_9fa48("104339", "104340"), this.cdcSubscribers.size === NUM.ZERO)) && (stryMutAct_9fa48("104341") ? this.shouldBufferCdcWithoutSubscribers(tableName) : (stryCov_9fa48("104341"), !this.shouldBufferCdcWithoutSubscribers(tableName))))) {
        if (stryMutAct_9fa48("104342")) {
          {}
        } else {
          stryCov_9fa48("104342");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, stryMutAct_9fa48("104343") ? {} : (stryCov_9fa48("104343"), {
            partitionId: this.partitionId,
            tableName
          }));
          return;
        }
      }
      const isUpdateOperation = stryMutAct_9fa48("104346") ? entry.type === PARTITION_SERVICE_OPERATION.UPDATE && entryType === PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("104345") ? false : stryMutAct_9fa48("104344") ? true : (stryCov_9fa48("104344", "104345", "104346"), (stryMutAct_9fa48("104348") ? entry.type !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("104347") ? false : (stryCov_9fa48("104347", "104348"), entry.type === PARTITION_SERVICE_OPERATION.UPDATE)) || (stryMutAct_9fa48("104350") ? entryType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("104349") ? false : (stryCov_9fa48("104349", "104350"), entryType === PARTITION_SERVICE_OPERATION.UPDATE))); // For UPDATE operations, merge whereClause (contains primary key) with data
      // This ensures CDC events always include the primary key field
      // For DELETE operations, use whereClause as the data (contains primary key)
      let cdcData = stryMutAct_9fa48("104353") ? entry.data && {} : stryMutAct_9fa48("104352") ? false : stryMutAct_9fa48("104351") ? true : (stryCov_9fa48("104351", "104352", "104353"), entry.data || {});
      if (stryMutAct_9fa48("104356") ? isUpdateOperation || entry.whereClause : stryMutAct_9fa48("104355") ? false : stryMutAct_9fa48("104354") ? true : (stryCov_9fa48("104354", "104355", "104356"), isUpdateOperation && entry.whereClause)) {
        if (stryMutAct_9fa48("104357")) {
          {}
        } else {
          stryCov_9fa48("104357");
          cdcData = stryMutAct_9fa48("104358") ? {} : (stryCov_9fa48("104358"), {
            ...entry.whereClause,
            ...cdcData
          });
        }
      } else if (stryMutAct_9fa48("104361") ? entry.type === PARTITION_SERVICE_OPERATION.DELETE || entryType === PARTITION_SERVICE_OPERATION.DELETE || entry.whereClause : stryMutAct_9fa48("104360") ? false : stryMutAct_9fa48("104359") ? true : (stryCov_9fa48("104359", "104360", "104361"), (stryMutAct_9fa48("104363") ? entry.type === PARTITION_SERVICE_OPERATION.DELETE && entryType === PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104362") ? true : (stryCov_9fa48("104362", "104363"), (stryMutAct_9fa48("104365") ? entry.type !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104364") ? false : (stryCov_9fa48("104364", "104365"), entry.type === PARTITION_SERVICE_OPERATION.DELETE)) || (stryMutAct_9fa48("104367") ? entryType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104366") ? false : (stryCov_9fa48("104366", "104367"), entryType === PARTITION_SERVICE_OPERATION.DELETE)))) && entry.whereClause)) {
        if (stryMutAct_9fa48("104368")) {
          {}
        } else {
          stryCov_9fa48("104368");
          cdcData = stryMutAct_9fa48("104369") ? {} : (stryCov_9fa48("104369"), {
            ...entry.whereClause
          });
        }
      }
      if (stryMutAct_9fa48("104372") ? entry.type === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("104371") ? false : stryMutAct_9fa48("104370") ? true : (stryCov_9fa48("104370", "104371", "104372"), (stryMutAct_9fa48("104374") ? entry.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104373") ? true : (stryCov_9fa48("104373", "104374"), entry.type === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("104375")) {
          {}
        } else {
          stryCov_9fa48("104375");
          // For parameterized queries (SQL with ? placeholders), build data from params
          const hasParams = stryMutAct_9fa48("104378") ? entry.params || entry.params.length > NUM.ZERO : stryMutAct_9fa48("104377") ? false : stryMutAct_9fa48("104376") ? true : (stryCov_9fa48("104376", "104377", "104378"), entry.params && (stryMutAct_9fa48("104381") ? entry.params.length <= NUM.ZERO : stryMutAct_9fa48("104380") ? entry.params.length >= NUM.ZERO : stryMutAct_9fa48("104379") ? true : (stryCov_9fa48("104379", "104380", "104381"), entry.params.length > NUM.ZERO)));
          const hasPlaceholders = entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK);
          if (stryMutAct_9fa48("104384") ? hasParams && hasPlaceholders || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("104383") ? false : stryMutAct_9fa48("104382") ? true : (stryCov_9fa48("104382", "104383", "104384"), (stryMutAct_9fa48("104386") ? hasParams || hasPlaceholders : stryMutAct_9fa48("104385") ? true : (stryCov_9fa48("104385", "104386"), hasParams && hasPlaceholders)) && (stryMutAct_9fa48("104388") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("104387") ? true : (stryCov_9fa48("104387", "104388"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("104389")) {
              {}
            } else {
              stryCov_9fa48("104389");
              cdcData = this.extractDataFromParameterizedSQL(entry.sql, entry.params, tableName, entryType);
            }
          } // For INSERT queries without params, parse literal values from SQL
          if (stryMutAct_9fa48("104392") ? entryType === PARTITION_SERVICE_OPERATION.INSERT || entryType === PARTITION_SERVICE_OPERATION.UPSERT || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("104391") ? false : stryMutAct_9fa48("104390") ? true : (stryCov_9fa48("104390", "104391", "104392"), (stryMutAct_9fa48("104394") ? entryType === PARTITION_SERVICE_OPERATION.INSERT && entryType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("104393") ? true : (stryCov_9fa48("104393", "104394"), (stryMutAct_9fa48("104396") ? entryType !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("104395") ? false : (stryCov_9fa48("104395", "104396"), entryType === PARTITION_SERVICE_OPERATION.INSERT)) || (stryMutAct_9fa48("104398") ? entryType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("104397") ? false : (stryCov_9fa48("104397", "104398"), entryType === PARTITION_SERVICE_OPERATION.UPSERT)))) && (stryMutAct_9fa48("104400") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("104399") ? true : (stryCov_9fa48("104399", "104400"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("104401")) {
              {}
            } else {
              stryCov_9fa48("104401");
              cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
            }
          } // For UPDATE queries, try to extract the WHERE clause to query updated row
          if (stryMutAct_9fa48("104404") ? entryType === PARTITION_SERVICE_OPERATION.UPDATE || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("104403") ? false : stryMutAct_9fa48("104402") ? true : (stryCov_9fa48("104402", "104403", "104404"), (stryMutAct_9fa48("104406") ? entryType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("104405") ? true : (stryCov_9fa48("104405", "104406"), entryType === PARTITION_SERVICE_OPERATION.UPDATE)) && (stryMutAct_9fa48("104408") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("104407") ? true : (stryCov_9fa48("104407", "104408"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("104409")) {
              {}
            } else {
              stryCov_9fa48("104409");
              cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
            }
          } // For DELETE queries, extract the WHERE clause
          if (stryMutAct_9fa48("104412") ? entryType === PARTITION_SERVICE_OPERATION.DELETE || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("104411") ? false : stryMutAct_9fa48("104410") ? true : (stryCov_9fa48("104410", "104411", "104412"), (stryMutAct_9fa48("104414") ? entryType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("104413") ? true : (stryCov_9fa48("104413", "104414"), entryType === PARTITION_SERVICE_OPERATION.DELETE)) && (stryMutAct_9fa48("104416") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("104415") ? true : (stryCov_9fa48("104415", "104416"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("104417")) {
              {}
            } else {
              stryCov_9fa48("104417");
              cdcData = this.extractDeleteDataFromSQL(entry.sql);
            }
          }
        }
      }
      if (stryMutAct_9fa48("104420") ? isUpdateOperation || entry.whereClause : stryMutAct_9fa48("104419") ? false : stryMutAct_9fa48("104418") ? true : (stryCov_9fa48("104418", "104419", "104420"), isUpdateOperation && entry.whereClause)) {
        if (stryMutAct_9fa48("104421")) {
          {}
        } else {
          stryCov_9fa48("104421");
          const authoritativeRow = this.fetchUpdatedCDCRow(tableName, entry.whereClause);
          if (stryMutAct_9fa48("104423") ? false : stryMutAct_9fa48("104422") ? true : (stryCov_9fa48("104422", "104423"), authoritativeRow)) {
            if (stryMutAct_9fa48("104424")) {
              {}
            } else {
              stryCov_9fa48("104424");
              cdcData = authoritativeRow;
            }
          }
        }
      }
      const cdcEvent = stryMutAct_9fa48("104425") ? {} : (stryCov_9fa48("104425"), {
        tableName,
        operation,
        data: cdcData,
        timestamp: entry.timestamp,
        sourcePartition: this.partitionId,
        sourceReplica: this.replicaId,
        sequenceNumber: this.nextCDCEventSequenceNumber()
      });
      this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED); // Preserve event order after a transient delivery failure by queuing
      // newly generated events behind the buffered backlog.
      if (stryMutAct_9fa48("104428") ? this.cdcSubscribers.size > NUM.ZERO || this.cdcEventBuffer.hasEvents() : stryMutAct_9fa48("104427") ? false : stryMutAct_9fa48("104426") ? true : (stryCov_9fa48("104426", "104427", "104428"), (stryMutAct_9fa48("104431") ? this.cdcSubscribers.size <= NUM.ZERO : stryMutAct_9fa48("104430") ? this.cdcSubscribers.size >= NUM.ZERO : stryMutAct_9fa48("104429") ? true : (stryCov_9fa48("104429", "104430", "104431"), this.cdcSubscribers.size > NUM.ZERO)) && this.cdcEventBuffer.hasEvents())) {
        if (stryMutAct_9fa48("104432")) {
          {}
        } else {
          stryCov_9fa48("104432");
          this.bufferCDCEventForRetry(cdcEvent, PARTITION_SERVICE_LITERAL.BUFFERED_BACKLOG_PRESENT);
          return;
        }
      } // Buffer the event when no subscribers are registered
      if (stryMutAct_9fa48("104435") ? this.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("104434") ? false : stryMutAct_9fa48("104433") ? true : (stryCov_9fa48("104433", "104434", "104435"), this.cdcSubscribers.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("104436")) {
          {}
        } else {
          stryCov_9fa48("104436");
          if (stryMutAct_9fa48("104439") ? false : stryMutAct_9fa48("104438") ? true : stryMutAct_9fa48("104437") ? this.shouldBufferCdcWithoutSubscribers(tableName) : (stryCov_9fa48("104437", "104438", "104439"), !this.shouldBufferCdcWithoutSubscribers(tableName))) {
            if (stryMutAct_9fa48("104440")) {
              {}
            } else {
              stryCov_9fa48("104440");
              return;
            }
          }
          const buffered = this.cdcEventBuffer.buffer(cdcEvent);
          if (stryMutAct_9fa48("104442") ? false : stryMutAct_9fa48("104441") ? true : (stryCov_9fa48("104441", "104442"), buffered)) {
            if (stryMutAct_9fa48("104443")) {
              {}
            } else {
              stryCov_9fa48("104443");
              this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
              this.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_BUFFERED, stryMutAct_9fa48("104444") ? {} : (stryCov_9fa48("104444"), {
                tableName,
                operation,
                partitionId: this.partitionId
              }));
            }
          } else {
            if (stryMutAct_9fa48("104445")) {
              {}
            } else {
              stryCov_9fa48("104445");
              this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
              this.logger.warn(CDC_LIFECYCLE_LOG_MSG.NO_SUBSCRIBERS_NO_BUFFER, stryMutAct_9fa48("104446") ? {} : (stryCov_9fa48("104446"), {
                tableName,
                operation,
                partitionId: this.partitionId
              }));
            }
          }
          return;
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, stryMutAct_9fa48("104447") ? {} : (stryCov_9fa48("104447"), {
        partitionId: this.partitionId,
        operation,
        tableName: cdcEvent.tableName,
        dataKeys: Object.keys(cdcData),
        subscriberCount: this.cdcSubscribers.size
      })); // Deliver to subscribers — snapshot the set to avoid delivering
      // to subscribers added concurrently during async delivery.
      const subscriberSnapshot = stryMutAct_9fa48("104448") ? [] : (stryCov_9fa48("104448"), [...this.cdcSubscribers]);
      let deliveredCount = NUM.ZERO;
      let deliveryFailureCount = NUM.ZERO;
      for (const subscriber of subscriberSnapshot) {
        if (stryMutAct_9fa48("104449")) {
          {}
        } else {
          stryCov_9fa48("104449");
          try {
            if (stryMutAct_9fa48("104450")) {
              {}
            } else {
              stryCov_9fa48("104450");
              await this.deliverCDCEventToSubscriber(subscriber, cdcEvent);
              stryMutAct_9fa48("104451") ? deliveredCount-- : (stryCov_9fa48("104451"), deliveredCount++);
            }
          } catch (error) {
            if (stryMutAct_9fa48("104452")) {
              {}
            } else {
              stryCov_9fa48("104452");
              stryMutAct_9fa48("104453") ? deliveryFailureCount-- : (stryCov_9fa48("104453"), deliveryFailureCount++);
              this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
              this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, stryMutAct_9fa48("104454") ? {} : (stryCov_9fa48("104454"), {
                partitionId: this.partitionId,
                tableName: cdcEvent.tableName,
                operation: cdcEvent.operation,
                error: error.message
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("104458") ? deliveryFailureCount <= NUM.ZERO : stryMutAct_9fa48("104457") ? deliveryFailureCount >= NUM.ZERO : stryMutAct_9fa48("104456") ? false : stryMutAct_9fa48("104455") ? true : (stryCov_9fa48("104455", "104456", "104457", "104458"), deliveryFailureCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("104459")) {
          {}
        } else {
          stryCov_9fa48("104459");
          this.bufferCDCEventForRetry(cdcEvent, PARTITION_SERVICE_LITERAL.SUBSCRIBER_DELIVERY_FAILED);
          return;
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, stryMutAct_9fa48("104460") ? {} : (stryCov_9fa48("104460"), {
        partitionId: this.partitionId,
        deliveredCount,
        subscriberCount: this.cdcSubscribers.size
      }));
      this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
      this.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
    }
  } /**
    * Track fire-and-forget CDC delivery so shutdown can await it.
    * @param {Promise<*>} promise
    * @return {Promise<*>}
    */
  trackPendingCDCEvent(promise) {
    if (stryMutAct_9fa48("104461")) {
      {}
    } else {
      stryCov_9fa48("104461");
      if (stryMutAct_9fa48("104464") ? !promise && typeof promise.finally !== TYPEOF.FUNCTION : stryMutAct_9fa48("104463") ? false : stryMutAct_9fa48("104462") ? true : (stryCov_9fa48("104462", "104463", "104464"), (stryMutAct_9fa48("104465") ? promise : (stryCov_9fa48("104465"), !promise)) || (stryMutAct_9fa48("104467") ? typeof promise.finally === TYPEOF.FUNCTION : stryMutAct_9fa48("104466") ? false : (stryCov_9fa48("104466", "104467"), typeof promise.finally !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("104468")) {
          {}
        } else {
          stryCov_9fa48("104468");
          return promise;
        }
      }
      this.pendingCDCEventDeliveries.add(promise);
      promise.finally(() => {
        if (stryMutAct_9fa48("104469")) {
          {}
        } else {
          stryCov_9fa48("104469");
          this.pendingCDCEventDeliveries.delete(promise);
        }
      });
      return promise;
    }
  } /**
    * Resolve the canonical mutation type for one write entry.
    * Raw SQL queries are normalized to INSERT/UPDATE/DELETE/UPSERT when
    * possible so leader-local CDC and split-trigger paths agree on intent.
    * @param {Object} entry
    * @return {string|null}
    * @private
    */
  resolveWriteMutationType(entry) {
    if (stryMutAct_9fa48("104470")) {
      {}
    } else {
      stryCov_9fa48("104470");
      let entryType = stryMutAct_9fa48("104473") ? entry?.type && null : stryMutAct_9fa48("104472") ? false : stryMutAct_9fa48("104471") ? true : (stryCov_9fa48("104471", "104472", "104473"), (stryMutAct_9fa48("104474") ? entry.type : (stryCov_9fa48("104474"), entry?.type)) || null);
      if (stryMutAct_9fa48("104477") ? entryType === PARTITION_SERVICE_OPERATION.QUERY || typeof entry?.sql === TYPEOF.STRING : stryMutAct_9fa48("104476") ? false : stryMutAct_9fa48("104475") ? true : (stryCov_9fa48("104475", "104476", "104477"), (stryMutAct_9fa48("104479") ? entryType !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("104478") ? true : (stryCov_9fa48("104478", "104479"), entryType === PARTITION_SERVICE_OPERATION.QUERY)) && (stryMutAct_9fa48("104481") ? typeof entry?.sql !== TYPEOF.STRING : stryMutAct_9fa48("104480") ? true : (stryCov_9fa48("104480", "104481"), typeof (stryMutAct_9fa48("104482") ? entry.sql : (stryCov_9fa48("104482"), entry?.sql)) === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("104483")) {
          {}
        } else {
          stryCov_9fa48("104483");
          const sqlUpper = stryMutAct_9fa48("104485") ? entry.sql.toUpperCase() : stryMutAct_9fa48("104484") ? entry.sql.trim().toLowerCase() : (stryCov_9fa48("104484", "104485"), entry.sql.trim().toUpperCase());
          if (stryMutAct_9fa48("104488") ? sqlUpper.endsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase()) : stryMutAct_9fa48("104487") ? false : stryMutAct_9fa48("104486") ? true : (stryCov_9fa48("104486", "104487", "104488"), sqlUpper.startsWith(stryMutAct_9fa48("104489") ? SQL.INSERT_OR_REPLACE_INTO.toLowerCase() : (stryCov_9fa48("104489"), SQL.INSERT_OR_REPLACE_INTO.toUpperCase())))) {
            if (stryMutAct_9fa48("104490")) {
              {}
            } else {
              stryCov_9fa48("104490");
              entryType = PARTITION_SERVICE_OPERATION.UPSERT;
            }
          } else if (stryMutAct_9fa48("104493") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.INSERT) : stryMutAct_9fa48("104492") ? false : stryMutAct_9fa48("104491") ? true : (stryCov_9fa48("104491", "104492", "104493"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT))) {
            if (stryMutAct_9fa48("104494")) {
              {}
            } else {
              stryCov_9fa48("104494");
              entryType = PARTITION_SERVICE_OPERATION.INSERT;
            }
          } else if (stryMutAct_9fa48("104497") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.UPDATE) : stryMutAct_9fa48("104496") ? false : stryMutAct_9fa48("104495") ? true : (stryCov_9fa48("104495", "104496", "104497"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE))) {
            if (stryMutAct_9fa48("104498")) {
              {}
            } else {
              stryCov_9fa48("104498");
              entryType = PARTITION_SERVICE_OPERATION.UPDATE;
            }
          } else if (stryMutAct_9fa48("104501") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.DELETE) : stryMutAct_9fa48("104500") ? false : stryMutAct_9fa48("104499") ? true : (stryCov_9fa48("104499", "104500", "104501"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE))) {
            if (stryMutAct_9fa48("104502")) {
              {}
            } else {
              stryCov_9fa48("104502");
              entryType = PARTITION_SERVICE_OPERATION.DELETE;
            }
          }
        }
      }
      switch (entryType) {
        case PARTITION_SERVICE_OPERATION.INSERT:
        case PARTITION_SERVICE_OPERATION.UPDATE:
        case PARTITION_SERVICE_OPERATION.UPSERT:
        case PARTITION_SERVICE_OPERATION.DELETE:
          if (stryMutAct_9fa48("104503")) {} else {
            stryCov_9fa48("104503");
            return entryType;
          }
        default:
          if (stryMutAct_9fa48("104504")) {} else {
            stryCov_9fa48("104504");
            return null;
          }
      }
    }
  } /**
    * Request split evaluation from the canonical local owner after a
    * successful user-table write. Partition leaders own split signals because
    * only they can evaluate live traffic for their source partition.
    * @param {Object} entry
    * @return {void}
    * @private
    */
  requestManagedSplitEvaluationAfterWrite(entry) {
    if (stryMutAct_9fa48("104505")) {
      {}
    } else {
      stryCov_9fa48("104505");
      const splitManager = stryMutAct_9fa48("104508") ? this.sqlQueryEngine?.partitionSplitMergeManager && null : stryMutAct_9fa48("104507") ? false : stryMutAct_9fa48("104506") ? true : (stryCov_9fa48("104506", "104507", "104508"), (stryMutAct_9fa48("104509") ? this.sqlQueryEngine.partitionSplitMergeManager : (stryCov_9fa48("104509"), this.sqlQueryEngine?.partitionSplitMergeManager)) || null);
      if (stryMutAct_9fa48("104512") ? (!this.isLeader || !splitManager) && typeof splitManager.requestEvaluation !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("104511") ? false : stryMutAct_9fa48("104510") ? true : (stryCov_9fa48("104510", "104511", "104512"), (stryMutAct_9fa48("104514") ? !this.isLeader && !splitManager : stryMutAct_9fa48("104513") ? false : (stryCov_9fa48("104513", "104514"), (stryMutAct_9fa48("104515") ? this.isLeader : (stryCov_9fa48("104515"), !this.isLeader)) || (stryMutAct_9fa48("104516") ? splitManager : (stryCov_9fa48("104516"), !splitManager)))) || (stryMutAct_9fa48("104518") ? typeof splitManager.requestEvaluation === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("104517") ? false : (stryCov_9fa48("104517", "104518"), typeof splitManager.requestEvaluation !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("104519")) {
          {}
        } else {
          stryCov_9fa48("104519");
          return;
        }
      }
      if (stryMutAct_9fa48("104522") ? CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) && Object.values(SYSTEM_TABLE_NAME).includes(this.tableName) : stryMutAct_9fa48("104521") ? false : stryMutAct_9fa48("104520") ? true : (stryCov_9fa48("104520", "104521", "104522"), CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) || Object.values(SYSTEM_TABLE_NAME).includes(this.tableName))) {
        if (stryMutAct_9fa48("104523")) {
          {}
        } else {
          stryCov_9fa48("104523");
          return;
        }
      }
      if (stryMutAct_9fa48("104526") ? false : stryMutAct_9fa48("104525") ? true : stryMutAct_9fa48("104524") ? this.resolveWriteMutationType(entry) : (stryCov_9fa48("104524", "104525", "104526"), !this.resolveWriteMutationType(entry))) {
        if (stryMutAct_9fa48("104527")) {
          {}
        } else {
          stryCov_9fa48("104527");
          return;
        }
      }
      const nowMs = Date.now();
      if (stryMutAct_9fa48("104531") ? nowMs - this.lastManagedSplitWriteActivityAtMs >= this.managedSplitWriteActivityDebounceMs : stryMutAct_9fa48("104530") ? nowMs - this.lastManagedSplitWriteActivityAtMs <= this.managedSplitWriteActivityDebounceMs : stryMutAct_9fa48("104529") ? false : stryMutAct_9fa48("104528") ? true : (stryCov_9fa48("104528", "104529", "104530", "104531"), (stryMutAct_9fa48("104532") ? nowMs + this.lastManagedSplitWriteActivityAtMs : (stryCov_9fa48("104532"), nowMs - this.lastManagedSplitWriteActivityAtMs)) < this.managedSplitWriteActivityDebounceMs)) {
        if (stryMutAct_9fa48("104533")) {
          {}
        } else {
          stryCov_9fa48("104533");
          return;
        }
      }
      this.lastManagedSplitWriteActivityAtMs = nowMs;
      splitManager.requestEvaluation(stryMutAct_9fa48("104534") ? {} : (stryCov_9fa48("104534"), {
        reasonCode: PARTITION_SERVICE_LITERAL.WRITE_ACTIVITY,
        tableName: this.tableName,
        partitionId: this.partitionId,
        partitionIds: stryMutAct_9fa48("104535") ? [] : (stryCov_9fa48("104535"), [this.partitionId])
      }));
    }
  }
  waitForCommittedWrite(entryId, options = {}) {
    if (stryMutAct_9fa48("104536")) {
      {}
    } else {
      stryCov_9fa48("104536");
      if (stryMutAct_9fa48("104539") ? typeof entryId !== TYPEOF.STRING && entryId.length === NUM.ZERO : stryMutAct_9fa48("104538") ? false : stryMutAct_9fa48("104537") ? true : (stryCov_9fa48("104537", "104538", "104539"), (stryMutAct_9fa48("104541") ? typeof entryId === TYPEOF.STRING : stryMutAct_9fa48("104540") ? false : (stryCov_9fa48("104540", "104541"), typeof entryId !== TYPEOF.STRING)) || (stryMutAct_9fa48("104543") ? entryId.length !== NUM.ZERO : stryMutAct_9fa48("104542") ? false : (stryCov_9fa48("104542", "104543"), entryId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("104544")) {
          {}
        } else {
          stryCov_9fa48("104544");
          return Promise.reject(new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE));
        }
      }
      const timeoutMs = (stryMutAct_9fa48("104547") ? Number.isFinite(options?.timeoutMs) || options.timeoutMs > NUM.ZERO : stryMutAct_9fa48("104546") ? false : stryMutAct_9fa48("104545") ? true : (stryCov_9fa48("104545", "104546", "104547"), Number.isFinite(stryMutAct_9fa48("104548") ? options.timeoutMs : (stryCov_9fa48("104548"), options?.timeoutMs)) && (stryMutAct_9fa48("104551") ? options.timeoutMs <= NUM.ZERO : stryMutAct_9fa48("104550") ? options.timeoutMs >= NUM.ZERO : stryMutAct_9fa48("104549") ? true : (stryCov_9fa48("104549", "104550", "104551"), options.timeoutMs > NUM.ZERO)))) ? Math.floor(options.timeoutMs) : PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS;
      let resolvePending = null;
      let rejectPending = null;
      const commitPromise = new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("104552")) {
          {}
        } else {
          stryCov_9fa48("104552");
          resolvePending = resolve;
          rejectPending = reject;
        }
      });
      const timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("104553")) {
          {}
        } else {
          stryCov_9fa48("104553");
          this.rejectCommittedWrite(entryId, new Error(stryMutAct_9fa48("104554") ? `` : (stryCov_9fa48("104554"), `Raft write commit timed out after ${timeoutMs}ms`)));
        }
      }, timeoutMs);
      try {
        if (stryMutAct_9fa48("104555")) {
          {}
        } else {
          stryCov_9fa48("104555");
          this.proposalQueue.enqueue(entryId, stryMutAct_9fa48("104556") ? {} : (stryCov_9fa48("104556"), {
            resolve: resolvePending,
            reject: rejectPending,
            timeoutId,
            logIndex: Number.isFinite(stryMutAct_9fa48("104557") ? options.logIndex : (stryCov_9fa48("104557"), options?.logIndex)) ? options.logIndex : null,
            result: (stryMutAct_9fa48("104560") ? options?.result || typeof options.result === TYPEOF.OBJECT : stryMutAct_9fa48("104559") ? false : stryMutAct_9fa48("104558") ? true : (stryCov_9fa48("104558", "104559", "104560"), (stryMutAct_9fa48("104561") ? options.result : (stryCov_9fa48("104561"), options?.result)) && (stryMutAct_9fa48("104563") ? typeof options.result !== TYPEOF.OBJECT : stryMutAct_9fa48("104562") ? true : (stryCov_9fa48("104562", "104563"), typeof options.result === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("104564") ? {} : (stryCov_9fa48("104564"), {
              ...options.result
            }) : null
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("104565")) {
          {}
        } else {
          stryCov_9fa48("104565");
          clearTimeout(timeoutId);
          throw error;
        }
      }
      return commitPromise;
    }
  }
  setPendingCommittedWriteResult(entryId, result) {
    if (stryMutAct_9fa48("104566")) {
      {}
    } else {
      stryCov_9fa48("104566");
      const pending = this.proposalQueue.get(entryId);
      if (stryMutAct_9fa48("104569") ? false : stryMutAct_9fa48("104568") ? true : stryMutAct_9fa48("104567") ? pending : (stryCov_9fa48("104567", "104568", "104569"), !pending)) {
        if (stryMutAct_9fa48("104570")) {
          {}
        } else {
          stryCov_9fa48("104570");
          return stryMutAct_9fa48("104571") ? true : (stryCov_9fa48("104571"), false);
        }
      }
      pending.result = (stryMutAct_9fa48("104574") ? result || typeof result === TYPEOF.OBJECT : stryMutAct_9fa48("104573") ? false : stryMutAct_9fa48("104572") ? true : (stryCov_9fa48("104572", "104573", "104574"), result && (stryMutAct_9fa48("104576") ? typeof result !== TYPEOF.OBJECT : stryMutAct_9fa48("104575") ? true : (stryCov_9fa48("104575", "104576"), typeof result === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("104577") ? {} : (stryCov_9fa48("104577"), {
        ...result
      }) : null;
      return stryMutAct_9fa48("104578") ? false : (stryCov_9fa48("104578"), true);
    }
  }
  resolveCommittedWrite(entryId, result = null) {
    if (stryMutAct_9fa48("104579")) {
      {}
    } else {
      stryCov_9fa48("104579");
      const pending = this.proposalQueue.get(entryId);
      if (stryMutAct_9fa48("104582") ? false : stryMutAct_9fa48("104581") ? true : stryMutAct_9fa48("104580") ? pending : (stryCov_9fa48("104580", "104581", "104582"), !pending)) {
        if (stryMutAct_9fa48("104583")) {
          {}
        } else {
          stryCov_9fa48("104583");
          return stryMutAct_9fa48("104584") ? true : (stryCov_9fa48("104584"), false);
        }
      }
      const resolvedResult = stryMutAct_9fa48("104585") ? {} : (stryCov_9fa48("104585"), {
        ...((stryMutAct_9fa48("104588") ? pending.result || typeof pending.result === TYPEOF.OBJECT : stryMutAct_9fa48("104587") ? false : stryMutAct_9fa48("104586") ? true : (stryCov_9fa48("104586", "104587", "104588"), pending.result && (stryMutAct_9fa48("104590") ? typeof pending.result !== TYPEOF.OBJECT : stryMutAct_9fa48("104589") ? true : (stryCov_9fa48("104589", "104590"), typeof pending.result === TYPEOF.OBJECT)))) ? pending.result : {}),
        ...((stryMutAct_9fa48("104593") ? result || typeof result === TYPEOF.OBJECT : stryMutAct_9fa48("104592") ? false : stryMutAct_9fa48("104591") ? true : (stryCov_9fa48("104591", "104592", "104593"), result && (stryMutAct_9fa48("104595") ? typeof result !== TYPEOF.OBJECT : stryMutAct_9fa48("104594") ? true : (stryCov_9fa48("104594", "104595"), typeof result === TYPEOF.OBJECT)))) ? result : {})
      });
      if (stryMutAct_9fa48("104598") ? !Number.isFinite(resolvedResult.logIndex) || Number.isFinite(pending.logIndex) : stryMutAct_9fa48("104597") ? false : stryMutAct_9fa48("104596") ? true : (stryCov_9fa48("104596", "104597", "104598"), (stryMutAct_9fa48("104599") ? Number.isFinite(resolvedResult.logIndex) : (stryCov_9fa48("104599"), !Number.isFinite(resolvedResult.logIndex))) && Number.isFinite(pending.logIndex))) {
        if (stryMutAct_9fa48("104600")) {
          {}
        } else {
          stryCov_9fa48("104600");
          resolvedResult.logIndex = pending.logIndex;
        }
      }
      return this.proposalQueue.resolve(entryId, resolvedResult);
    }
  }
  rejectCommittedWrite(entryId, error) {
    if (stryMutAct_9fa48("104601")) {
      {}
    } else {
      stryCov_9fa48("104601");
      if (stryMutAct_9fa48("104604") ? typeof entryId !== TYPEOF.STRING && entryId.length === NUM.ZERO : stryMutAct_9fa48("104603") ? false : stryMutAct_9fa48("104602") ? true : (stryCov_9fa48("104602", "104603", "104604"), (stryMutAct_9fa48("104606") ? typeof entryId === TYPEOF.STRING : stryMutAct_9fa48("104605") ? false : (stryCov_9fa48("104605", "104606"), typeof entryId !== TYPEOF.STRING)) || (stryMutAct_9fa48("104608") ? entryId.length !== NUM.ZERO : stryMutAct_9fa48("104607") ? false : (stryCov_9fa48("104607", "104608"), entryId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("104609")) {
          {}
        } else {
          stryCov_9fa48("104609");
          return stryMutAct_9fa48("104610") ? true : (stryCov_9fa48("104610"), false);
        }
      }
      return this.proposalQueue.reject(entryId, error);
    }
  }
  clearPendingCommittedWrites(reason) {
    if (stryMutAct_9fa48("104611")) {
      {}
    } else {
      stryCov_9fa48("104611");
      this.proposalQueue.clear(reason);
    }
  } /**
    * Build a stable key for identifying a committed write entry replay.
    * @param {Object} command - Write command.
    * @return {string|null} Stable key or null when unavailable.
    * @private
    */
  getCommittedEntryKey(command) {
    if (stryMutAct_9fa48("104612")) {
      {}
    } else {
      stryCov_9fa48("104612");
      if (stryMutAct_9fa48("104615") ? !command && !command.sql : stryMutAct_9fa48("104614") ? false : stryMutAct_9fa48("104613") ? true : (stryCov_9fa48("104613", "104614", "104615"), (stryMutAct_9fa48("104616") ? command : (stryCov_9fa48("104616"), !command)) || (stryMutAct_9fa48("104617") ? command.sql : (stryCov_9fa48("104617"), !command.sql)))) {
        if (stryMutAct_9fa48("104618")) {
          {}
        } else {
          stryCov_9fa48("104618");
          return null;
        }
      }
      if (stryMutAct_9fa48("104620") ? false : stryMutAct_9fa48("104619") ? true : (stryCov_9fa48("104619", "104620"), command.entryId)) {
        if (stryMutAct_9fa48("104621")) {
          {}
        } else {
          stryCov_9fa48("104621");
          return stryMutAct_9fa48("104622") ? `` : (stryCov_9fa48("104622"), `entry:${command.entryId}`);
        }
      }
      const params = Array.isArray(command.params) ? JSON.stringify(command.params) : STRING.EMPTY;
      return (stryMutAct_9fa48("104623") ? [] : (stryCov_9fa48("104623"), [stryMutAct_9fa48("104626") ? command.proposedBy && STRING.EMPTY : stryMutAct_9fa48("104625") ? false : stryMutAct_9fa48("104624") ? true : (stryCov_9fa48("104624", "104625", "104626"), command.proposedBy || STRING.EMPTY), String(stryMutAct_9fa48("104629") ? command.proposedAt && NUM.ZERO : stryMutAct_9fa48("104628") ? false : stryMutAct_9fa48("104627") ? true : (stryCov_9fa48("104627", "104628", "104629"), command.proposedAt || NUM.ZERO)), stryMutAct_9fa48("104632") ? command.timestamp && STRING.EMPTY : stryMutAct_9fa48("104631") ? false : stryMutAct_9fa48("104630") ? true : (stryCov_9fa48("104630", "104631", "104632"), command.timestamp || STRING.EMPTY), command.sql, params])).join(PARTITION_SERVICE_LITERAL.VALUE);
    }
  } /**
    * Treat duplicate-key INSERT failures as idempotent replay.
    * Raft recovery can reapply previously-committed INSERT entries after restart.
    * @param {*} error
    * @param {Object} command
    * @return {boolean}
    * @private
    */
  isIdempotentInsertReplayConstraint(error, command) {
    if (stryMutAct_9fa48("104633")) {
      {}
    } else {
      stryCov_9fa48("104633");
      if (stryMutAct_9fa48("104636") ? !error && !command?.sql : stryMutAct_9fa48("104635") ? false : stryMutAct_9fa48("104634") ? true : (stryCov_9fa48("104634", "104635", "104636"), (stryMutAct_9fa48("104637") ? error : (stryCov_9fa48("104637"), !error)) || (stryMutAct_9fa48("104638") ? command?.sql : (stryCov_9fa48("104638"), !(stryMutAct_9fa48("104639") ? command.sql : (stryCov_9fa48("104639"), command?.sql)))))) {
        if (stryMutAct_9fa48("104640")) {
          {}
        } else {
          stryCov_9fa48("104640");
          return stryMutAct_9fa48("104641") ? true : (stryCov_9fa48("104641"), false);
        }
      }
      const sqlUpper = stryMutAct_9fa48("104643") ? String(command.sql).toUpperCase() : stryMutAct_9fa48("104642") ? String(command.sql).trim().toLowerCase() : (stryCov_9fa48("104642", "104643"), String(command.sql).trim().toUpperCase());
      const isInsertStatement = stryMutAct_9fa48("104646") ? (sqlUpper.startsWith(SQL.INSERT_INTO) || sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO)) && sqlUpper.startsWith(SQL.INSERT_OR_IGNORE_INTO) : stryMutAct_9fa48("104645") ? false : stryMutAct_9fa48("104644") ? true : (stryCov_9fa48("104644", "104645", "104646"), (stryMutAct_9fa48("104648") ? sqlUpper.startsWith(SQL.INSERT_INTO) && sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO) : stryMutAct_9fa48("104647") ? false : (stryCov_9fa48("104647", "104648"), (stryMutAct_9fa48("104649") ? sqlUpper.endsWith(SQL.INSERT_INTO) : (stryCov_9fa48("104649"), sqlUpper.startsWith(SQL.INSERT_INTO))) || (stryMutAct_9fa48("104650") ? sqlUpper.endsWith(SQL.INSERT_OR_REPLACE_INTO) : (stryCov_9fa48("104650"), sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO))))) || (stryMutAct_9fa48("104651") ? sqlUpper.endsWith(SQL.INSERT_OR_IGNORE_INTO) : (stryCov_9fa48("104651"), sqlUpper.startsWith(SQL.INSERT_OR_IGNORE_INTO))));
      if (stryMutAct_9fa48("104654") ? false : stryMutAct_9fa48("104653") ? true : stryMutAct_9fa48("104652") ? isInsertStatement : (stryCov_9fa48("104652", "104653", "104654"), !isInsertStatement)) {
        if (stryMutAct_9fa48("104655")) {
          {}
        } else {
          stryCov_9fa48("104655");
          return stryMutAct_9fa48("104656") ? true : (stryCov_9fa48("104656"), false);
        }
      }
      const code = stryMutAct_9fa48("104657") ? String(error.code || '').toLowerCase() : (stryCov_9fa48("104657"), String(stryMutAct_9fa48("104660") ? error.code && '' : stryMutAct_9fa48("104659") ? false : stryMutAct_9fa48("104658") ? true : (stryCov_9fa48("104658", "104659", "104660"), error.code || (stryMutAct_9fa48("104661") ? "Stryker was here!" : (stryCov_9fa48("104661"), '')))).toUpperCase());
      if (stryMutAct_9fa48("104664") ? code !== PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT_PRIMARYKEY : stryMutAct_9fa48("104663") ? false : stryMutAct_9fa48("104662") ? true : (stryCov_9fa48("104662", "104663", "104664"), code === PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT_PRIMARYKEY)) {
        if (stryMutAct_9fa48("104665")) {
          {}
        } else {
          stryCov_9fa48("104665");
          return stryMutAct_9fa48("104666") ? false : (stryCov_9fa48("104666"), true);
        }
      }
      if (stryMutAct_9fa48("104669") ? code.endsWith(PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT) : stryMutAct_9fa48("104668") ? false : stryMutAct_9fa48("104667") ? true : (stryCov_9fa48("104667", "104668", "104669"), code.startsWith(PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT))) {
        if (stryMutAct_9fa48("104670")) {
          {}
        } else {
          stryCov_9fa48("104670");
          const message = String(stryMutAct_9fa48("104673") ? error.message && '' : stryMutAct_9fa48("104672") ? false : stryMutAct_9fa48("104671") ? true : (stryCov_9fa48("104671", "104672", "104673"), error.message || (stryMutAct_9fa48("104674") ? "Stryker was here!" : (stryCov_9fa48("104674"), ''))));
          if (stryMutAct_9fa48("104677") ? message.toLowerCase().includes(PARTITION_SERVICE_LITERAL.UNIQUE_CONSTRAINT_FAILED) : stryMutAct_9fa48("104676") ? false : stryMutAct_9fa48("104675") ? true : (stryCov_9fa48("104675", "104676", "104677"), message.toUpperCase().includes(PARTITION_SERVICE_LITERAL.UNIQUE_CONSTRAINT_FAILED))) {
            if (stryMutAct_9fa48("104678")) {
              {}
            } else {
              stryCov_9fa48("104678");
              return stryMutAct_9fa48("104679") ? false : (stryCov_9fa48("104679"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("104680") ? true : (stryCov_9fa48("104680"), false);
    }
  } /**
    * Track an applied write key with bounded history for replay dedupe.
    * @param {string|null} entryKey - Stable write key.
    * @private
    */
  trackAppliedEntryKey(entryKey) {
    if (stryMutAct_9fa48("104681")) {
      {}
    } else {
      stryCov_9fa48("104681");
      if (stryMutAct_9fa48("104684") ? !entryKey && this.recentlyAppliedEntryKeys.has(entryKey) : stryMutAct_9fa48("104683") ? false : stryMutAct_9fa48("104682") ? true : (stryCov_9fa48("104682", "104683", "104684"), (stryMutAct_9fa48("104685") ? entryKey : (stryCov_9fa48("104685"), !entryKey)) || this.recentlyAppliedEntryKeys.has(entryKey))) {
        if (stryMutAct_9fa48("104686")) {
          {}
        } else {
          stryCov_9fa48("104686");
          return;
        }
      }
      this.recentlyAppliedEntryKeys.add(entryKey);
      this.recentlyAppliedEntryOrder.push(entryKey);
      if (stryMutAct_9fa48("104690") ? this.recentlyAppliedEntryOrder.length <= this.maxTrackedAppliedEntries : stryMutAct_9fa48("104689") ? this.recentlyAppliedEntryOrder.length >= this.maxTrackedAppliedEntries : stryMutAct_9fa48("104688") ? false : stryMutAct_9fa48("104687") ? true : (stryCov_9fa48("104687", "104688", "104689", "104690"), this.recentlyAppliedEntryOrder.length > this.maxTrackedAppliedEntries)) {
        if (stryMutAct_9fa48("104691")) {
          {}
        } else {
          stryCov_9fa48("104691");
          const oldestKey = this.recentlyAppliedEntryOrder.shift();
          if (stryMutAct_9fa48("104693") ? false : stryMutAct_9fa48("104692") ? true : (stryCov_9fa48("104692", "104693"), oldestKey)) {
            if (stryMutAct_9fa48("104694")) {
              {}
            } else {
              stryCov_9fa48("104694");
              this.recentlyAppliedEntryKeys.delete(oldestKey);
            }
          }
        }
      }
    }
  } /**
    * Extract data from INSERT SQL by querying the inserted row.
    * Delegates to partition-sql-parser.js.
    * @param {string} sql - INSERT SQL statement.
    * @param {string} tableName - Table name.
    * @return {Object} Extracted data or empty object.
    * @private
    */
  extractInsertDataFromSQL(sql, tableName) {
    if (stryMutAct_9fa48("104695")) {
      {}
    } else {
      stryCov_9fa48("104695");
      return extractInsertDataFromSQLImpl(sql, tableName, this.db, this.logger);
    }
  } /**
    * Extract data from UPDATE SQL by querying the updated row.
    * Delegates to partition-sql-parser.js.
    * @param {string} sql - UPDATE SQL statement.
    * @param {string} tableName - Table name.
    * @return {Object} Extracted data or empty object.
    * @private
    */
  extractUpdateDataFromSQL(sql, tableName) {
    if (stryMutAct_9fa48("104696")) {
      {}
    } else {
      stryCov_9fa48("104696");
      return extractUpdateDataFromSQLImpl(sql, tableName, this.db, this.logger);
    }
  } /**
    * Extract data from DELETE SQL.
    * Delegates to partition-sql-parser.js.
    * @param {string} sql - DELETE SQL statement.
    * @return {Object} Extracted data or empty object.
    * @private
    */
  extractDeleteDataFromSQL(sql) {
    if (stryMutAct_9fa48("104697")) {
      {}
    } else {
      stryCov_9fa48("104697");
      return extractDeleteDataFromSQLImpl(sql, this.logger);
    }
  } /**
    * Extract data from parameterized SQL.
    * Delegates to partition-sql-parser.js.
    * @param {string} sql - SQL statement with ? placeholders.
    * @param {Array} params - Parameter values.
    * @param {string} tableName - Table name.
    * @param {string} operationType - INSERT, UPDATE, or DELETE.
    * @return {Object} Extracted data or empty object.
    * @private
    */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    if (stryMutAct_9fa48("104698")) {
      {}
    } else {
      stryCov_9fa48("104698");
      return extractDataFromParameterizedSQLImpl(sql, params, tableName, operationType, this.logger);
    }
  } /**
    * Fetch the stored row after an UPDATE so CDC emits canonical data.
    * @param {string} tableName - Table name.
    * @param {Object} whereClause - WHERE clause values for the updated row.
    * @return {Object|null} Canonical row or null when unavailable.
    * @private
    */
  fetchUpdatedCDCRow(tableName, whereClause) {
    if (stryMutAct_9fa48("104699")) {
      {}
    } else {
      stryCov_9fa48("104699");
      if (stryMutAct_9fa48("104702") ? (!this.db || !whereClause || typeof whereClause !== PARTITION_SERVICE_LITERAL.OBJECT) && Object.keys(whereClause).length === NUM.ZERO : stryMutAct_9fa48("104701") ? false : stryMutAct_9fa48("104700") ? true : (stryCov_9fa48("104700", "104701", "104702"), (stryMutAct_9fa48("104704") ? (!this.db || !whereClause) && typeof whereClause !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("104703") ? false : (stryCov_9fa48("104703", "104704"), (stryMutAct_9fa48("104706") ? !this.db && !whereClause : stryMutAct_9fa48("104705") ? false : (stryCov_9fa48("104705", "104706"), (stryMutAct_9fa48("104707") ? this.db : (stryCov_9fa48("104707"), !this.db)) || (stryMutAct_9fa48("104708") ? whereClause : (stryCov_9fa48("104708"), !whereClause)))) || (stryMutAct_9fa48("104710") ? typeof whereClause === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("104709") ? false : (stryCov_9fa48("104709", "104710"), typeof whereClause !== PARTITION_SERVICE_LITERAL.OBJECT)))) || (stryMutAct_9fa48("104712") ? Object.keys(whereClause).length !== NUM.ZERO : stryMutAct_9fa48("104711") ? false : (stryCov_9fa48("104711", "104712"), Object.keys(whereClause).length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("104713")) {
          {}
        } else {
          stryCov_9fa48("104713");
          return null;
        }
      }
      const entries = stryMutAct_9fa48("104714") ? Object.entries(whereClause) : (stryCov_9fa48("104714"), Object.entries(whereClause).filter(stryMutAct_9fa48("104715") ? () => undefined : (stryCov_9fa48("104715"), ([_key, value]) => stryMutAct_9fa48("104718") ? value !== null || value !== undefined : stryMutAct_9fa48("104717") ? false : stryMutAct_9fa48("104716") ? true : (stryCov_9fa48("104716", "104717", "104718"), (stryMutAct_9fa48("104720") ? value === null : stryMutAct_9fa48("104719") ? true : (stryCov_9fa48("104719", "104720"), value !== null)) && (stryMutAct_9fa48("104722") ? value === undefined : stryMutAct_9fa48("104721") ? true : (stryCov_9fa48("104721", "104722"), value !== undefined))))));
      if (stryMutAct_9fa48("104725") ? entries.length !== NUM.ZERO : stryMutAct_9fa48("104724") ? false : stryMutAct_9fa48("104723") ? true : (stryCov_9fa48("104723", "104724", "104725"), entries.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("104726")) {
          {}
        } else {
          stryCov_9fa48("104726");
          return null;
        }
      }
      if (stryMutAct_9fa48("104729") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("104728") ? false : stryMutAct_9fa48("104727") ? true : (stryCov_9fa48("104727", "104728", "104729"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
        if (stryMutAct_9fa48("104730")) {
          {}
        } else {
          stryCov_9fa48("104730");
          const [keyColumn, keyValue] = entries[NUM.ZERO];
          this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, stryMutAct_9fa48("104731") ? {} : (stryCov_9fa48("104731"), {
            tableName,
            keyColumn,
            keyValue
          }));
        }
      }
      const whereSql = entries.map(stryMutAct_9fa48("104732") ? () => undefined : (stryCov_9fa48("104732"), ([key]) => stryMutAct_9fa48("104733") ? `` : (stryCov_9fa48("104733"), `${key} = ?`))).join(stryMutAct_9fa48("104734") ? "" : (stryCov_9fa48("104734"), ' AND '));
      const whereValues = entries.map(stryMutAct_9fa48("104735") ? () => undefined : (stryCov_9fa48("104735"), ([_key, value]) => value));
      try {
        if (stryMutAct_9fa48("104736")) {
          {}
        } else {
          stryCov_9fa48("104736");
          const stmt = this.db.prepare(stryMutAct_9fa48("104737") ? `` : (stryCov_9fa48("104737"), `SELECT * FROM ${tableName} WHERE ${whereSql}`));
          const row = stmt.get(...whereValues);
          if (stryMutAct_9fa48("104739") ? false : stryMutAct_9fa48("104738") ? true : (stryCov_9fa48("104738", "104739"), row)) {
            if (stryMutAct_9fa48("104740")) {
              {}
            } else {
              stryCov_9fa48("104740");
              if (stryMutAct_9fa48("104743") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("104742") ? false : stryMutAct_9fa48("104741") ? true : (stryCov_9fa48("104741", "104742", "104743"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
                if (stryMutAct_9fa48("104744")) {
                  {}
                } else {
                  stryCov_9fa48("104744");
                  this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, stryMutAct_9fa48("104745") ? {} : (stryCov_9fa48("104745"), {
                    tableName,
                    rowKeys: Object.keys(row)
                  }));
                }
              }
              return row;
            }
          }
          if (stryMutAct_9fa48("104748") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("104747") ? false : stryMutAct_9fa48("104746") ? true : (stryCov_9fa48("104746", "104747", "104748"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
            if (stryMutAct_9fa48("104749")) {
              {}
            } else {
              stryCov_9fa48("104749");
              const [keyColumn, keyValue] = entries[NUM.ZERO];
              this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, stryMutAct_9fa48("104750") ? {} : (stryCov_9fa48("104750"), {
                tableName,
                keyColumn,
                keyValue
              }));
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("104751")) {
          {}
        } else {
          stryCov_9fa48("104751");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, stryMutAct_9fa48("104752") ? {} : (stryCov_9fa48("104752"), {
            tableName,
            error: err.message
          }));
          throw err;
        }
      }
      return null;
    }
  } /**
    * Parse values from SQL VALUES clause.
    * Delegates to partition-sql-parser.js.
    * @param {string} valuesStr - Values string.
    * @return {Array} Parsed values.
    * @private
    */
  parseValuesFromSQL(valuesStr) {
    if (stryMutAct_9fa48("104753")) {
      {}
    } else {
      stryCov_9fa48("104753");
      return parseValuesFromSQLImpl(valuesStr);
    }
  } /**
    * Parse a single value from SQL.
    * Delegates to partition-sql-parser.js.
    * @param {string} val - Value string.
    * @return {*} Parsed value.
    * @private
    */
  parseValue(val) {
    if (stryMutAct_9fa48("104754")) {
      {}
    } else {
      stryCov_9fa48("104754");
      return parseValueImpl(val);
    }
  } /**
    * Resolve whether late-subscriber external CDC is enabled for a table.
    * Control-plane propagation tables remain driven by the canonical CDC
    * policy matrix; user tables may override external CDC via tables.table_policies.
    * @param {string} tableName - Table name.
    * @return {boolean} True when external CDC buffering should remain enabled.
    * @private
    */ /**
       * Resolve whether late-subscriber external CDC is enabled for a table.
       * Delegates to partition-cdc-delivery.js.
       * @param {string} tableName - Table name.
       * @return {boolean} True when external CDC buffering should remain enabled.
       * @private
       */
  isExternalCdcAllowedForTable(tableName) {
    if (stryMutAct_9fa48("104755")) {
      {}
    } else {
      stryCov_9fa48("104755");
      return this.cdcDelivery.isExternalCdcAllowedForTable(tableName);
    }
  } /**
    * Determine whether CDC events should be buffered when there are no
    * subscribers yet. Delegates to partition-cdc-delivery.js.
    * @param {string} tableName - Table name.
    * @return {boolean} True when buffering should stay enabled.
    * @private
    */
  shouldBufferCdcWithoutSubscribers(tableName) {
    if (stryMutAct_9fa48("104756")) {
      {}
    } else {
      stryCov_9fa48("104756");
      return this.cdcDelivery.shouldBufferCdcWithoutSubscribers(tableName);
    }
  } /**
    * Allocate next CDC event sequence number.
    * Delegates to partition-cdc-delivery.js.
    * @return {number} Monotonic sequence number.
    * @private
    */
  nextCDCEventSequenceNumber() {
    if (stryMutAct_9fa48("104757")) {
      {}
    } else {
      stryCov_9fa48("104757");
      return this.cdcDelivery.nextCDCEventSequenceNumber();
    }
  } /**
    * Buffer one CDC event for retry and schedule replay when possible.
    * Delegates to partition-cdc-delivery.js.
    * @param {Object} cdcEvent - Event payload.
    * @param {string} reason - Buffering reason.
    * @return {boolean} True when buffered, false when dropped.
    * @private
    */
  bufferCDCEventForRetry(cdcEvent, reason) {
    if (stryMutAct_9fa48("104758")) {
      {}
    } else {
      stryCov_9fa48("104758");
      return this.cdcDelivery.bufferCDCEventForRetry(cdcEvent, reason);
    }
  } /**
    * Schedule buffered CDC replay with bounded backoff.
    * Delegates to partition-cdc-delivery.js.
    * @param {string} reason - Trigger reason.
    * @private
    */
  scheduleBufferedCDCReplay(reason) {
    if (stryMutAct_9fa48("104759")) {
      {}
    } else {
      stryCov_9fa48("104759");
      this.cdcDelivery.scheduleBufferedCDCReplay(reason);
    }
  } /**
    * Replay buffered CDC events to current subscribers.
    * Delegates to partition-cdc-delivery.js.
    * @param {string} reason - Trigger reason.
    * @return {Promise<void>}
    * @private
    */
  async flushBufferedCDCEvents(reason) {
    if (stryMutAct_9fa48("104760")) {
      {}
    } else {
      stryCov_9fa48("104760");
      return this.cdcDelivery.flushBufferedCDCEvents(reason);
    }
  } /**
    * Resolve a stable subscriber identifier.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Subscriber.
    * @param {Object} options - Subscription options.
    * @return {string} Stable subscriber identifier.
    * @private
    */
  resolveCDCSubscriberId(subscriber, options = {}) {
    if (stryMutAct_9fa48("104761")) {
      {}
    } else {
      stryCov_9fa48("104761");
      return this.cdcDelivery.resolveCDCSubscriberId(subscriber, options);
    }
  } /**
    * Deliver one CDC event to a subscriber callback/object.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Subscriber callback/object.
    * @param {Object} cdcEvent - Event payload.
    * @return {Promise<void>}
    * @private
    */
  async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    if (stryMutAct_9fa48("104762")) {
      {}
    } else {
      stryCov_9fa48("104762");
      return this.cdcDelivery.deliverCDCEventToSubscriber(subscriber, cdcEvent);
    }
  } /**
    * Create a wrapper that enriches stream metadata for one subscriber.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Target subscriber.
    * @param {Object} subscriptionState - Mutable state for this subscriber.
    * @return {Function} Wrapper callback.
    * @private
    */
  buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    if (stryMutAct_9fa48("104763")) {
      {}
    } else {
      stryCov_9fa48("104763");
      return this.cdcDelivery.buildCDCSubscriberWrapper(subscriber, subscriptionState);
    }
  } /**
    * Subscribe to CDC with explicit handshake acknowledgment and catch-up.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Subscriber function or object.
    * @param {Object} [options] - Handshake options.
    * @param {string} [options.subscriberId] - Stable subscriber identifier.
    * @return {Promise<Object>} Handshake acknowledgment.
    */
  async subscribeToCDCWithHandshake(subscriber, options = {}) {
    if (stryMutAct_9fa48("104764")) {
      {}
    } else {
      stryCov_9fa48("104764");
      return this.cdcDelivery.subscribeToCDCWithHandshake(subscriber, options);
    }
  } /**
    * Subscribe to CDC events from this partition.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Subscriber function or object.
    */
  subscribeToCDC(subscriber) {
    if (stryMutAct_9fa48("104765")) {
      {}
    } else {
      stryCov_9fa48("104765");
      this.cdcDelivery.subscribeToCDC(subscriber);
    }
  } /**
    * Unsubscribe from CDC events.
    * Delegates to partition-cdc-delivery.js.
    * @param {Function|Object} subscriber - Subscriber to remove.
    */
  unsubscribeFromCDC(subscriber) {
    if (stryMutAct_9fa48("104766")) {
      {}
    } else {
      stryCov_9fa48("104766");
      this.cdcDelivery.unsubscribeFromCDC(subscriber);
    }
  } /**
    * Get CDC subscription diagnostics for this partition.
    * Delegates to partition-cdc-delivery.js.
    * @return {Object} CDC subscription diagnostics.
    */
  getCDCSubscriptionDiagnostics() {
    if (stryMutAct_9fa48("104767")) {
      {}
    } else {
      stryCov_9fa48("104767");
      return this.cdcDelivery.getCDCSubscriptionDiagnostics();
    }
  } /**
    * Calculate the partition size using SQLite pragmas.
    * @return {Promise<number>} Size in bytes.
    */
  async calculatePartitionSize() {
    if (stryMutAct_9fa48("104768")) {
      {}
    } else {
      stryCov_9fa48("104768");
      if (stryMutAct_9fa48("104771") ? false : stryMutAct_9fa48("104770") ? true : stryMutAct_9fa48("104769") ? this.db : (stryCov_9fa48("104769", "104770", "104771"), !this.db)) {
        if (stryMutAct_9fa48("104772")) {
          {}
        } else {
          stryCov_9fa48("104772");
          return NUM.ZERO;
        }
      }
      try {
        if (stryMutAct_9fa48("104773")) {
          {}
        } else {
          stryCov_9fa48("104773");
          const pageCount = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_COUNT, stryMutAct_9fa48("104774") ? {} : (stryCov_9fa48("104774"), {
            simple: stryMutAct_9fa48("104775") ? false : (stryCov_9fa48("104775"), true)
          }));
          const pageSize = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_SIZE, stryMutAct_9fa48("104776") ? {} : (stryCov_9fa48("104776"), {
            simple: stryMutAct_9fa48("104777") ? false : (stryCov_9fa48("104777"), true)
          }));
          const pragmaSizeBytes = stryMutAct_9fa48("104778") ? pageCount / pageSize : (stryCov_9fa48("104778"), pageCount * pageSize);
          if (stryMutAct_9fa48("104781") ? this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH && CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) : stryMutAct_9fa48("104780") ? false : stryMutAct_9fa48("104779") ? true : (stryCov_9fa48("104779", "104780", "104781"), (stryMutAct_9fa48("104783") ? this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("104782") ? false : (stryCov_9fa48("104782", "104783"), this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH)) || CONTROL_PLANE_PARTITION_IDS.has(this.partitionId))) {
            if (stryMutAct_9fa48("104784")) {
              {}
            } else {
              stryCov_9fa48("104784");
              return pragmaSizeBytes;
            }
          }
          return stryMutAct_9fa48("104785") ? Math.min(pragmaSizeBytes, this.calculateOnDiskPartitionSize()) : (stryCov_9fa48("104785"), Math.max(pragmaSizeBytes, this.calculateOnDiskPartitionSize()));
        }
      } catch (error) {
        if (stryMutAct_9fa48("104786")) {
          {}
        } else {
          stryCov_9fa48("104786");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_FAILED, stryMutAct_9fa48("104787") ? {} : (stryCov_9fa48("104787"), {
            partitionId: this.partitionId,
            error: error.message
          }));
          return NUM.ZERO;
        }
      }
    }
  }
  calculateOnDiskPartitionSize() {
    if (stryMutAct_9fa48("104788")) {
      {}
    } else {
      stryCov_9fa48("104788");
      if (stryMutAct_9fa48("104791") ? (typeof this.dbPath !== TYPEOF.STRING || this.dbPath.length === NUM.ZERO) && this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("104790") ? false : stryMutAct_9fa48("104789") ? true : (stryCov_9fa48("104789", "104790", "104791"), (stryMutAct_9fa48("104793") ? typeof this.dbPath !== TYPEOF.STRING && this.dbPath.length === NUM.ZERO : stryMutAct_9fa48("104792") ? false : (stryCov_9fa48("104792", "104793"), (stryMutAct_9fa48("104795") ? typeof this.dbPath === TYPEOF.STRING : stryMutAct_9fa48("104794") ? false : (stryCov_9fa48("104794", "104795"), typeof this.dbPath !== TYPEOF.STRING)) || (stryMutAct_9fa48("104797") ? this.dbPath.length !== NUM.ZERO : stryMutAct_9fa48("104796") ? false : (stryCov_9fa48("104796", "104797"), this.dbPath.length === NUM.ZERO)))) || (stryMutAct_9fa48("104799") ? this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("104798") ? false : (stryCov_9fa48("104798", "104799"), this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH)))) {
        if (stryMutAct_9fa48("104800")) {
          {}
        } else {
          stryCov_9fa48("104800");
          return NUM.ZERO;
        }
      }
      let totalSizeBytes = NUM.ZERO;
      for (const candidatePath of stryMutAct_9fa48("104801") ? [] : (stryCov_9fa48("104801"), [this.dbPath, stryMutAct_9fa48("104802") ? `` : (stryCov_9fa48("104802"), `${this.dbPath}-wal`)])) {
        if (stryMutAct_9fa48("104803")) {
          {}
        } else {
          stryCov_9fa48("104803");
          try {
            if (stryMutAct_9fa48("104804")) {
              {}
            } else {
              stryCov_9fa48("104804");
              stryMutAct_9fa48("104805") ? totalSizeBytes -= fs.statSync(candidatePath).size : (stryCov_9fa48("104805"), totalSizeBytes += fs.statSync(candidatePath).size);
            }
          } catch (error) {
            if (stryMutAct_9fa48("104806")) {
              {}
            } else {
              stryCov_9fa48("104806");
              if (stryMutAct_9fa48("104809") ? error?.code === PARTITION_SERVICE_LITERAL.ENOENT : stryMutAct_9fa48("104808") ? false : stryMutAct_9fa48("104807") ? true : (stryCov_9fa48("104807", "104808", "104809"), (stryMutAct_9fa48("104810") ? error.code : (stryCov_9fa48("104810"), error?.code)) !== PARTITION_SERVICE_LITERAL.ENOENT)) {
                if (stryMutAct_9fa48("104811")) {
                  {}
                } else {
                  stryCov_9fa48("104811");
                  throw error;
                }
              }
            }
          }
        }
      }
      return totalSizeBytes;
    }
  } /**
    * Update the partition size and emit event.
    * @return {Promise<void>}
    */
  async updatePartitionSize() {
    if (stryMutAct_9fa48("104812")) {
      {}
    } else {
      stryCov_9fa48("104812");
      try {
        if (stryMutAct_9fa48("104813")) {
          {}
        } else {
          stryCov_9fa48("104813");
          const sizeBytes = await this.calculatePartitionSize();
          this.sizeBytes = sizeBytes;
          this.lastSizeUpdate = Date.now();
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.PARTITION_SIZE_UPDATED, stryMutAct_9fa48("104814") ? {} : (stryCov_9fa48("104814"), {
            partitionId: this.partitionId,
            sizeBytes,
            sizeMB: (stryMutAct_9fa48("104815") ? sizeBytes * PARTITION_SERVICE_VALUE.SIZE_BYTES_DIVISOR : (stryCov_9fa48("104815"), sizeBytes / PARTITION_SERVICE_VALUE.SIZE_BYTES_DIVISOR)).toFixed(PARTITION_SERVICE_VALUE.SIZE_MB_PRECISION)
          }));
          this.emit(PARTITION_SERVICE_EVENT.SIZE_UPDATED, stryMutAct_9fa48("104816") ? {} : (stryCov_9fa48("104816"), {
            partitionId: this.partitionId,
            sizeBytes,
            timestamp: this.lastSizeUpdate
          }));
          await this.persistPartitionSize(sizeBytes);
        }
      } catch (error) {
        if (stryMutAct_9fa48("104817")) {
          {}
        } else {
          stryCov_9fa48("104817");
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_UPDATE_FAILED, stryMutAct_9fa48("104818") ? {} : (stryCov_9fa48("104818"), {
            partitionId: this.partitionId,
            error: error.message
          }));
        }
      }
    }
  } /**
    * Schedule an asynchronous size update (debounced).
    * @private
    */
  scheduleSizeUpdate() {
    if (stryMutAct_9fa48("104819")) {
      {}
    } else {
      stryCov_9fa48("104819");
      if (stryMutAct_9fa48("104821") ? false : stryMutAct_9fa48("104820") ? true : (stryCov_9fa48("104820", "104821"), this.sizeUpdatePending)) {
        if (stryMutAct_9fa48("104822")) {
          {}
        } else {
          stryCov_9fa48("104822");
          return;
        }
      }
      const timeSinceLastUpdate = stryMutAct_9fa48("104823") ? Date.now() + this.lastSizeUpdate : (stryCov_9fa48("104823"), Date.now() - this.lastSizeUpdate);
      if (stryMutAct_9fa48("104827") ? timeSinceLastUpdate >= this.sizeUpdateDebounceMs : stryMutAct_9fa48("104826") ? timeSinceLastUpdate <= this.sizeUpdateDebounceMs : stryMutAct_9fa48("104825") ? false : stryMutAct_9fa48("104824") ? true : (stryCov_9fa48("104824", "104825", "104826", "104827"), timeSinceLastUpdate < this.sizeUpdateDebounceMs)) {
        if (stryMutAct_9fa48("104828")) {
          {}
        } else {
          stryCov_9fa48("104828");
          return;
        }
      }
      this.sizeUpdatePending = stryMutAct_9fa48("104829") ? false : (stryCov_9fa48("104829"), true);
      setImmediate(async () => {
        if (stryMutAct_9fa48("104830")) {
          {}
        } else {
          stryCov_9fa48("104830");
          try {
            if (stryMutAct_9fa48("104831")) {
              {}
            } else {
              stryCov_9fa48("104831");
              await this.updatePartitionSize();
            }
          } finally {
            if (stryMutAct_9fa48("104832")) {
              {}
            } else {
              stryCov_9fa48("104832");
              this.sizeUpdatePending = stryMutAct_9fa48("104833") ? true : (stryCov_9fa48("104833"), false);
            }
          }
        }
      });
    }
  } /**
    * Start periodic size updates.
    * @private
    */
  startPeriodicSizeUpdates() {
    if (stryMutAct_9fa48("104834")) {
      {}
    } else {
      stryCov_9fa48("104834");
      if (stryMutAct_9fa48("104836") ? false : stryMutAct_9fa48("104835") ? true : (stryCov_9fa48("104835", "104836"), this.sizeUpdateTimer)) {
        if (stryMutAct_9fa48("104837")) {
          {}
        } else {
          stryCov_9fa48("104837");
          return;
        }
      }
      if (stryMutAct_9fa48("104839") ? false : stryMutAct_9fa48("104838") ? true : (stryCov_9fa48("104838", "104839"), this.isShutdown)) {
        if (stryMutAct_9fa48("104840")) {
          {}
        } else {
          stryCov_9fa48("104840");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, stryMutAct_9fa48("104841") ? {} : (stryCov_9fa48("104841"), {
            partitionId: this.partitionId,
            timer: PARTITION_SERVICE_LITERAL.SIZEUPDATETIMER
          }));
          return;
        }
      }
      this.sizeUpdateTimer = setInterval(async () => {
        if (stryMutAct_9fa48("104842")) {
          {}
        } else {
          stryCov_9fa48("104842");
          const timeSinceLastUpdate = stryMutAct_9fa48("104843") ? Date.now() + this.lastSizeUpdate : (stryCov_9fa48("104843"), Date.now() - this.lastSizeUpdate);
          if (stryMutAct_9fa48("104847") ? timeSinceLastUpdate < this.sizeUpdateIntervalMs : stryMutAct_9fa48("104846") ? timeSinceLastUpdate > this.sizeUpdateIntervalMs : stryMutAct_9fa48("104845") ? false : stryMutAct_9fa48("104844") ? true : (stryCov_9fa48("104844", "104845", "104846", "104847"), timeSinceLastUpdate >= this.sizeUpdateIntervalMs)) {
            if (stryMutAct_9fa48("104848")) {
              {}
            } else {
              stryCov_9fa48("104848");
              await this.updatePartitionSize();
            }
          }
        }
      }, this.sizeUpdateIntervalMs);
      this.sizeUpdateTimer.unref();
    }
  } /**
    * Stop periodic size updates.
    * @private
    */
  stopPeriodicSizeUpdates() {
    if (stryMutAct_9fa48("104849")) {
      {}
    } else {
      stryCov_9fa48("104849");
      if (stryMutAct_9fa48("104851") ? false : stryMutAct_9fa48("104850") ? true : (stryCov_9fa48("104850", "104851"), this.sizeUpdateTimer)) {
        if (stryMutAct_9fa48("104852")) {
          {}
        } else {
          stryCov_9fa48("104852");
          clearInterval(this.sizeUpdateTimer);
          this.sizeUpdateTimer = null;
        }
      }
    }
  } /**
    * Get the current partition size.
    * @return {number} Size in bytes.
    */
  getSize() {
    if (stryMutAct_9fa48("104853")) {
      {}
    } else {
      stryCov_9fa48("104853");
      return this.sizeBytes;
    }
  } /**
    * Persist leader-owned size_bytes updates into the partitions system table.
    * @param {number} sizeBytes - Latest measured size.
    * @return {Promise<void>}
    * @private
    */
  async persistPartitionSize(sizeBytes) {
    if (stryMutAct_9fa48("104854")) {
      {}
    } else {
      stryCov_9fa48("104854");
      if (stryMutAct_9fa48("104857") ? (!this.isLeader || !this.systemTableCache || !this.cdcIntegrationService) && !this.isPartitionsLeaderAvailable() : stryMutAct_9fa48("104856") ? false : stryMutAct_9fa48("104855") ? true : (stryCov_9fa48("104855", "104856", "104857"), (stryMutAct_9fa48("104859") ? (!this.isLeader || !this.systemTableCache) && !this.cdcIntegrationService : stryMutAct_9fa48("104858") ? false : (stryCov_9fa48("104858", "104859"), (stryMutAct_9fa48("104861") ? !this.isLeader && !this.systemTableCache : stryMutAct_9fa48("104860") ? false : (stryCov_9fa48("104860", "104861"), (stryMutAct_9fa48("104862") ? this.isLeader : (stryCov_9fa48("104862"), !this.isLeader)) || (stryMutAct_9fa48("104863") ? this.systemTableCache : (stryCov_9fa48("104863"), !this.systemTableCache)))) || (stryMutAct_9fa48("104864") ? this.cdcIntegrationService : (stryCov_9fa48("104864"), !this.cdcIntegrationService)))) || (stryMutAct_9fa48("104865") ? this.isPartitionsLeaderAvailable() : (stryCov_9fa48("104865"), !this.isPartitionsLeaderAvailable())))) {
        if (stryMutAct_9fa48("104866")) {
          {}
        } else {
          stryCov_9fa48("104866");
          return;
        }
      }
      const cachedPartition = stryMutAct_9fa48("104869") ? this.systemTableCache.get?.(TABLES.PARTITIONS, this.partitionId) && null : stryMutAct_9fa48("104868") ? false : stryMutAct_9fa48("104867") ? true : (stryCov_9fa48("104867", "104868", "104869"), (stryMutAct_9fa48("104870") ? this.systemTableCache.get(TABLES.PARTITIONS, this.partitionId) : (stryCov_9fa48("104870"), this.systemTableCache.get?.(TABLES.PARTITIONS, this.partitionId))) || null);
      if (stryMutAct_9fa48("104873") ? false : stryMutAct_9fa48("104872") ? true : stryMutAct_9fa48("104871") ? cachedPartition : (stryCov_9fa48("104871", "104872", "104873"), !cachedPartition)) {
        if (stryMutAct_9fa48("104874")) {
          {}
        } else {
          stryCov_9fa48("104874");
          return;
        }
      }
      const cachedSize = Number(stryMutAct_9fa48("104875") ? cachedPartition.size_bytes && cachedPartition.sizeBytes : (stryCov_9fa48("104875"), cachedPartition.size_bytes ?? cachedPartition.sizeBytes));
      if (stryMutAct_9fa48("104878") ? Number.isFinite(cachedSize) || cachedSize === sizeBytes : stryMutAct_9fa48("104877") ? false : stryMutAct_9fa48("104876") ? true : (stryCov_9fa48("104876", "104877", "104878"), Number.isFinite(cachedSize) && (stryMutAct_9fa48("104880") ? cachedSize !== sizeBytes : stryMutAct_9fa48("104879") ? true : (stryCov_9fa48("104879", "104880"), cachedSize === sizeBytes)))) {
        if (stryMutAct_9fa48("104881")) {
          {}
        } else {
          stryCov_9fa48("104881");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("104882")) {
          {}
        } else {
          stryCov_9fa48("104882");
          const gateway = stryMutAct_9fa48("104885") ? this.rebalancer?.controlPlaneSystemTableGateway && this.controlPlaneSystemTableGateway : stryMutAct_9fa48("104884") ? false : stryMutAct_9fa48("104883") ? true : (stryCov_9fa48("104883", "104884", "104885"), (stryMutAct_9fa48("104886") ? this.rebalancer.controlPlaneSystemTableGateway : (stryCov_9fa48("104886"), this.rebalancer?.controlPlaneSystemTableGateway)) || this.controlPlaneSystemTableGateway);
          const result = await runRetryableControlPlaneWrite(stryMutAct_9fa48("104887") ? () => undefined : (stryCov_9fa48("104887"), () => gateway.submitMutation(stryMutAct_9fa48("104888") ? {} : (stryCov_9fa48("104888"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: TABLES.PARTITIONS,
            whereClause: stryMutAct_9fa48("104889") ? {} : (stryCov_9fa48("104889"), {
              partition_id: this.partitionId
            }),
            data: stryMutAct_9fa48("104890") ? {} : (stryCov_9fa48("104890"), {
              size_bytes: sizeBytes,
              updated_at: Date.now()
            })
          }), stryMutAct_9fa48("104891") ? {} : (stryCov_9fa48("104891"), {
            workClass: PRESSURE_WORK_CLASS.BACKGROUND,
            deliveryPriority: stryMutAct_9fa48("104892") ? "" : (stryCov_9fa48("104892"), 'background'),
            allowPressureDefer: stryMutAct_9fa48("104893") ? false : (stryCov_9fa48("104893"), true),
            coalescingKey: stryMutAct_9fa48("104894") ? `` : (stryCov_9fa48("104894"), `partitions:size:${this.partitionId}`)
          }))), stryMutAct_9fa48("104895") ? {} : (stryCov_9fa48("104895"), {
            timeoutMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS,
            baseDelayMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_BASE_DELAY_MS,
            maxDelayMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_MAX_DELAY_MS
          }));
          if (stryMutAct_9fa48("104898") ? result?.success !== false : stryMutAct_9fa48("104897") ? false : stryMutAct_9fa48("104896") ? true : (stryCov_9fa48("104896", "104897", "104898"), (stryMutAct_9fa48("104899") ? result.success : (stryCov_9fa48("104899"), result?.success)) === (stryMutAct_9fa48("104900") ? true : (stryCov_9fa48("104900"), false)))) {
            if (stryMutAct_9fa48("104901")) {
              {}
            } else {
              stryCov_9fa48("104901");
              throw new Error(stryMutAct_9fa48("104904") ? (result.error || result.message) && PARTITION_SERVICE_LITERAL.SIZE_PERSISTENCE_FAILED : stryMutAct_9fa48("104903") ? false : stryMutAct_9fa48("104902") ? true : (stryCov_9fa48("104902", "104903", "104904"), (stryMutAct_9fa48("104906") ? result.error && result.message : stryMutAct_9fa48("104905") ? false : (stryCov_9fa48("104905", "104906"), result.error || result.message)) || PARTITION_SERVICE_LITERAL.SIZE_PERSISTENCE_FAILED));
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("104907")) {
          {}
        } else {
          stryCov_9fa48("104907");
          this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_SIZE_PERSIST_FAILED, stryMutAct_9fa48("104908") ? {} : (stryCov_9fa48("104908"), {
            partitionId: this.partitionId,
            sizeBytes,
            error: error.message
          }));
        }
      }
    }
  } /**
    * Normalize split transition metadata from table/control-plane payloads.
    * @param {Object|string|null} rawMetadata - Metadata payload.
    * @return {Object|null} Normalized metadata.
    * @private
    */
  normalizeSplitTransitionMetadata(rawMetadata) {
    if (stryMutAct_9fa48("104909")) {
      {}
    } else {
      stryCov_9fa48("104909");
      if (stryMutAct_9fa48("104912") ? false : stryMutAct_9fa48("104911") ? true : stryMutAct_9fa48("104910") ? rawMetadata : (stryCov_9fa48("104910", "104911", "104912"), !rawMetadata)) {
        if (stryMutAct_9fa48("104913")) {
          {}
        } else {
          stryCov_9fa48("104913");
          return null;
        }
      }
      let metadata = rawMetadata;
      if (stryMutAct_9fa48("104916") ? typeof rawMetadata !== TYPEOF.STRING : stryMutAct_9fa48("104915") ? false : stryMutAct_9fa48("104914") ? true : (stryCov_9fa48("104914", "104915", "104916"), typeof rawMetadata === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("104917")) {
          {}
        } else {
          stryCov_9fa48("104917");
          try {
            if (stryMutAct_9fa48("104918")) {
              {}
            } else {
              stryCov_9fa48("104918");
              metadata = JSON.parse(rawMetadata);
            }
          } catch {
            if (stryMutAct_9fa48("104919")) {
              {}
            } else {
              stryCov_9fa48("104919");
              return null;
            }
          }
        }
      }
      if (stryMutAct_9fa48("104922") ? !metadata && typeof metadata !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("104921") ? false : stryMutAct_9fa48("104920") ? true : (stryCov_9fa48("104920", "104921", "104922"), (stryMutAct_9fa48("104923") ? metadata : (stryCov_9fa48("104923"), !metadata)) || (stryMutAct_9fa48("104925") ? typeof metadata === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("104924") ? false : (stryCov_9fa48("104924", "104925"), typeof metadata !== PARTITION_SERVICE_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("104926")) {
          {}
        } else {
          stryCov_9fa48("104926");
          return null;
        }
      }
      const targetPartitionIds = metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
      const targetPartitionVersion = Number(metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]);
      const primaryKeyColumn = metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN];
      const sourcePartitionId = metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
      if (stryMutAct_9fa48("104929") ? (!primaryKeyColumn || !sourcePartitionId || sourcePartitionId !== this.partitionId || !Array.isArray(targetPartitionIds) || targetPartitionIds.length !== NUM.TWO || !targetPartitionIds[NUM.ZERO] || !targetPartitionIds[NUM.ONE]) && !Number.isInteger(targetPartitionVersion) : stryMutAct_9fa48("104928") ? false : stryMutAct_9fa48("104927") ? true : (stryCov_9fa48("104927", "104928", "104929"), (stryMutAct_9fa48("104931") ? (!primaryKeyColumn || !sourcePartitionId || sourcePartitionId !== this.partitionId || !Array.isArray(targetPartitionIds) || targetPartitionIds.length !== NUM.TWO || !targetPartitionIds[NUM.ZERO]) && !targetPartitionIds[NUM.ONE] : stryMutAct_9fa48("104930") ? false : (stryCov_9fa48("104930", "104931"), (stryMutAct_9fa48("104933") ? (!primaryKeyColumn || !sourcePartitionId || sourcePartitionId !== this.partitionId || !Array.isArray(targetPartitionIds) || targetPartitionIds.length !== NUM.TWO) && !targetPartitionIds[NUM.ZERO] : stryMutAct_9fa48("104932") ? false : (stryCov_9fa48("104932", "104933"), (stryMutAct_9fa48("104935") ? (!primaryKeyColumn || !sourcePartitionId || sourcePartitionId !== this.partitionId || !Array.isArray(targetPartitionIds)) && targetPartitionIds.length !== NUM.TWO : stryMutAct_9fa48("104934") ? false : (stryCov_9fa48("104934", "104935"), (stryMutAct_9fa48("104937") ? (!primaryKeyColumn || !sourcePartitionId || sourcePartitionId !== this.partitionId) && !Array.isArray(targetPartitionIds) : stryMutAct_9fa48("104936") ? false : (stryCov_9fa48("104936", "104937"), (stryMutAct_9fa48("104939") ? (!primaryKeyColumn || !sourcePartitionId) && sourcePartitionId !== this.partitionId : stryMutAct_9fa48("104938") ? false : (stryCov_9fa48("104938", "104939"), (stryMutAct_9fa48("104941") ? !primaryKeyColumn && !sourcePartitionId : stryMutAct_9fa48("104940") ? false : (stryCov_9fa48("104940", "104941"), (stryMutAct_9fa48("104942") ? primaryKeyColumn : (stryCov_9fa48("104942"), !primaryKeyColumn)) || (stryMutAct_9fa48("104943") ? sourcePartitionId : (stryCov_9fa48("104943"), !sourcePartitionId)))) || (stryMutAct_9fa48("104945") ? sourcePartitionId === this.partitionId : stryMutAct_9fa48("104944") ? false : (stryCov_9fa48("104944", "104945"), sourcePartitionId !== this.partitionId)))) || (stryMutAct_9fa48("104946") ? Array.isArray(targetPartitionIds) : (stryCov_9fa48("104946"), !Array.isArray(targetPartitionIds))))) || (stryMutAct_9fa48("104948") ? targetPartitionIds.length === NUM.TWO : stryMutAct_9fa48("104947") ? false : (stryCov_9fa48("104947", "104948"), targetPartitionIds.length !== NUM.TWO)))) || (stryMutAct_9fa48("104949") ? targetPartitionIds[NUM.ZERO] : (stryCov_9fa48("104949"), !targetPartitionIds[NUM.ZERO])))) || (stryMutAct_9fa48("104950") ? targetPartitionIds[NUM.ONE] : (stryCov_9fa48("104950"), !targetPartitionIds[NUM.ONE])))) || (stryMutAct_9fa48("104951") ? Number.isInteger(targetPartitionVersion) : (stryCov_9fa48("104951"), !Number.isInteger(targetPartitionVersion))))) {
        if (stryMutAct_9fa48("104952")) {
          {}
        } else {
          stryCov_9fa48("104952");
          return null;
        }
      }
      return stryMutAct_9fa48("104953") ? {} : (stryCov_9fa48("104953"), {
        primaryKeyColumn,
        sourcePartitionId,
        splitKey: metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
        targetPartitionIds: stryMutAct_9fa48("104954") ? [] : (stryCov_9fa48("104954"), [...targetPartitionIds]),
        targetPartitionVersion,
        workflowId: stryMutAct_9fa48("104957") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] && null : stryMutAct_9fa48("104956") ? false : stryMutAct_9fa48("104955") ? true : (stryCov_9fa48("104955", "104956", "104957"), metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null)
      });
    }
  } /**
    * Determine whether two split-replication descriptors refer to the same split.
    * @param {Object|null} left - Existing metadata.
    * @param {Object|null} right - Incoming metadata.
    * @return {boolean} True when both describe the same split.
    * @private
    */
  isSameSplitReplication(left, right) {
    if (stryMutAct_9fa48("104958")) {
      {}
    } else {
      stryCov_9fa48("104958");
      if (stryMutAct_9fa48("104961") ? !left && !right : stryMutAct_9fa48("104960") ? false : stryMutAct_9fa48("104959") ? true : (stryCov_9fa48("104959", "104960", "104961"), (stryMutAct_9fa48("104962") ? left : (stryCov_9fa48("104962"), !left)) || (stryMutAct_9fa48("104963") ? right : (stryCov_9fa48("104963"), !right)))) {
        if (stryMutAct_9fa48("104964")) {
          {}
        } else {
          stryCov_9fa48("104964");
          return stryMutAct_9fa48("104965") ? true : (stryCov_9fa48("104965"), false);
        }
      }
      return stryMutAct_9fa48("104968") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId && left.splitKey === right.splitKey && left.targetPartitionVersion === right.targetPartitionVersion && Array.isArray(left.targetPartitionIds) && Array.isArray(right.targetPartitionIds) && left.targetPartitionIds.length === right.targetPartitionIds.length || left.targetPartitionIds.every((partitionId, index) => partitionId === right.targetPartitionIds[index]) : stryMutAct_9fa48("104967") ? false : stryMutAct_9fa48("104966") ? true : (stryCov_9fa48("104966", "104967", "104968"), (stryMutAct_9fa48("104970") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId && left.splitKey === right.splitKey && left.targetPartitionVersion === right.targetPartitionVersion && Array.isArray(left.targetPartitionIds) && Array.isArray(right.targetPartitionIds) || left.targetPartitionIds.length === right.targetPartitionIds.length : stryMutAct_9fa48("104969") ? true : (stryCov_9fa48("104969", "104970"), (stryMutAct_9fa48("104972") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId && left.splitKey === right.splitKey && left.targetPartitionVersion === right.targetPartitionVersion && Array.isArray(left.targetPartitionIds) || Array.isArray(right.targetPartitionIds) : stryMutAct_9fa48("104971") ? true : (stryCov_9fa48("104971", "104972"), (stryMutAct_9fa48("104974") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId && left.splitKey === right.splitKey && left.targetPartitionVersion === right.targetPartitionVersion || Array.isArray(left.targetPartitionIds) : stryMutAct_9fa48("104973") ? true : (stryCov_9fa48("104973", "104974"), (stryMutAct_9fa48("104976") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId && left.splitKey === right.splitKey || left.targetPartitionVersion === right.targetPartitionVersion : stryMutAct_9fa48("104975") ? true : (stryCov_9fa48("104975", "104976"), (stryMutAct_9fa48("104978") ? left.primaryKeyColumn === right.primaryKeyColumn && left.sourcePartitionId === right.sourcePartitionId || left.splitKey === right.splitKey : stryMutAct_9fa48("104977") ? true : (stryCov_9fa48("104977", "104978"), (stryMutAct_9fa48("104980") ? left.primaryKeyColumn === right.primaryKeyColumn || left.sourcePartitionId === right.sourcePartitionId : stryMutAct_9fa48("104979") ? true : (stryCov_9fa48("104979", "104980"), (stryMutAct_9fa48("104982") ? left.primaryKeyColumn !== right.primaryKeyColumn : stryMutAct_9fa48("104981") ? true : (stryCov_9fa48("104981", "104982"), left.primaryKeyColumn === right.primaryKeyColumn)) && (stryMutAct_9fa48("104984") ? left.sourcePartitionId !== right.sourcePartitionId : stryMutAct_9fa48("104983") ? true : (stryCov_9fa48("104983", "104984"), left.sourcePartitionId === right.sourcePartitionId)))) && (stryMutAct_9fa48("104986") ? left.splitKey !== right.splitKey : stryMutAct_9fa48("104985") ? true : (stryCov_9fa48("104985", "104986"), left.splitKey === right.splitKey)))) && (stryMutAct_9fa48("104988") ? left.targetPartitionVersion !== right.targetPartitionVersion : stryMutAct_9fa48("104987") ? true : (stryCov_9fa48("104987", "104988"), left.targetPartitionVersion === right.targetPartitionVersion)))) && Array.isArray(left.targetPartitionIds))) && Array.isArray(right.targetPartitionIds))) && (stryMutAct_9fa48("104990") ? left.targetPartitionIds.length !== right.targetPartitionIds.length : stryMutAct_9fa48("104989") ? true : (stryCov_9fa48("104989", "104990"), left.targetPartitionIds.length === right.targetPartitionIds.length)))) && (stryMutAct_9fa48("104991") ? left.targetPartitionIds.some((partitionId, index) => partitionId === right.targetPartitionIds[index]) : (stryCov_9fa48("104991"), left.targetPartitionIds.every(stryMutAct_9fa48("104992") ? () => undefined : (stryCov_9fa48("104992"), (partitionId, index) => stryMutAct_9fa48("104995") ? partitionId !== right.targetPartitionIds[index] : stryMutAct_9fa48("104994") ? false : stryMutAct_9fa48("104993") ? true : (stryCov_9fa48("104993", "104994", "104995"), partitionId === right.targetPartitionIds[index]))))));
    }
  } /**
    * Reconstruct the transient split execution handle from durable
    * workflow state after a process restart.
    *
    * The canonical split phase and participant state are owned by
    * ManagedSplitWorkflow via DurableWorkflowCoordinator. This method
    * rebuilds the local execution context so that
    * handleSplitReplicationAfterWrite can route writes correctly while
    * the workflow resumes.
    *
    * @param {Object} durableState - Durable workflow state.
    * @param {string} durableState.phase - Canonical workflow phase from
    *   PARTITION_TRANSITION_STATE.
    * @param {Object} durableState.metadata - Normalized split
    *   transition metadata (recoverable from the tables row).
    * @return {Object|null} Reconstructed transient execution handle,
    *   or null if the durable state is not an active split.
    */
  reconstructSplitExecutionState(durableState) {
    if (stryMutAct_9fa48("104996")) {
      {}
    } else {
      stryCov_9fa48("104996");
      if (stryMutAct_9fa48("104999") ? (!durableState || !durableState.phase) && !durableState.metadata : stryMutAct_9fa48("104998") ? false : stryMutAct_9fa48("104997") ? true : (stryCov_9fa48("104997", "104998", "104999"), (stryMutAct_9fa48("105001") ? !durableState && !durableState.phase : stryMutAct_9fa48("105000") ? false : (stryCov_9fa48("105000", "105001"), (stryMutAct_9fa48("105002") ? durableState : (stryCov_9fa48("105002"), !durableState)) || (stryMutAct_9fa48("105003") ? durableState.phase : (stryCov_9fa48("105003"), !durableState.phase)))) || (stryMutAct_9fa48("105004") ? durableState.metadata : (stryCov_9fa48("105004"), !durableState.metadata)))) {
        if (stryMutAct_9fa48("105005")) {
          {}
        } else {
          stryCov_9fa48("105005");
          return null;
        }
      }
      const phase = durableState.phase;
      const activeSplitPhases = new Set(stryMutAct_9fa48("105006") ? [] : (stryCov_9fa48("105006"), [PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING, PARTITION_TRANSITION_STATE.SPLIT_CATCHUP, PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE]));
      if (stryMutAct_9fa48("105009") ? false : stryMutAct_9fa48("105008") ? true : stryMutAct_9fa48("105007") ? activeSplitPhases.has(phase) : (stryCov_9fa48("105007", "105008", "105009"), !activeSplitPhases.has(phase))) {
        if (stryMutAct_9fa48("105010")) {
          {}
        } else {
          stryCov_9fa48("105010");
          return null;
        }
      }
      const metadata = this.normalizeSplitTransitionMetadata(durableState.metadata);
      if (stryMutAct_9fa48("105013") ? false : stryMutAct_9fa48("105012") ? true : stryMutAct_9fa48("105011") ? metadata : (stryCov_9fa48("105011", "105012", "105013"), !metadata)) {
        if (stryMutAct_9fa48("105014")) {
          {}
        } else {
          stryCov_9fa48("105014");
          return null;
        }
      }
      this.splitReplication = stryMutAct_9fa48("105015") ? {} : (stryCov_9fa48("105015"), {
        metadata,
        phase,
        pendingEntries: stryMutAct_9fa48("105016") ? ["Stryker was here"] : (stryCov_9fa48("105016"), []),
        flushInFlight: stryMutAct_9fa48("105017") ? true : (stryCov_9fa48("105017"), false),
        startedAt: Date.now(),
        lastError: null
      });
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_RECONSTRUCTED, stryMutAct_9fa48("105018") ? {} : (stryCov_9fa48("105018"), {
        partitionId: this.partitionId,
        phase,
        workflowId: metadata.workflowId
      }));
      return this.splitReplication;
    }
  } /**
    * Run snapshot backfill and queued-delta catch-up for the active split.
    * @return {Promise<void>}
    * @private
    */
  async runSplitReplicationWorkflow() {
    if (stryMutAct_9fa48("105019")) {
      {}
    } else {
      stryCov_9fa48("105019");
      const splitReplication = this.splitReplication;
      const metadata = stryMutAct_9fa48("105022") ? splitReplication?.metadata && null : stryMutAct_9fa48("105021") ? false : stryMutAct_9fa48("105020") ? true : (stryCov_9fa48("105020", "105021", "105022"), (stryMutAct_9fa48("105023") ? splitReplication.metadata : (stryCov_9fa48("105023"), splitReplication?.metadata)) || null);
      if (stryMutAct_9fa48("105026") ? false : stryMutAct_9fa48("105025") ? true : stryMutAct_9fa48("105024") ? metadata : (stryCov_9fa48("105024", "105025", "105026"), !metadata)) {
        if (stryMutAct_9fa48("105027")) {
          {}
        } else {
          stryCov_9fa48("105027");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
        }
      }
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_STARTED, stryMutAct_9fa48("105028") ? {} : (stryCov_9fa48("105028"), {
        partitionId: this.partitionId,
        targetPartitionIds: metadata.targetPartitionIds,
        targetPartitionVersion: metadata.targetPartitionVersion
      }));
      await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.SNAPSHOT_STARTED);
      const snapshot = this.openSplitSnapshotDatabase();
      try {
        if (stryMutAct_9fa48("105029")) {
          {}
        } else {
          stryCov_9fa48("105029");
          await this.backfillSplitSnapshot(snapshot, metadata);
          splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CATCHUP;
          await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.CATCHUP_READY);
          await this.flushSplitReplicationQueue();
          await this.markSplitCutoverActive(metadata);
          splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
          await this.flushSplitReplicationQueue();
          await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.CLEANUP_COMPLETED, stryMutAct_9fa48("105030") ? {} : (stryCov_9fa48("105030"), {
            [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: stryMutAct_9fa48("105031") ? true : (stryCov_9fa48("105031"), false)
          }));
          this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_COMPLETED, stryMutAct_9fa48("105032") ? {} : (stryCov_9fa48("105032"), {
            partitionId: this.partitionId,
            targetPartitionIds: metadata.targetPartitionIds,
            targetPartitionVersion: metadata.targetPartitionVersion
          }));
        }
      } finally {
        if (stryMutAct_9fa48("105033")) {
          {}
        } else {
          stryCov_9fa48("105033");
          stryMutAct_9fa48("105035") ? snapshot.close?.() : stryMutAct_9fa48("105034") ? snapshot?.close() : (stryCov_9fa48("105034", "105035"), snapshot?.close?.());
        }
      }
    }
  } /**
    * Emit a typed source-side split acknowledgement to the workflow owner.
    *
    * Builds a canonical PARTICIPANT_ACK_FIELD payload and routes it
    * through ManagedSplitWorkflow.acknowledgeSourceParticipant so the
    * durable workflow coordinator persists participant state.
    *
    * @param {Object} metadata - Normalized split transition metadata.
    * @param {string} ackStatus - SPLIT_ACK_STATUS value.
    * @param {Object} [checkpoint] - Optional checkpoint data.
    * @return {Promise<Object>} Acknowledgement result.
    * @private
    */
  async emitSplitSourceAck(metadata, ackStatus, checkpoint) {
    if (stryMutAct_9fa48("105036")) {
      {}
    } else {
      stryCov_9fa48("105036");
      const splitWorkflow = stryMutAct_9fa48("105037") ? this.sqlQueryEngine.managedSplitWorkflow : (stryCov_9fa48("105037"), this.sqlQueryEngine?.managedSplitWorkflow);
      if (stryMutAct_9fa48("105040") ? !splitWorkflow && typeof splitWorkflow.acknowledgeSourceParticipant !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105039") ? false : stryMutAct_9fa48("105038") ? true : (stryCov_9fa48("105038", "105039", "105040"), (stryMutAct_9fa48("105041") ? splitWorkflow : (stryCov_9fa48("105041"), !splitWorkflow)) || (stryMutAct_9fa48("105043") ? typeof splitWorkflow.acknowledgeSourceParticipant === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105042") ? false : (stryCov_9fa48("105042", "105043"), typeof splitWorkflow.acknowledgeSourceParticipant !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("105044")) {
          {}
        } else {
          stryCov_9fa48("105044");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
        }
      }
      const workflowId = metadata.workflowId;
      if (stryMutAct_9fa48("105047") ? false : stryMutAct_9fa48("105046") ? true : stryMutAct_9fa48("105045") ? workflowId : (stryCov_9fa48("105045", "105046", "105047"), !workflowId)) {
        if (stryMutAct_9fa48("105048")) {
          {}
        } else {
          stryCov_9fa48("105048");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
        }
      }
      const ack = stryMutAct_9fa48("105049") ? {} : (stryCov_9fa48("105049"), {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.STATUS]: ackStatus,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: Date.now()
      });
      if (stryMutAct_9fa48("105051") ? false : stryMutAct_9fa48("105050") ? true : (stryCov_9fa48("105050", "105051"), checkpoint)) {
        if (stryMutAct_9fa48("105052")) {
          {}
        } else {
          stryCov_9fa48("105052");
          ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
        }
      }
      const result = await splitWorkflow.acknowledgeSourceParticipant(workflowId, ack);
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_ACK_EMITTED, stryMutAct_9fa48("105053") ? {} : (stryCov_9fa48("105053"), {
        partitionId: this.partitionId,
        workflowId,
        ackStatus,
        result: stryMutAct_9fa48("105054") ? result.result : (stryCov_9fa48("105054"), result?.result)
      }));
      return result;
    }
  } /**
    * Open a snapshot reader pinned to the current source-partition state.
    * Falls back to the live connection for in-memory test databases.
    * @return {Database|Object} Snapshot database handle.
    * @private
    */
  openSplitSnapshotDatabase() {
    if (stryMutAct_9fa48("105055")) {
      {}
    } else {
      stryCov_9fa48("105055");
      if (stryMutAct_9fa48("105058") ? !this.dbPath && this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("105057") ? false : stryMutAct_9fa48("105056") ? true : (stryCov_9fa48("105056", "105057", "105058"), (stryMutAct_9fa48("105059") ? this.dbPath : (stryCov_9fa48("105059"), !this.dbPath)) || (stryMutAct_9fa48("105061") ? this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("105060") ? false : (stryCov_9fa48("105060", "105061"), this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH)))) {
        if (stryMutAct_9fa48("105062")) {
          {}
        } else {
          stryCov_9fa48("105062");
          return stryMutAct_9fa48("105063") ? {} : (stryCov_9fa48("105063"), {
            prepare: stryMutAct_9fa48("105064") ? () => undefined : (stryCov_9fa48("105064"), (...args) => this.db.prepare(...args)),
            close() {}
          });
        }
      }
      const snapshotDb = new Database(this.dbPath, stryMutAct_9fa48("105065") ? {} : (stryCov_9fa48("105065"), {
        readonly: stryMutAct_9fa48("105066") ? false : (stryCov_9fa48("105066"), true),
        fileMustExist: stryMutAct_9fa48("105067") ? false : (stryCov_9fa48("105067"), true)
      }));
      snapshotDb.exec(PARTITION_SERVICE_LITERAL.BEGIN);
      return snapshotDb;
    }
  } /**
    * Yield one event-loop turn during source snapshot backfill so a split does
    * not monopolize unrelated partitions on the same node.
    * @return {Promise<void>}
    * @private
    */
  async yieldSplitBackfillTurn() {
    if (stryMutAct_9fa48("105068")) {
      {}
    } else {
      stryCov_9fa48("105068");
      await new Promise(resolve => {
        if (stryMutAct_9fa48("105069")) {
          {}
        } else {
          stryCov_9fa48("105069");
          if (stryMutAct_9fa48("105072") ? typeof setImmediate !== TYPEOF.FUNCTION : stryMutAct_9fa48("105071") ? false : stryMutAct_9fa48("105070") ? true : (stryCov_9fa48("105070", "105071", "105072"), typeof setImmediate === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("105073")) {
              {}
            } else {
              stryCov_9fa48("105073");
              setImmediate(resolve);
              return;
            }
          }
          setTimeout(resolve, NUM.ZERO);
        }
      });
    }
  } /**
    * Create a row iterator for split snapshot backfill.
    * Prefer iterate() so large source snapshots are streamed.
    * @param {Database|Object} snapshotDb - Snapshot handle.
    * @param {Object} metadata - Normalized split metadata.
    * @return {Iterable<Object>}
    * @private
    */
  createSplitSnapshotRowIterator(snapshotDb, metadata) {
    if (stryMutAct_9fa48("105074")) {
      {}
    } else {
      stryCov_9fa48("105074");
      const sql = (stryMutAct_9fa48("105075") ? `` : (stryCov_9fa48("105075"), `SELECT * FROM ${this.tableName} `)) + (stryMutAct_9fa48("105076") ? `` : (stryCov_9fa48("105076"), `ORDER BY ${metadata.primaryKeyColumn}`));
      const statement = snapshotDb.prepare(sql);
      if (stryMutAct_9fa48("105079") ? statement || typeof statement.iterate === TYPEOF.FUNCTION : stryMutAct_9fa48("105078") ? false : stryMutAct_9fa48("105077") ? true : (stryCov_9fa48("105077", "105078", "105079"), statement && (stryMutAct_9fa48("105081") ? typeof statement.iterate !== TYPEOF.FUNCTION : stryMutAct_9fa48("105080") ? true : (stryCov_9fa48("105080", "105081"), typeof statement.iterate === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("105082")) {
          {}
        } else {
          stryCov_9fa48("105082");
          return statement.iterate();
        }
      }
      if (stryMutAct_9fa48("105085") ? statement || typeof statement.all === TYPEOF.FUNCTION : stryMutAct_9fa48("105084") ? false : stryMutAct_9fa48("105083") ? true : (stryCov_9fa48("105083", "105084", "105085"), statement && (stryMutAct_9fa48("105087") ? typeof statement.all !== TYPEOF.FUNCTION : stryMutAct_9fa48("105086") ? true : (stryCov_9fa48("105086", "105087"), typeof statement.all === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("105088")) {
          {}
        } else {
          stryCov_9fa48("105088");
          return statement.all();
        }
      }
      return stryMutAct_9fa48("105089") ? ["Stryker was here"] : (stryCov_9fa48("105089"), []);
    }
  } /**
    * Copy the source snapshot into child partitions using idempotent upserts.
    * @param {Database|Object} snapshotDb - Snapshot handle.
    * @param {Object} metadata - Normalized split metadata.
    * @return {Promise<void>}
    * @private
    */
  async backfillSplitSnapshot(snapshotDb, metadata) {
    if (stryMutAct_9fa48("105090")) {
      {}
    } else {
      stryCov_9fa48("105090");
      const columns = snapshotDb.prepare(stryMutAct_9fa48("105091") ? `` : (stryCov_9fa48("105091"), `PRAGMA table_info(${this.tableName})`)).all().map(stryMutAct_9fa48("105092") ? () => undefined : (stryCov_9fa48("105092"), column => column.name));
      const rows = this.createSplitSnapshotRowIterator(snapshotDb, metadata);
      let processedRowCount = NUM.ZERO;
      for (const row of rows) {
        if (stryMutAct_9fa48("105093")) {
          {}
        } else {
          stryCov_9fa48("105093");
          await this.applySplitSnapshotRow(row, columns, metadata);
          stryMutAct_9fa48("105094") ? processedRowCount -= NUM.ONE : (stryCov_9fa48("105094"), processedRowCount += NUM.ONE);
          if (stryMutAct_9fa48("105097") ? this.splitSnapshotBackfillYieldEveryRows > NUM.ZERO || processedRowCount % this.splitSnapshotBackfillYieldEveryRows === NUM.ZERO : stryMutAct_9fa48("105096") ? false : stryMutAct_9fa48("105095") ? true : (stryCov_9fa48("105095", "105096", "105097"), (stryMutAct_9fa48("105100") ? this.splitSnapshotBackfillYieldEveryRows <= NUM.ZERO : stryMutAct_9fa48("105099") ? this.splitSnapshotBackfillYieldEveryRows >= NUM.ZERO : stryMutAct_9fa48("105098") ? true : (stryCov_9fa48("105098", "105099", "105100"), this.splitSnapshotBackfillYieldEveryRows > NUM.ZERO)) && (stryMutAct_9fa48("105102") ? processedRowCount % this.splitSnapshotBackfillYieldEveryRows !== NUM.ZERO : stryMutAct_9fa48("105101") ? true : (stryCov_9fa48("105101", "105102"), (stryMutAct_9fa48("105103") ? processedRowCount * this.splitSnapshotBackfillYieldEveryRows : (stryCov_9fa48("105103"), processedRowCount % this.splitSnapshotBackfillYieldEveryRows)) === NUM.ZERO)))) {
            if (stryMutAct_9fa48("105104")) {
              {}
            } else {
              stryCov_9fa48("105104");
              await this.yieldSplitBackfillTurn();
            }
          }
        }
      }
    }
  } /**
    * Apply one snapshot row to the correct child partition.
    * @param {Object} row - Source row.
    * @param {Array<string>} columns - Column list.
    * @param {Object} metadata - Split metadata.
    * @return {Promise<void>}
    * @private
    */
  async applySplitSnapshotRow(row, columns, metadata) {
    if (stryMutAct_9fa48("105105")) {
      {}
    } else {
      stryCov_9fa48("105105");
      const targetPartitionId = this.resolveSplitTargetPartitionId(stryMutAct_9fa48("105106") ? row[metadata.primaryKeyColumn] : (stryCov_9fa48("105106"), row?.[metadata.primaryKeyColumn]), metadata);
      const placeholders = columns.map(stryMutAct_9fa48("105107") ? () => undefined : (stryCov_9fa48("105107"), () => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const sql = (stryMutAct_9fa48("105108") ? `` : (stryCov_9fa48("105108"), `${SQL.INSERT_OR_REPLACE_INTO} ${this.tableName} `)) + (stryMutAct_9fa48("105109") ? `` : (stryCov_9fa48("105109"), `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) `)) + (stryMutAct_9fa48("105110") ? `` : (stryCov_9fa48("105110"), `${SQL.VALUES} (${placeholders})`));
      const params = columns.map(stryMutAct_9fa48("105111") ? () => undefined : (stryCov_9fa48("105111"), column => row[column]));
      await this.routeSplitMirroredWrite(targetPartitionId, sql, params);
    }
  } /**
    * Update table metadata so routing flips to the new partition version.
    * @param {Object} metadata - Split metadata.
    * @return {Promise<void>}
    * @private
    */
  async markSplitCutoverActive(metadata) {
    if (stryMutAct_9fa48("105112")) {
      {}
    } else {
      stryCov_9fa48("105112");
      const splitWorkflow = stryMutAct_9fa48("105113") ? this.sqlQueryEngine.managedSplitWorkflow : (stryCov_9fa48("105113"), this.sqlQueryEngine?.managedSplitWorkflow);
      if (stryMutAct_9fa48("105116") ? !splitWorkflow && typeof splitWorkflow.advanceSplitPhase !== TYPEOF.FUNCTION : stryMutAct_9fa48("105115") ? false : stryMutAct_9fa48("105114") ? true : (stryCov_9fa48("105114", "105115", "105116"), (stryMutAct_9fa48("105117") ? splitWorkflow : (stryCov_9fa48("105117"), !splitWorkflow)) || (stryMutAct_9fa48("105119") ? typeof splitWorkflow.advanceSplitPhase === TYPEOF.FUNCTION : stryMutAct_9fa48("105118") ? false : (stryCov_9fa48("105118", "105119"), typeof splitWorkflow.advanceSplitPhase !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("105120")) {
          {}
        } else {
          stryCov_9fa48("105120");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
        }
      }
      const workflowId = metadata.workflowId;
      if (stryMutAct_9fa48("105123") ? false : stryMutAct_9fa48("105122") ? true : stryMutAct_9fa48("105121") ? workflowId : (stryCov_9fa48("105121", "105122", "105123"), !workflowId)) {
        if (stryMutAct_9fa48("105124")) {
          {}
        } else {
          stryCov_9fa48("105124");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
        }
      }
      await splitWorkflow.advanceSplitPhase(workflowId, PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, stryMutAct_9fa48("105125") ? {} : (stryCov_9fa48("105125"), {
        [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]: Date.now()
      }));
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_CUTOVER_UPDATED, stryMutAct_9fa48("105126") ? {} : (stryCov_9fa48("105126"), {
        partitionId: this.partitionId,
        tableId: this.tableId,
        targetPartitionVersion: metadata.targetPartitionVersion,
        targetPartitionIds: metadata.targetPartitionIds
      }));
    }
  } /**
    * Handle source-partition writes while a split is in progress.
    * Backfilling queues ordered deltas; cutover-active mirrors immediately.
    * @param {Object} entry - Applied source write entry.
    * @return {Promise<void>}
    * @private
    */
  async handleSplitReplicationAfterWrite(entry) {
    if (stryMutAct_9fa48("105127")) {
      {}
    } else {
      stryCov_9fa48("105127");
      const splitReplication = this.splitReplication;
      if (stryMutAct_9fa48("105130") ? (!splitReplication || !splitReplication.metadata) && this.partitionId !== splitReplication.metadata.sourcePartitionId : stryMutAct_9fa48("105129") ? false : stryMutAct_9fa48("105128") ? true : (stryCov_9fa48("105128", "105129", "105130"), (stryMutAct_9fa48("105132") ? !splitReplication && !splitReplication.metadata : stryMutAct_9fa48("105131") ? false : (stryCov_9fa48("105131", "105132"), (stryMutAct_9fa48("105133") ? splitReplication : (stryCov_9fa48("105133"), !splitReplication)) || (stryMutAct_9fa48("105134") ? splitReplication.metadata : (stryCov_9fa48("105134"), !splitReplication.metadata)))) || (stryMutAct_9fa48("105136") ? this.partitionId === splitReplication.metadata.sourcePartitionId : stryMutAct_9fa48("105135") ? false : (stryCov_9fa48("105135", "105136"), this.partitionId !== splitReplication.metadata.sourcePartitionId)))) {
        if (stryMutAct_9fa48("105137")) {
          {}
        } else {
          stryCov_9fa48("105137");
          return;
        }
      }
      if (stryMutAct_9fa48("105140") ? entry.splitMirrorOrigin !== PARTITION_SPLIT_MIRROR_ORIGIN.TARGET : stryMutAct_9fa48("105139") ? false : stryMutAct_9fa48("105138") ? true : (stryCov_9fa48("105138", "105139", "105140"), entry.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.TARGET)) {
        if (stryMutAct_9fa48("105141")) {
          {}
        } else {
          stryCov_9fa48("105141");
          return;
        }
      }
      if (stryMutAct_9fa48("105144") ? splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING && splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP : stryMutAct_9fa48("105143") ? false : stryMutAct_9fa48("105142") ? true : (stryCov_9fa48("105142", "105143", "105144"), (stryMutAct_9fa48("105146") ? splitReplication.phase !== PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING : stryMutAct_9fa48("105145") ? false : (stryCov_9fa48("105145", "105146"), splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING)) || (stryMutAct_9fa48("105148") ? splitReplication.phase !== PARTITION_TRANSITION_STATE.SPLIT_CATCHUP : stryMutAct_9fa48("105147") ? false : (stryCov_9fa48("105147", "105148"), splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP)))) {
        if (stryMutAct_9fa48("105149")) {
          {}
        } else {
          stryCov_9fa48("105149");
          splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
          return;
        }
      }
      if (stryMutAct_9fa48("105152") ? splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE : stryMutAct_9fa48("105151") ? false : stryMutAct_9fa48("105150") ? true : (stryCov_9fa48("105150", "105151", "105152"), splitReplication.phase !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE)) {
        if (stryMutAct_9fa48("105153")) {
          {}
        } else {
          stryCov_9fa48("105153");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("105154")) {
          {}
        } else {
          stryCov_9fa48("105154");
          await this.replaySplitEntry(entry, splitReplication.metadata);
        }
      } catch (error) {
        if (stryMutAct_9fa48("105155")) {
          {}
        } else {
          stryCov_9fa48("105155");
          splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
          splitReplication.lastError = error.message;
          this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED, stryMutAct_9fa48("105156") ? {} : (stryCov_9fa48("105156"), {
            partitionId: this.partitionId,
            error: error.message
          }));
          this.flushSplitReplicationQueue().catch(flushError => {
            if (stryMutAct_9fa48("105157")) {
              {}
            } else {
              stryCov_9fa48("105157");
              splitReplication.lastError = flushError.message;
              this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED, stryMutAct_9fa48("105158") ? {} : (stryCov_9fa48("105158"), {
                partitionId: this.partitionId,
                error: flushError.message
              }));
            }
          });
        }
      }
    }
  } /**
    * Flush queued post-snapshot deltas in source order.
    * @return {Promise<void>}
    * @private
    */
  async flushSplitReplicationQueue() {
    if (stryMutAct_9fa48("105159")) {
      {}
    } else {
      stryCov_9fa48("105159");
      const splitReplication = this.splitReplication;
      if (stryMutAct_9fa48("105162") ? !splitReplication && splitReplication.flushInFlight : stryMutAct_9fa48("105161") ? false : stryMutAct_9fa48("105160") ? true : (stryCov_9fa48("105160", "105161", "105162"), (stryMutAct_9fa48("105163") ? splitReplication : (stryCov_9fa48("105163"), !splitReplication)) || splitReplication.flushInFlight)) {
        if (stryMutAct_9fa48("105164")) {
          {}
        } else {
          stryCov_9fa48("105164");
          return;
        }
      }
      splitReplication.flushInFlight = stryMutAct_9fa48("105165") ? false : (stryCov_9fa48("105165"), true);
      try {
        if (stryMutAct_9fa48("105166")) {
          {}
        } else {
          stryCov_9fa48("105166");
          while (stryMutAct_9fa48("105169") ? splitReplication.pendingEntries.length <= NUM.ZERO : stryMutAct_9fa48("105168") ? splitReplication.pendingEntries.length >= NUM.ZERO : stryMutAct_9fa48("105167") ? false : (stryCov_9fa48("105167", "105168", "105169"), splitReplication.pendingEntries.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("105170")) {
              {}
            } else {
              stryCov_9fa48("105170");
              const entry = splitReplication.pendingEntries.shift();
              try {
                if (stryMutAct_9fa48("105171")) {
                  {}
                } else {
                  stryCov_9fa48("105171");
                  await this.replaySplitEntry(entry, splitReplication.metadata);
                }
              } catch (error) {
                if (stryMutAct_9fa48("105172")) {
                  {}
                } else {
                  stryCov_9fa48("105172");
                  splitReplication.pendingEntries.unshift(entry);
                  throw error;
                }
              }
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("105173")) {
          {}
        } else {
          stryCov_9fa48("105173");
          splitReplication.flushInFlight = stryMutAct_9fa48("105174") ? true : (stryCov_9fa48("105174"), false);
        }
      }
    }
  } /**
    * Clone a write entry before placing it in the split catch-up queue.
    * @param {Object} entry - Applied write entry.
    * @return {Object} Safe queued copy.
    * @private
    */
  cloneSplitEntry(entry) {
    if (stryMutAct_9fa48("105175")) {
      {}
    } else {
      stryCov_9fa48("105175");
      return stryMutAct_9fa48("105176") ? {} : (stryCov_9fa48("105176"), {
        ...entry,
        params: Array.isArray(stryMutAct_9fa48("105177") ? entry.params : (stryCov_9fa48("105177"), entry?.params)) ? stryMutAct_9fa48("105178") ? [] : (stryCov_9fa48("105178"), [...entry.params]) : stryMutAct_9fa48("105179") ? ["Stryker was here"] : (stryCov_9fa48("105179"), []),
        data: (stryMutAct_9fa48("105182") ? entry?.data || typeof entry.data === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("105181") ? false : stryMutAct_9fa48("105180") ? true : (stryCov_9fa48("105180", "105181", "105182"), (stryMutAct_9fa48("105183") ? entry.data : (stryCov_9fa48("105183"), entry?.data)) && (stryMutAct_9fa48("105185") ? typeof entry.data !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("105184") ? true : (stryCov_9fa48("105184", "105185"), typeof entry.data === PARTITION_SERVICE_LITERAL.OBJECT)))) ? stryMutAct_9fa48("105186") ? {} : (stryCov_9fa48("105186"), {
          ...entry.data
        }) : stryMutAct_9fa48("105187") ? entry.data : (stryCov_9fa48("105187"), entry?.data),
        whereClause: (stryMutAct_9fa48("105190") ? entry?.whereClause || typeof entry.whereClause === PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("105189") ? false : stryMutAct_9fa48("105188") ? true : (stryCov_9fa48("105188", "105189", "105190"), (stryMutAct_9fa48("105191") ? entry.whereClause : (stryCov_9fa48("105191"), entry?.whereClause)) && (stryMutAct_9fa48("105193") ? typeof entry.whereClause !== PARTITION_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("105192") ? true : (stryCov_9fa48("105192", "105193"), typeof entry.whereClause === PARTITION_SERVICE_LITERAL.OBJECT)))) ? stryMutAct_9fa48("105194") ? {} : (stryCov_9fa48("105194"), {
          ...entry.whereClause
        }) : stryMutAct_9fa48("105195") ? entry.whereClause : (stryCov_9fa48("105195"), entry?.whereClause)
      });
    }
  } /**
    * Replay one queued source write against the correct child partition.
    * @param {Object} entry - Applied source write entry.
    * @param {Object} metadata - Split metadata.
    * @return {Promise<void>}
    * @private
    */
  async replaySplitEntry(entry, metadata) {
    if (stryMutAct_9fa48("105196")) {
      {}
    } else {
      stryCov_9fa48("105196");
      const routingKey = this.extractSplitRoutingKey(entry, metadata.primaryKeyColumn);
      const targetPartitionId = this.resolveSplitTargetPartitionId(routingKey, metadata);
      await this.routeSplitMirroredWrite(targetPartitionId, entry.sql, stryMutAct_9fa48("105199") ? entry.params && [] : stryMutAct_9fa48("105198") ? false : stryMutAct_9fa48("105197") ? true : (stryCov_9fa48("105197", "105198", "105199"), entry.params || (stryMutAct_9fa48("105200") ? ["Stryker was here"] : (stryCov_9fa48("105200"), []))));
    }
  } /**
    * Route one mirrored write through the standard partition query path.
    * @param {string} partitionId - Child partition ID.
    * @param {string} sql - SQL statement.
    * @param {Array} params - Statement parameters.
    * @return {Promise<void>}
    * @private
    */
  async routeSplitMirroredWrite(partitionId, sql, params) {
    if (stryMutAct_9fa48("105201")) {
      {}
    } else {
      stryCov_9fa48("105201");
      const queryExecutor = stryMutAct_9fa48("105204") ? this.sqlQueryEngine?.queryExecutor && null : stryMutAct_9fa48("105203") ? false : stryMutAct_9fa48("105202") ? true : (stryCov_9fa48("105202", "105203", "105204"), (stryMutAct_9fa48("105205") ? this.sqlQueryEngine.queryExecutor : (stryCov_9fa48("105205"), this.sqlQueryEngine?.queryExecutor)) || null);
      if (stryMutAct_9fa48("105208") ? !queryExecutor && typeof queryExecutor.executeOnPartition !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105207") ? false : stryMutAct_9fa48("105206") ? true : (stryCov_9fa48("105206", "105207", "105208"), (stryMutAct_9fa48("105209") ? queryExecutor : (stryCov_9fa48("105209"), !queryExecutor)) || (stryMutAct_9fa48("105211") ? typeof queryExecutor.executeOnPartition === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105210") ? false : (stryCov_9fa48("105210", "105211"), typeof queryExecutor.executeOnPartition !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("105212")) {
          {}
        } else {
          stryCov_9fa48("105212");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
        }
      }
      const result = await queryExecutor.executeOnPartition(partitionId, sql, params, stryMutAct_9fa48("105213") ? true : (stryCov_9fa48("105213"), false), stryMutAct_9fa48("105214") ? false : (stryCov_9fa48("105214"), true), stryMutAct_9fa48("105215") ? true : (stryCov_9fa48("105215"), false), stryMutAct_9fa48("105216") ? {} : (stryCov_9fa48("105216"), {
        splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SOURCE
      }));
      if (stryMutAct_9fa48("105219") ? false : stryMutAct_9fa48("105218") ? true : stryMutAct_9fa48("105217") ? result?.success : (stryCov_9fa48("105217", "105218", "105219"), !(stryMutAct_9fa48("105220") ? result.success : (stryCov_9fa48("105220"), result?.success)))) {
        if (stryMutAct_9fa48("105221")) {
          {}
        } else {
          stryCov_9fa48("105221");
          throw new Error(stryMutAct_9fa48("105224") ? result?.error && PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED : stryMutAct_9fa48("105223") ? false : stryMutAct_9fa48("105222") ? true : (stryCov_9fa48("105222", "105223", "105224"), (stryMutAct_9fa48("105225") ? result.error : (stryCov_9fa48("105225"), result?.error)) || PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED));
        }
      }
    }
  } /**
    * Resolve the child partition ID for one partition-key value.
    * @param {*} value - Primary-key value.
    * @param {Object} metadata - Split metadata.
    * @return {string} Target child partition ID.
    * @private
    */
  resolveSplitTargetPartitionId(value, metadata) {
    if (stryMutAct_9fa48("105226")) {
      {}
    } else {
      stryCov_9fa48("105226");
      const [leftPartitionId, rightPartitionId] = metadata.targetPartitionIds;
      if (stryMutAct_9fa48("105229") ? value === null && value === undefined : stryMutAct_9fa48("105228") ? false : stryMutAct_9fa48("105227") ? true : (stryCov_9fa48("105227", "105228", "105229"), (stryMutAct_9fa48("105231") ? value !== null : stryMutAct_9fa48("105230") ? false : (stryCov_9fa48("105230", "105231"), value === null)) || (stryMutAct_9fa48("105233") ? value !== undefined : stryMutAct_9fa48("105232") ? false : (stryCov_9fa48("105232", "105233"), value === undefined)))) {
        if (stryMutAct_9fa48("105234")) {
          {}
        } else {
          stryCov_9fa48("105234");
          return rightPartitionId;
        }
      }
      return (stryMutAct_9fa48("105238") ? value >= metadata.splitKey : stryMutAct_9fa48("105237") ? value <= metadata.splitKey : stryMutAct_9fa48("105236") ? false : stryMutAct_9fa48("105235") ? true : (stryCov_9fa48("105235", "105236", "105237", "105238"), value < metadata.splitKey)) ? leftPartitionId : rightPartitionId;
    }
  } /**
    * Extract the partition routing key from an applied write entry.
    * @param {Object} entry - Applied source write entry.
    * @param {string} primaryKeyColumn - Partition key column.
    * @return {*} Routing key.
    * @private
    */
  extractSplitRoutingKey(entry, primaryKeyColumn) {
    if (stryMutAct_9fa48("105239")) {
      {}
    } else {
      stryCov_9fa48("105239");
      if (stryMutAct_9fa48("105242") ? entry?.whereClause || Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn) : stryMutAct_9fa48("105241") ? false : stryMutAct_9fa48("105240") ? true : (stryCov_9fa48("105240", "105241", "105242"), (stryMutAct_9fa48("105243") ? entry.whereClause : (stryCov_9fa48("105243"), entry?.whereClause)) && Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn))) {
        if (stryMutAct_9fa48("105244")) {
          {}
        } else {
          stryCov_9fa48("105244");
          return entry.whereClause[primaryKeyColumn];
        }
      }
      if (stryMutAct_9fa48("105247") ? entry?.data || Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn) : stryMutAct_9fa48("105246") ? false : stryMutAct_9fa48("105245") ? true : (stryCov_9fa48("105245", "105246", "105247"), (stryMutAct_9fa48("105248") ? entry.data : (stryCov_9fa48("105248"), entry?.data)) && Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn))) {
        if (stryMutAct_9fa48("105249")) {
          {}
        } else {
          stryCov_9fa48("105249");
          return entry.data[primaryKeyColumn];
        }
      }
      let operationType = stryMutAct_9fa48("105252") ? entry?.type && PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("105251") ? false : stryMutAct_9fa48("105250") ? true : (stryCov_9fa48("105250", "105251", "105252"), (stryMutAct_9fa48("105253") ? entry.type : (stryCov_9fa48("105253"), entry?.type)) || PARTITION_SERVICE_OPERATION.QUERY);
      if (stryMutAct_9fa48("105256") ? operationType === PARTITION_SERVICE_OPERATION.QUERY || entry?.sql : stryMutAct_9fa48("105255") ? false : stryMutAct_9fa48("105254") ? true : (stryCov_9fa48("105254", "105255", "105256"), (stryMutAct_9fa48("105258") ? operationType !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("105257") ? true : (stryCov_9fa48("105257", "105258"), operationType === PARTITION_SERVICE_OPERATION.QUERY)) && (stryMutAct_9fa48("105259") ? entry.sql : (stryCov_9fa48("105259"), entry?.sql)))) {
        if (stryMutAct_9fa48("105260")) {
          {}
        } else {
          stryCov_9fa48("105260");
          const sqlUpper = stryMutAct_9fa48("105262") ? entry.sql.toUpperCase() : stryMutAct_9fa48("105261") ? entry.sql.trim().toLowerCase() : (stryCov_9fa48("105261", "105262"), entry.sql.trim().toUpperCase());
          if (stryMutAct_9fa48("105265") ? sqlUpper.endsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase()) : stryMutAct_9fa48("105264") ? false : stryMutAct_9fa48("105263") ? true : (stryCov_9fa48("105263", "105264", "105265"), sqlUpper.startsWith(stryMutAct_9fa48("105266") ? SQL.INSERT_OR_REPLACE_INTO.toLowerCase() : (stryCov_9fa48("105266"), SQL.INSERT_OR_REPLACE_INTO.toUpperCase())))) {
            if (stryMutAct_9fa48("105267")) {
              {}
            } else {
              stryCov_9fa48("105267");
              operationType = PARTITION_SERVICE_OPERATION.UPSERT;
            }
          } else if (stryMutAct_9fa48("105270") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.INSERT) : stryMutAct_9fa48("105269") ? false : stryMutAct_9fa48("105268") ? true : (stryCov_9fa48("105268", "105269", "105270"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT))) {
            if (stryMutAct_9fa48("105271")) {
              {}
            } else {
              stryCov_9fa48("105271");
              operationType = PARTITION_SERVICE_OPERATION.INSERT;
            }
          } else if (stryMutAct_9fa48("105274") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.UPDATE) : stryMutAct_9fa48("105273") ? false : stryMutAct_9fa48("105272") ? true : (stryCov_9fa48("105272", "105273", "105274"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE))) {
            if (stryMutAct_9fa48("105275")) {
              {}
            } else {
              stryCov_9fa48("105275");
              operationType = PARTITION_SERVICE_OPERATION.UPDATE;
            }
          } else if (stryMutAct_9fa48("105278") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.DELETE) : stryMutAct_9fa48("105277") ? false : stryMutAct_9fa48("105276") ? true : (stryCov_9fa48("105276", "105277", "105278"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE))) {
            if (stryMutAct_9fa48("105279")) {
              {}
            } else {
              stryCov_9fa48("105279");
              operationType = PARTITION_SERVICE_OPERATION.DELETE;
            }
          }
        }
      }
      let extracted = {};
      if (stryMutAct_9fa48("105282") ? entry.sql : stryMutAct_9fa48("105281") ? false : stryMutAct_9fa48("105280") ? true : (stryCov_9fa48("105280", "105281", "105282"), entry?.sql)) {
        if (stryMutAct_9fa48("105283")) {
          {}
        } else {
          stryCov_9fa48("105283");
          const params = Array.isArray(entry.params) ? entry.params : stryMutAct_9fa48("105284") ? ["Stryker was here"] : (stryCov_9fa48("105284"), []);
          if (stryMutAct_9fa48("105287") ? params.length > NUM.ZERO || entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK) : stryMutAct_9fa48("105286") ? false : stryMutAct_9fa48("105285") ? true : (stryCov_9fa48("105285", "105286", "105287"), (stryMutAct_9fa48("105290") ? params.length <= NUM.ZERO : stryMutAct_9fa48("105289") ? params.length >= NUM.ZERO : stryMutAct_9fa48("105288") ? true : (stryCov_9fa48("105288", "105289", "105290"), params.length > NUM.ZERO)) && entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK))) {
            if (stryMutAct_9fa48("105291")) {
              {}
            } else {
              stryCov_9fa48("105291");
              extracted = this.extractDataFromParameterizedSQL(entry.sql, params, this.tableName, operationType);
            }
          } else if (stryMutAct_9fa48("105294") ? operationType === PARTITION_SERVICE_OPERATION.INSERT && operationType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("105293") ? false : stryMutAct_9fa48("105292") ? true : (stryCov_9fa48("105292", "105293", "105294"), (stryMutAct_9fa48("105296") ? operationType !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("105295") ? false : (stryCov_9fa48("105295", "105296"), operationType === PARTITION_SERVICE_OPERATION.INSERT)) || (stryMutAct_9fa48("105298") ? operationType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("105297") ? false : (stryCov_9fa48("105297", "105298"), operationType === PARTITION_SERVICE_OPERATION.UPSERT)))) {
            if (stryMutAct_9fa48("105299")) {
              {}
            } else {
              stryCov_9fa48("105299");
              extracted = this.extractInsertDataFromSQL(entry.sql, this.tableName);
            }
          } else if (stryMutAct_9fa48("105302") ? operationType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("105301") ? false : stryMutAct_9fa48("105300") ? true : (stryCov_9fa48("105300", "105301", "105302"), operationType === PARTITION_SERVICE_OPERATION.UPDATE)) {
            if (stryMutAct_9fa48("105303")) {
              {}
            } else {
              stryCov_9fa48("105303");
              extracted = this.extractUpdateDataFromSQL(entry.sql, this.tableName);
            }
          } else if (stryMutAct_9fa48("105306") ? operationType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("105305") ? false : stryMutAct_9fa48("105304") ? true : (stryCov_9fa48("105304", "105305", "105306"), operationType === PARTITION_SERVICE_OPERATION.DELETE)) {
            if (stryMutAct_9fa48("105307")) {
              {}
            } else {
              stryCov_9fa48("105307");
              extracted = this.extractDeleteDataFromSQL(entry.sql);
            }
          }
        }
      }
      const routingKey = stryMutAct_9fa48("105308") ? extracted[primaryKeyColumn] : (stryCov_9fa48("105308"), extracted?.[primaryKeyColumn]);
      if (stryMutAct_9fa48("105311") ? routingKey === undefined && routingKey === null : stryMutAct_9fa48("105310") ? false : stryMutAct_9fa48("105309") ? true : (stryCov_9fa48("105309", "105310", "105311"), (stryMutAct_9fa48("105313") ? routingKey !== undefined : stryMutAct_9fa48("105312") ? false : (stryCov_9fa48("105312", "105313"), routingKey === undefined)) || (stryMutAct_9fa48("105315") ? routingKey !== null : stryMutAct_9fa48("105314") ? false : (stryCov_9fa48("105314", "105315"), routingKey === null)))) {
        if (stryMutAct_9fa48("105316")) {
          {}
        } else {
          stryCov_9fa48("105316");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
        }
      }
      return routingKey;
    }
  } /**
    * Get the partition key range.
    * @return {Object} Key range {start, end}.
    */
  getKeyRange() {
    if (stryMutAct_9fa48("105317")) {
      {}
    } else {
      stryCov_9fa48("105317");
      return stryMutAct_9fa48("105318") ? {} : (stryCov_9fa48("105318"), {
        ...this.keyRange
      });
    }
  } /**
    * Set the partition key range.
    * @param {Object} keyRange - New key range {start, end}.
    */
  setKeyRange(keyRange) {
    if (stryMutAct_9fa48("105319")) {
      {}
    } else {
      stryCov_9fa48("105319");
      this.keyRange = stryMutAct_9fa48("105320") ? {} : (stryCov_9fa48("105320"), {
        ...keyRange
      });
      this.emit(PARTITION_SERVICE_EVENT.KEY_RANGE_CHANGED, stryMutAct_9fa48("105321") ? {} : (stryCov_9fa48("105321"), {
        partitionId: this.partitionId,
        keyRange: this.keyRange
      }));
    }
  } /**
    * Check if a key falls within this partition's range.
    * @param {*} key - Key to check.
    * @return {boolean} True if key is in range.
    */
  isKeyInRange(key) {
    if (stryMutAct_9fa48("105322")) {
      {}
    } else {
      stryCov_9fa48("105322");
      const {
        start,
        end
      } = this.keyRange; // NULL start means unbounded lower
      // NULL end means unbounded upper
      if (stryMutAct_9fa48("105325") ? start === null || end === null : stryMutAct_9fa48("105324") ? false : stryMutAct_9fa48("105323") ? true : (stryCov_9fa48("105323", "105324", "105325"), (stryMutAct_9fa48("105327") ? start !== null : stryMutAct_9fa48("105326") ? true : (stryCov_9fa48("105326", "105327"), start === null)) && (stryMutAct_9fa48("105329") ? end !== null : stryMutAct_9fa48("105328") ? true : (stryCov_9fa48("105328", "105329"), end === null)))) {
        if (stryMutAct_9fa48("105330")) {
          {}
        } else {
          stryCov_9fa48("105330");
          return stryMutAct_9fa48("105331") ? false : (stryCov_9fa48("105331"), true);
        }
      }
      if (stryMutAct_9fa48("105334") ? start !== null : stryMutAct_9fa48("105333") ? false : stryMutAct_9fa48("105332") ? true : (stryCov_9fa48("105332", "105333", "105334"), start === null)) {
        if (stryMutAct_9fa48("105335")) {
          {}
        } else {
          stryCov_9fa48("105335");
          return stryMutAct_9fa48("105339") ? key >= end : stryMutAct_9fa48("105338") ? key <= end : stryMutAct_9fa48("105337") ? false : stryMutAct_9fa48("105336") ? true : (stryCov_9fa48("105336", "105337", "105338", "105339"), key < end);
        }
      }
      if (stryMutAct_9fa48("105342") ? end !== null : stryMutAct_9fa48("105341") ? false : stryMutAct_9fa48("105340") ? true : (stryCov_9fa48("105340", "105341", "105342"), end === null)) {
        if (stryMutAct_9fa48("105343")) {
          {}
        } else {
          stryCov_9fa48("105343");
          return stryMutAct_9fa48("105347") ? key < start : stryMutAct_9fa48("105346") ? key > start : stryMutAct_9fa48("105345") ? false : stryMutAct_9fa48("105344") ? true : (stryCov_9fa48("105344", "105345", "105346", "105347"), key >= start);
        }
      }
      return stryMutAct_9fa48("105350") ? key >= start || key < end : stryMutAct_9fa48("105349") ? false : stryMutAct_9fa48("105348") ? true : (stryCov_9fa48("105348", "105349", "105350"), (stryMutAct_9fa48("105353") ? key < start : stryMutAct_9fa48("105352") ? key > start : stryMutAct_9fa48("105351") ? true : (stryCov_9fa48("105351", "105352", "105353"), key >= start)) && (stryMutAct_9fa48("105356") ? key >= end : stryMutAct_9fa48("105355") ? key <= end : stryMutAct_9fa48("105354") ? true : (stryCov_9fa48("105354", "105355", "105356"), key < end)));
    }
  } /**
    * Check if this replica is the leader.
    * @return {boolean} True if leader.
    */
  isLeaderReplica() {
    if (stryMutAct_9fa48("105357")) {
      {}
    } else {
      stryCov_9fa48("105357");
      return stryMutAct_9fa48("105360") ? this.role !== RaftRole.LEADER : stryMutAct_9fa48("105359") ? false : stryMutAct_9fa48("105358") ? true : (stryCov_9fa48("105358", "105359", "105360"), this.role === RaftRole.LEADER);
    }
  } /**
    * Get the current leader ID.
    * @return {string|null} Leader replica ID.
    */
  getLeaderId() {
    if (stryMutAct_9fa48("105361")) {
      {}
    } else {
      stryCov_9fa48("105361");
      return this.leaderId;
    }
  } /**
    * Get the current Raft role.
    * @return {string} Current role.
    */
  getRole() {
    if (stryMutAct_9fa48("105362")) {
      {}
    } else {
      stryCov_9fa48("105362");
      return this.role;
    }
  } /**
    * Get the current term.
    * @return {number} Current term.
    */
  getCurrentTerm() {
    if (stryMutAct_9fa48("105363")) {
      {}
    } else {
      stryCov_9fa48("105363");
      return stryMutAct_9fa48("105366") ? this.storage?.currentTerm && NUM.ZERO : stryMutAct_9fa48("105365") ? false : stryMutAct_9fa48("105364") ? true : (stryCov_9fa48("105364", "105365", "105366"), (stryMutAct_9fa48("105367") ? this.storage.currentTerm : (stryCov_9fa48("105367"), this.storage?.currentTerm)) || NUM.ZERO);
    }
  } /**
    * Get the partition state.
    * @return {string} Partition state.
    */
  getState() {
    if (stryMutAct_9fa48("105368")) {
      {}
    } else {
      stryCov_9fa48("105368");
      return this.state;
    }
  } /**
    * Get service status.
    * @return {Object} Service status.
    */
  getStatus() {
    if (stryMutAct_9fa48("105369")) {
      {}
    } else {
      stryCov_9fa48("105369");
      return stryMutAct_9fa48("105370") ? {} : (stryCov_9fa48("105370"), {
        partitionId: this.partitionId,
        tableId: this.tableId,
        tableName: this.tableName,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        role: this.role,
        isLeader: this.isLeader,
        leaderId: this.leaderId,
        term: stryMutAct_9fa48("105373") ? this.storage?.currentTerm && NUM.ZERO : stryMutAct_9fa48("105372") ? false : stryMutAct_9fa48("105371") ? true : (stryCov_9fa48("105371", "105372", "105373"), (stryMutAct_9fa48("105374") ? this.storage.currentTerm : (stryCov_9fa48("105374"), this.storage?.currentTerm)) || NUM.ZERO),
        logLength: stryMutAct_9fa48("105377") ? this.storage?.getLogLength() && NUM.ZERO : stryMutAct_9fa48("105376") ? false : stryMutAct_9fa48("105375") ? true : (stryCov_9fa48("105375", "105376", "105377"), (stryMutAct_9fa48("105378") ? this.storage.getLogLength() : (stryCov_9fa48("105378"), this.storage?.getLogLength())) || NUM.ZERO),
        state: this.state,
        keyRange: this.keyRange,
        sizeBytes: this.sizeBytes,
        replicaCount: this.replicaIds.length,
        cdcSubscribers: this.cdcSubscribers.size,
        initialized: this.initialized
      });
    }
  } /**
    * Set the system table cache for the rebalancer.
    * Called after cache hydration is complete.
    * @param {Object} systemTableCache - Read-only system table cache.
    */
  setSystemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("105379")) {
      {}
    } else {
      stryCov_9fa48("105379");
      this.systemTableCache = systemTableCache;
      if (stryMutAct_9fa48("105381") ? false : stryMutAct_9fa48("105380") ? true : (stryCov_9fa48("105380", "105381"), this.rebalancer)) {
        if (stryMutAct_9fa48("105382")) {
          {}
        } else {
          stryCov_9fa48("105382");
          this.rebalancer.systemTableCache = systemTableCache;
        }
      }
      if (stryMutAct_9fa48("105384") ? false : stryMutAct_9fa48("105383") ? true : (stryCov_9fa48("105383", "105384"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105385")) {
          {}
        } else {
          stryCov_9fa48("105385");
          this.rebalanceCoordinator.systemTableCache = systemTableCache;
        }
      }
      this.maybeInitializeRebalancer();
    }
  } /**
    * Set the CDC integration service for system table writes.
    * Called after cache hydration is complete.
    * Required for rebalancer to delete service rows after REMOVE_REPLICA.
    * @param {Object} cdcIntegrationService - CDC integration service.
    */
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("105386")) {
      {}
    } else {
      stryCov_9fa48("105386");
      this.cdcIntegrationService = cdcIntegrationService;
      if (stryMutAct_9fa48("105388") ? false : stryMutAct_9fa48("105387") ? true : (stryCov_9fa48("105387", "105388"), this.rebalancer)) {
        if (stryMutAct_9fa48("105389")) {
          {}
        } else {
          stryCov_9fa48("105389");
          this.rebalancer.cdcIntegrationService = cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("105391") ? false : stryMutAct_9fa48("105390") ? true : (stryCov_9fa48("105390", "105391"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105392")) {
          {}
        } else {
          stryCov_9fa48("105392");
          this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
        }
      }
      this.maybeInitializeRebalancer();
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("105393")) {
          {}
        } else {
          stryCov_9fa48("105393");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_ROLE_AFTER_CDC_FAILED, stryMutAct_9fa48("105394") ? {} : (stryCov_9fa48("105394"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("105395")) {
          {}
        } else {
          stryCov_9fa48("105395");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_LEADER_AFTER_CDC_FAILED, stryMutAct_9fa48("105396") ? {} : (stryCov_9fa48("105396"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
    }
  } /**
    * Set table policy service for rebalancing decisions.
    * @param {Object} tablePolicyService - Table policy service instance.
    */
  setTablePolicyService(tablePolicyService) {
    if (stryMutAct_9fa48("105397")) {
      {}
    } else {
      stryCov_9fa48("105397");
      this.tablePolicyService = tablePolicyService;
      if (stryMutAct_9fa48("105399") ? false : stryMutAct_9fa48("105398") ? true : (stryCov_9fa48("105398", "105399"), this.rebalancer)) {
        if (stryMutAct_9fa48("105400")) {
          {}
        } else {
          stryCov_9fa48("105400");
          this.rebalancer.tablePolicyService = tablePolicyService;
        }
      }
      if (stryMutAct_9fa48("105402") ? false : stryMutAct_9fa48("105401") ? true : (stryCov_9fa48("105401", "105402"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105403")) {
          {}
        } else {
          stryCov_9fa48("105403");
          this.rebalanceCoordinator.tablePolicyService = tablePolicyService;
        }
      }
      this.maybeInitializeRebalancer();
    }
  } /**
    * Set rebalance coordinator for partition rebalancing.
    * Allows partitions to bind to the shared control-plane coordinator.
    * @param {Object} rebalanceCoordinator - Rebalance coordinator.
    */
  setRebalanceCoordinator(rebalanceCoordinator) {
    if (stryMutAct_9fa48("105404")) {
      {}
    } else {
      stryCov_9fa48("105404");
      if (stryMutAct_9fa48("105407") ? false : stryMutAct_9fa48("105406") ? true : stryMutAct_9fa48("105405") ? rebalanceCoordinator : (stryCov_9fa48("105405", "105406", "105407"), !rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105408")) {
          {}
        } else {
          stryCov_9fa48("105408");
          return;
        }
      }
      this.rebindCoordinator(rebalanceCoordinator);
    }
  } /**
    * Canonical rebind API for coordinator replacement.
    *
    * This is the single path for updating the coordinator reference,
    * propagating the change to the rebalancer, and emitting a
    * diagnostic log. All coordinator replacement MUST route here.
    *
    * Validates: Requirements 7.2, 7.3
    * Design: D8.2, D8.3
    *
    * @param {Object} newCoordinator - The new coordinator instance.
    */
  rebindCoordinator(newCoordinator) {
    if (stryMutAct_9fa48("105409")) {
      {}
    } else {
      stryCov_9fa48("105409");
      const previousCoordinator = this.rebalanceCoordinator;
      const hadPrevious = stryMutAct_9fa48("105410") ? !previousCoordinator : (stryCov_9fa48("105410"), !(stryMutAct_9fa48("105411") ? previousCoordinator : (stryCov_9fa48("105411"), !previousCoordinator)));
      const isReplacement = stryMutAct_9fa48("105414") ? hadPrevious || previousCoordinator !== newCoordinator : stryMutAct_9fa48("105413") ? false : stryMutAct_9fa48("105412") ? true : (stryCov_9fa48("105412", "105413", "105414"), hadPrevious && (stryMutAct_9fa48("105416") ? previousCoordinator === newCoordinator : stryMutAct_9fa48("105415") ? true : (stryCov_9fa48("105415", "105416"), previousCoordinator !== newCoordinator)));
      const shouldShutdownPrevious = stryMutAct_9fa48("105419") ? this.ownsRebalanceCoordinator && isReplacement || typeof previousCoordinator.shutdown === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105418") ? false : stryMutAct_9fa48("105417") ? true : (stryCov_9fa48("105417", "105418", "105419"), (stryMutAct_9fa48("105421") ? this.ownsRebalanceCoordinator || isReplacement : stryMutAct_9fa48("105420") ? true : (stryCov_9fa48("105420", "105421"), this.ownsRebalanceCoordinator && isReplacement)) && (stryMutAct_9fa48("105423") ? typeof previousCoordinator.shutdown !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105422") ? true : (stryCov_9fa48("105422", "105423"), typeof previousCoordinator.shutdown === PARTITION_SERVICE_TYPE.FUNCTION)));
      this.rebalanceCoordinator = newCoordinator;
      this.ownsRebalanceCoordinator = stryMutAct_9fa48("105424") ? true : (stryCov_9fa48("105424"), false);
      if (stryMutAct_9fa48("105426") ? false : stryMutAct_9fa48("105425") ? true : (stryCov_9fa48("105425", "105426"), this.rebalancer)) {
        if (stryMutAct_9fa48("105427")) {
          {}
        } else {
          stryCov_9fa48("105427");
          const setCoordinator = assertCritical((stryMutAct_9fa48("105430") ? typeof this.rebalancer.setRebalanceCoordinator !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105429") ? false : stryMutAct_9fa48("105428") ? true : (stryCov_9fa48("105428", "105429", "105430"), typeof this.rebalancer.setRebalanceCoordinator === PARTITION_SERVICE_TYPE.FUNCTION)) ? this.rebalancer.setRebalanceCoordinator.bind(this.rebalancer) : null, PARTITION_SERVICE_ERROR_MSG.REBALANCER_SET_COORDINATOR_REQUIRED);
          setCoordinator(newCoordinator);
        }
      }
      this.logger.info(PARTITION_SERVICE_LOG_MSG.COORDINATOR_REBOUND, stryMutAct_9fa48("105431") ? {} : (stryCov_9fa48("105431"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        hadPrevious,
        isReplacement
      }));
      if (stryMutAct_9fa48("105433") ? false : stryMutAct_9fa48("105432") ? true : (stryCov_9fa48("105432", "105433"), shouldShutdownPrevious)) {
        if (stryMutAct_9fa48("105434")) {
          {}
        } else {
          stryCov_9fa48("105434");
          previousCoordinator.shutdown().catch(error => {
            if (stryMutAct_9fa48("105435")) {
              {}
            } else {
              stryCov_9fa48("105435");
              this.logger.warn(PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED, stryMutAct_9fa48("105436") ? {} : (stryCov_9fa48("105436"), {
                partitionId: this.partitionId,
                replicaId: this.replicaId,
                error: error.message
              }));
            }
          });
        }
      }
      this.maybeInitializeRebalancer();
    }
  } /**
    * Set SQL query engine for rebalancer operations.
    * @param {Object} sqlQueryEngine - SQL query engine instance.
    */
  setSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("105437")) {
      {}
    } else {
      stryCov_9fa48("105437");
      this.sqlQueryEngine = sqlQueryEngine;
      if (stryMutAct_9fa48("105439") ? false : stryMutAct_9fa48("105438") ? true : (stryCov_9fa48("105438", "105439"), this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105440")) {
          {}
        } else {
          stryCov_9fa48("105440");
          this.rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
        }
      }
      this.maybeInitializeRebalancer();
    }
  } /**
    * Build a rebalancer dependency bundle from current PartitionService
    * state. The bundle is the single shape consumed by
    * applyRebalancerDependencies and initializeRebalancer.
    *
    * Requirements: 7.1 (explicit dependency bundles)
    * Design: D8.1
    * @return {Object|null} Bundle object, or null when any required
    *   dependency is missing.
    * @private
    */
  buildRebalancerDependencyBundle() {
    if (stryMutAct_9fa48("105441")) {
      {}
    } else {
      stryCov_9fa48("105441");
      const systemTableCache = this.systemTableCache;
      const cdcIntegrationService = this.cdcIntegrationService;
      const tablePolicyService = this.tablePolicyService;
      const messageRouter = this.messageRouter;
      const sqlQueryEngine = this.sqlQueryEngine;
      const rebalanceCoordinator = this.rebalanceCoordinator;
      if (stryMutAct_9fa48("105444") ? (!systemTableCache || !cdcIntegrationService || !tablePolicyService || !messageRouter || !sqlQueryEngine) && !rebalanceCoordinator : stryMutAct_9fa48("105443") ? false : stryMutAct_9fa48("105442") ? true : (stryCov_9fa48("105442", "105443", "105444"), (stryMutAct_9fa48("105446") ? (!systemTableCache || !cdcIntegrationService || !tablePolicyService || !messageRouter) && !sqlQueryEngine : stryMutAct_9fa48("105445") ? false : (stryCov_9fa48("105445", "105446"), (stryMutAct_9fa48("105448") ? (!systemTableCache || !cdcIntegrationService || !tablePolicyService) && !messageRouter : stryMutAct_9fa48("105447") ? false : (stryCov_9fa48("105447", "105448"), (stryMutAct_9fa48("105450") ? (!systemTableCache || !cdcIntegrationService) && !tablePolicyService : stryMutAct_9fa48("105449") ? false : (stryCov_9fa48("105449", "105450"), (stryMutAct_9fa48("105452") ? !systemTableCache && !cdcIntegrationService : stryMutAct_9fa48("105451") ? false : (stryCov_9fa48("105451", "105452"), (stryMutAct_9fa48("105453") ? systemTableCache : (stryCov_9fa48("105453"), !systemTableCache)) || (stryMutAct_9fa48("105454") ? cdcIntegrationService : (stryCov_9fa48("105454"), !cdcIntegrationService)))) || (stryMutAct_9fa48("105455") ? tablePolicyService : (stryCov_9fa48("105455"), !tablePolicyService)))) || (stryMutAct_9fa48("105456") ? messageRouter : (stryCov_9fa48("105456"), !messageRouter)))) || (stryMutAct_9fa48("105457") ? sqlQueryEngine : (stryCov_9fa48("105457"), !sqlQueryEngine)))) || (stryMutAct_9fa48("105458") ? rebalanceCoordinator : (stryCov_9fa48("105458"), !rebalanceCoordinator)))) {
        if (stryMutAct_9fa48("105459")) {
          {}
        } else {
          stryCov_9fa48("105459");
          return null;
        }
      }
      return stryMutAct_9fa48("105460") ? {} : (stryCov_9fa48("105460"), {
        systemTableCache,
        cdcIntegrationService,
        tablePolicyService,
        messageRouter,
        sqlQueryEngine,
        rebalanceCoordinator
      });
    }
  } /**
    * Apply a dependency bundle to an existing rebalancer instance.
    * This is the single path for updating rebalancer owner
    * dependencies after construction.
    *
    * Requirements: 7.1 (explicit dependency bundles), 7.4 (gating)
    * Design: D8.1, D8.2
    * @param {Object} bundle - Dependency bundle from
    *   buildRebalancerDependencyBundle.
    * @private
    */
  applyRebalancerDependencies(bundle) {
    if (stryMutAct_9fa48("105461")) {
      {}
    } else {
      stryCov_9fa48("105461");
      if (stryMutAct_9fa48("105464") ? !bundle && !this.rebalancer : stryMutAct_9fa48("105463") ? false : stryMutAct_9fa48("105462") ? true : (stryCov_9fa48("105462", "105463", "105464"), (stryMutAct_9fa48("105465") ? bundle : (stryCov_9fa48("105465"), !bundle)) || (stryMutAct_9fa48("105466") ? this.rebalancer : (stryCov_9fa48("105466"), !this.rebalancer)))) {
        if (stryMutAct_9fa48("105467")) {
          {}
        } else {
          stryCov_9fa48("105467");
          return;
        }
      }
      let coordinatorRoutedThroughSetter = stryMutAct_9fa48("105468") ? true : (stryCov_9fa48("105468"), false);
      if (stryMutAct_9fa48("105470") ? false : stryMutAct_9fa48("105469") ? true : (stryCov_9fa48("105469", "105470"), bundle.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("105471")) {
          {}
        } else {
          stryCov_9fa48("105471");
          bundle.rebalanceCoordinator.systemTableCache = bundle.systemTableCache;
          bundle.rebalanceCoordinator.cdcIntegrationService = bundle.cdcIntegrationService;
          bundle.rebalanceCoordinator.tablePolicyService = bundle.tablePolicyService;
          bundle.rebalanceCoordinator.sqlQueryEngine = bundle.sqlQueryEngine;
          if (stryMutAct_9fa48("105474") ? typeof bundle.rebalanceCoordinator.syncOwnerDependencies !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105473") ? false : stryMutAct_9fa48("105472") ? true : (stryCov_9fa48("105472", "105473", "105474"), typeof bundle.rebalanceCoordinator.syncOwnerDependencies === PARTITION_SERVICE_TYPE.FUNCTION)) {
            if (stryMutAct_9fa48("105475")) {
              {}
            } else {
              stryCov_9fa48("105475");
              bundle.rebalanceCoordinator.syncOwnerDependencies(bundle);
            }
          }
        }
      }
      if (stryMutAct_9fa48("105478") ? typeof this.rebalancer.syncOwnerDependencies !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105477") ? false : stryMutAct_9fa48("105476") ? true : (stryCov_9fa48("105476", "105477", "105478"), typeof this.rebalancer.syncOwnerDependencies === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("105479")) {
          {}
        } else {
          stryCov_9fa48("105479");
          this.rebalancer.syncOwnerDependencies(bundle);
          coordinatorRoutedThroughSetter = stryMutAct_9fa48("105480") ? !bundle.rebalanceCoordinator : (stryCov_9fa48("105480"), !(stryMutAct_9fa48("105481") ? bundle.rebalanceCoordinator : (stryCov_9fa48("105481"), !bundle.rebalanceCoordinator)));
        }
      } else {
        if (stryMutAct_9fa48("105482")) {
          {}
        } else {
          stryCov_9fa48("105482");
          this.rebalancer.systemTableCache = bundle.systemTableCache;
          this.rebalancer.cdcIntegrationService = bundle.cdcIntegrationService;
          this.rebalancer.tablePolicyService = bundle.tablePolicyService;
          this.rebalancer.messageRouter = bundle.messageRouter;
          this.rebalancer.sqlQueryEngine = bundle.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("105485") ? bundle.rebalanceCoordinator || coordinatorRoutedThroughSetter !== true : stryMutAct_9fa48("105484") ? false : stryMutAct_9fa48("105483") ? true : (stryCov_9fa48("105483", "105484", "105485"), bundle.rebalanceCoordinator && (stryMutAct_9fa48("105487") ? coordinatorRoutedThroughSetter === true : stryMutAct_9fa48("105486") ? true : (stryCov_9fa48("105486", "105487"), coordinatorRoutedThroughSetter !== (stryMutAct_9fa48("105488") ? false : (stryCov_9fa48("105488"), true)))))) {
        if (stryMutAct_9fa48("105489")) {
          {}
        } else {
          stryCov_9fa48("105489");
          const setRebalanceCoordinator = assertCritical((stryMutAct_9fa48("105492") ? typeof this.rebalancer.setRebalanceCoordinator !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105491") ? false : stryMutAct_9fa48("105490") ? true : (stryCov_9fa48("105490", "105491", "105492"), typeof this.rebalancer.setRebalanceCoordinator === PARTITION_SERVICE_TYPE.FUNCTION)) ? this.rebalancer.setRebalanceCoordinator.bind(this.rebalancer) : null, PARTITION_SERVICE_ERROR_MSG.REBALANCER_SET_COORDINATOR_REQUIRED);
          setRebalanceCoordinator(bundle.rebalanceCoordinator);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.REBALANCER_DEPENDENCIES_APPLIED, stryMutAct_9fa48("105493") ? {} : (stryCov_9fa48("105493"), {
        partitionId: this.partitionId
      }));
    }
  } /**
    * Initialize rebalancer only when required dependencies are ready.
    * @private
    */
  maybeInitializeRebalancer() {
    if (stryMutAct_9fa48("105494")) {
      {}
    } else {
      stryCov_9fa48("105494");
      const backgroundReady = this.isBackgroundWorkReady();
      if (stryMutAct_9fa48("105496") ? false : stryMutAct_9fa48("105495") ? true : (stryCov_9fa48("105495", "105496"), this.rebalancer)) {
        if (stryMutAct_9fa48("105497")) {
          {}
        } else {
          stryCov_9fa48("105497");
          const bundle = this.buildRebalancerDependencyBundle();
          this.applyRebalancerDependencies(bundle);
          if (stryMutAct_9fa48("105500") ? typeof this.rebalancer.setLeader !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105499") ? false : stryMutAct_9fa48("105498") ? true : (stryCov_9fa48("105498", "105499", "105500"), typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION)) {
            if (stryMutAct_9fa48("105501")) {
              {}
            } else {
              stryCov_9fa48("105501");
              this.rebalancer.setLeader(stryMutAct_9fa48("105504") ? backgroundReady || this.isLeader : stryMutAct_9fa48("105503") ? false : stryMutAct_9fa48("105502") ? true : (stryCov_9fa48("105502", "105503", "105504"), backgroundReady && this.isLeader));
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("105507") ? !backgroundReady && !this.isLeader : stryMutAct_9fa48("105506") ? false : stryMutAct_9fa48("105505") ? true : (stryCov_9fa48("105505", "105506", "105507"), (stryMutAct_9fa48("105508") ? backgroundReady : (stryCov_9fa48("105508"), !backgroundReady)) || (stryMutAct_9fa48("105509") ? this.isLeader : (stryCov_9fa48("105509"), !this.isLeader)))) {
        if (stryMutAct_9fa48("105510")) {
          {}
        } else {
          stryCov_9fa48("105510");
          return;
        }
      }
      const bundle = this.buildRebalancerDependencyBundle();
      if (stryMutAct_9fa48("105513") ? false : stryMutAct_9fa48("105512") ? true : stryMutAct_9fa48("105511") ? bundle : (stryCov_9fa48("105511", "105512", "105513"), !bundle)) {
        if (stryMutAct_9fa48("105514")) {
          {}
        } else {
          stryCov_9fa48("105514");
          return;
        }
      }
      this.initializeRebalancer(bundle);
    }
  } /**
    * Initialize rebalancer components with required dependencies.
    * @param {Object} [bundle] - Optional pre-built dependency bundle.
    *   When omitted, dependencies are read from PartitionService state
    *   and individually validated.
    * @private
    */
  initializeRebalancer(bundle) {
    if (stryMutAct_9fa48("105515")) {
      {}
    } else {
      stryCov_9fa48("105515");
      const src = stryMutAct_9fa48("105518") ? bundle && this : stryMutAct_9fa48("105517") ? false : stryMutAct_9fa48("105516") ? true : (stryCov_9fa48("105516", "105517", "105518"), bundle || this);
      const systemTableCache = assertCritical(src.systemTableCache, PARTITION_SERVICE_ERROR_MSG.REBALANCER_CACHE_REQUIRED);
      const cdcIntegrationService = assertCritical(src.cdcIntegrationService, PARTITION_SERVICE_ERROR_MSG.REBALANCER_CDC_REQUIRED);
      const tablePolicyService = assertCritical(src.tablePolicyService, PARTITION_SERVICE_ERROR_MSG.REBALANCER_POLICY_REQUIRED);
      const messageRouter = assertCritical(src.messageRouter, PARTITION_SERVICE_ERROR_MSG.REBALANCER_ROUTER_REQUIRED);
      const sqlQueryEngine = assertCritical(src.sqlQueryEngine, PARTITION_SERVICE_ERROR_MSG.REBALANCER_SQL_ENGINE_REQUIRED);
      const rebalanceCoordinator = assertCritical(src.rebalanceCoordinator, PARTITION_SERVICE_ERROR_MSG.REBALANCER_COORDINATOR_REQUIRED);
      rebalanceCoordinator.systemTableCache = systemTableCache;
      rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
      rebalanceCoordinator.tablePolicyService = tablePolicyService;
      rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
      if (stryMutAct_9fa48("105521") ? typeof rebalanceCoordinator.syncOwnerDependencies !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105520") ? false : stryMutAct_9fa48("105519") ? true : (stryCov_9fa48("105519", "105520", "105521"), typeof rebalanceCoordinator.syncOwnerDependencies === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("105522")) {
          {}
        } else {
          stryCov_9fa48("105522");
          rebalanceCoordinator.syncOwnerDependencies(stryMutAct_9fa48("105523") ? {} : (stryCov_9fa48("105523"), {
            systemTableCache,
            cdcIntegrationService,
            tablePolicyService,
            messageRouter,
            sqlQueryEngine
          }));
        }
      }
      if (stryMutAct_9fa48("105526") ? typeof rebalanceCoordinator.initialize !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105525") ? false : stryMutAct_9fa48("105524") ? true : (stryCov_9fa48("105524", "105525", "105526"), typeof rebalanceCoordinator.initialize === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("105527")) {
          {}
        } else {
          stryCov_9fa48("105527");
          rebalanceCoordinator.initialize();
        }
      }
      this.rebalancer = new UnifiedRebalancer(stryMutAct_9fa48("105528") ? {} : (stryCov_9fa48("105528"), {
        entityId: this.partitionId,
        entityType: EntityType.PARTITION,
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        tablePolicyService: tablePolicyService,
        sqlQueryEngine: sqlQueryEngine,
        nodeId: this.nodeId,
        replicaStateMachine: this.replicaStateMachine,
        messageRouter: messageRouter,
        rebalanceCoordinator: rebalanceCoordinator
      }));
      this.rebalancer.initialize();
      this.rebalancer.setLeader(stryMutAct_9fa48("105531") ? this.isBackgroundWorkReady() || this.isLeader : stryMutAct_9fa48("105530") ? false : stryMutAct_9fa48("105529") ? true : (stryCov_9fa48("105529", "105530", "105531"), this.isBackgroundWorkReady() && this.isLeader));
    }
  } /**
    * Queue a raft role update for persistence.
    * @param {string} role - New raft role.
    * @private
    */
  queueRoleUpdate(role) {
    if (stryMutAct_9fa48("105532")) {
      {}
    } else {
      stryCov_9fa48("105532");
      this.roleMutationHelper.queue(normalizePublishedRaftRole(role, stryMutAct_9fa48("105533") ? {} : (stryCov_9fa48("105533"), {
        collapseLeaderToFollower: stryMutAct_9fa48("105534") ? false : (stryCov_9fa48("105534"), true)
      })));
    }
  } /**
    * Queue a partition leader update for persistence.
    * @param {string} leaderNodeId - Leader node ID.
    * @private
    */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("105535")) {
      {}
    } else {
      stryCov_9fa48("105535");
      this.leaderNodeMutationHelper.queue(leaderNodeId);
    }
  } /**
    * Persist the latest pending raft role update.
    * @return {Promise<void>}
    * @private
    */
  async flushRoleUpdate() {
    if (stryMutAct_9fa48("105536")) {
      {}
    } else {
      stryCov_9fa48("105536");
      return this.roleMutationHelper.flush();
    }
  } /**
    * Persist the latest pending partition leader update.
    * @return {Promise<void>}
    * @private
    */
  async flushLeaderNodeUpdate() {
    if (stryMutAct_9fa48("105537")) {
      {}
    } else {
      stryCov_9fa48("105537");
      return this.leaderNodeMutationHelper.flush();
    }
  } /**
    * Check if the partitions partition leader is available for writes.
    * @return {boolean} True if a leader with an address is known.
    * @private
    */
  isPartitionsLeaderAvailable() {
    if (stryMutAct_9fa48("105538")) {
      {}
    } else {
      stryCov_9fa48("105538");
      if (stryMutAct_9fa48("105540") ? false : stryMutAct_9fa48("105539") ? true : (stryCov_9fa48("105539", "105540"), isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.PARTITIONS))) {
        if (stryMutAct_9fa48("105541")) {
          {}
        } else {
          stryCov_9fa48("105541");
          return stryMutAct_9fa48("105542") ? false : (stryCov_9fa48("105542"), true);
        }
      }
      return stryMutAct_9fa48("105545") ? this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.PARTITIONS) !== true : stryMutAct_9fa48("105544") ? false : stryMutAct_9fa48("105543") ? true : (stryCov_9fa48("105543", "105544", "105545"), (stryMutAct_9fa48("105547") ? this.cdcIntegrationService.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.PARTITIONS) : stryMutAct_9fa48("105546") ? this.cdcIntegrationService?.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.PARTITIONS) : (stryCov_9fa48("105546", "105547"), this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.PARTITIONS))) === (stryMutAct_9fa48("105548") ? false : (stryCov_9fa48("105548"), true)));
    }
  } /**
    * Check if the services table is writable through either cache-visible
    * routing metadata or the local services-p1 leader owner.
    * @return {boolean} True if writes can be issued safely.
    * @private
    */
  isServicesLeaderAvailable() {
    if (stryMutAct_9fa48("105549")) {
      {}
    } else {
      stryCov_9fa48("105549");
      if (stryMutAct_9fa48("105551") ? false : stryMutAct_9fa48("105550") ? true : (stryCov_9fa48("105550", "105551"), isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES))) {
        if (stryMutAct_9fa48("105552")) {
          {}
        } else {
          stryCov_9fa48("105552");
          return stryMutAct_9fa48("105553") ? false : (stryCov_9fa48("105553"), true);
        }
      }
      return stryMutAct_9fa48("105556") ? this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES) !== true : stryMutAct_9fa48("105555") ? false : stryMutAct_9fa48("105554") ? true : (stryCov_9fa48("105554", "105555", "105556"), (stryMutAct_9fa48("105558") ? this.cdcIntegrationService.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES) : stryMutAct_9fa48("105557") ? this.cdcIntegrationService?.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.SERVICES) : (stryCov_9fa48("105557", "105558"), this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES))) === (stryMutAct_9fa48("105559") ? false : (stryCov_9fa48("105559"), true)));
    }
  }
  getMetadataPublicationDeliveryPriority() {
    if (stryMutAct_9fa48("105560")) {
      {}
    } else {
      stryCov_9fa48("105560");
      return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ? PARTITION_SERVICE_LITERAL.CRITICAL : PARTITION_SERVICE_LITERAL.BACKGROUND;
    }
  }
  getMetadataPublicationReadinessDimension() {
    if (stryMutAct_9fa48("105561")) {
      {}
    } else {
      stryCov_9fa48("105561");
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
  } /**
    * Trigger an immediate rebalance check.
    * Called when a significant cluster event occurs (e.g., node join).
    * @param {string} reason - Reason for the trigger.
    */
  triggerRebalanceCheck(reason) {
    if (stryMutAct_9fa48("105562")) {
      {}
    } else {
      stryCov_9fa48("105562");
      if (stryMutAct_9fa48("105565") ? this.rebalancer || this.isLeader : stryMutAct_9fa48("105564") ? false : stryMutAct_9fa48("105563") ? true : (stryCov_9fa48("105563", "105564", "105565"), this.rebalancer && this.isLeader)) {
        if (stryMutAct_9fa48("105566")) {
          {}
        } else {
          stryCov_9fa48("105566");
          this.rebalancer.recordStateChange(reason);
        }
      }
    }
  } /**
    * Extract ACK from transport response.
    * Requirements: 6.1, 6.2, 6.3, 6.4
    * @param {Object} result - Transport result (now flat structure).
    * @param {string} requestId - Expected request ID.
    * @return {Object|null} ACK or null if not found.
    * @private
    */
  extractAckFromResponse(result, requestId) {
    if (stryMutAct_9fa48("105567")) {
      {}
    } else {
      stryCov_9fa48("105567");
      if (stryMutAct_9fa48("105570") ? false : stryMutAct_9fa48("105569") ? true : stryMutAct_9fa48("105568") ? result : (stryCov_9fa48("105568", "105569", "105570"), !result)) return null; // With flat message structure, request_id should be directly on the result
      if (stryMutAct_9fa48("105573") ? result.request_id !== requestId : stryMutAct_9fa48("105572") ? false : stryMutAct_9fa48("105571") ? true : (stryCov_9fa48("105571", "105572", "105573"), result.request_id === requestId)) {
        if (stryMutAct_9fa48("105574")) {
          {}
        } else {
          stryCov_9fa48("105574");
          return result;
        }
      }
      if (stryMutAct_9fa48("105576") ? false : stryMutAct_9fa48("105575") ? true : (stryCov_9fa48("105575", "105576"), result.result)) {
        if (stryMutAct_9fa48("105577")) {
          {}
        } else {
          stryCov_9fa48("105577");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NESTED_ACK_UNSUPPORTED);
        }
      }
      return null;
    }
  } /**
    * Deliver a message via transport and wait for ACK with timeout.
    * Uses PendingRequestTracker instead of EventEmitter-based ACK handling.
    * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
    * @param {Object} transport - MessageRouter instance.
    * @param {string} targetAddress - Target address (e.g., 'node-2/lifecycle').
    * @param {Object} message - Message to send.
    * @param {number} timeoutMs - Timeout in milliseconds.
    * @return {Promise<Object>} ACK response or timeout error.
    * @private
    */
  async deliverWithAck(transport, targetAddress, message, timeoutMs = PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS) {
    if (stryMutAct_9fa48("105578")) {
      {}
    } else {
      stryCov_9fa48("105578");
      const requestId = message.request_id;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.DELIVERING_WITH_ACK, stryMutAct_9fa48("105579") ? {} : (stryCov_9fa48("105579"), {
        requestId,
        targetAddress,
        messageType: message.type,
        partitionId: this.partitionId
      })); // Track the request with PendingRequestTracker
      const trackPromise = this.pendingRequestTracker.track(requestId, stryMutAct_9fa48("105580") ? {} : (stryCov_9fa48("105580"), {
        type: message.type,
        targetAddress,
        timeoutMs
      })); // Store any rejection that happens during delivery (e.g., from shutdown)
      // This prevents unhandled promise rejection when delivery triggers shutdown
      // on the same node, which clears pending requests before we await trackPromise
      let earlyRejection = null;
      const buildTrackerShutdownAck = stryMutAct_9fa48("105581") ? () => undefined : (stryCov_9fa48("105581"), (() => {
        const buildTrackerShutdownAck = () => stryMutAct_9fa48("105582") ? {} : (stryCov_9fa48("105582"), {
          request_id: requestId,
          status: PARTITION_SERVICE_STATUS.INITIATED,
          message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF
        });
        return buildTrackerShutdownAck;
      })());
      trackPromise.catch(err => {
        if (stryMutAct_9fa48("105583")) {
          {}
        } else {
          stryCov_9fa48("105583");
          earlyRejection = err;
        }
      });
      try {
        if (stryMutAct_9fa48("105584")) {
          {}
        } else {
          stryCov_9fa48("105584");
          // Send the message via transport
          const result = await transport.deliver(targetAddress, message); // Check if the tracker was cleared during delivery (e.g., self-removal)
          if (stryMutAct_9fa48("105586") ? false : stryMutAct_9fa48("105585") ? true : (stryCov_9fa48("105585", "105586"), earlyRejection)) {
            if (stryMutAct_9fa48("105587")) {
              {}
            } else {
              stryCov_9fa48("105587");
              // If the error is "Tracker shutdown", this is expected for self-removal
              // The operation was successful - the replica was removed
              if (stryMutAct_9fa48("105590") ? earlyRejection.message !== PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN : stryMutAct_9fa48("105589") ? false : stryMutAct_9fa48("105588") ? true : (stryCov_9fa48("105588", "105589", "105590"), earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN)) {
                if (stryMutAct_9fa48("105591")) {
                  {}
                } else {
                  stryCov_9fa48("105591");
                  this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY, stryMutAct_9fa48("105592") ? {} : (stryCov_9fa48("105592"), {
                    requestId,
                    partitionId: this.partitionId
                  }));
                  return buildTrackerShutdownAck();
                }
              }
              throw earlyRejection;
            }
          } // Check if delivery failed (no connection, no handler, etc.)
          // Fail fast instead of waiting for timeout
          if (stryMutAct_9fa48("105595") ? result || result.acknowledged === false : stryMutAct_9fa48("105594") ? false : stryMutAct_9fa48("105593") ? true : (stryCov_9fa48("105593", "105594", "105595"), result && (stryMutAct_9fa48("105597") ? result.acknowledged !== false : stryMutAct_9fa48("105596") ? true : (stryCov_9fa48("105596", "105597"), result.acknowledged === (stryMutAct_9fa48("105598") ? true : (stryCov_9fa48("105598"), false)))))) {
            if (stryMutAct_9fa48("105599")) {
              {}
            } else {
              stryCov_9fa48("105599");
              const errorMsg = stryMutAct_9fa48("105602") ? result.error && PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK : stryMutAct_9fa48("105601") ? false : stryMutAct_9fa48("105600") ? true : (stryCov_9fa48("105600", "105601", "105602"), result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK);
              this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, stryMutAct_9fa48("105603") ? {} : (stryCov_9fa48("105603"), {
                requestId,
                targetAddress,
                error: errorMsg,
                partitionId: this.partitionId
              })); // Clean up the pending request
              if (stryMutAct_9fa48("105605") ? false : stryMutAct_9fa48("105604") ? true : (stryCov_9fa48("105604", "105605"), this.pendingRequestTracker.hasPending(requestId))) {
                if (stryMutAct_9fa48("105606")) {
                  {}
                } else {
                  stryCov_9fa48("105606");
                  this.pendingRequestTracker.reject(requestId, new Error(stryMutAct_9fa48("105607") ? `` : (stryCov_9fa48("105607"), `Delivery failed: ${errorMsg}`)));
                }
              }
              throw new Error(stryMutAct_9fa48("105608") ? `` : (stryCov_9fa48("105608"), `Delivery failed: ${errorMsg}`));
            }
          } // Extract ACK from response if present (Requirements 6.1, 6.2, 6.3, 6.4)
          const ack = this.extractAckFromResponse(result, requestId);
          if (stryMutAct_9fa48("105610") ? false : stryMutAct_9fa48("105609") ? true : (stryCov_9fa48("105609", "105610"), ack)) {
            if (stryMutAct_9fa48("105611")) {
              {}
            } else {
              stryCov_9fa48("105611");
              // Resolve via tracker (clears timeout)
              this.pendingRequestTracker.resolve(requestId, ack);
              this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, stryMutAct_9fa48("105612") ? {} : (stryCov_9fa48("105612"), {
                requestId,
                status: ack.status,
                partitionId: this.partitionId
              }));
              return ack;
            }
          } // Wait for ACK via tracker (will timeout if not received)
          return await trackPromise;
        }
      } catch (error) {
        if (stryMutAct_9fa48("105613")) {
          {}
        } else {
          stryCov_9fa48("105613");
          // Handle "Tracker shutdown" error gracefully for self-removal scenarios
          if (stryMutAct_9fa48("105616") ? error.message !== PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN : stryMutAct_9fa48("105615") ? false : stryMutAct_9fa48("105614") ? true : (stryCov_9fa48("105614", "105615", "105616"), error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN)) {
            if (stryMutAct_9fa48("105617")) {
              {}
            } else {
              stryCov_9fa48("105617");
              this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, stryMutAct_9fa48("105618") ? {} : (stryCov_9fa48("105618"), {
                requestId,
                partitionId: this.partitionId
              }));
              return buildTrackerShutdownAck();
            }
          } // Ensure cleanup on error - reject the pending request if still tracked
          if (stryMutAct_9fa48("105620") ? false : stryMutAct_9fa48("105619") ? true : (stryCov_9fa48("105619", "105620"), this.pendingRequestTracker.hasPending(requestId))) {
            if (stryMutAct_9fa48("105621")) {
              {}
            } else {
              stryCov_9fa48("105621");
              this.pendingRequestTracker.reject(requestId, error);
            }
          }
          throw error;
        }
      }
    }
  } /**
    * Schedule learner promotion check after minimum delay.
    * Learners are promoted to followers after catching up with the leader's log.
    * This prevents new replicas from disrupting existing leadership.
    * @private
    */
  scheduleLearnerPromotion(scheduleReason = PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK) {
    if (stryMutAct_9fa48("105622")) {
      {}
    } else {
      stryCov_9fa48("105622");
      if (stryMutAct_9fa48("105624") ? false : stryMutAct_9fa48("105623") ? true : (stryCov_9fa48("105623", "105624"), this.learnerPromotionTimer)) {
        if (stryMutAct_9fa48("105625")) {
          {}
        } else {
          stryCov_9fa48("105625");
          return;
        }
      }
      if (stryMutAct_9fa48("105627") ? false : stryMutAct_9fa48("105626") ? true : (stryCov_9fa48("105626", "105627"), this.isShutdown)) {
        if (stryMutAct_9fa48("105628")) {
          {}
        } else {
          stryCov_9fa48("105628");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, stryMutAct_9fa48("105629") ? {} : (stryCov_9fa48("105629"), {
            partitionId: this.partitionId,
            timer: PARTITION_SERVICE_LITERAL.LEARNERPROMOTIONTIMER
          }));
          return;
        }
      }
      const delayMs = this.resolveLearnerPromotionDelayMs(scheduleReason);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, stryMutAct_9fa48("105630") ? {} : (stryCov_9fa48("105630"), {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        delayMs,
        scheduleReason
      }));
      this.learnerPromotionTimer = setTimeout(() => {
        if (stryMutAct_9fa48("105631")) {
          {}
        } else {
          stryCov_9fa48("105631");
          this.checkLearnerPromotion();
        }
      }, delayMs);
    }
  }
  isPriorityRecoveryPendingForLearnerPromotion() {
    if (stryMutAct_9fa48("105632")) {
      {}
    } else {
      stryCov_9fa48("105632");
      if (stryMutAct_9fa48("105635") ? false : stryMutAct_9fa48("105634") ? true : stryMutAct_9fa48("105633") ? isPriorityControlPlanePartition({
        partitionId: this.partitionId
      }) : (stryCov_9fa48("105633", "105634", "105635"), !isPriorityControlPlanePartition(stryMutAct_9fa48("105636") ? {} : (stryCov_9fa48("105636"), {
        partitionId: this.partitionId
      })))) {
        if (stryMutAct_9fa48("105637")) {
          {}
        } else {
          stryCov_9fa48("105637");
          return stryMutAct_9fa48("105638") ? true : (stryCov_9fa48("105638"), false);
        }
      }
      const readinessSnapshot = getTrafficReadinessSnapshot(this.metadataPublicationReadinessState);
      if (stryMutAct_9fa48("105641") ? !readinessSnapshot && readinessSnapshot.draining === true : stryMutAct_9fa48("105640") ? false : stryMutAct_9fa48("105639") ? true : (stryCov_9fa48("105639", "105640", "105641"), (stryMutAct_9fa48("105642") ? readinessSnapshot : (stryCov_9fa48("105642"), !readinessSnapshot)) || (stryMutAct_9fa48("105644") ? readinessSnapshot.draining !== true : stryMutAct_9fa48("105643") ? false : (stryCov_9fa48("105643", "105644"), readinessSnapshot.draining === (stryMutAct_9fa48("105645") ? false : (stryCov_9fa48("105645"), true)))))) {
        if (stryMutAct_9fa48("105646")) {
          {}
        } else {
          stryCov_9fa48("105646");
          return stryMutAct_9fa48("105647") ? true : (stryCov_9fa48("105647"), false);
        }
      }
      const reasons = Array.isArray(readinessSnapshot.reasons) ? readinessSnapshot.reasons : stryMutAct_9fa48("105648") ? ["Stryker was here"] : (stryCov_9fa48("105648"), []);
      return reasons.includes(LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING);
    }
  }
  resolveLearnerPromotionDelayMs(scheduleReason) {
    if (stryMutAct_9fa48("105649")) {
      {}
    } else {
      stryCov_9fa48("105649");
      if (stryMutAct_9fa48("105652") ? scheduleReason !== PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY : stryMutAct_9fa48("105651") ? false : stryMutAct_9fa48("105650") ? true : (stryCov_9fa48("105650", "105651", "105652"), scheduleReason === PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY)) {
        if (stryMutAct_9fa48("105653")) {
          {}
        } else {
          stryCov_9fa48("105653");
          if (stryMutAct_9fa48("105655") ? false : stryMutAct_9fa48("105654") ? true : (stryCov_9fa48("105654", "105655"), this.isPriorityRecoveryPendingForLearnerPromotion())) {
            if (stryMutAct_9fa48("105656")) {
              {}
            } else {
              stryCov_9fa48("105656");
              return stryMutAct_9fa48("105657") ? Math.max(this.learnerPromotionDelayMs, this.learnerPromotionPriorityRecoveryDelayMs) : (stryCov_9fa48("105657"), Math.min(this.learnerPromotionDelayMs, this.learnerPromotionPriorityRecoveryDelayMs));
            }
          }
          return this.learnerPromotionDelayMs;
        }
      }
      return this.learnerCatchUpCheckIntervalMs;
    }
  } /**
    * Check if learner can be promoted to follower.
    * Promotion happens when:
    * 1. Minimum delay has passed (already satisfied by timer)
    * 2. A leader has been discovered for the group
    * 3. Promoting would stay within the partition's configured replica count,
    *    allowing at most one temporary replacement voter above target
    * 4. Promoting would not result in an even number of voters (prevents split votes)
    *    unless this is the single temporary replacement voter or all pending
    *    learners together would reach an odd count within target
    * @private
    */
  checkLearnerPromotion() {
    if (stryMutAct_9fa48("105658")) {
      {}
    } else {
      stryCov_9fa48("105658");
      this.learnerPromotionTimer = null; // Only promote if still in learner role
      if (stryMutAct_9fa48("105661") ? this.role === RaftRole.LEARNER : stryMutAct_9fa48("105660") ? false : stryMutAct_9fa48("105659") ? true : (stryCov_9fa48("105659", "105660", "105661"), this.role !== RaftRole.LEARNER)) {
        if (stryMutAct_9fa48("105662")) {
          {}
        } else {
          stryCov_9fa48("105662");
          return;
        }
      } // Do not promote until we know who the current leader is.
      // Promoting without an observed leader can trigger election storms.
      if (stryMutAct_9fa48("105665") ? false : stryMutAct_9fa48("105664") ? true : stryMutAct_9fa48("105663") ? this.leaderId : (stryCov_9fa48("105663", "105664", "105665"), !this.leaderId)) {
        if (stryMutAct_9fa48("105666")) {
          {}
        } else {
          stryCov_9fa48("105666");
          this.leaderId = stryMutAct_9fa48("105669") ? (this.resolveLeaderIdFromMetadata() || this.resolveLeaderIdFromHint()) && null : stryMutAct_9fa48("105668") ? false : stryMutAct_9fa48("105667") ? true : (stryCov_9fa48("105667", "105668", "105669"), (stryMutAct_9fa48("105671") ? this.resolveLeaderIdFromMetadata() && this.resolveLeaderIdFromHint() : stryMutAct_9fa48("105670") ? false : (stryCov_9fa48("105670", "105671"), this.resolveLeaderIdFromMetadata() || this.resolveLeaderIdFromHint())) || null);
        }
      }
      if (stryMutAct_9fa48("105674") ? false : stryMutAct_9fa48("105673") ? true : stryMutAct_9fa48("105672") ? this.leaderId : (stryCov_9fa48("105672", "105673", "105674"), !this.leaderId)) {
        if (stryMutAct_9fa48("105675")) {
          {}
        } else {
          stryCov_9fa48("105675");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, stryMutAct_9fa48("105676") ? {} : (stryCov_9fa48("105676"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            reason: PARTITION_SERVICE_LITERAL.LEADER_NOT_DISCOVERED
          }));
          this.scheduleLearnerPromotion(PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK);
          return;
        }
      } // Check if promoting would result in an even number of voters
      // This prevents election storms caused by split votes (e.g., 2-2)
      // Count current active voters (followers + candidates + leader, excluding learners)
      const activeVoterCount = this.countActiveVoters();
      const learnerCount = this.countPendingLearners();
      const inFlightAddLikeReplicaIds = this.getInFlightAddLikeOperationReplicaIds();
      const hasOwnedAddLikeOperation = Boolean(stryMutAct_9fa48("105679") ? inFlightAddLikeReplicaIds && inFlightAddLikeReplicaIds.size > NUM.ZERO || inFlightAddLikeReplicaIds.has(this.replicaId) : stryMutAct_9fa48("105678") ? false : stryMutAct_9fa48("105677") ? true : (stryCov_9fa48("105677", "105678", "105679"), (stryMutAct_9fa48("105681") ? inFlightAddLikeReplicaIds || inFlightAddLikeReplicaIds.size > NUM.ZERO : stryMutAct_9fa48("105680") ? true : (stryCov_9fa48("105680", "105681"), inFlightAddLikeReplicaIds && (stryMutAct_9fa48("105684") ? inFlightAddLikeReplicaIds.size <= NUM.ZERO : stryMutAct_9fa48("105683") ? inFlightAddLikeReplicaIds.size >= NUM.ZERO : stryMutAct_9fa48("105682") ? true : (stryCov_9fa48("105682", "105683", "105684"), inFlightAddLikeReplicaIds.size > NUM.ZERO)))) && inFlightAddLikeReplicaIds.has(this.replicaId))); // If promoting this learner would result in an even number of voters,
      // defer promotion until the old replica is removed
      // activeVoterCount is current voters, adding this learner makes it activeVoterCount + 1
      const targetReplicaCount = this.getTargetReplicaCountForPromotion();
      const isCriticalSystemPartition = CRITICAL_SYSTEM_PARTITION_IDS.has(this.partitionId);
      const singleReplacementPromotionAllowed = stryMutAct_9fa48("105687") ? (this.isJoiningExistingGroup === true || hasOwnedAddLikeOperation) && learnerCount === NUM.ONE || activeVoterCount >= targetReplicaCount : stryMutAct_9fa48("105686") ? false : stryMutAct_9fa48("105685") ? true : (stryCov_9fa48("105685", "105686", "105687"), (stryMutAct_9fa48("105689") ? this.isJoiningExistingGroup === true || hasOwnedAddLikeOperation || learnerCount === NUM.ONE : stryMutAct_9fa48("105688") ? true : (stryCov_9fa48("105688", "105689"), (stryMutAct_9fa48("105691") ? this.isJoiningExistingGroup === true && hasOwnedAddLikeOperation : stryMutAct_9fa48("105690") ? true : (stryCov_9fa48("105690", "105691"), (stryMutAct_9fa48("105693") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("105692") ? false : (stryCov_9fa48("105692", "105693"), this.isJoiningExistingGroup === (stryMutAct_9fa48("105694") ? false : (stryCov_9fa48("105694"), true)))) || hasOwnedAddLikeOperation)) && (stryMutAct_9fa48("105696") ? learnerCount !== NUM.ONE : stryMutAct_9fa48("105695") ? true : (stryCov_9fa48("105695", "105696"), learnerCount === NUM.ONE)))) && (stryMutAct_9fa48("105699") ? activeVoterCount < targetReplicaCount : stryMutAct_9fa48("105698") ? activeVoterCount > targetReplicaCount : stryMutAct_9fa48("105697") ? true : (stryCov_9fa48("105697", "105698", "105699"), activeVoterCount >= targetReplicaCount)));
      const priorityRecoveryOverflowPromotionAllowed = stryMutAct_9fa48("105702") ? isCriticalSystemPartition && this.isPriorityRecoveryPendingForLearnerPromotion() && learnerCount === NUM.ONE || activeVoterCount >= targetReplicaCount + NUM.ONE : stryMutAct_9fa48("105701") ? false : stryMutAct_9fa48("105700") ? true : (stryCov_9fa48("105700", "105701", "105702"), (stryMutAct_9fa48("105704") ? isCriticalSystemPartition && this.isPriorityRecoveryPendingForLearnerPromotion() || learnerCount === NUM.ONE : stryMutAct_9fa48("105703") ? true : (stryCov_9fa48("105703", "105704"), (stryMutAct_9fa48("105706") ? isCriticalSystemPartition || this.isPriorityRecoveryPendingForLearnerPromotion() : stryMutAct_9fa48("105705") ? true : (stryCov_9fa48("105705", "105706"), isCriticalSystemPartition && this.isPriorityRecoveryPendingForLearnerPromotion())) && (stryMutAct_9fa48("105708") ? learnerCount !== NUM.ONE : stryMutAct_9fa48("105707") ? true : (stryCov_9fa48("105707", "105708"), learnerCount === NUM.ONE)))) && (stryMutAct_9fa48("105711") ? activeVoterCount < targetReplicaCount + NUM.ONE : stryMutAct_9fa48("105710") ? activeVoterCount > targetReplicaCount + NUM.ONE : stryMutAct_9fa48("105709") ? true : (stryCov_9fa48("105709", "105710", "105711"), activeVoterCount >= (stryMutAct_9fa48("105712") ? targetReplicaCount - NUM.ONE : (stryCov_9fa48("105712"), targetReplicaCount + NUM.ONE)))));
      const priorityRecoveryAdditionalVotersAllowed = priorityRecoveryOverflowPromotionAllowed ? NUM.TWO : NUM.ZERO;
      const maxAllowedVotersAfterPromotion = stryMutAct_9fa48("105713") ? targetReplicaCount + (singleReplacementPromotionAllowed ? NUM.ONE : NUM.ZERO) - priorityRecoveryAdditionalVotersAllowed : (stryCov_9fa48("105713"), (stryMutAct_9fa48("105714") ? targetReplicaCount - (singleReplacementPromotionAllowed ? NUM.ONE : NUM.ZERO) : (stryCov_9fa48("105714"), targetReplicaCount + (singleReplacementPromotionAllowed ? NUM.ONE : NUM.ZERO))) + priorityRecoveryAdditionalVotersAllowed);
      const votersAfterPromotion = stryMutAct_9fa48("105715") ? activeVoterCount - NUM.ONE : (stryCov_9fa48("105715"), activeVoterCount + NUM.ONE);
      const wouldExceedTargetReplicaCount = stryMutAct_9fa48("105719") ? votersAfterPromotion <= maxAllowedVotersAfterPromotion : stryMutAct_9fa48("105718") ? votersAfterPromotion >= maxAllowedVotersAfterPromotion : stryMutAct_9fa48("105717") ? false : stryMutAct_9fa48("105716") ? true : (stryCov_9fa48("105716", "105717", "105718", "105719"), votersAfterPromotion > maxAllowedVotersAfterPromotion);
      const wouldBeEven = stryMutAct_9fa48("105722") ? votersAfterPromotion % NUM.TWO !== NUM.ZERO : stryMutAct_9fa48("105721") ? false : stryMutAct_9fa48("105720") ? true : (stryCov_9fa48("105720", "105721", "105722"), (stryMutAct_9fa48("105723") ? votersAfterPromotion * NUM.TWO : (stryCov_9fa48("105723"), votersAfterPromotion % NUM.TWO)) === NUM.ZERO); // Check if promoting ALL learners would result in an odd count
      // This handles the case where multiple nodes join simultaneously
      // e.g., 3 voters + 2 learners = 5 (odd) - allow promotion
      const votersAfterAllLearners = stryMutAct_9fa48("105724") ? activeVoterCount - learnerCount : (stryCov_9fa48("105724"), activeVoterCount + learnerCount);
      const allLearnersWouldBeOdd = stryMutAct_9fa48("105727") ? votersAfterAllLearners % NUM.TWO !== NUM.ONE : stryMutAct_9fa48("105726") ? false : stryMutAct_9fa48("105725") ? true : (stryCov_9fa48("105725", "105726", "105727"), (stryMutAct_9fa48("105728") ? votersAfterAllLearners * NUM.TWO : (stryCov_9fa48("105728"), votersAfterAllLearners % NUM.TWO)) === NUM.ONE);
      const allLearnersWithinTarget = stryMutAct_9fa48("105732") ? votersAfterAllLearners > targetReplicaCount : stryMutAct_9fa48("105731") ? votersAfterAllLearners < targetReplicaCount : stryMutAct_9fa48("105730") ? false : stryMutAct_9fa48("105729") ? true : (stryCov_9fa48("105729", "105730", "105731", "105732"), votersAfterAllLearners <= targetReplicaCount);
      const multiLearnerPromotionAllowed = stryMutAct_9fa48("105735") ? allLearnersWouldBeOdd || allLearnersWithinTarget : stryMutAct_9fa48("105734") ? false : stryMutAct_9fa48("105733") ? true : (stryCov_9fa48("105733", "105734", "105735"), allLearnersWouldBeOdd && allLearnersWithinTarget);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_CHECK, stryMutAct_9fa48("105736") ? {} : (stryCov_9fa48("105736"), {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        leaderId: this.leaderId,
        logLength: stryMutAct_9fa48("105739") ? this.storage?.getLogLength() && NUM.ZERO : stryMutAct_9fa48("105738") ? false : stryMutAct_9fa48("105737") ? true : (stryCov_9fa48("105737", "105738", "105739"), (stryMutAct_9fa48("105740") ? this.storage.getLogLength() : (stryCov_9fa48("105740"), this.storage?.getLogLength())) || NUM.ZERO),
        activeVoterCount,
        isCriticalSystemPartition,
        targetReplicaCount,
        maxAllowedVotersAfterPromotion,
        votersAfterPromotion,
        wouldExceedTargetReplicaCount,
        wouldBeEven,
        learnerCount,
        votersAfterAllLearners,
        allLearnersWouldBeOdd,
        allLearnersWithinTarget,
        singleReplacementPromotionAllowed,
        hasOwnedAddLikeOperation,
        priorityRecoveryAdditionalVotersAllowed,
        priorityRecoveryOverflowPromotionAllowed
      }));
      if (stryMutAct_9fa48("105742") ? false : stryMutAct_9fa48("105741") ? true : (stryCov_9fa48("105741", "105742"), wouldExceedTargetReplicaCount)) {
        if (stryMutAct_9fa48("105743")) {
          {}
        } else {
          stryCov_9fa48("105743");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, stryMutAct_9fa48("105744") ? {} : (stryCov_9fa48("105744"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            activeVoterCount,
            targetReplicaCount,
            votersAfterPromotion,
            learnerCount,
            votersAfterAllLearners,
            reason: PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT
          }));
          this.scheduleLearnerPromotion(PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK);
          return;
        }
      } // Allow promotion if:
      // 1. Promoting this learner alone would result in odd count, OR
      // 2. This is the single temporary replacement learner above target, OR
      // 3. There are multiple learners and promoting ALL would result in odd count
      //    without exceeding the configured replica target
      if (stryMutAct_9fa48("105747") ? wouldBeEven && activeVoterCount >= NUM.THREE && !singleReplacementPromotionAllowed || !multiLearnerPromotionAllowed : stryMutAct_9fa48("105746") ? false : stryMutAct_9fa48("105745") ? true : (stryCov_9fa48("105745", "105746", "105747"), (stryMutAct_9fa48("105749") ? wouldBeEven && activeVoterCount >= NUM.THREE || !singleReplacementPromotionAllowed : stryMutAct_9fa48("105748") ? true : (stryCov_9fa48("105748", "105749"), (stryMutAct_9fa48("105751") ? wouldBeEven || activeVoterCount >= NUM.THREE : stryMutAct_9fa48("105750") ? true : (stryCov_9fa48("105750", "105751"), wouldBeEven && (stryMutAct_9fa48("105754") ? activeVoterCount < NUM.THREE : stryMutAct_9fa48("105753") ? activeVoterCount > NUM.THREE : stryMutAct_9fa48("105752") ? true : (stryCov_9fa48("105752", "105753", "105754"), activeVoterCount >= NUM.THREE)))) && (stryMutAct_9fa48("105755") ? singleReplacementPromotionAllowed : (stryCov_9fa48("105755"), !singleReplacementPromotionAllowed)))) && (stryMutAct_9fa48("105756") ? multiLearnerPromotionAllowed : (stryCov_9fa48("105756"), !multiLearnerPromotionAllowed)))) {
        if (stryMutAct_9fa48("105757")) {
          {}
        } else {
          stryCov_9fa48("105757");
          // Defer promotion - reschedule check after a shorter interval
          // The old replica should be removed soon, which will make the count odd again
          this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, stryMutAct_9fa48("105758") ? {} : (stryCov_9fa48("105758"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            activeVoterCount,
            targetReplicaCount,
            votersAfterPromotion,
            learnerCount,
            votersAfterAllLearners,
            reason: allLearnersWouldBeOdd ? PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT : PARTITION_SERVICE_LITERAL.WOULD_CAUSE_EVEN_VOTER_COUNT
          }));
          this.scheduleLearnerPromotion(PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK);
          return;
        }
      } // Log if we're allowing promotion due to multiple learners
      if (stryMutAct_9fa48("105761") ? wouldBeEven || multiLearnerPromotionAllowed : stryMutAct_9fa48("105760") ? false : stryMutAct_9fa48("105759") ? true : (stryCov_9fa48("105759", "105760", "105761"), wouldBeEven && multiLearnerPromotionAllowed)) {
        if (stryMutAct_9fa48("105762")) {
          {}
        } else {
          stryCov_9fa48("105762");
          this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ALLOWED_MULTI, stryMutAct_9fa48("105763") ? {} : (stryCov_9fa48("105763"), {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            activeVoterCount,
            learnerCount,
            targetReplicaCount,
            votersAfterAllLearners
          }));
        }
      } // Promote to follower - now eligible to participate in elections
      this.role = RaftRole.FOLLOWER;
      this.queueRoleUpdate(this.role);
      const wasJoiningExistingGroup = stryMutAct_9fa48("105766") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("105765") ? false : stryMutAct_9fa48("105764") ? true : (stryCov_9fa48("105764", "105765", "105766"), this.isJoiningExistingGroup === (stryMutAct_9fa48("105767") ? false : (stryCov_9fa48("105767"), true)));
      if (stryMutAct_9fa48("105769") ? false : stryMutAct_9fa48("105768") ? true : (stryCov_9fa48("105768", "105769"), wasJoiningExistingGroup)) {
        if (stryMutAct_9fa48("105770")) {
          {}
        } else {
          stryCov_9fa48("105770");
          this.isJoiningExistingGroup = stryMutAct_9fa48("105771") ? true : (stryCov_9fa48("105771"), false);
          this.deferElection = stryMutAct_9fa48("105772") ? true : (stryCov_9fa48("105772"), false);
        }
      }
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, stryMutAct_9fa48("105773") ? {} : (stryCov_9fa48("105773"), {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        leaderId: this.leaderId,
        activeVoterCount: votersAfterPromotion,
        wasJoiningExistingGroup
      })); // Start election timer now that we're a full participant
      this.startElection();
    }
  } /**
    * Resolve add-like in-flight replica operation targets for this partition.
    * Operation ownership is canonical for active replacement/add workflows, so
    * stale learner service rows without active operations must not block a
    * joining learner's promotability.
    *
    * @return {Set<string>|null}
    * @private
    */
  getInFlightAddLikeOperationReplicaIds() {
    if (stryMutAct_9fa48("105774")) {
      {}
    } else {
      stryCov_9fa48("105774");
      if (stryMutAct_9fa48("105777") ? !this.systemTableCache && typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105776") ? false : stryMutAct_9fa48("105775") ? true : (stryCov_9fa48("105775", "105776", "105777"), (stryMutAct_9fa48("105778") ? this.systemTableCache : (stryCov_9fa48("105778"), !this.systemTableCache)) || (stryMutAct_9fa48("105780") ? typeof this.systemTableCache.filter === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105779") ? false : (stryCov_9fa48("105779", "105780"), typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION)))) {
        if (stryMutAct_9fa48("105781")) {
          {}
        } else {
          stryCov_9fa48("105781");
          return null;
        }
      }
      const operationRows = stryMutAct_9fa48("105782") ? this.systemTableCache : (stryCov_9fa48("105782"), this.systemTableCache.filter(TABLES.REPLICA_OPERATIONS, operationRow => {
        if (stryMutAct_9fa48("105783")) {
          {}
        } else {
          stryCov_9fa48("105783");
          if (stryMutAct_9fa48("105786") ? !operationRow && operationRow.partition_id !== this.partitionId : stryMutAct_9fa48("105785") ? false : stryMutAct_9fa48("105784") ? true : (stryCov_9fa48("105784", "105785", "105786"), (stryMutAct_9fa48("105787") ? operationRow : (stryCov_9fa48("105787"), !operationRow)) || (stryMutAct_9fa48("105789") ? operationRow.partition_id === this.partitionId : stryMutAct_9fa48("105788") ? false : (stryCov_9fa48("105788", "105789"), operationRow.partition_id !== this.partitionId)))) {
            if (stryMutAct_9fa48("105790")) {
              {}
            } else {
              stryCov_9fa48("105790");
              return stryMutAct_9fa48("105791") ? true : (stryCov_9fa48("105791"), false);
            }
          }
          const operationType = stryMutAct_9fa48("105792") ? String(operationRow.type ?? operationRow.operation_type ?? operationRow.operationType ?? '').toLowerCase() : (stryCov_9fa48("105792"), String(stryMutAct_9fa48("105793") ? (operationRow.type ?? operationRow.operation_type ?? operationRow.operationType) && '' : (stryCov_9fa48("105793"), (stryMutAct_9fa48("105794") ? (operationRow.type ?? operationRow.operation_type) && operationRow.operationType : (stryCov_9fa48("105794"), (stryMutAct_9fa48("105795") ? operationRow.type && operationRow.operation_type : (stryCov_9fa48("105795"), operationRow.type ?? operationRow.operation_type)) ?? operationRow.operationType)) ?? (stryMutAct_9fa48("105796") ? "Stryker was here!" : (stryCov_9fa48("105796"), '')))).toUpperCase());
          if (stryMutAct_9fa48("105799") ? false : stryMutAct_9fa48("105798") ? true : stryMutAct_9fa48("105797") ? ADD_LIKE_REPLICA_OPERATION_TYPES.has(operationType) : (stryCov_9fa48("105797", "105798", "105799"), !ADD_LIKE_REPLICA_OPERATION_TYPES.has(operationType))) {
            if (stryMutAct_9fa48("105800")) {
              {}
            } else {
              stryCov_9fa48("105800");
              return stryMutAct_9fa48("105801") ? true : (stryCov_9fa48("105801"), false);
            }
          }
          const operationStatus = stryMutAct_9fa48("105802") ? String(operationRow.status ?? operationRow.operation_status ?? operationRow.operationStatus ?? '').toUpperCase() : (stryCov_9fa48("105802"), String(stryMutAct_9fa48("105803") ? (operationRow.status ?? operationRow.operation_status ?? operationRow.operationStatus) && '' : (stryCov_9fa48("105803"), (stryMutAct_9fa48("105804") ? (operationRow.status ?? operationRow.operation_status) && operationRow.operationStatus : (stryCov_9fa48("105804"), (stryMutAct_9fa48("105805") ? operationRow.status && operationRow.operation_status : (stryCov_9fa48("105805"), operationRow.status ?? operationRow.operation_status)) ?? operationRow.operationStatus)) ?? (stryMutAct_9fa48("105806") ? "Stryker was here!" : (stryCov_9fa48("105806"), '')))).toLowerCase());
          return stryMutAct_9fa48("105807") ? TERMINAL_STATUSES.includes(operationStatus) : (stryCov_9fa48("105807"), !TERMINAL_STATUSES.includes(operationStatus));
        }
      }));
      if (stryMutAct_9fa48("105810") ? !Array.isArray(operationRows) && operationRows.length === NUM.ZERO : stryMutAct_9fa48("105809") ? false : stryMutAct_9fa48("105808") ? true : (stryCov_9fa48("105808", "105809", "105810"), (stryMutAct_9fa48("105811") ? Array.isArray(operationRows) : (stryCov_9fa48("105811"), !Array.isArray(operationRows))) || (stryMutAct_9fa48("105813") ? operationRows.length !== NUM.ZERO : stryMutAct_9fa48("105812") ? false : (stryCov_9fa48("105812", "105813"), operationRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("105814")) {
          {}
        } else {
          stryCov_9fa48("105814");
          return null;
        }
      }
      const inFlightReplicaIds = new Set();
      const normalizedLocalNodeId = stryMutAct_9fa48("105815") ? String(this.nodeId || '') : (stryCov_9fa48("105815"), String(stryMutAct_9fa48("105818") ? this.nodeId && '' : stryMutAct_9fa48("105817") ? false : stryMutAct_9fa48("105816") ? true : (stryCov_9fa48("105816", "105817", "105818"), this.nodeId || (stryMutAct_9fa48("105819") ? "Stryker was here!" : (stryCov_9fa48("105819"), '')))).trim());
      const normalizedLocalReplicaId = stryMutAct_9fa48("105820") ? String(this.replicaId || '') : (stryCov_9fa48("105820"), String(stryMutAct_9fa48("105823") ? this.replicaId && '' : stryMutAct_9fa48("105822") ? false : stryMutAct_9fa48("105821") ? true : (stryCov_9fa48("105821", "105822", "105823"), this.replicaId || (stryMutAct_9fa48("105824") ? "Stryker was here!" : (stryCov_9fa48("105824"), '')))).trim());
      for (const operationRow of operationRows) {
        if (stryMutAct_9fa48("105825")) {
          {}
        } else {
          stryCov_9fa48("105825");
          const replicaId = stryMutAct_9fa48("105826") ? String(operationRow.replica_id ?? operationRow.replicaId ?? '') : (stryCov_9fa48("105826"), String(stryMutAct_9fa48("105827") ? (operationRow.replica_id ?? operationRow.replicaId) && '' : (stryCov_9fa48("105827"), (stryMutAct_9fa48("105828") ? operationRow.replica_id && operationRow.replicaId : (stryCov_9fa48("105828"), operationRow.replica_id ?? operationRow.replicaId)) ?? (stryMutAct_9fa48("105829") ? "Stryker was here!" : (stryCov_9fa48("105829"), '')))).trim());
          if (stryMutAct_9fa48("105833") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("105832") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("105831") ? false : stryMutAct_9fa48("105830") ? true : (stryCov_9fa48("105830", "105831", "105832", "105833"), replicaId.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("105834")) {
              {}
            } else {
              stryCov_9fa48("105834");
              inFlightReplicaIds.add(replicaId);
              continue;
            }
          }
          const targetNodeId = stryMutAct_9fa48("105835") ? String(operationRow.target_node_id ?? operationRow.targetNodeId ?? '') : (stryCov_9fa48("105835"), String(stryMutAct_9fa48("105836") ? (operationRow.target_node_id ?? operationRow.targetNodeId) && '' : (stryCov_9fa48("105836"), (stryMutAct_9fa48("105837") ? operationRow.target_node_id && operationRow.targetNodeId : (stryCov_9fa48("105837"), operationRow.target_node_id ?? operationRow.targetNodeId)) ?? (stryMutAct_9fa48("105838") ? "Stryker was here!" : (stryCov_9fa48("105838"), '')))).trim());
          if (stryMutAct_9fa48("105841") ? targetNodeId.length > NUM.ZERO && normalizedLocalNodeId.length > NUM.ZERO && normalizedLocalReplicaId.length > NUM.ZERO || targetNodeId === normalizedLocalNodeId : stryMutAct_9fa48("105840") ? false : stryMutAct_9fa48("105839") ? true : (stryCov_9fa48("105839", "105840", "105841"), (stryMutAct_9fa48("105843") ? targetNodeId.length > NUM.ZERO && normalizedLocalNodeId.length > NUM.ZERO || normalizedLocalReplicaId.length > NUM.ZERO : stryMutAct_9fa48("105842") ? true : (stryCov_9fa48("105842", "105843"), (stryMutAct_9fa48("105845") ? targetNodeId.length > NUM.ZERO || normalizedLocalNodeId.length > NUM.ZERO : stryMutAct_9fa48("105844") ? true : (stryCov_9fa48("105844", "105845"), (stryMutAct_9fa48("105848") ? targetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("105847") ? targetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("105846") ? true : (stryCov_9fa48("105846", "105847", "105848"), targetNodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("105851") ? normalizedLocalNodeId.length <= NUM.ZERO : stryMutAct_9fa48("105850") ? normalizedLocalNodeId.length >= NUM.ZERO : stryMutAct_9fa48("105849") ? true : (stryCov_9fa48("105849", "105850", "105851"), normalizedLocalNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("105854") ? normalizedLocalReplicaId.length <= NUM.ZERO : stryMutAct_9fa48("105853") ? normalizedLocalReplicaId.length >= NUM.ZERO : stryMutAct_9fa48("105852") ? true : (stryCov_9fa48("105852", "105853", "105854"), normalizedLocalReplicaId.length > NUM.ZERO)))) && (stryMutAct_9fa48("105856") ? targetNodeId !== normalizedLocalNodeId : stryMutAct_9fa48("105855") ? true : (stryCov_9fa48("105855", "105856"), targetNodeId === normalizedLocalNodeId)))) {
            if (stryMutAct_9fa48("105857")) {
              {}
            } else {
              stryCov_9fa48("105857");
              inFlightReplicaIds.add(normalizedLocalReplicaId);
            }
          }
        }
      }
      return (stryMutAct_9fa48("105861") ? inFlightReplicaIds.size <= NUM.ZERO : stryMutAct_9fa48("105860") ? inFlightReplicaIds.size >= NUM.ZERO : stryMutAct_9fa48("105859") ? false : stryMutAct_9fa48("105858") ? true : (stryCov_9fa48("105858", "105859", "105860", "105861"), inFlightReplicaIds.size > NUM.ZERO)) ? inFlightReplicaIds : null;
    }
  } /**
    * Count pending learners in the Raft group.
    * Uses the system table cache to get current replica states.
    * @return {number} Number of pending learners.
    * @private
    */
  countPendingLearners() {
    if (stryMutAct_9fa48("105862")) {
      {}
    } else {
      stryCov_9fa48("105862");
      // If no system table cache, return 1 (just this learner)
      if (stryMutAct_9fa48("105865") ? false : stryMutAct_9fa48("105864") ? true : stryMutAct_9fa48("105863") ? this.systemTableCache : (stryCov_9fa48("105863", "105864", "105865"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("105866")) {
          {}
        } else {
          stryCov_9fa48("105866");
          return NUM.ONE;
        }
      }
      const inFlightAddLikeReplicaIds = this.getInFlightAddLikeOperationReplicaIds(); // Query services table for replicas of this partition
      const services = stryMutAct_9fa48("105867") ? this.systemTableCache : (stryCov_9fa48("105867"), this.systemTableCache.filter(TABLES.SERVICES, service => {
        if (stryMutAct_9fa48("105868")) {
          {}
        } else {
          stryCov_9fa48("105868");
          return stryMutAct_9fa48("105871") ? service.partition_id === this.partitionId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("105870") ? false : stryMutAct_9fa48("105869") ? true : (stryCov_9fa48("105869", "105870", "105871"), (stryMutAct_9fa48("105873") ? service.partition_id !== this.partitionId : stryMutAct_9fa48("105872") ? true : (stryCov_9fa48("105872", "105873"), service.partition_id === this.partitionId)) && (stryMutAct_9fa48("105875") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("105874") ? true : (stryCov_9fa48("105874", "105875"), service.service_type === SERVICE_TYPE.PARTITION)));
        }
      })); // Count replicas that are learners
      let learnerCount = NUM.ZERO;
      for (const service of services) {
        if (stryMutAct_9fa48("105876")) {
          {}
        } else {
          stryCov_9fa48("105876");
          const status = stryMutAct_9fa48("105879") ? service.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("105878") ? false : stryMutAct_9fa48("105877") ? true : (stryCov_9fa48("105877", "105878", "105879"), service.status || ReplicaStatus.ACTIVE);
          const raftRole = service.raft_role; // Skip failed, removing, or removed replicas
          if (stryMutAct_9fa48("105882") ? (status === ReplicaStatus.FAILED || status === ReplicaStatus.REMOVING) && status === ReplicaStatus.REMOVED : stryMutAct_9fa48("105881") ? false : stryMutAct_9fa48("105880") ? true : (stryCov_9fa48("105880", "105881", "105882"), (stryMutAct_9fa48("105884") ? status === ReplicaStatus.FAILED && status === ReplicaStatus.REMOVING : stryMutAct_9fa48("105883") ? false : (stryCov_9fa48("105883", "105884"), (stryMutAct_9fa48("105886") ? status !== ReplicaStatus.FAILED : stryMutAct_9fa48("105885") ? false : (stryCov_9fa48("105885", "105886"), status === ReplicaStatus.FAILED)) || (stryMutAct_9fa48("105888") ? status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("105887") ? false : (stryCov_9fa48("105887", "105888"), status === ReplicaStatus.REMOVING)))) || (stryMutAct_9fa48("105890") ? status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("105889") ? false : (stryCov_9fa48("105889", "105890"), status === ReplicaStatus.REMOVED)))) {
            if (stryMutAct_9fa48("105891")) {
              {}
            } else {
              stryCov_9fa48("105891");
              continue;
            }
          }
          const replicaId = stryMutAct_9fa48("105892") ? String(service.service_id ?? service.replica_id ?? '') : (stryCov_9fa48("105892"), String(stryMutAct_9fa48("105893") ? (service.service_id ?? service.replica_id) && '' : (stryCov_9fa48("105893"), (stryMutAct_9fa48("105894") ? service.service_id && service.replica_id : (stryCov_9fa48("105894"), service.service_id ?? service.replica_id)) ?? (stryMutAct_9fa48("105895") ? "Stryker was here!" : (stryCov_9fa48("105895"), '')))).trim());
          if (stryMutAct_9fa48("105898") ? inFlightAddLikeReplicaIds && inFlightAddLikeReplicaIds.size > NUM.ZERO || !inFlightAddLikeReplicaIds.has(replicaId) : stryMutAct_9fa48("105897") ? false : stryMutAct_9fa48("105896") ? true : (stryCov_9fa48("105896", "105897", "105898"), (stryMutAct_9fa48("105900") ? inFlightAddLikeReplicaIds || inFlightAddLikeReplicaIds.size > NUM.ZERO : stryMutAct_9fa48("105899") ? true : (stryCov_9fa48("105899", "105900"), inFlightAddLikeReplicaIds && (stryMutAct_9fa48("105903") ? inFlightAddLikeReplicaIds.size <= NUM.ZERO : stryMutAct_9fa48("105902") ? inFlightAddLikeReplicaIds.size >= NUM.ZERO : stryMutAct_9fa48("105901") ? true : (stryCov_9fa48("105901", "105902", "105903"), inFlightAddLikeReplicaIds.size > NUM.ZERO)))) && (stryMutAct_9fa48("105904") ? inFlightAddLikeReplicaIds.has(replicaId) : (stryCov_9fa48("105904"), !inFlightAddLikeReplicaIds.has(replicaId))))) {
            if (stryMutAct_9fa48("105905")) {
              {}
            } else {
              stryCov_9fa48("105905");
              continue;
            }
          } // Count learners
          if (stryMutAct_9fa48("105908") ? raftRole !== PARTITION_RAFT_ROLE.LEARNER : stryMutAct_9fa48("105907") ? false : stryMutAct_9fa48("105906") ? true : (stryCov_9fa48("105906", "105907", "105908"), raftRole === PARTITION_RAFT_ROLE.LEARNER)) {
            if (stryMutAct_9fa48("105909")) {
              {}
            } else {
              stryCov_9fa48("105909");
              stryMutAct_9fa48("105910") ? learnerCount-- : (stryCov_9fa48("105910"), learnerCount++);
            }
          }
        }
      } // Ensure we count at least 1 (this learner) even if cache is stale
      return stryMutAct_9fa48("105911") ? Math.min(learnerCount, NUM.ONE) : (stryCov_9fa48("105911"), Math.max(learnerCount, NUM.ONE));
    }
  } /**
    * Resolve the authoritative target voter count for learner promotion.
    * Defaults to the configured partition replica count when cache metadata
    * is temporarily unavailable.
    * @return {number}
    * @private
    */
  getTargetReplicaCountForPromotion() {
    if (stryMutAct_9fa48("105912")) {
      {}
    } else {
      stryCov_9fa48("105912");
      const partitionRow = this.getCachedSystemTableRow(TABLES.PARTITIONS, stryMutAct_9fa48("105913") ? () => undefined : (stryCov_9fa48("105913"), partition => stryMutAct_9fa48("105916") ? partition?.[COLUMN.PARTITION_ID] !== this.partitionId : stryMutAct_9fa48("105915") ? false : stryMutAct_9fa48("105914") ? true : (stryCov_9fa48("105914", "105915", "105916"), (stryMutAct_9fa48("105917") ? partition[COLUMN.PARTITION_ID] : (stryCov_9fa48("105917"), partition?.[COLUMN.PARTITION_ID])) === this.partitionId)));
      const configuredReplicaCount = Number(stryMutAct_9fa48("105918") ? partitionRow[PARTITION_REPLICA_COUNT_FIELD] : (stryCov_9fa48("105918"), partitionRow?.[PARTITION_REPLICA_COUNT_FIELD]));
      if (stryMutAct_9fa48("105921") ? Number.isFinite(configuredReplicaCount) || configuredReplicaCount > NUM.ZERO : stryMutAct_9fa48("105920") ? false : stryMutAct_9fa48("105919") ? true : (stryCov_9fa48("105919", "105920", "105921"), Number.isFinite(configuredReplicaCount) && (stryMutAct_9fa48("105924") ? configuredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("105923") ? configuredReplicaCount >= NUM.ZERO : stryMutAct_9fa48("105922") ? true : (stryCov_9fa48("105922", "105923", "105924"), configuredReplicaCount > NUM.ZERO)))) {
        if (stryMutAct_9fa48("105925")) {
          {}
        } else {
          stryCov_9fa48("105925");
          return configuredReplicaCount;
        }
      }
      return this.defaultReplicaCount;
    }
  } /**
    * Count active voters in the Raft group (excluding learners).
    * Uses the system table cache to get current replica states.
    * @return {number} Number of active voters.
    * @private
    */
  countActiveVoters() {
    if (stryMutAct_9fa48("105926")) {
      {}
    } else {
      stryCov_9fa48("105926");
      // If no system table cache, fall back to replicaIds count
      // This is a conservative estimate that may include learners
      if (stryMutAct_9fa48("105929") ? false : stryMutAct_9fa48("105928") ? true : stryMutAct_9fa48("105927") ? this.systemTableCache : (stryCov_9fa48("105927", "105928", "105929"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("105930")) {
          {}
        } else {
          stryCov_9fa48("105930");
          return this.replicaIds.length;
        }
      } // Query services table for replicas of this partition
      const services = stryMutAct_9fa48("105931") ? this.systemTableCache : (stryCov_9fa48("105931"), this.systemTableCache.filter(TABLES.SERVICES, service => {
        if (stryMutAct_9fa48("105932")) {
          {}
        } else {
          stryCov_9fa48("105932");
          return stryMutAct_9fa48("105935") ? service.partition_id === this.partitionId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("105934") ? false : stryMutAct_9fa48("105933") ? true : (stryCov_9fa48("105933", "105934", "105935"), (stryMutAct_9fa48("105937") ? service.partition_id !== this.partitionId : stryMutAct_9fa48("105936") ? true : (stryCov_9fa48("105936", "105937"), service.partition_id === this.partitionId)) && (stryMutAct_9fa48("105939") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("105938") ? true : (stryCov_9fa48("105938", "105939"), service.service_type === SERVICE_TYPE.PARTITION)));
        }
      })); // Count replicas that are active voters (not learners, not failed, not removing)
      let voterCount = NUM.ZERO;
      for (const service of services) {
        if (stryMutAct_9fa48("105940")) {
          {}
        } else {
          stryCov_9fa48("105940");
          const status = stryMutAct_9fa48("105943") ? service.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("105942") ? false : stryMutAct_9fa48("105941") ? true : (stryCov_9fa48("105941", "105942", "105943"), service.status || ReplicaStatus.ACTIVE);
          const raftRole = service.raft_role; // Skip failed, removing, or removed replicas
          if (stryMutAct_9fa48("105946") ? (status === ReplicaStatus.FAILED || status === ReplicaStatus.REMOVING) && status === ReplicaStatus.REMOVED : stryMutAct_9fa48("105945") ? false : stryMutAct_9fa48("105944") ? true : (stryCov_9fa48("105944", "105945", "105946"), (stryMutAct_9fa48("105948") ? status === ReplicaStatus.FAILED && status === ReplicaStatus.REMOVING : stryMutAct_9fa48("105947") ? false : (stryCov_9fa48("105947", "105948"), (stryMutAct_9fa48("105950") ? status !== ReplicaStatus.FAILED : stryMutAct_9fa48("105949") ? false : (stryCov_9fa48("105949", "105950"), status === ReplicaStatus.FAILED)) || (stryMutAct_9fa48("105952") ? status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("105951") ? false : (stryCov_9fa48("105951", "105952"), status === ReplicaStatus.REMOVING)))) || (stryMutAct_9fa48("105954") ? status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("105953") ? false : (stryCov_9fa48("105953", "105954"), status === ReplicaStatus.REMOVED)))) {
            if (stryMutAct_9fa48("105955")) {
              {}
            } else {
              stryCov_9fa48("105955");
              continue;
            }
          } // Skip learners (they don't vote)
          if (stryMutAct_9fa48("105958") ? raftRole !== PARTITION_RAFT_ROLE.LEARNER : stryMutAct_9fa48("105957") ? false : stryMutAct_9fa48("105956") ? true : (stryCov_9fa48("105956", "105957", "105958"), raftRole === PARTITION_RAFT_ROLE.LEARNER)) {
            if (stryMutAct_9fa48("105959")) {
              {}
            } else {
              stryCov_9fa48("105959");
              continue;
            }
          }
          if (stryMutAct_9fa48("105961") ? false : stryMutAct_9fa48("105960") ? true : (stryCov_9fa48("105960", "105961"), ACTIVE_VOTER_ROLES.has(raftRole))) {
            if (stryMutAct_9fa48("105962")) {
              {}
            } else {
              stryCov_9fa48("105962");
              stryMutAct_9fa48("105963") ? voterCount-- : (stryCov_9fa48("105963"), voterCount++);
            }
          }
        }
      }
      return voterCount;
    }
  } /**
    * Stop all rebalancing activity for this partition.
    * @return {Promise<void>}
    */
  async quiesceRebalancing() {
    if (stryMutAct_9fa48("105964")) {
      {}
    } else {
      stryCov_9fa48("105964");
      if (stryMutAct_9fa48("105966") ? false : stryMutAct_9fa48("105965") ? true : (stryCov_9fa48("105965", "105966"), this.rebalancer)) {
        if (stryMutAct_9fa48("105967")) {
          {}
        } else {
          stryCov_9fa48("105967");
          if (stryMutAct_9fa48("105970") ? typeof this.rebalancer.setLeader !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105969") ? false : stryMutAct_9fa48("105968") ? true : (stryCov_9fa48("105968", "105969", "105970"), typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION)) {
            if (stryMutAct_9fa48("105971")) {
              {}
            } else {
              stryCov_9fa48("105971");
              this.rebalancer.setLeader(stryMutAct_9fa48("105972") ? true : (stryCov_9fa48("105972"), false));
            }
          }
          if (stryMutAct_9fa48("105975") ? typeof this.rebalancer.shutdown !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("105974") ? false : stryMutAct_9fa48("105973") ? true : (stryCov_9fa48("105973", "105974", "105975"), typeof this.rebalancer.shutdown === PARTITION_SERVICE_TYPE.FUNCTION)) {
            if (stryMutAct_9fa48("105976")) {
              {}
            } else {
              stryCov_9fa48("105976");
              this.rebalancer.shutdown();
            }
          }
          this.rebalancer = null;
        }
      }
      if (stryMutAct_9fa48("105979") ? this.rebalanceCoordinator || this.ownsRebalanceCoordinator : stryMutAct_9fa48("105978") ? false : stryMutAct_9fa48("105977") ? true : (stryCov_9fa48("105977", "105978", "105979"), this.rebalanceCoordinator && this.ownsRebalanceCoordinator)) {
        if (stryMutAct_9fa48("105980")) {
          {}
        } else {
          stryCov_9fa48("105980");
          try {
            if (stryMutAct_9fa48("105981")) {
              {}
            } else {
              stryCov_9fa48("105981");
              await this.rebalanceCoordinator.shutdown();
            }
          } catch (error) {
            if (stryMutAct_9fa48("105982")) {
              {}
            } else {
              stryCov_9fa48("105982");
              this.logger.warn(PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED, stryMutAct_9fa48("105983") ? {} : (stryCov_9fa48("105983"), {
                partitionId: this.partitionId,
                replicaId: this.replicaId,
                error: error.message
              }));
            }
          }
        }
      }
      this.rebalanceCoordinator = null;
      this.ownsRebalanceCoordinator = stryMutAct_9fa48("105984") ? true : (stryCov_9fa48("105984"), false);
    }
  } /**
    * Get compact partition runtime statistics for diagnostics attribution.
    * @return {Object}
    */
  getStats() {
    if (stryMutAct_9fa48("105985")) {
      {}
    } else {
      stryCov_9fa48("105985");
      const pendingRequestTrackerStats = (stryMutAct_9fa48("105988") ? this.pendingRequestTracker || typeof this.pendingRequestTracker.getStats === 'function' : stryMutAct_9fa48("105987") ? false : stryMutAct_9fa48("105986") ? true : (stryCov_9fa48("105986", "105987", "105988"), this.pendingRequestTracker && (stryMutAct_9fa48("105990") ? typeof this.pendingRequestTracker.getStats !== 'function' : stryMutAct_9fa48("105989") ? true : (stryCov_9fa48("105989", "105990"), typeof this.pendingRequestTracker.getStats === (stryMutAct_9fa48("105991") ? "" : (stryCov_9fa48("105991"), 'function')))))) ? this.pendingRequestTracker.getStats() : null;
      return stryMutAct_9fa48("105992") ? {} : (stryCov_9fa48("105992"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        role: this.role,
        isLeader: this.isLeader,
        initialized: this.initialized,
        cdcReplay: stryMutAct_9fa48("105993") ? {} : (stryCov_9fa48("105993"), {
          bufferedEvents: this.cdcEventBuffer.size(),
          replayBufferGrowthCount: this.cdcReplayBufferGrowthCount,
          replayRetryDepth: this.cdcReplayRetryDepth,
          replayDelayMs: this.cdcBufferReplayDelayMs,
          replayInFlight: this.cdcBufferReplayInFlight,
          subscriberCount: this.cdcSubscribers.size
        }),
        pendingRequestCount: stryMutAct_9fa48("105996") ? pendingRequestTrackerStats?.pendingCount && NUM.ZERO : stryMutAct_9fa48("105995") ? false : stryMutAct_9fa48("105994") ? true : (stryCov_9fa48("105994", "105995", "105996"), (stryMutAct_9fa48("105997") ? pendingRequestTrackerStats.pendingCount : (stryCov_9fa48("105997"), pendingRequestTrackerStats?.pendingCount)) || NUM.ZERO),
        pendingRequestTracker: pendingRequestTrackerStats
      });
    }
  } /**
    * Shutdown the partition service.
    * @return {Promise<void>}
    */
  async shutdown() {
    if (stryMutAct_9fa48("105998")) {
      {}
    } else {
      stryCov_9fa48("105998");
      this.isShutdown = stryMutAct_9fa48("105999") ? false : (stryCov_9fa48("105999"), true);
      this.leaderActivationGate.shutdown();
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("106000") ? {} : (stryCov_9fa48("106000"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      })); // Clear learner promotion timer
      if (stryMutAct_9fa48("106002") ? false : stryMutAct_9fa48("106001") ? true : (stryCov_9fa48("106001", "106002"), this.learnerPromotionTimer)) {
        if (stryMutAct_9fa48("106003")) {
          {}
        } else {
          stryCov_9fa48("106003");
          clearTimeout(this.learnerPromotionTimer);
          this.learnerPromotionTimer = null;
        }
      }
      this.peerReconciliationScheduled = stryMutAct_9fa48("106004") ? true : (stryCov_9fa48("106004"), false);
      if (stryMutAct_9fa48("106007") ? this.systemTableCache && typeof this.systemTableCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("106006") ? false : stryMutAct_9fa48("106005") ? true : (stryCov_9fa48("106005", "106006", "106007"), (stryMutAct_9fa48("106009") ? this.systemTableCache || typeof this.systemTableCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("106008") ? true : (stryCov_9fa48("106008", "106009"), this.systemTableCache && (stryMutAct_9fa48("106011") ? typeof this.systemTableCache.offCacheChange !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("106010") ? true : (stryCov_9fa48("106010", "106011"), typeof this.systemTableCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("106012")) {
          {}
        } else {
          stryCov_9fa48("106012");
          this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
        }
      } // Close log adapter first to prevent database access after close
      // This must happen before raft.end() to avoid race conditions
      if (stryMutAct_9fa48("106014") ? false : stryMutAct_9fa48("106013") ? true : (stryCov_9fa48("106013", "106014"), this.logAdapter)) {
        if (stryMutAct_9fa48("106015")) {
          {}
        } else {
          stryCov_9fa48("106015");
          this.logAdapter.close();
        }
      } // Stop liferaft instance - clear all timers first
      if (stryMutAct_9fa48("106017") ? false : stryMutAct_9fa48("106016") ? true : (stryCov_9fa48("106016", "106017"), this.raft)) {
        if (stryMutAct_9fa48("106018")) {
          {}
        } else {
          stryCov_9fa48("106018");
          this.raftProvider.shutdownNode(this.raft);
          this.raft = null;
        }
      } // Stop periodic size updates
      this.stopPeriodicSizeUpdates();
      this.stopPreparedStateHoldTimeoutSweep();
      if (stryMutAct_9fa48("106021") ? typeof this.releaseMetadataPublicationReadinessListener !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("106020") ? false : stryMutAct_9fa48("106019") ? true : (stryCov_9fa48("106019", "106020", "106021"), typeof this.releaseMetadataPublicationReadinessListener === PARTITION_SERVICE_TYPE.FUNCTION)) {
        if (stryMutAct_9fa48("106022")) {
          {}
        } else {
          stryCov_9fa48("106022");
          this.releaseMetadataPublicationReadinessListener();
        }
      }
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.roleMutationHelper.shutdown();
      this.leaderNodeMutationHelper.shutdown();
      if (stryMutAct_9fa48("106024") ? false : stryMutAct_9fa48("106023") ? true : (stryCov_9fa48("106023", "106024"), this.cdcBufferReplayTimer)) {
        if (stryMutAct_9fa48("106025")) {
          {}
        } else {
          stryCov_9fa48("106025");
          clearTimeout(this.cdcBufferReplayTimer);
          this.cdcBufferReplayTimer = null;
        }
      }
      this.cdcBufferReplayInFlight = stryMutAct_9fa48("106026") ? true : (stryCov_9fa48("106026"), false); // Clear pending requests via PendingRequestTracker (Requirements: 3.5)
      if (stryMutAct_9fa48("106028") ? false : stryMutAct_9fa48("106027") ? true : (stryCov_9fa48("106027", "106028"), this.pendingRequestTracker)) {
        if (stryMutAct_9fa48("106029")) {
          {}
        } else {
          stryCov_9fa48("106029");
          this.pendingRequestTracker.clear();
        }
      }
      this.clearPendingCommittedWrites(PARTITION_SERVICE_LITERAL.PARTITION_SERVICE_SHUTDOWN);
      await this.quiesceRebalancing();
      if (stryMutAct_9fa48("106033") ? this.pendingCDCEventDeliveries.size <= NUM.ZERO : stryMutAct_9fa48("106032") ? this.pendingCDCEventDeliveries.size >= NUM.ZERO : stryMutAct_9fa48("106031") ? false : stryMutAct_9fa48("106030") ? true : (stryCov_9fa48("106030", "106031", "106032", "106033"), this.pendingCDCEventDeliveries.size > NUM.ZERO)) {
        if (stryMutAct_9fa48("106034")) {
          {}
        } else {
          stryCov_9fa48("106034");
          await Promise.allSettled(stryMutAct_9fa48("106035") ? [] : (stryCov_9fa48("106035"), [...this.pendingCDCEventDeliveries]));
          this.pendingCDCEventDeliveries.clear();
        }
      } // Unregister from transport
      if (stryMutAct_9fa48("106037") ? false : stryMutAct_9fa48("106036") ? true : (stryCov_9fa48("106036", "106037"), this.transport)) {
        if (stryMutAct_9fa48("106038")) {
          {}
        } else {
          stryCov_9fa48("106038");
          this.transport.unregister(this.unifiedAddress);
        }
      } // Close database
      if (stryMutAct_9fa48("106040") ? false : stryMutAct_9fa48("106039") ? true : (stryCov_9fa48("106039", "106040"), this.db)) {
        if (stryMutAct_9fa48("106041")) {
          {}
        } else {
          stryCov_9fa48("106041");
          this.db.close();
          this.db = null;
        }
      }
      this.initialized = stryMutAct_9fa48("106042") ? true : (stryCov_9fa48("106042"), false);
      this.cdcSubscribers.clear();
      this.cdcSubscriberWrappers.clear();
      this.cdcSubscriberStates.clear();
      this.cdcSubscriptionEpoch = NUM.ZERO;
      this.cdcEventSequenceNumber = NUM.ZERO;
      this.cdcBufferReplayDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
      this.cdcReplayBufferGrowthCount = NUM.ZERO;
      this.cdcReplayRetryDepth = NUM.ZERO;
      this.recentlyAppliedEntryKeys.clear();
      this.recentlyAppliedEntryOrder = stryMutAct_9fa48("106043") ? ["Stryker was here"] : (stryCov_9fa48("106043"), []);
      this.pendingCDCEventDeliveries.clear();
      this.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, stryMutAct_9fa48("106044") ? {} : (stryCov_9fa48("106044"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
    }
  }
}
export { PartitionService, PartitionState, RaftRole, CDCOperation, PartitionRaftLogEntry, PartitionRaftStorage };