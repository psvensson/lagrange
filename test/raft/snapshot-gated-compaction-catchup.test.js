import Database from 'better-sqlite3';

import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {test} from '../../src/test-helpers/tap.js';

const ENTRY_COUNT = 1005;
const TERM = 13;

function createMemoryRaft(address) {
  return new LifeRaft(address, {
    'heartbeat': '10s',
    'election min': '20s',
    'election max': '30s',
    'Log': InMemoryLogAdapter,
  });
}

function memoryFixture() {
  const leader = createMemoryRaft('memory-leader');
  const follower = createMemoryRaft('memory-follower');
  return {
    leader,
    follower,
    close() {
      leader.end();
      follower.end();
    },
  };
}

function createSQLiteRaft(address) {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address, term: TERM});
  function SQLiteLogFactory() {
    return adapter;
  }
  const raft = new LifeRaft(address, {
    'heartbeat': '10s',
    'election min': '20s',
    'election max': '30s',
    'Log': SQLiteLogFactory,
  });
  return {db, raft};
}

function sqliteFixture() {
  const leaderFixture = createSQLiteRaft('sqlite-leader');
  const followerFixture = createSQLiteRaft('sqlite-follower');
  return {
    leader: leaderFixture.raft,
    follower: followerFixture.raft,
    close() {
      leaderFixture.raft.end();
      followerFixture.raft.end();
      leaderFixture.db.close();
      followerFixture.db.close();
    },
  };
}

async function seedLeader(raft) {
  for (let index = 1; index <= ENTRY_COUNT; index += 1) {
    await raft.log.saveCommand({type: 'catchup-entry', index}, TERM, index);
  }
  await raft.log.commit(ENTRY_COUNT);
  raft.change({state: LifeRaft.LEADER, term: TERM});
}

async function recoverThroughAppendEntries(leader, follower) {
  const leaderIncoming = leader.listeners('data')[0];
  const followerIncoming = follower.listeners('data')[0];
  const followerOutgoing = [];
  follower.message = (_who, packet) => {
    followerOutgoing.push(packet);
    return follower;
  };
  let followerInfo = await follower.log.getLastInfo();
  let roundCount = 0;
  while (followerInfo.index < ENTRY_COUNT && roundCount < ENTRY_COUNT) {
    const nextIndex = followerInfo.index + 1;
    let batch = null;
    await leaderIncoming({
      type: 'append fail',
      term: TERM,
      state: LifeRaft.FOLLOWER,
      address: follower.address,
      leader: leader.address,
      last: {
        ...followerInfo,
      },
      data: {index: nextIndex, term: TERM},
    }, (packet) => {
      batch = packet || null;
    });
    if (batch?.type !== 'append' || !Array.isArray(batch.data)) {
      break;
    }
    await followerIncoming(batch, () => {});
    await new Promise((resolve) => setImmediate(resolve));

    const tailAck = followerOutgoing
      .splice(0)
      .filter((packet) => packet.type === 'append ack')
      .sort((left, right) => right.data.index - left.data.index)[0];
    if (tailAck) {
      await leaderIncoming(tailAck, () => {});
    }
    followerInfo = await follower.log.getLastInfo();
    roundCount += 1;
  }
  return {followerInfo, roundCount};
}

function registerCatchupTest(name, createFixture) {
  test(`${name} retains full committed log for lagging follower catch-up`, async (t) => {
    const fixture = createFixture();
    try {
      await seedLeader(fixture.leader);
      const recovery = await recoverThroughAppendEntries(
        fixture.leader,
        fixture.follower,
      );
      t.ok(recovery.roundCount > 1, 'catch-up traverses multiple real batches');
      t.equal(recovery.followerInfo.index, ENTRY_COUNT,
        'real follower installs the complete prefix');
      t.equal(fixture.follower.log.committedIndex, ENTRY_COUNT,
        'real follower commits through the leader head');
      t.equal((await fixture.follower.log.getEntriesAfter(0)).length, ENTRY_COUNT,
        'real follower retains every recovered entry');
      t.equal((await fixture.follower.log.get(1))?.index, 1,
        'real follower retains the oldest committed entry');
    } finally {
      fixture.close();
    }
  });
}

registerCatchupTest('in-memory adapter', memoryFixture);
registerCatchupTest('SQLite adapter', sqliteFixture);
