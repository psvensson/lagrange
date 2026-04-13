/**
 * Seed Message Groups Phase — handles Phase 2 of seed bootstrap:
 * creating initial message group replicas with deferred elections.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
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
import { MessageGroupService } from '../../message-group/message-group-service.js';
import { assertCritical } from '../../utils/assert.js';
import { BOOTSTRAP_DEFAULT, BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG, BOOTSTRAP_UNIFIED_RECONCILE } from '../bootstrap-constants.js';
import { INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS } from '../system-table-schemas-constants.js';
import { ADDRESS, ENTITY_TYPE, NUM, SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_STATE, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';

/**
 * Format missing-replica assertion message for bootstrap lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatReplicaMissingAtStart = stryMutAct_9fa48("26753") ? () => undefined : (stryCov_9fa48("26753"), (() => {
  const formatReplicaMissingAtStart = replicaId => stryMutAct_9fa48("26754") ? `` : (stryCov_9fa48("26754"), `Message-group replica ${replicaId} missing at start`);
  return formatReplicaMissingAtStart;
})());

/**
 * Handles the message-groups phase of seed bootstrap.
 */
class SeedMessageGroupsPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("26755")) {
      {}
    } else {
      stryCov_9fa48("26755");
      this.delegates = stryMutAct_9fa48("26758") ? options.delegates && {} : stryMutAct_9fa48("26757") ? false : stryMutAct_9fa48("26756") ? true : (stryCov_9fa48("26756", "26757", "26758"), options.delegates || {});
    }
  }

  /**
   * Phase 2: Message group creation.
   * Create initial message group with 3 replicas on seed node.
   * Elections are DEFERRED until after partitions are created.
   * @return {Promise<void>}
   */
  async phaseMessageGroups() {
    if (stryMutAct_9fa48("26759")) {
      {}
    } else {
      stryCov_9fa48("26759");
      const d = this.delegates;
      const logger = d.getLogger();
      const config = d.getConfig();
      const groupId = INITIAL_MESSAGE_GROUP_ID;
      const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;
      const replicaStaggerDelayMs = config.replicaStaggerDelayMs;
      logger.debug(BOOTSTRAP_LOG_MSG.CREATING_MESSAGE_GROUP, stryMutAct_9fa48("26760") ? {} : (stryCov_9fa48("26760"), {
        groupId,
        replicaCount: replicaIds.length,
        nodeId: d.getNodeId()
      }));
      d.resetMessageGroupReplicas();
      const nodeId = d.getNodeId();
      const peerAddresses = replicaIds.map(stryMutAct_9fa48("26761") ? () => undefined : (stryCov_9fa48("26761"), replicaId => (stryMutAct_9fa48("26762") ? `` : (stryCov_9fa48("26762"), `${nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26763") ? `` : (stryCov_9fa48("26763"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`))));
      for (let index = NUM.ZERO; stryMutAct_9fa48("26766") ? index >= replicaIds.length : stryMutAct_9fa48("26765") ? index <= replicaIds.length : stryMutAct_9fa48("26764") ? false : (stryCov_9fa48("26764", "26765", "26766"), index < replicaIds.length); stryMutAct_9fa48("26767") ? index-- : (stryCov_9fa48("26767"), index++)) {
        if (stryMutAct_9fa48("26768")) {
          {}
        } else {
          stryCov_9fa48("26768");
          const replicaId = replicaIds[index];
          d.queueBootstrapServiceReplica(d.createBootstrapServiceDescriptor(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, replicaId), stryMutAct_9fa48("26769") ? {} : (stryCov_9fa48("26769"), {
            serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
            groupId,
            replicaId,
            replicaIds,
            replicaIndex: index,
            peerAddresses,
            deferElection: stryMutAct_9fa48("26770") ? false : (stryCov_9fa48("26770"), true),
            createDelayMs: (stryMutAct_9fa48("26774") ? index <= NUM.ZERO : stryMutAct_9fa48("26773") ? index >= NUM.ZERO : stryMutAct_9fa48("26772") ? false : stryMutAct_9fa48("26771") ? true : (stryCov_9fa48("26771", "26772", "26773", "26774"), index > NUM.ZERO)) ? stryMutAct_9fa48("26775") ? index / replicaStaggerDelayMs : (stryCov_9fa48("26775"), index * replicaStaggerDelayMs) : NUM.ZERO
          }));
        }
      }
      await d.triggerBootstrapReconciler(BOOTSTRAP_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON);
      d.incrementMessageGroupsCreated();
      logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUPS_CREATED_DEFERRED, stryMutAct_9fa48("26776") ? {} : (stryCov_9fa48("26776"), {
        groupId,
        replicaCount: d.getMessageGroupReplicas().length,
        nodeId: d.getNodeId()
      }));
    }
  }

  /**
   * Unified lifecycle create hook for message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createBootstrapMessageGroupReplica(context) {
    if (stryMutAct_9fa48("26777")) {
      {}
    } else {
      stryCov_9fa48("26777");
      const d = this.delegates;
      const logger = d.getLogger();
      const definition = stryMutAct_9fa48("26780") ? context?.definition && {} : stryMutAct_9fa48("26779") ? false : stryMutAct_9fa48("26778") ? true : (stryCov_9fa48("26778", "26779", "26780"), (stryMutAct_9fa48("26781") ? context.definition : (stryCov_9fa48("26781"), context?.definition)) || {});
      const directOptions = stryMutAct_9fa48("26784") ? context?.replicaOptions && null : stryMutAct_9fa48("26783") ? false : stryMutAct_9fa48("26782") ? true : (stryCov_9fa48("26782", "26783", "26784"), (stryMutAct_9fa48("26785") ? context.replicaOptions : (stryCov_9fa48("26785"), context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("26788") ? directOptions?.replicaId && definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("26787") ? false : stryMutAct_9fa48("26786") ? true : (stryCov_9fa48("26786", "26787", "26788"), (stryMutAct_9fa48("26789") ? directOptions.replicaId : (stryCov_9fa48("26789"), directOptions?.replicaId)) || definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]);
      const options = stryMutAct_9fa48("26792") ? directOptions && d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("26791") ? false : stryMutAct_9fa48("26790") ? true : (stryCov_9fa48("26790", "26791", "26792"), directOptions || d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      if (stryMutAct_9fa48("26794") ? false : stryMutAct_9fa48("26793") ? true : (stryCov_9fa48("26793", "26794"), d.getMessageGroupServices().has(options.replicaId))) {
        if (stryMutAct_9fa48("26795")) {
          {}
        } else {
          stryCov_9fa48("26795");
          return stryMutAct_9fa48("26796") ? {} : (stryCov_9fa48("26796"), {
            status: SERVICE_LIFECYCLE_STATE.CREATED
          });
        }
      }
      if (stryMutAct_9fa48("26800") ? options.createDelayMs <= NUM.ZERO : stryMutAct_9fa48("26799") ? options.createDelayMs >= NUM.ZERO : stryMutAct_9fa48("26798") ? false : stryMutAct_9fa48("26797") ? true : (stryCov_9fa48("26797", "26798", "26799", "26800"), options.createDelayMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("26801")) {
          {}
        } else {
          stryCov_9fa48("26801");
          await d.sleep(options.createDelayMs);
        }
      }
      const messageGroup = new MessageGroupService(stryMutAct_9fa48("26802") ? {} : (stryCov_9fa48("26802"), {
        groupId: options.groupId,
        replicaId: options.replicaId,
        nodeId: d.getNodeId(),
        replicaIds: options.replicaIds,
        peerAddresses: options.peerAddresses,
        transport: d.getMessageRouter(),
        deferElection: Boolean(options.deferElection),
        bootstrapReadinessState: (stryMutAct_9fa48("26805") ? typeof d.getBootstrapReadinessState !== 'function' : stryMutAct_9fa48("26804") ? false : stryMutAct_9fa48("26803") ? true : (stryCov_9fa48("26803", "26804", "26805"), typeof d.getBootstrapReadinessState === (stryMutAct_9fa48("26806") ? "" : (stryCov_9fa48("26806"), 'function')))) ? d.getBootstrapReadinessState() : null
      }));
      const unifiedAddress = (stryMutAct_9fa48("26807") ? `` : (stryCov_9fa48("26807"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26808") ? `` : (stryCov_9fa48("26808"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26809") ? `` : (stryCov_9fa48("26809"), `${options.replicaId}`));
      d.getMessageRouter().register(unifiedAddress, envelope => {
        if (stryMutAct_9fa48("26810")) {
          {}
        } else {
          stryCov_9fa48("26810");
          return messageGroup.receiveMessage(envelope);
        }
      });
      await messageGroup.initialize();
      d.getMessageGroupServices().set(options.replicaId, messageGroup);
      d.pushMessageGroupReplica(messageGroup);
      d.incrementServicesCreated();
      logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, stryMutAct_9fa48("26811") ? {} : (stryCov_9fa48("26811"), {
        groupId: options.groupId,
        replicaId: options.replicaId,
        replicaIndex: options.replicaIndex,
        nodeId: d.getNodeId()
      }));
      return stryMutAct_9fa48("26812") ? {} : (stryCov_9fa48("26812"), {
        status: SERVICE_LIFECYCLE_STATE.CREATED
      });
    }
  }

  /**
   * Unified lifecycle start hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startBootstrapMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("26813")) {
      {}
    } else {
      stryCov_9fa48("26813");
      const d = this.delegates;
      const directOptions = stryMutAct_9fa48("26816") ? _context?.replicaOptions && null : stryMutAct_9fa48("26815") ? false : stryMutAct_9fa48("26814") ? true : (stryCov_9fa48("26814", "26815", "26816"), (stryMutAct_9fa48("26817") ? _context.replicaOptions : (stryCov_9fa48("26817"), _context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("26820") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("26819") ? false : stryMutAct_9fa48("26818") ? true : (stryCov_9fa48("26818", "26819", "26820"), (stryMutAct_9fa48("26822") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("26821") ? false : (stryCov_9fa48("26821", "26822"), (stryMutAct_9fa48("26823") ? directOptions.replicaId : (stryCov_9fa48("26823"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("26826") ? directOptions && d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("26825") ? false : stryMutAct_9fa48("26824") ? true : (stryCov_9fa48("26824", "26825", "26826"), directOptions || d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      const messageGroup = d.getMessageGroupServices().get(options.replicaId);
      assertCritical(messageGroup, formatReplicaMissingAtStart(options.replicaId));
      if (stryMutAct_9fa48("26829") ? false : stryMutAct_9fa48("26828") ? true : stryMutAct_9fa48("26827") ? options.deferElection : (stryCov_9fa48("26827", "26828", "26829"), !options.deferElection)) {
        if (stryMutAct_9fa48("26830")) {
          {}
        } else {
          stryCov_9fa48("26830");
          messageGroup.startElection();
        }
      }
      return stryMutAct_9fa48("26831") ? {} : (stryCov_9fa48("26831"), {
        status: SERVICE_LIFECYCLE_STATE.RUNNING,
        deferred: Boolean(options.deferElection)
      });
    }
  }

  /**
   * Unified lifecycle stop hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopBootstrapMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("26832")) {
      {}
    } else {
      stryCov_9fa48("26832");
      const d = this.delegates;
      const directOptions = stryMutAct_9fa48("26835") ? _context?.replicaOptions && null : stryMutAct_9fa48("26834") ? false : stryMutAct_9fa48("26833") ? true : (stryCov_9fa48("26833", "26834", "26835"), (stryMutAct_9fa48("26836") ? _context.replicaOptions : (stryCov_9fa48("26836"), _context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("26839") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("26838") ? false : stryMutAct_9fa48("26837") ? true : (stryCov_9fa48("26837", "26838", "26839"), (stryMutAct_9fa48("26841") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("26840") ? false : (stryCov_9fa48("26840", "26841"), (stryMutAct_9fa48("26842") ? directOptions.replicaId : (stryCov_9fa48("26842"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("26845") ? directOptions && d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("26844") ? false : stryMutAct_9fa48("26843") ? true : (stryCov_9fa48("26843", "26844", "26845"), directOptions || d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      const messageGroup = d.getMessageGroupServices().get(options.replicaId);
      if (stryMutAct_9fa48("26848") ? false : stryMutAct_9fa48("26847") ? true : stryMutAct_9fa48("26846") ? messageGroup : (stryCov_9fa48("26846", "26847", "26848"), !messageGroup)) {
        if (stryMutAct_9fa48("26849")) {
          {}
        } else {
          stryCov_9fa48("26849");
          return stryMutAct_9fa48("26850") ? {} : (stryCov_9fa48("26850"), {
            status: SERVICE_LIFECYCLE_STATE.STOPPED
          });
        }
      }
      if (stryMutAct_9fa48("26852") ? false : stryMutAct_9fa48("26851") ? true : (stryCov_9fa48("26851", "26852"), messageGroup.shutdown)) {
        if (stryMutAct_9fa48("26853")) {
          {}
        } else {
          stryCov_9fa48("26853");
          await messageGroup.shutdown();
        }
      }
      const unifiedAddress = (stryMutAct_9fa48("26854") ? `` : (stryCov_9fa48("26854"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26855") ? `` : (stryCov_9fa48("26855"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26856") ? `` : (stryCov_9fa48("26856"), `${options.replicaId}`));
      const messageRouter = d.getMessageRouter();
      if (stryMutAct_9fa48("26858") ? false : stryMutAct_9fa48("26857") ? true : (stryCov_9fa48("26857", "26858"), messageRouter)) {
        if (stryMutAct_9fa48("26859")) {
          {}
        } else {
          stryCov_9fa48("26859");
          messageRouter.unregister(unifiedAddress);
        }
      }
      d.getMessageGroupServices().delete(options.replicaId);
      d.filterMessageGroupReplicas(messageGroup);
      return stryMutAct_9fa48("26860") ? {} : (stryCov_9fa48("26860"), {
        status: SERVICE_LIFECYCLE_STATE.STOPPED
      });
    }
  }

  /**
   * Wait for message group leadership to be established.
   * Implements exponential backoff up to configured timeout.
   * @param {string} groupId - Message group ID.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @return {Promise<void>}
   */
  async waitForMessageGroupLeadership(groupId, replicaIds) {
    if (stryMutAct_9fa48("26861")) {
      {}
    } else {
      stryCov_9fa48("26861");
      const d = this.delegates;
      const logger = d.getLogger();
      const config = d.getConfig();
      const startTime = Date.now();
      const timeoutMs = stryMutAct_9fa48("26864") ? config.leadershipWaitTimeoutMs && BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs : stryMutAct_9fa48("26863") ? false : stryMutAct_9fa48("26862") ? true : (stryCov_9fa48("26862", "26863", "26864"), config.leadershipWaitTimeoutMs || BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs);
      let delay = stryMutAct_9fa48("26867") ? config.leadershipWaitInitialDelayMs && BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs : stryMutAct_9fa48("26866") ? false : stryMutAct_9fa48("26865") ? true : (stryCov_9fa48("26865", "26866", "26867"), config.leadershipWaitInitialDelayMs || BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs);
      const maxDelay = stryMutAct_9fa48("26870") ? config.leadershipWaitMaxDelayMs && BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs : stryMutAct_9fa48("26869") ? false : stryMutAct_9fa48("26868") ? true : (stryCov_9fa48("26868", "26869", "26870"), config.leadershipWaitMaxDelayMs || BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs);
      const backoffMultiplier = stryMutAct_9fa48("26873") ? config.leadershipWaitBackoffMultiplier && BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier : stryMutAct_9fa48("26872") ? false : stryMutAct_9fa48("26871") ? true : (stryCov_9fa48("26871", "26872", "26873"), config.leadershipWaitBackoffMultiplier || BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier);
      logger.debug(BOOTSTRAP_LOG_MSG.WAITING_MESSAGE_GROUP_LEADER, stryMutAct_9fa48("26874") ? {} : (stryCov_9fa48("26874"), {
        groupId,
        timeoutMs,
        nodeId: d.getNodeId()
      }));

      // Check immediately first
      for (const replicaId of replicaIds) {
        if (stryMutAct_9fa48("26875")) {
          {}
        } else {
          stryCov_9fa48("26875");
          const service = d.getMessageGroupServices().get(replicaId);
          if (stryMutAct_9fa48("26878") ? service || service.isLeaderReplica() : stryMutAct_9fa48("26877") ? false : stryMutAct_9fa48("26876") ? true : (stryCov_9fa48("26876", "26877", "26878"), service && service.isLeaderReplica())) {
            if (stryMutAct_9fa48("26879")) {
              {}
            } else {
              stryCov_9fa48("26879");
              logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADER_IMMEDIATE, stryMutAct_9fa48("26880") ? {} : (stryCov_9fa48("26880"), {
                groupId,
                leaderId: replicaId,
                elapsedMs: NUM.ZERO
              }));
              return;
            }
          }
        }
      }
      while (stryMutAct_9fa48("26883") ? Date.now() - startTime >= timeoutMs : stryMutAct_9fa48("26882") ? Date.now() - startTime <= timeoutMs : stryMutAct_9fa48("26881") ? false : (stryCov_9fa48("26881", "26882", "26883"), (stryMutAct_9fa48("26884") ? Date.now() + startTime : (stryCov_9fa48("26884"), Date.now() - startTime)) < timeoutMs)) {
        if (stryMutAct_9fa48("26885")) {
          {}
        } else {
          stryCov_9fa48("26885");
          await d.sleep(delay);
          delay = stryMutAct_9fa48("26886") ? Math.max(delay * backoffMultiplier, maxDelay) : (stryCov_9fa48("26886"), Math.min(stryMutAct_9fa48("26887") ? delay / backoffMultiplier : (stryCov_9fa48("26887"), delay * backoffMultiplier), maxDelay));
          for (const replicaId of replicaIds) {
            if (stryMutAct_9fa48("26888")) {
              {}
            } else {
              stryCov_9fa48("26888");
              const service = d.getMessageGroupServices().get(replicaId);
              if (stryMutAct_9fa48("26891") ? service || service.isLeaderReplica() : stryMutAct_9fa48("26890") ? false : stryMutAct_9fa48("26889") ? true : (stryCov_9fa48("26889", "26890", "26891"), service && service.isLeaderReplica())) {
                if (stryMutAct_9fa48("26892")) {
                  {}
                } else {
                  stryCov_9fa48("26892");
                  logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADER_FOUND, stryMutAct_9fa48("26893") ? {} : (stryCov_9fa48("26893"), {
                    groupId,
                    leaderId: replicaId,
                    elapsedMs: stryMutAct_9fa48("26894") ? Date.now() + startTime : (stryCov_9fa48("26894"), Date.now() - startTime)
                  }));
                  return;
                }
              }
            }
          }
        }
      }
      const error = new Error(BOOTSTRAP_ERROR.messageGroupLeadershipTimeout(groupId, timeoutMs));
      error.groupId = groupId;
      error.timeoutMs = timeoutMs;
      throw error;
    }
  }

  /**
   * Resolve the operational local message-group ingress.
   * Bootstrap-only "any replica" selection must not leak into runtime.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object}
   */
  resolveOperationalMessageGroupSelection(options = {}) {
    if (stryMutAct_9fa48("26895")) {
      {}
    } else {
      stryCov_9fa48("26895");
      const d = this.delegates;
      return d.resolveOperationalMessageGroupSelection(options);
    }
  }

  /**
   * Resolve operational ingress after allowing authoritative topology repair
   * for strict system-table CDC.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object>}
   */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    if (stryMutAct_9fa48("26896")) {
      {}
    } else {
      stryCov_9fa48("26896");
      const d = this.delegates;
      return d.resolveOperationalMessageGroupSelectionAsync(options);
    }
  }

  /**
   * Get a bootstrap-only message-group handle before leadership exists.
   * This must only be used during formation-time wiring.
   * @return {Object|null}
   */
  getBootstrapMessageGroupService() {
    if (stryMutAct_9fa48("26897")) {
      {}
    } else {
      stryCov_9fa48("26897");
      const d = this.delegates;
      return d.getBootstrapMessageGroupService();
    }
  }
}
export { SeedMessageGroupsPhase };