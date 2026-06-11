/**
 * Guards for raft catch-up batching (closure record: voter-ready residual —
 * the last rolling-restart blocker).
 *
 * Base liferaft catch-up was one entry per round trip AND a backward
 * fail-walk (the follower's append-fail echoes the LEADER'S prevLog info,
 * so the leader re-sends from one index earlier each round, delivering
 * nothing until the walk reaches the follower's position). A REPLACE
 * learner catching up a formation-sized log could never meet its 60s
 * voter-ready budget.
 *
 * The patch: the leader fast-forwards to the follower's own position
 * (packet.last of the append-fail) and replies with a batch; the follower
 * applies the whole batch and acks the tail. Old nodes interoperate
 * (data[0]-only consumers progress one entry per round).
 */

import {test} from '../../src/test-helpers/tap.js';
import LifeRaft from '../../src/raft/liferaft.js';

function buildEntries(fromIndex, toIndex, term = 2) {
  const entries = [];
  for (let index = fromIndex; index <= toIndex; index += 1) {
    entries.push({
      index,
      term,
      committed: false,
      responses: [],
      command: {type: 'cmd', index},
    });
  }
  return entries;
}

class SequenceLog {
  constructor(node) {
    this.node = node;
    this.entries = new Map();
    this.committedIndex = 0;
    this.savedCommands = [];
    this.commitCalls = [];
  }

  seed(fromIndex, toIndex, term = 2) {
    for (const entry of buildEntries(fromIndex, toIndex, term)) {
      this.entries.set(entry.index, entry);
    }
    return this;
  }

  lastIndex() {
    return this.entries.size === 0 ? 0 : Math.max(...this.entries.keys());
  }

  async getLastInfo() {
    const index = this.lastIndex();
    const entry = this.entries.get(index);
    return {
      index,
      term: entry?.term ?? this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async get(index) {
    return this.entries.get(index) || null;
  }

  async getRange(startIndex, endIndex) {
    const range = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      const entry = this.entries.get(index);
      if (!entry) {
        break;
      }
      range.push(entry);
    }
    return range;
  }

  async getEntryInfoBefore(entry) {
    const previous = this.entries.get(entry.index - 1);
    return {
      index: entry.index - 1,
      term: previous?.term ?? entry.term,
      committedIndex: this.committedIndex,
    };
  }

  async has(index) {
    return this.entries.has(index);
  }

  async removeEntriesAfter(index) {
    for (const key of [...this.entries.keys()]) {
      if (key > index) {
        this.entries.delete(key);
      }
    }
  }

  async saveCommand(command, term, index) {
    const entry = {index, term, committed: false, responses: [], command};
    this.entries.set(index, entry);
    this.savedCommands.push(index);
    return entry;
  }

  async commandAck(index) {
    return {
      index,
      term: this.node.term,
      committed: false,
      responses: [],
    };
  }

  async getUncommittedEntriesUpToIndex(index) {
    return [...this.entries.values()]
      .filter((entry) => entry.index <= index && entry.committed !== true)
      .sort((left, right) => left.index - right.index);
  }

  async commit(index) {
    this.commitCalls.push(index);
    this.committedIndex = Math.max(this.committedIndex, index);
    const entry = this.entries.get(index);
    if (entry) {
      entry.committed = true;
    }
  }

  end() {}
}

const RAFT_OPTIONS = {
  'heartbeat': '10s',
  'election min': '20s',
  'election max': '30s',
  'Log': SequenceLog,
};

function buildAppendFail({failedIndex, followerLastIndex, term = 2}) {
  return {
    type: 'append fail',
    data: {index: failedIndex, term},
    last: {index: followerLastIndex, term, committedIndex: followerLastIndex},
    address: 'node-2',
    leader: 'node-1',
    state: LifeRaft.FOLLOWER,
    term,
  };
}

test('raft catch-up batching', async (t) => {
  await t.test(
    'leader replies with a batch starting at the FOLLOWER position ' +
      '(backward fail-walk eliminated)',
    async (t) => {
      const raft = new LifeRaft('node-1', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 200);
        raft.state = LifeRaft.LEADER;
        raft.term = 2;
        const writes = [];
        const incoming = raft.listeners('data')[0];

        await incoming(
          buildAppendFail({failedIndex: 150, followerLastIndex: 4}),
          (packet) => packet && writes.push(packet),
        );

        t.equal(writes.length, 1, 'one batch reply');
        const batch = writes[0];
        t.equal(batch.type, 'append', 'append packet');
        t.equal(batch.data.length, 64, 'full batch size');
        t.equal(batch.data[0].index, 5, 'starts at follower last + 1');
        t.equal(batch.data[63].index, 68, 'contiguous batch tail');
        t.equal(
          batch.last.index,
          4,
          'consistency precondition is the entry before the batch',
        );
      } finally {
        raft.end();
      }
    },
  );

  await t.test('batch is capped at the leader head', async (t) => {
    const raft = new LifeRaft('node-1', RAFT_OPTIONS);
    try {
      raft.log.seed(1, 20);
      raft.state = LifeRaft.LEADER;
      raft.term = 2;
      const writes = [];
      const incoming = raft.listeners('data')[0];

      await incoming(
        buildAppendFail({failedIndex: 18, followerLastIndex: 10}),
        (packet) => packet && writes.push(packet),
      );

      t.equal(writes[0].data.length, 10, 'batch 11..20 capped at head');
      t.equal(writes[0].data[0].index, 11, 'fast-forward start');
    } finally {
      raft.end();
    }
  });

  await t.test(
    'redundant fails are deduped while a batch is in flight; the tail ' +
      'ack re-arms',
    async (t) => {
      const raft = new LifeRaft('node-1', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 200);
        raft.state = LifeRaft.LEADER;
        raft.term = 2;
        const writes = [];
        const incoming = raft.listeners('data')[0];
        const collect = (packet) => packet && writes.push(packet);

        await incoming(
          buildAppendFail({failedIndex: 150, followerLastIndex: 4}),
          collect,
        );
        await incoming(
          buildAppendFail({failedIndex: 151, followerLastIndex: 4}),
          collect,
        );
        t.equal(writes.length, 1, 'second fail suppressed while in flight');

        await incoming(
          {
            type: 'append ack',
            data: {index: 68, term: 2},
            address: 'node-2',
            leader: 'node-1',
            state: LifeRaft.FOLLOWER,
            term: 2,
          },
          () => {},
        );
        await incoming(
          buildAppendFail({failedIndex: 151, followerLastIndex: 68}),
          collect,
        );
        t.equal(writes.length, 2, 'tail ack re-arms the next batch');
        t.equal(writes[1].data[0].index, 69, 'next batch continues forward');
      } finally {
        raft.end();
      }
    },
  );

  await t.test(
    'non-leader and stale-term fails delegate to the base handler',
    async (t) => {
      const raft = new LifeRaft('node-1', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 10);
        raft.state = LifeRaft.LEADER;
        raft.term = 5;
        const writes = [];
        const incoming = raft.listeners('data')[0];

        // Stale term: base handler path (single-entry recovery).
        await incoming(
          buildAppendFail({failedIndex: 3, followerLastIndex: 1, term: 2}),
          (packet) => packet && writes.push(packet),
        );
        t.ok(
          writes.every((packet) => !packet.data ||
            !Array.isArray(packet.data) || packet.data.length <= 1),
          'no batch emitted for stale-term fails',
        );
      } finally {
        raft.end();
      }
    },
  );

  await t.test('follower applies a full batch and acks the tail',
    async (t) => {
      const raft = new LifeRaft('node-3', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 4);
        raft.term = 2;
        const acks = [];
        raft.message = (target, packet) => {
          acks.push(packet);
        };
        const incoming = raft.listeners('data')[0];
        const batchEntries = buildEntries(5, 68);

        await incoming(
          {
            type: 'append',
            data: batchEntries,
            last: {index: 4, term: 2, committedIndex: 60},
            address: 'node-1',
            leader: 'node-1',
            state: LifeRaft.LEADER,
            term: 2,
          },
          () => {},
        );

        t.equal(
          raft.log.savedCommands.length,
          64,
          'all 64 batch entries saved',
        );
        t.same(
          raft.log.savedCommands.slice(0, 3),
          [5, 6, 7],
          'ascending order from the batch head',
        );
        const ackIndices = acks
          .filter((packet) => packet?.type === 'append ack')
          .map((packet) => packet.data.index);
        t.ok(ackIndices.includes(68), 'tail entry acked');
        t.ok(
          raft.log.committedIndex >= 60,
          `commit catch-up ran (committedIndex=${raft.log.committedIndex})`,
        );
      } finally {
        raft.end();
      }
    });

  await t.test(
    'stale batch below the committed prefix is dropped without truncation',
    async (t) => {
      const raft = new LifeRaft('node-3', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 100);
        raft.log.committedIndex = 100;
        raft.term = 2;
        raft.message = () => {};
        const incoming = raft.listeners('data')[0];

        await incoming(
          {
            type: 'append',
            data: buildEntries(5, 68),
            last: {index: 4, term: 2, committedIndex: 60},
            address: 'node-1',
            leader: 'node-1',
            state: LifeRaft.LEADER,
            term: 2,
          },
          () => {},
        );

        t.equal(raft.log.savedCommands.length, 0, 'nothing saved');
        t.equal(raft.log.lastIndex(), 100, 'no truncation of committed log');
      } finally {
        raft.end();
      }
    },
  );

  await t.test(
    'mismatching batch still produces the base append-fail reply',
    async (t) => {
      const raft = new LifeRaft('node-3', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 4);
        raft.term = 2;
        const messages = [];
        raft.message = (target, packet) => messages.push(packet);
        const incoming = raft.listeners('data')[0];

        await incoming(
          {
            type: 'append',
            data: buildEntries(50, 113),
            last: {index: 49, term: 2, committedIndex: 40},
            address: 'node-1',
            leader: 'node-1',
            state: LifeRaft.LEADER,
            term: 2,
          },
          () => {},
        );

        t.equal(raft.log.savedCommands.length, 0, 'no entries saved');
        const fails = messages.filter(
          (packet) => packet?.type === 'append fail',
        );
        t.equal(fails.length, 1, 'base append-fail emitted');
      } finally {
        raft.end();
      }
    },
  );
});
