import {test} from '../../src/test-helpers/tap.js';
import {StartupRuntimeHandoffOwner} from
  '../../src/bootstrap/owners/startup-runtime-handoff-owner.js';

test(
  'StartupRuntimeHandoffOwner retries background writer activation after ' +
    'metadata publication readiness defers',
  async (t) => {
    let metadataReady = false;
    let deferredCount = 0;
    let activatedCount = 0;
    let leaseStartCount = 0;
    let heartbeatStartCount = 0;
    const scheduledTimers = [];

    const leaseService = {
      state: 'stopped',
      start() {
        leaseStartCount += 1;
      },
    };
    const heartbeatService = {
      state: 'stopped',
      start() {
        heartbeatStartCount += 1;
      },
    };

    const owner = new StartupRuntimeHandoffOwner({
      delegates: {
        isShuttingDown: () => false,
        getMetadataPublicationReadinessOptions: () => ({
          readinessState: {
            getSnapshot() {
              return metadataReady ?
                {
                  ready: true,
                  phase: 'TRAFFIC_READY',
                  reasons: [],
                  retryAfterMs: 1,
                } :
                {
                  ready: false,
                  phase: 'DISCOVERING',
                  reasons: ['runtime_wiring_incomplete'],
                  retryAfterMs: 7,
                };
            },
          },
          maxAttempts: 1,
          initialDelayMs: 1,
          maxDelayMs: 1,
          sleep: async () => {},
        }),
        onMetadataPublicationReadinessDeferred: () => {
          deferredCount += 1;
        },
        onControlPlaneBackgroundWritersActivated: () => {
          activatedCount += 1;
        },
        getSetTimeoutFn: () => (callback, delayMs) => {
          const handle = {
            callback,
            delayMs,
            cleared: false,
            unrefCalled: false,
            unref() {
              this.unrefCalled = true;
            },
          };
          scheduledTimers.push(handle);
          return handle;
        },
        getClearTimeoutFn: () => (handle) => {
          if (handle && typeof handle === 'object') {
            handle.cleared = true;
          }
        },
        getLeaseService: () => leaseService,
        getHeartbeatService: () => heartbeatService,
        getLeaseRunningState: () => 'running',
        getHeartbeatRunningState: () => 'running',
      },
    });

    await owner.activateControlPlaneBackgroundWriters();

    t.equal(
      deferredCount,
      1,
      'owner should emit one deferred callback when metadata readiness is not yet satisfied',
    );
    t.equal(
      scheduledTimers.length,
      1,
      'owner should schedule one activation retry timer',
    );
    t.equal(
      scheduledTimers[0].delayMs,
      1,
      'owner should honor bounded readiness retryAfter hint for retry delay',
    );
    t.equal(
      scheduledTimers[0].unrefCalled,
      true,
      'retry timer should be unrefed so startup retries do not pin process exit',
    );
    t.equal(
      leaseStartCount,
      0,
      'lease writer should remain stopped until retry succeeds',
    );
    t.equal(
      heartbeatStartCount,
      0,
      'heartbeat writer should remain stopped until retry succeeds',
    );

    metadataReady = true;
    scheduledTimers[0].callback();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      leaseStartCount,
      1,
      'lease writer should start after scheduled retry observes metadata readiness',
    );
    t.equal(
      heartbeatStartCount,
      1,
      'heartbeat writer should start after scheduled retry observes metadata readiness',
    );
    t.equal(
      activatedCount,
      1,
      'owner should emit activation callback once background writers are active',
    );
    t.equal(
      owner.hasActiveControlPlaneBackgroundWriters(),
      true,
      'owner should report background writers active after retry activation',
    );
  },
);
