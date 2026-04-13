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
import { COLUMN, ENTITY_TYPE, NUM, SERVICE_TYPE, STATE, TABLES, TYPEOF } from '../constants/index.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { ControlPlaneField } from '../control-plane/control-plane-constants.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { CONTROL_PLANE_READ_STRATEGY } from '../control-plane/control-plane-system-table-gateway.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { MESSAGE_GROUP_APPLICATION_ERROR_MSG, MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, MESSAGE_GROUP_CDC_ERROR_MSG } from './constants.js';
import { resolveMessageGroupForwardServiceFromCache, resolveMessageGroupLeaderServiceFromCache } from './message-group-target-resolver.js';
import { normalizeCauseId } from '../utils/cause-id.js';
import { TRANSPORT_ERROR_MSG } from '../constants/transport.js';
const MESSAGE_GROUP_FORWARDING_OWNER_LITERAL = Object.freeze(stryMutAct_9fa48("85391") ? {} : (stryCov_9fa48("85391"), {
  AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED: stryMutAct_9fa48("85392") ? "" : (stryCov_9fa48("85392"), "Authoritative message-group forward topology repair failed"),
  BACKGROUND: stryMutAct_9fa48("85393") ? "" : (stryCov_9fa48("85393"), "background"),
  CDC_FORWARD_TO_LEADER_REJECTED: stryMutAct_9fa48("85394") ? "" : (stryCov_9fa48("85394"), "CDC forward to leader rejected"),
  CLOSED: stryMutAct_9fa48("85395") ? "" : (stryCov_9fa48("85395"), "closed"),
  CONNECTION_TO_NODE: stryMutAct_9fa48("85396") ? "" : (stryCov_9fa48("85396"), "Connection to node"),
  CRITICAL: stryMutAct_9fa48("85397") ? "" : (stryCov_9fa48("85397"), "critical"),
  EAI_AGAIN: stryMutAct_9fa48("85398") ? "" : (stryCov_9fa48("85398"), "EAI_AGAIN"),
  ECONNREFUSED: stryMutAct_9fa48("85399") ? "" : (stryCov_9fa48("85399"), "ECONNREFUSED"),
  ENOTFOUND: stryMutAct_9fa48("85400") ? "" : (stryCov_9fa48("85400"), "ENOTFOUND"),
  FORWARD_SLASH: stryMutAct_9fa48("85401") ? "" : (stryCov_9fa48("85401"), "/"),
  IS_SATURATED: stryMutAct_9fa48("85402") ? "" : (stryCov_9fa48("85402"), "is saturated"),
  MESSAGE_DASH_GROUP_DASH_SERVICE: stryMutAct_9fa48("85403") ? "" : (stryCov_9fa48("85403"), "message-group-service"),
  METADATA_INGRESS: stryMutAct_9fa48("85404") ? "" : (stryCov_9fa48("85404"), "metadata_ingress"),
  NO_CONNECTION_TO_NODE: stryMutAct_9fa48("85405") ? "" : (stryCov_9fa48("85405"), "No connection to node"),
  NO_HANDLER_REGISTERED_FOR_ADDRESS: stryMutAct_9fa48("85406") ? "" : (stryCov_9fa48("85406"), "No handler registered for address"),
  OUTBOUND_QUEUE_BACKPRESSURED: stryMutAct_9fa48("85407") ? "" : (stryCov_9fa48("85407"), "OUTBOUND_QUEUE_BACKPRESSURED"),
  OUTBOUND_QUEUE_FOR_NODE: stryMutAct_9fa48("85408") ? "" : (stryCov_9fa48("85408"), "Outbound queue for node"),
  REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS: stryMutAct_9fa48("85409") ? "" : (stryCov_9fa48("85409"), "Repaired message-group forward topology from authoritative rows"),
  ZERO: 0
}));
const STRICT_CDC_FORWARD_SYSTEM_TABLES = new Set(Object.values(SYSTEM_TABLE_NAME));
const BACKGROUND_CDC_FORWARD_SYSTEM_TABLES = new Set(stryMutAct_9fa48("85410") ? [] : (stryCov_9fa48("85410"), [SYSTEM_TABLE_NAME.MESSAGE_GROUPS, SYSTEM_TABLE_NAME.NODES, SYSTEM_TABLE_NAME.NODE_ENDPOINTS, SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]));
const FORWARD_TOPOLOGY_REPAIR_OUTCOME = Object.freeze(stryMutAct_9fa48("85411") ? {} : (stryCov_9fa48("85411"), {
  FAILED: stryMutAct_9fa48("85412") ? "" : (stryCov_9fa48("85412"), 'failed'),
  REPAIRED: stryMutAct_9fa48("85413") ? "" : (stryCov_9fa48("85413"), 'repaired'),
  UNCHANGED: stryMutAct_9fa48("85414") ? "" : (stryCov_9fa48("85414"), 'unchanged')
}));
const MESSAGE_GROUP_FORWARDING_REASON = Object.freeze(stryMutAct_9fa48("85415") ? {} : (stryCov_9fa48("85415"), {
  INGRESS_NOT_INITIALIZED: stryMutAct_9fa48("85416") ? "" : (stryCov_9fa48("85416"), 'message-group ingress not initialized')
}));
function extractCDCForwardPayloadRows(payload = null) {
  if (stryMutAct_9fa48("85417")) {
    {}
  } else {
    stryCov_9fa48("85417");
    const events = Array.isArray(stryMutAct_9fa48("85418") ? payload.events : (stryCov_9fa48("85418"), payload?.events)) ? payload.events : stryMutAct_9fa48("85419") ? [] : (stryCov_9fa48("85419"), [payload]);
    return stryMutAct_9fa48("85420") ? events.map(event => event?.data && typeof event.data === TYPEOF.OBJECT ? event.data : null) : (stryCov_9fa48("85420"), events.map(stryMutAct_9fa48("85421") ? () => undefined : (stryCov_9fa48("85421"), event => (stryMutAct_9fa48("85424") ? event?.data || typeof event.data === TYPEOF.OBJECT : stryMutAct_9fa48("85423") ? false : stryMutAct_9fa48("85422") ? true : (stryCov_9fa48("85422", "85423", "85424"), (stryMutAct_9fa48("85425") ? event.data : (stryCov_9fa48("85425"), event?.data)) && (stryMutAct_9fa48("85427") ? typeof event.data !== TYPEOF.OBJECT : stryMutAct_9fa48("85426") ? true : (stryCov_9fa48("85426", "85427"), typeof event.data === TYPEOF.OBJECT)))) ? event.data : null)).filter(Boolean));
  }
}
function isCriticalPartitionServiceRow(row = null) {
  if (stryMutAct_9fa48("85428")) {
    {}
  } else {
    stryCov_9fa48("85428");
    const serviceType = stryMutAct_9fa48("85429") ? String(row?.[COLUMN.SERVICE_TYPE] ?? row?.service_type ?? row?.serviceType ?? '').toUpperCase() : (stryCov_9fa48("85429"), String(stryMutAct_9fa48("85430") ? (row?.[COLUMN.SERVICE_TYPE] ?? row?.service_type ?? row?.serviceType) && '' : (stryCov_9fa48("85430"), (stryMutAct_9fa48("85431") ? (row?.[COLUMN.SERVICE_TYPE] ?? row?.service_type) && row?.serviceType : (stryCov_9fa48("85431"), (stryMutAct_9fa48("85432") ? row?.[COLUMN.SERVICE_TYPE] && row?.service_type : (stryCov_9fa48("85432"), (stryMutAct_9fa48("85433") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("85433"), row?.[COLUMN.SERVICE_TYPE])) ?? (stryMutAct_9fa48("85434") ? row.service_type : (stryCov_9fa48("85434"), row?.service_type)))) ?? (stryMutAct_9fa48("85435") ? row.serviceType : (stryCov_9fa48("85435"), row?.serviceType)))) ?? (stryMutAct_9fa48("85436") ? "Stryker was here!" : (stryCov_9fa48("85436"), '')))).toLowerCase());
    return stryMutAct_9fa48("85439") ? serviceType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("85438") ? false : stryMutAct_9fa48("85437") ? true : (stryCov_9fa48("85437", "85438", "85439"), serviceType === SERVICE_TYPE.PARTITION);
  }
}
function resolveCDCForwardDeliveryPriority(tableName, payload = null, replayOnly = stryMutAct_9fa48("85440") ? true : (stryCov_9fa48("85440"), false)) {
  if (stryMutAct_9fa48("85441")) {
    {}
  } else {
    stryCov_9fa48("85441");
    if (stryMutAct_9fa48("85444") ? replayOnly !== true : stryMutAct_9fa48("85443") ? false : stryMutAct_9fa48("85442") ? true : (stryCov_9fa48("85442", "85443", "85444"), replayOnly === (stryMutAct_9fa48("85445") ? false : (stryCov_9fa48("85445"), true)))) {
      if (stryMutAct_9fa48("85446")) {
        {}
      } else {
        stryCov_9fa48("85446");
        return MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND;
      }
    }
    if (stryMutAct_9fa48("85449") ? tableName !== SYSTEM_TABLE_NAME.SERVICES : stryMutAct_9fa48("85448") ? false : stryMutAct_9fa48("85447") ? true : (stryCov_9fa48("85447", "85448", "85449"), tableName === SYSTEM_TABLE_NAME.SERVICES)) {
      if (stryMutAct_9fa48("85450")) {
        {}
      } else {
        stryCov_9fa48("85450");
        const payloadRows = extractCDCForwardPayloadRows(payload);
        return (stryMutAct_9fa48("85451") ? payloadRows.every(row => isCriticalPartitionServiceRow(row)) : (stryCov_9fa48("85451"), payloadRows.some(stryMutAct_9fa48("85452") ? () => undefined : (stryCov_9fa48("85452"), row => isCriticalPartitionServiceRow(row))))) ? MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CRITICAL : MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND;
      }
    }
    return (stryMutAct_9fa48("85455") ? typeof tableName === TYPEOF.STRING || BACKGROUND_CDC_FORWARD_SYSTEM_TABLES.has(tableName) : stryMutAct_9fa48("85454") ? false : stryMutAct_9fa48("85453") ? true : (stryCov_9fa48("85453", "85454", "85455"), (stryMutAct_9fa48("85457") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("85456") ? true : (stryCov_9fa48("85456", "85457"), typeof tableName === TYPEOF.STRING)) && BACKGROUND_CDC_FORWARD_SYSTEM_TABLES.has(tableName))) ? MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND : MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CRITICAL;
  }
}
class MessageGroupForwardingOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("85458")) {
      {}
    } else {
      stryCov_9fa48("85458");
      this.service = options.service;
      this.buildDeferredCdcForwardError = options.buildDeferredCdcForwardError;
      this.boundCdcForwardErrorDetail = options.boundCdcForwardErrorDetail;
      this.forwardTargetSuppression = new Map();
      this.lastForwardTopologyRepairAtMs = NUM.ZERO;
      this.lastForwardTopologyRepairCooldownMs = stryMutAct_9fa48("85461") ? this.service?.forwardTopologyRepairCooldownMs && NUM.ZERO : stryMutAct_9fa48("85460") ? false : stryMutAct_9fa48("85459") ? true : (stryCov_9fa48("85459", "85460", "85461"), (stryMutAct_9fa48("85462") ? this.service.forwardTopologyRepairCooldownMs : (stryCov_9fa48("85462"), this.service?.forwardTopologyRepairCooldownMs)) || NUM.ZERO);
      this.forwardTopologyRepairInFlight = null;
    }
  }
  resolveLiveLeaderForwardTarget() {
    if (stryMutAct_9fa48("85463")) {
      {}
    } else {
      stryCov_9fa48("85463");
      const service = this.service;
      const leaderServiceId = service.normalizeLeaderReplicaId(service.leaderId);
      if (stryMutAct_9fa48("85466") ? leaderServiceId !== service.replicaId : stryMutAct_9fa48("85465") ? false : stryMutAct_9fa48("85464") ? true : (stryCov_9fa48("85464", "85465", "85466"), leaderServiceId === service.replicaId)) {
        if (stryMutAct_9fa48("85467")) {
          {}
        } else {
          stryCov_9fa48("85467");
          return null;
        }
      }
      if (stryMutAct_9fa48("85470") ? false : stryMutAct_9fa48("85469") ? true : stryMutAct_9fa48("85468") ? leaderServiceId : (stryCov_9fa48("85468", "85469", "85470"), !leaderServiceId)) {
        if (stryMutAct_9fa48("85471")) {
          {}
        } else {
          stryCov_9fa48("85471");
          return null;
        }
      }
      let address = stryMutAct_9fa48("85474") ? service.resolveLivePeerAddressFromRaftNodes(leaderServiceId) && service.resolvePeerAddressFromCache(leaderServiceId) : stryMutAct_9fa48("85473") ? false : stryMutAct_9fa48("85472") ? true : (stryCov_9fa48("85472", "85473", "85474"), service.resolveLivePeerAddressFromRaftNodes(leaderServiceId) || service.resolvePeerAddressFromCache(leaderServiceId));
      if (stryMutAct_9fa48("85477") ? typeof address !== TYPEOF.STRING || address.length === NUM.ZERO || service.shouldAllowJoinConvergenceStrictTargeting() : stryMutAct_9fa48("85476") ? false : stryMutAct_9fa48("85475") ? true : (stryCov_9fa48("85475", "85476", "85477"), (stryMutAct_9fa48("85479") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("85478") ? true : (stryCov_9fa48("85478", "85479"), (stryMutAct_9fa48("85481") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("85480") ? false : (stryCov_9fa48("85480", "85481"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("85483") ? address.length !== NUM.ZERO : stryMutAct_9fa48("85482") ? false : (stryCov_9fa48("85482", "85483"), address.length === NUM.ZERO)))) && service.shouldAllowJoinConvergenceStrictTargeting())) {
        if (stryMutAct_9fa48("85484")) {
          {}
        } else {
          stryCov_9fa48("85484");
          address = service.resolvePeerAddressFromHints(leaderServiceId);
          if (stryMutAct_9fa48("85487") ? typeof address === TYPEOF.STRING && address.length > NUM.ZERO || typeof service.logBootstrapHintFallback === TYPEOF.FUNCTION : stryMutAct_9fa48("85486") ? false : stryMutAct_9fa48("85485") ? true : (stryCov_9fa48("85485", "85486", "85487"), (stryMutAct_9fa48("85489") ? typeof address === TYPEOF.STRING || address.length > NUM.ZERO : stryMutAct_9fa48("85488") ? true : (stryCov_9fa48("85488", "85489"), (stryMutAct_9fa48("85491") ? typeof address !== TYPEOF.STRING : stryMutAct_9fa48("85490") ? true : (stryCov_9fa48("85490", "85491"), typeof address === TYPEOF.STRING)) && (stryMutAct_9fa48("85494") ? address.length <= NUM.ZERO : stryMutAct_9fa48("85493") ? address.length >= NUM.ZERO : stryMutAct_9fa48("85492") ? true : (stryCov_9fa48("85492", "85493", "85494"), address.length > NUM.ZERO)))) && (stryMutAct_9fa48("85496") ? typeof service.logBootstrapHintFallback !== TYPEOF.FUNCTION : stryMutAct_9fa48("85495") ? true : (stryCov_9fa48("85495", "85496"), typeof service.logBootstrapHintFallback === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("85497")) {
              {}
            } else {
              stryCov_9fa48("85497");
              service.logBootstrapHintFallback(leaderServiceId, address);
            }
          }
        }
      }
      if (stryMutAct_9fa48("85500") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("85499") ? false : stryMutAct_9fa48("85498") ? true : (stryCov_9fa48("85498", "85499", "85500"), (stryMutAct_9fa48("85502") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("85501") ? false : (stryCov_9fa48("85501", "85502"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("85504") ? address.length !== NUM.ZERO : stryMutAct_9fa48("85503") ? false : (stryCov_9fa48("85503", "85504"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85505")) {
          {}
        } else {
          stryCov_9fa48("85505");
          return null;
        }
      }
      return stryMutAct_9fa48("85506") ? {} : (stryCov_9fa48("85506"), {
        serviceId: leaderServiceId,
        address
      });
    }
  }
  normalizeLeaderReplicaId(candidate) {
    if (stryMutAct_9fa48("85507")) {
      {}
    } else {
      stryCov_9fa48("85507");
      const service = this.service;
      if (stryMutAct_9fa48("85510") ? typeof candidate !== TYPEOF.STRING && candidate.length === NUM.ZERO : stryMutAct_9fa48("85509") ? false : stryMutAct_9fa48("85508") ? true : (stryCov_9fa48("85508", "85509", "85510"), (stryMutAct_9fa48("85512") ? typeof candidate === TYPEOF.STRING : stryMutAct_9fa48("85511") ? false : (stryCov_9fa48("85511", "85512"), typeof candidate !== TYPEOF.STRING)) || (stryMutAct_9fa48("85514") ? candidate.length !== NUM.ZERO : stryMutAct_9fa48("85513") ? false : (stryCov_9fa48("85513", "85514"), candidate.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85515")) {
          {}
        } else {
          stryCov_9fa48("85515");
          return null;
        }
      }
      if (stryMutAct_9fa48("85518") ? false : stryMutAct_9fa48("85517") ? true : stryMutAct_9fa48("85516") ? candidate.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.FORWARD_SLASH) : (stryCov_9fa48("85516", "85517", "85518"), !candidate.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.FORWARD_SLASH))) {
        if (stryMutAct_9fa48("85519")) {
          {}
        } else {
          stryCov_9fa48("85519");
          return candidate;
        }
      }
      try {
        if (stryMutAct_9fa48("85520")) {
          {}
        } else {
          stryCov_9fa48("85520");
          const parsed = service.addressManager.parse(candidate);
          if (stryMutAct_9fa48("85523") ? parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP && typeof parsed?.serviceId === TYPEOF.STRING || parsed.serviceId.length > NUM.ZERO : stryMutAct_9fa48("85522") ? false : stryMutAct_9fa48("85521") ? true : (stryCov_9fa48("85521", "85522", "85523"), (stryMutAct_9fa48("85525") ? parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP || typeof parsed?.serviceId === TYPEOF.STRING : stryMutAct_9fa48("85524") ? true : (stryCov_9fa48("85524", "85525"), (stryMutAct_9fa48("85527") ? parsed?.serviceType !== ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("85526") ? true : (stryCov_9fa48("85526", "85527"), (stryMutAct_9fa48("85528") ? parsed.serviceType : (stryCov_9fa48("85528"), parsed?.serviceType)) === ENTITY_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("85530") ? typeof parsed?.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("85529") ? true : (stryCov_9fa48("85529", "85530"), typeof (stryMutAct_9fa48("85531") ? parsed.serviceId : (stryCov_9fa48("85531"), parsed?.serviceId)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("85534") ? parsed.serviceId.length <= NUM.ZERO : stryMutAct_9fa48("85533") ? parsed.serviceId.length >= NUM.ZERO : stryMutAct_9fa48("85532") ? true : (stryCov_9fa48("85532", "85533", "85534"), parsed.serviceId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("85535")) {
              {}
            } else {
              stryCov_9fa48("85535");
              return parsed.serviceId;
            }
          }
        }
      } catch (_error) {
        // Ignore malformed addresses and preserve the original value.
      }
      return candidate;
    }
  }
  resolveLivePeerAddressFromRaftNodes(peerId) {
    if (stryMutAct_9fa48("85536")) {
      {}
    } else {
      stryCov_9fa48("85536");
      const service = this.service;
      if (stryMutAct_9fa48("85539") ? (typeof peerId !== TYPEOF.STRING || peerId.length === NUM.ZERO || !service.raft) && !Array.isArray(service.raft.nodes) : stryMutAct_9fa48("85538") ? false : stryMutAct_9fa48("85537") ? true : (stryCov_9fa48("85537", "85538", "85539"), (stryMutAct_9fa48("85541") ? (typeof peerId !== TYPEOF.STRING || peerId.length === NUM.ZERO) && !service.raft : stryMutAct_9fa48("85540") ? false : (stryCov_9fa48("85540", "85541"), (stryMutAct_9fa48("85543") ? typeof peerId !== TYPEOF.STRING && peerId.length === NUM.ZERO : stryMutAct_9fa48("85542") ? false : (stryCov_9fa48("85542", "85543"), (stryMutAct_9fa48("85545") ? typeof peerId === TYPEOF.STRING : stryMutAct_9fa48("85544") ? false : (stryCov_9fa48("85544", "85545"), typeof peerId !== TYPEOF.STRING)) || (stryMutAct_9fa48("85547") ? peerId.length !== NUM.ZERO : stryMutAct_9fa48("85546") ? false : (stryCov_9fa48("85546", "85547"), peerId.length === NUM.ZERO)))) || (stryMutAct_9fa48("85548") ? service.raft : (stryCov_9fa48("85548"), !service.raft)))) || (stryMutAct_9fa48("85549") ? Array.isArray(service.raft.nodes) : (stryCov_9fa48("85549"), !Array.isArray(service.raft.nodes))))) {
        if (stryMutAct_9fa48("85550")) {
          {}
        } else {
          stryCov_9fa48("85550");
          return null;
        }
      }
      for (const node of service.raft.nodes) {
        if (stryMutAct_9fa48("85551")) {
          {}
        } else {
          stryCov_9fa48("85551");
          const address = stryMutAct_9fa48("85552") ? node.address : (stryCov_9fa48("85552"), node?.address);
          if (stryMutAct_9fa48("85555") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("85554") ? false : stryMutAct_9fa48("85553") ? true : (stryCov_9fa48("85553", "85554", "85555"), (stryMutAct_9fa48("85557") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("85556") ? false : (stryCov_9fa48("85556", "85557"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("85559") ? address.length !== NUM.ZERO : stryMutAct_9fa48("85558") ? false : (stryCov_9fa48("85558", "85559"), address.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("85560")) {
              {}
            } else {
              stryCov_9fa48("85560");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("85561")) {
              {}
            } else {
              stryCov_9fa48("85561");
              const parsed = service.addressManager.parse(address);
              if (stryMutAct_9fa48("85564") ? parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP || parsed.serviceId === peerId : stryMutAct_9fa48("85563") ? false : stryMutAct_9fa48("85562") ? true : (stryCov_9fa48("85562", "85563", "85564"), (stryMutAct_9fa48("85566") ? parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("85565") ? true : (stryCov_9fa48("85565", "85566"), parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("85568") ? parsed.serviceId !== peerId : stryMutAct_9fa48("85567") ? true : (stryCov_9fa48("85567", "85568"), parsed.serviceId === peerId)))) {
                if (stryMutAct_9fa48("85569")) {
                  {}
                } else {
                  stryCov_9fa48("85569");
                  return address;
                }
              }
            }
          } catch (_error) {
            // Ignore non-unified or stale addresses; callers can fall back to cache.
          }
        }
      }
      return null;
    }
  }
  resolveCDCForwardSelection(logContext = {}) {
    if (stryMutAct_9fa48("85570")) {
      {}
    } else {
      stryCov_9fa48("85570");
      const service = this.service;
      const strictForwarding = service.shouldUseStrictCDCForwarding(logContext);
      const allowJoinConvergenceTargeting = stryMutAct_9fa48("85573") ? strictForwarding || service.shouldAllowJoinConvergenceStrictTargeting() : stryMutAct_9fa48("85572") ? false : stryMutAct_9fa48("85571") ? true : (stryCov_9fa48("85571", "85572", "85573"), strictForwarding && service.shouldAllowJoinConvergenceStrictTargeting());
      const excludedReplicaId = allowJoinConvergenceTargeting ? null : service.replicaId;
      const strictForwardRetryAfterMs = strictForwarding ? service.resolveStrictCdcForwardRetryAfterMs() : NUM.ZERO;
      const isConnectedNode = nodeId => {
        if (stryMutAct_9fa48("85574")) {
          {}
        } else {
          stryCov_9fa48("85574");
          if (stryMutAct_9fa48("85577") ? typeof service.transport?.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("85576") ? false : stryMutAct_9fa48("85575") ? true : (stryCov_9fa48("85575", "85576", "85577"), typeof (stryMutAct_9fa48("85578") ? service.transport.getConnectionState : (stryCov_9fa48("85578"), service.transport?.getConnectionState)) !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("85579")) {
              {}
            } else {
              stryCov_9fa48("85579");
              return stryMutAct_9fa48("85580") ? false : (stryCov_9fa48("85580"), true);
            }
          }
          return stryMutAct_9fa48("85583") ? service.transport.getConnectionState(nodeId) !== STATE.CONNECTED : stryMutAct_9fa48("85582") ? false : stryMutAct_9fa48("85581") ? true : (stryCov_9fa48("85581", "85582", "85583"), service.transport.getConnectionState(nodeId) === STATE.CONNECTED);
        }
      };
      const cacheLeaderService = resolveMessageGroupLeaderServiceFromCache(service.systemTableCache, service.groupId, strictForwarding ? stryMutAct_9fa48("85584") ? {} : (stryCov_9fa48("85584"), {
        excludeServiceId: excludedReplicaId,
        requireReadyNode: stryMutAct_9fa48("85585") ? true : (stryCov_9fa48("85585"), false),
        preferConnectedCandidates: stryMutAct_9fa48("85586") ? true : (stryCov_9fa48("85586"), false),
        allowStoppedService: stryMutAct_9fa48("85587") ? true : (stryCov_9fa48("85587"), false),
        isConnectedNode
      }) : stryMutAct_9fa48("85588") ? {} : (stryCov_9fa48("85588"), {
        excludeServiceId: excludedReplicaId,
        isConnectedNode
      }));
      const cacheForwardService = resolveMessageGroupForwardServiceFromCache(service.systemTableCache, service.groupId, stryMutAct_9fa48("85589") ? {} : (stryCov_9fa48("85589"), {
        excludeServiceId: excludedReplicaId,
        isConnectedNode
      }));
      const {
        targets,
        suppressedCount
      } = service.buildCDCForwardTargets(cacheLeaderService, cacheForwardService, stryMutAct_9fa48("85590") ? {} : (stryCov_9fa48("85590"), {
        strictForwarding
      }));
      return stryMutAct_9fa48("85591") ? {} : (stryCov_9fa48("85591"), {
        strictForwarding,
        strictForwardRetryAfterMs,
        cacheLeaderService,
        cacheForwardService,
        targets,
        suppressedCount
      });
    }
  }
  buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options = {}) {
    if (stryMutAct_9fa48("85592")) {
      {}
    } else {
      stryCov_9fa48("85592");
      const service = this.service;
      const strictForwarding = stryMutAct_9fa48("85595") ? options.strictForwarding !== true : stryMutAct_9fa48("85594") ? false : stryMutAct_9fa48("85593") ? true : (stryCov_9fa48("85593", "85594", "85595"), options.strictForwarding === (stryMutAct_9fa48("85596") ? false : (stryCov_9fa48("85596"), true)));
      const targets = stryMutAct_9fa48("85597") ? ["Stryker was here"] : (stryCov_9fa48("85597"), []);
      let suppressedCount = NUM.ZERO;
      const targetsByServiceId = new Map();
      const addTarget = (serviceId, address = null) => {
        if (stryMutAct_9fa48("85598")) {
          {}
        } else {
          stryCov_9fa48("85598");
          if (stryMutAct_9fa48("85601") ? (typeof serviceId !== TYPEOF.STRING || serviceId.length === NUM.ZERO) && service.isLocalForwardTarget(serviceId, address) : stryMutAct_9fa48("85600") ? false : stryMutAct_9fa48("85599") ? true : (stryCov_9fa48("85599", "85600", "85601"), (stryMutAct_9fa48("85603") ? typeof serviceId !== TYPEOF.STRING && serviceId.length === NUM.ZERO : stryMutAct_9fa48("85602") ? false : (stryCov_9fa48("85602", "85603"), (stryMutAct_9fa48("85605") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("85604") ? false : (stryCov_9fa48("85604", "85605"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("85607") ? serviceId.length !== NUM.ZERO : stryMutAct_9fa48("85606") ? false : (stryCov_9fa48("85606", "85607"), serviceId.length === NUM.ZERO)))) || service.isLocalForwardTarget(serviceId, address))) {
            if (stryMutAct_9fa48("85608")) {
              {}
            } else {
              stryCov_9fa48("85608");
              return;
            }
          }
          const normalizedAddress = (stryMutAct_9fa48("85611") ? typeof address === TYPEOF.STRING || address.length > NUM.ZERO : stryMutAct_9fa48("85610") ? false : stryMutAct_9fa48("85609") ? true : (stryCov_9fa48("85609", "85610", "85611"), (stryMutAct_9fa48("85613") ? typeof address !== TYPEOF.STRING : stryMutAct_9fa48("85612") ? true : (stryCov_9fa48("85612", "85613"), typeof address === TYPEOF.STRING)) && (stryMutAct_9fa48("85616") ? address.length <= NUM.ZERO : stryMutAct_9fa48("85615") ? address.length >= NUM.ZERO : stryMutAct_9fa48("85614") ? true : (stryCov_9fa48("85614", "85615", "85616"), address.length > NUM.ZERO)))) ? address : null;
          const existingTarget = targetsByServiceId.get(serviceId);
          if (stryMutAct_9fa48("85618") ? false : stryMutAct_9fa48("85617") ? true : (stryCov_9fa48("85617", "85618"), existingTarget)) {
            if (stryMutAct_9fa48("85619")) {
              {}
            } else {
              stryCov_9fa48("85619");
              if (stryMutAct_9fa48("85622") ? !existingTarget.address || normalizedAddress : stryMutAct_9fa48("85621") ? false : stryMutAct_9fa48("85620") ? true : (stryCov_9fa48("85620", "85621", "85622"), (stryMutAct_9fa48("85623") ? existingTarget.address : (stryCov_9fa48("85623"), !existingTarget.address)) && normalizedAddress)) {
                if (stryMutAct_9fa48("85624")) {
                  {}
                } else {
                  stryCov_9fa48("85624");
                  existingTarget.address = normalizedAddress;
                }
              }
              return;
            }
          }
          const target = stryMutAct_9fa48("85625") ? {} : (stryCov_9fa48("85625"), {
            serviceId,
            address: normalizedAddress
          });
          targetsByServiceId.set(serviceId, target);
          if (stryMutAct_9fa48("85627") ? false : stryMutAct_9fa48("85626") ? true : (stryCov_9fa48("85626", "85627"), service.isForwardTargetSuppressed(target))) {
            if (stryMutAct_9fa48("85628")) {
              {}
            } else {
              stryCov_9fa48("85628");
              stryMutAct_9fa48("85629") ? suppressedCount -= NUM.ONE : (stryCov_9fa48("85629"), suppressedCount += NUM.ONE);
              return;
            }
          }
          targets.push(target);
        }
      };
      if (stryMutAct_9fa48("85631") ? false : stryMutAct_9fa48("85630") ? true : (stryCov_9fa48("85630", "85631"), strictForwarding)) {
        if (stryMutAct_9fa48("85632")) {
          {}
        } else {
          stryCov_9fa48("85632");
          const liveLeaderTarget = service.resolveLiveLeaderForwardTarget();
          if (stryMutAct_9fa48("85634") ? false : stryMutAct_9fa48("85633") ? true : (stryCov_9fa48("85633", "85634"), service.isStrictForwardTargetEligible(liveLeaderTarget))) {
            if (stryMutAct_9fa48("85635")) {
              {}
            } else {
              stryCov_9fa48("85635");
              addTarget(liveLeaderTarget.serviceId, liveLeaderTarget.address);
              return stryMutAct_9fa48("85636") ? {} : (stryCov_9fa48("85636"), {
                targets,
                suppressedCount
              });
            }
          }
          if (stryMutAct_9fa48("85638") ? false : stryMutAct_9fa48("85637") ? true : (stryCov_9fa48("85637", "85638"), service.isStrictForwardTargetEligible(stryMutAct_9fa48("85639") ? {} : (stryCov_9fa48("85639"), {
            serviceId: stryMutAct_9fa48("85640") ? cacheLeaderService[COLUMN.SERVICE_ID] : (stryCov_9fa48("85640"), cacheLeaderService?.[COLUMN.SERVICE_ID]),
            address: stryMutAct_9fa48("85641") ? cacheLeaderService[COLUMN.ADDRESS] : (stryCov_9fa48("85641"), cacheLeaderService?.[COLUMN.ADDRESS])
          })))) {
            if (stryMutAct_9fa48("85642")) {
              {}
            } else {
              stryCov_9fa48("85642");
              addTarget(stryMutAct_9fa48("85643") ? cacheLeaderService[COLUMN.SERVICE_ID] : (stryCov_9fa48("85643"), cacheLeaderService?.[COLUMN.SERVICE_ID]), stryMutAct_9fa48("85644") ? cacheLeaderService[COLUMN.ADDRESS] : (stryCov_9fa48("85644"), cacheLeaderService?.[COLUMN.ADDRESS]));
            }
          }
          if (stryMutAct_9fa48("85647") ? targets.length === NUM.ZERO || service.shouldAllowJoinConvergenceStrictTargeting() : stryMutAct_9fa48("85646") ? false : stryMutAct_9fa48("85645") ? true : (stryCov_9fa48("85645", "85646", "85647"), (stryMutAct_9fa48("85649") ? targets.length !== NUM.ZERO : stryMutAct_9fa48("85648") ? true : (stryCov_9fa48("85648", "85649"), targets.length === NUM.ZERO)) && service.shouldAllowJoinConvergenceStrictTargeting())) {
            if (stryMutAct_9fa48("85650")) {
              {}
            } else {
              stryCov_9fa48("85650");
              const bootstrapTarget = service.resolveJoinConvergenceBootstrapForwardTarget();
              if (stryMutAct_9fa48("85652") ? false : stryMutAct_9fa48("85651") ? true : (stryCov_9fa48("85651", "85652"), service.isStrictForwardTargetEligible(bootstrapTarget))) {
                if (stryMutAct_9fa48("85653")) {
                  {}
                } else {
                  stryCov_9fa48("85653");
                  addTarget(bootstrapTarget.serviceId, bootstrapTarget.address);
                }
              }
            }
          }
          return stryMutAct_9fa48("85654") ? {} : (stryCov_9fa48("85654"), {
            targets,
            suppressedCount
          });
        }
      }
      addTarget(stryMutAct_9fa48("85655") ? cacheForwardService[COLUMN.SERVICE_ID] : (stryCov_9fa48("85655"), cacheForwardService?.[COLUMN.SERVICE_ID]), stryMutAct_9fa48("85656") ? cacheForwardService[COLUMN.ADDRESS] : (stryCov_9fa48("85656"), cacheForwardService?.[COLUMN.ADDRESS]));
      addTarget(stryMutAct_9fa48("85657") ? cacheLeaderService[COLUMN.SERVICE_ID] : (stryCov_9fa48("85657"), cacheLeaderService?.[COLUMN.SERVICE_ID]), stryMutAct_9fa48("85658") ? cacheLeaderService[COLUMN.ADDRESS] : (stryCov_9fa48("85658"), cacheLeaderService?.[COLUMN.ADDRESS]));
      addTarget(service.leaderId);
      if (stryMutAct_9fa48("85660") ? false : stryMutAct_9fa48("85659") ? true : (stryCov_9fa48("85659", "85660"), Array.isArray(service.replicaIds))) {
        if (stryMutAct_9fa48("85661")) {
          {}
        } else {
          stryCov_9fa48("85661");
          for (const peerId of service.replicaIds) {
            if (stryMutAct_9fa48("85662")) {
              {}
            } else {
              stryCov_9fa48("85662");
              addTarget(peerId);
            }
          }
        }
      }
      return stryMutAct_9fa48("85663") ? {} : (stryCov_9fa48("85663"), {
        targets,
        suppressedCount
      });
    }
  }
  shouldUseStrictCDCForwarding(logContext = {}) {
    if (stryMutAct_9fa48("85664")) {
      {}
    } else {
      stryCov_9fa48("85664");
      const tableName = stryMutAct_9fa48("85667") ? logContext?.tableName && null : stryMutAct_9fa48("85666") ? false : stryMutAct_9fa48("85665") ? true : (stryCov_9fa48("85665", "85666", "85667"), (stryMutAct_9fa48("85668") ? logContext.tableName : (stryCov_9fa48("85668"), logContext?.tableName)) || null);
      return stryMutAct_9fa48("85671") ? typeof tableName === TYPEOF.STRING || STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName) : stryMutAct_9fa48("85670") ? false : stryMutAct_9fa48("85669") ? true : (stryCov_9fa48("85669", "85670", "85671"), (stryMutAct_9fa48("85673") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("85672") ? true : (stryCov_9fa48("85672", "85673"), typeof tableName === TYPEOF.STRING)) && STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName));
    }
  }
  shouldUseCanonicalLocalIngressForStrictCDC(selection = null) {
    if (stryMutAct_9fa48("85674")) {
      {}
    } else {
      stryCov_9fa48("85674");
      const service = this.service;
      const allowMetadataPublicationConvergenceIngress = stryMutAct_9fa48("85677") ? typeof service.isMetadataPublicationConvergenceWindowOpen === TYPEOF.FUNCTION || service.isMetadataPublicationConvergenceWindowOpen() === true : stryMutAct_9fa48("85676") ? false : stryMutAct_9fa48("85675") ? true : (stryCov_9fa48("85675", "85676", "85677"), (stryMutAct_9fa48("85679") ? typeof service.isMetadataPublicationConvergenceWindowOpen !== TYPEOF.FUNCTION : stryMutAct_9fa48("85678") ? true : (stryCov_9fa48("85678", "85679"), typeof service.isMetadataPublicationConvergenceWindowOpen === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("85681") ? service.isMetadataPublicationConvergenceWindowOpen() !== true : stryMutAct_9fa48("85680") ? true : (stryCov_9fa48("85680", "85681"), service.isMetadataPublicationConvergenceWindowOpen() === (stryMutAct_9fa48("85682") ? false : (stryCov_9fa48("85682"), true)))));
      if (stryMutAct_9fa48("85685") ? selection?.strictForwarding !== true && service.shouldAllowJoinConvergenceStrictTargeting() !== true && !allowMetadataPublicationConvergenceIngress : stryMutAct_9fa48("85684") ? false : stryMutAct_9fa48("85683") ? true : (stryCov_9fa48("85683", "85684", "85685"), (stryMutAct_9fa48("85687") ? selection?.strictForwarding === true : stryMutAct_9fa48("85686") ? false : (stryCov_9fa48("85686", "85687"), (stryMutAct_9fa48("85688") ? selection.strictForwarding : (stryCov_9fa48("85688"), selection?.strictForwarding)) !== (stryMutAct_9fa48("85689") ? false : (stryCov_9fa48("85689"), true)))) || (stryMutAct_9fa48("85691") ? service.shouldAllowJoinConvergenceStrictTargeting() !== true || !allowMetadataPublicationConvergenceIngress : stryMutAct_9fa48("85690") ? false : (stryCov_9fa48("85690", "85691"), (stryMutAct_9fa48("85693") ? service.shouldAllowJoinConvergenceStrictTargeting() === true : stryMutAct_9fa48("85692") ? true : (stryCov_9fa48("85692", "85693"), service.shouldAllowJoinConvergenceStrictTargeting() !== (stryMutAct_9fa48("85694") ? false : (stryCov_9fa48("85694"), true)))) && (stryMutAct_9fa48("85695") ? allowMetadataPublicationConvergenceIngress : (stryCov_9fa48("85695"), !allowMetadataPublicationConvergenceIngress)))))) {
        if (stryMutAct_9fa48("85696")) {
          {}
        } else {
          stryCov_9fa48("85696");
          return stryMutAct_9fa48("85697") ? true : (stryCov_9fa48("85697"), false);
        }
      }
      if (stryMutAct_9fa48("85699") ? false : stryMutAct_9fa48("85698") ? true : (stryCov_9fa48("85698", "85699"), service.isLocalForwardTarget(stryMutAct_9fa48("85702") ? selection?.cacheLeaderService?.[COLUMN.SERVICE_ID] && null : stryMutAct_9fa48("85701") ? false : stryMutAct_9fa48("85700") ? true : (stryCov_9fa48("85700", "85701", "85702"), (stryMutAct_9fa48("85704") ? selection.cacheLeaderService?.[COLUMN.SERVICE_ID] : stryMutAct_9fa48("85703") ? selection?.cacheLeaderService[COLUMN.SERVICE_ID] : (stryCov_9fa48("85703", "85704"), selection?.cacheLeaderService?.[COLUMN.SERVICE_ID])) || null), stryMutAct_9fa48("85707") ? selection?.cacheLeaderService?.[COLUMN.ADDRESS] && null : stryMutAct_9fa48("85706") ? false : stryMutAct_9fa48("85705") ? true : (stryCov_9fa48("85705", "85706", "85707"), (stryMutAct_9fa48("85709") ? selection.cacheLeaderService?.[COLUMN.ADDRESS] : stryMutAct_9fa48("85708") ? selection?.cacheLeaderService[COLUMN.ADDRESS] : (stryCov_9fa48("85708", "85709"), selection?.cacheLeaderService?.[COLUMN.ADDRESS])) || null)))) {
        if (stryMutAct_9fa48("85710")) {
          {}
        } else {
          stryCov_9fa48("85710");
          return stryMutAct_9fa48("85711") ? false : (stryCov_9fa48("85711"), true);
        }
      }
      if (stryMutAct_9fa48("85713") ? false : stryMutAct_9fa48("85712") ? true : (stryCov_9fa48("85712", "85713"), service.isLocalForwardTarget(service.normalizeLeaderReplicaId(service.leaderId)))) {
        if (stryMutAct_9fa48("85714")) {
          {}
        } else {
          stryCov_9fa48("85714");
          return stryMutAct_9fa48("85715") ? false : (stryCov_9fa48("85715"), true);
        }
      }

      // MOVE_REPLICA joiners can receive strict CDC directly before any
      // authoritative or live leader hints are locally visible. In that window,
      // fail closed causes a bootstrap deadlock because the local cache updates
      // needed to make ingress "ready" can only arrive through this strict path.
      // Seed/bootstrap convergence can hit the same self-deadlock while leader
      // metadata is still incomplete but lifecycle publication is already open.
      if (stryMutAct_9fa48("85718") ? Array.isArray(selection?.targets) || selection.targets.length === NUM.ZERO : stryMutAct_9fa48("85717") ? false : stryMutAct_9fa48("85716") ? true : (stryCov_9fa48("85716", "85717", "85718"), Array.isArray(stryMutAct_9fa48("85719") ? selection.targets : (stryCov_9fa48("85719"), selection?.targets)) && (stryMutAct_9fa48("85721") ? selection.targets.length !== NUM.ZERO : stryMutAct_9fa48("85720") ? true : (stryCov_9fa48("85720", "85721"), selection.targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85722")) {
          {}
        } else {
          stryCov_9fa48("85722");
          return stryMutAct_9fa48("85723") ? false : (stryCov_9fa48("85723"), true);
        }
      }
      return stryMutAct_9fa48("85726") ? service.resolveCanonicalLeaderNodeIdFromCache() !== service.nodeId : stryMutAct_9fa48("85725") ? false : stryMutAct_9fa48("85724") ? true : (stryCov_9fa48("85724", "85725", "85726"), service.resolveCanonicalLeaderNodeIdFromCache() === service.nodeId);
    }
  }
  buildIngressReadinessResult(ready, reason = null, retryAfterMs = undefined, extra = {}) {
    if (stryMutAct_9fa48("85727")) {
      {}
    } else {
      stryCov_9fa48("85727");
      const result = stryMutAct_9fa48("85728") ? {} : (stryCov_9fa48("85728"), {
        ready,
        ...extra
      });
      if (stryMutAct_9fa48("85731") ? reason === null : stryMutAct_9fa48("85730") ? false : stryMutAct_9fa48("85729") ? true : (stryCov_9fa48("85729", "85730", "85731"), reason !== null)) {
        if (stryMutAct_9fa48("85732")) {
          {}
        } else {
          stryCov_9fa48("85732");
          result.reason = reason;
        }
      }
      if (stryMutAct_9fa48("85734") ? false : stryMutAct_9fa48("85733") ? true : (stryCov_9fa48("85733", "85734"), Number.isFinite(retryAfterMs))) {
        if (stryMutAct_9fa48("85735")) {
          {}
        } else {
          stryCov_9fa48("85735");
          result.retryAfterMs = retryAfterMs;
        }
      }
      return result;
    }
  }
  buildMetadataForwardSelectionResult(selection, extra = {}) {
    if (stryMutAct_9fa48("85736")) {
      {}
    } else {
      stryCov_9fa48("85736");
      return stryMutAct_9fa48("85737") ? {} : (stryCov_9fa48("85737"), {
        ...selection,
        ...extra
      });
    }
  }
  buildForwardTopologyRepairOutcome(repaired, outcome) {
    if (stryMutAct_9fa48("85738")) {
      {}
    } else {
      stryCov_9fa48("85738");
      return stryMutAct_9fa48("85739") ? {} : (stryCov_9fa48("85739"), {
        repaired,
        outcome
      });
    }
  }
  canAcceptCDCEvent(cdcEvent = {}) {
    if (stryMutAct_9fa48("85740")) {
      {}
    } else {
      stryCov_9fa48("85740");
      const service = this.service;
      if (stryMutAct_9fa48("85742") ? false : stryMutAct_9fa48("85741") ? true : (stryCov_9fa48("85741", "85742"), service.isCurrentRaftLeader())) {
        if (stryMutAct_9fa48("85743")) {
          {}
        } else {
          stryCov_9fa48("85743");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85744") ? false : (stryCov_9fa48("85744"), true));
        }
      }
      const selection = service.resolveCDCForwardSelection(stryMutAct_9fa48("85745") ? {} : (stryCov_9fa48("85745"), {
        tableName: stryMutAct_9fa48("85748") ? cdcEvent?.tableName && null : stryMutAct_9fa48("85747") ? false : stryMutAct_9fa48("85746") ? true : (stryCov_9fa48("85746", "85747", "85748"), (stryMutAct_9fa48("85749") ? cdcEvent.tableName : (stryCov_9fa48("85749"), cdcEvent?.tableName)) || null),
        operation: stryMutAct_9fa48("85752") ? cdcEvent?.operation && null : stryMutAct_9fa48("85751") ? false : stryMutAct_9fa48("85750") ? true : (stryCov_9fa48("85750", "85751", "85752"), (stryMutAct_9fa48("85753") ? cdcEvent.operation : (stryCov_9fa48("85753"), cdcEvent?.operation)) || null)
      }));
      if (stryMutAct_9fa48("85756") ? false : stryMutAct_9fa48("85755") ? true : stryMutAct_9fa48("85754") ? selection.strictForwarding : (stryCov_9fa48("85754", "85755", "85756"), !selection.strictForwarding)) {
        if (stryMutAct_9fa48("85757")) {
          {}
        } else {
          stryCov_9fa48("85757");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85758") ? false : (stryCov_9fa48("85758"), true));
        }
      }
      if (stryMutAct_9fa48("85760") ? false : stryMutAct_9fa48("85759") ? true : (stryCov_9fa48("85759", "85760"), this.shouldUseCanonicalLocalIngressForStrictCDC(selection))) {
        if (stryMutAct_9fa48("85761")) {
          {}
        } else {
          stryCov_9fa48("85761");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85762") ? false : (stryCov_9fa48("85762"), true), null, selection.strictForwardRetryAfterMs, stryMutAct_9fa48("85763") ? {} : (stryCov_9fa48("85763"), {
            localIngress: stryMutAct_9fa48("85764") ? false : (stryCov_9fa48("85764"), true)
          }));
        }
      }
      if (stryMutAct_9fa48("85768") ? selection.targets.length <= NUM.ZERO : stryMutAct_9fa48("85767") ? selection.targets.length >= NUM.ZERO : stryMutAct_9fa48("85766") ? false : stryMutAct_9fa48("85765") ? true : (stryCov_9fa48("85765", "85766", "85767", "85768"), selection.targets.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("85769")) {
          {}
        } else {
          stryCov_9fa48("85769");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85770") ? false : (stryCov_9fa48("85770"), true));
        }
      }
      void service.maybeRepairAuthoritativeForwardTopology(stryMutAct_9fa48("85771") ? {} : (stryCov_9fa48("85771"), {
        errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        tableName: stryMutAct_9fa48("85774") ? cdcEvent?.tableName && null : stryMutAct_9fa48("85773") ? false : stryMutAct_9fa48("85772") ? true : (stryCov_9fa48("85772", "85773", "85774"), (stryMutAct_9fa48("85775") ? cdcEvent.tableName : (stryCov_9fa48("85775"), cdcEvent?.tableName)) || null),
        operation: stryMutAct_9fa48("85778") ? cdcEvent?.operation && null : stryMutAct_9fa48("85777") ? false : stryMutAct_9fa48("85776") ? true : (stryCov_9fa48("85776", "85777", "85778"), (stryMutAct_9fa48("85779") ? cdcEvent.operation : (stryCov_9fa48("85779"), cdcEvent?.operation)) || null)
      }));
      return this.buildIngressReadinessResult(stryMutAct_9fa48("85780") ? true : (stryCov_9fa48("85780"), false), MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN, selection.strictForwardRetryAfterMs);
    }
  }
  getMetadataIngressReadiness(options = {}) {
    if (stryMutAct_9fa48("85781")) {
      {}
    } else {
      stryCov_9fa48("85781");
      const service = this.service;
      if (stryMutAct_9fa48("85784") ? service.initialized === true : stryMutAct_9fa48("85783") ? false : stryMutAct_9fa48("85782") ? true : (stryCov_9fa48("85782", "85783", "85784"), service.initialized !== (stryMutAct_9fa48("85785") ? false : (stryCov_9fa48("85785"), true)))) {
        if (stryMutAct_9fa48("85786")) {
          {}
        } else {
          stryCov_9fa48("85786");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85787") ? true : (stryCov_9fa48("85787"), false), MESSAGE_GROUP_FORWARDING_REASON.INGRESS_NOT_INITIALIZED, service.resolveStrictCdcForwardRetryAfterMs());
        }
      } else if (stryMutAct_9fa48("85789") ? false : stryMutAct_9fa48("85788") ? true : (stryCov_9fa48("85788", "85789"), service.isCurrentRaftLeader())) {
        if (stryMutAct_9fa48("85790")) {
          {}
        } else {
          stryCov_9fa48("85790");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85791") ? false : (stryCov_9fa48("85791"), true));
        }
      }
      const requiredTables = stryMutAct_9fa48("85792") ? [] : (stryCov_9fa48("85792"), [...new Set(stryMutAct_9fa48("85793") ? Array.isArray(options.requiredTables) ? options.requiredTables : [] : (stryCov_9fa48("85793"), (Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("85794") ? ["Stryker was here"] : (stryCov_9fa48("85794"), [])).filter(stryMutAct_9fa48("85795") ? () => undefined : (stryCov_9fa48("85795"), tableName => stryMutAct_9fa48("85798") ? typeof tableName === TYPEOF.STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("85797") ? false : stryMutAct_9fa48("85796") ? true : (stryCov_9fa48("85796", "85797", "85798"), (stryMutAct_9fa48("85800") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("85799") ? true : (stryCov_9fa48("85799", "85800"), typeof tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("85803") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("85802") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("85801") ? true : (stryCov_9fa48("85801", "85802", "85803"), tableName.length > NUM.ZERO)))))))]);
      if (stryMutAct_9fa48("85806") ? requiredTables.length !== NUM.ZERO : stryMutAct_9fa48("85805") ? false : stryMutAct_9fa48("85804") ? true : (stryCov_9fa48("85804", "85805", "85806"), requiredTables.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("85807")) {
          {}
        } else {
          stryCov_9fa48("85807");
          return this.buildIngressReadinessResult(stryMutAct_9fa48("85808") ? true : (stryCov_9fa48("85808"), false), MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN, service.resolveStrictCdcForwardRetryAfterMs());
        }
      }
      let retryAfterMs = NUM.ZERO;
      for (const tableName of requiredTables) {
        if (stryMutAct_9fa48("85809")) {
          {}
        } else {
          stryCov_9fa48("85809");
          const readiness = service.canAcceptCDCEvent(stryMutAct_9fa48("85810") ? {} : (stryCov_9fa48("85810"), {
            tableName
          }));
          if (stryMutAct_9fa48("85813") ? readiness.ready === true : stryMutAct_9fa48("85812") ? false : stryMutAct_9fa48("85811") ? true : (stryCov_9fa48("85811", "85812", "85813"), readiness.ready !== (stryMutAct_9fa48("85814") ? false : (stryCov_9fa48("85814"), true)))) {
            if (stryMutAct_9fa48("85815")) {
              {}
            } else {
              stryCov_9fa48("85815");
              return this.buildIngressReadinessResult(stryMutAct_9fa48("85816") ? true : (stryCov_9fa48("85816"), false), stryMutAct_9fa48("85819") ? readiness.reason && MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN : stryMutAct_9fa48("85818") ? false : stryMutAct_9fa48("85817") ? true : (stryCov_9fa48("85817", "85818", "85819"), readiness.reason || MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN), Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : service.resolveStrictCdcForwardRetryAfterMs());
            }
          }
          if (stryMutAct_9fa48("85821") ? false : stryMutAct_9fa48("85820") ? true : (stryCov_9fa48("85820", "85821"), Number.isFinite(readiness.retryAfterMs))) {
            if (stryMutAct_9fa48("85822")) {
              {}
            } else {
              stryCov_9fa48("85822");
              retryAfterMs = stryMutAct_9fa48("85823") ? Math.min(retryAfterMs, readiness.retryAfterMs) : (stryCov_9fa48("85823"), Math.max(retryAfterMs, readiness.retryAfterMs));
            }
          }
        }
      }
      return this.buildIngressReadinessResult(stryMutAct_9fa48("85824") ? false : (stryCov_9fa48("85824"), true), null, (stryMutAct_9fa48("85828") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("85827") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("85826") ? false : stryMutAct_9fa48("85825") ? true : (stryCov_9fa48("85825", "85826", "85827", "85828"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : undefined);
    }
  }
  async resolveMetadataIngressForwardSelection(options = {}) {
    if (stryMutAct_9fa48("85829")) {
      {}
    } else {
      stryCov_9fa48("85829");
      const service = this.service;
      const requiredTables = stryMutAct_9fa48("85830") ? [] : (stryCov_9fa48("85830"), [...new Set(stryMutAct_9fa48("85831") ? Array.isArray(options.requiredTables) ? options.requiredTables : [] : (stryCov_9fa48("85831"), (Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("85832") ? ["Stryker was here"] : (stryCov_9fa48("85832"), [])).filter(stryMutAct_9fa48("85833") ? () => undefined : (stryCov_9fa48("85833"), tableName => stryMutAct_9fa48("85836") ? typeof tableName === TYPEOF.STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("85835") ? false : stryMutAct_9fa48("85834") ? true : (stryCov_9fa48("85834", "85835", "85836"), (stryMutAct_9fa48("85838") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("85837") ? true : (stryCov_9fa48("85837", "85838"), typeof tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("85841") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("85840") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("85839") ? true : (stryCov_9fa48("85839", "85840", "85841"), tableName.length > NUM.ZERO)))))))]);
      const tableName = stryMutAct_9fa48("85844") ? (requiredTables.find(candidate => STRICT_CDC_FORWARD_SYSTEM_TABLES.has(candidate)) || requiredTables[NUM.ZERO]) && null : stryMutAct_9fa48("85843") ? false : stryMutAct_9fa48("85842") ? true : (stryCov_9fa48("85842", "85843", "85844"), (stryMutAct_9fa48("85846") ? requiredTables.find(candidate => STRICT_CDC_FORWARD_SYSTEM_TABLES.has(candidate)) && requiredTables[NUM.ZERO] : stryMutAct_9fa48("85845") ? false : (stryCov_9fa48("85845", "85846"), requiredTables.find(stryMutAct_9fa48("85847") ? () => undefined : (stryCov_9fa48("85847"), candidate => STRICT_CDC_FORWARD_SYSTEM_TABLES.has(candidate))) || requiredTables[NUM.ZERO])) || null);
      if (stryMutAct_9fa48("85850") ? false : stryMutAct_9fa48("85849") ? true : stryMutAct_9fa48("85848") ? tableName : (stryCov_9fa48("85848", "85849", "85850"), !tableName)) {
        if (stryMutAct_9fa48("85851")) {
          {}
        } else {
          stryCov_9fa48("85851");
          return this.buildMetadataForwardSelectionResult(stryMutAct_9fa48("85852") ? {} : (stryCov_9fa48("85852"), {
            strictForwarding: stryMutAct_9fa48("85853") ? true : (stryCov_9fa48("85853"), false),
            strictForwardRetryAfterMs: NUM.ZERO,
            targets: stryMutAct_9fa48("85854") ? ["Stryker was here"] : (stryCov_9fa48("85854"), []),
            suppressedCount: NUM.ZERO
          }));
        }
      }
      let selection = service.resolveCDCForwardSelection(stryMutAct_9fa48("85855") ? {} : (stryCov_9fa48("85855"), {
        tableName,
        operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS
      }));
      if (stryMutAct_9fa48("85858") ? selection.strictForwarding === true || selection.targets.length === NUM.ZERO : stryMutAct_9fa48("85857") ? false : stryMutAct_9fa48("85856") ? true : (stryCov_9fa48("85856", "85857", "85858"), (stryMutAct_9fa48("85860") ? selection.strictForwarding !== true : stryMutAct_9fa48("85859") ? true : (stryCov_9fa48("85859", "85860"), selection.strictForwarding === (stryMutAct_9fa48("85861") ? false : (stryCov_9fa48("85861"), true)))) && (stryMutAct_9fa48("85863") ? selection.targets.length !== NUM.ZERO : stryMutAct_9fa48("85862") ? true : (stryCov_9fa48("85862", "85863"), selection.targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85864")) {
          {}
        } else {
          stryCov_9fa48("85864");
          await service.maybeRepairAuthoritativeForwardTopology(stryMutAct_9fa48("85865") ? {} : (stryCov_9fa48("85865"), {
            errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            tableName,
            operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS
          }));
          selection = service.resolveCDCForwardSelection(stryMutAct_9fa48("85866") ? {} : (stryCov_9fa48("85866"), {
            tableName,
            operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS
          }));
        }
      }
      if (stryMutAct_9fa48("85869") ? selection.strictForwarding === true || selection.targets.length === NUM.ZERO : stryMutAct_9fa48("85868") ? false : stryMutAct_9fa48("85867") ? true : (stryCov_9fa48("85867", "85868", "85869"), (stryMutAct_9fa48("85871") ? selection.strictForwarding !== true : stryMutAct_9fa48("85870") ? true : (stryCov_9fa48("85870", "85871"), selection.strictForwarding === (stryMutAct_9fa48("85872") ? false : (stryCov_9fa48("85872"), true)))) && (stryMutAct_9fa48("85874") ? selection.targets.length !== NUM.ZERO : stryMutAct_9fa48("85873") ? true : (stryCov_9fa48("85873", "85874"), selection.targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85875")) {
          {}
        } else {
          stryCov_9fa48("85875");
          const readiness = service.canAcceptCDCEvent(stryMutAct_9fa48("85876") ? {} : (stryCov_9fa48("85876"), {
            tableName,
            operation: stryMutAct_9fa48("85877") ? "" : (stryCov_9fa48("85877"), 'metadata_ingress')
          }));
          if (stryMutAct_9fa48("85880") ? readiness?.ready === true || readiness?.localIngress === true : stryMutAct_9fa48("85879") ? false : stryMutAct_9fa48("85878") ? true : (stryCov_9fa48("85878", "85879", "85880"), (stryMutAct_9fa48("85882") ? readiness?.ready !== true : stryMutAct_9fa48("85881") ? true : (stryCov_9fa48("85881", "85882"), (stryMutAct_9fa48("85883") ? readiness.ready : (stryCov_9fa48("85883"), readiness?.ready)) === (stryMutAct_9fa48("85884") ? false : (stryCov_9fa48("85884"), true)))) && (stryMutAct_9fa48("85886") ? readiness?.localIngress !== true : stryMutAct_9fa48("85885") ? true : (stryCov_9fa48("85885", "85886"), (stryMutAct_9fa48("85887") ? readiness.localIngress : (stryCov_9fa48("85887"), readiness?.localIngress)) === (stryMutAct_9fa48("85888") ? false : (stryCov_9fa48("85888"), true)))))) {
            if (stryMutAct_9fa48("85889")) {
              {}
            } else {
              stryCov_9fa48("85889");
              return this.buildMetadataForwardSelectionResult(selection, stryMutAct_9fa48("85890") ? {} : (stryCov_9fa48("85890"), {
                localIngress: stryMutAct_9fa48("85891") ? false : (stryCov_9fa48("85891"), true),
                strictForwardRetryAfterMs: Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : selection.strictForwardRetryAfterMs
              }));
            }
          }
        }
      }
      return selection;
    }
  }
  async forwardMetadataIngressPayloadToLeader(payload, options = {}) {
    if (stryMutAct_9fa48("85892")) {
      {}
    } else {
      stryCov_9fa48("85892");
      const service = this.service;
      const selection = await service.resolveMetadataIngressForwardSelection(stryMutAct_9fa48("85893") ? {} : (stryCov_9fa48("85893"), {
        requiredTables: options.requiredTables
      }));
      const {
        strictForwarding,
        strictForwardRetryAfterMs,
        targets,
        suppressedCount
      } = selection;
      if (stryMutAct_9fa48("85896") ? !Array.isArray(targets) && targets.length === NUM.ZERO : stryMutAct_9fa48("85895") ? false : stryMutAct_9fa48("85894") ? true : (stryCov_9fa48("85894", "85895", "85896"), (stryMutAct_9fa48("85897") ? Array.isArray(targets) : (stryCov_9fa48("85897"), !Array.isArray(targets))) || (stryMutAct_9fa48("85899") ? targets.length !== NUM.ZERO : stryMutAct_9fa48("85898") ? false : (stryCov_9fa48("85898", "85899"), targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85900")) {
          {}
        } else {
          stryCov_9fa48("85900");
          const error = strictForwarding ? this.buildDeferredCdcForwardError(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN, strictForwardRetryAfterMs) : new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
          if (stryMutAct_9fa48("85904") ? suppressedCount <= NUM.ZERO : stryMutAct_9fa48("85903") ? suppressedCount >= NUM.ZERO : stryMutAct_9fa48("85902") ? false : stryMutAct_9fa48("85901") ? true : (stryCov_9fa48("85901", "85902", "85903", "85904"), suppressedCount > NUM.ZERO)) {
            if (stryMutAct_9fa48("85905")) {
              {}
            } else {
              stryCov_9fa48("85905");
              error.retryable = stryMutAct_9fa48("85906") ? true : (stryCov_9fa48("85906"), false);
            }
          }
          throw error;
        }
      }
      const forwardedByNodeId = (stryMutAct_9fa48("85909") ? typeof options.forwardedByNodeId === TYPEOF.STRING || options.forwardedByNodeId.length > NUM.ZERO : stryMutAct_9fa48("85908") ? false : stryMutAct_9fa48("85907") ? true : (stryCov_9fa48("85907", "85908", "85909"), (stryMutAct_9fa48("85911") ? typeof options.forwardedByNodeId !== TYPEOF.STRING : stryMutAct_9fa48("85910") ? true : (stryCov_9fa48("85910", "85911"), typeof options.forwardedByNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("85914") ? options.forwardedByNodeId.length <= NUM.ZERO : stryMutAct_9fa48("85913") ? options.forwardedByNodeId.length >= NUM.ZERO : stryMutAct_9fa48("85912") ? true : (stryCov_9fa48("85912", "85913", "85914"), options.forwardedByNodeId.length > NUM.ZERO)))) ? options.forwardedByNodeId : service.nodeId;
      const forwardedBy = Array.isArray(stryMutAct_9fa48("85915") ? payload[ControlPlaneField.FORWARDED_BY] : (stryCov_9fa48("85915"), payload?.[ControlPlaneField.FORWARDED_BY])) ? payload[ControlPlaneField.FORWARDED_BY] : (stryMutAct_9fa48("85916") ? payload[ControlPlaneField.FORWARDED_BY] : (stryCov_9fa48("85916"), payload?.[ControlPlaneField.FORWARDED_BY])) ? stryMutAct_9fa48("85917") ? [] : (stryCov_9fa48("85917"), [payload[ControlPlaneField.FORWARDED_BY]]) : stryMutAct_9fa48("85918") ? ["Stryker was here"] : (stryCov_9fa48("85918"), []);
      if (stryMutAct_9fa48("85920") ? false : stryMutAct_9fa48("85919") ? true : (stryCov_9fa48("85919", "85920"), forwardedBy.includes(forwardedByNodeId))) {
        if (stryMutAct_9fa48("85921")) {
          {}
        } else {
          stryCov_9fa48("85921");
          return;
        }
      }
      const forwardedPayload = stryMutAct_9fa48("85922") ? {} : (stryCov_9fa48("85922"), {
        ...payload,
        [ControlPlaneField.FORWARDED_BY]: stryMutAct_9fa48("85923") ? [] : (stryCov_9fa48("85923"), [...forwardedBy, forwardedByNodeId])
      });
      let lastError = null;
      for (const target of targets) {
        if (stryMutAct_9fa48("85924")) {
          {}
        } else {
          stryCov_9fa48("85924");
          const targetAddress = (stryMutAct_9fa48("85927") ? typeof target?.address === TYPEOF.STRING || target.address.length > NUM.ZERO : stryMutAct_9fa48("85926") ? false : stryMutAct_9fa48("85925") ? true : (stryCov_9fa48("85925", "85926", "85927"), (stryMutAct_9fa48("85929") ? typeof target?.address !== TYPEOF.STRING : stryMutAct_9fa48("85928") ? true : (stryCov_9fa48("85928", "85929"), typeof (stryMutAct_9fa48("85930") ? target.address : (stryCov_9fa48("85930"), target?.address)) === TYPEOF.STRING)) && (stryMutAct_9fa48("85933") ? target.address.length <= NUM.ZERO : stryMutAct_9fa48("85932") ? target.address.length >= NUM.ZERO : stryMutAct_9fa48("85931") ? true : (stryCov_9fa48("85931", "85932", "85933"), target.address.length > NUM.ZERO)))) ? target.address : service.buildPeerAddress(stryMutAct_9fa48("85936") ? target?.serviceId && null : stryMutAct_9fa48("85935") ? false : stryMutAct_9fa48("85934") ? true : (stryCov_9fa48("85934", "85935", "85936"), (stryMutAct_9fa48("85937") ? target.serviceId : (stryCov_9fa48("85937"), target?.serviceId)) || null));
          if (stryMutAct_9fa48("85940") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("85939") ? false : stryMutAct_9fa48("85938") ? true : (stryCov_9fa48("85938", "85939", "85940"), (stryMutAct_9fa48("85942") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("85941") ? false : (stryCov_9fa48("85941", "85942"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("85944") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("85943") ? false : (stryCov_9fa48("85943", "85944"), targetAddress.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("85945")) {
              {}
            } else {
              stryCov_9fa48("85945");
              lastError = new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED);
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("85946")) {
              {}
            } else {
              stryCov_9fa48("85946");
              await service.sendMessage(targetAddress, forwardedPayload);
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("85947")) {
              {}
            } else {
              stryCov_9fa48("85947");
              lastError = error;
            }
          }
        }
      }
      throw stryMutAct_9fa48("85950") ? lastError && new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN) : stryMutAct_9fa48("85949") ? false : stryMutAct_9fa48("85948") ? true : (stryCov_9fa48("85948", "85949", "85950"), lastError || new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN));
    }
  }
  isMetadataIngressReady(options = {}) {
    if (stryMutAct_9fa48("85951")) {
      {}
    } else {
      stryCov_9fa48("85951");
      return stryMutAct_9fa48("85954") ? this.service.getMetadataIngressReadiness(options).ready !== true : stryMutAct_9fa48("85953") ? false : stryMutAct_9fa48("85952") ? true : (stryCov_9fa48("85952", "85953", "85954"), this.service.getMetadataIngressReadiness(options).ready === (stryMutAct_9fa48("85955") ? false : (stryCov_9fa48("85955"), true)));
    }
  }
  isStrictForwardTargetEligible(target = null) {
    if (stryMutAct_9fa48("85956")) {
      {}
    } else {
      stryCov_9fa48("85956");
      const service = this.service;
      if (stryMutAct_9fa48("85959") ? (!target || typeof target !== TYPEOF.OBJECT || typeof target.serviceId !== TYPEOF.STRING) && target.serviceId.length === NUM.ZERO : stryMutAct_9fa48("85958") ? false : stryMutAct_9fa48("85957") ? true : (stryCov_9fa48("85957", "85958", "85959"), (stryMutAct_9fa48("85961") ? (!target || typeof target !== TYPEOF.OBJECT) && typeof target.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("85960") ? false : (stryCov_9fa48("85960", "85961"), (stryMutAct_9fa48("85963") ? !target && typeof target !== TYPEOF.OBJECT : stryMutAct_9fa48("85962") ? false : (stryCov_9fa48("85962", "85963"), (stryMutAct_9fa48("85964") ? target : (stryCov_9fa48("85964"), !target)) || (stryMutAct_9fa48("85966") ? typeof target === TYPEOF.OBJECT : stryMutAct_9fa48("85965") ? false : (stryCov_9fa48("85965", "85966"), typeof target !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("85968") ? typeof target.serviceId === TYPEOF.STRING : stryMutAct_9fa48("85967") ? false : (stryCov_9fa48("85967", "85968"), typeof target.serviceId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("85970") ? target.serviceId.length !== NUM.ZERO : stryMutAct_9fa48("85969") ? false : (stryCov_9fa48("85969", "85970"), target.serviceId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85971")) {
          {}
        } else {
          stryCov_9fa48("85971");
          return stryMutAct_9fa48("85972") ? true : (stryCov_9fa48("85972"), false);
        }
      }
      const nodeId = service.resolveForwardTargetNodeId(target);
      if (stryMutAct_9fa48("85975") ? typeof nodeId !== TYPEOF.STRING && nodeId.length === NUM.ZERO : stryMutAct_9fa48("85974") ? false : stryMutAct_9fa48("85973") ? true : (stryCov_9fa48("85973", "85974", "85975"), (stryMutAct_9fa48("85977") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("85976") ? false : (stryCov_9fa48("85976", "85977"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("85979") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("85978") ? false : (stryCov_9fa48("85978", "85979"), nodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85980")) {
          {}
        } else {
          stryCov_9fa48("85980");
          return stryMutAct_9fa48("85981") ? true : (stryCov_9fa48("85981"), false);
        }
      }
      if (stryMutAct_9fa48("85984") ? false : stryMutAct_9fa48("85983") ? true : stryMutAct_9fa48("85982") ? service.isStrictForwardNodeConnected(nodeId) : (stryCov_9fa48("85982", "85983", "85984"), !service.isStrictForwardNodeConnected(nodeId))) {
        if (stryMutAct_9fa48("85985")) {
          {}
        } else {
          stryCov_9fa48("85985");
          return stryMutAct_9fa48("85986") ? true : (stryCov_9fa48("85986"), false);
        }
      }
      return stryMutAct_9fa48("85987") ? false : (stryCov_9fa48("85987"), true);
    }
  }
  shouldAllowJoinConvergenceStrictTargeting() {
    if (stryMutAct_9fa48("85988")) {
      {}
    } else {
      stryCov_9fa48("85988");
      return this.service.shouldSuppressJoinPhaseRaftParticipation();
    }
  }
  resolveJoinConvergenceBootstrapForwardTarget() {
    if (stryMutAct_9fa48("85989")) {
      {}
    } else {
      stryCov_9fa48("85989");
      const service = this.service;
      if (stryMutAct_9fa48("85992") ? !Array.isArray(service.peerAddresses) && service.peerAddresses.length === NUM.ZERO : stryMutAct_9fa48("85991") ? false : stryMutAct_9fa48("85990") ? true : (stryCov_9fa48("85990", "85991", "85992"), (stryMutAct_9fa48("85993") ? Array.isArray(service.peerAddresses) : (stryCov_9fa48("85993"), !Array.isArray(service.peerAddresses))) || (stryMutAct_9fa48("85995") ? service.peerAddresses.length !== NUM.ZERO : stryMutAct_9fa48("85994") ? false : (stryCov_9fa48("85994", "85995"), service.peerAddresses.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("85996")) {
          {}
        } else {
          stryCov_9fa48("85996");
          return null;
        }
      }
      const leaderNodeId = service.resolveCanonicalLeaderNodeIdFromCache();
      if (stryMutAct_9fa48("85999") ? typeof leaderNodeId !== TYPEOF.STRING && leaderNodeId.length === NUM.ZERO : stryMutAct_9fa48("85998") ? false : stryMutAct_9fa48("85997") ? true : (stryCov_9fa48("85997", "85998", "85999"), (stryMutAct_9fa48("86001") ? typeof leaderNodeId === TYPEOF.STRING : stryMutAct_9fa48("86000") ? false : (stryCov_9fa48("86000", "86001"), typeof leaderNodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("86003") ? leaderNodeId.length !== NUM.ZERO : stryMutAct_9fa48("86002") ? false : (stryCov_9fa48("86002", "86003"), leaderNodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86004")) {
          {}
        } else {
          stryCov_9fa48("86004");
          return null;
        }
      }
      for (const address of service.peerAddresses) {
        if (stryMutAct_9fa48("86005")) {
          {}
        } else {
          stryCov_9fa48("86005");
          if (stryMutAct_9fa48("86008") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("86007") ? false : stryMutAct_9fa48("86006") ? true : (stryCov_9fa48("86006", "86007", "86008"), (stryMutAct_9fa48("86010") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("86009") ? false : (stryCov_9fa48("86009", "86010"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("86012") ? address.length !== NUM.ZERO : stryMutAct_9fa48("86011") ? false : (stryCov_9fa48("86011", "86012"), address.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("86013")) {
              {}
            } else {
              stryCov_9fa48("86013");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("86014")) {
              {}
            } else {
              stryCov_9fa48("86014");
              const parsed = service.addressManager.parse(address);
              if (stryMutAct_9fa48("86017") ? (parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP || parsed.nodeId !== leaderNodeId) && service.isLocalForwardTarget(parsed.serviceId, address) : stryMutAct_9fa48("86016") ? false : stryMutAct_9fa48("86015") ? true : (stryCov_9fa48("86015", "86016", "86017"), (stryMutAct_9fa48("86019") ? parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP && parsed.nodeId !== leaderNodeId : stryMutAct_9fa48("86018") ? false : (stryCov_9fa48("86018", "86019"), (stryMutAct_9fa48("86021") ? parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("86020") ? false : (stryCov_9fa48("86020", "86021"), parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP)) || (stryMutAct_9fa48("86023") ? parsed.nodeId === leaderNodeId : stryMutAct_9fa48("86022") ? false : (stryCov_9fa48("86022", "86023"), parsed.nodeId !== leaderNodeId)))) || service.isLocalForwardTarget(parsed.serviceId, address))) {
                if (stryMutAct_9fa48("86024")) {
                  {}
                } else {
                  stryCov_9fa48("86024");
                  continue;
                }
              }
              return stryMutAct_9fa48("86025") ? {} : (stryCov_9fa48("86025"), {
                serviceId: parsed.serviceId,
                address
              });
            }
          } catch (_error) {
            if (stryMutAct_9fa48("86026")) {
              {}
            } else {
              stryCov_9fa48("86026");
              continue;
            }
          }
        }
      }
      return null;
    }
  }
  resolveCanonicalLeaderNodeIdFromCache() {
    if (stryMutAct_9fa48("86027")) {
      {}
    } else {
      stryCov_9fa48("86027");
      const service = this.service;
      if (stryMutAct_9fa48("86030") ? !service.systemTableCache && typeof service.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("86029") ? false : stryMutAct_9fa48("86028") ? true : (stryCov_9fa48("86028", "86029", "86030"), (stryMutAct_9fa48("86031") ? service.systemTableCache : (stryCov_9fa48("86031"), !service.systemTableCache)) || (stryMutAct_9fa48("86033") ? typeof service.systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("86032") ? false : (stryCov_9fa48("86032", "86033"), typeof service.systemTableCache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("86034")) {
          {}
        } else {
          stryCov_9fa48("86034");
          return null;
        }
      }
      const group = service.systemTableCache.get(TABLES.MESSAGE_GROUPS, service.groupId);
      const leaderNodeId = stryMutAct_9fa48("86037") ? (group?.[COLUMN.LEADER_NODE_ID] || group?.leader_node_id || group?.leaderNodeId) && null : stryMutAct_9fa48("86036") ? false : stryMutAct_9fa48("86035") ? true : (stryCov_9fa48("86035", "86036", "86037"), (stryMutAct_9fa48("86039") ? (group?.[COLUMN.LEADER_NODE_ID] || group?.leader_node_id) && group?.leaderNodeId : stryMutAct_9fa48("86038") ? false : (stryCov_9fa48("86038", "86039"), (stryMutAct_9fa48("86041") ? group?.[COLUMN.LEADER_NODE_ID] && group?.leader_node_id : stryMutAct_9fa48("86040") ? false : (stryCov_9fa48("86040", "86041"), (stryMutAct_9fa48("86042") ? group[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("86042"), group?.[COLUMN.LEADER_NODE_ID])) || (stryMutAct_9fa48("86043") ? group.leader_node_id : (stryCov_9fa48("86043"), group?.leader_node_id)))) || (stryMutAct_9fa48("86044") ? group.leaderNodeId : (stryCov_9fa48("86044"), group?.leaderNodeId)))) || null);
      return (stryMutAct_9fa48("86047") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("86046") ? false : stryMutAct_9fa48("86045") ? true : (stryCov_9fa48("86045", "86046", "86047"), (stryMutAct_9fa48("86049") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("86048") ? true : (stryCov_9fa48("86048", "86049"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("86052") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("86051") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("86050") ? true : (stryCov_9fa48("86050", "86051", "86052"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null;
    }
  }
  isLocalForwardTarget(serviceId, address = null) {
    if (stryMutAct_9fa48("86053")) {
      {}
    } else {
      stryCov_9fa48("86053");
      const service = this.service;
      if (stryMutAct_9fa48("86056") ? typeof address === TYPEOF.STRING || address.length > NUM.ZERO : stryMutAct_9fa48("86055") ? false : stryMutAct_9fa48("86054") ? true : (stryCov_9fa48("86054", "86055", "86056"), (stryMutAct_9fa48("86058") ? typeof address !== TYPEOF.STRING : stryMutAct_9fa48("86057") ? true : (stryCov_9fa48("86057", "86058"), typeof address === TYPEOF.STRING)) && (stryMutAct_9fa48("86061") ? address.length <= NUM.ZERO : stryMutAct_9fa48("86060") ? address.length >= NUM.ZERO : stryMutAct_9fa48("86059") ? true : (stryCov_9fa48("86059", "86060", "86061"), address.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("86062")) {
          {}
        } else {
          stryCov_9fa48("86062");
          if (stryMutAct_9fa48("86065") ? address !== service.unifiedAddress : stryMutAct_9fa48("86064") ? false : stryMutAct_9fa48("86063") ? true : (stryCov_9fa48("86063", "86064", "86065"), address === service.unifiedAddress)) {
            if (stryMutAct_9fa48("86066")) {
              {}
            } else {
              stryCov_9fa48("86066");
              return stryMutAct_9fa48("86067") ? false : (stryCov_9fa48("86067"), true);
            }
          }
          try {
            if (stryMutAct_9fa48("86068")) {
              {}
            } else {
              stryCov_9fa48("86068");
              const parsed = service.addressManager.parse(address);
              return stryMutAct_9fa48("86071") ? parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP && parsed?.serviceId === service.replicaId || parsed?.nodeId === service.nodeId : stryMutAct_9fa48("86070") ? false : stryMutAct_9fa48("86069") ? true : (stryCov_9fa48("86069", "86070", "86071"), (stryMutAct_9fa48("86073") ? parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP || parsed?.serviceId === service.replicaId : stryMutAct_9fa48("86072") ? true : (stryCov_9fa48("86072", "86073"), (stryMutAct_9fa48("86075") ? parsed?.serviceType !== ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("86074") ? true : (stryCov_9fa48("86074", "86075"), (stryMutAct_9fa48("86076") ? parsed.serviceType : (stryCov_9fa48("86076"), parsed?.serviceType)) === ENTITY_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("86078") ? parsed?.serviceId !== service.replicaId : stryMutAct_9fa48("86077") ? true : (stryCov_9fa48("86077", "86078"), (stryMutAct_9fa48("86079") ? parsed.serviceId : (stryCov_9fa48("86079"), parsed?.serviceId)) === service.replicaId)))) && (stryMutAct_9fa48("86081") ? parsed?.nodeId !== service.nodeId : stryMutAct_9fa48("86080") ? true : (stryCov_9fa48("86080", "86081"), (stryMutAct_9fa48("86082") ? parsed.nodeId : (stryCov_9fa48("86082"), parsed?.nodeId)) === service.nodeId)));
            }
          } catch (_error) {
            // Ignore malformed addresses and fall back to service-id-only logic.
          }
        }
      }
      return stryMutAct_9fa48("86085") ? typeof serviceId === TYPEOF.STRING && serviceId.length > NUM.ZERO || serviceId === service.replicaId : stryMutAct_9fa48("86084") ? false : stryMutAct_9fa48("86083") ? true : (stryCov_9fa48("86083", "86084", "86085"), (stryMutAct_9fa48("86087") ? typeof serviceId === TYPEOF.STRING || serviceId.length > NUM.ZERO : stryMutAct_9fa48("86086") ? true : (stryCov_9fa48("86086", "86087"), (stryMutAct_9fa48("86089") ? typeof serviceId !== TYPEOF.STRING : stryMutAct_9fa48("86088") ? true : (stryCov_9fa48("86088", "86089"), typeof serviceId === TYPEOF.STRING)) && (stryMutAct_9fa48("86092") ? serviceId.length <= NUM.ZERO : stryMutAct_9fa48("86091") ? serviceId.length >= NUM.ZERO : stryMutAct_9fa48("86090") ? true : (stryCov_9fa48("86090", "86091", "86092"), serviceId.length > NUM.ZERO)))) && (stryMutAct_9fa48("86094") ? serviceId !== service.replicaId : stryMutAct_9fa48("86093") ? true : (stryCov_9fa48("86093", "86094"), serviceId === service.replicaId)));
    }
  }
  resolveForwardTargetNodeId(target = null) {
    if (stryMutAct_9fa48("86095")) {
      {}
    } else {
      stryCov_9fa48("86095");
      const service = this.service;
      const targetAddress = (stryMutAct_9fa48("86098") ? typeof target?.address === TYPEOF.STRING || target.address.length > NUM.ZERO : stryMutAct_9fa48("86097") ? false : stryMutAct_9fa48("86096") ? true : (stryCov_9fa48("86096", "86097", "86098"), (stryMutAct_9fa48("86100") ? typeof target?.address !== TYPEOF.STRING : stryMutAct_9fa48("86099") ? true : (stryCov_9fa48("86099", "86100"), typeof (stryMutAct_9fa48("86101") ? target.address : (stryCov_9fa48("86101"), target?.address)) === TYPEOF.STRING)) && (stryMutAct_9fa48("86104") ? target.address.length <= NUM.ZERO : stryMutAct_9fa48("86103") ? target.address.length >= NUM.ZERO : stryMutAct_9fa48("86102") ? true : (stryCov_9fa48("86102", "86103", "86104"), target.address.length > NUM.ZERO)))) ? target.address : service.resolvePeerAddressFromCache(stryMutAct_9fa48("86107") ? target?.serviceId && null : stryMutAct_9fa48("86106") ? false : stryMutAct_9fa48("86105") ? true : (stryCov_9fa48("86105", "86106", "86107"), (stryMutAct_9fa48("86108") ? target.serviceId : (stryCov_9fa48("86108"), target?.serviceId)) || null));
      if (stryMutAct_9fa48("86111") ? typeof targetAddress === TYPEOF.STRING || targetAddress.length > NUM.ZERO : stryMutAct_9fa48("86110") ? false : stryMutAct_9fa48("86109") ? true : (stryCov_9fa48("86109", "86110", "86111"), (stryMutAct_9fa48("86113") ? typeof targetAddress !== TYPEOF.STRING : stryMutAct_9fa48("86112") ? true : (stryCov_9fa48("86112", "86113"), typeof targetAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("86116") ? targetAddress.length <= NUM.ZERO : stryMutAct_9fa48("86115") ? targetAddress.length >= NUM.ZERO : stryMutAct_9fa48("86114") ? true : (stryCov_9fa48("86114", "86115", "86116"), targetAddress.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("86117")) {
          {}
        } else {
          stryCov_9fa48("86117");
          try {
            if (stryMutAct_9fa48("86118")) {
              {}
            } else {
              stryCov_9fa48("86118");
              const parsed = service.addressManager.parse(targetAddress);
              if (stryMutAct_9fa48("86121") ? typeof parsed?.nodeId === TYPEOF.STRING || parsed.nodeId.length > NUM.ZERO : stryMutAct_9fa48("86120") ? false : stryMutAct_9fa48("86119") ? true : (stryCov_9fa48("86119", "86120", "86121"), (stryMutAct_9fa48("86123") ? typeof parsed?.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("86122") ? true : (stryCov_9fa48("86122", "86123"), typeof (stryMutAct_9fa48("86124") ? parsed.nodeId : (stryCov_9fa48("86124"), parsed?.nodeId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("86127") ? parsed.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("86126") ? parsed.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("86125") ? true : (stryCov_9fa48("86125", "86126", "86127"), parsed.nodeId.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("86128")) {
                  {}
                } else {
                  stryCov_9fa48("86128");
                  return parsed.nodeId;
                }
              }
            }
          } catch (_error) {
            // Ignore malformed or stale addresses and fall through to cache rows.
          }
        }
      }
      const cache = service.systemTableCache;
      if (stryMutAct_9fa48("86131") ? !cache && typeof cache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("86130") ? false : stryMutAct_9fa48("86129") ? true : (stryCov_9fa48("86129", "86130", "86131"), (stryMutAct_9fa48("86132") ? cache : (stryCov_9fa48("86132"), !cache)) || (stryMutAct_9fa48("86134") ? typeof cache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("86133") ? false : (stryCov_9fa48("86133", "86134"), typeof cache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("86135")) {
          {}
        } else {
          stryCov_9fa48("86135");
          return null;
        }
      }
      const serviceRow = cache.get(TABLES.SERVICES, stryMutAct_9fa48("86138") ? target?.serviceId && null : stryMutAct_9fa48("86137") ? false : stryMutAct_9fa48("86136") ? true : (stryCov_9fa48("86136", "86137", "86138"), (stryMutAct_9fa48("86139") ? target.serviceId : (stryCov_9fa48("86139"), target?.serviceId)) || null));
      const nodeId = stryMutAct_9fa48("86142") ? serviceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("86141") ? false : stryMutAct_9fa48("86140") ? true : (stryCov_9fa48("86140", "86141", "86142"), (stryMutAct_9fa48("86143") ? serviceRow[COLUMN.NODE_ID] : (stryCov_9fa48("86143"), serviceRow?.[COLUMN.NODE_ID])) || null);
      return (stryMutAct_9fa48("86146") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("86145") ? false : stryMutAct_9fa48("86144") ? true : (stryCov_9fa48("86144", "86145", "86146"), (stryMutAct_9fa48("86148") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("86147") ? true : (stryCov_9fa48("86147", "86148"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("86151") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("86150") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("86149") ? true : (stryCov_9fa48("86149", "86150", "86151"), nodeId.length > NUM.ZERO)))) ? nodeId : null;
    }
  }
  isStrictForwardNodeReady(nodeId) {
    if (stryMutAct_9fa48("86152")) {
      {}
    } else {
      stryCov_9fa48("86152");
      const service = this.service;
      if (stryMutAct_9fa48("86155") ? typeof nodeId !== TYPEOF.STRING && nodeId.length === NUM.ZERO : stryMutAct_9fa48("86154") ? false : stryMutAct_9fa48("86153") ? true : (stryCov_9fa48("86153", "86154", "86155"), (stryMutAct_9fa48("86157") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("86156") ? false : (stryCov_9fa48("86156", "86157"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("86159") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("86158") ? false : (stryCov_9fa48("86158", "86159"), nodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86160")) {
          {}
        } else {
          stryCov_9fa48("86160");
          return stryMutAct_9fa48("86161") ? true : (stryCov_9fa48("86161"), false);
        }
      }
      const cache = service.systemTableCache;
      if (stryMutAct_9fa48("86164") ? false : stryMutAct_9fa48("86163") ? true : stryMutAct_9fa48("86162") ? cache : (stryCov_9fa48("86162", "86163", "86164"), !cache)) {
        if (stryMutAct_9fa48("86165")) {
          {}
        } else {
          stryCov_9fa48("86165");
          return stryMutAct_9fa48("86166") ? false : (stryCov_9fa48("86166"), true);
        }
      }
      if (stryMutAct_9fa48("86169") ? typeof cache.getReadyNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("86168") ? false : stryMutAct_9fa48("86167") ? true : (stryCov_9fa48("86167", "86168", "86169"), typeof cache.getReadyNodes === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("86170")) {
          {}
        } else {
          stryCov_9fa48("86170");
          const readyNodes = cache.getReadyNodes();
          if (stryMutAct_9fa48("86172") ? false : stryMutAct_9fa48("86171") ? true : (stryCov_9fa48("86171", "86172"), Array.isArray(readyNodes))) {
            if (stryMutAct_9fa48("86173")) {
              {}
            } else {
              stryCov_9fa48("86173");
              return readyNodes.includes(nodeId);
            }
          }
        }
      }
      const allNodeRows = (stryMutAct_9fa48("86176") ? typeof cache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("86175") ? false : stryMutAct_9fa48("86174") ? true : (stryCov_9fa48("86174", "86175", "86176"), typeof cache.getAll === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("86179") ? cache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("86178") ? false : stryMutAct_9fa48("86177") ? true : (stryCov_9fa48("86177", "86178", "86179"), cache.getAll(TABLES.NODES) || (stryMutAct_9fa48("86180") ? ["Stryker was here"] : (stryCov_9fa48("86180"), []))) : (stryMutAct_9fa48("86183") ? typeof cache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("86182") ? false : stryMutAct_9fa48("86181") ? true : (stryCov_9fa48("86181", "86182", "86183"), typeof cache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("86186") ? cache.filter(TABLES.NODES, () => true) && [] : stryMutAct_9fa48("86185") ? false : stryMutAct_9fa48("86184") ? true : (stryCov_9fa48("86184", "86185", "86186"), (stryMutAct_9fa48("86187") ? cache : (stryCov_9fa48("86187"), cache.filter(TABLES.NODES, stryMutAct_9fa48("86188") ? () => undefined : (stryCov_9fa48("86188"), () => stryMutAct_9fa48("86189") ? false : (stryCov_9fa48("86189"), true))))) || (stryMutAct_9fa48("86190") ? ["Stryker was here"] : (stryCov_9fa48("86190"), []))) : stryMutAct_9fa48("86191") ? ["Stryker was here"] : (stryCov_9fa48("86191"), []);
      if (stryMutAct_9fa48("86194") ? !Array.isArray(allNodeRows) && allNodeRows.length === NUM.ZERO : stryMutAct_9fa48("86193") ? false : stryMutAct_9fa48("86192") ? true : (stryCov_9fa48("86192", "86193", "86194"), (stryMutAct_9fa48("86195") ? Array.isArray(allNodeRows) : (stryCov_9fa48("86195"), !Array.isArray(allNodeRows))) || (stryMutAct_9fa48("86197") ? allNodeRows.length !== NUM.ZERO : stryMutAct_9fa48("86196") ? false : (stryCov_9fa48("86196", "86197"), allNodeRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86198")) {
          {}
        } else {
          stryCov_9fa48("86198");
          return stryMutAct_9fa48("86199") ? false : (stryCov_9fa48("86199"), true);
        }
      }
      const nodeRow = (stryMutAct_9fa48("86202") ? typeof cache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("86201") ? false : stryMutAct_9fa48("86200") ? true : (stryCov_9fa48("86200", "86201", "86202"), typeof cache.get === TYPEOF.FUNCTION)) ? cache.get(TABLES.NODES, nodeId) : stryMutAct_9fa48("86205") ? allNodeRows.find(row => row?.[COLUMN.NODE_ID] === nodeId) && null : stryMutAct_9fa48("86204") ? false : stryMutAct_9fa48("86203") ? true : (stryCov_9fa48("86203", "86204", "86205"), allNodeRows.find(stryMutAct_9fa48("86206") ? () => undefined : (stryCov_9fa48("86206"), row => stryMutAct_9fa48("86209") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("86208") ? false : stryMutAct_9fa48("86207") ? true : (stryCov_9fa48("86207", "86208", "86209"), (stryMutAct_9fa48("86210") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("86210"), row?.[COLUMN.NODE_ID])) === nodeId))) || null);
      if (stryMutAct_9fa48("86213") ? false : stryMutAct_9fa48("86212") ? true : stryMutAct_9fa48("86211") ? nodeRow : (stryCov_9fa48("86211", "86212", "86213"), !nodeRow)) {
        if (stryMutAct_9fa48("86214")) {
          {}
        } else {
          stryCov_9fa48("86214");
          return stryMutAct_9fa48("86215") ? true : (stryCov_9fa48("86215"), false);
        }
      }
      const readyLeaseExpiresAt = Number(stryMutAct_9fa48("86216") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("86216"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]));
      return stryMutAct_9fa48("86219") ? nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY && Number.isFinite(readyLeaseExpiresAt) || readyLeaseExpiresAt > Date.now() : stryMutAct_9fa48("86218") ? false : stryMutAct_9fa48("86217") ? true : (stryCov_9fa48("86217", "86218", "86219"), (stryMutAct_9fa48("86221") ? nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY || Number.isFinite(readyLeaseExpiresAt) : stryMutAct_9fa48("86220") ? true : (stryCov_9fa48("86220", "86221"), (stryMutAct_9fa48("86223") ? nodeRow?.[COLUMN.CONNECTION_STATE] !== STATE.READY : stryMutAct_9fa48("86222") ? true : (stryCov_9fa48("86222", "86223"), (stryMutAct_9fa48("86224") ? nodeRow[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("86224"), nodeRow?.[COLUMN.CONNECTION_STATE])) === STATE.READY)) && Number.isFinite(readyLeaseExpiresAt))) && (stryMutAct_9fa48("86227") ? readyLeaseExpiresAt <= Date.now() : stryMutAct_9fa48("86226") ? readyLeaseExpiresAt >= Date.now() : stryMutAct_9fa48("86225") ? true : (stryCov_9fa48("86225", "86226", "86227"), readyLeaseExpiresAt > Date.now())));
    }
  }
  isStrictForwardNodeConnected(nodeId) {
    if (stryMutAct_9fa48("86228")) {
      {}
    } else {
      stryCov_9fa48("86228");
      const service = this.service;
      if (stryMutAct_9fa48("86231") ? typeof nodeId !== TYPEOF.STRING && nodeId.length === NUM.ZERO : stryMutAct_9fa48("86230") ? false : stryMutAct_9fa48("86229") ? true : (stryCov_9fa48("86229", "86230", "86231"), (stryMutAct_9fa48("86233") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("86232") ? false : (stryCov_9fa48("86232", "86233"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("86235") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("86234") ? false : (stryCov_9fa48("86234", "86235"), nodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86236")) {
          {}
        } else {
          stryCov_9fa48("86236");
          return stryMutAct_9fa48("86237") ? true : (stryCov_9fa48("86237"), false);
        }
      }
      if (stryMutAct_9fa48("86240") ? nodeId !== service.nodeId : stryMutAct_9fa48("86239") ? false : stryMutAct_9fa48("86238") ? true : (stryCov_9fa48("86238", "86239", "86240"), nodeId === service.nodeId)) {
        if (stryMutAct_9fa48("86241")) {
          {}
        } else {
          stryCov_9fa48("86241");
          return stryMutAct_9fa48("86242") ? false : (stryCov_9fa48("86242"), true);
        }
      }
      if (stryMutAct_9fa48("86245") ? typeof service.transport?.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("86244") ? false : stryMutAct_9fa48("86243") ? true : (stryCov_9fa48("86243", "86244", "86245"), typeof (stryMutAct_9fa48("86246") ? service.transport.getConnectionState : (stryCov_9fa48("86246"), service.transport?.getConnectionState)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("86247")) {
          {}
        } else {
          stryCov_9fa48("86247");
          return stryMutAct_9fa48("86248") ? false : (stryCov_9fa48("86248"), true);
        }
      }
      return stryMutAct_9fa48("86251") ? service.transport.getConnectionState(nodeId) !== STATE.CONNECTED : stryMutAct_9fa48("86250") ? false : stryMutAct_9fa48("86249") ? true : (stryCov_9fa48("86249", "86250", "86251"), service.transport.getConnectionState(nodeId) === STATE.CONNECTED);
    }
  }
  getForwardTargetSuppressionKeys(target = {}) {
    if (stryMutAct_9fa48("86252")) {
      {}
    } else {
      stryCov_9fa48("86252");
      const keys = stryMutAct_9fa48("86253") ? ["Stryker was here"] : (stryCov_9fa48("86253"), []);
      if (stryMutAct_9fa48("86256") ? typeof target.serviceId === TYPEOF.STRING || target.serviceId.length > NUM.ZERO : stryMutAct_9fa48("86255") ? false : stryMutAct_9fa48("86254") ? true : (stryCov_9fa48("86254", "86255", "86256"), (stryMutAct_9fa48("86258") ? typeof target.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("86257") ? true : (stryCov_9fa48("86257", "86258"), typeof target.serviceId === TYPEOF.STRING)) && (stryMutAct_9fa48("86261") ? target.serviceId.length <= NUM.ZERO : stryMutAct_9fa48("86260") ? target.serviceId.length >= NUM.ZERO : stryMutAct_9fa48("86259") ? true : (stryCov_9fa48("86259", "86260", "86261"), target.serviceId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("86262")) {
          {}
        } else {
          stryCov_9fa48("86262");
          keys.push(stryMutAct_9fa48("86263") ? `` : (stryCov_9fa48("86263"), `service:${target.serviceId}`));
        }
      }
      if (stryMutAct_9fa48("86266") ? typeof target.address === TYPEOF.STRING || target.address.length > NUM.ZERO : stryMutAct_9fa48("86265") ? false : stryMutAct_9fa48("86264") ? true : (stryCov_9fa48("86264", "86265", "86266"), (stryMutAct_9fa48("86268") ? typeof target.address !== TYPEOF.STRING : stryMutAct_9fa48("86267") ? true : (stryCov_9fa48("86267", "86268"), typeof target.address === TYPEOF.STRING)) && (stryMutAct_9fa48("86271") ? target.address.length <= NUM.ZERO : stryMutAct_9fa48("86270") ? target.address.length >= NUM.ZERO : stryMutAct_9fa48("86269") ? true : (stryCov_9fa48("86269", "86270", "86271"), target.address.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("86272")) {
          {}
        } else {
          stryCov_9fa48("86272");
          keys.push(stryMutAct_9fa48("86273") ? `` : (stryCov_9fa48("86273"), `address:${target.address}`));
        }
      }
      return keys;
    }
  }
  pruneForwardTargetSuppressions(nowMs = this.service.now()) {
    if (stryMutAct_9fa48("86274")) {
      {}
    } else {
      stryCov_9fa48("86274");
      for (const [key, expiresAt] of this.forwardTargetSuppression.entries()) {
        if (stryMutAct_9fa48("86275")) {
          {}
        } else {
          stryCov_9fa48("86275");
          if (stryMutAct_9fa48("86278") ? !Number.isFinite(expiresAt) && expiresAt <= nowMs : stryMutAct_9fa48("86277") ? false : stryMutAct_9fa48("86276") ? true : (stryCov_9fa48("86276", "86277", "86278"), (stryMutAct_9fa48("86279") ? Number.isFinite(expiresAt) : (stryCov_9fa48("86279"), !Number.isFinite(expiresAt))) || (stryMutAct_9fa48("86282") ? expiresAt > nowMs : stryMutAct_9fa48("86281") ? expiresAt < nowMs : stryMutAct_9fa48("86280") ? false : (stryCov_9fa48("86280", "86281", "86282"), expiresAt <= nowMs)))) {
            if (stryMutAct_9fa48("86283")) {
              {}
            } else {
              stryCov_9fa48("86283");
              this.forwardTargetSuppression.delete(key);
            }
          }
        }
      }
    }
  }
  isForwardTargetSuppressed(target = {}) {
    if (stryMutAct_9fa48("86284")) {
      {}
    } else {
      stryCov_9fa48("86284");
      const nowMs = this.service.now();
      this.pruneForwardTargetSuppressions(nowMs);
      return stryMutAct_9fa48("86285") ? this.getForwardTargetSuppressionKeys(target).every(key => {
        const expiresAt = this.forwardTargetSuppression.get(key);
        return Number.isFinite(expiresAt) && expiresAt > nowMs;
      }) : (stryCov_9fa48("86285"), this.getForwardTargetSuppressionKeys(target).some(key => {
        if (stryMutAct_9fa48("86286")) {
          {}
        } else {
          stryCov_9fa48("86286");
          const expiresAt = this.forwardTargetSuppression.get(key);
          return stryMutAct_9fa48("86289") ? Number.isFinite(expiresAt) || expiresAt > nowMs : stryMutAct_9fa48("86288") ? false : stryMutAct_9fa48("86287") ? true : (stryCov_9fa48("86287", "86288", "86289"), Number.isFinite(expiresAt) && (stryMutAct_9fa48("86292") ? expiresAt <= nowMs : stryMutAct_9fa48("86291") ? expiresAt >= nowMs : stryMutAct_9fa48("86290") ? true : (stryCov_9fa48("86290", "86291", "86292"), expiresAt > nowMs)));
        }
      }));
    }
  }
  suppressForwardTarget(target = {}) {
    if (stryMutAct_9fa48("86293")) {
      {}
    } else {
      stryCov_9fa48("86293");
      const service = this.service;
      const suppressionMs = (stryMutAct_9fa48("86296") ? Number.isFinite(service.forwardTargetSuppressionMs) || service.forwardTargetSuppressionMs > NUM.ZERO : stryMutAct_9fa48("86295") ? false : stryMutAct_9fa48("86294") ? true : (stryCov_9fa48("86294", "86295", "86296"), Number.isFinite(service.forwardTargetSuppressionMs) && (stryMutAct_9fa48("86299") ? service.forwardTargetSuppressionMs <= NUM.ZERO : stryMutAct_9fa48("86298") ? service.forwardTargetSuppressionMs >= NUM.ZERO : stryMutAct_9fa48("86297") ? true : (stryCov_9fa48("86297", "86298", "86299"), service.forwardTargetSuppressionMs > NUM.ZERO)))) ? Math.floor(service.forwardTargetSuppressionMs) : NUM.ZERO;
      if (stryMutAct_9fa48("86303") ? suppressionMs > NUM.ZERO : stryMutAct_9fa48("86302") ? suppressionMs < NUM.ZERO : stryMutAct_9fa48("86301") ? false : stryMutAct_9fa48("86300") ? true : (stryCov_9fa48("86300", "86301", "86302", "86303"), suppressionMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("86304")) {
          {}
        } else {
          stryCov_9fa48("86304");
          return;
        }
      }
      const expiresAt = stryMutAct_9fa48("86305") ? service.now() - suppressionMs : (stryCov_9fa48("86305"), service.now() + suppressionMs);
      for (const key of this.getForwardTargetSuppressionKeys(target)) {
        if (stryMutAct_9fa48("86306")) {
          {}
        } else {
          stryCov_9fa48("86306");
          this.forwardTargetSuppression.set(key, expiresAt);
        }
      }
    }
  }
  clearForwardTargetSuppression(target = {}) {
    if (stryMutAct_9fa48("86307")) {
      {}
    } else {
      stryCov_9fa48("86307");
      for (const key of this.getForwardTargetSuppressionKeys(target)) {
        if (stryMutAct_9fa48("86308")) {
          {}
        } else {
          stryCov_9fa48("86308");
          this.forwardTargetSuppression.delete(key);
        }
      }
    }
  }
  shouldRepairForwardTopology(errorMessage) {
    if (stryMutAct_9fa48("86309")) {
      {}
    } else {
      stryCov_9fa48("86309");
      return stryMutAct_9fa48("86312") ? typeof errorMessage === TYPEOF.STRING || errorMessage.includes(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN) : stryMutAct_9fa48("86311") ? false : stryMutAct_9fa48("86310") ? true : (stryCov_9fa48("86310", "86311", "86312"), (stryMutAct_9fa48("86314") ? typeof errorMessage !== TYPEOF.STRING : stryMutAct_9fa48("86313") ? true : (stryCov_9fa48("86313", "86314"), typeof errorMessage === TYPEOF.STRING)) && errorMessage.includes(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN));
    }
  }
  canRepairAuthoritativeForwardTopology() {
    if (stryMutAct_9fa48("86315")) {
      {}
    } else {
      stryCov_9fa48("86315");
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      return Boolean(stryMutAct_9fa48("86318") ? service.systemTableCache && typeof service.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION && gateway || typeof gateway.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("86317") ? false : stryMutAct_9fa48("86316") ? true : (stryCov_9fa48("86316", "86317", "86318"), (stryMutAct_9fa48("86320") ? service.systemTableCache && typeof service.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION || gateway : stryMutAct_9fa48("86319") ? true : (stryCov_9fa48("86319", "86320"), (stryMutAct_9fa48("86322") ? service.systemTableCache || typeof service.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("86321") ? true : (stryCov_9fa48("86321", "86322"), service.systemTableCache && (stryMutAct_9fa48("86324") ? typeof service.systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("86323") ? true : (stryCov_9fa48("86323", "86324"), typeof service.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION)))) && gateway)) && (stryMutAct_9fa48("86326") ? typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("86325") ? true : (stryCov_9fa48("86325", "86326"), typeof gateway.executeRead === TYPEOF.FUNCTION))));
    }
  }
  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    if (stryMutAct_9fa48("86327")) {
      {}
    } else {
      stryCov_9fa48("86327");
      const service = this.service;
      if (stryMutAct_9fa48("86330") ? false : stryMutAct_9fa48("86329") ? true : stryMutAct_9fa48("86328") ? service.canRepairAuthoritativeForwardTopology() : (stryCov_9fa48("86328", "86329", "86330"), !service.canRepairAuthoritativeForwardTopology())) {
        if (stryMutAct_9fa48("86331")) {
          {}
        } else {
          stryCov_9fa48("86331");
          return stryMutAct_9fa48("86332") ? true : (stryCov_9fa48("86332"), false);
        }
      }
      if (stryMutAct_9fa48("86334") ? false : stryMutAct_9fa48("86333") ? true : (stryCov_9fa48("86333", "86334"), this.forwardTopologyRepairInFlight)) {
        if (stryMutAct_9fa48("86335")) {
          {}
        } else {
          stryCov_9fa48("86335");
          return this.forwardTopologyRepairInFlight;
        }
      }
      const nowMs = service.now();
      if (stryMutAct_9fa48("86339") ? nowMs - this.lastForwardTopologyRepairAtMs >= this.lastForwardTopologyRepairCooldownMs : stryMutAct_9fa48("86338") ? nowMs - this.lastForwardTopologyRepairAtMs <= this.lastForwardTopologyRepairCooldownMs : stryMutAct_9fa48("86337") ? false : stryMutAct_9fa48("86336") ? true : (stryCov_9fa48("86336", "86337", "86338", "86339"), (stryMutAct_9fa48("86340") ? nowMs + this.lastForwardTopologyRepairAtMs : (stryCov_9fa48("86340"), nowMs - this.lastForwardTopologyRepairAtMs)) < this.lastForwardTopologyRepairCooldownMs)) {
        if (stryMutAct_9fa48("86341")) {
          {}
        } else {
          stryCov_9fa48("86341");
          return stryMutAct_9fa48("86342") ? true : (stryCov_9fa48("86342"), false);
        }
      }
      this.forwardTopologyRepairInFlight = (async () => {
        if (stryMutAct_9fa48("86343")) {
          {}
        } else {
          stryCov_9fa48("86343");
          try {
            if (stryMutAct_9fa48("86344")) {
              {}
            } else {
              stryCov_9fa48("86344");
              const repairResult = await service.repairAuthoritativeForwardTopology(context);
              if (stryMutAct_9fa48("86347") ? repairResult.repaired !== true : stryMutAct_9fa48("86346") ? false : stryMutAct_9fa48("86345") ? true : (stryCov_9fa48("86345", "86346", "86347"), repairResult.repaired === (stryMutAct_9fa48("86348") ? false : (stryCov_9fa48("86348"), true)))) {
                if (stryMutAct_9fa48("86349")) {
                  {}
                } else {
                  stryCov_9fa48("86349");
                  this.lastForwardTopologyRepairCooldownMs = service.forwardTopologyRepairCooldownMs;
                }
              } else if (stryMutAct_9fa48("86352") ? repairResult.outcome !== FORWARD_TOPOLOGY_REPAIR_OUTCOME.UNCHANGED : stryMutAct_9fa48("86351") ? false : stryMutAct_9fa48("86350") ? true : (stryCov_9fa48("86350", "86351", "86352"), repairResult.outcome === FORWARD_TOPOLOGY_REPAIR_OUTCOME.UNCHANGED)) {
                if (stryMutAct_9fa48("86353")) {
                  {}
                } else {
                  stryCov_9fa48("86353");
                  this.lastForwardTopologyRepairCooldownMs = service.forwardTopologyRepairNoChangeCooldownMs;
                }
              } else {
                if (stryMutAct_9fa48("86354")) {
                  {}
                } else {
                  stryCov_9fa48("86354");
                  this.lastForwardTopologyRepairCooldownMs = service.forwardTopologyRepairFailureCooldownMs;
                }
              }
              return stryMutAct_9fa48("86357") ? repairResult.repaired !== true : stryMutAct_9fa48("86356") ? false : stryMutAct_9fa48("86355") ? true : (stryCov_9fa48("86355", "86356", "86357"), repairResult.repaired === (stryMutAct_9fa48("86358") ? false : (stryCov_9fa48("86358"), true)));
            }
          } catch (error) {
            if (stryMutAct_9fa48("86359")) {
              {}
            } else {
              stryCov_9fa48("86359");
              this.lastForwardTopologyRepairCooldownMs = service.forwardTopologyRepairFailureCooldownMs;
              service.logger.warn(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED, stryMutAct_9fa48("86360") ? {} : (stryCov_9fa48("86360"), {
                groupId: service.groupId,
                replicaId: service.replicaId,
                staleServiceId: stryMutAct_9fa48("86363") ? context?.serviceId && null : stryMutAct_9fa48("86362") ? false : stryMutAct_9fa48("86361") ? true : (stryCov_9fa48("86361", "86362", "86363"), (stryMutAct_9fa48("86364") ? context.serviceId : (stryCov_9fa48("86364"), context?.serviceId)) || null),
                staleAddress: stryMutAct_9fa48("86367") ? context?.address && null : stryMutAct_9fa48("86366") ? false : stryMutAct_9fa48("86365") ? true : (stryCov_9fa48("86365", "86366", "86367"), (stryMutAct_9fa48("86368") ? context.address : (stryCov_9fa48("86368"), context?.address)) || null),
                error: stryMutAct_9fa48("86371") ? error?.message && String(error) : stryMutAct_9fa48("86370") ? false : stryMutAct_9fa48("86369") ? true : (stryCov_9fa48("86369", "86370", "86371"), (stryMutAct_9fa48("86372") ? error.message : (stryCov_9fa48("86372"), error?.message)) || String(error))
              }));
              return stryMutAct_9fa48("86373") ? true : (stryCov_9fa48("86373"), false);
            }
          } finally {
            if (stryMutAct_9fa48("86374")) {
              {}
            } else {
              stryCov_9fa48("86374");
              this.lastForwardTopologyRepairAtMs = service.now();
              this.forwardTopologyRepairInFlight = null;
            }
          }
        }
      })();
      return this.forwardTopologyRepairInFlight;
    }
  }
  async repairAuthoritativeForwardTopology(context = {}) {
    if (stryMutAct_9fa48("86375")) {
      {}
    } else {
      stryCov_9fa48("86375");
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("86378") ? !gateway && typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("86377") ? false : stryMutAct_9fa48("86376") ? true : (stryCov_9fa48("86376", "86377", "86378"), (stryMutAct_9fa48("86379") ? gateway : (stryCov_9fa48("86379"), !gateway)) || (stryMutAct_9fa48("86381") ? typeof gateway.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("86380") ? false : (stryCov_9fa48("86380", "86381"), typeof gateway.executeRead !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("86382")) {
          {}
        } else {
          stryCov_9fa48("86382");
          return this.buildForwardTopologyRepairOutcome(stryMutAct_9fa48("86383") ? true : (stryCov_9fa48("86383"), false), FORWARD_TOPOLOGY_REPAIR_OUTCOME.FAILED);
        }
      }
      const sessionId = stryMutAct_9fa48("86384") ? `` : (stryCov_9fa48("86384"), `message-group-forward-topology:${service.groupId}:${service.now()}`);
      const readOptions = stryMutAct_9fa48("86385") ? {} : (stryCov_9fa48("86385"), {
        queryTimeoutMs: service.forwardTopologyRepairQueryTimeoutMs,
        sessionId,
        routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE
      });
      const [groupResult, serviceResult] = await Promise.all(stryMutAct_9fa48("86386") ? [] : (stryCov_9fa48("86386"), [gateway.executeRead(stryMutAct_9fa48("86387") ? {} : (stryCov_9fa48("86387"), {
        tableName: TABLES.MESSAGE_GROUPS,
        sql: stryMutAct_9fa48("86388") ? `` : (stryCov_9fa48("86388"), `SELECT * FROM ${TABLES.MESSAGE_GROUPS} WHERE ${COLUMN.GROUP_ID} = ?`),
        params: stryMutAct_9fa48("86389") ? [] : (stryCov_9fa48("86389"), [service.groupId]),
        strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
        owner: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.MESSAGE_DASH_GROUP_DASH_SERVICE
      }), readOptions), gateway.executeRead(stryMutAct_9fa48("86390") ? {} : (stryCov_9fa48("86390"), {
        tableName: TABLES.SERVICES,
        sql: (stryMutAct_9fa48("86391") ? `` : (stryCov_9fa48("86391"), `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.GROUP_ID} = ? `)) + (stryMutAct_9fa48("86392") ? `` : (stryCov_9fa48("86392"), `AND ${COLUMN.SERVICE_TYPE} = ?`)),
        params: stryMutAct_9fa48("86393") ? [] : (stryCov_9fa48("86393"), [service.groupId, SERVICE_TYPE.MESSAGE_GROUP]),
        strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
        owner: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.MESSAGE_DASH_GROUP_DASH_SERVICE
      }), readOptions)]));
      const groupRows = (stryMutAct_9fa48("86396") ? groupResult?.success === true || Array.isArray(groupResult.rows) : stryMutAct_9fa48("86395") ? false : stryMutAct_9fa48("86394") ? true : (stryCov_9fa48("86394", "86395", "86396"), (stryMutAct_9fa48("86398") ? groupResult?.success !== true : stryMutAct_9fa48("86397") ? true : (stryCov_9fa48("86397", "86398"), (stryMutAct_9fa48("86399") ? groupResult.success : (stryCov_9fa48("86399"), groupResult?.success)) === (stryMutAct_9fa48("86400") ? false : (stryCov_9fa48("86400"), true)))) && Array.isArray(groupResult.rows))) ? groupResult.rows : stryMutAct_9fa48("86401") ? ["Stryker was here"] : (stryCov_9fa48("86401"), []);
      const serviceRows = (stryMutAct_9fa48("86404") ? serviceResult?.success === true || Array.isArray(serviceResult.rows) : stryMutAct_9fa48("86403") ? false : stryMutAct_9fa48("86402") ? true : (stryCov_9fa48("86402", "86403", "86404"), (stryMutAct_9fa48("86406") ? serviceResult?.success !== true : stryMutAct_9fa48("86405") ? true : (stryCov_9fa48("86405", "86406"), (stryMutAct_9fa48("86407") ? serviceResult.success : (stryCov_9fa48("86407"), serviceResult?.success)) === (stryMutAct_9fa48("86408") ? false : (stryCov_9fa48("86408"), true)))) && Array.isArray(serviceResult.rows))) ? serviceResult.rows : stryMutAct_9fa48("86409") ? ["Stryker was here"] : (stryCov_9fa48("86409"), []);
      const nodeIds = stryMutAct_9fa48("86410") ? [] : (stryCov_9fa48("86410"), [...new Set(stryMutAct_9fa48("86411") ? serviceRows.map(row => row?.[COLUMN.NODE_ID] || row?.node_id || null) : (stryCov_9fa48("86411"), serviceRows.map(stryMutAct_9fa48("86412") ? () => undefined : (stryCov_9fa48("86412"), row => stryMutAct_9fa48("86415") ? (row?.[COLUMN.NODE_ID] || row?.node_id) && null : stryMutAct_9fa48("86414") ? false : stryMutAct_9fa48("86413") ? true : (stryCov_9fa48("86413", "86414", "86415"), (stryMutAct_9fa48("86417") ? row?.[COLUMN.NODE_ID] && row?.node_id : stryMutAct_9fa48("86416") ? false : (stryCov_9fa48("86416", "86417"), (stryMutAct_9fa48("86418") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("86418"), row?.[COLUMN.NODE_ID])) || (stryMutAct_9fa48("86419") ? row.node_id : (stryCov_9fa48("86419"), row?.node_id)))) || null))).filter(nodeId => {
        if (stryMutAct_9fa48("86420")) {
          {}
        } else {
          stryCov_9fa48("86420");
          return stryMutAct_9fa48("86423") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("86422") ? false : stryMutAct_9fa48("86421") ? true : (stryCov_9fa48("86421", "86422", "86423"), (stryMutAct_9fa48("86425") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("86424") ? true : (stryCov_9fa48("86424", "86425"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("86428") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("86427") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("86426") ? true : (stryCov_9fa48("86426", "86427", "86428"), nodeId.length > NUM.ZERO)));
        }
      })))]);
      let nodeRows = stryMutAct_9fa48("86429") ? ["Stryker was here"] : (stryCov_9fa48("86429"), []);
      if (stryMutAct_9fa48("86433") ? nodeIds.length <= NUM.ZERO : stryMutAct_9fa48("86432") ? nodeIds.length >= NUM.ZERO : stryMutAct_9fa48("86431") ? false : stryMutAct_9fa48("86430") ? true : (stryCov_9fa48("86430", "86431", "86432", "86433"), nodeIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("86434")) {
          {}
        } else {
          stryCov_9fa48("86434");
          const placeholders = nodeIds.map(stryMutAct_9fa48("86435") ? () => undefined : (stryCov_9fa48("86435"), () => stryMutAct_9fa48("86436") ? "" : (stryCov_9fa48("86436"), '?'))).join(stryMutAct_9fa48("86437") ? "" : (stryCov_9fa48("86437"), ', '));
          const nodeResult = await gateway.executeRead(stryMutAct_9fa48("86438") ? {} : (stryCov_9fa48("86438"), {
            tableName: TABLES.NODES,
            sql: stryMutAct_9fa48("86439") ? `` : (stryCov_9fa48("86439"), `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} IN (${placeholders})`),
            params: nodeIds,
            strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
            owner: stryMutAct_9fa48("86440") ? "" : (stryCov_9fa48("86440"), 'message-group-service')
          }), readOptions);
          if (stryMutAct_9fa48("86443") ? nodeResult?.success === true || Array.isArray(nodeResult.rows) : stryMutAct_9fa48("86442") ? false : stryMutAct_9fa48("86441") ? true : (stryCov_9fa48("86441", "86442", "86443"), (stryMutAct_9fa48("86445") ? nodeResult?.success !== true : stryMutAct_9fa48("86444") ? true : (stryCov_9fa48("86444", "86445"), (stryMutAct_9fa48("86446") ? nodeResult.success : (stryCov_9fa48("86446"), nodeResult?.success)) === (stryMutAct_9fa48("86447") ? false : (stryCov_9fa48("86447"), true)))) && Array.isArray(nodeResult.rows))) {
            if (stryMutAct_9fa48("86448")) {
              {}
            } else {
              stryCov_9fa48("86448");
              nodeRows = nodeResult.rows;
            }
          }
        }
      }
      let repairedRowCount = NUM.ZERO;
      stryMutAct_9fa48("86449") ? repairedRowCount -= await service.applyAuthoritativeForwardTopologyRows(TABLES.MESSAGE_GROUPS, groupRows) : (stryCov_9fa48("86449"), repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(TABLES.MESSAGE_GROUPS, groupRows));
      stryMutAct_9fa48("86450") ? repairedRowCount -= await service.reconcileAuthoritativeForwardServiceRows(serviceRows) : (stryCov_9fa48("86450"), repairedRowCount += await service.reconcileAuthoritativeForwardServiceRows(serviceRows));
      stryMutAct_9fa48("86451") ? repairedRowCount -= await service.applyAuthoritativeForwardTopologyRows(TABLES.NODES, nodeRows) : (stryCov_9fa48("86451"), repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(TABLES.NODES, nodeRows));
      if (stryMutAct_9fa48("86455") ? repairedRowCount <= NUM.ZERO : stryMutAct_9fa48("86454") ? repairedRowCount >= NUM.ZERO : stryMutAct_9fa48("86453") ? false : stryMutAct_9fa48("86452") ? true : (stryCov_9fa48("86452", "86453", "86454", "86455"), repairedRowCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("86456")) {
          {}
        } else {
          stryCov_9fa48("86456");
          service.logger.warn(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS, stryMutAct_9fa48("86457") ? {} : (stryCov_9fa48("86457"), {
            groupId: service.groupId,
            replicaId: service.replicaId,
            staleServiceId: stryMutAct_9fa48("86460") ? context?.serviceId && null : stryMutAct_9fa48("86459") ? false : stryMutAct_9fa48("86458") ? true : (stryCov_9fa48("86458", "86459", "86460"), (stryMutAct_9fa48("86461") ? context.serviceId : (stryCov_9fa48("86461"), context?.serviceId)) || null),
            staleAddress: stryMutAct_9fa48("86464") ? context?.address && null : stryMutAct_9fa48("86463") ? false : stryMutAct_9fa48("86462") ? true : (stryCov_9fa48("86462", "86463", "86464"), (stryMutAct_9fa48("86465") ? context.address : (stryCov_9fa48("86465"), context?.address)) || null),
            repairedRowCount,
            repairedGroupRowCount: groupRows.length,
            repairedServiceRowCount: serviceRows.length,
            repairedNodeRowCount: nodeRows.length
          }));
          return this.buildForwardTopologyRepairOutcome(stryMutAct_9fa48("86466") ? false : (stryCov_9fa48("86466"), true), FORWARD_TOPOLOGY_REPAIR_OUTCOME.REPAIRED);
        }
      }
      return this.buildForwardTopologyRepairOutcome(stryMutAct_9fa48("86467") ? true : (stryCov_9fa48("86467"), false), FORWARD_TOPOLOGY_REPAIR_OUTCOME.UNCHANGED);
    }
  }
  async applyAuthoritativeForwardTopologyRows(tableName, rows = stryMutAct_9fa48("86468") ? ["Stryker was here"] : (stryCov_9fa48("86468"), [])) {
    if (stryMutAct_9fa48("86469")) {
      {}
    } else {
      stryCov_9fa48("86469");
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      const cache = service.systemTableCache;
      if (stryMutAct_9fa48("86472") ? !cache && !gateway : stryMutAct_9fa48("86471") ? false : stryMutAct_9fa48("86470") ? true : (stryCov_9fa48("86470", "86471", "86472"), (stryMutAct_9fa48("86473") ? cache : (stryCov_9fa48("86473"), !cache)) || (stryMutAct_9fa48("86474") ? gateway : (stryCov_9fa48("86474"), !gateway)))) {
        if (stryMutAct_9fa48("86475")) {
          {}
        } else {
          stryCov_9fa48("86475");
          return NUM.ZERO;
        }
      }
      const result = await gateway.reconcileAuthoritativeCacheRows(tableName, rows, stryMutAct_9fa48("86476") ? {} : (stryCov_9fa48("86476"), {
        primaryKeyField: getSystemCachePrimaryKeyFieldOrFallback(tableName),
        deleteMissing: stryMutAct_9fa48("86477") ? true : (stryCov_9fa48("86477"), false),
        areRowsEqual: stryMutAct_9fa48("86478") ? () => undefined : (stryCov_9fa48("86478"), (left, right) => service.areForwardTopologyRowsEqual(left, right)),
        systemTableCache: cache
      }));
      return stryMutAct_9fa48("86481") ? result?.mutationCount && NUM.ZERO : stryMutAct_9fa48("86480") ? false : stryMutAct_9fa48("86479") ? true : (stryCov_9fa48("86479", "86480", "86481"), (stryMutAct_9fa48("86482") ? result.mutationCount : (stryCov_9fa48("86482"), result?.mutationCount)) || NUM.ZERO);
    }
  }
  async reconcileAuthoritativeForwardServiceRows(authoritativeRows = stryMutAct_9fa48("86483") ? ["Stryker was here"] : (stryCov_9fa48("86483"), [])) {
    if (stryMutAct_9fa48("86484")) {
      {}
    } else {
      stryCov_9fa48("86484");
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      const cache = service.systemTableCache;
      if (stryMutAct_9fa48("86487") ? !cache && !gateway : stryMutAct_9fa48("86486") ? false : stryMutAct_9fa48("86485") ? true : (stryCov_9fa48("86485", "86486", "86487"), (stryMutAct_9fa48("86488") ? cache : (stryCov_9fa48("86488"), !cache)) || (stryMutAct_9fa48("86489") ? gateway : (stryCov_9fa48("86489"), !gateway)))) {
        if (stryMutAct_9fa48("86490")) {
          {}
        } else {
          stryCov_9fa48("86490");
          return NUM.ZERO;
        }
      }
      const cachedRows = (stryMutAct_9fa48("86493") ? typeof cache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("86492") ? false : stryMutAct_9fa48("86491") ? true : (stryCov_9fa48("86491", "86492", "86493"), typeof cache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("86494") ? cache : (stryCov_9fa48("86494"), cache.filter(TABLES.SERVICES, row => {
        if (stryMutAct_9fa48("86495")) {
          {}
        } else {
          stryCov_9fa48("86495");
          return stryMutAct_9fa48("86498") ? row?.[COLUMN.GROUP_ID] === service.groupId || row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("86497") ? false : stryMutAct_9fa48("86496") ? true : (stryCov_9fa48("86496", "86497", "86498"), (stryMutAct_9fa48("86500") ? row?.[COLUMN.GROUP_ID] !== service.groupId : stryMutAct_9fa48("86499") ? true : (stryCov_9fa48("86499", "86500"), (stryMutAct_9fa48("86501") ? row[COLUMN.GROUP_ID] : (stryCov_9fa48("86501"), row?.[COLUMN.GROUP_ID])) === service.groupId)) && (stryMutAct_9fa48("86503") ? row?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("86502") ? true : (stryCov_9fa48("86502", "86503"), (stryMutAct_9fa48("86504") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("86504"), row?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)));
        }
      })) : stryMutAct_9fa48("86505") ? ["Stryker was here"] : (stryCov_9fa48("86505"), []);
      const result = await gateway.reconcileAuthoritativeCacheRows(TABLES.SERVICES, authoritativeRows, stryMutAct_9fa48("86506") ? {} : (stryCov_9fa48("86506"), {
        cachedRows,
        areRowsEqual: stryMutAct_9fa48("86507") ? () => undefined : (stryCov_9fa48("86507"), (left, right) => service.areForwardTopologyRowsEqual(left, right)),
        systemTableCache: cache
      }));
      return stryMutAct_9fa48("86510") ? result?.mutationCount && NUM.ZERO : stryMutAct_9fa48("86509") ? false : stryMutAct_9fa48("86508") ? true : (stryCov_9fa48("86508", "86509", "86510"), (stryMutAct_9fa48("86511") ? result.mutationCount : (stryCov_9fa48("86511"), result?.mutationCount)) || NUM.ZERO);
    }
  }
  areForwardTopologyRowsEqual(left, right) {
    if (stryMutAct_9fa48("86512")) {
      {}
    } else {
      stryCov_9fa48("86512");
      if (stryMutAct_9fa48("86515") ? (!left || !right || typeof left !== TYPEOF.OBJECT) && typeof right !== TYPEOF.OBJECT : stryMutAct_9fa48("86514") ? false : stryMutAct_9fa48("86513") ? true : (stryCov_9fa48("86513", "86514", "86515"), (stryMutAct_9fa48("86517") ? (!left || !right) && typeof left !== TYPEOF.OBJECT : stryMutAct_9fa48("86516") ? false : (stryCov_9fa48("86516", "86517"), (stryMutAct_9fa48("86519") ? !left && !right : stryMutAct_9fa48("86518") ? false : (stryCov_9fa48("86518", "86519"), (stryMutAct_9fa48("86520") ? left : (stryCov_9fa48("86520"), !left)) || (stryMutAct_9fa48("86521") ? right : (stryCov_9fa48("86521"), !right)))) || (stryMutAct_9fa48("86523") ? typeof left === TYPEOF.OBJECT : stryMutAct_9fa48("86522") ? false : (stryCov_9fa48("86522", "86523"), typeof left !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("86525") ? typeof right === TYPEOF.OBJECT : stryMutAct_9fa48("86524") ? false : (stryCov_9fa48("86524", "86525"), typeof right !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("86526")) {
          {}
        } else {
          stryCov_9fa48("86526");
          return stryMutAct_9fa48("86527") ? true : (stryCov_9fa48("86527"), false);
        }
      }
      const keys = new Set(stryMutAct_9fa48("86528") ? [] : (stryCov_9fa48("86528"), [...Object.keys(left), ...Object.keys(right)]));
      for (const key of keys) {
        if (stryMutAct_9fa48("86529")) {
          {}
        } else {
          stryCov_9fa48("86529");
          if (stryMutAct_9fa48("86532") ? left[key] === right[key] : stryMutAct_9fa48("86531") ? false : stryMutAct_9fa48("86530") ? true : (stryCov_9fa48("86530", "86531", "86532"), left[key] !== right[key])) {
            if (stryMutAct_9fa48("86533")) {
              {}
            } else {
              stryCov_9fa48("86533");
              return stryMutAct_9fa48("86534") ? true : (stryCov_9fa48("86534"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("86535") ? false : (stryCov_9fa48("86535"), true);
    }
  }
  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    if (stryMutAct_9fa48("86536")) {
      {}
    } else {
      stryCov_9fa48("86536");
      if (stryMutAct_9fa48("86539") ? typeof errorMessage !== TYPEOF.STRING && errorMessage.length === NUM.ZERO : stryMutAct_9fa48("86538") ? false : stryMutAct_9fa48("86537") ? true : (stryCov_9fa48("86537", "86538", "86539"), (stryMutAct_9fa48("86541") ? typeof errorMessage === TYPEOF.STRING : stryMutAct_9fa48("86540") ? false : (stryCov_9fa48("86540", "86541"), typeof errorMessage !== TYPEOF.STRING)) || (stryMutAct_9fa48("86543") ? errorMessage.length !== NUM.ZERO : stryMutAct_9fa48("86542") ? false : (stryCov_9fa48("86542", "86543"), errorMessage.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86544")) {
          {}
        } else {
          stryCov_9fa48("86544");
          return stryMutAct_9fa48("86545") ? true : (stryCov_9fa48("86545"), false);
        }
      }
      return stryMutAct_9fa48("86548") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED)) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS) : stryMutAct_9fa48("86547") ? false : stryMutAct_9fa48("86546") ? true : (stryCov_9fa48("86546", "86547", "86548"), (stryMutAct_9fa48("86550") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE)) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED) : stryMutAct_9fa48("86549") ? false : (stryCov_9fa48("86549", "86550"), (stryMutAct_9fa48("86552") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED)) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE) : stryMutAct_9fa48("86551") ? false : (stryCov_9fa48("86551", "86552"), (stryMutAct_9fa48("86554") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN)) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED) : stryMutAct_9fa48("86553") ? false : (stryCov_9fa48("86553", "86554"), (stryMutAct_9fa48("86556") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND)) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN) : stryMutAct_9fa48("86555") ? false : (stryCov_9fa48("86555", "86556"), (stryMutAct_9fa48("86558") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) || errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) : stryMutAct_9fa48("86557") ? false : (stryCov_9fa48("86557", "86558"), (stryMutAct_9fa48("86560") ? (this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage)) && errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT : stryMutAct_9fa48("86559") ? false : (stryCov_9fa48("86559", "86560"), (stryMutAct_9fa48("86562") ? this.service.shouldRepairForwardTopology(errorMessage) && this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) : stryMutAct_9fa48("86561") ? false : (stryCov_9fa48("86561", "86562"), this.service.shouldRepairForwardTopology(errorMessage) || this.service.isForwardTargetBackpressured(deliveryResult, errorMessage))) || (stryMutAct_9fa48("86564") ? errorMessage !== TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT : stryMutAct_9fa48("86563") ? false : (stryCov_9fa48("86563", "86564"), errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT)))) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND))) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN))) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED))) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE))) || (stryMutAct_9fa48("86566") ? errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED) : stryMutAct_9fa48("86565") ? false : (stryCov_9fa48("86565", "86566"), errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE) && errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED))))) || errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS));
    }
  }
  isForwardTargetBackpressured(deliveryResult, errorMessage) {
    if (stryMutAct_9fa48("86567")) {
      {}
    } else {
      stryCov_9fa48("86567");
      const normalizedErrorMessage = (stryMutAct_9fa48("86570") ? typeof errorMessage !== TYPEOF.STRING : stryMutAct_9fa48("86569") ? false : stryMutAct_9fa48("86568") ? true : (stryCov_9fa48("86568", "86569", "86570"), typeof errorMessage === TYPEOF.STRING)) ? errorMessage : stryMutAct_9fa48("86571") ? "Stryker was here!" : (stryCov_9fa48("86571"), '');
      if (stryMutAct_9fa48("86574") ? deliveryResult?.errorCode !== MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_BACKPRESSURED : stryMutAct_9fa48("86573") ? false : stryMutAct_9fa48("86572") ? true : (stryCov_9fa48("86572", "86573", "86574"), (stryMutAct_9fa48("86575") ? deliveryResult.errorCode : (stryCov_9fa48("86575"), deliveryResult?.errorCode)) === MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_BACKPRESSURED)) {
        if (stryMutAct_9fa48("86576")) {
          {}
        } else {
          stryCov_9fa48("86576");
          return stryMutAct_9fa48("86577") ? false : (stryCov_9fa48("86577"), true);
        }
      }
      return stryMutAct_9fa48("86580") ? normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_FOR_NODE) || normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.IS_SATURATED) : stryMutAct_9fa48("86579") ? false : stryMutAct_9fa48("86578") ? true : (stryCov_9fa48("86578", "86579", "86580"), normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_FOR_NODE) && normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.IS_SATURATED));
    }
  }
  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    if (stryMutAct_9fa48("86581")) {
      {}
    } else {
      stryCov_9fa48("86581");
      const service = this.service;
      const eventTimestamp = (stryMutAct_9fa48("86584") ? typeof options.timestamp === 'string' || options.timestamp.length > NUM.ZERO : stryMutAct_9fa48("86583") ? false : stryMutAct_9fa48("86582") ? true : (stryCov_9fa48("86582", "86583", "86584"), (stryMutAct_9fa48("86586") ? typeof options.timestamp !== 'string' : stryMutAct_9fa48("86585") ? true : (stryCov_9fa48("86585", "86586"), typeof options.timestamp === (stryMutAct_9fa48("86587") ? "" : (stryCov_9fa48("86587"), 'string')))) && (stryMutAct_9fa48("86590") ? options.timestamp.length <= NUM.ZERO : stryMutAct_9fa48("86589") ? options.timestamp.length >= NUM.ZERO : stryMutAct_9fa48("86588") ? true : (stryCov_9fa48("86588", "86589", "86590"), options.timestamp.length > NUM.ZERO)))) ? options.timestamp : service.hlcClock.now().toString();
      const replayOnly = stryMutAct_9fa48("86593") ? options.replayOnly !== true : stryMutAct_9fa48("86592") ? false : stryMutAct_9fa48("86591") ? true : (stryCov_9fa48("86591", "86592", "86593"), options.replayOnly === (stryMutAct_9fa48("86594") ? false : (stryCov_9fa48("86594"), true)));
      const relayDepth = (stryMutAct_9fa48("86597") ? Number.isInteger(options.relayDepth) || options.relayDepth >= NUM.ZERO : stryMutAct_9fa48("86596") ? false : stryMutAct_9fa48("86595") ? true : (stryCov_9fa48("86595", "86596", "86597"), Number.isInteger(options.relayDepth) && (stryMutAct_9fa48("86600") ? options.relayDepth < NUM.ZERO : stryMutAct_9fa48("86599") ? options.relayDepth > NUM.ZERO : stryMutAct_9fa48("86598") ? true : (stryCov_9fa48("86598", "86599", "86600"), options.relayDepth >= NUM.ZERO)))) ? options.relayDepth : NUM.ZERO;
      const causeId = normalizeCauseId(options.causeId);
      const payload = stryMutAct_9fa48("86601") ? {} : (stryCov_9fa48("86601"), {
        type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
        sourceNodeId: service.nodeId,
        relayDepth,
        causeId,
        replayOnly
      });
      return service.forwardCDCPayloadToLeader(payload, stryMutAct_9fa48("86602") ? {} : (stryCov_9fa48("86602"), {
        tableName,
        operation,
        relayDepth,
        causeId,
        replayOnly
      }));
    }
  }
  async forwardCDCBatchToLeader(events, options = {}) {
    if (stryMutAct_9fa48("86603")) {
      {}
    } else {
      stryCov_9fa48("86603");
      const service = this.service;
      const replayOnly = stryMutAct_9fa48("86606") ? options.replayOnly !== true : stryMutAct_9fa48("86605") ? false : stryMutAct_9fa48("86604") ? true : (stryCov_9fa48("86604", "86605", "86606"), options.replayOnly === (stryMutAct_9fa48("86607") ? false : (stryCov_9fa48("86607"), true)));
      const relayDepth = (stryMutAct_9fa48("86610") ? Number.isInteger(options.relayDepth) || options.relayDepth >= NUM.ZERO : stryMutAct_9fa48("86609") ? false : stryMutAct_9fa48("86608") ? true : (stryCov_9fa48("86608", "86609", "86610"), Number.isInteger(options.relayDepth) && (stryMutAct_9fa48("86613") ? options.relayDepth < NUM.ZERO : stryMutAct_9fa48("86612") ? options.relayDepth > NUM.ZERO : stryMutAct_9fa48("86611") ? true : (stryCov_9fa48("86611", "86612", "86613"), options.relayDepth >= NUM.ZERO)))) ? options.relayDepth : NUM.ZERO;
      const normalizedEvents = stryMutAct_9fa48("86614") ? (Array.isArray(events) ? events : []).map(event => {
        const timestamp = typeof event.timestamp === 'string' && event.timestamp.length > NUM.ZERO ? event.timestamp : service.hlcClock.now().toString();
        return {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          timestamp,
          causeId: normalizeCauseId(event.causeId),
          replayOnly: event.replayOnly === true || replayOnly
        };
      }) : (stryCov_9fa48("86614"), (Array.isArray(events) ? events : stryMutAct_9fa48("86615") ? ["Stryker was here"] : (stryCov_9fa48("86615"), [])).filter(stryMutAct_9fa48("86616") ? () => undefined : (stryCov_9fa48("86616"), event => stryMutAct_9fa48("86619") ? event?.tableName && event?.operation || event?.data : stryMutAct_9fa48("86618") ? false : stryMutAct_9fa48("86617") ? true : (stryCov_9fa48("86617", "86618", "86619"), (stryMutAct_9fa48("86621") ? event?.tableName || event?.operation : stryMutAct_9fa48("86620") ? true : (stryCov_9fa48("86620", "86621"), (stryMutAct_9fa48("86622") ? event.tableName : (stryCov_9fa48("86622"), event?.tableName)) && (stryMutAct_9fa48("86623") ? event.operation : (stryCov_9fa48("86623"), event?.operation)))) && (stryMutAct_9fa48("86624") ? event.data : (stryCov_9fa48("86624"), event?.data))))).map(event => {
        if (stryMutAct_9fa48("86625")) {
          {}
        } else {
          stryCov_9fa48("86625");
          const timestamp = (stryMutAct_9fa48("86628") ? typeof event.timestamp === 'string' || event.timestamp.length > NUM.ZERO : stryMutAct_9fa48("86627") ? false : stryMutAct_9fa48("86626") ? true : (stryCov_9fa48("86626", "86627", "86628"), (stryMutAct_9fa48("86630") ? typeof event.timestamp !== 'string' : stryMutAct_9fa48("86629") ? true : (stryCov_9fa48("86629", "86630"), typeof event.timestamp === (stryMutAct_9fa48("86631") ? "" : (stryCov_9fa48("86631"), 'string')))) && (stryMutAct_9fa48("86634") ? event.timestamp.length <= NUM.ZERO : stryMutAct_9fa48("86633") ? event.timestamp.length >= NUM.ZERO : stryMutAct_9fa48("86632") ? true : (stryCov_9fa48("86632", "86633", "86634"), event.timestamp.length > NUM.ZERO)))) ? event.timestamp : service.hlcClock.now().toString();
          return stryMutAct_9fa48("86635") ? {} : (stryCov_9fa48("86635"), {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp,
            causeId: normalizeCauseId(event.causeId),
            replayOnly: stryMutAct_9fa48("86638") ? event.replayOnly === true && replayOnly : stryMutAct_9fa48("86637") ? false : stryMutAct_9fa48("86636") ? true : (stryCov_9fa48("86636", "86637", "86638"), (stryMutAct_9fa48("86640") ? event.replayOnly !== true : stryMutAct_9fa48("86639") ? false : (stryCov_9fa48("86639", "86640"), event.replayOnly === (stryMutAct_9fa48("86641") ? false : (stryCov_9fa48("86641"), true)))) || replayOnly)
          });
        }
      }));
      if (stryMutAct_9fa48("86644") ? normalizedEvents.length !== NUM.ZERO : stryMutAct_9fa48("86643") ? false : stryMutAct_9fa48("86642") ? true : (stryCov_9fa48("86642", "86643", "86644"), normalizedEvents.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("86645")) {
          {}
        } else {
          stryCov_9fa48("86645");
          throw new Error(MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD);
        }
      }
      const payload = stryMutAct_9fa48("86646") ? {} : (stryCov_9fa48("86646"), {
        type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
        events: normalizedEvents,
        sourceNodeId: service.nodeId,
        relayDepth,
        replayOnly: stryMutAct_9fa48("86649") ? replayOnly && normalizedEvents.every(event => event.replayOnly === true) : stryMutAct_9fa48("86648") ? false : stryMutAct_9fa48("86647") ? true : (stryCov_9fa48("86647", "86648", "86649"), replayOnly || (stryMutAct_9fa48("86650") ? normalizedEvents.some(event => event.replayOnly === true) : (stryCov_9fa48("86650"), normalizedEvents.every(stryMutAct_9fa48("86651") ? () => undefined : (stryCov_9fa48("86651"), event => stryMutAct_9fa48("86654") ? event.replayOnly !== true : stryMutAct_9fa48("86653") ? false : stryMutAct_9fa48("86652") ? true : (stryCov_9fa48("86652", "86653", "86654"), event.replayOnly === (stryMutAct_9fa48("86655") ? false : (stryCov_9fa48("86655"), true))))))))
      });
      return service.forwardCDCPayloadToLeader(payload, stryMutAct_9fa48("86656") ? {} : (stryCov_9fa48("86656"), {
        tableName: normalizedEvents[MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ZERO].tableName,
        operation: stryMutAct_9fa48("86657") ? `` : (stryCov_9fa48("86657"), `batch:${normalizedEvents.length}`),
        relayDepth,
        causeId: normalizeCauseId(normalizedEvents[MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ZERO].causeId),
        replayOnly: stryMutAct_9fa48("86660") ? replayOnly && normalizedEvents.every(event => event.replayOnly === true) : stryMutAct_9fa48("86659") ? false : stryMutAct_9fa48("86658") ? true : (stryCov_9fa48("86658", "86659", "86660"), replayOnly || (stryMutAct_9fa48("86661") ? normalizedEvents.some(event => event.replayOnly === true) : (stryCov_9fa48("86661"), normalizedEvents.every(stryMutAct_9fa48("86662") ? () => undefined : (stryCov_9fa48("86662"), event => stryMutAct_9fa48("86665") ? event.replayOnly !== true : stryMutAct_9fa48("86664") ? false : stryMutAct_9fa48("86663") ? true : (stryCov_9fa48("86663", "86664", "86665"), event.replayOnly === (stryMutAct_9fa48("86666") ? false : (stryCov_9fa48("86666"), true))))))))
      }));
    }
  }
  async forwardCDCPayloadToLeader(payload, logContext = {}) {
    if (stryMutAct_9fa48("86667")) {
      {}
    } else {
      stryCov_9fa48("86667");
      const service = this.service;
      const tableName = stryMutAct_9fa48("86670") ? logContext.tableName && null : stryMutAct_9fa48("86669") ? false : stryMutAct_9fa48("86668") ? true : (stryCov_9fa48("86668", "86669", "86670"), logContext.tableName || null);
      const operation = stryMutAct_9fa48("86673") ? logContext.operation && null : stryMutAct_9fa48("86672") ? false : stryMutAct_9fa48("86671") ? true : (stryCov_9fa48("86671", "86672", "86673"), logContext.operation || null);
      const replayOnly = stryMutAct_9fa48("86676") ? logContext.replayOnly === true && payload?.replayOnly === true : stryMutAct_9fa48("86675") ? false : stryMutAct_9fa48("86674") ? true : (stryCov_9fa48("86674", "86675", "86676"), (stryMutAct_9fa48("86678") ? logContext.replayOnly !== true : stryMutAct_9fa48("86677") ? false : (stryCov_9fa48("86677", "86678"), logContext.replayOnly === (stryMutAct_9fa48("86679") ? false : (stryCov_9fa48("86679"), true)))) || (stryMutAct_9fa48("86681") ? payload?.replayOnly !== true : stryMutAct_9fa48("86680") ? false : (stryCov_9fa48("86680", "86681"), (stryMutAct_9fa48("86682") ? payload.replayOnly : (stryCov_9fa48("86682"), payload?.replayOnly)) === (stryMutAct_9fa48("86683") ? false : (stryCov_9fa48("86683"), true)))));
      const deliveryPriority = resolveCDCForwardDeliveryPriority(tableName, payload, replayOnly);
      const relayDepth = Number.isInteger(logContext.relayDepth) ? logContext.relayDepth : NUM.ZERO;
      const causeId = normalizeCauseId(logContext.causeId);
      let selection = service.resolveCDCForwardSelection(logContext);
      if (stryMutAct_9fa48("86686") ? selection.strictForwarding === true || selection.targets.length === NUM.ZERO : stryMutAct_9fa48("86685") ? false : stryMutAct_9fa48("86684") ? true : (stryCov_9fa48("86684", "86685", "86686"), (stryMutAct_9fa48("86688") ? selection.strictForwarding !== true : stryMutAct_9fa48("86687") ? true : (stryCov_9fa48("86687", "86688"), selection.strictForwarding === (stryMutAct_9fa48("86689") ? false : (stryCov_9fa48("86689"), true)))) && (stryMutAct_9fa48("86691") ? selection.targets.length !== NUM.ZERO : stryMutAct_9fa48("86690") ? true : (stryCov_9fa48("86690", "86691"), selection.targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("86692")) {
          {}
        } else {
          stryCov_9fa48("86692");
          await service.maybeRepairAuthoritativeForwardTopology(stryMutAct_9fa48("86693") ? {} : (stryCov_9fa48("86693"), {
            errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            tableName,
            operation,
            causeId
          }));
          selection = service.resolveCDCForwardSelection(logContext);
        }
      }
      const {
        strictForwarding,
        strictForwardRetryAfterMs,
        targets: forwardTargets,
        suppressedCount
      } = selection;
      if (stryMutAct_9fa48("86696") ? forwardTargets.length !== NUM.ZERO : stryMutAct_9fa48("86695") ? false : stryMutAct_9fa48("86694") ? true : (stryCov_9fa48("86694", "86695", "86696"), forwardTargets.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("86697")) {
          {}
        } else {
          stryCov_9fa48("86697");
          const error = strictForwarding ? this.buildDeferredCdcForwardError(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN, strictForwardRetryAfterMs) : new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
          if (stryMutAct_9fa48("86701") ? suppressedCount <= NUM.ZERO : stryMutAct_9fa48("86700") ? suppressedCount >= NUM.ZERO : stryMutAct_9fa48("86699") ? false : stryMutAct_9fa48("86698") ? true : (stryCov_9fa48("86698", "86699", "86700", "86701"), suppressedCount > NUM.ZERO)) {
            if (stryMutAct_9fa48("86702")) {
              {}
            } else {
              stryCov_9fa48("86702");
              error.retryable = stryMutAct_9fa48("86703") ? true : (stryCov_9fa48("86703"), false);
            }
          }
          throw error;
        }
      }
      let lastAddressError = null;
      let lastDeliveryError = null;
      for (const target of forwardTargets) {
        if (stryMutAct_9fa48("86704")) {
          {}
        } else {
          stryCov_9fa48("86704");
          let leaderAddress = target.address;
          try {
            if (stryMutAct_9fa48("86705")) {
              {}
            } else {
              stryCov_9fa48("86705");
              if (stryMutAct_9fa48("86708") ? false : stryMutAct_9fa48("86707") ? true : stryMutAct_9fa48("86706") ? leaderAddress : (stryCov_9fa48("86706", "86707", "86708"), !leaderAddress)) {
                if (stryMutAct_9fa48("86709")) {
                  {}
                } else {
                  stryCov_9fa48("86709");
                  leaderAddress = service.buildPeerAddress(target.serviceId);
                }
              }
              if (stryMutAct_9fa48("86712") ? false : stryMutAct_9fa48("86711") ? true : stryMutAct_9fa48("86710") ? leaderAddress : (stryCov_9fa48("86710", "86711", "86712"), !leaderAddress)) {
                if (stryMutAct_9fa48("86713")) {
                  {}
                } else {
                  stryCov_9fa48("86713");
                  throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("86714")) {
              {}
            } else {
              stryCov_9fa48("86714");
              lastAddressError = error;
              continue;
            }
          }
          const forwardStartMs = service.now();
          try {
            if (stryMutAct_9fa48("86715")) {
              {}
            } else {
              stryCov_9fa48("86715");
              const deliveryResult = await service.transport.deliver(leaderAddress, payload, stryMutAct_9fa48("86716") ? {} : (stryCov_9fa48("86716"), {
                deliveryPriority
              }));
              const deliveryAcked = stryMutAct_9fa48("86719") ? deliveryResult?.acknowledged !== true : stryMutAct_9fa48("86718") ? false : stryMutAct_9fa48("86717") ? true : (stryCov_9fa48("86717", "86718", "86719"), (stryMutAct_9fa48("86720") ? deliveryResult.acknowledged : (stryCov_9fa48("86720"), deliveryResult?.acknowledged)) === (stryMutAct_9fa48("86721") ? false : (stryCov_9fa48("86721"), true)));
              const deliverySucceeded = stryMutAct_9fa48("86724") ? deliveryResult?.success === false : stryMutAct_9fa48("86723") ? false : stryMutAct_9fa48("86722") ? true : (stryCov_9fa48("86722", "86723", "86724"), (stryMutAct_9fa48("86725") ? deliveryResult.success : (stryCov_9fa48("86725"), deliveryResult?.success)) !== (stryMutAct_9fa48("86726") ? true : (stryCov_9fa48("86726"), false)));
              const deliveryErrorMessage = (stryMutAct_9fa48("86729") ? typeof deliveryResult?.error === TYPEOF.STRING || deliveryResult.error.length > NUM.ZERO : stryMutAct_9fa48("86728") ? false : stryMutAct_9fa48("86727") ? true : (stryCov_9fa48("86727", "86728", "86729"), (stryMutAct_9fa48("86731") ? typeof deliveryResult?.error !== TYPEOF.STRING : stryMutAct_9fa48("86730") ? true : (stryCov_9fa48("86730", "86731"), typeof (stryMutAct_9fa48("86732") ? deliveryResult.error : (stryCov_9fa48("86732"), deliveryResult?.error)) === TYPEOF.STRING)) && (stryMutAct_9fa48("86735") ? deliveryResult.error.length <= NUM.ZERO : stryMutAct_9fa48("86734") ? deliveryResult.error.length >= NUM.ZERO : stryMutAct_9fa48("86733") ? true : (stryCov_9fa48("86733", "86734", "86735"), deliveryResult.error.length > NUM.ZERO)))) ? deliveryResult.error : null;
              const deliveryRejectedByHandler = stryMutAct_9fa48("86738") ? deliveryResult?.noHandler === true && deliveryErrorMessage !== null : stryMutAct_9fa48("86737") ? false : stryMutAct_9fa48("86736") ? true : (stryCov_9fa48("86736", "86737", "86738"), (stryMutAct_9fa48("86740") ? deliveryResult?.noHandler !== true : stryMutAct_9fa48("86739") ? false : (stryCov_9fa48("86739", "86740"), (stryMutAct_9fa48("86741") ? deliveryResult.noHandler : (stryCov_9fa48("86741"), deliveryResult?.noHandler)) === (stryMutAct_9fa48("86742") ? false : (stryCov_9fa48("86742"), true)))) || (stryMutAct_9fa48("86744") ? deliveryErrorMessage === null : stryMutAct_9fa48("86743") ? false : (stryCov_9fa48("86743", "86744"), deliveryErrorMessage !== null)));
              if (stryMutAct_9fa48("86747") ? (!deliveryAcked || !deliverySucceeded) && deliveryRejectedByHandler : stryMutAct_9fa48("86746") ? false : stryMutAct_9fa48("86745") ? true : (stryCov_9fa48("86745", "86746", "86747"), (stryMutAct_9fa48("86749") ? !deliveryAcked && !deliverySucceeded : stryMutAct_9fa48("86748") ? false : (stryCov_9fa48("86748", "86749"), (stryMutAct_9fa48("86750") ? deliveryAcked : (stryCov_9fa48("86750"), !deliveryAcked)) || (stryMutAct_9fa48("86751") ? deliverySucceeded : (stryCov_9fa48("86751"), !deliverySucceeded)))) || deliveryRejectedByHandler)) {
                if (stryMutAct_9fa48("86752")) {
                  {}
                } else {
                  stryCov_9fa48("86752");
                  const shouldRepairTopology = service.shouldRepairForwardTopology(deliveryErrorMessage);
                  if (stryMutAct_9fa48("86754") ? false : stryMutAct_9fa48("86753") ? true : (stryCov_9fa48("86753", "86754"), service.shouldSuppressForwardTarget(deliveryResult, deliveryErrorMessage))) {
                    if (stryMutAct_9fa48("86755")) {
                      {}
                    } else {
                      stryCov_9fa48("86755");
                      service.suppressForwardTarget(stryMutAct_9fa48("86756") ? {} : (stryCov_9fa48("86756"), {
                        serviceId: target.serviceId,
                        address: leaderAddress
                      }));
                    }
                  }
                  if (stryMutAct_9fa48("86758") ? false : stryMutAct_9fa48("86757") ? true : (stryCov_9fa48("86757", "86758"), shouldRepairTopology)) {
                    if (stryMutAct_9fa48("86759")) {
                      {}
                    } else {
                      stryCov_9fa48("86759");
                      await service.maybeRepairAuthoritativeForwardTopology(stryMutAct_9fa48("86760") ? {} : (stryCov_9fa48("86760"), {
                        serviceId: target.serviceId,
                        address: leaderAddress,
                        errorMessage: deliveryErrorMessage
                      }));
                    }
                  }
                  service.logger.warn(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CDC_FORWARD_TO_LEADER_REJECTED, stryMutAct_9fa48("86761") ? {} : (stryCov_9fa48("86761"), {
                    groupId: service.groupId,
                    replicaId: service.replicaId,
                    leaderId: target.serviceId,
                    leaderServiceId: target.serviceId,
                    leaderAddress,
                    tableName,
                    operation,
                    relayDepth,
                    causeId,
                    durationMs: stryMutAct_9fa48("86762") ? service.now() + forwardStartMs : (stryCov_9fa48("86762"), service.now() - forwardStartMs),
                    deliveryRejectedByHandler,
                    acknowledged: deliveryAcked,
                    success: deliverySucceeded,
                    noHandler: stryMutAct_9fa48("86765") ? deliveryResult?.noHandler !== true : stryMutAct_9fa48("86764") ? false : stryMutAct_9fa48("86763") ? true : (stryCov_9fa48("86763", "86764", "86765"), (stryMutAct_9fa48("86766") ? deliveryResult.noHandler : (stryCov_9fa48("86766"), deliveryResult?.noHandler)) === (stryMutAct_9fa48("86767") ? false : (stryCov_9fa48("86767"), true))),
                    replayIsolationEngaged: replayOnly,
                    deliveryPriority,
                    strictForwarding,
                    strictForwardRetryAfterMs,
                    error: deliveryErrorMessage
                  }));
                  const deliveryError = (stryMutAct_9fa48("86770") ? deliveryErrorMessage === null : stryMutAct_9fa48("86769") ? false : stryMutAct_9fa48("86768") ? true : (stryCov_9fa48("86768", "86769", "86770"), deliveryErrorMessage !== null)) ? stryMutAct_9fa48("86771") ? `` : (stryCov_9fa48("86771"), `: ${this.boundCdcForwardErrorDetail(deliveryErrorMessage)}`) : stryMutAct_9fa48("86772") ? "Stryker was here!" : (stryCov_9fa48("86772"), '');
                  const forwardErrorMessage = stryMutAct_9fa48("86773") ? `` : (stryCov_9fa48("86773"), `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_DELIVERY_REJECTED}${deliveryError}`);
                  lastDeliveryError = strictForwarding ? this.buildDeferredCdcForwardError(forwardErrorMessage, strictForwardRetryAfterMs) : new Error(forwardErrorMessage);
                  continue;
                }
              }
              service.clearForwardTargetSuppression(stryMutAct_9fa48("86774") ? {} : (stryCov_9fa48("86774"), {
                serviceId: target.serviceId,
                address: leaderAddress
              }));
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("86775")) {
              {}
            } else {
              stryCov_9fa48("86775");
              const shouldRepairTopology = service.shouldRepairForwardTopology(stryMutAct_9fa48("86778") ? error?.message && null : stryMutAct_9fa48("86777") ? false : stryMutAct_9fa48("86776") ? true : (stryCov_9fa48("86776", "86777", "86778"), (stryMutAct_9fa48("86779") ? error.message : (stryCov_9fa48("86779"), error?.message)) || null));
              if (stryMutAct_9fa48("86781") ? false : stryMutAct_9fa48("86780") ? true : (stryCov_9fa48("86780", "86781"), service.shouldSuppressForwardTarget(null, stryMutAct_9fa48("86784") ? error?.message && null : stryMutAct_9fa48("86783") ? false : stryMutAct_9fa48("86782") ? true : (stryCov_9fa48("86782", "86783", "86784"), (stryMutAct_9fa48("86785") ? error.message : (stryCov_9fa48("86785"), error?.message)) || null)))) {
                if (stryMutAct_9fa48("86786")) {
                  {}
                } else {
                  stryCov_9fa48("86786");
                  service.suppressForwardTarget(stryMutAct_9fa48("86787") ? {} : (stryCov_9fa48("86787"), {
                    serviceId: target.serviceId,
                    address: leaderAddress
                  }));
                }
              }
              if (stryMutAct_9fa48("86789") ? false : stryMutAct_9fa48("86788") ? true : (stryCov_9fa48("86788", "86789"), shouldRepairTopology)) {
                if (stryMutAct_9fa48("86790")) {
                  {}
                } else {
                  stryCov_9fa48("86790");
                  await service.maybeRepairAuthoritativeForwardTopology(stryMutAct_9fa48("86791") ? {} : (stryCov_9fa48("86791"), {
                    serviceId: target.serviceId,
                    address: leaderAddress,
                    errorMessage: stryMutAct_9fa48("86794") ? error?.message && null : stryMutAct_9fa48("86793") ? false : stryMutAct_9fa48("86792") ? true : (stryCov_9fa48("86792", "86793", "86794"), (stryMutAct_9fa48("86795") ? error.message : (stryCov_9fa48("86795"), error?.message)) || null)
                  }));
                }
              }
              lastDeliveryError = strictForwarding ? this.buildDeferredCdcForwardError(stryMutAct_9fa48("86798") ? this.boundCdcForwardErrorDetail(error?.message) && MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN : stryMutAct_9fa48("86797") ? false : stryMutAct_9fa48("86796") ? true : (stryCov_9fa48("86796", "86797", "86798"), this.boundCdcForwardErrorDetail(stryMutAct_9fa48("86799") ? error.message : (stryCov_9fa48("86799"), error?.message)) || MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN), strictForwardRetryAfterMs) : error;
            }
          }
        }
      }
      if (stryMutAct_9fa48("86801") ? false : stryMutAct_9fa48("86800") ? true : (stryCov_9fa48("86800", "86801"), lastDeliveryError)) {
        if (stryMutAct_9fa48("86802")) {
          {}
        } else {
          stryCov_9fa48("86802");
          throw lastDeliveryError;
        }
      }
      if (stryMutAct_9fa48("86804") ? false : stryMutAct_9fa48("86803") ? true : (stryCov_9fa48("86803", "86804"), lastAddressError)) {
        if (stryMutAct_9fa48("86805")) {
          {}
        } else {
          stryCov_9fa48("86805");
          const message = (stryMutAct_9fa48("86806") ? `` : (stryCov_9fa48("86806"), `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED}: `)) + (stryMutAct_9fa48("86807") ? `` : (stryCov_9fa48("86807"), `${this.boundCdcForwardErrorDetail(lastAddressError.message)}`));
          throw strictForwarding ? this.buildDeferredCdcForwardError(message, strictForwardRetryAfterMs) : new Error(message);
        }
      }
      throw strictForwarding ? this.buildDeferredCdcForwardError(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN, strictForwardRetryAfterMs) : new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
    }
  }
}
export { MessageGroupForwardingOwner };