/**
 * A controllable consensus operation port for replica unit suites. A suite
 * drives role, leader, term, proposals, steps and configuration changes by
 * hand; the port it builds has the production frozen operation-port shape
 * (createRaftOperationPort) over the request the replica itself states, and
 * a committed command is applied through the production proposal codec and
 * application-transaction owner on the replica's own database.
 */

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  createRaftOperationPort,
  deepFreeze,
} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_OPERATION_OUTCOME,
} from
  '../../src/raft/raft-operation-port-constants.js';
import {membershipTransitionRefusal} from
  '../../src/raft/raft-rs-membership-transition.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../src/raft/raft-operation-port-request.js';
import {applyCommittedEntryTransaction} from
  '../../src/raft/raft-rs-application-transaction-owner.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';

export function testCoreOk(fields = {}) {
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

export class ControllableConsensusPort {
  constructor(options = {}) {
    this.role = options.role || RAFT_ROLE.FOLLOWER;
    this.term = options.term || 1;
    this.leaderId = options.leaderId || null;
    this.leaderAddress = options.leaderAddress || null;
    // Without explicit peers the configuration is the one the production
    // port bootstraps: the request's bootstrap voters (see
    // createOperationPort).
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
    this.membershipTransitionHandler = null;
    this.membershipTransitions = [];
    this.membershipTransitionOutcomes = [];
    this.transferRequests = [];
    this.transferHandler = null;
    this.listeners = new Map();
    this.steps = [];
    this.schedulingCalls = [];
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
      database: this.request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE],
      groupId: this.request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID],
      index,
      term: this.term,
      command,
      applyCommittedEntry:
        this.request[RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY],
    });
    this.committedIndex = index;
  }

  createOperationPort(request) {
    this.request = request;
    // The production runtime opens the group's durable store when it creates
    // the group (raft-rs-runtime-owner.js createRuntimeDispatcher), so the
    // rs-raft tables exist before any entry is committed; the double does the
    // same over the replica's own database.
    const database = request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE];
    if (database) {
      new RaftRsDurableStore(database);
    }
    if (!this.peersGiven) {
      // The production port's initial configuration: every bootstrap peer
      // of the request is a voter, reported with its replica identity and
      // the address the request's own resolver gives it.
      const localIdentity = request[RAFT_OPERATION_PORT_REQUEST.PEER_ID];
      const resolveAddress =
        request[RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS];
      this.peers = (request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS] ||
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
        // proposal); the double records exactly what the port answered.
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
      proposeMembershipTransition: (transition) => {
        this.membershipTransitions.push(transition);
        const answered = this.membershipTransitionHandler ?
          this.membershipTransitionHandler(transition) :
          null;
        const outcome = answered?.outcome ? answered :
          membershipTransitionRefusal(
            RAFT_MEMBERSHIP_TRANSITION_REASON
              .CONFIGURATION_GENERATION_UNAVAILABLE,
          );
        this.membershipTransitionOutcomes.push(outcome);
        return outcome;
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
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
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
      startScheduling: () => {
        this.schedulingCalls.push('start');
        return testCoreOk();
      },
      stopScheduling: () => {
        this.schedulingCalls.push('stop');
        return testCoreOk();
      },
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

  setMembershipTransitionHandler(handler) {
    this.membershipTransitionHandler = handler;
  }
}
