import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {CONTROL_PLANE_PUBLICATION_MODE} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

// DT4 step 1 (seam proof): a VirtualTimeSource passed to the readiness service
// must DRIVE its clock — this is what lets the convergence harness advance time
// to reproduce the freeze→leadership chain in-process. Without a real consumer,
// the TimeSource abstraction would be inert; this test makes the collapse
// load-bearing (and would go RED if the participation base reverted to a bare
// `() => Date.now()`).

function buildService(options) {
  const cache = createCache({
    nodes: [createActiveNode('node-1')],
    services: [createMessageGroupService('node-1')],
  });
  return new ControlPlaneReadinessService({
    nodeId: 'node-1',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-1': {nodeId: 'node-1', budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    ...options,
  });
}

test('a VirtualTimeSource drives the readiness service clock', async (t) => {
  const virtual = new VirtualTimeSource({startMs: 1000});
  const service = buildService({timeSource: virtual});

  t.equal(service.now(), 1000,
    'service.now() reflects the virtual clock, not Date.now()');

  virtual.advance(500);
  t.equal(service.now(), 1500,
    'advancing the virtual clock advances the service clock deterministically');
});

test('an explicit now option still wins over timeSource (precedence preserved)',
  async (t) => {
    const virtual = new VirtualTimeSource({startMs: 1000});
    const service = buildService({timeSource: virtual, now: () => 4242});

    t.equal(service.now(), 4242,
      'explicit options.now takes precedence over the timeSource');
    virtual.advance(1000);
    t.equal(service.now(), 4242, 'advancing the virtual clock does not affect it');
  });

test('the default (no timeSource, no now) tracks the wall clock', async (t) => {
  const service = buildService({});
  const before = Date.now();
  const now = service.now();
  const after = Date.now();
  t.ok(now >= before && now <= after,
    'default readiness clock is the platform wall clock (byte-identical default)');
});
