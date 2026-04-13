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
import { validate as uuidValidate } from 'uuid';
import { assertCritical } from '../../utils/assert.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF } from '../../constants/index.js';
import { NODE_STATE } from '../../constants/node-state.js';
import { RAFT_ROLE } from '../../raft/constants.js';
import { AuthoritativeControlPlaneView } from '../../control-plane/authoritative-control-plane-view.js';
import { MEMBERSHIP_LIFECYCLE_INTENT, resolveMembershipJoinIntentType } from '../../control-plane/membership-lifecycle-controller.js';
import { MessageGroupAssignment } from '../message-group-assignment.js';
import { BOOTSTRAP_ASSIGNMENT_STRATEGY } from '../bootstrap-constants.js';
import { BOOTSTRAP_API_ERROR, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_SUBSYSTEM } from '../bootstrap-api-constants.js';
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;
const REJOIN_TERMINAL_STATES = Object.freeze(new Set(stryMutAct_9fa48("18897") ? [] : (stryCov_9fa48("18897"), [NODE_STATE.STOPPED, NODE_STATE.FAILED, NODE_STATE.SHUTTING_DOWN])));
class BootstrapJoinAdmissionOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("18898")) {
      {}
    } else {
      stryCov_9fa48("18898");
      this.delegates = stryMutAct_9fa48("18901") ? options.delegates && {} : stryMutAct_9fa48("18900") ? false : stryMutAct_9fa48("18899") ? true : (stryCov_9fa48("18899", "18900", "18901"), options.delegates || {});
      this.moveReplicaAssignmentReservationLock = Promise.resolve();
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("18902")) {
      {}
    } else {
      stryCov_9fa48("18902");
      return stryMutAct_9fa48("18905") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("18904") ? false : stryMutAct_9fa48("18903") ? true : (stryCov_9fa48("18903", "18904", "18905"), (stryMutAct_9fa48("18906") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("18906"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getSeedNodeAddress() {
    if (stryMutAct_9fa48("18907")) {
      {}
    } else {
      stryCov_9fa48("18907");
      return stryMutAct_9fa48("18910") ? this.delegates.getSeedNodeAddress?.() && null : stryMutAct_9fa48("18909") ? false : stryMutAct_9fa48("18908") ? true : (stryCov_9fa48("18908", "18909", "18910"), (stryMutAct_9fa48("18911") ? this.delegates.getSeedNodeAddress() : (stryCov_9fa48("18911"), this.delegates.getSeedNodeAddress?.())) || null);
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("18912")) {
      {}
    } else {
      stryCov_9fa48("18912");
      return stryMutAct_9fa48("18915") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("18914") ? false : stryMutAct_9fa48("18913") ? true : (stryCov_9fa48("18913", "18914", "18915"), (stryMutAct_9fa48("18916") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("18916"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("18917")) {
      {}
    } else {
      stryCov_9fa48("18917");
      return stryMutAct_9fa48("18920") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("18919") ? false : stryMutAct_9fa48("18918") ? true : (stryCov_9fa48("18918", "18919", "18920"), (stryMutAct_9fa48("18921") ? this.delegates.getLogger() : (stryCov_9fa48("18921"), this.delegates.getLogger?.())) || console);
    }
  }
  getCdcIntegrationService() {
    if (stryMutAct_9fa48("18922")) {
      {}
    } else {
      stryCov_9fa48("18922");
      return stryMutAct_9fa48("18925") ? this.delegates.getCdcIntegrationService?.() && null : stryMutAct_9fa48("18924") ? false : stryMutAct_9fa48("18923") ? true : (stryCov_9fa48("18923", "18924", "18925"), (stryMutAct_9fa48("18926") ? this.delegates.getCdcIntegrationService() : (stryCov_9fa48("18926"), this.delegates.getCdcIntegrationService?.())) || null);
    }
  }
  getMessageRouter() {
    if (stryMutAct_9fa48("18927")) {
      {}
    } else {
      stryCov_9fa48("18927");
      return stryMutAct_9fa48("18930") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("18929") ? false : stryMutAct_9fa48("18928") ? true : (stryCov_9fa48("18928", "18929", "18930"), (stryMutAct_9fa48("18931") ? this.delegates.getMessageRouter() : (stryCov_9fa48("18931"), this.delegates.getMessageRouter?.())) || null);
    }
  }
  getAuthoritativeControlPlaneViewInstance() {
    if (stryMutAct_9fa48("18932")) {
      {}
    } else {
      stryCov_9fa48("18932");
      return stryMutAct_9fa48("18935") ? this.delegates.getAuthoritativeControlPlaneViewInstance?.() && null : stryMutAct_9fa48("18934") ? false : stryMutAct_9fa48("18933") ? true : (stryCov_9fa48("18933", "18934", "18935"), (stryMutAct_9fa48("18936") ? this.delegates.getAuthoritativeControlPlaneViewInstance() : (stryCov_9fa48("18936"), this.delegates.getAuthoritativeControlPlaneViewInstance?.())) || null);
    }
  }
  setAuthoritativeControlPlaneViewInstance(view) {
    if (stryMutAct_9fa48("18937")) {
      {}
    } else {
      stryCov_9fa48("18937");
      stryMutAct_9fa48("18938") ? this.delegates.setAuthoritativeControlPlaneViewInstance(view || null) : (stryCov_9fa48("18938"), this.delegates.setAuthoritativeControlPlaneViewInstance?.(stryMutAct_9fa48("18941") ? view && null : stryMutAct_9fa48("18940") ? false : stryMutAct_9fa48("18939") ? true : (stryCov_9fa48("18939", "18940", "18941"), view || null)));
    }
  }
  getBootstrapAuthoritativeTableRows(tableName) {
    if (stryMutAct_9fa48("18942")) {
      {}
    } else {
      stryCov_9fa48("18942");
      return stryMutAct_9fa48("18945") ? this.delegates.getBootstrapAuthoritativeTableRows?.(tableName) && [] : stryMutAct_9fa48("18944") ? false : stryMutAct_9fa48("18943") ? true : (stryCov_9fa48("18943", "18944", "18945"), (stryMutAct_9fa48("18946") ? this.delegates.getBootstrapAuthoritativeTableRows(tableName) : (stryCov_9fa48("18946"), this.delegates.getBootstrapAuthoritativeTableRows?.(tableName))) || (stryMutAct_9fa48("18947") ? ["Stryker was here"] : (stryCov_9fa48("18947"), [])));
    }
  }
  async expireMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("18948")) {
      {}
    } else {
      stryCov_9fa48("18948");
      return stryMutAct_9fa48("18949") ? this.delegates.expireMoveReplicaAssignmentReservations() : (stryCov_9fa48("18949"), this.delegates.expireMoveReplicaAssignmentReservations?.());
    }
  }
  async getActiveMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("18950")) {
      {}
    } else {
      stryCov_9fa48("18950");
      return stryMutAct_9fa48("18953") ? this.delegates.getActiveMoveReplicaAssignmentReservations?.() && [] : stryMutAct_9fa48("18952") ? false : stryMutAct_9fa48("18951") ? true : (stryCov_9fa48("18951", "18952", "18953"), (stryMutAct_9fa48("18954") ? this.delegates.getActiveMoveReplicaAssignmentReservations() : (stryCov_9fa48("18954"), this.delegates.getActiveMoveReplicaAssignmentReservations?.())) || (stryMutAct_9fa48("18955") ? ["Stryker was here"] : (stryCov_9fa48("18955"), [])));
    }
  }
  async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
    if (stryMutAct_9fa48("18956")) {
      {}
    } else {
      stryCov_9fa48("18956");
      return stryMutAct_9fa48("18959") ? this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now) && [] : stryMutAct_9fa48("18958") ? false : stryMutAct_9fa48("18957") ? true : (stryCov_9fa48("18957", "18958", "18959"), (stryMutAct_9fa48("18960") ? this.delegates.getBlockingMoveReplicaBootstrapAdmissions(now) : (stryCov_9fa48("18960"), this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now))) || (stryMutAct_9fa48("18961") ? ["Stryker was here"] : (stryCov_9fa48("18961"), [])));
    }
  }
  async getMoveReplicaBootstrapExclusionReservations(now = Date.now()) {
    if (stryMutAct_9fa48("18962")) {
      {}
    } else {
      stryCov_9fa48("18962");
      return stryMutAct_9fa48("18965") ? this.delegates.getMoveReplicaBootstrapExclusionReservations?.(now) && [] : stryMutAct_9fa48("18964") ? false : stryMutAct_9fa48("18963") ? true : (stryCov_9fa48("18963", "18964", "18965"), (stryMutAct_9fa48("18966") ? this.delegates.getMoveReplicaBootstrapExclusionReservations(now) : (stryCov_9fa48("18966"), this.delegates.getMoveReplicaBootstrapExclusionReservations?.(now))) || (stryMutAct_9fa48("18967") ? ["Stryker was here"] : (stryCov_9fa48("18967"), [])));
    }
  }
  async reserveMoveReplicaAssignment(targetNodeId, assignment) {
    if (stryMutAct_9fa48("18968")) {
      {}
    } else {
      stryCov_9fa48("18968");
      return stryMutAct_9fa48("18969") ? this.delegates.reserveMoveReplicaAssignment(targetNodeId, assignment) : (stryCov_9fa48("18969"), this.delegates.reserveMoveReplicaAssignment?.(targetNodeId, assignment));
    }
  }
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("18970")) {
      {}
    } else {
      stryCov_9fa48("18970");
      if (stryMutAct_9fa48("18973") ? false : stryMutAct_9fa48("18972") ? true : stryMutAct_9fa48("18971") ? nodeId : (stryCov_9fa48("18971", "18972", "18973"), !nodeId)) {
        if (stryMutAct_9fa48("18974")) {
          {}
        } else {
          stryCov_9fa48("18974");
          return BOOTSTRAP_API_ERROR.NODE_ID_REQUIRED;
        }
      }
      if (stryMutAct_9fa48("18977") ? false : stryMutAct_9fa48("18976") ? true : stryMutAct_9fa48("18975") ? uuidValidate(nodeId) : (stryCov_9fa48("18975", "18976", "18977"), !uuidValidate(nodeId))) {
        if (stryMutAct_9fa48("18978")) {
          {}
        } else {
          stryCov_9fa48("18978");
          return BOOTSTRAP_API_ERROR.NODE_ID_INVALID;
        }
      }
      if (stryMutAct_9fa48("18981") ? false : stryMutAct_9fa48("18980") ? true : stryMutAct_9fa48("18979") ? nodeAddress : (stryCov_9fa48("18979", "18980", "18981"), !nodeAddress)) {
        if (stryMutAct_9fa48("18982")) {
          {}
        } else {
          stryCov_9fa48("18982");
          return BOOTSTRAP_API_ERROR.NODE_ADDRESS_REQUIRED;
        }
      }
      if (stryMutAct_9fa48("18985") ? typeof nodeAddress !== TYPEOF.STRING && nodeAddress.length === NUM.ZERO : stryMutAct_9fa48("18984") ? false : stryMutAct_9fa48("18983") ? true : (stryCov_9fa48("18983", "18984", "18985"), (stryMutAct_9fa48("18987") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("18986") ? false : (stryCov_9fa48("18986", "18987"), typeof nodeAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("18989") ? nodeAddress.length !== NUM.ZERO : stryMutAct_9fa48("18988") ? false : (stryCov_9fa48("18988", "18989"), nodeAddress.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("18990")) {
          {}
        } else {
          stryCov_9fa48("18990");
          return BOOTSTRAP_API_ERROR.NODE_ADDRESS_INVALID;
        }
      }
      return null;
    }
  }
  async checkForConflicts(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("18991")) {
      {}
    } else {
      stryCov_9fa48("18991");
      const nodeIdAlreadyRegistered = BOOTSTRAP_API_ERROR.NODE_ID_ALREADY_REGISTERED;
      const nodeAddressInUse = BOOTSTRAP_API_ERROR.NODE_ADDRESS_IN_USE;
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      if (stryMutAct_9fa48("18994") ? nodeId !== this.getSeedNodeId() : stryMutAct_9fa48("18993") ? false : stryMutAct_9fa48("18992") ? true : (stryCov_9fa48("18992", "18993", "18994"), nodeId === this.getSeedNodeId())) {
        if (stryMutAct_9fa48("18995")) {
          {}
        } else {
          stryCov_9fa48("18995");
          return BOOTSTRAP_API_ERROR.SEED_NODE_ID_CONFLICT;
        }
      }
      if (stryMutAct_9fa48("18998") ? nodeAddress !== this.getSeedNodeAddress() : stryMutAct_9fa48("18997") ? false : stryMutAct_9fa48("18996") ? true : (stryCov_9fa48("18996", "18997", "18998"), nodeAddress === this.getSeedNodeAddress())) {
        if (stryMutAct_9fa48("18999")) {
          {}
        } else {
          stryCov_9fa48("18999");
          return BOOTSTRAP_API_ERROR.SEED_NODE_ADDRESS_CONFLICT;
        }
      }
      const existingNode = systemTableCache.get(TABLES.NODES, nodeId);
      if (stryMutAct_9fa48("19001") ? false : stryMutAct_9fa48("19000") ? true : (stryCov_9fa48("19000", "19001"), existingNode)) {
        if (stryMutAct_9fa48("19002")) {
          {}
        } else {
          stryCov_9fa48("19002");
          const authoritativeExistingNode = await this.readAuthoritativeNodeRow(nodeId);
          const effectiveExistingNode = authoritativeExistingNode.available ? authoritativeExistingNode.row : existingNode;
          const existingNodeAddress = stryMutAct_9fa48("19003") ? (effectiveExistingNode?.[COLUMN.NODE_ADDRESS] ?? effectiveExistingNode?.node_address) && null : (stryCov_9fa48("19003"), (stryMutAct_9fa48("19004") ? effectiveExistingNode?.[COLUMN.NODE_ADDRESS] && effectiveExistingNode?.node_address : (stryCov_9fa48("19004"), (stryMutAct_9fa48("19005") ? effectiveExistingNode[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("19005"), effectiveExistingNode?.[COLUMN.NODE_ADDRESS])) ?? (stryMutAct_9fa48("19006") ? effectiveExistingNode.node_address : (stryCov_9fa48("19006"), effectiveExistingNode?.node_address)))) ?? null);
          if (stryMutAct_9fa48("19009") ? existingNodeAddress !== nodeAddress : stryMutAct_9fa48("19008") ? false : stryMutAct_9fa48("19007") ? true : (stryCov_9fa48("19007", "19008", "19009"), existingNodeAddress === nodeAddress)) {
            if (stryMutAct_9fa48("19010")) {
              {}
            } else {
              stryCov_9fa48("19010");
              this.getLogger().info(BOOTSTRAP_API_LOG_MSG.IDEMPOTENT_NODE_REJOIN_ALLOWED, stryMutAct_9fa48("19011") ? {} : (stryCov_9fa48("19011"), {
                nodeId,
                nodeAddress,
                authoritativeOverride: stryMutAct_9fa48("19014") ? authoritativeExistingNode.available !== true : stryMutAct_9fa48("19013") ? false : stryMutAct_9fa48("19012") ? true : (stryCov_9fa48("19012", "19013", "19014"), authoritativeExistingNode.available === (stryMutAct_9fa48("19015") ? false : (stryCov_9fa48("19015"), true)))
              }));
              return null;
            }
          }
          if (stryMutAct_9fa48("19018") ? effectiveExistingNode || !this.isNodeDead(effectiveExistingNode) : stryMutAct_9fa48("19017") ? false : stryMutAct_9fa48("19016") ? true : (stryCov_9fa48("19016", "19017", "19018"), effectiveExistingNode && (stryMutAct_9fa48("19019") ? this.isNodeDead(effectiveExistingNode) : (stryCov_9fa48("19019"), !this.isNodeDead(effectiveExistingNode))))) {
            if (stryMutAct_9fa48("19020")) {
              {}
            } else {
              stryCov_9fa48("19020");
              return nodeIdAlreadyRegistered(nodeId);
            }
          }
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.STALE_NODE_REJOIN_ALLOWED, stryMutAct_9fa48("19021") ? {} : (stryCov_9fa48("19021"), {
            nodeId,
            existingStatus: stryMutAct_9fa48("19022") ? effectiveExistingNode?.[COLUMN.STATUS] && null : (stryCov_9fa48("19022"), (stryMutAct_9fa48("19023") ? effectiveExistingNode[COLUMN.STATUS] : (stryCov_9fa48("19023"), effectiveExistingNode?.[COLUMN.STATUS])) ?? null),
            existingLease: stryMutAct_9fa48("19024") ? effectiveExistingNode?.[COLUMN.READY_LEASE_EXPIRES_AT] && null : (stryCov_9fa48("19024"), (stryMutAct_9fa48("19025") ? effectiveExistingNode[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("19025"), effectiveExistingNode?.[COLUMN.READY_LEASE_EXPIRES_AT])) ?? null),
            authoritativeOverride: stryMutAct_9fa48("19028") ? authoritativeExistingNode.available !== true : stryMutAct_9fa48("19027") ? false : stryMutAct_9fa48("19026") ? true : (stryCov_9fa48("19026", "19027", "19028"), authoritativeExistingNode.available === (stryMutAct_9fa48("19029") ? false : (stryCov_9fa48("19029"), true)))
          }));
        }
      }
      const allNodes = stryMutAct_9fa48("19032") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("19031") ? false : stryMutAct_9fa48("19030") ? true : (stryCov_9fa48("19030", "19031", "19032"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("19033") ? ["Stryker was here"] : (stryCov_9fa48("19033"), [])));
      for (const node of allNodes) {
        if (stryMutAct_9fa48("19034")) {
          {}
        } else {
          stryCov_9fa48("19034");
          if (stryMutAct_9fa48("19037") ? node[COLUMN.NODE_ADDRESS] === nodeAddress && node[COLUMN.NODE_ID] !== nodeId || !this.isNodeDead(node) : stryMutAct_9fa48("19036") ? false : stryMutAct_9fa48("19035") ? true : (stryCov_9fa48("19035", "19036", "19037"), (stryMutAct_9fa48("19039") ? node[COLUMN.NODE_ADDRESS] === nodeAddress || node[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("19038") ? true : (stryCov_9fa48("19038", "19039"), (stryMutAct_9fa48("19041") ? node[COLUMN.NODE_ADDRESS] !== nodeAddress : stryMutAct_9fa48("19040") ? true : (stryCov_9fa48("19040", "19041"), node[COLUMN.NODE_ADDRESS] === nodeAddress)) && (stryMutAct_9fa48("19043") ? node[COLUMN.NODE_ID] === nodeId : stryMutAct_9fa48("19042") ? true : (stryCov_9fa48("19042", "19043"), node[COLUMN.NODE_ID] !== nodeId)))) && (stryMutAct_9fa48("19044") ? this.isNodeDead(node) : (stryCov_9fa48("19044"), !this.isNodeDead(node))))) {
            if (stryMutAct_9fa48("19045")) {
              {}
            } else {
              stryCov_9fa48("19045");
              return nodeAddressInUse(nodeAddress);
            }
          }
        }
      }
      return null;
    }
  }
  isNodeDead(nodeRecord) {
    if (stryMutAct_9fa48("19046")) {
      {}
    } else {
      stryCov_9fa48("19046");
      const status = nodeRecord[COLUMN.STATUS];
      if (stryMutAct_9fa48("19048") ? false : stryMutAct_9fa48("19047") ? true : (stryCov_9fa48("19047", "19048"), REJOIN_TERMINAL_STATES.has(status))) {
        if (stryMutAct_9fa48("19049")) {
          {}
        } else {
          stryCov_9fa48("19049");
          return stryMutAct_9fa48("19050") ? false : (stryCov_9fa48("19050"), true);
        }
      }
      const leaseExpiry = Number(nodeRecord[COLUMN.READY_LEASE_EXPIRES_AT]);
      if (stryMutAct_9fa48("19053") ? Number.isFinite(leaseExpiry) || leaseExpiry <= Date.now() : stryMutAct_9fa48("19052") ? false : stryMutAct_9fa48("19051") ? true : (stryCov_9fa48("19051", "19052", "19053"), Number.isFinite(leaseExpiry) && (stryMutAct_9fa48("19056") ? leaseExpiry > Date.now() : stryMutAct_9fa48("19055") ? leaseExpiry < Date.now() : stryMutAct_9fa48("19054") ? true : (stryCov_9fa48("19054", "19055", "19056"), leaseExpiry <= Date.now())))) {
        if (stryMutAct_9fa48("19057")) {
          {}
        } else {
          stryCov_9fa48("19057");
          return stryMutAct_9fa48("19058") ? false : (stryCov_9fa48("19058"), true);
        }
      }
      return stryMutAct_9fa48("19059") ? true : (stryCov_9fa48("19059"), false);
    }
  }
  async readAuthoritativeNodeRow(nodeId) {
    if (stryMutAct_9fa48("19060")) {
      {}
    } else {
      stryCov_9fa48("19060");
      const view = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("19063") ? false : stryMutAct_9fa48("19062") ? true : stryMutAct_9fa48("19061") ? view?.canRead() : (stryCov_9fa48("19061", "19062", "19063"), !(stryMutAct_9fa48("19064") ? view.canRead() : (stryCov_9fa48("19064"), view?.canRead())))) {
        if (stryMutAct_9fa48("19065")) {
          {}
        } else {
          stryCov_9fa48("19065");
          return stryMutAct_9fa48("19066") ? {} : (stryCov_9fa48("19066"), {
            available: stryMutAct_9fa48("19067") ? true : (stryCov_9fa48("19067"), false),
            row: null
          });
        }
      }
      try {
        if (stryMutAct_9fa48("19068")) {
          {}
        } else {
          stryCov_9fa48("19068");
          const result = await view.readRows(TABLES.NODES, stryMutAct_9fa48("19069") ? `` : (stryCov_9fa48("19069"), `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("19070") ? [] : (stryCov_9fa48("19070"), [nodeId]));
          if (stryMutAct_9fa48("19073") ? result?.success === true : stryMutAct_9fa48("19072") ? false : stryMutAct_9fa48("19071") ? true : (stryCov_9fa48("19071", "19072", "19073"), (stryMutAct_9fa48("19074") ? result.success : (stryCov_9fa48("19074"), result?.success)) !== (stryMutAct_9fa48("19075") ? false : (stryCov_9fa48("19075"), true)))) {
            if (stryMutAct_9fa48("19076")) {
              {}
            } else {
              stryCov_9fa48("19076");
              return stryMutAct_9fa48("19077") ? {} : (stryCov_9fa48("19077"), {
                available: stryMutAct_9fa48("19078") ? true : (stryCov_9fa48("19078"), false),
                row: null
              });
            }
          }
          const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("19079") ? ["Stryker was here"] : (stryCov_9fa48("19079"), []);
          const row = stryMutAct_9fa48("19082") ? (rows.find(candidate => {
            return candidate?.[COLUMN.NODE_ID] === nodeId || candidate?.node_id === nodeId;
          }) || rows[NUM.ZERO]) && null : stryMutAct_9fa48("19081") ? false : stryMutAct_9fa48("19080") ? true : (stryCov_9fa48("19080", "19081", "19082"), (stryMutAct_9fa48("19084") ? rows.find(candidate => {
            return candidate?.[COLUMN.NODE_ID] === nodeId || candidate?.node_id === nodeId;
          }) && rows[NUM.ZERO] : stryMutAct_9fa48("19083") ? false : (stryCov_9fa48("19083", "19084"), rows.find(candidate => {
            if (stryMutAct_9fa48("19085")) {
              {}
            } else {
              stryCov_9fa48("19085");
              return stryMutAct_9fa48("19088") ? candidate?.[COLUMN.NODE_ID] === nodeId && candidate?.node_id === nodeId : stryMutAct_9fa48("19087") ? false : stryMutAct_9fa48("19086") ? true : (stryCov_9fa48("19086", "19087", "19088"), (stryMutAct_9fa48("19090") ? candidate?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("19089") ? false : (stryCov_9fa48("19089", "19090"), (stryMutAct_9fa48("19091") ? candidate[COLUMN.NODE_ID] : (stryCov_9fa48("19091"), candidate?.[COLUMN.NODE_ID])) === nodeId)) || (stryMutAct_9fa48("19093") ? candidate?.node_id !== nodeId : stryMutAct_9fa48("19092") ? false : (stryCov_9fa48("19092", "19093"), (stryMutAct_9fa48("19094") ? candidate.node_id : (stryCov_9fa48("19094"), candidate?.node_id)) === nodeId)));
            }
          }) || rows[NUM.ZERO])) || null);
          return stryMutAct_9fa48("19095") ? {} : (stryCov_9fa48("19095"), {
            available: stryMutAct_9fa48("19096") ? false : (stryCov_9fa48("19096"), true),
            row
          });
        }
      } catch (_error) {
        if (stryMutAct_9fa48("19097")) {
          {}
        } else {
          stryCov_9fa48("19097");
          return stryMutAct_9fa48("19098") ? {} : (stryCov_9fa48("19098"), {
            available: stryMutAct_9fa48("19099") ? true : (stryCov_9fa48("19099"), false),
            row: null
          });
        }
      }
    }
  }
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("19100")) {
      {}
    } else {
      stryCov_9fa48("19100");
      const existingView = this.getAuthoritativeControlPlaneViewInstance();
      if (stryMutAct_9fa48("19102") ? false : stryMutAct_9fa48("19101") ? true : (stryCov_9fa48("19101", "19102"), existingView)) {
        if (stryMutAct_9fa48("19103")) {
          {}
        } else {
          stryCov_9fa48("19103");
          return existingView;
        }
      }
      const cdcIntegrationService = this.getCdcIntegrationService();
      if (stryMutAct_9fa48("19106") ? false : stryMutAct_9fa48("19105") ? true : stryMutAct_9fa48("19104") ? cdcIntegrationService : (stryCov_9fa48("19104", "19105", "19106"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("19107")) {
          {}
        } else {
          stryCov_9fa48("19107");
          return null;
        }
      }
      const view = new AuthoritativeControlPlaneView(stryMutAct_9fa48("19108") ? {} : (stryCov_9fa48("19108"), {
        nodeId: stryMutAct_9fa48("19111") ? this.getSeedNodeId() && BOOTSTRAP_API_SUBSYSTEM : stryMutAct_9fa48("19110") ? false : stryMutAct_9fa48("19109") ? true : (stryCov_9fa48("19109", "19110", "19111"), this.getSeedNodeId() || BOOTSTRAP_API_SUBSYSTEM),
        cdcIntegrationService,
        messageRouter: this.getMessageRouter()
      }));
      this.setAuthoritativeControlPlaneViewInstance(view);
      return view;
    }
  }
  determineMessageGroupAssignment(newNodeId, options = {}) {
    if (stryMutAct_9fa48("19112")) {
      {}
    } else {
      stryCov_9fa48("19112");
      const messageGroups = this.getMessageGroups();
      const excludedSourceNodeIds = new Set(options.excludedSourceNodeIds instanceof Set ? options.excludedSourceNodeIds : stryMutAct_9fa48("19113") ? ["Stryker was here"] : (stryCov_9fa48("19113"), []));
      const seedNodeId = this.getSeedNodeId();
      if (stryMutAct_9fa48("19116") ? typeof seedNodeId === TYPEOF.STRING || seedNodeId.length > NUM.ZERO : stryMutAct_9fa48("19115") ? false : stryMutAct_9fa48("19114") ? true : (stryCov_9fa48("19114", "19115", "19116"), (stryMutAct_9fa48("19118") ? typeof seedNodeId !== TYPEOF.STRING : stryMutAct_9fa48("19117") ? true : (stryCov_9fa48("19117", "19118"), typeof seedNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("19121") ? seedNodeId.length <= NUM.ZERO : stryMutAct_9fa48("19120") ? seedNodeId.length >= NUM.ZERO : stryMutAct_9fa48("19119") ? true : (stryCov_9fa48("19119", "19120", "19121"), seedNodeId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("19122")) {
          {}
        } else {
          stryCov_9fa48("19122");
          for (const group of messageGroups) {
            if (stryMutAct_9fa48("19123")) {
              {}
            } else {
              stryCov_9fa48("19123");
              for (const replica of stryMutAct_9fa48("19126") ? group?.replicas && [] : stryMutAct_9fa48("19125") ? false : stryMutAct_9fa48("19124") ? true : (stryCov_9fa48("19124", "19125", "19126"), (stryMutAct_9fa48("19127") ? group.replicas : (stryCov_9fa48("19127"), group?.replicas)) || (stryMutAct_9fa48("19128") ? ["Stryker was here"] : (stryCov_9fa48("19128"), [])))) {
                if (stryMutAct_9fa48("19129")) {
                  {}
                } else {
                  stryCov_9fa48("19129");
                  const replicaNodeId = stryMutAct_9fa48("19130") ? replica.node_id : (stryCov_9fa48("19130"), replica?.node_id);
                  if (stryMutAct_9fa48("19133") ? !replicaNodeId && replicaNodeId === seedNodeId : stryMutAct_9fa48("19132") ? false : stryMutAct_9fa48("19131") ? true : (stryCov_9fa48("19131", "19132", "19133"), (stryMutAct_9fa48("19134") ? replicaNodeId : (stryCov_9fa48("19134"), !replicaNodeId)) || (stryMutAct_9fa48("19136") ? replicaNodeId !== seedNodeId : stryMutAct_9fa48("19135") ? false : (stryCov_9fa48("19135", "19136"), replicaNodeId === seedNodeId)))) {
                    if (stryMutAct_9fa48("19137")) {
                      {}
                    } else {
                      stryCov_9fa48("19137");
                      continue;
                    }
                  }
                  excludedSourceNodeIds.add(replicaNodeId);
                }
              }
            }
          }
        }
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.JOIN_ASSIGNMENT, stryMutAct_9fa48("19138") ? {} : (stryCov_9fa48("19138"), {
        newNodeId,
        messageGroupCount: messageGroups.length,
        excludedSourceNodeCount: excludedSourceNodeIds.size,
        messageGroups: messageGroups.map(stryMutAct_9fa48("19139") ? () => undefined : (stryCov_9fa48("19139"), group => stryMutAct_9fa48("19140") ? {} : (stryCov_9fa48("19140"), {
          groupId: group.group_id,
          replicaCount: stryMutAct_9fa48("19143") ? group.replicas?.length && NUM.ZERO : stryMutAct_9fa48("19142") ? false : stryMutAct_9fa48("19141") ? true : (stryCov_9fa48("19141", "19142", "19143"), (stryMutAct_9fa48("19144") ? group.replicas.length : (stryCov_9fa48("19144"), group.replicas?.length)) || NUM.ZERO),
          replicas: stryMutAct_9fa48("19145") ? group.replicas.map(replica => ({
            replicaId: replica.replica_id,
            nodeId: replica.node_id,
            address: replica.address
          })) : (stryCov_9fa48("19145"), group.replicas?.map(stryMutAct_9fa48("19146") ? () => undefined : (stryCov_9fa48("19146"), replica => stryMutAct_9fa48("19147") ? {} : (stryCov_9fa48("19147"), {
            replicaId: replica.replica_id,
            nodeId: replica.node_id,
            address: replica.address
          }))))
        })))
      }));
      const assignment = new MessageGroupAssignment(stryMutAct_9fa48("19148") ? {} : (stryCov_9fa48("19148"), {
        seedNodeAddress: this.getSeedNodeAddress()
      })).determineAssignment(newNodeId, messageGroups, stryMutAct_9fa48("19149") ? {} : (stryCov_9fa48("19149"), {
        allowRejoinSingleOwnedGroup: stryMutAct_9fa48("19152") ? resolveMembershipJoinIntentType(options.startupMode) !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("19151") ? false : stryMutAct_9fa48("19150") ? true : (stryCov_9fa48("19150", "19151", "19152"), resolveMembershipJoinIntentType(options.startupMode) === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY),
        excludedReplicaIds: options.excludedReplicaIds,
        excludedSourceNodeIds
      }));
      return this.augmentAssignmentWithPeerAddresses(assignment, messageGroups);
    }
  }
  async withMoveReplicaAssignmentReservationLock(action) {
    if (stryMutAct_9fa48("19153")) {
      {}
    } else {
      stryCov_9fa48("19153");
      const previousLock = this.moveReplicaAssignmentReservationLock;
      let releaseLock;
      this.moveReplicaAssignmentReservationLock = new Promise(resolve => {
        if (stryMutAct_9fa48("19154")) {
          {}
        } else {
          stryCov_9fa48("19154");
          releaseLock = resolve;
        }
      });
      await previousLock;
      try {
        if (stryMutAct_9fa48("19155")) {
          {}
        } else {
          stryCov_9fa48("19155");
          return await action();
        }
      } finally {
        if (stryMutAct_9fa48("19156")) {
          {}
        } else {
          stryCov_9fa48("19156");
          releaseLock();
        }
      }
    }
  }
  async determineAndReserveMessageGroupAssignment(newNodeId, options = {}) {
    if (stryMutAct_9fa48("19157")) {
      {}
    } else {
      stryCov_9fa48("19157");
      return this.withMoveReplicaAssignmentReservationLock(async () => {
        if (stryMutAct_9fa48("19158")) {
          {}
        } else {
          stryCov_9fa48("19158");
          await this.expireMoveReplicaAssignmentReservations();
          const activeReservations = await this.getActiveMoveReplicaAssignmentReservations();
          const exclusionReservations = await this.getMoveReplicaBootstrapExclusionReservations();
          const excludedReplicaIds = new Set(stryMutAct_9fa48("19159") ? [...activeReservations, ...exclusionReservations].map(reservation => reservation?.replicaId) : (stryCov_9fa48("19159"), (stryMutAct_9fa48("19160") ? [] : (stryCov_9fa48("19160"), [...activeReservations, ...exclusionReservations])).map(stryMutAct_9fa48("19161") ? () => undefined : (stryCov_9fa48("19161"), reservation => stryMutAct_9fa48("19162") ? reservation.replicaId : (stryCov_9fa48("19162"), reservation?.replicaId))).filter(stryMutAct_9fa48("19163") ? () => undefined : (stryCov_9fa48("19163"), replicaId => stryMutAct_9fa48("19166") ? typeof replicaId === TYPEOF.STRING || replicaId.length > NUM.ZERO : stryMutAct_9fa48("19165") ? false : stryMutAct_9fa48("19164") ? true : (stryCov_9fa48("19164", "19165", "19166"), (stryMutAct_9fa48("19168") ? typeof replicaId !== TYPEOF.STRING : stryMutAct_9fa48("19167") ? true : (stryCov_9fa48("19167", "19168"), typeof replicaId === TYPEOF.STRING)) && (stryMutAct_9fa48("19171") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("19170") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("19169") ? true : (stryCov_9fa48("19169", "19170", "19171"), replicaId.length > NUM.ZERO)))))));
          const assignment = this.determineMessageGroupAssignment(newNodeId, stryMutAct_9fa48("19172") ? {} : (stryCov_9fa48("19172"), {
            excludedReplicaIds,
            startupMode: options.startupMode
          }));
          if (stryMutAct_9fa48("19175") ? assignment.strategy === BootstrapStrategy.MOVE_REPLICA : stryMutAct_9fa48("19174") ? false : stryMutAct_9fa48("19173") ? true : (stryCov_9fa48("19173", "19174", "19175"), assignment.strategy !== BootstrapStrategy.MOVE_REPLICA)) {
            if (stryMutAct_9fa48("19176")) {
              {}
            } else {
              stryCov_9fa48("19176");
              return assignment;
            }
          }
          const reservation = await this.reserveMoveReplicaAssignment(newNodeId, assignment);
          return stryMutAct_9fa48("19177") ? {} : (stryCov_9fa48("19177"), {
            ...assignment,
            assignmentId: reservation.assignmentId,
            assignmentLeaseExpiresAt: reservation.leaseExpiresAt
          });
        }
      });
    }
  }
  augmentAssignmentWithPeerAddresses(assignment, messageGroups) {
    if (stryMutAct_9fa48("19178")) {
      {}
    } else {
      stryCov_9fa48("19178");
      if (stryMutAct_9fa48("19181") ? assignment.strategy !== BootstrapStrategy.MOVE_REPLICA : stryMutAct_9fa48("19180") ? false : stryMutAct_9fa48("19179") ? true : (stryCov_9fa48("19179", "19180", "19181"), assignment.strategy === BootstrapStrategy.MOVE_REPLICA)) {
        if (stryMutAct_9fa48("19182")) {
          {}
        } else {
          stryCov_9fa48("19182");
          const group = messageGroups.find(stryMutAct_9fa48("19183") ? () => undefined : (stryCov_9fa48("19183"), candidate => stryMutAct_9fa48("19186") ? candidate.group_id !== assignment.groupId : stryMutAct_9fa48("19185") ? false : stryMutAct_9fa48("19184") ? true : (stryCov_9fa48("19184", "19185", "19186"), candidate.group_id === assignment.groupId)));
          const replicas = stryMutAct_9fa48("19189") ? group?.replicas && [] : stryMutAct_9fa48("19188") ? false : stryMutAct_9fa48("19187") ? true : (stryCov_9fa48("19187", "19188", "19189"), (stryMutAct_9fa48("19190") ? group.replicas : (stryCov_9fa48("19190"), group?.replicas)) || (stryMutAct_9fa48("19191") ? ["Stryker was here"] : (stryCov_9fa48("19191"), [])));
          const peerAddresses = replicas.map(stryMutAct_9fa48("19192") ? () => undefined : (stryCov_9fa48("19192"), replica => (stryMutAct_9fa48("19193") ? `` : (stryCov_9fa48("19193"), `${replica.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("19194") ? `` : (stryCov_9fa48("19194"), `${ADDRESS.SEPARATOR}${replica.replica_id}`))));
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.JOIN_MOVABLE_REPLICA, stryMutAct_9fa48("19195") ? {} : (stryCov_9fa48("19195"), {
            groupId: assignment.groupId,
            sourceNodeId: assignment.sourceNodeId,
            replicaToMove: assignment.replicaToMove,
            peerIds: assignment.existingPeerIds,
            peerAddresses,
            replicaAddresses: assignment.replicaAddresses
          }));
          return stryMutAct_9fa48("19196") ? {} : (stryCov_9fa48("19196"), {
            ...assignment,
            peerAddresses
          });
        }
      }
      if (stryMutAct_9fa48("19199") ? assignment.reuseExistingGroup !== true : stryMutAct_9fa48("19198") ? false : stryMutAct_9fa48("19197") ? true : (stryCov_9fa48("19197", "19198", "19199"), assignment.reuseExistingGroup === (stryMutAct_9fa48("19200") ? false : (stryCov_9fa48("19200"), true)))) {
        if (stryMutAct_9fa48("19201")) {
          {}
        } else {
          stryCov_9fa48("19201");
          const group = messageGroups.find(stryMutAct_9fa48("19202") ? () => undefined : (stryCov_9fa48("19202"), candidate => stryMutAct_9fa48("19205") ? candidate.group_id !== assignment.groupId : stryMutAct_9fa48("19204") ? false : stryMutAct_9fa48("19203") ? true : (stryCov_9fa48("19203", "19204", "19205"), candidate.group_id === assignment.groupId)));
          const replicas = stryMutAct_9fa48("19208") ? group?.replicas && [] : stryMutAct_9fa48("19207") ? false : stryMutAct_9fa48("19206") ? true : (stryCov_9fa48("19206", "19207", "19208"), (stryMutAct_9fa48("19209") ? group.replicas : (stryCov_9fa48("19209"), group?.replicas)) || (stryMutAct_9fa48("19210") ? ["Stryker was here"] : (stryCov_9fa48("19210"), [])));
          return stryMutAct_9fa48("19211") ? {} : (stryCov_9fa48("19211"), {
            ...assignment,
            existingPeerIds: replicas.map(stryMutAct_9fa48("19212") ? () => undefined : (stryCov_9fa48("19212"), replica => replica.replica_id)),
            replicaAddresses: replicas.map(stryMutAct_9fa48("19213") ? () => undefined : (stryCov_9fa48("19213"), replica => replica.address)),
            peerAddresses: replicas.map(stryMutAct_9fa48("19214") ? () => undefined : (stryCov_9fa48("19214"), replica => (stryMutAct_9fa48("19215") ? `` : (stryCov_9fa48("19215"), `${replica.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("19216") ? `` : (stryCov_9fa48("19216"), `${ADDRESS.SEPARATOR}${replica.replica_id}`)))),
            replicaNodeMap: Object.fromEntries(replicas.map(stryMutAct_9fa48("19217") ? () => undefined : (stryCov_9fa48("19217"), replica => stryMutAct_9fa48("19218") ? [] : (stryCov_9fa48("19218"), [replica.replica_id, replica.node_id]))))
          });
        }
      }
      return assignment;
    }
  }
  getLeaderPartitionForTable(tableName) {
    if (stryMutAct_9fa48("19219")) {
      {}
    } else {
      stryCov_9fa48("19219");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const partitions = stryMutAct_9fa48("19222") ? systemTableCache.filter(TABLES.PARTITIONS, partition => partition.table_id === tableName || partition.table_name === tableName) && [] : stryMutAct_9fa48("19221") ? false : stryMutAct_9fa48("19220") ? true : (stryCov_9fa48("19220", "19221", "19222"), (stryMutAct_9fa48("19223") ? systemTableCache : (stryCov_9fa48("19223"), systemTableCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("19224") ? () => undefined : (stryCov_9fa48("19224"), partition => stryMutAct_9fa48("19227") ? partition.table_id === tableName && partition.table_name === tableName : stryMutAct_9fa48("19226") ? false : stryMutAct_9fa48("19225") ? true : (stryCov_9fa48("19225", "19226", "19227"), (stryMutAct_9fa48("19229") ? partition.table_id !== tableName : stryMutAct_9fa48("19228") ? false : (stryCov_9fa48("19228", "19229"), partition.table_id === tableName)) || (stryMutAct_9fa48("19231") ? partition.table_name !== tableName : stryMutAct_9fa48("19230") ? false : (stryCov_9fa48("19230", "19231"), partition.table_name === tableName))))))) || (stryMutAct_9fa48("19232") ? ["Stryker was here"] : (stryCov_9fa48("19232"), [])));
      if (stryMutAct_9fa48("19235") ? partitions.length !== NUM.ZERO : stryMutAct_9fa48("19234") ? false : stryMutAct_9fa48("19233") ? true : (stryCov_9fa48("19233", "19234", "19235"), partitions.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("19236")) {
          {}
        } else {
          stryCov_9fa48("19236");
          return null;
        }
      }
      const partition = partitions[NUM.ZERO];
      const services = stryMutAct_9fa48("19239") ? systemTableCache.filter(TABLES.SERVICES, service => service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] && service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER && service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE) && [] : stryMutAct_9fa48("19238") ? false : stryMutAct_9fa48("19237") ? true : (stryCov_9fa48("19237", "19238", "19239"), (stryMutAct_9fa48("19240") ? systemTableCache : (stryCov_9fa48("19240"), systemTableCache.filter(TABLES.SERVICES, stryMutAct_9fa48("19241") ? () => undefined : (stryCov_9fa48("19241"), service => stryMutAct_9fa48("19244") ? service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] && service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER || service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("19243") ? false : stryMutAct_9fa48("19242") ? true : (stryCov_9fa48("19242", "19243", "19244"), (stryMutAct_9fa48("19246") ? service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] && service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION || service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER : stryMutAct_9fa48("19245") ? true : (stryCov_9fa48("19245", "19246"), (stryMutAct_9fa48("19248") ? service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] || service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("19247") ? true : (stryCov_9fa48("19247", "19248"), (stryMutAct_9fa48("19250") ? service[COLUMN.PARTITION_ID] !== partition[COLUMN.PARTITION_ID] : stryMutAct_9fa48("19249") ? true : (stryCov_9fa48("19249", "19250"), service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID])) && (stryMutAct_9fa48("19252") ? service[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("19251") ? true : (stryCov_9fa48("19251", "19252"), service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION)))) && (stryMutAct_9fa48("19254") ? service[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("19253") ? true : (stryCov_9fa48("19253", "19254"), service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER)))) && (stryMutAct_9fa48("19256") ? service[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("19255") ? true : (stryCov_9fa48("19255", "19256"), service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE))))))) || (stryMutAct_9fa48("19257") ? ["Stryker was here"] : (stryCov_9fa48("19257"), [])));
      if (stryMutAct_9fa48("19260") ? services.length !== NUM.ZERO : stryMutAct_9fa48("19259") ? false : stryMutAct_9fa48("19258") ? true : (stryCov_9fa48("19258", "19259", "19260"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("19261")) {
          {}
        } else {
          stryCov_9fa48("19261");
          return null;
        }
      }
      return stryMutAct_9fa48("19262") ? {} : (stryCov_9fa48("19262"), {
        partitionId: partition[COLUMN.PARTITION_ID],
        tableName,
        leaderNodeId: services[NUM.ZERO][COLUMN.NODE_ID],
        replicaId: stryMutAct_9fa48("19265") ? services[NUM.ZERO][COLUMN.REPLICA_ID] && services[NUM.ZERO][COLUMN.SERVICE_ID] : stryMutAct_9fa48("19264") ? false : stryMutAct_9fa48("19263") ? true : (stryCov_9fa48("19263", "19264", "19265"), services[NUM.ZERO][COLUMN.REPLICA_ID] || services[NUM.ZERO][COLUMN.SERVICE_ID]),
        address: services[NUM.ZERO][COLUMN.ADDRESS]
      });
    }
  }
  getMessageGroups() {
    if (stryMutAct_9fa48("19266")) {
      {}
    } else {
      stryCov_9fa48("19266");
      const services = this.getBootstrapAuthoritativeTableRows(TABLES.SERVICES);
      const messageGroupServices = stryMutAct_9fa48("19267") ? services : (stryCov_9fa48("19267"), services.filter(stryMutAct_9fa48("19268") ? () => undefined : (stryCov_9fa48("19268"), service => stryMutAct_9fa48("19271") ? service[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("19270") ? false : stryMutAct_9fa48("19269") ? true : (stryCov_9fa48("19269", "19270", "19271"), service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP))));
      const groupsFromServices = new Map();
      for (const service of messageGroupServices) {
        if (stryMutAct_9fa48("19272")) {
          {}
        } else {
          stryCov_9fa48("19272");
          const groupId = service[COLUMN.GROUP_ID];
          if (stryMutAct_9fa48("19275") ? false : stryMutAct_9fa48("19274") ? true : stryMutAct_9fa48("19273") ? groupId : (stryCov_9fa48("19273", "19274", "19275"), !groupId)) {
            if (stryMutAct_9fa48("19276")) {
              {}
            } else {
              stryCov_9fa48("19276");
              continue;
            }
          }
          if (stryMutAct_9fa48("19279") ? false : stryMutAct_9fa48("19278") ? true : stryMutAct_9fa48("19277") ? groupsFromServices.has(groupId) : (stryCov_9fa48("19277", "19278", "19279"), !groupsFromServices.has(groupId))) {
            if (stryMutAct_9fa48("19280")) {
              {}
            } else {
              stryCov_9fa48("19280");
              groupsFromServices.set(groupId, stryMutAct_9fa48("19281") ? {} : (stryCov_9fa48("19281"), {
                group_id: groupId,
                replicas: stryMutAct_9fa48("19282") ? ["Stryker was here"] : (stryCov_9fa48("19282"), []),
                replica_count: NUM.ZERO
              }));
            }
          }
          const group = groupsFromServices.get(groupId);
          group.replicas.push(stryMutAct_9fa48("19283") ? {} : (stryCov_9fa48("19283"), {
            replica_id: stryMutAct_9fa48("19286") ? service[COLUMN.REPLICA_ID] && service[COLUMN.SERVICE_ID] : stryMutAct_9fa48("19285") ? false : stryMutAct_9fa48("19284") ? true : (stryCov_9fa48("19284", "19285", "19286"), service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID]),
            node_id: service[COLUMN.NODE_ID],
            address: service[COLUMN.ADDRESS],
            raft_role: service[COLUMN.RAFT_ROLE]
          }));
          group.replica_count = group.replicas.length;
        }
      }
      if (stryMutAct_9fa48("19290") ? groupsFromServices.size <= NUM.ZERO : stryMutAct_9fa48("19289") ? groupsFromServices.size >= NUM.ZERO : stryMutAct_9fa48("19288") ? false : stryMutAct_9fa48("19287") ? true : (stryCov_9fa48("19287", "19288", "19289", "19290"), groupsFromServices.size > NUM.ZERO)) {
        if (stryMutAct_9fa48("19291")) {
          {}
        } else {
          stryCov_9fa48("19291");
          return Array.from(groupsFromServices.values());
        }
      }
      const cachedGroups = this.getBootstrapAuthoritativeTableRows(TABLES.MESSAGE_GROUPS);
      return cachedGroups.map(group => {
        if (stryMutAct_9fa48("19292")) {
          {}
        } else {
          stryCov_9fa48("19292");
          const replicas = stryMutAct_9fa48("19293") ? messageGroupServices.map(service => ({
            replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
            node_id: service[COLUMN.NODE_ID],
            address: service[COLUMN.ADDRESS],
            raft_role: service[COLUMN.RAFT_ROLE]
          })) : (stryCov_9fa48("19293"), messageGroupServices.filter(stryMutAct_9fa48("19294") ? () => undefined : (stryCov_9fa48("19294"), service => stryMutAct_9fa48("19297") ? service[COLUMN.GROUP_ID] !== group[COLUMN.GROUP_ID] : stryMutAct_9fa48("19296") ? false : stryMutAct_9fa48("19295") ? true : (stryCov_9fa48("19295", "19296", "19297"), service[COLUMN.GROUP_ID] === group[COLUMN.GROUP_ID]))).map(stryMutAct_9fa48("19298") ? () => undefined : (stryCov_9fa48("19298"), service => stryMutAct_9fa48("19299") ? {} : (stryCov_9fa48("19299"), {
            replica_id: stryMutAct_9fa48("19302") ? service[COLUMN.REPLICA_ID] && service[COLUMN.SERVICE_ID] : stryMutAct_9fa48("19301") ? false : stryMutAct_9fa48("19300") ? true : (stryCov_9fa48("19300", "19301", "19302"), service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID]),
            node_id: service[COLUMN.NODE_ID],
            address: service[COLUMN.ADDRESS],
            raft_role: service[COLUMN.RAFT_ROLE]
          }))));
          return stryMutAct_9fa48("19303") ? {} : (stryCov_9fa48("19303"), {
            ...group,
            replicas
          });
        }
      });
    }
  }
}
export { BootstrapJoinAdmissionOwner };