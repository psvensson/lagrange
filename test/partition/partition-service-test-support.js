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
import {LIFECYCLE_PHASE} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  evaluateLearnerPromotionProof,
} from '../../src/raft/learner-promotion-progress.js';

const PROOF_STUB_TERM = 1;
const PROOF_STUB_COMMITTED_INDEX = 0;
const PROOF_STUB_MATCH_INDEX = 0;

function testCoreOk(fields = {}) {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    ...fields,
  });
}

export class ControllablePartitionRaftProvider {
  constructor(options = {}) {
    this.role = options.role || RAFT_ROLE.FOLLOWER;
    this.term = options.term || 1;
    this.commitIndex = Number.isFinite(options.commitIndex) ?
      Math.max(0, Math.floor(options.commitIndex)) :
      0;
    this.leaderId = options.leaderId || null;
    this.leaderAddress = options.leaderAddress || null;
    this.peers = Array.isArray(options.peers) ?
      options.peers.map((peer) => ({...peer})) :
      [];
    this.confChanges = [];
    this.followerProgress = {
      ...(options.followerProgress || {}),
    };
    this.peerDurableProgress = {
      ...(options.peerDurableProgress || {}),
    };
    this.request = null;
    this.proposeHandler = null;
    this.probePeerProgressHandler = null;
    this.stepHandler = null;
    this.listeners = new Map();
    this.steps = [];
  }

  createPartitionPort(request) {
    this.request = request;
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
        return testCoreOk();
      },
      probePeerProgress: async (peerAddress) => {
        const result = this.probePeerProgressHandler ?
          await this.probePeerProgressHandler(peerAddress) :
          null;
        return result?.outcome ? result : testCoreOk();
      },
      tick: () => testCoreOk(),
      campaign: () => {
        this.setRole(RAFT_ROLE.LEADER);
        return testCoreOk();
      },
      readStatus: () => deepFreeze({
        term: this.term,
        commitIndex: this.commitIndex,
        role: this.role,
        leaderId: this.leaderId,
        leaderAddress: this.leaderAddress,
        peerCount: this.peers.length,
        peers: this.peers.map((peer) => deepFreeze({...peer})),
        followerProgress: deepFreeze({...this.followerProgress}),
      }),
      configureTick: () => testCoreOk(),
      startScheduling: () => testCoreOk(),
      stopScheduling: () => testCoreOk(),
      close: () => testCoreOk(),
    });
  }

  setTerm(term) {
    this.term = term;
  }

  setCommittedIndex(index) {
    this.commitIndex = Number.isFinite(index) ?
      Math.max(0, Math.floor(index)) :
      this.commitIndex;
  }

  setFollowerProgress(peerAddress, index) {
    if (typeof peerAddress !== 'string' || peerAddress.length === 0) {
      return;
    }
    if (Number.isFinite(index)) {
      this.followerProgress[peerAddress] = Math.max(0, Math.floor(index));
    } else {
      delete this.followerProgress[peerAddress];
    }
  }

  setPeerDurableProgress(peerAddress, index) {
    if (typeof peerAddress !== 'string' || peerAddress.length === 0) {
      return;
    }
    if (Number.isFinite(index)) {
      this.peerDurableProgress[peerAddress] = Math.max(0, Math.floor(index));
    } else {
      delete this.peerDurableProgress[peerAddress];
    }
  }

  getPeerDurableProgress(peerAddress) {
    const value = this.peerDurableProgress[peerAddress];
    return Number.isFinite(value) ? value : null;
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

  setProbePeerProgressHandler(handler) {
    this.probePeerProgressHandler = handler;
  }

  setStepHandler(handler) {
    this.stepHandler = handler;
  }
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
