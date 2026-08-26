import {test} from '../../src/test-helpers/tap.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  FormationReleaseHandoffClosureOwner,
  attachFormationReleaseHandoffToStartupAuthority,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  authorizeFormationReleaseHandoffPublicationIntent,
  normalizeFormationReleaseHandoffContract,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {FormationReleaseHandoffPublicationCoordinator} from
  '../../src/control-plane/formation-release-handoff-publication-coordinator.js';
import {readFormationReleaseHandoffPublicationRow} from
  '../../src/control-plane/formation-release-handoff-publication.js';
import {resolveStartupAuthorityNodeIdSet} from
  '../../src/control-plane/startup-authority-placement-eligibility.js';

const NOW = 10_000;

function buildAuthority({
  ready = true,
  state = ready ? 'ready' : 'recovery_pending',
  satisfied = ready,
  reasonCodes = ready ? [] : ['priority_partitions_not_spread'],
  publicationEpoch = 41,
  canonicalNodeIds = ['joiner-a', 'joiner-b', 'seed'],
} = {}) {
  return Object.freeze({
    state,
    ready,
    authorityAvailable: true,
    publicationEpoch,
    publicationStatus: 'PUBLISHED',
    priorityPartitionSummary: Object.freeze({satisfied}),
    priorityRecoveryReasonCodes: Object.freeze([...reasonCodes]),
    canonicalStartupNodeIds: Object.freeze([...canonicalNodeIds]),
    admission: Object.freeze({
      state: 'admitted',
      admitted: true,
      reasonCodes: Object.freeze([]),
      clusterIncarnationFence: Object.freeze({
        allowed: true,
        state: 'matched',
        localIdentityState: 'matched',
        durableMembershipState: 'present',
        peerProofState: 'confirmed',
      }),
    }),
  });
}

function buildNode(nodeId, {
  status = 'joining',
  connectionState = 'connected',
  bootIncarnation = 1,
  readyLeaseExpiresAt = null,
} = {}) {
  return Object.freeze({
    node_id: nodeId,
    status,
    connection_state: connectionState,
    boot_incarnation: bootIncarnation,
    ready_lease_expires_at: readyLeaseExpiresAt,
  });
}

function buildFormationRows(overrides = {}) {
  return [
    buildNode('seed', {
      status: 'active',
      connectionState: 'ready',
      readyLeaseExpiresAt: NOW + 60_000,
    }),
    overrides.joinerA || buildNode('joiner-a'),
    overrides.joinerB || buildNode('joiner-b'),
  ];
}

function buildConnectionEvidence(rows) {
  return rows.map((row) => ({
    nodeId: row.node_id,
    bootIncarnation: row.boot_incarnation > 0 ? row.boot_incarnation : 1,
    connectionId: `connection:${row.node_id}:${row.boot_incarnation}`,
  }));
}

function observeFormation(owner, authority, rows, observedAt) {
  const contract = owner.observe(
    authority,
    rows,
    observedAt,
    'seed',
    buildConnectionEvidence(rows),
  );
  const publicationIntent = owner.publicationIntent();
  return publicationIntent?.generation ?
    owner.acknowledgePublication(
      authorizeFormationReleaseHandoffPublicationIntent(publicationIntent),
    ) :
    contract;
}

function buildReadyRows() {
  return buildFormationRows({
    joinerA: buildNode('joiner-a', {
      status: 'active',
      connectionState: 'ready',
      readyLeaseExpiresAt: NOW + 60_000,
    }),
    joinerB: buildNode('joiner-b', {
      status: 'active',
      connectionState: 'ready',
      readyLeaseExpiresAt: NOW + 60_000,
    }),
  });
}

test('formation release handoff records a simultaneous first reopen and ' +
  'all-READY observation before one terminal completion', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const captured = observeFormation(
    owner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const readyRows = buildReadyRows();
  const reopenedAndReady = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 500,
  );

  t.equal(reopenedAndReady.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(reopenedAndReady.generation, captured.generation);
  t.equal(reopenedAndReady.releaseAuthorized, true);
  t.same(reopenedAndReady.readyNodeIds, ['joiner-a', 'joiner-b']);
  t.same(reopenedAndReady.pendingNodeIds, []);
  t.ok(normalizeFormationReleaseHandoffContract(reopenedAndReady),
    'the causal reopened projection is part of the canonical contract grammar');

  const complete = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 501,
  );
  t.equal(complete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.equal(complete.generation, captured.generation);
  t.equal(complete.releaseAuthorized, false);
  t.end();
});

test('formation release handoff cannot complete from READY leases before the ' +
  'captured generation observes its spread reopen', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const captured = observeFormation(
    owner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const readyRows = buildReadyRows();
  const awaitingReopen = observeFormation(
    owner,
    buildAuthority(),
    readyRows,
    NOW + 100,
  );
  t.equal(awaitingReopen.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(awaitingReopen.generation, captured.generation);
  t.same(awaitingReopen.pendingNodeIds, []);
  t.ok(normalizeFormationReleaseHandoffContract(awaitingReopen),
    'all-READY-before-reopen is an honest canonical ACTIVE projection');

  const stillAwaitingReopen = observeFormation(
    owner,
    buildAuthority(),
    readyRows,
    NOW + 200,
  );
  t.equal(stillAwaitingReopen.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'repeated READY observations cannot substitute for the causal reopen');

  const reopened = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 300,
  );
  t.equal(reopened.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const complete = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 301,
  );
  t.equal(complete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.end();
});

test('formation release restore recovers reopen causality only from an exact ' +
  'durable reopened ACTIVE contract', (t) => {
  const rows = buildFormationRows();
  const sourceOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(sourceOwner, buildAuthority(), rows, NOW);
  const reopened = observeFormation(
    sourceOwner,
    buildAuthority({ready: false, satisfied: false}),
    rows,
    NOW + 100,
  );
  t.equal(reopened.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);

  const restoredOwner = new FormationReleaseHandoffClosureOwner();
  const restored = restoredOwner.restore(
    reopened,
    buildAuthority(),
    rows,
    NOW + 200,
    'seed',
    buildConnectionEvidence(rows),
  );
  t.equal(restored.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const complete = observeFormation(
    restoredOwner,
    buildAuthority(),
    buildReadyRows(),
    NOW + 300,
  );
  t.equal(complete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
    'the exact durable reopened contract restores the causal latch');
  t.end();
});

test('COMPLETE remains fail-closed terminal-pending until the exact terminal ' +
  'readback is durable across owner restart', (t) => {
  const rows = buildFormationRows();
  const readyRows = buildReadyRows();
  const connections = buildConnectionEvidence(rows);
  const owner = new FormationReleaseHandoffClosureOwner();
  observeFormation(owner, buildAuthority(), rows, NOW);
  const reopened = owner.observe(
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 100,
    'seed',
    buildConnectionEvidence(readyRows),
  );
  t.equal(reopened.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const durableReopened = authorizeFormationReleaseHandoffPublicationIntent(
    owner.publicationIntent(),
  );
  owner.acknowledgePublication(durableReopened);

  const pending = owner.observe(
    buildAuthority(),
    readyRows,
    NOW + 101,
    'seed',
    buildConnectionEvidence(readyRows),
  );
  t.equal(pending.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING);
  t.equal(pending.releaseAuthorized, false);
  t.equal(normalizeFormationReleaseHandoffContract(pending), null,
    'local terminal-pending state is never a durable consumer contract');
  t.equal(
    owner.publicationIntent().state,
    FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
  );

  const restarted = new FormationReleaseHandoffClosureOwner();
  const recoveredPending = restarted.restore(
    durableReopened,
    buildAuthority(),
    readyRows,
    NOW + 200,
    'seed',
    connections,
  );
  t.equal(
    recoveredPending.state,
    FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING,
    'crash before terminal readback re-derives rather than skips completion',
  );
  t.equal(recoveredPending.releaseAuthorized, false);
  const durableComplete = authorizeFormationReleaseHandoffPublicationIntent(
    restarted.publicationIntent(),
  );
  const complete = restarted.acknowledgePublication(durableComplete);
  t.equal(complete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.end();
});

test('REVOKED authenticates stale durable identity before operational ' +
  're-evaluation and commits only after exact terminal readback', (t) => {
  const rows = buildFormationRows();
  const connections = buildConnectionEvidence(rows);
  const blockedAuthority = buildAuthority({
    ready: false,
    state: 'blocked',
    satisfied: false,
    reasonCodes: ['control_plane_not_writable'],
  });
  const owner = new FormationReleaseHandoffClosureOwner();
  const durableActive = observeFormation(owner, buildAuthority(), rows, NOW);
  const pending = owner.observe(
    blockedAuthority,
    rows,
    NOW + 100,
    'seed',
    connections,
  );
  t.equal(pending.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING);
  t.equal(owner.publicationIntent().state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED);

  const restarted = new FormationReleaseHandoffClosureOwner();
  const recoveredPending = restarted.restore(
    durableActive,
    blockedAuthority,
    rows,
    NOW + 200,
    'seed',
    connections,
  );
  t.equal(recoveredPending.state,
    FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING);
  t.equal(recoveredPending.releaseAuthorized, false,
    'persistent revoke evidence cannot restore release');
  t.equal(restarted.publicationIntent().reason,
    'startup_authority_incompatible');
  const revoked = restarted.acknowledgePublication(
    authorizeFormationReleaseHandoffPublicationIntent(
      restarted.publicationIntent(),
    ),
  );
  t.equal(revoked.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.end();
});

test('terminal-only REVOKED persists and restores when ACTIVE never became ' +
  'durable and the owner stops before terminal readback', async (t) => {
  const rows = buildFormationRows();
  const connections = buildConnectionEvidence(rows);
  const blockedAuthority = buildAuthority({
    ready: false,
    state: 'blocked',
    satisfied: false,
    reasonCodes: ['control_plane_not_writable'],
  });
  const owner = new FormationReleaseHandoffClosureOwner();
  const captured = owner.observe(
    buildAuthority(),
    rows,
    NOW,
    'seed',
    connections,
  );
  t.equal(captured.releaseAuthorized, false,
    'the ACTIVE contract was never durably acknowledged');
  const pending = owner.observe(
    blockedAuthority,
    rows,
    NOW + 1,
    'seed',
    connections,
  );
  t.equal(pending.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING);
  t.equal(owner.publicationIntent().state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED);

  let durableTerminalRow = null;
  let releaseReadback;
  let markUpserted;
  const upserted = new Promise((resolve) => {
    markUpserted = resolve;
  });
  const readbackGate = new Promise((resolve) => {
    releaseReadback = resolve;
  });
  let oldOwnerDurableCallbacks = 0;
  const coordinator = new FormationReleaseHandoffPublicationCoordinator({
    getStorageOwner: () => ({
      async upsertPublication(row) {
        durableTerminalRow = row;
        markUpserted();
      },
      async getPublication() {
        await readbackGate;
        return durableTerminalRow;
      },
    }),
    onDurable: () => {
      oldOwnerDurableCallbacks += 1;
    },
  });
  coordinator.offer(owner.publicationIntent(), NOW + 2);
  await upserted;
  coordinator.shutdown();
  releaseReadback();
  await coordinator.whenIdle();
  t.equal(oldOwnerDurableCallbacks, 0,
    'shutdown suppresses process-local acknowledgement after terminal write');

  const restarted = new FormationReleaseHandoffClosureOwner();
  const restored = restarted.restore(
    readFormationReleaseHandoffPublicationRow(
      durableTerminalRow,
      'seed',
      1,
    ),
    buildAuthority(),
    rows,
    NOW + 3,
    'seed',
    connections,
  );
  t.equal(restored.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'the exact terminal row is sufficient recovery authority without ACTIVE');
  t.equal(restored.releaseAuthorized, false);
  t.end();
});

test('formation release restart restores COMPLETE and REVOKED terminal ' +
  'high-water before an identical generation can be recaptured', (t) => {
  const joiningRows = buildFormationRows();
  const readyRows = buildReadyRows();
  const connections = buildConnectionEvidence(joiningRows);

  const completingOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(completingOwner, buildAuthority(), joiningRows, NOW);
  observeFormation(
    completingOwner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 100,
  );
  const completed = observeFormation(
    completingOwner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 101,
  );
  const restartedAfterComplete = new FormationReleaseHandoffClosureOwner();
  const restoredComplete = restartedAfterComplete.restore(
    completed,
    buildAuthority(),
    joiningRows,
    NOW + 200,
    'seed',
    connections,
  );
  t.equal(restoredComplete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  const afterCompleteObserve = restartedAfterComplete.observe(
    buildAuthority(),
    joiningRows,
    NOW + 201,
    'seed',
    connections,
  );
  t.equal(afterCompleteObserve.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.equal(afterCompleteObserve.generation, completed.generation,
    'restart cannot recapture the completed epoch');

  const revokingOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(revokingOwner, buildAuthority(), joiningRows, NOW);
  const revoked = observeFormation(
    revokingOwner,
    buildAuthority({
      ready: false,
      state: 'blocked',
      satisfied: false,
      reasonCodes: ['control_plane_not_writable'],
    }),
    joiningRows,
    NOW + 100,
  );
  const restartedAfterRevoke = new FormationReleaseHandoffClosureOwner();
  const restoredRevoke = restartedAfterRevoke.restore(
    revoked,
    buildAuthority(),
    joiningRows,
    NOW + 200,
    'seed',
    connections,
  );
  t.equal(restoredRevoke.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  const afterRevokeObserve = restartedAfterRevoke.observe(
    buildAuthority(),
    joiningRows,
    NOW + 201,
    'seed',
    connections,
  );
  t.equal(afterRevokeObserve.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(afterRevokeObserve.generation, revoked.generation,
    'restart cannot recapture the revoked epoch');

  const wrongBootConnections = connections.map((connection) =>
    connection.nodeId === 'seed' ?
      {...connection, bootIncarnation: 2} : connection,
  );
  const wrongBootOwner = new FormationReleaseHandoffClosureOwner();
  const rejectedTerminal = wrongBootOwner.restore(
    revoked,
    buildAuthority(),
    joiningRows,
    NOW + 300,
    'seed',
    wrongBootConnections,
  );
  t.equal(rejectedTerminal.state, FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'terminal recovery is fenced by the current authority connection boot');
  t.end();
});

test('formation release terminal high-water rejects stale durable ACTIVE ' +
  'replay after COMPLETE or REVOKED', (t) => {
  const rows = buildFormationRows();
  const connections = buildConnectionEvidence(rows);
  const completedOwner = new FormationReleaseHandoffClosureOwner();
  const staleCompletedActive = observeFormation(
    completedOwner,
    buildAuthority(),
    rows,
    NOW,
  );
  const readyRows = buildReadyRows();
  const awaitingReopen = observeFormation(
    completedOwner,
    buildAuthority(),
    readyRows,
    NOW + 500,
  );
  t.equal(awaitingReopen.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const reopened = observeFormation(
    completedOwner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 600,
  );
  t.equal(reopened.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const completed = observeFormation(
    completedOwner,
    buildAuthority({ready: false, satisfied: false}),
    readyRows,
    NOW + 601,
  );
  t.equal(completed.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  const afterCompleteReplay = completedOwner.restore(
    staleCompletedActive,
    buildAuthority({ready: false, satisfied: false}),
    rows,
    NOW + 1_000,
    'seed',
    connections,
  );
  t.equal(afterCompleteReplay.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.equal(afterCompleteReplay.generation, completed.generation,
    'stale ACTIVE cannot move a completed generation backward');

  const revokedOwner = new FormationReleaseHandoffClosureOwner();
  const staleRevokedActive = observeFormation(
    revokedOwner,
    buildAuthority(),
    rows,
    NOW,
  );
  const revoked = observeFormation(
    revokedOwner,
    buildAuthority({
      ready: false,
      state: 'blocked',
      satisfied: false,
      reasonCodes: ['control_plane_not_writable'],
    }),
    rows,
    NOW + 500,
  );
  t.equal(revoked.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  const afterRevokeReplay = revokedOwner.restore(
    staleRevokedActive,
    buildAuthority({ready: false, satisfied: false}),
    rows,
    NOW + 1_000,
    'seed',
    connections,
  );
  t.equal(afterRevokeReplay.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(afterRevokeReplay.generation, revoked.generation,
    'stale ACTIVE cannot resurrect a revoked generation');
  t.end();
});

test('formation release capture ignores a singleton and captures the same ' +
  'satisfied authority only after the shared two-member wave exists', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const singletonRows = buildFormationRows().filter(
    (row) => row.node_id !== 'joiner-b',
  );
  const singleton = observeFormation(
    owner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    singletonRows,
    NOW,
  );
  t.equal(singleton.state, FORMATION_RELEASE_HANDOFF_STATE.IDLE);
  t.equal(singleton.generation, null,
    'ordinary singleton growth cannot mint a formation handoff generation');

  const wave = observeFormation(
    owner,
    buildAuthority(),
    buildFormationRows(),
    NOW + 1,
  );
  t.equal(wave.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(wave.releaseAuthorized, true);
  t.same(wave.requiredCohort, [
    {nodeId: 'joiner-a', bootIncarnation: 1},
    {nodeId: 'joiner-b', bootIncarnation: 1},
  ], 'the first eligible two-member wave is captured atomically');
  t.end();
});

test('formation release owner treats transient canonical omission as projection ' +
  'churn while physical cohort evidence owns revocation', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const rows = buildFormationRows();
  const captured = observeFormation(owner, buildAuthority(), rows, NOW);
  const omittedAuthority = buildAuthority({
    ready: false,
    satisfied: false,
    canonicalNodeIds: ['seed'],
    publicationEpoch: 42,
  });
  const omitted = observeFormation(
    owner,
    omittedAuthority,
    rows,
    NOW + 1,
  );

  t.equal(omitted.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'volatile placement projection loss cannot revoke a live captured member');
  t.equal(omitted.generation, captured.generation,
    'projection omission retains the exact durable generation');
  t.equal(omitted.releaseAuthorized, true,
    'durably acknowledged release remains authorized through omission');
  const placementScope = resolveStartupAuthorityNodeIdSet(
    attachFormationReleaseHandoffToStartupAuthority(
      omittedAuthority,
      omitted,
    ),
  );
  t.same([...placementScope].sort(), ['joiner-a', 'joiner-b', 'seed'],
    'captured canonical scope remains placement-visible during omission');

  const withoutJoinerConnection = buildConnectionEvidence(rows)
    .filter((evidence) => evidence.nodeId !== 'joiner-a');
  const physicallyMissing = owner.observe(
    buildAuthority({
      ready: false,
      satisfied: false,
      canonicalNodeIds: ['seed'],
      publicationEpoch: 43,
    }),
    rows,
    NOW + 2,
    'seed',
    withoutJoinerConnection,
  );
  t.equal(
    physicallyMissing.state,
    FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING,
    'current-primary connection loss creates a fail-closed revoke intent',
  );
  t.equal(
    owner.publicationIntent().state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'the exact revoke becomes terminal only after durable readback',
  );
  t.end();
});
