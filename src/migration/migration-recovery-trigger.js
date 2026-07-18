import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';

const LOCAL_STR_FUNCTION = 'function';

const MIGRATION_RECOVERY_REASON = Object.freeze({
  NODE_RESTART: 'node_restart',
  LEADER_ELECTED: 'leader_elected',
});

const MIGRATION_RECOVERY_LOG_MSG = Object.freeze({
  SKIPPED: 'Schema migration recovery skipped: migration coordinator unavailable',
  START: 'Starting schema migration recovery',
  COMPLETE: 'Schema migration recovery completed',
  FAILED: 'Schema migration recovery failed',
});

const MIGRATION_RECOVERY_DEFAULT = Object.freeze({
  LEADER_ELECTION_COOLDOWN_MS: 1000,
});

async function recoverMigrationsForReason(sqlQueryEngine, logger, reason) {
  const migrationCoordinator = sqlQueryEngine?.migrationCoordinator || null;
  if (!migrationCoordinator ||
      typeof migrationCoordinator.recoverMigrations !== LOCAL_STR_FUNCTION) {
    logger.debug(MIGRATION_RECOVERY_LOG_MSG.SKIPPED, {reason});
    return;
  }
  logger.info(MIGRATION_RECOVERY_LOG_MSG.START, {reason});
  try {
    const recoveryResult = await migrationCoordinator.recoverMigrations();
    logger.info(MIGRATION_RECOVERY_LOG_MSG.COMPLETE, {
      reason,
      recoveredCount: recoveryResult?.recovered || 0,
    });
  } catch (error) {
    logger.error(MIGRATION_RECOVERY_LOG_MSG.FAILED, {
      reason,
      error: error.message,
    });
  }
}

function wireMigrationRecoveryOnLeaderElection(options = {}) {
  const sqlQueryEngine = options.sqlQueryEngine || null;
  const partitionServices = options.partitionServices || null;
  const logger = options.logger || console;
  const now = typeof options.now === 'function' ?
    options.now :
    () => Date.now();
  const leaderElectionCooldownMs =
    Number.isFinite(options.leaderElectionCooldownMs) &&
    options.leaderElectionCooldownMs >= 0 ?
      Math.floor(options.leaderElectionCooldownMs) :
      MIGRATION_RECOVERY_DEFAULT.LEADER_ELECTION_COOLDOWN_MS;
  if (!sqlQueryEngine ||
      !partitionServices ||
      typeof partitionServices.values !== LOCAL_STR_FUNCTION) {
    return () => {};
  }

  let pressureGovernor = options.pressureGovernor || null;
  const getPressureGovernor = () => {
    if (pressureGovernor) {
      pressureGovernor.configure?.({
        messageRouter: sqlQueryEngine?.messageRouter || null,
      });
      return pressureGovernor;
    }
    pressureGovernor = PressureGovernor.getShared({
      nodeId: sqlQueryEngine?.nodeId || null,
      messageRouter: sqlQueryEngine?.messageRouter || null,
    });
    return pressureGovernor;
  };

  let recoveryInFlight = null;
  let recoveryTimer = null;
  let scheduledDueAtMs = null;
  let pendingLeaderElectionRecovery = false;
  let lastRecoveryCompletedAtMs = null;

  const clearScheduledRecovery = () => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
    scheduledDueAtMs = null;
  };

  const startRecovery = (reason) => {
    if (recoveryInFlight) {
      pendingLeaderElectionRecovery = true;
      return recoveryInFlight;
    }
    recoveryInFlight = recoverMigrationsForReason(
      sqlQueryEngine,
      logger,
      reason,
    ).finally(() => {
      lastRecoveryCompletedAtMs = now();
      recoveryInFlight = null;
      if (pendingLeaderElectionRecovery) {
        void scheduleLeaderElectionRecovery();
      }
    });
    return recoveryInFlight;
  };

  const scheduleLeaderElectionRecovery = () => {
    pendingLeaderElectionRecovery = true;
    if (recoveryInFlight) {
      return recoveryInFlight;
    }

    const elapsedSinceLastRecoveryMs =
      Number.isFinite(lastRecoveryCompletedAtMs) ?
        Math.max(0, now() - lastRecoveryCompletedAtMs) :
        null;
    const cooldownDelayMs =
      Number.isFinite(elapsedSinceLastRecoveryMs) &&
      elapsedSinceLastRecoveryMs < leaderElectionCooldownMs ?
        leaderElectionCooldownMs - elapsedSinceLastRecoveryMs :
        0;
    const pressureDecision = getPressureGovernor().evaluate({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        'migration:recovery',
        'control-plane:write',
      ],
    });
    const pressureDelayMs =
      pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
        pressureDecision.retryAfterMs :
        0;
    const delayMs = Math.max(cooldownDelayMs, pressureDelayMs);
    const dueAtMs = now() + delayMs;
    if (recoveryTimer &&
        Number.isFinite(scheduledDueAtMs) &&
        scheduledDueAtMs <= dueAtMs) {
      return null;
    }

    clearScheduledRecovery();
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      scheduledDueAtMs = null;
      if (!pendingLeaderElectionRecovery) {
        return;
      }
      pendingLeaderElectionRecovery = false;
      void startRecovery(MIGRATION_RECOVERY_REASON.LEADER_ELECTED);
    }, delayMs);
    recoveryTimer.unref?.();
    scheduledDueAtMs = dueAtMs;
    return null;
  };

  const triggerRecovery = (reason) => {
    if (reason === MIGRATION_RECOVERY_REASON.LEADER_ELECTED) {
      return scheduleLeaderElectionRecovery();
    }
    return startRecovery(reason);
  };

  const handlers = [];
  for (const partitionService of partitionServices.values()) {
    if (!partitionService || typeof partitionService.on !== LOCAL_STR_FUNCTION) {
      continue;
    }
    const handler = () => {
      void triggerRecovery(MIGRATION_RECOVERY_REASON.LEADER_ELECTED);
    };
    partitionService.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, handler);
    handlers.push({
      partitionService,
      handler,
    });
  }

  void triggerRecovery(MIGRATION_RECOVERY_REASON.NODE_RESTART);

  return () => {
    clearScheduledRecovery();
    pendingLeaderElectionRecovery = false;
    for (const entry of handlers) {
      if (typeof entry.partitionService?.off === LOCAL_STR_FUNCTION) {
        entry.partitionService.off(
          PARTITION_SERVICE_EVENT.LEADER_ELECTED,
          entry.handler,
        );
      } else if (typeof entry.partitionService?.removeListener === LOCAL_STR_FUNCTION) {
        entry.partitionService.removeListener(
          PARTITION_SERVICE_EVENT.LEADER_ELECTED,
          entry.handler,
        );
      }
    }
  };
}

export {
  MIGRATION_RECOVERY_DEFAULT,
  MIGRATION_RECOVERY_LOG_MSG,
  MIGRATION_RECOVERY_REASON,
  recoverMigrationsForReason,
  wireMigrationRecoveryOnLeaderElection,
};
