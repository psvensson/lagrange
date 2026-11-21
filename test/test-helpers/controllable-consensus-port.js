/**
 * A controllable consensus operation port for replica unit suites. A suite
 * drives role, leader, term, proposals, steps and configuration changes by
 * hand; the port it builds has the production frozen operation-port shape
 * (createRaftOperationPort) over the request the replica itself states, and
 * a committed command is applied through the production proposal codec and
 * application-transaction owner on the replica's own database.
 *
 * currentTermApplied (the rs-raft status field: this replica leads and has
 * applied an entry of its current term) is a stated simplification here: the
 * term-start entry is treated as already applied whenever the double leads; a
 * test that needs the barrier sets currentTermApplied explicitly.
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
import {applyCommittedEntrySliceTransaction} from
  '../../src/raft/raft-rs-application-transaction-owner.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {
  HEALTHY,
  PEER_ADDRESS_STATUS,
  USABLE,
} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {pendingTurn, settledTurn, turnFromForeignAnswer} from '../../src/raft/raft-rs-turn-answer.js';

function testCoreOk(fields = {}) {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    ...fields,
  });
}

const DEFAULT_PORT_STATE = Object.freeze({
  groupId: null,
  replicaIdentity: null,
  peerId: 1,
  role: RAFT_ROLE.FOLLOWER,
  term: 1,
  leaderId: null,
  leaderAddress: null,
  leaderAddressStatus: null,
  configurationKey: 'fixture-configuration',
  membershipGenerationIndex: 1,
  runtimeGeneration: 1,
  lifecycleIncarnation: 1,
  bootstrapIndex: 1,
  admissionIndex: 1,
  runtimeHealth: HEALTHY,
  groupHealth: USABLE,
});

function freezePeerStatus(peer, index) {
  const address = typeof peer?.address === 'string' &&
    peer.address.length > 0 ? peer.address : null;
  const fallbackStatus = address !== null ?
    PEER_ADDRESS_STATUS.RESOLVED : PEER_ADDRESS_STATUS.UNAVAILABLE;
  return deepFreeze({
    peerId: peer?.peerId ?? index + 2,
    learner: peer?.learner === true,
    addressStatus: peer?.addressStatus || fallbackStatus,
    ...peer,
    address,
  });
}

function resolveLeaderAddressStatus(leaderId, leaderAddress, explicitStatus) {
  if (explicitStatus) return explicitStatus;
  if (!leaderId) return PEER_ADDRESS_STATUS.NO_LEADER;
  return typeof leaderAddress === 'string' && leaderAddress.length > 0 ?
    PEER_ADDRESS_STATUS.RESOLVED :
    PEER_ADDRESS_STATUS.UNAVAILABLE;
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
function normalizeBatchSlices(orderedCommands, batchSizes) {
  if (!Array.isArray(batchSizes) || batchSizes.length === 0) {
    return [orderedCommands];
  }
  const slices = [];
  let cursor = 0;
  for (const rawSize of batchSizes) {
    const size = Number(rawSize);
    if (!Number.isSafeInteger(size) || size <= 0 || cursor + size > orderedCommands.length) {
      throw new RangeError('Invalid batchSizes for applyCommandThroughApplicationOwner');
    }
    slices.push(orderedCommands.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor !== orderedCommands.length) {
    throw new RangeError('batchSizes sum must match commands.length');
  }
  return slices;
}

/**
 * Apply one committed command or an ordered command sequence with explicit
 * batch boundaries (e.g. `[1, 1]` vs `[2]`) the way the rs-raft runtime applies
 * committed entries: each command round-trips through the production proposal
 * codec and each batch runs in one `applyCommittedEntrySliceTransaction` on
 * the given database. Throws (after rollback effects ran) when application fails.
 * @param {Object} options - {database, groupId, index, startIndex, term,
 *   command, commands, batchSizes, applyCommittedEntry}.
 */
export function applyCommandThroughApplicationOwner({database, groupId, index,
  startIndex, term, command, commands, batchSizes, applyCommittedEntry}) {
  const orderedCommands = Array.isArray(commands) ? commands : [command];
  if (orderedCommands.length === 0) return;
  const baseIndex = Number(startIndex ?? index ?? 1);
  const store = new RaftRsDurableStore(database);
  const slices = normalizeBatchSlices(orderedCommands, batchSizes);
  let offset = 0;
  for (const slice of slices) {
    applyCommittedEntrySliceTransaction({
      store,
      groupId,
      entries: slice.map((cmd, idx) => ({
        index: String(baseIndex + offset + idx),
        term: String(term),
        entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
        data: Buffer.from(encodeProposal(cmd)).toString('base64'),
      })),
      confState: {},
      applyCommittedEntry: (bytes, position) => applyCommittedEntry(
        Object.freeze({
          command: decodeCommittedProposal(bytes),
          index: Number(position.index),
          term: Number(position.term),
          effects: position.effects,
        })),
    });
    offset += slice.length;
  }
}

export function applyCommandsThroughApplicationOwner(options) {
  return applyCommandThroughApplicationOwner(options);
}

// A peer without a committed node has no address: the production status
// reports it as unavailable (raft-rs-status-observation.js), never throws.
function resolvedPeerAddress(resolveAddress, identity, nodeId) {
  try {
    return resolveAddress(identity, nodeId);
  } catch {
    return null;
  }
}

/**
 * The leadership a hand-built (non-PartitionService) ledger stub exposes, in
 * the real service's shape: its leadershipTenure token and a consensus port
 * whose status says it leads with its term start applied (the simplification
 * above). Subscriptions are accepted and never fire.
 * @param {number} [term] - The tenure's term.
 * @return {{leadershipTenure: Object, raft: Object}}
 */
export function leadingLedgerStubFields(term = 1) {
  return {
    leadershipTenure: Object.freeze({term}),
    raft: Object.freeze({
      readStatus: () => deepFreeze({role: RAFT_ROLE.LEADER, term, currentTermApplied: true}),
      subscribe: () => () => {},
    }),
  };
}

export class ControllableConsensusPort {
  constructor(options = {}) {
    Object.assign(this, DEFAULT_PORT_STATE);
    for (const key of Object.keys(DEFAULT_PORT_STATE)) {
      if (options[key] !== undefined && options[key] !== null) {
        this[key] = options[key];
      }
    }
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
    // The leader's view of each follower's matched index, by replica
    // identity (the production status's followerProgress); a suite sets it
    // by hand.
    this.followerProgress = {};
    this.gateOpen = options.gateOpen !== false;
    this.identityRecorded = options.identityRecorded !== false;
    this.confChangePending = false;
    // The simplification above: null answers "applied whenever it leads".
    this.currentTermApplied = null;
  }

  /**
   * Commit one proposed command the way the rs-raft runtime applies a
   * committed entry (see applyCommandThroughApplicationOwner). Throws (after
   * the rollback effects ran) when the application fails.
   * @param {Object} command - The proposed command.
   */
  commit(command) {
    this.commitBatches([command], [1]);
  }

  commitBatch(commands) {
    if (!Array.isArray(commands) || commands.length === 0) return;
    this.commitBatches(commands, [commands.length]);
  }

  commitBatches(commands, batchSizes = null) {
    if (!Array.isArray(commands) || commands.length === 0) return;
    const slices = normalizeBatchSlices(commands, batchSizes);
    for (const slice of slices) {
      const startIndex = this.committedIndex + 1;
      applyCommandThroughApplicationOwner({
        database: this.request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE],
        groupId: this.request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID],
        startIndex,
        term: this.term,
        commands: slice,
        batchSizes: [slice.length],
        applyCommittedEntry:
          this.request[RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY],
      });
      this.committedIndex = startIndex + slice.length - 1;
    }
  }

  createOperationPort(request) {
    this.request = request;
    // The production runtime opens the group's durable store when it creates
    // the group (raft-rs-runtime-owner.js createRuntimeDispatcher), so the
    // rs-raft tables exist before any entry is committed; the double does the
    // same over the replica's own database.
    const database = request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE];
    if (database) {
      const store = new RaftRsDurableStore(database);
      const groupId = this.groupId ?? request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID];
      if (this.committedIndex === 0 && groupId) {
        const durableApplied = Number(store.readDurableProgress(groupId).appliedIndex);
        if (Number.isSafeInteger(durableApplied) && durableApplied > 0) {
          this.committedIndex = durableApplied;
        }
      }
    }
    if (!this.peersGiven) {
      // The production port's initial configuration: every bootstrap peer
      // of the request is a voter, reported with its replica identity and
      // the address the request's own resolver gives it.
      const localIdentity = request[RAFT_OPERATION_PORT_REQUEST.PEER_ID];
      const resolveAddress =
        request[RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS];
      // The production port hands the resolver each peer's committed node:
      // for a founder, the node its GENESIS stamp placed it on.
      const founderNodeIds = request[
        RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]?.founderNodeIds || {};
      this.peers = (request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS] ||
        []).filter((identity) => identity !== localIdentity)
        .map((identity) => ({
          address: resolvedPeerAddress(resolveAddress, identity,
            founderNodeIds[identity] ?? null),
          replicaIdentity: identity,
        }));
    }
    const subscribe = (eventName, listener) => {
      const listeners = this.listeners.get(eventName) || new Set();
      listeners.add(listener);
      this.listeners.set(eventName, listeners);
      return Object.freeze(() => listeners.delete(listener));
    };
    // Every protocol operation answers the port's named turn
    // (raft-rs-turn-answer.js); a handler's answer is foreign to the double,
    // so it is named once, where the double receives it.
    return createRaftOperationPort({
      subscribe,
      step: (envelope) => {
        this.steps.push(envelope);
        const result = this.stepHandler ? this.stepHandler(envelope) : null;
        return settledTurn(result?.outcome ? result : testCoreOk());
      },
      propose: (entry) => pendingTurn((async () => {
        const result = this.proposeHandler ?
          await this.proposeHandler(entry) :
          null;
        return result?.outcome ? result : testCoreOk();
      })()),
      proposeConfChange: (change) => {
        this.confChanges.push({...change});
        // A handler answers for the port (a refusal, a deferral, a queued
        // proposal); the double records exactly what the port answered.
        const answered = this.confChangeHandler ?
          this.confChangeHandler(change) : null;
        if (answered) {
          this.confChangeOutcomes.push(answered);
          return turnFromForeignAnswer(answered);
        }
        if (change?.type === 'remove-peer') {
          // The production port removes by replica identity only.
          this.peers = this.peers.filter(
            (peer) => peer?.replicaIdentity !== change.replicaIdentity,
          );
        } else if (change?.type === 'add-peer') {
          // The admission commits the peer's node; the production port then
          // addresses it through the request's resolver from that node.
          this.peers = [
            ...this.peers,
            {
              address: resolvedPeerAddress(
                this.request[RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS],
                change.replicaIdentity, change.nodeId ?? null),
              replicaIdentity: change.replicaIdentity || null,
            },
          ];
        }
        const proposed = testCoreOk();
        this.confChangeOutcomes.push(proposed);
        return settledTurn(proposed);
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
        return settledTurn(outcome);
      },
      transferLeadership: (request) => {
        this.transferRequests.push(request);
        const answered = this.transferHandler ?
          this.transferHandler(request) : null;
        return settledTurn(answered?.outcome ? answered : testCoreOk());
      },
      probePeerProgress: () => settledTurn(testCoreOk()),
      tick: () => settledTurn(testCoreOk()),
      campaign: () => {
        const answered = this.campaignHandler ? this.campaignHandler() : null;
        if (answered?.outcome) {
          return settledTurn(answered);
        }
        this.setRole(RAFT_ROLE.LEADER);
        return settledTurn(testCoreOk());
      },
      readStatus: () => {
        const peers = this.peers.map(freezePeerStatus);
        const matchedLeaderPeer = peers.find(
          (peer) => peer.replicaIdentity === this.leaderId,
        );
        const leaderAddress = this.leaderAddress ??
          (this.leaderId ? matchedLeaderPeer?.address : null) ?? null;
        const leaderAddressStatus = resolveLeaderAddressStatus(
          this.leaderId,
          leaderAddress,
          this.leaderAddressStatus,
        );
        const req = this.request;
        return deepFreeze({
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          groupId: this.groupId ??
            req?.[RAFT_OPERATION_PORT_REQUEST.GROUP_ID] ?? null,
          replicaIdentity: this.replicaIdentity ??
            req?.[RAFT_OPERATION_PORT_REQUEST.PEER_ID] ?? null,
          peerId: this.peerId,
          term: this.term,
          commitIndex: this.committedIndex,
          // The double applies every command it commits, so its applied and
          // last indices are its committed index.
          appliedIndex: this.committedIndex,
          lastIndex: this.committedIndex,
          followerProgress: {...this.followerProgress},
          role: this.role,
          leaderId: this.leaderId,
          leaderAddress,
          leaderAddressStatus,
          peerCount: peers.length,
          peers,
          configurationKey: this.configurationKey,
          membershipGenerationIndex: this.membershipGenerationIndex,
          runtimeGeneration: this.runtimeGeneration,
          lifecycleIncarnation: this.lifecycleIncarnation,
          bootstrapIndex: this.bootstrapIndex,
          admissionIndex: this.admissionIndex,
          gateOpen: this.gateOpen,
          identityRecorded: this.identityRecorded,
          runtimeHealth: this.runtimeHealth,
          groupHealth: this.groupHealth,
          confChangePending: this.confChangePending,
          currentTermApplied: this.currentTermApplied ??
            this.role === RAFT_ROLE.LEADER,
        });
      },
      // The fake holds no committed configuration; a test that needs one
      // answers through committedMembershipHandler.
      readCommittedMembership: (request) => this.committedMembershipHandler ?
        this.committedMembershipHandler(request) : deepFreeze({
          kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
          reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE}),
      configureTick: () => settledTurn(testCoreOk()),
      startScheduling: () => {
        this.schedulingCalls.push('start');
        return settledTurn(testCoreOk());
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
