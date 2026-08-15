import {test} from '../../src/test-helpers/tap.js';
import {
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  buildProjectionReadinessState,
} from '../../src/control-plane/projection-readiness-state.js';

const READINESS_BUILD_NOW_MS = 620000;

test('one readiness build constructs one projection contract shared with ' +
  'its transition state', async (t) => {
  const nodeId = 'node-single-contract-build';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => READINESS_BUILD_NOW_MS,
  });

  const readiness = readinessService.getNodeReadinessSync(nodeId);
  t.ok(
    readiness.projectionReadinessContract &&
      typeof readiness.projectionReadinessContract === 'object',
    'the evaluated snapshot carries a projection contract',
  );
  const transitionState =
    readinessService.lastReadinessEvaluationByNodeId.get(nodeId);
  t.equal(
    transitionState.projectionReadinessContract,
    readiness.projectionReadinessContract,
    'the transition state reuses the snapshot contract instead of ' +
      'rebuilding it',
  );

  const missingNodeId = 'node-absent-contract-build';
  const missingReadiness =
    readinessService.buildAndStoreMissingNodeReadinessSnapshot({
      nodeId: missingNodeId,
      observedAt: '2026-03-04T00:00:01.000Z',
      publication: null,
      membershipPublication: null,
      persistSnapshot: true,
      buildStartedAtMs: READINESS_BUILD_NOW_MS,
      options: {},
    });
  const missingTransitionState =
    readinessService.lastReadinessEvaluationByNodeId.get(missingNodeId);
  t.equal(
    missingTransitionState.projectionReadinessContract,
    missingReadiness.projectionReadinessContract,
    'the missing-node transition state reuses the missing readiness ' +
      'contract instead of rebuilding it',
  );
  t.end();
});

function collectUnfrozenPaths(value, pathLabel, unfrozen, seen) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    unfrozen.push(pathLabel);
  }
  for (const key of Object.keys(value)) {
    collectUnfrozenPaths(value[key], `${pathLabel}.${key}`, unfrozen, seen);
  }
}

test('membership publication diagnostics are recursively frozen and reused ' +
  'by the projection normalization cache', async (t) => {
  const nodeId = 'node-frozen-publication-diagnostics';
  const peerNodeId = 'node-frozen-publication-peer';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => READINESS_BUILD_NOW_MS,
  });
  const diagnostics = readinessService.buildMembershipPublicationDiagnostics(
    {
      publicationEpoch: 7,
      status: 'PUBLISHED',
      publishedActiveNodeIds: [nodeId, peerNodeId],
      requiredAckNodeIds: [nodeId, peerNodeId],
      acknowledgedNodeIds: [nodeId, peerNodeId],
      priorityPartitionSummary: {
        totalPriorityPartitions: 2,
        partitions: [
          {partitionId: 'p-0', ready: true, ownerNodeId: nodeId},
          {partitionId: 'p-1', ready: false, ownerNodeId: peerNodeId},
        ],
      },
      membershipLifecycleSummary: {
        memberStatesByNodeId: {
          [nodeId]: 'ACTIVE',
          [peerNodeId]: 'ACTIVE',
        },
        recoveryEpochByNodeId: {
          [nodeId]: '3',
        },
        participationByNodeId: {
          [nodeId]: {state: 'published_active', admissionState: 'admitted'},
          [peerNodeId]: {state: 'published_active', admissionState: 'admitted'},
        },
      },
    },
    '2026-03-04T00:00:01.000Z',
  );
  t.ok(diagnostics, 'the producer emits publication diagnostics');

  const unfrozen = [];
  collectUnfrozenPaths(diagnostics, 'diagnostics', unfrozen, new Set());
  t.same(unfrozen, [],
    'every reachable publication diagnostics record is frozen');

  const firstBuild = buildProjectionReadinessState({
    membershipPublication: diagnostics,
  });
  const secondBuild = buildProjectionReadinessState({
    membershipPublication: diagnostics,
  });
  t.equal(
    secondBuild.evidence.raw.membershipPublication,
    firstBuild.evidence.raw.membershipPublication,
    'repeat readiness builds reuse the normalized publication diagnostics ' +
      'by reference instead of re-copying the graph',
  );
  t.end();
});

test('canonical dense record arrays are strict-copied once and reused by ' +
  'identity', async (t) => {
  const {copyCanonicalDenseOwnDataRecordArray} = await import(
    '../../src/control-plane/' +
      'membership-publication-priority-partition-canonical-data.js'
  );
  const sourceRows = [
    {partition_id: 'p-0', node_id: 'n1', status: 'active'},
    {partition_id: 'p-1', node_id: 'n2', status: 'active'},
  ];
  const canonical = copyCanonicalDenseOwnDataRecordArray(sourceRows);
  t.ok(Array.isArray(canonical), 'a plain record array is copied');
  t.not(canonical, sourceRows, 'the first crossing produces a fresh copy');
  t.ok(Object.isFrozen(canonical) && Object.isFrozen(canonical[0]),
    'the canonical copy and its rows are frozen');

  const reused = copyCanonicalDenseOwnDataRecordArray(canonical);
  t.equal(reused, canonical,
    'a canonical copy re-crossing the boundary is reused by identity');

  const recopied = copyCanonicalDenseOwnDataRecordArray(sourceRows);
  t.not(recopied, canonical,
    'the unregistered source array is strict-copied again, never trusted');

  const hostileRows = [{}];
  Object.defineProperty(hostileRows[0], 'status', {
    get() {
      return 'active';
    },
    enumerable: true,
    configurable: true,
  });
  t.equal(copyCanonicalDenseOwnDataRecordArray(hostileRows), null,
    'a record with an accessor property is denied');
  const sparseRows = [];
  sparseRows[1] = {partition_id: 'p-1'};
  t.equal(copyCanonicalDenseOwnDataRecordArray(sparseRows), null,
    'a sparse array is denied');
  t.end();
});
