import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {
  MembershipPublicationCoordinatorReconcile,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// DT4 step 1 (seam proofs): a VirtualTimeSource must DRIVE the HLC physical clock,
// the lease clock + sweep timer, and the owner-membership driver interval — these
// are the subsystems the convergence harness advances to reproduce the
// freeze→leadership chain in-process. Each test is red-on-revert: it fails if the
// subsystem goes back to a bare Date.now()/setInterval.

t.test('HLC physical clock reads through the TimeSource', async (t) => {
  const virtual = new VirtualTimeSource({startMs: 5000});
  const clock = new HLCClockService('node-1', {timeSource: virtual});

  const first = clock.now();
  t.equal(first.physical, 5000,
    'physical timestamp tracks the virtual clock, not Date.now()');
  // Same physical instant -> logical counter advances (HLC invariant).
  const second = clock.now();
  t.equal(second.physical, 5000, 'physical unchanged without advance');
  t.equal(second.logical, first.logical + 1, 'logical increments at the same instant');

  virtual.advance(100);
  const third = clock.now();
  t.equal(third.physical, 5100, 'advancing the virtual clock advances HLC physical');
  t.equal(third.logical, 0, 'logical resets when physical advances');
});

t.test('HLC default (no timeSource) tracks the wall clock', async (t) => {
  const before = Date.now();
  const clock = new HLCClockService('node-1');
  const after = Date.now();
  t.ok(clock.physical >= before && clock.physical <= after,
    'default HLC physical clock is the platform wall clock');
});

t.test('LeaseService clock reads through the TimeSource', async (t) => {
  const virtual = new VirtualTimeSource({startMs: 7000});
  const service = new LeaseService({nodeId: 'node-1', timeSource: virtual});

  t.equal(service.now(), 7000, 'lease now() tracks the virtual clock');
  virtual.advance(250);
  t.equal(service.now(), 7250, 'advancing the virtual clock advances lease now()');
});

t.test('LeaseService default (no timeSource) tracks the wall clock', async (t) => {
  const service = new LeaseService({nodeId: 'node-1'});
  const before = Date.now();
  const now = service.now();
  const after = Date.now();
  t.ok(now >= before && now <= after, 'default lease clock is the platform wall clock');
});

t.test('owner-membership driver interval runs on the TimeSource', async (t) => {
  const start =
    MembershipPublicationCoordinatorReconcile.prototype.startOwnerMembershipDriver;
  const stop =
    MembershipPublicationCoordinatorReconcile.prototype.stopOwnerMembershipDriver;

  const virtual = new VirtualTimeSource();
  let drives = 0;
  const ctx = {
    nodeId: 'seed',
    logger: {warn: () => {}},
    driveOwnerMembershipReconcile: async () => {
      drives += 1;
    },
  };

  start.call(ctx, {enabled: true, intervalMs: 100, timeSource: virtual});
  t.equal(drives, 0, 'no drive before the virtual clock advances');

  virtual.advance(350);
  t.equal(drives, 3, 'driver fired at 100/200/300 on the virtual clock');

  stop.call(ctx);
  virtual.advance(1000);
  t.equal(drives, 3, 'stopOwnerMembershipDriver clears the virtual interval');
  t.equal(virtual.pendingTimerCount(), 0, 'no virtual timers leak after stop');
});
