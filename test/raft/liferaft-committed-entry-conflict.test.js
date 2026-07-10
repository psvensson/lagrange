import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';

import {
  RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
} from '../../src/raft/committed-entry-guard.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

const HEARTBEAT = '10s';
const ELECTION_MIN = '20s';
const ELECTION_MAX = '30s';

function command(value) {
  return {type: 'incoming-conflict', value};
}

function createProviderNode(address, Log) {
  const provider = new LiferaftProvider();
  const RaftNode = provider.createNodeClass({
    resolvePeerAddress: (peerAddress) => peerAddress,
    deliverPacket: async () => null,
  });
  return new RaftNode(address, {
    'heartbeat': HEARTBEAT,
    'election min': ELECTION_MIN,
    'election max': ELECTION_MAX,
    'Log': Log,
  });
}

function createInMemoryRaft() {
  const raft = createProviderNode('memory-follower', InMemoryLogAdapter);
  return {raft, close: () => raft.end()};
}

function createSQLiteRaft() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-follower', term: 1});
  function SQLiteLogFactory() {
    return adapter;
  }
  const raft = createProviderNode('sqlite-follower', SQLiteLogFactory);
  return {
    raft,
    close() {
      raft.end();
      db.close();
    },
  };
}

function conflictingAppendPacket(data = [
  {index: 2, term: 2, command: command('conflict')},
], last = {index: 1, term: 1, committedIndex: 2}) {
  return {
    type: 'append',
    term: 2,
    state: LifeRaft.LEADER,
    address: 'leader-node',
    leader: 'leader-node',
    last,
    data,
  };
}

function conflictingPrevLogPacket() {
  return {
    ...conflictingAppendPacket([
      {index: 3, term: 2, command: command('must-not-append')},
    ]),
    last: {index: 2, term: 99, committedIndex: 2},
  };
}

function higherTermConflictingHeartbeat() {
  return {
    type: 'append',
    term: 7,
    state: LifeRaft.LEADER,
    address: 'higher-term-leader',
    leader: 'higher-term-leader',
    last: {index: 1, term: 99, committedIndex: 1},
  };
}

async function assertConflictRejected(t, createRaft, packet) {
  const fixture = createRaft();
  const {raft} = fixture;
  const outgoing = [];
  raft.message = (who, packet) => {
    outgoing.push({who, packet});
    return raft;
  };
  try {
    await raft.log.saveCommand(command('committed-1'), 1, 1);
    await raft.log.saveCommand(command('committed-2'), 1, 2);
    await raft.log.commit(2);
    const before = await raft.log.get(2);
    const incoming = raft.listeners('data')[0];

    let processingError = null;
    try {
      await incoming(packet, () => {});
    } catch (error) {
      processingError = error;
    }

    t.equal(processingError, null, 'typed conflict is handled as a protocol rejection');
    t.equal(outgoing.some(({packet}) => packet.type === 'append ack'), false,
      'conflicting committed entry is never ACKed');
    const rejection = outgoing.find(({packet}) => packet.type === 'append fail');
    t.ok(rejection, 'leader receives append-fail rejection');
    t.equal(rejection?.packet?.data?.code, RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
      'rejection carries typed committed-conflict code');
    t.equal(raft.log.committedIndex, 2, 'commit watermark does not advance or regress');
    const after = await raft.log.get(2);
    t.equal(after.term, before.term, 'committed term is unchanged');
    t.same(after.command, before.command, 'committed command is unchanged');
    t.equal(await raft.log.get(3), null,
      'conflicting packet cannot partially append an uncommitted entry');
  } finally {
    fixture.close();
  }
}

function registerIncomingConflictTest(name, createRaft) {
  test(`${name} rejects conflicting committed AppendEntries without ACK`, async (t) => {
    await assertConflictRejected(t, createRaft, conflictingAppendPacket());
  });

  test(`${name} rejects a committed conflict before batch ACK`, async (t) => {
    await assertConflictRejected(t, createRaft, conflictingAppendPacket([
      {index: 2, term: 2, command: command('conflict')},
      {index: 3, term: 2, command: command('must-not-append')},
    ]));
  });

  test(`${name} rejects a conflicting committed prevLogTerm`, async (t) => {
    await assertConflictRejected(t, createRaft, conflictingPrevLogPacket());
  });

  test(`${name} applies higher-term leader state before conflict rejection`,
    async (t) => {
      const fixture = createRaft();
      const {raft} = fixture;
      const outgoing = [];
      raft.message = (_who, packet) => {
        outgoing.push(packet);
        return raft;
      };
      try {
        await raft.log.saveCommand(command('committed-1'), 1, 1);
        await raft.log.commit(1);
        await raft.listeners('data')[0](higherTermConflictingHeartbeat(), () => {});

        const rejection = outgoing.find((packet) => packet.type === 'append fail');
        t.equal(raft.term, 7, 'follower adopts the higher leader term');
        t.equal(raft.state, LifeRaft.FOLLOWER, 'follower steps down before rejecting');
        t.equal(raft.leader, 'higher-term-leader', 'follower records the current leader');
        t.equal(rejection?.term, 7, 'rejection packet carries the current term');
        t.equal(rejection?.state, LifeRaft.FOLLOWER,
          'rejection packet carries the transitioned state');
        t.equal(rejection?.leader, 'higher-term-leader',
          'rejection packet carries the current leader');
      } finally {
        fixture.close();
      }
    });
}

registerIncomingConflictTest('LiferaftProvider in-memory binding', createInMemoryRaft);
registerIncomingConflictTest('LiferaftProvider SQLite binding', createSQLiteRaft);
