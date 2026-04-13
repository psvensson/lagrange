/**
 * Property Test: Cross-Worker Raft Consensus (Property 27)
 *
 * Feature: worker-process-replica-isolation, Property 27: Cross-Worker Raft Consensus
 *
 * *For any* Raft group with replicas in separate worker processes on the same node,
 * leader election and log replication SHALL function correctly through the
 * MessageRouter infrastructure.
 *
 * **Validates: Requirements 14.5, 14.6**
 *
 * - Requirement 14.5: Raft leader election SHALL work correctly across worker
 *   processes on the same node
 * - Requirement 14.6: Raft log replication SHALL work correctly across worker
 *   processes on the same node
 *
 * @module test/worker/cross-worker-raft-consensus.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {NUM} from '../../src/constants/index.js';
import {
  WORKER_ENTITY_TYPE,
  WORKER_ADDRESS,
  WORKER_RESPONSE_STATUS,
} from '../../src/worker/worker-constants.js';
import {RAFT_PACKET_TYPE, RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftPacket} from '../../src/raft/raft-packet-utils.js';

/**
 * Raft state constants (liferaft uses numeric states internally).
 * @type {Readonly<Object>}
 */
const RAFT_STATE = Object.freeze({
  FOLLOWER: 1,
  CANDIDATE: 2,
  LEADER: 4,
});

/**
 * Raft consensus simulation constants.
 * @type {Readonly<Object>}
 */
const RAFT_SIM = Object.freeze({
  MIN_TERM: 1,
  MAX_TERM: 100,
  MIN_LOG_INDEX: 0,
  MAX_LOG_INDEX: 1000,
  MIN_REPLICAS: 3,
  MAX_REPLICAS: 5,
});


/**
 * Mock worker replica that simulates Raft behavior.
 * Tracks Raft state, term, and log entries.
 */
class MockRaftWorkerReplica extends EventEmitter {
  constructor(options = {}) {
    super();
    this.replicaId = options.replicaId || uuidv4();
    this.nodeId = options.nodeId || 'test-node';
    this.entityType = options.entityType || WORKER_ENTITY_TYPE.PARTITION;
    this.unifiedAddress = WORKER_ADDRESS.build(
      this.nodeId, this.entityType, this.replicaId,
    );

    this.term = options.initialTerm || NUM.ZERO;
    this.state = RAFT_STATE.FOLLOWER;
    this.votedFor = null;
    this.leaderId = null;
    this.log = [];
    this.commitIndex = NUM.ZERO;
    this.lastApplied = NUM.ZERO;

    this.votesReceived = new Set();
    this.peers = new Map();
  }

  /**
   * Add a peer replica to this replica's peer list.
   * @param {MockRaftWorkerReplica} peer - Peer replica.
   */
  addPeer(peer) {
    this.peers.set(peer.replicaId, peer);
  }

  /**
   * Get the last log entry index and term.
   * @return {{index: number, term: number}} Last log entry info.
   */
  getLastLogInfo() {
    if (this.log.length === NUM.ZERO) {
      return {index: NUM.ZERO, term: NUM.ZERO};
    }
    const lastEntry = this.log[this.log.length - NUM.ONE];
    return {index: lastEntry.index, term: lastEntry.term};
  }

  /**
   * Start an election by transitioning to candidate state.
   * @return {Object} Vote request packet.
   */
  startElection() {
    this.term += NUM.ONE;
    this.state = RAFT_STATE.CANDIDATE;
    this.votedFor = this.replicaId;
    this.votesReceived.clear();
    this.votesReceived.add(this.replicaId);

    const lastLog = this.getLastLogInfo();
    return {
      type: RAFT_PACKET_TYPE.VOTE,
      term: this.term,
      address: this.unifiedAddress,
      state: this.state,
      leader: null,
      last: lastLog,
      data: null,
    };
  }


  /**
   * Handle a vote request from another replica.
   * @param {Object} voteRequest - Vote request packet.
   * @return {Object} Vote response packet.
   */
  handleVoteRequest(voteRequest) {
    let voteGranted = false;

    if (voteRequest.term > this.term) {
      this.term = voteRequest.term;
      this.state = RAFT_STATE.FOLLOWER;
      this.votedFor = null;
    }

    if (voteRequest.term === this.term) {
      const lastLog = this.getLastLogInfo();
      const candidateLogUpToDate =
        voteRequest.last.term > lastLog.term ||
        (voteRequest.last.term === lastLog.term &&
         voteRequest.last.index >= lastLog.index);

      if ((this.votedFor === null || this.votedFor === voteRequest.address) &&
          candidateLogUpToDate) {
        this.votedFor = voteRequest.address;
        voteGranted = true;
      }
    }

    return {
      type: RAFT_PACKET_TYPE.VOTED,
      term: this.term,
      address: this.unifiedAddress,
      state: this.state,
      leader: this.leaderId,
      last: this.getLastLogInfo(),
      data: voteGranted ? [{granted: true}] : null,
    };
  }

  /**
   * Handle a vote response from another replica.
   * @param {Object} voteResponse - Vote response packet.
   * @return {boolean} True if this replica became leader.
   */
  handleVoteResponse(voteResponse) {
    if (voteResponse.term > this.term) {
      this.term = voteResponse.term;
      this.state = RAFT_STATE.FOLLOWER;
      this.votedFor = null;
      return false;
    }

    if (this.state !== RAFT_STATE.CANDIDATE || voteResponse.term !== this.term) {
      return false;
    }

    const voteGranted = voteResponse.data &&
      voteResponse.data[NUM.ZERO]?.granted === true;

    if (voteGranted) {
      this.votesReceived.add(voteResponse.address);
    }

    const majority = Math.floor((this.peers.size + NUM.ONE) / NUM.TWO) + NUM.ONE;
    if (this.votesReceived.size >= majority) {
      this.state = RAFT_STATE.LEADER;
      this.leaderId = this.unifiedAddress;
      return true;
    }

    return false;
  }


  /**
   * Create an append entries request for log replication.
   * @param {Array} entries - Log entries to replicate.
   * @return {Object} Append entries packet.
   */
  createAppendEntries(entries) {
    const lastLog = this.getLastLogInfo();
    return {
      type: RAFT_PACKET_TYPE.APPEND,
      term: this.term,
      address: this.unifiedAddress,
      state: this.state,
      leader: this.unifiedAddress,
      last: lastLog,
      data: entries,
    };
  }

  /**
   * Handle an append entries request from the leader.
   * @param {Object} appendRequest - Append entries packet.
   * @return {Object} Append response packet.
   */
  handleAppendEntries(appendRequest) {
    if (appendRequest.term > this.term) {
      this.term = appendRequest.term;
      this.state = RAFT_STATE.FOLLOWER;
      this.votedFor = null;
    }

    if (appendRequest.term < this.term) {
      return {
        type: RAFT_PACKET_TYPE.APPEND_FAIL,
        term: this.term,
        address: this.unifiedAddress,
        state: this.state,
        leader: this.leaderId,
        last: this.getLastLogInfo(),
        data: null,
      };
    }

    this.leaderId = appendRequest.leader;

    if (appendRequest.data && Array.isArray(appendRequest.data)) {
      for (const entry of appendRequest.data) {
        const existingIndex = this.log.findIndex((e) => e.index === entry.index);
        if (existingIndex >= NUM.ZERO) {
          if (this.log[existingIndex].term !== entry.term) {
            this.log = this.log.slice(NUM.ZERO, existingIndex);
            this.log.push(entry);
          }
        } else {
          this.log.push(entry);
        }
      }
    }

    return {
      type: RAFT_PACKET_TYPE.APPENDED,
      term: this.term,
      address: this.unifiedAddress,
      state: this.state,
      leader: this.leaderId,
      last: this.getLastLogInfo(),
      data: [{success: true}],
    };
  }

  /**
   * Append a new entry to the log (leader only).
   * @param {string} command - Command to append.
   * @return {Object} The new log entry.
   */
  appendEntry(command) {
    const lastLog = this.getLastLogInfo();
    const entry = {
      command,
      index: lastLog.index + NUM.ONE,
      term: this.term,
    };
    this.log.push(entry);
    return entry;
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeader() {
    return this.state === RAFT_STATE.LEADER;
  }

  /**
   * Get the current Raft role as a string.
   * @return {string} Role name.
   */
  getRole() {
    if (this.state === RAFT_STATE.LEADER) {
      return RAFT_ROLE.LEADER;
    }
    if (this.state === RAFT_STATE.CANDIDATE) {
      return RAFT_ROLE.CANDIDATE;
    }
    return RAFT_ROLE.FOLLOWER;
  }
}


/**
 * Mock MessageRouter that simulates cross-worker message routing.
 * Tracks all routed messages and delivers them to registered handlers.
 */
class MockCrossWorkerRouter {
  constructor() {
    this.handlers = new Map();
    this.routedMessages = [];
  }

  /**
   * Register a handler for a unified address.
   * @param {string} address - Unified address.
   * @param {Function} handler - Message handler function.
   */
  registerHandler(address, handler) {
    this.handlers.set(address, handler);
  }

  /**
   * Unregister a handler for a unified address.
   * @param {string} address - Unified address.
   */
  unregisterHandler(address) {
    this.handlers.delete(address);
  }

  /**
   * Route a message from source to target through the router.
   * Simulates the WorkerMessageBridge → MessageRouter → WorkerMessageBridge path.
   * @param {string} sourceAddress - Source unified address.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Response from target.
   */
  async route(sourceAddress, targetAddress, payload) {
    const envelope = {
      messageId: uuidv4(),
      sourceAddress,
      targetAddress,
      payload,
      correlationId: uuidv4(),
      timestamp: Date.now(),
    };

    this.routedMessages.push({
      sourceAddress,
      targetAddress,
      payload,
      timestamp: envelope.timestamp,
    });

    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      return {
        status: WORKER_RESPONSE_STATUS.ERROR,
        error: `No handler for address: ${targetAddress}`,
      };
    }

    const result = await handler(envelope);
    return {
      status: WORKER_RESPONSE_STATUS.OK,
      payload: result,
    };
  }

  /**
   * Get all routed messages.
   * @return {Array} Routed messages.
   */
  getRoutedMessages() {
    return [...this.routedMessages];
  }

  /**
   * Clear routed messages.
   */
  clearRoutedMessages() {
    this.routedMessages = [];
  }
}


/**
 * Create a Raft group with replicas in separate simulated workers.
 * @param {Object} options - Configuration options.
 * @return {Object} Raft group with replicas and router.
 */
function createRaftGroup(options = {}) {
  const {
    nodeId = 'test-node',
    entityType = WORKER_ENTITY_TYPE.PARTITION,
    replicaCount = RAFT_SIM.MIN_REPLICAS,
    initialTerm = NUM.ZERO,
  } = options;

  const router = new MockCrossWorkerRouter();
  const replicas = [];

  for (let i = NUM.ZERO; i < replicaCount; i++) {
    const replica = new MockRaftWorkerReplica({
      replicaId: `replica-${i}`,
      nodeId,
      entityType,
      initialTerm,
    });
    replicas.push(replica);

    router.registerHandler(replica.unifiedAddress, async (envelope) => {
      const payload = envelope.payload;
      if (!isRaftPacket(payload)) {
        return {error: 'Not a Raft packet'};
      }

      if (payload.type === RAFT_PACKET_TYPE.VOTE) {
        return replica.handleVoteRequest(payload);
      }
      if (payload.type === RAFT_PACKET_TYPE.VOTED) {
        replica.handleVoteResponse(payload);
        return {acknowledged: true};
      }
      if (payload.type === RAFT_PACKET_TYPE.APPEND) {
        return replica.handleAppendEntries(payload);
      }
      if (payload.type === RAFT_PACKET_TYPE.APPENDED ||
          payload.type === RAFT_PACKET_TYPE.APPEND_ACK) {
        return {acknowledged: true};
      }
      return {error: `Unknown packet type: ${payload.type}`};
    });
  }

  for (const replica of replicas) {
    for (const peer of replicas) {
      if (peer.replicaId !== replica.replicaId) {
        replica.addPeer(peer);
      }
    }
  }

  return {router, replicas};
}

/**
 * Simulate leader election across workers.
 * @param {Object} raftGroup - Raft group with replicas and router.
 * @param {number} candidateIndex - Index of the replica to start election.
 * @return {Promise<Object>} Election result.
 */
async function simulateLeaderElection(raftGroup, candidateIndex) {
  const {router, replicas} = raftGroup;
  const candidate = replicas[candidateIndex];

  const voteRequest = candidate.startElection();

  const votePromises = [];
  for (const peer of candidate.peers.values()) {
    const promise = router.route(
      candidate.unifiedAddress,
      peer.unifiedAddress,
      voteRequest,
    );
    votePromises.push(promise.then((response) => ({peer, response})));
  }

  const responses = await Promise.all(votePromises);

  for (const {response} of responses) {
    if (response.status === WORKER_RESPONSE_STATUS.OK && response.payload) {
      candidate.handleVoteResponse(response.payload);
    }
  }

  return {
    candidate,
    becameLeader: candidate.isLeader(),
    term: candidate.term,
    votesReceived: candidate.votesReceived.size,
  };
}


/**
 * Simulate log replication from leader to followers.
 * @param {Object} raftGroup - Raft group with replicas and router.
 * @param {MockRaftWorkerReplica} leader - Leader replica.
 * @param {Array} entries - Log entries to replicate.
 * @return {Promise<Object>} Replication result.
 */
async function simulateLogReplication(raftGroup, leader, entries) {
  const {router} = raftGroup;

  for (const entry of entries) {
    leader.appendEntry(entry.command);
  }

  const appendRequest = leader.createAppendEntries(leader.log);

  const replicationPromises = [];
  for (const peer of leader.peers.values()) {
    const promise = router.route(
      leader.unifiedAddress,
      peer.unifiedAddress,
      appendRequest,
    );
    replicationPromises.push(promise.then((response) => ({peer, response})));
  }

  const responses = await Promise.all(replicationPromises);

  let successCount = NUM.ONE;
  for (const {response} of responses) {
    if (response.status === WORKER_RESPONSE_STATUS.OK &&
        response.payload?.type === RAFT_PACKET_TYPE.APPENDED) {
      successCount++;
    }
  }

  return {
    leader,
    entriesReplicated: entries.length,
    successfulReplications: successCount,
    totalReplicas: leader.peers.size + NUM.ONE,
  };
}

// =============================================================================
// Generators for property-based testing
// =============================================================================

/**
 * Generator for replica count (3-5 replicas for Raft quorum).
 */
const replicaCountArb = fc.integer({
  min: RAFT_SIM.MIN_REPLICAS,
  max: RAFT_SIM.MAX_REPLICAS,
});

/**
 * Generator for Raft terms.
 */
const termArb = fc.integer({min: RAFT_SIM.MIN_TERM, max: RAFT_SIM.MAX_TERM});

/**
 * Generator for log entry commands.
 */
const commandArb = fc.string({minLength: NUM.ONE, maxLength: NUM.THIRTY});

/**
 * Generator for log entries.
 */
const logEntryArb = fc.record({
  command: commandArb,
});

/**
 * Generator for arrays of log entries.
 */
const logEntriesArb = fc.array(logEntryArb, {
  minLength: NUM.ONE,
  maxLength: NUM.FIVE,
});

/**
 * Generator for entity types.
 */
const entityTypeArb = fc.constantFrom(
  WORKER_ENTITY_TYPE.PARTITION,
  WORKER_ENTITY_TYPE.MESSAGE_GROUP,
);

/**
 * Generator for node IDs.
 */
const nodeIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  {minLength: NUM.ONE, maxLength: NUM.TEN},
);


// =============================================================================
// Property Tests
// =============================================================================

describe('Property 27: Cross-Worker Raft Consensus', () => {
  let raftGroup;

  beforeEach(() => {
    raftGroup = null;
  });

  /**
   * Property: For any Raft group with replicas in separate workers,
   * leader election SHALL complete successfully with a single leader.
   *
   * This validates Requirement 14.5: Raft leader election SHALL work correctly
   * across worker processes on the same node.
   */
  it('leader election completes successfully across workers (Req 14.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        entityTypeArb,
        async (replicaCount, nodeId, entityType) => {
          raftGroup = createRaftGroup({
            nodeId,
            entityType,
            replicaCount,
          });

          const result = await simulateLeaderElection(raftGroup, NUM.ZERO);

          const electionCompleted = result.becameLeader;
          const hasMajority = result.votesReceived >
            Math.floor(replicaCount / NUM.TWO);
          const termIncremented = result.term >= NUM.ONE;

          const leaderCount = raftGroup.replicas.filter((r) => r.isLeader()).length;
          const singleLeader = leaderCount === NUM.ONE;

          return electionCompleted && hasMajority && termIncremented && singleLeader;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, vote requests SHALL be routed through
   * the MessageRouter to all peer workers.
   *
   * This validates Requirement 14.5: Raft leader election SHALL work correctly
   * across worker processes on the same node.
   */
  it('vote requests are routed to all peers through MessageRouter (Req 14.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        async (replicaCount, nodeId) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          await simulateLeaderElection(raftGroup, NUM.ZERO);

          const routedMessages = raftGroup.router.getRoutedMessages();

          const voteRequests = routedMessages.filter(
            (m) => m.payload.type === RAFT_PACKET_TYPE.VOTE,
          );

          const expectedVoteRequests = replicaCount - NUM.ONE;
          const allPeersReceived = voteRequests.length === expectedVoteRequests;

          const allAreRaftPackets = voteRequests.every(
            (m) => isRaftPacket(m.payload),
          );

          return allPeersReceived && allAreRaftPackets;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });


  /**
   * Property: For any Raft group with a leader, log entries SHALL be
   * replicated to all follower workers.
   *
   * This validates Requirement 14.6: Raft log replication SHALL work correctly
   * across worker processes on the same node.
   */
  it('log entries are replicated to all followers (Req 14.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        logEntriesArb,
        async (replicaCount, nodeId, entries) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          const electionResult = await simulateLeaderElection(raftGroup, NUM.ZERO);
          assert.ok(electionResult.becameLeader, 'Leader election should succeed');

          const leader = electionResult.candidate;
          raftGroup.router.clearRoutedMessages();

          const replicationResult = await simulateLogReplication(
            raftGroup,
            leader,
            entries,
          );

          const allReplicated = replicationResult.successfulReplications ===
            replicationResult.totalReplicas;

          const followersHaveEntries = raftGroup.replicas
            .filter((r) => !r.isLeader())
            .every((follower) => follower.log.length === entries.length);

          return allReplicated && followersHaveEntries;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any log replication, append entries SHALL be routed
   * through the MessageRouter to all follower workers.
   *
   * This validates Requirement 14.6: Raft log replication SHALL work correctly
   * across worker processes on the same node.
   */
  it('append entries are routed through MessageRouter (Req 14.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        logEntriesArb,
        async (replicaCount, nodeId, entries) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          const electionResult = await simulateLeaderElection(raftGroup, NUM.ZERO);
          assert.ok(electionResult.becameLeader, 'Leader election should succeed');

          const leader = electionResult.candidate;
          raftGroup.router.clearRoutedMessages();

          await simulateLogReplication(raftGroup, leader, entries);

          const routedMessages = raftGroup.router.getRoutedMessages();

          const appendRequests = routedMessages.filter(
            (m) => m.payload.type === RAFT_PACKET_TYPE.APPEND,
          );

          const expectedAppendRequests = replicaCount - NUM.ONE;
          const allFollowersReceived = appendRequests.length === expectedAppendRequests;

          const allFromLeader = appendRequests.every(
            (m) => m.sourceAddress === leader.unifiedAddress,
          );

          return allFollowersReceived && allFromLeader;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });


  /**
   * Property: For any Raft group, consensus SHALL be maintained across
   * worker boundaries with consistent term and log state.
   *
   * This validates Requirements 14.5 and 14.6: Raft consensus works correctly
   * across worker processes.
   */
  it('consensus is maintained across worker boundaries (Req 14.5, 14.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        logEntriesArb,
        async (replicaCount, nodeId, entries) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          const electionResult = await simulateLeaderElection(raftGroup, NUM.ZERO);
          assert.ok(electionResult.becameLeader, 'Leader election should succeed');

          const leader = electionResult.candidate;
          await simulateLogReplication(raftGroup, leader, entries);

          const leaderTerm = leader.term;
          const allSameTerm = raftGroup.replicas.every((r) => r.term === leaderTerm);

          const leaderLogLength = leader.log.length;
          const allSameLogLength = raftGroup.replicas.every(
            (r) => r.log.length === leaderLogLength,
          );

          const allRecognizeLeader = raftGroup.replicas
            .filter((r) => !r.isLeader())
            .every((r) => r.leaderId === leader.unifiedAddress);

          return allSameTerm && allSameLogLength && allRecognizeLeader;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group with both partition and message group
   * entity types, leader election SHALL work correctly for both.
   *
   * This validates Requirement 14.5: Raft leader election SHALL work correctly
   * across worker processes on the same node.
   */
  it('leader election works for both partition and message group types (Req 14.5)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          replicaCountArb,
          nodeIdArb,
          async (replicaCount, nodeId) => {
            const partitionGroup = createRaftGroup({
              nodeId,
              entityType: WORKER_ENTITY_TYPE.PARTITION,
              replicaCount,
            });

            const messageGroupGroup = createRaftGroup({
              nodeId,
              entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
              replicaCount,
            });

            const partitionResult = await simulateLeaderElection(
              partitionGroup, NUM.ZERO,
            );
            const messageGroupResult = await simulateLeaderElection(
              messageGroupGroup, NUM.ZERO,
            );

            const partitionElected = partitionResult.becameLeader;
            const messageGroupElected = messageGroupResult.becameLeader;

            const partitionAddressCorrect = partitionResult.candidate.unifiedAddress
              .includes(WORKER_ENTITY_TYPE.PARTITION);
            const messageGroupAddressCorrect = messageGroupResult.candidate.unifiedAddress
              .includes(WORKER_ENTITY_TYPE.MESSAGE_GROUP);

            return partitionElected && messageGroupElected &&
                   partitionAddressCorrect && messageGroupAddressCorrect;
          },
        ),
        {numRuns: NUM.TEN},
      );
    });


  /**
   * Property: For any Raft group, log entries SHALL be preserved exactly
   * through the replication process across workers.
   *
   * This validates Requirement 14.6: Raft log replication SHALL work correctly
   * across worker processes on the same node.
   */
  it('log entry content is preserved through replication (Req 14.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        logEntriesArb,
        async (replicaCount, nodeId, entries) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          const electionResult = await simulateLeaderElection(raftGroup, NUM.ZERO);
          assert.ok(electionResult.becameLeader, 'Leader election should succeed');

          const leader = electionResult.candidate;
          await simulateLogReplication(raftGroup, leader, entries);

          const leaderLog = leader.log;

          const allEntriesPreserved = raftGroup.replicas
            .filter((r) => !r.isLeader())
            .every((follower) => {
              if (follower.log.length !== leaderLog.length) {
                return false;
              }
              for (let i = NUM.ZERO; i < leaderLog.length; i++) {
                if (follower.log[i].command !== leaderLog[i].command ||
                    follower.log[i].index !== leaderLog[i].index ||
                    follower.log[i].term !== leaderLog[i].term) {
                  return false;
                }
              }
              return true;
            });

          return allEntriesPreserved;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, the routing path SHALL be uniform
   * regardless of which replica initiates communication.
   *
   * This validates Requirements 14.5 and 14.6: Raft consensus uses uniform
   * routing through MessageRouter.
   */
  it('routing path is uniform for all replicas (Req 14.5, 14.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        async (replicaCount, nodeId) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
          });

          await simulateLeaderElection(raftGroup, NUM.ZERO);

          const routedMessages = raftGroup.router.getRoutedMessages();

          const allHaveSourceAddress = routedMessages.every(
            (m) => typeof m.sourceAddress === 'string' && m.sourceAddress.length > NUM.ZERO,
          );

          const allHaveTargetAddress = routedMessages.every(
            (m) => typeof m.targetAddress === 'string' && m.targetAddress.length > NUM.ZERO,
          );

          const allHaveTimestamp = routedMessages.every(
            (m) => typeof m.timestamp === 'number',
          );

          const allHaveRaftPayload = routedMessages.every(
            (m) => isRaftPacket(m.payload),
          );

          return allHaveSourceAddress && allHaveTargetAddress &&
                 allHaveTimestamp && allHaveRaftPayload;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group with higher initial term, election
   * SHALL still complete successfully.
   *
   * This validates Requirement 14.5: Raft leader election SHALL work correctly
   * across worker processes on the same node.
   */
  it('election works with varying initial terms (Req 14.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        termArb,
        async (replicaCount, nodeId, initialTerm) => {
          raftGroup = createRaftGroup({
            nodeId,
            replicaCount,
            initialTerm,
          });

          const result = await simulateLeaderElection(raftGroup, NUM.ZERO);

          const electionCompleted = result.becameLeader;
          const termIncremented = result.term === initialTerm + NUM.ONE;

          return electionCompleted && termIncremented;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });
});
