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
