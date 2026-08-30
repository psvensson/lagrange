// Deterministic witnesses for the formation-release-handoff-consumer-parity
// quest. They drive the REAL owner path — the seed-owned formation-release
// closure owner behind ControlPlaneReadinessService (capture / durable
// acknowledgement / retention across a priority-spread reopen), the durable
// publication row, and the joiner-side consumer projection
// (projectFormationReleaseHandoff -> validateFormationReleaseHandoffConsumerContract)
// — plus the real operation-ledger formation barrier loop
// (awaitOperationLedgerFormationBarrier) on a virtual clock. The only doubles
// sit at genuine collaborator boundaries: the planning answer, the durable
// publication storage owner, and the message router's connection evidence.
//
// Fixture fidelity (GCP run 2026-08-30T02-15-53.462Z): the joiner is a
// DISTINCT process whose admission carries the join-branch cluster-incarnation
// fence the real entrypoint produces (src/entrypoint-runtime-join-decision.js
// persists rejoin hints, then src/entrypoint-runtime-provenance.js resolves the
// fence over them: durable state detected, local identity matched, peer proof
// recovered) — or no fence at all when the barrier reads the seed identity —
// while the seed captured its generation under the fresh seed-branch fence
// (no durable state). The joiner's router evidence is exactly what
// getCurrentPrimaryConnectionBootIncarnation yields after only the acceptor
// IDENTIFY reply: the outbound primary bound with the seed's incarnation plus
// the local boot-incarnation identity; no binding to the other joiner.
//
// Consumer read path (formation-release-handoff-consumer-read-path quest,
// GCP streak 9d5deb4f1): a joiner that hosts no control_plane_publications
// replica reads the authority publication through query routing while every
// replica host is recovery-pending. Its storage owner here runs the REAL
// owner read-option builder, the REAL frozen read-authority token and the
// REAL priority-recovery bootstrap routing grace against the replica host
// exactly as the readiness owner reports it; a refused read unwraps to no row
// (all_services_filtered_by_readiness controlPlaneRecoveryEligible). The
// joiner's system-table cache holds the row its catch-up hydration copied.
//
// The file uses raw node:test so each scenario is independently selectable
// with --test-name-pattern by the quest evidence harnesses
// (scripts/quest-evidence-formation-release-handoff-consumer-parity.js and
// scripts/quest-evidence-formation-release-handoff-consumer-read-path.js).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
// Namespace import: the read-path typed outcomes are absent on HEAD, so the
// module still loads and only the read-path scenarios fail (honest RED).
import * as formationReleasePublication from
  '../../src/control-plane/formation-release-handoff-publication.js';
import {
  ControlPlanePublicationsOwner,
} from '../../src/control-plane/owners/control-plane-publications-owner.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {
  buildAuthorityEvidence,
} from '../../src/control-plane/formation-release-handoff-evidence.js';
import {
  formationReleaseGenerationIdentity,
} from '../../src/control-plane/formation-release-handoff-identity.js';
import {
  CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE,
  CLUSTER_INCARNATION_FENCE_STATE,
  CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE,
  CLUSTER_INCARNATION_PEER_PROOF_STATE,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  NODE_JOINING_SERVICE_SHARED,
} from '../../src/bootstrap/node-joining-service-shared.js';
import {
  initializeEnvironment,
  resetEnvironment,
} from '../convergence/formation-barrier-test-fixture.js';
import {
  analyzeFormationReleaseEvents,
} from '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {
  ACK_AT,
  BARRIER_STATE_SATISFIED,
  BARRIER_STATE_WAITING_AUTHORITY,
  BARRIER_TIMEOUT_CODE,
  BLOCKED_JOINER_FENCE,
  BOOT_INCARNATION,
  FENCE_ABSENT,
  JOINER_A,
  JOINER_B,
  JOINER_FENCE,
  NOW,
  REASON_NOT_SPREAD,
  REASON_NOT_WRITABLE,
  RECOVERY_PENDING_HOST_REPORT,
  RECOVERY_ROUTING_ELIGIBLE_ONLY,
  RECOVERY_ROUTING_FIELD,
  RECOVERY_ROUTING_PRIORITY_RECOVERY_BOOTSTRAP,
  REGRESSED_EPOCH,
  REOPEN_AT,
  RESTARTED_BOOT_INCARNATION,
  SEED,
  SEED_FENCE,
  STATE_BLOCKED,
  STATE_READY,
  STATE_RECOVERY_PENDING,
  UNHEALTHY_HOST_REPORT,
  assertConsumedActive,
  assertFailedClosed,
  buildAuthority,
  buildBarrierOwner,
  buildCache,
  buildJoiner,
  buildNonHostingJoiner,
  buildNonHostingStorageOwner,
  buildRetainedFixture,
  buildRows,
  buildSeed,
  buildStorageOwner,
  projectOnJoiner,
} from './formation-release-handoff-witness-fixture.js';

const {JOINING_DEFAULT} = NODE_JOINING_SERVICE_SHARED;
const {
  FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
  formationReleaseHandoffPublicationId,
} = formationReleasePublication;

const BARRIER_TIMEOUT_DEFAULT_MS = 120_000;
const CERTIFICATION_BUDGET_MS = 60_000;
const CLOSURE_SUITE_ASSERTION_COUNT = 136;
const CLOSURE_SUITE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'formation-release-handoff-closure.test.js',
);
const PUBLICATION_ACTIVATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/bootstrap/node-joining-publication-activation.js',
);
const TAP_SUMMARY_PATTERN = /# \{ total: (\d+), pass: (\d+) \}/;
const NODE_TEST_CONTEXT_ENV = 'NODE_TEST_CONTEXT';
const AUTHORITY_BINDING_PATTERN =
  /ControlPlaneSetup\.create\(\{[\s\S]*?nodeId: this\.nodeId,[\s\S]*?formationReleaseAuthorityNodeId: this\.seedNodeId,/;
const FINGERPRINT = '450f006f50d4ffa0';
const RUN_SEED_ID = '55233079-d897-40f4-8c4f-ca81e3f16573';
const RUN_N1_ID = 'addea3de-57e2-4b48-995f-159046f23023';
const RUN_N2_ID = 'bac5c224-f62d-42ab-b37b-9d70a4f94fa0';
const RUN_N3_ID = '1ece3c8e-d152-41f3-8664-70cdf312f9da';
const RUN_N4_ID = 'df3ba285-bc22-42df-90f5-67b68d48840c';
const RUN_NODE_IDS = Object.freeze([
  RUN_SEED_ID, RUN_N1_ID, RUN_N2_ID, RUN_N3_ID, RUN_N4_ID,
]);
const RUN_GEN1_EPOCH = 1;
const RUN_GEN2_EPOCH = 4;
const RUN_BOOT_MESSAGE = 'Distributed Database System starting';
const RUN_TRANSITION_MESSAGE = 'Formation release handoff authority transition';
const RUN_BARRIER_MESSAGE = 'Join priority-placement formation barrier';
const RUN_DRAINING_MESSAGE = 'Bootstrap readiness marked draining';
const RUN_DRAINING_PHASE = 'DEGRADED';
const RUN_DRAINING_REASONS = Object.freeze([
  'NODE_DRAINING', 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
]);
const RUN_DRAINING_AT = '2026-08-30T02:20:17.623Z';
const RUN_REVOKE_AFTER_DRAINING_AT = '2026-08-30T02:20:19.421Z';
const RUN_REVOKE_BEFORE_DRAINING_AT = '2026-08-30T02:20:17.000Z';
const REASON_ACTIVE = FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY;
const REASON_COMPLETE = FORMATION_RELEASE_HANDOFF_REASON.CAPTURED_COHORT_READY;
const REASON_INELIGIBLE =
  FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
const REASON_INCOMPATIBLE =
  FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE;
const GENERATION_CLASSIFICATION_TEARDOWN_TRUNCATED = 'teardown_truncated';
const CONTRACT_SOURCE_DURABLE = 'durable';
const CONTRACT_SOURCE_CACHE = 'cache';
const CONTRACT_SOURCE_NONE = 'none';
const STRING_TYPE = 'string';
const FUNCTION_TYPE = 'function';
// ── scenarios ──────────────────────────────────────────────────────────────
test('joiner-projects-active-handoff-from-seed-contract: a distinct joiner ' +
  'process with the join-branch fence and acceptor-reply-only router ' +
  'evidence consumes the seed-owned durable generation', async () => {
  assert.equal(JOINER_FENCE.state, CLUSTER_INCARNATION_FENCE_STATE.CURRENT);
  assert.equal(JOINER_FENCE.localIdentityState,
    CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE.MATCHED);
  assert.equal(JOINER_FENCE.durableMembershipState,
    CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE.PRESENT);
  assert.equal(JOINER_FENCE.peerProofState,
    CLUSTER_INCARNATION_PEER_PROOF_STATE.RECOVERED);
  assert.equal(SEED_FENCE.state, CLUSTER_INCARNATION_FENCE_STATE.NOT_REQUIRED);
  const fixture = await buildRetainedFixture();
  const snapshot = await projectOnJoiner(fixture.joiner);
  assertConsumedActive(snapshot, fixture.retained.generation);
  assert.deepEqual(snapshot.formationReleaseHandoff.pendingNodeIds,
    [JOINER_A, JOINER_B]);
  assert.deepEqual([...snapshot.priorityRecoveryReasonCodes],
    [REASON_NOT_SPREAD],
    'retention does not erase the diagnostic cause of the reopen');
  assert.equal(fixture.joiner.formationReleaseHandoffClosureOwner.lastContract.state,
    FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'the joiner local owner never mints a parallel authority');
  assert.equal(
    fixture.joiner.formationReleaseHandoffPublicationCoordinator
      .getDiagnostics().writeCount,
    0,
    'the joiner never publishes a generation of its own',
  );
});

test('joiner-fence-identity-is-authority-published: the consumer validates ' +
  'the seed-published fence, never a hash of its own admission states, and ' +
  'still fails closed on every genuine mismatch', async () => {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner, retained} = fixture;
  const joinerEvidence = buildAuthorityEvidence(fixture.joinerView.authority);
  assert.notEqual(joinerEvidence.value.fenceIdentity, retained.fenceIdentity,
    'the joiner admission fence is provably not the authority fence');
  const consumed = await projectOnJoiner(fixture.joiner);
  assertConsumedActive(consumed, retained.generation);
  assert.equal(consumed.formationReleaseHandoff.fenceIdentity,
    retained.fenceIdentity,
    'the consumed contract carries the authority-published fence identity');

  const noFence = buildJoiner({rows, storageOwner, fence: FENCE_ABSENT});
  assertConsumedActive(await projectOnJoiner(noFence.joiner),
    retained.generation);

  const staleSeed = buildJoiner({
    rows, storageOwner, seedIncarnation: RESTARTED_BOOT_INCARNATION,
  });
  assertFailedClosed(await projectOnJoiner(staleSeed.joiner),
    'different authority incarnation');

  const regressed = buildJoiner({
    rows, storageOwner,
    authority: buildAuthority({ready: false, publicationEpoch: REGRESSED_EPOCH}),
  });
  assertFailedClosed(await projectOnJoiner(regressed.joiner),
    'regressed publication epoch');

  const shrunk = buildJoiner({
    rows, storageOwner,
    authority: buildAuthority({ready: false, canonicalNodeIds: [JOINER_A, SEED]}),
  });
  assertFailedClosed(await projectOnJoiner(shrunk.joiner),
    'incompatible topology (captured member outside the canonical set)');

  const restarted = buildJoiner({
    rows, storageOwner, localIncarnation: RESTARTED_BOOT_INCARNATION,
  });
  assertFailedClosed(await projectOnJoiner(restarted.joiner),
    'restarted joiner process (captured incarnation changed)');

  const blockedFence = buildJoiner({
    rows, storageOwner, fence: BLOCKED_JOINER_FENCE,
  });
  assertFailedClosed(await projectOnJoiner(blockedFence.joiner),
    'joiner whose own admission fence is not allowed');

  const substantive = buildJoiner({
    rows, storageOwner,
    authority: buildAuthority({
      ready: false, state: STATE_BLOCKED, reasonCodes: [REASON_NOT_WRITABLE],
    }),
  });
  assertFailedClosed(await projectOnJoiner(substantive.joiner),
    'substantive authority block');

  fixture.seed.messageRouter.bound.delete(JOINER_B);
  const revoked = fixture.seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT + 1);
  assert.equal(revoked.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  assert.equal(revoked.formationReleaseHandoff.reason, REASON_INELIGIBLE);
  await fixture.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  assertFailedClosed(await projectOnJoiner(fixture.joiner, REOPEN_AT + 1),
    'revoked generation');
});

test('joiner-release-authorized-across-spread-reopen: the joiner holds the ' +
  'same authorized generation before, during, and after the reopen', async () => {
  const rows = buildRows();
  const storageOwner = buildStorageOwner();
  const seedFixture = buildSeed({rows, storageOwner});
  const {seed, seedView} = seedFixture;
  const joinerFixture = buildJoiner({rows, storageOwner});
  const {joiner, joinerView} = joinerFixture;

  seed.getStartupAuthoritySnapshotSync(SEED, NOW);
  await seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const acknowledged = seed.getStartupAuthoritySnapshotSync(SEED, ACK_AT);
  const generation = acknowledged.formationReleaseHandoff.generation;
  joinerView.authority = buildAuthority({fence: JOINER_FENCE});
  assertConsumedActive(await projectOnJoiner(joiner, ACK_AT), generation);

  seedView.authority = buildAuthority({ready: false});
  const reopened = seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT);
  assert.equal(reopened.formationReleaseHandoff.releaseAuthorized, true);
  joinerView.authority = buildAuthority({ready: false, fence: JOINER_FENCE});
  assertConsumedActive(await projectOnJoiner(joiner, REOPEN_AT), generation);

  seedView.authority = buildAuthority();
  const recovered = seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT + 100);
  assert.equal(recovered.formationReleaseHandoff.generation, generation);
  joinerView.authority = buildAuthority({fence: JOINER_FENCE});
  assertConsumedActive(await projectOnJoiner(joiner, REOPEN_AT + 100), generation);
});

test('barrier-resolves-ledger-spread-satisfied-from-authority: the real ' +
  'operation-ledger formation barrier releases from the whole-plane authority ' +
  'answer while the raw spread predicate is still pending', async () => {
  initializeEnvironment();
  try {
    const fixture = await buildRetainedFixture();
    const states = [];
    const owner = buildBarrierOwner({
      joiner: fixture.joiner,
      cache: buildCache(fixture.rows),
      clock: {now: REOPEN_AT},
      states,
    });
    await owner.awaitOperationLedgerFormationBarrier();
    const released = states[states.length - 1];
    assert.equal(released.state, BARRIER_STATE_SATISFIED);
    assert.equal(released.startupAuthorityReady, true);
    assert.equal(released.startupAuthorityState, STATE_READY);
    assert.equal(released.formationReleaseHandoffState,
      FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
    assert.equal(released.formationReleaseHandoffGeneration,
      fixture.retained.generation);
    assert.equal(released.formationReleaseHandoffReleaseAuthorized, true);
    assert.deepEqual([...released.startupAuthorityRecoveryReasonCodes],
      [REASON_NOT_SPREAD], 'the raw spread predicate is still pending');

    // Negative control: without the seed-owned durable contract the same
    // barrier stays gated on the raw spread predicate and fails closed.
    const gated = [];
    const gatedJoiner = buildJoiner({
      rows: fixture.rows, storageOwner: buildStorageOwner(),
    });
    const gatedOwner = buildBarrierOwner({
      joiner: gatedJoiner.joiner,
      cache: buildCache(fixture.rows),
      clock: {now: REOPEN_AT},
      states: gated,
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

test('seed-capture-retention-revocation-unchanged: the seed suite stays ' +
  '136/136 and capture, retention, and disconnect revocation are unchanged',
async () => {
  // The tap suite runs as a plain child outside the node:test protocol (the
  // inherited NODE_TEST_CONTEXT would switch tap to the serialized stream).
  const env = {...process.env};
  delete env[NODE_TEST_CONTEXT_ENV];
  const output = execFileSync(process.execPath, [CLOSURE_SUITE_PATH], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const summary = TAP_SUMMARY_PATTERN.exec(output);
  assert.ok(summary, 'the closure suite prints its tap summary');
  assert.equal(Number(summary[1]), CLOSURE_SUITE_ASSERTION_COUNT);
  assert.equal(Number(summary[2]), CLOSURE_SUITE_ASSERTION_COUNT);

  const fixture = await buildRetainedFixture();
  assert.equal(fixture.transitions.length, 3,
    'capture, durable acknowledgement, retained reopen');
  assert.equal(fixture.transitions[0].details.releaseAuthorized, false);
  assert.equal(fixture.transitions[1].details.releaseAuthorized, true);
  assert.equal(fixture.transitions[2].details.observedAuthorityReady, false);
  assert.equal(fixture.transitions[2].details.releaseAuthorized, true);
  fixture.seed.messageRouter.bound.delete(JOINER_B);
  const revoked = fixture.seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT + 1);
  assert.equal(revoked.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  assert.equal(revoked.formationReleaseHandoff.reason, REASON_INELIGIBLE);
  assert.equal(revoked.ready, false);
});

// ── analyzer witness (event shapes extracted from node-0.log of the run) ───
function buildRunTransition({time, state, reason, epoch, cohort, ready, pending,
  releaseAuthorized, observedAuthorityReady, reasonCodes}) {
  return {
    time,
    nodeId: RUN_SEED_ID,
    authorityNodeId: RUN_SEED_ID,
    authorityBootIncarnation: BOOT_INCARNATION,
    state,
    reason,
    generation: formationReleaseGenerationIdentity(
      epoch, RUN_SEED_ID, BOOT_INCARNATION, cohort,
    ),
    releaseAuthorized,
    capturedPublicationEpoch: epoch,
    observedPublicationEpoch: epoch,
    observedAuthorityReady,
    observedRecoveryReasonCodes: reasonCodes,
    requiredCohort: cohort,
    readyNodeIds: ready,
    pendingNodeIds: pending,
    msg: RUN_TRANSITION_MESSAGE,
  };
}

function buildRunBarrierEvent(time, nodeId, state, startupAuthorityState) {
  return {time, nodeId, state, startupAuthorityState, msg: RUN_BARRIER_MESSAGE};
}

function buildRunEvents({revokeAt, revokeReason = REASON_INELIGIBLE}) {
  const gen1Cohort = [{nodeId: RUN_N3_ID, bootIncarnation: BOOT_INCARNATION}];
  const gen2Cohort = [RUN_N1_ID, RUN_N2_ID, RUN_N4_ID].map((nodeId) => ({
    nodeId, bootIncarnation: BOOT_INCARNATION,
  }));
  const events = RUN_NODE_IDS.map((nodeId, index) => ({
    time: `2026-08-30T02:18:3${index}.000Z`,
    nodeId,
    bootedSrcFingerprint: FINGERPRINT,
    expectedSrcFingerprint: FINGERPRINT,
    srcFingerprintMatches: true,
    msg: RUN_BOOT_MESSAGE,
  }));
  events.push(buildRunTransition({
    time: '2026-08-30T02:18:41.766Z', state: 'active', reason: REASON_ACTIVE,
    epoch: RUN_GEN1_EPOCH, cohort: gen1Cohort, ready: [], pending: [RUN_N3_ID],
    releaseAuthorized: true, observedAuthorityReady: true, reasonCodes: [],
  }));
  events.push(buildRunTransition({
    time: '2026-08-30T02:18:53.967Z', state: 'complete', reason: REASON_COMPLETE,
    epoch: RUN_GEN1_EPOCH, cohort: gen1Cohort, ready: [RUN_N3_ID], pending: [],
    releaseAuthorized: false, observedAuthorityReady: true, reasonCodes: [],
  }));
  events.push(buildRunTransition({
    time: '2026-08-30T02:18:53.968Z', state: 'active', reason: REASON_ACTIVE,
    epoch: RUN_GEN2_EPOCH, cohort: gen2Cohort, ready: [],
    pending: [RUN_N1_ID, RUN_N2_ID, RUN_N4_ID],
    releaseAuthorized: false, observedAuthorityReady: true, reasonCodes: [],
  }));
  events.push(buildRunTransition({
    time: '2026-08-30T02:18:54.105Z', state: 'active', reason: REASON_ACTIVE,
    epoch: RUN_GEN2_EPOCH, cohort: gen2Cohort, ready: [],
    pending: [RUN_N1_ID, RUN_N2_ID, RUN_N4_ID],
    releaseAuthorized: true, observedAuthorityReady: false,
    reasonCodes: [REASON_NOT_SPREAD],
  }));
  events.push(buildRunBarrierEvent('2026-08-30T02:19:10.231Z', RUN_N4_ID,
    BARRIER_STATE_WAITING_AUTHORITY, STATE_RECOVERY_PENDING));
  events.push(buildRunBarrierEvent('2026-08-30T02:20:00.967Z', RUN_N4_ID,
    BARRIER_STATE_SATISFIED, STATE_READY));
  events.push(buildRunTransition({
    time: '2026-08-30T02:20:01.159Z', state: 'active', reason: REASON_ACTIVE,
    epoch: RUN_GEN2_EPOCH, cohort: gen2Cohort, ready: [RUN_N4_ID],
    pending: [RUN_N1_ID, RUN_N2_ID],
    releaseAuthorized: true, observedAuthorityReady: false,
    reasonCodes: [REASON_NOT_SPREAD],
  }));
  events.push({
    time: RUN_DRAINING_AT,
    nodeId: RUN_SEED_ID,
    phase: RUN_DRAINING_PHASE,
    reasons: [...RUN_DRAINING_REASONS],
    drainDeadlineMs: 1788056427610,
    msg: RUN_DRAINING_MESSAGE,
  });
  events.push(buildRunTransition({
    time: revokeAt, state: 'revoked', reason: revokeReason,
    epoch: RUN_GEN2_EPOCH, cohort: gen2Cohort, ready: [], pending: [],
    releaseAuthorized: false, observedAuthorityReady: null, reasonCodes: [],
  }));
  return events;
}

test('analyzer-teardown-revocation-not-stranded: a valid disconnect ' +
  'revocation after the authority marked draining is teardown-truncated, ' +
  'while the same revocation before draining stays stranded', () => {
  const truncated = analyzeFormationReleaseEvents(
    buildRunEvents({revokeAt: RUN_REVOKE_AFTER_DRAINING_AT}), FINGERPRINT,
  );
  assert.equal(truncated.teardownTruncatedGenerationCount, 1);
  assert.equal(truncated.invariants.noStrandedGeneration, true,
    'the retained generation revoked by teardown is not stranded');
  assert.equal(truncated.generationRetainedAcrossReopen, true);
  assert.equal(truncated.invalidRevocationCount, 0);
  assert.equal(truncated.spreadReopenObserved, true);
  assert.equal(truncated.generationClassifications[
    formationReleaseGenerationIdentity(RUN_GEN2_EPOCH, RUN_SEED_ID,
      BOOT_INCARNATION, [RUN_N1_ID, RUN_N2_ID, RUN_N4_ID].map((nodeId) => ({
        nodeId, bootIncarnation: BOOT_INCARNATION,
      })))
  ], GENERATION_CLASSIFICATION_TEARDOWN_TRUNCATED);

  const stranded = analyzeFormationReleaseEvents(
    buildRunEvents({revokeAt: RUN_REVOKE_BEFORE_DRAINING_AT}), FINGERPRINT,
  );
  assert.equal(stranded.teardownTruncatedGenerationCount, 0);
  assert.equal(stranded.invariants.noStrandedGeneration, false,
    'a revocation before draining is a stranded generation');
  assert.equal(stranded.generationRetainedAcrossReopen, false);

  const incompatible = analyzeFormationReleaseEvents(
    buildRunEvents({
      revokeAt: RUN_REVOKE_AFTER_DRAINING_AT, revokeReason: REASON_INCOMPATIBLE,
    }),
    FINGERPRINT,
  );
  assert.equal(incompatible.teardownTruncatedGenerationCount, 0,
    'only a valid disconnect/ineligible revocation is teardown truncation');
  assert.equal(incompatible.invalidRevocationCount, 1);
  assert.equal(incompatible.invariants.noStrandedGeneration, false);
});

test('budgets-and-single-owner-unchanged: the 60 s certification window, the ' +
  '120 s barrier timeout, and the single seed-owned authority are unchanged',
async () => {
  assert.equal(JOINING_DEFAULT.priorityPlacementFormationTimeoutMs,
    BARRIER_TIMEOUT_DEFAULT_MS);
  const withinBudget = buildRunEvents({revokeAt: RUN_REVOKE_AFTER_DRAINING_AT});
  const completion = withinBudget.find((event) => event.state === 'complete');
  const firstCapture = withinBudget.find((event) => event.state === 'active');
  completion.time = new Date(
    Date.parse(firstCapture.time) + CERTIFICATION_BUDGET_MS,
  ).toISOString();
  assert.equal(
    analyzeFormationReleaseEvents(withinBudget, FINGERPRINT)
      .invariants.withinCertificationBudget,
    true,
  );
  completion.time = new Date(
    Date.parse(firstCapture.time) + CERTIFICATION_BUDGET_MS + 1,
  ).toISOString();
  assert.equal(
    analyzeFormationReleaseEvents(withinBudget, FINGERPRINT)
      .invariants.withinCertificationBudget,
    false,
  );
  assert.match(readFileSync(PUBLICATION_ACTIVATION_PATH, 'utf8'),
    AUTHORITY_BINDING_PATTERN,
    'joiner control-plane construction binds the seed as the sole authority');
  const fixture = await buildRetainedFixture();
  assertNoRecoveryRoutingLane(fixture.storageOwner.readOptions(),
    'seed acknowledgement');
  await projectOnJoiner(fixture.joiner);
  assert.equal(fixture.joiner.formationReleaseHandoffClosureOwner.lastContract.state,
    FORMATION_RELEASE_HANDOFF_STATE.IDLE);
  assert.equal(
    fixture.joiner.formationReleaseHandoffPublicationCoordinator
      .getDiagnostics().writeCount,
    0,
  );
  assert.deepEqual(fixture.storageOwner.publisherNodeIds(), [SEED, SEED],
    'every durable write (capture, retained reopen) is published by the seed');
});

// ── consumer read path (non-hosting joiner) ───────────────────────────────
const AUTHORITY_PUBLICATION_ID =
  formationReleaseHandoffPublicationId(SEED, BOOT_INCARNATION);

function assertNoRecoveryRoutingLane(readOptions, label) {
  for (const options of readOptions) {
    assert.equal(options[RECOVERY_ROUTING_FIELD], undefined,
      `${label}: the durable readback carries no recovery-routing lane`);
  }
}

test('non-hosting-joiner-reads-authority-publication-during-recovery: a ' +
  'joiner hosting no control_plane_publications replica reads the authority ' +
  'publication through the priority-recovery bootstrap lane while every ' +
  'replica host is recovery-pending, and only that read is exempt', async () => {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner, retained} = fixture;
  const seedReadbacks = storageOwner.readOptions();
  assert.ok(seedReadbacks.length > 0, 'the seed acknowledged durably');
  assertNoRecoveryRoutingLane(seedReadbacks, 'seed acknowledgement');

  // No cached row: the durable read itself must reach the authority row.
  const nonHosting = buildNonHostingJoiner({rows, storageOwner, hydrated: false});
  const snapshot = await projectOnJoiner(nonHosting.joiner);
  assertConsumedActive(snapshot, retained.generation);
  assert.deepEqual(nonHosting.routedOwner.reads, [{
    recoveryRouting: RECOVERY_ROUTING_PRIORITY_RECOVERY_BOOTSTRAP,
    routable: true,
  }], 'the consumer durable read declares the bootstrap lane and routes');

  // The gate itself is unchanged: an ordinary publication read of the same
  // row on the same host is still refused (no routable candidate).
  const ordinary = buildNonHostingStorageOwner(
    storageOwner, RECOVERY_PENDING_HOST_REPORT,
  );
  assert.equal(
    await ordinary.getPublication(AUTHORITY_PUBLICATION_ID, {skipCacheWait: true}),
    null,
  );
  assert.deepEqual(ordinary.reads, [{
    recoveryRouting: RECOVERY_ROUTING_ELIGIBLE_ONLY,
    routable: false,
  }]);
  const readOptionsOwner =
    Object.create(ControlPlanePublicationsOwner.prototype);
  assert.equal(
    readOptionsOwner.buildPublicationReadOptions({})[RECOVERY_ROUTING_FIELD],
    RECOVERY_ROUTING_ELIGIBLE_ONLY,
    'the publications owner defaults every read to the eligible-only lane',
  );
  assert.equal(
    readOptionsOwner.buildPublicationReadOptions({
      [RECOVERY_ROUTING_FIELD]: true,
    })[RECOVERY_ROUTING_FIELD],
    RECOVERY_ROUTING_ELIGIBLE_ONLY,
    'a boolean is not a lane: only the typed lane value opts a read in',
  );
});

test('no-contract-sentinel-is-typed-absent: the durable read reports no ' +
  'contract as a typed token the projection never treats as a row, so the ' +
  'cached authority-published row becomes the source', async () => {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner, retained} = fixture;
  const denied = buildNonHostingJoiner({
    rows, storageOwner, hostReport: UNHEALTHY_HOST_REPORT,
  });
  const published = await denied.joiner.readFormationReleaseHandoffFromAuthority(
    SEED, BOOT_INCARNATION,
  );
  assert.equal(published, FORMATION_RELEASE_HANDOFF_NO_CONTRACT);
  assert.equal(typeof published, STRING_TYPE,
    'the no-contract token is a truthy typed token, not a row');
  assert.deepEqual(denied.routedOwner.reads, [{
    recoveryRouting: RECOVERY_ROUTING_PRIORITY_RECOVERY_BOOTSTRAP,
    routable: false,
  }], 'a genuinely unhealthy host is refused even on the bootstrap lane');

  const select =
    formationReleasePublication.selectFormationReleaseHandoffContractSource;
  const SOURCE = formationReleasePublication.FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE;
  assert.equal(typeof select, FUNCTION_TYPE,
    'the publication module owns the typed contract-source selection');
  assert.deepEqual(SOURCE, {
    DURABLE: CONTRACT_SOURCE_DURABLE,
    CACHE: CONTRACT_SOURCE_CACHE,
    NONE: CONTRACT_SOURCE_NONE,
  });
  const cached = denied.joiner.readFormationReleaseHandoffFromCache(
    SEED, BOOT_INCARNATION,
  );
  assert.equal(cached.generation, retained.generation);
  assert.deepEqual(select(published, cached),
    {source: SOURCE.CACHE, contract: cached});
  assert.deepEqual(select(null, cached),
    {source: SOURCE.CACHE, contract: cached});
  assert.deepEqual(select(published, published),
    {source: SOURCE.NONE, contract: FORMATION_RELEASE_HANDOFF_NO_CONTRACT});
  assert.deepEqual(select(null, null),
    {source: SOURCE.NONE, contract: FORMATION_RELEASE_HANDOFF_NO_CONTRACT});
  assert.deepEqual(select(cached, published),
    {source: SOURCE.DURABLE, contract: cached});
  assert.deepEqual(select(cached, cached),
    {source: SOURCE.DURABLE, contract: cached});

  const snapshot = await projectOnJoiner(denied.joiner);
  assertConsumedActive(snapshot, retained.generation);
});

test('cached-authority-row-fallback-validated: the cached row is consumed ' +
  'only through the CONSUMER validation, so a different authority ' +
  'incarnation, a regressed epoch, a tampered cached row and a revoked ' +
  'generation stay null', async () => {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner, retained} = fixture;
  const denied = {hostReport: UNHEALTHY_HOST_REPORT};
  const consumed = await projectOnJoiner(
    buildNonHostingJoiner({rows, storageOwner, ...denied}).joiner,
  );
  assertConsumedActive(consumed, retained.generation);
  assert.equal(consumed.formationReleaseHandoff.fenceIdentity,
    retained.fenceIdentity,
    'the cached contract carries the authority-published fence identity');

  const staleSeed = buildNonHostingJoiner({
    rows, storageOwner, ...denied, seedIncarnation: RESTARTED_BOOT_INCARNATION,
  });
  assertFailedClosed(await projectOnJoiner(staleSeed.joiner),
    'cached row of a different authority incarnation');

  const regressed = buildNonHostingJoiner({
    rows, storageOwner, ...denied,
    authority: buildAuthority({ready: false, publicationEpoch: REGRESSED_EPOCH}),
  });
  assertFailedClosed(await projectOnJoiner(regressed.joiner),
    'cached row against a regressed publication epoch');

  const tampered = buildNonHostingJoiner({
    rows, storageOwner, ...denied,
    forgeRow: (row) => ({...row, publisher_node_id: JOINER_B}),
  });
  assertFailedClosed(await projectOnJoiner(tampered.joiner),
    'cached row whose projection disagrees with the embedded contract');

  fixture.seed.messageRouter.bound.delete(JOINER_B);
  const revoked = fixture.seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT + 1);
  assert.equal(revoked.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  await fixture.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  assertFailedClosed(
    await projectOnJoiner(
      buildNonHostingJoiner({rows, storageOwner, ...denied}).joiner,
      REOPEN_AT + 1,
    ),
    'cached row of a revoked generation',
  );
});

test('consumer-validation-predicates-unchanged: every existing consumer ' +
  'negative still fails closed on the non-hosting joiner through both the ' +
  'bootstrap-lane durable read and the cached fallback', async () => {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner, retained} = fixture;
  const routes = [
    {hostReport: RECOVERY_PENDING_HOST_REPORT, hydrated: false},
    {hostReport: UNHEALTHY_HOST_REPORT, hydrated: true},
  ];
  const negatives = [
    ['different authority incarnation',
      {seedIncarnation: RESTARTED_BOOT_INCARNATION}],
    ['regressed publication epoch',
      {authority: buildAuthority({ready: false, publicationEpoch: REGRESSED_EPOCH})}],
    ['incompatible topology (captured member outside the canonical set)',
      {authority: buildAuthority({ready: false, canonicalNodeIds: [JOINER_A, SEED]})}],
    ['restarted joiner process (captured incarnation changed)',
      {localIncarnation: RESTARTED_BOOT_INCARNATION}],
    ['joiner whose own admission fence is not allowed',
      {fence: BLOCKED_JOINER_FENCE}],
    ['substantive authority block',
      {authority: buildAuthority({
        ready: false, state: STATE_BLOCKED, reasonCodes: [REASON_NOT_WRITABLE],
      })}],
  ];
  for (const route of routes) {
    assertConsumedActive(
      await projectOnJoiner(
        buildNonHostingJoiner({rows, storageOwner, ...route}).joiner,
      ),
      retained.generation,
    );
    assertConsumedActive(
      await projectOnJoiner(
        buildNonHostingJoiner({rows, storageOwner, ...route, fence: FENCE_ABSENT})
          .joiner,
      ),
      retained.generation,
    );
    for (const [label, options] of negatives) {
      assertFailedClosed(
        await projectOnJoiner(
          buildNonHostingJoiner({rows, storageOwner, ...route, ...options}).joiner,
        ),
        `${label} (${route.hydrated ? CONTRACT_SOURCE_CACHE : CONTRACT_SOURCE_DURABLE})`,
      );
    }
  }
  fixture.seed.messageRouter.bound.delete(JOINER_B);
  fixture.seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT + 1);
  await fixture.seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  for (const route of routes) {
    assertFailedClosed(
      await projectOnJoiner(
        buildNonHostingJoiner({rows, storageOwner, ...route}).joiner,
        REOPEN_AT + 1,
      ),
      'revoked generation',
    );
  }
});

test('barrier-releases-within-retained-generation: the real operation-ledger ' +
  'formation barrier of a non-hosting joiner resolves ledger_spread_satisfied ' +
  'from the retained generation through either source, and stays gated ' +
  'without any source', async () => {
  initializeEnvironment();
  try {
    const fixture = await buildRetainedFixture();
    const {rows, storageOwner, retained} = fixture;
    const sources = [
      {hostReport: RECOVERY_PENDING_HOST_REPORT, hydrated: false},
      {hostReport: UNHEALTHY_HOST_REPORT, hydrated: true},
    ];
    for (const source of sources) {
      const nonHosting = buildNonHostingJoiner({rows, storageOwner, ...source});
      const states = [];
      const owner = buildBarrierOwner({
        joiner: nonHosting.joiner,
        cache: nonHosting.cache,
        clock: {now: REOPEN_AT},
        states,
      });
      await owner.awaitOperationLedgerFormationBarrier();
      const released = states[states.length - 1];
      assert.equal(released.state, BARRIER_STATE_SATISFIED);
      assert.equal(released.formationReleaseHandoffState,
        FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
      assert.equal(released.formationReleaseHandoffGeneration,
        retained.generation);
      assert.equal(released.formationReleaseHandoffReleaseAuthorized, true);
      assert.deepEqual([...released.startupAuthorityRecoveryReasonCodes],
        [REASON_NOT_SPREAD], 'the raw spread predicate is still pending');
    }

    // Negative control: refused durable read and no cached row.
    const gated = [];
    const unreadable = buildNonHostingJoiner({
      rows, storageOwner, hostReport: UNHEALTHY_HOST_REPORT, hydrated: false,
    });
    const gatedOwner = buildBarrierOwner({
      joiner: unreadable.joiner,
      cache: unreadable.cache,
      clock: {now: REOPEN_AT},
      states: gated,
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

async function traceDrive() {
  const fixture = await buildRetainedFixture();
  const {rows, storageOwner} = fixture;
  const snapshot = await projectOnJoiner(fixture.joiner);
  const routed = buildNonHostingJoiner({rows, storageOwner, hydrated: false});
  const routedSnapshot = await projectOnJoiner(routed.joiner);
  const fallback = buildNonHostingJoiner({
    rows, storageOwner, hostReport: UNHEALTHY_HOST_REPORT,
  });
  const fallbackSnapshot = await projectOnJoiner(fallback.joiner);
  return {
    transitions: fixture.transitions.map((entry) => entry.details),
    handoff: snapshot.formationReleaseHandoff,
    ready: snapshot.ready,
    state: snapshot.state,
    nonHostingHandoff: routedSnapshot.formationReleaseHandoff,
    nonHostingReads: routed.routedOwner.reads,
    cachedHandoff: fallbackSnapshot.formationReleaseHandoff,
    cachedReads: fallback.routedOwner.reads,
  };
}

test('witness-deterministic: two identical drives produce the identical ' +
  'transition sequence and joiner projections (hosting, non-hosting routed, ' +
  'non-hosting cached)', async () => {
  const first = await traceDrive();
  const second = await traceDrive();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.handoff?.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'the deterministic drive ends in the consumed active projection');
  assert.equal(first.nonHostingHandoff?.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  assert.equal(first.cachedHandoff?.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
});
