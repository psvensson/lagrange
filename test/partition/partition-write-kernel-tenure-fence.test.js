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
import {partitionWriteLeadershipRefusalOf} from
  '../../src/partition/partition-service-raft-write-commit.js';
import {PARTITION_SERVICE_DEFAULT, PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from '../../src/partition/proposal-queue-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';
import {
  INSERT_SQL, OTHER_ROW, REPLICAS, ROW, ROW_2, V3, applyCommitted, clearFixtureSingletons,
  decisionCommandOf, generationOf, identityOf, onFixtureLeader, operationOf, pick,
  holdKernelRetries, prepareCommandOf, resetFixtureSingletons, resumeFixtureParticipantAdmission,
  rowCount, settleTicks, shutdownAll, startReplica, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
const RELEASED_NOT_LEADER = Object.freeze({success: false, failureCode: NOT_LEADER});
const CUTOVER_PAUSED = PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED;
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

// The replica's own clock (a real one unless the witness gives a virtual one),
// keeping the kernel-armed timers that are still live: created, not fired, not
// cleared.
function kernelTimerClock(clock = new RealTimeSource()) {
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

// The write kernel's leadership read of an ordinary write
// (partitionWriteLeadershipRefusalOf, called by startAdmittedPartitionWrite
// after the cutover-pause check), read from the synchronous call stack.
const KERNEL_WRITE_LEADERSHIP_READ =
  /partitionWriteLeadershipRefusalOf[\s\S]*startAdmittedPartitionWrite/u;

// A status read that runs a consensus turn announcing a renewed term
// (raft-rs-runtime-owner.js readStatusNow drains inbound; announce emits
// TERM_CHANGE, no role event): armed once, for the kernel's leadership read of
// an ordinary write, and run before the status is answered.
function renewInsideKernelLeadershipRead(leader) {
  const port = leader.raft;
  const renewal = {term: null, before: null};
  leader.raft = createRaftOperationPort({...port, readStatus: () => {
    if (renewal.term === null && KERNEL_WRITE_LEADERSHIP_READ.test(creationStack())) {
      renewal.before = leader.leadershipTenure;
      leader.controllablePort.setTerm(leader.controllablePort.term + 1);
      leader.controllablePort.emitEvent(RAFT_EVENT.TERM_CHANGE, leader.controllablePort.term);
      renewal.term = leader.controllablePort.term;
    }
    return port.readStatus();
  }});
  return renewal;
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

// The status read between a writer's decision and the registration (record
// section 8): the kernel's leadership read runs a consensus turn that renews
// the tenure. An ordinary write checks the cutover pause before that read, so
// nothing but the kernel stands between the renewal and the registration.
test('kernel tenure fence (g): an ordinary write is not registered under a tenure renewed ' +
  'inside the kernel\'s own leadership read (refused NOT_LEADER, nothing proposed)',
() => withKernelLeader(async ({leader, clock}) => {
  const entryId = 'kernel-fence-read-renewal';
  const {handed} = recordHandOvers(leader);
  const renewal = renewInsideKernelLeadershipRead(leader);
  const write = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await waitUntil(() => write.settled || handOversOf(handed, entryId).length > 0, WAIT_MS);
  await settleTicks();
  assert.notEqual(renewal.term, null,
    'premise: the renewal ran inside the kernel\'s leadership read of the write');
  assert.notEqual(renewal.before, null, 'premise: the replica held a leadership tenure');
  assert.notEqual(leader.leadershipTenure, renewal.before, 'premise: the tenure was renewed');
  assert.equal(leader.isLeader, true, 'premise: no role edge, the replica still leads');
  const facts = {enteredUnderRenewedTerm: enteredUnder(handed, entryId, renewal.term),
    answer: write.settled ? pick(write.value, ['success', 'failureCode']) : 'pending',
    ...remainderOf(leader, clock, entryId)};
  assert.deepEqual(facts, {enteredUnderRenewedTerm: 0, answer: RELEASED_NOT_LEADER,
    ...NOTHING_REMAINS},
  `renewed to term ${renewal.term} inside the kernel's leadership read: refused, nothing ` +
    `registered or proposed; ${JSON.stringify({handed: handed.map(
      ({entryId: id, portTerm}) => ({id, portTerm})), answer: write.value ?? null})}`);
}));

// The read check's scope (lead ruling 2026-11-21, record section 14): it
// refuses also when the replica BECOMES leader inside the kernel's leadership
// read. A write submitted before a tenure existed was decided before this
// replica led; it is refused NOT_LEADER, and its owner's next submission,
// under the tenure, proceeds. Schedule: a follower replica (no tenure); the
// kernel's leadership read runs a consensus turn that makes it leader (the
// port's LEADER role event inside the read); the leadership check is asked
// twice, the second time under the tenure the first read minted.
test('kernel tenure fence (read scope): a write submitted before the replica led is refused ' +
  'NOT_LEADER when the replica becomes leader inside the kernel\'s leadership read; asked ' +
  'again under that tenure, it proceeds', async () => {
  const replica = await startReplica(REPLICAS[1]);
  let failure = null;
  try {
    assert.equal(replica.leadershipTenure, null, 'premise: the replica holds no tenure');
    const port = replica.raft;
    const promotion = {tenure: null};
    replica.raft = createRaftOperationPort({...port, readStatus: () => {
      if (promotion.tenure === null &&
          /partitionWriteLeadershipRefusalOf/u.test(creationStack())) {
        replica.controllablePort.setRole(RAFT_ROLE.LEADER);
        promotion.tenure = replica.leadershipTenure;
      }
      return port.readStatus();
    }});
    const submittedBeforeTenure = partitionWriteLeadershipRefusalOf(replica);
    const underTheTenure = partitionWriteLeadershipRefusalOf(replica);
    assert.deepEqual({promotedInsideRead: promotion.tenure !== null,
      tenureKept: replica.leadershipTenure === promotion.tenure,
      submittedBeforeTenure: pick(submittedBeforeTenure, ['success', 'failureCode']),
      underTheTenure},
    {promotedInsideRead: true, tenureKept: true, submittedBeforeTenure: RELEASED_NOT_LEADER,
      underTheTenure: null},
    'refused once while the tenure was minted inside the read, then accepted under it');
  } catch (error) {
    failure = error;
  }
  try {
    await shutdownAll(replica);
  } catch (error) {
    failure ??= error;
  }
  if (failure !== null) throw failure;
});

// The join of a pending write across tenures (lead ruling 2026-11-21; record
// section 14.1). A join is a hand-over of the pending write's answer: the same
// write delivered again under the current tenure, while the write registered
// under the earlier tenure is still pending (deferred, its kernel retry held),
// must not join it: the old write is released at the join (its caller answered
// LEADERSHIP_LOST once) and the new delivery gets its own answer. In this
// composition that answer is the participant cutover pause (a renewal raises
// it, and the release cannot resume while any write is pending,
// partition-participant-release-contract.js isReleaseDrained); once the old
// write is gone the release resumes and the next delivery is proposed in its
// own turn.
test('kernel tenure fence (join): a write delivered again under the current tenure does not ' +
  'join the pending write of an earlier tenure, which is released once; nothing is inherited',
() => withKernelLeader(async ({leader, clock}) => {
  const entryId = 'kernel-fence-rejoined';
  const {handed, firstHandOver} = recordHandOvers(leader, {deferOnce: [entryId]});
  const retries = holdKernelRetries(leader);
  const first = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  assert.equal(await firstHandOver(entryId), true, 'premise: the port received W1');
  assert.equal(await waitUntil(() => retries.held.length === 1, WAIT_MS), true,
    'premise: W1 sleeps on its held kernel retry');
  const renewedTerm = renewWithoutRoleEdge(leader);
  const second = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await settleTicks();
  const secondBeforeOldRetry = second.settled ?
    pick(second.value, ['success', 'failureCode']) : 'pending';
  retries.release();
  await waitUntil(() => first.settled && second.settled, WAIT_MS);
  await settleTicks();
  await resumeFixtureParticipantAdmission(leader);
  const third = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await waitUntil(() => third.settled || enteredUnder(handed, entryId, renewedTerm) > 0, WAIT_MS);
  const thirdHandedOver = enteredUnder(handed, entryId, renewedTerm);
  const facts = {secondBeforeOldRetry,
    firstAnswer: first.settled ? pick(first.value, ['success', 'failureCode']) : 'pending',
    secondAnswer: second.settled ? pick(second.value, ['success', 'failureCode']) : 'pending',
    thirdHandedOver, heldRetries: retries.held.length};
  assert.deepEqual(facts, {secondBeforeOldRetry: {success: false, failureCode: CUTOVER_PAUSED},
    firstAnswer: RELEASED_NOT_LEADER, secondAnswer: {success: false, failureCode: CUTOVER_PAUSED},
    thirdHandedOver: 1, heldRetries: 0},
  `W1 released once at the join, W2 answered on its own, W3 handed over on its own; ${
    JSON.stringify({handed: handed.map(({entryId: id, portTerm, deferred}) =>
      ({id, portTerm, deferred})), third: third.settled ? third.value : 'pending',
    kernelTimers: clock.live.size})}`);
}));

// The release is bound to the hand-off that owns the registration (verifier
// finding 2, the schedule it names). W1 (entryId E) parks on a reserved
// partition under T1; the decision readmits it; the port defers it, so its
// hand-off H1 sleeps in the retry loop (held); a role edge releases W1 (its
// caller answered LEADERSHIP_LOST once) and the replica leads again under T2;
// the release resumes; W2 registers E again and is handed to consensus; then
// H1 wakes. It must release nothing of W2's registration: W2 commits and is
// answered committed.
test('kernel tenure fence (ownership): a stale hand-off waking in its retry loop touches nothing ' +
  'of a write registered again under the same entryId; that write commits',
() => withKernelLeader(async ({leader, clock}) => {
  const entryId = 'kernel-fence-reregistered';
  const port = leader.controllablePort;
  const {handed} = recordHandOvers(leader, {deferOnce: [entryId]});
  const retries = holdKernelRetries(leader);
  const holder = identityOf('kernel-fence-ownership-holder');
  const prepare = prepareCommandOf(holder, [operationOf(ROW)], generationOf(leader));
  assert.equal(applyCommitted(leader, prepare), null, 'premise: the partition is reserved');
  const first = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await settleTicks();
  assert.equal(applyCommitted(leader, decisionCommandOf(holder, V3.DECISION.COMMIT,
    prepare.preparedDigest)), null, 'premise: the decision applied (its readmit ran)');
  assert.equal(await waitUntil(() => retries.held.length === 1, WAIT_MS), true,
    'premise: the readmitted W1 was deferred and sleeps on its held kernel retry');
  port.setRole(RAFT_ROLE.FOLLOWER);
  await settleTicks();
  port.setTerm(port.term + 1);
  port.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  await resumeFixtureParticipantAdmission(leader);
  const second = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
    {entryId}));
  await waitUntil(() => second.settled || enteredUnder(handed, entryId, port.term) > 0,
    WAIT_MS);
  const handover = handOversOf(handed, entryId).find((one) =>
    !one.deferred && one.portTerm === port.term);
  retries.release();
  await settleTicks();
  const pendingAfterStaleWake = leader.getPendingCommittedWriteOutcome(entryId) !== null;
  const apply = handover ? applyCommitted(leader, handover.entry) : 'not handed over';
  await waitUntil(() => first.settled && second.settled, WAIT_MS);
  await settleTicks();
  const facts = {handedOver: handover !== undefined, pendingAfterStaleWake, apply,
    firstAnswer: first.settled ? pick(first.value, ['success', 'failureCode']) : 'pending',
    secondAnswer: second.settled ? pick(second.value, ['success', 'failureCode']) : 'pending',
    rows: rowCount(leader, OTHER_ROW.id), heldRetries: retries.held.length,
    ...remainderOf(leader, clock, entryId)};
  assert.deepEqual(facts, {handedOver: true, pendingAfterStaleWake: true, apply: null,
    firstAnswer: RELEASED_NOT_LEADER, secondAnswer: {success: true, failureCode: null},
    rows: 1, heldRetries: 0, ...NOTHING_REMAINS},
  `H1 woke against W2's registration and left it alone; ${JSON.stringify({
    handed: handed.map(({entryId: id, portTerm, deferred}) => ({id, portTerm, deferred})),
    second: second.value ?? null})}`);
}));

// --- The participant cutover pause across a renewal (lead brief 2026-11-21, item 2) ---
// A renewal raises the participant cutover pause (its admission proof carries
// the term), and the release resumes only on a drained census
// (partition-participant-release-contract.js isReleaseDrained: no prepared
// participant, no queued proposal, no pending outcome). How long does a write
// of the ended tenure, not yet handed to consensus, keep the partition paused?
// Measured on the virtual clock, each schedule beside the same schedule without
// that write (the control): the release is attempted at the renewal and again
// as the clock moves, until it resumes.
const VIRTUAL_START_MS = 1_000_000;
const RESERVATION_HELD_MS = 5_000;
const RESUMED = PARTICIPANT_CUTOVER_OUTCOME.RESUMED;
const RELEASE_REFUSED_TEXT = /^fixture participant release refused: /u;
const RETRY_MAX_DELAY_MS = PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_RETRY_MAX_DELAY_MS;
const CLOCK_STEP_MS = 1;

function withVirtualKernelLeader(measure) {
  const virtual = new VirtualTimeSource({startMs: VIRTUAL_START_MS});
  const clock = {...kernelTimerClock(virtual), advance: (ms) => virtual.advance(ms)};
  return onFixtureLeader((leader) => measure({leader, clock}),
    {timeSource: clock.timeSource});
}

// What the release's census reads of the replica's accepted work, read the way
// the release reads it (no join, no side effect on the kernel).
async function drainWorkOf(leader) {
  const handler = {nodeId: leader.nodeId, ownerIncarnation: 1,
    localServices: new Map([[leader.replicaId, leader]])};
  const facts = await readParticipantReleaseFacts(handler, leader);
  return facts.work ? pick(facts.work, ['participantPrepared', 'proposals', 'pendingOutcomes']) :
    facts.outcome;
}

// One attempt of the participant release on the replica: RESUMED, or the
// outcome it refused with (its census defect).
async function releaseAttempt(leader) {
  try {
    await resumeFixtureParticipantAdmission(leader);
    return RESUMED;
  } catch (error) {
    return String(error?.message ?? error).replace(RELEASE_REFUSED_TEXT, '');
  }
}

const answerOf = (write) => {
  if (write === null) return 'none';
  return write.settled ? pick(write.value, ['success', 'failureCode']) : 'pending';
};

// Reserved by a holder's PREPARE; optionally a write parked under T1; renewed
// to T2; the reservation is held RESERVATION_HELD_MS longer, then decided.
async function pauseAcrossRenewalWhileReserved({leader, clock}, {parkWrite}) {
  const entryId = 'kernel-fence-pause-parked';
  const {handed} = recordHandOvers(leader);
  const holder = identityOf('kernel-fence-pause-holder');
  const prepare = prepareCommandOf(holder, [operationOf(ROW)], generationOf(leader));
  assert.equal(applyCommitted(leader, prepare), null, 'premise: the partition is reserved');
  const write = parkWrite ? track(leader.executeQuery(INSERT_SQL,
    [OTHER_ROW.id, OTHER_ROW.value], {entryId})) : null;
  await settleTicks();
  renewWithoutRoleEdge(leader);
  const renewedAt = clock.timeSource.now();
  const atRenewal = {work: await drainWorkOf(leader), release: await releaseAttempt(leader),
    answer: answerOf(write)};
  clock.advance(RESERVATION_HELD_MS);
  await settleTicks();
  const whileReserved = {release: await releaseAttempt(leader), answer: answerOf(write)};
  const decidedAt = clock.timeSource.now();
  assert.equal(applyCommitted(leader, decisionCommandOf(holder, V3.DECISION.COMMIT,
    prepare.preparedDigest)), null, 'premise: the decision applied (its readmit ran)');
  await settleTicks();
  const atDecision = {work: await drainWorkOf(leader), release: await releaseAttempt(leader),
    answer: answerOf(write)};
  return {atRenewal, whileReserved, atDecision,
    pauseMs: clock.timeSource.now() - renewedAt,
    pauseBeyondReservationMs: clock.timeSource.now() - decidedAt,
    handedOver: handOversOf(handed, entryId).length, kernelTimers: clock.live.size};
}

test('kernel tenure fence (pause, parked): a write parked under an ended tenure never keeps ' +
  'the partition paused beyond its reservation, which pauses it alone (control: no write)',
async () => {
  const withWrite = await withVirtualKernelLeader((fixture) =>
    pauseAcrossRenewalWhileReserved(fixture, {parkWrite: true}));
  const control = await withVirtualKernelLeader((fixture) =>
    pauseAcrossRenewalWhileReserved(fixture, {parkWrite: false}));
  const drainPending = PARTICIPANT_CUTOVER_OUTCOME.DRAIN_PENDING;
  const drained = {participantPrepared: 0, proposals: 0, pendingOutcomes: 0};
  assert.deepEqual({withWrite, control}, {
    withWrite: {
      atRenewal: {work: {participantPrepared: 1, proposals: 1, pendingOutcomes: 1},
        release: drainPending, answer: 'pending'},
      whileReserved: {release: drainPending, answer: 'pending'},
      atDecision: {work: drained, release: RESUMED, answer: RELEASED_NOT_LEADER},
      pauseMs: RESERVATION_HELD_MS, pauseBeyondReservationMs: 0, handedOver: 0,
      kernelTimers: 0},
    control: {
      atRenewal: {work: {participantPrepared: 1, proposals: 0, pendingOutcomes: 0},
        release: drainPending, answer: 'none'},
      whileReserved: {release: drainPending, answer: 'none'},
      atDecision: {work: drained, release: RESUMED, answer: 'none'},
      pauseMs: RESERVATION_HELD_MS, pauseBeyondReservationMs: 0, handedOver: 0,
      kernelTimers: 0},
  }, 'the pause lasts as long as the reservation with and without the parked write, and ' +
    'ends at the decision that readmits (and releases) it, not at its ' +
    `${PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS} ms commit deadline; ` +
    JSON.stringify({withWrite, control}));
});

// Optionally a write the port defers once under T1 (its kernel retry armed on
// the virtual clock); renewed to T2; the release is attempted at the renewal
// and after every millisecond until it resumes (bounded by the retry's own
// maximum delay plus one step).
async function pauseAcrossRenewalWithDeferredWrite({leader, clock}, {deferWrite}) {
  const entryId = 'kernel-fence-pause-deferred';
  const {handed, firstHandOver} = recordHandOvers(leader, {deferOnce: [entryId]});
  const write = deferWrite ? track(leader.executeQuery(INSERT_SQL,
    [OTHER_ROW.id, OTHER_ROW.value], {entryId})) : null;
  if (deferWrite) {
    assert.equal(await firstHandOver(entryId), true, 'premise: the port received the write');
  }
  await settleTicks();
  if (deferWrite) {
    assert.equal(leader.committedWriteProposalOf(entryId), PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED,
      'premise: deferred by the port, queued on its kernel retry');
  }
  const renewedTerm = renewWithoutRoleEdge(leader);
  const renewedAt = clock.timeSource.now();
  const atRenewal = {work: await drainWorkOf(leader), release: await releaseAttempt(leader)};
  let release = atRenewal.release;
  while (release !== RESUMED &&
      clock.timeSource.now() - renewedAt <= RETRY_MAX_DELAY_MS + CLOCK_STEP_MS) {
    clock.advance(CLOCK_STEP_MS);
    await settleTicks();
    release = await releaseAttempt(leader);
  }
  return {atRenewal, release, pauseMs: clock.timeSource.now() - renewedAt,
    answer: answerOf(write), enteredUnderRenewedTerm: enteredUnder(handed, entryId, renewedTerm),
    queued: leader.proposalQueue.size, pendingOutcomes: leader.pendingWriteOutcomes.size,
    kernelTimers: clock.live.size};
}

test('kernel tenure fence (pause, deferred): a write the port deferred under an ended tenure ' +
  'keeps the partition paused for at most one kernel retry delay (control: no write)',
async () => {
  const withWrite = await withVirtualKernelLeader((fixture) =>
    pauseAcrossRenewalWithDeferredWrite(fixture, {deferWrite: true}));
  const control = await withVirtualKernelLeader((fixture) =>
    pauseAcrossRenewalWithDeferredWrite(fixture, {deferWrite: false}));
  const facts = {withWrite: {...withWrite, pauseMs: withWrite.pauseMs <= RETRY_MAX_DELAY_MS},
    control};
  assert.deepEqual(facts, {
    withWrite: {
      atRenewal: {work: {participantPrepared: 0, proposals: 1, pendingOutcomes: 1},
        release: PARTICIPANT_CUTOVER_OUTCOME.DRAIN_PENDING},
      release: RESUMED, pauseMs: true, answer: RELEASED_NOT_LEADER, enteredUnderRenewedTerm: 0,
      queued: 0, pendingOutcomes: 0, kernelTimers: 0},
    control: {
      atRenewal: {work: {participantPrepared: 0, proposals: 0, pendingOutcomes: 0},
        release: RESUMED},
      release: RESUMED, pauseMs: 0, answer: 'none', enteredUnderRenewedTerm: 0,
      queued: 0, pendingOutcomes: 0, kernelTimers: 0},
  }, `the deferred write held the pause ${withWrite.pauseMs} ms (bound: the kernel's maximum ` +
    `retry delay, ${RETRY_MAX_DELAY_MS} ms), released NOT_LEADER at its retry, never ` +
    `proposed; ${JSON.stringify({withWrite, control})}`);
});
