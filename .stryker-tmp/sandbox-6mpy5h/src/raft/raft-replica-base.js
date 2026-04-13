/**
 * RaftReplicaBase - Abstract base class for Raft-based replica services.
 * Provides common functionality shared between PartitionService and MessageGroupService.
 * Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 5.5
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { LoggingService } from '../logging/logging-service.js';
import { NodeService } from '../node/node-service.js';
import { AddressManager } from '../address/address-manager.js';
import { emitInvariant } from '../invariants/invariant-emitter.js';
import { INVARIANT_ID } from '../invariants/invariant-catalog.js';
import { isRaftPacket } from './raft-packet-utils.js';
import { NUM, STRING, TABLES } from '../constants/index.js';
import { ensureLiferaftProviderForRuntime } from './raft-provider-control.js';
import { assertRaftProviderContract } from './raft-provider-contract.js';
import { LiferaftProvider } from './liferaft-provider.js';
import { resolveRaftTransportDeliveryOptions } from './constants.js';
import { applyReplicaDemotion, clearReplicaLeaderUpdateState, reconcileReplicaLeaderChange } from './replica-leadership-state.js';
import { LeaderActivationGate } from './leader-activation-gate.js';
import { LeaderActivationScheduler } from './leader-activation-scheduler.js';
import { RAFT_REPLICA_BASE_ADDRESS, RAFT_REPLICA_BASE_DEFAULT, RAFT_REPLICA_BASE_ERROR_MSG, RAFT_REPLICA_BASE_EVENT, RAFT_REPLICA_BASE_LIFERAFT_EVENT, RAFT_REPLICA_BASE_LIFERAFT_TIMER, RAFT_REPLICA_BASE_LOG_MSG, RAFT_REPLICA_BASE_ROLE, RAFT_REPLICA_BASE_VALUE } from './raft-replica-base-constants.js';
const RaftRole = RAFT_REPLICA_BASE_ROLE;

/**
 * Abstract base class for Raft-based replica services.
 * Provides common Raft consensus functionality for both MessageGroupService and PartitionService.
 * @abstract
 */
class RaftReplicaBase extends EventEmitter {
  /**
   * Create a new RaftReplicaBase.
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs in the group.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.entityType - Entity type (partition or message-group).
   * @param {string} options.subsystemName - Logging subsystem name.
   * @param {Array<string>} [options.peerAddresses] - Peer addresses for cross-node joining.
   * @param {boolean} [options.deferElection] - Defer election start until startElection().
   * @param {boolean} [options.isJoiningExistingGroup] - True if joining existing group.
   * @param {Object} [options.raftProvider] - Provider implementing raft node contract.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("128129")) {
      {}
    } else {
      stryCov_9fa48("128129");
      super();
      if (stryMutAct_9fa48("128132") ? false : stryMutAct_9fa48("128131") ? true : stryMutAct_9fa48("128130") ? options.replicaId : (stryCov_9fa48("128130", "128131", "128132"), !options.replicaId)) {
        if (stryMutAct_9fa48("128133")) {
          {}
        } else {
          stryCov_9fa48("128133");
          throw new Error(stryMutAct_9fa48("128134") ? "" : (stryCov_9fa48("128134"), 'RaftReplicaBase requires replicaId'));
        }
      }
      if (stryMutAct_9fa48("128137") ? false : stryMutAct_9fa48("128136") ? true : stryMutAct_9fa48("128135") ? options.entityType : (stryCov_9fa48("128135", "128136", "128137"), !options.entityType)) {
        if (stryMutAct_9fa48("128138")) {
          {}
        } else {
          stryCov_9fa48("128138");
          throw new Error(stryMutAct_9fa48("128139") ? "" : (stryCov_9fa48("128139"), 'RaftReplicaBase requires entityType'));
        }
      }
      this.replicaId = options.replicaId;
      this.nodeId = stryMutAct_9fa48("128142") ? options.nodeId && RAFT_REPLICA_BASE_DEFAULT.NODE_ID : stryMutAct_9fa48("128141") ? false : stryMutAct_9fa48("128140") ? true : (stryCov_9fa48("128140", "128141", "128142"), options.nodeId || RAFT_REPLICA_BASE_DEFAULT.NODE_ID);
      this.replicaIds = stryMutAct_9fa48("128145") ? options.replicaIds && [this.replicaId] : stryMutAct_9fa48("128144") ? false : stryMutAct_9fa48("128143") ? true : (stryCov_9fa48("128143", "128144", "128145"), options.replicaIds || (stryMutAct_9fa48("128146") ? [] : (stryCov_9fa48("128146"), [this.replicaId])));
      this.transport = stryMutAct_9fa48("128149") ? options.transport && null : stryMutAct_9fa48("128148") ? false : stryMutAct_9fa48("128147") ? true : (stryCov_9fa48("128147", "128148", "128149"), options.transport || null);
      this.entityType = options.entityType;
      this.subsystemName = stryMutAct_9fa48("128152") ? options.subsystemName && STRING.UNKNOWN : stryMutAct_9fa48("128151") ? false : stryMutAct_9fa48("128150") ? true : (stryCov_9fa48("128150", "128151", "128152"), options.subsystemName || STRING.UNKNOWN);
      this.raftProvider = stryMutAct_9fa48("128155") ? options.raftProvider && new LiferaftProvider() : stryMutAct_9fa48("128154") ? false : stryMutAct_9fa48("128153") ? true : (stryCov_9fa48("128153", "128154", "128155"), options.raftProvider || new LiferaftProvider());
      assertRaftProviderContract(this.raftProvider);

      // Unified address format: {nodeId}/{entityType}/{replicaId}
      this.addressManager = AddressManager.getInstance();
      this.unifiedAddress = this.addressManager.format(this.nodeId, this.entityType, this.replicaId);

      // Peer addresses for cross-node communication
      this.peerAddresses = stryMutAct_9fa48("128158") ? options.peerAddresses && [] : stryMutAct_9fa48("128157") ? false : stryMutAct_9fa48("128156") ? true : (stryCov_9fa48("128156", "128157", "128158"), options.peerAddresses || (stryMutAct_9fa48("128159") ? ["Stryker was here"] : (stryCov_9fa48("128159"), [])));

      // Raft state
      this.raft = null;
      this.role = RaftRole.FOLLOWER;
      this.leaderId = null;
      this.isLeader = stryMutAct_9fa48("128160") ? true : (stryCov_9fa48("128160"), false);

      // Role persistence state
      this.cdcIntegrationService = stryMutAct_9fa48("128163") ? options.cdcIntegrationService && null : stryMutAct_9fa48("128162") ? false : stryMutAct_9fa48("128161") ? true : (stryCov_9fa48("128161", "128162", "128163"), options.cdcIntegrationService || null);
      this.pendingRoleUpdate = this.role;
      this.persistedRole = null;
      this.roleUpdateInFlight = stryMutAct_9fa48("128164") ? true : (stryCov_9fa48("128164"), false);
      this.roleUpdateRetryTimer = null;
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.leaderNodeUpdateInFlight = stryMutAct_9fa48("128165") ? true : (stryCov_9fa48("128165"), false);
      this.leaderNodeUpdateRetryTimer = null;

      // System table cache - use shared cache from NodeService singleton
      const nodeService = NodeService.getInstance();
      this.systemTableCache = stryMutAct_9fa48("128168") ? options.systemTableCache && nodeService.getSystemTableCache() : stryMutAct_9fa48("128167") ? false : stryMutAct_9fa48("128166") ? true : (stryCov_9fa48("128166", "128167", "128168"), options.systemTableCache || nodeService.getSystemTableCache());
      const config = ConfigurationManager.getInstance();
      this.leaderActivationStabilizationMs = (stryMutAct_9fa48("128171") ? Number.isFinite(options.leaderActivationStabilizationMs) || options.leaderActivationStabilizationMs >= NUM.ZERO : stryMutAct_9fa48("128170") ? false : stryMutAct_9fa48("128169") ? true : (stryCov_9fa48("128169", "128170", "128171"), Number.isFinite(options.leaderActivationStabilizationMs) && (stryMutAct_9fa48("128174") ? options.leaderActivationStabilizationMs < NUM.ZERO : stryMutAct_9fa48("128173") ? options.leaderActivationStabilizationMs > NUM.ZERO : stryMutAct_9fa48("128172") ? true : (stryCov_9fa48("128172", "128173", "128174"), options.leaderActivationStabilizationMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationStabilizationMs) : stryMutAct_9fa48("128175") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) && 250 : (stryCov_9fa48("128175"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ?? 250);
      this.leaderActivationNodeSpacingMs = (stryMutAct_9fa48("128178") ? Number.isFinite(options.leaderActivationNodeSpacingMs) || options.leaderActivationNodeSpacingMs >= NUM.ZERO : stryMutAct_9fa48("128177") ? false : stryMutAct_9fa48("128176") ? true : (stryCov_9fa48("128176", "128177", "128178"), Number.isFinite(options.leaderActivationNodeSpacingMs) && (stryMutAct_9fa48("128181") ? options.leaderActivationNodeSpacingMs < NUM.ZERO : stryMutAct_9fa48("128180") ? options.leaderActivationNodeSpacingMs > NUM.ZERO : stryMutAct_9fa48("128179") ? true : (stryCov_9fa48("128179", "128180", "128181"), options.leaderActivationNodeSpacingMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationNodeSpacingMs) : stryMutAct_9fa48("128182") ? config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) && 25 : (stryCov_9fa48("128182"), config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ?? 25);
      this.leaderActivationScheduler = stryMutAct_9fa48("128185") ? options.leaderActivationScheduler && LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      }) : stryMutAct_9fa48("128184") ? false : stryMutAct_9fa48("128183") ? true : (stryCov_9fa48("128183", "128184", "128185"), options.leaderActivationScheduler || LeaderActivationScheduler.getShared(stryMutAct_9fa48("128186") ? {} : (stryCov_9fa48("128186"), {
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      })));
      this.leaderActivationGate = new LeaderActivationGate(stryMutAct_9fa48("128187") ? {} : (stryCov_9fa48("128187"), {
        holdoffMs: this.leaderActivationStabilizationMs,
        activationScheduler: this.leaderActivationScheduler
      }));

      // Deferred election support
      this.deferElection = stryMutAct_9fa48("128190") ? (options.deferElection || options.isJoiningExistingGroup) && false : stryMutAct_9fa48("128189") ? false : stryMutAct_9fa48("128188") ? true : (stryCov_9fa48("128188", "128189", "128190"), (stryMutAct_9fa48("128192") ? options.deferElection && options.isJoiningExistingGroup : stryMutAct_9fa48("128191") ? false : (stryCov_9fa48("128191", "128192"), options.deferElection || options.isJoiningExistingGroup)) || (stryMutAct_9fa48("128193") ? true : (stryCov_9fa48("128193"), false)));
      this.electionStarted = stryMutAct_9fa48("128194") ? true : (stryCov_9fa48("128194"), false);
      this.isJoiningExistingGroup = stryMutAct_9fa48("128197") ? options.isJoiningExistingGroup && false : stryMutAct_9fa48("128196") ? false : stryMutAct_9fa48("128195") ? true : (stryCov_9fa48("128195", "128196", "128197"), options.isJoiningExistingGroup || (stryMutAct_9fa48("128198") ? true : (stryCov_9fa48("128198"), false)));

      // Learner phase support
      this.learnerPromotionDelayMs = stryMutAct_9fa48("128201") ? options.learnerPromotionDelayMs && RAFT_REPLICA_BASE_DEFAULT.LEARNER_PROMOTION_DELAY_MS : stryMutAct_9fa48("128200") ? false : stryMutAct_9fa48("128199") ? true : (stryCov_9fa48("128199", "128200", "128201"), options.learnerPromotionDelayMs || RAFT_REPLICA_BASE_DEFAULT.LEARNER_PROMOTION_DELAY_MS);
      this.learnerCatchUpCheckIntervalMs = stryMutAct_9fa48("128204") ? options.learnerCatchUpCheckIntervalMs && RAFT_REPLICA_BASE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS : stryMutAct_9fa48("128203") ? false : stryMutAct_9fa48("128202") ? true : (stryCov_9fa48("128202", "128203", "128204"), options.learnerCatchUpCheckIntervalMs || RAFT_REPLICA_BASE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS);
      this.learnerPromotionTimer = null;

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(this.subsystemName) : console;

      // State
      this.initialized = stryMutAct_9fa48("128205") ? true : (stryCov_9fa48("128205"), false);
    }
  }

  /**
   * Get the unified address for this service.
   * Format: ${nodeId}/${entityType}/${replicaId}
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    if (stryMutAct_9fa48("128206")) {
      {}
    } else {
      stryCov_9fa48("128206");
      return this.unifiedAddress;
    }
  }

  /**
   * Build a unified address for a peer replica.
   * Looks up the address from peerAddresses array or system table cache.
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    if (stryMutAct_9fa48("128207")) {
      {}
    } else {
      stryCov_9fa48("128207");
      // If peerId is already in unified format, validate and return as-is
      if (stryMutAct_9fa48("128209") ? false : stryMutAct_9fa48("128208") ? true : (stryCov_9fa48("128208", "128209"), peerId.includes(RAFT_REPLICA_BASE_ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("128210")) {
          {}
        } else {
          stryCov_9fa48("128210");
          const validation = this.addressManager.validate(peerId);
          if (stryMutAct_9fa48("128212") ? false : stryMutAct_9fa48("128211") ? true : (stryCov_9fa48("128211", "128212"), validation.valid)) {
            if (stryMutAct_9fa48("128213")) {
              {}
            } else {
              stryCov_9fa48("128213");
              return peerId;
            }
          }
          this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("128214") ? {} : (stryCov_9fa48("128214"), {
            peerId,
            replicaId: this.replicaId,
            error: validation.error
          }));
          throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(peerId));
        }
      }

      // Check peerAddresses array (provided during cross-node joining)
      if (stryMutAct_9fa48("128217") ? this.peerAddresses || this.peerAddresses.length > NUM.ZERO : stryMutAct_9fa48("128216") ? false : stryMutAct_9fa48("128215") ? true : (stryCov_9fa48("128215", "128216", "128217"), this.peerAddresses && (stryMutAct_9fa48("128220") ? this.peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("128219") ? this.peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("128218") ? true : (stryCov_9fa48("128218", "128219", "128220"), this.peerAddresses.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("128221")) {
          {}
        } else {
          stryCov_9fa48("128221");
          for (const addr of this.peerAddresses) {
            if (stryMutAct_9fa48("128222")) {
              {}
            } else {
              stryCov_9fa48("128222");
              const validation = this.addressManager.validate(addr);
              if (stryMutAct_9fa48("128225") ? false : stryMutAct_9fa48("128224") ? true : stryMutAct_9fa48("128223") ? validation.valid : (stryCov_9fa48("128223", "128224", "128225"), !validation.valid)) {
                if (stryMutAct_9fa48("128226")) {
                  {}
                } else {
                  stryCov_9fa48("128226");
                  this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("128227") ? {} : (stryCov_9fa48("128227"), {
                    peerId: addr,
                    replicaId: this.replicaId,
                    error: validation.error
                  }));
                  throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(addr));
                }
              }
              const parsed = this.addressManager.parse(addr);
              if (stryMutAct_9fa48("128230") ? parsed.serviceId !== peerId : stryMutAct_9fa48("128229") ? false : stryMutAct_9fa48("128228") ? true : (stryCov_9fa48("128228", "128229", "128230"), parsed.serviceId === peerId)) {
                if (stryMutAct_9fa48("128231")) {
                  {}
                } else {
                  stryCov_9fa48("128231");
                  this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_LIST, stryMutAct_9fa48("128232") ? {} : (stryCov_9fa48("128232"), {
                    peerId,
                    address: addr,
                    replicaId: this.replicaId
                  }));
                  return addr;
                }
              }
            }
          }
        }
      }

      // Try to look up nodeId from system table cache
      if (stryMutAct_9fa48("128234") ? false : stryMutAct_9fa48("128233") ? true : (stryCov_9fa48("128233", "128234"), this.systemTableCache)) {
        if (stryMutAct_9fa48("128235")) {
          {}
        } else {
          stryCov_9fa48("128235");
          const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
          if (stryMutAct_9fa48("128238") ? service || service.node_id : stryMutAct_9fa48("128237") ? false : stryMutAct_9fa48("128236") ? true : (stryCov_9fa48("128236", "128237", "128238"), service && service.node_id)) {
            if (stryMutAct_9fa48("128239")) {
              {}
            } else {
              stryCov_9fa48("128239");
              const address = this.addressManager.format(service.node_id, this.entityType, peerId);
              this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, stryMutAct_9fa48("128240") ? {} : (stryCov_9fa48("128240"), {
                peerId,
                nodeId: service.node_id,
                address,
                replicaId: this.replicaId
              }));
              return address;
            }
          }
        }
      }
      throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressUnresolved(peerId));
    }
  }

  /**
   * Create the liferaft instance with common configuration.
   * Subclasses should call this during initialization.
   * @param {Object} logAdapter - Log adapter for liferaft.
   * @return {Object} The raft provider node instance.
   * @protected
   */
  createRaftInstance(logAdapter) {
    if (stryMutAct_9fa48("128241")) {
      {}
    } else {
      stryCov_9fa48("128241");
      ensureLiferaftProviderForRuntime();
      const config = ConfigurationManager.getInstance();
      const heartbeatMs = stryMutAct_9fa48("128244") ? config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) && RAFT_REPLICA_BASE_DEFAULT.HEARTBEAT_DEFAULT_MS : stryMutAct_9fa48("128243") ? false : stryMutAct_9fa48("128242") ? true : (stryCov_9fa48("128242", "128243", "128244"), config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) || RAFT_REPLICA_BASE_DEFAULT.HEARTBEAT_DEFAULT_MS);
      const baseElectionMinMs = stryMutAct_9fa48("128247") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) && RAFT_REPLICA_BASE_DEFAULT.ELECTION_MIN_DEFAULT_MS : stryMutAct_9fa48("128246") ? false : stryMutAct_9fa48("128245") ? true : (stryCov_9fa48("128245", "128246", "128247"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) || RAFT_REPLICA_BASE_DEFAULT.ELECTION_MIN_DEFAULT_MS);
      const baseElectionMaxMs = stryMutAct_9fa48("128250") ? config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) && RAFT_REPLICA_BASE_DEFAULT.ELECTION_MAX_DEFAULT_MS : stryMutAct_9fa48("128249") ? false : stryMutAct_9fa48("128248") ? true : (stryCov_9fa48("128248", "128249", "128250"), config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) || RAFT_REPLICA_BASE_DEFAULT.ELECTION_MAX_DEFAULT_MS);

      // Add replica-index-based jitter to election timeouts
      let replicaIndex = this.replicaIds.indexOf(this.replicaId);
      if (stryMutAct_9fa48("128254") ? replicaIndex >= NUM.ZERO : stryMutAct_9fa48("128253") ? replicaIndex <= NUM.ZERO : stryMutAct_9fa48("128252") ? false : stryMutAct_9fa48("128251") ? true : (stryCov_9fa48("128251", "128252", "128253", "128254"), replicaIndex < NUM.ZERO)) {
        if (stryMutAct_9fa48("128255")) {
          {}
        } else {
          stryCov_9fa48("128255");
          const hashCode = this.replicaId.split(STRING.EMPTY).reduce(stryMutAct_9fa48("128256") ? () => undefined : (stryCov_9fa48("128256"), (acc, char) => stryMutAct_9fa48("128257") ? acc - char.charCodeAt(NUM.ZERO) : (stryCov_9fa48("128257"), acc + char.charCodeAt(NUM.ZERO))), NUM.ZERO);
          replicaIndex = stryMutAct_9fa48("128258") ? this.replicaIds.length - hashCode % RAFT_REPLICA_BASE_VALUE.HASH_MODULO : (stryCov_9fa48("128258"), this.replicaIds.length + (stryMutAct_9fa48("128259") ? hashCode * RAFT_REPLICA_BASE_VALUE.HASH_MODULO : (stryCov_9fa48("128259"), hashCode % RAFT_REPLICA_BASE_VALUE.HASH_MODULO)));
        }
      }
      const jitterMs = stryMutAct_9fa48("128260") ? replicaIndex / RAFT_REPLICA_BASE_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS : (stryCov_9fa48("128260"), replicaIndex * RAFT_REPLICA_BASE_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS);
      const electionMinMs = stryMutAct_9fa48("128261") ? baseElectionMinMs - jitterMs : (stryCov_9fa48("128261"), baseElectionMinMs + jitterMs);
      const electionMaxMs = stryMutAct_9fa48("128262") ? baseElectionMaxMs - jitterMs : (stryCov_9fa48("128262"), baseElectionMaxMs + jitterMs);
      const RaftNode = this.raftProvider.createNodeClass(stryMutAct_9fa48("128263") ? {} : (stryCov_9fa48("128263"), {
        deferElection: this.deferElection,
        logger: this.logger,
        replicaId: this.replicaId,
        resolvePeerAddress: stryMutAct_9fa48("128264") ? () => undefined : (stryCov_9fa48("128264"), peerId => this.buildPeerAddress(peerId)),
        deliverPacket: stryMutAct_9fa48("128265") ? () => undefined : (stryCov_9fa48("128265"), (peerAddress, packet) => this.transport.deliver(peerAddress, packet, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("128266") ? {} : (stryCov_9fa48("128266"), {
          ...packet,
          targetAddress: peerAddress
        }))))
      }));
      const raftOptions = stryMutAct_9fa48("128267") ? {} : (stryCov_9fa48("128267"), {
        [RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
        [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
        [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs
      });
      if (stryMutAct_9fa48("128269") ? false : stryMutAct_9fa48("128268") ? true : (stryCov_9fa48("128268", "128269"), logAdapter)) {
        if (stryMutAct_9fa48("128270")) {
          {}
        } else {
          stryCov_9fa48("128270");
          raftOptions[RAFT_REPLICA_BASE_LIFERAFT_TIMER.LOG] = function () {
            if (stryMutAct_9fa48("128271")) {
              {}
            } else {
              stryCov_9fa48("128271");
              return logAdapter;
            }
          };
        }
      }
      this.raft = new RaftNode(this.unifiedAddress, raftOptions);

      // Clear timers if deferring election
      if (stryMutAct_9fa48("128274") ? this.deferElection || this.raft : stryMutAct_9fa48("128273") ? false : stryMutAct_9fa48("128272") ? true : (stryCov_9fa48("128272", "128273", "128274"), this.deferElection && this.raft)) {
        if (stryMutAct_9fa48("128275")) {
          {}
        } else {
          stryCov_9fa48("128275");
          this.raftProvider.clearTimers(this.raft, RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT_ELECTION);
          this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, stryMutAct_9fa48("128276") ? {} : (stryCov_9fa48("128276"), {
            replicaId: this.replicaId
          }));
        }
      }
      return this.raft;
    }
  }

  /**
   * Wire up common liferaft events.
   * Subclasses can override onBecameLeader, onBecameFollower, etc. for custom behavior.
   * @protected
   */
  wireRaftEvents() {
    if (stryMutAct_9fa48("128277")) {
      {}
    } else {
      stryCov_9fa48("128277");
      const isSingleReplica = stryMutAct_9fa48("128280") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("128279") ? false : stryMutAct_9fa48("128278") ? true : (stryCov_9fa48("128278", "128279", "128280"), this.replicaIds.length === NUM.ONE);
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER, () => {
        if (stryMutAct_9fa48("128281")) {
          {}
        } else {
          stryCov_9fa48("128281");
          this.role = RaftRole.LEADER;
          this.isLeader = stryMutAct_9fa48("128282") ? false : (stryCov_9fa48("128282"), true);
          this.leaderId = this.replicaId;
          this.queueRoleUpdate(this.role);
          this.queueLeaderNodeUpdate(this.nodeId);
          const term = this.raftProvider.getCurrentTerm(this.raft);
          this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("128283") ? {} : (stryCov_9fa48("128283"), {
            term,
            replicaId: this.replicaId
          }));
          this.emitLeadershipInvariant(stryMutAct_9fa48("128284") ? false : (stryCov_9fa48("128284"), true), stryMutAct_9fa48("128285") ? {} : (stryCov_9fa48("128285"), {
            leaderId: this.replicaId,
            term
          }));
          this.emitReadinessRoleInvariant(stryMutAct_9fa48("128286") ? false : (stryCov_9fa48("128286"), true), stryMutAct_9fa48("128287") ? {} : (stryCov_9fa48("128287"), {
            role: this.role
          }));
          this.scheduleLeaderOwnedActivation(term);
        }
      });
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.FOLLOWER, () => {
        if (stryMutAct_9fa48("128288")) {
          {}
        } else {
          stryCov_9fa48("128288");
          if (stryMutAct_9fa48("128291") ? isSingleReplica || this.isLeader : stryMutAct_9fa48("128290") ? false : stryMutAct_9fa48("128289") ? true : (stryCov_9fa48("128289", "128290", "128291"), isSingleReplica && this.isLeader)) {
            if (stryMutAct_9fa48("128292")) {
              {}
            } else {
              stryCov_9fa48("128292");
              return;
            }
          }
          applyReplicaDemotion(this, RaftRole.FOLLOWER);
          this.cancelLeaderOwnedActivation();
          this.emitReadinessRoleInvariant(stryMutAct_9fa48("128293") ? false : (stryCov_9fa48("128293"), true), stryMutAct_9fa48("128294") ? {} : (stryCov_9fa48("128294"), {
            role: this.role
          }));
          this.onBecameFollower();
        }
      });
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.CANDIDATE, () => {
        if (stryMutAct_9fa48("128295")) {
          {}
        } else {
          stryCov_9fa48("128295");
          if (stryMutAct_9fa48("128298") ? isSingleReplica || this.isLeader : stryMutAct_9fa48("128297") ? false : stryMutAct_9fa48("128296") ? true : (stryCov_9fa48("128296", "128297", "128298"), isSingleReplica && this.isLeader)) {
            if (stryMutAct_9fa48("128299")) {
              {}
            } else {
              stryCov_9fa48("128299");
              return;
            }
          }
          applyReplicaDemotion(this, RaftRole.CANDIDATE);
          this.cancelLeaderOwnedActivation();
          this.emitReadinessRoleInvariant(stryMutAct_9fa48("128300") ? true : (stryCov_9fa48("128300"), false), stryMutAct_9fa48("128301") ? {} : (stryCov_9fa48("128301"), {
            role: this.role
          }));
          this.onBecameCandidate();
        }
      });
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.COMMIT, command => {
        if (stryMutAct_9fa48("128302")) {
          {}
        } else {
          stryCov_9fa48("128302");
          this.onCommit(command);
        }
      });
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER_CHANGE, to => {
        if (stryMutAct_9fa48("128303")) {
          {}
        } else {
          stryCov_9fa48("128303");
          this.handleLeaderChange(to);
        }
      });
      this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.TERM_CHANGE, _term => {
        if (stryMutAct_9fa48("128304")) {
          {}
        } else {
          stryCov_9fa48("128304");
          this.onTermChange();
        }
      });
    }
  }

  /**
   * Join peer nodes to the Raft cluster.
   * @protected
   */
  joinPeers() {
    if (stryMutAct_9fa48("128305")) {
      {}
    } else {
      stryCov_9fa48("128305");
      for (const peerId of this.replicaIds) {
        if (stryMutAct_9fa48("128306")) {
          {}
        } else {
          stryCov_9fa48("128306");
          if (stryMutAct_9fa48("128309") ? peerId === this.replicaId : stryMutAct_9fa48("128308") ? false : stryMutAct_9fa48("128307") ? true : (stryCov_9fa48("128307", "128308", "128309"), peerId !== this.replicaId)) {
            if (stryMutAct_9fa48("128310")) {
              {}
            } else {
              stryCov_9fa48("128310");
              const peerAddress = this.buildPeerAddress(peerId);
              this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.JOINING_PEER_ADDRESS, stryMutAct_9fa48("128311") ? {} : (stryCov_9fa48("128311"), {
                peerId,
                peerAddress,
                replicaId: this.replicaId
              }));
              this.raftProvider.joinPeer(this.raft, peerAddress);
            }
          }
        }
      }
    }
  }

  /**
   * Handle single-replica group leadership.
   * For single-replica groups, become leader immediately.
   * @protected
   */
  handleSingleReplicaLeadership() {
    if (stryMutAct_9fa48("128312")) {
      {}
    } else {
      stryCov_9fa48("128312");
      if (stryMutAct_9fa48("128315") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("128314") ? false : stryMutAct_9fa48("128313") ? true : (stryCov_9fa48("128313", "128314", "128315"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("128316")) {
          {}
        } else {
          stryCov_9fa48("128316");
          this.role = RaftRole.LEADER;
          this.isLeader = stryMutAct_9fa48("128317") ? false : (stryCov_9fa48("128317"), true);
          this.leaderId = this.replicaId;
          this.queueRoleUpdate(this.role);
          this.queueLeaderNodeUpdate(this.nodeId);
          this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.SINGLE_REPLICA_LEADER, stryMutAct_9fa48("128318") ? {} : (stryCov_9fa48("128318"), {
            replicaId: this.replicaId
          }));
          this.emitLeadershipInvariant(stryMutAct_9fa48("128319") ? false : (stryCov_9fa48("128319"), true), stryMutAct_9fa48("128320") ? {} : (stryCov_9fa48("128320"), {
            leaderId: this.replicaId,
            singleReplica: stryMutAct_9fa48("128321") ? false : (stryCov_9fa48("128321"), true)
          }));
          this.emitReadinessRoleInvariant(stryMutAct_9fa48("128322") ? false : (stryCov_9fa48("128322"), true), stryMutAct_9fa48("128323") ? {} : (stryCov_9fa48("128323"), {
            role: this.role
          }));
          this.scheduleLeaderOwnedActivation(this.raftProvider.getCurrentTerm(this.raft), stryMutAct_9fa48("128324") ? {} : (stryCov_9fa48("128324"), {
            immediate: stryMutAct_9fa48("128325") ? false : (stryCov_9fa48("128325"), true)
          }));
        }
      }
    }
  }

  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   */
  startElection() {
    if (stryMutAct_9fa48("128326")) {
      {}
    } else {
      stryCov_9fa48("128326");
      if (stryMutAct_9fa48("128328") ? false : stryMutAct_9fa48("128327") ? true : (stryCov_9fa48("128327", "128328"), this.electionStarted)) {
        if (stryMutAct_9fa48("128329")) {
          {}
        } else {
          stryCov_9fa48("128329");
          return;
        }
      }
      if (stryMutAct_9fa48("128332") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("128331") ? false : stryMutAct_9fa48("128330") ? true : (stryCov_9fa48("128330", "128331", "128332"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("128333")) {
          {}
        } else {
          stryCov_9fa48("128333");
          this.electionStarted = stryMutAct_9fa48("128334") ? false : (stryCov_9fa48("128334"), true);
          return;
        }
      }
      this.electionStarted = stryMutAct_9fa48("128335") ? false : (stryCov_9fa48("128335"), true);
      if (stryMutAct_9fa48("128337") ? false : stryMutAct_9fa48("128336") ? true : (stryCov_9fa48("128336", "128337"), this.raft)) {
        if (stryMutAct_9fa48("128338")) {
          {}
        } else {
          stryCov_9fa48("128338");
          this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.STARTING_ELECTION_TIMER, stryMutAct_9fa48("128339") ? {} : (stryCov_9fa48("128339"), {
            replicaId: this.replicaId,
            peerCount: stryMutAct_9fa48("128340") ? this.replicaIds.length + NUM.ONE : (stryCov_9fa48("128340"), this.replicaIds.length - NUM.ONE)
          }));
          this.raftProvider.startElectionTimer(this.raft);
        }
      }
    }
  }

  /**
   * Handle incoming Raft packets.
   * Routes Raft protocol messages to liferaft.
   * @param {Object} message - Incoming message.
   * @return {Object} Processing result.
   * @protected
   */
  handleRaftPacket(message) {
    if (stryMutAct_9fa48("128341")) {
      {}
    } else {
      stryCov_9fa48("128341");
      const payload = stryMutAct_9fa48("128344") ? message.payload && message : stryMutAct_9fa48("128343") ? false : stryMutAct_9fa48("128342") ? true : (stryCov_9fa48("128342", "128343", "128344"), message.payload || message);
      if (stryMutAct_9fa48("128347") ? false : stryMutAct_9fa48("128346") ? true : stryMutAct_9fa48("128345") ? isRaftPacket(payload) : (stryCov_9fa48("128345", "128346", "128347"), !isRaftPacket(payload))) {
        if (stryMutAct_9fa48("128348")) {
          {}
        } else {
          stryCov_9fa48("128348");
          return null;
        }
      }
      if (stryMutAct_9fa48("128350") ? false : stryMutAct_9fa48("128349") ? true : (stryCov_9fa48("128349", "128350"), this.raft)) {
        if (stryMutAct_9fa48("128351")) {
          {}
        } else {
          stryCov_9fa48("128351");
          this.logger.trace(RAFT_REPLICA_BASE_LOG_MSG.RECEIVED_RAFT_PACKET, stryMutAct_9fa48("128352") ? {} : (stryCov_9fa48("128352"), {
            type: payload.type,
            term: payload.term,
            address: payload.address,
            replicaId: this.replicaId
          }));
          const senderAddress = payload.address;
          const write = responsePacket => {
            if (stryMutAct_9fa48("128353")) {
              {}
            } else {
              stryCov_9fa48("128353");
              if (stryMutAct_9fa48("128355") ? false : stryMutAct_9fa48("128354") ? true : (stryCov_9fa48("128354", "128355"), responsePacket)) {
                if (stryMutAct_9fa48("128356")) {
                  {}
                } else {
                  stryCov_9fa48("128356");
                  const validation = this.addressManager.validate(senderAddress);
                  if (stryMutAct_9fa48("128359") ? false : stryMutAct_9fa48("128358") ? true : stryMutAct_9fa48("128357") ? validation.valid : (stryCov_9fa48("128357", "128358", "128359"), !validation.valid)) {
                    if (stryMutAct_9fa48("128360")) {
                      {}
                    } else {
                      stryCov_9fa48("128360");
                      return;
                    }
                  }
                  this.logger.trace(RAFT_REPLICA_BASE_LOG_MSG.SENDING_RAFT_RESPONSE, stryMutAct_9fa48("128361") ? {} : (stryCov_9fa48("128361"), {
                    type: responsePacket.type,
                    term: responsePacket.term
                  }));
                  this.transport.deliver(senderAddress, responsePacket, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("128362") ? {} : (stryCov_9fa48("128362"), {
                    ...responsePacket,
                    targetAddress: senderAddress
                  }))).catch(err => {
                    if (stryMutAct_9fa48("128363")) {
                      {}
                    } else {
                      stryCov_9fa48("128363");
                      this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.FAILED_RAFT_RESPONSE, stryMutAct_9fa48("128364") ? {} : (stryCov_9fa48("128364"), {
                        error: err.message,
                        destination: senderAddress
                      }));
                    }
                  });
                }
              }
            }
          };
          this.raft.emit(RAFT_REPLICA_BASE_EVENT.DATA, payload, write);
        }
      }
      return stryMutAct_9fa48("128365") ? {} : (stryCov_9fa48("128365"), {
        acknowledged: stryMutAct_9fa48("128366") ? false : (stryCov_9fa48("128366"), true)
      });
    }
  }

  /**
   * Schedule learner promotion check.
   * @protected
   */
  scheduleLearnerPromotion() {
    if (stryMutAct_9fa48("128367")) {
      {}
    } else {
      stryCov_9fa48("128367");
      if (stryMutAct_9fa48("128369") ? false : stryMutAct_9fa48("128368") ? true : (stryCov_9fa48("128368", "128369"), this.learnerPromotionTimer)) {
        if (stryMutAct_9fa48("128370")) {
          {}
        } else {
          stryCov_9fa48("128370");
          return;
        }
      }
      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, stryMutAct_9fa48("128371") ? {} : (stryCov_9fa48("128371"), {
        replicaId: this.replicaId,
        delayMs: this.learnerPromotionDelayMs
      }));
      this.learnerPromotionTimer = setTimeout(() => {
        if (stryMutAct_9fa48("128372")) {
          {}
        } else {
          stryCov_9fa48("128372");
          this.checkLearnerPromotion();
        }
      }, this.learnerPromotionDelayMs);
    }
  }

  /**
   * Check if learner can be promoted to follower.
   * @protected
   */
  checkLearnerPromotion() {
    if (stryMutAct_9fa48("128373")) {
      {}
    } else {
      stryCov_9fa48("128373");
      this.learnerPromotionTimer = null;
      if (stryMutAct_9fa48("128376") ? this.role === RaftRole.LEARNER : stryMutAct_9fa48("128375") ? false : stryMutAct_9fa48("128374") ? true : (stryCov_9fa48("128374", "128375", "128376"), this.role !== RaftRole.LEARNER)) {
        if (stryMutAct_9fa48("128377")) {
          {}
        } else {
          stryCov_9fa48("128377");
          return;
        }
      }
      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTION_CHECK, stryMutAct_9fa48("128378") ? {} : (stryCov_9fa48("128378"), {
        replicaId: this.replicaId
      }));

      // Promote to follower and start participating in elections
      this.role = RaftRole.FOLLOWER;
      this.isJoiningExistingGroup = stryMutAct_9fa48("128379") ? true : (stryCov_9fa48("128379"), false);
      this.deferElection = stryMutAct_9fa48("128380") ? true : (stryCov_9fa48("128380"), false);
      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, stryMutAct_9fa48("128381") ? {} : (stryCov_9fa48("128381"), {
        replicaId: this.replicaId
      }));
      this.startElection();
    }
  }

  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @protected
   */
  queueRoleUpdate(role) {
    if (stryMutAct_9fa48("128382")) {
      {}
    } else {
      stryCov_9fa48("128382");
      if (stryMutAct_9fa48("128385") ? !role && role === this.persistedRole : stryMutAct_9fa48("128384") ? false : stryMutAct_9fa48("128383") ? true : (stryCov_9fa48("128383", "128384", "128385"), (stryMutAct_9fa48("128386") ? role : (stryCov_9fa48("128386"), !role)) || (stryMutAct_9fa48("128388") ? role !== this.persistedRole : stryMutAct_9fa48("128387") ? false : (stryCov_9fa48("128387", "128388"), role === this.persistedRole)))) {
        if (stryMutAct_9fa48("128389")) {
          {}
        } else {
          stryCov_9fa48("128389");
          return;
        }
      }
      this.pendingRoleUpdate = role;
      if (stryMutAct_9fa48("128392") ? false : stryMutAct_9fa48("128391") ? true : stryMutAct_9fa48("128390") ? this.cdcIntegrationService : (stryCov_9fa48("128390", "128391", "128392"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("128393")) {
          {}
        } else {
          stryCov_9fa48("128393");
          return;
        }
      }
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("128394")) {
          {}
        } else {
          stryCov_9fa48("128394");
          this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_ROLE_FAILED, stryMutAct_9fa48("128395") ? {} : (stryCov_9fa48("128395"), {
            replicaId: this.replicaId,
            role,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Queue a leader node update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @protected
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (stryMutAct_9fa48("128396")) {
      {}
    } else {
      stryCov_9fa48("128396");
      if (stryMutAct_9fa48("128399") ? !leaderNodeId && leaderNodeId === this.persistedLeaderNodeId : stryMutAct_9fa48("128398") ? false : stryMutAct_9fa48("128397") ? true : (stryCov_9fa48("128397", "128398", "128399"), (stryMutAct_9fa48("128400") ? leaderNodeId : (stryCov_9fa48("128400"), !leaderNodeId)) || (stryMutAct_9fa48("128402") ? leaderNodeId !== this.persistedLeaderNodeId : stryMutAct_9fa48("128401") ? false : (stryCov_9fa48("128401", "128402"), leaderNodeId === this.persistedLeaderNodeId)))) {
        if (stryMutAct_9fa48("128403")) {
          {}
        } else {
          stryCov_9fa48("128403");
          return;
        }
      }
      this.pendingLeaderNodeUpdate = leaderNodeId;
      if (stryMutAct_9fa48("128406") ? false : stryMutAct_9fa48("128405") ? true : stryMutAct_9fa48("128404") ? this.cdcIntegrationService : (stryCov_9fa48("128404", "128405", "128406"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("128407")) {
          {}
        } else {
          stryCov_9fa48("128407");
          return;
        }
      }
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("128408")) {
          {}
        } else {
          stryCov_9fa48("128408");
          this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_LEADER_FAILED, stryMutAct_9fa48("128409") ? {} : (stryCov_9fa48("128409"), {
            replicaId: this.replicaId,
            leaderNodeId,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Clear leader node update state.
   * @protected
   */
  clearLeaderNodeUpdateState() {
    if (stryMutAct_9fa48("128410")) {
      {}
    } else {
      stryCov_9fa48("128410");
      clearReplicaLeaderUpdateState(this);
    }
  }

  /**
   * Persist the latest pending raft role update.
   * Subclasses must implement this method.
   * @return {Promise<void>}
   * @abstract
   * @protected
   */
  async flushRoleUpdate() {
    if (stryMutAct_9fa48("128411")) {
      {}
    } else {
      stryCov_9fa48("128411");
      throw new Error(stryMutAct_9fa48("128412") ? "" : (stryCov_9fa48("128412"), 'flushRoleUpdate must be implemented by subclass'));
    }
  }

  /**
   * Persist the latest pending leader node update.
   * Subclasses must implement this method.
   * @return {Promise<void>}
   * @abstract
   * @protected
   */
  async flushLeaderNodeUpdate() {
    if (stryMutAct_9fa48("128413")) {
      {}
    } else {
      stryCov_9fa48("128413");
      throw new Error(stryMutAct_9fa48("128414") ? "" : (stryCov_9fa48("128414"), 'flushLeaderNodeUpdate must be implemented by subclass'));
    }
  }

  /**
   * Set the CDC integration service for raft role updates.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("128415")) {
      {}
    } else {
      stryCov_9fa48("128415");
      this.cdcIntegrationService = cdcIntegrationService;
      this.flushRoleUpdate().catch(error => {
        if (stryMutAct_9fa48("128416")) {
          {}
        } else {
          stryCov_9fa48("128416");
          this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_ROLE_FAILED, stryMutAct_9fa48("128417") ? {} : (stryCov_9fa48("128417"), {
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
      this.flushLeaderNodeUpdate().catch(error => {
        if (stryMutAct_9fa48("128418")) {
          {}
        } else {
          stryCov_9fa48("128418");
          this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_LEADER_FAILED, stryMutAct_9fa48("128419") ? {} : (stryCov_9fa48("128419"), {
            replicaId: this.replicaId,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("128420")) {
      {}
    } else {
      stryCov_9fa48("128420");
      return stryMutAct_9fa48("128423") ? this.role !== RaftRole.LEADER : stryMutAct_9fa48("128422") ? false : stryMutAct_9fa48("128421") ? true : (stryCov_9fa48("128421", "128422", "128423"), this.role === RaftRole.LEADER);
    }
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    if (stryMutAct_9fa48("128424")) {
      {}
    } else {
      stryCov_9fa48("128424");
      return this.leaderId;
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    if (stryMutAct_9fa48("128425")) {
      {}
    } else {
      stryCov_9fa48("128425");
      return this.role;
    }
  }

  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    if (stryMutAct_9fa48("128426")) {
      {}
    } else {
      stryCov_9fa48("128426");
      return this.raftProvider.getCurrentTerm(this.raft);
    }
  }

  /**
   * Check if initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("128427")) {
      {}
    } else {
      stryCov_9fa48("128427");
      return this.initialized;
    }
  }

  // ============================================================================
  // Lifecycle hooks - subclasses can override these for custom behavior
  // ============================================================================

  /**
   * Called when this replica becomes leader.
   * @protected
   */
  onBecameLeader() {
    // Subclasses can override
  }

  /**
   * Called when this replica becomes follower.
   * @protected
   */
  onBecameFollower() {
    // Subclasses can override
  }

  /**
   * Called when this replica becomes candidate.
   * @protected
   */
  onBecameCandidate() {
    // Subclasses can override
  }

  /**
   * Called when the replica observes a leader change.
   * @param {string|null} _leaderId - New leader replica ID.
   * @param {Object} _context - Transition context.
   * @protected
   */
  onLeaderChanged(_leaderId, _context) {
    // Subclasses can override
  }

  /**
   * Called when a command is committed.
   * @param {Object} _command - The committed command.
   * @protected
   */
  onCommit(_command) {
    // Subclasses can override
  }

  /**
   * Called when the term changes.
   * @protected
   */
  onTermChange() {
    // Subclasses can override
  }

  /**
   * Reconcile a leader-change event through the shared runtime path.
   * @param {string|null} nextLeaderId - New leader replica ID.
   * @return {boolean} True when the replica was demoted locally.
   * @protected
   */
  handleLeaderChange(nextLeaderId) {
    if (stryMutAct_9fa48("128428")) {
      {}
    } else {
      stryCov_9fa48("128428");
      const previousLeaderId = this.leaderId;
      const demoted = reconcileReplicaLeaderChange(this, nextLeaderId, RaftRole.FOLLOWER);
      this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("128429") ? {} : (stryCov_9fa48("128429"), {
        newLeader: nextLeaderId,
        previousLeader: previousLeaderId,
        replicaId: this.replicaId,
        demoted
      }));
      if (stryMutAct_9fa48("128431") ? false : stryMutAct_9fa48("128430") ? true : (stryCov_9fa48("128430", "128431"), demoted)) {
        if (stryMutAct_9fa48("128432")) {
          {}
        } else {
          stryCov_9fa48("128432");
          this.cancelLeaderOwnedActivation();
          this.onBecameFollower();
        }
      }
      const leaderId = this.leaderId;
      const context = stryMutAct_9fa48("128433") ? {} : (stryCov_9fa48("128433"), {
        previousLeaderId,
        demoted
      });
      this.emitLeadershipInvariant(stryMutAct_9fa48("128436") ? typeof leaderId === 'string' || leaderId.length > 0 : stryMutAct_9fa48("128435") ? false : stryMutAct_9fa48("128434") ? true : (stryCov_9fa48("128434", "128435", "128436"), (stryMutAct_9fa48("128438") ? typeof leaderId !== 'string' : stryMutAct_9fa48("128437") ? true : (stryCov_9fa48("128437", "128438"), typeof leaderId === (stryMutAct_9fa48("128439") ? "" : (stryCov_9fa48("128439"), 'string')))) && (stryMutAct_9fa48("128442") ? leaderId.length <= 0 : stryMutAct_9fa48("128441") ? leaderId.length >= 0 : stryMutAct_9fa48("128440") ? true : (stryCov_9fa48("128440", "128441", "128442"), leaderId.length > 0))), stryMutAct_9fa48("128443") ? {} : (stryCov_9fa48("128443"), {
        leaderId,
        ...context
      }));
      this.onLeaderChanged(leaderId, context);
      this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_CHANGED, stryMutAct_9fa48("128444") ? {} : (stryCov_9fa48("128444"), {
        leaderId,
        replicaId: this.replicaId,
        ...context
      }));
      return demoted;
    }
  }
  emitLeadershipInvariant(passed, observed = {}) {
    if (stryMutAct_9fa48("128445")) {
      {}
    } else {
      stryCov_9fa48("128445");
      return emitInvariant(this, stryMutAct_9fa48("128446") ? {} : (stryCov_9fa48("128446"), {
        invariantId: INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
        passed,
        entityId: this.replicaId,
        owningSubsystem: this.subsystemName,
        observed: stryMutAct_9fa48("128447") ? {} : (stryCov_9fa48("128447"), {
          replicaId: this.replicaId,
          nodeId: this.nodeId,
          ...observed
        })
      }));
    }
  }
  emitReadinessRoleInvariant(passed, observed = {}) {
    if (stryMutAct_9fa48("128448")) {
      {}
    } else {
      stryCov_9fa48("128448");
      return emitInvariant(this, stryMutAct_9fa48("128449") ? {} : (stryCov_9fa48("128449"), {
        invariantId: INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
        passed,
        entityId: this.replicaId,
        owningSubsystem: this.subsystemName,
        observed: stryMutAct_9fa48("128450") ? {} : (stryCov_9fa48("128450"), {
          replicaId: this.replicaId,
          nodeId: this.nodeId,
          ...observed
        })
      }));
    }
  }
  cancelLeaderOwnedActivation() {
    if (stryMutAct_9fa48("128451")) {
      {}
    } else {
      stryCov_9fa48("128451");
      this.leaderActivationGate.cancel(stryMutAct_9fa48("128452") ? {} : (stryCov_9fa48("128452"), {
        clearActivatedTerm: stryMutAct_9fa48("128453") ? false : (stryCov_9fa48("128453"), true)
      }));
    }
  }
  scheduleLeaderOwnedActivation(term, options = {}) {
    if (stryMutAct_9fa48("128454")) {
      {}
    } else {
      stryCov_9fa48("128454");
      this.leaderActivationGate.schedule(term, () => {
        if (stryMutAct_9fa48("128455")) {
          {}
        } else {
          stryCov_9fa48("128455");
          if (stryMutAct_9fa48("128458") ? false : stryMutAct_9fa48("128457") ? true : stryMutAct_9fa48("128456") ? this.isLeaderReplica() : (stryCov_9fa48("128456", "128457", "128458"), !this.isLeaderReplica())) {
            if (stryMutAct_9fa48("128459")) {
              {}
            } else {
              stryCov_9fa48("128459");
              return;
            }
          }
          this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("128460") ? {} : (stryCov_9fa48("128460"), {
            term,
            replicaId: this.replicaId
          }));
          this.onBecameLeader();
          this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_ELECTED, stryMutAct_9fa48("128461") ? {} : (stryCov_9fa48("128461"), {
            leaderId: this.replicaId,
            term
          }));
        }
      }, stryMutAct_9fa48("128462") ? {} : (stryCov_9fa48("128462"), {
        immediate: stryMutAct_9fa48("128465") ? options.immediate !== true : stryMutAct_9fa48("128464") ? false : stryMutAct_9fa48("128463") ? true : (stryCov_9fa48("128463", "128464", "128465"), options.immediate === (stryMutAct_9fa48("128466") ? false : (stryCov_9fa48("128466"), true))),
        shouldActivate: stryMutAct_9fa48("128467") ? () => undefined : (stryCov_9fa48("128467"), () => this.isLeaderReplica())
      }));
    }
  }

  /**
   * Shutdown the replica service.
   * Clears timers and ends liferaft instance.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("128468")) {
      {}
    } else {
      stryCov_9fa48("128468");
      this.logger.info(stryMutAct_9fa48("128469") ? "" : (stryCov_9fa48("128469"), 'Shutting down raft replica'), stryMutAct_9fa48("128470") ? {} : (stryCov_9fa48("128470"), {
        replicaId: this.replicaId
      }));

      // End liferaft instance - clear all timers first
      if (stryMutAct_9fa48("128472") ? false : stryMutAct_9fa48("128471") ? true : (stryCov_9fa48("128471", "128472"), this.raft)) {
        if (stryMutAct_9fa48("128473")) {
          {}
        } else {
          stryCov_9fa48("128473");
          this.raftProvider.shutdownNode(this.raft);
          this.raft = null;
        }
      }

      // Clear timers
      if (stryMutAct_9fa48("128475") ? false : stryMutAct_9fa48("128474") ? true : (stryCov_9fa48("128474", "128475"), this.roleUpdateRetryTimer)) {
        if (stryMutAct_9fa48("128476")) {
          {}
        } else {
          stryCov_9fa48("128476");
          clearTimeout(this.roleUpdateRetryTimer);
          this.roleUpdateRetryTimer = null;
        }
      }
      if (stryMutAct_9fa48("128478") ? false : stryMutAct_9fa48("128477") ? true : (stryCov_9fa48("128477", "128478"), this.leaderNodeUpdateRetryTimer)) {
        if (stryMutAct_9fa48("128479")) {
          {}
        } else {
          stryCov_9fa48("128479");
          clearTimeout(this.leaderNodeUpdateRetryTimer);
          this.leaderNodeUpdateRetryTimer = null;
        }
      }
      if (stryMutAct_9fa48("128481") ? false : stryMutAct_9fa48("128480") ? true : (stryCov_9fa48("128480", "128481"), this.learnerPromotionTimer)) {
        if (stryMutAct_9fa48("128482")) {
          {}
        } else {
          stryCov_9fa48("128482");
          clearTimeout(this.learnerPromotionTimer);
          this.learnerPromotionTimer = null;
        }
      }
      this.leaderActivationGate.shutdown();
      this.initialized = stryMutAct_9fa48("128483") ? true : (stryCov_9fa48("128483"), false);
      this.emit(RAFT_REPLICA_BASE_EVENT.SHUTDOWN, stryMutAct_9fa48("128484") ? {} : (stryCov_9fa48("128484"), {
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @protected
   */
  sleep(ms) {
    if (stryMutAct_9fa48("128485")) {
      {}
    } else {
      stryCov_9fa48("128485");
      return new Promise(stryMutAct_9fa48("128486") ? () => undefined : (stryCov_9fa48("128486"), resolve => setTimeout(resolve, ms)));
    }
  }
}
export { RaftReplicaBase, RaftRole };