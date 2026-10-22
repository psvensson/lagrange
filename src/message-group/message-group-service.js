/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups, each replica on its raft-rs semantic
 * operation port (the consensus runtime owner makes every Raft decision).
 *
 * Public seam: composes the MessageGroupService class from its semantic
 * method-group modules (construction/state, peer resolution, metadata
 * publication, raft lifecycle, raft timing) plus the generated runtime
 * methods, then re-exports the stable public surface.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */
import {v4 as uuidv4} from 'uuid';
import {
  NUM,
  METRICS_LOG_TAG,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {
  UnifiedRebalancer,
  EntityType as RebalancerEntityType,
} from '../rebalancer/unified-rebalancer.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
  MESSAGE_GROUP_CDC_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
} from './message-group-forwarding-owner.js';
import {createMessageGroupServiceRuntimeMethods} from './message-group-service-runtime-methods.js';
import {getOrCreateCauseId, normalizeCauseId} from '../utils/cause-id.js';
import {MessageGroupOperationLedger} from './message-group-operation-ledger.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';
import {MessageGroupService} from './message-group-service-state.js';
import {assignPeerResolution} from './message-group-service-peer-resolution.js';
import {assignMetadataPublication} from './message-group-service-metadata-publication.js';
import {assignRaftLifecycle} from './message-group-service-raft-lifecycle.js';
import {assignRaftTiming} from './message-group-service-raft-timing.js';
import {
  CDC_FORWARD_MAX_RELAY_DEPTH,
  DIRECT_ONLY_MESSAGE_TYPES,
  MESSAGE_DELIVERY_MODE,
  MESSAGE_GROUP_SERVICE_LITERAL,
  boundCdcForwardErrorDetail,
  buildDeferredCdcForwardError,
  buildDeferredDeliveryError,
  buildLatencyCdcPropagationResult,
  normalizeMessageDeliveryMode,
  resolveTransportDeliveryOptions,
  shouldDeferImmediateDeliveryRetry,
  wrapCdcProposeError,
} from './message-group-service-runtime-support.js';

// Compose the semantic method groups onto the public class prototype.
assignPeerResolution(MessageGroupService);
assignMetadataPublication(MessageGroupService);
assignRaftLifecycle(MessageGroupService);
assignRaftTiming(MessageGroupService);

const MESSAGE_GROUP_SERVICE_RUNTIME_METHODS =
  createMessageGroupServiceRuntimeMethods({
    CDC_FORWARD_MAX_RELAY_DEPTH,
    CONTROL_PLANE_READINESS_DIMENSION,
    DIRECT_ONLY_MESSAGE_TYPES,
    HLCTimestamp,
    INITIAL_MESSAGE_GROUP_ID,
    MESSAGE_DELIVERY_MODE,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
    MESSAGE_GROUP_SERVICE_ERROR_MSG,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MESSAGE_GROUP_SERVICE_LOG_MSG,
    METRICS_LOG_TAG,
    MessageStatus,
    NUM,
    QUERY_MESSAGE_TYPE,
    RebalancerEntityType,
    SYSTEM_TABLE_NAME,
    TIME_MS,
    TYPEOF,
    UnifiedRebalancer,
    boundCdcForwardErrorDetail,
    buildDeferredCdcForwardError,
    buildDeferredDeliveryError,
    buildLatencyCdcPropagationResult,
    getOrCreateCauseId,
    isSystemTableWriteReady,
    normalizeCauseId,
    normalizeMessageDeliveryMode,
    normalizePublishedRaftRole,
    resolveTransportDeliveryOptions,
    shouldDeferImmediateDeliveryRetry,
    uuidv4,
    wrapCdcProposeError,
    RaftRole,
  });

Object.assign(
  MessageGroupService.prototype,
  MESSAGE_GROUP_SERVICE_RUNTIME_METHODS,
);

export {
  MessageGroupOperationLedger,
  MessageGroupService,
  MessageStatus,
  RaftRole,
};
