/**
 * Shared test support for PartitionService unit suites.
 *
 * These helpers were previously duplicated verbatim across the
 * partition-service test parts. They are extracted here unchanged so the
 * runnable suites can import a single semantic support module.
 */

import {EventEmitter} from 'node:events';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  createRaftOperationPort,
  deepFreeze,
} from '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../src/raft/raft-provider-contract-constants.js';
import {applyCommittedEntryTransaction} from
  '../../src/raft/raft-rs-application-transaction-owner.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {LIFECYCLE_PHASE} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  evaluateLearnerPromotionProof,
} from '../../src/raft/learner-promotion-progress.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {handlerIdentityApi} from
  '../test-helpers/replica-handler-identity-fixture.js';

const PROOF_STUB_TERM = 1;
const PROOF_STUB_COMMITTED_INDEX = 0;
const PROOF_STUB_MATCH_INDEX = 0;

function testCoreOk(fields = {}) {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    ...fields,
  });
}

/**
 * Apply one committed command the way the rs-raft runtime applies a committed
 * entry: the command round-trips through the production proposal codec and
 * the production application-transaction owner applies it on the given
 * database, handing the application the port's frozen committed record.
 * Throws (after the rollback effects ran) when the application fails.
 * @param {Object} options - {database, groupId, index, term, command,
 *   applyCommittedEntry}.
 */
export function applyCommandThroughApplicationOwner({database, groupId, index,
  term, command, applyCommittedEntry}) {
  applyCommittedEntryTransaction({
    store: new RaftRsDurableStore(database),
    groupId,
    entry: {
      index: String(index),
      term: String(term),
      entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
      data: Buffer.from(encodeProposal(command)).toString('base64'),
    },
    confState: {},
    applyCommittedEntry: (bytes, position) => applyCommittedEntry(
      Object.freeze({
        command: decodeCommittedProposal(bytes),
        index: Number(position.index),
        term: Number(position.term),
        effects: position.effects,
      })),
  });
}

export class ControllablePartitionRaftProvider {
  constructor(options = {}) {
    this.role = options.role || RAFT_ROLE.FOLLOWER;
    this.term = options.term || 1;
    this.leaderId = options.leaderId || null;
    this.leaderAddress = options.leaderAddress || null;
    // Without explicit peers the configuration is the one the production
    // port bootstraps: the request's bootstrap voters (see
    // createPartitionPort).
    this.peersGiven = Array.isArray(options.peers);
    this.peers = this.peersGiven ?
      options.peers.map((peer) => ({...peer})) :
      [];
    this.confChanges = [];
    this.request = null;
    this.proposeHandler = null;
    this.stepHandler = null;
    this.campaignHandler = null;
    this.confChangeHandler = null;
    this.confChangeOutcomes = [];
    this.transferRequests = [];
    this.transferHandler = null;
    this.listeners = new Map();
    this.steps = [];
    this.committedIndex = 0;
  }

  /**
   * Commit one proposed command the way the rs-raft runtime applies a
   * committed entry (see applyCommandThroughApplicationOwner). Throws (after
   * the rollback effects ran) when the application fails.
   * @param {Object} command - The proposed command.
   */
  commit(command) {
    const index = this.committedIndex + 1;
    applyCommandThroughApplicationOwner({
      database: this.request[RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE],
      groupId: this.request[RAFT_PARTITION_NODE_REQUEST.GROUP_ID],
      index,
      term: this.term,
      command,
      applyCommittedEntry:
        this.request[RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY],
    });
    this.committedIndex = index;
  }

  createPartitionPort(request) {
    this.request = request;
    if (!this.peersGiven) {
      // The production port's initial configuration: every bootstrap peer
      // of the request is a voter, reported with its replica identity and
      // the address the request's own resolver gives it.
      const localIdentity = request[RAFT_PARTITION_NODE_REQUEST.PEER_ID];
      const resolveAddress =
        request[RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS];
      this.peers = (request[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS] ||
        []).filter((identity) => identity !== localIdentity)
        .map((identity) => ({
          address: resolveAddress(identity),
          replicaIdentity: identity,
        }));
    }
    const subscribe = (eventName, listener) => {
      const listeners = this.listeners.get(eventName) || new Set();
      listeners.add(listener);
      this.listeners.set(eventName, listeners);
      return Object.freeze(() => listeners.delete(listener));
    };
    return createRaftOperationPort({
      subscribe,
      step: (envelope) => {
        this.steps.push(envelope);
        const result = this.stepHandler ? this.stepHandler(envelope) : null;
        return result?.outcome ? result : testCoreOk();
      },
      propose: async (entry) => {
        const result = this.proposeHandler ?
          await this.proposeHandler(entry) :
          null;
        return result?.outcome ? result : testCoreOk();
      },
      proposeConfChange: (change) => {
        this.confChanges.push({...change});
        // A handler answers for the port (a refusal, a deferral, a queued
        // proposal); the provider records exactly what the port answered.
        const answered = this.confChangeHandler ?
          this.confChangeHandler(change) : null;
        if (answered) {
          this.confChangeOutcomes.push(answered);
          return answered;
        }
        if (change?.type === 'remove-peer') {
          this.peers = this.peers.filter(
            (peer) => peer?.address !== change.peerAddress,
          );
        } else if (change?.type === 'add-peer') {
          this.peers = [
            ...this.peers,
            {
              address: change.peerAddress,
              replicaIdentity: change.replicaIdentity || null,
            },
          ];
        }
        const proposed = testCoreOk();
        this.confChangeOutcomes.push(proposed);
        return proposed;
      },
      transferLeadership: (request) => {
        this.transferRequests.push(request);
        const answered = this.transferHandler ?
          this.transferHandler(request) : null;
        return answered?.outcome ? answered : testCoreOk();
      },
      probePeerProgress: () => testCoreOk(),
      tick: () => testCoreOk(),
      campaign: () => {
        const answered = this.campaignHandler ? this.campaignHandler() : null;
        if (answered?.outcome) {
          return answered;
        }
        this.setRole(RAFT_ROLE.LEADER);
        return testCoreOk();
      },
      readStatus: () => deepFreeze({
        term: this.term,
        commitIndex: this.committedIndex,
        role: this.role,
        leaderId: this.leaderId,
        leaderAddress: this.leaderAddress,
        peerCount: this.peers.length,
        peers: this.peers.map((peer) => deepFreeze({...peer})),
      }),
      // The fake holds no committed configuration; a test that needs one
      // answers through committedMembershipHandler.
      readCommittedMembership: (request) => this.committedMembershipHandler ?
        this.committedMembershipHandler(request) : deepFreeze({
          kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
          reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE}),
      configureTick: () => testCoreOk(),
      startScheduling: () => testCoreOk(),
      stopScheduling: () => testCoreOk(),
      close: () => testCoreOk(),
    });
  }

  setTerm(term) {
    this.term = term;
  }

  emitEvent(eventName, ...args) {
    for (const listener of this.listeners.get(eventName) || []) {
      listener(...args);
    }
  }

  setRole(role) {
    this.role = role;
    this.leaderId = role === RAFT_ROLE.LEADER ?
      this.request?.peerId || null :
      null;
    this.emitEvent(role);
  }

  emitLeaderChange(leaderId, leaderAddress = null) {
    this.leaderId = leaderId;
    this.leaderAddress = leaderAddress || leaderId;
    this.emitEvent('leader change', leaderId);
  }

  setLeaderObservation(leaderId, leaderAddress) {
    this.leaderId = leaderId;
    this.leaderAddress = leaderAddress;
  }

  setProposeHandler(handler) {
    this.proposeHandler = handler;
  }

  setStepHandler(handler) {
    this.stepHandler = handler;
  }

  setCampaignHandler(handler) {
    this.campaignHandler = handler;
  }

  setConfChangeHandler(handler) {
    this.confChangeHandler = handler;
  }
}

// The test seam for a controllable consensus port. Production construction
// takes no provider and no backend selection (naming one is refused); a suite
// that drives roles and proposals by hand subclasses the service and builds
// its port from the controllable provider instead.
class ControllablePartitionService extends PartitionService {
  constructor(options, provider) {
    super(options);
    this.controllableProvider = provider;
  }

  createOperationPort(request) {
    return this.controllableProvider.createPartitionPort(request);
  }
}

/**
 * Construct a PartitionService whose operation port the given controllable
 * provider builds.
 * @param {Object} options - PartitionService construction options.
 * @param {ControllablePartitionRaftProvider} [provider] - The provider.
 * @return {PartitionService} The service.
 */
export function createControllablePartitionService(
  options,
  provider = new ControllablePartitionRaftProvider(),
) {
  return new ControllablePartitionService(options, provider);
}

/**
 * Stub ONLY the transport hop of the learner-promotion proof: the
 * leader-side evaluator and the learner-side validator both run for real,
 * so quorum-gate unit tests still exercise the full proof grammar with a
 * trivially caught-up learner (empty committed prefix).
 * @param {Object} partition service under test
 * @return {Promise<void>} resolves when the promotion check completes
 */
export function stubGrantedLearnerPromotionProof(partition) {
  partition.requestLearnerPromotionProofFromLeader = async () => {
    const membershipEpoch =
      partition.resolveLearnerPromotionMembershipEpoch();
    return evaluateLearnerPromotionProof({
      raftIsLeader: true,
      currentTerm: PROOF_STUB_TERM,
      committedIndex: PROOF_STUB_COMMITTED_INDEX,
      learnerMatchIndex: PROOF_STUB_MATCH_INDEX,
      leaderMembershipEpoch: membershipEpoch,
      learnerMembershipEpoch: membershipEpoch,
    });
  };
}

export async function checkLearnerPromotionWithGrantedProof(partition) {
  stubGrantedLearnerPromotionProof(partition);
  await partition.checkLearnerPromotion();
}

export function createLoopbackTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    ...handlerIdentityApi(handlers),
    async deliver(address, payload) {
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      return handler({payload});
    },
  };
}

export async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(predicate())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}
