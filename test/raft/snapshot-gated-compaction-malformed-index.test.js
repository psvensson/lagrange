import Database from 'better-sqlite3';

import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {test} from '../../src/test-helpers/tap.js';

function memoryFixture() {
  const raft = new LifeRaft('memory-malformed-follower', {
    'heartbeat': '10s',
    'election min': '20s',
    'election max': '30s',
    'Log': InMemoryLogAdapter,
  });
  return {raft, close: () => raft.end()};
}

function sqliteFixture() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-malformed-follower'});
  function SQLiteLogFactory() {
    return adapter;
  }
  const raft = new LifeRaft('sqlite-malformed-follower', {
    'heartbeat': '10s',
    'election min': '20s',
    'election max': '30s',
    'Log': SQLiteLogFactory,
  });
  return {
    raft,
    close() {
      raft.end();
      db.close();
    },
  };
}

function registerMalformedHeartbeatTest(name, createFixture) {
  test(`${name} string prevLogIndex cannot delete committed prefix`, async (t) => {
    const fixture = createFixture();
    const {raft} = fixture;
    raft.message = () => raft;
    try {
      for (let index = 1; index <= 3; index += 1) {
        await raft.log.saveCommand({type: 'malformed-index', index}, 1, index);
      }
      await raft.log.commit(3);
      await raft.listeners('data')[0]({
        type: 'append',
        term: 2,
        state: LifeRaft.LEADER,
        address: 'malformed-leader',
        leader: 'malformed-leader',
        last: {index: '1', term: 1, committedIndex: 3},
      }, () => {});

      t.equal((await raft.log.getEntriesAfter(0)).length, 3,
        'malformed heartbeat cannot delete committed rows');
      t.equal(raft.log.committedIndex, 3,
        'malformed heartbeat cannot regress committed watermark');
      t.ok(await raft.log.get(3), 'committed head remains readable');
    } finally {
      fixture.close();
    }
  });
}

registerMalformedHeartbeatTest('in-memory adapter', memoryFixture);
registerMalformedHeartbeatTest('SQLite adapter', sqliteFixture);
