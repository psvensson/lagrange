import t from 'tap';
import {
  LEDGER_PARTITION_ID,
  buildFormationBarrierOwner,
  buildFormationCache,
  initializeEnvironment,
  resetEnvironment,
} from '../convergence/formation-barrier-test-fixture.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
  buildContract,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';
import {
  classifyFormationCohortSpreadCureNode,
  countStartupAuthorityNodeIds,
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
  resolveStartupAuthorityNodeIdSet,
  startupAuthorityNodeIdSetSize,
} from '../../src/control-plane/startup-authority-placement-eligibility.js';
import {UnifiedRebalancerAvailableNodes} from
  '../../src/rebalancer/unified-rebalancer-available-nodes.js';
import {NodeJoiningReadySignalReadiness} from
  '../../src/bootstrap/node-joining-ready-signal-readiness.js';

function withReady(startupAuthority, ready) {
  return Object.freeze({
    ...startupAuthority,
    state: ready ? 'ready' : 'recovery_pending',
    ready,
    authorityAvailable: true,
  });
}

function buildSyntheticFormationBarrierOwner(snapshots, states = []) {
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  let snapshotIndex = 0;
  owner.nodeId = 'joining-node';
  owner.seedNodeId = 'seed-node';
  owner.startupMode = 'fresh_join';
  owner.config = {
    priorityPlacementFormationDiscoveryMs: 5,
    priorityPlacementFormationPollMs: 1,
    priorityPlacementFormationTimeoutMs: 10,
    heartbeatIntervalMs: 100,
  };
  owner.now = () => 0;
  owner.sleep = async () => {};
  owner.logger = {
    info: (_message, fields) => states.push(fields.state),
    warn() {},
    error() {},
  };
  owner.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync: () => ({}),
    },
  };
  owner.publishOperationLedgerFormationLiveness = async () => true;
  owner.getOperationLedgerFormationBarrierSnapshot = async () => {
    const index = Math.min(snapshotIndex, snapshots.length - 1);
    snapshotIndex += 1;
    return snapshots[index];
  };
  return owner;
}

function buildSyntheticFormationSnapshot(overrides = {}) {
  return {
    now: 5,
    targetReplicaCount: 3,
    startupAuthorityAvailable: true,
    startupAuthorityReady: false,
    startupAuthorityNodeCount: 1,
    formationReleaseHandoff: null,
    candidateNodeIds: ['seed-node'],
    preReadyCandidateNodeIds: [],
    ...overrides,
  };
}

function buildAuthorizedFormationHandoff(cohort) {
  const generation = {
    id: formationReleaseGenerationIdentity(1, 'seed-node', 1, cohort),
    authorityNodeId: 'seed-node',
    authorityBootIncarnation: 1,
    publicationEpoch: 1,
    fenceIdentity: 'none',
    canonicalNodeIds: ['seed-node', ...cohort.map((member) => member.nodeId)],
    requiredCohort: cohort,
  };
  return buildContract({
    state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    reason: FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY,
    generation,
    pendingNodeIds: cohort.map((member) => member.nodeId),
    observedPublicationEpoch: 1,
    observedAuthorityReady: true,
    releaseAuthorized: true,
  });
}

t.test('the real startup-authority owner emits the formation release verdict',
  async (t) => {
    const priorityPartitionSummary = {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
    };
    const startupAuthority = buildStartupAuthoritySnapshotFromPlanningAnswer({
      publicationEpoch: 2,
      publicationStatus: 'PUBLISHED',
      publicationObservationState: 'authoritative',
      recoveryProtocolState: 'steady_published',
      priorityPartitionSummary,
      recoveryActiveNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      membershipLifecycleSummary: {
        formationPlacementNodeIds: [
          'seed-node',
          'joining-node',
          'joining-node-2',
        ],
      },
      requiredAckNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      acknowledgedNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      pendingAckNodeIds: [],
      pendingAckCount: 0,
      missingPublishedNodeIds: [],
      targetParticipation: {nodeId: 'seed-node', reasons: []},
    });

    t.equal(startupAuthority.authorityAvailable, true);
    t.equal(startupAuthority.ready, true,
      'published, acknowledged, durably spread priority placement is ready');
  });

t.test('formation loop passes its poll cadence as the seed projection request ' +
  'budget', async (t) => {
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  let observedRequestTimeoutMs = null;
  owner.nodeId = 'joining-node';
  owner.seedNodeId = 'seed-node';
  owner.startupMode = 'fresh_join';
  owner.config = {
    priorityPlacementFormationDiscoveryMs: 0,
    priorityPlacementFormationPollMs: 500,
    priorityPlacementFormationTimeoutMs: 120_000,
    heartbeatIntervalMs: 1_000,
  };
  owner.now = () => 1_000;
  owner.sleep = async () => {};
  owner.logger = {info() {}, warn() {}, error() {}};
  owner.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync: () => ({}),
    },
  };
  owner.getOperationLedgerFormationBarrierSnapshot = async (
    requestTimeoutMs,
  ) => {
    observedRequestTimeoutMs = requestTimeoutMs;
    return {
      now: 1_000,
      targetReplicaCount: 3,
      startupAuthorityReady: true,
      formationReleaseHandoff: buildAuthorizedFormationHandoff([
        {nodeId: 'joining-node', bootIncarnation: 3},
        {nodeId: 'joining-node-2', bootIncarnation: 5},
      ]),
      candidateNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      preReadyCandidateNodeIds: ['joining-node', 'joining-node-2'],
    };
  };
  await owner.awaitOperationLedgerFormationBarrier();
  t.equal(observedRequestTimeoutMs, 500,
    'the 500ms poll cannot inherit the generic 10s join HTTP timeout');
});

t.test('formation barrier distinguishes positive insufficiency from absent ' +
  'authority', async (t) => {
  const bypassStates = [];
  const bypassOwner = buildSyntheticFormationBarrierOwner([
    buildSyntheticFormationSnapshot(),
  ], bypassStates);
  await bypassOwner.awaitOperationLedgerFormationBarrier();
  t.same(bypassStates, ['bypassed_insufficient_formation_cohort'],
    'an available, positively insufficient cohort uses ordinary joining');

  const indeterminateStates = [];
  const indeterminateOwner = buildSyntheticFormationBarrierOwner([
    buildSyntheticFormationSnapshot({
      startupAuthorityNodeCount: 3,
      candidateNodeIds: [],
    }),
    buildSyntheticFormationSnapshot({
      now: 6,
      startupAuthorityNodeCount: 1,
      candidateNodeIds: [],
    }),
  ], indeterminateStates);
  await indeterminateOwner.awaitOperationLedgerFormationBarrier();
  t.same(indeterminateStates, [
    'waiting_for_formation_cohort',
    'bypassed_insufficient_formation_cohort',
  ], 'an incomplete local cache waits until authority positively proves small');

  const unavailableStates = [];
  const selfHandoff = buildAuthorizedFormationHandoff([
    {nodeId: 'joining-node', bootIncarnation: 3},
    {nodeId: 'joining-node-2', bootIncarnation: 5},
  ]);
  const unavailableOwner = buildSyntheticFormationBarrierOwner([
    buildSyntheticFormationSnapshot({
      startupAuthorityAvailable: false,
      candidateNodeIds: [],
    }),
    buildSyntheticFormationSnapshot({
      now: 6,
      formationReleaseHandoff: selfHandoff,
      candidateNodeIds: [],
    }),
    buildSyntheticFormationSnapshot({
      now: 7,
      startupAuthorityReady: true,
      formationReleaseHandoff: selfHandoff,
      candidateNodeIds: [],
    }),
  ], unavailableStates);
  await unavailableOwner.awaitOperationLedgerFormationBarrier();
  t.same(unavailableStates, [
    'waiting_for_formation_cohort',
    'waiting_for_startup_authority',
    'ledger_spread_satisfied',
  ], 'absence cannot prove insufficiency and the exact self handoff latches');

  const timeoutOwner = buildSyntheticFormationBarrierOwner([
    buildSyntheticFormationSnapshot({
      startupAuthorityAvailable: false,
      candidateNodeIds: [],
    }),
    buildSyntheticFormationSnapshot({
      now: 10,
      startupAuthorityAvailable: false,
      candidateNodeIds: [],
    }),
  ]);
  const timeout = await timeoutOwner.awaitOperationLedgerFormationBarrier()
    .then(() => null, (error) => error);
  t.equal(timeout?.code, 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
    'persistent absence reaches the existing retryable timeout');
  t.equal(timeout?.retryable, true);
});

t.test('formation barrier engages only before the ready replica floor exists',
  async (t) => {
    const establishedStates = [];
    const establishedOwner = buildSyntheticFormationBarrierOwner([
      buildSyntheticFormationSnapshot({
        startupAuthorityNodeCount: 5,
        candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'join-b'],
        preReadyCandidateNodeIds: ['join-a', 'join-b'],
      }),
      buildSyntheticFormationSnapshot({
        now: 10,
        startupAuthorityNodeCount: 5,
        candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'join-b'],
        preReadyCandidateNodeIds: ['join-a', 'join-b'],
      }),
    ], establishedStates);
    await establishedOwner.awaitOperationLedgerFormationBarrier();
    t.same(establishedStates, ['bypassed_insufficient_formation_cohort'],
      'five candidates with three ready nodes do not re-enter cold formation');

    const coldStates = [];
    const coldOwner = buildSyntheticFormationBarrierOwner([
      buildSyntheticFormationSnapshot({
        startupAuthorityReady: true,
        startupAuthorityNodeCount: 3,
        formationReleaseHandoff: buildAuthorizedFormationHandoff([
          {nodeId: 'joining-node', bootIncarnation: 3},
          {nodeId: 'joining-node-2', bootIncarnation: 5},
        ]),
        candidateNodeIds: ['ready-a', 'join-a', 'join-b'],
        preReadyCandidateNodeIds: ['join-a', 'join-b'],
      }),
    ], coldStates);
    await coldOwner.awaitOperationLedgerFormationBarrier();
    t.same(coldStates, ['ledger_spread_satisfied'],
      'three candidates with only one ready node engage the cold barrier');

    const boundaryStates = [];
    const boundaryOwner = buildSyntheticFormationBarrierOwner([
      buildSyntheticFormationSnapshot({
        now: 10,
        startupAuthorityReady: true,
        startupAuthorityNodeCount: 3,
        formationReleaseHandoff: buildAuthorizedFormationHandoff([
          {nodeId: 'joining-node', bootIncarnation: 3},
          {nodeId: 'joining-node-2', bootIncarnation: 5},
        ]),
        candidateNodeIds: ['ready-a', 'join-a', 'join-b'],
        preReadyCandidateNodeIds: ['join-a', 'join-b'],
      }),
    ], boundaryStates);
    await boundaryOwner.awaitOperationLedgerFormationBarrier();
    t.same(boundaryStates, ['ledger_spread_satisfied'],
      'a current ready verdict releases before timeout handling');

    const excludedStates = [];
    const excludedOwner = buildSyntheticFormationBarrierOwner([
      buildSyntheticFormationSnapshot({
        startupAuthorityReady: true,
        formationReleaseHandoff: buildAuthorizedFormationHandoff([
          {nodeId: 'other-a', bootIncarnation: 7},
          {nodeId: 'other-b', bootIncarnation: 9},
        ]),
      }),
    ], excludedStates);
    await excludedOwner.awaitOperationLedgerFormationBarrier();
    t.same(excludedStates, ['bypassed_insufficient_formation_cohort'],
      'a handoff that excludes this joiner cannot latch its barrier');
  });

t.test('non-cohort joiners leave a cold wait only through an established ' +
  'ready floor', async (t) => {
  const coldSnapshot = buildSyntheticFormationSnapshot({
    startupAuthorityNodeCount: 5,
    candidateNodeIds: ['ready-a', 'ready-b', 'join-a', 'join-b', 'outsider'],
    preReadyCandidateNodeIds: ['join-a', 'join-b', 'outsider'],
  });
  const establishedFloorSnapshot = buildSyntheticFormationSnapshot({
    now: 6,
    startupAuthorityNodeCount: 5,
    candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'outsider'],
    preReadyCandidateNodeIds: ['join-a', 'outsider'],
  });
  const outsiderStates = [];
  const outsiderOwner = buildSyntheticFormationBarrierOwner([
    coldSnapshot,
    establishedFloorSnapshot,
    {...establishedFloorSnapshot, now: 10},
  ], outsiderStates);
  await outsiderOwner.awaitOperationLedgerFormationBarrier();
  t.same(outsiderStates, [
    'waiting_for_startup_authority',
    'bypassed_insufficient_formation_cohort',
  ], 'the exact v12 2/3 to 3/3 schedule cannot strand an outsider');

  const shrinkStates = [];
  const shrinkOwner = buildSyntheticFormationBarrierOwner([
    coldSnapshot,
    buildSyntheticFormationSnapshot({
      now: 10,
      startupAuthorityNodeCount: 2,
      candidateNodeIds: ['ready-a', 'outsider'],
      preReadyCandidateNodeIds: ['outsider'],
    }),
  ], shrinkStates);
  const shrinkError = await shrinkOwner.awaitOperationLedgerFormationBarrier()
    .then(() => null, (error) => error);
  t.equal(
    shrinkError?.code,
    'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
    'projection shrink after a cold observation cannot forge bypass',
  );
  t.same(shrinkStates, ['waiting_for_startup_authority']);

  const selfHandoff = buildAuthorizedFormationHandoff([
    {nodeId: 'joining-node', bootIncarnation: 3},
    {nodeId: 'joining-node-2', bootIncarnation: 5},
  ]);
  const selfStates = [];
  const selfOwner = buildSyntheticFormationBarrierOwner([
    coldSnapshot,
    buildSyntheticFormationSnapshot({
      now: 6,
      startupAuthorityNodeCount: 5,
      formationReleaseHandoff: selfHandoff,
      candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'join-b'],
      preReadyCandidateNodeIds: ['join-a', 'join-b'],
    }),
    buildSyntheticFormationSnapshot({
      now: 10,
      startupAuthorityNodeCount: 5,
      formationReleaseHandoff: selfHandoff,
      candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'join-b'],
      preReadyCandidateNodeIds: ['join-a', 'join-b'],
    }),
  ], selfStates);
  const selfError = await selfOwner.awaitOperationLedgerFormationBarrier()
    .then(() => null, (error) => error);
  t.equal(
    selfError?.code,
    'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
    'an exact self handoff wins over simultaneous ready-floor bypass',
  );
  t.same(selfStates, ['waiting_for_startup_authority']);

  const releasedStates = [];
  const releasedOwner = buildSyntheticFormationBarrierOwner([
    coldSnapshot,
    buildSyntheticFormationSnapshot({
      now: 6,
      startupAuthorityReady: true,
      startupAuthorityNodeCount: 5,
      formationReleaseHandoff: selfHandoff,
      candidateNodeIds: ['ready-a', 'ready-b', 'ready-c', 'join-a', 'join-b'],
      preReadyCandidateNodeIds: ['join-a', 'join-b'],
    }),
  ], releasedStates);
  await releasedOwner.awaitOperationLedgerFormationBarrier();
  t.same(releasedStates, [
    'waiting_for_startup_authority',
    'ledger_spread_satisfied',
  ], 'a captured self still leaves only through the exact release verdict');
});

t.test(
  'formation barrier authority remains exact under hostile collection intrinsics',
  async (t) => {
    const hasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
    const sizeDescriptor = Object.getOwnPropertyDescriptor(
      Set.prototype,
      'size',
    );
    const findDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      'find',
    );
    const filterDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      'filter',
    );
    const arrayIsArrayDescriptor = Object.getOwnPropertyDescriptor(
      Array,
      'isArray',
    );
    const mapGetDescriptor = Object.getOwnPropertyDescriptor(
      Map.prototype,
      'get',
    );
    const toLowerCaseDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      'toLowerCase',
    );
    const toUpperCaseDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      'toUpperCase',
    );
    const objectFreezeDescriptor = Object.getOwnPropertyDescriptor(
      Object,
      'freeze',
    );
    const publishedNodeIds = ['node-a', 'node-b'];
    const authority = {
      authorityAvailable: true,
      canonicalStartupNodeIds: ['node-a', 'node-b', 'node-c'],
      formationReleaseHandoff: null,
    };
    let cacheRowAccessorCalls = 0;
    let publicationAccessorCalls = 0;
    const inheritedCacheRow = Object.create({
      node_id: 'node-a',
      status: 'active',
      connection_state: 'connected',
    });
    const accessorCacheRow = {};
    for (const field of ['node_id', 'status', 'connection_state']) {
      Object.defineProperty(accessorCacheRow, field, {
        enumerable: true,
        get() {
          cacheRowAccessorCalls += 1;
          return field === 'node_id' ? 'node-a' :
            field === 'status' ? 'active' : 'connected';
        },
      });
    }
    const rows = [
      {node_id: 'node-a', status: 'active', connection_state: 'connected'},
      {node_id: 'node-b', status: 'active', connection_state: 'connected'},
      {node_id: 'node-c', status: 'active', connection_state: 'connected'},
      {node_id: 'forged-node', status: 'active', connection_state: 'connected'},
      inheritedCacheRow,
      accessorCacheRow,
    ];
    try {
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Set.prototype, 'size', {
        ...sizeDescriptor,
        get() {
          const actual = sizeDescriptor.get.call(this);
          return actual === 3 ? 1 : actual;
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Set.prototype, 'has', {
        ...hasDescriptor,
        value(value) {
          if (
            value === 'forged-node' ||
            value === 'waiting_for_startup_authority'
          ) {
            return true;
          }
          return hasDescriptor.value.call(this, value);
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Array.prototype, 'find', {
        ...findDescriptor,
        value(predicate) {
          if (
            this.length > 0 &&
            (
              this[0]?.state === 'outside_priority_recovery_lane' ||
              this[0]?.state === 'ordinary_entity'
            )
          ) {
            return this[this.length - 1];
          }
          return findDescriptor.value.call(this, predicate);
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Array.prototype, 'filter', {
        ...filterDescriptor,
        value(predicate) {
          return this === publishedNodeIds ? [] :
            filterDescriptor.value.call(this, predicate);
        },
      });
      Object.defineProperty(Array, 'isArray', {
        ...arrayIsArrayDescriptor,
        value(value) {
          return value === publishedNodeIds ? false :
            arrayIsArrayDescriptor.value(value);
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Map.prototype, 'get', {
        ...mapGetDescriptor,
        value(key) {
          return key === 'ordinary_entity' ||
            key === 'priority_recovery_closed' ?
            'allow_recovery_cohort' :
            mapGetDescriptor.value.call(this, key);
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(String.prototype, 'toLowerCase', {
        ...toLowerCaseDescriptor,
        value() {
          const normalized = toLowerCaseDescriptor.value.call(this);
          return normalized === 'disconnected' ? 'connected' : normalized;
        },
      });
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(String.prototype, 'toUpperCase', {
        ...toUpperCaseDescriptor,
        value() {
          const normalized = toUpperCaseDescriptor.value.call(this);
          return normalized === 'published' ? 'PENDING' : normalized;
        },
      });
      Object.defineProperty(Object, 'freeze', {
        ...objectFreezeDescriptor,
        value(value) {
          if (value?.priorityPartition === true) {
            return {
              ...value,
              publicationPublished: false,
              prioritySummarySatisfied: false,
            };
          }
          if (typeof value?.timeoutMs === 'number') {
            return {...value, timeoutMs: 0};
          }
          return objectFreezeDescriptor.value(value);
        },
      });
      const candidateNodeIds =
        getStartupAuthorityControlPlanePlacementEligibleNodeIds({
          startupAuthority: authority,
          systemTableCache: {
            filter: (_tableName, predicate) => rows.filter(predicate),
          },
          messageRouter: {getConnectionState: () => 'connected'},
          localNodeId: 'node-a',
          includeSelf: true,
        });
      t.equal(countStartupAuthorityNodeIds(authority), 3,
        'captured size preserves the authoritative population');
      t.same(candidateNodeIds, ['node-a', 'node-b', 'node-c'],
        'captured membership excludes forged, inherited, and accessor rows');
      t.same(
        NodeJoiningReadySignalReadiness.prototype
          .getPriorityPlacementFormationPreReadyNodeIds.call(
            {},
            {
              filter: (_tableName, predicate) =>
                [inheritedCacheRow, accessorCacheRow].filter(predicate),
            },
            ['node-a'],
            1,
          ),
        [],
        'pre-ready projection ignores inherited and accessor node identities',
      );
      t.equal(cacheRowAccessorCalls, 0,
        'cache-row accessors are never invoked by placement or barrier owners');
      t.equal(classifyFormationCohortSpreadCureNode({
        node: rows[0],
        startupAuthorityNodeIds:
          resolveStartupAuthorityNodeIdSet(authority),
        messageRouter: {getConnectionState: () => 'connected'},
        localNodeId: 'node-a',
        includeSelf: true,
        priorityRecoveryLane: false,
        priorityRecoveryActive: true,
      }), 'not_cure_target',
      'hostile Array.find cannot bypass the mutation-admission lane');
      t.equal(classifyFormationCohortSpreadCureNode({
        node: {...rows[0], connection_state: 'disconnected'},
        startupAuthorityNodeIds:
          resolveStartupAuthorityNodeIdSet(authority),
        messageRouter: {getConnectionState: () => 'connected'},
        localNodeId: 'node-a',
        includeSelf: true,
        priorityRecoveryLane: true,
        priorityRecoveryActive: true,
      }), 'not_cure_target',
      'hostile string folding cannot admit a disconnected mutation target');
      t.equal(
        UnifiedRebalancerAvailableNodes.prototype
          .resolveAvailableNodeMembershipConstraintState({
            recoveryLaneParticipant: false,
            recoveryActive: true,
            publicationPublished: false,
            prioritySummarySatisfied: false,
          }),
        'ordinary_entity',
        'hostile Array.find cannot widen membership constraints',
      );
      const membershipEvidenceOwner = {
        getLatestMembershipPublicationRow: () => ({
          status: 'published',
          priorityPartitionSummary: {satisfied: true},
        }),
        isControlPlanePriorityPartition: () => true,
        isFormationLivenessDependencyPartition: () => false,
        isGlobalPriorityControlPlaneRecoveryActive: () => true,
      };
      const membershipEvidence = UnifiedRebalancerAvailableNodes.prototype
        .buildAvailableNodeMembershipConstraintEvidence.call(
          membershipEvidenceOwner,
        );
      const accessorMembershipEvidence = UnifiedRebalancerAvailableNodes
        .prototype.buildAvailableNodeMembershipConstraintEvidence.call({
          getLatestMembershipPublicationRow: () => {
            const row = Object.create({
              status: 'published',
              priorityPartitionSummary: {satisfied: true},
            });
            for (const field of ['status', 'priorityPartitionSummary']) {
              Object.defineProperty(row, field, {
                enumerable: true,
                get() {
                  publicationAccessorCalls += 1;
                  return field === 'status' ?
                    'published' : {satisfied: true};
                },
              });
            }
            return row;
          },
          isControlPlanePriorityPartition: () => true,
          isFormationLivenessDependencyPartition: () => false,
          isGlobalPriorityControlPlaneRecoveryActive: () => true,
        });
      t.equal(accessorMembershipEvidence.publicationPublished, false,
        'publication status requires own data');
      t.equal(accessorMembershipEvidence.prioritySummarySatisfied, false,
        'priority satisfaction requires own nested data');
      t.equal(publicationAccessorCalls, 0,
        'publication-row accessors are never invoked');
      const membershipOwner = {
        buildAvailableNodeMembershipConstraintEvidence: () =>
          membershipEvidence,
        resolveAvailableNodeMembershipConstraintState:
          UnifiedRebalancerAvailableNodes.prototype
            .resolveAvailableNodeMembershipConstraintState,
      };
      t.equal(
        UnifiedRebalancerAvailableNodes.prototype
          .shouldConstrainAvailableNodesToPublishedMembership.call(
            membershipOwner,
          ),
        true,
        'hostile Map/string/freeze intrinsics cannot reopen membership',
      );
      const publishedSet = UnifiedRebalancerAvailableNodes.prototype
        .getPublishedActiveNodeIdSet.call({
          getLatestPublishedMembershipRow: () => ({
            publishedActiveNodeIds: publishedNodeIds,
          }),
        });
      t.equal(startupAuthorityNodeIdSetSize(publishedSet), 2,
        'published membership ignores hostile array statics and filtering');
      t.equal(
        buildSyntheticFormationBarrierOwner([])
          .resolveOperationLedgerFormationBarrierTiming().timeoutMs,
        10,
        'hostile Object.freeze cannot rewrite barrier control evidence',
      );

      const owner = buildSyntheticFormationBarrierOwner([
        buildSyntheticFormationSnapshot({
          now: 10,
          startupAuthorityNodeCount:
            countStartupAuthorityNodeIds(authority),
          candidateNodeIds,
          preReadyCandidateNodeIds: ['node-b', 'node-c'],
        }),
      ]);
      const timeout = await owner.awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);
      t.equal(timeout?.code, 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
        'hostile Set.has cannot turn a waiting state into release');
    } finally {
      Object.defineProperty(Object, 'freeze', objectFreezeDescriptor);
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(
        String.prototype,
        'toUpperCase',
        toUpperCaseDescriptor,
      );
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(
        String.prototype,
        'toLowerCase',
        toLowerCaseDescriptor,
      );
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Map.prototype, 'get', mapGetDescriptor);
      Object.defineProperty(Array, 'isArray', arrayIsArrayDescriptor);
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Array.prototype, 'filter', filterDescriptor);
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Array.prototype, 'find', findDescriptor);
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Set.prototype, 'has', hasDescriptor);
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Set.prototype, 'size', sizeDescriptor);
    }
  });

t.test('seed base projection latches discovery without authorizing release',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 1_000;
    let requestCount = 0;
    const states = [];
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      isStartupAuthorityReady: () => true,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    const readinessService =
      owner.rebalanceCoordinator.controlPlaneReadinessService;
    owner.httpGetJson = async () => {
      requestCount += 1;
      const authority = readinessService.getStartupAuthoritySnapshotSync();
      return {
        statusCode: 503,
        body: {
          startupAuthority: requestCount === 1 ?
            {...authority, formationReleaseHandoff: null} :
            {
              ...authority,
              formationReleaseHandoff: buildAuthorizedFormationHandoff([
                {nodeId: 'joining-node', bootIncarnation: 1},
                {nodeId: 'joining-node-2', bootIncarnation: 1},
              ]),
            },
        },
      };
    };
    owner.logger.info = (_message, fields) => states.push(fields.state);

    try {
      await owner.awaitOperationLedgerFormationBarrier();
      t.equal(requestCount, 2,
        'the base projection discovers the cohort but cannot release it');
      t.same(states, [
        'waiting_for_startup_authority',
        'ledger_spread_satisfied',
      ], 'the cohort latches before the durable handoff authorizes release');
      t.equal(states.includes('bypassed_insufficient_formation_cohort'), false,
        'discovery is not bypassed while the durable handoff is pending');
    } finally {
      resetEnvironment();
    }
  });

t.test(
  'formation consumes only the startup-authority owner verdict',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 1000;
    let legacyPlacementReadCount = 0;
    let legacyOperationReadCount = 0;
    let startupAuthority = null;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
        startupAuthority = withReady(startupAuthority, true);
      },
    });
    startupAuthority = withReady(
      owner.rebalanceCoordinator.controlPlaneReadinessService
        .getStartupAuthoritySnapshotSync(),
      false,
    );
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getStartupAuthoritySnapshotSync = () => startupAuthority;
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getAuthoritativeControlPlaneView = () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => {
          legacyPlacementReadCount++;
          return {success: false, rows: []};
        },
      });
    owner.rebalanceCoordinator.getEntityAuthoritativeOperationObservation =
      async () => {
        legacyOperationReadCount++;
        return {state: 'empty', operations: [], deferredOutcome: null};
      };
    owner.config.priorityPlacementFormationTimeoutMs = 4;

    try {
      const error = await owner.awaitOperationLedgerFormationBarrier()
        .then(() => null, (failure) => failure);
      t.equal(error, null,
        'the canonical owner release is not vetoed by a second placement form');
      t.equal(legacyPlacementReadCount, 0,
        'bootstrap has no independent placement-read authority');
      t.equal(legacyOperationReadCount, 0,
        'bootstrap has no independent operation-drain authority');
    } finally {
      resetEnvironment();
    }
  },
);

t.test(
  'legacy-looking spread cannot override a pending startup-authority verdict',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 2000;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    const pendingAuthority = withReady(
      owner.rebalanceCoordinator.controlPlaneReadinessService
        .getStartupAuthoritySnapshotSync(),
      false,
    );
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getStartupAuthoritySnapshotSync = () => pendingAuthority;
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getAuthoritativeControlPlaneView = () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => ({
          success: true,
          source: 'owner_rpc_lane',
          rows: [
            ['r1', 'seed-node'],
            ['r2', 'joining-node-2'],
            ['r3', 'joining-node-3'],
          ].map(([replicaId, nodeId]) => ({
            service_id: `${LEDGER_PARTITION_ID}-${replicaId}`,
            replica_id: `${LEDGER_PARTITION_ID}-${replicaId}`,
            partition_id: LEDGER_PARTITION_ID,
            node_id: nodeId,
            service_type: 'partition',
            status: 'active',
            raft_role: replicaId === 'r1' ? 'leader' : 'follower',
          })),
        }),
      });
    owner.rebalanceCoordinator.getEntityAuthoritativeOperationObservation =
      async () => ({state: 'empty', operations: [], deferredOutcome: null});
    owner.config.priorityPlacementFormationTimeoutMs = 3;

    try {
      const error = await owner.awaitOperationLedgerFormationBarrier()
        .then(() => null, (failure) => failure);
      t.match(error, {
        code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
        retryable: true,
      }, 'only the canonical owner can release an engaged barrier');
    } finally {
      resetEnvironment();
    }
  },
);
