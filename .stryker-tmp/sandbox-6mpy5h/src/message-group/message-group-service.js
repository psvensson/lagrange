/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
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
import { v4 as uuidv4 } from 'uuid';
import LifeRaft from '../raft/liferaft.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, METRICS_LOG_TAG, NUM, SERVICE_STATUS, SERVICE_TYPE, STATE, STRING, TABLES, TIME_MS, TYPEOF } from '../constants/index.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { ControlPlaneMessageType } from '../control-plane/control-plane-constants.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { CONTROL_PLANE_READ_STRATEGY } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { LoggingService } from '../logging/logging-service.js';
import { NodeService } from '../node/node-service.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { HLCTimestamp } from '../hlc/hlc-timestamp.js';
import { INITIAL_MESSAGE_GROUP_ID, INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { attachTrafficReadinessListener, isBackgroundWorkReady as isBackgroundWorkLifecycleReady, isMetadataPublicationReady as isMetadataPublicationLifecycleReady } from '../bootstrap/traffic-readiness-utils.js';
import { isSystemTableWriteReady } from '../cache/leader-readiness-gate.js';
import { InMemoryLogAdapter } from '../raft/in-memory-log-adapter.js';
import { isRaftPacket, RAFT_PACKET_TYPES } from '../raft/raft-packet-utils.js';
import { RAFT_ELECTION_TIMING, RAFT_EVENT, RAFT_PACKET_TYPE } from '../raft/constants.js';
import { applyRuntimeRaftTiming, computeReplicaElectionTimeouts } from '../raft/raft-timing-utils.js';
import { LeaderActivationGate } from '../raft/leader-activation-gate.js';
import { LeaderActivationScheduler } from '../raft/leader-activation-scheduler.js';
import { assertRaftProviderContract } from '../raft/raft-provider-contract.js';
import { LiferaftProvider } from '../raft/liferaft-provider.js';
import { AuthoritativeRowMutationHelper } from '../raft/authoritative-row-mutation-helper.js';
import { wireReplicaLifecycleEvents } from '../raft/replica-leadership-state.js';
import { normalizePublishedRaftRole } from '../raft/published-raft-role.js';
import { AddressManager } from '../address/address-manager.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
import { UnifiedRebalancer, EntityType as RebalancerEntityType } from '../rebalancer/unified-rebalancer.js';
import { MESSAGE_GROUP_APPLICATION_ERROR_MSG, MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, MESSAGE_GROUP_APPLICATION_STATUS, MESSAGE_GROUP_CDC_ERROR_MSG, MESSAGE_GROUP_OPERATION_LEDGER_NOW, MESSAGE_GROUP_SERVICE_DEFAULT, MESSAGE_GROUP_SERVICE_ERROR_MSG, MESSAGE_GROUP_SERVICE_LOG_MSG, MESSAGE_GROUP_SUBSYSTEM, MESSAGE_STATUS as MessageStatus, RAFT_ROLE as RaftRole } from './constants.js';
import { CDCHandler } from './cdc-handler.js';
import { MessageGroupForwardingOwner } from './message-group-forwarding-owner.js';
import { getOrCreateCauseId, normalizeCauseId } from '../utils/cause-id.js';
import { MessageGroupOperationLedger } from './message-group-operation-ledger.js';
import { QUERY_MESSAGE_TYPE } from '../query/query-constants.js';

// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4
const MESSAGE_GROUP_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("87014") ? {} : (stryCov_9fa48("87014"), {
  VALUE: stryMutAct_9fa48("87015") ? "Stryker was here!" : (stryCov_9fa48("87015"), ''),
  VALUE_2: stryMutAct_9fa48("87016") ? "" : (stryCov_9fa48("87016"), '/'),
  CRITICAL: stryMutAct_9fa48("87017") ? "" : (stryCov_9fa48("87017"), 'critical'),
  VALUE_250: 250,
  VALUE_25: 25,
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE: stryMutAct_9fa48("87018") ? "" : (stryCov_9fa48("87018"), 'Failed to flush deferred message-group role update'),
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE: stryMutAct_9fa48("87019") ? "" : (stryCov_9fa48("87019"), 'Failed to flush deferred message-group leader update'),
  BACKGROUND: stryMutAct_9fa48("87020") ? "" : (stryCov_9fa48("87020"), 'background'),
  PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT: stryMutAct_9fa48("87021") ? "" : (stryCov_9fa48("87021"), 'Peer address must be in unified format'),
  USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION: stryMutAct_9fa48("87022") ? "" : (stryCov_9fa48("87022"), 'Using bootstrap peer hint because services cache has no peer location'),
  BOOTSTRAP_HINT: stryMutAct_9fa48("87023") ? "" : (stryCov_9fa48("87023"), 'bootstrap_hint'),
  INITIALIZING_MESSAGE_GROUP_SERVICE: stryMutAct_9fa48("87024") ? "" : (stryCov_9fa48("87024"), 'Initializing message group service'),
  DEFERRING_ELECTION_START: stryMutAct_9fa48("87025") ? "" : (stryCov_9fa48("87025"), 'Deferring election start'),
  HEARTBEAT_ELECTION: stryMutAct_9fa48("87026") ? "" : (stryCov_9fa48("87026"), 'heartbeat, election'),
  CLEARED_LIFERAFT_TIMERS_FOR_DEFERRED_ELECTION: stryMutAct_9fa48("87027") ? "" : (stryCov_9fa48("87027"), 'Cleared liferaft timers for deferred election'),
  FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT: stryMutAct_9fa48("87028") ? "" : (stryCov_9fa48("87028"), 'Failed during initialize, cleaning up raft'),
  MESSAGE_GROUP_SERVICE_INITIALIZED: stryMutAct_9fa48("87029") ? "" : (stryCov_9fa48("87029"), 'Message group service initialized'),
  INITIALIZED: stryMutAct_9fa48("87030") ? "" : (stryCov_9fa48("87030"), 'initialized'),
  LEADER_CHANGED: stryMutAct_9fa48("87031") ? "" : (stryCov_9fa48("87031"), 'Leader changed'),
  SINGLE_REPLICA_BECOMING_LEADER_IMMEDIATELY: stryMutAct_9fa48("87032") ? "" : (stryCov_9fa48("87032"), 'Single replica - becoming leader immediately'),
  LEADERELECTED: stryMutAct_9fa48("87033") ? "" : (stryCov_9fa48("87033"), 'leaderElected'),
  STARTING_RAFT_ELECTION_TIMER: stryMutAct_9fa48("87034") ? "" : (stryCov_9fa48("87034"), 'Starting Raft election timer'),
  APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION: stryMutAct_9fa48("87035") ? "" : (stryCov_9fa48("87035"), 'Applied runtime raft timing configuration'),
  TICKINTERVALMS: stryMutAct_9fa48("87036") ? "" : (stryCov_9fa48("87036"), 'tickIntervalMs'),
  MESSAGE: stryMutAct_9fa48("87037") ? "" : (stryCov_9fa48("87037"), 'MESSAGE'),
  CDC: stryMutAct_9fa48("87038") ? "" : (stryCov_9fa48("87038"), 'CDC'),
  CDCAPPLIED: stryMutAct_9fa48("87039") ? "" : (stryCov_9fa48("87039"), 'cdcApplied'),
  ACK: stryMutAct_9fa48("87040") ? "" : (stryCov_9fa48("87040"), 'ACK'),
  MESSAGEGROUPSERVICE_NOT_INITIALIZED: stryMutAct_9fa48("87041") ? "" : (stryCov_9fa48("87041"), 'MessageGroupService not initialized'),
  SENDING_MESSAGE: stryMutAct_9fa48("87042") ? "" : (stryCov_9fa48("87042"), 'Sending message'),
  MESSAGE_DELIVERED_DIRECTLY: stryMutAct_9fa48("87043") ? "" : (stryCov_9fa48("87043"), 'Message delivered directly'),
  DIRECT: stryMutAct_9fa48("87044") ? "" : (stryCov_9fa48("87044"), 'direct'),
  MESSAGE_PERSISTED_TO_RAFT_LOG_DELIVERY_FAILED: stryMutAct_9fa48("87045") ? "" : (stryCov_9fa48("87045"), 'Message persisted to Raft log (delivery failed)'),
  PERSISTED: stryMutAct_9fa48("87046") ? "" : (stryCov_9fa48("87046"), 'persisted'),
  FAILED_TO_SEND_MESSAGE: stryMutAct_9fa48("87047") ? "" : (stryCov_9fa48("87047"), 'Failed to send message'),
  WEBSOCKET_TRANSPORT_NOT_AVAILABLE_FOR_MESSAGE_DELIVERY: stryMutAct_9fa48("87048") ? "" : (stryCov_9fa48("87048"), 'WebSocket transport not available for message delivery'),
  WEBSOCKET_TRANSPORT_REQUIRED_BUT_NOT_AVAILABLE: stryMutAct_9fa48("87049") ? "" : (stryCov_9fa48("87049"), 'WebSocket transport required but not available'),
  MESSAGE_DELIVERY_DEFERRED: stryMutAct_9fa48("87050") ? "" : (stryCov_9fa48("87050"), 'Message delivery deferred'),
  MESSAGE_DELIVERY_NOT_ACKNOWLEDGED: stryMutAct_9fa48("87051") ? "" : (stryCov_9fa48("87051"), 'Message delivery not acknowledged'),
  DELIVERY_ATTEMPT_FAILED: stryMutAct_9fa48("87052") ? "" : (stryCov_9fa48("87052"), 'Delivery attempt failed'),
  MAX_RETRIES_EXCEEDED: stryMutAct_9fa48("87053") ? "" : (stryCov_9fa48("87053"), 'Max retries exceeded'),
  RAFT_COMMAND_FAILED: stryMutAct_9fa48("87054") ? "" : (stryCov_9fa48("87054"), 'Raft command failed'),
  RECEIVED_RAFT_PACKET: stryMutAct_9fa48("87055") ? "" : (stryCov_9fa48("87055"), 'Received Raft packet'),
  DATA: stryMutAct_9fa48("87056") ? "" : (stryCov_9fa48("87056"), 'data'),
  RECEIVED_APPLICATION_MESSAGE: stryMutAct_9fa48("87057") ? "" : (stryCov_9fa48("87057"), 'Received application message'),
  DUPLICATE_MESSAGE_IGNORED: stryMutAct_9fa48("87058") ? "" : (stryCov_9fa48("87058"), 'Duplicate message ignored'),
  INVALID_HLC_TIMESTAMP_IN_MESSAGE_IGNORING: stryMutAct_9fa48("87059") ? "" : (stryCov_9fa48("87059"), 'Invalid HLC timestamp in message, ignoring'),
  MESSAGERECEIVED: stryMutAct_9fa48("87060") ? "" : (stryCov_9fa48("87060"), 'messageReceived'),
  ERROR_PROCESSING_RECEIVED_MESSAGE: stryMutAct_9fa48("87061") ? "" : (stryCov_9fa48("87061"), 'Error processing received message'),
  ACKNOWLEDGING_MESSAGE: stryMutAct_9fa48("87062") ? "" : (stryCov_9fa48("87062"), 'Acknowledging message'),
  MESSAGEACKNOWLEDGED: stryMutAct_9fa48("87063") ? "" : (stryCov_9fa48("87063"), 'messageAcknowledged'),
  SUBSCRIBED_TO_CDC: stryMutAct_9fa48("87064") ? "" : (stryCov_9fa48("87064"), 'Subscribed to CDC'),
  CDC_EVENT_PROPOSED_FOR_REPLICATION_AWAITING_COMMIT_APPLY: stryMutAct_9fa48("87065") ? "" : (stryCov_9fa48("87065"), 'CDC event proposed for replication; awaiting commit apply'),
  BATCH: stryMutAct_9fa48("87066") ? "" : (stryCov_9fa48("87066"), 'batch'),
  RETRYING_RAFT_CDC_COMMAND: stryMutAct_9fa48("87067") ? "" : (stryCov_9fa48("87067"), 'Retrying Raft CDC command'),
  RAFT_CDC_COMMAND_FAILED: stryMutAct_9fa48("87068") ? "" : (stryCov_9fa48("87068"), 'Raft CDC command failed'),
  UNKNOWN_ERROR: stryMutAct_9fa48("87069") ? "" : (stryCov_9fa48("87069"), 'unknown error'),
  FAILED_TO_PERSIST_ROLE_UPDATE_AFTER_CDC_SERVICE_SET: stryMutAct_9fa48("87070") ? "" : (stryCov_9fa48("87070"), 'Failed to persist role update after CDC service set'),
  FAILED_TO_PERSIST_LEADER_UPDATE_AFTER_CDC_SERVICE_SET: stryMutAct_9fa48("87071") ? "" : (stryCov_9fa48("87071"), 'Failed to persist leader update after CDC service set'),
  BECAME_LEADER: stryMutAct_9fa48("87072") ? "" : (stryCov_9fa48("87072"), 'Became leader'),
  SHUTTING_DOWN_MESSAGE_GROUP_SERVICE: stryMutAct_9fa48("87073") ? "" : (stryCov_9fa48("87073"), 'Shutting down message group service'),
  SHUTDOWN: stryMutAct_9fa48("87074") ? "" : (stryCov_9fa48("87074"), 'shutdown')
}));
const ROLE_PERSIST_ERROR_MSG = stryMutAct_9fa48("87075") ? "" : (stryCov_9fa48("87075"), 'Failed to persist raft role update');
const LEADER_NODE_PERSIST_ERROR_MSG = stryMutAct_9fa48("87076") ? "" : (stryCov_9fa48("87076"), 'Failed to persist message group leader update');
const FLUSH_SKIP_NOT_OWNER = stryMutAct_9fa48("87077") ? "" : (stryCov_9fa48("87077"), 'not-owner');
const FLUSH_SKIP_READY = stryMutAct_9fa48("87078") ? "" : (stryCov_9fa48("87078"), 'ready');
const FLUSH_SKIP_DISABLED = stryMutAct_9fa48("87079") ? "" : (stryCov_9fa48("87079"), 'disabled');
const CDC_FORWARD_MAX_RELAY_DEPTH = NUM.TWO;
const CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH = NUM.TWO_HUNDRED_FIFTY_SIX;
const CDC_FORWARD_ERROR_TRUNCATION_SUFFIX = stryMutAct_9fa48("87080") ? "" : (stryCov_9fa48("87080"), '...[truncated]');
const CDC_BATCH_COMMAND_TYPE = stryMutAct_9fa48("87081") ? "" : (stryCov_9fa48("87081"), 'CDC_BATCH');
const FORWARD_TOPOLOGY_REPAIR_DEFAULT = Object.freeze(stryMutAct_9fa48("87082") ? {} : (stryCov_9fa48("87082"), {
  COOLDOWN_MS: 1000,
  FAILURE_COOLDOWN_MS: 5000,
  NO_CHANGE_COOLDOWN_MS: 2000,
  QUERY_TIMEOUT_MS: 1500
}));
const CONTROL_PLANE_PARTITION_IDS = new Set(Object.values(INITIAL_PARTITION_IDS));
const DIRECT_ONLY_MESSAGE_TYPES = new Set(stryMutAct_9fa48("87083") ? [] : (stryCov_9fa48("87083"), [...Object.values(ControlPlaneMessageType)]));
const MESSAGE_DELIVERY_MODE = Object.freeze(stryMutAct_9fa48("87084") ? {} : (stryCov_9fa48("87084"), {
  AUTO: stryMutAct_9fa48("87085") ? "" : (stryCov_9fa48("87085"), 'auto'),
  DIRECT_ONLY: stryMutAct_9fa48("87086") ? "" : (stryCov_9fa48("87086"), 'direct_only'),
  DIRECT_WITH_RAFT_DURABILITY: stryMutAct_9fa48("87087") ? "" : (stryCov_9fa48("87087"), 'direct_with_raft_durability')
}));
function shouldDeferImmediateDeliveryRetry(result) {
  if (stryMutAct_9fa48("87088")) {
    {}
  } else {
    stryCov_9fa48("87088");
    return Boolean(stryMutAct_9fa48("87091") ? result && typeof result === TYPEOF.OBJECT && result.deferRetry === true && Number.isFinite(result.retryAfterMs) || result.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("87090") ? false : stryMutAct_9fa48("87089") ? true : (stryCov_9fa48("87089", "87090", "87091"), (stryMutAct_9fa48("87093") ? result && typeof result === TYPEOF.OBJECT && result.deferRetry === true || Number.isFinite(result.retryAfterMs) : stryMutAct_9fa48("87092") ? true : (stryCov_9fa48("87092", "87093"), (stryMutAct_9fa48("87095") ? result && typeof result === TYPEOF.OBJECT || result.deferRetry === true : stryMutAct_9fa48("87094") ? true : (stryCov_9fa48("87094", "87095"), (stryMutAct_9fa48("87097") ? result || typeof result === TYPEOF.OBJECT : stryMutAct_9fa48("87096") ? true : (stryCov_9fa48("87096", "87097"), result && (stryMutAct_9fa48("87099") ? typeof result !== TYPEOF.OBJECT : stryMutAct_9fa48("87098") ? true : (stryCov_9fa48("87098", "87099"), typeof result === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("87101") ? result.deferRetry !== true : stryMutAct_9fa48("87100") ? true : (stryCov_9fa48("87100", "87101"), result.deferRetry === (stryMutAct_9fa48("87102") ? false : (stryCov_9fa48("87102"), true)))))) && Number.isFinite(result.retryAfterMs))) && (stryMutAct_9fa48("87105") ? result.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("87104") ? result.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("87103") ? true : (stryCov_9fa48("87103", "87104", "87105"), result.retryAfterMs > NUM.ZERO))));
  }
}
function buildDeferredDeliveryError(deliveryResult) {
  if (stryMutAct_9fa48("87106")) {
    {}
  } else {
    stryCov_9fa48("87106");
    const error = new Error(stryMutAct_9fa48("87109") ? deliveryResult?.error && 'Message delivery deferred' : stryMutAct_9fa48("87108") ? false : stryMutAct_9fa48("87107") ? true : (stryCov_9fa48("87107", "87108", "87109"), (stryMutAct_9fa48("87110") ? deliveryResult.error : (stryCov_9fa48("87110"), deliveryResult?.error)) || (stryMutAct_9fa48("87111") ? "" : (stryCov_9fa48("87111"), 'Message delivery deferred'))));
    if (stryMutAct_9fa48("87114") ? typeof deliveryResult?.errorCode === TYPEOF.STRING || deliveryResult.errorCode.length > NUM.ZERO : stryMutAct_9fa48("87113") ? false : stryMutAct_9fa48("87112") ? true : (stryCov_9fa48("87112", "87113", "87114"), (stryMutAct_9fa48("87116") ? typeof deliveryResult?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("87115") ? true : (stryCov_9fa48("87115", "87116"), typeof (stryMutAct_9fa48("87117") ? deliveryResult.errorCode : (stryCov_9fa48("87117"), deliveryResult?.errorCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("87120") ? deliveryResult.errorCode.length <= NUM.ZERO : stryMutAct_9fa48("87119") ? deliveryResult.errorCode.length >= NUM.ZERO : stryMutAct_9fa48("87118") ? true : (stryCov_9fa48("87118", "87119", "87120"), deliveryResult.errorCode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87121")) {
        {}
      } else {
        stryCov_9fa48("87121");
        error.code = deliveryResult.errorCode;
      }
    }
    if (stryMutAct_9fa48("87124") ? deliveryResult?.deferRetry !== true : stryMutAct_9fa48("87123") ? false : stryMutAct_9fa48("87122") ? true : (stryCov_9fa48("87122", "87123", "87124"), (stryMutAct_9fa48("87125") ? deliveryResult.deferRetry : (stryCov_9fa48("87125"), deliveryResult?.deferRetry)) === (stryMutAct_9fa48("87126") ? false : (stryCov_9fa48("87126"), true)))) {
      if (stryMutAct_9fa48("87127")) {
        {}
      } else {
        stryCov_9fa48("87127");
        error.deferRetry = stryMutAct_9fa48("87128") ? false : (stryCov_9fa48("87128"), true);
      }
    }
    if (stryMutAct_9fa48("87130") ? false : stryMutAct_9fa48("87129") ? true : (stryCov_9fa48("87129", "87130"), Number.isFinite(stryMutAct_9fa48("87131") ? deliveryResult.retryAfterMs : (stryCov_9fa48("87131"), deliveryResult?.retryAfterMs)))) {
      if (stryMutAct_9fa48("87132")) {
        {}
      } else {
        stryCov_9fa48("87132");
        error.retryAfterMs = stryMutAct_9fa48("87133") ? Math.min(NUM.ZERO, Math.floor(deliveryResult.retryAfterMs)) : (stryCov_9fa48("87133"), Math.max(NUM.ZERO, Math.floor(deliveryResult.retryAfterMs)));
      }
    }
    return error;
  }
}
function buildDeferredCdcForwardError(message, retryAfterMs = NUM.ZERO) {
  if (stryMutAct_9fa48("87134")) {
    {}
  } else {
    stryCov_9fa48("87134");
    const error = new Error(message);
    error.retryable = stryMutAct_9fa48("87135") ? true : (stryCov_9fa48("87135"), false);
    error.deferRetry = stryMutAct_9fa48("87136") ? false : (stryCov_9fa48("87136"), true);
    error.retryAfterMs = stryMutAct_9fa48("87137") ? Math.min(NUM.ONE, Math.floor(retryAfterMs || NUM.ZERO)) : (stryCov_9fa48("87137"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("87140") ? retryAfterMs && NUM.ZERO : stryMutAct_9fa48("87139") ? false : stryMutAct_9fa48("87138") ? true : (stryCov_9fa48("87138", "87139", "87140"), retryAfterMs || NUM.ZERO))));
    return error;
  }
}
function wrapCdcProposeError(message, error) {
  if (stryMutAct_9fa48("87141")) {
    {}
  } else {
    stryCov_9fa48("87141");
    const wrappedError = new Error(message);
    if (stryMutAct_9fa48("87144") ? error?.deferRetry !== true : stryMutAct_9fa48("87143") ? false : stryMutAct_9fa48("87142") ? true : (stryCov_9fa48("87142", "87143", "87144"), (stryMutAct_9fa48("87145") ? error.deferRetry : (stryCov_9fa48("87145"), error?.deferRetry)) === (stryMutAct_9fa48("87146") ? false : (stryCov_9fa48("87146"), true)))) {
      if (stryMutAct_9fa48("87147")) {
        {}
      } else {
        stryCov_9fa48("87147");
        wrappedError.deferRetry = stryMutAct_9fa48("87148") ? false : (stryCov_9fa48("87148"), true);
      }
    }
    if (stryMutAct_9fa48("87151") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("87150") ? false : stryMutAct_9fa48("87149") ? true : (stryCov_9fa48("87149", "87150", "87151"), Number.isFinite(stryMutAct_9fa48("87152") ? error.retryAfterMs : (stryCov_9fa48("87152"), error?.retryAfterMs)) && (stryMutAct_9fa48("87155") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("87154") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("87153") ? true : (stryCov_9fa48("87153", "87154", "87155"), error.retryAfterMs > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87156")) {
        {}
      } else {
        stryCov_9fa48("87156");
        wrappedError.retryAfterMs = stryMutAct_9fa48("87157") ? Math.min(NUM.ONE, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("87157"), Math.max(NUM.ONE, Math.floor(error.retryAfterMs)));
      }
    }
    if (stryMutAct_9fa48("87160") ? typeof error?.code === TYPEOF.STRING || error.code.length > NUM.ZERO : stryMutAct_9fa48("87159") ? false : stryMutAct_9fa48("87158") ? true : (stryCov_9fa48("87158", "87159", "87160"), (stryMutAct_9fa48("87162") ? typeof error?.code !== TYPEOF.STRING : stryMutAct_9fa48("87161") ? true : (stryCov_9fa48("87161", "87162"), typeof (stryMutAct_9fa48("87163") ? error.code : (stryCov_9fa48("87163"), error?.code)) === TYPEOF.STRING)) && (stryMutAct_9fa48("87166") ? error.code.length <= NUM.ZERO : stryMutAct_9fa48("87165") ? error.code.length >= NUM.ZERO : stryMutAct_9fa48("87164") ? true : (stryCov_9fa48("87164", "87165", "87166"), error.code.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87167")) {
        {}
      } else {
        stryCov_9fa48("87167");
        wrappedError.code = error.code;
      }
    }
    if (stryMutAct_9fa48("87170") ? error?.retryable !== false : stryMutAct_9fa48("87169") ? false : stryMutAct_9fa48("87168") ? true : (stryCov_9fa48("87168", "87169", "87170"), (stryMutAct_9fa48("87171") ? error.retryable : (stryCov_9fa48("87171"), error?.retryable)) === (stryMutAct_9fa48("87172") ? true : (stryCov_9fa48("87172"), false)))) {
      if (stryMutAct_9fa48("87173")) {
        {}
      } else {
        stryCov_9fa48("87173");
        wrappedError.retryable = stryMutAct_9fa48("87174") ? true : (stryCov_9fa48("87174"), false);
      }
    }
    return wrappedError;
  }
} /**
  * Truncate a nested error detail string to prevent unbounded error
  * message growth across CDC forward retry cycles (doctrine §7).
  * @param {string} detail - Error detail to bound.
  * @return {string} Bounded detail string.
  */
function boundCdcForwardErrorDetail(detail) {
  if (stryMutAct_9fa48("87175")) {
    {}
  } else {
    stryCov_9fa48("87175");
    if (stryMutAct_9fa48("87178") ? typeof detail !== TYPEOF.STRING && detail.length <= CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH : stryMutAct_9fa48("87177") ? false : stryMutAct_9fa48("87176") ? true : (stryCov_9fa48("87176", "87177", "87178"), (stryMutAct_9fa48("87180") ? typeof detail === TYPEOF.STRING : stryMutAct_9fa48("87179") ? false : (stryCov_9fa48("87179", "87180"), typeof detail !== TYPEOF.STRING)) || (stryMutAct_9fa48("87183") ? detail.length > CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH : stryMutAct_9fa48("87182") ? detail.length < CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH : stryMutAct_9fa48("87181") ? false : (stryCov_9fa48("87181", "87182", "87183"), detail.length <= CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH)))) {
      if (stryMutAct_9fa48("87184")) {
        {}
      } else {
        stryCov_9fa48("87184");
        return stryMutAct_9fa48("87187") ? detail && MESSAGE_GROUP_SERVICE_LITERAL.VALUE : stryMutAct_9fa48("87186") ? false : stryMutAct_9fa48("87185") ? true : (stryCov_9fa48("87185", "87186", "87187"), detail || MESSAGE_GROUP_SERVICE_LITERAL.VALUE);
      }
    }
    return stryMutAct_9fa48("87188") ? detail.substring(NUM.ZERO, CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH) - CDC_FORWARD_ERROR_TRUNCATION_SUFFIX : (stryCov_9fa48("87188"), (stryMutAct_9fa48("87189") ? detail : (stryCov_9fa48("87189"), detail.substring(NUM.ZERO, CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH))) + CDC_FORWARD_ERROR_TRUNCATION_SUFFIX);
  }
}
function isControlPlaneTransportTarget(targetService) {
  if (stryMutAct_9fa48("87190")) {
    {}
  } else {
    stryCov_9fa48("87190");
    if (stryMutAct_9fa48("87193") ? typeof targetService !== TYPEOF.STRING && targetService.length === NUM.ZERO : stryMutAct_9fa48("87192") ? false : stryMutAct_9fa48("87191") ? true : (stryCov_9fa48("87191", "87192", "87193"), (stryMutAct_9fa48("87195") ? typeof targetService === TYPEOF.STRING : stryMutAct_9fa48("87194") ? false : (stryCov_9fa48("87194", "87195"), typeof targetService !== TYPEOF.STRING)) || (stryMutAct_9fa48("87197") ? targetService.length !== NUM.ZERO : stryMutAct_9fa48("87196") ? false : (stryCov_9fa48("87196", "87197"), targetService.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("87198")) {
        {}
      } else {
        stryCov_9fa48("87198");
        return stryMutAct_9fa48("87199") ? true : (stryCov_9fa48("87199"), false);
      }
    }
    const [nodeId, entityType, entityId] = targetService.split(MESSAGE_GROUP_SERVICE_LITERAL.VALUE_2);
    if (stryMutAct_9fa48("87202") ? (!nodeId || !entityType) && !entityId : stryMutAct_9fa48("87201") ? false : stryMutAct_9fa48("87200") ? true : (stryCov_9fa48("87200", "87201", "87202"), (stryMutAct_9fa48("87204") ? !nodeId && !entityType : stryMutAct_9fa48("87203") ? false : (stryCov_9fa48("87203", "87204"), (stryMutAct_9fa48("87205") ? nodeId : (stryCov_9fa48("87205"), !nodeId)) || (stryMutAct_9fa48("87206") ? entityType : (stryCov_9fa48("87206"), !entityType)))) || (stryMutAct_9fa48("87207") ? entityId : (stryCov_9fa48("87207"), !entityId)))) {
      if (stryMutAct_9fa48("87208")) {
        {}
      } else {
        stryCov_9fa48("87208");
        return stryMutAct_9fa48("87209") ? true : (stryCov_9fa48("87209"), false);
      }
    }
    if (stryMutAct_9fa48("87212") ? entityType !== ENTITY_TYPE.PARTITION : stryMutAct_9fa48("87211") ? false : stryMutAct_9fa48("87210") ? true : (stryCov_9fa48("87210", "87211", "87212"), entityType === ENTITY_TYPE.PARTITION)) {
      if (stryMutAct_9fa48("87213")) {
        {}
      } else {
        stryCov_9fa48("87213");
        const partitionId = entityId.replace(stryMutAct_9fa48("87216") ? /-r\D+$/ : stryMutAct_9fa48("87215") ? /-r\d$/ : stryMutAct_9fa48("87214") ? /-r\d+/ : (stryCov_9fa48("87214", "87215", "87216"), /-r\d+$/), stryMutAct_9fa48("87217") ? "Stryker was here!" : (stryCov_9fa48("87217"), ''));
        return CONTROL_PLANE_PARTITION_IDS.has(partitionId);
      }
    }
    if (stryMutAct_9fa48("87220") ? entityType !== ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87219") ? false : stryMutAct_9fa48("87218") ? true : (stryCov_9fa48("87218", "87219", "87220"), entityType === ENTITY_TYPE.MESSAGE_GROUP)) {
      if (stryMutAct_9fa48("87221")) {
        {}
      } else {
        stryCov_9fa48("87221");
        return stryMutAct_9fa48("87224") ? entityId === INITIAL_MESSAGE_GROUP_ID && entityId.startsWith(`${INITIAL_MESSAGE_GROUP_ID}-r`) : stryMutAct_9fa48("87223") ? false : stryMutAct_9fa48("87222") ? true : (stryCov_9fa48("87222", "87223", "87224"), (stryMutAct_9fa48("87226") ? entityId !== INITIAL_MESSAGE_GROUP_ID : stryMutAct_9fa48("87225") ? false : (stryCov_9fa48("87225", "87226"), entityId === INITIAL_MESSAGE_GROUP_ID)) || (stryMutAct_9fa48("87227") ? entityId.endsWith(`${INITIAL_MESSAGE_GROUP_ID}-r`) : (stryCov_9fa48("87227"), entityId.startsWith(stryMutAct_9fa48("87228") ? `` : (stryCov_9fa48("87228"), `${INITIAL_MESSAGE_GROUP_ID}-r`)))));
      }
    }
    return stryMutAct_9fa48("87229") ? true : (stryCov_9fa48("87229"), false);
  }
}
function resolveTransportDeliveryOptions(targetService) {
  if (stryMutAct_9fa48("87230")) {
    {}
  } else {
    stryCov_9fa48("87230");
    return isControlPlaneTransportTarget(targetService) ? stryMutAct_9fa48("87231") ? {} : (stryCov_9fa48("87231"), {
      deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL
    }) : undefined;
  }
}
function normalizeMessageDeliveryMode(deliveryMode) {
  if (stryMutAct_9fa48("87232")) {
    {}
  } else {
    stryCov_9fa48("87232");
    if (stryMutAct_9fa48("87235") ? deliveryMode !== MESSAGE_DELIVERY_MODE.DIRECT_ONLY : stryMutAct_9fa48("87234") ? false : stryMutAct_9fa48("87233") ? true : (stryCov_9fa48("87233", "87234", "87235"), deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_ONLY)) {
      if (stryMutAct_9fa48("87236")) {
        {}
      } else {
        stryCov_9fa48("87236");
        return MESSAGE_DELIVERY_MODE.DIRECT_ONLY;
      }
    }
    if (stryMutAct_9fa48("87239") ? deliveryMode !== MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY : stryMutAct_9fa48("87238") ? false : stryMutAct_9fa48("87237") ? true : (stryCov_9fa48("87237", "87238", "87239"), deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY)) {
      if (stryMutAct_9fa48("87240")) {
        {}
      } else {
        stryCov_9fa48("87240");
        return MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY;
      }
    }
    return MESSAGE_DELIVERY_MODE.AUTO;
  }
}
function buildLatencyCdcPropagationResult({
  messageId,
  status,
  acknowledged = stryMutAct_9fa48("87241") ? false : (stryCov_9fa48("87241"), true),
  success,
  error,
  deferRetry,
  retryAfterMs,
  tableName,
  operation,
  eventCount
}) {
  if (stryMutAct_9fa48("87242")) {
    {}
  } else {
    stryCov_9fa48("87242");
    const result = stryMutAct_9fa48("87243") ? {} : (stryCov_9fa48("87243"), {
      messageId,
      status,
      acknowledged
    });
    if (stryMutAct_9fa48("87246") ? typeof success !== TYPEOF.BOOLEAN : stryMutAct_9fa48("87245") ? false : stryMutAct_9fa48("87244") ? true : (stryCov_9fa48("87244", "87245", "87246"), typeof success === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("87247")) {
        {}
      } else {
        stryCov_9fa48("87247");
        result.success = success;
      }
    }
    if (stryMutAct_9fa48("87250") ? typeof error === TYPEOF.STRING || error.length > NUM.ZERO : stryMutAct_9fa48("87249") ? false : stryMutAct_9fa48("87248") ? true : (stryCov_9fa48("87248", "87249", "87250"), (stryMutAct_9fa48("87252") ? typeof error !== TYPEOF.STRING : stryMutAct_9fa48("87251") ? true : (stryCov_9fa48("87251", "87252"), typeof error === TYPEOF.STRING)) && (stryMutAct_9fa48("87255") ? error.length <= NUM.ZERO : stryMutAct_9fa48("87254") ? error.length >= NUM.ZERO : stryMutAct_9fa48("87253") ? true : (stryCov_9fa48("87253", "87254", "87255"), error.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87256")) {
        {}
      } else {
        stryCov_9fa48("87256");
        result.error = error;
      }
    }
    if (stryMutAct_9fa48("87259") ? deferRetry !== true : stryMutAct_9fa48("87258") ? false : stryMutAct_9fa48("87257") ? true : (stryCov_9fa48("87257", "87258", "87259"), deferRetry === (stryMutAct_9fa48("87260") ? false : (stryCov_9fa48("87260"), true)))) {
      if (stryMutAct_9fa48("87261")) {
        {}
      } else {
        stryCov_9fa48("87261");
        result.deferRetry = stryMutAct_9fa48("87262") ? false : (stryCov_9fa48("87262"), true);
      }
    }
    if (stryMutAct_9fa48("87264") ? false : stryMutAct_9fa48("87263") ? true : (stryCov_9fa48("87263", "87264"), Number.isFinite(retryAfterMs))) {
      if (stryMutAct_9fa48("87265")) {
        {}
      } else {
        stryCov_9fa48("87265");
        result.retryAfterMs = retryAfterMs;
      }
    }
    if (stryMutAct_9fa48("87268") ? typeof tableName === TYPEOF.STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("87267") ? false : stryMutAct_9fa48("87266") ? true : (stryCov_9fa48("87266", "87267", "87268"), (stryMutAct_9fa48("87270") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("87269") ? true : (stryCov_9fa48("87269", "87270"), typeof tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("87273") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("87272") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("87271") ? true : (stryCov_9fa48("87271", "87272", "87273"), tableName.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87274")) {
        {}
      } else {
        stryCov_9fa48("87274");
        result.tableName = tableName;
      }
    }
    if (stryMutAct_9fa48("87277") ? typeof operation === TYPEOF.STRING || operation.length > NUM.ZERO : stryMutAct_9fa48("87276") ? false : stryMutAct_9fa48("87275") ? true : (stryCov_9fa48("87275", "87276", "87277"), (stryMutAct_9fa48("87279") ? typeof operation !== TYPEOF.STRING : stryMutAct_9fa48("87278") ? true : (stryCov_9fa48("87278", "87279"), typeof operation === TYPEOF.STRING)) && (stryMutAct_9fa48("87282") ? operation.length <= NUM.ZERO : stryMutAct_9fa48("87281") ? operation.length >= NUM.ZERO : stryMutAct_9fa48("87280") ? true : (stryCov_9fa48("87280", "87281", "87282"), operation.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("87283")) {
        {}
      } else {
        stryCov_9fa48("87283");
        result.operation = operation;
      }
    }
    if (stryMutAct_9fa48("87286") ? Number.isInteger(eventCount) || eventCount >= NUM.ZERO : stryMutAct_9fa48("87285") ? false : stryMutAct_9fa48("87284") ? true : (stryCov_9fa48("87284", "87285", "87286"), Number.isInteger(eventCount) && (stryMutAct_9fa48("87289") ? eventCount < NUM.ZERO : stryMutAct_9fa48("87288") ? eventCount > NUM.ZERO : stryMutAct_9fa48("87287") ? true : (stryCov_9fa48("87287", "87288", "87289"), eventCount >= NUM.ZERO)))) {
      if (stryMutAct_9fa48("87290")) {
        {}
      } else {
        stryCov_9fa48("87290");
        result.eventCount = eventCount;
      }
    }
    return result;
  }
} /**
  * MessageGroupService provides reliable inter-service communication.
  * Implements a 3-replica Raft group using liferaft library.
  */
class MessageGroupService extends EventEmitter {
  /**
  * Create a new MessageGroupService.
  * @param {Object} options - Configuration options.
  * @param {string} options.groupId - Message group ID.
  * @param {string} options.replicaId - This replica's ID.
  * @param {string} options.nodeId - Node ID hosting this replica.
  * @param {Array<string>} options.replicaIds - All replica IDs in the group.
  * @param {Object} options.transport - WebSocket-based transport for communication.
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("87291")) {
      {}
    } else {
      stryCov_9fa48("87291");
      super();
      if (stryMutAct_9fa48("87294") ? false : stryMutAct_9fa48("87293") ? true : stryMutAct_9fa48("87292") ? options.groupId : (stryCov_9fa48("87292", "87293", "87294"), !options.groupId)) {
        if (stryMutAct_9fa48("87295")) {
          {}
        } else {
          stryCov_9fa48("87295");
          throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_GROUP_ID);
        }
      }
      if (stryMutAct_9fa48("87298") ? false : stryMutAct_9fa48("87297") ? true : stryMutAct_9fa48("87296") ? options.replicaId : (stryCov_9fa48("87296", "87297", "87298"), !options.replicaId)) {
        if (stryMutAct_9fa48("87299")) {
          {}
        } else {
          stryCov_9fa48("87299");
          throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_REPLICA_ID);
        }
      } // Transport is now required - WebSocket transport is mandatory
      if (stryMutAct_9fa48("87302") ? false : stryMutAct_9fa48("87301") ? true : stryMutAct_9fa48("87300") ? options.transport : (stryCov_9fa48("87300", "87301", "87302"), !options.transport)) {
        if (stryMutAct_9fa48("87303")) {
          {}
        } else {
          stryCov_9fa48("87303");
          throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_TRANSPORT);
        }
      } // Validate transport is WebSocket-based (MessageRouter)
      if (stryMutAct_9fa48("87306") ? false : stryMutAct_9fa48("87305") ? true : stryMutAct_9fa48("87304") ? this.isWebSocketBasedTransport(options.transport) : (stryCov_9fa48("87304", "87305", "87306"), !this.isWebSocketBasedTransport(options.transport))) {
        if (stryMutAct_9fa48("87307")) {
          {}
        } else {
          stryCov_9fa48("87307");
          throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.INVALID_TRANSPORT);
        }
      }
      this.groupId = options.groupId;
      this.replicaId = options.replicaId;
      this.now = (stryMutAct_9fa48("87310") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("87309") ? false : stryMutAct_9fa48("87308") ? true : (stryCov_9fa48("87308", "87309", "87310"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : MESSAGE_GROUP_OPERATION_LEDGER_NOW;
      this.nodeId = stryMutAct_9fa48("87313") ? options.nodeId && STRING.UNKNOWN : stryMutAct_9fa48("87312") ? false : stryMutAct_9fa48("87311") ? true : (stryCov_9fa48("87311", "87312", "87313"), options.nodeId || STRING.UNKNOWN);
      this.replicaIds = stryMutAct_9fa48("87316") ? options.replicaIds && [this.replicaId] : stryMutAct_9fa48("87315") ? false : stryMutAct_9fa48("87314") ? true : (stryCov_9fa48("87314", "87315", "87316"), options.replicaIds || (stryMutAct_9fa48("87317") ? [] : (stryCov_9fa48("87317"), [this.replicaId])));
      this.transport = options.transport;
      this.raftProvider = stryMutAct_9fa48("87320") ? options.raftProvider && new LiferaftProvider() : stryMutAct_9fa48("87319") ? false : stryMutAct_9fa48("87318") ? true : (stryCov_9fa48("87318", "87319", "87320"), options.raftProvider || new LiferaftProvider());
      assertRaftProviderContract(this.raftProvider); // Peer addresses for cross-node communication
      // Map of replicaId -> unified address (e.g., 'nodeId/message-group/replicaId')
      // Used when joining an existing message group on a different node
      this.peerAddresses = stryMutAct_9fa48("87323") ? options.peerAddresses && [] : stryMutAct_9fa48("87322") ? false : stryMutAct_9fa48("87321") ? true : (stryCov_9fa48("87321", "87322", "87323"), options.peerAddresses || (stryMutAct_9fa48("87324") ? ["Stryker was here"] : (stryCov_9fa48("87324"), [])));
      this.bootstrapHintFallbackLogged = new Set(); // Get AddressManager instance for unified address operations
      // Requirements: 1.4
      this.addressManager = AddressManager.getInstance(); // Unified address format: ${nodeId}/message-group/${replicaId}
      // Requirements: 1.1, 1.4, 5.1
      this.unifiedAddress = this.addressManager.format(this.nodeId, ENTITY_TYPE.MESSAGE_GROUP, this.replicaId); // Configuration
      const config = ConfigurationManager.getInstance();
      this.deliveryTimeoutMs = stryMutAct_9fa48("87325") ? config.get(CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS) && MESSAGE_GROUP_SERVICE_DEFAULT.DELIVERY_TIMEOUT_MS : (stryCov_9fa48("87325"), config.get(CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS) ?? MESSAGE_GROUP_SERVICE_DEFAULT.DELIVERY_TIMEOUT_MS);
      this.retryMaxAttempts = stryMutAct_9fa48("87326") ? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) && MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_ATTEMPTS : (stryCov_9fa48("87326"), config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) ?? MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_ATTEMPTS);
      this.retryInitialDelayMs = stryMutAct_9fa48("87327") ? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) && MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_INITIAL_DELAY_MS : (stryCov_9fa48("87327"), config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) ?? MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_INITIAL_DELAY_MS);
      this.retryBackoffMultiplier = stryMutAct_9fa48("87328") ? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) && MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_BACKOFF_MULTIPLIER : (stryCov_9fa48("87328"), config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) ?? MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_BACKOFF_MULTIPLIER);
      this.retryMaxDelayMs = stryMutAct_9fa48("87329") ? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) && MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_DELAY_MS : (stryCov_9fa48("87329"), config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) ?? MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_DELAY_MS);
      this.retryJitterFactor = stryMutAct_9fa48("87330") ? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) && MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_JITTER_FACTOR : (stryCov_9fa48("87330"), config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) ?? MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_JITTER_FACTOR);
      this.leaderActivationStabilizationMs = (stryMutAct_9fa48("87333") ? Number.isFinite(options.leaderActivationStabilizationMs) || options.leaderActivationStabilizationMs >= NUM.ZERO : stryMutAct_9fa48("87332") ? false : stryMutAct_9fa48("87331") ? true : (stryCov_9fa48("87331", "87332", "87333"), Number.isFinite(options.leaderActivationStabilizationMs) && (stryMutAct_9fa48("87336") ? options.leaderActivationStabilizationMs < NUM.ZERO : stryMutAct_9fa48("87335") ? options.leaderActivationStabilizationMs > NUM.ZERO : stryMutAct_9fa48("87334") ? true : (stryCov_9fa48("87334", "87335", "87336"), options.leaderActivationStabilizationMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationStabilizationMs) : stryMutAct_9fa48("87337") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) && MESSAGE_GROUP_SERVICE_LITERAL.VALUE_250 : (stryCov_9fa48("87337"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ?? MESSAGE_GROUP_SERVICE_LITERAL.VALUE_250);
      this.leaderActivationNodeSpacingMs = (stryMutAct_9fa48("87340") ? Number.isFinite(options.leaderActivationNodeSpacingMs) || options.leaderActivationNodeSpacingMs >= NUM.ZERO : stryMutAct_9fa48("87339") ? false : stryMutAct_9fa48("87338") ? true : (stryCov_9fa48("87338", "87339", "87340"), Number.isFinite(options.leaderActivationNodeSpacingMs) && (stryMutAct_9fa48("87343") ? options.leaderActivationNodeSpacingMs < NUM.ZERO : stryMutAct_9fa48("87342") ? options.leaderActivationNodeSpacingMs > NUM.ZERO : stryMutAct_9fa48("87341") ? true : (stryCov_9fa48("87341", "87342", "87343"), options.leaderActivationNodeSpacingMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationNodeSpacingMs) : stryMutAct_9fa48("87344") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) && MESSAGE_GROUP_SERVICE_LITERAL.VALUE_25 : (stryCov_9fa48("87344"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ?? MESSAGE_GROUP_SERVICE_LITERAL.VALUE_25);
      this.forwardTargetSuppressionMs = (stryMutAct_9fa48("87347") ? Number.isFinite(options.forwardTargetSuppressionMs) || options.forwardTargetSuppressionMs > NUM.ZERO : stryMutAct_9fa48("87346") ? false : stryMutAct_9fa48("87345") ? true : (stryCov_9fa48("87345", "87346", "87347"), Number.isFinite(options.forwardTargetSuppressionMs) && (stryMutAct_9fa48("87350") ? options.forwardTargetSuppressionMs <= NUM.ZERO : stryMutAct_9fa48("87349") ? options.forwardTargetSuppressionMs >= NUM.ZERO : stryMutAct_9fa48("87348") ? true : (stryCov_9fa48("87348", "87349", "87350"), options.forwardTargetSuppressionMs > NUM.ZERO)))) ? Math.floor(options.forwardTargetSuppressionMs) : stryMutAct_9fa48("87351") ? Math.max(this.retryMaxDelayMs, TIME_MS.SECOND * NUM.FIVE) : (stryCov_9fa48("87351"), Math.min(this.retryMaxDelayMs, stryMutAct_9fa48("87352") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("87352"), TIME_MS.SECOND * NUM.FIVE)));
      this.forwardTopologyRepairCooldownMs = (stryMutAct_9fa48("87355") ? Number.isFinite(options.forwardTopologyRepairCooldownMs) || options.forwardTopologyRepairCooldownMs > NUM.ZERO : stryMutAct_9fa48("87354") ? false : stryMutAct_9fa48("87353") ? true : (stryCov_9fa48("87353", "87354", "87355"), Number.isFinite(options.forwardTopologyRepairCooldownMs) && (stryMutAct_9fa48("87358") ? options.forwardTopologyRepairCooldownMs <= NUM.ZERO : stryMutAct_9fa48("87357") ? options.forwardTopologyRepairCooldownMs >= NUM.ZERO : stryMutAct_9fa48("87356") ? true : (stryCov_9fa48("87356", "87357", "87358"), options.forwardTopologyRepairCooldownMs > NUM.ZERO)))) ? Math.floor(options.forwardTopologyRepairCooldownMs) : FORWARD_TOPOLOGY_REPAIR_DEFAULT.COOLDOWN_MS;
      this.forwardTopologyRepairFailureCooldownMs = (stryMutAct_9fa48("87361") ? Number.isFinite(options.forwardTopologyRepairFailureCooldownMs) || options.forwardTopologyRepairFailureCooldownMs > NUM.ZERO : stryMutAct_9fa48("87360") ? false : stryMutAct_9fa48("87359") ? true : (stryCov_9fa48("87359", "87360", "87361"), Number.isFinite(options.forwardTopologyRepairFailureCooldownMs) && (stryMutAct_9fa48("87364") ? options.forwardTopologyRepairFailureCooldownMs <= NUM.ZERO : stryMutAct_9fa48("87363") ? options.forwardTopologyRepairFailureCooldownMs >= NUM.ZERO : stryMutAct_9fa48("87362") ? true : (stryCov_9fa48("87362", "87363", "87364"), options.forwardTopologyRepairFailureCooldownMs > NUM.ZERO)))) ? Math.floor(options.forwardTopologyRepairFailureCooldownMs) : FORWARD_TOPOLOGY_REPAIR_DEFAULT.FAILURE_COOLDOWN_MS;
      this.forwardTopologyRepairNoChangeCooldownMs = (stryMutAct_9fa48("87367") ? Number.isFinite(options.forwardTopologyRepairNoChangeCooldownMs) || options.forwardTopologyRepairNoChangeCooldownMs > NUM.ZERO : stryMutAct_9fa48("87366") ? false : stryMutAct_9fa48("87365") ? true : (stryCov_9fa48("87365", "87366", "87367"), Number.isFinite(options.forwardTopologyRepairNoChangeCooldownMs) && (stryMutAct_9fa48("87370") ? options.forwardTopologyRepairNoChangeCooldownMs <= NUM.ZERO : stryMutAct_9fa48("87369") ? options.forwardTopologyRepairNoChangeCooldownMs >= NUM.ZERO : stryMutAct_9fa48("87368") ? true : (stryCov_9fa48("87368", "87369", "87370"), options.forwardTopologyRepairNoChangeCooldownMs > NUM.ZERO)))) ? Math.floor(options.forwardTopologyRepairNoChangeCooldownMs) : FORWARD_TOPOLOGY_REPAIR_DEFAULT.NO_CHANGE_COOLDOWN_MS;
      this.forwardTopologyRepairQueryTimeoutMs = (stryMutAct_9fa48("87373") ? Number.isFinite(options.forwardTopologyRepairQueryTimeoutMs) || options.forwardTopologyRepairQueryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("87372") ? false : stryMutAct_9fa48("87371") ? true : (stryCov_9fa48("87371", "87372", "87373"), Number.isFinite(options.forwardTopologyRepairQueryTimeoutMs) && (stryMutAct_9fa48("87376") ? options.forwardTopologyRepairQueryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("87375") ? options.forwardTopologyRepairQueryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("87374") ? true : (stryCov_9fa48("87374", "87375", "87376"), options.forwardTopologyRepairQueryTimeoutMs > NUM.ZERO)))) ? Math.floor(options.forwardTopologyRepairQueryTimeoutMs) : FORWARD_TOPOLOGY_REPAIR_DEFAULT.QUERY_TIMEOUT_MS; // Raft state - using liferaft library
      // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
      this.raft = null; // Initialized in initialize()
      this.logAdapter = new InMemoryLogAdapter(); // Note: transportAdapter removed - RaftNode.write() now calls messageRouter directly
      // Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4
      this.operationLedger = new MessageGroupOperationLedger(stryMutAct_9fa48("87377") ? {} : (stryCov_9fa48("87377"), {
        now: this.now,
        maxEntries: options.operationLedgerMaxEntries
      }));
      this.role = RaftRole.FOLLOWER;
      this.leaderId = null;
      this.cdcIntegrationService = stryMutAct_9fa48("87380") ? options.cdcIntegrationService && null : stryMutAct_9fa48("87379") ? false : stryMutAct_9fa48("87378") ? true : (stryCov_9fa48("87378", "87379", "87380"), options.cdcIntegrationService || null);
      this.tablePolicyService = stryMutAct_9fa48("87383") ? options.tablePolicyService && null : stryMutAct_9fa48("87382") ? false : stryMutAct_9fa48("87381") ? true : (stryCov_9fa48("87381", "87382", "87383"), options.tablePolicyService || null);
      this.rebalanceCoordinator = stryMutAct_9fa48("87386") ? options.rebalanceCoordinator && null : stryMutAct_9fa48("87385") ? false : stryMutAct_9fa48("87384") ? true : (stryCov_9fa48("87384", "87385", "87386"), options.rebalanceCoordinator || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("87389") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.cdcIntegrationService?.sqlQueryEngine || null,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.transport
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("87388") ? false : stryMutAct_9fa48("87387") ? true : (stryCov_9fa48("87387", "87388", "87389"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("87390") ? {} : (stryCov_9fa48("87390"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("87391") ? () => undefined : (stryCov_9fa48("87391"), () => stryMutAct_9fa48("87394") ? this.cdcIntegrationService?.sqlQueryEngine && null : stryMutAct_9fa48("87393") ? false : stryMutAct_9fa48("87392") ? true : (stryCov_9fa48("87392", "87393", "87394"), (stryMutAct_9fa48("87395") ? this.cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("87395"), this.cdcIntegrationService?.sqlQueryEngine)) || null)),
        getCdcIntegrationService: stryMutAct_9fa48("87396") ? () => undefined : (stryCov_9fa48("87396"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("87397") ? () => undefined : (stryCov_9fa48("87397"), () => this.systemTableCache),
        getMessageRouter: stryMutAct_9fa48("87398") ? () => undefined : (stryCov_9fa48("87398"), () => this.transport)
      })).controlPlaneSystemTableGateway);
      this.rebalancer = null; // Message tracking
      this.pendingMessages = new Map();
      this.acknowledgedMessages = new Set();
      this.messageCallbacks = new Map(); // System table cache - use shared cache from NodeService singleton
      // This ensures all services on the same node share the same cache
      this.systemTableCacheChangeListener = this.handleSystemTableCacheChange.bind(this);
      this.peerReconciliationScheduled = stryMutAct_9fa48("87399") ? true : (stryCov_9fa48("87399"), false);
      const nodeService = NodeService.getInstance();
      this.systemTableCache = nodeService.getSystemTableCache();
      this.readOnlyCache = nodeService.getReadOnlySystemTableCache(); // HLC clock for ordering
      this.hlcClock = new HLCClockService(this.replicaId); // Single-owner CDC handler for subscriptions and cache application.
      this.cdcHandler = new CDCHandler(this.systemTableCache); // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(MESSAGE_GROUP_SUBSYSTEM.NAME);
      this.forwardingOwner = new MessageGroupForwardingOwner(stryMutAct_9fa48("87400") ? {} : (stryCov_9fa48("87400"), {
        service: this,
        buildDeferredCdcForwardError,
        boundCdcForwardErrorDetail
      }));
      this.roleMutationHelper = this.createRoleMutationHelper();
      this.pendingRoleUpdate = this.role;
      this.persistedRole = null;
      this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.metadataPublicationReadinessTransitionListener = this.handleMetadataPublicationReadinessTransition.bind(this);
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.publishRoleMetadata = stryMutAct_9fa48("87403") ? options.publishRoleMetadata === false : stryMutAct_9fa48("87402") ? false : stryMutAct_9fa48("87401") ? true : (stryCov_9fa48("87401", "87402", "87403"), options.publishRoleMetadata !== (stryMutAct_9fa48("87404") ? true : (stryCov_9fa48("87404"), false)));
      this.publishLeaderNodeMetadata = stryMutAct_9fa48("87407") ? options.publishLeaderNodeMetadata === false : stryMutAct_9fa48("87406") ? false : stryMutAct_9fa48("87405") ? true : (stryCov_9fa48("87405", "87406", "87407"), options.publishLeaderNodeMetadata !== (stryMutAct_9fa48("87408") ? true : (stryCov_9fa48("87408"), false)));
      this.metadataPublicationReadinessState = stryMutAct_9fa48("87411") ? (options.metadataPublicationReadinessState || options.bootstrapReadinessState) && null : stryMutAct_9fa48("87410") ? false : stryMutAct_9fa48("87409") ? true : (stryCov_9fa48("87409", "87410", "87411"), (stryMutAct_9fa48("87413") ? options.metadataPublicationReadinessState && options.bootstrapReadinessState : stryMutAct_9fa48("87412") ? false : (stryCov_9fa48("87412", "87413"), options.metadataPublicationReadinessState || options.bootstrapReadinessState)) || null); // State
      this.initialized = stryMutAct_9fa48("87414") ? true : (stryCov_9fa48("87414"), false);
      this.isLeader = stryMutAct_9fa48("87415") ? true : (stryCov_9fa48("87415"), false);
      this.leaderActivationScheduler = stryMutAct_9fa48("87418") ? options.leaderActivationScheduler && LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      }) : stryMutAct_9fa48("87417") ? false : stryMutAct_9fa48("87416") ? true : (stryCov_9fa48("87416", "87417", "87418"), options.leaderActivationScheduler || LeaderActivationScheduler.getShared(stryMutAct_9fa48("87419") ? {} : (stryCov_9fa48("87419"), {
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      })));
      this.leaderActivationGate = new LeaderActivationGate(stryMutAct_9fa48("87420") ? {} : (stryCov_9fa48("87420"), {
        holdoffMs: this.leaderActivationStabilizationMs,
        activationScheduler: this.leaderActivationScheduler
      }));
      this.lastLeaderCdcResubscribeTerm = undefined; // Defer election start until all replicas are ready
      // When true, the Raft election timer won't start until startElection() is called
      // This prevents election storms when multiple replicas are created on the same node
      this.isJoiningExistingGroup = stryMutAct_9fa48("87423") ? options.isJoiningExistingGroup && false : stryMutAct_9fa48("87422") ? false : stryMutAct_9fa48("87421") ? true : (stryCov_9fa48("87421", "87422", "87423"), options.isJoiningExistingGroup || (stryMutAct_9fa48("87424") ? true : (stryCov_9fa48("87424"), false)));
      this.deferElectionUntilJoinConvergence = stryMutAct_9fa48("87427") ? options.deferElectionUntilJoinConvergence !== true : stryMutAct_9fa48("87426") ? false : stryMutAct_9fa48("87425") ? true : (stryCov_9fa48("87425", "87426", "87427"), options.deferElectionUntilJoinConvergence === (stryMutAct_9fa48("87428") ? false : (stryCov_9fa48("87428"), true)));
      this.deferElection = stryMutAct_9fa48("87431") ? (options.deferElection || this.isJoiningExistingGroup) && false : stryMutAct_9fa48("87430") ? false : stryMutAct_9fa48("87429") ? true : (stryCov_9fa48("87429", "87430", "87431"), (stryMutAct_9fa48("87433") ? options.deferElection && this.isJoiningExistingGroup : stryMutAct_9fa48("87432") ? false : (stryCov_9fa48("87432", "87433"), options.deferElection || this.isJoiningExistingGroup)) || (stryMutAct_9fa48("87434") ? true : (stryCov_9fa48("87434"), false)));
      this.electionStarted = stryMutAct_9fa48("87435") ? true : (stryCov_9fa48("87435"), false);
      this.raftTimingConfig = null;
      this.joinSuppressedHeartbeat = null;
    }
  }
  get systemTableCache() {
    if (stryMutAct_9fa48("87436")) {
      {}
    } else {
      stryCov_9fa48("87436");
      return stryMutAct_9fa48("87439") ? this._systemTableCache && null : stryMutAct_9fa48("87438") ? false : stryMutAct_9fa48("87437") ? true : (stryCov_9fa48("87437", "87438", "87439"), this._systemTableCache || null);
    }
  }
  set systemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("87440")) {
      {}
    } else {
      stryCov_9fa48("87440");
      const previousCache = stryMutAct_9fa48("87443") ? this._systemTableCache && null : stryMutAct_9fa48("87442") ? false : stryMutAct_9fa48("87441") ? true : (stryCov_9fa48("87441", "87442", "87443"), this._systemTableCache || null);
      if (stryMutAct_9fa48("87446") ? previousCache && previousCache !== systemTableCache && typeof previousCache.offCacheChange === TYPEOF.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("87445") ? false : stryMutAct_9fa48("87444") ? true : (stryCov_9fa48("87444", "87445", "87446"), (stryMutAct_9fa48("87448") ? previousCache && previousCache !== systemTableCache || typeof previousCache.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("87447") ? true : (stryCov_9fa48("87447", "87448"), (stryMutAct_9fa48("87450") ? previousCache || previousCache !== systemTableCache : stryMutAct_9fa48("87449") ? true : (stryCov_9fa48("87449", "87450"), previousCache && (stryMutAct_9fa48("87452") ? previousCache === systemTableCache : stryMutAct_9fa48("87451") ? true : (stryCov_9fa48("87451", "87452"), previousCache !== systemTableCache)))) && (stryMutAct_9fa48("87454") ? typeof previousCache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("87453") ? true : (stryCov_9fa48("87453", "87454"), typeof previousCache.offCacheChange === TYPEOF.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("87455")) {
          {}
        } else {
          stryCov_9fa48("87455");
          previousCache.offCacheChange(this.systemTableCacheChangeListener);
        }
      }
      this._systemTableCache = systemTableCache;
      stryMutAct_9fa48("87456") ? this.roleMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("87456"), this.roleMutationHelper?.setSystemTableCache(systemTableCache));
      stryMutAct_9fa48("87457") ? this.leaderNodeMutationHelper.setSystemTableCache(systemTableCache) : (stryCov_9fa48("87457"), this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache));
      if (stryMutAct_9fa48("87459") ? false : stryMutAct_9fa48("87458") ? true : (stryCov_9fa48("87458", "87459"), this.rebalancer)) {
        if (stryMutAct_9fa48("87460")) {
          {}
        } else {
          stryCov_9fa48("87460");
          this.rebalancer.systemTableCache = systemTableCache;
        }
      }
      if (stryMutAct_9fa48("87463") ? systemTableCache && systemTableCache !== previousCache && typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("87462") ? false : stryMutAct_9fa48("87461") ? true : (stryCov_9fa48("87461", "87462", "87463"), (stryMutAct_9fa48("87465") ? systemTableCache && systemTableCache !== previousCache || typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("87464") ? true : (stryCov_9fa48("87464", "87465"), (stryMutAct_9fa48("87467") ? systemTableCache || systemTableCache !== previousCache : stryMutAct_9fa48("87466") ? true : (stryCov_9fa48("87466", "87467"), systemTableCache && (stryMutAct_9fa48("87469") ? systemTableCache === previousCache : stryMutAct_9fa48("87468") ? true : (stryCov_9fa48("87468", "87469"), systemTableCache !== previousCache)))) && (stryMutAct_9fa48("87471") ? typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("87470") ? true : (stryCov_9fa48("87470", "87471"), typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("87472")) {
          {}
        } else {
          stryCov_9fa48("87472");
          systemTableCache.onCacheChange(this.systemTableCacheChangeListener);
        }
      }
      this.scheduleRaftPeerReconciliation();
    }
  }
  get cdcIntegrationService() {
    if (stryMutAct_9fa48("87473")) {
      {}
    } else {
      stryCov_9fa48("87473");
      return stryMutAct_9fa48("87476") ? this._cdcIntegrationService && null : stryMutAct_9fa48("87475") ? false : stryMutAct_9fa48("87474") ? true : (stryCov_9fa48("87474", "87475", "87476"), this._cdcIntegrationService || null);
    }
  }
  set cdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("87477")) {
      {}
    } else {
      stryCov_9fa48("87477");
      this._cdcIntegrationService = cdcIntegrationService;
      stryMutAct_9fa48("87478") ? this.roleMutationHelper.setCdcIntegrationService(cdcIntegrationService) : (stryCov_9fa48("87478"), this.roleMutationHelper?.setCdcIntegrationService(cdcIntegrationService));
      stryMutAct_9fa48("87479") ? this.leaderNodeMutationHelper.setCdcIntegrationService(cdcIntegrationService) : (stryCov_9fa48("87479"), this.leaderNodeMutationHelper?.setCdcIntegrationService(cdcIntegrationService));
      if (stryMutAct_9fa48("87481") ? false : stryMutAct_9fa48("87480") ? true : (stryCov_9fa48("87480", "87481"), this.rebalancer)) {
        if (stryMutAct_9fa48("87482")) {
          {}
        } else {
          stryCov_9fa48("87482");
          this.rebalancer.cdcIntegrationService = cdcIntegrationService;
        }
      }
    }
  }
  get metadataPublicationReadinessState() {
    if (stryMutAct_9fa48("87483")) {
      {}
    } else {
      stryCov_9fa48("87483");
      return stryMutAct_9fa48("87486") ? this._metadataPublicationReadinessState && null : stryMutAct_9fa48("87485") ? false : stryMutAct_9fa48("87484") ? true : (stryCov_9fa48("87484", "87485", "87486"), this._metadataPublicationReadinessState || null);
    }
  }
  set metadataPublicationReadinessState(readinessState) {
    if (stryMutAct_9fa48("87487")) {
      {}
    } else {
      stryCov_9fa48("87487");
      if (stryMutAct_9fa48("87490") ? typeof this.releaseMetadataPublicationReadinessListener !== TYPEOF.FUNCTION : stryMutAct_9fa48("87489") ? false : stryMutAct_9fa48("87488") ? true : (stryCov_9fa48("87488", "87489", "87490"), typeof this.releaseMetadataPublicationReadinessListener === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("87491")) {
          {}
        } else {
          stryCov_9fa48("87491");
          this.releaseMetadataPublicationReadinessListener();
        }
      }
      this._metadataPublicationReadinessState = stryMutAct_9fa48("87494") ? readinessState && null : stryMutAct_9fa48("87493") ? false : stryMutAct_9fa48("87492") ? true : (stryCov_9fa48("87492", "87493", "87494"), readinessState || null);
      this.releaseMetadataPublicationReadinessListener = attachTrafficReadinessListener(this._metadataPublicationReadinessState, this.metadataPublicationReadinessTransitionListener);
    }
  }
  get pendingRoleUpdate() {
    if (stryMutAct_9fa48("87495")) {
      {}
    } else {
      stryCov_9fa48("87495");
      return stryMutAct_9fa48("87498") ? this.roleMutationHelper?.pendingValue && null : stryMutAct_9fa48("87497") ? false : stryMutAct_9fa48("87496") ? true : (stryCov_9fa48("87496", "87497", "87498"), (stryMutAct_9fa48("87499") ? this.roleMutationHelper.pendingValue : (stryCov_9fa48("87499"), this.roleMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingRoleUpdate(role) {
    if (stryMutAct_9fa48("87500")) {
      {}
    } else {
      stryCov_9fa48("87500");
      if (stryMutAct_9fa48("87502") ? false : stryMutAct_9fa48("87501") ? true : (stryCov_9fa48("87501", "87502"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("87503")) {
          {}
        } else {
          stryCov_9fa48("87503");
          this.roleMutationHelper.pendingValue = normalizePublishedRaftRole(role, stryMutAct_9fa48("87504") ? {} : (stryCov_9fa48("87504"), {
            collapseLeaderToFollower: stryMutAct_9fa48("87505") ? false : (stryCov_9fa48("87505"), true)
          }));
        }
      }
    }
  }
  get persistedRole() {
    if (stryMutAct_9fa48("87506")) {
      {}
    } else {
      stryCov_9fa48("87506");
      return stryMutAct_9fa48("87509") ? this.roleMutationHelper?.persistedValue && null : stryMutAct_9fa48("87508") ? false : stryMutAct_9fa48("87507") ? true : (stryCov_9fa48("87507", "87508", "87509"), (stryMutAct_9fa48("87510") ? this.roleMutationHelper.persistedValue : (stryCov_9fa48("87510"), this.roleMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedRole(role) {
    if (stryMutAct_9fa48("87511")) {
      {}
    } else {
      stryCov_9fa48("87511");
      if (stryMutAct_9fa48("87513") ? false : stryMutAct_9fa48("87512") ? true : (stryCov_9fa48("87512", "87513"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("87514")) {
          {}
        } else {
          stryCov_9fa48("87514");
          this.roleMutationHelper.persistedValue = role;
        }
      }
    }
  }
  get roleUpdateInFlight() {
    if (stryMutAct_9fa48("87515")) {
      {}
    } else {
      stryCov_9fa48("87515");
      return stryMutAct_9fa48("87518") ? this.roleMutationHelper?.inFlight && false : stryMutAct_9fa48("87517") ? false : stryMutAct_9fa48("87516") ? true : (stryCov_9fa48("87516", "87517", "87518"), (stryMutAct_9fa48("87519") ? this.roleMutationHelper.inFlight : (stryCov_9fa48("87519"), this.roleMutationHelper?.inFlight)) || (stryMutAct_9fa48("87520") ? true : (stryCov_9fa48("87520"), false)));
    }
  }
  get roleUpdateRetryTimer() {
    if (stryMutAct_9fa48("87521")) {
      {}
    } else {
      stryCov_9fa48("87521");
      return stryMutAct_9fa48("87524") ? this.roleMutationHelper?.retryTimer && null : stryMutAct_9fa48("87523") ? false : stryMutAct_9fa48("87522") ? true : (stryCov_9fa48("87522", "87523", "87524"), (stryMutAct_9fa48("87525") ? this.roleMutationHelper.retryTimer : (stryCov_9fa48("87525"), this.roleMutationHelper?.retryTimer)) || null);
    }
  }
  set roleUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("87526")) {
      {}
    } else {
      stryCov_9fa48("87526");
      if (stryMutAct_9fa48("87528") ? false : stryMutAct_9fa48("87527") ? true : (stryCov_9fa48("87527", "87528"), this.roleMutationHelper)) {
        if (stryMutAct_9fa48("87529")) {
          {}
        } else {
          stryCov_9fa48("87529");
          this.roleMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  get pendingLeaderNodeUpdate() {
    if (stryMutAct_9fa48("87530")) {
      {}
    } else {
      stryCov_9fa48("87530");
      return stryMutAct_9fa48("87533") ? this.leaderNodeMutationHelper?.pendingValue && null : stryMutAct_9fa48("87532") ? false : stryMutAct_9fa48("87531") ? true : (stryCov_9fa48("87531", "87532", "87533"), (stryMutAct_9fa48("87534") ? this.leaderNodeMutationHelper.pendingValue : (stryCov_9fa48("87534"), this.leaderNodeMutationHelper?.pendingValue)) || null);
    }
  }
  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("87535")) {
      {}
    } else {
      stryCov_9fa48("87535");
      if (stryMutAct_9fa48("87537") ? false : stryMutAct_9fa48("87536") ? true : (stryCov_9fa48("87536", "87537"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("87538")) {
          {}
        } else {
          stryCov_9fa48("87538");
          this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
        }
      }
    }
  }
  get persistedLeaderNodeId() {
    if (stryMutAct_9fa48("87539")) {
      {}
    } else {
      stryCov_9fa48("87539");
      return stryMutAct_9fa48("87542") ? this.leaderNodeMutationHelper?.persistedValue && null : stryMutAct_9fa48("87541") ? false : stryMutAct_9fa48("87540") ? true : (stryCov_9fa48("87540", "87541", "87542"), (stryMutAct_9fa48("87543") ? this.leaderNodeMutationHelper.persistedValue : (stryCov_9fa48("87543"), this.leaderNodeMutationHelper?.persistedValue)) || null);
    }
  }
  set persistedLeaderNodeId(leaderNodeId) {
    if (stryMutAct_9fa48("87544")) {
      {}
    } else {
      stryCov_9fa48("87544");
      if (stryMutAct_9fa48("87546") ? false : stryMutAct_9fa48("87545") ? true : (stryCov_9fa48("87545", "87546"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("87547")) {
          {}
        } else {
          stryCov_9fa48("87547");
          this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
        }
      }
    }
  }
  get leaderNodeUpdateInFlight() {
    if (stryMutAct_9fa48("87548")) {
      {}
    } else {
      stryCov_9fa48("87548");
      return stryMutAct_9fa48("87551") ? this.leaderNodeMutationHelper?.inFlight && false : stryMutAct_9fa48("87550") ? false : stryMutAct_9fa48("87549") ? true : (stryCov_9fa48("87549", "87550", "87551"), (stryMutAct_9fa48("87552") ? this.leaderNodeMutationHelper.inFlight : (stryCov_9fa48("87552"), this.leaderNodeMutationHelper?.inFlight)) || (stryMutAct_9fa48("87553") ? true : (stryCov_9fa48("87553"), false)));
    }
  }
  set leaderNodeUpdateInFlight(inFlight) {
    if (stryMutAct_9fa48("87554")) {
      {}
    } else {
      stryCov_9fa48("87554");
      if (stryMutAct_9fa48("87556") ? false : stryMutAct_9fa48("87555") ? true : (stryCov_9fa48("87555", "87556"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("87557")) {
          {}
        } else {
          stryCov_9fa48("87557");
          this.leaderNodeMutationHelper.inFlight = inFlight;
        }
      }
    }
  }
  get leaderNodeUpdateRetryTimer() {
    if (stryMutAct_9fa48("87558")) {
      {}
    } else {
      stryCov_9fa48("87558");
      return stryMutAct_9fa48("87561") ? this.leaderNodeMutationHelper?.retryTimer && null : stryMutAct_9fa48("87560") ? false : stryMutAct_9fa48("87559") ? true : (stryCov_9fa48("87559", "87560", "87561"), (stryMutAct_9fa48("87562") ? this.leaderNodeMutationHelper.retryTimer : (stryCov_9fa48("87562"), this.leaderNodeMutationHelper?.retryTimer)) || null);
    }
  }
  set leaderNodeUpdateRetryTimer(timer) {
    if (stryMutAct_9fa48("87563")) {
      {}
    } else {
      stryCov_9fa48("87563");
      if (stryMutAct_9fa48("87565") ? false : stryMutAct_9fa48("87564") ? true : (stryCov_9fa48("87564", "87565"), this.leaderNodeMutationHelper)) {
        if (stryMutAct_9fa48("87566")) {
          {}
        } else {
          stryCov_9fa48("87566");
          this.leaderNodeMutationHelper.retryTimer = timer;
        }
      }
    }
  }
  isMetadataPublicationReady() {
    if (stryMutAct_9fa48("87567")) {
      {}
    } else {
      stryCov_9fa48("87567");
      if (stryMutAct_9fa48("87570") ? false : stryMutAct_9fa48("87569") ? true : stryMutAct_9fa48("87568") ? this.metadataPublicationReadinessState : (stryCov_9fa48("87568", "87569", "87570"), !this.metadataPublicationReadinessState)) {
        if (stryMutAct_9fa48("87571")) {
          {}
        } else {
          stryCov_9fa48("87571");
          return stryMutAct_9fa48("87572") ? false : (stryCov_9fa48("87572"), true);
        }
      }
      return isMetadataPublicationLifecycleReady(this.metadataPublicationReadinessState);
    }
  }
  isMetadataPublicationConvergenceWindowOpen() {
    if (stryMutAct_9fa48("87573")) {
      {}
    } else {
      stryCov_9fa48("87573");
      return stryMutAct_9fa48("87576") ? this.isMetadataPublicationReady() || !this.isBackgroundWorkReady() : stryMutAct_9fa48("87575") ? false : stryMutAct_9fa48("87574") ? true : (stryCov_9fa48("87574", "87575", "87576"), this.isMetadataPublicationReady() && (stryMutAct_9fa48("87577") ? this.isBackgroundWorkReady() : (stryCov_9fa48("87577"), !this.isBackgroundWorkReady())));
    }
  }
  isBackgroundWorkReady() {
    if (stryMutAct_9fa48("87578")) {
      {}
    } else {
      stryCov_9fa48("87578");
      return isBackgroundWorkLifecycleReady(this.metadataPublicationReadinessState);
    }
  }
  handleMetadataPublicationReadinessTransition() {
    if (stryMutAct_9fa48("87579")) {
      {}
    } else {
      stryCov_9fa48("87579");
      this.maybeInitializeRebalancer();
      if (stryMutAct_9fa48("87582") ? false : stryMutAct_9fa48("87581") ? true : stryMutAct_9fa48("87580") ? this.isMetadataPublicationReady() : (stryCov_9fa48("87580", "87581", "87582"), !this.isMetadataPublicationReady())) {
        if (stryMutAct_9fa48("87583")) {
          {}
        } else {
          stryCov_9fa48("87583");
          return;
        }
      }
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("87584")) {
          {}
        } else {
          stryCov_9fa48("87584");
          this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE, stryMutAct_9fa48("87585") ? {} : (stryCov_9fa48("87585"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("87586")) {
          {}
        } else {
          stryCov_9fa48("87586");
          this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE, stryMutAct_9fa48("87587") ? {} : (stryCov_9fa48("87587"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
    }
  }
  createRoleMutationHelper() {
    if (stryMutAct_9fa48("87588")) {
      {}
    } else {
      stryCov_9fa48("87588");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("87589") ? {} : (stryCov_9fa48("87589"), {
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        buildWhereClause: (_role, context = {}) => {
          if (stryMutAct_9fa48("87590")) {
            {}
          } else {
            stryCov_9fa48("87590");
            const whereClause = stryMutAct_9fa48("87591") ? {} : (stryCov_9fa48("87591"), {
              [COLUMN.SERVICE_ID]: this.replicaId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("87594") ? typeof cachedRow?.raft_role === TYPEOF.STRING || cachedRow.raft_role.length > NUM.ZERO : stryMutAct_9fa48("87593") ? false : stryMutAct_9fa48("87592") ? true : (stryCov_9fa48("87592", "87593", "87594"), (stryMutAct_9fa48("87596") ? typeof cachedRow?.raft_role !== TYPEOF.STRING : stryMutAct_9fa48("87595") ? true : (stryCov_9fa48("87595", "87596"), typeof (stryMutAct_9fa48("87597") ? cachedRow.raft_role : (stryCov_9fa48("87597"), cachedRow?.raft_role)) === TYPEOF.STRING)) && (stryMutAct_9fa48("87600") ? cachedRow.raft_role.length <= NUM.ZERO : stryMutAct_9fa48("87599") ? cachedRow.raft_role.length >= NUM.ZERO : stryMutAct_9fa48("87598") ? true : (stryCov_9fa48("87598", "87599", "87600"), cachedRow.raft_role.length > NUM.ZERO)))) {
              if (stryMutAct_9fa48("87601")) {
                {}
              } else {
                stryCov_9fa48("87601");
                whereClause.raft_role = cachedRow.raft_role;
              }
            }
            if (stryMutAct_9fa48("87603") ? false : stryMutAct_9fa48("87602") ? true : (stryCov_9fa48("87602", "87603"), Number.isFinite(stryMutAct_9fa48("87604") ? cachedRow.updated_at : (stryCov_9fa48("87604"), cachedRow?.updated_at)))) {
              if (stryMutAct_9fa48("87605")) {
                {}
              } else {
                stryCov_9fa48("87605");
                whereClause.updated_at = cachedRow.updated_at;
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("87606") ? () => undefined : (stryCov_9fa48("87606"), (role, updatedAt) => stryMutAct_9fa48("87607") ? {} : (stryCov_9fa48("87607"), {
          raft_role: role,
          updated_at: updatedAt
        })),
        buildUpdateOptions: stryMutAct_9fa48("87608") ? () => undefined : (stryCov_9fa48("87608"), () => stryMutAct_9fa48("87609") ? {} : (stryCov_9fa48("87609"), {
          deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND,
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          allowPressureDefer: stryMutAct_9fa48("87610") ? false : (stryCov_9fa48("87610"), true),
          routingReadinessDimension: this.getMetadataPublicationReadinessDimension()
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("87611") ? () => undefined : (stryCov_9fa48("87611"), role => stryMutAct_9fa48("87612") ? {} : (stryCov_9fa48("87612"), {
          raft_role: role
        })),
        prepareFlush: stryMutAct_9fa48("87613") ? () => undefined : (stryCov_9fa48("87613"), () => stryMutAct_9fa48("87614") ? {} : (stryCov_9fa48("87614"), {
          skip: stryMutAct_9fa48("87615") ? this.publishRoleMetadata : (stryCov_9fa48("87615"), !this.publishRoleMetadata),
          clearPending: stryMutAct_9fa48("87616") ? this.publishRoleMetadata : (stryCov_9fa48("87616"), !this.publishRoleMetadata),
          reason: (stryMutAct_9fa48("87617") ? this.publishRoleMetadata : (stryCov_9fa48("87617"), !this.publishRoleMetadata)) ? FLUSH_SKIP_DISABLED : FLUSH_SKIP_READY
        })),
        readRowFromCache: stryMutAct_9fa48("87618") ? () => undefined : (stryCov_9fa48("87618"), systemTableCache => stryMutAct_9fa48("87621") ? systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) && null : stryMutAct_9fa48("87620") ? false : stryMutAct_9fa48("87619") ? true : (stryCov_9fa48("87619", "87620", "87621"), (stryMutAct_9fa48("87623") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("87622") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("87622", "87623"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId))) || null)),
        readValueFromCache: systemTableCache => {
          if (stryMutAct_9fa48("87624")) {
            {}
          } else {
            stryCov_9fa48("87624");
            const cached = stryMutAct_9fa48("87626") ? systemTableCache.get?.(TABLES.SERVICES, this.replicaId) : stryMutAct_9fa48("87625") ? systemTableCache?.get(TABLES.SERVICES, this.replicaId) : (stryCov_9fa48("87625", "87626"), systemTableCache?.get?.(TABLES.SERVICES, this.replicaId));
            return stryMutAct_9fa48("87629") ? cached?.raft_role && null : stryMutAct_9fa48("87628") ? false : stryMutAct_9fa48("87627") ? true : (stryCov_9fa48("87627", "87628", "87629"), (stryMutAct_9fa48("87630") ? cached.raft_role : (stryCov_9fa48("87630"), cached?.raft_role)) || null);
          }
        },
        isWriteReady: stryMutAct_9fa48("87631") ? () => undefined : (stryCov_9fa48("87631"), () => this.isServicesLeaderAvailable()),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("87632")) {
            {}
          } else {
            stryCov_9fa48("87632");
            this.logger.warn(ROLE_PERSIST_ERROR_MSG, stryMutAct_9fa48("87633") ? {} : (stryCov_9fa48("87633"), {
              groupId: this.groupId,
              replicaId: this.replicaId,
              role: stryMutAct_9fa48("87634") ? context.value && this.pendingRoleUpdate : (stryCov_9fa48("87634"), context.value ?? this.pendingRoleUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  }
  createLeaderNodeMutationHelper() {
    if (stryMutAct_9fa48("87635")) {
      {}
    } else {
      stryCov_9fa48("87635");
      return new AuthoritativeRowMutationHelper(stryMutAct_9fa48("87636") ? {} : (stryCov_9fa48("87636"), {
        tableName: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        buildWhereClause: (_leaderNodeId, context = {}) => {
          if (stryMutAct_9fa48("87637")) {
            {}
          } else {
            stryCov_9fa48("87637");
            const whereClause = stryMutAct_9fa48("87638") ? {} : (stryCov_9fa48("87638"), {
              [COLUMN.GROUP_ID]: this.groupId
            });
            const cachedRow = context.cachedRow;
            if (stryMutAct_9fa48("87641") ? typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === TYPEOF.STRING || cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO : stryMutAct_9fa48("87640") ? false : stryMutAct_9fa48("87639") ? true : (stryCov_9fa48("87639", "87640", "87641"), (stryMutAct_9fa48("87643") ? typeof cachedRow?.[COLUMN.LEADER_NODE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("87642") ? true : (stryCov_9fa48("87642", "87643"), typeof (stryMutAct_9fa48("87644") ? cachedRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("87644"), cachedRow?.[COLUMN.LEADER_NODE_ID])) === TYPEOF.STRING)) && (stryMutAct_9fa48("87647") ? cachedRow[COLUMN.LEADER_NODE_ID].length <= NUM.ZERO : stryMutAct_9fa48("87646") ? cachedRow[COLUMN.LEADER_NODE_ID].length >= NUM.ZERO : stryMutAct_9fa48("87645") ? true : (stryCov_9fa48("87645", "87646", "87647"), cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO)))) {
              if (stryMutAct_9fa48("87648")) {
                {}
              } else {
                stryCov_9fa48("87648");
                whereClause[COLUMN.LEADER_NODE_ID] = cachedRow[COLUMN.LEADER_NODE_ID];
              }
            }
            if (stryMutAct_9fa48("87650") ? false : stryMutAct_9fa48("87649") ? true : (stryCov_9fa48("87649", "87650"), Number.isFinite(stryMutAct_9fa48("87651") ? cachedRow[COLUMN.UPDATED_AT] : (stryCov_9fa48("87651"), cachedRow?.[COLUMN.UPDATED_AT])))) {
              if (stryMutAct_9fa48("87652")) {
                {}
              } else {
                stryCov_9fa48("87652");
                whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
              }
            }
            return whereClause;
          }
        },
        buildUpdateData: stryMutAct_9fa48("87653") ? () => undefined : (stryCov_9fa48("87653"), (leaderNodeId, updatedAt) => stryMutAct_9fa48("87654") ? {} : (stryCov_9fa48("87654"), {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
          [COLUMN.UPDATED_AT]: updatedAt
        })),
        buildUpdateOptions: stryMutAct_9fa48("87655") ? () => undefined : (stryCov_9fa48("87655"), () => stryMutAct_9fa48("87656") ? {} : (stryCov_9fa48("87656"), {
          deliveryPriority: this.getMetadataPublicationDeliveryPriority(),
          routingReadinessDimension: this.getMetadataPublicationReadinessDimension()
        })),
        buildExpectedCacheFields: stryMutAct_9fa48("87657") ? () => undefined : (stryCov_9fa48("87657"), leaderNodeId => stryMutAct_9fa48("87658") ? {} : (stryCov_9fa48("87658"), {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId
        })),
        readRowFromCache: stryMutAct_9fa48("87659") ? () => undefined : (stryCov_9fa48("87659"), systemTableCache => stryMutAct_9fa48("87662") ? systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId) && null : stryMutAct_9fa48("87661") ? false : stryMutAct_9fa48("87660") ? true : (stryCov_9fa48("87660", "87661", "87662"), (stryMutAct_9fa48("87664") ? systemTableCache.get?.(TABLES.MESSAGE_GROUPS, this.groupId) : stryMutAct_9fa48("87663") ? systemTableCache?.get(TABLES.MESSAGE_GROUPS, this.groupId) : (stryCov_9fa48("87663", "87664"), systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId))) || null)),
        readValueFromCache: systemTableCache => {
          if (stryMutAct_9fa48("87665")) {
            {}
          } else {
            stryCov_9fa48("87665");
            const cached = stryMutAct_9fa48("87667") ? systemTableCache.get?.(TABLES.MESSAGE_GROUPS, this.groupId) : stryMutAct_9fa48("87666") ? systemTableCache?.get(TABLES.MESSAGE_GROUPS, this.groupId) : (stryCov_9fa48("87666", "87667"), systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId));
            return stryMutAct_9fa48("87670") ? cached?.[COLUMN.LEADER_NODE_ID] && null : stryMutAct_9fa48("87669") ? false : stryMutAct_9fa48("87668") ? true : (stryCov_9fa48("87668", "87669", "87670"), (stryMutAct_9fa48("87671") ? cached[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("87671"), cached?.[COLUMN.LEADER_NODE_ID])) || null);
          }
        },
        prepareFlush: stryMutAct_9fa48("87672") ? () => undefined : (stryCov_9fa48("87672"), () => stryMutAct_9fa48("87673") ? {} : (stryCov_9fa48("87673"), {
          skip: stryMutAct_9fa48("87676") ? !this.publishLeaderNodeMetadata && !this.isLeader : stryMutAct_9fa48("87675") ? false : stryMutAct_9fa48("87674") ? true : (stryCov_9fa48("87674", "87675", "87676"), (stryMutAct_9fa48("87677") ? this.publishLeaderNodeMetadata : (stryCov_9fa48("87677"), !this.publishLeaderNodeMetadata)) || (stryMutAct_9fa48("87678") ? this.isLeader : (stryCov_9fa48("87678"), !this.isLeader))),
          clearPending: stryMutAct_9fa48("87681") ? !this.publishLeaderNodeMetadata && !this.isLeader : stryMutAct_9fa48("87680") ? false : stryMutAct_9fa48("87679") ? true : (stryCov_9fa48("87679", "87680", "87681"), (stryMutAct_9fa48("87682") ? this.publishLeaderNodeMetadata : (stryCov_9fa48("87682"), !this.publishLeaderNodeMetadata)) || (stryMutAct_9fa48("87683") ? this.isLeader : (stryCov_9fa48("87683"), !this.isLeader))),
          reason: (stryMutAct_9fa48("87684") ? this.publishLeaderNodeMetadata : (stryCov_9fa48("87684"), !this.publishLeaderNodeMetadata)) ? FLUSH_SKIP_DISABLED : (stryMutAct_9fa48("87685") ? this.isLeader : (stryCov_9fa48("87685"), !this.isLeader)) ? FLUSH_SKIP_NOT_OWNER : FLUSH_SKIP_READY
        })),
        isWriteReady: stryMutAct_9fa48("87686") ? () => undefined : (stryCov_9fa48("87686"), () => this.isMessageGroupsLeaderAvailable()),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          if (stryMutAct_9fa48("87687")) {
            {}
          } else {
            stryCov_9fa48("87687");
            this.logger.warn(LEADER_NODE_PERSIST_ERROR_MSG, stryMutAct_9fa48("87688") ? {} : (stryCov_9fa48("87688"), {
              groupId: this.groupId,
              replicaId: this.replicaId,
              leaderNodeId: stryMutAct_9fa48("87689") ? context.value && this.pendingLeaderNodeUpdate : (stryCov_9fa48("87689"), context.value ?? this.pendingLeaderNodeUpdate),
              error: error.message
            }));
          }
        }
      }));
    }
  } /**
    * Check if transport is WebSocket-based (MessageRouter).
    * Valid transports: MessageRouter
    * Invalid: InMemoryTransport, null, undefined
    *
    * Detection is done via duck typing:
    * - MessageRouter has: deliver(), initialize(), shutdown(), setServiceNodeResolver()
    *
    * @param {Object} transport - Transport to validate.
    * @return {boolean} True if transport is WebSocket-based.
    */
  isWebSocketBasedTransport(transport) {
    if (stryMutAct_9fa48("87690")) {
      {}
    } else {
      stryCov_9fa48("87690");
      if (stryMutAct_9fa48("87693") ? false : stryMutAct_9fa48("87692") ? true : stryMutAct_9fa48("87691") ? transport : (stryCov_9fa48("87691", "87692", "87693"), !transport)) return stryMutAct_9fa48("87694") ? true : (stryCov_9fa48("87694"), false); // Check for required methods
      const hasDeliver = stryMutAct_9fa48("87697") ? typeof transport.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("87696") ? false : stryMutAct_9fa48("87695") ? true : (stryCov_9fa48("87695", "87696", "87697"), typeof transport.deliver === TYPEOF.FUNCTION);
      const hasInitialize = stryMutAct_9fa48("87700") ? typeof transport.initialize !== TYPEOF.FUNCTION : stryMutAct_9fa48("87699") ? false : stryMutAct_9fa48("87698") ? true : (stryCov_9fa48("87698", "87699", "87700"), typeof transport.initialize === TYPEOF.FUNCTION); // Check for MessageRouter marker
      const isMessageRouter = stryMutAct_9fa48("87703") ? typeof transport.setServiceNodeResolver !== TYPEOF.FUNCTION : stryMutAct_9fa48("87702") ? false : stryMutAct_9fa48("87701") ? true : (stryCov_9fa48("87701", "87702", "87703"), typeof transport.setServiceNodeResolver === TYPEOF.FUNCTION);
      return stryMutAct_9fa48("87706") ? hasDeliver && hasInitialize || isMessageRouter : stryMutAct_9fa48("87705") ? false : stryMutAct_9fa48("87704") ? true : (stryCov_9fa48("87704", "87705", "87706"), (stryMutAct_9fa48("87708") ? hasDeliver || hasInitialize : stryMutAct_9fa48("87707") ? true : (stryCov_9fa48("87707", "87708"), hasDeliver && hasInitialize)) && isMessageRouter);
    }
  } /**
    * Get the unified address for this service.
    * Format: ${nodeId}/message-group/${replicaId}
    * Requirements: 1.1, 5.1
    * @return {string} Unified address.
    */
  getUnifiedAddress() {
    if (stryMutAct_9fa48("87709")) {
      {}
    } else {
      stryCov_9fa48("87709");
      return this.unifiedAddress;
    }
  } /**
    * Build a unified address for a peer replica.
    * Looks up the address from the authoritative cache first, then live raft
    * peers, and only uses bootstrap hints when a caller explicitly opts in.
    * Uses AddressManager for consistent address formatting and validation.
    * Requirements: 1.1, 1.4, 9.1
    * @param {string} peerId - Peer replica ID.
    * @param {Object} [options]
    * @param {boolean} [options.allowBootstrapHints=false] - Permit
    * bootstrap-time peer hints when authoritative runtime location has not
    * converged yet.
    * @return {string} Unified address for the peer.
    */
  buildPeerAddress(peerId, options = {}) {
    if (stryMutAct_9fa48("87710")) {
      {}
    } else {
      stryCov_9fa48("87710");
      // If peerId is already in unified format, validate and return as-is.
      // Fail fast (and log) when a provided address is not unified.
      // Requirements: 1.4
      if (stryMutAct_9fa48("87712") ? false : stryMutAct_9fa48("87711") ? true : (stryCov_9fa48("87711", "87712"), peerId.includes(ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("87713")) {
          {}
        } else {
          stryCov_9fa48("87713");
          const validation = this.addressManager.validate(peerId);
          if (stryMutAct_9fa48("87715") ? false : stryMutAct_9fa48("87714") ? true : (stryCov_9fa48("87714", "87715"), validation.valid)) {
            if (stryMutAct_9fa48("87716")) {
              {}
            } else {
              stryCov_9fa48("87716");
              return peerId;
            }
          }
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT, stryMutAct_9fa48("87717") ? {} : (stryCov_9fa48("87717"), {
            peerId,
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: validation.error
          }));
          throw new Error(stryMutAct_9fa48("87718") ? `` : (stryCov_9fa48("87718"), `Peer address must be unified: ${peerId}`));
        }
      } // Prefer cache-backed topology first so handoff/move metadata wins over
      // bootstrap-time peer hints.
      const cachedAddress = this.resolvePeerAddressFromCache(peerId);
      if (stryMutAct_9fa48("87720") ? false : stryMutAct_9fa48("87719") ? true : (stryCov_9fa48("87719", "87720"), cachedAddress)) {
        if (stryMutAct_9fa48("87721")) {
          {}
        } else {
          stryCov_9fa48("87721");
          this.bootstrapHintFallbackLogged.delete(peerId);
          return cachedAddress;
        }
      }
      const livePeerAddress = this.resolveLivePeerAddressFromRaftNodes(peerId);
      if (stryMutAct_9fa48("87723") ? false : stryMutAct_9fa48("87722") ? true : (stryCov_9fa48("87722", "87723"), livePeerAddress)) {
        if (stryMutAct_9fa48("87724")) {
          {}
        } else {
          stryCov_9fa48("87724");
          return livePeerAddress;
        }
      }
      if (stryMutAct_9fa48("87727") ? options.allowBootstrapHints === true : stryMutAct_9fa48("87726") ? false : stryMutAct_9fa48("87725") ? true : (stryCov_9fa48("87725", "87726", "87727"), options.allowBootstrapHints !== (stryMutAct_9fa48("87728") ? false : (stryCov_9fa48("87728"), true)))) {
        if (stryMutAct_9fa48("87729")) {
          {}
        } else {
          stryCov_9fa48("87729");
          throw new Error(stryMutAct_9fa48("87730") ? `` : (stryCov_9fa48("87730"), `Unable to resolve unified peer address for ${peerId}`));
        }
      }
      const hintedAddress = this.resolvePeerAddressFromHints(peerId);
      if (stryMutAct_9fa48("87732") ? false : stryMutAct_9fa48("87731") ? true : (stryCov_9fa48("87731", "87732"), hintedAddress)) {
        if (stryMutAct_9fa48("87733")) {
          {}
        } else {
          stryCov_9fa48("87733");
          this.logBootstrapHintFallback(peerId, hintedAddress);
          return hintedAddress;
        }
      }
      throw new Error(stryMutAct_9fa48("87734") ? `` : (stryCov_9fa48("87734"), `Unable to resolve unified peer address for ${peerId}`));
    }
  }
  resolvePeerAddressFromHints(peerId) {
    if (stryMutAct_9fa48("87735")) {
      {}
    } else {
      stryCov_9fa48("87735");
      if (stryMutAct_9fa48("87738") ? !this.peerAddresses && this.peerAddresses.length === NUM.ZERO : stryMutAct_9fa48("87737") ? false : stryMutAct_9fa48("87736") ? true : (stryCov_9fa48("87736", "87737", "87738"), (stryMutAct_9fa48("87739") ? this.peerAddresses : (stryCov_9fa48("87739"), !this.peerAddresses)) || (stryMutAct_9fa48("87741") ? this.peerAddresses.length !== NUM.ZERO : stryMutAct_9fa48("87740") ? false : (stryCov_9fa48("87740", "87741"), this.peerAddresses.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("87742")) {
          {}
        } else {
          stryCov_9fa48("87742");
          return null;
        }
      }
      for (const addr of this.peerAddresses) {
        if (stryMutAct_9fa48("87743")) {
          {}
        } else {
          stryCov_9fa48("87743");
          const validation = this.addressManager.validate(addr);
          if (stryMutAct_9fa48("87746") ? false : stryMutAct_9fa48("87745") ? true : stryMutAct_9fa48("87744") ? validation.valid : (stryCov_9fa48("87744", "87745", "87746"), !validation.valid)) {
            if (stryMutAct_9fa48("87747")) {
              {}
            } else {
              stryCov_9fa48("87747");
              this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT, stryMutAct_9fa48("87748") ? {} : (stryCov_9fa48("87748"), {
                peerId: addr,
                groupId: this.groupId,
                replicaId: this.replicaId,
                error: validation.error
              }));
              throw new Error(stryMutAct_9fa48("87749") ? `` : (stryCov_9fa48("87749"), `Peer address must be unified: ${addr}`));
            }
          }
          try {
            if (stryMutAct_9fa48("87750")) {
              {}
            } else {
              stryCov_9fa48("87750");
              const parsed = this.addressManager.parse(addr);
              if (stryMutAct_9fa48("87753") ? parsed.serviceId !== peerId : stryMutAct_9fa48("87752") ? false : stryMutAct_9fa48("87751") ? true : (stryCov_9fa48("87751", "87752", "87753"), parsed.serviceId === peerId)) {
                if (stryMutAct_9fa48("87754")) {
                  {}
                } else {
                  stryCov_9fa48("87754");
                  return addr;
                }
              }
            }
          } catch (_e) {// Ignore parse errors here; validation already guards format.
          }
        }
      }
      return null;
    }
  } /**
    * Resolve peer address from the services cache.
    * @param {string} peerId - Peer replica ID.
    * @return {string|null} Unified address from cache, otherwise null.
    * @private
    */
  resolvePeerAddressFromCache(peerId) {
    if (stryMutAct_9fa48("87755")) {
      {}
    } else {
      stryCov_9fa48("87755");
      if (stryMutAct_9fa48("87758") ? false : stryMutAct_9fa48("87757") ? true : stryMutAct_9fa48("87756") ? this.systemTableCache : (stryCov_9fa48("87756", "87757", "87758"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("87759")) {
          {}
        } else {
          stryCov_9fa48("87759");
          return null;
        }
      }
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (stryMutAct_9fa48("87762") ? false : stryMutAct_9fa48("87761") ? true : stryMutAct_9fa48("87760") ? service : (stryCov_9fa48("87760", "87761", "87762"), !service)) {
        if (stryMutAct_9fa48("87763")) {
          {}
        } else {
          stryCov_9fa48("87763");
          return null;
        }
      }
      if (stryMutAct_9fa48("87765") ? false : stryMutAct_9fa48("87764") ? true : (stryCov_9fa48("87764", "87765"), service.address)) {
        if (stryMutAct_9fa48("87766")) {
          {}
        } else {
          stryCov_9fa48("87766");
          const validation = this.addressManager.validate(service.address);
          if (stryMutAct_9fa48("87768") ? false : stryMutAct_9fa48("87767") ? true : (stryCov_9fa48("87767", "87768"), validation.valid)) {
            if (stryMutAct_9fa48("87769")) {
              {}
            } else {
              stryCov_9fa48("87769");
              return service.address;
            }
          }
        }
      }
      if (stryMutAct_9fa48("87771") ? false : stryMutAct_9fa48("87770") ? true : (stryCov_9fa48("87770", "87771"), service.node_id)) {
        if (stryMutAct_9fa48("87772")) {
          {}
        } else {
          stryCov_9fa48("87772");
          return this.addressManager.format(service.node_id, ENTITY_TYPE.MESSAGE_GROUP, peerId);
        }
      }
      return null;
    }
  } /**
    * Emit a structured warning when bootstrap peer hints are used as fallback.
    * @param {string} peerId - Peer replica ID.
    * @param {string} address - Resolved bootstrap hint address.
    * @private
    */
  logBootstrapHintFallback(peerId, address) {
    if (stryMutAct_9fa48("87773")) {
      {}
    } else {
      stryCov_9fa48("87773");
      if (stryMutAct_9fa48("87775") ? false : stryMutAct_9fa48("87774") ? true : (stryCov_9fa48("87774", "87775"), this.bootstrapHintFallbackLogged.has(peerId))) {
        if (stryMutAct_9fa48("87776")) {
          {}
        } else {
          stryCov_9fa48("87776");
          return;
        }
      }
      this.bootstrapHintFallbackLogged.add(peerId);
      this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION, stryMutAct_9fa48("87777") ? {} : (stryCov_9fa48("87777"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        peerId,
        address,
        resolutionSource: MESSAGE_GROUP_SERVICE_LITERAL.BOOTSTRAP_HINT
      }));
    }
  } /**
    * React to authoritative services cache changes for this message group.
    * Existing replicas need this to discover newly added or moved peers.
    * @param {string} tableName
    * @param {string} _operation
    * @param {Object} record
    * @private
    */
  handleSystemTableCacheChange(tableName, _operation, record) {
    if (stryMutAct_9fa48("87778")) {
      {}
    } else {
      stryCov_9fa48("87778");
      if (stryMutAct_9fa48("87781") ? tableName !== TABLES.SERVICES && !record : stryMutAct_9fa48("87780") ? false : stryMutAct_9fa48("87779") ? true : (stryCov_9fa48("87779", "87780", "87781"), (stryMutAct_9fa48("87783") ? tableName === TABLES.SERVICES : stryMutAct_9fa48("87782") ? false : (stryCov_9fa48("87782", "87783"), tableName !== TABLES.SERVICES)) || (stryMutAct_9fa48("87784") ? record : (stryCov_9fa48("87784"), !record)))) {
        if (stryMutAct_9fa48("87785")) {
          {}
        } else {
          stryCov_9fa48("87785");
          return;
        }
      }
      if (stryMutAct_9fa48("87788") ? (record?.[COLUMN.GROUP_ID] || record?.group_id) !== this.groupId && (record?.[COLUMN.SERVICE_TYPE] || record?.service_type) !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87787") ? false : stryMutAct_9fa48("87786") ? true : (stryCov_9fa48("87786", "87787", "87788"), (stryMutAct_9fa48("87790") ? (record?.[COLUMN.GROUP_ID] || record?.group_id) === this.groupId : stryMutAct_9fa48("87789") ? false : (stryCov_9fa48("87789", "87790"), (stryMutAct_9fa48("87793") ? record?.[COLUMN.GROUP_ID] && record?.group_id : stryMutAct_9fa48("87792") ? false : stryMutAct_9fa48("87791") ? true : (stryCov_9fa48("87791", "87792", "87793"), (stryMutAct_9fa48("87794") ? record[COLUMN.GROUP_ID] : (stryCov_9fa48("87794"), record?.[COLUMN.GROUP_ID])) || (stryMutAct_9fa48("87795") ? record.group_id : (stryCov_9fa48("87795"), record?.group_id)))) !== this.groupId)) || (stryMutAct_9fa48("87797") ? (record?.[COLUMN.SERVICE_TYPE] || record?.service_type) === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87796") ? false : (stryCov_9fa48("87796", "87797"), (stryMutAct_9fa48("87800") ? record?.[COLUMN.SERVICE_TYPE] && record?.service_type : stryMutAct_9fa48("87799") ? false : stryMutAct_9fa48("87798") ? true : (stryCov_9fa48("87798", "87799", "87800"), (stryMutAct_9fa48("87801") ? record[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("87801"), record?.[COLUMN.SERVICE_TYPE])) || (stryMutAct_9fa48("87802") ? record.service_type : (stryCov_9fa48("87802"), record?.service_type)))) !== SERVICE_TYPE.MESSAGE_GROUP)))) {
        if (stryMutAct_9fa48("87803")) {
          {}
        } else {
          stryCov_9fa48("87803");
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
    if (stryMutAct_9fa48("87804")) {
      {}
    } else {
      stryCov_9fa48("87804");
      if (stryMutAct_9fa48("87806") ? false : stryMutAct_9fa48("87805") ? true : (stryCov_9fa48("87805", "87806"), this.peerReconciliationScheduled)) {
        if (stryMutAct_9fa48("87807")) {
          {}
        } else {
          stryCov_9fa48("87807");
          return;
        }
      }
      this.peerReconciliationScheduled = stryMutAct_9fa48("87808") ? false : (stryCov_9fa48("87808"), true);
      setImmediate(() => {
        if (stryMutAct_9fa48("87809")) {
          {}
        } else {
          stryCov_9fa48("87809");
          this.peerReconciliationScheduled = stryMutAct_9fa48("87810") ? true : (stryCov_9fa48("87810"), false);
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
    if (stryMutAct_9fa48("87811")) {
      {}
    } else {
      stryCov_9fa48("87811");
      if (stryMutAct_9fa48("87814") ? (!this.raft || !this.systemTableCache) && typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("87813") ? false : stryMutAct_9fa48("87812") ? true : (stryCov_9fa48("87812", "87813", "87814"), (stryMutAct_9fa48("87816") ? !this.raft && !this.systemTableCache : stryMutAct_9fa48("87815") ? false : (stryCov_9fa48("87815", "87816"), (stryMutAct_9fa48("87817") ? this.raft : (stryCov_9fa48("87817"), !this.raft)) || (stryMutAct_9fa48("87818") ? this.systemTableCache : (stryCov_9fa48("87818"), !this.systemTableCache)))) || (stryMutAct_9fa48("87820") ? typeof this.systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("87819") ? false : (stryCov_9fa48("87819", "87820"), typeof this.systemTableCache.filter !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("87821")) {
          {}
        } else {
          stryCov_9fa48("87821");
          return;
        }
      }
      const services = stryMutAct_9fa48("87822") ? this.systemTableCache : (stryCov_9fa48("87822"), this.systemTableCache.filter(TABLES.SERVICES, service => {
        if (stryMutAct_9fa48("87823")) {
          {}
        } else {
          stryCov_9fa48("87823");
          return stryMutAct_9fa48("87826") ? (service?.[COLUMN.GROUP_ID] || service?.group_id) === this.groupId || (service?.[COLUMN.SERVICE_TYPE] || service?.service_type) === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87825") ? false : stryMutAct_9fa48("87824") ? true : (stryCov_9fa48("87824", "87825", "87826"), (stryMutAct_9fa48("87828") ? (service?.[COLUMN.GROUP_ID] || service?.group_id) !== this.groupId : stryMutAct_9fa48("87827") ? true : (stryCov_9fa48("87827", "87828"), (stryMutAct_9fa48("87831") ? service?.[COLUMN.GROUP_ID] && service?.group_id : stryMutAct_9fa48("87830") ? false : stryMutAct_9fa48("87829") ? true : (stryCov_9fa48("87829", "87830", "87831"), (stryMutAct_9fa48("87832") ? service[COLUMN.GROUP_ID] : (stryCov_9fa48("87832"), service?.[COLUMN.GROUP_ID])) || (stryMutAct_9fa48("87833") ? service.group_id : (stryCov_9fa48("87833"), service?.group_id)))) === this.groupId)) && (stryMutAct_9fa48("87835") ? (service?.[COLUMN.SERVICE_TYPE] || service?.service_type) !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87834") ? true : (stryCov_9fa48("87834", "87835"), (stryMutAct_9fa48("87838") ? service?.[COLUMN.SERVICE_TYPE] && service?.service_type : stryMutAct_9fa48("87837") ? false : stryMutAct_9fa48("87836") ? true : (stryCov_9fa48("87836", "87837", "87838"), (stryMutAct_9fa48("87839") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("87839"), service?.[COLUMN.SERVICE_TYPE])) || (stryMutAct_9fa48("87840") ? service.service_type : (stryCov_9fa48("87840"), service?.service_type)))) === SERVICE_TYPE.MESSAGE_GROUP)));
        }
      }));
      if (stryMutAct_9fa48("87843") ? services.length !== NUM.ZERO : stryMutAct_9fa48("87842") ? false : stryMutAct_9fa48("87841") ? true : (stryCov_9fa48("87841", "87842", "87843"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("87844")) {
          {}
        } else {
          stryCov_9fa48("87844");
          return;
        }
      }
      const expectedAddressesByReplicaId = new Map();
      for (const service of services) {
        if (stryMutAct_9fa48("87845")) {
          {}
        } else {
          stryCov_9fa48("87845");
          const replicaId = stryMutAct_9fa48("87848") ? (service?.[COLUMN.SERVICE_ID] || service?.service_id || service?.[COLUMN.REPLICA_ID]) && service?.replica_id : stryMutAct_9fa48("87847") ? false : stryMutAct_9fa48("87846") ? true : (stryCov_9fa48("87846", "87847", "87848"), (stryMutAct_9fa48("87850") ? (service?.[COLUMN.SERVICE_ID] || service?.service_id) && service?.[COLUMN.REPLICA_ID] : stryMutAct_9fa48("87849") ? false : (stryCov_9fa48("87849", "87850"), (stryMutAct_9fa48("87852") ? service?.[COLUMN.SERVICE_ID] && service?.service_id : stryMutAct_9fa48("87851") ? false : (stryCov_9fa48("87851", "87852"), (stryMutAct_9fa48("87853") ? service[COLUMN.SERVICE_ID] : (stryCov_9fa48("87853"), service?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("87854") ? service.service_id : (stryCov_9fa48("87854"), service?.service_id)))) || (stryMutAct_9fa48("87855") ? service[COLUMN.REPLICA_ID] : (stryCov_9fa48("87855"), service?.[COLUMN.REPLICA_ID])))) || (stryMutAct_9fa48("87856") ? service.replica_id : (stryCov_9fa48("87856"), service?.replica_id)));
          if (stryMutAct_9fa48("87859") ? false : stryMutAct_9fa48("87858") ? true : stryMutAct_9fa48("87857") ? replicaId : (stryCov_9fa48("87857", "87858", "87859"), !replicaId)) {
            if (stryMutAct_9fa48("87860")) {
              {}
            } else {
              stryCov_9fa48("87860");
              continue;
            }
          }
          const status = stryMutAct_9fa48("87863") ? (service?.[COLUMN.STATUS] || service?.status) && ReplicaStatus.ACTIVE : stryMutAct_9fa48("87862") ? false : stryMutAct_9fa48("87861") ? true : (stryCov_9fa48("87861", "87862", "87863"), (stryMutAct_9fa48("87865") ? service?.[COLUMN.STATUS] && service?.status : stryMutAct_9fa48("87864") ? false : (stryCov_9fa48("87864", "87865"), (stryMutAct_9fa48("87866") ? service[COLUMN.STATUS] : (stryCov_9fa48("87866"), service?.[COLUMN.STATUS])) || (stryMutAct_9fa48("87867") ? service.status : (stryCov_9fa48("87867"), service?.status)))) || ReplicaStatus.ACTIVE);
          if (stryMutAct_9fa48("87870") ? (status === ReplicaStatus.FAILED || status === ReplicaStatus.REMOVING) && status === ReplicaStatus.REMOVED : stryMutAct_9fa48("87869") ? false : stryMutAct_9fa48("87868") ? true : (stryCov_9fa48("87868", "87869", "87870"), (stryMutAct_9fa48("87872") ? status === ReplicaStatus.FAILED && status === ReplicaStatus.REMOVING : stryMutAct_9fa48("87871") ? false : (stryCov_9fa48("87871", "87872"), (stryMutAct_9fa48("87874") ? status !== ReplicaStatus.FAILED : stryMutAct_9fa48("87873") ? false : (stryCov_9fa48("87873", "87874"), status === ReplicaStatus.FAILED)) || (stryMutAct_9fa48("87876") ? status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("87875") ? false : (stryCov_9fa48("87875", "87876"), status === ReplicaStatus.REMOVING)))) || (stryMutAct_9fa48("87878") ? status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("87877") ? false : (stryCov_9fa48("87877", "87878"), status === ReplicaStatus.REMOVED)))) {
            if (stryMutAct_9fa48("87879")) {
              {}
            } else {
              stryCov_9fa48("87879");
              continue;
            }
          }
          const peerAddress = (stryMutAct_9fa48("87882") ? typeof (service?.[COLUMN.ADDRESS] || service?.address) === TYPEOF.STRING || (service?.[COLUMN.ADDRESS] || service?.address).length > NUM.ZERO : stryMutAct_9fa48("87881") ? false : stryMutAct_9fa48("87880") ? true : (stryCov_9fa48("87880", "87881", "87882"), (stryMutAct_9fa48("87884") ? typeof (service?.[COLUMN.ADDRESS] || service?.address) !== TYPEOF.STRING : stryMutAct_9fa48("87883") ? true : (stryCov_9fa48("87883", "87884"), typeof (stryMutAct_9fa48("87887") ? service?.[COLUMN.ADDRESS] && service?.address : stryMutAct_9fa48("87886") ? false : stryMutAct_9fa48("87885") ? true : (stryCov_9fa48("87885", "87886", "87887"), (stryMutAct_9fa48("87888") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("87888"), service?.[COLUMN.ADDRESS])) || (stryMutAct_9fa48("87889") ? service.address : (stryCov_9fa48("87889"), service?.address)))) === TYPEOF.STRING)) && (stryMutAct_9fa48("87892") ? (service?.[COLUMN.ADDRESS] || service?.address).length <= NUM.ZERO : stryMutAct_9fa48("87891") ? (service?.[COLUMN.ADDRESS] || service?.address).length >= NUM.ZERO : stryMutAct_9fa48("87890") ? true : (stryCov_9fa48("87890", "87891", "87892"), (stryMutAct_9fa48("87895") ? service?.[COLUMN.ADDRESS] && service?.address : stryMutAct_9fa48("87894") ? false : stryMutAct_9fa48("87893") ? true : (stryCov_9fa48("87893", "87894", "87895"), (stryMutAct_9fa48("87896") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("87896"), service?.[COLUMN.ADDRESS])) || (stryMutAct_9fa48("87897") ? service.address : (stryCov_9fa48("87897"), service?.address)))).length > NUM.ZERO)))) ? stryMutAct_9fa48("87900") ? service?.[COLUMN.ADDRESS] && service?.address : stryMutAct_9fa48("87899") ? false : stryMutAct_9fa48("87898") ? true : (stryCov_9fa48("87898", "87899", "87900"), (stryMutAct_9fa48("87901") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("87901"), service?.[COLUMN.ADDRESS])) || (stryMutAct_9fa48("87902") ? service.address : (stryCov_9fa48("87902"), service?.address))) : (stryMutAct_9fa48("87905") ? typeof (service?.[COLUMN.NODE_ID] || service?.node_id) === TYPEOF.STRING || (service?.[COLUMN.NODE_ID] || service?.node_id).length > NUM.ZERO : stryMutAct_9fa48("87904") ? false : stryMutAct_9fa48("87903") ? true : (stryCov_9fa48("87903", "87904", "87905"), (stryMutAct_9fa48("87907") ? typeof (service?.[COLUMN.NODE_ID] || service?.node_id) !== TYPEOF.STRING : stryMutAct_9fa48("87906") ? true : (stryCov_9fa48("87906", "87907"), typeof (stryMutAct_9fa48("87910") ? service?.[COLUMN.NODE_ID] && service?.node_id : stryMutAct_9fa48("87909") ? false : stryMutAct_9fa48("87908") ? true : (stryCov_9fa48("87908", "87909", "87910"), (stryMutAct_9fa48("87911") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("87911"), service?.[COLUMN.NODE_ID])) || (stryMutAct_9fa48("87912") ? service.node_id : (stryCov_9fa48("87912"), service?.node_id)))) === TYPEOF.STRING)) && (stryMutAct_9fa48("87915") ? (service?.[COLUMN.NODE_ID] || service?.node_id).length <= NUM.ZERO : stryMutAct_9fa48("87914") ? (service?.[COLUMN.NODE_ID] || service?.node_id).length >= NUM.ZERO : stryMutAct_9fa48("87913") ? true : (stryCov_9fa48("87913", "87914", "87915"), (stryMutAct_9fa48("87918") ? service?.[COLUMN.NODE_ID] && service?.node_id : stryMutAct_9fa48("87917") ? false : stryMutAct_9fa48("87916") ? true : (stryCov_9fa48("87916", "87917", "87918"), (stryMutAct_9fa48("87919") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("87919"), service?.[COLUMN.NODE_ID])) || (stryMutAct_9fa48("87920") ? service.node_id : (stryCov_9fa48("87920"), service?.node_id)))).length > NUM.ZERO)))) ? this.addressManager.format(stryMutAct_9fa48("87923") ? service?.[COLUMN.NODE_ID] && service?.node_id : stryMutAct_9fa48("87922") ? false : stryMutAct_9fa48("87921") ? true : (stryCov_9fa48("87921", "87922", "87923"), (stryMutAct_9fa48("87924") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("87924"), service?.[COLUMN.NODE_ID])) || (stryMutAct_9fa48("87925") ? service.node_id : (stryCov_9fa48("87925"), service?.node_id))), ENTITY_TYPE.MESSAGE_GROUP, replicaId) : null;
          if (stryMutAct_9fa48("87928") ? !peerAddress && this.isLocalForwardTarget(replicaId, peerAddress) : stryMutAct_9fa48("87927") ? false : stryMutAct_9fa48("87926") ? true : (stryCov_9fa48("87926", "87927", "87928"), (stryMutAct_9fa48("87929") ? peerAddress : (stryCov_9fa48("87929"), !peerAddress)) || this.isLocalForwardTarget(replicaId, peerAddress))) {
            if (stryMutAct_9fa48("87930")) {
              {}
            } else {
              stryCov_9fa48("87930");
              continue;
            }
          }
          expectedAddressesByReplicaId.set(replicaId, peerAddress);
          if (stryMutAct_9fa48("87933") ? false : stryMutAct_9fa48("87932") ? true : stryMutAct_9fa48("87931") ? this.replicaIds.includes(replicaId) : (stryCov_9fa48("87931", "87932", "87933"), !this.replicaIds.includes(replicaId))) {
            if (stryMutAct_9fa48("87934")) {
              {}
            } else {
              stryCov_9fa48("87934");
              this.replicaIds.push(replicaId);
            }
          }
        }
      }
      const currentNodes = Array.isArray(this.raft.nodes) ? stryMutAct_9fa48("87935") ? [] : (stryCov_9fa48("87935"), [...this.raft.nodes]) : stryMutAct_9fa48("87936") ? ["Stryker was here"] : (stryCov_9fa48("87936"), []);
      const currentAddresses = new Set(stryMutAct_9fa48("87937") ? currentNodes.map(node => node?.address) : (stryCov_9fa48("87937"), currentNodes.map(stryMutAct_9fa48("87938") ? () => undefined : (stryCov_9fa48("87938"), node => stryMutAct_9fa48("87939") ? node.address : (stryCov_9fa48("87939"), node?.address))).filter(stryMutAct_9fa48("87940") ? () => undefined : (stryCov_9fa48("87940"), address => stryMutAct_9fa48("87943") ? typeof address === TYPEOF.STRING || address.length > NUM.ZERO : stryMutAct_9fa48("87942") ? false : stryMutAct_9fa48("87941") ? true : (stryCov_9fa48("87941", "87942", "87943"), (stryMutAct_9fa48("87945") ? typeof address !== TYPEOF.STRING : stryMutAct_9fa48("87944") ? true : (stryCov_9fa48("87944", "87945"), typeof address === TYPEOF.STRING)) && (stryMutAct_9fa48("87948") ? address.length <= NUM.ZERO : stryMutAct_9fa48("87947") ? address.length >= NUM.ZERO : stryMutAct_9fa48("87946") ? true : (stryCov_9fa48("87946", "87947", "87948"), address.length > NUM.ZERO)))))));
      for (const [replicaId, expectedAddress] of expectedAddressesByReplicaId.entries()) {
        if (stryMutAct_9fa48("87949")) {
          {}
        } else {
          stryCov_9fa48("87949");
          const staleAddresses = stryMutAct_9fa48("87950") ? currentNodes.map(node => node?.address) : (stryCov_9fa48("87950"), currentNodes.map(stryMutAct_9fa48("87951") ? () => undefined : (stryCov_9fa48("87951"), node => stryMutAct_9fa48("87952") ? node.address : (stryCov_9fa48("87952"), node?.address))).filter(address => {
            if (stryMutAct_9fa48("87953")) {
              {}
            } else {
              stryCov_9fa48("87953");
              if (stryMutAct_9fa48("87956") ? (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) && address === expectedAddress : stryMutAct_9fa48("87955") ? false : stryMutAct_9fa48("87954") ? true : (stryCov_9fa48("87954", "87955", "87956"), (stryMutAct_9fa48("87958") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("87957") ? false : (stryCov_9fa48("87957", "87958"), (stryMutAct_9fa48("87960") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("87959") ? false : (stryCov_9fa48("87959", "87960"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("87962") ? address.length !== NUM.ZERO : stryMutAct_9fa48("87961") ? false : (stryCov_9fa48("87961", "87962"), address.length === NUM.ZERO)))) || (stryMutAct_9fa48("87964") ? address !== expectedAddress : stryMutAct_9fa48("87963") ? false : (stryCov_9fa48("87963", "87964"), address === expectedAddress)))) {
                if (stryMutAct_9fa48("87965")) {
                  {}
                } else {
                  stryCov_9fa48("87965");
                  return stryMutAct_9fa48("87966") ? true : (stryCov_9fa48("87966"), false);
                }
              }
              try {
                if (stryMutAct_9fa48("87967")) {
                  {}
                } else {
                  stryCov_9fa48("87967");
                  const parsed = this.addressManager.parse(address);
                  return stryMutAct_9fa48("87970") ? parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP || parsed.serviceId === replicaId : stryMutAct_9fa48("87969") ? false : stryMutAct_9fa48("87968") ? true : (stryCov_9fa48("87968", "87969", "87970"), (stryMutAct_9fa48("87972") ? parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("87971") ? true : (stryCov_9fa48("87971", "87972"), parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("87974") ? parsed.serviceId !== replicaId : stryMutAct_9fa48("87973") ? true : (stryCov_9fa48("87973", "87974"), parsed.serviceId === replicaId)));
                }
              } catch (_error) {
                if (stryMutAct_9fa48("87975")) {
                  {}
                } else {
                  stryCov_9fa48("87975");
                  return stryMutAct_9fa48("87976") ? true : (stryCov_9fa48("87976"), false);
                }
              }
            }
          }));
          if (stryMutAct_9fa48("87979") ? typeof this.raft.leave !== TYPEOF.FUNCTION : stryMutAct_9fa48("87978") ? false : stryMutAct_9fa48("87977") ? true : (stryCov_9fa48("87977", "87978", "87979"), typeof this.raft.leave === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("87980")) {
              {}
            } else {
              stryCov_9fa48("87980");
              for (const staleAddress of staleAddresses) {
                if (stryMutAct_9fa48("87981")) {
                  {}
                } else {
                  stryCov_9fa48("87981");
                  this.raft.leave(staleAddress);
                  currentAddresses.delete(staleAddress);
                }
              }
            }
          }
          if (stryMutAct_9fa48("87984") ? false : stryMutAct_9fa48("87983") ? true : stryMutAct_9fa48("87982") ? currentAddresses.has(expectedAddress) : (stryCov_9fa48("87982", "87983", "87984"), !currentAddresses.has(expectedAddress))) {
            if (stryMutAct_9fa48("87985")) {
              {}
            } else {
              stryCov_9fa48("87985");
              this.raftProvider.joinPeer(this.raft, expectedAddress);
              currentAddresses.add(expectedAddress);
            }
          }
        }
      }
    }
  } /**
    * Initialize the message group service.
    * Creates liferaft instance and wires up events.
    * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
    * @return {Promise<void>}
    */
  async initialize() {
    if (stryMutAct_9fa48("87986")) {
      {}
    } else {
      stryCov_9fa48("87986");
      if (stryMutAct_9fa48("87988") ? false : stryMutAct_9fa48("87987") ? true : (stryCov_9fa48("87987", "87988"), this.initialized)) {
        if (stryMutAct_9fa48("87989")) {
          {}
        } else {
          stryCov_9fa48("87989");
          return;
        }
      }
      this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZING_MESSAGE_GROUP_SERVICE, stryMutAct_9fa48("87990") ? {} : (stryCov_9fa48("87990"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        replicaCount: this.replicaIds.length
      })); // Get Raft configuration from ConfigurationManager
      // Requirements: 7.1, 7.2, 7.3, 7.4
      const config = ConfigurationManager.getInstance();
      const heartbeatMs = stryMutAct_9fa48("87993") ? config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) && RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS : stryMutAct_9fa48("87992") ? false : stryMutAct_9fa48("87991") ? true : (stryCov_9fa48("87991", "87992", "87993"), config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) || RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS);
      const baseElectionMinMs = stryMutAct_9fa48("87996") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) && RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS : stryMutAct_9fa48("87995") ? false : stryMutAct_9fa48("87994") ? true : (stryCov_9fa48("87994", "87995", "87996"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) || RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS);
      const baseElectionMaxMs = stryMutAct_9fa48("87999") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) && RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS : stryMutAct_9fa48("87998") ? false : stryMutAct_9fa48("87997") ? true : (stryCov_9fa48("87997", "87998", "87999"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) || RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS);
      const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
      const {
        electionMinMs,
        electionMaxMs
      } = computeReplicaElectionTimeouts(stryMutAct_9fa48("88000") ? {} : (stryCov_9fa48("88000"), {
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS
      }));
      this.raftTimingConfig = stryMutAct_9fa48("88001") ? {} : (stryCov_9fa48("88001"), {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null
      }); // Create extended LifeRaft class with our transport using ES6 class inheritance
      // Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4
      const self = this;
      const deferElection = this.deferElection; /**
                                                * Custom Raft node class that extends LifeRaft with our transport.
                                                * Simplified to call messageRouter.deliver() directly without type conversion.
                                                * Supports deferred election start to prevent election storms during bootstrap.
                                                * Requirements: 3.1, 3.2, 3.3, 3.4
                                                */
      class RaftNode extends LifeRaft {
        /**
        * Override initialize to support deferred election start.
        * When deferElection is true, we don't start the heartbeat timer.
        * Call startElection() later to begin the election process.
        * @param {Object} _options - Initialization options (unused).
        * @param {Function} callback - Completion callback.
        */
        initialize(_options, callback) {
          if (stryMutAct_9fa48("88002")) {
            {}
          } else {
            stryCov_9fa48("88002");
            if (stryMutAct_9fa48("88004") ? false : stryMutAct_9fa48("88003") ? true : (stryCov_9fa48("88003", "88004"), deferElection)) {
              if (stryMutAct_9fa48("88005")) {
                {}
              } else {
                stryCov_9fa48("88005");
                // Don't start heartbeat timer - election will be started manually
                self.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.DEFERRING_ELECTION_START, stryMutAct_9fa48("88006") ? {} : (stryCov_9fa48("88006"), {
                  replicaId: self.replicaId,
                  groupId: self.groupId
                })); // Just signal initialization complete without starting timer
                if (stryMutAct_9fa48("88008") ? false : stryMutAct_9fa48("88007") ? true : (stryCov_9fa48("88007", "88008"), callback)) callback();
              }
            } else {
              if (stryMutAct_9fa48("88009")) {
                {}
              } else {
                stryCov_9fa48("88009");
                // Normal initialization - heartbeat timer will start automatically
                if (stryMutAct_9fa48("88011") ? false : stryMutAct_9fa48("88010") ? true : (stryCov_9fa48("88010", "88011"), callback)) callback();
              }
            }
          }
        } /**
          * Write method for sending Raft messages to peers.
          * Called by liferaft when it needs to communicate with other nodes.
          * Sends packets directly to MessageRouter without type conversion.
          * Note: When liferaft calls node.write(), 'this' is the cloned node
          * representing the peer, so 'this.address' is the destination address.
          * Requirements: 3.1, 3.2, 3.3, 3.4
          * @param {Object} packet - Raft protocol packet (packet.address is sender)
          * @param {Function} callback - Completion callback
          */
        write(packet, callback) {
          if (stryMutAct_9fa48("88012")) {
            {}
          } else {
            stryCov_9fa48("88012");
            // Build peer address for routing
            // this.address is the destination, packet.address is the sender
            const peerAddress = self.buildPeerAddress(this.address);
            const deliveryOptions = resolveTransportDeliveryOptions(peerAddress); // Send packet unchanged - no type conversion
            // Only add destination address for routing, preserve all packet fields
            // Requirements: 3.1, 3.2, 3.3
            self.transport.deliver(peerAddress, packet, deliveryOptions).then(stryMutAct_9fa48("88013") ? () => undefined : (stryCov_9fa48("88013"), result => callback(null, result))).catch(stryMutAct_9fa48("88014") ? () => undefined : (stryCov_9fa48("88014"), err => callback(err)));
          }
        }
      } // Create liferaft instance
      // Use unified address so that packet.address contains the full address
      // This allows other nodes to respond to vote requests correctly
      // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
      this.raft = new RaftNode(this.unifiedAddress, stryMutAct_9fa48("88015") ? {} : (stryCov_9fa48("88015"), {
        'heartbeat': heartbeatMs,
        'election min': electionMinMs,
        'election max': electionMaxMs,
        'Log': InMemoryLogAdapter
      }));
      this.armJoinExistingGroupElectionSuppression(); // If deferElection is true, clear all timers that liferaft started automatically
      // This prevents elections from starting until startElection() is called
      // Liferaft's _initialize() sets up a 'state change' handler that starts timers
      if (stryMutAct_9fa48("88018") ? this.deferElection || this.raft : stryMutAct_9fa48("88017") ? false : stryMutAct_9fa48("88016") ? true : (stryCov_9fa48("88016", "88017", "88018"), this.deferElection && this.raft)) {
        if (stryMutAct_9fa48("88019")) {
          {}
        } else {
          stryCov_9fa48("88019");
          this.raftProvider.clearTimers(this.raft, MESSAGE_GROUP_SERVICE_LITERAL.HEARTBEAT_ELECTION);
          this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.CLEARED_LIFERAFT_TIMERS_FOR_DEFERRED_ELECTION, stryMutAct_9fa48("88020") ? {} : (stryCov_9fa48("88020"), {
            replicaId: this.replicaId,
            groupId: this.groupId
          }));
        }
      } // Wrap post-raft-creation setup so that if peer resolution or any
      // subsequent step throws, we clean up the raft instance and its
      // timers. Without this, a failed initialize() leaks liferaft timers
      // that keep the Node.js process alive indefinitely.
      try {
        if (stryMutAct_9fa48("88021")) {
          {}
        } else {
          stryCov_9fa48("88021");
          this.wireRaftEvents();
          this.joinPeerNodes();
          this.reconcileRaftPeersFromCache();
          this.promoteIfSingleReplica();
        }
      } catch (error) {
        if (stryMutAct_9fa48("88022")) {
          {}
        } else {
          stryCov_9fa48("88022");
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT, stryMutAct_9fa48("88023") ? {} : (stryCov_9fa48("88023"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message
          }));
          if (stryMutAct_9fa48("88025") ? false : stryMutAct_9fa48("88024") ? true : (stryCov_9fa48("88024", "88025"), this.raft)) {
            if (stryMutAct_9fa48("88026")) {
              {}
            } else {
              stryCov_9fa48("88026");
              this.raftProvider.shutdownNode(this.raft);
              this.raft = null;
            }
          }
          throw error;
        }
      }
      this.cdcHandler.initialize();
      this.initialized = stryMutAct_9fa48("88027") ? false : (stryCov_9fa48("88027"), true);
      this.maybeInitializeRebalancer();
      this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_GROUP_SERVICE_INITIALIZED, stryMutAct_9fa48("88028") ? {} : (stryCov_9fa48("88028"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        role: this.role
      }));
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED, stryMutAct_9fa48("88029") ? {} : (stryCov_9fa48("88029"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));
    }
  } /**
    * Wire up liferaft event handlers for role changes, commits, etc.
    * Extracted from initialize() for clarity and safe cleanup on failure.
    * Requirements: 5.1, 5.2, 5.3, 5.4
    * @private
    */
  wireRaftEvents() {
    if (stryMutAct_9fa48("88030")) {
      {}
    } else {
      stryCov_9fa48("88030");
      const shouldIgnoreLeaderEvent = () => {
        if (stryMutAct_9fa48("88031")) {
          {}
        } else {
          stryCov_9fa48("88031");
          if (stryMutAct_9fa48("88034") ? false : stryMutAct_9fa48("88033") ? true : stryMutAct_9fa48("88032") ? this.shouldSuppressJoinPhaseRaftParticipation() : (stryCov_9fa48("88032", "88033", "88034"), !this.shouldSuppressJoinPhaseRaftParticipation())) {
            if (stryMutAct_9fa48("88035")) {
              {}
            } else {
              stryCov_9fa48("88035");
              return stryMutAct_9fa48("88036") ? true : (stryCov_9fa48("88036"), false);
            }
          }
          this.clearJoinExistingGroupTimers();
          return stryMutAct_9fa48("88037") ? false : (stryCov_9fa48("88037"), true);
        }
      };
      const shouldIgnoreDemotionEvent = eventName => {
        if (stryMutAct_9fa48("88038")) {
          {}
        } else {
          stryCov_9fa48("88038");
          if (stryMutAct_9fa48("88041") ? false : stryMutAct_9fa48("88040") ? true : stryMutAct_9fa48("88039") ? this.shouldSuppressJoinPhaseRaftParticipation() : (stryCov_9fa48("88039", "88040", "88041"), !this.shouldSuppressJoinPhaseRaftParticipation())) {
            if (stryMutAct_9fa48("88042")) {
              {}
            } else {
              stryCov_9fa48("88042");
              return stryMutAct_9fa48("88043") ? true : (stryCov_9fa48("88043"), false);
            }
          }
          if (stryMutAct_9fa48("88046") ? eventName !== RAFT_EVENT.FOLLOWER || eventName !== RAFT_EVENT.CANDIDATE : stryMutAct_9fa48("88045") ? false : stryMutAct_9fa48("88044") ? true : (stryCov_9fa48("88044", "88045", "88046"), (stryMutAct_9fa48("88048") ? eventName === RAFT_EVENT.FOLLOWER : stryMutAct_9fa48("88047") ? true : (stryCov_9fa48("88047", "88048"), eventName !== RAFT_EVENT.FOLLOWER)) && (stryMutAct_9fa48("88050") ? eventName === RAFT_EVENT.CANDIDATE : stryMutAct_9fa48("88049") ? true : (stryCov_9fa48("88049", "88050"), eventName !== RAFT_EVENT.CANDIDATE)))) {
            if (stryMutAct_9fa48("88051")) {
              {}
            } else {
              stryCov_9fa48("88051");
              return stryMutAct_9fa48("88052") ? true : (stryCov_9fa48("88052"), false);
            }
          }
          if (stryMutAct_9fa48("88054") ? false : stryMutAct_9fa48("88053") ? true : (stryCov_9fa48("88053", "88054"), this.raft)) {
            if (stryMutAct_9fa48("88055")) {
              {}
            } else {
              stryCov_9fa48("88055");
              this.raftProvider.clearTimers(this.raft, stryMutAct_9fa48("88056") ? "" : (stryCov_9fa48("88056"), 'heartbeat, election'));
            }
          }
          return stryMutAct_9fa48("88057") ? false : (stryCov_9fa48("88057"), true);
        }
      };
      wireReplicaLifecycleEvents(this, stryMutAct_9fa48("88058") ? {} : (stryCov_9fa48("88058"), {
        events: RAFT_EVENT,
        roles: RaftRole,
        getCurrentTerm: stryMutAct_9fa48("88059") ? () => undefined : (stryCov_9fa48("88059"), () => this.raftProvider.getCurrentTerm(this.raft)),
        normalizeLeaderId: stryMutAct_9fa48("88060") ? () => undefined : (stryCov_9fa48("88060"), candidate => this.normalizeLeaderReplicaId(candidate)),
        shouldIgnoreLeaderEvent,
        shouldIgnoreDemotionEvent,
        onLeader: ({
          term
        }) => {
          if (stryMutAct_9fa48("88061")) {
            {}
          } else {
            stryCov_9fa48("88061");
            this.operationLedger.currentTerm = term;
            this.scheduleLeaderOwnedActivation(term);
          }
        },
        onFollower: ({
          term
        }) => {
          if (stryMutAct_9fa48("88062")) {
            {}
          } else {
            stryCov_9fa48("88062");
            this.cancelLeaderOwnedActivation();
            this.updateRebalancerLeadership();
            this.operationLedger.currentTerm = term;
            this.lastLeaderCdcResubscribeTerm = undefined;
          }
        },
        onCandidate: ({
          term
        }) => {
          if (stryMutAct_9fa48("88063")) {
            {}
          } else {
            stryCov_9fa48("88063");
            this.cancelLeaderOwnedActivation();
            this.updateRebalancerLeadership();
            this.operationLedger.currentTerm = term;
            this.lastLeaderCdcResubscribeTerm = undefined;
          }
        },
        onCommit: command => {
          if (stryMutAct_9fa48("88064")) {
            {}
          } else {
            stryCov_9fa48("88064");
            this.applyCommittedEntry(command);
          }
        },
        onLeaderChange: ({
          leaderId
        }) => {
          if (stryMutAct_9fa48("88065")) {
            {}
          } else {
            stryCov_9fa48("88065");
            this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.LEADER_CHANGED, stryMutAct_9fa48("88066") ? {} : (stryCov_9fa48("88066"), {
              newLeader: leaderId,
              groupId: this.groupId
            }));
          }
        },
        onTermChange: ({
          term
        }) => {
          if (stryMutAct_9fa48("88067")) {
            {}
          } else {
            stryCov_9fa48("88067");
            this.operationLedger.currentTerm = term;
          }
        }
      }));
    }
  } /**
    * Join peer nodes in the Raft group.
    * Resolves peer addresses and joins them via liferaft.
    * @private
    */
  joinPeerNodes() {
    if (stryMutAct_9fa48("88068")) {
      {}
    } else {
      stryCov_9fa48("88068");
      for (const peerId of this.replicaIds) {
        if (stryMutAct_9fa48("88069")) {
          {}
        } else {
          stryCov_9fa48("88069");
          if (stryMutAct_9fa48("88072") ? peerId === this.replicaId && !this.resolvePeerAddressFromCache(peerId) || !this.resolvePeerAddressFromHints(peerId) : stryMutAct_9fa48("88071") ? false : stryMutAct_9fa48("88070") ? true : (stryCov_9fa48("88070", "88071", "88072"), (stryMutAct_9fa48("88074") ? peerId === this.replicaId || !this.resolvePeerAddressFromCache(peerId) : stryMutAct_9fa48("88073") ? true : (stryCov_9fa48("88073", "88074"), (stryMutAct_9fa48("88076") ? peerId !== this.replicaId : stryMutAct_9fa48("88075") ? true : (stryCov_9fa48("88075", "88076"), peerId === this.replicaId)) && (stryMutAct_9fa48("88077") ? this.resolvePeerAddressFromCache(peerId) : (stryCov_9fa48("88077"), !this.resolvePeerAddressFromCache(peerId))))) && (stryMutAct_9fa48("88078") ? this.resolvePeerAddressFromHints(peerId) : (stryCov_9fa48("88078"), !this.resolvePeerAddressFromHints(peerId))))) {
            if (stryMutAct_9fa48("88079")) {
              {}
            } else {
              stryCov_9fa48("88079");
              continue;
            }
          }
          const peerAddress = this.buildPeerAddress(peerId, stryMutAct_9fa48("88080") ? {} : (stryCov_9fa48("88080"), {
            allowBootstrapHints: stryMutAct_9fa48("88081") ? false : (stryCov_9fa48("88081"), true)
          }));
          if (stryMutAct_9fa48("88083") ? false : stryMutAct_9fa48("88082") ? true : (stryCov_9fa48("88082", "88083"), this.isLocalForwardTarget(peerId, peerAddress))) {
            if (stryMutAct_9fa48("88084")) {
              {}
            } else {
              stryCov_9fa48("88084");
              continue;
            }
          }
          this.raftProvider.joinPeer(this.raft, peerAddress);
        }
      }
    }
  } /**
    * For single-replica groups, promote to leader immediately.
    * This avoids the election timer delay during bootstrap.
    * @private
    */
  promoteIfSingleReplica() {
    if (stryMutAct_9fa48("88085")) {
      {}
    } else {
      stryCov_9fa48("88085");
      if (stryMutAct_9fa48("88088") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("88087") ? false : stryMutAct_9fa48("88086") ? true : (stryCov_9fa48("88086", "88087", "88088"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("88089")) {
          {}
        } else {
          stryCov_9fa48("88089");
          this.role = RaftRole.LEADER;
          this.isLeader = stryMutAct_9fa48("88090") ? false : (stryCov_9fa48("88090"), true);
          this.leaderId = this.replicaId;
          this.queueRoleUpdate(this.role);
          this.queueLeaderNodeUpdate(this.nodeId);
          this.updateRebalancerLeadership();
          this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.SINGLE_REPLICA_BECOMING_LEADER_IMMEDIATELY, stryMutAct_9fa48("88091") ? {} : (stryCov_9fa48("88091"), {
            replicaId: this.replicaId,
            groupId: this.groupId
          }));
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED, stryMutAct_9fa48("88092") ? {} : (stryCov_9fa48("88092"), {
            leaderId: this.replicaId,
            term: this.raftProvider.getCurrentTerm(this.raft),
            groupId: this.groupId
          }));
        }
      }
    }
  } /**
    * Start the Raft election timer.
    * Call this after all replicas in the group have been created and registered.
    * This prevents election storms when multiple replicas are created on the same node.
    * If deferElection was false, this is a no-op (election already started).
    */
  startElection() {
    if (stryMutAct_9fa48("88093")) {
      {}
    } else {
      stryCov_9fa48("88093");
      if (stryMutAct_9fa48("88095") ? false : stryMutAct_9fa48("88094") ? true : (stryCov_9fa48("88094", "88095"), this.electionStarted)) {
        if (stryMutAct_9fa48("88096")) {
          {}
        } else {
          stryCov_9fa48("88096");
          return;
        }
      } // For single-replica groups, we're already leader
      if (stryMutAct_9fa48("88099") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("88098") ? false : stryMutAct_9fa48("88097") ? true : (stryCov_9fa48("88097", "88098", "88099"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("88100")) {
          {}
        } else {
          stryCov_9fa48("88100");
          this.electionStarted = stryMutAct_9fa48("88101") ? false : (stryCov_9fa48("88101"), true);
          return;
        }
      }
      this.electionStarted = stryMutAct_9fa48("88102") ? false : (stryCov_9fa48("88102"), true);
      if (stryMutAct_9fa48("88104") ? false : stryMutAct_9fa48("88103") ? true : (stryCov_9fa48("88103", "88104"), this.raft)) {
        if (stryMutAct_9fa48("88105")) {
          {}
        } else {
          stryCov_9fa48("88105");
          this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.STARTING_RAFT_ELECTION_TIMER, stryMutAct_9fa48("88106") ? {} : (stryCov_9fa48("88106"), {
            replicaId: this.replicaId,
            groupId: this.groupId,
            peerCount: stryMutAct_9fa48("88107") ? this.replicaIds.length + NUM.ONE : (stryCov_9fa48("88107"), this.replicaIds.length - NUM.ONE)
          }));
          this.raftProvider.startElectionTimer(this.raft);
        }
      }
    }
  }
  clearJoinExistingGroupTimers() {
    if (stryMutAct_9fa48("88108")) {
      {}
    } else {
      stryCov_9fa48("88108");
      if (stryMutAct_9fa48("88111") ? false : stryMutAct_9fa48("88110") ? true : stryMutAct_9fa48("88109") ? this.raft : (stryCov_9fa48("88109", "88110", "88111"), !this.raft)) {
        if (stryMutAct_9fa48("88112")) {
          {}
        } else {
          stryCov_9fa48("88112");
          return;
        }
      }
      this.raftProvider.clearTimers(this.raft, MESSAGE_GROUP_SERVICE_LITERAL.HEARTBEAT_ELECTION);
    }
  }
  shouldSuppressJoinPhaseRaftParticipation() {
    if (stryMutAct_9fa48("88113")) {
      {}
    } else {
      stryCov_9fa48("88113");
      return stryMutAct_9fa48("88116") ? this.isJoiningExistingGroup === true && this.deferElectionUntilJoinConvergence === true : stryMutAct_9fa48("88115") ? false : stryMutAct_9fa48("88114") ? true : (stryCov_9fa48("88114", "88115", "88116"), (stryMutAct_9fa48("88118") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("88117") ? false : (stryCov_9fa48("88117", "88118"), this.isJoiningExistingGroup === (stryMutAct_9fa48("88119") ? false : (stryCov_9fa48("88119"), true)))) || (stryMutAct_9fa48("88121") ? this.deferElectionUntilJoinConvergence !== true : stryMutAct_9fa48("88120") ? false : (stryCov_9fa48("88120", "88121"), this.deferElectionUntilJoinConvergence === (stryMutAct_9fa48("88122") ? false : (stryCov_9fa48("88122"), true)))));
    }
  }
  armJoinExistingGroupElectionSuppression() {
    if (stryMutAct_9fa48("88123")) {
      {}
    } else {
      stryCov_9fa48("88123");
      if (stryMutAct_9fa48("88126") ? (!this.raft || !this.shouldSuppressJoinPhaseRaftParticipation()) && this.joinSuppressedHeartbeat : stryMutAct_9fa48("88125") ? false : stryMutAct_9fa48("88124") ? true : (stryCov_9fa48("88124", "88125", "88126"), (stryMutAct_9fa48("88128") ? !this.raft && !this.shouldSuppressJoinPhaseRaftParticipation() : stryMutAct_9fa48("88127") ? false : (stryCov_9fa48("88127", "88128"), (stryMutAct_9fa48("88129") ? this.raft : (stryCov_9fa48("88129"), !this.raft)) || (stryMutAct_9fa48("88130") ? this.shouldSuppressJoinPhaseRaftParticipation() : (stryCov_9fa48("88130"), !this.shouldSuppressJoinPhaseRaftParticipation())))) || this.joinSuppressedHeartbeat)) {
        if (stryMutAct_9fa48("88131")) {
          {}
        } else {
          stryCov_9fa48("88131");
          return;
        }
      }
      const originalHeartbeat = this.raft.heartbeat;
      if (stryMutAct_9fa48("88134") ? typeof originalHeartbeat === TYPEOF.FUNCTION : stryMutAct_9fa48("88133") ? false : stryMutAct_9fa48("88132") ? true : (stryCov_9fa48("88132", "88133", "88134"), typeof originalHeartbeat !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("88135")) {
          {}
        } else {
          stryCov_9fa48("88135");
          return;
        }
      }
      const boundHeartbeat = originalHeartbeat.bind(this.raft);
      this.joinSuppressedHeartbeat = boundHeartbeat;
      this.raft.heartbeat = duration => {
        if (stryMutAct_9fa48("88136")) {
          {}
        } else {
          stryCov_9fa48("88136");
          if (stryMutAct_9fa48("88138") ? false : stryMutAct_9fa48("88137") ? true : (stryCov_9fa48("88137", "88138"), this.shouldSuppressJoinPhaseRaftParticipation())) {
            if (stryMutAct_9fa48("88139")) {
              {}
            } else {
              stryCov_9fa48("88139");
              this.clearJoinExistingGroupTimers();
              return this.raft;
            }
          }
          return boundHeartbeat(duration);
        }
      };
      this.clearJoinExistingGroupTimers();
    }
  }
  releaseJoinExistingGroupElectionSuppression() {
    if (stryMutAct_9fa48("88140")) {
      {}
    } else {
      stryCov_9fa48("88140");
      if (stryMutAct_9fa48("88143") ? !this.raft && !this.joinSuppressedHeartbeat : stryMutAct_9fa48("88142") ? false : stryMutAct_9fa48("88141") ? true : (stryCov_9fa48("88141", "88142", "88143"), (stryMutAct_9fa48("88144") ? this.raft : (stryCov_9fa48("88144"), !this.raft)) || (stryMutAct_9fa48("88145") ? this.joinSuppressedHeartbeat : (stryCov_9fa48("88145"), !this.joinSuppressedHeartbeat)))) {
        if (stryMutAct_9fa48("88146")) {
          {}
        } else {
          stryCov_9fa48("88146");
          return;
        }
      }
      this.raft.heartbeat = this.joinSuppressedHeartbeat;
      this.joinSuppressedHeartbeat = null;
    }
  } /**
    * Release join-time election suppression once the local node has completed
    * convergence and may participate normally in control-plane leadership.
    * @return {void}
    */
  completeJoinConvergence() {
    if (stryMutAct_9fa48("88147")) {
      {}
    } else {
      stryCov_9fa48("88147");
      const wasJoiningExistingGroup = stryMutAct_9fa48("88150") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("88149") ? false : stryMutAct_9fa48("88148") ? true : (stryCov_9fa48("88148", "88149", "88150"), this.isJoiningExistingGroup === (stryMutAct_9fa48("88151") ? false : (stryCov_9fa48("88151"), true)));
      const shouldReleaseDeferredElection = stryMutAct_9fa48("88154") ? this.deferElectionUntilJoinConvergence !== true : stryMutAct_9fa48("88153") ? false : stryMutAct_9fa48("88152") ? true : (stryCov_9fa48("88152", "88153", "88154"), this.deferElectionUntilJoinConvergence === (stryMutAct_9fa48("88155") ? false : (stryCov_9fa48("88155"), true)));
      if (stryMutAct_9fa48("88158") ? !wasJoiningExistingGroup || !shouldReleaseDeferredElection : stryMutAct_9fa48("88157") ? false : stryMutAct_9fa48("88156") ? true : (stryCov_9fa48("88156", "88157", "88158"), (stryMutAct_9fa48("88159") ? wasJoiningExistingGroup : (stryCov_9fa48("88159"), !wasJoiningExistingGroup)) && (stryMutAct_9fa48("88160") ? shouldReleaseDeferredElection : (stryCov_9fa48("88160"), !shouldReleaseDeferredElection)))) {
        if (stryMutAct_9fa48("88161")) {
          {}
        } else {
          stryCov_9fa48("88161");
          return;
        }
      }
      this.deferElection = stryMutAct_9fa48("88162") ? true : (stryCov_9fa48("88162"), false);
      this.releaseJoinExistingGroupElectionSuppression();
      if (stryMutAct_9fa48("88164") ? false : stryMutAct_9fa48("88163") ? true : (stryCov_9fa48("88163", "88164"), wasJoiningExistingGroup)) {
        if (stryMutAct_9fa48("88165")) {
          {}
        } else {
          stryCov_9fa48("88165");
          this.isJoiningExistingGroup = stryMutAct_9fa48("88166") ? true : (stryCov_9fa48("88166"), false);
          if (stryMutAct_9fa48("88169") ? this.role === RaftRole.LEADER : stryMutAct_9fa48("88168") ? false : stryMutAct_9fa48("88167") ? true : (stryCov_9fa48("88167", "88168", "88169"), this.role !== RaftRole.LEADER)) {
            if (stryMutAct_9fa48("88170")) {
              {}
            } else {
              stryCov_9fa48("88170");
              this.role = RaftRole.FOLLOWER;
              this.isLeader = stryMutAct_9fa48("88171") ? true : (stryCov_9fa48("88171"), false);
              if (stryMutAct_9fa48("88174") ? this.leaderId !== this.replicaId : stryMutAct_9fa48("88173") ? false : stryMutAct_9fa48("88172") ? true : (stryCov_9fa48("88172", "88173", "88174"), this.leaderId === this.replicaId)) {
                if (stryMutAct_9fa48("88175")) {
                  {}
                } else {
                  stryCov_9fa48("88175");
                  this.leaderId = null;
                }
              }
              this.queueRoleUpdate(this.role);
            }
          }
        }
      }
      if (stryMutAct_9fa48("88177") ? false : stryMutAct_9fa48("88176") ? true : (stryCov_9fa48("88176", "88177"), shouldReleaseDeferredElection)) {
        if (stryMutAct_9fa48("88178")) {
          {}
        } else {
          stryCov_9fa48("88178");
          this.deferElectionUntilJoinConvergence = stryMutAct_9fa48("88179") ? true : (stryCov_9fa48("88179"), false);
        }
      }
      this.startElection();
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
    if (stryMutAct_9fa48("88180")) {
      {}
    } else {
      stryCov_9fa48("88180");
      const heartbeatMs = timingConfig.heartbeatIntervalMs;
      const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
      const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
      const previousTickIntervalMs = stryMutAct_9fa48("88183") ? this.raftTimingConfig?.tickIntervalMs && null : stryMutAct_9fa48("88182") ? false : stryMutAct_9fa48("88181") ? true : (stryCov_9fa48("88181", "88182", "88183"), (stryMutAct_9fa48("88184") ? this.raftTimingConfig.tickIntervalMs : (stryCov_9fa48("88184"), this.raftTimingConfig?.tickIntervalMs)) || null);
      const hasTickInterval = Object.prototype.hasOwnProperty.call(timingConfig, stryMutAct_9fa48("88185") ? "" : (stryCov_9fa48("88185"), 'tickIntervalMs'));
      const tickIntervalMs = timingConfig.tickIntervalMs;
      if (stryMutAct_9fa48("88188") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs) || !Number.isFinite(baseElectionMaxMs) || hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO)) && baseElectionMinMs > baseElectionMaxMs : stryMutAct_9fa48("88187") ? false : stryMutAct_9fa48("88186") ? true : (stryCov_9fa48("88186", "88187", "88188"), (stryMutAct_9fa48("88190") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs) || !Number.isFinite(baseElectionMaxMs)) && hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO) : stryMutAct_9fa48("88189") ? false : (stryCov_9fa48("88189", "88190"), (stryMutAct_9fa48("88192") ? (!Number.isFinite(heartbeatMs) || !Number.isFinite(baseElectionMinMs)) && !Number.isFinite(baseElectionMaxMs) : stryMutAct_9fa48("88191") ? false : (stryCov_9fa48("88191", "88192"), (stryMutAct_9fa48("88194") ? !Number.isFinite(heartbeatMs) && !Number.isFinite(baseElectionMinMs) : stryMutAct_9fa48("88193") ? false : (stryCov_9fa48("88193", "88194"), (stryMutAct_9fa48("88195") ? Number.isFinite(heartbeatMs) : (stryCov_9fa48("88195"), !Number.isFinite(heartbeatMs))) || (stryMutAct_9fa48("88196") ? Number.isFinite(baseElectionMinMs) : (stryCov_9fa48("88196"), !Number.isFinite(baseElectionMinMs))))) || (stryMutAct_9fa48("88197") ? Number.isFinite(baseElectionMaxMs) : (stryCov_9fa48("88197"), !Number.isFinite(baseElectionMaxMs))))) || (stryMutAct_9fa48("88199") ? hasTickInterval || !Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("88198") ? false : (stryCov_9fa48("88198", "88199"), hasTickInterval && (stryMutAct_9fa48("88201") ? !Number.isFinite(tickIntervalMs) && tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("88200") ? true : (stryCov_9fa48("88200", "88201"), (stryMutAct_9fa48("88202") ? Number.isFinite(tickIntervalMs) : (stryCov_9fa48("88202"), !Number.isFinite(tickIntervalMs))) || (stryMutAct_9fa48("88205") ? tickIntervalMs > NUM.ZERO : stryMutAct_9fa48("88204") ? tickIntervalMs < NUM.ZERO : stryMutAct_9fa48("88203") ? false : (stryCov_9fa48("88203", "88204", "88205"), tickIntervalMs <= NUM.ZERO)))))))) || (stryMutAct_9fa48("88208") ? baseElectionMinMs <= baseElectionMaxMs : stryMutAct_9fa48("88207") ? baseElectionMinMs >= baseElectionMaxMs : stryMutAct_9fa48("88206") ? false : (stryCov_9fa48("88206", "88207", "88208"), baseElectionMinMs > baseElectionMaxMs)))) {
        if (stryMutAct_9fa48("88209")) {
          {}
        } else {
          stryCov_9fa48("88209");
          return stryMutAct_9fa48("88210") ? true : (stryCov_9fa48("88210"), false);
        }
      }
      const {
        electionMinMs,
        electionMaxMs,
        jitterMs
      } = computeReplicaElectionTimeouts(stryMutAct_9fa48("88211") ? {} : (stryCov_9fa48("88211"), {
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS
      }));
      this.raftTimingConfig = stryMutAct_9fa48("88212") ? {} : (stryCov_9fa48("88212"), {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ? tickIntervalMs : stryMutAct_9fa48("88215") ? this.raftTimingConfig?.tickIntervalMs && null : stryMutAct_9fa48("88214") ? false : stryMutAct_9fa48("88213") ? true : (stryCov_9fa48("88213", "88214", "88215"), (stryMutAct_9fa48("88216") ? this.raftTimingConfig.tickIntervalMs : (stryCov_9fa48("88216"), this.raftTimingConfig?.tickIntervalMs)) || null)
      });
      const shouldRearmTimer = stryMutAct_9fa48("88219") ? this.replicaIds.length > NUM.ONE || !this.deferElection || this.electionStarted : stryMutAct_9fa48("88218") ? false : stryMutAct_9fa48("88217") ? true : (stryCov_9fa48("88217", "88218", "88219"), (stryMutAct_9fa48("88222") ? this.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("88221") ? this.replicaIds.length >= NUM.ONE : stryMutAct_9fa48("88220") ? true : (stryCov_9fa48("88220", "88221", "88222"), this.replicaIds.length > NUM.ONE)) && (stryMutAct_9fa48("88224") ? !this.deferElection && this.electionStarted : stryMutAct_9fa48("88223") ? true : (stryCov_9fa48("88223", "88224"), (stryMutAct_9fa48("88225") ? this.deferElection : (stryCov_9fa48("88225"), !this.deferElection)) || this.electionStarted)));
      const applied = applyRuntimeRaftTiming(stryMutAct_9fa48("88226") ? {} : (stryCov_9fa48("88226"), {
        raft: this.raft,
        heartbeatMs,
        electionMinMs,
        electionMaxMs,
        rearmTimer: shouldRearmTimer
      }));
      if (stryMutAct_9fa48("88229") ? false : stryMutAct_9fa48("88228") ? true : stryMutAct_9fa48("88227") ? applied : (stryCov_9fa48("88227", "88228", "88229"), !applied)) {
        if (stryMutAct_9fa48("88230")) {
          {}
        } else {
          stryCov_9fa48("88230");
          return stryMutAct_9fa48("88231") ? true : (stryCov_9fa48("88231"), false);
        }
      }
      const tickChanged = stryMutAct_9fa48("88234") ? hasTickInterval || tickIntervalMs !== previousTickIntervalMs : stryMutAct_9fa48("88233") ? false : stryMutAct_9fa48("88232") ? true : (stryCov_9fa48("88232", "88233", "88234"), hasTickInterval && (stryMutAct_9fa48("88236") ? tickIntervalMs === previousTickIntervalMs : stryMutAct_9fa48("88235") ? true : (stryCov_9fa48("88235", "88236"), tickIntervalMs !== previousTickIntervalMs)));
      const tickRuntimeApplied = stryMutAct_9fa48("88239") ? !tickChanged && this.applyRuntimeTickInterval(tickIntervalMs) : stryMutAct_9fa48("88238") ? false : stryMutAct_9fa48("88237") ? true : (stryCov_9fa48("88237", "88238", "88239"), (stryMutAct_9fa48("88240") ? tickChanged : (stryCov_9fa48("88240"), !tickChanged)) || this.applyRuntimeTickInterval(tickIntervalMs));
      this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION, stryMutAct_9fa48("88241") ? {} : (stryCov_9fa48("88241"), {
        groupId: this.groupId,
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
    if (stryMutAct_9fa48("88242")) {
      {}
    } else {
      stryCov_9fa48("88242");
      if (stryMutAct_9fa48("88245") ? (!this.raft || !Number.isFinite(tickIntervalMs)) && tickIntervalMs <= NUM.ZERO : stryMutAct_9fa48("88244") ? false : stryMutAct_9fa48("88243") ? true : (stryCov_9fa48("88243", "88244", "88245"), (stryMutAct_9fa48("88247") ? !this.raft && !Number.isFinite(tickIntervalMs) : stryMutAct_9fa48("88246") ? false : (stryCov_9fa48("88246", "88247"), (stryMutAct_9fa48("88248") ? this.raft : (stryCov_9fa48("88248"), !this.raft)) || (stryMutAct_9fa48("88249") ? Number.isFinite(tickIntervalMs) : (stryCov_9fa48("88249"), !Number.isFinite(tickIntervalMs))))) || (stryMutAct_9fa48("88252") ? tickIntervalMs > NUM.ZERO : stryMutAct_9fa48("88251") ? tickIntervalMs < NUM.ZERO : stryMutAct_9fa48("88250") ? false : (stryCov_9fa48("88250", "88251", "88252"), tickIntervalMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("88253")) {
          {}
        } else {
          stryCov_9fa48("88253");
          return stryMutAct_9fa48("88254") ? true : (stryCov_9fa48("88254"), false);
        }
      }
      if (stryMutAct_9fa48("88257") ? typeof this.raft.setTickInterval !== TYPEOF.FUNCTION : stryMutAct_9fa48("88256") ? false : stryMutAct_9fa48("88255") ? true : (stryCov_9fa48("88255", "88256", "88257"), typeof this.raft.setTickInterval === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("88258")) {
          {}
        } else {
          stryCov_9fa48("88258");
          this.raft.setTickInterval(tickIntervalMs);
          return stryMutAct_9fa48("88259") ? false : (stryCov_9fa48("88259"), true);
        }
      }
      if (stryMutAct_9fa48("88262") ? typeof this.raft.configureTickInterval !== TYPEOF.FUNCTION : stryMutAct_9fa48("88261") ? false : stryMutAct_9fa48("88260") ? true : (stryCov_9fa48("88260", "88261", "88262"), typeof this.raft.configureTickInterval === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("88263")) {
          {}
        } else {
          stryCov_9fa48("88263");
          this.raft.configureTickInterval(tickIntervalMs);
          return stryMutAct_9fa48("88264") ? false : (stryCov_9fa48("88264"), true);
        }
      }
      if (stryMutAct_9fa48("88266") ? false : stryMutAct_9fa48("88265") ? true : (stryCov_9fa48("88265", "88266"), Object.prototype.hasOwnProperty.call(this.raft, MESSAGE_GROUP_SERVICE_LITERAL.TICKINTERVALMS))) {
        if (stryMutAct_9fa48("88267")) {
          {}
        } else {
          stryCov_9fa48("88267");
          this.raft.tickIntervalMs = tickIntervalMs;
          return stryMutAct_9fa48("88268") ? false : (stryCov_9fa48("88268"), true);
        }
      }
      return stryMutAct_9fa48("88269") ? true : (stryCov_9fa48("88269"), false);
    }
  } /**
    * Apply a committed entry to the state machine.
    * This is called by liferaft when an entry is committed.
    * Requirements: 6.1, 6.2, 6.4, 6.5
    * @param {Object} command - The committed command
    */
  applyCommittedEntry(command) {
    if (stryMutAct_9fa48("88270")) {
      {}
    } else {
      stryCov_9fa48("88270");
      if (stryMutAct_9fa48("88273") ? !command && !command.type : stryMutAct_9fa48("88272") ? false : stryMutAct_9fa48("88271") ? true : (stryCov_9fa48("88271", "88272", "88273"), (stryMutAct_9fa48("88274") ? command : (stryCov_9fa48("88274"), !command)) || (stryMutAct_9fa48("88275") ? command.type : (stryCov_9fa48("88275"), !command.type)))) {
        if (stryMutAct_9fa48("88276")) {
          {}
        } else {
          stryCov_9fa48("88276");
          return;
        }
      }
      switch (command.type) {
        case MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE:
          if (stryMutAct_9fa48("88277")) {} else {
            stryCov_9fa48("88277");
            // Handle message persistence - already tracked in pendingMessages
            break;
          }
        case MESSAGE_GROUP_SERVICE_LITERAL.CDC:
          if (stryMutAct_9fa48("88278")) {} else {
            stryCov_9fa48("88278");
            this.cdcHandler.applyImmediate(stryMutAct_9fa48("88279") ? {} : (stryCov_9fa48("88279"), {
              tableName: command.tableName,
              operation: command.operation,
              data: command.data,
              timestamp: stryMutAct_9fa48("88282") ? command.timestamp && this.hlcClock.now().toString() : stryMutAct_9fa48("88281") ? false : stryMutAct_9fa48("88280") ? true : (stryCov_9fa48("88280", "88281", "88282"), command.timestamp || this.hlcClock.now().toString()),
              causeId: normalizeCauseId(command.causeId)
            }), stryMutAct_9fa48("88283") ? {} : (stryCov_9fa48("88283"), {
              skipSubscriptionCheck: stryMutAct_9fa48("88284") ? false : (stryCov_9fa48("88284"), true)
            }));
            this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, command);
            break;
          }
        case CDC_BATCH_COMMAND_TYPE:
          if (stryMutAct_9fa48("88285")) {} else {
            stryCov_9fa48("88285");
            for (const event of this.normalizeCDCBatchEvents(command.events)) {
              if (stryMutAct_9fa48("88286")) {
                {}
              } else {
                stryCov_9fa48("88286");
                this.cdcHandler.applyImmediate(stryMutAct_9fa48("88287") ? {} : (stryCov_9fa48("88287"), {
                  tableName: event.tableName,
                  operation: event.operation,
                  data: event.data,
                  timestamp: event.timestamp,
                  causeId: normalizeCauseId(event.causeId)
                }), stryMutAct_9fa48("88288") ? {} : (stryCov_9fa48("88288"), {
                  skipSubscriptionCheck: stryMutAct_9fa48("88289") ? false : (stryCov_9fa48("88289"), true)
                }));
                this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, stryMutAct_9fa48("88290") ? {} : (stryCov_9fa48("88290"), {
                  tableName: event.tableName,
                  operation: event.operation,
                  data: event.data,
                  logIndex: stryMutAct_9fa48("88293") ? command.index && null : stryMutAct_9fa48("88292") ? false : stryMutAct_9fa48("88291") ? true : (stryCov_9fa48("88291", "88292", "88293"), command.index || null),
                  causeId: normalizeCauseId(event.causeId)
                }));
              }
            }
            break;
          }
        case MESSAGE_GROUP_SERVICE_LITERAL.ACK:
          if (stryMutAct_9fa48("88294")) {} else {
            stryCov_9fa48("88294");
            // Handle acknowledgment
            this.acknowledgedMessages.add(command.messageId);
            break;
          }
      }
    }
  } /**
    * Send a message to a target service.
    * Implements simultaneous delivery and persistence pattern.
    * @param {string} targetService - Target service address.
    * @param {Object} message - Message payload.
    * @param {Object} [options]
    * @param {string} [options.deliveryMode]
    * @return {Promise<Object>} Delivery result.
    */
  async sendMessage(targetService, message, options = {}) {
    if (stryMutAct_9fa48("88295")) {
      {}
    } else {
      stryCov_9fa48("88295");
      if (stryMutAct_9fa48("88298") ? false : stryMutAct_9fa48("88297") ? true : stryMutAct_9fa48("88296") ? this.initialized : (stryCov_9fa48("88296", "88297", "88298"), !this.initialized)) {
        if (stryMutAct_9fa48("88299")) {
          {}
        } else {
          stryCov_9fa48("88299");
          throw new Error(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED);
        }
      }
      const messageId = uuidv4();
      const timestamp = this.hlcClock.now();
      const messageEnvelope = stryMutAct_9fa48("88300") ? {} : (stryCov_9fa48("88300"), {
        id: messageId,
        sourceReplica: this.replicaId,
        sourceGroup: this.groupId,
        targetService,
        payload: message,
        timestamp: timestamp.toString(),
        status: MessageStatus.PENDING,
        attempts: 0,
        createdAt: this.now()
      });
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.SENDING_MESSAGE, stryMutAct_9fa48("88301") ? {} : (stryCov_9fa48("88301"), {
        messageId,
        targetService,
        groupId: this.groupId
      })); // Track pending message
      this.pendingMessages.set(messageId, messageEnvelope);
      const deliveryMode = this.resolveMessageDeliveryMode(targetService, message, options);
      if (stryMutAct_9fa48("88304") ? deliveryMode !== MESSAGE_DELIVERY_MODE.DIRECT_ONLY : stryMutAct_9fa48("88303") ? false : stryMutAct_9fa48("88302") ? true : (stryCov_9fa48("88302", "88303", "88304"), deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_ONLY)) {
        if (stryMutAct_9fa48("88305")) {
          {}
        } else {
          stryCov_9fa48("88305");
          return this.deliverDirectOnlyMessage(messageEnvelope);
        }
      } // Simultaneous delivery and persistence (non-blocking)
      const deliveryPromise = this.attemptDirectDelivery(messageEnvelope);
      const persistPromise = this.persistToRaftLog(messageEnvelope);
      try {
        if (stryMutAct_9fa48("88306")) {
          {}
        } else {
          stryCov_9fa48("88306");
          // Wait for delivery to complete - we need the result for ACK extraction
          // Persistence happens in parallel but we prioritize delivery result
          const [deliveryResult, _persistResult] = await Promise.all(stryMutAct_9fa48("88307") ? [] : (stryCov_9fa48("88307"), [deliveryPromise, persistPromise]));
          if (stryMutAct_9fa48("88309") ? false : stryMutAct_9fa48("88308") ? true : (stryCov_9fa48("88308", "88309"), deliveryResult.delivered)) {
            if (stryMutAct_9fa48("88310")) {
              {}
            } else {
              stryCov_9fa48("88310");
              // Direct delivery succeeded
              messageEnvelope.status = MessageStatus.DELIVERED;
              this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERED_DIRECTLY, stryMutAct_9fa48("88311") ? {} : (stryCov_9fa48("88311"), {
                messageId,
                targetService
              })); // Spread the transport result directly - ACK structure is flat
              const {
                delivered: _d,
                attempt: _a,
                ...transportResult
              } = deliveryResult;
              return stryMutAct_9fa48("88312") ? {} : (stryCov_9fa48("88312"), {
                messageId,
                status: MessageStatus.DELIVERED,
                deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.DIRECT,
                ...transportResult
              });
            }
          }
          this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_PERSISTED_TO_RAFT_LOG_DELIVERY_FAILED, stryMutAct_9fa48("88313") ? {} : (stryCov_9fa48("88313"), {
            messageId,
            targetService
          }));
          return stryMutAct_9fa48("88314") ? {} : (stryCov_9fa48("88314"), {
            messageId,
            status: MessageStatus.PENDING,
            deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.PERSISTED
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("88315")) {
          {}
        } else {
          stryCov_9fa48("88315");
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_SEND_MESSAGE, stryMutAct_9fa48("88316") ? {} : (stryCov_9fa48("88316"), {
            messageId,
            targetService,
            error: error.message
          }));
          messageEnvelope.status = MessageStatus.FAILED;
          throw error;
        }
      }
    }
  } /**
    * Attempt direct delivery to target service.
    * Throws error if transport is unavailable (defense in depth).
    * @param {Object} messageEnvelope - Message envelope.
    * @param {Object} options
    * @param {number} [options.maxAttempts]
    * @param {boolean} [options.disableRetryDelay]
    * @return {Promise<Object>} Delivery result.
    * @private
    */
  async attemptDirectDelivery(messageEnvelope, options = {}) {
    if (stryMutAct_9fa48("88317")) {
      {}
    } else {
      stryCov_9fa48("88317");
      const {
        id: messageId,
        targetService,
        payload
      } = messageEnvelope; // Transport is guaranteed to exist (validated in constructor)
      // but we still check at runtime for defense in depth
      if (stryMutAct_9fa48("88320") ? false : stryMutAct_9fa48("88319") ? true : stryMutAct_9fa48("88318") ? this.transport : (stryCov_9fa48("88318", "88319", "88320"), !this.transport)) {
        if (stryMutAct_9fa48("88321")) {
          {}
        } else {
          stryCov_9fa48("88321");
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.WEBSOCKET_TRANSPORT_NOT_AVAILABLE_FOR_MESSAGE_DELIVERY, stryMutAct_9fa48("88322") ? {} : (stryCov_9fa48("88322"), {
            messageId,
            targetService,
            groupId: this.groupId
          }));
          throw new Error(MESSAGE_GROUP_SERVICE_LITERAL.WEBSOCKET_TRANSPORT_REQUIRED_BUT_NOT_AVAILABLE);
        }
      }
      let lastError = null;
      const maxAttempts = (stryMutAct_9fa48("88325") ? Number.isInteger(options?.maxAttempts) || options.maxAttempts > NUM.ZERO : stryMutAct_9fa48("88324") ? false : stryMutAct_9fa48("88323") ? true : (stryCov_9fa48("88323", "88324", "88325"), Number.isInteger(stryMutAct_9fa48("88326") ? options.maxAttempts : (stryCov_9fa48("88326"), options?.maxAttempts)) && (stryMutAct_9fa48("88329") ? options.maxAttempts <= NUM.ZERO : stryMutAct_9fa48("88328") ? options.maxAttempts >= NUM.ZERO : stryMutAct_9fa48("88327") ? true : (stryCov_9fa48("88327", "88328", "88329"), options.maxAttempts > NUM.ZERO)))) ? options.maxAttempts : this.retryMaxAttempts;
      const disableRetryDelay = stryMutAct_9fa48("88332") ? options?.disableRetryDelay !== true : stryMutAct_9fa48("88331") ? false : stryMutAct_9fa48("88330") ? true : (stryCov_9fa48("88330", "88331", "88332"), (stryMutAct_9fa48("88333") ? options.disableRetryDelay : (stryCov_9fa48("88333"), options?.disableRetryDelay)) === (stryMutAct_9fa48("88334") ? false : (stryCov_9fa48("88334"), true)));
      for (let attempt = NUM.ZERO; stryMutAct_9fa48("88337") ? attempt >= maxAttempts : stryMutAct_9fa48("88336") ? attempt <= maxAttempts : stryMutAct_9fa48("88335") ? false : (stryCov_9fa48("88335", "88336", "88337"), attempt < maxAttempts); stryMutAct_9fa48("88338") ? attempt-- : (stryCov_9fa48("88338"), attempt++)) {
        if (stryMutAct_9fa48("88339")) {
          {}
        } else {
          stryCov_9fa48("88339");
          stryMutAct_9fa48("88340") ? messageEnvelope.attempts-- : (stryCov_9fa48("88340"), messageEnvelope.attempts++);
          try {
            if (stryMutAct_9fa48("88341")) {
              {}
            } else {
              stryCov_9fa48("88341");
              // Calculate delay with exponential backoff and jitter
              if (stryMutAct_9fa48("88344") ? !disableRetryDelay || attempt > NUM.ZERO : stryMutAct_9fa48("88343") ? false : stryMutAct_9fa48("88342") ? true : (stryCov_9fa48("88342", "88343", "88344"), (stryMutAct_9fa48("88345") ? disableRetryDelay : (stryCov_9fa48("88345"), !disableRetryDelay)) && (stryMutAct_9fa48("88348") ? attempt <= NUM.ZERO : stryMutAct_9fa48("88347") ? attempt >= NUM.ZERO : stryMutAct_9fa48("88346") ? true : (stryCov_9fa48("88346", "88347", "88348"), attempt > NUM.ZERO)))) {
                if (stryMutAct_9fa48("88349")) {
                  {}
                } else {
                  stryCov_9fa48("88349");
                  const baseDelay = stryMutAct_9fa48("88350") ? Math.max(this.retryInitialDelayMs * Math.pow(this.retryBackoffMultiplier, attempt - 1), this.retryMaxDelayMs) : (stryCov_9fa48("88350"), Math.min(stryMutAct_9fa48("88351") ? this.retryInitialDelayMs / Math.pow(this.retryBackoffMultiplier, attempt - 1) : (stryCov_9fa48("88351"), this.retryInitialDelayMs * Math.pow(this.retryBackoffMultiplier, stryMutAct_9fa48("88352") ? attempt + 1 : (stryCov_9fa48("88352"), attempt - 1))), this.retryMaxDelayMs));
                  const jitter = stryMutAct_9fa48("88353") ? baseDelay * this.retryJitterFactor / Math.random() : (stryCov_9fa48("88353"), (stryMutAct_9fa48("88354") ? baseDelay / this.retryJitterFactor : (stryCov_9fa48("88354"), baseDelay * this.retryJitterFactor)) * Math.random());
                  const delay = stryMutAct_9fa48("88355") ? baseDelay - jitter : (stryCov_9fa48("88355"), baseDelay + jitter);
                  await this.sleep(delay);
                }
              } // Attempt delivery via transport
              const deliveryOptions = resolveTransportDeliveryOptions(targetService);
              const result = await this.transport.deliver(targetService, stryMutAct_9fa48("88356") ? {} : (stryCov_9fa48("88356"), {
                messageId,
                payload,
                sourceGroup: this.groupId,
                sourceReplica: this.replicaId
              }), deliveryOptions);
              if (stryMutAct_9fa48("88359") ? result || result.acknowledged : stryMutAct_9fa48("88358") ? false : stryMutAct_9fa48("88357") ? true : (stryCov_9fa48("88357", "88358", "88359"), result && result.acknowledged)) {
                if (stryMutAct_9fa48("88360")) {
                  {}
                } else {
                  stryCov_9fa48("88360");
                  // Spread transport result directly - ACK structure is flat
                  return stryMutAct_9fa48("88361") ? {} : (stryCov_9fa48("88361"), {
                    delivered: stryMutAct_9fa48("88362") ? false : (stryCov_9fa48("88362"), true),
                    attempt: stryMutAct_9fa48("88363") ? attempt - NUM.ONE : (stryCov_9fa48("88363"), attempt + NUM.ONE),
                    ...result
                  });
                }
              }
              if (stryMutAct_9fa48("88365") ? false : stryMutAct_9fa48("88364") ? true : (stryCov_9fa48("88364", "88365"), shouldDeferImmediateDeliveryRetry(result))) {
                if (stryMutAct_9fa48("88366")) {
                  {}
                } else {
                  stryCov_9fa48("88366");
                  return stryMutAct_9fa48("88367") ? {} : (stryCov_9fa48("88367"), {
                    delivered: stryMutAct_9fa48("88368") ? true : (stryCov_9fa48("88368"), false),
                    attempt: stryMutAct_9fa48("88369") ? attempt - NUM.ONE : (stryCov_9fa48("88369"), attempt + NUM.ONE),
                    error: stryMutAct_9fa48("88372") ? result?.error && MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_DEFERRED : stryMutAct_9fa48("88371") ? false : stryMutAct_9fa48("88370") ? true : (stryCov_9fa48("88370", "88371", "88372"), (stryMutAct_9fa48("88373") ? result.error : (stryCov_9fa48("88373"), result?.error)) || MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_DEFERRED),
                    deferRetry: stryMutAct_9fa48("88374") ? false : (stryCov_9fa48("88374"), true),
                    retryAfterMs: result.retryAfterMs,
                    errorCode: stryMutAct_9fa48("88377") ? result?.errorCode && null : stryMutAct_9fa48("88376") ? false : stryMutAct_9fa48("88375") ? true : (stryCov_9fa48("88375", "88376", "88377"), (stryMutAct_9fa48("88378") ? result.errorCode : (stryCov_9fa48("88378"), result?.errorCode)) || null)
                  });
                }
              }
              lastError = new Error(stryMutAct_9fa48("88381") ? result?.error && MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_NOT_ACKNOWLEDGED : stryMutAct_9fa48("88380") ? false : stryMutAct_9fa48("88379") ? true : (stryCov_9fa48("88379", "88380", "88381"), (stryMutAct_9fa48("88382") ? result.error : (stryCov_9fa48("88382"), result?.error)) || MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_NOT_ACKNOWLEDGED));
            }
          } catch (error) {
            if (stryMutAct_9fa48("88383")) {
              {}
            } else {
              stryCov_9fa48("88383");
              lastError = error;
              this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.DELIVERY_ATTEMPT_FAILED, stryMutAct_9fa48("88384") ? {} : (stryCov_9fa48("88384"), {
                messageId,
                targetService,
                attempt: stryMutAct_9fa48("88385") ? attempt - NUM.ONE : (stryCov_9fa48("88385"), attempt + NUM.ONE),
                error: error.message
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("88386") ? {} : (stryCov_9fa48("88386"), {
        delivered: stryMutAct_9fa48("88387") ? true : (stryCov_9fa48("88387"), false),
        error: stryMutAct_9fa48("88390") ? lastError?.message && MESSAGE_GROUP_SERVICE_LITERAL.MAX_RETRIES_EXCEEDED : stryMutAct_9fa48("88389") ? false : stryMutAct_9fa48("88388") ? true : (stryCov_9fa48("88388", "88389", "88390"), (stryMutAct_9fa48("88391") ? lastError.message : (stryCov_9fa48("88391"), lastError?.message)) || MESSAGE_GROUP_SERVICE_LITERAL.MAX_RETRIES_EXCEEDED)
      });
    }
  } /**
    * Determine whether payload should use fast non-durable query delivery.
    * @param {Object} payload
    * @return {boolean}
    * @private
    */
  isQueryDeliveryPayload(payload) {
    if (stryMutAct_9fa48("88392")) {
      {}
    } else {
      stryCov_9fa48("88392");
      return Boolean(stryMutAct_9fa48("88395") ? payload && typeof payload === TYPEOF.OBJECT || payload.type === QUERY_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("88394") ? false : stryMutAct_9fa48("88393") ? true : (stryCov_9fa48("88393", "88394", "88395"), (stryMutAct_9fa48("88397") ? payload || typeof payload === TYPEOF.OBJECT : stryMutAct_9fa48("88396") ? true : (stryCov_9fa48("88396", "88397"), payload && (stryMutAct_9fa48("88399") ? typeof payload !== TYPEOF.OBJECT : stryMutAct_9fa48("88398") ? true : (stryCov_9fa48("88398", "88399"), typeof payload === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("88401") ? payload.type !== QUERY_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("88400") ? true : (stryCov_9fa48("88400", "88401"), payload.type === QUERY_MESSAGE_TYPE.QUERY))));
    }
  } /**
    * Determine whether payload is an idempotent control-plane message that
    * should use direct delivery without duplicate Raft durability.
    * @param {Object} payload
    * @return {boolean}
    * @private
    */
  isDirectOnlyControlPlanePayload(payload) {
    if (stryMutAct_9fa48("88402")) {
      {}
    } else {
      stryCov_9fa48("88402");
      return Boolean(stryMutAct_9fa48("88405") ? payload && typeof payload === TYPEOF.OBJECT || DIRECT_ONLY_MESSAGE_TYPES.has(payload.type) : stryMutAct_9fa48("88404") ? false : stryMutAct_9fa48("88403") ? true : (stryCov_9fa48("88403", "88404", "88405"), (stryMutAct_9fa48("88407") ? payload || typeof payload === TYPEOF.OBJECT : stryMutAct_9fa48("88406") ? true : (stryCov_9fa48("88406", "88407"), payload && (stryMutAct_9fa48("88409") ? typeof payload !== TYPEOF.OBJECT : stryMutAct_9fa48("88408") ? true : (stryCov_9fa48("88408", "88409"), typeof payload === TYPEOF.OBJECT)))) && DIRECT_ONLY_MESSAGE_TYPES.has(payload.type)));
    }
  } /**
    * Resolve the canonical delivery mode for one outbound message.
    * @param {string} _targetService
    * @param {Object} payload
    * @param {Object} [options]
    * @return {string}
    * @private
    */
  resolveMessageDeliveryMode(_targetService, payload, options = {}) {
    if (stryMutAct_9fa48("88410")) {
      {}
    } else {
      stryCov_9fa48("88410");
      const explicitMode = normalizeMessageDeliveryMode(stryMutAct_9fa48("88411") ? options.deliveryMode : (stryCov_9fa48("88411"), options?.deliveryMode));
      if (stryMutAct_9fa48("88414") ? explicitMode === MESSAGE_DELIVERY_MODE.AUTO : stryMutAct_9fa48("88413") ? false : stryMutAct_9fa48("88412") ? true : (stryCov_9fa48("88412", "88413", "88414"), explicitMode !== MESSAGE_DELIVERY_MODE.AUTO)) {
        if (stryMutAct_9fa48("88415")) {
          {}
        } else {
          stryCov_9fa48("88415");
          return explicitMode;
        }
      }
      if (stryMutAct_9fa48("88418") ? this.isQueryDeliveryPayload(payload) && this.isDirectOnlyControlPlanePayload(payload) : stryMutAct_9fa48("88417") ? false : stryMutAct_9fa48("88416") ? true : (stryCov_9fa48("88416", "88417", "88418"), this.isQueryDeliveryPayload(payload) || this.isDirectOnlyControlPlanePayload(payload))) {
        if (stryMutAct_9fa48("88419")) {
          {}
        } else {
          stryCov_9fa48("88419");
          return MESSAGE_DELIVERY_MODE.DIRECT_ONLY;
        }
      }
      return MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY;
    }
  } /**
    * Send one message through the fast direct-only path.
    * @param {Object} messageEnvelope
    * @return {Promise<Object>}
    * @private
    */
  async deliverDirectOnlyMessage(messageEnvelope) {
    if (stryMutAct_9fa48("88420")) {
      {}
    } else {
      stryCov_9fa48("88420");
      const {
        id: messageId,
        targetService,
        payload
      } = messageEnvelope;
      const failureDescription = this.isQueryDeliveryPayload(payload) ? stryMutAct_9fa48("88421") ? "" : (stryCov_9fa48("88421"), 'Query message delivery failed') : stryMutAct_9fa48("88422") ? "" : (stryCov_9fa48("88422"), 'Message delivery failed');
      try {
        if (stryMutAct_9fa48("88423")) {
          {}
        } else {
          stryCov_9fa48("88423");
          const deliveryResult = await this.attemptDirectDelivery(messageEnvelope, stryMutAct_9fa48("88424") ? {} : (stryCov_9fa48("88424"), {
            maxAttempts: NUM.ONE,
            disableRetryDelay: stryMutAct_9fa48("88425") ? false : (stryCov_9fa48("88425"), true)
          }));
          if (stryMutAct_9fa48("88428") ? false : stryMutAct_9fa48("88427") ? true : stryMutAct_9fa48("88426") ? deliveryResult.delivered : (stryCov_9fa48("88426", "88427", "88428"), !deliveryResult.delivered)) {
            if (stryMutAct_9fa48("88429")) {
              {}
            } else {
              stryCov_9fa48("88429");
              throw shouldDeferImmediateDeliveryRetry(deliveryResult) ? buildDeferredDeliveryError(deliveryResult) : new Error(stryMutAct_9fa48("88432") ? deliveryResult.error && failureDescription : stryMutAct_9fa48("88431") ? false : stryMutAct_9fa48("88430") ? true : (stryCov_9fa48("88430", "88431", "88432"), deliveryResult.error || failureDescription));
            }
          }
          messageEnvelope.status = MessageStatus.DELIVERED;
          this.pendingMessages.delete(messageId);
          const {
            delivered: _d,
            attempt: _a,
            ...transportResult
          } = deliveryResult;
          return stryMutAct_9fa48("88433") ? {} : (stryCov_9fa48("88433"), {
            messageId,
            status: MessageStatus.DELIVERED,
            deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.DIRECT,
            ...transportResult
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("88434")) {
          {}
        } else {
          stryCov_9fa48("88434");
          const logLevel = (stryMutAct_9fa48("88437") ? error?.deferRetry !== true : stryMutAct_9fa48("88436") ? false : stryMutAct_9fa48("88435") ? true : (stryCov_9fa48("88435", "88436", "88437"), (stryMutAct_9fa48("88438") ? error.deferRetry : (stryCov_9fa48("88438"), error?.deferRetry)) === (stryMutAct_9fa48("88439") ? false : (stryCov_9fa48("88439"), true)))) ? stryMutAct_9fa48("88440") ? "" : (stryCov_9fa48("88440"), 'debug') : stryMutAct_9fa48("88441") ? "" : (stryCov_9fa48("88441"), 'error');
          this.logger[logLevel](MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_SEND_MESSAGE, stryMutAct_9fa48("88442") ? {} : (stryCov_9fa48("88442"), {
            messageId,
            targetService,
            error: error.message,
            deferRetry: stryMutAct_9fa48("88445") ? error?.deferRetry !== true : stryMutAct_9fa48("88444") ? false : stryMutAct_9fa48("88443") ? true : (stryCov_9fa48("88443", "88444", "88445"), (stryMutAct_9fa48("88446") ? error.deferRetry : (stryCov_9fa48("88446"), error?.deferRetry)) === (stryMutAct_9fa48("88447") ? false : (stryCov_9fa48("88447"), true))),
            retryAfterMs: Number.isFinite(stryMutAct_9fa48("88448") ? error.retryAfterMs : (stryCov_9fa48("88448"), error?.retryAfterMs)) ? error.retryAfterMs : null
          }));
          messageEnvelope.status = MessageStatus.FAILED;
          this.pendingMessages.delete(messageId);
          throw error;
        }
      }
    }
  } /**
    * Persist message to Raft log.
    * Uses liferaft's command method for log replication.
    * Note: Does not wait for commit - fire and forget for performance.
    * @param {Object} messageEnvelope - Message envelope.
    * @return {Promise<Object>} Persistence result.
    * @private
    */
  async persistToRaftLog(messageEnvelope) {
    if (stryMutAct_9fa48("88449")) {
      {}
    } else {
      stryCov_9fa48("88449");
      const entry = this.operationLedger.appendEntry(stryMutAct_9fa48("88450") ? {} : (stryCov_9fa48("88450"), {
        type: stryMutAct_9fa48("88451") ? "" : (stryCov_9fa48("88451"), 'MESSAGE'),
        message: messageEnvelope
      })); // Only use liferaft's command if it considers itself the leader
      // For single-replica groups, liferaft may not be in LEADER state
      const isLiferaftLeader = stryMutAct_9fa48("88454") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("88453") ? false : stryMutAct_9fa48("88452") ? true : (stryCov_9fa48("88452", "88453", "88454"), this.raft && (stryMutAct_9fa48("88456") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("88455") ? true : (stryCov_9fa48("88455", "88456"), this.raft.state === LifeRaft.LEADER)));
      if (stryMutAct_9fa48("88458") ? false : stryMutAct_9fa48("88457") ? true : (stryCov_9fa48("88457", "88458"), isLiferaftLeader)) {
        if (stryMutAct_9fa48("88459")) {
          {}
        } else {
          stryCov_9fa48("88459");
          // Fire and forget - don't wait for commit
          // The command will be replicated via heartbeats
          this.raftProvider.propose(this.raft, stryMutAct_9fa48("88460") ? {} : (stryCov_9fa48("88460"), {
            type: MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE,
            message: messageEnvelope
          }), err => {
            if (stryMutAct_9fa48("88461")) {
              {}
            } else {
              stryCov_9fa48("88461");
              if (stryMutAct_9fa48("88463") ? false : stryMutAct_9fa48("88462") ? true : (stryCov_9fa48("88462", "88463"), err)) {
                if (stryMutAct_9fa48("88464")) {
                  {}
                } else {
                  stryCov_9fa48("88464");
                  this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.RAFT_COMMAND_FAILED, stryMutAct_9fa48("88465") ? {} : (stryCov_9fa48("88465"), {
                    messageId: messageEnvelope.id,
                    error: err.message
                  }));
                }
              }
            }
          });
        }
      }
      return stryMutAct_9fa48("88466") ? {} : (stryCov_9fa48("88466"), {
        success: stryMutAct_9fa48("88467") ? false : (stryCov_9fa48("88467"), true),
        index: entry.index,
        term: entry.term
      });
    }
  } /**
    * Receive a message from another service or replica.
    * Detects Raft packets and routes them directly to liferaft.
    * Handles non-Raft messages as application messages.
    * Requirements: 2.2, 2.3, 5.2, 5.3
    * @param {Object} message - Incoming message.
    * @return {Promise<Object>} Processing result.
    */
  async receiveMessage(message) {
    if (stryMutAct_9fa48("88468")) {
      {}
    } else {
      stryCov_9fa48("88468");
      if (stryMutAct_9fa48("88471") ? false : stryMutAct_9fa48("88470") ? true : stryMutAct_9fa48("88469") ? this.initialized : (stryCov_9fa48("88469", "88470", "88471"), !this.initialized)) {
        if (stryMutAct_9fa48("88472")) {
          {}
        } else {
          stryCov_9fa48("88472");
          throw new Error(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED);
        }
      } // Extract payload - handle both envelope and direct packet formats
      const payload = stryMutAct_9fa48("88475") ? message.payload && message : stryMutAct_9fa48("88474") ? false : stryMutAct_9fa48("88473") ? true : (stryCov_9fa48("88473", "88474", "88475"), message.payload || message); // Detect and handle Raft packets directly using isRaftPacket()
      // No type conversion needed - packets flow through unchanged
      // Requirements: 2.2, 2.3
      if (stryMutAct_9fa48("88477") ? false : stryMutAct_9fa48("88476") ? true : (stryCov_9fa48("88476", "88477"), isRaftPacket(payload))) {
        if (stryMutAct_9fa48("88478")) {
          {}
        } else {
          stryCov_9fa48("88478");
          if (stryMutAct_9fa48("88480") ? false : stryMutAct_9fa48("88479") ? true : (stryCov_9fa48("88479", "88480"), this.raft)) {
            if (stryMutAct_9fa48("88481")) {
              {}
            } else {
              stryCov_9fa48("88481");
              this.logger.trace(MESSAGE_GROUP_SERVICE_LITERAL.RECEIVED_RAFT_PACKET, stryMutAct_9fa48("88482") ? {} : (stryCov_9fa48("88482"), {
                type: payload.type,
                term: payload.term,
                address: payload.address,
                replicaId: this.replicaId,
                groupId: this.groupId
              })); // Create write function for sending responses back to the sender
              // The sender's address is in payload.address
              // Requirements: 2.2
              const senderAddress = payload.address;
              const write = responsePacket => {
                if (stryMutAct_9fa48("88483")) {
                  {}
                } else {
                  stryCov_9fa48("88483");
                  if (stryMutAct_9fa48("88485") ? false : stryMutAct_9fa48("88484") ? true : (stryCov_9fa48("88484", "88485"), responsePacket)) {
                    if (stryMutAct_9fa48("88486")) {
                      {}
                    } else {
                      stryCov_9fa48("88486");
                      const deliveryOptions = resolveTransportDeliveryOptions(senderAddress);
                      this.logger.trace(stryMutAct_9fa48("88487") ? "" : (stryCov_9fa48("88487"), 'Sending Raft response'), stryMutAct_9fa48("88488") ? {} : (stryCov_9fa48("88488"), {
                        type: responsePacket.type,
                        destination: senderAddress,
                        term: responsePacket.term
                      })); // Send response to the sender
                      this.transport.deliver(senderAddress, responsePacket, deliveryOptions).then(result => {
                        if (stryMutAct_9fa48("88489")) {
                          {}
                        } else {
                          stryCov_9fa48("88489");
                          if (stryMutAct_9fa48("88492") ? !result?.acknowledged || shouldDeferImmediateDeliveryRetry(result) : stryMutAct_9fa48("88491") ? false : stryMutAct_9fa48("88490") ? true : (stryCov_9fa48("88490", "88491", "88492"), (stryMutAct_9fa48("88493") ? result?.acknowledged : (stryCov_9fa48("88493"), !(stryMutAct_9fa48("88494") ? result.acknowledged : (stryCov_9fa48("88494"), result?.acknowledged)))) && shouldDeferImmediateDeliveryRetry(result))) {
                            if (stryMutAct_9fa48("88495")) {
                              {}
                            } else {
                              stryCov_9fa48("88495");
                              this.logger.debug(stryMutAct_9fa48("88496") ? "" : (stryCov_9fa48("88496"), 'Deferred Raft response delivery'), stryMutAct_9fa48("88497") ? {} : (stryCov_9fa48("88497"), {
                                destination: senderAddress,
                                retryAfterMs: result.retryAfterMs,
                                errorCode: stryMutAct_9fa48("88500") ? result?.errorCode && null : stryMutAct_9fa48("88499") ? false : stryMutAct_9fa48("88498") ? true : (stryCov_9fa48("88498", "88499", "88500"), (stryMutAct_9fa48("88501") ? result.errorCode : (stryCov_9fa48("88501"), result?.errorCode)) || null)
                              }));
                            }
                          }
                        }
                      }).catch(err => {
                        if (stryMutAct_9fa48("88502")) {
                          {}
                        } else {
                          stryCov_9fa48("88502");
                          this.logger.error(stryMutAct_9fa48("88503") ? "" : (stryCov_9fa48("88503"), 'Failed to send Raft response'), stryMutAct_9fa48("88504") ? {} : (stryCov_9fa48("88504"), {
                            error: err.message,
                            destination: senderAddress
                          }));
                        }
                      });
                    }
                  }
                }
              };
              if (stryMutAct_9fa48("88507") ? this.isJoiningExistingGroup === true || payload.type === RAFT_PACKET_TYPE.VOTE : stryMutAct_9fa48("88506") ? false : stryMutAct_9fa48("88505") ? true : (stryCov_9fa48("88505", "88506", "88507"), (stryMutAct_9fa48("88509") ? this.isJoiningExistingGroup !== true : stryMutAct_9fa48("88508") ? true : (stryCov_9fa48("88508", "88509"), this.isJoiningExistingGroup === (stryMutAct_9fa48("88510") ? false : (stryCov_9fa48("88510"), true)))) && (stryMutAct_9fa48("88512") ? payload.type !== RAFT_PACKET_TYPE.VOTE : stryMutAct_9fa48("88511") ? true : (stryCov_9fa48("88511", "88512"), payload.type === RAFT_PACKET_TYPE.VOTE)))) {
                if (stryMutAct_9fa48("88513")) {
                  {}
                } else {
                  stryCov_9fa48("88513");
                  this.clearJoinExistingGroupTimers();
                  const deniedVote = await this.raft.packet(RAFT_PACKET_TYPE.VOTED, stryMutAct_9fa48("88514") ? {} : (stryCov_9fa48("88514"), {
                    granted: stryMutAct_9fa48("88515") ? true : (stryCov_9fa48("88515"), false)
                  }));
                  write(deniedVote);
                  return stryMutAct_9fa48("88516") ? {} : (stryCov_9fa48("88516"), {
                    acknowledged: stryMutAct_9fa48("88517") ? false : (stryCov_9fa48("88517"), true)
                  });
                }
              } // Emit to liferaft with write function for responses
              // Requirements: 2.2
              this.raft.emit(MESSAGE_GROUP_SERVICE_LITERAL.DATA, payload, write);
            }
          }
          return stryMutAct_9fa48("88518") ? {} : (stryCov_9fa48("88518"), {
            acknowledged: stryMutAct_9fa48("88519") ? false : (stryCov_9fa48("88519"), true)
          });
        }
      } // Handle application messages (non-Raft)
      // Requirements: 2.3, 5.3
      return this.handleApplicationMessage(message);
    }
  } /**
    * Handle application messages (non-Raft messages).
    * Requirements: 2.3, 5.3
    * @param {Object} message - Application message
    * @return {Promise<Object>} Processing result
    */
  async handleApplicationMessage(message) {
    if (stryMutAct_9fa48("88520")) {
      {}
    } else {
      stryCov_9fa48("88520");
      const {
        messageId,
        payload,
        sourceGroup,
        sourceReplica
      } = message;
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.RECEIVED_APPLICATION_MESSAGE, stryMutAct_9fa48("88521") ? {} : (stryCov_9fa48("88521"), {
        messageId,
        sourceGroup,
        sourceReplica,
        groupId: this.groupId
      })); // Check for duplicate
      if (stryMutAct_9fa48("88523") ? false : stryMutAct_9fa48("88522") ? true : (stryCov_9fa48("88522", "88523"), this.acknowledgedMessages.has(messageId))) {
        if (stryMutAct_9fa48("88524")) {
          {}
        } else {
          stryCov_9fa48("88524");
          this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.DUPLICATE_MESSAGE_IGNORED, stryMutAct_9fa48("88525") ? {} : (stryCov_9fa48("88525"), {
            messageId
          }));
          return stryMutAct_9fa48("88526") ? {} : (stryCov_9fa48("88526"), {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.DUPLICATE,
            acknowledged: stryMutAct_9fa48("88527") ? false : (stryCov_9fa48("88527"), true)
          });
        }
      } // Update HLC from remote timestamp if present and is a valid HLC string
      // The timestamp must be a string in HLC format (physical-logical-nodeId)
      if (stryMutAct_9fa48("88530") ? message.timestamp || typeof message.timestamp === TYPEOF.STRING : stryMutAct_9fa48("88529") ? false : stryMutAct_9fa48("88528") ? true : (stryCov_9fa48("88528", "88529", "88530"), message.timestamp && (stryMutAct_9fa48("88532") ? typeof message.timestamp !== TYPEOF.STRING : stryMutAct_9fa48("88531") ? true : (stryCov_9fa48("88531", "88532"), typeof message.timestamp === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("88533")) {
          {}
        } else {
          stryCov_9fa48("88533");
          try {
            if (stryMutAct_9fa48("88534")) {
              {}
            } else {
              stryCov_9fa48("88534");
              const remoteTimestamp = HLCTimestamp.fromString(message.timestamp);
              this.hlcClock.update(remoteTimestamp);
            }
          } catch (err) {
            if (stryMutAct_9fa48("88535")) {
              {}
            } else {
              stryCov_9fa48("88535");
              this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.INVALID_HLC_TIMESTAMP_IN_MESSAGE_IGNORING, stryMutAct_9fa48("88536") ? {} : (stryCov_9fa48("88536"), {
                timestamp: message.timestamp,
                error: err.message
              }));
              throw err;
            }
          }
        }
      } // Process the message
      try {
        if (stryMutAct_9fa48("88537")) {
          {}
        } else {
          stryCov_9fa48("88537");
          if (stryMutAct_9fa48("88540") ? payload || payload.type === MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION : stryMutAct_9fa48("88539") ? false : stryMutAct_9fa48("88538") ? true : (stryCov_9fa48("88538", "88539", "88540"), payload && (stryMutAct_9fa48("88542") ? payload.type !== MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION : stryMutAct_9fa48("88541") ? true : (stryCov_9fa48("88541", "88542"), payload.type === MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION)))) {
            if (stryMutAct_9fa48("88543")) {
              {}
            } else {
              stryCov_9fa48("88543");
              return this.handleLatencyCdcPropagationMessage(messageId, payload);
            }
          }
          if (stryMutAct_9fa48("88546") ? payload || payload.type === MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH : stryMutAct_9fa48("88545") ? false : stryMutAct_9fa48("88544") ? true : (stryCov_9fa48("88544", "88545", "88546"), payload && (stryMutAct_9fa48("88548") ? payload.type !== MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH : stryMutAct_9fa48("88547") ? true : (stryCov_9fa48("88547", "88548"), payload.type === MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH)))) {
            if (stryMutAct_9fa48("88549")) {
              {}
            } else {
              stryCov_9fa48("88549");
              return this.handleLatencyCdcPropagationBatchMessage(messageId, payload);
            }
          }
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGERECEIVED, stryMutAct_9fa48("88550") ? {} : (stryCov_9fa48("88550"), {
            messageId,
            payload,
            sourceGroup,
            sourceReplica
          }));
          return stryMutAct_9fa48("88551") ? {} : (stryCov_9fa48("88551"), {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.RECEIVED,
            acknowledged: stryMutAct_9fa48("88552") ? true : (stryCov_9fa48("88552"), false)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("88553")) {
          {}
        } else {
          stryCov_9fa48("88553");
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.ERROR_PROCESSING_RECEIVED_MESSAGE, stryMutAct_9fa48("88554") ? {} : (stryCov_9fa48("88554"), {
            messageId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Handle grouped-latency CDC propagation message.
    * @param {string} messageId - Message ID.
    * @param {Object} payload - Propagation payload.
    * @return {Promise<Object>}
    * @private
    */
  async handleLatencyCdcPropagationMessage(messageId, payload) {
    if (stryMutAct_9fa48("88555")) {
      {}
    } else {
      stryCov_9fa48("88555");
      const tableName = payload.tableName;
      const operation = payload.operation;
      const data = payload.data;
      const eventTimestamp = (stryMutAct_9fa48("88558") ? typeof payload.timestamp === 'string' || payload.timestamp.length > NUM.ZERO : stryMutAct_9fa48("88557") ? false : stryMutAct_9fa48("88556") ? true : (stryCov_9fa48("88556", "88557", "88558"), (stryMutAct_9fa48("88560") ? typeof payload.timestamp !== 'string' : stryMutAct_9fa48("88559") ? true : (stryCov_9fa48("88559", "88560"), typeof payload.timestamp === (stryMutAct_9fa48("88561") ? "" : (stryCov_9fa48("88561"), 'string')))) && (stryMutAct_9fa48("88564") ? payload.timestamp.length <= NUM.ZERO : stryMutAct_9fa48("88563") ? payload.timestamp.length >= NUM.ZERO : stryMutAct_9fa48("88562") ? true : (stryCov_9fa48("88562", "88563", "88564"), payload.timestamp.length > NUM.ZERO)))) ? payload.timestamp : null;
      const causeId = normalizeCauseId(payload.causeId);
      const replayOnly = stryMutAct_9fa48("88567") ? payload?.replayOnly !== true : stryMutAct_9fa48("88566") ? false : stryMutAct_9fa48("88565") ? true : (stryCov_9fa48("88565", "88566", "88567"), (stryMutAct_9fa48("88568") ? payload.replayOnly : (stryCov_9fa48("88568"), payload?.replayOnly)) === (stryMutAct_9fa48("88569") ? false : (stryCov_9fa48("88569"), true)));
      const relayDepth = (stryMutAct_9fa48("88572") ? Number.isInteger(payload.relayDepth) || payload.relayDepth >= NUM.ZERO : stryMutAct_9fa48("88571") ? false : stryMutAct_9fa48("88570") ? true : (stryCov_9fa48("88570", "88571", "88572"), Number.isInteger(payload.relayDepth) && (stryMutAct_9fa48("88575") ? payload.relayDepth < NUM.ZERO : stryMutAct_9fa48("88574") ? payload.relayDepth > NUM.ZERO : stryMutAct_9fa48("88573") ? true : (stryCov_9fa48("88573", "88574", "88575"), payload.relayDepth >= NUM.ZERO)))) ? payload.relayDepth : NUM.ZERO;
      if (stryMutAct_9fa48("88578") ? (!tableName || !operation) && !data : stryMutAct_9fa48("88577") ? false : stryMutAct_9fa48("88576") ? true : (stryCov_9fa48("88576", "88577", "88578"), (stryMutAct_9fa48("88580") ? !tableName && !operation : stryMutAct_9fa48("88579") ? false : (stryCov_9fa48("88579", "88580"), (stryMutAct_9fa48("88581") ? tableName : (stryCov_9fa48("88581"), !tableName)) || (stryMutAct_9fa48("88582") ? operation : (stryCov_9fa48("88582"), !operation)))) || (stryMutAct_9fa48("88583") ? data : (stryCov_9fa48("88583"), !data)))) {
        if (stryMutAct_9fa48("88584")) {
          {}
        } else {
          stryCov_9fa48("88584");
          throw new Error(MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_PAYLOAD);
        }
      } // Followers relay toward the current leader without applying locally.
      // Allow one additional bounded hop so stale first-hop routing can
      // converge during elections without creating open-ended loops.
      if (stryMutAct_9fa48("88587") ? false : stryMutAct_9fa48("88586") ? true : stryMutAct_9fa48("88585") ? this.isCurrentRaftLeader() : (stryCov_9fa48("88585", "88586", "88587"), !this.isCurrentRaftLeader())) {
        if (stryMutAct_9fa48("88588")) {
          {}
        } else {
          stryCov_9fa48("88588");
          if (stryMutAct_9fa48("88590") ? false : stryMutAct_9fa48("88589") ? true : (stryCov_9fa48("88589", "88590"), this.shouldUseStrictCDCForwarding(stryMutAct_9fa48("88591") ? {} : (stryCov_9fa48("88591"), {
            tableName,
            operation
          })))) {
            if (stryMutAct_9fa48("88592")) {
              {}
            } else {
              stryCov_9fa48("88592");
              const readiness = this.canAcceptCDCEvent(stryMutAct_9fa48("88593") ? {} : (stryCov_9fa48("88593"), {
                tableName,
                operation
              }));
              if (stryMutAct_9fa48("88596") ? readiness.ready === true : stryMutAct_9fa48("88595") ? false : stryMutAct_9fa48("88594") ? true : (stryCov_9fa48("88594", "88595", "88596"), readiness.ready !== (stryMutAct_9fa48("88597") ? false : (stryCov_9fa48("88597"), true)))) {
                if (stryMutAct_9fa48("88598")) {
                  {}
                } else {
                  stryCov_9fa48("88598");
                  return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88599") ? {} : (stryCov_9fa48("88599"), {
                    messageId,
                    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
                    acknowledged: stryMutAct_9fa48("88600") ? false : (stryCov_9fa48("88600"), true),
                    success: stryMutAct_9fa48("88601") ? true : (stryCov_9fa48("88601"), false),
                    error: stryMutAct_9fa48("88604") ? readiness.reason && MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN : stryMutAct_9fa48("88603") ? false : stryMutAct_9fa48("88602") ? true : (stryCov_9fa48("88602", "88603", "88604"), readiness.reason || MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN),
                    deferRetry: stryMutAct_9fa48("88605") ? false : (stryCov_9fa48("88605"), true),
                    retryAfterMs: Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : this.resolveStrictCdcForwardRetryAfterMs(),
                    tableName,
                    operation
                  }));
                }
              }
              if (stryMutAct_9fa48("88608") ? readiness.localIngress !== true : stryMutAct_9fa48("88607") ? false : stryMutAct_9fa48("88606") ? true : (stryCov_9fa48("88606", "88607", "88608"), readiness.localIngress === (stryMutAct_9fa48("88609") ? false : (stryCov_9fa48("88609"), true)))) {
                if (stryMutAct_9fa48("88610")) {
                  {}
                } else {
                  stryCov_9fa48("88610");
                  const applyOptions = stryMutAct_9fa48("88611") ? {} : (stryCov_9fa48("88611"), {
                    skipSubscriptionCheck: stryMutAct_9fa48("88612") ? false : (stryCov_9fa48("88612"), true)
                  });
                  if (stryMutAct_9fa48("88614") ? false : stryMutAct_9fa48("88613") ? true : (stryCov_9fa48("88613", "88614"), eventTimestamp)) {
                    if (stryMutAct_9fa48("88615")) {
                      {}
                    } else {
                      stryCov_9fa48("88615");
                      applyOptions.timestamp = eventTimestamp;
                    }
                  }
                  if (stryMutAct_9fa48("88617") ? false : stryMutAct_9fa48("88616") ? true : (stryCov_9fa48("88616", "88617"), causeId)) {
                    if (stryMutAct_9fa48("88618")) {
                      {}
                    } else {
                      stryCov_9fa48("88618");
                      applyOptions.causeId = causeId;
                    }
                  }
                  if (stryMutAct_9fa48("88620") ? false : stryMutAct_9fa48("88619") ? true : (stryCov_9fa48("88619", "88620"), replayOnly)) {
                    if (stryMutAct_9fa48("88621")) {
                      {}
                    } else {
                      stryCov_9fa48("88621");
                      applyOptions.replayOnly = stryMutAct_9fa48("88622") ? false : (stryCov_9fa48("88622"), true);
                    }
                  }
                  await this.applyCDCEvent(tableName, operation, data, applyOptions);
                  return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88623") ? {} : (stryCov_9fa48("88623"), {
                    messageId,
                    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
                    acknowledged: stryMutAct_9fa48("88624") ? false : (stryCov_9fa48("88624"), true),
                    tableName,
                    operation
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("88628") ? relayDepth < CDC_FORWARD_MAX_RELAY_DEPTH : stryMutAct_9fa48("88627") ? relayDepth > CDC_FORWARD_MAX_RELAY_DEPTH : stryMutAct_9fa48("88626") ? false : stryMutAct_9fa48("88625") ? true : (stryCov_9fa48("88625", "88626", "88627", "88628"), relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH)) {
            if (stryMutAct_9fa48("88629")) {
              {}
            } else {
              stryCov_9fa48("88629");
              throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
            }
          }
          await this.forwardCDCEventToLeader(tableName, operation, data, stryMutAct_9fa48("88630") ? {} : (stryCov_9fa48("88630"), {
            timestamp: stryMutAct_9fa48("88633") ? eventTimestamp && undefined : stryMutAct_9fa48("88632") ? false : stryMutAct_9fa48("88631") ? true : (stryCov_9fa48("88631", "88632", "88633"), eventTimestamp || undefined),
            relayDepth: stryMutAct_9fa48("88634") ? relayDepth - NUM.ONE : (stryCov_9fa48("88634"), relayDepth + NUM.ONE),
            causeId,
            replayOnly
          }));
          return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88635") ? {} : (stryCov_9fa48("88635"), {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
            acknowledged: stryMutAct_9fa48("88636") ? false : (stryCov_9fa48("88636"), true),
            tableName,
            operation
          }));
        }
      }
      const applyOptions = stryMutAct_9fa48("88637") ? {} : (stryCov_9fa48("88637"), {
        skipSubscriptionCheck: stryMutAct_9fa48("88638") ? false : (stryCov_9fa48("88638"), true)
      });
      if (stryMutAct_9fa48("88640") ? false : stryMutAct_9fa48("88639") ? true : (stryCov_9fa48("88639", "88640"), eventTimestamp)) {
        if (stryMutAct_9fa48("88641")) {
          {}
        } else {
          stryCov_9fa48("88641");
          applyOptions.timestamp = eventTimestamp;
        }
      }
      if (stryMutAct_9fa48("88643") ? false : stryMutAct_9fa48("88642") ? true : (stryCov_9fa48("88642", "88643"), causeId)) {
        if (stryMutAct_9fa48("88644")) {
          {}
        } else {
          stryCov_9fa48("88644");
          applyOptions.causeId = causeId;
        }
      }
      await this.applyCDCEvent(tableName, operation, data, applyOptions);
      return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88645") ? {} : (stryCov_9fa48("88645"), {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
        acknowledged: stryMutAct_9fa48("88646") ? false : (stryCov_9fa48("88646"), true),
        tableName,
        operation
      }));
    }
  } /**
    * Handle grouped-latency CDC batch propagation message.
    * @param {string} messageId - Message ID.
    * @param {Object} payload - Propagation payload.
    * @return {Promise<Object>}
    * @private
    */
  async handleLatencyCdcPropagationBatchMessage(messageId, payload) {
    if (stryMutAct_9fa48("88647")) {
      {}
    } else {
      stryCov_9fa48("88647");
      const events = Array.isArray(payload.events) ? payload.events : stryMutAct_9fa48("88648") ? ["Stryker was here"] : (stryCov_9fa48("88648"), []);
      const replayOnly = stryMutAct_9fa48("88651") ? payload?.replayOnly !== true : stryMutAct_9fa48("88650") ? false : stryMutAct_9fa48("88649") ? true : (stryCov_9fa48("88649", "88650", "88651"), (stryMutAct_9fa48("88652") ? payload.replayOnly : (stryCov_9fa48("88652"), payload?.replayOnly)) === (stryMutAct_9fa48("88653") ? false : (stryCov_9fa48("88653"), true)));
      const relayDepth = (stryMutAct_9fa48("88656") ? Number.isInteger(payload.relayDepth) || payload.relayDepth >= NUM.ZERO : stryMutAct_9fa48("88655") ? false : stryMutAct_9fa48("88654") ? true : (stryCov_9fa48("88654", "88655", "88656"), Number.isInteger(payload.relayDepth) && (stryMutAct_9fa48("88659") ? payload.relayDepth < NUM.ZERO : stryMutAct_9fa48("88658") ? payload.relayDepth > NUM.ZERO : stryMutAct_9fa48("88657") ? true : (stryCov_9fa48("88657", "88658", "88659"), payload.relayDepth >= NUM.ZERO)))) ? payload.relayDepth : NUM.ZERO;
      if (stryMutAct_9fa48("88662") ? events.length === NUM.ZERO && events.some(event => !event?.tableName || !event?.operation || !event?.data) : stryMutAct_9fa48("88661") ? false : stryMutAct_9fa48("88660") ? true : (stryCov_9fa48("88660", "88661", "88662"), (stryMutAct_9fa48("88664") ? events.length !== NUM.ZERO : stryMutAct_9fa48("88663") ? false : (stryCov_9fa48("88663", "88664"), events.length === NUM.ZERO)) || (stryMutAct_9fa48("88665") ? events.every(event => !event?.tableName || !event?.operation || !event?.data) : (stryCov_9fa48("88665"), events.some(stryMutAct_9fa48("88666") ? () => undefined : (stryCov_9fa48("88666"), event => stryMutAct_9fa48("88669") ? (!event?.tableName || !event?.operation) && !event?.data : stryMutAct_9fa48("88668") ? false : stryMutAct_9fa48("88667") ? true : (stryCov_9fa48("88667", "88668", "88669"), (stryMutAct_9fa48("88671") ? !event?.tableName && !event?.operation : stryMutAct_9fa48("88670") ? false : (stryCov_9fa48("88670", "88671"), (stryMutAct_9fa48("88672") ? event?.tableName : (stryCov_9fa48("88672"), !(stryMutAct_9fa48("88673") ? event.tableName : (stryCov_9fa48("88673"), event?.tableName)))) || (stryMutAct_9fa48("88674") ? event?.operation : (stryCov_9fa48("88674"), !(stryMutAct_9fa48("88675") ? event.operation : (stryCov_9fa48("88675"), event?.operation)))))) || (stryMutAct_9fa48("88676") ? event?.data : (stryCov_9fa48("88676"), !(stryMutAct_9fa48("88677") ? event.data : (stryCov_9fa48("88677"), event?.data))))))))))) {
        if (stryMutAct_9fa48("88678")) {
          {}
        } else {
          stryCov_9fa48("88678");
          throw new Error(MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD);
        }
      }
      if (stryMutAct_9fa48("88681") ? false : stryMutAct_9fa48("88680") ? true : stryMutAct_9fa48("88679") ? this.isCurrentRaftLeader() : (stryCov_9fa48("88679", "88680", "88681"), !this.isCurrentRaftLeader())) {
        if (stryMutAct_9fa48("88682")) {
          {}
        } else {
          stryCov_9fa48("88682");
          const strictEvent = events.find(event => {
            if (stryMutAct_9fa48("88683")) {
              {}
            } else {
              stryCov_9fa48("88683");
              return this.shouldUseStrictCDCForwarding(stryMutAct_9fa48("88684") ? {} : (stryCov_9fa48("88684"), {
                tableName: stryMutAct_9fa48("88687") ? event?.tableName && null : stryMutAct_9fa48("88686") ? false : stryMutAct_9fa48("88685") ? true : (stryCov_9fa48("88685", "88686", "88687"), (stryMutAct_9fa48("88688") ? event.tableName : (stryCov_9fa48("88688"), event?.tableName)) || null),
                operation: stryMutAct_9fa48("88691") ? event?.operation && null : stryMutAct_9fa48("88690") ? false : stryMutAct_9fa48("88689") ? true : (stryCov_9fa48("88689", "88690", "88691"), (stryMutAct_9fa48("88692") ? event.operation : (stryCov_9fa48("88692"), event?.operation)) || null)
              }));
            }
          });
          if (stryMutAct_9fa48("88694") ? false : stryMutAct_9fa48("88693") ? true : (stryCov_9fa48("88693", "88694"), strictEvent)) {
            if (stryMutAct_9fa48("88695")) {
              {}
            } else {
              stryCov_9fa48("88695");
              const readiness = this.canAcceptCDCEvent(stryMutAct_9fa48("88696") ? {} : (stryCov_9fa48("88696"), {
                tableName: strictEvent.tableName,
                operation: strictEvent.operation
              }));
              if (stryMutAct_9fa48("88699") ? readiness.ready === true : stryMutAct_9fa48("88698") ? false : stryMutAct_9fa48("88697") ? true : (stryCov_9fa48("88697", "88698", "88699"), readiness.ready !== (stryMutAct_9fa48("88700") ? false : (stryCov_9fa48("88700"), true)))) {
                if (stryMutAct_9fa48("88701")) {
                  {}
                } else {
                  stryCov_9fa48("88701");
                  return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88702") ? {} : (stryCov_9fa48("88702"), {
                    messageId,
                    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
                    acknowledged: stryMutAct_9fa48("88703") ? false : (stryCov_9fa48("88703"), true),
                    success: stryMutAct_9fa48("88704") ? true : (stryCov_9fa48("88704"), false),
                    error: stryMutAct_9fa48("88707") ? readiness.reason && MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN : stryMutAct_9fa48("88706") ? false : stryMutAct_9fa48("88705") ? true : (stryCov_9fa48("88705", "88706", "88707"), readiness.reason || MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN),
                    deferRetry: stryMutAct_9fa48("88708") ? false : (stryCov_9fa48("88708"), true),
                    retryAfterMs: Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : this.resolveStrictCdcForwardRetryAfterMs(),
                    eventCount: events.length
                  }));
                }
              }
              if (stryMutAct_9fa48("88711") ? readiness.localIngress !== true : stryMutAct_9fa48("88710") ? false : stryMutAct_9fa48("88709") ? true : (stryCov_9fa48("88709", "88710", "88711"), readiness.localIngress === (stryMutAct_9fa48("88712") ? false : (stryCov_9fa48("88712"), true)))) {
                if (stryMutAct_9fa48("88713")) {
                  {}
                } else {
                  stryCov_9fa48("88713");
                  await this.applyCDCBatch(events, stryMutAct_9fa48("88714") ? {} : (stryCov_9fa48("88714"), {
                    skipSubscriptionCheck: stryMutAct_9fa48("88715") ? false : (stryCov_9fa48("88715"), true),
                    replayOnly
                  }));
                  return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88716") ? {} : (stryCov_9fa48("88716"), {
                    messageId,
                    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
                    acknowledged: stryMutAct_9fa48("88717") ? false : (stryCov_9fa48("88717"), true),
                    eventCount: events.length
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("88721") ? relayDepth < CDC_FORWARD_MAX_RELAY_DEPTH : stryMutAct_9fa48("88720") ? relayDepth > CDC_FORWARD_MAX_RELAY_DEPTH : stryMutAct_9fa48("88719") ? false : stryMutAct_9fa48("88718") ? true : (stryCov_9fa48("88718", "88719", "88720", "88721"), relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH)) {
            if (stryMutAct_9fa48("88722")) {
              {}
            } else {
              stryCov_9fa48("88722");
              throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
            }
          }
          await this.forwardCDCBatchToLeader(events, stryMutAct_9fa48("88723") ? {} : (stryCov_9fa48("88723"), {
            relayDepth: stryMutAct_9fa48("88724") ? relayDepth - NUM.ONE : (stryCov_9fa48("88724"), relayDepth + NUM.ONE),
            replayOnly
          }));
          return buildLatencyCdcPropagationResult(stryMutAct_9fa48("88725") ? {} : (stryCov_9fa48("88725"), {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
            acknowledged: stryMutAct_9fa48("88726") ? false : (stryCov_9fa48("88726"), true),
            eventCount: events.length
          }));
        }
      }
      await this.applyCDCBatch(events, stryMutAct_9fa48("88727") ? {} : (stryCov_9fa48("88727"), {
        skipSubscriptionCheck: stryMutAct_9fa48("88728") ? false : (stryCov_9fa48("88728"), true)
      }));
      return stryMutAct_9fa48("88729") ? {} : (stryCov_9fa48("88729"), {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
        acknowledged: stryMutAct_9fa48("88730") ? false : (stryCov_9fa48("88730"), true),
        eventCount: events.length
      });
    }
  } /**
    * Acknowledge a message as successfully processed.
    * @param {string} messageId - Message ID to acknowledge.
    * @return {Promise<Object>} Acknowledgment result.
    */
  async acknowledgeMessage(messageId) {
    if (stryMutAct_9fa48("88731")) {
      {}
    } else {
      stryCov_9fa48("88731");
      if (stryMutAct_9fa48("88734") ? false : stryMutAct_9fa48("88733") ? true : stryMutAct_9fa48("88732") ? this.initialized : (stryCov_9fa48("88732", "88733", "88734"), !this.initialized)) {
        if (stryMutAct_9fa48("88735")) {
          {}
        } else {
          stryCov_9fa48("88735");
          throw new Error(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED);
        }
      }
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.ACKNOWLEDGING_MESSAGE, stryMutAct_9fa48("88736") ? {} : (stryCov_9fa48("88736"), {
        messageId,
        groupId: this.groupId
      })); // Mark as acknowledged
      this.acknowledgedMessages.add(messageId); // Remove from pending if present
      const pendingMessage = this.pendingMessages.get(messageId);
      if (stryMutAct_9fa48("88738") ? false : stryMutAct_9fa48("88737") ? true : (stryCov_9fa48("88737", "88738"), pendingMessage)) {
        if (stryMutAct_9fa48("88739")) {
          {}
        } else {
          stryCov_9fa48("88739");
          pendingMessage.status = MessageStatus.ACKNOWLEDGED;
          this.pendingMessages.delete(messageId);
        }
      } // Persist acknowledgment to Raft log
      const entry = this.operationLedger.appendEntry(stryMutAct_9fa48("88740") ? {} : (stryCov_9fa48("88740"), {
        type: stryMutAct_9fa48("88741") ? "" : (stryCov_9fa48("88741"), 'ACK'),
        messageId,
        timestamp: this.hlcClock.now().toString()
      })); // Notify callback if registered
      const callback = this.messageCallbacks.get(messageId);
      if (stryMutAct_9fa48("88743") ? false : stryMutAct_9fa48("88742") ? true : (stryCov_9fa48("88742", "88743"), callback)) {
        if (stryMutAct_9fa48("88744")) {
          {}
        } else {
          stryCov_9fa48("88744");
          callback(stryMutAct_9fa48("88745") ? {} : (stryCov_9fa48("88745"), {
            messageId,
            status: MessageStatus.ACKNOWLEDGED
          }));
          this.messageCallbacks.delete(messageId);
        }
      }
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEACKNOWLEDGED, stryMutAct_9fa48("88746") ? {} : (stryCov_9fa48("88746"), {
        messageId
      }));
      return stryMutAct_9fa48("88747") ? {} : (stryCov_9fa48("88747"), {
        messageId,
        status: MessageStatus.ACKNOWLEDGED,
        logIndex: entry.index
      });
    }
  } /**
    * Subscribe to CDC events from a system table.
    * @param {string} tableName - System table name.
    * @return {Promise<void>}
    */
  async subscribeToCDC(tableName) {
    if (stryMutAct_9fa48("88748")) {
      {}
    } else {
      stryCov_9fa48("88748");
      this.cdcHandler.subscribe(tableName);
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.SUBSCRIBED_TO_CDC, stryMutAct_9fa48("88749") ? {} : (stryCov_9fa48("88749"), {
        tableName,
        groupId: this.groupId
      }));
    }
  } /**
    * Apply a CDC event to the system table cache.
    * @param {string} tableName - System table name.
    * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
    * @param {Object} data - Record data.
    * @param {Object} [options]
    * @param {boolean} [options.skipReplication]
    * @param {boolean} [options.skipSubscriptionCheck]
    * @return {Promise<void>}
    */
  async applyCDCEvent(tableName, operation, data, options = {}) {
    if (stryMutAct_9fa48("88750")) {
      {}
    } else {
      stryCov_9fa48("88750");
      return this.applyCDCBatch(stryMutAct_9fa48("88751") ? [] : (stryCov_9fa48("88751"), [stryMutAct_9fa48("88752") ? {} : (stryCov_9fa48("88752"), {
        tableName,
        operation,
        data,
        ...options
      })]), options);
    }
  } /**
    * Normalize CDC batch events into one canonical replicated command payload.
    * @param {Array<Object>} events
    * @param {Object} [options]
    * @return {Array<Object>}
    * @private
    */
  normalizeCDCBatchEvents(events, options = {}) {
    if (stryMutAct_9fa48("88753")) {
      {}
    } else {
      stryCov_9fa48("88753");
      return stryMutAct_9fa48("88754") ? (Array.isArray(events) ? events : []).map(event => {
        const timestamp = typeof event.timestamp === 'string' && event.timestamp.length > NUM.ZERO ? event.timestamp : typeof options.timestamp === 'string' && options.timestamp.length > NUM.ZERO ? options.timestamp : this.hlcClock.now().toString();
        const causeId = normalizeCauseId(event.causeId ?? options.causeId);
        return {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          timestamp,
          causeId,
          replayOnly: event.replayOnly === true || options.replayOnly === true
        };
      }) : (stryCov_9fa48("88754"), (Array.isArray(events) ? events : stryMutAct_9fa48("88755") ? ["Stryker was here"] : (stryCov_9fa48("88755"), [])).filter(stryMutAct_9fa48("88756") ? () => undefined : (stryCov_9fa48("88756"), event => stryMutAct_9fa48("88759") ? event?.tableName && event?.operation || event?.data : stryMutAct_9fa48("88758") ? false : stryMutAct_9fa48("88757") ? true : (stryCov_9fa48("88757", "88758", "88759"), (stryMutAct_9fa48("88761") ? event?.tableName || event?.operation : stryMutAct_9fa48("88760") ? true : (stryCov_9fa48("88760", "88761"), (stryMutAct_9fa48("88762") ? event.tableName : (stryCov_9fa48("88762"), event?.tableName)) && (stryMutAct_9fa48("88763") ? event.operation : (stryCov_9fa48("88763"), event?.operation)))) && (stryMutAct_9fa48("88764") ? event.data : (stryCov_9fa48("88764"), event?.data))))).map(event => {
        if (stryMutAct_9fa48("88765")) {
          {}
        } else {
          stryCov_9fa48("88765");
          const timestamp = (stryMutAct_9fa48("88768") ? typeof event.timestamp === 'string' || event.timestamp.length > NUM.ZERO : stryMutAct_9fa48("88767") ? false : stryMutAct_9fa48("88766") ? true : (stryCov_9fa48("88766", "88767", "88768"), (stryMutAct_9fa48("88770") ? typeof event.timestamp !== 'string' : stryMutAct_9fa48("88769") ? true : (stryCov_9fa48("88769", "88770"), typeof event.timestamp === (stryMutAct_9fa48("88771") ? "" : (stryCov_9fa48("88771"), 'string')))) && (stryMutAct_9fa48("88774") ? event.timestamp.length <= NUM.ZERO : stryMutAct_9fa48("88773") ? event.timestamp.length >= NUM.ZERO : stryMutAct_9fa48("88772") ? true : (stryCov_9fa48("88772", "88773", "88774"), event.timestamp.length > NUM.ZERO)))) ? event.timestamp : (stryMutAct_9fa48("88777") ? typeof options.timestamp === 'string' || options.timestamp.length > NUM.ZERO : stryMutAct_9fa48("88776") ? false : stryMutAct_9fa48("88775") ? true : (stryCov_9fa48("88775", "88776", "88777"), (stryMutAct_9fa48("88779") ? typeof options.timestamp !== 'string' : stryMutAct_9fa48("88778") ? true : (stryCov_9fa48("88778", "88779"), typeof options.timestamp === (stryMutAct_9fa48("88780") ? "" : (stryCov_9fa48("88780"), 'string')))) && (stryMutAct_9fa48("88783") ? options.timestamp.length <= NUM.ZERO : stryMutAct_9fa48("88782") ? options.timestamp.length >= NUM.ZERO : stryMutAct_9fa48("88781") ? true : (stryCov_9fa48("88781", "88782", "88783"), options.timestamp.length > NUM.ZERO)))) ? options.timestamp : this.hlcClock.now().toString();
          const causeId = normalizeCauseId(stryMutAct_9fa48("88784") ? event.causeId && options.causeId : (stryCov_9fa48("88784"), event.causeId ?? options.causeId));
          return stryMutAct_9fa48("88785") ? {} : (stryCov_9fa48("88785"), {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp,
            causeId,
            replayOnly: stryMutAct_9fa48("88788") ? event.replayOnly === true && options.replayOnly === true : stryMutAct_9fa48("88787") ? false : stryMutAct_9fa48("88786") ? true : (stryCov_9fa48("88786", "88787", "88788"), (stryMutAct_9fa48("88790") ? event.replayOnly !== true : stryMutAct_9fa48("88789") ? false : (stryCov_9fa48("88789", "88790"), event.replayOnly === (stryMutAct_9fa48("88791") ? false : (stryCov_9fa48("88791"), true)))) || (stryMutAct_9fa48("88793") ? options.replayOnly !== true : stryMutAct_9fa48("88792") ? false : (stryCov_9fa48("88792", "88793"), options.replayOnly === (stryMutAct_9fa48("88794") ? false : (stryCov_9fa48("88794"), true)))))
          });
        }
      }));
    }
  } /**
    * Emit canonical cdcApplied notifications for one or more events.
    * @param {Array<Object>} events
    * @param {?number} logIndex
    * @private
    */
  emitCDCAppliedEvents(events, logIndex = null) {
    if (stryMutAct_9fa48("88795")) {
      {}
    } else {
      stryCov_9fa48("88795");
      for (const event of events) {
        if (stryMutAct_9fa48("88796")) {
          {}
        } else {
          stryCov_9fa48("88796");
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, stryMutAct_9fa48("88797") ? {} : (stryCov_9fa48("88797"), {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            logIndex,
            causeId: normalizeCauseId(event.causeId)
          }));
        }
      }
    }
  } /**
    * Record CDC propagation metrics for one or more events.
    * @param {Array<Object>} events
    * @param {number} applyStartMs
    * @private
    */
  recordCDCPropagationMetrics(events, applyStartMs) {
    if (stryMutAct_9fa48("88798")) {
      {}
    } else {
      stryCov_9fa48("88798");
      for (const event of events) {
        if (stryMutAct_9fa48("88799")) {
          {}
        } else {
          stryCov_9fa48("88799");
          try {
            if (stryMutAct_9fa48("88800")) {
              {}
            } else {
              stryCov_9fa48("88800");
              const handlerDurationMs = stryMutAct_9fa48("88801") ? this.now() + applyStartMs : (stryCov_9fa48("88801"), this.now() - applyStartMs);
              const metricsData = stryMutAct_9fa48("88802") ? {} : (stryCov_9fa48("88802"), {
                tableName: event.tableName,
                operation: event.operation,
                causeId: normalizeCauseId(event.causeId),
                handlerDurationMs
              });
              if (stryMutAct_9fa48("88805") ? event.timestamp == null : stryMutAct_9fa48("88804") ? false : stryMutAct_9fa48("88803") ? true : (stryCov_9fa48("88803", "88804", "88805"), event.timestamp != null)) {
                if (stryMutAct_9fa48("88806")) {
                  {}
                } else {
                  stryCov_9fa48("88806");
                  metricsData.eventAgeMs = stryMutAct_9fa48("88807") ? this.now() + event.timestamp : (stryCov_9fa48("88807"), this.now() - event.timestamp);
                }
              }
              this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, metricsData);
            }
          } catch (_metricsErr) {// Metrics logging must not propagate to callers
          }
        }
      }
    }
  } /**
    * Apply one or more CDC events through the canonical cache/raft owner.
    * @param {Array<Object>} events
    * @param {Object} [options]
    * @param {boolean} [options.skipReplication]
    * @param {boolean} [options.skipSubscriptionCheck]
    * @return {Promise<void>}
    */
  async applyCDCBatch(events, options = {}) {
    if (stryMutAct_9fa48("88808")) {
      {}
    } else {
      stryCov_9fa48("88808");
      const applyStartMs = this.now();
      const skipSubscriptionCheck = stryMutAct_9fa48("88811") ? options.skipSubscriptionCheck !== true : stryMutAct_9fa48("88810") ? false : stryMutAct_9fa48("88809") ? true : (stryCov_9fa48("88809", "88810", "88811"), options.skipSubscriptionCheck === (stryMutAct_9fa48("88812") ? false : (stryCov_9fa48("88812"), true)));
      const skipReplication = stryMutAct_9fa48("88815") ? options.skipReplication !== true : stryMutAct_9fa48("88814") ? false : stryMutAct_9fa48("88813") ? true : (stryCov_9fa48("88813", "88814", "88815"), options.skipReplication === (stryMutAct_9fa48("88816") ? false : (stryCov_9fa48("88816"), true)));
      const normalizedEvents = this.normalizeCDCBatchEvents(events, options).map(stryMutAct_9fa48("88817") ? () => undefined : (stryCov_9fa48("88817"), event => stryMutAct_9fa48("88818") ? {} : (stryCov_9fa48("88818"), {
        ...event,
        causeId: getOrCreateCauseId(event.causeId)
      })));
      if (stryMutAct_9fa48("88821") ? normalizedEvents.length !== NUM.ZERO : stryMutAct_9fa48("88820") ? false : stryMutAct_9fa48("88819") ? true : (stryCov_9fa48("88819", "88820", "88821"), normalizedEvents.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("88822")) {
          {}
        } else {
          stryCov_9fa48("88822");
          return;
        }
      }
      const strictEvent = normalizedEvents.find(event => {
        if (stryMutAct_9fa48("88823")) {
          {}
        } else {
          stryCov_9fa48("88823");
          return this.shouldUseStrictCDCForwarding(stryMutAct_9fa48("88824") ? {} : (stryCov_9fa48("88824"), {
            tableName: event.tableName,
            operation: event.operation
          }));
        }
      });
      const strictEventReadiness = strictEvent ? this.canAcceptCDCEvent(stryMutAct_9fa48("88825") ? {} : (stryCov_9fa48("88825"), {
        tableName: strictEvent.tableName,
        operation: strictEvent.operation
      })) : null;
      const useCanonicalLocalStrictIngress = stryMutAct_9fa48("88828") ? strictEventReadiness?.localIngress !== true : stryMutAct_9fa48("88827") ? false : stryMutAct_9fa48("88826") ? true : (stryCov_9fa48("88826", "88827", "88828"), (stryMutAct_9fa48("88829") ? strictEventReadiness.localIngress : (stryCov_9fa48("88829"), strictEventReadiness?.localIngress)) === (stryMutAct_9fa48("88830") ? false : (stryCov_9fa48("88830"), true)));
      const isSingleReplicaGroup = stryMutAct_9fa48("88833") ? Array.isArray(this.replicaIds) || this.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("88832") ? false : stryMutAct_9fa48("88831") ? true : (stryCov_9fa48("88831", "88832", "88833"), Array.isArray(this.replicaIds) && (stryMutAct_9fa48("88836") ? this.replicaIds.length > NUM.ONE : stryMutAct_9fa48("88835") ? this.replicaIds.length < NUM.ONE : stryMutAct_9fa48("88834") ? true : (stryCov_9fa48("88834", "88835", "88836"), this.replicaIds.length <= NUM.ONE)));
      const requiresRaftReplication = stryMutAct_9fa48("88839") ? !skipReplication && !useCanonicalLocalStrictIngress || !isSingleReplicaGroup : stryMutAct_9fa48("88838") ? false : stryMutAct_9fa48("88837") ? true : (stryCov_9fa48("88837", "88838", "88839"), (stryMutAct_9fa48("88841") ? !skipReplication || !useCanonicalLocalStrictIngress : stryMutAct_9fa48("88840") ? true : (stryCov_9fa48("88840", "88841"), (stryMutAct_9fa48("88842") ? skipReplication : (stryCov_9fa48("88842"), !skipReplication)) && (stryMutAct_9fa48("88843") ? useCanonicalLocalStrictIngress : (stryCov_9fa48("88843"), !useCanonicalLocalStrictIngress)))) && (stryMutAct_9fa48("88844") ? isSingleReplicaGroup : (stryCov_9fa48("88844"), !isSingleReplicaGroup)));
      const shouldApplyLocally = stryMutAct_9fa48("88847") ? !requiresRaftReplication && this.isCurrentRaftLeader() : stryMutAct_9fa48("88846") ? false : stryMutAct_9fa48("88845") ? true : (stryCov_9fa48("88845", "88846", "88847"), (stryMutAct_9fa48("88848") ? requiresRaftReplication : (stryCov_9fa48("88848"), !requiresRaftReplication)) || this.isCurrentRaftLeader());
      if (stryMutAct_9fa48("88851") ? requiresRaftReplication || !shouldApplyLocally : stryMutAct_9fa48("88850") ? false : stryMutAct_9fa48("88849") ? true : (stryCov_9fa48("88849", "88850", "88851"), requiresRaftReplication && (stryMutAct_9fa48("88852") ? shouldApplyLocally : (stryCov_9fa48("88852"), !shouldApplyLocally)))) {
        if (stryMutAct_9fa48("88853")) {
          {}
        } else {
          stryCov_9fa48("88853");
          if (stryMutAct_9fa48("88855") ? false : stryMutAct_9fa48("88854") ? true : (stryCov_9fa48("88854", "88855"), strictEvent)) {
            if (stryMutAct_9fa48("88856")) {
              {}
            } else {
              stryCov_9fa48("88856");
              const readiness = strictEventReadiness;
              if (stryMutAct_9fa48("88859") ? readiness.ready === true : stryMutAct_9fa48("88858") ? false : stryMutAct_9fa48("88857") ? true : (stryCov_9fa48("88857", "88858", "88859"), readiness.ready !== (stryMutAct_9fa48("88860") ? false : (stryCov_9fa48("88860"), true)))) {
                if (stryMutAct_9fa48("88861")) {
                  {}
                } else {
                  stryCov_9fa48("88861");
                  throw buildDeferredCdcForwardError(stryMutAct_9fa48("88864") ? readiness.reason && MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN : stryMutAct_9fa48("88863") ? false : stryMutAct_9fa48("88862") ? true : (stryCov_9fa48("88862", "88863", "88864"), readiness.reason || MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN), Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : this.resolveStrictCdcForwardRetryAfterMs());
                }
              }
            }
          }
        }
      }
      const appliedEvents = stryMutAct_9fa48("88865") ? ["Stryker was here"] : (stryCov_9fa48("88865"), []);
      if (stryMutAct_9fa48("88867") ? false : stryMutAct_9fa48("88866") ? true : (stryCov_9fa48("88866", "88867"), shouldApplyLocally)) {
        if (stryMutAct_9fa48("88868")) {
          {}
        } else {
          stryCov_9fa48("88868");
          for (const event of normalizedEvents) {
            if (stryMutAct_9fa48("88869")) {
              {}
            } else {
              stryCov_9fa48("88869");
              const applied = this.cdcHandler.applyImmediate(stryMutAct_9fa48("88870") ? {} : (stryCov_9fa48("88870"), {
                tableName: event.tableName,
                operation: event.operation,
                data: event.data,
                timestamp: event.timestamp,
                causeId: event.causeId
              }), stryMutAct_9fa48("88871") ? {} : (stryCov_9fa48("88871"), {
                skipSubscriptionCheck
              }));
              if (stryMutAct_9fa48("88873") ? false : stryMutAct_9fa48("88872") ? true : (stryCov_9fa48("88872", "88873"), applied)) {
                if (stryMutAct_9fa48("88874")) {
                  {}
                } else {
                  stryCov_9fa48("88874");
                  appliedEvents.push(event);
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("88876") ? false : stryMutAct_9fa48("88875") ? true : (stryCov_9fa48("88875", "88876"), requiresRaftReplication)) {
        if (stryMutAct_9fa48("88877")) {
          {}
        } else {
          stryCov_9fa48("88877");
          const cdcCommand = (stryMutAct_9fa48("88880") ? normalizedEvents.length !== NUM.ONE : stryMutAct_9fa48("88879") ? false : stryMutAct_9fa48("88878") ? true : (stryCov_9fa48("88878", "88879", "88880"), normalizedEvents.length === NUM.ONE)) ? stryMutAct_9fa48("88881") ? {} : (stryCov_9fa48("88881"), {
            type: stryMutAct_9fa48("88882") ? "" : (stryCov_9fa48("88882"), 'CDC'),
            tableName: normalizedEvents[0].tableName,
            operation: normalizedEvents[0].operation,
            data: normalizedEvents[0].data,
            timestamp: normalizedEvents[0].timestamp,
            causeId: normalizedEvents[0].causeId,
            replayOnly: stryMutAct_9fa48("88885") ? normalizedEvents[0].replayOnly !== true : stryMutAct_9fa48("88884") ? false : stryMutAct_9fa48("88883") ? true : (stryCov_9fa48("88883", "88884", "88885"), normalizedEvents[0].replayOnly === (stryMutAct_9fa48("88886") ? false : (stryCov_9fa48("88886"), true)))
          }) : stryMutAct_9fa48("88887") ? {} : (stryCov_9fa48("88887"), {
            type: CDC_BATCH_COMMAND_TYPE,
            events: normalizedEvents
          }); // Replicate via Raft so all message group replicas (and their
          // co-located system caches) receive this CDC event. Cache updates
          // are applied only from committed CDC entries.
          await this.proposeCDCCommand(cdcCommand); // Retain only successfully proposed commands in the bounded local
          // diagnostic ledger so failed relays do not accumulate indefinitely.
          const entry = this.operationLedger.appendEntry(stryMutAct_9fa48("88888") ? {} : (stryCov_9fa48("88888"), {
            ...cdcCommand
          }));
          this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
          this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.CDC_EVENT_PROPOSED_FOR_REPLICATION_AWAITING_COMMIT_APPLY, stryMutAct_9fa48("88889") ? {} : (stryCov_9fa48("88889"), {
            tableName: (stryMutAct_9fa48("88892") ? normalizedEvents.length !== NUM.ONE : stryMutAct_9fa48("88891") ? false : stryMutAct_9fa48("88890") ? true : (stryCov_9fa48("88890", "88891", "88892"), normalizedEvents.length === NUM.ONE)) ? normalizedEvents[NUM.ZERO].tableName : MESSAGE_GROUP_SERVICE_LITERAL.BATCH,
            operation: (stryMutAct_9fa48("88895") ? normalizedEvents.length !== NUM.ONE : stryMutAct_9fa48("88894") ? false : stryMutAct_9fa48("88893") ? true : (stryCov_9fa48("88893", "88894", "88895"), normalizedEvents.length === NUM.ONE)) ? normalizedEvents[NUM.ZERO].operation : stryMutAct_9fa48("88896") ? `` : (stryCov_9fa48("88896"), `batch:${normalizedEvents.length}`),
            logIndex: entry.index,
            groupId: this.groupId,
            replicaId: this.replicaId,
            causeId: normalizeCauseId(normalizedEvents[NUM.ZERO].causeId),
            eventCount: normalizedEvents.length
          }));
          if (stryMutAct_9fa48("88899") ? false : stryMutAct_9fa48("88898") ? true : stryMutAct_9fa48("88897") ? shouldApplyLocally : (stryCov_9fa48("88897", "88898", "88899"), !shouldApplyLocally)) {
            if (stryMutAct_9fa48("88900")) {
              {}
            } else {
              stryCov_9fa48("88900");
              return;
            }
          }
          if (stryMutAct_9fa48("88903") ? appliedEvents.length !== NUM.ZERO : stryMutAct_9fa48("88902") ? false : stryMutAct_9fa48("88901") ? true : (stryCov_9fa48("88901", "88902", "88903"), appliedEvents.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("88904")) {
              {}
            } else {
              stryCov_9fa48("88904");
              return;
            }
          }
          this.emitCDCAppliedEvents(appliedEvents, entry.index);
          return;
        }
      }
      if (stryMutAct_9fa48("88907") ? appliedEvents.length !== NUM.ZERO : stryMutAct_9fa48("88906") ? false : stryMutAct_9fa48("88905") ? true : (stryCov_9fa48("88905", "88906", "88907"), appliedEvents.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("88908")) {
          {}
        } else {
          stryCov_9fa48("88908");
          return;
        }
      }
      if (stryMutAct_9fa48("88911") ? false : stryMutAct_9fa48("88910") ? true : stryMutAct_9fa48("88909") ? skipReplication : (stryCov_9fa48("88909", "88910", "88911"), !skipReplication)) {
        if (stryMutAct_9fa48("88912")) {
          {}
        } else {
          stryCov_9fa48("88912");
          const entry = this.operationLedger.appendEntry(stryMutAct_9fa48("88913") ? {} : (stryCov_9fa48("88913"), {
            ...((stryMutAct_9fa48("88916") ? normalizedEvents.length !== NUM.ONE : stryMutAct_9fa48("88915") ? false : stryMutAct_9fa48("88914") ? true : (stryCov_9fa48("88914", "88915", "88916"), normalizedEvents.length === NUM.ONE)) ? stryMutAct_9fa48("88917") ? {} : (stryCov_9fa48("88917"), {
              type: stryMutAct_9fa48("88918") ? "" : (stryCov_9fa48("88918"), 'CDC'),
              tableName: normalizedEvents[0].tableName,
              operation: normalizedEvents[0].operation,
              data: normalizedEvents[0].data,
              timestamp: normalizedEvents[0].timestamp,
              causeId: normalizedEvents[0].causeId,
              replayOnly: stryMutAct_9fa48("88921") ? normalizedEvents[0].replayOnly !== true : stryMutAct_9fa48("88920") ? false : stryMutAct_9fa48("88919") ? true : (stryCov_9fa48("88919", "88920", "88921"), normalizedEvents[0].replayOnly === (stryMutAct_9fa48("88922") ? false : (stryCov_9fa48("88922"), true)))
            }) : stryMutAct_9fa48("88923") ? {} : (stryCov_9fa48("88923"), {
              type: CDC_BATCH_COMMAND_TYPE,
              events: normalizedEvents
            }))
          }));
          this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
          this.emitCDCAppliedEvents(appliedEvents, entry.index);
          return;
        }
      }
      this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
      this.emitCDCAppliedEvents(appliedEvents, null);
    }
  } /**
    * Propose a CDC command through Raft and fail closed on replication errors.
    * @param {Object} cdcCommand
    * @return {Promise<void>}
    * @private
    */
  async proposeCDCCommand(cdcCommand) {
    if (stryMutAct_9fa48("88924")) {
      {}
    } else {
      stryCov_9fa48("88924");
      const configuredRetryBudget = (stryMutAct_9fa48("88927") ? Number.isInteger(this.retryMaxAttempts) || this.retryMaxAttempts > NUM.ZERO : stryMutAct_9fa48("88926") ? false : stryMutAct_9fa48("88925") ? true : (stryCov_9fa48("88925", "88926", "88927"), Number.isInteger(this.retryMaxAttempts) && (stryMutAct_9fa48("88930") ? this.retryMaxAttempts <= NUM.ZERO : stryMutAct_9fa48("88929") ? this.retryMaxAttempts >= NUM.ZERO : stryMutAct_9fa48("88928") ? true : (stryCov_9fa48("88928", "88929", "88930"), this.retryMaxAttempts > NUM.ZERO)))) ? this.retryMaxAttempts : NUM.ONE;
      const proposeTimeoutMs = this.computeCdcProposeTimeoutMs(configuredRetryBudget);
      const leaderTargetSource = (stryMutAct_9fa48("88933") ? typeof this.raftProvider?.proposeWithLeaderRouting !== 'function' : stryMutAct_9fa48("88932") ? false : stryMutAct_9fa48("88931") ? true : (stryCov_9fa48("88931", "88932", "88933"), typeof (stryMutAct_9fa48("88934") ? this.raftProvider.proposeWithLeaderRouting : (stryCov_9fa48("88934"), this.raftProvider?.proposeWithLeaderRouting)) === (stryMutAct_9fa48("88935") ? "" : (stryCov_9fa48("88935"), 'function')))) ? stryMutAct_9fa48("88936") ? "" : (stryCov_9fa48("88936"), 'forward_to_leader') : stryMutAct_9fa48("88937") ? "" : (stryCov_9fa48("88937"), 'local_raft_propose');
      try {
        if (stryMutAct_9fa48("88938")) {
          {}
        } else {
          stryCov_9fa48("88938");
          if (stryMutAct_9fa48("88941") ? typeof this.raftProvider.proposeWithLeaderRouting !== TYPEOF.FUNCTION : stryMutAct_9fa48("88940") ? false : stryMutAct_9fa48("88939") ? true : (stryCov_9fa48("88939", "88940", "88941"), typeof this.raftProvider.proposeWithLeaderRouting === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("88942")) {
              {}
            } else {
              stryCov_9fa48("88942");
              await this.raftProvider.proposeWithLeaderRouting(this.raft, cdcCommand, stryMutAct_9fa48("88943") ? {} : (stryCov_9fa48("88943"), {
                maxAttempts: configuredRetryBudget,
                proposeTimeoutMs,
                forwardToLeader: async command => {
                  if (stryMutAct_9fa48("88944")) {
                    {}
                  } else {
                    stryCov_9fa48("88944");
                    await this.forwardCDCEventToLeader(command.tableName, command.operation, command.data, stryMutAct_9fa48("88945") ? {} : (stryCov_9fa48("88945"), {
                      timestamp: command.timestamp,
                      causeId: command.causeId,
                      replayOnly: stryMutAct_9fa48("88948") ? command.replayOnly !== true : stryMutAct_9fa48("88947") ? false : stryMutAct_9fa48("88946") ? true : (stryCov_9fa48("88946", "88947", "88948"), command.replayOnly === (stryMutAct_9fa48("88949") ? false : (stryCov_9fa48("88949"), true)))
                    }));
                  }
                },
                computeRetryDelayMs: stryMutAct_9fa48("88950") ? () => undefined : (stryCov_9fa48("88950"), attempt => this.computeCdcForwardRetryDelayMs(attempt)),
                onRetry: ({
                  attempt,
                  mode,
                  retryDelayMs,
                  error
                }) => {
                  if (stryMutAct_9fa48("88951")) {
                    {}
                  } else {
                    stryCov_9fa48("88951");
                    this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.RETRYING_RAFT_CDC_COMMAND, stryMutAct_9fa48("88952") ? {} : (stryCov_9fa48("88952"), {
                      groupId: this.groupId,
                      replicaId: this.replicaId,
                      tableName: cdcCommand.tableName,
                      causeId: normalizeCauseId(cdcCommand.causeId),
                      attempt,
                      mode,
                      retryDelayMs,
                      error: stryMutAct_9fa48("88955") ? error?.message && null : stryMutAct_9fa48("88954") ? false : stryMutAct_9fa48("88953") ? true : (stryCov_9fa48("88953", "88954", "88955"), (stryMutAct_9fa48("88956") ? error.message : (stryCov_9fa48("88956"), error?.message)) || null)
                    }));
                  }
                }
              }));
              return;
            }
          }
          await new Promise((resolve, reject) => {
            if (stryMutAct_9fa48("88957")) {
              {}
            } else {
              stryCov_9fa48("88957");
              this.raftProvider.propose(this.raft, cdcCommand, error => {
                if (stryMutAct_9fa48("88958")) {
                  {}
                } else {
                  stryCov_9fa48("88958");
                  if (stryMutAct_9fa48("88960") ? false : stryMutAct_9fa48("88959") ? true : (stryCov_9fa48("88959", "88960"), error)) {
                    if (stryMutAct_9fa48("88961")) {
                      {}
                    } else {
                      stryCov_9fa48("88961");
                      reject(error);
                      return;
                    }
                  }
                  resolve();
                }
              });
            }
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("88962")) {
          {}
        } else {
          stryCov_9fa48("88962");
          this.logger.error(MESSAGE_GROUP_SERVICE_LITERAL.RAFT_CDC_COMMAND_FAILED, stryMutAct_9fa48("88963") ? {} : (stryCov_9fa48("88963"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: cdcCommand.tableName,
            causeId: normalizeCauseId(cdcCommand.causeId),
            attempts: configuredRetryBudget,
            configuredRetryBudget,
            proposeTimeoutMs,
            isCurrentRaftLeader: this.isCurrentRaftLeader(),
            raftState: stryMutAct_9fa48("88966") ? this.raft?.state && null : stryMutAct_9fa48("88965") ? false : stryMutAct_9fa48("88964") ? true : (stryCov_9fa48("88964", "88965", "88966"), (stryMutAct_9fa48("88967") ? this.raft.state : (stryCov_9fa48("88967"), this.raft?.state)) || null),
            leaderTargetSource,
            error: stryMutAct_9fa48("88970") ? error?.message && null : stryMutAct_9fa48("88969") ? false : stryMutAct_9fa48("88968") ? true : (stryCov_9fa48("88968", "88969", "88970"), (stryMutAct_9fa48("88971") ? error.message : (stryCov_9fa48("88971"), error?.message)) || null)
          }));
          throw wrapCdcProposeError((stryMutAct_9fa48("88972") ? `` : (stryCov_9fa48("88972"), `${MESSAGE_GROUP_CDC_ERROR_MSG.RAFT_PROPOSE_FAILED}: `)) + (stryMutAct_9fa48("88973") ? `` : (stryCov_9fa48("88973"), `${stryMutAct_9fa48("88976") ? boundCdcForwardErrorDetail(error?.message) && MESSAGE_GROUP_SERVICE_LITERAL.UNKNOWN_ERROR : stryMutAct_9fa48("88975") ? false : stryMutAct_9fa48("88974") ? true : (stryCov_9fa48("88974", "88975", "88976"), boundCdcForwardErrorDetail(stryMutAct_9fa48("88977") ? error.message : (stryCov_9fa48("88977"), error?.message)) || MESSAGE_GROUP_SERVICE_LITERAL.UNKNOWN_ERROR)}`)), error);
        }
      }
    }
  } /**
    * Determine whether this replica is currently the active Raft leader.
    * @return {boolean}
    * @private
    */
  isCurrentRaftLeader() {
    if (stryMutAct_9fa48("88978")) {
      {}
    } else {
      stryCov_9fa48("88978");
      return stryMutAct_9fa48("88981") ? this.raft && this.raft.state === LifeRaft.LEADER && this.role === RaftRole.LEADER : stryMutAct_9fa48("88980") ? false : stryMutAct_9fa48("88979") ? true : (stryCov_9fa48("88979", "88980", "88981"), (stryMutAct_9fa48("88983") ? this.raft || this.raft.state === LifeRaft.LEADER : stryMutAct_9fa48("88982") ? false : (stryCov_9fa48("88982", "88983"), this.raft && (stryMutAct_9fa48("88985") ? this.raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("88984") ? true : (stryCov_9fa48("88984", "88985"), this.raft.state === LifeRaft.LEADER)))) || (stryMutAct_9fa48("88987") ? this.role !== RaftRole.LEADER : stryMutAct_9fa48("88986") ? false : (stryCov_9fa48("88986", "88987"), this.role === RaftRole.LEADER)));
    }
  } /**
    * Resolve the current live Raft leader target without using bootstrap
    * transport hints. This lets strict system-table forwarding honor the
    * owner's current leader state without waiting for the control-plane echo.
    * @return {{serviceId: string, address: string}|null}
    * @private
    */
  resolveLiveLeaderForwardTarget() {
    if (stryMutAct_9fa48("88988")) {
      {}
    } else {
      stryCov_9fa48("88988");
      return this.forwardingOwner.resolveLiveLeaderForwardTarget();
    }
  }
  normalizeLeaderReplicaId(candidate) {
    if (stryMutAct_9fa48("88989")) {
      {}
    } else {
      stryCov_9fa48("88989");
      return this.forwardingOwner.normalizeLeaderReplicaId(candidate);
    }
  }
  resolveLivePeerAddressFromRaftNodes(peerId) {
    if (stryMutAct_9fa48("88990")) {
      {}
    } else {
      stryCov_9fa48("88990");
      return this.forwardingOwner.resolveLivePeerAddressFromRaftNodes(peerId);
    }
  }
  resolveCDCForwardSelection(logContext = {}) {
    if (stryMutAct_9fa48("88991")) {
      {}
    } else {
      stryCov_9fa48("88991");
      return this.forwardingOwner.resolveCDCForwardSelection(logContext);
    }
  }
  buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options = {}) {
    if (stryMutAct_9fa48("88992")) {
      {}
    } else {
      stryCov_9fa48("88992");
      return this.forwardingOwner.buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options);
    }
  }
  shouldUseStrictCDCForwarding(logContext = {}) {
    if (stryMutAct_9fa48("88993")) {
      {}
    } else {
      stryCov_9fa48("88993");
      return this.forwardingOwner.shouldUseStrictCDCForwarding(logContext);
    }
  }
  canAcceptCDCEvent(cdcEvent = {}) {
    if (stryMutAct_9fa48("88994")) {
      {}
    } else {
      stryCov_9fa48("88994");
      return this.forwardingOwner.canAcceptCDCEvent(cdcEvent);
    }
  }
  getMetadataIngressReadiness(options = {}) {
    if (stryMutAct_9fa48("88995")) {
      {}
    } else {
      stryCov_9fa48("88995");
      return this.forwardingOwner.getMetadataIngressReadiness(options);
    }
  }
  async resolveMetadataIngressForwardSelection(options = {}) {
    if (stryMutAct_9fa48("88996")) {
      {}
    } else {
      stryCov_9fa48("88996");
      return this.forwardingOwner.resolveMetadataIngressForwardSelection(options);
    }
  }
  async forwardMetadataIngressPayloadToLeader(payload, options = {}) {
    if (stryMutAct_9fa48("88997")) {
      {}
    } else {
      stryCov_9fa48("88997");
      return this.forwardingOwner.forwardMetadataIngressPayloadToLeader(payload, options);
    }
  }
  isMetadataIngressReady(options = {}) {
    if (stryMutAct_9fa48("88998")) {
      {}
    } else {
      stryCov_9fa48("88998");
      return this.forwardingOwner.isMetadataIngressReady(options);
    }
  }
  isStrictForwardTargetEligible(target = null) {
    if (stryMutAct_9fa48("88999")) {
      {}
    } else {
      stryCov_9fa48("88999");
      return this.forwardingOwner.isStrictForwardTargetEligible(target);
    }
  }
  shouldAllowJoinConvergenceStrictTargeting() {
    if (stryMutAct_9fa48("89000")) {
      {}
    } else {
      stryCov_9fa48("89000");
      return this.forwardingOwner.shouldAllowJoinConvergenceStrictTargeting();
    }
  }
  resolveJoinConvergenceBootstrapForwardTarget() {
    if (stryMutAct_9fa48("89001")) {
      {}
    } else {
      stryCov_9fa48("89001");
      return this.forwardingOwner.resolveJoinConvergenceBootstrapForwardTarget();
    }
  }
  resolveCanonicalLeaderNodeIdFromCache() {
    if (stryMutAct_9fa48("89002")) {
      {}
    } else {
      stryCov_9fa48("89002");
      return this.forwardingOwner.resolveCanonicalLeaderNodeIdFromCache();
    }
  }
  isLocalForwardTarget(serviceId, address = null) {
    if (stryMutAct_9fa48("89003")) {
      {}
    } else {
      stryCov_9fa48("89003");
      return this.forwardingOwner.isLocalForwardTarget(serviceId, address);
    }
  }
  resolveForwardTargetNodeId(target = null) {
    if (stryMutAct_9fa48("89004")) {
      {}
    } else {
      stryCov_9fa48("89004");
      return this.forwardingOwner.resolveForwardTargetNodeId(target);
    }
  }
  isStrictForwardNodeReady(nodeId) {
    if (stryMutAct_9fa48("89005")) {
      {}
    } else {
      stryCov_9fa48("89005");
      return this.forwardingOwner.isStrictForwardNodeReady(nodeId);
    }
  }
  isStrictForwardNodeConnected(nodeId) {
    if (stryMutAct_9fa48("89006")) {
      {}
    } else {
      stryCov_9fa48("89006");
      return this.forwardingOwner.isStrictForwardNodeConnected(nodeId);
    }
  }
  getForwardTargetSuppressionKeys(target = {}) {
    if (stryMutAct_9fa48("89007")) {
      {}
    } else {
      stryCov_9fa48("89007");
      return this.forwardingOwner.getForwardTargetSuppressionKeys(target);
    }
  }
  pruneForwardTargetSuppressions(nowMs = this.now()) {
    if (stryMutAct_9fa48("89008")) {
      {}
    } else {
      stryCov_9fa48("89008");
      return this.forwardingOwner.pruneForwardTargetSuppressions(nowMs);
    }
  }
  isForwardTargetSuppressed(target = {}) {
    if (stryMutAct_9fa48("89009")) {
      {}
    } else {
      stryCov_9fa48("89009");
      return this.forwardingOwner.isForwardTargetSuppressed(target);
    }
  }
  suppressForwardTarget(target = {}) {
    if (stryMutAct_9fa48("89010")) {
      {}
    } else {
      stryCov_9fa48("89010");
      return this.forwardingOwner.suppressForwardTarget(target);
    }
  }
  clearForwardTargetSuppression(target = {}) {
    if (stryMutAct_9fa48("89011")) {
      {}
    } else {
      stryCov_9fa48("89011");
      return this.forwardingOwner.clearForwardTargetSuppression(target);
    }
  }
  shouldRepairForwardTopology(errorMessage) {
    if (stryMutAct_9fa48("89012")) {
      {}
    } else {
      stryCov_9fa48("89012");
      return this.forwardingOwner.shouldRepairForwardTopology(errorMessage);
    }
  }
  canRepairAuthoritativeForwardTopology() {
    if (stryMutAct_9fa48("89013")) {
      {}
    } else {
      stryCov_9fa48("89013");
      return this.forwardingOwner.canRepairAuthoritativeForwardTopology();
    }
  }
  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    if (stryMutAct_9fa48("89014")) {
      {}
    } else {
      stryCov_9fa48("89014");
      return this.forwardingOwner.maybeRepairAuthoritativeForwardTopology(context);
    }
  }
  async repairAuthoritativeForwardTopology(context = {}) {
    if (stryMutAct_9fa48("89015")) {
      {}
    } else {
      stryCov_9fa48("89015");
      return this.forwardingOwner.repairAuthoritativeForwardTopology(context);
    }
  }
  async applyAuthoritativeForwardTopologyRows(tableName, rows = stryMutAct_9fa48("89016") ? ["Stryker was here"] : (stryCov_9fa48("89016"), [])) {
    if (stryMutAct_9fa48("89017")) {
      {}
    } else {
      stryCov_9fa48("89017");
      return this.forwardingOwner.applyAuthoritativeForwardTopologyRows(tableName, rows);
    }
  }
  async reconcileAuthoritativeForwardServiceRows(authoritativeRows = stryMutAct_9fa48("89018") ? ["Stryker was here"] : (stryCov_9fa48("89018"), [])) {
    if (stryMutAct_9fa48("89019")) {
      {}
    } else {
      stryCov_9fa48("89019");
      return this.forwardingOwner.reconcileAuthoritativeForwardServiceRows(authoritativeRows);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("89020")) {
      {}
    } else {
      stryCov_9fa48("89020");
      return this.controlPlaneSystemTableGateway;
    }
  }
  areForwardTopologyRowsEqual(left, right) {
    if (stryMutAct_9fa48("89021")) {
      {}
    } else {
      stryCov_9fa48("89021");
      return this.forwardingOwner.areForwardTopologyRowsEqual(left, right);
    }
  }
  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    if (stryMutAct_9fa48("89022")) {
      {}
    } else {
      stryCov_9fa48("89022");
      return this.forwardingOwner.shouldSuppressForwardTarget(deliveryResult, errorMessage);
    }
  }
  isForwardTargetBackpressured(deliveryResult, errorMessage) {
    if (stryMutAct_9fa48("89023")) {
      {}
    } else {
      stryCov_9fa48("89023");
      return this.forwardingOwner.isForwardTargetBackpressured(deliveryResult, errorMessage);
    }
  }
  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    if (stryMutAct_9fa48("89024")) {
      {}
    } else {
      stryCov_9fa48("89024");
      return this.forwardingOwner.forwardCDCEventToLeader(tableName, operation, data, options);
    }
  }
  async forwardCDCBatchToLeader(events, options = {}) {
    if (stryMutAct_9fa48("89025")) {
      {}
    } else {
      stryCov_9fa48("89025");
      return this.forwardingOwner.forwardCDCBatchToLeader(events, options);
    }
  }
  async forwardCDCPayloadToLeader(payload, logContext = {}) {
    if (stryMutAct_9fa48("89026")) {
      {}
    } else {
      stryCov_9fa48("89026");
      return this.forwardingOwner.forwardCDCPayloadToLeader(payload, logContext);
    }
  } /**
    * Compute retry delay for CDC forward attempts.
    * @param {number} attempt
    * @return {number}
    * @private
    */
  computeCdcForwardRetryDelayMs(attempt) {
    if (stryMutAct_9fa48("89027")) {
      {}
    } else {
      stryCov_9fa48("89027");
      const retryInitialDelayMs = (stryMutAct_9fa48("89030") ? Number.isFinite(this.retryInitialDelayMs) || this.retryInitialDelayMs > NUM.ZERO : stryMutAct_9fa48("89029") ? false : stryMutAct_9fa48("89028") ? true : (stryCov_9fa48("89028", "89029", "89030"), Number.isFinite(this.retryInitialDelayMs) && (stryMutAct_9fa48("89033") ? this.retryInitialDelayMs <= NUM.ZERO : stryMutAct_9fa48("89032") ? this.retryInitialDelayMs >= NUM.ZERO : stryMutAct_9fa48("89031") ? true : (stryCov_9fa48("89031", "89032", "89033"), this.retryInitialDelayMs > NUM.ZERO)))) ? this.retryInitialDelayMs : NUM.HUNDRED;
      const retryBackoffMultiplier = (stryMutAct_9fa48("89036") ? Number.isFinite(this.retryBackoffMultiplier) || this.retryBackoffMultiplier >= NUM.ONE : stryMutAct_9fa48("89035") ? false : stryMutAct_9fa48("89034") ? true : (stryCov_9fa48("89034", "89035", "89036"), Number.isFinite(this.retryBackoffMultiplier) && (stryMutAct_9fa48("89039") ? this.retryBackoffMultiplier < NUM.ONE : stryMutAct_9fa48("89038") ? this.retryBackoffMultiplier > NUM.ONE : stryMutAct_9fa48("89037") ? true : (stryCov_9fa48("89037", "89038", "89039"), this.retryBackoffMultiplier >= NUM.ONE)))) ? this.retryBackoffMultiplier : NUM.TWO;
      const retryMaxDelayMs = (stryMutAct_9fa48("89042") ? Number.isFinite(this.retryMaxDelayMs) || this.retryMaxDelayMs > NUM.ZERO : stryMutAct_9fa48("89041") ? false : stryMutAct_9fa48("89040") ? true : (stryCov_9fa48("89040", "89041", "89042"), Number.isFinite(this.retryMaxDelayMs) && (stryMutAct_9fa48("89045") ? this.retryMaxDelayMs <= NUM.ZERO : stryMutAct_9fa48("89044") ? this.retryMaxDelayMs >= NUM.ZERO : stryMutAct_9fa48("89043") ? true : (stryCov_9fa48("89043", "89044", "89045"), this.retryMaxDelayMs > NUM.ZERO)))) ? this.retryMaxDelayMs : stryMutAct_9fa48("89046") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("89046"), TIME_MS.SECOND * NUM.TEN);
      return stryMutAct_9fa48("89047") ? Math.max(retryMaxDelayMs, Math.floor(retryInitialDelayMs * retryBackoffMultiplier ** Math.max(NUM.ZERO, attempt - NUM.TWO))) : (stryCov_9fa48("89047"), Math.min(retryMaxDelayMs, Math.floor(stryMutAct_9fa48("89048") ? retryInitialDelayMs / retryBackoffMultiplier ** Math.max(NUM.ZERO, attempt - NUM.TWO) : (stryCov_9fa48("89048"), retryInitialDelayMs * retryBackoffMultiplier ** (stryMutAct_9fa48("89049") ? Math.min(NUM.ZERO, attempt - NUM.TWO) : (stryCov_9fa48("89049"), Math.max(NUM.ZERO, stryMutAct_9fa48("89050") ? attempt + NUM.TWO : (stryCov_9fa48("89050"), attempt - NUM.TWO))))))));
    }
  }
  resolveStrictCdcForwardRetryAfterMs() {
    if (stryMutAct_9fa48("89051")) {
      {}
    } else {
      stryCov_9fa48("89051");
      return stryMutAct_9fa48("89052") ? Math.min(NUM.ONE, this.computeCdcForwardRetryDelayMs(NUM.ONE), Number.isFinite(this.forwardTargetSuppressionMs) ? this.forwardTargetSuppressionMs : NUM.ZERO, Number.isFinite(this.forwardTopologyRepairCooldownMs) ? this.forwardTopologyRepairCooldownMs : NUM.ZERO) : (stryCov_9fa48("89052"), Math.max(NUM.ONE, this.computeCdcForwardRetryDelayMs(NUM.ONE), Number.isFinite(this.forwardTargetSuppressionMs) ? this.forwardTargetSuppressionMs : NUM.ZERO, Number.isFinite(this.forwardTopologyRepairCooldownMs) ? this.forwardTopologyRepairCooldownMs : NUM.ZERO));
    }
  } /**
    * Compute bounded timeout for one CDC Raft propose attempt.
    * Keeps end-to-end forwarding attempts below transport message timeout.
    * @param {number} attemptBudget
    * @return {number}
    * @private
    */
  computeCdcProposeTimeoutMs(attemptBudget) {
    if (stryMutAct_9fa48("89053")) {
      {}
    } else {
      stryCov_9fa48("89053");
      const retryBudget = (stryMutAct_9fa48("89056") ? Number.isInteger(attemptBudget) || attemptBudget > NUM.ZERO : stryMutAct_9fa48("89055") ? false : stryMutAct_9fa48("89054") ? true : (stryCov_9fa48("89054", "89055", "89056"), Number.isInteger(attemptBudget) && (stryMutAct_9fa48("89059") ? attemptBudget <= NUM.ZERO : stryMutAct_9fa48("89058") ? attemptBudget >= NUM.ZERO : stryMutAct_9fa48("89057") ? true : (stryCov_9fa48("89057", "89058", "89059"), attemptBudget > NUM.ZERO)))) ? attemptBudget : NUM.ONE;
      const deliveryTimeoutMs = (stryMutAct_9fa48("89062") ? Number.isFinite(this.deliveryTimeoutMs) || this.deliveryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("89061") ? false : stryMutAct_9fa48("89060") ? true : (stryCov_9fa48("89060", "89061", "89062"), Number.isFinite(this.deliveryTimeoutMs) && (stryMutAct_9fa48("89065") ? this.deliveryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("89064") ? this.deliveryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("89063") ? true : (stryCov_9fa48("89063", "89064", "89065"), this.deliveryTimeoutMs > NUM.ZERO)))) ? Math.floor(this.deliveryTimeoutMs) : stryMutAct_9fa48("89066") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("89066"), TIME_MS.SECOND * NUM.FIVE);
      const safetyBufferMs = stryMutAct_9fa48("89067") ? NUM.TWO / NUM.HUNDRED : (stryCov_9fa48("89067"), NUM.TWO * NUM.HUNDRED);
      const perAttemptBudgetMs = Math.floor(stryMutAct_9fa48("89068") ? Math.max(NUM.HUNDRED, deliveryTimeoutMs - safetyBufferMs) * retryBudget : (stryCov_9fa48("89068"), (stryMutAct_9fa48("89069") ? Math.min(NUM.HUNDRED, deliveryTimeoutMs - safetyBufferMs) : (stryCov_9fa48("89069"), Math.max(NUM.HUNDRED, stryMutAct_9fa48("89070") ? deliveryTimeoutMs + safetyBufferMs : (stryCov_9fa48("89070"), deliveryTimeoutMs - safetyBufferMs)))) / retryBudget));
      const cappedBudgetMs = stryMutAct_9fa48("89071") ? Math.max(TIME_MS.SECOND + NUM.FIVE * NUM.HUNDRED, perAttemptBudgetMs) : (stryCov_9fa48("89071"), Math.min(stryMutAct_9fa48("89072") ? TIME_MS.SECOND - NUM.FIVE * NUM.HUNDRED : (stryCov_9fa48("89072"), TIME_MS.SECOND + (stryMutAct_9fa48("89073") ? NUM.FIVE / NUM.HUNDRED : (stryCov_9fa48("89073"), NUM.FIVE * NUM.HUNDRED))), perAttemptBudgetMs));
      return stryMutAct_9fa48("89074") ? Math.min(NUM.TWO * NUM.HUNDRED, cappedBudgetMs) : (stryCov_9fa48("89074"), Math.max(stryMutAct_9fa48("89075") ? NUM.TWO / NUM.HUNDRED : (stryCov_9fa48("89075"), NUM.TWO * NUM.HUNDRED), cappedBudgetMs));
    }
  } /**
    * Query the system table cache.
    * Returns a read-only view of the cache.
    * @param {string} tableName - System table name.
    * @param {Object} query - Query parameters.
    * @return {Promise<*>} Query result.
    */
  async querySystemCache(tableName, query = {}) {
    if (stryMutAct_9fa48("89076")) {
      {}
    } else {
      stryCov_9fa48("89076");
      if (stryMutAct_9fa48("89079") ? false : stryMutAct_9fa48("89078") ? true : stryMutAct_9fa48("89077") ? this.initialized : (stryCov_9fa48("89077", "89078", "89079"), !this.initialized)) {
        if (stryMutAct_9fa48("89080")) {
          {}
        } else {
          stryCov_9fa48("89080");
          throw new Error(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED);
        }
      } // Use read-only cache wrapper
      if (stryMutAct_9fa48("89082") ? false : stryMutAct_9fa48("89081") ? true : (stryCov_9fa48("89081", "89082"), query.key)) {
        if (stryMutAct_9fa48("89083")) {
          {}
        } else {
          stryCov_9fa48("89083");
          return this.readOnlyCache.get(tableName, query.key);
        }
      }
      if (stryMutAct_9fa48("89085") ? false : stryMutAct_9fa48("89084") ? true : (stryCov_9fa48("89084", "89085"), query.predicate)) {
        if (stryMutAct_9fa48("89086")) {
          {}
        } else {
          stryCov_9fa48("89086");
          if (stryMutAct_9fa48("89088") ? false : stryMutAct_9fa48("89087") ? true : (stryCov_9fa48("89087", "89088"), query.findOne)) {
            if (stryMutAct_9fa48("89089")) {
              {}
            } else {
              stryCov_9fa48("89089");
              return this.readOnlyCache.find(tableName, query.predicate);
            }
          }
          return stryMutAct_9fa48("89090") ? this.readOnlyCache : (stryCov_9fa48("89090"), this.readOnlyCache.filter(tableName, query.predicate));
        }
      }
      return this.readOnlyCache.getAll(tableName);
    }
  } /**
    * Get the read-only system table cache.
    * @return {ReadOnlySystemTableCache} Read-only cache wrapper.
    */
  getReadOnlyCache() {
    if (stryMutAct_9fa48("89091")) {
      {}
    } else {
      stryCov_9fa48("89091");
      return this.readOnlyCache;
    }
  } /**
    * Get the underlying writable cache (for CDC handlers only).
    * @return {SystemTableCache} Writable cache.
    */
  getWritableCache() {
    if (stryMutAct_9fa48("89092")) {
      {}
    } else {
      stryCov_9fa48("89092");
      return this.systemTableCache;
    }
  } /**
    * Set the CDC integration service for raft role updates.
    * @param {Object} cdcIntegrationService - CDC integration service.
    */
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("89093")) {
      {}
    } else {
      stryCov_9fa48("89093");
      this.cdcIntegrationService = cdcIntegrationService;
      this.maybeInitializeRebalancer();
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("89094")) {
          {}
        } else {
          stryCov_9fa48("89094");
          this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_PERSIST_ROLE_UPDATE_AFTER_CDC_SERVICE_SET, stryMutAct_9fa48("89095") ? {} : (stryCov_9fa48("89095"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("89096")) {
          {}
        } else {
          stryCov_9fa48("89096");
          this.logger.warn(MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_PERSIST_LEADER_UPDATE_AFTER_CDC_SERVICE_SET, stryMutAct_9fa48("89097") ? {} : (stryCov_9fa48("89097"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
    }
  } /**
    * Set table policy service for message-group rebalancing.
    * @param {Object} tablePolicyService - Table policy service.
    */
  setTablePolicyService(tablePolicyService) {
    if (stryMutAct_9fa48("89098")) {
      {}
    } else {
      stryCov_9fa48("89098");
      this.tablePolicyService = tablePolicyService;
      this.maybeInitializeRebalancer();
    }
  } /**
    * Set rebalance coordinator for message-group rebalancing.
    * @param {Object} rebalanceCoordinator - Rebalance coordinator.
    */
  setRebalanceCoordinator(rebalanceCoordinator) {
    if (stryMutAct_9fa48("89099")) {
      {}
    } else {
      stryCov_9fa48("89099");
      this.rebalanceCoordinator = rebalanceCoordinator;
      this.maybeInitializeRebalancer();
    }
  } /**
    * Initialize message-group rebalancer when leader and dependencies are ready.
    * @private
    */
  maybeInitializeRebalancer() {
    if (stryMutAct_9fa48("89100")) {
      {}
    } else {
      stryCov_9fa48("89100");
      const backgroundReady = this.isBackgroundWorkReady();
      if (stryMutAct_9fa48("89102") ? false : stryMutAct_9fa48("89101") ? true : (stryCov_9fa48("89101", "89102"), this.rebalancer)) {
        if (stryMutAct_9fa48("89103")) {
          {}
        } else {
          stryCov_9fa48("89103");
          this.rebalancer.systemTableCache = this.systemTableCache;
          this.rebalancer.cdcIntegrationService = this.cdcIntegrationService;
          this.rebalancer.tablePolicyService = this.tablePolicyService;
          if (stryMutAct_9fa48("89106") ? typeof this.rebalancer.setRebalanceCoordinator === TYPEOF.FUNCTION : stryMutAct_9fa48("89105") ? false : stryMutAct_9fa48("89104") ? true : (stryCov_9fa48("89104", "89105", "89106"), typeof this.rebalancer.setRebalanceCoordinator !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("89107")) {
              {}
            } else {
              stryCov_9fa48("89107");
              throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_REBALANCER_SET_COORDINATOR);
            }
          }
          this.rebalancer.setRebalanceCoordinator(this.rebalanceCoordinator);
          this.rebalancer.messageRouter = this.transport;
          this.rebalancer.sqlQueryEngine = stryMutAct_9fa48("89110") ? this.cdcIntegrationService?.sqlQueryEngine && null : stryMutAct_9fa48("89109") ? false : stryMutAct_9fa48("89108") ? true : (stryCov_9fa48("89108", "89109", "89110"), (stryMutAct_9fa48("89111") ? this.cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("89111"), this.cdcIntegrationService?.sqlQueryEngine)) || null);
          this.rebalancer.setLeader(stryMutAct_9fa48("89114") ? backgroundReady || this.isLeaderReplica() : stryMutAct_9fa48("89113") ? false : stryMutAct_9fa48("89112") ? true : (stryCov_9fa48("89112", "89113", "89114"), backgroundReady && this.isLeaderReplica()));
          return;
        }
      }
      if (stryMutAct_9fa48("89117") ? (!backgroundReady || !this.initialized) && !this.isLeaderReplica() : stryMutAct_9fa48("89116") ? false : stryMutAct_9fa48("89115") ? true : (stryCov_9fa48("89115", "89116", "89117"), (stryMutAct_9fa48("89119") ? !backgroundReady && !this.initialized : stryMutAct_9fa48("89118") ? false : (stryCov_9fa48("89118", "89119"), (stryMutAct_9fa48("89120") ? backgroundReady : (stryCov_9fa48("89120"), !backgroundReady)) || (stryMutAct_9fa48("89121") ? this.initialized : (stryCov_9fa48("89121"), !this.initialized)))) || (stryMutAct_9fa48("89122") ? this.isLeaderReplica() : (stryCov_9fa48("89122"), !this.isLeaderReplica())))) {
        if (stryMutAct_9fa48("89123")) {
          {}
        } else {
          stryCov_9fa48("89123");
          return;
        }
      }
      if (stryMutAct_9fa48("89126") ? (!this.systemTableCache || !this.cdcIntegrationService || !this.tablePolicyService || !this.rebalanceCoordinator) && !this.transport : stryMutAct_9fa48("89125") ? false : stryMutAct_9fa48("89124") ? true : (stryCov_9fa48("89124", "89125", "89126"), (stryMutAct_9fa48("89128") ? (!this.systemTableCache || !this.cdcIntegrationService || !this.tablePolicyService) && !this.rebalanceCoordinator : stryMutAct_9fa48("89127") ? false : (stryCov_9fa48("89127", "89128"), (stryMutAct_9fa48("89130") ? (!this.systemTableCache || !this.cdcIntegrationService) && !this.tablePolicyService : stryMutAct_9fa48("89129") ? false : (stryCov_9fa48("89129", "89130"), (stryMutAct_9fa48("89132") ? !this.systemTableCache && !this.cdcIntegrationService : stryMutAct_9fa48("89131") ? false : (stryCov_9fa48("89131", "89132"), (stryMutAct_9fa48("89133") ? this.systemTableCache : (stryCov_9fa48("89133"), !this.systemTableCache)) || (stryMutAct_9fa48("89134") ? this.cdcIntegrationService : (stryCov_9fa48("89134"), !this.cdcIntegrationService)))) || (stryMutAct_9fa48("89135") ? this.tablePolicyService : (stryCov_9fa48("89135"), !this.tablePolicyService)))) || (stryMutAct_9fa48("89136") ? this.rebalanceCoordinator : (stryCov_9fa48("89136"), !this.rebalanceCoordinator)))) || (stryMutAct_9fa48("89137") ? this.transport : (stryCov_9fa48("89137"), !this.transport)))) {
        if (stryMutAct_9fa48("89138")) {
          {}
        } else {
          stryCov_9fa48("89138");
          return;
        }
      }
      this.rebalancer = new UnifiedRebalancer(stryMutAct_9fa48("89139") ? {} : (stryCov_9fa48("89139"), {
        entityId: this.groupId,
        entityType: RebalancerEntityType.MESSAGE_GROUP,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        tablePolicyService: this.tablePolicyService,
        nodeId: this.nodeId,
        messageRouter: this.transport,
        sqlQueryEngine: this.cdcIntegrationService.sqlQueryEngine,
        rebalanceCoordinator: this.rebalanceCoordinator
      }));
      this.rebalancer.initialize();
      this.rebalancer.setLeader(stryMutAct_9fa48("89142") ? backgroundReady || this.isLeaderReplica() : stryMutAct_9fa48("89141") ? false : stryMutAct_9fa48("89140") ? true : (stryCov_9fa48("89140", "89141", "89142"), backgroundReady && this.isLeaderReplica()));
    }
  } /**
    * Update rebalancer leadership when raft role changes.
    * @private
    */
  updateRebalancerLeadership() {
    if (stryMutAct_9fa48("89143")) {
      {}
    } else {
      stryCov_9fa48("89143");
      if (stryMutAct_9fa48("89145") ? false : stryMutAct_9fa48("89144") ? true : (stryCov_9fa48("89144", "89145"), this.rebalancer)) {
        if (stryMutAct_9fa48("89146")) {
          {}
        } else {
          stryCov_9fa48("89146");
          this.rebalancer.setLeader(stryMutAct_9fa48("89149") ? this.isBackgroundWorkReady() || this.isLeaderReplica() : stryMutAct_9fa48("89148") ? false : stryMutAct_9fa48("89147") ? true : (stryCov_9fa48("89147", "89148", "89149"), this.isBackgroundWorkReady() && this.isLeaderReplica()));
          return;
        }
      }
      this.maybeInitializeRebalancer();
    }
  }
  cancelLeaderOwnedActivation() {
    if (stryMutAct_9fa48("89150")) {
      {}
    } else {
      stryCov_9fa48("89150");
      this.leaderActivationGate.cancel(stryMutAct_9fa48("89151") ? {} : (stryCov_9fa48("89151"), {
        clearActivatedTerm: stryMutAct_9fa48("89152") ? false : (stryCov_9fa48("89152"), true)
      }));
    }
  }
  scheduleLeaderOwnedActivation(term) {
    if (stryMutAct_9fa48("89153")) {
      {}
    } else {
      stryCov_9fa48("89153");
      this.leaderActivationGate.schedule(term, () => {
        if (stryMutAct_9fa48("89154")) {
          {}
        } else {
          stryCov_9fa48("89154");
          if (stryMutAct_9fa48("89157") ? !this.raft && !this.isLeaderReplica() : stryMutAct_9fa48("89156") ? false : stryMutAct_9fa48("89155") ? true : (stryCov_9fa48("89155", "89156", "89157"), (stryMutAct_9fa48("89158") ? this.raft : (stryCov_9fa48("89158"), !this.raft)) || (stryMutAct_9fa48("89159") ? this.isLeaderReplica() : (stryCov_9fa48("89159"), !this.isLeaderReplica())))) {
            if (stryMutAct_9fa48("89160")) {
              {}
            } else {
              stryCov_9fa48("89160");
              return;
            }
          }
          this.updateRebalancerLeadership();
          const existingSubscriptions = this.cdcHandler.getSubscriptions();
          if (stryMutAct_9fa48("89163") ? existingSubscriptions.length > NUM.ZERO || this.lastLeaderCdcResubscribeTerm !== term : stryMutAct_9fa48("89162") ? false : stryMutAct_9fa48("89161") ? true : (stryCov_9fa48("89161", "89162", "89163"), (stryMutAct_9fa48("89166") ? existingSubscriptions.length <= NUM.ZERO : stryMutAct_9fa48("89165") ? existingSubscriptions.length >= NUM.ZERO : stryMutAct_9fa48("89164") ? true : (stryCov_9fa48("89164", "89165", "89166"), existingSubscriptions.length > NUM.ZERO)) && (stryMutAct_9fa48("89168") ? this.lastLeaderCdcResubscribeTerm === term : stryMutAct_9fa48("89167") ? true : (stryCov_9fa48("89167", "89168"), this.lastLeaderCdcResubscribeTerm !== term)))) {
            if (stryMutAct_9fa48("89169")) {
              {}
            } else {
              stryCov_9fa48("89169");
              this.lastLeaderCdcResubscribeTerm = term;
              this.logger.info(MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER, stryMutAct_9fa48("89170") ? {} : (stryCov_9fa48("89170"), {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length
              }));
              for (const tableName of existingSubscriptions) {
                if (stryMutAct_9fa48("89171")) {
                  {}
                } else {
                  stryCov_9fa48("89171");
                  this.subscribeToCDC(tableName);
                }
              }
              this.logger.info(MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER_COMPLETE, stryMutAct_9fa48("89172") ? {} : (stryCov_9fa48("89172"), {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length
              }));
            }
          }
          this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.BECAME_LEADER, stryMutAct_9fa48("89173") ? {} : (stryCov_9fa48("89173"), {
            term,
            replicaId: this.replicaId,
            groupId: this.groupId
          }));
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED, stryMutAct_9fa48("89174") ? {} : (stryCov_9fa48("89174"), {
            leaderId: this.replicaId,
            term,
            groupId: this.groupId
          }));
        }
      }, stryMutAct_9fa48("89175") ? {} : (stryCov_9fa48("89175"), {
        shouldActivate: stryMutAct_9fa48("89176") ? () => undefined : (stryCov_9fa48("89176"), () => stryMutAct_9fa48("89179") ? this.raft !== null || this.isLeaderReplica() : stryMutAct_9fa48("89178") ? false : stryMutAct_9fa48("89177") ? true : (stryCov_9fa48("89177", "89178", "89179"), (stryMutAct_9fa48("89181") ? this.raft === null : stryMutAct_9fa48("89180") ? true : (stryCov_9fa48("89180", "89181"), this.raft !== null)) && this.isLeaderReplica()))
      }));
    }
  } /**
    * Queue a raft role update for persistence.
    * @param {string} role - New raft role.
    * @private
    */
  queueRoleUpdate(role) {
    if (stryMutAct_9fa48("89182")) {
      {}
    } else {
      stryCov_9fa48("89182");
      this.roleMutationHelper.queue(normalizePublishedRaftRole(role, stryMutAct_9fa48("89183") ? {} : (stryCov_9fa48("89183"), {
        collapseLeaderToFollower: stryMutAct_9fa48("89184") ? false : (stryCov_9fa48("89184"), true)
      })));
    }
  } /**
    * Queue a message group leader update for persistence.
    * @param {string} leaderNodeId - Leader node ID.
    * @private
    */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("89185")) {
      {}
    } else {
      stryCov_9fa48("89185");
      this.leaderNodeMutationHelper.queue(leaderNodeId);
    }
  } /**
    * Persist the latest pending raft role update.
    * @return {Promise<void>}
    * @private
    */
  async flushRoleUpdate() {
    if (stryMutAct_9fa48("89186")) {
      {}
    } else {
      stryCov_9fa48("89186");
      return this.roleMutationHelper.flush();
    }
  } /**
    * Persist the latest pending message group leader update.
    * @return {Promise<void>}
    * @private
    */
  async flushLeaderNodeUpdate() {
    if (stryMutAct_9fa48("89187")) {
      {}
    } else {
      stryCov_9fa48("89187");
      return this.leaderNodeMutationHelper.flush();
    }
  } /**
    * Check if the message_groups partition leader is available for writes.
    * @return {boolean} True if a leader with an address is known.
    * @private
    */
  isMessageGroupsLeaderAvailable() {
    if (stryMutAct_9fa48("89188")) {
      {}
    } else {
      stryCov_9fa48("89188");
      if (stryMutAct_9fa48("89190") ? false : stryMutAct_9fa48("89189") ? true : (stryCov_9fa48("89189", "89190"), isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.MESSAGE_GROUPS))) {
        if (stryMutAct_9fa48("89191")) {
          {}
        } else {
          stryCov_9fa48("89191");
          return stryMutAct_9fa48("89192") ? false : (stryCov_9fa48("89192"), true);
        }
      }
      return stryMutAct_9fa48("89195") ? this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.MESSAGE_GROUPS) !== true : stryMutAct_9fa48("89194") ? false : stryMutAct_9fa48("89193") ? true : (stryCov_9fa48("89193", "89194", "89195"), (stryMutAct_9fa48("89197") ? this.cdcIntegrationService.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.MESSAGE_GROUPS) : stryMutAct_9fa48("89196") ? this.cdcIntegrationService?.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.MESSAGE_GROUPS) : (stryCov_9fa48("89196", "89197"), this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.MESSAGE_GROUPS))) === (stryMutAct_9fa48("89198") ? false : (stryCov_9fa48("89198"), true)));
    }
  } /**
    * Check if the services table is writable through either cache-visible
    * routing metadata or the local services-p1 leader owner.
    * @return {boolean} True if writes can be issued safely.
    * @private
    */
  isServicesLeaderAvailable() {
    if (stryMutAct_9fa48("89199")) {
      {}
    } else {
      stryCov_9fa48("89199");
      if (stryMutAct_9fa48("89201") ? false : stryMutAct_9fa48("89200") ? true : (stryCov_9fa48("89200", "89201"), isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES))) {
        if (stryMutAct_9fa48("89202")) {
          {}
        } else {
          stryCov_9fa48("89202");
          return stryMutAct_9fa48("89203") ? false : (stryCov_9fa48("89203"), true);
        }
      }
      return stryMutAct_9fa48("89206") ? this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES) !== true : stryMutAct_9fa48("89205") ? false : stryMutAct_9fa48("89204") ? true : (stryCov_9fa48("89204", "89205", "89206"), (stryMutAct_9fa48("89208") ? this.cdcIntegrationService.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES) : stryMutAct_9fa48("89207") ? this.cdcIntegrationService?.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.SERVICES) : (stryCov_9fa48("89207", "89208"), this.cdcIntegrationService?.canWriteSystemTableLocally?.(SYSTEM_TABLE_NAME.SERVICES))) === (stryMutAct_9fa48("89209") ? false : (stryCov_9fa48("89209"), true)));
    }
  }
  getMetadataPublicationDeliveryPriority() {
    if (stryMutAct_9fa48("89210")) {
      {}
    } else {
      stryCov_9fa48("89210");
      return (stryMutAct_9fa48("89213") ? this.groupId !== INITIAL_MESSAGE_GROUP_ID : stryMutAct_9fa48("89212") ? false : stryMutAct_9fa48("89211") ? true : (stryCov_9fa48("89211", "89212", "89213"), this.groupId === INITIAL_MESSAGE_GROUP_ID)) ? MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL : MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND;
    }
  }
  getMetadataPublicationReadinessDimension() {
    if (stryMutAct_9fa48("89214")) {
      {}
    } else {
      stryCov_9fa48("89214");
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
  } /**
    * Check if this replica is the leader.
    * Requirements: 5.5
    * @return {boolean} True if leader.
    */
  isLeaderReplica() {
    if (stryMutAct_9fa48("89215")) {
      {}
    } else {
      stryCov_9fa48("89215");
      return stryMutAct_9fa48("89218") ? this.role !== RaftRole.LEADER : stryMutAct_9fa48("89217") ? false : stryMutAct_9fa48("89216") ? true : (stryCov_9fa48("89216", "89217", "89218"), this.role === RaftRole.LEADER);
    }
  } /**
    * Get the current leader ID.
    * Requirements: 5.4
    * @return {string|null} Leader replica ID.
    */
  getLeaderId() {
    if (stryMutAct_9fa48("89219")) {
      {}
    } else {
      stryCov_9fa48("89219");
      return this.leaderId;
    }
  } /**
    * Get the current Raft role.
    * Requirements: 5.5
    * @return {string} Current role.
    */
  getRole() {
    if (stryMutAct_9fa48("89220")) {
      {}
    } else {
      stryCov_9fa48("89220");
      return this.role;
    }
  } /**
    * Get the current term.
    * @return {number} Current term.
    */
  getCurrentTerm() {
    if (stryMutAct_9fa48("89221")) {
      {}
    } else {
      stryCov_9fa48("89221");
      return this.raft ? this.raftProvider.getCurrentTerm(this.raft) : this.operationLedger.currentTerm;
    }
  } /**
    * Get pending message count.
    * @return {number} Number of pending messages.
    */
  getPendingMessageCount() {
    if (stryMutAct_9fa48("89222")) {
      {}
    } else {
      stryCov_9fa48("89222");
      return this.pendingMessages.size;
    }
  } /**
    * Get service status.
    * @return {Object} Service status.
    */
  getStatus() {
    if (stryMutAct_9fa48("89223")) {
      {}
    } else {
      stryCov_9fa48("89223");
      return stryMutAct_9fa48("89224") ? {} : (stryCov_9fa48("89224"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        role: this.role,
        isLeader: this.isLeader,
        leaderId: this.leaderId,
        term: this.raft ? this.raftProvider.getCurrentTerm(this.raft) : this.operationLedger.currentTerm,
        logLength: this.operationLedger.getLogLength(),
        pendingMessages: this.pendingMessages.size,
        acknowledgedMessages: this.acknowledgedMessages.size,
        cdcSubscriptions: this.cdcHandler.getSubscriptions(),
        initialized: this.initialized
      });
    }
  } /**
    * Sleep for a specified duration.
    * @param {number} ms - Milliseconds to sleep.
    * @return {Promise<void>}
    * @private
    */
  sleep(ms) {
    if (stryMutAct_9fa48("89225")) {
      {}
    } else {
      stryCov_9fa48("89225");
      return new Promise(stryMutAct_9fa48("89226") ? () => undefined : (stryCov_9fa48("89226"), resolve => setTimeout(resolve, ms)));
    }
  } /**
    * Stop message-group rebalancing activity.
    * @return {Promise<void>}
    */
  async quiesceRebalancing() {
    if (stryMutAct_9fa48("89227")) {
      {}
    } else {
      stryCov_9fa48("89227");
      if (stryMutAct_9fa48("89229") ? false : stryMutAct_9fa48("89228") ? true : (stryCov_9fa48("89228", "89229"), this.rebalancer)) {
        if (stryMutAct_9fa48("89230")) {
          {}
        } else {
          stryCov_9fa48("89230");
          this.rebalancer.setLeader(stryMutAct_9fa48("89231") ? true : (stryCov_9fa48("89231"), false));
          this.rebalancer.shutdown();
          this.rebalancer = null;
        }
      }
    }
  } /**
    * Shutdown the message group service.
    * @return {Promise<void>}
    */
  async shutdown() {
    if (stryMutAct_9fa48("89232")) {
      {}
    } else {
      stryCov_9fa48("89232");
      this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.SHUTTING_DOWN_MESSAGE_GROUP_SERVICE, stryMutAct_9fa48("89233") ? {} : (stryCov_9fa48("89233"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));
      this.leaderActivationGate.shutdown();
      this.peerReconciliationScheduled = stryMutAct_9fa48("89234") ? true : (stryCov_9fa48("89234"), false);
      if (stryMutAct_9fa48("89237") ? this.systemTableCache && typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION || this.systemTableCacheChangeListener : stryMutAct_9fa48("89236") ? false : stryMutAct_9fa48("89235") ? true : (stryCov_9fa48("89235", "89236", "89237"), (stryMutAct_9fa48("89239") ? this.systemTableCache || typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("89238") ? true : (stryCov_9fa48("89238", "89239"), this.systemTableCache && (stryMutAct_9fa48("89241") ? typeof this.systemTableCache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("89240") ? true : (stryCov_9fa48("89240", "89241"), typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION)))) && this.systemTableCacheChangeListener)) {
        if (stryMutAct_9fa48("89242")) {
          {}
        } else {
          stryCov_9fa48("89242");
          this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
        }
      } // End liferaft instance - clear all timers first
      if (stryMutAct_9fa48("89244") ? false : stryMutAct_9fa48("89243") ? true : (stryCov_9fa48("89243", "89244"), this.raft)) {
        if (stryMutAct_9fa48("89245")) {
          {}
        } else {
          stryCov_9fa48("89245");
          this.raftProvider.shutdownNode(this.raft);
          this.raft = null;
        }
      }
      this.joinSuppressedHeartbeat = null;
      if (stryMutAct_9fa48("89248") ? typeof this.releaseMetadataPublicationReadinessListener !== TYPEOF.FUNCTION : stryMutAct_9fa48("89247") ? false : stryMutAct_9fa48("89246") ? true : (stryCov_9fa48("89246", "89247", "89248"), typeof this.releaseMetadataPublicationReadinessListener === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("89249")) {
          {}
        } else {
          stryCov_9fa48("89249");
          this.releaseMetadataPublicationReadinessListener();
        }
      }
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.roleMutationHelper.shutdown();
      this.leaderNodeMutationHelper.shutdown();
      await this.quiesceRebalancing();
      this.cdcHandler.shutdown();
      this.initialized = stryMutAct_9fa48("89250") ? true : (stryCov_9fa48("89250"), false);
      this.pendingMessages.clear();
      this.messageCallbacks.clear();
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.SHUTDOWN, stryMutAct_9fa48("89251") ? {} : (stryCov_9fa48("89251"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));
    }
  }
}
export { MessageGroupOperationLedger, MessageGroupService, MessageStatus, RaftRole, isRaftPacket, RAFT_PACKET_TYPES };