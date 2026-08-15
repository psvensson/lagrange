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
