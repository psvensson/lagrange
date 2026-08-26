import {test} from '../../src/test-helpers/tap.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  FormationReleaseHandoffClosureOwner,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  authorizeFormationReleaseHandoffPublicationIntent,
  normalizeFormationReleaseHandoffContract,
} from
  '../../src/control-plane/formation-release-handoff-contract.js';
import {installControlPlaneReadinessFormationReleaseMethods} from
  '../../src/control-plane/control-plane-readiness-formation-release-methods.js';
import {formationReleaseContractsEqual} from
  '../../src/control-plane/formation-release-handoff-identity.js';
import {isStartupAuthorityProjectionSynchronization} from
  '../../src/control-plane/startup-authority-snapshot-owner.js';

const NOW = 10_000;

function buildAuthority({
  ready = true,
  satisfied = ready,
  reasonCodes = ready ? [] : ['priority_partitions_not_spread'],
  publicationEpoch = 41,
  peerProofState = 'confirmed',
} = {}) {
  return Object.freeze({
    state: ready ? 'ready' : 'recovery_pending',
    ready,
    authorityAvailable: true,
    publicationEpoch,
    publicationStatus: 'PUBLISHED',
    priorityPartitionSummary: Object.freeze({satisfied}),
    priorityRecoveryReasonCodes: Object.freeze([...reasonCodes]),
    canonicalStartupNodeIds: Object.freeze(['joiner-a', 'joiner-b', 'seed']),
    admission: Object.freeze({
      state: 'admitted',
      admitted: true,
      reasonCodes: Object.freeze([]),
      clusterIncarnationFence: Object.freeze({
        allowed: true,
        state: 'matched',
        localIdentityState: 'matched',
        durableMembershipState: 'present',
        peerProofState,
      }),
    }),
  });
}

function buildNode(nodeId, {
  status = 'joining',
  connectionState = 'connected',
  readyLeaseExpiresAt = null,
} = {}) {
  return Object.freeze({
    node_id: nodeId,
    status,
    connection_state: connectionState,
    boot_incarnation: 1,
    ready_lease_expires_at: readyLeaseExpiresAt,
  });
}

function buildRows({allReady = false} = {}) {
  const options = allReady ? {
    status: 'active',
    connectionState: 'ready',
    readyLeaseExpiresAt: NOW + 60_000,
  } : {};
  return [
    buildNode('seed', {
      status: 'active',
      connectionState: 'ready',
      readyLeaseExpiresAt: NOW + 60_000,
    }),
    buildNode('joiner-a', options),
    buildNode('joiner-b', options),
  ];
}

function buildConnections(rows) {
  return rows.map((row) => ({
    nodeId: row.node_id,
    bootIncarnation: 1,
    connectionId: `connection:${row.node_id}:1`,
  }));
}

function observe(owner, authority, rows, observedAt) {
  const contract = owner.observe(
    authority,
    rows,
    observedAt,
    'seed',
    buildConnections(rows),
  );
  const intent = owner.publicationIntent();
  return intent?.generation ? owner.acknowledgePublication(
    authorizeFormationReleaseHandoffPublicationIntent(intent),
  ) : contract;
}

function buildProjectionSynchronization() {
  return buildAuthority({
    ready: false,
    satisfied: true,
    reasonCodes: ['publication_epoch_pending'],
    publicationEpoch: 42,
  });
}

function buildCompoundProjectionSynchronization() {
  return buildAuthority({
    ready: false,
    satisfied: false,
    reasonCodes: [
      'publication_epoch_pending',
      'priority_partitions_not_spread',
    ],
    publicationEpoch: 42,
  });
}

test('exact compound publication projection synchronization retains the ' +
  'restricted generation without becoming a reopen', (t) => {
  const owner = new FormationReleaseHandoffClosureOwner();
  const rows = buildRows();
  const captured = observe(owner, buildAuthority(), rows, NOW);
  const retained = observe(
    owner,
    buildCompoundProjectionSynchronization(),
    rows,
    NOW + 100,
  );

  t.equal(retained.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(retained.generation, captured.generation,
    'projection synchronization cannot rotate the captured generation');
  t.equal(retained.releaseAuthorized, true,
    'the already durable restricted release remains available');
  t.equal(owner.reopenObserved, false,
    'publication synchronization is not a spread reopen');

  const allReadyRows = buildRows({allReady: true});
  const waiting = observe(
    owner,
    buildCompoundProjectionSynchronization(),
    allReadyRows,
    NOW + 200,
  );
  t.equal(waiting.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'all-ready alone cannot bypass the mandatory real reopen edge');
  const reopen = buildAuthority({
    ready: false,
    satisfied: false,
    publicationEpoch: 42,
  });
  t.equal(
    observe(owner, reopen, allReadyRows, NOW + 300).state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    'the first reopen observation must be durably acknowledged',
  );
  t.equal(
    observe(owner, reopen, allReadyRows, NOW + 400).state,
    FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
  );
  t.end();
});

test('compound synchronization grammar is exact, own, and noncoercive', (t) => {
  const exact = {
    ready: false,
    state: 'recovery_pending',
    prioritySpreadSatisfied: false,
    recoveryReasonCodes: [
      'publication_epoch_pending',
      'priority_partitions_not_spread',
    ],
  };
  t.equal(isStartupAuthorityProjectionSynchronization(exact), true);
  const malformedReasonLists = [
    ['priority_partitions_not_spread', 'publication_epoch_pending'],
    ['publication_epoch_pending'],
    ['publication_epoch_pending', 'publication_epoch_pending'],
    [
      'publication_epoch_pending',
      'priority_partitions_not_spread',
      'unknown_reason',
    ],
    ['publication_epoch_pending', 'unknown_reason'],
  ];
  for (let index = 0; index < malformedReasonLists.length; index += 1) {
    t.equal(isStartupAuthorityProjectionSynchronization({
      ...exact,
      recoveryReasonCodes: malformedReasonLists[index],
    }), false, `malformed reason grammar ${index} rejects`);
    const owner = new FormationReleaseHandoffClosureOwner();
    observe(owner, buildAuthority(), buildRows(), NOW);
    const rejected = observe(owner, buildAuthority({
      ready: false,
      satisfied: false,
      reasonCodes: malformedReasonLists[index],
      publicationEpoch: 42,
    }), buildRows(), NOW + 100);
    t.equal(rejected.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
      `malformed reason grammar ${index} revokes fail closed`);
  }

  let getterCalls = 0;
  const accessorReasons = new Array(2);
  Object.defineProperty(accessorReasons, '0', {
    get() {
      getterCalls += 1;
      return 'publication_epoch_pending';
    },
  });
  accessorReasons[1] = 'priority_partitions_not_spread';
  t.equal(isStartupAuthorityProjectionSynchronization({
    ...exact,
    recoveryReasonCodes: accessorReasons,
  }), false, 'accessor reason is absent, not classification authority');
  t.equal(getterCalls, 0, 'classification never invokes reason accessors');

  const inheritedReasons = new Array(2);
  inheritedReasons[1] = 'priority_partitions_not_spread';
  Object.setPrototypeOf(inheritedReasons, {
    '0': 'publication_epoch_pending',
  });
  t.equal(isStartupAuthorityProjectionSynchronization({
    ...exact,
    recoveryReasonCodes: inheritedReasons,
  }), false, 'inherited reason is absent');
  t.end();
});

test('projection synchronization retention is positive, own, and physically ' +
  'fenced', (t) => {
  const unclassifiedOwner = new FormationReleaseHandoffClosureOwner();
  observe(unclassifiedOwner, buildAuthority(), buildRows(), NOW);
  const unclassified = observe(
    unclassifiedOwner,
    buildAuthority({
      ready: false,
      satisfied: true,
      reasonCodes: ['recovery_eligibility_pending'],
      publicationEpoch: 42,
    }),
    buildRows(),
    NOW + 100,
  );
  t.equal(unclassified.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'unclassified recovery evidence remains fail-closed');

  const missingOwner = new FormationReleaseHandoffClosureOwner();
  observe(missingOwner, buildAuthority(), buildRows(), NOW);
  const missingRows = buildRows().filter(
    (row) => row.node_id !== 'joiner-a',
  );
  const missing = observe(
    missingOwner,
    buildCompoundProjectionSynchronization(),
    missingRows,
    NOW + 100,
  );
  t.equal(missing.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'the transition label cannot override physical member loss');

  let getterCalls = 0;
  const accessorOwner = new FormationReleaseHandoffClosureOwner();
  observe(accessorOwner, buildAuthority(), buildRows(), NOW);
  const accessor = Object.assign(Object.create(null), buildAuthority({
    ready: false,
    satisfied: true,
    reasonCodes: [],
    publicationEpoch: 42,
  }));
  Object.defineProperty(accessor, 'priorityRecoveryReasonCodes', {
    configurable: true,
    get() {
      getterCalls += 1;
      return ['publication_epoch_pending'];
    },
  });
  const rejectedAccessor = observe(
    accessorOwner,
    accessor,
    buildRows(),
    NOW + 100,
  );
  t.equal(getterCalls, 0, 'accessor evidence is never invoked');
  t.equal(rejectedAccessor.state, FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    'accessor-only classification cannot retain authority');
  t.end();
});

test('same-boot restore reconstructs compatible authority from the durable ' +
  'ACTIVE contract before observing projection synchronization', (t) => {
  const rows = buildRows();
  const sourceOwner = new FormationReleaseHandoffClosureOwner();
  const durableActive = observe(sourceOwner, buildAuthority(), rows, NOW);
  const restarted = new FormationReleaseHandoffClosureOwner();
  const retained = restarted.restore(
    durableActive,
    buildCompoundProjectionSynchronization(),
    rows,
    NOW + 100,
    'seed',
    buildConnections(rows),
  );
  t.equal(retained.state, FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  t.equal(retained.releaseAuthorized, true,
    'exact durable authority survives a synchronization-first restart read');
  t.equal(restarted.reopenObserved, false,
    'durable READY authority cannot fabricate the mandatory reopen');

  const missingRows = rows.filter((row) => row.node_id !== 'joiner-a');
  const unsafeRestart = new FormationReleaseHandoffClosureOwner();
  const rejected = unsafeRestart.restore(
    durableActive,
    buildProjectionSynchronization(),
    missingRows,
    NOW + 100,
    'seed',
    buildConnections(missingRows),
  );
  t.equal(rejected.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING,
    'durable replay cannot override current physical member loss');
  t.equal(
    unsafeRestart.publicationIntent().state,
    FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
  );

  const wrongFenceRestart = new FormationReleaseHandoffClosureOwner();
  const wrongFence = wrongFenceRestart.restore(
    durableActive,
    buildAuthority({
      ready: false,
      satisfied: true,
      reasonCodes: ['publication_epoch_pending'],
      publicationEpoch: 42,
      peerProofState: 'different',
    }),
    rows,
    NOW + 100,
    'seed',
    buildConnections(rows),
  );
  t.equal(wrongFence.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING,
    'a current fence mismatch still revokes after durable restore');

  const readyRows = buildRows({allReady: true});
  const reopen = buildAuthority({
    ready: false,
    satisfied: false,
    publicationEpoch: 42,
  });
  t.equal(
    observe(restarted, reopen, readyRows, NOW + 200).state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
  );
  t.equal(
    observe(restarted, reopen, readyRows, NOW + 300).state,
    FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
    'the later real reopen still owns terminal completion',
  );
  t.end();
});

test('terminal handoff logging ignores later raw startup churn without ' +
  'weakening terminal state changes', (t) => {
  const rows = buildRows();
  const owner = new FormationReleaseHandoffClosureOwner();
  observe(owner, buildAuthority(), rows, NOW);
  const reopen = buildAuthority({
    ready: false,
    satisfied: false,
    publicationEpoch: 42,
  });
  observe(owner, reopen, rows, NOW + 100);
  const readyRows = buildRows({allReady: true});
  const pending = owner.observe(
    reopen,
    readyRows,
    NOW + 200,
    'seed',
    buildConnections(readyRows),
  );
  t.equal(pending.state, FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING);

  const prototype = {};
  installControlPlaneReadinessFormationReleaseMethods(prototype);
  const logs = [];
  const readiness = Object.assign(Object.create(prototype), {
    getNodeRows: () => readyRows,
    lastFormationReleaseHandoffAuthorityLogContract: null,
    lastFormationReleaseHandoffAuthorityLogSignature: null,
    logger: {info(_message, fields) {
      logs.push(fields);
    }},
  });
  const connections = buildConnections(readyRows);
  readiness.logFormationReleaseHandoffAuthorityTransition(
    pending,
    'seed',
    reopen,
    connections,
  );
  readiness.logFormationReleaseHandoffAuthorityTransition(
    pending,
    'seed',
    buildAuthority({publicationEpoch: 99}),
    connections,
  );
  t.equal(logs.length, 1,
    'one terminal-pending contract emits once despite raw authority churn');

  const changedPending = Object.freeze({
    ...pending,
    pendingTerminalState: FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    pendingTerminalReason: 'startup_authority_incompatible',
  });
  t.equal(formationReleaseContractsEqual(pending, changedPending), false,
    'canonical equality includes the pending terminal intent');
  t.equal(normalizeFormationReleaseHandoffContract({
    ...owner.durableActiveContract,
    pendingTerminalState: FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
    pendingTerminalReason: 'startup_authority_incompatible',
  }), null, 'durable ACTIVE cannot smuggle a pending terminal intent');
  readiness.logFormationReleaseHandoffAuthorityTransition(
    changedPending,
    'seed',
    reopen,
    connections,
  );
  t.equal(logs.length, 2,
    'a changed pending terminal intent remains visible to the analyzer');

  const completed = owner.acknowledgePublication(
    authorizeFormationReleaseHandoffPublicationIntent(
      owner.publicationIntent(),
    ),
  );
  t.equal(completed.state, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  readiness.logFormationReleaseHandoffAuthorityTransition(
    completed,
    'seed',
    reopen,
    connections,
  );
  readiness.logFormationReleaseHandoffAuthorityTransition(
    completed,
    'seed',
    buildAuthority({publicationEpoch: 100}),
    connections,
  );
  t.equal(logs.length, 3,
    'the terminal state change emits once and its raw repeats stay suppressed');
  t.end();
});
