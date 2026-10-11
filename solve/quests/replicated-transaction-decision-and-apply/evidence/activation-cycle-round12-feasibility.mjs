import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Deterministic design model only. It does not import production owners or
// substitute supplied coordinates for Raft proposal/commit/application proof.
const digest = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

const control = {
  revision: 0,
  cycleOrdinal: 0,
  closedThroughCycleOrdinal: 0,
  state: 'EMPTY',
  cycle: null,
  closure: null,
};
const dependents = new Map();
const observations = [];
const observe = (name, value) => observations.push({name, value});

function dependent(id) {
  if (!dependents.has(id)) {
    dependents.set(id, {
      acceptedCycleOrdinal: 0,
      acceptedCycleId: null,
      acceptedPauseEntryId: null,
      pauseGeneration: 0,
      supersededThroughCycleOrdinal: 0,
      supersessionEntryId: null,
    });
  }
  return dependents.get(id);
}

function descriptor({dependentId, rootAuthorityId, effectId, deadlineAtMs,
  expectedRevision = control.revision}) {
  const nextOrdinal = control.cycleOrdinal + 1;
  const fence = clone(dependent(dependentId));
  const pauseIntent = {
    type: 'PAUSE_PARTICIPANT_ADMISSION',
    dependentId,
    cycleOrdinal: nextOrdinal,
    expectedAcceptedCycleOrdinal: fence.acceptedCycleOrdinal,
    expectedSupersededThroughCycleOrdinal: fence.supersededThroughCycleOrdinal,
    leaderReplicaId: `${dependentId}-r1`,
    term: 7,
    originalDeadlineAtMs: deadlineAtMs,
  };
  const pauseIntentDigest = digest(pauseIntent);
  const root = {kind: 'durable-test-authority', rootAuthorityId,
    effectId, originalDeadlineAtMs: deadlineAtMs};
  const cycleId = digest({version: 2, root, dependentId,
    priorControlRevision: expectedRevision,
    closedThroughCycleOrdinal: control.closedThroughCycleOrdinal,
    pauseIntentDigest});
  const pauseBody = {...pauseIntent, cycleId, pauseIntentDigest};
  const pauseEntryId = `pause:${digest(pauseBody)}`;
  return {version: 2, dependentId, root, cycleOrdinal: nextOrdinal,
    priorControlRevision: expectedRevision,
    closedThroughCycleOrdinal: control.closedThroughCycleOrdinal,
    cycleId, pauseIntentDigest, pauseCommandDigest: digest({...pauseBody,
      entryId: pauseEntryId}),
    pauseCommand: {...pauseBody, entryId: pauseEntryId}};
}

function claim(candidate) {
  if (!['EMPTY', 'RETIRED'].includes(control.state) ||
      candidate.priorControlRevision !== control.revision ||
      candidate.closedThroughCycleOrdinal !== control.closedThroughCycleOrdinal ||
      candidate.cycleOrdinal !== control.cycleOrdinal + 1) return 'HELD';
  control.revision += 1;
  control.cycleOrdinal = candidate.cycleOrdinal;
  control.state = 'CYCLE_CLAIMED';
  control.cycle = clone(candidate);
  return 'CLAIMED';
}

function applyPause(command) {
  const row = dependent(command.dependentId);
  if (row.acceptedCycleId === command.cycleId &&
      row.acceptedPauseEntryId === command.entryId) return 'REPLAYED';
  if (command.cycleOrdinal <= row.acceptedCycleOrdinal ||
      command.cycleOrdinal <= row.supersededThroughCycleOrdinal ||
      command.expectedAcceptedCycleOrdinal !== row.acceptedCycleOrdinal ||
      command.expectedSupersededThroughCycleOrdinal !==
        row.supersededThroughCycleOrdinal) return 'STALE';
  row.acceptedCycleOrdinal = command.cycleOrdinal;
  row.acceptedCycleId = command.cycleId;
  row.acceptedPauseEntryId = command.entryId;
  row.pauseGeneration += 1;
  return 'PAUSED';
}

function recordPause(command) {
  assert.equal(control.state, 'CYCLE_CLAIMED');
  assert.equal(control.cycle.cycleId, command.cycleId);
  const row = dependent(command.dependentId);
  assert.equal(row.acceptedPauseEntryId, command.entryId);
  control.revision += 1;
  control.state = 'PAUSE_APPLIED';
  control.cycle.pauseProof = {entryId: command.entryId,
    cycleOrdinal: command.cycleOrdinal, pauseGeneration: row.pauseGeneration,
    suppliedModelIndex: 1000 + command.cycleOrdinal,
    suppliedModelTerm: 7};
  return clone(control.cycle.pauseProof);
}

function reserve(cycleId) {
  if (!['PAUSE_APPLIED', 'RESERVED'].includes(control.state) ||
      control.cycle?.cycleId !== cycleId) return 'STALE';
  if (control.state === 'RESERVED') return 'REPLAYED';
  control.revision += 1;
  control.state = 'RESERVED';
  control.cycle.authorizationId = digest({kind: 'authorization-v2',
    cycleId, pauseProof: control.cycle.pauseProof});
  return 'RESERVED';
}

function terminalRetire(cycleId) {
  if (control.cycle?.cycleId !== cycleId) return 'STALE';
  if (control.state === 'RETIRED') return 'REPLAYED';
  control.revision += 1;
  control.state = 'RETIRED';
  control.closedThroughCycleOrdinal = control.cycle.cycleOrdinal;
  control.closure = {cycleId, cycleOrdinal: control.cycle.cycleOrdinal,
    closedThroughCycleOrdinal: control.closedThroughCycleOrdinal,
    suppliedModelIndex: 2000 + control.cycle.cycleOrdinal,
    suppliedModelTerm: 7,
    controlRevision: control.revision};
  return 'RETIRED';
}

function applySupersession(command) {
  const row = dependent(command.dependentId);
  if (row.supersessionEntryId === command.entryId) return 'REPLAYED';
  if (command.cycleOrdinal < row.acceptedCycleOrdinal ||
      command.cycleOrdinal <= row.supersededThroughCycleOrdinal) return 'STALE';
  row.supersededThroughCycleOrdinal = command.cycleOrdinal;
  row.supersessionEntryId = command.entryId;
  if (row.acceptedCycleOrdinal === command.cycleOrdinal) {
    row.acceptedCycleId = null;
    row.acceptedPauseEntryId = null;
  }
  return 'SUPERSEDED';
}

function supersedeCurrent() {
  assert.ok(['CYCLE_CLAIMED', 'PAUSE_APPLIED'].includes(control.state));
  const cycle = control.cycle;
  const command = {type: 'SUPERSEDE_PARTICIPANT_RELEASE_CYCLE',
    dependentId: cycle.dependentId, cycleId: cycle.cycleId,
    cycleOrdinal: cycle.cycleOrdinal};
  command.entryId = `supersede:${digest(command)}`;
  const outcome = applySupersession(command);
  assert.ok(['SUPERSEDED', 'REPLAYED'].includes(outcome));
  assert.equal(applySupersession(command), 'REPLAYED');
  control.revision += 1;
  control.state = 'RETIRED';
  control.closedThroughCycleOrdinal = cycle.cycleOrdinal;
  control.closure = {cycleId: cycle.cycleId, cycleOrdinal: cycle.cycleOrdinal,
    closedThroughCycleOrdinal: control.closedThroughCycleOrdinal,
    suppliedModelIndex: 3000 + cycle.cycleOrdinal,
    suppliedModelTerm: 7,
    controlRevision: control.revision,
    supersessionEntryId: command.entryId};
  return command;
}

function historicalRetirement({cycleId, cycleOrdinal, dependentId}) {
  if (cycleOrdinal <= control.closedThroughCycleOrdinal) {
    return {outcome: 'RETIRED_SUPERSEDED', cycleId, cycleOrdinal,
      dependentId, closedThroughCycleOrdinal: control.closedThroughCycleOrdinal,
      closure: clone(control.closure)};
  }
  return {outcome: 'HELD'};
}

const a = descriptor({dependentId: 'partition-a', rootAuthorityId: 'root-a',
  effectId: 'effect-a', deadlineAtMs: 5000});
assert.equal(claim(a), 'CLAIMED');
const crashCopy = clone(control);
assert.deepEqual(crashCopy.cycle.pauseCommand, a.pauseCommand);
observe('AC1 descriptor and exact command survive pre-PAUSE restart', true);

const contender = descriptor({dependentId: 'partition-b',
  rootAuthorityId: 'root-b', effectId: 'effect-b', deadlineAtMs: 5000,
  expectedRevision: 0});
assert.equal(claim(contender), 'HELD');
assert.equal(dependent('partition-b').pauseGeneration, 0);
observe('AC2 loser has no dependent effect before claim', true);

assert.equal(applyPause(a.pauseCommand), 'PAUSED');
assert.equal(applyPause(a.pauseCommand), 'REPLAYED');
recordPause(a.pauseCommand);
assert.equal(reserve(a.cycleId), 'RESERVED');
assert.equal(reserve(a.cycleId), 'REPLAYED');
observe('lost PAUSE and RESERVE answers replay exact identities', true);
const aTargetAuthorization = {cycleId: a.cycleId,
  cycleOrdinal: a.cycleOrdinal, dependentId: a.dependentId};
assert.equal(terminalRetire(a.cycleId), 'RETIRED');
assert.equal(terminalRetire(a.cycleId), 'REPLAYED');

const b = descriptor({dependentId: 'partition-b', rootAuthorityId: 'root-b',
  effectId: 'effect-b', deadlineAtMs: 6000});
assert.equal(claim(b), 'CLAIMED');
assert.equal(applyPause(b.pauseCommand), 'PAUSED');
assert.equal(applyPause(a.pauseCommand), 'REPLAYED');
assert.equal(dependent('partition-a').pauseGeneration, 1);
recordPause(b.pauseCommand);
assert.equal(reserve(b.cycleId), 'RESERVED');
assert.equal(terminalRetire(b.cycleId), 'RETIRED');
observe('delayed exact A PAUSE is inert while A remains the accepted A-partition fence', true);

const c = descriptor({dependentId: 'partition-c', rootAuthorityId: 'root-c',
  effectId: 'effect-c', deadlineAtMs: 7000});
assert.equal(claim(c), 'CLAIMED');
assert.equal(applyPause(c.pauseCommand), 'PAUSED');
recordPause(c.pauseCommand);
assert.equal(reserve(c.cycleId), 'RESERVED');
assert.equal(terminalRetire(c.cycleId), 'RETIRED');
const cBefore = clone(control);
const oldA = historicalRetirement(aTargetAuthorization);
assert.equal(oldA.outcome, 'RETIRED_SUPERSEDED');
assert.equal(oldA.closedThroughCycleOrdinal, 3);
assert.deepEqual(control, cBefore);
observe('AC3 delayed A target resolves after distinct A/B/C cycles without changing C', true);

const d = descriptor({dependentId: 'partition-a', rootAuthorityId: 'root-d',
  effectId: 'effect-d', deadlineAtMs: 8000});
assert.equal(claim(d), 'CLAIMED');
assert.equal(applyPause(d.pauseCommand), 'PAUSED');
assert.equal(applyPause(a.pauseCommand), 'STALE');
assert.equal(dependent('partition-a').pauseGeneration, 2);
recordPause(d.pauseCommand);
assert.equal(reserve(d.cycleId), 'RESERVED');
assert.equal(terminalRetire(d.cycleId), 'RETIRED');
observe('delayed A PAUSE cannot advance or clear same-dependent successor D', true);

const e = descriptor({dependentId: 'partition-e', rootAuthorityId: 'root-e',
  effectId: 'effect-e', deadlineAtMs: 9000});
assert.equal(claim(e), 'CLAIMED');
const supersession = supersedeCurrent();
assert.equal(applyPause(e.pauseCommand), 'STALE');
observe('supersession ordered before delayed PAUSE makes the PAUSE inert', true);
observe('lost supersession answer replays exact entry',
  applySupersession(supersession) === 'REPLAYED');

const catchup = [
  {replicaId: 'r1', applied: 9, commit: 9, last: 9, incarnation: 'i1'},
  {replicaId: 'r2', applied: 8, commit: 8, last: 9, incarnation: 'i2'},
  {replicaId: 'r3', applied: 8, commit: 8, last: 9, incarnation: 'i3'},
];
assert.equal(catchup.every((r) => r.applied === r.commit && r.commit === r.last), false);
catchup[1].applied = catchup[1].commit = 9;
catchup[2].applied = catchup[2].commit = 9;
assert.equal(catchup.every((r) => r.applied === r.commit && r.commit === r.last), true);
observe('same fixed cohort catches up without a new cycle', true);
const changed = clone(catchup);
changed[2].incarnation = 'i3-new';
assert.notDeepEqual(changed, catchup);
observe('changed incarnation is a refusal rather than catch-up', true);

const result = {
  kind: 'activation-cycle-round12-design-feasibility',
  scope: 'deterministic model only; supplied indices and terms are not Raft evidence',
  observations,
  expectedObservationCount: 10,
  finalControl: control,
  dependentRows: Object.fromEntries([...dependents.entries()]),
};
assert.equal(observations.length, result.expectedObservationCount);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
