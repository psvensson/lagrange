// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  getTrafficReadinessSnapshot,
  isBackgroundWorkReady,
  isMetadataPublicationReady,
  isTrafficReady,
  waitForMetadataPublicationReadiness,
} from '../../src/bootstrap/traffic-readiness-utils.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

function createReadinessState(snapshot) {
  return {
    evaluate() {
      return snapshot;
    },
    getSnapshot() {
      return snapshot;
    },
  };
}

test('traffic-readiness-utils - resolves readiness snapshots from owner state', async (t) => {
  const snapshot = {
    ready: false,
    phase: LIFECYCLE_PHASE.CONTROL_READY,
    reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
  };
  const readinessState = createReadinessState(snapshot);

  t.same(
    getTrafficReadinessSnapshot(readinessState),
    snapshot,
    'utility should resolve the current lifecycle snapshot from owner state',
  );
});

test('traffic-readiness-utils - metadata publication opens for control-ready leader lag',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.CONTROL_READY,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
    });

    t.equal(
      isMetadataPublicationReady(readinessState),
      true,
      'metadata publication should open when only leader metadata remains incomplete',
    );
    t.equal(
      isTrafficReady(readinessState),
      false,
      'strict traffic readiness should remain blocked while lifecycle is control-ready',
    );
  });

test('traffic-readiness-utils - metadata publication stays open during priority control-plane recovery pending',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.CONTROL_READY,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    t.equal(
      isMetadataPublicationReady(readinessState),
      true,
      'metadata publication should stay open while only priority recovery remains pending',
    );
    t.equal(
      isBackgroundWorkReady(readinessState, {
        partitionId:
          INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      }),
      true,
      'priority control-plane partitions should continue background recovery work while traffic is gated',
    );
  });

test('traffic-readiness-utils - metadata publication stays open for degraded tolerated blockers',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.DEGRADED,
      reasons: [
        LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
    });

    t.equal(
      isMetadataPublicationReady(readinessState),
      true,
      'metadata publication should remain open for degraded snapshots ' +
        'containing only tolerated recovery blockers',
    );
  });

test('traffic-readiness-utils - metadata publication wait resolves immediately for control-ready leader lag',
  async (t) => {
    let slept = false;
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.CONTROL_READY,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      retryAfterMs: 50,
    });

    const snapshot = await waitForMetadataPublicationReadiness({
      readinessState,
      sleep: async () => {
        slept = true;
      },
    });

    t.equal(
      snapshot?.phase,
      LIFECYCLE_PHASE.CONTROL_READY,
      'metadata publication wait should accept control-ready leader lag',
    );
    t.equal(
      slept,
      false,
      'metadata publication wait should not sleep when publication is already allowed',
    );
  });

test('traffic-readiness-utils - metadata publication opens for join-ready stable window',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.JOIN_READY,
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    });

    t.equal(
      isMetadataPublicationReady(readinessState),
      true,
      'metadata publication should stay open during the stable-window wait',
    );
  });

test('traffic-readiness-utils - priority control-plane background work opens for metadata publication readiness',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.JOIN_READY,
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    });

    t.equal(
      isBackgroundWorkReady(readinessState, {
        partitionId:
          INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      }),
      true,
      'priority control-plane background work should open once metadata publication is allowed',
    );
    t.equal(
      isBackgroundWorkReady(readinessState, {
        partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      }),
      false,
      'non-priority system partitions should still wait for full traffic readiness',
    );
  });

test('traffic-readiness-utils - split child priority partitions inherit metadata-publication bypass',
  async (t) => {
    const readinessState = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.JOIN_READY,
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    });

    t.equal(
      isBackgroundWorkReady(readinessState, {
        partitionId: 'replica_operations_p_deadbeef_left',
      }),
      true,
      'split child priority partitions should keep the metadata-publication bypass open',
    );
  });

test('traffic-readiness-utils - metadata publication stays blocked for hard runtime blockers',
  async (t) => {
    const bootstrapIncomplete = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.INIT,
      reasons: [LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
    });
    const runtimeBlocked = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.CONTROL_READY,
      reasons: [LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE],
    });
    const mixedRuntimeBlocked = createReadinessState({
      ready: false,
      phase: LIFECYCLE_PHASE.CONTROL_READY,
      reasons: [
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE,
      ],
    });

    t.equal(
      isMetadataPublicationReady(bootstrapIncomplete),
      false,
      'metadata publication must stay blocked before bootstrap dependencies are ready',
    );
    t.equal(
      isMetadataPublicationReady(runtimeBlocked),
      false,
      'metadata publication must stay blocked on non-leader hard blockers',
    );
    t.equal(
      isMetadataPublicationReady(mixedRuntimeBlocked),
      false,
      'metadata publication must stay blocked when priority recovery pending is mixed with hard runtime blockers',
    );
  });
