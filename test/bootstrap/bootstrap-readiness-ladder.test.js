import {test} from '../../src/test-helpers/tap.js';
import {
  BOOTSTRAP_READINESS_STAGE,
  buildBootstrapReadinessStage,
} from '../../src/bootstrap/bootstrap-readiness-ladder.js';

test('buildBootstrapReadinessStage - reports published while publication is still ack pending',
  (t) => {
    const result = buildBootstrapReadinessStage({
      publishedControlPlaneEpoch: 12,
      publishedControlPlaneStatus: 'ACK_PENDING',
      publishedControlPlanePendingAckCount: 1,
    });

    t.equal(
      result.stage,
      BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_PUBLISHED,
      'ack-pending publication should remain at the published stage',
    );
    t.equal(result.stageRank, 2, 'published stage should carry the canonical rank');
    t.end();
  });

test('buildBootstrapReadinessStage - reports acked after publication closure before recovery-safe',
  (t) => {
    const result = buildBootstrapReadinessStage({
      publishedControlPlaneEpoch: 12,
      publishedControlPlaneStatus: 'PUBLISHED',
      publishedControlPlanePendingAckCount: 0,
    });

    t.equal(
      result.stage,
      BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_ACKED,
      'published control-plane metadata with zero pending acks should advance to acked',
    );
    t.equal(result.stageRank, 3, 'acked stage should carry the canonical rank');
    t.end();
  });

test('buildBootstrapReadinessStage - reports recovery safe before traffic ready',
  (t) => {
    const result = buildBootstrapReadinessStage({
      controlPlaneRecoveryReady: true,
      publishedControlPlaneEpoch: 12,
      publishedControlPlaneStatus: 'PUBLISHED',
      publishedControlPlanePendingAckCount: 0,
    });

    t.equal(
      result.stage,
      BOOTSTRAP_READINESS_STAGE.RECOVERY_SAFE,
      'control-plane recovery readiness should advance beyond acknowledgement',
    );
    t.equal(result.stageRank, 4, 'recovery-safe stage should carry the canonical rank');
    t.end();
  });

test('buildBootstrapReadinessStage - reports traffic ready as the final stage',
  (t) => {
    const result = buildBootstrapReadinessStage({
      ready: true,
      controlPlaneRecoveryReady: true,
      publishedControlPlaneEpoch: 12,
      publishedControlPlaneStatus: 'PUBLISHED',
      publishedControlPlanePendingAckCount: 0,
    });

    t.equal(
      result.stage,
      BOOTSTRAP_READINESS_STAGE.TRAFFIC_READY,
      'ready=true should always resolve to the final traffic-ready stage',
    );
    t.equal(result.stageRank, 5, 'traffic-ready stage should carry the canonical rank');
    t.end();
  });
