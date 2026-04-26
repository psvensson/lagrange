import {test} from '../../src/test-helpers/tap.js';
import LifeRaft from '@markwylde/liferaft';
import {assertRaftProviderContract} from '../../src/raft/raft-provider-contract.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {
  RAFT_PROVIDER_CONTRACT_METHOD,
} from '../../src/raft/raft-provider-contract-constants.js';

const TEST_ROUTE_OVERRIDE_COMMAND = Object.freeze({
  type: 'CDC',
});
const TEST_RETRYABLE_FORWARD_HINT_MS = 7;
const TEST_RETRYABLE_FORWARD_ERROR_MSG = 'Connection to node seed closed';
const TEST_IMMEDIATE_ELECTION_DELAY_MS = 1;

function buildProviderStub() {
  const provider = {};
  const noOp = () => {};
  for (const methodName of Object.values(RAFT_PROVIDER_CONTRACT_METHOD)) {
    provider[methodName] = noOp;
  }
  return provider;
}

test('assertRaftProviderContract throws for missing provider', async (t) => {
  t.throws(() => {
    assertRaftProviderContract(null);
  });
});

test('assertRaftProviderContract throws when createNodeClass is missing',
  async (t) => {
    t.throws(() => {
      assertRaftProviderContract({});
    });
  });

test('assertRaftProviderContract throws when any required method is missing',
  async (t) => {
    const provider = buildProviderStub();
    delete provider[RAFT_PROVIDER_CONTRACT_METHOD.PROPOSE];
    t.throws(() => {
      assertRaftProviderContract(provider);
    }, new RegExp(RAFT_PROVIDER_CONTRACT_METHOD.PROPOSE));
  });

test('assertRaftProviderContract accepts LiferaftProvider', async (t) => {
  const provider = new LiferaftProvider();
  t.doesNotThrow(() => {
    assertRaftProviderContract(provider);
  });
});

test('LiferaftProvider propose delegates to raft.command', async (t) => {
  const provider = new LiferaftProvider();
  let proposedCommand = null;
  let callbackError = 'unset';
  const raftNode = {
    command: async (command) => {
      proposedCommand = command;
      return {ok: true};
    },
  };
  await provider.propose(raftNode, {type: 'write'}, (error) => {
    callbackError = error || null;
  });

  t.same(proposedCommand, {type: 'write'});
  t.equal(callbackError, null);
});

test('LiferaftProvider joinPeer delegates to raft.join', async (t) => {
  const provider = new LiferaftProvider();
  let joinedPeer = null;
  const raftNode = {
    join: (peerAddress) => {
      joinedPeer = peerAddress;
    },
  };

  provider.joinPeer(raftNode, 'node-2/partition/replica-2');
  t.equal(joinedPeer, 'node-2/partition/replica-2');
});

test('LiferaftProvider startElectionTimer calls heartbeat(timeout())',
  async (t) => {
    const provider = new LiferaftProvider();
    let heartbeatDuration = null;
    const raftNode = {
      timeout: () => 1234,
      heartbeat: (durationMs) => {
        heartbeatDuration = durationMs;
      },
    };

    provider.startElectionTimer(raftNode);
    t.equal(heartbeatDuration, 1234);
  });

test('LiferaftProvider requestElectionNow calls heartbeat with the immediate election delay',
  async (t) => {
    const provider = new LiferaftProvider();
    let heartbeatDuration = null;
    const raftNode = {
      heartbeat: (durationMs) => {
        heartbeatDuration = durationMs;
      },
    };

    provider.requestElectionNow(raftNode);
    t.equal(
      heartbeatDuration,
      TEST_IMMEDIATE_ELECTION_DELAY_MS,
      'immediate election should use the canonical near-zero heartbeat delay',
    );
  });

test('LiferaftProvider clearTimers clears named and all timers', async (t) => {
  const provider = new LiferaftProvider();
  const clearCalls = [];
  const raftNode = {
    timers: {
      clear: (timerName) => {
        clearCalls.push(timerName === undefined ? 'all' : timerName);
      },
    },
  };

  provider.clearTimers(raftNode, 'heartbeat, election');
  provider.clearTimers(raftNode);

  t.same(clearCalls, ['heartbeat, election', 'all']);
});

test('LiferaftProvider shutdownNode clears timers and ends node', async (t) => {
  const provider = new LiferaftProvider();
  let cleared = false;
  let ended = false;
  const raftNode = {
    timers: {
      clear: () => {
        cleared = true;
      },
    },
    end: () => {
      ended = true;
    },
  };

  provider.shutdownNode(raftNode);
  t.equal(cleared, true);
  t.equal(ended, true);
});

test('LiferaftProvider current term and committed index return numeric defaults',
  async (t) => {
    const provider = new LiferaftProvider();
    t.equal(provider.getCurrentTerm(null), 0);
    t.equal(provider.getCommittedIndex(null), 0);

    const raftNode = {
      term: 5,
      log: {
        committedIndex: 9,
      },
    };
    t.equal(provider.getCurrentTerm(raftNode), 5);
    t.equal(provider.getCommittedIndex(raftNode), 9);
  });

test('LiferaftProvider proposeWithLeaderRouting retries on propose timeout',
  async (t) => {
    const provider = new LiferaftProvider();
    let proposeCalls = 0;
    let forwardCalls = 0;
    const raftNode = {
      state: LifeRaft.LEADER,
      command: () => {
        proposeCalls += 1;
        if (proposeCalls === 1) {
          // Simulate leadership loss while proposal never resolves.
          raftNode.state = LifeRaft.FOLLOWER;
          return new Promise(() => {});
        }
        return Promise.resolve();
      },
    };

    const result = await provider.proposeWithLeaderRouting(
      raftNode,
      {type: 'CDC'},
      {
        maxAttempts: 2,
        proposeTimeoutMs: 5,
        computeRetryDelayMs: () => 0,
        forwardToLeader: async () => {
          forwardCalls += 1;
        },
      },
    );

    t.same(result, {
      attempt: 2,
      mode: 'forward',
    });
    t.equal(proposeCalls, 1);
    t.equal(forwardCalls, 1);
  });

test(
  'LiferaftProvider proposeWithLeaderRouting honors owner-supplied local ' +
    'leadership when raw raft state is stale',
  async (t) => {
    const provider = new LiferaftProvider();
    let proposeCalls = 0;
    let forwardCalls = 0;
    const raftNode = {
      state: null,
      command: async () => {
        proposeCalls += 1;
        return {ok: true};
      },
    };

    const result = await provider.proposeWithLeaderRouting(
      raftNode,
      TEST_ROUTE_OVERRIDE_COMMAND,
      {
        shouldProposeLocally: () => true,
        forwardToLeader: async () => {
          forwardCalls += 1;
        },
      },
    );

    t.same(result, {
      attempt: 1,
      mode: 'propose',
    });
    t.equal(
      proposeCalls,
      1,
      'owner-supplied leadership should keep the command on the local propose path',
    );
    t.equal(
      forwardCalls,
      0,
      'owner-supplied leadership should prevent leader forwarding when raw raft state is stale',
    );
  },
);

test(
  'LiferaftProvider proposeWithLeaderRouting falls back to forwarding when ' +
    'owner-supplied leadership lacks a live command API',
  async (t) => {
    const provider = new LiferaftProvider();
    let forwardCalls = 0;
    const raftNode = {
      state: null,
    };

    const result = await provider.proposeWithLeaderRouting(
      raftNode,
      TEST_ROUTE_OVERRIDE_COMMAND,
      {
        shouldProposeLocally: () => true,
        forwardToLeader: async () => {
          forwardCalls += 1;
        },
      },
    );

    t.same(result, {
      attempt: 1,
      mode: 'forward',
    });
    t.equal(
      forwardCalls,
      1,
      'route selection should stay on the forward path until the live raft command API exists',
    );
  },
);

test('LiferaftProvider proposeWithLeaderRouting throws when propose keeps timing out',
  async (t) => {
    const provider = new LiferaftProvider();
    const raftNode = {
      state: LifeRaft.LEADER,
      command: () => new Promise(() => {}),
    };

    await t.rejects(
      provider.proposeWithLeaderRouting(
        raftNode,
        {type: 'CDC'},
        {
          maxAttempts: 1,
          proposeTimeoutMs: 5,
        },
      ),
      /timed out/i,
    );
  });

test('LiferaftProvider proposeWithLeaderRouting stops after first non-retryable forward error',
  async (t) => {
    const provider = new LiferaftProvider();
    let forwardCalls = 0;
    const retryAttempts = [];
    const raftNode = {
      state: LifeRaft.FOLLOWER,
    };

    await t.rejects(
      provider.proposeWithLeaderRouting(
        raftNode,
        {type: 'CDC'},
        {
          maxAttempts: 3,
          computeRetryDelayMs: (attempt) => {
            retryAttempts.push(attempt);
            return 0;
          },
          forwardToLeader: async () => {
            forwardCalls += 1;
            const error = new Error('leader target set exhausted');
            error.retryable = false;
            throw error;
          },
        },
      ),
      /leader target set exhausted/i,
      'non-retryable forward failures should bypass the remaining retry budget',
    );

    t.equal(forwardCalls, 1, 'non-retryable forward failure should run once');
    t.same(
      retryAttempts,
      [],
      'non-retryable forward failure should not schedule retry delays',
    );
  });

test(
  'LiferaftProvider proposeWithLeaderRouting honors retry-after hints from retryable forward failures',
  async (t) => {
    const provider = new LiferaftProvider();
    let forwardCalls = 0;
    const retryDelayLog = [];
    const raftNode = {
      state: LifeRaft.FOLLOWER,
    };

    const result = await provider.proposeWithLeaderRouting(
      raftNode,
      {type: 'CDC'},
      {
        maxAttempts: 2,
        computeRetryDelayMs: () => 0,
        onRetry: ({retryDelayMs}) => {
          retryDelayLog.push(retryDelayMs);
        },
        forwardToLeader: async () => {
          forwardCalls += 1;
          if (forwardCalls === 1) {
            const error = new Error(TEST_RETRYABLE_FORWARD_ERROR_MSG);
            error.deferRetry = true;
            error.retryAfterMs = TEST_RETRYABLE_FORWARD_HINT_MS;
            error.retryable = true;
            throw error;
          }
        },
      },
    );

    t.same(result, {
      attempt: 2,
      mode: 'forward',
    });
    t.equal(
      forwardCalls,
      2,
      'retryable forward failure should use the remaining routing attempt budget',
    );
    t.same(
      retryDelayLog,
      [TEST_RETRYABLE_FORWARD_HINT_MS],
      'retry scheduling should honor the deferred retry-after hint from the failed forward attempt',
    );
  },
);
