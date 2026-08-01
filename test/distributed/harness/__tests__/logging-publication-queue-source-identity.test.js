import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  buildRollingRestartLivenessVerdict,
} from '../../../../scripts/rolling-restart-liveness-classifier.js';
import {AdminControlSnapshot} from
  '../../../../src/admin/admin-control-snapshot.js';
import {LogsTableService} from
  '../../../../src/logging/logs-table-service.js';
import {createCluster} from './cluster-test-helpers.js';
import {CLUSTER_ACTIVE_WAIT_PROGRESS_LAYER} from
  '../cluster-active-wait-progress-layer.js';

const MEMBERSHIP_OWNER_SOURCE = 'membership_publication_owner';
const LOGGING_RETENTION_SOURCE = 'logs_table_retention';
const SOURCE_STATE_SEPARATED = 'separated';
const SOURCE_STATE_LEGACY_AMBIGUOUS = 'legacy_ambiguous';
const OWNER_QUEUE_ADMISSION_REPAIR = 'repair_owner_queue_admission';
const OWNER_QUEUE_EMPTY_CONTRADICTION =
  'owner_action_enabled_queue_empty';
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;

function buildSnapshotResult({explicitOwner = true} = {}) {
  const controlPlaneDiagnostics = {
    logsTable: {
      source: LOGGING_RETENTION_SOURCE,
      pendingWrites: 515,
      pendingWriteGrowthCount: 1343,
      retainedBacklogGrowthCount: 0,
      maxPendingWrites: 10000,
      isWriting: true,
    },
  };
  if (explicitOwner) {
    controlPlaneDiagnostics.controlPlaneOwnerQueueDepth = {
      source: MEMBERSHIP_OWNER_SOURCE,
      pendingWrites: 0,
      pendingWriteGrowthCount: 0,
      retainedBacklogGrowthCount: 0,
      ownerKey: 'membership-publication:cluster_membership',
      pendingKeys: [],
      retryingKeys: [],
      inFlightKeys: [],
      retryableDrainFailureCount: 0,
    };
  }
  return {rows: [{controlPlaneDiagnostics}]};
}

function buildLivenessArtifact({ownerPendingWrites, loggingPendingWrites}) {
  return {
    scenarios: [{
      scenario: 'rolling-restart',
      publicationConvergence: {
        activeGate: {
          progress: {
            publicationEpoch: 92,
            missingPublishedCount: 0,
            publicationActiveGateHandoffPendingReconcileCount: 0,
            publicationActiveGateHandoffNextAction: 'wait_owner_recovery',
            membershipPublicationHandoffOutcomeState: 'write_deferred',
            membershipPublicationHandoffOutcomeReasonCode:
              'owner_reconcile_pending',
            membershipPublicationHandoffOutcomeEnqueued: true,
            selectedQueueDiagnosticsSourceState: SOURCE_STATE_SEPARATED,
            selectedControlPlaneOwnerQueueDepth: {
              source: MEMBERSHIP_OWNER_SOURCE,
              pendingWrites: ownerPendingWrites,
              pendingWriteGrowthCount: 0,
              ownerKey: 'membership-publication:cluster_membership',
              pendingKeys: ownerPendingWrites > 0 ?
                ['membership-publication:cluster_membership'] : [],
              retryingKeys: [],
              inFlightKeys: [],
            },
            selectedLoggingRetentionQueueDepth: {
              source: LOGGING_RETENTION_SOURCE,
              pendingWrites: loggingPendingWrites,
              pendingWriteGrowthCount: loggingPendingWrites > 0 ? 1343 : 0,
            },
          },
        },
        rollingRestartLivenessEvidence: {
          complete: true,
          samples: [],
        },
      },
    }],
  };
}

test('control snapshot producer emits independent queue witnesses', async () => {
  const originalLogsTableInstance = LogsTableService.instance;
  LogsTableService.instance = {
    getStats() {
      return {
        pendingWrites: 515,
        pendingWriteGrowthCount: 1343,
        retainedBacklogGrowthCount: 0,
        retainedPressureBacklogCap: 1000,
        maxPendingWrites: 10000,
        isWriting: true,
        consecutiveDeferredWriteFailures: 0,
        sharedPressureBackpressured: false,
        transportPressureBackpressured: false,
        queryPressureBackpressured: false,
      };
    },
  };
  try {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'seed-node',
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getControlPlaneOwnerQueueDepth() {
            return {
              pendingWrites: 0,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              ownerKey: 'membership-publication:cluster_membership',
              pendingKeys: [],
              retryingKeys: [],
              inFlightKeys: [],
              retryableDrainFailureCount: 0,
            };
          },
        },
      },
    });

    const diagnostics = await snapshot.buildControlPlaneDiagnosticsSnapshot();

    assert.equal(diagnostics.logsTable.source, LOGGING_RETENTION_SOURCE);
    assert.equal(diagnostics.logsTable.pendingWrites, 515);
    assert.equal(
      objectHasOwn(diagnostics.logsTable, 'ownerKey'),
      false,
    );
    assert.equal(
      diagnostics.controlPlaneOwnerQueueDepth.source,
      MEMBERSHIP_OWNER_SOURCE,
    );
    assert.equal(diagnostics.controlPlaneOwnerQueueDepth.pendingWrites, 0);
    assert.deepEqual(diagnostics.controlPlaneOwnerQueueDepth.pendingKeys, []);
    assert.equal(
      objectHasOwn(
        diagnostics.controlPlaneOwnerQueueDepth,
        'maxPendingWrites',
      ),
      false,
    );
  } finally {
    LogsTableService.instance = originalLogsTableInstance;
  }
});

test('source-separated snapshot keeps logging backlog out of owner depth', () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  const diagnostics = cluster._extractControlSnapshotCoverageDiagnostics(
    buildSnapshotResult(),
  );

  assert.equal(diagnostics.queueDiagnosticsSourceState, SOURCE_STATE_SEPARATED);
  assert.equal(diagnostics.controlPlaneOwnerQueueDepth.pendingWrites, 0);
  assert.equal(
    diagnostics.controlPlaneOwnerQueueDepth.source,
    MEMBERSHIP_OWNER_SOURCE,
  );
  assert.equal(diagnostics.loggingRetentionQueueDepth.pendingWrites, 515);
  assert.equal(
    diagnostics.loggingRetentionQueueDepth.pendingWriteGrowthCount,
    1343,
  );
  assert.equal(
    diagnostics.loggingRetentionQueueDepth.source,
    LOGGING_RETENTION_SOURCE,
  );
});

test('ACTIVE-gate progress carries both selected queue witnesses', () => {
  const ownerQueue = {
    source: MEMBERSHIP_OWNER_SOURCE,
    pendingWrites: 0,
    pendingWriteGrowthCount: 0,
  };
  const loggingQueue = {
    source: LOGGING_RETENTION_SOURCE,
    pendingWrites: 515,
    pendingWriteGrowthCount: 1343,
  };
  const progress =
    CLUSTER_ACTIVE_WAIT_PROGRESS_LAYER.buildActiveWaitProgressSnapshot({
      nodeDiagnostics: [{nodeId: 'seed-node', active: false}],
      snapshotCoverage: {
        expectedNodeCount: 1,
        bestCoverageNodeCount: 1,
        completeCoverage: true,
        selectedQueueDiagnosticsSourceState: SOURCE_STATE_SEPARATED,
        selectedControlPlaneOwnerQueueDepth: ownerQueue,
        selectedObservedControlPlaneOwnerQueueDepth: ownerQueue,
        selectedLoggingRetentionQueueDepth: loggingQueue,
        selectedPublicationConvergence: {
          publicationEpoch: 92,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['seed-node'],
        },
      },
    }, 1);

  assert.equal(
    progress.selectedQueueDiagnosticsSourceState,
    SOURCE_STATE_SEPARATED,
  );
  assert.equal(
    progress.selectedObservedControlPlaneOwnerQueueDepth.pendingWrites,
    0,
  );
  assert.equal(progress.selectedLoggingRetentionQueueDepth.pendingWrites, 515);
});

test('legacy merged queue witness is marked ambiguous', () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  const legacy = buildSnapshotResult({explicitOwner: false});
  delete legacy.rows[0].controlPlaneDiagnostics.logsTable.source;
  legacy.rows[0].controlPlaneDiagnostics.logsTable.ownerKey =
    'membership-publication:cluster_membership';
  legacy.rows[0].controlPlaneDiagnostics.logsTable.pendingKeys = [];

  const diagnostics = cluster._extractControlSnapshotCoverageDiagnostics(
    legacy,
  );

  assert.equal(
    diagnostics.queueDiagnosticsSourceState,
    SOURCE_STATE_LEGACY_AMBIGUOUS,
  );
});

test('inherited queue fields cannot impersonate source-owned evidence', () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  const inheritedOwner = objectCreate({
    pendingWrites: 99,
    pendingKeys: ['membership-publication:cluster_membership'],
  });
  inheritedOwner.source = MEMBERSHIP_OWNER_SOURCE;
  const inheritedLogging = objectCreate({
    pendingWrites: 999,
    pendingWriteGrowthCount: 999,
  });
  inheritedLogging.source = LOGGING_RETENTION_SOURCE;
  const diagnostics = cluster._extractControlSnapshotCoverageDiagnostics({
    rows: [{
      controlPlaneDiagnostics: {
        controlPlaneOwnerQueueDepth: inheritedOwner,
        logsTable: inheritedLogging,
      },
    }],
  });

  assert.equal(diagnostics.queueDiagnosticsSourceState, SOURCE_STATE_SEPARATED);
  assert.equal(diagnostics.controlPlaneOwnerQueueDepth.pendingWrites, null);
  assert.deepEqual(diagnostics.controlPlaneOwnerQueueDepth.pendingKeys, []);
  assert.equal(diagnostics.loggingRetentionQueueDepth.pendingWrites, null);
  assert.equal(
    diagnostics.loggingRetentionQueueDepth.pendingWriteGrowthCount,
    null,
  );

  const artifact = buildLivenessArtifact({
    ownerPendingWrites: 0,
    loggingPendingWrites: 515,
  });
  const progress = artifact.scenarios[0].publicationConvergence.activeGate
    .progress;
  progress.selectedQueueDiagnosticsSourceState =
    diagnostics.queueDiagnosticsSourceState;
  progress.selectedControlPlaneOwnerQueueDepth =
    diagnostics.controlPlaneOwnerQueueDepth;
  progress.selectedLoggingRetentionQueueDepth =
    diagnostics.loggingRetentionQueueDepth;
  const verdict = buildRollingRestartLivenessVerdict(artifact);

  assert.equal(verdict.queueState.owner.state, 'absent');
  assert.equal(verdict.queueState.contradiction, 'absent');
  assert.notEqual(verdict.enabledAction, OWNER_QUEUE_ADMISSION_REPAIR);
});

test('queue source normalization rejects accessors and unsafe scalars', () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  let getterCalls = 0;
  const trappedKeys = [];
  objectDefineProperty(trappedKeys, 0, {
    configurable: true,
    get() {
      getterCalls += 1;
      return 'membership-publication:cluster_membership';
    },
  });
  const ownerQueue = {
    source: MEMBERSHIP_OWNER_SOURCE,
    pendingWrites: Number.MAX_SAFE_INTEGER + 100,
    pendingWriteGrowthCount: -0,
    retainedBacklogGrowthCount: Number.POSITIVE_INFINITY,
    pendingKeys: trappedKeys,
    retryingKeys: Object('boxed'),
    inFlightKeys: [],
  };
  objectDefineProperty(ownerQueue, 'ownerKey', {
    configurable: true,
    get() {
      getterCalls += 1;
      return 'membership-publication:cluster_membership';
    },
  });
  const loggingQueue = {
    source: LOGGING_RETENTION_SOURCE,
    pendingWrites: Number.NaN,
    pendingWriteGrowthCount: -1,
    maxPendingWrites: Object(10000),
  };

  const diagnostics = cluster._extractControlSnapshotCoverageDiagnostics({
    rows: [{
      controlPlaneDiagnostics: {
        controlPlaneOwnerQueueDepth: ownerQueue,
        logsTable: loggingQueue,
      },
    }],
  });

  assert.equal(getterCalls, 0);
  assert.equal(
    diagnostics.controlPlaneOwnerQueueDepth.pendingWrites,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    objectIs(
      diagnostics.controlPlaneOwnerQueueDepth.pendingWriteGrowthCount,
      -0,
    ),
    false,
  );
  assert.equal(
    diagnostics.controlPlaneOwnerQueueDepth.retainedBacklogGrowthCount,
    null,
  );
  assert.equal(diagnostics.controlPlaneOwnerQueueDepth.ownerKey, null);
  assert.deepEqual(diagnostics.controlPlaneOwnerQueueDepth.pendingKeys, []);
  assert.deepEqual(diagnostics.controlPlaneOwnerQueueDepth.retryingKeys, []);
  assert.equal(diagnostics.loggingRetentionQueueDepth.pendingWrites, null);
  assert.equal(
    diagnostics.loggingRetentionQueueDepth.pendingWriteGrowthCount,
    null,
  );
  assert.equal(diagnostics.loggingRetentionQueueDepth.maxPendingWrites, null);
});

test('queue source normalization ignores polluted collection prototypes', () => {
  const originalObjectPendingWrites = objectGetOwnPropertyDescriptor(
    Object.prototype,
    'pendingWrites',
  );
  const originalArrayEntry = objectGetOwnPropertyDescriptor(
    Array.prototype,
    0,
  );
  objectDefineProperty(Object.prototype, 'pendingWrites', {
    configurable: true,
    writable: true,
    value: 777,
  });
  objectDefineProperty(Array.prototype, 0, {
    configurable: true,
    writable: true,
    value: 'membership-publication:cluster_membership',
  });
  let diagnostics;
  try {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    diagnostics = cluster._extractControlSnapshotCoverageDiagnostics({
      rows: [{
        controlPlaneDiagnostics: {
          controlPlaneOwnerQueueDepth: {
            source: MEMBERSHIP_OWNER_SOURCE,
            pendingKeys: [],
            retryingKeys: [],
            inFlightKeys: [],
          },
          logsTable: {source: LOGGING_RETENTION_SOURCE},
        },
      }],
    });
  } finally {
    delete Object.prototype.pendingWrites;
    delete Array.prototype[0];
    if (originalObjectPendingWrites) {
      objectDefineProperty(
        Object.prototype,
        'pendingWrites',
        originalObjectPendingWrites,
      );
    }
    if (originalArrayEntry) {
      objectDefineProperty(Array.prototype, 0, originalArrayEntry);
    }
  }

  assert.equal(diagnostics.controlPlaneOwnerQueueDepth.pendingWrites, null);
  assert.equal(diagnostics.loggingRetentionQueueDepth.pendingWrites, null);
  assert.deepEqual(diagnostics.controlPlaneOwnerQueueDepth.pendingKeys, []);
});

test('liveness queue identity survives post-import intrinsic replacement', () => {
  const originalFind = objectGetOwnPropertyDescriptor(Array.prototype, 'find');
  const originalNumberIsFinite = objectGetOwnPropertyDescriptor(
    Number,
    'isFinite',
  );
  let verdict;
  objectDefineProperty(Array.prototype, 'find', {
    ...originalFind,
    value(predicate, thisArg) {
      if (predicate?.name === 'isRecord') {
        return {
          source: MEMBERSHIP_OWNER_SOURCE,
          pendingWrites: 777,
        };
      }
      return originalFind.value.call(this, predicate, thisArg);
    },
  });
  objectDefineProperty(Number, 'isFinite', {
    ...originalNumberIsFinite,
    value() {
      return false;
    },
  });
  try {
    verdict = buildRollingRestartLivenessVerdict(
      buildLivenessArtifact({ownerPendingWrites: 0, loggingPendingWrites: 515}),
    );
  } finally {
    objectDefineProperty(Array.prototype, 'find', originalFind);
    objectDefineProperty(Number, 'isFinite', originalNumberIsFinite);
  }

  assert.equal(verdict.queueState.sourceState, SOURCE_STATE_SEPARATED);
  assert.equal(verdict.queueState.owner.pendingWrites, 0);
  assert.equal(verdict.queueState.logging.pendingWrites, 515);
  assert.equal(verdict.enabledAction, OWNER_QUEUE_ADMISSION_REPAIR);
});

test('liveness classifier validates nested queue source identities', () => {
  const artifact = buildLivenessArtifact({
    ownerPendingWrites: 515,
    loggingPendingWrites: 0,
  });
  const progress = artifact.scenarios[0].publicationConvergence.activeGate
    .progress;
  progress.selectedControlPlaneOwnerQueueDepth.source =
    LOGGING_RETENTION_SOURCE;
  progress.selectedLoggingRetentionQueueDepth.source =
    MEMBERSHIP_OWNER_SOURCE;

  const verdict = buildRollingRestartLivenessVerdict(artifact);

  assert.equal(verdict.queueState.sourceState, SOURCE_STATE_LEGACY_AMBIGUOUS);
  assert.equal(verdict.queueState.owner.state, 'ambiguous');
  assert.equal(verdict.queueState.contradiction, 'absent');
});

test('empty owner queue plus logging backlog names owner admission loss', () => {
  const verdict = buildRollingRestartLivenessVerdict(
    buildLivenessArtifact({ownerPendingWrites: 0, loggingPendingWrites: 515}),
  );

  assert.equal(verdict.queueState.sourceState, SOURCE_STATE_SEPARATED);
  assert.equal(verdict.queueState.owner.pendingWrites, 0);
  assert.equal(verdict.queueState.logging.pendingWrites, 515);
  assert.equal(
    verdict.queueState.contradiction,
    OWNER_QUEUE_EMPTY_CONTRADICTION,
  );
  assert.equal(verdict.enabledAction, OWNER_QUEUE_ADMISSION_REPAIR);
});

test('liveness classifier does not relabel legacy merged depth as owner truth', () => {
  const artifact = buildLivenessArtifact({
    ownerPendingWrites: 515,
    loggingPendingWrites: 0,
  });
  const progress = artifact.scenarios[0].publicationConvergence.activeGate
    .progress;
  progress.selectedQueueDiagnosticsSourceState =
    SOURCE_STATE_LEGACY_AMBIGUOUS;
  delete progress.selectedLoggingRetentionQueueDepth;
  delete progress.selectedControlPlaneOwnerQueueDepth.source;

  const verdict = buildRollingRestartLivenessVerdict(artifact);

  assert.equal(verdict.queueState.sourceState, SOURCE_STATE_LEGACY_AMBIGUOUS);
  assert.equal(verdict.queueState.owner.state, 'ambiguous');
  assert.equal(verdict.queueState.contradiction, 'absent');
});

test('real membership owner work retains wait-owner-recovery attribution', () => {
  const verdict = buildRollingRestartLivenessVerdict(
    buildLivenessArtifact({ownerPendingWrites: 1, loggingPendingWrites: 0}),
  );

  assert.equal(verdict.queueState.sourceState, SOURCE_STATE_SEPARATED);
  assert.equal(verdict.queueState.owner.pendingWrites, 1);
  assert.equal(verdict.queueState.logging.pendingWrites, 0);
  assert.equal(verdict.queueState.contradiction, 'absent');
  assert.equal(verdict.enabledAction, 'wait_owner_recovery');
});
