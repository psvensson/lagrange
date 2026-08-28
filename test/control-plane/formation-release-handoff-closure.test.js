import {test} from '../../src/test-helpers/tap.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  FormationReleaseHandoffClosureOwner,
  attachFormationReleaseHandoffToStartupAuthority,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
  buildFormationReleaseHandoffPublicationRow,
  formationReleaseHandoffPublicationId,
  normalizeFormationReleaseHandoffContract,
  readFormationReleaseHandoffPublicationRow,
} from '../../src/control-plane/formation-release-handoff-publication.js';
import {FormationReleaseHandoffPublicationCoordinator} from
  '../../src/control-plane/formation-release-handoff-publication-coordinator.js';
import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';
import {
  EVIDENCE_OUTCOME,
  buildAuthorityEvidence,
} from '../../src/control-plane/formation-release-handoff-evidence.js';
import {
  FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION,
  classifyFormationCohortSpreadCureNode,
} from '../../src/control-plane/startup-authority-placement-eligibility.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';
import fs from 'node:fs';

const NOW = 10_000;

test('joiner control-plane construction binds formation authority to the ' +
  'seed identity', (t) => {
  const source = fs.readFileSync(
    new URL(
      '../../src/bootstrap/node-joining-publication-activation.js',
      import.meta.url,
    ),
    'utf8',
  );
  t.match(
    source,
    /ControlPlaneSetup\.create\(\{[\s\S]*?nodeId: this\.nodeId,[\s\S]*?formationReleaseAuthorityNodeId: this\.seedNodeId,/,
  );
  t.end();
});

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
  const evidence = [];
  for (const row of rows) {
    const nodeIdDescriptor = Object.getOwnPropertyDescriptor(row, 'node_id');
    const incarnationDescriptor = Object.getOwnPropertyDescriptor(
      row,
      'boot_incarnation',
    );
    if (
      !nodeIdDescriptor ||
      !Object.hasOwn(nodeIdDescriptor, 'value') ||
      !incarnationDescriptor ||
      !Object.hasOwn(incarnationDescriptor, 'value')
    ) {
      continue;
    }
    const bootIncarnation = incarnationDescriptor.value > 0 ?
      incarnationDescriptor.value : 1;
    evidence.push({
      nodeId: nodeIdDescriptor.value,
      bootIncarnation,
      connectionId: `connection:${nodeIdDescriptor.value}:${bootIncarnation}`,
    });
  }
  return evidence;
}

function observeFormation(
  owner,
  authority,
  rows,
  observedAt,
  connectionEvidence = buildConnectionEvidence(rows),
) {
  const contract = owner.observe(
    authority,
    rows,
    observedAt,
    'seed',
    connectionEvidence,
  );
  return contract.active && contract.releaseAuthorized === false ?
    owner.acknowledgePublication(contract.generation) :
    contract;
}

function buildMessageRouter(getRows, localNodeId = 'seed') {
  return {
    nodeId: localNodeId,
    bootIncarnation: 1,
    getLocalBootIncarnationIdentity() {
      return {
        nodeId: localNodeId,
        bootIncarnation: 1,
        connectionId: `local:${localNodeId}:1`,
      };
    },
    getCurrentPrimaryConnectionBootIncarnation(nodeId) {
      return buildConnectionEvidence(getRows())
        .find((evidence) => evidence.nodeId === nodeId) || null;
    },
  };
}

function buildPlacementNode(nodeId) {
  return {
    node_id: nodeId,
    status: 'joining',
    connection_state: 'connected',
  };
}

function buildPlacementOptions(node, handoffActive) {
  return {
    node,
    startupAuthorityNodeIds: new Set(['joiner-a', 'joiner-b', 'seed']),
    messageRouter: {
      getConnectionState() {
        return 'connected';
      },
    },
    localNodeId: 'seed',
    includeSelf: true,
    priorityRecoveryLane: true,
    priorityRecoveryActive: false,
    formationReleaseHandoffActive: handoffActive,
  };
}

function buildFormationPublicationStorageOwner() {
  let durableRow = null;
  return {
    async upsertPublication(row) {
      durableRow = row;
      return row;
    },
    async getPublication() {
      return durableRow;
    },
  };
}

test('formation release handoff retains one generation across a reopened ' +
  'spread gap until the captured JOINING cohort is READY', async (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const initial = observeFormation(owner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );

  t.equal(initial.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(initial.releaseAuthorized, true);
  t.same(initial.pendingNodeIds, ['joiner-a', 'joiner-b']);
  t.same(
    initial.requiredCohort,
    [
      {nodeId: 'joiner-a', bootIncarnation: 1},
      {nodeId: 'joiner-b', bootIncarnation: 1},
    ],
  );

  const reopened = observeFormation(owner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows(),
    NOW + 500,
  );
  t.equal(reopened.generation, initial.generation,
    'spread reopening retains the captured generation');
  t.equal(reopened.releaseAuthorized, true,
    'the retained generation keeps whole-plane release open');

  const contradictoryOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(
    contradictoryOwner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const contradictory = observeFormation(
    contradictoryOwner,
    buildAuthority({ready: false, satisfied: true}),
    buildFormationRows(),
    NOW + 750,
  );
  t.equal(contradictory.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'recovery-pending retention requires an actual false spread predicate');

  const oneReady = observeFormation(owner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows({
      joinerA: buildNode('joiner-a', {
        status: 'active',
        connectionState: 'ready',
        readyLeaseExpiresAt: NOW + 60_000,
      }),
    }),
    NOW + 1_000,
  );
  t.same(oneReady.readyNodeIds, ['joiner-a']);
  t.same(oneReady.pendingNodeIds, ['joiner-b']);
  t.equal(oneReady.releaseAuthorized, true);

  const complete = observeFormation(owner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows({
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
    }),
    NOW + 1_500,
  );
  t.equal(complete.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  t.equal(complete.releaseAuthorized, false,
    'authority closes only after every captured incarnation is READY');
  t.end();
});

test('formation cure classification consumes the retained handoff owner ' +
  'instead of instantaneous recovery activity', async (t) => {
  const node = buildPlacementNode('joiner-a');
  t.equal(
    classifyFormationCohortSpreadCureNode(
      buildPlacementOptions(node, false),
    ),
    FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION.NOT_CURE_TARGET,
    'the historical instantaneous predicate closes the cure lane',
  );
  t.equal(
    classifyFormationCohortSpreadCureNode(
      buildPlacementOptions(node, true),
    ),
    FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION.CURE_TARGET,
    'the retained interaction owner keeps the exact JOINING cure target',
  );
  t.end();
});

test('startup authority attachment gives join and bootstrap consumers one ' +
  'release answer during non-monotone spread', async (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  observeFormation(owner, buildAuthority(), buildFormationRows(), NOW);
  const current = buildAuthority({ready: false, satisfied: false});
  const handoff = observeFormation(
    owner,
    current,
    buildFormationRows(),
    NOW + 500,
  );
  const attached = attachFormationReleaseHandoffToStartupAuthority(
    current,
    handoff,
  );

  t.equal(attached.ready, true);
  t.equal(attached.state, 'ready');
  t.equal(attached.formationReleaseHandoff.generation, handoff.generation);
  t.same(
    attached.priorityRecoveryReasonCodes,
    ['priority_partitions_not_spread'],
    'retention does not erase the diagnostic cause of instantaneous reopening',
  );
  t.end();
});

test('readiness service projects one retained generation to seed and target ' +
  'consumers while node joining requests the seed authority identity',
async (t) => {
  const rows = buildFormationRows();
  let currentAuthority = buildAuthority();
  const requestedNodeIds = [];
  const cache = {
    getAll(tableName) {
      return tableName === 'nodes' ? rows : [];
    },
    get() {
      return null;
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    onCacheChange() {},
  };
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed',
    formationReleaseAuthorityNodeId: 'seed',
    systemTableCache: cache,
    messageRouter: buildMessageRouter(() => rows),
    membershipPublicationService: {
      controlPlanePublicationsOwner:
        buildFormationPublicationStorageOwner(),
    },
    now: () => NOW,
  });
  service.getPriorityRecoveryPlanningAnswerSync = (nodeId) => {
    requestedNodeIds.push(nodeId);
    return {};
  };
  service.getPriorityRecoveryPlanningAnswerForOwnerRead = async (nodeId) => {
    requestedNodeIds.push(nodeId);
    return {};
  };
  service.buildStartupAuthoritySnapshotFromPlanningAnswer = () =>
    currentAuthority;

  const pendingCapture = service.getFormationReleaseStartupAuthoritySnapshotSync(
    'seed',
    NOW,
  );
  t.equal(pendingCapture.formationReleaseHandoff.releaseAuthorized, false);
  await service.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const captured = service.getFormationReleaseStartupAuthoritySnapshotSync(
    'seed',
    NOW + 1,
  );
  currentAuthority = buildAuthority({ready: false, satisfied: false});
  const targetView = service.getStartupAuthoritySnapshotSync(
    'joiner-a',
    NOW + 500,
  );
  const seedView = service.getStartupAuthoritySnapshotSync(
    'seed',
    NOW + 500,
  );
  t.equal(targetView.ready, true);
  t.equal(seedView.ready, true);
  t.equal(
    targetView.formationReleaseHandoff.generation,
    captured.formationReleaseHandoff.generation,
  );
  t.equal(
    seedView.formationReleaseHandoff.generation,
    captured.formationReleaseHandoff.generation,
  );

  currentAuthority = buildAuthority({
    ready: false,
    state: 'blocked',
    satisfied: false,
    reasonCodes: ['control_plane_not_writable'],
  });
  const targetSpecificBlockedView = service.getStartupAuthoritySnapshotSync(
    'joiner-b',
    NOW + 750,
  );
  t.equal(
    targetSpecificBlockedView.formationReleaseHandoff.releaseAuthorized,
    true,
    'target-specific planning cannot revoke the seed/global generation',
  );

  const joiningOwner = Object.create(
    NodeJoiningReadySignalReadiness.prototype,
  );
  joiningOwner.nodeId = 'joiner-a';
  joiningOwner.seedNodeId = 'seed';
  joiningOwner.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync() {
        return targetView;
      },
      async getFormationReleaseStartupAuthoritySnapshot(nodeId) {
        requestedNodeIds.push(nodeId);
        return targetView;
      },
    },
  };
  await joiningOwner.getPriorityPlacementFormationStartupAuthority(NOW + 500);
  t.equal(
    requestedNodeIds[requestedNodeIds.length - 1],
    'seed',
    'join barrier reads the seed/global identity rather than its target node',
  );
  t.end();
});

test('the seed rebalancer read is the authoritative handoff observation ' +
  'path and retains the cure after spread reopens', async (t) => {
  const rows = buildFormationRows();
  let currentAuthority = buildAuthority();
  const cache = {
    getAll(tableName) {
      return tableName === 'nodes' ? rows : [];
    },
    get() {
      return null;
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    onCacheChange() {},
  };
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed',
    systemTableCache: cache,
    messageRouter: buildMessageRouter(() => rows),
    membershipPublicationService: {
      controlPlanePublicationsOwner:
        buildFormationPublicationStorageOwner(),
    },
    now: () => NOW,
  });
  service.getPriorityRecoveryPlanningAnswerSync = () => ({});
  service.buildStartupAuthoritySnapshotFromPlanningAnswer = () =>
    currentAuthority;
  const transitions = [];
  service.logger = {
    info(message, details) {
      transitions.push({message, details});
    },
  };

  const captured = service.getStartupAuthoritySnapshotSync('seed', NOW);
  t.equal(captured.formationReleaseHandoff.releaseAuthorized, false);
  await service.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const satisfied = service.getStartupAuthoritySnapshotSync('seed', NOW + 1);
  t.equal(
    satisfied.formationReleaseHandoff.releaseAuthorized,
    true,
    'ordinary seed/rebalancer reads capture the satisfied generation',
  );
  currentAuthority = buildAuthority({ready: false, satisfied: false});
  const reopened = service.getStartupAuthoritySnapshotSync('seed', NOW + 500);
  t.equal(reopened.ready, true);
  t.equal(
    reopened.formationReleaseHandoff.generation,
    satisfied.formationReleaseHandoff.generation,
  );
  t.same(
    reopened.formationReleaseHandoff.pendingNodeIds,
    ['joiner-a', 'joiner-b'],
  );
  t.equal(transitions.length, 3,
    'the seed logs capture, durable acknowledgement, and retained reopen');
  t.equal(transitions[0].details.releaseAuthorized, false,
    'capture is non-authorizing before durable acknowledgement');
  t.equal(transitions[1].details.observedAuthorityReady, true);
  t.equal(transitions[1].details.releaseAuthorized, true,
    'durable readback rearms the canonical owner as authorizing');
  t.equal(transitions[2].details.observedAuthorityReady, false);
  t.equal(transitions[2].details.releaseAuthorized, true);
  t.end();
});

test('formation barrier consumes the seed-owned durable contract on a distinct ' +
  'joiner process after spread reopens', async (t) => {
  const rows = buildFormationRows();
  const localPending = buildAuthority({ready: false, satisfied: false});
  const ownerReady = buildAuthority();
  let durablePublicationRow = null;
  const storageOwner = {
    async upsertPublication(row) {
      durablePublicationRow = row;
      return row;
    },
    async getPublication() {
      return durablePublicationRow;
    },
  };
  const cache = {
    getAll(tableName) {
      return tableName === 'nodes' ? rows : [];
    },
    get() {
      return null;
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    onCacheChange() {},
  };
  const seedService = new ControlPlaneReadinessService({
    nodeId: 'seed',
    formationReleaseAuthorityNodeId: 'seed',
    systemTableCache: cache,
    messageRouter: buildMessageRouter(() => rows),
    membershipPublicationService: {
      controlPlanePublicationsOwner: storageOwner,
    },
    now: () => NOW,
  });
  seedService.getPriorityRecoveryPlanningAnswerSync = () => ({
    authority: ownerReady,
  });
  seedService.buildStartupAuthoritySnapshotFromPlanningAnswer = (answer) =>
    answer.authority;
  const seedCapture = seedService.getStartupAuthoritySnapshotSync('seed', NOW);
  t.equal(seedCapture.formationReleaseHandoff.releaseAuthorized, false,
    'capture remains non-authorizing until durable acknowledgement');
  await seedService.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const seedAcknowledged =
    seedService.getStartupAuthoritySnapshotSync('seed', NOW + 1);
  t.equal(
    seedAcknowledged.formationReleaseHandoff.releaseAuthorized,
    true,
  );
  t.ok(durablePublicationRow,
    'the seed interaction owner publishes its captured generation durably');

  const service = new ControlPlaneReadinessService({
    nodeId: 'joiner-a',
    formationReleaseAuthorityNodeId: 'seed',
    systemTableCache: cache,
    messageRouter: buildMessageRouter(() => rows, 'joiner-a'),
    membershipPublicationService: {
      controlPlanePublicationsOwner: storageOwner,
    },
    now: () => NOW,
  });
  service.getPriorityRecoveryPlanningAnswerSync = () => ({
    authority: localPending,
  });
  service.getPriorityRecoveryPlanningAnswerForOwnerRead = async () => ({
    authority: localPending,
  });
  service.buildStartupAuthoritySnapshotFromPlanningAnswer = (answer) =>
    answer.authority;

  t.equal(
    service.getStartupAuthoritySnapshotSync('seed', NOW).ready,
    false,
    'fixture proves the local projection is still stale-negative',
  );
  const joiningOwner = Object.create(
    NodeJoiningReadySignalReadiness.prototype,
  );
  joiningOwner.nodeId = 'joiner-a';
  joiningOwner.seedNodeId = 'seed';
  joiningOwner.rebalanceCoordinator = {
    controlPlaneReadinessService: service,
  };
  const authoritative =
    await joiningOwner.getPriorityPlacementFormationStartupAuthority(NOW);
  t.equal(authoritative.ready, true,
    'the durable owner contract bridges the non-monotone spread reopen');
  t.equal(
    authoritative.formationReleaseHandoff.releaseAuthorized,
    true,
    'the non-seed consumes the seed generation without locally minting it',
  );
  t.equal(
    authoritative.formationReleaseHandoff.generation,
    seedCapture.formationReleaseHandoff.generation,
  );
  t.equal(
    service.formationReleaseHandoffClosureOwner.lastContract.state,
    FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'the joiner local owner remains idle and cannot become parallel authority',
  );
  t.end();
});

test('a restarted seed rehydrates its one durable active generation during a ' +
  'spread reopen and rejects a generation from a prior peer boot', (t) => {
  const rows = buildFormationRows();
  const authorityNodeId = 'seed';
  const captured = new FormationReleaseHandoffClosureOwner().observe(
    buildAuthority(),
    rows,
    NOW,
    authorityNodeId,
    buildConnectionEvidence(rows),
  );
  const durableRow = buildFormationReleaseHandoffPublicationRow(captured, NOW);
  const cache = {
    getAll(tableName) {
      return tableName === 'nodes' ? rows : [];
    },
    get(tableName) {
      return tableName === 'control_plane_publications' ? durableRow : null;
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    onCacheChange() {},
  };
  const reopenedAuthority = buildAuthority({ready: false, satisfied: false});
  const restarted = new ControlPlaneReadinessService({
    nodeId: 'seed',
    formationReleaseAuthorityNodeId: 'seed',
    systemTableCache: cache,
    messageRouter: buildMessageRouter(() => rows),
    now: () => NOW + 1_000,
  });
  restarted.getPriorityRecoveryPlanningAnswerSync = () => ({
    authority: reopenedAuthority,
  });
  restarted.buildStartupAuthoritySnapshotFromPlanningAnswer = (answer) =>
    answer.authority;
  const restored = restarted.getStartupAuthoritySnapshotSync(
    'seed',
    NOW + 1_000,
  );
  t.equal(restored.ready, true);
  t.equal(restored.formationReleaseHandoff.generation, captured.generation,
    'restart resumes the seed-owned durable generation without rotation');

  const changedRouter = buildMessageRouter(() => rows);
  const getCurrent =
    changedRouter.getCurrentPrimaryConnectionBootIncarnation.bind(
      changedRouter,
    );
  changedRouter.getCurrentPrimaryConnectionBootIncarnation = (nodeId) =>
    nodeId === 'joiner-b' ? {
      nodeId,
      bootIncarnation: 2,
      connectionId: 'primary:joiner-b:2',
    } : getCurrent(nodeId);
  const staleRestart = new ControlPlaneReadinessService({
    nodeId: 'seed',
    formationReleaseAuthorityNodeId: 'seed',
    systemTableCache: cache,
    messageRouter: changedRouter,
    now: () => NOW + 1_000,
  });
  staleRestart.getPriorityRecoveryPlanningAnswerSync = () => ({
    authority: reopenedAuthority,
  });
  staleRestart.buildStartupAuthoritySnapshotFromPlanningAnswer = (answer) =>
    answer.authority;
  const rejected = staleRestart.getStartupAuthoritySnapshotSync(
    'seed',
    NOW + 1_000,
  );
  t.equal(rejected.ready, false);
  t.equal(rejected.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'a restarted peer process cannot inherit the old boot generation');
  t.end();
});

test('formation release handoff revokes on incarnation, membership, and ' +
  'substantive authority changes', async (t) => {
  const expandedOwner = new FormationReleaseHandoffClosureOwner();
  const captured = observeFormation(expandedOwner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    buildFormationRows(),
    NOW,
  );
  const expanded = observeFormation(expandedOwner,
    buildAuthority(),
    buildFormationRows(),
    NOW + 100,
  );
  t.equal(
    expanded.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'canonical membership expansion under one authority incarnation is ' +
      'formation progress and must not revoke the retained generation',
  );
  t.equal(
    expanded.generation,
    captured.generation,
    'a compatible canonical superset retains the same generation identity',
  );

  const incompleteOwner = new FormationReleaseHandoffClosureOwner();
  const incomplete = observeFormation(incompleteOwner,
    buildAuthority(),
    buildFormationRows().filter((row) => row.node_id !== 'joiner-b'),
    NOW,
  );
  t.equal(incomplete.state, FORMATION_RELEASE_HANDOFF_STATE.IDLE);
  t.equal(incomplete.generation, null,
    'an incomplete canonical row set cannot mint a partial cohort generation');

  const incarnationOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(
    incarnationOwner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const incarnationChanged = observeFormation(incarnationOwner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows({
      joinerB: buildNode('joiner-b', {bootIncarnation: 2}),
    }),
    NOW + 500,
    buildConnectionEvidence(buildFormationRows()),
  );
  t.equal(incarnationChanged.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(incarnationChanged.reason, 'captured_cohort_incarnation_changed');

  const disconnectedOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(
    disconnectedOwner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const disconnected = observeFormation(disconnectedOwner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows({
      joinerB: buildNode('joiner-b', {connectionState: 'disconnected'}),
    }),
    NOW + 500,
  );
  t.equal(disconnected.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(disconnected.reason, 'captured_cohort_member_ineligible');

  const blockedOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(blockedOwner, buildAuthority(), buildFormationRows(), NOW);
  const blocked = observeFormation(blockedOwner,
    buildAuthority({
      ready: false,
      state: 'blocked',
      satisfied: false,
      reasonCodes: ['control_plane_not_writable'],
    }),
    buildFormationRows(),
    NOW + 500,
  );
  t.equal(blocked.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(blocked.reason, 'startup_authority_incompatible');

  const rotated = observeFormation(blockedOwner,
    buildAuthority({publicationEpoch: 42}),
    buildFormationRows(),
    NOW + 1_000,
  );
  t.equal(rotated.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.not(rotated.generation, blocked.generation,
    'a fresh compatible publication rotates a revoked generation');
  t.end();
});

test('first satisfaction binds the adopted primary incarnation before its ' +
  'durable node row catches up and never rotates on confirmation', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const zeroRows = buildFormationRows({
    joinerA: buildNode('joiner-a', {bootIncarnation: 0}),
    joinerB: buildNode('joiner-b', {bootIncarnation: 0}),
  });
  const currentConnections = [
    {
      nodeId: 'joiner-a',
      bootIncarnation: 3,
      connectionId: 'primary:joiner-a:3',
    },
    {
      nodeId: 'joiner-b',
      bootIncarnation: 5,
      connectionId: 'primary:joiner-b:5',
    },
    {
      nodeId: 'seed',
      bootIncarnation: 1,
      connectionId: 'local:seed:1',
    },
  ];
  const captured = observeFormation(
    owner,
    buildAuthority(),
    zeroRows,
    NOW,
    currentConnections,
  );
  t.equal(captured.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.same(captured.requiredCohort, [
    {nodeId: 'joiner-a', bootIncarnation: 3},
    {nodeId: 'joiner-b', bootIncarnation: 5},
  ]);
  t.equal(captured.generation, formationReleaseGenerationIdentity(
    41,
    'seed',
    1,
    captured.requiredCohort,
  ), 'zero is never a captured authority identity');

  const confirmed = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    buildFormationRows({
      joinerA: buildNode('joiner-a', {bootIncarnation: 3}),
      joinerB: buildNode('joiner-b', {bootIncarnation: 5}),
    }),
    NOW + 100,
    currentConnections,
  );
  t.equal(confirmed.generation, captured.generation,
    'durable confirmation cannot rotate the first-satisfaction generation');

  const absentConnectionOwner = new FormationReleaseHandoffClosureOwner();
  const absentConnection = observeFormation(
    absentConnectionOwner,
    buildAuthority(),
    zeroRows,
    NOW,
    currentConnections.slice(0, 1),
  );
  t.equal(absentConnection.state, FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'a node-id-only provisional cohort is non-authorizing');

  const restarted = observeFormation(
    owner,
    buildAuthority({ready: false, satisfied: false}),
    zeroRows,
    NOW + 200,
    [
      currentConnections[0],
      {
        nodeId: 'joiner-b',
        bootIncarnation: 6,
        connectionId: 'primary:joiner-b:6',
      },
      currentConnections[2],
    ],
  );
  t.equal(restarted.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.equal(restarted.reason, 'captured_cohort_member_ineligible',
    'a new primary process cannot inherit the prior boot spread witness');
  t.end();
});

test('durable handoff publication binds the exact generation and rejects ' +
  'forged identity or row metadata', (t) => {
  const contract = observeFormation(
    new FormationReleaseHandoffClosureOwner(),
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  const row = buildFormationReleaseHandoffPublicationRow(contract, NOW);
  t.ok(row, 'the active owner contract has one durable row representation');
  t.equal(
    readFormationReleaseHandoffPublicationRow(row, 'seed', 1)
      .generation,
    contract.generation,
  );
  t.not(
    formationReleaseHandoffPublicationId('seed', 1),
    formationReleaseHandoffPublicationId('seed', 2),
    'a restarted authority process writes a disjoint durable key',
  );
  t.equal(
    readFormationReleaseHandoffPublicationRow(row, 'seed', 2),
    FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
    'a prior authority boot cannot authorize the current seed process',
  );
  const forgedRows = [
    {...row, status: 'PUBLISHED'},
    {...row, reason_code: 'forged'},
    {...row, published_active_node_ids: ['seed']},
    {...row, required_ack_node_ids: ['joiner-a']},
    {...row, acknowledged_node_ids: ['joiner-a']},
    {...row, published_at: NOW},
    {...row, closed_at: NOW},
    {...row, priority_partition_summary: {satisfied: true}},
    {...row, transition_history: []},
  ];
  for (let index = 0; index < forgedRows.length; index += 1) {
    t.equal(
      readFormationReleaseHandoffPublicationRow(
        forgedRows[index],
        'seed',
        1,
      ),
      FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
      `redundant row projection ${index} is fail-closed`,
    );
  }
  t.equal(
    readFormationReleaseHandoffPublicationRow(
      {...row, publication_epoch: row.publication_epoch + 1},
      'seed',
      1,
    ),
    FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
    'row metadata cannot disagree with the embedded owner contract',
  );
  t.equal(
    normalizeFormationReleaseHandoffContract({
      ...contract,
      generation: '41:seed@1:joiner-a@0,joiner-b@1',
      requiredCohort: [
        {nodeId: 'joiner-a', bootIncarnation: 0},
        {nodeId: 'joiner-b', bootIncarnation: 1},
      ],
    }),
    null,
    'zero/provisional incarnation identity is never durable authority',
  );
  const impossibleStateReason = {
    ...contract,
    reason: 'captured_cohort_ready',
  };
  t.equal(
    normalizeFormationReleaseHandoffContract(impossibleStateReason),
    null,
    'state and reason are one canonical grammar, not independent labels',
  );
  t.equal(
    buildFormationReleaseHandoffPublicationRow(impossibleStateReason, NOW),
    FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
    'redundant row fields cannot legitimize an impossible owner state',
  );

  let getterCalls = 0;
  const accessorContract = {...contract};
  Object.defineProperty(accessorContract, 'generation', {
    get() {
      getterCalls += 1;
      return contract.generation;
    },
  });
  t.equal(normalizeFormationReleaseHandoffContract(accessorContract), null);
  t.equal(getterCalls, 0,
    'publication normalization does not invoke authority accessors');
  t.end();
});

test('formation publication coordinator is single-flight, retains only the ' +
  'latest desired state, acknowledges readback, and shuts down bounded',
async (t) => {
  const contract = observeFormation(
    new FormationReleaseHandoffClosureOwner(),
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let durableRow = null;
  let writeCount = 0;
  const durableGenerations = [];
  const coordinator = new FormationReleaseHandoffPublicationCoordinator({
    getStorageOwner: () => ({
      async upsertPublication(row) {
        writeCount += 1;
        if (writeCount === 1) await firstGate;
        durableRow = row;
      },
      async getPublication() {
        return durableRow;
      },
    }),
    onDurable: (durable) => {
      durableGenerations.push(durable.observedPublicationEpoch);
    },
  });
  coordinator.offer(contract, NOW);
  for (let index = 1; index <= 100; index += 1) {
    coordinator.offer({
      ...contract,
      observedPublicationEpoch:
        contract.observedPublicationEpoch + index,
    }, NOW + index);
  }
  t.equal(coordinator.getDiagnostics().retainedRequestCount, 2,
    'one in-flight plus one latest desired record is the hard bound');
  releaseFirst();
  await coordinator.whenIdle();
  t.equal(writeCount, 2,
    'intermediate observations are coalesced instead of queued');
  t.same(durableGenerations, [41, 141]);
  t.equal(coordinator.getDiagnostics().coalescedCount, 99);

  let mismatchedDurableCalls = 0;
  let ignoredRow = null;
  const mismatchedCoordinator =
    new FormationReleaseHandoffPublicationCoordinator({
      getStorageOwner: () => ({
        async upsertPublication(row) {
          ignoredRow = row;
        },
        async getPublication() {
          return buildFormationReleaseHandoffPublicationRow({
            ...contract,
            fenceIdentity: 'different-fence',
            canonicalNodeIds: [...contract.canonicalNodeIds, 'extra-node'],
          }, NOW);
        },
      }),
      onDurable: () => {
        mismatchedDurableCalls += 1;
      },
    });
  mismatchedCoordinator.offer({...contract, fenceIdentity: 'desired-fence'}, NOW);
  await mismatchedCoordinator.whenIdle();
  t.ok(ignoredRow, 'the fixture proves a desired row was offered');
  t.equal(mismatchedDurableCalls, 0,
    'different durable fence/membership cannot acknowledge local release');
  t.equal(mismatchedCoordinator.getDiagnostics().writeFailureCount, 1);

  let collisionDurableCalls = 0;
  const desiredCanonicalNodeIds = [
    ...contract.canonicalNodeIds,
    'x,y',
    'z',
  ];
  const durableCanonicalNodeIds = [
    ...contract.canonicalNodeIds,
    'x',
    'y,z',
  ];
  const collisionCoordinator =
    new FormationReleaseHandoffPublicationCoordinator({
      getStorageOwner: () => ({
        async upsertPublication() {},
        async getPublication() {
          return buildFormationReleaseHandoffPublicationRow({
            ...contract,
            canonicalNodeIds: durableCanonicalNodeIds,
          }, NOW);
        },
      }),
      onDurable: () => {
        collisionDurableCalls += 1;
      },
    });
  collisionCoordinator.offer({
    ...contract,
    canonicalNodeIds: desiredCanonicalNodeIds,
  }, NOW);
  await collisionCoordinator.whenIdle();
  t.equal(collisionDurableCalls, 0,
    'delimiter-bearing distinct memberships cannot collide at readback');
  t.equal(collisionCoordinator.getDiagnostics().writeFailureCount, 1);
  t.not(
    formationReleaseGenerationIdentity(41, 'seed', 1, [
      {nodeId: 'x,y', bootIncarnation: 7},
      {nodeId: 'z', bootIncarnation: 9},
    ]),
    formationReleaseGenerationIdentity(41, 'seed', 1, [
      {nodeId: 'x', bootIncarnation: 7},
      {nodeId: 'y,z', bootIncarnation: 9},
    ]),
    'generation identity is injective for delimiter-bearing cohort members',
  );

  let releaseShutdown;
  const shutdownGate = new Promise((resolve) => {
    releaseShutdown = resolve;
  });
  let shutdownWrites = 0;
  let shutdownDurableCalls = 0;
  let shutdownRearmCalls = 0;
  const shutdownCoordinator =
    new FormationReleaseHandoffPublicationCoordinator({
      getStorageOwner: () => ({
        async upsertPublication(row) {
          shutdownWrites += 1;
          await shutdownGate;
          durableRow = row;
        },
        async getPublication() {
          return durableRow;
        },
      }),
      onDurable: () => {
        shutdownDurableCalls += 1;
      },
      onRearm: () => {
        shutdownRearmCalls += 1;
      },
    });
  shutdownCoordinator.offer(contract, NOW);
  shutdownCoordinator.offer({
    ...contract,
    observedPublicationEpoch: 42,
  }, NOW + 1);
  shutdownCoordinator.shutdown();
  t.equal(shutdownCoordinator.getDiagnostics().retainedRequestCount, 1,
    'shutdown discards the one pending desired record');
  releaseShutdown();
  await shutdownCoordinator.whenIdle();
  t.equal(shutdownWrites, 1);
  t.equal(shutdownCoordinator.getDiagnostics().retainedRequestCount, 0);
  t.equal(shutdownDurableCalls, 0,
    'an in-flight write cannot acknowledge a stopped interaction owner');
  t.equal(shutdownRearmCalls, 0,
    'an in-flight write cannot rearm readiness after shutdown');
  t.end();
});

test('formation release boundary rejects inherited and accessor authority ' +
  'and cohort evidence without invoking getters', async (t) => {
  let getterCalls = 0;
  const inheritedAuthority = Object.create(buildAuthority());
  const inheritedOwner = new FormationReleaseHandoffClosureOwner();
  t.equal(
    observeFormation(
      inheritedOwner,
      inheritedAuthority,
      buildFormationRows(),
      NOW,
    ).active,
    false,
  );

  const accessorAuthority = {};
  Object.defineProperty(accessorAuthority, 'ready', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  const accessorOwner = new FormationReleaseHandoffClosureOwner();
  t.equal(
    observeFormation(
      accessorOwner,
      accessorAuthority,
      buildFormationRows(),
      NOW,
    ).active,
    false,
  );

  const accessorRow = {
    node_id: 'joiner-b',
    status: 'joining',
    connection_state: 'connected',
    ready_lease_expires_at: null,
  };
  Object.defineProperty(accessorRow, 'boot_incarnation', {
    configurable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const rowOwner = new FormationReleaseHandoffClosureOwner();
  t.equal(
    observeFormation(rowOwner,
      buildAuthority(),
      buildFormationRows({joinerB: accessorRow}),
      NOW,
    ).active,
    false,
  );
  t.equal(getterCalls, 0, 'boundary never invokes hostile accessors');
  t.end();
});

test('formation release owner is stable under post-import mutable intrinsic ' +
  'replacement', async (t) => {
  const originals = {
    arrayIncludes: Array.prototype.includes,
    arrayJoin: Array.prototype.join,
    arrayPush: Array.prototype.push,
    arraySlice: Array.prototype.slice,
    arraySort: Array.prototype.sort,
    arrayIterator: Array.prototype[Symbol.iterator],
    mapGet: Map.prototype.get,
    mapSet: Map.prototype.set,
    stringLower: String.prototype.toLowerCase,
  };
  const rows = buildFormationRows();
  const authority = buildAuthority();
  const connectionEvidence = buildConnectionEvidence(rows);
  let contract;
  try {
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.includes = () => false;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.join = () => 'forged';
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.push = () => 0;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.slice = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.sort = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype[Symbol.iterator] = function* emptyArrayIterator() {};
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Map.prototype.get = () => null;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Map.prototype.set = () => new Map();
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    String.prototype.toLowerCase = () => 'disconnected';
    contract = new FormationReleaseHandoffClosureOwner().observe(
      authority,
      rows,
      NOW,
      'seed',
      connectionEvidence,
    );
  } finally {
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.includes = originals.arrayIncludes;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.join = originals.arrayJoin;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.push = originals.arrayPush;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.slice = originals.arraySlice;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype.sort = originals.arraySort;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Array.prototype[Symbol.iterator] = originals.arrayIterator;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Map.prototype.get = originals.mapGet;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    Map.prototype.set = originals.mapSet;
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
    String.prototype.toLowerCase = originals.stringLower;
  }
  t.equal(contract.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.same(contract.pendingNodeIds, ['joiner-a', 'joiner-b']);
  t.end();
});

test('formation release handoff retains one generation across canonical ' +
  'cohort growth under one authority incarnation', async (t) => {
  // Live-falsified contract (GCP run 2026-08-28T06-02-59Z): a JOINING member
  // admitted under the SAME cluster/authority incarnation grows the canonical
  // startup cohort. That growth is formation progress, not an authority
  // identity change, so the retained generation must survive 1 -> 2 -> 3 -> 4.
  const owner = new FormationReleaseHandoffClosureOwner();
  const captured = observeFormation(owner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    buildFormationRows(),
    NOW,
  );
  t.equal(captured.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const generation = captured.generation;

  const growTo = (canonicalNodeIds, at) => observeFormation(owner,
    buildAuthority({canonicalNodeIds}),
    buildFormationRows(),
    at,
  );
  const two = growTo(['joiner-a', 'joiner-b', 'seed'], NOW + 100);
  t.equal(two.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE, 'growth +1 retains');
  t.equal(two.generation, generation, 'same generation after first growth');

  const three = growTo(['joiner-a', 'joiner-b', 'joiner-c', 'seed'], NOW + 200);
  t.equal(three.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE, 'growth +2 retains');
  t.equal(three.generation, generation, 'same generation after second growth');

  const four = growTo(
    ['joiner-a', 'joiner-b', 'joiner-c', 'joiner-d', 'seed'],
    NOW + 300,
  );
  t.equal(four.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE, 'growth +3 retains');
  t.equal(four.generation, generation, 'same generation after third growth');
  t.end();
});

test('formation release handoff still fences genuine authority identity ' +
  'changes during the retained window', async (t) => {
  // Negative witnesses at the same boundary: growth is allowed, but a genuine
  // authority-identity change must still invalidate the generation.
  const epochOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(epochOwner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    buildFormationRows(),
    NOW,
  );
  const regressed = observeFormation(epochOwner,
    buildAuthority({
      canonicalNodeIds: ['joiner-a', 'joiner-b', 'seed'],
      publicationEpoch: 40,
    }),
    buildFormationRows(),
    NOW + 100,
  );
  t.equal(regressed.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'a publication-epoch regression still invalidates');
  t.equal(regressed.reason, 'startup_authority_incompatible');

  const fenceOwner = new FormationReleaseHandoffClosureOwner();
  observeFormation(fenceOwner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    buildFormationRows(),
    NOW,
  );
  const changedFenceAuthority = buildAuthority({
    canonicalNodeIds: ['joiner-a', 'joiner-b', 'seed'],
  });
  const changedFence = Object.freeze({
    ...changedFenceAuthority,
    admission: Object.freeze({
      state: 'admitted',
      admitted: true,
      reasonCodes: Object.freeze([]),
      clusterIncarnationFence: Object.freeze({
        allowed: true,
        state: 'mismatched',
        localIdentityState: 'matched',
        durableMembershipState: 'present',
        peerProofState: 'confirmed',
      }),
    }),
  });
  const fenceChanged = observeFormation(fenceOwner,
    changedFence,
    buildFormationRows(),
    NOW + 100,
  );
  t.equal(fenceChanged.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'a cluster-incarnation-fence change still invalidates');
  t.equal(fenceChanged.reason, 'startup_authority_incompatible');

  const shrinkOwner = new FormationReleaseHandoffClosureOwner();
  const shrunkCapture = observeFormation(shrinkOwner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  t.equal(shrunkCapture.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  const shrunk = observeFormation(shrinkOwner,
    buildAuthority({canonicalNodeIds: ['joiner-a', 'seed']}),
    buildFormationRows(),
    NOW + 100,
  );
  t.equal(shrunk.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'a captured member dropping out of the canonical set still invalidates');
  t.end();
});

test('formation release handoff retains one generation across a transient ' +
  'blocked recovery under one authority incarnation', async (t) => {
  // Live-falsified contract (GCP run 2026-08-28T06-31-31Z): a Category A
  // formation MOVE_REPLICA transiently drives the startup authority into
  // BLOCKED (projection active gate blocked, EMPTY recoveryReasonCodes,
  // spread pending) under the SAME cluster/authority incarnation and epoch.
  // The decision-table invariant non-monotone-spread-safe requires the
  // durably-captured generation to survive this compatible reopen. Capture is
  // gated on READY; retention must be monotonic wrt compatible transient
  // recovery, revoking only on hard identity invalidators.
  const owner = new FormationReleaseHandoffClosureOwner();
  const captured = observeFormation(owner,
    buildAuthority(),
    buildFormationRows(),
    NOW,
  );
  t.equal(captured.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(captured.releaseAuthorized, true);
  const generation = captured.generation;

  // Transient BLOCKED: empty recovery codes, spread pending, same incarnation.
  const blocked = observeFormation(owner,
    buildAuthority({
      ready: false,
      state: 'blocked',
      satisfied: false,
      reasonCodes: [],
    }),
    buildFormationRows(),
    NOW + 500,
  );
  t.equal(
    blocked.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'a transient blocked recovery under one authority incarnation is a ' +
      'compatible reopen and must not revoke the captured generation',
  );
  t.equal(blocked.generation, generation, 'same generation retained');
  t.equal(blocked.releaseAuthorized, true,
    'the retained generation keeps whole-plane release open');

  // Recovery completes back to READY: still the same generation.
  const recovered = observeFormation(owner,
    buildAuthority(),
    buildFormationRows(),
    NOW + 1_000,
  );
  t.equal(recovered.generation, generation,
    'recovery completing back to READY keeps the same generation');
  t.not(recovered.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  t.end();
});

test('formation release handoff distinguishes transient blocked recovery ' +
  'from a substantive authority block', async (t) => {
  // A substantive authority block (genuine non-formation control-plane
  // failure) must still revoke; only the compatible transient form retains.
  const owner = new FormationReleaseHandoffClosureOwner();
  observeFormation(owner, buildAuthority(), buildFormationRows(), NOW);
  const substantive = observeFormation(owner,
    buildAuthority({
      ready: false,
      state: 'blocked',
      satisfied: false,
      reasonCodes: ['control_plane_not_writable'],
    }),
    buildFormationRows(),
    NOW + 500,
  );
  t.equal(substantive.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'a substantive authority block still invalidates the generation');
  t.equal(substantive.reason, 'startup_authority_incompatible');
  t.end();
});

test('authority evidence uses an explicit typed outcome that the boundary ' +
  'distinguishes (present vs absent vs invalid)', (t) => {
  const outcomes = [
    buildAuthorityEvidence(buildAuthority()).outcome,
    buildAuthorityEvidence(null).outcome,
    buildAuthorityEvidence({ready: 'not-a-boolean'}).outcome,
  ];
  t.same(outcomes, [
    EVIDENCE_OUTCOME.PRESENT,
    EVIDENCE_OUTCOME.ABSENT,
    EVIDENCE_OUTCOME.INVALID,
  ], 'usable/missing/malformed authority map to distinct explicit outcomes');
  const observed = new FormationReleaseHandoffClosureOwner().observe(
    null, buildFormationRows(), NOW, 'seed',
    buildConnectionEvidence(buildFormationRows()),
  );
  t.equal(observed.state, FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    'the absent evidence outcome keeps an uncaptured owner idle (no capture)');
  t.end();
});

test('publication identity uses an explicit none token that consumers ' +
  'distinguish from a derivable identity', (t) => {
  const derived = formationReleaseHandoffPublicationId('seed', 1);
  t.equal(derived, 'formation-release-handoff:seed:1',
    'a valid authority identity derives its durable publication id');
  t.not(derived, 'none', 'a derivable identity is never the none token');
  t.equal(formationReleaseHandoffPublicationId('', 1), 'none',
    'an empty authority node id yields the explicit none identity token');
  t.equal(formationReleaseHandoffPublicationId('seed', 0), 'none');
  t.end();
});
