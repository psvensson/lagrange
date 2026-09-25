// The cells the differential oracle ranges over (coverage-model-amendment-1):
//
//   - the EVENT axis, generated as message type x receiver predicate from the
//     binding's own enumerations: every local-only type (the core refuses its
//     step), every response type from a sender with no progress (the core
//     refuses its step), and a catalogue of receiver predicates for every
//     other type, each naming the decision input it moves; a type with no
//     cell carries a recorded reason;
//   - the DECISION axis D1-D6, each crossed with one event per decision
//     input (role/term/leader, progress, configuration, transfer in
//     progress), in every harness mode: synchronous and asynchronous sends,
//     per-replica-index production timing, listener re-entry on and off;
//   - PAIRS, generated as "an event that moves predicate p" x "an event whose
//     step or announcement reads p";
//   - the second transfer (D1/D2 x a pending MsgTransferLeader), D1 with an
//     uncommitted configuration entry pending, admission closed by a real
//     BEGIN, and an envelope arriving while the request's turn awaits a send.

import assert from 'node:assert/strict';

import {
  RAFT_MEMBERSHIP_OPERATION,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  SEND_MODE,
  TIMING_MODE,
  craft,
  proposalEntry,
} from './transfer-leadership-drain-oracle-harness.js';
import {mostCaughtUp, namedSuccessor} from './transfer-leadership-driver.js';

const A = 'oracle-a';
const B = 'oracle-b';
const C = 'oracle-c';
// Reserved in every registry, never a member: a peer with no progress.
const D = 'oracle-d';
const REPLICAS = Object.freeze([A, B, C]);
const MOVES = Object.freeze({
  INPUT: 'input',
  OUTBOUND: 'outbound',
  // The receiver predicate makes the core refuse the envelope's own step;
  // the build asserts the predicate.
  REFUSED: 'refused',
  EITHER: 'input-or-outbound',
});

// ---------------------------------------------------------------- decisions

const DECISIONS = Object.freeze({
  D1: {name: 'named transfer',
    request: (requester, target = C) => (driver) =>
      driver.port(requester).transferLeadership(namedSuccessor(target))},
  D2: {name: 'most-caught-up transfer',
    request: (requester) => (driver) =>
      driver.port(requester).transferLeadership(mostCaughtUp())},
  D3: {name: 'dropped-propose classification',
    request: (requester) => (driver) =>
      driver.port(requester).propose({decision: 'propose', at: requester})},
  D4: {name: 'dropped-conf-change classification',
    request: (requester) => (driver) =>
      driver.port(requester).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D})},
  D5: {name: 'campaign eligibility',
    request: (requester) => (driver) => driver.port(requester).campaign()},
  D6: {name: 'progress probe',
    request: (requester, target = C) => (driver) =>
      driver.port(requester).probePeerProgress(
        driver.cluster.addressOf(target))},
});

// ------------------------------------------------------------ build helpers

function byRaftId(driver, replicaIds) {
  const idOf = (replicaId) => BigInt(driver.raftIdAt(A, replicaId));
  return [...replicaIds].sort((left, right) => {
    const difference = idOf(left) - idOf(right);
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  });
}

// B wins the next term with C while its vote request to A is lost, so A is
// a stale leader and B's first append as leader is on its way to A.
async function newLeaderAppendAtStaleA(run) {
  await run.act(() => run.driver.port(B).campaign());
  assert.ok(run.driver.loseInTransit(A) > 0,
    'setup: the vote request is lost');
  await run.deliverOnly([C]);
  await run.deliverOnly([B]);
}

// A is cut off while B wins the next term, then reconnected still leading;
// B's heartbeat is on its way to A.
async function newLeaderHeartbeatAtStaleA(run) {
  run.driver.isolate(A);
  assert.equal(await run.elect(B), true, 'setup: B leads the next term');
  run.driver.heal(A);
  await run.tickUntilHeartbeat(B, A);
}

async function higherTermVoteAtA(run) {
  await run.act(() => run.driver.port(B).campaign());
}

// Only the higher-id follower acknowledges the last write.
async function unequalProgressAtA(run) {
  const [, ahead] = byRaftId(run.driver, [B, C]);
  await run.act(() => run.driver.port(A).propose({acknowledgedBy: ahead}));
  await run.deliverOnly([ahead]);
}

// B's acknowledgement commits C's removal (C is cut off).
async function removalOfCAtA(run) {
  run.driver.isolate(C);
  await run.act(() => run.driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C}));
  await run.deliverOnly([B]);
}

// B's and C's acknowledgements commit A's own removal.
async function selfRemovalAtA(run) {
  await run.act(() => run.driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A}));
  await run.deliverOnly([B, C]);
}

// B asks for leadership; its MsgTransferLeader is forwarded to A.
async function forwardedTransferToBAtA(run) {
  await run.act(() =>
    run.driver.port(B).transferLeadership(namedSuccessor(B)));
}

// A runs a transfer to a cut-off C.
async function leaderInTransfer(run) {
  run.driver.isolate(C);
  await run.propose(A, {lag: C});
  await run.act(() =>
    run.driver.port(A).transferLeadership(namedSuccessor(C)));
}

// A's own removal is committed and applied; raft-rs keeps it leading.
async function leaderSelfRemoved(run) {
  await run.act(() => run.driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A}));
  await run.deliver();
  assert.equal(run.leads(A), true, 'setup: the removed leader leads');
}

// B stands for election and every vote request is lost.
async function candidateB(run) {
  await run.act(() => run.driver.port(B).campaign());
  run.driver.loseInTransit(A);
  run.driver.loseInTransit(C);
  assert.equal(run.inputsOf(B).role, RAFT_ROLE.CANDIDATE,
    'setup: B is a candidate');
}

// C falls behind and its progress stalls; after reconnecting, C's
// heartbeat response is on its way to A.
async function laggingHeartbeatResponseAtA(run) {
  run.driver.isolate(C);
  await run.propose(A, {lag: C});
  run.driver.heal(C);
  await run.tickUntilHeartbeat(A, C);
  await run.deliverOnly([C]);
}

function assertNoProgressAt({driver}, requester, identity) {
  const raftId = driver.raftIdAt(requester, identity);
  const status = driver.status(requester);
  assert.equal([...status.confState.voters, ...status.confState.learners]
    .map(String).includes(String(raftId)), false,
  `setup: ${identity} has no progress at ${requester}`);
}

// --------------------------------------------------------------- the events

// One event per decision input, all pending at A (the decision axis).
const INPUT_EVENTS = Object.freeze([
  {input: 'role, term, leader (higher-term vote request)',
    type: 'MsgRequestVote', build: higherTermVoteAtA},
  {input: 'role, term, leader (new leader\'s append at a stale leader)',
    type: 'MsgAppend', build: newLeaderAppendAtStaleA},
  {input: 'role, term, leader (new leader\'s heartbeat at a stale leader)',
    type: 'MsgHeartbeat', build: newLeaderHeartbeatAtStaleA},
  {input: 'progress (unequal acknowledgements)',
    type: 'MsgAppendResponse', build: unequalProgressAtA},
  {input: 'configuration (a removal committed by the acknowledgement)',
    type: 'MsgAppendResponse', build: removalOfCAtA},
  {input: 'transfer in progress (a forwarded MsgTransferLeader)',
    type: 'MsgTransferLeader', build: forwardedTransferToBAtA,
    moves: MOVES.OUTBOUND},
]);

// Receiver predicates per message type (the event axis). Local-only types
// and response types from a sender without progress are generated.
const CATALOGUE = Object.freeze({
  MsgPropose: [
    {predicate: 'leader', requester: A, decisions: ['D1', 'D3'],
      moves: MOVES.OUTBOUND,
      build: (run) => run.act(() =>
        run.driver.port(B).propose({forwardedBy: B}))},
    {predicate: 'leader with a transfer in progress', requester: A,
      decisions: ['D3'], moves: MOVES.REFUSED,
      build: async (run) => {
        await leaderInTransfer(run);
        await run.act(() => run.driver.port(B).propose({forwardedBy: B}));
      }},
    {predicate: 'leader removed from its configuration', requester: A,
      decisions: ['D3'], moves: MOVES.REFUSED,
      build: async (run) => {
        await leaderSelfRemoved(run);
        await run.act(() => run.driver.port(B).propose({forwardedBy: B}));
      }},
    {predicate: 'candidate', requester: B, decisions: ['D3'],
      moves: MOVES.REFUSED, timeoutDriven: true,
      build: async (run) => {
        await candidateB(run);
        craft(run, {to: B, from: C, msgType: 2,
          term: 0, entries: [proposalEntry({forwardedBy: C})]});
      }},
    {predicate: 'follower with a leader', requester: B, decisions: ['D1'],
      moves: MOVES.OUTBOUND,
      build: (run) => craft(run, {to: B, from: C, msgType: 2,
        term: 0, entries: [proposalEntry({forwardedBy: C})]})},
    {predicate: 'follower without a leader', requester: B, form: false,
      decisions: ['D3'], moves: MOVES.REFUSED, timeoutDriven: true,
      build: (run) => craft(run, {to: B, from: A, msgType: 2,
        term: 0, entries: [proposalEntry({forwardedBy: A})]})},
  ],
  MsgAppend: [
    {predicate: 'stale leader, higher term', requester: A,
      decisions: ['D1', 'D2'], build: newLeaderAppendAtStaleA},
  ],
  MsgAppendResponse: [
    {predicate: 'sender with progress, unequal progress', requester: A,
      decisions: ['D2'], build: unequalProgressAtA},
    {predicate: 'sender with progress, commits the target\'s removal',
      requester: A, decisions: ['D1'], build: removalOfCAtA},
    {predicate: 'sender with progress, commits the leader\'s own removal',
      requester: A, decisions: ['D3', 'D4'], build: selfRemovalAtA},
  ],
  MsgRequestVote: [
    {predicate: 'leader, higher term', requester: A, decisions: ['D1', 'D2'],
      build: higherTermVoteAtA},
  ],
  MsgRequestVoteResponse: [
    {predicate: 'sender with progress, candidate collects the votes',
      requester: B, decisions: ['D1'], target: B,
      build: async (run) => {
        await run.act(() => run.driver.port(B).campaign());
        await run.deliverOnly([A, C]);
      }},
  ],
  MsgHeartbeat: [
    {predicate: 'stale leader, higher term', requester: A,
      decisions: ['D1', 'D2'], build: newLeaderHeartbeatAtStaleA},
  ],
  MsgHeartbeatResponse: [
    {predicate: 'sender with progress, lagging follower', requester: A,
      decisions: ['D1'], moves: MOVES.OUTBOUND,
      build: laggingHeartbeatResponseAtA},
  ],
  MsgTransferLeader: [
    {predicate: 'leader, a transfer to another voter', requester: A,
      decisions: ['D1', 'D1:same', 'D2', 'D3', 'D4'], moves: MOVES.OUTBOUND,
      sameTarget: B, build: forwardedTransferToBAtA},
  ],
  MsgTimeoutNow: [
    {predicate: 'the transferee, a follower', requester: C,
      decisions: ['D1'], target: B,
      build: (run) => run.act(() =>
        run.driver.port(A).transferLeadership(namedSuccessor(C)))},
  ],
  MsgRequestPreVote: [
    {predicate: 'leader, higher term (crafted; pre-vote is off)',
      requester: A, decisions: ['D1'], moves: MOVES.OUTBOUND,
      build: (run) => craft(run, {to: A, from: B, msgType: 17,
        term: run.driver.status(A).term + 1})},
  ],
  MsgRequestPreVoteResponse: [
    {predicate: 'sender with progress, higher-term rejection (crafted)',
      requester: A, decisions: ['D1'],
      build: (run) => craft(run, {to: A, from: B, msgType: 18,
        term: run.driver.status(A).term + 1, reject: true})},
  ],
  MsgReadIndex: [
    {predicate: 'leader (crafted; the port never reads by index)',
      requester: A, decisions: ['D1'], moves: MOVES.OUTBOUND,
      build: (run) => craft(run, {to: A, from: B, msgType: 15,
        entries: [proposalEntry({readIndexContext: B})]})},
  ],
});

// Types with no cell, and why (the census requires one or the other).
const NO_CELL = Object.freeze({
  MsgSnapshot: 'no production sender: a leader sends it only for compacted ' +
    'entries, and the binding exports no compaction; a crafted snapshot ' +
    'fabricates a log prefix and a configuration no peer holds',
  MsgReadIndexResp: 'no production sender (the port never reads by index); ' +
    'a crafted response fabricates a commit index (raft.rs step_follower ' +
    'MsgReadIndexResp calls maybe_commit on the message\'s own index)',
});

// Receiver predicates under which a type moves nothing, so a cell there
// would be vacuous (recorded, raft.rs 0.7).
const NO_MOVE = Object.freeze({
  'MsgTimeoutNow at a leader': 'step_leader ignores it (raft.rs 2298-2304)',
  'MsgTransferLeader at a candidate': 'step_candidate ignores it',
  'MsgTransferLeader at a follower with a leader': 'unreachable from a ' +
    'raft-rs peer: a peer sends it with its term set (raft.rs send), a ' +
    'lower term is ignored and a higher one resets the leader, so it only ' +
    'reaches a follower with a leader when crafted; there step_follower ' +
    're-forwards it and send() is fatal on a set term (raft.rs 647-653): ' +
    'CORE_FATAL, exclusion 4',
});

// --------------------------------------------------------------- the pairs

// Which event types move which receiver predicate, and whose step or
// announcement reads it (challenger A, CA8). Pairs are generated as their
// product per predicate.
const PREDICATES = Object.freeze({
  'transfer in progress': {
    movers: ['MsgTransferLeader'], readers: ['MsgPropose']},
  'sender has progress': {
    movers: ['MsgAppendResponse'],
    readers: ['MsgAppendResponse', 'MsgHeartbeatResponse']},
  'follower without a leader': {
    movers: ['MsgRequestVote'], readers: ['MsgPropose', 'MsgTransferLeader']},
  'candidate': {
    movers: ['MsgTimeoutNow'], readers: ['MsgPropose', 'MsgTransferLeader']},
  'leader identity (announcement)': {
    movers: ['MsgRequestVote'], readers: ['MsgAppend', 'MsgHeartbeat']},
  'transferee caught up': {
    movers: ['MsgTransferLeader'], readers: ['MsgAppendResponse']},
});
// The challengers' named pairs; P4 (a pending conf change nulls a local
// one) is CA3, out of the claim.
const KNOWN_PAIRS = Object.freeze({
  P1: 'MsgTransferLeader>MsgPropose@transfer in progress',
  P2: 'MsgAppendResponse>MsgAppendResponse@sender has progress',
  P3: 'MsgRequestVote>MsgAppend@leader identity (announcement)',
  P5: 'MsgTransferLeader>MsgAppendResponse@transferee caught up',
  P6: 'MsgRequestVote>MsgPropose@follower without a leader',
  P7: 'MsgTimeoutNow>MsgPropose@candidate',
});

const PAIR_BUILDS = Object.freeze({
  'MsgTransferLeader>MsgPropose@transfer in progress': {
    requester: A, decision: 'D3', moves: MOVES.REFUSED,
    build: async (run) => {
      await forwardedTransferToBAtA(run);
      await run.act(() => run.driver.port(C).propose({forwardedBy: C}));
    }},
  'MsgAppendResponse>MsgAppendResponse@sender has progress': {
    requester: A, decision: 'D1', target: B, moves: MOVES.REFUSED,
    build: async (run) => {
      await run.act(() => run.driver.port(A).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C}));
      await run.deliverOnly([B, C]);
    }},
  'MsgAppendResponse>MsgHeartbeatResponse@sender has progress': {
    requester: A, decision: 'D3', moves: MOVES.REFUSED,
    build: async (run) => {
      await run.act(() => run.driver.port(A).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C}));
      await run.deliverOnly([B]);
      await run.tickUntilHeartbeat(A, C);
      await run.deliverOnly([C]);
    }},
  'MsgRequestVote>MsgPropose@follower without a leader': {
    requester: A, decision: 'D3', moves: MOVES.REFUSED,
    build: async (run) => {
      await run.act(() => run.driver.port(B).campaign());
      await run.act(() => run.driver.port(C).propose({forwardedBy: C}));
    }},
  'MsgRequestVote>MsgTransferLeader@follower without a leader': {
    requester: A, decision: 'D1',
    build: async (run) => {
      await run.act(() => run.driver.port(B).campaign());
      await run.act(() =>
        run.driver.port(C).transferLeadership(namedSuccessor(C)));
    }},
  'MsgTimeoutNow>MsgPropose@candidate': {
    requester: C, decision: 'D3', moves: MOVES.REFUSED,
    build: async (run) => {
      await run.act(() =>
        run.driver.port(A).transferLeadership(namedSuccessor(C)));
      craft(run, {to: C, from: B, msgType: 2,
        term: 0, entries: [proposalEntry({forwardedBy: B})]});
    }},
  'MsgTimeoutNow>MsgTransferLeader@candidate': {
    requester: C, decision: 'D1', target: B,
    build: async (run) => {
      await run.act(() =>
        run.driver.port(A).transferLeadership(namedSuccessor(C)));
      craft(run, {to: C, from: B, msgType: 13});
    }},
  'MsgRequestVote>MsgAppend@leader identity (announcement)': {
    requester: A, decision: 'D1', build: async (run) => {
      await run.act(() => run.driver.port(B).campaign());
      await run.deliverOnly([C]);
      await run.deliverOnly([B]);
    }},
  'MsgRequestVote>MsgHeartbeat@leader identity (announcement)': {
    requester: A, decision: 'D1', build: async (run) => {
      await run.act(() => run.driver.port(B).campaign());
      await run.deliverOnly([C]);
      await run.deliverOnly([B]);
      await run.tickUntilHeartbeat(B, A);
    }},
  'MsgTransferLeader>MsgAppendResponse@transferee caught up': {
    requester: A, decision: 'D3', build: async (run) => {
      run.driver.isolate(B);
      await run.propose(A, {lag: B});
      run.driver.heal(B);
      await run.act(() =>
        run.driver.port(B).transferLeadership(namedSuccessor(B)));
      await run.act(() => run.driver.port(A).propose({catchUp: B}));
      await run.deliverOnly([B, C]);
    }},
});

function generatedPairs() {
  return Object.entries(PREDICATES).flatMap(([predicate, {movers, readers}]) =>
    movers.flatMap((mover) => readers.map((reader) =>
      `${mover}>${reader}@${predicate}`)));
}

// ------------------------------------------------------------ cell makers

function requestOf(decision, requester, entry) {
  if (decision === 'D1:same') {
    return DECISIONS.D1.request(requester, entry.sameTarget);
  }
  return DECISIONS[decision].request(requester, entry.target ?? C);
}

function withD(build) {
  return async (run) => {
    run.driver.reserveEverywhere(D);
    await build(run);
  };
}

function cell({id, family, types, predicate, decision, requester, build,
  axes = {}, moves = MOVES.EITHER, timeoutDriven = false, form = true,
  entry = {}, ...extra}) {
  return {
    id, family, types, predicate, decision, requester,
    replicaIds: REPLICAS, axes, moves, timeoutDriven, form,
    settle: timeoutDriven,
    build: form ? withD(build) : build,
    request: requestOf(decision, requester, entry),
    ...extra,
  };
}

function eventCells(enumerations) {
  const cells = [];
  for (const [name, number] of enumerations.types) {
    if (enumerations.local.has(name)) {
      for (const decision of ['D1', 'D3']) {
        cells.push(cell({id: `event-${name}-local-${decision}`,
          family: 'event', types: [name], predicate: 'local-only',
          decision, requester: A, moves: MOVES.REFUSED,
          build: (run) => craft(run, {to: A, from: B, msgType: number})}));
      }
      continue;
    }
    if (enumerations.response.has(name)) {
      for (const decision of ['D1', 'D3']) {
        cells.push(cell({id: `event-${name}-no-progress-${decision}`,
          family: 'event', types: [name],
          predicate: 'sender without progress', decision, requester: A,
          moves: MOVES.REFUSED,
          build: (run) => {
            assertNoProgressAt(run, A, D);
            craft(run, {to: A, from: D, msgType: number,
              fromRaftId: run.driver.raftIdAt(A, D)});
          }}));
      }
    }
    for (const entry of CATALOGUE[name] || []) {
      for (const decision of entry.decisions) {
        cells.push(cell({id: `event-${name}-${entry.predicate}-${decision}`,
          family: 'event', types: [name], predicate: entry.predicate,
          decision, requester: entry.requester, build: entry.build,
          moves: entry.moves, timeoutDriven: entry.timeoutDriven,
          form: entry.form, entry}));
      }
    }
  }
  return cells;
}

const DECISION_MODES = Object.freeze([
  {label: 'sync', axes: {}},
  {label: 'async', axes: {send: SEND_MODE.ASYNC},
    decisions: ['D1', 'D2', 'D3']},
  {label: 'per-index', axes: {timing: TIMING_MODE.PER_INDEX},
    decisions: ['D1', 'D2', 'D3']},
  {label: 'no-reentry', axes: {reentry: false}, decisions: ['D1']},
]);

function decisionCells() {
  return DECISION_MODES.flatMap(({label, axes, decisions}) =>
    Object.keys(DECISIONS)
      .filter((decision) => !decisions || decisions.includes(decision))
      .flatMap((decision) => INPUT_EVENTS.map((event, index) => cell({
        id: `decision-${decision}-${index}-${label}`, family: 'decision',
        types: [event.type], predicate: event.input, decision,
        requester: A, build: event.build, axes, moves: event.moves}))));
}

function pairCells() {
  return generatedPairs().map((key) => {
    const pair = PAIR_BUILDS[key];
    const [types] = key.split('@');
    return cell({id: `pair-${key}`, family: 'pair',
      types: types.split('>'), predicate: key.split('@')[1],
      decision: pair.decision, requester: pair.requester, build: pair.build,
      moves: pair.moves, entry: pair});
  });
}

// An uncommitted configuration entry whose acknowledgements are pending when
// a named transfer is asked for.
function uncommittedConfCells() {
  return [cell({id: 'window-D1-uncommitted-conf-entry', family: 'window',
    types: ['MsgAppendResponse'], predicate: 'acknowledgements of an ' +
      'uncommitted configuration entry', decision: 'D1', requester: A,
    build: async (run) => {
      await run.act(() => run.driver.port(A).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D}));
      await run.deliverOnly([B, C]);
    }})];
}

// Admission closed by a real BEGIN on the requester's database when the
// request is made (the reference processed the envelopes before BEGIN).
function admissionCells() {
  return Object.keys(DECISIONS).map((decision) => cell({
    id: `admission-closed-${decision}`, family: 'admission',
    types: ['MsgRequestVote'], predicate: 'user transaction open',
    decision, requester: A, build: higherTermVoteAtA,
    admissionClosed: true}));
}

// An envelope delivered while the request's turn awaits a send (held by the
// test) must be processed before the decision.
function midTurnCells() {
  return ['D1', 'D2', 'D3'].map((decision) => cell({
    id: `mid-turn-${decision}`, family: 'mid-turn',
    types: ['MsgAppendResponse'], arrivingMidTurn: ['MsgRequestVote'],
    predicate: 'a higher-term vote request arrives during an awaited send',
    decision, requester: A, hold: true,
    build: async (run) => {
      await run.act(() =>
        run.driver.port(A).propose({acknowledged: 'mid-turn'}));
      await run.deliverOnly([B, C]);
    },
    midTurn: ({driver}) => {
      driver.port(B).campaign();
    }}));
}

function allCells(enumerations) {
  return [
    ...eventCells(enumerations),
    ...decisionCells(),
    ...pairCells(),
    ...uncommittedConfCells(),
    ...admissionCells(),
    ...midTurnCells(),
  ];
}

export {
  CATALOGUE,
  KNOWN_PAIRS,
  MOVES,
  NO_CELL,
  NO_MOVE,
  PAIR_BUILDS,
  allCells,
  generatedPairs,
};
