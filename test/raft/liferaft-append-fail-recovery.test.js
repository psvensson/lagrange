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
