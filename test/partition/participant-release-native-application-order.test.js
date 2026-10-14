// The production release recipient must keep its one attempt pending after
// ENABLE until every current native voter has published the committed origin.
// The transport fault below acknowledges the exact commit carriers while
// withholding their recipient handlers; it never rewrites a Raft message or
// supplies release facts.

import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {createNativeDrainStageCapture, installBeforeExitDiagnostic} from
  './participant-release-native-exit-diagnostic.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTICIPANT_CUTOVER_PHASE,
  PARTICIPANT_CUTOVER_OUTCOME as RELEASE_OUTCOME,
  PARTICIPANT_RELEASE_ACTION,
  PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {
  releaseCensusDefect,
  releaseMemberIds,
  sameReplicaGeneration,
} from '../../src/partition/partition-participant-release-contract.js';
import {participantCutoverPauseOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as WRITE_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {RAFT_EVENT, RAFT_ROLE} from '../../src/raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from
  '../../src/raft/raft-committed-membership-constants.js';
import {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {setActualCoreEntryObserver, setNativeInboundStageObserver} from
  '../../src/raft/raft-rs-runtime-owner.js';
import {
  RAFT_RS_MESSAGE_TYPE,
  RAFT_RS_TRANSPORT_PROTOCOL,
} from '../../src/raft/raft-rs-ingress-constants.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';
import {track} from '../test-helpers/participant-transaction-fixture.js';

const NODE_ID = 'participant-release-native-node';
const PARTITION_ID = 'participant-release-native-p1';
const TABLE_NAME = 'participant_release_native_rows';
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const CARRIER_COUNT_CAP = 64;
const ROUTE_RECORD_CAP = 24;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const MEMBER_IDS = Object.freeze([
  `${PARTITION_ID}-r1`,
  `${PARTITION_ID}-r2`,
  `${PARTITION_ID}-r3`,
]);
const MEMBERS = Object.freeze(MEMBER_IDS.map((replicaId) =>
  Object.freeze([replicaId, NODE_ID])));
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_IDS_SQL = `SELECT id FROM ${TABLE_NAME} ORDER BY id`;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    logging: {level: 'fatal'},
    raft: GROUP_TIMING,
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

function lastIndexOf(record) {
  const entry = record.entries.at(-1);
  const entryIndex = entry === undefined ? 0n : BigInt(entry.index);
  const snapshotIndex = record.snapshot === null ? 0n :
    BigInt(record.snapshot.metadata.index);
  return entryIndex > snapshotIndex ? entryIndex : snapshotIndex;
}

// A passive read view: no operation-port command, facts read, status read or
// tick can be caused by this helper.
function durableView(dbPath, partitionId = PARTITION_ID) {
  const db = new Database(dbPath, {readonly: true});
  try {
    const store = Object.create(RaftRsDurableStore.prototype);
    store.db = db;
    const record = store.readDurableRecord(partitionId);
    return Object.freeze({
      applied: BigInt(record.appliedIndex),
      commit: BigInt(record.hardState?.commit ?? 0),
      last: lastIndexOf(record),
      term: BigInt(record.hardState?.term ?? 0),
      origin: readPartitionWriteOrigin(db),
      rows: db.prepare(SELECT_IDS_SQL).all().map(({id}) => id),
    });
  } finally {
    db.close();
  }
}

function allDurableViews(group) {
  return new Map(MEMBERS.map((member) =>
    [member[0], durableView(group.dbFileOf(member))]));
}

function settledPositionOf(views) {
  const first = views.get(MEMBER_IDS[0]);
  if (first === undefined || first.applied !== first.commit ||
      first.commit !== first.last || first.origin !== null) return null;
  for (const replicaId of MEMBER_IDS.slice(1)) {
    const view = views.get(replicaId);
    if (view === undefined || view.applied !== first.applied ||
        view.commit !== first.commit || view.last !== first.last ||
        view.term !== first.term || view.origin !== null) return null;
  }
  return Object.freeze({index: first.applied, term: first.term});
}

function positionOf(value) {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function sameAttempt(left, right) {
  return left?.leaderReplicaId === right?.leaderReplicaId &&
    left?.term === right?.term &&
    left?.leaderLifecycleIncarnation === right?.leaderLifecycleIncarnation &&
    left?.deadlineAtMs === right?.deadlineAtMs;
}

function requestIdentityOf(request) {
  return Object.freeze({
    action: request.action,
    partitionId: request.partitionId,
    replicaId: request.replicaId,
    releaseId: request.release.releaseId,
    release: request.release,
    attempt: request.attempt,
    target: request.target,
    origin: request.origin,
  });
}

function sameCarrierRoute(packet, leaderPeerId, followerPeerId) {
  return packet?.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
    packet.groupId === PARTITION_ID &&
    String(packet.from) === leaderPeerId &&
    String(packet.to) === followerPeerId;
}

function sameCarrierMessage(message, leaderPeerId, followerPeerId, term) {
  const type = message?.msgType;
  return String(message?.from) === leaderPeerId &&
    String(message?.to) === followerPeerId &&
    String(message?.term) === term &&
    (type === RAFT_RS_MESSAGE_TYPE.APPEND ||
      type === RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
}

function commitAdvancingCarrierOf(envelope, anchors) {
  const packet = envelope?.payload;
  if (!sameCarrierRoute(packet, anchors.leaderPeerId,
    anchors.followerPeerId)) return null;
  const message = packet.message;
  if (!sameCarrierMessage(message, anchors.leaderPeerId,
    anchors.followerPeerId, anchors.term)) return null;
  const commit = positionOf(message.commit);
  if (commit === null || commit <= anchors.settledIndex) return null;
  return Object.freeze({packet, message, commit});
}

function retainCarrier(state, carrier, receiver, args, followerPeerId) {
  if (state.matched < CARRIER_COUNT_CAP) {
    state.matched += 1;
  } else {
    state.overflow = true;
  }
  if (state.first !== null) {
    if (state.suppressed < CARRIER_COUNT_CAP) state.suppressed += 1;
    else state.overflow = true;
    return;
  }
  const {packet, message, commit} = carrier;
  state.first = Object.freeze({receiver, args, followerPeerId,
    protocol: packet.protocol, groupId: packet.groupId,
    packetFrom: packet.from, packetTo: packet.to, commit,
    msgType: message.msgType, term: message.term,
    from: message.from, to: message.to});
}

function leaderStatusOf(services) {
  const statuses = services.map((service) => Object.freeze({
    service,
    status: service.raft.readStatus(),
  }));
  const leaders = statuses.filter(({status}) => status.role === RAFT_ROLE.LEADER);
  assert.equal(leaders.length, 1, 'setup: the real group has one leader');
  const leader = leaders[0];
  for (const {status} of statuses) {
    assert.equal(status.term, leader.status.term,
      'setup: every voter observes the current term');
    assert.equal(status.configurationKey, leader.status.configurationKey,
      'setup: every voter observes the current configuration');
  }
  return Object.freeze({leader, statuses});
}

function createCommitCarrierGate(router, {leader, followers, settled}) {
  const states = new Map();
  const followerIds = Object.freeze(followers.map(({service}) =>
    service.replicaId));
  assert.equal(followerIds.length, MEMBER_IDS.length - 1,
    'setup: the gate owns every current follower');
  let armed = false;
  const leaderPeerId = String(leader.status.peerId);
  const term = String(leader.status.term);

  const restoreState = (replicaId, state) => {
    if (state === undefined || state.restored) return;
    if (router.getRegisteredHandler(state.address) === state.original) {
      state.restored = true;
      return;
    }
    assert.equal(router.unregisterExact(state.address, state.wrapper), true,
      `${replicaId}: only its exact gate handler is retired`);
    router.register(state.address, state.original);
    assert.equal(router.getRegisteredHandler(state.address), state.original,
      `${replicaId}: exact partition handler is restored`);
    state.restored = true;
  };

  try {
    for (const follower of followers) {
      const address = follower.service.unifiedAddress;
      const original = router.getRegisteredHandler(address);
      assert.equal(typeof original, 'function',
        `setup: ${follower.service.replicaId} owns its router handler`);
      const state = {address, original, wrapper: null, first: null,
        matched: 0, suppressed: 0, overflow: false, forwarded: false,
        restored: false};
      const followerPeerId = String(follower.status.peerId);
      state.wrapper = function(...args) {
        const carrier = armed ? commitAdvancingCarrierOf(args[0], {
          leaderPeerId, followerPeerId, term, settledIndex: settled.index,
        }) : null;
        if (carrier === null) return Reflect.apply(original, this, args);
        retainCarrier(state, carrier, this, args, followerPeerId);
        return {acknowledged: true};
      };
      router.register(address, state.wrapper);
      states.set(follower.service.replicaId, state);
    }
  } catch (error) {
    const restoreErrors = [];
    for (const [replicaId, state] of states) {
      try {
        restoreState(replicaId, state);
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
    }
    if (restoreErrors.length > 0) {
      throw new AggregateError([error, ...restoreErrors], error.message,
        {cause: error});
    }
    throw error;
  }

  return {
    followerIds,
    arm() {
      armed = true;
    },
    disarm() {
      armed = false;
    },
    facts() {
      return followerIds.map((replicaId) => {
        const state = states.get(replicaId);
        return Object.freeze({replicaId, first: state.first,
          matched: state.matched, suppressed: state.suppressed,
          overflow: state.overflow});
      });
    },
    diagnosticFacts() {
      return followerIds.map((replicaId) => {
        const state = states.get(replicaId);
        return Object.freeze({replicaId, matched: state.matched,
          suppressed: state.suppressed, overflow: state.overflow,
          forwarded: state.forwarded, restored: state.restored});
      });
    },
    async forward(replicaId) {
      const state = states.get(replicaId);
      if (state === undefined || state.forwarded) return;
      assert.notEqual(state.first, null, `${replicaId}: first carrier exists`);
      state.forwarded = true;
      await Reflect.apply(state.original, state.first.receiver, state.first.args);
    },
    restore(replicaId) {
      const state = states.get(replicaId);
      restoreState(replicaId, state);
    },
  };
}

function membershipReadFailure(state, phase, error) {
  const failure = Object.freeze({kind: 'membership-read-failure',
    replicaId: state.replicaId, phase, error});
  state.errors.push(failure);
  return failure;
}

function validateMembershipRead(state, request, answer, expectedIndex) {
  assert.equal(request?.purpose, COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
    `${state.replicaId}: the held native read is the canonical witness read`);
  assert.equal(answer?.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    `${state.replicaId}: the native membership answer is committed`);
  assert.equal(Object.isFrozen(answer), true,
    `${state.replicaId}: the native membership answer is immutable`);
  assert.equal(positionOf(answer.appliedIndex), expectedIndex,
    `${state.replicaId}: native membership applied position is exact`);
  assert.equal(positionOf(answer.commitIndex), expectedIndex,
    `${state.replicaId}: native membership commit position is exact`);
  assert.equal(answer.term, state.paused.membership.term,
    `${state.replicaId}: native membership term retains PAUSE`);
  assert.equal(answer.configurationKey, state.paused.membership.configurationKey,
    `${state.replicaId}: native membership configuration retains PAUSE`);
  assert.equal(answer.membershipGenerationIndex,
    state.paused.membership.membershipGenerationIndex,
    `${state.replicaId}: native membership generation retains PAUSE`);
  assert.equal(answer.identities[String(state.status.peerId)], state.replicaId,
    `${state.replicaId}: the native answer retains its exact peer identity`);
}

function passivelyRecordCurrentMembership(state, request, result) {
  if (state.currentStarted || state.current !== null || state.routeOutcome !== null) {
    return;
  }
  state.currentStarted = true;
  const accept = (answer) => {
    try {
      assert.notEqual(state.expectedIndex, null,
        `${state.replicaId}: current membership has an origin anchor`);
      validateMembershipRead(state, request, answer, state.expectedIndex);
      state.current = Object.freeze({request, answer});
      state.currentSignal.resolve(Object.freeze({kind: 'current-membership',
        replicaId: state.replicaId, answer}));
    } catch (error) {
      state.currentSignal.resolve(membershipReadFailure(state,
        'current-membership', error));
    }
  };
  const reject = (error) => state.currentSignal.resolve(
    membershipReadFailure(state, 'current-membership', error));
  if (result !== null && typeof result?.then === 'function') {
    const observer = Promise.prototype.then.call(result, accept, reject);
    state.passiveTasks.push(observer);
    void Promise.prototype.catch.call(observer, () => undefined);
    return;
  }
  accept(result);
}

function createMembershipReadState({service, status, settled}) {
  const native = service.raft;
  const capturedSignal = Promise.withResolvers();
  const currentSignal = Promise.withResolvers();
  const progressSignal = Promise.withResolvers();
  const routeSignal = Promise.withResolvers();
  const hold = Promise.withResolvers();
  const state = {service, status, native, wrapper: null,
    replicaId: service.replicaId, settled, paused: null, request: null,
    captured: null, current: null, expectedIndex: null, progress: null,
    capturedSignal, currentSignal, progressSignal, routeSignal, hold,
    captureStarted: false, currentStarted: false, released: false,
    routeResult: null, routeOutcome: null, unsubscribe: null,
    carrierOutcome: null, stepOutcome: null, stepArmed: false,
    heldTask: null, passiveTasks: [], errors: []};

  const step = function(...args) {
    const capture = state.stepArmed;
    state.stepArmed = false;
    let result;
    try {
      result = Reflect.apply(native.step, this, args);
    } catch (error) {
      if (capture) state.stepOutcome = Object.freeze({kind: 'owned-threw', error});
      throw error;
    }
    if (capture) {
      try {
        recordOwnedSettlement(state, 'stepOutcome', result);
      } catch (error) {
        membershipReadFailure(state, 'step-observer', error);
      }
    }
    return result;
  };

  const readCommittedMembership = function(request) {
    const result = Reflect.apply(native.readCommittedMembership, native, [request]);
    if (state.request === null ||
        request?.purpose !== COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS) {
      return result;
    }
    if (!state.captureStarted) {
      state.captureStarted = true;
      state.heldTask = (async () => {
        try {
          const answer = await result;
          validateMembershipRead(state, request, answer, settled.index);
          state.captured = Object.freeze({request, answer});
          capturedSignal.resolve(Object.freeze({kind: 'captured-membership',
            replicaId: state.replicaId, answer}));
          await hold.promise;
          return answer;
        } catch (error) {
          capturedSignal.resolve(membershipReadFailure(state,
            'captured-membership', error));
          throw error;
        }
      })();
      void Promise.prototype.catch.call(state.heldTask, () => undefined);
      return state.heldTask;
    }
    passivelyRecordCurrentMembership(state, request, result);
    return result;
  };
  state.wrapper = createRaftOperationPort({...native, step, readCommittedMembership});
  service.raft = state.wrapper;
  return state;
}

function createMembershipReadTreatment(followers, settled) {
  const states = new Map();
  try {
    for (const follower of followers) {
      const state = createMembershipReadState({...follower, settled});
      states.set(state.replicaId, state);
    }
  } catch (error) {
    const restorationErrors = [];
    for (const state of states.values()) {
      try {
        if (state.service.raft === state.wrapper) state.service.raft = state.native;
      } catch (restoreError) {
        restorationErrors.push(restoreError);
      }
    }
    if (restorationErrors.length > 0) {
      throw new AggregateError([error, ...restorationErrors], error.message,
        {cause: error});
    }
    throw error;
  }

  return {
    states: Object.freeze([...states.values()]),
    arm(identity, request, paused) {
      const state = states.get(identity.replicaId);
      if (state === undefined) return;
      assert.equal(state.request, null,
        `${identity.replicaId}: one exact observation arms its native read`);
      assert.equal(state.service.raft, state.wrapper,
        `${identity.replicaId}: the exact installed native wrapper is current`);
      assert.equal(request.replicaId, identity.replicaId,
        `${identity.replicaId}: the exact route request is retained`);
      assert.equal(sameReplicaGeneration(identity.target,
        paused.generation), true,
      `${identity.replicaId}: the wrapper is armed by its PAUSE generation`);
      state.request = request;
      state.paused = paused;
    },
    recordRoute(identity, result) {
      const state = states.get(identity.replicaId);
      if (state === undefined) return;
      assert.equal(state.routeResult, null,
        `${identity.replicaId}: one exact observation route is retained`);
      state.routeResult = result;
      const settlement = Promise.prototype.then.call(result,
        (response) => Object.freeze({kind: 'observation-settled',
          replicaId: state.replicaId, response}),
        (error) => Object.freeze({kind: 'observation-threw',
          replicaId: state.replicaId, error}));
      state.passiveTasks.push(settlement);
      const routeObserver = Promise.prototype.then.call(settlement, (outcome) => {
        state.routeOutcome = outcome;
        state.routeSignal.resolve(outcome);
      }, (error) => {
        const failure = membershipReadFailure(state, 'route-observer', error);
        state.routeOutcome = failure;
        state.routeSignal.resolve(failure);
      });
      state.passiveTasks.push(routeObserver);
      void Promise.prototype.catch.call(routeObserver, () => undefined);
    },
    expectCurrent(index) {
      for (const state of states.values()) state.expectedIndex = index;
    },
    armStep(replicaId) {
      const state = states.get(replicaId);
      assert.equal(state.stepArmed, false,
        `${replicaId}: one exact native step capture is armed`);
      state.stepArmed = true;
    },
    subscribeProgress() {
      for (const state of states.values()) {
        assert.equal(state.unsubscribe, null,
          `${state.replicaId}: one applied-progress subscription is installed`);
        state.unsubscribe = state.native.subscribe(RAFT_EVENT.APPLIED_PROGRESS,
          () => {
            if (state.progress !== null) return;
            state.progress = Object.freeze({replicaId: state.replicaId});
            state.progressSignal.resolve(Object.freeze({kind: 'applied-progress',
              replicaId: state.replicaId}));
          });
      }
    },
    release() {
      for (const state of states.values()) {
        if (state.released) continue;
        state.released = true;
        state.hold.resolve();
      }
    },
    restore(state) {
      if (state.service.raft === state.native) return;
      assert.equal(state.service.raft, state.wrapper,
        `${state.replicaId}: only the exact membership wrapper is restored`);
      state.service.raft = state.native;
    },
  };
}

async function requireTreatmentRecord(state, field, signal, releaseSettled,
  stage) {
  const outcome = await Promise.race([
    signal,
    state.routeSignal.promise,
    releaseSettled,
  ]);
  const record = state[field];
  assert.notEqual(record, null,
    `${state.replicaId}: ${stage} precedes route/release settlement ` +
      `(${diagnosticText(outcome)})`);
  return record;
}

function recordOwnedSettlement(state, field, result) {
  assert.equal(state[field], null,
    `${state.replicaId}: one exact ${field} settlement is retained`);
  const retain = (kind, value) => {
    state[field] = Object.freeze({kind, ...value});
    return state[field];
  };
  if (result === null || typeof result?.then !== 'function') {
    retain('owned-settled', {value: result});
    return null;
  }
  const observer = Promise.prototype.then.call(result,
    (value) => {
      return retain('owned-settled', {value});
    },
    (error) => {
      return retain('owned-threw', {error});
    });
  state.passiveTasks.push(observer);
  void Promise.prototype.catch.call(observer, () => undefined);
  return observer;
}

async function requireOwnedSettlement(state, signal, releaseSettled, stage) {
  const outcome = await requireTreatmentRecord(state, 'carrierOutcome', signal,
    releaseSettled, stage);
  if (outcome.kind === 'owned-threw') throw outcome.error;
  return outcome.value;
}

function assertPublishedFollower(state, group, held) {
  const view = durableView(group.dbFileOf(MEMBERS.find(([replicaId]) =>
    replicaId === state.replicaId)));
  assert.deepEqual([view.applied, view.commit, view.last],
    [held.k, held.k, held.k],
    `${state.replicaId}: the real application owner publishes K while N is held`);
  assert.equal(view.term, held.term,
    `${state.replicaId}: publication retains the active term`);
  assert.deepEqual(view.origin, held.enabled.origin,
    `${state.replicaId}: publication stores the exact ENABLE origin`);
  assert.deepEqual(view.rows, [],
    `${state.replicaId}: publication adds no user write`);
}

function assertObservationRefresh(state, held) {
  const outcome = state.routeOutcome;
  assert.equal(outcome?.kind, 'observation-settled',
    `${state.replicaId}: the exact observation route settles successfully`);
  const answer = outcome.response[PARTICIPANT_RELEASE_RESULT_FIELD];
  assert.equal(answer?.outcome, RELEASE_OUTCOME.OBSERVED,
    `${state.replicaId}: the original observation returns canonical facts`);
  assert.equal(answer.partitionId, PARTITION_ID);
  assert.equal(answer.generation.replicaId, state.replicaId);
  assert.equal(sameReplicaGeneration(answer.generation,
    state.paused.generation), true,
  `${state.replicaId}: refreshed facts retain the exact PAUSE generation`);
  assert.equal(answer.membership, state.current.answer,
    `${state.replicaId}: refreshed facts retain the native K answer`);
  assert.equal(positionOf(answer.membership.appliedIndex), held.k);
  assert.deepEqual(answer.origin, held.enabled.origin);
  assert.deepEqual(state.errors, [],
    `${state.replicaId}: native membership scheduling has no capture error`);
}

function validatePauseAnchor(records, {leader, statuses, settled}) {
  assert.equal(records.size, MEMBER_IDS.length,
    'the natural PAUSE batch contains all three voters');
  const leaderId = leader.service.replicaId;
  const peerByReplica = new Map(statuses.map(({service, status}) =>
    [service.replicaId, String(status.peerId)]));
  let first = null;
  for (const replicaId of MEMBER_IDS) {
    const record = records.get(replicaId);
    assert.ok(record, `${replicaId}: PAUSE answer is present`);
    const {request, answer} = record;
    assert.equal(answer?.outcome, RELEASE_OUTCOME.OBSERVED,
      `${replicaId}: PAUSE returns canonical facts`);
    assert.equal(answer.paused, true, `${replicaId}: admission is paused`);
    assert.equal(answer.origin, null, `${replicaId}: origin is initially absent`);
    assert.equal(String(answer.work.appliedIndex), String(settled.index));
    assert.equal(String(answer.work.commitIndex), String(settled.index));
    assert.equal(String(answer.work.lastIndex), String(settled.index));
    assert.equal(answer.leaderReplicaId, leaderId);
    assert.equal(answer.membership.term, leader.status.term);
    assert.equal(answer.membership.configurationKey,
      leader.status.configurationKey);
    assert.deepEqual(releaseMemberIds(answer.membership), [...MEMBER_IDS].sort());
    assert.equal(answer.membership.identities[peerByReplica.get(replicaId)],
      replicaId, `${replicaId}: committed peer identity is exact`);
    assert.equal(sameReplicaGeneration(request.target, answer.generation), true,
      `${replicaId}: PAUSE target is the exact current generation`);
    assert.equal(sameReplicaGeneration(answer.generation, answer.generation),
      true, `${replicaId}: current generation is complete`);
    if (first === null) {
      first = record;
    } else {
      assert.equal(request.releaseId, first.request.releaseId);
      assert.equal(request.release, first.request.release);
      assert.equal(sameAttempt(request.attempt, first.request.attempt), true);
      assert.deepEqual(answer.membership, first.answer.membership);
    }
  }
  assert.equal(first.request.attempt.leaderReplicaId, leaderId);
  assert.equal(first.request.attempt.term, leader.status.term);
  assert.equal(first.request.attempt.leaderLifecycleIncarnation,
    records.get(leaderId).answer.generation.lifecycleIncarnation);
  return Object.freeze({releaseId: first.request.releaseId,
    release: first.request.release, attempt: first.request.attempt, records});
}

function createReleaseRouteObserver(router, {gate, leader, statuses, settled,
  membershipReads}) {
  const originalDeliver = router.deliver;
  const pauseRecords = new Map();
  const finalInspectRecords = [];
  const observationCalls = [];
  const errors = [];
  const entered = Promise.withResolvers();
  let pauseAnchor = null;
  let enableRecord = null;
  let matched = 0;
  let dropped = 0;
  let errorCount = 0;
  let errorOverflow = false;
  let routeOverflow = null;

  const recordError = (error) => {
    errorCount = Math.min(errorCount + 1, ROUTE_RECORD_CAP);
    if (errors.length < ROUTE_RECORD_CAP) {
      errors.push(error);
    } else {
      errorOverflow = true;
    }
  };

  const admit = () => {
    if (matched < ROUTE_RECORD_CAP) {
      matched += 1;
      return true;
    }
    dropped = Math.min(dropped + 1, ROUTE_RECORD_CAP);
    if (routeOverflow === null) {
      routeOverflow = new Error('participant release route record cap exceeded');
      entered.resolve(Object.freeze({kind: 'capture-overflow'}));
    }
    return false;
  };

  const observeCompletion = (request, response, error, finalInspect,
    callOrdinal) => {
    try {
      if (error !== null) throw error;
      const answer = response[PARTICIPANT_RELEASE_RESULT_FIELD];
      if (finalInspect !== null) finalInspect.answer = answer;
      if (request.action === PARTICIPANT_RELEASE_ACTION.PAUSE) {
        const identity = requestIdentityOf(request);
        assert.equal(pauseRecords.has(request.replicaId), false,
          `${request.replicaId}: one PAUSE answer`);
        pauseRecords.set(request.replicaId, Object.freeze({request: identity,
          answer, callOrdinal}));
        if (pauseRecords.size === MEMBER_IDS.length) {
          pauseAnchor = validatePauseAnchor(pauseRecords,
            {leader, statuses, settled});
          gate.arm();
        }
      } else if (request.action === PARTICIPANT_RELEASE_ACTION.ENABLE) {
        const identity = requestIdentityOf(request);
        assert.equal(enableRecord, null, 'one ENABLE answer');
        enableRecord = Object.freeze({request: identity, answer, callOrdinal});
      }
    } catch (captureError) {
      recordError(captureError);
    }
  };

  const finalInspectAtCall = (targetAddress, request, callOrdinal) => {
    if (request.action !== PARTICIPANT_RELEASE_ACTION.INSPECT ||
        enableRecord === null) return null;
    const record = {callOrdinal,
      phase: PARTICIPANT_CUTOVER_PHASE.REPLICA_CENSUS,
      targetAddress, request, answer: null};
    finalInspectRecords.push(record);
    return record;
  };

  const prepareAppliedPositionCall = (request) => {
    const action = PARTICIPANT_RELEASE_ACTION.OBSERVE_APPLIED_POSITION;
    if (typeof action !== 'string' || request.action !== action) return null;
    const identity = requestIdentityOf(request);
    observationCalls.push(identity);
    try {
      assert.ok(pauseAnchor, 'observation follows the complete PAUSE batch');
      assert.ok(enableRecord, 'observation follows the completed ENABLE reply');
      assert.equal(identity.partitionId, PARTITION_ID);
      assert.equal(identity.releaseId, pauseAnchor.releaseId);
      assert.equal(sameAttempt(identity.attempt, pauseAnchor.attempt), true);
      const pause = pauseAnchor.records.get(identity.replicaId);
      assert.ok(pause, 'observation targets a current release member');
      assert.equal(sameReplicaGeneration(identity.target,
        pause.answer.generation), true);
      assert.deepEqual(identity.origin, enableRecord.answer.origin);
      membershipReads.arm(identity, request, pause.answer);
      return Object.freeze({identity, valid: true});
    } catch (captureError) {
      recordError(captureError);
      return Object.freeze({identity, valid: false});
    }
  };

  const recordAppliedPositionRoute = (observation, result) => {
    if (observation === null) return;
    try {
      membershipReads.recordRoute(observation.identity, result);
    } catch (captureError) {
      recordError(captureError);
    }
    entered.resolve(Object.freeze({kind: observation.valid ?
      'observation' : 'invalid-observation',
    identity: observation.identity}));
  };

  const wrappedDeliver = function(...args) {
    const request = args[1];
    const observed = request?.type === PARTICIPANT_RELEASE_TYPE &&
      request.partitionId === PARTITION_ID;
    const captured = observed && admit();
    const callOrdinal = matched;
    const finalInspect = captured ?
      finalInspectAtCall(args[0], request, callOrdinal) : null;
    const observation = captured ? prepareAppliedPositionCall(request) : null;
    let result;
    try {
      result = Reflect.apply(originalDeliver, this, args);
    } catch (error) {
      if (captured) {
        observeCompletion(request, null, error, finalInspect, callOrdinal);
      }
      throw error;
    }
    if (captured) {
      recordAppliedPositionRoute(observation, result);
      try {
        void Promise.prototype.then.call(result,
          (response) => observeCompletion(request, response, null, finalInspect,
            callOrdinal),
          (error) => observeCompletion(request, null, error, finalInspect,
            callOrdinal));
      } catch (captureError) {
        recordError(captureError);
      }
    }
    return result;
  };
  router.deliver = wrappedDeliver;

  return {
    entered: entered.promise,
    facts() {
      const boundedErrors = routeOverflow === null ? [...errors] :
        [...errors, routeOverflow];
      return Object.freeze({pauseAnchor, enableRecord,
        finalInspectRecords: finalInspectRecords.map((record) =>
          Object.freeze({...record})),
        observationCalls: [...observationCalls], errors: boundedErrors,
        matched, dropped, errorCount, errorOverflow});
    },
    diagnosticFacts() {
      return Object.freeze({pauseComplete: pauseAnchor !== null,
        enableComplete: enableRecord !== null,
        observationCalls: observationCalls.length,
        matched, dropped, errorCount, errorOverflow,
        routeOverflow: routeOverflow !== null});
    },
    restore() {
      if (router.deliver === originalDeliver) return;
      assert.equal(router.deliver, wrappedDeliver,
        'only the exact release route observer is restored');
      router.deliver = originalDeliver;
    },
  };
}

function assertHeldEdge({gate, route, group, leader, settled}) {
  const routeFacts = route.facts();
  assert.deepEqual(routeFacts.errors, [], 'route observation has no error');
  assert.equal(routeFacts.dropped, 0,
    'held-edge route observations fit their physical cap');
  assert.equal(routeFacts.errorOverflow, false,
    'held-edge route errors fit their physical cap');
  assert.ok(routeFacts.pauseAnchor, 'the exact natural PAUSE batch armed the gate');
  const enabled = routeFacts.enableRecord?.answer;
  assert.equal(enabled?.outcome, RELEASE_OUTCOME.OBSERVED,
    `ENABLE returns canonical leader facts (${JSON.stringify(enabled)})`);
  assert.ok(enabled.origin, 'ENABLE returns the actual committed origin');
  assert.equal(routeFacts.enableRecord.request.release,
    routeFacts.pauseAnchor.release,
    'ENABLE retains the exact release identity from PAUSE');
  assert.equal(sameAttempt(routeFacts.enableRecord.request.attempt,
    routeFacts.pauseAnchor.attempt), true,
  'ENABLE retains the exact release attempt from PAUSE');
  const k = BigInt(enabled.origin.originIndex);
  assert.ok(k > settled.index, `origin ${k} advances settled ${settled.index}`);
  assert.equal(enabled.origin.originTerm, Number(leader.status.term));

  const carriers = gate.facts();
  assert.equal(carriers.length, 2);
  for (const carrier of carriers) {
    assert.notEqual(carrier.first, null,
      `${carrier.replicaId}: a first commit carrier is held`);
    assert.equal(carrier.overflow, false,
      `${carrier.replicaId}: retransmission accounting stays bounded`);
    assert.equal(carrier.first.commit, k,
      `${carrier.replicaId}: first carrier announces actual origin K`);
    assert.equal(carrier.first.protocol, RAFT_RS_TRANSPORT_PROTOCOL);
    assert.equal(carrier.first.groupId, PARTITION_ID);
    assert.equal(String(carrier.first.packetFrom), String(leader.status.peerId));
    assert.equal(String(carrier.first.packetTo), carrier.first.followerPeerId);
    assert.equal(String(carrier.first.term), String(leader.status.term));
    assert.equal(String(carrier.first.from), String(leader.status.peerId));
    assert.equal(String(carrier.first.to), carrier.first.followerPeerId);
    assert.ok(carrier.first.msgType === RAFT_RS_MESSAGE_TYPE.APPEND ||
      carrier.first.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
  }

  const views = allDurableViews(group);
  for (const replicaId of MEMBER_IDS) {
    const view = views.get(replicaId);
    assert.equal(view.term, settled.term,
      `${replicaId}: the injected fault changes no term`);
    if (replicaId === leader.service.replicaId) {
      assert.deepEqual([view.applied, view.commit, view.last], [k, k, k],
        'leader durably applies the origin before ENABLE answers');
      assert.deepEqual(view.origin, enabled.origin,
        'leader stores the exact origin returned by ENABLE');
    } else {
      assert.deepEqual([view.applied, view.commit, view.last],
        [settled.index, settled.index, k],
        `${replicaId}: appended origin remains unapplied while carrier is held`);
      assert.equal(view.origin, null, `${replicaId}: no origin is published`);
    }
  }
  return Object.freeze({enabled, n: settled.index, k, term: settled.term});
}

function assertFinalWork(facts, held, leaderReplicaId) {
  assert.deepEqual({sqliteTransactionOpen: facts.work.sqliteTransactionOpen,
    participantStaging: facts.work.participantStaging,
    participantPrepared: facts.work.participantPrepared,
    proposals: facts.work.proposals,
    pendingOutcomes: facts.work.pendingOutcomes},
  {sqliteTransactionOpen: false, participantStaging: false,
    participantPrepared: 0, proposals: 0, pendingOutcomes: 0},
  `${facts.generation.replicaId}: all non-index work is clear`);
  const applied = positionOf(facts.work.appliedIndex);
  const commit = positionOf(facts.work.commitIndex);
  const last = positionOf(facts.work.lastIndex);
  assert.equal([applied, commit, last].every((position) => position !== null),
    true, `${facts.generation.replicaId}: published positions are integers`);
  assert.equal(positionOf(facts.membership.appliedIndex), applied);
  assert.equal(positionOf(facts.membership.commitIndex), commit);
  if (facts.generation.replicaId === leaderReplicaId) {
    assert.deepEqual([applied, commit, last], [held.k, held.k, held.k]);
    assert.deepEqual(facts.origin, held.enabled.origin);
    return;
  }
  assert.deepEqual([applied, commit], [held.n, held.n]);
  assert.ok(last >= held.n && last <= held.k,
    `${facts.generation.replicaId}: published last is within N..K`);
  assert.equal(facts.origin, null,
    `${facts.generation.replicaId}: follower origin remains unpublished`);
}

function assertFinalInspectRecord(record, context) {
  const {pauseAnchor, current, held, expectedAddress} = context;
  const {request, answer: facts} = record;
  const replicaId = request.replicaId;
  const paused = pauseAnchor.records.get(replicaId)?.answer;
  const status = current.statuses.find(({service}) =>
    service.replicaId === replicaId)?.status;
  assert.ok(paused, `${replicaId}: final INSPECT retains its PAUSE anchor`);
  assert.ok(status, `${replicaId}: final INSPECT retains its voter owner`);
  assert.equal(record.phase, PARTICIPANT_CUTOVER_PHASE.REPLICA_CENSUS);
  assert.equal(record.targetAddress, expectedAddress);
  assert.equal(request.type, PARTICIPANT_RELEASE_TYPE);
  assert.equal(request.action, PARTICIPANT_RELEASE_ACTION.INSPECT);
  assert.equal(request.partitionId, PARTITION_ID);
  assert.equal(request.deadlineAtMs, pauseAnchor.attempt.deadlineAtMs);
  assert.equal(facts?.outcome, RELEASE_OUTCOME.OBSERVED);
  assert.equal(facts.partitionId, PARTITION_ID);
  assert.equal(facts.generation.replicaId, request.replicaId,
    `${replicaId}: final reply belongs to its requested member`);
  assert.equal(sameReplicaGeneration(facts.generation, paused.generation), true,
    `${replicaId}: final generation is the exact PAUSE generation`);
  assert.equal(facts.buildDigest, pauseAnchor.release.targetBuildDigest);
  assert.equal(facts.buildDigest, paused.buildDigest);
  assert.equal(facts.membership.kind,
    COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
  assert.equal(facts.membership.term, pauseAnchor.attempt.term);
  assert.equal(facts.membership.configurationKey,
    pauseAnchor.release.configurationKey);
  assert.equal(facts.membership.membershipGenerationIndex,
    pauseAnchor.release.membershipGenerationIndex);
  assert.equal(facts.membership.gateOpen, true);
  assert.deepEqual(facts.membership.identities, paused.membership.identities);
  assert.deepEqual(releaseMemberIds(facts.membership), [...MEMBER_IDS].sort());
  assert.equal(facts.leaderReplicaId, pauseAnchor.attempt.leaderReplicaId);
  assert.equal(facts.leaderAddress, current.leader.service.unifiedAddress);
  assert.equal(facts.role, status.role);
  assert.equal(facts.confChangePending, false);
  assert.equal(facts.paused, true);
  assert.deepEqual(facts.connection,
    {generation: facts.generation.connectionGeneration, servedLegacy: false});
  assert.deepEqual(facts.rowid, paused.rowid,
    `${replicaId}: final rowid census is unchanged from PAUSE`);
  assert.equal(facts.rowid.maximum, null);
  assert.equal(facts.rowid.belowCeiling, true);
  assert.equal(facts.topology, null);
  assert.equal(facts.queryCensus, null);
  assertFinalWork(facts, held, pauseAnchor.attempt.leaderReplicaId);
}

function observeRemainingBudget(attempt, leader) {
  const deadlineAtMs = attempt.deadlineAtMs;
  const nowMs = leader.service.timeSource.now();
  assert.equal(Number.isSafeInteger(deadlineAtMs), true,
    'the original release deadline is a safe integer');
  assert.equal(Number.isSafeInteger(nowMs), true,
    'the release owner clock returns a safe integer');
  const remainingMs = deadlineAtMs - nowMs;
  assert.equal(Number.isSafeInteger(remainingMs), true,
    'the original release remaining budget is a safe integer');
  assert.ok(remainingMs > 0,
    `the original release deadline remains usable (${remainingMs}ms)`);
  return Object.freeze({deadlineAtMs, nowMs, remainingMs});
}

function finalInspectDiagnostic(answer, route, held, current) {
  const routeFacts = route.facts();
  const {pauseAnchor, enableRecord, finalInspectRecords} = routeFacts;
  assert.deepEqual(routeFacts.errors, [],
    'terminal release observation remains error-free');
  assert.equal(routeFacts.dropped, 0,
    'terminal release observations fit their physical cap');
  assert.equal(routeFacts.errorOverflow, false,
    'terminal release errors fit their physical cap');
  assert.equal(answer.releaseId, pauseAnchor.releaseId,
    'the refusal retains the original release id');
  assert.equal(answer.partitionId, pauseAnchor.release.partitionId,
    'the refusal retains the original partition');
  assert.equal(answer.phase, PARTICIPANT_RELEASE_ACTION.RELEASE,
    'the refusal belongs to the original outer release');
  assert.equal(enableRecord.request.release, pauseAnchor.release,
    'the completed ENABLE retains the original release identity');
  assert.equal(sameAttempt(enableRecord.request.attempt,
    pauseAnchor.attempt), true,
  'the completed ENABLE retains the original release attempt');
  assert.equal(finalInspectRecords.length, MEMBER_IDS.length,
    'the final natural INSPECT retains one reply per original cohort member');
  assert.deepEqual(finalInspectRecords.map(({request}) => request.replicaId),
    [...MEMBER_IDS].sort(), 'the final INSPECT retains canonical cohort order');
  assert.equal(new Set(finalInspectRecords.map(({request}) =>
    request.replicaId)).size, MEMBER_IDS.length,
  'the final INSPECT contains three unique original voters');
  const expectedAddress = `${NODE_ID}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`;
  let previousOrdinal = enableRecord.callOrdinal;
  for (const record of finalInspectRecords) {
    assert.ok(record.callOrdinal > previousOrdinal,
      'final INSPECT calls follow completed ENABLE in exact call order');
    previousOrdinal = record.callOrdinal;
    assertFinalInspectRecord(record,
      {pauseAnchor, current, held, expectedAddress});
  }
  const census = finalInspectRecords.map(({answer: facts}) => facts);
  const local = census.find(({generation}) =>
    generation.replicaId === pauseAnchor.attempt.leaderReplicaId);
  const defect = releaseCensusDefect(pauseAnchor.release, census, local,
    {attempt: pauseAnchor.attempt});
  assert.equal(defect, answer.outcome,
    'the complete canonical classifier selects the actual source answer');
  const clock = observeRemainingBudget(pauseAnchor.attempt, current.leader);
  return Object.freeze({
    sourceAnswer: answer,
    classifierOutcome: defect,
    release: pauseAnchor.release,
    attempt: pauseAnchor.attempt,
    n: String(held.n),
    k: String(held.k),
    term: String(held.term),
    clock,
    finalInspects: finalInspectRecords,
  });
}

function diagnosticText(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({unavailable: String(error?.message ?? error)});
  }
}

function assertFinalRelease(answer, route, held) {
  const routeFacts = route.facts();
  assert.deepEqual(routeFacts.errors, [],
    'release route observation remains error-free through RESUME');
  assert.equal(routeFacts.dropped, 0,
    'every participant release route observation fits its physical cap');
  assert.equal(routeFacts.errorOverflow, false,
    'route observation error retention fits its physical cap');
  assert.equal(answer.outcome, RELEASE_OUTCOME.CUT_OVER,
    `the same attempt completes (${JSON.stringify(answer)})`);
  const {pauseAnchor, enableRecord} = routeFacts;
  assert.equal(answer.release, pauseAnchor.release,
    'the result retains the exact original release identity');
  assert.equal(enableRecord.request.release, pauseAnchor.release);
  assert.equal(answer.census.length, MEMBER_IDS.length);
  const finalReplicaIds = answer.census.map(({generation}) =>
    generation.replicaId);
  assert.deepEqual([...new Set(finalReplicaIds)].sort(), [...MEMBER_IDS].sort(),
    'the final census contains each exact member once');
  const local = answer.census.find(({generation}) =>
    generation.replicaId === pauseAnchor.attempt.leaderReplicaId);
  assert.equal(releaseCensusDefect(answer.release, answer.census, local,
    {attempt: pauseAnchor.attempt}), null,
  'the full canonical release classifier accepts the final census');
  const pauseRecords = pauseAnchor.records;
  for (const facts of answer.census) {
    const paused = pauseRecords.get(facts.generation.replicaId).answer;
    assert.deepEqual(facts.origin, held.enabled.origin,
      `${facts.generation.replicaId}: final origin is identical`);
    assert.equal(sameReplicaGeneration(facts.generation,
      paused.generation), true,
    `${facts.generation.replicaId}: generation is unchanged`);
    assert.equal(facts.membership.term, paused.membership.term,
      `${facts.generation.replicaId}: membership term is unchanged`);
    assert.equal(facts.membership.configurationKey,
      paused.membership.configurationKey,
      `${facts.generation.replicaId}: configuration is unchanged`);
    assert.equal(facts.membership.membershipGenerationIndex,
      paused.membership.membershipGenerationIndex,
      `${facts.generation.replicaId}: membership generation is unchanged`);
    assert.equal(facts.leaderReplicaId, paused.leaderReplicaId,
      `${facts.generation.replicaId}: release leader is unchanged`);
    assert.deepEqual(releaseMemberIds(facts.membership),
      [...MEMBER_IDS].sort());
  }
  assert.equal(routeFacts.observationCalls.length, MEMBER_IDS.length,
    'the applied-position phase naturally targets all three current members');
}

async function captureCleanup(errors, phase, operation) {
  try {
    await operation();
    return null;
  } catch (error) {
    errors.push(Object.freeze({phase, error}));
    return error;
  }
}

function finishWithCustody(primary, cleanupErrors, retainedDirectory) {
  if (primary !== null && cleanupErrors.length === 0) throw primary;
  if (primary === null && cleanupErrors.length === 0) return;
  const causes = [primary, ...cleanupErrors.map(({error}) => error)]
    .filter((error) => error !== null);
  const message = primary?.message ?? 'native release witness cleanup failed';
  const aggregate = new AggregateError(causes, message, {cause: primary ?? causes[0]});
  aggregate.cleanupFailures = cleanupErrors;
  if (retainedDirectory !== null) {
    aggregate.retainedDirectory = retainedDirectory;
  }
  throw aggregate;
}

async function cleanupMembershipReads(membershipReads, cleanupErrors) {
  if (membershipReads === null) return false;
  let portCustodyUncertain = false;
  await captureCleanup(cleanupErrors, 'release-membership-reads', async () =>
    membershipReads.release());
  for (const state of membershipReads.states) {
    if (state.heldTask !== null) {
      await captureCleanup(cleanupErrors,
        `settle-held-membership-${state.replicaId}`, () => state.heldTask);
    }
    for (const [ordinal, task] of state.passiveTasks.entries()) {
      await captureCleanup(cleanupErrors,
        `settle-membership-observer-${state.replicaId}-${ordinal}`, () => task);
    }
  }
  for (const state of membershipReads.states) {
    if (state.unsubscribe !== null) {
      await captureCleanup(cleanupErrors,
        `unsubscribe-applied-progress-${state.replicaId}`, async () => {
          state.unsubscribe();
        });
    }
    const restoreFailure = await captureCleanup(cleanupErrors,
      `restore-membership-port-${state.replicaId}`, async () =>
        membershipReads.restore(state));
    if (restoreFailure !== null) portCustodyUncertain = true;
  }
  return portCustodyUncertain;
}

async function cleanupExitDiagnostic(exitDiagnostic, cleanupErrors) {
  if (exitDiagnostic === null) return;
  await captureCleanup(cleanupErrors, 'remove-before-exit-diagnostic',
    async () => process.removeListener('beforeExit', exitDiagnostic.listener));
  if (exitDiagnostic.error !== null) {
    cleanupErrors.push(Object.freeze({phase: 'before-exit-diagnostic',
      error: exitDiagnostic.error}));
  }
}

async function cleanupNativeWitness({gate, membershipReads, releasePromise, route,
  releaseOwners, group, router, exitDiagnostic}, primary) {
  const cleanupErrors = [];
  // The passive observer ends before cleanup's own core operations.
  setNativeInboundStageObserver(null);
  setActualCoreEntryObserver(null);
  if (exitDiagnostic !== null) {
    exitDiagnostic.cleanupEntered = true;
    exitDiagnostic.phase = 'cleanup';
  }
  if (gate !== null) gate.disarm();
  if (gate !== null) {
    for (const replicaId of gate.followerIds) {
      await captureCleanup(cleanupErrors, `forward-${replicaId}`,
        () => gate.forward(replicaId));
    }
    for (const replicaId of gate.followerIds) {
      await captureCleanup(cleanupErrors, `restore-${replicaId}`,
        () => gate.restore(replicaId));
    }
  }
  const membershipPortCustodyUncertain = await cleanupMembershipReads(
    membershipReads, cleanupErrors);
  if (releasePromise !== null) {
    await captureCleanup(cleanupErrors, 'settle-release', () => releasePromise);
  }
  if (route !== null) {
    for (const error of route.facts().errors) {
      cleanupErrors.push(Object.freeze({phase: 'release-route-observation',
        error}));
    }
    await captureCleanup(cleanupErrors, 'restore-release-route',
      () => route.restore());
  }
  let releaseOwnerFailure = null;
  let retainedDirectory = null;
  if (releaseOwners !== null) {
    releaseOwnerFailure = await captureCleanup(cleanupErrors,
      'dispose-release-owners',
      () => releaseOwners.dispose());
  }
  if (group !== null) {
    if (membershipPortCustodyUncertain) {
      retainedDirectory = path.dirname(group.dbFileOf(MEMBERS[0]));
    }
    await captureCleanup(cleanupErrors, 'dispose-group', () => group.dispose({
      retainDirectory: membershipPortCustodyUncertain ||
        releaseOwnerFailure !== null ||
        primary?.retainedDirectory !== undefined,
    }));
  }
  await captureCleanup(cleanupErrors, 'shutdown-router', () => router.shutdown());
  await captureCleanup(cleanupErrors, 'reset-environment',
    async () => resetEnvironment());
  await cleanupExitDiagnostic(exitDiagnostic, cleanupErrors);
  finishWithCustody(primary, cleanupErrors, retainedDirectory);
}

test('the real participant release owner waits for every native voter origin ' +
  'publication before final census and resumes the same attempt',
{timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const router = new MessageRouter({nodeId: NODE_ID,
    bootIncarnation: TEST_BOOT_INCARNATION});
  let group = null;
  let releaseOwners = null;
  let gate = null;
  let membershipReads = null;
  let route = null;
  let releasePromise = null;
  let trackedRelease = null;
  let exitDiagnostic = null;
  let primary = null;

  try {
    exitDiagnostic = {partitionId: PARTITION_ID,
      phase: 'router-initialize', edgeKind: null,
      cleanupEntered: false, trackedRelease: null, listener: null,
      error: null, routerInitialized: false, groupFormed: false,
      settledObserved: false, releaseOwnersAttached: false,
      gate: null, membershipReads: null, route: null,
      nativeCore: {observerInstalled: false, groupEntries: 0, groupStepCalls: 0},
      nativeDrainInstalled: false, nativeDrain: null};
    installBeforeExitDiagnostic(exitDiagnostic);
    await router.initialize({startServer: false});
    exitDiagnostic.routerInitialized = true;
    exitDiagnostic.phase = 'group-formation';
    group = await formAdmittedGroup({
      partitionId: PARTITION_ID,
      members: MEMBERS,
      tempPrefix: 'participant-release-native-',
      serviceOptions: tableOptions(),
      budgetMs: GROUP_BUDGET_MS,
      transport: router,
    });
    exitDiagnostic.groupFormed = true;
    exitDiagnostic.phase = 'settled-position';
    assert.equal(await group.waitFor(() =>
      settledPositionOf(allDurableViews(group)) !== null), true,
    'setup: all three real voters have one settled native position');
    exitDiagnostic.settledObserved = true;
    const settled = settledPositionOf(allDurableViews(group));
    assert.ok(settled, 'setup: settled position N is observed passively');
    const current = leaderStatusOf(group.services);
    exitDiagnostic.phase = 'release-owner-attachment';
    releaseOwners = await attachPartitionReleaseOwners(group.services, {
      directory: path.dirname(group.dbFileOf(MEMBERS[0])),
      budgetMs: GROUP_BUDGET_MS,
    });
    exitDiagnostic.releaseOwnersAttached = true;
    gate = createCommitCarrierGate(router, {
      leader: current.leader,
      followers: current.statuses.filter(({status}) =>
        status.role !== RAFT_ROLE.LEADER),
      settled,
    });
    membershipReads = createMembershipReadTreatment(
      current.statuses.filter(({status}) => status.role !== RAFT_ROLE.LEADER),
      settled);
    route = createReleaseRouteObserver(router, {gate,
      leader: current.leader, statuses: current.statuses, settled,
      membershipReads});

    exitDiagnostic.gate = gate;
    exitDiagnostic.membershipReads = membershipReads;
    exitDiagnostic.route = route;
    exitDiagnostic.phase = 'release-start';
    releasePromise = releaseOwners.releaseOnce(PARTITION_ID);
    trackedRelease = track(releasePromise);
    exitDiagnostic.trackedRelease = trackedRelease;
    const releaseSettled = releasePromise.then(
      (answer) => Object.freeze({kind: 'release-settled', answer}),
      (error) => Object.freeze({kind: 'release-threw', error}));
    exitDiagnostic.phase = 'release-edge';
    const edge = await Promise.race([releaseSettled, route.entered]);
    exitDiagnostic.edgeKind = edge.kind;
    const held = assertHeldEdge({gate, route, group,
      leader: current.leader, settled});
    membershipReads.expectCurrent(held.k);

    const leaderMember = [current.leader.service.replicaId];
    const beforeWrite = durableView(group.dbFileOf(leaderMember));
    const queueBefore = Object.freeze({
      proposals: current.leader.service.proposalQueue.size,
      pendingOutcomes: current.leader.service.pendingWriteOutcomes.size,
    });
    exitDiagnostic.phase = 'paused-write';
    const paused = await insert(current.leader.service, 'paused-row',
      'must-not-commit', 'native-paused-write');
    const afterWrite = durableView(group.dbFileOf(leaderMember));
    assert.equal(paused.success, false, 'the held release admits no write');
    assert.equal(paused.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED,
      'the existing pause owner types the refusal');
    assert.deepEqual(afterWrite, beforeWrite,
      'the refused write changes no durable log, application row or origin');
    assert.deepEqual({proposals: current.leader.service.proposalQueue.size,
      pendingOutcomes: current.leader.service.pendingWriteOutcomes.size},
    queueBefore, 'the refused write creates no proposal or pending outcome');

    if (edge.kind !== 'observation') {
      assert.equal(edge.kind, 'release-settled',
        `the attempt must not throw (${edge.error?.message ?? edge.kind})`);
      const diagnostic = finalInspectDiagnostic(edge.answer, route, held,
        current);
      const diagnosticReport = diagnosticText(diagnostic);
      assert.fail('premature same-attempt settlement: the healthy original ' +
        'release settled while both exact follower origin carriers remained ' +
        `held and its deadline remained usable: ${diagnosticReport}`);
    }

    assert.equal(trackedRelease.settled, false,
      'the same release remains pending in applied-position observation');
    assert.deepEqual(route.facts().errors, [], 'observation call is exact');
    assert.equal(route.facts().observationCalls.length, MEMBER_IDS.length,
      'the natural observation batch entered for every current member');

    exitDiagnostic.phase = 'native-membership-capture';
    await Promise.all(membershipReads.states.map((state) =>
      requireTreatmentRecord(state, 'captured', state.capturedSignal.promise,
        releaseSettled, 'real native N capture')));
    assert.equal(trackedRelease.settled, false,
      'the same release remains pending while both native N answers are held');
    membershipReads.subscribeProgress();
    // Test-only existing observer; group-wide counts prove no per-follower attribution.
    // Arm only after real N capture, immediately before the two retained carriers.
    setActualCoreEntryObserver((entry) => {
      if (entry.groupId !== PARTITION_ID) return;
      exitDiagnostic.nativeCore.groupEntries += 1;
      if (entry.operation === 'step') exitDiagnostic.nativeCore.groupStepCalls += 1;
    });
    exitDiagnostic.nativeCore.observerInstalled = true;
    const drainStages = createNativeDrainStageCapture(PARTITION_ID,
      membershipReads.states.map(({replicaId}) => replicaId));
    exitDiagnostic.nativeDrain = drainStages.records;
    setNativeInboundStageObserver(drainStages.capture);
    exitDiagnostic.nativeDrainInstalled = true;
    const forwarded = membershipReads.states.map((state) => {
      membershipReads.armStep(state.replicaId);
      const promise = gate.forward(state.replicaId);
      return Object.freeze({state,
        signal: recordOwnedSettlement(state, 'carrierOutcome', promise)});
    });
    gate.disarm();
    for (const replicaId of gate.followerIds) gate.restore(replicaId);
    exitDiagnostic.phase = 'carrier-settlement';
    await Promise.all(forwarded.map(({state, signal}) =>
      requireOwnedSettlement(state, signal, releaseSettled,
        'the exact retained origin carrier')));
    exitDiagnostic.phase = 'applied-progress';
    await Promise.all(membershipReads.states.map((state) =>
      requireTreatmentRecord(state, 'progress', state.progressSignal.promise,
        releaseSettled, 'real applied-progress publication')));
    for (const state of membershipReads.states) {
      assertPublishedFollower(state, group, held);
    }
    membershipReads.release();
    exitDiagnostic.phase = 'current-membership';
    await Promise.all(membershipReads.states.map((state) =>
      requireTreatmentRecord(state, 'current', state.currentSignal.promise,
        releaseSettled, 'canonical native K refresh')));
    exitDiagnostic.phase = 'observation-route';
    await Promise.all(membershipReads.states.map((state) =>
      requireTreatmentRecord(state, 'routeOutcome', state.routeSignal.promise,
        releaseSettled, 'original observation reply')));
    for (const state of membershipReads.states) {
      assertObservationRefresh(state, held);
    }
    exitDiagnostic.phase = 'release-settlement';
    const released = await releasePromise;
    assertFinalRelease(released, route, held);
    assert.equal(group.services.every((service) =>
      participantCutoverPauseOf(service) === null), true,
    'the existing RESUME owner opens every current member');
    const afterRelease = allDurableViews(group);
    for (const view of afterRelease.values()) {
      assert.deepEqual([view.applied, view.commit, view.last],
        [held.k, held.k, held.k]);
      assert.deepEqual(view.origin, held.enabled.origin);
    }

    exitDiagnostic.phase = 'post-release-write';
    const write = await insert(current.leader.service, 'after-release',
      'served-once', 'native-after-release-write');
    assert.equal(write.success, true, 'the released leader serves one write');
    exitDiagnostic.phase = 'post-release-replication';
    assert.equal(await group.waitFor(() => {
      const views = allDurableViews(group);
      const expectedIndex = held.k + 1n;
      return [...views.values()].every((view) =>
        view.applied === expectedIndex && view.commit === expectedIndex &&
        view.last === expectedIndex && view.term === held.term &&
        JSON.stringify(view.rows) === JSON.stringify(['after-release']));
    }), true, 'the one ordinary write creates exactly K+1 on all three voters');
  } catch (error) {
    primary = error;
  }

  await cleanupNativeWitness({gate, membershipReads, releasePromise, route,
    releaseOwners, group, router, exitDiagnostic}, primary);
});
