import {test} from '../../src/test-helpers/tap.js';
import {
  getTrafficReadinessSnapshot,
  isMetadataPublicationReady,
  isTrafficReady,
} from '../../src/bootstrap/traffic-readiness-utils.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';

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
  });
