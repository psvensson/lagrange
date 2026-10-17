/**
 * Spent-wait witness for the dispatch readiness refresh race: the bounded
 * authoritative refresh logs exactly one wait_bound_spent ERROR on expiry,
 * none when the refresh settles first, and still rejects with the typed
 * CONTROL_PLANE_READINESS_REFRESH_TIMEOUT (deferRetry) error.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';


function createDispatchService(getNodeReadiness) {
  const scheduled = [];
  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {getNodeReadiness},
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs, cleared: false};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) handle.cleared = true;
    },
  });
  const capture = captureLogger();
  service.logger = capture.logger;
  return {service, scheduled, capture};
}

const DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

test('dispatch readiness refresh expiry logs one wait_bound_spent ERROR and ' +
  'still rejects with the typed refresh timeout', async (t) => {
  initEnv();
  const {service, scheduled, capture} = createDispatchService(
    () => new Promise(() => {}),
  );
  try {
    const pending = service.getBoundedDispatchReadiness(
      'node-refresh-spent-a',
      DIMENSION,
    );
    t.equal(scheduled.length, 1, 'one refresh deadline armed');
    t.equal(scheduled[0].delayMs, service.dispatchReadinessRefreshTimeoutMs);
    scheduled[0].callback();
    await t.rejects(pending, {
      code: 'CONTROL_PLANE_READINESS_REFRESH_TIMEOUT',
      deferRetry: true,
      targetNodeId: 'node-refresh-spent-a',
    }, 'expiry still rejects with the typed timeout (unchanged)');

    const spent = capture.spent();
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    const context = spent[0].context;
    t.equal(context.wait, 'OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS');
    t.equal(context.boundMs, service.dispatchReadinessRefreshTimeoutMs);
    t.same(context.lastObserved, {
      refreshSettled: false,
      decisionDimension: DIMENSION,
      requestedMaxCachedAgeMs: 0,
    });
    t.equal(context.scope.targetNodeId, 'node-refresh-spent-a');
  } finally {
    service.stop();
  }
});

test('dispatch readiness refresh settling first logs no spent wait',
  async (t) => {
    initEnv();
    const readiness = {nodeId: 'node-refresh-spent-b', dimensions: {}};
    const {service, scheduled, capture} = createDispatchService(
      async () => readiness,
    );
    try {
      const result = await service.getBoundedDispatchReadiness(
        'node-refresh-spent-b',
        DIMENSION,
      );
      t.equal(result, readiness, 'refresh result returned (unchanged)');
      t.equal(scheduled[0].cleared, true, 'deadline cleared on settle');
      t.equal(capture.spent().length, 0, 'no wait_bound_spent on completion');
    } finally {
      service.stop();
    }
  });
