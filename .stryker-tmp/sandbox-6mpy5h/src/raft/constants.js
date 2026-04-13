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
import { ADDRESS } from '../constants/index.js';
import { OUTBOUND_DELIVERY_PRIORITY } from '../constants/transport.js';
import { isCriticalTransportControlPlanePartition } from '../bootstrap/system-partition-classification.js';
const RAFT_PACKET_TYPE = Object.freeze(stryMutAct_9fa48("126802") ? {} : (stryCov_9fa48("126802"), {
  VOTE: stryMutAct_9fa48("126803") ? "" : (stryCov_9fa48("126803"), 'vote'),
  VOTED: stryMutAct_9fa48("126804") ? "" : (stryCov_9fa48("126804"), 'voted'),
  APPEND: stryMutAct_9fa48("126805") ? "" : (stryCov_9fa48("126805"), 'append'),
  APPEND_ACK: stryMutAct_9fa48("126806") ? "" : (stryCov_9fa48("126806"), 'append ack'),
  APPEND_FAIL: stryMutAct_9fa48("126807") ? "" : (stryCov_9fa48("126807"), 'append fail'),
  EXEC: stryMutAct_9fa48("126808") ? "" : (stryCov_9fa48("126808"), 'exec'),
  APPENDED: stryMutAct_9fa48("126809") ? "" : (stryCov_9fa48("126809"), 'appended'),
  ERROR: stryMutAct_9fa48("126810") ? "" : (stryCov_9fa48("126810"), 'error')
}));
const RAFT_PACKET_TYPES = new Set(Object.values(RAFT_PACKET_TYPE));
const RAFT_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("126811") ? {} : (stryCov_9fa48("126811"), {
  REQUEST_VOTE: stryMutAct_9fa48("126812") ? "" : (stryCov_9fa48("126812"), 'RAFT_REQUEST_VOTE'),
  REQUEST_VOTE_RESPONSE: stryMutAct_9fa48("126813") ? "" : (stryCov_9fa48("126813"), 'RAFT_REQUEST_VOTE_RESPONSE'),
  APPEND_ENTRIES: stryMutAct_9fa48("126814") ? "" : (stryCov_9fa48("126814"), 'RAFT_APPEND_ENTRIES'),
  APPEND_ENTRIES_RESPONSE: stryMutAct_9fa48("126815") ? "" : (stryCov_9fa48("126815"), 'RAFT_APPEND_ENTRIES_RESPONSE')
}));

// Use a null-prototype object so lookups like map['valueOf'] don't resolve to
// Object.prototype and accidentally match "unknown" packet types.
const RAFT_PACKET_MESSAGE_TYPE = Object.freeze(Object.assign(Object.create(null), stryMutAct_9fa48("126816") ? {} : (stryCov_9fa48("126816"), {
  [RAFT_PACKET_TYPE.VOTE]: RAFT_MESSAGE_TYPE.REQUEST_VOTE,
  [RAFT_PACKET_TYPE.VOTED]: RAFT_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE,
  [RAFT_PACKET_TYPE.APPEND]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES,
  [RAFT_PACKET_TYPE.APPENDED]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES_RESPONSE
})));
const RAFT_ROLE = Object.freeze(stryMutAct_9fa48("126817") ? {} : (stryCov_9fa48("126817"), {
  FOLLOWER: stryMutAct_9fa48("126818") ? "" : (stryCov_9fa48("126818"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("126819") ? "" : (stryCov_9fa48("126819"), 'candidate'),
  LEADER: stryMutAct_9fa48("126820") ? "" : (stryCov_9fa48("126820"), 'leader'),
  LEARNER: stryMutAct_9fa48("126821") ? "" : (stryCov_9fa48("126821"), 'learner') // Non-voting member during catch-up phase
}));
const RAFT_EVENT = Object.freeze(stryMutAct_9fa48("126822") ? {} : (stryCov_9fa48("126822"), {
  LEADER: RAFT_ROLE.LEADER,
  FOLLOWER: RAFT_ROLE.FOLLOWER,
  CANDIDATE: RAFT_ROLE.CANDIDATE,
  LEADER_CHANGE: stryMutAct_9fa48("126823") ? "" : (stryCov_9fa48("126823"), 'leader change'),
  COMMIT: stryMutAct_9fa48("126824") ? "" : (stryCov_9fa48("126824"), 'commit'),
  TERM_CHANGE: stryMutAct_9fa48("126825") ? "" : (stryCov_9fa48("126825"), 'term change')
}));
const RAFT_ERROR_NAME = Object.freeze(stryMutAct_9fa48("126826") ? {} : (stryCov_9fa48("126826"), {
  NOT_FOUND: stryMutAct_9fa48("126827") ? "" : (stryCov_9fa48("126827"), 'NotFoundError')
}));
const RAFT_TRANSPORT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("126828") ? {} : (stryCov_9fa48("126828"), {
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("126829") ? "" : (stryCov_9fa48("126829"), 'messageRouter is required'),
  ENTITY_TYPE_REQUIRED: stryMutAct_9fa48("126830") ? "" : (stryCov_9fa48("126830"), 'entityType is required'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("126831") ? "" : (stryCov_9fa48("126831"), 'nodeId is required')
}));
const RAFT_ELECTION_TIMING = Object.freeze(stryMutAct_9fa48("126832") ? {} : (stryCov_9fa48("126832"), {
  HEARTBEAT_DEFAULT_MS: 150,
  ELECTION_MIN_DEFAULT_MS: 1000,
  ELECTION_MAX_DEFAULT_MS: 3000,
  // Jitter added per replica index to stagger election timeouts.
  // Must be >= (ELECTION_MAX - ELECTION_MIN) so that replica N's max
  // timeout is always less than replica N+1's min timeout.
  // This guarantees lower-indexed replicas always fire first,
  // preventing re-elections and leadership instability.
  JITTER_PER_REPLICA_MS: 2500
}));
const RAFT_TRANSPORT_LOG_MSG = Object.freeze(stryMutAct_9fa48("126833") ? {} : (stryCov_9fa48("126833"), {
  WRITE: stryMutAct_9fa48("126834") ? "" : (stryCov_9fa48("126834"), '[RaftTransportAdapter] write:'),
  WRITE_ERROR: stryMutAct_9fa48("126835") ? "" : (stryCov_9fa48("126835"), '[RaftTransportAdapter] write error:')
}));
const RAFT_TRANSPORT_DELIVERY_OPTIONS = Object.freeze(stryMutAct_9fa48("126836") ? {} : (stryCov_9fa48("126836"), {
  deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.CRITICAL
}));
const RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS = Object.freeze(stryMutAct_9fa48("126837") ? {} : (stryCov_9fa48("126837"), {
  deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.BACKGROUND
}));
const REPLICA_SERVICE_SUFFIX_PATTERN = stryMutAct_9fa48("126840") ? /-r\D+$/ : stryMutAct_9fa48("126839") ? /-r\d$/ : stryMutAct_9fa48("126838") ? /-r\d+/ : (stryCov_9fa48("126838", "126839", "126840"), /-r\d+$/);
function extractServiceIdFromUnifiedAddress(address) {
  if (stryMutAct_9fa48("126841")) {
    {}
  } else {
    stryCov_9fa48("126841");
    if (stryMutAct_9fa48("126844") ? typeof address !== 'string' && address.length === 0 : stryMutAct_9fa48("126843") ? false : stryMutAct_9fa48("126842") ? true : (stryCov_9fa48("126842", "126843", "126844"), (stryMutAct_9fa48("126846") ? typeof address === 'string' : stryMutAct_9fa48("126845") ? false : (stryCov_9fa48("126845", "126846"), typeof address !== (stryMutAct_9fa48("126847") ? "" : (stryCov_9fa48("126847"), 'string')))) || (stryMutAct_9fa48("126849") ? address.length !== 0 : stryMutAct_9fa48("126848") ? false : (stryCov_9fa48("126848", "126849"), address.length === 0)))) {
      if (stryMutAct_9fa48("126850")) {
        {}
      } else {
        stryCov_9fa48("126850");
        return null;
      }
    }
    const separatorIndex = address.lastIndexOf(ADDRESS.SEPARATOR);
    if (stryMutAct_9fa48("126853") ? separatorIndex <= 0 && separatorIndex === address.length - 1 : stryMutAct_9fa48("126852") ? false : stryMutAct_9fa48("126851") ? true : (stryCov_9fa48("126851", "126852", "126853"), (stryMutAct_9fa48("126856") ? separatorIndex > 0 : stryMutAct_9fa48("126855") ? separatorIndex < 0 : stryMutAct_9fa48("126854") ? false : (stryCov_9fa48("126854", "126855", "126856"), separatorIndex <= 0)) || (stryMutAct_9fa48("126858") ? separatorIndex !== address.length - 1 : stryMutAct_9fa48("126857") ? false : (stryCov_9fa48("126857", "126858"), separatorIndex === (stryMutAct_9fa48("126859") ? address.length + 1 : (stryCov_9fa48("126859"), address.length - 1)))))) {
      if (stryMutAct_9fa48("126860")) {
        {}
      } else {
        stryCov_9fa48("126860");
        return null;
      }
    }
    return stryMutAct_9fa48("126861") ? address : (stryCov_9fa48("126861"), address.slice(stryMutAct_9fa48("126862") ? separatorIndex - ADDRESS.SEPARATOR.length : (stryCov_9fa48("126862"), separatorIndex + ADDRESS.SEPARATOR.length)));
  }
}
function extractPartitionIdFromUnifiedAddress(address) {
  if (stryMutAct_9fa48("126863")) {
    {}
  } else {
    stryCov_9fa48("126863");
    const serviceId = extractServiceIdFromUnifiedAddress(address);
    if (stryMutAct_9fa48("126866") ? false : stryMutAct_9fa48("126865") ? true : stryMutAct_9fa48("126864") ? serviceId : (stryCov_9fa48("126864", "126865", "126866"), !serviceId)) {
      if (stryMutAct_9fa48("126867")) {
        {}
      } else {
        stryCov_9fa48("126867");
        return null;
      }
    }
    const partitionId = serviceId.replace(REPLICA_SERVICE_SUFFIX_PATTERN, stryMutAct_9fa48("126868") ? "Stryker was here!" : (stryCov_9fa48("126868"), ''));
    if (stryMutAct_9fa48("126871") ? !partitionId && partitionId === serviceId : stryMutAct_9fa48("126870") ? false : stryMutAct_9fa48("126869") ? true : (stryCov_9fa48("126869", "126870", "126871"), (stryMutAct_9fa48("126872") ? partitionId : (stryCov_9fa48("126872"), !partitionId)) || (stryMutAct_9fa48("126874") ? partitionId !== serviceId : stryMutAct_9fa48("126873") ? false : (stryCov_9fa48("126873", "126874"), partitionId === serviceId)))) {
      if (stryMutAct_9fa48("126875")) {
        {}
      } else {
        stryCov_9fa48("126875");
        return null;
      }
    }
    return partitionId;
  }
}
function resolveExplicitTargetPartitionId(packet = null) {
  if (stryMutAct_9fa48("126876")) {
    {}
  } else {
    stryCov_9fa48("126876");
    for (const address of stryMutAct_9fa48("126877") ? [] : (stryCov_9fa48("126877"), [stryMutAct_9fa48("126878") ? packet.targetAddress : (stryCov_9fa48("126878"), packet?.targetAddress), stryMutAct_9fa48("126879") ? packet.destination : (stryCov_9fa48("126879"), packet?.destination)])) {
      if (stryMutAct_9fa48("126880")) {
        {}
      } else {
        stryCov_9fa48("126880");
        const partitionId = extractPartitionIdFromUnifiedAddress(address);
        if (stryMutAct_9fa48("126882") ? false : stryMutAct_9fa48("126881") ? true : (stryCov_9fa48("126881", "126882"), partitionId)) {
          if (stryMutAct_9fa48("126883")) {
            {}
          } else {
            stryCov_9fa48("126883");
            return partitionId;
          }
        }
      }
    }
    return null;
  }
}
function resolvePriorityControlPlanePartitionId(packet = null) {
  if (stryMutAct_9fa48("126884")) {
    {}
  } else {
    stryCov_9fa48("126884");
    const explicitTargetPartitionId = resolveExplicitTargetPartitionId(packet);
    if (stryMutAct_9fa48("126886") ? false : stryMutAct_9fa48("126885") ? true : (stryCov_9fa48("126885", "126886"), explicitTargetPartitionId)) {
      if (stryMutAct_9fa48("126887")) {
        {}
      } else {
        stryCov_9fa48("126887");
        return isCriticalTransportControlPlanePartition(stryMutAct_9fa48("126888") ? {} : (stryCov_9fa48("126888"), {
          partitionId: explicitTargetPartitionId
        })) ? explicitTargetPartitionId : null;
      }
    }
    const senderPartitionId = extractPartitionIdFromUnifiedAddress(stryMutAct_9fa48("126889") ? packet.address : (stryCov_9fa48("126889"), packet?.address));
    if (stryMutAct_9fa48("126892") ? false : stryMutAct_9fa48("126891") ? true : stryMutAct_9fa48("126890") ? senderPartitionId : (stryCov_9fa48("126890", "126891", "126892"), !senderPartitionId)) {
      if (stryMutAct_9fa48("126893")) {
        {}
      } else {
        stryCov_9fa48("126893");
        return null;
      }
    }
    return isCriticalTransportControlPlanePartition(stryMutAct_9fa48("126894") ? {} : (stryCov_9fa48("126894"), {
      partitionId: senderPartitionId
    })) ? senderPartitionId : null;
  }
}
function resolveRaftTransportDeliveryOptions(packet = null) {
  if (stryMutAct_9fa48("126895")) {
    {}
  } else {
    stryCov_9fa48("126895");
    const packetType = (stryMutAct_9fa48("126898") ? typeof packet?.type !== 'string' : stryMutAct_9fa48("126897") ? false : stryMutAct_9fa48("126896") ? true : (stryCov_9fa48("126896", "126897", "126898"), typeof (stryMutAct_9fa48("126899") ? packet.type : (stryCov_9fa48("126899"), packet?.type)) === (stryMutAct_9fa48("126900") ? "" : (stryCov_9fa48("126900"), 'string')))) ? stryMutAct_9fa48("126901") ? packet.type.toUpperCase() : (stryCov_9fa48("126901"), packet.type.toLowerCase()) : null;
    const explicitTargetPartitionId = resolveExplicitTargetPartitionId(packet);
    if (stryMutAct_9fa48("126903") ? false : stryMutAct_9fa48("126902") ? true : (stryCov_9fa48("126902", "126903"), resolvePriorityControlPlanePartitionId(packet))) {
      if (stryMutAct_9fa48("126904")) {
        {}
      } else {
        stryCov_9fa48("126904");
        return RAFT_TRANSPORT_DELIVERY_OPTIONS;
      }
    }
    const hasAppendEntries = stryMutAct_9fa48("126907") ? packetType === RAFT_PACKET_TYPE.APPEND && Array.isArray(packet?.data) || packet.data.length > 0 : stryMutAct_9fa48("126906") ? false : stryMutAct_9fa48("126905") ? true : (stryCov_9fa48("126905", "126906", "126907"), (stryMutAct_9fa48("126909") ? packetType === RAFT_PACKET_TYPE.APPEND || Array.isArray(packet?.data) : stryMutAct_9fa48("126908") ? true : (stryCov_9fa48("126908", "126909"), (stryMutAct_9fa48("126911") ? packetType !== RAFT_PACKET_TYPE.APPEND : stryMutAct_9fa48("126910") ? true : (stryCov_9fa48("126910", "126911"), packetType === RAFT_PACKET_TYPE.APPEND)) && Array.isArray(stryMutAct_9fa48("126912") ? packet.data : (stryCov_9fa48("126912"), packet?.data)))) && (stryMutAct_9fa48("126915") ? packet.data.length <= 0 : stryMutAct_9fa48("126914") ? packet.data.length >= 0 : stryMutAct_9fa48("126913") ? true : (stryCov_9fa48("126913", "126914", "126915"), packet.data.length > 0)));
    if (stryMutAct_9fa48("126917") ? false : stryMutAct_9fa48("126916") ? true : (stryCov_9fa48("126916", "126917"), explicitTargetPartitionId)) {
      if (stryMutAct_9fa48("126918")) {
        {}
      } else {
        stryCov_9fa48("126918");
        return (stryMutAct_9fa48("126921") ? hasAppendEntries && packetType === RAFT_PACKET_TYPE.APPEND_FAIL : stryMutAct_9fa48("126920") ? false : stryMutAct_9fa48("126919") ? true : (stryCov_9fa48("126919", "126920", "126921"), hasAppendEntries || (stryMutAct_9fa48("126923") ? packetType !== RAFT_PACKET_TYPE.APPEND_FAIL : stryMutAct_9fa48("126922") ? false : (stryCov_9fa48("126922", "126923"), packetType === RAFT_PACKET_TYPE.APPEND_FAIL)))) ? RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS : RAFT_TRANSPORT_DELIVERY_OPTIONS;
      }
    }
    if (stryMutAct_9fa48("126926") ? hasAppendEntries && packetType === RAFT_PACKET_TYPE.APPEND_FAIL : stryMutAct_9fa48("126925") ? false : stryMutAct_9fa48("126924") ? true : (stryCov_9fa48("126924", "126925", "126926"), hasAppendEntries || (stryMutAct_9fa48("126928") ? packetType !== RAFT_PACKET_TYPE.APPEND_FAIL : stryMutAct_9fa48("126927") ? false : (stryCov_9fa48("126927", "126928"), packetType === RAFT_PACKET_TYPE.APPEND_FAIL)))) {
      if (stryMutAct_9fa48("126929")) {
        {}
      } else {
        stryCov_9fa48("126929");
        return RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS;
      }
    }
    return RAFT_TRANSPORT_DELIVERY_OPTIONS;
  }
}
export { RAFT_ELECTION_TIMING, RAFT_PACKET_MESSAGE_TYPE, RAFT_PACKET_TYPE, RAFT_PACKET_TYPES, RAFT_MESSAGE_TYPE, RAFT_EVENT, RAFT_ROLE, RAFT_ERROR_NAME, RAFT_TRANSPORT_ERROR_MSG, RAFT_TRANSPORT_DELIVERY_OPTIONS, RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS, resolveRaftTransportDeliveryOptions, RAFT_TRANSPORT_LOG_MSG };