import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
} from '../../src/bootstrap/startup-recovery-coordinator.js';

describe('StartupRecoveryCoordinator', () => {
  it('opens priority control-plane recovery once metadata publication is open', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'JOIN_READY',
            reasons: ['READINESS_STABLE_WINDOW_PENDING'],
            stableElapsedMs: 2000,
            stableWindowMs: 5000,
          };
        },
      },
      now: () => 1234,
    });

    const result = coordinator.evaluate({
      partitionId: 'replica_operations-p1',
    });

    assert.equal(result.trafficReady, false);
    assert.equal(result.metadataPublicationReady, true);
    assert.equal(result.backgroundWorkReady, true);
    assert.equal(result.controlPlaneRecoveryReady, true);
    assert.equal(result.priorityControlPlaneRecoveryReady, true);
    assert.equal(
      result.recoveryStage,
      STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY,
    );
    assert.equal(result.recoveryStageRank, 3);
    assert.equal(
      result.shouldBypassLocalPriorityControlPlaneStartupReadiness,
      true,
    );
  });

  it('keeps priority control-plane bypass open while traffic is gated by priority recovery', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'CONTROL_READY',
            reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
          };
        },
      },
      now: () => 4321,
    });

    const result = coordinator.evaluate({
      partitionId: 'control_plane_publications-p1',
    });

    assert.equal(result.trafficReady, false);
    assert.equal(result.metadataPublicationReady, true);
    assert.equal(result.backgroundWorkReady, true);
    assert.equal(result.controlPlaneRecoveryReady, true);
    assert.equal(result.priorityControlPlaneRecoveryReady, true);
    assert.equal(
      result.shouldBypassLocalPriorityControlPlaneStartupReadiness,
      true,
    );
  });

  it('treats split child priority partitions as priority recovery entities', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'JOIN_READY',
            reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          };
        },
      },
    });

    const result = coordinator.evaluate({
      partitionId: 'replica_operations_p_deadbeef_left',
    });

    assert.equal(result.priorityControlPlaneRecoveryReady, true);
    assert.equal(result.backgroundWorkReady, true);
    assert.equal(
      result.shouldBypassLocalPriorityControlPlaneStartupReadiness,
      true,
    );
  });

  it('keeps non-priority background work blocked until traffic ready', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'JOIN_READY',
            reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          };
        },
      },
    });

    const result = coordinator.evaluate({
      partitionId: 'user-table-p7',
    });

    assert.equal(result.metadataPublicationReady, true);
    assert.equal(result.backgroundWorkReady, false);
    assert.equal(result.priorityControlPlaneRecoveryReady, false);
    assert.equal(
      result.recoveryStage,
      STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY,
    );
    assert.equal(result.recoveryBlocked, false);
    assert.equal(
      result.shouldBypassLocalPriorityControlPlaneStartupReadiness,
      false,
    );
  });

  it('marks blocked startup when lifecycle metadata publication is not open', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'INIT',
            reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
          };
        },
      },
    });

    const result = coordinator.evaluate({
      partitionId: 'replica_operations-p1',
    });

    assert.equal(result.controlPlaneRecoveryReady, false);
    assert.equal(result.backgroundWorkReady, false);
    assert.equal(result.recoveryStage, STARTUP_RECOVERY_STAGE.BLOCKED);
    assert.equal(result.recoveryBlocked, true);
  });

  it('propagates shared recovery protocol details into startup recovery diagnostics', () => {
    const coordinator = new StartupRecoveryCoordinator({
      readinessState: {
        evaluate() {
          return {
            ready: false,
            phase: 'CONTROL_READY',
            reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
          };
        },
      },
    });

    const result = coordinator.evaluate({
      partitionId: 'replica_operations-p1',
      priorityRecoveryHealth: {
        healthy: false,
        details: {
          recoveryProtocolState: 'publication_pending',
          priorityRecoveryReasonCodes: [
            'publication_epoch_pending',
            'priority_partitions_not_spread',
          ],
          targetParticipation: {
            nodeId: 'seed-1',
            state: 'published_active',
            publishedActive: true,
            recoveryActive: true,
          },
        },
      },
    });

    assert.equal(result.recoveryProtocolState, 'publication_pending');
    assert.deepEqual(result.priorityRecoveryReasonCodes, [
      'publication_epoch_pending',
      'priority_partitions_not_spread',
    ]);
    assert.deepEqual(result.targetParticipation, {
      nodeId: 'seed-1',
      state: 'published_active',
      recoverySource: null,
      durable: false,
      publishedActive: true,
      recoveryActive: true,
      projectedServing: false,
      locallyEligible: false,
      suspectedOrTransitioning: false,
      reasons: [],
    });
    assert.deepEqual(result.startupAuthorityFailure, {
      state: 'none',
    });
    assert.deepEqual(result.startupAuthorityPublication, {
      observationState: 'observation_unavailable',
    });
  });
});
