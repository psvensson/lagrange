/**
 * RaftGroup - Composable Raft lifecycle management.
 * Encapsulates liferaft instance creation, event wiring, peer joining,
 * election management, and shutdown in a single reusable class.
 * All dependencies are injected via constructor — no singleton imports.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 6.1, 6.2, 6.3
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
import { isRaftPacket } from './raft-packet-utils.js';
import { ADDRESS, NUM, STRING, TYPEOF } from '../constants/index.js';
import { assertRaftProviderContract } from './raft-provider-contract.js';
import { LiferaftProvider } from './liferaft-provider.js';
import { LeaderActivationGate } from './leader-activation-gate.js';
import { LeaderActivationScheduler } from './leader-activation-scheduler.js';
import { resolveRaftTransportDeliveryOptions } from './constants.js';
import { RAFT_GROUP_ADDRESS, RAFT_GROUP_DEFAULT, RAFT_GROUP_ERROR_MSG, RAFT_GROUP_EVENT, RAFT_GROUP_LIFERAFT_EVENT, RAFT_GROUP_LIFERAFT_TIMER, RAFT_GROUP_LOG_MSG, RAFT_GROUP_ROLE } from './raft-group-constants.js';

/**
 * Hash modulo for fallback replica index calculation.
 * @type {number}
 */
const HASH_MODULO = NUM.TEN;

/**
 * Liferaft timer name used to clear heartbeat and election timers.
 * @type {string}
 */
const HEARTBEAT_ELECTION_TIMER = stryMutAct_9fa48("127679") ? "" : (stryCov_9fa48("127679"), 'heartbeat, election');

/**
 * Liferaft internal event name for incoming data packets.
 * @type {string}
 */
const LIFERAFT_DATA_EVENT = stryMutAct_9fa48("127680") ? "" : (stryCov_9fa48("127680"), 'data');
function resolveActivationNodeId(options = {}) {
  if (stryMutAct_9fa48("127681")) {
    {}
  } else {
    stryCov_9fa48("127681");
    if (stryMutAct_9fa48("127684") ? typeof options.nodeId === TYPEOF.STRING || options.nodeId.length > NUM.ZERO : stryMutAct_9fa48("127683") ? false : stryMutAct_9fa48("127682") ? true : (stryCov_9fa48("127682", "127683", "127684"), (stryMutAct_9fa48("127686") ? typeof options.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("127685") ? true : (stryCov_9fa48("127685", "127686"), typeof options.nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("127689") ? options.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("127688") ? options.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("127687") ? true : (stryCov_9fa48("127687", "127688", "127689"), options.nodeId.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("127690")) {
        {}
      } else {
        stryCov_9fa48("127690");
        return options.nodeId;
      }
    }
    if (stryMutAct_9fa48("127693") ? typeof options.unifiedAddress !== TYPEOF.STRING && options.unifiedAddress.length === NUM.ZERO : stryMutAct_9fa48("127692") ? false : stryMutAct_9fa48("127691") ? true : (stryCov_9fa48("127691", "127692", "127693"), (stryMutAct_9fa48("127695") ? typeof options.unifiedAddress === TYPEOF.STRING : stryMutAct_9fa48("127694") ? false : (stryCov_9fa48("127694", "127695"), typeof options.unifiedAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("127697") ? options.unifiedAddress.length !== NUM.ZERO : stryMutAct_9fa48("127696") ? false : (stryCov_9fa48("127696", "127697"), options.unifiedAddress.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("127698")) {
        {}
      } else {
        stryCov_9fa48("127698");
        return stryMutAct_9fa48("127699") ? "" : (stryCov_9fa48("127699"), 'shared-node');
      }
    }
    const [nodeId] = options.unifiedAddress.split(RAFT_GROUP_ADDRESS.SEPARATOR);
    return (stryMutAct_9fa48("127702") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("127701") ? false : stryMutAct_9fa48("127700") ? true : (stryCov_9fa48("127700", "127701", "127702"), (stryMutAct_9fa48("127704") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("127703") ? true : (stryCov_9fa48("127703", "127704"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("127707") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("127706") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("127705") ? true : (stryCov_9fa48("127705", "127706", "127707"), nodeId.length > NUM.ZERO)))) ? nodeId : stryMutAct_9fa48("127708") ? "" : (stryCov_9fa48("127708"), 'shared-node');
  }
}

/**
 * Composable class that encapsulates the complete liferaft lifecycle.
 * Used by partition and message group services via composition.
 * @extends EventEmitter
 */
class RaftGroup extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Array<string>} [options.replicaIds] - All replica IDs in group.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.entityType - Entity type (partition/message-group).
   * @param {Object} options.peerAddressResolver - PeerAddressResolver instance.
   * @param {string} [options.unifiedAddress] - Pre-computed unified address.
   * @param {Array<string>} [options.peerAddresses] - Known peer addresses.
   * @param {Object} [options.logAdapter] - Log adapter for liferaft.
   * @param {boolean} [options.deferElection] - Defer election start.
   * @param {number} [options.heartbeatMs] - Heartbeat interval.
   * @param {number} [options.electionMinMs] - Min election timeout.
   * @param {number} [options.electionMaxMs] - Max election timeout.
   * @param {number} [options.electionJitterPerReplicaMs] - Jitter per replica.
   * @param {Object} [options.raftProvider] - Provider implementing raft node contract.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("127709")) {
      {}
    } else {
      stryCov_9fa48("127709");
      super();
      this.validateOptions(options);
      this.raftProvider = stryMutAct_9fa48("127712") ? options.raftProvider && new LiferaftProvider() : stryMutAct_9fa48("127711") ? false : stryMutAct_9fa48("127710") ? true : (stryCov_9fa48("127710", "127711", "127712"), options.raftProvider || new LiferaftProvider());
      assertRaftProviderContract(this.raftProvider);
      this.replicaId = options.replicaId;
      this.replicaIds = stryMutAct_9fa48("127715") ? options.replicaIds && [this.replicaId] : stryMutAct_9fa48("127714") ? false : stryMutAct_9fa48("127713") ? true : (stryCov_9fa48("127713", "127714", "127715"), options.replicaIds || (stryMutAct_9fa48("127716") ? [] : (stryCov_9fa48("127716"), [this.replicaId])));
      this.transport = options.transport;
      this.entityType = options.entityType;
      this.peerAddressResolver = options.peerAddressResolver;
      this.unifiedAddress = stryMutAct_9fa48("127719") ? options.unifiedAddress && this.replicaId : stryMutAct_9fa48("127718") ? false : stryMutAct_9fa48("127717") ? true : (stryCov_9fa48("127717", "127718", "127719"), options.unifiedAddress || this.replicaId);
      this.peerAddresses = stryMutAct_9fa48("127722") ? options.peerAddresses && [] : stryMutAct_9fa48("127721") ? false : stryMutAct_9fa48("127720") ? true : (stryCov_9fa48("127720", "127721", "127722"), options.peerAddresses || (stryMutAct_9fa48("127723") ? ["Stryker was here"] : (stryCov_9fa48("127723"), [])));
      this.logAdapter = stryMutAct_9fa48("127726") ? options.logAdapter && null : stryMutAct_9fa48("127725") ? false : stryMutAct_9fa48("127724") ? true : (stryCov_9fa48("127724", "127725", "127726"), options.logAdapter || null);
      this.deferElection = stryMutAct_9fa48("127729") ? options.deferElection && false : stryMutAct_9fa48("127728") ? false : stryMutAct_9fa48("127727") ? true : (stryCov_9fa48("127727", "127728", "127729"), options.deferElection || (stryMutAct_9fa48("127730") ? true : (stryCov_9fa48("127730"), false)));

      // Timing configuration
      this.heartbeatMs = stryMutAct_9fa48("127733") ? options.heartbeatMs && RAFT_GROUP_DEFAULT.HEARTBEAT_MS : stryMutAct_9fa48("127732") ? false : stryMutAct_9fa48("127731") ? true : (stryCov_9fa48("127731", "127732", "127733"), options.heartbeatMs || RAFT_GROUP_DEFAULT.HEARTBEAT_MS);
      this.electionMinMs = stryMutAct_9fa48("127736") ? options.electionMinMs && RAFT_GROUP_DEFAULT.ELECTION_MIN_MS : stryMutAct_9fa48("127735") ? false : stryMutAct_9fa48("127734") ? true : (stryCov_9fa48("127734", "127735", "127736"), options.electionMinMs || RAFT_GROUP_DEFAULT.ELECTION_MIN_MS);
      this.electionMaxMs = stryMutAct_9fa48("127739") ? options.electionMaxMs && RAFT_GROUP_DEFAULT.ELECTION_MAX_MS : stryMutAct_9fa48("127738") ? false : stryMutAct_9fa48("127737") ? true : (stryCov_9fa48("127737", "127738", "127739"), options.electionMaxMs || RAFT_GROUP_DEFAULT.ELECTION_MAX_MS);
      this.electionJitterPerReplicaMs = stryMutAct_9fa48("127742") ? options.electionJitterPerReplicaMs && RAFT_GROUP_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS : stryMutAct_9fa48("127741") ? false : stryMutAct_9fa48("127740") ? true : (stryCov_9fa48("127740", "127741", "127742"), options.electionJitterPerReplicaMs || RAFT_GROUP_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS);
      this.logger = stryMutAct_9fa48("127745") ? options.logger && console : stryMutAct_9fa48("127744") ? false : stryMutAct_9fa48("127743") ? true : (stryCov_9fa48("127743", "127744", "127745"), options.logger || console);
      this.activationNodeId = resolveActivationNodeId(options);
      this.leaderActivationStabilizationMs = (stryMutAct_9fa48("127748") ? Number.isFinite(options.leaderActivationStabilizationMs) || options.leaderActivationStabilizationMs >= NUM.ZERO : stryMutAct_9fa48("127747") ? false : stryMutAct_9fa48("127746") ? true : (stryCov_9fa48("127746", "127747", "127748"), Number.isFinite(options.leaderActivationStabilizationMs) && (stryMutAct_9fa48("127751") ? options.leaderActivationStabilizationMs < NUM.ZERO : stryMutAct_9fa48("127750") ? options.leaderActivationStabilizationMs > NUM.ZERO : stryMutAct_9fa48("127749") ? true : (stryCov_9fa48("127749", "127750", "127751"), options.leaderActivationStabilizationMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationStabilizationMs) : RAFT_GROUP_DEFAULT.LEADER_ACTIVATION_STABILIZATION_MS;
      this.leaderActivationNodeSpacingMs = (stryMutAct_9fa48("127754") ? Number.isFinite(options.leaderActivationNodeSpacingMs) || options.leaderActivationNodeSpacingMs >= NUM.ZERO : stryMutAct_9fa48("127753") ? false : stryMutAct_9fa48("127752") ? true : (stryCov_9fa48("127752", "127753", "127754"), Number.isFinite(options.leaderActivationNodeSpacingMs) && (stryMutAct_9fa48("127757") ? options.leaderActivationNodeSpacingMs < NUM.ZERO : stryMutAct_9fa48("127756") ? options.leaderActivationNodeSpacingMs > NUM.ZERO : stryMutAct_9fa48("127755") ? true : (stryCov_9fa48("127755", "127756", "127757"), options.leaderActivationNodeSpacingMs >= NUM.ZERO)))) ? Math.floor(options.leaderActivationNodeSpacingMs) : RAFT_GROUP_DEFAULT.LEADER_ACTIVATION_NODE_SPACING_MS;
      this.leaderActivationScheduler = stryMutAct_9fa48("127760") ? options.leaderActivationScheduler && LeaderActivationScheduler.getShared({
        nodeId: this.activationNodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      }) : stryMutAct_9fa48("127759") ? false : stryMutAct_9fa48("127758") ? true : (stryCov_9fa48("127758", "127759", "127760"), options.leaderActivationScheduler || LeaderActivationScheduler.getShared(stryMutAct_9fa48("127761") ? {} : (stryCov_9fa48("127761"), {
        nodeId: this.activationNodeId,
        spacingMs: this.leaderActivationNodeSpacingMs
      })));
      this.leaderActivationGate = new LeaderActivationGate(stryMutAct_9fa48("127762") ? {} : (stryCov_9fa48("127762"), {
        holdoffMs: this.leaderActivationStabilizationMs,
        activationScheduler: this.leaderActivationScheduler
      }));

      // Raft state
      this.raft = null;
      this.role = RAFT_GROUP_ROLE.FOLLOWER;
      this.leaderId = null;
      this.isLeader = stryMutAct_9fa48("127763") ? true : (stryCov_9fa48("127763"), false);
      this.initialized = stryMutAct_9fa48("127764") ? true : (stryCov_9fa48("127764"), false);
      this.electionStarted = stryMutAct_9fa48("127765") ? true : (stryCov_9fa48("127765"), false);
    }
  }

  /**
   * Validate required constructor options.
   * @param {Object} options - Constructor options.
   * @throws {Error} If required options are missing.
   * @private
   */
  validateOptions(options) {
    if (stryMutAct_9fa48("127766")) {
      {}
    } else {
      stryCov_9fa48("127766");
      if (stryMutAct_9fa48("127769") ? false : stryMutAct_9fa48("127768") ? true : stryMutAct_9fa48("127767") ? options.replicaId : (stryCov_9fa48("127767", "127768", "127769"), !options.replicaId)) {
        if (stryMutAct_9fa48("127770")) {
          {}
        } else {
          stryCov_9fa48("127770");
          throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_REPLICA_ID);
        }
      }
      if (stryMutAct_9fa48("127773") ? false : stryMutAct_9fa48("127772") ? true : stryMutAct_9fa48("127771") ? options.entityType : (stryCov_9fa48("127771", "127772", "127773"), !options.entityType)) {
        if (stryMutAct_9fa48("127774")) {
          {}
        } else {
          stryCov_9fa48("127774");
          throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_ENTITY_TYPE);
        }
      }
      if (stryMutAct_9fa48("127777") ? false : stryMutAct_9fa48("127776") ? true : stryMutAct_9fa48("127775") ? options.transport : (stryCov_9fa48("127775", "127776", "127777"), !options.transport)) {
        if (stryMutAct_9fa48("127778")) {
          {}
        } else {
          stryCov_9fa48("127778");
          throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_TRANSPORT);
        }
      }
      if (stryMutAct_9fa48("127781") ? false : stryMutAct_9fa48("127780") ? true : stryMutAct_9fa48("127779") ? options.peerAddressResolver : (stryCov_9fa48("127779", "127780", "127781"), !options.peerAddressResolver)) {
        if (stryMutAct_9fa48("127782")) {
          {}
        } else {
          stryCov_9fa48("127782");
          throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_PEER_ADDRESS_RESOLVER);
        }
      }
    }
  }

  /**
   * Create liferaft instance and wire events.
   * Must be called before joinPeers() or startElection().
   */
  initialize() {
    if (stryMutAct_9fa48("127783")) {
      {}
    } else {
      stryCov_9fa48("127783");
      if (stryMutAct_9fa48("127785") ? false : stryMutAct_9fa48("127784") ? true : (stryCov_9fa48("127784", "127785"), this.initialized)) {
        if (stryMutAct_9fa48("127786")) {
          {}
        } else {
          stryCov_9fa48("127786");
          throw new Error(RAFT_GROUP_ERROR_MSG.ALREADY_INITIALIZED);
        }
      }
      this.logger.info(RAFT_GROUP_LOG_MSG.INITIALIZING, stryMutAct_9fa48("127787") ? {} : (stryCov_9fa48("127787"), {
        replicaId: this.replicaId,
        replicaCount: this.replicaIds.length,
        deferElection: this.deferElection
      }));
      this.createRaftInstance();
      this.wireRaftEvents();
      if (stryMutAct_9fa48("127790") ? this.deferElection || this.raft : stryMutAct_9fa48("127789") ? false : stryMutAct_9fa48("127788") ? true : (stryCov_9fa48("127788", "127789", "127790"), this.deferElection && this.raft)) {
        if (stryMutAct_9fa48("127791")) {
          {}
        } else {
          stryCov_9fa48("127791");
          this.raftProvider.clearTimers(this.raft, HEARTBEAT_ELECTION_TIMER);
          this.logger.debug(RAFT_GROUP_LOG_MSG.CLEARED_LIFERAFT_TIMERS, stryMutAct_9fa48("127792") ? {} : (stryCov_9fa48("127792"), {
            replicaId: this.replicaId
          }));
        }
      }
      this.initialized = stryMutAct_9fa48("127793") ? false : (stryCov_9fa48("127793"), true);
      this.logger.info(RAFT_GROUP_LOG_MSG.INITIALIZED, stryMutAct_9fa48("127794") ? {} : (stryCov_9fa48("127794"), {
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Create the liferaft instance with jitter-based election timeouts.
   * @private
   */
  createRaftInstance() {
    if (stryMutAct_9fa48("127795")) {
      {}
    } else {
      stryCov_9fa48("127795");
      const {
        electionMinMs,
        electionMaxMs
      } = this.computeElectionTimeouts();
      const logAdapter = this.logAdapter;
      const RaftNode = this.raftProvider.createNodeClass(stryMutAct_9fa48("127796") ? {} : (stryCov_9fa48("127796"), {
        deferElection: this.deferElection,
        logger: this.logger,
        replicaId: this.replicaId,
        resolvePeerAddress: stryMutAct_9fa48("127797") ? () => undefined : (stryCov_9fa48("127797"), peerId => this.peerAddressResolver.resolve(peerId, this.peerAddresses)),
        deliverPacket: stryMutAct_9fa48("127798") ? () => undefined : (stryCov_9fa48("127798"), (peerAddress, packet) => this.transport.deliver(peerAddress, packet, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("127799") ? {} : (stryCov_9fa48("127799"), {
          ...packet,
          targetAddress: peerAddress
        }))))
      }));
      const raftOptions = stryMutAct_9fa48("127800") ? {} : (stryCov_9fa48("127800"), {
        [RAFT_GROUP_LIFERAFT_TIMER.HEARTBEAT]: this.heartbeatMs,
        [RAFT_GROUP_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
        [RAFT_GROUP_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs
      });
      if (stryMutAct_9fa48("127802") ? false : stryMutAct_9fa48("127801") ? true : (stryCov_9fa48("127801", "127802"), logAdapter)) {
        if (stryMutAct_9fa48("127803")) {
          {}
        } else {
          stryCov_9fa48("127803");
          raftOptions[RAFT_GROUP_LIFERAFT_TIMER.LOG] = function () {
            if (stryMutAct_9fa48("127804")) {
              {}
            } else {
              stryCov_9fa48("127804");
              return logAdapter;
            }
          };
        }
      }
      this.raft = new RaftNode(this.unifiedAddress, raftOptions);
    }
  }

  /**
   * Compute election timeouts with replica-index-based jitter.
   * @return {{electionMinMs: number, electionMaxMs: number}}
   * @private
   */
  computeElectionTimeouts() {
    if (stryMutAct_9fa48("127805")) {
      {}
    } else {
      stryCov_9fa48("127805");
      let replicaIndex = this.replicaIds.indexOf(this.replicaId);
      if (stryMutAct_9fa48("127809") ? replicaIndex >= NUM.ZERO : stryMutAct_9fa48("127808") ? replicaIndex <= NUM.ZERO : stryMutAct_9fa48("127807") ? false : stryMutAct_9fa48("127806") ? true : (stryCov_9fa48("127806", "127807", "127808", "127809"), replicaIndex < NUM.ZERO)) {
        if (stryMutAct_9fa48("127810")) {
          {}
        } else {
          stryCov_9fa48("127810");
          const hashCode = this.replicaId.split(STRING.EMPTY).reduce(stryMutAct_9fa48("127811") ? () => undefined : (stryCov_9fa48("127811"), (acc, char) => stryMutAct_9fa48("127812") ? acc - char.charCodeAt(NUM.ZERO) : (stryCov_9fa48("127812"), acc + char.charCodeAt(NUM.ZERO))), NUM.ZERO);
          replicaIndex = stryMutAct_9fa48("127813") ? this.replicaIds.length - hashCode % HASH_MODULO : (stryCov_9fa48("127813"), this.replicaIds.length + (stryMutAct_9fa48("127814") ? hashCode * HASH_MODULO : (stryCov_9fa48("127814"), hashCode % HASH_MODULO)));
        }
      }
      const jitterMs = stryMutAct_9fa48("127815") ? replicaIndex / this.electionJitterPerReplicaMs : (stryCov_9fa48("127815"), replicaIndex * this.electionJitterPerReplicaMs);
      return stryMutAct_9fa48("127816") ? {} : (stryCov_9fa48("127816"), {
        electionMinMs: stryMutAct_9fa48("127817") ? this.electionMinMs - jitterMs : (stryCov_9fa48("127817"), this.electionMinMs + jitterMs),
        electionMaxMs: stryMutAct_9fa48("127818") ? this.electionMaxMs - jitterMs : (stryCov_9fa48("127818"), this.electionMaxMs + jitterMs)
      });
    }
  }

  /**
   * Wire all six liferaft events to RaftGroup events.
   * @private
   */
  wireRaftEvents() {
    if (stryMutAct_9fa48("127819")) {
      {}
    } else {
      stryCov_9fa48("127819");
      const isSingleReplica = stryMutAct_9fa48("127822") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("127821") ? false : stryMutAct_9fa48("127820") ? true : (stryCov_9fa48("127820", "127821", "127822"), this.replicaIds.length === NUM.ONE);
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.LEADER, () => {
        if (stryMutAct_9fa48("127823")) {
          {}
        } else {
          stryCov_9fa48("127823");
          this.role = RAFT_GROUP_ROLE.LEADER;
          this.isLeader = stryMutAct_9fa48("127824") ? false : (stryCov_9fa48("127824"), true);
          this.leaderId = this.replicaId;
          const term = this.raftProvider.getCurrentTerm(this.raft);
          this.scheduleLeaderActivation(term);
        }
      });
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.FOLLOWER, () => {
        if (stryMutAct_9fa48("127825")) {
          {}
        } else {
          stryCov_9fa48("127825");
          if (stryMutAct_9fa48("127828") ? isSingleReplica || this.isLeader : stryMutAct_9fa48("127827") ? false : stryMutAct_9fa48("127826") ? true : (stryCov_9fa48("127826", "127827", "127828"), isSingleReplica && this.isLeader)) {
            if (stryMutAct_9fa48("127829")) {
              {}
            } else {
              stryCov_9fa48("127829");
              return;
            }
          }
          this.role = RAFT_GROUP_ROLE.FOLLOWER;
          this.isLeader = stryMutAct_9fa48("127830") ? true : (stryCov_9fa48("127830"), false);
          this.cancelLeaderActivation();
          this.emit(RAFT_GROUP_EVENT.FOLLOWER);
        }
      });
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.CANDIDATE, () => {
        if (stryMutAct_9fa48("127831")) {
          {}
        } else {
          stryCov_9fa48("127831");
          if (stryMutAct_9fa48("127834") ? isSingleReplica || this.isLeader : stryMutAct_9fa48("127833") ? false : stryMutAct_9fa48("127832") ? true : (stryCov_9fa48("127832", "127833", "127834"), isSingleReplica && this.isLeader)) {
            if (stryMutAct_9fa48("127835")) {
              {}
            } else {
              stryCov_9fa48("127835");
              return;
            }
          }
          this.role = RAFT_GROUP_ROLE.CANDIDATE;
          this.isLeader = stryMutAct_9fa48("127836") ? true : (stryCov_9fa48("127836"), false);
          this.cancelLeaderActivation();
          this.emit(RAFT_GROUP_EVENT.CANDIDATE);
        }
      });
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.COMMIT, command => {
        if (stryMutAct_9fa48("127837")) {
          {}
        } else {
          stryCov_9fa48("127837");
          this.emit(RAFT_GROUP_EVENT.COMMIT, command);
        }
      });
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.LEADER_CHANGE, to => {
        if (stryMutAct_9fa48("127838")) {
          {}
        } else {
          stryCov_9fa48("127838");
          this.leaderId = to;
          this.logger.debug(RAFT_GROUP_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("127839") ? {} : (stryCov_9fa48("127839"), {
            newLeader: to,
            replicaId: this.replicaId
          }));
          this.emit(RAFT_GROUP_EVENT.LEADER_CHANGE, to);
        }
      });
      this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.TERM_CHANGE, term => {
        if (stryMutAct_9fa48("127840")) {
          {}
        } else {
          stryCov_9fa48("127840");
          this.emit(RAFT_GROUP_EVENT.TERM_CHANGE, term);
        }
      });
    }
  }

  /**
   * Join all peer replicas to the Raft cluster.
   * Resolves each peer via PeerAddressResolver, skipping self.
   */
  joinPeers() {
    if (stryMutAct_9fa48("127841")) {
      {}
    } else {
      stryCov_9fa48("127841");
      for (const peerId of this.replicaIds) {
        if (stryMutAct_9fa48("127842")) {
          {}
        } else {
          stryCov_9fa48("127842");
          if (stryMutAct_9fa48("127845") ? peerId === this.replicaId : stryMutAct_9fa48("127844") ? false : stryMutAct_9fa48("127843") ? true : (stryCov_9fa48("127843", "127844", "127845"), peerId !== this.replicaId)) {
            if (stryMutAct_9fa48("127846")) {
              {}
            } else {
              stryCov_9fa48("127846");
              const peerAddress = this.peerAddressResolver.resolve(peerId, this.peerAddresses);
              this.logger.info(RAFT_GROUP_LOG_MSG.JOINING_PEER_ADDRESS, stryMutAct_9fa48("127847") ? {} : (stryCov_9fa48("127847"), {
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
   * Start election timer (multi-replica) or promote to leader (single).
   * Idempotent — calling multiple times has no additional effect.
   */
  startElection() {
    if (stryMutAct_9fa48("127848")) {
      {}
    } else {
      stryCov_9fa48("127848");
      if (stryMutAct_9fa48("127850") ? false : stryMutAct_9fa48("127849") ? true : (stryCov_9fa48("127849", "127850"), this.electionStarted)) {
        if (stryMutAct_9fa48("127851")) {
          {}
        } else {
          stryCov_9fa48("127851");
          this.logger.debug(RAFT_GROUP_LOG_MSG.ELECTION_ALREADY_STARTED, stryMutAct_9fa48("127852") ? {} : (stryCov_9fa48("127852"), {
            replicaId: this.replicaId
          }));
          return;
        }
      }
      this.electionStarted = stryMutAct_9fa48("127853") ? false : (stryCov_9fa48("127853"), true);
      if (stryMutAct_9fa48("127856") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("127855") ? false : stryMutAct_9fa48("127854") ? true : (stryCov_9fa48("127854", "127855", "127856"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("127857")) {
          {}
        } else {
          stryCov_9fa48("127857");
          this.handleSingleReplicaPromotion();
          return;
        }
      }
      if (stryMutAct_9fa48("127859") ? false : stryMutAct_9fa48("127858") ? true : (stryCov_9fa48("127858", "127859"), this.raft)) {
        if (stryMutAct_9fa48("127860")) {
          {}
        } else {
          stryCov_9fa48("127860");
          this.logger.info(RAFT_GROUP_LOG_MSG.STARTING_ELECTION_TIMER, stryMutAct_9fa48("127861") ? {} : (stryCov_9fa48("127861"), {
            replicaId: this.replicaId,
            peerCount: stryMutAct_9fa48("127862") ? this.replicaIds.length + NUM.ONE : (stryCov_9fa48("127862"), this.replicaIds.length - NUM.ONE)
          }));
          this.raftProvider.startElectionTimer(this.raft);
        }
      }
    }
  }

  /**
   * Immediately promote single-replica group to leader.
   * @private
   */
  handleSingleReplicaPromotion() {
    if (stryMutAct_9fa48("127863")) {
      {}
    } else {
      stryCov_9fa48("127863");
      this.role = RAFT_GROUP_ROLE.LEADER;
      this.isLeader = stryMutAct_9fa48("127864") ? false : (stryCov_9fa48("127864"), true);
      this.leaderId = this.replicaId;
      this.logger.info(RAFT_GROUP_LOG_MSG.SINGLE_REPLICA_LEADER, stryMutAct_9fa48("127865") ? {} : (stryCov_9fa48("127865"), {
        replicaId: this.replicaId
      }));
      this.scheduleLeaderActivation(this.raftProvider.getCurrentTerm(this.raft), stryMutAct_9fa48("127866") ? {} : (stryCov_9fa48("127866"), {
        immediate: stryMutAct_9fa48("127867") ? false : (stryCov_9fa48("127867"), true)
      }));
    }
  }

  /**
   * Handle incoming Raft packet.
   * Validates sender address format and emits to liferaft.
   * @param {Object} message - Incoming message (raw or wrapped).
   * @return {Object|null} Processing result or null if not a Raft packet.
   */
  handleRaftPacket(message) {
    if (stryMutAct_9fa48("127868")) {
      {}
    } else {
      stryCov_9fa48("127868");
      const payload = stryMutAct_9fa48("127871") ? message.payload && message : stryMutAct_9fa48("127870") ? false : stryMutAct_9fa48("127869") ? true : (stryCov_9fa48("127869", "127870", "127871"), message.payload || message);
      if (stryMutAct_9fa48("127874") ? false : stryMutAct_9fa48("127873") ? true : stryMutAct_9fa48("127872") ? isRaftPacket(payload) : (stryCov_9fa48("127872", "127873", "127874"), !isRaftPacket(payload))) {
        if (stryMutAct_9fa48("127875")) {
          {}
        } else {
          stryCov_9fa48("127875");
          return null;
        }
      }
      if (stryMutAct_9fa48("127878") ? false : stryMutAct_9fa48("127877") ? true : stryMutAct_9fa48("127876") ? this.raft : (stryCov_9fa48("127876", "127877", "127878"), !this.raft)) {
        if (stryMutAct_9fa48("127879")) {
          {}
        } else {
          stryCov_9fa48("127879");
          return null;
        }
      }
      this.logger.trace(RAFT_GROUP_LOG_MSG.RECEIVED_RAFT_PACKET, stryMutAct_9fa48("127880") ? {} : (stryCov_9fa48("127880"), {
        type: payload.type,
        term: payload.term,
        address: payload.address,
        replicaId: this.replicaId
      }));
      const senderAddress = payload.address;
      const isValidSenderAddress = stryMutAct_9fa48("127883") ? senderAddress && typeof senderAddress === TYPEOF.STRING || senderAddress.includes(ADDRESS.SEPARATOR) : stryMutAct_9fa48("127882") ? false : stryMutAct_9fa48("127881") ? true : (stryCov_9fa48("127881", "127882", "127883"), (stryMutAct_9fa48("127885") ? senderAddress || typeof senderAddress === TYPEOF.STRING : stryMutAct_9fa48("127884") ? true : (stryCov_9fa48("127884", "127885"), senderAddress && (stryMutAct_9fa48("127887") ? typeof senderAddress !== TYPEOF.STRING : stryMutAct_9fa48("127886") ? true : (stryCov_9fa48("127886", "127887"), typeof senderAddress === TYPEOF.STRING)))) && senderAddress.includes(ADDRESS.SEPARATOR));
      if (stryMutAct_9fa48("127890") ? false : stryMutAct_9fa48("127889") ? true : stryMutAct_9fa48("127888") ? isValidSenderAddress : (stryCov_9fa48("127888", "127889", "127890"), !isValidSenderAddress)) {
        if (stryMutAct_9fa48("127891")) {
          {}
        } else {
          stryCov_9fa48("127891");
          this.logger.error(RAFT_GROUP_LOG_MSG.INVALID_SENDER_ADDRESS, stryMutAct_9fa48("127892") ? {} : (stryCov_9fa48("127892"), {
            senderAddress,
            expectedFormat: RAFT_GROUP_ADDRESS.SEPARATOR,
            packetType: payload.type,
            term: payload.term,
            replicaId: this.replicaId
          }));
        }
      }
      const transport = this.transport;
      const logger = this.logger;
      const write = responsePacket => {
        if (stryMutAct_9fa48("127893")) {
          {}
        } else {
          stryCov_9fa48("127893");
          Promise.resolve(responsePacket).then(resolvedPacket => {
            if (stryMutAct_9fa48("127894")) {
              {}
            } else {
              stryCov_9fa48("127894");
              if (stryMutAct_9fa48("127897") ? false : stryMutAct_9fa48("127896") ? true : stryMutAct_9fa48("127895") ? resolvedPacket : (stryCov_9fa48("127895", "127896", "127897"), !resolvedPacket)) {
                if (stryMutAct_9fa48("127898")) {
                  {}
                } else {
                  stryCov_9fa48("127898");
                  return null;
                }
              }
              if (stryMutAct_9fa48("127901") ? false : stryMutAct_9fa48("127900") ? true : stryMutAct_9fa48("127899") ? isValidSenderAddress : (stryCov_9fa48("127899", "127900", "127901"), !isValidSenderAddress)) {
                if (stryMutAct_9fa48("127902")) {
                  {}
                } else {
                  stryCov_9fa48("127902");
                  logger.warn(RAFT_GROUP_LOG_MSG.SKIPPING_RAFT_RESPONSE, stryMutAct_9fa48("127903") ? {} : (stryCov_9fa48("127903"), {
                    type: resolvedPacket.type,
                    destination: senderAddress,
                    term: resolvedPacket.term
                  }));
                  return null;
                }
              }
              logger.trace(RAFT_GROUP_LOG_MSG.SENDING_RAFT_RESPONSE, stryMutAct_9fa48("127904") ? {} : (stryCov_9fa48("127904"), {
                type: resolvedPacket.type,
                term: resolvedPacket.term
              }));
              return transport.deliver(senderAddress, resolvedPacket, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("127905") ? {} : (stryCov_9fa48("127905"), {
                ...resolvedPacket,
                targetAddress: senderAddress
              })));
            }
          }).catch(err => {
            if (stryMutAct_9fa48("127906")) {
              {}
            } else {
              stryCov_9fa48("127906");
              logger.error(RAFT_GROUP_LOG_MSG.FAILED_RAFT_RESPONSE, stryMutAct_9fa48("127907") ? {} : (stryCov_9fa48("127907"), {
                error: err.message,
                destination: senderAddress
              }));
            }
          });
        }
      };
      this.raft.emit(LIFERAFT_DATA_EVENT, payload, write);
      return stryMutAct_9fa48("127908") ? {} : (stryCov_9fa48("127908"), {
        acknowledged: stryMutAct_9fa48("127909") ? false : (stryCov_9fa48("127909"), true)
      });
    }
  }

  /**
   * Shutdown: clear all timers, end liferaft, emit shutdown event.
   * Safe to call on uninitialized groups.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("127910")) {
      {}
    } else {
      stryCov_9fa48("127910");
      this.logger.info(RAFT_GROUP_LOG_MSG.SHUTDOWN_START, stryMutAct_9fa48("127911") ? {} : (stryCov_9fa48("127911"), {
        replicaId: this.replicaId
      }));
      this.leaderActivationGate.shutdown();
      if (stryMutAct_9fa48("127913") ? false : stryMutAct_9fa48("127912") ? true : (stryCov_9fa48("127912", "127913"), this.raft)) {
        if (stryMutAct_9fa48("127914")) {
          {}
        } else {
          stryCov_9fa48("127914");
          this.raftProvider.shutdownNode(this.raft);
          this.raft = null;
        }
      }
      this.initialized = stryMutAct_9fa48("127915") ? true : (stryCov_9fa48("127915"), false);
      this.electionStarted = stryMutAct_9fa48("127916") ? true : (stryCov_9fa48("127916"), false);
      this.emit(RAFT_GROUP_EVENT.SHUTDOWN, stryMutAct_9fa48("127917") ? {} : (stryCov_9fa48("127917"), {
        replicaId: this.replicaId
      }));
      this.logger.info(RAFT_GROUP_LOG_MSG.SHUTDOWN_COMPLETE, stryMutAct_9fa48("127918") ? {} : (stryCov_9fa48("127918"), {
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    if (stryMutAct_9fa48("127919")) {
      {}
    } else {
      stryCov_9fa48("127919");
      return this.role;
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("127920")) {
      {}
    } else {
      stryCov_9fa48("127920");
      return stryMutAct_9fa48("127923") ? this.role !== RAFT_GROUP_ROLE.LEADER : stryMutAct_9fa48("127922") ? false : stryMutAct_9fa48("127921") ? true : (stryCov_9fa48("127921", "127922", "127923"), this.role === RAFT_GROUP_ROLE.LEADER);
    }
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    if (stryMutAct_9fa48("127924")) {
      {}
    } else {
      stryCov_9fa48("127924");
      return this.leaderId;
    }
  }

  /**
   * Get the current Raft term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    if (stryMutAct_9fa48("127925")) {
      {}
    } else {
      stryCov_9fa48("127925");
      return this.raftProvider.getCurrentTerm(this.raft);
    }
  }

  /**
   * Get the raw raft provider node instance.
   * @return {Object|null} The raft node instance.
   */
  getRaftInstance() {
    if (stryMutAct_9fa48("127926")) {
      {}
    } else {
      stryCov_9fa48("127926");
      return this.raft;
    }
  }
  cancelLeaderActivation() {
    if (stryMutAct_9fa48("127927")) {
      {}
    } else {
      stryCov_9fa48("127927");
      this.leaderActivationGate.cancel(stryMutAct_9fa48("127928") ? {} : (stryCov_9fa48("127928"), {
        clearActivatedTerm: stryMutAct_9fa48("127929") ? false : (stryCov_9fa48("127929"), true)
      }));
    }
  }
  scheduleLeaderActivation(term, options = {}) {
    if (stryMutAct_9fa48("127930")) {
      {}
    } else {
      stryCov_9fa48("127930");
      this.leaderActivationGate.schedule(term, () => {
        if (stryMutAct_9fa48("127931")) {
          {}
        } else {
          stryCov_9fa48("127931");
          if (stryMutAct_9fa48("127934") ? false : stryMutAct_9fa48("127933") ? true : stryMutAct_9fa48("127932") ? this.isLeaderReplica() : (stryCov_9fa48("127932", "127933", "127934"), !this.isLeaderReplica())) {
            if (stryMutAct_9fa48("127935")) {
              {}
            } else {
              stryCov_9fa48("127935");
              return;
            }
          }
          this.logger.info(RAFT_GROUP_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("127936") ? {} : (stryCov_9fa48("127936"), {
            term,
            replicaId: this.replicaId
          }));
          this.emit(RAFT_GROUP_EVENT.LEADER, stryMutAct_9fa48("127937") ? {} : (stryCov_9fa48("127937"), {
            leaderId: this.replicaId,
            term
          }));
        }
      }, stryMutAct_9fa48("127938") ? {} : (stryCov_9fa48("127938"), {
        immediate: stryMutAct_9fa48("127941") ? options.immediate !== true : stryMutAct_9fa48("127940") ? false : stryMutAct_9fa48("127939") ? true : (stryCov_9fa48("127939", "127940", "127941"), options.immediate === (stryMutAct_9fa48("127942") ? false : (stryCov_9fa48("127942"), true))),
        shouldActivate: stryMutAct_9fa48("127943") ? () => undefined : (stryCov_9fa48("127943"), () => this.isLeaderReplica())
      }));
    }
  }
}
export { RaftGroup };