import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

function buildSnapshot() {
  return new AdminControlSnapshot({nodeId: 'node-a'});
}

const REAL_SNAPSHOT = {origin: 'authoritative'};
const CACHE_SNAPSHOT = {origin: 'cache-only'};

test('buildControlSnapshotQueryResult returns the authoritative snapshot when it resolves within budget',
  async (t) => {
    const snapshot = buildSnapshot();
    let boundedFallbackCalls = 0;
    snapshot.resolveLocalControlSnapshot = async () => REAL_SNAPSHOT;
    snapshot.buildLocalControlSnapshot = async () => {
      boundedFallbackCalls += 1;
      return CACHE_SNAPSHOT;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 6000,
    });

    t.equal(result.success, true, 'query result reports success');
    t.same(result.rows, [REAL_SNAPSHOT],
      'the resolved authoritative snapshot is returned when it wins the race');
    t.equal(boundedFallbackCalls, 0,
      'the cache-only fallback is not used when the lane resolves in time');
  });

test('buildControlSnapshotQueryResult degrades to a bounded cache-only snapshot when the lane stalls',
  async (t) => {
    const snapshot = buildSnapshot();
    let boundedFallbackOptions = null;
    snapshot.resolveLocalControlSnapshot = () =>
      new Promise(() => {});
    snapshot.buildLocalControlSnapshot = async (options) => {
      boundedFallbackOptions = options;
      return CACHE_SNAPSHOT;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 5000,
    });

    t.same(result.rows, [CACHE_SNAPSHOT],
      'a stalled authoritative lane degrades to the cache-only snapshot');
    t.ok(boundedFallbackOptions,
      'the cache-only fallback path is taken on deadline expiry');
    t.equal(boundedFallbackOptions.boundedObservationProbe, true,
      'the fallback forces the bounded, side-effect-free observation probe');
  });

test('buildControlSnapshotQueryResult arms the bounded fallback for short snapshot budgets',
  async (t) => {
    const snapshot = buildSnapshot();
    let boundedFallbackOptions = null;
    snapshot.resolveLocalControlSnapshot = () =>
      new Promise(() => {});
    snapshot.buildLocalControlSnapshot = async (options) => {
      boundedFallbackOptions = options;
      return CACHE_SNAPSHOT;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 6,
    });

    t.same(result.rows, [CACHE_SNAPSHOT],
      'a stalled short-budget snapshot lane returns the bounded snapshot');
    t.ok(boundedFallbackOptions,
      'the bounded fallback is still armed below the normal minimum deadline');
    t.equal(boundedFallbackOptions.boundedObservationProbe, true,
      'the short-budget fallback uses the bounded observation probe');
  });

test('a stalled lane drives the membership-publication reconcile through the bounded enqueue path',
  async (t) => {
    const snapshot = buildSnapshot();
    let reconcileSnapshot = null;
    let reconcileOptions = null;
    snapshot.resolveLocalControlSnapshot = () =>
      new Promise(() => {});
    snapshot.buildLocalControlSnapshot = async () => CACHE_SNAPSHOT;
    snapshot.triggerMembershipPublicationHandoffOwnerCommand = async (
      candidate,
      options,
    ) => {
      reconcileSnapshot = candidate;
      reconcileOptions = options;
      return candidate;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 5000,
    });

    t.same(result.rows, [CACHE_SNAPSHOT],
      'the bounded cache-only snapshot is still returned');
    t.equal(reconcileSnapshot, CACHE_SNAPSHOT,
      'the bounded snapshot is handed to the owner reconcile command');
    t.ok(reconcileOptions,
      'the owner reconcile command is scheduled on deadline expiry');
    t.equal(reconcileOptions.deferInlineOwnerCommand, true,
      'the reconcile is routed through the non-blocking enqueue fallback');
  });

test('the bounded reconcile is not scheduled when the authoritative lane wins the race',
  async (t) => {
    const snapshot = buildSnapshot();
    let reconcileCalls = 0;
    snapshot.resolveLocalControlSnapshot = async () => REAL_SNAPSHOT;
    snapshot.buildLocalControlSnapshot = async () => CACHE_SNAPSHOT;
    snapshot.triggerMembershipPublicationHandoffOwnerCommand = async (
      candidate,
    ) => {
      reconcileCalls += 1;
      return candidate;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 6000,
    });

    t.same(result.rows, [REAL_SNAPSHOT],
      'the authoritative snapshot is returned when it wins the race');
    t.equal(reconcileCalls, 0,
      'no bounded reconcile is scheduled when the full resolve already ran it');
  });

test('the bounded reconcile is skipped when the owner-command method is unavailable',
  async (t) => {
    const snapshot = buildSnapshot();
    snapshot.resolveLocalControlSnapshot = () =>
      new Promise(() => {});
    snapshot.buildLocalControlSnapshot = async () => CACHE_SNAPSHOT;
    snapshot.triggerMembershipPublicationHandoffOwnerCommand = null;

    const result = await snapshot.buildControlSnapshotQueryResult({
      queryTimeoutMs: 5000,
    });

    t.same(result.rows, [CACHE_SNAPSHOT],
      'the bounded snapshot is returned without the owner-command method');
  });

test('buildControlSnapshotQueryResult skips the deadline race when no query budget is supplied',
  async (t) => {
    const snapshot = buildSnapshot();
    let boundedFallbackCalls = 0;
    let resolveCalls = 0;
    snapshot.resolveLocalControlSnapshot = async () => {
      resolveCalls += 1;
      return REAL_SNAPSHOT;
    };
    snapshot.buildLocalControlSnapshot = async () => {
      boundedFallbackCalls += 1;
      return CACHE_SNAPSHOT;
    };

    const result = await snapshot.buildControlSnapshotQueryResult({});

    t.same(result.rows, [REAL_SNAPSHOT],
      'the authoritative snapshot is returned when no deadline applies');
    t.equal(resolveCalls, 1, 'the authoritative resolver is consulted directly');
    t.equal(boundedFallbackCalls, 0,
      'no bounded fallback is armed without a query budget');
  });
