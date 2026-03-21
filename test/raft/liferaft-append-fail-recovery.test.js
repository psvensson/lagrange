import {test} from '../../src/test-helpers/tap.js';
import LifeRaft from '../../src/raft/liferaft.js';

class NullRecoveredEntryLog {
  constructor(node) {
    this.node = node;
    this.committedIndex = 0;
  }

  async getLastInfo() {
    return {
      index: 0,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async get() {
    return null;
  }

  async getEntryInfoBefore() {
    return {
      index: 0,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async has() {
    return false;
  }

  async removeEntriesAfter() {}

  async saveCommand(command, term, index) {
    return {
      index,
      term,
      committed: false,
      responses: [],
      command,
    };
  }

  async commandAck(index) {
    return {
      index,
      term: this.node.term,
      committed: false,
      responses: [],
    };
  }

  async getUncommittedEntriesUpToIndex() {
    return [];
  }

  end() {}
}

class HeartbeatCommitAdvanceLog {
  constructor(node) {
    this.node = node;
    this.committedIndex = 0;
    this.commitCalls = [];
    this.entries = [{
      index: 1,
      term: 1,
      committed: false,
      responses: [],
      command: {type: 'cdc_test'},
    }];
  }

  async getLastInfo() {
    return {
      index: 0,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async get() {
    return null;
  }

  async getEntryInfoBefore() {
    return {
      index: 0,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async has() {
    return false;
  }

  async removeEntriesAfter() {}

  async saveCommand(command, term, index) {
    return {
      index,
      term,
      committed: false,
      responses: [],
      command,
    };
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
    return this.entries.filter((entry) =>
      entry.index <= index && entry.committed !== true,
    );
  }

  async commit(index) {
    this.commitCalls.push(index);
    this.committedIndex = index;
    const entry = this.entries.find((candidate) => candidate.index === index);
    if (entry) {
      entry.committed = true;
    }
  }

  end() {}
}

class AppendAckCommitBroadcastLog {
  constructor(node) {
    this.node = node;
    this.committedIndex = 0;
    this.entries = [{
      index: 1,
      term: 1,
      committed: false,
      responses: [],
      command: {type: 'cdc_test'},
    }];
  }

  async getLastInfo() {
    return {
      index: 1,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async get() {
    return this.entries[0];
  }

  async getEntryInfoBefore() {
    return {
      index: 0,
      term: this.node.term,
      committedIndex: this.committedIndex,
    };
  }

  async has() {
    return true;
  }

  async removeEntriesAfter() {}

  async saveCommand(command, term, index) {
    return {
      index,
      term,
      committed: false,
      responses: [],
      command,
    };
  }

  async commandAck(index) {
    return {
      index,
      term: this.node.term,
      committed: false,
      responses: ['node-2', 'node-3'],
    };
  }

  async getUncommittedEntriesUpToIndex(index) {
    return this.entries.filter((entry) =>
      entry.index <= index && entry.committed !== true,
    );
  }

  async commit(index) {
    this.committedIndex = index;
    const entry = this.entries.find((candidate) => candidate.index === index);
    if (entry) {
      entry.committed = true;
    }
  }

  end() {}
}

test('liferaft append-fail recovery skips retry when recovered entry is null',
  async (t) => {
    const writes = [];
    const raft = new LifeRaft('node-1', {
      heartbeat: '10s',
      'election min': '20s',
      'election max': '30s',
      Log: NullRecoveredEntryLog,
    });

    try {
      const incoming = raft.listeners('data')[0];
      await incoming({
        type: 'append fail',
        data: {
          index: 4,
          term: 2,
        },
        address: 'node-2',
        leader: 'node-1',
        state: LifeRaft.FOLLOWER,
        term: 2,
      }, (packet) => {
        if (packet) {
          writes.push(packet);
        }
      });

      t.same(
        writes,
        [],
        'append-fail recovery should not emit a retry append when no entry is available',
      );
    } finally {
      raft.end();
    }
  },
);

test('liferaft heartbeat append advances follower commit index',
  async (t) => {
    const commits = [];
    const raft = new LifeRaft('node-1', {
      heartbeat: '10s',
      'election min': '20s',
      'election max': '30s',
      Log: HeartbeatCommitAdvanceLog,
    });

    raft.on('commit', (command) => {
      commits.push(command);
    });

    try {
      const incoming = raft.listeners('data')[0];
      await incoming({
        type: 'append',
        last: {
          index: 0,
          term: 1,
          committedIndex: 1,
        },
        address: 'node-2',
        leader: 'node-2',
        state: LifeRaft.LEADER,
        term: 1,
      }, () => {});

      await new Promise((resolve) => setImmediate(resolve));

      t.same(
        raft.log.commitCalls,
        [1],
        'heartbeat append should advance follower commit index',
      );
      t.same(
        commits,
        [{type: 'cdc_test'}],
        'heartbeat append should emit committed entries',
      );
    } finally {
      raft.end();
    }
  },
);

test('liferaft append ack immediately broadcasts committedIndex heartbeat',
  async (t) => {
    const outgoing = [];
    const raft = new LifeRaft('node-1', {
      heartbeat: '10s',
      'election min': '20s',
      'election max': '30s',
      Log: AppendAckCommitBroadcastLog,
    });

    raft.change({
      state: LifeRaft.LEADER,
      leader: 'node-1',
      term: 1,
    });
    raft.nodes = [
      {address: 'node-2'},
      {address: 'node-3'},
    ];
    raft.message = (who, packet) => {
      outgoing.push({who, packet});
      return raft;
    };

    try {
      const incoming = raft.listeners('data')[0];
      await incoming({
        type: 'append ack',
        data: {
          index: 1,
        },
        address: 'node-2',
        leader: 'node-1',
        state: LifeRaft.FOLLOWER,
        term: 1,
      }, () => {});

      await new Promise((resolve) => setImmediate(resolve));

      t.equal(outgoing.length, 1,
        'leader should immediately broadcast one commit heartbeat');
      t.equal(outgoing[0].who, LifeRaft.FOLLOWER,
        'heartbeat should target followers');
      t.equal(outgoing[0].packet.type, 'append',
        'broadcast should use append heartbeat');
      t.equal(outgoing[0].packet.last.committedIndex, 1,
        'heartbeat should carry the advanced committed index');
    } finally {
      raft.end();
    }
  },
);
