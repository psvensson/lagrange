import {test} from '../../src/test-helpers/tap.js';
import {
  ReadinessPlanningSnapshotOwner,
} from '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildProjectionReadinessState,
} from '../../src/control-plane/projection-readiness-state.js';

const NOW_MS = 10_000;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const reflectDefineProperty = Reflect.defineProperty;

function replaceProperty(target, key, value) {
  const original = objectGetOwnPropertyDescriptor(target, key);
  reflectDefineProperty(target, key, {
    configurable: true,
    enumerable: original?.enumerable === true,
    value,
    writable: true,
  });
  return () => {
    if (original) {
      reflectDefineProperty(target, key, original);
    } else {
      delete target[key];
    }
  };
}

function replaceAccessor(target, key, getter) {
  const original = objectGetOwnPropertyDescriptor(target, key);
  reflectDefineProperty(target, key, {
    configurable: true,
    enumerable: false,
    get: getter,
  });
  return () => {
    if (original) {
      reflectDefineProperty(target, key, original);
    } else {
      delete target[key];
    }
  };
}

function throwingIntrinsic() {
  throw new Error('live intrinsic escaped');
}

function buildPositiveSnapshot(ownerKey) {
  return Object.freeze({
    nodeId: ownerKey,
    serveEligible: true,
    repairEligible: true,
    dimensions: Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    }),
    reasons: Object.freeze([]),
    nodeEvidence: Object.freeze({
      lastHeartbeat: NOW_MS,
      readyLeaseExpiresAt: NOW_MS + 60_000,
      transportConnected: true,
      localQueryTransportReady: true,
    }),
    runtimeAuthority: Object.freeze({
      ready: true,
      authorityAvailable: true,
      writeEligible: true,
      recoveryEligible: true,
      repairEligible: true,
      publication: Object.freeze({healthy: true}),
      visibility: Object.freeze({published: true}),
      provisioning: Object.freeze({eligible: true}),
    }),
    projectionReadinessContract: Object.freeze({
      state: 'serve_ready',
      ready: true,
      serveReady: true,
      recoveryOpen: false,
      lanes: Object.freeze({
        serve: Object.freeze({ready: true}),
        repair: Object.freeze({ready: true}),
        internal: Object.freeze({ready: true}),
        operator: Object.freeze({ready: true}),
      }),
      publication: Object.freeze({ready: true}),
      readiness: Object.freeze({
        internalReady: true,
        repairEligible: true,
        recoveryEligible: true,
        serveEligible: true,
        runtimeServeEligible: true,
        operatorReady: true,
      }),
    }),
  });
}

function assertDeferredSnapshot(t, snapshot, label) {
  t.equal(objectGetPrototypeOf(snapshot), null,
    `${label} uses an own-data-only top-level record`);
  t.equal(objectGetPrototypeOf(snapshot.runtimeAuthority), null,
    `${label} uses an own-data-only runtime authority record`);
  t.equal(objectGetPrototypeOf(snapshot.projectionReadinessContract), null,
    `${label} uses an own-data-only projection contract record`);
  t.equal(
    objectGetPrototypeOf(snapshot.projectionReadinessContract.publication),
    null,
    `${label} uses an own-data-only publication record`,
  );
  t.equal(objectGetPrototypeOf(snapshot.nodeEvidence), null,
    `${label} uses an own-data-only node evidence record`);
  t.equal(objectGetPrototypeOf(snapshot.readinessPlanningToken), null,
    `${label} uses an own-data-only planning token record`);
  t.equal(
    objectGetPrototypeOf(
      snapshot.readinessPlanningToken.ownerDependencyGenerations,
    ),
    null,
    `${label} uses own-data-only dependency generations`,
  );
  t.equal(
    objectGetPrototypeOf(snapshot.readinessPlanningToken.tableRevisions),
    null,
    `${label} uses own-data-only table revisions`,
  );
  t.equal(snapshot.serveEligible, false,
    `${label} clears the top-level serve alias`);
  t.equal(snapshot.repairEligible, false,
    `${label} clears the top-level repair alias`);
  t.equal(snapshot.runtimeAuthority.ready, false,
    `${label} clears runtime readiness`);
  t.equal(snapshot.runtimeAuthority.authorityAvailable, false,
    `${label} clears runtime authority availability`);
  t.equal(snapshot.runtimeAuthority.writeEligible, false,
    `${label} clears runtime write eligibility`);
  t.equal(snapshot.runtimeAuthority.recoveryEligible, false,
    `${label} clears runtime recovery eligibility`);
  t.equal(snapshot.runtimeAuthority.repairEligible, false,
    `${label} clears runtime repair eligibility`);
  t.equal(snapshot.runtimeAuthority.publication.healthy, false,
    `${label} clears runtime publication health`);
  t.equal(snapshot.runtimeAuthority.visibility.published, false,
    `${label} clears runtime publication visibility`);
  t.equal(snapshot.runtimeAuthority.provisioning.eligible, false,
    `${label} clears runtime provisioning eligibility`);
  t.equal(snapshot.projectionReadinessContract.ready, false,
    `${label} clears projection readiness`);
  t.equal(snapshot.projectionReadinessContract.serveReady, false,
    `${label} clears projection serve readiness`);
  t.equal(snapshot.projectionReadinessContract.publication.ready, false,
    `${label} clears projection publication readiness`);
  for (const lane of Object.values(
    snapshot.projectionReadinessContract.lanes,
  )) {
    t.equal(lane.ready, false, `${label} closes every projection lane`);
  }
  for (const eligible of Object.values(
    snapshot.projectionReadinessContract.readiness,
  )) {
    t.equal(eligible, false,
      `${label} clears every projection readiness alias`);
  }
  t.equal(snapshot.nodeEvidence.transportConnected, false,
    `${label} clears stale transport connectivity`);
  t.equal(snapshot.nodeEvidence.localQueryTransportReady, false,
    `${label} clears stale local-query transport readiness`);
  const reconstructed = buildProjectionReadinessState(snapshot);
  t.equal(reconstructed.state, PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
    `${label} reconstructs as a blocked production projection`);
  for (const lane of Object.values(reconstructed.lanes)) {
    t.equal(lane.ready, false,
      `${label} cannot regain a ready lane through reconstruction`);
  }
}

function createOwner({onBuild = () => {}} = {}) {
  let connected = true;
  const scheduled = [];
  const service = {
    clusterMemberStaleHeartbeatMaxAgeMs: 60_000,
    getNodeRow: () => ({node_id: 'owner-a'}),
    getNodeTransportState: () => ({
      connected,
      routerState: connected ? 'connected' : 'disconnected',
      rowState: 'active',
    }),
    hasStoredSnapshotLocalQueryTransportDrift: () => false,
    buildNodeReadinessSyncCurrent(ownerKey) {
      const snapshot = buildPositiveSnapshot(ownerKey);
      onBuild(() => {
        connected = false;
      });
      return snapshot;
    },
    setTimeoutFn: () => ({unref() {}}),
    clearTimeoutFn: () => {},
  };
  return {
    owner: new ReadinessPlanningSnapshotOwner({
      service,
      now: () => NOW_MS,
      scheduleDrainFn: (callback) => scheduled.push(callback),
    }),
    scheduled,
  };
}

test('a live veto change during build cannot publish or become reusable',
  async (t) => {
    let disconnectDuringBuild = true;
    const {owner} = createOwner({
      onBuild: (disconnect) => {
        if (disconnectDuringBuild) {
          disconnectDuringBuild = false;
          disconnect();
        }
      },
    });

    const first = owner.reconcile('owner-a', {options: {}});
    const second = owner.readSync(
      'owner-a',
      {},
      () => buildPositiveSnapshot('owner-a'),
    );
    const diagnostics = owner.getDiagnostics();

    t.equal(first.readinessPlanningTokenStatus, 'stale',
      'the mid-build veto change makes the completion non-publishable');
    t.ok(first.reasons.includes(
      CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    ), 'the first caller receives an explicit deferred snapshot');
    t.equal(second.readinessPlanningTokenStatus, 'stale',
      'the disconnected caller cannot reuse the built positive snapshot');
    assertDeferredSnapshot(t, first, 'the rejected build');
    assertDeferredSnapshot(t, second, 'the rejected reuse');
    t.equal(diagnostics.completedTokenStatusByOwnerKey['owner-a'], 'stale',
      'diagnostics retain the rejected completion as stale');
    owner.shutdown();
  });

test('diagnostic owner keys cannot invoke inherited record setters',
  async (t) => {
    const {owner} = createOwner();
    owner.publishCompleted(
      'owner-diag',
      buildPositiveSnapshot('owner-diag'),
      owner.captureToken(),
      'default',
    );
    const original = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'owner-diag',
    );
    const mutatePrototype = (descriptor) => Reflect.defineProperty(
      Object.prototype,
      'owner-diag',
      descriptor,
    );
    let diagnostics;
    let escaped = null;
    try {
      mutatePrototype({
        configurable: true,
        set: () => {
          throw new Error('named diagnostic setter escaped');
        },
      });
      diagnostics = owner.getDiagnostics();
    } catch (error) {
      escaped = error;
    } finally {
      if (original) {
        mutatePrototype(original);
      } else {
        delete Object.prototype['owner-diag'];
      }
    }

    t.equal(escaped, null, 'an inherited diagnostic setter cannot escape');
    t.equal(diagnostics.completedTokenStatusByOwnerKey['owner-diag'], 'current',
      'the owner diagnostic is defined as own data');
    owner.shutdown();
  });

test('deferred projection reconstruction uses only captured intrinsics',
  async (t) => {
    const {owner} = createOwner({onBuild: (disconnect) => disconnect()});
    const deferred = owner.reconcile('owner-a', {options: {}});
    const sourceBase = buildPositiveSnapshot('owner-a');
    const sourceInput = {
      ...sourceBase,
      dimensions: {
        ...sourceBase.dimensions,
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      },
      publicationOwnerStreamSource: {
        publicationEpoch: 1,
        status: 'PUBLISHED',
        requiredAckNodeIds: ['owner-a'],
        acknowledgedNodeIds: ['owner-a'],
      },
    };
    const normalSourceResult = buildProjectionReadinessState(sourceInput);
    t.equal(
      normalSourceResult.state,
      PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
      'the supported publication source starts serve-ready',
    );
    const setIteratorPrototype = objectGetPrototypeOf(new Set().values());
    const mutations = [
      ['Array.prototype.map', Array.prototype, 'map'],
      ['Array.prototype.filter', Array.prototype, 'filter'],
      ['Array.prototype.sort', Array.prototype, 'sort'],
      ['Array.prototype.find', Array.prototype, 'find'],
      ['Array.prototype.includes', Array.prototype, 'includes'],
      ['Array.prototype iterator', Array.prototype, Symbol.iterator],
      ['Set.prototype.add', Set.prototype, 'add'],
      ['Set.prototype.has', Set.prototype, 'has'],
      ['Set iterator next', setIteratorPrototype, 'next'],
      ['WeakMap.prototype.get', WeakMap.prototype, 'get'],
      ['WeakMap.prototype.set', WeakMap.prototype, 'set'],
      ['global WeakMap', globalThis, 'WeakMap'],
      ['WeakSet.prototype.add', WeakSet.prototype, 'add'],
      ['WeakSet.prototype.has', WeakSet.prototype, 'has'],
      ['global WeakSet', globalThis, 'WeakSet'],
      ['String.prototype.trim', String.prototype, 'trim'],
      ['String.prototype.toUpperCase', String.prototype, 'toUpperCase'],
      ['global String', globalThis, 'String'],
      ['Number.isFinite', Number, 'isFinite'],
      ['global Number', globalThis, 'Number'],
      ['Object.keys', Object, 'keys'],
      ['Object.values', Object, 'values'],
      ['Array.isArray', Array, 'isArray'],
    ];

    for (let index = 0; index < mutations.length; index++) {
      const [label, target, key] = mutations[index];
      const restore = replaceProperty(target, key, throwingIntrinsic);
      let reconstructed = null;
      let sourceReconstructed = null;
      let escaped = null;
      try {
        reconstructed = buildProjectionReadinessState(deferred);
        sourceReconstructed = buildProjectionReadinessState(sourceInput);
      } catch (error) {
        escaped = error;
      } finally {
        restore();
      }
      t.equal(escaped, null, `${label} cannot escape reconstruction`);
      t.equal(
        reconstructed?.state,
        PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
        `${label} mutation still reconstructs a blocked projection`,
      );
      t.equal(
        sourceReconstructed?.state,
        PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
        `${label} mutation preserves the supported publication source`,
      );
    }

    const restoreInherited = replaceAccessor(
      Object.prototype,
      'publicationBoundaryOutcome',
      throwingIntrinsic,
    );
    let inheritedResult = null;
    let inheritedEscaped = null;
    try {
      inheritedResult = buildProjectionReadinessState(deferred);
    } catch (error) {
      inheritedEscaped = error;
    } finally {
      restoreInherited();
    }
    t.equal(inheritedEscaped, null,
      'an inherited publication-boundary getter cannot escape reconstruction');
    t.equal(
      inheritedResult?.state,
      PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      'inherited publication evidence cannot reopen the deferred projection',
    );

    const readyOwnerStream = Object.freeze({
      streamOutcome: 'published',
      recoveryOutcome: 'ready',
      freshnessFence: 'fresh',
      revision: Object.freeze({state: 'current'}),
    });
    const restoreInheritedReadyStream = replaceProperty(
      Object.prototype,
      'publicationOwnerStream',
      readyOwnerStream,
    );
    let inheritedReadyResult = null;
    let inheritedReadyEscaped = null;
    try {
      inheritedReadyResult = buildProjectionReadinessState(deferred);
    } catch (error) {
      inheritedReadyEscaped = error;
    } finally {
      restoreInheritedReadyStream();
    }
    t.equal(inheritedReadyEscaped, null,
      'an inherited ready owner stream cannot escape reconstruction');
    t.equal(inheritedReadyResult?.publication?.ready, false,
      'an inherited owner stream cannot mark deferred publication ready');
    t.equal(inheritedReadyResult?.evidence?.publicationReady, false,
      'an inherited owner stream cannot make deferred evidence positive');

    const inheritedInputKeys = [
      'publicationOwnerStream',
      'publicationOwnerStreamSource',
      'publicationRecoveryGate',
      'localProjectionRevision',
      'requiredProjectionRevision',
    ];
    for (let index = 0; index < inheritedInputKeys.length; index++) {
      const key = inheritedInputKeys[index];
      const restore = replaceAccessor(
        Object.prototype,
        key,
        throwingIntrinsic,
      );
      let reconstructed = null;
      let escaped = null;
      try {
        reconstructed = buildProjectionReadinessState(deferred);
      } catch (error) {
        escaped = error;
      } finally {
        restore();
      }
      t.equal(escaped, null,
        `an inherited ${key} getter cannot escape reconstruction`);
      t.equal(
        reconstructed?.publication?.ready,
        false,
        `an inherited ${key} getter cannot reopen deferred publication`,
      );
    }

    const hostileRevisionInputs = [
      [
        'nested revision accessor',
        Object.defineProperty({}, 'state', {
          configurable: true,
          enumerable: true,
          get: throwingIntrinsic,
        }),
      ],
      [
        'nested revision proxy',
        new Proxy({}, {get: throwingIntrinsic}),
      ],
    ];
    for (let index = 0; index < hostileRevisionInputs.length; index++) {
      const [label, revision] = hostileRevisionInputs[index];
      const source = {
        ...deferred,
        publicationOwnerStream: {
          streamOutcome: 'published',
          recoveryOutcome: 'ready',
          freshnessFence: 'fresh',
          revision,
        },
      };
      let reconstructed = null;
      let escaped = null;
      try {
        reconstructed = buildProjectionReadinessState(source);
      } catch (error) {
        escaped = error;
      }
      t.equal(escaped, null,
        `${label} cannot escape projection reconstruction`);
      t.equal(reconstructed?.publication?.ready, false,
        `${label} cannot make publication evidence positive`);
      t.equal(reconstructed?.evidence?.publicationReady, false,
        `${label} is rejected before projection evidence is consumed`);
    }

    const revisionValueFields = ['desired', 'committed', 'observed'];
    const hostileValueCellBuilders = [
      [
        'accessor',
        () => Object.defineProperty({}, 'value', {
          configurable: true,
          enumerable: true,
          get: throwingIntrinsic,
        }),
      ],
      [
        'proxy',
        () => ({value: new Proxy({}, {get: throwingIntrinsic})}),
      ],
    ];
    for (let fieldIndex = 0;
      fieldIndex < revisionValueFields.length;
      fieldIndex++) {
      for (let shapeIndex = 0;
        shapeIndex < hostileValueCellBuilders.length;
        shapeIndex++) {
        const field = revisionValueFields[fieldIndex];
        const [shape, buildValueCell] =
          hostileValueCellBuilders[shapeIndex];
        const label = `${field} revision value ${shape}`;
        const positiveSource = {
          ...buildPositiveSnapshot('owner-a'),
          publicationOwnerStream: {
            streamOutcome: 'published',
            recoveryOutcome: 'ready',
            freshnessFence: 'fresh',
            revision: {
              state: 'current',
              [field]: buildValueCell(),
            },
          },
        };
        let reconstructed = null;
        let escaped = null;
        try {
          reconstructed = buildProjectionReadinessState(positiveSource);
        } catch (error) {
          escaped = error;
        }
        t.equal(escaped, null,
          `${label} cannot escape projection reconstruction`);
        t.equal(
          reconstructed?.state ===
            PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
          false,
          `${label} cannot produce a serve-ready projection`,
        );
        t.equal(reconstructed?.publication?.ready, false,
          `${label} cannot fall back to a positive publication dimension`);
        t.equal(reconstructed?.publication?.ownerStream === null, true,
          `${label} cannot remain in the returned publication graph`);
        t.equal(reconstructed?.evidence?.publicationReady, false,
          `${label} cannot make publication evidence positive`);
      }
    }
    owner.shutdown();
  });

test('projection normalization reuses only recursively immutable evidence',
  async (t) => {
    const immutableSource = Object.freeze({
      dimensions: Object.freeze({
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      }),
      runtimeAuthority: Object.freeze({
        clusterMemberHealthy: true,
        processAlive: true,
      }),
      publicationOwnerStreamSource: Object.freeze({
        publicationEpoch: 1,
        publicationStatus: 'PUBLISHED',
        requiredAckNodeIds: Object.freeze(['owner-a']),
        acknowledgedNodeIds: Object.freeze(['owner-a']),
      }),
    });
    const first = buildProjectionReadinessState(immutableSource);
    const second = buildProjectionReadinessState(immutableSource);

    t.equal(second.evidence.raw, first.evidence.raw,
      'a recursively frozen source reuses its normalized graph');
    t.equal(first.evidence.dimensions, first.evidence.raw.dimensions,
      'one reconstruction shares its normalized dimensions');
    t.equal(first.evidence.runtimeAuthority,
      first.evidence.raw.runtimeAuthority,
      'one reconstruction shares its normalized runtime authority');

    const mutableSource = {
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      },
    };
    const beforeMutation = buildProjectionReadinessState(mutableSource);
    mutableSource.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE
    ] = false;
    const afterMutation = buildProjectionReadinessState(mutableSource);
    t.not(afterMutation.evidence.raw, beforeMutation.evidence.raw,
      'a mutable source is normalized again');
    t.equal(afterMutation.evidence.processAlive, false,
      'mutable evidence changes are observed instead of cached');

    const buildFrozenChain = (length) => {
      let chain = Object.freeze({leaf: true});
      for (let index = 1; index < length; index++) {
        chain = Object.freeze({next: chain});
      }
      return chain;
    };
    const wrapFrozenChain = (tail, length) => {
      let chain = tail;
      for (let index = 0; index < length; index++) {
        chain = Object.freeze({next: chain});
      }
      return chain;
    };
    const buildReadySourceWithExtra = (extra) => Object.freeze({
      ...immutableSource,
      extra,
    });
    const uncachedOverDepth = buildProjectionReadinessState(
      buildReadySourceWithExtra(
        wrapFrozenChain(buildFrozenChain(8), 9),
      ),
    );
    t.equal(uncachedOverDepth.state,
      PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      'an uncached over-depth graph fails closed');

    const primedTail = buildFrozenChain(8);
    buildProjectionReadinessState(primedTail);
    const cachedOverDepth = buildProjectionReadinessState(
      buildReadySourceWithExtra(wrapFrozenChain(primedTail, 9)),
    );
    t.equal(cachedOverDepth.state,
      PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      'cached subtree identity cannot bypass the depth limit');
    t.equal(cachedOverDepth.publication.ready, false,
      'a cached over-depth graph cannot retain positive publication');

    const atLimitTail = buildFrozenChain(8);
    const primed = buildProjectionReadinessState(atLimitTail);
    const cachedAtLimit = buildProjectionReadinessState(
      buildReadySourceWithExtra(wrapFrozenChain(atLimitTail, 6)),
    );
    t.equal(cachedAtLimit.state, first.state,
      'a cached subtree within the depth bound stays admitted');
    let atLimitCursor = cachedAtLimit.evidence.raw.extra;
    for (let index = 0; index < 6; index++) {
      atLimitCursor = atLimitCursor.next;
    }
    t.equal(atLimitCursor, primed.evidence.raw,
      'a cached subtree within the depth bound is reused by reference');
  });

test('all projection evidence records share the deep own-data boundary',
  async (t) => {
    const base = buildPositiveSnapshot('owner-a');
    const positiveDimensions = {
      ...base.dimensions,
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
    };
    const cases = [
      [
        'boundary reason-code proxy array',
        {
          publicationBoundaryOutcome: {
            ready: true,
            reasonCodes: new Proxy([], {get: throwingIntrinsic}),
          },
        },
      ],
      [
        'boundary unconsumed nested proxy',
        {
          publicationBoundaryOutcome: {
            ready: true,
            extra: new Proxy({}, {get: throwingIntrinsic}),
          },
        },
      ],
      [
        'priority-recovery reason-code proxy array',
        {
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: new Proxy([], {get: throwingIntrinsic}),
          },
        },
      ],
    ];

    for (let index = 0; index < cases.length; index++) {
      const [label, hostileEvidence] = cases[index];
      let reconstructed = null;
      let escaped = null;
      try {
        reconstructed = buildProjectionReadinessState({
          ...base,
          dimensions: positiveDimensions,
          ...hostileEvidence,
        });
      } catch (error) {
        escaped = error;
      }
      t.equal(escaped, null, `${label} cannot escape reconstruction`);
      t.equal(
        reconstructed?.state === PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
        false,
        `${label} cannot admit a serve-ready projection`,
      );
      t.equal(reconstructed?.publication?.boundaryOutcome === null, true,
        `${label} cannot remain in the returned boundary outcome`);
      t.equal(reconstructed?.evidence?.priorityRecovery == null, true,
        `${label} cannot remain in returned priority-recovery evidence`);
      const raw = reconstructed?.evidence?.raw;
      t.equal(
        Boolean(
          raw && (
            objectHasOwn(raw, 'publicationBoundaryOutcome') ||
            objectHasOwn(raw, 'priorityControlPlaneRecovery')
          ),
        ),
        false,
        `${label} cannot remain in returned raw evidence`);
    }
  });

test('invalid root fallback cannot re-enter inherited evidence', async (t) => {
  const invalidSource = {unsupported: () => true};
  const restoreThrowingStream = replaceAccessor(
    Object.prototype,
    'publicationOwnerStream',
    throwingIntrinsic,
  );
  let throwingResult = null;
  let throwingEscaped = null;
  try {
    throwingResult = buildProjectionReadinessState(invalidSource);
  } catch (error) {
    throwingEscaped = error;
  } finally {
    restoreThrowingStream();
  }
  t.equal(throwingEscaped, null,
    'invalid root fallback cannot execute an inherited stream getter');
  t.equal(
    throwingResult?.state === PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    false,
    'invalid root fallback remains fail closed after a throwing getter',
  );

  const inheritedDimensions = Object.freeze({
    [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
  });
  const restores = [
    replaceProperty(Object.prototype, 'dimensions', inheritedDimensions),
    replaceProperty(Object.prototype, 'runtimeAuthority', Object.freeze({
      processAlive: true,
      clusterMemberHealthy: true,
      repairEligible: true,
      recoveryEligible: true,
      writeEligible: true,
    })),
    replaceProperty(Object.prototype, 'publicationBoundaryOutcome',
      Object.freeze({ready: true})),
  ];
  let positiveResult = null;
  let positiveEscaped = null;
  try {
    positiveResult = buildProjectionReadinessState(invalidSource);
  } catch (error) {
    positiveEscaped = error;
  } finally {
    for (let index = restores.length - 1; index >= 0; index--) {
      restores[index]();
    }
  }
  t.equal(positiveEscaped, null,
    'invalid root fallback cannot throw under inherited positive evidence');
  t.equal(
    positiveResult?.state === PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    false,
    'invalid root fallback cannot reconstruct serve-ready from inheritance',
  );
  t.equal(positiveResult?.publication?.ready, false,
    'invalid root fallback cannot inherit publication readiness');
  t.equal(positiveResult?.evidence?.publicationReady, false,
    'invalid root evidence remains publication-negative');
});
