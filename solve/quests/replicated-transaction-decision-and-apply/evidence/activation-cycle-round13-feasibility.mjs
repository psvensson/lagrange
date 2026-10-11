import {createHash} from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function captureCandidate(root, predecessor, targetAttempt, sequence = 1) {
  expect(root.pending === null || root.pending.state.startsWith('committed_'),
    'unresolved candidate replaced');
  const historySeed = predecessor.historyId === null ?
    `history-seed-${root.effectId}` : null;
  const pauseIntent = {
    historyId: predecessor.historyId,
    dependentId: root.dependentId,
    expectedFence: root.expectedFence,
    targetAttempt,
  };
  const cycleId = digest({rootId: root.rootId, effectId: root.effectId,
    predecessor, pauseIntent, sequence});
  const pauseCommand = {action: 'PAUSE', cycleId,
    cycleOrdinal: predecessor.cycleOrdinal + 1, ...pauseIntent};
  const claimCommand = {action: 'CLAIM', rootId: root.rootId,
    effectId: root.effectId, originalDeadlineAtMs: root.originalDeadlineAtMs,
    historySeed, predecessor, cycleId,
    pauseCommandText: canonical(pauseCommand)};
  root.pending = {state: 'captured_unsubmitted', sequence,
    claimEntryId: digest(claimCommand), claimCommand,
    pauseEntryId: digest(pauseCommand), pauseCommand};
  return root.pending;
}

function submitCandidate(root) {
  expect(root.pending?.state === 'captured_unsubmitted', 'candidate not captured');
  root.pending.state = 'submitted_unknown';
  return root.pending;
}

function committedClaim(root, control, result = 'CLAIMED') {
  const pending = root.pending;
  expect(pending?.state === 'submitted_unknown', 'candidate not submitted');
  pending.state = `committed_${result.toLowerCase()}`;
  pending.committedResult = result;
  if (result !== 'CLAIMED') return null;
  if (control.historyId === null) {
    control.historyId = digest({partitionId: control.partitionId,
      seed: pending.claimCommand.historySeed, origin: control.origin,
      initializedByClaimEntryId: pending.claimEntryId});
  }
  control.cycleOrdinal += 1;
  control.active = {historyId: control.historyId,
    cycleId: pending.pauseCommand.cycleId,
    cycleOrdinal: control.cycleOrdinal,
    claimEntryId: pending.claimEntryId,
    pauseCommand: {...pending.pauseCommand, historyId: control.historyId}};
  return control.active;
}

function attemptMatches(expected, current) {
  return expected.leaderReplicaId === current.leaderReplicaId &&
    expected.term === current.term &&
    expected.lifecycleIncarnation === current.lifecycleIncarnation &&
    expected.configurationKey === current.configurationKey;
}

function supersessionFor(active, expectedFence, reason) {
  const effect = {version: 1, controlHistoryId: active.historyId,
    cycleId: active.cycleId, cycleOrdinal: active.cycleOrdinal,
    controlClaimEntryId: active.claimEntryId,
    dependentId: 'dependent-p1', dependentReleaseId: 'release-p1',
    originalPauseEntryId: digest(active.pauseCommand), expectedFence, reason};
  return {action: 'SUPERSEDE', entryId: digest(effect), effect};
}

function applyPause(dependent, command) {
  if (command.historyId !== dependent.historyId) return 'HISTORY_MISMATCH';
  if (dependent.supersededThrough >= command.cycleOrdinal) return 'STALE_CYCLE';
  if (dependent.accepted?.entryId === digest(command)) return 'REPLAYED';
  if (dependent.accepted !== null &&
      dependent.accepted.cycleOrdinal >= command.cycleOrdinal) return 'STALE_CYCLE';
  dependent.pauseGeneration += 1;
  dependent.accepted = {cycleId: command.cycleId,
    cycleOrdinal: command.cycleOrdinal, entryId: digest(command)};
  return 'PAUSE_APPLIED';
}

function applySupersession(dependent, command) {
  const effect = command.effect;
  if (effect.controlHistoryId !== dependent.historyId) return 'HISTORY_MISMATCH';
  if (dependent.supersessionEntryId === command.entryId) return 'REPLAYED';
  if (dependent.supersededThrough >= effect.cycleOrdinal) return 'STALE_CYCLE';
  if (dependent.accepted !== null &&
      dependent.accepted.cycleOrdinal > effect.cycleOrdinal) return 'STALE_CYCLE';
  const afterPause = dependent.accepted?.cycleId === effect.cycleId;
  dependent.supersededThrough = effect.cycleOrdinal;
  dependent.supersessionEntryId = command.entryId;
  return afterPause ? 'SUPERSEDED_AFTER_PAUSE' : 'SUPERSEDED_BEFORE_PAUSE';
}

function closeCycle(control) {
  expect(control.active !== null, 'no active cycle');
  control.closedThrough = control.active.cycleOrdinal;
  control.active = null;
}

function historicalRetirement(control, authorization) {
  if (authorization.controlHistoryId !== control.historyId) {
    return {outcome: 'CONTROL_HISTORY_MISMATCH'};
  }
  if (authorization.cycleOrdinal <= control.closedThrough) {
    return {outcome: 'RETIRED_SUPERSEDED',
      historyId: control.historyId, closedThrough: control.closedThrough};
  }
  return {outcome: 'HELD'};
}

const predecessor = {historyId: null, controlRevision: 7,
  cycleOrdinal: 0, closedThrough: 0};
const attemptA = {leaderReplicaId: 'r1', term: 7,
  lifecycleIncarnation: 'life-1', configurationKey: 'cfg-1'};
const attemptB = {leaderReplicaId: 'r2', term: 8,
  lifecycleIncarnation: 'life-2', configurationKey: 'cfg-2'};
const root = {rootId: 'root-seed-1', effectId: 'effect-p1',
  dependentId: 'dependent-p1', expectedFence: 'empty',
  originalDeadlineAtMs: 50_000, pending: null};

const captured = captureCandidate(root, predecessor, attemptA);
const capturedCrash = copy(root);
const capturedStable = canonical(capturedCrash.pending.claimCommand) ===
  canonical(captured.claimCommand) &&
  capturedCrash.pending.claimEntryId === captured.claimEntryId;
submitCandidate(root);
const uncertainCrash = copy(root);
const uncertainStable = uncertainCrash.pending.claimEntryId === captured.claimEntryId &&
  canonical(uncertainCrash.pending.claimCommand) === canonical(captured.claimCommand);

const staleRoot = copy(root);
committedClaim(staleRoot, {partitionId: 'control', origin: {index: 3, term: 1},
  historyId: null, cycleOrdinal: 0, closedThrough: 0, active: null}, 'STALE');
const oldStaleId = staleRoot.pending.claimEntryId;
const successor = captureCandidate(staleRoot,
  {...predecessor, controlRevision: 8}, attemptB, 2);
const successorAfterProof = staleRoot.pending.claimEntryId !== oldStaleId &&
  staleRoot.pending.sequence === 2;

const control = {partitionId: 'control', origin: {index: 3, term: 1},
  historyId: null, cycleOrdinal: 0, closedThrough: 0, active: null};
const active = committedClaim(root, control);
const committedHistory = control.historyId !== null &&
  active.historyId === control.historyId && root.pending.claimEntryId === active.claimEntryId;

const immutableSupersession = supersessionFor(active, 'empty',
  'captured_attempt_stale');
const sameEffectNewEnvelope = !attemptMatches(attemptA, attemptB) &&
  immutableSupersession.entryId === copy(immutableSupersession).entryId;

const beforeDependent = {historyId: control.historyId, pauseGeneration: 0,
  supersededThrough: 0, supersessionEntryId: null, accepted: null};
const beforeResult = applySupersession(beforeDependent, immutableSupersession);
const latePause = applyPause(beforeDependent, active.pauseCommand);
const supersessionBeforePause = beforeResult === 'SUPERSEDED_BEFORE_PAUSE' &&
  latePause === 'STALE_CYCLE' && beforeDependent.pauseGeneration === 0;

const afterDependent = {historyId: control.historyId, pauseGeneration: 0,
  supersededThrough: 0, supersessionEntryId: null, accepted: null};
const pauseResult = applyPause(afterDependent, active.pauseCommand);
const afterResult = applySupersession(afterDependent, immutableSupersession);
const supersessionAfterPause = pauseResult === 'PAUSE_APPLIED' &&
  afterResult === 'SUPERSEDED_AFTER_PAUSE' && afterDependent.pauseGeneration === 1;
const lostSupersessionReplay = applySupersession(afterDependent,
  copy(immutableSupersession)) === 'REPLAYED';

closeCycle(control);
const historyId = control.historyId;
const authorizations = [];
for (const [label, rootId] of [['B', 'root-b'], ['C', 'root-c']]) {
  const cycleRoot = {rootId, effectId: `effect-${label}`,
    dependentId: `dependent-${label}`, expectedFence: label,
    originalDeadlineAtMs: 60_000, pending: null};
  const pred = {historyId, controlRevision: 8 + authorizations.length,
    cycleOrdinal: control.cycleOrdinal, closedThrough: control.closedThrough};
  captureCandidate(cycleRoot, pred, attemptB);
  submitCandidate(cycleRoot);
  const next = committedClaim(cycleRoot, control);
  authorizations.push({label, controlHistoryId: historyId,
    cycleId: next.cycleId, cycleOrdinal: next.cycleOrdinal});
  closeCycle(control);
}
const oldA = {controlHistoryId: historyId, cycleId: active.cycleId,
  cycleOrdinal: active.cycleOrdinal, target: 'old-target-A'};
const cBefore = canonical({control, current: authorizations[1]});
const delayedA = historicalRetirement(control, oldA);
const cAfter = canonical({control, current: authorizations[1]});
const threeCyclesDelayedA = delayedA.outcome === 'RETIRED_SUPERSEDED' &&
  control.closedThrough === 3 && cBefore === cAfter;

const foreign = historicalRetirement(control,
  {...oldA, controlHistoryId: digest('different-history')});
const differentHistoryHeld = foreign.outcome === 'CONTROL_HISTORY_MISMATCH';

const targetBefore = {authorization: oldA, successorPublished: false};
const targetChangedDuringAwait = copy(targetBefore);
targetChangedDuringAwait.authorization = {...oldA, target: 'changed-target'};
const targetMutationHeld = canonical(targetBefore.authorization) !==
  canonical(targetChangedDuringAwait.authorization);
const successorDuringAwait = copy(targetBefore);
successorDuringAwait.successorPublished = true;
const successorFenceHeld = successorDuringAwait.successorPublished === true;

const authenticSnapshot = copy(control);
const historyPreserved = authenticSnapshot.historyId === control.historyId &&
  authenticSnapshot.closedThrough === control.closedThrough;
const missingHistory = historicalRetirement({...control, historyId: null}, oldA);
const missingHistoryHeld = missingHistory.outcome === 'CONTROL_HISTORY_MISMATCH';

const observations = {
  capturedCandidateSurvivesPreSubmitCrash: capturedStable,
  submittedUnknownRedrivesExactCandidate: uncertainStable,
  successorCandidateOnlyAfterCommittedStale: successorAfterProof,
  committedClaimOwnsHistoryAndExactCandidate: committedHistory,
  staleEnvelopeCanCarrySameImmutableSupersession: sameEffectNewEnvelope,
  supersessionBeforePauseMakesDelayedPauseInert: supersessionBeforePause,
  pauseBeforeSupersessionClosesExactPause: supersessionAfterPause,
  lostSupersessionAnswerReplaysExactEntry: lostSupersessionReplay,
  threeSameHistoryCyclesRetireDelayedAWithoutChangingC: threeCyclesDelayedA,
  equalOrdinalDifferentHistoryRemainsHeld: differentHistoryHeld,
  targetMutationAndSuccessorPublicationRetainDebt:
    targetMutationHeld && successorFenceHeld,
  authenticSnapshotPreservesHistoryAndMissingHistoryHolds:
    historyPreserved && missingHistoryHeld,
};

for (const [name, passed] of Object.entries(observations)) {
  expect(passed === true, `failed observation: ${name}`);
}

process.stdout.write(`${JSON.stringify({
  model: 'activation-cycle-round13-design-feasibility',
  ceiling: 'deterministic supplied-fact model; no production Raft or SQLite import',
  observationCount: Object.keys(observations).length,
  observations,
  retained: {
    uncertainClaimEntryId: captured.claimEntryId,
    supersessionEntryId: immutableSupersession.entryId,
    controlHistoryId: historyId,
    closedThroughCycleOrdinal: control.closedThrough,
  },
}, null, 2)}\n`);
