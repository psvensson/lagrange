import {test} from '../../src/test-helpers/tap.js';
import {
  FormationReleaseHandoffClosureOwner,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  authorizeFormationReleaseHandoffPublicationIntent,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {
  validateFormationReleaseHandoffSeedProjection,
} from '../../src/control-plane/formation-release-handoff-consumer.js';
import {resolveStartupAuthorityNodeIdSet} from
  '../../src/control-plane/startup-authority-placement-eligibility.js';
import {NodeJoiningReadySignalReadiness} from
  '../../src/bootstrap/node-joining-ready-signal-readiness.js';

const NOW = 10_000;

function buildAuthority() {
  return {
    state: 'ready',
    ready: true,
    authorityAvailable: true,
    publicationEpoch: 41,
    publicationStatus: 'PUBLISHED',
    priorityPartitionSummary: {satisfied: true},
    priorityRecoveryReasonCodes: [],
    canonicalStartupNodeIds: ['joiner-a', 'joiner-b', 'seed'],
    admission: {
      state: 'admitted',
      admitted: true,
      reasonCodes: [],
      clusterIncarnationFence: {
        allowed: true,
        state: 'matched',
        localIdentityState: 'matched',
        durableMembershipState: 'present',
        peerProofState: 'confirmed',
      },
    },
  };
}

function buildRows() {
  return [
    {
      node_id: 'seed',
      status: 'active',
      connection_state: 'ready',
      boot_incarnation: 1,
      ready_lease_expires_at: NOW + 60_000,
    },
    {
      node_id: 'joiner-a',
      status: 'joining',
      connection_state: 'connected',
      boot_incarnation: 1,
      ready_lease_expires_at: null,
    },
    {
      node_id: 'joiner-b',
      status: 'joining',
      connection_state: 'connected',
      boot_incarnation: 1,
      ready_lease_expires_at: null,
    },
  ];
}

function buildConnections(overrides = {}) {
  return ['seed', 'joiner-a', 'joiner-b'].map((nodeId) => ({
    nodeId,
    bootIncarnation: overrides[nodeId] || 1,
    connectionId: `connection:${nodeId}`,
  }));
}

function buildProjectedAuthority() {
  const owner = new FormationReleaseHandoffClosureOwner();
  const authority = buildAuthority();
  const pending = owner.observe(
    authority,
    buildRows(),
    NOW,
    'seed',
    buildConnections(),
  );
  const handoff = owner.acknowledgePublication(
    authorizeFormationReleaseHandoffPublicationIntent(pending),
  );
  return {...authority, formationReleaseHandoff: handoff};
}

test('seed projection validator accepts only the exact physical captured ' +
  'consumer and authority incarnations', (t) => {
  const projected = buildProjectedAuthority();
  const rows = buildRows();
  const accepted = validateFormationReleaseHandoffSeedProjection(
    projected,
    rows,
    'joiner-a',
    'seed',
    buildConnections().filter(({nodeId}) => nodeId !== 'joiner-b'),
  );
  t.equal(accepted.formationReleaseHandoff.releaseAuthorized, true,
    'the exact seed handoff remains the sole release contract');
  const joinerValidated = validateFormationReleaseHandoffSeedProjection(
    accepted,
    rows,
    'joiner-a',
    'seed',
    buildConnections().filter(({nodeId}) => nodeId !== 'joiner-b'),
  );
  t.equal(joinerValidated.formationReleaseHandoff.releaseAuthorized, true,
    'consumer proves seed+self without owning pairwise joiner identity');
  t.equal(
    validateFormationReleaseHandoffSeedProjection(
      projected,
      rows,
      'observer',
      'seed',
      buildConnections(),
    ),
    null,
    'a process outside the immutable cohort cannot inherit release',
  );
  const restartedConsumer = validateFormationReleaseHandoffSeedProjection(
    projected,
    rows,
    'joiner-a',
    'seed',
    buildConnections({'joiner-a': 2}),
  );
  t.equal(restartedConsumer.formationReleaseHandoff, null,
    'a restarted consumer retains discovery but not prior release');
  const staleSeed = validateFormationReleaseHandoffSeedProjection(
    projected,
    rows,
    'joiner-a',
    'seed',
    buildConnections({seed: 2}),
  );
  t.equal(staleSeed.formationReleaseHandoff, null,
    'a stale seed contract retains discovery but not release authority');

  const transientOmission = {
    ...projected,
    canonicalStartupNodeIds: ['seed'],
  };
  const omittedConsumer = validateFormationReleaseHandoffSeedProjection(
    transientOmission,
    rows,
    'joiner-a',
    'seed',
    buildConnections(),
  );
  t.equal(omittedConsumer.formationReleaseHandoff.releaseAuthorized, true,
    'the immutable physical cohort survives transient projection omission');
  t.equal(
    validateFormationReleaseHandoffSeedProjection(
      {...transientOmission, formationReleaseHandoff: null},
      rows,
      'joiner-a',
      'seed',
      buildConnections(),
    ),
    null,
    'base discovery alone cannot expand beyond the current projection',
  );
  t.end();
});

test('seed projection validator reads authority and row evidence as own data ' +
  'without invoking accessors', (t) => {
  const projected = buildProjectedAuthority();
  let getterCalls = 0;
  const accessorAuthority = {...projected};
  delete accessorAuthority.formationReleaseHandoff;
  Object.defineProperty(accessorAuthority, 'formationReleaseHandoff', {
    get() {
      getterCalls += 1;
      return projected.formationReleaseHandoff;
    },
  });
  const inheritedAuthority = Object.create({
    formationReleaseHandoff: projected.formationReleaseHandoff,
  });
  Object.assign(inheritedAuthority, buildAuthority());
  const accessorProjection = validateFormationReleaseHandoffSeedProjection(
    accessorAuthority,
    buildRows(),
    'joiner-a',
    'seed',
    buildConnections(),
  );
  t.equal(accessorProjection.formationReleaseHandoff, null);
  t.equal(getterCalls, 0, 'the external contract accessor is never invoked');
  const inheritedProjection = validateFormationReleaseHandoffSeedProjection(
    inheritedAuthority,
    buildRows(),
    'joiner-a',
    'seed',
    buildConnections(),
  );
  t.equal(inheritedProjection.formationReleaseHandoff, null,
    'an inherited contract is absent while base discovery remains visible');

  const accessorRows = buildRows();
  delete accessorRows[1].boot_incarnation;
  Object.defineProperty(accessorRows[1], 'boot_incarnation', {
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const accessorRowProjection = validateFormationReleaseHandoffSeedProjection(
    projected,
    accessorRows,
    'joiner-a',
    'seed',
    buildConnections(),
  );
  t.equal(accessorRowProjection.formationReleaseHandoff, null,
    'an accessor-backed durable identity cannot authorize release');
  t.equal(getterCalls, 0, 'the durable row accessor is never invoked');
  t.end();
});

test('active handoff placement scope survives post-import intrinsic changes ' +
  'and includes immutable captured nodes', (t) => {
  const projected = buildProjectedAuthority();
  const transientProjection = {
    ...projected,
    canonicalStartupNodeIds: ['seed'],
  };
  const originalArrayIsArray = Array.isArray;
  const OriginalSet = globalThis.Set;
  let nodeIds;
  try {
    Array.isArray = () => false;
    globalThis.Set = function ForgedSet() {
      throw new Error('live Set constructor invoked');
    };
    nodeIds = resolveStartupAuthorityNodeIdSet(transientProjection);
  } finally {
    Array.isArray = originalArrayIsArray;
    globalThis.Set = OriginalSet;
  }
  t.same(
    [...nodeIds].sort(),
    ['joiner-a', 'joiner-b', 'seed'],
    'captured placement scope remains visible during projection omission',
  );
  t.end();
});

test('joiner seed projection request is bounded by the formation poll ' +
  'cadence', async (t) => {
  const projected = buildProjectedAuthority();
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  owner.nodeId = 'joiner-a';
  owner.seedNodeId = 'seed';
  owner.seedNodeAddress = 'http://seed:8080';
  let requestOptions = null;
  owner.httpGetJson = async (_url, options) => {
    requestOptions = options;
    return {statusCode: 503, body: {startupAuthority: projected}};
  };
  owner.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      validateFormationReleaseStartupAuthorityProjection: (value) => value,
    },
  };
  t.equal(
    await owner.getPriorityPlacementFormationStartupAuthority(NOW, {
      requestTimeoutMs: 250,
    }),
    projected,
  );
  t.same(requestOptions, {timeoutMs: 250},
    'one request cannot outlive the poll cadence that schedules it');
  t.end();
});
