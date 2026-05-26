import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSnapshotOwner,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';

const TEST_TRIGGER_CODES = ['discovery_node_coverage_gap'];
const TEST_STALE_OPERATION_TRIGGER_CODES = [
  'cache_stale_watermark',
  'stale_replica_operations_in_flight',
];
const TEST_SNAPSHOT_REASON = 'control_snapshot';
const TEST_CAPTURED_AT = 1000;
const TEST_CAPTURED_AT_REPAIRED = 2000;
const TEST_FORCE_REPAIR_QUERY_TIMEOUT_MS = 3349;
const TEST_CAPTURED_AT_ISO = new Date(TEST_CAPTURED_AT).toISOString();
const TEST_CAPTURED_AT_REPAIRED_ISO =
  new Date(TEST_CAPTURED_AT_REPAIRED).toISOString();
const TEST_RESUME_TOKEN =
  'control-plane-revision:captured_at:1000';
const TEST_REPAIRED_RESUME_TOKEN =
  'control-plane-revision:captured_at:2000';
const TEST_REVISION_BEHIND_CODE = 'snapshot_revision_behind';

test('ControlPlaneSnapshotOwner returns stale-but-usable control snapshots while scheduling repair in the background',
  async (t) => {
    const controlSnapshot = {
      evaluateAuthoritativeControlSnapshotRepair() {
        return {
          shouldRepair: true,
          triggerCodes: TEST_TRIGGER_CODES,
        };
      },
      canRunAuthoritativeControlSnapshotRepair() {
        return true;
      },
    };
    const scheduledCalls = [];
    const serviceDiscovery = {
      buildAuthoritativeDiscoveryRepairScheduleDecision() {
        return {
          state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED,
          repair: null,
        };
      },
      scheduleAuthoritativeDiscoveryCacheRepair(options = {}) {
        scheduledCalls.push(options);
        return {
          state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED,
          repairPromise: Promise.resolve({
            applied: true,
          }),
        };
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery,
    });
    const localSnapshot = {
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT,
    };

    const result = await owner.resolveControlSnapshot(localSnapshot, {
      allowAuthoritativeRepair: true,
    });

    t.equal(
      scheduledCalls.length,
      1,
      'shared snapshot owner should enqueue one background repair attempt',
    );
    t.match(
      scheduledCalls[0],
      {
        reason: TEST_SNAPSHOT_REASON,
        triggerCodes: TEST_TRIGGER_CODES,
      },
      'shared snapshot owner should preserve the repair reason and triggers',
    );
    t.equal(
      result,
      localSnapshot,
      'shared snapshot owner should return the local snapshot without blocking on repair',
    );
    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        reasonCodes: TEST_TRIGGER_CODES,
        retryAfterMs: null,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED,
        revision: TEST_CAPTURED_AT,
        revisionSource: 'captured_at',
        revisionState: 'stale_usable',
        expectedMinimumRevision: null,
        revisionGap: 0,
        observedAt: TEST_CAPTURED_AT_ISO,
        observedAtMs: TEST_CAPTURED_AT,
        resumeToken: TEST_RESUME_TOKEN,
      },
      'shared snapshot owner should make the stale-but-usable observation explicit',
    );
  });

test('ControlPlaneSnapshotOwner returns deferred-refresh observations when repair is backing off',
  async (t) => {
    const controlSnapshot = {
      evaluateAuthoritativeControlSnapshotRepair() {
        return {
          shouldRepair: true,
          triggerCodes: TEST_TRIGGER_CODES,
        };
      },
      canRunAuthoritativeControlSnapshotRepair() {
        return true;
      },
    };
    const serviceDiscovery = {
      buildAuthoritativeDiscoveryRepairScheduleDecision() {
        return {
          state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
          repair: {
            retryAfterMs: 250,
          },
        };
      },
      scheduleAuthoritativeDiscoveryCacheRepair() {
        throw new Error('deferred repair should not schedule immediately');
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery,
    });
    const localSnapshot = {
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT,
    };

    const result = await owner.resolveControlSnapshot(localSnapshot, {
      allowAuthoritativeRepair: true,
    });

    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
        reasonCodes: TEST_TRIGGER_CODES,
        retryAfterMs: 250,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
        revision: TEST_CAPTURED_AT,
        revisionSource: 'captured_at',
        revisionState: 'stale_usable',
        expectedMinimumRevision: null,
        revisionGap: 0,
        observedAt: TEST_CAPTURED_AT_ISO,
        observedAtMs: TEST_CAPTURED_AT,
        resumeToken: TEST_RESUME_TOKEN,
      },
      'shared snapshot owner should surface bounded retry metadata for deferred repair',
    );
  });

test('ControlPlaneSnapshotOwner forced control snapshots still rebuild from authoritative repair',
  async (t) => {
    const rebuiltSnapshot = {
      nodeId: 'node-1',
      repaired: true,
      capturedAt: TEST_CAPTURED_AT_REPAIRED,
    };
    const controlSnapshot = {
      canRunAuthoritativeControlSnapshotRepair() {
        return true;
      },
      evaluateAuthoritativeControlSnapshotRepair(snapshot) {
        return snapshot === rebuiltSnapshot ?
          {
            shouldRepair: false,
            triggerCodes: [],
          } :
          {
            shouldRepair: true,
            triggerCodes: TEST_TRIGGER_CODES,
          };
      },
      async buildLocalControlSnapshot(options = {}) {
        t.same(
          options,
          {
            forceAuthoritativeRepair: true,
            queryTimeoutMs: TEST_FORCE_REPAIR_QUERY_TIMEOUT_MS,
            expectedMinimumRevision: null,
            expectedResumeToken: null,
            preferAuthoritativePublicationRead: true,
            reconcileAuthoritativeMembershipPublication: true,
          },
          'forced repair should rebuild from the authoritative publication view',
        );
        return rebuiltSnapshot;
      },
      attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
        snapshot.authoritativeRepair = {
          applied: options.repair?.applied === true,
          forced: options.forceAuthoritativeRepair === true,
        };
        return snapshot;
      },
    };
    const repairCalls = [];
    const serviceDiscovery = {
      async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
        repairCalls.push(options);
        return {
          applied: true,
        };
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery,
    });

    const result = await owner.resolveControlSnapshot(
      {
        nodeId: 'node-1',
      },
      {
        forceAuthoritativeRepair: true,
        queryTimeoutMs: TEST_FORCE_REPAIR_QUERY_TIMEOUT_MS,
      },
    );

    t.equal(
      repairCalls.length,
      1,
      'forced repair should still invoke the authoritative repair owner',
    );
    t.match(
      repairCalls[0],
      {
        reason: TEST_SNAPSHOT_REASON,
        bypassReuse: true,
        queryTimeoutMs: TEST_FORCE_REPAIR_QUERY_TIMEOUT_MS,
        triggerCodes: TEST_TRIGGER_CODES,
      },
      'forced repair should bypass reuse and preserve trigger codes',
    );
    t.same(
      result.authoritativeRepair,
      {
        applied: true,
        forced: true,
      },
      'forced repair should keep authoritative repair diagnostics on the rebuilt snapshot',
    );
    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        reasonCodes: TEST_TRIGGER_CODES,
        retryAfterMs: null,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
        revision: TEST_CAPTURED_AT_REPAIRED,
        revisionSource: 'captured_at',
        revisionState: 'current',
        expectedMinimumRevision: null,
        revisionGap: 0,
        observedAt: TEST_CAPTURED_AT_REPAIRED_ISO,
        observedAtMs: TEST_CAPTURED_AT_REPAIRED,
        resumeToken: TEST_REPAIRED_RESUME_TOKEN,
      },
      'forced repair should return a fresh observation after the rebuild',
    );
  });

test('ControlPlaneSnapshotOwner preserves revision metadata when the control snapshot owner handles forced repair directly',
  async (t) => {
    const rebuiltSnapshot = {
      nodeId: 'node-1',
      repaired: true,
      capturedAt: TEST_CAPTURED_AT_REPAIRED,
    };
    const controlSnapshot = {
      async forceAuthoritativeControlSnapshotRepair(options = {}, repairEvaluation) {
        t.same(
          options,
          {
            forceAuthoritativeRepair: true,
            expectedMinimumRevision: TEST_CAPTURED_AT,
            expectedResumeToken: null,
          },
          'direct forced repair should preserve the original caller options',
        );
        t.same(
          repairEvaluation,
          {
            shouldRepair: true,
            triggerCodes: TEST_TRIGGER_CODES,
          },
          'direct forced repair should receive the triggering evaluation',
        );
        return rebuiltSnapshot;
      },
      evaluateAuthoritativeControlSnapshotRepair(snapshot) {
        return snapshot === rebuiltSnapshot ?
          {
            shouldRepair: false,
            triggerCodes: [],
          } :
          {
            shouldRepair: true,
            triggerCodes: TEST_TRIGGER_CODES,
          };
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery: null,
    });

    const result = await owner.resolveControlSnapshot(
      {
        nodeId: 'node-1',
      },
      {
        forceAuthoritativeRepair: true,
        expectedMinimumRevision: TEST_CAPTURED_AT,
      },
    );

    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        reasonCodes: TEST_TRIGGER_CODES,
        retryAfterMs: null,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
        revision: TEST_CAPTURED_AT_REPAIRED,
        revisionSource: 'captured_at',
        revisionState: 'current',
        expectedMinimumRevision: TEST_CAPTURED_AT,
        revisionGap: 0,
        observedAt: TEST_CAPTURED_AT_REPAIRED_ISO,
        observedAtMs: TEST_CAPTURED_AT_REPAIRED,
        resumeToken: TEST_REPAIRED_RESUME_TOKEN,
      },
      'direct forced repair should still attach a fresh revisioned observation',
    );
    t.equal(
      result.snapshotRevision,
      TEST_CAPTURED_AT_REPAIRED,
      'root snapshot metadata should preserve the repaired revision',
    );
    t.equal(
      result.snapshotExpectedMinimumRevision,
      TEST_CAPTURED_AT,
      'root snapshot metadata should preserve the expected minimum revision',
    );
  });

test('ControlPlaneSnapshotOwner keeps applied control repairs pending when the repaired snapshot remains stale',
  async (t) => {
    const rebuiltSnapshot = {
      nodeId: 'node-1',
      repaired: true,
      capturedAt: TEST_CAPTURED_AT_REPAIRED,
    };
    const controlSnapshot = {
      evaluateAuthoritativeControlSnapshotRepair(snapshot) {
        return snapshot === rebuiltSnapshot ?
          {
            shouldRepair: true,
            triggerCodes: TEST_STALE_OPERATION_TRIGGER_CODES,
          } :
          {
            shouldRepair: true,
            triggerCodes: TEST_TRIGGER_CODES,
          };
      },
      canRunAuthoritativeControlSnapshotRepair() {
        return true;
      },
      async buildLocalControlSnapshot() {
        return rebuiltSnapshot;
      },
      attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
        snapshot.authoritativeRepair = {
          applied: options.repair?.applied === true,
          forced: options.forceAuthoritativeRepair === true,
        };
        return snapshot;
      },
    };
    const serviceDiscovery = {
      async ensureAuthoritativeDiscoveryCacheRepair() {
        return {
          applied: true,
        };
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery,
    });

    const result = await owner.resolveControlSnapshot(
      {
        nodeId: 'node-1',
      },
      {
        forceAuthoritativeRepair: true,
      },
    );

    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        reasonCodes: TEST_STALE_OPERATION_TRIGGER_CODES,
        retryAfterMs: null,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
        revision: TEST_CAPTURED_AT_REPAIRED,
        revisionSource: 'captured_at',
        revisionState: 'stale_usable',
        expectedMinimumRevision: null,
        revisionGap: 0,
        observedAt: TEST_CAPTURED_AT_REPAIRED_ISO,
        observedAtMs: TEST_CAPTURED_AT_REPAIRED,
        resumeToken: TEST_REPAIRED_RESUME_TOKEN,
      },
      'applied repair should not publish a ready observation when the repaired view is still stale',
    );
  });

test('ControlPlaneSnapshotOwner exposes an explicit behind-revision state when callers require a newer snapshot',
  async (t) => {
    const controlSnapshot = {
      evaluateAuthoritativeControlSnapshotRepair() {
        return {
          shouldRepair: false,
          triggerCodes: TEST_TRIGGER_CODES,
        };
      },
    };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery: null,
    });

    const result = await owner.resolveControlSnapshot(
      {
        nodeId: 'node-1',
        capturedAt: TEST_CAPTURED_AT,
      },
      {
        expectedMinimumRevision: TEST_CAPTURED_AT_REPAIRED,
      },
    );

    t.same(
      result.snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        reasonCodes: [...TEST_TRIGGER_CODES, TEST_REVISION_BEHIND_CODE],
        retryAfterMs: null,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
        revision: TEST_CAPTURED_AT,
        revisionSource: 'captured_at',
        revisionState: 'behind',
        expectedMinimumRevision: TEST_CAPTURED_AT_REPAIRED,
        revisionGap: TEST_CAPTURED_AT_REPAIRED - TEST_CAPTURED_AT,
        observedAt: TEST_CAPTURED_AT_ISO,
        observedAtMs: TEST_CAPTURED_AT,
        resumeToken: TEST_RESUME_TOKEN,
      },
      'shared snapshot owner should surface behind-revision metadata explicitly instead of collapsing it to absence',
    );
  });

test('ControlPlaneSnapshotOwner carries the last observed revision forward when callers omit expected resume state',
  async (t) => {
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot: {
        evaluateAuthoritativeControlSnapshotRepair() {
          return {
            shouldRepair: false,
            triggerCodes: TEST_TRIGGER_CODES,
          };
        },
      },
      serviceDiscovery: {
        evaluateAuthoritativeDiscoveryRepair() {
          return {
            shouldRepair: false,
            triggerCodes: TEST_TRIGGER_CODES,
          };
        },
      },
    });

    const firstControlSnapshot = await owner.resolveControlSnapshot({
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT_REPAIRED,
    });
    const regressedControlSnapshot = await owner.resolveControlSnapshot({
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT,
    });
    const firstDiscoverySnapshot = await owner.resolveServiceDiscoverySnapshot({
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT_REPAIRED,
    });
    const regressedDiscoverySnapshot = await owner.resolveServiceDiscoverySnapshot({
      nodeId: 'node-1',
      capturedAt: TEST_CAPTURED_AT,
    });

    t.equal(
      firstControlSnapshot.snapshotObservation.expectedMinimumRevision,
      null,
      'the first control snapshot should not invent an expectation',
    );
    t.equal(
      regressedControlSnapshot.snapshotObservation.expectedMinimumRevision,
      TEST_CAPTURED_AT_REPAIRED,
      'later control snapshots should inherit the last observed revision floor',
    );
    t.equal(
      regressedControlSnapshot.snapshotObservation.revisionState,
      'behind',
      'control snapshot regressions should become explicit behind observations',
    );
    t.equal(
      regressedControlSnapshot.snapshotObservation.revisionGap,
      TEST_CAPTURED_AT_REPAIRED - TEST_CAPTURED_AT,
      'control snapshot regressions should retain the explicit revision gap',
    );
    t.equal(
      firstDiscoverySnapshot.snapshotObservation.expectedMinimumRevision,
      null,
      'the first service-discovery snapshot should not invent an expectation',
    );
    t.equal(
      regressedDiscoverySnapshot.snapshotObservation.expectedMinimumRevision,
      TEST_CAPTURED_AT_REPAIRED,
      'later service-discovery snapshots should inherit the last observed revision floor independently',
    );
    t.equal(
      regressedDiscoverySnapshot.snapshotObservation.revisionState,
      'behind',
      'service-discovery regressions should become explicit behind observations',
    );
    t.equal(
      regressedDiscoverySnapshot.snapshotObservation.resumeToken,
      TEST_RESUME_TOKEN,
      'regressed observations should still publish their own local resume token',
    );
  });
