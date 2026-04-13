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
import { assertCritical } from '../../utils/assert.js';
import { NodeService } from '../../node/node-service.js';
import { MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy } from '../message-group-assignment.js';
import { JOINING_ERROR_MSG, JOINING_LOG_MSG, JOINING_UNIFIED_RECONCILE, JOIN_REPLICA_DEFAULT } from '../node-joining-constants.js';
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, STRING, TABLES, TYPEOF, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';
const LOG_ENVELOPE_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_ENVELOPE;
const LOG_REGISTRATION_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_REGISTRATION;
class JoinMessageGroupRuntimeOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("21520")) {
      {}
    } else {
      stryCov_9fa48("21520");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("21523") ? options.delegates && {} : stryMutAct_9fa48("21522") ? false : stryMutAct_9fa48("21521") ? true : (stryCov_9fa48("21521", "21522", "21523"), options.delegates || {});
    }
  }
  assertReplicaStartupOwnership(replicaId) {
    if (stryMutAct_9fa48("21524")) {
      {}
    } else {
      stryCov_9fa48("21524");
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("21527") ? !systemTableCache && typeof systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("21526") ? false : stryMutAct_9fa48("21525") ? true : (stryCov_9fa48("21525", "21526", "21527"), (stryMutAct_9fa48("21528") ? systemTableCache : (stryCov_9fa48("21528"), !systemTableCache)) || (stryMutAct_9fa48("21530") ? typeof systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("21529") ? false : (stryCov_9fa48("21529", "21530"), typeof systemTableCache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("21531")) {
          {}
        } else {
          stryCov_9fa48("21531");
          return;
        }
      }
      const existingService = systemTableCache.get(TABLES.SERVICES, replicaId);
      if (stryMutAct_9fa48("21534") ? false : stryMutAct_9fa48("21533") ? true : stryMutAct_9fa48("21532") ? existingService : (stryCov_9fa48("21532", "21533", "21534"), !existingService)) {
        if (stryMutAct_9fa48("21535")) {
          {}
        } else {
          stryCov_9fa48("21535");
          return;
        }
      }
      if (stryMutAct_9fa48("21538") ? existingService[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("21537") ? false : stryMutAct_9fa48("21536") ? true : (stryCov_9fa48("21536", "21537", "21538"), existingService[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("21539")) {
          {}
        } else {
          stryCov_9fa48("21539");
          return;
        }
      }
      const existingNodeId = stryMutAct_9fa48("21542") ? existingService[COLUMN.NODE_ID] && null : stryMutAct_9fa48("21541") ? false : stryMutAct_9fa48("21540") ? true : (stryCov_9fa48("21540", "21541", "21542"), existingService[COLUMN.NODE_ID] || null);
      const existingStatus = stryMutAct_9fa48("21543") ? String(existingService[COLUMN.STATUS] || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("21543"), String(stryMutAct_9fa48("21546") ? existingService[COLUMN.STATUS] && STRING.UNKNOWN : stryMutAct_9fa48("21545") ? false : stryMutAct_9fa48("21544") ? true : (stryCov_9fa48("21544", "21545", "21546"), existingService[COLUMN.STATUS] || STRING.UNKNOWN)).toLowerCase());
      if (stryMutAct_9fa48("21549") ? (!existingNodeId || existingNodeId === this.nodeId) && existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("21548") ? false : stryMutAct_9fa48("21547") ? true : (stryCov_9fa48("21547", "21548", "21549"), (stryMutAct_9fa48("21551") ? !existingNodeId && existingNodeId === this.nodeId : stryMutAct_9fa48("21550") ? false : (stryCov_9fa48("21550", "21551"), (stryMutAct_9fa48("21552") ? existingNodeId : (stryCov_9fa48("21552"), !existingNodeId)) || (stryMutAct_9fa48("21554") ? existingNodeId !== this.nodeId : stryMutAct_9fa48("21553") ? false : (stryCov_9fa48("21553", "21554"), existingNodeId === this.nodeId)))) || (stryMutAct_9fa48("21556") ? existingStatus === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("21555") ? false : (stryCov_9fa48("21555", "21556"), existingStatus !== SERVICE_STATUS.ACTIVE)))) {
        if (stryMutAct_9fa48("21557")) {
          {}
        } else {
          stryCov_9fa48("21557");
          return;
        }
      }
      const assignment = stryMutAct_9fa48("21558") ? this.delegates.getBootstrapResponse().messageGroupAssignment : (stryCov_9fa48("21558"), this.delegates.getBootstrapResponse()?.messageGroupAssignment);
      const authorizedMoveReplicaStartup = stryMutAct_9fa48("21561") ? assignment && assignment.strategy === AssignmentStrategy.MOVE_REPLICA && assignment.replicaToMove === replicaId && assignment.sourceNodeId === existingNodeId && typeof assignment.assignmentId === TYPEOF.STRING || assignment.assignmentId.length > NUM.ZERO : stryMutAct_9fa48("21560") ? false : stryMutAct_9fa48("21559") ? true : (stryCov_9fa48("21559", "21560", "21561"), (stryMutAct_9fa48("21563") ? assignment && assignment.strategy === AssignmentStrategy.MOVE_REPLICA && assignment.replicaToMove === replicaId && assignment.sourceNodeId === existingNodeId || typeof assignment.assignmentId === TYPEOF.STRING : stryMutAct_9fa48("21562") ? true : (stryCov_9fa48("21562", "21563"), (stryMutAct_9fa48("21565") ? assignment && assignment.strategy === AssignmentStrategy.MOVE_REPLICA && assignment.replicaToMove === replicaId || assignment.sourceNodeId === existingNodeId : stryMutAct_9fa48("21564") ? true : (stryCov_9fa48("21564", "21565"), (stryMutAct_9fa48("21567") ? assignment && assignment.strategy === AssignmentStrategy.MOVE_REPLICA || assignment.replicaToMove === replicaId : stryMutAct_9fa48("21566") ? true : (stryCov_9fa48("21566", "21567"), (stryMutAct_9fa48("21569") ? assignment || assignment.strategy === AssignmentStrategy.MOVE_REPLICA : stryMutAct_9fa48("21568") ? true : (stryCov_9fa48("21568", "21569"), assignment && (stryMutAct_9fa48("21571") ? assignment.strategy !== AssignmentStrategy.MOVE_REPLICA : stryMutAct_9fa48("21570") ? true : (stryCov_9fa48("21570", "21571"), assignment.strategy === AssignmentStrategy.MOVE_REPLICA)))) && (stryMutAct_9fa48("21573") ? assignment.replicaToMove !== replicaId : stryMutAct_9fa48("21572") ? true : (stryCov_9fa48("21572", "21573"), assignment.replicaToMove === replicaId)))) && (stryMutAct_9fa48("21575") ? assignment.sourceNodeId !== existingNodeId : stryMutAct_9fa48("21574") ? true : (stryCov_9fa48("21574", "21575"), assignment.sourceNodeId === existingNodeId)))) && (stryMutAct_9fa48("21577") ? typeof assignment.assignmentId !== TYPEOF.STRING : stryMutAct_9fa48("21576") ? true : (stryCov_9fa48("21576", "21577"), typeof assignment.assignmentId === TYPEOF.STRING)))) && (stryMutAct_9fa48("21580") ? assignment.assignmentId.length <= NUM.ZERO : stryMutAct_9fa48("21579") ? assignment.assignmentId.length >= NUM.ZERO : stryMutAct_9fa48("21578") ? true : (stryCov_9fa48("21578", "21579", "21580"), assignment.assignmentId.length > NUM.ZERO)));
      if (stryMutAct_9fa48("21582") ? false : stryMutAct_9fa48("21581") ? true : (stryCov_9fa48("21581", "21582"), authorizedMoveReplicaStartup)) {
        if (stryMutAct_9fa48("21583")) {
          {}
        } else {
          stryCov_9fa48("21583");
          return;
        }
      }
      throw new Error(JOINING_ERROR_MSG.replicaOwnerConflict(replicaId, existingNodeId, this.nodeId));
    }
  }
  async phaseJoinExistingMessageGroup(assignment) {
    if (stryMutAct_9fa48("21584")) {
      {}
    } else {
      stryCov_9fa48("21584");
      const {
        groupId,
        peerAddresses,
        existingPeerIds,
        replicaAddresses
      } = assignment;
      const logger = this.delegates.getLogger();
      logger.info(JOINING_LOG_MSG.JOIN_ASSIGNMENT_RECEIVED, stryMutAct_9fa48("21585") ? {} : (stryCov_9fa48("21585"), {
        nodeId: this.nodeId,
        groupId,
        strategy: assignment.strategy,
        existingPeerIds: existingPeerIds,
        peerAddresses: peerAddresses,
        replicaAddresses: replicaAddresses,
        sourceNodeId: assignment.sourceNodeId,
        replicaToMove: assignment.replicaToMove
      }));
      const messageRouter = this.delegates.getMessageRouter();
      if (stryMutAct_9fa48("21588") ? false : stryMutAct_9fa48("21587") ? true : stryMutAct_9fa48("21586") ? messageRouter : (stryCov_9fa48("21586", "21587", "21588"), !messageRouter)) {
        if (stryMutAct_9fa48("21589")) {
          {}
        } else {
          stryCov_9fa48("21589");
          throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      const replicaId = assignment.replicaToMove;
      if (stryMutAct_9fa48("21592") ? false : stryMutAct_9fa48("21591") ? true : stryMutAct_9fa48("21590") ? replicaId : (stryCov_9fa48("21590", "21591", "21592"), !replicaId)) {
        if (stryMutAct_9fa48("21593")) {
          {}
        } else {
          stryCov_9fa48("21593");
          throw new Error(JOINING_ERROR_MSG.MOVE_REPLICA_MISSING);
        }
      }
      this.assertReplicaStartupOwnership(replicaId);
      const allReplicaIds = stryMutAct_9fa48("21596") ? existingPeerIds && [] : stryMutAct_9fa48("21595") ? false : stryMutAct_9fa48("21594") ? true : (stryCov_9fa48("21594", "21595", "21596"), existingPeerIds || (stryMutAct_9fa48("21597") ? ["Stryker was here"] : (stryCov_9fa48("21597"), [])));
      logger.info(JOINING_LOG_MSG.JOIN_CREATING_WITH_PEERS, stryMutAct_9fa48("21598") ? {} : (stryCov_9fa48("21598"), {
        nodeId: this.nodeId,
        groupId,
        replicaId,
        allReplicaIds,
        peerAddresses: stryMutAct_9fa48("21601") ? peerAddresses && [] : stryMutAct_9fa48("21600") ? false : stryMutAct_9fa48("21599") ? true : (stryCov_9fa48("21599", "21600", "21601"), peerAddresses || (stryMutAct_9fa48("21602") ? ["Stryker was here"] : (stryCov_9fa48("21602"), []))),
        hasMessageRouter: stryMutAct_9fa48("21603") ? !messageRouter : (stryCov_9fa48("21603"), !(stryMutAct_9fa48("21604") ? messageRouter : (stryCov_9fa48("21604"), !messageRouter))),
        messageRouterConnections: stryMutAct_9fa48("21607") ? messageRouter?.getConnectedNodes?.() && STRING.NOT_AVAILABLE : stryMutAct_9fa48("21606") ? false : stryMutAct_9fa48("21605") ? true : (stryCov_9fa48("21605", "21606", "21607"), (stryMutAct_9fa48("21609") ? messageRouter.getConnectedNodes?.() : stryMutAct_9fa48("21608") ? messageRouter?.getConnectedNodes() : (stryCov_9fa48("21608", "21609"), messageRouter?.getConnectedNodes?.())) || STRING.NOT_AVAILABLE)
      }));
      this.delegates.queueJoinServiceReplica(this.delegates.createJoinServiceDescriptor(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, replicaId), stryMutAct_9fa48("21610") ? {} : (stryCov_9fa48("21610"), {
        serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        groupId,
        replicaId,
        replicaIds: allReplicaIds,
        replicaIndex: NUM.ZERO,
        peerAddresses: stryMutAct_9fa48("21613") ? peerAddresses && [] : stryMutAct_9fa48("21612") ? false : stryMutAct_9fa48("21611") ? true : (stryCov_9fa48("21611", "21612", "21613"), peerAddresses || (stryMutAct_9fa48("21614") ? ["Stryker was here"] : (stryCov_9fa48("21614"), []))),
        deferElection: stryMutAct_9fa48("21615") ? false : (stryCov_9fa48("21615"), true),
        isJoiningExistingGroup: stryMutAct_9fa48("21616") ? false : (stryCov_9fa48("21616"), true),
        createDelayMs: NUM.ZERO,
        logEnvelope: LOG_ENVELOPE_DEFAULT,
        logRegistration: LOG_REGISTRATION_DEFAULT
      }));
      await this.delegates.triggerJoinReconciler(JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON);
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const messageGroup = assertCritical(messageGroupServices.get(replicaId), JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED);
      logger.info(JOINING_LOG_MSG.JOIN_SERVICE_INITIALIZED, stryMutAct_9fa48("21617") ? {} : (stryCov_9fa48("21617"), {
        nodeId: this.nodeId,
        groupId,
        replicaId,
        role: messageGroup.role,
        isLeader: messageGroup.isLeader,
        leaderId: messageGroup.leaderId,
        raftState: stryMutAct_9fa48("21618") ? messageGroup.raft.state : (stryCov_9fa48("21618"), messageGroup.raft?.state),
        raftTerm: stryMutAct_9fa48("21619") ? messageGroup.raft.term : (stryCov_9fa48("21619"), messageGroup.raft?.term)
      }));
      logger.info(JOINING_LOG_MSG.JOINED_EXISTING_GROUP, stryMutAct_9fa48("21620") ? {} : (stryCov_9fa48("21620"), {
        nodeId: this.nodeId,
        groupId,
        replicaId,
        hasMessageRouter: stryMutAct_9fa48("21621") ? !messageRouter : (stryCov_9fa48("21621"), !(stryMutAct_9fa48("21622") ? messageRouter : (stryCov_9fa48("21622"), !messageRouter))),
        peerAddressCount: stryMutAct_9fa48("21625") ? peerAddresses?.length && NUM.ZERO : stryMutAct_9fa48("21624") ? false : stryMutAct_9fa48("21623") ? true : (stryCov_9fa48("21623", "21624", "21625"), (stryMutAct_9fa48("21626") ? peerAddresses.length : (stryCov_9fa48("21626"), peerAddresses?.length)) || NUM.ZERO)
      }));
    }
  }
}
export { JoinMessageGroupRuntimeOwner };