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
import Database from 'better-sqlite3';
import {performance} from 'node:perf_hooks';
import {
  canonicalizeJsonValue,
  frameOwnerDurationMs,
  parseEvidenceJson,
  readJsonLines,
  safeCountSum,
} from '../../scripts/run-raft-follower-append-sqlite-starvation-relief-scenarios.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {
  handleFollowerAppendBatch,
} from '../../src/raft/liferaft-follower-batch.js';
import {
  COMMIT_APPLY_SLICE_BUDGET_MS,
  RAFT_COMMIT_APPLY_ROLLBACK_EVENT,
} from '../../src/raft/liferaft-commit-scheduler.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

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

class MeasuredSQLiteLog extends SQLiteLogAdapter {
  constructor(node) {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    super(db, node);
    this.ownedDb = db;
    this.saveBatchCount = 0;
    this.commitApplySliceCount = 0;
  }

  saveCommands(entries) {
    this.saveBatchCount += 1;
    return super.saveCommands(entries);
  }

  commitAndApplySlice(entries, options) {
    this.commitApplySliceCount += 1;
    return super.commitAndApplySlice(entries, options);
  }
}

const SQLITE_RAFT_OPTIONS = {
  'heartbeat': '10s',
  'election min': '20s',
  'election max': '30s',
  'Log': MeasuredSQLiteLog,
};

function burnCpuFor(durationMs) {
  const deadline = performance.now() + durationMs;
  while (performance.now() < deadline) {
    // Deliberately synchronous: models the measured per-entry state-machine
    // apply cost while the scheduler proves timers receive bounded turns.
  }
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

test('live Raft evidence rejects coercion and hostile object shapes', (t) => {
  const ownerFrame = {fn: 'commitEntries', url: '', inclusiveMs: 25};
  t.equal(frameOwnerDurationMs(ownerFrame), 25,
    'a primitive finite owner duration is accepted');
  for (const duration of [
    '25',
    Object(25),
    -0,
    -1,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    t.ok(Number.isNaN(frameOwnerDurationMs({
      fn: 'commitEntries',
      url: '',
      inclusiveMs: duration,
    })), 'a coerced or unsafe owner duration fails closed');
  }

  t.same(safeCountSum([4, 5]), {valid: true, value: 9},
    'safe primitive counts may be summed');
  t.same(safeCountSum([Number.MAX_SAFE_INTEGER, 1]),
    {valid: false, value: 0}, 'derived count overflow fails closed');
  t.same(safeCountSum([-0]), {valid: false, value: 0},
    'negative zero is not authenticated as a count');

  const canonical = canonicalizeJsonValue({
    frames: [{fn: 'commitEntries', inclusiveMs: 10}],
  });
  t.equal(Object.getPrototypeOf(canonical), null,
    'canonical evidence records have no prototype');
  t.ok(Object.isFrozen(canonical) && Object.isFrozen(canonical.frames),
    'canonical records and arrays are frozen');

  let getterReads = 0;
  const accessorRecord = {};
  Object.defineProperty(accessorRecord, 'fn', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'commitEntries';
    },
  });
  t.throws(() => canonicalizeJsonValue(accessorRecord),
    /own data fields/, 'record accessors are rejected');
  t.equal(getterReads, 0, 'record accessors are never invoked');

  const accessorArray = new Array(1);
  Object.defineProperty(accessorArray, '0', {
    enumerable: true,
    get() {
      getterReads += 1;
      return ownerFrame;
    },
  });
  t.throws(() => canonicalizeJsonValue(accessorArray),
    /dense own-data arrays/, 'array accessors are rejected');
  t.throws(() => canonicalizeJsonValue(new Array(1)),
    /dense own-data arrays/, 'sparse evidence arrays are rejected');
  t.equal(getterReads, 0, 'array accessors are never invoked');

  const inheritedFrame = Object.create({fn: 'commitEntries'});
  inheritedFrame.inclusiveMs = 10;
  t.equal(frameOwnerDurationMs(inheritedFrame), null,
    'inherited frame identity cannot authenticate an owner');

  const originalArrayIsArray = Array.isArray;
  const originalJsonParse = JSON.parse;
  const originalNumberIsFinite = Number.isFinite;
  const originalNumberIsSafeInteger = Number.isSafeInteger;
  const regexpPrototype = Object.getPrototypeOf(/evidence/u);
  const stringPrototype = Object.getPrototypeOf('evidence');
  const originalRegexpTest = regexpPrototype.test;
  const originalStringSplit = stringPrototype.split;
  const originalStringStartsWith = stringPrototype.startsWith;
  const originalStringTrim = stringPrototype.trim;
  let intrinsicFrameDuration;
  let intrinsicJson;
  let intrinsicLines;
  let intrinsicCount;
  try {
    Array.isArray = () => false;
    JSON.parse = () => ({forged: true});
    Number.isFinite = () => false;
    Number.isSafeInteger = () => false;
    regexpPrototype.test = () => false;
    stringPrototype.split = () => [];
    stringPrototype.startsWith = () => false;
    stringPrototype.trim = () => '';
    intrinsicFrameDuration = frameOwnerDurationMs(ownerFrame);
    intrinsicJson = parseEvidenceJson('{"authenticated":true}');
    intrinsicLines = readJsonLines('{"type":"profile"}\n');
    intrinsicCount = safeCountSum([2, 3]);
  } finally {
    Array.isArray = originalArrayIsArray;
    JSON.parse = originalJsonParse;
    Number.isFinite = originalNumberIsFinite;
    Number.isSafeInteger = originalNumberIsSafeInteger;
    regexpPrototype.test = originalRegexpTest;
    stringPrototype.split = originalStringSplit;
    stringPrototype.startsWith = originalStringStartsWith;
    stringPrototype.trim = originalStringTrim;
  }
  t.equal(intrinsicFrameDuration, 25,
    'captured numeric and RegExp intrinsics authenticate the frame');
  t.equal(intrinsicJson.authenticated, true,
    'captured JSON and array intrinsics parse the authentic payload');
  t.equal(intrinsicLines.length, 1,
    'captured string intrinsics retain the authentic JSON line');
  t.same(intrinsicCount, {valid: true, value: 5},
    'captured numeric intrinsics retain safe count arithmetic');
  t.throws(() => readJsonLines('{malformed evidence}\n'),
    'malformed JSON-shaped evidence fails closed');

  const objectPrototype = Object.getPrototypeOf({});
  const arrayPrototype = Object.getPrototypeOf([]);
  const inheritedFnDescriptor = Object.getOwnPropertyDescriptor(
    objectPrototype, 'fn',
  );
  const inheritedIndexDescriptor = Object.getOwnPropertyDescriptor(
    arrayPrototype, '0',
  );
  let pollutedRecord;
  let pollutedArray;
  try {
    Object.defineProperty(objectPrototype, 'fn', {
      configurable: true,
      enumerable: true,
      value: 'commitEntries',
    });
    Object.defineProperty(arrayPrototype, '0', {
      configurable: true,
      enumerable: true,
      value: {fn: 'commitEntries', inclusiveMs: 99},
    });
    pollutedRecord = canonicalizeJsonValue({inclusiveMs: 99});
    pollutedArray = canonicalizeJsonValue([]);
  } finally {
    if (inheritedFnDescriptor) {
      Object.defineProperty(objectPrototype, 'fn', inheritedFnDescriptor);
    } else {
      delete objectPrototype.fn;
    }
    if (inheritedIndexDescriptor) {
      Object.defineProperty(arrayPrototype, '0', inheritedIndexDescriptor);
    } else {
      delete arrayPrototype[0];
    }
  }
  t.equal(frameOwnerDurationMs(pollutedRecord), null,
    'Object prototype pollution is not copied into evidence');
  t.equal(pollutedArray.length, 0,
    'Array prototype pollution is not copied into evidence');
  t.end();
});

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
    'inflight TTL runs on the VIRTUAL clock when a timeSource is injected',
    async (t) => {
      // Red-on-revert for the catch-up TTL seam: with a raw Date.now() the
      // dedupe window measures REAL elapsed test time (microseconds here),
      // so the advance below would do nothing and the third fail would stay
      // suppressed.
      const timeSource = new VirtualTimeSource();
      const raft = new LifeRaft('node-1', {...RAFT_OPTIONS, timeSource});
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
        t.equal(writes.length, 1, 'suppressed inside the virtual TTL window');

        timeSource.advance(401);
        await incoming(
          buildAppendFail({failedIndex: 151, followerLastIndex: 4}),
          collect,
        );
        t.equal(
          writes.length,
          2,
          'TTL expired on the virtual clock re-arms the batch',
        );
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
    'concurrent leader terms cannot cross-wire a tail acknowledgement',
    async (t) => {
      const raft = new LifeRaft('node-3', RAFT_OPTIONS);
      try {
        raft.log.seed(1, 4);
        raft.term = 2;
        const acknowledgements = [];
        raft.message = (_target, packet) => {
          if (packet?.type === 'append ack') {
            acknowledgements.push({
              currentLeader: raft.leader,
              dataTerm: packet.data.term,
              envelopeTerm: packet.term,
              index: packet.data.index,
            });
          }
        };
        const incoming = raft.listeners('data')[0];
        const leaderA = incoming({
          type: 'append',
          data: buildEntries(5, 8, 2),
          last: {index: 4, term: 2, committedIndex: 4},
          address: 'leader-A',
          leader: 'leader-A',
          state: LifeRaft.LEADER,
          term: 2,
        }, () => {});
        const leaderB = incoming({
          type: 'append',
          data: buildEntries(9, 12, 3),
          last: {index: 8, term: 2, committedIndex: 8},
          address: 'leader-B',
          leader: 'leader-B',
          state: LifeRaft.LEADER,
          term: 3,
        }, () => {});
        await Promise.all([leaderA, leaderB]);

        t.same(
          acknowledgements.filter((ack) => ack.index === 8 || ack.index === 12),
          [
            {
              currentLeader: 'leader-A',
              dataTerm: 2,
              envelopeTerm: 2,
              index: 8,
            },
            {
              currentLeader: 'leader-B',
              dataTerm: 3,
              envelopeTerm: 3,
              index: 12,
            },
          ],
          'each tail ACK is sent under the leader and term that supplied it',
        );
        t.equal(raft.log.entries.get(12)?.term, 3,
          'the new leader tail is durable before its acknowledgement');
      } finally {
        raft.end();
      }
    },
  );

  await t.test(
    'authority changing during the awaited prefix read blocks tail durability',
    async (t) => {
      const saved = [];
      const acknowledgements = [];
      const raft = {
        term: 2,
        leader: 'leader-A',
        log: {
          async getLastInfo() {
            return {index: 4, term: 2, committedIndex: 0};
          },
          async get(index) {
            raft.term = 3;
            raft.leader = 'leader-B';
            return {index, term: 2};
          },
          saveCommands(entries) {
            saved.push(...entries);
          },
        },
        async packet() {
          acknowledgements.push('packet-built');
          return {term: 2};
        },
      };
      const packet = {
        data: buildEntries(5, 8, 2),
        last: {index: 4, term: 2, committedIndex: 0},
        address: 'leader-A',
        term: 2,
      };

      await handleFollowerAppendBatch({
        raft,
        packet,
        write() {},
        async originalListener() {},
        getCommittedIndex: () => 0,
        isRecoverableAppendEntry: () => true,
        async validateCommittedBatchEntries() {},
      });

      t.same(saved, [], 'stale leader tail is not made durable');
      t.same(acknowledgements, [], 'stale leader tail is not acknowledged');
    },
  );

  await t.test(
    'authority changing during fallback persistence stops later tail saves',
    async (t) => {
      const saved = [];
      const acknowledgements = [];
      const raft = {
        term: 2,
        leader: 'leader-A',
        log: {
          async getLastInfo() {
            return {index: 4, term: 2, committedIndex: 0};
          },
          async get(index) {
            return {index, term: 2};
          },
          async saveCommand(_command, _term, index) {
            saved.push(index);
            if (saved.length === 1) {
              raft.term = 3;
              raft.leader = 'leader-B';
            }
          },
        },
        async packet() {
          acknowledgements.push('packet-built');
          return {term: 2};
        },
      };
      const packet = {
        data: buildEntries(5, 8, 2),
        last: {index: 4, term: 2, committedIndex: 0},
        address: 'leader-A',
        term: 2,
      };

      await handleFollowerAppendBatch({
        raft,
        packet,
        write() {},
        async originalListener() {},
        getCommittedIndex: () => 0,
        isRecoverableAppendEntry: () => true,
        async validateCommittedBatchEntries() {},
      });

      t.same(saved, [6],
        'the in-flight save may finish but no later stale entry persists');
      t.same(acknowledgements, [], 'the stale partial tail is not acknowledged');
    },
  );

  await t.test('a batch without sender identity fails closed', async (t) => {
    const saved = [];
    const acknowledgements = [];
    const raft = {
      term: 2,
      leader: 'leader-B',
      log: {
        async getLastInfo() {
          return {index: 1, term: 2, committedIndex: 0};
        },
        async get(index) {
          return {index, term: 2};
        },
        saveCommands(entries) {
          saved.push(...entries.map((entry) => entry.index));
        },
      },
      async packet() {
        acknowledgements.push('packet-built');
        return {term: 2};
      },
    };

    await handleFollowerAppendBatch({
      raft,
      packet: {
        data: buildEntries(2, 3, 2),
        last: {index: 1, term: 2, committedIndex: 0},
        term: 2,
      },
      write() {},
      async originalListener() {},
      getCommittedIndex: () => 0,
      isRecoverableAppendEntry: () => true,
      async validateCommittedBatchEntries() {},
    });

    t.same(saved, [], 'anonymous tail is not persisted');
    t.same(acknowledgements, [], 'anonymous tail is not acknowledged');

    let accessorReads = 0;
    const accessorPacket = {
      data: buildEntries(2, 3, 2),
      last: {index: 1, term: 2, committedIndex: 0},
      term: 2,
    };
    Object.defineProperty(accessorPacket, 'address', {
      get() {
        accessorReads += 1;
        return 'leader-B';
      },
    });
    await handleFollowerAppendBatch({
      raft,
      packet: accessorPacket,
      write() {},
      async originalListener() {},
      getCommittedIndex: () => 0,
      isRecoverableAppendEntry: () => true,
      async validateCommittedBatchEntries() {},
    });
    t.equal(accessorReads, 0, 'sender accessors are never invoked');
    t.same(saved, [], 'accessor sender cannot authorize persistence');
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

test('SQLite follower catch-up batches persistence and yields commit apply',
  async (t) => {
    await t.test(
      'the production follower batch seam persists local entry shapes and ' +
        'the committed prefix transactionally',
      async (t) => {
        const raft = new LifeRaft('node-3', SQLITE_RAFT_OPTIONS);
        const commits = [];
        raft.on('commit', (command) => commits.push(command.index));
        raft.message = () => {};
        raft.term = 2;
        try {
          const incoming = raft.listeners('data')[0];
          await incoming({
            type: 'append',
            data: buildEntries(1, 64),
            last: {index: 0, term: 2, committedIndex: 60},
            address: 'node-1',
            leader: 'node-1',
            state: LifeRaft.LEADER,
            term: 2,
          }, () => {});

          t.equal(raft.log.saveBatchCount, 1,
            'the 63-entry tail uses one SQLite save transaction');
          t.ok(raft.log.commitApplySliceCount >= 2,
            'first-entry and tail commits use atomic apply transactions');
          t.equal(raft.log.getCommittedIndex(), 60,
            'durable committed watermark reaches the leader prefix');
          t.same(commits, buildEntries(1, 60).map((entry) => entry.index),
            'state-machine delivery remains dense and ordered');
          const first = raft.log.get(1);
          const tail = raft.log.get(64);
          t.same(first.command, {type: 'cmd', index: 1},
            'batch head identity is preserved');
          t.same(tail.command, {type: 'cmd', index: 64},
            'batch tail identity is preserved');
          t.equal(raft.log.getSnapshotBoundary().lastIncludedIndex, 0,
            'virgin snapshot boundary is unchanged');
        } finally {
          raft.end();
          raft.log?.ownedDb?.close();
        }
      },
    );

    await t.test(
      'commit application yields before synchronous per-entry work can ' +
        'consume an election-scale turn',
      async (t) => {
        const raft = new LifeRaft('node-3', SQLITE_RAFT_OPTIONS);
        const entries = buildEntries(1, 20);
        raft.log.saveCommands(entries);
        let applied = 0;
        let timerObservedAt = null;
        let timerElapsedMs = null;
        const startedAtMs = performance.now();
        raft.on('commit', () => {
          burnCpuFor(175);
          applied += 1;
        });
        const timer = setTimeout(() => {
          timerObservedAt = applied;
          timerElapsedMs = performance.now() - startedAtMs;
        }, 0);
        try {
          await raft.commitEntries(entries);
          const totalElapsedMs = performance.now() - startedAtMs;
          t.equal(applied, entries.length, 'every committed entry is applied');
          t.ok(
            Number.isInteger(timerObservedAt) &&
              timerObservedAt > 0 && timerObservedAt < applied,
            `timer ran inside the commit prefix at entry ${timerObservedAt}`,
          );
          t.ok(totalElapsedMs > 3000,
            `the full apply crossed the election ceiling (${totalElapsedMs}ms)`);
          t.ok(timerElapsedMs < 3000,
            `the timer ran before the election ceiling (${timerElapsedMs}ms)`);
          t.ok(COMMIT_APPLY_SLICE_BUDGET_MS < 3000,
            'the production slice budget is below the election ceiling');
          t.equal(raft.log.getCommittedIndex(), entries.length,
            'yielding never precedes durable prefix advancement');
        } finally {
          clearTimeout(timer);
          raft.end();
          raft.log?.ownedDb?.close();
        }
      },
    );

    await t.test(
      'overlapping identical prefixes commit and apply exactly once',
      async (t) => {
        const raft = new LifeRaft('node-overlap', SQLITE_RAFT_OPTIONS);
        const entries = buildEntries(1, 4);
        raft.log.saveCommands(entries);
        const applied = [];
        raft.on('commit', (command) => applied.push(command.index));
        try {
          const first = raft.commitEntries(entries);
          const second = raft.commitEntries(entries);
          await Promise.all([first, second]);
          t.same(applied, [1, 2, 3, 4],
            'the queued overlap is filtered after the first commit');
          t.equal(raft.log.getCommittedIndex(), 4,
            'the durable prefix advances once');
        } finally {
          raft.end();
          raft.log?.ownedDb?.close();
        }
      },
    );

    await t.test(
      'an apply exception rolls back the slice and a retry is dense',
      async (t) => {
        const raft = new LifeRaft('node-rollback', SQLITE_RAFT_OPTIONS);
        const entries = buildEntries(1, 4);
        raft.log.saveCommands(entries);
        raft.log.ownedDb.exec(
          'CREATE TABLE applied_test (entry_index INTEGER PRIMARY KEY)',
        );
        let rejectEntryTwo = true;
        let rollbackEvents = 0;
        raft.on(RAFT_COMMIT_APPLY_ROLLBACK_EVENT, () => {
          rollbackEvents += 1;
        });
        raft.on('commit', (command) => {
          raft.log.ownedDb.prepare(
            'INSERT INTO applied_test (entry_index) VALUES (?)',
          ).run(command.index);
          if (command.index === 2 && rejectEntryTwo) {
            rejectEntryTwo = false;
            throw new Error('injected apply failure');
          }
        });
        try {
          await t.rejects(
            raft.commitEntries(entries),
            /injected apply failure/,
            'the apply error escapes to the caller',
          );
          t.equal(raft.log.getCommittedIndex(), 0,
            'the committed watermark rolls back with the apply writes');
          t.same(
            raft.log.ownedDb.prepare(
              'SELECT entry_index FROM applied_test ORDER BY entry_index',
            ).all(),
            [],
            'no partial durable state-machine effects remain',
          );
          t.equal(rollbackEvents, 1, 'rollback cache hook emitted once');
          await raft.commitEntries(entries);
          t.equal(raft.log.getCommittedIndex(), 4,
            'retry commits the whole prefix');
          t.same(
            raft.log.ownedDb.prepare(
              'SELECT entry_index FROM applied_test ORDER BY entry_index',
            ).all().map((row) => row.entry_index),
            [1, 2, 3, 4],
            'retry applies every entry densely and once',
          );
        } finally {
          raft.end();
          raft.log?.ownedDb?.close();
        }
      },
    );

    await t.test(
      'a closed adapter preserves the existing in-memory save contract',
      async (t) => {
        const db = new Database(':memory:');
        const log = new SQLiteLogAdapter(db, {address: 'node-closed'});
        db.close();
        const entries = buildEntries(1, 2);
        const saved = log.saveCommands(entries);
        t.same(
          saved.map((entry) => entry.command),
          entries.map((entry) => entry.command),
          'batch save does not open a transaction on a closed database',
        );
      },
    );
  },
);
