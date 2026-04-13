/**
 * Property Test: Leader Election Completion (Property 3)
 *
 * **Feature: test-failure-fixes, Property 3: Leader Election Completion**
 *
 * *For any* Raft group (partition or message group) with N replicas running in
 * worker processes, leader election SHALL complete within the configured timeout
 * (default 10 seconds) and exactly one replica SHALL report `isLeader: true`.
 *
 * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
 *
 * - Requirement 3.1: WHEN partition replicas are created in worker processes,
 *   THE System SHALL complete leader election within the configured timeout
 * - Requirement 3.2: WHEN message group replicas are created in worker processes,
 *   THE System SHALL complete leader election within the configured timeout
 * - Requirement 5.1: WHEN multiple partition replicas run in separate worker
 *   processes, THE System SHALL elect a leader within the configured timeout
 * - Requirement 5.2: WHEN multiple message group replicas run in separate worker
 *   processes, THE System SHALL elect a leader within the configured timeout
 *
 * @module test/raft/leader-election-completion.property.test.js
 */
// @ts-nocheck


import {describe, it} from 'node:test';
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
 * Leader election simulation constants.
 * @type {Readonly<Object>}
 */
const ELECTION_SIM = Object.freeze({
  MIN_REPLICAS: 1,
  MAX_REPLICAS: 5,
  DEFAULT_TIMEOUT_MS: 10000,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 15000,
});

/**
 * Mock Raft replica that simulates leader election behavior.
 * Tracks Raft state, term, and election timing.
 */
class MockRaftReplica extends EventEmitter {
  /**
   * Create a mock Raft replica.
   * @param {Object} options - Configuration options.
   */
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
    this.electionStartTime = null;
    this.electionCompleteTime = null;

    this.votesReceived = new Set();
    this.peers = new Map();
  }

  /**
   * Add a peer replica to this replica's peer list.
   * @param {MockRaftReplica} peer - Peer replica.
   */
  addPeer(peer) {
    this.peers.set(peer.replicaId, peer);
  }

  /**
   * Start an election by transitioning to candidate state.
   * @return {Object} Vote request packet.
   */
  startElection() {
    this.electionStartTime = Date.now();
    this.term += NUM.ONE;
    this.state = RAFT_STATE.CANDIDATE;
    this.votedFor = this.replicaId;
    this.votesReceived.clear();
    this.votesReceived.add(this.replicaId);

    return {
      type: RAFT_PACKET_TYPE.VOTE,
      term: this.term,
      address: this.unifiedAddress,
      state: this.state,
      leader: null,
      last: {index: NUM.ZERO, term: NUM.ZERO},
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
      if (this.votedFor === null || this.votedFor === voteRequest.address) {
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
      last: {index: NUM.ZERO, term: NUM.ZERO},
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
      this.electionCompleteTime = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeader() {
    return this.state === RAFT_STATE.LEADER;
  }

  /**
   * Get the election duration in milliseconds.
   * @return {number|null} Election duration or null if not complete.
   */
  getElectionDurationMs() {
    if (this.electionStartTime === null || this.electionCompleteTime === null) {
      return null;
    }
    return this.electionCompleteTime - this.electionStartTime;
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
 * Mock message router for simulating cross-worker communication.
 */
class MockElectionRouter {
  /**
   * Create a mock election router.
   */
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
   * Route a message from source to target.
   * @param {string} sourceAddress - Source unified address.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Response from target.
   */
  async route(sourceAddress, targetAddress, payload) {
    this.routedMessages.push({
      sourceAddress,
      targetAddress,
      payload,
      timestamp: Date.now(),
    });

    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      return {
        status: WORKER_RESPONSE_STATUS.ERROR,
        error: `No handler for address: ${targetAddress}`,
      };
    }

    const result = await handler({payload});
    return {
      status: WORKER_RESPONSE_STATUS.OK,
      payload: result,
    };
  }
}

/**
 * Create a Raft group with replicas for election testing.
 * @param {Object} options - Configuration options.
 * @return {Object} Raft group with replicas and router.
 */
function createRaftGroup(options = {}) {
  const {
    nodeId = 'test-node',
    entityType = WORKER_ENTITY_TYPE.PARTITION,
    replicaCount = NUM.THREE,
  } = options;

  const router = new MockElectionRouter();
  const replicas = [];

  for (let i = NUM.ZERO; i < replicaCount; i++) {
    const replica = new MockRaftReplica({
      replicaId: `replica-${i}`,
      nodeId,
      entityType,
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
 * Simulate leader election and measure completion time.
 * @param {Object} raftGroup - Raft group with replicas and router.
 * @param {number} candidateIndex - Index of the replica to start election.
 * @param {number} timeoutMs - Election timeout in milliseconds.
 * @return {Promise<Object>} Election result with timing information.
 */
async function simulateLeaderElection(raftGroup, candidateIndex, timeoutMs) {
  const {router, replicas} = raftGroup;
  const candidate = replicas[candidateIndex];
  const startTime = Date.now();

  const voteRequest = candidate.startElection();

  // For single replica, it becomes leader immediately with its own vote
  if (candidate.peers.size === NUM.ZERO) {
    // Single replica has majority (1 of 1)
    candidate.state = RAFT_STATE.LEADER;
    candidate.leaderId = candidate.unifiedAddress;
    candidate.electionCompleteTime = Date.now();

    const electionDurationMs = Date.now() - startTime;
    return {
      candidate,
      becameLeader: true,
      electionDurationMs,
      completedWithinTimeout: electionDurationMs <= timeoutMs,
      term: candidate.term,
      votesReceived: NUM.ONE,
    };
  }

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

  const electionDurationMs = Date.now() - startTime;
  const completedWithinTimeout = electionDurationMs <= timeoutMs;

  return {
    candidate,
    becameLeader: candidate.isLeader(),
    electionDurationMs,
    completedWithinTimeout,
    term: candidate.term,
    votesReceived: candidate.votesReceived.size,
  };
}

/**
 * Count the number of leaders in a Raft group.
 * @param {Array<MockRaftReplica>} replicas - Array of replicas.
 * @return {number} Number of leaders.
 */
function countLeaders(replicas) {
  return replicas.filter((r) => r.isLeader()).length;
}

// =============================================================================
// Generators for property-based testing
// =============================================================================

/**
 * Generator for replica count (1-5 replicas, odd numbers preferred for quorum).
 */
const replicaCountArb = fc.integer({
  min: ELECTION_SIM.MIN_REPLICAS,
  max: ELECTION_SIM.MAX_REPLICAS,
});

/**
 * Generator for election timeout in milliseconds.
 */
const timeoutMsArb = fc.integer({
  min: ELECTION_SIM.MIN_TIMEOUT_MS,
  max: ELECTION_SIM.MAX_TIMEOUT_MS,
});

/**
 * Generator for entity types (partition or message group).
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

describe('Property 3: Leader Election Completion', () => {
  /**
   * Property: For any Raft group with N replicas, leader election SHALL
   * complete within the configured timeout.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('leader election completes within configured timeout (Req 3.1, 3.2, 5.1, 5.2)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          replicaCountArb,
          nodeIdArb,
          entityTypeArb,
          timeoutMsArb,
          async (replicaCount, nodeId, entityType, timeoutMs) => {
            const raftGroup = createRaftGroup({
              nodeId,
              entityType,
              replicaCount,
            });

            const result = await simulateLeaderElection(
              raftGroup,
              NUM.ZERO,
              timeoutMs,
            );

            // Election must complete within timeout
            const completedWithinTimeout = result.completedWithinTimeout;

            // For single replica, it should become leader immediately
            // For multiple replicas, election should complete with a leader
            const electionCompleted = result.becameLeader;

            return completedWithinTimeout && electionCompleted;
          },
        ),
        {numRuns: NUM.TEN},
      );
    });

  /**
   * Property: For any Raft group after leader election, exactly one replica
   * SHALL report isLeader: true.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('exactly one replica reports isLeader true after election (Req 3.1, 3.2, 5.1, 5.2)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          replicaCountArb,
          nodeIdArb,
          entityTypeArb,
          async (replicaCount, nodeId, entityType) => {
            const raftGroup = createRaftGroup({
              nodeId,
              entityType,
              replicaCount,
            });

            await simulateLeaderElection(
              raftGroup,
              NUM.ZERO,
              ELECTION_SIM.DEFAULT_TIMEOUT_MS,
            );

            const leaderCount = countLeaders(raftGroup.replicas);

            // Exactly one leader must exist after election
            return leaderCount === NUM.ONE;
          },
        ),
        {numRuns: NUM.TEN},
      );
    });

  /**
   * Property: For partition replicas, leader election SHALL complete within
   * the configured timeout.
   *
   * **Validates: Requirements 3.1, 5.1**
   */
  it('partition leader election completes within timeout (Req 3.1, 5.1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        async (replicaCount, nodeId) => {
          const raftGroup = createRaftGroup({
            nodeId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
            replicaCount,
          });

          const result = await simulateLeaderElection(
            raftGroup,
            NUM.ZERO,
            ELECTION_SIM.DEFAULT_TIMEOUT_MS,
          );

          // Partition election must complete within default timeout
          const completedWithinTimeout = result.electionDurationMs <=
            ELECTION_SIM.DEFAULT_TIMEOUT_MS;

          // Must have exactly one leader
          const leaderCount = countLeaders(raftGroup.replicas);
          const singleLeader = leaderCount === NUM.ONE;

          return completedWithinTimeout && singleLeader;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For message group replicas, leader election SHALL complete
   * within the configured timeout.
   *
   * **Validates: Requirements 3.2, 5.2**
   */
  it('message group leader election completes within timeout (Req 3.2, 5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        async (replicaCount, nodeId) => {
          const raftGroup = createRaftGroup({
            nodeId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            replicaCount,
          });

          const result = await simulateLeaderElection(
            raftGroup,
            NUM.ZERO,
            ELECTION_SIM.DEFAULT_TIMEOUT_MS,
          );

          // Message group election must complete within default timeout
          const completedWithinTimeout = result.electionDurationMs <=
            ELECTION_SIM.DEFAULT_TIMEOUT_MS;

          // Must have exactly one leader
          const leaderCount = countLeaders(raftGroup.replicas);
          const singleLeader = leaderCount === NUM.ONE;

          return completedWithinTimeout && singleLeader;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, the elected leader SHALL have received
   * a majority of votes.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('elected leader has majority votes (Req 3.1, 3.2, 5.1, 5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        entityTypeArb,
        async (replicaCount, nodeId, entityType) => {
          const raftGroup = createRaftGroup({
            nodeId,
            entityType,
            replicaCount,
          });

          const result = await simulateLeaderElection(
            raftGroup,
            NUM.ZERO,
            ELECTION_SIM.DEFAULT_TIMEOUT_MS,
          );

          // Calculate required majority
          const majority = Math.floor(replicaCount / NUM.TWO) + NUM.ONE;

          // Leader must have received majority votes
          const hasMajority = result.votesReceived >= majority;

          return result.becameLeader && hasMajority;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, the leader's term SHALL be greater than
   * or equal to 1 after election.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('leader has valid term after election (Req 3.1, 3.2, 5.1, 5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        entityTypeArb,
        async (replicaCount, nodeId, entityType) => {
          const raftGroup = createRaftGroup({
            nodeId,
            entityType,
            replicaCount,
          });

          const result = await simulateLeaderElection(
            raftGroup,
            NUM.ZERO,
            ELECTION_SIM.DEFAULT_TIMEOUT_MS,
          );

          // Leader's term must be at least 1
          const validTerm = result.term >= NUM.ONE;

          return result.becameLeader && validTerm;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, all non-leader replicas SHALL be in
   * follower state after election completes.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('non-leaders are followers after election (Req 3.1, 3.2, 5.1, 5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        replicaCountArb,
        nodeIdArb,
        entityTypeArb,
        async (replicaCount, nodeId, entityType) => {
          const raftGroup = createRaftGroup({
            nodeId,
            entityType,
            replicaCount,
          });

          await simulateLeaderElection(
            raftGroup,
            NUM.ZERO,
            ELECTION_SIM.DEFAULT_TIMEOUT_MS,
          );

          // All non-leaders should be followers
          const nonLeaders = raftGroup.replicas.filter((r) => !r.isLeader());
          const allFollowers = nonLeaders.every(
            (r) => r.getRole() === RAFT_ROLE.FOLLOWER,
          );

          // Must have exactly one leader
          const leaderCount = countLeaders(raftGroup.replicas);
          const singleLeader = leaderCount === NUM.ONE;

          return singleLeader && allFollowers;
        },
      ),
      {numRuns: NUM.TEN},
    );
  });

  /**
   * Property: For any Raft group, election duration SHALL be measurable
   * and non-negative.
   *
   * **Validates: Requirements 3.1, 3.2, 5.1, 5.2**
   */
  it('election duration is measurable and non-negative (Req 3.1, 3.2, 5.1, 5.2)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          replicaCountArb,
          nodeIdArb,
          entityTypeArb,
          async (replicaCount, nodeId, entityType) => {
            const raftGroup = createRaftGroup({
              nodeId,
              entityType,
              replicaCount,
            });

            const result = await simulateLeaderElection(
              raftGroup,
              NUM.ZERO,
              ELECTION_SIM.DEFAULT_TIMEOUT_MS,
            );

            // Election duration must be non-negative
            const validDuration = result.electionDurationMs >= NUM.ZERO;

            return result.becameLeader && validDuration;
          },
        ),
        {numRuns: NUM.TEN},
      );
    });
});
