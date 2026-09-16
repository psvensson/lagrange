import {AsyncResource} from 'node:async_hooks';
import {readdirSync, readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import LifeRaft from '../../src/raft/liferaft.js';

const HEARTBEAT_DURATION_MS = 10;
const ELECTION_DURATION_MS = 11;
const RETRY_DURATION_MS = 12;
const PROTOCOL_STEP_US = 5;
const ELECTION_STEP_US = 4;
const ATTEMPT_STEP_US = 2;
const RETRY_ERROR_STEP_US = 1;
const RETRY_COMPLETE_STEP_US = 1;
const DATA_STEP_US = 7;
const APPEND_READ_STEP_US = 3;
const APPLY_STEP_US = 7;
const TARGET_ATTEMPT_COUNT = 3;
const EXPECTED_RETRY_ERRORS = 2;
const LONG_TIMER_MS = 60_000;
const ZERO_DEPTH = 0;
// The neutral parent: the accounting owner normalises an empty store to its
// own unattributed bucket, so "no ownership transition occurred" is observed
// as unattributed rather than as an absent value.
const NEUTRAL_OWNER = FORMATION_OWNER.UNATTRIBUTED;
const NO_DURATION_US = 0;
const ONE_HANDOFF = 1;
// The production consumers that may legitimately enter the interaction
// contract. The mutation is only authoritative if every exercised one of them
// resolved the MUTATED module, so the witness names them rather than trusting
// a single mocked specifier.
const PROTOCOL_ENTRY_MODULE = Object.freeze({
  DATA: 'liferaft-incoming-data.js',
  TIMING: 'liferaft-timing-api.js',
});
const APPLY_ENTRY_MODULE = 'liferaft-commit-scheduler.js';
const SRC_URL = new URL('../../src/', import.meta.url);
const INTERACTION_SPECIFIER = 'raft-formation-attribution.js';
// The complete production consumer set. A new consumer added outside this list
// would be exercised by the host without being covered by the mutation, so the
// inventory is asserted rather than inspected.
const INTERACTION_CONSUMERS = Object.freeze([
  'raft/liferaft-commit-scheduler.js',
  'raft/liferaft-incoming-data.js',
  'raft/liferaft-timing-api.js',
]);
const OWNER_SAMPLE = Object.freeze({
  APPEND_READ: 'append-read',
  APPLY: 'apply',
  DATA_WRITE: 'data-write',
  HEARTBEAT: 'heartbeat',
  RETRY_ATTEMPT: 'retry-attempt',
});
const INTERACTION_VARIANT = Object.freeze({
  APPLY_REVERTED: 'apply',
  CURRENT: 'current',
  PROTOCOL_REVERTED: 'protocol',
});
const INTERACTION_URL = new URL(
  '../../src/diagnostics/raft-formation-attribution.js',
  import.meta.url,
);
const LIFERAFT_URL = new URL('../../src/raft/liferaft.js', import.meta.url);
const CONTRACT_URL = new URL(
  '../../src/diagnostics/formation-diagnostics-contract.js',
  import.meta.url,
);
const ATTRIBUTION_URL = new URL(
  '../../src/diagnostics/formation-turn-attribution.js',
  import.meta.url,
);
const SYNC_SECTIONS_URL = new URL(
  '../../src/diagnostics/raft-churn-sync-sections.js',
  import.meta.url,
);
const IMPACT_CONTRACTS_URL = new URL(
  '../../test/shards/impact-contracts.json',
  import.meta.url,
);
const QUEST_RECORD_URL = new URL(
  '../../solve/quests/formation-raft-protocol-attribution-interaction/' +
    'quest.json',
  import.meta.url,
);

class DeterministicTick {
  constructor(context) {
    this.context = context;
    this.timers = new Map();
  }

  createTimer(name, functions, duration, kind) {
    return {
      duration: Number(duration),
      functions,
      kind,
      resource: new AsyncResource(`LagrangeRaftTimer:${kind}`),
    };
  }

  setTimeout(name, callback, duration) {
    const current = this.timers.get(name);
    if (current) {
      current.functions.push(callback);
      return this;
    }
    this.timers.set(
      name,
      this.createTimer(name, [callback], duration, 'timeout'),
    );
    return this;
  }

  setInterval(name, callback, duration) {
    const current = this.timers.get(name);
    if (current) {
      current.functions.push(callback);
      return this;
    }
    this.timers.set(
      name,
      this.createTimer(name, [callback], duration, 'interval'),
    );
    return this;
  }

  setImmediate(name, callback) {
    const current = this.timers.get(name);
    if (current) {
      current.functions.push(callback);
      return this;
    }
    this.timers.set(name, this.createTimer(name, [callback], 0, 'immediate'));
    return this;
  }

  active(name) {
    return this.timers !== null && this.timers.has(name);
  }

  adjust(name, duration) {
    const current = this.timers?.get(name);
    if (!current) return this;
    current.resource.emitDestroy();
    this.timers.set(
      name,
      this.createTimer(name, current.functions, duration, current.kind),
    );
    return this;
  }

  clear(...names) {
    if (this.timers === null) return this;
    let targets = names;
    if (targets.length === 1 && typeof targets[0] === 'string') {
      targets = targets[0].split(/[, ]+/u).filter(Boolean);
    }
    if (targets.length === 0) targets = [...this.timers.keys()];
    for (const name of targets) {
      const timer = this.timers.get(name);
      if (!timer) continue;
      this.timers.delete(name);
      timer.resource.emitDestroy();
    }
    return this;
  }

  end() {
    if (this.timers === null) return false;
    this.clear();
    this.context = null;
    this.timers = null;
    return true;
  }

  names() {
    return this.timers === null ? [] : [...this.timers.keys()];
  }

  normalizedTimers() {
    return this.timers === null ? [] : [...this.timers.entries()]
      .map(([name, timer]) => ({
        duration: timer.duration,
        kind: name === 'heartbeat' || name === 'election' ?
          name : timer.kind,
      }))
      .sort((left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.duration - right.duration);
  }

  async fire(name) {
    const timer = this.timers?.get(name);
    if (!timer) throw new Error(`timer is not active: ${name}`);
    if (timer.kind !== 'interval') this.timers.delete(name);
    for (const callback of timer.functions) {
      await timer.resource.runInAsyncScope(callback, this.context);
    }
    if (timer.kind !== 'interval') timer.resource.emitDestroy();
  }
}

function createClock() {
  let nowUs = 0;
  const attribution = new FormationTurnAttribution({clock: () => nowUs});
  const ownerSamples = [];
  return {
    advance: (durationUs) => {
      nowUs += durationUs;
    },
    attribution,
    now: () => nowUs,
    ownerSamples,
    // The owner in force right now, read by the accounting owner's own rule:
    // the exclusive segment is authoritative while JavaScript runs, and the
    // async-local store answers only outside an observed segment.
    sampleOwner: (label) => {
      const owner = attribution.depth > ZERO_DEPTH ?
        attribution.activeOwner : attribution.context.getStore();
      const resolved = typeof owner === 'string' ? owner : NEUTRAL_OWNER;
      ownerSamples.push({label, owner: resolved});
      return resolved;
    },
  };
}

function createDeterministicRaft(RaftClass = LifeRaft) {
  const raft = new RaftClass('node-a/partition/p1-r1', {
    'election min': LONG_TIMER_MS,
    'election max': LONG_TIMER_MS,
    'heartbeat': LONG_TIMER_MS,
  });
  raft.timers.clear();
  const timers = new DeterministicTick(raft);
  raft.timers = timers;
  raft.beat = HEARTBEAT_DURATION_MS;
  raft.election = {min: ELECTION_DURATION_MS, max: ELECTION_DURATION_MS};
  return {raft, timers};
}

function ownerRow(snapshot, owner) {
  return snapshot.owners.find((entry) => entry.owner === owner);
}

function retryTimerName(timers) {
  return timers.names().find((name) =>
    name !== 'heartbeat' && name !== 'election' &&
    !name.endsWith('@async'));
}

function retryImmediateName(timers) {
  return timers.names().find((name) => name.endsWith('@async'));
}

async function measureHeartbeat(RaftClass = LifeRaft) {
  const {raft, timers} = createDeterministicRaft(RaftClass);
  const clock = createClock();
  let heartbeatCount = 0;
  raft.state = RaftClass.LEADER;
  raft.on('heartbeat', () => {
    heartbeatCount += 1;
    clock.sampleOwner(OWNER_SAMPLE.HEARTBEAT);
    clock.advance(PROTOCOL_STEP_US);
  });
  clock.attribution.start();
  const returned = raft.heartbeat(HEARTBEAT_DURATION_MS);
  await timers.fire('heartbeat');
  const rearmedAfterFirst = timers.active('heartbeat');
  await timers.fire('heartbeat');
  const rearmedAfterSecond = timers.active('heartbeat');
  const snapshot = clock.attribution.stop();
  raft.end();
  return {
    heartbeatCount,
    rearmedAfterFirst,
    rearmedAfterSecond,
    ownerSamples: clock.ownerSamples,
    returnedSelf: returned === raft,
    snapshot,
  };
}

async function measureElection() {
  const {raft, timers} = createDeterministicRaft();
  const clock = createClock();
  raft.on('term change', () => clock.advance(ELECTION_STEP_US));
  clock.attribution.start();
  raft.heartbeat(ELECTION_DURATION_MS);
  await timers.fire('heartbeat');
  const electionRegistered = timers.active('election');
  await timers.fire('election');
  const electionRearmed = timers.active('election');
  const term = raft.term;
  const snapshot = clock.attribution.stop();
  raft.end();
  return {electionRearmed, electionRegistered, snapshot, term};
}

async function measureIndefinite(RaftClass = LifeRaft) {
  const {raft, timers} = createDeterministicRaft(RaftClass);
  const clock = createClock();
  let attempts = 0;
  let errors = 0;
  let completion = null;
  raft.on('error', () => {
    errors += 1;
    clock.advance(RETRY_ERROR_STEP_US);
  });
  clock.attribution.start();
  const returned = raft.indefinitely((done) => {
    attempts += 1;
    clock.sampleOwner(OWNER_SAMPLE.RETRY_ATTEMPT);
    clock.advance(ATTEMPT_STEP_US);
    if (attempts === TARGET_ATTEMPT_COUNT) done(null, 'complete');
  }, (value) => {
    completion = value;
    clock.advance(RETRY_COMPLETE_STEP_US);
  }, RETRY_DURATION_MS);
  while (attempts < TARGET_ATTEMPT_COUNT) {
    await timers.fire(retryTimerName(timers));
    await timers.fire(retryImmediateName(timers));
  }
  await timers.fire(retryImmediateName(timers));
  const snapshot = clock.attribution.stop();
  raft.end();
  return {
    attempts,
    completion,
    errors,
    ownerSamples: clock.ownerSamples,
    returnedSelf: returned === raft,
    snapshot,
  };
}

async function measureInboundData(RaftClass = LifeRaft) {
  const {raft} = createDeterministicRaft(RaftClass);
  const clock = createClock();
  let emitted = false;
  clock.attribution.start();
  const response = await new Promise((resolve) => {
    emitted = raft.emit('data', {
      address: 'node-b/partition/p1-r2',
      leader: '',
      state: raft.state,
      term: raft.term,
      type: 'diagnostic-probe',
    }, (packet) => {
      clock.sampleOwner(OWNER_SAMPLE.DATA_WRITE);
      clock.advance(DATA_STEP_US);
      resolve(packet);
    });
  });
  const snapshot = clock.attribution.stop();
  raft.end();
  return {emitted, ownerSamples: clock.ownerSamples, response, snapshot};
}

function createApplyLog(clock, appliedCommands) {
  return {
    committedIndex: 0,
    async get() {
      return null;
    },
    async getLastInfo() {
      clock.sampleOwner(OWNER_SAMPLE.APPEND_READ);
      clock.advance(APPEND_READ_STEP_US);
      return {index: 0, term: 0};
    },
    async getUncommittedEntriesUpToIndex() {
      return [{command: 'set-x', index: 1, term: 0}];
    },
    getCommittedIndex() {
      return this.committedIndex;
    },
    commitAndApplySlice(entries, options) {
      clock.sampleOwner(OWNER_SAMPLE.APPLY);
      clock.advance(APPLY_STEP_US);
      for (const entry of entries) {
        options.apply(entry.command);
        appliedCommands.push(entry.command);
      }
      this.committedIndex = entries[entries.length - 1].index;
      return entries;
    },
    isOpen() {
      return true;
    },
    end() {},
  };
}

async function measureApply(RaftClass = LifeRaft) {
  const {raft} = createDeterministicRaft(RaftClass);
  const clock = createClock();
  const appliedCommands = [];
  raft.log = createApplyLog(clock, appliedCommands);
  clock.attribution.start();
  raft.emit('data', {
    address: 'node-b/partition/p1-r2',
    data: null,
    last: {committedIndex: 1, index: 0, term: 0},
    leader: '',
    state: raft.state,
    term: raft.term,
    type: RAFT_PACKET_TYPE.APPEND,
  }, () => {});
  await new Promise((resolve) => setImmediate(resolve));
  await raft._commitApplyTail;
  const snapshot = clock.attribution.stop();
  const committedIndex = raft.log.committedIndex;
  raft.end();
  return {
    appliedCommands,
    committedIndex,
    ownerSamples: clock.ownerSamples,
    snapshot,
  };
}

// Appended to every loaded variant. It records WHICH production consumer
// resolved THIS module instance, so the witness can prove the mutation
// reached the whole exercised graph instead of inferring it from a specifier.
const INTERACTION_RECORDER_SOURCE = `
const INTERACTION_ENTRIES = [];
function recordInteractionEntry(name) {
  const frames = new Error().stack.split('\\n');
  let caller = 'unknown';
  for (const frame of frames.slice(2)) {
    const match = /src\\/raft\\/([a-z0-9-]+\\.js)/u.exec(frame);
    if (match) {
      caller = match[1];
      break;
    }
  }
  INTERACTION_ENTRIES.push({caller, name});
}
export {INTERACTION_ENTRIES};
`;

const PROTOCOL_ENTRY_SIGNATURE = 'function runRaftProtocolActivity(callback) {';
const APPLY_ENTRY_SIGNATURE = 'function runRaftApplySlice(callback) {';
const PROTOCOL_ENTRY_INJECTION = `${PROTOCOL_ENTRY_SIGNATURE}
  recordInteractionEntry('protocol');`;
const APPLY_ENTRY_INJECTION = `${APPLY_ENTRY_SIGNATURE}
  recordInteractionEntry('apply');`;

function instrumentInteractionEntries(source) {
  return source
    .replace(PROTOCOL_ENTRY_SIGNATURE, PROTOCOL_ENTRY_INJECTION)
    .replace(APPLY_ENTRY_SIGNATURE, APPLY_ENTRY_INJECTION);
}

async function loadInteractionVariant(kind) {
  let source = readFileSync(INTERACTION_URL, 'utf8')
    .replace('./formation-diagnostics-contract.js', CONTRACT_URL.href)
    .replace('./formation-turn-attribution.js', ATTRIBUTION_URL.href)
    .replace('./raft-churn-sync-sections.js', SYNC_SECTIONS_URL.href);
  if (kind === INTERACTION_VARIANT.PROTOCOL_REVERTED) {
    const mapping =
      '  return runFormationOwner(FORMATION_OWNER.RAFT_PROTOCOL, callback);';
    if (!source.includes(mapping)) throw new Error('protocol mapping changed');
    source = source.replace(mapping, '  return callback();');
  } else if (kind === INTERACTION_VARIANT.APPLY_REVERTED) {
    const mapping = `  return runFormationOwner(FORMATION_OWNER.RAFT_APPLY, () =>
    trackRaftFollowerCommitApplySlice(callback));`;
    if (!source.includes(mapping)) throw new Error('apply mapping changed');
    source = source.replace(
      mapping,
      '  return trackRaftFollowerCommitApplySlice(callback);',
    );
  } else if (kind !== INTERACTION_VARIANT.CURRENT) {
    throw new Error(`unknown interaction variant: ${kind}`);
  }
  source = instrumentInteractionEntries(source) + INTERACTION_RECORDER_SOURCE;
  const encoded = Buffer.from(source).toString('base64');
  return import(`data:text/javascript;base64,${encoded}#${kind}`);
}

function interactionConsumers() {
  const found = [];
  for (const entry of readdirSync(SRC_URL, {recursive: true})) {
    const relative = String(entry).split('\\').join('/');
    if (!relative.endsWith('.js')) continue;
    if (relative.endsWith(INTERACTION_SPECIFIER)) continue;
    const source = readFileSync(new URL(relative, SRC_URL), 'utf8');
    if (source.includes(INTERACTION_SPECIFIER)) found.push(relative);
  }
  return found.sort();
}

function ownersAt(measured, label) {
  return measured.ownerSamples
    .filter((sample) => sample.label === label)
    .map((sample) => sample.owner);
}

function callersOf(interaction, name) {
  const seen = new Set();
  for (const entry of interaction.INTERACTION_ENTRIES) {
    if (entry.name === name) seen.add(entry.caller);
  }
  return [...seen].sort();
}

async function loadLifeRaftWithInteraction(tapTest, interaction) {
  const loaded = await tapTest.mockImport(LIFERAFT_URL.href, {
    [INTERACTION_URL.href]: interaction,
  });
  return loaded.default;
}

async function runInactiveScenario(RaftClass) {
  const {raft, timers} = createDeterministicRaft(RaftClass);
  raft.state = RaftClass.LEADER;
  let heartbeatCount = 0;
  raft.on('heartbeat', () => {
    heartbeatCount += 1;
  });
  const heartbeatReturnedSelf =
    raft.heartbeat(HEARTBEAT_DURATION_MS) === raft;
  await timers.fire('heartbeat');
  await timers.fire('heartbeat');
  const heartbeatTimers = timers.normalizedTimers();
  timers.clear();

  let attempts = 0;
  let completion = null;
  const retryReturnedSelf = raft.indefinitely((done) => {
    attempts += 1;
    done(null, 'complete');
  }, (value) => {
    completion = value;
  }, RETRY_DURATION_MS) === raft;
  await timers.fire(retryImmediateName(timers));
  const retryTimers = timers.normalizedTimers();
  timers.clear();

  const response = await new Promise((resolve) => {
    raft.emit('data', {
      address: 'node-b/partition/p1-r2',
      leader: raft.address,
      state: raft.state,
      term: raft.term,
      type: 'diagnostic-probe',
    }, resolve);
  });

  const appliedCommands = [];
  const inertClock = {advance() {}, sampleOwner() {}};
  raft.log = createApplyLog(inertClock, appliedCommands);
  await raft.commitEntries([{command: 'set-y', index: 1, term: 0}]);
  const result = {
    appliedCommands,
    attempts,
    completion,
    heartbeatCount,
    heartbeatReturnedSelf,
    heartbeatTimers,
    response: {data: response.data, type: response.type},
    retryReturnedSelf,
    retryTimers,
    state: raft.state,
    term: raft.term,
  };
  raft.end();
  return result;
}

test('Raft formation attribution has a registered owner-interaction contract',
  (t) => {
    const manifest = JSON.parse(readFileSync(IMPACT_CONTRACTS_URL, 'utf8'));
    const contract = manifest.contracts['raft-formation-attribution'];
    const pair = manifest.coupledPairs['raft-protocol-formation-attribution'];
    const mappingEndpoint = pair.endpoints.find(
      (endpoint) => endpoint.id === 'formation-attribution-mapping',
    );
    const witness =
      'test/raft/liferaft-formation-attribution-interaction.test.js';
    t.ok(contract.owners.includes('src/raft/liferaft.js'),
      'contract retains the LifeRaft behavior endpoint');
    t.ok(contract.owners.includes(
      'src/diagnostics/raft-formation-attribution.js'),
    'contract names the interaction owner');
    t.ok(contract.owners.includes(
      'src/diagnostics/formation-turn-attribution.js'),
    'contract retains the formation accounting owner');
    t.equal(pair.contract, 'raft-formation-attribution',
      'coupled pair points at the typed contract');
    t.same(pair.witnessTests, [witness],
      'the exact production-path witness is registered');
    t.equal(pair.endpoints.length, 2,
      'Raft behavior and diagnostics mapping remain separate endpoints');
    t.ok(mappingEndpoint.owners.includes(
      'src/diagnostics/formation-turn-attribution.js'),
    'mapping endpoint protects changes to the accounting implementation');

    t.same(interactionConsumers(), INTERACTION_CONSUMERS,
      'the interaction contract has exactly these production consumers: a ' +
        'fourth one would be exercised by the host without being covered by ' +
        'the mutation below');

    const quest = JSON.parse(readFileSync(QUEST_RECORD_URL, 'utf8'));
    const review = `${quest.legacy.cohesionReview.lines.join('\n')}\n`;
    t.match(review, /No existing owner owns the cross-cutting semantic mapping/u,
      'the pre-edit cohesion review records why the interaction owner exists');
    t.match(review, /No class methods or Raft behavior are extracted/u,
      'the review rules out a methods or line-count split');
    t.end();
  });

test('LifeRaft constructor registers its production heartbeat as raft_protocol',
  (t) => {
    const clock = createClock();
    clock.attribution.start();
    const raft = new LifeRaft('node-constructor', {
      'election min': LONG_TIMER_MS,
      'election max': LONG_TIMER_MS,
      'heartbeat': LONG_TIMER_MS,
    });
    const protocolRegistrations = [...clock.attribution.asyncOwners.values()]
      .filter((owner) => owner === FORMATION_OWNER.RAFT_PROTOCOL);
    t.ok(protocolRegistrations.length > 0,
      'the actual tick-tock registration inherits raft_protocol');
    raft.timers.clear();
    const snapshot = clock.attribution.stop();
    raft.end();
    t.equal(snapshot.overlapDurationUs, 0,
      'zero-time registration creates no overlapping duration');
    t.end();
  });

test('leader heartbeat callbacks stay raft_protocol through every re-arm',
  async (t) => {
    const measured = await measureHeartbeat();
    t.equal(measured.returnedSelf, true,
      'heartbeat preserves the LifeRaft return contract');
    t.equal(measured.heartbeatCount, 2,
      'two production leader heartbeat callbacks execute');
    t.equal(measured.rearmedAfterFirst, true,
      'the first callback re-arms the production heartbeat');
    t.equal(measured.rearmedAfterSecond, true,
      'the second generation re-arms again');
    t.equal(
      ownerRow(measured.snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      PROTOCOL_STEP_US * 2,
      'both generations are charged exclusively to raft_protocol',
    );
    t.end();
  });

test('election registration and repeated promotion re-arm stay raft_protocol',
  async (t) => {
    const measured = await measureElection();
    t.equal(measured.electionRegistered, true,
      'heartbeat timeout registers the production election timer');
    t.equal(measured.electionRearmed, true,
      'the next promotion registers another election generation');
    t.equal(measured.term, 2, 'both production promotions execute');
    t.equal(
      ownerRow(measured.snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      ELECTION_STEP_US * 2,
      'both election generations retain raft_protocol ownership',
    );
    t.end();
  });

test('LifeRaft indefinite retry retains raft_protocol across generations',
  async (t) => {
    const measured = await measureIndefinite();
    t.equal(measured.returnedSelf, true,
      'indefinitely preserves its fluent LifeRaft return');
    t.equal(measured.attempts, TARGET_ATTEMPT_COUNT,
      'the production retry loop reaches three attempt generations');
    t.equal(measured.errors, EXPECTED_RETRY_ERRORS,
      'both timeout generations take the production error path');
    t.equal(measured.completion, 'complete',
      'the third generation takes the production completion path');
    t.equal(
      ownerRow(measured.snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      TARGET_ATTEMPT_COUNT * ATTEMPT_STEP_US +
        EXPECTED_RETRY_ERRORS * RETRY_ERROR_STEP_US +
        RETRY_COMPLETE_STEP_US,
      'attempt, timeout-error, and completion work all remain raft_protocol',
    );
    t.end();
  });

test('patched inbound DATA dispatch executes as raft_protocol', async (t) => {
  const measured = await measureInboundData();
  t.equal(measured.emitted, true,
    'the EventEmitter reaches the installed production DATA listener');
  t.equal(measured.response.type, RAFT_PACKET_TYPE.ERROR,
    'the upstream unknown-packet behavior still writes a typed error packet');
  t.equal(
    ownerRow(measured.snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
    DATA_STEP_US,
    'the asynchronous production write continuation retains raft_protocol',
  );
  t.end();
});

test('cooperative apply stays distinct and the full window is charged once',
  async (t) => {
    const measured = await measureApply();
    const snapshot = measured.snapshot;
    t.same(measured.appliedCommands, ['set-x'],
      'the production commit scheduler applies the command once');
    t.equal(measured.committedIndex, 1,
      'the fake durable port records the same committed index');
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      APPEND_READ_STEP_US,
      'DATA-side log work stays raft_protocol',
    );
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_APPLY).durationUs,
      APPLY_STEP_US,
      'the commit/application slice is exclusively raft_apply',
    );
    t.equal(snapshot.busyDurationUs,
      APPEND_READ_STEP_US + APPLY_STEP_US,
      'nested apply attribution does not double charge the protocol owner');
    t.equal(snapshot.accountedDurationUs, snapshot.windowDurationUs,
      'owner plus idle duration exactly partitions the window');
    t.equal(snapshot.partitionDeltaUs, 0, 'the partition has no missing time');
    t.equal(snapshot.overlapDurationUs, 0, 'the partition has no overlap');
    t.end();
  });

test('inactive attribution leaves normalized Raft behavior unchanged',
  async (t) => {
    const revertedInteraction = await loadInteractionVariant(INTERACTION_VARIANT.PROTOCOL_REVERTED);
    const RevertedLifeRaft = await loadLifeRaftWithInteraction(
      t,
      revertedInteraction,
    );
    const current = await runInactiveScenario(LifeRaft);
    const reverted = await runInactiveScenario(RevertedLifeRaft);
    t.same(current, reverted,
      'active seam and exact protocol-mapping revert have identical inactive ' +
        'timer, retry, DATA, apply, return, and state effects');
    t.end();
  });

test('the loaded interaction variant is the module every exercised path used',
  async (t) => {
    const protocolVariant = await loadInteractionVariant(
      INTERACTION_VARIANT.PROTOCOL_REVERTED);
    const ProtocolRevertedLifeRaft = await loadLifeRaftWithInteraction(
      t, protocolVariant);
    await measureHeartbeat(ProtocolRevertedLifeRaft);
    await measureIndefinite(ProtocolRevertedLifeRaft);
    await measureInboundData(ProtocolRevertedLifeRaft);
    t.ok(protocolVariant.INTERACTION_ENTRIES.length > ZERO_DEPTH,
      'production resolved the mutated interaction module: an empty record ' +
        'means the substitution never applied and every ownership assertion ' +
        'would be measuring the unmutated mapping instead');
    t.same(callersOf(protocolVariant, 'protocol'),
      [PROTOCOL_ENTRY_MODULE.DATA, PROTOCOL_ENTRY_MODULE.TIMING],
      'both production protocol entries - the timing API and inbound DATA ' +
        'dispatch - entered the mutated mapping, so no exercised path kept ' +
        'the original one');

    const applyVariant = await loadInteractionVariant(
      INTERACTION_VARIANT.APPLY_REVERTED);
    const ApplyRevertedLifeRaft = await loadLifeRaftWithInteraction(
      t, applyVariant);
    await measureApply(ApplyRevertedLifeRaft);
    t.same(callersOf(applyVariant, 'apply'), [APPLY_ENTRY_MODULE],
      'the commit scheduler is the production apply entry, and it entered ' +
        'the mutated mapping');
    t.same(callersOf(applyVariant, 'protocol'),
      [PROTOCOL_ENTRY_MODULE.DATA, PROTOCOL_ENTRY_MODULE.TIMING],
      'the same run entered protocol from inbound DATA dispatch and from the ' +
        'constructor heartbeat, so the parent owner in the nested claim ' +
        'below is production-established');
    t.end();
  });

// The falsifier is semantic, not numeric: from a neutral parent, the current
// mapping must CAUSE an ownership transition that the reverted mapping does
// not, while the production behaviour underneath is unchanged.
const PROTOCOL_SCENARIO = Object.freeze([
  Object.freeze({
    label: OWNER_SAMPLE.HEARTBEAT,
    measure: measureHeartbeat,
    name: 'leader heartbeat',
  }),
  Object.freeze({
    label: OWNER_SAMPLE.RETRY_ATTEMPT,
    measure: measureIndefinite,
    name: 'indefinite retry',
  }),
  Object.freeze({
    label: OWNER_SAMPLE.DATA_WRITE,
    measure: measureInboundData,
    name: 'inbound DATA dispatch',
  }),
]);

test('reverting the protocol mapping removes the ownership transition',
  async (t) => {
    const variant = await loadInteractionVariant(
      INTERACTION_VARIANT.PROTOCOL_REVERTED);
    const RevertedLifeRaft = await loadLifeRaftWithInteraction(t, variant);
    for (const scenario of PROTOCOL_SCENARIO) {
      const current = await scenario.measure(LifeRaft);
      const reverted = await scenario.measure(RevertedLifeRaft);
      const currentOwners = ownersAt(current, scenario.label);
      const revertedOwners = ownersAt(reverted, scenario.label);
      t.ok(currentOwners.length > ZERO_DEPTH,
        `${scenario.name}: production work runs inside the window`);
      t.same(currentOwners,
        currentOwners.map(() => FORMATION_OWNER.RAFT_PROTOCOL),
        `${scenario.name}: an unowned parent acquires raft_protocol at the ` +
          'semantic boundary');
      t.equal(revertedOwners.length, currentOwners.length,
        `${scenario.name}: the same production work still executes with the ` +
          'mapping reverted');
      t.same(revertedOwners, revertedOwners.map(() => NEUTRAL_OWNER),
        `${scenario.name}: and that ownership transition does not occur`);
    }
    t.end();
  });

test('reverting the apply mapping leaves apply under the parent protocol owner',
  async (t) => {
    const variant = await loadInteractionVariant(
      INTERACTION_VARIANT.APPLY_REVERTED);
    const RevertedLifeRaft = await loadLifeRaftWithInteraction(t, variant);
    const current = await measureApply(LifeRaft);
    const reverted = await measureApply(RevertedLifeRaft);
    t.same(ownersAt(current, OWNER_SAMPLE.APPEND_READ),
      [FORMATION_OWNER.RAFT_PROTOCOL],
      'the DATA-side parent is raft_protocol in both arms');
    t.same(ownersAt(reverted, OWNER_SAMPLE.APPEND_READ),
      [FORMATION_OWNER.RAFT_PROTOCOL],
      'the apply revert does not disturb the parent boundary');
    t.same(ownersAt(current, OWNER_SAMPLE.APPLY),
      [FORMATION_OWNER.RAFT_APPLY],
      'apply work explicitly hands off from the parent to raft_apply');
    t.equal(
      ownerRow(current.snapshot, FORMATION_OWNER.RAFT_APPLY).handoffCount,
      ONE_HANDOFF,
      'and the handoff is counted as a new semantic boundary, not a dispatch');
    t.same(reverted.appliedCommands, current.appliedCommands,
      'the same production commands apply either way');
    t.same(ownersAt(reverted, OWNER_SAMPLE.APPLY),
      [FORMATION_OWNER.RAFT_PROTOCOL],
      'with the mapping reverted the apply work remains under the parent ' +
        'protocol owner');
    const revertedApply =
      ownerRow(reverted.snapshot, FORMATION_OWNER.RAFT_APPLY);
    t.equal(revertedApply.durationUs, NO_DURATION_US,
      'and raft_apply receives none of the apply duration');
    t.equal(revertedApply.handoffCount, NO_DURATION_US,
      'nor any handoff: no second semantic boundary was crossed');
    t.end();
  });
