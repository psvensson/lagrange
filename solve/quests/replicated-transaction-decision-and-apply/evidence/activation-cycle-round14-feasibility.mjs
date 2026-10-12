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

function freshHistoryId(basis) {
  return digest({version: 1, partitionId: basis.controlPartitionId,
    historySeed: basis.historySeed,
    birthAuthorityDigest: basis.birthAuthorityDigest,
    physicalClaimOrOperationId: basis.physicalClaimOrOperationId});
}

function pristine(row) {
  return row.origin === null && row.historyId === null &&
    row.pauseGeneration === 0 && row.pauseEntryId === null &&
    row.controlRevision === 0 && row.control === null &&
    row.authorization === null && row.dependentFence === null;
}

function buildCandidate(root, control, dependent, historyBasis) {
  expect(root.pending === null, 'unresolved candidate replaced');
  const historyId = historyBasis.kind === 'fresh_birth' ?
    freshHistoryId(historyBasis) : historyBasis.historyId;
  const ordinal = control.cycleOrdinal + 1;
  const dependentBinding = dependent.historyId === null ?
    {kind: 'fresh_unbound', historyId,
      birthAuthorityDigest: root.birthAuthorityDigest,
      physicalClaimOrOperationId: root.physicalClaimOrOperationId,
      expectedPauseGeneration: 0} :
    {kind: 'established', historyId,
      expectedFence: dependent.supersededThrough};
  const pause = {action: 'PAUSE', historyId, ordinal,
    attemptGeneration: root.claimAttemptGeneration,
    dependentBinding, rootId: root.rootId};
  const claim = {action: 'CLAIM', historyBasis, historyId, ordinal,
    predecessorRevision: control.controlRevision,
    predecessorOrdinal: control.cycleOrdinal,
    rootId: root.rootId, effectId: root.effectId,
    attemptGeneration: root.claimAttemptGeneration,
    originalDeadlineAtMs: root.originalDeadlineAtMs,
    pauseText: canonical(pause)};
  root.pending = {state: 'submitted_unknown', claim,
    claimEntryId: digest(claim), pause, pauseEntryId: digest(pause)};
  return root.pending;
}

function applyClaim(control, root, candidate) {
  const {historyBasis, historyId} = candidate.claim;
  if (candidate.claim.predecessorRevision !== control.controlRevision ||
      candidate.claim.predecessorOrdinal !== control.cycleOrdinal) {
    return 'STALE_PREDECESSOR';
  }
  if (historyBasis.kind === 'fresh_birth') {
    if (!root.birthAuthorized || !pristine(control) ||
        freshHistoryId(historyBasis) !== historyId) return 'HISTORY_UNAVAILABLE';
    control.historyId = historyId;
  } else if (historyBasis.kind === 'established') {
    if (control.historyId !== historyId) return 'HISTORY_MISMATCH';
  } else return 'INVALID';
  control.cycleOrdinal += 1;
  control.controlRevision += 1;
  control.active = {claimEntryId: candidate.claimEntryId,
    cycleId: digest({claimEntryId: candidate.claimEntryId, historyId}),
    ordinal: candidate.claim.ordinal, historyId,
    pause: candidate.pause};
  control.control = {state: 'CYCLE_CLAIMED', ...control.active};
  return 'CLAIMED';
}

function bindAndPause(dependent, active) {
  const binding = active.pause.dependentBinding;
  if (dependent.historyId === null) {
    if (binding.kind !== 'fresh_unbound' ||
        dependent.origin !== null || dependent.pauseGeneration !== 0 ||
        dependent.pauseEntryId !== null || dependent.controlRevision !== 0 ||
        dependent.authorization !== null || dependent.dependentFence !== null) {
      return 'HISTORY_UNAVAILABLE';
    }
    dependent.historyId = binding.historyId;
  }
  if (dependent.historyId !== active.historyId) return 'HISTORY_MISMATCH';
  dependent.pauseGeneration += 1;
  dependent.pauseEntryId = digest(active.pause);
  dependent.dependentFence = {historyId: active.historyId,
    acceptedOrdinal: active.ordinal, supersededThrough: 0};
  return 'PAUSE_APPLIED';
}

function bindAndSupersede(dependent, active) {
  const binding = active.pause.dependentBinding;
  if (dependent.historyId === null) {
    if (binding.kind !== 'fresh_unbound' ||
        dependent.origin !== null || dependent.pauseGeneration !== 0 ||
        dependent.pauseEntryId !== null || dependent.controlRevision !== 0 ||
        dependent.authorization !== null || dependent.dependentFence !== null) {
      return 'HISTORY_UNAVAILABLE';
    }
    dependent.historyId = binding.historyId;
  }
  if (dependent.historyId !== active.historyId) return 'HISTORY_MISMATCH';
  dependent.dependentFence = {historyId: active.historyId,
    acceptedOrdinal: 0, supersededThrough: active.ordinal};
  return 'SUPERSEDED_BEFORE_PAUSE';
}

function applyDelayedPause(dependent, active) {
  if (dependent.historyId !== active.historyId) return 'HISTORY_MISMATCH';
  if ((dependent.dependentFence?.supersededThrough ?? 0) >= active.ordinal) {
    return 'STALE_CYCLE';
  }
  return bindAndPause(dependent, active);
}

function recordOrigin(row, index, term) {
  expect(row.historyId !== null && row.pauseGeneration === 1,
    'origin before history/pause');
  row.origin = {index, term};
}

function closeCycle(control, dependentProof) {
  expect(control.active !== null, 'no active cycle');
  expect(dependentProof?.historyId === control.historyId &&
    dependentProof?.ordinal === control.active.ordinal &&
    ['retired', 'superseded'].includes(dependentProof.kind),
  'closure without exact dependent proof');
  control.closedThrough = control.active.ordinal;
  control.controlRevision += 1;
  control.control = {state: 'RETIRED', historyId: control.historyId,
    cycleOrdinal: control.active.ordinal,
    closedThrough: control.closedThrough};
  control.active = null;
}

function claimDisposition(control, candidate) {
  const claim = candidate.claim;
  if (claim.historyId !== control.historyId) return {outcome: 'HOLD'};
  if (control.active?.claimEntryId === candidate.claimEntryId) {
    return {outcome: 'CLAIMED_CURRENT', claimEntryId: candidate.claimEntryId};
  }
  if (control.active !== null && control.active.ordinal === claim.ordinal &&
      claim.predecessorRevision < control.controlRevision) {
    return {outcome: 'CLAIM_NOT_SELECTED', claimEntryId: candidate.claimEntryId};
  }
  if (control.closedThrough >= claim.ordinal &&
      control.controlRevision > claim.predecessorRevision) {
    return {outcome: 'CLAIM_TERMINALLY_EXCLUDED',
      claimEntryId: candidate.claimEntryId,
      historyId: control.historyId, requestedOrdinal: claim.ordinal,
      closedThrough: control.closedThrough,
      controlRevision: control.controlRevision};
  }
  return {outcome: 'HOLD'};
}

function persistDisposition(root, candidate, result, storeAvailable) {
  if (!storeAvailable) return false;
  expect(root.pending.claimEntryId === candidate.claimEntryId,
    'candidate changed during read');
  root.lastTerminalClaim = {candidate: copy(candidate), result: copy(result)};
  root.pending = null;
  return true;
}

function successorCandidate(root, control, dependent, turnDeadlineAtMs) {
  const terminal = root.lastTerminalClaim?.result?.outcome;
  const retryable = terminal === 'CLAIM_TERMINALLY_EXCLUDED' ||
    terminal === 'CLAIM_NOT_SELECTED' || terminal === 'STALE_PREDECESSOR';
  if (!root.rootPending || !root.birthAuthorized || !retryable ||
      root.originObserved || root.hardConflict) return null;
  root.claimAttemptGeneration += 1;
  const original = root.originalDeadlineAtMs;
  const candidate = buildCandidate(root, control, dependent,
    {kind: 'established', historyId: control.historyId});
  return {candidate, originalDeadlineAtMs: original, turnDeadlineAtMs};
}

function finalizeAuthorization(state, authorizationId) {
  if (state.retired) return 'STALE';
  if (state.authorizationId === authorizationId) return 'REPLAYED';
  if (state.authorizationId !== null) return 'STALE';
  state.authorizationId = authorizationId;
  state.finalized = true;
  return 'FINALIZED';
}

function retireAuthorization(state) {
  state.retired = true;
  state.locallyApplicable = false;
  return 'RETIRED';
}

function historicalTargetDisposition(controlState, targetAuthorization) {
  if (targetAuthorization.historyId !== controlState.historyId) return 'HOLD';
  return targetAuthorization.cycleOrdinal <= controlState.closedThrough ?
    'RETIRED_SUPERSEDED' : 'HOLD';
}

function consumeHistoricalTarget(answer, before, after) {
  return answer === 'RETIRED_SUPERSEDED' &&
    canonical(before.authorization) === canonical(after.authorization) &&
    before.target === after.target && after.successorPublished === false;
}

function cohortCaughtUp(cohort, expectedIncarnation) {
  return cohort.length > 0 && cohort.every((member) =>
    member.incarnation === expectedIncarnation &&
    member.applied === member.commit && member.commit === member.last);
}

function freshRow() {
  return {origin: null, historyId: null, pauseGeneration: 0,
    pauseEntryId: null, controlRevision: 0, control: null,
    authorization: null, dependentFence: null,
    cycleOrdinal: 0, closedThrough: 0, active: null};
}

const root = {rootId: 'seed-root', effectId: 'effect-sql-transactions',
  birthAuthorityDigest: 'birth-digest',
  physicalClaimOrOperationId: 'physical-birth-1', birthAuthorized: true,
  rootPending: true, originalDeadlineAtMs: 5_000,
  claimAttemptGeneration: 0, pending: null, lastTerminalClaim: null,
  originObserved: false, hardConflict: false};
const control = freshRow();
const basis = {kind: 'fresh_birth', controlPartitionId: 'sql-transactions',
  historySeed: 'history-seed-1',
  birthAuthorityDigest: root.birthAuthorityDigest,
  physicalClaimOrOperationId: root.physicalClaimOrOperationId};
const first = buildCandidate(root, control, control, basis);
const firstClaim = applyClaim(control, root, first);
const firstPause = bindAndPause(control, control.active);
recordOrigin(control, 9, 1);
const freshFormation = firstClaim === 'CLAIMED' && firstPause === 'PAUSE_APPLIED' &&
  control.origin.index === 9 && control.historyId === first.claim.historyId;
const restart = copy(control);
const establishedRestart = restart.historyId === control.historyId &&
  restart.origin.index === 9;

const freshDependent = freshRow();
const freshControl = freshRow();
const freshRoot = {...copy(root), rootId: 'seed-root-2', effectId: 'effect-p2',
  pending: null, lastTerminalClaim: null, claimAttemptGeneration: 0};
const basis2 = {...basis, historySeed: 'history-seed-2'};
const second = buildCandidate(freshRoot, freshControl, freshDependent, basis2);
expect(applyClaim(freshControl, freshRoot, second) === 'CLAIMED',
  'second fresh claim');
const freshSupersession = bindAndSupersede(freshDependent, freshControl.active);
const delayedFreshPause = applyDelayedPause(freshDependent, freshControl.active);
const freshSupersessionFirst = freshSupersession === 'SUPERSEDED_BEFORE_PAUSE' &&
  delayedFreshPause === 'STALE_CYCLE' && freshDependent.pauseGeneration === 0;

const corrupt = freshRow();
corrupt.controlRevision = 1;
const corruptControl = freshRow();
const corruptRoot = {...copy(root), rootId: 'corrupt-root', effectId: 'corrupt',
  pending: null, lastTerminalClaim: null, claimAttemptGeneration: 0};
const corruptCandidate = buildCandidate(corruptRoot, corruptControl, corrupt, basis2);
expect(applyClaim(corruptControl, corruptRoot, corruptCandidate) === 'CLAIMED',
  'control claim for corrupt dependent');
const corruptHeld = bindAndPause(corrupt, corruptControl.active) ===
  'HISTORY_UNAVAILABLE';
const foreign = freshRow();
foreign.historyId = digest('foreign-history');
const foreignHeld = bindAndPause(foreign, corruptControl.active) ===
  'HISTORY_MISMATCH';

closeCycle(freshControl, {kind: 'superseded', historyId: freshControl.historyId,
  ordinal: freshControl.active.ordinal});
for (const label of ['B', 'C']) {
  const cycleRoot = {...copy(root), rootId: `root-${label}`,
    effectId: `effect-${label}`, pending: null, lastTerminalClaim: null,
    claimAttemptGeneration: 0};
  const dep = {historyId: freshControl.historyId, origin: {index: 4, term: 1},
    pauseGeneration: 1, pauseEntryId: 'old', controlRevision: 1,
    authorization: null, dependentFence: {historyId: freshControl.historyId,
      acceptedOrdinal: 0, supersededThrough: freshControl.closedThrough}};
  const candidate = buildCandidate(cycleRoot, freshControl, dep,
    {kind: 'established', historyId: freshControl.historyId});
  expect(applyClaim(freshControl, cycleRoot, candidate) === 'CLAIMED',
    `${label} claim`);
  expect(bindAndSupersede(dep, freshControl.active) ===
    'SUPERSEDED_BEFORE_PAUSE', `${label} dependent supersession`);
  closeCycle(freshControl, {kind: 'superseded',
    historyId: freshControl.historyId, ordinal: freshControl.active.ordinal});
}
const laterDisposition = claimDisposition(freshControl, second);
const lostReceiptAfterReuse = laterDisposition.outcome ===
  'CLAIM_TERMINALLY_EXCLUDED' && laterDisposition.closedThrough === 3;

const directControl = freshRow();
const directRoot = {...copy(root), rootId: 'direct-root', effectId: 'direct',
  pending: null, lastTerminalClaim: null, claimAttemptGeneration: 0};
const directCandidate = buildCandidate(directRoot, directControl, directControl,
  {...basis, historySeed: 'direct-seed'});
expect(applyClaim(directControl, directRoot, directCandidate) === 'CLAIMED',
  'direct claim');
const directReceipt = claimDisposition(directControl, directCandidate).outcome ===
  'CLAIMED_CURRENT';

const unavailableRoot = copy(freshRoot);
unavailableRoot.pending = copy(second);
const unavailableRetains = !persistDisposition(unavailableRoot, second,
  laterDisposition, false) && unavailableRoot.pending.claimEntryId ===
  second.claimEntryId;
const laterPersists = persistDisposition(unavailableRoot, second,
  laterDisposition, true) && unavailableRoot.pending === null;

const expiredUnknown = {...copy(root), pending: copy(first),
  lastTerminalClaim: null, originalDeadlineAtMs: 5_000,
  claimAttemptGeneration: 0};
const noRemintUnknown = successorCandidate(expiredUnknown, control, control,
  7_000) === null && expiredUnknown.pending.claimEntryId === first.claimEntryId;

const retryRoot = {...copy(root), pending: null, originalDeadlineAtMs: 5_000,
  claimAttemptGeneration: 0, lastTerminalClaim: {candidate: copy(second),
    result: copy(laterDisposition)}, originObserved: false, hardConflict: false};
const retryDep = {historyId: freshControl.historyId, origin: {index: 4, term: 1},
  pauseGeneration: 1, pauseEntryId: 'previous', controlRevision: 1,
  authorization: null, dependentFence: {historyId: freshControl.historyId,
    acceptedOrdinal: 0, supersededThrough: freshControl.closedThrough}};
const successor = successorCandidate(retryRoot, freshControl, retryDep, 7_000);
const expiredAdmittedRootContinues = successor !== null &&
  successor.originalDeadlineAtMs === 5_000 &&
  successor.turnDeadlineAtMs === 7_000 && retryRoot.claimAttemptGeneration === 1 &&
  successor.candidate.claim.attemptGeneration === 1;

const hardRoot = {...copy(retryRoot), pending: null, hardConflict: true};
const hardConflictRefuses = successorCandidate(hardRoot, freshControl,
  retryDep, 8_000) === null;

const foreignControl = copy(freshControl);
foreignControl.historyId = digest('another-control-history');
const foreignDispositionHeld = claimDisposition(foreignControl, second).outcome ===
  'HOLD';

const finalizeFirst = {authorizationId: null, finalized: false,
  retired: false, locallyApplicable: true};
const finalizeBeforeRetire = finalizeAuthorization(finalizeFirst, 'auth-A') ===
  'FINALIZED' && retireAuthorization(finalizeFirst) === 'RETIRED' &&
  finalizeFirst.authorizationId === 'auth-A' &&
  finalizeFirst.locallyApplicable === false;
const retireFirst = {authorizationId: null, finalized: false,
  retired: false, locallyApplicable: true};
const retireBeforeFinalize = retireAuthorization(retireFirst) === 'RETIRED' &&
  finalizeAuthorization(retireFirst, 'auth-A') === 'STALE' &&
  retireFirst.authorizationId === null;

const oldTargetAuthorization = {historyId: freshControl.historyId,
  cycleOrdinal: 1, authorizationId: 'old-auth-A', target: 'old-target-A'};
const sameHistoryOldTarget = historicalTargetDisposition(freshControl,
  oldTargetAuthorization) === 'RETIRED_SUPERSEDED';
const foreignHistoryOldTarget = historicalTargetDisposition(foreignControl,
  oldTargetAuthorization) === 'HOLD';
const targetBefore = {authorization: oldTargetAuthorization,
  target: 'old-target-A', successorPublished: false};
const targetAfterUnchanged = copy(targetBefore);
const afterAwaitUnchangedConsumes = consumeHistoricalTarget(
  'RETIRED_SUPERSEDED', targetBefore, targetAfterUnchanged);
const targetAfterChanged = copy(targetBefore);
targetAfterChanged.successorPublished = true;
const afterAwaitSuccessorRefuses = !consumeHistoricalTarget(
  'RETIRED_SUPERSEDED', targetBefore, targetAfterChanged);

const caughtUp = cohortCaughtUp([
  {incarnation: 'life-1', applied: 12, commit: 12, last: 12},
  {incarnation: 'life-1', applied: 15, commit: 15, last: 15},
], 'life-1');
const changedIncarnationNotCaughtUp = !cohortCaughtUp([
  {incarnation: 'life-1', applied: 12, commit: 12, last: 12},
  {incarnation: 'life-2', applied: 15, commit: 15, last: 15},
], 'life-1');

const observations = {
  freshOriginNullClaimPauseThenOrigin: freshFormation,
  establishedRestartReusesHistoryAndOrigin: establishedRestart,
  freshSupersessionBindsAndMakesDelayedPauseInert: freshSupersessionFirst,
  corruptUnboundDependentRemainsHeld: corruptHeld,
  foreignDependentHistoryRemainsHeld: foreignHeld,
  lostRootReceiptAfterBCGetsTerminalExclusion: lostReceiptAfterReuse,
  directCurrentClaimGetsExactReceipt: directReceipt,
  unavailableRootStoreDoesNotBlockControlOrLoseCandidate: unavailableRetains,
  laterRootStoreAvailabilityPersistsExactDisposition: laterPersists,
  expiredUnknownCandidateNeverRemints: noRemintUnknown,
  expiredAdmittedRootAfterTerminalExclusionGetsOneSuccessor:
    expiredAdmittedRootContinues,
  hardConflictNeverGetsSuccessor: hardConflictRefuses,
  sameOrdinalForeignControlHistoryHolds: foreignDispositionHeld,
  finalizeBeforeRetireRemainsHistoricalButFutureFenced: finalizeBeforeRetire,
  retireBeforeFinalizeMakesLateFinalizeStale: retireBeforeFinalize,
  oldTargetRequiresSameHistory: sameHistoryOldTarget && foreignHistoryOldTarget,
  afterAwaitTargetAndSuccessorFenceRevalidated:
    afterAwaitUnchangedConsumes && afterAwaitSuccessorRefuses,
  sameAttemptCatchupAndIncarnationNegative:
    caughtUp && changedIncarnationNotCaughtUp,
};

for (const [name, passed] of Object.entries(observations)) {
  expect(passed === true, `failed observation: ${name}`);
}

process.stdout.write(`${JSON.stringify({
  model: 'activation-cycle-round14-design-feasibility',
  ceiling: 'deterministic supplied-fact model; no product Raft, SQLite or gateway import',
  observationCount: Object.keys(observations).length,
  observations,
  retained: {
    firstHistoryId: control.historyId,
    firstOrigin: control.origin,
    lostCandidateEntryId: second.claimEntryId,
    terminalExclusionClosedThrough: laterDisposition.closedThrough,
    originalDeadlineAtMs: retryRoot.originalDeadlineAtMs,
    successorAttemptGeneration: retryRoot.claimAttemptGeneration,
  },
}, null, 2)}\n`);
