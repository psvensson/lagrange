// The write kernel's leadership-tenure fence (record
// write-kernel-tenure-fence-record.md, lead brief 2026-11-21). A write is
// handed to consensus only under the leadership tenure it was submitted under
// (service.leadershipTenure, replica-leadership-state.js, compared by
// identity). A tenure renewed WITHOUT a role edge (TERM_CHANGE while the
// replica keeps leading) is a leadership lost and regained between two
// announcements: every write not yet handed to consensus is then in the state
// a role edge releases (partition-service-raft-lifecycle-wiring.js
// releasePendingWrites) and must be answered the same way, the typed
// LEADERSHIP_LOST release (NOT_LEADER, nothing proposed), whoever wrote it.
// A write already handed to consensus is inherited work: it completes under
// its own entryId.
//
// Substrate: a real PartitionService leader (participant fixture) on the
// controllable consensus port; the kernel, its proposal queue and its
// reserved-write parking are production. The renewal is the port's TERM_CHANGE
// with no role event, as raft-rs-runtime-owner.js announce emits it. The
// port's typed deferral is RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS,
// answered once. Every hand-over to the port is recorded with the core's term
// at that moment. The replica's clock counts the timers the kernel arms (its
// commit deadlines and its deferral retry sleeps) that have neither fired nor
// been cleared.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-write-kernel.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RealTimeSource} from '../../src/time/time-source.js';
import {
  INSERT_SQL, OTHER_ROW, ROW, ROW_2, V3, applyCommitted, clearFixtureSingletons,
  decisionCommandOf, generationOf, identityOf, onFixtureLeader, operationOf, pick,
  prepareCommandOf, resetFixtureSingletons, rowCount, settleTicks, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
const RELEASED_NOT_LEADER = Object.freeze({success: false, failureCode: NOT_LEADER});
const DEFERRAL = Object.freeze({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
  recoveryRequired: false, reason: RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS});
// Beyond the kernel's deferral retry delays (10 ms doubling to 100 ms) and
// inside its 2 s deferral budget: a retry has run by then if it runs.
const RETRY_WINDOW_MS = 1_500;
const WAIT_MS = 5_000;
const POLL_MS = 5;
const TIMER_STACK_FRAMES = 32;
// The kernel's own timers: the commit deadline of a pending write
// (partition-service-cdc-stream-base.js waitForCommittedWrite) and the
// deferral retry sleep (partition-service-raft-write-commit.js).
const KERNEL_TIMER_FRAME = /waitForCommittedWrite|partition-service-raft-write-commit\.js/u;

async function waitUntil(predicate, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return predicate();
}

function creationStack() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = TIMER_STACK_FRAMES;
  const {stack} = new Error();
  Error.stackTraceLimit = limit;
  return stack;
}

// The replica's own clock (a real one), keeping the kernel-armed timers that
// are still live: created, not fired, not cleared.
function kernelTimerClock() {
  const clock = new RealTimeSource();
  const live = new Set();
  const timeSource = {
    now: () => clock.now(),
    setTimeout(fn, ms, ...args) {
      const kernel = KERNEL_TIMER_FRAME.test(creationStack());
      const handle = clock.setTimeout((...fired) => {
        live.delete(handle);
        fn(...fired);
      }, ms, ...args);
      if (kernel) live.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      live.delete(handle);
      clock.clearTimeout(handle);
    },
    setInterval: (fn, ms, ...args) => clock.setInterval(fn, ms, ...args),
    clearInterval: (handle) => clock.clearInterval(handle),
    charge: () => undefined,
  };
  return {timeSource, live};
}

function withKernelLeader(measure) {
  const clock = kernelTimerClock();
  return onFixtureLeader((leader) => measure({leader, clock}),
    {timeSource: clock.timeSource});
}

const handOversOf = (handed, entryId) => handed.filter((one) => one.entryId === entryId);

// Every hand-over to the port, with the core's term when it was handed over;
// the entries named in deferOnce are answered once with the port's typed
// transfer deferral (nothing entered consensus). firstHandOver(entryId)
// settles in the turn the port receives that entry (or after WAIT_MS), so a
// witness acts before the kernel's retry timer can fire.
function recordHandOvers(leader, {deferOnce = []} = {}) {
  const port = leader.controllablePort;
  const deferring = new Set(deferOnce);
  const handed = [];
  const waiters = new Map();
  port.setProposeHandler(async (entry) => {
    const deferred = deferring.delete(entry.entryId);
    handed.push({entryId: entry.entryId, portTerm: port.term, deferred, entry: {...entry}});
    waiters.get(entry.entryId)?.resolve(true);
    return deferred ? DEFERRAL : null;
  });
  const firstHandOver = (entryId) => {
    if (handOversOf(handed, entryId).length > 0) return Promise.resolve(true);
    const waiter = Promise.withResolvers();
    waiters.set(entryId, waiter);
    const timer = setTimeout(() => waiter.resolve(false), WAIT_MS);
    return waiter.promise.finally(() => clearTimeout(timer));
  };
  return {handed, firstHandOver};
}
const enteredUnder = (handed, entryId, term) => handOversOf(handed, entryId)
  .filter((one) => !one.deferred && one.portTerm === term).length;

// A new term observed while the replica keeps leading: the port announces
// TERM_CHANGE and no role event.
function renewWithoutRoleEdge(leader) {
  const port = leader.controllablePort;
  const before = leader.leadershipTenure;
  assert.notEqual(before, null, 'premise: the replica holds a leadership tenure');
  port.setTerm(port.term + 1);
  port.emitEvent(RAFT_EVENT.TERM_CHANGE, port.term);
  assert.equal(leader.isLeader, true, 'premise: no role edge, the replica still leads');
  assert.notEqual(leader.leadershipTenure, before, 'premise: the tenure was renewed');
  return port.term;
}

// What remains of a released write: pending writes in the proposal queue, its
// pending outcome, and live kernel timers.
function remainderOf(leader, clock, entryId) {
  return {queued: leader.proposalQueue.size,
    pendingOutcome: leader.getPendingCommittedWriteOutcome(entryId) !== null,
    kernelTimers: clock.live.size};
}
const NOTHING_REMAINS = Object.freeze({queued: 0, pendingOutcome: false, kernelTimers: 0});

test('kernel tenure fence (e, f): an ordinary write the port deferred is released NOT_LEADER ' +
  'and never proposed under a tenure renewed without a role edge; nothing of it stays ' +
  'queued or timed', () => withKernelLeader(async ({leader, clock}) => {
  const entryId = 'kernel-fence-deferred';
  const {handed, firstHandOver} = recordHandOvers(leader, {deferOnce: [entryId]});
  const write = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  assert.equal(await firstHandOver(entryId), true, 'premise: the port received the write');
  assert.deepEqual(handOversOf(handed, entryId).map(({deferred}) => deferred), [true],
    'premise: the port deferred it once, and the kernel has not proposed it again yet');
  const submittedTerm = handOversOf(handed, entryId)[0].portTerm;
  const renewedTerm = renewWithoutRoleEdge(leader);
  await waitUntil(() => write.settled || handOversOf(handed, entryId).length > 1,
    RETRY_WINDOW_MS);
  await settleTicks();
  const facts = {enteredUnderRenewedTerm: enteredUnder(handed, entryId, renewedTerm),
    answer: write.settled ? pick(write.value, ['success', 'failureCode']) : 'pending',
    ...remainderOf(leader, clock, entryId)};
  assert.deepEqual(facts, {enteredUnderRenewedTerm: 0, answer: RELEASED_NOT_LEADER,
    ...NOTHING_REMAINS},
  `deferred at term ${submittedTerm}, renewed to ${renewedTerm}: released as on leadership ` +
    `loss, nothing proposed, nothing left; ${JSON.stringify({handed: handed.map(
      ({entryId: id, portTerm, deferred}) => ({id, portTerm, deferred})),
    consensus: write.value?.consensus ?? null})}`);
}));

test('kernel tenure fence (b, f): a write parked on a reserved partition is released NOT_LEADER ' +
  'at its readmit, never proposed, when the tenure was renewed without a role edge; a later ' +
  'readmit proposes nothing of it', () => withKernelLeader(async ({leader, clock}) => {
  const entryId = 'kernel-fence-parked';
  const {handed} = recordHandOvers(leader);
  const holder = identityOf('kernel-fence-holder');
  const prepare = prepareCommandOf(holder, [operationOf(ROW)], generationOf(leader));
  assert.equal(applyCommitted(leader, prepare), null,
    'premise: the holder PREPARE applied (the partition is reserved)');
  const write = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await settleTicks();
  assert.deepEqual({handed: handOversOf(handed, entryId).length, settled: write.settled},
    {handed: 0, settled: false}, 'premise: the write is parked, not proposed');
  const renewedTerm = renewWithoutRoleEdge(leader);
  assert.equal(applyCommitted(leader, decisionCommandOf(holder, V3.DECISION.COMMIT,
    prepare.preparedDigest)), null, 'premise: the decision applied (its readmit ran)');
  await waitUntil(() => write.settled || handOversOf(handed, entryId).length > 0,
    RETRY_WINDOW_MS);
  await settleTicks();
  const facts = {enteredUnderRenewedTerm: enteredUnder(handed, entryId, renewedTerm),
    answer: write.settled ? pick(write.value, ['success', 'failureCode']) : 'pending',
    ...remainderOf(leader, clock, entryId)};
  // A later reservation and its decision: a parked hand-off left behind would
  // be proposed by this readmit.
  const later = identityOf('kernel-fence-later-holder');
  const laterPrepare = prepareCommandOf(later, [operationOf(ROW_2)], generationOf(leader));
  facts.laterReservation = applyCommitted(leader, laterPrepare);
  facts.laterDecision = applyCommitted(leader, decisionCommandOf(later, V3.DECISION.COMMIT,
    laterPrepare.preparedDigest));
  await settleTicks();
  facts.handOversAfterLaterReadmit = handOversOf(handed, entryId).length;
  assert.deepEqual(facts, {enteredUnderRenewedTerm: 0, answer: RELEASED_NOT_LEADER,
    ...NOTHING_REMAINS, laterReservation: null, laterDecision: null,
    handOversAfterLaterReadmit: 0},
  `parked under the previous tenure, readmitted under term ${renewedTerm}: released as on ` +
    `leadership loss, nothing proposed, nothing left; ${JSON.stringify({handed: handed.map(
      ({entryId: id, portTerm}) => ({id, portTerm})),
    consensus: write.value?.consensus ?? null})}`);
}));

test('kernel tenure fence (d): a write handed to consensus before the renewal completes under ' +
  'its own entryId and is answered committed (inherited work is kept)',
() => withKernelLeader(async ({leader}) => {
  const entryId = 'kernel-fence-inherited';
  const {handed, firstHandOver} = recordHandOvers(leader);
  const write = track(leader.executeQuery(INSERT_SQL, [ROW_2.id, ROW_2.value], {entryId}));
  assert.equal(await firstHandOver(entryId), true,
    'premise: the write was handed to consensus');
  const [handover] = handOversOf(handed, entryId);
  const renewedTerm = renewWithoutRoleEdge(leader);
  const apply = applyCommitted(leader, handover.entry);
  await waitUntil(() => write.settled, WAIT_MS);
  await settleTicks();
  const facts = {handedBeforeRenewal: handover.portTerm !== renewedTerm, apply,
    answer: write.settled ? pick(write.value, ['success']) : 'pending',
    rows: rowCount(leader, ROW_2.id), queued: leader.proposalQueue.size,
    handOvers: handOversOf(handed, entryId).length};
  assert.deepEqual(facts, {handedBeforeRenewal: true, apply: null, answer: {success: true},
    rows: 1, queued: 0, handOvers: 1},
  `handed over at term ${handover.portTerm}, committed after the renewal to ${renewedTerm}; ` +
    JSON.stringify({answer: write.value ?? null}));
}));
