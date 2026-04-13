/**
 * Create Message Group Phase — handles self-hosted message group creation
 * and message group replica lifecycle during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
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
import { assertCritical } from '../../utils/assert.js';
import { NodeService } from '../../node/node-service.js';
import { MessageGroupServiceRowOwner } from '../../message-group/message-group-service-row-owner.js';
import { MessageGroupService } from '../../message-group/message-group-service.js';
import { MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy } from '../message-group-assignment.js';
import { JOIN_BACKFILL_QUERY, JOINING_ERROR_MSG, JOINING_LOG_MSG, JOINING_UNIFIED_RECONCILE } from '../node-joining-constants.js';
import { JOINING_HTTP } from '../node-joining-constants.js';
import { ADDRESS, CDC_OPERATION, ENTITY_TYPE, NUM, SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_STATE, SERVICE_STATUS, SERVICE_TYPE, TABLES, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';

/**
 * Format missing-replica assertion message for join lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatJoinReplicaMissingAtStart = stryMutAct_9fa48("25197") ? () => undefined : (stryCov_9fa48("25197"), (() => {
  const formatJoinReplicaMissingAtStart = replicaId => stryMutAct_9fa48("25198") ? `` : (stryCov_9fa48("25198"), `Join message-group replica ${replicaId} missing at start`);
  return formatJoinReplicaMissingAtStart;
})());
const ENSURE_LOCAL_ACCESS = stryMutAct_9fa48("25199") ? true : (stryCov_9fa48("25199"), false);
const SPREAD_ACROSS_NODES = stryMutAct_9fa48("25200") ? true : (stryCov_9fa48("25200"), false);
const CREATE_SELF_HOSTED_MESSAGE_GROUP_POLICY = Object.freeze(stryMutAct_9fa48("25201") ? {} : (stryCov_9fa48("25201"), {
  ensureLocalAccess: ENSURE_LOCAL_ACCESS,
  placementConstraints: stryMutAct_9fa48("25202") ? {} : (stryCov_9fa48("25202"), {
    spreadAcrossNodes: SPREAD_ACROSS_NODES
  })
}));
const MESSAGE_GROUP_REPLICA_ID_INFIX = stryMutAct_9fa48("25203") ? "" : (stryCov_9fa48("25203"), '-r');

/**
 * Handles the create-self-hosted-message-group phase and
 * message group replica lifecycle during the join process.
 */
class CreateMessageGroupPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("25204")) {
      {}
    } else {
      stryCov_9fa48("25204");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("25207") ? options.delegates && {} : stryMutAct_9fa48("25206") ? false : stryMutAct_9fa48("25205") ? true : (stryCov_9fa48("25205", "25206", "25207"), options.delegates || {});
      this.pendingCreateSelfHostedMessageGroupRow = null;
      this.createSelfHostedMetadataFlushPromise = null;
    }
  }

  /**
   * Create a join message-group replica with unified lifecycle.
   * @param {Object} context - Lifecycle context with definition.
   * @return {Promise<Object>} Status result.
   */
  async createJoinMessageGroupReplica(context) {
    if (stryMutAct_9fa48("25208")) {
      {}
    } else {
      stryCov_9fa48("25208");
      const definition = stryMutAct_9fa48("25211") ? context?.definition && {} : stryMutAct_9fa48("25210") ? false : stryMutAct_9fa48("25209") ? true : (stryCov_9fa48("25209", "25210", "25211"), (stryMutAct_9fa48("25212") ? context.definition : (stryCov_9fa48("25212"), context?.definition)) || {});
      const directOptions = stryMutAct_9fa48("25215") ? context?.replicaOptions && null : stryMutAct_9fa48("25214") ? false : stryMutAct_9fa48("25213") ? true : (stryCov_9fa48("25213", "25214", "25215"), (stryMutAct_9fa48("25216") ? context.replicaOptions : (stryCov_9fa48("25216"), context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("25219") ? directOptions?.replicaId && definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("25218") ? false : stryMutAct_9fa48("25217") ? true : (stryCov_9fa48("25217", "25218", "25219"), (stryMutAct_9fa48("25220") ? directOptions.replicaId : (stryCov_9fa48("25220"), directOptions?.replicaId)) || definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]);
      const options = stryMutAct_9fa48("25223") ? directOptions && this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("25222") ? false : stryMutAct_9fa48("25221") ? true : (stryCov_9fa48("25221", "25222", "25223"), directOptions || this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      const messageGroupServices = this.delegates.getMessageGroupServices();
      if (stryMutAct_9fa48("25225") ? false : stryMutAct_9fa48("25224") ? true : (stryCov_9fa48("25224", "25225"), messageGroupServices.has(options.replicaId))) {
        if (stryMutAct_9fa48("25226")) {
          {}
        } else {
          stryCov_9fa48("25226");
          return stryMutAct_9fa48("25227") ? {} : (stryCov_9fa48("25227"), {
            status: SERVICE_LIFECYCLE_STATE.CREATED
          });
        }
      }
      if (stryMutAct_9fa48("25231") ? options.createDelayMs <= NUM.ZERO : stryMutAct_9fa48("25230") ? options.createDelayMs >= NUM.ZERO : stryMutAct_9fa48("25229") ? false : stryMutAct_9fa48("25228") ? true : (stryCov_9fa48("25228", "25229", "25230", "25231"), options.createDelayMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("25232")) {
          {}
        } else {
          stryCov_9fa48("25232");
          const sleep = this.delegates.getSleep();
          await sleep(options.createDelayMs);
        }
      }
      const messageGroup = new MessageGroupService(stryMutAct_9fa48("25233") ? {} : (stryCov_9fa48("25233"), {
        groupId: options.groupId,
        replicaId: options.replicaId,
        nodeId: this.nodeId,
        replicaIds: options.replicaIds,
        transport: this.delegates.getMessageRouter(),
        peerAddresses: options.peerAddresses,
        deferElection: Boolean(options.deferElection),
        deferElectionUntilJoinConvergence: stryMutAct_9fa48("25236") ? options.deferElectionUntilJoinConvergence !== true : stryMutAct_9fa48("25235") ? false : stryMutAct_9fa48("25234") ? true : (stryCov_9fa48("25234", "25235", "25236"), options.deferElectionUntilJoinConvergence === (stryMutAct_9fa48("25237") ? false : (stryCov_9fa48("25237"), true))),
        isJoiningExistingGroup: Boolean(options.isJoiningExistingGroup),
        publishRoleMetadata: stryMutAct_9fa48("25240") ? options.publishRoleMetadata === false : stryMutAct_9fa48("25239") ? false : stryMutAct_9fa48("25238") ? true : (stryCov_9fa48("25238", "25239", "25240"), options.publishRoleMetadata !== (stryMutAct_9fa48("25241") ? true : (stryCov_9fa48("25241"), false))),
        publishLeaderNodeMetadata: stryMutAct_9fa48("25244") ? options.publishLeaderNodeMetadata === false : stryMutAct_9fa48("25243") ? false : stryMutAct_9fa48("25242") ? true : (stryCov_9fa48("25242", "25243", "25244"), options.publishLeaderNodeMetadata !== (stryMutAct_9fa48("25245") ? true : (stryCov_9fa48("25245"), false))),
        bootstrapReadinessState: (stryMutAct_9fa48("25248") ? typeof this.delegates.getBootstrapReadinessState !== 'function' : stryMutAct_9fa48("25247") ? false : stryMutAct_9fa48("25246") ? true : (stryCov_9fa48("25246", "25247", "25248"), typeof this.delegates.getBootstrapReadinessState === (stryMutAct_9fa48("25249") ? "" : (stryCov_9fa48("25249"), 'function')))) ? this.delegates.getBootstrapReadinessState() : null
      }));
      const messageRouter = this.delegates.getMessageRouter();
      const unifiedAddress = (stryMutAct_9fa48("25250") ? `` : (stryCov_9fa48("25250"), `${this.nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("25251") ? `` : (stryCov_9fa48("25251"), `${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("25252") ? `` : (stryCov_9fa48("25252"), `${ADDRESS.SEPARATOR}${options.replicaId}`));
      const logger = this.delegates.getLogger();
      messageRouter.register(unifiedAddress, envelope => {
        if (stryMutAct_9fa48("25253")) {
          {}
        } else {
          stryCov_9fa48("25253");
          if (stryMutAct_9fa48("25255") ? false : stryMutAct_9fa48("25254") ? true : (stryCov_9fa48("25254", "25255"), options.logEnvelope)) {
            if (stryMutAct_9fa48("25256")) {
              {}
            } else {
              stryCov_9fa48("25256");
              logger.debug(JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED, stryMutAct_9fa48("25257") ? {} : (stryCov_9fa48("25257"), {
                address: unifiedAddress,
                envelopeType: stryMutAct_9fa48("25260") ? envelope?.type && envelope?.payload?.type : stryMutAct_9fa48("25259") ? false : stryMutAct_9fa48("25258") ? true : (stryCov_9fa48("25258", "25259", "25260"), (stryMutAct_9fa48("25261") ? envelope.type : (stryCov_9fa48("25261"), envelope?.type)) || (stryMutAct_9fa48("25263") ? envelope.payload?.type : stryMutAct_9fa48("25262") ? envelope?.payload.type : (stryCov_9fa48("25262", "25263"), envelope?.payload?.type))),
                from: stryMutAct_9fa48("25266") ? envelope?.from && envelope?.payload?.address : stryMutAct_9fa48("25265") ? false : stryMutAct_9fa48("25264") ? true : (stryCov_9fa48("25264", "25265", "25266"), (stryMutAct_9fa48("25267") ? envelope.from : (stryCov_9fa48("25267"), envelope?.from)) || (stryMutAct_9fa48("25269") ? envelope.payload?.address : stryMutAct_9fa48("25268") ? envelope?.payload.address : (stryCov_9fa48("25268", "25269"), envelope?.payload?.address)))
              }));
            }
          }
          return messageGroup.receiveMessage(envelope);
        }
      });
      if (stryMutAct_9fa48("25271") ? false : stryMutAct_9fa48("25270") ? true : (stryCov_9fa48("25270", "25271"), options.logRegistration)) {
        if (stryMutAct_9fa48("25272")) {
          {}
        } else {
          stryCov_9fa48("25272");
          logger.info(JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED, stryMutAct_9fa48("25273") ? {} : (stryCov_9fa48("25273"), {
            unifiedAddress,
            nodeId: this.nodeId
          }));
        }
      }
      await messageGroup.initialize();
      messageGroupServices.set(options.replicaId, messageGroup);
      this.delegates.pushJoinMessageGroupReplica(messageGroup);
      logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, stryMutAct_9fa48("25274") ? {} : (stryCov_9fa48("25274"), {
        groupId: options.groupId,
        replicaId: options.replicaId,
        replicaIndex: options.replicaIndex,
        nodeId: this.nodeId
      }));
      return stryMutAct_9fa48("25275") ? {} : (stryCov_9fa48("25275"), {
        status: SERVICE_LIFECYCLE_STATE.CREATED
      });
    }
  }

  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("25276")) {
      {}
    } else {
      stryCov_9fa48("25276");
      const directOptions = stryMutAct_9fa48("25279") ? _context?.replicaOptions && null : stryMutAct_9fa48("25278") ? false : stryMutAct_9fa48("25277") ? true : (stryCov_9fa48("25277", "25278", "25279"), (stryMutAct_9fa48("25280") ? _context.replicaOptions : (stryCov_9fa48("25280"), _context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("25283") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("25282") ? false : stryMutAct_9fa48("25281") ? true : (stryCov_9fa48("25281", "25282", "25283"), (stryMutAct_9fa48("25285") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("25284") ? false : (stryCov_9fa48("25284", "25285"), (stryMutAct_9fa48("25286") ? directOptions.replicaId : (stryCov_9fa48("25286"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("25289") ? directOptions && this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("25288") ? false : stryMutAct_9fa48("25287") ? true : (stryCov_9fa48("25287", "25288", "25289"), directOptions || this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const messageGroup = messageGroupServices.get(options.replicaId);
      assertCritical(messageGroup, formatJoinReplicaMissingAtStart(options.replicaId));
      if (stryMutAct_9fa48("25292") ? false : stryMutAct_9fa48("25291") ? true : stryMutAct_9fa48("25290") ? options.deferElection : (stryCov_9fa48("25290", "25291", "25292"), !options.deferElection)) {
        if (stryMutAct_9fa48("25293")) {
          {}
        } else {
          stryCov_9fa48("25293");
          messageGroup.startElection();
        }
      }
      return stryMutAct_9fa48("25294") ? {} : (stryCov_9fa48("25294"), {
        status: SERVICE_LIFECYCLE_STATE.RUNNING,
        deferred: Boolean(options.deferElection)
      });
    }
  }

  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("25295")) {
      {}
    } else {
      stryCov_9fa48("25295");
      const directOptions = stryMutAct_9fa48("25298") ? _context?.replicaOptions && null : stryMutAct_9fa48("25297") ? false : stryMutAct_9fa48("25296") ? true : (stryCov_9fa48("25296", "25297", "25298"), (stryMutAct_9fa48("25299") ? _context.replicaOptions : (stryCov_9fa48("25299"), _context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("25302") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("25301") ? false : stryMutAct_9fa48("25300") ? true : (stryCov_9fa48("25300", "25301", "25302"), (stryMutAct_9fa48("25304") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("25303") ? false : (stryCov_9fa48("25303", "25304"), (stryMutAct_9fa48("25305") ? directOptions.replicaId : (stryCov_9fa48("25305"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("25308") ? directOptions && this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) : stryMutAct_9fa48("25307") ? false : stryMutAct_9fa48("25306") ? true : (stryCov_9fa48("25306", "25307", "25308"), directOptions || this.delegates.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.MESSAGE_GROUP));
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const messageGroup = messageGroupServices.get(options.replicaId);
      if (stryMutAct_9fa48("25311") ? false : stryMutAct_9fa48("25310") ? true : stryMutAct_9fa48("25309") ? messageGroup : (stryCov_9fa48("25309", "25310", "25311"), !messageGroup)) {
        if (stryMutAct_9fa48("25312")) {
          {}
        } else {
          stryCov_9fa48("25312");
          return stryMutAct_9fa48("25313") ? {} : (stryCov_9fa48("25313"), {
            status: SERVICE_LIFECYCLE_STATE.STOPPED
          });
        }
      }
      if (stryMutAct_9fa48("25315") ? false : stryMutAct_9fa48("25314") ? true : (stryCov_9fa48("25314", "25315"), messageGroup.shutdown)) {
        if (stryMutAct_9fa48("25316")) {
          {}
        } else {
          stryCov_9fa48("25316");
          await messageGroup.shutdown();
        }
      }
      const unifiedAddress = (stryMutAct_9fa48("25317") ? `` : (stryCov_9fa48("25317"), `${this.nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("25318") ? `` : (stryCov_9fa48("25318"), `${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("25319") ? `` : (stryCov_9fa48("25319"), `${ADDRESS.SEPARATOR}${options.replicaId}`));
      const messageRouter = this.delegates.getMessageRouter();
      if (stryMutAct_9fa48("25321") ? false : stryMutAct_9fa48("25320") ? true : (stryCov_9fa48("25320", "25321"), messageRouter)) {
        if (stryMutAct_9fa48("25322")) {
          {}
        } else {
          stryCov_9fa48("25322");
          messageRouter.unregister(unifiedAddress);
        }
      }
      messageGroupServices.delete(options.replicaId);
      this.delegates.removeJoinMessageGroupReplica(messageGroup);
      return stryMutAct_9fa48("25323") ? {} : (stryCov_9fa48("25323"), {
        status: SERVICE_LIFECYCLE_STATE.STOPPED
      });
    }
  }

  /**
   * Compute one deterministic delay between releasing deferred elections so a
   * previously started replica has time to establish leadership and heartbeat
   * before the next local replica arms its own timer.
   * @param {Array<Object>} replicas
   * @return {number}
   */
  resolveDeferredElectionReleaseDelayMs(replicas = stryMutAct_9fa48("25324") ? ["Stryker was here"] : (stryCov_9fa48("25324"), [])) {
    if (stryMutAct_9fa48("25325")) {
      {}
    } else {
      stryCov_9fa48("25325");
      const config = stryMutAct_9fa48("25328") ? this.delegates.getConfig?.() && {} : stryMutAct_9fa48("25327") ? false : stryMutAct_9fa48("25326") ? true : (stryCov_9fa48("25326", "25327", "25328"), (stryMutAct_9fa48("25329") ? this.delegates.getConfig() : (stryCov_9fa48("25329"), this.delegates.getConfig?.())) || {});
      const configuredMinimumDelay = (stryMutAct_9fa48("25332") ? Number.isFinite(config.replicaStaggerDelayMs) || config.replicaStaggerDelayMs > NUM.ZERO : stryMutAct_9fa48("25331") ? false : stryMutAct_9fa48("25330") ? true : (stryCov_9fa48("25330", "25331", "25332"), Number.isFinite(config.replicaStaggerDelayMs) && (stryMutAct_9fa48("25335") ? config.replicaStaggerDelayMs <= NUM.ZERO : stryMutAct_9fa48("25334") ? config.replicaStaggerDelayMs >= NUM.ZERO : stryMutAct_9fa48("25333") ? true : (stryCov_9fa48("25333", "25334", "25335"), config.replicaStaggerDelayMs > NUM.ZERO)))) ? Math.floor(config.replicaStaggerDelayMs) : NUM.ZERO;
      let computedDelayMs = configuredMinimumDelay;
      for (const replica of replicas) {
        if (stryMutAct_9fa48("25336")) {
          {}
        } else {
          stryCov_9fa48("25336");
          const electionMaxMs = stryMutAct_9fa48("25338") ? replica.raftTimingConfig?.electionMaxMs : stryMutAct_9fa48("25337") ? replica?.raftTimingConfig.electionMaxMs : (stryCov_9fa48("25337", "25338"), replica?.raftTimingConfig?.electionMaxMs);
          const heartbeatMs = stryMutAct_9fa48("25340") ? replica.raftTimingConfig?.heartbeatMs : stryMutAct_9fa48("25339") ? replica?.raftTimingConfig.heartbeatMs : (stryCov_9fa48("25339", "25340"), replica?.raftTimingConfig?.heartbeatMs);
          if (stryMutAct_9fa48("25343") ? !Number.isFinite(electionMaxMs) && electionMaxMs <= NUM.ZERO : stryMutAct_9fa48("25342") ? false : stryMutAct_9fa48("25341") ? true : (stryCov_9fa48("25341", "25342", "25343"), (stryMutAct_9fa48("25344") ? Number.isFinite(electionMaxMs) : (stryCov_9fa48("25344"), !Number.isFinite(electionMaxMs))) || (stryMutAct_9fa48("25347") ? electionMaxMs > NUM.ZERO : stryMutAct_9fa48("25346") ? electionMaxMs < NUM.ZERO : stryMutAct_9fa48("25345") ? false : (stryCov_9fa48("25345", "25346", "25347"), electionMaxMs <= NUM.ZERO)))) {
            if (stryMutAct_9fa48("25348")) {
              {}
            } else {
              stryCov_9fa48("25348");
              continue;
            }
          }
          const heartbeatAllowanceMs = (stryMutAct_9fa48("25351") ? Number.isFinite(heartbeatMs) || heartbeatMs > NUM.ZERO : stryMutAct_9fa48("25350") ? false : stryMutAct_9fa48("25349") ? true : (stryCov_9fa48("25349", "25350", "25351"), Number.isFinite(heartbeatMs) && (stryMutAct_9fa48("25354") ? heartbeatMs <= NUM.ZERO : stryMutAct_9fa48("25353") ? heartbeatMs >= NUM.ZERO : stryMutAct_9fa48("25352") ? true : (stryCov_9fa48("25352", "25353", "25354"), heartbeatMs > NUM.ZERO)))) ? Math.floor(stryMutAct_9fa48("25355") ? heartbeatMs / 2 : (stryCov_9fa48("25355"), heartbeatMs * 2)) : NUM.ZERO;
          computedDelayMs = stryMutAct_9fa48("25356") ? Math.min(computedDelayMs, Math.floor(electionMaxMs) + heartbeatAllowanceMs) : (stryCov_9fa48("25356"), Math.max(computedDelayMs, stryMutAct_9fa48("25357") ? Math.floor(electionMaxMs) - heartbeatAllowanceMs : (stryCov_9fa48("25357"), Math.floor(electionMaxMs) + heartbeatAllowanceMs)));
        }
      }
      return computedDelayMs;
    }
  }

  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle
   * adapters.
   * @param {string} groupId - Message group ID.
   * @return {Promise<void>}
   */
  async startDeferredJoinMessageGroupElections(groupId) {
    if (stryMutAct_9fa48("25358")) {
      {}
    } else {
      stryCov_9fa48("25358");
      const logger = this.delegates.getLogger();
      const replicas = stryMutAct_9fa48("25359") ? this.delegates.getJoinMessageGroupReplicas() : (stryCov_9fa48("25359"), this.delegates.getJoinMessageGroupReplicas().filter(stryMutAct_9fa48("25360") ? () => undefined : (stryCov_9fa48("25360"), replica => stryMutAct_9fa48("25363") ? replica?.deferElectionUntilJoinConvergence === true : stryMutAct_9fa48("25362") ? false : stryMutAct_9fa48("25361") ? true : (stryCov_9fa48("25361", "25362", "25363"), (stryMutAct_9fa48("25364") ? replica.deferElectionUntilJoinConvergence : (stryCov_9fa48("25364"), replica?.deferElectionUntilJoinConvergence)) !== (stryMutAct_9fa48("25365") ? false : (stryCov_9fa48("25365"), true))))));
      const sleep = (stryMutAct_9fa48("25368") ? typeof this.delegates.getSleep !== 'function' : stryMutAct_9fa48("25367") ? false : stryMutAct_9fa48("25366") ? true : (stryCov_9fa48("25366", "25367", "25368"), typeof this.delegates.getSleep === (stryMutAct_9fa48("25369") ? "" : (stryCov_9fa48("25369"), 'function')))) ? this.delegates.getSleep() : null;
      const electionReleaseDelayMs = this.resolveDeferredElectionReleaseDelayMs(replicas);
      logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START, stryMutAct_9fa48("25370") ? {} : (stryCov_9fa48("25370"), {
        groupId,
        replicaCount: replicas.length,
        electionReleaseDelayMs
      }));
      for (let index = NUM.ZERO; stryMutAct_9fa48("25373") ? index >= replicas.length : stryMutAct_9fa48("25372") ? index <= replicas.length : stryMutAct_9fa48("25371") ? false : (stryCov_9fa48("25371", "25372", "25373"), index < replicas.length); stryMutAct_9fa48("25374") ? index -= NUM.ONE : (stryCov_9fa48("25374"), index += NUM.ONE)) {
        if (stryMutAct_9fa48("25375")) {
          {}
        } else {
          stryCov_9fa48("25375");
          const messageGroup = replicas[index];
          messageGroup.startElection();
          if (stryMutAct_9fa48("25378") ? index < replicas.length - NUM.ONE && electionReleaseDelayMs > NUM.ZERO || typeof sleep === 'function' : stryMutAct_9fa48("25377") ? false : stryMutAct_9fa48("25376") ? true : (stryCov_9fa48("25376", "25377", "25378"), (stryMutAct_9fa48("25380") ? index < replicas.length - NUM.ONE || electionReleaseDelayMs > NUM.ZERO : stryMutAct_9fa48("25379") ? true : (stryCov_9fa48("25379", "25380"), (stryMutAct_9fa48("25383") ? index >= replicas.length - NUM.ONE : stryMutAct_9fa48("25382") ? index <= replicas.length - NUM.ONE : stryMutAct_9fa48("25381") ? true : (stryCov_9fa48("25381", "25382", "25383"), index < (stryMutAct_9fa48("25384") ? replicas.length + NUM.ONE : (stryCov_9fa48("25384"), replicas.length - NUM.ONE)))) && (stryMutAct_9fa48("25387") ? electionReleaseDelayMs <= NUM.ZERO : stryMutAct_9fa48("25386") ? electionReleaseDelayMs >= NUM.ZERO : stryMutAct_9fa48("25385") ? true : (stryCov_9fa48("25385", "25386", "25387"), electionReleaseDelayMs > NUM.ZERO)))) && (stryMutAct_9fa48("25389") ? typeof sleep !== 'function' : stryMutAct_9fa48("25388") ? true : (stryCov_9fa48("25388", "25389"), typeof sleep === (stryMutAct_9fa48("25390") ? "" : (stryCov_9fa48("25390"), 'function')))))) {
            if (stryMutAct_9fa48("25391")) {
              {}
            } else {
              stryCov_9fa48("25391");
              await sleep(electionReleaseDelayMs);
            }
          }
        }
      }
    }
  }

  /**
   * Phase 3a: Create self-hosted message group (3 replicas on
   * this node).
   * Requirements: 8.3 - Services created AFTER self-connection
   * established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    if (stryMutAct_9fa48("25392")) {
      {}
    } else {
      stryCov_9fa48("25392");
      const groupId = assignment.groupId;
      const replicaCount = stryMutAct_9fa48("25395") ? assignment.replicaCount && NUM.THREE : stryMutAct_9fa48("25394") ? false : stryMutAct_9fa48("25393") ? true : (stryCov_9fa48("25393", "25394", "25395"), assignment.replicaCount || NUM.THREE);
      const logger = this.delegates.getLogger();
      const config = this.delegates.getConfig();
      const messageRouter = this.delegates.getMessageRouter();
      logger.debug(JOINING_LOG_MSG.SELF_HOSTED_CREATING, stryMutAct_9fa48("25396") ? {} : (stryCov_9fa48("25396"), {
        nodeId: this.nodeId,
        groupId,
        replicaCount
      }));

      // Requirements: 8.3 - MessageRouter should already be
      // initialized in phaseConnectWebSocket
      if (stryMutAct_9fa48("25399") ? false : stryMutAct_9fa48("25398") ? true : stryMutAct_9fa48("25397") ? messageRouter : (stryCov_9fa48("25397", "25398", "25399"), !messageRouter)) {
        if (stryMutAct_9fa48("25400")) {
          {}
        } else {
          stryCov_9fa48("25400");
          throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      const replicaStaggerDelayMs = config.replicaStaggerDelayMs;
      const replicaIds = stryMutAct_9fa48("25401") ? ["Stryker was here"] : (stryCov_9fa48("25401"), []);
      const startupReplicaIds = Array.isArray(assignment.startupReplicaIds) ? stryMutAct_9fa48("25402") ? assignment.startupReplicaIds : (stryCov_9fa48("25402"), assignment.startupReplicaIds.filter(stryMutAct_9fa48("25403") ? () => undefined : (stryCov_9fa48("25403"), replicaId => stryMutAct_9fa48("25406") ? typeof replicaId === 'string' || replicaId.length > NUM.ZERO : stryMutAct_9fa48("25405") ? false : stryMutAct_9fa48("25404") ? true : (stryCov_9fa48("25404", "25405", "25406"), (stryMutAct_9fa48("25408") ? typeof replicaId !== 'string' : stryMutAct_9fa48("25407") ? true : (stryCov_9fa48("25407", "25408"), typeof replicaId === (stryMutAct_9fa48("25409") ? "" : (stryCov_9fa48("25409"), 'string')))) && (stryMutAct_9fa48("25412") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("25411") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("25410") ? true : (stryCov_9fa48("25410", "25411", "25412"), replicaId.length > NUM.ZERO)))))) : stryMutAct_9fa48("25413") ? ["Stryker was here"] : (stryCov_9fa48("25413"), []);
      if (stryMutAct_9fa48("25417") ? startupReplicaIds.length <= NUM.ZERO : stryMutAct_9fa48("25416") ? startupReplicaIds.length >= NUM.ZERO : stryMutAct_9fa48("25415") ? false : stryMutAct_9fa48("25414") ? true : (stryCov_9fa48("25414", "25415", "25416", "25417"), startupReplicaIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("25418")) {
          {}
        } else {
          stryCov_9fa48("25418");
          replicaIds.push(...startupReplicaIds);
        }
      } else {
        if (stryMutAct_9fa48("25419")) {
          {}
        } else {
          stryCov_9fa48("25419");
          for (let i = NUM.ZERO; stryMutAct_9fa48("25422") ? i >= replicaCount : stryMutAct_9fa48("25421") ? i <= replicaCount : stryMutAct_9fa48("25420") ? false : (stryCov_9fa48("25420", "25421", "25422"), i < replicaCount); stryMutAct_9fa48("25423") ? i-- : (stryCov_9fa48("25423"), i++)) {
            if (stryMutAct_9fa48("25424")) {
              {}
            } else {
              stryCov_9fa48("25424");
              replicaIds.push(stryMutAct_9fa48("25425") ? `` : (stryCov_9fa48("25425"), `${groupId}${MESSAGE_GROUP_REPLICA_ID_INFIX}${i}`));
            }
          }
        }
      }
      const allReplicaIds = (stryMutAct_9fa48("25428") ? Array.isArray(assignment.existingPeerIds) || assignment.existingPeerIds.length > NUM.ZERO : stryMutAct_9fa48("25427") ? false : stryMutAct_9fa48("25426") ? true : (stryCov_9fa48("25426", "25427", "25428"), Array.isArray(assignment.existingPeerIds) && (stryMutAct_9fa48("25431") ? assignment.existingPeerIds.length <= NUM.ZERO : stryMutAct_9fa48("25430") ? assignment.existingPeerIds.length >= NUM.ZERO : stryMutAct_9fa48("25429") ? true : (stryCov_9fa48("25429", "25430", "25431"), assignment.existingPeerIds.length > NUM.ZERO)))) ? assignment.existingPeerIds : replicaIds;
      const peerAddresses = (stryMutAct_9fa48("25434") ? Array.isArray(assignment.peerAddresses) || assignment.peerAddresses.length > NUM.ZERO : stryMutAct_9fa48("25433") ? false : stryMutAct_9fa48("25432") ? true : (stryCov_9fa48("25432", "25433", "25434"), Array.isArray(assignment.peerAddresses) && (stryMutAct_9fa48("25437") ? assignment.peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("25436") ? assignment.peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("25435") ? true : (stryCov_9fa48("25435", "25436", "25437"), assignment.peerAddresses.length > NUM.ZERO)))) ? assignment.peerAddresses : allReplicaIds.map(stryMutAct_9fa48("25438") ? () => undefined : (stryCov_9fa48("25438"), replicaId => (stryMutAct_9fa48("25439") ? `` : (stryCov_9fa48("25439"), `${this.nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("25440") ? `` : (stryCov_9fa48("25440"), `${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("25441") ? `` : (stryCov_9fa48("25441"), `${ADDRESS.SEPARATOR}${replicaId}`))));
      this.delegates.resetJoinMessageGroupReplicas();
      for (let index = NUM.ZERO; stryMutAct_9fa48("25444") ? index >= replicaIds.length : stryMutAct_9fa48("25443") ? index <= replicaIds.length : stryMutAct_9fa48("25442") ? false : (stryCov_9fa48("25442", "25443", "25444"), index < replicaIds.length); stryMutAct_9fa48("25445") ? index-- : (stryCov_9fa48("25445"), index++)) {
        if (stryMutAct_9fa48("25446")) {
          {}
        } else {
          stryCov_9fa48("25446");
          const replicaId = replicaIds[index];
          const replicaIndex = allReplicaIds.indexOf(replicaId);
          this.delegates.assertReplicaStartupOwnership(replicaId);
          this.delegates.queueJoinServiceReplica(this.delegates.createJoinServiceDescriptor(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, replicaId), stryMutAct_9fa48("25447") ? {} : (stryCov_9fa48("25447"), {
            serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
            groupId,
            replicaId,
            replicaIds: allReplicaIds,
            replicaIndex: (stryMutAct_9fa48("25451") ? replicaIndex < NUM.ZERO : stryMutAct_9fa48("25450") ? replicaIndex > NUM.ZERO : stryMutAct_9fa48("25449") ? false : stryMutAct_9fa48("25448") ? true : (stryCov_9fa48("25448", "25449", "25450", "25451"), replicaIndex >= NUM.ZERO)) ? replicaIndex : index,
            peerAddresses,
            deferElection: stryMutAct_9fa48("25452") ? false : (stryCov_9fa48("25452"), true),
            deferElectionUntilJoinConvergence: stryMutAct_9fa48("25456") ? (replicaIndex >= NUM.ZERO ? replicaIndex : index) <= NUM.ZERO : stryMutAct_9fa48("25455") ? (replicaIndex >= NUM.ZERO ? replicaIndex : index) >= NUM.ZERO : stryMutAct_9fa48("25454") ? false : stryMutAct_9fa48("25453") ? true : (stryCov_9fa48("25453", "25454", "25455", "25456"), ((stryMutAct_9fa48("25460") ? replicaIndex < NUM.ZERO : stryMutAct_9fa48("25459") ? replicaIndex > NUM.ZERO : stryMutAct_9fa48("25458") ? false : stryMutAct_9fa48("25457") ? true : (stryCov_9fa48("25457", "25458", "25459", "25460"), replicaIndex >= NUM.ZERO)) ? replicaIndex : index) > NUM.ZERO),
            publishRoleMetadata: stryMutAct_9fa48("25461") ? true : (stryCov_9fa48("25461"), false),
            publishLeaderNodeMetadata: stryMutAct_9fa48("25462") ? true : (stryCov_9fa48("25462"), false),
            createDelayMs: (stryMutAct_9fa48("25466") ? index <= NUM.ZERO : stryMutAct_9fa48("25465") ? index >= NUM.ZERO : stryMutAct_9fa48("25464") ? false : stryMutAct_9fa48("25463") ? true : (stryCov_9fa48("25463", "25464", "25465", "25466"), index > NUM.ZERO)) ? stryMutAct_9fa48("25467") ? index / replicaStaggerDelayMs : (stryCov_9fa48("25467"), index * replicaStaggerDelayMs) : NUM.ZERO,
            logEnvelope: stryMutAct_9fa48("25468") ? true : (stryCov_9fa48("25468"), false),
            logRegistration: stryMutAct_9fa48("25469") ? true : (stryCov_9fa48("25469"), false)
          }));
        }
      }
      await this.delegates.triggerJoinReconciler(JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON);
      await this.startDeferredJoinMessageGroupElections(groupId);
      const messageGroupServices = this.delegates.getMessageGroupServices();
      logger.info(JOINING_LOG_MSG.SELF_HOSTED_CREATED, stryMutAct_9fa48("25470") ? {} : (stryCov_9fa48("25470"), {
        nodeId: this.nodeId,
        groupId,
        replicaCount: messageGroupServices.size,
        hasMessageRouter: stryMutAct_9fa48("25471") ? !messageRouter : (stryCov_9fa48("25471"), !(stryMutAct_9fa48("25472") ? messageRouter : (stryCov_9fa48("25472"), !messageRouter)))
      }));
    }
  }

  /**
   * Register a message group service in the cluster's services
   * table. This ensures other nodes can discover this replica.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group
   *   service.
   * @return {Promise<void>}
   */
  async registerMessageGroupService(groupId, replicaId, service, options = {}) {
    if (stryMutAct_9fa48("25473")) {
      {}
    } else {
      stryCov_9fa48("25473");
      const nowFn = this.delegates.getNow();
      const sleep = this.delegates.getSleep();
      const logger = this.delegates.getLogger();
      const config = this.delegates.getConfig();
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const seedNodeAddress = this.delegates.getSeedNodeAddress();
      const now = nowFn();
      const moveReplicaAssignment = stryMutAct_9fa48("25476") ? bootstrapResponse?.messageGroupAssignment && null : stryMutAct_9fa48("25475") ? false : stryMutAct_9fa48("25474") ? true : (stryCov_9fa48("25474", "25475", "25476"), (stryMutAct_9fa48("25477") ? bootstrapResponse.messageGroupAssignment : (stryCov_9fa48("25477"), bootstrapResponse?.messageGroupAssignment)) || null);
      const seedNodeId = (stryMutAct_9fa48("25480") ? typeof this.delegates.getSeedNodeId !== 'function' : stryMutAct_9fa48("25479") ? false : stryMutAct_9fa48("25478") ? true : (stryCov_9fa48("25478", "25479", "25480"), typeof this.delegates.getSeedNodeId === (stryMutAct_9fa48("25481") ? "" : (stryCov_9fa48("25481"), 'function')))) ? this.delegates.getSeedNodeId() : null;
      const assignmentId = (stryMutAct_9fa48("25484") ? moveReplicaAssignment && moveReplicaAssignment.strategy === AssignmentStrategy.MOVE_REPLICA || moveReplicaAssignment.replicaToMove === replicaId : stryMutAct_9fa48("25483") ? false : stryMutAct_9fa48("25482") ? true : (stryCov_9fa48("25482", "25483", "25484"), (stryMutAct_9fa48("25486") ? moveReplicaAssignment || moveReplicaAssignment.strategy === AssignmentStrategy.MOVE_REPLICA : stryMutAct_9fa48("25485") ? true : (stryCov_9fa48("25485", "25486"), moveReplicaAssignment && (stryMutAct_9fa48("25488") ? moveReplicaAssignment.strategy !== AssignmentStrategy.MOVE_REPLICA : stryMutAct_9fa48("25487") ? true : (stryCov_9fa48("25487", "25488"), moveReplicaAssignment.strategy === AssignmentStrategy.MOVE_REPLICA)))) && (stryMutAct_9fa48("25490") ? moveReplicaAssignment.replicaToMove !== replicaId : stryMutAct_9fa48("25489") ? true : (stryCov_9fa48("25489", "25490"), moveReplicaAssignment.replicaToMove === replicaId)))) ? stryMutAct_9fa48("25493") ? moveReplicaAssignment.assignmentId && null : stryMutAct_9fa48("25492") ? false : stryMutAct_9fa48("25491") ? true : (stryCov_9fa48("25491", "25492", "25493"), moveReplicaAssignment.assignmentId || null) : null;
      const serviceData = MessageGroupServiceRowOwner.buildServiceRow(stryMutAct_9fa48("25494") ? {} : (stryCov_9fa48("25494"), {
        groupId,
        replicaId,
        nodeId: this.nodeId,
        service,
        timestamp: now,
        status: stryMutAct_9fa48("25497") ? options.status && SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("25496") ? false : stryMutAct_9fa48("25495") ? true : (stryCov_9fa48("25495", "25496", "25497"), options.status || SERVICE_STATUS.ACTIVE),
        extraFields: assignmentId ? stryMutAct_9fa48("25498") ? {} : (stryCov_9fa48("25498"), {
          [JOIN_BACKFILL_QUERY.ASSIGNMENT_ID_FIELD]: assignmentId
        }) : null
      }));
      const registerUrl = stryMutAct_9fa48("25499") ? `` : (stryCov_9fa48("25499"), `${seedNodeAddress}${JOINING_HTTP.REGISTER_SERVICE_PATH}`);
      logger.debug(JOINING_LOG_MSG.REGISTERING_MESSAGE_GROUP_SERVICE, stryMutAct_9fa48("25500") ? {} : (stryCov_9fa48("25500"), {
        nodeId: this.nodeId,
        replicaId,
        groupId,
        assignmentId,
        registerUrl
      }));
      const useLocalSeedRegistrationShortcut = stryMutAct_9fa48("25503") ? !assignmentId && typeof seedNodeId === 'string' && seedNodeId.length > NUM.ZERO && seedNodeId === this.nodeId || typeof this.delegates.upsertSystemTableRowWithRetry === 'function' : stryMutAct_9fa48("25502") ? false : stryMutAct_9fa48("25501") ? true : (stryCov_9fa48("25501", "25502", "25503"), (stryMutAct_9fa48("25505") ? !assignmentId && typeof seedNodeId === 'string' && seedNodeId.length > NUM.ZERO || seedNodeId === this.nodeId : stryMutAct_9fa48("25504") ? true : (stryCov_9fa48("25504", "25505"), (stryMutAct_9fa48("25507") ? !assignmentId && typeof seedNodeId === 'string' || seedNodeId.length > NUM.ZERO : stryMutAct_9fa48("25506") ? true : (stryCov_9fa48("25506", "25507"), (stryMutAct_9fa48("25509") ? !assignmentId || typeof seedNodeId === 'string' : stryMutAct_9fa48("25508") ? true : (stryCov_9fa48("25508", "25509"), (stryMutAct_9fa48("25510") ? assignmentId : (stryCov_9fa48("25510"), !assignmentId)) && (stryMutAct_9fa48("25512") ? typeof seedNodeId !== 'string' : stryMutAct_9fa48("25511") ? true : (stryCov_9fa48("25511", "25512"), typeof seedNodeId === (stryMutAct_9fa48("25513") ? "" : (stryCov_9fa48("25513"), 'string')))))) && (stryMutAct_9fa48("25516") ? seedNodeId.length <= NUM.ZERO : stryMutAct_9fa48("25515") ? seedNodeId.length >= NUM.ZERO : stryMutAct_9fa48("25514") ? true : (stryCov_9fa48("25514", "25515", "25516"), seedNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("25518") ? seedNodeId !== this.nodeId : stryMutAct_9fa48("25517") ? true : (stryCov_9fa48("25517", "25518"), seedNodeId === this.nodeId)))) && (stryMutAct_9fa48("25520") ? typeof this.delegates.upsertSystemTableRowWithRetry !== 'function' : stryMutAct_9fa48("25519") ? true : (stryCov_9fa48("25519", "25520"), typeof this.delegates.upsertSystemTableRowWithRetry === (stryMutAct_9fa48("25521") ? "" : (stryCov_9fa48("25521"), 'function')))));
      if (stryMutAct_9fa48("25523") ? false : stryMutAct_9fa48("25522") ? true : (stryCov_9fa48("25522", "25523"), useLocalSeedRegistrationShortcut)) {
        if (stryMutAct_9fa48("25524")) {
          {}
        } else {
          stryCov_9fa48("25524");
          await this.delegates.upsertSystemTableRowWithRetry(TABLES.SERVICES, serviceData, stryMutAct_9fa48("25525") ? {} : (stryCov_9fa48("25525"), {
            admissionTarget: stryMutAct_9fa48("25526") ? "" : (stryCov_9fa48("25526"), 'create-self-hosted local seed service registration')
          }));
          if (stryMutAct_9fa48("25529") ? typeof this.delegates.seedJoinTimeCacheRow !== 'function' : stryMutAct_9fa48("25528") ? false : stryMutAct_9fa48("25527") ? true : (stryCov_9fa48("25527", "25528", "25529"), typeof this.delegates.seedJoinTimeCacheRow === (stryMutAct_9fa48("25530") ? "" : (stryCov_9fa48("25530"), 'function')))) {
            if (stryMutAct_9fa48("25531")) {
              {}
            } else {
              stryCov_9fa48("25531");
              this.delegates.seedJoinTimeCacheRow(TABLES.SERVICES, serviceData);
            }
          }
          logger.info(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED, stryMutAct_9fa48("25532") ? {} : (stryCov_9fa48("25532"), {
            nodeId: this.nodeId,
            replicaId,
            groupId,
            attempt: NUM.ONE,
            localSeedShortcut: stryMutAct_9fa48("25533") ? false : (stryCov_9fa48("25533"), true)
          }));
          return;
        }
      }
      const retryPolicy = this.delegates.resolveJoinRetryPolicy();
      const retryTimeoutMs = retryPolicy.retryTimeoutMs;
      let delayMs = retryPolicy.initialDelayMs;
      const maxDelayMs = retryPolicy.maxDelayMs;
      const backoffMultiplier = retryPolicy.backoffMultiplier;
      const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(config.httpTimeoutMs);
      const startTime = nowFn();
      let attempt = NUM.ZERO;
      let lastError = null;
      while (stryMutAct_9fa48("25536") ? nowFn() - startTime >= retryTimeoutMs : stryMutAct_9fa48("25535") ? nowFn() - startTime <= retryTimeoutMs : stryMutAct_9fa48("25534") ? false : (stryCov_9fa48("25534", "25535", "25536"), (stryMutAct_9fa48("25537") ? nowFn() + startTime : (stryCov_9fa48("25537"), nowFn() - startTime)) < retryTimeoutMs)) {
        if (stryMutAct_9fa48("25538")) {
          {}
        } else {
          stryCov_9fa48("25538");
          stryMutAct_9fa48("25539") ? attempt -= 1 : (stryCov_9fa48("25539"), attempt += 1);
          try {
            if (stryMutAct_9fa48("25540")) {
              {}
            } else {
              stryCov_9fa48("25540");
              const response = await this.delegates.getHttpPostImpl()(registerUrl, serviceData);
              if (stryMutAct_9fa48("25543") ? false : stryMutAct_9fa48("25542") ? true : stryMutAct_9fa48("25541") ? response.success : (stryCov_9fa48("25541", "25542", "25543"), !response.success)) {
                if (stryMutAct_9fa48("25544")) {
                  {}
                } else {
                  stryCov_9fa48("25544");
                  logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_NON_SUCCESS, stryMutAct_9fa48("25545") ? {} : (stryCov_9fa48("25545"), {
                    nodeId: this.nodeId,
                    replicaId,
                    error: response.error
                  }));
                  const err = new Error(JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED);
                  if (stryMutAct_9fa48("25547") ? false : stryMutAct_9fa48("25546") ? true : (stryCov_9fa48("25546", "25547"), response.error)) {
                    if (stryMutAct_9fa48("25548")) {
                      {}
                    } else {
                      stryCov_9fa48("25548");
                      Object.assign(err, stryMutAct_9fa48("25549") ? {} : (stryCov_9fa48("25549"), {
                        cause: response.error
                      }));
                    }
                  }
                  throw err;
                }
              }
              const systemTableCache = NodeService.getInstance().getSystemTableCache();
              if (stryMutAct_9fa48("25551") ? false : stryMutAct_9fa48("25550") ? true : (stryCov_9fa48("25550", "25551"), systemTableCache)) {
                if (stryMutAct_9fa48("25552")) {
                  {}
                } else {
                  stryCov_9fa48("25552");
                  // Bootstrap timing exception: local cache seeding
                  // is required here because join-time CDC
                  // subscriptions are activated later in
                  // phaseQuerySystemState().
                  // Control-plane address resolution and readiness
                  // checks may consult the local services cache
                  // before CDC fanout reaches this node.
                  // See architecture.md: Sanctioned direct
                  // applySystemTableChange call sites.
                  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, serviceData);
                }
              }
              logger.info(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED, stryMutAct_9fa48("25553") ? {} : (stryCov_9fa48("25553"), {
                nodeId: this.nodeId,
                replicaId,
                groupId,
                attempt
              }));
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("25554")) {
              {}
            } else {
              stryCov_9fa48("25554");
              lastError = error;
              const elapsedMs = stryMutAct_9fa48("25555") ? nowFn() + startTime : (stryCov_9fa48("25555"), nowFn() - startTime);
              const classification = this.delegates.classifySeedContactFailure(error, retryableTimeoutErrorMessage);
              if (stryMutAct_9fa48("25558") ? classification.retryable || elapsedMs < retryTimeoutMs : stryMutAct_9fa48("25557") ? false : stryMutAct_9fa48("25556") ? true : (stryCov_9fa48("25556", "25557", "25558"), classification.retryable && (stryMutAct_9fa48("25561") ? elapsedMs >= retryTimeoutMs : stryMutAct_9fa48("25560") ? elapsedMs <= retryTimeoutMs : stryMutAct_9fa48("25559") ? true : (stryCov_9fa48("25559", "25560", "25561"), elapsedMs < retryTimeoutMs)))) {
                if (stryMutAct_9fa48("25562")) {
                  {}
                } else {
                  stryCov_9fa48("25562");
                  const nextDelayMs = this.delegates.computeSeedContactRetryDelayMs(stryMutAct_9fa48("25563") ? {} : (stryCov_9fa48("25563"), {
                    baseDelayMs: delayMs,
                    maxDelayMs,
                    retryAfterMs: classification.retryAfterMs
                  }));
                  logger.warn(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_RETRYING, stryMutAct_9fa48("25564") ? {} : (stryCov_9fa48("25564"), {
                    nodeId: this.nodeId,
                    replicaId,
                    groupId,
                    attempt,
                    elapsedMs,
                    error: error.message,
                    lastCode: classification.code,
                    lastStatusCode: classification.statusCode,
                    retryAfterMs: classification.retryAfterMs,
                    lastErrorDetails: stryMutAct_9fa48("25567") ? classification.parsedError?.details && null : stryMutAct_9fa48("25566") ? false : stryMutAct_9fa48("25565") ? true : (stryCov_9fa48("25565", "25566", "25567"), (stryMutAct_9fa48("25568") ? classification.parsedError.details : (stryCov_9fa48("25568"), classification.parsedError?.details)) || null),
                    nextDelayMs,
                    retryTimeoutMs
                  }));
                  await sleep(nextDelayMs);
                  delayMs = stryMutAct_9fa48("25569") ? Math.max(Math.floor(delayMs * backoffMultiplier), maxDelayMs) : (stryCov_9fa48("25569"), Math.min(Math.floor(stryMutAct_9fa48("25570") ? delayMs / backoffMultiplier : (stryCov_9fa48("25570"), delayMs * backoffMultiplier)), maxDelayMs));
                  continue;
                }
              }
              break;
            }
          }
        }
      }
      const error = stryMutAct_9fa48("25573") ? lastError && new Error(JOINING_ERROR_MSG.registerServiceTimeout(replicaId, retryTimeoutMs)) : stryMutAct_9fa48("25572") ? false : stryMutAct_9fa48("25571") ? true : (stryCov_9fa48("25571", "25572", "25573"), lastError || new Error(JOINING_ERROR_MSG.registerServiceTimeout(replicaId, retryTimeoutMs)));
      logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, stryMutAct_9fa48("25574") ? {} : (stryCov_9fa48("25574"), {
        nodeId: this.nodeId,
        replicaId,
        groupId,
        attempts: attempt,
        elapsedMs: stryMutAct_9fa48("25575") ? nowFn() + startTime : (stryCov_9fa48("25575"), nowFn() - startTime),
        error: error.message
      }));
      throw error;
    }
  }

  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are
   * present before join can complete successfully.
   * @return {Promise<void>}
   */
  async registerCreateSelfHostedMetadata() {
    if (stryMutAct_9fa48("25576")) {
      {}
    } else {
      stryCov_9fa48("25576");
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const assignment = stryMutAct_9fa48("25577") ? bootstrapResponse.messageGroupAssignment : (stryCov_9fa48("25577"), bootstrapResponse?.messageGroupAssignment);
      if (stryMutAct_9fa48("25580") ? !assignment && assignment.strategy !== AssignmentStrategy.CREATE_SELF_HOSTED : stryMutAct_9fa48("25579") ? false : stryMutAct_9fa48("25578") ? true : (stryCov_9fa48("25578", "25579", "25580"), (stryMutAct_9fa48("25581") ? assignment : (stryCov_9fa48("25581"), !assignment)) || (stryMutAct_9fa48("25583") ? assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED : stryMutAct_9fa48("25582") ? false : (stryCov_9fa48("25582", "25583"), assignment.strategy !== AssignmentStrategy.CREATE_SELF_HOSTED)))) {
        if (stryMutAct_9fa48("25584")) {
          {}
        } else {
          stryCov_9fa48("25584");
          return;
        }
      }
      const groupId = assignment.groupId;
      if (stryMutAct_9fa48("25587") ? false : stryMutAct_9fa48("25586") ? true : stryMutAct_9fa48("25585") ? groupId : (stryCov_9fa48("25585", "25586", "25587"), !groupId)) {
        if (stryMutAct_9fa48("25588")) {
          {}
        } else {
          stryCov_9fa48("25588");
          throw new Error(JOINING_ERROR_MSG.SELF_HOSTED_MISSING_GROUP_ID);
        }
      }
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const replicas = stryMutAct_9fa48("25589") ? Array.from(messageGroupServices.entries()) : (stryCov_9fa48("25589"), Array.from(messageGroupServices.entries()).filter(stryMutAct_9fa48("25590") ? () => undefined : (stryCov_9fa48("25590"), ([_replicaId, svc]) => stryMutAct_9fa48("25593") ? svc?.groupId !== groupId : stryMutAct_9fa48("25592") ? false : stryMutAct_9fa48("25591") ? true : (stryCov_9fa48("25591", "25592", "25593"), (stryMutAct_9fa48("25594") ? svc.groupId : (stryCov_9fa48("25594"), svc?.groupId)) === groupId))));
      if (stryMutAct_9fa48("25597") ? replicas.length !== NUM.ZERO : stryMutAct_9fa48("25596") ? false : stryMutAct_9fa48("25595") ? true : (stryCov_9fa48("25595", "25596", "25597"), replicas.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("25598")) {
          {}
        } else {
          stryCov_9fa48("25598");
          throw new Error(JOINING_ERROR_MSG.selfHostedNoLocalReplicas(groupId));
        }
      }
      const nowFn = this.delegates.getNow();
      const now = nowFn();
      const logger = this.delegates.getLogger();
      const messageGroupRow = stryMutAct_9fa48("25599") ? {} : (stryCov_9fa48("25599"), {
        group_id: groupId,
        group_name: groupId,
        replica_count: replicas.length,
        leader_node_id: this.nodeId,
        policy: JSON.stringify(CREATE_SELF_HOSTED_MESSAGE_GROUP_POLICY),
        created_at: now,
        updated_at: now
      });
      this.pendingCreateSelfHostedMessageGroupRow = messageGroupRow;
      if (stryMutAct_9fa48("25602") ? typeof this.delegates.seedJoinTimeCacheRow !== 'function' : stryMutAct_9fa48("25601") ? false : stryMutAct_9fa48("25600") ? true : (stryCov_9fa48("25600", "25601", "25602"), typeof this.delegates.seedJoinTimeCacheRow === (stryMutAct_9fa48("25603") ? "" : (stryCov_9fa48("25603"), 'function')))) {
        if (stryMutAct_9fa48("25604")) {
          {}
        } else {
          stryCov_9fa48("25604");
          this.delegates.seedJoinTimeCacheRow(TABLES.MESSAGE_GROUPS, messageGroupRow);
        }
      }
      for (const [replicaId, svc] of replicas) {
        if (stryMutAct_9fa48("25605")) {
          {}
        } else {
          stryCov_9fa48("25605");
          await this.delegates.registerMessageGroupService(groupId, replicaId, svc, stryMutAct_9fa48("25606") ? {} : (stryCov_9fa48("25606"), {
            status: SERVICE_STATUS.STOPPED
          }));
        }
      }
      logger.info(stryMutAct_9fa48("25607") ? "" : (stryCov_9fa48("25607"), 'CREATE_SELF_HOSTED message-group metadata staged for deferred authoritative publication'), stryMutAct_9fa48("25608") ? {} : (stryCov_9fa48("25608"), {
        nodeId: this.nodeId,
        groupId,
        replicaCount: replicas.length
      }));
    }
  }

  /**
   * Flush one staged CREATE_SELF_HOSTED message_groups row after the node has
   * crossed the READY cutover. The durable publication is intentionally
   * deferred out of query-state hydration because restarted owners may still
   * be bringing their control-plane partitions back online at that point.
   *
   * @return {Promise<Object|null>}
   */
  async flushDeferredCreateSelfHostedMetadata() {
    if (stryMutAct_9fa48("25609")) {
      {}
    } else {
      stryCov_9fa48("25609");
      const messageGroupRow = this.pendingCreateSelfHostedMessageGroupRow;
      if (stryMutAct_9fa48("25612") ? false : stryMutAct_9fa48("25611") ? true : stryMutAct_9fa48("25610") ? messageGroupRow : (stryCov_9fa48("25610", "25611", "25612"), !messageGroupRow)) {
        if (stryMutAct_9fa48("25613")) {
          {}
        } else {
          stryCov_9fa48("25613");
          return null;
        }
      }
      if (stryMutAct_9fa48("25615") ? false : stryMutAct_9fa48("25614") ? true : (stryCov_9fa48("25614", "25615"), this.createSelfHostedMetadataFlushPromise)) {
        if (stryMutAct_9fa48("25616")) {
          {}
        } else {
          stryCov_9fa48("25616");
          return this.createSelfHostedMetadataFlushPromise;
        }
      }
      const groupId = messageGroupRow.group_id;
      this.createSelfHostedMetadataFlushPromise = (async () => {
        if (stryMutAct_9fa48("25617")) {
          {}
        } else {
          stryCov_9fa48("25617");
          const upsertResult = (stryMutAct_9fa48("25620") ? typeof this.delegates.upsertSystemTableRowWithRetry !== 'function' : stryMutAct_9fa48("25619") ? false : stryMutAct_9fa48("25618") ? true : (stryCov_9fa48("25618", "25619", "25620"), typeof this.delegates.upsertSystemTableRowWithRetry === (stryMutAct_9fa48("25621") ? "" : (stryCov_9fa48("25621"), 'function')))) ? await this.delegates.upsertSystemTableRowWithRetry(TABLES.MESSAGE_GROUPS, messageGroupRow, stryMutAct_9fa48("25622") ? {} : (stryCov_9fa48("25622"), {
            admissionTarget: stryMutAct_9fa48("25623") ? "" : (stryCov_9fa48("25623"), 'create-self-hosted message-group metadata publication')
          })) : await this.delegates.upsertSystemTableRow(TABLES.MESSAGE_GROUPS, messageGroupRow);
          if (stryMutAct_9fa48("25626") ? false : stryMutAct_9fa48("25625") ? true : stryMutAct_9fa48("25624") ? upsertResult?.success : (stryCov_9fa48("25624", "25625", "25626"), !(stryMutAct_9fa48("25627") ? upsertResult.success : (stryCov_9fa48("25627"), upsertResult?.success)))) {
            if (stryMutAct_9fa48("25628")) {
              {}
            } else {
              stryCov_9fa48("25628");
              throw new Error(JOINING_ERROR_MSG.selfHostedMetadataUpsertFailed(groupId));
            }
          }
          this.pendingCreateSelfHostedMessageGroupRow = null;
          this.delegates.getLogger().info(JOINING_LOG_MSG.SELF_HOSTED_METADATA_REGISTERED, stryMutAct_9fa48("25629") ? {} : (stryCov_9fa48("25629"), {
            nodeId: this.nodeId,
            groupId
          }));
          return upsertResult;
        }
      })().finally(() => {
        if (stryMutAct_9fa48("25630")) {
          {}
        } else {
          stryCov_9fa48("25630");
          this.createSelfHostedMetadataFlushPromise = null;
        }
      });
      return this.createSelfHostedMetadataFlushPromise;
    }
  }
}
export { CreateMessageGroupPhase };