// Deterministic witnesses for the formation-release-handoff-post-reopen-capture
// quest (GCP run 2026-08-30T10-05-10.109Z, five-node formation). The seed's
// formation-release closure owner captured generation e1:1 [n1] at W+3.2
// (10:07:53.293), observed the operation-ledger reopen
// (observedAuthorityReady=false, priority_partitions_not_spread) at 10:07:56 +,
// and completed gen-1 at W+16.3 (10:08:06.455) in an evaluation that had
// already observed the reopen. Because capture was gated on a READY +
// spread-satisfied authority, no successor generation was minted: joiners n3/n4
// reached the barrier at W+37.6/38.7 (node-4.log 10:08:27.734,
// formationReleaseHandoffState=null, waiting_for_startup_authority,
// startupAuthorityRecoveryReasonCodes=[priority_partitions_not_spread]) and
// waited 54–55 s for the raw three-way RO spread cure (release
// ledger_spread_satisfied 10:09:22.561 = W+92.4). The passing control
// 2026-08-30T09-59-08.145Z completed gen-1 with observedAuthorityReady=true at
// 10:02:06.789 and captured gen-2 [n1,n4,n3] on the next evaluation
// (10:02:06.790), authorized 0.4 s later while the reopen was already observed.
//
// The witnesses drive the REAL owner path through the shared fixture
// (formation-release-handoff-witness-fixture.js): the seed-owned closure owner
// behind ControlPlaneReadinessService, the durable publication row, the
// joiner-side CONSUMER validation, and the real operation-ledger formation
// barrier loop on a virtual clock. Raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name
// (scripts/quest-evidence-formation-release-handoff-post-reopen-capture.js).

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {
  formationReleaseGenerationIdentity,
} from '../../src/control-plane/formation-release-handoff-identity.js';
import {
  initializeEnvironment,
  resetEnvironment,
} from '../convergence/formation-barrier-test-fixture.js';
import {
  ACK_AT,
  BARRIER_STATE_SATISFIED,
  BARRIER_STATE_WAITING_AUTHORITY,
  BARRIER_TIMEOUT_CODE,
  BOOT_INCARNATION,
  CAPTURED_EPOCH,
  JOINER_A,
  JOINER_B,
  JOINER_FENCE,
  NOW,
  REASON_NOT_SPREAD,
  REASON_NOT_WRITABLE,
  REOPEN_AT,
  SEED,
  STATE_BLOCKED,
  STATE_READY,
  assertConsumedActive,
  assertFailedClosed,
  buildAuthority,
  buildBarrierOwner,
  buildCache,
  buildJoiner,
  buildNode,
  buildReadyNode,
  buildSeed,
  buildStorageOwner,
  projectOnJoiner,
} from './formation-release-handoff-witness-fixture.js';

// ── hoisted constants ──────────────────────────────────────────────────────
const JOINER_C = 'joiner-c';
// The run shape: gen-1 was captured while only n1 was a connected JOINING
// member of the canonical startup set; n2/n3/n4 (bootstrap requests
// 10:07:51.8–52.0) entered the canonical set afterwards under the same
// authority identity (publication epoch 1 -> 2 at 10:07:56.725).
const GEN1_CANONICAL_NODE_IDS = Object.freeze([JOINER_A, SEED]);
const FULL_CANONICAL_NODE_IDS = Object.freeze(
  [JOINER_A, JOINER_B, JOINER_C, SEED],
);
const SUCCESSOR_CANONICAL_NODE_IDS = Object.freeze([JOINER_A, JOINER_B, SEED]);
const BUMPED_EPOCH = CAPTURED_EPOCH + 1;
const RECAPTURE_EPOCH = BUMPED_EPOCH + 1;
const JOINED_AT = NOW + 200;
const COMPLETE_AT = NOW + 1_000;
const AUTHORIZED_AT = COMPLETE_AT + 1;
const LATE_REOPEN_AT = COMPLETE_AT + 200;
const LATE_JOINER_AT = NOW + 2_000;
const EVALUATION_STEP_MS = 100;
const REPEATED_EVALUATION_COUNT = 20;
const ROW_INDEX_JOINER_A = 1;
const STATE_ACTIVE = FORMATION_RELEASE_HANDOFF_STATE.ACTIVE;
const STATE_COMPLETE = FORMATION_RELEASE_HANDOFF_STATE.COMPLETE;
const STATE_REVOKED = FORMATION_RELEASE_HANDOFF_STATE.REVOKED;
const REASON_INELIGIBLE =
  FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
const GEN1_COHORT = Object.freeze([
  Object.freeze({nodeId: JOINER_A, bootIncarnation: BOOT_INCARNATION}),
]);
const GEN2_COHORT = Object.freeze([
  Object.freeze({nodeId: JOINER_B, bootIncarnation: BOOT_INCARNATION}),
  Object.freeze({nodeId: JOINER_C, bootIncarnation: BOOT_INCARNATION}),
]);
const GEN1_ID = formationReleaseGenerationIdentity(
  CAPTURED_EPOCH, SEED, BOOT_INCARNATION, GEN1_COHORT,
);
const GEN2_ID = formationReleaseGenerationIdentity(
  BUMPED_EPOCH, SEED, BOOT_INCARNATION, GEN2_COHORT,
);

// ── fixture ────────────────────────────────────────────────────────────────
function transitionTuple(details) {
  return [
    details.state,
    details.generation,
    details.releaseAuthorized,
    details.observedAuthorityReady,
    details.observedPublicationEpoch,
    [...details.pendingNodeIds],
  ];
}

function buildReopenAuthority(overrides = {}) {
  return buildAuthority({
    ready: false,
    publicationEpoch: BUMPED_EPOCH,
    canonicalNodeIds: FULL_CANONICAL_NODE_IDS,
    ...overrides,
  });
}

function buildLateJoiner({rows, storageOwner, nodeId = JOINER_C}) {
  return buildJoiner({
    rows,
    storageOwner,
    nodeId,
    authority: buildReopenAuthority({fence: JOINER_FENCE}),
  });
}

function buildRunSeed() {
  const rows = [buildReadyNode(SEED), buildNode(JOINER_A)];
  const storageOwner = buildStorageOwner();
  const transitions = [];
  const seedFixture = buildSeed({rows, storageOwner, transitions});
  seedFixture.seed.messageRouter.bound.add(JOINER_C);
  seedFixture.seedView.authority = buildAuthority({
    canonicalNodeIds: GEN1_CANONICAL_NODE_IDS,
  });
  return {rows, storageOwner, transitions, ...seedFixture};
}

function snapshotAt(seed, at) {
  return seed.getStartupAuthoritySnapshotSync(SEED, at).formationReleaseHandoff;
}

// Capture gen-1 [joiner-a] under a READY authority, acknowledge it durably,
// then admit joiner-b/joiner-c to the canonical set under the same authority
// identity (epoch bump), exactly as the run did before the reopen.
async function driveGen1Captured(fixture) {
  const {seed, seedView, rows} = fixture;
  const captured = snapshotAt(seed, NOW);
  assert.equal(captured.state, STATE_ACTIVE);
  assert.equal(captured.generation, GEN1_ID);
  assert.equal(captured.releaseAuthorized, false);
  await seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  assert.equal(snapshotAt(seed, ACK_AT).releaseAuthorized, true);
  rows.push(buildNode(JOINER_B), buildNode(JOINER_C));
  seedView.authority = buildAuthority({
    publicationEpoch: BUMPED_EPOCH,
    canonicalNodeIds: FULL_CANONICAL_NODE_IDS,
  });
  const grown = snapshotAt(seed, JOINED_AT);
  assert.equal(grown.generation, GEN1_ID,
    'canonical growth under one authority identity retains gen-1');
  assert.equal(grown.observedPublicationEpoch, BUMPED_EPOCH);
  return captured;
}

function observeReopen(fixture, at) {
  fixture.seedView.authority = buildReopenAuthority();
  const reopened = snapshotAt(fixture.seed, at);
  assert.equal(reopened.state, STATE_ACTIVE);
  assert.equal(reopened.observedAuthorityReady, false);
  assert.deepEqual([...reopened.observedRecoveryReasonCodes],
    [REASON_NOT_SPREAD]);
  return reopened;
}

function completeGen1(fixture, {reopenObserved}) {
  fixture.rows[ROW_INDEX_JOINER_A] = buildReadyNode(JOINER_A);
  const complete = snapshotAt(fixture.seed, COMPLETE_AT);
  assert.equal(complete.state, STATE_COMPLETE);
  assert.equal(complete.generation, GEN1_ID);
  assert.equal(complete.observedAuthorityReady, !reopenObserved,
    'gen-1 completes in the evaluation that already observed the reopen');
  return complete;
}

// The run: gen-1 captured, the reopen observed BEFORE gen-1 completes, two
// pre-ready candidates (joiner-b, joiner-c) known to the seed and not yet at
// the barrier. `reopenBeforeCompletion: false` is the passing-control shape
// (09-59): gen-1 completes with the authority READY and the reopen follows.
async function driveRun({reopenBeforeCompletion}) {
  const fixture = buildRunSeed();
  const gen1 = await driveGen1Captured(fixture);
  if (reopenBeforeCompletion) observeReopen(fixture, REOPEN_AT);
  completeGen1(fixture, {reopenObserved: reopenBeforeCompletion});
  const successor = snapshotAt(fixture.seed, COMPLETE_AT);
  await fixture.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const authorized = snapshotAt(fixture.seed, AUTHORIZED_AT);
  if (!reopenBeforeCompletion) observeReopen(fixture, LATE_REOPEN_AT);
  return {...fixture, gen1, successor, authorized};
}

function assertSuccessorCaptured(successor, authorized) {
  assert.equal(successor.state, STATE_ACTIVE,
    'the completion evaluation admits the successor capture');
  assert.equal(successor.generation, GEN2_ID);
  assert.deepEqual([...successor.requiredCohort], [...GEN2_COHORT],
    'the successor cohort is the pre-ready JOINING members of the canonical set');
  assert.deepEqual([...successor.pendingNodeIds], [JOINER_B, JOINER_C]);
  assert.equal(successor.capturedPublicationEpoch, BUMPED_EPOCH);
  assert.equal(successor.releaseAuthorized, false,
    'capture is non-authorizing until durable acknowledgement');
  assert.equal(authorized.generation, GEN2_ID);
  assert.equal(authorized.releaseAuthorized, true);
}

function repeatEvaluations(seed, from) {
  const states = [];
  for (let index = 1; index <= REPEATED_EVALUATION_COUNT; index += 1) {
    states.push(snapshotAt(seed, from + index * EVALUATION_STEP_MS));
  }
  return states;
}

// ── scenarios ──────────────────────────────────────────────────────────────
test('post-reopen-completion-captures-successor: a captured generation that ' +
  'completes while the compatible reopen is already observed admits the ' +
  'successor generation for the pre-ready candidates at the completion ' +
  'instant, keeping the authority identity, fence and epoch of the completed ' +
  'generation', async () => {
  const run = await driveRun({reopenBeforeCompletion: true});
  assertSuccessorCaptured(run.successor, run.authorized);
  assert.equal(run.successor.observedAuthorityReady, false,
    'the successor is minted under the observed reopen, not a READY authority');
  assert.deepEqual([...run.successor.observedRecoveryReasonCodes],
    [REASON_NOT_SPREAD]);
  assert.equal(run.successor.fenceIdentity, run.gen1.fenceIdentity,
    'the successor carries the completed generation\'s authority fence');
  assert.equal(run.successor.authorityBootIncarnation,
    run.gen1.authorityBootIncarnation);
  assert.equal(run.successor.authorityNodeId, SEED);
  assert.deepEqual(
    run.transitions.map((entry) => transitionTuple(entry.details)),
    [
      [STATE_ACTIVE, GEN1_ID, false, true, CAPTURED_EPOCH, [JOINER_A]],
      [STATE_ACTIVE, GEN1_ID, true, true, CAPTURED_EPOCH, [JOINER_A]],
      [STATE_ACTIVE, GEN1_ID, true, true, BUMPED_EPOCH, [JOINER_A]],
      [STATE_ACTIVE, GEN1_ID, true, false, BUMPED_EPOCH, [JOINER_A]],
      [STATE_COMPLETE, GEN1_ID, false, false, BUMPED_EPOCH, []],
      [STATE_ACTIVE, GEN2_ID, false, false, BUMPED_EPOCH, [JOINER_B, JOINER_C]],
      [STATE_ACTIVE, GEN2_ID, true, false, BUMPED_EPOCH, [JOINER_B, JOINER_C]],
    ],
    'complete e:1 then active e:2 — the 09-59 two-evaluation shape under the ' +
      'reopen',
  );
  assert.deepEqual(run.storageOwner.publisherNodeIds(),
    run.storageOwner.publisherNodeIds().map(() => SEED),
    'every durable write is published by the seed');
});

test('late-joiner-consumes-successor-and-releases: a joiner reaching the ' +
  'barrier after gen-1 completed under the reopen consumes the successor ' +
  'through the real CONSUMER validation and the real operation-ledger ' +
  'formation barrier releases ledger_spread_satisfied from it', async () => {
  initializeEnvironment();
  try {
    const run = await driveRun({reopenBeforeCompletion: true});
    const {rows, storageOwner} = run;
    const late = buildLateJoiner({rows, storageOwner});
    const snapshot = await projectOnJoiner(late.joiner, LATE_JOINER_AT);
    assertConsumedActive(snapshot, GEN2_ID);
    assert.deepEqual([...snapshot.priorityRecoveryReasonCodes],
      [REASON_NOT_SPREAD], 'the raw spread predicate is still pending');
    assert.equal(late.joiner.formationReleaseHandoffClosureOwner.lastContract.state,
      FORMATION_RELEASE_HANDOFF_STATE.IDLE,
      'the joiner local owner never mints a parallel authority');
    const states = [];
    const owner = buildBarrierOwner({
      joiner: late.joiner,
      cache: buildCache(rows),
      clock: {now: LATE_JOINER_AT},
      states,
      nodeId: JOINER_C,
    });
    await owner.awaitOperationLedgerFormationBarrier();
    const released = states[states.length - 1];
    assert.equal(released.state, BARRIER_STATE_SATISFIED);
    assert.equal(released.startupAuthorityReady, true);
    assert.equal(released.startupAuthorityState, STATE_READY);
    assert.equal(released.formationReleaseHandoffGeneration, GEN2_ID);
    assert.equal(released.formationReleaseHandoffReleaseAuthorized, true);
    assert.deepEqual([...released.startupAuthorityRecoveryReasonCodes],
      [REASON_NOT_SPREAD]);

    // Negative control: a joiner outside the captured successor cohort
    // (the completed gen-1 member's incarnation is not JOINING any more) is
    // not released by it, and the no-contract barrier still fails closed.
    const gated = [];
    const noContract = buildLateJoiner({
      rows, storageOwner: buildStorageOwner(), nodeId: JOINER_B,
    });
    const gatedOwner = buildBarrierOwner({
      joiner: noContract.joiner,
      cache: buildCache(rows),
      clock: {now: LATE_JOINER_AT},
      states: gated,
      nodeId: JOINER_B,
    });
    const failure = await gatedOwner.awaitOperationLedgerFormationBarrier()
      .then(() => null, (error) => error);
    assert.equal(failure?.code, BARRIER_TIMEOUT_CODE);
    assert.equal(gated[gated.length - 1].state, BARRIER_STATE_WAITING_AUTHORITY);
    assert.equal(gated[gated.length - 1].formationReleaseHandoffState, null);
  } finally {
    resetEnvironment();
  }
});

test('pre-reopen-capture-unchanged: gen-1 completing with the authority READY ' +
  'still captures gen-2 on the READY path with the identical transition ' +
  'sequence, and the reopen that follows retains it', async () => {
  const run = await driveRun({reopenBeforeCompletion: false});
  assertSuccessorCaptured(run.successor, run.authorized);
  assert.equal(run.successor.observedAuthorityReady, true);
  assert.deepEqual(
    run.transitions.map((entry) => transitionTuple(entry.details)),
    [
      [STATE_ACTIVE, GEN1_ID, false, true, CAPTURED_EPOCH, [JOINER_A]],
      [STATE_ACTIVE, GEN1_ID, true, true, CAPTURED_EPOCH, [JOINER_A]],
      [STATE_ACTIVE, GEN1_ID, true, true, BUMPED_EPOCH, [JOINER_A]],
      [STATE_COMPLETE, GEN1_ID, false, true, BUMPED_EPOCH, []],
      [STATE_ACTIVE, GEN2_ID, false, true, BUMPED_EPOCH, [JOINER_B, JOINER_C]],
      [STATE_ACTIVE, GEN2_ID, true, true, BUMPED_EPOCH, [JOINER_B, JOINER_C]],
      [STATE_ACTIVE, GEN2_ID, true, false, BUMPED_EPOCH, [JOINER_B, JOINER_C]],
    ],
    'the 09-59 shape: complete with READY, capture on the READY path, retain ' +
      'across the reopen',
  );
  const late = buildLateJoiner({rows: run.rows, storageOwner: run.storageOwner});
  assertConsumedActive(await projectOnJoiner(late.joiner, LATE_JOINER_AT),
    GEN2_ID);
});

test('no-candidates-no-capture: a completion under the reopen with no ' +
  'pre-ready candidate mints nothing across repeated evaluations', async () => {
  const fixture = buildRunSeed();
  const {seed, seedView, rows, transitions, storageOwner} = fixture;
  const captured = snapshotAt(seed, NOW);
  assert.equal(captured.generation, GEN1_ID);
  await seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  snapshotAt(seed, ACK_AT);
  seedView.authority = buildAuthority({
    ready: false, canonicalNodeIds: GEN1_CANONICAL_NODE_IDS,
  });
  assert.equal(snapshotAt(seed, REOPEN_AT).observedAuthorityReady, false);
  rows[ROW_INDEX_JOINER_A] = buildReadyNode(JOINER_A);
  const complete = snapshotAt(seed, COMPLETE_AT);
  assert.equal(complete.state, STATE_COMPLETE);
  assert.equal(complete.observedAuthorityReady, false);
  for (const contract of repeatEvaluations(seed, COMPLETE_AT)) {
    assert.equal(contract.state, STATE_COMPLETE);
    assert.equal(contract.generation, GEN1_ID);
  }
  assert.equal(transitions.length, 4,
    'capture, acknowledgement, reopen, completion — nothing else');
  await seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  assert.equal(storageOwner.publisherNodeIds().length, 3,
    'capture, retained reopen, completion — no further durable write');
});

test('successor-capture-bounded: repeated evaluations under the reopen ' +
  'after the successor capture mint no further generation and the ' +
  'publication coordinator plateaus (no capture or publication storm)',
async () => {
  const run = await driveRun({reopenBeforeCompletion: true});
  const {seed, transitions, storageOwner} = run;
  const transitionCount = transitions.length;
  const writeCount = storageOwner.publisherNodeIds().length;
  const coordinator = seed.formationReleaseHandoffPublicationCoordinator;
  const diagnosticsBefore = coordinator.getDiagnostics();
  for (const contract of repeatEvaluations(seed, AUTHORIZED_AT)) {
    assert.equal(contract.state, STATE_ACTIVE);
    assert.equal(contract.generation, GEN2_ID);
    assert.equal(contract.releaseAuthorized, true);
  }
  await coordinator.whenIdle();
  assert.equal(transitions.length, transitionCount,
    'no transition is logged by a steady re-evaluation');
  assert.equal(storageOwner.publisherNodeIds().length, writeCount,
    'no durable write is issued by a steady re-evaluation');
  assert.deepEqual(coordinator.getDiagnostics(), diagnosticsBefore);
  assert.equal(diagnosticsBefore.inFlight, false);
  assert.equal(diagnosticsBefore.pending, false);
  const generations = new Set(
    transitions.map((entry) => entry.details.generation),
  );
  assert.deepEqual([...generations], [GEN1_ID, GEN2_ID],
    'exactly one successor generation is minted for the completed generation');
});

test('successor-capture-fails-closed: a candidate whose primary connection ' +
  'the seed has not adopted keeps the successor un-mintable until adopted, a ' +
  'substantive authority block between completion and the next evaluation ' +
  'closes the successor admission for good, a captured successor member ' +
  'losing its primary connection revokes the successor fail-closed and is ' +
  'not re-minted under the reopen, and only a READY authority on a newer ' +
  'epoch mints again', async () => {
  // A JOINING row the seed has not adopted a primary connection for is not a
  // capturable member (unchanged capture rule), so the successor stays
  // un-mintable; once adopted it is minted under the same reopen.
  const unadopted = buildRunSeed();
  snapshotAt(unadopted.seed, NOW);
  await unadopted.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  snapshotAt(unadopted.seed, ACK_AT);
  unadopted.rows.push(buildNode(JOINER_B));
  unadopted.seed.messageRouter.bound.delete(JOINER_B);
  unadopted.seedView.authority = buildAuthority({
    ready: false, canonicalNodeIds: SUCCESSOR_CANONICAL_NODE_IDS,
  });
  assert.equal(snapshotAt(unadopted.seed, REOPEN_AT).generation, GEN1_ID);
  unadopted.rows[ROW_INDEX_JOINER_A] = buildReadyNode(JOINER_A);
  assert.equal(snapshotAt(unadopted.seed, COMPLETE_AT).state, STATE_COMPLETE);
  for (const contract of repeatEvaluations(unadopted.seed, COMPLETE_AT)) {
    assert.equal(contract.state, STATE_COMPLETE,
      'an unadopted candidate is not a capturable member');
  }
  unadopted.seed.messageRouter.bound.add(JOINER_B);
  const minted = snapshotAt(unadopted.seed, LATE_JOINER_AT);
  assert.equal(minted.state, STATE_ACTIVE);
  assert.deepEqual([...minted.pendingNodeIds], [JOINER_B]);
  assert.equal(minted.observedAuthorityReady, false);

  const blocked = buildRunSeed();
  await driveGen1Captured(blocked);
  observeReopen(blocked, REOPEN_AT);
  completeGen1(blocked, {reopenObserved: true});
  blocked.seedView.authority = buildReopenAuthority({
    state: STATE_BLOCKED, reasonCodes: [REASON_NOT_WRITABLE],
  });
  assert.equal(snapshotAt(blocked.seed, AUTHORIZED_AT).state, STATE_COMPLETE,
    'a substantive block admits no successor');
  blocked.seedView.authority = buildReopenAuthority();
  for (const contract of repeatEvaluations(blocked.seed, AUTHORIZED_AT)) {
    assert.equal(contract.state, STATE_COMPLETE,
      'the admission does not reopen once the authority was incompatible');
  }
  blocked.seedView.authority = buildAuthority({
    publicationEpoch: BUMPED_EPOCH, canonicalNodeIds: FULL_CANONICAL_NODE_IDS,
  });
  assert.equal(snapshotAt(blocked.seed, LATE_JOINER_AT).generation, GEN2_ID,
    'the READY path still captures');

  const revoked = await driveRun({reopenBeforeCompletion: true});
  assertSuccessorCaptured(revoked.successor, revoked.authorized);
  revoked.seed.messageRouter.bound.delete(JOINER_B);
  const revocation = snapshotAt(revoked.seed, LATE_REOPEN_AT);
  assert.equal(revocation.state, STATE_REVOKED);
  assert.equal(revocation.reason, REASON_INELIGIBLE);
  await revoked.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const late = buildLateJoiner({
    rows: revoked.rows, storageOwner: revoked.storageOwner,
  });
  assertFailedClosed(await projectOnJoiner(late.joiner, LATE_JOINER_AT),
    'revoked successor');
  revoked.seed.messageRouter.bound.add(JOINER_B);
  for (const contract of repeatEvaluations(revoked.seed, LATE_REOPEN_AT)) {
    assert.equal(contract.state, STATE_REVOKED,
      'a revoked successor is not re-minted under the reopen');
  }
  revoked.seedView.authority = buildAuthority({
    publicationEpoch: BUMPED_EPOCH, canonicalNodeIds: FULL_CANONICAL_NODE_IDS,
  });
  assert.equal(snapshotAt(revoked.seed, LATE_JOINER_AT).state, STATE_REVOKED,
    'the same cohort on the same epoch cannot inherit the revoked generation');
  revoked.seedView.authority = buildAuthority({
    publicationEpoch: RECAPTURE_EPOCH, canonicalNodeIds: FULL_CANONICAL_NODE_IDS,
  });
  const recaptured = snapshotAt(revoked.seed, LATE_JOINER_AT + EVALUATION_STEP_MS);
  assert.equal(recaptured.state, STATE_ACTIVE);
  assert.equal(recaptured.capturedPublicationEpoch, RECAPTURE_EPOCH);
});

async function traceDrive() {
  const run = await driveRun({reopenBeforeCompletion: true});
  const late = buildLateJoiner({rows: run.rows, storageOwner: run.storageOwner});
  const snapshot = await projectOnJoiner(late.joiner, LATE_JOINER_AT);
  return {
    transitions: run.transitions.map((entry) => entry.details),
    successor: run.successor,
    authorized: run.authorized,
    handoff: snapshot.formationReleaseHandoff,
    ready: snapshot.ready,
    state: snapshot.state,
  };
}

test('witness-deterministic: two identical drives produce the identical ' +
  'transition sequence, successor contract and late-joiner projection',
async () => {
  const first = await traceDrive();
  const second = await traceDrive();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.handoff?.state, STATE_ACTIVE,
    'the deterministic drive ends in the consumed successor projection');
  assert.equal(first.handoff?.generation, GEN2_ID);
  assert.equal(first.ready, true);
});
