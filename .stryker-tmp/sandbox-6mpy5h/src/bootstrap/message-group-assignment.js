/**
 * Message Group Assignment - Strategies for assigning message groups to new nodes.
 * Implements replica movement and self-hosted creation strategies.
 * Requirements: 7.5, 7.6, 7.9
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM, STRING } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { MESSAGE_GROUP_ASSIGNMENT_DEFAULT, MESSAGE_GROUP_ASSIGNMENT_ERROR, MESSAGE_GROUP_ASSIGNMENT_LOG_MSG, MESSAGE_GROUP_ASSIGNMENT_STRATEGY, MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM } from './message-group-assignment-constants.js';

/**
 * MessageGroupAssignment handles determining how new nodes get message group access.
 */
class MessageGroupAssignment {
  /**
   * Create a new MessageGroupAssignment.
   * @param {Object} options - Configuration options.
   * @param {string} options.seedNodeAddress - Seed node address for building addresses.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("15854")) {
      {}
    } else {
      stryCov_9fa48("15854");
      this.seedNodeAddress = stryMutAct_9fa48("15857") ? options.seedNodeAddress && STRING.EMPTY : stryMutAct_9fa48("15856") ? false : stryMutAct_9fa48("15855") ? true : (stryCov_9fa48("15855", "15856", "15857"), options.seedNodeAddress || STRING.EMPTY);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM) : console;
    }
  }

  /**
   * Determine message group assignment for a new node.
   * Strategy 1: Move replica from node with 2+ replicas
   * Strategy 2: Create self-hosted message group (3 replicas on new node)
   * @param {string} newNodeId - New node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Optional assignment filters.
   * @param {Set<string>} [options.excludedReplicaIds] - Replica IDs that are
   *   temporarily unavailable for MOVE_REPLICA selection.
   * @param {Set<string>} [options.excludedSourceNodeIds] - Source nodes that
   *   must not be selected for MOVE_REPLICA assignments.
    * @param {boolean} [options.allowRejoinSingleOwnedGroup=false] - When true,
    *   a durable rejoin may reuse a single existing non-canonical owned group.
   * @return {Object} Assignment instructions.
   */
  determineAssignment(newNodeId, messageGroups, options = {}) {
    if (stryMutAct_9fa48("15858")) {
      {}
    } else {
      stryCov_9fa48("15858");
      this.logger.debug(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.DETERMINING, stryMutAct_9fa48("15859") ? {} : (stryCov_9fa48("15859"), {
        newNodeId,
        messageGroupCount: messageGroups.length,
        excludedReplicaCount: options.excludedReplicaIds instanceof Set ? options.excludedReplicaIds.size : NUM.ZERO
      }));

      // If the joining node already has a message group replica,
      // it is a restarting node. Skip MOVE_REPLICA and go straight
      // to CREATE_SELF_HOSTED so it rejoins its existing group
      // with the same deterministic group ID.
      const existingMembershipGroupId = this.findExistingMembershipGroupId(newNodeId, messageGroups, options);
      if (stryMutAct_9fa48("15861") ? false : stryMutAct_9fa48("15860") ? true : (stryCov_9fa48("15860", "15861"), existingMembershipGroupId)) {
        if (stryMutAct_9fa48("15862")) {
          {}
        } else {
          stryCov_9fa48("15862");
          const newGroupId = existingMembershipGroupId;
          const existingGroup = stryMutAct_9fa48("15865") ? messageGroups.find(group => group?.group_id === newGroupId) && null : stryMutAct_9fa48("15864") ? false : stryMutAct_9fa48("15863") ? true : (stryCov_9fa48("15863", "15864", "15865"), messageGroups.find(stryMutAct_9fa48("15866") ? () => undefined : (stryCov_9fa48("15866"), group => stryMutAct_9fa48("15869") ? group?.group_id !== newGroupId : stryMutAct_9fa48("15868") ? false : stryMutAct_9fa48("15867") ? true : (stryCov_9fa48("15867", "15868", "15869"), (stryMutAct_9fa48("15870") ? group.group_id : (stryCov_9fa48("15870"), group?.group_id)) === newGroupId))) || null);
          const existingReplicas = Array.isArray(stryMutAct_9fa48("15871") ? existingGroup.replicas : (stryCov_9fa48("15871"), existingGroup?.replicas)) ? existingGroup.replicas : stryMutAct_9fa48("15872") ? ["Stryker was here"] : (stryCov_9fa48("15872"), []);
          const startupReplicaIds = stryMutAct_9fa48("15873") ? existingReplicas.map(replica => replica.replica_id) : (stryCov_9fa48("15873"), existingReplicas.filter(stryMutAct_9fa48("15874") ? () => undefined : (stryCov_9fa48("15874"), replica => stryMutAct_9fa48("15877") ? replica?.node_id !== newNodeId : stryMutAct_9fa48("15876") ? false : stryMutAct_9fa48("15875") ? true : (stryCov_9fa48("15875", "15876", "15877"), (stryMutAct_9fa48("15878") ? replica.node_id : (stryCov_9fa48("15878"), replica?.node_id)) === newNodeId))).map(stryMutAct_9fa48("15879") ? () => undefined : (stryCov_9fa48("15879"), replica => replica.replica_id)));
          this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.EXISTING_MEMBERSHIP_DETECTED, stryMutAct_9fa48("15880") ? {} : (stryCov_9fa48("15880"), {
            newNodeId,
            newGroupId
          }));
          return stryMutAct_9fa48("15881") ? {} : (stryCov_9fa48("15881"), {
            strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
            groupId: newGroupId,
            replicaCount: (stryMutAct_9fa48("15885") ? existingReplicas.length <= NUM.ZERO : stryMutAct_9fa48("15884") ? existingReplicas.length >= NUM.ZERO : stryMutAct_9fa48("15883") ? false : stryMutAct_9fa48("15882") ? true : (stryCov_9fa48("15882", "15883", "15884", "15885"), existingReplicas.length > NUM.ZERO)) ? existingReplicas.length : MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT,
            reuseExistingGroup: stryMutAct_9fa48("15886") ? false : (stryCov_9fa48("15886"), true),
            startupReplicaIds
          });
        }
      }

      // Strategy 1: Find a message group with 2+ replicas on the same node
      const excludedSourceNodeIds = new Set(options.excludedSourceNodeIds instanceof Set ? options.excludedSourceNodeIds : stryMutAct_9fa48("15887") ? ["Stryker was here"] : (stryCov_9fa48("15887"), []));
      if (stryMutAct_9fa48("15890") ? typeof newNodeId === 'string' || newNodeId.length > NUM.ZERO : stryMutAct_9fa48("15889") ? false : stryMutAct_9fa48("15888") ? true : (stryCov_9fa48("15888", "15889", "15890"), (stryMutAct_9fa48("15892") ? typeof newNodeId !== 'string' : stryMutAct_9fa48("15891") ? true : (stryCov_9fa48("15891", "15892"), typeof newNodeId === (stryMutAct_9fa48("15893") ? "" : (stryCov_9fa48("15893"), 'string')))) && (stryMutAct_9fa48("15896") ? newNodeId.length <= NUM.ZERO : stryMutAct_9fa48("15895") ? newNodeId.length >= NUM.ZERO : stryMutAct_9fa48("15894") ? true : (stryCov_9fa48("15894", "15895", "15896"), newNodeId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("15897")) {
          {}
        } else {
          stryCov_9fa48("15897");
          excludedSourceNodeIds.add(newNodeId);
        }
      }
      const movableReplica = this.findMovableReplica(messageGroups, stryMutAct_9fa48("15898") ? {} : (stryCov_9fa48("15898"), {
        ...options,
        excludedSourceNodeIds
      }));
      if (stryMutAct_9fa48("15900") ? false : stryMutAct_9fa48("15899") ? true : (stryCov_9fa48("15899", "15900"), movableReplica)) {
        if (stryMutAct_9fa48("15901")) {
          {}
        } else {
          stryCov_9fa48("15901");
          this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.USING_MOVE_REPLICA, stryMutAct_9fa48("15902") ? {} : (stryCov_9fa48("15902"), {
            newNodeId,
            groupId: movableReplica.groupId,
            sourceNodeId: movableReplica.sourceNodeId,
            replicaToMove: movableReplica.replicaId
          }));
          return stryMutAct_9fa48("15903") ? {} : (stryCov_9fa48("15903"), {
            strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA,
            groupId: movableReplica.groupId,
            sourceNodeId: movableReplica.sourceNodeId,
            replicaToMove: movableReplica.replicaId,
            replicaAddresses: movableReplica.replicaAddresses,
            existingPeerIds: movableReplica.peerIds
          });
        }
      }

      // Strategy 2: Create self-hosted message group
      const newGroupId = this.generateGroupId(newNodeId);
      this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.USING_CREATE_SELF_HOSTED, stryMutAct_9fa48("15904") ? {} : (stryCov_9fa48("15904"), {
        newNodeId,
        newGroupId
      }));
      return stryMutAct_9fa48("15905") ? {} : (stryCov_9fa48("15905"), {
        strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
        groupId: newGroupId,
        replicaCount: MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT
      });
    }
  }

  /**
   * Check whether the joining node already has a replica in any
   * existing message group. A node with existing membership is
   * a restarting node and should rejoin its group via
   * CREATE_SELF_HOSTED rather than receiving a MOVE_REPLICA
   * assignment for a different group.
   *
   * Returns true when the node already owns a canonical restart group.
   * This is normally the node-ID-derived self-hosted group, but durable
   * restart ownership can also be an existing replicated control-plane group
   * when the caller explicitly opts into that behavior.
   * @param {string} nodeId - Joining node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Membership detection options.
   * @return {boolean} True when the node's canonical group exists.
   */
  hasExistingMembership(nodeId, messageGroups, options = {}) {
    if (stryMutAct_9fa48("15906")) {
      {}
    } else {
      stryCov_9fa48("15906");
      return stryMutAct_9fa48("15909") ? this.findExistingMembershipGroupId(nodeId, messageGroups, options) === null : stryMutAct_9fa48("15908") ? false : stryMutAct_9fa48("15907") ? true : (stryCov_9fa48("15907", "15908", "15909"), this.findExistingMembershipGroupId(nodeId, messageGroups, options) !== null);
    }
  }

  /**
   * Resolve the canonical restart group already owned by the joining node.
   * @param {string} nodeId - Joining node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Membership detection options.
   * @return {string|null} Existing canonical group ID or null.
   */
  findExistingMembershipGroupId(nodeId, messageGroups, options = {}) {
    if (stryMutAct_9fa48("15910")) {
      {}
    } else {
      stryCov_9fa48("15910");
      if (stryMutAct_9fa48("15913") ? typeof nodeId !== 'string' && nodeId.length === NUM.ZERO : stryMutAct_9fa48("15912") ? false : stryMutAct_9fa48("15911") ? true : (stryCov_9fa48("15911", "15912", "15913"), (stryMutAct_9fa48("15915") ? typeof nodeId === 'string' : stryMutAct_9fa48("15914") ? false : (stryCov_9fa48("15914", "15915"), typeof nodeId !== (stryMutAct_9fa48("15916") ? "" : (stryCov_9fa48("15916"), 'string')))) || (stryMutAct_9fa48("15918") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("15917") ? false : (stryCov_9fa48("15917", "15918"), nodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("15919")) {
          {}
        } else {
          stryCov_9fa48("15919");
          return null;
        }
      }
      const canonicalGroupId = this.generateGroupId(nodeId);
      for (const group of messageGroups) {
        if (stryMutAct_9fa48("15920")) {
          {}
        } else {
          stryCov_9fa48("15920");
          if (stryMutAct_9fa48("15923") ? group.group_id !== canonicalGroupId : stryMutAct_9fa48("15922") ? false : stryMutAct_9fa48("15921") ? true : (stryCov_9fa48("15921", "15922", "15923"), group.group_id === canonicalGroupId)) {
            if (stryMutAct_9fa48("15924")) {
              {}
            } else {
              stryCov_9fa48("15924");
              return canonicalGroupId;
            }
          }
        }
      }
      const ownedGroupIds = stryMutAct_9fa48("15925") ? ["Stryker was here"] : (stryCov_9fa48("15925"), []);
      const fullyOwnedGroupIds = stryMutAct_9fa48("15926") ? ["Stryker was here"] : (stryCov_9fa48("15926"), []);
      for (const group of messageGroups) {
        if (stryMutAct_9fa48("15927")) {
          {}
        } else {
          stryCov_9fa48("15927");
          const replicas = Array.isArray(stryMutAct_9fa48("15928") ? group.replicas : (stryCov_9fa48("15928"), group?.replicas)) ? group.replicas : stryMutAct_9fa48("15929") ? ["Stryker was here"] : (stryCov_9fa48("15929"), []);
          const ownedReplicaCount = stryMutAct_9fa48("15930") ? replicas.length : (stryCov_9fa48("15930"), replicas.filter(stryMutAct_9fa48("15931") ? () => undefined : (stryCov_9fa48("15931"), replica => stryMutAct_9fa48("15934") ? replica?.node_id !== nodeId : stryMutAct_9fa48("15933") ? false : stryMutAct_9fa48("15932") ? true : (stryCov_9fa48("15932", "15933", "15934"), (stryMutAct_9fa48("15935") ? replica.node_id : (stryCov_9fa48("15935"), replica?.node_id)) === nodeId))).length);
          if (stryMutAct_9fa48("15939") ? ownedReplicaCount <= NUM.ZERO : stryMutAct_9fa48("15938") ? ownedReplicaCount >= NUM.ZERO : stryMutAct_9fa48("15937") ? false : stryMutAct_9fa48("15936") ? true : (stryCov_9fa48("15936", "15937", "15938", "15939"), ownedReplicaCount > NUM.ZERO)) {
            if (stryMutAct_9fa48("15940")) {
              {}
            } else {
              stryCov_9fa48("15940");
              ownedGroupIds.push(stryMutAct_9fa48("15943") ? group.group_id && null : stryMutAct_9fa48("15942") ? false : stryMutAct_9fa48("15941") ? true : (stryCov_9fa48("15941", "15942", "15943"), group.group_id || null));
            }
          }
          if (stryMutAct_9fa48("15947") ? ownedReplicaCount < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT : stryMutAct_9fa48("15946") ? ownedReplicaCount > MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT : stryMutAct_9fa48("15945") ? false : stryMutAct_9fa48("15944") ? true : (stryCov_9fa48("15944", "15945", "15946", "15947"), ownedReplicaCount >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT)) {
            if (stryMutAct_9fa48("15948")) {
              {}
            } else {
              stryCov_9fa48("15948");
              fullyOwnedGroupIds.push(stryMutAct_9fa48("15951") ? group.group_id && null : stryMutAct_9fa48("15950") ? false : stryMutAct_9fa48("15949") ? true : (stryCov_9fa48("15949", "15950", "15951"), group.group_id || null));
            }
          }
        }
      }
      if (stryMutAct_9fa48("15955") ? fullyOwnedGroupIds.length <= NUM.ZERO : stryMutAct_9fa48("15954") ? fullyOwnedGroupIds.length >= NUM.ZERO : stryMutAct_9fa48("15953") ? false : stryMutAct_9fa48("15952") ? true : (stryCov_9fa48("15952", "15953", "15954", "15955"), fullyOwnedGroupIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("15956")) {
          {}
        } else {
          stryCov_9fa48("15956");
          return fullyOwnedGroupIds[NUM.ZERO];
        }
      }
      if (stryMutAct_9fa48("15959") ? options.allowRejoinSingleOwnedGroup === true || ownedGroupIds.length === NUM.ONE : stryMutAct_9fa48("15958") ? false : stryMutAct_9fa48("15957") ? true : (stryCov_9fa48("15957", "15958", "15959"), (stryMutAct_9fa48("15961") ? options.allowRejoinSingleOwnedGroup !== true : stryMutAct_9fa48("15960") ? true : (stryCov_9fa48("15960", "15961"), options.allowRejoinSingleOwnedGroup === (stryMutAct_9fa48("15962") ? false : (stryCov_9fa48("15962"), true)))) && (stryMutAct_9fa48("15964") ? ownedGroupIds.length !== NUM.ONE : stryMutAct_9fa48("15963") ? true : (stryCov_9fa48("15963", "15964"), ownedGroupIds.length === NUM.ONE)))) {
        if (stryMutAct_9fa48("15965")) {
          {}
        } else {
          stryCov_9fa48("15965");
          return ownedGroupIds[NUM.ZERO];
        }
      }
      return null;
    }
  }

  /**
   * Find a message group with 2+ replicas on the same node.
   * @param {Array<Object>} messageGroups - Message groups to search.
   * @param {Object} [options={}] - Optional candidate filters.
   * @param {Set<string>} [options.excludedReplicaIds] - Replica IDs excluded
   *   from MOVE_REPLICA consideration.
   * @param {Set<string>} [options.excludedSourceNodeIds] - Source nodes
   *   excluded from MOVE_REPLICA consideration.
   * @return {Object|null} Movable replica info or null.
   */
  findMovableReplica(messageGroups, options = {}) {
    if (stryMutAct_9fa48("15966")) {
      {}
    } else {
      stryCov_9fa48("15966");
      const excludedReplicaIds = options.excludedReplicaIds instanceof Set ? options.excludedReplicaIds : null;
      const excludedSourceNodeIds = options.excludedSourceNodeIds instanceof Set ? options.excludedSourceNodeIds : null;
      for (const group of messageGroups) {
        if (stryMutAct_9fa48("15967")) {
          {}
        } else {
          stryCov_9fa48("15967");
          const replicas = stryMutAct_9fa48("15970") ? group.replicas && [] : stryMutAct_9fa48("15969") ? false : stryMutAct_9fa48("15968") ? true : (stryCov_9fa48("15968", "15969", "15970"), group.replicas || (stryMutAct_9fa48("15971") ? ["Stryker was here"] : (stryCov_9fa48("15971"), [])));

          // Skip groups with fewer than 3 replicas
          if (stryMutAct_9fa48("15975") ? replicas.length >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_FOR_MOVE : stryMutAct_9fa48("15974") ? replicas.length <= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_FOR_MOVE : stryMutAct_9fa48("15973") ? false : stryMutAct_9fa48("15972") ? true : (stryCov_9fa48("15972", "15973", "15974", "15975"), replicas.length < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_FOR_MOVE)) {
            if (stryMutAct_9fa48("15976")) {
              {}
            } else {
              stryCov_9fa48("15976");
              continue;
            }
          }

          // Count replicas per node
          const selectableReplicas = excludedReplicaIds ? stryMutAct_9fa48("15977") ? replicas : (stryCov_9fa48("15977"), replicas.filter(stryMutAct_9fa48("15978") ? () => undefined : (stryCov_9fa48("15978"), replica => stryMutAct_9fa48("15979") ? excludedReplicaIds.has(replica.replica_id) : (stryCov_9fa48("15979"), !excludedReplicaIds.has(replica.replica_id))))) : replicas;

          // If reservations leave fewer than 2 replicas on every node, this
          // group cannot safely provide another MOVE_REPLICA candidate.
          const replicasByNode = this.countReplicasByNode(selectableReplicas);

          // Find node with 2+ replicas
          for (const [nodeId, nodeReplicas] of replicasByNode) {
            if (stryMutAct_9fa48("15980")) {
              {}
            } else {
              stryCov_9fa48("15980");
              if (stryMutAct_9fa48("15983") ? excludedSourceNodeIds.has(nodeId) : stryMutAct_9fa48("15982") ? false : stryMutAct_9fa48("15981") ? true : (stryCov_9fa48("15981", "15982", "15983"), excludedSourceNodeIds?.has(nodeId))) {
                if (stryMutAct_9fa48("15984")) {
                  {}
                } else {
                  stryCov_9fa48("15984");
                  continue;
                }
              }
              if (stryMutAct_9fa48("15988") ? nodeReplicas.length < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_ON_NODE_FOR_MOVE : stryMutAct_9fa48("15987") ? nodeReplicas.length > MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_ON_NODE_FOR_MOVE : stryMutAct_9fa48("15986") ? false : stryMutAct_9fa48("15985") ? true : (stryCov_9fa48("15985", "15986", "15987", "15988"), nodeReplicas.length >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_ON_NODE_FOR_MOVE)) {
                if (stryMutAct_9fa48("15989")) {
                  {}
                } else {
                  stryCov_9fa48("15989");
                  const nonLeaderReplicas = stryMutAct_9fa48("15990") ? nodeReplicas : (stryCov_9fa48("15990"), nodeReplicas.filter(stryMutAct_9fa48("15991") ? () => undefined : (stryCov_9fa48("15991"), replica => stryMutAct_9fa48("15994") ? replica.raft_role === RAFT_ROLE.LEADER : stryMutAct_9fa48("15993") ? false : stryMutAct_9fa48("15992") ? true : (stryCov_9fa48("15992", "15993", "15994"), replica.raft_role !== RAFT_ROLE.LEADER))));
                  const replicaToMove = (stryMutAct_9fa48("15998") ? nonLeaderReplicas.length <= NUM.ZERO : stryMutAct_9fa48("15997") ? nonLeaderReplicas.length >= NUM.ZERO : stryMutAct_9fa48("15996") ? false : stryMutAct_9fa48("15995") ? true : (stryCov_9fa48("15995", "15996", "15997", "15998"), nonLeaderReplicas.length > NUM.ZERO)) ? nonLeaderReplicas[NUM.ZERO] : nodeReplicas[NUM.ZERO];
                  return stryMutAct_9fa48("15999") ? {} : (stryCov_9fa48("15999"), {
                    groupId: group.group_id,
                    sourceNodeId: nodeId,
                    replicaId: replicaToMove.replica_id,
                    replicaAddresses: replicas.map(stryMutAct_9fa48("16000") ? () => undefined : (stryCov_9fa48("16000"), r => r.address)),
                    peerIds: replicas.map(stryMutAct_9fa48("16001") ? () => undefined : (stryCov_9fa48("16001"), r => r.replica_id))
                  });
                }
              }
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Count replicas by node.
   * @param {Array<Object>} replicas - Replicas to count.
   * @return {Map<string, Array<Object>>} Map of nodeId to replicas.
   */
  countReplicasByNode(replicas) {
    if (stryMutAct_9fa48("16002")) {
      {}
    } else {
      stryCov_9fa48("16002");
      const replicasByNode = new Map();
      for (const replica of replicas) {
        if (stryMutAct_9fa48("16003")) {
          {}
        } else {
          stryCov_9fa48("16003");
          const nodeId = replica.node_id;
          if (stryMutAct_9fa48("16006") ? false : stryMutAct_9fa48("16005") ? true : stryMutAct_9fa48("16004") ? replicasByNode.has(nodeId) : (stryCov_9fa48("16004", "16005", "16006"), !replicasByNode.has(nodeId))) {
            if (stryMutAct_9fa48("16007")) {
              {}
            } else {
              stryCov_9fa48("16007");
              replicasByNode.set(nodeId, stryMutAct_9fa48("16008") ? ["Stryker was here"] : (stryCov_9fa48("16008"), []));
            }
          }
          replicasByNode.get(nodeId).push(replica);
        }
      }
      return replicasByNode;
    }
  }

  /**
   * Generate a message group ID for a new node.
   * @param {string} nodeId - Node ID.
   * @return {string} Generated group ID.
   */
  generateGroupId(nodeId) {
    if (stryMutAct_9fa48("16009")) {
      {}
    } else {
      stryCov_9fa48("16009");
      const normalizedNodeId = (stryMutAct_9fa48("16012") ? typeof nodeId !== 'string' : stryMutAct_9fa48("16011") ? false : stryMutAct_9fa48("16010") ? true : (stryCov_9fa48("16010", "16011", "16012"), typeof nodeId === (stryMutAct_9fa48("16013") ? "" : (stryCov_9fa48("16013"), 'string')))) ? nodeId.replace(stryMutAct_9fa48("16014") ? /[a-zA-Z0-9]/g : (stryCov_9fa48("16014"), /[^a-zA-Z0-9]/g), STRING.EMPTY) : STRING.EMPTY;
      if (stryMutAct_9fa48("16017") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("16016") ? false : stryMutAct_9fa48("16015") ? true : (stryCov_9fa48("16015", "16016", "16017"), normalizedNodeId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("16018")) {
          {}
        } else {
          stryCov_9fa48("16018");
          return (stryMutAct_9fa48("16019") ? `` : (stryCov_9fa48("16019"), `${MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX}`)) + MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_FALLBACK;
        }
      }
      const headLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_HEAD_LENGTH;
      const tailLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_TAIL_LENGTH;
      const groupPrefix = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX;
      const separator = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_SEGMENT_SEPARATOR;
      const headSegment = stryMutAct_9fa48("16020") ? normalizedNodeId : (stryCov_9fa48("16020"), normalizedNodeId.slice(NUM.ZERO, headLength));
      if (stryMutAct_9fa48("16024") ? normalizedNodeId.length > headLength : stryMutAct_9fa48("16023") ? normalizedNodeId.length < headLength : stryMutAct_9fa48("16022") ? false : stryMutAct_9fa48("16021") ? true : (stryCov_9fa48("16021", "16022", "16023", "16024"), normalizedNodeId.length <= headLength)) {
        if (stryMutAct_9fa48("16025")) {
          {}
        } else {
          stryCov_9fa48("16025");
          return stryMutAct_9fa48("16026") ? `` : (stryCov_9fa48("16026"), `${groupPrefix}${headSegment}`);
        }
      }
      const tailSegment = stryMutAct_9fa48("16027") ? normalizedNodeId : (stryCov_9fa48("16027"), normalizedNodeId.slice(stryMutAct_9fa48("16028") ? +tailLength : (stryCov_9fa48("16028"), -tailLength)));
      return stryMutAct_9fa48("16029") ? `` : (stryCov_9fa48("16029"), `${groupPrefix}${headSegment}${separator}${tailSegment}`);
    }
  }

  /**
   * Generate replica IDs for a new self-hosted message group.
   * @param {string} groupId - Message group ID.
   * @param {number} count - Number of replicas (default 3).
   * @return {Array<string>} Replica IDs.
   */
  generateReplicaIds(groupId, count = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT) {
    if (stryMutAct_9fa48("16030")) {
      {}
    } else {
      stryCov_9fa48("16030");
      const replicaIds = stryMutAct_9fa48("16031") ? ["Stryker was here"] : (stryCov_9fa48("16031"), []);
      for (let i = NUM.ZERO; stryMutAct_9fa48("16034") ? i >= count : stryMutAct_9fa48("16033") ? i <= count : stryMutAct_9fa48("16032") ? false : (stryCov_9fa48("16032", "16033", "16034"), i < count); stryMutAct_9fa48("16035") ? i-- : (stryCov_9fa48("16035"), i++)) {
        if (stryMutAct_9fa48("16036")) {
          {}
        } else {
          stryCov_9fa48("16036");
          replicaIds.push(stryMutAct_9fa48("16037") ? `` : (stryCov_9fa48("16037"), `${groupId}-r${i}`));
        }
      }
      return replicaIds;
    }
  }

  /**
   * Build unified replica addresses for Raft communication.
   * All addresses use the unified format: ${nodeId}/${entityType}/${entityId}
   * @param {string} nodeId - Node ID hosting the replicas.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @param {string} entityType - Entity type (e.g., 'message-group', 'partition').
   * @return {Array<string>} Unified replica addresses.
   */
  buildReplicaAddresses(nodeId, replicaIds, entityType = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.DEFAULT_ENTITY_TYPE) {
    if (stryMutAct_9fa48("16038")) {
      {}
    } else {
      stryCov_9fa48("16038");
      return replicaIds.map(stryMutAct_9fa48("16039") ? () => undefined : (stryCov_9fa48("16039"), id => stryMutAct_9fa48("16040") ? `` : (stryCov_9fa48("16040"), `${nodeId}/${entityType}/${id}`)));
    }
  }

  /**
   * Validate assignment instructions.
   * @param {Object} assignment - Assignment to validate.
   * @return {Object} Validation result with isValid and errors.
   */
  validateAssignment(assignment) {
    if (stryMutAct_9fa48("16041")) {
      {}
    } else {
      stryCov_9fa48("16041");
      const errors = stryMutAct_9fa48("16042") ? ["Stryker was here"] : (stryCov_9fa48("16042"), []);
      if (stryMutAct_9fa48("16045") ? false : stryMutAct_9fa48("16044") ? true : stryMutAct_9fa48("16043") ? assignment : (stryCov_9fa48("16043", "16044", "16045"), !assignment)) {
        if (stryMutAct_9fa48("16046")) {
          {}
        } else {
          stryCov_9fa48("16046");
          return stryMutAct_9fa48("16047") ? {} : (stryCov_9fa48("16047"), {
            isValid: stryMutAct_9fa48("16048") ? true : (stryCov_9fa48("16048"), false),
            errors: stryMutAct_9fa48("16049") ? [] : (stryCov_9fa48("16049"), [MESSAGE_GROUP_ASSIGNMENT_ERROR.ASSIGNMENT_REQUIRED])
          });
        }
      }
      if (stryMutAct_9fa48("16052") ? false : stryMutAct_9fa48("16051") ? true : stryMutAct_9fa48("16050") ? assignment.strategy : (stryCov_9fa48("16050", "16051", "16052"), !assignment.strategy)) {
        if (stryMutAct_9fa48("16053")) {
          {}
        } else {
          stryCov_9fa48("16053");
          errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.STRATEGY_REQUIRED);
        }
      } else if (stryMutAct_9fa48("16056") ? false : stryMutAct_9fa48("16055") ? true : stryMutAct_9fa48("16054") ? Object.values(MESSAGE_GROUP_ASSIGNMENT_STRATEGY).includes(assignment.strategy) : (stryCov_9fa48("16054", "16055", "16056"), !Object.values(MESSAGE_GROUP_ASSIGNMENT_STRATEGY).includes(assignment.strategy))) {
        if (stryMutAct_9fa48("16057")) {
          {}
        } else {
          stryCov_9fa48("16057");
          errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.invalidStrategy(assignment.strategy));
        }
      }
      if (stryMutAct_9fa48("16060") ? false : stryMutAct_9fa48("16059") ? true : stryMutAct_9fa48("16058") ? assignment.groupId : (stryCov_9fa48("16058", "16059", "16060"), !assignment.groupId)) {
        if (stryMutAct_9fa48("16061")) {
          {}
        } else {
          stryCov_9fa48("16061");
          errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.GROUP_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("16064") ? assignment.strategy !== MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA : stryMutAct_9fa48("16063") ? false : stryMutAct_9fa48("16062") ? true : (stryCov_9fa48("16062", "16063", "16064"), assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA)) {
        if (stryMutAct_9fa48("16065")) {
          {}
        } else {
          stryCov_9fa48("16065");
          if (stryMutAct_9fa48("16068") ? false : stryMutAct_9fa48("16067") ? true : stryMutAct_9fa48("16066") ? assignment.sourceNodeId : (stryCov_9fa48("16066", "16067", "16068"), !assignment.sourceNodeId)) {
            if (stryMutAct_9fa48("16069")) {
              {}
            } else {
              stryCov_9fa48("16069");
              errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.SOURCE_NODE_REQUIRED);
            }
          }
          if (stryMutAct_9fa48("16072") ? false : stryMutAct_9fa48("16071") ? true : stryMutAct_9fa48("16070") ? assignment.replicaToMove : (stryCov_9fa48("16070", "16071", "16072"), !assignment.replicaToMove)) {
            if (stryMutAct_9fa48("16073")) {
              {}
            } else {
              stryCov_9fa48("16073");
              errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_TO_MOVE_REQUIRED);
            }
          }
          if (stryMutAct_9fa48("16076") ? !assignment.replicaAddresses && assignment.replicaAddresses.length === NUM.ZERO : stryMutAct_9fa48("16075") ? false : stryMutAct_9fa48("16074") ? true : (stryCov_9fa48("16074", "16075", "16076"), (stryMutAct_9fa48("16077") ? assignment.replicaAddresses : (stryCov_9fa48("16077"), !assignment.replicaAddresses)) || (stryMutAct_9fa48("16079") ? assignment.replicaAddresses.length !== NUM.ZERO : stryMutAct_9fa48("16078") ? false : (stryCov_9fa48("16078", "16079"), assignment.replicaAddresses.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("16080")) {
              {}
            } else {
              stryCov_9fa48("16080");
              errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_ADDRESSES_REQUIRED);
            }
          }
        }
      }
      if (stryMutAct_9fa48("16083") ? assignment.strategy !== MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED : stryMutAct_9fa48("16082") ? false : stryMutAct_9fa48("16081") ? true : (stryCov_9fa48("16081", "16082", "16083"), assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED)) {
        if (stryMutAct_9fa48("16084")) {
          {}
        } else {
          stryCov_9fa48("16084");
          if (stryMutAct_9fa48("16087") ? !assignment.replicaCount && assignment.replicaCount < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT : stryMutAct_9fa48("16086") ? false : stryMutAct_9fa48("16085") ? true : (stryCov_9fa48("16085", "16086", "16087"), (stryMutAct_9fa48("16088") ? assignment.replicaCount : (stryCov_9fa48("16088"), !assignment.replicaCount)) || (stryMutAct_9fa48("16091") ? assignment.replicaCount >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT : stryMutAct_9fa48("16090") ? assignment.replicaCount <= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT : stryMutAct_9fa48("16089") ? false : (stryCov_9fa48("16089", "16090", "16091"), assignment.replicaCount < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT)))) {
            if (stryMutAct_9fa48("16092")) {
              {}
            } else {
              stryCov_9fa48("16092");
              errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("16095") ? assignment.replicaCount % MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_ODD_MODULO !== NUM.ZERO : stryMutAct_9fa48("16094") ? false : stryMutAct_9fa48("16093") ? true : (stryCov_9fa48("16093", "16094", "16095"), (stryMutAct_9fa48("16096") ? assignment.replicaCount * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_ODD_MODULO : (stryCov_9fa48("16096"), assignment.replicaCount % MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_ODD_MODULO)) === NUM.ZERO)) {
            if (stryMutAct_9fa48("16097")) {
              {}
            } else {
              stryCov_9fa48("16097");
              errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_ODD);
            }
          }
        }
      }
      return stryMutAct_9fa48("16098") ? {} : (stryCov_9fa48("16098"), {
        isValid: stryMutAct_9fa48("16101") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("16100") ? false : stryMutAct_9fa48("16099") ? true : (stryCov_9fa48("16099", "16100", "16101"), errors.length === NUM.ZERO),
        errors
      });
    }
  }

  /**
   * Calculate optimal message group distribution for a cluster.
   * @param {number} nodeCount - Number of nodes in cluster.
   * @return {Object} Distribution info.
   */
  calculateOptimalDistribution(nodeCount) {
    if (stryMutAct_9fa48("16102")) {
      {}
    } else {
      stryCov_9fa48("16102");
      // Each message group serves up to 3 nodes
      const messageGroupsNeeded = Math.ceil(stryMutAct_9fa48("16103") ? nodeCount * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.DISTRIBUTION_NODES_PER_GROUP : (stryCov_9fa48("16103"), nodeCount / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.DISTRIBUTION_NODES_PER_GROUP));

      // Each message group has exactly 3 replicas
      const totalReplicas = stryMutAct_9fa48("16104") ? messageGroupsNeeded / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT : (stryCov_9fa48("16104"), messageGroupsNeeded * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT);

      // Average replicas per node
      const avgReplicasPerNode = stryMutAct_9fa48("16105") ? totalReplicas * nodeCount : (stryCov_9fa48("16105"), totalReplicas / nodeCount);
      return stryMutAct_9fa48("16106") ? {} : (stryCov_9fa48("16106"), {
        nodeCount,
        messageGroupsNeeded,
        totalReplicas,
        avgReplicasPerNode: stryMutAct_9fa48("16107") ? Math.round(avgReplicasPerNode * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_MULTIPLIER) * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_DIVISOR : (stryCov_9fa48("16107"), Math.round(stryMutAct_9fa48("16108") ? avgReplicasPerNode / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_MULTIPLIER : (stryCov_9fa48("16108"), avgReplicasPerNode * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_MULTIPLIER)) / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_DIVISOR)
      });
    }
  }
}
export { MessageGroupAssignment, MESSAGE_GROUP_ASSIGNMENT_STRATEGY };